/* 0086 v20 - one volumetric silver particle body on a seamless 22 second loop.
 * The body cyclically breathes through a sphere, torus and rippled volume while
 * completing one Y-axis turn. Reduced Motion keeps the same loop at a gentler tilt.
 * Soundtrack, weather and UI interfaces are intentionally unchanged. */
(() => {
'use strict';
let canvas=document.getElementById('field');if(!canvas||window.__0086Field)return;
const reduced=matchMedia('(prefers-reduced-motion: reduce)'),coarse=matchMedia('(pointer:coarse)');
let gl=null,rendererIssue='';
try{gl=canvas.getContext('webgl',{alpha:false,antialias:false,powerPreference:'low-power',preserveDrawingBuffer:false});}catch(e){rendererIssue=e.name;}
const bound=(x,a,b)=>Math.max(a,Math.min(b,x));
const pointer={x:innerWidth*.5,y:innerHeight*.5,active:0,nx:0,ny:0};
const pose={x:0,y:0},weather={power:.26,windX:.3,windY:.1,rain:0,humidity:.55,cloud:.4,day:.5,warm:.35,gust:.05};
const LOOP=22000,TAU=Math.PI*2;
let width=0,height=0,dpr=1,last=0,raf=0,frames=0,hitAt=-100,hitX=.5,hitY=.5,hitPower=0,level=0,program=null,buffer=null,count=0,loc={},lost=false;
const vert=`
precision highp float;
attribute vec4 aSeed;
uniform vec2 uResolution,uPose,uPointer,uWind;
uniform vec3 uTouchPoint;
uniform vec4 uWeather;
uniform vec4 uHit;
uniform float uPhase,uDpr,uPointerOn,uLevel,uHome,uTouch,uQuiet,uPointScale;
varying vec3 vColor;
varying float vGain,vRare;
const float TAU=6.28318530718;
void main(){
 float loopAngle=uPhase*TAU;
 float longitude=aSeed.x*TAU, latitude=acos(aSeed.y*2.-1.);
 float sinLat=sin(latitude), radial=.14+.86*pow(aSeed.z,.42);
 vec3 direction=vec3(sinLat*cos(longitude),cos(latitude),sinLat*sin(longitude));
 vec3 sphere=direction*radial;

 float tubeAngle=aSeed.y*TAU, tubeRadius=.10+.31*pow(aSeed.z,.54);
 float major=.58+.055*sin(longitude*3.+tubeAngle*2.);
 vec3 torus=vec3((major+tubeRadius*cos(tubeAngle))*cos(longitude),tubeRadius*sin(tubeAngle),(major+tubeRadius*cos(tubeAngle))*sin(longitude));
 torus.y*=1.38;

 float ripple=radial*(.84+.12*sin(longitude*3.+loopAngle)+.08*cos(latitude*4.-loopAngle));
 vec3 folded=direction*ripple;
 folded.x*=1.04;folded.y*=.88;folded.z*=1.10;
 folded+=vec3(.045*sin(folded.y*5.+loopAngle),.035*cos(folded.x*4.-loopAngle),.045*sin(folded.x*3.+folded.y*2.));

 float w0=pow(.5+.5*cos(loopAngle),3.);
 float w1=pow(.5+.5*cos(loopAngle-TAU/3.),3.);
 float w2=pow(.5+.5*cos(loopAngle-TAU*2./3.),3.);
 float weightSum=w0+w1+w2;
 vec3 p=(sphere*w0+torus*w1+folded*w2)/weightSum;
 float breathe=1.+.045*sin(loopAngle*2.);
 p*=breathe;
 p.y+=.035*sin(loopAngle+p.x*3.2)*(1.-aSeed.z);

 float yaw=loopAngle+uPose.x*.16*(1.-uQuiet);
 float pitch=-.18+.055*sin(loopAngle)*mix(1.,.65,uQuiet)+uPose.y*.10*(1.-uQuiet);
 p.xz=mat2(cos(yaw),-sin(yaw),sin(yaw),cos(yaw))*p.xz;
 p.yz=mat2(cos(pitch),-sin(pitch),sin(pitch),cos(pitch))*p.yz;
 float camera=2.65, perspective=camera/(camera-p.z*.82);
 float unit=min(uResolution.x*.455,uResolution.y*.33);
 vec2 center=uResolution*vec2(.50,mix(.51,.555,uHome))+uPose*vec2(9.,7.)*(1.-uQuiet);
 vec2 pos=center+p.xy*unit*perspective;
 float depthValue=p.z;
 pos+=vec2(uWind.x,-uWind.y)*sin(loopAngle)*min(uResolution.x,uResolution.y)*.006;
 vec2 delta=pos-uPointer;
 float reach=mix(145.,110.,uTouch),dist=length(delta);
 float near=exp(-dist*dist/(reach*reach))*uPointerOn;
 pos+=delta/max(dist,1.)*near*mix(26.,18.,uQuiet);
 float age=max(0.,uHit.z),front=age*470.;
 float ring=exp(-pow((length(pos-uHit.xy*uResolution)-front)/48.,2.))*exp(-age*2.0)*uHit.w*(1.-uQuiet);
 pos+=normalize(pos-uHit.xy*uResolution+vec2(.01))*ring*14.;
 gl_Position=vec4(pos/uResolution*2.-1.,0.,1.);gl_Position.y=-gl_Position.y;
 float frontDepth=smoothstep(-.92,.92,depthValue);
 float rare=pow(fract(aSeed.x*19.17+aSeed.y*43.71+aSeed.w*11.13),12.);
 float baseSize=mix(2.7,6.4,pow(aSeed.w,2.2))+rare*7.5;
 float size=baseSize*perspective*mix(.60,1.48,frontDepth)*uPointScale;
 gl_PointSize=min(24.*uDpr,size*(1.+near*.22+ring*.10)*uDpr);
 vec3 farSilver=vec3(.42,.48,.57),nearSilver=vec3(.94,.97,1.);
 vColor=mix(farSilver,nearSilver,.18+.82*frontDepth);
 vGain=mix(.18,.88,pow(frontDepth,1.18))*(1.+near*.52+ring*.55+uLevel*.08*pow(sin(loopAngle),2.));
 vRare=rare;
}
`;
const frag=`
precision mediump float;
varying vec3 vColor;varying float vGain,vRare;
void main(){
 vec2 q=gl_PointCoord*2.-1.;float r2=dot(q,q);if(r2>1.)discard;
 float radius=sqrt(r2);
 float core=1.-smoothstep(.38,.68,radius);
 float softEdge=(1.-smoothstep(.68,.94,radius))*.16;
 float profile=core+(1.-core)*softEdge;
 float alpha=profile*min(.94,vGain)*(.44+vRare*.20);
 vec3 silver=mix(vColor,vec3(1.),.38);
 gl_FragColor=vec4(silver*alpha,alpha);
}
`;
function setup(){
 if(!gl)return;
 const shader=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;};
 const v=shader(gl.VERTEX_SHADER,vert),f=shader(gl.FRAGMENT_SHADER,frag);program=gl.createProgram();gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);gl.deleteShader(v);gl.deleteShader(f);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
 gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
 const a=gl.getAttribLocation(program,'aSeed');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,4,gl.FLOAT,false,0,0);
 for(const n of ['Resolution','Pose','Pointer','Wind','Weather','Hit','Phase','Dpr','PointerOn','Level','Home','Touch','TouchPoint','Quiet','PointScale'])loc[n]=gl.getUniformLocation(program,'u'+n);
 gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.clearColor(.001,.002,.006,1);
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
 const next=width<721?12800:16000;
 if(gl&&!lost){gl.viewport(0,0,canvas.width,canvas.height);if(count!==next){count=next;const data=new Float32Array(count*4);let seed=86;for(let i=0;i<data.length;i++){seed=(seed*1664525+1013904223)>>>0;data[i]=seed/4294967296;}gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);}}
 else if(fallback){
  fallback.setTransform(dpr,0,0,dpr,0,0);let seed=86;
  const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  stars=Array.from({length:2200},()=>{
   const x=rnd(),y=rnd(),z=rnd(),w=rnd(),longitude=x*TAU,latitude=Math.acos(y*2-1),sinLat=Math.sin(latitude),radial=.14+.86*Math.pow(z,.42);
   const dx=sinLat*Math.cos(longitude),dy=Math.cos(latitude),dz=sinLat*Math.sin(longitude);
   const tubeAngle=y*TAU,tubeRadius=.10+.31*Math.pow(z,.54),major=.58+.055*Math.sin(longitude*3+tubeAngle*2);
   return {longitude,latitude,radial,dx,dy,dz,sx:dx*radial,sy:dy*radial,sz:dz*radial,tx:(major+tubeRadius*Math.cos(tubeAngle))*Math.cos(longitude),ty:tubeRadius*Math.sin(tubeAngle)*1.38,tz:(major+tubeRadius*Math.cos(tubeAngle))*Math.sin(longitude),w,rare:Math.pow(((x*19.17+y*43.71+w*11.13)%1+1)%1,12)};
  });
 }
 // Let layout and the backing-store resize settle before the first paint.
 schedule();
}
function draw(dt){
 if(lost)return;
 const target=window.__0086?.weather?.target;
 if(target){const k=1-Math.exp(-dt/20);for(const key in weather)if(Number.isFinite(target[key]))weather[key]+=(target[key]-weather[key])*k;}
 const now=performance.now(),phase=(now%LOOP)/LOOP,loopAngle=phase*TAU,viewDt=touchMode&&viewAt?Math.min(.5,Math.max(0,(now-viewAt)/1000)):dt;viewAt=now;
 const follow=reduced.matches?0:1-Math.exp(-viewDt*(touchMode?2.8:3.8));pose.x+=(pointer.nx-pose.x)*follow;pose.y+=(pointer.ny-pose.y)*follow;
 if(touchMode&&pointer.active){
  projectTouchToWorld();
  const k=reduced.matches?1:1-Math.exp(-viewDt*6.3);
  if(touchPoint.x===999){touchPoint.x=touchRayTarget.x;touchPoint.y=touchRayTarget.y;}
  else{touchPoint.x+=(touchRayTarget.x-touchPoint.x)*k;touchPoint.y+=(touchRayTarget.y-touchPoint.y)*k;}
 }
 const audio=window.__0086Music;const energy=(!reduced.matches&&audio?.sampleEnergy)?audio.sampleEnergy():0;level+=(energy-level)*(1-Math.exp(-dt*7));
 const home=document.body.dataset.view==='home';
 if(gl){
  gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);
  gl.uniform2f(loc.Resolution,width,height);gl.uniform2f(loc.Pose,pose.x,pose.y);gl.uniform2f(loc.Pointer,pointer.x,pointer.y);
  gl.uniform2f(loc.Wind,weather.windX,weather.windY);gl.uniform4f(loc.Weather,weather.power,weather.humidity,weather.rain,weather.cloud);
  gl.uniform4f(loc.Hit,hitX,hitY,(now-hitAt)/1000,hitPower);gl.uniform1f(loc.Phase,phase);gl.uniform1f(loc.Dpr,dpr);
  gl.uniform3f(loc.TouchPoint,touchPoint.x,touchPoint.y,0);gl.uniform1f(loc.Touch,touchMode);gl.uniform1f(loc.Quiet,reduced.matches?1:0);gl.uniform1f(loc.PointerOn,pointer.active);gl.uniform1f(loc.Level,level);gl.uniform1f(loc.Home,home?1:0);gl.uniform1f(loc.PointScale,width<721?1.06:1.);
  gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  gl.drawArrays(gl.POINTS,0,count);
 }else if(fallback){
  fallback.globalCompositeOperation='source-over';fallback.fillStyle='#010208';fallback.fillRect(0,0,width,height);
  const w0=Math.pow(.5+.5*Math.cos(loopAngle),3),w1=Math.pow(.5+.5*Math.cos(loopAngle-TAU/3),3),w2=Math.pow(.5+.5*Math.cos(loopAngle-TAU*2/3),3),weightSum=w0+w1+w2;
  const breathe=1+.045*Math.sin(loopAngle*2),yaw=loopAngle+pose.x*.16*(reduced.matches?0:1),pitch=-.18+.055*Math.sin(loopAngle)*(reduced.matches?.65:1)+pose.y*.10*(reduced.matches?0:1),cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  const unit=Math.min(width*.455,height*.33),centerX=width*.5+pose.x*9*(reduced.matches?0:1),centerY=height*(home?.555:.51)+pose.y*7*(reduced.matches?0:1);
  for(const s of stars){
   const ripple=s.radial*(.84+.12*Math.sin(s.longitude*3+loopAngle)+.08*Math.cos(s.latitude*4-loopAngle));
   let fx=s.dx*ripple*1.04,fy=s.dy*ripple*.88,fz=s.dz*ripple*1.10;
   fx+=.045*Math.sin(fy*5+loopAngle);fy+=.035*Math.cos(fx*4-loopAngle);fz+=.045*Math.sin(fx*3+fy*2);
   let px=(s.sx*w0+s.tx*w1+fx*w2)/weightSum*breathe,py=(s.sy*w0+s.ty*w1+fy*w2)/weightSum*breathe,pz=(s.sz*w0+s.tz*w1+fz*w2)/weightSum*breathe;
   py+=.035*Math.sin(loopAngle+px*3.2)*(1-s.radial);
   const xx=px*cy-pz*sy,zz=px*sy+pz*cy,yy=py*cp-zz*sp,z=py*sp+zz*cp,perspective=2.65/(2.65-z*.82);
   let x=centerX+xx*unit*perspective+weather.windX*Math.sin(loopAngle)*Math.min(width,height)*.006,y=centerY+yy*unit*perspective-weather.windY*Math.sin(loopAngle)*Math.min(width,height)*.006;
   const ddx=x-pointer.x,ddy=y-pointer.y,reach=touchMode?110:145,near=Math.exp(-(ddx*ddx+ddy*ddy)/(reach*reach))*pointer.active;
   x+=ddx/Math.max(1,Math.hypot(ddx,ddy))*near*(reduced.matches?18:26);y+=ddy/Math.max(1,Math.hypot(ddx,ddy))*near*(reduced.matches?18:26);
   const depth=Math.max(0,Math.min(1,(z+.92)/1.84)),baseSize=2.7+3.7*Math.pow(s.w,2.2)+s.rare*7.5,size=Math.min(24,baseSize*perspective*(.60+.88*depth)*(width<721?1.06:1));
   const gain=(.18+.70*Math.pow(depth,1.18))*(1+near*.52),shade=Math.round(112+137*depth);
   fallback.fillStyle=`rgba(${shade},${Math.min(255,shade+6)},${Math.min(255,shade+15)},${Math.min(.94,gain)*(.44+s.rare*.20)})`;
   fallback.beginPath();fallback.arc(x,y,Math.max(.7,size*.5),0,TAU);fallback.fill();
  }
 }
 frames++;
}
function frame(now){raf=0;if(document.hidden||lost)return;const dt=last?Math.min(.05,(now-last)/1000):.016;last=now;draw(dt);raf=requestAnimationFrame(frame);}
function schedule(){if(!raf&&!document.hidden&&!lost){last=0;raf=requestAnimationFrame(frame);}}
function halt(){cancelAnimationFrame(raf);raf=0;last=0;viewAt=0;}
try{if(gl)setup();else useFallback(rendererIssue||'WebGL unavailable');}catch(e){useFallback('WebGL initialization: '+e.message);}
// Capture native touch before descendants; Pointer Events are a deduplicated fallback.
// Reduced Motion quiets viewpoint input; the absolute-phase body loop always continues.
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
 if(reduced.matches)return;
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
window.addEventListener('resize',resize);if(window.visualViewport)visualViewport.addEventListener('resize',resize);window.addEventListener('hashchange',schedule);
document.addEventListener('visibilitychange',()=>{if(document.hidden){halt();endTouch();}else schedule();});
reduced.addEventListener('change',()=>{halt();release();if(reduced.matches)pose.x=pose.y=pointer.nx=pointer.ny=0;schedule();});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;halt();restoreTimer=setTimeout(()=>{if(lost){useFallback('WebGL context lost');resize();}},350);});canvas.addEventListener('webglcontextrestored',()=>{clearTimeout(restoreTimer);if(!gl)return;lost=false;count=0;try{setup();}catch(e){useFallback('WebGL restore failed');}resize();});
window.addEventListener('pagehide',halt);window.addEventListener('pageshow',schedule);
window.__0086Field=Object.freeze({version:20,loopMs:LOOP,get phase(){return(performance.now()%LOOP)/LOOP;},get particleCount(){return gl?count:stars.length;},get renderer(){return gl?'webgl-volumetric-points':'canvas-fallback';},get rendererIssue(){return rendererIssue;},get inputSource(){return inputSource;},get viewport(){return {width,height};},get frames(){return frames;},get camera(){return {...pose};},get targetCamera(){return {x:pointer.nx,y:pointer.ny};},get interaction(){return touchMode?'volumetric-touch':'desktop-pointer';},get touchPoint(){return {...touchPoint};},get weather(){return {...weather};},get pulseAge(){return(performance.now()-hitAt)/1000;},get pointer(){return {...pointer};},get energy(){return level;},get reducedMotion(){return reduced.matches;},get touch(){return {taps:touchTaps,moves:touchMoves,active:touchId!==null,ripples:0};}});
resize();
})();
