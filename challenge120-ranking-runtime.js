import {client} from './ranking-sync-api.js?v=challenge120-ranking-v1';
import {CHALLENGE120_GAMES,validChallenge120Result} from './challenge120-ranking-model.js?v=challenge120-ranking-v1';

const config=window.MANABI_BACKEND_CONFIG;
if(window.MANABI_ENV?.preview!==false||config?.challenge120RankingEnabled!==true||new URL(location.href).searchParams.has('adminTest'))throw new Error('challenge120-ranking-runtime-disabled');
const storage=window.manabiStorage,KEY='mgl_challenge120_pending_v3';
if(!storage)throw new Error('challenge120-storage-unavailable');
let flushPromise=Promise.resolve();
function readPending(){try{const rows=JSON.parse(storage.getItem(KEY)||'[]');return Array.isArray(rows)?rows.filter(row=>CHALLENGE120_GAMES.includes(row?.game)&&validChallenge120Result(row)).slice(-11):[]}catch{return []}}
function writePending(rows){storage.setItem(KEY,JSON.stringify(rows.slice(-11)))}
function titleFor(game,best){const catalog=window.ManabiProfileCatalog?.find(row=>row.id===game);return catalog?.titles?.filter(title=>best>=title.at).sort((a,b)=>b.at-a.at)[0]?.displayName||catalog?.titles?.filter(title=>best>=title.at).sort((a,b)=>b.at-a.at)[0]?.name||null}
async function flush(){
 if(!navigator.onLine||config?.challenge120RankingEnabled!==true)return;
 flushPromise=flushPromise.then(async()=>{
  const api=await client(),pending=readPending();
  for(const row of pending){
   try{await api.publishChallenge120Score(row);writePending(readPending().filter(item=>item.game!==row.game||item.attemptId!==row.attemptId));}
   catch{return;}
  }
 }).catch(()=>{});
 return flushPromise;
}
window.addEventListener('manabi-challenge120-earned',event=>{
  const row=event.detail;if(!validChallenge120Result(row))return;
  const appearance=window.ManabiProfile?.appearance(storage)||{},pending=readPending(),old=pending.find(item=>item.game===row.game);
  if(old&&old.bestStreak>=row.bestStreak)return;
  const next={...row,icon:appearance.icon||'cat',frame:appearance.frame||'plain',badge:appearance.badge||null,title:titleFor(row.game,row.bestStreak)};
  writePending([...pending.filter(item=>item.game!==row.game),next]);void flush();
});
window.addEventListener('online',()=>void flush());
window.addEventListener('pageshow',()=>void flush());
function inspectSummaryChallenge(){
 const state=window.ManabiSummaryState;if(!state?.challenge120Candidate)return;
 try{const saved=JSON.parse(storage.getItem(state.KEY)||'null'),row=state.challenge120Candidate(saved);if(!row)return;const marker='mgl_challenge120_emitted_v3:keisanSummary:'+row.attemptId;if(storage.getItem(marker)==='1')return;storage.setItem(marker,'1');window.dispatchEvent(new CustomEvent('manabi-challenge120-earned',{detail:row}));}catch{}
}
document.addEventListener('DOMContentLoaded',inspectSummaryChallenge);
window.addEventListener('pageshow',inspectSummaryChallenge);
setInterval(inspectSummaryChallenge,1500);
void flush();
