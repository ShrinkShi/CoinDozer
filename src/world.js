import {rnd,clamp,TAU} from './math.js';
import {renderVehicle} from './vehicle.js';
import {MAX_VEHICLE_LEVEL,SUPPLY} from './economy.js';
import {boxTrigger} from './triggers.js';
import {sceneRules} from './sceneRules.js';
import {LONG_MAP} from './mapLayout.js';
import {configureTerrain} from './terrain.js';
export const PALETTE={
 dirt:[.55,.372,.288,6],dirtLight:[.64,.451,.342,6],dirtEdge:[.38,.246,.185,6],rock:[.64,.437,.314],rockLight:[.70,.504,.362],rockShade:[.48,.318,.238],bridge:[.93,.615,.332],bridgeSide:[.65,.36,.18],yellow:[.98,.69,.075],gold:[1,.74,.06],goldDark:[.74,.37,.035],metal:[.32,.36,.36],black:[.12,.092,.084],blue:[.11,.64,.97],blueLight:[.40,.85,1],purple:[.42,.16,.71],purpleCap:[.46,.24,.79],orange:[.98,.33,.10],glass:[.68,.60,.92],mint:[.11,.90,.83],pearl:[1,.77,.90],white:[.97,.99,1],gray:[.35,.39,.39]};
function seeded(seed=123){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296}}
export class World{
 constructor(stage=0){this.stage=stage;this.static=[];this.obstacles=[];this.sites={};this.gates=[];this.gateStations=[];this.crusher=null;this.upgradeStation=null;this.coinStation=null;this.featureStations={};this.terrain=null;this.bridges=null;this.bounds=stage===0?LONG_MAP.bounds:{minX:-31,maxX:31,minZ:-27,maxZ:30};this.rng=seeded(stage?337:20261102);this.make(stage);this.syncInfrastructure({bridge:{level:0},exit:{level:0}});}
 n(a,b){return a+(b-a)*this.rng()}
 add(mesh,x,y,z,sx,sy,sz,c,yaw=0,pitch=0,roll=0,opacity=1){this.static.push({mesh,x,y,z,sx,sy,sz,c,yaw,pitch,roll,opacity})}
 addRock(x,z,scale=1,c){let r=this.n(.86,1.18)*scale,co=c||PALETTE.rock;this.add('shadow',x,.090,z,r*2.8,1,r*2.2,[0,0,0,8]);this.add('boulder',x,r*.65,z,r*1.6,r*1.3,r*1.65,co,this.n(0,TAU));this.obstacles.push({type:'circle',x,z,radius:r*.79,height:r*1.3});this.add('boulder',x+r*.46,r*.45,z-r*.6,r*.85,r*.85,r*.77,PALETTE.rockShade,this.n(0,TAU))}
 borderRocks(pink=false){let C=pink?[[.58,.4,.53],[.66,.46,.60],[.70,.54,.67]]:[PALETTE.rock,PALETTE.rockLight,PALETTE.rockShade];for(let i=0;i<48;i++){let x=-32+i*1.37+this.n(-.7,.7);this.addRock(x,-29+this.n(-2.4,2.4),this.n(1.0,2.1),C[i%3]);}for(let i=0;i<34;i++){let z=-28+i*1.6;this.addRock(-34+this.n(-2.5,1.5),z,this.n(.7,2),C[i%3]);this.addRock(34+this.n(-1.3,2.2),z,this.n(.8,1.7),C[(i+1)%3])}for(let i=0;i<28;i++){let x=-31+i*2.4;this.addRock(x,30+this.n(-.8,2.7),this.n(.8,2.3),C[i%3])}}
 make(stage){
  if(stage===1){this.makeBonus();return;}
  const M=LONG_MAP;
  this.sites={gates:[],gateCosts:[],features:{}};
  this.add('box',0,-.98,0,71,1.8,111,PALETTE.dirtEdge);
  this.add('box',0,-.06,0,70,.2,110,PALETTE.dirt);
  for(let i=0;i<70;i++){
   const x=this.n(-31,31),z=this.n(-50,51);
   if(Math.abs(x)<8&&z>-47&&z<17)continue;
   this.add('box',x,.056,z,this.n(.25,.65),.009,this.n(.65,1.4),
    [.59,.40,.31,6],this.n(-1,1));
  }
  // Two ice rivers are both visible and physically impassable off bridge.
  for(const river of [M.river1,M.river2]){
   const depth=river.halfDepth*2;
   this.add('box',0,.085,river.z,70,.12,depth,[.40,.70,.85,4]);
   this.add('box',0,.155,river.z,70,.022,depth-.4,[.72,.90,.97,4]);
   for(let i=-32;i<=32;i+=4)this.add('box',i,.171,
    river.z+Math.sin(i*.8)*2.8,this.n(.65,1.9),.011,.075,
    [.93,.99,1,4],this.n(-.5,.5));
  }
  // One and only one double-sided ore multiplier (gate id 0).
  const gate={id:0,x:M.digitGate.x,z:M.digitGate.z,
   half:M.digitGate.half,apertureHalf:M.digitGate.apertureHalf,multiplier:2};
  this.gates.push(gate);this.frameGate(gate);
  const install=(key,def,color)=>{
   const trigger=boxTrigger(def.x,def.z,def.halfX,def.halfZ,.36);
   const station={key,x:def.x,z:def.z,trigger,
    vehicleRadius:Math.max(def.halfX,def.halfZ)+3};
   this.add('box',def.x,.13,def.z,def.halfX*2+.4,.24,def.halfZ*2+.3,color);
   this.add('box',def.x,.29,def.z,def.halfX*2,.12,def.halfZ*2,PALETTE.black);
   for(const sign of [-1,1])this.add('box',def.x+sign*(def.halfX+.06),
     .38,def.z,.12,.28,def.halfZ*2.1,PALETTE.mint);
   this.sites.features[key]={x:def.x,y:.85,z:def.z};
   return station;
  };
  const gatePad=install('gate',M.digitGatePad,[.94,.60,.10]);
  this.gateStations.push({id:0,...gatePad});
  this.sites.gateCosts.push({id:0,x:gatePad.x,y:.70,z:gatePad.z});
  this.coinStation=install('coin',M.coinValuePad,[.99,.77,.16]);
  this.featureStations.crusher=install('crusher',M.crusherPad,[.83,.49,.21]);
  this.featureStations.bridge=install('bridge',M.bridgePad,[.50,.76,.95]);
  this.featureStations.exit=install('exit',M.exitPad,[.75,.84,.96]);
  // The crusher is directly aligned with the central bridge head.
  const c=M.crusher;
  this.crusher={x:c.x,z:c.z,halfWidth:c.halfWidth,halfDepth:c.halfDepth,
   trigger:boxTrigger(c.x,c.z,c.halfWidth,c.halfDepth,2.1)};
  for(const x of [-7.25,7.25]){
   this.add('cylinder',x,2,c.z,.65,3.9,.65,PALETTE.purpleCap);
   this.add('sphere',x,4.05,c.z,.96,1,.96,PALETTE.purpleCap);
   // The visible grinder support is solid. Keep the central 14-wide
   // processing throat unobstructed for actual ore.
   this.obstacles.push({type:'circle',x,z:c.z,radius:.60,height:3.9});
  }
  this.add('box',0,3.55,c.z,14.5,.4,.68,PALETTE.purple);
  const rail=(x1,z1,x2,z2)=>{
   const dx=x2-x1,dz=z2-z1;
   this.add('box',(x1+x2)/2,.44,(z1+z2)/2,Math.hypot(dx,dz),
    .8,.31,PALETTE.metal,-Math.atan2(dz,dx));
   this.obstacles.push({type:'segment',x1,z1,x2,z2,radius:.17,height:.78});
  };
  rail(-8.8,1.9,-6.8,6.2);rail(8.8,1.9,6.8,6.2);
  const v=M.vehiclePad;
  this.upgradeStation={x:v.x,z:v.z,vehicleRadius:7.5,
   trigger:boxTrigger(v.x,v.z,v.halfX,v.halfZ,.36),
   previewX:v.previewX,previewZ:v.previewZ};
  this.add('box',18,.13,14.5,12.3,.25,15,PALETTE.purple);
  this.add('box',18,.28,11,11.5,.12,9.5,[.30,.16,.41]);
  this.add('box',18,.33,19.2,9,.19,6,[.68,.42,.79]);
  this.add('box',18,2.8,24.6,11.3,5,.12,PALETTE.mint,0,0,0,.42);
  this.sites.cost={x:18,y:.92,z:11};
  this.sites.upgradeText={x:18,y:5.3,z:24.6};
  this.add('box',0,.058,25,26,.035,10,[.68,.53,.37,6]);
  this.add('box',0,.08,46.5,24,.03,10,[.82,.91,.95,4]);
  for(const x of [-32,32])for(let z=-48;z<=52;z+=5.2){
   if(Math.abs(z+8)<8||Math.abs(z-36)<7)continue;
   this.addRock(x+this.n(-.6,.6),z,this.n(.65,1.15),
    z>41?[.77,.84,.90]:PALETTE.rock);
  }
  for(let i=0;i<36;i++){
   const x=this.n(-30,30),z=this.n(-51,51);
   if(Math.abs(x)<13&&z>-47&&z<47)continue;
   this.add('boulder',x,.2,z,this.n(.22,.52),this.n(.24,.5),
    this.n(.22,.6),z>40?[.86,.94,.98]:PALETTE.rockShade);
  }
 }
 syncInfrastructure(tracks){configureTerrain(this,tracks);}
 frameGate(gate){const {x,z,half,multiplier,id}=gate;
  const cave=this.stage===1;
  for(const side of [-1,1]){let px=x+side*half;
   this.add('box',px,1.68,z,.55,3.25,.68,cave?[.36,.74,.95,4]:[.97,.28,.12]);
   this.add('box',px,.20,z,.89,.40,.91,cave?[.54,.81,.99,4]:PALETTE.purple);
   this.add('box',px,3.51,z,.97,.65,.94,cave?[.86,.96,1,4]:PALETTE.purpleCap);
   this.add('sphere',px,3.87,z,.78,.64,.76,cave?[.95,.99,1,4]:PALETTE.purpleCap);
   // Register each drawn portal pillar as a static solid. Previously the
   // vehicle could pass through the physical-looking side of a gate.
   this.obstacles.push({type:'circle',x:px,z,radius:.39,height:3.4});
  }
  this.add('box',x,1.66,z,half*1.95,2.83,.085,cave?[.64,.88,1]:PALETTE.glass,0,0,0,.34);
  this.sites.gates.push({id,x,y:1.85,z:z-.15,multiplier});
 }
 makeBonus(){
  // A fully playable second map. Geometric features are independent of lava
  // world data; interaction locations are defined here, not duplicated in physics.
  const R=sceneRules(1);
  this.add('box',0,-.94,0,71,1.8,64,[.43,.56,.67,6]);
  this.add('box',0,-.05,0,69,.2,61,[.86,.94,.99,4]);
  this.borderRocks(true);
  // Long crystalline seams and rock ribs sit outside the central push lanes.
  for(let i=0;i<44;i++){
   const side=i%2?-1:1;
   const x=side*(22.5+this.n(0,6)),z=this.n(-22,25);
   const height=this.n(1.1,3.4);
   const tint=i%4===0?[.68,.91,1,4]:i%4===1?[.45,.76,.95,4]:
     i%4===2?[.92,.98,1,4]:[.54,.68,.88,4];
   this.add('cone',x,height*.48,z,this.n(.75,1.5),height,this.n(.75,1.5),tint,
    this.n(0,TAU),this.n(-.17,.17));
  }
  for(let i=0;i<18;i++){
   const x=this.n(-23,23),z=this.n(-25,23);
   if(Math.abs(x)<18&&z>-18&&z<19)continue;
   this.addRock(x,z,this.n(.45,1),i%2?[.75,.85,.96]:[.52,.69,.85]);
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
   this.add('cylinder',x,1.95,7.2,.72,3.8,.72,[.46,.72,.95,4]);
   this.add('sphere',x,4.0,7.2,1.1,1.1,1.1,[.75,.95,1,4]);
  }
  this.add('box',13,3.57,7.2,5.55,.42,.64,[.24,.76,.90,4]);
  // An actual vehicle upgrade station. Same shared track progression as map 1.
  const upgradeTrigger=boxTrigger(20,-11.95,3.75,1.18,.35);
  this.upgradeStation={x:20,z:-11.95,vehicleRadius:6.0,
   trigger:upgradeTrigger,depositHalfX:upgradeTrigger.halfX,
   depositHalfZ:upgradeTrigger.halfZ,previewX:20,previewZ:-20.5};
  this.add('box',20,.12,-19.1,9.2,.24,10.2,[.52,.71,.90,4]);
  this.add('box',20,.28,-20.2,8.0,.22,7.2,[.69,.84,.97,4]);
  this.add('box',20,.15,-11.95,7.95,.22,2.38,[.97,.68,.26]);
  this.add('box',20,.29,-11.95,upgradeTrigger.halfX*2,.12,
   upgradeTrigger.halfZ*2,PALETTE.black);
  this.add('box',20,2.65,-24.4,9.3,4.9,.14,[.62,.95,.98,4],0,0,0,.45);
  this.sites.cost={x:20,y:.56,z:-11.95};
  this.sites.upgradeText={x:20,y:5.3,z:-24.5};
  this.add('box',20,.45,-20.5,7.0,.16,5.7,[.75,.89,.99,4]);
  for(const x of [17.0,23.0])this.add('box',x,.56,-20.5,.12,.17,5.1,PALETTE.mint);
  // Crystal ribs give depth without blocking the accessible ore-to-grinder route.
  for(let i=0;i<18;i++){
   const x=i%2?-18.3:25.5,z=-21+i*2.5;
   this.add('cone',x,1.25,z,.9,2.4,.9,[.59,.83,1,4],i*.7);
   this.add('sphere',x,2.2,z,.28,.27,.28,[.90,.98,1,4]);
  }
 }
 render(renderer,t,player){
  for(const o of this.static)renderer.add(o.mesh,o.x,o.y,o.z,
   o.sx,o.sy,o.sz,o.c,o.yaw,o.pitch,o.roll,o.opacity);
  if(this.stage===0){
   // Dynamic bridge decks match the same widths as terrain collision. The
   // locked northern bridge has no traversable deck until fully paid.
   const widths=this.bridges||{};
   for(const key of ['main','next']){
    const deck=widths[key];if(!deck)continue;
    if(key==='next'&&!deck.unlocked){
     renderer.add('box',0,.52,30.7,11,1.0,.78,[.71,.15,.12,4]);
     for(const x of [-4.3,0,4.3])
      renderer.add('sphere',x,1.19,30.7,.43,.43,.43,[1,.22,.08,3]);
     continue;
    }
    renderer.add('box',deck.x,.29,deck.z,deck.width,.31,deck.depth,
     key==='main'?PALETTE.bridge:[.75,.86,.90,4]);
    // Each plank is real geometry; widening produces more plank columns.
    const columns=Math.max(1,Math.ceil(deck.width/1.5));
    const step=deck.width/columns;
    for(let i=0;i<columns;i++){
     const x=deck.x-deck.width*.5+(i+.5)*step;
     renderer.add('box',x,.46,deck.z,step-.05,.045,deck.depth-.15,
      i%2?[.93,.72,.47,4]:[.78,.54,.33,4]);
    }
    for(const side of [-1,1])
     renderer.add('box',deck.x+side*(deck.width*.5-.08),.51,deck.z,
      .12,.19,deck.depth,[.63,.49,.36,4]);
   }
   const N=renderer.quality?.decorationStep||1;
   for(let i=-9;i<10;i+=N){
    const x=i*3.6,phase=(t*.35+i*.19)%2.0;
    for(const z of [-8,36]){
     if(Math.abs(x)<13)continue;
     renderer.add('sphere',x,.23+phase*.2,z+Math.sin(t*.5+i)*2,
      .17,.14,.15,[.92,.98,1,4]);
    }
   }
  }
  if(player&&this.upgradeStation){
   const next=Math.min(MAX_VEHICLE_LEVEL,player.level+1);
   renderVehicle(renderer,{x:this.upgradeStation.previewX,z:this.upgradeStation.previewZ,
    yaw:Math.PI,level:next,bladeLevel:player.bladeLevel,
    speedLevel:player.speedLevel,steeringLevel:player.steeringLevel,
    coinLevel:player.coinLevel},t,.47);
   renderer.add('box',this.upgradeStation.x,.38+Math.sin(t*3)*.04,
    this.upgradeStation.z,this.upgradeStation.trigger.halfX*2-.12,.065,
    Math.min(1.6,this.upgradeStation.trigger.halfZ*2-.1),
    this.stage?[.73,.91,1,3]:[1,.81,.08,3]);
  }
  const c=this.crusher,detail=renderer.quality?.decorationStep||1;
  if(c){
   const nRoll=this.stage===0?6:3;
   for(let n=0;n<nRoll;n++){
    const x=c.x+(n-(nRoll-1)/2)*(this.stage===0?2.08:1.47);
    renderer.add('cylinder',x,1.52,c.z,.58,2.9,.58,
     this.stage?[.39,.76,.98,4]:[.75,.20,.07]);
    for(let row=0;row<8;row+=detail)
     for(let k=0;k<8;k+=detail){
      const a=k/8*TAU+t*3*(n%2?1:-1)+row*.33;
      renderer.add('cone',x+Math.cos(a)*.55,.47+row*.27,
       c.z+Math.sin(a)*.55,.35,.50,.38,
       this.stage?[.68,.91,1,4]:[1,.37,.10,4],a);
     }
   }
  }
 }

}
export function createResourceLayout(stage=0){let rng=seeded(stage?434:725),rand=(a,b)=>a+(b-a)*rng(),items=[];
 function pile(kind,cx,cz,count,rad,height=0){for(let i=0;i<count;i++){let a=rng()*TAU,r=Math.sqrt(rng())*rad,x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r,y=height*clamp(1-r/rad,0,1)*rand(.40,1.1);items.push({kind,x,z,y,settle:y,vx:0,vz:0,spin:rand(0,TAU),angle:rand(-.4,.4),passedGates:0,cooldown:0,dead:false})}}
 if(stage===0){
  // No free starting wallet: all gold comes from physically crushing ore.
  // Deposits start behind the ore multiplier, exactly like long-map V3.
  pile('blue',0,-39,340,6.5,.48);
  pile('blue',-9,-40.8,64,3.0,.22);
  pile('blue',8,-39.3,62,2.7,.28);
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
