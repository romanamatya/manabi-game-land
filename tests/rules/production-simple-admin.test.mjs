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
 await F.setDoc(F.doc(db,'productionAdmin/v1/private/admin'),{uid:adminUid,enabled:true,renameEnabled:true,suspensionEnabled:true,managementEnabled:true});
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

serialTest('anonymous game sessions can read one game setting without permission to enumerate or change settings',async()=>{
 const anonymous=child('anonymous-game-session').firestore();
 await assertSucceeds(F.getDoc(F.doc(anonymous,'productionAdmin/v1/gameSettings/keisan')));
 await assertFails(F.getDocs(F.collection(anonymous,'productionAdmin/v1/gameSettings')));
 await assertFails(F.setDoc(F.doc(anonymous,'productionAdmin/v1/gameSettings/keisan'),{status:'hidden'}));
 const unauthenticated=env.unauthenticatedContext().firestore();
 await assertFails(F.getDoc(F.doc(unauthenticated,'productionAdmin/v1/gameSettings/keisan')));
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

serialTest('linked Suichoku profile UID can publish only its own monotonic shared record without changing management scope',async()=>{
 const student=child('rank-a').firestore(),rank=F.doc(student,'productionRankings/v1/games/suichoku/players/rank-a');
 const profileBefore=(await assertSucceeds(F.getDoc(F.doc(student,'players/profile-a')))).data();
 await assertSucceeds(F.setDoc(rank,row('rank-a','suichoku',25,'そら',F.serverTimestamp())));
 await assertSucceeds(F.updateDoc(rank,row('rank-a','suichoku',29,'そら',F.serverTimestamp())));
 await assertFails(F.updateDoc(rank,row('rank-a','suichoku',20,'そら',F.serverTimestamp())));
 const other=child('rank-b').firestore();await assertFails(F.updateDoc(F.doc(other,'productionRankings/v1/games/suichoku/players/rank-a'),row('rank-a','suichoku',40,'そら',F.serverTimestamp())));
 const rows=await assertSucceeds(F.getDocs(F.collection(other,'productionRankings/v1/games/suichoku/players')));assert.equal(rows.size,1);assert.equal(rows.docs[0].data().bestStreak,29);
 await assertFails(F.setDoc(F.doc(student,'productionAdmin/v1/gameSettings/suichoku'),{status:'hidden'}));
 await env.withSecurityRulesDisabled(c=>F.setDoc(F.doc(c.firestore(),'productionAdmin/v1/gameSettings/suichoku'),{status:'hidden'}));
 await assertFails(F.updateDoc(rank,row('rank-a','suichoku',30,'そら',F.serverTimestamp())));
 assert.equal((await assertSucceeds(F.getDoc(rank))).data().bestStreak,29);
 const profileAfter=(await assertSucceeds(F.getDoc(F.doc(student,'players/profile-a')))).data();assert.equal(profileAfter.points,profileBefore.points);assert.equal(profileAfter.bestStreak,profileBefore.bestStreak);assert.equal(profileAfter.rankingUid,'rank-a');
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

serialTest('admin nickname change remains authorized and leaves child progress unchanged',async()=>{
 const db=admin().firestore(),profile=F.doc(db,'players/profile-a'),rankRef=F.doc(db,'productionRankings/v1/games/keisan/players/rank-a');
 const old=(await assertSucceeds(F.getDoc(profile))).data(),oldRank=(await assertSucceeds(F.getDoc(rankRef))).data();
 const store=createFirestoreStore('production',F,db,{rankingGameIds:['keisan']});
 const result=await assertSucceeds(store.rename({uid:adminUid},{uid:'profile-a',nickname:'そら星',expectedNickname:'そら'}));
 const after=(await assertSucceeds(F.getDoc(profile))).data(),afterRank=(await assertSucceeds(F.getDoc(rankRef))).data();
 const audit=(await assertSucceeds(F.getDoc(F.doc(db,'productionAdmin/v1/audit',result.auditId)))).data();
 assert.equal(after.points,old.points);assert.equal(after.bestStreak,old.bestStreak);assert.deepEqual(after.appearance,old.appearance);
 assert.equal(afterRank.nickname,'そら星');assert.equal(afterRank.bestStreak,oldRank.bestStreak);assert.equal(audit.reason,'管理室からのニックネーム変更');
});
});
