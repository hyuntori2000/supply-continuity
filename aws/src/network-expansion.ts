import {impactFor,type Catalog} from './incident-engine';
// Explicit, additive demo-data migration. Never relabel existing held stock as safe.
export function expandNetwork(c:Catalog){
 if((c as any).networkVersion===1)return c;
 const next=structuredClone(c) as Catalog&{networkVersion:number;networkDisclosure:string};
 const assignments=[{farm:1,products:[1,2,3]},{farm:2,products:[1,2]},{farm:3,products:[2,3]},{farm:4,products:[1,2]},{farm:5,products:[1,3]},{farm:6,products:[1,3]}];
 let lotId=Math.max(...c.lots.map(l=>l.id)),offerId=Math.max(...c.offers.map(o=>o.id));
 const additions:any[]=[];
 for(const a of assignments)for(const productId of a.products){
  if(next.offers.some(o=>o.farm_id===a.farm&&o.product_id===productId))continue;
  const id=++lotId,product=c.products.find(p=>p.id===productId)!;
  const lot:any={id,lot_id:id,lot_code:`DEMO-NET-P${productId}-${String.fromCharCode(64+a.farm)}`,product_id:productId,farm_id:a.farm,facility_id:null,production_date:'2026-10-23',safety_status:'released',expires_on:'2026-10-29',as_of:'2026-10-24T11:00:00Z',is_synthetic:true};
  next.lots.push(lot);
  const offer={...c.offers.find(o=>o.product_id===productId)!,id:++offerId,farm_id:a.farm,lotId:id,available_units:250+a.farm*50,processing_lead_hours:1+a.farm*.2,delivery_lead_hours:2,unit_cost_usd:Math.round(product.unitCost*(.9+a.farm*.04)*100)/100,approval_status:'approved_mock',safety_status:'released',coldChain:'verified_mock',updatedAt:new Date().toISOString()};
  next.offers.push(offer);additions.push(offer);
 }
 // Three pre-existing, unaffected donor stores per product. Separate inventory
 // from supplier spare-stock offers, with an explicitly synthetic replenishment.
 for(const p of c.products){
  const impacted=new Set(impactFor(c,p.id*5-2).targets.map(s=>s.id));
  const donors=c.stores.filter(s=>!impacted.has(s.id)).slice(0,3);
  const offers=additions.filter(o=>o.product_id===p.id);
  donors.forEach((s,index)=>{const offer=offers[index%offers.length];if(!offer)return;const reserve=c.demand.find(d=>d.storeId===s.id&&d.productId===p.id)?.reserveUnits||100;
   next.inventory.push({store_id:s.id,lot_id:offer.lotId,quantity:reserve+90+index*15,reserved_quantity:0,cold_chain_status:'verified',as_of:new Date().toISOString(),is_synthetic:true});
  });
 }
 next.networkVersion=1;next.networkDisclosure='Synthetic multi-product supplier offers and nine replenished donor-store inventories. Existing safety records and operator stock edits preserved.';
 next.version=c.version+1;next.updatedAt=new Date().toISOString();return next;
}
