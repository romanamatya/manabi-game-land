import {after,before,beforeEach,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import * as F from 'firebase/firestore';
import {GAME_IDS} from '../../management-model.js';
import {createManagementStore} from '../../shared-src/site/management-store.js';
import {createFirestoreStore} from '../../shared-src/site/firebase-store.js';

const projectId='demo-manabi-simple-admin',rulesUrl=new URL('../../firebase/production-simple-admin-proposed.rules',import.meta.url);
let adminUid='admin-uid';
const admin=()=>env.authenticatedContext(adminUid,{firebase:{sign_in_provider:'password'},auth_time:200});
const child=(uid='rank-a')=>env.authenticatedContext(uid,{firebase:{sign_in_provider:'anonymous'}});
const row=(uid='rank-a',game='keisan',best=20,nickname='そら',updatedAt=F.Timestamp.fromMillis(1))=>({uid,game,nickname,bestStreak:best,icon:'cat',frame:'plain',title:'計算名人',badge:'keisan:10',updatedAt});
let env;const testEnvironments=[];
describe('four-feature production admin Rules',{concurrency:false},()=>{
const serialTest=(name,fn)=>test(name,{concurrency:false},fn);
beforeEach(async()=>{env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8181,rules:await readFile(rulesUrl,'utf8')}});testEnvironments.push(env);await env.clearFirestore();adminUid='admin-uid-'+Math.random().toString(36).slice(2,8);await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();
 await F.setDoc(F.doc(db,'productionAdmin/v1/private/admin'),{uid:adminUid,enabled:true,renameEnabled:true,suspensionEnabled:true,managementEnabled:true,challenge120RankingEnabled:false});
 await F.setDoc(F.doc(db,'productionAdmin/v1/private/revocation'),{after:F.Timestamp.fromMillis(100000)});
 await F.setDoc(F.doc(db,'players/profile-a'),{nickname:'そら',points:135,bestStreak:42,prefNameBestStreak:8,appearance:{icon:'cat',frame:'plain',badge:'保持称号',limitedOwned:['frame:gold']},rankingUid:'rank-a'});
 await F.setDoc(F.doc(db,'productionRankings/v1/identityLinks/rank-a'),{uid:'rank-a',profileUid:'profile-a',createdAt:F.Timestamp.fromMillis(1)});
 await F.setDoc(F.doc(db,'productionRankings/v1/games/keisan/players/rank-a'),row());
});});
after(async()=>Promise.all(testEnvironments.map(testEnv=>testEnv.cleanup())));

async function adminWrite(db,action,refs,values){
 const at=F.serverTimestamp(),audit=F.doc(F.collection(db,'productionAdmin/v1/managementAudit')),backup=F.doc(F.collection(db,'productionAdmin/v1/managementBackups'));
 const targets=refs.map(r=>r.path),reason='承認済みの管理操作',before=[];
 for(const ref of refs){const snap=await F.getDoc(ref);before.push(snap.exists()?snap.data():null);}
 const batch=F.writeBatch(db);
 batch.set(backup,{id:backup.id,actor:adminUid,at,action,targets,before,reason,auditId:audit.id});
 const after=values.map(value=>Object.fromEntries(Object.entries(value).filter(([key])=>key!=='updatedAt')));
 batch.set(audit,{id:audit.id,actor:adminUid,at,action,targets,reason,before,after,backupId:backup.id});
 await batch.commit();
 const apply=F.writeBatch(db);refs.forEach((ref,i)=>apply.set(ref,{...values[i],lastAudit:audit.id,lastBackup:backup.id}));
 await apply.commit();return {audit,backup};
}

async function writeVisibilityBatch(db,games,status,{mismatchGame=null,auditId=null,backupId=null}={}){
 const audit=F.doc(db,'productionAdmin/v1/managementAudit',auditId||crypto.randomUUID());
 const backup=F.doc(db,'productionAdmin/v1/managementBackups',backupId||crypto.randomUUID());
 const refs=games.map(game=>F.doc(db,'productionAdmin/v1/gameSettings/'+game));
 return F.runTransaction(db,async tx=>{
  const snaps=await Promise.all(refs.map(ref=>tx.get(ref)));
  const beforeByGame=Object.fromEntries(games.map((game,i)=>[game,snaps[i].exists()?snaps[i].data():null]));
  const afterByGame=Object.fromEntries(games.map(game=>[game,status]));
  const targets=refs.map(ref=>ref.path),at=F.serverTimestamp(),reason='管理室からの操作';
  tx.set(backup,{id:backup.id,actor:adminUid,at,action:'visibilityBatch',targets,beforeByGame,reason,auditId:audit.id});
  tx.set(audit,{id:audit.id,actor:adminUid,at,action:'visibilityBatch',targets,beforeByGame,afterByGame,reason,backupId:backup.id});
  for(let i=0;i<refs.length;i++)tx.set(refs[i],{status:games[i]===mismatchGame?'hidden':status,updatedAt:at,lastAudit:audit.id,lastBackup:backup.id},{merge:true});
  return {audit,backup};
 });
}

serialTest('admin can change game visibility; child can read state but cannot change it',async()=>{
 const adminDb=admin().firestore(),target=F.doc(adminDb,'productionAdmin/v1/gameSettings/keisan');
 await assertSucceeds(adminWrite(adminDb,'visibility',[target],[{status:'hidden',updatedAt:F.serverTimestamp()}]));
 const student=child().firestore(),ref=F.doc(student,'productionAdmin/v1/gameSettings/keisan');
 assert.equal((await assertSucceeds(F.getDoc(ref))).data().status,'hidden');
 await assertFails(F.updateDoc(ref,{status:'published'}));
 await assertFails(F.setDoc(F.doc(student,'productionAdmin/v1/gameSettings/fake'),{status:'published'}));
 await assertFails(F.updateDoc(F.doc(adminDb,'productionAdmin/v1/managementAudit/'+(await F.getDocs(F.collection(adminDb,'productionAdmin/v1/managementAudit'))).docs[0].id),{reason:'rewrite'}));
});

serialTest('admin can publish an announcement; children can read but cannot create, edit, or delete it',async()=>{
 const db=admin().firestore(),target=F.doc(db,'productionAdmin/v1/notices/current');
 await assertSucceeds(adminWrite(db,'notice',[target],[{title:'お知らせ',body:'本文',published:true,deleted:false,revision:1,updatedAt:F.serverTimestamp()}]));
 const student=child().firestore(),ref=F.doc(student,'productionAdmin/v1/notices/current');
 assert.equal((await assertSucceeds(F.getDoc(ref))).data().title,'お知らせ');
 await assertFails(F.updateDoc(ref,{published:false}));await assertFails(F.deleteDoc(ref));
});

serialTest('admin can schedule and manually end a multi-game campaign with one bounded write per game',async()=>{
 const db=admin().firestore(),games=['keisan','alphabet'];
 const startAt=Date.now()+1000,endAt=startAt+3600000,campaignId='campaign-1';
 for(const game of games){const target=F.doc(db,'productionAdmin/v1/gameSettings/'+game);await assertSucceeds(adminWrite(db,'campaign',[target],[{status:'published',campaign:{id:campaignId,enabled:true,startAt,endAt},updatedAt:F.serverTimestamp()}]));}
 const student=child().firestore();
 assert.equal((await assertSucceeds(F.getDoc(F.doc(student,'productionAdmin/v1/gameSettings/keisan')))).data().campaign.id,campaignId);
 await assertFails(F.getDoc(F.doc(student,'productionAdmin/v1/campaignHistory/'+campaignId)));
 await assertFails(F.updateDoc(F.doc(student,'productionAdmin/v1/gameSettings/keisan'),{campaign:{enabled:false}}));
 for(const game of games){const target=F.doc(db,'productionAdmin/v1/gameSettings/'+game);await assertSucceeds(adminWrite(db,'campaign',[target],[{status:'published',campaign:{id:campaignId,enabled:false,startAt,endAt},updatedAt:F.serverTimestamp()}]));}
 assert.equal((await assertSucceeds(F.getDoc(F.doc(student,'productionAdmin/v1/gameSettings/keisan')))).data().campaign.enabled,false);
});

serialTest('admin can atomically change all game visibility with shared audit and backup under Rules access limits',async()=>{
 const adminDb=admin().firestore(),games=[...GAME_IDS];
 await env.withSecurityRulesDisabled(async c=>{
  const db=c.firestore();
  await F.setDoc(F.doc(db,'productionAdmin/v1/gameSettings/keisan'),{status:'hidden',campaign:{id:'keep-campaign',enabled:true,startAt:10,endAt:20}});
  await F.setDoc(F.doc(db,'productionAdmin/v1/gameSettings/alphabet'),{status:'preparing'});
 });
 const result=await assertSucceeds(createManagementStore('production',F,adminDb).mutate({uid:adminUid},'visibilityBatch',{games,status:'published'}));
 const audit=F.doc(adminDb,'productionAdmin/v1/managementAudit/'+result.auditId),backup=F.doc(adminDb,'productionAdmin/v1/managementBackups/'+result.backupId);
 for(const game of games){const saved=(await assertSucceeds(F.getDoc(F.doc(adminDb,'productionAdmin/v1/gameSettings/'+game)))).data();assert.equal(saved.status,'published');assert.equal(saved.lastAudit,audit.id);assert.equal(saved.lastBackup,backup.id);}
 const kept=(await F.getDoc(F.doc(adminDb,'productionAdmin/v1/gameSettings/keisan'))).data();assert.deepEqual(kept.campaign,{id:'keep-campaign',enabled:true,startAt:10,endAt:20});
 const auditData=(await F.getDoc(audit)).data(),backupData=(await F.getDoc(backup)).data();
 assert.equal(auditData.action,'visibilityBatch');assert.equal(auditData.reason,'管理室からの操作');assert.equal(auditData.targets.length,GAME_IDS.length);
 assert.equal(backupData.beforeByGame.keisan.status,'hidden');assert.equal(backupData.beforeByGame.alphabet.status,'preparing');assert.equal(backupData.beforeByGame['pref-name'],null);
 const badAudit='atomic-reject-audit',badBackup='atomic-reject-backup';
 await assertFails(writeVisibilityBatch(adminDb,games,'preparing',{mismatchGame:games.at(-1),auditId:badAudit,backupId:badBackup}));
 for(const game of games)assert.equal((await F.getDoc(F.doc(adminDb,'productionAdmin/v1/gameSettings/'+game))).data().status,'published');
 assert.equal((await assertSucceeds(F.getDoc(F.doc(adminDb,'productionAdmin/v1/managementAudit/'+badAudit)))).exists(),false);
 assert.equal((await assertSucceeds(F.getDoc(F.doc(adminDb,'productionAdmin/v1/managementBackups/'+badBackup)))).exists(),false);
});

serialTest('non-admin cannot mutate campaign, notice, game settings, audit, or backup',async()=>{
 const db=child().firestore();
 await assertFails(F.setDoc(F.doc(db,'productionAdmin/v1/gameSettings/keisan'),{status:'hidden'}));
 await assertFails(F.setDoc(F.doc(db,'productionAdmin/v1/notices/current'),{title:'不正',body:'',published:true,deleted:false,revision:1}));
 await assertFails(F.setDoc(F.doc(db,'productionAdmin/v1/campaignHistory/fake'),{id:'fake',games:['keisan'],enabled:true}));
 await assertFails(F.setDoc(F.doc(db,'productionAdmin/v1/managementAudit/fake'),{actor:'rank-a'}));
 await assertFails(F.setDoc(F.doc(db,'productionAdmin/v1/managementBackups/fake'),{actor:'rank-a'}));
});

serialTest('published game ranking still works; preparing and hidden games reject direct URL-style posts',async()=>{
 const adminDb=admin().firestore();
 for(const [game,status] of [['pref-name','preparing'],['alphabet','hidden']])await env.withSecurityRulesDisabled(c=>F.setDoc(F.doc(c.firestore(),'productionAdmin/v1/gameSettings/'+game),{status}));
 const student=child('rank-new').firestore(),profile=F.doc(student,'players/rank-new');
 await assertSucceeds(F.setDoc(profile,{nickname:'にじ',points:0,bestStreak:0,appearance:{}}));
 await assertSucceeds(F.updateDoc(profile,{rankingUid:'rank-new',updatedAt:F.serverTimestamp()}));
 await assertSucceeds(F.setDoc(F.doc(student,'productionRankings/v1/identityLinks/rank-new'),{uid:'rank-new',profileUid:'rank-new',createdAt:F.serverTimestamp()}));
 await assertFails(F.setDoc(F.doc(student,'productionRankings/v1/games/pref-name/players/rank-new'),row('rank-new','pref-name',1,'にじ',F.serverTimestamp())));
 await assertFails(F.setDoc(F.doc(student,'productionRankings/v1/games/alphabet/players/rank-new'),row('rank-new','alphabet',1,'にじ',F.serverTimestamp())));
 await assertSucceeds(F.setDoc(F.doc(student,'productionRankings/v1/games/keisan/players/rank-new'),row('rank-new','keisan',1,'にじ',F.serverTimestamp())));
});

serialTest('an existing unlinked profile can keep its separate ranking UID and continue the shared ranking',async()=>{
 const profileUid='legacy-profile',rankingUid='legacy-ranker';
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();
  await F.setDoc(F.doc(db,'players/'+profileUid),{nickname:'こはる',points:88,bestStreak:12,appearance:{icon:'owl'},updatedAt:F.Timestamp.fromMillis(1)});
  await F.setDoc(F.doc(db,'productionRankings/v1/games/keisan/players/'+rankingUid),row(rankingUid,'keisan',18,'こはる'));
 });
 const profileDb=child(profileUid).firestore(),rankingDb=child(rankingUid).firestore();
 const profile=F.doc(profileDb,'players/'+profileUid),link=F.doc(rankingDb,'productionRankings/v1/identityLinks/'+rankingUid);
 const rank=F.doc(rankingDb,'productionRankings/v1/games/keisan/players/'+rankingUid);
 await assertSucceeds(F.updateDoc(profile,{rankingUid,updatedAt:F.serverTimestamp()}));
 await assertSucceeds(F.setDoc(link,{uid:rankingUid,profileUid,createdAt:F.serverTimestamp()}));
 await assertSucceeds(F.updateDoc(rank,row(rankingUid,'keisan',19,'こはる',F.serverTimestamp())));
 const savedProfile=(await F.getDoc(profile)).data(),savedRank=(await F.getDoc(rank)).data();
 assert.equal(savedProfile.points,88);assert.equal(savedProfile.bestStreak,12);assert.equal(savedProfile.rankingUid,rankingUid);
 assert.equal(savedRank.bestStreak,19);assert.equal(savedRank.nickname,'こはる');
});

serialTest('dedicated challenge ranking is isolated from legacy updatedAt rows and accepts only linked post-cutoff scores across all games',async()=>{
 const cutoffMs=1793458800000,cutoff=F.Timestamp.fromMillis(cutoffMs),legacyUid='challenge-kept-legacy',endMs=Date.now()-5000,startMs=endMs-45000;
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();
  await F.setDoc(F.doc(db,'players/flag-off'),{nickname:'新記録',rankingUid:'flag-off'});
  await F.setDoc(F.doc(db,'productionRankings/v1/identityLinks/flag-off'),{uid:'flag-off',profileUid:'flag-off',createdAt:cutoff});
  await F.setDoc(F.doc(db,'productionRankings/v1/games/keisan/players/'+legacyUid),row(legacyUid,'keisan',999,'旧記録',F.Timestamp.fromMillis(Date.now())));
 });
 assert.ok(startMs>=cutoffMs,'test runtime must be on or after the approved cutoff');
 const flagOffEntry={protocol:3,mode:'challenge120',season:'2026-11-01',uid:'flag-off',game:'keisan',attemptId:'flag-off-run',bestStreak:20,nickname:'新記録',icon:'cat',frame:'plain',title:null,badge:null,startedAt:F.Timestamp.fromMillis(startMs),endedAt:F.Timestamp.fromMillis(endMs),endReason:'wrong-answer',cutoffAt:cutoff,updatedAt:F.serverTimestamp()};
 await assertFails(F.setDoc(F.doc(child('flag-off').firestore(),'productionRankings/v1/challenge120Seasons/2026-11-01/games/keisan/players/flag-off'),flagOffEntry),'disabled feature flag must reject new entries');
 await env.withSecurityRulesDisabled(c=>F.updateDoc(F.doc(c.firestore(),'productionAdmin/v1/private/admin'),{challenge120RankingEnabled:true}));
 const legacyDb=child(legacyUid).firestore(),dedicated=F.collection(legacyDb,'productionRankings/v1/challenge120Seasons/2026-11-01/games/keisan/players');
 assert.equal((await assertSucceeds(F.getDocs(dedicated))).size,0,'recent updatedAt alone never imports old rows');
 const legacyShared=(await assertSucceeds(F.getDoc(F.doc(legacyDb,'productionRankings/v1/games/keisan/players/'+legacyUid)))).data();assert.equal(legacyShared.bestStreak,999);
 const adminRef=F.doc(child('rank-a').firestore(),'productionAdmin/v1/private/admin');await assertFails(F.updateDoc(adminRef,{challenge120RankingEnabled:false}));
 const minimums={keisan:20,'pref-name':47,'pref-place':47,alphabet:26,distribution:25,distribution2:25,exchangeAssociation:25,kotowaza:20,multiplicationProperties:25,shapeExpressions:25,keisanSummary:30};
 const games=Object.keys(minimums);
 for(const game of games){
  const uid='new-'+game,db=child(uid).firestore();
  await env.withSecurityRulesDisabled(async c=>{const seed=c.firestore();await F.setDoc(F.doc(seed,'players/'+uid),{nickname:'新記録',rankingUid:uid,points:135,bestStreak:42,appearance:{icon:'owl',frame:'plain',badge:'既存称号',limitedOwned:['frame:gold']}});await F.setDoc(F.doc(seed,'productionRankings/v1/identityLinks/'+uid),{uid,profileUid:uid,createdAt:cutoff});await F.setDoc(F.doc(seed,'productionRankings/v1/games/'+game+'/players/'+uid),row(uid,game,901,'新記録'));});
  const score=F.doc(db,'productionRankings/v1/challenge120Seasons/2026-11-01/games/'+game+'/players/'+uid);
  const entry={protocol:3,mode:'challenge120',season:'2026-11-01',uid,game,attemptId:'new-run-'+game,bestStreak:minimums[game],nickname:'新記録',icon:'owl',frame:'plain',title:'既存称号',badge:'keisan:20',startedAt:F.Timestamp.fromMillis(startMs),endedAt:F.Timestamp.fromMillis(endMs),endReason:game==='keisanSummary'?'timeout':'wrong-answer',cutoffAt:cutoff,updatedAt:F.serverTimestamp()};
  await assertSucceeds(F.setDoc(score,entry),game);
  await assertFails(F.setDoc(score,{uid,game,bestStreak:999,updatedAt:F.Timestamp.fromMillis(Date.now())}),'legacy updatedAt-only shape is rejected');
  const higher={...entry,attemptId:'better-run-'+game,bestStreak:minimums[game]+1,updatedAt:F.serverTimestamp()};await assertSucceeds(F.updateDoc(score,higher));
  await assertFails(F.updateDoc(score,{...higher,attemptId:'lower-run-'+game,bestStreak:minimums[game],updatedAt:F.serverTimestamp()}),'lower score cannot overwrite the dedicated best');
  assert.equal((await F.getDoc(F.doc(db,'players/'+uid))).data().points,135);
  assert.equal((await F.getDoc(F.doc(db,'players/'+uid))).data().bestStreak,42);
  assert.equal((await F.getDoc(F.doc(db,'players/'+uid))).data().appearance.badge,'既存称号');
  assert.deepEqual((await F.getDoc(F.doc(db,'players/'+uid))).data().appearance.limitedOwned,['frame:gold']);
  assert.equal((await F.getDoc(F.doc(db,'productionRankings/v1/games/'+game+'/players/'+uid))).data().bestStreak,901);
  const older={...entry,attemptId:'older-run-'+game,startedAt:F.Timestamp.fromMillis(cutoffMs-90000),endedAt:F.Timestamp.fromMillis(cutoffMs-30000)};
  await assertFails(F.setDoc(F.doc(child('old-'+game).firestore(),'productionRankings/v1/challenge120Seasons/2026-11-01/games/'+game+'/players/old-'+game),{...older,uid:'old-'+game}));
  await assertFails(F.deleteDoc(score));
 }
 await env.withSecurityRulesDisabled(c=>F.setDoc(F.doc(c.firestore(),'productionAdmin/v1/gameSettings/alphabet'),{status:'hidden'}));
 const blockedUid='hidden-game-child',blocked=child(blockedUid).firestore();
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();await F.setDoc(F.doc(db,'players/'+blockedUid),{nickname:'新記録',rankingUid:blockedUid});await F.setDoc(F.doc(db,'productionRankings/v1/identityLinks/'+blockedUid),{uid:blockedUid,profileUid:blockedUid,createdAt:cutoff});});
 const end=F.Timestamp.fromMillis(endMs),start=F.Timestamp.fromMillis(startMs);
 await assertFails(F.setDoc(F.doc(blocked,'productionRankings/v1/challenge120Seasons/2026-11-01/games/alphabet/players/'+blockedUid),{protocol:3,mode:'challenge120',season:'2026-11-01',uid:blockedUid,game:'alphabet',attemptId:'hidden-run-123',bestStreak:26,nickname:'新記録',icon:'owl',frame:'plain',title:null,badge:null,startedAt:start,endedAt:end,endReason:'wrong-answer',cutoffAt:cutoff,updatedAt:F.serverTimestamp()}));
 const preparingUid='preparing-game-child',preparing=child(preparingUid).firestore();
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();await F.setDoc(F.doc(db,'productionAdmin/v1/gameSettings/pref-name'),{status:'preparing'});await F.setDoc(F.doc(db,'players/'+preparingUid),{nickname:'準備中',rankingUid:preparingUid});await F.setDoc(F.doc(db,'productionRankings/v1/identityLinks/'+preparingUid),{uid:preparingUid,profileUid:preparingUid,createdAt:cutoff});});
 await assertFails(F.setDoc(F.doc(preparing,'productionRankings/v1/challenge120Seasons/2026-11-01/games/pref-name/players/'+preparingUid),{protocol:3,mode:'challenge120',season:'2026-11-01',uid:preparingUid,game:'pref-name',attemptId:'preparing-run-123',bestStreak:47,nickname:'準備中',icon:'cat',frame:'plain',title:null,badge:null,startedAt:start,endedAt:end,endReason:'wrong-answer',cutoffAt:cutoff,updatedAt:F.serverTimestamp()}));
 const mismatchUid='link-mismatch',mismatch=child(mismatchUid).firestore();
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();await F.setDoc(F.doc(db,'players/'+mismatchUid),{nickname:'別の子',rankingUid:'other-ranking-uid'});await F.setDoc(F.doc(db,'productionRankings/v1/identityLinks/'+mismatchUid),{uid:mismatchUid,profileUid:mismatchUid,createdAt:cutoff});});
 await assertFails(F.setDoc(F.doc(mismatch,'productionRankings/v1/challenge120Seasons/2026-11-01/games/keisan/players/'+mismatchUid),{protocol:3,mode:'challenge120',season:'2026-11-01',uid:mismatchUid,game:'keisan',attemptId:'mismatch-run-123',bestStreak:20,nickname:'別の子',icon:'cat',frame:'plain',title:null,badge:null,startedAt:start,endedAt:end,endReason:'wrong-answer',cutoffAt:cutoff,updatedAt:F.serverTimestamp()}));
 const unlinkedUid='unlinked-device',unlinked=child(unlinkedUid).firestore();
 await assertFails(F.setDoc(F.doc(unlinked,'productionRankings/v1/challenge120Seasons/2026-11-01/games/keisan/players/'+unlinkedUid),{protocol:3,mode:'challenge120',season:'2026-11-01',uid:unlinkedUid,game:'keisan',attemptId:'unlinked-run-123',bestStreak:20,nickname:'未連携',icon:'cat',frame:'plain',title:null,badge:null,startedAt:start,endedAt:end,endReason:'wrong-answer',cutoffAt:cutoff,updatedAt:F.serverTimestamp()}));
});

serialTest('admin nickname change remains authorized and leaves child progress unchanged',async()=>{
 const db=admin().firestore(),profile=F.doc(db,'players/profile-a'),rankRef=F.doc(db,'productionRankings/v1/games/keisan/players/rank-a');
 const challengeRef=F.doc(db,'productionRankings/v1/challenge120Seasons/2026-11-01/games/keisan/players/rank-a');await env.withSecurityRulesDisabled(async c=>{const seed=c.firestore();await F.setDoc(F.doc(seed,'productionRankings/v1/challenge120Seasons/2026-11-01/games/keisan/players/rank-a'),{protocol:3,mode:'challenge120',season:'2026-11-01',uid:'rank-a',game:'keisan',attemptId:'saved-run-123',bestStreak:24,nickname:'そら',icon:'cat',frame:'plain',title:'計算名人',badge:'keisan:20',startedAt:F.Timestamp.fromMillis(1793458860000),endedAt:F.Timestamp.fromMillis(1793458920000),endReason:'wrong-answer',cutoffAt:F.Timestamp.fromMillis(1793458800000),updatedAt:F.Timestamp.fromMillis(1793458920000)});});
 const old=(await assertSucceeds(F.getDoc(profile))).data(),oldRank=(await assertSucceeds(F.getDoc(rankRef))).data();
 const store=createFirestoreStore('production',F,db,{rankingGameIds:['keisan']});
 const result=await assertSucceeds(store.rename({uid:adminUid},{uid:'profile-a',nickname:'そら星',expectedNickname:'そら'}));
 const after=(await assertSucceeds(F.getDoc(profile))).data(),afterRank=(await assertSucceeds(F.getDoc(rankRef))).data(),afterChallenge=(await assertSucceeds(F.getDoc(challengeRef))).data();
 const audit=(await assertSucceeds(F.getDoc(F.doc(db,'productionAdmin/v1/audit',result.auditId)))).data();
 const backup=(await assertSucceeds(F.getDoc(F.doc(db,'productionAdmin/v1/backups',after.lastBackup)))).data();
 assert.equal(after.points,old.points);assert.equal(after.bestStreak,old.bestStreak);assert.deepEqual(after.appearance,old.appearance);
 assert.equal(afterRank.nickname,'そら星');assert.equal(afterRank.bestStreak,oldRank.bestStreak);assert.equal(afterChallenge.nickname,'そら星');assert.equal(afterChallenge.bestStreak,24);assert.equal(audit.reason,'管理室からのニックネーム変更');
 assert.equal(backup.data.challengeRankings[0].data.bestStreak,24);
});
});
