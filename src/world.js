import {rnd,clamp,TAU} from './math.js';
import {renderVehicle} from './vehicle.js';
import {MAX_VEHICLE_LEVEL,SUPPLY} from './economy.js';
import {boxTrigger} from './triggers.js';
import {sceneRules} from './sceneRules.js';
export const PALETTE={
 dirt:[.55,.372,.288,6],dirtLight:[.64,.451,.342,6],dirtEdge:[.38,.246,.185,6],rock:[.64,.437,.314],rockLight:[.70,.504,.362],rockShade:[.48,.318,.238],bridge:[.93,.615,.332],bridgeSide:[.65,.36,.18],yellow:[.98,.69,.075],gold:[1,.74,.06],goldDark:[.74,.37,.035],metal:[.32,.36,.36],black:[.12,.092,.084],blue:[.11,.64,.97],blueLight:[.40,.85,1],purple:[.42,.16,.71],purpleCap:[.46,.24,.79],orange:[.98,.33,.10],glass:[.68,.60,.92],mint:[.11,.90,.83],pearl:[1,.77,.90],white:[.97,.99,1],gray:[.35,.39,.39]};
function seeded(seed=123){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296}}
export class World{
 constructor(stage=0){this.stage=stage;this.static=[];this.obstacles=[];this.sites={};this.gates=[];this.gateStations=[];this.crusher={x:12,z:7.2,halfWidth:2.65,halfDepth:1.12};this.recycler=null;this.upgradeStation=null;this.rng=seeded(stage?337:20261102);this.make(stage);}
 n(a,b){return a+(b-a)*this.rng()}
 add(mesh,x,y,z,sx,sy,sz,c,yaw=0,pitch=0,roll=0,opacity=1){this.static.push({mesh,x,y,z,sx,sy,sz,c,yaw,pitch,roll,opacity})}
 addRock(x,z,scale=1,c){let r=this.n(.86,1.18)*scale,co=c||PALETTE.rock;this.add('shadow',x,.090,z,r*2.8,1,r*2.2,[0,0,0,8]);this.add('boulder',x,r*.65,z,r*1.6,r*1.3,r*1.65,co,this.n(0,TAU));this.obstacles.push({type:'circle',x,z,radius:r*.79,height:r*1.3});this.add('boulder',x+r*.46,r*.45,z-r*.6,r*.85,r*.85,r*.77,PALETTE.rockShade,this.n(0,TAU))}
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
  const gate={id,x,z:3.1,half:2.18,apertureHalf:1.93,multiplier:factor};
  this.gates.push(gate);this.frameGate(gate);
  // A separate gold-feed plate for EVERY gate. Physical coins are consumed
  // only when the vehicle pushes them onto this plate while in range.
  const trigger=boxTrigger(x,-4.65,1.45,.72,.32);
  const pad={id,x,z:-4.65,vehicleRadius:4.6,trigger,
   depositHalfX:trigger.halfX,depositHalfZ:trigger.halfZ};
  this.gateStations.push(pad);
  this.add('box',x,.16,-4.65,3.35,.24,1.95,[.95,.64,.07]);
  this.add('box',x,.31,-4.65,2.95,.12,1.45,PALETTE.black);
  for(const side of [-1,1])this.add('box',x+side*1.61,.35,-4.65,.12,.22,1.8,PALETTE.mint);
  this.sites.gateCosts.push({id,x,y:.52,z:-4.65});
 }
 // Purple uprights and orange brush/rotating hazard, next to the gold pile.
 this.crusher={x:12,z:7.2,halfWidth:2.65,halfDepth:1.12,
  trigger:boxTrigger(12,7.2,2.65,1.12,2.1)};
 // Tapered steel rails have matching visible meshes and solid footprints.
 const guide=(x1,z1,x2,z2)=>{
  const dx=x2-x1,dz=z2-z1,length=Math.hypot(dx,dz);
  this.add('box',(x1+x2)/2,.41,(z1+z2)/2,length,.78,.34,PALETTE.metal,-Math.atan2(dz,dx));
  this.obstacles.push({type:'segment',x1,z1,x2,z2,radius:.17,height:.8});
 };
 guide(7.2,10.05,10.2,8.55);
 guide(7.2,4.35,10.2,5.85);
 for(let x of [9.6,14.4]){this.add('cylinder',x,1.9,7.2,.69,3.8,.69,PALETTE.purpleCap);this.add('sphere',x,3.91,7.2,1.04,1.05,1.04,PALETTE.purpleCap);this.add('box',x,.18,7.2,1.1,.34,1.18,PALETTE.purple)}
 this.add('box',12,3.55,7.2,5.25,.44,.65,PALETTE.purple);
 // Black counting strip with fluorescent yellow rim and large white counter.
 this.recycler={trigger:boxTrigger(-13.6,-20.6,3,8.75,.34)};
 this.add('box',this.recycler.trigger.x,.15,this.recycler.trigger.z,6.6,.23,18,[1,.80,.05]);
 this.add('box',this.recycler.trigger.x,.25,this.recycler.trigger.z,
  this.recycler.trigger.halfX*2,.14,this.recycler.trigger.halfZ*2,PALETTE.black);
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
 const upgradeTrigger=boxTrigger(19,-12.05,4.1,1.2,.34);
 this.upgradeStation={x:19,z:-12.05,vehicleRadius:6.5,
  trigger:upgradeTrigger,depositHalfX:upgradeTrigger.halfX,depositHalfZ:upgradeTrigger.halfZ,
  previewX:19,previewZ:-20.3};
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
 for(let i=0;i<56;i++){let x=this.n(-27,27),z=this.n(-23,22);if(x>-2&&x<14&&z>-3&&z<14)continue;
  const sx=this.n(.26,.62),sy=this.n(.22,.46),sz=this.n(.27,.64);
  this.add('boulder',x,.14,z,sx,sy,sz,i%3?PALETTE.rockShade:PALETTE.rockLight);
  this.obstacles.push({type:'circle',x,z,radius:Math.min(sx,sz)*.43,height:.14+sy*.5});
 }
 }
 frameGate(gate){const {x,z,half,multiplier,id}=gate;
  const cave=this.stage===1;
  for(const side of [-1,1]){let px=x+side*half;
   this.add('box',px,1.68,z,.55,3.25,.68,cave?[.73,.32,.73,4]:[.97,.28,.12]);
   this.add('box',px,.20,z,.89,.40,.91,cave?[.48,.69,.79,4]:PALETTE.purple);
   this.add('box',px,3.51,z,.97,.65,.94,cave?[.92,.63,.83,4]:PALETTE.purpleCap);
   this.add('sphere',px,3.87,z,.78,.64,.76,cave?[.97,.79,.95,4]:PALETTE.purpleCap);
  }
  this.add('box',x,1.66,z,half*1.95,2.83,.085,cave?[.91,.63,.94]:PALETTE.glass,0,0,0,.34);
  this.sites.gates.push({id,x,y:1.85,z:z-.15,multiplier});
 }
 makeBonus(){
  // A fully playable second map. Geometric features are independent of lava
  // world data; interaction locations are defined here, not duplicated in physics.
  const R=sceneRules(1);
  this.add('box',0,-.94,0,71,1.8,64,[.23,.21,.29,6]);
  this.add('box',0,-.05,0,69,.2,61,[.43,.37,.47,6]);
  this.borderRocks(true);
  // Long crystalline seams and rock ribs sit outside the central push lanes.
  for(let i=0;i<44;i++){
   const side=i%2?-1:1;
   const x=side*(22.5+this.n(0,6)),z=this.n(-22,25);
   const height=this.n(1.1,3.4);
   const tint=i%4===0?[.97,.70,.89,4]:i%4===1?[.75,.42,.77,4]:
     i%4===2?[.97,.83,.96,4]:[.48,.73,.83,4];
   this.add('cone',x,height*.48,z,this.n(.75,1.5),height,this.n(.75,1.5),tint,
    this.n(0,TAU),this.n(-.17,.17));
  }
  for(let i=0;i<18;i++){
   const x=this.n(-23,23),z=this.n(-25,23);
   if(Math.abs(x)<18&&z>-18&&z<19)continue;
   this.addRock(x,z,this.n(.45,1),i%2?[.70,.43,.61]:[.55,.39,.60]);
  }
  // Two independently upgradeable, bidirectional crystal portals.
  this.sites.gates=[];this.sites.gateCosts=[];
  for(const [id,x] of [[0,-11.8],[1,4.5]]){
   const gate={id,x,z:-6.8,half:3.25,apertureHalf:2.97,multiplier:2};
   this.gates.push(gate);this.frameGate(gate);
   const trigger=boxTrigger(x,-14.45,2.22,.82,.35);
   this.gateStations.push({id,x,z:-14.45,vehicleRadius:5.6,
    trigger,depositHalfX:trigger.halfX,depositHalfZ:trigger.halfZ});
   this.add('box',x,.16,-14.45,4.86,.24,2.05,[.97,.77,.35]);
   this.add('box',x,.31,-14.45,trigger.halfX*2,.12,trigger.halfZ*2,PALETTE.black);
   for(const side of [-1,1]){
    this.add('box',x+side*2.32,.37,-14.45,.11,.28,1.96,PALETTE.mint);
   }
   this.sites.gateCosts.push({id,x,y:.55,z:-14.45});
  }
  // Pink crystal grinder. PEARLS -> exactly 3 physical gold INGOTS.
  this.crusher={x:13.0,z:7.2,halfWidth:2.75,halfDepth:1.17,
   trigger:boxTrigger(13.0,7.2,2.75,1.17,2.1)};
  const guide=(x1,z1,x2,z2)=>{
   const dx=x2-x1,dz=z2-z1,l=Math.hypot(dx,dz);
   this.add('box',(x1+x2)/2,.41,(z1+z2)/2,l,.78,.34,[.53,.59,.72,4],-Math.atan2(dz,dx));
   this.obstacles.push({type:'segment',x1,z1,x2,z2,radius:.17,height:.8});
  };
  guide(7.1,10.3,10.2,8.6);guide(7.1,4.0,10.2,5.78);
  for(const x of [10.1,15.9]){
   this.add('cylinder',x,1.95,7.2,.72,3.8,.72,[.66,.32,.79,4]);
   this.add('sphere',x,4.0,7.2,1.1,1.1,1.1,[.96,.68,.96,4]);
  }
  this.add('box',13,3.57,7.2,5.55,.42,.64,[.39,.76,.82,4]);
  // Deposit counter physically disposes surplus tokens only near belt surface.
  const recyclerTrigger=boxTrigger(-20,-20.8,3.1,5.8,.34);
  this.recycler={trigger:recyclerTrigger};
  this.add('box',-20,.15,-20.8,6.6,.24,12.2,[.95,.71,.31]);
  this.add('box',-20,.27,-20.8,recyclerTrigger.halfX*2,.14,
   recyclerTrigger.halfZ*2,PALETTE.black);
  this.sites.counter={x:-20,y:.57,z:-17.6};
  // An actual vehicle upgrade station. Same shared track progression as map 1.
  const upgradeTrigger=boxTrigger(20,-11.95,3.75,1.18,.35);
  this.upgradeStation={x:20,z:-11.95,vehicleRadius:6.0,
   trigger:upgradeTrigger,depositHalfX:upgradeTrigger.halfX,
   depositHalfZ:upgradeTrigger.halfZ,previewX:20,previewZ:-20.5};
  this.add('box',20,.12,-19.1,9.2,.24,10.2,[.53,.31,.62,4]);
  this.add('box',20,.28,-20.2,8.0,.22,7.2,[.71,.46,.77,4]);
  this.add('box',20,.15,-11.95,7.95,.22,2.38,[.97,.68,.26]);
  this.add('box',20,.29,-11.95,upgradeTrigger.halfX*2,.12,
   upgradeTrigger.halfZ*2,PALETTE.black);
  this.add('box',20,2.65,-24.4,9.3,4.9,.14,[.62,.95,.98,4],0,0,0,.45);
  this.sites.cost={x:20,y:.56,z:-11.95};
  this.sites.upgradeText={x:20,y:5.3,z:-24.5};
  this.add('box',20,.45,-20.5,7.0,.16,5.7,[.67,.43,.78,4]);
  for(const x of [17.0,23.0])this.add('box',x,.56,-20.5,.12,.17,5.1,PALETTE.mint);
  // Crystal ribs give depth without blocking the accessible ore-to-grinder route.
  for(let i=0;i<18;i++){
   const x=i%2?-18.3:25.5,z=-21+i*2.5;
   this.add('cone',x,1.25,z,.9,2.4,.9,[.96,.57,.81,4],i*.7);
   this.add('sphere',x,2.2,z,.28,.27,.28,[.99,.79,.92,4]);
  }
 }
 render(renderer,t,player){for(const o of this.static)renderer.add(o.mesh,o.x,o.y,o.z,o.sx,o.sy,o.sz,o.c,o.yaw,o.pitch,o.roll,o.opacity);
  if(this.stage===0||this.stage===1){
   if(player && this.upgradeStation){
    const next=Math.min(MAX_VEHICLE_LEVEL,player.level+1);
    renderVehicle(renderer,{x:this.upgradeStation.previewX,z:this.upgradeStation.previewZ,
      yaw:Math.PI,level:next,bladeLevel:player.bladeLevel,
      speedLevel:player.speedLevel,steeringLevel:player.steeringLevel,
      coinLevel:player.coinLevel},t,.47);
    // Animated golden deposit slot on the rim of the payment area.
    renderer.add('box',this.upgradeStation.x,.33+Math.sin(t*3)*.04,
      this.upgradeStation.z,this.upgradeStation.trigger.halfX*2-.15,.06,1.6,
      this.stage?[1,.75,.70,3]:[1,.81,.08,3]);
   }
   if(this.stage===1){
    const cosmeticStep=renderer.quality?.decorationStep||1;
    for(let i=0;i<16;i+=cosmeticStep){
     const x=(i%2?-1:1)*(22+i%4),z=-18+i*2.4;
     const y=.45+(t*.23+i*.17)%2.5;
     renderer.add('sphere',x,y,z,.32,.32,.32,[.95,.50,.76,4]);
    }
    const c=this.crusher;
    for(let n=0;n<3;n++){
     const x=c.x+(n-1)*1.47;
     renderer.add('cylinder',x,1.58,c.z,.60,2.88,.60,[.69,.32,.77,4]);
     for(let row=0;row<7;row+=cosmeticStep)for(let k=0;k<6;k+=cosmeticStep){
      const a=k/6*TAU+t*2.7*(n%2?1:-1)+row*.31;
      renderer.add('cone',x+Math.cos(a)*.58,.55+row*.28,
       c.z+Math.sin(a)*.58,.31,.48,.35,[.98,.69,.94,4],a);
     }
    }
    return;
   }
   // Soft animated volcanic mist, well below collectible height so it does not occlude play.
   const cosmeticStep=renderer.quality?.decorationStep||1;
   for(let i=0;i<17;i+=cosmeticStep){const x=-31+i*1.68,z=-14.2+(x+17)*-.24+Math.sin(i*3.17)*1.7;
    const rise=(t*.45+i*.31)%2.8;
    renderer.add('sphere',x,.32+rise*.47,z,1.5+rise*.40,.49+rise*.18,1.2+rise*.50,[.86,.69,.59],0,0,0,.095*(1.-rise/3.1));
   }
   let c=this.crusher;
   for(let n=0;n<3;n++){
    let x=c.x+(n-1)*1.4;renderer.add('cylinder',x,1.52,c.z,.58,2.95,.58,[.75,.20,.07]);
    for(let row=0;row<9;row+=cosmeticStep)for(let k=0;k<8;k+=cosmeticStep){let a=k/8*TAU+t*3*(n%2?1:-1)+row*.33;renderer.add('cone',x+Math.cos(a)*.55,.47+row*.27,c.z+Math.sin(a)*.55,.35,.50,.38,[1,.37,.10],a,0,.55)}
   }
  }}
}
export function createResourceLayout(stage=0){let rng=seeded(stage?434:725),rand=(a,b)=>a+(b-a)*rng(),items=[];
 function pile(kind,cx,cz,count,rad,height=0){for(let i=0;i<count;i++){let a=rng()*TAU,r=Math.sqrt(rng())*rad,x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r,y=height*clamp(1-r/rad,0,1)*rand(.40,1.1);items.push({kind,x,z,y,settle:y,vx:0,vz:0,spin:rand(0,TAU),angle:rand(-.4,.4),passedGates:0,cooldown:0,dead:false})}}
 if(stage===0){pile('blue',0,-1.5,335,7.0,.55);pile('blue',5.7,7.1,75,4,.25);pile('blue',-17,-8.0,45,2.6,.1);
  // Starter cache is one short drive from spawn. No invisible starter wallet.
  pile('gold',2.0,6.2,SUPPLY.starterCoins,2.0,.12);
  pile('gold',17.2,4.0,540,5.4,1.25);pile('gold',7.4,-9.1,90,3.0,.28);pile('gold',-1,-17.7,30,4.5,.08);
  pile('pearl',-20.2,-26.1,18,2.3,.5);
 }else{
  // Each is an independently simulated particle; pearls are processable ore
  // rather than merely the decorative contents of an inaccessible display.
  pile('pearl',1.2,8.4,180,4.3,.5);
  pile('pearl',8.1,10.8,82,3.1,.35);
  pile('pearl',-16.2,2.4,40,3.7,.3);
  pile('ingot',2.5,5.7,48,2.7,.18);
  pile('ingot',-12.2,-2.5,112,4.5,.65);
  pile('ingot',6.8,-1.8,90,3.3,.3);
 }
 return items;
}
