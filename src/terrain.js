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
 const {bounds,rivers}=terrain;let contacts=0;
 const oldX=previous?.x??p.x,oldZ=previous?.z??p.z;
 const limit=(value,min,max)=>clamp(value,min,max);
 const x=limit(p.x,bounds.minX+radius,bounds.maxX-radius);
 const z=limit(p.z,bounds.minZ+radius,bounds.maxZ-radius);
 if(x!==p.x||z!==p.z){p.x=x;p.z=z;contacts++;}
 for(const r of rivers){
  if(p.z<r.zMin-radius||p.z>r.zMax+radius)continue;
  const edge=(r.width||0)*.5-radius-.04;
  const insideBridge=edge>0&&Math.abs(p.x-r.x)<=edge;
  if(insideBridge)continue;
  // Already in the corridor: prevent lateral slipping off the bridge deck.
  const startedInside=oldZ>=r.zMin-radius&&oldZ<=r.zMax+radius;
  const oldOnBridge=edge>0&&Math.abs(oldX-r.x)<=edge;
  if(startedInside&&oldOnBridge){
   p.x=clamp(p.x,r.x-edge,r.x+edge);contacts++;
   continue;
  }
  // River bank is impermeable outside the bridge aperture.
  const southern=oldZ<r.zMin+radius || (startedInside && oldZ<= (r.zMin+r.zMax)*.5);
  p.z=southern?r.zMin-radius-.003:r.zMax+radius+.003;
  contacts++;
 }
 return contacts;
}
