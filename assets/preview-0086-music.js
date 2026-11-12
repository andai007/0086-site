/* 0086 — original instrumental “After the Rain”.
   Newly composed note sequences; no recordings, samples, lyrics or melody copied
   from the reference song. Locally synthesized piano, plucks and warm bass.
   No Apple account, third-party player or music network request is required. */
(() => {
  'use strict';
  if (window.__0086Music) return;
  const BPM = 76, BEAT = 60 / BPM, BARS = 32, LENGTH = BARS * 4 * BEAT;
  // One bar per row. MIDI pitches and durations measured in quarter-note beats.
  const MELODY = [
    [[0,.5],[76,.5],[73,1],[71,.5],[69,.5],[73,1]],
    [[71,1],[68,.5],[71,.5],[76,1.5],[0,.5]],
    [[73,.75],[76,.25],[78,1],[76,.5],[73,.5],[69,1]],
    [[68,1.5],[71,.5],[73,1],[68,.5],[0,.5]],
    [[66,.5],[69,.5],[74,1],[73,.5],[71,.5],[69,1]],
    [[76,1],[73,.5],[71,.5],[69,1],[0,1]],
    [[66,.75],[69,.25],[71,1],[74,1],[73,.5],[71,.5]],
    [[68,1],[69,.5],[71,.5],[76,1],[0,1]],
    [[76,.5],[78,.5],[80,1],[76,.5],[73,.5],[71,1]],
    [[71,.5],[73,.5],[76,1],[75,.5],[71,.5],[68,1]],
    [[69,.5],[73,.5],[78,1],[76,.75],[73,.25],[69,1]],
    [[71,1],[68,.5],[73,.5],[76,1.5],[0,.5]],
    [[78,.5],[76,.5],[74,1],[73,.5],[71,.5],[69,1]],
    [[73,1],[76,.5],[73,.5],[69,1],[0,1]],
    [[71,.75],[74,.25],[73,1],[71,.5],[69,.5],[68,1]],
    [[71,1],[69,2],[0,1]]
  ];
  const HARMONY = [
    [45,[61,64,68,71]],[44,[59,64,68,71]],
    [42,[57,61,64,68]],[49,[59,61,64,68]],
    [50,[57,61,66,69]],[49,[57,61,64,69]],
    [47,[57,62,66,69]],[40,[57,59,64,68]],
    [45,[61,64,68,71]],[44,[59,64,68,71]],
    [42,[57,61,64,68]],[49,[59,61,64,68]],
    [50,[57,61,66,69]],[49,[57,61,64,69]],
    [47,[57,62,66,69]],[45,[57,61,64,71]]
  ];
  const events = [];
  const add = (time,pitch,duration,level,kind,pan=0) => events.push({time,pitch,duration,level,kind,pan});
  for (let bar=0;bar<BARS;bar++) {
    const [bass,chord]=HARMONY[bar%16], start=bar*4*BEAT;
    add(start,bass,3.8*BEAT,.20,'bass',0);
    add(start+2*BEAT,bass+12,1.65*BEAT,.09,'bass',0);
    // Sparse broken-chord accompaniment, with a little human timing and dynamics.
    [0,2,1,3,0,2,1,3].forEach((v,i)=>{
      add(start+i*.5*BEAT+(i%2? .011:0),chord[v],1.7*BEAT,
          (i===0?.105:.066)*(bar<16?1:.92),'pluck',i%2?.34:-.34);
    });
    if (bar%2===0) chord.slice(0,3).forEach((pitch,i)=>add(start+.025*i,pitch,7.7*BEAT,.026,'pad',i*.28-.28));
    let beat=0;
    MELODY[bar%16].forEach(([pitch,dur],i)=>{
      if(pitch) add(start+beat*BEAT+.014,pitch,dur*BEAT*.91,
         (bar<16?.18:.16)*(i%3===0?1:.87),'piano',-.06);
      // An understated octave response only in the final section, not a doubled lead.
      if(bar>=24&&pitch&&dur>=1.5) add(start+(beat+.5)*BEAT,pitch-12,dur*BEAT*.7,.035,'piano',.30);
      beat+=dur;
    });
  }
  events.sort((a,b)=>a.time-b.time);
  let audio=null, graph=null, timer=null, cursor=0, cycle=0, epoch=0, desired=false;
  let optOut=false, busy=false;
  try{optOut=localStorage.getItem('0086-sound-muted')==='1'}catch{}
  const cache=new WeakMap();
  function bufferFor(ctx,pitch,kind) {
    let bank=cache.get(ctx);if(!bank){bank=new Map();cache.set(ctx,bank)}
    const key=kind+pitch;if(bank.has(key))return bank.get(key);
    const sr=ctx.sampleRate, length=kind==='pad'?8:kind==='bass'?4.5:3.2;
    const b=ctx.createBuffer(1,Math.ceil(sr*length),sr), out=b.getChannelData(0);
    const hz=440*Math.pow(2,(pitch-69)/12), tau=Math.PI*2;
    for(let i=0;i<out.length;i++) {
      const t=i/sr,attack=1-Math.exp(-t/(kind==='pad'?.38:.008));
      let y=0;
      if(kind==='bass') y=(Math.sin(tau*hz*t)+.17*Math.sin(tau*hz*2*t))*Math.exp(-t/1.8);
      else if(kind==='pad') y=(Math.sin(tau*hz*t)+.33*Math.sin(tau*hz*.9992*t)+.14*Math.sin(tau*hz*2*t))*Math.exp(-t/8)*.58;
      else if(kind==='pluck') {
        for(let h=1;h<=6;h++) y+=Math.sin(tau*hz*h*t+Math.sin(tau*hz*t)*.018)*Math.pow(.43,h-1)*Math.exp(-t*(1.3+h*.7));
      }else{
        for(let h=1;h<=5;h++) {
          const amp=[1,.28,.105,.04,.016][h-1],decay=[1.8,.85,.45,.25,.15][h-1];
          y+=amp*(Math.sin(tau*hz*h*t)+.27*Math.sin(tau*hz*h*1.0017*t))*Math.exp(-t/decay);
        }
        y*=.67;
      }
      out[i]=y*attack*Math.min(1,(length-t)/.12);
    }
    bank.set(key,b);return b;
  }
  function makeGraph(ctx,destination,volume) {
    const input=ctx.createGain(),filter=ctx.createBiquadFilter(),master=ctx.createGain(),comp=ctx.createDynamicsCompressor();
    filter.type='lowpass';filter.frequency.value=6700;filter.Q.value=.2;
    comp.threshold.value=-17;comp.knee.value=20;comp.ratio.value=2.5;comp.attack.value=.02;comp.release.value=.25;
    input.connect(filter);filter.connect(comp);comp.connect(master);master.connect(destination);master.gain.value=volume;
    // Quiet stereo delays create an airy room, without external impulse-response samples.
    for(const [seconds,level,pan] of [[.237,.13,-.6],[.379,.09,.6],[.619,.045,-.25]]){
      const d=ctx.createDelay(1),g=ctx.createGain(),p=ctx.createStereoPanner();d.delayTime.value=seconds;g.gain.value=level;p.pan.value=pan;
      input.connect(d);d.connect(g);g.connect(p);p.connect(filter);
    }
    return {input,master};
  }
  function note(ctx,g,e,when) {
    const src=ctx.createBufferSource(),gain=ctx.createGain(),pan=ctx.createStereoPanner();
    src.buffer=bufferFor(ctx,e.pitch,e.kind);pan.pan.value=e.pan;
    const duration=Math.min(e.duration,src.buffer.duration-.08),end=when+duration;
    const release=e.kind==='pad'?.65:.22;
    gain.gain.setValueAtTime(e.level,when);gain.gain.setValueAtTime(e.level,Math.max(when,end-.06));
    gain.gain.exponentialRampToValueAtTime(.0001,end+release);
    src.connect(gain);gain.connect(pan);pan.connect(g.input);src.start(when);src.stop(end+release+.03);
    src.onended=()=>{src.disconnect();gain.disconnect();pan.disconnect()};
  }
  function schedule() {
    if(!audio||audio.state!=='running')return;
    const horizon=audio.currentTime+.8;
    while(epoch+cycle*LENGTH+events[cursor].time<horizon){
      const e=events[cursor],when=epoch+cycle*LENGTH+e.time;
      if(when>=audio.currentTime-.03)note(audio,graph,e,Math.max(when,audio.currentTime+.005));
      if(++cursor===events.length){cursor=0;cycle++}
    }
  }
  const videoActive=()=>[...document.querySelectorAll('video')].some(v=>!v.paused&&!v.ended&&!v.muted);
  function fade(level) {
    if(!audio||!graph)return;const now=audio.currentTime;
    graph.master.gain.cancelScheduledValues(now);graph.master.gain.setTargetAtTime(level,now,.65);
  }
  function reflect() {
    const on=Boolean(desired&&audio?.state==='running'),en=document.documentElement.lang==='en';
    const el=document.getElementById('sound-toggle');if(!el)return;
    el.textContent=en?(on?'SOUND ON':'SOUND OFF'):(on?'声音 开':'声音 关');
    el.setAttribute('aria-pressed',String(on));el.setAttribute('aria-label',en?(on?'Mute music':'Enable original music'):(on?'关闭背景音乐':'开启原创背景音乐'));
  }
  async function start() {
    if(busy||document.hidden)return;busy=true;
    try {
      const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
      if(!audio){audio=new AC();graph=makeGraph(audio,audio.destination,0);epoch=audio.currentTime+.10;audio.onstatechange=reflect;}
      desired=true;await audio.resume();if(!desired)return;
      if(timer===null)timer=setInterval(schedule,120);
      schedule();fade(videoActive()?.14:.52);reflect();
    }catch(e){desired=false;console.warn('Music not started:',e.name);reflect()}
    finally{busy=false}
  }
  function mute() {desired=false;optOut=true;try{localStorage.setItem('0086-sound-muted','1')}catch{}if(audio)audio.suspend().catch(()=>{});reflect()}
  function toggle(){if(desired){mute();return}optOut=false;try{localStorage.setItem('0086-sound-muted','0')}catch{}start()}
  const css=document.createElement('style');css.textContent=`
  #site-music{position:fixed;z-index:9;right:24px;bottom:20px;left:auto;top:auto;font:400 10.56px/15.84px var(--mono,monospace)}
  #sound-toggle{padding:6px 0;color:#aaa;font:inherit;letter-spacing:.08em;background:none;border:0;cursor:pointer}
  #sound-toggle:hover,#sound-toggle[aria-pressed=true]{color:#fff}#sound-toggle:focus-visible{outline:1px solid #002fa7;outline-offset:4px}
  body[data-view=inside] #site-music{top:13px;bottom:auto;right:126px}
  @media(max-width:560px){#site-music{right:16px;bottom:18px}body[data-view=inside] #site-music{right:116px}}
  `;document.head.append(css);
  const root=document.createElement('div');root.id='site-music';root.innerHTML='<button id="sound-toggle" type="button" aria-pressed="false">声音 关</button>';document.body.append(root);
  document.getElementById('sound-toggle').addEventListener('click',toggle);
  // A real entrance click unlocks audio, never a timer or simulated click.
  document.addEventListener('click',e=>{if(e.target.closest('.entry-link')&&!optOut&&!desired)start()},true);
  for(const event of ['play','pause','ended','volumechange','emptied'])document.addEventListener(event,e=>{if(e.target.tagName==='VIDEO'&&desired)fade(videoActive()?.14:.52)},true);
  window.addEventListener('hashchange',()=>{reflect();setTimeout(()=>{if(desired)fade(videoActive()?.14:.52)},80)});
  document.querySelectorAll('[data-language]').forEach(b=>b.addEventListener('click',reflect));
  document.addEventListener('visibilitychange',()=>{if(!audio)return;if(document.hidden){audio.suspend().catch(()=>{})}else if(desired)start()});
  window.addEventListener('pagehide',()=>{if(timer!==null){clearInterval(timer);timer=null}if(audio)audio.suspend().catch(()=>{})});
  window.addEventListener('pageshow',e=>{if(e.persisted&&desired)start()});
  window.__0086Music=Object.freeze({title:'After the Rain',mode:'original-synthesis',duration:LENGTH,get playing(){return Boolean(desired&&audio?.state==='running')},get audioTime(){return audio?.currentTime||0},
    async render(){const sr=44100,ctx=new OfflineAudioContext(2,Math.ceil((LENGTH+3)*sr),sr),g=makeGraph(ctx,ctx.destination,.8);for(const e of events)note(ctx,g,e,e.time);g.master.gain.setValueAtTime(0,0);g.master.gain.linearRampToValueAtTime(.8,2);g.master.gain.setValueAtTime(.8,LENGTH-3);g.master.gain.linearRampToValueAtTime(0,LENGTH+2);return ctx.startRendering()}
  });
  reflect();
})();
