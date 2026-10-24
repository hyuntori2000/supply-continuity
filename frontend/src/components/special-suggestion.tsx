import {RECOVERY_POLICY_VERSION} from '../../../lib/recovery-priority';
import {Sparkles} from 'lucide-react';
export default function SpecialSuggestion({incident,catalogVersion,stale,busy,onExplore,onAdopt}:{incident:any;catalogVersion:number;stale:boolean;busy:boolean;onExplore:()=>void;onAdopt:(s:any)=>void}){
 const s=incident.specialSuggestion,p=incident.plan;
 const valid=s&&s.policyVersion===RECOVERY_POLICY_VERSION&&s.basePlanId===p.id&&s.catalogVersion===catalogVersion&&s.status==='offered'&&!stale;
 const candidate=valid?s.candidates.find((c:any)=>c.id===s.candidateId):null;
 const pct=(v:number|null)=>v===null?'N/A':`${v.toFixed(1)}%`;
 return <section className="panel special-suggestion" aria-label="AI Special Suggestion">
 <div className="eyebrow"><Sparkles size={16}/> AI SPECIAL SUGGESTION · AMAZON BEDROCK</div>
 <h2>{candidate?'There may be a better recovery option':'Let AI explore the next recovery option'}</h2>
 <small>Priority: recovery coverage, priority stores, delivery time, then cost.</small>
 {!valid&&<p>Compare verified alternatives for this recovery plan.</p>}
 {valid&&<>{candidate?<>
 <h3>{candidate.title}</h3><ul>{candidate.changes.map((x:string)=><li key={x}>{x} — requires your acceptance</li>)}</ul>
 <div className="suggestion-metrics">{s.baseline.priorityRequired>0&&<div><small>PRIORITY STORE PACKS</small><strong>{s.baseline.priorityAllocated} → {candidate.metrics.priorityAllocated}</strong></div>}<div><small>RECOVERY COVERAGE</small><strong>{pct(s.baseline.coverage)} → {pct(candidate.metrics.coverage)}</strong></div><div><small>ALLOCATED PACKS</small><strong>{s.baseline.allocatedUnits} → {candidate.metrics.allocatedUnits}</strong></div><div><small>LAST DELIVERY · MIN AFTER APPROVAL</small><strong>{s.baseline.lastDeliveryMinutes??'N/A'} → {candidate.metrics.lastDeliveryMinutes??'N/A'}</strong></div><div><small>MODELED COST</small><strong>${s.baseline.cost.toLocaleString()} → ${candidate.metrics.cost.toLocaleString()}</strong></div></div>
 <p><strong>Tradeoff:</strong> {s.tradeoff}</p><small>Your current plan stays active until you accept.</small>
 <button className="primary" disabled={busy} onClick={()=>onAdopt(s)}>Accept changes & create new version</button>
 </>:<p>No verified improvement recommended. Your current plan remains active.</p>}
 <details className="inline-details"><summary>Why this suggestion? · Alternatives & AI decision</summary><p>{s.reason}</p>{s.candidates.map((c:any)=><p key={c.id}><strong>{c.title}</strong>: {pct(c.metrics.coverage)} · {c.metrics.allocatedUnits} packs · ${c.metrics.cost.toLocaleString()} · {c.metrics.lastDeliveryMinutes??'N/A'} min. {c.improves?'Improves recovery first, then delivery time; cost breaks ties.':'No qualifying improvement.'}<br/>{c.changes.join('; ')}</p>)}<p>{s.model} · {new Date(s.createdAt).toLocaleString()}</p><p>AI proposes and compares bounded alternatives. The allocation engine calculates quantities; this is not a guarantee of global optimality.</p></details></>}
 <button className="secondary" disabled={busy||stale} onClick={onExplore}>{valid?'Explore alternatives again':'Explore with AI'}</button>
 <small>Safety, supplier stock ceilings, exclusions and donor reserves remain enforced. No purchase or dispatch.</small>
 </section>;
}
