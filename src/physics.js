import {clamp,TAU} from './math.js';
import {createResourceLayout} from './world.js';
import {GranularSolver,PARTICLE_SHAPES} from './granular.js';
import {headingBasis} from './heading.js';
import {MAX_RESOURCES, UPGRADE_COSTS,MAX_VEHICLE_LEVEL,remainingCost,applyUpgradePayment} from './economy.js';

export {MAX_RESOURCES,UPGRADE_COSTS};
export const RADII=Object.fromEntries(Object.entries(PARTICLE_SHAPES).map(([name,s])=>[name,s.radius]));

/** Physical particles are the source of truth; no hidden numerical weights. */
export class Simulation{
 constructor(stage=0,progress={}){
  this.stage=stage;
  this.resources=createResourceLayout(stage);
  this.elapsed=0;this.lastGate=-20;
  const currentLevel=clamp(progress.level||0,0,MAX_VEHICLE_LEVEL)|0;
  // Preserve coins already paid before a price reduction. Carry over any excess
  // across the new lower upgrade tiers instead of resetting customer progress.
  const migrated=applyUpgradePayment({level:currentLevel,deposited:0},Math.floor(clamp(progress.deposited||0,0,200000)));
  this.level=migrated.level;this.deposit=migrated.deposited;
  this.totalDeposited=progress.totalDeposited||0;
  this.remaining=remainingCost(this.level,this.deposit);
  this.processed=0;this.crushed=0;this.multipliedValue=0;this.gateHits=0;
  this.restock=0;this.events=[];this.treads=[];this.lastTrail=0;
  this.won=this.level===MAX_VEHICLE_LEVEL;this.queuedAdd=[];this.activeCount=this.resources.length;
  this.granular=new GranularSolver();this.physics={contacts:0,height:0,objects:0};
  this.player={x:stage?2:0,z:stage?7:11,yaw:0,speed:0,level:stage?Math.max(2,this.level):this.level};
  this._crowdedNotified=-50;
 }
 setStage(stage){Object.assign(this,new Simulation(stage))}
 emit(type,data={}){this.events.push({type,...data})}
 /** Deterministic 1 ore -> 3 individual physical coins; full capacity blocks conversion. */
 crush(r,crusher){
  if(this.elapsed<(r._crushBlockUntil||0))return false;
  const alive=this._liveGateCount ?? this.resources.reduce((n,p)=>n+(p.dead?0:1),0);
  if(alive+this.queuedAdd.length+2>MAX_RESOURCES){
   r.x=crusher.x-crusher.halfWidth-.26;
   r.vx=-Math.max(.7,Math.abs(r.vx||0)*.6);
   r._crushBlockUntil=this.elapsed+.65;
   if(this.elapsed-this._crowdedNotified>3){this.emit('gateFull',{limit:MAX_RESOURCES});this._crowdedNotified=this.elapsed;}
   return false;
  }
  r.kind='gold';r.passedGates=r.passedGates||0;
  r.vx=Math.max(2.4,(r.vx||0)*.55+2.2);
  r.vz=(r.vz||0)*.52;r.vy=Math.max(1.5,r.vy||0);
  r.x=Math.max(r.x,crusher.x+.55);
  r.cooldown=.35;
  r.tiltX=(Math.random()-.5)*.2;r.tiltZ=(Math.random()-.5)*.2;
  r.omegaX=0;r.omegaZ=0;
  for(let i=0;i<2;i++){
   const side=i?1:-1;
   this.queuedAdd.push({...r,
    x:r.x+(i+1)*.34,z:r.z+side*.29,
    y:Math.max(0,r.y+.10+i*.12),
    vx:r.vx+.9+i*.5,vy:1.5+.3*i,vz:r.vz+side*1.1,
    angle:Math.random()*TAU,tiltX:0,tiltZ:0,omegaX:0,omegaZ:0,
    dead:false,cooldown:.35,_frameZ:r.z+side*.29
   });
  }
  this.crushed++;this.processed++;
  this.emit('crush',{x:r.x,z:r.z,coins:3});
  return true;
 }
 /** One real coin is consumed to contribute exactly 1 to a station's current tier. */
 payCoin(r){
  if(this.level>=MAX_VEHICLE_LEVEL)return false;
  r.dead=true;this.deposit++;this.totalDeposited++;
  this.remaining=remainingCost(this.level,this.deposit);
  this.emit('deposit',{remaining:this.remaining,level:this.level,x:r.x,z:r.z});
  if(this.remaining===0){
   this.level++;this.player.level=this.level;this.deposit=0;
   this.remaining=remainingCost(this.level,this.deposit);
   this.won=this.level===MAX_VEHICLE_LEVEL;
   this.emit('upgrade',{level:this.level,nextCost:this.remaining});
  }
  return true;
 }
 /** One complete traversal multiplies independently of direction; retrigger only
  * after leaving the portal and returning for a deliberate new crossing.
  */
 multiply(original,gate,direction=-1){
  const factor=gate.multiplier;
  if(!Number.isInteger(factor)||factor<2||factor>20)throw Error('Invalid multiplier');
  const created=factor-1;
  const alive=this._liveGateCount ?? this.resources.reduce((n,r)=>n+(r.dead?0:1),0);
  if(alive+this.queuedAdd.length+created>MAX_RESOURCES){
   const incoming=direction<0?1:-1;
   original.z=gate.z+incoming*.46;
   original.vz=incoming*Math.max(.3,Math.abs(original.vz||0)*.6);
   original.vx=(original.vx||0)*.5;
   original._gateBlockUntil=this.elapsed+.55;
   if(this.elapsed-this._crowdedNotified>3){this.emit('gateFull',{limit:MAX_RESOURCES});this._crowdedNotified=this.elapsed;}
   return false;
  }
  const mask=1<<gate.id;
  // Keep historical passedGates for stats / older save compatibility, not as a
  // permanent prohibition. Lock by time AND distance to avoid plane jitter.
  original.passedGates=(original.passedGates||0)|mask;
  original._lastGate=gate.id;
  original._gateRearmAt=this.elapsed+.70;
  for(let i=0;i<created;i++){
   const a=i*2.39996+this.elapsed*.37;
   const radius=.29+.09*Math.sqrt(i);
   const outputZ=original.z+direction*(.20+Math.abs(Math.sin(a)*radius));
   this.queuedAdd.push({...original,
    x:original.x+Math.cos(a)*radius,
    z:outputZ,y:Math.max(0,original.y+Math.random()*.13),
    vx:(original.vx||0)+Math.cos(a)*1.4,
    vz:direction*Math.max(.6,Math.abs(original.vz||0)+Math.random()),
    vy:.15+Math.random()*1.3,spin:Math.random()*TAU,
    passedGates:(original.passedGates||0)|mask,
    _lastGate:gate.id,_gateRearmAt:this.elapsed+.70,
    flashStartedAt:this.elapsed,
    cooldown:.35,dead:false,
    tiltX:0,tiltZ:0,omegaX:0,omegaZ:0,_frameZ:outputZ
   });
  }
  this.multipliedValue+=created;
  this.gateHits++;
  this.emit('multiply',{factor,created,direction});
  return true;
 }
 update(dt,dirX,dirZ,world){
  dt=clamp(dt,0,.044);if(!dt)return;
  this.elapsed+=dt;
  const p=this.player,previous={x:p.x,z:p.z};
  const goal=Math.hypot(dirX,dirZ),strength=Math.min(1,goal);
  let alignment=1;
  if(goal>.1){
   const target=Math.atan2(dirX,-dirZ);
   const delta=Math.atan2(Math.sin(target-p.yaw),Math.cos(target-p.yaw));
   p.yaw+=clamp(delta,-dt*7.5,dt*7.5);
   const error=Math.atan2(Math.sin(target-p.yaw),Math.cos(target-p.yaw));
   alignment=Math.max(0,Math.cos(error));
  }
  const speed=[5.55,5.95,6.4,6.9,7.4][Math.min(4,p.level)];
  const desiredV=goal>.08?speed*strength*alignment:0;
  p.speed+=(desiredV-p.speed)*Math.min(1,dt*(goal>.08?8.8:12));
  if(goal>.1&&alignment<.001)p.speed=0;
  const {fx,fz,rx,rz}=headingBasis(p.yaw),step=p.speed*dt;
  p.x=clamp(p.x+fx*step,-28,28);p.z=clamp(p.z+fz*step,-23,26);
  if(p.speed>.8){
   this.lastTrail+=step;
   if(this.lastTrail>.38){
    this.lastTrail=0;
    for(const side of [-1,1])this.treads.push({x:p.x+rx*side*.90-fx*.62,z:p.z+rz*side*.90-fz*.62,a:p.yaw,t:this.elapsed});
    if(this.treads.length>700)this.treads.splice(0,25);
   }
  }
  // Store positions before the 3D granular solver for reliable portal crossings.
  for(const r of this.resources)if(!r.dead){r._frameZ=r.z;r.cooldown=Math.max(0,(r.cooldown||0)-dt);}
  this.granular.step(this.resources,dt,p,previous);
  this.physics.contacts=this.granular.lastPairs;this.physics.height=this.granular.height;
  let count=0;
  this._liveGateCount=this.resources.reduce((n,r)=>n+(r.dead?0:1),0);
  let crushedThisFrame=0,depositedThisFrame=0;
  const station=world.upgradeStation;
  const playerAtStation=station && this.stage===0 && Math.hypot(p.x-station.x,p.z-station.z)<station.vehicleRadius;
  for(const r of this.resources){
   if(r.dead)continue;
   count++;
   // Both directions count. A particle can traverse a portal again after
   // clearing it, but tiny plane jitter and newly spawned copies cannot chain.
   for(const gate of world.gates){
    const from=r._frameZ,to=r.z;
    if((r._gateBlockUntil||0)>this.elapsed)continue;
    if(r._lastGate===gate.id &&
      (this.elapsed<(r._gateRearmAt||0) || Math.abs(from-gate.z)<.82))continue;
    const direction=Math.sign(to-from);
    if(!direction || Math.abs(to-from)<.02)continue;
    if((from-gate.z)*(to-gate.z)<0 && Math.abs(r.x-gate.x)<gate.half-.25){
     if(this.multiply(r,gate,direction))break;
    }
   }
   if(this.stage===0){
    const crusher=world.crusher;
    // The visible rotating teeth span the bar between these columns.
    const inside=(Math.abs(r.x-crusher.x)<crusher.halfWidth && Math.abs(r.z-crusher.z)<crusher.halfDepth);
    if(inside && r.kind==='blue'){
     if(this.crush(r,crusher))crushedThisFrame++;
    }else if(inside && r.kind==='gold'){
     // Gold leaves the teeth instead of being destroyed a second time.
     r.vx=Math.max(r.vx||0,1.25);
    }
    if(station&&playerAtStation&&r.kind==='gold'&&
      Math.abs(r.x-station.x)<station.depositHalfX&&Math.abs(r.z-station.z)<station.depositHalfZ){
       if(this.payCoin(r))depositedThisFrame++;
    }
    if(r.x>-16.5&&r.x<-10.5&&r.z<-13&&r.z>-27&&r.kind!=='pearl'){
     r.dead=true;this.processed++;this.emit('process',{value:this.processed});
    }
   }
  }
  if(crushedThisFrame)this.emit('crushBatch',{count:crushedThisFrame});
  if(depositedThisFrame)this.emit('depositBatch',{count:depositedThisFrame});
  if(this.queuedAdd.length){this.resources.push(...this.queuedAdd);this.queuedAdd.length=0;}
  // Clear consumed slots before next gate multiplication. Never remove live objects.
  if(depositedThisFrame || this.resources.length>MAX_RESOURCES*.75 || this.elapsed%1<dt)
   this.resources=this.resources.filter(r=>!r.dead);
  this.activeCount=this.resources.length;
  this._liveGateCount=null;
  this.physics.objects=this.activeCount;
  this.restock+=dt;
  if(this.restock>=22){
   this.restock=0;
   const existing=this.resources;
   const gold=existing.filter(r=>r.kind==='gold').length;
   const blue=existing.filter(r=>r.kind==='blue').length;
   const spawn=(kind,cx,cz,n,rad)=>{
    const available=Math.max(0,MAX_RESOURCES-this.resources.length);
    for(let i=0;i<Math.min(n,available);i++){
     const a=Math.random()*TAU,d=Math.sqrt(Math.random())*rad;
     this.resources.push({kind,x:cx+Math.cos(a)*d,z:cz+Math.sin(a)*d,y:Math.random()*.2,vx:0,vy:0,vz:0,spin:Math.random()*TAU,angle:0,passedGates:0,cooldown:0,dead:false});
    }
   };
   if(this.stage===0){
    if(gold<250)spawn('gold',17.2,4,260,5.3);
    if(blue<160)spawn('blue',4,8.6,170,3.7);
   }else if(existing.length<150)spawn('ingot',0,2,120,4);
   this.activeCount=this.resources.length;
   this.emit('restock');
  }
 }
}
