"""v0.7.2 mobile integration: visible cargo, real loading, persistence and payment."""
from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
html=(root/'dist/index.html').read_text(encoding='utf-8')
assert 'VIDEO REPLICA · 0.7.4' in html
needle='try{\n loadScene(loadProgress().stage===1?1:0,true);'
assert needle in html
html=html.replace(needle,
 'window.__v072={get sim(){return sim},get world(){return world},get stage(){return stage},'
 'updateUI,handleEvents,saveProgress,setPaused(value){paused=Boolean(value)}};\n'+needle)
args=['--no-sandbox','--disable-dev-shm-usage','--ignore-gpu-blocklist',
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=args)
 context=browser.new_context(viewport={'width':390,'height':844},
                             device_scale_factor=2,is_mobile=True,has_touch=True)
 page=context.new_page()
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:errors.append('console: '+m.text) if m.type=='error' else None)
 page.route('http://coindozer.test/**',
            lambda r:r.fulfill(status=200,content_type='text/html',body=html))
 page.goto('http://coindozer.test/',wait_until='load')
 page.wait_for_function('window.__v072 && window.__v072.sim')
 assert page.locator('#cargoCount').inner_text()=='0/20'
 assert page.locator('#topbar .stats span').count()==4
 page.locator('#playButton').click()
 page.evaluate('window.__v072.setPaused(true)')
 # Exercise the real Simulation cargo state machine while pausing the RAF loop
 # so the test controls exact fixed time steps.
 state=page.evaluate("""() => {
  const x=window.__v072,s=x.sim,p=s.player;
  const coin={kind:'gold',x:p.x+1,z:p.z,y:0,vx:0,vy:0,vz:0,
   dead:false,passedGates:0,cooldown:0,spin:0,angle:0};
  s.resources=[coin];s.granular.step=()=>{};
  s.update(.044,0,0,x.world);x.handleEvents();x.updateUI();
  for(let i=0;i<12;i++){s.update(.044,0,0,x.world);x.handleEvents();}
  x.updateUI();x.saveProgress();
  return {cargo:coin.cargoState,count:s.cargoCount(),id:coin.id,
   capacity:s.cargoCapacity(),position:[coin.x,coin.y,coin.z]};
 }""")
 assert state['cargo']=='stored' and state['count']==1 and state['capacity']==20,state
 assert page.locator('#cargoCount').inner_text()=='1/20'
 # Refresh in a stored state: the same ID must be reconstructed as a visible
 # cargo entity rather than a hidden wallet balance.
 page.reload(wait_until='load')
 page.wait_for_function('window.__v072 && window.__v072.sim')
 restored=page.evaluate("""() => {
  const s=window.__v072.sim;
  const cargo=s.resources.filter(r=>!r.dead&&r.cargoState);
  return {count:s.cargoCount(),ids:cargo.map(r=>r.id),states:cargo.map(r=>r.cargoState)};
 }""")
 assert restored=={'count':1,'ids':[state['id']],'states':['stored']},restored
 assert page.locator('#cargoCount').inner_text()=='1/20'
 page.locator('#playButton').click()
 page.evaluate("""() => {
  const x=window.__v072,s=x.sim,w=x.world;
  x.setPaused(true);s.selectUpgrade('cargo');s.tracks.cargo.deposited=24;
  s.player.x=w.upgradeStation.x;s.player.z=w.upgradeStation.z;
  s.granular.step=()=>{};
  for(let i=0;i<14;i++){s.update(.044,0,0,w);x.handleEvents();}
  x.updateUI();
 }""")
 paid=page.evaluate("""() => ({level:window.__v072.sim.tracks.cargo.level,
  count:window.__v072.sim.cargoCount(),capacity:window.__v072.sim.cargoCapacity()})""")
 assert paid=={'level':1,'count':0,'capacity':40},paid
 assert page.locator('#cargoCount').inner_text()=='0/40'
 assert not errors,errors
 print('v0.7.2 mobile: cargo HUD, loading animation state, reload recovery and outbound payment PASS',flush=True)
 context.close()
 browser.close()
