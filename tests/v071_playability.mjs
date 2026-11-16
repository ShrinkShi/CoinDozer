import assert from 'node:assert/strict';
import {World} from '../src/world.js';
import {Simulation,MAX_RESOURCES} from '../src/physics.js';
import {LONG_MAP} from '../src/mapLayout.js';
import {configureTerrain,constrainToTerrain} from '../src/terrain.js';
import {boxTrigger,sweptEntryTrigger,crossedGatePlane} from '../src/triggers.js';
import {StaticCollisionField} from '../src/collisions.js';
import {NAV_TARGETS,navigationGoal,navigationPath,worldToMap,drawNavigation} from '../src/navigation.js';

const w=new World(0);
const material=(kind,x=0,z=0,y=0)=>({kind,x,z,y,vx:0,vz:0,vy:0,
 cooldown:0,spin:0,angle:0,dead:false,passedGates:0});
const point=(x,z)=>({x,z});
const south=w.terrain.rivers[0];
const north=w.terrain.rivers[1];
// Full-step crossing MUST detect skipped water. Position-only tests did not.
{
 const p=material('blue',22,9),contact=constrainToTerrain(p,point(22,-20),w.terrain,.3);
 assert.ok(contact>0,'fast southern shortcut must collide');
 assert.ok(p.z<=south.zMin-.3,'not teleported to the northern continent');
 const q=material('gold',-22,-20);
 assert.ok(constrainToTerrain(q,point(-22,9),w.terrain,.35)>0);
 assert.ok(q.z>=south.zMax+.35,'reverse-direction fast crossing also blocked');
 const safe=material('blue',0,9);
 assert.equal(constrainToTerrain(safe,point(0,-20),w.terrain,.3),0,
  'same large step is legal through the central bridge');
}
{
 const diagonal=material('blue',0,8);
 // The endpoint is on the bridge, but X at the river entrance is not.
 assert.ok(constrainToTerrain(diagonal,point(25,-22),w.terrain,.3)>0);
 assert.ok(diagonal.z<south.zMin,'diagonal fake bridge entry denied');
 const legitimate=material('blue',2,9);
 assert.equal(constrainToTerrain(legitimate,point(1,-20),w.terrain,.3),0);
}
{
 const p=material('blue',20,-8),old=point(0,-8);
 assert.ok(constrainToTerrain(p,old,w.terrain,.3)>0);
 assert.ok(Math.abs(p.x)<6,'lateral impulse stays within deck');
 const locked=material('blue',0,50);
 assert.ok(constrainToTerrain(locked,point(0,25),w.terrain,.3)>0);
 assert.ok(locked.z<north.zMin,'northern bridge cannot be skipped while locked');
 const backwards=material('blue',0,25);
 assert.ok(constrainToTerrain(backwards,point(0,50),w.terrain,.3)>0);
 assert.ok(backwards.z>north.zMax,'locked north bridge resists reverse crossing');
}
{
 const tracks={bridge:{level:4},exit:{level:1}};
 configureTerrain(w,tracks);
 assert.equal(w.bridges.main.width,26);
 assert.equal(w.bridges.next.width,10);
 const p=material('blue',10,8);
 assert.equal(constrainToTerrain(p,point(10,-20),w.terrain,.3),0,
  'widened deck increases real traversal width');
 const passage=material('blue',0,50);
 assert.equal(constrainToTerrain(passage,point(0,25),w.terrain,.3),0);
 configureTerrain(w,{bridge:{level:0},exit:{level:0}});
}
{
 const gate=w.gates[0],spread=gate.apertureHalf;
 const go={kind:'blue',x:spread+2,z:gate.z+1,_frameX:0,_frameZ:gate.z-1};
 assert.equal(crossedGatePlane(go,gate),1,
  'diagonal line crosses inside aperture though final endpoint is outside');
 const miss={kind:'blue',x:0,z:gate.z+1,_frameX:spread+11,_frameZ:gate.z-1};
 assert.equal(crossedGatePlane(miss,gate),0,
  'must not credit endpoint inside when actual plane crossing missed');
 assert.equal(crossedGatePlane({...go,z:gate.z-1,_frameZ:gate.z+1},gate),-1,
  'bidirectional diagonal crossing');
 const obstacle=new StaticCollisionField(w.obstacles);
 const post=material('blue',gate.x+gate.half-.2,gate.z);
 assert.ok(obstacle.resolve(post,.285)>0,'side pillar is actually solid');
 const grinderPost=material('blue',7.15,w.crusher.z);
 assert.ok(obstacle.resolve(grinderPost,.285)>0,'crusher side post is actually solid');
}
{
 const pad=boxTrigger(0,0,1.8,.8,.35);
 const cross={...material('gold',0,-2),_frameX:0,_frameZ:2,_frameY:0};
 assert.equal(sweptEntryTrigger(cross,pad),true,'thin payment pad cannot be skipped');
 assert.equal(sweptEntryTrigger({...cross,y:2,_frameY:2},pad),false,'flying high does not pay');
 assert.equal(sweptEntryTrigger({...cross,z:2,_frameZ:0},pad),false,
  'a coin already on the pad at step start never auto-pays');
 assert.equal(sweptEntryTrigger(material('gold',0,0),pad),false,
  'no payment from a pre-placed stationary coin');
 assert.equal(sweptEntryTrigger({...cross,x:4,_frameX:4},pad),false,
  'parallel offset movement cannot pay');
}
{
 // Real gameplay frame, not only a trigger helper: a coin passes all the way
 // across the northern crusher-upgrade pad while the truck is adjacent.
 const s=new Simulation(0),pad=w.featureStations.crusher;
 const coin=material('gold',pad.x,pad.z+3);
 s.resources=[coin];s.player.x=pad.x;s.player.z=pad.z;
 s.granular.step=()=>{coin.z=pad.z-3;};
 s.update(.016,0,0,w);
 assert.equal(coin.dead,false,'a loose coin cannot be paid directly at the pad');
 assert.equal(coin.cargoState,'loading','a nearby coin begins its visible cargo transfer');
 for(let tick=0;tick<30&&!coin.dead;tick++)s.update(.044,0,0,w);
 assert.equal(coin.dead,true,'cargo coin completes its outbound station animation');
 assert.equal(s.tracks.crusher.deposited,1);
 const s2=new Simulation(0),high=material('gold',pad.x,pad.z+3,2);
 s2.resources=[high];s2.player.x=pad.x;s2.player.z=pad.z;
 s2.granular.step=()=>{high.z=pad.z-3;};
 s2.update(.016,0,0,w);
 assert.equal(high.dead,false,'flying coin was never consumed');
 assert.equal(high.cargoState,undefined,'high coins do not enter the cargo box');
}
{
 // Full crusher must return the same ore to the true SOUTH intake, without
 // converting it or ejecting it through the solid left machine support.
 const s=new Simulation(0),ore=material('blue',0,w.crusher.z);
 s.elapsed=10;
 s.resources=[ore,...Array.from({length:MAX_RESOURCES-1},()=>material('gold',25,25))];
 assert.equal(s.crush(ore,w.crusher),false);
 assert.equal(ore.kind,'blue');
 assert.equal(s.queuedAdd.length,0);
 assert.ok(ore.z<w.crusher.z-w.crusher.halfDepth);
 assert.ok(Math.abs(ore.x)<w.crusher.halfWidth-0.5);
 assert.ok(ore.vz<0,'retry motion points away from crusher teeth toward bridge');
}
{
 const sim=new Simulation(0);
 assert.equal(navigationGoal(sim).id,'ore');
 sim.player.z=-38;assert.equal(navigationGoal(sim).id,'gate');
 sim.gateHits=1;assert.equal(navigationGoal(sim).id,'crusher');
 sim.crushed=1;assert.equal(navigationGoal(sim).id,'vehicle');
 sim.tracks.exit.level=1;assert.equal(navigationGoal(sim).id,'exit');
 const p=navigationPath(point(18,-31),NAV_TARGETS.find(t=>t.id==='crusher'),w.terrain);
 assert.ok(p.length>=4,'navigation must route through south and north bridge approaches');
 assert.equal(p[1].x,0);assert.equal(p[2].x,0);
 assert.ok(p[1].z<south.zMin&&p[2].z>south.zMax);
 const mapped=worldToMap(0,0,132,202);
 assert.ok(mapped.x>30&&mapped.x<100&&mapped.y>30&&mapped.y<170);
 // A canvas backing 2D context is optional on very old browsers; its drawing
 // is purely decorative and must not modify world economics or player state.
 const calls=[];const ctx={canvas:{width:132,height:202},clearRect(){},
  fillRect(){calls.push(1)},beginPath(){},arc(){},fill(){},moveTo(){},
  lineTo(){},stroke(){},setLineDash(){},closePath(){}};
 sim.tracks.exit.level=0;
 const result=drawNavigation(ctx,sim,w,'exit');
 assert.equal(result.target.id,'exitPad','no route through unpaid north bridge');
 assert.ok(calls.length>0);
 assert.equal(sim.resources.filter(r=>r.dead).length,0);
}
console.log('v0.7.1: swept two-bank river collision, diagonal gate aperture, thin payment pads, real posts, crusher retry and navigation PASS');
