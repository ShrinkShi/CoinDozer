import {coinCredit} from './economy.js';
/** Stage-specific gameplay rules.
 * All resources remain individual physical particles in world.resources.
 * A higher ingot credit value changes ONLY credits earned per consumed ingot.
 * Gate progress is local to the map; chassis upgrades are shared.
 */
export const SCENE_RULES=Object.freeze({
 0:Object.freeze({id:0,name:'冰河矿场',ore:'blue',currency:'gold',
  yield:3,creditFactor:1,gateCount:1,
  // Ore must be multiplied then processed. Gold is NOT auto-created.
  oreSupply:{x:0,z:-39,below:180,batch:100,radius:6.5},
  currencySupply:{x:0,z:13,below:0,batch:0,radius:2.8}}),
 1:Object.freeze({id:1,name:'冰雪矿区',ore:'pearl',currency:'ingot',
  yield:3,creditFactor:3,gateCount:2,
  oreSupply:{x:2.0,z:7.6,below:180,batch:90,radius:3.4},
  currencySupply:{x:9.1,z:3.6,below:125,batch:65,radius:3.0}})
});
export function sceneRules(stage){
 if(!Object.hasOwn(SCENE_RULES,stage))throw new RangeError('Unknown stage: '+stage);
 return SCENE_RULES[stage];
}
export function isStageCurrency(stage,kind){return kind===sceneRules(stage).currency;}
export function isStageOre(stage,kind){return kind===sceneRules(stage).ore;}
export function paymentValue(stage,tracks){
 return coinCredit(tracks)*sceneRules(stage).creditFactor;
}
