import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const moduleSource=await readFile(new URL('../celebration-effects.js',import.meta.url),'utf8');
const publicConfig=JSON.parse(await readFile(new URL('../environments/production.json',import.meta.url),'utf8'));
const publishedIds=[...new Set([...publicConfig.gameIds,...(publicConfig.staticLocalGameIds||[])])];

class Node{
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.parentNode=null;this.attributes={};this.style={values:{},setProperty(k,v){this.values[k]=String(v)}};this.className='';this.hidden=false;this._text='';this.isConnected=false;this.classList={add:(...names)=>{const s=new Set(this.className.split(/\s+/).filter(Boolean));names.forEach(n=>s.add(n));this.className=[...s].join(' ')},toggle:(name,force)=>{const s=new Set(this.className.split(/\s+/).filter(Boolean));if(force)s.add(name);else s.delete(name);this.className=[...s].join(' ');return s.has(name)},contains:name=>this.className.split(/\s+/).includes(name)}}
 set textContent(value){this._text=String(value);this.children=[]}
 get textContent(){return this._text+this.children.map(c=>c.textContent).join('')}
 append(...nodes){for(const node of nodes){node.parentNode?.remove(node);node.parentNode=this;node.isConnected=this.isConnected;this.children.push(node)}return nodes.at(-1)}
 replaceChildren(...nodes){for(const child of this.children){child.parentNode=null;child.isConnected=false}this.children=[];this._text='';this.append(...nodes)}
 setAttribute(name,value){this.attributes[name]=String(value)}
 remove(node){this.children=this.children.filter(c=>c!==node);node.parentNode=null;node.isConnected=false}
 querySelectorAll(selector){const all=[];const visit=node=>{for(const c of node.children){if(selector.startsWith('.')&&c.classList.contains(selector.slice(1)))all.push(c);visit(c)}};visit(this);return all}
}
function harness({game='keisan',before=0,threshold=5,reduce=false}={}){
 const listeners=new Map(),frames=[],timers=[],observers=[],body=new Node('body'),head=new Node('head'),documentElement=new Node('html'),verdict=new Node('h2'),resultOverlay=new Node('div'),resultHeading=new Node('strong'),feedback=new Node('div');
 verdict.id='verdict';resultOverlay.id='resultOverlay';feedback.id='feedback';resultOverlay.append(resultHeading);
 const document={body,head,documentElement,currentScript:{src:'https://local.test/celebration-effects.js'},createElement:t=>new Node(t),addEventListener(type,fn){const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list)},querySelector:selector=>selector==='#feedback'?feedback:null,querySelectorAll:selector=>selector==='#verdict, #resultOverlay, #resultOverlay strong'?[verdict,resultOverlay,resultHeading]:[]};body.isConnected=true;head.isConnected=true;
 const state={best:before},catalog=[{id:game,name:'test game',titles:[{id:game+':'+threshold,at:threshold,name:'テスト称号',displayName:'テスト称号',image:'assets/badge.png',standalone:true}]}];
 const context={game,prompt:{correct:'right'},answered:false};
 const economy={answer(ctx,value){ctx.answered=true;if(value==='right')state.best=Math.max(state.best,state.best+1);return Promise.resolve(true)}};
 const window={ManabiEconomy:economy,ManabiEconomyCore:{canonicalPrompt:(_g,p)=>p,correct:(_g,p,a)=>p.correct===a},ManabiProfileCatalog:catalog,ManabiProfile:{records:()=>[{id:game,best:state.best}]},ManabiIdentity:{badge(){return new Node('img')}},manabiStorage:{},matchMedia:()=>({matches:reduce}),MANABI_BACKEND_CONFIG:{accountAccessEnabled:false}};
 const location={href:'https://local.test/game.html?adminTest=1'};
 class TestMutationObserver{constructor(callback){this.callback=callback;observers.push(this)}observe(){}}
 const sandbox={window,document,location,URL,Math,Date,MutationObserver:TestMutationObserver,requestAnimationFrame:fn=>frames.push(fn),setTimeout:(fn,ms)=>{const timer={fn,ms,cancelled:false};timers.push(timer);return timer},clearTimeout:timer=>{if(timer)timer.cancelled=true}};
 vm.runInNewContext(moduleSource,sandbox,{filename:'celebration-effects.js'});
 return {window,document,body,economy,context,state,frames,timers,listeners,verdict,resultOverlay,resultHeading,feedback,refreshLegacy(){for(const observer of observers)observer.callback()},dispatch(type){for(const fn of listeners.get(type)||[])fn({type})},flushFrames(){while(frames.length)frames.shift()()}};
}

test('all currently configured public game pages load the shared effect after identity and before game code',async()=>{
 assert.ok(publishedIds.length>0);
 for(const id of publishedIds){
  for(const dir of ['games','shared-src/site/games']){
   const html=await readFile(new URL(`../${dir}/${id}.html`,import.meta.url),'utf8');
   const identity=html.indexOf('identity-view.js'),effects=html.indexOf('celebration-effects.js'),answer=html.indexOf(id==='alphabet'?'alphabet-game.js':id==='suichoku'?'suichoku-game.js':id==='distribution'?'distribution-game.js':id==='distribution2'||id==='exchangeAssociation'?'math-new-game.js':id==='keisan'?'social-score-sync.js':'social-score-sync.js');
   assert.ok(identity>=0&&effects>identity,`${dir}/${id}: effect loads after identity image catalog`);
   assert.ok(answer<0||effects<answer,`${dir}/${id}: effect loads before page answer integration`);
   if(id==='alphabet')assert.ok(html.includes('alphabet-audio.js'),`${dir}/${id}: optional user-triggered voice remains installed`);
  }
 }
 for(const id of ['kotowaza','multiplicationProperties','shapeExpressions','keisanSummary']){
  const html=await readFile(new URL(`../games/${id}.html`,import.meta.url),'utf8');
  assert.ok(!html.includes('celebration-effects.js'),`${id} remains outside the currently published game configuration`);
 }
 assert.equal(await readFile(new URL('../celebration-effects.js',import.meta.url),'utf8'),await readFile(new URL('../shared-src/site/celebration-effects.js',import.meta.url),'utf8'));
});

test('a correct response shows the confetti celebration without blocking input or changing the 500ms game timer',()=>{
 const h=harness({before:1,threshold:5});h.dispatch('pointerdown');const result=h.economy.answer(h.context,'right');assert.ok(result instanceof Promise);assert.equal(h.state.best,2,'the original game answer continues immediately');h.flushFrames();
 const layer=h.body.children.find(n=>n.classList.contains('mgl-celebration'));
 assert.ok(layer);assert.ok(layer.classList.contains('mgl-celebration--correct'));assert.match(layer.textContent,/正解！/);assert.equal(layer.children.filter(n=>n.classList.contains('mgl-celebration__particle')).length,38);assert.equal(layer.style.values['pointer-events'],undefined);
 assert.ok(h.timers.some(t=>t.ms===470));assert.ok(!h.timers.some(t=>t.ms===500),'the shared module does not introduce or alter a game advance timer');
});

test('a newly crossed title shows the title art and title-only overlay',()=>{
 const h=harness({game:'alphabet',before:0,threshold:1});h.dispatch('click');h.economy.answer(h.context,'right');h.flushFrames();
 const layer=h.body.children.find(n=>n.classList.contains('mgl-celebration'));
 assert.ok(layer.classList.contains('mgl-celebration--title'));assert.match(layer.textContent,/新しい称号を獲得！テスト称号/);assert.equal(layer.querySelectorAll('.mgl-celebration__title-card').length,1);assert.equal(layer.querySelectorAll('.mgl-celebration__text').length,0);assert.ok(h.timers.some(t=>t.ms===1000));
});

test('legacy correct labels are concealed without hiding wrong feedback or the next-question cue',()=>{
 const h=harness();h.verdict.textContent='正解！';h.resultHeading.textContent='⭕ 正解！';h.feedback.textContent='正解！ · 0.5秒後に次の問題へ';h.refreshLegacy();
 assert.ok(h.verdict.classList.contains('mgl-legacy-correct-hidden'));assert.ok(h.resultHeading.classList.contains('mgl-legacy-correct-hidden'));assert.ok(h.resultOverlay.classList.contains('mgl-legacy-correct-hidden'));assert.equal(h.feedback.textContent,'0.5秒後に次の問題へ');
 h.verdict.textContent='不正解！';h.resultHeading.textContent='❌ 不正解';h.feedback.textContent='正解は A。もう一度考えよう。';h.refreshLegacy();
 assert.ok(!h.verdict.classList.contains('mgl-legacy-correct-hidden'));assert.ok(!h.resultHeading.classList.contains('mgl-legacy-correct-hidden'));assert.ok(!h.resultOverlay.classList.contains('mgl-legacy-correct-hidden'));assert.equal(h.feedback.textContent,'正解は A。もう一度考えよう。');
});

test('wrong and repeated answers do not add celebrations or duplicate overlays',()=>{
 const wrong=harness({before:1,threshold:5});wrong.dispatch('pointerdown');wrong.economy.answer(wrong.context,'wrong');wrong.flushFrames();assert.equal(wrong.window.ManabiCelebrations.active(),false);
 const right=harness({before:1,threshold:5});right.dispatch('pointerdown');right.economy.answer(right.context,'right');right.economy.answer(right.context,'right');right.flushFrames();assert.equal(right.body.children.filter(n=>n.classList.contains('mgl-celebration')).length,1);
});

test('reduced motion is supported and the common effect module contains no audio playback',()=>{
 const h=harness({reduce:true});assert.ok(moduleSource.includes('@media(prefers-reduced-motion:reduce)'));assert.doesNotMatch(moduleSource,/AudioContext|new Audio\s*\(|speechSynthesis|\.play\s*\(/i);h.window.ManabiCelebrations.showCorrect();assert.equal(h.body.children.filter(n=>n.classList.contains('mgl-celebration')).length,1);
});
