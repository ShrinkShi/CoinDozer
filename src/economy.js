/** CoinDozer v0.6 economy. Each particle is one visible physical coin.
 * Coin-value upgrades increase CREDIT paid per coin, not object count.
 * Balances are intentionally station-local, with no invisible wallet.
 */
export const MAX_RESOURCES = 6500;
// Gameplay pacing: always count individual visible resources. Refilling pauses
// well before the hard cap, leaving space for actual 1->3 crushing and portals.
export const SUPPLY=Object.freeze({
 interval:15,holdAt:Math.floor(MAX_RESOURCES*.86),
 goldBelow:280,oreBelow:220,goldBatch:90,oreBatch:110,
 starterCoins:42
});
export const UPGRADE_COSTS = Object.freeze([30,90,240,600]);
export const MAX_VEHICLE_LEVEL = UPGRADE_COSTS.length;
export const GATE_FACTORS = Object.freeze([2,3,5,8,12,16,20]);
export const GATE_COSTS = Object.freeze([12,25,50,85,140,220]);
export const COIN_VALUES = Object.freeze([1,2,3,5,8]);
export const TRACK_COSTS = Object.freeze({
 chassis:UPGRADE_COSTS,
 speed:Object.freeze([18,38,72,120]),
 steering:Object.freeze([15,34,62,105]),
 blade:Object.freeze([24,48,90,150]),
 coin:Object.freeze([25,55,110,240])
});
export const TRACK_LABELS=Object.freeze({chassis:'底盘换代',speed:'行驶速度',steering:'转向速度',blade:'铲斗宽度',coin:'金币价值'});
export const TRACK_KEYS=Object.freeze(Object.keys(TRACK_COSTS));
const nonnegative=(v,limit=1e8)=>Number.isFinite(Number(v))?Math.min(limit,Math.max(0,Math.floor(Number(v)))):0;
export function boundedTier(level,costs){return Math.min(costs.length,nonnegative(level,costs.length));}
export function upgradeCost(level){return UPGRADE_COSTS[level]??0;}
export function remainingCost(level,deposited){return Math.max(0,upgradeCost(level)-deposited);}
export function makeTrack(data={},costs=UPGRADE_COSTS){
 const level=boundedTier(data.level,costs),deposited=level===costs.length?0:Math.min(costs[level]-1,nonnegative(data.deposited));
 return {level,deposited};
}
/** Applies credit to exactly one upgrade category, rolling surplus into next tier.
 * Once a category reaches MAX, further coins must NOT be consumed by a station.
 */
export function applyCredit(data,amount,costs){
 const start=makeTrack(data,costs);let {level,deposited}=start,upgrades=0;
 let credit=nonnegative(amount);
 while(credit>0 && level<costs.length){
  const required=costs[level]-deposited,paid=Math.min(required,credit);
  deposited+=paid;credit-=paid;
  if(deposited>=costs[level]){level++;deposited=0;upgrades++;}
 }
 return {level,deposited,upgrades,spent:nonnegative(amount)-credit,unused:credit,
  remaining:level<costs.length?costs[level]-deposited:0};
}
/** Legacy interface still used by v0.5.x saved-progress migration. */
export function applyUpgradePayment(progress,quantity=1){return applyCredit(progress,quantity,UPGRADE_COSTS);}
export function newProgress(raw={}){
 const tracks={};
 for(const key of TRACK_KEYS){
  if(key==='chassis'&&!raw.tracks?.chassis){
   // Older v0.5 saves used a single deposited amount; carry excess across
   // the now-cheaper tiers rather than capping away already paid coins.
   tracks.chassis=applyCredit({level:boundedTier(raw.level,UPGRADE_COSTS),deposited:0},nonnegative(raw.deposited),UPGRADE_COSTS);
  }else tracks[key]=makeTrack(raw.tracks?.[key]??{},TRACK_COSTS[key]);
 }
 const gates=Array.from({length:4},(_,i)=>makeTrack(raw.gates?.[i]??{},GATE_COSTS));
 // Cave gate upgrades are saved separately from the four lava-field gates.
 // Missing caveGates is valid for every legacy v0.6.x save.
 const caveGates=Array.from({length:2},(_,i)=>makeTrack(raw.caveGates?.[i]??{},GATE_COSTS));
 const selected=TRACK_KEYS.includes(raw.selected)?raw.selected:'chassis';
 return {tracks,gates,caveGates,selected,totalDeposited:nonnegative(raw.totalDeposited)};
}
export function trackRemaining(track,costs){return track.level<costs.length?Math.max(0,costs[track.level]-track.deposited):0;}
export function gateFactor(track){return GATE_FACTORS[Math.min(track.level,GATE_FACTORS.length-1)];}
export function coinCredit(tracks){return COIN_VALUES[Math.min(tracks.coin.level,COIN_VALUES.length-1)];}
export function vehicleSpeed(tracks,frame=0){return 5.55+Math.min(4,frame)*.25+tracks.speed.level*.98;}
export function vehicleTurnRate(tracks){return 7.5+tracks.steering.level*1.55;}
export function bucketScale(tracks){return 1+tracks.blade.level*.17;}
