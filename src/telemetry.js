/** Lightweight per-second counters for a rolling 60s economy trace.
 * Diagnostics only: counters NEVER affect the actual economy or spawn logic.
 * Game simulation time stops when paused, as do the rate windows.
 */
export const METRIC_KEYS=Object.freeze([
 'oreCrushed','goldProduced','goldValueProduced','goldPaid','creditsPaid',
 'gateClones','restockedOre','restockedGold','recycled','blocked'
]);
const newCounters=()=>Object.fromEntries(METRIC_KEYS.map(key=>[key,0]));
export class EconomyTelemetry{
 constructor(windowSeconds=60){
  this.windowSeconds=Math.max(1,windowSeconds);
  this.seconds=new Map();this.totals=newCounters();
 }
 record(key,amount=1,time=0){
  if(!Object.hasOwn(this.totals,key)||!Number.isFinite(amount)||amount<=0)return;
  const second=Math.max(0,Math.floor(Number.isFinite(time)?time:0));
  let bucket=this.seconds.get(second);
  if(!bucket){bucket=newCounters();this.seconds.set(second,bucket);}
  bucket[key]+=amount;this.totals[key]+=amount;
  this.prune(second);
 }
 prune(second){
  for(const key of this.seconds.keys())if(key<=second-this.windowSeconds)this.seconds.delete(key);
 }
 snapshot(time=0){
  const second=Math.max(0,Math.floor(Number.isFinite(time)?time:0));
  this.prune(second);
  const recent=newCounters();
  for(const bucket of this.seconds.values())for(const key of METRIC_KEYS)recent[key]+=bucket[key];
  const measuredSeconds=Math.max(10,Math.min(this.windowSeconds,Number.isFinite(time)?time:0));
  return {recent,totals:{...this.totals},seconds:measuredSeconds,
   producedGoldPerMinute:recent.goldProduced*60/measuredSeconds,
   producedCreditsPerMinute:recent.goldValueProduced*60/measuredSeconds,
   paidCreditsPerMinute:recent.creditsPaid*60/measuredSeconds};
 }
}
