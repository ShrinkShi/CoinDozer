/** One bucket profile shared by both the visible steel mesh and collision solver.
 * a = forward distance from vehicle origin; h = height above ground.
 * The segment profile is an approximation of the observed ad's curved scoop.
 */
export const SCOOP_HALF_WIDTH = 1.94;
export const SCOOP_PROFILE = Object.freeze([
  [2.77,.15], [2.57,.20], [2.30,.27], [2.03,.42],
  [1.84,.68], [1.76,1.00], [1.74,1.38]
].map(point=>Object.freeze(point)));

/** Closest *surface* on the open blade shell. Returns a contact normal pointing
 * toward the outer/front and upper side of the scoop, not toward its centre.
 * Consumers must still check the lateral extent and approach velocity.
 */
export function nearestScoopContact(ahead, height) {
  let best=null, distanceSq=Infinity;
  for(let i=0;i<SCOOP_PROFILE.length-1;i++){
    const [ax,ay]=SCOOP_PROFILE[i], [bx,by]=SCOOP_PROFILE[i+1];
    const dx=bx-ax,dy=by-ay;
    const k=Math.max(0,Math.min(1,((ahead-ax)*dx+(height-ay)*dy)/(dx*dx+dy*dy)));
    const px=ax+k*dx,py=ay+k*dy;
    const d2=(ahead-px)**2+(height-py)**2;
    if(d2<distanceSq){
      distanceSq=d2;
      const length=Math.hypot(dx,dy)||1;
      // A decreasing ahead coordinate and increasing height create an
      // outward/upward surface normal (dy,-dx).
      best={ahead:px,height:py,nAhead:dy/length,nUp:-dx/length,segment:i};
    }
  }
  return {...best,distance:Math.sqrt(distanceSq)};
}
