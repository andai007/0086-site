import json,time,threading,http.server,functools,pathlib,os
from playwright.sync_api import sync_playwright
OUT=pathlib.Path('touch-v12-check');OUT.mkdir(exist_ok=True)
report={'test_scope':'Chromium Android and WebKit iPhone browser emulation; not physical devices','errors':[]}
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',8765),functools.partial(Quiet,directory=os.getcwd()))
threading.Thread(target=server.serve_forever,daemon=True).start()
BASE=os.environ.get('PREVIEW_BASE','http://127.0.0.1:8765/')
def wait(page,expr):page.wait_for_function(expr,timeout=15000)
def openpage(page,hash='/home'):
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.goto(BASE+'preview-0086.html?v=12&check='+str(time.time())+'#'+hash,wait_until='domcontentloaded')
 wait(page,"document.documentElement.dataset.designRevision==='clean-touch-v12' && window.__0086Field?.frames>1 && window.__0086Music")
def touch(cdp,kind,points):
 cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[{'x':x,'y':y,'id':i} for i,x,y in points]})
def drag(page,cdp,x,y,ex,ey):
 touch(cdp,'touchStart',[(1,x,y)]);page.wait_for_timeout(80)
 for i in range(1,10):
  t=i/9;touch(cdp,'touchMove',[(1,x+(ex-x)*t,y+(ey-y)*t)]);page.wait_for_timeout(65)
 mid=page.evaluate('({camera:__0086Field.camera,touch:__0086Field.touch,beats:__0086Music.beats})')
 touch(cdp,'touchEnd',[]);return mid
try:
 with sync_playwright() as p:
  chromium=p.chromium.launch()
  ctx=chromium.new_context(**p.devices['Pixel 7'])
  page=ctx.new_page();openpage(page)
  report['silent_on_load']=page.evaluate("__0086Music.status==='off'&&!document.querySelector('audio').getAttribute('src')")
  page.touchscreen.tap(45,158)
  wait(page,"__0086Field.touch.taps>=1 && __0086Music.contextState==='running' && __0086Music.beats>=1")
  report['first_mobile_tap']=page.evaluate('({touch:__0086Field.touch,pulseAge:__0086Field.pulseAge,audio:__0086Music.status,context:__0086Music.contextState,beats:__0086Music.beats})')
  assert report['first_mobile_tap']['pulseAge']<1.5
  page.screenshot(path=str(OUT/'mobile-tap.png'))
  cdp=ctx.new_cdp_session(page);page.wait_for_timeout(500)
  report['mobile_drag']=drag(page,cdp,50,290,330,510)
  assert report['mobile_drag']['touch']['moves']>2
  assert abs(report['mobile_drag']['camera']['x'])+abs(report['mobile_drag']['camera']['y'])>.05
  assert report['mobile_drag']['beats']>report['first_mobile_tap']['beats']
  assert not page.evaluate('__0086Field.touch.active')
  touch(cdp,'touchStart',[(1,60,190)]);touch(cdp,'touchCancel',[])
  assert not page.evaluate('__0086Field.touch.active')
  touch(cdp,'touchStart',[(1,70,180),(2,270,180)]);touch(cdp,'touchEnd',[])
  assert not page.evaluate('__0086Field.touch.active')
  page.locator('#sound-toggle').tap();page.wait_for_timeout(150)
  muted=page.evaluate('__0086Music.beats');count=page.evaluate('__0086Field.touch.taps')
  page.touchscreen.tap(55,180);page.wait_for_timeout(200)
  report['muted_tap']=page.evaluate('({status:__0086Music.status,beats:__0086Music.beats,touch:__0086Field.touch,src:document.querySelector("audio").getAttribute("src")})')
  assert report['muted_tap']['status']=='off' and report['muted_tap']['beats']==muted and report['muted_tap']['touch']['taps']>count and not report['muted_tap']['src']
  page.locator('.entry-link').first.tap();wait(page,"__0086.state.view==='works'")
  checks=[]
  for cat in ['all','interactive','space','exhibition','ip']:
   page.locator('.nav a[data-type='+cat+']').tap();wait(page,"__0086.state.type==='"+cat+"'")
   checks.append(page.evaluate("({category:__0086.state.type,color:getComputedStyle(document.querySelector('.side .nav a.active')).backgroundColor,year:getComputedStyle(document.querySelector('.year.active')).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth})"))
  report['selected_states']=checks
  assert all(c['color']==c['year']=='rgb(204, 255, 0)' and not c['overflow'] for c in checks)
  page.locator('.nav a[data-type=all]').tap();wait(page,"__0086.state.type==='all'")
  assert page.locator('#projects > .project').count()==23
  page.screenshot(path=str(OUT/'mobile-green.png'),full_page=True)
  page.evaluate('window.scrollTo(0,0)');page.wait_for_timeout(100)
  report['scroll_gesture']=drag(page,cdp,210,780,210,230)
  page.wait_for_timeout(400);report['native_scroll_y']=page.evaluate('scrollY')
  assert report['native_scroll_y']>100, 'Touch feedback must not block page scrolling'
  ctx.close()

  desktop=chromium.new_context(viewport={'width':1440,'height':900});dp=desktop.new_page();openpage(dp)
  dp.locator('.entry-link').first.click();wait(dp,"__0086.state.view==='works'")
  wait(dp,"__0086Music.contextState==='running'")
  try:dp.wait_for_function('__0086Music.playing&&__0086Music.audioTime>1',timeout=30000);report['real_radio_playback']=True
  except Exception:report['real_radio_playback']=False
  start=dp.evaluate('__0086Music.beats');dp.mouse.move(200,600);dp.wait_for_timeout(450);dp.mouse.move(1100,500,steps=10);dp.wait_for_timeout(100)
  report['desktop']=dp.evaluate("({beats:__0086Music.beats,mode:__0086Music.mode,title:__0086Music.title,camera:__0086Field.camera,touchLayer:!!document.querySelector('#field-touch-feedback'),selected:getComputedStyle(document.querySelector('.nav a.active')).backgroundColor,revision:document.documentElement.dataset.designRevision})")
  assert report['desktop']['beats']>start and not report['desktop']['touchLayer']
  assert report['desktop']['mode']=='electro-radio' and report['desktop']['title']=='FIP Electro'
  dp.screenshot(path=str(OUT/'desktop-green.png'))
  for width in [320,390,768,1024,1440]:
   dp.set_viewport_size({'width':width,'height':844});assert not dp.evaluate('document.documentElement.scrollWidth>innerWidth')
  desktop.close()
  reduced=chromium.new_context(**p.devices['Pixel 7'],reduced_motion='reduce')
  reduced.add_init_script("localStorage.setItem('0086-sound-muted','1')")
  rp=reduced.new_page();openpage(rp);frames=rp.evaluate('__0086Field.frames');rp.touchscreen.tap(55,180);rp.wait_for_timeout(250)
  report['reduced_motion']=rp.evaluate('({frames:__0086Field.frames,touch:__0086Field.touch,flag:__0086Field.reducedMotion,audio:__0086Music.status})')
  assert report['reduced_motion']['flag'] and report['reduced_motion']['frames']==frames and report['reduced_motion']['audio']=='off'
  reduced.close();chromium.close()

  wk=p.webkit.launch();ios=wk.new_context(**p.devices['iPhone 13']);ip=ios.new_page();openpage(ip)
  ip.touchscreen.tap(46,160);wait(ip,"__0086Field.touch.taps>=1 && __0086Music.contextState==='running' && __0086Music.beats>=1")
  report['webkit_first_tap']=ip.evaluate('({touch:__0086Field.touch,context:__0086Music.contextState,beats:__0086Music.beats,mode:__0086Music.mode,renderer:__0086Field.renderer})')
  ip.locator('#sound-toggle').tap();ip.touchscreen.tap(55,180);assert ip.evaluate("__0086Music.status==='off'")
  ip.locator('.entry-link').first.tap();wait(ip,"__0086.state.view==='works'")
  assert ip.evaluate("getComputedStyle(document.querySelector('.nav a.active')).backgroundColor==='rgb(204, 255, 0)'")
  ip.screenshot(path=str(OUT/'iphone-green.png'));ios.close();wk.close()
 assert report['silent_on_load'] and not report['errors'],report['errors']
 report['passed']=True
finally:
 (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2));server.shutdown()
