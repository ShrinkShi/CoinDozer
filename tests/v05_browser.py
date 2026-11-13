"""Browser GUI test, wheel/pinch/joystick and visible upgrades. xvfb-run -a python tests/v05_browser.py"""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'dist/index.html').read_text('utf8')
needle='try{renderer=new Renderer(canvas);'
assert needle in html
html=html.replace(needle,'window.__v05={get sim(){return sim},get world(){return world},get renderer(){return renderer},get pointers(){return pointers},get pinchLocked(){return pinchLocked},get drag(){return drag},loadScene};\n'+needle)
args=['--no-sandbox','--disable-dev-shm-usage','--ignore-gpu-blocklist','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
with sync_playwright() as p:
 browser=p.chromium.launch(headless=False,executable_path='/usr/bin/chromium',args=args)
 for width,height in [(390,844),(1280,720)]:
  page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html,wait_until='load',timeout=25000)
  page.locator('#playButton').click(timeout=10000)
  page.wait_for_timeout(120)
  assert '0.5.1' in page.locator('.ver').inner_text()
  assert '实体' in page.locator('#resourceCount').inner_text()
  assert page.locator('#label-gate-0').count()==1
  # Hit the real canvas wheel event.
  before=page.evaluate('window.__v05.renderer.camera.zoom')
  page.evaluate("document.getElementById('scene').dispatchEvent(new WheelEvent('wheel',{deltaY:-550,cancelable:true,bubbles:true}))")
  page.wait_for_timeout(120)
  after=page.evaluate('window.__v05.renderer.camera.zoom')
  assert after<before,(before,after)
  if width==390:
   # A real two-pointer sequence, including release with one finger remaining.
   state=page.evaluate('''() => {
    const c=document.getElementById('scene'),v=window.__v05;
    const ev=(name,id,x,y)=>c.dispatchEvent(new PointerEvent(name,{pointerId:id,pointerType:'touch',clientX:x,clientY:y,button:0,bubbles:true}));
    const start=v.renderer.camera.zoom;
    ev('pointerdown',13,150,460);ev('pointerdown',14,230,460);
    ev('pointermove',13,120,460);ev('pointermove',14,260,460);
    const opened=v.renderer.camera.zoom;
    ev('pointermove',13,174,460);ev('pointermove',14,205,460);
    const pinched=v.renderer.camera.zoom;
    ev('pointerup',13,174,460);
    const locked=v.pinchLocked && v.drag.id===null;
    ev('pointerup',14,205,460);
    const released=!v.pinchLocked && v.drag.id===null;
    ev('pointerdown',15,165,440);
    const resumed=v.drag.id===15;
    ev('pointerup',15,165,440);
    return {start,opened,pinched,locked,released,resumed,pointers:v.pointers.size};
   }''')
   print('mobile pinch:',state,flush=True)
   assert state['opened']<state['start'],state
   assert state['pinched']>state['opened'],state
   assert state['locked'] and state['released'] and state['resumed'] and state['pointers']==0,state
  # Inspect world preview geometry; stationed vehicle generated from real model.
  details=page.evaluate('''() => ({
    gates:window.__v05.world.gates.map(g=>g.multiplier),
    upgradeStation:window.__v05.world.upgradeStation,
    level:window.__v05.sim.player.level,
    resources:window.__v05.sim.resources.filter(r=>!r.dead).length,
    active:window.__v05.sim.activeCount
  })''')
  assert details['gates']==[2,3,5,10],details
  assert details['upgradeStation']
  assert details['resources']==details['active']
  assert not errors,errors
  screenshot=root/'docs'/f'v05_{width}.png'
  page.screenshot(path=str(screenshot),timeout=30000)
  print(f'{width}x{height}: GUI PASS, screenshot={screenshot.name}, resources={details["resources"]}',flush=True)
  page.close()
 browser.close()
