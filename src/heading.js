/** Vehicle and input heading conventions used by every gameplay subsystem.
 * Heading yaw=0 points toward world -Z; positive yaw turns toward world +X.
 * Local vehicle -Z is the front blade; renderer.compose uses the opposite
 * yaw sign, so modelYaw(yaw) is always -yaw.
 */
export function headingBasis(yaw){
 const sin=Math.sin(yaw),cos=Math.cos(yaw);
 return {fx:sin,fz:-cos,rx:cos,rz:sin};
}
export function modelYaw(yaw){return -yaw;}
/** Screen-aligned stick translation for the fixed world camera.
 * Camera eye-target horizontal offset is (17, 30.3) world units.
 */
export function screenStickToWorld(x,y){
 const length=Math.hypot(17,30.3);
 return {x:(30.3*x+17*y)/length,z:(-17*x+30.3*y)/length};
}
