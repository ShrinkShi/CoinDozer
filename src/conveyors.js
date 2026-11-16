/** Fixed, paid, contact-driven conveyor network for the first long map.
 * The five sites are never freely placeable; all effects act on the existing
 * individually simulated bodies. No teleportation, passive minting or cloning.
 */
import {clamp} from './math.js';

export const CONVEYOR_SITES=Object.freeze([
 Object.freeze({id:0,key:'intake',label:'原矿上料',kind:'blue',axis:'z',x:0,z:-35,from:-45,to:-25,padX:-24,padZ:-40}),
 Object.freeze({id:1,key:'south',label:'南岸接驳',kind:'blue',axis:'z',x:0,z:-19.3,from:-25.4,to:-13.2,padX:-24,padZ:-20}),
 Object.freeze({id:2,key:'bridge',label:'主桥运输',kind:'blue',axis:'z',x:0,z:-7.8,from:-13.8,to:-1.8,padX:22,padZ:-.3}),
 Object.freeze({id:3,key:'north',label:'粉碎机上料',kind:'blue',axis:'z',x:0,z:3.8,from:-2.3,to:9.9,padX:-24,padZ:4}),
 Object.freeze({id:4,key:'gold',label:'金币出料',kind:'gold',axis:'x',x:7.7,z:8,from:1.2,to:14.2,padX:27,padZ:7})
]);

export function beltGeometry(site,level,bridgeWidth=12){
 const tier=clamp(Math.floor(level||0),0,4);
 if(tier<=0)return null;
 const extension=(tier-1)*.65;
 const min=site.from-extension,max=site.to+extension;
 const width=Math.min(site.key==='bridge'?bridgeWidth-1.0:20,3.6+(tier-1)*.85);
 return {id:site.id,key:site.key,label:site.label,kind:site.kind,axis:site.axis,
  x:site.axis==='x'?(min+max)/2:site.x,
  z:site.axis==='z'?(min+max)/2:site.z,
  min,max,width,speed:6.4+(tier-1)*1.9,level:tier,
  // A conveyor over the river is supported by the same physical bridge.
  deckY:site.key==='bridge'?.52:.20};
}
export function activeConveyors(records=[],bridgeWidth=12){
 const result=[];
 for(const site of CONVEYOR_SITES){
  const belt=beltGeometry(site,records[site.id]?.level||0,bridgeWidth);
  if(belt)result.push(belt);
 }
 return result;
}
/** Inclusive contact area in the horizontal plane; touching only the belt
 * body (not the upgrade pad) can propel a resource. Airborne bodies are ignored.
 */
export function beltContact(body,belt){
 if(!belt||!body||body.dead||body.cargoState||body.kind!==belt.kind||
  (body.y||0)>.75)return false;
 const forward=belt.axis==='z'?body.z:body.x;
 const lateral=belt.axis==='z'?body.x:body.z;
 const centre=belt.axis==='z'?belt.x:belt.z;
 return forward>=belt.min&&forward<=belt.max&&Math.abs(lateral-centre)<=belt.width*.5;
}
/** Conveyor traction changes VELOCITY, not position. Normal granular physics
 * integrates and collides the body afterwards, including the bridge barrier.
 * dt is a granular substep and may be called repeatedly per rendered frame.
 */
export function conveyorImpulse(body,belts,dt){
 if(!belts||!belts.length||body.dead||body.cargoState)return false;
 for(const belt of belts){
  if(!beltContact(body,belt))continue;
  const strength=Math.min(1,dt*18);
  if(belt.axis==='z'){
   body.vz=(body.vz||0)+(belt.speed-(body.vz||0))*strength;
   body.vx=(body.vx||0)*(1-Math.min(1,dt*4.5));
  }else{
   body.vx=(body.vx||0)+(belt.speed-(body.vx||0))*strength;
   body.vz=(body.vz||0)*(1-Math.min(1,dt*4.5));
  }
  return true;
 }
 return false;
}
