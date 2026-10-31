import {client} from './ranking-sync-api.js?v=ranking-admin-v1';
const storage=window.manabiStorage,config=window.MANABI_BACKEND_CONFIG;
const games=['keisan','pref-name','pref-place','alphabet','distribution','distribution2','exchangeAssociation','kotowaza','multiplicationProperties','shapeExpressions','keisanSummary'];
const baseline=new Map(),published=new Map(),generationBaseline=new Map();let started=false,work=Promise.resolve(),startupPromise=null,profileUnsubscribe=null,identityReady=config?.playerNameSyncEnabled!==true;
const PENDING='mgl_production_rank_pending_v1';
function profileRow(game){return window.ManabiProfile?.records(storage).find(x=>x.id===game)||null}
function localBest(game){
 const record=profileRow(game);let best=Math.max(0,Number(record?.best)||0);
 try{const s=JSON.parse(storage.getItem('mgl_challenge120_v1:'+game)||'null');for(const n of Object.values(s?.bests||{}))if(Number.isSafeInteger(n))best=Math.max(best,n);if(Number.isSafeInteger(s?.attemptBest))best=Math.max(best,s.attemptBest)}catch{}
 return best;
}
function projection(game,best){
 const catalog=window.ManabiProfileCatalog?.find(x=>x.id===game),rows=window.ManabiProfile?.records(storage)||[];
 const earned=(catalog?.titles||[]).filter(t=>t.at<=best).sort((a,b)=>b.at-a.at)[0];
 const appearance=window.ManabiProfile?.appearance(storage)||{};
 return {game,bestStreak:best,nickname:(storage.getItem('mgl_nickname')||'').trim(),icon:appearance.icon||'cat',frame:appearance.frame||'plain',title:earned?.displayName||earned?.name||null,badge:appearance.badge||null};
}
function readPending(){try{const x=JSON.parse(storage.getItem(PENDING)||'[]');return Array.isArray(x)?x.filter(g=>games.includes(g)):[]}catch{return []}}
function writePending(rows){try{storage.setItem(PENDING,JSON.stringify([...new Set(rows)].slice(-games.length)))}catch{}}
function enqueue(task){work=work.then(task).catch(()=>{});return work}
async function flush(forceProfile=false){
 if(!identityReady||config?.accountAccessEnabled===true&&!window.ManabiPlayerAccess?.canPlay?.())return;
 const pendingRows=new Set(readPending());
 for(const game of games){const best=localBest(game),old=baseline.get(game)||0;if(best>old)pendingRows.add(game);}
 if(!navigator.onLine){writePending([...pendingRows]);return;}
 const api=await client();
 for(const game of games){
  const best=localBest(game),old=baseline.get(game)||0,generation=await api.rankingGeneration(game),season=generation===null?'legacy':String(generation),marker='mgl_production_rank_synced_v1:'+api.uid+':'+game+':'+season;
  if(!generationBaseline.has(game))generationBaseline.set(game,generation);else if(generationBaseline.get(game)!==generation){generationBaseline.set(game,generation);baseline.set(game,best);pendingRows.delete(game);continue;}
  if(best>old||(forceProfile&&storage.getItem(marker)))pendingRows.add(game);
  if(best<1)continue;
  const value=projection(game,best),signature=JSON.stringify(value),cacheKey=api.uid+':'+game+':'+season;
  if(storage.getItem(marker)===signature||published.get(cacheKey)===signature){published.set(cacheKey,signature);baseline.set(game,Math.max(old,best));pendingRows.delete(game);continue;}
  try{const saved=await api.publishRanking(value,{freshRecord:best>old});storage.setItem(marker,signature);published.set(cacheKey,signature);baseline.set(game,Math.max(old,best));pendingRows.delete(game);}
  catch(error){if(error?.code==='ranking-new-record-required'){published.set(cacheKey,signature);pendingRows.delete(game);}else pendingRows.add(game);}
 }
 writePending([...pendingRows]);
}
function applyCanonicalName(value){
 if(typeof value!=='string'||!value.trim()||value.length>12||/[<>\\r\\n]/.test(value)||storage.getItem('mgl_nickname')===value)return;
 storage.setItem('mgl_nickname',value);
 const label=document.getElementById('playerName');if(label)label.textContent=value;
 window.dispatchEvent(new Event('manabi-nickname-sync'));
 window.dispatchEvent(new Event('manabi-profile-change'));
}
async function initializePlayerNameSync(){
 if(config?.playerNameSyncEnabled!==true)return;
 if(startupPromise)return startupPromise;
 startupPromise=(async()=>{
  const api=await client();
  const nickname=config?.accountAccessEnabled===true?await api.getExistingPlayerLink():await api.ensurePlayerLink((storage.getItem('mgl_nickname')||'').trim());
  identityReady=true;
  applyCanonicalName(nickname);
  profileUnsubscribe?.();profileUnsubscribe=api.watchPlayerName(applyCanonicalName);
  await enqueue(()=>flush(true));
 })().catch(error=>{startupPromise=null;throw error;});
 return startupPromise;
}
export function startRankingSync(){
 if(window.MANABI_ENV?.preview!==false||config?.rankingSyncEnabled!==true||new URL(location.href).searchParams.has('adminTest'))return Promise.resolve();
 if(!started){
  started=true;
  for(const game of games)baseline.set(game,localBest(game));
  const request=()=>{if(config?.playerNameSyncEnabled===true&&!identityReady)void initializePlayerNameSync().catch(()=>{});return enqueue(flush)};
  window.ManabiSharedRanking={fetch:async game=>(await client()).rankings(game),champions:async()=>(await client()).champions(),refresh:request};
  window.addEventListener('manabi-local-record-change',request);
  window.addEventListener('manabi-profile-change',()=>{if(config?.playerNameSyncEnabled===true&&!identityReady)void initializePlayerNameSync().catch(()=>{});return enqueue(()=>flush(true))});
  window.addEventListener('manabi-economy-change',request);
  window.addEventListener('online',request);window.addEventListener('pageshow',request);
 }
 return initializePlayerNameSync();
}
export {client,localBest,projection};
