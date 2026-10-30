import {GAME_IDS as REGISTERED_GAME_IDS,checkedInput,rankingRows} from './management-model.js?v=summary1';
const GAME_IDS=REGISTERED_GAME_IDS.filter(id=>id!=='keisanSummary'||globalThis.window?.MANABI_BACKEND_CONFIG?.summaryManagementEnabled===true);
import {contractFor} from './data-contract.js?v=summary1';
export function createManagementStore(mode,F,db,{players,rankingGameIds=[]}={}){
 const c=contractFor(mode),base=c.base,ref=(collection,id)=>F.doc(db,base+'/'+collection,id),col=k=>F.collection(db,base+'/'+k);
 const plain=x=>x?.toMillis?x.toMillis():Array.isArray(x)?x.map(plain):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,plain(v)])):x;
 const query=async k=>(await F.getDocsFromServer(F.query(col(k),F.orderBy('at','desc'),F.limit(100)))).docs.map(d=>plain({...d.data(),id:d.id}));
 async function snapshot(){const [settings,notice,audit,campaigns,backups]=await Promise.all([Promise.all(GAME_IDS.map(id=>F.getDocFromServer(ref('gameSettings',id)))),F.getDocFromServer(ref('notices','current')),query('managementAudit'),query('campaignHistory'),query('rankingBackups')]);
  const legacyNotice=!notice.exists()?await F.getDocFromServer(ref('settings','notice')):null;
  const games=GAME_IDS.map(id=>({id,published:true,generation:0,rankingSupported:rankingGameIds.includes(id),...plain(settings.find(d=>d.id===id)?.data()||{})}));
  let all=[];if(rankingGameIds.length){let cursor=null;do{const page=await players(cursor);all.push(...page.rows);cursor=page.cursor;if(all.length>1000)throw Error('ranking-backup-too-large');}while(cursor);}
  const rankings=games.flatMap(g=>g.rankingSupported&&g.generation===0?rankingRows(all,g.id).map(r=>({...r,game:g.id,generation:g.generation})):[]);
  if(!GAME_IDS.includes('keisanSummary'))games.push({id:'keisanSummary',published:false,managementSupported:false,rankingSupported:false,generation:0});
  return {rankings,games,notice:notice.exists()?plain(notice.data()):legacyNotice?.exists()?plain(legacyNotice.data()):null,managementAudit:audit,campaigns,backups};
 }
 async function mutate(user,action,input){checkedInput(action,input);if(['reset','rankingBackup'].includes(action)&&!rankingGameIds.includes(input.game))throw Error('device-only-ranking');
  let rows=[];if(['reset','rankingBackup'].includes(action)){let cursor=null,all=[];do{const page=await players(cursor);all.push(...page.rows);cursor=page.cursor;if(all.length>1000)throw Error('ranking-backup-too-large');}while(cursor);rows=rankingRows(all,input.game);}
  const target=action==='notice'?ref('notices','current'):ref('gameSettings',input.game),a=F.doc(col('managementAudit')),b=F.doc(col('managementBackups')),rank=F.doc(col('rankingBackups')),campaign=F.doc(col('campaignHistory'));
  return F.runTransaction(db,async tx=>{const snapshot=await tx.get(target),old=snapshot.exists()?snapshot.data():null,at=F.serverTimestamp(),game=input.game;
   let next;
   if(action==='notice')next={title:input.title,body:input.body,published:input.published,revision:(old?.revision||0)+1,updatedAt:at,lastAudit:a.id,lastBackup:b.id};
   else{next={published:true,generation:0,campaign:{enabled:false,endAt:null,id:null},...old,revision:(old?.revision||0)+1,updatedAt:at,lastAudit:a.id,lastBackup:b.id};
    if(action==='visibility')next.published=input.published;
    if(action==='campaign')next.campaign={enabled:input.enabled,endAt:input.enabled?input.endAt??null:null,id:input.enabled?campaign.id:null};
    if(action==='reset'){next.generation=(old?.generation||0)+1;next.rankingResetAt=at;next.rankingBackup=rank.id;}
   }
   if(action==='rankingBackup'){tx.set(rank,{actor:user.uid,at,game,generation:old?.generation||0,rows,reason:input.reason});tx.set(a,{actor:user.uid,at,action,game,target:base+'/rankingBackups/'+rank.id,reason:input.reason,backupId:rank.id});return {backupId:rank.id};}
   tx.set(b,{actor:user.uid,at,target:target.path,action,game:game||null,before:old});
   tx.set(a,{actor:user.uid,at,action,game:game||null,target:target.path,reason:input.reason,backupId:b.id,before:old,after:next});tx.set(target,next);
   if(action==='reset')tx.set(rank,{actor:user.uid,at,game,generation:old?.generation||0,rows,reason:input.reason});
   if(action==='campaign')tx.set(campaign,{actor:user.uid,at,game,enabled:input.enabled,startAt:input.enabled?Date.now():null,endAt:input.endAt??null,previousCampaign:old?.campaign?.id||null});
   return {ok:true,auditId:a.id,backupId:b.id};
  });
 }
 return {snapshot,mutate,plain};
}

