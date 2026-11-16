import {clamp,TAU} from './math.js';
import {createResourceLayout} from './world.js';
import {GranularSolver,PARTICLE_SHAPES} from './granular.js';
import {headingBasis} from './heading.js';
import {MAX_RESOURCES,SUPPLY,UPGRADE_COSTS,MAX_VEHICLE_LEVEL,TRACK_COSTS,GATE_COSTS,BELT_COSTS,TRACK_KEYS,newProgress,trackRemaining,gateFactor,coinCredit,applyCredit,vehicleSpeed,vehicleTurnRate,cargoCapacity as getCargoCapacity} from './economy.js';
import {EconomyTelemetry} from './telemetry.js';
import {insideTrigger,crossedGatePlane} from './triggers.js';
import {advanceTrackOdometer,cargoSlotPose} from './vehicleRig.js';
import {sceneRules,paymentValue,isStageCurrency} from './sceneRules.js';
import {INFRA_COSTS,crusherYield} from './economy.js';
import {LONG_MAP} from './mapLayout.js';
import {constrainToTerrain} from './terrain.js';
import {createNpc,updateNpc} from './npc.js';

export {MAX_RESOURCES,UPGRADE_COSTS};
export const RADII=Object.fromEntries(Object.entries(PARTICLE_SHAPES).map(([name,s])=>[name,s.radius]));
const MAX_CARGO_TRANSFERS=4;
const CARGO_PICKUP_RADIUS=3.25;

/** Physical particles are the source of truth; no hidden numerical weights. */
export class Simulation{
 constructor(stage=0,progress={}){
  this.stage=stage;
  this.rules=sceneRules(stage);
  this.resources=createResourceLayout(stage);
  this.nextResourceId=1;
  for(const resource of this.resources)resource.id=this.nextResourceId++;
  this.elapsed=0;this.lastGate=-20;
  const loaded=newProgress(progress);
  this.tracks=loaded.tracks;this.gateTracks=stage===1?loaded.caveGates:loaded.gates;
  this.beltTracks=loaded.belts;this.selectedUpgrade=loaded.selected;
  this.level=this.tracks.chassis.level;this.deposit=this.tracks.chassis.deposited;
  this.totalDeposited=loaded.totalDeposited;
  this.remaining=trackRemaining(this.tracks.chassis,TRACK_COSTS.chassis);
  this.processed=0;this.crushed=0;this.multipliedValue=0;this.gateHits=0;
  this.restock=0;this.events=[];this.treads=[];this.lastTrail=0;
  this.won=this.level===MAX_VEHICLE_LEVEL;this.queuedAdd=[];this.liveCount=0;this.activeCount=0;this._liveGateCount=null;
  this.granular=new GranularSolver();this.physics={contacts:0,height:0,objects:0};
  this.player={x:stage?2:LONG_MAP.spawn.x,z:stage?12:LONG_MAP.spawn.z,yaw:stage?0:Math.PI,speed:0,
   level:this.level,bladeLevel:this.tracks.blade.level,
   speedLevel:this.tracks.speed.level,steeringLevel:this.tracks.steering.level,
   coinLevel:this.tracks.coin.level,cargoLevel:this.tracks.cargo.level,
   trackLeft:0,trackRight:0,travelDistance:0,
   bladeBounce:0,upgradeFlashAt:-50};
  this._crowdedNotified=-50;
  this.coinsSpent={vehicle:0,gate:0,feature:0,belt:0};this.stageExitIssued=false;
  this.telemetry=new EconomyTelemetry();this.supplyPaused=false;
  this.cargoTransfers=[];this.cargoPickupRadius=CARGO_PICKUP_RADIUS;
  this.npc=createNpc();
  this.restoreCargo(progress);
  this.liveCount=this.countLiving();this.activeCount=this.liveCount;
 }
 setStage(stage,progress={}){Object.assign(this,new Simulation(stage,progress))}
 emit(type,data={}){this.events.push({type,...data})}
 countLiving(){return this.resources.reduce((n,r)=>n+(!r.dead?1:0),0);}
 cargoCapacity(){return getCargoCapacity(this.tracks);}
 cargoCount(){
  let count=0;
  for(const r of this.resources)if(!r.dead&&r.cargoState&&r.kind===this.rules.currency)count++;
  return count;
 }
 serializeCargo(){
  return this.resources.filter(r=>!r.dead&&r.cargoState&&r.kind===this.rules.currency)
   .sort((a,b)=>(a.cargoSlot??0)-(b.cargoSlot??0))
   .map(r=>({id:r.id,kind:r.kind,slot:r.cargoSlot}));
 }
 restoreCargo(progress={}){
  const byStage=progress.cargoByStage||{};
  const saved=Array.isArray(byStage[this.stage])?byStage[this.stage]:
   (progress.stage===this.stage&&Array.isArray(progress.cargo)?progress.cargo:[]);
  const occupied=new Set(),ids=new Set(this.resources.map(r=>r.id));
  for(const item of saved){
   if(!item||item.kind!==this.rules.currency)continue;
   let slot=Number.isInteger(item.slot)&&item.slot>=0&&
    item.slot<this.cargoCapacity()&&!occupied.has(item.slot)?item.slot:-1;
   if(slot<0){
    for(let i=0;i<this.cargoCapacity();i++)if(!occupied.has(i)){slot=i;break;}
   }
   let id=Number.isSafeInteger(item.id)&&item.id>0&&!ids.has(item.id)?item.id:this.nextResourceId++;
   ids.add(id);this.nextResourceId=Math.max(this.nextResourceId,id+1);
   if(slot<0){
    // Malformed/over-capacity legacy cargo is restored as a loose real coin,
    // never silently discarded.
    this.resources.push({id,kind:this.rules.currency,x:this.player.x,y:0,z:this.player.z+1,
     vx:0,vy:0,vz:0,dead:false,passedGates:0,cooldown:0,spin:0,angle:0});
    continue;
   }
   occupied.add(slot);
   const pose=cargoSlotPose(this.player,slot,this.tracks.cargo.level);
   this.resources.push({id,kind:this.rules.currency,x:pose.x,y:pose.y,z:pose.z,
    vx:0,vy:0,vz:0,dead:false,passedGates:0,cooldown:0,spin:0,angle:0,
    tiltX:0,tiltZ:0,omegaX:0,omegaZ:0,cargoState:'stored',cargoSlot:slot});
  }
 }
 nextCargoSlot(){
  const occupied=new Set();
  for(const r of this.resources)if(!r.dead&&r.cargoState&&Number.isInteger(r.cargoSlot))
   occupied.add(r.cargoSlot);
  for(let i=0;i<this.cargoCapacity();i++)if(!occupied.has(i))return i;
  return -1;
 }
 canPayCoin(trackKey,station='vehicle',gateId=-1){
  let progress,costs;
  if(station==='gate'){
   if(!Number.isInteger(gateId)||gateId<0||gateId>=this.rules.gateCount)return false;
   progress=this.gateTracks[gateId];costs=GATE_COSTS;
  }else if(station==='belt'){
   if(this.stage!==0||!Number.isInteger(gateId)||gateId<0||
      gateId>=this.beltTracks.length)return false;
   progress=this.beltTracks[gateId];costs=BELT_COSTS;
  }else if(station==='feature'){
   if(this.stage!==0||!(trackKey==='coin'||Object.hasOwn(INFRA_COSTS,trackKey)))return false;
   progress=this.tracks[trackKey];costs=INFRA_COSTS[trackKey]??TRACK_COSTS.coin;
  }else{
   if(!TRACK_KEYS.includes(trackKey)||(this.stage===0&&trackKey==='coin'))return false;
   progress=this.tracks[trackKey];costs=TRACK_COSTS[trackKey];
  }
  return Boolean(progress&&costs&&progress.level<costs.length);
 }
 findCargoPaymentTarget(world){
  const p=this.player,near=pad=>pad&&
   Math.hypot(p.x-pad.x,p.z-pad.z)<=(pad.vehicleRadius??0);
  const target=(pad,station,trackKey=null,gateId=-1)=>({
   station,trackKey,gateId,target:{x:pad.trigger.x,y:.08,z:pad.trigger.z}
  });
  for(const pad of world.gateStations||[]){
   if(near(pad)&&this.canPayCoin(null,'gate',pad.id))
    return target(pad,'gate',null,pad.id);
  }
  if(this.stage===0){
   for(const [key,pad] of Object.entries(world.featureStations||{})){
    if(near(pad)&&this.canPayCoin(key,'feature'))return target(pad,'feature',key);
   }
   if(world.coinStation&&near(world.coinStation)&&this.canPayCoin('coin','feature'))
    return target(world.coinStation,'feature','coin');
  }
  for(const pad of world.conveyorStations||[]){
   if(near(pad)&&this.canPayCoin(null,'belt',pad.id))
    return target(pad,'belt',null,pad.id);
  }
  if(world.upgradeStation&&near(world.upgradeStation)&&
     this.canPayCoin(this.selectedUpgrade,'vehicle'))
   return target(world.upgradeStation,'vehicle',this.selectedUpgrade);
  return null;
 }
 startCargoTransfer(resource,mode,paymentTarget=null,slot=resource.cargoSlot){
  if(!resource||resource.dead)return false;
  if(mode==='loading'){
   resource.cargoState='loading';resource.cargoSlot=slot;
  }else if(mode==='unloading')resource.cargoState='unloading';
  else resource.cargoState='returning';
  this.cargoTransfers.push({
   resource,mode,startedAt:this.elapsed,
   duration:mode==='loading'?.36:mode==='unloading'?.46:.34,
   from:{x:resource.x,y:resource.y||0,z:resource.z},
   target:paymentTarget?.target||null,paymentTarget,
   arc:mode==='unloading'?1.25:.82
  });
  this.emit('cargoTransferStarted',{id:resource.id,mode});
  return true;
 }
 updateCargo(world){
  let paid=0;
  // Stored coins are attached to their individual cargo slots. They remain
  // visible resources and move with the truck, but never enter the rigid solver.
  for(const r of this.resources)if(!r.dead&&r.cargoState==='stored'){
   const pose=cargoSlotPose(this.player,r.cargoSlot,this.tracks.cargo.level);
   r.x=pose.x;r.y=pose.y;r.z=pose.z;r.vx=0;r.vy=0;r.vz=0;
  }
  for(let i=this.cargoTransfers.length-1;i>=0;i--){
   const transfer=this.cargoTransfers[i],r=transfer.resource;
   if(!r||r.dead){this.cargoTransfers.splice(i,1);continue;}
   const t=clamp((this.elapsed-transfer.startedAt)/transfer.duration,0,1);
   const eased=t*t*(3-2*t);
   const target=transfer.mode==='unloading'?transfer.target:
    cargoSlotPose(this.player,r.cargoSlot,this.tracks.cargo.level);
   const arc=Math.sin(Math.PI*t)*transfer.arc;
   r.x=transfer.from.x+(target.x-transfer.from.x)*eased;
   r.y=transfer.from.y+(target.y-transfer.from.y)*eased+arc;
   r.z=transfer.from.z+(target.z-transfer.from.z)*eased;
   r.vx=0;r.vy=0;r.vz=0;
   if(t<1)continue;
   r.x=target.x;r.y=target.y;r.z=target.z;
   if(transfer.mode==='loading'||transfer.mode==='returning'){
    r.cargoState='stored';r.spin=0;r.angle=0;r.tiltX=0;r.tiltZ=0;
    this.emit(transfer.mode==='loading'?'cargoLoaded':'cargoReturned',{id:r.id});
    this.cargoTransfers.splice(i,1);
   }else if(transfer.mode==='unloading'){
    const payment=transfer.paymentTarget;
    if(this.payCoin(r,payment.trackKey,payment.station,payment.gateId)){
     r.cargoState='spent';r.cargoSlot=-1;paid++;
     this.cargoTransfers.splice(i,1);
    }else{
     // A station may reach MAX while several coins are in flight. The
     // unsuccessful transactions return to their original cargo slots.
     transfer.mode='returning';transfer.startedAt=this.elapsed;
     transfer.duration=.34;transfer.from={x:r.x,y:r.y,z:r.z};
     transfer.target=null;transfer.paymentTarget=null;transfer.arc=.68;
     r.cargoState='returning';
    }
   }
  }
  const available=MAX_CARGO_TRANSFERS-this.cargoTransfers.length;
  if(available<=0)return paid;
  const payment=this.findCargoPaymentTarget(world);
  if(payment){
   const stored=this.resources.filter(r=>!r.dead&&r.kind===this.rules.currency&&
    r.cargoState==='stored').sort((a,b)=>(a.cargoSlot??0)-(b.cargoSlot??0));
   if(stored.length){
    for(const r of stored.slice(0,available))this.startCargoTransfer(r,'unloading',payment);
    return paid;
   }
  }
  let count=this.cargoCount();
  for(let i=0;i<available&&count<this.cargoCapacity();i++){
   let candidate=null,best=this.cargoPickupRadius*this.cargoPickupRadius;
   for(const r of this.resources){
    if(r.dead||r.kind!==this.rules.currency||r.cargoState||(r.y||0)>1.4)continue;
    const dx=r.x-this.player.x,dz=r.z-this.player.z,d2=dx*dx+dz*dz;
    if(d2<best){best=d2;candidate=r;}
   }
   if(!candidate)break;
   const slot=this.nextCargoSlot();if(slot<0)break;
   if(this.startCargoTransfer(candidate,'loading',null,slot))count++;
  }
  return paid;
 }
 /** Reserve all children before changing the source object. Freed slots are
  * usable later in the same frame; no coin or ore is partially converted. */
 hasCapacity(extra){
  const live=this._liveGateCount??this.countLiving();
  return live+this.queuedAdd.length+extra<=MAX_RESOURCES;
 }
 markDead(r){
  if(r.dead)return false;
  r.dead=true;
  if(this._liveGateCount!==null)this._liveGateCount--;
  return true;
 }
 /** Atomic 1 ore -> 3 independent coins. If two additional slots are not
  * available, retain the ore and nudge it back to the entry lane.
  */
 crush(r,crusher){
  if(r.dead||r.kind!==this.rules.ore||this.elapsed<(r._crushBlockUntil||0))return false;
  if(!Number.isSafeInteger(r.id))r.id=this.nextResourceId++;
  const outputCount=this.stage===0?crusherYield(this.tracks):this.rules.yield;
  if(!this.hasCapacity(outputCount-1)){
   if(this.stage===0){
    // The long map is fed from the southern bridge. Reject along the
    // unobstructed intake lane rather than jamming against the side column.
    r.x=clamp(r.x,crusher.x-crusher.halfWidth+.85,crusher.x+crusher.halfWidth-.85);
    r.z=crusher.z-crusher.halfDepth-.57;
    r.vz=-Math.max(.8,Math.abs(r.vz||0)*.6);
    r.vx=(r.vx||0)*.25;
   }else{
    r.x=crusher.x-crusher.halfWidth-.57;
    r.vx=-Math.max(.8,Math.abs(r.vx||0)*.6);
   }
   r._crushBlockUntil=this.elapsed+.65;
   if(this.elapsed-this._crowdedNotified>3){
    this.emit('crusherFull',{limit:MAX_RESOURCES,x:r.x,z:r.z});
    this._crowdedNotified=this.elapsed;
   }
   this.telemetry.record('blocked',1,this.elapsed);
   return false;
  }
  const impactZ=clamp(r.z,crusher.z-.78,crusher.z+.78);
  const outputX=crusher.x+1.05;
  // Reuse incoming body and create EXACTLY two independent objects.
  r.kind=this.rules.currency;r.passedGates=r.passedGates||0;
  r.x=outputX;r.z=impactZ;r.y=Math.max(0,r.y);
  r.vx=3.1+Math.min(1.6,Math.abs(r.vx||0)*.25);
  r.vz=(r.vz||0)*.28;r.vy=1.9;
  r.cooldown=.35;r.flashStartedAt=this.elapsed;
  r.tiltX=(Math.random()-.5)*.2;r.tiltZ=(Math.random()-.5)*.2;
  r.omegaX=0;r.omegaZ=0;r._frameZ=r.z;
  for(let i=0;i<outputCount-1;i++){
   const side=i?1:-1;
   this.queuedAdd.push({...r,id:this.nextResourceId++,
    x:outputX+.2+i*.21,z:impactZ+side*.34,
    y:r.y+.06+i*.10,
    vx:r.vx+.35+i*.35,vy:2.15+.25*i,vz:side*(1.0+i*.22),
    angle:Math.random()*TAU,tiltX:0,tiltZ:0,omegaX:0,omegaZ:0,
    dead:false,cooldown:.35,_frameZ:impactZ+side*.34
   });
  }
  this.crushed++;this.processed++;
  this.telemetry.record('oreCrushed',1,this.elapsed);
  this.telemetry.record('goldProduced',outputCount,this.elapsed);
  this.telemetry.record('goldValueProduced',outputCount*paymentValue(this.stage,this.tracks),this.elapsed);
  this.emit('crush',{x:crusher.x+.5,z:impactZ,coins:outputCount});
  return true;
 }
 /** Each deposited coin contributes its current face value (credits).
  * Upgrades are independent and payable only at their own physical pads.
  */
 selectUpgrade(key){if(!TRACK_KEYS.includes(key))return false;this.selectedUpgrade=key;return true;}
 payCoin(r,trackKey=this.selectedUpgrade,station='vehicle',gateId=-1){
  if(r.dead||!isStageCurrency(this.stage,r.kind))return false;
  let progress,costs;
  if(station==='gate'){
   if(!Number.isInteger(gateId)||gateId<0||gateId>=this.rules.gateCount)return false;
   progress=this.gateTracks[gateId];costs=GATE_COSTS;
  }else if(station==='belt'){
   if(this.stage!==0||!Number.isInteger(gateId)||gateId<0||
      gateId>=this.beltTracks.length)return false;
   progress=this.beltTracks[gateId];costs=BELT_COSTS;
  }else if(station==='feature'){
   if(this.stage!==0||!(trackKey==='coin'||Object.hasOwn(INFRA_COSTS,trackKey)))return false;
   progress=this.tracks[trackKey];costs=INFRA_COSTS[trackKey]??TRACK_COSTS.coin;
  }else{
   if(!TRACK_KEYS.includes(trackKey))return false;
   if(this.stage===0&&trackKey==='coin')return false;
   progress=this.tracks[trackKey];costs=TRACK_COSTS[trackKey];
  }
  if(progress.level>=costs.length)return false;
  const value=paymentValue(this.stage,this.tracks);
  const result=applyCredit(progress,value,costs);
  progress.level=result.level;progress.deposited=result.deposited;
  this.markDead(r);this.totalDeposited++;this.coinsSpent[station]++;
  this.telemetry.record('goldPaid',1,this.elapsed);
  this.telemetry.record('creditsPaid',result.spent,this.elapsed);
  if(station==='gate'){
   this.emit('deposit',{station:'gate',id:gateId,credits:result.spent,remaining:result.remaining,x:r.x,z:r.z});
   if(result.upgrades)this.emit('gateUpgrade',{id:gateId,factor:gateFactor(progress),level:result.level});
  }else if(station==='belt'){
   this.emit('deposit',{station:'belt',id:gateId,credits:result.spent,
    remaining:result.remaining,x:r.x,z:r.z});
   if(result.upgrades)this.emit('beltUpgrade',{id:gateId,level:result.level,
    remaining:result.remaining});
  }else{
   this.emit('deposit',{station:station==='feature'?'feature':'vehicle',track:trackKey,credits:result.spent,remaining:result.remaining,x:r.x,z:r.z});
   this.level=this.tracks.chassis.level;
   this.deposit=this.tracks.chassis.deposited;
   this.remaining=trackRemaining(this.tracks.chassis,TRACK_COSTS.chassis);
   this.player.level=this.level;
   this.player.bladeLevel=this.tracks.blade.level;
   this.player.speedLevel=this.tracks.speed.level;
   this.player.steeringLevel=this.tracks.steering.level;
   this.player.coinLevel=this.tracks.coin.level;
   this.player.cargoLevel=this.tracks.cargo.level;
   if(result.upgrades)this.player.upgradeFlashAt=this.elapsed;
   this.won=this.tracks.chassis.level>=MAX_VEHICLE_LEVEL;
   if(result.upgrades)this.emit(station==='feature'?'featureUpgrade':'upgrade',{
    track:trackKey,level:result.level,value:paymentValue(this.stage,this.tracks),
    nextCost:result.remaining,yield:crusherYield(this.tracks)});

  }
  return true;
 }
 /** One complete traversal multiplies independently of direction; retrigger only
  * after leaving the portal and returning for a deliberate new crossing.
  */
 multiply(original,gate,direction=-1){
  if(this.stage===0&&original.kind!==this.rules.ore)return false;
  const factor=gateFactor(this.gateTracks[gate.id]??{level:0});
  if(!Number.isInteger(factor)||factor<2||factor>20)throw Error('Invalid multiplier');
  const created=factor-1;
  if(!Number.isSafeInteger(original.id))original.id=this.nextResourceId++;
  if(!this.hasCapacity(created)){
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
   this.queuedAdd.push({...original,id:this.nextResourceId++,
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
  if(isStageCurrency(this.stage,original.kind)){
   this.telemetry.record('goldProduced',created,this.elapsed);
   this.telemetry.record('goldValueProduced',created*paymentValue(this.stage,this.tracks),this.elapsed);
  }
  this.multipliedValue+=created;
  this.gateHits++;
  this.emit('multiply',{factor,created,direction});
  return true;
 }
 update(dt,dirX,dirZ,world){
  dt=clamp(dt,0,.044);if(!dt)return;
  this.elapsed+=dt;
  if(typeof world.syncInfrastructure==='function')world.syncInfrastructure(this.tracks,this.beltTracks);
  const p=this.player,previous={x:p.x,z:p.z,yaw:p.yaw};
  const npc=this.npc,npcPrevious={x:npc.x,z:npc.z,yaw:npc.yaw};
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
  const bounds=world.bounds||{minX:-28,maxX:28,minZ:-23,maxZ:26};
  p.x=clamp(p.x+fx*step,bounds.minX+1.05,bounds.maxX-1.05);
  p.z=clamp(p.z+fz*step,bounds.minZ+1.05,bounds.maxZ-1.05);
  constrainToTerrain(p,previous,world.terrain,1.05);
  if(p.speed>.8){
   this.lastTrail+=step;
   if(this.lastTrail>.38){
    this.lastTrail=0;
    for(const side of [-1,1])this.treads.push({x:p.x+rx*side*.90-fx*.62,z:p.z+rz*side*.90-fz*.62,a:p.yaw,t:this.elapsed});
    if(this.treads.length>700)this.treads.splice(0,25);
   }
  }
  // One optional NPC sample uses the same chassis movement, terrain barriers,
  // track odometer and granular scoop shell as the human-controlled vehicle.
  const npcActive=this.stage===0&&npc.enabled;
  const command=updateNpc(npc,this.resources,world,dt,this.elapsed,p);
  if(npcActive){
   if(!command.reverse&&Math.hypot(command.dirX,command.dirZ)>.01){
    const targetYaw=Math.atan2(command.dirX,-command.dirZ);
    const delta=Math.atan2(Math.sin(targetYaw-npc.yaw),Math.cos(targetYaw-npc.yaw));
    npc.yaw+=clamp(delta,-dt*2.35,dt*2.35);
    const error=Math.atan2(Math.sin(targetYaw-npc.yaw),Math.cos(targetYaw-npc.yaw));
    const alignment=Math.max(0,Math.cos(error));
    const desired=command.speed*alignment;
    npc.speed+=(desired-npc.speed)*Math.min(1,dt*6.8);
    if(alignment<.03)npc.speed*=.72;
   }else{
    const desired=command.reverse?-command.speed:0;
    npc.speed+=(desired-npc.speed)*Math.min(1,dt*7.5);
   }
   const basis=headingBasis(npc.yaw),npcStep=npc.speed*dt;
   npc.x=clamp(npc.x+basis.fx*npcStep,bounds.minX+1.05,bounds.maxX-1.05);
   npc.z=clamp(npc.z+basis.fz*npcStep,bounds.minZ+1.05,bounds.maxZ-1.05);
   constrainToTerrain(npc,npcPrevious,world.terrain,1.05);
   if(Math.abs(npc.speed)>.8){
    npc.lastTrail+=Math.abs(npcStep);
    if(npc.lastTrail>.38){
     npc.lastTrail=0;
     for(const side of [-1,1])npc.treads.push({x:npc.x+basis.rx*side*.90-basis.fx*.62,
      z:npc.z+basis.rz*side*.90-basis.fz*.62,a:npc.yaw,t:this.elapsed});
     if(npc.treads.length>220)npc.treads.splice(0,20);
    }
   }
  }else{
   npc.speed+=(0-npc.speed)*Math.min(1,dt*8);
  }
  // Store positions before the 3D granular solver for reliable portal crossings.
  for(const r of this.resources)if(!r.dead){
   if(!Number.isSafeInteger(r.id))r.id=this.nextResourceId++;
   else this.nextResourceId=Math.max(this.nextResourceId,r.id+1);
   if(!r.cargoState){r._frameX=r.x;r._frameY=r.y;r._frameZ=r.z;}
   r.cooldown=Math.max(0,(r.cooldown||0)-dt);
  }
  this.granular.step(this.resources,dt,p,previous,world,
   npcActive?[{body:npc,previous:npcPrevious}]:[]);
  if(this.granular.obstacleField){
   this.granular.obstacleField.resolve(p,1.05);
   if(npcActive)this.granular.obstacleField.resolve(npc,1.05);
  }
  // Vehicle bodies are solid against one another. Resolve overlap symmetrically
  // and remove only inward relative velocity, preserving each driver's intent.
  if(npcActive){
   let dx=npc.x-p.x,dz=npc.z-p.z,d2=dx*dx+dz*dz;
   const min=2.25;
   if(d2<min*min){
    const d=Math.sqrt(d2)||.001,nx=dx/d,nz=dz/d,overlap=min-d;
    p.x-=nx*overlap*.5;p.z-=nz*overlap*.5;
    npc.x+=nx*overlap*.5;npc.z+=nz*overlap*.5;
    const pf=headingBasis(p.yaw),nf=headingBasis(npc.yaw);
    const relative=(npc.speed*nf.fx-p.speed*pf.fx)*nx+
     (npc.speed*nf.fz-p.speed*pf.fz)*nz;
    if(relative<0){
     const impulse=-relative*.32;
     p.speed-=impulse*(pf.fx*nx+pf.fz*nz);
     npc.speed+=impulse*(nf.fx*nx+nf.fz*nz);
    }
   }
  }
  constrainToTerrain(p,previous,world.terrain,1.05);
  if(npcActive)constrainToTerrain(npc,npcPrevious,world.terrain,1.05);
  // Visual odometers observe actual resolved movement, never drive physics.
  advanceTrackOdometer(p,previous);
  if(npcActive)advanceTrackOdometer(npc,npcPrevious);
  const impact=Math.min(.085,Math.max(0,this.granular.lastPairs||0)*.004);
  p.bladeBounce=(p.bladeBounce||0)*Math.exp(-dt*9)+impact*(1-Math.exp(-dt*9));
  this.physics.contacts=this.granular.lastPairs+(this.granular.obstacleContacts||0);this.physics.height=this.granular.height;
  this.physics.active=this.granular.lastActive;
  this.physics.sleeping=this.granular.lastSleeping||0;
  this.physics.scheduled=this.granular.lastScheduled||0;
  this.physics.deferred=this.granular.activity?.dropped||0;
  this._liveGateCount=this.countLiving();
  let crushedThisFrame=0,depositedThisFrame=this.updateCargo(world);
  for(const r of this.resources){
   if(r.dead||r.cargoState)continue;
   // Both directions count. A particle can traverse a portal again after
   // clearing it, but tiny plane jitter and newly spawned copies cannot chain.
   for(const gate of world.gates){
    const from=r._frameZ;
    if((r._gateBlockUntil||0)>this.elapsed)continue;
    if(r._lastGate===gate.id &&
      (this.elapsed<(r._gateRearmAt||0) || Math.abs(from-gate.z)<.82))continue;
    const direction=crossedGatePlane(r,gate);
    if(direction&&this.multiply(r,gate,direction))break;
   }
   if(world.crusher?.trigger){
    const crusher=world.crusher;
    // The visible rotating teeth span the bar between these columns.
    const inside=insideTrigger(r,crusher.trigger);
    if(inside && r.kind===this.rules.ore){
     if(this.crush(r,crusher))crushedThisFrame++;
    }else if(inside && r.kind===this.rules.currency){
     // Gold leaves the teeth instead of being destroyed a second time.
     r.vx=Math.max(r.vx||0,1.25);
    }
   }
  }
  if(crushedThisFrame)this.emit('crushBatch',{count:crushedThisFrame});
  if(depositedThisFrame)this.emit('depositBatch',{count:depositedThisFrame});
  if(this.stage===0&&!this.stageExitIssued&&this.tracks.exit.level>=1&&
     p.z>=43&&Math.abs(p.x)<=LONG_MAP.entry.halfWidth){
   this.stageExitIssued=true;this.emit('stageExit',{to:1});
  }
  if(this.queuedAdd.length){this.resources.push(...this.queuedAdd);this.queuedAdd.length=0;}
  // Clear consumed slots before next gate multiplication. Never remove live objects.
  if(depositedThisFrame || this.resources.length>MAX_RESOURCES*.75 || this.elapsed%1<dt)
   this.resources=this.resources.filter(r=>!r.dead);
  this._liveGateCount=null;
  this.liveCount=this.countLiving();
  this.activeCount=this.liveCount;
  this.physics.objects=this.liveCount;
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
  const currencyKind=this.rules.currency,oreKind=this.rules.ore;
  const currency=living.reduce((n,r)=>n+(r.kind===currencyKind),0);
  const ore=living.reduce((n,r)=>n+(r.kind===oreKind),0);
  let budget=Math.min(available,SUPPLY.holdAt-living.length);
  const spawn=(kind,site,n)=>{
   const amount=Math.min(n,budget);
   for(let i=0;i<amount;i++){
    const a=Math.random()*TAU,d=Math.sqrt(Math.random())*site.radius;
    this.resources.push({id:this.nextResourceId++,kind,x:site.x+Math.cos(a)*d,z:site.z+Math.sin(a)*d,
     y:Math.random()*.14,vx:0,vy:0,vz:0,
     spin:Math.random()*TAU,angle:0,passedGates:0,cooldown:0,dead:false});
   }
   budget-=amount;
   if(amount)this.telemetry.record(kind===currencyKind?'restockedGold':'restockedOre',amount,this.elapsed);
   return amount;
  };
  const currencySite=this.rules.currencySupply,oreSite=this.rules.oreSupply;
  let newGold=0,newBlue=0;
  if(currency<currencySite.below)
   newGold=spawn(currencyKind,currencySite,Math.min(currencySite.batch,currencySite.below-currency));
  if(ore<oreSite.below)
   newBlue=spawn(oreKind,oreSite,Math.min(oreSite.batch,oreSite.below-ore));
  this.liveCount=this.countLiving();
  this.activeCount=this.liveCount;
  if(newGold||newBlue)this.emit('restock',{gold:newGold,blue:newBlue});
  return {gold:newGold,blue:newBlue,currency:newGold,ore:newBlue};
 }
}
