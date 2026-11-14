/**
 * v0.6.3: correctness under scale, scheduler wakeups, render instance accounting,
 * reusable GPU buffers and auto-quality hysteresis. These CPU diagnostics are
 * NOT Android FPS measurements and do not claim a sustained 20-minute run.
 */
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {ParticleActivity} from '../src/activity.js';
import {GranularSolver} from '../src/granular.js';
import {World} from '../src/world.js';
import {Renderer} from '../src/renderer.js';
import {renderResources} from '../src/vehicle.js';
import {compose,composeInto} from '../src/math.js';
import {AdaptiveQuality,QUALITY_LEVELS} from '../src/quality.js';

for(let i=0;i<50;i++){
 const args=[1+i*.1,2,3,.5+i*.01,.7,.9,i*.1,i*.04,-i*.03];
 const expected=compose(...args),data=new Float32Array(26);
 composeInto(data,3,...args);
 for(let k=0;k<16;k++)
  assert.ok(Math.abs(data[k+3]-expected[k])<1e-5,'typed transform matches original matrix');
}
{
 const q=new AdaptiveQuality(false);
 assert.equal(q.mode,'high');
 for(let i=0;i<6;i++)q.sample(20,.65);
 assert.equal(q.mode,'balanced','slow frames lower quality after several seconds');
 q.sample(60,2);assert.equal(q.mode,'balanced','cooldown prevents instant oscillation');
 for(let i=0;i<40;i++)q.sample(60,.65);
 assert.equal(q.mode,'high','sustained good frames restore detail');
 const mobile=new AdaptiveQuality(true);
 assert.equal(mobile.mode,'balanced');
 for(let i=0;i<10;i++)mobile.sample(20,.65);
 assert.equal(mobile.mode,'low');
 for(let i=0;i<42;i++)mobile.sample(60,.65);
 assert.equal(mobile.mode,'balanced','mobile automatic upper tier remains balanced');
 assert.ok(QUALITY_LEVELS.high.dpr>QUALITY_LEVELS.low.dpr);
}
{
 // A moving object distant from the shovel wakes a settled physical neighbour.
 const activity=new ParticleActivity();
 const objects=[
  {x:25,z:25,y:0,vx:2,vz:0,vy:0},
  {x:25.5,z:25,y:0,vx:0,vz:0,vy:0},
  {x:-25,z:-25,y:0,vx:0,vz:0,vy:0}
 ];
 const active=activity.select(objects,{x:0,z:0});
 assert.ok(active.includes(0)&&active.includes(1));
 assert.ok(!active.includes(2),'resting far bodies should sleep');
 assert.equal(objects.length,3);
 const newlyAwake=activity.select(objects,{x:-25,z:-25});
 assert.ok(newlyAwake.includes(2),'moving the shovel wakes the same existing body');
}
{
 // No fake resource aggregation: 6,500 individual visible draw submissions,
 // with distant simplified meshes still being one instance per original coin.
 const coins=Array.from({length:6500},(_,i)=>({
  kind:'gold',x:i%2?25:0,z:i%2?20:0,y:0,dead:false,
  vx:0,vy:0,vz:0,angle:0,tiltX:0,tiltZ:0,spin:0
 }));
 const draws=[];
 const renderer={quality:QUALITY_LEVELS.balanced,visible:()=>true,
  add:(...args)=>draws.push(args)};
 const shown=renderResources(renderer,coins,0,{x:0,z:0});
 assert.equal(shown,6500);
 assert.equal(draws.filter(d=>d[0]==='coin'||d[0]==='coinLite').length,6500);
 assert.equal(draws.filter(d=>d[0]==='coinLite').length,3250);
 const cropped=renderResources({...renderer,visible:(x)=>x===0,add:()=>{}},coins,0,{x:0,z:0});
 assert.equal(cropped,3250,'visibility culling excludes draws, not objects');
 assert.equal(coins.length,6500);
}
// Exercise GPU allocation reuse with a fake GL device (no hardware FPS claim).
{
 let allocs=0,uploads=0,draws=0;
 const gl={ARRAY_BUFFER:1,ELEMENT_ARRAY_BUFFER:2,FLOAT:3,TRIANGLES:4,UNSIGNED_SHORT:5,
  DYNAMIC_DRAW:6,bindBuffer(){},enableVertexAttribArray(){},vertexAttribPointer(){},
  bufferData(){allocs++},bufferSubData(_,offset,bytes){assert.equal(offset,0);assert.ok(bytes.length>0);uploads++;}};
 const r=Object.create(Renderer.prototype);
 r.gl=gl;r.camera={x:0,z:0};
 r.batch=new Map([['coin',{data:new Float32Array(40),count:0}]]);
 r.meshes={coin:{v:1,n:2,inst:3,i:4,instCapacity:0,count:6}};
 r.a={pos:0,nor:1,m:[2,3,4,5],tint:6};
 r.instanced={divisor(){},draw(){draws++}};
 r.drawCalls=0;r.drawnInstances=0;r.uploadedBytes=0;
 for(let pass=0;pass<3;pass++){
  r.batch.get('coin').count=0;
  for(let i=0;i<1000;i++)r.add('coin',i%10,0,0,.7,.7,.7,[1,.73,.02,7]);
  r._draw(r.batch);
 }
 assert.equal(allocs,1,'GPU instance buffer grows once and is reused on following frames');
 assert.equal(uploads,3);assert.equal(draws,3);
 assert.equal(r.drawnInstances,3000);
 assert.equal(r.uploadedBytes,3000*20*4);
}
const world=new World(0),player={x:0,z:11,yaw:0,speed:0,level:0,bladeLevel:0};
for(const n of [1000,3000,6500]){
 const all=Array.from({length:n},(_,i)=>({
  kind:i%4===0?'blue':'gold',
  x:-25+(i%70)*.71,z:-21+Math.floor(i/70)*.45,
  y:0,vx:i%29===0?.6:0,vy:0,vz:0,dead:false,spin:0,angle:0
 }));
 const solver=new GranularSolver(),t0=performance.now();
 for(let j=0;j<3;j++)solver.step(all,.016,player,player,world);
 const elapsed=performance.now()-t0;
 assert.equal(all.length,n);
 assert.equal(new Set(all).size,n);
 assert.ok(solver.lastScheduled<=850);
 assert.ok(solver.lastSleeping>=0);
 assert.ok(all.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)));
 console.log(n+' physical entities: 3 solver frames '+elapsed.toFixed(1)+' ms on this CI CPU; scheduled='+solver.lastScheduled);
}
console.log('v0.6.3: scheduler, independent LOD instances, GPU reuse, auto quality and 1k/3k/6.5k object invariants PASS');
