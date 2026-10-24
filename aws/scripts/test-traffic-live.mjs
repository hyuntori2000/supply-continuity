// Temporary live comparison only: never writes Google results to disk or to plans.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),state=JSON.parse(readFileSync(new URL('.local/deployment.json',root),'utf8')),auth=JSON.parse(readFileSync(new URL('.local/access.json',root),'utf8'));
if(state.apiId==='vceh0xmua8')throw new Error('Isolated API only');
const id=process.argv[2]||'6182e3c7-8c96-4c0d-a234-1cb82b20fd5f';
async function call(body){const r=await fetch(state.apiUrl+'/api/cases',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.accessCode},body:JSON.stringify(body),signal:AbortSignal.timeout(35000)});const b=await r.json();if(!r.ok)throw new Error(b.error||`HTTP ${r.status}`);return b;}
const before=await call({action:'workspace',id});if(!before.selected.report.includes('SYNTHETIC CONTEXT QA'))throw new Error('Use the dedicated QA incident only');
const r=await call({action:'traffic_insight',id,startAt:new Date(Date.now()+5*60000).toISOString()});
assert.equal(r.provider,'Google Maps');assert.equal(r.previewOnly,true);assert.equal(r.candidates.length,3);assert.ok(r.candidates.some(c=>c.legs.length));assert.ok(r.model.includes('nova'));assert.ok(r.candidates.some(c=>c.id===r.decision.candidateId));
for(const c of r.candidates){assert.equal(c.metrics.allocatedUnits+c.metrics.unfilledUnits,c.metrics.requiredUnits);for(const l of c.legs){assert.ok(l.drivingMinutes>0&&l.distanceKm>0);assert.ok(Date.parse(l.arrivalAt)>Date.parse(l.departureAt));}}
const after=await call({action:'workspace',id});assert.deepEqual(after.selected.plan,before.selected.plan);assert.deepEqual(after.versions,before.versions);assert.equal(after.catalog.version,before.catalog.version);
console.log(JSON.stringify({passed:true,provider:r.provider,model:r.model,candidateCount:r.candidates.length,realRoutesPresent:true,savedPlanUnchanged:true,historyUnchanged:true}));
