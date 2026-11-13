import {clamp,damp,TAU} from './math.js';
import {createResourceLayout} from './world.js';
export const MAX_RESOURCES=2800;
export const RADII={blue:.29,gold:.26,pearl:.48,ingot:.23,green:.52};
export class Simulation{
 constructor(stage=0){this.stage=stage;this.resources=createResourceLayout(stage);this.elapsed=0;this.collisionTick=0;this.lastGate=-20;this.deposit=0;this.remaining=2500;this.processed=0;this.multipliedValue=0;this.gateHits=0;this.restock=0;this.events=[];this.treads=[];this.lastTrail=0;this.won=false;this.queuedAdd=[];this.player={x:stage?2:0,z:stage?7:11,yaw:0,speed:0,level:stage?2:0};}
 setStage(stage){let n=new Simulation(stage);Object.assign(this,n)}
 emit(type,data={}){this.events.push({type,...data})}
 update(dt,dirX,dirZ,world){dt=Math.min(dt,.044);this.elapsed+=dt;
  const p=this.player,goal=Math.hypot(dirX,dirZ),m=goal>1?1/goal:1;
  let desiredV=goal>0.08?(p.level?6.0:5.55)*Math.min(1,goal)*m:0;
  p.speed+=(desiredV-p.speed)*Math.min(1,dt*(goal>0.08?7.5:12));
  if(goal>0.1){let target=Math.atan2(dirX,-dirZ),delta=Math.atan2(Math.sin(target-p.yaw),Math.cos(target-p.yaw));p.yaw+=clamp(delta,-dt*5.3,dt*5.3)}
  let fX=Math.sin(p.yaw),fZ=-Math.cos(p.yaw),step=p.speed*dt;
  p.x=clamp(p.x+fX*step,-28,28);p.z=clamp(p.z+fZ*step,-23,26);
  if(p.speed>.8){this.lastTrail+=step;if(this.lastTrail>.38){this.lastTrail=0;let rightX=Math.cos(p.yaw),rightZ=Math.sin(p.yaw);for(const side of [-1,1])this.treads.push({x:p.x+rightX*side*.90-fX*.62,z:p.z+rightZ*side*.90-fZ*.62,a:p.yaw,t:this.elapsed});if(this.treads.length>700)this.treads.splice(0,25)}}
  let bladeWidth=p.level?2.28:2.04;
  for(const r of this.resources){if(r.dead)continue;
   r.cooldown=Math.max(0,r.cooldown-dt);
   // A local, lightweight granular simulation: physical resources remain on the terrain.
   r.vx=damp(r.vx,5.6,dt);r.vz=damp(r.vz,5.6,dt);
   let dx=r.x-p.x,dz=r.z-p.z;
   let ahead=dx*fX+dz*fZ,side=dx*Math.cos(p.yaw)+dz*Math.sin(p.yaw);
   let radius=RADII[r.kind]||.25;
   if(ahead>-.6&&ahead<3.1&&Math.abs(side)<bladeWidth+radius){
    const collide=ahead>1.05&&ahead<2.65&&Math.abs(side)<bladeWidth+radius;
    if(collide){let boost=p.speed>1?p.speed*2.6:4.0;
     r.vx+=fX*boost*dt*12;r.vz+=fZ*boost*dt*12;
     // Side overflow is essential: unlike the old demo, the shovel doesn't absorb items.
     let spill=clamp((Math.abs(side)-bladeWidth*.38)/(bladeWidth*.65),0,1);
     let sign=side>=0?1:-1;
     let lateral=p.speed*spill*dt*5.5;
     r.vx+=Math.cos(p.yaw)*sign*lateral;
     r.vz+=Math.sin(p.yaw)*sign*lateral;
     r.y=Math.min(1.7,r.y+dt*(r.kind==='gold'?1.3:.85));
    }
    if(Math.abs(side)<1.35&&ahead<1.2&&ahead>-.4){
      let push=(1.2-ahead)*.7;
      r.x+=fX*push*dt*3;r.z+=fZ*push*dt*3;
    }
   }
   r.x+=r.vx*dt;r.z+=r.vz*dt;
   r.x=clamp(r.x,-30.5,30.5);r.z=clamp(r.z,-26.2,29);
   // Initially piles stand high, then roll off the scoop and settle naturally.
   r.y=Math.max(0,r.y-dt*(r.kind==='gold'?.18:.29));
   if(this.stage===0){
    if(r.kind==='blue'&&!r.passed&&r.z<3.1&&r.z>1.8&&Math.abs(r.x-1)<5.35&&r.vz<-.22){
      r.passed=true;this.multiply(r,10);
    }
    let cr=world.crusher;
    if(Math.abs(r.x-cr.x)<2.25&&Math.abs(r.z-cr.z)<1.1){
      r.vx+=(r.x>=cr.x?1:-1)*dt*14;
      r.vz+=(r.z>=cr.z?1:-1)*dt*10;
      if(this.elapsed%2<dt*.23&&r.kind==='blue'&&Math.random()<.16){r.dead=true;this.emit('crush')}
    }
    if(r.kind==='gold'&&r.x>14.8&&r.x<23.1&&r.z<-10.8&&r.z>-15.2&&r.cooldown===0){
      r.dead=true;this.deposit++;this.remaining=Math.max(0,2500-this.deposit);this.emit('deposit',{value:this.remaining});
      if(this.remaining===0&&!this.won){this.won=true;this.emit('upgrade')}
    }
    if(r.x>-16.5&&r.x<-10.5&&r.z<-13&&r.z>-27&&r.kind!=='pearl'){
      r.dead=true;this.processed+=(r.kind==='gold'?1:3);this.emit('process',{value:this.processed})
    }
   }else if(r.kind==='ingot'&&!r.passed&&r.z<-8.0&&r.z>-9.1&&Math.abs(r.x+9)<5.1&&r.vz<-.2){
     r.passed=true;this.multiply(r,10000);
   }
  }
  if(this.queuedAdd.length){this.resources.push(...this.queuedAdd);this.queuedAdd.length=0}
  // Collide mobile particles against nearby objects, not with O(n²) all-pairs checks.
  this.collisionTick++;if(this.collisionTick%2===0)this.resolveGranules(dt);
  this.restock+=dt;
  if(this.restock>22){this.restock=0;
    let existing=this.resources.filter(r=>!r.dead);
    let gold=existing.filter(r=>r.kind==='gold').length,blue=existing.filter(r=>r.kind==='blue').length;
    const make=(kind,cx,cz,n,rad)=>{for(let i=0;i<n&&this.resources.length<MAX_RESOURCES;i++){
      let a=Math.random()*TAU,d=Math.sqrt(Math.random())*rad;
      this.resources.push({kind,x:cx+Math.cos(a)*d,z:cz+Math.sin(a)*d,y:Math.random()*.35,vx:0,vz:0,spin:Math.random()*TAU,angle:0,passed:false,cooldown:0,dead:false})
    }};
    if(this.stage===0&&gold<400){make('gold',17.2,4.0,420,6.2);this.emit('restock')}
    if(this.stage===0&&blue<170)make('blue',4,8.6,170,4.0);
    if(this.stage===1&&existing.length<180)make('ingot',0,2,220,5.0);
  }
  if(this.resources.length>MAX_RESOURCES*1.2)this.resources=this.resources.filter(r=>!r.dead);
 }
 multiply(original,factor=10){
  // The factor is numerically real; high tiers use aggregate-weight particles
  // to avoid trying to simulate 10,000 unique rigid bodies per ingot.
  const weight=original.weight||1;
  const logicalCreated=(factor-1)*weight;
  this.multipliedValue+=logicalCreated;
  let free=MAX_RESOURCES-this.resources.length-this.queuedAdd.length;
  let visualCount=Math.min(factor-1,factor>100?32:9,free);
  for(let i=0;i<visualCount;i++){
   let a=Math.random()*TAU,d=.35+Math.random()*1.0;
   this.queuedAdd.push({...original,
     x:original.x+Math.cos(a)*d,z:original.z-Math.abs(Math.sin(a)*d),y:Math.random()*.9,
     vx:(Math.random()-.5)*5,vz:-1.5-Math.random()*3.0,
     weight:logicalCreated/visualCount,passed:true,dead:false,spin:Math.random()*TAU,cooldown:.5});
  }
  if(this.elapsed-this.lastGate>1.2){this.lastGate=this.elapsed;this.gateHits++;this.emit('multiply',{factor,logicalCreated,visualCount})}
 }
 resolveGranules(dt){let bucket=new Map(),cell=.78,active=[];
  for(let i=0;i<this.resources.length;i++){const p=this.resources[i];if(p.dead)continue;
   let cx=Math.floor(p.x/cell),cz=Math.floor(p.z/cell),key=cx+','+cz;if(!bucket.has(key))bucket.set(key,[]);bucket.get(key).push(i);
   if(Math.abs(p.vx)+Math.abs(p.vz)>.2)active.push(i);
  }
  let processed=0;
  for(const i of active){let a=this.resources[i],ix=Math.floor(a.x/cell),iz=Math.floor(a.z/cell);
   for(let gx=-1;gx<=1;gx++)for(let gz=-1;gz<=1;gz++){
    let v=bucket.get((ix+gx)+','+(iz+gz));if(!v)continue;
    for(let j of v){if(j===i)continue;let b=this.resources[j],dx=a.x-b.x,dz=a.z-b.z,rr=(RADII[a.kind]||.24)+(RADII[b.kind]||.24),sq=dx*dx+dz*dz;
     if(sq>=rr*rr||sq<.000001)continue;let d=Math.sqrt(sq),force=(rr-d)*.40,nx=dx/d,nz=dz/d;
     a.x+=nx*force;a.z+=nz*force;b.x-=nx*force*.72;b.z-=nz*force*.72;
     b.vx+=nx*-force*.9;b.vz+=nz*-force*.9;
    }
   }
   if(++processed>1700)break;
  }
 }
}
