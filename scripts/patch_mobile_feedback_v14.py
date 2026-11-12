from pathlib import Path
import hashlib, json

preserved = ['index.html', 'preview-0086-source.html', 'assets/preview-catalogue-v10.json', 'assets/preview-catalogue-v10.css', 'assets/preview-0086-layout-v4.css', 'assets/preview-0086-light-v6.css', 'assets/preview-0086-music-v6.js']
Path('/tmp/mobile-v14-preserved.json').write_text(json.dumps({f: hashlib.sha256(Path(f).read_bytes()).hexdigest() for f in preserved}))
s = Path('assets/preview-0086-field-v13.js').read_text()
def change(old, new):
    global s
    assert old in s, 'Missing patch anchor: ' + old[:100]
    s = s.replace(old, new, 1)

change('const canvas=document.getElementById', 'let canvas=document.getElementById')
change("const gl=canvas.getContext('webgl',{alpha:false,antialias:false,powerPreference:'low-power',preserveDrawingBuffer:false});", "let gl=null,rendererIssue='';\ntry{gl=canvas.getContext('webgl',{alpha:false,antialias:false,powerPreference:'low-power',preserveDrawingBuffer:false});}catch(e){rendererIssue=e.name;}")
change('uLevel,uHome,uTouch;', 'uLevel,uHome,uTouch,uQuiet;')
change('p+=d/max(length(d),.05)*spatialNear*.42;', 'p+=d/max(length(d),.05)*spatialNear*.42*(1.-uQuiet);')
change('near=mix(exp(-dist*dist/(reach*reach))*uPointerOn,spatialNear,uTouch);', 'near=mix(exp(-dist*dist/(reach*reach))*uPointerOn,spatialNear,uTouch);\n near=max(near,exp(-dist*dist/(95.*95.))*uPointerOn*uTouch);')
change('exp(-age*2.0)*uHit.w;', 'exp(-age*2.0)*uHit.w*(1.-uQuiet);')
change("'Home','Touch','TouchPoint'", "'Home','Touch','TouchPoint','Quiet'")
change('let fallback=null,stars=[],viewAt=0;', '''let fallback=null,stars=[],viewAt=0,restoreTimer=0;
function useFallback(reason){
 rendererIssue=reason||'WebGL unavailable';
 const fresh=canvas.cloneNode(false);canvas.replaceWith(fresh);canvas=fresh;
 gl=null;lost=false;fallback=canvas.getContext('2d',{alpha:false});
 canvas.dataset.renderer='canvas-fallback';
}''')
change('width=innerWidth;height=innerHeight;dpr=', '''if(touchMode){
  canvas.style.height=window.CSS&&CSS.supports('height','100dvh')?'100dvh':innerHeight+'px';
  const rect=canvas.getBoundingClientRect();width=rect.width||innerWidth;height=rect.height||innerHeight;
 }else{width=innerWidth;height=innerHeight;}
 dpr=''')
change('const follow=1-Math.exp(-viewDt*(touchMode?3.08:5.8));', 'const follow=reduced.matches?0:1-Math.exp(-viewDt*(touchMode?4.6:5.8));')
change('const k=1-Math.exp(-viewDt*6.3);', 'const k=reduced.matches?1:1-Math.exp(-viewDt*6.3);')
change('gl.uniform1f(loc.Touch,touchMode);', 'gl.uniform1f(loc.Touch,touchMode);gl.uniform1f(loc.Quiet,reduced.matches?1:0);')
change('pose.y*22,scale=1;', 'pose.y*22,scale=1,glow=1;')
change('x+=dx*near*.28;y+=dy*near*.28;', 'glow=1+near*1.5;if(!reduced.matches){x+=dx*near*.28;y+=dy*near*.28;}')
change("fallback.fillStyle='rgba(117,171,255,.65)';", "fallback.fillStyle='rgba(117,171,255,'+Math.min(1,.65*glow)+')';")
change("try{if(gl)setup();else fallback=canvas.getContext('2d',{alpha:false});}catch(e){console.warn('0086 particle shader:',e.message);canvas.dataset.renderError=e.message;return;}", "try{if(gl)setup();else useFallback(rendererIssue||'WebGL unavailable');}catch(e){useFallback('WebGL initialization: '+e.message);}")

project = s[s.index('function projectTouchToWorld(){'):s.index('\nfunction release(){')]
a = s.index('let touchMode=coarse.matches?1:0,')
b = s.index("window.addEventListener('resize',resize);", a)
s = s[:a] + '''// Capture native touch before descendants; Pointer Events are a deduplicated fallback.
// Reduced-motion keeps the scene stationary, but direct local illumination still responds.
let touchMode=(coarse.matches||(navigator.maxTouchPoints>0&&matchMedia('(hover:none)').matches))?1:0;
let touchId=null,touchMoves=0,touchTaps=0,lastInputFrame=0,lastDown=-1000,lastDrag=-1000,gesture=null;
let inputSource='none';
const touchBlocked=el=>el instanceof Element&&!!el.closest('#site-music,#site-language,.return-home,dialog,video,input,textarea,select,[contenteditable="true"]');
function setPointer(x,y){
 const r=canvas.getBoundingClientRect();pointer.x=x-r.left;pointer.y=y-r.top;pointer.active=1;
 pointer.nx=reduced.matches?0:bound(pointer.x/Math.max(1,width)*2-1,-1,1);
 pointer.ny=reduced.matches?0:bound(pointer.y/Math.max(1,height)*2-1,-1,1);
}
function pulseAt(x,y,power){
 const r=canvas.getBoundingClientRect();hitX=bound((x-r.left)/Math.max(1,width),0,1);hitY=bound((y-r.top)/Math.max(1,height),0,1);hitAt=performance.now();hitPower=power;
}
''' + project + '''
function renderTouchNow(force=false){
 const now=performance.now();if(lost||document.hidden||(!force&&now-lastInputFrame<16))return;
 lastInputFrame=now;
 if(reduced.matches){pose.x=0;pose.y=0;}
 projectTouchToWorld();touchPoint.x=touchRayTarget.x;touchPoint.y=touchRayTarget.y;
 // Draw in the input handler too: a throttled animation loop must not swallow feedback.
 draw(0);schedule();
}
function beginTouch(x,y,target,source){
 if(touchBlocked(target))return false;
 const now=performance.now();
 const duplicate=gesture&&now-lastDown<100&&Math.hypot(x-gesture.x,y-gesture.y)<4;
 if(!duplicate){gesture={x,y,horizontal:false,dragged:false};lastDown=now;touchTaps++;}
 touchMode=1;inputSource=source;setPointer(x,y);
 if(!duplicate&&!reduced.matches)pulseAt(x,y,.8);
 renderTouchNow(true);return true;
}
function moveTouch(x,y,source){
 if(!gesture)return;
 const dx=x-gesture.x,dy=y-gesture.y;
 if(Math.hypot(dx,dy)>9){gesture.dragged=true;if(Math.abs(dx)>Math.abs(dy)*1.25)gesture.horizontal=true;}
 touchMoves++;inputSource=source;setPointer(x,y);renderTouchNow();
}
function release(){pointer.active=0;if(!touchMode){pointer.nx=0;pointer.ny=0;}}
function endTouch(){if(gesture?.dragged)lastDrag=performance.now();touchId=null;gesture=null;}
window.addEventListener('pointerdown',e=>{
 if(e.pointerType==='touch'){beginTouch(e.clientX,e.clientY,e.target,'pointer');return;}
 if(touchBlocked(e.target)||reduced.matches)return;touchMode=0;pulseAt(e.clientX,e.clientY,.75);
},{passive:true,capture:true});
window.addEventListener('pointermove',e=>{
 if(e.pointerType==='touch'){if(touchId===null&&gesture)moveTouch(e.clientX,e.clientY,'pointer');return;}
 if(reduced.matches||(coarse.matches&&touchMode))return;touchMode=0;setPointer(e.clientX,e.clientY);
},{passive:true,capture:true});
for(const event of ['pointerup','pointercancel'])window.addEventListener(event,e=>{if(e.pointerType==='touch'&&touchId===null)endTouch();},{passive:true,capture:true});
window.addEventListener('touchstart',e=>{
 if(e.touches.length!==1||touchBlocked(e.target)){endTouch();return;}
 const t=e.touches[0];if(beginTouch(t.clientX,t.clientY,e.target,'touch'))touchId=t.identifier;
},{passive:true,capture:true});
window.addEventListener('touchmove',e=>{
 if(e.touches.length!==1){endTouch();return;}
 const t=[...e.touches].find(t=>t.identifier===touchId);if(!t)return;
 moveTouch(t.clientX,t.clientY,'touch');
 // Only a horizontal home-scene drag belongs to us. Vertical scroll and pinch stay native.
 if(gesture?.horizontal&&document.body.dataset.view==='home'&&e.cancelable)e.preventDefault();
},{passive:false,capture:true});
for(const event of ['touchend','touchcancel'])window.addEventListener(event,e=>{if(![...e.touches].some(t=>t.identifier===touchId))endTouch();},{passive:true,capture:true});
window.addEventListener('click',e=>{
 if(performance.now()-lastDrag<400&&e.detail!==0&&!touchBlocked(e.target)){e.preventDefault();e.stopImmediatePropagation();}
},true);
document.documentElement.addEventListener('pointerleave',e=>{if(e.pointerType!=='touch')release();});
window.addEventListener('blur',()=>{endTouch();release();});
document.addEventListener('0086:beat',e=>{if(reduced.matches)return;const d=e.detail||{};pulseAt(d.x??width*.5,d.y??height*.5,bound(d.power||.7,0,1));});
''' + s[b:]
change("window.addEventListener('resize',resize);", "window.addEventListener('resize',resize);if(window.visualViewport)visualViewport.addEventListener('resize',resize);")
change("reduced.addEventListener('change',()=>{halt();release();if(reduced.matches)draw(0);else schedule();});", "reduced.addEventListener('change',()=>{halt();release();if(reduced.matches){pose.x=pose.y=pointer.nx=pointer.ny=0;draw(0);}else schedule();});")
change("canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;halt();});canvas.addEventListener('webglcontextrestored',()=>{lost=false;count=0;setup();resize();});", "canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;halt();restoreTimer=setTimeout(()=>{if(lost){useFallback('WebGL context lost');resize();}},350);});canvas.addEventListener('webglcontextrestored',()=>{clearTimeout(restoreTimer);if(!gl)return;lost=false;count=0;try{setup();}catch(e){useFallback('WebGL restore failed');}resize();});")
change("window.addEventListener('pageshow',e=>{if(e.persisted)schedule();});", "window.addEventListener('pageshow',e=>{if(e.persisted){if(reduced.matches)draw(0);else schedule();}});")
change("Object.freeze({renderer:gl?'webgl-additive':'canvas-fallback',", "Object.freeze({version:14,get renderer(){return gl?'webgl-additive':'canvas-fallback';},get rendererIssue(){return rendererIssue;},get inputSource(){return inputSource;},get viewport(){return {width,height};},")
s=s.replace('/* 0086 v13 — perspective touch camera.', '/* 0086 v14 — native input, direct reduced-motion feedback and renderer recovery.')
Path('assets/preview-0086-field-v14.js').write_text(s)

p=Path('preview-0086.html');html=p.read_text()
assert 'clean-perspective-v13' in html and 'field-v13.js?v=13' in html
html=html.replace('clean-perspective-v13','clean-mobile-feedback-v14').replace('field-v13.js?v=13','field-v14.js?v=14')
html=html.replace("const returnStyles=`", "const returnStyles=`\n@media(any-pointer:coarse){.entry{touch-action:pan-y pinch-zoom}}")
p.write_text(html)
# A genuinely new path, not another query string pointing at a potentially cached shell.
Path('preview-mobile-v14.html').write_text(html)
print('Generated v14 input fix, unchanged electronic soundtrack/layout/catalogue, and a new mobile entry path.')
