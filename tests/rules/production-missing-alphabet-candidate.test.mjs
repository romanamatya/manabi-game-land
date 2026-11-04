import {after, before, test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc} from 'firebase/firestore';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baselinePath = path.join(root, 'firebase/production-console-backup-20261104.rules');
const candidatePath = path.join(root, 'firebase/production-missing-alphabet-candidate.rules');
const emulatorConfigPath = path.join(root, 'firebase/production-missing-alphabet-emulator.json');
const baseline = fs.readFileSync(baselinePath, 'utf8').replace(/\r\n/g, '\n');
const candidate = fs.readFileSync(candidatePath, 'utf8').replace(/\r\n/g, '\n');
const emulatorConfig = JSON.parse(fs.readFileSync(emulatorConfigPath, 'utf8'));
const projectId = 'demo-missing-alphabet-rules';
let testEnv;

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length - 1, 1, `expected exactly one baseline match: ${before.slice(0, 70)}`);
  return source.replace(before, after);
}
function replaceCount(source, before, after, count) {
  assert.equal(source.split(before).length - 1, count, `expected ${count} baseline matches: ${before.slice(0, 70)}`);
  return source.split(before).join(after);
}

function expectedCandidate(source) {
  source = replaceOnce(source,
    "        'exchangeAssociation','kotowaza','multiplicationProperties','shapeExpressions','keisanSummary','suichoku'];",
    "        'exchangeAssociation','kotowaza','multiplicationProperties','shapeExpressions','keisanSummary','suichoku','missingAlphabet'];");
  const distributionValidator = `      function validDistribution() {\n        return request.resource.data.distributionBestStreak is int\n          && request.resource.data.distributionBestStreak >= 0;\n      }`;
  source = replaceOnce(source, distributionValidator, `${distributionValidator}\n      function validMissingAlphabet() {\n        return request.resource.data.missingAlphabetBestStreak is int\n          && request.resource.data.missingAlphabetBestStreak >= 0;\n      }`);
  source = replaceCount(source,
    "          'alphabetBestStreak','distributionBestStreak','appearance','updatedAt'",
    "          'alphabetBestStreak','distributionBestStreak','missingAlphabetBestStreak','appearance','updatedAt'", 2);
  source = replaceOnce(source,
    "        && (!request.resource.data.keys().hasAny(['distributionBestStreak']) || validDistribution());",
    "        && (!request.resource.data.keys().hasAny(['distributionBestStreak']) || validDistribution())\n        && (!request.resource.data.keys().hasAny(['missingAlphabetBestStreak']) || validMissingAlphabet());");
  return replaceOnce(source,
    "        && (!request.resource.data.diff(resource.data).affectedKeys().hasAny(['distributionBestStreak'])\n          || (request.resource.data.keys().hasAny(['distributionBestStreak']) && validDistribution()\n            && request.resource.data.distributionBestStreak >= resource.data.get('distributionBestStreak', 0)));",
    "        && (!request.resource.data.diff(resource.data).affectedKeys().hasAny(['distributionBestStreak'])\n          || (request.resource.data.keys().hasAny(['distributionBestStreak']) && validDistribution()\n            && request.resource.data.distributionBestStreak >= resource.data.get('distributionBestStreak', 0)))\n        && (!request.resource.data.diff(resource.data).affectedKeys().hasAny(['missingAlphabetBestStreak'])\n          || (request.resource.data.keys().hasAny(['missingAlphabetBestStreak']) && validMissingAlphabet()\n            && request.resource.data.missingAlphabetBestStreak >= resource.data.get('missingAlphabetBestStreak', 0)));");
}

const profile = (nickname, score) => ({
  nickname,
  points: 9,
  bestStreak: 17,
  appearance: {icon: 'cat', frame: 'plain'},
  ...(score === undefined ? {} : {missingAlphabetBestStreak: score})
});
const anonymousDb = uid => testEnv.authenticatedContext(uid, {
  firebase: {sign_in_provider: 'anonymous'}
}).firestore();
const ranking = (uid, game = 'missingAlphabet', bestStreak = 20) => ({
  uid,
  game,
  nickname: 'Tester',
  bestStreak,
  icon: 'cat',
  frame: 'plain',
  title: 'Alphabet Explorer',
  badge: null,
  updatedAt: serverTimestamp()
});

before(async () => {
  assert.equal(emulatorConfig.firestore.rules, 'production-missing-alphabet-candidate.rules');
  assert.equal(candidate, expectedCandidate(baseline),
    'candidate must be the attached production Rules plus only the approved game/profile fields');
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {host: '127.0.0.1', port: 8089, rules: candidate}
  });
  await testEnv.clearFirestore();
});

after(async () => { await testEnv?.cleanup(); });

test('candidate uses the attached production Rules plus only the missing alphabet delta', () => {
  assert.equal(crypto.createHash('sha256').update(baseline).digest('hex'),
    '892038a6b25f2aa61fc754e0c40ea485bf304252ffaeef84a69232aefe9ea8c5');
  assert.match(candidate, /function productionManagementEnabled\(\)/);
  assert.match(candidate, /function productionAdminRenameEnabled\(\)/);
  assert.match(candidate, /allow delete: if false;/);
  assert.doesNotMatch(candidate, /answerHistory|learningAnalytics/);
});

test('owner can create a profile with zero and a nonnegative integer best streak', async () => {
  const db = anonymousDb('profile-zero');
  await assertSucceeds(setDoc(doc(db, 'players/profile-zero'), profile('Tester', 0)));
});

test('profile rejects negative, fractional, and nonnumeric best streak values', async () => {
  for (const [uid, score] of [['profile-negative', -1], ['profile-fraction', 1.5], ['profile-string', '3']]) {
    await assertFails(setDoc(doc(anonymousDb(uid), `players/${uid}`), profile('Tester', score)));
  }
});

test('owner can raise the profile best streak but cannot lower or remove it', async () => {
  const db = anonymousDb('profile-owner');
  const ref = doc(db, 'players/profile-owner');
  await testEnv.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'players/profile-owner'), profile('Tester', 3)));
  await assertSucceeds(updateDoc(ref, {missingAlphabetBestStreak: 4}));
  await assertFails(updateDoc(ref, {missingAlphabetBestStreak: 2}));
  await assertFails(updateDoc(ref, {missingAlphabetBestStreak: deleteField()}));
  const saved = await getDoc(ref);
  assert.equal(saved.data().missingAlphabetBestStreak, 4);
  assert.equal(saved.data().points, 9);
  assert.equal(saved.data().bestStreak, 17);
});

test('a different UID cannot create or change another player profile', async () => {
  await testEnv.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'players/profile-target'), profile('Tester', 3)));
  await assertFails(updateDoc(doc(anonymousDb('attacker'), 'players/profile-target'), {missingAlphabetBestStreak: 4}));
  await assertFails(setDoc(doc(anonymousDb('attacker'), 'players/profile-target'), profile('Attacker', 4)));
});

test('owner can create and read a missing alphabet shared ranking; another signed-in player can read it', async () => {
  const owner = anonymousDb('ranking-owner');
  await testEnv.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'players/ranking-owner'), profile('Tester', 20)));
  const ref = doc(owner, 'productionRankings/v1/games/missingAlphabet/players/ranking-owner');
  await assertSucceeds(setDoc(ref, ranking('ranking-owner')));
  await assertSucceeds(getDoc(doc(anonymousDb('ranking-reader'), 'productionRankings/v1/games/missingAlphabet/players/ranking-owner')));
});

test('shared ranking rejects malformed values, lower bests, unknown games, and other-UID writes', async () => {
  const owner = anonymousDb('ranking-guard');
  await testEnv.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'players/ranking-guard'), profile('Tester', 20)));
  const ref = doc(owner, 'productionRankings/v1/games/missingAlphabet/players/ranking-guard');
  await assertSucceeds(setDoc(ref, ranking('ranking-guard', 'missingAlphabet', 20)));
  await assertFails(updateDoc(ref, {bestStreak: 19, updatedAt: serverTimestamp()}));
  await assertFails(setDoc(doc(owner, 'productionRankings/v1/games/missingAlphabet/players/forged'), ranking('ranking-guard')));
  await assertFails(setDoc(doc(owner, 'productionRankings/v1/games/unknownGame/players/ranking-guard'), ranking('ranking-guard', 'unknownGame')));
  await assertFails(updateDoc(doc(anonymousDb('ranking-attacker'), 'productionRankings/v1/games/missingAlphabet/players/ranking-guard'), {bestStreak: 21, updatedAt: serverTimestamp()}));
});

test('existing keisan and suichoku ranking paths remain usable', async () => {
  for (const game of ['keisan', 'suichoku']) {
    const uid = `existing-${game}`;
    await testEnv.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), `players/${uid}`), profile('Tester')));
    await assertSucceeds(setDoc(doc(anonymousDb(uid), `productionRankings/v1/games/${game}/players/${uid}`), ranking(uid, game, 8)));
  }
});

test('unauthenticated ranking reads and non-admin game-setting writes remain denied', async () => {
  await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'productionRankings/v1/games/missingAlphabet/players/nope')));
  await assertFails(setDoc(doc(anonymousDb('settings-attacker'), 'productionAdmin/v1/gameSettings/missingAlphabet'), {
    status: 'published', updatedAt: serverTimestamp(), lastAudit: 'x', lastBackup: 'y'
  }));
});
