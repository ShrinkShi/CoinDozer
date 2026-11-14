"""Browser smoke: mobile startup must never be a silent dead button.

External tools (Python Playwright / Chromium) are CI-only; the game still has
zero runtime npm or PyPI dependencies.
"""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
html=(root/'dist'/'index.html').read_text(encoding='utf-8')
assert 'VIDEO REPLICA · 0.6.5' in html, 'offline bundle did not build'

flags=['--no-sandbox','--disable-dev-shm-usage','--ignore-gpu-blocklist',
       '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
       '--enable-unsafe-swiftshader']
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=flags)
    for width,height,mobile in [(390,844,True),(412,915,True),(1280,720,False)]:
        context=browser.new_context(
            viewport={'width':width,'height':height},
            device_scale_factor=2 if mobile else 1,
            is_mobile=mobile,has_touch=mobile)
        page=context.new_page()
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('console',lambda message:errors.append('console: '+message.text)
                if message.type=='error' else None)
        page.set_content(html,wait_until='load',timeout=30000)
        page.wait_for_timeout(750)
        button=page.locator('#playButton')
        assert button.count()==1
        state=page.evaluate("""() => ({
          disabled:document.getElementById('playButton').disabled,
          modal:document.getElementById('menu').className,
          buttonText:document.getElementById('playButton').textContent,
          failMessages:[...document.querySelectorAll('.panel p')]
            .map(x=>x.textContent).filter(x=>x.includes('图形初始化失败')),
          webgl2:!!document.createElement('canvas').getContext('webgl2')
        })""")
        print(f'{width}x{height} mobile={mobile}: startup state '+json.dumps(state,ensure_ascii=False),flush=True)
        assert not state['disabled'],f'entry button disabled: {state!r}; errors={errors!r}'
        button.click(timeout=10000)
        page.wait_for_timeout(400)
        assert not page.locator('#menu').evaluate('(el)=>el.classList.contains("visible")'),(
            f'click did not close menu; errors={errors!r}')
        camera=page.locator('#cameraModeButton')
        assert camera.is_visible(), 'camera framing control should remain visible'
        assert camera.get_attribute('aria-pressed') == 'false'
        camera.click()
        assert camera.get_attribute('aria-pressed') == 'true', 'close-up toggle works'
        assert '特写' in camera.inner_text()
        camera.click()
        assert camera.get_attribute('aria-pressed') == 'false', 'full view can be restored'
        assert not errors,errors
        print(f'{width}x{height}: entered mine, switched camera twice PASS',flush=True)
        context.close()
    browser.close()
