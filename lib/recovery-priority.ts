// Shared recommendation policy. Negative means a is preferred to b.
// Fulfillment wins first; money can only break a tie in recovery and timing.
export const RECOVERY_POLICY_VERSION='fulfillment-time-cost-v1';
export type RecoveryMetrics={allocatedUnits:number;priorityAllocated:number;lastDeliveryMinutes?:number|null;averageDeliveryMinutes?:number|null;cost:number};
export function compareRecoveryMetrics(a:RecoveryMetrics,b:RecoveryMetrics){
 const time=(m:RecoveryMetrics)=>m.lastDeliveryMinutes??m.averageDeliveryMinutes??Infinity;
 const average=(m:RecoveryMetrics)=>m.averageDeliveryMinutes??time(m);
 const pairs=[[b.allocatedUnits,a.allocatedUnits],[b.priorityAllocated,a.priorityAllocated],[time(a),time(b)],[average(a),average(b)],[a.cost,b.cost]];
 for(const [x,y] of pairs)if(x!==y)return x<y?-1:1;
 return 0;
}
export function improvesRecovery(a:RecoveryMetrics,b:RecoveryMetrics){
 return a.allocatedUnits>=b.allocatedUnits&&a.priorityAllocated>=b.priorityAllocated&&compareRecoveryMetrics(a,b)<0;
}
export function bestRecoveryIds<T extends {id:string;metrics:RecoveryMetrics}>(items:T[]){
 if(!items.length)return [];
 const best=items.reduce((a,b)=>compareRecoveryMetrics(a.metrics,b.metrics)<=0?a:b);
 return items.filter(x=>compareRecoveryMetrics(x.metrics,best.metrics)===0).map(x=>x.id);
}
