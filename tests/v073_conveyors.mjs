import assert from 'node:assert/strict';
import {World} from '../src/world.js';
import {Simulation,MAX_RESOURCES} from '../src/physics.js';
import {ParticleActivity} from '../src/activity.js';
import {GranularSolver} from '../src/granular.js';
import {constrainToTerrain} from '../src/terrain.js';
import {CONVEYOR_SITES,activeConveyors,beltGeometry,beltContact,conveyorImpulse} from '../src/conveyors.js';
import {BELT_COSTS,BELT_LABELS,CONVEYOR_COUNT,newProgress} from '../src/economy.js';
import {LONG_MAP} from '../src/mapLayout.js';

const resource=(kind='blue',x=0,z=0,y=0)=>({kind,x,z,y,vx:0,vy:0,vz:0,
 dead:false,passedGates:0,cooldown:0,angle:0,spin:0});
const blank=(stage=0,progress={})=>{
 const sim=new Simulation(stage,progress);
 sim.resources=[];
 return sim;
};
const tick=(s,w,count)=>{for(let i=0;i<count;i++)s.update(.044,0,0,w);};

assert.equal(CONVEYOR_SITES.length,CONVEYOR_COUNT);
assert.equal(BELT_LABELS.length,CONVEYOR_COUNT);
assert.deepEqual(BELT_COSTS,[24,60,120,200]);
const world=new World(0),empty=new Simulation(0);
assert.equal(world.conveyorStations.length,5);
assert.equal(world.sites.beltCosts.length,5);
assert.equal(world.conveyors.length,0,'all five lines start unbuilt');
assert.equal(empty.beltTracks.length,5);
assert.ok(empty.beltTracks.every(t=>t.level===0));
assert.deepEqual(newProgress({}).belts,empty.beltTracks);
assert.equal(new World(1).conveyorStations.length,0);
const old=newProgress({tracks:{cargo:{level:2}},belts:[{level:3,deposited:2}]});
assert.equal(old.tracks.cargo.level,2);
assert.equal(old.belts[0].level,3);
assert.equal(old.belts[0].deposited,2);
assert.equal(old.belts[1].level,0);

for(const site of CONVEYOR_SITES){
 const lower=beltGeometry(site,1),upper=beltGeometry(site,4);
 assert.ok(lower&&upper);
 assert.ok(upper.width>lower.width);
 assert.ok(upper.speed>lower.speed);
 assert.ok(upper.max-upper.min>lower.max-lower.min);
 const contact=resource(site.kind,site.axis==='z'?site.x:(site.from+site.to)/2,
   site.axis==='x'?site.z:(site.from+site.to)/2);
 assert.equal(beltContact(contact,lower),true);
 const wrong=resource(site.kind==='gold'?'blue':'gold',contact.x,contact.z);
 assert.equal(beltContact(wrong,lower),false,'only the correct material is transported');
 assert.equal(beltContact({...contact,y:3},lower),false,'the belt cannot attract airborne items');
 assert.equal(beltContact({...contact,cargoState:'stored'},lower),false,
  'the belt cannot grab coins attached to the moving cargo box');
 const off=resource(site.kind,site.axis==='z'?site.x+lower.width:contact.x,
  site.axis==='x'?site.z+lower.width:contact.z);
 assert.equal(beltContact(off,lower),false,'belt does not affect off-deck material');
 const near=resource(site.kind,contact.x,contact.z);
 assert.equal(conveyorImpulse(near,[lower],.044),true);
 assert.ok(site.axis==='z'?near.vz>0:near.vx>0,'individual velocity increases');
 assert.deepEqual([near.x,near.z],[contact.x,contact.z],
  'an impulse cannot teleport or alter particle position');
 assert.equal(conveyorImpulse(wrong,[lower],.044),false);
}
{
 const narrow=beltGeometry(CONVEYOR_SITES[2],4,12);
 assert.ok(narrow.width<12,'bridge belt always fits on an unupgraded 12m bridge');
 const extended=beltGeometry(CONVEYOR_SITES[2],4,26);
 assert.ok(extended.width<=26,'upgraded bridge never lets a belt hang over the river');
 const off=resource('blue',12,LONG_MAP.river1.z);
 assert.equal(beltContact(off,extended),false,'belt cannot reach the ice outside the bridge');
 const crossing=resource('blue',12,3);
 const previous={x:12,z:-17};
 assert.ok(constrainToTerrain(crossing,previous,world.terrain,.3)>0,
  'normal swept ice collision remains binding even if a belt exists');
}
{
 const s=blank(),pad=world.conveyorStations[0];
 s.player.x=pad.x;s.player.z=pad.z;
 const c=resource('gold',pad.x,pad.z);
 c.cargoState='stored';c.cargoSlot=0;c.id=9001;c.y=.82;
 s.resources=[c];
 s.update(.044,0,0,world);
 assert.equal(c.dead,false);
 assert.equal(c.cargoState,'unloading','a real coin must fly out to a fixed belt build pad');
 assert.equal(s.beltTracks[0].level,0,'no build before the outbound animation arrives');
 tick(s,world,11);
 assert.equal(c.dead,true);
 assert.equal(s.beltTracks[0].deposited,1);
 assert.equal(s.totalDeposited,1);
 assert.equal(s.coinsSpent.belt,1);
 for(let k=1;k<BELT_COSTS[0];k++){
  const item=resource('gold');assert.equal(s.payCoin(item,null,'belt',0),true);
  assert.equal(item.dead,true);
 }
 assert.equal(s.beltTracks[0].level,1,'exact physical credits construct the first segment');
 s.update(.044,0,0,world);
 assert.equal(world.conveyors.length,1);
 assert.equal(world.conveyors[0].key,'intake');
 assert.equal(s.beltTracks[1].level,0,'building is independent for each station');
 assert.equal(s.payCoin(resource('blue'),null,'belt',1),false,'ore is not currency');
 assert.equal(s.payCoin(resource('gold'),null,'belt',5),false,'invented stations cannot charge');
 for(const [id,site] of CONVEYOR_SITES.entries()){
  assert.equal(site.id,id);
 }
}
{
 const cave=blank(1);
 assert.equal(cave.payCoin(resource('ingot'),null,'belt',0),false);
 const w=new World(1);tick(cave,w,1);
 assert.equal(w.conveyors.length,0,'second stage is unchanged');
}
// Built belts wake their own grains, even if the driver is on the opposite
// shore. This is required for unattended automation of real physics.
{
 const w=new World(0),s=blank(0,{belts:[{level:1}]});
 const r=resource('blue',0,-40);
 s.resources=[r];s.player.x=28;s.player.z=45;
 s.update(.044,0,0,w);
 assert.ok(r.z>-40,'granular substeps carry real ore with nobody nearby');
 const activity=new ParticleActivity();
 const active=activity.select([resource('blue',0,-40)],{x:28,z:45},w.conveyors);
 assert.deepEqual(active,[0],'sleeping ore on a conveyor is activated');
 const far=resource('blue',25,40);
 assert.equal(activity.select([far],{x:28,z:45},w.conveyors).includes(0),true,
  'normal player wake remains unaffected');
}
{
 const s=blank(0),w=new World(0),r=resource('blue',0,-40);
 s.resources=[r];s.player.x=28;s.player.z=45;
 s.update(.044,0,0,w);
 assert.equal(r.z,-40,'unbuilt decorative station gives no free transport');
}
{
 // Natural unattended transport: start ONE original ore on the south loading
 // line, leave all five purchased belts running and use the real granular
 // solver, two-way gate, frozen bridge and grinder without any teleport.
 const w=new World(0),s=blank(0,{
  belts:Array.from({length:5},()=>({level:3,deposited:0}))
 });
 const original=resource('blue',0,-43);
 s.resources=[original];
 s.player.x=30;s.player.z=-48;
 let gate=false,across=false,crushed=false;
 for(let frame=0;frame<850;frame++){
  s.update(.044,0,0,w);
  gate ||= s.gateHits>0;
  across ||= original.z>-2;
  crushed ||= s.crushed>0;
  if(crushed)break;
 }
 assert.ok(gate,'real ore crosses the active ×2 gate without driver interaction');
 assert.ok(across,'the physical original crosses the open main bridge');
 assert.ok(crushed,'the original or an actual gate clone reaches the grinder');
 assert.ok(s.telemetry.totals.goldProduced>=3,
  'crushing remains the sole source of new gold coins in stage zero');
 assert.ok(s.resources.some(r=>!r.dead&&r.kind==='gold'));
 assert.ok(s.resources.every(r=>r.dead||Number.isFinite(r.x)&&Number.isFinite(r.z)),
  'full conveyor network never creates invalid positions');
 assert.ok(new Set(s.resources.filter(r=>!r.dead).map(r=>r.id)).size===s.countLiving(),
  'all independently generated resources preserve unique IDs');
 console.log('v0.7.3 natural conveyor: ore crosses gate, physical bridge, crusher PASS');
}
{
 // Exact cap and no hidden passive coins. Transfer is velocity-only and has no
 // side effects on the resource array or financial account.
 const w=new World(0),s=blank(0,{belts:Array.from({length:5},()=>({level:1}))});
 const r=resource('blue',0,-40);
 s.resources=[r];s.player.x=30;s.player.z=50;
 tick(s,w,3);
 assert.equal(s.telemetry.totals.goldProduced,0);
 assert.equal(s.resources.filter(x=>x.kind==='gold').length,0);
 assert.equal(s.countLiving(),1);
 assert.equal(s.hasCapacity(MAX_RESOURCES-1),true);
 assert.equal(s.hasCapacity(MAX_RESOURCES),false);
}
console.log('v0.7.3: five paid conveyor stations, traction, isolation, bridge, migration, scheduling and conservation PASS');
