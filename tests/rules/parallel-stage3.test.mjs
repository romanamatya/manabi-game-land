import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import * as F from 'firebase/firestore';
import {createProductionRankingClient} from '../../ranking-sync-api.js';
let env;const game='parallelPair',path=(db,uid='pupil',g=game)=>F.doc(db,'productionRankings','v1','games',g,'players',uid);
const row=(n=10)=>({uid:'pupil',game,nickname:'そら',bestStreak:n,icon:'cat',frame:'plain',title:null,badge:null,updatedAt:F.serverTimestamp()});
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-manabi-parallel-stage3',firestore:{host:'127.0.0.1',port:8188,rules:fs.readFileSync(new URL('../../firebase/parallel-stage3-ranking.candidate.rules',import.meta.url),'utf8')}})});
after(async()=>{await env?.cleanup()});
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();await F.setDoc(F.doc(db,'players','pupil'),{nickname:'そら',rankingUid:'pupil',points:123,owned:['keep']});await F.setDoc(F.doc(db,'productionRankings','v1','identityLinks','pupil'),{uid:'pupil',profileUid:'pupil'});await F.setDoc(F.doc(db,'productionRankings','v1','games','keisan','players','pupil'),{uid:'pupil',game:'keisan',bestStreak:77,nickname:'そら'})})});
const db=uid=>env.authenticatedContext(uid,{firebase:{sign_in_provider:'anonymous'}}).firestore();
test('common client uses one actual Firestore row before/after unlock and leaves old points and rankings intact',async()=>{
 const database=db('pupil'),apps=[],auth={currentUser:{uid:'pupil',isAnonymous:true},authStateReady:async()=>{}};
 const App={getApps:()=>apps,initializeApp:(options,name='[DEFAULT]')=>{const a={options,name};apps.push(a);return a}},A={getAuth:()=>auth,setPersistence:async()=>{},browserLocalPersistence:{}};
 const api=await createProductionRankingClient({mode:'production',expectedProjectId:'manabi-game-land',rankingSyncEnabled:true,parallelPairRankingEnabled:true,playerNameSyncEnabled:true,rankingGameIds:[game],firebase:{projectId:'manabi-game-land'}},[App,A,{...F,getFirestore:()=>database}]);
 assert.equal(await api.getExistingPlayerLink(),'そら');for(const bestStreak of [4,25,29,26,29])await api.publishRanking({game,bestStreak,nickname:'そら',icon:'cat',frame:'plain',title:null,badge:null});const rows=await api.rankings(game);assert.equal(rows.length,1);assert.equal(rows[0].bestStreak,29);assert.equal((await F.getDoc(F.doc(database,'players','pupil'))).data().points,123);assert.deepEqual((await F.getDoc(F.doc(database,'players','pupil'))).data().owned,['keep']);assert.equal((await F.getDoc(path(database,'pupil','keisan'))).data().bestStreak,77);
});
test('candidate rejects foreign UID, unauthenticated query, lower scores and deletion',async()=>{
 const a=db('pupil'),b=db('other');await assertSucceeds(F.setDoc(path(a),row()));await assertFails(F.updateDoc(path(b),{bestStreak:99}));await assertFails(F.setDoc(path(b,'other'),row()));await assertFails(F.getDocs(F.collection(env.unauthenticatedContext().firestore(),'productionRankings','v1','games',game,'players')));await assertFails(F.updateDoc(path(a),{bestStreak:9,updatedAt:F.serverTimestamp()}));await assertFails(F.deleteDoc(path(a)));
});
test('shape validator rejects changed identity, missing/oversize fields, private fields and forged timestamps',async()=>{
 const a=db('pupil');await assertSucceeds(F.setDoc(path(a),row()));for(const patch of [{nickname:'偽名'},{uid:'other'},{game:'keisan'},{points:999},{owned:['not-allowed']},{nickname:'あ'.repeat(1000)},{bestStreak:100001},{bestStreak:-1},{title:'a'.repeat(1000)},{updatedAt:F.Timestamp.fromMillis(1)},{icon:F.deleteField()}])await assertFails(F.updateDoc(path(a),{...patch,...('updatedAt' in patch?{}:{updatedAt:F.serverTimestamp()})}));
 await env.withSecurityRulesDisabled(async ctx=>F.setDoc(F.doc(ctx.firestore(),'productionAdmin','v1','gameSettings',game),{status:'hidden'}));await assertFails(F.updateDoc(path(a),{bestStreak:15,updatedAt:F.serverTimestamp()}));
});
