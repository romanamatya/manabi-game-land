import {before, after, beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import * as App from 'firebase/app';
import * as Auth from 'firebase/auth';
import * as F from 'firebase/firestore';

globalThis.window = {};
const {createAdminClient, validateConfig} = await import('data:text/javascript;base64,'+Buffer.from(await readFile(new URL('../../spark-auth.js',import.meta.url),'utf8')).toString('base64'));
const projectId = 'demo-manabi-preview';
const BASE = 'previewSpark/v1';
const cfg = {enabled:true,environment:BASE,expectedProjectId:projectId,firebase:{projectId,apiKey:'demo-api-key',authDomain:projectId+'.firebaseapp.com',appId:'demo-app'}};
let env, timerEnv, api, adminUid, password = randomBytes(24).toString('base64url');
const fixture = {nickname:'ねこ',balances:{math:37,japanese:19,social:5,science:0,english:21},best:{keisan:700,distribution:25},titles:['keisan:20','distribution:25'],owned:['icon-007','frame-11'],appearance:{icon:'cat',frame:'plain'},status:'active',other:{retained:true}};
const ref = (db, kind, id) => F.doc(db,BASE,kind,id);
const adminDB = () => env.authenticatedContext(adminUid,{firebase:{sign_in_provider:'password'},auth_time:Math.floor(Date.now()/1000)+1}).firestore();
const playerDB = () => env.authenticatedContext('p1',{firebase:{sign_in_provider:'anonymous'},auth_time:Math.floor(Date.now()/1000)+1}).firestore();
const seed = async () => env.withSecurityRulesDisabled(async context => {
 const db=context.firestore();
 await F.setDoc(ref(db,'private','admin'),{uid:adminUid,enabled:true});
 await F.setDoc(ref(db,'private','revocation'),{after:F.Timestamp.fromMillis(0),actor:'console'});
 await F.setDoc(ref(db,'players','p1'),fixture);
 await F.setDoc(ref(db,'players','p2'),{...fixture,nickname:'うさぎ'});
});
function renameBatch(db, {nickname='新しい名前', actor=adminUid, reason='表示名の確認', includeAudit=true, includeBackup=true, extra={}}={}) {
 const a=F.doc(F.collection(db,BASE,'audit')),b=F.doc(F.collection(db,BASE,'backups')),batch=F.writeBatch(db),at=F.serverTimestamp();
 batch.update(ref(db,'players','p1'),{nickname,lastAudit:a.id,lastBackup:b.id,adminUpdatedAt:at,...extra});
 if(includeAudit)batch.set(a,{actor,at,uid:'p1',target:'players/p1',action:'rename',reason,backupId:b.id,beforeName:fixture.nickname,afterName:nickname});
 if(includeBackup)batch.set(b,{actor,at,uid:'p1',target:'players/p1',kind:'rename',data:fixture});
 return batch.commit();
}
const restGet = token => fetch('http://127.0.0.1:8080/v1/projects/'+projectId+'/databases/(default)/documents/'+BASE+'/players/p1',{headers:token?{Authorization:'Bearer '+token}:{}});
const waitNextSecond = () => new Promise(resolve=>setTimeout(resolve,1100));

before(async()=>{
 env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8080,rules:await readFile('firestore.rules','utf8')}});
 timerEnv=await initializeTestEnvironment({projectId:'demo-manabi-preview-timer',firestore:{host:'127.0.0.1',port:8080,rules:await readFile('tests/challenge-prototype.rules','utf8')}});
 const signUp=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'admin-preview@'+projectId+'.invalid',password,returnSecureToken:true})});
 const account=await signUp.json();if(!account.localId)throw Error('Local auth setup failed');adminUid=account.localId;
 const appSdk={...App,initializeApp(config,name){const app=App.initializeApp(config,name);Auth.connectAuthEmulator(Auth.getAuth(app),'http://127.0.0.1:9099',{disableWarnings:true});F.connectFirestoreEmulator(F.getFirestore(app),'127.0.0.1',8080);return app;}};
 api=await createAdminClient(cfg,[appSdk,{...Auth,browserLocalPersistence:Auth.inMemoryPersistence},F]);
});
beforeEach(async()=>{await env.clearFirestore();await seed();await api.login(password);});
after(async()=>{await env?.cleanup();await timerEnv?.cleanup();await Promise.all(App.getApps().map(App.deleteApp));});

test('production configuration is rejected before SDK initialization',()=>{
 assert.throws(()=>validateConfig({...cfg,firebase:{...cfg.firebase,projectId:'manabi-game-land'}}),{code:'production-project-rejected'});
 assert.throws(()=>validateConfig({...cfg,expectedProjectId:'different-preview'}),{code:'production-project-rejected'});
 assert.throws(()=>validateConfig({...cfg,firebase:{...cfg.firebase,apiKey:'AIzaSyAhm6WMqV7yGmNRRDCeZcOk5HH-dlga9no'}}),{code:'production-project-rejected'});
 assert.throws(()=>validateConfig({...cfg,enabled:false}),{code:'backend-not-configured'});
});
test('Firebase Auth rejects an incorrect password and adapter clears user',async()=>{
 await assert.rejects(api.login(randomBytes(24).toString('base64url')));
 assert.equal(api.auth.currentUser,null);
 await assertFails(F.getDocs(F.collection(api.db,BASE,'players')));
});
test('admin can list players without displaying the technical account ID',async()=>{
 const result=await api.call('admin:snapshot');assert.equal(result.players.length,2);assert.equal(result.players[0].uid,'p1');
});
test('unauthenticated SDK and raw REST reads are denied',async()=>{
 await assertFails(F.getDocs(F.collection(env.unauthenticatedContext().firestore(),BASE,'players')));
 assert.equal((await restGet()).status,403);
});
test('anonymous player cannot list, rename, read audit, or promote itself',async()=>{
 const db=playerDB();
 await assertFails(F.getDocs(F.collection(db,BASE,'players')));
 await assertFails(renameBatch(db));
 await assertFails(F.getDocs(F.collection(db,BASE,'audit')));
 await assertFails(F.setDoc(ref(db,'private','admin'),{uid:'p1',enabled:true}));
 await assertFails(F.setDoc(ref(db,'private','revocation'),{after:F.Timestamp.fromMillis(0),actor:'p1'}));
});
test('a different password account and forged provider have no admin role',async()=>{
 await assertFails(F.getDocs(F.collection(env.authenticatedContext('other',{firebase:{sign_in_provider:'password'},auth_time:Math.floor(Date.now()/1000)}).firestore(),BASE,'players')));
 await assertFails(F.getDocs(F.collection(env.authenticatedContext(adminUid,{firebase:{sign_in_provider:'anonymous'},auth_time:Math.floor(Date.now()/1000)}).firestore(),BASE,'players')));
});
test('admin role is immutable even for the shared admin client',async()=>{
 const db=adminDB();await assertFails(F.updateDoc(ref(db,'private','admin'),{uid:'other'}));await assertFails(F.deleteDoc(ref(db,'private','admin')));
});
test('atomic rename saves history and backup while preserving all other player data',async()=>{
 await api.call('admin:rename',{uid:'p1',nickname:'新しい名前',expectedNickname:'ねこ',reason:'表示名の修正',confirm:true});
 const db=adminDB(),saved=(await F.getDoc(ref(db,'players','p1'))).data();
 assert.equal(saved.nickname,'新しい名前');for(const key of Object.keys(fixture).filter(k=>k!=='nickname'))assert.deepEqual(saved[key],fixture[key]);
 assert.deepEqual((await F.getDoc(ref(db,'players','p2'))).data(),{...fixture,nickname:'うさぎ'});
 const log=(await F.getDocs(F.collection(db,BASE,'audit'))).docs[0].data();assert.equal(log.beforeName,'ねこ');assert.equal(log.afterName,'新しい名前');assert.equal(log.actor,adminUid);
 const backup=(await F.getDoc(ref(db,'backups',saved.lastBackup))).data();assert.deepEqual(backup.data,fixture);
});
test('concurrent data written before rename transaction is retained',async()=>{
 await env.withSecurityRulesDisabled(c=>F.updateDoc(ref(c.firestore(),'players','p1'),{'balances.math':99,'best.keisan':701}));
 await api.call('admin:rename',{uid:'p1',nickname:'変更後',expectedNickname:'ねこ',reason:'競合確認',confirm:true});
 const p=(await F.getDoc(ref(adminDB(),'players','p1'))).data();assert.equal(p.balances.math,99);assert.equal(p.best.keisan,701);
});
test('stale name edit is rejected without an audit or data write',async()=>{
 await assert.rejects(api.call('admin:rename',{uid:'p1',nickname:'変更後',expectedNickname:'古い名前',reason:'変更確認',confirm:true}),{code:'name-conflict'});
 assert.equal((await F.getDocs(F.collection(adminDB(),BASE,'audit'))).size,0);
});
test('duplicate rename produces one history record',async()=>{
 await api.call('admin:rename',{uid:'p1',nickname:'変更後',expectedNickname:'ねこ',reason:'変更確認',confirm:true});
 await api.call('admin:rename',{uid:'p1',nickname:'変更後',expectedNickname:'変更後',reason:'変更確認',confirm:true});
 assert.equal((await F.getDocs(F.collection(adminDB(),BASE,'audit'))).size,1);
});
test('direct rename without history or backup is denied',async()=>{
 const db=adminDB();await assertFails(F.updateDoc(ref(db,'players','p1'),{nickname:'書き換え'}));
 await assertFails(renameBatch(db,{includeAudit:false}));await assertFails(renameBatch(db,{includeBackup:false}));
});
test('name change cannot mutate points, title, rank or forged actor',async()=>{
 await assertFails(renameBatch(adminDB(),{extra:{balances:{math:0}}}));
 await assertFails(renameBatch(adminDB(),{actor:'imposter'}));
 await assertFails(renameBatch(adminDB(),{nickname:'<script>'}));
 await assertFails(renameBatch(adminDB(),{nickname:'a\nb'}));
 await assertFails(renameBatch(adminDB(),{nickname:'1234567890123'}));
});
test('audit and backup are append only and cannot be fabricated standalone',async()=>{
 const db=adminDB();await renameBatch(db);
 const audit=(await F.getDocs(F.collection(db,BASE,'audit'))).docs[0];
 await assertFails(F.updateDoc(audit.ref,{reason:'改ざん'}));await assertFails(F.deleteDoc(audit.ref));
 const b=(await F.getDocs(F.collection(db,BASE,'backups'))).docs[0];await assertFails(F.deleteDoc(b.ref));
 await assertFails(F.setDoc(F.doc(F.collection(db,BASE,'audit')),{...audit.data(),at:F.serverTimestamp()}));
});
test('disabled admin and revoked auth_time cannot read or write',async()=>{
 await env.withSecurityRulesDisabled(c=>F.setDoc(ref(c.firestore(),'private','revocation'),{after:F.Timestamp.now(),actor:adminUid}));
 await assertFails(F.getDocs(F.collection(api.db,BASE,'players')));await assert.rejects(api.verify());
 await env.withSecurityRulesDisabled(c=>F.updateDoc(ref(c.firestore(),'private','admin'),{enabled:false}));
 await assertFails(F.getDocs(F.collection(adminDB(),BASE,'players')));
});
test('logout invalidates the old bearer token for raw direct requests',async()=>{
 const token=await Auth.getIdToken(api.auth.currentUser);assert.equal((await restGet(token)).status,200);
 await api.logout();assert.equal(api.auth.currentUser,null);assert.equal((await restGet(token)).status,403);
});
test('production-like root paths and later management features are denied',async()=>{
 const db=adminDB();await assertFails(F.getDocs(F.collection(db,'players')));await assertFails(F.setDoc(F.doc(db,'players','p1'),{nickname:'x'}));
 await assertFails(F.setDoc(ref(db,'games','keisan'),{published:false}));
 await assert.rejects(api.call('admin:reset',{game:'all',confirm:true}),{code:'feature-unverified'});
});
test('password change rejects old password and invalidates previous token',async()=>{
 const token=await Auth.getIdToken(api.auth.currentUser),next=randomBytes(24).toString('base64url');
 await api.changePassword(password,next);assert.equal(api.auth.currentUser,null);assert.equal((await restGet(token)).status,403);
 await assert.rejects(api.login(password));password=next;await waitNextSecond();await api.login(password);await api.verify();
});

test('timer research: immutable server timestamp, sequential updates, deadline expiry',async()=>{
 await timerEnv.clearFirestore();const db=timerEnv.authenticatedContext('timer-player').firestore();const target=F.doc(db,'challengeResearch/timer-player/attempts/a');
 await assertSucceeds(F.setDoc(target,{startedAt:F.serverTimestamp(),revision:0,streak:25}));
 const first=(await F.getDoc(target)).data();assert.ok(first.startedAt.toMillis()>0);
 await assertSucceeds(F.updateDoc(target,{revision:1,streak:26}));
 await assertFails(F.updateDoc(target,{revision:1,streak:27})); // stale second device
 await assertFails(F.updateDoc(target,{startedAt:F.serverTimestamp(),revision:2}));
 await assertSucceeds(F.updateDoc(target,{revision:2,streak:0}));
 await timerEnv.withSecurityRulesDisabled(c=>F.updateDoc(F.doc(c.firestore(),'challengeResearch/timer-player/attempts/a'),{startedAt:F.Timestamp.fromMillis(Date.now()-181000)}));
 await assertFails(F.updateDoc(target,{revision:3,streak:1}));
 assert.equal((await F.getDoc(target)).data().revision,2);
});
