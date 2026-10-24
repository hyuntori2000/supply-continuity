import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
async function module(path){const r=await build({entryPoints:[new URL(path,import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',target:'node22'});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));}
const {compareTraffic,parseRouteMatrix,departureAt,validateTrafficChoice}=await module('../src/live-traffic.ts');
const {initialCatalog,basicConditions,planIncident}=await module('../src/incident-engine.ts');
const {expandNetwork}=await module('../src/network-expansion.ts');
const start='2026-10-24T12:00:00Z',realNow=Date.now;
process.env.GOOGLE_ROUTES_API_KEY='AIza_TEST_ONLY';
const route={originIndex:0,destinationIndex:0,status:{},condition:'ROUTE_EXISTS',duration:'1200s',staticDuration:'1800s',distanceMeters:20000};
test('strict route matrix accepts traffic faster than static and rejects fallback, partial, invalid and duplicated results',()=>{
 assert.equal(parseRouteMatrix([route],[{id:2}])[2].drivingMinutes,20);
 for(const value of [[],[null],[{...route,status:{code:7}}],[{...route,fallbackInfo:{routingMode:'TRAFFIC_UNAWARE'}}],[{...route,duration:'NaNs'}],[{...route,destinationIndex:4}],[{...route,distanceMeters:0}]])assert.throws(()=>parseRouteMatrix(value,[{id:2}]));
 assert.throws(()=>parseRouteMatrix([route,route],[{id:2},{id:3}]));
 assert.deepEqual(parseRouteMatrix([{...route,condition:'ROUTE_NOT_FOUND'}],[{id:2}]),{});
 assert.equal(departureAt(start,30,120),'2026-10-24T14:30:00.000Z');
});
test('future matrices change actual allocations while preserving stock, priority and the saved plan',async()=>{
 Date.now=()=>Date.parse(start)-300000;
 try{
 const c=expandNetwork(initialCatalog()),base={...basicConditions(),priorityStoreIds:[5],regionalTraffic:[{region:'North Bay',multiplier:2}],capacityLimits:[1,2,4].map(supplierId=>({supplierId,availableUnits:200}))},snapshot=JSON.stringify(c),saved=planIncident(c,8,base,start),calls=[];
 const fake=async(url,init)=>{const b=JSON.parse(init.body);assert.equal(init.headers['X-Goog-Api-Key'],'AIza_TEST_ONLY');assert.ok(Date.parse(b.departureTime)>Date.now());assert.equal(b.routingPreference,'TRAFFIC_AWARE_OPTIMAL');calls.push(b);const minutes=new Date(b.departureTime).getUTCMinutes(),wait=minutes===30;return Response.json(b.destinations.map((_,i)=>({...route,destinationIndex:i,duration:wait?'600s':`${(i+1)*600}s`})))};
 const r=await compareTraffic(c,8,base,start,fake);assert.equal(r.candidates.length,3);assert.ok(calls.length>=6);assert.equal(r.routeElements,calls.reduce((n,c)=>n+c.destinations.length,0));assert.equal(r.manualTrafficReplaced,true);assert.equal(r.conditions.trafficMultiplier,1);assert.deepEqual(r.conditions.priorityStoreIds,[5]);
 for(const p of r.candidates){assert.equal(p.metrics.allocatedUnits,600);assert.equal(p.metrics.priorityAllocated,73);assert.equal(p.metrics.allocatedUnits+p.metrics.unfilledUnits,p.metrics.requiredUnits);for(const cap of base.capacityLimits)assert.ok(p.legs.filter(l=>l.supplierId===cap.supplierId).reduce((n,l)=>n+l.units,0)<=200);for(const leg of p.legs){const prep=c.offers.find(o=>o.farm_id===leg.supplierId&&o.product_id===2).processing_lead_hours*60;assert.equal(leg.departureAt,departureAt(start,p.waitMinutes,prep));assert.equal(Date.parse(leg.arrivalAt)-Date.parse(leg.departureAt),leg.drivingMinutes*60000);}}
 assert.notEqual(r.candidates[0].metrics.lastDeliveryMinutes,r.candidates[2].metrics.lastDeliveryMinutes);assert.equal(JSON.stringify(c),snapshot);assert.deepEqual(planIncident(c,8,base,start),saved);assert.ok(!JSON.stringify(r).includes('AIza_'));
 const noRoad=await compareTraffic(c,8,base,start,async(_u,init)=>Response.json(JSON.parse(init.body).destinations.map((_,i)=>({...route,destinationIndex:i,condition:'ROUTE_NOT_FOUND'}))));assert.ok(noRoad.candidates.every(p=>p.metrics.allocatedUnits===0));
 }finally{Date.now=realNow;}
});
test('past departures fail before API use and arrivals after expiry cannot supply',async()=>{
 Date.now=()=>Date.parse(start)-300000;
 try{const c=expandNetwork(initialCatalog());await assert.rejects(compareTraffic(c,8,basicConditions(),'2026-10-23T12:00:00Z',()=>{throw Error('must not fetch')}),/future/);
 const r=await compareTraffic(c,8,basicConditions(),start,async(_u,init)=>Response.json(JSON.parse(init.body).destinations.map((_,i)=>({...route,destinationIndex:i,duration:'2592000s'}))));assert.ok(r.candidates.every(p=>p.metrics.allocatedUnits===0));
 }finally{Date.now=realNow;}
});
test('Bedrock cannot choose avoidable overall or priority shortage',()=>{
 const candidates=[{id:'start-time',metrics:{allocatedUnits:100,priorityAllocated:70}},{id:'start-cost',metrics:{allocatedUnits:90,priorityAllocated:70}},{id:'wait-30',metrics:{allocatedUnits:100,priorityAllocated:50}}];const choice={candidateId:'start-time',reason:'Same stock, earlier safe delivery',tradeoffs:['Modeled cost is higher']};assert.deepEqual(validateTrafficChoice(candidates,choice),choice);for(const candidateId of ['start-cost','wait-30'])assert.throws(()=>validateTrafficChoice(candidates,{...choice,candidateId}),/shortage/);
});
