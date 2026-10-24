import raw from './data/dataset.json';
import roads from './data/supplier-routes.json';
import {z} from 'zod';
export const regionNames={north_bay:'North Bay',east_bay:'East Bay',peninsula:'Peninsula',south_bay:'South Bay',san_francisco:'San Francisco'};
export const scenarioSchema=z.object({
 closedFacilityIds:z.array(z.number().int().refine(n=>[1,5].includes(n))).max(2).default([]),
 blockedSupplierIds:z.array(z.number().int().min(1).max(6)).max(6).default([]),
 objective:z.enum(['continuity','time','cost']).default('continuity'),
 trafficMultiplier:z.number().min(1).max(3).default(1),enableStoreTransfers:z.boolean().default(false),
 regionalTraffic:z.array(z.object({region:z.enum(['north_bay','east_bay','peninsula','south_bay','san_francisco']),multiplier:z.number().min(1).max(3),assumed:z.boolean().default(false)})).max(5).default([]),
 directDispatchSupplierIds:z.array(z.literal(4)).max(1).default([]),
 supplierCapacityLimits:z.array(z.object({supplierId:z.number().int().min(1).max(6),availableKg:z.number().int().min(0).max(5000)})).max(6).default([]),
}).strict();
export type Scenario=z.infer<typeof scenarioSchema>;
export const defaults:Scenario={closedFacilityIds:[],blockedSupplierIds:[],objective:'continuity',trafficMultiplier:1,enableStoreTransfers:false,regionalTraffic:[],directDispatchSupplierIds:[],supplierCapacityLimits:[]};
// Synthetic preapproved lane; an LLM cannot invent a bypass for an arbitrary supplier.
export const directDispatchOptions=[{supplierId:4,offerId:'D',city:'Gilroy',bypassFacilityIds:[5],prepMinutes:45,handlingCostKg:.25,approval:'approved_mock',capacityKg:320,description:'Synthetic approved D-to-store dispatch; bypasses Oakland handling, uses stored direct-road estimates. No real carrier confirmation.'}];
export function regionForCity(city:string):keyof typeof regionNames|null{
 if(['Santa Rosa','Napa','Petaluma','San Rafael','Novato','Fairfield'].includes(city))return 'north_bay';
 if(['Oakland','Alameda','Walnut Creek','San Leandro','Union City','Richmond','Berkeley'].includes(city))return 'east_bay';
 if(['Colma','Redwood City'].includes(city))return 'peninsula';
 if(['Gilroy','San Jose','Sunnyvale','Milpitas','Mountain View'].includes(city))return 'south_bay';
 return city==='San Francisco'?'san_francisco':null;
}
export function routeTraffic(s:Scenario,fromCity:string,toCity:string){
 const regions=[regionForCity(fromCity),regionForCity(toCity)];
 // Endpoint approximation, not road-segment detection; overlapping delays use max, never compound.
 return Math.max(s.trafficMultiplier,...(s.regionalTraffic||[]).filter(x=>regions.includes(x.region)).map(x=>x.multiplier));
}
export function operationalNotes(s:Scenario){return [
 ...(s.regionalTraffic||[]).map(x=>`${regionNames[x.region]} travel ×${x.multiplier}${x.assumed?' (scenario assumption: delay was not specified)':''}. Applied when either route endpoint is in this region; not live traffic or highway rerouting.`),
 ...(s.directDispatchSupplierIds||[]).map(()=> 'D direct dispatch uses a synthetic approved lane: Oakland handling bypassed, 45 min preparation, $0.25/kg extra handling; stock, recall and capacity checks still apply.'),
 ...(s.supplierCapacityLimits||[]).map(x=>`Supplier ${x.supplierId}: requested spare-stock ceiling ${x.availableKg} kg; actual available stock remains the upper bound.`),
 ];}
export const snapshot='2026-10-23T12:00:00-07:00';
export const report='SYNTHETIC INCIDENT DEMO-E01. DEMO Romaine 1 kg. Raw lot DEMO-P1-RAW-A tested positive. Hold raw lot DEMO-P1-RAW-A and every descendant including DEMO-P1-BLEND-A. This is fictional demonstration evidence.';
const t=raw.tables;
export const stores=t.stores;
export const facilities=t.facilities;
// Operational triage policy, separate from modeled store replenishment deadlines.
// A customer report alone cannot establish a positive lot result or close an incident.
export function incidentQueue(){
 return t.events.map(event=>{
  const lots=t.event_lots.filter(l=>l.event_id===event.id).map(l=>l.lot_id);
  const labs=t.lab_results.filter(l=>l.lot_id!==null&&lots.includes(l.lot_id));
  const positive=labs.some(l=>l.status==='positive'),pending=labs.some(l=>l.status==='pending');
  const closed=event.current_status==='closed',activeRecall=event.current_status==='recall_active';
  const rows=raw.loss_snapshot.filter(r=>r.event_id===event.id);
  const priority=closed?'Closed':activeRecall||positive?'P0':event.current_status==='investigating'||pending?'P1':'P2';
  return {id:event.id,code:event.event_code,product:t.products.find(p=>p.id===event.product_id)!.name.replace(/^DEMO /,''),status:event.current_status,reportedAt:event.reported_at,priority,rank:closed?3:priority==='P0'?0:priority==='P1'?1:2,
   evidence:positive?'Positive lot test':pending?'Lot testing pending':labs.some(l=>l.status==='negative')?'Negative lot test':'No lot test available',
   heldKg:rows.reduce((n,r)=>n+r.blocked_stock_units,0),inboundKg:rows.reduce((n,r)=>n+r.flagged_inbound_units,0),affectedStores:new Set(rows.filter(r=>r.blocked_stock_units>0||r.flagged_inbound_units>0).map(r=>r.store_id)).size,
   reason:closed?'Closed after authority review in the demo record.':activeRecall?'Active recall with outbound containment still unconfirmed.':positive?'Positive lot evidence requires urgent containment review.':'Reported illness cluster; causation is not established.',
   nextAction:closed?'Retain the investigation and release record.':activeRecall||positive?'Confirm lot holds and stop flagged shipments.':'Verify lot records and obtain pending lab results.',
   recoverySupported:event.id===1,
  };
 }).sort((a,b)=>a.rank-b.rank||b.inboundKg-a.inboundKg||a.reportedAt.localeCompare(b.reportedAt));
}
export type IncidentPriority=ReturnType<typeof incidentQueue>[number];
export const allOffers=[
 {id:'A',farmId:1,product:'Romaine 1 kg',variety:'romaine',packKg:1,physicalPacks:1600,committedKg:1220,priceKg:3,lot:'DEMO-P1-RAW-A',released:false,dependencies:[1,5],prepMinutes:60},
 {id:'B',farmId:2,product:'Romaine 1 kg',variety:'romaine',packKg:1,physicalPacks:1100,committedKg:371,priceKg:3.4,lot:'SIM-ROM-B-1023',released:true,dependencies:[1,5],prepMinutes:90},
 {id:'F',farmId:6,product:'Romaine 500 g',variety:'romaine',packKg:.5,physicalPacks:1800,committedKg:289,priceKg:3.7,lot:'SIM-ROM-F-1023',released:true,dependencies:[],prepMinutes:90},
 {id:'D',farmId:4,product:'Romaine 1 kg',variety:'romaine',packKg:1,physicalPacks:320,committedKg:0,priceKg:3.2,lot:'SIM-ROM-D-1023',released:true,dependencies:[5],prepMinutes:90},
 {id:'C',farmId:3,product:'Iceberg 1 kg',variety:'iceberg',packKg:1,physicalPacks:1000,committedKg:0,priceKg:2.8,lot:'SIM-ICE-C-1023',released:true,dependencies:[],prepMinutes:60},
].map(o=>({...o,...{city:t.farms.find(f=>f.id===o.farmId)!.city,latitude:t.farms.find(f=>f.id===o.farmId)!.latitude,longitude:t.farms.find(f=>f.id===o.farmId)!.longitude},supplier:`DEMO Farm ${o.id}`,expiresOn:'2026-10-29',coldChain:'verified_mock',contract:'approved_mock'}));
export const matchSchema=z.object({matches:z.array(z.object({offerId:z.enum(['A','B','F','D','C']),compatible:z.boolean(),reason:z.string().min(1).max(400)})).length(5)}).superRefine((v,c)=>{if(new Set(v.matches.map(m=>m.offerId)).size!==5)c.addIssue({code:'custom',message:'Return each offer exactly once.'});});
export type Matches=z.infer<typeof matchSchema>['matches'];
export const catalogMatches:Matches=allOffers.map(o=>({offerId:o.id as Matches[number]['offerId'],compatible:o.variety==='romaine',reason:o.variety==='romaine'?`Catalog rule: romaine; ${o.packKg} kg packs normalized to kg.`:'Catalog rule: iceberg is not the specified romaine variety.'}));
export function trace(){
 const affected=new Set([1]);let changed=true;while(changed){changed=false;for(const x of t.lot_inputs)if(affected.has(x.input_lot_id)&&!affected.has(x.output_lot_id)){affected.add(x.output_lot_id);changed=true;}}
 const targets=raw.labeling_evidence.filter(e=>e.event_id===1&&e.blocked_stock_units>0).map(e=>{const s=stores.find(x=>x.id===e.store_id)!;const need=e.blocked_stock_units;return {...s,need,priority:s.id%3===1?'P0':'P1',deadlineMinutes:s.id%3===1?150:240,priorityReason:s.id%3===1?'Demo replenishment deadline within 150 minutes':'Demo replenishment deadline within 240 minutes'};});
 const shipments=t.shipments.filter(s=>affected.has(s.lot_id)&&t.shipment_state.some(st=>st.shipment_id===s.id&&['planned','scheduled','in_transit'].includes(st.status)));
 return {affectedLots:t.lots.filter(l=>affected.has(l.id)),relatedInputLot:t.lots.find(l=>l.id===2)!,targets,shipments,heldKg:targets.reduce((n,s)=>n+s.need,0),inboundKg:raw.loss_snapshot.filter(e=>e.event_id===1).reduce((n,e)=>n+e.flagged_inbound_units,0),exposureUsd:raw.loss_snapshot.filter(e=>e.event_id===1).reduce((n,e)=>n+e.stock_cost_at_risk_usd,0)};
}
export function inspectOffers(s:Scenario,matches:Matches=catalogMatches){return allOffers.map(o=>{
 const direct=(s.directDispatchSupplierIds||[]).some(id=>id===o.farmId)?directDispatchOptions.find(d=>d.supplierId===o.farmId&&d.approval==='approved_mock'):undefined;
 const closed=o.dependencies.filter(id=>s.closedFacilityIds.includes(id)&&!direct?.bypassFacilityIds.includes(id));
 const match=matches.find(m=>m.offerId===o.id)!;const reasons:string[]=[];
 if(!o.released)reasons.push('Lot is recalled / on hold');if(o.coldChain!=='verified_mock')reasons.push('Cold-chain verification missing');if(o.contract!=='approved_mock')reasons.push('Supplier contract not approved');if(s.blockedSupplierIds.includes(o.farmId))reasons.push('Supplier unavailable in this scenario');if(closed.length)reasons.push(`Depends on closed ${closed.map(id=>facilities.find(f=>f.id===id)!.city+' facility').join(', ')}`);if(!match.compatible)reasons.push('Product not accepted by compatibility assessment');if(o.variety!=='romaine')reasons.push('Required variety contract: romaine');if(o.expiresOn<snapshot.slice(0,10))reasons.push('Expired lot');
 const stockSpare=Math.max(0,o.physicalPacks*o.packKg-o.committedKg);
 const limits=(s.supplierCapacityLimits||[]).filter(x=>x.supplierId===o.farmId).map(x=>x.availableKg);
 const spareKg=Math.min(stockSpare,...limits,...(direct?[direct.capacityKg]:[]));
 if(!spareKg)reasons.push('No uncommitted stock within the requested capacity limit');
 return {...o,match,closedDependencies:closed,eligible:reasons.length===0,reasons,capacityKg:o.physicalPacks*o.packKg,spareKg,dispatchMode:direct?'direct' as const:'standard' as const,dispatchPrepMinutes:direct?.prepMinutes??o.prepMinutes,dispatchHandlingCostKg:direct?.handlingCostKg??0,directDispatch:direct||null};
 });}
// Store transfers use on-hand stock only: no inbound or newly allocated supply is re-exported.
export function recoveryTargets(s:Scenario,offers=inspectOffers(s)){
 const impact=trace();let normalIndex=0;
 const expanded=stores.filter(st=>!impact.targets.some(d=>d.id===st.id)).flatMap(st=>{
  const originId=normalIndex++%2===0?'B':'F',offer=offers.find(o=>o.id===originId)!;
  if(!s.blockedSupplierIds.includes(offer.farmId)&&!offer.closedDependencies.length)return [];
  const need=t.store_product_assumptions.find(a=>a.store_id===st.id&&a.product_id===1)!.daily_demand_packs;
  return [{...st,originOfferId:offer.id,need,priority:st.id%3===1?'P0':'P1',deadlineMinutes:st.id%3===1?150:240,priorityReason:'Existing order interrupted by additional supplier / facility outage'}];
 });
 return [...impact.targets.map(d=>({...d,originOfferId:'A'})),...expanded];
}
export const transferPolicy={maxEtaMinutes:120,handlingMinutes:30,priceKg:3.25,scope:'Same-chain retail stores only',inventory:'Synthetic snapshot; stock already on hand',reserve:'Reserved stock plus ceil(daily demand × target cover days); disrupted recipients cannot donate',cost:'Synthetic $3/kg inventory value + $0.25/kg handling + $0.04/kg/km transport'};
export function inspectStoreTransfers(s:Scenario){
 const targets=recoveryTargets(s),unsafe=new Set(t.lot_state.filter(l=>l.safety_status!=='released').map(l=>l.lot_id));
 let changed=true;while(changed){changed=false;for(const l of t.lot_inputs)if(unsafe.has(l.input_lot_id)&&!unsafe.has(l.output_lot_id)){unsafe.add(l.output_lot_id);changed=true;}}
 return stores.filter(st=>t.store_metadata.some(m=>m.store_id===st.id&&m.store_type==='retail')).map(st=>{
  const demand=t.store_product_assumptions.find(a=>a.store_id===st.id&&a.product_id===1)!;
  const minimumKeepKg=Math.ceil(demand.daily_demand_packs*demand.target_cover_days);
  const lots=t.inventory.filter(i=>i.store_id===st.id&&t.lots.some(l=>l.id===i.lot_id&&l.product_id===1)).map(i=>{
   const lot=t.lots.find(l=>l.id===i.lot_id)!,state=t.lot_state.find(l=>l.lot_id===i.lot_id),reasons:string[]=[];
   if(!state||state.safety_status!=='released'||unsafe.has(lot.id))reasons.push('Lot or ancestor is held / recalled / unverified');
   if(!state||state.expires_on<snapshot.slice(0,10))reasons.push('Lot expired or expiry missing');
   if(i.cold_chain_status!=='verified')reasons.push('Cold-chain verification missing or failed');
   if(i.as_of!==snapshot)reasons.push('Inventory snapshot is stale');
   return {id:`T${st.id}-L${lot.id}`,lotId:lot.id,lot:lot.lot_code,quantityKg:i.quantity,reservedKg:i.reserved_quantity,availableKg:Math.max(0,i.quantity-i.reserved_quantity),expiresOn:state?.expires_on||'',eligible:!reasons.length,reasons};
  });
  const safeKg=lots.filter(l=>l.eligible).reduce((n,l)=>n+l.availableKg,0),disrupted=targets.some(d=>d.id===st.id);
  const reasons:string[]=[];if(disrupted)reasons.push('Store has its own disrupted replenishment need');if(safeKg<=minimumKeepKg)reasons.push('No surplus above protected stock');
  return {...st,sourceId:`T${st.id}`,minimumKeepKg,safeKg,lots,eligible:!reasons.length,reasons,spareKg:reasons.length?0:Math.max(0,safeKg-minimumKeepKg)};
 });
}
export type Allocation={offerId:string;supplier:string;city:string;storeId:number;kg:number;physicalPacks:number;etaMinutes:number;distanceKm:number;cost:number;onTime:boolean;sourceKind:'supplier'|'store';originStoreId?:number;lot:string;directDispatch?:boolean;travelMultiplier?:number};
export function optimize(s:Scenario,matches:Matches=catalogMatches){
 const impact=trace(),offers=inspectOffers(s,matches),eligible=offers.filter(o=>o.eligible),donors=inspectStoreTransfers(s);
 const targets=recoveryTargets(s,offers),required=targets.reduce((n,d)=>n+d.need,0);
 let originalIndex=0;const normal=stores.map(st=>{const held=impact.targets.find(d=>d.id===st.id);return {...st,originOfferId:held?'A':originalIndex++%2===0?'B':'F',need:held?.need||t.store_product_assumptions.find(a=>a.store_id===st.id&&a.product_id===1)!.daily_demand_packs,received:0,unfilled:0};});
 const activeDonors=s.enableStoreTransfers?donors.filter(d=>d.eligible):[];
 const transferLots=activeDonors.flatMap(d=>d.lots.filter(l=>l.eligible&&l.availableKg>0).map(l=>({d,l})));
 type Edge={to:number;rev:number;capacity:number;cost:number;initial:number};
 const donorStart=eligible.length,lotStart=donorStart+activeDonors.length,targetStart=lotStart+transferLots.length;
 const n=targetStart+targets.length+2,source=n-2,sink=n-1,g:Edge[][]=Array.from({length:n},()=>[]);
 const add=(a:number,b:number,q:number,c:number)=>{const e={to:b,rev:g[b].length,capacity:q,cost:c,initial:q};g[a].push(e);g[b].push({to:a,rev:g[a].length-1,capacity:0,cost:-c,initial:0});return e;};
 const edgeCost=(eta:number,unitCost:number,onTime:boolean)=>Math.round((s.objective==='cost'?unitCost:eta)*100)+(s.objective==='continuity'&&!onTime?1e6:0);
 eligible.forEach((o,i)=>add(source,i,o.spareKg,0));
 activeDonors.forEach((d,i)=>add(source,donorStart+i,d.spareKg,0));
 transferLots.forEach(({d,l},i)=>add(donorStart+activeDonors.findIndex(x=>x.id===d.id),lotStart+i,l.availableKg,0));
 targets.forEach((d,i)=>{add(targetStart+i,sink,d.need,0);add(source,targetStart+i,d.need,d.priority==='P0'?1e10:1e8);});
 type Ref={edge:Edge;offerId:string;supplier:string;city:string;storeId:number;packKg:number;eta:number;distanceKm:number;unitCost:number;onTime:boolean;sourceKind:'supplier'|'store';originStoreId?:number;lot:string;directDispatch?:boolean;travelMultiplier?:number};
 const refs:Ref[]=eligible.flatMap((o,i)=>targets.flatMap((d,j)=>{const r=roads.find(x=>x.supplierId===o.farmId&&x.storeId===d.id);if(!r)return [];const eta=Math.round(r.drivingMinutes*routeTraffic(s,o.city,d.city)+o.dispatchPrepMinutes),onTime=eta<=d.deadlineMinutes,unitCost=o.priceKg+o.dispatchHandlingCostKg+r.distanceKm*.04;return [{offerId:o.id,supplier:o.supplier,city:o.city,storeId:d.id,packKg:o.packKg,eta,onTime,distanceKm:r.distanceKm,unitCost,sourceKind:'supplier' as const,lot:o.lot,...(o.dispatchMode==='direct'?{directDispatch:true}:{}),...((s.regionalTraffic||[]).length?{travelMultiplier:routeTraffic(s,o.city,d.city)}:{}),edge:add(i,targetStart+j,Math.min(o.spareKg,d.need),edgeCost(eta,unitCost,onTime))}];}));
 transferLots.forEach(({d:donor,l},i)=>targets.forEach((d,j)=>{
  if(d.chain!==donor.chain||d.id===donor.id)return;
  const approval=t.replacement_candidates.find(c=>c.event_id===1&&c.origin_store_id===donor.id&&c.destination_store_id===d.id&&c.candidate_lot_id===l.lotId);
  if(approval?.transfer_approval!=='approved_mock')return;
  const r=t.route_matrix.find(r=>r.origin_store_id===donor.id&&r.destination_store_id===d.id);
  if(!r||r.route_status!=='ok'||!Number.isFinite(r.driving_minutes)||!Number.isFinite(r.road_distance_km)||r.driving_minutes<=0||r.road_distance_km<=0)return;
  const eta=Math.ceil(r.driving_minutes*routeTraffic(s,donor.city,d.city)+transferPolicy.handlingMinutes),onTime=eta<=d.deadlineMinutes;
  const expiry=Date.parse(l.expiresOn+'T23:59:59-07:00');
  if(eta>transferPolicy.maxEtaMinutes||Date.parse(snapshot)+(eta+30)*60000>expiry)return;
  const unitCost=transferPolicy.priceKg+r.road_distance_km*.04;
  refs.push({offerId:l.id,supplier:donor.chain+' · '+donor.city,city:donor.city,storeId:d.id,packKg:1,eta,onTime,distanceKm:r.road_distance_km,unitCost,sourceKind:'store',originStoreId:donor.id,lot:l.lot,...((s.regionalTraffic||[]).length?{travelMultiplier:routeTraffic(s,donor.city,d.city)}:{}),edge:add(lotStart+i,targetStart+j,Math.min(l.availableKg,donor.spareKg,d.need),edgeCost(eta,unitCost,onTime))});
 }));
 let sent=0;while(sent<required){const ds=Array(n).fill(Infinity),pn=Array(n).fill(-1),pe=Array(n).fill(-1);ds[source]=0;for(let k=0;k<n-1;k++){let changed=false;for(let a=0;a<n;a++)if(Number.isFinite(ds[a]))g[a].forEach((e,b)=>{if(e.capacity>0&&ds[e.to]>ds[a]+e.cost){ds[e.to]=ds[a]+e.cost;pn[e.to]=a;pe[e.to]=b;changed=true;}});if(!changed)break;}if(!Number.isFinite(ds[sink]))break;let q=required-sent;for(let v=sink;v!==source;v=pn[v])q=Math.min(q,g[pn[v]][pe[v]].capacity);for(let v=sink;v!==source;v=pn[v]){const e=g[pn[v]][pe[v]];e.capacity-=q;g[v][e.rev].capacity+=q;}sent+=q;}
 const allocations:Allocation[]=refs.filter(x=>x.edge.initial>x.edge.capacity).map(x=>{const kg=x.edge.initial-x.edge.capacity;return {offerId:x.offerId,supplier:x.supplier,city:x.city,storeId:x.storeId,kg,physicalPacks:kg/x.packKg,etaMinutes:x.eta,distanceKm:x.distanceKm,cost:Math.round(kg*x.unitCost*100)/100,onTime:x.onTime,sourceKind:x.sourceKind,...(x.originStoreId?{originStoreId:x.originStoreId}:{}),lot:x.lot,...(x.directDispatch?{directDispatch:true}:{}),...(x.travelMultiplier?{travelMultiplier:x.travelMultiplier}:{})};});
 const transferLedger=donors.map(d=>{const outgoing=allocations.filter(a=>a.originStoreId===d.id),sentKg=outgoing.reduce((n,a)=>n+a.kg,0);return {...d,sentKg,remainingSafeKg:d.safeKg-sentKg,lots:d.lots.map(l=>({...l,sentKg:outgoing.filter(a=>a.lot===l.lot).reduce((n,a)=>n+a.kg,0)}))};});
 const transferKg=allocations.filter(a=>a.sourceKind==='store').reduce((n,a)=>n+a.kg,0);
 const allocated=allocations.reduce((n,a)=>n+a.kg,0),onTimeKg=allocations.filter(a=>a.onTime).reduce((n,a)=>n+a.kg,0);
 const ledger=targets.map(d=>{const a=allocations.filter(a=>a.storeId===d.id),received=a.reduce((n,x)=>n+x.kg,0);return {...d,allocations:a,received,unfilled:d.need-received,lateKg:a.filter(x=>!x.onTime).reduce((n,x)=>n+x.kg,0)};});
 const supplierLedger=offers.map(o=>{const addedKg=allocations.filter(a=>a.offerId===o.id).reduce((n,a)=>n+a.kg,0);return {...o,addedKg,remainingKg:o.eligible?o.spareKg-addedKg:0};});
 // A deliberately simple comparator: one supplier must cover the complete request.
 const single=eligible.filter(o=>o.spareKg>=required);
 return {scenario:s,operationalNotes:operationalNotes(s),normal,allocations,transferKg,supplierKg:allocated-transferKg,transferDonors:transferLedger,transferPolicy,stores:ledger,suppliers:supplierLedger,required,allocated,unfilled:required-allocated,onTimeKg,lateKg:allocated-onTimeKg,coverage:Math.round(100*allocated/required),cost:Math.round(allocations.reduce((n,a)=>n+a.cost,0)),maxEta:Math.max(0,...allocations.map(a=>a.etaMinutes)),timing:{dispatchStart:'after approval',lastDeliveryMinutes:allocated?Math.max(...allocations.map(a=>a.etaMinutes)):null,receivingBufferMinutes:30,recoveryMinutes:required>0&&allocated===required?Math.max(...allocations.map(a=>a.etaMinutes))+30:null,closureStatus:'Awaiting external clearance; no official incident-resolution forecast'},singleSupplierBaseline:{allocated:single.length?required:0,label:'Single supplier must cover all demand'},basis:'1 kg equivalents; 500 g packs count as 0.5 kg. Existing commitments and donor store cover protected. Scenario deadlines are not clinical priorities.',routeNote:'OSRM direct-road baseline between synthetic suppliers and real stores, and between real store coordinates for same-chain transfers. Map lines illustrate flows, not road geometry. Facility dependencies are operational constraints, not routed waypoints. Regional traffic affects routes with an endpoint in the selected region; no live traffic, highway detours or fleet routing. D direct dispatch is a synthetic preapproved option, not a real carrier confirmation.'};
}
export type RecoveryPlan=ReturnType<typeof optimize>;
export function stressTest(s:Scenario,matches:Matches=catalogMatches){const p=optimize(s,matches);return p.suppliers.filter(o=>o.eligible).map(o=>{const next=optimize({...s,blockedSupplierIds:[...new Set([...s.blockedSupplierIds,o.farmId])]},matches);return {supplier:o.supplier,farmId:o.farmId,unfilled:next.unfilled,allocated:next.allocated,delta:next.unfilled-p.unfilled};});}
export function narrative(p:RecoveryPlan){return `${p.allocated.toLocaleString()} of ${p.required.toLocaleString()} kg allocated (${p.coverage}%). ${p.suppliers.filter(s=>s.addedKg).map(s=>`${s.city}: ${s.addedKg} kg (${s.addedKg/s.packKg} physical packs)`).join('; ')}. ${p.transferKg||0} kg from same-chain store transfers. ${p.unfilled} kg remain unfilled; ${p.lateKg} allocated kg arrive after the modeled deadline. Existing commitments remain reserved. This is a synthetic proposal, not a purchase or dispatch.`;}
export async function fingerprint(p:RecoveryPlan){const bytes=new TextEncoder().encode(JSON.stringify({scenario:p.scenario,allocations:p.allocations}));const hash=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,'0')).join('');}
