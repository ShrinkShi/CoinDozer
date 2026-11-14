import assert from 'node:assert/strict';
import {Simulation} from '../src/physics.js';
import {World} from '../src/world.js';
import {GranularSolver} from '../src/granular.js';
import {GATE_FACTORS,GATE_COSTS,TRACK_COSTS,coinCredit,gateFactor,trackRemaining,vehicleSpeed,vehicleTurnRate} from '../src/economy.js';
import {renderVehicle} from '../src/vehicle.js';
const world=new World(0);
const coin=(x=0,z=0,kind='gold')=>({kind,x,z,y:0,vx:0,vy:0,vz:0,dead:false,cooldown:0,spin:0,angle:0});
const make=()=>{const s=new Simulation(0);s.resources=[];s.granular.step=()=>{};return s;};
assert.deepEqual(GATE_FACTORS,[2,3,5,8,12,16,20]);
assert.deepEqual(world.gates.map(g=>g.multiplier),[2],'only one active ore multiplier');
{
 const id=0,s=make(),pad=world.gateStations[id],gate=world.gates[id],c=coin(pad.x,pad.z+2);
 s.resources=[c];s.player.x=0;s.player.z=-47;s.update(.016,0,0,world);
 assert.equal(c.dead,false);
 s.player.x=pad.x;s.player.z=pad.z;
 s.granular.step=()=>{c.z=pad.z;};s.update(.016,0,0,world);
 assert.equal(c.dead,true,'one real gold deposit');
 for(let tier=0;tier<GATE_COSTS.length;tier++){
  const amount=trackRemaining(s.gateTracks[id],GATE_COSTS);
  for(let i=0;i<amount;i++)assert.equal(s.payCoin(coin(pad.x,pad.z),null,'gate',id),true);
  assert.equal(gateFactor(s.gateTracks[id]),GATE_FACTORS[tier+1]);
 }
 assert.equal(s.payCoin(coin(pad.x,pad.z),null,'gate',id),false);
 assert.equal(s.payCoin(coin(pad.x,pad.z),null,'gate',1),false,'no second gate');
 const b={kind:'blue',x:gate.x,z:gate.z+.2,y:0,vz:-6,dead:false};
 s.resources=[b];s._liveGateCount=1;s.multiply(b,gate,-1);
 assert.equal(s.queuedAdd.length,19,'max ×20 creates 19 extra real ore particles');
}
const s=make(),station=world.upgradeStation;s.player.x=station.x;s.player.z=station.z;
for(const name of ['speed','steering','blade']){
 s.selectUpgrade(name);
 for(let tier=0;tier<TRACK_COSTS[name].length;tier++){
  const due=trackRemaining(s.tracks[name],TRACK_COSTS[name]);
  for(let i=0;i<due;i++)assert.equal(s.payCoin(coin(station.x,station.z)),true);
  assert.equal(s.tracks[name].level,tier+1);
 }
 assert.equal(s.payCoin(coin(station.x,station.z)),false);
}
assert.equal(s.payCoin(coin(),'coin','vehicle'),false,'coin value dedicated elsewhere');
for(let tier=0;tier<TRACK_COSTS.coin.length;tier++){
 const due=trackRemaining(s.tracks.coin,TRACK_COSTS.coin),value=coinCredit(s.tracks);
 for(let i=0;i<Math.ceil(due/value);i++)
  assert.equal(s.payCoin(coin(),'coin','feature'),true);
 assert.ok(s.tracks.coin.level>=tier+1);
}
assert.equal(coinCredit(s.tracks),8);
assert.ok(vehicleSpeed(s.tracks)>5.55&&vehicleTurnRate(s.tracks)>7.5);
const draw=[];renderVehicle({add:(...args)=>draw.push(args)},{x:0,z:0,yaw:0,level:0,bladeLevel:4},0);
assert.ok(draw.find(xs=>xs[0]==='scoop')[4]>1.6);
const hit=lvl=>{const c=coin(2.45,-2.5);new GranularSolver().step([c],.016,{x:0,z:0,yaw:0,speed:5.5,level:0,bladeLevel:lvl},{x:0,z:.09});return c.z;};
assert.equal(hit(0),-2.5);assert.ok(hit(4)<-2.55);
console.log('v0.6 progression/v0.7 single gate, dedicated stations, vehicle tracks and controls PASS');
