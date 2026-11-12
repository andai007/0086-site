/* 0086 v14 — native input, direct reduced-motion feedback and renderer recovery. FLAT reference behavior, independently implemented.
 * A touch sets a 3D viewpoint; smooth camera travel continues after release and holds.
 * The finger repels actual particles in world space. No 2D touch rings or overlay.
 * Desktop geometry, soundtrack, weather and UI are intentionally unchanged. */
(() => {
'use strict';
let canvas=document.getElementById('field');if(!canvas||window.__0086Field)return;
const reduced=matchMedia('(prefers-reduced-motion: reduce)'),coarse=matchMedia('(pointer:coarse)');
let gl=null,rendererIssue='';
try{gl=canvas.getContext('webgl',{alpha:false,antialias:false,powerPreference:'low-power',preserveDrawingBuffer:false});}catch(e){rendererIssue=e.name;}
const bound=(x,a,b)=>Math.max(a,Math.min(b,x));
const pointer={x:innerWidth*.5,y:innerHeight*.5,active:0,nx:0,ny:0};
const pose={x:0,y:0},weather={power:.26,windX:.3,windY:.1,rain:0,humidity:.55,cloud:.4,day:.5,warm:.35,gust:.05};
let width=0,height=0,dpr=1,clock=0,last=0,raf=0,frames=0,hitAt=-100,hitX=.5,hitY=.5,hitPower=0,level=0,program=null,buffer=null,count=0,loc={},lost=false;
const vert=`
precision highp float;
attribute vec4 aSeed;
uniform vec2 uResolution,uPose,uPointer,uWind;
uniform vec3 uTouchPoint;
uniform vec4 uWeather;
uniform vec4 uHit;
uniform float uTime,uDpr,uPointerOn,uLevel,uHome,uTouch,uQuiet;
varying vec3 vColor;
varying float vGain;
const float TAU=6.28318530718;
void main(){
 float a=aSeed.x*TAU, c=aSeed.y*2.-1., s=sqrt(max(0.,1.-c*c));
 float skin=step(.29,aSeed.w);
 float radius=mix(.12+.51*pow(aSeed.z,.55),.80+.21*aSeed.z,skin);
 float fold=1.+.11*sin(a*3.+c*4.+uTime*.25)+.07*cos(c*8.-uTime*.17);
 vec3 p=vec3(s*cos(a),c,s*sin(a))*radius*fold;
 p.x+=.09*sin(p.y*5.+uTime*.2);p.z+=.13*sin(p.x*4.-uTime*.14);
 float yaw=uTime*.045+uPose.x*.46*(1.-uTouch), pitch=-.15+uPose.y*.31*(1.-uTouch);
 p.xz=mat2(cos(yaw),-sin(yaw),sin(yaw),cos(yaw))*p.xz;
 p.yz=mat2(cos(pitch),-sin(pitch),sin(pitch),cos(pitch))*p.yz;
 float perspective=2.8/(2.8-p.z*.70), unit=min(uResolution.x*.47,uResolution.y*.47);
 vec2 center=uResolution*vec2(.52,mix(.50,.54,uHome))+uPose*vec2(32.,23.);
 vec2 pos=center+p.xy*unit*perspective;
 float spatialNear=0., depthValue=p.z;
 if(uTouch>.5){
   vec3 eye=vec3(uPose.x*4.6,-uPose.y*4.6,4.6);
   vec3 forward=normalize(-eye),right=normalize(cross(forward,vec3(0.,1.,0.)));
   vec3 up=cross(right,forward);
   vec3 d=p-uTouchPoint;
   spatialNear=exp(-dot(d,d)/1.15)*uPointerOn;
   p+=d/max(length(d),.05)*spatialNear*.42*(1.-uQuiet);
   vec3 relative=p-eye;
   float depth=max(.8,dot(relative,forward));
   float focal=min(uResolution.y*.5/.445,uResolution.x*2.85);
   pos=uResolution*vec2(.50,mix(.50,.53,uHome))+vec2(dot(relative,right),-dot(relative,up))*focal/depth;
   perspective=4.6/depth;
   depthValue=length(eye)-depth;
 }
 pos+=uWind*(sin(uTime*.12)*22.);
 float rain=uWeather.z;
 vec2 fall=vec2(fract(aSeed.x+uTime*.007*uWind.x)*uResolution.x,fract(aSeed.y+uTime*(.09+aSeed.z*.08))*uResolution.y);
 pos=mix(pos,fall,rain*.72);
 vec2 delta=pos-uPointer;
 float reach=mix(145.,112.,uTouch);
 float dist=length(delta), near=mix(exp(-dist*dist/(reach*reach))*uPointerOn,spatialNear,uTouch);
 near=max(near,exp(-dist*dist/(95.*95.))*uPointerOn*uTouch);
 pos+=delta/max(dist,1.)*near*30.*(1.-uTouch);
 float age=max(0.,uHit.z),front=age*470.;
 float ring=exp(-pow((length(pos-uHit.xy*uResolution)-front)/48.,2.))*exp(-age*2.0)*uHit.w*(1.-uQuiet);
 pos+=normalize(pos-uHit.xy*uResolution+vec2(.01))*ring*19.;
 pos+=p.xy*uLevel*3.;
 gl_Position=vec4(pos/uResolution*2.-1.,0.,1.);gl_Position.y=-gl_Position.y;
 float frontDepth=clamp((depthValue+1.3)/2.4,0.,1.);
 float size=mix(4.8,13.8,pow(aSeed.z,2.5))*perspective*(.65+frontDepth*.55);
 gl_PointSize=min(38.,size*(1.+near*.45+ring*.25))*uDpr;
 vec3 klein=vec3(.055,.22,.95), ice=vec3(.68,.85,1.);
 vColor=mix(klein,ice,.36+.46*aSeed.w+.12*frontDepth);
 vColor=mix(vColor,vec3(.88,.93,1.),uHome*.24);
 vGain=(.55+frontDepth*.8)*mix(.82,1.,skin)*(1.+near*.85+ring*1.2+uLevel*.22);
}
`;
const frag=`
precision mediump float;
varying vec3 vColor;varying float vGain;
void main(){
 vec2 q=gl_PointCoord*2.-1.;float r=dot(q,q);if(r>1.)discard;
 float core=exp(-r*110.),body=exp(-r*20.)*.14,halo=exp(-r*4.)*.045;
 vec3 col=vColor*(body+halo)+mix(vColor,vec3(1.),.82)*core*.92;
 gl_FragColor=vec4(col*vGain,1.);
}
`;
function setup(){
 if(!gl)return;
 const shader=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
 const v=shader(gl.VERTEX_SHADER,vert),f=shader(gl.FRAGMENT_SHADER,frag);program=gl.createProgram();gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);gl.deleteShader(v);gl.deleteShader(f);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
 gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
 const a=gl.getAttribLocation(program,'aSeed');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,4,gl.FLOAT,false,0,0);
 for(const n of ['Resolution','Pose','Pointer','Wind','Weather','Hit','Time','Dpr','PointerOn','Level','Home','Touch','TouchPoint','Quiet'])loc[n]=gl.getUniformLocation(program,'u'+n);
 gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.clearColor(.001,.002,.006,1);
}
let fallback=null,stars=[],viewAt=0,restoreTimer=0;
function useFallback(reason){
 rendererIssue=reason||'WebGL unavailable';
 const fresh=canvas.cloneNode(false);canvas.replaceWith(fresh);canvas=fresh;
 gl=null;lost=false;fallback=canvas.getContext('2d',{alpha:false});
 canvas.dataset.renderer='canvas-fallback';
}
const touchPoint={x:999,y:999,z:0};
const touchRayTarget={x:999,y:999,z:0};
function resize(){
 if(touchMode){
  canvas.style.height=window.CSS&&CSS.supports('height','100dvh')?'100dvh':innerHeight+'px';
  const rect=canvas.getBoundingClientRect();width=rect.width||innerWidth;height=rect.height||innerHeight;
 }else{width=innerWidth;height=innerHeight;}
 dpr=Math.min(devicePixelRatio||1,coarse.matches?1.25:1.5);
 canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
 const next=width<721?6800:14500;
 if(gl&&!lost){gl.viewport(0,0,canvas.width,canvas.height);if(count!==next){count=next;const data=new Float32Array(count*4);let seed=86;for(let i=0;i<data.length;i++){seed=(seed*1664525+1013904223)>>>0;data[i]=seed/4294967296;}gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);}}
 else if(fallback){fallback.setTransform(dpr,0,0,dpr,0,0);stars=Array.from({length:1300},(_,i)=>({a:i*2.399963,r:Math.sqrt((i+.5)/1300),size:.5+(i%5)*.18}));}
 if(reduced.matches)draw(0);else schedule();
}
function draw(dt){
 if(lost)return;
 clock+=dt*(.6+weather.power*.65);
 const target=window.__0086?.weather?.target;
 if(target){const k=1-Math.exp(-dt/20);for(const key in weather)if(Number.isFinite(target[key]))weather[key]+=(target[key]-weather[key])*k;}
 const now=performance.now(),viewDt=touchMode&&viewAt?Math.min(.5,Math.max(0,(now-viewAt)/1000)):dt;viewAt=now;
 const follow=reduced.matches?0:1-Math.exp(-viewDt*(touchMode?4.6:5.8));pose.x+=(pointer.nx-pose.x)*follow;pose.y+=(pointer.ny-pose.y)*follow;
 if(touchMode&&pointer.active){
  projectTouchToWorld();
  const k=reduced.matches?1:1-Math.exp(-viewDt*6.3);
  if(touchPoint.x===999){touchPoint.x=touchRayTarget.x;touchPoint.y=touchRayTarget.y;}
  else{touchPoint.x+=(touchRayTarget.x-touchPoint.x)*k;touchPoint.y+=(touchRayTarget.y-touchPoint.y)*k;}
 }
 const audio=window.__0086Music;const energy=audio?.sampleEnergy?audio.sampleEnergy():0;level+=(energy-level)*(1-Math.exp(-dt*7));
 const home=document.body.dataset.view==='home';
 if(gl){
  gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);
  gl.uniform2f(loc.Resolution,width,height);gl.uniform2f(loc.Pose,pose.x,pose.y);gl.uniform2f(loc.Pointer,pointer.x,pointer.y);
  gl.uniform2f(loc.Wind,weather.windX,weather.windY);gl.uniform4f(loc.Weather,weather.power,weather.humidity,weather.rain,weather.cloud);
  gl.uniform4f(loc.Hit,hitX,hitY,(performance.now()-hitAt)/1000,hitPower);gl.uniform1f(loc.Time,clock);gl.uniform1f(loc.Dpr,dpr);
  gl.uniform3f(loc.TouchPoint,touchPoint.x,touchPoint.y,0);gl.uniform1f(loc.Touch,touchMode);gl.uniform1f(loc.Quiet,reduced.matches?1:0);gl.uniform1f(loc.PointerOn,pointer.active);gl.uniform1f(loc.Level,level);gl.uniform1f(loc.Home,home?1:0);
  gl.drawArrays(gl.POINTS,0,count);
 }else if(fallback){
  fallback.globalCompositeOperation='source-over';fallback.fillStyle='#010208';fallback.fillRect(0,0,width,height);fallback.globalCompositeOperation='lighter';
  for(const s of stars){
   const a=s.a+clock*.05,rad=s.r*Math.min(width,height)*.44;
   let x=width*.52+Math.cos(a)*rad+pose.x*28,y=height*.52+Math.sin(a)*rad+pose.y*22,scale=1,glow=1;
   if(touchMode){
    let px=Math.cos(a)*s.r,py=Math.sin(a)*s.r,pz=Math.sin(s.a*1.23)*Math.sqrt(1-s.r*s.r);
    const yaw=Math.atan(pose.x),pitch=Math.atan(pose.y),xx=px*Math.cos(yaw)-pz*Math.sin(yaw),zz=px*Math.sin(yaw)+pz*Math.cos(yaw);
    const yy=py*Math.cos(pitch)-zz*Math.sin(pitch),z=py*Math.sin(pitch)+zz*Math.cos(pitch);
    scale=4.6/(Math.hypot(pose.x*4.6,pose.y*4.6,4.6)-z);
    const unit=Math.min(height*.5/.445,width*2.85)/4.6;
    x=width*.5+xx*unit*scale;y=height*.53+yy*unit*scale;
    const dx=x-pointer.x,dy=y-pointer.y,near=Math.exp(-(dx*dx+dy*dy)/10000)*pointer.active;
    glow=1+near*1.5;if(!reduced.matches){x+=dx*near*.28;y+=dy*near*.28;}
   }
   fallback.fillStyle='rgba(117,171,255,'+Math.min(1,.65*glow)+')';fallback.shadowColor='#3069ff';fallback.shadowBlur=8;
   fallback.beginPath();fallback.arc(x,y,Math.max(.2,s.size*scale),0,6.283);fallback.fill();
  }fallback.shadowBlur=0;
 }
 frames++;
}
function frame(now){raf=0;if(document.hidden||reduced.matches||lost)return;const dt=last?Math.min(.05,(now-last)/1000):.016;last=now;draw(dt);raf=requestAnimationFrame(frame);}
function schedule(){if(!raf&&!document.hidden&&!reduced.matches&&!lost){last=0;raf=requestAnimationFrame(frame);}}
function halt(){cancelAnimationFrame(raf);raf=0;last=0;viewAt=0;}
try{if(gl)setup();else useFallback(rendererIssue||'WebGL unavailable');}catch(e){useFallback('WebGL initialization: '+e.message);}
// Capture native touch before descendants; Pointer Events are a deduplicated fallback.
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
function projectTouchToWorld(){
 const ex=pose.x*4.6,ey=-pose.y*4.6,ez=4.6,len=Math.hypot(ex,ey,ez);
 const fx=-ex/len,fy=-ey/len,fz=-ez/len,rl=Math.hypot(fz,fx);
 const rx=-fz/rl,rz=fx/rl,ux=-fy*rz,uy=rz*fx-rx*fz,uz=fy*rx;
 const focal=Math.min(height*.5/.445,width*2.85);
 const nx=(pointer.x-width*.5)/focal,ny=-(pointer.y-height*(document.body.dataset.view==='home'?.53:.50))/focal;
 const dx=fx+rx*nx+ux*ny,dy=fy+uy*ny,dz=fz+rz*nx+uz*ny;
 const t=bound(-ez/Math.min(-.03,dz),0,30);
 touchRayTarget.x=bound(ex+dx*t,-8,8);touchRayTarget.y=bound(ey+dy*t,-8,8);
}
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
window.addEventListener('resize',resize);if(window.visualViewport)visualViewport.addEventListener('resize',resize);window.addEventListener('hashchange',()=>{if(reduced.matches)draw(0);});
document.addEventListener('visibilitychange',()=>{if(document.hidden){halt();endTouch();}else{if(reduced.matches)draw(0);else schedule();}});
reduced.addEventListener('change',()=>{halt();release();if(reduced.matches){pose.x=pose.y=pointer.nx=pointer.ny=0;draw(0);}else schedule();});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;halt();restoreTimer=setTimeout(()=>{if(lost){useFallback('WebGL context lost');resize();}},350);});canvas.addEventListener('webglcontextrestored',()=>{clearTimeout(restoreTimer);if(!gl)return;lost=false;count=0;try{setup();}catch(e){useFallback('WebGL restore failed');}resize();});
window.addEventListener('pagehide',halt);window.addEventListener('pageshow',e=>{if(e.persisted){if(reduced.matches)draw(0);else schedule();}});
window.__0086Field=Object.freeze({version:14,get renderer(){return gl?'webgl-additive':'canvas-fallback';},get rendererIssue(){return rendererIssue;},get inputSource(){return inputSource;},get viewport(){return {width,height};},get frames(){return frames;},get camera(){return {...pose};},get targetCamera(){return {x:pointer.nx,y:pointer.ny};},get interaction(){return touchMode?'perspective-touch':'desktop-pointer';},get touchPoint(){return {...touchPoint};},get weather(){return {...weather};},get pulseAge(){return(performance.now()-hitAt)/1000;},get pointer(){return {...pointer};},get energy(){return level;},get reducedMotion(){return reduced.matches;},get touch(){return {taps:touchTaps,moves:touchMoves,active:touchId!==null,ripples:0};}});
resize();if(reduced.matches)draw(0);else schedule();
})();