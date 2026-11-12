/* 0086 Studios — persistent, opt-in soundtrack.
 * Default: official Apple Music player (not a full-track audio download).
 * For licensed website audio set SITE_CONFIG.music.src before this script loads.
 * Audio files, lyrics and Apple Music previews are not bundled or re-hosted.
 */
(() => {
  'use strict';
  if (document.getElementById('site-music')) return;
  const side = document.querySelector('.side');
  if (!side) return;
  const settings = {
    title: '心太软', artist: '任贤齐', src: '', volume: 0.22,
    officialUrl: 'https://music.apple.com/cn/album/%E5%BF%83%E5%A4%AA%E8%BD%AF/160857029?i=160857031',
    embedUrl: 'https://embed.music.apple.com/cn/album/%E5%BF%83%E5%A4%AA%E8%BD%AF/160857029?i=160857031&theme=dark',
    ...(window.SITE_CONFIG?.music || {})
  };
  const validURL = (value, protocols = ['https:', 'http:', 'file:', 'blob:']) => {
    try { const u = new URL(value, document.baseURI); return protocols.includes(u.protocol) ? u.href : ''; }
    catch { return ''; }
  };
  const nativeSrc = settings.src ? validURL(settings.src) : '';
  const officialURL = validURL(settings.officialUrl, ['https:']);
  const embedURL = validURL(settings.embedUrl, ['https:']);
  const baseVolume = Number.isFinite(Number(settings.volume)) ? Math.max(0, Math.min(1, Number(settings.volume))) : 0.22;
  const style = document.createElement('style');
  style.textContent = `
  #site-music{position:fixed;z-index:6;left:calc(2.1vw + 3px);bottom:calc(9.2vh + 84px);font:11px/1.5 var(--mono,monospace);color:var(--dim,#b0adbf)}
  #site-music button{border-radius:0;font:inherit;color:inherit;cursor:pointer}
  #site-music .music-toggle{display:flex;align-items:center;gap:12px;padding:8px 0;border:0;background:transparent;letter-spacing:.05em;min-height:36px}
  #site-music .music-toggle:hover,#site-music .music-toggle[aria-expanded=true],#site-music[data-playing=true] .music-toggle{color:var(--lime,#d4ff00)}
  #site-music .music-mark{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:1px solid var(--line,rgba(188,186,216,.23));font-size:14px}
  #site-music .music-panel{position:absolute;bottom:calc(100% + 9px);left:0;width:330px;max-width:calc(100vw - 32px);border:1px solid var(--line,rgba(188,186,216,.23));background:rgba(15,15,28,.98);box-shadow:0 12px 45px rgba(0,0,0,.3)}
  #site-music .music-top{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;gap:16px;border-bottom:1px solid var(--line,rgba(188,186,216,.23));color:var(--text,#f2f0f6)}
  #site-music .music-close{border:0;background:transparent;padding:2px 8px;font-size:20px;line-height:1;min-width:32px;min-height:32px}
  #site-music iframe{display:block;border:0;width:100%;height:175px;max-width:100%;background:#11111a}
  #site-music .music-note{display:block;font-size:10px;color:var(--dim,#b0adbf);padding:10px 12px;margin:0;border-top:1px solid var(--line,rgba(188,186,216,.23))}
  #site-music .music-note a{color:inherit;text-decoration:underline;text-underline-offset:3px}
  #site-music .music-error{margin:0;padding:8px 0;color:var(--pink,#ff979b);font-size:10px;max-width:300px}
  #site-music [hidden]{display:none!important}
  #site-music button:focus-visible{outline:2px solid var(--lime,#d4ff00);outline-offset:4px}
  @media(max-width:1000px){#site-music{left:23px;bottom:120px}}
  @media(min-width:1650px){#site-music{left:max(calc(2.1vw + 3px),calc((100vw - 1920px)/2 + 2.1vw + 3px))}}
  @media(max-height:790px) and (min-width:721px){#site-music{bottom:12px}}
  @media(max-width:720px){#site-music{left:auto;right:26px;bottom:auto;top:calc(max(12px,env(safe-area-inset-top)) + 50px)}#site-music .music-toggle{padding:2px 0;min-height:26px;font-size:10px;gap:7px}#site-music .music-mark{width:20px;height:20px;font-size:12px}#site-music .music-panel{top:calc(100% + 10px);bottom:auto;left:auto;right:0}#site-music .music-error{position:absolute;right:0;width:220px;padding:10px;background:#11111a}.side .nav{padding-top:28px}}
  `;
  document.head.append(style);
  const root = document.createElement('div'); root.id = 'site-music'; root.dataset.playing = 'false';
  root.innerHTML = '<button type="button" class="music-toggle" aria-controls="music-panel"><span class="music-mark" aria-hidden="true">♪</span><span class="music-label"></span></button><section class="music-panel" id="music-panel" aria-label="音乐播放器" hidden><div class="music-top"><span class="music-title"></span><button type="button" class="music-close" aria-label="关闭播放器并停止播放">×</button></div><div class="music-host"></div><p class="music-note"><a target="_blank" rel="noopener noreferrer">Apple Music ↗</a></p></section><p class="music-error" role="status" hidden></p>';
  document.body.append(root);
  const button = root.querySelector('.music-toggle');
  const mark = root.querySelector('.music-mark');
  const label = root.querySelector('.music-label');
  const panel = root.querySelector('.music-panel');
  const host = root.querySelector('.music-host');
  const error = root.querySelector('.music-error');
  label.textContent = settings.title;
  root.querySelector('.music-title').textContent = `${settings.artist} · ${settings.title}`;
  root.querySelector('.music-note a').href = officialURL;
  let audio = null, desired = false, ticket = 0, fadeRAF = 0, pending = false;
  const playingVideos = () => [...document.querySelectorAll('video')].some(v => !v.paused && !v.ended && !v.muted);
  const announceError = text => { error.textContent = text; error.hidden = !text; };
  function reflect() {
    const playing = Boolean(audio && !audio.paused && !pending);
    root.dataset.playing = String(playing);
    mark.textContent = nativeSrc ? (playing ? 'Ⅱ' : '♪') : (panel.hidden ? '♪' : '×');
    if (nativeSrc) {
      button.setAttribute('aria-pressed', String(playing));
      button.setAttribute('aria-label', `${playing ? '暂停' : '播放'}${settings.artist}《${settings.title}》`);
      button.setAttribute('aria-busy', String(pending));
    } else {
      button.setAttribute('aria-expanded', String(!panel.hidden));
      button.setAttribute('aria-label', panel.hidden ? `打开《${settings.title}》官方播放器` : '关闭播放器并停止播放');
    }
  }
  function fade(to) {
    cancelAnimationFrame(fadeRAF);
    if (!audio) return;
    const from = audio.volume, start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / 600);
      audio.volume = from + (to - from) * t;
      if (t < 1) fadeRAF = requestAnimationFrame(step);
    }
    fadeRAF = requestAnimationFrame(step);
  }
  function stopNative() { ticket++; desired = false; pending = false; cancelAnimationFrame(fadeRAF); if (audio) audio.pause(); reflect(); }
  async function playNative() {
    if (!audio) {
      audio = document.createElement('audio'); audio.id = 'site-soundtrack'; audio.preload = 'none'; audio.loop = true; audio.volume = 0;
      audio.src = nativeSrc; document.body.append(audio);
      audio.addEventListener('playing', () => { pending = false; announceError(''); reflect(); fade(playingVideos() ? baseVolume * 0.2 : baseVolume); });
      audio.addEventListener('pause', reflect);
      audio.addEventListener('error', () => { stopNative(); announceError('音源暂时无法播放。'); });
    }
    desired = true; pending = true; const attempt = ++ticket; reflect();
    try {
      // play() is called in the explicit click handler, never on load or hash navigation.
      await audio.play();
      if (attempt !== ticket) return;
      pending = false; reflect();
    } catch (e) {
      if (attempt !== ticket) return;
      stopNative();
      announceError(e.name === 'NotAllowedError' ? '请再次点击开启音乐。' : '音源暂时无法播放。');
    }
  }
  function closeOfficial() {
    host.replaceChildren(); panel.hidden = true; reflect();
  }
  function openOfficial() {
    if (!embedURL || new URL(embedURL).hostname !== 'embed.music.apple.com') { announceError('音乐播放器暂不可用。'); return; }
    const frame = document.createElement('iframe');
    frame.title = `${settings.artist}《${settings.title}》— Apple Music`;
    frame.src = embedURL; frame.allow = 'autoplay *; encrypted-media *; fullscreen *; clipboard-write';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.setAttribute('allowtransparency', 'true');
    // Preserve the official player's visible controls; do not misreport cross-origin playback.
    host.replaceChildren(frame); panel.hidden = false; announceError(''); reflect();
  }
  button.addEventListener('click', () => {
    if (nativeSrc) { if (desired || pending) stopNative(); else playNative(); }
    else if (panel.hidden) openOfficial(); else closeOfficial();
  });
  root.querySelector('.music-close').addEventListener('click', () => { closeOfficial(); button.focus(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { closeOfficial(); button.focus(); } });
  const duck = () => { if (audio && !audio.paused) fade(playingVideos() ? baseVolume * 0.2 : baseVolume); };
  for (const event of ['play', 'pause', 'ended', 'volumechange', 'emptied']) document.addEventListener(event, e => { if (e.target.tagName === 'VIDEO') duck(); }, true);
  window.addEventListener('hashchange', () => setTimeout(duck, 50));
  window.addEventListener('pagehide', () => { stopNative(); closeOfficial(); });
  document.addEventListener('visibilitychange', () => {
    if (!audio) return;
    if (document.hidden && desired) { ticket++; pending = false; cancelAnimationFrame(fadeRAF); audio.pause(); reflect(); }
    else if (!document.hidden && desired && audio.paused) playNative();
  });
  window.__0086Music = Object.freeze({ get mode() { return nativeSrc ? 'native' : 'official'; }, get playing() { return Boolean(audio && !audio.paused && !pending); }, get playerOpen() { return !panel.hidden; } });
  reflect();
})();
