/**
 * Reusable 2D broadphase for scheduling independent granular bodies.
 * Rebuilt once per simulation frame. Every sleeping body remains a physical
 * object, rendered and eligible for later wake-up. No merging or disappearance.
 * v0.7.4: wake radius follows every active tracked vehicle, including the
 * optional autonomous prototype, rather than only the human-controlled dozer.
 */
import {beltContact} from './conveyors.js';
const CELL=2.5,ACTIVE_BUDGET=850,NEAR_RADIUS2=13.5*13.5,WAKE_RADIUS2=19*19;
const key=(x,z)=>x*1024+z;
export class ParticleActivity{
 constructor(budget=ACTIVE_BUDGET){
  this.budget=budget;this.cells=new Map();this.candidates=[];this.active=[];
  this.priorities=new Float32Array(0);this.mark=new Uint32Array(0);
  this.generation=0;this.sleeping=0;this.dropped=0;
 }
 select(resources,players,conveyors=[]){
  const actors=(Array.isArray(players)?players:[players]).filter(Boolean);
  const fallback={x:0,z:0};if(!actors.length)actors.push(fallback);
  const n=resources.length;
  if(this.priorities.length<n){
   const size=Math.max(128,n,this.priorities.length*2);
   this.priorities=new Float32Array(size);this.mark=new Uint32Array(size);this.generation=0;
  }
  if(++this.generation===0xffffffff){this.mark.fill(0);this.generation=1;}
  for(const bucket of this.cells.values())bucket.length=0;
  const candidates=this.candidates;candidates.length=0;
  const stamp=this.generation,mark=this.mark,priority=this.priorities;
  const distanceToActors=(p)=>{
   let best=Infinity;
   for(const a of actors){const dx=p.x-a.x,dz=p.z-a.z,d2=dx*dx+dz*dz;if(d2<best)best=d2;}
   return best;
  };
  const add=(i,score)=>{
   if(mark[i]===stamp)return;
   mark[i]=stamp;priority[i]=score;candidates.push(i);
  };
  let living=0,attached=0;
  for(let i=0;i<n;i++){
   const p=resources[i];if(p.dead)continue;living++;
   if(p.cargoState){attached++;continue;}
   const cx=Math.floor(p.x/CELL),cz=Math.floor(p.z/CELL),k=key(cx,cz);
   let bucket=this.cells.get(k);if(!bucket){bucket=[];this.cells.set(k,bucket);}
   bucket.push(i);
   const d2=distanceToActors(p);
   const motion=Math.abs(p.vx||0)+Math.abs(p.vz||0)+Math.abs(p.vy||0);
   if(motion>.30||(p.y||0)>.025)add(i,d2-motion*6);
   for(const belt of conveyors)if(beltContact(p,belt)){add(i,-1500+d2*.001);break;}
  }
  // Wake settled material around every active scoop, not just the human player.
  const range=Math.ceil(Math.sqrt(WAKE_RADIUS2)/CELL);
  for(const actor of actors){
   const cx=Math.floor(actor.x/CELL),cz=Math.floor(actor.z/CELL);
   for(let x=cx-range;x<=cx+range;x++)for(let z=cz-range;z<=cz+range;z++){
    const bucket=this.cells.get(key(x,z));if(!bucket)continue;
    for(const i of bucket){
     const p=resources[i],dx=p.x-actor.x,dz=p.z-actor.z,d2=dx*dx+dz*dz;
     if(d2<NEAR_RADIUS2)add(i,d2-2000);
    }
   }
  }
  // A moving resource wakes neighbours so it cannot tunnel through a sleeping pile.
  const movingCount=candidates.length;
  for(let m=0;m<movingCount&&m<1500;m++){
   const p=resources[candidates[m]];
   const motion=Math.abs(p.vx||0)+Math.abs(p.vz||0)+Math.abs(p.vy||0);
   if(motion<.30)continue;
   const bx=Math.floor(p.x/CELL),bz=Math.floor(p.z/CELL);
   for(let x=bx-1;x<=bx+1;x++)for(let z=bz-1;z<=bz+1;z++){
    const bucket=this.cells.get(key(x,z));if(!bucket)continue;
    for(const i of bucket){
     const q=resources[i],dx=q.x-p.x,dz=q.z-p.z;
     if(dx*dx+dz*dz<1.3*1.3)add(i,distanceToActors(q)-1000);
    }
   }
  }
  if(candidates.length>this.budget)candidates.sort((a,b)=>priority[a]-priority[b]);
  this.active.length=0;
  const take=Math.min(this.budget,candidates.length);
  for(let i=0;i<take;i++)this.active.push(candidates[i]);
  this.attached=attached;this.sleeping=living-this.active.length-attached;
  this.dropped=Math.max(0,candidates.length-take);
  return this.active;
 }
}
