/* 0086 preview — FIP Electro with an original WebAudio fallback.
 * The live stream gets the first eight seconds after a user gesture. If it
 * cannot start or later breaks, a local 122 BPM techno/house loop takes over.
 * No broadcaster audio is downloaded or stored.
 */
(() => {
'use strict';
if(window.__0086Music)return;
const FIP_NAME='FIP Electro',SYNTH_NAME='0086 Electro',HOME='https://www.radiofrance.fr/fip/radio-electro',BPM=122;
const DEFAULT='https://icecast.radiofrance.fr/fipelectro-midfi.mp3?id=openapi';
const CACHE='0086-electro-radio-v6',MUTE='0086-sound-muted',VOLUME=.18;
let stream=DEFAULT,catalogue='pending',stationId='',apiServer='',sourceMode='fip';
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
let wanted=false,optedOut=false,phase='off',ticket=0,connectTimer=0,stallTimer=0,watchdog=0,fadeFrame=0,lastTime=0,lastProgress=0,radioStarted=false,radioActive=false;
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
const button=root.querySelector('button'),source=root.querySelector('a');
const playing=()=>wanted&&phase==='playing'&&(sourceMode==='synth'?(!!synthTimer&&fx?.state==='running'):(!audio.paused&&audio.readyState>=2));
function reflect(){
 const en=document.documentElement.lang==='en',synth=sourceMode==='synth',current=synth?SYNTH_NAME:FIP_NAME;
 const labels=en?{off:'SOUND OFF',connecting:'CONNECTING',playing:'SOUND ON',error:'RETRY',suspended:'SOUND OFF'}:{off:'声音 关',connecting:'连接中',playing:'声音 开',error:'重连',suspended:'声音 关'};
 source.textContent=synth?'0086 ELECTRO':'FIP ELECTRO';source.title=synth?'0086 WebAudio · 122 BPM · Original loop':'FIP Electro · Radio France · Electronic music';
 if(synth){source.removeAttribute('href');source.removeAttribute('target');source.removeAttribute('rel');}else{source.href=HOME;source.target='_blank';source.rel='noopener noreferrer';}
 root.dataset.state=phase;root.dataset.source=sourceMode;button.textContent=labels[phase]||labels.off;button.setAttribute('aria-pressed',String(playing()));button.setAttribute('aria-busy',String(phase==='connecting'));
 button.setAttribute('aria-label',en?(wanted?'Mute '+current:'Play '+current+' electronic music'):(wanted?'关闭 '+current+' 电子乐':'开启 '+current+' 电子乐'));
 button.title=phase==='error'?(en?'Audio is unavailable. Tap to retry FIP Electro.':'音频暂时不可用，点击重试 FIP Electro。'):source.title;
}
const videoActive=()=>[...document.querySelectorAll('video')].some(v=>!v.paused&&!v.ended&&!v.muted&&v.volume>0);
function fade(to){cancelAnimationFrame(fadeFrame);const from=audio.volume,start=performance.now();function step(now){if(!wanted||document.hidden)return;const t=Math.min(1,(now-start)/1200);audio.volume=Math.max(0,Math.min(1,from+(to-from)*t));if(t<1)fadeFrame=requestAnimationFrame(step);}fadeFrame=requestAnimationFrame(step);}
function clearRadioTimers(){clearTimeout(connectTimer);connectTimer=0;clearTimeout(stallTimer);stallTimer=0;clearInterval(watchdog);watchdog=0;cancelAnimationFrame(fadeFrame);}
function unload(){radioActive=false;audio.pause();audio.removeAttribute('src');audio.load();audio.volume=0;}
function stop(user=false){wanted=false;ticket++;clearRadioTimers();stopSynth();unload();phase='off';sourceMode='fip';if(user){optedOut=true;try{localStorage.setItem(MUTE,'1');}catch(_){}}if(fx)fx.suspend().catch(()=>{});if('mediaSession'in navigator)navigator.mediaSession.playbackState='paused';reflect();}
function fallbackToSynth(reason){
 if(!wanted||document.hidden||sourceMode==='synth')return;
 const run=++ticket;clearRadioTimers();sourceMode='synth';unload();catalogue='synth-fallback';phase='connecting';reflect();
 prepareFX().then(ok=>{if(run!==ticket||!wanted||document.hidden||sourceMode!=='synth')return;if(ok)startSynth(reason);else{phase='error';reflect();}});
}
function connect(){
 if(!wanted||document.hidden)return;
 clearRadioTimers();stopSynth();const run=++ticket;sourceMode='fip';phase='connecting';radioStarted=false;unload();lastProgress=performance.now();lastTime=0;audio.src=stream;reflect();
 connectTimer=setTimeout(()=>{if(run===ticket)fallbackToSynth('connect-timeout');},8000);
 const promise=audio.play();if(promise)promise.catch(e=>{if(run!==ticket||!wanted)return;if(e.name==='NotAllowedError'){stop();return;}fallbackToSynth('play-error');});
 watchdog=setInterval(()=>{if(run!==ticket||!wanted||document.hidden||sourceMode!=='fip')return;if(audio.currentTime>lastTime+.01){lastTime=audio.currentTime;lastProgress=performance.now();}else if(radioStarted&&performance.now()-lastProgress>4000)fallbackToSynth('stream-stalled');},1000);
}
function start(user=false){if(document.hidden)return;if(user){optedOut=false;try{localStorage.setItem(MUTE,'0');}catch(_){}}if(playing()||phase==='connecting')return;wanted=true;sourceMode='fip';prepareFX();connect();if(apiServer&&stationId)fetch(apiServer+'/json/url/'+encodeURIComponent(stationId),{credentials:'omit',keepalive:true}).catch(()=>{});}
audio.addEventListener('playing',()=>{if(!wanted||sourceMode!=='fip'){unload();return;}clearTimeout(connectTimer);connectTimer=0;clearTimeout(stallTimer);stallTimer=0;phase='playing';radioStarted=true;radioActive=true;lastProgress=performance.now();fade(videoActive()?VOLUME*.18:VOLUME);if('mediaSession'in navigator){navigator.mediaSession.playbackState='playing';if(window.MediaMetadata)navigator.mediaSession.metadata=new MediaMetadata({title:FIP_NAME,artist:'Radio France',album:'Electronic music · Live'});}reflect();});
for(const event of ['error','ended'])audio.addEventListener(event,()=>fallbackToSynth('stream-'+event));
for(const event of ['waiting','stalled'])audio.addEventListener(event,()=>{if(!wanted||sourceMode!=='fip')return;phase='connecting';reflect();if(radioStarted&&!stallTimer)stallTimer=setTimeout(()=>fallbackToSynth('stream-interrupted'),4000);});
audio.addEventListener('pause',()=>{if(wanted&&sourceMode==='fip'&&radioActive)fallbackToSynth('stream-paused');});
button.onclick=()=>{if(wanted&&phase!=='error')stop(true);else start(true);};
document.addEventListener('click',e=>{if(e.target.closest('.entry-link')&&!optedOut&&!wanted)start();},true);
const duck=()=>{if(!playing())return;if(sourceMode==='synth')setSynthLevel();else fade(videoActive()?VOLUME*.18:VOLUME);};
for(const event of ['play','pause','ended','volumechange','emptied'])document.addEventListener(event,e=>{if(e.target.tagName==='VIDEO')duck();},true);
window.addEventListener('hashchange',()=>{reflect();setTimeout(duck,80);});new MutationObserver(reflect).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
function suspend(){if(!wanted)return;ticket++;clearRadioTimers();stopSynth();phase='suspended';unload();if(fx)fx.suspend().catch(()=>{});reflect();}
function resume(){if(!wanted||document.hidden)return;phase='connecting';reflect();prepareFX().then(ok=>{if(!ok||!wanted||document.hidden)return;if(sourceMode==='synth')startSynth('resume');else connect();});}
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();else resume();});
window.addEventListener('pagehide',suspend);window.addEventListener('pageshow',e=>{if(e.persisted)resume();});
if('mediaSession'in navigator)for(const[name,handler]of[['play',()=>start(true)],['pause',()=>stop(true)],['stop',()=>stop(true)]]){try{navigator.mediaSession.setActionHandler(name,handler);}catch(_){}}
window.__0086Music=Object.freeze({get title(){return sourceMode==='synth'?SYNTH_NAME:FIP_NAME;},get mode(){return sourceMode==='synth'?'electro-synth':'electro-radio';},provider:HOME,get source(){return sourceMode;},get catalogue(){return catalogue;},get playing(){return playing();},get audioTime(){return sourceMode==='synth'?(fx?.currentTime||0):(audio.currentTime||0);},get status(){return phase;},get stream(){return sourceMode==='synth'?'webaudio:0086-electro':(audio.currentSrc||stream);},sampleEnergy,get beats(){return beatCount;},get bpm(){return sourceMode==='synth'?BPM:null;},get contextState(){return fx?.state||'uninitialized';},get analysisConnected(){return radioConnected;}});
let fx=null,fxGain=null,synthBus=null,noiseBuffer=null,analyser=null,spectrum=null,beatCount=0,lastBeat=-1000,pathLength=0,lastPointer=null;
let radioConnected=false,fxPeak=0,synthKickAt=-1000,synthTimer=0,synthStep=0,synthBar=0,nextStepTime=0;
function prepareFX(){
 const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return Promise.resolve(false);
 if(!fx){
  fx=new AC();const compressor=fx.createDynamicsCompressor();compressor.threshold.value=-14;compressor.knee.value=12;compressor.ratio.value=7;compressor.attack.value=.003;compressor.release.value=.14;
  fxGain=fx.createGain();fxGain.gain.value=.58;fxGain.connect(compressor);compressor.connect(fx.destination);
  synthBus=fx.createGain();synthBus.gain.value=0;synthBus.connect(fxGain);
  noiseBuffer=fx.createBuffer(1,Math.ceil(fx.sampleRate*.35),fx.sampleRate);const noise=noiseBuffer.getChannelData(0);for(let i=0;i<noise.length;i++)noise[i]=Math.random()*2-1;
  try{const radio=fx.createMediaElementSource(audio);analyser=fx.createAnalyser();analyser.fftSize=1024;analyser.smoothingTimeConstant=.76;spectrum=new Uint8Array(analyser.frequencyBinCount);radio.connect(analyser);analyser.connect(fx.destination);radioConnected=true;}catch(e){console.warn('Audio analysis unavailable:',e.name);}
 }
 return fx.resume().then(()=>fx.state==='running').catch(()=>false);
}
function setSynthLevel(){
 if(!fx||!synthBus)return;const now=fx.currentTime,target=videoActive()?.09:.52;
 synthBus.gain.cancelScheduledValues(now);synthBus.gain.setTargetAtTime(target,now,.08);
}
function stopSynth(){
 clearInterval(synthTimer);synthTimer=0;
 if(fx&&synthBus){const now=fx.currentTime;synthBus.gain.cancelScheduledValues(now);synthBus.gain.setTargetAtTime(0,now,.025);}
}
function synthKick(when){
 const osc=fx.createOscillator(),gain=fx.createGain(),click=fx.createOscillator(),clickGain=fx.createGain();
 osc.type='sine';osc.frequency.setValueAtTime(155,when);osc.frequency.exponentialRampToValueAtTime(46,when+.09);osc.frequency.exponentialRampToValueAtTime(38,when+.42);
 gain.gain.setValueAtTime(.0001,when);gain.gain.exponentialRampToValueAtTime(.72,when+.004);gain.gain.exponentialRampToValueAtTime(.15,when+.1);gain.gain.exponentialRampToValueAtTime(.0001,when+.52);
 click.type='triangle';click.frequency.setValueAtTime(290,when);click.frequency.exponentialRampToValueAtTime(75,when+.035);clickGain.gain.setValueAtTime(.13,when);clickGain.gain.exponentialRampToValueAtTime(.0001,when+.045);
 osc.connect(gain);click.connect(clickGain);gain.connect(synthBus);clickGain.connect(synthBus);osc.start(when);click.start(when);osc.stop(when+.54);click.stop(when+.05);
 osc.onended=()=>{osc.disconnect();gain.disconnect();};click.onended=()=>{click.disconnect();clickGain.disconnect();};
 synthKickAt=when;beatCount++;
 const delay=Math.max(0,(when-fx.currentTime)*1000);setTimeout(()=>{if(wanted&&sourceMode==='synth'&&phase==='playing')document.dispatchEvent(new CustomEvent('0086:beat',{detail:{x:innerWidth*.5,y:innerHeight*.52,power:.62,kind:'synth'}}));},delay);
}
function synthBass(when,frequency,duration){
 const osc=fx.createOscillator(),sub=fx.createOscillator(),filter=fx.createBiquadFilter(),gain=fx.createGain();
 osc.type='sawtooth';sub.type='sine';osc.frequency.setValueAtTime(frequency,when);sub.frequency.setValueAtTime(frequency*.5,when);
 filter.type='lowpass';filter.Q.value=5;filter.frequency.setValueAtTime(185,when);filter.frequency.exponentialRampToValueAtTime(70,when+duration);
 gain.gain.setValueAtTime(.0001,when);gain.gain.exponentialRampToValueAtTime(.16,when+.012);gain.gain.exponentialRampToValueAtTime(.055,when+duration*.55);gain.gain.exponentialRampToValueAtTime(.0001,when+duration);
 osc.connect(filter);sub.connect(gain);filter.connect(gain);gain.connect(synthBus);osc.start(when);sub.start(when);osc.stop(when+duration+.02);sub.stop(when+duration+.02);
 osc.onended=()=>{osc.disconnect();sub.disconnect();filter.disconnect();gain.disconnect();};
}
function synthHat(when,open=false){
 const sourceNode=fx.createBufferSource(),filter=fx.createBiquadFilter(),gain=fx.createGain(),duration=open?.16:.045;
 sourceNode.buffer=noiseBuffer;filter.type='highpass';filter.frequency.value=open?6100:7600;gain.gain.setValueAtTime(open?.045:.027,when);gain.gain.exponentialRampToValueAtTime(.0001,when+duration);
 sourceNode.connect(filter);filter.connect(gain);gain.connect(synthBus);sourceNode.start(when);sourceNode.stop(when+duration+.01);sourceNode.onended=()=>{sourceNode.disconnect();filter.disconnect();gain.disconnect();};
}
function synthPad(when,frequencies,duration){
 const filter=fx.createBiquadFilter(),gain=fx.createGain();filter.type='lowpass';filter.Q.value=.7;filter.frequency.setValueAtTime(520,when);filter.frequency.linearRampToValueAtTime(1050,when+duration*.55);filter.frequency.linearRampToValueAtTime(420,when+duration);
 gain.gain.setValueAtTime(.0001,when);gain.gain.exponentialRampToValueAtTime(.038,when+.32);gain.gain.setValueAtTime(.038,when+Math.max(.34,duration-.38));gain.gain.exponentialRampToValueAtTime(.0001,when+duration);
 filter.connect(gain);gain.connect(synthBus);
 const oscs=frequencies.map((frequency,index)=>{const osc=fx.createOscillator();osc.type=index===0?'triangle':'sawtooth';osc.detune.value=(index-1)*5;osc.frequency.value=frequency;osc.connect(filter);osc.start(when);osc.stop(when+duration+.03);return osc;});
 oscs[0].onended=()=>{for(const osc of oscs)osc.disconnect();filter.disconnect();gain.disconnect();};
}
function scheduleSynthStep(step,when){
 const stepLength=60/BPM/4,bass={0:55,3:55,6:65.41,8:49,10:55,14:73.42};
 if(step%4===0)synthKick(when);
 if(step%2===1)synthHat(when,false);if(step===2||step===6||step===10||step===14)synthHat(when,step===6||step===14);
 if(bass[step])synthBass(when,bass[step],stepLength*(step===3||step===14?1.8:1.3));
 if(step===0){const chords=[[110,130.81,164.81],[87.31,110,130.81],[98,123.47,146.83],[82.41,110,130.81]];synthPad(when,chords[synthBar%chords.length],stepLength*15.7);synthBar++;}
}
function pumpSynth(){
 if(!wanted||document.hidden||sourceMode!=='synth'||!fx||fx.state!=='running')return;
 const stepLength=60/BPM/4;while(nextStepTime<fx.currentTime+.18){scheduleSynthStep(synthStep,nextStepTime);nextStepTime+=stepLength;synthStep=(synthStep+1)%16;}
}
function startSynth(reason){
 if(!wanted||document.hidden||!fx||fx.state!=='running')return;
 stopSynth();unload();sourceMode='synth';catalogue='synth-fallback';phase='playing';synthStep=0;synthBar=0;nextStepTime=fx.currentTime+.055;setSynthLevel();pumpSynth();synthTimer=setInterval(pumpSynth,50);
 if('mediaSession'in navigator){navigator.mediaSession.playbackState='playing';if(window.MediaMetadata)navigator.mediaSession.metadata=new MediaMetadata({title:SYNTH_NAME,artist:'0086 Studios',album:'Original WebAudio · '+BPM+' BPM'});}
 reflect();
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
 const hit=Math.exp(-(performance.now()-fxPeak)/160)*.5,synthAge=fx.currentTime-synthKickAt,synthHit=sourceMode==='synth'&&synthAge>=0?Math.exp(-synthAge/.16)*.62:0;
 return Math.min(1,Math.max(0,(bass-.15)*1.1)+Math.max(hit,synthHit));
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
