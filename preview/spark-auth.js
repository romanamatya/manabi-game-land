import {validateBackend,contractFor} from './data-contract.js?v=f427bef8ead0';
import {createFirestoreStore} from './firebase-store.js?v=f427bef8ead0';
const config = window.MANABI_SPARK_CONFIG;
const error = code => Object.assign(new Error(code), {code});
const validName = value => typeof value === 'string' && value === value.trim() && value.length >= 1 && value.length <= 12 && !/[<>\r\n]/.test(value);

export function errorText(e) {
  return ({
    'backend-not-configured': 'この環境の認証・権限は確認待ち。管理機能は安全のため停止中。',
    'production-project-rejected': '接続設定が環境と一致しないため停止した。',
    'environment-project-mismatch': '環境とFirebase接続先が一致しないため停止した。',
    'auth/invalid-credential': 'パスワードを確認して。',
    'auth/wrong-password': 'パスワードを確認して。',
    'auth/user-not-found': 'パスワードを確認して。',
    'auth/invalid-login-credentials': 'パスワードを確認して。',
    'auth/too-many-requests': '試行回数が多いため一時停止中。時間を空けて試して。',
    'permission-denied': '管理権限がないか、認証が失効している。再ログインして。',
    'admin-required': '管理者として認証されていない。',
    'session-revoked': '管理セッションが終了した。少し待って、パスワードで入り直して。',
    'rename-not-enabled': '名前変更は切り替え確認待ちのため停止中。閲覧は利用できる。',
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
 const contract=validateBackend(c);
 if(typeof location!=='undefined'&&location.pathname.split('/').includes('preview')!==(contract.mode==='preview'))throw error('environment-project-mismatch');
 return contract;
}

let pending;
export function client() {
  if (!pending) pending = (async () => {
    validateConfig(config); // Validate release and environment gates BEFORE loading any SDK.
    const sdks = await Promise.all(['app', 'auth', 'firestore'].map(n => import('https://www.gstatic.com/firebasejs/13.1.0/firebase-' + n + '.js')));
    return createAdminClient(config, sdks);
  })().catch(e => {pending = null; throw e;});
  return pending;
}

// The explicit SDK argument also lets the same adapter run against local emulators.
export async function createAdminClient(c, [appSdk, A, F]) {
  validateConfig(c);
  const contract=validateConfig(c);
  const name=contract.appName;
  const app = appSdk.getApps().find(a => a.name === name) || appSdk.initializeApp(c.firebase, name);
  if (app.options.projectId !== c.expectedProjectId) throw error('production-project-rejected');
  const auth=A.getAuth(app),db=F.getFirestore(app);
  await A.setPersistence(auth,A.browserLocalPersistence);await auth.authStateReady();
  return createAdminOperations(c,{auth,db},A,F);
}
// Domain operations are separately testable without enabling the production entry point.
export function createAdminOperations(c,{auth,db},A,F) {
  const contract=validateBackend(c,{requireEnabled:false}),alias=contract.alias;
  const store=createFirestoreStore(contract.mode,F,db,{catalog:window.ManabiProfileCatalog||[]});
  const ref=(kind,id)=>F.doc(db,kind==='players'?contract.players:contract.base+'/'+kind,id);
  const col=kind=>F.collection(db,kind==='players'?contract.players:contract.base+'/'+kind);
  const plain=value=>value?.toMillis?value.toMillis():Array.isArray(value)?value.map(plain):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,plain(v)])):value;
  const list=async(kind,cursor)=>{if(kind!=='players')throw error('invalid-input');return plain(await store.list(cursor));};
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

  async function rename(input) {const user=await verify();if(contract.mode==='production'){const role=await F.getDocFromServer(ref('private','admin'));if(role.data()?.renameEnabled!==true)throw error('rename-not-enabled');}return store.rename(user,input);}

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



