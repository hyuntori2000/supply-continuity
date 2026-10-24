import {ArrowRight,ShieldAlert} from 'lucide-react';
import type {IncidentPriority,RecoveryPlan} from '@/lib/continuity';

export default function IncidentPriorities({incidents,plan,onContainment}:{incidents:IncidentPriority[];plan:RecoveryPlan;onContainment:()=>void}){
 return <section className="incident-priorities" aria-labelledby="incident-priority-title">
  <div className="priority-heading"><div><div className="eyebrow">INCIDENT TRIAGE · REGIONAL QUEUE</div><h2 id="incident-priority-title">What needs attention first?</h2></div><span className="tag">{incidents.filter(i=>i.status!=='closed').length} open incidents</span></div>
  <div className="incident-queue">{incidents.map((incident,index)=><article key={incident.id} className={`incident-priority-card ${incident.priority==='P0'?'urgent':incident.priority==='Closed'?'closed':'pending'}`}>
   <div className="priority-card-top"><span className={`tag ${incident.priority==='P0'?'red':incident.priority==='P1'?'amber':'green'}`}>{incident.priority==='Closed'?'Closed':`${incident.priority} · ${index===0?'Act first':'Investigate next'}`}</span><span>{incident.code}</span></div>
   <h3>{incident.product}</h3><p className="priority-evidence">{incident.evidence} · {incident.status.replaceAll('_',' ')}</p>
   <p className="priority-reason">{incident.reason}</p>
   {incident.status!=='closed'&&<div className="priority-quantities"><span><strong>{incident.affectedStores}</strong> stores</span><span><strong>{incident.heldKg.toLocaleString()}</strong> kg held</span><span><strong>{incident.inboundKg.toLocaleString()}</strong> kg inbound flagged</span></div>}
   <div className="priority-next"><span>NEXT ACTION</span><p>{incident.nextAction}</p></div>
   {incident.recoverySupported?<><div className="priority-recovery"><ShieldAlert size={15}/><span>{plan.unfilled>0?`Then escalate ${plan.unfilled.toLocaleString()} kg of unmet supply; ${plan.allocated.toLocaleString()} kg has a proposed allocation.`:`Then review ${plan.allocated.toLocaleString()} kg of replacement supply${plan.lateKg?`; ${plan.lateKg.toLocaleString()} kg is modeled late`:''}.`}</span></div><button className="text-button" onClick={onContainment}>Review containment <ArrowRight size={14}/></button></>:<small className="priority-scope">{incident.status==='closed'?'Archive · no active recovery required':'Evidence view · recovery modeling currently supports DEMO-E01'}</small>}
  </article>)}</div>
  <p className="priority-policy">Demo policy: active recall / positive lot evidence → investigation pending → closed. Ties use flagged inbound quantity, then report time. This regional incident queue is separate from store delivery priorities. Checklist acknowledgement and replacement delivery do not close a recall.</p>
 </section>;
}
