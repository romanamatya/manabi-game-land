import {legacyPlayerClient} from './legacy-player-client.js';
import {publishedChampionGames} from './champion-visibility.js';
export async function startProductionHome(storage){
 const $=id=>document.getElementById(id);let nick=storage.getItem('mgl_nickname')||'',client=null,records=[];
 const games=window.ManabiLeaderboard.games,statuses=new Map();
 const show=()=>{$('playerWelcome').hidden=!!nick;$('playerReady').hidden=!nick;$('playerName').textContent=nick;};
 const status=t=>$('syncStatus').textContent=t;
 function apply(name){if(name!==nick){nick=name;storage.setItem('mgl_nickname',name);show();document.dispatchEvent(new Event('manabi-nickname-sync'));}}
 function render(){window.ManabiLeaderboard.render(records,{visibleGames:publishedChampionGames(games,statuses)});}
 function statusOf(setting){if(!setting)return'unknown';if(['published','preparing','hidden'].includes(setting.status))return setting.status;if(setting.published===true)return'published';if(setting.published===false)return'hidden';return'unknown';}
 function watchAvailability(){
  if(!window.ManabiPublicSettings?.availabilityEnabled||typeof window.ManabiPublicSettings.subscribeGame!=='function'){for(const g of games)statuses.set(g.id,'unknown');render();return;}
  for(const game of games){statuses.set(game.id,'unknown');window.ManabiPublicSettings.subscribeGame(game.id,snapshot=>{statuses.set(game.id,snapshot?.exists?.()?statusOf(snapshot.data()):'unknown');render();},()=>{statuses.set(game.id,'unknown');render();}).catch(()=>{statuses.set(game.id,'unknown');render();});}
 }
 async function save(){if(!client||!nick)return;apply(await client.store.saveProfile(client.uid,nick,window.ManabiProfile.appearance(storage)));}
 async function refresh(){if(!client)return;try{records=await client.records();render();$('boardStatus').textContent='公開中のゲームの共有記録。';}catch{$('boardStatus').textContent='ランキング読込待ち。端末の記録は保持中。';}}
 show();$('playerForm').onsubmit=async e=>{e.preventDefault();const value=$('nickname').value.trim();if(!value||value.length>12||/[<>\r\n]/.test(value))return;nick=value;storage.setItem('mgl_nickname',nick);show();try{await save();}catch{status('端末に保存済み。オンライン登録待ち。');}};
 $('refreshBoard').onclick=refresh;for(const type of ['manabi-profile-change','manabi-economy-change'])window.addEventListener(type,()=>save().catch(()=>status('見た目は端末に保存済み。通信待ち。')));
 watchAvailability();try{client=await legacyPlayerClient(window.MANABI_SPARK_CONFIG);client.watchName(apply);if(nick)await save();await refresh();status('オンライン接続中');}catch{status('本番の認証・Rulesの確認待ち。オンライン保存は停止中。端末の記録は保持している。');}
}
