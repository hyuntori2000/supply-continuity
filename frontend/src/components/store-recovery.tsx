import type {RecoveryPlan} from '@/lib/continuity';
export default function StoreRecovery({plan,busy,onToggle,onFocus}:{plan:RecoveryPlan;busy:boolean;onToggle:()=>void;onFocus:(id:string)=>void}){
 const donors=plan.transferDonors||[],sent=donors.filter(d=>d.sentKg>0),enabled=!!plan.scenario.enableStoreTransfers;
 return <section className="store-recovery" aria-label="Same-chain store recovery">
  <div className="transfer-heading"><div><strong>Same-chain store recovery</strong><small>{enabled?`Regional: ${plan.transferKg} kg from stores · ${plan.supplierKg} kg from suppliers`:'Compare nearby store surplus with supplier deliveries'}</small></div><button className={enabled?'transfer-toggle enabled':'transfer-toggle'} aria-pressed={enabled} disabled={busy} onClick={onToggle}>{enabled?'Enabled':'Enable transfers'}</button></div>
  {enabled&&<details><summary>{sent.length?`${sent.length} donating stores regionwide · View quantities`:'No eligible store surplus selected · View checks'}</summary>
   {sent.map(d=><article className="transfer-row" key={d.id}><button className="text-button" onClick={()=>onFocus(d.sourceId)}>{d.chain} · {d.city} → <b>{d.sentKg} kg</b></button><small>{d.remainingSafeKg} kg unreserved safe stock kept · minimum {d.minimumKeepKg} kg</small>{plan.allocations.filter(a=>a.originStoreId===d.id).map(a=><p key={a.offerId+'-'+a.storeId}>→ {plan.stores.find(s=>s.id===a.storeId)?.city}: <b>{a.kg} kg</b> · {a.etaMinutes} min · {a.distanceKm.toFixed(1)} km<small>Lot: {a.lot}</small></p>)}</article>)}
   <p className="transfer-note">Released, unexpired lots with verified cold chain and mock transfer approval. Reserved stock and each donor’s target days of cover are protected. Disrupted recipients cannot donate. Transfers must arrive within 120 modeled minutes.</p>
   <details><summary>Donor eligibility checks</summary>{donors.map(d=><p className="transfer-note" key={d.id}><b>{d.chain} · {d.city}</b>: {d.eligible?`${d.spareKg} kg transferable before allocation`:d.reasons.join('; ')}{d.lots.filter(l=>!l.eligible).map(l=>` · ${l.lot}: ${l.reasons.join(', ')}`).join('')}</p>)}</details>
  </details>}
 </section>;
}
