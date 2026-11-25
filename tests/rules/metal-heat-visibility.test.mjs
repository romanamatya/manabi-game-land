import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';

test('only the preview administrator can initialize and change metal heat visibility', async () => {
  const env = await initializeTestEnvironment({
    projectId:process.env.GCLOUD_PROJECT ?? 'demo-manabi-foundation',
    firestore:{rules:readFileSync('preview/firebase/firestore.rules','utf8')},
  });
  try {
    const id = 'previewSpark/v1/gameSettings/metalHeat';
    const other = 'previewSpark/v1/gameSettings/keisan';
    await env.withSecurityRulesDisabled(async context => {
      const db=context.firestore();
      await setDoc(doc(db,'previewSpark/v1/private/admin'),{uid:'metalheat-admin',enabled:true});
      await setDoc(doc(db,'previewSpark/v1/private/revocation'),{after:Timestamp.fromMillis(1000)});
      await setDoc(doc(db,other),{status:'hidden'});
    });
    const admin = env.authenticatedContext('metalheat-admin',{firebase:{sign_in_provider:'password'},auth_time:3}).firestore();
    const revoked = env.authenticatedContext('metalheat-admin',{firebase:{sign_in_provider:'password'},auth_time:1}).firestore();
    const student = env.authenticatedContext('metalheat-student',{firebase:{sign_in_provider:'anonymous'}}).firestore();
    const write = (db,status) => setDoc(doc(db,id),{status,updatedAt:serverTimestamp()});
    assert.equal((await assertSucceeds(getDoc(doc(student,id)))).exists(),false);
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),id)));
    await assertFails(write(student,'hidden'));
    await assertFails(write(revoked,'hidden'));
    await assertFails(write(admin,'published'));
    await assertSucceeds(write(admin,'hidden'));
    await assertFails(write(student,'published'));
    await assertFails(write(admin,'invalid'));
    await assertSucceeds(write(admin,'preparing'));
    await assertSucceeds(write(admin,'published'));
    assert.equal((await assertSucceeds(getDoc(doc(student,id)))).data().status,'published');
    await assertFails(deleteDoc(doc(admin,id)));
    await env.withSecurityRulesDisabled(async context => {
      assert.deepEqual((await getDoc(doc(context.firestore(),other))).data(),{status:'hidden'});
    });
  } finally {
    await env.cleanup();
  }
});
