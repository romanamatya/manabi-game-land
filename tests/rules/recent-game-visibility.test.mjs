import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as F from 'firebase/firestore';
import { ADDITIONAL_VISIBILITY_GAME_IDS as recent, GAME_IDS } from '../../management-model.js';
import { createManagementStore } from '../../management-store.js';

const root = 'productionAdmin/v1';
const adminUid = 'visibility-admin';
const base = 'demo-manabi-recent-visibility';
const signedIn = { firebase: { sign_in_provider: 'password' }, auth_time: 200 };
const learner = { firebase: { sign_in_provider: 'anonymous' }, auth_time: 200 };
let env, admin, child;
const setting = (db,id) => F.doc(db,root+'/gameSettings/'+id);

async function seed(testEnv) {
  await testEnv.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    await F.setDoc(F.doc(db,root+'/private/admin'),{uid:adminUid,enabled:true,managementEnabled:true});
    await F.setDoc(F.doc(db,root+'/private/revocation'),{after:F.Timestamp.fromMillis(1000)});
    await F.setDoc(setting(db,'keisan'),{status:'published'});
  });
}
function connect(rules, projectId=base) {
  return readFile(new URL('../../firebase/'+rules,import.meta.url),'utf8')
    .then(rules => initializeTestEnvironment({projectId,firestore:{rules}}));
}
before(async () => {
  env=await connect('production-fraction-visibility-candidate.rules');
  await seed(env);
  admin=env.authenticatedContext(adminUid,signedIn).firestore();
  child=env.authenticatedContext('visibility-child',learner).firestore();
});
after(async () => { await env?.cleanup(); });

test('the production baseline denies a management write for all scoped visibility IDs', async () => {
  const baseline=await connect('production-release-baseline.rules',base+'-baseline');
  try {
    await seed(baseline);
    const db=baseline.authenticatedContext(adminUid,signedIn).firestore();
    for (const game of recent) await assertFails(createManagementStore('production',F,db)
      .mutate({uid:adminUid},'visibilityBatch',{games:[game],status:'hidden'}));
  } finally { await baseline.cleanup(); }
});

test('the existing admin store lists the individual visibility games and preserves published defaults and saved state', async () => {
  const ids=['parallelPair','missingAlphabet',...recent];
  assert.equal(new Set(GAME_IDS).size,GAME_IDS.length);
  const store=()=>createManagementStore('production',F,admin);
  assert.deepEqual((await store().snapshot()).games.filter(g=>ids.includes(g.id)).map(g=>g.id),ids);
  assert.ok((await store().snapshot()).games.filter(g=>recent.includes(g.id)).every(g=>g.status==='published'));
  for (const game of ids) {
    const change=status=>store().mutate({uid:adminUid},'visibilityBatch',{games:[game],status});
    const hidden=await assertSucceeds(change('hidden'));
    const record=(await assertSucceeds(F.getDoc(setting(child,game)))).data();
    assert.equal(record.status,'hidden');
    const backup=(await F.getDoc(F.doc(admin,root+'/managementBackups/'+hidden.backupId))).data();
    assert.deepEqual(backup.targets,[root+'/gameSettings/'+game]);
    assert.equal((await store().snapshot()).games.find(g=>g.id===game).status,'hidden');
    await assertSucceeds(change('published'));
    assert.equal((await store().snapshot()).games.find(g=>g.id===game).status,'published');
  }
  assert.equal((await F.getDoc(setting(admin,'keisan'))).data().status,'published');
});

test('child, signed-in non-admin, unauthenticated reads, unwitnessed writes and deletes stay denied', async () => {
  const guest=env.unauthenticatedContext().firestore();
  const other=env.authenticatedContext('other',signedIn).firestore();
  for (const game of recent) {
    await assertFails(F.getDoc(setting(guest,game)));
    for (const db of [admin,child,other]) {
      await assertFails(F.updateDoc(setting(db,game),{status:'hidden'}));
      await assertFails(F.deleteDoc(setting(db,game)));
    }
    for (const [db,uid] of [[child,'visibility-child'],[other,'other']]) {
      await assertFails(createManagementStore('production',F,db)
        .mutate({uid},'visibilityBatch',{games:[game],status:'hidden'}));
    }
  }
  await assertFails(F.getDocs(F.collection(child,root+'/gameSettings')));
});

test('campaign, extra fields and mixed visibility batches cannot alter the new documents', async () => {
  const commit=async (games,extra) => {
    const audit=F.doc(F.collection(admin,root+'/managementAudit'));
    const backup=F.doc(F.collection(admin,root+'/managementBackups'));
    const refs=games.map(id=>setting(admin,id));
    const beforeByGame=Object.fromEntries(await Promise.all(refs.map(async(ref,i)=>[games[i],(await F.getDoc(ref)).data()])));
    const afterByGame=Object.fromEntries(games.map(id=>[id,'hidden']));
    const fields={actor:adminUid,at:F.serverTimestamp(),action:'visibilityBatch',targets:refs.map(ref=>ref.path),beforeByGame,reason:'テスト'};
    const batch=F.writeBatch(admin);
    batch.set(audit,{...fields,id:audit.id,afterByGame,backupId:backup.id});
    batch.set(backup,{...fields,id:backup.id,auditId:audit.id});
    refs.forEach(ref=>batch.update(ref,{status:'hidden',lastAudit:audit.id,lastBackup:backup.id,updatedAt:F.serverTimestamp(),...extra}));
    return batch.commit();
  };
  await assertFails(commit(['heikouPair','keisan'],{}));
  await assertFails(commit(['heikouPair'],{campaign:{enabled:true}}));
  await assertFails(commit(['heikouPair'],{nickname:'変更'}));
  await assertFails(commit(['shikakkeSecrets'],{campaign:{enabled:true}}));
  await assertFails(commit(['shikakkeSecrets','keisan'],{}));
  await assertFails(commit(['fractionBasics','keisan'],{}));
  await assertFails(commit(['fractionBasics'],{campaign:{enabled:true}}));
  assert.equal((await F.getDoc(setting(admin,'fractionBasics'))).data().status,'published');
  assert.equal((await F.getDoc(setting(admin,'heikouPair'))).data().status,'published');
  assert.equal((await F.getDoc(setting(admin,'keisan'))).data().status,'published');
});
