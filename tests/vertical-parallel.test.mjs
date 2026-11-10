import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import '../shared-src/site/economy-core.js';
import '../shared-src/site/challenge120-core.js';
import '../shared-src/site/line-quiz-model.js';
import '../shared-src/site/line-quiz-progress.js';
import { previewLineQuizEnabled } from '../shared-src/site/line-quiz-online.js';

const core = globalThis.ManabiEconomyCore;
const model = globalThis.ManabiLineQuiz;
const challenge = globalThis.ManabiChallenge120Core;
const { createProgress } = globalThis.ManabiLineQuizProgress;
const { game } = model;
const context = { window: {} };
vm.runInNewContext(readFileSync('shared-src/site/profile-catalog.js', 'utf8'), context);
const titles = context.window.ManabiProfileCatalog.find(entry => entry.id === game).titles;
const cross = (a, b) => a.dx * b.dy - a.dy * b.dx;
const dot = (a, b) => a.dx * b.dx + a.dy * b.dy;
let seed = 0x12ad9873;
const rng = () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 2 ** 32);
const build = (id, level = 'beginner', relation = 'parallel', count = 1) =>
  model.buildQuestion({ id, level, relation, count, rng });

test('15,000 randomized questions: independently verify all 21 pairs, exact answers, labels and touch clearance', () => {
  for (const level of ['beginner', 'intermediate', 'advanced']) {
    for (const [relation, count] of model.modes) {
      const refIndexes = new Set();
      for (let n = 0; n < 1250; n++) {
        const q = build(String(n), level, relation, count);
        assert.equal(q.lines.length, 7);
        refIndexes.add(q.reference);
        const base = q.lines[q.reference];
        const answers = [];
        for (const [i, a] of q.lines.entries()) {
          if (i !== q.reference && (relation === 'parallel' ? cross(base, a) : dot(base, a)) === 0) answers.push(i);
          for (const b of q.lines.slice(i + 1)) {
            if (cross(a, b) === 0) assert.notEqual(cross(a, { dx: b.x - a.x, dy: b.y - a.y }), 0);
          }
          const { start, end } = q.segments[i];
          for (const p of [start, end]) {
            assert.ok(Math.abs(cross(a, { dx: p.x - a.x, dy: p.y - a.y })) < 1e-8);
          }
          const label = q.labelPoints[i];
          assert.ok(label.x >= 14 && label.x <= model.WIDTH - 14 && label.y >= 14 && label.y <= model.HEIGHT - 14);
          for (const [j, other] of q.labelPoints.entries()) {
            if (i !== j) {
              assert.ok(Math.hypot(label.x - other.x, label.y - other.y) >= 36);
              assert.ok(model.distanceToSegment(label, q.segments[j]) >= 20);
            }
          }
          let span = 0, longest = 0;
          for (let k = 1; k <= 19; k++) {
            const p = { x: start.x + (end.x - start.x) * k / 20, y: start.y + (end.y - start.y) * k / 20 };
            span = model.nearestLine(q.segments, p, 24, 23.9) === i &&
              q.labelPoints.every(label => Math.hypot(p.x - label.x, p.y - label.y) >= 22) ? span + 1 : 0;
            longest = Math.max(longest, span);
          }
          assert.ok(longest >= 3, 'line must offer a clear tappable stretch');
        }
        assert.equal(answers.length, count);
        assert.deepEqual(core.lineQuizAnswers(q), answers);
        assert.equal(core.correct(game, q, { selection: answers.toReversed() }), true);
        assert.equal(core.correct(game, q, { selection: [q.reference, ...answers.slice(1)] }), false);
        assert.equal(core.correct(game, q, { selection: [answers[0], answers[0]] }), false);
      }
      assert.equal(refIndexes.size, 7);
    }
  }
});

test('invalid exact counts and coincident lines fail before economy rewards', () => {
  const q = build('validation');
  assert.throws(() => core.canonicalPrompt(game, { ...q, count: 2 }), /answer-count/);
  q.lines[6] = { ...q.lines[0] };
  assert.throws(() => core.canonicalPrompt(game, q), /duplicate-line/);
});

test('preview is scoped to its Firebase project and the new game is excluded from the production catalog', () => {
  const read = path => JSON.parse(readFileSync(path, 'utf8'));
  const preview = read('environments/preview.json');
  const production = read('environments/production.json');
  assert.ok(preview.gameIds.includes(game));
  assert.ok(!production.gameIds.includes(game));
  assert.ok(!production.rankingGameIds.includes(game));
  const env = { preview: true, expectedProjectId: preview.projectId };
  assert.equal(previewLineQuizEnabled({ ...preview, mode: 'preview' }, env), true);
  assert.equal(previewLineQuizEnabled({ ...production, mode: 'preview' }, env), false);
  assert.equal(previewLineQuizEnabled({ ...preview, mode: 'preview' }, { ...env, preview: false }), false);
});

test('titles, wrong-answer reset, duplicate rejection, timed play, retained best and daily cap', async () => {
  let now = 1_700_000_000_000;
  let sequence = 0;
  let wallet = core.initial();
  const disk = new Map([['mgl_parallelPair', 'existing-record']]);
  const storage = { getItem: key => disk.get(key) || null, setItem: (key, value) => disk.set(key, value) };
  const economy = {
    begin: (game, prompt) => ({ game, prompt, id: 'attempt-' + ++sequence }),
    async answer(context, value) {
      assert.equal(core.correct(context.game, context.prompt, value), true);
      wallet = core.reward(wallet, context.game, true, core.dayKey(now), context.policy).wallet;
    },
  };
  const options = { storage, economy, challenge, core, titles, game, now: () => now,
    monotonic: () => 0, uuid: () => 'challenge-' + ++sequence };
  let progress = createProgress(options);
  const q = build('points');
  const correct = core.lineQuizAnswers(q);
  const wrong = [q.reference];
  assert.equal((await progress.answer(progress.begin(q), wrong)).correct, false);
  assert.equal(progress.read().streak, 0);
  const earned = [];
  for (let i = 0; i < 25; i++) {
    const attempt = progress.begin(q);
    const result = await progress.answer(attempt, correct);
    assert.equal(result.correct, true);
    if (result.title) earned.push(result.title.at);
    assert.equal((await progress.answer(attempt, correct)).accepted, false);
  }
  assert.deepEqual(earned, [3, 5, 10, 15, 25]);
  assert.equal(progress.read().challenge.phase, 'waiting');
  assert.equal(progress.read().challenge.deadline, null);
  await progress.start();
  assert.equal(progress.read().challenge.deadline, now + 120000);
  assert.equal(progress.read().streak, 25);
  for (let i = 0; i < 30; i++) assert.equal((await progress.answer(progress.begin(q), correct)).correct, true);
  assert.equal(wallet.balances.math, 50);
  assert.equal(wallet.daily.games[game], 50);
  assert.equal(wallet.daily.games.parallelPair, undefined);
  assert.equal(wallet.balances.english, 0);
  assert.equal(disk.get('mgl_parallelPair'), 'existing-record');
  now += 120000;
  progress = createProgress(options);
  assert.equal(progress.read().challenge.endReason, 'timeout');
  assert.equal(progress.read().best, 55);
  await progress.start();
  assert.equal((await progress.answer(progress.begin(q), wrong)).correct, false);
  assert.equal(progress.read().challenge.endReason, 'wrong-answer');
  assert.equal(progress.read().best, 55);
});

test('all approved 512px badges are included verbatim in the preview', () => {
  for (const title of titles) {
    const source = readFileSync('shared-src/site/' + title.image);
    assert.deepEqual(readFileSync('preview/' + title.image), source);
    assert.equal(source.readUInt32BE(16), 512);
    assert.equal(source.readUInt32BE(20), 512);
    assert.equal(source[25], 6);
  }
});
