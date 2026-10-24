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
 const sources=stage==='recovery'?catalog.farms.filter((f:any)=>allocations.some((a:any)=>a.supplierId===f.id)):stage==='original'&&baseline?baseline.sources.filter((f:any)=>stores.some((s:any)=>s.sourceIds.includes(f.id))):impact.originFarms;
 const unaffected=stage!=='original'&&baseline?baseline.stores.filter((s:any)=>!impact.targets.some((t:any)=>t.id===s.id)&&(chain==='All chains'||s.chain===chain)):[];
 return {stores,allocations,sources,unaffected,required:stores.reduce((n:number,s:any)=>n+s.needUnits,0),allocated:allocations.reduce((n:number,a:any)=>n+a.units,0),valid};
}
