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

export function networkProjection(catalog:any,incident:any,stage:string,chain:string){
 const impact=incident.impact,valid=!incidentMetrics(catalog,incident).stale;
 const stores=impact.targets.filter((s:any)=>chain==='All chains'||s.chain===chain);
 const ids=new Set(stores.map((s:any)=>s.id));
 const allocations=stage==='recovery'&&valid?(incident.plan?.allocations||[]).filter((a:any)=>ids.has(a.storeId)):[];
 const sources=stage==='recovery'?catalog.farms.filter((f:any)=>allocations.some((a:any)=>a.supplierId===f.id)):impact.originFarms;
 return {stores,allocations,sources,required:stores.reduce((n:number,s:any)=>n+s.needUnits,0),allocated:allocations.reduce((n:number,a:any)=>n+a.units,0),valid};
}
