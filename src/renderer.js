import {GEOMETRY} from './geometry.js';
import {compose, mat4Mul, ortho, lookAt, project} from './math.js';
import {headingBasis} from './heading.js';
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
export class Renderer{
 constructor(canvas){
  this.canvas=canvas;
  this.gl=canvas.getContext('webgl2',{alpha:false,antialias:true,powerPreference:'high-performance'})||canvas.getContext('webgl',{alpha:false,antialias:true,powerPreference:'high-performance'});
  if(!this.gl)throw new Error('当前浏览器不支持 WebGL。请改用 Chrome、Edge 或支持 WebGL 的浏览器。');
  const gl=this.gl;
  this.instanced=gl.vertexAttribDivisor?{divisor:(a,b)=>gl.vertexAttribDivisor(a,b),draw:(...args)=>gl.drawElementsInstanced(...args)}:null;
  if(!this.instanced){let extension=gl.getExtension('ANGLE_instanced_arrays');if(extension)this.instanced={divisor:(a,b)=>extension.vertexAttribDivisorANGLE(a,b),draw:(...args)=>extension.drawElementsInstancedANGLE(...args)}}
  if(!this.instanced)throw new Error('当前设备不支持实例化渲染（ANGLE_instanced_arrays）。');
  const prog=gl.createProgram();gl.attachShader(prog,compile(gl,gl.VERTEX_SHADER,VERT));gl.attachShader(prog,compile(gl,gl.FRAGMENT_SHADER,FRAG));gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(prog));this.program=prog;gl.useProgram(prog);
  this.a={pos:gl.getAttribLocation(prog,'aPosition'),nor:gl.getAttribLocation(prog,'aNormal'),m:[0,1,2,3].map(i=>gl.getAttribLocation(prog,'aM'+i)),tint:gl.getAttribLocation(prog,'aTint')};
  this.u={vp:gl.getUniformLocation(prog,'uVP'),time:gl.getUniformLocation(prog,'uTime')};
  this.meshes={};for(const [key,g] of Object.entries(GEOMETRY)){
   let item={count:g.indices.length};item.v=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,item.v);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(g.vertices),gl.STATIC_DRAW);
   item.n=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,item.n);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(g.normals),gl.STATIC_DRAW);
   item.i=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,item.i);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(g.indices),gl.STATIC_DRAW);
   item.inst=gl.createBuffer();this.meshes[key]=item;
  }
  this.camera={x:0,z:3,targetX:0,targetZ:0,zoom:1};this.batch=new Map();this.transparent=new Map();this.w=0;this.h=0;this.vp=null;
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.clearColor(.51,.35,.26,1);
 }
 resize(){const dpr=Math.min(window.devicePixelRatio||1,innerWidth<650?1.5:1.8),w=Math.round(this.canvas.clientWidth*dpr),h=Math.round(this.canvas.clientHeight*dpr);if(w!==this.canvas.width||h!==this.canvas.height){this.canvas.width=w;this.canvas.height=h;this.gl.viewport(0,0,w,h)}this.w=this.canvas.clientWidth;this.h=this.canvas.clientHeight;this.aspect=w/h;}
 begin(t,player,dt){
 this.resize();
 // Ad footage uses a fixed-quarter-view camera. Keep the azimuth fixed while
 // gently leading the player's forward direction; never spin with the chassis.
 const follow=Math.min(1,dt*3.4);
 const {fx,fz}=headingBasis(player.yaw);
 const headingX=fx*1.25,headingZ=fz*1.25;
 this.camera.x+=(player.x+headingX-this.camera.x)*follow;
 this.camera.z+=(player.z+headingZ-this.camera.z)*follow;
 const cx=this.camera.x,cz=this.camera.z-1.8;
 const vertical=(this.aspect<.7?40.5:this.aspect<1.1?35:32)*this.camera.zoom;
 const proj=ortho(-vertical*this.aspect*.5,vertical*this.aspect*.5,-vertical*.5,vertical*.5,.1,170);
 const view=lookAt([cx+17,29,cz+27],[cx,0,cz-3.3]);
 this.vp=mat4Mul(proj,view);
 const gl=this.gl;
 gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 gl.useProgram(this.program);
 gl.uniformMatrix4fv(this.u.vp,false,this.vp);
 gl.uniform1f(this.u.time,t);
 this.batch.clear();this.transparent.clear();
 }
 // All scales, angles, and positions are in world units. c=[r,g,b], opacity<1 for translucent mesh; c[3]=2 lava, 3 emissive.
 add(kind,x,y,z,sx,sy,sz,c,yaw=0,pitch=0,roll=0,opacity=1){
  if(Math.abs(x-this.camera.x)>55||Math.abs(z-this.camera.z)>59)return;
  let mat=compose(x,y,z,sx,sy,sz,yaw,pitch,roll);let tag=opacity!==1?opacity:(c[3]||1);
  let map=(opacity<1||c[3]===8)?this.transparent:this.batch;if(!map.has(kind))map.set(kind,[]);map.get(kind).push(...mat,c[0],c[1],c[2],tag);
 }
 end(){let gl=this.gl;gl.disable(gl.BLEND);gl.depthMask(true);this._draw(this.batch);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);this._draw(this.transparent);gl.depthMask(true);gl.disable(gl.BLEND)}
 _draw(batches){let gl=this.gl;for(const [kind,data] of batches){if(!data.length)continue;let m=this.meshes[kind],itemCount=data.length/20;
  gl.bindBuffer(gl.ARRAY_BUFFER,m.v);gl.enableVertexAttribArray(this.a.pos);gl.vertexAttribPointer(this.a.pos,3,gl.FLOAT,false,0,0);this.instanced.divisor(this.a.pos,0);
  gl.bindBuffer(gl.ARRAY_BUFFER,m.n);gl.enableVertexAttribArray(this.a.nor);gl.vertexAttribPointer(this.a.nor,3,gl.FLOAT,false,0,0);this.instanced.divisor(this.a.nor,0);
  gl.bindBuffer(gl.ARRAY_BUFFER,m.inst);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);
  for(let i=0;i<4;i++){let loc=this.a.m[i];gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,4,gl.FLOAT,false,80,i*16);this.instanced.divisor(loc,1)}
  gl.enableVertexAttribArray(this.a.tint);gl.vertexAttribPointer(this.a.tint,4,gl.FLOAT,false,80,64);this.instanced.divisor(this.a.tint,1);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,m.i);this.instanced.draw(gl.TRIANGLES,m.count,gl.UNSIGNED_SHORT,0,itemCount);
 }}
 screen(x,y,z){return project(this.vp,x,y,z,this.w,this.h)}
}
