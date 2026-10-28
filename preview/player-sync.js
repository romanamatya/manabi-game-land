import './spark-config.js?v=cbb922213162';
import {browserClient} from './player-sync-api.js?v=cbb922213162';
import {capture,read,zero,number,localBalances,union,GAMES,error,observeBalances} from './player-sync-model.js?v=cbb922213162';
const META='mgl_sync_v2',BACKUP='mgl_sync_original_v2';
const watched=new Set(['mgl_nickname','mgl_economy_v1','mgl_profile','mgl_best','mq_pref_name','mq_pref_place',...GAMES.map(g=>'mgl_'+g),'mgl_limited_icons_v1','mgl_limited_frames_v1']);
export async function start(){
 const config=window.MANABI_SPARK_CONFIG||{},url=new URL(location.href),isSyncTest=url.searchParams.get('syncTest')==='1';
 if(window.MANABI_ENV?.preview!==true||url.searchParams.has('adminTest'))return null;
 const storage=window.manabiStorage,core=window.ManabiEconomyCore,catalog=window.ManabiProfileCatalog;
 if(!storage||!core||!catalog)return null;
 const testGate=config.playerSyncTestEnabled===true&&isSyncTest&&storage.getItem('mgl_nickname')===config.playerSyncTestNickname;
 if(config.playerSyncEnabled!==true&&!testGate)return null;
 let api=null,applying=false,timer=null,running=null,again=false,stop=null,connecting=null,lastNotice='';
 const localLock=fn=>navigator.locks?navigator.locks.request('manabi-preview-economy-v1',fn):Promise.reject(error('cross-tab-lock-required'));
 const snapshot=()=>capture(storage,core,catalog);
 if(!storage.getItem(BACKUP))storage.setItem(BACKUP,JSON.stringify({version:2,createdAt:Date.now(),raw:Object.fromEntries([...watched].map(k=>[k,storage.getItem(k)]))}));
 if(!storage.getItem(META)){const initial=snapshot();storage.setItem(META,JSON.stringify({version:2,deviceId:crypto.randomUUID(),uid:null,baseline:initial,earned:zero(),appearanceBase:0,appearanceDirty:false,seenBalances:initial.balances}));}
 const meta=()=>read(storage,META);
 function status(text){lastNotice=text;document.body.dataset.playerSyncStatus=text;const node=document.getElementById('syncStatus');if(node)node.textContent=text;let badge=document.getElementById('playerSyncStatus');if(!badge){badge=document.createElement('p');badge.id='playerSyncStatus';badge.setAttribute('role','status');Object.assign(badge.style,{position:'fixed',bottom:'28px',left:'8px',maxWidth:'95vw',zIndex:'1900',font:'12px system-ui',padding:'5px 8px',background:'#fff',borderRadius:'6px'});document.body.append(badge)}badge.textContent=text;}
 function describe(e){return ({'auth/admin-restricted-operation':'確認用Firebaseで「匿名」ログインを有効にして。端末の記録は保持中。','auth/operation-not-allowed':'確認用Firebaseで「匿名」ログインを有効にして。端末の記録は保持中。','permission-denied':'確認用Firebaseの第2弾Rules設定待ち。端末の記録は保持中。','migration-review-required':'オンライン記録と端末ポイントの移行確認が必要。端末データを保持して同期を停止中。','player-identity-changed':'保存済みUIDと認証UIDが異なる。元のデータを保持して同期を停止中。','player-suspended':'このプレイヤーは利用停止中。端末の記録は保持中。','sync-ledger-conflict':'加算履歴の照合が必要。端末データを保持中。','cross-tab-lock-required':'このブラウザーは安全な同期処理に未対応。端末の記録は保持中。'})[e.code||e.message]||'Firebase同期待ち。端末の記録は保持中。';}
 const nativeSet=storage.setItem.bind(storage);
 storage.setItem=(key,value)=>{
  nativeSet(key,value);if(applying||!watched.has(key))return;
  let m=meta();if(key==='mgl_economy_v1')m=observeBalances(m,read(storage,key).balances||{});
  if(key==='mgl_profile')m.appearanceDirty=true;
  nativeSet(META,JSON.stringify(m));schedule();
 };
 function schedule(){clearTimeout(timer);timer=setTimeout(()=>flush().catch(()=>{}),1800);}
 async function connect(){if(api)return api;if(connecting)return connecting;connecting=(async()=>{const value=await browserClient(window.MANABI_SPARK_CONFIG),m=meta();if(m.uid&&m.uid!==value.uid)throw error('player-identity-changed');m.uid=value.uid;nativeSet(META,JSON.stringify(m));api=value;stop=api.watch(e=>{if(e){status(describe(e));return}pull().catch(e=>status(describe(e)));});return api;})().finally(()=>{connecting=null});return connecting;}
 async function apply(result){if(!result?.player||!result.ledger)return;await localLock(()=>{
  const p=result.player,m=meta(),w=read(storage,'mgl_economy_v1',core.initial());
  applying=true;
  try{
   if(result.appearanceConflict)nativeSet('mgl_sync_appearance_conflict_v2',storage.getItem('mgl_profile'));
   w.balances=localBalances(p,result.ledger,m.earned);w.owned=union(w.owned||[],p.owned||[]);
   w.limitedOwned=(core.limitedRewards||[]).filter(x=>w.owned.includes(x.id)).map(x=>x.id);w.limitedFramesOwned=(core.limitedFrames||[]).filter(x=>w.owned.includes(x.id)).map(x=>x.id);
   storage.setItem('mgl_economy_v1',JSON.stringify(w));
   const beforeName=storage.getItem('mgl_nickname');storage.setItem('mgl_nickname',p.nickname);
   storage.setItem('mgl_sync_titles_v2',JSON.stringify(union(read(storage,'mgl_sync_titles_v2',[]),p.titles||[])));
   for(const g of GAMES){if(g==='keisan')storage.setItem('mgl_best',String(Math.max(number(storage.getItem('mgl_best')),number(p.best[g]))));else{const k='mgl_'+g,state=read(storage,k);state.best=Math.max(number(state.best),number(p.best[g]));storage.setItem(k,JSON.stringify(state));}}
   if(!m.appearanceDirty||result.appearanceConflict){const old=read(storage,'mgl_profile');storage.setItem('mgl_profile',JSON.stringify({...old,...p.appearance}));}
   // Only acknowledge the appearance actually included in this push, not a newer edit.
   if(result.sentAppearance&&JSON.stringify(snapshot().appearance)===JSON.stringify(result.sentAppearance))m.appearanceDirty=false;
   if(result.appearanceConflict)m.appearanceDirty=false;
   if(!m.appearanceDirty || result.sentAppearance && JSON.stringify(result.sentAppearance)===JSON.stringify(p.appearance))m.appearanceBase=number(p.appearanceRevision);m.seenBalances=w.balances;nativeSet(META,JSON.stringify(m));
   const name=document.getElementById('playerName');if(name)name.textContent=p.nickname;
   document.body.dataset.playerId=api.uid;document.body.dataset.playerStatus=p.status;
   window.dispatchEvent(new Event('manabi-profile-change'));window.dispatchEvent(new Event('manabi-economy-change'));window.dispatchEvent(new Event('manabi-player-synced'));
   const g=document.body.dataset.scoreGame;if(g)window.dispatchEvent(new CustomEvent('manabi-remote-best',{detail:number(p.best[g])}));
   if(beforeName!==p.nickname)document.dispatchEvent(new Event('manabi-nickname-sync'));
  }finally{applying=false;}
  status(p.status!=='active'?'このプレイヤーは利用停止中。':result.appearanceConflict?'別の端末の新しい装備を反映した。':'確認用Firebaseに同期済み');
 });}
 async function pull(){if(!api)return;const r=await api.pull(meta().deviceId);if(r.player&&r.ledger)await apply(r);}
 async function flush(){if(!snapshot().nickname)return;if(running){again=true;return running;}running=(async()=>{do{again=false;const client=await connect(),m=structuredClone(meta()),local=snapshot();const result=await client.push(local,m,catalog,core);result.sentAppearance=local.appearance;await apply(result);}while(again);})().catch(e=>{status(describe(e));throw e}).finally(()=>{running=null;});return running;}
 const publicApi={flush,uid:()=>api?.uid||meta().uid,buy:async(id,subject)=>{if(!navigator.onLine)throw error('purchase-online-required');await flush();await api.buy(id,subject,core);await pull();return {wallet:read(storage,'mgl_economy_v1',core.initial())};},status:()=>lastNotice};
 window.ManabiPlayerSync=publicApi;
 window.addEventListener('online',()=>flush().catch(()=>{}));window.addEventListener('storage',e=>{if(e.key?.endsWith(META)||e.key?.includes('mgl_economy_v1'))schedule();});document.addEventListener('visibilitychange',()=>{if(!document.hidden)flush().catch(()=>{});});window.addEventListener('pageshow',schedule);
 document.addEventListener('manabi-nickname-sync',()=>{const registered=!!storage.getItem('mgl_nickname');for(const [id,hidden] of [['playerWelcome',registered],['playerReady',!registered]]){const n=document.getElementById(id);if(n)n.hidden=hidden;}});
 status(testGate?'テスト用プレイヤーを確認用Firebaseへ同期中。ランキングには記録しない。':'確認用Firebaseへ接続中。端末の記録は保持中。');flush().catch(()=>{});
 return publicApi;
}

