// All dashboard projections use the selected persisted incident, never the E01 engine.
export function incidentProduct(catalog:any, incident:any):number|null {
 return catalog?.lots.find((lot:any)=>lot.id===incident?.lotId)?.product_id ?? incident?.impact?.product?.id ?? null;
}
export function productIncidents(catalog:any, incidents:any[], productId:number|null) {
 return productId===null?incidents:incidents.filter(i=>incidentProduct(catalog,i)===productId);
}
export function incidentMetrics(catalog:any, incident:any) {
 const impact=incident?.impact, plan=incident?.plan;
 const mismatch=!!plan&&plan.product.id!==incidentProduct(catalog,incident);
 const stale=!!plan&&((incident.planCurrent===false||(incident.planCurrent===undefined&&plan.catalogVersion!==catalog.version))||mismatch);
 const usable=plan&&!stale?plan:null;
 return {stale,mismatch,required:impact?impact.heldUnits+impact.inboundUnits:null,
  allocated:usable?.allocatedUnits??null,coverage:usable?.coverage??null,
  unfilled:usable?.unfilledUnits??null,cost:usable?.cost??null,
  eta:usable?.lastDeliveryMinutes??null,stockValue:impact?.stockValue??null};
}
export function parseIncidentRoute(hash:string) {
 const match=hash.match(/^#incidents\/([a-f0-9-]{36})$/i);
 if(match)return {kind:'incident' as const,id:match[1]};
 const product=hash.match(/^#products\/(\d+)$/);
 if(product)return {kind:'product' as const,productId:Number(product[1])};
 return {kind:hash==='#incidents/new'?'new' as const:'default' as const};
}

// Reconstruct recorded distribution without pretending mixed-lot source shares are known.
export function productDistribution(catalog:any,productId:number){
 const lots=new Set(catalog.lots.filter((l:any)=>l.product_id===productId).map((l:any)=>l.id));
 const origin=(id:number,seen=new Set<number>()):number[]=>{if(seen.has(id))return [];seen.add(id);const lot=catalog.lots.find((l:any)=>l.id===id);return [...new Set<number>([...(lot?.farm_id?[lot.farm_id]:[]),...(catalog.inputs||[]).filter((x:any)=>x.output_lot_id===id).flatMap((x:any)=>origin(x.input_lot_id,seen))])];};
 const stores=catalog.stores.map((s:any)=>{const inventory=(catalog.inventory||[]).filter((i:any)=>i.store_id===s.id&&lots.has(i.lot_id)),inbound=(catalog.shipments||[]).filter((i:any)=>i.to_store_id===s.id&&lots.has(i.lot_id)&&['planned','scheduled','in_transit'].includes(i.status));
 const stock=inventory.reduce((n:number,i:any)=>n+i.quantity,0),incoming=inbound.reduce((n:number,i:any)=>n+i.quantity,0);
 return {...s,heldUnits:stock,inboundUnits:incoming,needUnits:stock+incoming,sourceIds:[...new Set<number>([...inventory,...inbound].flatMap((i:any)=>origin(i.lot_id)))]};}).filter((s:any)=>s.needUnits>0);
 return {stores,sources:catalog.farms.filter((f:any)=>stores.some((s:any)=>s.sourceIds.includes(f.id)))};
}
export function networkProjection(catalog:any,incident:any,stage:string,chain:string){
 const impact=incident.impact,valid=!incidentMetrics(catalog,incident).stale;
 const baseline=catalog.stores?productDistribution(catalog,impact.product?.id||incidentProduct(catalog,incident)):null;
 const allStores=stage==='original'&&baseline?baseline.stores:impact.targets;
 const stores=allStores.filter((s:any)=>chain==='All chains'||s.chain===chain);
 const ids=new Set(stores.map((s:any)=>s.id));
 const allocations=stage==='recovery'&&valid?(incident.plan?.allocations||[]).filter((a:any)=>ids.has(a.storeId)):[];
 const sources=stage==='recovery'?catalog.farms.filter((f:any)=>(catalog.offers||[]).some((o:any)=>o.product_id===impact.product?.id&&o.farm_id===f.id)||allocations.some((a:any)=>a.supplierId===f.id)):stage==='original'&&baseline?baseline.sources.filter((f:any)=>stores.some((s:any)=>s.sourceIds.includes(f.id))):impact.originFarms;
 const unaffected=stage!=='original'&&baseline?baseline.stores.filter((s:any)=>!impact.targets.some((t:any)=>t.id===s.id)&&(chain==='All chains'||s.chain===chain)):[];
 return {stores,allocations,sources,unaffected,required:stores.reduce((n:number,s:any)=>n+s.needUnits,0),allocated:allocations.reduce((n:number,a:any)=>n+a.units,0),valid};
}

export function incidentDisruption(catalog:any,incident:any){
 const seen=new Set<number>();
 const visit=(id:number)=>{if(seen.has(id))return;seen.add(id);(catalog.inputs||[]).filter((x:any)=>x.output_lot_id===id).forEach((x:any)=>visit(x.input_lot_id));};
 visit(incident.lotId);
 const upstream=catalog.lots.filter((l:any)=>seen.has(l.id));
 const restricted=upstream.filter((l:any)=>['hold','recalled'].includes(l.safety_status));
 const sourceIds=[...new Set<number>(restricted.filter((l:any)=>l.farm_id).map((l:any)=>l.farm_id))];
 return {restricted,sourceIds,recordedRestriction:restricted.length>0,lot:incident.impact.lot,stores:incident.impact.targets.length,units:incident.impact.heldUnits+incident.impact.inboundUnits};
}
export const supplierLetter=(id:number)=>id>=1&&id<=26?String.fromCharCode(64+id):String(id);

// A hypothetical second shock to the selected incident's recovery network.
// No inventory, safety status or plan is changed until the operator runs the agent.
export function wildfireExample(catalog:any,incident:any){
 const plan=incident?.plan;if(!plan||incidentMetrics(catalog,incident).stale)return null;
 const blocked=new Set<number>(plan.conditions?.blockedSupplierIds||[]);
 const totals=new Map<number,number>();
 for(const a of plan.allocations||[])if(a.sourceType!=='store'&&a.supplierId&&!blocked.has(a.supplierId))totals.set(a.supplierId,(totals.get(a.supplierId)||0)+a.units);
 const north=['Santa Rosa','Napa','Petaluma','San Rafael','Fairfield'];
 const choices=catalog.farms.filter((f:any)=>totals.has(f.id)).sort((a:any,b:any)=>Number(north.includes(b.city))-Number(north.includes(a.city))||(totals.get(b.id)!-totals.get(a.id)!)||a.id-b.id);
 const source=choices[0];if(!source)return null;
 const region=north.includes(source.city)?'North Bay':null;
 return {supplierId:source.id,letter:supplierLetter(source.id),city:source.city,previousUnits:totals.get(source.id),message:`SYNTHETIC WILDFIRE EXERCISE — not a real incident report. A wildfire evacuation has stopped dispatch at supplier ${supplierLetter(source.id)} (supplier ID ${source.id}, ${source.city}). Add supplier ID ${source.id} to blockedSupplierIds; retain every existing exclusion. ${region?'For this exercise, assume North Bay driving takes twice as long: set North Bay regional traffic to 2x, preserving other regional factors and the global factor.':'Preserve all current traffic assumptions.'} Preserve supplier stock ceilings, priority stores, the current store-transfer permission, and the current objective. Recalculate safe exact-product recovery using the remaining sources. Do not clear held lots or label additional food contaminated. Report any remaining shortage. These are simulated operator constraints, not a Google traffic or wildfire feed.`};
}
