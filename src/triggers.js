/**
 * World-space gameplay triggers. Coordinates use the bottom of each particle;
 * render meshes and collision metadata refer to the same pads / recycler.
 * Trigger functions never mutate resources or assign economic credit.
 */
export function boxTrigger(x,z,halfX,halfZ,maxBottomY,minBottomY=-0.2){
 return Object.freeze({x,z,halfX,halfZ,maxBottomY,minBottomY});
}
export function insideTrigger(p,box){
 if(!box||!p||p.dead)return false;
 const y=p.y??0;
 return Number.isFinite(p.x)&&Number.isFinite(p.z)&&Number.isFinite(y)&&
  Math.abs(p.x-box.x)<=box.halfX&&Math.abs(p.z-box.z)<=box.halfZ&&
  y>=box.minBottomY&&y<=box.maxBottomY;
}
/** Require a real outside->inside transition within the simulation step.
 * A coin already lying on a pad will NOT be paid by driving near the station.
 */
export function enteredTrigger(p,box){
 if(!insideTrigger(p,box))return false;
 const previous={x:p._frameX??p.x,z:p._frameZ??p.z,y:p._frameY??p.y};
 return !insideTrigger(previous,box);
}
/** Crossing is defined by the two sides of the plane, without a minimum
 * frame-displacement threshold. Rearming / jitter suppression is separate.
 */
export function crossedGatePlane(p,gate){
 const from=p._frameZ??p.z,to=p.z;
 if(!Number.isFinite(from)||!Number.isFinite(to)||from===gate.z)return 0;
 const direction=from<gate.z&&to>=gate.z?1:from>gate.z&&to<=gate.z?-1:0;
 if(!direction)return 0;
 const aperture=gate.apertureHalf??(gate.half-.25);
 // Test X where the object actually crossed the plane. Checking only the
 // ending X incorrectly misses diagonal crossings that exit beside a pillar,
 // and accepts objects that crossed the plane outside the gate opening.
 const t=(gate.z-from)/(to-from);
 const previousX=Number.isFinite(p._frameX)?p._frameX:p.x;
 const atPlaneX=previousX+(p.x-previousX)*t;
 if(!Number.isFinite(atPlaneX)||Math.abs(atPlaneX-gate.x)>=aperture)return 0;
 return direction;
}

/** Continuous outside-to-inside intersection against a finite-height payment
 * pad. A fast coin may cross the entire pad in one physics frame. A coin
 * already on the pad at frame start is not paid just because the truck arrived.
 */
export function sweptEntryTrigger(p,box){
 if(!box||!p||p.dead)return false;
 const from={x:p._frameX??p.x,z:p._frameZ??p.z,y:p._frameY??p.y??0};
 if(insideTrigger(from,box))return false;
 if(insideTrigger(p,box))return true;
 const to={x:p.x,z:p.z,y:p.y??0};
 let entry=0,exit=1;
 for(const [axis,low,high] of [
  ['x',box.x-box.halfX,box.x+box.halfX],
  ['z',box.z-box.halfZ,box.z+box.halfZ],
  ['y',box.minBottomY,box.maxBottomY]]){
  const start=from[axis],finish=to[axis];
  if(!Number.isFinite(start)||!Number.isFinite(finish))return false;
  const delta=finish-start;
  if(Math.abs(delta)<1e-9){
   if(start<low||start>high)return false;
   continue;
  }
  const t0=(low-start)/delta,t1=(high-start)/delta;
  entry=Math.max(entry,Math.min(t0,t1));
  exit=Math.min(exit,Math.max(t0,t1));
  if(entry>exit)return false;
 }
 return entry<=1&&exit>=0;
}
