/** Pure, deterministic tracked-chassis visual kinematics.
 * This module does not affect vehicle collision geometry or game economy.
 * Both the scene preview and the live vehicle use the same rig calculations.
 */
export const TRACK_RADIUS=0.43;
export const TRACK_HALF_STRAIGHT=1.034;
export const TRACK_LINKS=26;
export const TRACK_LENGTH=4*TRACK_HALF_STRAIGHT+2*Math.PI*TRACK_RADIUS;
export function trackLinkPose(distance,index,count=TRACK_LINKS){
 const n=Math.max(1,Math.floor(count)),r=TRACK_RADIUS,a=TRACK_HALF_STRAIGHT;
 const length=4*a+2*Math.PI*r;
 const u=((distance+index*length/n)%length+length)%length;
 if(u<2*a)return {z:-a+u,y:-r,pitch:0};
 if(u<2*a+Math.PI*r){
  const angle=(u-2*a)/r;
  return {z:a+r*Math.sin(angle),y:-r*Math.cos(angle),pitch:-angle};
 }
 if(u<4*a+Math.PI*r)return {z:a-(u-2*a-Math.PI*r),y:r,pitch:-Math.PI};
 const angle=(u-4*a-Math.PI*r)/r;
 return {z:-a-r*Math.sin(angle),y:r*Math.cos(angle),pitch:-Math.PI-angle};
}
/** Integrate actual ground movement and yaw, allowing stationary turning to
 * move the two belts in opposite directions. Missing visual fields are fine
 * for older tests and restored progress (vehicle visual state is ephemeral).
 */
export function advanceTrackOdometer(player,previous){
 const dx=player.x-previous.x,dz=player.z-previous.z;
 const fx=Math.sin(player.yaw),fz=-Math.cos(player.yaw);
 const travel=dx*fx+dz*fz;
 const yawDelta=Math.atan2(Math.sin(player.yaw-previous.yaw),Math.cos(player.yaw-previous.yaw));
 const radius=.99*(1+Math.min(4,Math.max(0,player.level||0))*.055);
 const left=travel+yawDelta*radius,right=travel-yawDelta*radius;
 player.trackLeft=(player.trackLeft||0)+left;
 player.trackRight=(player.trackRight||0)+right;
 player.travelDistance=(player.travelDistance||0)+Math.abs(travel);
 return {left,right,travel,yawDelta};
}
export function vehicleVisualStyle(player){
 const bounded=v=>Math.max(0,Math.min(4,Math.floor(Number.isFinite(v)?v:0)));
 const level=bounded(player.level),blade=bounded(player.bladeLevel);
 return {
  level,blade,speed:bounded(player.speedLevel),steering:bounded(player.steeringLevel),
  coin:bounded(player.coinLevel),
  scale:1+level*.055,
  bladeScale:1+blade*.17,
  trackWidth:.77+level*.045,
  armour:level>=2,
  canopy:level>=3,
  reinforced:level>=4
 };
}
