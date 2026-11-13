import assert from 'node:assert/strict';
import {Simulation,MAX_RESOURCES} from '../src/physics.js';
import {World} from '../src/world.js';
import {UPGRADE_COSTS,MAX_VEHICLE_LEVEL,applyUpgradePayment} from '../src/economy.js';
import {wheelZoom,pinchZoom,ZOOM_MIN,ZOOM_MAX} from '../src/cameraZoom.js';

const world=new World(0);
assert.deepEqual(world.gates.map(g=>g.multiplier),[2,3,5,10]);
assert.equal(new World(1).gates[0].multiplier,5);
const make=(kind,x,z)=>({kind,x,z,y:0,vx:0,vy:0,vz:-10,dead:false,passedGates:0,cooldown:0,spin:0,angle:0});
const noParticles=(sim)=>{sim.granular.step=()=>{};};
for(const gate of world.gates){
 const sim=new Simulation(0),r=make('blue',gate.x,gate.z+.32);
 sim.resources=[r];noParticles(sim);
 // A contact crossing: no need to move the bulldozer or alter other objects.
 sim.granular.step=resources=>{resources[0].z=gate.z-.10};
 sim.update(.032,0,0,world);
 assert.equal(sim.resources.filter(p=>!p.dead).length,gate.multiplier,`×${gate.multiplier} gate`);
 assert.equal(sim.multipliedValue,gate.multiplier-1);
 assert.equal(sim.resources.filter(p=>p!==r).length,gate.multiplier-1);
 assert.ok(sim.resources.every(p=>p.weight===undefined),'no hidden weight/aggregation');
 assert.ok(sim.resources.every(p=>((p.passedGates||0)&(1<<gate.id))!==0));
 console.log(`PASS ×${gate.multiplier}: ${gate.multiplier} independent resources`);
}
{
 const gate=world.gates.at(-1),sim=new Simulation(0),r=make('blue',gate.x,gate.z+.32);
 sim.resources=[r,...Array.from({length:MAX_RESOURCES-1},(_,i)=>make('gold',-27+(i%13)*.001,26))];
 noParticles(sim);sim.granular.step=resources=>{resources[0].z=gate.z-.1};
 sim.update(.032,0,0,world);
 assert.equal(sim.resources.length,MAX_RESOURCES);
 assert.equal(sim.multipliedValue,0);
 assert.equal(r.kind,'blue');assert.ok(r.z>gate.z);
 assert.ok(sim.events.some(e=>e.type==='gateFull'));
 console.log('PASS full gate: no fake counts, no silent approximation');
}
{
 const sim=new Simulation(0),ore=make('blue',world.crusher.x,world.crusher.z);
 sim.resources=[ore];noParticles(sim);
 sim.update(.016,0,0,world);
 assert.equal(ore.kind,'gold');assert.equal(sim.crushed,1);assert.equal(ore.dead,false);
 assert.ok(ore.vx>1,'gold exits right from roller');
 assert.ok(sim.events.some(e=>e.type==='crushBatch'));
 console.log('PASS deterministic crusher blue → gold');
 // Integrated interaction: the bulldozer actually pushes a ball into the teeth.
 const pushed=new Simulation(0),ore2=make('blue',8,7.2);
 ore2.vz=0;pushed.resources=[ore2];
 pushed.player={x:5,z:7.2,yaw:Math.PI/2,speed:0,level:0};
 let frames=0;
 while(ore2.kind==='blue'&&frames++<180)pushed.update(.016,1,0,world);
 assert.equal(ore2.kind,'gold','a drivable bulldozer must be able to feed the crusher');
 assert.ok(pushed.crushed>=1);
 console.log('PASS integrated bulldozer → roller → physical gold');
}
{
 const sim=new Simulation(0),coin=make('gold',world.upgradeStation.x,world.upgradeStation.z);
 sim.resources=[coin];noParticles(sim);sim.update(.02,0,0,world);
 assert.equal(sim.deposit,0,'cannot pay without machine nearby');assert.equal(coin.dead,false);
 sim.player.x=world.upgradeStation.x;sim.player.z=world.upgradeStation.z;
 sim.update(.02,0,0,world);
 assert.equal(sim.deposit,1);assert.equal(coin.dead,true);
 console.log('PASS upgrade station requires vehicle and physical coin');
}
{
 const sim=new Simulation(0);sim.player.x=world.upgradeStation.x;sim.player.z=world.upgradeStation.z;
 sim.resources=Array.from({length:UPGRADE_COSTS[0]},()=>make('gold',world.upgradeStation.x,world.upgradeStation.z));
 noParticles(sim);sim.update(.024,0,0,world);
 assert.equal(sim.level,1);assert.equal(sim.player.level,1);assert.equal(sim.remaining,UPGRADE_COSTS[1]);
 assert.equal(sim.totalDeposited,UPGRADE_COSTS[0]);assert.equal(sim.resources.length,0);
 assert.equal(sim.events.filter(e=>e.type==='upgrade').length,1);
 let p={level:1,deposited:0};
 for(let k=1;k<MAX_VEHICLE_LEVEL;k++)p=applyUpgradePayment(p,UPGRADE_COSTS[k]);
 assert.equal(p.level,MAX_VEHICLE_LEVEL);
 console.log('PASS upgrade cost tiering and full progression');
}
assert.ok(wheelZoom(1,120)>1);assert.ok(wheelZoom(1,-120)<1);
assert.ok(pinchZoom(1,100,160)<1);assert.ok(pinchZoom(1,100,60)>1);
assert.equal(wheelZoom(ZOOM_MAX,300),ZOOM_MAX);assert.equal(pinchZoom(ZOOM_MIN,100,300),ZOOM_MIN);
console.log('PASS wheel and pinch zoom directions and clamps');
