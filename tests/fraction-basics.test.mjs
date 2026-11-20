import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPES, createQuestion, createDeck } from '../shared-src/site/fraction-basics-model.js';

function random(seed = 123456) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}
test('12 review formats have one correct response and four distinct choices', () => {
  const rng = random();
  assert.equal(TYPES.length, 12);
  for (const type of TYPES) {
    for (let i = 0; i < 300; i++) {
      const q = createQuestion(type, rng);
      assert.equal(q.type, type);
      assert.ok(q.prompt && q.explanation && q.answer);
      if (q.visual?.interactive) {
        assert.equal(q.options.length, 0);
        assert.equal(q.answer, String(q.visual.k));
        assert.ok(q.visual.k > 0 && q.visual.k < q.visual.n * 2);
      } else {
        assert.equal(q.options.length, 4, type);
        assert.equal(new Set(q.options).size, 4, type);
        assert.equal(q.options.filter(value => value === q.answer).length, 1, type);
      }
      if (q.visual && q.type.startsWith('read')) {
        assert.equal(q.visual.filled, q.visual.k);
        assert.equal(q.answer, q.visual.k + '/' + q.visual.n);
      }
      if (q.type === 'line') assert.equal(q.answer, q.visual.k + '/' + q.visual.n);
      if (q.type === 'compare') {
        assert.equal(Number(q.answer.split('/')[0]), Math.max(...q.options.map(s => Number(s.split('/')[0]))));
      }
      if (q.type === 'toFraction') assert.equal(Number(q.prompt.slice(0, 3)), Number(q.answer.split('/')[0]) / 10);
      if (q.type === 'toDecimal') assert.equal(Number(q.answer), Number(q.prompt.split('/')[0]) / 10);
      if (q.type === 'add' || q.type === 'subtract') {
        const nums = q.prompt.match(/\d+/g).map(Number);
        assert.equal(nums[1], nums[3]);
        assert.equal(nums[1], Number(q.answer.split('/')[1]));
        assert.equal(Number(q.answer.split('/')[0]), q.type === 'add' ? nums[0] + nums[2] : nums[0] - nums[2]);
      }
    }
  }
});
test('each deck cycle includes every format once', () => {
  const deck = createDeck(random(2026));
  for (let cycle = 0; cycle < 4; cycle++) {
    const seen = Array.from({ length: TYPES.length }, () => deck.next().type);
    assert.deepEqual(seen.slice().sort(), TYPES.slice().sort());
  }
});
