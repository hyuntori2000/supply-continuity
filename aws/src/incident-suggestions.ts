import {z} from 'zod';
import {planConditions,planIncident,type Catalog,type Conditions} from './incident-engine';

// AI proposes bounded policy changes, never inventory, safety or allocations.
export const explorationSchema=z.object({proposals:z.array(z.object({
 title:z.string().min(1).max(100), rationale:z.string().min(1).max(500),
 allowStoreTransfers:z.boolean(), maxTransferMinutes:z.number().int().min(15).max(180),
 objective:z.enum(['time','cost']),
}).strict()).max(3)}).strict();
export const selectionSchema=z.object({candidateId:z.string().nullable(),reason:z.string().min(1).max(600),tradeoff:z.string().min(1).max(500)}).strict();
export const metrics=(p:ReturnType<typeof planIncident>)=>({coverage:p.coverage,allocatedUnits:p.allocatedUnits,unfilledUnits:p.unfilledUnits,cost:p.cost,lastDeliveryMinutes:p.lastDeliveryMinutes,transferUnits:p.transferUnits});
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
  // No fewer supplied packs; improvements and possible tradeoffs stay explicit.
  const improves=plan.allocatedUnits>=baseline.allocatedUnits&&(plan.allocatedUnits>baseline.allocatedUnits||plan.cost<baseline.cost-0.01||(plan.lastDeliveryMinutes!==null&&baseline.lastDeliveryMinutes!==null&&plan.lastDeliveryMinutes<baseline.lastDeliveryMinutes));
  return [{id:`option-${index+1}`,title:proposal.title,rationale:proposal.rationale,changes:delta,conditions,metrics:metrics(plan),improves}];
 });return {baseline:metrics(baseline),candidates};
}
export function selectedCandidate(result:ReturnType<typeof calculateCandidates>,raw:unknown){
 const selection=selectionSchema.parse(raw);
 if(selection.candidateId===null)return {selection,candidate:null};
 const candidate=result.candidates.find(c=>c.id===selection.candidateId);
 if(!candidate||!candidate.improves)throw new Error('AI recommendation is not a verified improving alternative');
 return {selection,candidate};
}
