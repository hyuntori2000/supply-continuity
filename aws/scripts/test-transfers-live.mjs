import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const state=JSON.parse(readFileSync(new URL('../.local/deployment.json',import.meta.url),'utf8')),access=JSON.parse(readFileSync(new URL('../.local/access.json',import.meta.url),'utf8'));
async function call(path,body){const r=await fetch(state.apiUrl+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+access.accessCode,Origin:state.siteUrl,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});assert.ok(r.ok,`HTTP ${r.status}`);return r.json();}
const overview=await call('/api/continuity');const enabled={...overview.initial.scenario,enableStoreTransfers:true};
const base=await call('/api/continuity',{scenario:enabled});assert.equal(base.plan.transferKg,336);assert.equal(base.plan.supplierKg,884);
const outage=await call('/api/continuity',{scenario:{...enabled,closedFacilityIds:[5]}});assert.equal(outage.plan.unfilled,864);assert.equal(outage.plan.transferKg,116);
const job=await call('/api/agent',{message:'Enable same-chain retailer store transfers. Preserve all other scenario settings and optimize with protected donor stock.',scenario:overview.initial.scenario,source:overview.report});assert.ok(job.jobId);
let after=0;const events=[];let completed=false;
for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,2000));const p=await call(job.pollUrl+'?after='+after);events.push(...p.events);after=p.cursor;if(p.status==='failed')throw new Error(p.error);if(p.status==='completed'){completed=true;break;}}
assert.ok(completed,'Agent did not finish');const final=events.find(e=>e.type==='final');assert.ok(final,'No final plan');assert.equal(final.source,'amazon-bedrock');assert.equal(final.scenario.enableStoreTransfers,true);assert.ok(final.plan.transferKg>0);assert.ok(events.some(e=>e.type==='tool_result'&&e.name==='inspect_dependencies'&&e.output.storeTransfers.donors.length>0));
for(const d of final.plan.transferDonors.filter(d=>d.sentKg))assert.ok(d.remainingSafeKg>=d.minimumKeepKg);
const result={status:'passed',baseline:{storeKg:base.plan.transferKg,supplierKg:base.plan.supplierKg,cost:base.plan.cost,recoveryMinutes:base.plan.timing.recoveryMinutes},outage:{storeKg:outage.plan.transferKg,unfilled:outage.plan.unfilled},bedrock:{model:final.model,enabled:final.scenario.enableStoreTransfers,storeKg:final.plan.transferKg,tools:events.filter(e=>e.type==='tool_start').map(e=>e.name)}};
writeFileSync(new URL('../.local/transfers-test-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result,null,2));
