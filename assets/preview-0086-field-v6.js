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
uniform float uTime,uDpr,uPointerOn,uLevel,uHome;
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
 float dist=length(delta), near=exp(-dist*dist/(145.*145.))*uPointerOn;
 pos+=delta/max(dist,1.)*near*30.;
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
 for(const n of ['Resolution','Pose','Pointer','Wind','Weather','Hit','Time','Dpr','PointerOn','Level','Home'])loc[n]=gl.getUniformLocation(program,'u'+n);
 gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.clearColor(.001,.002,.006,1);
}
let fallback=null,stars=[];
function resize(){
 width=innerWidth;height=innerHeight;dpr=Math.min(devicePixelRatio||1,coarse.matches?1.25:1.5);
 canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
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
  gl.uniform1f(loc.PointerOn,pointer.active);gl.uniform1f(loc.Level,level);gl.uniform1f(loc.Home,home?1:0);
  gl.drawArrays(gl.POINTS,0,count);
 }else if(fallback){
  fallback.globalCompositeOperation='source-over';fallback.fillStyle='#010208';fallback.fillRect(0,0,width,height);fallback.globalCompositeOperation='lighter';
  for(const s of stars){const a=s.a+clock*.05,rad=s.r*Math.min(width,height)*.44;const x=width*.52+Math.cos(a)*rad+pose.x*28,y=height*.52+Math.sin(a)*rad+pose.y*22;fallback.fillStyle='rgba(117,171,255,.65)';fallback.shadowColor='#3069ff';fallback.shadowBlur=8;fallback.beginPath();fallback.arc(x,y,s.size,0,6.283);fallback.fill();}fallback.shadowBlur=0;
 }
 frames++;
}
function frame(now){raf=0;if(document.hidden||reduced.matches||lost)return;const dt=last?Math.min(.05,(now-last)/1000):.016;last=now;draw(dt);raf=requestAnimationFrame(frame);}
function schedule(){if(!raf&&!document.hidden&&!reduced.matches&&!lost){last=0;raf=requestAnimationFrame(frame);}}
function halt(){cancelAnimationFrame(raf);raf=0;last=0;}
try{if(gl)setup();else fallback=canvas.getContext('2d',{alpha:false});}catch(e){console.warn('0086 particle shader:',e.message);canvas.dataset.renderError=e.message;return;}
document.addEventListener('pointermove',e=>{if(reduced.matches||e.pointerType==='touch')return;pointer.x=e.clientX;pointer.y=e.clientY;pointer.active=1;pointer.nx=bound(e.clientX/width*2-1,-1,1);pointer.ny=bound(e.clientY/height*2-1,-1,1);},{passive:true});
const release=()=>{pointer.active=0;pointer.nx=0;pointer.ny=0;};document.documentElement.addEventListener('pointerleave',release);window.addEventListener('blur',release);
document.addEventListener('0086:beat',e=>{if(reduced.matches)return;const d=e.detail||{};hitX=bound((d.x??width*.5)/width,0,1);hitY=bound((d.y??height*.5)/height,0,1);hitAt=performance.now();hitPower=bound(d.power||.7,0,1);});
document.addEventListener('pointerdown',e=>{if(e.target.closest('#site-music')||reduced.matches)return;hitX=e.clientX/width;hitY=e.clientY/height;hitAt=performance.now();hitPower=.75;},{passive:true});
window.addEventListener('resize',resize);window.addEventListener('hashchange',()=>{if(reduced.matches)draw(0);});
document.addEventListener('visibilitychange',()=>{if(document.hidden)halt();else{if(reduced.matches)draw(0);else schedule();}});
reduced.addEventListener('change',()=>{halt();release();if(reduced.matches)draw(0);else schedule();});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;halt();});canvas.addEventListener('webglcontextrestored',()=>{lost=false;count=0;setup();resize();});
window.addEventListener('pagehide',halt);window.addEventListener('pageshow',e=>{if(e.persisted)schedule();});
window.__0086Field=Object.freeze({renderer:gl?'webgl-additive':'canvas-fallback',get frames(){return frames;},get camera(){return {...pose};},get weather(){return {...weather};},get pulseAge(){return(performance.now()-hitAt)/1000;},get pointer(){return {...pointer};},get energy(){return level;},get reducedMotion(){return reduced.matches;}});
resize();if(reduced.matches)draw(0);else schedule();
})();