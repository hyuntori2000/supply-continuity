import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../src/lib/incident-view.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {incidentProduct,productIncidents,incidentMetrics,parseIncidentRoute}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const catalog={version:8,lots:[{id:3,product_id:1},{id:8,product_id:2},{id:13,product_id:3}]};
const chicken={id:'chicken',lotId:8,impact:{product:{id:2},heldUnits:778,inboundUnits:244,stockValue:5000},plan:{product:{id:2},catalogVersion:8,requiredUnits:1022,allocatedUnits:600,unfilledUnits:422,coverage:600/1022*100,cost:6500,lastDeliveryMinutes:615}};
test('product selection isolates incidents including unclassified reports',()=>{const rows=[{id:'romaine',lotId:3},chicken,{id:'tomato',lotId:13},{id:'unknown',lotId:null}];assert.deepEqual(productIncidents(catalog,rows,1).map(i=>i.id),['romaine']);assert.deepEqual(productIncidents(catalog,rows,2).map(i=>i.id),['chicken']);assert.equal(productIncidents(catalog,rows,null).length,4);assert.equal(incidentProduct(catalog,rows[3]),null);});
test('dashboard metrics use the selected saved plan and immediately reflect a new allocation',()=>{const before=incidentMetrics(catalog,chicken);assert.equal(before.required,1022);assert.equal(before.allocated,600);const after=incidentMetrics(catalog,{...chicken,plan:{...chicken.plan,allocatedUnits:1000,unfilledUnits:22,coverage:1000/1022*100}});assert.equal(after.allocated,1000);assert.equal(after.unfilled,22);assert.ok(after.coverage>before.coverage);});
test('stale and wrong-product plans cannot populate current dashboard metrics',()=>{for(const altered of [{...chicken.plan,catalogVersion:7},{...chicken.plan,product:{id:1}}]){const m=incidentMetrics(catalog,{...chicken,plan:altered});assert.equal(m.stale,true);assert.equal(m.allocated,null);assert.equal(m.coverage,null);}const pending=incidentMetrics(catalog,{lotId:null});assert.equal(pending.required,null);assert.equal(pending.allocated,null);});
test('deep links distinguish individual incidents, product networks and new intake',()=>{const id='44f2a3d3-96b5-4d15-a5cf-82bf1edcc202';assert.deepEqual(parseIncidentRoute('#incidents/'+id),{kind:'incident',id});assert.deepEqual(parseIncidentRoute('#products/1'),{kind:'product',productId:1});assert.deepEqual(parseIncidentRoute('#incidents/new'),{kind:'new'});assert.deepEqual(parseIncidentRoute(''),{kind:'default'});});
test('server validation preserves an unchanged product plan across unrelated catalog revisions',()=>{
 const m=incidentMetrics({...catalog,version:9},{...chicken,planCurrent:true});assert.equal(m.allocated,600);assert.equal(m.stale,false);
 const invalid=incidentMetrics(catalog,{...chicken,planCurrent:false});assert.equal(invalid.allocated,null);
});
const {networkProjection}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('map totals match case allocations and retailer filters, with no stale recovery edges',()=>{
 const c={...catalog,farms:[{id:4},{id:6}]};
 const i={...chicken,impact:{...chicken.impact,originFarms:[{id:3},{id:4}],targets:[{id:1,chain:'Target',needUnits:100},{id:2,chain:'Walmart',needUnits:200}]},plan:{...chicken.plan,allocations:[{supplierId:4,storeId:1,units:80},{supplierId:4,storeId:2,units:150}]}};
 const all=networkProjection(c,i,'recovery','All chains');assert.equal(all.required,300);assert.equal(all.allocated,230);assert.deepEqual(all.sources.map(s=>s.id),[4]);
 const target=networkProjection(c,i,'recovery','Target');assert.equal(target.required,100);assert.equal(target.allocated,80);assert.equal(target.stores.length,1);
 assert.equal(networkProjection(c,{...i,planCurrent:false},'recovery','All chains').allocations.length,0);
 const original=networkProjection(c,i,'original','All chains');assert.equal(original.allocations.length,0);assert.equal(original.sources.length,2);
});
test('normal distribution includes unaffected stores and incident phases isolate disrupted demand',()=>{
 const c={version:1,products:[{id:1}],lots:[{id:1,product_id:1,farm_id:1},{id:2,product_id:1,farm_id:2}],inputs:[],farms:[{id:1},{id:2}],stores:[{id:1,chain:'Target'},{id:2,chain:'Walmart'}],inventory:[{store_id:1,lot_id:1,quantity:50},{store_id:2,lot_id:2,quantity:70}],shipments:[]};
 const i={lotId:1,impact:{product:{id:1},originFarms:[{id:1}],targets:[{id:1,chain:'Target',needUnits:50}],heldUnits:50,inboundUnits:0}};
 const original=networkProjection(c,i,'original','All chains');assert.equal(original.stores.length,2);assert.equal(original.required,120);assert.deepEqual(original.stores[0].sourceIds,[1]);assert.deepEqual(original.stores[1].sourceIds,[2]);
 const interrupted=networkProjection(c,i,'interrupted','All chains');assert.equal(interrupted.required,50);assert.equal(interrupted.stores.length,1);assert.deepEqual(interrupted.unaffected.map(s=>s.id),[2]);
 const recovery=networkProjection(c,i,'recovery','All chains');assert.equal(recovery.allocated,0);assert.equal(recovery.unaffected.length,1);
});
const {incidentDisruption,supplierLetter}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('disruption names the restricted ancestor lot without accusing the clean co-source',()=>{
 const c={lots:[{id:1,farm_id:1,safety_status:'recalled'},{id:2,farm_id:2,safety_status:'released'},{id:3,farm_id:null,safety_status:'recalled'}],inputs:[{input_lot_id:1,output_lot_id:3},{input_lot_id:2,output_lot_id:3}]};
 const i={lotId:3,impact:{lot:c.lots[2],heldUnits:1220,inboundUnits:367,targets:[{id:1},{id:2}]}};
 const d=incidentDisruption(c,i);assert.deepEqual(d.sourceIds,[1]);assert.equal(d.units,1587);assert.equal(d.recordedRestriction,true);assert.deepEqual(d.restricted.map(l=>l.id),[1,3]);assert.equal(supplierLetter(1),'A');assert.equal(supplierLetter(6),'F');
 c.lots.forEach(l=>l.safety_status='released');const allegation=incidentDisruption(c,i);assert.equal(allegation.recordedRestriction,false);assert.deepEqual(allegation.sourceIds,[]);
});
