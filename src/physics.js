import {clamp,TAU} from './math.js';
import {createResourceLayout} from './world.js';
import {GranularSolver,PARTICLE_SHAPES} from './granular.js';
import {headingBasis} from './heading.js';

export const MAX_RESOURCES=2800;
export const RADII=Object.fromEntries(Object.entries(PARTICLE_SHAPES).map(([name,s])=>[name,s.radius]));

export class Simulation {
 constructor(stage=0){
  this.stage=stage;
  this.resources=createResourceLayout(stage);
  this.elapsed=0;this.lastGate=-20;this.deposit=0;this.remaining=2500;
  this.processed=0;this.multipliedValue=0;this.gateHits=0;
  this.restock=0;this.events=[];this.treads=[];this.lastTrail=0;
  this.won=false;this.queuedAdd=[];
  this.granular=new GranularSolver();
  this.physics={contacts:0,height:0,objects:0};
  this.player={x:stage?2:0,z:stage?7:11,yaw:0,speed:0,level:stage?2:0};
 }
 setStage(stage){Object.assign(this,new Simulation(stage))}
 emit(type,data={}){this.events.push({type,...data})}
 update(dt,dirX,dirZ,world){
  dt=clamp(dt,0,.044);if(!dt)return;
  this.elapsed+=dt;
  const p=this.player;
  const previous={x:p.x,z:p.z};
  const goal=Math.hypot(dirX,dirZ),strength=Math.min(1,goal);
  let alignment=1;
  if(goal>.1){
   const target=Math.atan2(dirX,-dirZ);
   const delta=Math.atan2(Math.sin(target-p.yaw),Math.cos(target-p.yaw));
   p.yaw+=clamp(delta,-dt*7.5,dt*7.5);
   // An arcade joystick must never move the vehicle backwards while the
   // model is still rotating toward a newly reversed stick direction.
   const error=Math.atan2(Math.sin(target-p.yaw),Math.cos(target-p.yaw));
   alignment=Math.max(0,Math.cos(error));
  }
  const desiredV=goal>.08?(p.level?6.0:5.55)*strength*alignment:0;
  p.speed+=(desiredV-p.speed)*Math.min(1,dt*(goal>.08?8.8:12));
  if(goal>.1 && alignment<.001)p.speed=0;
  const {fx,fz,rx,rz}=headingBasis(p.yaw),step=p.speed*dt;
  p.x=clamp(p.x+fx*step,-28,28);
  p.z=clamp(p.z+fz*step,-23,26);
  if(p.speed>.8){
   this.lastTrail+=step;
   if(this.lastTrail>.38){
    this.lastTrail=0;
    for(const side of [-1,1])this.treads.push({x:p.x+rx*side*.90-fx*.62,z:p.z+rz*side*.90-fz*.62,a:p.yaw,t:this.elapsed});
    if(this.treads.length>700)this.treads.splice(0,25);
   }
  }
  // v0.3: three-dimensional contact solver replaces planar overlap and
  // fabricated y movement; particles never disappear on shovel contact.
  this.granular.step(this.resources,dt,p,previous);
  this.physics.contacts=this.granular.lastPairs;
  this.physics.height=this.granular.height;
  let alive=0;
  for(const r of this.resources){
   if(r.dead)continue;
   alive++;
   r.cooldown=Math.max(0,(r.cooldown||0)-dt);
   if(this.stage===0){
    const gate=world.gates[0];
    if(r.kind==='blue'&&!r.passed&&r.z<gate.z+.08&&r.z>gate.z-.95&&Math.abs(r.x-gate.x)<gate.half-.15&&r.vz<-.22){
     r.passed=true;
     this.multiply(r,10);
    }
    const cr=world.crusher;
    if(Math.abs(r.x-cr.x)<2.25&&Math.abs(r.z-cr.z)<1.1){
     const pushX=(r.x>=cr.x?1:-1)*dt*7;
     const pushZ=(r.z>=cr.z?1:-1)*dt*5;
     r.vx+=pushX;r.vz+=pushZ;r.vy+=dt*4;
     if(this.elapsed%2<dt*.23&&r.kind==='blue'&&Math.random()<.16){r.dead=true;this.emit('crush');continue}
    }
    if(r.kind==='gold'&&r.x>14.8&&r.x<23.1&&r.z<-10.8&&r.z>-15.2&&r.cooldown===0){
     r.dead=true;this.deposit++;
     this.remaining=Math.max(0,2500-this.deposit);
     this.emit('deposit',{value:this.remaining});
     if(this.remaining===0&&!this.won){this.won=true;this.emit('upgrade')}
    }
    if(r.x>-16.5&&r.x<-10.5&&r.z<-13&&r.z>-27&&r.kind!=='pearl'){
     r.dead=true;this.processed+=(r.kind==='gold'?1:3);
     this.emit('process',{value:this.processed});
    }
   }else if(r.kind==='ingot'&&!r.passed&&r.z<-8&&r.z>-9.1&&Math.abs(r.x+9)<5.1&&r.vz<-.22){
    r.passed=true;this.multiply(r,10000);
   }
  }
  this.physics.objects=alive;
  if(this.queuedAdd.length){this.resources.push(...this.queuedAdd);this.queuedAdd.length=0}
  // Clear consumed particle slots so the logical multiplier never gets stuck.
  if(this.resources.length>MAX_RESOURCES*.91&&this.elapsed%4<dt)this.resources=this.resources.filter(r=>!r.dead);
  this.restock+=dt;
  if(this.restock>22){
   this.restock=0;
   const existing=this.resources.filter(r=>!r.dead);
   const gold=existing.filter(r=>r.kind==='gold').length;
   const blue=existing.filter(r=>r.kind==='blue').length;
   const make=(kind,cx,cz,n,rad)=>{
    const available=MAX_RESOURCES-this.resources.length;
    for(let i=0;i<Math.min(n,available);i++){
     const a=Math.random()*TAU,d=Math.sqrt(Math.random())*rad;
     this.resources.push({kind,x:cx+Math.cos(a)*d,z:cz+Math.sin(a)*d,y:Math.random()*.35,vx:0,vy:0,vz:0,spin:Math.random()*TAU,angle:0,passed:false,cooldown:0,dead:false});
    }
   };
   if(this.stage===0&&gold<400){make('gold',17.2,4,420,6.2);this.emit('restock')}
   if(this.stage===0&&blue<170)make('blue',4,8.6,170,4);
   if(this.stage===1&&existing.length<180)make('ingot',0,2,220,5);
  }
 }
 multiply(original,factor=10){
  const weight=original.weight||1;
  const logicalCreated=(factor-1)*weight;
  this.multipliedValue+=logicalCreated;
  const free=Math.max(0,MAX_RESOURCES-this.resources.length-this.queuedAdd.length);
  const visualCount=Math.min(factor-1,factor>100?32:9,free);
  for(let i=0;i<visualCount;i++){
   const a=Math.random()*TAU,d=.35+Math.random()*.72;
   this.queuedAdd.push({...original,
    x:original.x+Math.cos(a)*d,
    z:original.z-Math.abs(Math.sin(a)*d),
    y:Math.max(.04,original.y+Math.random()*.22),
    vx:(Math.random()-.5)*3.4,vz:-1.6-Math.random()*2.5,vy:.7+Math.random()*2.4,
    weight:logicalCreated/visualCount,
    passed:true,dead:false,spin:Math.random()*TAU,cooldown:.5});
  }
  if(this.elapsed-this.lastGate>1.2){
   this.lastGate=this.elapsed;this.gateHits++;
   this.emit('multiply',{factor,logicalCreated,visualCount});
  }
 }
}
