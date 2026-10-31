import {contractFor,normalizePlayer,legacyScorePatch,canonicalNickname,error} from './data-contract.js?v=4fa9564408fb';
export function createFirestoreStore(mode,F,db,{catalog=[],rankingGameIds=[]}={}){
 // Rules can reject a stale backup before a transaction conflict is retried.
 // Retry the complete read/write transaction; never relax validation or write outside it.
 async function transact(work){for(let attempt=0;attempt<3;attempt++){try{return await F.runTransaction(db,work)}catch(e){if(attempt===2||!['permission-denied','aborted'].includes(e.code))throw e;}}}
 const c=contractFor(mode),ref=uid=>F.doc(db,c.players,uid),audit=()=>F.doc(F.collection(db,c.audit)),backup=()=>F.doc(F.collection(db,c.backups));
 const list=async cursor=>{const clauses=[F.orderBy(F.documentId()),...(cursor?[F.startAfter(cursor)]:[]),F.limit(100)];const s=await F.getDocsFromServer(F.query(F.collection(db,c.players),...clauses));return {rows:s.docs.map(d=>normalizePlayer(d.data(),d.id,c,catalog)),cursor:s.size===100?s.docs.at(-1).id:null};};
 async function rename(user,input){
  const nickname=typeof input.nickname==='string'?input.nickname.trim():'',reason=typeof input.reason==='string'?input.reason.trim():'';
  if(!input.uid||input.uid===user.uid||nickname.length<1||nickname.length>12||/[<>\\r\\n]/.test(nickname)||reason.length<2||reason.length>300||typeof input.expectedNickname!=='string')throw error('invalid-input');
  const target=ref(input.uid),a=audit(),b=backup();
  const linksQuery=mode==='production'?F.query(F.collection(db,'productionRankings','v1','identityLinks'),F.where('profileUid','==',input.uid),F.limit(11)):null;
  const linkSnap=linksQuery?await F.getDocsFromServer(linksQuery):{docs:[]};
  if(linkSnap.size>10)throw error('player-ranking-link-review');
  const links=linkSnap.docs.map(d=>({uid:d.id,data:d.data(),ref:d.ref}));
  if(links.some(x=>x.data.uid!==x.uid||x.data.profileUid!==input.uid))throw error('player-ranking-link-review');
  const rankRefs=links.flatMap(link=>([...new Set(rankingGameIds)]).map(game=>({uid:link.uid,game,linkRef:link.ref,ref:F.doc(db,'productionRankings','v1','games',game,'players',link.uid)})));
  return transact(async tx=>{
   const reads=await Promise.all([tx.get(target),...links.map(x=>tx.get(x.ref)),...rankRefs.map(x=>tx.get(x.ref))]),old=reads[0];
   if(!old.exists())throw error('player-not-found');
   const data=old.data();
   if(String(data.nickname||'')!==input.expectedNickname)throw error('name-conflict');
   if(data.nickname===nickname)return {ok:true,unchanged:true};
   const linkStart=1,rankStart=1+links.length;
   for(let i=0;i<links.length;i++){const current=reads[linkStart+i];if(!current.exists()||current.data().profileUid!==input.uid||current.data().uid!==links[i].uid)throw error('player-ranking-link-review');}
   const rankings=rankRefs.flatMap((x,i)=>{const snap=reads[rankStart+i];return snap.exists()?[{uid:x.uid,game:x.game,data:snap.data()}]:[]});
   const at=F.serverTimestamp(),backupData={player:data,links:links.map(x=>({uid:x.uid,profileUid:x.data.profileUid})),rankings};
   tx.set(b,{actor:user.uid,at,uid:input.uid,target:'players/'+input.uid,kind:'rename',data:backupData});
   tx.set(a,{actor:user.uid,at,uid:input.uid,target:'players/'+input.uid,action:'rename',reason,backupId:b.id,beforeName:String(data.nickname||''),afterName:nickname});
   tx.update(target,{nickname,lastAudit:a.id,lastBackup:b.id,adminUpdatedAt:at});
   for(let i=0;i<rankRefs.length;i++)if(reads[rankStart+i].exists())tx.update(rankRefs[i].ref,{nickname,updatedAt:at});
   return {ok:true,auditId:a.id,updatedRankRows:rankings.length};
  });
 }
 async function saveLegacy(uid,local,game,appearance){if(mode!=='production')throw error('legacy-adapter-environment-mismatch');let result;await transact(async tx=>{const s=await tx.get(ref(uid)),remote=s.exists()?s.data():null;const patch=legacyScorePatch(remote,local,game,appearance,Date.now());result={nickname:patch.nickname,best:patch[Object.keys(patch).find(k=>k.endsWith('BestStreak')||k==='bestStreak')]};tx.set(ref(uid),patch,{merge:true});});return result;}
 async function saveProfile(uid,localName,appearance){let name;await transact(async tx=>{const s=await tx.get(ref(uid));name=canonicalNickname(s.exists()?s.data():null,localName);if(!name)throw error('nickname-required');tx.set(ref(uid),{nickname:name,appearance,updatedAt:Date.now()},{merge:true});});return name;}
 return {contract:c,ref,list,rename,saveLegacy,saveProfile};
}
