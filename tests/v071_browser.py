"""v0.7.1 mobile browser smoke: working minimap, target switching and
normal forward driving, without asserting graphics-ad pixel fidelity."""
from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
html=(root/'dist/index.html').read_text(encoding='utf-8')
assert 'VIDEO REPLICA · 0.7.3' in html
needle='try{\n loadScene(loadProgress().stage===1?1:0,true);'
assert needle in html
html=html.replace(needle,
 'window.__v071={get sim(){return sim},get world(){return world},'
 'get stage(){return stage},get renderer(){return renderer},loadScene};\n'+needle)
args=['--no-sandbox','--disable-dev-shm-usage','--ignore-gpu-blocklist',
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=args)
 context=browser.new_context(viewport={'width':390,'height':844},
                             device_scale_factor=2,is_mobile=True,has_touch=True)
 page=context.new_page()
 errors=[]
 page.on('pageerror',lambda err:errors.append(str(err)))
 page.on('console',lambda msg:errors.append('console: '+msg.text)
         if msg.type=='error' else None)
 page.route('http://coindozer.test/**',
            lambda r:r.fulfill(status=200,content_type='text/html',body=html))
 page.goto('http://coindozer.test/',wait_until='load')
 page.wait_for_function('window.__v071 && window.__v071.sim')
 assert page.locator('#stageBadge').inner_text()=='冰河矿场'
 assert page.locator('#navMap').count()==1
 assert page.locator('#navReadout').inner_text().startswith('初始矿石')
 assert page.locator('#navCycle').inner_text()=='导航：自动'
 assert page.evaluate("""() => {
  const el=document.getElementById('navMap'),c=el.getContext('2d');
  return c.getImageData(40,50,1,1).data[3]>0;
 }"""), 'navigation map must actually draw pixels'
 page.locator('#playButton').click()
 assert not page.locator('#menu').evaluate('(e)=>e.classList.contains("visible")')
 page.locator('#navCycle').click()
 assert page.locator('#navCycle').inner_text()=='目标：初始矿石'
 page.locator('#navCycle').click()
 assert page.locator('#navCycle').inner_text()=='目标：矿石数字门'
 assert '矿石数字门' in page.locator('#navReadout').inner_text()
 start=page.evaluate('window.__v071.sim.player.z')
 page.keyboard.down('w')
 page.wait_for_timeout(500)
 page.keyboard.up('w')
 end=page.evaluate('window.__v071.sim.player.z')
 assert end>start, f'W should move towards northern bridge ({start}, {end})'
 assert page.locator('#navReadout').is_visible()
 page.evaluate('window.__v071.loadScene(1,true)')
 assert page.locator('#navHud').is_hidden(), 'no fake stage0 map on ice level'
 page.evaluate('window.__v071.loadScene(0,true)')
 assert page.locator('#navHud').is_visible()
 assert not errors,errors
 print('v0.7.1 mobile: generated minimap, goal cycling, true forward controls, no JS errors PASS',flush=True)
 context.close()
 browser.close()
