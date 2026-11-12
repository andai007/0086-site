/* 0086 preview — Radiooooo Live.
 * Official public live stream and now-playing JSON only.
 * No private catalogue API, account token, downloaded tracks or synthesis.
 * Keep in the review preview; confirm provider terms before production use.
 */
(() => {
  'use strict';
  if (window.__0086Music) return;
  const PROVIDER = 'https://stream.radiooooo.com/';
  const STREAM = new URL('stream', PROVIDER).href;
  const META = new URL('metadata.json', PROVIDER).href;
  const MUTED_KEY = '0086-sound-muted', BASE_VOLUME = 0.18;
  const audio = document.createElement('audio');
  audio.id = 'site-soundtrack'; audio.preload = 'none'; audio.crossOrigin = 'anonymous';
  audio.setAttribute('playsinline', ''); audio.volume = 0; document.body.append(audio);
  let wanted = false, optedOut = false, phase = 'off', attempt = 0;
  let retries = 0, retryTimer = 0, watchdog = 0, metaTimer = 0, fadeFrame = 0;
  let metaAbort = null, song = null, songAt = 0, lastTime = 0, lastProgress = 0;
  try { optedOut = localStorage.getItem(MUTED_KEY) === '1'; } catch (_) {}
  const css = document.createElement('style');
  css.textContent = `
    #site-music{position:fixed;z-index:9;right:24px;bottom:20px;left:auto;top:auto;display:flex;align-items:center;gap:12px;max-width:calc(100vw - 32px);font:400 10.56px/15.84px var(--mono,monospace)}
    #site-music a,#site-music button{color:#aaa;font:inherit;letter-spacing:.04em;text-decoration:none;white-space:nowrap}
    #site-music a:hover,#site-music button:hover,#site-music button[aria-pressed=true]{color:#fff}
    #site-music a:focus-visible,#site-music button:focus-visible{outline:1px solid #002fa7;outline-offset:4px}
    #sound-toggle{padding:6px 0;background:none;border:0;border-radius:0;cursor:pointer;min-height:28px}
    #site-music[data-state=error] #sound-toggle{color:#ff9999}
    body[data-view=inside] #site-music{top:13px;bottom:auto;right:126px}
    @media(max-width:560px){#site-music{right:16px;bottom:18px;gap:9px}body[data-view=inside] #site-music{right:110px;gap:7px}}
    @media(max-width:360px){body[data-view=inside] #site-music .radio-source{max-width:56px;overflow:hidden;text-overflow:ellipsis}}
  `;
  document.head.append(css);
  const root = document.createElement('div'); root.id = 'site-music';
  root.innerHTML = '<a class="radio-source" target="_blank" rel="noopener noreferrer" aria-label="Radiooooo Live">Radiooooo</a><button id="sound-toggle" type="button" aria-pressed="false">声音 关</button>';
  document.body.append(root);
  const button = root.querySelector('button'), source = root.querySelector('a'); source.href = PROVIDER;
  function isPlaying() { return wanted && phase === 'playing' && !audio.paused && audio.readyState >= 2; }
  function reflect() {
    const en = document.documentElement.lang === 'en';
    const labels = en ? {off:'SOUND OFF',connecting:'CONNECTING',playing:'SOUND ON',error:'RETRY',suspended:'SOUND OFF'} : {off:'声音 关',connecting:'连接中',playing:'声音 开',error:'重连',suspended:'声音 关'};
    root.dataset.state = phase; button.textContent = labels[phase] || labels.off;
    button.setAttribute('aria-pressed', String(isPlaying())); button.setAttribute('aria-busy', String(phase === 'connecting'));
    button.setAttribute('aria-label', en ? (phase === 'error' ? 'Reconnect Radiooooo Live' : wanted ? 'Turn off Radiooooo Live' : 'Turn on Radiooooo Live') : (phase === 'error' ? '重新连接 Radiooooo 电台' : wanted ? '关闭 Radiooooo 电台' : '开启 Radiooooo 电台'));
    const info = song && Date.now() - songAt < 60000 ? [song.artist,song.title,song.country,song.year].filter(Boolean).join(' · ') : '';
    source.title = info ? 'Radiooooo Live — ' + info : 'Radiooooo Live';
    button.title = phase === 'error' ? (en ? 'Stream unavailable. Click to retry or open Radiooooo.' : '电台暂时未连接，点击重试；也可打开 Radiooooo。') : source.title;
  }
  const videoActive = () => [...document.querySelectorAll('video')].some(v => !v.paused && !v.ended && !v.muted && v.volume > 0);
  function fade(to) {
    cancelAnimationFrame(fadeFrame); const from = audio.volume, start = performance.now();
    const step = now => { if (!wanted || document.hidden) return; const t = Math.min(1,(now-start)/1200); audio.volume = Math.max(0,Math.min(1,from+(to-from)*t)); if (t<1) fadeFrame=requestAnimationFrame(step); };
    fadeFrame=requestAnimationFrame(step);
  }
  function clearJobs() {
    clearTimeout(retryTimer); retryTimer=0; clearInterval(watchdog); watchdog=0; clearInterval(metaTimer); metaTimer=0; cancelAnimationFrame(fadeFrame);
    if(metaAbort){metaAbort.abort();metaAbort=null;}
  }
  function unload(){audio.pause();audio.removeAttribute('src');audio.load();audio.volume=0;}
  function stop(user=false){
    wanted=false;attempt++;clearJobs();unload();phase='off';retries=0;
    if(user){optedOut=true;try{localStorage.setItem(MUTED_KEY,'1')}catch(_){}}
    if('mediaSession' in navigator)navigator.mediaSession.playbackState='paused';reflect();
  }
  async function metadata(){
    if(!wanted||document.hidden||metaAbort)return;
    const controller=new AbortController();metaAbort=controller;const timeout=setTimeout(()=>controller.abort(),6000);
    try{
      const res=await fetch(META+'?t='+Date.now(),{signal:controller.signal,credentials:'omit',cache:'no-store'});
      if(!res.ok)throw new Error('Metadata HTTP '+res.status);const data=await res.json();
      if(!wanted||controller.signal.aborted||!data||typeof data!=='object')return;
      const safe=v=>typeof v==='string'||typeof v==='number'?String(v).slice(0,220):'';
      song={artist:safe(data.artist),title:safe(data.title),country:safe(data.country),year:safe(data.year)};songAt=Date.now();
      if(song.artist&&song.title.startsWith(song.artist+' - '))song.title=song.title.slice(song.artist.length+3);
      if('mediaSession' in navigator&&window.MediaMetadata)navigator.mediaSession.metadata=new MediaMetadata({title:song.title||'Radiooooo Live',artist:song.artist||'Radiooooo',album:'Radiooooo Live'});
      reflect();
    }catch(_){/* Missing metadata never interrupts live audio. */}
    finally{clearTimeout(timeout);if(metaAbort===controller)metaAbort=null;}
  }
  function failure(){
    if(!wanted||document.hidden||retryTimer)return;
    attempt++;clearJobs();unload();
    if(retries>=3){wanted=false;phase='error';reflect();return;}
    const delay=[1800,5000,12000][retries++];phase='connecting';reflect();
    retryTimer=setTimeout(()=>{retryTimer=0;if(wanted)connect();},delay);
  }
  function connect(){
    if(!wanted||document.hidden)return;
    clearJobs();const token=++attempt;phase='connecting';unload();lastProgress=performance.now();lastTime=0;
    audio.src=STREAM+'?t='+Date.now();reflect();
    // Call play in the user activation window; never await metadata first.
    const play=audio.play();
    if(play&&typeof play.catch==='function')play.catch(e=>{if(token!==attempt||!wanted)return;if(e.name==='NotAllowedError'){stop();return;}failure();});
    watchdog=setInterval(()=>{if(!wanted||document.hidden)return;if(audio.currentTime>lastTime+.01){lastTime=audio.currentTime;lastProgress=performance.now();}else if(performance.now()-lastProgress>16000)failure();},3000);
    metadata();metaTimer=setInterval(metadata,15000);
  }
  function start(user=false){
    if(document.hidden)return;
    if(user){optedOut=false;try{localStorage.setItem(MUTED_KEY,'0')}catch(_){}}
    if(isPlaying()||phase==='connecting')return;wanted=true;retries=0;connect();
  }
  audio.addEventListener('playing',()=>{if(!wanted){unload();return;}phase='playing';retries=0;lastProgress=performance.now();fade(videoActive()?BASE_VOLUME*.18:BASE_VOLUME);if('mediaSession' in navigator)navigator.mediaSession.playbackState='playing';reflect();});
  for(const name of ['error','ended'])audio.addEventListener(name,failure);
  audio.addEventListener('waiting',()=>{if(wanted){phase='connecting';reflect();}});
  audio.addEventListener('pause',()=>{if(wanted&&phase==='playing'){phase='suspended';reflect();}});
  button.addEventListener('click',()=>{if(wanted&&phase!=='error')stop(true);else start(true);});
  // Keep the approved first-entry gesture and remembered mute state; no autoplay on load.
  document.addEventListener('click',e=>{if(e.target.closest('.entry-link')&&!optedOut&&!wanted)start();},true);
  const duck=()=>{if(isPlaying())fade(videoActive()?BASE_VOLUME*.18:BASE_VOLUME);};
  for(const name of ['play','pause','ended','volumechange','emptied'])document.addEventListener(name,e=>{if(e.target.tagName==='VIDEO')duck();},true);
  window.addEventListener('hashchange',()=>{reflect();setTimeout(duck,80);});
  new MutationObserver(reflect).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  function suspend(){if(!wanted)return;attempt++;clearJobs();phase='suspended';unload();reflect();}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();else if(wanted){phase='off';connect();}});
  window.addEventListener('pagehide',suspend);window.addEventListener('pageshow',e=>{if(e.persisted&&wanted){phase='off';connect();}});
  window.addEventListener('offline',()=>{if(wanted){suspend();phase='error';reflect();}});
  window.addEventListener('online',()=>{if(wanted){phase='off';retries=0;connect();}});
  if('mediaSession' in navigator)for(const[name,handler]of[['play',()=>start(true)],['pause',()=>stop(true)],['stop',()=>stop(true)]]){try{navigator.mediaSession.setActionHandler(name,handler);}catch(_){}}
  window.__0086Music=Object.freeze({title:'Radiooooo Live',mode:'radiooooo-live',provider:PROVIDER,get playing(){return isPlaying();},get audioTime(){return audio.currentTime||0;},get status(){return phase;},get nowPlaying(){return song?{...song}:null;}});
  reflect();
})();
