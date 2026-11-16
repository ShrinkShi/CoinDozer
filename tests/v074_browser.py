"""v0.7.4 mobile smoke: opt-in NPC prototype, shared simulation and UI isolation."""
from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
html=(root/'dist/index.html').read_text(encoding='utf-8')
assert 'VIDEO REPLICA · 0.7.4' in html
needle='try{\n loadScene(loadProgress().stage===1?1:0,true);'
assert needle in html
html=html.replace(needle,
 "window.__v074={get sim(){return sim},get world(){return world},"
 "get stage(){return stage},saveProgress,updateUI,loadScene};\n"+needle)
args=['--no-sandbox','--disable-dev-shm-usage','--ignore-gpu-blocklist',
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=args)
 context=browser.new_context(viewport={'width':390,'height':844},
  device_scale_factor=2,is_mobile=True,has_touch=True)
 page=context.new_page()
 errors=[]
 page.on('pageerror',lambda err:errors.append(str(err)))
 page.on('console',lambda m:errors.append('console: '+m.text) if m.type=='error' else None)
 page.route('http://coindozer.test/**',
  lambda r:r.fulfill(status=200,content_type='text/html',body=html))
 page.goto('http://coindozer.test/',wait_until='load')
 page.wait_for_function('window.__v074 && window.__v074.sim')
 assert page.locator('#npcToggle').is_visible()
 assert page.locator('#npcToggle').get_attribute('aria-pressed')=='false'
 assert page.locator('#npcReadout').inner_text().startswith('待机')
 page.locator('#playButton').click()
 page.evaluate("""() => {
  const s=window.__v074.sim;
  s.player.x=28;s.player.z=-47;
 }""")
 before=page.evaluate("() => ({x:window.__v074.sim.npc.x,z:window.__v074.sim.npc.z})")
 page.locator('#npcToggle').click()
 assert page.locator('#npcToggle').get_attribute('aria-pressed')=='true'
 page.wait_for_timeout(3500)
 after=page.evaluate("""() => {
  const n=window.__v074.sim.npc;
  return {x:n.x,z:n.z,state:n.state,treads:n.treads.length,
   enabled:n.enabled,target:n.targetId};
 }""")
 assert after['enabled'] and after['state'] in ('search','approach','push','recover','blocked'),after
 assert ((after['x']-before['x'])**2+(after['z']-before['z'])**2)**.5>.2,after
 assert after['treads']>0,after
 page.locator('#npcToggle').click()
 assert page.locator('#npcToggle').get_attribute('aria-pressed')=='false'
 assert page.locator('#npcReadout').inner_text().startswith('待机')
 page.evaluate("window.__v074.saveProgress()")
 saved=page.evaluate("() => JSON.parse(localStorage.getItem('coindozer-progress-v06'))")
 assert 'npc' not in saved,'prototype is not silently persisted as hired inventory'
 page.evaluate("window.__v074.loadScene(1,true);window.__v074.updateUI()")
 assert page.locator('#npcToggle').is_hidden()
 page.evaluate("window.__v074.loadScene(0,true);window.__v074.updateUI()")
 assert page.locator('#npcToggle').is_visible()
 assert page.locator('#npcToggle').get_attribute('aria-pressed')=='false'
 assert not errors,errors
 print('v0.7.4 mobile: opt-in NPC toggle, visible movement, tread feedback, no economy/save leakage, stage isolation PASS',flush=True)
 context.close()
 browser.close()
