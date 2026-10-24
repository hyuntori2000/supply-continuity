import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
async function module(path){const r=await build({entryPoints:[new URL(path,import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',target:'node22'});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));}
const {initialCatalog,basicConditions,planIncident,trafficRegions,planIsCurrent}=await module('../src/incident-engine.ts');
const {expandNetwork}=await module('../src/network-expansion.ts');
const {calculateCandidates}=await module('../src/incident-suggestions.ts');
const {applyPlanReview,validateExplicitCeilings,enforceExplicitCeilings}=await module('../src/incident-review.ts');
const at='2026-10-24T12:00:00Z',c=expandNetwork(initialCatalog()),base={...basicConditions(),capacityLimits:[1,2,4].map(supplierId=>({supplierId,availableUnits:200}))};
test('regional delays affect endpoint trips only; global and regional factors do not multiply',()=>{
 const p=planIncident(c,8,{...base,trafficMultiplier:1.2,regionalTraffic:[{region:'North Bay',multiplier:2}]},at);
 let affected=0,other=0;
 for(const a of p.allocations){const f=c.farms.find(f=>f.id===a.supplierId),s=c.stores.find(s=>s.id===a.storeId),offer=c.offers.find(o=>o.farm_id===f.id&&o.product_id===2),route=c.routes.find(r=>r.supplierId===f.id&&r.storeId===s.id),north=[f.city,s.city].some(city=>trafficRegions['North Bay'].includes(city));north?affected++:other++;assert.equal(a.etaMinutes,Math.ceil(offer.processing_lead_hours*60+route.drivingMinutes*(north?2:1.2)));}
 assert.ok(affected&&other);assert.equal(p.allocatedUnits,600);
});
test('priority reallocates scarce stock without reducing total fulfillment, changing stock limits or inventing supply',()=>{
 for(const lotId of [3,8,13]){const cond={...basicConditions(),capacityLimits:c.offers.filter(o=>o.product_id===c.lots.find(l=>l.id===lotId).product_id).map(o=>({supplierId:o.farm_id,availableUnits:50}))};const b=planIncident(c,lotId,cond,at),target=b.stores.find(s=>s.receivedUnits<s.needUnits);assert.ok(target);const p=planIncident(c,lotId,{...cond,priorityStoreIds:[target.id]},at);assert.equal(p.allocatedUnits,b.allocatedUnits);assert.ok(p.stores.find(s=>s.id===target.id).receivedUnits>target.receivedUnits);assert.equal(p.prioritySummary.allocatedUnits,Math.min(target.needUnits,p.allocatedUnits));assert.equal(p.allocatedUnits+p.unfilledUnits,p.requiredUnits);for(const limit of cond.capacityLimits)assert.ok(p.allocations.filter(a=>a.supplierId===limit.supplierId).reduce((n,a)=>n+a.units,0)<=limit.availableUnits);}
});
test('unknown or unrelated priority stores are rejected and reviewer cannot add priority without operator evidence',()=>{
 assert.throws(()=>planIncident(c,8,{...base,priorityStoreIds:[999]},at),/Priority/);
 assert.throws(()=>applyPlanReview(c,8,'Preserve all conditions.',base,{verdict:'revise',summary:'Add priority',findings:[],revisedConditions:{...base,priorityStoreIds:[2]},amendmentEvidence:null}),/matching operator/);
});
test('AI alternatives retain traffic and priority and cannot recommend fewer priority packs',()=>{
 const cond={...base,priorityStoreIds:[2],regionalTraffic:[{region:'North Bay',multiplier:2}]};
 const r=calculateCandidates(c,8,cond,{proposals:[{title:'Transfers',rationale:'Safe donor surplus',allowStoreTransfers:true,maxTransferMinutes:90,objective:'cost'}]},at);const p=r.candidates[0];assert.deepEqual(p.conditions.priorityStoreIds,[2]);assert.deepEqual(p.conditions.regionalTraffic,cond.regionalTraffic);if(p.improves)assert.ok(p.metrics.priorityAllocated>=r.baseline.priorityAllocated);
});
test('saved older plans without new condition keys still revalidate with identical allocations',()=>{
 const old={...basicConditions()};delete old.priorityStoreIds;delete old.regionalTraffic;
 const p=planIncident(c,8,old);p.conditions=old;assert.equal(planIsCurrent(c,8,p),true);
});

test('explicit supplier letters cannot be confused with offer order',()=>{
 const message='Suppliers A, B and D can each supply at most 200 packs.';
 assert.throws(()=>validateExplicitCeilings(message,{...base,capacityLimits:[1,2,3].map(supplierId=>({supplierId,availableUnits:200}))}),/supplier D/);
 assert.doesNotThrow(()=>validateExplicitCeilings(message,base));
 assert.doesNotThrow(()=>validateExplicitCeilings('Suppliers B and E can each supply at most 50 packs.',{...base,capacityLimits:[2,5].map(supplierId=>({supplierId,availableUnits:50}))}));
});

test('literal ceilings override mistaken AI supplier binding but preserve other conditions',()=>{
 const bad={...base,capacityLimits:[1,2,3].map(supplierId=>({supplierId,availableUnits:200}))};
 const fixed=enforceExplicitCeilings('Suppliers A, B and D can each supply at most 200 packs.',bad);
 assert.equal(fixed.capacityLimits.find(x=>x.supplierId===4).availableUnits,200);assert.equal(fixed.allowStoreTransfers,bad.allowStoreTransfers);assert.equal(fixed.trafficMultiplier,bad.trafficMultiplier);assert.ok(!bad.capacityLimits.some(x=>x.supplierId===4));
});

test('review pass cannot undo a literal supplier ceiling even with a matching quote',()=>{
 const request='Suppliers A, B and D can each supply at most 200 packs.';
 const result=applyPlanReview(c,8,request,base,{verdict:'revise',summary:'Rebind suppliers',findings:[],revisedConditions:{...base,capacityLimits:[1,2,3].map(supplierId=>({supplierId,availableUnits:200}))},amendmentEvidence:request});
 assert.equal(result.plan.allocatedUnits,600);assert.equal(result.conditions.capacityLimits.find(x=>x.supplierId===4).availableUnits,200);
});
