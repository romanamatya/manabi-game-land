import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import '../challenge120-core.js';
import {GAME_IDS,checkedInput} from '../shared-src/site/management-model.js';

const read=file=>fs.readFileSync(new URL(file,import.meta.url),'utf8');
function umd(file,name){const module={exports:{}};const context={module,globalThis:{},Math,Date,Set,Object,Array,Number,String,Error,structuredClone};vm.runInNewContext(read(file),context);return module.exports||context.globalThis[name]}
const model=umd('../shared-src/site/suichoku-model.js','ManabiSuichoku');
const economy=umd('../shared-src/site/economy-core.js','ManabiEconomyCore');
function rng(seed){let value=seed>>>0;return()=>((value=(1664525*value+1013904223)>>>0)/4294967296)}
function segmentsCross(a,b){const cross=(u,v)=>u.x*v.y-u.y*v.x,sub=(p,q)=>({x:p.x-q.x,y:p.y-q.y}),r=sub(a.end,a.start),s=sub(b.end,b.start),den=cross(r,s);if(Math.abs(den)<1e-9)return false;const offset=sub(b.start,a.start),t=cross(offset,s)/den,u=cross(offset,r)/den;return t>=-1e-8&&t<=1+1e-8&&u>=-1e-8&&u<=1+1e-8}
function gameHarness(initial={best:0,streak:0,history:[]},{localOnly=false,coreAvailable=true,withChallengeRuntime=false,sharedEconomy=false}={}){
 const events=[],calls=[],prompts=[],timers=new Map();let nextTimer=0;
 class Element{constructor(tag='div'){this.tagName=tag;this.children=[];this.parentElement=null;this.listeners=new Map();this.attributes={};this.dataset={};this.hidden=false;this.disabled=false;this.textContent='';this.className='';this.value='';this.classList={toggle:(name,on)=>{const set=new Set(this.className.split(/\s+/).filter(Boolean));if(on)set.add(name);else set.delete(name);this.className=[...set].join(' ')}}}append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node)}}replaceChildren(...nodes){this.children=[];this.append(...nodes)}setAttribute(k,v){this.attributes[k]=String(v);if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]=String(v)}getAttribute(k){return this.attributes[k]??null}addEventListener(k,fn){const list=this.listeners.get(k)||[];list.push(fn);this.listeners.set(k,list)}closest(selector){for(let n=this;n;n=n.parentElement)if(selector==='[data-choice]'&&n.getAttribute('data-choice')!==null)return n;return null}}
 const document={readyState:'complete',body:{dataset:{localChallengeOnly:String(localOnly)},append(){}},elements:new Map(),getElementById(id){if(!this.elements.has(id)){const el=new Element();if(id==='tower')el.append(...[5,10,15,20,25].map(n=>{const item=new Element('li');item.dataset.need=String(n);return item}));this.elements.set(id,el)}return this.elements.get(id)},createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag),querySelector(){return null},addEventListener(){}};
 const values=new Map([['mgl_suichoku',JSON.stringify(initial)]]),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
 const trackedModel={...model,buildQuestion:options=>{const prompt=model.buildQuestion(options);prompts.push(prompt);return prompt}};
 const window={ManabiSuichoku:trackedModel,...(coreAvailable?{ManabiEconomyCore:economy}:{}),...(withChallengeRuntime?{ManabiChallenge120Core:globalThis.ManabiChallenge120Core,MANABI_ENV:{preview:false,environment:'production'},MANABI_BACKEND_CONFIG:{challenge120Enabled:true,accountAccessEnabled:false}}:{}),manabiStorage:storage,crypto:{randomUUID:()=>`question-${Date.now()}`},...(!localOnly||sharedEconomy?{ManabiEconomy:{begin:(game,prompt)=>({game,prompt}),answer:async(ctx,answer)=>{calls.push({ctx,answer});return true},balance:()=>12}}:{}),ManabiProfile:{records:()=>[{id:'suichoku',best:JSON.parse(values.get('mgl_suichoku')||'{}').best||0}]},addEventListener(){},dispatchEvent:e=>events.push(e)};
 class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail}}class Event{constructor(type){this.type=type}}
 const ctx={window,document,Event,CustomEvent,Date,Math,Number,String,Object,Array,Set,JSON,Promise,crypto:window.crypto,URL,location:{pathname:'/games/suichoku.html',href:'https://site.test/games/suichoku.html?adminTest=1'},navigator:{locks:null},performance:{now:()=>0},console,clearTimeout:id=>timers.delete(id),setTimeout:fn=>{const id=++nextTimer;timers.set(id,fn);return id},setInterval:()=>0};vm.createContext(ctx);if(withChallengeRuntime)vm.runInContext(read('../shared-src/site/challenge120-runtime.js'),ctx);vm.runInContext(read('../shared-src/site/suichoku-game.js'),ctx);
 return {document,storage,values,calls,events,timers,prompts};
}

test('seeded generation covers all five reference angles, all answer positions, and all line relationships',()=>{
 const coverage=new Set();for(let seed=1;seed<=5000;seed++){const q=model.buildQuestion({random:rng(seed),id:'q-'+seed});assert.equal(model.validateQuestion(q),true);assert.equal(q.candidates.length,5);assert.equal(q.candidates.filter(c=>Math.abs(c.dot)<1e-9).length,1);assert.equal(q.correctIndex,q.candidates.findIndex(c=>Math.abs(c.dot)<1e-9));coverage.add(q.baselineAngle+':'+q.correctIndex+':'+q.candidates[q.correctIndex].mode);const geometry=[];for(const c of q.candidates){assert.ok(Math.abs(Math.hypot(c.end.x-c.start.x,c.end.y-c.start.y)-210)<1e-7);const parts=[{start:c.start,end:c.end},...(c.extension?[c.extension]:[])];for(const p of parts){assert.ok(p.start.x>20&&p.start.x<1780&&p.end.x>20&&p.end.x<1780,'candidate stays inside SVG width');assert.ok(p.start.y>20&&p.start.y<1180&&p.end.y>20&&p.end.y<1180,'candidate stays inside SVG height');}if(c.extension){const e=c.extension,d=c.direction,cross=(e.end.x-e.start.x)*d.y-(e.end.y-e.start.y)*d.x;assert.ok(Math.abs(cross)<1e-7,'dashed extension remains collinear with its candidate');assert.ok(Math.hypot(e.end.x-e.start.x,e.end.y-e.start.y)>0)}geometry.push(parts)}for(let a=0;a<geometry.length;a++)for(let b=a+1;b<geometry.length;b++)for(const x of geometry[a])for(const y of geometry[b])assert.equal(segmentsCross(x,y),false,'blue candidate lines never cross each other')}
 for(const angle of model.BASE_ANGLES)for(let position=0;position<5;position++)for(const mode of model.MODES)assert.ok(coverage.has(angle+':'+position+':'+mode),`coverage ${angle}/${position}/${mode}`);
});

test('each candidate has one numerically unique perpendicular direction for every baseline angle',()=>{
 for(const base of model.BASE_ANGLES){const candidates=model.DELTAS.map((delta,index)=>model.makeCandidate(delta,index,[-560,-280,0,280,560][index],['cross','tee','gap','cross','tee'][index],1,base));const matches=candidates.filter(c=>Math.abs(model.dot(model.vector(base),c.direction))<1e-9);assert.equal(matches.length,1);assert.equal(matches[0].delta,0);for(const c of candidates)assert.ok(Math.hypot(c.end.x-c.start.x,c.end.y-c.start.y)>0)}
});

test('point question validation, correct answer, campaign and daily cap use the shared economy',()=>{
 const q=model.buildQuestion({random:rng(87),id:'valid-q'}),clean=economy.canonicalPrompt('suichoku',q);assert.equal(economy.correct('suichoku',clean,{choice:clean.correctIndex}),true);assert.equal(economy.correct('suichoku',clean,{choice:(clean.correctIndex+1)%5}),false);
 const bad={...q,candidates:q.candidates.map((c,i)=>i?c:{...c,delta:15})};assert.throws(()=>economy.canonicalPrompt('suichoku',bad),/invalid-question/);
 let wallet=economy.initial();const claim='same-question';let first=economy.reward(wallet,'suichoku',economy.correct('suichoku',clean,{choice:clean.correctIndex}),'2026-11-03');wallet={...first.wallet,claimed:[claim]};assert.equal(first.granted,1);assert.equal(economy.hasClaimed(wallet,claim),true);if(!economy.hasClaimed(wallet,claim))wallet=economy.reward(wallet,'suichoku',true,'2026-11-03').wallet;assert.equal(wallet.balances.math,1,'replaying one claim cannot award twice');for(let i=1;i<60;i++)wallet=economy.reward(wallet,'suichoku',true,'2026-11-03',{multiplier:2,cap:50}).wallet;assert.equal(wallet.balances.math,50);assert.equal(wallet.daily.games.suichoku,50);const next=economy.reward(wallet,'suichoku',true,'2026-11-03',{multiplier:2,cap:50});assert.equal(next.granted,0);assert.equal(next.wallet.balances.math,50);const tomorrow=economy.reward(wallet,'suichoku',true,'2026-11-04');assert.equal(tomorrow.granted,1);assert.equal(tomorrow.wallet.balances.math,51);
});

test('shared math economy is used even while the 120-second board remains local-only',async()=>{
 const h=gameHarness({best:0,streak:0,history:[]},{localOnly:true,sharedEconomy:true}),index=h.prompts[0].correctIndex;
 assert.equal(h.document.getElementById('points').textContent,'12');await h.document.getElementById('choices').children[index].onclick();assert.equal(h.calls.length,1);assert.equal(h.document.getElementById('points').textContent,'12');
});

test('game UI accepts both a choice button and direct SVG tap, gives one answer result, and preserves a best after an error',async()=>{
 const correct=gameHarness(),diagram=correct.document.getElementById('diagram'),groups=diagram.children[0].children.filter(n=>n.getAttribute('data-choice')!==null),correctIndex=correct.prompts[0].correctIndex;
 // The correct SVG line can be tapped directly; button and line taps share one result.
 const handler=diagram.listeners.get('click')[0];handler({target:groups.find(n=>Number(n.getAttribute('data-choice'))===correctIndex)});await new Promise(resolve=>setImmediate(resolve));assert.equal(correct.calls.length,1);assert.equal(correct.calls[0].answer.choice,correctIndex);assert.equal(JSON.parse(correct.storage.getItem('mgl_suichoku')).streak,1);assert.equal(groups.length,5);correct.document.getElementById('choices').children[(correctIndex+1)%5].onclick();assert.equal(correct.calls.length,1,'second activation of the same question is ignored');
 const wrong=gameHarness({best:8,streak:3,history:[]}),choices=wrong.document.getElementById('choices'),wrongIndex=(wrong.prompts[0].correctIndex+1)%5;choices.children[wrongIndex].onclick();await new Promise(resolve=>setImmediate(resolve));const after=JSON.parse(wrong.storage.getItem('mgl_suichoku'));assert.equal(after.streak,0);assert.equal(after.best,8);assert.equal(wrong.document.getElementById('next').hidden,false);assert.equal(wrong.calls.length,1);
});

test('answer analysis aggregates baseline angles, line types, and wrong labels',()=>{
 const report=model.analysis([{final:true,baselineAngle:15,mode:'cross',correct:true,selectedLabel:'ア'},{final:true,baselineAngle:15,mode:'gap',correct:false,selectedLabel:'ウ'},{final:false,baselineAngle:30,mode:'tee',correct:true,selectedLabel:'エ'}]);assert.equal(report.answers,2);assert.deepEqual({...report.byAngle['15°']},{answers:2,correct:1,rate:50});assert.deepEqual({...report.byMode.gap},{answers:1,correct:0,rate:0});assert.equal(report.wrong['ウ'],1);
});

test('25-question title unlocks the existing 120-second practice-to-challenge transition',()=>{
 const C=globalThis.ManabiChallenge120Core;let state=C.fresh('suichoku');for(let i=0;i<25;i++){const result=C.answer(state,C.issue(state,'sq-'+i),true,1000+i);assert.equal(result.accepted,true);state=result.state;}assert.equal(state.phase,'waiting');const started=C.start(state,5000,'attempt','season');assert.equal(started.deadline,125000);assert.equal(started.streak,25);const expired=C.settle(started,started.deadline);assert.equal(expired.phase,'ended');assert.equal(expired.endReason,'timeout');assert.equal(expired.bests.season,25);
});

test('approved title PNG files remain 512 square, transparent, and byte-stable',()=>{
 const expected={title_05:'348851CCEA1FF24C68590415C24869C03F1ACF058F147ADD0D3E5389FD5E270F',title_10:'DF6E93DBCC023506B83ADBF8A62089FB81031D006D69FDE32587995B356833E4',title_15:'7BAD11BBC7A07D6DE3AD617346DDC17DD015CDCBA99D7DEC9F231FA6D73D58F8',title_20:'0A82C64524A92E0CF0F0945A8F6B759684E09708A70FF6FC75DD03FBCA688DB1',title_25:'7EDB1C5F3FABB36FEC8C30D79F5AFB3EF5D8A38EFD97178FFA5577CCD446C9E4'};
 for(const [name,hash]of Object.entries(expected)){const bytes=fs.readFileSync(new URL('../shared-src/site/assets/suichoku-titles/'+name+'.png',import.meta.url)),rootBytes=fs.readFileSync(new URL('../assets/suichoku-titles/'+name+'.png',import.meta.url));assert.deepEqual(rootBytes,bytes,'root and shared copies retain the approved bytes');assert.equal(bytes.readUInt32BE(16),512);assert.equal(bytes.readUInt32BE(20),512);assert.ok([4,6].includes(bytes[25]),'PNG includes alpha channel');assert.equal(crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase(),hash)}
});

test('shared ranking is enabled without adding the game to the existing admin batch',()=>{
 const catalogContext={window:{}};vm.runInNewContext(read('../shared-src/site/profile-catalog.js'),catalogContext);const game=catalogContext.window.ManabiProfileCatalog.find(g=>g.id==='suichoku');assert.ok(game);assert.equal(game.subject,'math');assert.equal(game.rankingEnabled,true);assert.deepEqual(JSON.parse(JSON.stringify(game.titles.map(t=>[t.at,t.name]))),[[5,'垂直みつけ隊'],[10,'垂直のたんけん家'],[15,'垂直の目利き'],[20,'垂直の名探偵'],[25,'垂直の見きわめ王']]);assert.ok(!GAME_IDS.includes('suichoku'),'the game is excluded from the existing 11-game atomic Rules batch');assert.throws(()=>checkedInput('visibility',{game:'suichoku',status:'hidden'}),/invalid-visibility/);assert.throws(()=>checkedInput('campaign',{games:['suichoku'],startAt:1000,endAt:2000,enabled:true}),/invalid-games/);assert.equal(economy.games.suichoku,'math');assert.equal(globalThis.ManabiChallenge120Core.highest.suichoku,25);
 const mapping=read('../shared-src/site/data-contract.js');assert.match(mapping,/suichoku:'suichokuBestStreak'/);const settings=read('../shared-src/site/management-store.js');assert.match(settings,/GAME_IDS/);const math=read('../shared-src/site/math.html');assert.match(math,/data-game-card="suichoku"/);assert.match(math,/ranking\.html\?game=suichoku/);const env=JSON.parse(read('../environments/production.json'));assert.ok(!env.gameIds.includes('suichoku'));assert.ok(env.rankingGameIds.includes('suichoku'));assert.deepEqual(env.staticLocalGameIds,['suichoku']);
});

test('game page loads the existing shared points system and keeps the challenge board separate',()=>{
 const html=read('../shared-src/site/games/suichoku.html'),runtime=read('../shared-src/site/challenge120-runtime.js'),admin=read('../shared-src/site/public-admin-settings.js');
 for(const forbidden of ['public-firebase-session.js','public-game-availability.js','social-score-sync.js'])assert.ok(!html.includes(forbidden),forbidden);
 assert.match(html,/data-local-challenge-only="true"/);assert.match(html,/economy\.js/);assert.match(html,/id="points"/);assert.match(html,/ranking\.html\?game=suichoku/);assert.match(runtime,/共有ランキングには投稿されません/);assert.match(admin,/staticPublished/);
});

test('game starts and remains playable without optional economy code, and ten answers advance continuously',async()=>{
 const h=gameHarness({best:0,streak:0,history:[]},{localOnly:true,coreAvailable:false,withChallengeRuntime:true});assert.match(h.document.getElementById('question').textContent,/赤い直線/);assert.equal(h.document.getElementById('choices').children.length,5);assert.equal(h.document.getElementById('diagram').children[0].children.filter(n=>n.getAttribute('data-choice')!==null).length,5);
 for(let i=0;i<10;i++){const index=h.prompts[i].correctIndex;await h.document.getElementById('choices').children[index].onclick();assert.equal(h.document.getElementById('verdict').textContent,'正解！');for(const fn of h.timers.values())fn();h.timers.clear();assert.match(h.document.getElementById('question').textContent,/赤い直線/);assert.equal(h.document.getElementById('choices').children.length,5)}
 const saved=JSON.parse(h.storage.getItem('mgl_suichoku'));assert.equal(saved.history.length,10);assert.equal(saved.streak,10);assert.equal(saved.best,10);assert.equal(h.document.getElementById('points').textContent,'0');assert.deepEqual([...h.values.keys()].sort(),['mgl_challenge120_v1:suichoku','mgl_suichoku']);assert.ok(![...h.values.keys()].some(k=>/ranking|points|wallet/i.test(k)));
 const reloaded=gameHarness(saved,{localOnly:true,coreAvailable:false,withChallengeRuntime:true});assert.equal(reloaded.document.getElementById('best').textContent,10);assert.match(reloaded.document.getElementById('question').textContent,/赤い直線/);
});

test('wrong answers show feedback once and allow the next question without changing the best',async()=>{
 const h=gameHarness({best:8,streak:3,history:[]},{localOnly:true,coreAvailable:false}),wrong=(h.prompts[0].correctIndex+1)%5,button=h.document.getElementById('choices').children[wrong];await button.onclick();assert.equal(h.document.getElementById('verdict').textContent,'不正解');assert.equal(JSON.parse(h.storage.getItem('mgl_suichoku')).streak,0);assert.equal(JSON.parse(h.storage.getItem('mgl_suichoku')).best,8);assert.equal(h.document.getElementById('next').hidden,false);await button.onclick();assert.equal(JSON.parse(h.storage.getItem('mgl_suichoku')).history.length,1);h.document.getElementById('next').onclick();assert.match(h.document.getElementById('question').textContent,/赤い直線/);
});

test('the tower has one approved image for each title and the shared profile UI leaves this tower untouched',()=>{
 const html=read('../shared-src/site/games/suichoku.html'),profile=read('../shared-src/site/profile-ui.js'),items=[...html.matchAll(/<li data-need="(\d+)"><img src="\.\.\/assets\/suichoku-titles\/(title_\d+\.png)"/g)];assert.deepEqual(items.map(x=>[Number(x[1]),x[2]]),[[25,'title_25.png'],[20,'title_20.png'],[15,'title_15.png'],[10,'title_10.png'],[5,'title_05.png']]);assert.match(profile,/if\(!gameId\|\|gameId==='suichoku'\)return/);
});

test('iPad landscape layout preserves diagram aspect ratio, touch size, and static publication',()=>{
 const css=read('../shared-src/site/suichoku.css'),game=read('../shared-src/site/suichoku-game.js'),html=read('../shared-src/site/games/suichoku.html'),admin=read('../shared-src/site/public-admin-settings.js'),env=JSON.parse(read('../environments/production.json'));
 assert.match(game,/preserveAspectRatio:'xMidYMid meet'/);assert.match(css,/@media\(max-height:580px\) and \(orientation:landscape\)/);assert.match(css,/min-height:48px/);assert.match(html,/public-admin-settings\.js/);assert.ok(html.indexOf('public-admin-settings.js')<html.indexOf('suichoku-game.js'));assert.match(html,/data-score-game="suichoku"/);assert.match(html,/economy\.js/);assert.match(html,/script-src[^>]+www\.gstatic\.com/);assert.match(admin,/staticPublished/);assert.ok(!env.gameIds.includes('suichoku'));assert.ok(env.rankingGameIds.includes('suichoku'));assert.deepEqual(env.staticLocalGameIds,['suichoku']);
 const navigation=read('../math-navigation.css');assert.match(navigation,/body\[data-unit="geometry"\] #mathCards\{flex:0 0 auto;grid-auto-rows:auto;align-content:start\}/);assert.match(read('../math-navigation.js'),/ranking\.html\?game='\+id/);
});
