"""v0.4 contact, visual geometry, mobile/desktop browser checks.
Run: xvfb-run -a python -u tests/v04_browser.py
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'dist/index.html').read_text('utf8')
needle='try{renderer=new Renderer(canvas);'
assert needle in html
html=html.replace(needle,'window.__dozerTest={get sim(){return sim},get world(){return world},get renderer(){return renderer},GranularSolver,nearestScoopContact,particleHalfHeight,updateCoinOrientation,GEOMETRY,createResourceLayout};\n'+needle)
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=False,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--ignore-gpu-blocklist','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 for width,height in [(390,844),(1280,720)]:
  page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
  errors=[];page.on('pageerror', lambda err: errors.append(str(err)))
  page.set_content(html)
  page.locator('#playButton').click()
  result=page.evaluate('''() => {
    const {GranularSolver,particleHalfHeight,nearestScoopContact,GEOMETRY,sim,world} = window.__dozerTest;
    const coin=()=>({kind:'gold',x:0,z:-2.55,y:0,vx:0,vy:0,vz:0,dead:false,tiltX:0,tiltZ:0,angle:0});
    const n=nearestScoopContact(2.5,.25);
    const solver=new GranularSolver(), moving={x:0,z:0,yaw:0,speed:5.5,level:1},prev={x:0,z:.11};
    const c=coin(),z0=c.z;
    solver.step([c],1/60,moving,prev);
    const scoopForward=c.z<z0-.025;
    const scoopLifted=c.y>0;
    const out=coin();out.x=5;
    solver.step([out],1/60,moving,prev);
    const outsideUnmoved=Math.hypot(out.x-5,out.z+2.55)<.002;
    const resting=coin();const still={x:0,z:0,yaw:0,speed:0,level:1};
    solver.step([resting],1/60,still,still);
    const noMagnet=resting.z===-2.55;
    const rolling=coin();rolling.vx=5;rolling.vz=-2;
    for(let i=0;i<40;i++){rolling.vx=4;rolling.vz=-1.5;solver.step([rolling],1/60,still,still);}
    const coinTilts=Math.abs(rolling.tiltX)+Math.abs(rolling.tiltZ)>.2;
    const tiltIncreasesHeight=particleHalfHeight(rolling)>.14;
    const mesh=GEOMETRY.coin;
    const oneCoinGeometry=mesh.vertices.length>200 && mesh.indices.length>300;
    const gate=sim.resources.find(r=>r.kind==='blue');
    sim.resources=[gate];gate.x=1;gate.z=3.42;gate.vz=-9;gate.vy=0;gate.dead=false;gate.passed=false;
    sim.update(.044,0,0,world);
    const gateWorks=sim.resources.length>1&&gate.passed;
    const first={kind:'gold',x:19,z:-12,y:0,vx:0,vy:0,vz:0,dead:false,cooldown:0};
    sim.resources.push(first);const before=sim.remaining;sim.update(.022,0,0,world);
    return {scoopForward,scoopLifted,outsideUnmoved,noMagnet,coinTilts,tiltIncreasesHeight,oneCoinGeometry,gateWorks,depositWorks:sim.remaining===before-1,curveNormal:[n.nAhead,n.nUp],coinExtent:particleHalfHeight(rolling)};
  }''')
  print(f'{width}x{height}:',result,flush=True)
  for name in ('scoopForward','scoopLifted','outsideUnmoved','noMagnet','coinTilts','tiltIncreasesHeight','oneCoinGeometry','gateWorks','depositWorks'):
   assert result[name],(name,result)
  assert not errors,errors
  if width==390:
   page.evaluate('''() => {
    const {sim}=window.__dozerTest;
    sim.player.x=17.1;sim.player.z=11;sim.player.yaw=0;sim.player.level=1;
    // The screenshot focuses on the 50-second gold-pile scene; actual
    // gameplay state and resources remain from the full simulated world.
    window.__dozerTest.renderer.camera.x=17.1;
    window.__dozerTest.renderer.camera.z=9.5;
    sim.resources=window.__dozerTest.createResourceLayout(0).filter(x=>x.kind==='gold');
   }''')
   page.wait_for_timeout(600)
   page.screenshot(path=str(root/'docs/v04_金币堆_390.png'))
  else:
   page.wait_for_timeout(150)
  page.close()
 browser.close()
print('v0.4 browser regression passed.',flush=True)
