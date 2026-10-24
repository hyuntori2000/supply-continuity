import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
const path=new URL('../lib/continuity.ts',import.meta.url);
const source=fs.readFileSync(path,'utf8');
assert.equal(source,fs.readFileSync(new URL('../frontend/src/lib/continuity.ts',import.meta.url),'utf8'),'Client simulation and server engine must agree');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const module={exports:{}};vm.runInNewContext(js,{module,exports:module.exports,require:createRequire(path),crypto,TextEncoder,console});
const {defaults,optimize,scenarioSchema,routeTraffic,allOffers,directDispatchOptions,catalogMatches}=module.exports;
const scenario=patch=>scenarioSchema.parse({...defaults,...patch});
const congestion=scenario({regionalTraffic:[{region:'north_bay',multiplier:1.5,assumed:true}]});
assert.equal(routeTraffic(congestion,'Petaluma','San Francisco'),1.5);
assert.equal(routeTraffic(congestion,'Gilroy','San Rafael'),1.5);
assert.equal(routeTraffic(congestion,'Gilroy','San Jose'),1);
assert.equal(routeTraffic({...congestion,trafficMultiplier:2},'Petaluma','Napa'),2,'Delay must not compound');
assert.equal(optimize(congestion).operationalNotes.some(n=>n.includes('assumption')),true);
const outage=scenario({closedFacilityIds:[5]});
const direct=scenario({...outage,directDispatchSupplierIds:[4]});
const old=optimize(outage),next=optimize(direct);
assert.equal(old.suppliers.find(o=>o.id==='D').addedKg,0);
assert.equal(next.suppliers.find(o=>o.id==='D').addedKg,320);
assert.equal(next.suppliers.find(o=>o.id==='B').eligible,false,'D lane cannot unblock B');
assert.equal(next.suppliers.find(o=>o.id==='A').eligible,false,'Recall remains enforced');
assert.equal(next.required,old.required,'D bypass does not restore unrelated existing B commitments');
assert.ok(next.unfilled<old.unfilled);
assert.ok(next.allocations.filter(a=>a.offerId==='D').every(a=>a.directDispatch));
assert.equal(optimize(scenario({...direct,blockedSupplierIds:[4]})).suppliers.find(o=>o.id==='D').addedKg,0);
assert.equal(optimize(scenario({...direct,supplierCapacityLimits:[{supplierId:4,availableKg:80}]})).suppliers.find(o=>o.id==='D').addedKg,80);
assert.equal(optimize(scenario({...direct,supplierCapacityLimits:[{supplierId:4,availableKg:5000}]})).suppliers.find(o=>o.id==='D').addedKg,320);
assert.equal(optimize(scenario({...direct,supplierCapacityLimits:[{supplierId:4,availableKg:0}]})).suppliers.find(o=>o.id==='D').addedKg,0);
const d=allOffers.find(o=>o.id==='D'),released=d.released;
try{d.released=false;assert.equal(optimize(direct).suppliers.find(o=>o.id==='D').addedKg,0);}finally{d.released=released;}
const approval=directDispatchOptions[0].approval;
try{directDispatchOptions[0].approval='unverified';assert.equal(optimize(direct).suppliers.find(o=>o.id==='D').addedKg,0);}finally{directDispatchOptions[0].approval=approval;}
assert.equal(optimize(direct,catalogMatches.map(m=>({...m,compatible:false}))).allocated,0);
for(const bad of [{directDispatchSupplierIds:[1]},{directDispatchSupplierIds:[2]},{regionalTraffic:[{region:'unknown',multiplier:2}]},{regionalTraffic:[{region:'north_bay',multiplier:9}]},{supplierCapacityLimits:[{supplierId:4,availableKg:-1}]},{blocked_routes:['Highway 101']}])assert.equal(scenarioSchema.safeParse({...defaults,...bad}).success,false);
let cases=0;
for(const region of ['north_bay','east_bay','peninsula','south_bay','san_francisco'])for(const multiplier of [1,1.5,2])for(const closedFacilityIds of [[],[5]])for(const directDispatchSupplierIds of [[],[4]])for(const enableStoreTransfers of [false,true]){
 const p=optimize(scenario({closedFacilityIds,directDispatchSupplierIds,enableStoreTransfers,regionalTraffic:[{region,multiplier,assumed:false}],supplierCapacityLimits:[{supplierId:4,availableKg:200}]}));
 assert.equal(p.allocated+p.unfilled,p.required);
 assert.equal(p.onTimeKg+p.lateKg,p.allocated);
 assert.equal(p.allocations.reduce((sum,a)=>sum+a.kg,0),p.allocated);
 for(const o of p.suppliers){assert.ok(o.addedKg<=o.spareKg);if(!o.eligible)assert.equal(o.addedKg,0);}
 for(const donor of p.transferDonors)if(donor.sentKg)assert.ok(donor.remainingSafeKg>=donor.minimumKeepKg);
 assert.ok(!p.allocations.some(a=>['A','C'].includes(a.offerId)));
 cases++;
}
console.log(JSON.stringify({status:'passed',operationalScenarios:cases,checks:'Regional endpoint penalties, noncompounding delays, approved D-only bypass, protected recalls and other dependencies, stock ceilings, donor reserves and conservation',warehouseOutage:{allocated:old.allocated,unfilled:old.unfilled},directD:{allocated:next.allocated,unfilled:next.unfilled,dKg:320}},null,2));
