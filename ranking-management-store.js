const GAME_IDS=Object.freeze(['keisan','pref-name','pref-place','alphabet','distribution','distribution2','exchangeAssociation','kotowaza','multiplicationProperties','shapeExpressions','keisanSummary']);
const err=code=>Object.assign(new Error(code),{code});
const validReason=x=>typeof x==='string'&&x.trim().length>=2&&x.trim().length<=300;

// Admin-only controls sit beside (never inside or over) the existing score row.
// Ranking rows are archived before correction/exclusion and are never deleted.
export function createRankingManagementStore(F,db,{games=GAME_IDS}={}){
 const root='productionRankings/v1',admin='productionAdmin/v1';
 const rowRef=(game,uid)=>F.doc(db,root,'games',game,'players',uid);
 const controlRef=game=>F.doc(db,root,'gameControl',game);
 const lockRef=(game,generation,uid)=>F.doc(db,admin,'rankingLocks',game+'_'+generation+'_'+uid);
 const backupRef=id=>F.doc(db,admin,'rankingBackups',id);
 const auditRef=id=>F.doc(db,admin,'rankingAudit',id);
 const entriesRef=id=>F.collection(db,admin,'rankingBackups',id,'entries');
 const plain=x=>x?.toMillis?x.toMillis():Array.isArray(x)?x.map(plain):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,plain(v)])):x;
 const getRows=async game=>{
  const col=F.collection(db,root,'games',game,'players'),result=[];let cursor=null;
  for(;;){const q=F.query(col,F.orderBy(F.documentId()),...(cursor?[F.startAfter(cursor)]:[]),F.limit(250)),snap=await F.getDocsFromServer(q);result.push(...snap.docs.map(d=>{const data=plain(d.data());return {...data,uid:data.uid||d.id,docId:d.id};}));if(snap.size<250)break;cursor=snap.docs.at(-1).id;if(result.length>10000)throw err('ranking-admin-too-many-rows');}
  return result;
 };
 async function snapshot(){
  const output=[];
  for(const game of games){const [control,all]=await Promise.all([F.getDocFromServer(controlRef(game)),getRows(game)]),state=control.exists()?plain(control.data()):null,generation=state?.generation||0;
   const current=state?.phase==='ready'?all.filter(r=>r.generation===generation):all.filter(r=>r.docId===r.uid);
   output.push({game,generation,phase:state?.phase||'legacy',schemaReady:state?.phase==='ready',writeLocked:state?.writeLocked===true,rows:current.map(r=>({...r,visibility:r.visibility||'active'})).sort((a,b)=>b.bestStreak-a.bestStreak||String(a.nickname||'').localeCompare(String(b.nickname||''),'ja'))});
  }
  const backups=(await F.getDocsFromServer(F.query(F.collection(db,admin,'rankingBackups'),F.orderBy('at','desc'),F.limit(100)))).docs.map(d=>plain({...d.data(),id:d.id}));
  const audit=(await F.getDocsFromServer(F.query(F.collection(db,admin,'rankingAudit'),F.orderBy('at','desc'),F.limit(100)))).docs.map(d=>plain({...d.data(),id:d.id}));
  return {games:output,backups,audit};
 }
 async function copyArchive(game,backupId,rows,generation,user,kind){
  const ref=backupRef(backupId),existing=await F.getDocFromServer(ref);
  if(!existing.exists())await F.setDoc(ref,{actor:user.uid,at:F.serverTimestamp(),kind,game,generation,status:'copying',rowCount:rows.length,reason:'ランキング管理操作の変更前記録'});
  for(let offset=0;offset<rows.length;offset+=400){const batch=F.writeBatch(db);for(const row of rows.slice(offset,offset+400)){const entry=F.doc(entriesRef(backupId),row.uid),saved=await F.getDocFromServer(entry);if(!saved.exists()){const {docId,...stored}=row;batch.set(entry,{uid:row.uid,row:stored});}}if(offset<rows.length)await batch.commit();}
 }
 async function markArchive(backupId,status){await F.updateDoc(backupRef(backupId),{status,completedAt:F.serverTimestamp()});}
 async function migrate(user,input){
  const game=input.game;if(!games.includes(game)||!validReason(input.reason)||input.confirm!==true)throw err('invalid-ranking-admin-input');
  const control=controlRef(game),existing=await F.getDocFromServer(control);if(existing.exists()&&existing.data().phase==='ready')return {ok:true,unchanged:true};
  const backup=existing.data()?.backupId?backupRef(existing.data().backupId):F.doc(F.collection(db,admin,'rankingBackups')),audit=F.doc(F.collection(db,admin,'rankingAudit'));
  await F.runTransaction(db,async tx=>{const c=await tx.get(control),now=c.data()||{};if(now.phase==='ready')return;if(now.phase!=='legacy'&&now.phase!=='migrating')throw err('ranking-operation-in-progress');const at=F.serverTimestamp();tx.set(control,{generation:0,phase:'migrating',writeLocked:true,schemaVersion:2,backupId:backup.id,updatedAt:at});if(!c.exists()||!now.backupId)tx.set(backup,{actor:user.uid,at,kind:'migration',game,generation:0,status:'copying',rowCount:0,reason:input.reason});});
  const controlNow=await F.getDocFromServer(control),backupId=controlNow.data().backupId,rows=(await getRows(game)).filter(r=>r.docId===r.uid&&!Object.hasOwn(r,'generation'));
  if(rows.some(r=>!Number.isSafeInteger(r.bestStreak)||r.bestStreak<1||r.bestStreak>100000||r.game!==game||r.uid!==r.docId))throw err('ranking-data-review-required');
  await F.updateDoc(backupRef(backupId),{rowCount:rows.length,reason:input.reason});await copyArchive(game,backupId,rows,0,user,'migration');
  // Each destination write is authorized against its own archived source entry.
  // Keep the atomic group below Firestore's 20 document-access limit.
  for(let offset=0;offset<rows.length;offset+=8){const batch=F.writeBatch(db);for(const row of rows.slice(offset,offset+8)){batch.set(rowRef(game,'0_'+row.uid),{uid:row.uid,game:row.game,nickname:row.nickname,bestStreak:row.bestStreak,icon:row.icon,frame:row.frame,title:row.title??null,badge:row.badge??null,updatedAt:row.updatedAt,visibility:'active',generation:0});}await batch.commit();}
  const at=F.serverTimestamp();await F.runTransaction(db,async tx=>{const c=await tx.get(control);if(c.data()?.backupId!==backupId||c.data()?.phase!=='migrating')throw err('ranking-operation-in-progress');tx.set(audit,{actor:user.uid,at,action:'migrate',game,reason:input.reason,backupId,beforeGeneration:0,afterGeneration:0,rowCount:rows.length});tx.update(control,{phase:'ready',writeLocked:false,schemaVersion:2,updatedAt:at});});await markArchive(backupId,'complete');return {ok:true,backupId,rowCount:rows.length};
 }
 async function edit(user,input){
  const {game,uid,action}=input;if(!games.includes(game)||typeof uid!=='string'||!['adjust','exclude','restore'].includes(action)||!validReason(input.reason)||input.confirm!==true)throw err('invalid-ranking-admin-input');
  if(action==='adjust'&&(!Number.isSafeInteger(input.bestStreak)||input.bestStreak<1||input.bestStreak>100000))throw err('invalid-ranking-score');
  const row=rowRef(game,input.docId||uid),control=controlRef(game),backup=F.doc(F.collection(db,admin,'rankingBackups')),audit=F.doc(F.collection(db,admin,'rankingAudit'));
  const [r,c]=await Promise.all([F.getDocFromServer(row),F.getDocFromServer(control)]);if(!r.exists())throw err('ranking-row-not-found');if(!c.exists()||c.data().phase!=='ready'||c.data().writeLocked)throw err('ranking-management-not-ready');const before=r.data(),generation=before.generation??c.data().generation,visibility=before.visibility||'active',lock=lockRef(game,generation,uid);if((action==='exclude'&&visibility!=='active')||(action==='restore'&&visibility!=='excluded'))throw err('ranking-status-conflict');const afterScore=action==='adjust'?input.bestStreak:before.bestStreak;if(action==='adjust'&&afterScore===before.bestStreak)throw err('ranking-score-unchanged');const afterVisibility=action==='exclude'?'excluded':'active',at=F.serverTimestamp();
  await F.runTransaction(db,async tx=>{const [current,ctrl,existingLock]=await Promise.all([tx.get(row),tx.get(control),tx.get(lock)]);if(!current.exists()||!ctrl.exists()||ctrl.data().phase!=='ready'||ctrl.data().writeLocked||ctrl.data().generation!==generation)throw err('ranking-operation-in-progress');if(existingLock.exists()&&existingLock.data().auditId!==current.data().lastManagementAudit)throw err('ranking-operation-in-progress');if(current.data().bestStreak!==before.bestStreak||current.data().visibility!==before.visibility||current.data().generation!==before.generation)throw err('ranking-row-changed');tx.set(backup,{actor:user.uid,at,kind:'entry',status:'complete',game,uid,generation,row:before,reason:input.reason});tx.set(audit,{actor:user.uid,at,action,game,uid,reason:input.reason,backupId:backup.id,beforeBest:before.bestStreak,afterBest:afterScore,beforeVisibility:visibility,afterVisibility});tx.set(lock,{actor:user.uid,at,game,uid,generation,protected:true,action,reason:input.reason,auditId:audit.id});});
  await F.updateDoc(row,{bestStreak:afterScore,visibility:afterVisibility,updatedAt:at,lastManagementAudit:audit.id,lastManagementBackup:backup.id});return {ok:true,auditId:audit.id,backupId:backup.id,beforeBest:before.bestStreak,afterBest:afterScore,visibility:afterVisibility};
 }
 async function reset(user,input){
  const game=input.game;if(!games.includes(game)||!validReason(input.reason)||input.confirm!==true||input.phrase!==game)throw err('ranking-reset-confirmation-required');
  const control=controlRef(game),initial=await F.getDocFromServer(control);if(!initial.exists()||initial.data().phase!=='ready')throw err('ranking-management-not-ready');
  const generation=initial.data().generation,backup=F.doc(F.collection(db,admin,'rankingBackups')),audit=F.doc(F.collection(db,admin,'rankingAudit'));
  await F.runTransaction(db,async tx=>{const c=await tx.get(control);if(c.data()?.generation!==generation||c.data()?.phase!=='ready')throw err('ranking-generation-conflict');const at=F.serverTimestamp();tx.set(control,{...c.data(),phase:'resetting',writeLocked:true,backupId:backup.id,updatedAt:at});tx.set(backup,{actor:user.uid,at,kind:'reset',status:'copying',game,generation,reason:input.reason,rowCount:0});});
  try{const rows=(await getRows(game)).filter(r=>(r.generation??0)===generation);await F.updateDoc(backup,{rowCount:rows.length});await copyArchive(game,backup.id,rows,generation,user,'reset');const at=F.serverTimestamp();await F.runTransaction(db,async tx=>{const c=await tx.get(control);if(c.data()?.backupId!==backup.id||c.data()?.phase!=='resetting')throw err('ranking-generation-conflict');tx.set(audit,{actor:user.uid,at,action:'reset',game,reason:input.reason,backupId:backup.id,beforeGeneration:generation,afterGeneration:generation+1,rowCount:rows.length});tx.update(control,{phase:'ready',writeLocked:false,generation:generation+1,previousGeneration:generation,updatedAt:at});});await markArchive(backup.id,'complete');return {ok:true,backupId:backup.id,beforeGeneration:generation,afterGeneration:generation+1,rowCount:rows.length};}
  catch(error){throw Object.assign(error,{code:'ranking-reset-paused',backupId:backup.id});}
 }
 async function resumeReset(user,input){const game=input.game;if(!games.includes(game)||!validReason(input.reason)||input.confirm!==true)throw err('invalid-ranking-admin-input');const control=controlRef(game),c=await F.getDocFromServer(control);if(!c.exists()||c.data().phase!=='resetting')throw err('ranking-reset-not-pending');const backupId=c.data().backupId,generation=c.data().generation,rows=(await getRows(game)).filter(r=>(r.generation??0)===generation);await copyArchive(game,backupId,rows,generation,user,'reset');const audit=F.doc(F.collection(db,admin,'rankingAudit')),at=F.serverTimestamp();await F.runTransaction(db,async tx=>{const now=await tx.get(control);if(now.data()?.phase!=='resetting'||now.data()?.backupId!==backupId)throw err('ranking-generation-conflict');tx.set(audit,{actor:user.uid,at,action:'reset',game,reason:input.reason,backupId,beforeGeneration:generation,afterGeneration:generation+1,rowCount:rows.length});tx.update(control,{phase:'ready',writeLocked:false,generation:generation+1,previousGeneration:generation,updatedAt:at});});await markArchive(backupId,'complete');return {ok:true,backupId,afterGeneration:generation+1,rowCount:rows.length};}
 async function rollback(user,input){const backup=backupRef(input.backupId),b=await F.getDocFromServer(backup);if(!b.exists()||b.data().kind!=='reset'||b.data().status!=='complete'||!validReason(input.reason)||input.confirm!==true)throw err('ranking-backup-not-restorable');const {game,generation}=b.data(),control=controlRef(game),c=await F.getDocFromServer(control);if(!c.exists()||c.data().phase!=='ready'||c.data().generation<=generation)throw err('ranking-generation-conflict');const audit=F.doc(F.collection(db,admin,'rankingAudit')),at=F.serverTimestamp();await F.runTransaction(db,async tx=>{const now=await tx.get(control),source=await tx.get(backup);if(now.data()?.phase!=='ready'||now.data()?.generation<=generation||source.data()?.status!=='complete')throw err('ranking-generation-conflict');tx.update(control,{phase:'ready',writeLocked:false,generation,restoredFrom:input.backupId,updatedAt:at});tx.set(audit,{actor:user.uid,at,action:'rollback',game,reason:input.reason,backupId:input.backupId,beforeGeneration:now.data().generation,afterGeneration:generation,rowCount:source.data().rowCount});});return {ok:true,game,generation};}
 return {games,snapshot,migrate,edit,reset,resumeReset,rollback};
}
