import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../shared-src/site/parallel-model.js';
const M=globalThis.ManabiParallel;
const rng=seed=>()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
const clone=x=>structuredClone(x);
for(const [streak,level]of [[0,'beginner'],[5,'intermediate'],[15,'advanced']])test(`${level}: 5000 seeded questions independently verify all 21 actual drawn segments`,()=>{
 const answers=new Set(),directions=new Set(),layouts=new Set();
 for(let seed=1;seed<=5000;seed++){
  const q=M.buildQuestion({streak,random:rng(seed),id:level+'-'+seed});assert.equal(q.level,level);assert.equal(q.lines.length,7);assert.equal(M.validateQuestion(q).checked,21);
  const pairs=[];let checks=0;for(let i=0;i<7;i++)for(let j=i+1;j<7;j++){
   checks++;const a=q.lines[i],b=q.lines[j],dx=a.end.x-a.start.x,dy=a.end.y-a.start.y,ex=b.end.x-b.start.x,ey=b.end.y-b.start.y;
   const parallel=BigInt(dx)*BigInt(ey)===BigInt(dy)*BigInt(ex);if(parallel){pairs.push([i,j]);assert.notEqual(BigInt(b.start.x-a.start.x)*BigInt(dy)-BigInt(b.start.y-a.start.y)*BigInt(dx),0n)}
   assert.equal(M.correct(q,[i,j]),parallel);assert.equal(M.correct(q,[j,i]),parallel);
  }
  assert.equal(checks,21);assert.equal(pairs.length,1);answers.add(pairs[0].join(','));const d=M.direction(q.lines[pairs[0][0]]);directions.add(Math.atan2(d.y,d.x).toFixed(4));layouts.add(JSON.stringify(q.lines));
  for(let i=0;i<7;i++){const l=q.lines[i];assert.ok(Math.hypot(l.end.x-l.start.x,l.end.y-l.start.y)>=450);let clear=0;for(let k=2;k<=98;k++){const p=M.at(l,k/100);if(q.lines.every((x,j)=>i===j||M.distance(p,x)>=32)){assert.equal(M.nearestLine(q.lines,p),i);clear++}}assert.ok(clear>=1)}
 }
 assert.equal(answers.size,21);assert.ok(directions.size>1);assert.ok(layouts.size>4900,'problems are varied, not a repeating fixed bank');
});
test('difficulty boundaries and validated bounded fallback for pathological random sources',()=>{
 assert.deepEqual([0,4,5,14,15,25].map(M.difficulty),['beginner','beginner','intermediate','intermediate','advanced','advanced']);
 for(const streak of [0,5,15])for(const random of [()=>0,()=>1,()=>NaN]){const q=M.buildQuestion({streak,random,maxAttempts:2});assert.equal(M.validateQuestion(q).pairs.length,1)}
});
test('rejects malformed, coincident, two-pair and mathematically altered drawing data',()=>{
 const q=M.buildQuestion({random:rng(33)});assert.throws(()=>M.validateQuestion({...q,lines:q.lines.slice(1)}));const [i,j]=M.inspect(q.lines).pairs[0];
 let x=clone(q);x.lines[j]=clone(x.lines[i]);assert.throws(()=>M.validateQuestion(x),/coincident/);
 x=clone(q);x.lines[j].end.x+=1;assert.throws(()=>M.validateQuestion(x));
 x=clone(q);x.lines[0].start.x=NaN;assert.throws(()=>M.validateQuestion(x));
 x=clone(q);const rest=[0,1,2,3,4,5,6].filter(k=>k!==i&&k!==j);x.lines[rest[0]]={start:{x:36,y:100},end:{x:1164,y:100}};x.lines[rest[1]]={start:{x:36,y:540},end:{x:1164,y:540}};assert.throws(()=>M.validateQuestion(x));
 for(const s of [[],[i],[i,i],[i,j,3],[-1,j],[i,7],['0',j]])assert.equal(M.correct(q,s),false);
});
test('crossing ties ignored; nearest actual segment wins independent of paint order',()=>{
 const lines=[{start:{x:0,y:0},end:{x:100,y:100}},{start:{x:0,y:100},end:{x:100,y:0}}];assert.equal(M.nearestLine(lines,{x:50,y:50}),-1);assert.equal(M.nearestLine(lines,{x:25,y:25}),0);assert.equal(M.nearestLine([...lines].reverse(),{x:25,y:25}),1);assert.equal(M.nearestLine(lines,{x:200,y:200}),-1);
});
function localHarness(){const values=new Map([['mgl_points','123'],['mgl_profile','{"nickname":"unchanged"}']]);const window={ManabiParallel:M,crypto:{randomUUID:()=>String(Math.random())}};const ctx={window,globalThis:window,structuredClone,Math,Date,Map,Set,JSON,Number,navigator:{},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(new URL('../shared-src/site/economy-core.js',import.meta.url),'utf8'),ctx);vm.runInContext(fs.readFileSync(new URL('../shared-src/site/challenge120-core.js',import.meta.url),'utf8'),ctx);vm.runInContext(fs.readFileSync(new URL('../shared-src/site/parallel-local.js',import.meta.url),'utf8'),ctx);return {api:window.ManabiParallelLocal,values,ctx}}
test('local points reuse shared reward, grant once, cap 50, reset JST day, preserve all existing data',async()=>{
 const h=localHarness(),q=M.buildQuestion({random:rng(4)}),pair=M.inspect(q.lines).pairs[0],context=h.api.begin('parallelPair',q);
 await h.api.answer(context,{selection:pair});await h.api.answer(context,{selection:pair});assert.equal(h.api.read().wallet.balances.math,1);
 for(let i=0;i<65;i++){if(!h.api.canPlay())await h.api.start();await h.api.answer(h.api.begin('parallelPair',q),{selection:pair})}assert.equal(h.api.read().wallet.balances.math,50);assert.equal(h.api.read().streak,66);
 const wrong=[pair[0],(pair[1]+1)%7].filter((n,i,a)=>a.indexOf(n)===i);await h.api.answer(h.api.begin('parallelPair',q),{selection:wrong});assert.equal(h.api.read().streak,0);assert.equal(h.api.read().best,66);
 const s=h.api.read();s.wallet.daily.date='2000-01-01';h.values.set('manabi_parallel_stage1:v1',JSON.stringify(s));await h.api.start();await h.api.answer(h.api.begin('parallelPair',q),{selection:pair});assert.equal(h.api.read().wallet.balances.math,51);assert.equal(h.api.read().wallet.daily.games.parallelPair,1);
 assert.equal(h.values.get('mgl_points'),'123');assert.equal(h.values.get('mgl_profile'),'{"nickname":"unchanged"}');assert.deepEqual([...h.values.keys()].sort(),['manabi_parallel_stage1:v1','mgl_points','mgl_profile']);
});
test('storage failures preserve play and the session record',async()=>{
 const h=localHarness();h.ctx.localStorage.setItem=()=>{throw Error('quota')};const q=M.buildQuestion({random:rng(8)});await h.api.answer(h.api.begin('parallelPair',q),{selection:M.inspect(q.lines).pairs[0]});assert.equal(h.api.warning(),true);assert.equal(h.api.read().wallet.balances.math,1);
});
test('page uses shared wallet and a gated ranking adapter, with no answer analytics',()=>{
 const html=fs.readFileSync(new URL('../shared-src/site/games/parallelPair.html',import.meta.url),'utf8');assert.match(html,/economy\.js/);assert.match(html,/parallel-ranking\.js/);assert.match(html,/challenge120-core\.js/);
 for(const name of ['parallel-game.js','parallel-local.js','parallel-model.js'])assert.doesNotMatch(fs.readFileSync(new URL('../shared-src/site/'+name,import.meta.url),'utf8'),/new Audio|AudioContext|\.play\(|manabi-learning-answer|history\.push/);
});
test('titles unlock exactly at 3/5/10/15/25, once in order, persist after wrong answers and reload',async()=>{
 const h=localHarness(),q=M.buildQuestion({random:rng(66)}),pair=M.inspect(q.lines).pairs[0],events=[];
 assert.deepEqual(Array.from(h.api.titles,t=>[t.at,t.name]),[[3,'平行みならい'],[5,'平行ハンター'],[10,'平行マスター'],[15,'平行の達人'],[25,'平行の王者']]);
 for(let n=1;n<=27;n++){
  if(!h.api.canPlay())await h.api.start();const c=h.api.begin('parallelPair',q);await h.api.answer(c,{selection:pair});
  assert.deepEqual(Array.from(c.earnedTitles,t=>t.at),[3,5,10,15,25].includes(n)?[n]:[]);
  events.push(...c.earnedTitles.map(t=>t.at));await h.api.answer(c,{selection:pair});assert.equal(h.api.read().streak,n);
 }
 assert.deepEqual(events,[3,5,10,15,25]);
 const ids=Array.from(h.api.titles,t=>t.id);assert.deepEqual(Array.from(h.api.read().titles),ids);
 await h.api.answer(h.api.begin('parallelPair',q),{selection:[]});assert.equal(h.api.read().streak,0);assert.equal(h.api.read().best,27);assert.deepEqual(Array.from(h.api.read().titles),ids);
 vm.runInContext(fs.readFileSync(new URL('../shared-src/site/parallel-local.js',import.meta.url),'utf8'),h.ctx);
 for(let n=0;n<26;n++){if(!h.ctx.window.ManabiParallelLocal.canPlay())await h.ctx.window.ManabiParallelLocal.start();const c=h.ctx.window.ManabiParallelLocal.begin('parallelPair',q);await h.ctx.window.ManabiParallelLocal.answer(c,{selection:pair});assert.equal(c.earnedTitles.length,0)}
 const saved=JSON.parse(h.values.get('manabi_parallel_stage1:v1'));assert.deepEqual(saved.titles,ids);assert.equal(saved.history,undefined);
});
test('stage-1 records migrate using historical best without replaying awards or altering balances',async()=>{
 const h=localHarness(),s=h.api.read();s.streak=2;s.best=16;delete s.titles;delete s.challenge;
 h.values.set('manabi_parallel_stage1:v1',JSON.stringify(s));const wallet=JSON.stringify(s.wallet);
 assert.deepEqual(Array.from(h.api.read().titles),['parallelPair:3','parallelPair:5','parallelPair:10','parallelPair:15']);assert.equal(JSON.stringify(h.api.read().wallet),wallet);
 const q=M.buildQuestion({random:rng(69)}),c=h.api.begin('parallelPair',q);await h.api.answer(c,{selection:M.inspect(q.lines).pairs[0]});assert.equal(c.earnedTitles.length,0);assert.equal(h.api.read().best,16);
});
test('title unlock survives unavailable storage and lock serialisation prevents duplicate awards',async()=>{
 const h=localHarness();h.ctx.localStorage.setItem=()=>{throw Error('quota')};let queue=Promise.resolve();h.ctx.navigator.locks={request:(_key,fn)=>{const result=queue.then(fn);queue=result;return result}};
 const q=M.buildQuestion({random:rng(70)}),pair=M.inspect(q.lines).pairs[0],contexts=Array.from({length:26},()=>h.api.begin('parallelPair',q));
 await Promise.all(contexts.map(c=>h.api.answer(c,{selection:pair})));assert.deepEqual(contexts.flatMap(c=>Array.from(c.earnedTitles,t=>t.at)),[3,5,10,15,25]);assert.equal(h.api.read().titles.length,5);assert.equal(h.api.read().streak,25);assert.equal(contexts.at(-1).accepted,false);assert.equal(h.api.warning(),true);
});
