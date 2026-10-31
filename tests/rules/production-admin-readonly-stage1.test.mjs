import {after, before, beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import * as F from 'firebase/firestore';

const projectId = 'demo-manabi-prod-admin-stage1';
const rulesPath = new URL('../../firebase/production-admin-readonly-stage1.rules', import.meta.url);
const adminPath = 'productionAdmin/v1/private/admin';
const revocationPath = 'productionAdmin/v1/private/revocation';
let env;

const authed = (uid, provider='password') => env.authenticatedContext(uid, {
  firebase: {sign_in_provider: provider}
}).firestore();
const adminDb = () => authed('admin-uid');
const playerDoc = (db, uid='child-uid') => F.doc(db, 'players', uid);
const rankingDoc = (db, uid='child-uid', game='keisan') =>
  F.doc(db, 'productionRankings/v1/games', game, 'players', uid);
const rankingRow = (uid='child-uid', game='keisan', bestStreak=8) => ({
  uid, game, nickname: 'はる', bestStreak,
  icon: 'cat', frame: 'plain', title: '計算名人', badge: 'keisan:5',
  updatedAt: F.serverTimestamp()
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: 8180,
      rules: await readFile(rulesPath, 'utf8')
    }
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await F.setDoc(F.doc(db, adminPath), {uid: 'admin-uid', enabled: true, renameEnabled: false});
    await F.setDoc(F.doc(db, revocationPath), {after: F.Timestamp.fromMillis(1000)});
    await F.setDoc(playerDoc(db), {
      nickname: 'はる', points: 12, bestStreak: 8,
      distributionBestStreak: 4, appearance: {icon: 'cat'}, updatedAt: 100
    });
  });
});

after(async () => env?.cleanup());

test('matching password admin may read its role and revocation documents', async () => {
  const db = adminDb();
  assert.equal((await assertSucceeds(F.getDoc(F.doc(db, adminPath)))).data().enabled, true);
  assert.equal((await assertSucceeds(F.getDoc(F.doc(db, revocationPath)))).exists(), true);
});

test('unauthenticated, anonymous, other-password, and same-UID Google users cannot read admin documents', async () => {
  const contexts = [
    env.unauthenticatedContext().firestore(),
    authed('admin-uid', 'anonymous'),
    authed('other-uid', 'password'),
    authed('admin-uid', 'google.com')
  ];
  for (const db of contexts) {
    await assertFails(F.getDoc(F.doc(db, adminPath)));
    await assertFails(F.getDoc(F.doc(db, revocationPath)));
  }
});

test('admin identity collection cannot be listed or changed, including by the admin', async () => {
  const db = adminDb();
  await assertFails(F.getDocs(F.collection(db, 'productionAdmin/v1/private')));
  await assertFails(F.setDoc(F.doc(db, adminPath), {uid: 'admin-uid', enabled: false}));
  await assertFails(F.updateDoc(F.doc(db, revocationPath), {after: F.Timestamp.now()}));
  await assertFails(F.deleteDoc(F.doc(db, revocationPath)));
});

test('administrator can read a player record but cannot change or delete child data', async () => {
  const db = adminDb();
  const ref = playerDoc(db, 'child-uid');
  const before = (await assertSucceeds(F.getDoc(ref))).data();
  await assertFails(F.updateDoc(ref, {points: 0}));
  await assertFails(F.updateDoc(ref, {nickname: '変更不可'}));
  await assertFails(F.deleteDoc(ref));
  assert.deepEqual((await assertSucceeds(F.getDoc(ref))).data(), before);
});

test('existing authenticated player reads and own-player writes remain compatible; signed-out reads fail', async () => {
  const child = authed('child-uid', 'anonymous');
  await assertSucceeds(F.getDoc(playerDoc(child)));
  await assertSucceeds(F.getDocs(F.collection(child, 'players')));
  await assertSucceeds(F.updateDoc(playerDoc(child), {bestStreak: 9, distributionBestStreak: 5}));
  await assertFails(F.getDoc(playerDoc(env.unauthenticatedContext().firestore())));
});

test('shared ranking reads remain available to another authenticated child and records cannot be lowered or deleted', async () => {
  const child = authed('child-uid', 'anonymous');
  const other = authed('other-child', 'anonymous');
  const ref = rankingDoc(child);
  await assertSucceeds(F.setDoc(ref, rankingRow()));
  const rows = await assertSucceeds(F.getDocs(F.collection(other, 'productionRankings/v1/games/keisan/players')));
  assert.equal(rows.size, 1);
  assert.equal(rows.docs[0].data().bestStreak, 8);
  await assertFails(F.updateDoc(ref, {bestStreak: 7, updatedAt: F.serverTimestamp()}));
  await assertFails(F.deleteDoc(ref));
});

test('rankings reject non-owner writes and invalid schema without changing existing rows', async () => {
  const child = authed('child-uid', 'anonymous');
  const other = authed('other-child', 'anonymous');
  const ref = rankingDoc(child);
  await assertSucceeds(F.setDoc(ref, rankingRow()));
  await assertFails(F.updateDoc(rankingDoc(other), {bestStreak: 99, updatedAt: F.serverTimestamp()}));
  await assertFails(F.setDoc(rankingDoc(other, 'not-a-game'), rankingRow('other-child', 'not-a-game', 99)));
  await assertFails(F.updateDoc(ref, {points: 999, updatedAt: F.serverTimestamp()}));
  assert.equal((await assertSucceeds(F.getDoc(ref))).data().bestStreak, 8);
});
