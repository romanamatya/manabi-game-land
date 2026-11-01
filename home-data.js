import {publishedChampionGames} from './champion-visibility.js?v=home-champions-visibility-v1';

export async function startProductionHome(storage){
 const $=id=>document.getElementById(id);
 let nick=storage.getItem('mgl_nickname')||'',ranking=null,championRows=[];
 const statuses=new Map(),subscriptions=new Set();
 const games=window.ManabiLeaderboard.games;
 const show=()=>{$('playerWelcome').hidden=!!nick;$('playerReady').hidden=!nick;$('playerName').textContent=nick;};
 const status=t=>$('syncStatus').textContent=t;
 function apply(name){if(name!==nick){nick=name;storage.setItem('mgl_nickname',name);show();document.dispatchEvent(new Event('manabi-nickname-sync'));}}
 function renderChampions(error=false){
  const visibleGames=publishedChampionGames(games,statuses);
  window.ManabiLeaderboard.renderChampions(championRows,{error,visibleGames});
  if(error){$('boardStatus').textContent='ランキングを取得できませんでした。通信状態を確認して、もう一度お試しください。';return;}
  $('boardStatus').textContent=games.some(game=>statuses.get(game.id)==='unknown')?'公開状態を確認できないゲームは表示していません。':'公開中のゲームの共有記録を表示しています。';
 }
 function statusOf(setting){
  if(!setting)return 'unknown';
  if(['published','preparing','hidden'].includes(setting.status))return setting.status;
  if(setting.published===true)return 'published';
  if(setting.published===false)return 'hidden';
  return 'unknown';
 }
 function watchAvailability(){
  if(!window.ManabiPublicSettings?.availabilityEnabled||typeof window.ManabiPublicSettings.subscribeGame!=='function'){
   for(const game of games)statuses.set(game.id,'unknown');
   renderChampions();return;
  }
  for(const game of games){
   statuses.set(game.id,'unknown');
   Promise.resolve(window.ManabiPublicSettings.subscribeGame(game.id,snapshot=>{
    statuses.set(game.id,snapshot?.exists?.()?statusOf(snapshot.data()):'unknown');renderChampions();
   },()=>{statuses.set(game.id,'unknown');renderChampions();}))
    .then(unsubscribe=>{if(typeof unsubscribe==='function')subscriptions.add(unsubscribe);})
    .catch(()=>{statuses.set(game.id,'unknown');renderChampions();});
  }
 }
 async function refresh(){
  const button=$('refreshBoard');button.disabled=true;$('boardStatus').textContent='本番の共有ランキングを取得中…';
  try{
   const m=await import('./ranking-sync-client.js?v=prod-admin-stage2-rename-1');
   await m.startRankingSync().catch(()=>{});ranking=m;
   championRows=await (await m.client()).champions();renderChampions();
   if(!subscriptions.size&&statuses.size===0)watchAvailability();
  }catch{championRows=[];renderChampions(true);}
  finally{button.disabled=false;}
 }
 show();
 $('playerForm').onsubmit=e=>{e.preventDefault();const value=$('nickname').value.trim();if(!value||value.length>12||(/[<>]/.test(value)||value.includes(String.fromCharCode(10))||value.includes(String.fromCharCode(13))))return;nick=value;storage.setItem('mgl_nickname',nick);show();window.dispatchEvent(new Event('manabi-profile-change'));status('名前をこの端末に保存しました。');};
 $('refreshBoard').onclick=refresh;
 window.addEventListener('manabi-nickname-sync',()=>{nick=storage.getItem('mgl_nickname')||'';show();status('管理室で更新された名前を同期しました。');});
 for(const type of ['manabi-profile-change','manabi-economy-change'])window.addEventListener(type,()=>{
  status('表示名・装備の共有を更新中…');
  if(ranking)ranking.client().then(c=>c.champions()).then(rows=>{championRows=rows;renderChampions();}).then(()=>status('設定を共有ランキングに反映しました。')).catch(()=>status('ランキングを取得できません。更新を再試行してください。'));
 });
 status('本番Firebaseに接続中…');watchAvailability();await refresh();
}
