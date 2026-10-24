import assert from 'node:assert/strict';
import fs from 'node:fs';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3200';
async function post(path,body){const r=await fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,200);return r;}
const overview=await(await fetch(base+'/api/continuity')).json();
const good=await(await post('/api/cases',{action:'submit',storeId:1,report:'Fictional QA report: I bought DEMO Romaine 1 kg lot DEMO-P1-BLEND-A and felt unwell. Please check this lot.'})).json();
assert.equal(good.status,'received');
const analyzed=await(await post('/api/cases',{action:'analyze',id:good.id})).json();assert.equal(analyzed.status,'linked');assert.equal(analyzed.extraction.lotCode,'DEMO-P1-BLEND-A');
const run=await post('/api/agent',{caseId:good.id,message:'Investigate this submitted case and generate a recovery plan.',scenario:overview.initial.scenario,source:'The server must use stored case evidence, not this client text.'});
const events=(await run.text()).trim().split('\n').map(JSON.parse);assert.ok(!events.some(e=>e.type==='error'),JSON.stringify(events.find(e=>e.type==='error')));const final=events.find(e=>e.type==='final');assert.ok(final);assert.equal(final.source,'amazon-bedrock');assert.equal(final.plan.unfilled,0);
const missing=await(await post('/api/cases',{action:'submit',storeId:1,report:'Fictional QA report: I bought some lettuce but I do not have a lot code. Please investigate.'})).json();
const unmatched=await(await post('/api/cases',{action:'analyze',id:missing.id})).json();assert.equal(unmatched.status,'needs_records');assert.equal(unmatched.extraction.lotCode,null);
const blocked=await post('/api/agent',{caseId:missing.id,message:'Generate a plan anyway.',scenario:overview.initial.scenario,source:overview.report});const rejection=(await blocked.text()).trim().split('\n').map(JSON.parse);assert.ok(rejection.some(e=>e.type==='error'));assert.ok(!rejection.some(e=>e.type==='final'));
const inbox=await(await fetch(base+'/api/cases')).json();assert.ok(inbox.cases.some(c=>c.id===good.id));
const result={status:'passed',testedAt:new Date().toISOString(),model:final.model,checks:['Report persisted before inference','Live Bedrock extraction','Exact lot/store evidence link','Stored case drives live recovery','Missing lot remains needs_records','Unmatched case cannot invoke recovery','Inbox survives independent read'],tools:events.filter(e=>e.type==='tool_start').map(e=>e.name),allocated:final.plan.allocated,unfilled:final.plan.unfilled};
fs.writeFileSync(new URL('./cases-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(result);
