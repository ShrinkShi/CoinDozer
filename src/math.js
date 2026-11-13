export const TAU=Math.PI*2;
export const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export const lerp=(a,b,t)=>a+(b-a)*t;
export const rnd=(a,b)=>a+Math.random()*(b-a);
export const distance=(x,z,a,b)=>Math.hypot(x-a,z-b);
export const damp=(v,rate,dt)=>v*Math.exp(-rate*dt);
export function mat4Mul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o}
export function ortho(l,r,b,t,n,f){return new Float32Array([2/(r-l),0,0,0,0,2/(t-b),0,0,0,0,-2/(f-n),0,-(r+l)/(r-l),-(t+b)/(t-b),-(f+n)/(f-n),1])}
export function lookAt(e,c){let z=[e[0]-c[0],e[1]-c[1],e[2]-c[2]],l=Math.hypot(...z);z=z.map(t=>t/l);let x=[z[2],0,-z[0]],ll=Math.hypot(...x);x=x.map(v=>v/ll);let y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]];return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-(x[0]*e[0]+x[1]*e[1]+x[2]*e[2]),-(y[0]*e[0]+y[1]*e[1]+y[2]*e[2]),-(z[0]*e[0]+z[1]*e[1]+z[2]*e[2]),1])}
// Column-major affine transform, local scale + yaw + pitch + roll.
export function compose(x,y,z,sx,sy,sz,yaw=0,pitch=0,roll=0){const a=Math.cos(yaw),b=Math.sin(yaw),c=Math.cos(pitch),d=Math.sin(pitch),e=Math.cos(roll),f=Math.sin(roll);
 // rotation Y * X * Z
 return [ (a*e+b*d*f)*sx,(c*f)*sx,(-b*e+a*d*f)*sx,0,(-a*f+b*d*e)*sy,(c*e)*sy,(b*f+a*d*e)*sy,0,(b*c)*sz,(-d)*sz,(a*c)*sz,0,x,y,z,1 ];}
export function project(vp,x,y,z,w,h){let p=[x,y,z,1],q=[0,0,0,0];for(let row=0;row<4;row++)q[row]=vp[row]*p[0]+vp[row+4]*p[1]+vp[row+8]*p[2]+vp[row+12]*p[3];if(q[3]<=0)return null;const nx=q[0]/q[3],ny=q[1]/q[3];return {x:(nx+1)*w/2,y:(1-ny)*h/2,visible:Math.abs(nx)<1.25&&Math.abs(ny)<1.25};}
export function formatNum(n){return Math.max(0,Math.floor(n)).toLocaleString('en-US')}
