import assert from 'node:assert/strict';
import {Simulation,MAX_RESOURCES} from '../src/physics.js';
import {World} from '../src/world.js';
import {ParticleActivity} from '../src/activity.js';
import {GranularSolver} from '../src/granular.js';
import {cargoCapacity,CARGO_CAPACITIES,CARGO_COSTS,CARGO_LAYOUTS,TRACK_COSTS,newProgress} from '../src/economy.js';
import {cargoSlotPose,vehicleVisualStyle} from '../src/vehicleRig.js';
import {renderVehicle} from '../src/vehicle.js';

const coin=(kind='gold',x=0,z=0,y=0,extra={})=>({
 kind,x,z,y,vx:0,vy:0,vz:0,dead:false,passedGates:0,cooldown:0,
 spin:0,angle:0,...extra
});
const make=(stage=0,progress={})=>{
 const s=new Simulation(stage,progress);
 s.resources=[];
 s.granular.step=()=>{};
 return s;
};
const tick=(s,w,n=1)=>{for(let i=0;i<n;i++)s.update(.044,0,0,w);};

assert.deepEqual(CARGO_CAPACITIES,[20,40,70,110,160]);
assert.deepEqual(CARGO_COSTS,[25,55,110,240]);
assert.deepEqual(TRACK_COSTS.cargo,CARGO_COSTS);
for(let level=0;level<5;level++){
 assert.equal(cargoCapacity({cargo:{level}}),CARGO_CAPACITIES[level]);
 const layout=CARGO_LAYOUTS[level];
 assert.equal(layout.columns*layout.rows*layout.layers>=layout.capacity,true);
 const positions=Array.from({length:layout.capacity},(_,slot)=>{
  const p=cargoSlotPose({x:0,z:0,yaw:0,level:0},slot,level);
  return [p.x,p.y,p.z].map(v=>v.toFixed(4)).join(',');
 });
 assert.equal(new Set(positions).size,layout.capacity,'every cargo slot has a unique 3D pose');
}
assert.equal(newProgress({}).tracks.cargo.level,0,'legacy saves receive the initial 20-slot box');
{
 const forward=cargoSlotPose({x:0,z:0,yaw:0,level:0},0,0);
 const reverse=cargoSlotPose({x:0,z:0,yaw:Math.PI,level:0},0,0);
 assert.ok(forward.z>0,'yaw 0 faces north and cargo sits behind the vehicle');
 assert.ok(reverse.z<0,'reversing vehicle heading mirrors the rear cargo pose');
 const visual=vehicleVisualStyle({level:0,cargoLevel:4});
 assert.equal(visual.cargo,4);
 assert.equal(visual.cargoLayout.capacity,160);
 const draw=level=>{
  const calls=[];
  renderVehicle({add:(...args)=>calls.push(args)},
   {x:0,z:0,yaw:0,level:0,cargoLevel:level},0);
  return calls;
 };
 const small=draw(0).find(a=>a[0]==='box'&&a[1]===0&&a[2]===.66&&a[3]===3.45);
 const large=draw(4).find(a=>a[0]==='box'&&a[1]===0&&a[2]===.66&&a[3]===3.45);
 assert.ok(small&&large);
 assert.ok(large[4]>small[4]&&large[6]>small[6],
  'visible open cargo box grows with capacity tier');
}
{
 const activity=new ParticleActivity(8);
 const free=coin('gold',0,0,0,{vx:1});
 const stored=coin('gold',.2,0,0,{cargoState:'stored',cargoSlot:0});
 const loading=coin('gold',.4,0,0,{cargoState:'loading',cargoSlot:1});
 const active=activity.select([free,stored,loading],{x:0,z:0});
 assert.ok(active.includes(0));
 assert.ok(!active.includes(1)&&!active.includes(2),
  'cargo and transfer entities do not enter free rigid-body scheduling');
 assert.equal(activity.attached,2);
 assert.equal(activity.sleeping,0);
 const solver=new GranularSolver();
 const before=[stored.x,stored.y,stored.z];
 solver.step([stored],.044,{x:0,z:0,yaw:0,speed:0,level:0,bladeLevel:0});
 assert.deepEqual([stored.x,stored.y,stored.z],before,
  'cargo coins are not displaced by the granular solver');
}
{
 const w=new World(0),s=make(),p=s.player;
 const c=coin('gold',p.x+1,p.z,0);
 s.resources=[c];
 s.update(.044,0,0,w);
 assert.equal(c.dead,false);
 assert.equal(c.cargoState,'loading');
 assert.equal(s.cargoCount(),1,'loading reserves a real cargo slot immediately');
 assert.ok(Number.isSafeInteger(c.id),'each collected resource receives a stable id');
 const id=c.id,slot=c.cargoSlot;
 tick(s,w,12);
 assert.equal(c.cargoState,'stored');
 assert.equal(c.id,id);
 assert.equal(c.cargoSlot,slot);
 assert.equal(s.cargoCount(),1);
 const pose=cargoSlotPose(s.player,slot,s.tracks.cargo.level);
 assert.ok(Math.hypot(c.x-pose.x,c.y-pose.y,c.z-pose.z)<1e-8,
  'completed loading leaves the coin in its actual cargo slot');
 const before={x:c.x,z:c.z};
 s.update(.044,0,1,w);
 assert.ok(c.z>before.z,'stored coin follows the moving truck');
 const after=cargoSlotPose(s.player,slot,s.tracks.cargo.level);
 assert.ok(Math.hypot(c.x-after.x,c.z-after.z)<1e-8);
 assert.deepEqual(s.serializeCargo(),[{id,kind:'gold',slot}]);
}
{
 // The 20th slot is real capacity; a 21st coin stays on the ground.
 const w=new World(0),s=make();
 s.resources=Array.from({length:20},(_,slot)=>coin('gold',0,0,.82,{
  id:1000+slot,cargoState:'stored',cargoSlot:slot
 }));
 const extra=coin('gold',s.player.x+1,s.player.z);
 s.resources.push(extra);
 s.update(.044,0,0,w);
 assert.equal(s.cargoCount(),20);
 assert.equal(s.cargoCapacity(),20);
 assert.equal(extra.cargoState,undefined);
 assert.equal(s.countLiving(),21,'all cargo and loose coins count against the 6500 cap');
 assert.equal(s.hasCapacity(MAX_RESOURCES-21),true);
}
{
 // A vehicle arriving at a station triggers an outbound animation, not an
 // instant deletion. The payment is committed only after the animation lands.
 const w=new World(0),s=make(),station=w.upgradeStation;
 s.selectUpgrade('cargo');
 s.tracks.cargo.deposited=CARGO_COSTS[0]-1;
 s.player.x=station.x;s.player.z=station.z;
 const c=coin('gold',0,0,.82,{id:9001,cargoState:'stored',cargoSlot:0});
 s.resources=[c];
 s.update(.044,0,0,w);
 assert.equal(c.cargoState,'unloading');
 assert.equal(c.dead,false);
 assert.equal(s.tracks.cargo.level,0,'no payment before the coin reaches the pad');
 tick(s,w,14);
 assert.equal(c.dead,true);
 assert.equal(s.tracks.cargo.level,1);
 assert.equal(s.player.cargoLevel,1);
 assert.equal(s.cargoCapacity(),40);
 assert.equal(s.cargoCount(),0);
 assert.equal(s.telemetry.totals.goldPaid,1);
}
{
 // Four coins can fly out concurrently. If the first coin completes the last
 // credit and MAX is reached, all remaining in-flight coins return to cargo.
 const w=new World(0),s=make();
 s.selectUpgrade('cargo');
 s.tracks.cargo.level=3;s.tracks.cargo.deposited=CARGO_COSTS[3]-1;
 s.player.cargoLevel=3;s.player.x=w.upgradeStation.x;s.player.z=w.upgradeStation.z;
 const items=Array.from({length:5},(_,slot)=>coin('gold',0,0,.82,{
  id:12000+slot,cargoState:'stored',cargoSlot:slot
 }));
 s.resources=items;
 s.update(.044,0,0,w);
 assert.equal(s.cargoTransfers.length,4);
 assert.ok(items.slice(0,4).every(r=>r.cargoState==='unloading'));
 tick(s,w,14);
 assert.equal(s.tracks.cargo.level,4);
 assert.equal(items.filter(r=>r.dead).length,1);
 assert.equal(s.cargoCount(),4,'the remaining four coins are not destroyed or duplicated');
 tick(s,w,10);
 assert.equal(s.cargoTransfers.length,0);
 assert.ok(items.filter(r=>!r.dead).every(r=>r.cargoState==='stored'),
  'failed payment animations return to stable cargo slots');
 assert.equal(s.cargoCount(),4);
 assert.equal(new Set(s.serializeCargo().map(r=>r.id)).size,4);
}
{
 // A refresh during an outbound transfer must restore the same coin as
 // stored cargo, not as an already-paid coin and not as a duplicate.
 const w=new World(0),s=make();
 s.selectUpgrade('cargo');s.player.x=w.upgradeStation.x;s.player.z=w.upgradeStation.z;
 const c=coin('gold',0,0,.82,{id:15001,cargoState:'stored',cargoSlot:0});
 s.resources=[c];
 s.update(.044,0,0,w);
 assert.equal(c.cargoState,'unloading');
 const saved=s.serializeCargo();
 assert.deepEqual(saved,[{id:15001,kind:'gold',slot:0}]);
 const reloaded=new Simulation(0,{stage:0,cargoByStage:{0:saved}});
 assert.equal(reloaded.cargoCount(),1);
 assert.equal(reloaded.cargoTransfers.length,0);
 assert.equal(reloaded.resources.find(r=>r.id===15001).cargoState,'stored');
 assert.equal(reloaded.serializeCargo()[0].id,15001);
}
{
 // Currency storage is isolated by stage: gold remains in the first map and
 // ingots remain in the snow map. The same physical cargo flow works for ingots.
 const saved={stage:1,tracks:{cargo:{level:0,deposited:22}},cargoByStage:{
  0:[{id:16001,kind:'gold',slot:0}],
  1:[{id:16002,kind:'ingot',slot:0}]
 }};
 const stage0=new Simulation(0,saved),stage1=new Simulation(1,saved);
 assert.equal(stage0.cargoCount(),1);
 assert.equal(stage0.serializeCargo()[0].kind,'gold');
 assert.equal(stage1.cargoCount(),1);
 assert.equal(stage1.serializeCargo()[0].kind,'ingot');
 assert.equal(stage1.resources.some(r=>r.id===16001),false);
 const w=new World(1),station=w.upgradeStation;
 stage1.selectUpgrade('cargo');stage1.player.x=station.x;stage1.player.z=station.z;
 stage1.granular.step=()=>{};
 tick(stage1,w,14);
 assert.equal(stage1.tracks.cargo.level,1,'one ingot contributes three credits in stage two');
 assert.equal(stage1.cargoCount(),0);
}
{
 // Stable IDs survive the source body and every child created by a multiplier
 // or crusher. No cloned resource inherits its parent's ID.
 const w=new World(0),s=make();
 const ore=coin('blue',0,0);
 s.resources=[ore];
 assert.equal(s.multiply(ore,w.gates[0],1),true);
 s.resources.push(...s.queuedAdd);s.queuedAdd.length=0;
 assert.equal(new Set(s.resources.map(r=>r.id)).size,s.resources.length);
 const crusher=make(),raw=coin('blue',w.crusher.x,w.crusher.z);
 crusher.resources=[raw];
 assert.equal(crusher.crush(raw,w.crusher),true);
 crusher.resources.push(...crusher.queuedAdd);crusher.queuedAdd.length=0;
 assert.equal(new Set(crusher.resources.map(r=>r.id)).size,crusher.resources.length);
}
{
 const s=make(),w=new World(0);
 s.resources=Array.from({length:MAX_RESOURCES-1},(_,i)=>coin('blue',25,25,0,{id:20000+i}));
 const c=coin('gold',0,0,.82,{id:30000,cargoState:'stored',cargoSlot:0});
 s.resources.push(c);
 assert.equal(s.countLiving(),MAX_RESOURCES);
 assert.equal(s.hasCapacity(1),false,'stored cargo consumes real world entity capacity');
}
console.log('v0.7.2: physical cargo capacity, stable IDs, loading/unloading transactions, rollback, persistence, per-stage currency and scheduling PASS');
