"""Sync preview-only content from the owner's current official All Works.
Never changes production index, approved layout, particle renderer or music.
"""
from __future__ import annotations
import concurrent.futures, datetime, hashlib, json, pathlib, re
from urllib.parse import urljoin, urlparse
import requests
from bs4 import BeautifulSoup

ROOT=pathlib.Path.cwd()
OFFICIAL='https://0086studios.xyz/'
OUT=ROOT/'assets/preview-catalogue-v10.json'
CATMAP={'互动装置':'interactive','空间':'space','展览':'exhibition','IP设计':'ip','IP 设计':'ip','创意技术':'other'}
unchanged=['index.html','assets/preview-0086-field-v6.js','assets/preview-0086-music-v6.js','assets/preview-0086-layout-v4.css','assets/preview-0086-light-v6.css']
hashes={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in unchanged}
cache={}
def get(path):
 url=urljoin(OFFICIAL,path)
 if url in cache:return cache[url]
 r=requests.get(url,timeout=25,headers={'User-Agent':'0086-owned-site-content-sync/1.0','Cache-Control':'no-cache'})
 r.raise_for_status();r.encoding='utf-8';cache[url]=r.text;return r.text

def parsed(path):return BeautifulSoup(get(path),'html.parser')
def absolute(value,base):
 url=urljoin(base,value)
 return url if urlparse(url).scheme in {'https','http','mailto','tel'} else ''

def clean_page(path):
 doc=parsed(path);main=doc.select_one('main')
 if not main:raise ValueError('Missing main: '+path)
 for e in list(main.select('script,style,link,iframe,object,embed,form,.back,.header-back,.corner-icons,.lightbox,.next-project')):e.decompose()
 prefix='catalog-'+path.removesuffix('.html')+'-'
 idmap={e['id']:prefix+e['id'] for e in main.select('[id]')};base=urljoin(OFFICIAL,path)
 for e in main.find_all(True):
  for a in list(e.attrs):
   if a.lower().startswith('on') or a in {'style','srcdoc','autofocus','autoplay'}:del e[a]
  if e.get('id'):e['id']=idmap[e['id']]
  for attr in ['aria-labelledby','aria-describedby','aria-controls','for']:
   if attr in e.attrs:e[attr]=' '.join(idmap.get(k,k) for k in e[attr].split())
  for attr in ['src','poster','data-image-src']:
   if e.get(attr):e[attr]=absolute(e[attr],base)
  if e.get('srcset'):
   e['srcset']=', '.join(absolute(x.strip().split()[0],base)+' '+' '.join(x.strip().split()[1:]) for x in e['srcset'].split(',') if x.strip())
  if e.get('href'):
   v=e['href']
   if v.startswith('#') and v[1:] in idmap:e['href']='#'+idmap[v[1:]];e.attrs.pop('target',None)
   else:e['href']=absolute(v,base);e['target']='_blank';e['rel']='noopener noreferrer'
  if e.name=='img':e['loading']='lazy';e['decoding']='async';e.attrs.pop('fetchpriority',None)
  if e.name=='video':e['controls']='';e['playsinline']='';e['preload']='none'
  if e.get('data-external-src'):
   if not e.get('src'):e['src']=absolute(e['data-external-src'],base)
   del e['data-external-src']
 images=[x['src'] for x in main.select('img[src]') if x['src']]
 return {'url':base,'html':''.join(str(c) for c in main.contents),'images':images,'image_count':len(images),'video_count':len(main.select('video'))}

allworks=parsed('0086-all-works.html');metadata=parsed('0086-service-ai-installation.html')
years={a.get('href'):int(a.get('data-year','0')) for a in metadata.select('main .card[data-year]') if str(a.get('data-year','')).isdigit()}
projects=[]
for a in allworks.select('main a.project[data-category]'):
 caption=a.select_one('figcaption span');img=a.select_one('img');href=a.get('href','')
 title=caption.get_text(' ',strip=True) if caption else img.get('alt','') if img else ''
 category=CATMAP.get(a.get('data-category'))
 if not title or not href or not category:raise ValueError('Unmapped project '+str(a)[:100])
 projects.append({'id':len(projects),'title':title,'category':category,'year':years.get(href,0),'href':href,'image':absolute(img.get('src',''),OFFICIAL) if img else ''})
assert len(projects)>=23,'Official catalogue unexpectedly lost entries'
assert len({p['href'] for p in projects})==len(projects),'Duplicate projects'
assert {'case-pinghu-watermelon.html','case-shanhai-ip.html'}<={p['href'] for p in projects}
paths=[p['href'] for p in projects if not urlparse(p['href']).scheme]+['0086-about.html','0086-ai.html']
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:pages=dict(zip(paths,pool.map(clean_page,paths)))
data={'version':10,'source':urljoin(OFFICIAL,'0086-all-works.html'),'retrieved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'projects':projects,'pages':pages}
OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
sourcepath=ROOT/'preview-0086-source.html';source=sourcepath.read_text()
oldrows=re.search(r'const SOURCE_ROWS=\[(.*?)\n\];',source,re.S);assert oldrows
olditems=re.findall(r"\['([^']*)','([^']*)',(\d+),'([^']*)','([^']*)'\]",oldrows[1]);oldyear={a[3]:int(a[2]) for a in olditems}
rowarr=[[p[k] for k in ['title','category','year','href','image']] for p in projects]
source=source[:oldrows.start()]+'const SOURCE_ROWS='+json.dumps(rowarr,ensure_ascii=False,indent=2)+';'+source[oldrows.end():]
source=source.replace("other:''","other:'创意技术'").replace('.sort((a,b)=>b.year-a.year||a.id-b.id)','.sort((a,b)=>a.id-b.id)')
source=source.replace('const resolve=p=>new URL(p,base).href;',"const resolve=p=>new URL(p,base).href;\nconst originalURL=p=>new URL(p,'https://0086studios.xyz/').href;")
source=source.replace('21</span>','23</span>').replace('data-count="exhibition">8','data-count="exhibition">9').replace('data-count="ip">3','data-count="ip">4')
start=source.index('async function getPage(');end=source.index('function coverMarkup(',start)
newload=r'''async function getPage(path){
 if(pageCache.has(path))return pageCache.get(path);
 const snapshot=window.__0086Catalogue?.pages?.[path];
 if(snapshot){const doc=new DOMParser().parseFromString('<main>'+snapshot.html+'</main>','text/html');pageCache.set(path,doc);return doc;}
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
 try{const response=await fetch(resolve(path),{signal:ctrl.signal});if(!response.ok)throw new Error('HTTP '+response.status);const doc=new DOMParser().parseFromString(await response.text(),'text/html');if(!doc.querySelector('main'))throw new Error('Missing main');pageCache.set(path,doc);return doc;}finally{clearTimeout(timer);}
}
async function loadContent(path){
 const doc=await getPage(path),node=document.createElement('div');node.className='source-content catalogue-content';
 const source=doc.querySelector('main').cloneNode(true),snapshot=window.__0086Catalogue?.pages?.[path];
 source.querySelectorAll('script,style,iframe,object,embed,form,link,.back,.header-back,.corner-icons,.lightbox').forEach(n=>n.remove());
 for(const e of source.querySelectorAll('*')){
  for(const a of [...e.attributes])if(a.name.startsWith('on')||['style','srcdoc'].includes(a.name)||(a.name==='id'&&!a.value.startsWith('catalog-')))e.removeAttribute(a.name);
  for(const a of ['src','href','poster','data-image-src']){
   const value=e.getAttribute(a);if(!value)continue;if(a==='href'&&value.startsWith('#catalog-'))continue;
   let u;try{u=new URL(value,snapshot?.url||resolve(path));}catch{e.removeAttribute(a);continue;}
   if(!['https:','http:','file:','mailto:'].includes(u.protocol)){e.removeAttribute(a);continue;}e.setAttribute(a,u.href);
  }
  if(e.tagName==='IMG'){e.loading='lazy';e.decoding='async';}
  if(e.tagName==='VIDEO'){e.controls=true;e.playsInline=true;e.preload='none';e.removeAttribute('autoplay');}
  if(e.tagName==='A'&&!e.getAttribute('href')?.startsWith('#catalog-')){e.target='_blank';e.rel='noopener noreferrer';}
 }
 node.append(...source.childNodes);return node;
}
'''
source=source[:start]+newload+source[end:]
source=source.replace('esc(resolve(p.href))','esc(originalURL(p.href))').replace('a.href=resolve(p.href)','a.href=originalURL(p.href)')
source=source.replace("if(!summary)return;e.preventDefault();","if(!summary||!summary.matches('.project > summary'))return;e.preventDefault();")
start=source.index("const dialog=$('#lightbox');");end=source.index('// Weather is only a material input.',start)
viewer=r'''const dialog=$('#lightbox');
$('#scroll').addEventListener('click',e=>{
 const anchor=e.target.closest('a[href^="#catalog-"]');
 if(anchor){e.preventDefault();document.getElementById(anchor.getAttribute('href').slice(1))?.scrollIntoView({block:'start',behavior:'auto'});return;}
 const trigger=e.target.closest('[data-image-src]'),img=e.target.closest('.gallery img,.catalogue-content figure img');
 if(!trigger&&!img)return;
 e.preventDefault();dialog.querySelector('img').src=trigger?.getAttribute('data-image-src')||img.currentSrc||img.src;
 dialog.querySelector('img').alt=trigger?.getAttribute('data-image-alt')||img?.alt||'';dialog.showModal();
});
dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
// The latest published All Works snapshot is the sole catalogue source.
function refreshCatalogue(){const current=window.__0086Catalogue?.projects;if(Array.isArray(current)&&current.length>=SOURCE_ROWS.length){rows=current.map((p,id)=>({...p,id}));route();}}
'''
source=source[:start]+viewer+source[end:];sourcepath.write_text(source,encoding='utf-8')
shellpath=ROOT/'preview-0086.html';shell=shellpath.read_text()
shell=shell.replace("other:''","other:'创意技术'",1).replace("other:''","other:'Creative Technology'",1)
shell=shell.replace("dataset.designRevision='clean-luminous-v8'","dataset.designRevision='clean-catalogue-v10'")
shell=shell.replace("e.target.matches('.project summary')","e.target.matches('.project > summary')")
old="fetch(new URL('preview-0086-source.html',root),{signal:controller.signal,cache:'no-cache'})\n.then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.text()})\n.then(html=>{"
new="Promise.all([\n fetch(new URL('preview-0086-source.html?v=10',root),{signal:controller.signal,cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.text();}),\n fetch(new URL('assets/preview-catalogue-v10.json?v=10',root),{signal:controller.signal,cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('Catalogue HTTP '+r.status);return r.json();})\n]).then(([html,catalogue])=>{\n  if(catalogue.version!==10||!Array.isArray(catalogue.projects)||catalogue.projects.length<23)throw new Error('Catalogue mismatch');"
assert old in shell,'Unexpected shell loader';shell=shell.replace(old,new)
old="+'window.SITE_CONFIG='+JSON.stringify(config)+';'+close"
new="+'window.SITE_CONFIG='+JSON.stringify(config)+';window.__0086Catalogue='+JSON.stringify(catalogue).replace(/</g,'\\\\u003c')+';'+close"
assert old in shell;shell=shell.replace(old,new)
shell=shell.replace("html=html.replace('</head>',","html=html.replace('</head>','<link rel=\"stylesheet\" href=\"assets/preview-catalogue-v10.css?v=10\"></head>');\n  html=html.replace('</head>',",1)
shellpath.write_text(shell,encoding='utf-8')
css=r'''/* Scoped case-content adapter. Approved site chrome, audio and particles are unchanged. */
.source-content.catalogue-content{min-width:0;overflow-wrap:anywhere;--content-gap:20px}
.catalogue-content *, .catalogue-content *::before,.catalogue-content *::after{box-sizing:border-box;min-width:0}
.catalogue-content figure{margin:0}.catalogue-content figcaption{font-size:10.56px;line-height:1.6;color:#b7b7c6;margin-top:7px}
.catalogue-content img{display:block;max-width:100%;height:auto}.catalogue-content h4{font-weight:400;font-size:14px;margin:14px 0}
.catalogue-content section{margin:24px 0 36px}.catalogue-content .case-heading{margin:20px 0}.catalogue-content .case-heading p{margin:0;color:#bbb;font-size:11px}
.catalogue-content .case-heading h1{font:400 24px/1.45 var(--mono);letter-spacing:0}
.catalogue-content .watermelon-intro,.catalogue-content .shanhai-opening{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start}
.catalogue-content .watermelon-intro img{width:100%;max-height:590px;object-fit:contain;object-position:top}
.catalogue-content .case-photo-grid,.catalogue-content .shanhai-source-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
.catalogue-content .case-facts{display:grid;gap:10px;margin:20px 0}.catalogue-content .case-facts>div{display:grid;grid-template-columns:80px 1fr;gap:12px}.catalogue-content dt{color:#aaa}.catalogue-content dd{margin:0}
.catalogue-content .exhibition-themes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:0;list-style:none}
.catalogue-content .character-tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:20px 0 28px}
.catalogue-content .character-tabs a{font-size:11px;line-height:1.6;text-align:center;text-decoration:none}.catalogue-content .character-tabs img{width:100%;margin-bottom:5px}
.catalogue-content .shanhai-profile{padding-top:22px;border-top:1px solid rgba(255,255,255,.2);margin:28px 0 36px;scroll-margin-top:20px}
.catalogue-content .shanhai-role-heading h3{font-size:20px}.catalogue-content .shanhai-role-heading h3 span{font-size:12px;color:#aaa;margin-left:8px}
.catalogue-content .shanhai-color-views{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:24px 0}
.catalogue-content .shanhai-image-open{display:block;padding:0;border:0;background:none;width:100%;cursor:zoom-in;color:inherit}
.catalogue-content .shanhai-image-open img{width:100%}.catalogue-content .shanhai-intro-heading{margin-top:22px}.catalogue-content .shanhai-intro-heading span{color:#aaa;font-size:10.56px}
.catalogue-content details{margin:18px 0;border-top:1px solid rgba(255,255,255,.14);padding-top:8px}
.catalogue-content details>summary{display:list-item;list-style:disclosure-closed;min-height:0;padding:10px 0;font-size:12px;cursor:pointer}
.catalogue-content details[open]>summary{list-style:disclosure-open}.catalogue-content details>summary::-webkit-details-marker{display:revert}
.catalogue-content .gallery,.catalogue-content .videos{gap:12px}.catalogue-content figure img{cursor:zoom-in}
@media(max-width:720px){.catalogue-content .watermelon-intro,.catalogue-content .shanhai-opening,.catalogue-content .case-photo-grid,.catalogue-content .shanhai-source-grid{grid-template-columns:1fr}.catalogue-content .case-heading h1{font-size:20px}.catalogue-content .character-tabs{grid-template-columns:repeat(3,minmax(0,1fr))}.catalogue-content .shanhai-color-views{gap:6px}.catalogue-content .case-facts>div{grid-template-columns:68px 1fr}}
'''
(ROOT/'assets/preview-catalogue-v10.css').write_text(css,encoding='utf-8')
changes=[{'title':p['title'],'before':oldyear[p['href']],'after':p['year']} for p in projects if p['href'] in oldyear and p['year']!=oldyear[p['href']]]
report={'source':data['source'],'retrieved_at':data['retrieved_at'],'count':len(projects),'added':[p['title'] for p in projects if p['href'] not in oldyear],'year_changes':changes,'unpublished_years':[p['title'] for p in projects if not p['year']],'category_counts':{v:sum(p['category']==v for p in projects) for v in set(CATMAP.values())},'pages':{k:{x:v[x] for x in ['image_count','video_count','url']} for k,v in pages.items()},'preserved_files':hashes}
for p,digest in hashes.items():assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==digest,'Protected file modified: '+p
(ROOT/'catalogue-v10-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='pages'},ensure_ascii=False,indent=2))
