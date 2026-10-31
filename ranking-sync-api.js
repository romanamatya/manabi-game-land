const GAME_IDS=Object.freeze(['keisan','pref-name','pref-place','alphabet','distribution','distribution2','exchangeAssociation','kotowaza','multiplicationProperties','shapeExpressions','keisanSummary']);
const err=code=>Object.assign(new Error(code),{code});
const validLabel=value=>typeof value==='string'&&value.length<=80;
function assertConfig(c){
 if(!c||c.mode!=='production'||c.expectedProjectId!=='manabi-game-land'||c.rankingSyncEnabled!==true||c.firebase?.projectId!=='manabi-game-land')throw err('production-ranking-config-rejected');
 if(typeof window!=='undefined'&&(window.MANABI_ENV?.preview!==false||window.MANABI_ENV?.expectedProjectId!=='manabi-game-land'))throw err('production-environment-mismatch');
}
export async function createProductionRankingClient(c,[App,A,F]){
 assertConfig(c);
 const appName='manabi-production-ranking-v1';
 const app=App.getApps().find(x=>x.name===appName)||App.initializeApp(c.firebase,appName);
 if(app.options.projectId!=='manabi-game-land')throw err('production-project-rejected');
 const auth=A.getAuth(app),db=F.getFirestore(app);
 await A.setPersistence(auth,A.browserLocalPersistence);await auth.authStateReady();
 if(!auth.currentUser)await A.signInAnonymously(auth);
 if(!auth.currentUser?.isAnonymous)throw err('anonymous-player-required');
 const uid=auth.currentUser.uid,allowed=new Set((c.rankingGameIds||GAME_IDS).filter(x=>GAME_IDS.includes(x)));
 let profileUid=null,profileDb=null;
 if(c.playerNameSyncEnabled===true){
  const profileApp=App.getApps().find(x=>x.name==='[DEFAULT]')||App.initializeApp(c.firebase);
  if(profileApp.options.projectId!=='manabi-game-land')throw err('production-project-rejected');
  const profileAuth=A.getAuth(profileApp);await A.setPersistence(profileAuth,A.browserLocalPersistence);await profileAuth.authStateReady();
  if(!profileAuth.currentUser)await A.signInAnonymously(profileAuth);
  if(!profileAuth.currentUser?.isAnonymous)throw err('anonymous-player-required');
  profileUid=profileAuth.currentUser.uid;profileDb=F.getFirestore(profileApp);
 }
 const ref=game=>{if(!allowed.has(game))throw err('invalid-ranking-game');return F.doc(db,'productionRankings','v1','games',game,'players',uid)};
 const playerRef=()=>{if(!profileUid)throw err('player-name-sync-disabled');return F.doc(profileDb,'players',profileUid)};
 const linkRef=()=>F.doc(db,'productionRankings','v1','identityLinks',uid);
 const validNickname=value=>typeof value==='string'&&value===value.trim()&&value.length>=1&&value.length<=12&&!/[<>\r\n]/.test(value);
 const clean=input=>{
  if(!input||Object.keys(input).some(k=>!['game','bestStreak','nickname','icon','frame','title','badge'].includes(k))||!allowed.has(input.game)||!Number.isSafeInteger(input.bestStreak)||input.bestStreak<1||input.bestStreak>100000)throw err('invalid-ranking');
  const nickname=typeof input.nickname==='string'?input.nickname.trim():'';
  const icon=typeof input.icon==='string'?input.icon:'cat',frame=typeof input.frame==='string'?input.frame:'plain';
  const title=validLabel(input.title)?input.title:null,badge=validLabel(input.badge)?input.badge:null;
  if(nickname.length<1||nickname.length>12||(/[<>]/.test(nickname)||nickname.includes(String.fromCharCode(10))||nickname.includes(String.fromCharCode(13)))||icon.length>64||frame.length>64||!/^[A-Za-z0-9:_-]{1,64}$/.test(icon)||!/^[A-Za-z0-9:_-]{1,64}$/.test(frame)||(badge!==null&&!/^[A-Za-z0-9:_-]{1,64}$/.test(badge)))throw err('invalid-ranking');
  return {uid,game:input.game,nickname,bestStreak:input.bestStreak,icon,frame,title,badge};
 };
 async function publishRanking(input){
  const submitted=clean(input),target=ref(submitted.game);
  return F.runTransaction(db,async tx=>{
   const reads=[tx.get(target)];
   if(profileUid)reads.push(tx.get(F.doc(db,'players',profileUid)),tx.get(linkRef()));
   const result=await Promise.all(reads),snap=result[0],old=snap.exists()?snap.data():null;
   let canonical=submitted.nickname;
   if(profileUid){
    const profileSnap=result[1],linkSnap=result[2];
    if(!profileSnap.exists()||!linkSnap.exists()||linkSnap.data().profileUid!==profileUid||profileSnap.data().rankingUid!==uid)throw err('player-ranking-link-required');
    canonical=profileSnap.data().nickname;
   }
   const value=clean({...input,nickname:canonical});
   const bestStreak=Math.max(value.bestStreak,Number.isSafeInteger(old?.bestStreak)?old.bestStreak:0);const title=old&&value.bestStreak<old.bestStreak?old.title:value.title;const next={...value,title,bestStreak,updatedAt:F.serverTimestamp()};
   if(old&&next.bestStreak===old.bestStreak&&old.nickname===next.nickname&&old.icon===next.icon&&old.frame===next.frame&&old.title===next.title&&old.badge===next.badge)return old;
   tx.set(target,next);return next;
  });
 }
 async function ensurePlayerLink(localNickname){
  if(!profileUid)throw err('player-name-sync-disabled');
  const profile=playerRef(),profileSnap=await F.getDocFromServer(profile);
  if(!profileSnap.exists()){
   if(!validNickname(localNickname))throw err('nickname-required');
   await F.setDoc(profile,{nickname:localNickname,updatedAt:F.serverTimestamp()});
   await F.updateDoc(profile,{rankingUid:uid,updatedAt:F.serverTimestamp()});
  }else{
   const data=profileSnap.data();
   if(data.rankingUid&&data.rankingUid!==uid)throw err('player-ranking-link-conflict');
   if(!data.rankingUid)await F.updateDoc(profile,{rankingUid:uid,updatedAt:F.serverTimestamp()});
  }
  const link=linkRef(),linkSnap=await F.getDocFromServer(link);
  if(linkSnap.exists()){
   if(linkSnap.data().profileUid!==profileUid)throw err('player-ranking-link-conflict');
  }else{
   try{await F.setDoc(link,{uid,profileUid,createdAt:F.serverTimestamp()});}
   catch(e){const current=await F.getDocFromServer(link);if(!current.exists()||current.data().profileUid!==profileUid)throw e;}
  }
  const finalProfile=await F.getDocFromServer(profile);
  if(!finalProfile.exists()||finalProfile.data().rankingUid!==uid||!validNickname(finalProfile.data().nickname))throw err('player-ranking-link-conflict');
  return finalProfile.data().nickname;
 }
 function watchPlayerName(callback){
  if(!profileUid||typeof callback!=='function')throw err('player-name-sync-disabled');
  return F.onSnapshot(playerRef(),snapshot=>{if(!snapshot.metadata.fromCache&&snapshot.exists()&&validNickname(snapshot.data().nickname)&&snapshot.data().rankingUid===uid)callback(snapshot.data().nickname);},()=>{});
 }
 async function queryGame(game,count){
  if(!allowed.has(game))throw err('invalid-ranking-game');
  const col=F.collection(db,'productionRankings','v1','games',game,'players');
  const q=F.query(col,F.orderBy('bestStreak','desc'),F.limit(count));
  const snap=await F.getDocsFromServer(q);
  return snap.docs.map(d=>({id:d.id,row:d.data()})).filter(x=>x.id===x.row.uid&&x.row.game===game&&Number.isSafeInteger(x.row.bestStreak)&&x.row.bestStreak>0).map(x=>x.row);
 }
 async function rankings(game){return queryGame(game,100);}
 async function champions(){return Promise.all([...allowed].map(async game=>({game,row:(await queryGame(game,1))[0]||null})));}
 return {uid,profileUid,publishRanking,rankings,champions,ensurePlayerLink,watchPlayerName};
}
let pending;
export function client(){
 if(!pending)pending=Promise.all(['app','auth','firestore'].map(n=>import('https://www.gstatic.com/firebasejs/13.1.0/firebase-'+n+'.js')))
  .then(sdks=>createProductionRankingClient(window.MANABI_BACKEND_CONFIG,sdks)).catch(e=>{pending=null;throw e});
 return pending;
}