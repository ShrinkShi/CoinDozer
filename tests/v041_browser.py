"""Live browser joystick test. Run: xvfb-run -a python tests/v041_browser.py"""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'dist/index.html').read_text('utf8')
needle='try{renderer=new Renderer(canvas);'
assert needle in html
html=html.replace(needle,'window.__controls={get sim(){return sim},inputVector};\n'+needle)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=False,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--ignore-gpu-blocklist','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(html);page.locator('#playButton').click()
 page.evaluate('window.__controls.sim.resources=[]')
 rect=page.locator('#scene').bounding_box()
 assert rect
 x=rect['x']+rect['width']*.5;y=rect['y']+rect['height']*.74
 for name,(dx,dy) in {'up':(0,-42),'right':(42,0),'down':(0,42),'left':(-42,0)}.items():
  page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+dx,y+dy,steps=4)
  v=page.evaluate('window.__controls.inputVector()');page.mouse.up()
  sx=v['x']*.872-v['z']*.489;sy=v['x']*.489+v['z']*.872
  assert sx*dx+sy*dy>25,(name,v)
 assert not errors,errors
 browser.close()
print('v0.4.1 browser joystick test passed')
