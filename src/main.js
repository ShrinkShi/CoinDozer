import {Renderer} from './renderer.js';
import {World} from './world.js';
import {Simulation,MAX_RESOURCES} from './physics.js';
import {renderVehicle,renderTreads,renderResources} from './vehicle.js';
import {clamp,formatNum} from './math.js';
import {screenStickToWorld} from './heading.js';
import {MAX_VEHICLE_LEVEL,TRACK_KEYS,TRACK_LABELS,TRACK_COSTS,GATE_COSTS,gateFactor,coinCredit,trackRemaining} from './economy.js';
import {wheelZoom,pinchZoom,pointerDistance} from './cameraZoom.js';
import {AdaptiveQuality,QUALITY_NAMES} from './quality.js';

const canvas=document.getElementById('scene'),menu=document.getElementById('menu');
const graphicsStatus=document.getElementById('graphicsStatus');
const graphicsMessage=document.getElementById('graphicsMessage');
const toastElement=document.getElementById('toast');
const joystick=document.getElementById('joystick'),knob=document.getElementById('joyKnob');
const gateCostLabels=Array.from({length:4},(_,id)=>document.getElementById('label-gatecost-'+id));
const gateLabels=Array.from({length:5},(_,id)=>document.getElementById('label-gate-'+id));
const labels={cost:document.getElementById('label-cost'),upgrade:document.getElementById('label-upgrade'),lane:document.getElementById('label-score')};
const pauseButton=document.getElementById('pauseButton');
const playButton=document.getElementById('playButton');
const startupIssue=document.getElementById('startupIssue');
const sceneButton=document.getElementById('sceneButton');
const upgradeButton=document.getElementById('upgradeButton'),upgradePicker=document.getElementById('upgradePicker');
const trackButtons=document.getElementById('trackButtons');
const telemetryToggle=document.getElementById('telemetryToggle');
const telemetryPanel=document.getElementById('telemetryPanel');
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
 set('metricRecycled',`${formatNum(t.recycled)} / ${formatNum(t.blocked)}`);
 const busy=sim.activeCount>=MAX_RESOURCES*.86;
 document.getElementById('metricStatus').textContent=busy?
 '资源拥挤：补货已暂缓。把金币推入升级站，或用计数带回收。':
 '仅统计本次游玩；画质按实测帧率缓慢调整，不减少实体数或改变物理。';
}
for(const key of TRACK_KEYS){const b=document.createElement('button');b.className='track-option';b.dataset.track=key;b.type='button';trackButtons.append(b);
 b.addEventListener('click',()=>{sim.selectUpgrade(key);saveProgress();updateUI();upgradePicker.hidden=true;upgradeButton.setAttribute('aria-expanded','false');toast('已选 '+TRACK_LABELS[key]+'，把金币推到紫色升级站',2.5);});}
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
 if(stage!==0)return;
 try{localStorage.setItem('coindozer-progress-v06',JSON.stringify({
  tracks:sim.tracks,gates:sim.gateTracks,selected:sim.selectedUpgrade,
  totalDeposited:sim.totalDeposited
 }));}catch(e){console.warn('Could not save progress',e);}
}
function loadScene(s,preserve=false){
 stage=s;world=new World(stage);sim=new Simulation(stage,preserve?loadProgress():{});
 effects.length=0;lastImpact=null;crushPopup.style.display='none';frameSeconds=0;frameSamples=0;measuredFps=0;visibleResources=0;
 if(renderer){renderer.camera.x=sim.player.x;renderer.camera.z=sim.player.z;}
 sceneButton.textContent='切换预览场景：'+(stage===0?'粉晶岩洞':'熔岩矿场');updateUI();
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
 let paid=0,converted=0,upgrades=[],gateUpgrades=[],gate=null,full=false,crusherBlocked=false,supplyPaused=false;
 for(const event of sim.events){
  switch(event.type){
   case 'multiply':gate=event;break;
   case 'gateFull':full=true;break;
   case 'crusherFull':crusherBlocked=true;break;
   case 'supplyPaused':supplyPaused=true;break;
   case 'crushBatch':converted+=event.count;break;
   case 'crush':
    lastImpact={x:event.x,z:event.z,start:clocks,coins:event.coins};
    if(effects.length<35)effects.push({type:'crush',x:event.x,z:event.z,start:clocks});
    break;
   case 'deposit':paid++;if(effects.length<40)effects.push({x:event.x,z:event.z,start:clocks});break;
   case 'upgrade':upgrades.push(event);break;
   case 'gateUpgrade':gateUpgrades.push(event);break;
  }
 }
 sim.events.length=0;
 if(paid){saveProgress();if(!upgrades.length)beep(360+sim.deposit%100*3,.06,.026);}
 if(upgrades.length){const item=upgrades.at(-1);toast(TRACK_LABELS[item.track]+'升级至 Lv.'+item.level+'，金币价值 '+item.value,3);beep(690,.48,.10);}
 else if(gateUpgrades.length){const item=gateUpgrades.at(-1);toast('数字门 '+(item.id+1)+' 升级：×'+item.factor,2.4);beep(760,.2,.07);}
 else if(full)toast('倍增已受资源上限限制：请把金币投入升级台或使用计数带回收',2.8);
 else if(crusherBlocked)toast('粉碎机暂时无法产出完整的3枚金币：资源已满，矿石保留在入口',3);
 else if(supplyPaused)toast('矿场资源较满，已暂停自动补货；不会删除现有实体',2.7);
 else if(gate){toast('×'+gate.factor+'！实际新增 '+gate.created+' 个资源实体',1.6);beep(850,.13,.06);}
 else if(converted){lastImpact.coins=converted*3;toast('粉碎成功：'+converted+' 颗矿石 → '+(converted*3)+' 枚金币',1.6);beep(460,.095,.038);}
}
function updateUI(){
 if(!sim)return;
 document.getElementById('score').textContent=formatNum(stage?sim.multipliedValue:sim.crushed);
 const selected=sim.selectedUpgrade,track=sim.tracks[selected],costs=TRACK_COSTS[selected];
 const need=trackRemaining(track,costs);
 document.getElementById('left').textContent=stage?'预览':(track.level===costs.length?'已满级':formatNum(need));
 document.getElementById('coinValueStat').textContent='×'+coinCredit(sim.tracks);
 labels.cost.textContent=track.level===costs.length?'MAX':formatNum(need);
 labels.upgrade.textContent=`${TRACK_LABELS[selected]} · Lv.${track.level}/${costs.length}`;
 for(const button of trackButtons.children){const key=button.dataset.track,record=sim.tracks[key],rates=TRACK_COSTS[key];
  const remain=trackRemaining(record,rates),max=record.level===rates.length;
  button.setAttribute('aria-pressed',String(selected===key));
  button.innerHTML=`<strong>${TRACK_LABELS[key]} · Lv.${record.level}/${rates.length}</strong><small>${max?'已满级':`下一级需 ${formatNum(remain)} 金额`}</small>`;
 }
 document.getElementById('pickerCoinValue').textContent=coinCredit(sim.tracks);
 labels.lane.textContent='回收 '+formatNum(sim.processed);
 const resourceCount=document.getElementById('resourceCount');
 resourceCount.textContent=`实体 ${formatNum(sim.activeCount)} / ${formatNum(MAX_RESOURCES)}`;
 resourceCount.classList.toggle('crowded',sim.activeCount>=MAX_RESOURCES*.86);
 updateTelemetry();
 document.getElementById('zoomReadout').textContent='视角 '+Math.round(100/(renderer?.camera.zoom||1))+'%';
 document.querySelector('#topbar .stats span:first-child').firstChild.textContent=stage?'倍增值 ':'已粉碎 ';
 document.getElementById('hint').textContent=paused?'触摸驾驶 / WASD / 滚轮及双指缩放':'初始金币在附近；通过粉碎轮生产金币，送进投币站升级';
}
function positionLabels(){
 for(const el of [...Object.values(labels),...gateLabels,...gateCostLabels])if(el)el.style.display='none';
 const sites=world.sites;
 function place(el,site){if(!el||!site)return;let p=renderer.screen(site.x,site.y,site.z);
  if(p&&p.visible){el.style.display='block';el.style.left=p.x+'px';el.style.top=p.y+'px';}}
 for(const site of sites.gates||[]){const el=gateLabels[site.id];if(el){el.textContent='×'+(site.id<sim.gateTracks.length?gateFactor(sim.gateTracks[site.id]):2);place(el,site);}}
 for(const site of sites.gateCosts||[]){const el=gateCostLabels[site.id],record=sim.gateTracks[site.id];if(el&&record){el.textContent=record.level===GATE_COSTS.length?'MAX':`升门还差 ${trackRemaining(record,GATE_COSTS)}`;place(el,site);}}
 if(stage===0){place(labels.cost,sites.cost);place(labels.upgrade,sites.upgradeText);place(labels.lane,sites.counter);}
}
function inputVector(){
 let x=0,y=0;
 if(keys.has('KeyW')||keys.has('ArrowUp'))y--;
 if(keys.has('KeyS')||keys.has('ArrowDown'))y++;
 if(keys.has('KeyA')||keys.has('ArrowLeft'))x--;
 if(keys.has('KeyD')||keys.has('ArrowRight'))x++;
 if(drag.id!==null&&!pinchLocked){x+=drag.x;y+=drag.y;}
 const len=Math.hypot(x,y);if(len>1){x/=len;y/=len;}
 return screenStickToWorld(x,y);
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
   const x=e.x+(19-e.x)*t,z=e.z+(-12.05-e.z)*t;
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
  visibleResources=renderResources(renderer,sim.resources,sim.elapsed,renderer.camera);
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
  if(!sim||!world)loadScene(0,true);
  if(!renderer){
   renderer=new Renderer(canvas);
   renderer.setQuality(qualityController.mode);
   renderer.camera.x=sim.player.x;renderer.camera.z=sim.player.z;
  }
  startRenderLoop();
  startupIssue.hidden=true;
  playButton.textContent='进入矿场';
  hideMenu();
 }catch(error){showStartupIssue(error);}
}
playButton.addEventListener('click',enterMine);pauseButton.addEventListener('click',showMenu);
sceneButton.addEventListener('click',()=>{saveProgress();loadScene(stage===0?1:0,true);toast('场景已切换',2);});
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
 loadScene(0,true);
 renderer=new Renderer(canvas);
 renderer.setQuality(qualityController.mode);
 renderer.camera.x=sim.player.x;renderer.camera.z=sim.player.z;
 startRenderLoop();
}catch(error){showStartupIssue(error);}
