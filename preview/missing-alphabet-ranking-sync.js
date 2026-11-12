import {bestForSharedRanking} from './ranking-sync-api.js?v=efb3d80b0d40';

const GAME='missingAlphabet',config=window.MANABI_BACKEND_CONFIG,storage=window.manabiStorage;
if(config?.mode==='production'&&config.missingAlphabetRankingSyncEnabled===true&&config.rankingGameIds?.includes(GAME)&&storage){

const pendingKey='mgl_missingAlphabet_ranking_pending_v1';
const gameInfo=(window.ManabiProfileCatalog||[]).find(item=>item.id===GAME);
const titles=gameInfo?.titles||[];
let startingBest=0,pendingBest=0,apiPromise=null,flushTimer=0,running=false;
const getJSON=(key,fallback)=>{try{const value=JSON.parse(storage.getItem(key)||'null');return value&&typeof value==='object'?value:fallback}catch{return fallback}};
const points=()=>{
 const local=getJSON('mgl_missingAlphabet',{}),challenge=getJSON('mgl_challenge120_v1:'+GAME,{});
 return bestForSharedRanking(GAME,local,challenge);
};
const appearance=()=>window.ManabiProfile?.appearance(storage)||{icon:'cat',frame:'plain',badge:null};
const titleAt=best=>[...titles].filter(title=>best>=title.at).at(-1)?.name||null;
const accountAllowed=()=>config.accountAccessEnabled!==true||window.ManabiPlayerAccess?.canPlay?.()===true;
async function api(){
 if(!apiPromise)apiPromise=import('./ranking-sync-api.js?v=efb3d80b0d40').then(module=>module.missingAlphabetClient()).catch(error=>{apiPromise=null;throw error});
 return apiPromise;
}
async function flush(){
 if(running||pendingBest<1||!accountAllowed())return;
 running=true;
 const status=document.getElementById('missingAlphabetRankingStatus');
 try{
  const service=await api(),nickname=await service.getExistingPlayerLink(),best=points(),look=appearance();
  const score=Math.max(best,pendingBest);
  if(score<1)return;
  await service.publishRanking({game:GAME,bestStreak:score,nickname,icon:look.icon,frame:look.frame,title:titleAt(score),badge:look.badge});
  if(pendingBest<=score){pendingBest=0;storage.removeItem(pendingKey);}
  else {clearTimeout(flushTimer);flushTimer=setTimeout(()=>void flush(),0);}
  if(status)status.textContent='共有ランキングに保存しました';
 }catch{
  if(status)status.textContent='共有ランキングへの保存待ちです。個人記録は端末に保持しています。';
 }finally{running=false;}
}
function earnedNewRecord(){
 const best=points();
 if(best<=startingBest)return;
 startingBest=Math.max(startingBest,best);pendingBest=Math.max(pendingBest,best);
 try{storage.setItem(pendingKey,JSON.stringify({best:pendingBest,at:Date.now()}))}catch{}
 clearTimeout(flushTimer);flushTimer=setTimeout(()=>void flush(),180);
}
function addStatus(){if(document.getElementById('missingAlphabetRankingStatus'))return;const status=document.createElement('p');status.id='missingAlphabetRankingStatus';status.setAttribute('role','status');status.textContent='プロフィールとの共有ID連携を確認しています。';(document.querySelector('.play')||document.body).append(status);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addStatus,{once:true});else addStatus();
const savedPending=getJSON(pendingKey,null);if(Number.isSafeInteger(savedPending?.best)&&savedPending.best>0)pendingBest=savedPending.best;
startingBest=points();
window.addEventListener('manabi-learning-answer',event=>{if(event.detail?.game===GAME&&event.detail.correct===true&&event.detail.final===true)earnedNewRecord()});
window.addEventListener('manabi-local-record-change',earnedNewRecord);
window.addEventListener('manabi-profile-change',()=>{if(pendingBest)void flush()});
window.addEventListener('online',()=>{if(pendingBest)void flush()});
if(pendingBest)void flush();
}
