import type {Scenario} from './continuity';

// Explicit synthetic stock report, not a target percentage supplied to the agent.
export const coverageDemoScenario:Scenario={
  closedFacilityIds:[],blockedSupplierIds:[],objective:'continuity',trafficMultiplier:1,
  enableStoreTransfers:false,regionalTraffic:[],directDispatchSupplierIds:[],
  supplierCapacityLimits:[{supplierId:2,availableKg:200},{supplierId:4,availableKg:200},{supplierId:6,availableKg:332}],
};
export const coverageDemoRequest='Our operations team can authorize transfers of safe surplus stock between stores of the same retailer. Enable those transfers while protecting donor minimum inventory and excluding recalled lots. Keep the current supplier stock limits (B 200 kg, D 200 kg, F 332 kg) and all other conditions unchanged. Prioritize continuity and recalculate the recovery plan.';
