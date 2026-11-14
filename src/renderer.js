import {GEOMETRY} from './geometry.js';
import {composeInto, mat4Mul, ortho, lookAt, project} from './math.js';
import {QUALITY_LEVELS} from './quality.js';
import {headingBasis} from './heading.js';
import {cameraFraming} from './cameraZoom.js';
const VERT=`
precision highp float;
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec4 aM0;
attribute vec4 aM1;
attribute vec4 aM2;
attribute vec4 aM3;
attribute vec4 aTint;
uniform mat4 uVP;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vLocal;
varying vec4 vTint;
void main(){
 mat4 model=mat4(aM0,aM1,aM2,aM3);
 vec4 world=model*vec4(aPosition,1.);
 vec3 scale=vec3(length(aM0.xyz),length(aM1.xyz),length(aM2.xyz));
 vWorld=world.xyz;
 vLocal=aPosition;
 vNormal=normalize(mat3(model)*(aNormal/max(scale*scale,vec3(.00001))));
 vTint=aTint;
 gl_Position=uVP*world;
}`;
const FRAG=`
precision highp float;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vLocal;
varying vec4 vTint;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 x){vec2 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void main(){
 float mat=vTint.a;
 if(mat>7.5&&mat<8.5){ // Vignetted contact shadow, drawn in the transparent pass.
  float radius=length(vLocal.xz)*2.;
  float alpha=.32*pow(max(0.,1.-radius*radius),2.3);
  gl_FragColor=vec4(.10,.065,.046,alpha);return;
 }
 vec3 normal=normalize(gl_FrontFacing ? vNormal : -vNormal);
 vec3 sun=normalize(vec3(-.38,.90,.48));
 float diffuse=max(0.,dot(normal,sun));
 float light=.69+.39*diffuse;
 vec3 color=vTint.rgb*light;
 float specular=pow(max(0.,dot(reflect(-sun,normal),normalize(vec3(.23,.72,.63)))),17.);
 if(mat>1.5&&mat<2.5){
  vec2 q=vWorld.xz;
  float a=noise(q*.63+vec2(uTime*.16,-uTime*.24));
  float b=noise(q*1.75+vec2(-uTime*.46,uTime*.23));
  float c=noise(q*3.86+vec2(uTime*.32,uTime*.35));
  float cracks=sin(q.x*2.7+q.y*1.65+a*5.+uTime*1.25);
  float heat=clamp(a*.52+b*.24+c*.13+cracks*.14+.03,0.,1.);
  color=mix(vec3(.24,.014,.01),vec3(.90,.095,.018),smoothstep(.22,.58,heat));
  color=mix(color,vec3(1.,.49,.09),smoothstep(.50,.73,heat));
  color=mix(color,vec3(1.,.94,.56),smoothstep(.70,.85,heat));
 }else if(mat>2.5&&mat<3.5){
  color=mix(vTint.rgb,vec3(1.,.99,.77),.24+.12*sin(uTime*1.3+vWorld.x));
 }else if(mat>3.5&&mat<4.5){
  color=vTint.rgb*(.64+.43*diffuse)+specular*vec3(.27,.27,.20);
 }else if(mat>4.5&&mat<5.5){
  color=vTint.rgb*(.62+.29*diffuse);
 }else if(mat>5.5&&mat<6.5){
  color*=.96+.035*noise(vWorld.xz*2.2);
 }else if(mat>6.5&&mat<7.5){
  // Cold face/bright relief, warm grooves and deeper edge contrast.
  float ring=length(vLocal.xz);
  float relief=smoothstep(.31,.44,ring)*step(.125,abs(vLocal.y));
  color=vTint.rgb*(.42+.65*diffuse)+specular*vec3(.46,.34,.07);
  color*=.79+.18*smoothstep(.12,1.3,vWorld.y);
  color*=1.-relief*.17;
 }else if(mat>8.5&&mat<9.5){
  // Per-ball ivory swirl pattern similar to the high contrast print in the ad.
  // vLocal rotates with each sphere, so markings roll rather than floating.
  float longitude=atan(vLocal.z,vLocal.x);
  float latitude=vLocal.y*6.283;
  float ribbon=sin(longitude*3.0+latitude*2.2+sin(latitude*2.0)*.85);
  float swirl=smoothstep(.40,.87,ribbon)*(.52+.48*smoothstep(-.10,.35,vLocal.y));
  float centerDot=1.-smoothstep(.065,.135,length(vLocal.xz-vec2(.02,.08)));
  vec3 shell=vTint.rgb*(.62+.48*diffuse);
  color=mix(shell,vec3(.63,.94,1.0),clamp(swirl*.88+centerDot*.48,0.,.90));
  color+=pow(max(0.,diffuse),28.)*vec3(.35,.45,.62);
  color+=specular*vec3(.32,.44,.62);
 }else{
  color+=specular*.07;
 }
 // Highlight spawned portal particles without an extra per-instance attribute.
 // Integer material ID is preserved; fraction 0..0.25 encodes white flash.
 if((mat>=7. && mat<7.5)||(mat>=9. && mat<9.5)){
  float flash=clamp(fract(mat)*4.,0.,1.);
  color=mix(color,vec3(1.0),flash*.94);
 }
 float alpha=mat<.99?mat:1.;
 gl_FragColor=vec4(color,alpha);
}`;
const compile=(gl,kind,src)=>{const o=gl.createShader(kind);gl.shaderSource(o,src);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(o));return o};
/**
 * v0.6.3: persistent CPU-side typed instance storage + geometrically growing
 * GPU allocations. The former version allocated arrays and gl.bufferData for
 * every instance batch each frame, producing avoidable GC / driver churn.
 */
export class Renderer{
 constructor(canvas){
  this.canvas=canvas;
  this.gl=canvas.getContext('webgl2',{alpha:false,antialias:true,powerPreference:'high-performance'})||
    canvas.getContext('webgl',{alpha:false,antialias:true,powerPreference:'high-performance'});
  if(!this.gl)throw new Error('当前浏览器不支持 WebGL。请改用 Chrome、Edge 或支持 WebGL 的浏览器。');
  const gl=this.gl;
  this.instanced=gl.vertexAttribDivisor?
   {divisor:(a,b)=>gl.vertexAttribDivisor(a,b),draw:(...args)=>gl.drawElementsInstanced(...args)}:null;
  if(!this.instanced){
   const ext=gl.getExtension('ANGLE_instanced_arrays');
   if(ext)this.instanced={divisor:(a,b)=>ext.vertexAttribDivisorANGLE(a,b),
    draw:(...args)=>ext.drawElementsInstancedANGLE(...args)};
  }
  if(!this.instanced)throw new Error('当前设备不支持实例化渲染（ANGLE_instanced_arrays）。');
  const prog=gl.createProgram();
  gl.attachShader(prog,compile(gl,gl.VERTEX_SHADER,VERT));
  gl.attachShader(prog,compile(gl,gl.FRAGMENT_SHADER,FRAG));
  gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(prog));
  this.program=prog;gl.useProgram(prog);
  this.a={pos:gl.getAttribLocation(prog,'aPosition'),nor:gl.getAttribLocation(prog,'aNormal'),
   m:[0,1,2,3].map(i=>gl.getAttribLocation(prog,'aM'+i)),tint:gl.getAttribLocation(prog,'aTint')};
  this.u={vp:gl.getUniformLocation(prog,'uVP'),time:gl.getUniformLocation(prog,'uTime')};
  this.meshes={};
  this.batch=new Map();this.transparent=new Map();
  for(const [name,g] of Object.entries(GEOMETRY)){
   const item={count:g.indices.length,instCapacity:0};
   item.v=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,item.v);
   gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(g.vertices),gl.STATIC_DRAW);
   item.n=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,item.n);
   gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(g.normals),gl.STATIC_DRAW);
   item.i=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,item.i);
   gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(g.indices),gl.STATIC_DRAW);
   item.inst=gl.createBuffer();this.meshes[name]=item;
   this.batch.set(name,{data:new Float32Array(20*32),count:0});
   this.transparent.set(name,{data:new Float32Array(20*16),count:0});
  }
  this.camera={x:0,z:3,targetX:0,targetZ:0,zoom:1,mode:'follow',focusPulse:0,mapFacing:1};
  this.w=0;this.h=0;this.vp=null;
  this.quality=QUALITY_LEVELS.high;this.qualityName='high';
  this.drawCalls=0;this.drawnInstances=0;this.uploadedBytes=0;
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
  gl.clearColor(.51,.35,.26,1);
 }
 pulseUpgrade(){this.camera.focusPulse=1;}
 setQuality(name){
  if(!Object.hasOwn(QUALITY_LEVELS,name))return false;
  if(this.qualityName===name)return false;
  this.qualityName=name;this.quality=QUALITY_LEVELS[name];
  return true;
 }
 resize(){
  const dpr=Math.min(window.devicePixelRatio||1,this.quality.dpr);
  const w=Math.max(1,Math.round(this.canvas.clientWidth*dpr));
  const h=Math.max(1,Math.round(this.canvas.clientHeight*dpr));
  if(w!==this.canvas.width||h!==this.canvas.height){
   this.canvas.width=w;this.canvas.height=h;this.gl.viewport(0,0,w,h);
  }
  this.w=this.canvas.clientWidth;this.h=this.canvas.clientHeight;this.aspect=w/h;
 }
 begin(t,player,dt){
  this.resize();
  const follow=Math.min(1,dt*3.4);
  this.camera.focusPulse=Math.max(0,(this.camera.focusPulse||0)-Math.max(0,dt)*1.45);
  const frame=cameraFraming(this.aspect,this.camera.zoom,this.camera.mode,this.camera.focusPulse);
  const {fx,fz}=headingBasis(player.yaw);
  this.camera.x+=(player.x+fx*frame.forwardOffset-this.camera.x)*follow;
  this.camera.z+=(player.z+fz*frame.forwardOffset-this.camera.z)*follow;
  const facing=this.camera.mapFacing===-1?-1:1;
  const cx=this.camera.x,cz=this.camera.z-1.8*facing;
  const vertical=frame.vertical;
  const proj=ortho(-vertical*this.aspect*.5,vertical*this.aspect*.5,-vertical*.5,vertical*.5,.1,170);
  const view=lookAt([cx+17*facing,29,cz+27*facing],[cx,0,cz-3.3*facing]);
  this.vp=mat4Mul(proj,view);
  const gl=this.gl;
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);
  gl.uniformMatrix4fv(this.u.vp,false,this.vp);gl.uniform1f(this.u.time,t);
  for(const pack of this.batch.values())pack.count=0;
  for(const pack of this.transparent.values())pack.count=0;
  this.drawCalls=0;this.drawnInstances=0;this.uploadedBytes=0;
 }
 /** Conservative orthographic clip test for an individual collectible. */
 visible(x,y,z,margin=.16){
  const m=this.vp;if(!m)return true;
  const w=m[3]*x+m[7]*y+m[11]*z+m[15];
  if(w<=0)return false;
  const sx=(m[0]*x+m[4]*y+m[8]*z+m[12])/w;
  const sy=(m[1]*x+m[5]*y+m[9]*z+m[13])/w;
  return Math.abs(sx)<1+margin&&Math.abs(sy)<1+margin;
 }
 add(kind,x,y,z,sx,sy,sz,c,yaw=0,pitch=0,roll=0,opacity=1){
  if(Math.abs(x-this.camera.x)>55||Math.abs(z-this.camera.z)>59)return;
  const map=(opacity<1||c[3]===8)?this.transparent:this.batch;
  const pack=map.get(kind);
  if(!pack)throw Error('Unknown mesh: '+kind);
  const i=pack.count*20;
  if(i+20>pack.data.length){
   const next=new Float32Array(Math.max(i+20,pack.data.length*2));
   next.set(pack.data);pack.data=next;
  }
  composeInto(pack.data,i,x,y,z,sx,sy,sz,yaw,pitch,roll);
  pack.data[i+16]=c[0];pack.data[i+17]=c[1];pack.data[i+18]=c[2];
  pack.data[i+19]=opacity!==1?opacity:(c[3]||1);
  pack.count++;
 }
 end(){
  const gl=this.gl;gl.disable(gl.BLEND);gl.depthMask(true);this._draw(this.batch);
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);this._draw(this.transparent);gl.depthMask(true);gl.disable(gl.BLEND);
 }
 _draw(batches){
  const gl=this.gl;
  for(const [kind,pack] of batches){
   if(!pack.count)continue;
   const mesh=this.meshes[kind],n=pack.count*20,bytes=n*4;
   gl.bindBuffer(gl.ARRAY_BUFFER,mesh.v);
   gl.enableVertexAttribArray(this.a.pos);
   gl.vertexAttribPointer(this.a.pos,3,gl.FLOAT,false,0,0);
   this.instanced.divisor(this.a.pos,0);
   gl.bindBuffer(gl.ARRAY_BUFFER,mesh.n);
   gl.enableVertexAttribArray(this.a.nor);
   gl.vertexAttribPointer(this.a.nor,3,gl.FLOAT,false,0,0);
   this.instanced.divisor(this.a.nor,0);
   gl.bindBuffer(gl.ARRAY_BUFFER,mesh.inst);
   if(bytes>mesh.instCapacity){
    mesh.instCapacity=Math.max(2560,mesh.instCapacity*2,bytes);
    gl.bufferData(gl.ARRAY_BUFFER,mesh.instCapacity,gl.DYNAMIC_DRAW);
   }
   gl.bufferSubData(gl.ARRAY_BUFFER,0,pack.data.subarray(0,n));
   this.uploadedBytes+=bytes;
   for(let i=0;i<4;i++){
    const loc=this.a.m[i];gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc,4,gl.FLOAT,false,80,i*16);this.instanced.divisor(loc,1);
   }
   gl.enableVertexAttribArray(this.a.tint);
   gl.vertexAttribPointer(this.a.tint,4,gl.FLOAT,false,80,64);
   this.instanced.divisor(this.a.tint,1);
   gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.i);
   this.instanced.draw(gl.TRIANGLES,mesh.count,gl.UNSIGNED_SHORT,0,pack.count);
   this.drawCalls++;this.drawnInstances+=pack.count;
  }
 }
 screen(x,y,z){return project(this.vp,x,y,z,this.w,this.h)}
}
