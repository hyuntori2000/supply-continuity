import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {handler} from '../dist/handler.mjs';
process.env.DEMO_ACCESS_HASH=createHash('sha256').update('test-team-code').digest('hex');process.env.ALLOWED_ORIGINS='https://team.example';process.env.TABLE_NAME='test-table';process.env.AWS_REGION='us-east-1';process.env.AWS_ACCESS_KEY_ID='TEST';process.env.AWS_SECRET_ACCESS_KEY='TEST';process.env.AWS_LAMBDA_FUNCTION_NAME='test-function';
const db=new Map();let calls=0;const originalFetch=globalThis.fetch;
const id=i=>i.pk.S+'|'+i.sk.S;
globalThis.fetch=async(input,init)=>{
 const req=input instanceof Request?input:new Request(input,init);calls++;const target=req.headers.get('x-amz-target')?.split('.').pop(),body=JSON.parse(await req.text());
 if(new URL(req.url).hostname.startsWith('lambda.'))return new Response('',{status:202});
 if(target==='PutItem'){const existing=db.get(id(body.Item));if(body.ConditionExpression==='attribute_not_exists(pk)'&&existing)return Response.json({__type:'ConditionalCheckFailedException'},{status:400});if(body.ConditionExpression==='#s = :q'&&existing?.status.S!=='queued')return Response.json({__type:'ConditionalCheckFailedException'},{status:400});db.set(id(body.Item),body.Item);return Response.json({});}
 if(target==='GetItem')return Response.json({Item:db.get(id(body.Key))});
 if(target==='Query'){let items=[...db.values()].filter(i=>i.pk.S===body.ExpressionAttributeValues[':pk'].S);if(body.IndexName)items.sort((a,b)=>b.created_at.S.localeCompare(a.created_at.S));else items=items.filter(i=>i.sk.S>body.ExpressionAttributeValues[':after'].S).sort((a,b)=>a.sk.S.localeCompare(b.sk.S));return Response.json({Items:items.slice(0,body.Limit)});}
 if(target==='TransactWriteItems'){for(const {Put:p}of body.TransactItems){if(p.ConditionExpression&&p.ConditionExpression.includes(':proposed')&&db.get(id(p.Item))?.status.S!=='proposed')return Response.json({__type:'TransactionCanceledException'},{status:400});}for(const {Put:p}of body.TransactItems)db.set(id(p.Item),p.Item);return Response.json({});}
 throw new Error('Unexpected AWS call '+target);
};
function event(path,method='GET',body,headers={}){return {rawPath:path,requestContext:{http:{method}},headers:{authorization:'Bearer test-team-code',origin:'https://team.example',...headers},body:body===undefined?undefined:JSON.stringify(body)};}
const parse=r=>JSON.parse(r.body);
test('unauthenticated and foreign-origin requests cannot invoke paid AI',async()=>{const before=calls;assert.equal((await handler(event('/api/agent','POST',{}, {authorization:''}))).statusCode,401);assert.equal((await handler(event('/api/agent','POST',{}, {origin:'https://foreign.example'}))).statusCode,403);assert.equal(calls,before);});
test('health is public and read-only, API returns real engine data',async()=>{assert.equal((await handler(event('/health','GET',undefined,{authorization:''}))).statusCode,200);const r=await handler(event('/api/continuity'));assert.equal(r.statusCode,200);assert.equal(parse(r).initial.allocated,1220);});
let plan;
test('plan persists and approval enforces hash + single terminal decision',async()=>{const overview=parse(await handler(event('/api/continuity')));plan=parse(await handler(event('/api/continuity','POST',{scenario:overview.initial.scenario})));assert.ok(plan.id);const base={action:'decide',id:plan.id,hash:plan.hash,decision:'approved',note:'Test approval',acknowledgeShortage:false};assert.equal((await handler(event('/api/workflow','POST',{...base,hash:'0'.repeat(64)}))).statusCode,409);assert.equal(parse(await handler(event('/api/workflow','POST',base))).status,'approved');assert.equal(parse(await handler(event('/api/workflow','POST',base))).idempotent,true);assert.equal((await handler(event('/api/workflow','POST',{...base,decision:'rejected'}))).statusCode,409);const h=parse(await handler(event('/api/workflow')));assert.equal(h.events.filter(e=>e.kind==='plan_approved').length,1);});
test('same-chain plan persists donor quantities and needs its own approval fingerprint',async()=>{
 const overview=parse(await handler(event('/api/continuity')));
 const result=parse(await handler(event('/api/continuity','POST',{scenario:{...overview.initial.scenario,enableStoreTransfers:true}})));
 assert.equal(result.plan.transferKg,336);assert.equal(result.plan.supplierKg,884);assert.notEqual(result.hash,plan.hash);
 for(const d of result.plan.transferDonors.filter(d=>d.sentKg))assert.ok(d.remainingSafeKg>=d.minimumKeepKg);
 const decision={action:'decide',id:result.id,hash:result.hash,decision:'approved',note:'Checked donor reserves',acknowledgeShortage:false};
 assert.equal((await handler(event('/api/workflow','POST',decision))).statusCode,200);
});
test('shortage approval requires explicit acknowledgement',async()=>{const overview=parse(await handler(event('/api/continuity')));const s={...overview.initial.scenario,closedFacilityIds:[5]};const p=parse(await handler(event('/api/continuity','POST',{scenario:s})));assert.ok(p.plan.unfilled>0);const decision={action:'decide',id:p.id,hash:p.hash,decision:'approved',note:'Shortage acknowledged',acknowledgeShortage:false};assert.equal(parse(await handler(event('/api/workflow','POST',decision))).error,'ACKNOWLEDGE_SHORTAGE');assert.equal((await handler(event('/api/workflow','POST',{...decision,acknowledgeShortage:true}))).statusCode,200);});
test('submitted cases survive subsequent requests; unknown stores rejected',async()=>{const r=await handler(event('/api/cases','POST',{action:'submit',storeId:1,report:'Synthetic report of romaine lot DEMO-P1-RAW-A.'}));assert.equal(r.statusCode,200);assert.ok(parse(await handler(event('/api/cases'))).cases.some(c=>c.id===parse(r).id));assert.equal((await handler(event('/api/cases','POST',{action:'submit',storeId:99,report:'Unknown store.'}))).statusCode,400);});
test('AI request is durably queued and polling never exposes submitted body',async()=>{const overview=parse(await handler(event('/api/continuity')));const r=await handler(event('/api/agent','POST',{message:'Investigate',source:overview.report,scenario:overview.initial.scenario}));assert.equal(r.statusCode,202);const job=parse(r);assert.ok(job.jobId);const poll=parse(await handler(event(job.pollUrl)));assert.equal(poll.status,'queued');assert.equal(poll.body,undefined);assert.equal(poll.cursor,0);});
test('only configured origin gets CORS response headers',async()=>{const allowed=await handler(event('/api/agent','OPTIONS'));assert.equal(allowed.headers['access-control-allow-origin'],'https://team.example');const denied=await handler(event('/api/agent','OPTIONS',undefined,{origin:'https://other.example'}));assert.equal(denied.statusCode,403);assert.equal(denied.headers['access-control-allow-origin'],undefined);});
test.after(()=>{globalThis.fetch=originalFetch;});
