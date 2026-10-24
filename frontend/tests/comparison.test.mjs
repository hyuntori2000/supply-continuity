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
const {captureComparison,constraintChanges,sourceChanges,requiredTools}=await import('data:text/javascript;base64,'+Buffer.from(helper).toString('base64'));
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
