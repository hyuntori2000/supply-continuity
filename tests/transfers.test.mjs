import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
const path=new URL('../lib/continuity.ts',import.meta.url),source=fs.readFileSync(path,'utf8'),require=createRequire(path);
assert.equal(source,fs.readFileSync(new URL('../frontend/src/lib/continuity.ts',import.meta.url),'utf8'),'frontend and server must run identical allocation rules');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const raw=JSON.parse(fs.readFileSync(new URL('../lib/data/dataset.json',import.meta.url),'utf8'));
function engine(mutate=()=>{}){const data=structuredClone(raw);mutate(data.tables);const m={exports:{}};vm.runInNewContext(js,{module:m,exports:m.exports,require:id=>id==='./data/dataset.json'?data:require(id),crypto,TextEncoder});return m.exports;}
const e=engine(),scenario={...e.defaults,enableStoreTransfers:true};let cases=0;
for(const closedFacilityIds of [[],[5],[1],[1,5]])for(const blockedSupplierIds of [[],[2],[6],[2,6],[2,4,6]])for(const objective of ['continuity','time','cost'])for(const trafficMultiplier of [1,3]){
 const p=e.optimize({...scenario,closedFacilityIds,blockedSupplierIds,objective,trafficMultiplier});
 assert.equal(p.allocated+p.unfilled,p.required);assert.equal(p.supplierKg+p.transferKg,p.allocated);assert.equal(p.onTimeKg+p.lateKg,p.allocated);
 for(const d of p.transferDonors){assert.ok(d.sentKg<=d.spareKg);if(d.sentKg){assert.ok(d.remainingSafeKg>=d.minimumKeepKg);assert.ok(!p.stores.some(s=>s.id===d.id),'recipients never donate');}for(const l of d.lots){assert.ok(l.sentKg<=l.availableKg);if(!l.eligible)assert.equal(l.sentKg,0);}}
 for(const a of p.allocations){const target=p.stores.find(d=>d.id===a.storeId);assert.ok(a.kg>0&&Number.isInteger(a.physicalPacks));if(a.sourceKind==='store'){const d=p.transferDonors.find(d=>d.id===a.originStoreId);assert.equal(d.chain,target.chain);assert.notEqual(d.id,target.id);assert.ok(a.etaMinutes<=120);assert.ok(a.lot.startsWith('DEMO-P1-CLEAN-'));const route=raw.tables.route_matrix.find(r=>r.origin_store_id===d.id&&r.destination_store_id===target.id);assert.equal(a.distanceKm,route.road_distance_km);assert.equal(a.etaMinutes,Math.ceil(route.driving_minutes*trafficMultiplier+30));}else{const supplier=p.suppliers.find(s=>s.id===a.offerId);assert.ok(supplier.eligible);}}
 for(const s of p.suppliers)assert.ok(s.addedKg<=s.spareKg);
 for(const d of p.stores)assert.equal(d.allocations.reduce((n,a)=>n+a.kg,0)+d.unfilled,d.need);
 cases++;
}
const base=e.optimize(scenario),off=e.optimize(e.defaults),outage=e.optimize({...scenario,closedFacilityIds:[5]});
assert.equal(base.transferKg,336);assert.equal(base.supplierKg,884);assert.equal(base.cost,6214);assert.equal(off.transferKg,0);assert.equal(off.cost,6940);assert.equal(outage.transferKg,116);assert.equal(outage.unfilled,864);assert.equal(outage.timing.recoveryMinutes,null);
assert.notEqual(await e.fingerprint(base),await e.fingerprint(off));
const mutationCases=[
 ['recalled descendant',t=>{t.lot_inputs.push({input_lot_id:1,output_lot_id:5});},p=>assert.equal(p.transferKg,0)],
 ['unreleased lot',t=>{t.lot_state.find(l=>l.lot_id===5).safety_status='hold';},p=>assert.equal(p.transferKg,0)],
 ['expiry',t=>{t.lot_state.find(l=>l.lot_id===5).expires_on='2026-10-22';},p=>assert.equal(p.transferKg,0)],
 ['cold chain',t=>{for(const i of t.inventory)i.cold_chain_status='unknown';},p=>assert.equal(p.transferKg,0)],
 ['stale snapshot',t=>{for(const i of t.inventory)i.as_of='2026-10-22T12:00:00-07:00';},p=>assert.equal(p.transferKg,0)],
 ['reservations',t=>{for(const i of t.inventory)i.reserved_quantity=i.quantity;},p=>assert.equal(p.transferKg,0)],
 ['missing roads',t=>{t.route_matrix=[];},p=>assert.equal(p.transferKg,0)],
 ['missing approval',t=>{t.replacement_candidates=[];},p=>assert.equal(p.transferKg,0)],
 ['multiple lots share donor reserve',t=>{for(const c of [...t.replacement_candidates].filter(c=>c.event_id===1&&c.candidate_lot_id===5))t.replacement_candidates.push({...c,candidate_lot_id:4});},p=>{assert.ok(p.transferKg>0);for(const d of p.transferDonors)assert.ok(d.sentKg<=d.spareKg);}],
 ['same-chain flag cannot authorize cross-chain',t=>{for(const r of t.route_matrix)r.same_chain=true;for(const c of t.replacement_candidates){c.same_chain=true;c.transfer_approval='approved_mock';}},p=>{for(const a of p.allocations.filter(a=>a.sourceKind==='store'))assert.equal(p.transferDonors.find(d=>d.id===a.originStoreId).chain,p.stores.find(d=>d.id===a.storeId).chain);}],
];
for(const [name,mutate,check]of mutationCases){try{check(engine(mutate).optimize(scenario));}catch(err){throw new Error(name,{cause:err});}}
console.log(JSON.stringify({status:'passed',transferScenarios:cases,safetyMutationCases:mutationCases.length,baseline:{storeKg:base.transferKg,supplierKg:base.supplierKg,cost:base.cost},warehouseOutage:{storeKg:outage.transferKg,unfilled:outage.unfilled}},null,2));
