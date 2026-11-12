/* 0086: EVA-inspired signal framing. Original SVG/CSS, no franchise assets.
   The only meter reads real sound energy; category numbers are actual menu order. */
(() => {
'use strict';
if(window.__0086EVA)return;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
document.querySelectorAll('.entry-link').forEach((a,i)=>a.dataset.evaIndex=String(i+1).padStart(2,'0'));
const root=document.createElement('div');root.id='eva-overlay';root.setAttribute('aria-hidden','true');
const ticks=Array.from({length:37},(_,i)=>{const a=(i*10-180)*Math.PI/180,r=i%3===0?425:432;return `<path d="M${450+Math.cos(a)*r} ${450+Math.sin(a)*r}L${450+Math.cos(a)*438} ${450+Math.sin(a)*438}"/>`;}).join('');
root.innerHTML=`<div class="eva-reticle"><svg viewBox="0 0 900 900" fill="none" xmlns="http://www.w3.org/2000/svg"><g class="eva-fine">${ticks}<path d="M450 12v25M450 863v25M12 450h25M863 450h25"/><path d="M180 160L160 180V280M720 160L740 180V280M160 620V720L180 740M740 620V720L720 740"/><path d="M196 102H332M568 102H704M196 798H332M568 798H704"/></g><g class="eva-strong"><path d="M173 120H120V173M727 120H780V173M120 727V780H173M780 727V780H727"/><path d="M82 410v80M818 410v80"/></g><g class="eva-mark"><path d="M80 450l10-4v8zM820 450l-10-4v8zM450 80l-4 10h8zM450 820l-4-10h8z"/><path d="M192 94h5v16h-5zM202 94h5v16h-5zM212 94h5v16h-5zM683 790h5v16h-5zM693 790h5v16h-5zM703 790h5v16h-5z"/></g></svg></div><span class="eva-edge left"></span><span class="eva-edge right"></span><span class="eva-corner left"></span><span class="eva-corner right"></span><div class="eva-envelope" data-muted="true">${'<i></i>'.repeat(20)}</div>`;
document.body.append(root);
const scan=document.createElement('div');scan.className='eva-scan';scan.setAttribute('aria-hidden','true');document.body.append(scan);
const reticle=root.querySelector('.eva-reticle'),meter=root.querySelector('.eva-envelope'),segments=[...meter.children];
let raf=0,last=0,lastSweep=0,beatAt=-10000,beatStrength=0,scanAnim=null,frames=0;
function sweep(){
 if(reduced.matches||document.hidden||performance.now()-lastSweep<700)return;
 lastSweep=performance.now();if(scanAnim)scanAnim.cancel();
 scanAnim=scan.animate([{transform:'translateY(8vh)',opacity:0},{opacity:.6,offset:.12},{opacity:.25,offset:.82},{transform:'translateY(92vh)',opacity:0}],{duration:680,easing:'cubic-bezier(.2,.6,.3,1)'});
}
function update(now){
 raf=0;if(document.hidden||reduced.matches)return;
 if(now-last<45){raf=requestAnimationFrame(update);return;}last=now;
 const field=window.__0086Field,audio=window.__0086Music,pose=field?.camera||{x:0,y:0};
 const age=(now-beatAt)/1000,hit=beatStrength*Math.exp(-age*5);
 reticle.style.transform=`translate(calc(-50% + ${pose.x*10}px),calc(-50% + ${pose.y*8}px)) rotate(${pose.x*1.4}deg) scale(${1+hit*.008})`;
 const energy=audio?.playing?Math.min(1,Math.max(0,field?.energy||0)):0;
 const lit=Math.round(energy*segments.length);segments.forEach((s,i)=>s.classList.toggle('hot',i<lit));
 meter.dataset.muted=String(!audio?.playing);document.documentElement.style.setProperty('--eva-hit',hit.toFixed(3));
 frames++;raf=requestAnimationFrame(update);
}
function run(){if(!raf&&!document.hidden&&!reduced.matches)raf=requestAnimationFrame(update);}
function stop(){cancelAnimationFrame(raf);raf=0;}
document.addEventListener('0086:beat',e=>{if(reduced.matches)return;beatAt=performance.now();beatStrength=e.detail?.power||.65;});
window.addEventListener('hashchange',sweep);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else run();});
reduced.addEventListener('change',()=>{stop();if(reduced.matches){reticle.style.transform='translate(-50%,-50%)';document.documentElement.style.setProperty('--eva-hit','0');segments.forEach(s=>s.classList.remove('hot'));}else run();});
window.addEventListener('pagehide',stop);window.addEventListener('pageshow',e=>{if(e.persisted)run();});
window.__0086EVA=Object.freeze({version:7,get frames(){return frames;},get lastBeat(){return beatAt;},get meterLevel(){return segments.filter(s=>s.classList.contains('hot')).length;}});
document.documentElement.dataset.designRevision='eva-luminous-v7';run();
})();
