/**
 * Static obstacle contacts shared by the granular resources and vehicle body.
 * Physics obstacles are authored alongside visual boulders / crusher guides.
 * This is intentionally 2.5D: horizontal circles/capsules, with a top height.
 * A small fixed grid makes collision queries independent of total rock count.
 */
const CELL=3;
const EPS=1e-7;
const key=(x,z)=>x+','+z;
export class StaticCollisionField{
 constructor(obstacles=[]){
  this.cells=new Map();
  for(const o of obstacles){
   if(!Number.isFinite(o.radius)||o.radius<=0)continue;
   const minX=(o.type==='segment'?Math.min(o.x1,o.x2):o.x)-o.radius-.6;
   const maxX=(o.type==='segment'?Math.max(o.x1,o.x2):o.x)+o.radius+.6;
   const minZ=(o.type==='segment'?Math.min(o.z1,o.z2):o.z)-o.radius-.6;
   const maxZ=(o.type==='segment'?Math.max(o.z1,o.z2):o.z)+o.radius+.6;
   for(let cx=Math.floor(minX/CELL);cx<=Math.floor(maxX/CELL);cx++)
    for(let cz=Math.floor(minZ/CELL);cz<=Math.floor(maxZ/CELL);cz++){
     const k=key(cx,cz),bucket=this.cells.get(k)||[];
     bucket.push(o);this.cells.set(k,bucket);
    }
  }
 }
 /** Move one independent object outside solid footprints, preserving tangential
  * motion. Return contact count; no resource is created, removed or aggregated.
  */
 resolve(p,radius){
  if(!Number.isFinite(p.x)||!Number.isFinite(p.z))return 0;
  let contacts=0;
  for(let pass=0;pass<2;pass++){
   const bucket=this.cells.get(key(Math.floor(p.x/CELL),Math.floor(p.z/CELL)));
   if(!bucket)break;
   let changed=false;
   for(const o of bucket){
    if((p.y||0)>(o.height??1))continue; // can travel over a low pebble
    let x=o.x,z=o.z;
    if(o.type==='segment'){
     const dx=o.x2-o.x1,dz=o.z2-o.z1;
     const t=Math.max(0,Math.min(1,((p.x-o.x1)*dx+(p.z-o.z1)*dz)/(dx*dx+dz*dz||1)));
     x=o.x1+dx*t;z=o.z1+dz*t;
    }
    const dx=p.x-x,dz=p.z-z,limit=radius+o.radius,dist2=dx*dx+dz*dz;
    if(dist2>=limit*limit)continue;
    let nx,nz,penetration;
    if(dist2<EPS){nx=1;nz=0;penetration=limit;}
    else{const d=Math.sqrt(dist2);nx=dx/d;nz=dz/d;penetration=limit-d;}
    p.x+=nx*(penetration+.0001);p.z+=nz*(penetration+.0001);
    const vn=(p.vx||0)*nx+(p.vz||0)*nz;
    if(vn<0){
     // No inward velocity remains; modest restitution for visible impacts.
     p.vx=(p.vx||0)-vn*nx*1.12;
     p.vz=(p.vz||0)-vn*nz*1.12;
    }
    contacts++;changed=true;
   }
   if(!changed)break;
  }
  return contacts;
 }
}
