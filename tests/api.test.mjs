import assert from 'node:assert/strict';
import fs from 'node:fs';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3200';
async function post(path,body,expected=200){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));return data;}
const scenario={closedFacilityIds:[5],blockedSupplierIds:[],objective:'continuity',trafficMultiplier:1};
const p=await post('/api/continuity',{scenario});assert.equal(p.plan.unfilled,980);assert.equal(p.status,'proposed');
const args={action:'decide',id:p.id,hash:p.hash,decision:'approved',note:'Automated QA: synthetic test plan',acknowledgeShortage:false};
await post('/api/workflow',args,409);await post('/api/workflow',{...args,hash:'0'.repeat(64),acknowledgeShortage:true},409);
const approved=await post('/api/workflow',{...args,acknowledgeShortage:true});assert.equal(approved.status,'approved');
const repeat=await post('/api/workflow',{...args,acknowledgeShortage:true});assert.equal(repeat.idempotent,true);
await post('/api/workflow',{...args,decision:'rejected',acknowledgeShortage:true},409);
const history=await(await fetch(base+'/api/workflow')).json();assert.equal(history.events.filter(e=>e.plan_id===p.id&&e.kind==='plan_approved').length,1);
const status=await(await fetch(base+'/api/agent')).json();if(!status.configured)await post('/api/agent',{message:'Investigate',scenario,source:'SYNTHETIC INCIDENT DEMO-E01 DEMO-P1-RAW-A'},503);
const noOrigin=await fetch(base+'/api/continuity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scenario})});assert.equal(noOrigin.status,403);
const result={status:'passed',checks:['DB-backed proposal','Shortage acknowledgement gate','Stale hash rejection','Approval persistence','Idempotent repeat','Conflicting decision blocked','Cross-origin mutation blocked'],liveBedrock:status.configured?'Credentials present; live verification separate':'Not run: awaiting user credentials'};fs.writeFileSync(new URL('./api-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(result);
