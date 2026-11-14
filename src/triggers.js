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
 if(Math.abs(p.x-gate.x)>=aperture)return 0;
 return direction;
}
