import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const state=JSON.parse(readFileSync(new URL('../.local/deployment.json',import.meta.url),'utf8'));
const {accessCode}=JSON.parse(readFileSync(new URL('../.local/access.json',import.meta.url),'utf8'));
if(state.apiId==='vceh0xmua8')throw new Error('Isolated application only');
async function api(body,path='/api/cases',expected=200){const r=await fetch(state.apiUrl+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${accessCode}`,Origin:state.siteUrl,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const d=await r.json();assert.equal(r.status,expected,JSON.stringify(d));return d;}
async function ai(body){const job=await api(body,'/api/cases',202);for(let n=0;n<90;n++){const p=await api(null,job.pollUrl);if(p.status==='failed')throw new Error(p.error);if(p.status==='completed')return p.result;await new Promise(r=>setTimeout(r,1200));}throw new Error('Worker timeout');}
const observations=[];
let ws=await api({action:'workspace'}),c=ws.catalog;
assert.equal(c.products.length,3);console.log('DB workspace loaded; catalog version '+c.version);
const storeId=c.inventory.find(i=>i.lot_id===8).store_id;
let row=await api({action:'new_report',storeId,report:'Synthetic QA: I bought DEMO Raw Chicken 1 kg, lot DEMO-P2-BLEND-A, at this store and felt unwell. Please investigate; cause is unconfirmed.'});
row=await ai({action:'analyze_incident',id:row.id});assert.equal(row.lotId,8);assert.equal(row.status,'investigating');
row=await api({action:'record_evidence',id:row.id,kind:'precautionary_hold',reference:'SYNTHETIC QA ONLY: precautionary hold pending sample testing.'});
row=await ai({action:'plan_incident',id:row.id,message:'Generate an exact-product recovery plan using available approved suppliers, minimizing delivery time.'});assert.equal(row.plan.product.id,2);assert.ok(row.plan.allocatedUnits>0);console.log('Chicken incident planned: '+row.plan.allocatedUnits+'/'+row.plan.requiredUnits);
ws=await api({action:'workspace',id:row.id});const original=ws.catalog.offers.find(o=>o.id===4).available_units;
try{
 await api({action:'update_stock',offerId:4,availableUnits:50,expectedVersion:ws.catalog.version,reference:'SYNTHETIC QA ONLY: temporary availability of 50 packs.'});
 await api({action:'decide_incident',id:row.id,planId:row.plan.id,decision:'approved',acknowledgeShortage:true,note:'Synthetic stale approval attempt.'},'/api/cases',400);
 row=await ai({action:'plan_incident',id:row.id,message:'Stock was updated in the database. Preserve conditions and recalculate using the current available inventory.'});assert.equal(row.plan.allocatedUnits,50);assert.ok(row.plan.unfilledUnits>0);
 await api({action:'decide_incident',id:row.id,planId:row.plan.id,decision:'approved',acknowledgeShortage:false,note:'Synthetic missing acknowledgement.'},'/api/cases',400);
 row=await api({action:'decide_incident',id:row.id,planId:row.plan.id,decision:'approved',acknowledgeShortage:true,note:'SYNTHETIC QA ONLY: reviewed unresolved shortage; no dispatch.'});
 assert.equal((await api({action:'workspace',id:row.id})).selected.plan.status,'approved');
 observations.push({case:'new_chicken_incident',productId:2,required:row.plan.requiredUnits,allocated:row.plan.allocatedUnits,unfilled:row.plan.unfilledUnits,model:row.plan.model,approved:true,staleApprovalBlocked:true,shortageAcknowledgementRequired:true});
}finally{const latest=await api({action:'workspace'});await api({action:'update_stock',offerId:4,availableUnits:original,expectedVersion:latest.catalog.version,reference:'SYNTHETIC QA: restore original supplier availability after test.'});}
const code='DEMO-NEW-TOM-'+Date.now();
let tomato=await api({action:'new_report',storeId:1,report:`Synthetic QA: I bought DEMO Tomatoes 1 kg, lot ${code}, at this store and felt unwell. Please review the records.`});
tomato=await ai({action:'analyze_incident',id:tomato.id});assert.equal(tomato.status,'needs_records');
ws=await api({action:'workspace'});
const registered=await api({action:'register_lot',code,productId:3,farmId:5,storeId:1,quantity:95,expiresOn:'2026-10-29',reference:'SYNTHETIC QA: operator-entered provenance for a new lot.',expectedVersion:ws.catalog.version});
tomato=await ai({action:'analyze_incident',id:tomato.id});assert.equal(tomato.lotId,registered.lotId);assert.equal(tomato.status,'investigating');
tomato=await api({action:'record_evidence',id:tomato.id,kind:'precautionary_hold',reference:'SYNTHETIC QA: operator reviewed precautionary hold.'});
tomato=await ai({action:'plan_incident',id:tomato.id,message:'Generate the initial exact-product replacement plan, minimizing delivery time.'});assert.equal(tomato.plan.product.id,3);assert.equal(tomato.plan.requiredUnits,95);assert.equal(tomato.plan.allocatedUnits,95);
observations.push({case:'newly_registered_tomato_lot',productId:3,required:95,allocated:95,initiallyNeededRecords:true,model:tomato.plan.model});
console.log('Newly registered tomato incident planned: 95/95');
const result={status:'passed',testedAt:new Date().toISOString(),checks:['Real Bedrock extraction for a new chicken incident','New cases do not require E01','DynamoDB-backed supplier inventory updates','Stale proposal approval rejected','Shortage acknowledgement enforced','Independent saved decision read','Unknown tomato lot stays pending','Operator-registered provenance permits reanalysis','New tomato lot receives an independent exact-product plan'],observations};
writeFileSync(new URL('../../docs/verification/independent-incidents.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log('Independent incident live acceptance passed.');
