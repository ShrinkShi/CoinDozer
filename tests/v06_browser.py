"""v0.6 phone/desktop UI, real coin deposits, old saves and zoom.
Run: xvfb-run -a python tests/v06_browser.py
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'dist/index.html').read_text('utf8')
needle='try{renderer=new Renderer(canvas);'
assert needle in html
html=html.replace(needle,'window.__v06={get sim(){return sim},get world(){return world},get renderer(){return renderer},saveProgress,loadProgress,updateUI};\n'+needle)
args=['--no-sandbox','--disable-dev-shm-usage','--ignore-gpu-blocklist','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
with sync_playwright() as p:
 browser=p.chromium.launch(headless=False,executable_path='/usr/bin/chromium',args=args)
 for width,height in [(390,844),(960,700)]:
  page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html,wait_until='load',timeout=25000)
  page.locator('#playButton').click(timeout=10000)
  page.wait_for_timeout(160)
  assert '0.6.1' in page.locator('.ver').inner_text()
  assert page.locator('#label-gate-0').inner_text()=='×2'
  assert page.locator('#coinValueStat').inner_text()=='×1'
  page.locator('#upgradeButton').click()
  assert page.locator('#upgradePicker').is_visible()
  assert page.locator('.track-option').count()==5
  page.locator('button[data-track="coin"]').click()
  assert page.locator('#upgradePicker').is_hidden()
  assert page.locator('button[data-track="coin"]').get_attribute('aria-pressed')=='true'
  # Physically feed coins to the vehicle station while the vehicle is nearby.
  state=page.evaluate('''() => {
   const {sim,world}=window.__v06;
   sim.granular.step=()=>{};
   const s=world.upgradeStation;
   sim.player.x=s.x;sim.player.z=s.z;
   sim.resources=Array.from({length:25},()=>({kind:'gold',x:s.x,z:s.z,y:0,vx:0,vz:0,vy:0,dead:false}));
   sim.update(.033,0,0,world);window.__v06.updateUI();window.__v06.saveProgress();
   return {coinTier:sim.tracks.coin.level,value:document.getElementById('coinValueStat').innerText,remaining:sim.tracks.coin.deposited,gates:sim.gateTracks.map(x=>x.level)};
  }''')
  assert state['coinTier']==1,state
  assert state['value']=='×2',state
  assert state['gates']==[0,0,0,0]
  zoom=page.evaluate('window.__v06.renderer.camera.zoom')
  page.evaluate("document.getElementById('scene').dispatchEvent(new WheelEvent('wheel',{deltaY:-320,cancelable:true,bubbles:true}))")
  zoom_after=page.evaluate('window.__v06.renderer.camera.zoom')
  assert zoom_after<zoom
  if width==390:
   status=page.evaluate('''() => {
    const c=document.getElementById('scene'),s=window.__v06.renderer.camera.zoom;
    const pointer=(name,id,x,y)=>c.dispatchEvent(new PointerEvent(name,{pointerId:id,pointerType:'touch',clientX:x,clientY:y,button:0,bubbles:true}));
    pointer('pointerdown',11,120,500);pointer('pointerdown',12,220,500);
    pointer('pointermove',11,100,500);pointer('pointermove',12,240,500);
    const changed=window.__v06.renderer.camera.zoom;
    pointer('pointerup',11,100,500);pointer('pointerup',12,240,500);
    return {start:s,end:changed};
   }''')
   assert status['end']<status['start'],status
  # screenshot: wipe manipulated in-memory entities and reset player to initial
  page.evaluate('''() => {const {sim}=window.__v06;
   sim.player.x=0;sim.player.z=11;sim.resources=[];
   window.__v06.updateUI();}''')
  page.wait_for_timeout(80)
  assert not errors,errors
  out=root/'docs'/f'v06_{width}.png'
  page.screenshot(path=str(out),timeout=60000)
  print(f'{width}x{height}: PASS; screenshot {out}; coin level {state["coinTier"]}',flush=True)
  page.close()
 browser.close()
