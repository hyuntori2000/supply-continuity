'use client';
import {useEffect,useRef} from 'react';
import type {RecoveryPlan} from '@/lib/continuity';
const h=(value:unknown)=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export default function ContinuityMap({plan,stage,chain,selected,onSelect}:{plan:RecoveryPlan;stage:'normal'|'disruption'|'recovery';chain:string;selected:string|null;onSelect:(id:string|null)=>void}){
 const root=useRef<HTMLDivElement>(null);const map=useRef<import('leaflet').Map|null>(null);const signature=JSON.stringify({plan,stage,chain,selected});
 useEffect(()=>{let cancelled=false;import('leaflet').then(L=>{if(cancelled||!root.current)return;const m=L.map(root.current,{scrollWheelZoom:false,zoomControl:false}).setView([37.8,-122.2],8);map.current=m;L.control.zoom({position:'bottomright'}).addTo(m);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap contributors',maxZoom:18}).addTo(m);
 const group=L.featureGroup().addTo(m);const targets=(stage==='normal'?plan.normal:plan.stores).filter(s=>chain==='All chains'||s.chain===chain);const colors:Record<string,string>={A:'#ff6d78',B:'#61aaff',F:'#43ddaa',D:'#bb9bff',C:'#8291a7'};
 const donors=plan.transferDonors||[];
 const links=stage==='recovery'?plan.allocations.filter(a=>targets.some(s=>s.id===a.storeId)&&(!selected||a.offerId===selected||`T${a.originStoreId}`===selected)):targets.filter(s=>!selected||selected===s.originOfferId).map(s=>({offerId:s.originOfferId,storeId:s.id,kg:s.need,originStoreId:undefined as number|undefined,physicalPacks:s.need/plan.suppliers.find(o=>o.id===s.originOfferId)!.packKg}));
 for(const a of links){
  const donor=a.originStoreId?donors.find(d=>d.id===a.originStoreId):undefined;
  const o=donor||plan.suppliers.find(s=>s.id===a.offerId),st=targets.find(s=>s.id===a.storeId);
  if(!o||!st)continue;
  const color=donor?'#f2c66d':colors[a.offerId],label=donor?`${donor.chain} ${donor.city} (store transfer)`:o.city;
  L.polyline([[o.latitude,o.longitude],[st.latitude,st.longitude]],{color,weight:selected?3.5:2.3,opacity:stage==='disruption'?.7:.85,dashArray:stage==='disruption'?'6 7':donor?'8 5':undefined}).bindTooltip(h(`${label} → ${st.chain} ${st.city}: ${a.kg} kg / ${a.physicalPacks} packs`)).addTo(group);
  const from=m.latLngToLayerPoint([o.latitude,o.longitude]),to=m.latLngToLayerPoint([st.latitude,st.longitude]),angle=Math.atan2(to.y-from.y,to.x-from.x)*180/Math.PI;
  L.marker([o.latitude+(st.latitude-o.latitude)*.62,o.longitude+(st.longitude-o.longitude)*.62],{interactive:false,icon:L.divIcon({className:'flow-arrow',html:`<svg width="14" height="14" viewBox="0 0 14 14" style="transform:rotate(${angle}deg)"><path d="M 2 2 L 12 7 L 2 12 Z" fill="${color}"/></svg>`,iconSize:[14,14],iconAnchor:[7,7]})}).addTo(group);
  if(selected||targets.length<=7)L.marker([(o.latitude+st.latitude)/2,(o.longitude+st.longitude)/2],{icon:L.divIcon({className:'quantity-badge',html:`${h(a.kg)} kg`,iconSize:[54,20]})}).addTo(group);
 }
 for(const st of targets.filter(st=>!selected||links.some(a=>a.storeId===st.id)))L.marker([st.latitude,st.longitude],{icon:L.divIcon({className:'store-pin',html:`<span style="border-color:${stage==='recovery'?(st.unfilled?'#ffbc6c':'#43ddaa'):'#ff6d78'}">${h(st.id)}</span>`,iconSize:[28,28]})}).bindTooltip(h(`${st.chain} · ${st.city} | need ${st.need} kg · allocated ${st.received} kg · gap ${st.unfilled} kg`)).addTo(group);
 for(const o of plan.suppliers.filter(o=>o.id!=='C'&&(!selected||selected===o.id))){const label=stage==='recovery'?`${o.addedKg} kg allocated`:`${plan.normal.filter(x=>x.originOfferId===o.id).reduce((n,x)=>n+x.need,0)} kg committed`;L.marker([o.latitude,o.longitude],{icon:L.divIcon({className:'supplier-pin',html:`<b style="background:${colors[o.id]}">${h(o.id)}</b><span>${h(o.city)}<small>${h(label)}</small></span>`,iconSize:[145,45],iconAnchor:[15,20]})}).on('click',()=>onSelect(selected===o.id?null:o.id)).addTo(group);}
 if(stage==='recovery')for(const d of donors.filter(d=>d.sentKg>0&&(!selected||selected===d.sourceId)&&(chain==='All chains'||d.chain===chain))){L.marker([d.latitude,d.longitude],{icon:L.divIcon({className:'supplier-pin transfer-pin',html:`<b style="background:#f2c66d">T${h(d.id)}</b><span>${h(d.chain)} · ${h(d.city)}<small>${h(d.sentKg)} kg sent · ${h(d.remainingSafeKg)} kg kept</small></span>`,iconSize:[175,45],iconAnchor:[15,20]})}).bindTooltip(h(`Same-chain transfer · ${d.name} · minimum retained ${d.minimumKeepKg} kg`)).on('click',()=>onSelect(selected===d.sourceId?null:d.sourceId)).addTo(group);}
 if(group.getLayers().length)m.fitBounds(group.getBounds(),{padding:[50,65],maxZoom:10});const resize=new ResizeObserver(()=>m.invalidateSize());resize.observe(root.current);(m as any)._resizeObserver=resize;
 });return()=>{cancelled=true;if(map.current){(map.current as any)._resizeObserver?.disconnect();map.current.remove();map.current=null;}};
 // Recreate only when the serialized plan/view changes, never on unrelated chat updates.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[signature]);
 return <div ref={root} className="map-canvas" aria-label="Supplier and same-chain store allocation map"/>;
}
