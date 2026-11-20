import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assertSucceeds,assertFails,initializeTestEnvironment} from '@firebase/rules-unit-testing';
import * as F from 'firebase/firestore';
import {createRegistrationStore} from '../../tools/game-registration-store.mjs';
const mode=process.env.MGL_REGISTRATION_RULES==='preview'?'preview':'production';
const root=mode==='preview'?'previewSpark/v1':'productionAdmin/v1',adminUid='registration-admin';let env,admin,child,other;
const password={firebase:{sign_in_provider:'password'},auth_time:200};
const anonymous={firebase:{sign_in_provider:'anonymous'},auth_time:200};
const ref=(db,group,id)=>F.doc(db,root+'/'+group+'/'+id);
const definition=id=>({id,name:'登録テスト',subject:'math',unit:'geometry',entry:'games/'+id+'.html',enabled:true,manifestSHA256:'a'.repeat(64)});
before(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-manabi-game-registration',firestore:{rules:await readFile('firebase/'+mode+'-game-registration-candidate.rules','utf8')}});
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();
  await F.setDoc(ref(db,'private','admin'),{uid:adminUid,enabled:true,managementEnabled:true});
  await F.setDoc(ref(db,'private','revocation'),{after:F.Timestamp.fromMillis(1000)});
  await F.setDoc(ref(db,'gameSettings','keisan'),{status:'published',campaign:{enabled:false}});
  await F.setDoc(F.doc(db,'players','registration-child'),{nickname:'テスト児童A',points:12,bestStreak:9});
  await F.setDoc(F.doc(db,'players','registration-other'),{nickname:'テスト児童B',points:20,bestStreak:15});
 });
 admin=env.authenticatedContext(adminUid,password).firestore();
 child=env.authenticatedContext('registration-child',anonymous).firestore();
 other=env.authenticatedContext('registration-other',anonymous).firestore();
});
after(async()=>{await env?.cleanup();});
test('registered new game supports audited preparing/hidden/published without another Rules allowlist',async()=>{
 const store=createRegistrationStore(F,admin,mode),game='futureFixtureOne';
 await assertSucceeds(store.register({uid:adminUid},definition(game)));
 await assert.rejects(store.setVisibility({uid:adminUid},game,'published'),/prepare-before-publish/);
 for(const status of ['preparing','hidden','published']){
  const result=await assertSucceeds(store.setVisibility({uid:adminUid},game,status));
  const current=(await F.getDoc(ref(admin,'gameSettings',game))).data();assert.equal(current.status,status);
  assert.equal(current.lastAudit,result.auditId);const audit=(await F.getDoc(ref(admin,'registrationAudit',result.auditId))).data();
  assert.equal(audit.after.status,status);assert.equal(audit.before?.status ?? null,({preparing:null,hidden:'preparing',published:'hidden'})[status]);
 }
});
test('unregistered and disabled registry games cannot gain visibility writes',async()=>{
 const store=createRegistrationStore(F,admin,mode);
 await assertFails(store.setVisibility({uid:adminUid},'unregisteredFixture','preparing'));
 await assertSucceeds(store.register({uid:adminUid},{...definition('disabledFixture'),enabled:false}));
 await assertFails(store.setVisibility({uid:adminUid},'disabledFixture','preparing'));
});
test('children and wrong or anonymous administrators cannot register or change visibility',async()=>{
 for(const [uid,db] of [['registration-child',child],['registration-other',other],['wrong-admin',env.authenticatedContext('wrong-admin',password).firestore()],[adminUid,env.authenticatedContext(adminUid,anonymous).firestore()]]){
  await assertFails(createRegistrationStore(F,db,mode).register({uid},definition('forbiddenFixture')));
  await assertFails(F.setDoc(ref(db,'gameSettings','futureFixtureOne'),{status:'hidden'}));
 }
});
test('invalid registry metadata, unsigned direct writes and arbitrary settings fields are rejected',async()=>{
 const store=createRegistrationStore(F,admin,mode);
 await assertFails(F.setDoc(ref(admin,'gameRegistry','directFixture'),definition('directFixture')));
 await assertFails(store.register({uid:adminUid},{...definition('badFixture'),entry:'games/keisan.html'}));
 await assertFails(F.updateDoc(ref(admin,'gameSettings','futureFixtureOne'),{campaign:{enabled:true},status:'hidden',updatedAt:F.serverTimestamp()}));
 await assertFails(F.deleteDoc(ref(admin,'gameRegistry','futureFixtureOne')));
 await assertFails(F.deleteDoc(ref(admin,'gameSettings','futureFixtureOne')));
});
test('profile get/list protection and all existing record fields remain unchanged', {skip:mode==='preview'},async()=>{
 const self=await assertSucceeds(F.getDoc(F.doc(child,'players','registration-child')));assert.equal(self.data().points,12);
 await assertFails(F.getDoc(F.doc(other,'players','registration-child')));
 await assertFails(F.getDocs(F.collection(child,'players')));
 const managed=await assertSucceeds(F.getDoc(F.doc(admin,'players','registration-child')));assert.deepEqual(managed.data(),{nickname:'テスト児童A',points:12,bestStreak:9});
 assert.deepEqual((await F.getDoc(ref(admin,'gameSettings','keisan'))).data(),{status:'published',campaign:{enabled:false}});
});
