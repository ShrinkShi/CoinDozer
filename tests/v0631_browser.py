"""Optional browser-level WebGL context lifecycle smoke test.

Requires Python Playwright and a locally installed Chromium. Not part of the
zero-dependency game runtime; use on desktop/CI with a browser to validate
actual context loss/restore and mobile-sized HUD interaction.
"""
from pathlib import Path
import shutil
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'dist/index.html').read_text(encoding='utf-8')
assert 'VIDEO REPLICA · 0.6.3.1' in html
marker='try{renderer=new Renderer(canvas);'
assert marker in html
html=html.replace(marker,
    'window.__review={get sim(){return sim},get renderer(){return renderer},'
    'get lost(){return graphicsLost},get stage(){return stage}};\n'+marker)
chrome=shutil.which('chromium') or shutil.which('google-chrome')
if not chrome:
    raise SystemExit('Chromium or Google Chrome executable required')
args=['--no-sandbox','--disable-dev-shm-usage','--ignore-gpu-blocklist',
      '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
      '--enable-unsafe-swiftshader']
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=chrome,headless=True,args=args)
    for width,height in [(390,844),(960,700)]:
        page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.set_content(html,wait_until='load',timeout=30000)
        page.wait_for_function('window.__review && window.__review.renderer')
        assert page.locator('#sceneButton').inner_text().endswith('粉晶岩洞')
        page.locator('#playButton').click()
        page.locator('#telemetryToggle').click()
        assert page.locator('#telemetryPanel').is_visible()
        page.evaluate("""() => {
          const p=document.getElementById('telemetryPanel');
          p.scrollTop=p.scrollHeight;
        }""")
        assert page.evaluate('document.getElementById("telemetryPanel").scrollTop>=0')
        page.locator('#telemetryToggle').click()
        # Browser may deliberately disable WEBGL_lose_context; do not report an
        # unexercised restoration as a verified success.
        supported=page.evaluate("""() => {
          const r=window.__review;
          window.__beforeRestore={sim:r.sim,renderer:r.renderer,zoom:r.renderer.camera.zoom};
          window.__loseExtension=r.renderer.gl.getExtension('WEBGL_lose_context');
          return Boolean(window.__loseExtension);
        }""")
        if supported:
            page.evaluate('window.__loseExtension.loseContext()')
            page.wait_for_function('window.__review.lost && !document.getElementById("graphicsStatus").hidden',
                                   timeout=5000)
            assert page.locator('#graphicsRefresh').is_visible()
            page.evaluate('window.__loseExtension.restoreContext()')
            page.wait_for_function('!window.__review.lost && document.getElementById("graphicsStatus").hidden',
                                   timeout=10000)
            assert page.evaluate("""() => {
              const r=window.__review,b=window.__beforeRestore;
              return r.sim===b.sim && r.renderer!==b.renderer &&
                Math.abs(r.renderer.camera.zoom-b.zoom)<1e-6;
            }"""),'restore must reinitialize the renderer without resetting the game'
            print(f'{width}x{height}: actual WEBGL_lose_context restoration PASS')
        else:
            print(f'{width}x{height}: WEBGL_lose_context extension unavailable; restoration NOT verified')
        assert not errors,errors
        page.close()
    browser.close()
