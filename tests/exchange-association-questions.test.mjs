import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const module={exports:{}};
vm.runInNewContext(readFileSync(new URL('../shared-src/site/math-new-model.js',import.meta.url),'utf8'),{module,Math,Set,Error});
const model=module.exports;
const questions=model.exchangeQuestions();
const pairs=[[0,1],[0,2],[1,2]];

test('exchange-association has the original integer set plus decimal additions and 125×8 items',()=>{
 const counts=model.validateExchangeQuestions();
 assert.equal(counts.count,34);
 assert.equal(counts.decimalCount,12);
 assert.equal(counts['125Count'],8);
 assert.equal(counts.additionCount,20);
 assert.equal(counts.multiplicationCount,14);
 assert.equal(questions.filter(q=>q.id.startsWith('mul-')).length,6);
 assert.equal(questions.filter(q=>q.id.startsWith('add-')).length,8);
});

test('all three choices are equivalent and exactly one grouping matches the easy target',()=>{
 for(const q of questions){
  const values=q.values.map(Number);
  const totals=pairs.map(([a,b])=>q.op==='＋'||q.op==='+'?values[a]+values[b]+values[3-a-b]:values[a]*values[b]*values[3-a-b]);
  assert.ok(totals.every(n=>Math.abs(n-q.result)<1e-8),q.id);
  const matching=pairs.map(([a,b])=>q.op==='＋'||q.op==='+'?values[a]+values[b]:values[a]*values[b]).filter(n=>Math.abs(n-q.target)<1e-8);
  assert.equal(matching.length,1,q.id);
  assert.equal(q.choices.length,3,q.id);
 }
});

test('decimal questions use tenths and addition only; no decimal multiplication is generated',()=>{
 const decimals=questions.filter(q=>q.id.startsWith('decimal-add-'));
 assert.equal(decimals.length,12);
 for(const q of decimals){
  assert.equal(q.op,'+');
  assert.ok(q.values.every(v=>/^\d+\.\d$/.test(v)));
  assert.ok(Number.isInteger(Number(q.group)));
 }
 assert.ok(!questions.some(q=>q.op==='×'&&q.values.some(v=>v.includes('.'))));
});

test('125×8 questions place the useful pair in different positions and explain the 1000 product',()=>{
 const qs=questions.filter(q=>q.id.startsWith('125x8-'));
 assert.equal(qs.length,8);
 assert.ok(qs.every(q=>q.values.includes('125')&&q.values.includes('8')&&q.target===1000&&q.solution.includes('1000')));
 assert.deepEqual(new Set(qs.map(q=>q.correct)),new Set([0,1,2]));
});

test('answer order is shuffled and balanced across positions',()=>{
 let seed=24681357;const rng=()=>{seed=(seed*48271)%2147483647;return seed/2147483647};
 let counts=[0,0,0],last=-1;
 for(let n=0;n<3000;n++){const q=questions[n%questions.length],r=model.randomizedChoiceOrder(q,counts,last,rng);counts=r.counts;last=r.position}
 assert.ok(Math.max(...counts)-Math.min(...counts)<=1);
});

test('preview game wires storage adapter before economy runtime and keeps production game isolated',()=>{
 const preview=readFileSync(new URL('../preview/games/exchangeAssociation.html',import.meta.url),'utf8');
 const production=readFileSync(new URL('../games/exchangeAssociation.html',import.meta.url),'utf8');
 assert.ok(preview.indexOf('storage-adapters.js')<preview.indexOf('economy.js'));
 assert.ok(production.includes('math-production-points.js'));
 assert.ok(!production.includes('economy.js?v='));
 for(const page of [preview,production]){
  assert.match(page,/\.titles #tower li\{font-size:14px;line-height:1\.6\}/);
  assert.match(page,/\.titles #tower \.mq-badge\{--badge-size:32px;width:32px;height:32px\}/);
  assert.match(page,/\.titles li\{padding:3px\}/);
 }
});


test('question decks visit every item once, avoid adjacent types, and avoid the previous cycle boundary',()=>{
 let seed=39173,previousType='';const rng=()=>{seed=(seed*48271)%2147483647;return seed/2147483647};
 for(let cycle=0;cycle<8;cycle++){
  const deck=model.shuffleQuestionDeck(questions,previousType,rng);
  assert.equal(deck.length,questions.length);
  assert.equal(new Set(deck.map(q=>q.id)).size,questions.length);
  assert.notEqual(deck[0].type,previousType);
  for(let i=1;i<deck.length;i++)assert.notEqual(deck[i-1].type,deck[i].type,`${cycle}:${i}`);
  previousType=deck.at(-1).type;
 }
});

test('correct option positions remain balanced and never repeat in a long run',()=>{
 let seed=5421;const rng=()=>{seed=(seed*48271)%2147483647;return seed/2147483647};
 let counts=[0,0,0],last=-1;
 for(let i=0;i<questions.length*8;i++){
  const q=questions[i%questions.length],result=model.randomizedChoiceOrder(q,counts,last,rng);
  assert.equal(result.order[result.position],q.correct);
  assert.equal(new Set(result.order).size,3);
  if(last>=0)assert.notEqual(result.position,last);
  counts=result.counts;last=result.position;
 }
 assert.ok(Math.max(...counts)-Math.min(...counts)<=1);
});

test('three-second automatic transition is scoped to successful exchange answers',()=>{
 const game=readFileSync(new URL('../shared-src/site/math-new-game.js',import.meta.url),'utf8');
 assert.match(game,/kind==='exchangeAssociation'&&ok\)autoNextTimer=setTimeout/);
 assert.match(game,/\},3000\)/);
 assert.match(game,/document\.addEventListener\('visibilitychange'/);
 assert.match(game,/if\(!locked\)return;locked=false;clearAutoAdvance\(\);next\(\)/);
});
