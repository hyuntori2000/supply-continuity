import {z} from 'zod';
import raw from '../../lib/data/dataset.json';
import roads from '../../lib/data/supplier-routes.json';
import storeRoads from '../../lib/data/store-routes.json';
import {hasExactIdentifier} from '../../lib/evidence';

// Versioned synthetic operational records; persisted once, then read from DynamoDB.
export function initialCatalog(){
 const t=raw.tables;
 return {version:1,updatedAt:new Date().toISOString(),source:'Seeded synthetic records; operator updates are persisted, not external live feeds',snapshot:'2026-10-23T12:00:00-07:00',
  products:t.products.map(p=>({...p,unitKg:t.product_specs.find(s=>s.product_id===p.id)!.unit_weight_kg,unitCost:t.product_specs.find(s=>s.product_id===p.id)!.unit_cost_usd})),
  stores:t.stores,farms:t.farms,lots:t.lots.map(l=>({...l,...t.lot_state.find(s=>s.lot_id===l.id)})),inputs:t.lot_inputs,
  inventory:t.inventory,shipments:t.shipments.map(s=>({...s,status:t.shipment_state.find(st=>st.shipment_id===s.id)?.status||'unknown'})),
  demand:t.store_product_assumptions.map(d=>({storeId:d.store_id,productId:d.product_id,reserveUnits:Math.ceil(d.daily_demand_packs*d.target_cover_days)})),
  routes:roads,
  offers:t.supplier_offers.map(o=>({...o,lotId:o.product_id*5-1,coldChain:'verified_mock',updatedAt:'2026-10-23T12:00:00-07:00'})),
 };
}
export type Catalog=ReturnType<typeof initialCatalog>;
export type Extraction={lotCode:string|null;product:string|null;summary:string};
export const trafficRegions={
 'North Bay':['Santa Rosa','Napa','Petaluma','San Rafael','Fairfield'],
 'East Bay':['Alameda','Walnut Creek','San Leandro','Union City','Richmond','Oakland','Berkeley','Brentwood'],
 'Peninsula':['Colma','Redwood City','Mountain View'],
 'South Bay':['Sunnyvale','Milpitas','San Jose','Gilroy','Morgan Hill'],
 'San Francisco':['San Francisco'],
} as const;
export const planConditions=z.object({priorityStoreIds:z.array(z.number().int().positive()).max(27).default([]),regionalTraffic:z.array(z.object({region:z.enum(['North Bay','East Bay','Peninsula','South Bay','San Francisco']),multiplier:z.number().min(1).max(3)}).strict()).max(5).default([]),allowStoreTransfers:z.boolean().default(false),maxTransferMinutes:z.number().min(15).max(180).default(90),objective:z.enum(['time','cost']).default('time'),trafficMultiplier:z.number().min(1).max(3).default(1),blockedSupplierIds:z.array(z.number().int().positive()).max(20).default([]),capacityLimits:z.array(z.object({supplierId:z.number().int().positive(),availableUnits:z.number().int().min(0).max(100000)})).max(20).default([]),assumptions:z.array(z.string().max(300)).max(8).default([]),unappliedRequests:z.array(z.string().max(300)).max(8).default([])}).strict();
export type Conditions=z.infer<typeof planConditions>;
export const basicConditions=()=>planConditions.parse({});
export function descendants(c:Catalog,seeds:number[]){const ids=new Set(seeds);let changed=true;while(changed){changed=false;for(const x of c.inputs)if(ids.has(x.input_lot_id)&&!ids.has(x.output_lot_id)){ids.add(x.output_lot_id);changed=true;}}return ids;}
export function origins(c:Catalog,lotId:number){const seen=new Set<number>(),farms=new Set<number>();const visit=(id:number)=>{if(seen.has(id))return;seen.add(id);const l=c.lots.find(l=>l.id===id);if(l?.farm_id)farms.add(l.farm_id);c.inputs.filter(x=>x.output_lot_id===id).forEach(x=>visit(x.input_lot_id));};visit(lotId);return [...farms];}
export function resolveReport(c:Catalog,storeId:number,report:string,x:Extraction){
 const code=x.lotCode?.toUpperCase();const lot=c.lots.find(l=>l.lot_code.toUpperCase()===code);
 if(!code||!hasExactIdentifier(report,code)||!lot)return {status:'needs_records',reason:'Lot must appear literally in the report and exist in the database.',lotId:null};
 const linked=c.inventory.some(i=>i.store_id===storeId&&i.lot_id===lot.id)||c.shipments.some(s=>s.to_store_id===storeId&&s.lot_id===lot.id&&s.status==='delivered');
 if(!linked)return {status:'needs_records',reason:'No recorded inventory or delivered shipment connects this lot to the selected store.',lotId:null};
 return {status:'investigating',reason:'Lot/store records verified. A customer report is not contamination evidence.',lotId:lot.id};
}
export function impactFor(c:Catalog,lotId:number){
 const affected=descendants(c,[lotId]),lot=c.lots.find(l=>l.id===lotId);if(!lot)throw new Error('Unknown lot');
 const product=c.products.find(p=>p.id===lot.product_id)!;
 const inbound=c.shipments.filter(s=>affected.has(s.lot_id)&&s.to_store_id&&['planned','scheduled','in_transit'].includes(s.status));
 const targets=c.stores.map(st=>{const stock=c.inventory.filter(i=>i.store_id===st.id&&affected.has(i.lot_id)).reduce((n,i)=>n+i.quantity,0);const incoming=inbound.filter(s=>s.to_store_id===st.id).reduce((n,s)=>n+s.quantity,0);return {...st,heldUnits:stock,inboundUnits:incoming,needUnits:stock+incoming};}).filter(st=>st.needUnits>0);
 return {product,lot,affectedLotIds:[...affected],affectedLots:c.lots.filter(l=>affected.has(l.id)),originFarms:c.farms.filter(f=>origins(c,lotId).includes(f.id)),targets,heldUnits:targets.reduce((n,s)=>n+s.heldUnits,0),inboundUnits:targets.reduce((n,s)=>n+s.inboundUnits,0),stockValue:targets.reduce((n,s)=>n+s.heldUnits,0)*product.unitCost};
}
export function eligibleOffers(c:Catalog,lotId:number,conditions:Conditions,at=new Date().toISOString()){
 const impact=impactFor(c,lotId),unsafe=descendants(c,c.lots.filter(l=>l.safety_status!=='released').map(l=>l.id));
 const affected=new Set(impact.affectedLotIds);
 return c.offers.filter(o=>o.product_id===impact.product.id).map(o=>{
  const lot=c.lots.find(l=>l.id===o.lotId),reasons:string[]=[];
  if(!lot||lot.product_id!==impact.product.id)reasons.push('Missing exact-product lot');
  if(!lot||lot.safety_status!=='released'||unsafe.has(o.lotId)||affected.has(o.lotId)||o.safety_status!=='released')reasons.push('Lot, ancestor, or offer is held/unverified');
  if(!lot?.expires_on||lot.expires_on<at.slice(0,10))reasons.push('Lot expired or expiry missing');
  if(o.approval_status!=='approved_mock'||o.coldChain!=='verified_mock')reasons.push('Supplier approval or cold-chain evidence missing');
  if(lot&&!origins(c,lot.id).includes(o.farm_id))reasons.push('Lot provenance does not match this supplier');
  if(conditions.blockedSupplierIds.includes(o.farm_id))reasons.push('Operator marked supplier unavailable');
  const available=Math.min(o.available_units,...conditions.capacityLimits.filter(x=>x.supplierId===o.farm_id).map(x=>x.availableUnits));
  if(!available)reasons.push('No available stock');
  return {...o,farm:c.farms.find(f=>f.id===o.farm_id)!,lotCode:lot?.lot_code||'',available,eligible:!reasons.length,reasons};
 });
}
export function eligibleTransfers(c:Catalog,lotId:number,conditions:Conditions,at=new Date().toISOString()){
 if(!conditions.allowStoreTransfers)return [];
 const impact=impactFor(c,lotId),affectedStores=new Set(impact.targets.map(s=>s.id));
 const unsafe=descendants(c,c.lots.filter(l=>l.safety_status!=='released').map(l=>l.id));
 return c.stores.filter(st=>!affectedStores.has(st.id)).flatMap(st=>{
  const rows=c.inventory.filter(i=>i.store_id===st.id).map(i=>({i,lot:c.lots.find(l=>l.id===i.lot_id)})).filter(({i,lot})=>lot?.product_id===impact.product.id&&lot.safety_status==='released'&&!unsafe.has(lot.id)&&!!lot.expires_on&&lot.expires_on>=at.slice(0,10)&&['verified','verified_mock'].includes(i.cold_chain_status));
  const reserve=c.demand.find(d=>d.storeId===st.id&&d.productId===impact.product.id)?.reserveUnits;
  if(reserve===undefined)return [];
  const onHand=rows.reduce((n,{i})=>n+Math.max(0,i.quantity-i.reserved_quantity),0);let spare=Math.max(0,onHand-reserve);
  return rows.flatMap(({i,lot})=>{const available=Math.min(spare,Math.max(0,i.quantity-i.reserved_quantity));spare-=available;if(!available)return [];
   return [{id:`store:${st.id}:lot:${lot!.id}`,sourceStoreId:st.id,store:st,lotId:lot!.id,lotCode:lot!.lot_code,available,reserveUnits:reserve,safeUnreservedUnits:onHand}];
  });
 });
}
// Supplier offers and safe store surpluses compete in the same capacitated flow.
export function planIncident(c:Catalog,lotId:number,conditions:Conditions,at=new Date().toISOString()){
 conditions=planConditions.parse(conditions);
 const impact=impactFor(c,lotId),offers=eligibleOffers(c,lotId,conditions,at),transferSources=eligibleTransfers(c,lotId,conditions,at),sources:any[]=[...offers.filter(o=>o.eligible).map(o=>({...o,sourceType:'supplier',sourceKey:'supplier:'+o.id})),...transferSources.map(o=>({...o,sourceType:'store',sourceKey:o.id}))],targets=impact.targets;
 type Edge={to:number;rev:number;cap:number;cost:number;initial:number};
 const sink=sources.length+targets.length+1,source=sink-1,n=sink+1,g:Edge[][]=Array.from({length:n},()=>[]);
 // Sources [0,m), targets [m,m+k), super source m+k, sink m+k+1.
 const add=(a:number,b:number,q:number,cost:number)=>{const e={to:b,rev:g[b].length,cap:q,cost,initial:q};g[a].push(e);g[b].push({to:a,rev:g[a].length-1,cap:0,cost:-cost,initial:0});return e;};
 const priorityIds=new Set(conditions.priorityStoreIds);
 if([...priorityIds].some(id=>!targets.some(t=>t.id===id)))throw new Error('Priority stores must be affected stores in this incident');
 const requiredUnits=targets.reduce((n,t)=>n+t.needUnits,0);
 sources.forEach((s,i)=>add(source,i,s.available,0));
 targets.forEach((t,j)=>{add(sources.length+j,sink,t.needUnits,0);if(!priorityIds.size)add(source,sources.length+j,t.needUnits,1e10);});
 const refs=sources.flatMap((s,i)=>targets.flatMap((t,j)=>{
  const transfer=s.sourceType==='store';
  if(transfer&&(s.store.chain!==t.chain||s.sourceStoreId===t.id))return [];
  const r=transfer?storeRoads.find(r=>r.fromStoreId===s.sourceStoreId&&r.toStoreId===t.id):c.routes.find(r=>r.supplierId===s.farm_id&&r.storeId===t.id);
  const originCity=transfer?s.store.city:s.farm.city;
  const multiplier=Math.max(conditions.trafficMultiplier,...conditions.regionalTraffic.filter(x=>(trafficRegions[x.region] as readonly string[]).includes(originCity)||(trafficRegions[x.region] as readonly string[]).includes(t.city)).map(x=>x.multiplier));
  if(!r||r.distanceKm<=0||r.drivingMinutes<=0||transfer&&r.drivingMinutes*multiplier>conditions.maxTransferMinutes)return [];
  const etaMinutes=Math.ceil((transfer?20:s.processing_lead_hours*60)+r.drivingMinutes*multiplier),unitCost=(transfer?impact.product.unitCost:s.unit_cost_usd)+r.distanceKm*.04*impact.product.unitKg;
  const e=add(i,sources.length+j,Math.min(s.available,t.needUnits),Math.round((conditions.objective==='time'?etaMinutes:unitCost)*100));
  return [{e,s,t,r,etaMinutes,unitCost}];
 }));
 // Lexicographic priorities: total fulfilled packs, then priority-store packs, then route time/cost.
 if(priorityIds.size){const priorityPenalty=(requiredUnits+1)*(Math.max(0,...refs.map(x=>x.e.cost))+1),shortagePenalty=(requiredUnits+1)*priorityPenalty;
  if(!Number.isSafeInteger((shortagePenalty+priorityPenalty)*requiredUnits))throw new Error('Scenario exceeds safe optimizer numeric bounds');
  targets.forEach((t,j)=>add(source,sources.length+j,t.needUnits,shortagePenalty+(priorityIds.has(t.id)?priorityPenalty:0)));
 }
 let sent=0;while(sent<requiredUnits){const ds=Array(n).fill(Infinity),pn=Array(n).fill(-1),pe=Array(n).fill(-1);ds[source]=0;for(let k=0;k<n-1;k++){let changed=false;for(let a=0;a<n;a++)if(Number.isFinite(ds[a]))g[a].forEach((e,b)=>{if(e.cap>0&&ds[e.to]>ds[a]+e.cost){ds[e.to]=ds[a]+e.cost;pn[e.to]=a;pe[e.to]=b;changed=true;}});if(!changed)break;}if(!Number.isFinite(ds[sink]))break;let q=requiredUnits-sent;for(let v=sink;v!==source;v=pn[v])q=Math.min(q,g[pn[v]][pe[v]].cap);for(let v=sink;v!==source;v=pn[v]){const e=g[pn[v]][pe[v]];e.cap-=q;g[v][e.rev].cap+=q;}sent+=q;}
 const allocations=refs.filter(x=>x.e.initial>x.e.cap).map(x=>({sourceType:x.s.sourceType,sourceKey:x.s.sourceKey,sourceStoreId:x.s.sourceStoreId||null,supplierId:x.s.sourceType==='supplier'?x.s.farm_id:null,supplier:x.s.sourceType==='supplier'?x.s.farm.name:`Store #${x.s.sourceStoreId} · ${x.s.store.chain} ${x.s.store.city}`,lot:x.s.lotCode,storeId:x.t.id,store:x.t.name,units:x.e.initial-x.e.cap,etaMinutes:x.etaMinutes,distanceKm:x.r.distanceKm,cost:Math.round((x.e.initial-x.e.cap)*x.unitCost*100)/100}));
 const allocatedUnits=allocations.reduce((n,a)=>n+a.units,0);
 return {prioritySummary:{requiredUnits:targets.filter(t=>priorityIds.has(t.id)).reduce((n,t)=>n+t.needUnits,0),allocatedUnits:allocations.filter(a=>priorityIds.has(a.storeId)).reduce((n,a)=>n+a.units,0)},catalogVersion:c.version,conditions,product:impact.product,requiredUnits,allocatedUnits,unfilledUnits:requiredUnits-allocatedUnits,coverage:requiredUnits?100*allocatedUnits/requiredUnits:null,cost:Math.round(allocations.reduce((n,a)=>n+a.cost,0)),lastDeliveryMinutes:allocations.length?Math.max(...allocations.map(a=>a.etaMinutes)):null,allocations,offers,transferSources,supplierUnits:allocations.filter(a=>a.sourceType==='supplier').reduce((n,a)=>n+a.units,0),transferUnits:allocations.filter(a=>a.sourceType==='store').reduce((n,a)=>n+a.units,0),stores:targets.map(t=>({...t,receivedUnits:allocations.filter(a=>a.storeId===t.id).reduce((n,a)=>n+a.units,0)})),createdAt:at,disclosure:'Synthetic DB stock. Exact-product substitutes only. Road estimates plus supplier preparation; no live traffic, actual order, reservation or dispatch. Inbound and on-hand affected packs are separate replacement needs.'};
}

// Ignore unrelated catalog revisions only when every computed dependency still matches.
export function planIsCurrent(c:Catalog,lotId:number,plan:any){
 if(!plan)return false;
 const fresh=planIncident(c,lotId,plan.conditions);
 const fields=['product','requiredUnits','allocatedUnits','unfilledUnits','coverage','cost','lastDeliveryMinutes','allocations','offers','stores','transferSources'];
 return fields.every(k=>JSON.stringify((fresh as any)[k])===JSON.stringify(plan[k]??(k==='transferSources'?[]:undefined)));
}
