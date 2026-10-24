import ts from 'typescript';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const state=JSON.parse(readFileSync(new URL('../.local/deployment.json',import.meta.url),'utf8'));
const {accessCode}=JSON.parse(readFileSync(new URL('../.local/access.json',import.meta.url),'utf8'));
if(state.apiId==='vceh0xmua8')throw new Error('Use the isolated demo API only');
async function call(path,body){const r=await fetch(state.apiUrl+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${accessCode}`,Origin:state.siteUrl,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const data=await r.json();assert.ok(r.ok,`${r.status}: ${JSON.stringify(data)}`);return data;}
const overview=await call('/api/continuity');
async function run(message,scenario){
 const job=await call('/api/agent',{message,scenario,source:overview.report});let after=0;const events=[];
 for(let i=0;i<120;i++){
  const p=await call(job.pollUrl+'?after='+after);events.push(...p.events);after=p.cursor;
  if(p.status==='failed')throw new Error(JSON.stringify({error:p.error,events:events.filter(e=>e.type==='error')}));
  if(p.status==='completed'){
   const final=events.find(e=>e.type==='final');assert.equal(final?.source,'amazon-bedrock');
   const applied=events.find(e=>e.type==='tool_result'&&e.name==='set_scenario').output;
   console.log(JSON.stringify({message,scenario:final.scenario,interpretation:applied.interpretation,allocated:final.plan.allocated,unfilled:final.plan.unfilled}));
   return {final,applied};
  }
  await new Promise(r=>setTimeout(r,1500));
 }
 throw new Error('Agent timeout');
}
const demoSource=readFileSync(new URL('../../frontend/src/lib/recovery-demo.ts',import.meta.url),'utf8');
const demoJs=ts.transpileModule(demoSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {coverageDemoScenario,coverageDemoRequest}=await import('data:text/javascript;base64,'+Buffer.from(demoJs).toString('base64'));
const before=await call('/api/continuity',{scenario:coverageDemoScenario});
assert.equal(before.plan.required,1220);assert.equal(before.plan.allocated,732);
const {final,applied}=await run(coverageDemoRequest,before.plan.scenario);
assert.equal(final.plan.required,before.plan.required);
assert.equal(final.scenario.enableStoreTransfers,true);
assert.deepEqual(final.scenario.supplierCapacityLimits,coverageDemoScenario.supplierCapacityLimits);
assert.equal(final.plan.allocated,1068);assert.equal(final.plan.transferKg,336);
assert.equal(final.plan.supplierKg,732);assert.equal(final.plan.unfilled,152);
assert.ok(!final.plan.allocations.some(a=>['A','C'].includes(a.offerId)));
assert.ok(final.plan.transferDonors.every(d=>!d.sentKg||d.remainingSafeKg>=d.minimumKeepKg));
const result={testedAt:new Date().toISOString(),status:'passed',model:final.model,request:coverageDemoRequest,appliedScenario:final.scenario,checks:['Actual live Bedrock tool chain','Same replacement demand and supplier ceilings','Donor protected stock and recall exclusions','Coverage derived from allocated kilograms'],before:{required:1220,allocated:732,coverage:60},after:{required:final.plan.required,allocated:final.plan.allocated,coverage:100*final.plan.allocated/final.plan.required,transferKg:final.plan.transferKg,unfilled:final.plan.unfilled,onTimeKg:final.plan.onTimeKg,lateKg:final.plan.lateKg}};
writeFileSync(new URL('../../docs/verification/coverage-demo.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log('Live coverage improvement acceptance checks passed.');
