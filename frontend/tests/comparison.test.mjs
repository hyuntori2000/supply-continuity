import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';

const engineUrl=new URL('../src/lib/continuity.ts',import.meta.url);
const js=ts.transpileModule(fs.readFileSync(engineUrl,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const module={exports:{}};
vm.runInNewContext(js,{module,exports:module.exports,require:createRequire(engineUrl),crypto,TextEncoder});
const {defaults,optimize}=module.exports;
const helper=ts.transpileModule(fs.readFileSync(new URL('../src/lib/plan-comparison.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {captureComparison,constraintChanges,sourceChanges,requiredTools,formatCoverage,coveragePercent,scenarioKey}=await import('data:text/javascript;base64,'+Buffer.from(helper).toString('base64'));
const initial=optimize(defaults),outage=optimize({...defaults,closedFacilityIds:[5]}),transfers=optimize({...defaults,closedFacilityIds:[5],enableStoreTransfers:true});
const evidence=plan=>requiredTools.map(name=>({name,output:name==='set_scenario'?{scenario:plan.scenario}:{}}));
const final=plan=>({source:'amazon-bedrock',model:'test-model',id:'test-plan',plan,scenario:plan.scenario});

test('live-style transfer comparison preserves the actual prior outage and source quantities',()=>{
 const c=captureComparison(outage,'Enable same-chain transfers',final(transfers),evidence(transfers));
 assert.ok(c);
 assert.equal(c.before.unfilled,980);assert.equal(c.after.unfilled,864);
 assert.equal(c.before.required,c.after.required);
 assert.equal(c.after.transferKg-c.before.transferKg,116);
 assert.deepEqual(constraintChanges(c.before,c.after),[{label:'Same-chain store transfers',before:'Disabled',after:'Enabled'}]);
 const changes=sourceChanges(c.before,c.after);
 assert.equal(changes.reduce((sum,row)=>sum+row.after-row.before,0),116);
 assert.equal(changes.length,2);
 assert.equal(c.after.timing.recoveryMinutes,null);
});
test('new disruption preserves changed demand and worsening shortages without inventing improvement',()=>{
 const c=captureComparison(initial,'Close Oakland',final(outage),evidence(outage));
 assert.equal(c.before.required,1220);assert.equal(c.after.required,1591);
 assert.ok(c.after.unfilled>c.before.unfilled);
 assert.deepEqual(constraintChanges(c.before,c.after),[{label:'Closed facilities',before:'None',after:'Oakland warehouse'}]);
 assert.equal(sourceChanges(c.before,c.after).reduce((sum,row)=>sum+row.after-row.before,0),outage.allocated-initial.allocated);
});
test('unchanged scenario and ordering are not represented as AI-added conditions',()=>{
 assert.equal(constraintChanges(initial,initial).length,0);
 assert.equal(sourceChanges(initial,initial).length,0);
 const a=optimize({...defaults,closedFacilityIds:[1,5]}),b=optimize({...defaults,closedFacilityIds:[5,1]});
 assert.equal(constraintChanges(a,b).length,0);
});
test('catalog results, incomplete tool runs and contradictory applied scenarios cannot claim Bedrock comparison',()=>{
 assert.equal(captureComparison(initial,'test',{...final(outage),source:'catalog'},evidence(outage)),null);
 assert.equal(captureComparison(initial,'test',final(outage),evidence(outage).slice(0,4)),null);
 assert.equal(captureComparison(initial,'test',final(outage),evidence(initial)),null);
 assert.equal(captureComparison(initial,'test',{...final(outage),scenario:initial.scenario},evidence(outage)),null);
});
test('comparison snapshots do not change when a later run mutates its inputs',()=>{
 const before=structuredClone(outage),after=structuredClone(transfers),tools=evidence(after);
 const c=captureComparison(before,'Transfer stock',final(after),tools);
 before.unfilled=1;after.unfilled=2;tools[3].output.scenario.enableStoreTransfers=false;
 assert.equal(c.before.unfilled,980);assert.equal(c.after.unfilled,864);
 assert.equal(c.after.scenario.enableStoreTransfers,true);
 assert.equal(c.tools[3].output.scenario.enableStoreTransfers,true);
});
test('regional delay, approved direct dispatch and stock ceilings appear as actual condition changes',()=>{
 const updated=optimize({...defaults,closedFacilityIds:[5],regionalTraffic:[{region:'north_bay',multiplier:1.5,assumed:true}],directDispatchSupplierIds:[4],supplierCapacityLimits:[{supplierId:4,availableKg:80}]});
 const rows=constraintChanges(outage,updated);
 assert.deepEqual(rows.map(r=>r.label),['Regional traffic','Approved direct dispatch','Spare-stock limits']);
 assert.match(rows[0].after,/North Bay ×1.5 \(assumed\)/);
 assert.match(rows[1].after,/D · Gilroy/);
 assert.match(rows[2].after,/80 kg/);
 assert.ok(captureComparison(outage,'Apply changes',final(updated),evidence(updated)));
 assert.equal(captureComparison(outage,'Apply changes',final(updated),evidence(outage)),null,'Applied tools must match new operational fields, not only legacy settings');
});

test('constrained-stock demo calculates a genuine gain without changing demand or supplier stock',async()=>{
 const demoJs=ts.transpileModule(fs.readFileSync(new URL('../src/lib/recovery-demo.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const {coverageDemoScenario:s,coverageDemoRequest}=await import('data:text/javascript;base64,'+Buffer.from(demoJs).toString('base64'));
 const a=optimize(s),b=optimize({...s,enableStoreTransfers:true});
 assert.equal(a.required,1220);assert.equal(b.required,a.required);
 assert.equal(a.allocated,732);assert.equal(b.allocated,1068);
 assert.equal(formatCoverage(a.allocated,a.required),'60.0%');
 assert.equal(formatCoverage(b.allocated,b.required),'87.5%');
 assert.equal(b.transferKg,336);assert.equal(b.unfilled,152);
 assert.equal(b.supplierKg,a.supplierKg);assert.equal(b.lateKg,82);
 assert.ok(coverageDemoRequest.includes('200 kg'));
 assert.deepEqual(constraintChanges(a,b).map(x=>x.label),['Same-chain store transfers']);
 for(const donor of b.transferDonors)assert.ok(!donor.sentKg||donor.remainingSafeKg>=donor.minimumKeepKg);
 assert.ok(!b.allocations.some(x=>['A','C'].includes(x.offerId)));
 assert.equal(formatCoverage(0,0),'N/A');assert.equal(coveragePercent(0,100),0);
 assert.notEqual(scenarioKey(s),scenarioKey(defaults));
 assert.ok(captureComparison(a,coverageDemoRequest,final(b),evidence(b)));
});

test('approval narrative uses the same coverage precision as the comparison',async()=>{
 const code=ts.transpileModule(fs.readFileSync(new URL('../src/lib/presentation.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const {narrative}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 assert.match(narrative({...initial,allocated:1068,required:1220,coverage:88}),/87\.5%/);
});
