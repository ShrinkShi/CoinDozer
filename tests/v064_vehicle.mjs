import assert from 'node:assert/strict';
import {Simulation} from '../src/physics.js';
import {World} from '../src/world.js';
import {renderVehicle} from '../src/vehicle.js';
import {TRACK_LINKS,TRACK_LENGTH,trackLinkPose,advanceTrackOdometer,vehicleVisualStyle} from '../src/vehicleRig.js';
import {cameraFraming,ZOOM_MIN,ZOOM_MAX} from '../src/cameraZoom.js';

const finite=o=>Object.values(o).every(v=>Number.isFinite(v));
for(const i of [-100,-1,0,.25,1,2,TRACK_LINKS-1,100]){
 const pose=trackLinkPose(-7.46,i);
 assert.ok(finite(pose),'shoe pose must stay finite');
 assert.ok(Math.abs(pose.y)<=.4300001,'belt link must lie on its belt outline');
 assert.ok(Math.abs(pose.z)<=1.465,'belt front/back envelope is bounded');
}
const seamA=trackLinkPose(0,0),seamB=trackLinkPose(TRACK_LENGTH,0);
assert.ok(Math.hypot(seamA.y-seamB.y,seamA.z-seamB.z)<1e-7,'loop is periodic');
assert.notDeepEqual(trackLinkPose(0,0),trackLinkPose(.3,0),'links advance along the belt');
{
 const player={x:0,z:0,yaw:0,level:0},before={x:0,z:0,yaw:0};
 advanceTrackOdometer(player,before);
 assert.equal(player.trackLeft,0);assert.equal(player.trackRight,0);
 player.z=-1;
 let travel=advanceTrackOdometer(player,before);
 assert.ok(travel.left>.99&&travel.right>.99);
 assert.equal(player.trackLeft,player.trackRight,'straight motion drives both belts together');
 const pose={x:player.x,z:player.z,yaw:player.yaw};
 player.yaw=.5;
 travel=advanceTrackOdometer(player,pose);
 assert.ok(travel.left>0&&travel.right<0,'turning in place gives counter-rotating tracks');
 assert.ok(player.trackLeft>player.trackRight);
 assert.equal(player.travelDistance,1,'steering itself adds no forward travel');
}
{
 const w=new World(0),s=new Simulation(0);
 s.resources=[];s.granular.step=()=>{};s.granular.lastPairs=0;
 s.player.x=0;s.player.z=-45;s.player.yaw=0; // stable north/south heading on long map
 let initialLeft=s.player.trackLeft,initialRight=s.player.trackRight;
 s.update(.016,0,0,w);
 assert.equal(s.player.trackLeft,initialLeft,'stationary tracks remain still');
 assert.equal(s.player.trackRight,initialRight);
 for(let n=0;n<12;n++)s.update(.016,0,-1,w);
 assert.ok(s.player.trackLeft>initialLeft,'moving vehicle advances belt');
 assert.ok(s.player.trackRight>initialRight);
 const prevDifference=s.player.trackLeft-s.player.trackRight;
 for(let n=0;n<10;n++)s.update(.016,1,0,w);
 assert.ok(Math.abs((s.player.trackLeft-s.player.trackRight)-prevDifference)>.01,
  'actual turn changes differential belt travel');
}
const base={x:0,z:0,yaw:0,level:0,bladeLevel:0,
 speedLevel:0,steeringLevel:0,coinLevel:0,trackLeft:0,trackRight:0};
const render=p=>{const draw=[];renderVehicle({add:(...args)=>draw.push(args)},p,1);
 return draw;};
const defaultParts=render(base);
const baseShoes=defaultParts.filter(p=>p[0]==='box'&&Math.abs(p[4]-.84)<.001
 &&Math.abs(p[5]-.12)<.001&&Math.abs(p[6]-.19)<.001);
assert.equal(baseShoes.length,TRACK_LINKS*2,'every track link is independently drawn');
const moved=render({...base,trackLeft:.9,trackRight:-.7});
const movedShoes=moved.filter(p=>p[0]==='box'&&Math.abs(p[4]-.84)<.001
 &&Math.abs(p[5]-.12)<.001&&Math.abs(p[6]-.19)<.001);
assert.equal(movedShoes.length,baseShoes.length);
assert.notDeepEqual(movedShoes.map(x=>x.slice(1,4)),baseShoes.map(x=>x.slice(1,4)),
 'moving track positions change without changing part count');
for(const field of ['speedLevel','steeringLevel','coinLevel','bladeLevel','level']){
 const newer=render({...base,[field]:2});
 assert.ok(newer.length>defaultParts.length,`${field}: every upgrade route adds visible geometry`);
}
for(let level=0;level<=4;level++){
 const visual=vehicleVisualStyle({...base,level,bladeLevel:level,speedLevel:level,
  steeringLevel:level,coinLevel:level});
 assert.equal(visual.level,level);
 assert.ok(visual.scale>=1&&visual.bladeScale>=1);
 const draw=render({...base,level,bladeLevel:level,
  speedLevel:level,steeringLevel:level,coinLevel:level});
 assert.ok(draw.every(a=>Number.isFinite(a[1])&&Number.isFinite(a[2])&&Number.isFinite(a[3])));
}
const idle=render({...base,upgradeFlashAt:-50});
const upgraded=render({...base,upgradeFlashAt:.3});
assert.ok(upgraded.length>idle.length,'upgrade effect adds temporary vehicle glints');
for(const aspect of [390/844,412/915,960/700,1280/720]){
 const far=cameraFraming(aspect,1,'follow',0),close=cameraFraming(aspect,1,'close',0);
 assert.ok(close.vertical<far.vertical,'close-up is tighter for all aspect ratios');
 assert.ok(cameraFraming(aspect,1,'close',1).vertical<close.vertical,'upgrade moment tightens view');
 assert.ok(cameraFraming(aspect,0,'follow').vertical>=cameraFraming(aspect,ZOOM_MIN,'follow').vertical);
 assert.ok(cameraFraming(aspect,99,'follow').vertical<=cameraFraming(aspect,ZOOM_MAX,'follow').vertical);
}
console.log('v0.6.4: articulated tracks, differential odometer, five upgrade silhouettes and camera framing PASS');
