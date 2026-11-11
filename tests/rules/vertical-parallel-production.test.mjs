import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import * as F from 'firebase/firestore';
import { createManagementStore } from '../../management-store.js';
import { createProductionRankingClient } from '../../ranking-sync-api.js';

const projectId = 'demo-manabi-vertical-parallel-production';
const game = 'verticalParallel';
const settings = (db, id = game) => F.doc(db, 'productionAdmin/v1/gameSettings', id);
const score = (db, uid, id = game) => F.doc(db, 'productionRankings/v1/games', id, 'players', uid);
const profile = (db, uid) => F.doc(db, 'players', uid);
const student = uid => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const admin = (auth_time = 200) => env.authenticatedContext('admin', {
  auth_time, firebase: { sign_in_provider: 'password' },
}).firestore();
const row = (uid, bestStreak = 27) => ({
  uid, game, bestStreak, nickname: 'そら', title: '垂直・平行の覇王',
  icon: 'cat', frame: 'plain', badge: 'verticalParallel:25', updatedAt: F.serverTimestamp(),
});
let env;

before(async () => {
  const rules = await readFile('firebase/vertical-parallel-production-candidate.rules', 'utf8');
  env = await initializeTestEnvironment({ projectId, firestore: { rules } });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all([
      F.setDoc(F.doc(db, 'productionAdmin/v1/private/admin'), { uid: 'admin', enabled: true, managementEnabled: true }),
      F.setDoc(F.doc(db, 'productionAdmin/v1/private/revocation'), { after: F.Timestamp.fromMillis(100000) }),
      F.setDoc(profile(db, 'profile-a'), { nickname: 'そら', rankingUid: 'rank-a', points: 135, appearance: { icon: 'cat' } }),
      F.setDoc(profile(db, 'profile-b'), { nickname: 'うみ', points: 42 }),
      F.setDoc(F.doc(db, 'productionRankings/v1/identityLinks/rank-a'), { uid: 'rank-a', profileUid: 'profile-a' }),
      F.setDoc(settings(db, 'keisan'), { status: 'published' }),
      F.setDoc(score(db, 'rank-a', 'keisan'), { ...row('rank-a', 12), game: 'keisan', badge: null }),
    ]);
  });
});
after(async () => { await env?.cleanup(); });

async function rankingClient() {
  const apps = [];
  const config = {
    mode: 'production', expectedProjectId: 'manabi-game-land', firebase: { projectId: 'manabi-game-land' },
    rankingSyncEnabled: true, playerNameSyncEnabled: true, verticalParallelManagedEnabled: true, rankingGameIds: [game],
  };
  const App = {
    getApps: () => apps,
    initializeApp(options, name = '[DEFAULT]') {
      const app = { options, name };
      apps.push(app);
      return app;
    },
  };
  const uidFor = app => app.name === '[DEFAULT]' ? 'profile-a' : 'rank-a';
  const Auth = {
    getAuth: app => ({ currentUser: { uid: uidFor(app), isAnonymous: true }, authStateReady: async () => {} }),
    setPersistence: async () => {},
  };
  return createProductionRankingClient(config, [App, Auth, { ...F, getFirestore: app => student(uidFor(app)) }]);
}

test('the production ranking client saves the linked owner’s best and exposes only ranking fields', async () => {
  const a = student('rank-a'), b = student('rank-b');
  const api = await rankingClient();
  assert.equal(await api.ensurePlayerLink('そら'), 'そら');
  const { uid, updatedAt, ...input } = row('rank-a');
  assert.equal((await assertSucceeds(api.publishRanking(input))).bestStreak, 27);
  assert.equal((await assertSucceeds(api.publishRanking({ ...input, bestStreak: 26 }))).bestStreak, 27);
  const query = F.query(F.collection(b, 'productionRankings/v1/games', game, 'players'), F.orderBy('bestStreak', 'desc'), F.limit(100));
  const shared = (await assertSucceeds(F.getDocs(query))).docs[0].data();
  assert.deepEqual(Object.keys(shared).sort(), Object.keys(row('rank-a')).sort());
  assert.equal(shared.bestStreak, 27);
  await assertFails(F.getDoc(profile(b, 'profile-a')));
  await assertFails(F.getDocs(F.collection(b, 'players')));
  await assertFails(F.getDocs(F.collection(env.unauthenticatedContext().firestore(), 'productionRankings/v1/games', game, 'players')));
  await assertFails(F.setDoc(score(b, 'rank-a'), row('rank-a', 30)));
  await assertFails(F.setDoc(score(b, 'rank-b'), row('rank-b', 30)));
  for (const bad of [{ bestStreak: 26 }, { nickname: '別人' }, { points: 1 }, { bestStreak: '30' }, { badge: null }, { uid: 'rank-b' }]) {
    await assertFails(F.setDoc(score(a, 'rank-a'), { ...row('rank-a', 30), ...bad }));
  }
  await assertFails(F.deleteDoc(score(a, 'rank-a')));
});

test('fresh admin can atomically hide and republish only the line quiz while preserving records', async () => {
  const a = student('rank-a'), b = student('rank-b'), db = admin();
  const toggle = (connection, status, uid = 'admin', games = [game]) =>
    createManagementStore('production', F, connection).mutate({ uid }, 'visibilityBatch', { games, status });
  assert.equal((await F.getDoc(settings(a))).exists(), false);
  await assertFails(toggle(a, 'hidden', 'rank-a'));
  await assertFails(toggle(admin(100), 'hidden'));
  await assertFails(F.setDoc(settings(db), { status: 'hidden', updatedAt: F.serverTimestamp() }));
  await assert.rejects(toggle(db, 'hidden', 'admin', [game, 'keisan']), /invalid-visibility-batch/);

  const result = await assertSucceeds(toggle(db, 'hidden'));
  assert.equal((await F.getDoc(settings(b))).data().status, 'hidden');
  assert.deepEqual((await F.getDoc(F.doc(db, 'productionAdmin/v1/managementAudit', result.auditId))).data().targets,
    ['productionAdmin/v1/gameSettings/verticalParallel']);
  assert.equal((await F.getDoc(F.doc(db, 'productionAdmin/v1/managementBackups', result.backupId))).data().beforeByGame[game], null);
  await assertFails(F.getDoc(score(b, 'rank-a')));
  await assertFails(F.setDoc(score(a, 'rank-a'), row('rank-a', 30)));
  assert.equal((await F.getDoc(score(b, 'rank-a', 'keisan'))).data().bestStreak, 12);
  assert.equal((await F.getDoc(settings(b, 'keisan'))).data().status, 'published');

  await assertSucceeds(toggle(db, 'published'));
  assert.equal((await F.getDoc(score(b, 'rank-a'))).data().bestStreak, 27);
  await assertSucceeds(F.setDoc(score(a, 'rank-a'), row('rank-a', 30)));
  assert.equal((await F.getDoc(score(b, 'rank-a'))).data().bestStreak, 30);
  assert.equal((await F.getDoc(profile(student('profile-a'), 'profile-a'))).data().points, 135);
});
