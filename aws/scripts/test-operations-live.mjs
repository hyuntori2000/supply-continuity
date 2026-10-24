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
const exact='there is a traffic in upper bay area and we found out only supply a has problem therefore we can directly get some suppply from d';
const first=await run(exact,{...overview.initial.scenario,closedFacilityIds:[5]});
assert.deepEqual(first.final.scenario.directDispatchSupplierIds,[4]);
assert.deepEqual(first.final.scenario.closedFacilityIds,[5]);
assert.deepEqual(first.final.scenario.blockedSupplierIds,[1]);
assert.ok(first.final.scenario.regionalTraffic.some(t=>t.region==='north_bay'&&t.multiplier===1.5&&t.assumed));
assert.equal(first.final.plan.suppliers.find(o=>o.id==='D').addedKg,320);
assert.equal(first.final.plan.suppliers.find(o=>o.id==='B').addedKg,0);
assert.equal(first.final.plan.suppliers.find(o=>o.id==='A').addedKg,0);
assert.ok(first.applied.interpretation.assumptions.length);
const second=await run('North Bay traffic has cleared. D has only 80 kg of uncommitted stock remaining. Keep Oakland closed and preserve the direct-dispatch option and other settings.',first.final.scenario);
assert.ok(second.final.scenario.regionalTraffic.every(t=>t.region!=='north_bay'||t.multiplier===1));
assert.ok(second.final.scenario.supplierCapacityLimits.some(l=>l.supplierId===4&&l.availableKg===80));
assert.equal(second.final.plan.suppliers.find(o=>o.id==='D').addedKg,80);
const unsupported=await run('Avoid Highway 101 specifically, and change Store A minimum inventory to 200 units of milk. Keep the existing supported scenario settings unchanged; tell me which requests cannot be applied.',second.final.scenario);
assert.ok(unsupported.applied.interpretation.unappliedRequests.length>=1);
assert.equal(unsupported.final.plan.suppliers.find(o=>o.id==='A').addedKg,0);
const result={status:'passed',testedAt:new Date().toISOString(),model:first.final.model,request:exact,checks:['Informal upper-Bay request maps to disclosed North Bay 1.5x assumption','D direct lane bypasses only Oakland handling','A recall and B dependency remain blocked','Follow-up clears regional traffic and reduces D spare stock to 80 kg','Unsupported highway and milk constraints are surfaced'],runs:[first,second,unsupported].map(({final,applied})=>({scenario:final.scenario,interpretation:applied.interpretation,allocated:final.plan.allocated,unfilled:final.plan.unfilled,lateKg:final.plan.lateKg,cost:final.plan.cost,suppliers:final.plan.suppliers.map(o=>({id:o.id,kg:o.addedKg,eligible:o.eligible,dispatchMode:o.dispatchMode}))}))};
writeFileSync(new URL('../.local/operations-test-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n',{mode:0o600});
console.log('Operational-language acceptance checks passed.');
