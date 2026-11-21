import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { GAME, TYPES, createQuestion, createDeck } from '../preview/fraction-basics-model.js';

function random(seed = 123456) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}
function common(name, global) {
  const context = {structuredClone};
  runInNewContext(readFileSync(new URL('../shared-src/site/' + name + '.js', import.meta.url), 'utf8'), context);
  return context[global];
}
const score = common('economy-core', 'ManabiEconomyCore');
const timer = common('challenge120-core', 'ManabiChallenge120Core');
const numeric = value => {
  const [n, d = 1] = value.split('/').map(Number);
  return n / d;
};
test('7,200 generated questions have mathematically unique answers and matching score inputs', () => {
  const rng = random();
  assert.equal(TYPES.length, 12);
  for (const type of TYPES) {
    const variants = new Set();
    for (let i = 0; i < 600; i++) {
      const q = createQuestion(type, rng);
      variants.add(q.prompt + q.options.join('|') + JSON.stringify(q.visual));
      assert.equal(q.type, type);
      assert.ok(q.prompt && q.explanation && q.answer);
      const canonical = score.canonicalPrompt(GAME, q.scorePrompt);
      assert.equal(score.correct(GAME, canonical, q.answer), true, type);
      if (q.visual?.interactive) {
        const [k, n] = q.prompt.match(/^([0-9]+)\/([0-9]+)/).slice(1).map(Number);
        assert.equal(q.options.length, 0);
        assert.deepEqual([q.visual.k, q.visual.n, q.visual.filled, q.answer], [k, n, 0, String(k)]);
        const pieces = n * (k > n ? 2 : 1);
        assert.equal(Array.from({length:pieces},(_, index)=>index+1).filter(value=>score.correct(GAME,canonical,String(value))).length, 1);
      } else {
        assert.equal(q.options.length, 4, type);
        assert.equal(new Set(q.options.map(numeric)).size, 4, type);
        assert.equal(q.options.filter(value => score.correct(GAME, canonical, value)).length, 1, type);
      }
      if (q.visual && q.type.startsWith('read')) {
        assert.equal(q.visual.filled, q.visual.k);
        assert.equal(q.answer, q.visual.k + '/' + q.visual.n);
      }
      if (q.type === 'line') assert.equal(q.answer, q.visual.k + '/' + q.visual.n);
      if (q.type === 'unit') {
        const [n,k] = q.prompt.match(/\d+/g).slice(1).map(Number);
        assert.equal(numeric(q.answer), k / n);
      }
      if (q.type === 'one') {
        const relation = q.prompt.includes('同じ') ? n => n === 1 : n => n > 1;
        assert.deepEqual(q.options.filter(value => relation(numeric(value))), [q.answer]);
      }
      if (q.type === 'compare') {
        const extreme = q.prompt.includes('小さい') ? Math.min : Math.max;
        assert.equal(numeric(q.answer), extreme(...q.options.map(numeric)));
      }
      if (q.type === 'toFraction') assert.equal(Number(q.prompt.slice(0, 3)), numeric(q.answer));
      if (q.type === 'toDecimal') assert.equal(Number(q.answer), numeric(q.prompt.split(' ')[0]));
      if (q.type === 'add' || q.type === 'subtract') {
        const [a,n,b,d] = q.prompt.match(/\d+/g).map(Number);
        assert.equal(n, d);
        assert.equal(numeric(q.answer), (q.type === 'add' ? a + b : a - b) / n);
      }
    }
    assert.ok(variants.size >= 10, type);
  }
});
test('each shuffled cycle includes every format once', () => {
  const deck = createDeck(random(2026));
  const cycles = Array.from({length:12},()=>Array.from({length:TYPES.length},()=>deck.next().type));
  for (const types of cycles) assert.deepEqual(types.slice().sort(), TYPES.slice().sort());
  assert.ok(new Set(cycles.map(types=>types.join(','))).size > 1);
});
test('the shared wallet grants math points up to 50 per game per JST day', () => {
  let wallet = score.initial();
  for (let i=0;i<55;i++) {
    const result=score.reward(wallet,GAME,true,'2026-11-21');
    assert.equal(result.granted,i<50?1:0);
    wallet=result.wallet;
  }
  assert.equal(wallet.balances.math,50);
  assert.equal(wallet.balances.english,0);
  wallet=score.reward(wallet,GAME,false,'2026-11-22').wallet;
  assert.equal(wallet.balances.math,50);
  assert.equal(score.reward(wallet,GAME,true,'2026-11-22').wallet.balances.math,51);
});
test('shared challenge unlocks at 25, runs 120 seconds and deduplicates answers', () => {
  let state = timer.fresh(GAME);
  for (let i=1;i<=25;i++) {
    state=timer.answer(state,timer.issue(state,'p'+i),true,0).state;
    assert.equal(state.unlocked,i===25);
  }
  state=timer.start(state,1000,'attempt','local');
  assert.equal(state.deadline,121000);
  const ticket=timer.issue(state,'question');
  state=timer.answer(state,ticket,true,1100).state;
  assert.equal(state.attemptBest,26);
  assert.equal(timer.answer(state,ticket,true,1101).accepted,false);
  assert.equal(timer.settle(state,121000).endReason,'timeout');
  const wrong=timer.answer(state,timer.issue(state,'next'),false,1200).state;
  assert.equal(wrong.phase,'ended');
  assert.equal(wrong.bests.local,26);
});
