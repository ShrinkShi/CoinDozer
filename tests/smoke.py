"""GUI smoke test, requires Playwright + Chromium + Xvfb on Linux.
Run: xvfb-run -a python tests/smoke.py
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
source=Path(__file__).resolve().parents[1]
s=(source/'dist'/'index.html').read_text()
needle='try{renderer=new Renderer(canvas);'
assert needle in s
s=s.replace(needle,'window.__dozerTest={get sim(){return sim},get world(){return world},loadScene};\n'+needle)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=False,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu-sandbox','--ignore-gpu-blocklist','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':390,'height':844})
 errors=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.set_content(s)
 page.wait_for_timeout(550)
 assert not page.locator('#playButton').is_disabled()
 page.locator('#playButton').click()
 page.wait_for_timeout(350)
 assert page.locator('#menu').evaluate('(el)=>getComputedStyle(el).display')=='none'
 result=page.evaluate('''() => {
  const {sim,world}=window.__dozerTest;
  const p=sim.player;
  const startZ=p.z;
  sim.update(.03,0,-1,world);
  const moved=p.z<startZ;
  // Isolate the specific gate test particle from unrelated pile contacts.
  let r=sim.resources.find(r=>r.kind==='blue');
  sim.resources=[r];
  r.x=2.8;r.z=3.42;r.y=0;r.vx=0;r.vy=0;r.vz=-9;r.passedGates=0;r.dead=false;
  const initialTotal=1;
  sim.update(.044,0,0,world);
  const multiplyTotal=sim.resources.filter(r=>!r.dead).length;
  const multiplied=!!(r.passedGates&(1<<2)) && multiplyTotal===2;
  sim.player.x=19;sim.player.z=-12;
  let coin={kind:'gold',x:19,z:-12,y:0,vx:0,vy:0,vz:0,cooldown:0,spin:0,dead:false};
  sim.resources.push(coin);
  coin.x=19;coin.z=-12;coin.vx=0;coin.vz=0;
  const before=sim.remaining;
  sim.update(.022,0,0,world);
  const deducted=before===30&&sim.remaining===29;
  sim.tracks.chassis.deposited=29;sim.deposit=29;sim.remaining=1;
  const another={kind:'gold',x:19,z:-12,y:0,vx:0,vy:0,vz:0,cooldown:0,spin:0,dead:false};
  sim.resources.push(another);
  another.x=19;another.z=-12;another.vx=0;another.vz=0;
  sim.update(.022,0,0,world);
  return {moved,initialTotal,multiplyTotal,multiplied,deducted,remaining:sim.remaining,upgrade:sim.level===1,events:sim.events.map(e=>e.type)};
 }''')
 print('Physics checks:',result)
 assert result['moved']
 assert result['multiplied']
 assert result['deducted']
 assert result['upgrade']
 assert not errors,errors
 page.locator('#pauseButton').click()
 assert page.locator('#menu').is_visible()
 page.locator('#sceneButton').click()
 assert page.locator('#sceneButton').inner_text().endswith('粉晶岩洞')
 page.locator('#playButton').click()
 page.wait_for_timeout(350)
 assert '×2' in page.locator('.world-label:visible').all_text_contents()
 assert not errors,errors
 print('All UI + physics smoke tests passed.')
 browser.close()
