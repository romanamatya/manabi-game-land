import {client} from './ranking-sync-api.js?v=c3f74ab642d8';
const GAME='parallelPair';
export function parallelRankingEnabled(config,env){return env?.preview===false&&env.expectedProjectId==='manabi-game-land'&&config?.mode==='production'&&config.firebase?.projectId==='manabi-game-land'&&config.rankingSyncEnabled===true&&config.parallelPairRankingEnabled===true&&config.playerNameSyncEnabled===true&&config.rankingGameIds?.includes(GAME)===true;}
// One pending best, one acknowledgement per ranking UID. No answer data is stored.
export function createParallelRankingSync({api,storage,record,titles,appearance=()=>({}),online=()=>true,access=()=>true,status=()=>{},mergeBest=()=>{}}){
 const pendingKey='manabi_parallel_rank_pending:v1';let work=Promise.resolve();
 const number=v=>Number.isSafeInteger(Number(v))&&Number(v)>0&&Number(v)<=100000?Number(v):0;
 async function flush(){
  const run=async()=>{if(!access())return;const best=Math.max(number(record().best),number(storage.getItem(pendingKey)));if(!best)return;storage.setItem(pendingKey,String(best));if(!online()){status('ランキング保存待ち。記録は端末に保存されています。');return}
   try{const uid=api.uid,marker='manabi_parallel_rank_synced:v1:'+uid,acked=number(storage.getItem(marker));if(acked>=best){storage.removeItem(pendingKey);return}
    const nickname=await api.getExistingPlayerLink(),look=appearance()||{},earned=titles.filter(t=>t.at<=best).at(-1);
    const saved=await api.publishRanking({game:GAME,bestStreak:best,nickname,icon:look.icon||'cat',frame:look.frame||'plain',title:earned?.name||null,badge:look.badge||null});
    storage.setItem(marker,String(Math.max(best,number(saved.bestStreak))));if(number(saved.bestStreak)>number(record().best))await mergeBest(saved.bestStreak);storage.removeItem(pendingKey);status('ランキング保存済み');
   }catch{status('ランキング保存待ち。記録は端末に保存されています。')}
  };const result=work.then(run);work=result.catch(()=>{});return result;
 }
 return {flush,rows:async()=>{if(!access())throw Error('player-access-required');return api.rankings(GAME)}};
}
if(typeof window!=='undefined'&&typeof document!=='undefined'){
 const $=id=>document.getElementById(id),cfg=window.MANABI_BACKEND_CONFIG,env=window.MANABI_ENV,storage=window.manabiStorage||localStorage,local=window.ManabiParallelLocal;
 let sync=null,connecting=null;
 const enabled=parallelRankingEnabled(cfg,env)&&!new URL(location.href).searchParams.has('adminTest');
 const access=()=>cfg?.accountAccessEnabled!==true||window.ManabiPlayerAccess?.canPlay?.()===true;
 const status=message=>{$('parallel-ranking-status').textContent=message};
 const connect=async()=>{if(!enabled)throw Error('ranking-not-enabled');if(sync)return sync;if(!connecting)connecting=client().then(api=>sync=createParallelRankingSync({api,storage,record:local.read,titles:local.titles,mergeBest:local.mergeBest,access,online:()=>navigator.onLine,status,appearance:()=>{try{return window.ManabiProfile?.appearance(storage)||JSON.parse(storage.getItem('mgl_profile')||'{}')}catch{return {}}}})).catch(e=>{connecting=null;throw e});return connecting};
 async function request(){if(!enabled||!navigator.onLine||!access())return;try{await(await connect()).flush()}catch{status('ランキング保存待ち。記録は端末に保存されています。')}}
 async function show(){
  $('parallel-ranking').hidden=false;$('parallel-ranking-rows').replaceChildren();$('parallel-ranking-message').textContent=enabled?'読み込み中…':'共有ランキングは準備中です。記録は端末に保存されています。';if(!enabled)return;
  try{const rows=await(await connect()).rows();rows.sort((a,b)=>b.bestStreak-a.bestStreak);let previous=-1,rank=0;for(const [i,row]of rows.entries()){if(row.bestStreak!==previous){previous=row.bestStreak;rank=i+1}const tr=document.createElement('tr');for(const value of [rank+'位',row.nickname,row.bestStreak+'問連続']){const td=document.createElement('td');td.textContent=value;tr.append(td)}$('parallel-ranking-rows').append(tr)}$('parallel-ranking-message').textContent=rows.length?'最高連続正解のランキング':'記録はまだありません。'}catch{$('parallel-ranking-message').textContent='読み込めませんでした。接続を確認して更新してください。'}
 }
 $('ranking-open').onclick=show;$('ranking-refresh').onclick=show;$('ranking-close').onclick=()=>{$('parallel-ranking').hidden=true};
 status(enabled?'ランキング接続待ち':'記録は端末に保存されています。');
 window.addEventListener('manabi-parallel-record-change',request);window.addEventListener('online',request);window.addEventListener('pageshow',request);window.addEventListener('manabi-account-access',request);setInterval(request,15000);void request();
}
