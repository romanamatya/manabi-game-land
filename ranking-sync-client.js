import {client} from './ranking-sync-api.js?v=prod-admin-stage2-suspension-1';
const storage=window.manabiStorage,config=window.MANABI_BACKEND_CONFIG;
const games=['keisan','pref-name','pref-place','alphabet','distribution','distribution2','exchangeAssociation','kotowaza','multiplicationProperties','shapeExpressions','keisanSummary'];
const baseline=new Map(),published=new Map();let started=false,work=Promise.resolve(),startupPromise=null,profileUnsubscribe=null,identityReady=config?.playerNameSyncEnabled!==true;
const PENDING='mgl_production_rank_pending_v1';
const suspensionEnabled=config?.adminFeatures?.playerSuspension===true;
let accessUnsubscribe=null,accessOverlay=null,accessState='active';
function setAccessState(state){
 if(!suspensionEnabled)return;
 accessState=state;
 if(state==='active'){accessOverlay?.remove();accessOverlay=null;return}
 if(!accessOverlay){
  accessOverlay=document.createElement('section');accessOverlay.setAttribute('role','alertdialog');accessOverlay.setAttribute('aria-modal','true');
  Object.assign(accessOverlay.style,{position:'fixed',inset:'0',zIndex:'2147483647',display:'grid',placeItems:'center',padding:'24px',background:'rgba(13,26,49,.94)',color:'#fff',font:'700 20px/1.6 system-ui,sans-serif',textAlign:'center'});
  const panel=document.createElement('div');Object.assign(panel.style,{maxWidth:'540px',padding:'28px',borderRadius:'24px',background:'#20385e',boxShadow:'0 12px 50px #0008'});
  const title=document.createElement('h1');title.style.fontSize='1.4em';
  const message=document.createElement('p');const retry=document.createElement('button');retry.type='button';retry.textContent='もう一度確認する';retry.hidden=true;Object.assign(retry.style,{font:'inherit',padding:'12px 22px',borderRadius:'14px',border:'0',cursor:'pointer'});
  retry.onclick=async()=>{retry.disabled=true;setAccessState('checking');startupPromise=null;try{await initializePlayerNameSync()}catch{setAccessState('error')}finally{retry.disabled=false}};
  panel.append(title,message,retry);accessOverlay.append(panel);document.body.append(accessOverlay);accessOverlay._parts={title,message,retry};
 }
 const {title,message,retry}=accessOverlay._parts;
 if(state==='checking'){title.textContent='利用状態を確認しています';message.textContent='通信が終わるまで少し待ってください。';retry.hidden=true}
 else if(state==='suspended'){title.textContent='このアカウントは利用停止中です';message.textContent='管理者に確認してください。';retry.hidden=true}
 else {title.textContent='利用状態を確認できません';message.textContent='通信状態を確認して、もう一度お試しください。';retry.hidden=false}
}
async function syncPlayerAccess(api){
 if(!suspensionEnabled)return;
 setAccessState('checking');
 const access=await api.playerAccess();
 setAccessState(access.status);
 accessUnsubscribe?.();
 accessUnsubscribe=api.watchPlayerAccess(value=>setAccessState(value.status),()=>setAccessState('error'));
}
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
 if(!identityReady)return;
 const pendingRows=new Set(readPending());
 for(const game of games){const best=localBest(game),old=baseline.get(game)||0;if(best>old)pendingRows.add(game);}
 if(!navigator.onLine){writePending([...pendingRows]);return;}
 const api=await client();
 for(const game of games){
  const best=localBest(game),old=baseline.get(game)||0,marker='mgl_production_rank_synced_v1:'+api.uid+':'+game;
  if(best>old||(forceProfile&&storage.getItem(marker)))pendingRows.add(game);
  if(best<1)continue;
  const value=projection(game,best),signature=JSON.stringify(value),cacheKey=api.uid+':'+game;
  if(storage.getItem(marker)===signature||published.get(cacheKey)===signature){published.set(cacheKey,signature);baseline.set(game,Math.max(old,best));pendingRows.delete(game);continue;}
  try{const saved=await api.publishRanking(value);storage.setItem(marker,signature);published.set(cacheKey,signature);baseline.set(game,Math.max(old,best));pendingRows.delete(game);}
  catch{pendingRows.add(game);}
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
  const nickname=await api.ensurePlayerLink((storage.getItem('mgl_nickname')||'').trim());
  identityReady=true;
  applyCanonicalName(nickname);
  if(suspensionEnabled)await syncPlayerAccess(api);
  profileUnsubscribe?.();profileUnsubscribe=api.watchPlayerName(applyCanonicalName);
  if(accessState==='active')await enqueue(()=>flush(true));
 })().catch(error=>{startupPromise=null;if(suspensionEnabled)setAccessState('error');throw error;});
 return startupPromise;
}
export function startRankingSync(){
 if(window.MANABI_ENV?.preview!==false||config?.rankingSyncEnabled!==true||new URL(location.href).searchParams.has('adminTest'))return Promise.resolve();
 if(!started){
  started=true;
  if(suspensionEnabled)setAccessState('checking');
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
