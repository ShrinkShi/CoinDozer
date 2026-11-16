import assert from 'node:assert/strict';
import {World} from '../src/world.js';
import {Simulation,MAX_RESOURCES} from '../src/physics.js';
import {GranularSolver} from '../src/granular.js';
import {createNpc,updateNpc,planNpcRoute,NPC_STATE_LABELS} from '../src/npc.js';
import {constrainToTerrain} from '../src/terrain.js';
import {LONG_MAP} from '../src/mapLayout.js';

const ore=(id,x,z)=>({id,kind:'blue',x,z,y:0,vx:0,vy:0,vz:0,
 dead:false,passedGates:0,cooldown:0,angle:0,spin:0});
const near=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

{
 const world=new World(0);
 const route=planNpcRoute(world,{x:0,z:-20},{x:0,z:0});
 assert.ok(route.length>0,'NPC must find a path between the river banks');
 let previous={x:0,z:-20};
 for(const point of route){
  assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.z));
  const dx=point.x-previous.x,dz=point.z-previous.z,steps=Math.ceil(Math.hypot(dx,dz)/.4);
  for(let i=0;i<=steps;i++){
   const p={x:previous.x+dx*i/steps,z:previous.z+dz*i/steps};
   for(const r of world.terrain.rivers){
    if(p.z>=r.zMin-1.05&&p.z<=r.zMax+1.05)
     assert.ok(Math.abs(p.x-r.x)<=r.width/2-1.05-.08+1e-5,
      'route must cross the ice only inside the actual bridge corridor');
   }
  }
  previous=point;
 }
}
{
 const world=new World(0);
 const route=planNpcRoute(world,{x:0,z:8},{x:13,z:8});
 assert.ok(route.length>0,'NPC must route around the grinder support');
 for(const p of route)for(const o of world.obstacles){
  if((o.height??1)<.8)continue;
  const reach=1.05+o.radius+.12;
  if(o.type==='circle')assert.ok(Math.hypot(p.x-o.x,p.z-o.z)>=reach-.05,
   'smoothed route must keep vehicle clearance from static obstacles');
 }
}
{
 const world=new World(0),actor={x:0,z:-40};
 const route=planNpcRoute(world,{x:-8,z:-40},{x:8,z:-40},[actor]);
 assert.ok(route.length>0);
 assert.ok(route.some(p=>Math.abs(p.z+40)>1.5),
  'NPC route should detour around the player instead of driving through them');
}
{
 const world=new World(0),npc=createNpc();
 assert.equal(npc.enabled,false);
 assert.equal(NPC_STATE_LABELS.idle,'待机：等待矿石');
 const sim=new Simulation(0);
 sim.resources=[ore(100,0,-39)];
 const before={x:sim.npc.x,z:sim.npc.z};
 sim.update(.044,0,0,world);
 assert.equal(sim.npc.enabled,false);
 assert.deepEqual({x:sim.npc.x,z:sim.npc.z},before,
  'prototype is opt-in and does not change normal gameplay');
}
{
 // A parked vehicle remains a solid chassis. Previously the scoop/chassis
 // shell stopped colliding entirely when the engine was not driving forward.
 const world=new World(0),solver=new GranularSolver();
 const vehicle={x:0,z:0,yaw:Math.PI,speed:0,level:0,bladeLevel:0};
 const r=ore(1,0,1.2);
 solver.step([r],.044,vehicle,{x:0,z:0,yaw:Math.PI},world);
 assert.ok(r.z>1.2,'stationary chassis pushes a low particle out of its body');
}
{
 // One actual NPC, one original ore, no belt assistance. The same physical
 // bucket pushes the resource through the multiplier, over the bridge and
 // into the existing crusher. The player remains on the far side.
 const world=new World(0),sim=new Simulation(0);
 sim.resources=[ore(500,0,-39)];
 sim.player.x=28;sim.player.z=-47;
 sim.npc.enabled=true;
 let crossedGate=false,crossedBridge=false,crushed=false;
 for(let frame=0;frame<1800;frame++){
  sim.update(.044,0,0,world);
  crossedGate ||= sim.gateHits>0;
  crossedBridge ||= sim.resources.find(r=>r.id===500)?.z> -2;
  crushed ||= sim.crushed>0;
  if(crushed)break;
 }
 assert.ok(crossedGate,'NPC must deliver ore through the real multiplier');
 assert.ok(crossedBridge,'NPC and target must cross the real bridge');
 assert.ok(crushed,'NPC must push real ore into the crusher');
 // The AI observes the crusher's ore→gold state transition on the next tick.
 sim.update(.044,0,0,world);
 assert.ok(sim.npc.completed>=1,'NPC records one completed physical delivery');
 assert.ok(sim.telemetry.totals.goldProduced>=3,'only the crusher creates physical coins');
 assert.ok(sim.resources.every(r=>r.dead||
  Number.isFinite(r.x)&&Number.isFinite(r.z)&&r.x>=LONG_MAP.bounds.minX&&r.x<=LONG_MAP.bounds.maxX),
  'NPC must preserve valid resource coordinates');
 assert.ok(sim.countLiving()<=MAX_RESOURCES);
 assert.ok(sim.npc.recoveries<8,'single test route must not spin in repeated recovery');
 console.log('v0.7.4 single NPC natural drive: search → route → push → gate → bridge → crusher PASS');
}
{
 const world=new World(0),npc=createNpc(),r=ore(9,0,-39);
 npc.enabled=true;npc.x=0;npc.z=-43.5;npc.yaw=Math.PI;npc.speed=3;
 npc.lastX=npc.x;npc.lastZ=npc.z;
 let command=null;
 for(let i=0;i<48;i++)command=updateNpc(npc,[r],world,.044,i*.044,{x:25,z:-45});
 assert.equal(npc.state,'recover','blocked prototype must enter explicit recovery');
 assert.equal(command.reverse,true,'recovery uses reverse motion rather than teleporting');
 assert.ok(command.speed>0);
}
console.log('v0.7.4: route planning, bridge-only crossing, player avoidance, parked collision, opt-in autonomy and recovery PASS');
