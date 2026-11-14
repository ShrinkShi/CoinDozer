import assert from 'node:assert/strict';
import {Simulation,MAX_RESOURCES} from '../src/physics.js';
import {World} from '../src/world.js';
import {enteredTrigger,insideTrigger,crossedGatePlane} from '../src/triggers.js';
import {createResourceLayout} from '../src/world.js';

const world=new World(0);
const particle=(kind='gold',x=0,z=0,y=0)=>({
 kind,x,z,y,vx:0,vy:0,vz:0,dead:false,passedGates:0,cooldown:0,spin:0,angle:0
});
const make=(r)=>{const sim=new Simulation(0);sim.resources=[r];sim.granular.step=()=>{};return sim;};

// A real crossing of just 0.01 world units was previously discarded.
for(const direction of [-1,1]){
 const gate=world.gates[0],r=particle('blue',gate.x,gate.z-direction*.005);
 const sim=make(r);
 sim.granular.step=()=>{r.z=gate.z+direction*.005;};
 sim.update(.016,0,0,world);
 assert.equal(sim.gateHits,1,'slow crossing must trigger once for either direction');
 assert.equal(sim.resources.filter(p=>!p.dead).length,2);
 sim.granular.step=()=>{r.z=gate.z+direction*(Math.round(sim.elapsed*100)%2?.005:-.005);};
 for(let i=0;i<90;i++)sim.update(.016,0,0,world);
 assert.equal(sim.gateHits,1,'plane jitter in the rearm zone is not a traversal');
}
{
 const gate=world.gates[0];
 assert.equal(crossedGatePlane({_frameZ:gate.z-.005,z:gate.z+.005,x:gate.x},gate),1);
 assert.equal(crossedGatePlane({_frameZ:gate.z+.005,z:gate.z-.005,x:gate.x},gate),-1);
 assert.equal(crossedGatePlane({_frameZ:gate.z,z:gate.z+.005,x:gate.x},gate),0);
}
{
 const pad=world.gateStations[0],existing=createResourceLayout(0).filter(p=>insideTrigger(p,pad.trigger));
 assert.equal(existing.length,0,'initial stage cannot pre-load its only gate payment zone');
 const c=particle('gold',pad.x,pad.z),sim=make(c);
 sim.player.x=pad.x;sim.player.z=pad.z;
 sim.update(.016,0,0,world);
 assert.equal(c.dead,false,'parked coin is not paid by player proximity alone');
 assert.equal(sim.totalDeposited,0);
 // Leaving and reentering produces exactly one legitimate payment.
 c.z=pad.z+pad.trigger.halfZ+.3;
 sim.update(.016,0,0,world);
 sim.granular.step=()=>{c.z=pad.z;};
 sim.update(.016,0,0,world);
 assert.equal(c.dead,true);
 assert.equal(sim.gateTracks[0].deposited,1);
 assert.equal(sim.totalDeposited,1);
 assert.equal(sim.activeCount,0);
}
{
 const pad=world.gateStations[0],c=particle('gold',pad.x,pad.z+2,2);
 const sim=make(c);sim.player.x=pad.x;sim.player.z=pad.z;
 sim.granular.step=()=>{c.z=pad.z;};
 sim.update(.016,0,0,world);
 assert.equal(c.dead,false,'airborne coin must not be paid above the pad');
 assert.equal(sim.totalDeposited,0);
}
{
 const station=world.upgradeStation,c=particle('gold',station.x,station.z+2);
 const sim=make(c);sim.player.x=station.x;sim.player.z=station.z;
 sim.granular.step=()=>{c.z=station.z;};
 sim.update(.016,0,0,world);
 assert.equal(c.dead,true,'pushed coin pays the vehicle station');
 assert.equal(sim.tracks.chassis.deposited,1);
}
{
 assert.equal(world.recycler,undefined,'v0.7 removes recycler entirely');
 const r=particle('blue',-22,18,.1),survivor=particle('gold',25,25);
 const sim=make(r);sim.resources.push(survivor);
 sim.update(.016,0,0,world);
 assert.equal(r.dead,false,'idle ore is never silently reclaimed');
 assert.equal(sim.activeCount,2,'HUD reports both independent resources');
 assert.equal(sim.telemetry.totals.recycled,0,'no recycler-side deletion remains');
}

{
 const sim=new Simulation(0);
 const ore=particle('blue',world.crusher.x,world.crusher.z);
 sim.resources=[ore,...Array.from({length:MAX_RESOURCES-2},()=>particle('gold',-22,22))];
 sim.granular.step=()=>{};
 sim.update(.016,0,0,world);
 assert.equal(ore.kind,'blue');
 assert.equal(sim.crushed,0);assert.equal(sim.queuedAdd.length,0);
 assert.equal(sim.telemetry.totals.goldProduced,0);
 // Once 2 old coins are consumed, the same ore can transform all 3 atomically.
 sim.resources[sim.resources.length-1].dead=true;
 sim.resources[sim.resources.length-2].dead=true;
 sim.elapsed+=1;ore.x=world.crusher.x;ore.z=world.crusher.z;
 sim.update(.016,0,0,world);
 assert.equal(ore.kind,'gold');assert.equal(sim.crushed,1);
 assert.equal(sim.liveCount,MAX_RESOURCES-1);
 assert.equal(sim.telemetry.totals.goldProduced,3);
}
{
 const stationary=particle('gold',world.gateStations[0].x,world.gateStations[0].z);
 assert.equal(enteredTrigger(stationary,world.gateStations[0].trigger),false);
 stationary._frameZ=stationary.z+2;
 assert.equal(enteredTrigger(stationary,world.gateStations[0].trigger),true);
}
console.log('v0.6.3.1 trigger boundary, low-speed traversal, live counts and atomic conversion PASS');
