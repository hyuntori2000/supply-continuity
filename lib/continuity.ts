import raw from './data/dataset.json';
import roads from './data/supplier-routes.json';
import {z} from 'zod';
export const scenarioSchema=z.object({closedFacilityIds:z.array(z.number().int().refine(n=>[1,5].includes(n))).max(2).default([]),blockedSupplierIds:z.array(z.number().int().min(1).max(6)).max(6).default([]),objective:z.enum(['continuity','time','cost']).default('continuity'),trafficMultiplier:z.number().min(1).max(3).default(1)});
export type Scenario=z.infer<typeof scenarioSchema>;
export const defaults:Scenario={closedFacilityIds:[],blockedSupplierIds:[],objective:'continuity',trafficMultiplier:1};
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
export function inspectOffers(s:Scenario,matches:Matches=catalogMatches){return allOffers.map(o=>{const closed=o.dependencies.filter(id=>s.closedFacilityIds.includes(id));const match=matches.find(m=>m.offerId===o.id)!;const reasons:string[]=[];if(!o.released)reasons.push('Lot is recalled / on hold');if(o.coldChain!=='verified_mock')reasons.push('Cold-chain verification missing');if(o.contract!=='approved_mock')reasons.push('Supplier contract not approved');if(s.blockedSupplierIds.includes(o.farmId))reasons.push('Supplier unavailable in this scenario');if(closed.length)reasons.push(`Depends on closed ${closed.map(id=>facilities.find(f=>f.id===id)!.city+' facility').join(', ')}`);if(!match.compatible)reasons.push('Product not accepted by compatibility assessment');if(o.variety!=='romaine')reasons.push('Required variety contract: romaine');if(o.expiresOn<snapshot.slice(0,10))reasons.push('Expired lot');return {...o,match,closedDependencies:closed,eligible:reasons.length===0,reasons,capacityKg:o.physicalPacks*o.packKg,spareKg:Math.max(0,o.physicalPacks*o.packKg-o.committedKg)};});}
export type Allocation={offerId:string;supplier:string;city:string;storeId:number;kg:number;physicalPacks:number;etaMinutes:number;distanceKm:number;cost:number;onTime:boolean};
export function optimize(s:Scenario,matches:Matches=catalogMatches){
 const impact=trace(),offers=inspectOffers(s,matches),eligible=offers.filter(o=>o.eligible);
 let normalIndex=0;const expanded=stores.filter(st=>!impact.targets.some(d=>d.id===st.id)).flatMap(st=>{const originId=normalIndex++%2===0?'B':'F';const offer=offers.find(o=>o.id===originId)!;if(!s.blockedSupplierIds.includes(offer.farmId)&&!offer.closedDependencies.length)return [];const need=t.store_product_assumptions.find(a=>a.store_id===st.id&&a.product_id===1)!.daily_demand_packs;return [{...st,originOfferId:offer.id,need,priority:st.id%3===1?'P0':'P1',deadlineMinutes:st.id%3===1?150:240,priorityReason:'Existing order interrupted by additional supplier / facility outage'}];});
 const targets=[...impact.targets.map(d=>({...d,originOfferId:'A'})),...expanded],required=targets.reduce((n,d)=>n+d.need,0);
 let originalIndex=0;const normal=stores.map(st=>{const held=impact.targets.find(d=>d.id===st.id);return {...st,originOfferId:held?'A':originalIndex++%2===0?'B':'F',need:held?.need||t.store_product_assumptions.find(a=>a.store_id===st.id&&a.product_id===1)!.daily_demand_packs,received:0,unfilled:0};});
 type Edge={to:number;rev:number;capacity:number;cost:number;initial:number};
 const n=eligible.length+targets.length+2,source=n-2,sink=n-1,g:Edge[][]=Array.from({length:n},()=>[]);
 const add=(a:number,b:number,q:number,c:number)=>{const e={to:b,rev:g[b].length,capacity:q,cost:c,initial:q};g[a].push(e);g[b].push({to:a,rev:g[a].length-1,capacity:0,cost:-c,initial:0});return e;};
 eligible.forEach((o,i)=>add(source,i,o.spareKg,0));
 targets.forEach((d,i)=>{add(eligible.length+i,sink,d.need,0);add(source,eligible.length+i,d.need,d.priority==='P0'?1e10:1e8);});
 const refs=eligible.flatMap((o,i)=>targets.flatMap((d,j)=>{const r=roads.find(x=>x.supplierId===o.farmId&&x.storeId===d.id);if(!r)return [];const eta=Math.round(r.drivingMinutes*s.trafficMultiplier+o.prepMinutes),onTime=eta<=d.deadlineMinutes;const unitCost=o.priceKg+r.distanceKm*.04;const cost=Math.round((s.objective==='cost'?unitCost:eta)*100)+(s.objective==='continuity'&&!onTime?1e6:0);return [{o,d,r,eta,onTime,unitCost,edge:add(i,eligible.length+j,Math.min(o.spareKg,d.need),cost)}];}));
 let sent=0;while(sent<required){const ds=Array(n).fill(Infinity),pn=Array(n).fill(-1),pe=Array(n).fill(-1);ds[source]=0;for(let k=0;k<n-1;k++){let changed=false;for(let a=0;a<n;a++)if(Number.isFinite(ds[a]))g[a].forEach((e,b)=>{if(e.capacity>0&&ds[e.to]>ds[a]+e.cost){ds[e.to]=ds[a]+e.cost;pn[e.to]=a;pe[e.to]=b;changed=true;}});if(!changed)break;}if(!Number.isFinite(ds[sink]))break;let q=required-sent;for(let v=sink;v!==source;v=pn[v])q=Math.min(q,g[pn[v]][pe[v]].capacity);for(let v=sink;v!==source;v=pn[v]){const e=g[pn[v]][pe[v]];e.capacity-=q;g[v][e.rev].capacity+=q;}sent+=q;}
 const allocations:Allocation[]=refs.filter(x=>x.edge.initial>x.edge.capacity).map(x=>{const kg=x.edge.initial-x.edge.capacity;return {offerId:x.o.id,supplier:x.o.supplier,city:x.o.city,storeId:x.d.id,kg,physicalPacks:kg/x.o.packKg,etaMinutes:x.eta,distanceKm:x.r.distanceKm,cost:Math.round(kg*x.unitCost*100)/100,onTime:x.onTime};});
 const allocated=allocations.reduce((n,a)=>n+a.kg,0),onTimeKg=allocations.filter(a=>a.onTime).reduce((n,a)=>n+a.kg,0);
 const ledger=targets.map(d=>{const a=allocations.filter(a=>a.storeId===d.id),received=a.reduce((n,x)=>n+x.kg,0);return {...d,allocations:a,received,unfilled:d.need-received,lateKg:a.filter(x=>!x.onTime).reduce((n,x)=>n+x.kg,0)};});
 const supplierLedger=offers.map(o=>{const addedKg=allocations.filter(a=>a.offerId===o.id).reduce((n,a)=>n+a.kg,0);return {...o,addedKg,remainingKg:o.eligible?o.spareKg-addedKg:0};});
 // A deliberately simple comparator: one supplier must cover the complete request.
 const single=eligible.filter(o=>o.spareKg>=required);
 return {scenario:s,normal,allocations,stores:ledger,suppliers:supplierLedger,required,allocated,unfilled:required-allocated,onTimeKg,lateKg:allocated-onTimeKg,coverage:Math.round(100*allocated/required),cost:Math.round(allocations.reduce((n,a)=>n+a.cost,0)),maxEta:Math.max(0,...allocations.map(a=>a.etaMinutes)),timing:{dispatchStart:'after approval',lastDeliveryMinutes:allocated?Math.max(...allocations.map(a=>a.etaMinutes)):null,receivingBufferMinutes:30,recoveryMinutes:required>0&&allocated===required?Math.max(...allocations.map(a=>a.etaMinutes))+30:null,closureStatus:'Awaiting external clearance; no official incident-resolution forecast'},singleSupplierBaseline:{allocated:single.length?required:0,label:'Single supplier must cover all demand'},basis:'1 kg equivalents; 500 g packs count as 0.5 kg. Existing commitments reserved. Scenario deadlines are not clinical priorities.',routeNote:'OSRM direct-road baseline between synthetic supplier coordinates and real stores. Facility dependencies are operational constraints, not routed waypoints. No live traffic or fleet routing.'};
}
export type RecoveryPlan=ReturnType<typeof optimize>;
export function stressTest(s:Scenario,matches:Matches=catalogMatches){const p=optimize(s,matches);return p.suppliers.filter(o=>o.eligible).map(o=>{const next=optimize({...s,blockedSupplierIds:[...new Set([...s.blockedSupplierIds,o.farmId])]},matches);return {supplier:o.supplier,farmId:o.farmId,unfilled:next.unfilled,allocated:next.allocated,delta:next.unfilled-p.unfilled};});}
export function narrative(p:RecoveryPlan){return `${p.allocated.toLocaleString()} of ${p.required.toLocaleString()} kg allocated (${p.coverage}%). ${p.suppliers.filter(s=>s.addedKg).map(s=>`${s.city}: ${s.addedKg} kg (${s.addedKg/s.packKg} physical packs)`).join('; ')}. ${p.unfilled} kg remain unfilled; ${p.lateKg} allocated kg arrive after the modeled deadline. Existing commitments remain reserved. This is a synthetic proposal, not a purchase or dispatch.`;}
export async function fingerprint(p:RecoveryPlan){const bytes=new TextEncoder().encode(JSON.stringify({scenario:p.scenario,allocations:p.allocations}));const hash=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,'0')).join('');}
