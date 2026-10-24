import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {build} from 'esbuild';
const state=JSON.parse(readFileSync(new URL('../.local/deployment.json',import.meta.url),'utf8')),auth=JSON.parse(readFileSync(new URL('../.local/access.json',import.meta.url),'utf8'));
if(state.apiId==='vceh0xmua8'||state.functionName!=='supply-continuity-api')throw new Error('Isolated application only');
const bundled=await build({entryPoints:[new URL('../../frontend/src/lib/incident-view.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node'});
const {wildfireExample}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
async function request(body,path='/api/cases'){const r=await fetch(state.apiUrl+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+auth.accessCode,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const b=await r.json();if(!r.ok)throw new Error(b.error||'Request failed');return b;}
async function call(body){const r=await request(body);if(!r.jobId)return r;for(let i=0;i<100;i++){const b=await request(null,r.pollUrl);if(b.status==='completed')return b.result;if(b.status==='failed')throw new Error(b.error);await new Promise(r=>setTimeout(r,1500));}throw new Error('Timed out');}
let row=process.argv[2]?(await call({action:'workspace',id:process.argv[2]})).selected:await call({action:'new_report',storeId:2,report:'SYNTHETIC WILDFIRE QA: Existing held chicken lot DEMO-P2-BLEND-A requires replacement. Later this training exercise adds a wildfire dispatch outage. This is fictional; no new illness or real wildfire is asserted.'});
assert.match(row.report,/SYNTHETIC WILDFIRE QA/);const id=row.id;console.log(JSON.stringify({incidentId:id,step:'created'}));
if(!row.lotId)row=await call({action:'analyze_incident',id});assert.equal(row.lotId,8);
if(!row.evidence)row=await call({action:'record_evidence',id,kind:'precautionary_hold',reference:'SYNTHETIC WILDFIRE QA: Existing batch restriction reviewed for fictional recovery exercise; wildfire does not create a contamination finding.'});
row=await call({action:'plan_incident',id,message:'Suppliers A, B and D can each supply at most 200 packs. Disable store transfers, use traffic multiplier 1 and no regional traffic adjustments. Clear operational supplier exclusions, but preserve every lot safety restriction. Prioritize store #5. Minimize delivery time.'});
const baseline=row.plan;assert.equal(baseline.allocatedUnits,600);console.log(JSON.stringify({step:'baseline',packs:baseline.allocatedUnits}));
const ws=await call({action:'workspace',id}),example=wildfireExample(ws.catalog,ws.selected);assert.ok(example);
row=await call({action:'plan_incident',id,message:example.message});
assert.ok(row.plan.conditions.blockedSupplierIds.includes(example.supplierId));assert.equal(row.plan.conditions.allowStoreTransfers,false);assert.equal(row.plan.allocatedUnits,400);assert.ok(row.plan.allocations.every(a=>a.supplierId!==example.supplierId));assert.equal(row.plan.conditions.regionalTraffic.find(x=>x.region==='North Bay')?.multiplier,2);assert.deepEqual(row.plan.conditions.priorityStoreIds,[5]);
console.log(JSON.stringify({step:'wildfire',excluded:example.letter,packs:row.plan.allocatedUnits,coverage:row.plan.coverage}));
const result=await call({action:'suggest_incident',id,planId:row.plan.id});
const after=await call({action:'workspace',id});const suggestion=after.selected.specialSuggestion||result.specialSuggestion;assert.equal(suggestion.status,'offered');const picked=suggestion.candidates.find(c=>c.id===suggestion.candidateId);assert.ok(picked.improves);assert.equal(picked.metrics.allocatedUnits,788);assert.ok(picked.conditions.blockedSupplierIds.includes(example.supplierId));assert.equal(picked.conditions.allowStoreTransfers,true);assert.equal(after.selected.plan.id,row.plan.id);
writeFileSync(new URL('../.local/wildfire-live.json',import.meta.url),JSON.stringify({id,example,baseline,after:row.plan,suggestion},null,2),{mode:0o600});
console.log(JSON.stringify({step:'suggestion',incidentId:id,suggestionStatus:suggestion.status,candidates:suggestion.candidates?.map(c=>({id:c.id,metrics:c.metrics,improves:c.improves})),savedPlanUnchanged:after.selected.plan.id===row.plan.id}));
