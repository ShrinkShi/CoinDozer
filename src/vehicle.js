import {flashIntensity} from './flash.js';
import {particleHalfHeight} from './granular.js';
import {headingBasis,modelYaw} from './heading.js';
import {TRACK_LINKS,trackLinkPose,vehicleVisualStyle} from './vehicleRig.js';
/* Procedural bulldozer and collectables derived from observations of the ad footage.
 * Geometry is authored here rather than importing the advertised game's assets.
 */
const RUBBER=[.105,.121,.121,5],RUBBER_EDGE=[.18,.21,.21,5];
const STEEL=[.37,.42,.41,4],STEEL_LIGHT=[.66,.69,.65,4];
const YELLOW=[1.0,.69,.065,4],YELLOW_LIT=[1,.81,.17,4],YELLOW_DARK=[.75,.44,.037,4];
export function renderVehicle(renderer,player,t,baseY=0){
 const {x,z,yaw}=player,visual=vehicleVisualStyle(player);
 const level=visual.level,advanced=level>=2,upgraded=level>=1;
 const size=visual.scale,bladeScale=visual.bladeScale;
 const bladeLift=Math.min(.07,Math.max(0,player.bladeBounce||0));
 const blade=level>=4?[.99,.82,.17,4]:level>=3?[.70,.39,.91,4]:advanced?[.24,.69,.82,4]:YELLOW;
 const bladeEdge=level>=4?[.66,.47,.12,4]:level>=3?[.37,.18,.63,4]:advanced?[.11,.42,.54,4]:YELLOW_DARK;
 const hood=level>=4?[.24,.28,.34,4]:level>=3?[.23,.44,.76,4]:advanced?[.92,.44,.25,4]:YELLOW;
 const {fx,fz,rx,rz}=headingBasis(yaw);
 function part(mesh,lx,ly,lz,sx,sy,sz,color,a=0,p=0,roll=0,opacity=1){
  // Match the movement/physical blade convention: local -Z is FORWARD.
  const xx=x+(lx*rx-lz*fx)*size,zz=z+(lx*rz-lz*fz)*size;
  renderer.add(mesh,xx,ly*size+baseY,zz,sx*size,sy*size,sz*size,color,modelYaw(yaw)+a,p,roll,opacity);
 }
 part('shadow',0,.093,.32,6.3,1,6.9,[0,0,0,8]);
 function bladePart(mesh,lx,ly,lz,sx,sy,sz,color,a=0,p=0,roll=0,opacity=1){
  // Blade motion follows contact damping, less than 7 cm from collision shell.
  part(mesh,lx*bladeScale,ly+bladeLift,lz,sx*bladeScale,sy,sz,color,a,p,roll,opacity);
 }
 // Real extruded rounded caterpillar belt rather than two dark rectangular blocks.
 for(const side of [-1,1]){
  const xx=side*.99;
  part('track',xx,.55,.49,visual.trackWidth,1.03,1.10,RUBBER);
  part('track',xx,.57,.49,.46,.70,.86,RUBBER_EDGE);
  const beltDistance=side<0?(player.trackLeft||0):(player.trackRight||0);
  // Each shoe travels the same rounded-belt loop; not a moving texture.
  // The bottom branch advances opposite to forward chassis motion.
  for(let j=0;j<TRACK_LINKS;j++){
   const link=trackLinkPose(beltDistance,j);
   part('box',xx,.55+link.y,.49+link.z,visual.trackWidth+.07,.12,.19,
    j%4===0?RUBBER_EDGE:RUBBER,0,link.pitch);
  }
  for(const [wheelIndex,zz] of [-.55,.48,1.43].entries()){
   part('cylinder',side*1.395,.55,zz,.68,.27,.68,[.87,.61,.10,4],0,0,Math.PI/2);
   part('cylinder',side*1.54,.55,zz,.31,.28,.31,STEEL,0,0,Math.PI/2);
   const rotation=beltDistance/.43+wheelIndex*.45;
   part('sphere',side*1.72,.55+Math.sin(rotation)*.16,zz+Math.cos(rotation)*.16,
    .095,.095,.095,YELLOW_LIT);
  }
  part('box',side*.94,.89,.54,.68,.125,2.25,[.25,.28,.27,5]);
 }
 // Chassis armour grows by level; independent movement upgrades add their
 // own mechanically legible parts rather than recolouring the same mesh.
 if(level>=1){
  for(const side of [-1,1])part('box',side*1.22,1.03,.36,.13,.30,2.40,YELLOW_DARK);
 }
 if(level>=2){
  part('box',0,1.36,1.06,1.55,.14,1.47,STEEL_LIGHT);
  for(const side of [-1,1])part('box',side*1.25,1.04,1.10,.16,.38,1.35,hood);
 }
 if(level>=3){
  for(const side of [-1,1]){
   part('box',side*.72,2.37,1.08,.13,1.23,.13,STEEL);
   part('box',side*.72,2.38,-.08,.13,1.20,.13,STEEL);
  }
  part('box',0,2.97,.52,1.75,.15,1.6,hood);
 }
 if(level>=4){
  for(const side of [-1,1]){
   part('box',side*1.28,1.50,-.60,.22,.23,1.54,bladeEdge);
   part('sphere',side*1.31,1.56,-1.31,.27,.27,.27,YELLOW_LIT);
  }
 }
 // Articulated chassis, engine bonnet, and sloped front cover.
 part('box',0,.88,.65,1.73,.64,2.45,hood);
 part('box',0,1.16,-.47,1.48,.51,1.22,hood);
 part('box',0,1.39,-.85,1.50,.11,.65,YELLOW_LIT);
 part('box',0,.78,-.94,1.62,.24,.44,YELLOW_DARK);
 for(let i=-2;i<=2;i++)part('box',i*.19,1.02,-1.185,.055,.20,.037,RUBBER);
 part('box',0,1.0,1.89,1.6,.48,.90,STEEL);
 part('box',0,1.0,2.31,1.15,.50,.28,RUBBER_EDGE);
 // Rounded rear tank is visually distinct in the later ad cuts.
 if(upgraded){
  part('cylinder',0,1.34,1.63,1.37,1.61,1.37,[.87,.22,.19,4],0,0,Math.PI/2);
  for(const zz of [1.18,2.06])part('cylinder',0,1.35,zz,1.41,.17,1.43,STEEL,0,0,Math.PI/2);
  part('box',0,1.84,1.64,.57,.20,.53,[1,.47,.37,4]);
 }else{
  part('box',0,1.31,1.72,.68,.51,.58,YELLOW_DARK);
 }
 // Open driver's station with green figure and steering wheel.
 part('box',0,1.42,.50,.69,.14,.75,STEEL);
 part('box',0,1.65,.77,.74,.77,.67,[.44,.53,.11,4]);
 part('box',0,1.92,.37,.58,.57,.54,[.64,.78,.20,4]);
 part('sphere',0,2.29,.22,.66,.66,.63,[.65,.94,.16,4]);
 part('box',0,2.18,-.015,.70,.13,.23,[.93,.80,.30,4]);
 part('box',-.48,1.90,.21,.23,.42,.30,hood);
 part('box',.48,1.90,.21,.23,.42,.30,hood);
 part('cylinder',0,1.58,-.12,.65,.09,.65,RUBBER,0,.65,0);
 part('box',0,1.18,-.46,.55,.08,.42,STEEL);
 // Exhaust with hollow dark top, hydraulic booms mounted to sidewalls.
 part('cylinder',.68,1.92,1.02,.25,1.31,.25,STEEL);
 part('cylinder',.68,2.61,1.02,.33,.13,.33,RUBBER);
 for(const side of [-1,1]){
  part('box',side*.81,.93,-1.22,.27,.31,1.93,YELLOW_DARK);
  part('cylinder',side*1.05,1.09,-1.66,.25,1.22,.25,STEEL,0,.35,Math.PI/2);
  part('cylinder',side*1.07,1.10,-1.89,.12,.82,.14,STEEL_LIGHT,0,.35,Math.PI/2);
  part('sphere',side*1.12,1.00,-2.17,.22,.22,.22,[.36,.40,.41,4]);
 }
 // Every non-chassis track now changes the machine silhouette as it upgrades.
 for(let tier=0;tier<visual.speed;tier++){
  const rear=1.12+tier*.30;
  part('box',0,1.88,rear,1.24,.085,.10,STEEL_LIGHT);
  part('box',0,1.97,rear,.90,.085,.09,RUBBER);
 }
 if(visual.speed>=2){
  part('cylinder',-.64,1.93,1.12,.24,1.05,.24,STEEL);
  part('cylinder',-.64,2.47,1.12,.33,.10,.33,RUBBER);
 }
 for(let tier=0;tier<visual.steering;tier++){
  const sign=tier%2?-1:1,front=-.76-Math.floor(tier/2)*.39;
  part('cylinder',sign*1.29,.95,front,.16,.38,.16,STEEL_LIGHT);
  part('sphere',sign*1.29,1.16,front,.23,.23,.23,YELLOW_LIT);
 }
 if(visual.coin){
  // Visible gold-valuing module; each tier adds a coin-shaped collector.
  for(let tier=0;tier<visual.coin;tier++){
   const row=tier%2,depth=Math.floor(tier/2);
   part('coin',-.35+row*.70,2.01+depth*.14,1.71,.38,.22,.38,[1,.76,.09,7]);
  }
 }
 // v0.2: actual concave bucket shell, with dedicated sideplates, bolted upper rim
 // and a sharp scraper lip. Its silhouette is modelled in 3D and is visible at any yaw.
 bladePart('scoop',0,0,0,1,1,1,blade);
 for(const side of [-1,1]){
  bladePart('cheek',side*1.97,0,0,.23,1,1,bladeEdge);
  bladePart('box',side*1.96,.22,-2.56,.28,.17,.72,blade);
  bladePart('cylinder',side*1.99,1.23,-1.63,.19,.25,.19,STEEL_LIGHT,0,0,Math.PI/2);
 }
 bladePart('box',0,1.40,-1.72,4.03,.13,.22,YELLOW_LIT);
 bladePart('box',0,.17,-2.79,4.02,.075,.30,STEEL_LIGHT);
 bladePart('box',0,.14,-2.94,3.94,.040,.11,bladeEdge);
 for(const side of [-1,1])bladePart('box',side*1.45,1.43,-1.72,.12,.10,.27,STEEL);
 if(level>=3){
  part('box',0,2.03,1.36,2.08,.13,1.00,bladeEdge);
  part('box',0,2.15,1.19,1.55,.16,.2,STEEL_LIGHT);
  for(const side of [-1,1]){
   part('cylinder',side*.62,2.04,1.55,.25,.9,.25,STEEL);
   part('sphere',side*.67,2.52,1.60,.26,.26,.26,blade);
  }
 }
 if(level>=4){
  part('box',0,1.48,-.8,1.9,.22,1.1,[.92,.68,.15,4]);
  for(const side of [-1,1])part('box',side*2.02,1.03,-1.62,.24,1.45,.21,bladeEdge);
 }
 // Physical scraper teeth become denser on the blade upgrade route.
 if(visual.blade>0){
  const teeth=4+visual.blade*2;
  for(let i=0;i<teeth;i++){
   const u=teeth===1?0:i/(teeth-1),lx=(u-.5)*3.72;
   bladePart('box',lx,.105,-2.94,.095,.11,.25,STEEL_LIGHT);
  }
 }
 const upgradeAge=t-(player.upgradeFlashAt??-50);
 if(upgradeAge>=0&&upgradeAge<1.05){
  const strength=1-upgradeAge/1.05;
  for(const side of [-1,1]){
   part('sphere',side*1.40,1.95,-1.37,.19+strength*.28,.19+strength*.28,
    .19+strength*.28,[1,.93,.40,4]);
  }
  part('sphere',0,2.91,.55,.16+strength*.4,.16+strength*.4,
   .16+strength*.4,[1,.95,.54,4]);
 }
}

export function renderTreads(renderer,treads,stage){
 const c=stage?[.19,.21,.20,5]:[.29,.19,.14,5];
 for(const q of treads){
  if(typeof renderer.visible==='function'&&!renderer.visible(q.x,.1,q.z,.09))continue;
  renderer.add('box',q.x,.071,q.z,.22,.021,.155,c,modelYaw(q.a)+.15);
  renderer.add('box',q.x-Math.sin(q.a)*.11,.071,q.z+Math.cos(q.a)*.11,.17,.022,.07,c,modelYaw(q.a)-.24);
 }
}
/**
 * Culls by the actual orthographic clip volume, not a fixed giant rectangle.
 * Every visible resource is still one independent coin/ore mesh; distant
 * assets may use fewer triangles, never a combined count or impostor pile.
 */
export function renderResources(renderer,resources,time,cam,stage=0){
 let drawn=0;
 const quality=renderer.quality||{detailDistance:22,shadowDistance:23};
 const detail2=quality.detailDistance**2,shadow2=quality.shadowDistance**2;
 for(const p of resources){
  if(p.dead)continue;
  const dy=p.y||0;
  if(typeof renderer.visible==='function'){
   if(!renderer.visible(p.x,dy+.45,p.z,.16))continue;
  }else if(Math.abs(p.x-cam.x)>38||Math.abs(p.z-cam.z)>46)continue;
  const d2=(p.x-cam.x)**2+(p.z-cam.z)**2,near=d2<=detail2;
  const y=.12+dy,spin=p.spin||0;
  const flash=p.flashStartedAt===undefined?0:flashIntensity(time-p.flashStartedAt);
  if(p.kind!=='pearl'&&d2<=shadow2)
   renderer.add('shadow',p.x,.079,p.z,p.kind==='gold'?.83:.94,1,p.kind==='gold'?.83:.94,[0,0,0,8]);
  switch(p.kind){
   case 'blue':
    renderer.add(near?'sphere':'sphereLite',p.x,y+.27,p.z,.68,.68,.68,[.046,.49,.94,9+flash*.25],spin*.22,spin*.32,spin*.19);
    break;
   case 'gold':{
    const half=particleHalfHeight(p);
    renderer.add(near?'coin':'coinLite',p.x,dy+.052+half,p.z,.70,near?.70:.40,.70,
      [1,.73,.024,7+flash*.25],p.angle||0,p.tiltX||0,p.tiltZ||0);
    break;
   }
   case 'pearl':
    renderer.add(near?'sphere':'sphereLite',p.x,y+.39,p.z,.87,.88,.86,
      stage===1?[.58+flash*.4,.85+flash*.15,1,4]:[.99+flash*.01,.71+flash*.29,.81+flash*.19,4]);
    if(near)renderer.add('sphere',p.x-.18,y+.66,p.z-.15,.22,.17,.22,
      stage===1?[.95,.99,1,4]:[1,.96,.95,4]);
    break;
   case 'ingot':
    renderer.add('box',p.x,y+.27,p.z,.49,.34,1.32,[.99,.73,.15,7+flash*.25],spin);
    if(near)renderer.add('box',p.x,y+.46,p.z,.39,.08,1.16,[1,.86,.25,7+flash*.25],spin);
    break;
   default:renderer.add(near?'sphere':'sphereLite',p.x,y+.4,p.z,.86,.85,.86,[.23,.88,.52,4]);break;
  }
  drawn++;
 }
 return drawn;
}
