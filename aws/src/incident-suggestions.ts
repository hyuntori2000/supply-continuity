import {RECOVERY_POLICY_VERSION,improvesRecovery,bestRecoveryIds} from '../../lib/recovery-priority';
import {z} from 'zod';
import {planConditions,planIncident,type Catalog,type Conditions} from './incident-engine';

// AI proposes bounded policy changes, never inventory, safety or allocations.
export const explorationSchema=z.object({proposals:z.array(z.object({
 title:z.string().min(1).max(100), rationale:z.string().min(1).max(500),
 allowStoreTransfers:z.boolean(), maxTransferMinutes:z.number().int().min(15).max(180),
 objective:z.enum(['time','cost']),
}).strict()).max(3)}).strict();
export const selectionSchema=z.object({candidateId:z.string().nullable(),reason:z.string().min(1).max(600),tradeoff:z.string().min(1).max(500)}).strict();
export const metrics=(p:ReturnType<typeof planIncident>)=>({priorityRequired:p.prioritySummary.requiredUnits,priorityAllocated:p.prioritySummary.allocatedUnits,coverage:p.coverage,allocatedUnits:p.allocatedUnits,unfilledUnits:p.unfilledUnits,cost:p.cost,lastDeliveryMinutes:p.lastDeliveryMinutes,averageDeliveryMinutes:p.allocatedUnits?p.allocations.reduce((n,a)=>n+a.units*a.etaMinutes,0)/p.allocatedUnits:null,transferUnits:p.transferUnits});
export function changes(from:Conditions,to:Conditions){const out:string[]=[];
 if(from.allowStoreTransfers!==to.allowStoreTransfers)out.push(`${to.allowStoreTransfers?'Enable':'Disable'} same-chain store transfers`);
 if(from.maxTransferMinutes!==to.maxTransferMinutes)out.push(`Transfer driving limit: ${from.maxTransferMinutes} → ${to.maxTransferMinutes} min`);
 if(from.objective!==to.objective)out.push(`Optimization objective: ${from.objective} → ${to.objective}`);
 return out;
}
export function calculateCandidates(c:Catalog,lotId:number,base:Conditions,raw:unknown,at?:string){
 const baseline=planIncident(c,lotId,base,at),seen=new Set<string>();
 const candidates=explorationSchema.parse(raw).proposals.flatMap((proposal,index)=>{
  const conditions=planConditions.parse({...base,allowStoreTransfers:proposal.allowStoreTransfers,maxTransferMinutes:proposal.maxTransferMinutes,objective:proposal.objective});
  const delta=changes(base,conditions),key=JSON.stringify(conditions);if(!delta.length||seen.has(key))return [];seen.add(key);
  const plan=planIncident(c,lotId,conditions,at);
  const improves=improvesRecovery(metrics(plan),metrics(baseline));
  return [{id:`option-${index+1}`,title:proposal.title,rationale:proposal.rationale,changes:delta,conditions,metrics:metrics(plan),improves}];
 });return {policyVersion:RECOVERY_POLICY_VERSION,baseline:metrics(baseline),candidates,bestCandidateIds:bestRecoveryIds(candidates.filter(c=>c.improves))};
}
export function selectedCandidate(result:ReturnType<typeof calculateCandidates>,raw:unknown){
 const selection=selectionSchema.parse(raw);
 if(selection.candidateId===null)return {selection,candidate:null};
 const candidate=result.candidates.find(c=>c.id===selection.candidateId);
 if(!candidate||!candidate.improves||!improvesRecovery(candidate.metrics,result.baseline))throw new Error('AI recommendation is not a verified improving alternative');
 if(!bestRecoveryIds(result.candidates.filter(c=>c.improves&&improvesRecovery(c.metrics,result.baseline))).includes(candidate.id))throw new Error('AI recommendation violates recovery and delivery-time priority');
 const b=result.baseline,m=candidate.metrics;
 const reason=m.allocatedUnits>b.allocatedUnits?`Recovers ${m.allocatedUnits-b.allocatedUnits} additional packs. Recovery coverage takes priority over delivery time and cost.`:m.priorityAllocated>b.priorityAllocated?`Supplies ${m.priorityAllocated-b.priorityAllocated} additional priority-store packs without reducing total recovery.`:m.lastDeliveryMinutes!==b.lastDeliveryMinutes?`Preserves recovery and priority-store supply while moving the last planned delivery from ${b.lastDeliveryMinutes} to ${m.lastDeliveryMinutes} min after approval.`:m.averageDeliveryMinutes!==b.averageDeliveryMinutes?`Preserves recovery and last delivery time while reducing pack-weighted average delivery time.`:`Preserves recovery and delivery times; lower modeled cost breaks the tie.`;
 const minutes=(v:number|null|undefined)=>v==null?'N/A':String(Math.round(v*10)/10);
 const tradeoff=`Allocated packs: ${b.allocatedUnits} → ${m.allocatedUnits}. Last planned delivery: ${minutes(b.lastDeliveryMinutes)} → ${minutes(m.lastDeliveryMinutes)} min after approval. Average delivery: ${minutes(b.averageDeliveryMinutes)} → ${minutes(m.averageDeliveryMinutes)} min. Modeled cost: $${b.cost} → $${m.cost}. Policy changes require your acceptance.`;
 return {selection:{...selection,reason,tradeoff},candidate};
}
