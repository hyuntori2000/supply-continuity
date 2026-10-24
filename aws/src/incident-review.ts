import {z} from 'zod';
import {planConditions,type Catalog,type Conditions,planIncident} from './incident-engine';

export const reviewSchema=z.object({
 verdict:z.enum(['consistent','revise','needs_clarification']),
 summary:z.string().min(1).max(600),
 findings:z.array(z.string().min(1).max(300)).max(6),
 revisedConditions:planConditions.nullable().default(null),
 amendmentEvidence:z.string().max(2000).nullable().default(null),
}).strict();

export function normalizeDisplayRequests(conditions:Conditions):Conditions {
 // These are unconditional dashboard outputs, never unsupported operations.
 const displayOnly=/^(show|display|report)( (the|any))?( remaining)? (shortage|shortages|unfilled demand|recovery coverage|coverage|allocation quantities|delivery estimates)\.?$/i;
 return {...conditions,unappliedRequests:conditions.unappliedRequests.filter(request=>!displayOnly.test(request.trim()))};
}

export function validateConditions(c:Catalog,lotId:number,conditions:Conditions){
 const product=c.lots.find(l=>l.id===lotId)?.product_id;
 if([...conditions.blockedSupplierIds,...conditions.capacityLimits.map(x=>x.supplierId)].some(id=>!c.offers.some(o=>o.farm_id===id&&o.product_id===product)))throw new Error('AI selected an unknown supplier; no proposal saved');
}

// One bounded revision, grounded in the latest operator instruction. Safety,
// stock, provenance and allocation quantities remain controlled by the engine.
export function applyPlanReview(c:Catalog,lotId:number,request:string,draft:Conditions,raw:unknown){
 const review=reviewSchema.parse(raw);
 if(review.verdict==='needs_clarification')throw new Error('Agent review needs clarification: '+review.summary);
 let conditions=draft;
 if(review.verdict==='revise'){
  const quote=review.amendmentEvidence?.trim();
  if(!review.revisedConditions)throw new Error('Review correction requires complete conditions.');
  const operationalFields=['objective','trafficMultiplier','blockedSupplierIds','capacityLimits'] as const;
  const operationalChange=operationalFields.some(key=>JSON.stringify(draft[key])!==JSON.stringify(review.revisedConditions![key]));
  if(operationalChange&&(!quote||quote.length<8||!request.toLowerCase().includes(quote.toLowerCase())))throw new Error('Review correction lacks a matching operator instruction. Clarify the request and retry.');
  // Descriptive metadata may be corrected without granting different stock,
  // routes, exclusions or optimization priorities.
  conditions=normalizeDisplayRequests(review.revisedConditions);
 }
 // Some models echo draft fields even for a consistent verdict. They are never
 // applied: only an explicit, grounded revise verdict can change conditions.
 validateConditions(c,lotId,conditions);
 const plan=planIncident(c,lotId,conditions);
 const total=plan.allocations.reduce((n,a)=>n+a.units,0);
 if(total!==plan.allocatedUnits||total+plan.unfilledUnits!==plan.requiredUnits)throw new Error('Allocation conservation check failed');
 for(const store of plan.stores)if(store.receivedUnits>store.needUnits)throw new Error('Store demand exceeded');
 for(const offer of plan.offers)if(plan.allocations.filter(a=>a.supplierId===offer.farm_id).reduce((n,a)=>n+a.units,0)>offer.available)throw new Error('Supplier capacity exceeded');
 return {plan,conditions,review,changed:JSON.stringify(conditions)!==JSON.stringify(draft)};
}

// Display text length must not turn a valid structured review into an outage.
// Operational constraints, verdict and quote evidence are never repaired here.
export function boundedReviewText(raw:any){
 if(!raw||typeof raw!=='object')return raw;
 const shorten=(value:any,max:number)=>typeof value==='string'&&value.length>max?value.slice(0,max-1)+'…':value;
 return {...raw,summary:shorten(raw.summary,600),findings:Array.isArray(raw.findings)?raw.findings.slice(0,6).map((v:any)=>shorten(v,300)):raw.findings};
}
