import {GAME_IDS,checkedInput,visibilityStatus} from './management-model.js?v=e8faf7cc1994';
import {contractFor} from './data-contract.js?v=e8faf7cc1994';

export function createManagementStore(mode,F,db){
 const {base}=contractFor(mode),ref=(collection,id)=>F.doc(db,base+'/'+collection,id),col=k=>F.collection(db,base+'/'+k);
 const plain=x=>x?.toMillis?x.toMillis():Array.isArray(x)?x.map(plain):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,plain(v)])):x;
 const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
 const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
 const list=async k=>(await F.getDocsFromServer(F.query(col(k),F.orderBy('at','desc'),F.limit(100)))).docs.map(d=>plain({...d.data(),id:d.id}));
 async function writeOne(user,action,target,reason,makeNext){
  const audit=F.doc(col('managementAudit')),backup=F.doc(col('managementBackups'));
  const prepared=await F.runTransaction(db,async tx=>{
   const snap=await tx.get(target),rawBefore=snap.exists()?snap.data():null,before=rawBefore?plain(rawBefore):null,at=F.serverTimestamp();
   const next=makeNext(before,at,audit.id,backup.id),targets=[target.path];
   const after=Object.fromEntries(Object.entries(next).filter(([key])=>!['updatedAt','lastAudit','lastBackup'].includes(key)));
   tx.set(backup,{id:backup.id,actor:user.uid,at,action,targets,before:[rawBefore],reason,auditId:audit.id});
   tx.set(audit,{id:audit.id,actor:user.uid,at,action,targets,reason,before:[before],after:[after],backupId:backup.id});
   return {before,next};
  });
  await F.runTransaction(db,async tx=>{
   const snap=await tx.get(target),current=snap.exists()?plain(snap.data()):null;
   if(!same(current,prepared.before))throw Error('management-target-changed-after-backup');
   tx.set(target,prepared.next,{merge:true});
  });
  return {ok:true,auditId:audit.id,backupId:backup.id};
 }
 async function snapshot(){
  const [docs,notice,audit]=await Promise.all([Promise.all(GAME_IDS.map(id=>F.getDocFromServer(ref('gameSettings',id)))),F.getDocFromServer(ref('notices','current')),list('managementAudit')]);
  const games=GAME_IDS.map(id=>{const data=docs.find(d=>d.id===id)?.exists()?plain(docs.find(d=>d.id===id).data()):{};return {id,...data,status:visibilityStatus(data)}});
  const campaignMap=new Map();for(const game of games){const c=game.campaign;if(!c?.id)continue;const row=campaignMap.get(c.id)||{...c,games:[],enabled:true};row.games.push(game.id);row.enabled=row.enabled&&c.enabled===true;campaignMap.set(c.id,row)}
  const campaigns=[...campaignMap.values()];
  return {games,notice:notice.exists()?plain(notice.data()):null,managementAudit:audit,campaigns};
 }
 async function mutate(user,action,input){
  input=checkedInput(action,input);
  if(action==='visibilityBatch'){
   const refs=input.games.map(game=>ref('gameSettings',game)),audit=F.doc(col('managementAudit')),backup=F.doc(col('managementBackups'));
   return F.runTransaction(db,async tx=>{
    const snaps=await Promise.all(refs.map(target=>tx.get(target)));
    const beforeByGame=Object.fromEntries(input.games.map((game,i)=>[game,snaps[i].exists()?snaps[i].data():null]));
    const afterByGame=Object.fromEntries(input.games.map(game=>[game,input.status]));
    const targets=refs.map(target=>target.path),at=F.serverTimestamp();
    tx.set(backup,{id:backup.id,actor:user.uid,at,action,targets,beforeByGame,reason:input.reason,auditId:audit.id});
    tx.set(audit,{id:audit.id,actor:user.uid,at,action,targets,beforeByGame,afterByGame,reason:input.reason,backupId:backup.id});
    for(const target of refs)tx.set(target,{status:input.status,updatedAt:at,lastAudit:audit.id,lastBackup:backup.id},{merge:true});
    return {ok:true,auditId:audit.id,backupId:backup.id,games:[...input.games],status:input.status};
   });
  }
  if(action==='campaign'){
   const campaignId=F.doc(col('managementAudit')).id,results=[];
   for(const game of input.games){
    const target=ref('gameSettings',game);
    try{const result=await writeOne(user,action,target,input.reason,(previous,at,auditId,backupId)=>{
     const stamp=Date.now();
     if(input.enabled&&previous?.campaign?.enabled===true&&Number(previous.campaign.endAt)>stamp)throw Error('campaign-already-scheduled');
     return {...previous,campaign:{id:input.enabled?campaignId:(previous?.campaign?.id||null),enabled:input.enabled,startAt:input.startAt,endAt:input.endAt,actor:user.uid},updatedAt:at,lastAudit:auditId,lastBackup:backupId};
    });results.push({...result,game,campaignId});}catch(error){if(results.length){const partial=new Error(`一部のゲームだけ更新しました（${results.map(r=>r.game).join('、')}）。状態を確認して再操作してください。 ${error.message||''}`);partial.code='campaign-partial';throw partial;}throw error;}
   }
   return {ok:true,campaignId,results};
  }
  const target=action==='visibility'?ref('gameSettings',input.game):ref('notices','current');
  return writeOne(user,action,target,input.reason,(previous,at,auditId,backupId)=>action==='notice'?{
   title:input.deleted===true?(previous?.title||''):input.title,
   body:input.deleted===true?(previous?.body||''):input.body,
   published:input.deleted===true?false:input.published,
   deleted:input.deleted===true,revision:(previous?.revision||0)+1,
   updatedAt:at,lastAudit:auditId,lastBackup:backupId
  }:{status:input.status,updatedAt:at,lastAudit:auditId,lastBackup:backupId});
 }
 return {snapshot,mutate,plain};
}
