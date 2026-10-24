import {ArrowRight, Check, ChevronDown, Sparkles} from 'lucide-react';
import {constraintChanges, sourceChanges, type PlanComparison as Comparison} from '@/lib/plan-comparison';

const fmt=(n:number)=>n.toLocaleString('en-US');
const kg=(n:number)=>`${fmt(n)} kg`;
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
const duration=(n:number|null)=>n===null?'Unresolved':`${Math.floor(n/60)}h ${Math.round(n%60)}m`;

export default function PlanComparison({comparison}:{comparison:Comparison}) {
  const {before,after}=comparison,changes=constraintChanges(before,after),sources=sourceChanges(before,after);
  const interpretation=comparison.tools.find(t=>t.name==='set_scenario')?.output?.interpretation;
  const assumptions=[...(interpretation?.assumptions||[]),...(after.operationalNotes||[])];
  const metrics=[
    {label:'Replacement need',a:kg(before.required),b:kg(after.required)},
    {label:'Supplier allocation',a:kg(before.supplierKg),b:kg(after.supplierKg)},
    {label:'Same-chain transfers',a:kg(before.transferKg),b:kg(after.transferKg)},
    {label:'Total allocated',a:kg(before.allocated),b:kg(after.allocated)},
    {label:'Unfilled demand',a:kg(before.unfilled),b:kg(after.unfilled)},
    {label:'Allocated after deadline',a:kg(before.lateKg),b:kg(after.lateKg)},
    {label:'Modeled cost',a:money(before.cost),b:money(after.cost)},
    {label:'Full recovery ETA',a:duration(before.timing.recoveryMinutes),b:duration(after.timing.recoveryMinutes)},
  ];
  const gapDelta=after.unfilled-before.unfilled;
  return <section id="plan-comparison" className="panel plan-comparison" aria-labelledby="comparison-title">
    <div className="panel-header"><div><div className="eyebrow">AI REQUEST → VERIFIED CONDITIONS → RECALCULATED PLAN</div><h2 id="comparison-title"><Sparkles size={19}/> What changed after AI?</h2></div><span className="tag green">Live Bedrock result</span></div>
    <div className="comparison-body">
      <blockquote className="comparison-request"><span>YOUR REQUEST</span>{comparison.request}</blockquote>
      <div className="comparison-grid">
        <div className="comparison-conditions"><h3>Conditions applied</h3>{changes.length?<ul>{changes.map(row=><li key={row.label}><strong>{row.label}</strong><div><span>{row.before}</span><ArrowRight size={14}/><b>{row.after}</b></div></li>)}</ul>:<p className="comparison-note">No supported scenario conditions changed. Bedrock reviewed product fit and recalculated the plan.</p>}
          {interpretation?.summary&&!interpretation?.unappliedRequests?.length&&<p className="comparison-note">{interpretation.summary}</p>}
          {!!assumptions.length&&<details className="operational-details" open><summary>Planning assumptions</summary><ul>{assumptions.map((text:string,i:number)=><li key={i}>{text}</li>)}</ul></details>}
          {!!interpretation?.unappliedRequests?.length&&<div className="comparison-caveat" role="status"><strong>Not applied — needs clarification or more data</strong><ul>{interpretation.unappliedRequests.map((text:string,i:number)=><li key={i}>{text}</li>)}</ul></div>}
          <p className="comparison-guardrails"><Check size={15}/> Recalled-lot exclusions, capacity limits and donor stock protection remain enforced by the engine.</p>
          <details className="comparison-evidence"><summary>View verified tool evidence <ChevronDown size={14}/></summary><p>Scenario changes come from the completed set_scenario tool. Quantities come from the allocation engine.</p>{comparison.tools.map(tool=><details key={tool.name}><summary><Check size={12}/>{tool.name.replaceAll('_',' ')}</summary><pre>{JSON.stringify(tool.output,null,2)}</pre></details>)}<small>Model: {comparison.model} · Plan: {comparison.planId.slice(0,8)}</small></details>
        </div>
        <div className="comparison-results"><table><caption>Regional comparison · all chains</caption><thead><tr><th scope="col">Outcome</th><th scope="col">Before<span>Previous plan</span></th><th scope="col">After<span>AI-updated plan</span></th></tr></thead><tbody>{metrics.map(row=><tr key={row.label}><th scope="row">{row.label}</th><td>{row.a}</td><td className={row.a!==row.b?'comparison-changed':''}>{row.b}</td></tr>)}</tbody></table>
          <div className={`comparison-result ${after.unfilled?'partial':'covered'}`}><strong>{gapDelta<0?`${kg(-gapDelta)} less unfilled demand`:gapDelta>0?`${kg(gapDelta)} more unfilled demand`:'Unfilled demand unchanged'}</strong><span>{after.unfilled?`${kg(after.unfilled)} still needs another source. Full recovery remains unresolved.`:'All replacement demand is allocated. Review delivery deadlines before approval.'}</span></div>
        </div>
      </div>
      {before.required!==after.required&&<p className="comparison-caveat">The disruption changed replacement need from {kg(before.required)} to {kg(after.required)}. The previous plan uses the previous conditions; cost and timing are not a like-for-like savings comparison.</p>}
      <details className="comparison-sources"><summary>Where did the allocation change? <span>{sources.length} sources</span><ChevronDown size={14}/></summary>{sources.length?<div className="comparison-source-list">{sources.map(row=><div key={row.key}><span>{row.name}</span><strong>{kg(row.before)} <ArrowRight size={13}/> {kg(row.after)}</strong></div>)}</div>:<p>No source quantities changed.</p>}</details>
      <p className="comparison-note">Latest completed run in this session. Modeled estimates after approval; no dispatch or stock reservation. Export plan to keep this comparison.</p>
    </div>
  </section>;
}
