"""Mobile Chromium v0.7.0: physical station, bridge lock, save, stage 2 access."""
from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
html=(root/'dist/index.html').read_text(encoding='utf-8')
assert 'VIDEO REPLICA · 0.7.2' in html
needle='try{\n loadScene(loadProgress().stage===1?1:0,true);'
assert needle in html
html=html.replace(needle,
    'window.__v070={get sim(){return sim},get world(){return world},'
    'get stage(){return stage},get renderer(){return renderer},saveProgress,handleEvents,loadScene};\n'+needle)
args=['--no-sandbox','--disable-dev-shm-usage','--ignore-gpu-blocklist',
      '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
      '--enable-unsafe-swiftshader']
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=args)
    context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=2,
                                is_mobile=True,has_touch=True)
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append('console: '+m.text) if m.type=='error' else None)
    page.route('http://coindozer.test/**',
               lambda r:r.fulfill(status=200,content_type='text/html',body=html))
    page.goto('http://coindozer.test/',wait_until='load')
    page.wait_for_function('window.__v070 && window.__v070.sim')
    assert page.locator('#stageBadge').inner_text()=='冰河矿场'
    assert page.evaluate('window.__v070.renderer.camera.mapFacing') == -1
    assert page.locator('#sceneButton').is_disabled(),'must not bypass paid bridge from menu'
    initial=page.evaluate("""() => {
      const x=window.__v070;return {gateCount:x.world.gates.length,
       ore:x.sim.resources.filter(r=>r.kind==='blue').length,
       coins:x.sim.resources.filter(r=>r.kind==='gold').length,
       recycler:x.world.recycler,firstWidth:x.world.bridges.main.width,
       north:x.world.bridges.next.width};
    }""")
    assert initial['gateCount']==1 and initial['ore']>350,initial
    assert initial['coins']==0 and initial['north']==0 and initial['firstWidth']==12,initial
    page.locator('#playButton').click()
    assert not page.locator('#menu').evaluate('(e)=>e.classList.contains("visible")')
    page.locator('#upgradeButton').click()
    assert page.locator('#featureStatus').is_visible()
    assert '主桥宽度' in page.locator('#featureStatus').inner_text()
    page.locator('#upgradeButton').click()
    page.locator('#cameraModeButton').click()
    assert page.locator('#cameraModeButton').get_attribute('aria-pressed')=='true'
    page.locator('#cameraModeButton').click()
    # Physically enter one dedicated feature pad in an actual update frame.
    first=page.evaluate("""() => {
      const x=window.__v070,s=x.sim,w=x.world,p=w.featureStations.exit;
      const coin={kind:'gold',x:p.x,z:p.z+3,y:0,vx:0,vy:0,vz:0,
       dead:false,cooldown:0,spin:0,angle:0};
      s.resources=[coin];s.player.x=p.x;s.player.z=p.z;
      s.granular.step=()=>{coin.z=p.z;};
      s.update(.016,0,0,w);x.handleEvents();
      s.granular.step=()=>{};
      for(let i=0;i<30&&!coin.dead;i++){s.update(.044,0,0,w);x.handleEvents();}
      x.saveProgress();
      return {paid:coin.dead,progress:s.tracks.exit.deposited,unlocked:s.tracks.exit.level};
    }""")
    assert first=={'paid':True,'progress':1,'unlocked':0},first
    # Pay the remainder with distinct real coin objects through the same
    # payment function. Bank access is tested independently by the terrain tests.
    unlocked=page.evaluate("""() => {
      const x=window.__v070,s=x.sim;
      for(let i=0;i<349;i++) {
       const coin={kind:'gold',dead:false};
       if(!s.payCoin(coin,'exit','feature')||!coin.dead)throw Error('coin not spent');
      }
      x.handleEvents();x.saveProgress();
      return {level:s.tracks.exit.level,stored:JSON.parse(localStorage.getItem('coindozer-progress-v06')).tracks.exit.level,
       bridge:x.world.bridges.next.width};
    }""")
    assert unlocked=={'level':1,'stored':1,'bridge':10},unlocked
    page.reload(wait_until='load')
    page.wait_for_function('window.__v070 && window.__v070.sim')
    assert page.locator('#stageBadge').inner_text()=='冰河矿场'
    assert page.evaluate('window.__v070.sim.tracks.exit.level')==1
    assert page.evaluate('window.__v070.world.bridges.next.width')==10
    assert page.locator('#sceneButton').is_disabled(),'still must drive, not click menu'
    page.locator('#playButton').click()
    transit=page.evaluate("""() => {
      const x=window.__v070,s=x.sim,w=x.world;
      s.resources=[];s.granular.step=()=>{};
      s.player.x=0;s.player.z=42.93;s.player.yaw=Math.PI;s.player.speed=5;
      s.update(.044,0,1,w);
      x.handleEvents();
      return {stage:x.stage,unlocked:x.sim.tracks.exit.level};
    }""")
    assert transit=={'stage':1,'unlocked':1},transit
    assert page.locator('#stageBadge').inner_text()=='冰雪矿区'
    assert page.evaluate('window.__v070.renderer.camera.mapFacing') == 1
    assert not page.locator('#sceneButton').is_disabled(),'return trip is available'
    page.locator('#pauseButton').click()
    page.locator('#sceneButton').click()
    assert page.locator('#stageBadge').inner_text()=='冰河矿场'
    assert page.evaluate('window.__v070.sim.tracks.exit.level')==1
    assert not errors,errors
    print('v0.7.0 mobile: startup, sole gate, no free gold, physical payment, bridge lock/unlock, snow entry, reload and return PASS',flush=True)
    context.close()
    browser.close()
