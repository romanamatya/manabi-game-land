const config = window.MANABI_SPARK_CONFIG;
const BASE = 'previewSpark/v1';
const PRODUCTION = 'manabi-game-land';
// The second ID is reserved for the local Firebase Emulator test suite.
const ALLOWED_PREVIEW_PROJECTS = new Set(['manabi-game-landcheck', 'demo-manabi-preview']);
const error = code => Object.assign(new Error(code), {code});
const validName = value => typeof value === 'string' && value === value.trim() && value.length >= 1 && value.length <= 12 && !/[<>\r\n]/.test(value);

export function errorText(e) {
  return ({
    'backend-not-configured': '確認用Firebaseは設定待ち。管理機能はまだ利用できない。',
    'production-project-rejected': '接続設定が確認用プロジェクトと一致しないため停止した。',
    'auth/invalid-credential': 'パスワードを確認して。',
    'auth/wrong-password': 'パスワードを確認して。',
    'auth/user-not-found': 'パスワードを確認して。',
    'auth/invalid-login-credentials': 'パスワードを確認して。',
    'auth/too-many-requests': '試行回数が多いため一時停止中。時間を空けて試して。',
    'permission-denied': '管理権限がないか、認証が失効している。再ログインして。',
    'admin-required': '管理者として認証されていない。',
    'session-revoked': '管理セッションが終了した。少し待って、パスワードで入り直して。',
    'feature-unverified': 'この機能は基盤の確認後に接続するため、現在は利用できない。',
    'auth/weak-password': '新しいパスワードは12文字以上にして。',
    'auth/requires-recent-login': '現在のパスワードで入り直してから操作して。',
    'invalid-input': '名前は1〜12文字、変更理由は2〜300文字で入力して。',
    'player-not-found': '対象のプレイヤーが見つからない。更新して確認して。',
    'name-conflict': '別の端末で名前が変更された。更新してからやり直して。',
    'logout-revocation-failed': 'この端末からはログアウトした。他端末の無効化は通信できず未完了。',
    'password-change-incomplete': '全端末のセッションを無効化したが、パスワード変更は完了しなかった。元のパスワードで入り直して確認して。'
  })[e?.code || e?.message] || '処理を完了できなかった。接続と認証状態を確認して。';
}

export function validateConfig(c) {
  if (!c?.enabled || !c.firebase?.projectId) throw error('backend-not-configured');
  const f = c.firebase;
  if (c.environment !== BASE || f.projectId === PRODUCTION || !ALLOWED_PREVIEW_PROJECTS.has(f.projectId) ||
      c.expectedProjectId !== f.projectId || f.authDomain !== f.projectId + '.firebaseapp.com' ||
      f.apiKey === 'AIzaSyAhm6WMqV7yGmNRRDCeZcOk5HH-dlga9no' ||
      f.appId === '1:723974836914:web:4e57af8336083f82a72fab') throw error('production-project-rejected');
  if (!f.apiKey || !f.appId) throw error('backend-not-configured');
}

let pending;
export function client() {
  if (!pending) pending = (async () => {
    validateConfig(config); // Reject production BEFORE loading or initializing any SDK.
    const sdks = await Promise.all(['app', 'auth', 'firestore'].map(n => import('https://www.gstatic.com/firebasejs/13.1.0/firebase-' + n + '.js')));
    return createAdminClient(config, sdks);
  })().catch(e => {pending = null; throw e;});
  return pending;
}

// The explicit SDK argument also lets the same adapter run against local emulators.
export async function createAdminClient(c, [appSdk, A, F]) {
  validateConfig(c);
  const name = 'manabi-shared-admin-preview-spark';
  const app = appSdk.getApps().find(a => a.name === name) || appSdk.initializeApp(c.firebase, name);
  if (app.options.projectId !== c.expectedProjectId) throw error('production-project-rejected');
  const auth = A.getAuth(app), db = F.getFirestore(app);
  const alias = 'admin-preview@' + c.firebase.projectId + '.invalid';
  await A.setPersistence(auth, A.browserLocalPersistence);
  await auth.authStateReady();
  const ref = (kind, id) => F.doc(db, BASE, kind, id);
  const col = kind => F.collection(db, BASE, kind);
  const plain = value => value?.toMillis ? value.toMillis() : Array.isArray(value) ? value.map(plain) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)])) : value;
  const list = async (kind, cursor) => {
    const constraints = [F.orderBy(F.documentId())];
    if (cursor) constraints.push(F.startAfter(cursor));
    constraints.push(F.limit(100));
    const snap = await F.getDocsFromServer(F.query(col(kind), ...constraints));
    return {rows: snap.docs.map(d => plain({...d.data(), id: d.id, ...(kind === 'players' ? {uid: d.id} : {})})), cursor: snap.size === 100 ? snap.docs.at(-1).id : null};
  };

  async function verify() {
    const user = auth.currentUser;
    if (!user) throw error('admin-required');
    const [owner, revoked, token] = await Promise.all([
      F.getDocFromServer(ref('private', 'admin')),
      F.getDocFromServer(ref('private', 'revocation')),
      A.getIdTokenResult(user)
    ]);
    if (auth.currentUser !== user || !owner.exists() || owner.data().uid !== user.uid || owner.data().enabled !== true || token.signInProvider !== 'password') throw error('admin-required');
    if (!revoked.exists() || Number(token.claims.auth_time) * 1000 <= revoked.data().after.toMillis()) throw error('session-revoked');
    return user;
  }

  async function rename(input) {
    const user = await verify();
    const nickname = typeof input.nickname === 'string' ? input.nickname.trim() : '';
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (!input.uid || input.uid === user.uid || !validName(nickname) || reason.length < 2 || reason.length > 300 || typeof input.expectedNickname !== 'string') throw error('invalid-input');
    const target = ref('players', input.uid), audit = F.doc(col('audit')), backup = F.doc(col('backups'));
    return F.runTransaction(db, async tx => {
      const before = await tx.get(target);
      if (!before.exists()) throw error('player-not-found');
      const player = before.data();
      if (player.nickname !== input.expectedNickname) throw error('name-conflict');
      if (player.nickname === nickname) return {ok: true, unchanged: true};
      const at = F.serverTimestamp();
      tx.set(backup, {actor: user.uid, at, uid: input.uid, target: 'players/' + input.uid, kind: 'rename', data: player});
      tx.set(audit, {actor: user.uid, at, uid: input.uid, target: 'players/' + input.uid, action: 'rename', reason, backupId: backup.id, beforeName: player.nickname, afterName: nickname});
      // Update only admin-owned fields, preserving concurrent gameplay/points writes.
      tx.update(target, {nickname, lastAudit: audit.id, lastBackup: backup.id, adminUpdatedAt: at});
      return {ok: true, auditId: audit.id};
    });
  }

  async function call(action, input = {}) {
    await verify();
    if (action === 'admin:snapshot') {
      const [players, history] = await Promise.all([
        list('players'),
        F.getDocsFromServer(F.query(col('audit'), F.orderBy('at', 'desc'), F.limit(100)))
      ]);
      return {players: players.rows, playerCursor: players.cursor, audit: history.docs.map(d => plain({...d.data(), id: d.id})), games: [], rankings: [], campaigns: [], backups: [], notice: null};
    }
    if (action === 'admin:players') return list('players', input.cursor);
    if (input.confirm !== true) throw error('invalid-input');
    if (action === 'admin:rename') return rename(input);
    throw error('feature-unverified');
  }

  async function revoke() {
    const user = await verify();
    await F.setDoc(ref('private', 'revocation'), {after: F.serverTimestamp(), actor: user.uid});
  }
  async function logout() {
    let failure;
    try {await revoke();} catch {failure = error('logout-revocation-failed');}
    finally {await A.signOut(auth);}
    if (failure) throw failure;
  }
  async function changePassword(oldPassword, newPassword) {
    if (typeof newPassword !== 'string' || newPassword.length < 12) throw error('auth/weak-password');
    const user = await verify();
    await A.reauthenticateWithCredential(user, A.EmailAuthProvider.credential(alias, oldPassword));
    await revoke();
    try {await A.updatePassword(user, newPassword);} catch {throw error('password-change-incomplete');}
    finally {await A.signOut(auth);}
  }
  return {
    auth, db, call, verify, logout, changePassword,
    login: async password => {try {await A.signInWithEmailAndPassword(auth, alias, password); await verify();} catch (e) {await A.signOut(auth); throw e;}},
    watch: callback => A.onIdTokenChanged(auth, callback),
    watchRevocation: callback => {
      const check = async snapshot => {
        if (snapshot.metadata.fromCache) return;
        try {await verify();} catch (e) {callback(e);}
      };
      const stops = ['admin','revocation'].map(id => F.onSnapshot(ref('private', id), check, callback));
      return () => stops.forEach(stop => stop());
    }
  };
}

