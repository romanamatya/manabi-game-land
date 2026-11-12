import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { challengeBest } from '../shared-src/site/challenge-ranking.js';

test('challenge ranking excludes practice, the inherited 25, and another game', () => {
  for (const game of ['parallelPair', 'verticalParallel', 'quadrilateral']) {
    const data = { game, protocol: 2, phase: 'running', attemptId: 'active', attemptBest: 25, practiceStreak: 99, best: 99 };
    assert.equal(challengeBest(game, data), 0);
    assert.equal(challengeBest(game, { ...data, attemptBest: 27 }), 27);
    assert.equal(challengeBest(game, { ...data, attemptBest: 26, bests: { earlier: 32 } }), 32);
    assert.equal(challengeBest('keisan', data), 0);
    assert.equal(challengeBest(game, { ...data, game: 'keisan' }), 0);
  }
});

test('each candidate changes only the dedicated challenge collection', () => {
  for (const [env, base, path] of [
    ['preview', 'preview/firebase/firestore.rules', 'previewSpark/v1/challengeRankings'],
    ['production', 'firebase/production-release-baseline.rules', 'productionRankings/v1/challengeGames'],
  ]) {
    const candidate = readFileSync('firebase/three-game-' + env + '-candidate.rules', 'utf8');
    const start = candidate.indexOf('    // Separate challenge records');
    const end = candidate.indexOf('\n    }', candidate.indexOf('allow delete: if false;', start)) + 6;
    assert.ok(start >= 0 && end > start);
    assert.match(candidate.slice(start, end), new RegExp(path));
    assert.equal(candidate.slice(0, start) + candidate.slice(end).replace(/^\r?\n\r?\n/, ''), readFileSync(base, 'utf8'));
  }
});
