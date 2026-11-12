/* 0086 preview — electronic radio plus gesture-triggered original kick percussion.
 * Active source: FIP Electro (Radio France), explicitly labelled in the UI.
 * Public Radio Browser API resolves the station. Broadcaster-documented MP3
 * is the fallback if the directory is unavailable. No tracks are stored.
 */
(() => {
'use strict';
if(window.__0086Music)return;
const NAME='FIP Electro',HOME='https://www.radiofrance.fr/fip/radio-electro';
const DEFAULT='https://icecast.radiofrance.fr/fipelectro-midfi.mp3?id=openapi';
const CACHE='0086-electro-radio-v6',MUTE='0086-sound-muted',VOLUME=.18;
let stream=DEFAULT,catalogue='pending',stationId='',apiServer='';
const valid=s=>{try{const u=new URL(s);return u.protocol==='https:'&&u.hostname==='icecast.radiofrance.fr'&&/^\/fipelectro[^/]*\.mp3$/i.test(u.pathname)?u.href:null;}catch(_){return null;}};
try{const saved=JSON.parse(localStorage.getItem(CACHE)||'null');if(saved&&Date.now()-saved.at<3600000&&Date.now()>=saved.at&&valid(saved.url)){stream=valid(saved.url);catalogue='cached';}}catch(_){}
async function json(url,ms=4500){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),ms);try{const r=await fetch(url,{signal:ctrl.signal,credentials:'omit'});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json();}finally{clearTimeout(timer);}}
async function resolveStation(){
let servers=['de1.api.radio-browser.info'];
try{const list=await json('https://all.api.radio-browser.info/json/servers');const found=Array.isArray(list)?list.map(x=>x.name).filter(s=>typeof s==='string'&&/^[a-z0-9-]+\.api\.radio-browser\.info$/.test(s)):[];if(found.length)servers=[...new Set(found)].sort(()=>Math.random()-.5).slice(0,2);}catch(_){}
for(const host of servers){try{const items=await json('https://'+host+'/json/stations/search?name=fip&hidebroken=true&limit=100');if(!Array.isArray(items))continue;const station=items.find(s=>valid(s.url_resolved||s.url));if(!station)continue;stream=valid(station.url_resolved||station.url);stationId=String(station.stationuuid||'');apiServer='https://'+host;catalogue='radio-browser';try{localStorage.setItem(CACHE,JSON.stringify({at:Date.now(),url:stream}));}catch(_){}return;}catch(_){}}
if(catalogue!=='cached')catalogue='broadcaster-direct';
}
const audio=document.createElement('audio');audio.id='site-soundtrack';audio.preload='none';audio.crossOrigin='anonymous';audio.setAttribute('playsinline','');audio.volume=0;document.body.append(audio);
let wanted=false,optedOut=false,phase='off',ticket=0,retries=0,retryTimer=0,watchdog=0,fadeFrame=0,lastTime=0,lastProgress=0;
try{optedOut=localStorage.getItem(MUTE)==='1';}catch(_){}
const css=document.createElement('style');css.textContent=`
#site-music{position:fixed;z-index:9;right:24px;bottom:20px;left:auto;top:auto;display:flex;align-items:center;gap:12px;font:400 10.56px/15.84px var(--mono,monospace)}
#site-music a,#site-music button{color:#aaa;font:inherit;letter-spacing:.04em;text-decoration:none;white-space:nowrap}
#site-music a:hover,#site-music button:hover,#site-music button[aria-pressed=true]{color:#fff}
#site-music a:focus-visible,#site-music button:focus-visible{outline:1px solid #002fa7;outline-offset:4px}
#sound-toggle{padding:6px 0;background:none;border:0;border-radius:0;cursor:pointer;min-height:28px}
#site-music[data-state=error] #sound-toggle{color:#ff9999}
body[data-view=inside] #site-music{top:13px;bottom:auto;right:126px}
@media(max-width:560px){#site-music{right:16px;bottom:18px;gap:9px}body[data-view=inside] #site-music{right:110px;gap:7px}}
@media(max-width:380px){body[data-view=inside] #site-music .radio-source{display:none}}
`;document.head.append(css);
const root=document.createElement('div');root.id='site-music';root.innerHTML='<a class="radio-source" target="_blank" rel="noopener noreferrer">FIP ELECTRO</a><button id="sound-toggle" type="button" aria-pressed="false">声音 关</button>';document.body.append(root);
const button=root.querySelector('button'),source=root.querySelector('a');source.href=HOME;source.title='FIP Electro · Radio France · Electronic music';
const playing=()=>wanted&&phase==='playing'&&!audio.paused&&audio.readyState>=2;
function reflect(){const en=document.documentElement.lang==='en';const labels=en?{off:'SOUND OFF',connecting:'CONNECTING',playing:'SOUND ON',error:'RETRY',suspended:'SOUND OFF'}:{off:'声音 关',connecting:'连接中',playing:'声音 开',error:'重连',suspended:'声音 关'};root.dataset.state=phase;button.textContent=labels[phase]||labels.off;button.setAttribute('aria-pressed',String(playing()));button.setAttribute('aria-busy',String(phase==='connecting'));button.setAttribute('aria-label',en?(wanted?'Mute FIP Electro':'Play FIP Electro electronic music'):(wanted?'关闭 FIP Electro 电子乐':'开启 FIP Electro 电子乐'));button.title=phase==='error'?(en?'Radio stream unavailable. Retry or open the station.':'电台暂时未连接，点击重试或打开原站。'):source.title;}
const videoActive=()=>[...document.querySelectorAll('video')].some(v=>!v.paused&&!v.ended&&!v.muted&&v.volume>0);
function fade(to){cancelAnimationFrame(fadeFrame);const from=audio.volume,start=performance.now();function step(now){if(!wanted||document.hidden)return;const t=Math.min(1,(now-start)/1200);audio.volume=Math.max(0,Math.min(1,from+(to-from)*t));if(t<1)fadeFrame=requestAnimationFrame(step);}fadeFrame=requestAnimationFrame(step);}
function clear(){clearTimeout(retryTimer);retryTimer=0;clearInterval(watchdog);watchdog=0;cancelAnimationFrame(fadeFrame);}
function unload(){audio.pause();audio.removeAttribute('src');audio.load();audio.volume=0;}
function stop(user=false){wanted=false;ticket++;clear();unload();phase='off';retries=0;if(user){optedOut=true;try{localStorage.setItem(MUTE,'1');}catch(_){}}if(fx)fx.suspend().catch(()=>{});if('mediaSession'in navigator)navigator.mediaSession.playbackState='paused';reflect();}
function failure(){if(!wanted||document.hidden||retryTimer)return;ticket++;clear();unload();if(retries>=2){wanted=false;phase='error';reflect();return;}const delay=[2000,6000][retries++];phase='connecting';reflect();retryTimer=setTimeout(()=>{retryTimer=0;if(wanted)connect();},delay);}
function connect(){if(!wanted||document.hidden)return;clear();const run=++ticket;phase='connecting';unload();lastProgress=performance.now();lastTime=0;audio.src=stream;reflect();const promise=audio.play();if(promise)promise.catch(e=>{if(run!==ticket||!wanted)return;if(e.name==='NotAllowedError'){stop();return;}failure();});watchdog=setInterval(()=>{if(!wanted||document.hidden)return;if(audio.currentTime>lastTime+.01){lastTime=audio.currentTime;lastProgress=performance.now();}else if(performance.now()-lastProgress>16000)failure();},3000);}
function start(user=false){if(document.hidden)return;if(user){optedOut=false;try{localStorage.setItem(MUTE,'0');}catch(_){}}if(playing()||phase==='connecting')return;wanted=true;retries=0;prepareFX();connect();if(apiServer&&stationId)fetch(apiServer+'/json/url/'+encodeURIComponent(stationId),{credentials:'omit',keepalive:true}).catch(()=>{});}
audio.addEventListener('playing',()=>{if(!wanted){unload();return;}phase='playing';retries=0;lastProgress=performance.now();fade(videoActive()?VOLUME*.18:VOLUME);if('mediaSession'in navigator){navigator.mediaSession.playbackState='playing';if(window.MediaMetadata)navigator.mediaSession.metadata=new MediaMetadata({title:NAME,artist:'Radio France',album:'Electronic music · Live'});}reflect();});
for(const event of ['error','ended'])audio.addEventListener(event,failure);
audio.addEventListener('waiting',()=>{if(wanted){phase='connecting';reflect();}});
audio.addEventListener('pause',()=>{if(wanted&&phase==='playing'){phase='suspended';reflect();}});
button.onclick=()=>{if(wanted&&phase!=='error')stop(true);else start(true);};
document.addEventListener('click',e=>{if(e.target.closest('.entry-link')&&!optedOut&&!wanted)start();},true);
const duck=()=>{if(playing())fade(videoActive()?VOLUME*.18:VOLUME);};
for(const event of ['play','pause','ended','volumechange','emptied'])document.addEventListener(event,e=>{if(e.target.tagName==='VIDEO')duck();},true);
window.addEventListener('hashchange',()=>{reflect();setTimeout(duck,80);});new MutationObserver(reflect).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
function suspend(){if(!wanted)return;ticket++;clear();phase='suspended';unload();if(fx)fx.suspend().catch(()=>{});reflect();}
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();else if(wanted){phase='off';prepareFX();connect();}});
window.addEventListener('pagehide',suspend);window.addEventListener('pageshow',e=>{if(e.persisted&&wanted){phase='off';prepareFX();connect();}});
if('mediaSession'in navigator)for(const[name,handler]of[['play',()=>start(true)],['pause',()=>stop(true)],['stop',()=>stop(true)]]){try{navigator.mediaSession.setActionHandler(name,handler);}catch(_){}}
window.__0086Music=Object.freeze({title:NAME,mode:'electro-radio',provider:HOME,get catalogue(){return catalogue;},get playing(){return playing();},get audioTime(){return audio.currentTime||0;},get status(){return phase;},get stream(){return audio.currentSrc||stream;},sampleEnergy,get beats(){return beatCount;},get contextState(){return fx?.state||'uninitialized';},get analysisConnected(){return radioConnected;}});
let fx=null,fxGain=null,analyser=null,spectrum=null,beatCount=0,lastBeat=-1000,pathLength=0,lastPointer=null;
let radioConnected=false,fxPeak=0;
function prepareFX(){
 const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return Promise.resolve(false);
 if(!fx){
  fx=new AC();const compressor=fx.createDynamicsCompressor();compressor.threshold.value=-14;compressor.knee.value=12;compressor.ratio.value=7;compressor.attack.value=.003;compressor.release.value=.14;
  fxGain=fx.createGain();fxGain.gain.value=.58;fxGain.connect(compressor);compressor.connect(fx.destination);
  try{const radio=fx.createMediaElementSource(audio);analyser=fx.createAnalyser();analyser.fftSize=1024;analyser.smoothingTimeConstant=.76;spectrum=new Uint8Array(analyser.frequencyBinCount);radio.connect(analyser);analyser.connect(fx.destination);radioConnected=true;}catch(e){console.warn('Audio analysis unavailable:',e.name);}
 }
 return fx.resume().then(()=>fx.state==='running').catch(()=>false);
}
function kick(power,x,y,kind='move'){
 if(!wanted||!fx||fx.state!=='running'||document.hidden||videoActive())return false;
 const now=performance.now();if(now-lastBeat<380)return false;
 lastBeat=now;beatCount++;fxPeak=now;pathLength=0;
 const t=fx.currentTime,p=Math.max(.35,Math.min(1,power));
 const osc=fx.createOscillator(),gain=fx.createGain(),drive=fx.createWaveShaper();
 const curve=new Float32Array(256);for(let i=0;i<curve.length;i++){const a=i/255*2-1;curve[i]=Math.tanh(a*1.7)/Math.tanh(1.7);}drive.curve=curve;drive.oversample='2x';
 osc.type='sine';osc.frequency.setValueAtTime(152,t);osc.frequency.exponentialRampToValueAtTime(48,t+.095);osc.frequency.exponentialRampToValueAtTime(42,t+.48);
 gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.46*p,t+.004);gain.gain.exponentialRampToValueAtTime(.16*p,t+.09);gain.gain.exponentialRampToValueAtTime(.0001,t+.55);
 osc.connect(drive);drive.connect(gain);gain.connect(fxGain);osc.start(t);osc.stop(t+.57);osc.onended=()=>{osc.disconnect();drive.disconnect();gain.disconnect();};
 const tick=fx.createOscillator(),tg=fx.createGain();tick.type='triangle';tick.frequency.setValueAtTime(310,t);tick.frequency.exponentialRampToValueAtTime(85,t+.045);tg.gain.setValueAtTime(.07*p,t);tg.gain.exponentialRampToValueAtTime(.0001,t+.055);tick.connect(tg);tg.connect(fxGain);tick.start(t);tick.stop(t+.06);tick.onended=()=>{tick.disconnect();tg.disconnect();};
 document.dispatchEvent(new CustomEvent('0086:beat',{detail:{x,y,power:p,kind}}));return true;
}
function sampleEnergy(){
 if(!wanted||!fx||fx.state!=='running'||document.hidden)return 0;
 let bass=0;if(analyser&&spectrum){analyser.getByteFrequencyData(spectrum);const step=fx.sampleRate/analyser.fftSize;let n=0;for(let i=Math.max(1,Math.floor(40/step));i<=Math.ceil(180/step);i++){bass+=spectrum[i]/255;n++;}bass/=Math.max(1,n);}
 const hit=Math.exp(-(performance.now()-fxPeak)/160)*.5;
 return Math.min(1,Math.max(0,(bass-.15)*1.1)+hit);
}
document.addEventListener('pointermove',e=>{
 if(e.pointerType==='touch'||!wanted)return;
 const now=performance.now();if(lastPointer){const d=Math.hypot(e.clientX-lastPointer.x,e.clientY-lastPointer.y);const speed=d/Math.max(8,now-lastPointer.t)*1000;pathLength+=Math.min(140,d);if(pathLength>145&&speed>170)kick(Math.min(.88,.48+speed/2800),e.clientX,e.clientY,'sweep');}lastPointer={x:e.clientX,y:e.clientY,t:now};
},{passive:true});
document.addEventListener('pointerover',e=>{
 if(e.pointerType==='touch'||!wanted)return;const el=e.target.closest('.entry-link,.nav a,.year,.project summary,.return-home');if(!el||(e.relatedTarget&&el.contains(e.relatedTarget)))return;kick(.66,e.clientX,e.clientY,'hover');
},{passive:true});
document.addEventListener('click',e=>{if(e.target.closest('#site-music')||performance.now()-lastTouchEnd<650)return;if(wanted&&e.target.closest('.entry-link,.nav a,.year,.project summary')){prepareFX();kick(.96,e.clientX||innerWidth*.5,e.clientY||innerHeight*.5,'click');}},false);
window.addEventListener('blur',()=>{lastPointer=null;pathLength=0;});

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
reflect();resolveStation();
})();
