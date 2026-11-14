/** v0.6.1 supply pacing, real-object accounting, diagnostic-only telemetry. */
import assert from 'node:assert/strict';
import {Simulation,MAX_RESOURCES} from '../src/physics.js';
import {World} from '../src/world.js';
import {EconomyTelemetry} from '../src/telemetry.js';
import {SUPPLY,TRACK_COSTS,newProgress,coinCredit} from '../src/economy.js';
const world=new World(0);
const coin=(x=0,z=10,kind='gold')=>({kind,x,z,y:0,vx:0,vy:0,vz:0,dead:false,cooldown:0,angle:0,spin:0});
const starter=new Simulation(0);
const nearbyStarter=starter.resources.filter(r=>r.kind==='gold'&&(r.x-2)**2+(r.z-6.2)**2<2.01**2);
assert.ok(nearbyStarter.length>=SUPPLY.starterCoins,'starter has enough physical coins for one early upgrade');
assert.equal(starter.resources.length,starter.activeCount);
assert.equal(coinCredit(starter.tracks),1);
assert.deepEqual(TRACK_COSTS.chassis,[30,90,240,600]);
assert.equal(SUPPLY.interval,15);
{
 const sim=new Simulation(0);sim.resources=[];
 sim.elapsed=30;
 const minted=sim.replenishResources();
 assert.ok(minted.gold>0&&minted.blue>0);
 assert.equal(sim.resources.length,minted.gold+minted.blue);
 assert.ok(sim.resources.every(r=>!r.dead && !r.weight));
 assert.equal(sim.telemetry.snapshot(30).recent.goldProduced,0,'free restocks are not earned gold');
 assert.equal(sim.telemetry.snapshot(30).totals.restockedGold,minted.gold);
 const prev=sim.resources.length;
 sim.replenishResources();
 assert.ok(sim.resources.length>=prev,'restock does not delete objects');
}
{
 const sim=new Simulation(0);sim.resources=Array.from({length:SUPPLY.holdAt},(_,i)=>coin((i%100)*.2,15,'blue'));
 sim.elapsed=30;const before=sim.resources;
 const result=sim.replenishResources();
 assert.deepEqual(result,{gold:0,blue:0});
 assert.strictEqual(sim.resources,before,'no silent deletion or merging at high density');
 assert.equal(sim.resources.length,SUPPLY.holdAt);
 assert.equal(sim.supplyPaused,true);
 assert.ok(sim.events.some(e=>e.type==='supplyPaused'));
}
{
 const sim=new Simulation(0);sim.resources=[coin(world.crusher.x,world.crusher.z,'blue')];
 sim.elapsed=20;sim.granular.step=()=>{};
 sim.update(.016,0,0,world);
 const metric=sim.telemetry.snapshot(sim.elapsed);
 assert.equal(metric.recent.oreCrushed,1);
 assert.equal(metric.recent.goldProduced,3);
 assert.equal(metric.recent.goldValueProduced,3);
 assert.equal(sim.resources.filter(r=>r.kind==='gold').length,3);
 sim.selectUpgrade('coin');for(let i=0;i<25;i++)sim.payCoin(coin(),undefined,'vehicle');
 assert.equal(coinCredit(sim.tracks),2);
 const before=sim.telemetry.totals.goldProduced;
 const gate=world.gates[0],p=coin(gate.x,gate.z);
 assert.equal(sim.multiply(p,gate,1),true);
 assert.equal(sim.telemetry.totals.goldProduced,before+1,'real multiplier gold counts, credits at current valuation');
 assert.equal(sim.telemetry.totals.goldValueProduced,5);
 assert.equal(sim.telemetry.totals.goldPaid,25);
 assert.equal(sim.telemetry.totals.creditsPaid,25);
}
{
 const m=new EconomyTelemetry();
 m.record('goldProduced',5,5);m.record('goldProduced',7,30);
 assert.equal(m.snapshot(40).recent.goldProduced,12);
 assert.equal(m.snapshot(67).recent.goldProduced,7);
 assert.equal(m.snapshot(100).recent.goldProduced,0);
 assert.equal(m.snapshot(100).totals.goldProduced,12);
 m.record('bogus',99,100);m.record('goldProduced',-1,100);
 assert.equal(m.snapshot(100).totals.goldProduced,12);
}
{
 const sim=new Simulation(0,{tracks:{chassis:{level:1,deposited:14}},selected:'speed',gates:[{level:2,deposited:5}]});
 assert.equal(sim.tracks.chassis.level,1);
 assert.equal(sim.tracks.chassis.deposited,14);
 assert.equal(sim.gateTracks[0].level,2);
 assert.equal(sim.selectedUpgrade,'speed');
 assert.deepEqual(sim.tracks,newProgress({tracks:sim.tracks}).tracks);
}
{
 const sim=new Simulation(0);sim.resources=Array.from({length:MAX_RESOURCES},(_,i)=>coin((i%100)*.14,15,'gold'));
 const gate=world.gates[0],r=sim.resources[0];
 const before=sim.resources.length;
 assert.equal(sim.multiply(r,gate,1),false);
 assert.equal(sim.resources.length,before);
 assert.equal(sim.queuedAdd.length,0);
 assert.equal(sim.telemetry.snapshot(2).totals.blocked,1);
}
console.log('v0.6.1 economy: physical starter pile, bounded restock, credit accounting, telemetry, legacy saves and cap PASS');
