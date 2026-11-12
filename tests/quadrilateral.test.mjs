import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import '../shared-src/site/economy-core.js';
import '../shared-src/site/challenge120-core.js';
import '../shared-src/site/line-quiz-progress.js';
import { createQuestionDeck, GAME, WIDTH, HEIGHT } from '../shared-src/site/quadrilateral-model.js';

const core = globalThis.ManabiEconomyCore;
const challenge = globalThis.ManabiChallenge120Core;
const delta = ([x, y], [u, v]) => [x - u, y - v];
const dot = ([x, y], [u, v]) => x * u + y * v;
const det = ([x, y], [u, v]) => x * v - y * u;
const norm = point => Math.hypot(...point);
const close = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

test('15,000 seeded quadrilaterals preserve measurement, rotation, alternation and clear labels', () => {
  const variety = { lengths: new Set(), angles: new Set(), rotations: new Set(), targets: new Set() };
  const shapesByKind = new Map();
  for (let seed = 1; seed <= 10; seed++) {
    const deck = createQuestionDeck(seeded(seed));
    let previousShape;
    for (let index = 0; index < 1500; index++) {
      const q = deck.next(core, `${seed}-${index}`);
      assert.equal(q.kind, index % 2 ? 'angle' : 'length');
      if (index % 2) assert.notEqual(q.shape, previousShape);
      previousShape = q.shape;
      const combo = q.kind + q.shape;
      shapesByKind.set(combo, (shapesByKind.get(combo) || 0) + 1);
      const edges = q.vertices.map((p, i) => delta(q.vertices[(i + 1) % 4], p));
      const lengths = edges.map(norm);
      const degrees = edges.map((edge, i) => {
        const incoming = edges[(i + 3) % 4].map(n => -n);
        return Math.atan2(Math.abs(det(incoming, edge)), dot(incoming, edge)) * 180 / Math.PI;
      });
      close(det(edges[0], edges[2]), 0);
      close(det(edges[1], edges[3]), 0);
      close(lengths[0], lengths[2]);
      close(lengths[1], lengths[3]);
      close(degrees[0], degrees[2]);
      close(degrees[1], degrees[3]);
      close(degrees[0] + degrees[1], 180);
      if (q.shape === 'r') lengths.forEach(n => close(n, lengths[0]));
      else assert.ok(Math.abs(lengths[0] - lengths[1]) > 1);
      assert.ok(degrees.every(a => a >= 42 - 1e-8 && a <= 138 + 1e-8 && Math.abs(a - 90) > 10));
      const values = q.kind === 'length' ? lengths.map(n => n / q.scale) : degrees;
      for (const [i, n] of values.entries()) close(n, q.values[i]);
      const labels = [...q.vertexLabels, ...q.measureLabels];
      for (const [i, label] of labels.entries()) {
        const [x, y] = label.at;
        assert.ok(x > label.width / 2 && y > label.height / 2);
        assert.ok(x + label.width / 2 < WIDTH && y + label.height / 2 < HEIGHT);
        for (const other of labels.slice(i + 1)) {
          assert.ok(Math.abs(x - other.at[0]) > (label.width + other.width) / 2 ||
            Math.abs(y - other.at[1]) > (label.height + other.height) / 2);
        }
      }
      assert.ok(q.vertices.every(([x, y]) => x > 0 && y > 0 && x < WIDTH && y < HEIGHT));
      assert.deepEqual(q.vertexLabels.map(label => label.text), [...'ABCD']);
      const [unknown, opposite, adjacent] = q.measureLabels;
      assert.equal(unknown.index, q.target);
      assert.equal(unknown.text, '？');
      assert.equal(unknown.known, false);
      assert.equal(opposite.index, (q.target + 2) % 4);
      const singleLength = q.shape === 'r' && q.kind === 'length';
      assert.equal(q.measureLabels.length, singleLength ? 2 : 3);
      assert.equal(adjacent?.index, singleLength ? undefined : (q.target + 1) % 4);
      for (const item of q.measureLabels.slice(1)) {
        assert.equal(item.known, true);
        assert.equal(item.text, Math.round(values[item.index]) + (q.kind === 'length' ? ' cm' : '°'));
      }
      assert.equal(q.targetName, q.kind === 'length'
        ? 'ABCD'[q.target] + 'ABCD'[(q.target + 1) % 4] : 'ABCD'[q.target]);
      close(values[unknown.index], values[opposite.index]);
      assert.ok(core.correct(GAME, { id: q.id }, { number: q.answer }));
      assert.equal(core.correct(GAME, { ...q, answer: q.answer + 1 }, { number: q.answer + 1 }), false);
      assert.equal(q.arcs.length, q.kind === 'angle' ? 3 : 0);
      for (const arc of q.arcs) {
        const start = delta(arc.from, q.vertices[arc.index]);
        const end = delta(arc.to, q.vertices[arc.index]);
        close(norm(start), arc.radius);
        close(norm(end), arc.radius);
        close(det(start, edges[arc.index]), 0);
        close(det(end, edges[(arc.index + 3) % 4]), 0);
        assert.ok(dot(start, edges[arc.index]) > 0 && dot(end, edges[(arc.index + 3) % 4]) < 0);
        close(Math.atan2(det(start, end), dot(start, end)) * 180 / Math.PI, degrees[arc.index]);
      }
      variety.lengths.add(q.u);
      variety.angles.add(q.angle);
      variety.rotations.add(Math.floor(q.rotation / (Math.PI / 8)));
      variety.targets.add(q.target);
    }
  }
  assert.deepEqual(Object.values(variety).map(set => set.size), [13, 74, 16, 4]);
  for (const count of shapesByKind.values()) assert.ok(count > 3500 && count < 4000);
});

test('the shared progress and economy persist best, unlock 120 seconds, and cap this game at 50 points', async () => {
  const memory = new Map();
  const storage = { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) };
  const day = core.dayKey();
  let now = 1000;
  let wallet = core.initial();
  let id = 0;
  const economy = {
    begin: (game, prompt) => ({ game, prompt, id: String(++id) }),
    answer(context, value) {
      wallet = core.reward(wallet, context.game, core.correct(context.game, context.prompt, value), day, context.policy).wallet;
    },
  };
  const titles = [3, 5, 10, 15, 25].map(at => ({ at }));
  const settings = { storage, economy, challenge, core, titles, game: GAME, now: () => now,
    monotonic: () => 0, locks: null, uuid: () => 'attempt-1', answerValue: number => ({ number }), season: 'quadrilateral-v1' };
  const progress = globalThis.ManabiLineQuizProgress.createProgress(settings);
  const deck = createQuestionDeck(seeded(7));
  const earn = async () => {
    const q = deck.next(core, String(id));
    const attempt = progress.begin(q);
    const result = await progress.answer(attempt, q.answer);
    assert.equal(result.correct, true);
    assert.equal((await progress.answer(attempt, q.answer)).accepted, false);
    return result.title?.at;
  };
  const awarded = [];
  for (let n = 0; n < 25; n++) {
    const title = await earn();
    if (title) awarded.push(title);
  }
  assert.deepEqual(awarded, [3, 5, 10, 15, 25]);
  assert.equal(progress.read().challenge.phase, 'waiting');
  now += 121000;
  assert.equal(progress.read().challenge.phase, 'waiting');
  await progress.start();
  assert.equal(progress.read().challenge.deadline - now, 120000);
  for (let n = 0; n < 26; n++) await earn();
  assert.equal(wallet.balances.math, 50);
  assert.equal(wallet.daily.games[GAME], 50);
  assert.equal(wallet.balances.english, 0);
  assert.equal(globalThis.ManabiLineQuizProgress.createProgress(settings).read().best, 51);
  const wrong = deck.next(core, String(id));
  assert.equal((await progress.answer(progress.begin(wrong), wrong.answer + 1)).correct, false);
  assert.equal(progress.read().challenge.endReason, 'wrong-answer');
  await progress.start();
  now += 120000;
  assert.equal(progress.read().challenge.endReason, 'timeout');
  assert.equal(progress.read().best, 51);
});

test('the game ships as a standalone release in preview and production without a ranking registration', async () => {
  const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
  const preview = JSON.parse(await read('environments/preview.json'));
  const production = JSON.parse(await read('environments/production.json'));
  assert.ok(preview.staticLocalGameIds.includes(GAME));
  for (const config of [preview, production]) assert.ok(!config.rankingGameIds.includes(GAME));
  assert.ok(!production.staticLocalGameIds?.includes(GAME) && !production.gameIds.includes(GAME));
  assert.match(await read('preview/math.html'), /href="games\/quadrilateral\.html"/);
  assert.doesNotMatch(await read('.release/production/math.html'), /href="games\/quadrilateral\.html"/);
  assert.match(await read('environment.js'), /"staticLocalGameIds":\[[^\]]*"quadrilateral"/);
  assert.match(await read('games/quadrilateral.html'), /href="\.\.\/math-geometry\.html"/);
  assert.equal(await read('quadrilateral-game.js'), await read('shared-src/site/quadrilateral-game.js'));
  assert.equal(await read('quadrilateral-model.js'), await read('shared-src/site/quadrilateral-model.js'));
});
