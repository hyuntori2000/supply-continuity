import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const state=JSON.parse(readFileSync(new URL('../.local/deployment.json',import.meta.url),'utf8'));
const {accessCode}=JSON.parse(readFileSync(new URL('../.local/access.json',import.meta.url),'utf8'));
assert.equal(state.functionName,'supply-continuity-api');assert.notEqual(state.apiId,'vceh0xmua8');
async function request(body,path='/api/cases'){const r=await fetch(state.apiUrl+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${accessCode}`,Origin:state.siteUrl,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
async function call(body){const r=await request(body);if(!r.jobId)return r;for(let i=0;i<100;i++){const d=await request(null,r.pollUrl);if(d.status==='failed')throw new Error(d.error);if(d.status==='completed')return d.result;await new Promise(resolve=>setTimeout(resolve,1500));}throw new Error('Timed out');}
let row=process.argv[2]?(await call({action:'workspace',id:process.argv[2]})).selected:await call({action:'new_report',storeId:2,report:'SYNTHETIC CONTEXT QA: Please investigate DEMO Raw Chicken 1 kg, lot DEMO-P2-BLEND-A. This fictional report does not establish illness causation.'});
const id=row.id;console.log(JSON.stringify({incidentId:id}));
assert.match(row.report,/SYNTHETIC CONTEXT QA/);if(!row.lotId)row=await call({action:'analyze_incident',id});assert.equal(row.lotId,8);
if(!row.evidence)row=await call({action:'record_evidence',id,kind:'precautionary_hold',reference:'SYNTHETIC CONTEXT QA: Existing held batch and ancestry reviewed; demo hold only.'});
row=await call({action:'plan_incident',id,message:'For this synthetic scenario, suppliers A, B and D can each supply at most 200 packs. Disable store transfers. Minimize delivery time. Keep the traffic multiplier at 1 and all current safety restrictions.'});
const baseline=row.plan;assert.equal(baseline.allocatedUnits,600);
const target=[...baseline.stores].sort((a,b)=>(b.needUnits-b.receivedUnits)-(a.needUnits-a.receivedUnits))[0];
const prompt=`Traffic in North Bay makes driving take twice as long. Apply North Bay regional traffic at 2x, leaving the global multiplier at 1. Prioritize store #${target.id} (${target.chain}, ${target.city}) for scarce-stock allocation. Keep supplier A, B and D capped at 200 packs each, keep store transfers disabled and preserve safety restrictions.`;
console.log(JSON.stringify({prompt,previousPriorityUnits:target.receivedUnits,priorityNeed:target.needUnits}));
row=await call({action:'plan_incident',id,message:prompt});
assert.deepEqual(row.plan.conditions.regionalTraffic,[{region:'North Bay',multiplier:2}]);assert.deepEqual(row.plan.conditions.priorityStoreIds,[target.id]);assert.equal(row.plan.conditions.trafficMultiplier,1);assert.equal(row.plan.allocatedUnits,baseline.allocatedUnits);assert.ok(row.plan.prioritySummary.allocatedUnits>target.receivedUnits);
assert.equal((await call({action:'workspace',id})).selected.planCurrent,true);
writeFileSync(new URL('../.local/context-live.json',import.meta.url),JSON.stringify({id,prompt,target,baseline,after:row.plan},null,2));
console.log(JSON.stringify({incidentId:id,model:row.plan.model,conditions:row.plan.conditions,before:target.receivedUnits,after:row.plan.prioritySummary.allocatedUnits,need:row.plan.prioritySummary.requiredUnits,total:row.plan.allocatedUnits,previousEta:baseline.lastDeliveryMinutes,newEta:row.plan.lastDeliveryMinutes}));
