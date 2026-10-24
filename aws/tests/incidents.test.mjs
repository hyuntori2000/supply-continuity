import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {handler} from '../dist/handler.mjs';
const result=await build({entryPoints:[new URL('../src/incident-engine.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',target:'node22'});
const {initialCatalog,resolveReport,impactFor,planIncident,basicConditions,eligibleOffers,descendants,planIsCurrent}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
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
const originalFetch=globalThis.fetch,db=new Map(),workers=[];let extraction={product:'Chicken',lotCode:'DEMO-P2-BLEND-A',summary:'Fictional complaint; no causal finding.'},conditions=basicConditions(),reviewOverride=null,lastInterpretation=null;
const key=i=>i.pk.S+'|'+i.sk.S;
globalThis.fetch=async(input,init)=>{const req=input instanceof Request?input:new Request(input,init),host=new URL(req.url).hostname,b=JSON.parse(await req.text());
 if(host.startsWith('bedrock-runtime.')){const name=b.toolConfig.toolChoice.tool.name;if(name==='apply_recovery_conditions')lastInterpretation=JSON.parse(b.messages[0].content[0].text);return Response.json({output:{message:{content:[{toolUse:{name,input:name==='explore_recovery_alternatives'?{proposals:[{title:'Safe store surplus',rationale:'Reduce unmet demand',allowStoreTransfers:true,maxTransferMinutes:90,objective:'time'}]}:name==='select_recovery_alternative'?{candidateId:'option-1',reason:'More verified packs',tradeoff:'Needs transfer permission'}:name==='extract_report'?extraction:name==='review_recovery_plan'?(reviewOverride||{verdict:'consistent',summary:'The draft follows the operator request.',findings:['Stock limits and remaining shortage checked.'],revisedConditions:null,amendmentEvidence:null}):conditions}}]}}});}
 if(host.startsWith('lambda.')){workers.push(b);return new Response('',{status:202});}
 const action=req.headers.get('x-amz-target')?.split('.').pop();
 if(action==='GetItem')return Response.json({Item:db.get(key(b.Key))});
 if(action==='PutItem'){if(b.ConditionExpression==='attribute_not_exists(pk)'&&db.has(key(b.Item)))return Response.json({__type:'ConditionalCheckFailedException'},{status:400});db.set(key(b.Item),b.Item);return Response.json({});}
 if(action==='Query'){let rows=[...db.values()].filter(i=>i.pk.S===b.ExpressionAttributeValues[':pk'].S);if(b.IndexName)rows.sort((a,b)=>b.created_at.S.localeCompare(a.created_at.S));return Response.json({Items:rows.slice(0,b.Limit)});}
 if(action==='TransactWriteItems'){for(const t of b.TransactItems){const p=t.Put||t.ConditionCheck,k=key(p.Item||p.Key);if(p.ConditionExpression==='attribute_not_exists(pk)'&&db.has(k))return Response.json({__type:'TransactionCanceledException'},{status:400});if(p.ExpressionAttributeValues?.[':old']&&db.get(k)?.data.S!==p.ExpressionAttributeValues[':old'].S)return Response.json({__type:'TransactionCanceledException'},{status:400});}for(const t of b.TransactItems)if(t.Put)db.set(key(t.Put.Item),t.Put.Item);return Response.json({});}
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
 chicken=await ai({action:'plan_incident',id:chicken.id,message:'Generate an exact product recovery plan.'});assert.equal(chicken.plan.product.id,2);assert.equal(chicken.plan.source,'amazon-bedrock');assert.ok(chicken.plan.allocatedUnits);assert.equal(chicken.planAudit.reflection.reviewCalls,1);assert.equal(chicken.planAudit.reflection.revisionApplied,false);
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
test('bounded reviewer corrects a missed request limit using the same engine and persists it',async()=>{
 const message='Limit Supplier D to 25 units for this incident.';
 reviewOverride={verdict:'revise',summary:'The draft missed the requested 25-unit ceiling.',findings:['Correction honors the operator limit; shortage remains.'],revisedConditions:{...basicConditions(),capacityLimits:[{supplierId:4,availableUnits:25}]},amendmentEvidence:message};
 const corrected=await ai({action:'plan_incident',id:chicken.id,message});
 assert.equal(corrected.plan.allocatedUnits,25);assert.equal(corrected.planAudit.reflection.draft.allocatedUnits,50);
 assert.equal(corrected.planAudit.reflection.revisionApplied,true);assert.equal(corrected.planAudit.reflection.recalculationCount,1);
 const reread=await call({action:'workspace',id:chicken.id});assert.equal(reread.selected.plan.id,corrected.plan.id);assert.equal(reread.selected.plan.allocatedUnits,25);
 const before=JSON.stringify(reread.selected.plan);
 reviewOverride={...reviewOverride,amendmentEvidence:'Invented instruction not supplied by the operator.'};
 const r=await handler(event({action:'plan_incident',id:chicken.id,message}));const job=JSON.parse(r.body);await handler(workers.shift());const poll=JSON.parse((await handler(event(null,job.pollUrl))).body);
 assert.equal(poll.status,'failed');assert.match(poll.error,/matching operator instruction/);assert.equal(JSON.stringify((await call({action:'workspace',id:chicken.id})).selected.plan),before);
 reviewOverride=null;
});
test('supported shortage display is not mislabeled as an unapplied operation',async()=>{
 conditions={...basicConditions(),unappliedRequests:['Show remaining shortage','Avoid Highway 101']};
 const row=await ai({action:'plan_incident',id:chicken.id,message:'Show remaining shortage and avoid Highway 101.'});
 assert.deepEqual(row.plan.conditions.unappliedRequests,['Avoid Highway 101']);assert.equal(row.plan.unfilledUnits,row.plan.requiredUnits-row.plan.allocatedUnits);conditions=basicConditions();
});
test('consistent reviewer cannot change constraints through an echoed suggestion',async()=>{
 reviewOverride={verdict:'consistent',summary:'Existing constraints are consistent.',findings:[],revisedConditions:{...basicConditions(),capacityLimits:[{supplierId:4,availableUnits:0}]},amendmentEvidence:null};
 const row=await ai({action:'plan_incident',id:chicken.id,message:'Use the recorded available supply.'});
 assert.equal(row.plan.allocatedUnits,50);assert.equal(row.planAudit.reflection.revisionApplied,false);reviewOverride=null;
});
test('review requiring clarification cannot silently replace the saved plan',async()=>{
 reviewOverride={verdict:'needs_clarification',summary:'Specify whether the ceiling applies to Supplier C or D.',findings:[],revisedConditions:null,amendmentEvidence:null};
 const previous=(await call({action:'workspace',id:chicken.id})).selected.plan.id;
 const r=await handler(event({action:'plan_incident',id:chicken.id,message:'Set that supplier to 10 units.'}));const job=JSON.parse(r.body);await handler(workers.shift());const poll=JSON.parse((await handler(event(null,job.pollUrl))).body);
 assert.equal(poll.status,'failed');assert.match(poll.error,/needs clarification/);assert.equal((await call({action:'workspace',id:chicken.id})).selected.plan.id,previous);
 reviewOverride=null;
});
test('another report for an already-held lot does not invalidate unrelated saved plans',async()=>{
 extraction={product:'Chicken',lotCode:'DEMO-P2-BLEND-A',summary:'Synthetic follow-up report.'};
 const ws=await call({action:'workspace'}),storeId=ws.catalog.inventory.find(i=>i.lot_id===8).store_id;
 let row=await call({action:'new_report',storeId,report:'Synthetic second report for DEMO-P2-BLEND-A.'});
 row=await ai({action:'analyze_incident',id:row.id});await call({action:'record_evidence',id:row.id,kind:'precautionary_hold',reference:'Synthetic review of the already-held batch.'});
 assert.equal((await call({action:'workspace'})).catalog.version,ws.catalog.version);
});
test.after(()=>{globalThis.fetch=originalFetch;});
test('unrelated product changes do not invalidate a plan, relevant supply changes do',()=>{
 const c=initialCatalog(),p=planIncident(c,13,basicConditions());c.version++;
 c.offers.find(o=>o.product_id===2).available_units=1;
 assert.equal(planIsCurrent(c,13,p),true);
 c.offers.find(o=>o.product_id===3&&o.farm_id===6).available_units=1;
 assert.equal(planIsCurrent(c,13,p),false);
});
test('plan versions persist separately, branch from older conditions and reject cross-incident bases',async()=>{
 const before=await call({action:'workspace',id:chicken.id}),older=before.versions.find(v=>v.allocatedUnits===25);
 assert.ok(older);const original=await call({action:'workspace',id:chicken.id,planId:older.id});
 const immutable=JSON.stringify(original.selectedVersion);
 conditions=original.selectedVersion.plan.conditions;
 const row=await ai({action:'plan_incident',id:chicken.id,basePlanId:older.id,message:'Keep the selected version conditions and recalculate.'});
 assert.equal(row.parentPlanId,older.id);assert.equal(row.plan.allocatedUnits,25);assert.notEqual(row.plan.id,older.id);
 const after=await call({action:'workspace',id:chicken.id,planId:older.id});
 assert.equal(JSON.stringify(after.selectedVersion),immutable);assert.equal(after.versions.length,before.versions.length+1);
 assert.equal(after.versions.filter(v=>v.current).length,1);
 const foreign=await call({action:'new_report',storeId:1,report:'Synthetic unrelated case used to verify isolation.'});
 const cross=await handler(event({action:'workspace',id:foreign.id,planId:older.id}));assert.equal(cross.statusCode,400);
 const existing=after.selected.plan.id,foreignId=crypto.randomUUID();
 const r=await handler(event({action:'plan_incident',id:chicken.id,basePlanId:foreignId,message:'Use the provided starting point.'}));const job=JSON.parse(r.body);await handler(workers.shift());const poll=JSON.parse((await handler(event(null,job.pollUrl))).body);
 assert.equal(poll.status,'failed');assert.match(poll.error,/does not belong/);assert.equal((await call({action:'workspace',id:chicken.id})).selected.plan.id,existing);
 conditions=basicConditions();
});
test('review may clean descriptive metadata without changing operational constraints',async()=>{
 conditions={...basicConditions(),unappliedRequests:['Old unsupported instruction']};
 reviewOverride={verdict:'revise',summary:'Remove a historical unsupported-request label.',findings:[],revisedConditions:basicConditions(),amendmentEvidence:null};
 const row=await ai({action:'plan_incident',id:chicken.id,message:'Generate a safe recovery plan.'});
 assert.equal(row.plan.allocatedUnits,50);assert.deepEqual(row.plan.conditions.unappliedRequests,[]);
 conditions=basicConditions();reviewOverride=null;
});

test('replanning inherits numeric conditions but discards contradictory historical narrative',async()=>{
 const stored=db.get('INCIDENT|'+chicken.id),row=JSON.parse(stored.data.S);
 row.plan.conditions.assumptions=['Assuming 1.5 delay although the numeric multiplier is 1.'];
 row.plan.conditions.unappliedRequests=['An old unrelated request'];
 db.set('INCIDENT|'+chicken.id,{...stored,data:{S:JSON.stringify(row)}});
 await ai({action:'plan_incident',id:chicken.id,message:'Generate a recovery plan minimizing delivery time.'});
 assert.equal(lastInterpretation.currentConditions.trafficMultiplier,1);
 assert.deepEqual(lastInterpretation.currentConditions.assumptions,[]);
 assert.deepEqual(lastInterpretation.currentConditions.unappliedRequests,[]);
});
test('overlong reviewer display text cannot break a valid structured calculation',async()=>{
 conditions=basicConditions();reviewOverride={verdict:'consistent',summary:'Verified numerical conditions. '.repeat(50),findings:['A descriptive finding. '.repeat(40)],revisedConditions:null,amendmentEvidence:null};
 const row=await ai({action:'plan_incident',id:chicken.id,message:'Generate a safe recovery plan.'});assert.equal(row.plan.allocatedUnits,50);assert.ok(row.planAudit.reflection.summary.length<=600);assert.ok(row.planAudit.reflection.findings[0].length<=300);reviewOverride=null;
});

test('network migration is additive, version-guarded and idempotent; transfers save as a new incident plan',async()=>{
 const before=await call({action:'workspace',id:chicken.id}),oldPlanId=before.selected.plan.id;
 const migrated=await call({action:'expand_network',expectedVersion:before.catalog.version});assert.equal(migrated.offers,13);
 const after=await call({action:'workspace',id:chicken.id});assert.equal(after.catalog.networkVersion,1);assert.equal(after.selected.plan.id,oldPlanId);assert.equal(after.selected.planCurrent,false);
 const rejected=await handler(event({action:'expand_network',expectedVersion:before.catalog.version}));assert.equal(rejected.statusCode,400);
 assert.equal((await call({action:'expand_network',expectedVersion:after.catalog.version})).version,after.catalog.version);
 conditions={...basicConditions(),allowStoreTransfers:true,capacityLimits:[{supplierId:1,availableUnits:50},{supplierId:2,availableUnits:50},{supplierId:4,availableUnits:50}]};
 const row=await ai({action:'plan_incident',id:chicken.id,message:'Enable same-chain transfers and keep the supplier ceilings at 50 packs.'});assert.ok(row.plan.transferUnits>0);assert.notEqual(row.plan.id,oldPlanId);assert.equal((await call({action:'workspace',id:chicken.id})).selected.planCurrent,true);
});

test('AI explores without replacing the plan; consent creates a separate version and blocks reuse',async()=>{
 conditions={...basicConditions(),capacityLimits:[1,2,4].map(supplierId=>({supplierId,availableUnits:50}))};
 const row=await ai({action:'plan_incident',id:chicken.id,message:'Keep suppliers at 50 packs and store transfers off.'});
 const explored=await ai({action:'suggest_incident',id:row.id,planId:row.plan.id});
 const s=explored.specialSuggestion;assert.equal(explored.plan.id,row.plan.id);assert.ok(s.candidates[0].metrics.allocatedUnits>row.plan.allocatedUnits);
 const ws=await call({action:'workspace',id:row.id});assert.equal(ws.selected.specialSuggestion.id,s.id);assert.equal(ws.selected.plan.conditions.allowStoreTransfers,false);
 const other=await call({action:'new_report',storeId:1,report:'Synthetic separate incident for isolation test.'});
 assert.equal((await handler(event({action:'adopt_suggestion',id:other.id,suggestionId:s.id,candidateId:s.candidateId}))).statusCode,400);
 const next=await call({action:'adopt_suggestion',id:row.id,suggestionId:s.id,candidateId:s.candidateId});
 assert.notEqual(next.plan.id,row.plan.id);assert.equal(next.plan.status,'proposed');assert.equal(next.parentPlanId,row.plan.id);assert.equal(next.before.allocatedUnits,row.plan.allocatedUnits);assert.equal(next.plan.allocatedUnits,s.candidates[0].metrics.allocatedUnits);
 const versions=await call({action:'workspace',id:row.id,planId:row.plan.id});assert.equal(versions.selectedVersion.plan.conditions.allowStoreTransfers,false);assert.equal(versions.selected.planCurrent,true);
 assert.equal((await handler(event({action:'adopt_suggestion',id:row.id,suggestionId:s.id,candidateId:s.candidateId}))).statusCode,400);
});
test('changed plan or catalog prevents stale suggestion adoption',async()=>{
 let row=await ai({action:'plan_incident',id:chicken.id,message:'Keep suppliers capped and transfers off.'});
 let explored=await ai({action:'suggest_incident',id:row.id,planId:row.plan.id}),s=explored.specialSuggestion;
 await ai({action:'plan_incident',id:row.id,message:'Keep suppliers capped and transfers off.'});
 assert.equal((await handler(event({action:'adopt_suggestion',id:row.id,suggestionId:s.id,candidateId:s.candidateId}))).statusCode,400);
 const ws=await call({action:'workspace',id:row.id});explored=await ai({action:'suggest_incident',id:row.id,planId:ws.selected.plan.id});s=explored.specialSuggestion;
 await call({action:'update_stock',offerId:4,availableUnits:49,expectedVersion:ws.catalog.version,reference:'Synthetic stock update during comparison.'});
 assert.equal((await handler(event({action:'adopt_suggestion',id:row.id,suggestionId:s.id,candidateId:s.candidateId}))).statusCode,400);
});

test('regional traffic and priority survive async planning, version persistence and revalidation',async()=>{
 conditions={...basicConditions(),regionalTraffic:[{region:'North Bay',multiplier:2}],priorityStoreIds:[2],capacityLimits:[1,2,4].map(supplierId=>({supplierId,availableUnits:50}))};
 const row=await ai({action:'plan_incident',id:chicken.id,message:'North Bay driving is 2x slower; prioritize store #2 for available stock.'});
 assert.deepEqual(row.plan.conditions.regionalTraffic,conditions.regionalTraffic);assert.deepEqual(row.plan.conditions.priorityStoreIds,[2]);assert.ok(row.plan.prioritySummary.allocatedUnits>0);
 assert.ok(lastInterpretation.affectedStores.some(s=>s.id===2));assert.ok(lastInterpretation.trafficRegions['North Bay'].includes('Napa'));
 const ws=await call({action:'workspace',id:row.id,planId:row.plan.id});assert.equal(ws.selected.planCurrent,true);assert.deepEqual(ws.selectedVersion.plan.prioritySummary,row.plan.prioritySummary);
});
