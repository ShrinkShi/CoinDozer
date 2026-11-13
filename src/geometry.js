import {SCOOP_PROFILE,SCOOP_HALF_WIDTH} from './scoop.js';
/* CoinDozer procedural art kit. Units are meters in a deliberately stylized scene.
 * Every mesh is generated in code; no copyrighted game assets are bundled.
 */
const addFace=(out,points)=>{
 const a=points[0],b=points[1],c=points[2];
 const u=b.map((v,i)=>v-a[i]),w=c.map((v,i)=>v-a[i]);
 let n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];
 const length=Math.hypot(...n)||1;n=n.map(v=>v/length);
 const offset=out.vertices.length/3;
 for(const p of points){out.vertices.push(...p);out.normals.push(...n)}
 for(let j=1;j<points.length-1;j++)out.indices.push(offset,offset+j,offset+j+1);
};
const empty=()=>({vertices:[],normals:[],indices:[]});
const build=(faces)=>{const o=empty();for(const face of faces)addFace(o,face);return o};
function box(){let p=[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,.5,-.5],[-.5,.5,-.5],[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]];return build([[p[0],p[3],p[2],p[1]],[p[4],p[5],p[6],p[7]],[p[0],p[4],p[7],p[3]],[p[1],p[2],p[6],p[5]],[p[3],p[7],p[6],p[2]],[p[0],p[1],p[5],p[4]]])}
function prism(count=12,top=1,bottom=1){const f=[];for(let j=0;j<count;j++){let a=j*2*Math.PI/count,b=(j+1)*2*Math.PI/count;let p=[Math.cos(a)*bottom*.5,-.5,Math.sin(a)*bottom*.5],q=[Math.cos(b)*bottom*.5,-.5,Math.sin(b)*bottom*.5],r=[Math.cos(b)*top*.5,.5,Math.sin(b)*top*.5],s=[Math.cos(a)*top*.5,.5,Math.sin(a)*top*.5];if(top>0)f.push([p,s,r,q]);else f.push([p,[0,.5,0],q]);f.push([[0,-.5,0],p,q]);if(top>0)f.push([[0,.5,0],r,s]);}return build(f)}
function ico(){let t=(1+Math.sqrt(5))/2,p=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(v=>v.map(q=>q/Math.hypot(...v)*.5));let ids=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];return build(ids.map(f=>f.map(i=>p[i])))}
function rockChunk(){ // Rounded 80-triangle boulder, closer to footage than jagged broken ico faces.
 const phi=(1+Math.sqrt(5))/2;
 const points=[[-1,phi,0],[1,phi,0],[-1,-phi,0],[1,-phi,0],[0,-1,phi],[0,1,phi],[0,-1,-phi],[0,1,-phi],[phi,0,-1],[phi,0,1],[-phi,0,-1],[-phi,0,1]];
 const indices=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
 const norm=(p)=>{const l=Math.hypot(...p)||1;return p.map(v=>v/l)};
 const verts=points.map(norm),edges=new Map();
 function mid(a,b){const k=Math.min(a,b)+','+Math.max(a,b);if(edges.has(k))return edges.get(k);let p=norm(verts[a].map((v,i)=>v+verts[b][i]));const j=verts.length;verts.push(p);edges.set(k,j);return j}
 const triangles=[];
 for(const [a,b,c] of indices){const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);triangles.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca])}
 const irregular=verts.map(([x,y,z])=>{
  const bump=1+.045*Math.sin(x*13+y*8)+.06*Math.cos(z*11+x*5);
  return [x*bump*.50,(y*bump*.48)+.025,z*bump*.52];
 });
 return build(triangles.map(t=>t.map(i=>irregular[i])));
}
function smoothSphere(rows=12,cols=20){const vertices=[],normals=[],indices=[];for(let row=0;row<=rows;row++){let phi=Math.PI*row/rows;for(let col=0;col<=cols;col++){let theta=Math.PI*2*col/cols;let nx=Math.sin(phi)*Math.cos(theta),ny=Math.cos(phi),nz=Math.sin(phi)*Math.sin(theta);vertices.push(nx*.5,ny*.5,nz*.5);normals.push(nx,ny,nz)}}for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){let a=row*(cols+1)+col,b=a+cols+1;indices.push(a,b,a+1,b,b+1,a+1)}return {vertices,normals,indices}}
function shell(){// A deeply cupped seven-segment steel shovel, open at the front, not a flat wall.
 const curve=SCOOP_PROFILE.map(([ahead,height])=>[-ahead,height]);
 const o=empty();const W=SCOOP_HALF_WIDTH;
 for(let j=0;j<curve.length-1;j++){
  const [z0,y0]=curve[j],[z1,y1]=curve[j+1];
  for(let k=0;k<6;k++){
   const x0=-W+k*W/3,x1=-W+(k+1)*W/3;
   const billow=x=>Math.pow(Math.abs(x/W),1.8)*.18;
   addFace(o,[[x0,y0,z0+billow(x0)],[x1,y0,z0+billow(x1)],[x1,y1,z1+billow(x1)],[x0,y1,z1+billow(x0)]]);
   addFace(o,[[x0,y0,z0+billow(x0)+.135],[x0,y1,z1+billow(x0)+.135],[x1,y1,z1+billow(x1)+.135],[x1,y0,z0+billow(x1)+.135]]);
  }
 }
 for(const x of [-W,W])for(let j=0;j<curve.length-1;j++){
  const [z0,y0]=curve[j],[z1,y1]=curve[j+1];addFace(o,[[x,y0,z0],[x,y1,z1],[x,y1,z1+.135],[x,y0,z0+.135]])
 }
 addFace(o,[[-W,.15,-2.77],[W,.15,-2.77],[W,.15,-2.63],[-W,.15,-2.63]]);
 addFace(o,[[-W,1.38,-1.74],[-W,1.38,-1.605],[W,1.38,-1.605],[W,1.38,-1.74]]);
 return o;
}
function cheek(){// One of two thick, upturned side plates of the shovel.
 const pts=[[-2.86,.15],[-2.63,.17],[-2.51,.56],[-2.15,1.14],[-1.73,1.50],[-1.46,1.40],[-1.43,1.08],[-1.68,.43],[-1.94,.18]];
 const o=empty();const x0=-.5,x1=.5;
 for(let k=0;k<pts.length;k++){let a=pts[k],b=pts[(k+1)%pts.length];addFace(o,[[x0,a[1],a[0]],[x1,a[1],a[0]],[x1,b[1],b[0]],[x0,b[1],b[0]]])}
 addFace(o,pts.map(p=>[x0,p[1],p[0]]));addFace(o,pts.slice().reverse().map(p=>[x1,p[1],p[0]]));return o;
}
function track(){// Raised rubber caterpillar track with rounded drive-wheel ends, 3D solid extrusion.
 const pts=[];const R=.43,Z=.94;
 for(let i=0;i<=8;i++){let a=-Math.PI/2+Math.PI*i/8;pts.push([Z+R*Math.cos(a),R*Math.sin(a)])}
 for(let i=0;i<=8;i++){let a=Math.PI/2+Math.PI*i/8;pts.push([-Z+R*Math.cos(a),R*Math.sin(a)])}
 const o=empty(),x0=-.5,x1=.5;
 for(let i=0;i<pts.length;i++){let a=pts[i],b=pts[(i+1)%pts.length];addFace(o,[[x0,a[1],a[0]],[x1,a[1],a[0]],[x1,b[1],b[0]],[x0,b[1],b[0]]])}
 addFace(o,pts.map(p=>[x1,p[1],p[0]]));addFace(o,pts.slice().reverse().map(p=>[x0,p[1],p[0]]));return o;
}
function groundRibbon(){// Jagged river edge in local X/Z; shader animates molten texture in world space.
 const o=empty(),segments=28;
 for(let i=0;i<segments;i++){
  let left=i/segments-.5,right=(i+1)/segments-.5;
  const edge=(x,s)=>s*(.5+.05*Math.sin(37*x+3*s)+.032*Math.sin(81*x+2.3*s));
  addFace(o,[[left,0,edge(left,-1)],[right,0,edge(right,-1)],[right,0,edge(right,1)],[left,0,edge(left,1)]])
 }
 return o;
}
/** Single extruded, stamped coin. The raised rims and centre relief travel
 * with the *same orientation* as the coin, unlike stacked horizontal decals.
 * Local radius=.5; half-thickness=.22 to suit a .56 world-space scale.
 */
function stampedCoin(){
 const o=empty(),segments=28;
 // Strip rings in radius/height, including matching relief on both sides.
 const bands=[
   [.00,.50,-.15], [.50,.50,.15], // side of the solid coin
 ];
 function ring(r0,r1,y0,y1,invert=false){
  for(let i=0;i<segments;i++){
   const a=i*Math.PI*2/segments,b=(i+1)*Math.PI*2/segments;
   const point=(r,y,t)=>[Math.cos(t)*r,y,Math.sin(t)*r];
   let face=[point(r0,y0,a),point(r1,y1,a),point(r1,y1,b),point(r0,y0,b)];
   addFace(o,invert?face.reverse():face);
  }
 }
 ring(.50,.50,-.16,.16); // thick cut edge
 ring(.40,.50,.18,.16); ring(.33,.40,.171,.18);ring(0,.33,.164,.171);
 ring(.40,.50,-.18,-.16,true);ring(.33,.40,-.171,-.18,true);ring(0,.33,-.164,-.171,true);
 // Indented ridges around rim, visible when a coin tilts or stands on edge.
 for(let j=0;j<segments;j++){
  const a=j*Math.PI*2/segments,b=a+.10;
  const pt=(r,y,t)=>[r*Math.cos(t),y,r*Math.sin(t)];
  addFace(o,[pt(.508,-.095,a),pt(.508,.095,a),pt(.508,.095,b),pt(.508,-.095,b)]);
 }
 // Relief: a slender currency stem with two diagonal wings; drawn on both faces.
 const stamp=(x,z,w,h,top)=>{
  let y=top? .196:-.196;
  addFace(o,[[x-w/2,y,z-h/2],[x+w/2,y,z-h/2],[x+w/2,y,z+h/2],[x-w/2,y,z+h/2]]);
  // Side thickness gives the stamped mark real geometric depth.
  for(const xx of [x-w/2,x+w/2])addFace(o,[[xx,y,z-h/2],[xx,top?.166:-.166,z-h/2],[xx,top?.166:-.166,z+h/2],[xx,y,z+h/2]]);
 };
 for(const top of [true,false]){
  stamp(0,0,.075,.49,top);
  stamp(-.10,.10,.23,.075,top);
  stamp(.10,-.10,.23,.075,top);
 }
 return o;
}
function shadow(){let o=empty();for(let i=0;i<32;i++){let a=i*Math.PI/16,b=(i+1)*Math.PI/16;addFace(o,[[0,0,0],[Math.cos(a)*.5,0,Math.sin(a)*.5],[Math.cos(b)*.5,0,Math.sin(b)*.5]])}return o}
export const GEOMETRY={box:box(),sphere:smoothSphere(),rock:ico(),boulder:rockChunk(),cylinder:prism(14),coin:stampedCoin(),cone:prism(8,0,1),scoop:shell(),cheek:cheek(),track:track(),river:groundRibbon(),shadow:shadow()};
