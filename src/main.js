import {Renderer} from './renderer.js';
import {World} from './world.js';
import {Simulation} from './physics.js';
import {renderVehicle,renderTreads,renderResources} from './vehicle.js';
import {clamp,formatNum} from './math.js';
import {screenStickToWorld} from './heading.js';
const canvas=document.getElementById('scene');
// v0.2 uses a fixed azimuth like the ad; mouse wheel only changes photographic distance.
canvas.addEventListener('wheel',e=>{if(renderer){renderer.camera.zoom=clamp(renderer.camera.zoom+e.deltaY*.00042,.74,1.4);e.preventDefault()}},{passive:false});
const menu=document.getElementById('menu');
const toastElement=document.getElementById('toast');
const joystick=document.getElementById('joystick'),knob=document.getElementById('joyKnob');
const labels={gate:document.getElementById('label-gate'),gate2:document.getElementById('label-gate2'),cost:document.getElementById('label-cost'),upgrade:document.getElementById('label-upgrade'),lane:document.getElementById('label-score')};
const pauseButton=document.getElementById('pauseButton');
const playButton=document.getElementById('playButton');
const sceneButton=document.getElementById('sceneButton');
let renderer,world,sim,stage=0,paused=true,keys=new Set(),drag={id:null,x:0,y:0,originX:0,originY:0},last=0,clocks=0,sound=null,notifUntil=0,upgradeUnlocked=false;
function loadProgress(){try{let p=JSON.parse(localStorage.getItem('video-dozer-v01')||'null');if(p&&Number.isInteger(p.deposit)){return {deposit:clamp(p.deposit,0,2500),done:!!p.done}}}catch(e){}return {deposit:0,done:false}}
function saveProgress(){try{localStorage.setItem('video-dozer-v01',JSON.stringify({deposit:sim.deposit,done:sim.won}))}catch(e){}}
function loadScene(s,preserve=false){stage=s;world=new World(stage);sim=new Simulation(stage);if(stage===0&&preserve){let p=loadProgress();sim.deposit=p.deposit;sim.remaining=2500-p.deposit;sim.won=p.done;sim.player.level=p.done?1:0}if(renderer){renderer.camera.x=sim.player.x;renderer.camera.z=sim.player.z};sceneButton.textContent='切换预览场景：'+(stage===0?'熔岩矿场':'粉晶岩洞');updateUI()}
function toast(text,seconds=2.1){toastElement.textContent=text;toastElement.classList.add('active');notifUntil=clocks+seconds}
function beep(freq=530,length=.1,vol=.045){try{sound=sound||new(window.AudioContext||window.webkitAudioContext)();if(sound.state==='suspended')sound.resume();let oscillator=sound.createOscillator(),gain=sound.createGain();oscillator.type='triangle';oscillator.frequency.setValueAtTime(freq,sound.currentTime);oscillator.frequency.exponentialRampToValueAtTime(freq*.72,sound.currentTime+length);gain.gain.setValueAtTime(vol,sound.currentTime);gain.gain.exponentialRampToValueAtTime(.0002,sound.currentTime+length);oscillator.connect(gain);gain.connect(sound.destination);oscillator.start();oscillator.stop(sound.currentTime+length)}catch(e){}}
function handleEvents(){let deposited=0,processed=0;
 for(const event of sim.events){switch(event.type){
  case 'multiply':toast('×'+event.factor+'！资源按倍数增殖（超大数量使用聚合显示）',1.65);beep(850,.13,.065);break;
  case 'deposit':deposited++;if(sim.deposit%10===0||sim.remaining===2499){beep(380+sim.deposit%100*4,.045,.015)}break;
  case 'process':processed++;break;
  case 'upgrade':sim.player.level=1;upgradeUnlocked=true;toast('UPGRADE！升级已完成，重型红罐履带机已解锁',5);beep(660,.65,.12);saveProgress();break;
  case 'restock':toast('新的矿石和金币已刷新',2.2);break;
 }}sim.events.length=0;
 if(deposited&&sim.deposit%7===0)saveProgress();
}
function updateUI(){document.getElementById('score').textContent=formatNum(sim?(stage?sim.multipliedValue:sim.processed):0);document.getElementById('left').textContent=stage===0?(sim.won?'完成':formatNum(sim.remaining)):'预览';labels.cost.textContent=stage===0?formatNum(sim.remaining):'10000';labels.lane.textContent=formatNum(sim.processed);document.querySelector('#topbar .stats span:first-child').firstChild.textContent=stage?'倍增值 ':'已入库 ';document.getElementById('hint').textContent=paused?'触摸屏幕任意处驾驶 / WASD':'触摸拖动驾驶 · P 暂停 · 铲球过门，推金币升级';}
function positionLabels(){for(const e of Object.values(labels))e.style.display='none';const sites=world.sites;
 function place(el,site,yOffset=0){if(!site)return;let p=renderer.screen(site.x,site.y+yOffset,site.z);if(p&&p.visible){el.style.display='block';el.style.left=p.x+'px';el.style.top=p.y+'px'}}
 if(stage===0){place(labels.gate,sites.gate);place(labels.cost,sites.cost);place(labels.upgrade,sites.upgradeText);place(labels.lane,sites.counter)}
 else place(labels.gate2,sites.gate2);
}
function inputVector(){let x=0,y=0;if(keys.has('KeyW')||keys.has('ArrowUp'))y--;if(keys.has('KeyS')||keys.has('ArrowDown'))y++;if(keys.has('KeyA')||keys.has('ArrowLeft'))x--;if(keys.has('KeyD')||keys.has('ArrowRight'))x++;
 if(drag.id!==null){x+=drag.x;y+=drag.y}
 let len=Math.hypot(x,y);if(len>1){x/=len;y/=len}
 // Project joystick motion using the exact fixed-camera azimuth.
 return screenStickToWorld(x,y);}
function drawFrame(t){let dt=Math.min((t-last)/1000||.016,.046);last=t;clocks+=dt;
 if(renderer){
 if(!paused){const v=inputVector();sim.update(dt,v.x,v.z,world);handleEvents()}
 renderer.begin(clocks,sim.player,dt);
 world.render(renderer,clocks);
 renderTreads(renderer,sim.treads,stage);
 renderResources(renderer,sim.resources,clocks,renderer.camera);
 renderVehicle(renderer,sim.player,clocks);
 renderer.end();positionLabels();
 if(Math.floor(clocks*8)!==Math.floor((clocks-dt)*8))updateUI();
 document.getElementById('hint').classList.toggle('dismissed',!paused&&clocks>12);
 }
 if(clocks>notifUntil)toastElement.classList.remove('active');
 requestAnimationFrame(drawFrame)
}
function showMenu(){paused=true;menu.classList.add('visible');playButton.textContent='继续驾驶';drag.id=null;joystick.style.display='none';updateUI()}
function hideMenu(){paused=false;menu.classList.remove('visible');toast(stage===0?'先推蓝色球体穿过 ×10，再铲起金币推往右上方 UPGRADE': '后期场景预览：青色铲斗、紫色岩层、金条与 ×10000 门',4);updateUI()}
function moveTouch(e){const dx=e.clientX-drag.originX,dy=e.clientY-drag.originY,max=52,mag=Math.max(1,Math.hypot(dx,dy)/max);drag.x=dx/max/mag;drag.y=dy/max/mag;knob.style.transform=`translate(${drag.x*42}px,${drag.y*42}px)`}
function releasePointer(e){if(drag.id!==e.pointerId)return;drag.id=null;drag.x=drag.y=0;joystick.style.display='none';knob.style.transform='translate(0,0)'}
canvas.addEventListener('pointerdown',e=>{if(paused||drag.id!==null||e.button>0)return;drag.id=e.pointerId;drag.originX=e.clientX;drag.originY=e.clientY;drag.x=drag.y=0;joystick.style.left=e.clientX+'px';joystick.style.top=e.clientY+'px';joystick.style.display='block';canvas.setPointerCapture(e.pointerId);moveTouch(e);e.preventDefault()});
canvas.addEventListener('pointermove',e=>{if(e.pointerId===drag.id){moveTouch(e);e.preventDefault()}});
canvas.addEventListener('pointerup',releasePointer);canvas.addEventListener('pointercancel',releasePointer);
window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.code==='KeyP'||e.code==='Escape'){e.preventDefault();if(paused)hideMenu();else showMenu()}});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();drag.id=null;joystick.style.display='none'});
playButton.addEventListener('click',hideMenu);pauseButton.addEventListener('click',showMenu);
sceneButton.addEventListener('click',()=>{loadScene(stage===0?1:0,true);toast('场景已切换',2)});
document.getElementById('resetButton').addEventListener('click',()=>{if(!confirm('清除升级进度并重置当前场景？'))return;try{localStorage.removeItem('video-dozer-v01')}catch(e){}loadScene(stage,false);toast('当前场景已重置')});
try{renderer=new Renderer(canvas);loadScene(0,true);renderer.camera.x=sim.player.x;renderer.camera.z=sim.player.z;requestAnimationFrame(drawFrame)}catch(error){console.error(error);let panel=document.querySelector('.panel');let p=document.createElement('p');p.style.color='#ffb6a3';p.textContent='图形初始化失败：'+error.message;panel.append(p);playButton.disabled=true;}
