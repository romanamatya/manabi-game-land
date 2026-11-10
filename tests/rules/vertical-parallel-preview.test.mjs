import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as F from 'firebase/firestore';
import { createLineQuizCloud } from '../../shared-src/site/line-quiz-online.js';

const game = 'verticalParallel';
const projectId = 'demo-manabi-vertical-parallel';
const settings = db => F.doc(db, 'previewSpark/v1/gameSettings/' + game);
const score = (db, uid) => F.doc(db, 'previewSpark/v1/rankings/' + game + '/players/' + uid);
const player = (uid, bestStreak = 5) => ({
  uid, game, bestStreak, nickname: 'テスト', title: null, icon: 'cat', frame: 'plain', badge: null, updatedAt: F.serverTimestamp(),
});
let env;
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('Firestore Emulator required');
  env = await initializeTestEnvironment({ projectId,
    firestore: { rules: readFileSync('preview/firebase/firestore.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await F.setDoc(F.doc(db, 'previewSpark/v1/private/admin'), { uid: 'owner', enabled: true });
    await F.setDoc(F.doc(db, 'previewSpark/v1/private/revocation'), { after: F.Timestamp.fromMillis(1000) });
  });
});
after(async () => { await env?.cleanup(); });
const asPlayer = uid => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const asAdmin = (uid, auth_time) => env.authenticatedContext(uid, { auth_time, firebase: { sign_in_provider: 'password' } }).firestore();

test('only fresh authorized admin sessions can set the scoped preview visibility', async () => {
  const value = { status: 'published', updatedAt: F.serverTimestamp() };
  await assertFails(F.setDoc(settings(asPlayer('first')), value));
  await assertFails(F.setDoc(settings(asAdmin('other', 10)), value));
  await assertFails(F.setDoc(settings(asAdmin('owner', 1)), value));
  await assertFails(F.setDoc(settings(asAdmin('owner', 10)), { ...value, status: 'bad' }));
  await assertSucceeds(F.setDoc(settings(asAdmin('owner', 10)), value));
  await assertFails(F.getDoc(settings(env.unauthenticatedContext().firestore())));
});

test('shared projection is authenticated, owner-only, monotonic and restricted to the approved schema', async () => {
  const first = asPlayer('first');
  const cloud = createLineQuizCloud({ F, db: first, uid: 'first' });
  await assertSucceeds(cloud.publish({ bestStreak: 10, nickname: 'テスト', title: null }));
  await assertSucceeds(cloud.publish({ bestStreak: 3, nickname: 'テスト', title: null }));
  assert.equal((await createLineQuizCloud({ F, db: asPlayer('second') }).rows())[0].bestStreak, 10);
  await assertFails(createLineQuizCloud({ F, db: env.unauthenticatedContext().firestore() }).rows());
  await assertFails(F.setDoc(score(asPlayer('second'), 'first'), player('first', 20)));
  await assertFails(F.setDoc(score(first, 'first'), player('first', 4)));
  await assertFails(F.setDoc(score(first, 'first'), { ...player('first', 20), privateData: 'x' }));
  await assertFails(F.setDoc(score(first, 'first'), { ...player('first', 20), nickname: 'x'.repeat(40) }));
  await assertFails(F.setDoc(score(first, 'first'), { ...player('first', 20), uid: 'second' }));
  await assertFails(F.updateDoc(score(first, "first"), { title: F.deleteField(), updatedAt: F.serverTimestamp() }));
  await assertFails(F.deleteDoc(score(first, 'first')));
  await assertFails(F.setDoc(F.doc(first, 'productionRankings/v1/games/' + game + '/players/first'), player('first')));
  await assertFails(F.getDoc(F.doc(first, 'previewSpark/v1/players/second')));
});

test('hiding the new game stops its ranking writes but leaves older games unchanged', async () => {
  await assertSucceeds(F.setDoc(settings(asAdmin('owner', 10)), { status: 'hidden', updatedAt: F.serverTimestamp() }));
  const db = asPlayer('first');
  await assertFails(F.setDoc(score(db, 'first'), player('first', 25)));
  await assertSucceeds(F.setDoc(F.doc(db, 'previewSpark/v1/rankings/keisan/players/first'), { ...player('first'), game: 'keisan' }));
});
