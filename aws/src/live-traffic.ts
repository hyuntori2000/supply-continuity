import {bestRecoveryIds} from '../../lib/recovery-priority';
import {z} from 'zod';
import {eligibleOffers,eligibleTransfers,impactFor,planIncident,planConditions,liveRouteKey,type Catalog,type Conditions,type LiveRouting} from './incident-engine';

export const trafficChoice=z.object({candidateId:z.enum(['start-time','start-cost','wait-30']),reasonCode:z.enum(['earlier_delivery','lower_cost','balanced_tradeoff'])}).strict();
export function departureAt(start:string,wait:number,preparation:number){return new Date(Date.parse(start)+(wait+preparation)*60000).toISOString();}
export function parseRouteMatrix(raw:unknown,destinations:{id:number}[]){
 if(!Array.isArray(raw)||raw.length!==destinations.length)throw new Error('Google returned an incomplete route matrix; comparison was not calculated');
 const result:Record<number,{distanceKm:number;drivingMinutes:number;staticMinutes:number}>={},seen=new Set<number>();
 for(const row of raw){if(!row||typeof row!=='object')throw new Error('Google returned an invalid route element');const i=row.destinationIndex??0;
  if((row.originIndex??0)!==0||!Number.isInteger(i)||i<0||i>=destinations.length||seen.has(i))throw new Error('Google returned invalid route indices');seen.add(i);
  if(row.status?.code&&row.status.code!==0)throw new Error('A Google route lookup failed; comparison was not calculated');
  if(row.condition==='ROUTE_NOT_FOUND')continue;
  if(row.condition!=='ROUTE_EXISTS'||row.fallbackInfo)throw new Error('Traffic-aware routing was unavailable; static fallback is not presented as live traffic');
  const seconds=(x:unknown)=>typeof x==='string'&&/^\d+(\.\d+)?s$/.test(x)?Number(x.slice(0,-1)):NaN;
  const driving=seconds(row.duration),staticTime=seconds(row.staticDuration);
  if(!Number.isFinite(driving)||driving<=0||!Number.isFinite(staticTime)||staticTime<=0||!Number.isFinite(row.distanceMeters)||row.distanceMeters<=0)throw new Error('Google returned invalid distance or duration');
  result[destinations[i].id]={distanceKm:row.distanceMeters/1000,drivingMinutes:driving/60,staticMinutes:staticTime/60};
 }
 return result;
}
export async function compareTraffic(c:Catalog,lotId:number,base:Conditions,start:string,requestFetch:typeof fetch=fetch){
 const key=process.env.GOOGLE_ROUTES_API_KEY;if(!key)throw new Error('Google Routes API is not configured on the server');
 const time=Date.parse(start),current=Date.now();if(!Number.isFinite(time)||time<current||time>current+7*86400000)throw new Error('Choose a future recovery start within seven days. Past driving traffic cannot be queried.');
 const conditions=planConditions.parse({...base,trafficMultiplier:1,regionalTraffic:[],assumptions:[],unappliedRequests:[]});
 const impact=impactFor(c,lotId);
 const sources=[...eligibleOffers(c,lotId,conditions,start).filter(o=>o.eligible).map(o=>({type:'supplier',id:o.farm_id,name:o.farm.name,city:o.farm.city,lat:o.farm.latitude,lng:o.farm.longitude,preparation:o.processing_lead_hours*60,targets:impact.targets})),...eligibleTransfers(c,lotId,conditions,start).map(d=>({type:'store',id:d.sourceStoreId,name:d.store.name,city:d.store.city,lat:d.store.latitude,lng:d.store.longitude,preparation:20,targets:impact.targets.filter(t=>t.chain===d.store.chain&&t.id!==d.sourceStoreId)}))];
 // Each physical source must have one preparation duration for this product.
 for(const s of sources)if(sources.some(other=>other.type===s.type&&other.id===s.id&&other.preparation!==s.preparation))throw new Error('Multiple preparation durations at one source require separate dispatch modeling');
 // Multiple donor lots share one physical route request.
 const unique=[...new Map(sources.map(s=>[s.type+':'+s.id,s])).values()].filter(s=>s.targets.length);
 const elements=unique.reduce((n,s)=>n+s.targets.length,0)*2;
 if(!elements)throw new Error('No eligible supply sources are available for this incident');
 if(elements>500)throw new Error('This comparison exceeds the 500 route-element limit; narrow the eligible sources first');
 const tasks=unique.flatMap(s=>[0,30].map(wait=>({s,wait}))),routesByWait:Record<number,Record<string,any>>={0:{},30:{}};
 let next=0;const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
 try{await Promise.all(Array.from({length:Math.min(8,tasks.length)},async()=>{while(next<tasks.length){const {s,wait}=tasks[next++];
  const depart=departureAt(start,wait,s.preparation);
  const r=await requestFetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'originIndex,destinationIndex,status,condition,distanceMeters,duration,staticDuration,fallbackInfo'},signal:abort.signal,body:JSON.stringify({origins:[{waypoint:{location:{latLng:{latitude:s.lat,longitude:s.lng}}}}],destinations:s.targets.map(t=>({waypoint:{location:{latLng:{latitude:t.latitude,longitude:t.longitude}}}})),travelMode:'DRIVE',routingPreference:'TRAFFIC_AWARE_OPTIMAL',departureTime:depart})});
  if(!r.ok)throw new Error(`Google Routes request failed (${r.status}); check API enablement, billing and server-key restrictions`);
  const matrix=parseRouteMatrix(await r.json(),s.targets);
  for(const t of s.targets){const route=matrix[t.id];if(route)routesByWait[wait][liveRouteKey(s.type,s.id,t.id)]={...route,departureAt:depart};}
 }}));}catch(e){abort.abort();if(abort.signal.reason?.name==='AbortError'&&(e as Error).name==='AbortError')throw new Error('Traffic lookup timed out; retry with a new future start time');throw e;}finally{clearTimeout(timer);}
 const candidates=([{id:'start-time',title:'Start at selected time · minimize travel time',wait:0,objective:'time'},{id:'start-cost',title:'Start at selected time · minimize modeled cost',wait:0,objective:'cost'},{id:'wait-30',title:'Start 30 minutes later · minimize travel time',wait:30,objective:'time'}] as const).map(option=>{
  const live:LiveRouting={routes:routesByWait[option.wait],waitMinutes:option.wait,planningStartAt:start};
  const p=planIncident(c,lotId,{...conditions,objective:option.objective},start,live);
  const legs=p.allocations.map(a=>{const r=routesByWait[option.wait][liveRouteKey(a.sourceType,a.sourceStoreId||a.supplierId!,a.storeId)];return {...a,departureAt:r.departureAt,arrivalAt:new Date(Date.parse(r.departureAt)+r.drivingMinutes*60000).toISOString(),drivingMinutes:r.drivingMinutes,staticMinutes:r.staticMinutes};});
  return {id:option.id,title:option.title,waitMinutes:option.wait,objective:option.objective,metrics:{requiredUnits:p.requiredUnits,allocatedUnits:p.allocatedUnits,coverage:p.coverage,unfilledUnits:p.unfilledUnits,cost:p.cost,averageDeliveryMinutes:p.allocatedUnits?Math.round(p.allocations.reduce((n,a)=>n+a.units*a.etaMinutes,0)/p.allocatedUnits*10)/10:null,lastDeliveryMinutes:p.lastDeliveryMinutes,priorityRequired:p.prioritySummary.requiredUnits,priorityAllocated:p.prioritySummary.allocatedUnits},lastArrivalAt:p.lastDeliveryMinutes===null?null:new Date(time+p.lastDeliveryMinutes*60000).toISOString(),legs};
 });
 return {provider:'Google Maps',retrievedAt:new Date().toISOString(),planningStartAt:start,routeElements:elements,candidates,conditions,manualTrafficReplaced:base.trafficMultiplier!==1||!!base.regionalTraffic?.length,limitations:['Traffic-aware estimates for future departures, not observed past traffic or guaranteed arrivals.','Inventory, supplier coordinates, preparation times and demand are synthetic demo records.','This separate preview does not update saved plans, reservations, orders or the OpenStreetMap view.']};
}
export function validateTrafficChoice(candidates:Awaited<ReturnType<typeof compareTraffic>>['candidates'],raw:unknown){
 const choice=trafficChoice.parse(raw),candidate=candidates.find(c=>c.id===choice.candidateId)!;
 const mostPacks=Math.max(...candidates.map(c=>c.metrics.allocatedUnits));
 const mostPriority=Math.max(...candidates.filter(c=>c.metrics.allocatedUnits===mostPacks).map(c=>c.metrics.priorityAllocated));
 if(candidate.metrics.allocatedUnits!==mostPacks||candidate.metrics.priorityAllocated!==mostPriority)throw new Error('AI selected an alternative with avoidable shortage; no recommendation accepted');
 if(!bestRecoveryIds(candidates).includes(candidate.id))throw new Error('AI choice violates recovery and delivery-time priority; a cheaper slower plan cannot win');
 const valid=candidates.filter(c=>c.metrics.allocatedUnits===mostPacks&&c.metrics.priorityAllocated===mostPriority),m=candidate.metrics;
 if(choice.reasonCode==='earlier_delivery'&&(m.lastDeliveryMinutes??m.averageDeliveryMinutes??Infinity)!==Math.min(...valid.map(c=>c.metrics.lastDeliveryMinutes??c.metrics.averageDeliveryMinutes??Infinity)))throw new Error('AI delivery-time justification did not match calculated results');
 if(choice.reasonCode==='lower_cost'&&m.cost!==Math.min(...valid.map(c=>c.metrics.cost)))throw new Error('AI cost justification did not match calculated results');
 const reason=choice.reasonCode==='earlier_delivery'?'Bedrock selected the alternative with the earliest last planned delivery among options preserving maximum total and priority-store fulfillment; average delivery time and then cost break ties.':choice.reasonCode==='lower_cost'?'Bedrock selected the lowest modeled cost only after total fulfillment, priority-store fulfillment and delivery times tie.':'Bedrock selected this alternative under the recovery-first policy: total fulfillment, priority-store fulfillment, last delivery time, average delivery time, then cost.';
 const signed=(n:number)=>`${n>0?'+':''}${Math.round(n*10)/10}`;
 // Render quantitative explanations from verified results, not free-form model claims.
 const tradeoffs=candidates.filter(c=>c.id!==candidate.id).map(c=>`${c.title}: ${signed(c.metrics.allocatedUnits-m.allocatedUnits)} supplied packs, ${signed(c.metrics.cost-m.cost)} USD modeled cost${c.metrics.averageDeliveryMinutes!==null&&m.averageDeliveryMinutes!==null?`, ${signed(c.metrics.averageDeliveryMinutes-m.averageDeliveryMinutes)} min average delivery`:''} versus the recommendation; ${c.waitMinutes} min initial wait.`);
 return {...choice,reason,tradeoffs};
}
