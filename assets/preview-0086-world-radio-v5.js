/* 0086 preview — world-music radio, not synthesized audio.
 * Radiooooo's live mount returned 404 during integration checks.
 * Active source: FIP Monde (Radio France), explicitly labelled in the UI.
 * Public Radio Browser API resolves the station. Broadcaster-documented MP3
 * is the fallback if the directory is unavailable. No tracks are stored.
 */
(() => {
'use strict';
if(window.__0086Music)return;
const NAME='FIP Monde',HOME='https://www.radiofrance.fr/fip/radio-monde';
const DEFAULT='https://icecast.radiofrance.fr/fipworld-midfi.mp3?id=openapi';
const CACHE='0086-world-radio-v5',MUTE='0086-sound-muted',VOLUME=.18;
let stream=DEFAULT,catalogue='pending',stationId='',apiServer='';
const valid=s=>{try{const u=new URL(s);return u.protocol==='https:'&&u.hostname==='icecast.radiofrance.fr'&&/^\/fipworld[^/]*\.mp3$/i.test(u.pathname)?u.href:null;}catch(_){return null;}};
try{const saved=JSON.parse(localStorage.getItem(CACHE)||'null');if(saved&&Date.now()-saved.at<3600000&&Date.now()>=saved.at&&valid(saved.url)){stream=valid(saved.url);catalogue='cached';}}catch(_){}
async function json(url,ms=4500){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),ms);try{const r=await fetch(url,{signal:ctrl.signal,credentials:'omit'});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json();}finally{clearTimeout(timer);}}
async function resolveStation(){
let servers=['de1.api.radio-browser.info'];
try{const list=await json('https://all.api.radio-browser.info/json/servers');const found=Array.isArray(list)?list.map(x=>x.name).filter(s=>typeof s==='string'&&/^[a-z0-9-]+\.api\.radio-browser\.info$/.test(s)):[];if(found.length)servers=[...new Set(found)].sort(()=>Math.random()-.5).slice(0,2);}catch(_){}
for(const host of servers){try{const items=await json('https://'+host+'/json/stations/search?name=fip&hidebroken=true&limit=100');if(!Array.isArray(items))continue;const station=items.find(s=>valid(s.url_resolved||s.url));if(!station)continue;stream=valid(station.url_resolved||station.url);stationId=String(station.stationuuid||'');apiServer='https://'+host;catalogue='radio-browser';try{localStorage.setItem(CACHE,JSON.stringify({at:Date.now(),url:stream}));}catch(_){}return;}catch(_){}}
if(catalogue!=='cached')catalogue='broadcaster-direct';
}
const audio=document.createElement('audio');audio.id='site-soundtrack';audio.preload='none';audio.setAttribute('playsinline','');audio.volume=0;document.body.append(audio);
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
const root=document.createElement('div');root.id='site-music';root.innerHTML='<a class="radio-source" target="_blank" rel="noopener noreferrer">FIP MONDE</a><button id="sound-toggle" type="button" aria-pressed="false">声音 关</button>';document.body.append(root);
const button=root.querySelector('button'),source=root.querySelector('a');source.href=HOME;source.title='FIP Monde · Radio France · World music';
const playing=()=>wanted&&phase==='playing'&&!audio.paused&&audio.readyState>=2;
function reflect(){const en=document.documentElement.lang==='en';const labels=en?{off:'SOUND OFF',connecting:'CONNECTING',playing:'SOUND ON',error:'RETRY',suspended:'SOUND OFF'}:{off:'声音 关',connecting:'连接中',playing:'声音 开',error:'重连',suspended:'声音 关'};root.dataset.state=phase;button.textContent=labels[phase]||labels.off;button.setAttribute('aria-pressed',String(playing()));button.setAttribute('aria-busy',String(phase==='connecting'));button.setAttribute('aria-label',en?(wanted?'Mute FIP Monde':'Play FIP Monde world music'):(wanted?'关闭 FIP Monde 世界音乐':'开启 FIP Monde 世界音乐'));button.title=phase==='error'?(en?'Radio stream unavailable. Retry or open the station.':'电台暂时未连接，点击重试或打开原站。'):source.title;}
const videoActive=()=>[...document.querySelectorAll('video')].some(v=>!v.paused&&!v.ended&&!v.muted&&v.volume>0);
function fade(to){cancelAnimationFrame(fadeFrame);const from=audio.volume,start=performance.now();function step(now){if(!wanted||document.hidden)return;const t=Math.min(1,(now-start)/1200);audio.volume=Math.max(0,Math.min(1,from+(to-from)*t));if(t<1)fadeFrame=requestAnimationFrame(step);}fadeFrame=requestAnimationFrame(step);}
function clear(){clearTimeout(retryTimer);retryTimer=0;clearInterval(watchdog);watchdog=0;cancelAnimationFrame(fadeFrame);}
function unload(){audio.pause();audio.removeAttribute('src');audio.load();audio.volume=0;}
function stop(user=false){wanted=false;ticket++;clear();unload();phase='off';retries=0;if(user){optedOut=true;try{localStorage.setItem(MUTE,'1');}catch(_){}}if('mediaSession'in navigator)navigator.mediaSession.playbackState='paused';reflect();}
function failure(){if(!wanted||document.hidden||retryTimer)return;ticket++;clear();unload();if(retries>=2){wanted=false;phase='error';reflect();return;}const delay=[2000,6000][retries++];phase='connecting';reflect();retryTimer=setTimeout(()=>{retryTimer=0;if(wanted)connect();},delay);}
function connect(){if(!wanted||document.hidden)return;clear();const run=++ticket;phase='connecting';unload();lastProgress=performance.now();lastTime=0;audio.src=stream;reflect();const promise=audio.play();if(promise)promise.catch(e=>{if(run!==ticket||!wanted)return;if(e.name==='NotAllowedError'){stop();return;}failure();});watchdog=setInterval(()=>{if(!wanted||document.hidden)return;if(audio.currentTime>lastTime+.01){lastTime=audio.currentTime;lastProgress=performance.now();}else if(performance.now()-lastProgress>16000)failure();},3000);}
function start(user=false){if(document.hidden)return;if(user){optedOut=false;try{localStorage.setItem(MUTE,'0');}catch(_){}}if(playing()||phase==='connecting')return;wanted=true;retries=0;connect();if(apiServer&&stationId)fetch(apiServer+'/json/url/'+encodeURIComponent(stationId),{credentials:'omit',keepalive:true}).catch(()=>{});}
audio.addEventListener('playing',()=>{if(!wanted){unload();return;}phase='playing';retries=0;lastProgress=performance.now();fade(videoActive()?VOLUME*.18:VOLUME);if('mediaSession'in navigator){navigator.mediaSession.playbackState='playing';if(window.MediaMetadata)navigator.mediaSession.metadata=new MediaMetadata({title:NAME,artist:'Radio France',album:'World music · Live'});}reflect();});
for(const event of ['error','ended'])audio.addEventListener(event,failure);
audio.addEventListener('waiting',()=>{if(wanted){phase='connecting';reflect();}});
audio.addEventListener('pause',()=>{if(wanted&&phase==='playing'){phase='suspended';reflect();}});
button.onclick=()=>{if(wanted&&phase!=='error')stop(true);else start(true);};
document.addEventListener('click',e=>{if(e.target.closest('.entry-link')&&!optedOut&&!wanted)start();},true);
const duck=()=>{if(playing())fade(videoActive()?VOLUME*.18:VOLUME);};
for(const event of ['play','pause','ended','volumechange','emptied'])document.addEventListener(event,e=>{if(e.target.tagName==='VIDEO')duck();},true);
window.addEventListener('hashchange',()=>{reflect();setTimeout(duck,80);});new MutationObserver(reflect).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
function suspend(){if(!wanted)return;ticket++;clear();phase='suspended';unload();reflect();}
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();else if(wanted){phase='off';connect();}});
window.addEventListener('pagehide',suspend);window.addEventListener('pageshow',e=>{if(e.persisted&&wanted){phase='off';connect();}});
if('mediaSession'in navigator)for(const[name,handler]of[['play',()=>start(true)],['pause',()=>stop(true)],['stop',()=>stop(true)]]){try{navigator.mediaSession.setActionHandler(name,handler);}catch(_){}}
window.__0086Music=Object.freeze({title:NAME,mode:'world-radio',provider:HOME,get catalogue(){return catalogue;},get playing(){return playing();},get audioTime(){return audio.currentTime||0;},get status(){return phase;},get stream(){return audio.currentSrc||stream;}});
reflect();resolveStation();
})();
