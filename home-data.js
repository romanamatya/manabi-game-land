export async function startProductionHome(storage){
 const $=id=>document.getElementById(id);let nick=storage.getItem('mgl_nickname')||'',ranking=null;
 const show=()=>{$('playerWelcome').hidden=!!nick;$('playerReady').hidden=!nick;$('playerName').textContent=nick;};
 const status=t=>{$('syncStatus').textContent=t};
 show();
 $('playerForm').onsubmit=e=>{e.preventDefault();const value=$('nickname').value.trim();if(!value||value.length>12||(/[<>]/.test(value)||value.includes(String.fromCharCode(10))||value.includes(String.fromCharCode(13))))return;nick=value;storage.setItem('mgl_nickname',nick);show();window.dispatchEvent(new Event('manabi-profile-change'));status('名前をこの端末に保存しました。');};
 async function refresh(){const button=$('refreshBoard');button.disabled=true;$('boardStatus').textContent='本番の共有ランキングを取得中…';try{const m=await import('./ranking-sync-client.js?v=prod-rank-v1');m.startRankingSync();ranking=m;const rows=await (await m.client()).champions();window.ManabiLeaderboard.renderChampions(rows);$('boardStatus').textContent='本番Firebaseの共有記録。ページを開いたときに更新されます。';}catch{window.ManabiLeaderboard.renderChampions([],{error:true});$('boardStatus').textContent='ランキングを取得できませんでした。通信状態を確認して、もう一度お試しください。';}finally{button.disabled=false}}
 $('refreshBoard').onclick=refresh;
 for(const type of ['manabi-profile-change','manabi-economy-change'])window.addEventListener(type,()=>{status('表示名・装備の共有を更新中…');if(ranking)ranking.client().then(c=>c.champions()).then(rows=>window.ManabiLeaderboard.renderChampions(rows)).then(()=>status('設定を共有ランキングに反映しました。')).catch(()=>status('ランキングを取得できません。更新を再試行してください。'));});
 status('本番Firebaseに接続中…');await refresh();
}
