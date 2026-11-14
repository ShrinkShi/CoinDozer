import assert from 'node:assert/strict';
import {World,createResourceLayout} from '../src/world.js';
import {Simulation,MAX_RESOURCES} from '../src/physics.js';
import {newProgress,gateFactor,TRACK_COSTS,trackRemaining,GATE_COSTS} from '../src/economy.js';
import {sceneRules,paymentValue} from '../src/sceneRules.js';
import {insideTrigger} from '../src/triggers.js';

const ore=(kind,x=0,z=0,y=0)=>({kind,x,z,y,vx:0,vy:0,vz:0,dead:false,
 passedGates:0,cooldown:0,spin:0,angle:0,tiltX:0,tiltZ:0,omegaX:0,omegaZ:0});
const make=(stage,resources=[])=>{const s=new Simulation(stage);s.resources=resources;
 s.granular.step=()=>{};return s;};
const lava=new World(0),cave=new World(1);
assert.equal(sceneRules(0).currency,'gold');
assert.equal(sceneRules(1).currency,'ingot');
assert.equal(sceneRules(1).ore,'pearl');
assert.equal(sceneRules(1).yield,3);
assert.equal(cave.gates.length,2,'two real cave portals');
assert.equal(cave.gateStations.length,2,'every cave portal has a separate payment station');
assert.equal(cave.sites.gates.length,2);
assert.equal(cave.sites.gateCosts.length,2);
assert.ok(cave.crusher.trigger&&cave.recycler.trigger&&cave.upgradeStation.trigger,'all cave gameplay triggers exist');
assert.ok(cave.sites.cost&&cave.sites.counter&&cave.sites.upgradeText,'cave labels exist');
assert.equal(new Simulation(1).gateTracks.length,2);
assert.equal(new Simulation(0).gateTracks.length,4);
assert.equal(new Simulation(1).player.level,0,'no fake free chassis levels in cave');
{
 const items=createResourceLayout(1);
 assert.ok(items.filter(x=>x.kind==='pearl').length>200,'crystal ore is available at start');
 assert.ok(items.filter(x=>x.kind==='ingot').length>=150,'physical ingot cache exists');
 assert.ok(items.length<MAX_RESOURCES);
 assert.equal(items.some(x=>insideTrigger(x,cave.upgradeStation.trigger)),false,'initial payable ingots not on vehicle station');
 assert.equal(items.filter(x=>x.kind==='ingot').some(x=>cave.gateStations.some(g=>insideTrigger(x,g.trigger))),false,
  'no initial ingots inside an upgrade gate');
}
{
 const pearl=ore('pearl',cave.crusher.x,cave.crusher.z);
 const s=make(1,[pearl]);
 s.elapsed=1;s.update(.016,0,0,cave);
 const live=s.resources.filter(r=>!r.dead);
 assert.equal(s.crushed,1);
 assert.equal(live.length,3,'one crystal becomes three independent physical ingots');
 assert.equal(new Set(live).size,3);
 assert.ok(live.every(r=>r.kind==='ingot'));
 assert.equal(s.telemetry.totals.oreCrushed,1);
 assert.equal(s.telemetry.totals.goldProduced,3);
 assert.equal(s.telemetry.totals.goldValueProduced,9,'three base-value ingots worth nine credits');
}
{
 const s=make(1),pearl=ore('pearl',cave.crusher.x,cave.crusher.z);
 s.resources=[pearl,...Array.from({length:MAX_RESOURCES-1},()=>ore('ingot',-23,18))];
 s.elapsed=2;
 assert.equal(s.crush(pearl,cave.crusher),false,'no partial conversion at hard cap');
 assert.equal(pearl.kind,'pearl');
 assert.equal(s.queuedAdd.length,0);
 s.resources.at(-1).dead=true;s.resources.at(-2).dead=true;
 s.elapsed+=1;pearl.x=cave.crusher.x;pearl.z=cave.crusher.z;
 assert.equal(s.crush(pearl,cave.crusher),true,'retry after two free slots');
 assert.equal(s.queuedAdd.length,2);
 assert.equal(s.resources.filter(x=>!x.dead).length+s.queuedAdd.length,MAX_RESOURCES);
}
{
 const s=make(1);
 const gold=ore('gold'),pearl=ore('pearl'),ingot=ore('ingot');
 assert.equal(s.payCoin(gold),false);
 assert.equal(s.payCoin(pearl),false);
 assert.equal(gold.dead,false);assert.equal(pearl.dead,false);
 assert.equal(paymentValue(0,s.tracks),1);
 assert.equal(paymentValue(1,s.tracks),3);
 assert.equal(s.payCoin(ingot),true);
 assert.equal(ingot.dead,true);
 assert.equal(s.tracks.chassis.deposited,3);
 assert.equal(s.telemetry.totals.creditsPaid,3);
 assert.equal(s.totalDeposited,1,'one ingot remains one spent physical object');
 const firstGate=ore('ingot');
 assert.equal(s.payCoin(firstGate,null,'gate',0),true);
 assert.equal(s.gateTracks[0].deposited,3);
 assert.equal(s.gateTracks[1].deposited,0);
 assert.equal(s.payCoin(ore('ingot'),null,'gate',2),false,'no phantom third gate');
}
{
 const s=make(1);s.selectUpgrade('coin');
 const progress={tracks:{coin:{level:2,deposited:0}},gates:[
   {level:3,deposited:12},{level:0,deposited:0},{level:1,deposited:1},{level:0,deposited:0}
 ],caveGates:[{level:2,deposited:7},{level:1,deposited:0}],
 selected:'coin',totalDeposited:492};
 const original=newProgress(progress);
 const openCave=new Simulation(1,progress),openLava=new Simulation(0,progress);
 assert.equal(original.caveGates.length,2);
 assert.equal(openCave.tracks.coin.level,2);
 assert.equal(openLava.tracks.coin.level,2);
 assert.equal(openCave.selectedUpgrade,'coin');
 assert.equal(openCave.totalDeposited,492);
 assert.equal(openCave.gateTracks[0].level,2);
 assert.equal(openCave.gateTracks[1].level,1);
 assert.equal(openLava.gateTracks[0].level,3);
 assert.equal(openLava.gateTracks[2].level,1);
 assert.equal(newProgress({tracks:progress.tracks}).caveGates[0].level,0,'old saves have default cave gates');
 assert.equal(openCave.player.level,0,'shared chassis level is loaded exactly');
 assert.equal(paymentValue(1,openCave.tracks),9);
 assert.equal(trackRemaining(openCave.tracks.coin,TRACK_COSTS.coin),110);
}
{
 const gate=cave.gates[0],p=ore('ingot',gate.x,gate.z+.006);
 const s=make(1,[p]);s.granular.step=()=>{p.z=gate.z-.006;};
 s.update(.016,0,0,cave);
 assert.equal(s.gateHits,1);
 assert.equal(s.resources.filter(x=>!x.dead).length,2,'cave gate materializes a real ingot');
 assert.equal(s.telemetry.totals.goldProduced,1);
 assert.equal(s.telemetry.totals.goldValueProduced,3);
 const second=new Simulation(1,{caveGates:[{level:2},{level:0}]});
 assert.equal(gateFactor(second.gateTracks[0]),5);
 assert.equal(gateFactor(second.gateTracks[1]),2);
}
{
 const p=cave.gateStations[1],bar=ore('ingot',p.x,p.z+2);
 const s=make(1,[bar]);s.player.x=p.x;s.player.z=p.z;
 s.granular.step=()=>{bar.z=p.z;};
 s.update(.016,0,0,cave);
 assert.equal(bar.dead,true,'ingots pay on physical entry');
 assert.equal(s.gateTracks[1].deposited,3);
}
{
 const u=cave.upgradeStation,p=ore('ingot',u.x,u.z+2);
 const s=make(1,[p]);s.player.x=u.x;s.player.z=u.z;
 s.granular.step=()=>{p.z=u.z;};
 s.update(.016,0,0,cave);
 assert.equal(p.dead,true,'ingots pay the cave vehicle station');
 assert.equal(s.tracks.chassis.deposited,3);
}
{
 const r=ore('ingot',cave.recycler.trigger.x,cave.recycler.trigger.z,2);
 const s=make(1,[r]);s.update(.016,0,0,cave);
 assert.equal(r.dead,false,'ingot above recycler remains physical');
 r.y=.1;s.update(.016,0,0,cave);
 assert.equal(r.dead,true,'surface contact recycles one real object');
}
{
 const s=make(1),stock=s.replenishResources();
 assert.ok(stock.currency>0&&stock.ore>0,'cave refills both economy inputs');
 assert.equal(s.resources.filter(x=>x.kind==='ingot').length,stock.currency);
 assert.equal(s.resources.filter(x=>x.kind==='pearl').length,stock.ore);
 assert.equal(s.telemetry.totals.restockedGold,stock.currency);
 assert.equal(s.telemetry.totals.restockedOre,stock.ore);
 const before=s.countLiving();
 s.resources=Array.from({length:MAX_RESOURCES},()=>ore('ingot'));
 assert.equal(s.replenishResources().currency,0,'full map pauses supply without deletes');
 assert.equal(s.countLiving(),MAX_RESOURCES);
 assert.ok(before>0);
}
{
 const s=make(0),coin=ore('gold',lava.upgradeStation.x,lava.upgradeStation.z+2);
 s.resources=[coin];s.player.x=lava.upgradeStation.x;s.player.z=lava.upgradeStation.z;
 s.granular.step=()=>{coin.z=lava.upgradeStation.z;};
 s.update(.016,0,0,lava);
 assert.equal(coin.dead,true,'lava gold payment regression');
 assert.equal(s.tracks.chassis.deposited,1,'old coin base value unchanged');
}
console.log('v0.6.5: fully playable crystal cave, atomic conversion, payouts, gate isolation, restock and lava regression PASS');
