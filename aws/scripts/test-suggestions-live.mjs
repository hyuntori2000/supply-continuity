import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const state=JSON.parse(readFileSync(new URL('../.local/deployment.json',import.meta.url),'utf8'));
const {accessCode}=JSON.parse(readFileSync(new URL('../.local/access.json',import.meta.url),'utf8'));
assert.equal(state.functionName,'supply-continuity-api');assert.notEqual(state.apiId,'vceh0xmua8');
async function request(body,path='/api/cases'){const r=await fetch(state.apiUrl+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${accessCode}`,Origin:state.siteUrl,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
async function call(body){const r=await request(body);if(!r.jobId)return r;for(let i=0;i<100;i++){const d=await request(null,r.pollUrl);if(d.status==='failed')throw new Error(d.error);if(d.status==='completed')return d.result;await new Promise(resolve=>setTimeout(resolve,1500));}throw new Error('Timed out');}
let row=await call({action:'new_report',storeId:2,report:'SYNTHETIC AI SUGGESTION QA: Please investigate DEMO Raw Chicken 1 kg, lot DEMO-P2-BLEND-A, bought at this store. This fictional report does not establish illness causation.'});
const id=row.id;console.log(JSON.stringify({incidentId:id}));
row=await call({action:'analyze_incident',id});assert.equal(row.lotId,8);
row=await call({action:'record_evidence',id,kind:'precautionary_hold',reference:'SYNTHETIC AI SUGGESTION QA: Existing held batch and recorded lot ancestry reviewed; precautionary demo hold only.'});
row=await call({action:'plan_incident',id,message:'For this synthetic scenario, suppliers A, B and D can each supply at most 200 packs. Disable store transfers. Minimize delivery time. Keep the traffic multiplier at 1 and all current safety restrictions.'});
assert.equal(row.plan.allocatedUnits,600);const baselineId=row.plan.id;
console.log(JSON.stringify({baseline:row.plan.coverage,planId:baselineId}));
row=await call({action:'suggest_incident',id,planId:baselineId});
const s=row.specialSuggestion,c=s.candidates.find(c=>c.id===s.candidateId);assert.ok(c,'Bedrock should find a useful donor option in this scenario');assert.ok(c.metrics.allocatedUnits>600);assert.equal(row.plan.id,baselineId);
const ws=await call({action:'workspace',id});assert.equal(ws.selected.plan.id,baselineId);assert.equal(ws.selected.specialSuggestion.id,s.id);
writeFileSync(new URL('../.local/suggestion-live.json',import.meta.url),JSON.stringify({id,baseline:row.plan,suggestion:s},null,2));
console.log(JSON.stringify({incidentId:id,model:s.model,baseline:s.baseline,recommended:c,reason:s.reason,tradeoff:s.tradeoff}));
