/** Single-vehicle autonomy prototype for v0.7.4.
 * It navigates the existing physical map; it never edits resource positions,
 * creates inventory, or bypasses the shared granular / river collision solver.
 */
import {clamp} from './math.js';
import {headingBasis} from './heading.js';

const CELL=2.5, VEHICLE_RADIUS=1.05, PATH_REPLAN=.72;
const DIRS=Object.freeze([
 [-1,0,1],[1,0,1],[0,-1,1],[0,1,1],
 [-1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[1,-1,Math.SQRT2],[1,1,Math.SQRT2]
]);
const GRID_CACHE=new WeakMap();

export const NPC_STATE_LABELS=Object.freeze({
 idle:'待机：等待矿石',search:'搜索矿石',approach:'规划路线',push:'推料中',
 recover:'脱困恢复',blocked:'路线受阻'
});
export function createNpc(){
 return {npc:true,enabled:false,x:-8,z:-48,y:0,yaw:Math.PI,speed:0,
  level:0,bladeLevel:0,speedLevel:0,steeringLevel:0,coinLevel:0,cargoLevel:0,
  trackLeft:0,trackRight:0,travelDistance:0,bladeBounce:0,
  state:'idle',targetId:null,targetX:0,targetZ:0,route:[],routeIndex:0,
  nextPlanAt:0,plannedX:NaN,plannedZ:NaN,stuckFor:0,lastX:-8,lastZ:-48,
  recoveryUntil:0,recoveries:0,completed:0,ignoredTargets:Object.create(null),
  treads:[],lastTrail:0};
}
function pointSegmentDistanceSq(x,z,o){
 const dx=o.x2-o.x1,dz=o.z2-o.z1;
 const t=clamp(((x-o.x1)*dx+(z-o.z1)*dz)/(dx*dx+dz*dz||1),0,1);
 const px=o.x1+dx*t,pz=o.z1+dz*t;
 return (x-px)**2+(z-pz)**2;
}
function makeGrid(world){
 const bounds=world.bounds,rivers=world.terrain?.rivers||[],obstacles=world.obstacles||[];
 const minX=Math.ceil((bounds.minX+VEHICLE_RADIUS)/CELL);
 const maxX=Math.floor((bounds.maxX-VEHICLE_RADIUS)/CELL);
 const minZ=Math.ceil((bounds.minZ+VEHICLE_RADIUS)/CELL);
 const maxZ=Math.floor((bounds.maxZ-VEHICLE_RADIUS)/CELL);
 const nx=maxX-minX+1,nz=maxZ-minZ+1,blocked=new Uint8Array(nx*nz);
 for(let iz=0;iz<nz;iz++)for(let ix=0;ix<nx;ix++){
  const x=(minX+ix)*CELL,z=(minZ+iz)*CELL;
  let no=false;
  for(const r of rivers){
   if(z>=r.zMin-VEHICLE_RADIUS&&z<=r.zMax+VEHICLE_RADIUS){
    const half=(r.width||0)*.5-VEHICLE_RADIUS-.08;
    if(half<=0||Math.abs(x-r.x)>half){no=true;break;}
   }
  }
  if(!no)for(const o of obstacles){
   if((o.height??1)<.8)continue;
   const reach=VEHICLE_RADIUS+o.radius+.20;
   const d2=o.type==='segment'?pointSegmentDistanceSq(x,z,o):(x-o.x)**2+(z-o.z)**2;
   if(d2<reach*reach){no=true;break;}
  }
  blocked[iz*nx+ix]=no?1:0;
 }
 return {minX,minZ,nx,nz,blocked};
}
function gridFor(world){
 const width=world.terrain?.rivers?.[0]?.width||12;
 let byWidth=GRID_CACHE.get(world);
 if(!byWidth){byWidth=new Map();GRID_CACHE.set(world,byWidth);}
 if(!byWidth.has(width))byWidth.set(width,makeGrid(world));
 return byWidth.get(width);
}
class MinHeap{
 constructor(){this.items=[];}
 push(id,score){
  const a=this.items;let i=a.length;a.push({id,score});
  while(i){const p=(i-1)>>1;if(a[p].score<=score)break;a[i]=a[p];i=p;}
  a[i]={id,score};
 }
 pop(){
  const a=this.items;if(!a.length)return null;
  const root=a[0],last=a.pop();if(a.length){
   let i=0;
   while(true){let c=i*2+1;if(c>=a.length)break;
    if(c+1<a.length&&a[c+1].score<a[c].score)c++;
    if(a[c].score>=last.score)break;
    a[i]=a[c];i=c;
   }
   a[i]=last;
  }
  return root;
 }
 get length(){return this.items.length;}
}
function octile(ax,az,bx,bz){
 const dx=Math.abs(ax-bx),dz=Math.abs(az-bz),m=Math.min(dx,dz);
 return dx+dz+(Math.SQRT2-2)*m;
}
export function planNpcRoute(world,start,goal,avoid=[]){
 if(!world?.terrain||!world.bounds)return [];
 const grid=gridFor(world),{minX,minZ,nx,nz,blocked}=grid;
 const total=nx*nz;
 const index=(ix,iz)=>iz*nx+ix;
 const pos=id=>({x:(minX+id%nx)*CELL,z:(minZ+Math.floor(id/nx))*CELL});
 const dynamicBlocked=(id)=>{
  if(blocked[id])return true;
  const p=pos(id);
  return avoid.some(a=>a&&Math.hypot(p.x-a.x,p.z-a.z)<2.35&&
   Math.hypot(p.x-start.x,p.z-start.z)>3.0);
 };
 const nearest=(point,allowBlocked=false)=>{
  let best=-1,score=Infinity;
  for(let id=0;id<total;id++){
   if(!allowBlocked&&dynamicBlocked(id))continue;
   const p=pos(id),d=(p.x-point.x)**2+(p.z-point.z)**2;
   if(d<score){score=d;best=id;}
  }
  return best;
 };
 const startId=nearest(start,true),goalId=nearest(goal,false);
 if(startId<0||goalId<0)return [];
 if(startId===goalId)return [goal];
 const g=new Float32Array(total);g.fill(Infinity);
 const came=new Int32Array(total);came.fill(-1);
 const closed=new Uint8Array(total),heap=new MinHeap();
 const end=pos(goalId);g[startId]=0;
 heap.push(startId,octile(pos(startId).x,pos(startId).z,end.x,end.z));
 let found=false,visited=0;
 while(heap.length&&visited++<total*2){
  const item=heap.pop(),id=item.id;if(closed[id])continue;
  if(id===goalId){found=true;break;}
  closed[id]=1;
  const ix=id%nx,iz=Math.floor(id/nx),current=pos(id);
  for(const [dx,dz,cost] of DIRS){
   const x=ix+dx,z=iz+dz;
   if(x<0||x>=nx||z<0||z>=nz)continue;
   const next=index(x,z);if(closed[next]||dynamicBlocked(next))continue;
   if(dx&&dz&&(dynamicBlocked(index(ix+dx,iz))||dynamicBlocked(index(ix,iz+dz))))continue;
   const candidate=g[id]+cost;
   if(candidate>=g[next])continue;
   came[next]=id;g[next]=candidate;
   const p=pos(next);
   heap.push(next,candidate+octile(p.x,p.z,end.x,end.z));
  }
 }
 if(!found)return [];
 const raw=[];for(let id=goalId;id!==startId&&id>=0;id=came[id])raw.push(pos(id));
 raw.reverse();
 // Greedy line-of-sight smoothing retains the bridge corridor and obstacle clearance.
 const clear=(a,b)=>{
  const distance=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(distance/.8);
  for(let i=1;i<steps;i++){
   const t=i/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
   for(const r of world.terrain.rivers||[]){
    if(z>=r.zMin-VEHICLE_RADIUS&&z<=r.zMax+VEHICLE_RADIUS&&
     Math.abs(x-r.x)>(r.width||0)*.5-VEHICLE_RADIUS-.08)return false;
   }
   for(const o of world.obstacles||[]){
    if((o.height??1)<.8)continue;
    const reach=VEHICLE_RADIUS+o.radius+.20;
    const d2=o.type==='segment'?pointSegmentDistanceSq(x,z,o):(x-o.x)**2+(z-o.z)**2;
    if(d2<reach*reach)return false;
   }
   for(const a0 of avoid)if(a0&&Math.hypot(x-a0.x,z-a0.z)<2.35)return false;
  }
  return true;
 };
 if(raw.length<=1)return raw;
 const smooth=[];let at=0;
 while(at<raw.length-1){
  let next=raw.length-1;
  while(next>at+1&&!clear(raw[at],raw[next]))next--;
  smooth.push(raw[next]);at=next;
 }
 return smooth;
}
function chooseOre(npc,resources,now){
 let best=null,bestScore=Infinity;
 for(const r of resources){
  if(r.dead||r.kind!=='blue'||r.cargoState||r.z>12||
   (npc.ignoredTargets[r.id]||0)>now)continue;
  // Prefer material on the main production corridor and within the bridge aperture.
  const score=Math.hypot(r.x-npc.x,r.z-npc.z)+Math.abs(r.x)*1.35+
   Math.max(0,Math.abs(r.x)-3.2)*8;
  if(score<bestScore){bestScore=score;best=r;}
 }
 return best;
}
export function updateNpc(npc,resources,world,dt,now,player){
 if(!npc.enabled||world.stage!==0)return {dirX:0,dirZ:0,speed:0};
 let target=resources.find(r=>!r.dead&&r.id===npc.targetId);
 if(target&&target.kind!=='blue'){
  if(target.kind==='gold')npc.completed++;
  npc.targetId=null;target=null;npc.route.length=0;
 }
 if(!target){
  target=chooseOre(npc,resources,now);
  if(target){npc.targetId=target.id;npc.state='approach';npc.nextPlanAt=0;}
 }
 if(!target){
  npc.state='idle';npc.speed+=(0-npc.speed)*Math.min(1,dt*5);
  return {dirX:0,dirZ:0,speed:0};
 }
 npc.targetX=target.x;npc.targetZ=target.z;
 if(now<npc.recoveryUntil){
  npc.state='recover';
  const b=headingBasis(npc.yaw);
  return {dirX:-b.fx,dirZ:-b.fz,speed:2.1,reverse:true};
 }
 const b=headingBasis(npc.yaw);
 const dx=target.x-npc.x,dz=target.z-npc.z;
 const ahead=dx*b.fx+dz*b.fz,lateral=dx*b.rx+dz*b.rz;
 const inScoopRange=ahead>1.35&&ahead<4.0&&Math.abs(lateral)<2.25;
 npc.state=inScoopRange?'push':'approach';
 const goal={x:clamp(target.x,-2.9,2.9),z:target.z-2.45};
 const goalMoved=Math.hypot(goal.x-npc.plannedX,goal.z-npc.plannedZ)>1.45;
 if(now>=npc.nextPlanAt||goalMoved){
  npc.route=planNpcRoute(world,npc,goal,player?[player]:[]);
  npc.routeIndex=0;npc.nextPlanAt=now+PATH_REPLAN;
  npc.plannedX=goal.x;npc.plannedZ=goal.z;
 }
 while(npc.routeIndex<npc.route.length-1){
  const q=npc.route[npc.routeIndex];
  if(Math.hypot(q.x-npc.x,q.z-npc.z)>1.55)break;
  npc.routeIndex++;
 }
 let tx,tz,desiredSpeed;
 if(inScoopRange){
  // Hold the target in front of the bucket; the granular solver supplies the push.
  tx=clamp(target.x-npc.x,-.9,.9);tz=Math.max(1.1,target.z-npc.z);
  desiredSpeed=4.8;
 }else{
  const q=npc.route[npc.routeIndex]||goal;
  tx=q.x-npc.x;tz=q.z-npc.z;desiredSpeed=4.15;
 }
 const length=Math.hypot(tx,tz)||1;
 let dirX=tx/length,dirZ=tz/length;
 const moved=Math.hypot(npc.x-npc.lastX,npc.z-npc.lastZ);
 if(desiredSpeed>1.5&&moved<Math.max(.025,dt*.12))npc.stuckFor+=dt;
 else npc.stuckFor=Math.max(0,npc.stuckFor-dt*1.5);
 npc.lastX=npc.x;npc.lastZ=npc.z;
 if(npc.stuckFor>1.65){
  npc.stuckFor=0;npc.recoveries++;
  npc.recoveryUntil=now+.72;npc.route.length=0;npc.nextPlanAt=0;
  if(npc.recoveries%3===0){
   npc.ignoredTargets[target.id]=now+9;npc.targetId=null;
  }
  npc.state='recover';
  const f=headingBasis(npc.yaw);
  return {dirX:-f.fx,dirZ:-f.fz,speed:2.1,reverse:true};
 }
 return {dirX,dirZ,speed:desiredSpeed,reverse:false};
}
