import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import * as F from 'firebase/firestore';

const rules = readFileSync(new URL('../../firebase/preview-current.rules', import.meta.url), 'utf8');
const path = 'previewSpark/v1/gameSettings/fractionTransformInput';
const password = { firebase: { sign_in_provider: 'password' }, auth_time: 100 };

test('only a fresh preview administrator can change the numeric-input setting', async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-fraction-input', firestore: { rules } });
  const admin = env.authenticatedContext('admin', password).firestore();
  const child = env.authenticatedContext('child', { firebase: { sign_in_provider: 'anonymous' }, auth_time: 100 }).firestore();
  const visitor = env.unauthenticatedContext().firestore();
  const doc = db => F.doc(db, path);
  const setting = status => ({status, updatedAt:F.serverTimestamp()});
  try {
    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();
      await F.setDoc(F.doc(db, 'previewSpark/v1/private/admin'), {uid:'admin', enabled:true});
      await F.setDoc(F.doc(db, 'previewSpark/v1/private/revocation'), {after:F.Timestamp.fromMillis(0)});
    });
    assert.equal((await assertSucceeds(F.getDoc(doc(child)))).exists(), false);
    await assertFails(F.getDoc(doc(visitor)));
    await assertFails(F.setDoc(doc(child), setting('published')));
    await assertFails(F.setDoc(doc(admin), setting('invalid')));
    await assertFails(F.setDoc(doc(admin), {...setting('published'), extra:true}));
    await assertSucceeds(F.setDoc(doc(admin), setting('published')));
    assert.equal((await assertSucceeds(F.getDocFromServer(doc(child)))).data().status, 'published');
    await assertSucceeds(F.setDoc(doc(admin), setting('hidden')));
    assert.equal((await assertSucceeds(F.getDocFromServer(doc(child)))).data().status, 'hidden');
    await assertFails(F.deleteDoc(doc(admin)));
    await assertFails(F.setDoc(F.doc(admin, 'previewSpark/v1/gameSettings/fractionTransform'), setting('published')));
    await env.withSecurityRulesDisabled(ctx =>
      F.setDoc(F.doc(ctx.firestore(), 'previewSpark/v1/private/revocation'), {after:F.Timestamp.fromMillis(101000)}));
    await assertFails(F.setDoc(doc(admin), setting('published')));
  } finally { await env.cleanup(); }
});
