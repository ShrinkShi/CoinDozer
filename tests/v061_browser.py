"""v0.6.1: live Chromium test of phone and desktop diagnostics with no JS errors.
Run: xvfb-run -a python tests/v061_browser.py
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'dist/index.html').read_text(encoding='utf-8')
assert 'VIDEO REPLICA · 0.6.3' in html
needle='try{renderer=new Renderer(canvas);'
assert needle in html
html=html.replace(needle,'window.__v061={get sim(){return sim},get renderer(){return renderer},get world(){return world},updateUI};\n'+needle)
args=['--no-sandbox','--disable-dev-shm-usage','--ignore-gpu-blocklist','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=args)
 for width,height in [(390,844),(960,700)]:
  page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html,wait_until='load',timeout=30000)
  page.locator('#playButton').click()
  page.locator('#telemetryToggle').click()
  assert page.locator('#telemetryPanel').is_visible()
  assert page.locator('#metricEntities').inner_text()!='--'
  assert '0.6.3' in page.locator('.ver').inner_text()
  result=page.evaluate('''() => {
   const {sim,world}=window.__v061;
   sim.resources=[];sim.elapsed=30;
   sim.replenishResources();
   const prior=sim.telemetry.snapshot(30).recent.goldProduced;
   const priorValue=sim.telemetry.snapshot(30).recent.goldValueProduced;
   sim.telemetry.record('goldProduced',18,30);
   sim.telemetry.record('goldValueProduced',36,30);
   window.__v061.updateUI();
   return {minted:document.getElementById('metricGoldRate').innerText,
    value:document.getElementById('metricValueRate').innerText,
    resource:document.getElementById('metricEntities').innerText,
    supply:document.getElementById('metricSupply').innerText,prior,priorValue};
  }''')
  assert int(result['minted'])==(result['prior']+18)*2,result
  assert int(result['value'])==(result['priorValue']+36)*2,result
  assert '/' in result['resource'],result
  assert '/' in result['supply'],result
  page.locator('#telemetryToggle').click()
  assert page.locator('#telemetryPanel').is_hidden()
  # Keyboard toggle should be available in addition to mobile button.
  page.keyboard.press('F3')
  assert page.locator('#telemetryPanel').is_visible()
  assert not errors,errors
  page.close()
  print(f'v0.6.1 {width}x{height}: browser inspector, rates, toggle, no JS errors PASS')
 browser.close()
