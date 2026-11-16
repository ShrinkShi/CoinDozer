"""v0.7.4 Chromium: five fixed pads, paid belt construction, physics and reload.
Runtime remains one standalone HTML with no browser-side framework dependency.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
html=(root/'dist/index.html').read_text(encoding='utf-8')
assert 'VIDEO REPLICA · 0.7.4' in html
needle='try{\n loadScene(loadProgress().stage===1?1:0,true);'
assert needle in html
html=html.replace(needle,
 "window.__v073={get sim(){return sim},get world(){return world},"
 "get stage(){return stage},saveProgress,handleEvents,updateUI,loadScene,"
 "freeze(value){paused=Boolean(value)}};\n"+needle)
args=['--no-sandbox','--disable-dev-shm-usage','--ignore-gpu-blocklist',
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=args)
 context=browser.new_context(viewport={'width':390,'height':844},
  device_scale_factor=2,is_mobile=True,has_touch=True)
 page=context.new_page()
 errors=[]
 page.on('pageerror',lambda err: errors.append(str(err)))
 page.on('console',lambda m: errors.append('console: '+m.text) if m.type=='error' else None)
 page.route('http://coindozer.test/**',
  lambda r:r.fulfill(status=200,content_type='text/html',body=html))
 page.goto('http://coindozer.test/',wait_until='load')
 page.wait_for_function('window.__v073 && window.__v073.sim')
 assert page.locator('#beltStatus').inner_text().startswith('固定传送带 0/5')
 assert page.locator('.world-label.belt-cost').count()==5
 assert page.evaluate("window.__v073.world.conveyors.length")==0
 page.locator('#playButton').click()
 page.evaluate('window.__v073.freeze(true)')
 state=page.evaluate("""() => {
  const x=window.__v073,s=x.sim,w=x.world,p=w.conveyorStations[0];
  s.player.x=p.x;s.player.z=p.z;
  const coin={kind:'gold',id:78321,x:p.x,z:p.z,y:.82,vx:0,vy:0,vz:0,
   dead:false,cargoState:'stored',cargoSlot:0,cooldown:0,spin:0,angle:0};
  s.resources=[coin];s.granular.step=()=>{};
  s.update(.044,0,0,w);x.handleEvents();
  const flying=coin.cargoState==='unloading'&&!coin.dead;
  for(let i=0;i<12;i++){s.update(.044,0,0,w);x.handleEvents();}
  const completed=coin.dead&&s.beltTracks[0].deposited===1;
  for(let k=1;k<24;k++){
   if(!s.payCoin({kind:'gold',dead:false},null,'belt',0))
     throw Error('conveyor construction payment rejected');
  }
  s.update(.044,0,0,w);x.handleEvents();x.updateUI();x.saveProgress();
  return {flying,completed,level:s.beltTracks[0].level,
   built:w.conveyors.length,paid:s.coinsSpent.belt};
 }""")
 assert state=={'flying':True,'completed':True,'level':1,'built':1,'paid':24},state
 assert page.locator('#beltStatus').inner_text().startswith('固定传送带 1/5')
 assert '原矿上料 · 升级需' in page.locator('#label-belt-0').inner_text()
 # Reload must preserve the built belt even though no free granular state saves.
 page.reload(wait_until='load')
 page.wait_for_function('window.__v073 && window.__v073.sim')
 restored=page.evaluate("""() => ({
  tier:window.__v073.sim.beltTracks[0].level,
  belts:window.__v073.world.conveyors.length,
  stage:window.__v073.stage,
  total:window.__v073.sim.totalDeposited})""")
 assert restored['tier']==1 and restored['belts']==1 and restored['stage']==0,restored
 assert restored['total']>=24,restored
 traveled=page.evaluate("""() => {
  const x=window.__v073,s=x.sim,w=x.world;
  const ore={kind:'blue',x:0,z:-40,y:0,vx:0,vy:0,vz:0,
   dead:false,cooldown:0,angle:0,spin:0};
  s.resources=[ore];s.player.x=29;s.player.z=45;
  s.update(.044,0,0,w);
  return ore.z>-40;
 }""")
 assert traveled,'a purchased belt must move an independent ore in real physics'
 assert page.locator('#beltStatus').inner_text().startswith('固定传送带 1/5')
 # Legacy second map doesn't run or pay these first-stage machines.
 page.evaluate("window.__v073.loadScene(1,true)")
 assert page.locator('#beltStatus').is_hidden()
 assert page.evaluate("window.__v073.world.conveyors.length")==0
 page.evaluate("window.__v073.loadScene(0,true)")
 assert page.evaluate("window.__v073.world.conveyors.length")==1
 assert page.locator('#beltStatus').is_visible()
 assert not errors,errors
 print('v0.7.4 mobile: five build pads, cargo-paid belt, persistent build and stage isolation PASS',flush=True)
 context.close()
 browser.close()
