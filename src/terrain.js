import {LONG_MAP,mainBridgeWidth,nextBridgeUnlocked} from './mapLayout.js';
import {clamp} from './math.js';

/** Spatial barriers match the visual two frozen rivers exactly.
 * No hidden numeric teleports and no item deletion. Particles and vehicle
 * share this rule. The bridge is the only dry crossing.
 */
export function configureTerrain(world,tracks){
 if(world.stage!==0)return;
 const b=LONG_MAP;
 const width=mainBridgeWidth(tracks);
 const northOpen=nextBridgeUnlocked(tracks);
 world.bridges={main:{x:0,z:b.river1.z,width,depth:b.river1.halfDepth*2},
  next:{x:0,z:b.river2.z,width:northOpen?b.nextBridge.width:0,
   depth:b.river2.halfDepth*2,unlocked:northOpen}};
 world.terrain={bounds:b.bounds,rivers:[
  {zMin:b.river1.z-b.river1.halfDepth,zMax:b.river1.z+b.river1.halfDepth,
   x:0,width},
  {zMin:b.river2.z-b.river2.halfDepth,zMax:b.river2.z+b.river2.halfDepth,
   x:0,width:northOpen?b.nextBridge.width:0}
 ]};
}

/** Constrain an individual circular footprint with a continuous river bank.
 * Using previous position prevents fast updates or crowded impulse solutions
 * from teleporting through the water between physics substeps.
 * Radius is the actual horizontal body radius, not an invented bridge width.
 */
export function constrainToTerrain(p,previous,terrain,radius=.3){
 if(!terrain||!p||p.dead)return 0;
 const {bounds,rivers}=terrain;
 const oldX=Number.isFinite(previous?.x)?previous.x:p.x;
 const oldZ=Number.isFinite(previous?.z)?previous.z:p.z;
 let contacts=0;
 const x=clamp(p.x,bounds.minX+radius,bounds.maxX-radius);
 const z=clamp(p.z,bounds.minZ+radius,bounds.maxZ-radius);
 if(x!==p.x||z!==p.z){p.x=x;p.z=z;contacts++;}
 const EPS=.003;
 for(const r of rivers){
  // A circular body's CENTER may enter the open bridge corridor only after
  // subtracting its radius and a small safety margin from the deck width.
  const south=r.zMin-radius,north=r.zMax+radius;
  const half=(r.width||0)/2-radius-.04;
  const onBridge=x=>half>0&&Math.abs(x-r.x)<=half;
  const corridor=x=>clamp(x,r.x-half,r.x+half);
  const wasSouth=oldZ<south,wasNorth=oldZ>north;
  const nowSouth=p.z<south,nowNorth=p.z>north;
  if((wasSouth&&nowSouth)||(wasNorth&&nowNorth))continue;
  // True swept crossing: checking only final Z misses a body jumping from one
  // bank to the other during a long frame or a large collision impulse.
  if(wasSouth||wasNorth){
   const bank=wasSouth?south:north;
   const travelZ=p.z-oldZ;
   if(Math.abs(travelZ)<1e-9)continue;
   const atZ=z0=>oldX+(p.x-oldX)*(z0-oldZ)/travelZ;
   const entersAt=atZ(bank);
   const exitsOpposite=wasSouth?nowNorth:nowSouth;
   const exitsAt=exitsOpposite?atZ(wasSouth?north:south):entersAt;
   if(!onBridge(entersAt)||(exitsOpposite&&!onBridge(exitsAt))){
    p.z=wasSouth?south-EPS:north+EPS;
    contacts++;
    continue;
   }
   if(!exitsOpposite&&!onBridge(p.x)){
    p.x=corridor(p.x);contacts++;
   }
   continue;
  }
  // Started over a river, inside the legitimate bridge strip: a sideways
  // impulse may not throw the vehicle or a particle into open water.
  if(onBridge(oldX)){
   const crossingOut=p.z<south||p.z>north;
   if(crossingOut){
    const edgeZ=p.z<south?south:north;
    const t=(edgeZ-oldZ)/(p.z-oldZ||1);
    const exitX=oldX+(p.x-oldX)*t;
    if(!onBridge(exitX)){p.x=corridor(p.x);contacts++;}
   }else if(!onBridge(p.x)){p.x=corridor(p.x);contacts++;}
   continue;
  }
  // Corrupt/legacy states already above water without a supporting bridge
  // should settle on their nearest bank, not tunnel to the opposite bank.
  if(p.z>=south&&p.z<=north){
   p.z=Math.abs(oldZ-south)<=Math.abs(oldZ-north)?south-EPS:north+EPS;
   contacts++;
  }else if((oldZ-south)*(p.z-south)<0||(oldZ-north)*(p.z-north)<0){
   p.z=Math.abs(oldZ-south)<=Math.abs(oldZ-north)?south-EPS:north+EPS;
   contacts++;
  }
 }
 return contacts;
}
