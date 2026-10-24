// Explicit acceptance test against the isolated synthetic demo only.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const state=JSON.parse(readFileSync(new URL('../.local/deployment.json',import.meta.url),'utf8'));
const {accessCode}=JSON.parse(readFileSync(new URL('../.local/access.json',import.meta.url),'utf8'));
assert.equal(state.functionName,'supply-continuity-api');assert.notEqual(state.apiId,'vceh0xmua8');
const id='4843c636-e455-44ec-8fe3-62781b58bc57';
async function request(body,path='/api/cases'){const r=await fetch(state.apiUrl+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${accessCode}`,Origin:state.siteUrl,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;}
async function plan(message){let job=await request({action:'plan_incident',id,message});for(let i=0;i<120;i++){const data=await request(null,job.pollUrl);if(data.status==='failed')throw new Error(data.error);if(data.status==='completed'){const p=data.result.plan;console.log(JSON.stringify({version:p.version,source:p.source,coverage:p.coverage,allocated:p.allocatedUnits,supplierUnits:p.supplierUnits,transferUnits:p.transferUnits,conditions:p.conditions}));return p;}await new Promise(r=>setTimeout(r,1500));}throw new Error('AI job timeout');}
let ws=await request({action:'workspace',id});assert.match(ws.selected.report,/SYNTHETIC INTEGRATION QA/i);
if(!ws.catalog.networkVersion){console.log(await request({action:'expand_network',expectedVersion:ws.catalog.version}));ws=await request({action:'workspace',id});}
assert.equal(ws.catalog.networkVersion,1);for(const p of ws.catalog.products)assert.ok(ws.catalog.offers.filter(o=>o.product_id===p.id).length>=4);
if(process.argv.includes('--migrate-only'))process.exit(0);
const baseline=await plan('Reset the plan conditions: capacityLimits = [], blockedSupplierIds = [], objective = time, trafficMultiplier = 1, allowStoreTransfers = false, maxTransferMinutes = 90. This removes all previous temporary ceilings. Keep catalog safety and actual stock unchanged.');
assert.equal(baseline.source,'amazon-bedrock');assert.ok(new Set(baseline.allocations.map(a=>a.supplierId)).size>=2);assert.equal(baseline.transferUnits,0);
const limited=await plan('For this synthetic scenario, limit supplier A (ID 1), B (ID 2) and D (ID 4) to 200 packs each. Keep all lot safety restrictions. Disable store transfers and minimize delivery time.');
assert.ok(limited.coverage<70);assert.equal(limited.transferUnits,0);
writeFileSync(new URL('../.local/expanded-network-live.json',import.meta.url),JSON.stringify({testedAt:new Date().toISOString(),catalogVersion:ws.catalog.version,baseline,limited},null,2));
console.log('Supplier expansion and actual Bedrock baseline/constrained plans passed. Enable transfers in UI for the final acceptance step.');
