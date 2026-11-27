import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { GAME, createDeck, checkInput, answerFields } from '../shared-src/site/fraction-transform-input-model.js';
import { backendConfig } from '../tools/site-environment.mjs';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const ctx = vm.createContext({ structuredClone });
vm.runInContext(read('shared-src/site/economy-core.js'), ctx);
const economy = ctx.ManabiEconomyCore;
const make = input => String(input);

test('20,000 numeric-input questions use the requested proportions, correct answers and shared validation', () => {
  let state = 33059;
  const deck = createDeck(() => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const counts = { improperToMixed: 0, improperToInteger: 0, mixedToImproper: 0 };
  let previous;
  for (let i = 0; i < 20000; i++) {
    const question = deck.next();
    const { type, n, k } = question.scorePrompt;
    counts[type]++;
    assert.ok(n >= 2 && n <= 9);
    const whole = Math.floor(k / n), top = k % n;
    const input = type === 'mixedToImproper' ? { top: make(k), bottom: make(n) }
      : type === 'improperToInteger' ? { whole: make(whole) }
        : { whole: make(whole), top: make(top), bottom: make(n) };
    const expected = type === 'mixedToImproper' ? k + '/' + n : top ? whole + 'と' + top + '/' + n : make(whole);
    assert.equal(question.answer, expected);
    assert.notEqual(question.prompt, previous);
    previous = question.prompt;
    const result = checkInput(question.direction, input);
    assert.equal(result.value, expected);
    const canonical = economy.canonicalPrompt(GAME, question.scorePrompt);
    assert.equal(economy.correct(GAME, canonical, result.value), true);
    assert.equal(economy.correct(GAME, canonical, expected + '0'), false);
    if (type === 'improperToInteger') {
      assert.equal(question.label, '仮分数 → 帯分数・整数');
      assert.deepEqual(answerFields(question.direction), ['whole', 'top', 'bottom']);
    }
  }
  assert.deepEqual(counts, { improperToMixed: 8000, improperToInteger: 4000, mixedToImproper: 8000 });
});

test('incomplete entries are editable; invalid complete forms cannot be scored as correct', () => {
  for (const answer of [{}, {whole:'2', top:'3'}, {whole:'2', bottom:'4'}, {top:'3', bottom:'4'}]) {
    assert.equal(checkInput('fromImproper', answer).incomplete, true);
  }
  assert.equal(checkInput('toImproper', { top:'11' }).incomplete, true);
  for (const answer of [{whole:'2', top:'0', bottom:'4'}, {whole:'2', top:'4', bottom:'4'}, {whole:'2', top:'1', bottom:'0'}]) {
    assert.equal(checkInput('fromImproper', answer).value, null);
  }
  assert.equal(checkInput('toImproper', {top:'11', bottom:'0'}).value, null);
  assert.equal(checkInput('fromImproper', {whole:'2'}).value, '2');
  assert.equal(economy.correct(GAME, {type:'mixedToImproper', n:4, k:6}, '3/2'), false);
  assert.throws(() => economy.canonicalPrompt(GAME, {type:'mixedToImproper', n:10, k:11}));
  assert.equal(economy.correct('fractionTransform', {type:'mixedToImproper', n:10, k:21}, '21/10'), true);
});

test('numeric input is preview-managed with distinct keys and a separate daily point cap', () => {
  const preview = backendConfig(JSON.parse(read('environments/preview.json')));
  const production = backendConfig(JSON.parse(read('environments/production.json')));
  assert.ok(preview.staticLocalGameIds.includes(GAME));
  assert.ok(preview.managedVisibilityGameIds.includes(GAME));
  assert.ok(!preview.rankingGameIds.includes(GAME) && !production.gameIds.includes(GAME) && !production.staticLocalGameIds.includes(GAME));
  assert.equal(economy.games[GAME], 'math');
  let wallet = economy.initial();
  for (let i = 0; i < 60; i++) wallet = economy.reward(wallet, GAME, true, '2026-11-27').wallet;
  wallet = economy.reward(wallet, 'fractionTransform', true, '2026-11-27').wallet;
  assert.equal(wallet.daily.games[GAME], 50);
  assert.equal(wallet.daily.games.fractionTransform, 1);
  assert.equal(wallet.balances.math, 51);
});
