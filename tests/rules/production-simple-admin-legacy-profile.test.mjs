import {after,before,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import * as F from 'firebase/firestore';

const projectId='demo-manabi-simple-admin',rulesUrl=new URL('../../firebase/production-simple-admin-proposed.rules',import.meta.url);
let env;
before(async()=>{env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8181,rules:await readFile(rulesUrl,'utf8')}});});
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();
 await F.setDoc(F.doc(db,'productionAdmin/v1/private/admin'),{uid:'admin-uid',enabled:true,renameEnabled:true,suspensionEnabled:false,managementEnabled:true});
 await F.setDoc(F.doc(db,'productionAdmin/v1/private/revocation'),{after:F.Timestamp.fromMillis(100000)});
 await F.setDoc(F.doc(db,'players/profile-a'),{nickname:'そら',points:135,bestStreak:42,prefNameBestStreak:8,appearance:{icon:'cat',frame:'plain',badge:'保持称号',limitedOwned:['frame:gold']},rankingUid:'rank-a',accessStatus:'suspended'});
 await F.setDoc(F.doc(db,'productionRankings/v1/identityLinks/rank-a'),{uid:'rank-a',profileUid:'profile-a',createdAt:F.Timestamp.fromMillis(1)});
 await F.setDoc(F.doc(db,'productionRankings/v1/games/keisan/players/rank-a'),{uid:'rank-a',game:'keisan',nickname:'そら',bestStreak:20,icon:'cat',frame:'plain',title:'保持称号',badge:'keisan:10',updatedAt:F.Timestamp.fromMillis(1)});
});});
after(async()=>env?.cleanup());

test('a legacy suspended flag no longer blocks this linked child or erases saved progress',async()=>{
 const profileUser=env.authenticatedContext('profile-a',{firebase:{sign_in_provider:'anonymous'}}).firestore();
 const rankUser=env.authenticatedContext('rank-a',{firebase:{sign_in_provider:'anonymous'}}).firestore();
 const profile=F.doc(profileUser,'players/profile-a'),rank=F.doc(rankUser,'productionRankings/v1/games/keisan/players/rank-a');
 await assertSucceeds(F.updateDoc(profile,{points:140,bestStreak:43,updatedAt:F.serverTimestamp()}));
 await assertSucceeds(F.updateDoc(rank,{bestStreak:21,updatedAt:F.serverTimestamp()}));
 const updated=(await assertSucceeds(F.getDoc(profile))).data();
 assert.equal(updated.accessStatus,'suspended');assert.equal(updated.points,140);assert.equal(updated.bestStreak,43);
 assert.deepEqual(updated.appearance,{icon:'cat',frame:'plain',badge:'保持称号',limitedOwned:['frame:gold']});
 await assertFails(F.updateDoc(profile,{accessStatus:'active'}));
});
