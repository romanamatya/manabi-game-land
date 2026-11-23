import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createDeck, TYPES} from '../shared-src/site/fraction-transform-model.js';

test('12,000 conversions are balanced and have exactly one mathematical answer', () => {
 let seed = 373;
 const deck = createDeck(() => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2**32);
 const ctx = {structuredClone};
 vm.runInNewContext(readFileSync('shared-src/site/economy-core.js','utf8'),ctx);
 const core = ctx.ManabiEconomyCore;
 const counts = Object.fromEntries(TYPES.map(type=>[type,0]));
 let previous;
 for (let index=0; index<12000; index++) {
  const q = deck.next(), {n,k,type} = q.scorePrompt;
  assert.ok(n>=2 && n<=9);
  for (const text of [q.prompt, q.answer, q.explanation, ...q.options]) {
   for (const [, denominator] of text.matchAll(/\d+\/(\d+)/g)) {
    assert.match(denominator, /^[1-9]$/, text);
   }
  }
  assert.notEqual(type,previous);
  previous=type;
  counts[type]++;
  assert.equal(q.options.length,4);
  assert.equal(new Set(q.options).size,4);
  const matching = q.options.filter(option=>{
   const [mixed, denominator] = option.split('/');
   if (!denominator) return Number(mixed)*n===k && type==='improperToInteger';
   assert.equal(Number(denominator),n);
   if (!mixed.includes('と')) return Number(mixed)===k && type==='mixedToImproper';
   const [whole, top] = mixed.split('と').map(Number);
   assert.ok(top>0 && top<n);
   return whole*n+top===k && type==='improperToMixed';
  });
  assert.deepEqual(matching,[q.answer]);
  const prompt = core.canonicalPrompt('fractionTransform',q.scorePrompt);
  for (const option of q.options) assert.equal(core.correct('fractionTransform',prompt,option),option===q.answer);
 }
 assert.deepEqual(Object.values(counts),[4000,4000,4000]);
});
