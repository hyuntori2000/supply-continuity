import type {RecoveryPlan, Scenario} from './continuity';

export type CompletedTool = {name: string; output: any};
export type PlanComparison = {
  request: string;
  before: RecoveryPlan;
  after: RecoveryPlan;
  planId: string;
  model: string;
  tools: CompletedTool[];
  completedAt: string;
};
export const requiredTools = ['verify_recall', 'inspect_dependencies', 'record_product_assessment', 'set_scenario', 'optimize_recovery'];
const ids = (values: number[]) => [...new Set(values)].sort((a,b)=>a-b).join(',');
export function scenarioKey(s: Scenario) {
  return JSON.stringify([ids(s.closedFacilityIds), ids(s.blockedSupplierIds), s.objective, s.trafficMultiplier, !!s.enableStoreTransfers, [...(s.regionalTraffic||[])].sort((a,b)=>a.region.localeCompare(b.region)).map(x=>[x.region,x.multiplier,x.assumed]),ids(s.directDispatchSupplierIds||[]),[...(s.supplierCapacityLimits||[])].sort((a,b)=>a.supplierId-b.supplierId).map(x=>[x.supplierId,x.availableKg])]);
}

// Only attach a comparison to a completed Bedrock plan with the applied scenario tool evidence.
export function captureComparison(before: RecoveryPlan, request: string, final: any, tools: CompletedTool[]): PlanComparison | null {
  if (final.source !== 'amazon-bedrock' || !final.id || !final.model || !final.plan?.timing || !final.scenario) return null;
  if (!requiredTools.every((name,i)=>tools[i]?.name===name)) return null;
  const applied = tools.find(t=>t.name==='set_scenario')?.output?.scenario;
  if (!applied || scenarioKey(applied)!==scenarioKey(final.scenario) || scenarioKey(final.plan.scenario)!==scenarioKey(final.scenario)) return null;
  return structuredClone({request, before, after:final.plan, planId:final.id, model:final.model, tools, completedAt:new Date().toISOString()});
}

export function constraintChanges(before: RecoveryPlan, after: RecoveryPlan) {
  const a=before.scenario,b=after.scenario;
  const suppliers=new Map([...before.suppliers,...after.suppliers].map(s=>[s.farmId,`${s.id} · ${s.city}`]));
  const facility=(id:number)=>({1:'Richmond packer',5:'Oakland warehouse'}[id]||`Facility ${id}`);
  const list=(values:number[],label:(id:number)=>string)=>[...new Set(values)].sort((a,b)=>a-b).map(label).join(', ')||'None';
  const regions:Record<string,string>={north_bay:'North Bay',east_bay:'East Bay',peninsula:'Peninsula',south_bay:'South Bay',san_francisco:'San Francisco'};
  const traffic=(s:Scenario)=>[...(s.regionalTraffic||[])].sort((a,b)=>a.region.localeCompare(b.region)).map(x=>`${regions[x.region]} ×${x.multiplier}${x.assumed?' (assumed)':''}`).join(', ')||'No regional delay';
  const capacity=(s:Scenario)=>[...(s.supplierCapacityLimits||[])].sort((a,b)=>a.supplierId-b.supplierId).map(x=>`${suppliers.get(x.supplierId)||x.supplierId}: ≤${x.availableKg} kg`).join(', ')||'Catalog availability';
  const goals={continuity:'Maintain supply',time:'Delivery time',cost:'Modeled cost'};
  return [
    {label:'Closed facilities',before:list(a.closedFacilityIds,facility),after:list(b.closedFacilityIds,facility)},
    {label:'Unavailable suppliers',before:list(a.blockedSupplierIds,id=>suppliers.get(id)||`Supplier ${id}`),after:list(b.blockedSupplierIds,id=>suppliers.get(id)||`Supplier ${id}`)},
    {label:'Allocation objective',before:goals[a.objective],after:goals[b.objective]},
    {label:'Travel-time multiplier',before:`${a.trafficMultiplier}×`,after:`${b.trafficMultiplier}×`},
    {label:'Regional traffic',before:traffic(a),after:traffic(b)},
    {label:'Approved direct dispatch',before:list(a.directDispatchSupplierIds||[],id=>suppliers.get(id)||`Supplier ${id}`),after:list(b.directDispatchSupplierIds||[],id=>suppliers.get(id)||`Supplier ${id}`)},
    {label:'Spare-stock limits',before:capacity(a),after:capacity(b)},
    {label:'Same-chain store transfers',before:a.enableStoreTransfers?'Enabled':'Disabled',after:b.enableStoreTransfers?'Enabled':'Disabled'},
  ].filter(row=>row.before!==row.after);
}

export function sourceChanges(before:RecoveryPlan,after:RecoveryPlan) {
  const amounts=(plan:RecoveryPlan)=>{
    const result=new Map<string,{name:string;kg:number}>();
    for(const a of plan.allocations){
      const key=`${a.sourceKind}:${a.offerId}`;
      const name=a.sourceKind==='store'?`Store · ${a.supplier}`:`Supplier ${a.offerId} · ${a.city}`;
      result.set(key,{name,kg:(result.get(key)?.kg||0)+a.kg});
    }
    return result;
  };
  const a=amounts(before),b=amounts(after);
  return [...new Set([...a.keys(),...b.keys()])].map(key=>({key,name:(b.get(key)||a.get(key))!.name,before:a.get(key)?.kg||0,after:b.get(key)?.kg||0})).filter(r=>r.before!==r.after);
}
