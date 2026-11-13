"""Browser integration and granular physics regression suite for v0.3.
Requires python playwright + Chromium, run under xvfb-run on Linux.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
source=Path(__file__).resolve().parents[1]
s=(source/'dist/index.html').read_text(encoding='utf8')
needle='try{renderer=new Renderer(canvas);'
assert needle in s
s=s.replace(needle,'window.__dozerTest={get sim(){return sim},get world(){return world},loadScene,GranularSolver};\n'+needle)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=False,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu-sandbox','--ignore-gpu-blocklist','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 for viewport in ({'width':390,'height':844},{'width':720,'height':1360},{'width':1280,'height':720}):
  page=browser.new_page(viewport=viewport)
  errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  page.set_content(s)
  page.wait_for_timeout(300)
  page.locator('#playButton').click()
  values=page.evaluate('''() => {
   const {sim,world,GranularSolver}=window.__dozerTest;
   // Fixed-in-place scoop must not magnetically draw a distant resource.
   let r=sim.resources.find(q=>q.kind==='blue');r.x=sim.player.x+1;r.z=sim.player.z-2.45;r.y=0;r.vx=0;r.vz=0;r.vy=0;
   const before={x:r.x,z:r.z};
   const stationary= new GranularSolver();
   stationary.step([r],1/60,{...sim.player,speed:0},{x:sim.player.x,z:sim.player.z});
   const noMagnet=Math.hypot(r.x-before.x,r.z-before.z)<.01;
   // Stationary, vertical pile: fall, settle, no NaNs.
   const a={kind:'gold',x:23,z:17,y:0,vx:0,vz:0,vy:0,spin:0,dead:false};
   const b={kind:'gold',x:23,z:17,y:.33,vx:0,vz:0,vy:0,spin:0,dead:false};
   const stack=new GranularSolver();const still={x:23,z:17,yaw:0,speed:0,level:0};
   for(let t=0;t<130;t++)stack.step([a,b],1/60,still,still);
   const stacked=b.y>.13 && Math.hypot(a.x-b.x,a.z-b.z)<.20 && b.y<.6;
   // Repeated scoop movement should displace, elevate and overflow loose coins.
   const pile=[];for(let j=0;j<9;j++)for(let i=0;i<11;i++)pile.push({kind:'gold',x:(i-5)*.31,z:3.5+(j-4)*.31,y:(j%3)*.11,vx:0,vz:0,vy:0,spin:0,dead:false});
   const solver=new GranularSolver();let vehicle={x:0,z:8,yaw:0,speed:5.5,level:0};
   let peak=0;
   for(let t=0;t<150;t++){
     const prev={x:vehicle.x,z:vehicle.z};vehicle.z-=.068;
     solver.step(pile,1/60,vehicle,prev);
     peak=Math.max(peak,solver.height);
   }
   const spread=pile.filter(q=>Math.abs(q.x)>1.95).length;
   const healthy=pile.every(q=>Number.isFinite(q.x)&&Number.isFinite(q.y)&&Number.isFinite(q.z)&&q.y>=0&&q.y<=5.2);
   const t0=performance.now();for(let i=0;i<50;i++)sim.update(.016,0,-1,world);
   const ms=(performance.now()-t0)/50;
   return {noMagnet,stacked,stackHeights:[a.y,b.y],stackHorizontal:Math.hypot(a.x-b.x,a.z-b.z),peak,spread,healthy,meanUpdateMs:ms,contacts:sim.physics.contacts,objects:sim.physics.objects};
  }''')
  print(viewport, values)
  assert values['noMagnet'] and values['healthy'], values
  assert values['stacked'], values
  assert values['peak']>.20 and values['spread']>0, values
  assert values['meanUpdateMs']<65,values
  page.screenshot(path=str(source.parent/f'v03_{viewport["width"]}.png'))
  assert not errors,errors
  page.close()
 browser.close()
