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
// Five visible cargo-box tiers. Capacity is a count of real coin entities,
// not a virtual balance or a compressed render batch.
export const CARGO_LAYOUTS=Object.freeze([
 Object.freeze({capacity:20,columns:4,rows:5,layers:1,spacing:.52}),
 Object.freeze({capacity:40,columns:4,rows:5,layers:2,spacing:.52}),
 Object.freeze({capacity:70,columns:5,rows:7,layers:2,spacing:.52}),
 Object.freeze({capacity:110,columns:5,rows:8,layers:3,spacing:.52}),
 Object.freeze({capacity:160,columns:5,rows:8,layers:4,spacing:.52})
]);
export const CARGO_CAPACITIES=Object.freeze(CARGO_LAYOUTS.map(x=>x.capacity));
export const CARGO_COSTS=Object.freeze([25,55,110,240]);
// Each of the five fixed conveyor sites has one build tier and three upgrades.
// All costs are paid with the same individually carried physical coins.
export const CONVEYOR_COUNT=5;
export const BELT_COSTS=Object.freeze([24,60,120,200]);
export const BELT_LABELS=Object.freeze(['原矿上料','南岸接驳','主桥运输','粉碎机上料','金币出料']);
export function cargoCapacity(tracks){
 const level=Math.min(CARGO_CAPACITIES.length-1,Math.max(0,Math.floor(tracks?.cargo?.level||0)));
 return CARGO_CAPACITIES[level];
}
export const CRUSHER_COSTS=Object.freeze([35,75,135,240]);
export const CRUSHER_YIELDS=Object.freeze([3,4,5,6,7]);
export const BRIDGE_COSTS=Object.freeze([30,65,115,210]);
export const EXIT_COSTS=Object.freeze([350]);
export const INFRA_COSTS=Object.freeze({
 crusher:CRUSHER_COSTS,bridge:BRIDGE_COSTS,exit:EXIT_COSTS
});
export const INFRA_LABELS=Object.freeze({
 crusher:'粉碎门收益',bridge:'主桥宽度',exit:'冰雪关卡通路'
});
export function crusherYield(tracks){
 return CRUSHER_YIELDS[Math.min(CRUSHER_YIELDS.length-1,Math.max(0,tracks?.crusher?.level||0))];
}
export const TRACK_COSTS = Object.freeze({
 chassis:UPGRADE_COSTS,
 speed:Object.freeze([18,38,72,120]),
 steering:Object.freeze([15,34,62,105]),
 blade:Object.freeze([24,48,90,150]),
 coin:Object.freeze([25,55,110,240]),
 cargo:CARGO_COSTS
});
export const TRACK_LABELS=Object.freeze({chassis:'底盘换代',speed:'行驶速度',steering:'转向速度',blade:'铲斗宽度',coin:'金币价值',cargo:'货箱容量'});
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
 // Extend the existing v0.6 tracks in place; never reset a paid upgrade.
 for(const key of Object.keys(INFRA_COSTS)){
  let record=raw.tracks?.[key]??{};
  // Users who already entered stage two before the locked-bridge update
  // must not be stranded by save migration.
  if(key==='exit'&&!raw.tracks?.exit&&raw.stage===1)record={level:1,deposited:0};
  tracks[key]=makeTrack(record,INFRA_COSTS[key]);
 }
 const gates=Array.from({length:4},(_,i)=>makeTrack(raw.gates?.[i]??{},GATE_COSTS));
 // Cave gate upgrades are saved separately from the four lava-field gates.
 // Missing caveGates is valid for every legacy v0.6.x save.
 const caveGates=Array.from({length:2},(_,i)=>makeTrack(raw.caveGates?.[i]??{},GATE_COSTS));
 const belts=Array.from({length:CONVEYOR_COUNT},(_,i)=>makeTrack(raw.belts?.[i]??{},BELT_COSTS));
 const selected=TRACK_KEYS.includes(raw.selected)?raw.selected:'chassis';
 return {tracks,gates,caveGates,belts,selected,totalDeposited:nonnegative(raw.totalDeposited)};
}
export function trackRemaining(track,costs){return track.level<costs.length?Math.max(0,costs[track.level]-track.deposited):0;}
export function gateFactor(track){return GATE_FACTORS[Math.min(track.level,GATE_FACTORS.length-1)];}
export function coinCredit(tracks){return COIN_VALUES[Math.min(tracks.coin.level,COIN_VALUES.length-1)];}
export function vehicleSpeed(tracks,frame=0){return 5.55+Math.min(4,frame)*.25+tracks.speed.level*.98;}
export function vehicleTurnRate(tracks){return 7.5+tracks.steering.level*1.55;}
export function bucketScale(tracks){return 1+tracks.blade.level*.17;}
