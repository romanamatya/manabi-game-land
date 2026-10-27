import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import * as F from 'firebase/firestore';
globalThis.window={};
const {createPlayerClient}=await import('../../player-sync-api.js');
const M=await import('../../player-sync-model.js');
const context={};context.window=context;vm.createContext(context);
for(const path of ['../../economy-core.js','../../profile-catalog.js'])vm.runInContext(await readFile(new URL(path,import.meta.url),'utf8'),context);
const core=context.ManabiEconomyCore,catalog=context.ManabiProfileCatalog;
const cfg={enabled:true,environment:'previewSpark/v1',expectedProjectId:'demo-manabi-preview',firebase:{projectId:'demo-manabi-preview',authDomain:'demo-manabi-preview.firebaseapp.com',apiKey:'demo-api-key',appId:'demo-app'}};
const base='previewSpark/v1';let env;
const client=async(uid='child-a',testScope=false)=>{const db=env.authenticatedContext(uid,{firebase:{sign_in_provider:'anonymous'},auth_time:Math.floor(Date.now()/1000)}).firestore(),auth={currentUser:{uid,isAnonymous:true},authStateReady:async()=>{}};return createPlayerClient(cfg,[{getApps:()=>[],initializeApp:()=>({options:cfg.firebase})},{getAuth:()=>auth,setPersistence:async()=>{},browserLocalPersistence:{}},{...F,getFirestore:()=>db}],{testScope});};
const local=()=>({nickname:'ねこ',balances:{...M.zero(),math:200},best:Object.fromEntries(M.GAMES.map(g=>[g,0])),titles:[],owned:[],appearance:{icon:'cat',frame:'plain',badge:null}});
const meta=(id='device-aaaaaaaa',balances={...M.zero(),math:200})=>({deviceId:id,baseline:{balances},earned:M.zero(),appearanceBase:0,appearanceDirty:false});
const pRef=(db,uid='child-a',scope='players')=>F.doc(db,base,scope,uid);
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-manabi-preview',firestore:{host:'127.0.0.1',port:8080,rules:await readFile('firestore.rules','utf8')}})});
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(c=>Promise.all([F.setDoc(F.doc(c.firestore(),base,'private','admin'),{uid:'admin-for-sync-test',enabled:true}),F.setDoc(F.doc(c.firestore(),base,'private','revocation'),{after:F.Timestamp.fromMillis(0),actor:'console'})]));});
after(()=>env.cleanup());
test('imports local points, best, titles, owned items and appearance without loss',async()=>{
 const a=await client(),l=local(),m=meta();l.best.keisan=700;l.titles=['keisan:20'];l.owned=['frame-01'];l.appearance.frame='frame-01';
 const r=await a.push(l,m,catalog,core);assert.equal(r.player.uid,'child-a');assert.equal(r.player.balances.math,200);assert.equal(r.player.best.keisan,700);assert.deepEqual(r.player.owned,['frame-01']);assert.equal(r.player.appearance.frame,'frame-01');
});
test('replaying an acknowledged earned counter never credits it twice',async()=>{
 const a=await client(),l=local(),m=meta();m.earned.math=3;const first=await a.push(l,m,catalog,core);const second=await a.push(l,m,catalog,core);assert.equal(second.player.balances.math,203);assert.equal(second.player.revision,first.player.revision);
});
test('stale pre-purchase balance cannot restore spent points',async()=>{
 const a=await client(),l=local(),m=meta();await a.push(l,m,catalog,core);await a.buy('frame-01','math',core);
 const r=await a.push({...l,balances:{...l.balances,math:200}},m,catalog,core);assert.equal(r.player.balances.math,150);assert.ok(r.player.owned.includes('frame-01'));
});
test('two devices credit only their own unacknowledged deltas and retain maximum best',async()=>{
 const a=await client(),b=await client(),l=local(),ma=meta(),mb=meta('device-bbbbbbbb',M.zero());await a.push(l,ma,catalog,core);
 const la=structuredClone(l),lb=structuredClone(l);ma.earned.math=4;mb.earned.math=3;la.best.keisan=700;lb.best.keisan=50;lb.best.distribution=25;
 await Promise.all([a.push(la,ma,catalog,core),b.push(lb,mb,catalog,core)]);
 const r=await a.pull(ma.deviceId);assert.equal(r.player.balances.math,207);assert.equal(r.player.best.keisan,700);assert.equal(r.player.best.distribution,25);
});
test('concurrent double purchase creates one receipt and deducts once',async()=>{
 const a=await client(),l=local(),m=meta();await a.push(l,m,catalog,core);const out=await Promise.allSettled([a.buy('frame-01','math',core),a.buy('frame-01','math',core)]);assert.equal(out.filter(x=>x.status==='fulfilled').length,1);assert.equal((await a.pull(m.deviceId)).player.balances.math,150);assert.equal((await F.getDoc(F.doc(pRef(a.db),'purchases','frame-01'))).data().price,50);
});
test('insufficient balance and limited rewards cannot be purchased',async()=>{
 const a=await client(),m=meta();await a.push(local(),m,catalog,core);
 await assert.rejects(a.buy('icon-030','math',core),{code:'insufficient-points'});await assert.rejects(a.buy('icon-007','math',core),{code:'not-for-sale'});await assert.rejects(a.buy('frame-11','math',core),{code:'not-for-sale'});assert.equal((await a.pull(m.deviceId)).player.balances.math,200);
});
test('highest-title rewards backfill from best but never auto equip',async()=>{
 const a=await client(),l=local(),m=meta();await a.push(l,m,catalog,core);l.best.distribution=25;const r=await a.push(l,m,catalog,core);assert.ok(r.player.titles.includes('distribution:25'));assert.ok(r.player.owned.includes('icon-007'));assert.ok(r.player.owned.includes('frame-11'));assert.equal(r.player.appearance.icon,'cat');assert.equal(r.player.appearance.frame,'plain');
});
test('stale appearance edit cannot overwrite the other device newer equipment',async()=>{
 const a=await client(),b=await client(),l=local(),ma=meta(),mb=meta('device-bbbbbbbb',M.zero());await a.push(l,ma,catalog,core);ma.appearanceDirty=true;l.appearance.icon='robot';await a.push(l,ma,catalog,core);
 const old=local();old.appearance.icon='rabbit';mb.appearanceDirty=true;const r=await b.push(old,mb,catalog,core);assert.equal(r.appearanceConflict,true);assert.equal(r.player.appearance.icon,'robot');
});
test('admin renamed nickname is authoritative despite old local nickname',async()=>{
 const a=await client(),l=local(),m=meta();await a.push(l,m,catalog,core);
 const db=env.authenticatedContext('admin-for-sync-test',{firebase:{sign_in_provider:'password'},auth_time:Math.floor(Date.now()/1000)}).firestore();
 const before=(await F.getDoc(pRef(db))).data(),audit=F.doc(F.collection(db,base,'audit')),backup=F.doc(F.collection(db,base,'backups')),at=F.serverTimestamp(),batch=F.writeBatch(db);
 batch.set(backup,{actor:'admin-for-sync-test',at,uid:'child-a',target:'players/child-a',kind:'rename',data:before});batch.set(audit,{actor:'admin-for-sync-test',at,uid:'child-a',target:'players/child-a',action:'rename',reason:'同期テスト',backupId:backup.id,beforeName:'ねこ',afterName:'新しいねこ'});batch.update(pRef(db),{nickname:'新しいねこ',lastAudit:audit.id,lastBackup:backup.id,adminUpdatedAt:at});await batch.commit();
 m.earned.math=1;const r=await a.push(l,m,catalog,core);assert.equal(r.player.nickname,'新しいねこ');assert.equal(r.player.balances.math,201);assert.equal(r.player.lastAudit,audit.id);
});
test('player cannot edit another player, list players, change role, nickname or status',async()=>{
 const a=await client(),b=await client('child-b'),m=meta();await a.push(local(),m,catalog,core);
 await assertFails(F.getDoc(pRef(b.db)));await assertFails(F.getDocs(F.collection(a.db,base,'players')));await assertFails(F.updateDoc(pRef(a.db),{nickname:'不正変更'}));await assertFails(F.updateDoc(pRef(a.db),{status:'suspended'}));await assertFails(F.updateDoc(F.doc(a.db,base,'private','admin'),{uid:'child-a'}));
});
test('arbitrary balance overwrite and fake normal item grant without receipts are denied',async()=>{
 const a=await client(),m=meta();await a.push(local(),m,catalog,core);await assertFails(F.updateDoc(pRef(a.db),{balances:{...M.zero(),math:999999}}));await assertFails(F.updateDoc(pRef(a.db),{owned:['frame-01']}));
});
test('counter-only edits, counter rollback, deletions and receipt mutation are denied',async()=>{
 const a=await client(),m=meta();m.earned.math=2;await a.push(local(),m,catalog,core);const d=F.doc(pRef(a.db),'devices',m.deviceId);await assertFails(F.updateDoc(d,{earned:{...M.zero(),math:1}}));await assertFails(F.deleteDoc(pRef(a.db)));await a.buy('frame-01','math',core);await assertFails(F.updateDoc(F.doc(pRef(a.db),'purchases','frame-01'),{price:0}));
});
test('suspended player cannot earn or purchase and retains stored data',async()=>{
 const a=await client(),m=meta();await a.push(local(),m,catalog,core);await env.withSecurityRulesDisabled(c=>F.updateDoc(pRef(c.firestore()),{status:'suspended'}));m.earned.math=1;await assert.rejects(a.push(local(),m,catalog,core),{code:'player-suspended'});await assert.rejects(a.buy('frame-01','math',core),{code:'player-suspended'});assert.equal((await a.pull(m.deviceId)).player.balances.math,200);
});
test('ambiguous second positive migration requires review and does not double import',async()=>{
 const a=await client(),m=meta();await a.push(local(),m,catalog,core);await assert.rejects(a.push(local(),meta('device-newxxxxx'),catalog,core),{code:'migration-review-required'});assert.equal((await a.pull(m.deviceId)).player.balances.math,200);
});
test('test collection stays separate from normal player documents',async()=>{
 const a=await client('test-child',true),m=meta();await a.push(local(),m,catalog,core);let count;await env.withSecurityRulesDisabled(async c=>{count=(await F.getDocs(F.collection(c.firestore(),base,'players'))).size});assert.equal(count,0);assert.ok((await F.getDoc(pRef(a.db,'test-child','syncTestPlayers'))).exists());
});
test('same nickname in two different UIDs never merges accounts',async()=>{
 const a=await client(),b=await client('child-b');await a.push(local(),meta(),catalog,core);const l=local();l.balances.math=7;await b.push(l,meta('device-bbbbbbbb',l.balances),catalog,core);assert.equal((await b.pull('device-bbbbbbbb')).player.balances.math,7);assert.equal((await a.pull('device-aaaaaaaa')).player.balances.math,200);
});
test('pure local projection preserves unacknowledged offline earnings',()=>{
 const r={balances:{...M.zero(),math:100}},d={earned:{...M.zero(),math:2}},earned={...M.zero(),math:5};assert.equal(M.localBalances(r,d,earned).math,103);assert.equal(M.localBalances(r,{earned},earned).math,100);
});

test('complete six-game legacy inventory and subject equipment fit the migration Rules',async()=>{
 const a=await client(),l=local(),m=meta();for(const g of M.GAMES)l.best[g]=700;
 l.titles=Array.from(catalog.flatMap(g=>g.titles.map(t=>t.id)));l.owned=Array.from(core.catalog.map(i=>i.id));
 l.appearance={icon:'icon-030',frame:'frame-15',badge:'distribution:25',subjectIcons:{math:'icon-007',social:'icon-031',english:'icon-032',japanese:'icon-023'},subjectFrames:{math:'frame-11'},limitedOwned:Array.from(core.limitedRewards.map(i=>i.id)),limitedFramesOwned:['frame-11'],volume:1,reduceMotion:false};
 const r=await a.push(l,m,catalog,core);assert.equal(r.player.titles.length,32);assert.equal(r.player.best.keisan,700);assert.equal(r.player.owned.length,l.owned.length);assert.equal(r.player.appearance.subjectFrames.math,'frame-11');
});
