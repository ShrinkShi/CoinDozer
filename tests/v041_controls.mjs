/** v0.4.1 direction/visual/physics regression. Run: node tests/v041_controls.mjs */
import assert from 'node:assert/strict';
import {Simulation} from '../src/physics.js';
import {World} from '../src/world.js';
import {GranularSolver} from '../src/granular.js';
import {headingBasis,modelYaw,screenStickToWorld} from '../src/heading.js';
import {renderVehicle,renderTreads} from '../src/vehicle.js';
const world=new World(0);
for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
 const b=headingBasis(yaw),calls=[];
 renderVehicle({add:(...args)=>calls.push(args)},{x:2,z:-3,yaw,level:0},0);
 const lip=calls.find(a=>a[0]==='box'&&Math.abs(a[4]-4.02)<.001&&Math.abs(a[5]-.075)<.001);
 assert.ok(lip);assert.ok((lip[1]-2)*b.fx+(lip[3]+3)*b.fz>2.75,'rendered blade faces opposite to motion');
 const scoop=calls.find(a=>a[0]==='scoop');
 assert.ok(Math.abs(scoop[8]-modelYaw(yaw))<1e-8);
 assert.ok((-Math.sin(scoop[8]))*b.fx+(-Math.cos(scoop[8]))*b.fz>.999);
 const c={kind:'gold',x:b.fx*2.55,z:b.fz*2.55,y:0,vx:0,vy:0,vz:0,dead:false,tiltX:0,tiltZ:0,angle:0};
 new GranularSolver().step([c],1/60,{x:0,z:0,yaw,speed:5.5,level:0},{x:-b.fx*.1,z:-b.fz*.1});
 assert.ok((c.x-b.fx*2.55)*b.fx+(c.z-b.fz*2.55)*b.fz>.01,'scoop force is not forward');
 const trails=[];renderTreads({add:(...args)=>trails.push(args)},[{x:0,z:0,a:yaw}],0);
 assert.ok(Math.abs(trails[0][8]-modelYaw(yaw)-.15)<.001);
}
for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){
 const v=screenStickToWorld(dx,dy),sim=new Simulation(0);sim.resources=[];
 sim.player={x:0,z:10,yaw:0,speed:0,level:0};
 let progress=0;
 for(let i=0;i<70;i++){
  const a={x:sim.player.x,z:sim.player.z};
  sim.update(1/60,v.x,v.z,world);
  const step=(sim.player.x-a.x)*v.x+(sim.player.z-a.z)*v.z;
  assert.ok(step>=-1e-7,'joystick drove against requested direction');
  progress+=step;
 }
 assert.ok(progress>.35,'did not drive in requested direction');
}
console.log('v0.4.1 control/heading regression passed');
