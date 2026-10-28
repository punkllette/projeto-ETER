/* ÉTER / bounded, event-driven image sequence. No playback or scroll interception. */
(() => {
'use strict';
const root=document.documentElement, section=document.querySelector('.hero-section'), stage=document.querySelector('.hero-sticky-stage'), canvas=document.querySelector('#hero-canvas'), poster=document.querySelector('.hero-poster'), media=document.querySelector('.hero-media'), content=document.querySelector('.hero-content'), cue=document.querySelector('.hero-scroll-cue'), marker=document.querySelector('.hero-side-marker'), status=document.querySelector('.media-status');
const items=[...document.querySelectorAll('.scroll-item')], toggle=document.querySelector('.motion-toggle'), reduced=matchMedia('(prefers-reduced-motion: reduce)'), mobile=matchMedia('(max-width: 767px)'), connection=navigator.connection;
const manifest=window.ETER_HERO_MANIFEST;
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const cleanups=[];function listen(el,type,fn,options){el.addEventListener(type,fn,options);cleanups.push(()=>el.removeEventListener(type,fn,options))}
let context=null;try{context=canvas.getContext('2d',{alpha:true})}catch{}
let paused=false, staticMode=true, failed=!context||!manifest, destroyed=false, suspended=false, raf=0, resizePending=true, needsDraw=true, progress=0, target=0, drawn=-1, direction=1, lastTarget=-1, stageTop=0, stageH=1, stageW=1, variant=null, variantName='', generation=0, queue=[], active=0, consecutiveFailures=0, firstPaint=false, inView=true, started=false;
const cache=new Map(), pending=new Map(), failures=new Set();
let metrics={requests:0,failures:0,draws:0,peakCacheBytes:0,peakRequests:0};
function disposeImage(image){if(typeof image?.close==='function')image.close();else if(image)image.src=''}
function clearMedia(){generation++;queue=[];for(const job of pending.values()){job.cancel()}pending.clear();active=0;for(const image of cache.values())disposeImage(image);cache.clear();failures.clear();firstPaint=false;drawn=-1;target=0;lastTarget=-1;media.classList.remove('has-frame');}
function staticReason(){return failed?'Sequência indisponível. Imagem estática.':connection?.saveData?'Economia de dados: imagem estática.':reduced.matches?'Movimento reduzido.':paused?'Movimento pausado.':''}
function setMode(){if(destroyed)return;const next=failed||reduced.matches||!!connection?.saveData||paused;const changed=staticMode!==next;staticMode=next;root.classList.toggle('sequence-enabled',!next);root.classList.toggle('is-static',next);toggle.hidden=false;toggle.disabled=failed||reduced.matches||!!connection?.saveData;toggle.setAttribute('aria-pressed',String(next));toggle.querySelector('span').textContent=next?'Retomar movimento':'Pausar movimento';toggle.setAttribute('aria-label',next?'Retomar movimento':'Pausar movimento');toggle.title=staticReason()||'Pausar movimento';status.textContent=staticReason();if(changed||!started){clearMedia();started=true;resizePending=true;needsDraw=true;if(!next)selectVariant();}if(next){for(const item of items){item.style.removeProperty('--sy');item.style.removeProperty('--so');item.style.removeProperty('--sb');item.inert=false}cue.style.opacity='0';marker.style.opacity='1';stage.style.setProperty('--wash','1')}schedule();}
function selectVariant(){const name=mobile.matches?'mobile':'desktop';const v=manifest?.variants?.[name];if(!v||!v.files?.length||v.count!==v.files.length||v.width<=0||v.height<=0){failed=true;setMode();return}variantName=name;variant=v;const safeBudget=Math.min(v.cacheBudgetBytes,name==='mobile'?48*1048576:96*1048576);variant={...v,limit:Math.max(4,Math.floor(safeBudget/(v.width*v.height*4)))};}
function schedule(){if(!raf&&!destroyed&&!suspended&&!document.hidden)raf=requestAnimationFrame(update)}
function readLayout(){stageW=stage.clientWidth;stageH=stage.clientHeight;stageTop=section.getBoundingClientRect().top+window.scrollY;root.style.setProperty('--measured-stage',stageH+'px');if(variant){const density=Math.min(devicePixelRatio||1,1.5,variant.width/stageW);canvas.width=Math.max(1,Math.round(stageW*density));canvas.height=Math.max(1,Math.round(stageH*density));}resizePending=false;needsDraw=true;}
function renderContent(){const span=.225, stagger=.009;for(const item of items){const focused=item.contains(document.activeElement);const n=Number(item.dataset.order)||0;const local=focused?0:clamp((progress-n*stagger)/(span-5*stagger));item.style.setProperty('--sy',(-60*local).toFixed(2)+'px');item.style.setProperty('--so',(1-local).toFixed(3));item.style.setProperty('--sb',((mobile.matches?7:14)*local).toFixed(2)+'px');item.inert=local>=.999&&!focused;}cue.style.opacity=String(1-clamp(progress/.10));marker.style.opacity=String(1-clamp(progress/.18));stage.style.setProperty('--wash',String(1-clamp(progress/.3)));}
function plan(){if(!variant||staticMode||!inView)return;const wanted=[];const add=i=>{if(i>=0&&i<variant.count&&!wanted.includes(i))wanted.push(i)};add(target);if(!firstPaint&&target<4){for(let i=0;i<4;i++)add(i)}const radius=Math.min(Math.floor((variant.limit-2)/2),14);for(let n=1;n<=radius;n++){add(target+n*direction);add(target-n*direction)}queue=wanted.filter(i=>!cache.has(i)&&!pending.has(i)&&!failures.has(i)); // replaces stale priorities on every seek
for(const [i,job] of pending){if(Math.abs(i-target)>radius*2&&i!==target)job.cancel()}
pump();}
function trim(){while(cache.size>variant.limit){let victim=null,score=-1;for(const i of cache.keys()){if(i===target)continue;const d=Math.abs(i-target);if(d>score){score=d;victim=i}}if(victim===null)break;disposeImage(cache.get(victim));cache.delete(victim)}metrics.peakCacheBytes=Math.max(metrics.peakCacheBytes,cache.size*variant.width*variant.height*4)}
function pump(){while(active<4&&queue.length&&!staticMode&&!suspended&&inView&&!document.hidden){const i=queue.shift();if(!cache.has(i)&&!pending.has(i)&&!failures.has(i))load(i)}}
function load(i){const gen=generation;const img=new Image();img.decoding='async';let settled=false;let timer;active++;metrics.requests++;metrics.peakRequests=Math.max(metrics.peakRequests,active);
const finish=()=>{if(settled)return false;settled=true;clearTimeout(timer);img.onload=img.onerror=null;if(gen===generation){pending.delete(i);active=Math.max(0,active-1)}return true};
const bad=()=>{if(!finish())return;if(gen!==generation||destroyed)return;img.src='';failures.add(i);metrics.failures++;consecutiveFailures++;if(!firstPaint&&consecutiveFailures>=6){failed=true;setMode();return}if(failures.size&&firstPaint)status.textContent='Quelques images indisponíveis.'.replace('Quelques','Algumas');pump();schedule()};
pending.set(i,{cancel(){if(!finish())return;img.src='';if(gen===generation)pump()}});
img.onload=async()=>{if(settled)return;if(!img.naturalWidth||!img.naturalHeight){bad();return}let decoded=img;try{if(typeof createImageBitmap==='function')decoded=await createImageBitmap(img)}catch{}if(settled||gen!==generation||destroyed){if(decoded!==img)disposeImage(decoded);return}if(!finish()){disposeImage(decoded);return}consecutiveFailures=0;if(decoded!==img)img.src='';cache.set(i,decoded);trim();needsDraw=true;schedule();pump()};img.onerror=bad;timer=setTimeout(bad,12000);img.src='assets/hero/'+variant.files[i];}
function nearest(){if(cache.has(target))return target;let chosen=-1,d=Infinity;for(const i of cache.keys()){if(Math.abs(i-target)<d){d=Math.abs(i-target);chosen=i}}return chosen}
// Feather the image bounds, not the full-screen canvas: the notebook crosses
// the source's bottom edge. Keep its central drawing and pen perfectly sharp.
function featherFrame(x,y,w,h){
context.save();context.globalCompositeOperation='destination-in';
const vertical=context.createLinearGradient(0,y,0,y+h);
for(const [stop,alpha] of [[0,0],[.025,.35],[.06,1],[.82,1],[.88,.9],[.94,.4],[.98,.06],[1,0]])vertical.addColorStop(stop,`rgba(0,0,0,${alpha})`);
context.fillStyle=vertical;context.fillRect(x,y,w,h);
const horizontal=context.createLinearGradient(x,0,x+w,0);
for(const [stop,alpha] of [[0,0],[.025,.35],[.07,1],[.93,1],[.975,.35],[1,0]])horizontal.addColorStop(stop,`rgba(0,0,0,${alpha})`);
context.fillStyle=horizontal;context.fillRect(x,y,w,h);context.restore();
}
function draw(){const index=nearest();if(index<0)return;if(index===drawn&&!needsDraw)return;const image=cache.get(index);const iw=image.width||image.naturalWidth,ih=image.height||image.naturalHeight;if(!(iw>0&&ih>0&&canvas.width>0&&canvas.height>0))return;const w=canvas.width,h=canvas.height,t=clamp(progress/.30);let box;
// Start with a dedicated product zone, then expand to a centered full-stage contain.
// Contain is intentional: the sampled source briefly sends the pen to the top edge.
if(mobile.matches){box={x:0,y:h*(.54*(1-t)),w:w,h:h*(.37+.63*t)}}else{box={x:w*.32*(1-t),y:h*.12*(1-t),w:w*(.78+.22*t),h:h*(.80+.20*t)}}
const scale=Math.min(box.w/iw,box.h/ih),dw=iw*scale,dh=ih*scale,dx=box.x+(box.w-dw)/2,dy=box.y+(box.h-dh)/2;
// Clear and redraw synchronously only after a valid frame is decoded. WebP carries alpha.
context.clearRect(0,0,w,h);context.drawImage(image,dx,dy,dw,dh);featherFrame(dx,dy,dw,dh);drawn=index;needsDraw=false;metrics.draws++;if(!firstPaint){firstPaint=true;media.classList.add('has-frame');status.textContent=''} }
function update(){raf=0;if(destroyed||suspended)return;if(resizePending)readLayout();if(staticMode)return;const old=progress;progress=clamp((window.scrollY-stageTop)/(stageH*2));target=Math.round(progress*(variant.count-1));if(target!==lastTarget){direction=target>=lastTarget?1:-1;lastTarget=target;plan()}if(old!==progress)needsDraw=true;renderContent();draw();section.dataset.progress=progress.toFixed(4);section.dataset.frame=String(drawn);}
function failSafe(error){console.warn('ÉTER hero: static fallback',error);failed=true;setMode()}
// Lifecycle, layout and accessibility are independent from loading success.
const observer=new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;section.classList.toggle('in-view',inView);if(inView){if(!staticMode){plan();schedule()}}else{queue=[];for(const job of [...pending.values()])job.cancel()}},{threshold:0});observer.observe(section);cleanups.push(()=>observer.disconnect());
const ro=new ResizeObserver(()=>{resizePending=true;schedule()});ro.observe(stage);cleanups.push(()=>ro.disconnect());
listen(window,'scroll',()=>{if(!staticMode){if(window.scrollY>stageTop+4)section.classList.add('intro-skip');schedule()}},{passive:true});listen(window,'resize',()=>{if(!staticMode&&variantName!==(mobile.matches?'mobile':'desktop')){clearMedia();selectVariant()}resizePending=true;schedule()},{passive:true});listen(content,'focusout',schedule);listen(content,'focusin',schedule);
listen(document,'visibilitychange',()=>{document.body.classList.toggle('page-hidden',document.hidden);if(document.hidden){cancelAnimationFrame(raf);raf=0;queue=[];for(const job of [...pending.values()])job.cancel()}else{if(!staticMode)plan();schedule()}});
listen(reduced,'change',setMode);if(connection?.addEventListener)listen(connection,'change',setMode);
listen(toggle,'click',()=>{paused=!paused;setMode();if(paused&&window.scrollY>section.offsetTop)window.scrollTo({top:section.offsetTop,behavior:'instant'})});
listen(document.querySelector('#explore-motion'),'click',e=>{e.preventDefault();if(staticMode){poster.scrollIntoView({behavior:'instant',block:'center'});return}window.scrollTo({top:stageTop+stageH,behavior:'smooth'})});
const dialog=document.querySelector('#concept-dialog');let opener=null;for(const link of document.querySelectorAll('[data-dialog-open]'))listen(link,'click',e=>{e.preventDefault();opener=link;dialog.showModal()});listen(dialog,'close',()=>{if(opener&&!opener.closest('[inert]'))opener.focus({preventScroll:true});else document.querySelector('.nav-about').focus({preventScroll:true})});listen(document,'keydown',e=>{if(e.key==='Escape'&&dialog.open){e.preventDefault();dialog.close()}});listen(dialog,'click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
function destroy(){destroyed=true;cancelAnimationFrame(raf);raf=0;clearMedia();cleanups.splice(0).forEach(fn=>fn())}
listen(window,'pagehide',e=>{if(e.persisted){suspended=true;cancelAnimationFrame(raf);raf=0;queue=[];for(const job of [...pending.values()])job.cancel()}else destroy()});listen(window,'pageshow',()=>{suspended=false;if(window.scrollY>4)section.classList.add('intro-skip');resizePending=true;if(!staticMode)plan();schedule()});
// Read-only diagnostics for validation; destroy is available for embedding/unmounting.
window.eterHero={getState:()=>({staticMode,reason:staticReason(),progress,target,drawn,count:variant?.count||0,variant:variantName,cacheFrames:cache.size,cacheBytes:cache.size*(variant?.width||0)*(variant?.height||0)*4,cacheLimit:variant?.limit||0,activeRequests:active,pendingFrames:[...pending.keys()],queuedFrames:queue.slice(),canvas:[canvas.width,canvas.height],stageHeight:stageH,metrics:{...metrics}}),destroy};
try{if(window.scrollY>4)section.classList.add('intro-skip');else if(!reduced.matches&&!connection?.saveData)section.classList.add('intro');setMode();}catch(error){failSafe(error)}
})();

/* ÉTER / PrecisionShowcase motion. Progressive, bounded and reduced-motion safe. */
(() => {
'use strict';
const section=document.querySelector('.precision-section');if(!section)return;
const reduced=matchMedia('(prefers-reduced-motion: reduce)'),image=section.querySelector('.product-image-wrap img'),visual=section.querySelector('.product-visual'),reveals=[...section.querySelectorAll('[data-reveal]')];
let visible=false,queued=false;const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
const revealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('active');revealObserver.unobserve(entry.target)}}),{threshold:.12,rootMargin:'0px 0px -6%'});reveals.forEach(item=>revealObserver.observe(item));
function renderPrecision(){queued=false;if(!visible||reduced.matches)return;const rect=section.getBoundingClientRect(),travel=rect.height+innerHeight,progress=clamp((innerHeight-rect.top)/travel),exit=clamp((progress-.56)/.22)*.68;section.style.setProperty('--section-exit',exit.toFixed(3));section.style.setProperty('--media-shift',(progress*28).toFixed(2)+'px');image.style.setProperty('--product-parallax',((progress-.5)*30).toFixed(2)+'px')}
function schedulePrecision(){if(!queued){queued=true;requestAnimationFrame(renderPrecision)}}
const precisionObserver=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible)schedulePrecision()},{threshold:0});precisionObserver.observe(section);addEventListener('scroll',schedulePrecision,{passive:true});addEventListener('resize',schedulePrecision,{passive:true});
visual.addEventListener('pointermove',event=>{if(reduced.matches||event.pointerType==='touch')return;const rect=visual.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width-.5,y=(event.clientY-rect.top)/rect.height-.5,wrap=visual.querySelector('.product-image-wrap');wrap.style.transform=`perspective(1200px) rotateX(${(y*-1.1).toFixed(2)}deg) rotateY(${(x*1.1).toFixed(2)}deg)`});visual.addEventListener('pointerleave',()=>visual.querySelector('.product-image-wrap').style.transform='');
reduced.addEventListener('change',event=>{if(event.matches){section.style.removeProperty('--section-exit');section.style.removeProperty('--media-shift');image.style.removeProperty('--product-parallax')}else schedulePrecision()});
})();

/* ÉTER / StrokeLab — tactile demonstration with keyboard-safe mode controls. */
(() => {
'use strict';
const lab=document.querySelector('.stroke-lab');if(!lab)return;
const consoleEl=lab.querySelector('.stroke-console'),stage=lab.querySelector('.stroke-stage'),line=lab.querySelector('.stroke-line'),ghost=lab.querySelector('.stroke-ghost'),buttons=[...lab.querySelectorAll('[data-stroke-mode]')],reduced=matchMedia('(prefers-reduced-motion: reduce)');
const readout={latency:lab.querySelector('[data-lab-latency]'),angle:lab.querySelector('[data-lab-angle]'),pressure:lab.querySelector('[data-lab-pressure]')};
const modes={precision:{latency:'0.08 MS',angle:'42°',pressure:'18%'},flow:{latency:'0.12 MS',angle:'48°',pressure:'46%'},gesture:{latency:'0.16 MS',angle:'56°',pressure:'82%'}};
const labObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('active');labObserver.unobserve(entry.target)}}),{threshold:.12,rootMargin:'0px 0px -5%'});lab.querySelectorAll('[data-lab-reveal]').forEach(item=>labObserver.observe(item));
function selectMode(mode){const data=modes[mode];if(!data)return;consoleEl.dataset.mode=mode;buttons.forEach(button=>{const active=button.dataset.strokeMode===mode;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active))});readout.latency.textContent=data.latency;readout.angle.textContent=data.angle;readout.pressure.textContent=data.pressure;if(!reduced.matches){line.style.animation='none';void line.getBoundingClientRect();line.style.animation=''}}
buttons.forEach(button=>button.addEventListener('click',()=>selectMode(button.dataset.strokeMode)));
let pendingPoint=null,pointRaf=0;
function renderPoint(){pointRaf=0;if(!pendingPoint)return;const {x,y}=pendingPoint,curveY=180+y*250,endY=190+y*210,d=`M-40 410 C140 ${curveY} 290 ${520-y*170} 475 ${280-y*45} S790 ${110+y*90} 1040 ${endY}`;line.setAttribute('d',d);ghost.setAttribute('d',d);stage.style.setProperty('--pointer-x',(x*100).toFixed(1)+'%');stage.style.setProperty('--pointer-y',(y*100).toFixed(1)+'%');readout.angle.textContent=Math.round(28+x*38)+'°';readout.pressure.textContent=Math.round(8+(1-y)*84)+'%'}
stage.addEventListener('pointermove',event=>{if(reduced.matches)return;const rect=stage.getBoundingClientRect();pendingPoint={x:Math.min(1,Math.max(0,(event.clientX-rect.left)/rect.width)),y:Math.min(1,Math.max(0,(event.clientY-rect.top)/rect.height))};if(!pointRaf)pointRaf=requestAnimationFrame(renderPoint)});
stage.addEventListener('pointerleave',()=>{pendingPoint={x:.5,y:.5};if(!pointRaf)pointRaf=requestAnimationFrame(renderPoint)});
stage.addEventListener('keydown',event=>{const step=event.shiftKey?.08:.03;if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const current=pendingPoint||{x:.5,y:.5};pendingPoint={x:Math.min(1,Math.max(0,current.x+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0))),y:Math.min(1,Math.max(0,current.y+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0)))};if(!pointRaf)pointRaf=requestAnimationFrame(renderPoint)});
})();

/* ÉTER / ProductFinale — viewport-bound film playback and cinematic reveal. */
(() => {
'use strict';
const finale=document.querySelector('.finale-section');if(!finale)return;
const video=finale.querySelector('.finale-video'),pause=finale.querySelector('.finale-pause'),label=finale.querySelector('[data-finale-pause-label]'),icon=finale.querySelector('.pause-icon'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
let visible=false,userPaused=false,progressRaf=0;
const finaleReveal=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('active');finaleReveal.unobserve(entry.target)}}),{threshold:.14,rootMargin:'0px 0px -5%'});finale.querySelectorAll('[data-finale-reveal]').forEach(item=>finaleReveal.observe(item));
function syncFilmButton(){const stopped=video.paused;pause.setAttribute('aria-pressed',String(stopped));label.textContent=stopped?'Reproduzir filme':'Pausar filme';icon.textContent=stopped?'▶':'Ⅱ'}
function paintFilmProgress(){progressRaf=0;const value=video.duration?video.currentTime/video.duration:0;finale.style.setProperty('--film-progress',Math.min(1,Math.max(0,value)).toFixed(4));if(visible&&!video.paused)progressRaf=requestAnimationFrame(paintFilmProgress)}
function startFilm(){if(!visible||userPaused||reduced.matches||document.hidden)return;video.play().then(()=>{syncFilmButton();if(!progressRaf)progressRaf=requestAnimationFrame(paintFilmProgress)}).catch(()=>syncFilmButton())}
function stopFilm(){video.pause();cancelAnimationFrame(progressRaf);progressRaf=0;syncFilmButton()}
const filmObserver=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;document.body.classList.toggle('finale-active',entry.intersectionRatio>.12);if(visible)startFilm();else stopFilm()},{threshold:[0,.12,.35]});filmObserver.observe(finale);
pause.addEventListener('click',()=>{userPaused=!video.paused;if(userPaused)stopFilm();else startFilm()});video.addEventListener('loadedmetadata',paintFilmProgress);video.addEventListener('ended',paintFilmProgress);
video.addEventListener('error',()=>{finale.classList.add('film-fallback');pause.disabled=true;label.textContent='Imagem estática';icon.textContent='—'});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopFilm();else startFilm()});reduced.addEventListener('change',event=>{if(event.matches){video.currentTime=0;stopFilm()}else{userPaused=false;startFilm()}});syncFilmButton();
})();

/* ÉTER / global orientation — progress and current chapter. */
(() => {
'use strict';
const chapters=[['hero','01 / INSTRUMENTO DE IDEIAS'],['precision','02 / ENGENHARIA DO GESTO'],['stroke-lab','03 / INTELIGÊNCIA TÁTIL'],['finale','04 / ESTUDO CONCEITUAL']].map(([id,label])=>[document.querySelector('#'+id),label]).filter(([section])=>section);
const edition=document.querySelector('.nav-edition');let queued=false,current='';
function updateOrientation(){queued=false;const max=Math.max(1,document.documentElement.scrollHeight-innerHeight),progress=Math.min(1,Math.max(0,scrollY/max));document.documentElement.style.setProperty('--site-progress',progress.toFixed(4));let next=chapters[0];const threshold=innerHeight*.42;for(const chapter of chapters){if(chapter[0].getBoundingClientRect().top<=threshold)next=chapter}if(next[1]!==current){current=next[1];edition.textContent=current}}
function scheduleOrientation(){if(!queued){queued=true;requestAnimationFrame(updateOrientation)}}
addEventListener('scroll',scheduleOrientation,{passive:true});addEventListener('resize',scheduleOrientation,{passive:true});updateOrientation();
})();
