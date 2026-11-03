(()=>{
'use strict';
const economy=window.ManabiEconomy,core=window.ManabiEconomyCore;
if(!economy||typeof economy.answer!=='function'||!core?.correct||window.ManabiCelebrations)return;
const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
const testMode=new URL(location.href).searchParams.has('adminTest');
const assetBase=new URL('.',document.currentScript?.src||location.href);
let lastGesture=0,active=null,effectSequence=0,answerSequence=0;
const bestSeen=new Map();
const titles=window.ManabiProfileCatalog||[];
const style=document.createElement('style');
style.textContent=`
.mgl-celebration{position:fixed;inset:0;z-index:9990;overflow:hidden;pointer-events:none;display:grid;place-items:center;contain:strict}
.mgl-celebration[hidden]{display:none!important}.mgl-celebration__glow{position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at center,rgba(255,255,226,.98) 0,rgba(255,221,104,.52) 21%,rgba(255,120,190,.18) 44%,transparent 72%);animation:mgl-celebration-glow .48s ease-out both}
.mgl-celebration__rays{position:absolute;width:min(95vw,105vh);aspect-ratio:1;border-radius:50%;background:repeating-conic-gradient(from 0deg,rgba(255,219,86,.45) 0 4deg,transparent 4deg 16deg);-webkit-mask-image:radial-gradient(circle,black,transparent 68%);mask-image:radial-gradient(circle,black,transparent 68%);animation:mgl-celebration-rays .95s ease-out both}
.mgl-celebration__text{position:relative;z-index:3;margin:0;padding:.12em .35em;border:4px solid #ffcf47;border-radius:.34em;background:linear-gradient(135deg,#fff7ba,#fff 42%,#ffd7ee);box-shadow:0 8px 0 #ee9c27,0 16px 35px #7a3e6880;color:#e94b86;font-size:clamp(42px,10vw,112px);font-weight:1000;letter-spacing:.06em;text-shadow:0 3px 0 #fff,0 6px 0 #ffd15a;animation:mgl-celebration-pop .46s cubic-bezier(.18,1.6,.35,1) both}
.mgl-celebration__burst{position:absolute;top:52%;width:1px;height:1px;border-radius:50%;background:#fff8b6;box-shadow:0 0 28px 25px #fff4a0aa,0 0 70px 48px #fff1ba55;animation:mgl-celebration-burst .42s ease-out both}.mgl-celebration__burst--left{left:5%}.mgl-celebration__burst--right{right:5%}
.mgl-celebration__particle{position:absolute;z-index:2;left:var(--x);top:var(--y);width:var(--size);height:var(--size);color:var(--color);background:var(--color);border-radius:var(--shape);filter:drop-shadow(0 1px 2px #74445b55);animation:mgl-celebration-fly var(--duration) cubic-bezier(.14,.65,.35,1) var(--delay) both;transform-origin:center}
.mgl-celebration__particle--star{background:none;font-size:var(--size);line-height:1;filter:drop-shadow(0 0 6px white)}
.mgl-celebration--title .mgl-celebration__glow{animation-duration:.95s;background:radial-gradient(ellipse at center,rgba(255,255,237,1),rgba(255,211,73,.68) 28%,rgba(255,137,190,.26) 56%,transparent 76%)}
.mgl-celebration--title .mgl-celebration__text{font-size:clamp(22px,4vw,48px);padding:.18em .55em;animation:mgl-celebration-pop .56s cubic-bezier(.18,1.6,.35,1) both}
.mgl-celebration__title-card{position:relative;z-index:3;display:flex;align-items:center;gap:clamp(12px,3vw,30px);max-width:min(92vw,900px);padding:clamp(16px,3vw,32px);border:5px solid #ffd44f;border-radius:30px;background:linear-gradient(145deg,#fffdf1,#fff 45%,#ffe8f4);box-shadow:0 12px 0 #e9a02f,0 24px 60px #58254770;animation:mgl-celebration-pop .55s cubic-bezier(.18,1.6,.35,1) both}
.mgl-celebration__art{display:grid;place-items:center;width:clamp(96px,22vw,210px);height:clamp(96px,22vw,210px);flex:none;border-radius:50%;background:radial-gradient(circle,#fff 42%,#ffe78a 43% 60%,#ffc84a 61% 66%,transparent 67%);filter:drop-shadow(0 0 18px #ffd84d);animation:mgl-celebration-art .8s ease-out both}
.mgl-celebration__art img,.mgl-celebration__art .mq-badge,.mgl-celebration__art .mq-title-text-only{width:76%!important;height:76%!important;--badge-size:76%!important;object-fit:contain}
.mgl-celebration__title-copy{text-align:center}.mgl-celebration__title-copy strong{display:block;color:#b65b00;font-size:clamp(18px,3.2vw,34px)}.mgl-celebration__title-copy h2{margin:.18em 0;color:#cf3980;font-size:clamp(27px,5.5vw,58px);line-height:1.2}.mgl-celebration__title-copy p{margin:0;color:#54435a;font-size:clamp(14px,2.4vw,23px);font-weight:800}
@keyframes mgl-celebration-glow{0%{opacity:0;transform:scale(.28)}25%{opacity:1}100%{opacity:0;transform:scale(1.35)}}@keyframes mgl-celebration-rays{0%{opacity:0;transform:scale(.18) rotate(-30deg)}22%{opacity:.9}100%{opacity:0;transform:scale(1.25) rotate(25deg)}}@keyframes mgl-celebration-pop{0%{opacity:0;transform:scale(.35) rotate(-8deg)}72%{opacity:1;transform:scale(1.1) rotate(2deg)}100%{opacity:1;transform:scale(1) rotate(0)}}@keyframes mgl-celebration-art{0%{transform:scale(.2) rotate(-26deg)}64%{transform:scale(1.14) rotate(5deg)}100%{transform:scale(1) rotate(0)}}@keyframes mgl-celebration-burst{0%{opacity:0;transform:scale(.1)}35%{opacity:1}100%{opacity:0;transform:scale(1.7)}}@keyframes mgl-celebration-fly{0%{opacity:0;transform:translate3d(0,0,0) rotate(0) scale(.4)}12%{opacity:1}100%{opacity:0;transform:translate3d(var(--dx),var(--dy),0) rotate(var(--rot)) scale(1)}}
@media(prefers-reduced-motion:reduce){.mgl-celebration__glow,.mgl-celebration__rays,.mgl-celebration__text,.mgl-celebration__art,.mgl-celebration__burst,.mgl-celebration__particle{animation:none!important}.mgl-celebration__glow{opacity:.18}.mgl-celebration__text,.mgl-celebration__title-card{transform:none!important;opacity:1}}
@media(max-width:600px){.mgl-celebration__title-card{flex-direction:column;text-align:center}.mgl-celebration__art{width:clamp(86px,25vw,140px);height:clamp(86px,25vw,140px)}}`;
(document.head||document.documentElement).append(style);
const layer=document.createElement('div');layer.className='mgl-celebration';layer.hidden=true;layer.setAttribute('aria-hidden','true');
const glow=document.createElement('div');glow.className='mgl-celebration__glow';
const rays=document.createElement('div');rays.className='mgl-celebration__rays';
layer.append(glow,rays);const mount=()=>{if(!layer.isConnected)document.body?.append(layer)};if(document.body)mount();else document.addEventListener('DOMContentLoaded',mount,{once:true});
const colors=['#ffd447','#ff67a5','#62d6ff','#61dc9b','#aa7cff','#ff914d','#fff27a'];
function rows(){try{return window.ManabiProfile?.records(window.manabiStorage)||[]}catch{return []}}
function readBest(game){const row=rows().find(item=>item.id===game);if(Number.isSafeInteger(Number(row?.best)))return Number(row.best);const fallback=Number(document.querySelector('#best')?.textContent);return Number.isSafeInteger(fallback)?fallback:0}
for(const row of titles)bestSeen.set(row.id,readBest(row.id));
function titleFor(game,before,after){const catalog=titles.find(row=>row.id===game);return catalog?.titles?.filter(item=>item.at>before&&item.at<=after).sort((a,b)=>b.at-a.at)[0]||null}
function artFor(item){const art=document.createElement('div');art.className='mgl-celebration__art';let badge=null;try{badge=window.ManabiIdentity?.badge(item.id,150)}catch{}if(badge){art.append(badge);return art}const image=document.createElement('img');image.alt='';image.src=new URL(item.image||'assets/badges/title-badges-v1.png',assetBase).href;art.append(image);return art}
function addParticles(count){for(let i=0;i<count;i++){const star=i%4===0,particle=document.createElement('span');particle.className='mgl-celebration__particle'+(star?' mgl-celebration__particle--star':'');const side=i%2===0?'8%':'92%',angle=Math.random()*110-55,direction=side==='8%'?1:-1,distance=22+Math.random()*44;particle.style.setProperty('--x',side);particle.style.setProperty('--y',(35+Math.random()*30)+'%');particle.style.setProperty('--dx',direction*Math.cos(angle*Math.PI/180)*distance+'vw');particle.style.setProperty('--dy',(Math.sin(angle*Math.PI/180)*distance-15)+'vh');particle.style.setProperty('--rot',(Math.random()*720-360)+'deg');particle.style.setProperty('--size',(star?16+Math.random()*22:7+Math.random()*11)+'px');particle.style.setProperty('--color',colors[i%colors.length]);particle.style.setProperty('--shape',star?'50%':i%3===0?'50%':'2px');particle.style.setProperty('--delay',(Math.random()*.07)+'s');particle.style.setProperty('--duration',(reduceMotion?.matches?0:.36+Math.random()*.18)+'s');if(star)particle.textContent=i%8===0?'✦':'✧';layer.append(particle)}}
function clear(){if(active)clearTimeout(active);active=null;layer.replaceChildren(glow,rays);layer.className='mgl-celebration';layer.hidden=true}
function show(correctTitle){clear();const token=++effectSequence;layer.hidden=false;layer.classList.add(correctTitle?'mgl-celebration--title':'mgl-celebration--correct');addParticles(correctTitle?66:38);const left=document.createElement('span'),right=document.createElement('span');left.className='mgl-celebration__burst mgl-celebration__burst--left';right.className='mgl-celebration__burst mgl-celebration__burst--right';layer.append(left,right);
 if(correctTitle){const card=document.createElement('section');card.className='mgl-celebration__title-card';card.append(artFor(correctTitle));const copy=document.createElement('div');copy.className='mgl-celebration__title-copy';const lead=document.createElement('strong');lead.textContent='新しい称号を獲得！';const name=document.createElement('h2');name.textContent=correctTitle.displayName||correctTitle.name;const sub=document.createElement('p');sub.textContent=correctTitle.at+'問連続正解';copy.append(lead,name,sub);card.append(copy);layer.append(card)}else{const text=document.createElement('p');text.className='mgl-celebration__text';text.textContent='正解！';layer.append(text)}
 active=setTimeout(()=>{if(token===effectSequence)clear()},correctTitle?1000:470)}
function hasPlayableAccess(){return testMode||window.MANABI_BACKEND_CONFIG?.accountAccessEnabled!==true||window.ManabiPlayerAccess?.canPlay?.()===true}
document.addEventListener('pointerdown',()=>{lastGesture=Date.now()},{capture:true,passive:true});document.addEventListener('keydown',()=>{lastGesture=Date.now()},{capture:true});document.addEventListener('click',()=>{lastGesture=Date.now()},{capture:true});
const original=economy.answer;
economy.answer=function(context,value){
 let game='',correct=false,before=0,eligible=false;
 if(context&&!context.__mglCelebrationHandled&&hasPlayableAccess())try{game=context.game;const prompt=core.canonicalPrompt(game,context.prompt);correct=core.correct(game,prompt,value)===true;if(correct){context.__mglCelebrationHandled=true;before=bestSeen.has(game)?bestSeen.get(game):readBest(game);eligible=testMode||Date.now()-lastGesture<2500;}}catch{}
 const result=original.apply(this,arguments);
 if(correct&&eligible){const token=++answerSequence;requestAnimationFrame(()=>requestAnimationFrame(()=>{if(token!==answerSequence)return;const after=readBest(game),previous=Math.max(0,before),title=titleFor(game,previous,after);bestSeen.set(game,Math.max(previous,after));show(title)}))}
 return result
};
window.ManabiCelebrations=Object.freeze({showCorrect(){show(null)},active:()=>!layer.hidden});
})();
