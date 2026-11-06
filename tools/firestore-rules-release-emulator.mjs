import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, Timestamp } from 'firebase/firestore';

const production = process.env.RULES_PROFILE === 'production';
const profilePath = production ? 'players' : 'previewSpark/v1/players';
let env;
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.RULES_TEST_SOURCE) {
    throw new Error('An Emulator and a candidate Rules file are required');
  }
  env = await initializeTestEnvironment({
    projectId: 'demo-manabi-rules-release',
    firestore: { rules: readFileSync(process.env.RULES_TEST_SOURCE, 'utf8') },
  });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, profilePath, 'fixture-pupil'), { nickname: 'fixture', points: 42 });
    if (production) {
      await setDoc(doc(db, 'productionAdmin/v1/private/admin'), { uid: 'fixture-admin', enabled: true });
      await setDoc(doc(db, 'productionAdmin/v1/private/revocation'), { after: Timestamp.fromMillis(1_000) });
      await setDoc(doc(db, 'productionRankings/v1/games/keisan/players/fixture-pupil'), {
        uid: 'fixture-pupil', nickname: 'fixture', bestStreak: 3,
      });
    }
  });
});
after(async () => { await env?.cleanup(); });

for (const [name, read] of [
  ['get', db => getDoc(doc(db, profilePath, 'fixture-pupil'))],
  ['list', db => getDocs(collection(db, profilePath))],
  ['write', db => setDoc(doc(db, profilePath, 'fixture-pupil'), { points: 0 })],
]) test(`unauthenticated and unrelated anonymous users cannot ${name} private profiles`, async () => {
  for (const context of [
    env.unauthenticatedContext(),
    env.authenticatedContext('fixture-other', { firebase: { sign_in_provider: 'anonymous' } }),
  ]) {
    await assertFails(read(context.firestore()));
  }
});

if (production) {
  test('owner and authorized administrator retain their required reads', async () => {
    const owner = env.authenticatedContext('fixture-pupil', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
    const admin = env.authenticatedContext('fixture-admin', {
      auth_time: 10, firebase: { sign_in_provider: 'password' },
    }).firestore();
    await assertSucceeds(getDoc(doc(owner, profilePath, 'fixture-pupil')));
    await assertFails(getDocs(collection(owner, profilePath)));
    await assertSucceeds(getDocs(collection(admin, profilePath)));
  });

  test('anonymous ranking readers retain access to the separate ranking projection', async () => {
    const db = env.authenticatedContext('fixture-other', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
    await assertSucceeds(getDocs(collection(db, 'productionRankings/v1/games/keisan/players')));
  });
}
