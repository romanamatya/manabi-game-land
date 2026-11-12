import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as F from 'firebase/firestore';
import { createPreviewChallengeRanking } from '../../shared-src/site/challenge-ranking.js';

const titles = { parallelPair: '平行の王者', verticalParallel: '垂直・平行の覇王', quadrilateral: '四角形の覇王' };

for (const mode of ['preview', 'production']) {
  test(mode + ': private profiles, bounded reads, scoped and monotonic challenge writes', async () => {
    const production = mode === 'production';
    const root = production ? 'productionRankings/v1/challengeGames' : 'previewSpark/v1/challengeRankings';
    const profiles = production ? 'players' : 'previewSpark/v1/players';
    const settings = production ? 'productionAdmin/v1' : 'previewSpark/v1';
    const legacy = production ? 'productionRankings/v1/games' : 'previewSpark/v1/rankings';
    const env = await initializeTestEnvironment({
      projectId: 'demo-manabi-three-game-ranking',
      firestore: { rules: readFileSync('firebase/three-game-' + mode + '-candidate.rules', 'utf8') },
    });
    const as = uid => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
    const a = as('a'), b = as('b');
    const score = (db, game, uid = 'a') => F.doc(db, root, game, 'players', uid);
    const list = (db, game, count = 100) => F.query(F.collection(db, root, game, 'players'),
      F.orderBy('bestStreak', 'desc'), F.limit(count));
    const payload = (game, bestStreak, extra = {}) => ({
      game, bestStreak, uid: 'a', nickname: 'テストA', icon: 'cat', frame: 'plain',
      title: titles[game], badge: game + ':25', updatedAt: F.serverTimestamp(), ...extra,
    });
    try {
      await env.clearFirestore();
      await env.withSecurityRulesDisabled(async context => {
        const db = context.firestore();
        await F.setDoc(F.doc(db, profiles, 'a'), { nickname: 'テストA' });
        await F.setDoc(F.doc(db, settings + '/gameSettings/parallelPair'), { status: 'published' });
        await F.setDoc(F.doc(db, legacy, 'keisan', 'players', 'a'), { nickname: '既存の検証', bestStreak: 7 });
      });
      for (const [i, game] of Object.keys(titles).entries()) {
        const best = 29 + i;
        await assertFails(F.setDoc(score(a, game), payload(game, 25)));
        if (production) await assertSucceeds(F.setDoc(score(a, game), payload(game, best)));
        else await assertSucceeds(createPreviewChallengeRanking(F, a, 'a', game).publish(payload(game, best)));
        const read = await assertSucceeds(F.getDocs(list(b, game)));
        assert.deepEqual(read.docs.map(doc => [doc.data().game, doc.data().bestStreak]), [[game, best]]);
        await assertFails(F.setDoc(score(b, game), payload(game, best + 1)));
        await assertFails(F.setDoc(score(a, game), payload(game, best - 1)));
        await assertFails(F.setDoc(score(a, game), payload(game, best + 1, { privateField: 'private' })));
        await assertFails(F.setDoc(score(a, game), payload(game, best + 1, { uid: 'b' })));
        await assertFails(F.deleteDoc(score(a, game)));
        await assertFails(F.getDocs(list(b, game, 101)));
        await assertFails(F.getDocs(list(env.unauthenticatedContext().firestore(), game)));
        await assertSucceeds(F.setDoc(score(a, game), payload(game, best + 1)));
      }
      await assertFails(F.getDocs(F.collection(b, profiles)));
      await assertFails(F.getDoc(F.doc(b, profiles, 'a')));
      await assertFails(F.getDocs(list(b, 'keisan')));
      const old = await assertSucceeds(F.getDoc(F.doc(b, legacy, 'keisan', 'players', 'a')));
      assert.deepEqual(old.data(), { nickname: '既存の検証', bestStreak: 7 });
      const game = production ? 'parallelPair' : 'verticalParallel';
      await env.withSecurityRulesDisabled(ctx => F.setDoc(F.doc(ctx.firestore(), settings + '/gameSettings/' + game), { status: 'hidden' }));
      await assertFails(F.getDocs(list(b, game)));
      await assertFails(F.setDoc(score(a, game), payload(game, 35)));
    } finally {
      await env.cleanup();
    }
  });
}
