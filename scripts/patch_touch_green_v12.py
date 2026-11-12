from pathlib import Path
import hashlib, json

ROOT=Path('.')
def replace_once(text,old,new):
    assert text.count(old)==1, 'Unexpected patch boundary: '+old[:100]
    return text.replace(old,new,1)

preserve=['index.html','preview-0086-source.html','assets/preview-catalogue-v10.json','assets/preview-catalogue-v10.css','assets/preview-0086-layout-v4.css','assets/preview-0086-light-v6.css']
before={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in preserve}

p=ROOT/'preview-0086.html'
s=p.read_text()
s=replace_once(s,"dataset.designRevision='clean-return-v11'","dataset.designRevision='clean-touch-v12'")
s=replace_once(s,"  html=html.replace('</head>','<style id=\"return-home-clean\">'+returnStyles+'</style></head>');", "  html=html.replace('</head>','<style id=\"return-home-clean\">'+returnStyles+'</style><style id=\"selection-green\">.side .nav a.active{background:var(--lime);border-color:var(--lime);color:#080811}</style></head>');")
s=replace_once(s,'preview-0086-field-v6.js?v=7','preview-0086-field-v6.js?v=12')
s=replace_once(s,'preview-0086-music-v6.js?v=7','preview-0086-music-v6.js?v=12')
p.write_text(s)

p=ROOT/'assets/preview-0086-field-v6.js';s=p.read_text()
s=replace_once(s,'uTime,uDpr,uPointerOn,uLevel,uHome;','uTime,uDpr,uPointerOn,uLevel,uHome,uTouch;')
s=replace_once(s,'float dist=length(delta), near=exp(-dist*dist/(145.*145.))*uPointerOn;\n pos+=delta/max(dist,1.)*near*30.;','float reach=mix(145.,112.,uTouch);\n float dist=length(delta), near=exp(-dist*dist/(reach*reach))*uPointerOn;\n pos+=delta/max(dist,1.)*near*mix(30.,58.,uTouch);')
s=replace_once(s,"'PointerOn','Level','Home']","'PointerOn','Level','Home','Touch']")
s=replace_once(s,'gl.uniform1f(loc.PointerOn,pointer.active);','gl.uniform1f(loc.Touch,touchMode);gl.uniform1f(loc.PointerOn,pointer.active);')
s=replace_once(s,' frames++;',' drawTouchFeedback();\n frames++;')
s=replace_once(s,' canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);',' canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);\n sizeTouchLayer();')
a=s.index("document.addEventListener('pointermove',e=>")
b=s.index("window.addEventListener('resize',resize);",a)
s=s[:a]+r'''
// Touch is handled independently of pointer hover. Passive listeners never
// cancel scrolling/pinch zoom, including after the browser cancels a pointer.
let touchMode=0,touchId=null,touchMoves=0,touchTaps=0,lastTrail=0,lastTrailX=0,lastTrailY=0;
let touchLayer=null,touchCtx=null,staticClear=0;
const ripples=[];
const touchBlocked=el=>el instanceof Element&&!!el.closest('#site-music,#site-language,.return-home,dialog,video,input,textarea,select,[contenteditable="true"]');
function sizeTouchLayer(){if(!touchLayer)return;touchLayer.width=canvas.width;touchLayer.height=canvas.height;touchCtx.setTransform(dpr,0,0,dpr,0,0);}
function ensureTouchLayer(){
 if(touchLayer)return;
 touchLayer=document.createElement('canvas');touchLayer.id='field-touch-feedback';touchLayer.setAttribute('aria-hidden','true');
 touchLayer.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none';
 canvas.after(touchLayer);touchCtx=touchLayer.getContext('2d');sizeTouchLayer();
}
function setPointer(x,y){pointer.x=x;pointer.y=y;pointer.active=1;pointer.nx=bound(x/Math.max(1,width)*2-1,-1,1);pointer.ny=bound(y/Math.max(1,height)*2-1,-1,1);}
function pulseAt(x,y,power){hitX=bound(x/Math.max(1,width),0,1);hitY=bound(y/Math.max(1,height),0,1);hitAt=performance.now();hitPower=power;}
function glow(x,y,power=1){
 ensureTouchLayer();ripples.push({x,y,at:performance.now(),power});if(ripples.length>4)ripples.shift();
 drawTouchFeedback();
 if(reduced.matches){clearTimeout(staticClear);staticClear=setTimeout(()=>{ripples.length=0;drawTouchFeedback();},140);}
}
function drawTouchFeedback(){
 if(!touchCtx)return;
 const now=performance.now();touchCtx.clearRect(0,0,width,height);
 for(let i=ripples.length-1;i>=0;i--){
  const r=ripples[i],age=(now-r.at)/1000;if(age>.85){ripples.splice(i,1);continue;}
  const fade=Math.max(0,1-age/.85)*r.power,rad=reduced.matches?44:20+age*125;
  const g=touchCtx.createRadialGradient(r.x,r.y,0,r.x,r.y,rad*1.55);
  g.addColorStop(0,'rgba(219,239,255,'+fade*.24+')');g.addColorStop(.3,'rgba(86,149,255,'+fade*.14+')');g.addColorStop(1,'rgba(0,47,167,0)');
  touchCtx.fillStyle=g;touchCtx.fillRect(r.x-rad*1.55,r.y-rad*1.55,rad*3.1,rad*3.1);
  if(!reduced.matches){touchCtx.beginPath();touchCtx.arc(r.x,r.y,rad,0,Math.PI*2);touchCtx.strokeStyle='rgba(180,216,255,'+fade*.6+')';touchCtx.lineWidth=1;touchCtx.stroke();}
 }
}
function release(){pointer.active=0;pointer.nx=0;pointer.ny=0;}
function endTouch(){touchId=null;release();}
document.addEventListener('pointermove',e=>{if(reduced.matches||e.pointerType==='touch')return;touchMode=0;setPointer(e.clientX,e.clientY);},{passive:true});
document.documentElement.addEventListener('pointerleave',e=>{if(e.pointerType!=='touch')release();});window.addEventListener('blur',endTouch);
document.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||e.target.closest('#site-music')||reduced.matches)return;touchMode=0;pulseAt(e.clientX,e.clientY,.75);},{passive:true});
document.addEventListener('touchstart',e=>{
 if(e.touches.length!==1||touchBlocked(e.target)){endTouch();return;}
 const t=e.touches[0];touchId=t.identifier;touchMode=1;touchTaps++;lastTrail=performance.now();lastTrailX=t.clientX;lastTrailY=t.clientY;
 if(!reduced.matches){setPointer(t.clientX,t.clientY);pulseAt(t.clientX,t.clientY,1);}
 glow(t.clientX,t.clientY,1);
},{passive:true});
document.addEventListener('touchmove',e=>{
 if(e.touches.length!==1||touchId===null){if(e.touches.length>1)endTouch();return;}
 const t=[...e.touches].find(t=>t.identifier===touchId);if(!t)return;touchMoves++;
 if(reduced.matches)return;setPointer(t.clientX,t.clientY);
 const now=performance.now();if(now-lastTrail>150&&Math.hypot(t.clientX-lastTrailX,t.clientY-lastTrailY)>54){
  lastTrail=now;lastTrailX=t.clientX;lastTrailY=t.clientY;pulseAt(t.clientX,t.clientY,.9);glow(t.clientX,t.clientY,.65);
 }
},{passive:true});
for(const event of ['touchend','touchcancel'])document.addEventListener(event,e=>{if(![...e.touches].some(t=>t.identifier===touchId))endTouch();},{passive:true});
document.addEventListener('0086:beat',e=>{if(reduced.matches)return;const d=e.detail||{};pulseAt(d.x??width*.5,d.y??height*.5,bound(d.power||.7,0,1));});
''' + s[b:]
s=replace_once(s,"if(document.hidden)halt();else{", "if(document.hidden){halt();endTouch();ripples.length=0;drawTouchFeedback();}else{")
s=replace_once(s,"get reducedMotion(){return reduced.matches;}","get reducedMotion(){return reduced.matches;},get touch(){return {taps:touchTaps,moves:touchMoves,active:touchId!==null,ripples:ripples.length};}")
p.write_text(s)

p=ROOT/'assets/preview-0086-music-v6.js';s=p.read_text()
s=replace_once(s," if(!AC)return;", " if(!AC)return Promise.resolve(false);") if ' if(!AC)return;' in s else replace_once(s,"AudioContext;if(!AC)return;", "AudioContext;if(!AC)return Promise.resolve(false);")
s=replace_once(s," fx.resume().catch(()=>{});", " return fx.resume().then(()=>fx.state==='running').catch(()=>false);")
s=replace_once(s,"document.addEventListener('click',e=>{if(e.target.closest('#site-music'))return;if(wanted", "document.addEventListener('click',e=>{if(e.target.closest('#site-music')||performance.now()-lastTouchEnd<650)return;if(wanted")
s=replace_once(s,"reflect();resolveStation();",r'''
// Mobile tap/drag percussion. Start only on a completed, intentional tap;
// never unlock sound on a scroll, never override the visitor's mute choice.
let finger=null,lastTouchEnd=-1000;
const touchSoundBlocked=el=>el instanceof Element&&!!el.closest('#site-music,#site-language,.return-home,dialog,video,input,textarea,select,[contenteditable="true"]');
document.addEventListener('touchstart',e=>{
 if(e.touches.length!==1||touchSoundBlocked(e.target)){finger=null;return;}
 const t=e.touches[0];finger={id:t.identifier,x:t.clientX,y:t.clientY,sx:t.clientX,sy:t.clientY,at:performance.now(),last:performance.now(),path:0,distance:0};
},{passive:true});
document.addEventListener('touchmove',e=>{
 if(!finger||e.touches.length!==1){finger=null;return;}
 const t=[...e.touches].find(t=>t.identifier===finger.id);if(!t)return;
 const now=performance.now(),distance=Math.hypot(t.clientX-finger.x,t.clientY-finger.y),speed=distance/Math.max(8,now-finger.last)*1000;
 finger.path+=distance;finger.distance=Math.max(finger.distance,Math.hypot(t.clientX-finger.sx,t.clientY-finger.sy));
 finger.x=t.clientX;finger.y=t.clientY;finger.last=now;
 if(wanted&&finger.path>100&&speed>90&&kick(Math.min(.88,.5+speed/2600),t.clientX,t.clientY,'touch-sweep'))finger.path=0;
},{passive:true});
document.addEventListener('touchend',e=>{
 if(!finger)return;const t=[...e.changedTouches].find(t=>t.identifier===finger.id);if(!t)return;
 const g=finger;finger=null;lastTouchEnd=performance.now();
 if(e.touches.length||g.distance>14||lastTouchEnd-g.at>800)return;
 if(!wanted&&!optedOut)start();
 if(!wanted)return;
 // resume() stays in the activation handler; synthesize exactly one kick
 // after the context is running, including the first iOS gesture.
 const ready=prepareFX();if(fx?.state==='running')kick(.96,t.clientX,t.clientY,'touch-tap');
 else if(ready)ready.then(ok=>{if(ok&&wanted&&performance.now()-lastTouchEnd<400)kick(.96,t.clientX,t.clientY,'touch-tap');});
},{passive:true});
document.addEventListener('touchcancel',()=>{finger=null;},{passive:true});
window.addEventListener('blur',()=>{finger=null;});
reflect();resolveStation();''')
p.write_text(s)
assert before=={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in preserve}
Path('touch-v12-preserved.json').write_text(json.dumps(before,indent=2))
print('Patched only preview shell, particle touch handling and audio touch handling; catalogue, layout and stream are preserved.')
