"""Browser acceptance checks against local generated preview or actual published URL."""
import concurrent.futures, functools, hashlib, http.server, json, os, pathlib, threading, time
from urllib.parse import quote
import requests
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path.cwd();OUT=ROOT/'catalogue-v10-check';OUT.mkdir(exist_ok=True)
data=json.loads((ROOT/'assets/preview-catalogue-v10.json').read_text());report={};errors=[]
base=os.getenv('CHECK_BASE_URL','')
if not base:
 handler=functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(ROOT))
 server=http.server.ThreadingHTTPServer(('127.0.0.1',8765),handler)
 threading.Thread(target=server.serve_forever,daemon=True).start();base='http://127.0.0.1:8765/'
newpaths=['case-pinghu-watermelon.html','case-shanhai-ip.html']

def check_asset(url):
 try:
  with requests.get(url,headers={'Range':'bytes=0-31'},timeout=18,stream=True) as r:
   ok=r.status_code in [200,206] and r.headers.get('Content-Type','').startswith('image/')
   return {'url':url,'status':r.status_code,'type':r.headers.get('Content-Type'),'ok':ok}
 except Exception as e:return {'url':url,'error':str(e),'ok':False}

try:
 if not os.getenv('SKIP_MEDIA_AUDIT'):
  urls=sorted(set([p['image'] for p in data['projects']]+[u for k in newpaths for u in data['pages'][k]['images']]))
  with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:assets=list(pool.map(check_asset,urls))
  report['images_checked']=len(assets);report['image_failures']=[a for a in assets if not a['ok']]
  assert not report['image_failures'], 'Official image failures: '+str(report['image_failures'])
 with sync_playwright() as p:
  browser=p.chromium.launch()
  page=browser.new_page(viewport={'width':1440,'height':960})
  page.on('pageerror',lambda e:errors.append(str(e)))
  requests_seen=[];page.on('request',lambda r:requests_seen.append(r.url))
  page.goto(base+'preview-0086.html?v=10&check='+str(time.time())+'#/home',wait_until='domcontentloaded')
  page.wait_for_function("window.__0086Catalogue?.version===10 && window.__0086?.projects.length===23 && !!window.__0086Field && !!window.__0086Music",timeout=35000)
  report['revision']=page.evaluate('document.documentElement.dataset.designRevision')
  report['no_eva']=page.locator('#eva-overlay').count()==0
  report['language_style']=page.locator('[data-language=zh]').evaluate('(e)=>({background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color})')
  assert report['language_style']['background']!='rgb(153, 153, 255)'
  assert report['no_eva']
  page.locator('.entry-link').first.click()
  # Existing music should continue untouched. Playback failure here is recorded, not hidden.
  try:
   page.wait_for_function('__0086Music.playing && __0086Music.audioTime>1',timeout=25000)
   report['audio']=page.evaluate('({mode:__0086Music.mode,title:__0086Music.title,playing:__0086Music.playing,time:__0086Music.audioTime})')
   beats=page.evaluate('__0086Music.beats')
   page.mouse.move(50,500);page.mouse.move(1200,400,steps=30);page.wait_for_timeout(500)
   report['gesture_beats']=page.evaluate('__0086Music.beats')>beats
  except Exception as e:report['audio_check_error']=str(e)
  page.locator('.nav a[data-type=all]').click()
  page.wait_for_function('document.querySelectorAll("#projects > .project").length===23')
  report['first_projects']=page.locator('#projects .pname').all_text_contents()[:3]
  assert report['first_projects'][:2]==['一颗，平湖西瓜','怪奇疗愈所 — 山海经 IP']
  report['counts']=page.evaluate('Object.fromEntries([...document.querySelectorAll("[data-count]")].map(e=>[e.dataset.count,e.textContent]))')
  assert report['counts']=={'all':'23','interactive':'07','space':'02','exhibition':'09','ip':'04'}
  assert page.locator('.ptype').filter(has_text='创意技术').count()==1
  report['years']=page.locator('#years .year-number').all_text_contents()
  page.locator('[data-year="2019"]').click();assert page.locator('#projects .pname').all_text_contents()==['GAME ON 潮流游戏展']
  page.locator('[data-year="all"]').click()
  page.screenshot(path=str(OUT/'works-desktop.png'))
  for slug in newpaths:
   idx=next(p['id'] for p in data['projects'] if p['href']==slug)
   page.locator(f'.project[data-id="{idx}"] > summary').click()
   page.wait_for_selector(f'.project[data-id="{idx}"] .catalogue-content')
   content=page.locator(f'.project[data-id="{idx}"] .catalogue-content')
   assert content.locator('img').count()==data['pages'][slug]['image_count']
   first=content.locator('img').first;first.scroll_into_view_if_needed()
   first.evaluate('e=>e.loading="eager"');page.wait_for_function('(s)=>{const e=document.querySelector(s);return e&&e.complete&&e.naturalWidth>0}',arg=f'.project[data-id="{idx}"] .catalogue-content img',timeout=25000)
   first.click();page.wait_for_selector('#lightbox[open]');page.locator('#lightbox button').click()
   if slug=='case-shanhai-ip.html':
    original=content.locator('details.shanhai-original').first
    original.locator('summary').click();assert original.evaluate('e=>e.open')
    assert page.evaluate('__0086.state.project')==slug
    original.locator('summary').click();assert not original.evaluate('e=>e.open')
    link=content.locator('.character-tabs a').last;link.click()
    assert page.evaluate('__0086.state.project')==slug
   page.locator('#scroll').evaluate('e=>e.scrollTop=0')
   page.screenshot(path=str(OUT/(slug.removesuffix('.html')+'.png')))
   page.locator(f'.project[data-id="{idx}"] > summary').click()
  # Verify every local case renders its current snapshot, without falling back to cover-only links.
  rendered=[]
  for project in data['projects']:
   if project['href'].startswith(('http:','https:')):continue
   page.locator(f'.project[data-id="{project["id"]}"] > summary').click()
   page.wait_for_selector(f'.project[data-id="{project["id"]}"] .catalogue-content')
   rendered.append(project['title'])
   page.locator(f'.project[data-id="{project["id"]}"] > summary').click()
  report['case_details_rendered']=rendered
  # Mobile and desktop retain gutters, including long character content.
  checks=[]
  for width in [320,390,768,1024,1440]:
   page.set_viewport_size({'width':width,'height':900})
   for lang in ['zh','en']:
    page.locator('[data-language='+lang+']').click()
    page.wait_for_timeout(80)
    checks.append(page.evaluate('({width:innerWidth,lang:document.documentElement.lang,overflow:document.documentElement.scrollWidth>innerWidth+1})'))
   if width==390:page.screenshot(path=str(OUT/'works-mobile.png'),full_page=True)
  report['layouts']=checks;assert not any(x['overflow'] for x in checks)
  assert not any('0086-service-ai-installation.html' in u for u in requests_seen), 'Stale catalogue was requested'
  report['no_stale_catalogue_request']=True
  report['errors']=errors;assert not errors
  page.set_viewport_size({'width':1440,'height':960});page.locator('[data-language=zh]').click()
  page.locator('.return-home').click();page.wait_for_selector('#landing:not([hidden])')
  page.screenshot(path=str(OUT/'home.png'))
  if page.evaluate('__0086Music.playing'):
   page.locator('#sound-toggle').click();assert not page.evaluate('__0086Music.playing')
  browser.close()
 report['passed']=True
finally:
 report.setdefault('errors',errors)
 (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
