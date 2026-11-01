import {validateConfig} from './spark-auth.js?v=785e38d0207a';
import {SUBJECTS,zero,number,union,mergePlayer,error} from './player-sync-model.js?v=785e38d0207a';
export async function createPlayerClient(config,[App,A,F],{testScope=false}={}){
 validateConfig(config);
 const name=testScope?'manabi-preview-player-test':'manabi-preview-player-v2';
 const app=App.getApps().find(a=>a.name===name)||App.initializeApp(config.firebase,name);
 if(app.options.projectId!==config.expectedProjectId)throw error('production-project-rejected');
 const auth=A.getAuth(app),db=F.getFirestore(app),scope=testScope?'syncTestPlayers':'players',base='previewSpark/v1';
 await A.setPersistence(auth,A.browserLocalPersistence);await auth.authStateReady();
 if(!auth.currentUser)await A.signInAnonymously(auth);
 if(!auth.currentUser?.isAnonymous)throw error('player-identity-required');
 const uid=auth.currentUser.uid,playerRef=F.doc(db,base,scope,uid),deviceRef=id=>F.doc(playerRef,'devices',id);
 const readPair=()=>F.runTransaction(db,async tx=>{const player=await tx.get(playerRef);return player.exists()?player.data():null});
 // Retry Rules contention only after proving the stored player revision advanced.
 async function transaction(action){
  for(let attempt=0;attempt<4;attempt++){
   let observed=null;
   try{return await F.runTransaction(db,tx=>action(tx,n=>{observed=n}));}
   catch(e){
    if(e.code!=='permission-denied'||observed===null||attempt===3)throw e;
    const latest=await readPair();if(!latest||number(latest.revision)<=observed)throw e;
   }
  }
 }
 async function pull(device){return F.runTransaction(db,async tx=>{const p=await tx.get(playerRef),d=await tx.get(deviceRef(device));return {player:p.exists()?p.data():null,ledger:d.exists()?d.data():null}});}
 async function push(local,meta,catalog,core){
  if(!local.nickname||local.nickname.length>12)throw error('nickname-required');
  let conflict=false;
  await transaction(async(tx,observe)=>{
   const p=await tx.get(playerRef),d=await tx.get(deviceRef(meta.deviceId));observe(p.exists()?number(p.data().revision):0);
   if(!p.exists()){
    if(d.exists())throw error('sync-ledger-conflict');
    const at=F.serverTimestamp();
    tx.set(playerRef,{schemaVersion:2,uid,nickname:local.nickname,status:'active',balances:Object.fromEntries(SUBJECTS.map(s=>[s,number(meta.baseline.balances[s])+number(meta.earned[s])])),best:local.best,titles:local.titles,owned:local.owned,appearance:local.appearance,appearanceRevision:0,revision:1,lastDevice:meta.deviceId,createdAt:at,updatedAt:at,lastPlayedAt:at,migration:{source:'preview-local-v1',deviceId:meta.deviceId}});
    tx.set(deviceRef(meta.deviceId),{earned:meta.earned,seedBalances:meta.baseline.balances,revision:1,updatedAt:at});return;
   }
   if(p.data().schemaVersion!==2)throw error('migration-review-required');
   if(!d.exists()&&SUBJECTS.some(s=>number(meta.baseline.balances[s])>0))throw error('migration-review-required');
   const old=p.data(),result=mergePlayer(old,local,d.exists()?d.data():null,meta,catalog,core);conflict=result.appearanceConflict;
   const next=result.player;
   const changed=!d.exists()||JSON.stringify([next.balances,next.best,next.titles,next.owned,next.appearance])!==JSON.stringify([old.balances,old.best,old.titles,old.owned,old.appearance]);
   if(!changed)return;
   const revision=number(old.revision)+1,at=F.serverTimestamp();
   // Never write nickname, status, or the admin audit/backup fields from a player.
   tx.update(playerRef,{balances:next.balances,best:next.best,titles:next.titles,owned:next.owned,appearance:next.appearance,appearanceRevision:next.appearanceRevision,revision,lastDevice:meta.deviceId,updatedAt:at,lastPlayedAt:at});
   tx.set(deviceRef(meta.deviceId),{earned:meta.earned,seedBalances:d.exists()?d.data().seedBalances:zero(),revision,updatedAt:at});
  });
  return {...await pull(meta.deviceId),appearanceConflict:conflict};
 }
 async function buy(productId,subject,core){
  const item=core.catalog.find(x=>x.id===productId);
  if(!item||!['icon','frame'].includes(item.kind)||!Number.isSafeInteger(item.price)||!SUBJECTS.includes(subject)||!Object.values(core.games).includes(subject))throw error('not-for-sale');
  const receipt=F.doc(playerRef,'purchases',productId);
  await transaction(async(tx,observe)=>{
   const p=await tx.get(playerRef),r=await tx.get(receipt);observe(p.exists()?number(p.data().revision):0);if(!p.exists()||p.data().schemaVersion!==2)throw error('sync-not-ready');const old=p.data();
   if(old.status!=='active')throw error('player-suspended');
   if(old.owned.includes(productId)||r.exists())throw error('already-owned');
   if(number(old.balances[subject])<item.price)throw error('insufficient-points');
   const at=F.serverTimestamp(),revision=number(old.revision)+1;
   tx.update(playerRef,{balances:{...old.balances,[subject]:old.balances[subject]-item.price},owned:union(old.owned,[productId]),revision,lastPurchase:productId,updatedAt:at});
   tx.set(receipt,{productId,subject,price:item.price,at,revision});
  });
  return readPair();
 }
 // Shared rankings are a separate, public projection. They never read or write
 // private player balances, inventory, or profile documents.
 const rankingGames=new Set(Array.isArray(config.rankingGameIds)?config.rankingGameIds:[]);
 function rankingRef(game,playerUid=uid){
  if(config.mode!=='preview'||!rankingGames.has(game)||typeof playerUid!=='string'||!playerUid)throw error('ranking-game-not-allowed');
  return F.doc(db,base,'rankings',game,'players',playerUid);
 }
 function challengeRankingRef(game,playerUid=uid){
  if(config.mode!=='preview'||!rankingGames.has(game)||typeof playerUid!=='string'||!playerUid)throw error('ranking-game-not-allowed');
  return F.doc(db,base,'challenge120Rankings',game,'players',playerUid);
 }
 async function publishRanking(input){
  if(!input||typeof input!=='object')throw error('invalid-ranking');
  const game=input.game,best=Number(input.bestStreak);
  if(!Number.isSafeInteger(best)||best<1||best>100000||typeof input.nickname!=='string'||input.nickname.length<1||input.nickname.length>12)throw error('invalid-ranking');
  const text=(value,max=40)=>typeof value==='string'&&value.length<=max?value:null;
  const target=rankingRef(game),projection={uid,game,nickname:input.nickname,bestStreak:best,icon:text(input.icon,40),frame:text(input.frame,40),title:text(input.title,80),badge:text(input.badge,80),updatedAt:F.serverTimestamp()};
  return F.runTransaction(db,async tx=>{const old=await tx.get(target),prior=old.exists()?old.data():{},saved={...projection,bestStreak:Math.max(best,number(prior.bestStreak))};tx.set(target,saved);return saved;});
 }
 async function rankings(game){
  const root=F.collection(db,base,'rankings',game,'players'),q=F.query(root,F.orderBy('bestStreak','desc'),F.limit(100));
  const result=await F.getDocsFromServer(q);
  return result.docs.map(doc=>({id:doc.id,...doc.data()}));
 }
 async function publishChallengeRanking(input){
  if(!input||!Number.isSafeInteger(Number(input.bestStreak))||Number(input.bestStreak)<1||Number(input.bestStreak)>100000||typeof input.nickname!=='string'||input.nickname.length<1||input.nickname.length>12)throw error('invalid-ranking');
  const target=challengeRankingRef(input.game),best=Number(input.bestStreak),text=(value,max=40)=>typeof value==='string'&&value.length<=max?value:null;
  const projection={uid,game:input.game,mode:'challenge120',nickname:input.nickname,bestStreak:best,icon:text(input.icon),frame:text(input.frame),title:text(input.title,80),badge:text(input.badge,80),updatedAt:F.serverTimestamp()};
  return F.runTransaction(db,async tx=>{const old=await tx.get(target),prior=old.exists()?old.data():{},saved={...projection,bestStreak:Math.max(best,number(prior.bestStreak))};tx.set(target,saved);return saved;});
 }
 async function challengeRankings(game){
  const root=F.collection(db,base,'challenge120Rankings',game,'players'),q=F.query(root,F.orderBy('bestStreak','desc'),F.limit(100));
  const result=await F.getDocsFromServer(q);return result.docs.map(doc=>({id:doc.id,...doc.data()}));
 }
 async function recordLearningAnswer(input){
  if(config.mode!=='preview'||input?.game!=='kakudo'||!['read','match'].includes(input.mode)||![0,45,60,90,120,135,150,180,210,225,240,270,300,315,330,360].includes(input.angle)||typeof input.correct!=='boolean')throw error('invalid-learning-answer');
  const target=F.doc(db,base,'learningAnswers',uid+'_'+input.game+'_'+input.mode+'_'+input.angle);
  return F.runTransaction(db,async tx=>{const old=await tx.get(target),row=old.exists()?old.data():{uid,game:input.game,mode:input.mode,angle:input.angle,total:0,correct:0};const next={...row,total:number(row.total)+1,correct:number(row.correct)+(input.correct?1:0),updatedAt:F.serverTimestamp()};tx.set(target,next);return next;});
 }
 return {uid,auth,db,push,pull,buy,publishRanking,rankings,publishChallengeRanking,challengeRankings,recordLearningAnswer,watch:callback=>F.onSnapshot(playerRef,{includeMetadataChanges:false},s=>{if(!s.metadata.fromCache)callback(null)},e=>callback(e))};
}
export async function browserClient(config){const sdks=await Promise.all(['app','auth','firestore'].map(n=>import('https://www.gstatic.com/firebasejs/13.1.0/firebase-'+n+'.js')));return createPlayerClient(config,sdks);}

