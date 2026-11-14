import {rnd,clamp,TAU} from './math.js';
import {renderVehicle} from './vehicle.js';
import {MAX_VEHICLE_LEVEL} from './economy.js';
export const PALETTE={
 dirt:[.55,.372,.288,6],dirtLight:[.64,.451,.342,6],dirtEdge:[.38,.246,.185,6],rock:[.64,.437,.314],rockLight:[.70,.504,.362],rockShade:[.48,.318,.238],bridge:[.93,.615,.332],bridgeSide:[.65,.36,.18],yellow:[.98,.69,.075],gold:[1,.74,.06],goldDark:[.74,.37,.035],metal:[.32,.36,.36],black:[.12,.092,.084],blue:[.11,.64,.97],blueLight:[.40,.85,1],purple:[.42,.16,.71],purpleCap:[.46,.24,.79],orange:[.98,.33,.10],glass:[.68,.60,.92],mint:[.11,.90,.83],pearl:[1,.77,.90],white:[.97,.99,1],gray:[.35,.39,.39]};
function seeded(seed=123){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296}}
export class World{
 constructor(stage=0){this.stage=stage;this.static=[];this.sites={};this.gates=[];this.gateStations=[];this.crusher={x:12,z:7.2,halfWidth:2.65,halfDepth:1.12};this.upgradeStation=null;this.rng=seeded(stage?337:20261102);this.make(stage);}
 n(a,b){return a+(b-a)*this.rng()}
 add(mesh,x,y,z,sx,sy,sz,c,yaw=0,pitch=0,roll=0,opacity=1){this.static.push({mesh,x,y,z,sx,sy,sz,c,yaw,pitch,roll,opacity})}
 addRock(x,z,scale=1,c){let r=this.n(.86,1.18)*scale,co=c||PALETTE.rock;this.add('shadow',x,.090,z,r*2.8,1,r*2.2,[0,0,0,8]);this.add('boulder',x,r*.65,z,r*1.6,r*1.3,r*1.65,co,this.n(0,TAU));this.add('boulder',x+r*.46,r*.45,z-r*.6,r*.85,r*.85,r*.77,PALETTE.rockShade,this.n(0,TAU))}
 borderRocks(pink=false){let C=pink?[[.58,.4,.53],[.66,.46,.60],[.70,.54,.67]]:[PALETTE.rock,PALETTE.rockLight,PALETTE.rockShade];for(let i=0;i<48;i++){let x=-32+i*1.37+this.n(-.7,.7);this.addRock(x,-29+this.n(-2.4,2.4),this.n(1.0,2.1),C[i%3]);}for(let i=0;i<34;i++){let z=-28+i*1.6;this.addRock(-34+this.n(-2.5,1.5),z,this.n(.7,2),C[i%3]);this.addRock(34+this.n(-1.3,2.2),z,this.n(.8,1.7),C[(i+1)%3])}for(let i=0;i<28;i++){let x=-31+i*2.4;this.addRock(x,30+this.n(-.8,2.7),this.n(.8,2.3),C[i%3])}}
 make(stage){if(stage===1){this.makeBonus();return}
 this.add('box',0,-.92,0,71,1.8,64,PALETTE.dirtEdge);
 this.add('box',0,-.055,0,69,.2,61,PALETTE.dirt);
 // Bare, soft tan-brown excavation ground; no grass, no checkerboard.
 for(let i=0;i<36;i++){let x=this.n(-28,29),z=this.n(-22,27);if(Math.abs(x)<12&&z>0&&z<15)continue;this.add('box',x,.051,z,this.n(.2,.6),.008,this.n(.7,1.6),[.56,.374,.29,6],this.n(-2,2))}
 this.borderRocks(false);
 // Oblique molten river behind the collectable area, bright swirling molten texture.
 this.add('river',-17,.124,-14.2,37,1,8.6,[.21,.062,.026],-.24);
 this.add('river',-17,.135,-14.2,35.4,1,7.7,[1,.4,.12,2],-.24);
 for(let i=0;i<26;i++){let x=-31+i*1.2,z=-14.2+(x+17)*-.24;this.add('box',x,.15,z+this.n(-3,3),this.n(.25,1.15),.045,this.n(.15,.42),[1,.69,.22,3],this.n(-.6,.6))}
 // Wooden bridge across the lava: individual warm-colored planks and long railing-free edge.
 for(let k=0;k<16;k++){let x=-23.6+k*.70,z=-14.5-(x+17)*.24;this.add('box',x,.39,z,.64,.22,9.45,k%3?[.91,.58,.29]:[.97,.66,.35],-.24);this.add('box',x,.51,z-4.53,.62,.06,.18,[.41,.22,.105],-.24)}
 this.add('box',-18.2,.16,-14.2,11,.12,9,PALETTE.bridgeSide,-.24);
 // The lavender ×10 fabric gate, orange posts with purple heads and violet cloud.
 this.sites.gates=[];this.sites.gateCosts=[];
 for(const [id,factor,x] of [[0,2,-8.4],[1,2,-2.8],[2,2,2.8],[3,2,8.4]]){
  const gate={id,x,z:3.1,half:2.18,multiplier:factor};
  this.gates.push(gate);this.frameGate(gate);
  const pad={id,x,z:-4.65,vehicleRadius:4.6,depositHalfX:1.45,depositHalfZ:.75};
  this.gateStations.push(pad);
  this.add('box',x,.16,-4.65,3.35,.24,1.95,[.95,.64,.07]);
  this.add('box',x,.31,-4.65,2.95,.12,1.45,PALETTE.black);
  for(const side of [-1,1])this.add('box',x+side*1.61,.35,-4.65,.12,.22,1.8,PALETTE.mint);
  this.sites.gateCosts.push({id,x,y:.52,z:-4.65});
 }
 // Purple uprights and orange brush/rotating hazard, next to the gold pile.
 this.crusher={x:12,z:7.2,halfWidth:2.65,halfDepth:1.12};
 for(let x of [9.6,14.4]){this.add('cylinder',x,1.9,7.2,.69,3.8,.69,PALETTE.purpleCap);this.add('sphere',x,3.91,7.2,1.04,1.05,1.04,PALETTE.purpleCap);this.add('box',x,.18,7.2,1.1,.34,1.18,PALETTE.purple)}
 this.add('box',12,3.55,7.2,5.25,.44,.65,PALETTE.purple);
 // Black counting strip with fluorescent yellow rim and large white counter.
 this.add('box',-13.6,.15,-20.6,6.6,.23,18,[1,.80,.05]);this.add('box',-13.6,.25,-20.6,6,.14,17.5,PALETTE.black);
 this.sites.counter={x:-13.6,y:.54,z:-17.3};
 // Transparent pink storage box near the count strip. Internal pearls are modeled as resources.
 this.add('box',-20.1,.33,-26,7.2,.32,6.1,[.53,.33,.51]);
 for(const x of [-23.6,-16.5]){this.add('box',x,2.7,-26,.10,5.2,6,PALETTE.white,0,0,0,.36)}
 for(const z of [-29,-23]){this.add('box',-20.1,2.7,z,7.1,5.2,.09,PALETTE.white,0,0,0,.24)}
 for(let x of [-23.55,-16.5])for(let z of [-29,-23])this.add('box',x,2.6,z,.12,5.25,.12,PALETTE.white);
 for(let x of [-23.55,-16.5]){this.add('box',x,5.2,-26,.11,.12,6.1,PALETTE.white)}
 for(let z of [-29,-23]){this.add('box',-20.05,5.2,z,7.2,.12,.10,PALETTE.white)}
 // Purple ramp and cyan translucent UPGRADE board; rigid white bulldozer statue.
 this.sites.upgrade={x:19,y:0,z:-18};
 this.upgradeStation={x:19,z:-12.05,vehicleRadius:6.5,depositHalfX:4.1,depositHalfZ:1.3,previewX:19,previewZ:-20.3};
 this.add('box',19,.12,-19,10.6,.25,10.5,PALETTE.purple);
 this.add('box',19,.28,-20,9.0,.25,7.5,[.36,.12,.56]);
 this.add('box',19.1,2.8,-24.65,10.4,5.2,.15,PALETTE.mint,0,0,0,.55);
 // Cost plate: the 2500 decreases one unit per pushed coin (observed 2494).
 this.add('box',19,.15,-12.1,8.4,.18,2.45,[.08,.07,.08]);
 this.add('box',15.9,.20,-18.8,1.0,.10,8.3,[1,.75,.07]);
 this.sites.cost={x:19,y:.48,z:-12.05};this.sites.upgradeText={x:19.1,y:5.7,z:-24.7};
 // The next real bulldozer model is parked on this pedestal at runtime.
 this.add('box',19,.47,-20.3,7.4,.17,6.1,[.63,.35,.78]);
 for(const x of [15.8,22.2])this.add('box',x,.56,-20.3,.15,.18,5.7,PALETTE.mint);
 // Scattered pebbles, coin glints, and soil bumps.
 for(let i=0;i<56;i++){let x=this.n(-27,27),z=this.n(-23,22);if(x>-2&&x<14&&z>-3&&z<14)continue;this.add('boulder',x,.14,z,this.n(.26,.62),this.n(.22,.46),this.n(.27,.64),i%3?PALETTE.rockShade:PALETTE.rockLight)}
 }
 frameGate(gate){const {x,z,half,multiplier,id}=gate;
  for(const side of [-1,1]){let px=x+side*half;
   this.add('box',px,1.68,z,.55,3.25,.68,[.97,.28,.12]);
   this.add('box',px,.20,z,.89,.40,.91,PALETTE.purple);
   this.add('box',px,3.51,z,.97,.65,.94,PALETTE.purpleCap);
   this.add('sphere',px,3.87,z,.78,.64,.76,PALETTE.purpleCap);
  }
  this.add('box',x,1.66,z,half*1.95,2.83,.085,PALETTE.glass,0,0,0,.34);
  this.sites.gates.push({id,x,y:1.85,z:z-.15,multiplier});
 }
 makeBonus(){this.add('box',0,-.92,0,68,1.8,64,[.25,.27,.28]);this.add('box',0,-.05,0,66,.2,61,[.43,.44,.41]);this.borderRocks(true);
 this.gates.push({id:4,x:-9,z:-8,half:5.1,multiplier:2});
 this.sites.gates=[{id:4,x:-9,y:1.6,z:-8,multiplier:2}];
 // Later quick-cut of the advertisement: long golden ingots, baby-blue steel blade and pink cave stones.
 for(const x of [-14.1,-3.9]){this.add('box',x,.13,-8,1.25,.32,1.25,PALETTE.purple);this.add('box',x,1.95,-8,1.1,3.7,1.05,[.99,.62,.31]);this.add('box',x,3.95,-8,1.38,.83,1.38,PALETTE.purpleCap)}
 this.add('box',-9,1.8,-8,10.5,3.2,.12,PALETTE.glass,0,0,0,.40);
 this.sites.gate2={x:-9,y:1.6,z:-8};
 this.sites.bonus={x:0,y:0,z:0};
 for(let j=0;j<4;j++)for(let i=0;i<7;i++){
  let x=-18+i*.67,z=-14-j*.55;this.add('cylinder',x,.36,z,.37,2.2,.37,[1,.75,.14],0,0,Math.PI/2);
 }
 for(let j=0;j<4;j++)for(let i=0;i<7;i++){
  let x=-5+i*.67,z=-2-j*.55;this.add('cylinder',x,.36,z,.37,2.2,.37,[.94,.64,.12],0,0,Math.PI/2)
 }
 }
 render(renderer,t,player){for(const o of this.static)renderer.add(o.mesh,o.x,o.y,o.z,o.sx,o.sy,o.sz,o.c,o.yaw,o.pitch,o.roll,o.opacity);
  if(this.stage===0){
   if(player && this.upgradeStation){
    const next=Math.min(MAX_VEHICLE_LEVEL,player.level+1);
    renderVehicle(renderer,{x:19,z:-20.3,yaw:Math.PI,level:next,bladeLevel:player.bladeLevel},t,.47);
    // Animated golden deposit slot on the rim of the payment area.
    renderer.add('box',19,.33+Math.sin(t*3)*.04,-12.05,7.7,.06,1.6,[1,.81,.08,3]);
   }
   // Soft animated volcanic mist, well below collectible height so it does not occlude play.
   for(let i=0;i<17;i++){const x=-31+i*1.68,z=-14.2+(x+17)*-.24+Math.sin(i*3.17)*1.7;
    const rise=(t*.45+i*.31)%2.8;
    renderer.add('sphere',x,.32+rise*.47,z,1.5+rise*.40,.49+rise*.18,1.2+rise*.50,[.86,.69,.59],0,0,0,.095*(1.-rise/3.1));
   }
   let c=this.crusher;
   for(let n=0;n<3;n++){
    let x=c.x+(n-1)*1.4;renderer.add('cylinder',x,1.52,c.z,.58,2.95,.58,[.75,.20,.07]);
    for(let row=0;row<9;row++)for(let k=0;k<8;k++){let a=k/8*TAU+t*3*(n%2?1:-1)+row*.33;renderer.add('cone',x+Math.cos(a)*.55,.47+row*.27,c.z+Math.sin(a)*.55,.35,.50,.38,[1,.37,.10],a,0,.55)}
   }
  }}
}
export function createResourceLayout(stage=0){let rng=seeded(stage?434:725),rand=(a,b)=>a+(b-a)*rng(),items=[];
 function pile(kind,cx,cz,count,rad,height=0){for(let i=0;i<count;i++){let a=rng()*TAU,r=Math.sqrt(rng())*rad,x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r,y=height*clamp(1-r/rad,0,1)*rand(.40,1.1);items.push({kind,x,z,y,settle:y,vx:0,vz:0,spin:rand(0,TAU),angle:rand(-.4,.4),passedGates:0,cooldown:0,dead:false})}}
 if(stage===0){pile('blue',0,-1.5,335,7.0,.55);pile('blue',5.7,7.1,75,4,.25);pile('blue',-17,-8.0,45,2.6,.1);
  pile('gold',17.2,4.0,540,5.4,1.25);pile('gold',7.4,-7.6,90,3.4,.28);pile('gold',-1,-17.7,30,4.5,.08);
  pile('pearl',-20.2,-26.1,18,2.3,.5);
 }else{pile('ingot',-13,-5,52,4.5,.4);pile('ingot',0,1.7,45,3,.1);pile('pearl',14,-17,22,3,.5)}
 return items;
}
