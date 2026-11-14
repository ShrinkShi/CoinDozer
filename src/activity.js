/**
 * Reusable 2D broadphase for scheduling independent granular bodies.
 * It is rebuilt ONCE per simulation frame, not once per physics substep.
 * Every sleeping body remains a physical object, rendered and eligible for
 * gates, upgrades and later wake-up. No object merging or disappearance.
 */
const CELL=2.5;
const ACTIVE_BUDGET=850;
const NEAR_RADIUS2=13.5*13.5;
const WAKE_RADIUS2=19*19;
const key=(x,z)=>x*1024+z;
export class ParticleActivity{
 constructor(budget=ACTIVE_BUDGET){
  this.budget=budget;
  this.cells=new Map();
  this.candidates=[];
  this.active=[];
  this.priorities=new Float32Array(0);
  this.mark=new Uint32Array(0);
  this.generation=0;
  this.sleeping=0;
  this.dropped=0;
 }
 select(resources,player){
  const n=resources.length;
  if(this.priorities.length<n){
   const size=Math.max(128,n,this.priorities.length*2);
   this.priorities=new Float32Array(size);
   this.mark=new Uint32Array(size);
   this.generation=0;
  }
  if(++this.generation===0xffffffff){this.mark.fill(0);this.generation=1;}
  for(const bucket of this.cells.values())bucket.length=0;
  const candidates=this.candidates;candidates.length=0;
  const stamp=this.generation,mark=this.mark,priority=this.priorities;
  const add=(i,score)=>{
   if(mark[i]===stamp)return;
   mark[i]=stamp;priority[i]=score;candidates.push(i);
  };
  let living=0;
  for(let i=0;i<n;i++){
   const p=resources[i];if(p.dead)continue;
   living++;
   const cx=Math.floor(p.x/CELL),cz=Math.floor(p.z/CELL),k=key(cx,cz);
   let bucket=this.cells.get(k);
   if(!bucket){bucket=[];this.cells.set(k,bucket);}
   bucket.push(i);
   const dx=p.x-player.x,dz=p.z-player.z,d2=dx*dx+dz*dz;
   const motion=Math.abs(p.vx||0)+Math.abs(p.vz||0)+Math.abs(p.vy||0);
   // Never sleep an airborne or moving particle even if it is far away.
   if(motion>.30||(p.y||0)>.025)add(i,d2-motion*6);
  }
  // Wake resting grains near the shovel using nearby spatial cells.
  const cx=Math.floor(player.x/CELL),cz=Math.floor(player.z/CELL);
  const range=Math.ceil(Math.sqrt(WAKE_RADIUS2)/CELL);
  for(let x=cx-range;x<=cx+range;x++)for(let z=cz-range;z<=cz+range;z++){
   const bucket=this.cells.get(key(x,z));if(!bucket)continue;
   for(const i of bucket){
    const p=resources[i],dx=p.x-player.x,dz=p.z-player.z,d2=dx*dx+dz*dz;
    if(d2<NEAR_RADIUS2)add(i,d2-2000);
   }
  }
  // A moving resource wakes nearby settled bodies so it cannot tunnel
  // directly through a static pile when the vehicle is farther away.
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
     if(dx*dx+dz*dz<1.3*1.3)add(i,(q.x-player.x)**2+(q.z-player.z)**2-1000);
    }
   }
  }
  if(candidates.length>this.budget){
   candidates.sort((a,b)=>priority[a]-priority[b]);
  }
  this.active.length=0;
  const take=Math.min(this.budget,candidates.length);
  for(let i=0;i<take;i++)this.active.push(candidates[i]);
  this.sleeping=living-this.active.length;
  this.dropped=Math.max(0,candidates.length-take);
  return this.active;
 }
}
