import {after,before,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import * as F from 'firebase/firestore';

const projectId='manabi-game-land';
const rulesUrl=new URL('../../firebase/production-admin-stage2-nickname-proposed.rules',import.meta.url);
const adminContext=()=>env.authenticatedContext('admin-uid',{firebase:{sign_in_provider:'password'},auth_time:200});
const child=(uid)=>env.authenticatedContext(uid,{firebase:{sign_in_provider:'anonymous'}});
const row=(uid='rank-a',game='keisan',bestStreak=20,nickname='そら')=>({uid,game,nickname,bestStreak,icon:'cat',frame:'plain',title:'計算名人',badge:'keisan:10',updatedAt:F.Timestamp.fromMillis(1)});
let env;
before(async()=>{env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8180,rules:await readFile(rulesUrl,'utf8')}});});
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();await F.setDoc(F.doc(db,'productionAdmin/v1/private/admin'),{uid:'admin-uid',enabled:true,renameEnabled:true,suspensionEnabled:true});await F.setDoc(F.doc(db,'productionAdmin/v1/private/revocation'),{after:F.Timestamp.fromMillis(100000)});await F.setDoc(F.doc(db,'players/profile-a'),{nickname:'そら',points:135,bestStreak:42,prefNameBestStreak:8,appearance:{icon:'cat',frame:'plain',badge:'称号保持',limitedOwned:['frame:gold']},rankingUid:'rank-a'});await F.setDoc(F.doc(db,'productionRankings/v1/identityLinks/rank-a'),{uid:'rank-a',profileUid:'profile-a',createdAt:F.Timestamp.fromMillis(1)});await F.setDoc(F.doc(db,'productionRankings/v1/games/keisan/players/rank-a'),row());await F.setDoc(F.doc(db,'players/profile-b'),{nickname:'ほし',points:54,bestStreak:9,appearance:{icon:'owl'},rankingUid:'rank-b'});await F.setDoc(F.doc(db,'productionRankings/v1/identityLinks/rank-b'),{uid:'rank-b',profileUid:'profile-b',createdAt:F.Timestamp.fromMillis(1)});await F.setDoc(F.doc(db,'productionRankings/v1/games/keisan/players/rank-b'),row('rank-b','keisan',9,'ほし'));});});
after(async()=>env?.cleanup());

test('children cannot change their nickname or another child profile; own score state remains writable',async()=>{const a=child('profile-a').firestore(),b=child('profile-b').firestore();await assertFails(F.updateDoc(F.doc(a,'players/profile-a'),{nickname:'勝手変更'}));await assertFails(F.updateDoc(F.doc(b,'players/profile-a'),{nickname:'なりすまし'}));await assertSucceeds(F.updateDoc(F.doc(a,'players/profile-a'),{points:140,bestStreak:43,updatedAt:2}));const after=(await assertSucceeds(F.getDoc(F.doc(a,'players/profile-a')))).data();assert.equal(after.nickname,'そら');assert.equal(after.points,140);assert.equal(after.bestStreak,43);});

test('identity link can only point to the profile that has explicitly linked the caller ranking UID, and is immutable',async()=>{const profile=child('profile-new').firestore(),ranking=child('rank-new').firestore(),otherRanking=child('rank-other').firestore();await assertSucceeds(F.setDoc(F.doc(profile,'players/profile-new'),{nickname:'ゆい',points:0,bestStreak:0,appearance:{}}));await assertSucceeds(F.updateDoc(F.doc(profile,'players/profile-new'),{rankingUid:'rank-new',updatedAt:F.serverTimestamp()}));await assertSucceeds(F.setDoc(F.doc(ranking,'productionRankings/v1/identityLinks/rank-new'),{uid:'rank-new',profileUid:'profile-new',createdAt:F.serverTimestamp()}));await assertFails(F.setDoc(F.doc(otherRanking,'productionRankings/v1/identityLinks/rank-other'),{uid:'rank-other',profileUid:'profile-new',createdAt:F.serverTimestamp()}));await assertFails(F.updateDoc(F.doc(ranking,'productionRankings/v1/identityLinks/rank-new'),{profileUid:'profile-a'}));await assertFails(F.deleteDoc(F.doc(ranking,'productionRankings/v1/identityLinks/rank-new')));});

test('authorized admin rename atomically backs up and audits before changing only display names',async()=>{const db=adminContext().firestore(),profile=F.doc(db,'players/profile-a'),ranking=F.doc(db,'productionRankings/v1/games/keisan/players/rank-a');const before=(await assertSucceeds(F.getDoc(profile))).data(),oldRow=(await assertSucceeds(F.getDoc(ranking))).data();const batch=F.writeBatch(db);const at=F.serverTimestamp();batch.set(F.doc(db,'productionAdmin/v1/backups/backup-1'),{actor:'admin-uid',at,uid:'profile-a',target:'players/profile-a',kind:'rename',data:{player:before,links:[{uid:'rank-a',profileUid:'profile-a'}],rankings:[{uid:'rank-a',game:'keisan',data:oldRow}]}});batch.set(F.doc(db,'productionAdmin/v1/audit/audit-1'),{actor:'admin-uid',at,uid:'profile-a',target:'players/profile-a',action:'rename',reason:'本人確認済みの依頼',backupId:'backup-1',beforeName:'そら',afterName:'あおい'});batch.update(profile,{nickname:'あおい',lastAudit:'audit-1',lastBackup:'backup-1',adminUpdatedAt:at});batch.update(ranking,{nickname:'あおい',updatedAt:at});await assertSucceeds(batch.commit());const after=(await F.getDoc(profile)).data(),afterRow=(await F.getDoc(ranking)).data();assert.equal(after.nickname,'あおい');assert.equal(after.points,before.points);assert.equal(after.bestStreak,before.bestStreak);assert.deepEqual(after.appearance,before.appearance);assert.equal(afterRow.nickname,'あおい');assert.equal(afterRow.bestStreak,oldRow.bestStreak);assert.equal(afterRow.title,oldRow.title);});

test('admin rename is denied unless the exact authorization and constrained diff apply',async()=>{const anonymous=child('admin-uid').firestore(),db=adminContext().firestore();await assertFails(F.updateDoc(F.doc(anonymous,'players/profile-a'),{nickname:'拒否'}));await assertFails(F.updateDoc(F.doc(db,'players/profile-a'),{nickname:'変更',points:0,lastAudit:'x',lastBackup:'y',adminUpdatedAt:F.serverTimestamp()}));});

test('existing shared ranking remains readable cross-child and writes remain self-only and monotonic',async()=>{const a=child('rank-a').firestore(),b=child('rank-b').firestore();const ref=F.doc(a,'productionRankings/v1/games/keisan/players/rank-a');await assertSucceeds(F.getDocs(F.collection(b,'productionRankings/v1/games/keisan/players')));await assertFails(F.updateDoc(ref,{bestStreak:19,updatedAt:F.serverTimestamp()}));await assertFails(F.deleteDoc(ref));await assertSucceeds(F.updateDoc(F.doc(b,'productionRankings/v1/games/keisan/players/rank-b'),{bestStreak:10,updatedAt:F.serverTimestamp()}));const list=await assertSucceeds(F.getDocs(F.collection(b,'productionRankings/v1/games/keisan/players')));assert.equal(list.size,2);});

test('children cannot create audit or backup records or modify administrator settings',async()=>{const db=child('profile-a').firestore();await assertFails(F.setDoc(F.doc(db,'productionAdmin/v1/audit/fake'),{actor:'profile-a'}));await assertFails(F.setDoc(F.doc(db,'productionAdmin/v1/backups/fake'),{actor:'profile-a'}));await assertFails(F.updateDoc(F.doc(db,'productionAdmin/v1/private/admin'),{renameEnabled:true}));});


test('player name sync does not create placeholder profiles and uses the Firestore name for ranking writes',async()=>{
 const {initializeApp,deleteApp}=await import('firebase/app');
 const A=await import('firebase/auth');
 const FS=await import('firebase/firestore');
 const firebase={apiKey:'demo-only-key',authDomain:'manabi-game-land.firebaseapp.com',projectId,appId:'emulator-test'};
 const profileApp=initializeApp(firebase);
 const rankingApp=initializeApp(firebase,'manabi-production-ranking-v1');
 const profileAuth=A.getAuth(profileApp),rankingAuth=A.getAuth(rankingApp);
 A.connectAuthEmulator(profileAuth,'http://127.0.0.1:9199',{disableWarnings:true});
 A.connectAuthEmulator(rankingAuth,'http://127.0.0.1:9199',{disableWarnings:true});
 const profileDb=FS.getFirestore(profileApp),rankingDb=FS.getFirestore(rankingApp);
 FS.connectFirestoreEmulator(profileDb,'127.0.0.1',8180);
 FS.connectFirestoreEmulator(rankingDb,'127.0.0.1',8180);
 const apps=[profileApp,rankingApp];
 try{
  await A.setPersistence(profileAuth,A.inMemoryPersistence);await A.signInAnonymously(profileAuth);
  await A.setPersistence(rankingAuth,A.inMemoryPersistence);await A.signInAnonymously(rankingAuth);
  const config={mode:'production',expectedProjectId:'manabi-game-land',rankingSyncEnabled:true,playerNameSyncEnabled:true,firebase,rankingGameIds:['keisan']};
  const {createProductionRankingClient}=await import('../../ranking-sync-api.js');
  const api=await createProductionRankingClient(config,[{getApps:()=>[profileApp,rankingApp],initializeApp(){throw Error('unexpected app init')}},A,FS]);
  const profile=FS.doc(profileDb,'players',profileAuth.currentUser.uid);
  await assert.rejects(api.ensurePlayerLink('old-local-name'),e=>e.code==='player-profile-required');
  assert.equal((await assertSucceeds(FS.getDoc(profile))).exists(),false);
  await assertSucceeds(FS.setDoc(profile,{nickname:'管理前',points:77,bestStreak:14,appearance:{icon:'cat'}}));
  assert.equal(await api.ensurePlayerLink('古い端末名'),'管理前');
  await api.publishRanking({game:'keisan',bestStreak:6,nickname:'古い端末名',icon:'cat',frame:'plain',title:null,badge:null});
  let rank=await assertSucceeds(FS.getDoc(FS.doc(rankingDb,'productionRankings/v1/games/keisan/players',rankingAuth.currentUser.uid)));
  assert.equal(rank.data().nickname,'管理前');
  const seen=new Promise(resolve=>{const stop=api.watchPlayerName(name=>{if(name==='管理後'){stop();resolve(name);}});setTimeout(()=>{stop();resolve(null);},2500);});
  await env.withSecurityRulesDisabled(async c=>FS.updateDoc(FS.doc(c.firestore(),'players',profileAuth.currentUser.uid),{nickname:'管理後'}));
  assert.equal(await seen,'管理後');
  await api.publishRanking({game:'keisan',bestStreak:7,nickname:'管理前',icon:'cat',frame:'plain',title:null,badge:null});
  rank=await assertSucceeds(FS.getDoc(FS.doc(rankingDb,'productionRankings/v1/games/keisan/players',rankingAuth.currentUser.uid)));
  assert.equal(rank.data().nickname,'管理後');
  assert.equal(rank.data().bestStreak,7);
  const profileAfter=(await assertSucceeds(FS.getDoc(profile))).data();
  assert.equal(profileAfter.points,77);assert.equal(profileAfter.bestStreak,14);
 }finally{await A.signOut(profileAuth);await A.signOut(rankingAuth);await FS.terminate(profileDb);await FS.terminate(rankingDb);await Promise.all(apps.map(deleteApp));}
});



async function setAccessStatus(status,backupId='access-backup-'+status,auditId='access-audit-'+status){
 const db=adminContext().firestore(),profileRef=F.doc(db,'players/profile-a'),rankingRef=F.doc(db,'productionRankings/v1/games/keisan/players/rank-a');
 const profile=(await F.getDoc(profileRef)).data(),ranking=(await F.getDoc(rankingRef)).data(),before=profile.accessStatus==='suspended'?'suspended':'active',at=F.serverTimestamp();
 const backup={actor:'admin-uid',at,uid:'profile-a',target:'players/profile-a',kind:'access-status',beforeStatus:before,afterStatus:status,data:{player:profile,links:[{uid:'rank-a',profileUid:'profile-a'}],rankings:[{uid:'rank-a',game:'keisan',data:ranking}]}};
 const audit={actor:'admin-uid',at,uid:'profile-a',target:'players/profile-a',action:status==='suspended'?'suspend':'restore',reason:'保護者から利用状態変更の依頼',backupId,beforeStatus:before,afterStatus:status,linkedRankingCount:1};
 const batch=F.writeBatch(db);batch.set(F.doc(db,'productionAdmin/v1/backups/'+backupId),backup);batch.set(F.doc(db,'productionAdmin/v1/audit/'+auditId),audit);batch.update(profileRef,{accessStatus:status,lastAccessAudit:auditId,lastAccessBackup:backupId,accessUpdatedAt:at});await assertSucceeds(batch.commit());return {db,profileRef,rankingRef,profileBefore:profile,rankingBefore:ranking};
}

test('admin suspends and restores only the linked profile, with immutable audit and backups preserving child data',async()=>{
 const first=await setAccessStatus('suspended');
 let profile=(await assertSucceeds(F.getDoc(first.profileRef))).data(),ranking=(await assertSucceeds(F.getDoc(first.rankingRef))).data();
 assert.equal(profile.accessStatus,'suspended');assert.equal(profile.points,first.profileBefore.points);assert.equal(profile.bestStreak,first.profileBefore.bestStreak);assert.equal(profile.prefNameBestStreak,first.profileBefore.prefNameBestStreak);assert.deepEqual(profile.appearance,first.profileBefore.appearance);assert.deepEqual(ranking,first.rankingBefore);
 const backup=(await assertSucceeds(F.getDoc(F.doc(first.db,'productionAdmin/v1/backups/access-backup-suspended')))).data();assert.equal(backup.data.player.points,first.profileBefore.points);assert.equal(backup.data.rankings[0].data.bestStreak,first.rankingBefore.bestStreak);
 await setAccessStatus('active','access-backup-restored','access-audit-restored');
 profile=(await assertSucceeds(F.getDoc(first.profileRef))).data();ranking=(await assertSucceeds(F.getDoc(first.rankingRef))).data();
 assert.equal(profile.accessStatus,'active');assert.equal(profile.points,first.profileBefore.points);assert.equal(profile.bestStreak,first.profileBefore.bestStreak);assert.equal(profile.prefNameBestStreak,first.profileBefore.prefNameBestStreak);assert.deepEqual(profile.appearance,first.profileBefore.appearance);assert.deepEqual(ranking,first.rankingBefore);
 const audit=(await assertSucceeds(F.getDoc(F.doc(first.db,'productionAdmin/v1/audit/access-audit-restored')))).data();assert.equal(audit.actor,'admin-uid');assert.equal(audit.reason,'保護者から利用状態変更の依頼');assert.equal(audit.beforeStatus,'suspended');assert.equal(audit.afterStatus,'active');
});

test('children cannot change accessStatus and suspended profile or linked ranking writes are denied',async()=>{
 const profile=child('profile-a').firestore(),ranking=child('rank-a').firestore();
 await assertFails(F.updateDoc(F.doc(profile,'players/profile-a'),{accessStatus:'suspended'}));
 await setAccessStatus('suspended');
 await assertFails(F.updateDoc(F.doc(profile,'players/profile-a'),{points:900,bestStreak:999,updatedAt:2}));
 await assertFails(F.updateDoc(F.doc(profile,'players/profile-a'),{accessStatus:'active'}));
 await assertFails(F.updateDoc(F.doc(ranking,'productionRankings/v1/games/keisan/players/rank-a'),{bestStreak:21,updatedAt:F.serverTimestamp()}));
 await assertFails(F.setDoc(F.doc(ranking,'productionRankings/v1/games/alphabet/players/rank-a'),{...row('rank-a','alphabet',1),updatedAt:F.serverTimestamp()}));
 const otherProfile=child('profile-b').firestore(),otherRanking=child('rank-b').firestore();await assertSucceeds(F.updateDoc(F.doc(otherProfile,'players/profile-b'),{points:55,updatedAt:2}));await assertSucceeds(F.updateDoc(F.doc(otherRanking,'productionRankings/v1/games/keisan/players/rank-b'),{bestStreak:10,updatedAt:F.serverTimestamp()}));
});

test('restored child resumes ordinary profile and linked ranking writes',async()=>{
 const p=child('profile-a').firestore(),r=child('rank-a').firestore();await setAccessStatus('suspended');await setAccessStatus('active','restore-backup','restore-audit');
 await assertSucceeds(F.updateDoc(F.doc(p,'players/profile-a'),{points:136,bestStreak:43,updatedAt:2}));
 await assertSucceeds(F.updateDoc(F.doc(r,'productionRankings/v1/games/keisan/players/rank-a'),{bestStreak:21,updatedAt:F.serverTimestamp()}));
});

test('different UID may write only through its explicit profile link; unlinked legacy UID cannot post for another child',async()=>{
 const rankA=child('rank-a').firestore(),rankB=child('rank-b').firestore(),orphan=child('orphan-rank').firestore();
 await assertSucceeds(F.updateDoc(F.doc(rankA,'productionRankings/v1/games/keisan/players/rank-a'),{bestStreak:21,updatedAt:F.serverTimestamp()}));
 await assertSucceeds(F.updateDoc(F.doc(rankB,'productionRankings/v1/games/keisan/players/rank-b'),{bestStreak:10,updatedAt:F.serverTimestamp()}));
 await assertFails(F.setDoc(F.doc(orphan,'productionRankings/v1/games/keisan/players/orphan-rank'),{...row('orphan-rank','keisan',1),updatedAt:F.serverTimestamp()}));
});

test('same UID legacy profile can continue ranking, but local stale data cannot unlock a suspended server profile',async()=>{
 const db=child('legacy-same-uid').firestore(),profile=F.doc(db,'players/legacy-same-uid'),rank=F.doc(db,'productionRankings/v1/games/keisan/players/legacy-same-uid');
 await assertSucceeds(F.setDoc(profile,{nickname:'きらり',points:3,bestStreak:4,appearance:{}}));
 await assertSucceeds(F.setDoc(rank,{...row('legacy-same-uid','keisan',4,'きらり'),updatedAt:F.serverTimestamp()}));
 await setAccessStatus('suspended');const target=child('profile-a').firestore();await assertFails(F.updateDoc(F.doc(target,'players/profile-a'),{accessStatus:'active',points:1}));
});

test('admin access changes require the enabled production administrator setting',async()=>{
 await env.withSecurityRulesDisabled(async c=>F.updateDoc(F.doc(c.firestore(),'productionAdmin/v1/private/admin'),{suspensionEnabled:false}));
 const db=adminContext().firestore(),profileRef=F.doc(db,'players/profile-a'),profile=(await F.getDoc(profileRef)).data(),backupId='disabled-backup',auditId='disabled-audit',at=F.serverTimestamp(),batch=F.writeBatch(db);
 batch.set(F.doc(db,'productionAdmin/v1/backups/'+backupId),{actor:'admin-uid',at,uid:'profile-a',target:'players/profile-a',kind:'access-status',beforeStatus:'active',afterStatus:'suspended',data:{player:profile,links:[{uid:'rank-a',profileUid:'profile-a'}],rankings:[]}});
 batch.set(F.doc(db,'productionAdmin/v1/audit/'+auditId),{actor:'admin-uid',at,uid:'profile-a',target:'players/profile-a',action:'suspend',reason:'管理権限設定の拒否確認',backupId,beforeStatus:'active',afterStatus:'suspended',linkedRankingCount:1});
 batch.update(profileRef,{accessStatus:'suspended',lastAccessAudit:auditId,lastAccessBackup:backupId,accessUpdatedAt:at});await assertFails(batch.commit());
});

