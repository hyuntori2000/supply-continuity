import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
const path=new URL('../lib/continuity.ts',import.meta.url);const source=fs.readFileSync(path,'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const module={exports:{}};vm.runInNewContext(js,{module,exports:module.exports,require:createRequire(path),crypto,TextEncoder,console});
const {optimize,defaults,stressTest,catalogMatches,matchSchema,scenarioSchema,trace,fingerprint,incidentQueue}=module.exports;
const incidents=incidentQueue();
assert.deepEqual(Array.from(incidents,i=>i.code),['DEMO-E01','DEMO-E02','DEMO-E03']);
assert.deepEqual(Array.from(incidents,i=>i.priority),['P0','P1','Closed']);
assert.equal(incidents[0].inboundKg,367);
assert.equal(incidents[0].heldKg,1220);
assert.equal(incidents[1].evidence,'Lot testing pending');
assert.equal(incidents[1].recoverySupported,false);
assert.equal(incidents[2].heldKg+incidents[2].inboundKg,0);
let cases=0;
for(const closed of [[],[5],[1],[1,5]])for(const blocked of [[],[2],[6],[2,6],[2,4,6]])for(const objective of ['continuity','time','cost'])for(const trafficMultiplier of [1,2]){
 const p=optimize({...defaults,closedFacilityIds:closed,blockedSupplierIds:blocked,objective,trafficMultiplier});
 assert.equal(p.allocated+p.unfilled,p.required);
 assert.equal(p.allocated,p.allocations.reduce((n,a)=>n+a.kg,0));
 for(const s of p.suppliers){assert.ok(s.addedKg<=s.spareKg);if(!s.eligible)assert.equal(s.addedKg,0);}
 for(const d of p.stores){assert.equal(d.received+d.unfilled,d.need);assert.equal(d.received,d.allocations.reduce((n,a)=>n+a.kg,0));}
 for(const a of p.allocations){const s=p.suppliers.find(s=>s.id===a.offerId);assert.ok(s.eligible);assert.equal(a.physicalPacks*s.packKg,a.kg);assert.ok(a.distanceKm>0);assert.ok(Number.isInteger(a.physicalPacks));}
 assert.equal(p.onTimeKg+p.lateKg,p.allocated);assert.ok(!p.allocations.some(a=>['A','C'].includes(a.offerId)));cases++;
}
const base=optimize(defaults);assert.equal(base.required,1220);assert.equal(base.unfilled,0);assert.equal(base.timing.recoveryMinutes,base.timing.lastDeliveryMinutes+30);assert.equal(base.singleSupplierBaseline.allocated,0);
const closure=optimize({...defaults,closedFacilityIds:[5]});assert.equal(closure.required,1591);assert.equal(closure.allocated,611);assert.equal(closure.unfilled,980);assert.equal(closure.timing.recoveryMinutes,null);assert.ok(closure.allocations.every(a=>a.offerId==='F'));
const p0=closure.stores.filter(s=>s.priority==='P0');const p1Filled=closure.stores.filter(s=>s.priority==='P1').reduce((n,s)=>n+s.received,0);if(p0.some(s=>s.unfilled))assert.equal(p1Filled,0);
const allOff=optimize({...defaults,blockedSupplierIds:[2,4,6]});assert.equal(allOff.allocated,0);
const rejected=optimize(defaults,catalogMatches.map(m=>({...m,compatible:false})));assert.equal(rejected.allocated,0);
assert.equal(matchSchema.safeParse({matches:catalogMatches.map(m=>({...m,compatible:'false'}))}).success,false);
assert.equal(matchSchema.safeParse({matches:Array(5).fill(catalogMatches[0])}).success,false);
assert.equal(scenarioSchema.safeParse({...defaults,trafficMultiplier:0}).success,false);
assert.deepEqual(Array.from(trace().affectedLots,l=>l.id),[1,3]);
assert.equal(await fingerprint(base),await fingerprint(optimize(defaults)));
assert.notEqual(await fingerprint(base),await fingerprint(closure));
assert.ok(stressTest(defaults).every(s=>s.allocated+s.unfilled>=base.required));
const result={status:'passed',scenarioCases:cases,assertions:'Capacity conservation, no double allocation, exclusions, shared dependencies, normalized pack units, shortage priorities, incident triage order, recovery timing, schema validation, lot tracing and plan hash',baseline:{required:base.required,allocated:base.allocated,onTimeKg:base.onTimeKg,cost:base.cost},warehouseOutage:{required:closure.required,allocated:closure.allocated,unfilled:closure.unfilled}};
fs.writeFileSync(new URL('./engine-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
