/* 0086 — luminous, weather-driven point cloud. Native cursor; spring camera follows the pointer. */
(() => {
'use strict';
const canvas=document.getElementById('field');if(!canvas||window.__0086Field)return;
const reduced=matchMedia('(prefers-reduced-motion: reduce)'),coarse=matchMedia('(pointer:coarse)');
const gl=canvas.getContext('webgl',{alpha:false,antialias:false,powerPreference:'low-power',preserveDrawingBuffer:false});
const bound=(x,a,b)=>Math.max(a,Math.min(b,x));
const pointer={x:innerWidth*.5,y:innerHeight*.5,active:0,nx:0,ny:0};
const pose={x:0,y:0},weather={power:.26,windX:.3,windY:.1,rain:0,humidity:.55,cloud:.4,day:.5,warm:.35,gust:.05};
let width=0,height=0,dpr=1,clock=0,last=0,raf=0,frames=0,hitAt=-100,hitX=.5,hitY=.5,hitPower=0,level=0,program=null,buffer=null,count=0,loc={},lost=false;
const vert=`
precision highp float;
attribute vec4 aSeed;
uniform vec2 uResolution,uPose,uPointer,uWind;
uniform vec4 uWeather;
uniform vec4 uHit;
uniform float uTime,uDpr,uPointerOn,uLevel,uHome,uTouch;
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
 float yaw=uTime*.045+uPose.x*.46, pitch=-.15+uPose.y*.31;
 p.xz=mat2(cos(yaw),-sin(yaw),sin(yaw),cos(yaw))*p.xz;
 p.yz=mat2(cos(pitch),-sin(pitch),sin(pitch),cos(pitch))*p.yz;
 float perspective=2.8/(2.8-p.z*.70), unit=min(uResolution.x*.47,uResolution.y*.47);
 vec2 center=uResolution*vec2(.52,mix(.50,.54,uHome))+uPose*vec2(32.,23.);
 vec2 pos=center+p.xy*unit*perspective;
 pos+=uWind*(sin(uTime*.12)*22.);
 float rain=uWeather.z;
 vec2 fall=vec2(fract(aSeed.x+uTime*.007*uWind.x)*uResolution.x,fract(aSeed.y+uTime*(.09+aSeed.z*.08))*uResolution.y);
 pos=mix(pos,fall,rain*.72);
 vec2 delta=pos-uPointer;
 float reach=mix(145.,112.,uTouch);
 float dist=length(delta), near=exp(-dist*dist/(reach*reach))*uPointerOn;
 pos+=delta/max(dist,1.)*near*mix(30.,58.,uTouch);
 float age=max(0.,uHit.z),front=age*470.;
 float ring=exp(-pow((length(pos-uHit.xy*uResolution)-front)/48.,2.))*exp(-age*2.0)*uHit.w;
 pos+=normalize(pos-uHit.xy*uResolution+vec2(.01))*ring*19.;
 pos+=p.xy*uLevel*3.;
 gl_Position=vec4(pos/uResolution*2.-1.,0.,1.);gl_Position.y=-gl_Position.y;
 float frontDepth=clamp((p.z+1.3)/2.4,0.,1.);
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
 for(const n of ['Resolution','Pose','Pointer','Wind','Weather','Hit','Time','Dpr','PointerOn','Level','Home','Touch'])loc[n]=gl.getUniformLocation(program,'u'+n);
 gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.clearColor(.001,.002,.006,1);
}
let fallback=null,stars=[];
function resize(){
 width=innerWidth;height=innerHeight;dpr=Math.min(devicePixelRatio||1,coarse.matches?1.25:1.5);
 canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
 sizeTouchLayer();
 const next=width<721?4800:14500;
 if(gl&&!lost){gl.viewport(0,0,canvas.width,canvas.height);if(count!==next){count=next;const data=new Float32Array(count*4);let seed=86;for(let i=0;i<data.length;i++){seed=(seed*1664525+1013904223)>>>0;data[i]=seed/4294967296;}gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);}}
 else if(fallback){fallback.setTransform(dpr,0,0,dpr,0,0);stars=Array.from({length:1300},(_,i)=>({a:i*2.399963,r:Math.sqrt((i+.5)/1300),size:.5+(i%5)*.18}));}
 if(reduced.matches)draw(0);else schedule();
}
function draw(dt){
 if(lost)return;
 clock+=dt*(.6+weather.power*.65);
 const target=window.__0086?.weather?.target;
 if(target){const k=1-Math.exp(-dt/20);for(const key in weather)if(Number.isFinite(target[key]))weather[key]+=(target[key]-weather[key])*k;}
 const follow=1-Math.exp(-dt*5.8);pose.x+=(pointer.nx-pose.x)*follow;pose.y+=(pointer.ny-pose.y)*follow;
 const audio=window.__0086Music;const energy=audio?.sampleEnergy?audio.sampleEnergy():0;level+=(energy-level)*(1-Math.exp(-dt*7));
 const home=document.body.dataset.view==='home';
 if(gl){
  gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);
  gl.uniform2f(loc.Resolution,width,height);gl.uniform2f(loc.Pose,pose.x,pose.y);gl.uniform2f(loc.Pointer,pointer.x,pointer.y);
  gl.uniform2f(loc.Wind,weather.windX,weather.windY);gl.uniform4f(loc.Weather,weather.power,weather.humidity,weather.rain,weather.cloud);
  gl.uniform4f(loc.Hit,hitX,hitY,(performance.now()-hitAt)/1000,hitPower);gl.uniform1f(loc.Time,clock);gl.uniform1f(loc.Dpr,dpr);
  gl.uniform1f(loc.Touch,touchMode);gl.uniform1f(loc.PointerOn,pointer.active);gl.uniform1f(loc.Level,level);gl.uniform1f(loc.Home,home?1:0);
  gl.drawArrays(gl.POINTS,0,count);
 }else if(fallback){
  fallback.globalCompositeOperation='source-over';fallback.fillStyle='#010208';fallback.fillRect(0,0,width,height);fallback.globalCompositeOperation='lighter';
  for(const s of stars){const a=s.a+clock*.05,rad=s.r*Math.min(width,height)*.44;const x=width*.52+Math.cos(a)*rad+pose.x*28,y=height*.52+Math.sin(a)*rad+pose.y*22;fallback.fillStyle='rgba(117,171,255,.65)';fallback.shadowColor='#3069ff';fallback.shadowBlur=8;fallback.beginPath();fallback.arc(x,y,s.size,0,6.283);fallback.fill();}fallback.shadowBlur=0;
 }
 drawTouchFeedback();
 frames++;
}
function frame(now){raf=0;if(document.hidden||reduced.matches||lost)return;const dt=last?Math.min(.05,(now-last)/1000):.016;last=now;draw(dt);raf=requestAnimationFrame(frame);}
function schedule(){if(!raf&&!document.hidden&&!reduced.matches&&!lost){last=0;raf=requestAnimationFrame(frame);}}
function halt(){cancelAnimationFrame(raf);raf=0;last=0;}
try{if(gl)setup();else fallback=canvas.getContext('2d',{alpha:false});}catch(e){console.warn('0086 particle shader:',e.message);canvas.dataset.renderError=e.message;return;}

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
window.addEventListener('resize',resize);window.addEventListener('hashchange',()=>{if(reduced.matches)draw(0);});
document.addEventListener('visibilitychange',()=>{if(document.hidden){halt();endTouch();ripples.length=0;drawTouchFeedback();}else{if(reduced.matches)draw(0);else schedule();}});
reduced.addEventListener('change',()=>{halt();release();if(reduced.matches)draw(0);else schedule();});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;halt();});canvas.addEventListener('webglcontextrestored',()=>{lost=false;count=0;setup();resize();});
window.addEventListener('pagehide',halt);window.addEventListener('pageshow',e=>{if(e.persisted)schedule();});
window.__0086Field=Object.freeze({renderer:gl?'webgl-additive':'canvas-fallback',get frames(){return frames;},get camera(){return {...pose};},get weather(){return {...weather};},get pulseAge(){return(performance.now()-hitAt)/1000;},get pointer(){return {...pointer};},get energy(){return level;},get reducedMotion(){return reduced.matches;},get touch(){return {taps:touchTaps,moves:touchMoves,active:touchId!==null,ripples:ripples.length};}});
resize();if(reduced.matches)draw(0);else schedule();
})();