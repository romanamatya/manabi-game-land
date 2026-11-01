import {after,before,beforeEach,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import * as F from 'firebase/firestore';

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
 refs.forEach((ref,i)=>batch.set(ref,{...values[i],lastAudit:audit.id,lastBackup:backup.id}));
 await batch.commit();return {audit,backup};
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

serialTest('admin nickname change remains authorized and leaves child progress unchanged',async()=>{
 const db=admin().firestore(),profile=F.doc(db,'players/profile-a'),rankRef=F.doc(db,'productionRankings/v1/games/keisan/players/rank-a');
 const old=(await assertSucceeds(F.getDoc(profile))).data(),oldRank=(await assertSucceeds(F.getDoc(rankRef))).data(),at=F.serverTimestamp(),batch=F.writeBatch(db);
 batch.set(F.doc(db,'productionAdmin/v1/backups/rename-backup'),{actor:adminUid,at,uid:'profile-a',target:'players/profile-a',kind:'rename',data:{player:old,links:[{uid:'rank-a',profileUid:'profile-a'}],rankings:[{uid:'rank-a',game:'keisan',data:oldRank}]}});
 batch.set(F.doc(db,'productionAdmin/v1/audit/rename-audit'),{actor:adminUid,at,uid:'profile-a',target:'players/profile-a',action:'rename',reason:'本人確認済み',backupId:'rename-backup',beforeName:'そら',afterName:'そら星'});
 batch.update(profile,{nickname:'そら星',lastAudit:'rename-audit',lastBackup:'rename-backup',adminUpdatedAt:at});batch.update(rankRef,{nickname:'そら星',updatedAt:at});
 await assertSucceeds(batch.commit());const after=(await assertSucceeds(F.getDoc(profile))).data();
 assert.equal(after.points,old.points);assert.equal(after.bestStreak,old.bestStreak);assert.deepEqual(after.appearance,old.appearance);
});
});
