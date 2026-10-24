import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
async function module(path){const r=await build({entryPoints:[new URL(path,import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',target:'node22'});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));}
const {compareRecoveryMetrics,improvesRecovery,bestRecoveryIds}=await module('../../lib/recovery-priority.ts');
const {calculateCandidates,selectedCandidate}=await module('../src/incident-suggestions.ts');
const {validateTrafficChoice}=await module('../src/live-traffic.ts');
const {initialCatalog,basicConditions,planIncident}=await module('../src/incident-engine.ts');
const {expandNetwork}=await module('../src/network-expansion.ts');
const base={allocatedUnits:100,priorityAllocated:20,lastDeliveryMinutes:90,averageDeliveryMinutes:60,cost:1000};
test('cheaper but later is not an improvement; expensive faster recovery wins',()=>{
 assert.equal(improvesRecovery({...base,lastDeliveryMinutes:91,cost:1},base),false);
 assert.equal(improvesRecovery({...base,averageDeliveryMinutes:61,cost:1},base),false);
 assert.ok(improvesRecovery({...base,lastDeliveryMinutes:89,cost:10000},base));
 assert.ok(improvesRecovery({...base,cost:999},base));
 assert.equal(improvesRecovery(base,base),false);
});
test('fulfilled packs and priority protection outrank time and money',()=>{
 assert.ok(improvesRecovery({...base,allocatedUnits:101,lastDeliveryMinutes:120,cost:10000},base));
 assert.equal(improvesRecovery({...base,allocatedUnits:99,lastDeliveryMinutes:1,cost:0},base),false);
 assert.equal(improvesRecovery({...base,priorityAllocated:19,allocatedUnits:101},base),false);
 assert.ok(improvesRecovery({...base,priorityAllocated:21,lastDeliveryMinutes:120},base));
});
test('last planned delivery outranks the average and cost',()=>{
 assert.ok(compareRecoveryMetrics({...base,lastDeliveryMinutes:89,averageDeliveryMinutes:70,cost:10000},base)<0);
 assert.ok(compareRecoveryMetrics({...base,lastDeliveryMinutes:91,averageDeliveryMinutes:20,cost:1},base)>0);
});
test('AI cannot pick a weaker improving alternative or invent a favorable tie',()=>{
 const candidates=[{id:'option-1',metrics:{...base,allocatedUnits:101},improves:true},{id:'option-2',metrics:{...base,allocatedUnits:102,cost:5000},improves:true}];
 const result={baseline:base,candidates};
 assert.throws(()=>selectedCandidate(result,{candidateId:'option-1',reason:'Cheaper',tradeoff:'One pack less'}),/priority/);
 assert.equal(selectedCandidate(result,{candidateId:'option-2',reason:'More recovery',tradeoff:'Costs more'}).candidate.id,'option-2');
 assert.deepEqual(bestRecoveryIds([...candidates,{...candidates[1],id:'tie'}]),['option-2','tie']);
});
test('traffic AI cannot use balanced tradeoff to bypass delivery-first policy',()=>{
 const candidates=[{id:'start-time',title:'Fast',waitMinutes:0,metrics:base},{id:'start-cost',title:'Cheap',waitMinutes:0,metrics:{...base,lastDeliveryMinutes:120,cost:1}}];
 for(const reasonCode of ['lower_cost','balanced_tradeoff'])assert.throws(()=>validateTrafficChoice(candidates,{candidateId:'start-cost',reasonCode}),/delivery-time priority/);
 assert.equal(validateTrafficChoice(candidates,{candidateId:'start-time',reasonCode:'earlier_delivery'}).candidateId,'start-time');
});
test('all three products: candidates preserve capacity, priority, outages and baseline across 36 scenarios',()=>{
 const c=expandNetwork(initialCatalog()),at='2026-10-24T12:00:00Z';let count=0;
 for(const lotId of [3,8,13])for(const cap of [50,200,500])for(const traffic of [1,2])for(const blocked of [false,true]){
  const product=c.lots.find(l=>l.id===lotId).product_id,ids=[...new Set(c.offers.filter(o=>o.product_id===product).map(o=>o.farm_id))];
  const conditions={...basicConditions(),trafficMultiplier:traffic,capacityLimits:ids.map(supplierId=>({supplierId,availableUnits:cap})),blockedSupplierIds:blocked?[ids[0]]:[]};
  const p=planIncident(c,lotId,conditions,at);conditions.priorityStoreIds=[p.stores[0].id];const before=JSON.stringify({c,conditions});
  const proposals=[90,180].map(maxTransferMinutes=>({title:'Test safe transfers',rationale:'Compare verified surplus',allowStoreTransfers:true,maxTransferMinutes,objective:'time'}));proposals.push({...proposals[0],objective:'cost'});
  const r=calculateCandidates(c,lotId,conditions,{proposals},at);
  for(const candidate of r.candidates){const plan=planIncident(c,lotId,candidate.conditions,at);assert.equal(plan.allocatedUnits+plan.unfilledUnits,plan.requiredUnits);assert.deepEqual(candidate.conditions.priorityStoreIds,conditions.priorityStoreIds);assert.deepEqual(candidate.conditions.blockedSupplierIds,conditions.blockedSupplierIds);assert.equal(candidate.improves,improvesRecovery(candidate.metrics,r.baseline));for(const id of ids)assert.ok(plan.allocations.filter(a=>a.supplierId===id).reduce((n,a)=>n+a.units,0)<=cap);assert.ok(plan.allocations.every(a=>!conditions.blockedSupplierIds.includes(a.supplierId)));}
  assert.equal(JSON.stringify({c,conditions}),before);count++;
 }
 assert.equal(count,36);
});
test('displayed recommendation cannot repeat AI arithmetic or direction errors',()=>{
 const result={baseline:base,candidates:[{id:'option-1',metrics:{...base,lastDeliveryMinutes:80,cost:1100},improves:true}]};
 const r=selectedCandidate(result,{candidateId:'option-1',reason:'Costs less and takes longer',tradeoff:'Free and instant'});
 assert.match(r.selection.reason,/90 to 80/);assert.match(r.selection.tradeoff,/\$1000 → \$1100/);assert.ok(!r.selection.reason.includes('Costs less'));
});
