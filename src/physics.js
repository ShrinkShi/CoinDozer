import {clamp,TAU} from './math.js';
import {createResourceLayout} from './world.js';
import {GranularSolver,PARTICLE_SHAPES} from './granular.js';
import {headingBasis} from './heading.js';
import {MAX_RESOURCES,SUPPLY,UPGRADE_COSTS,MAX_VEHICLE_LEVEL,TRACK_COSTS,GATE_COSTS,TRACK_KEYS,newProgress,trackRemaining,gateFactor,coinCredit,applyCredit,vehicleSpeed,vehicleTurnRate} from './economy.js';
import {EconomyTelemetry} from './telemetry.js';
import {insideTrigger,enteredTrigger,crossedGatePlane} from './triggers.js';
import {advanceTrackOdometer} from './vehicleRig.js';
import {sceneRules,paymentValue,isStageCurrency} from './sceneRules.js';

export {MAX_RESOURCES,UPGRADE_COSTS};
export const RADII=Object.fromEntries(Object.entries(PARTICLE_SHAPES).map(([name,s])=>[name,s.radius]));

/** Physical particles are the source of truth; no hidden numerical weights. */
export class Simulation{
 constructor(stage=0,progress={}){
  this.stage=stage;
  this.rules=sceneRules(stage);
  this.resources=createResourceLayout(stage);
  this.elapsed=0;this.lastGate=-20;
  const loaded=newProgress(progress);
  this.tracks=loaded.tracks;this.gateTracks=stage===1?loaded.caveGates:loaded.gates;this.selectedUpgrade=loaded.selected;
  this.level=this.tracks.chassis.level;this.deposit=this.tracks.chassis.deposited;
  this.totalDeposited=loaded.totalDeposited;
  this.remaining=trackRemaining(this.tracks.chassis,TRACK_COSTS.chassis);
  this.processed=0;this.crushed=0;this.multipliedValue=0;this.gateHits=0;
  this.restock=0;this.events=[];this.treads=[];this.lastTrail=0;
  this.won=this.level===MAX_VEHICLE_LEVEL;this.queuedAdd=[];this.liveCount=this.resources.length;this.activeCount=this.liveCount;this._liveGateCount=null;
  this.granular=new GranularSolver();this.physics={contacts:0,height:0,objects:0};
  this.player={x:stage?2:0,z:stage?12:11,yaw:0,speed:0,
   level:this.level,bladeLevel:this.tracks.blade.level,
   speedLevel:this.tracks.speed.level,steeringLevel:this.tracks.steering.level,
   coinLevel:this.tracks.coin.level,trackLeft:0,trackRight:0,travelDistance:0,
   bladeBounce:0,upgradeFlashAt:-50};
  this._crowdedNotified=-50;
  this.coinsSpent={vehicle:0,gate:0};
  this.telemetry=new EconomyTelemetry();this.supplyPaused=false;
 }
 setStage(stage,progress={}){Object.assign(this,new Simulation(stage,progress))}
 emit(type,data={}){this.events.push({type,...data})}
 countLiving(){return this.resources.reduce((n,r)=>n+(!r.dead?1:0),0);}
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
  if(!this.hasCapacity(2)){
   r.x=crusher.x-crusher.halfWidth-.57;
   r.vx=-Math.max(.8,Math.abs(r.vx||0)*.6);
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
  for(let i=0;i<2;i++){
   const side=i?1:-1;
   this.queuedAdd.push({...r,
    x:outputX+.2+i*.21,z:impactZ+side*.34,
    y:r.y+.06+i*.10,
    vx:r.vx+.35+i*.35,vy:2.15+.25*i,vz:side*(1.0+i*.22),
    angle:Math.random()*TAU,tiltX:0,tiltZ:0,omegaX:0,omegaZ:0,
    dead:false,cooldown:.35,_frameZ:impactZ+side*.34
   });
  }
  this.crushed++;this.processed++;
  this.telemetry.record('oreCrushed',1,this.elapsed);
  this.telemetry.record('goldProduced',3,this.elapsed);
  this.telemetry.record('goldValueProduced',3*paymentValue(this.stage,this.tracks),this.elapsed);
  this.emit('crush',{x:crusher.x+.5,z:impactZ,coins:3});
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
   if(!Number.isInteger(gateId)||gateId<0||gateId>=this.gateTracks.length)return false;
   progress=this.gateTracks[gateId];costs=GATE_COSTS;
  }else{
   if(!TRACK_KEYS.includes(trackKey))return false;
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
  }else{
   this.emit('deposit',{station:'vehicle',track:trackKey,credits:result.spent,remaining:result.remaining,x:r.x,z:r.z});
   this.level=this.tracks.chassis.level;
   this.deposit=this.tracks.chassis.deposited;
   this.remaining=trackRemaining(this.tracks.chassis,TRACK_COSTS.chassis);
   this.player.level=this.level;
   this.player.bladeLevel=this.tracks.blade.level;
   this.player.speedLevel=this.tracks.speed.level;
   this.player.steeringLevel=this.tracks.steering.level;
   this.player.coinLevel=this.tracks.coin.level;
   if(result.upgrades)this.player.upgradeFlashAt=this.elapsed;
   this.won=this.tracks.chassis.level>=MAX_VEHICLE_LEVEL;
   if(result.upgrades)this.emit('upgrade',{track:trackKey,level:result.level,value:paymentValue(this.stage,this.tracks),nextCost:result.remaining});
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
  const p=this.player,previous={x:p.x,z:p.z,yaw:p.yaw};
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
  for(const r of this.resources)if(!r.dead){r._frameX=r.x;r._frameY=r.y;r._frameZ=r.z;r.cooldown=Math.max(0,(r.cooldown||0)-dt);}
  this.granular.step(this.resources,dt,p,previous,world);
  if(this.granular.obstacleField)this.granular.obstacleField.resolve(p,1.05);
  // Visual odometer observes actual resolved movement, never drives the physics.
  advanceTrackOdometer(p,previous);
  const impact=Math.min(.085,Math.max(0,this.granular.lastPairs||0)*.004);
  p.bladeBounce=(p.bladeBounce||0)*Math.exp(-dt*9)+impact*(1-Math.exp(-dt*9));
  this.physics.contacts=this.granular.lastPairs+(this.granular.obstacleContacts||0);this.physics.height=this.granular.height;
  this.physics.active=this.granular.lastActive;
  this.physics.sleeping=this.granular.lastSleeping||0;
  this.physics.scheduled=this.granular.lastScheduled||0;
  this.physics.deferred=this.granular.activity?.dropped||0;
  this._liveGateCount=this.countLiving();
  let crushedThisFrame=0,depositedThisFrame=0;
  const station=world.upgradeStation;
  const playerAtStation=station && Math.hypot(p.x-station.x,p.z-station.z)<station.vehicleRadius;
  const gatePads=world.gateStations||[];
  for(const r of this.resources){
   if(r.dead)continue;
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
    if(isStageCurrency(this.stage,r.kind)){
     let paid=false;
     // Gate pads have their own upgrade tracks; one physical coin enters
     // only one pad in a frame. Vehicle must remain nearby to enable payment.
     for(const pad of gatePads){
      if(Math.hypot(p.x-pad.x,p.z-pad.z)<pad.vehicleRadius &&
         insideTrigger(r,pad.trigger)){
       if(enteredTrigger(r,pad.trigger)&&this.payCoin(r,null,'gate',pad.id)){
        paid=true;depositedThisFrame++;
       }
       break;
      }
     }
     if(!paid&&!r.dead&&station&&playerAtStation&&
        enteredTrigger(r,station.trigger)){
       if(this.payCoin(r))depositedThisFrame++;
     }
    }
    if(!r.dead&&(this.stage===1||r.kind!=='pearl')&&insideTrigger(r,world.recycler?.trigger)){
     this.markDead(r);this.processed++;
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
    this.resources.push({kind,x:site.x+Math.cos(a)*d,z:site.z+Math.sin(a)*d,
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
