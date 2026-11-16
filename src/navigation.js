import {LONG_MAP} from './mapLayout.js';
import {CONVEYOR_SITES} from './conveyors.js';

/** Navigational overlay only: no inventory, physics or production side effects.
 * Coordinates come from the same long-map constants as the game colliders.
 */
export const NAV_TARGETS=Object.freeze([
 {id:'ore',label:'初始矿石',x:LONG_MAP.initialOre.x,z:LONG_MAP.initialOre.z},
 {id:'gate',label:'矿石数字门',x:LONG_MAP.digitGate.x,z:LONG_MAP.digitGate.z},
 {id:'bridge',label:'中央主桥',x:LONG_MAP.river1.bridgeX,z:LONG_MAP.river1.z},
 {id:'crusher',label:'北岸粉碎门',x:LONG_MAP.crusher.x,z:LONG_MAP.crusher.z},
 {id:'vehicle',label:'车辆升级',x:LONG_MAP.vehiclePad.x,z:LONG_MAP.vehiclePad.z},
 {id:'gatePad',label:'数字门升级',x:LONG_MAP.digitGatePad.x,z:LONG_MAP.digitGatePad.z},
 {id:'crusherPad',label:'粉碎门升级',x:LONG_MAP.crusherPad.x,z:LONG_MAP.crusherPad.z},
 {id:'bridgePad',label:'主桥升级',x:LONG_MAP.bridgePad.x,z:LONG_MAP.bridgePad.z},
 {id:'coinPad',label:'金币价值',x:LONG_MAP.coinValuePad.x,z:LONG_MAP.coinValuePad.z},
 {id:'exitPad',label:'北端桥解锁',x:LONG_MAP.exitPad.x,z:LONG_MAP.exitPad.z},
 {id:'exit',label:'冰雪关卡入口',x:LONG_MAP.entry.x,z:LONG_MAP.entry.z},
 ...CONVEYOR_SITES.map(b=>({id:'belt'+b.id,label:'建造：'+b.label,x:b.padX,z:b.padZ}))
]);
export function navigationGoal(sim,choice='auto'){
 if(choice!=='auto'){
  const selected=NAV_TARGETS.find(p=>p.id===choice);
  if(selected)return selected;
 }
 if((sim?.tracks?.exit?.level||0)>0)return NAV_TARGETS.find(p=>p.id==='exit');
 if((sim?.crushed||0)>0)return NAV_TARGETS.find(p=>p.id==='vehicle');
 if((sim?.gateHits||0)>0)return NAV_TARGETS.find(p=>p.id==='crusher');
 const id=(sim?.player?.z??-47)<-42?'ore':'gate';
 return NAV_TARGETS.find(p=>p.id===id);
}
/** Topological path: a segment is never allowed to cut across ice.
 * Player -> near bridge approach -> far bridge exit -> selected destination.
 */
export function navigationPath(from,target,terrain){
 const route=[{x:from.x,z:from.z}];
 if(terrain?.rivers){
  const forward=target.z>=from.z;
  const rivers=[...terrain.rivers].sort((a,b)=>forward?a.zMin-b.zMin:b.zMin-a.zMin);
  for(const r of rivers){
   const south=r.zMin,north=r.zMax;
   if(forward){
    if(from.z>=north||target.z<=south)continue;
    if(from.z<south)route.push({x:r.x,z:south-1.6});
    if(target.z>north)route.push({x:r.x,z:north+1.6});
    else route.push({x:r.x,z:(south+north)/2});
   }else{
    if(from.z<=south||target.z>=north)continue;
    if(from.z>north)route.push({x:r.x,z:north+1.6});
    if(target.z<south)route.push({x:r.x,z:south-1.6});
    else route.push({x:r.x,z:(south+north)/2});
   }
  }
 }
 route.push({x:target.x,z:target.z});
 return route;
}
export function worldToMap(x,z,width,height){
 const b=LONG_MAP.bounds,margin=6;
 const scale=Math.min((width-2*margin)/(b.maxX-b.minX),(height-2*margin)/(b.maxZ-b.minZ));
 return {x:width/2+(x-(b.minX+b.maxX)/2)*scale,
  y:height/2-(z-(b.minZ+b.maxZ)/2)*scale};
}
export function drawNavigation(ctx,sim,world,choice='auto'){
 if(!ctx||!sim||!world||world.stage!==0)return null;
 const canvas=ctx.canvas,w=canvas.width,h=canvas.height;
 const p=sim.player;
 // A manually selected next-level entrance cannot suggest crossing the
 // northern river before the bridge has actually been paid for.
 let target=navigationGoal(sim,choice);
 if(target.id==='exit'&&!(sim.tracks.exit.level>0))
  target=NAV_TARGETS.find(s=>s.id==='exitPad');
 const path=navigationPath(p,target,world.terrain);
 ctx.clearRect(0,0,w,h);
 ctx.fillStyle='#162333';ctx.fillRect(0,0,w,h);
 const baseA=worldToMap(LONG_MAP.bounds.minX,LONG_MAP.bounds.maxZ,w,h);
 const baseB=worldToMap(LONG_MAP.bounds.maxX,LONG_MAP.bounds.minZ,w,h);
 ctx.fillStyle='#b49a76';
 ctx.fillRect(baseA.x,baseA.y,baseB.x-baseA.x,baseB.y-baseA.y);
 for(const r of world.terrain?.rivers||[]){
  const nw=worldToMap(LONG_MAP.bounds.minX,r.zMax,w,h);
  const se=worldToMap(LONG_MAP.bounds.maxX,r.zMin,w,h);
  ctx.fillStyle='#7cb6d1';ctx.fillRect(nw.x,nw.y,se.x-nw.x,se.y-nw.y);
  if(r.width>0){
   const a=worldToMap(r.x-r.width/2,r.zMax,w,h);
   const b=worldToMap(r.x+r.width/2,r.zMin,w,h);
   ctx.fillStyle='#e3c990';ctx.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);
  }
 }
 // Only a handful of small 2D markers. They do not stand in for resources.
 for(const site of NAV_TARGETS){
  const q=worldToMap(site.x,site.z,w,h);
  ctx.beginPath();ctx.arc(q.x,q.y,site.id==='exit'?3:2,0,2*Math.PI);
  ctx.fillStyle=site.id==='crusher'?'#f3a35c':site.id==='gate'?'#9e7cff':'#384d57';
  ctx.fill();
 }
 ctx.beginPath();
 path.forEach((site,i)=>{
  const q=worldToMap(site.x,site.z,w,h);
  if(i===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y);
 });
 ctx.strokeStyle='#fff5a8';ctx.lineWidth=1.8;ctx.setLineDash([4,3]);ctx.stroke();ctx.setLineDash([]);
 const dest=worldToMap(target.x,target.z,w,h);
 ctx.beginPath();ctx.arc(dest.x,dest.y,5,0,2*Math.PI);
 ctx.strokeStyle='#ffe66b';ctx.lineWidth=2;ctx.stroke();
 const cursor=worldToMap(p.x,p.z,w,h);
 // headingBasis: yaw=0 faces world -Z, yaw=PI faces +Z.
 const angle=p.yaw||0;
 const dx=Math.sin(angle),dy=Math.cos(angle);
 ctx.beginPath();
 ctx.moveTo(cursor.x+dx*6,cursor.y+dy*6);
 ctx.lineTo(cursor.x-dy*3-dx*3,cursor.y+dx*3-dy*3);
 ctx.lineTo(cursor.x+dy*3-dx*3,cursor.y-dx*3-dy*3);
 ctx.closePath();ctx.fillStyle='#ffffff';ctx.fill();
 return {target,distance:Math.hypot(target.x-p.x,target.z-p.z),path};
}
