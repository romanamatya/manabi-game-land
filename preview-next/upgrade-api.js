const config=window.MANABI_UPGRADE_CONFIG;
const cache=new Map();
export const errorText=e=>({
 'backend-not-configured':'確認用サーバーの公開設定待ち。管理機能・記録更新はまだ利用できない。',
 'admin-required':'正式な管理者権限を確認できない。',
 'player-unavailable':'このアカウントは利用を停止している。先生に確認して。',
 'deadline-exceeded':'時間が終了したため、この回答は記録しなかった。',
 'game-hidden':'このゲームは先生が公開を止めている。',
 'other-device-question-active':'別の端末で進行している。画面を再読み込みして。',
 'stale-step':'別の画面で問題が進んでいる。再読み込みして。',
 'not-waiting':'チャレンジの開始待ちではない。',
 'answer-closed':'回答受付は終了している。',
 'unauthenticated':'ログイン状態を確認して。'
}[e?.details||e?.message?.replace(/^.*?: /,'')]||'通信または設定を確認できなかった。再読み込みして状態を確認して。');
export async function client(admin=false){if(!config?.enabled)throw Error('backend-not-configured');if(cache.has(admin))return cache.get(admin);const promise=(async()=>{
 const [{getApps,initializeApp},{getAuth,setPersistence,browserLocalPersistence,signInAnonymously,GoogleAuthProvider,signInWithPopup,signOut,onIdTokenChanged},{getFunctions,httpsCallable}]=await Promise.all([import('https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/13.1.0/firebase-functions.js')]);
 const name=admin?'manabi-admin-preview-upgrade':'manabi-player-preview-upgrade',app=getApps().find(a=>a.name===name)||initializeApp(config.firebase,name),auth=getAuth(app);await setPersistence(auth,browserLocalPersistence);await auth.authStateReady();if(!admin&&!auth.currentUser)await signInAnonymously(auth);const fn=httpsCallable(getFunctions(app,'asia-northeast1'),config.functionName);
 return {call:async(action,data={})=>(await fn({action,...data})).data,login:()=>signInWithPopup(auth,new GoogleAuthProvider()),logout:()=>signOut(auth),watch:callback=>onIdTokenChanged(auth,callback),auth};
})();cache.set(admin,promise);try{return await promise}catch(e){cache.delete(admin);throw e}}
