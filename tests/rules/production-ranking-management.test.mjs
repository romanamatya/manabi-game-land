import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import * as F from 'firebase/firestore';

const projectId='demo-manabi-ranking-management',adminId='admin-owner';
const profilePath=uid=>`players/${uid}`;
const linkPath=uid=>`productionRankings/v1/identityLinks/${uid}`;
const rowPath=(game='keisan',id='0_child-a')=>`productionRankings/v1/games/${game}/players/${id}`;
const controlPath=game=>`productionRankings/v1/gameControl/${game}`;
const backupPath=id=>`productionAdmin/v1/rankingBackups/${id}`;
const backupEntryPath=(id,uid)=>`${backupPath(id)}/entries/${uid}`;
const auditPath=id=>`productionAdmin/v1/rankingAudit/${id}`;
const lockPath=(game,uid)=>`productionAdmin/v1/rankingLocks/${game}_${uid}`;
const row=(uid='child-a',game='keisan',bestStreak=12,extra={})=>({uid,game,nickname:'そら',bestStreak,icon:'cat',frame:'plain',title:'計算名人',badge:'keisan:10',updatedAt:F.serverTimestamp(),...extra});
let env;
const child=(uid='child-a')=>env.authenticatedContext(uid,{firebase:{sign_in_provider:'anonymous'}}).firestore();
const admin=()=>env.authenticatedContext(adminId,{firebase:{sign_in_provider:'password'},auth_time:Math.floor(Date.now()/1000)}).firestore();

async function seedBase({rankingManagementEnabled=true}={}){
 await env.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();
  await F.setDoc(F.doc(db,'productionAdmin/v1/private/admin'),{uid:adminId,enabled:true,renameEnabled:true,suspensionEnabled:true,rankingManagementEnabled});
  await F.setDoc(F.doc(db,'productionAdmin/v1/private/revocation'),{after:F.Timestamp.fromMillis(Date.now()-120000)});
  for(const uid of ['child-a','child-b','child-c']){
   await F.setDoc(F.doc(db,profilePath(uid)),{nickname:uid==='child-a'?'そら':uid==='child-b'?'はな':'ゆう',rankingUid:uid,accessStatus:'active'});
   await F.setDoc(F.doc(db,linkPath(uid)),{uid,profileUid:uid,createdAt:F.Timestamp.now()});
  }
 });
}
async function readyGeneration(db,game='keisan',generation=0){await env.withSecurityRulesDisabled(c=>F.setDoc(F.doc(c.firestore(),controlPath(game)),{generation,phase:'ready',writeLocked:false,schemaVersion:2,backupId:'migration-base',updatedAt:F.Timestamp.now()}));}
async function writeRow(ref,data){return F.setDoc(ref,{...data,updatedAt:F.serverTimestamp()});}
async function adminManage({game='keisan',uid='child-a',id='0_child-a',action='adjust',beforeBest=12,afterBest=17,beforeVisibility='active',afterVisibility=beforeVisibility}){
 const db=admin(),backupId='backup-'+action+'-'+uid,auditId='audit-'+action+'-'+uid,at=F.serverTimestamp();
 const target=F.doc(db,rowPath(game,id)),snap=await F.getDoc(target);assert.equal(snap.exists(),true);const before=snap.data();
 await F.runTransaction(db,async tx=>{
  tx.set(F.doc(db,backupPath(backupId)),{actor:adminId,at,kind:'entry',status:'complete',game,uid,generation:before.generation,row:before,reason:'確認済みの管理操作'});
  tx.set(F.doc(db,auditPath(auditId)),{actor:adminId,at,action,game,uid,reason:'確認済みの管理操作',backupId,beforeBest,afterBest,beforeVisibility,afterVisibility});
  tx.set(F.doc(db,lockPath(game,uid)),{actor:adminId,at,game,uid,protected:true,action,reason:'確認済みの管理操作',auditId});
 });
 await F.updateDoc(target,{bestStreak:afterBest,visibility:afterVisibility,updatedAt:at,lastManagementAudit:auditId,lastManagementBackup:backupId});
}

before(async()=>{env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8180,rules:await readFile(new URL('../../firebase/production-ranking-management-proposed.rules',import.meta.url),'utf8')}});});
beforeEach(async()=>{await env.clearFirestore();await seedBase();});
after(async()=>env?.cleanup());

test('legacy ranking writes still work before an explicit generation migration',async()=>{
 const db=child(),ref=F.doc(db,rowPath('keisan','child-a'));
 await assertSucceeds(writeRow(ref,row()));
 const read=await assertSucceeds(F.getDoc(ref));assert.equal(read.data().bestStreak,12);
});

test('only the owner can post into the active generation and readers must query active rows',async()=>{
 await readyGeneration(admin());
 const a=child('child-a'),b=child('child-b');
 await assertSucceeds(F.getDoc(F.doc(a,controlPath('keisan'))));
 await assertSucceeds(writeRow(F.doc(a,rowPath()),row('child-a','keisan',12,{generation:0,visibility:'active'})));
 await assertFails(writeRow(F.doc(b,rowPath()),row('child-a','keisan',13,{generation:0,visibility:'active'})));
 await assertSucceeds(F.getDoc(F.doc(a,rowPath())));
 const visible=await assertSucceeds(F.getDocs(F.query(F.collection(a,'productionRankings/v1/games/keisan/players'),F.where('visibility','==','active'),F.where('generation','==',0))));
 assert.equal(visible.size,1);assert.equal(visible.docs[0].id,'0_child-a');
 await env.withSecurityRulesDisabled(c=>F.setDoc(F.doc(c.firestore(),rowPath('keisan','0_child-b')),{...row('child-b','keisan',20,{generation:0,visibility:'excluded'}),updatedAt:F.Timestamp.now()}));
 const visibleWithExcluded=await assertSucceeds(F.getDocs(F.query(F.collection(a,'productionRankings/v1/games/keisan/players'),F.where('visibility','==','active'),F.where('generation','==',0))));assert.equal(visibleWithExcluded.size,1);
 console.error('STEP visible query');
 await assertFails(F.getDoc(F.doc(a,rowPath('keisan','0_child-b'))));
 await assertFails(F.getDocs(F.collection(a,'productionRankings/v1/games/keisan/players')));
});

test('children cannot change generation, exclusion state, audit, backup, lock, or game control',async()=>{
 await readyGeneration(admin());const db=child();
 await assertFails(writeRow(F.doc(db,rowPath()),row('child-a','keisan',13,{generation:0,visibility:'excluded'})));
 await assertFails(writeRow(F.doc(db,rowPath()),row('child-a','keisan',13,{generation:1,visibility:'active'})));
 await assertFails(F.setDoc(F.doc(db,controlPath('keisan')),{generation:4,phase:'ready',writeLocked:false,schemaVersion:2,updatedAt:F.serverTimestamp()}));
 await assertFails(F.setDoc(F.doc(db,auditPath('forged')),{actor:'child-a',at:F.serverTimestamp(),action:'exclude',game:'keisan',uid:'child-b',reason:'bad',backupId:'x',beforeBest:12,afterBest:12,beforeVisibility:'active',afterVisibility:'excluded'}));
 await assertFails(F.setDoc(F.doc(db,backupPath('forged')),{actor:'child-a',at:F.serverTimestamp(),kind:'reset',status:'complete',game:'keisan',generation:0,rowCount:0,reason:'bad'}));
 await assertFails(F.setDoc(F.doc(db,lockPath('keisan','child-a')),{actor:'child-a',at:F.serverTimestamp(),game:'keisan',uid:'child-a',protected:true,reason:'bad',action:'exclude',auditId:'bad'}));
});

test('admin correction is audited, backed up, and cannot be overwritten by a stale player client',async()=>{
 await readyGeneration(admin());const db=admin();await env.withSecurityRulesDisabled(c=>F.setDoc(F.doc(c.firestore(),rowPath()),{...row('child-a','keisan',12,{generation:0,visibility:'active'}),updatedAt:F.Timestamp.now()}));
 await assertSucceeds(adminManage({afterBest:7}));
 const saved=await assertSucceeds(F.getDoc(F.doc(db,rowPath())));assert.equal(saved.data().bestStreak,7);
 const ordinary=child();await assertFails(writeRow(F.doc(ordinary,rowPath()),row('child-a','keisan',12,{generation:0,visibility:'active'})));
 const backup=await assertSucceeds(F.getDoc(F.doc(db,backupPath('backup-adjust-child-a'))));assert.equal(backup.data().row.bestStreak,12);
 const history=await assertSucceeds(F.getDoc(F.doc(db,auditPath('audit-adjust-child-a'))));assert.equal(history.data().beforeBest,12);assert.equal(history.data().afterBest,7);
});

test('admin exclusion hides a row, restore reveals it, and the record remains protected',async()=>{
 await readyGeneration(admin());const db=admin();await env.withSecurityRulesDisabled(c=>F.setDoc(F.doc(c.firestore(),rowPath('keisan','0_child-a')),{...row('child-a','keisan',12,{generation:0,visibility:'active'}),updatedAt:F.Timestamp.now()}));
 await assertSucceeds(adminManage({action:'exclude',beforeBest:12,afterBest:12,beforeVisibility:'active',afterVisibility:'excluded'}));
 const ordinary=child();const empty=await assertSucceeds(F.getDocs(F.query(F.collection(ordinary,'productionRankings/v1/games/keisan/players'),F.where('visibility','==','active'),F.where('generation','==',0))));assert.equal(empty.size,0);
 await assertSucceeds(adminManage({action:'restore',beforeBest:12,afterBest:12,beforeVisibility:'excluded',afterVisibility:'active'}));
 const visible=await assertSucceeds(F.getDocs(F.query(F.collection(ordinary,'productionRankings/v1/games/keisan/players'),F.where('visibility','==','active'),F.where('generation','==',0))));assert.equal(visible.size,1);
 await assertFails(writeRow(F.doc(ordinary,rowPath('keisan','0_child-a')),row('child-a','keisan',14,{generation:0,visibility:'active',lastManagementAudit:'audit-restore-child-a',lastManagementBackup:'backup-restore-child-a'})));
});

test('a ranking migration copies legacy rows without altering or exposing their old documents',async()=>{
 const childDb=child(),legacy=F.doc(childDb,rowPath('keisan','child-a'));await assertSucceeds(writeRow(legacy,row('child-a','keisan',12)));
 const a=admin(),backupId='migration-1',at=F.serverTimestamp();
 await assertSucceeds(F.runTransaction(a,async tx=>{tx.set(F.doc(a,controlPath('keisan')),{generation:0,phase:'migrating',writeLocked:true,schemaVersion:2,backupId,updatedAt:at});tx.set(F.doc(a,backupPath(backupId)),{actor:adminId,at,kind:'migration',game:'keisan',generation:0,status:'copying',rowCount:1,reason:'移行テスト'});}));
 const source=(await F.getDoc(F.doc(a,rowPath('keisan','child-a')))).data();
 await assertSucceeds(F.setDoc(F.doc(a,backupEntryPath(backupId,'child-a')),{uid:'child-a',row:source}));
 await assertSucceeds(F.setDoc(F.doc(a,rowPath('keisan','0_child-a')),{...source,generation:0,visibility:'active'}));
 const locked=F.doc(a,controlPath('keisan'));await assertFails(F.getDocs(F.query(F.collection(childDb,'productionRankings/v1/games/keisan/players'),F.where('visibility','==','active'),F.where('generation','==',0))));
 await assertSucceeds(F.updateDoc(locked,{phase:'ready',writeLocked:false,updatedAt:F.serverTimestamp()}));
 const listed=await assertSucceeds(F.getDocs(F.query(F.collection(childDb,'productionRankings/v1/games/keisan/players'),F.where('visibility','==','active'),F.where('generation','==',0))));assert.equal(listed.size,1);assert.equal(listed.docs[0].id,'0_child-a');
 await assertFails(F.getDoc(legacy));
 await assertFails(writeRow(F.doc(childDb,rowPath('keisan','child-a')),row('child-a','keisan',15)));
});

test('reset locks writes until backup completes, advances one game generation, and preserves old rows',async()=>{
 const a=admin(),ordinary=child(),old=F.doc(a,rowPath('keisan','0_child-a'));await readyGeneration(a);
 await env.withSecurityRulesDisabled(c=>F.setDoc(F.doc(c.firestore(),rowPath('keisan','0_child-a')),{...row('child-a','keisan',20,{generation:0,visibility:'active'}),updatedAt:F.Timestamp.now()}));
 const before=(await F.getDoc(old)).data(),backupId='reset-1',at=F.serverTimestamp();
 await assertSucceeds(F.runTransaction(a,async tx=>{tx.set(F.doc(a,controlPath('keisan')),{generation:0,phase:'resetting',writeLocked:true,schemaVersion:2,backupId,updatedAt:at});tx.set(F.doc(a,backupPath(backupId)),{actor:adminId,at,kind:'reset',game:'keisan',generation:0,status:'copying',rowCount:1,reason:'学期切り替え'});}));
 await assertFails(writeRow(F.doc(ordinary,rowPath('keisan','0_child-a')),row('child-a','keisan',21,{generation:0,visibility:'active'})));
 await assertSucceeds(F.setDoc(F.doc(a,backupEntryPath(backupId,'child-a')),{uid:'child-a',row:before}));
 const finalAt=F.serverTimestamp();await assertSucceeds(F.runTransaction(a,async tx=>{tx.update(F.doc(a,controlPath('keisan')),{generation:1,phase:'ready',writeLocked:false,previousGeneration:0,updatedAt:finalAt});tx.update(F.doc(a,backupPath(backupId)),{status:'complete',completedAt:finalAt});tx.set(F.doc(a,auditPath('reset-audit')),{actor:adminId,at:finalAt,action:'reset',game:'keisan',reason:'学期切り替え',backupId,beforeGeneration:0,afterGeneration:1,rowCount:1});}));
 const oldStillThere=await assertSucceeds(F.getDoc(old));assert.equal(oldStillThere.data().bestStreak,20);
 await assertSucceeds(writeRow(F.doc(ordinary,rowPath('keisan','1_child-a')),row('child-a','keisan',5,{generation:1,visibility:'active'})));
 const newRows=await assertSucceeds(F.getDocs(F.query(F.collection(ordinary,'productionRankings/v1/games/keisan/players'),F.where('visibility','==','active'),F.where('generation','==',1))));assert.equal(newRows.size,1);assert.equal(newRows.docs[0].data().bestStreak,5);
 await assertFails(F.getDocs(F.query(F.collection(ordinary,'productionRankings/v1/games/keisan/players'),F.where('visibility','==','active'),F.where('generation','==',0))));
});

test('the ranking-management flag gates writes and other children remain unaffected',async()=>{
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();await F.updateDoc(F.doc(db,'productionAdmin/v1/private/admin'),{rankingManagementEnabled:false});});
 await readyGeneration(admin());
 const db=admin();await env.withSecurityRulesDisabled(c=>F.setDoc(F.doc(c.firestore(),rowPath()),{...row('child-a','keisan',12,{generation:0,visibility:'active'}),updatedAt:F.Timestamp.now()}));
 await assertFails(adminManage({afterBest:8}));
});
