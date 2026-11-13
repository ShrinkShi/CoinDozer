/** Visible-resource economy. One particle always represents one real item. */
export const MAX_RESOURCES = 6500;
export const UPGRADE_COSTS = Object.freeze([150, 600, 2500, 6000]);
export const MAX_VEHICLE_LEVEL = UPGRADE_COSTS.length;
export function upgradeCost(level){ return UPGRADE_COSTS[level] ?? 0; }
export function remainingCost(level, deposited){
  return Math.max(0, upgradeCost(level) - deposited);
}
export function applyUpgradePayment(progress, quantity=1){
  let {level,deposited}=progress;
  let spent=0, upgrades=0;
  for(let i=0;i<quantity && level<MAX_VEHICLE_LEVEL;i++){
    deposited++;spent++;
    if(deposited>=upgradeCost(level)){
      level++;deposited=0;upgrades++;
    }
  }
  return {level,deposited,spent,upgrades,remaining:remainingCost(level,deposited)};
}
