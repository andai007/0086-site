/* 0086 v23 - unmistakable volumetric wind, clear sky and strong sun.
 * The seamless sphere / torus / folded-volume morph keeps its accumulated phase.
 * High wind adds fast rotation, body push, shear, tails, scatter and gust recoil;
 * clear and sunny weather use separate contrast, warmth and directional light. */
(() => {
'use strict';
let canvas=document.getElementById('field');if(!canvas||window.__0086Field)return;
const reduced=matchMedia('(prefers-reduced-motion: reduce)'),coarse=matchMedia('(pointer:coarse)');
let gl=null,rendererIssue='';
try{gl=canvas.getContext('webgl',{alpha:false,antialias:false,powerPreference:'low-power',preserveDrawingBuffer:false});}catch(e){rendererIssue=e.name;}
const bound=(x,a,b)=>Math.max(a,Math.min(b,x));
const pointer={x:innerWidth*.5,y:innerHeight*.5,active:0,nx:0,ny:0};
const pose={x:0,y:0},weather={power:.26,windX:.3,windY:.1,rain:0,humidity:.55,cloud:.4,day:.5,warm:.35,gust:.05,sun:0,dawn:0,sunAzimuth:0,twilight:0};
const WX_PRESETS={
 clear:{power:.18,windX:.18,windY:.98,rain:0,humidity:.38,cloud:.06,day:1,warm:.58,gust:.02,sun:.34,dawn:0,sunAzimuth:.10,twilight:0,label:'模拟·晴 27°C 风 0.8m/s 无雨',sunrise:'06:30'},
 wind:{power:.78,windX:-.94,windY:.34,rain:0,humidity:.58,cloud:.28,day:1,warm:.52,gust:.42,sun:.34,dawn:0,sunAzimuth:.2,twilight:0,label:'模拟·大风 25°C 风 9.0m/s 无雨',sunrise:'06:30'},
 rain:{power:.48,windX:-.55,windY:.84,rain:.58,humidity:.92,cloud:.90,day:.65,warm:.45,gust:.20,sun:0,dawn:0,sunAzimuth:0,twilight:0,label:'模拟·雨 23°C 风 3.1m/s 雨 3.5mm',sunrise:'06:30'},
 storm:{power:1,windX:.88,windY:.47,rain:1,humidity:.98,cloud:1,day:.20,warm:.30,gust:.92,sun:0,dawn:0,sunAzimuth:0,twilight:0,label:'模拟·暴雨 20°C 风 14.0m/s 雨 8.0mm',sunrise:'06:30'},
 night:{power:.30,windX:.30,windY:-.95,rain:0,humidity:.68,cloud:.22,day:0,warm:.32,gust:.08,sun:0,dawn:0,sunAzimuth:1,twilight:1,label:'模拟·夜间 20°C 风 1.5m/s 无雨',sunrise:'06:30'},
 cloudy:{power:.34,windX:-.25,windY:.97,rain:0,humidity:.78,cloud:.96,day:1,warm:.42,gust:.10,sun:.02,dawn:0,sunAzimuth:0,twilight:0,label:'模拟·多云 22°C 风 2.0m/s 无雨',sunrise:'06:30'},
 sunny:{power:.16,windX:.12,windY:.99,rain:0,humidity:.34,cloud:.02,day:1,warm:.78,gust:.01,sun:1,dawn:0,sunAzimuth:.48,twilight:0,label:'模拟·大太阳 29°C 风 0.6m/s 无雨',sunrise:'06:30'},
 sunrise:{power:.16,windX:-.12,windY:.99,rain:0,humidity:.70,cloud:.10,day:.55,warm:.50,gust:.01,sun:.20,dawn:1,sunAzimuth:-1,twilight:0,label:'模拟·日出 22°C 风 0.5m/s 无雨',sunrise:'06:30'},
 sunset:{power:.20,windX:.20,windY:.98,rain:0,humidity:.64,cloud:.16,day:.35,warm:.48,gust:.02,sun:.12,dawn:1,sunAzimuth:1,twilight:1,label:'模拟·日落 24°C 风 0.8m/s 无雨',sunrise:'06:30'}
};
const wxName=new URLSearchParams(location.search).get('wx'),forced=WX_PRESETS[wxName]||null;
if(forced)for(const key in weather)weather[key]=forced[key];
const weatherEffect={speed:.7,drift:{x:0,y:0},rainAmount:0,brightness:1,sun:0,dawn:0,sunAzimuth:0,windPush:0,gustPulse:0,sunGlow:0,clarity:0,tint:{warm:0,rgb:[.88,.91,.96]}};
const LOOP=22000,TAU=Math.PI*2;
let width=0,height=0,dpr=1,last=0,raf=0,frames=0,phase=0,gustPhase=.63,hitAt=-100,hitX=.5,hitY=.5,hitPower=0,level=0,program=null,buffer=null,count=0,loc={},lost=false;
const smooth=x=>x*x*(3-2*x);
const shenzhenDateKey=ms=>{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(ms));
 const get=type=>parts.find(p=>p.type===type)?.value;return `${get('year')}-${get('month')}-${get('day')}`;
};
const shenzhenTimeMs=value=>{
 if(typeof value!=='string')return NaN;
 return Date.parse(value+(/[zZ]|[+-]\d\d:\d\d$/.test(value)?'':'+08:00'));
};
function solarFromPayload(payload,now=Date.now()){
 const c=payload?.current||payload||{},daily=payload?.daily||{};
 const dates=Array.isArray(daily.time)?daily.time:[],date=shenzhenDateKey(now),index=Math.max(0,dates.indexOf(date));
 const sunrise=Array.isArray(daily.sunrise)?daily.sunrise[index]:null,sunset=Array.isArray(daily.sunset)?daily.sunset[index]:null;
 const rise=shenzhenTimeMs(sunrise),set=shenzhenTimeMs(sunset),valid=Number.isFinite(rise)&&Number.isFinite(set)&&set>rise;
 const cloud=bound((Number.isFinite(c.cloud_cover)?c.cloud_cover:40)/100,0,1),isDay=Number.isFinite(c.is_day)?bound(c.is_day,0,1):(valid&&now>=rise&&now<=set?1:0);
 const progress=valid?bound((now-rise)/(set-rise),0,1):.5,altitude=valid?Math.max(0,Math.sin(progress*Math.PI)):isDay;
 const radiation=Number.isFinite(c.shortwave_radiation)?bound((c.shortwave_radiation-25)/675,0,1):NaN;
 const uv=Number.isFinite(c.uv_index)?bound(c.uv_index/8,0,1):NaN;
 const measured=Number.isFinite(radiation)?radiation:(Number.isFinite(uv)?uv:altitude*Math.pow(1-cloud,1.15));
 const clearSky=smooth(bound((.82-cloud)/.62,0,1)),sun=bound(isDay*measured*clearSky,0,1);
 const riseDistance=valid?Math.abs(now-rise)/3600000:Infinity,setDistance=valid?Math.abs(now-set)/3600000:Infinity;
 const eventDistance=Math.min(riseDistance,setDistance),dawn=smooth(bound(1-eventDistance,0,1));
 return {sun,dawn,sunAzimuth:progress*2-1,twilight:setDistance<riseDistance?1:0,sunrise,sunset};
}
let liveSolar={sun:0,dawn:0,sunAzimuth:0,twilight:0,sunrise:null,sunset:null};
let liveSignals={windSpeed:0,windGust:0,highWind:false,windIntensity:0,strongSun:false,sunIntensity:0};
function signalsFromPayload(payload){
 const c=payload?.current||payload||{};let speed=Number(c.wind_speed_10m),gust=Number(c.wind_gusts_10m);
 const unit=payload?.current_units?.wind_speed_10m;if(unit==='km/h'){speed/=3.6;gust/=3.6;}
 if(!Number.isFinite(speed))speed=0;if(!Number.isFinite(gust))gust=speed;
 const highWind=speed>=6||gust>=10,windExcess=Math.max(bound((speed-6)/8,0,1),bound((gust-10)/12,0,1));
 const cloud=bound((Number.isFinite(c.cloud_cover)?c.cloud_cover:100)/100,0,1),day=bound(Number(c.is_day)||0,0,1);
 const radiation=Number(c.shortwave_radiation),uv=Number(c.uv_index),radiationHigh=Number.isFinite(radiation)&&radiation>=350,uvHigh=Number.isFinite(uv)&&uv>=3.5;
 const strongSun=!!day&&cloud<.30&&(radiationHigh||uvHigh||(!Number.isFinite(radiation)&&!Number.isFinite(uv)));
 const sunIntensity=strongSun?bound(.72+Math.max(Number.isFinite(radiation)?bound((radiation-350)/450,0,1):0,Number.isFinite(uv)?bound((uv-3.5)/5,0,1):0)*.28,.72,1):0;
 return {windSpeed:speed,windGust:gust,highWind,windIntensity:highWind?.62+windExcess*.38:0,strongSun,sunIntensity};
}
const vert=`
precision highp float;
attribute vec4 aSeed;
uniform vec2 uResolution,uPose,uPointer,uWind;
uniform vec3 uTouchPoint;
uniform vec4 uWeather,uClimate,uSolar,uMaterial;
uniform vec4 uHit;
uniform float uPhase,uDpr,uPointerOn,uLevel,uHome,uTouch,uQuiet,uPointScale;
varying vec3 vColor;
varying float vGain,vRare,vRain,vHumidity,vClarity,vTrail,vGlint;
varying vec2 vWindDir;
const float TAU=6.28318530718;
void main(){
 float loopAngle=uPhase*TAU;
 float clarity=max(0.,uMaterial.w),legacyVisual=step(uMaterial.w,-.5);
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
 p*=1.+uWeather.w*mix(.17,.13,legacyVisual)-clarity*.10-uSolar.x*mix(.035,.075,legacyVisual);
 p.y*=1.+uSolar.y*.045;
 p.y+=uSolar.y*.055*mix(1.,.55,uSolar.w);
 float gustNoise=sin(aSeed.x*91.7+loopAngle*7.)*cos(aSeed.y*57.3-loopAngle*5.);
 p+=direction*gustNoise*uClimate.z*.045*(.35+.65*aSeed.w);

 float yaw=loopAngle+uPose.x*.16*(1.-uQuiet)+uWind.x*.16;
 float pitch=-.18+.055*sin(loopAngle)*mix(1.,.65,uQuiet)+uPose.y*.10*(1.-uQuiet)-uWind.y*.13;
 p.xz=mat2(cos(yaw),-sin(yaw),sin(yaw),cos(yaw))*p.xz;
 p.yz=mat2(cos(pitch),-sin(pitch),sin(pitch),cos(pitch))*p.yz;
 float camera=2.65, perspective=camera/(camera-p.z*.82);
 float unit=min(uResolution.x*.455,uResolution.y*.33);
 vec2 center=uResolution*vec2(.50,mix(.51,.555,uHome))+uPose*vec2(9.,7.)*(1.-uQuiet);
 vec2 pos=center+p.xy*unit*perspective;
 float depthValue=p.z;
 pos+=vec2(uWind.x,-uWind.y)*uResolution.x*(.72+.28*sin(loopAngle));
 vec2 windDir=normalize(vec2(uWind.x,-uWind.y)+vec2(.0001));
 vec2 windPerp=vec2(-windDir.y,windDir.x),bodyDelta=pos-center;
 float windMode=smoothstep(.045,.075,uMaterial.x),along=dot(bodyDelta,windDir),crossWind=dot(bodyDelta,windPerp);
 pos+=windDir*(along*.26+crossWind*.18)*windMode;
 float edge=smoothstep(.55,1.02,length(p)),flySeed=fract(aSeed.x*83.7+aSeed.y*29.1+aSeed.w*61.3);
 float fly=pow(.5+.5*sin(loopAngle*2.+aSeed.x*TAU),8.)*step(.82,flySeed)*edge*windMode;
 pos+=windDir*unit*(fly*(.20+.18*flySeed)+edge*windMode*(aSeed.w-.5)*.055);
 pos+=windPerp*unit*sin(loopAngle*2.+aSeed.y*TAU)*fly*.12;
 pos+=windDir*uResolution.x*uMaterial.x;
 float rainSeed=fract(aSeed.x*37.1+aSeed.y*83.7+aSeed.z*19.3);
 float rainMask=step(1.-uWeather.z*.48,rainSeed)*step(.001,uWeather.z);
 float fall=fract(aSeed.w+uPhase*(.72+uWeather.z*1.86));
 vec2 rainPos=center+vec2((aSeed.x-.5)*uResolution.x*1.08+uWind.x*uResolution.x*fall*2.8,(fall-.5)*uResolution.y*1.18);
 pos=mix(pos,rainPos,rainMask*.94);
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
 size=mix(size,7.+uWeather.z*15.,rainMask);
 float night=1.-uClimate.x;
 float farKeep=mix(step(night*.42,fract(aSeed.x*71.9+aSeed.z*13.7)),1.,frontDepth);
 size*=farKeep;
 vTrail=windMode*edge*(.28+.72*flySeed)*(1.-rainMask);
 gl_PointSize=min(24.*uDpr,size*(1.+near*.22+ring*.10)*(1.+vTrail*1.65)*uDpr);
 float lightFacing=.5+.5*clamp(p.x*uSolar.z+p.y*.28+p.z*.16,-1.,1.);
 vec3 farSilver=mix(vec3(.40,.48,.60),vec3(.58,.50,.38),uClimate.y*.34);
 vec3 nearSilver=mix(vec3(.94,.97,1.),vec3(1.,.92,.75),uClimate.y*.30);
 nearSilver=mix(nearSilver,farSilver,uWeather.w*mix(.38,.22,legacyVisual));
 vColor=mix(farSilver,nearSilver,.18+.82*frontDepth);
 vec3 directionalSun=mix(vec3(.30,.39,.56),vec3(1.,.82,.52),lightFacing);
 float sunMix=clamp(uSolar.x*mix(.12+.32*lightFacing,.17+.40*lightFacing,legacyVisual)+uMaterial.z*(.28+.56*lightFacing),0.,.94);
 vColor=mix(vColor,directionalSun,sunMix);
 vColor=mix(vColor,vec3(1.,.96,.84),clarity*.18);
 vec3 dawnGold=mix(vec3(1.,.82,.58),vec3(.96,.62,.38),uSolar.w);
 vec3 dawnGradient=mix(vec3(.55,.64,.78),dawnGold,.24+.76*lightFacing);
 vColor=mix(vColor,dawnGradient,uSolar.y*(.24+.30*lightFacing));
 float sunsetDim=mix(1.,.76,uSolar.y*uSolar.w);
 vGlint=step(.55,rare)*uMaterial.z*(.18+.82*pow(.5+.5*sin(loopAngle*9.+aSeed.x*TAU*5.),7.));
 vColor=mix(vColor,vec3(1.,.91,.64),vGlint*.72);
 vGain=mix(.18,.88,pow(frontDepth,1.18))*(1.+near*.52+ring*.55+uLevel*.08*pow(sin(loopAngle),2.))*(1.+vGlint*.75)*uClimate.w*(1.+uSolar.x*mix(.20,.34,legacyVisual)+uMaterial.z*.30+uSolar.y*.08)*mix(1.,mix(.72,1.30,lightFacing),uMaterial.z)*sunsetDim*farKeep;
 vRare=rare;
 vRain=rainMask;
 vHumidity=uWeather.y;
 vClarity=uMaterial.w;
 vWindDir=windDir;
}
`;
const frag=`
precision mediump float;
varying vec3 vColor;varying float vGain,vRare,vRain,vHumidity,vClarity,vTrail,vGlint;varying vec2 vWindDir;
void main(){
 vec2 q=gl_PointCoord*2.-1.;q.x*=mix(1.,4.4,vRain);
 vec2 windQ=vec2(dot(q,vWindDir)*mix(1.,.30,vTrail),dot(q,vec2(-vWindDir.y,vWindDir.x)));q=mix(q,windQ,vTrail);
 float r2=dot(q,q);if(r2>1.)discard;
 float radius=sqrt(r2);
 float clarity=max(0.,vClarity),legacyVisual=step(vClarity,-.5);
 float coreEnd=mix(mix(.70,.58,vHumidity),.51,clarity*.72);
 float core=1.-smoothstep(.36,coreEnd,radius);
 float softEdge=(1.-smoothstep(coreEnd,mix(.92,.98,vHumidity),radius))*mix(mix(.13,.21,vHumidity),.07,clarity);
 float profile=core+(1.-core)*softEdge;
 float alpha=profile*min(mix(.98,.94,legacyVisual),vGain)*mix(mix(.40+clarity*.14,.44,legacyVisual)+vRare*.20,.74,vRain);
 vec3 silver=mix(vColor,vec3(1.),mix(.34+clarity*.12,.38,legacyVisual)+vGlint*.16);
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
 for(const n of ['Resolution','Pose','Pointer','Wind','Weather','Climate','Solar','Material','Hit','Phase','Dpr','PointerOn','Level','Home','Touch','TouchPoint','Quiet','PointScale'])loc[n]=gl.getUniformLocation(program,'u'+n);
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
function updateWeatherEffect(){
 const windStrength=bound((weather.power-.12)/.88+weather.gust*.12,0,1);
 const forcedWind=wxName==='wind',highWind=forcedWind||(!forced&&liveSignals.highWind),legacyVisual=weather.rain>.001||weather.dawn>.001;
 const windIntensity=forcedWind?bound(.65+weather.gust*.35,.65,1):liveSignals.windIntensity;
 const baseSpeed=highWind?2.2+.6*windIntensity:legacyVisual?.7+1.1*windStrength:.7+.42*windStrength;
 weatherEffect.speed=reduced.matches?(legacyVisual&&!highWind?Math.max(.5,baseSpeed*.72):Math.max(.6,baseSpeed*.78)):baseSpeed;
 const driftAmount=legacyVisual&&!highWind?.03+.02*windStrength:.018+.022*windStrength;
 weatherEffect.drift.x=weather.windX*driftAmount;
 weatherEffect.drift.y=weather.windY*driftAmount;
 weatherEffect.rainAmount=weather.rain;
 const clearBase=weather.day*smooth(bound((.78-weather.cloud)/.72,0,1))*(1-weather.rain*.72);
 weatherEffect.clarity=legacyVisual?0:wxName==='cloudy'?.05:wxName==='clear'?.88:wxName==='sunny'?.98:bound(clearBase,0,1);
 weatherEffect.sunGlow=legacyVisual?0:wxName==='sunny'?1:forced?0:(liveSignals.strongSun?liveSignals.sunIntensity:0);
 const gustAngle=gustPhase*TAU,gustKick=Math.pow(Math.max(0,Math.sin(gustAngle)),7),gustRebound=Math.pow(Math.max(0,-Math.sin(gustAngle)),5);
 weatherEffect.gustPulse=highWind*(.55+.45*bound(Math.max(weather.gust,windIntensity),0,1))*(gustKick-gustRebound*.28);
 const motionScale=reduced.matches?.72:1,basePush=highWind?(.08+.04*windIntensity)*motionScale:0;
 weatherEffect.windPush=basePush+weatherEffect.gustPulse*.045*motionScale;
 weatherEffect.brightness=legacyVisual?bound((.76+.24*weather.day)*(1.-weather.cloud*.28)+weather.sun*.28+weather.dawn*(weather.twilight?.02:.08)-weather.dawn*weather.twilight*.12,.44,1.28):bound((.72+.28*weather.day)*(1.-weather.cloud*.38)+weatherEffect.clarity*.20+weather.sun*.10+weatherEffect.sunGlow*.16,.42,1.40);
 weatherEffect.sun=bound(weather.sun,0,1);
 weatherEffect.dawn=bound(weather.dawn,0,1);
 weatherEffect.sunAzimuth=bound(weather.sunAzimuth,-1,1);
 const warm=bound(weather.warm,0,1),mix=warm*.28;
 weatherEffect.tint.warm=warm;
 weatherEffect.tint.rgb=[.88+(1-.88)*mix,.91+(.86-.91)*mix,.96+(.72-.96)*mix];
 const halo=document.getElementById('sun-halo'),dawnGlow=document.getElementById('dawn-glow'),clearSky=document.getElementById('clear-sky');
 if(clearSky)clearSky.style.opacity=(weatherEffect.clarity*.58).toFixed(3);
 if(halo){const legacySun=weatherEffect.dawn>.001;halo.dataset.legacy=String(legacySun);halo.style.opacity=(legacySun?weatherEffect.sun*.82:weatherEffect.sunGlow*.96).toFixed(3);halo.style.setProperty('--0086-sun-x',(legacySun?8+(weatherEffect.sunAzimuth+1)*42:10+(weatherEffect.sunAzimuth+1)*40).toFixed(1)+'%');halo.style.setProperty('--0086-sun-y',(15+Math.abs(weatherEffect.sunAzimuth)*13).toFixed(1)+'%');}
 if(dawnGlow)dawnGlow.style.opacity=(weatherEffect.dawn*(weather.twilight?.68:.92)).toFixed(3);
}
const readout=document.getElementById('weather-readout');
function refreshWeatherReadout(){
 if(!readout)return;
 if(forced){readout.textContent='深圳 '+forced.label+' · 日出 '+forced.sunrise;readout.dataset.simulated='true';return;}
 const payload=window.__0086WeatherRaw;const current=payload?.current||payload;
 liveSolar=solarFromPayload(payload);liveSignals=signalsFromPayload(payload);
 if(!current||!Number.isFinite(current.temperature_2m)||!Number.isFinite(current.wind_speed_10m)){readout.textContent='深圳天气连接中';return;}
 let speed=current.wind_speed_10m;const unit=payload?.current_units?.wind_speed_10m;if(unit==='km/h')speed/=3.6;
 const rain=Number.isFinite(current.precipitation)?Math.max(0,current.precipitation):0;
 const rise=liveSolar.sunrise?.slice(11,16)||'--:--';
 readout.textContent=`深圳 ${Math.round(current.temperature_2m)}°C 风 ${speed.toFixed(1)}m/s ${rain>.05?'雨 '+rain.toFixed(1)+'mm':'无雨'} · 日出 ${rise}`;
 readout.dataset.simulated='false';
}
function draw(dt){
 if(lost)return;
 const baseTarget=window.__0086?.weather?.target,target=forced||(baseTarget?{...baseTarget,...liveSolar}:null);
 if(target){const k=1-Math.exp(-dt/(forced?2.5:20));for(const key in weather)if(Number.isFinite(target[key]))weather[key]+=(target[key]-weather[key])*k;}
 gustPhase=(gustPhase+dt/Math.max(3.6,5.3-weather.gust*1.6))%1;
 updateWeatherEffect();phase=(phase+dt*1000/LOOP*weatherEffect.speed)%1;
 const now=performance.now(),loopAngle=phase*TAU,viewDt=touchMode&&viewAt?Math.min(.5,Math.max(0,(now-viewAt)/1000)):dt;viewAt=now;
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
  gl.uniform2f(loc.Wind,weatherEffect.drift.x,weatherEffect.drift.y);gl.uniform4f(loc.Weather,weather.power,weather.humidity,weather.rain,weather.cloud);gl.uniform4f(loc.Climate,weather.day,weather.warm,weather.gust,weatherEffect.brightness);
  gl.uniform4f(loc.Solar,weatherEffect.sun,weatherEffect.dawn,weatherEffect.sunAzimuth,weather.twilight);
  gl.uniform4f(loc.Material,weatherEffect.windPush,weatherEffect.gustPulse,weatherEffect.sunGlow,(weather.rain>.001||weather.dawn>.001)?-1:weatherEffect.clarity);
  gl.uniform4f(loc.Hit,hitX,hitY,(now-hitAt)/1000,hitPower);gl.uniform1f(loc.Phase,phase);gl.uniform1f(loc.Dpr,dpr);
  gl.uniform3f(loc.TouchPoint,touchPoint.x,touchPoint.y,0);gl.uniform1f(loc.Touch,touchMode);gl.uniform1f(loc.Quiet,reduced.matches?1:0);gl.uniform1f(loc.PointerOn,pointer.active);gl.uniform1f(loc.Level,level);gl.uniform1f(loc.Home,home?1:0);gl.uniform1f(loc.PointScale,width<721?1.06:1.);
  gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  gl.drawArrays(gl.POINTS,0,count);
 }else if(fallback){
  fallback.globalCompositeOperation='source-over';fallback.fillStyle='#010208';fallback.fillRect(0,0,width,height);
  const w0=Math.pow(.5+.5*Math.cos(loopAngle),3),w1=Math.pow(.5+.5*Math.cos(loopAngle-TAU/3),3),w2=Math.pow(.5+.5*Math.cos(loopAngle-TAU*2/3),3),weightSum=w0+w1+w2;
  const breathe=1+.045*Math.sin(loopAngle*2),yaw=loopAngle+pose.x*.16*(reduced.matches?0:1)+weatherEffect.drift.x*.16,pitch=-.18+.055*Math.sin(loopAngle)*(reduced.matches?.65:1)+pose.y*.10*(reduced.matches?0:1)-weatherEffect.drift.y*.13,cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  const unit=Math.min(width*.455,height*.33),centerX=width*.5+pose.x*9*(reduced.matches?0:1),centerY=height*(home?.555:.51)+pose.y*7*(reduced.matches?0:1),legacyVisual=weather.rain>.001||weather.dawn>.001;
  const windLength=Math.max(.0001,Math.hypot(weatherEffect.drift.x,weatherEffect.drift.y)),windDirX=weatherEffect.drift.x/windLength,windDirY=-weatherEffect.drift.y/windLength,windPerpX=-windDirY,windPerpY=windDirX,windMode=weatherEffect.windPush>.045?1:0;
  for(const s of stars){
   const ripple=s.radial*(.84+.12*Math.sin(s.longitude*3+loopAngle)+.08*Math.cos(s.latitude*4-loopAngle));
   let fx=s.dx*ripple*1.04,fy=s.dy*ripple*.88,fz=s.dz*ripple*1.10;
   fx+=.045*Math.sin(fy*5+loopAngle);fy+=.035*Math.cos(fx*4-loopAngle);fz+=.045*Math.sin(fx*3+fy*2);
   const gustNoise=Math.sin(s.longitude*14.6+loopAngle*7)*Math.cos(s.latitude*9.1-loopAngle*5),scatter=1+weather.cloud*(legacyVisual?.13:.17)-weatherEffect.clarity*.10-weatherEffect.sun*(legacyVisual?.075:.035);
   let px=((s.sx*w0+s.tx*w1+fx*w2)/weightSum*breathe+s.dx*gustNoise*weather.gust*.045*(.35+.65*s.w))*scatter,py=((s.sy*w0+s.ty*w1+fy*w2)/weightSum*breathe+s.dy*gustNoise*weather.gust*.045*(.35+.65*s.w))*scatter,pz=((s.sz*w0+s.tz*w1+fz*w2)/weightSum*breathe+s.dz*gustNoise*weather.gust*.045*(.35+.65*s.w))*scatter;
   py+=.035*Math.sin(loopAngle+px*3.2)*(1-s.radial);
   py=py*(1+weatherEffect.dawn*.045)+weatherEffect.dawn*.055*(weather.twilight?.55:1);
   const xx=px*cy-pz*sy,zz=px*sy+pz*cy,yy=py*cp-zz*sp,z=py*sp+zz*cp,perspective=2.65/(2.65-z*.82);
   let x=centerX+xx*unit*perspective+weatherEffect.drift.x*width*(.72+.28*Math.sin(loopAngle)),y=centerY+yy*unit*perspective-weatherEffect.drift.y*width*(.72+.28*Math.sin(loopAngle));
   const bodyX=x-centerX,bodyY=y-centerY,along=bodyX*windDirX+bodyY*windDirY,crossWind=bodyX*windPerpX+bodyY*windPerpY,edge=smooth(bound((Math.hypot(px,py,pz)-.55)/.47,0,1)),flySeed=((s.longitude*13.32+s.latitude*9.26+s.w*61.3)%1+1)%1,fly=Math.pow(.5+.5*Math.sin(loopAngle*2+s.longitude),8)*(flySeed>.82?1:0)*edge*windMode;
   x+=windDirX*(along*.26+crossWind*.18)*windMode+windDirX*unit*(fly*(.20+.18*flySeed)+edge*windMode*(s.w-.5)*.055)+windPerpX*unit*Math.sin(loopAngle*2+s.latitude)*fly*.12+windDirX*width*weatherEffect.windPush;
   y+=windDirY*(along*.26+crossWind*.18)*windMode+windDirY*unit*(fly*(.20+.18*flySeed)+edge*windMode*(s.w-.5)*.055)+windPerpY*unit*Math.sin(loopAngle*2+s.latitude)*fly*.12+windDirY*width*weatherEffect.windPush;
   const raining=weather.rain>.001&&s.w>1-weather.rain*.48;
   if(raining){const fall=(s.w+phase*(.72+weather.rain*1.86))%1;x=centerX+(s.longitude/TAU-.5)*width*1.08+weatherEffect.drift.x*width*fall*2.8;y=centerY+(fall-.5)*height*1.18;}
   const ddx=x-pointer.x,ddy=y-pointer.y,reach=touchMode?110:145,near=Math.exp(-(ddx*ddx+ddy*ddy)/(reach*reach))*pointer.active;
   x+=ddx/Math.max(1,Math.hypot(ddx,ddy))*near*(reduced.matches?18:26);y+=ddy/Math.max(1,Math.hypot(ddx,ddy))*near*(reduced.matches?18:26);
   const depth=Math.max(0,Math.min(1,(z+.92)/1.84)),night=1-weather.day,farKeep=depth<.5&&((s.longitude*11.44+s.w*13.7)%1+1)%1<night*.42?0:1,baseSize=2.7+3.7*Math.pow(s.w,2.2)+s.rare*7.5,size=Math.min(24,(raining?7+weather.rain*15:baseSize*perspective*(.60+.88*depth)*(width<721?1.06:1))*farKeep);
   const facing=bound(.5+.5*(xx*weatherEffect.sunAzimuth+yy*.28+z*.16),0,1),solarMix=legacyVisual?weatherEffect.sun*(.17+.40*facing):bound(weatherEffect.sun*(.12+.32*facing)+weatherEffect.sunGlow*(.28+.56*facing),0,.94),dawnMix=weatherEffect.dawn*(.24+.30*facing),sunsetDim=1-weatherEffect.dawn*weather.twilight*.24,glint=(s.rare>.55?1:0)*weatherEffect.sunGlow*(.18+.82*Math.pow(.5+.5*Math.sin(loopAngle*9+s.longitude*5),7));
   const gain=(.18+.70*Math.pow(depth,1.18))*(1+near*.52)*(1+glint*.75)*weatherEffect.brightness*(1+weatherEffect.sun*(legacyVisual?.34:.20)+weatherEffect.sunGlow*.30+weatherEffect.dawn*.08)*(legacyVisual?1:.72+(.58*facing)*weatherEffect.sunGlow+.29*(1-weatherEffect.sunGlow))*sunsetDim*farKeep,shade=108+137*depth,warm=weather.warm*.20;
   let red=shade+warm*45,green=shade+6+warm*15,blue=shade+15-warm*30;
   const shadow=[77,99,143],gold=[255,209,133],dawnGold=weather.twilight?[245,158,97]:[255,209,148];
   red=red+(shadow[0]+(gold[0]-shadow[0])*facing-red)*solarMix;green=green+(shadow[1]+(gold[1]-shadow[1])*facing-green)*solarMix;blue=blue+(shadow[2]+(gold[2]-shadow[2])*facing-blue)*solarMix;
   red=red+(255-red)*weatherEffect.clarity*.18;green=green+(245-green)*weatherEffect.clarity*.18;blue=blue+(214-blue)*weatherEffect.clarity*.18;
   red=red+(140+(dawnGold[0]-140)*facing-red)*dawnMix;green=green+(163+(dawnGold[1]-163)*facing-green)*dawnMix;blue=blue+(199+(dawnGold[2]-199)*facing-blue)*dawnMix;
   red=red+(255-red)*glint*.72;green=green+(232-green)*glint*.72;blue=blue+(163-blue)*glint*.72;
   red=Math.min(255,Math.round(red));green=Math.min(255,Math.round(green));blue=Math.min(255,Math.round(blue));
   fallback.fillStyle=`rgba(${red},${green},${blue},${Math.min(legacyVisual?.94:.98,gain)*(raining?.74:(legacyVisual?.44:.40+weatherEffect.clarity*.14)+s.rare*.20)})`;
   if(raining)fallback.fillRect(x-size*.08,y-size*.5,Math.max(.7,size*.16),size);else{const trail=windMode*edge*(.28+.72*flySeed);fallback.beginPath();fallback.ellipse(x,y,Math.max(.7,size*.5)*(1+trail*2.1),Math.max(.7,size*.5),Math.atan2(windDirY,windDirX),0,TAU);fallback.fill();}
  }
 }
 frames++;
}
function frame(now){raf=0;if(document.hidden||lost)return;const dt=last?Math.min(.05,(now-last)/1000):.016;last=now;draw(dt);raf=requestAnimationFrame(frame);}
function schedule(){if(!raf&&!document.hidden&&!lost){last=0;raf=requestAnimationFrame(frame);}}
function halt(){cancelAnimationFrame(raf);raf=0;last=0;viewAt=0;}
try{if(gl)setup();else useFallback(rendererIssue||'WebGL unavailable');}catch(e){useFallback('WebGL initialization: '+e.message);}
// Capture native touch before descendants; Pointer Events are a deduplicated fallback.
// Reduced Motion quiets viewpoint input but keeps weather motion and wind cues at >= 0.6x.
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
updateWeatherEffect();refreshWeatherReadout();setInterval(refreshWeatherReadout,1000);
window.__0086Field=Object.freeze({version:23,designRevision:'volumetric-weather-v23',loopMs:LOOP,get phase(){return phase;},get weatherOverride(){return forced?wxName:null;},get particleCount(){return gl?count:stars.length;},get renderer(){return gl?'webgl-volumetric-weather-points':'canvas-fallback';},get rendererIssue(){return rendererIssue;},get inputSource(){return inputSource;},get viewport(){return {width,height};},get frames(){return frames;},get camera(){return {...pose};},get targetCamera(){return {x:pointer.nx,y:pointer.ny};},get interaction(){return touchMode?'volumetric-touch':'desktop-pointer';},get touchPoint(){return {...touchPoint};},get weather(){return {...weather};},get weatherEffect(){return {speed:weatherEffect.speed,drift:{...weatherEffect.drift},rainAmount:weatherEffect.rainAmount,brightness:weatherEffect.brightness,sun:weatherEffect.sun,dawn:weatherEffect.dawn,sunAzimuth:weatherEffect.sunAzimuth,windPush:weatherEffect.windPush,gustPulse:weatherEffect.gustPulse,sunGlow:weatherEffect.sunGlow,clarity:weatherEffect.clarity,tint:{warm:weatherEffect.tint.warm,rgb:[...weatherEffect.tint.rgb]}};},get solarTimes(){return {sunrise:liveSolar.sunrise,sunset:liveSolar.sunset};},get pulseAge(){return(performance.now()-hitAt)/1000;},get pointer(){return {...pointer};},get energy(){return level;},get reducedMotion(){return reduced.matches;},get touch(){return {taps:touchTaps,moves:touchMoves,active:touchId!==null,ripples:0};}});
resize();
})();
