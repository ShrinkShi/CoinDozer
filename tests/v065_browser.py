"""v0.6.5 browser integration: switch to real cave, use both maps, reload saved state.

Playwright/Chromium is installed only in CI. The release remains standalone
WebGL + HTML without runtime package dependencies.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'dist/index.html').read_text(encoding='utf-8')
assert 'VIDEO REPLICA · 0.6.5' in html
needle='try{\n loadScene(loadProgress().stage===1?1:0,true);'
assert needle in html, 'game script initialization contract changed'
html=html.replace(needle,
    'window.__v065={get sim(){return sim},get world(){return world},'
    'get stage(){return stage},saveProgress,loadScene,updateUI};\n'+needle)

flags=['--no-sandbox','--disable-dev-shm-usage','--ignore-gpu-blocklist',
       '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
       '--enable-unsafe-swiftshader']
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=flags)
    context=browser.new_context(viewport={'width':390,'height':844},
                                device_scale_factor=2,is_mobile=True,has_touch=True)
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('console',lambda msg:errors.append('console: '+msg.text)
            if msg.type=='error' else None)
    page.route('http://coindozer.test/**',
               lambda route:route.fulfill(status=200,content_type='text/html',body=html))
    page.goto('http://coindozer.test/',wait_until='load')
    page.wait_for_function('window.__v065 && window.__v065.sim')
    assert page.locator('#stageBadge').inner_text()=='熔岩矿场'
    assert page.locator('#sceneButton').inner_text().endswith('粉晶岩洞')
    page.locator('#sceneButton').click()
    assert page.locator('#stageBadge').inner_text()=='粉晶岩洞'
    assert '粉晶岩洞' in page.locator('#stageInfo').inner_text()
    assert page.locator('#coinValueStat').inner_text()=='×3'
    cave=page.evaluate("""() => {
      const x=window.__v065,s=x.sim,w=x.world;
      return {stage:x.stage,gateCount:w.gates.length,pads:w.gateStations.length,
       ingredients:s.resources.filter(x=>x.kind==='pearl'&&!x.dead).length,
       ingots:s.resources.filter(x=>x.kind==='ingot'&&!x.dead).length,
       station:Boolean(w.upgradeStation&&w.upgradeStation.trigger),
       crusher:Boolean(w.crusher&&w.crusher.trigger),
       currency:s.rules.currency};
    }""")
    assert cave['stage']==1 and cave['gateCount']==2 and cave['pads']==2,cave
    assert cave['ingredients']>100 and cave['ingots']>100,cave
    assert cave['station'] and cave['crusher'] and cave['currency']=='ingot',cave
    # Exercise the real stage1 save code without pretending the player earned
    # money. Change controlled test data and inspect canonical storage fields.
    state=page.evaluate("""() => {
      const x=window.__v065,s=x.sim;
      s.tracks.speed.level=2;
      s.gateTracks[0].level=1;
      s.selectUpgrade('steering');
      x.saveProgress();
      return JSON.parse(localStorage.getItem('coindozer-progress-v06'));
    }""")
    assert state['stage']==1
    assert state['tracks']['speed']['level']==2
    assert state['caveGates'][0]['level']==1
    page.reload(wait_until='load')
    page.wait_for_function('window.__v065 && window.__v065.stage===1')
    after=page.evaluate("""() => ({
      stage:window.__v065.stage,
      speed:window.__v065.sim.tracks.speed.level,
      caveGate:window.__v065.sim.gateTracks[0].level,
      selected:window.__v065.sim.selectedUpgrade})""")
    assert after=={'stage':1,'speed':2,'caveGate':1,'selected':'steering'},after
    # Drive inside the cave with the same controls as the first stage.
    page.locator('#playButton').click()
    assert not page.locator('#menu').evaluate('(e)=>e.classList.contains("visible")')
    assert page.locator('#cameraModeButton').is_visible()
    page.locator('#cameraModeButton').click()
    assert page.locator('#cameraModeButton').get_attribute('aria-pressed')=='true'
    page.locator('#cameraModeButton').click()
    page.locator('#pauseButton').click()
    page.locator('#sceneButton').click()
    assert page.locator('#stageBadge').inner_text()=='熔岩矿场'
    lava=page.evaluate("""() => {
      const x=window.__v065;return {count:x.world.gates.length,
       speed:x.sim.tracks.speed.level,gates:x.sim.gateTracks.map(t=>t.level)};
    }""")
    assert lava['count']==4 and lava['speed']==2 and lava['gates']==[0,0,0,0],lava
    page.evaluate("""() => {
      const x=window.__v065;
      x.sim.gateTracks[0].level=2;
      x.saveProgress();
    }""")
    page.locator('#sceneButton').click()
    assert page.locator('#stageBadge').inner_text()=='粉晶岩洞'
    final=page.evaluate("""() => ({
      caveLevel:window.__v065.sim.gateTracks[0].level,
      stage:JSON.parse(localStorage.getItem('coindozer-progress-v06')).stage,
      lavaLevel:JSON.parse(localStorage.getItem('coindozer-progress-v06')).gates[0].level
    })""")
    assert final=={'caveLevel':1,'stage':1,'lavaLevel':2},final
    assert not errors,errors
    print('v0.6.5 mobile browser: cave startup, both maps, cameras, independent gates, shared upgrades and reload PASS',flush=True)
    context.close();browser.close()
