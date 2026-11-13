import {particleHalfHeight} from './granular.js';
import {headingBasis,modelYaw} from './heading.js';
/* Procedural bulldozer and collectables derived from observations of the ad footage.
 * Geometry is authored here rather than importing the advertised game's assets.
 */
const RUBBER=[.105,.121,.121,5],RUBBER_EDGE=[.18,.21,.21,5];
const STEEL=[.37,.42,.41,4],STEEL_LIGHT=[.66,.69,.65,4];
const YELLOW=[1.0,.69,.065,4],YELLOW_LIT=[1,.81,.17,4],YELLOW_DARK=[.75,.44,.037,4];
export function renderVehicle(renderer,player,t){
 const {x,z,yaw,level}=player;
 const advanced=level>=2,upgraded=level>=1;
 const blade=advanced?[.24,.69,.82,4]:YELLOW;
 const bladeEdge=advanced?[.11,.42,.54,4]:YELLOW_DARK;
 const hood=advanced?[.92,.44,.25,4]:YELLOW;
 const {fx,fz,rx,rz}=headingBasis(yaw);
 function part(mesh,lx,ly,lz,sx,sy,sz,color,a=0,p=0,roll=0,opacity=1){
  // Match the movement/physical blade convention: local -Z is FORWARD.
  const xx=x+lx*rx-lz*fx,zz=z+lx*rz-lz*fz;
  renderer.add(mesh,xx,ly,zz,sx,sy,sz,color,modelYaw(yaw)+a,p,roll,opacity);
 }
 part('shadow',0,.093,.32,6.3,1,6.9,[0,0,0,8]);
 // Real extruded rounded caterpillar belt rather than two dark rectangular blocks.
 for(const side of [-1,1]){
  const xx=side*.99;
  part('track',xx,.55,.49,.77,1.03,1.10,RUBBER);
  part('track',xx,.57,.49,.46,.70,.86,RUBBER_EDGE);
  for(const zz of [-.55,.48,1.43]){
   part('cylinder',side*1.395,.55,zz,.68,.27,.68,[.87,.61,.10,4],0,0,Math.PI/2);
   part('cylinder',side*1.54,.55,zz,.31,.28,.31,STEEL,0,0,Math.PI/2);
  }
  // Offset rubber shoes around each track. These are visible individually in close shots.
  for(let j=-6;j<=6;j++){
   const tz=.48+j*.204;
   part('box',side*.99,.124,tz,.81,.115,.125,RUBBER_EDGE);
   part('box',side*.99,.981,tz,.81,.08,.125,RUBBER);
  }
  part('box',side*.94,.88,.54,.68,.125,2.25,[.25,.28,.27,5]);
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
 // v0.2: actual concave bucket shell, with dedicated sideplates, bolted upper rim
 // and a sharp scraper lip. Its silhouette is modelled in 3D and is visible at any yaw.
 part('scoop',0,0,0,advanced?1.11:1,1,1,blade);
 for(const side of [-1,1]){
  part('cheek',side*1.97,0,0,.23,1,1,bladeEdge);
  part('box',side*1.96,.22,-2.56,.28,.17,.72,blade);
  part('cylinder',side*1.99,1.23,-1.63,.19,.25,.19,STEEL_LIGHT,0,0,Math.PI/2);
 }
 part('box',0,1.40,-1.72,4.03,.13,.22,YELLOW_LIT);
 part('box',0,.17,-2.79,4.02,.075,.30,STEEL_LIGHT);
 part('box',0,.14,-2.94,3.94,.040,.11,bladeEdge);
 for(const side of [-1,1])part('box',side*1.45,1.43,-1.72,.12,.10,.27,STEEL);
}
export function renderTreads(renderer,treads,stage){
 const c=stage?[.19,.21,.20,5]:[.29,.19,.14,5];
 for(const q of treads){
  renderer.add('box',q.x,.071,q.z,.22,.021,.155,c,modelYaw(q.a)+.15);
  renderer.add('box',q.x-Math.sin(q.a)*.11,.071,q.z+Math.cos(q.a)*.11,.17,.022,.07,c,modelYaw(q.a)-.24);
 }
}
export function renderResources(renderer,resources,time,cam){let count=0;
 for(const p of resources){
  if(p.dead||Math.abs(p.x-cam.x)>38||Math.abs(p.z-cam.z)>46)continue;
  const y=.12+p.y,spin=p.spin||0;
  if(p.kind!=='pearl')renderer.add('shadow',p.x,.079,p.z,p.kind==='gold'?.83:.94,1,p.kind==='gold'?.83:.94,[0,0,0,8]);
  switch(p.kind){
   case 'blue':{
    // A single shaded ball with view-independent shell markings. Avoid four
    // overlapping meshes per orb, which is expensive on mobile GPUs.
    renderer.add('sphere',p.x,y+.27,p.z,.68,.68,.68,[.046,.49,.94,9],spin*.22,spin*.32,spin*.19);
    break;
   }
   case 'gold':{
    // One stamped coin mesh, including raised rim and face marks, rotating as
    // a rigid-looking body. The centre follows the solver's tilt-aware support.
    const half=particleHalfHeight(p);
    renderer.add('coin',p.x,p.y+.052+half,p.z,.70,.70,.70,
      [1,.73,.024,7],p.angle||0,p.tiltX||0,p.tiltZ||0);
    break;
   }
   case 'pearl':
    renderer.add('sphere',p.x,y+.39,p.z,.87,.88,.86,[.99,.71,.81,4]);
    renderer.add('sphere',p.x-.18,y+.66,p.z-.15,.22,.17,.22,[1,.96,.95,4]);break;
   case 'ingot':
    renderer.add('box',p.x,y+.27,p.z,.49,.34,1.32,[.99,.73,.15,7],spin);
    renderer.add('box',p.x,y+.46,p.z,.39,.08,1.16,[1,.86,.25,7],spin);break;
   default:renderer.add('sphere',p.x,y+.4,p.z,.86,.85,.86,[.23,.88,.52,4]);break;
  }
  count++;
 }
 return count;
}
