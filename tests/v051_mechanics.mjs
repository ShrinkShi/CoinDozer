import assert from 'node:assert/strict';
import {Simulation,MAX_RESOURCES} from '../src/physics.js';
import {World} from '../src/world.js';
import {flashIntensity,FLASH_RISE,FLASH_FADE} from '../src/flash.js';
import {UPGRADE_COSTS} from '../src/economy.js';
import {renderResources} from '../src/vehicle.js';
const w=new World(0),p=(kind,x,z)=>({kind,x,z,y:0,vx:0,vy:0,vz:0,dead:false,passedGates:0,cooldown:0,spin:0,angle:0});
for(const g of w.gates)for(const d of [-1,1]){
 const sim=new Simulation(0),r=p('blue',g.x,g.z-d*.35);
 sim.resources=[r];r.vz=d*8;sim.granular.step=()=>{r.z=g.z+d*.12;};
 sim.update(.03,0,0,w);
 assert.equal(sim.resources.length,g.multiplier);
 assert.equal(sim.resources.filter(q=>q!==r&&q.flashStartedAt===sim.elapsed).length,g.multiplier-1);
 assert.ok(sim.resources.every(q=>!q.weight));
}
{
 const g=w.gates[0],sim=new Simulation(0),r=p('blue',g.x,g.z+.45);
 sim.resources=[r];sim.granular.step=()=>{r.z=g.z-.15;};sim.update(.032,0,0,w);
 assert.equal(sim.resources.length,2);
 sim.granular.step=()=>{r.z=r.z<g.z?g.z+.08:g.z-.08;};
 for(let i=0;i<20;i++)sim.update(.025,0,0,w);
 assert.equal(sim.resources.length,2);
 sim.granular.step=()=>{r.z=g.z-1.1;};
 for(let i=0;i<20;i++)sim.update(.025,0,0,w);
 const n=sim.resources.length;
 sim.granular.step=()=>{r.z=g.z+.2;};sim.update(.032,0,0,w);
 assert.equal(sim.resources.length,n+1);
}
{
 const sim=new Simulation(0),r=p('blue',w.crusher.x,w.crusher.z);
 sim.resources=[r];sim.granular.step=()=>{};sim.update(.016,0,0,w);
 assert.equal(sim.resources.filter(q=>q.kind==='gold').length,3);
}
{
 const sim=new Simulation(0),r=p('blue',w.crusher.x,w.crusher.z);
 sim.resources=[r,...Array.from({length:MAX_RESOURCES-2},()=>p('gold',-25,25))];
 sim.granular.step=()=>{};sim.update(.016,0,0,w);
 assert.equal(r.kind,'blue');
}
assert.deepEqual(UPGRADE_COSTS,[30,90,240,600]);
const old=new Simulation(0,{level:0,deposited:149,totalDeposited:149});
assert.equal(old.level,2);assert.equal(old.deposit,29);
assert.equal(flashIntensity(0),0);assert.ok(flashIntensity(FLASH_RISE)>.99);
assert.ok(flashIntensity(FLASH_RISE+.4)<flashIntensity(FLASH_RISE+.1));
assert.equal(flashIntensity(FLASH_RISE+FLASH_FADE),0);
const draws=[];
renderResources({add:(...a)=>draws.push(a)},[Object.assign(p('gold',1,1),{flashStartedAt:2}),Object.assign(p('blue',2,1),{flashStartedAt:2})],2+FLASH_RISE,{x:0,z:0});
assert.ok(draws.some(c=>c[0]==='coin'&&c[7][3]>7.2));
assert.ok(draws.some(c=>c[0]==='sphere'&&c[7][3]>9.2));
console.log('v0.5.1/v0.7: bidirectional ore-only gate, rearm, 1→3, prices and flash PASS');
