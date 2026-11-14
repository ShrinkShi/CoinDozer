/** v0.6.2 deterministic conversion and solid-world collision regressions. */
import assert from 'node:assert/strict';
import {Simulation,MAX_RESOURCES} from '../src/physics.js';
import {World} from '../src/world.js';
import {StaticCollisionField} from '../src/collisions.js';
const world=new World(0);
const ore=(x=world.crusher.x,z=world.crusher.z)=>({
 kind:'blue',x,z,y:0,vx:0,vy:0,vz:0,dead:false,passedGates:0,cooldown:0,spin:0,angle:0
});
{
 const sim=new Simulation(0);
 sim.resources=Array.from({length:100},()=>ore());
 sim.granular.step=()=>{}; // isolate conversion throughput from collision dynamics
 sim.update(.016,0,0,world);
 assert.equal(sim.crushed,100);
 assert.equal(sim.resources.length,300);
 assert.equal(sim.resources.filter(r=>r.kind==='gold'&&!r.dead).length,300);
 assert.equal(new Set(sim.resources).size,300,'every coin is a distinct object');
 assert.equal(sim.telemetry.totals.goldProduced,300);
 assert.equal(sim.telemetry.totals.oreCrushed,100);
 assert.equal(sim.events.filter(e=>e.type==='crush').length,100);
}
{
 // Capacity failures must leave the ore intact, not make 1 or 2 coins.
 const sim=new Simulation(0);
 const r=ore();
 sim.resources=[r,...Array.from({length:MAX_RESOURCES-2},()=>({
  ...ore(-23,24),kind:'gold'
 }))];
 sim.granular.step=()=>{};
 sim.update(.016,0,0,world);
 assert.equal(r.kind,'blue');
 assert.equal(sim.resources.length,MAX_RESOURCES-1);
 assert.equal(sim.crushed,0);
 assert.ok(sim.events.some(e=>e.type==='crusherFull'));
 // Once two slots have been freed and the cool-down has elapsed, it retries
 // atomically, producing all three coins without losing the original ore.
 sim.resources.splice(-2);
 sim.elapsed+=.8;
 r.x=world.crusher.x;r.z=world.crusher.z;
 sim.update(.016,0,0,world);
 assert.equal(r.kind,'gold');
 assert.equal(sim.crushed,1);
 assert.equal(sim.resources.length,MAX_RESOURCES-1);
 assert.equal(sim.telemetry.totals.goldProduced,3);
}
{
 const field=new StaticCollisionField([
  {type:'circle',x:0,z:0,radius:1,height:1},
  {type:'segment',x1:4,z1:-2,x2:4,z2:2,radius:.2,height:1},
 ]);
 const b={x:.3,z:.2,y:0,vx:-3,vz:0};
 assert.ok(field.resolve(b,.35)>0);
 assert.ok(Math.hypot(b.x,b.z)>=1.35-1e-6,'boulder does not allow rock penetration');
 assert.ok(Number.isFinite(b.vx)&&Number.isFinite(b.vz));
 const r={x:4.12,z:0,y:0,vx:-2,vz:1};
 assert.ok(field.resolve(r,.35)>0);
 assert.ok(Math.abs(r.x-4)>=.55-1e-6,'rail contact has a real capsule width');
 assert.equal(field.resolve({x:4.12,z:0,y:2,vx:0,vz:0},.35),0,'high objects can pass over short barriers');
}
{
 assert.ok(world.obstacles.length>80,'terrain rocks and guide rails have colliders');
 assert.equal(world.obstacles.filter(o=>o.type==='segment').length,2);
 const guide=world.obstacles.find(o=>o.type==='segment');
 const field=new StaticCollisionField(world.obstacles);
 const mid={x:(guide.x1+guide.x2)/2,z:(guide.z1+guide.z2)/2,y:0,vx:0,vz:0};
 assert.ok(field.resolve(mid,.285)>0,'the visible crusher guide is solid');
}
console.log('v0.6.2: 100 ore -> 300 real coins, atomic capacity retry, rock and guide collisions PASS');
