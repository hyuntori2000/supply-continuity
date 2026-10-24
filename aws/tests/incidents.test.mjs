import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {handler} from '../dist/handler.mjs';
const result=await build({entryPoints:[new URL('../src/incident-engine.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',target:'node22'});
const {initialCatalog,resolveReport,impactFor,planIncident,basicConditions,eligibleOffers,descendants}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const date='2026-10-24T09:00:00Z';
test('database catalog fits one DynamoDB item and covers all three products',()=>{const c=initialCatalog();assert.ok(Buffer.byteLength(JSON.stringify(c))<350000);assert.equal(c.products.length,3);});
test('independent chicken and tomato incidents use their own lots, stores and safe sources',()=>{for(const lot of [8,13]){const c=initialCatalog(),impact=impactFor(c,lot),p=planIncident(c,lot,basicConditions(),date);assert.ok(impact.targets.length>0);assert.equal(p.product.id,lot===8?2:3);assert.ok(p.requiredUnits>0);assert.equal(p.requiredUnits,p.allocatedUnits+p.unfilledUnits);assert.ok(p.allocations.length);for(const a of p.allocations){assert.equal(c.lots.find(l=>l.lot_code===a.lot).product_id,p.product.id);assert.ok(!impact.affectedLots.some(l=>l.lot_code===a.lot));}assert.equal(impact.targets.reduce((n,s)=>n+s.needUnits,0),impact.heldUnits+impact.inboundUnits);}});
test('reports cannot invent a missing or lookalike lot or an unrelated store',()=>{const c=initialCatalog();assert.equal(resolveReport(c,1,'Unknown batch with symptoms.',{lotCode:'DEMO-P2-BLEND-A'}).status,'needs_records');assert.equal(resolveReport(c,1,'Batch DEMO-P2-BLEND-A-OTHER',{lotCode:'DEMO-P2-BLEND-A'}).status,'needs_records');assert.equal(resolveReport(c,999,'Batch DEMO-P2-BLEND-A',{lotCode:'DEMO-P2-BLEND-A'}).status,'needs_records');});
test('capacity, expired lots, provenance and unsafe ancestors cannot be bypassed by AI ceilings',()=>{
 const c=initialCatalog(),base=basicConditions();const offer=c.offers.find(o=>o.farm_id===4);offer.available_units=31;
 let p=planIncident(c,8,{...base,capacityLimits:[{supplierId:4,availableUnits:99999}]},date);assert.equal(p.allocatedUnits,31);
 assert.equal(planIncident(c,8,{...base,blockedSupplierIds:[4]},date).allocatedUnits,0);
 c.lots.find(l=>l.id===7).safety_status='hold';assert.equal(planIncident(c,8,base,date).allocatedUnits,0);
 c.lots.find(l=>l.id===7).safety_status='released';c.lots.find(l=>l.id===9).expires_on='2026-10-20';assert.equal(planIncident(c,8,base,date).allocatedUnits,0);
 c.lots.find(l=>l.id===9).expires_on='2026-10-29';offer.lotId=4;assert.equal(planIncident(c,8,base,date).allocatedUnits,0);
});
test('all products retain conservation across capacity and transport scenarios',()=>{for(const lot of [3,8,13])for(const stock of [0,50,500])for(const trafficMultiplier of [1,2,3]){const c=initialCatalog();c.offers.forEach(o=>o.available_units=stock);const p=planIncident(c,lot,{...basicConditions(),trafficMultiplier},date);assert.equal(p.allocatedUnits+p.unfilledUnits,p.requiredUnits);assert.equal(p.allocations.reduce((n,a)=>n+a.units,0),p.allocatedUnits);for(const o of p.offers)assert.ok(p.allocations.filter(a=>a.supplierId===o.farm_id).reduce((n,a)=>n+a.units,0)<=o.available);}});

process.env.DEMO_ACCESS_HASH=createHash('sha256').update('independent-test').digest('hex');process.env.ALLOWED_ORIGINS='https://independent.example';process.env.TABLE_NAME='test';process.env.AWS_REGION='us-east-1';process.env.AWS_ACCESS_KEY_ID='TEST';process.env.AWS_SECRET_ACCESS_KEY='TEST';process.env.AWS_LAMBDA_FUNCTION_NAME='test';
const originalFetch=globalThis.fetch,db=new Map(),workers=[];let extraction={product:'Chicken',lotCode:'DEMO-P2-BLEND-A',summary:'Fictional complaint; no causal finding.'},conditions=basicConditions();
const key=i=>i.pk.S+'|'+i.sk.S;
globalThis.fetch=async(input,init)=>{const req=input instanceof Request?input:new Request(input,init),host=new URL(req.url).hostname,b=JSON.parse(await req.text());
 if(host.startsWith('bedrock-runtime.')){const name=b.toolConfig.toolChoice.tool.name;return Response.json({output:{message:{content:[{toolUse:{name,input:name==='extract_report'?extraction:conditions}}]}}});}
 if(host.startsWith('lambda.')){workers.push(b);return new Response('',{status:202});}
 const action=req.headers.get('x-amz-target')?.split('.').pop();
 if(action==='GetItem')return Response.json({Item:db.get(key(b.Key))});
 if(action==='PutItem'){if(b.ConditionExpression==='attribute_not_exists(pk)'&&db.has(key(b.Item)))return Response.json({__type:'ConditionalCheckFailedException'},{status:400});db.set(key(b.Item),b.Item);return Response.json({});}
 if(action==='Query'){let rows=[...db.values()].filter(i=>i.pk.S===b.ExpressionAttributeValues[':pk'].S);if(b.IndexName)rows.sort((a,b)=>b.created_at.S.localeCompare(a.created_at.S));return Response.json({Items:rows.slice(0,b.Limit)});}
 if(action==='TransactWriteItems'){for(const t of b.TransactItems){const p=t.Put||t.ConditionCheck,k=key(p.Item||p.Key);if(p.ExpressionAttributeValues?.[':old']&&db.get(k)?.data.S!==p.ExpressionAttributeValues[':old'].S)return Response.json({__type:'TransactionCanceledException'},{status:400});}for(const t of b.TransactItems)if(t.Put)db.set(key(t.Put.Item),t.Put.Item);return Response.json({});}
 throw new Error('Unexpected '+action);
};
function event(body,path='/api/cases'){return {rawPath:path,requestContext:{http:{method:body?'POST':'GET'}},headers:{authorization:'Bearer independent-test',origin:'https://independent.example'},...(body?{body:JSON.stringify(body)}:{})};}
async function call(body){const r=await handler(event(body));assert.equal(r.statusCode,200,r.body);return JSON.parse(r.body);}
async function ai(body){const r=await handler(event(body));assert.equal(r.statusCode,202,r.body);const job=JSON.parse(r.body);await handler(workers.shift());const poll=JSON.parse((await handler(event(null,job.pollUrl))).body);assert.equal(poll.status,'completed',poll.error);return poll.result;}
let chicken;
test('fresh incident is persisted before inference, matched without E01, reviewed and planned',async()=>{
 const ws=await call({action:'workspace'}),storeId=ws.catalog.inventory.find(i=>i.lot_id===8).store_id;
 chicken=await call({action:'new_report',storeId,report:'Synthetic report about DEMO-P2-BLEND-A with possible symptoms.'});assert.equal(chicken.status,'reported');
 chicken=await ai({action:'analyze_incident',id:chicken.id});assert.equal(chicken.status,'investigating');assert.equal(chicken.lotId,8);
 const before=await handler(event({action:'record_evidence',id:chicken.id,kind:'positive_test',reference:'tiny'}));assert.equal(before.statusCode,400);
 chicken=await call({action:'record_evidence',id:chicken.id,kind:'precautionary_hold',reference:'Synthetic test hold pending records.'});
 chicken=await ai({action:'plan_incident',id:chicken.id,message:'Generate an exact product recovery plan.'});assert.equal(chicken.plan.product.id,2);assert.equal(chicken.plan.source,'amazon-bedrock');assert.ok(chicken.plan.allocatedUnits);
});
test('DB inventory changes are persisted and make old proposals unapprovable',async()=>{
 const ws=await call({action:'workspace',id:chicken.id});await call({action:'update_stock',offerId:4,availableUnits:50,expectedVersion:ws.catalog.version,reference:'Synthetic confirmed spare stock 50.'});
 const old=await handler(event({action:'decide_incident',id:chicken.id,planId:chicken.plan.id,decision:'approved',acknowledgeShortage:true,note:'Test approval'}));assert.equal(old.statusCode,400);assert.match(old.body,/changed/);
 chicken=await ai({action:'plan_incident',id:chicken.id,message:'Preserve conditions and recalculate.'});assert.equal(chicken.plan.allocatedUnits,50);assert.ok(chicken.plan.unfilledUnits);
 const missingAck=await handler(event({action:'decide_incident',id:chicken.id,planId:chicken.plan.id,decision:'approved',acknowledgeShortage:false,note:'Test approval'}));assert.equal(missingAck.statusCode,400);
 chicken=await call({action:'decide_incident',id:chicken.id,planId:chicken.plan.id,decision:'approved',acknowledgeShortage:true,note:'Reviewed shortage.'});assert.equal(chicken.plan.status,'approved');
 assert.equal((await call({action:'workspace',id:chicken.id})).selected.plan.status,'approved');
});
test('unregistered lot is pending until operator provenance is registered, never implicitly released',async()=>{
 extraction={product:'Tomatoes',lotCode:'DEMO-NEW-TOMATO-TEST',summary:'Synthetic complaint.'};let row=await call({action:'new_report',storeId:1,report:'Synthetic report for DEMO-NEW-TOMATO-TEST.'});row=await ai({action:'analyze_incident',id:row.id});assert.equal(row.status,'needs_records');
 const ws=await call({action:'workspace'});const registration=await call({action:'register_lot',code:extraction.lotCode,productId:3,farmId:5,storeId:1,quantity:95,expiresOn:'2099-10-29',reference:'Synthetic shipment record for test.',expectedVersion:ws.catalog.version});
 row=await ai({action:'analyze_incident',id:row.id});assert.equal(row.status,'investigating');assert.equal(row.lotId,registration.lotId);assert.equal(row.impact.heldUnits,95);
 assert.equal((await call({action:'workspace'})).catalog.lots.find(l=>l.id===row.lotId).safety_status,'unverified');
 row=await call({action:'record_evidence',id:row.id,kind:'precautionary_hold',reference:'Synthetic precautionary hold reference.'});row=await ai({action:'plan_incident',id:row.id,message:'Find an exact product replacement.'});assert.equal(row.plan.product.id,3);assert.equal(row.plan.requiredUnits,95);assert.equal(row.plan.allocatedUnits,95);
});
test.after(()=>{globalThis.fetch=originalFetch;});
