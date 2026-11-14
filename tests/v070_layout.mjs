import assert from 'node:assert/strict';
import {World,createResourceLayout} from '../src/world.js';
import {Simulation,MAX_RESOURCES} from '../src/physics.js';
import {LONG_MAP,MAIN_BRIDGE_WIDTHS,mainBridgeWidth} from '../src/mapLayout.js';
import {constrainToTerrain,configureTerrain} from '../src/terrain.js';
import {INFRA_COSTS,TRACK_COSTS,crusherYield,newProgress,gateFactor} from '../src/economy.js';
import {sceneRules} from '../src/sceneRules.js';
import {screenStickToWorld} from '../src/heading.js';

const particle=(kind,x=0,z=0,y=0)=>({
 kind,x,z,y,vx:0,vy:0,vz:0,spin:0,angle:0,cooldown:0,passedGates:0,dead:false
});
const stage=new World(0);
assert.equal(sceneRules(0).name,'冰河矿场');
const north=screenStickToWorld(0,-1,true),south=screenStickToWorld(0,-1,false);
assert.ok(north.z>0&&south.z<0,'camera orientation keeps W / upward joystick going toward north');
assert.ok(Math.abs(north.x+south.x)<1e-9,'reverse map camera rotates controls by 180 degrees');
assert.equal(sceneRules(1).name,'冰雪矿区');
assert.deepEqual(stage.bounds,LONG_MAP.bounds);
assert.equal(stage.gates.length,1,'exactly one ore multiplier');
assert.equal(stage.gateStations.length,1,'exactly one gate upgrade pad');
assert.equal(stage.gates[0].z,-28);
assert.deepEqual([stage.crusher.x,stage.crusher.z],[0,8]);
assert.deepEqual([stage.upgradeStation.x,stage.upgradeStation.z],[18,11]);
assert.equal(stage.recycler,undefined,'recycler must not be in either map');
assert.equal(new World(1).recycler,undefined,'remove recycler in snow level too');
assert.equal(stage.terrain.rivers.length,2);
assert.equal(stage.terrain.rivers[0].zMin,-14);
assert.equal(stage.terrain.rivers[0].zMax,-2);
assert.equal(stage.terrain.rivers[1].zMin,31);
assert.equal(stage.terrain.rivers[1].zMax,41);
assert.equal(stage.bridges.main.width,12);
assert.equal(stage.bridges.next.width,0,'north bridge is truly locked');

const start=new Simulation(0);
assert.deepEqual([start.player.x,start.player.z],[0,-47]);
assert.equal(start.player.level,0);
assert.equal(start.resources.filter(p=>p.kind==='gold').length,0,
 'no invisible/free coins; all currency comes from processing');
assert.ok(start.resources.filter(p=>p.kind==='blue').length>350);
assert.equal(start.replenishResources().gold,0,'ore-only automatic supply');
assert.equal(start.telemetry.totals.restockedGold,0);
assert.equal(start.tracks.crusher.level,0);
assert.equal(start.tracks.bridge.level,0);
assert.equal(start.tracks.exit.level,0);
assert.equal(crusherYield(start.tracks),3);
assert.equal(mainBridgeWidth(start.tracks),12);

for(const x of [-31,-18,-7.2,7.2,18,31]){
 const r=particle('blue',x,-8),prev={x,z:-17};
 const n=constrainToTerrain(r,prev,stage.terrain,.30);
 if(Math.abs(x)>6){assert.ok(n>0&&r.z<=-14.3,'river is impassable outside the bridge');}
 else assert.equal(n,0,'central bridge passage remains open');
}
{
 const north=particle('blue',0,35);
 assert.ok(constrainToTerrain(north,{x:0,z:28},stage.terrain,.3)>0);
 assert.ok(north.z<31,'locked bridge blocks both resource and vehicle traffic');
}
{
 const near=particle('blue',0,-8),before={x:0,z:-9};
 near.x=20;
 constrainToTerrain(near,before,stage.terrain,.35);
 assert.ok(Math.abs(near.x)<6,'cannot slip sideways off a bridge onto the frozen river');
}
for(let tier=0;tier<MAIN_BRIDGE_WIDTHS.length;tier++){
 const tracks=newProgress({tracks:{bridge:{level:tier}}}).tracks;
 configureTerrain(stage,tracks);
 assert.equal(stage.bridges.main.width,MAIN_BRIDGE_WIDTHS[tier]);
 const p=particle('blue',MAIN_BRIDGE_WIDTHS[tier]/2-.5,-8);
 assert.equal(constrainToTerrain(p,{x:p.x,z:-17},stage.terrain,.3),0);
}
configureTerrain(stage,newProgress({}).tracks);

{
 const r=particle('blue',0,stage.gates[0].z+.005);
 const s=new Simulation(0);s.resources=[r];s.granular.step=()=>{r.z=stage.gates[0].z-.005;};
 s.update(.016,0,0,stage);
 assert.equal(s.gateHits,1,'slow ore crossing triggers multiplication');
 assert.equal(s.resources.filter(p=>!p.dead).length,2);
 assert.ok(s.resources.every(p=>p.kind==='blue'),'gate only duplicates ore');
 assert.equal(s.telemetry.totals.goldProduced,0,'multiplying ore does not mint coins');
 const coin=particle('gold',0,stage.gates[0].z+.005);
 const c=new Simulation(0);c.resources=[coin];c.granular.step=()=>{coin.z=stage.gates[0].z-.005;};
 c.update(.016,0,0,stage);
 assert.equal(c.gateHits,0,'gold may pass but cannot be duplicated in the ore gate');
 assert.equal(c.resources.length,1);
}
{
 const s=new Simulation(0);
 s.resources=[];s.tracks.crusher.level=2;
 const r=particle('blue',stage.crusher.x,stage.crusher.z);
 s.resources=[r];s.elapsed=3;
 assert.equal(crusherYield(s.tracks),5);
 assert.equal(s.crush(r,stage.crusher),true);
 assert.equal(s.queuedAdd.length,4);
 assert.equal(s.telemetry.totals.goldProduced,5);
 assert.equal(s.telemetry.totals.goldValueProduced,5);
 assert.equal(new Set([r,...s.queuedAdd]).size,5);
 assert.ok([r,...s.queuedAdd].every(p=>p.kind==='gold'));
}
{
 const s=new Simulation(0),r=particle('blue',stage.crusher.x,stage.crusher.z);
 s.tracks.crusher.level=4;s.elapsed=4;
 s.resources=[r,...Array.from({length:MAX_RESOURCES-1},()=>particle('gold',-25,20))];
 assert.equal(s.crush(r,stage.crusher),false);
 assert.equal(r.kind,'blue');assert.equal(s.queuedAdd.length,0);
 for(let i=0;i<6;i++)s.resources[s.resources.length-1-i].dead=true;
 r.x=stage.crusher.x;r.z=stage.crusher.z;s.elapsed+=1;
 assert.equal(s.crush(r,stage.crusher),true);
 assert.equal(s.queuedAdd.length,6);
 assert.equal(s.resources.filter(p=>!p.dead).length+6,MAX_RESOURCES);
}
{
 const s=new Simulation(0);s.resources=[];
 assert.equal(s.payCoin(particle('blue'),null,'gate',0),false,'only gold may pay');
 assert.equal(s.payCoin(particle('gold'),'coin','vehicle'),false,
  'coin value cannot be paid at the chassis station');
 const stationTests=[['crusher',35,1],['bridge',30,1],['exit',350,1],['coin',25,1]];
 for(const [key,cost,level] of stationTests){
  for(let i=0;i<cost;i++)assert.equal(s.payCoin(particle('gold'),key,'feature'),true);
  assert.equal(s.tracks[key].level,level,key+' reaches next level exactly');
 }
 assert.equal(s.tracks.bridge.level,1);
 assert.equal(s.tracks.crusher.level,1);
 assert.equal(s.tracks.exit.level,1);
 assert.equal(s.tracks.coin.level,1);
 assert.equal(s.totalDeposited,440);
 assert.equal(s.coinsSpent.feature,440);
 assert.ok(s.events.some(e=>e.type==='featureUpgrade'&&e.track==='exit'));
 configureTerrain(stage,s.tracks);
 assert.equal(stage.bridges.main.width,15);
 assert.equal(stage.bridges.next.width,10);
 const p=particle('blue',0,36);
 assert.equal(constrainToTerrain(p,{x:0,z:29},stage.terrain,.30),0);
 assert.equal(newProgress({tracks:s.tracks}).tracks.exit.level,1,'unlock persists');
}
{
 const migrated=newProgress({stage:1,tracks:{chassis:{level:2}}});
 assert.equal(migrated.tracks.exit.level,1,'v0.6.5 stage2 saves migrate unlocked');
 const old=newProgress({stage:0,tracks:{chassis:{level:2}},gates:[{level:3}]});
 assert.equal(old.tracks.chassis.level,2);
 assert.equal(old.gates[0].level,3);
 assert.equal(old.tracks.bridge.level,0);
 assert.equal(old.tracks.exit.level,0);
}
{
 const snow=new World(1),s=new Simulation(1);
 assert.equal(s.rules.currency,'ingot');
 assert.equal(s.rules.ore,'pearl');
 assert.equal(s.gateTracks.length,2);
 assert.ok(snow.upgradeStation&&snow.crusher);
 assert.equal(snow.recycler,undefined);
}
{
 const run=(x,unlocked)=>{
  const w=new World(0),s=new Simulation(0,{tracks:{exit:{level:unlocked?1:0}}});
  s.resources=[];s.granular.step=()=>{};
  s.player.x=x;s.player.z=unlocked?29:-18;s.player.yaw=Math.PI;
  for(let i=0;i<170;i++)s.update(.044,0,1,w);
  return {s,w};
 };
 const blocked=run(18,false);
 assert.ok(blocked.s.player.z<=-15.0,'driving outside main bridge cannot cross river');
 const main=run(0,false);
 assert.ok(main.s.player.z>0,'car can cross the main bridge');
 assert.equal(main.s.events.some(e=>e.type==='stageExit'),false,'locked north bridge cannot trigger exit');
 const open=run(0,true);
 assert.ok(open.s.player.z>43,'paid north bridge is traversable');
 assert.equal(open.s.events.filter(e=>e.type==='stageExit').length,1,
  'crossing the northern entry fires exactly one stage transition');
}
console.log('v0.7.0 long map: physical ice barriers, real bridges, ore-only multiplier, atomic yields, all station purchases and locked progression PASS');
