export async function startProductionHome(storage){
 const $=id=>document.getElementById(id);let nick=storage.getItem('mgl_nickname')||'';
 const show=()=>{$('playerWelcome').hidden=!!nick;$('playerReady').hidden=!nick;$('playerName').textContent=nick;};
 const status=t=>{$('syncStatus').textContent=t};
 show();
 $('playerForm').onsubmit=e=>{e.preventDefault();const value=$('nickname').value.trim();if(!value||value.length>12||(/[<>]/.test(value)||value.includes(String.fromCharCode(10))||value.includes(String.fromCharCode(13))))return;nick=value;storage.setItem('mgl_nickname',nick);show();window.dispatchEvent(new Event('manabi-profile-change'));status('名前をこの端末に保存しました。');};
 async function refresh(){$('boardHeading').textContent='2分間チャレンジランキング';$('boardDescription').textContent='新しいプログラムのチャレンジ記録';$('refreshBoard').hidden=true;const message=document.createElement('p');message.textContent='新しいプログラムの2分間チャレンジ記録は、専用ランキングで確認できます。以前の共有記録はここには表示しません。';$('boardList').replaceChildren(message);$('boardStatus').textContent='切替基準：2026年11月1日 0時（日本時間）';$('challengeBoardLink').hidden=false;try{const m=await import('./ranking-sync-client.js?v=prod-admin-stage2-rename-1');await m.startRankingSync().catch(()=>{});}catch{}}
 window.addEventListener('manabi-nickname-sync',()=>{nick=storage.getItem('mgl_nickname')||'';show();status('管理室で更新された名前を同期しました。')});
 for(const type of ['manabi-profile-change','manabi-economy-change'])window.addEventListener(type,()=>status('表示名・装備を更新しました。'));
 status('本番Firebaseに接続中…');await refresh();
}
