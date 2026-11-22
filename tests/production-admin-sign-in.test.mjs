import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const window = {};
vm.runInNewContext(await readFile(new URL('../environment.js', import.meta.url), 'utf8'), {
  window, location: { pathname: '/control-room.html' },
});
globalThis.window = window;
const { createAdminOperations, errorText } = await import('../spark-auth.js');

function fixture({ uid = 'admin-fixture', signInError, signOutFails, expired } = {}) {
  const auth = { currentUser: null };
  const observed = { signInAlias: null, roleReads: 0, signedOut: false };
  const operations = createAdminOperations(window.MANABI_SPARK_CONFIG, { auth, db: {} }, {
    async signInWithEmailAndPassword(_, alias) {
      observed.signInAlias = alias;
      if (signInError) throw Object.assign(new Error('fixture error'), { code: signInError });
      auth.currentUser = { uid };
    },
    async signOut() {
      if (signOutFails) throw new Error('fixture cleanup failure');
      observed.signedOut = true;
      auth.currentUser = null;
    },
    async getIdTokenResult() {
      return { signInProvider: 'password', claims: { auth_time: 200 } };
    },
  }, {
    doc: (_, path, id) => path + '/' + id,
    async getDocFromServer(path) {
      observed.roleReads++;
      const data = path.endsWith('/admin')
        ? { uid: 'admin-fixture', enabled: true }
        : { after: { toMillis: () => expired ? 200000 : 100000 } };
      return { exists: () => true, data: () => data };
    },
  });
  return { operations, observed };
}

test('production password login uses its dedicated account and checks administrator permissions', async () => {
  const { operations, observed } = fixture();
  await operations.login('fixture-only');
  assert.equal(observed.signInAlias, 'admin-production@manabi-game-land.invalid');
  assert.equal(observed.roleReads, 2);
  assert.equal(observed.signedOut, false);
});

test('failed credential never reaches role reads and cleanup cannot hide the error', async () => {
  const { operations, observed } = fixture({ signInError: 'auth/invalid-credential', signOutFails: true });
  await assert.rejects(operations.login('fixture-only'), { code: 'auth/invalid-credential' });
  assert.equal(observed.roleReads, 0);
});

test('valid password for a different account or revoked session fails the separate permission check', async () => {
  for (const [options, code] of [[{ uid: 'not-admin' }, 'admin-required'], [{ expired: true }, 'session-revoked']]) {
    const { operations, observed } = fixture(options);
    await assert.rejects(operations.login('fixture-only'), { code });
    assert.equal(observed.signedOut, true);
  }
});

test('credential, provider, connection and permission errors produce distinct safe messages', () => {
  const textFor = code => errorText({ code });
  const rejected = textFor('auth/invalid-credential');
  for (const code of ['auth/wrong-password', 'auth/user-not-found', 'auth/invalid-login-credentials']) {
    assert.equal(textFor(code), rejected);
  }
  const messages = ['auth/invalid-credential', 'auth/operation-not-allowed', 'auth/network-request-failed',
    'auth/app-not-authorized', 'permission-denied', 'admin-required', 'session-revoked'].map(textFor);
  assert.equal(new Set(messages).size, messages.length);
});
