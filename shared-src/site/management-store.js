import {GAME_IDS,checkedInput,visibilityStatus} from './management-model.js?v=admin-simple-1';
import {contractFor} from './data-contract.js?v=adminprod-20261030';

export function createManagementStore(mode,F,db){
 const {base}=contractFor(mode),ref=(collection,id)=>F.doc(db,base+'/'+collection,id),col=k=>F.collection(db,base+'/'+k);
 const plain=x=>x?.toMillis?x.toMillis():Array.isArray(x)?x.map(plain):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,plain(v)])):x;
 const list=async k=>(await F.getDocsFromServer(F.query(col(k),F.orderBy('at','desc'),F.limit(100)))).docs.map(d=>plain({...d.data(),id:d.id}));
 async function snapshot(){
  const [docs,notice,audit]=await Promise.all([Promise.all(GAME_IDS.map(id=>F.getDocFromServer(ref('gameSettings',id)))),F.getDocFromServer(ref('notices','current')),list('managementAudit')]);
  const games=GAME_IDS.map(id=>{const data=docs.find(d=>d.id===id)?.exists()?plain(docs.find(d=>d.id===id).data()):{};return {id,...data,status:visibilityStatus(data)}});
  const campaignMap=new Map();for(const game of games){const c=game.campaign;if(!c?.id)continue;const row=campaignMap.get(c.id)||{...c,games:[],enabled:true};row.games.push(game.id);row.enabled=row.enabled&&c.enabled===true;campaignMap.set(c.id,row)}
  const campaigns=[...campaignMap.values()];
  return {games,notice:notice.exists()?plain(notice.data()):null,managementAudit:audit,campaigns};
 }
 async function mutate(user,action,input){
  checkedInput(action,input);
  if(action==='campaign'){
   const campaignId=F.doc(col('managementAudit')).id,results=[];
   for(const game of input.games){
    const target=ref('gameSettings',game),audit=F.doc(col('managementAudit')),backup=F.doc(col('managementBackups'));
    try{const result=await F.runTransaction(db,async tx=>{
     const snap=await tx.get(target),previous=snap.exists()?plain(snap.data()):null,stamp=Date.now();
     if(input.enabled&&previous?.campaign?.enabled===true&&Number(previous.campaign.endAt)>stamp)throw Error('campaign-already-scheduled');
     const at=F.serverTimestamp(),next={status:previous?.status||'published',...previous,campaign:{id:input.enabled?campaignId:(previous?.campaign?.id||null),enabled:input.enabled,startAt:input.startAt,endAt:input.endAt,actor:user.uid},updatedAt:at,lastAudit:audit.id,lastBackup:backup.id};
     const targets=[target.path],before=[previous],after=[Object.fromEntries(Object.entries(next).filter(([key])=>!['updatedAt','lastAudit','lastBackup'].includes(key)))];
     tx.set(backup,{id:backup.id,actor:user.uid,at,action,targets,before,reason:input.reason,auditId:audit.id});
     tx.set(audit,{id:audit.id,actor:user.uid,at,action,targets,reason:input.reason,before,after,backupId:backup.id});
     tx.set(target,next,{merge:true});
     return {ok:true,auditId:audit.id,backupId:backup.id,campaignId};
    });results.push({...result,game});}catch(error){if(results.length){const partial=new Error(`一部のゲームだけ更新しました（${results.map(r=>r.game).join('、')}）。状態を確認して再操作してください。 ${error.message||''}`);partial.code='campaign-partial';throw partial;}throw error;}
   }
   return {ok:true,campaignId,results};
  }
  const audit=F.doc(col('managementAudit')),backup=F.doc(col('managementBackups'));
  const targets=action==='visibility'?[ref('gameSettings',input.game)]:[ref('notices','current')];
  return F.runTransaction(db,async tx=>{
   const snapshots=[];for(const target of targets)snapshots.push(await tx.get(target));
   const at=F.serverTimestamp(),old=snapshots.map(s=>s.exists()?plain(s.data()):null),stamp=Date.now();
   if(action==='campaign'&&input.enabled&&old.some(v=>v?.campaign?.enabled===true&&Number(v.campaign.endAt)>stamp))throw Error('campaign-already-scheduled');
   let next;
   if(action==='notice'){
    const previous=old[0]||{};
    next={title:input.deleted===true?(previous.title||''):input.title,body:input.deleted===true?(previous.body||''):input.body,published:input.deleted===true?false:input.published,deleted:input.deleted===true,revision:(previous.revision||0)+1,updatedAt:at,lastAudit:audit.id,lastBackup:backup.id};
   }else if(action==='visibility'){
    next={status:input.status,updatedAt:at,lastAudit:audit.id,lastBackup:backup.id};
   }
   tx.set(backup,{id:backup.id,actor:user.uid,at,action,targets:targets.map(t=>t.path),before:old,reason:input.reason,auditId:audit.id});
   const auditAfter=(entry)=>Object.fromEntries(Object.entries(entry).filter(([key])=>!['updatedAt','lastAudit','lastBackup'].includes(key)));
   tx.set(audit,{id:audit.id,actor:user.uid,at,action,targets:targets.map(t=>t.path),reason:input.reason,before:old,after:Array.isArray(next)?next.map(auditAfter):auditAfter(next),backupId:backup.id});
   tx.set(targets[0],next,{merge:true});
   return {ok:true,auditId:audit.id,backupId:backup.id};
  });
 }
 return {snapshot,mutate,plain};
}
