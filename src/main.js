import {Renderer} from './renderer.js';
import {World} from './world.js';
import {Simulation,MAX_RESOURCES} from './physics.js';
import {renderVehicle,renderTreads,renderResources} from './vehicle.js';
import {clamp,formatNum} from './math.js';
import {screenStickToWorld} from './heading.js';
import {MAX_VEHICLE_LEVEL,TRACK_KEYS,TRACK_LABELS,TRACK_COSTS,GATE_COSTS,gateFactor,coinCredit,trackRemaining} from './economy.js';
import {wheelZoom,pinchZoom,pointerDistance} from './cameraZoom.js';
import {AdaptiveQuality,QUALITY_NAMES} from './quality.js';
import {sceneRules,paymentValue} from './sceneRules.js';
import {INFRA_COSTS,INFRA_LABELS,crusherYield} from './economy.js';
import {mainBridgeWidth} from './mapLayout.js';

const canvas=document.getElementById('scene'),menu=document.getElementById('menu');
const graphicsStatus=document.getElementById('graphicsStatus');
const graphicsMessage=document.getElementById('graphicsMessage');
const toastElement=document.getElementById('toast');
const joystick=document.getElementById('joystick'),knob=document.getElementById('joyKnob');
const gateCostLabels=Array.from({length:4},(_,id)=>document.getElementById('label-gatecost-'+id));
const gateLabels=Array.from({length:5},(_,id)=>document.getElementById('label-gate-'+id));
const labels={cost:document.getElementById('label-cost'),upgrade:document.getElementById('label-upgrade')};
const featureLabels=Object.fromEntries(['crusher','bridge','exit','coin'].map(
 key=>[key,document.getElementById('label-feature-'+key)]));
const pauseButton=document.getElementById('pauseButton');
const playButton=document.getElementById('playButton');
const cameraModeButton=document.getElementById('cameraModeButton');
const startupIssue=document.getElementById('startupIssue');
const sceneButton=document.getElementById('sceneButton');
const upgradeButton=document.getElementById('upgradeButton'),upgradePicker=document.getElementById('upgradePicker');
const trackButtons=document.getElementById('trackButtons');
const featureStatus=document.getElementById('featureStatus');
const telemetryToggle=document.getElementById('telemetryToggle');
const telemetryPanel=document.getElementById('telemetryPanel');
const stageBadge=document.getElementById('stageBadge');
const stageInfo=document.getElementById('stageInfo');
const qualityController=new AdaptiveQuality(
 typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches
);
let measuredFps=0,frameSeconds=0,frameSamples=0,visibleResources=0;
function toggleTelemetry(force){
 const open=force===undefined?telemetryPanel.hidden:Boolean(force);
 telemetryPanel.hidden=!open;
 telemetryToggle.setAttribute('aria-expanded',String(open));
 if(open)updateTelemetry();
}
telemetryToggle.addEventListener('click',()=>toggleTelemetry());
function updateTelemetry(){
 if(!sim||telemetryPanel.hidden)return;
 const snapshot=sim.telemetry.snapshot(sim.elapsed),r=snapshot.recent,t=snapshot.totals;
 const set=(id,value)=>{document.getElementById(id).textContent=value;};
 set('metricFps',measuredFps?Math.round(measuredFps):'--');
 set('metricEntities',`${formatNum(sim.activeCount)} / ${Math.min(sim.activeCount,sim.physics.active||0)}`);
 set('metricContacts',formatNum(sim.physics.contacts||0));
 set('metricVisible',formatNum(visibleResources));
 set('metricSleeping',formatNum(sim.physics.sleeping||0));
 set('metricDeferred',formatNum(sim.physics.deferred||0));
 set('metricQuality',QUALITY_NAMES[renderer?.qualityName||qualityController.mode]);
 set('metricDraws',`${formatNum(renderer?.drawnInstances||0)} / ${formatNum(renderer?.drawCalls||0)}`);
 set('metricUpload',`${Math.round((renderer?.uploadedBytes||0)/1024)} KiB`);
 set('metricGoldRate',formatNum(Math.round(snapshot.producedGoldPerMinute)));
 set('metricValueRate',formatNum(Math.round(snapshot.producedCreditsPerMinute)));
 set('metricPaidRate',formatNum(Math.round(snapshot.paidCreditsPerMinute)));
 set('metricCrushed',formatNum(r.oreCrushed));
 set('metricClones',formatNum(r.gateClones));
 set('metricSupply',`${formatNum(t.restockedOre)} / ${formatNum(t.restockedGold)}`);
 set('metricRecycled',formatNum(t.blocked));
 const busy=sim.activeCount>=MAX_RESOURCES*.86;
 document.getElementById('metricStatus').textContent=busy?
 '资源拥挤：补货暂停，请将金币用于升级以释放实体容量。':
 '仅统计本次游玩；画质按实测帧率缓慢调整，不减少实体数或改变物理。';
}
for(const key of TRACK_KEYS){const b=document.createElement('button');b.className='track-option';b.dataset.track=key;b.type='button';trackButtons.append(b);
 b.addEventListener('click',()=>{sim.selectUpgrade(key);saveProgress();updateUI();upgradePicker.hidden=true;upgradeButton.setAttribute('aria-expanded','false');toast(stage===0&&key==='coin'?'金币价值在南侧右边的专用投币台升级':'已选 '+TRACK_LABELS[key]+'，请到北岸车辆改装台付费',2.5);});}
upgradeButton.addEventListener('click',()=>{upgradePicker.hidden=!upgradePicker.hidden;upgradeButton.setAttribute('aria-expanded',String(!upgradePicker.hidden));updateUI();});
let renderer,world,sim,stage=0,paused=true,keys=new Set(),last=0,clocks=0,sound=null,notifUntil=0;
let graphicsLost=false,renderLoopStarted=false;
const drag={id:null,x:0,y:0,originX:0,originY:0};
const pointers=new Map();let pinch=null,pinchLocked=false;
const effects=[];
const crushPopup=document.getElementById('crushPopup');
let lastImpact=null;

function loadProgress(){
 try{
  const saved=JSON.parse(localStorage.getItem('coindozer-progress-v06')||'null');
  if(saved&&typeof saved==='object'&&saved.tracks)return saved;
  const old=JSON.parse(localStorage.getItem('coindozer-progress-v05')||'null');
  if(old&&Number.isInteger(old.level))return {level:old.level,deposited:old.deposited||0,totalDeposited:old.totalDeposited||0};
  const legacy=JSON.parse(localStorage.getItem('video-dozer-v01')||'null');
  if(legacy&&Number.isInteger(legacy.deposit))return legacy.done?
   {level:1,deposited:0,totalDeposited:2500}:
   {level:0,deposited:legacy.deposit,totalDeposited:legacy.deposit};
 }catch(e){console.warn('Could not read saved progress',e);}
 return {};
}
function saveProgress(){
 if(!sim)return;
 try{
  // Keep legacy lava gates under 'gates'; cave gates have an independent key.
  const previous=loadProgress();
  const progress={
   tracks:sim.tracks,
   gates:stage===0?sim.gateTracks:previous.gates,
   caveGates:stage===1?sim.gateTracks:previous.caveGates,
   selected:sim.selectedUpgrade,totalDeposited:sim.totalDeposited,stage
  };
  localStorage.setItem('coindozer-progress-v06',JSON.stringify(progress));
 }catch(e){console.warn('Could not save progress',e);}
}
function loadScene(s,preserve=false){
 stage=s;world=new World(stage);sim=new Simulation(stage,preserve?loadProgress():{});
 if(stage===0&&sim.selectedUpgrade==='coin')sim.selectUpgrade('chassis');
 effects.length=0;lastImpact=null;crushPopup.style.display='none';
 frameSeconds=0;frameSamples=0;measuredFps=0;visibleResources=0;
 if(renderer){renderer.camera.x=sim.player.x;renderer.camera.z=sim.player.z;renderer.camera.mapFacing=stage===0?-1:1;}
 if(world.syncInfrastructure)world.syncInfrastructure(sim.tracks);
 sceneButton.disabled=stage===0;
 sceneButton.textContent=stage===0?
  (sim.tracks.exit.level?'北端桥已解锁：开车过桥进入冰雪世界':'冰雪关卡未解锁：先向北端桥付费'):
  '返回第一关：冰河矿场';
 stageBadge.textContent=sceneRules(stage).name;
 document.title='铲斗矿场 · '+sceneRules(stage).name;
 stageInfo.textContent=stage===0?
  '冰河矿场：下方铲矿石、通过唯一数字门倍增；跨中央主桥到北岸粉碎门获取金币。金币可升级数字门、粉碎门、铲车、主桥、金币价值；最后解锁北端桥并驾驶前往冰雪第二关。冰河不能直接通行。':
  '冰雪矿区：冰晶通过粉碎机变成独立金锭，金锭在数字门倍增、投入升级；铲车进度两关共享，可从菜单返回第一关。';
 updateUI();
}
function toast(text,seconds=2.1){toastElement.textContent=text;toastElement.classList.add('active');notifUntil=clocks+seconds;}
function unlockAudio(){
 try{
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(!Audio)return;
  sound=sound||new Audio();
  if(sound.state==='suspended')sound.resume().catch(()=>{});
 }catch(error){console.info('Audio unavailable; gameplay remains usable',error);}
}
function beep(freq=530,length=.1,vol=.045){try{
 if(!sound||sound.state!=='running')return;
 let oscillator=sound.createOscillator(),gain=sound.createGain();oscillator.type='triangle';
 oscillator.frequency.setValueAtTime(freq,sound.currentTime);
 oscillator.frequency.exponentialRampToValueAtTime(freq*.72,sound.currentTime+length);
 gain.gain.setValueAtTime(vol,sound.currentTime);
 gain.gain.exponentialRampToValueAtTime(.0002,sound.currentTime+length);
 oscillator.connect(gain);gain.connect(sound.destination);oscillator.start();oscillator.stop(sound.currentTime+length);
 }catch(e){}
}
function handleEvents(){
 let paid=0,converted=0,convertedYield=0,upgrades=[],featureUpgrades=[],gateUpgrades=[],gate=null,full=false,crusherBlocked=false,supplyPaused=false,exitStage=false;
 for(const event of sim.events){
  switch(event.type){
   case 'multiply':gate=event;break;
   case 'gateFull':full=true;break;
   case 'crusherFull':crusherBlocked=true;break;
   case 'supplyPaused':supplyPaused=true;break;
   case 'crushBatch':converted+=event.count;break;
   case 'crush':
    convertedYield+=event.coins;
    lastImpact={x:event.x,z:event.z,start:clocks,coins:event.coins};
    if(effects.length<35)effects.push({type:'crush',x:event.x,z:event.z,start:clocks});
    break;
   case 'deposit':paid++;if(effects.length<40)effects.push({x:event.x,z:event.z,start:clocks});break;
   case 'upgrade':upgrades.push(event);break;
   case 'featureUpgrade':featureUpgrades.push(event);break;
   case 'stageExit':exitStage=true;break;
   case 'gateUpgrade':gateUpgrades.push(event);break;
  }
 }
 sim.events.length=0;
 if(exitStage){
  saveProgress();loadScene(1,true);saveProgress();
  toast('已通过北端桥，进入冰雪第二关',3);beep(710,.4,.09);return;
 }
 if(paid){saveProgress();if(!upgrades.length&&!featureUpgrades.length)beep(360+sim.deposit%100*3,.06,.026);}
 if(upgrades.length){const item=upgrades.at(-1);renderer?.pulseUpgrade();toast(TRACK_LABELS[item.track]+'升级至 Lv.'+item.level+'，金币价值 '+item.value,3);beep(690,.48,.10);}
 else if(featureUpgrades.length){
  const item=featureUpgrades.at(-1);
  if(item.track==='exit'){
   world.syncInfrastructure(sim.tracks);
   sceneButton.textContent='北端桥已解锁：开车过桥进入冰雪世界';
   toast('北端桥解锁成功，请开往地图最上方',3.5);
  }else if(item.track==='bridge'){
   world.syncInfrastructure(sim.tracks);
   toast('主桥拓宽到 '+mainBridgeWidth(sim.tracks)+' 单位',2.7);
  }else if(item.track==='crusher')toast('粉碎门升级：每颗矿石产出 '+crusherYield(sim.tracks)+' 枚金币',3);
  else toast('金币升值：每枚金币抵扣 '+paymentValue(stage,sim.tracks)+' 金额',3);
  renderer?.pulseUpgrade();beep(710,.35,.09);
 }
 else if(gateUpgrades.length){const item=gateUpgrades.at(-1);toast('数字门 '+(item.id+1)+' 升级：×'+item.factor,2.4);beep(760,.2,.07);}
 else if(full)toast('实体已达到上限：请将金币用于升级释放容量',2.8);
 else if(crusherBlocked)toast(stage?'粉晶粉碎机资源已满：保留粉晶等待空位':'粉碎机暂时无法产出完整的3枚金币：资源已满，矿石保留在入口',3);
 else if(supplyPaused)toast('矿场资源较满，已暂停自动补货；不会删除现有实体',2.7);
 else if(gate){toast('×'+gate.factor+'！实际新增 '+gate.created+' 个资源实体',1.6);beep(850,.13,.06);}
 else if(converted){lastImpact.coins=convertedYield;toast(stage?'冰晶加工：'+converted+' 颗 → '+convertedYield+' 根金锭':'粉碎成功：'+converted+' 颗矿石 → '+convertedYield+' 枚金币',1.6);beep(460,.095,.038);}
}
function updateUI(){
 if(!sim)return;
 document.getElementById('score').textContent=formatNum(sim.crushed);
 const selected=sim.selectedUpgrade,track=sim.tracks[selected],costs=TRACK_COSTS[selected];
 const need=trackRemaining(track,costs);
 document.getElementById('left').textContent=track.level===costs.length?'已满级':formatNum(need);
 document.getElementById('coinValueStat').textContent='×'+paymentValue(stage,sim.tracks);
 labels.cost.textContent=track.level===costs.length?'MAX':formatNum(need);
 labels.upgrade.textContent=`${TRACK_LABELS[selected]} · Lv.${track.level}/${costs.length}`;
 for(const button of trackButtons.children){const key=button.dataset.track,record=sim.tracks[key],rates=TRACK_COSTS[key];
  button.hidden=stage===0&&key==='coin';
  const remain=trackRemaining(record,rates),max=record.level===rates.length;
  button.setAttribute('aria-pressed',String(selected===key));
  button.innerHTML=`<strong>${TRACK_LABELS[key]} · Lv.${record.level}/${rates.length}</strong><small>${max?'已满级':`下一级需 ${formatNum(remain)} 金额`}</small>`;
 }
 document.getElementById('pickerCoinValue').textContent=paymentValue(stage,sim.tracks);
 featureStatus.hidden=stage!==0;
 if(stage===0){
  const status=['crusher','bridge','coin','exit'].map(key=>{
   const record=sim.tracks[key],costs=INFRA_COSTS[key]??TRACK_COSTS.coin;
   const name=key==='coin'?'金币价值':INFRA_LABELS[key];
   const detail=key==='crusher'?'每矿 '+crusherYield(sim.tracks)+' 枚':
    key==='bridge'?'桥宽 '+mainBridgeWidth(sim.tracks):
    key==='exit'?(record.level?'已解锁':'上锁'):
    '每币 ×'+paymentValue(stage,sim.tracks);
   return name+': '+detail+' · '+(record.level>=costs.length?'满级':'还需 '+trackRemaining(record,costs));
  });
  featureStatus.textContent=status.join('　|　');
 }
 const resourceCount=document.getElementById('resourceCount');
 resourceCount.textContent=`实体 ${formatNum(sim.activeCount)} / ${formatNum(MAX_RESOURCES)}`;
 resourceCount.classList.toggle('crowded',sim.activeCount>=MAX_RESOURCES*.86);
 updateTelemetry();
 document.getElementById('zoomReadout').textContent='视角 '+Math.round(100/(renderer?.camera.zoom||1))+'%';
 document.querySelector('#topbar .stats span:first-child').firstChild.textContent=stage?'已加工冰晶 ':'已粉碎 ';
 document.getElementById('hint').textContent=paused?'触摸驾驶 / WASD / 双指缩放':stage?'将冰晶推入粉碎机，获得金锭升级':'矿石先过数字门，再经主桥粉碎；金币用于升级';
}
function positionLabels(){
 for(const el of [...Object.values(labels),...gateLabels,...gateCostLabels,...Object.values(featureLabels)])if(el)el.style.display='none';
 const sites=world.sites;
 function place(el,site){if(!el||!site)return;let p=renderer.screen(site.x,site.y,site.z);
  if(p&&p.visible){el.style.display='block';el.style.left=p.x+'px';el.style.top=p.y+'px';}}
 for(const site of sites.gates||[]){const el=gateLabels[site.id];if(el){el.textContent='×'+(site.id<sim.gateTracks.length?gateFactor(sim.gateTracks[site.id]):2);place(el,site);}}
 for(const site of sites.gateCosts||[]){const el=gateCostLabels[site.id],record=sim.gateTracks[site.id];if(el&&record){el.textContent=record.level===GATE_COSTS.length?'MAX':`升门还差 ${trackRemaining(record,GATE_COSTS)}`;place(el,site);}}
 place(labels.cost,sites.cost);place(labels.upgrade,sites.upgradeText);
 if(stage===0)for(const [key,site] of Object.entries(sites.features||{})){
  if(key==='gate')continue;
  const el=featureLabels[key],record=sim.tracks[key];
  if(!el||!record)continue;
  const costs=INFRA_COSTS[key]??TRACK_COSTS.coin;
  el.textContent=(key==='coin'?'金币价值':INFRA_LABELS[key])+
   (record.level>=costs.length?' MAX':' 还需 '+trackRemaining(record,costs));
  place(el,site);
 }
}
function inputVector(){
 let x=0,y=0;
 if(keys.has('KeyW')||keys.has('ArrowUp'))y--;
 if(keys.has('KeyS')||keys.has('ArrowDown'))y++;
 if(keys.has('KeyA')||keys.has('ArrowLeft'))x--;
 if(keys.has('KeyD')||keys.has('ArrowRight'))x++;
 if(drag.id!==null&&!pinchLocked){x+=drag.x;y+=drag.y;}
 const len=Math.hypot(x,y);if(len>1){x/=len;y/=len;}
 return screenStickToWorld(x,y,stage===0);
}
function drawEffects(){
 for(let i=effects.length-1;i>=0;i--){
  const e=effects[i],age=clocks-e.start;
  if(age>(e.type==='crush' ? 0.56 : 0.68)){effects.splice(i,1);continue;}
  if(e.type==='crush'){
   // Four brief sparks per collision, capped to 35 impact events.
   for(let j=0;j<(renderer.quality?.effectSparks||4);j++){
    const a=j*Math.PI*.5+e.x*.13,dist=age*(2.2+j*.26);
    renderer.add('sphere',e.x+Math.cos(a)*dist,.55+age*2.1-j*.035,
      e.z+Math.sin(a)*dist,.105,.105,.105,j%2?[1,.86,.33,3]:[1,.43,.08,3]);
   }
  }else{
   const t=age/.68;
   const x=e.x+Math.cos(t*9)*t*.65,z=e.z+Math.sin(t*9)*t*.65;
   renderer.add('sphere',x,.5+Math.sin(t*Math.PI)*2,z,.19,.19,.19,[1,.79,.1,3]);
  }
 }
 if(lastImpact){
  const age=clocks-lastImpact.start;
  const pos=age<.72?renderer.screen(lastImpact.x,1.8+age*.9,lastImpact.z):null;
  if(pos&&pos.visible){
   crushPopup.textContent='+'+lastImpact.coins;
   crushPopup.style.left=pos.x+'px';crushPopup.style.top=pos.y+'px';
   crushPopup.style.opacity=String(Math.max(0,1-age/.72));
   crushPopup.style.display='block';
  }else crushPopup.style.display='none';
 }
}
function drawFrame(t){
 const rawDt=(t-last)/1000||.016;
 const dt=Math.min(rawDt,.046);last=t;clocks+=dt;
 if(!paused && !graphicsLost && rawDt>0 && rawDt<2){
  frameSeconds+=rawDt;frameSamples++;
  if(frameSeconds>=.65){
   measuredFps=frameSamples/frameSeconds;
   if(qualityController.sample(measuredFps,frameSeconds))renderer?.setQuality(qualityController.mode);
   frameSamples=0;frameSeconds=0;
  }
 }
 if(renderer&&!graphicsLost){
  if(!paused){const v=inputVector();sim.update(dt,v.x,v.z,world);handleEvents();}
  renderer.begin(clocks,sim.player,dt);
  world.render(renderer,clocks,sim.player);
  renderTreads(renderer,sim.treads,stage);
  visibleResources=renderResources(renderer,sim.resources,sim.elapsed,renderer.camera,stage);
  renderVehicle(renderer,sim.player,clocks);
  drawEffects();renderer.end();positionLabels();
  if(Math.floor(clocks*6)!==Math.floor((clocks-dt)*6))updateUI();
  document.getElementById('hint').classList.toggle('dismissed',!paused&&clocks>12);
 }
 if(clocks>notifUntil)toastElement.classList.remove('active');
 requestAnimationFrame(drawFrame);
}
function resetInput(){drag.id=null;drag.x=drag.y=0;joystick.style.display='none';knob.style.transform='translate(0,0)';pointers.clear();pinch=null;pinchLocked=false;}
function showMenu(){paused=true;menu.classList.add('visible');upgradePicker.hidden=true;upgradeButton.setAttribute('aria-expanded','false');playButton.textContent='继续驾驶';resetInput();updateUI();}
function hideMenu(){if(graphicsLost)return;unlockAudio();paused=false;menu.classList.remove('visible');toast('把蓝球推入粉碎轮，金币推向右上方升级台',3);updateUI();}
function moveTouch(point){
 const dx=point.x-drag.originX,dy=point.y-drag.originY,max=52,mag=Math.max(1,Math.hypot(dx,dy)/max);
 drag.x=dx/max/mag;drag.y=dy/max/mag;
 knob.style.transform=`translate(${drag.x*42}px,${drag.y*42}px)`;
}
function endJoystick(){drag.id=null;drag.x=drag.y=0;joystick.style.display='none';knob.style.transform='translate(0,0)';}
function setZoom(zoom){if(!renderer)return;renderer.camera.zoom=zoom;updateUI();}
function updateCameraModeButton(){
 const close=renderer?.camera.mode==='close';
 cameraModeButton.textContent=close?'镜头：特写':'镜头：全景';
 cameraModeButton.setAttribute('aria-pressed',String(close));
}
cameraModeButton.addEventListener('click',()=>{
 if(!renderer)return;
 renderer.camera.mode=renderer.camera.mode==='close'?'follow':'close';
 updateCameraModeButton();
});
canvas.addEventListener('wheel',e=>{if(renderer){setZoom(wheelZoom(renderer.camera.zoom,e.deltaY));e.preventDefault();}},{passive:false});
canvas.addEventListener('pointerdown',e=>{
 if(paused||graphicsLost||e.button>0)return;
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 try{canvas.setPointerCapture(e.pointerId);}catch(_){}
 if(pointers.size>=2){
  endJoystick();pinchLocked=true;
  const [a,b]=[...pointers.values()];
  pinch={distance:pointerDistance(a,b),zoom:renderer.camera.zoom};
 }else if(!pinchLocked){
  drag.id=e.pointerId;drag.originX=e.clientX;drag.originY=e.clientY;
  drag.x=drag.y=0;joystick.style.left=e.clientX+'px';joystick.style.top=e.clientY+'px';
  joystick.style.display='block';moveTouch({x:e.clientX,y:e.clientY});
 }
 e.preventDefault();
});
canvas.addEventListener('pointermove',e=>{
 if(!pointers.has(e.pointerId))return;
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pinch&&pointers.size>=2){
  const [a,b]=[...pointers.values()];
  setZoom(pinchZoom(pinch.zoom,pinch.distance,pointerDistance(a,b)));
 }else if(drag.id===e.pointerId&&!pinchLocked){moveTouch({x:e.clientX,y:e.clientY});}
 e.preventDefault();
});
function releasePointer(e){
 pointers.delete(e.pointerId);
 if(e.pointerId===drag.id)endJoystick();
 if(pointers.size<2)pinch=null;
 if(pointers.size===0){pinchLocked=false;endJoystick();}
}
canvas.addEventListener('pointerup',releasePointer);
canvas.addEventListener('pointercancel',releasePointer);
window.addEventListener('keydown',e=>{
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
 keys.add(e.code);
 if(e.code==='F3'){e.preventDefault();toggleTelemetry();return;}
 if(e.code==='KeyP'||e.code==='Escape'){e.preventDefault();if(paused)hideMenu();else showMenu();}
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{keys.clear();resetInput();});
function startRenderLoop(){
 if(renderLoopStarted)return;
 renderLoopStarted=true;
 requestAnimationFrame(drawFrame);
}
function showStartupIssue(error){
 console.error('Game graphics startup failed',error);
 startupIssue.textContent='无法初始化图形：'+(error?.message||String(error))
  +'。请尝试 Chrome 或 Edge；若浏览器禁止 WebGL，请开启硬件加速或切换浏览器。';
 startupIssue.hidden=false;
 playButton.textContent='重新尝试进入矿场';
 playButton.disabled=false;
}
function enterMine(){
 try{
  if(!sim||!world)loadScene(loadProgress().stage===1?1:0,true);
  if(!renderer){
   renderer=new Renderer(canvas);
   renderer.setQuality(qualityController.mode);
   renderer.camera.x=sim.player.x;renderer.camera.z=sim.player.z;renderer.camera.mapFacing=stage===0?-1:1;
  }
  startRenderLoop();
  updateCameraModeButton();
  startupIssue.hidden=true;
  playButton.textContent='进入矿场';
  hideMenu();
 }catch(error){showStartupIssue(error);}
}
playButton.addEventListener('click',enterMine);pauseButton.addEventListener('click',showMenu);
sceneButton.addEventListener('click',()=>{
 if(stage===0)return; // Stage entry requires physically crossing the paid bridge.
 saveProgress();loadScene(0,true);saveProgress();toast('返回冰河矿场',2);
});
document.getElementById('resetButton').addEventListener('click',()=>{
 if(!confirm('清除升级进度并重置当前场景？'))return;
 try{localStorage.removeItem('coindozer-progress-v06');localStorage.removeItem('coindozer-progress-v05');localStorage.removeItem('video-dozer-v01');}catch(e){}
 loadScene(stage,false);toast('游戏进度已重置');
});
/** Recreate all GPU programs, buffers and instancing extension handles on the
 * restored context; keep the same Simulation and camera instead of reloading.
 */
function graphicsNotice(message){
 graphicsMessage.textContent=message;
 graphicsStatus.hidden=false;
}
canvas.addEventListener('webglcontextlost',event=>{
 event.preventDefault(); // required for the browser to attempt restoration
 graphicsLost=true;
 saveProgress();
 resetInput();
 graphicsNotice('图形上下文已丢失，游戏计算已暂停。正在尝试恢复；若无法恢复，请点击刷新。');
});
canvas.addEventListener('webglcontextrestored',()=>{
 try{
  const previous=renderer?.camera?{...renderer.camera}:null;
  const next=new Renderer(canvas);
  next.setQuality(qualityController.mode);
  if(previous)Object.assign(next.camera,previous);
  renderer=next;
  updateCameraModeButton();
  graphicsLost=false;
  graphicsStatus.hidden=true;
  frameSamples=0;frameSeconds=0;measuredFps=0;
  last=0;
  toast('图形设备已恢复，游戏进度已保留',2.4);
 }catch(error){
  graphicsLost=true;
  console.error('WebGL context restore failed',error);
  graphicsNotice('图形恢复失败：'+error.message+'。请点击刷新页面。');
 }
});
document.getElementById('graphicsRefresh').addEventListener('click',()=>location.reload());
try{
 loadScene(loadProgress().stage===1?1:0,true);
 renderer=new Renderer(canvas);
 renderer.setQuality(qualityController.mode);
 renderer.camera.x=sim.player.x;renderer.camera.z=sim.player.z;renderer.camera.mapFacing=stage===0?-1:1;
 startRenderLoop();
 updateCameraModeButton();
}catch(error){showStartupIssue(error);}
