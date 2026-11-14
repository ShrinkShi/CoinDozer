import {clamp,TAU} from './math.js';
import {createResourceLayout} from './world.js';
import {GranularSolver,PARTICLE_SHAPES} from './granular.js';
import {headingBasis} from './heading.js';
import {MAX_RESOURCES,SUPPLY,UPGRADE_COSTS,MAX_VEHICLE_LEVEL,TRACK_COSTS,GATE_COSTS,TRACK_KEYS,newProgress,trackRemaining,gateFactor,coinCredit,applyCredit,vehicleSpeed,vehicleTurnRate} from './economy.js';
import {EconomyTelemetry} from './telemetry.js';

export {MAX_RESOURCES,UPGRADE_COSTS};
export const RADII=Object.fromEntries(Object.entries(PARTICLE_SHAPES).map(([name,s])=>[name,s.radius]));

/** Physical particles are the source of truth; no hidden numerical weights. */
export class Simulation{
 constructor(stage=0,progress={}){
  this.stage=stage;
  this.resources=createResourceLayout(stage);
  this.elapsed=0;this.lastGate=-20;
  const loaded=newProgress(progress);
  this.tracks=loaded.tracks;this.gateTracks=loaded.gates;this.selectedUpgrade=loaded.selected;
  this.level=this.tracks.chassis.level;this.deposit=this.tracks.chassis.deposited;
  this.totalDeposited=loaded.totalDeposited;
  this.remaining=trackRemaining(this.tracks.chassis,TRACK_COSTS.chassis);
  this.processed=0;this.crushed=0;this.multipliedValue=0;this.gateHits=0;
  this.restock=0;this.events=[];this.treads=[];this.lastTrail=0;
  this.won=this.level===MAX_VEHICLE_LEVEL;this.queuedAdd=[];this.activeCount=this.resources.length;
  this.granular=new GranularSolver();this.physics={contacts:0,height:0,objects:0};
  this.player={x:stage?2:0,z:stage?7:11,yaw:0,speed:0,level:stage?Math.max(2,this.level):this.level,bladeLevel:this.tracks.blade.level};
  this._crowdedNotified=-50;
  this.coinsSpent={vehicle:0,gate:0};
  this.telemetry=new EconomyTelemetry();this.supplyPaused=false;
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
   this.telemetry.record('blocked',1,this.elapsed);
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
  this.telemetry.record('oreCrushed',1,this.elapsed);
  this.telemetry.record('goldProduced',3,this.elapsed);
  this.telemetry.record('goldValueProduced',3*coinCredit(this.tracks),this.elapsed);
  this.emit('crush',{x:r.x,z:r.z,coins:3});
  return true;
 }
 /** Each deposited coin contributes its current face value (credits).
  * Upgrades are independent and payable only at their own physical pads.
  */
 selectUpgrade(key){if(!TRACK_KEYS.includes(key))return false;this.selectedUpgrade=key;return true;}
 payCoin(r,trackKey=this.selectedUpgrade,station='vehicle',gateId=-1){
  if(r.dead||r.kind!=='gold')return false;
  let progress,costs;
  if(station==='gate'){
   if(!Number.isInteger(gateId)||gateId<0||gateId>=this.gateTracks.length)return false;
   progress=this.gateTracks[gateId];costs=GATE_COSTS;
  }else{
   if(!TRACK_KEYS.includes(trackKey))return false;
   progress=this.tracks[trackKey];costs=TRACK_COSTS[trackKey];
  }
  if(progress.level>=costs.length)return false;
  const value=coinCredit(this.tracks);
  const result=applyCredit(progress,value,costs);
  progress.level=result.level;progress.deposited=result.deposited;
  r.dead=true;this.totalDeposited++;this.coinsSpent[station]++;
  this.telemetry.record('goldPaid',1,this.elapsed);
  this.telemetry.record('creditsPaid',result.spent,this.elapsed);
  if(station==='gate'){
   this.emit('deposit',{station:'gate',id:gateId,credits:result.spent,remaining:result.remaining,x:r.x,z:r.z});
   if(result.upgrades)this.emit('gateUpgrade',{id:gateId,factor:gateFactor(progress),level:result.level});
  }else{
   this.emit('deposit',{station:'vehicle',track:trackKey,credits:result.spent,remaining:result.remaining,x:r.x,z:r.z});
   this.level=this.tracks.chassis.level;
   this.deposit=this.tracks.chassis.deposited;
   this.remaining=trackRemaining(this.tracks.chassis,TRACK_COSTS.chassis);
   this.player.level=this.stage?Math.max(2,this.level):this.level;
   this.player.bladeLevel=this.tracks.blade.level;
   this.won=this.tracks.chassis.level>=MAX_VEHICLE_LEVEL;
   if(result.upgrades)this.emit('upgrade',{track:trackKey,level:result.level,value:coinCredit(this.tracks),nextCost:result.remaining});
  }
  return true;
 }
 /** One complete traversal multiplies independently of direction; retrigger only
  * after leaving the portal and returning for a deliberate new crossing.
  */
 multiply(original,gate,direction=-1){
  const factor=gateFactor(this.gateTracks[gate.id]??{level:0});
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
   this.telemetry.record('blocked',1,this.elapsed);
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
  this.telemetry.record('gateClones',created,this.elapsed);
  if(original.kind==='gold'){
   this.telemetry.record('goldProduced',created,this.elapsed);
   this.telemetry.record('goldValueProduced',created*coinCredit(this.tracks),this.elapsed);
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
   const turn=vehicleTurnRate(this.tracks);
   p.yaw+=clamp(delta,-dt*turn,dt*turn);
   const error=Math.atan2(Math.sin(target-p.yaw),Math.cos(target-p.yaw));
   alignment=Math.max(0,Math.cos(error));
  }
  const speed=vehicleSpeed(this.tracks,p.level);
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
  this.physics.active=this.granular.lastActive;
  let count=0;
  this._liveGateCount=this.resources.reduce((n,r)=>n+(r.dead?0:1),0);
  let crushedThisFrame=0,depositedThisFrame=0;
  const station=world.upgradeStation;
  const playerAtStation=station && this.stage===0 && Math.hypot(p.x-station.x,p.z-station.z)<station.vehicleRadius;
  const gatePads=world.gateStations||[];
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
    if(r.kind==='gold'){
     let paid=false;
     // Gate pads have their own upgrade tracks; one physical coin enters
     // only one pad in a frame. Vehicle must remain nearby to enable payment.
     for(const pad of gatePads){
      if(Math.hypot(p.x-pad.x,p.z-pad.z)<pad.vehicleRadius &&
         Math.abs(r.x-pad.x)<pad.depositHalfX && Math.abs(r.z-pad.z)<pad.depositHalfZ){
       if(this.payCoin(r,null,'gate',pad.id)){paid=true;depositedThisFrame++;}
       break;
      }
     }
     if(!paid&&station&&playerAtStation&&
        Math.abs(r.x-station.x)<station.depositHalfX&&Math.abs(r.z-station.z)<station.depositHalfZ){
       if(this.payCoin(r))depositedThisFrame++;
     }
    }
    if(r.x>-16.5&&r.x<-10.5&&r.z<-13&&r.z>-27&&r.kind!=='pearl'){
     r.dead=true;this.processed++;
     this.telemetry.record('recycled',1,this.elapsed);
     this.emit('process',{value:this.processed});
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
  if(this.restock>=SUPPLY.interval){
   this.restock%=SUPPLY.interval;
   this.replenishResources();
  }
 }
 /** Fill genuinely missing supply piles, reserving capacity for 1->3 and gates.
  * No visual aggregation, no clearing resources, no hidden inventory.
  */
 replenishResources(){
  const living=this.resources.filter(r=>!r.dead);
  const available=MAX_RESOURCES-living.length;
  if(living.length>=SUPPLY.holdAt){
   if(!this.supplyPaused)this.emit('supplyPaused',{count:living.length});
   this.supplyPaused=true;return {gold:0,blue:0};
  }
  this.supplyPaused=false;
  const gold=living.reduce((n,r)=>n+(r.kind==='gold'),0);
  const blue=living.reduce((n,r)=>n+(r.kind==='blue'),0);
  let budget=Math.min(available,SUPPLY.holdAt-living.length);
  const spawn=(kind,cx,cz,n,rad)=>{
   const amount=Math.min(n,budget);
   for(let i=0;i<amount;i++){
    const a=Math.random()*TAU,d=Math.sqrt(Math.random())*rad;
    this.resources.push({kind,x:cx+Math.cos(a)*d,z:cz+Math.sin(a)*d,
     y:Math.random()*.14,vx:0,vy:0,vz:0,
     spin:Math.random()*TAU,angle:0,passedGates:0,cooldown:0,dead:false});
   }
   budget-=amount;
   if(amount)this.telemetry.record(kind==='gold'?'restockedGold':'restockedOre',amount,this.elapsed);
   return amount;
  };
  let newGold=0,newBlue=0;
  if(this.stage===0){
   if(gold<SUPPLY.goldBelow)newGold=spawn('gold',14.6,5.5,Math.min(SUPPLY.goldBatch,SUPPLY.goldBelow-gold),3.6);
   if(blue<SUPPLY.oreBelow)newBlue=spawn('blue',4.5,9.0,Math.min(SUPPLY.oreBatch,SUPPLY.oreBelow-blue),3.2);
  }else if(living.length<150)newGold=spawn('ingot',0,2,Math.min(90,150-living.length),4);
  this.activeCount=this.resources.length;
  if(newGold||newBlue)this.emit('restock',{gold:newGold,blue:newBlue});
  return {gold:newGold,blue:newBlue};
 }
}
