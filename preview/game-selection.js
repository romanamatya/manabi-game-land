import {bindGameAvailability} from './game-selection-model.js?v=b165f1717fbd';
const initialized=new WeakSet();
function addMissingAlphabetCard(){
 const config=window.MANABI_BACKEND_CONFIG;
 if(!document.body.classList.contains('mq-subject-language')||!config?.gameIds?.includes('missingAlphabet'))return;
 const grid=document.querySelector('.game-grid');if(!grid||grid.querySelector('[data-game-card="missingAlphabet"]'))return;
 const card=document.createElement('article');card.className='card game-card';card.dataset.gameCard='missingAlphabet';
 const summary=document.createElement('div');summary.className='game-summary';
 const title=document.createElement('strong');title.textContent='ぬけたアルファベットを当てよう！';
 const description=document.createElement('p');description.textContent='アルファベット順の空欄に入る文字を4択から選ぼう。';
 const record=document.createElement('p');record.className='record';record.id='missingAlphabetRecord';
 summary.append(title,description,record);
 const status=document.createElement('span');status.className='game-status-badge';status.dataset.gameStatus='';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.hidden=true;
 const actions=document.createElement('div');actions.className='game-actions';
 const play=document.createElement('button');play.type='button';play.className='play-button';play.dataset.gamePlay='';play.dataset.gameId='missingAlphabet';play.dataset.gameHref='games/missingAlphabet.html';play.disabled=true;play.textContent='確認中…';
 const ranking=document.createElement('a');ranking.className='rank-button';ranking.dataset.gameRanking='';ranking.href='ranking.html?game=missingAlphabet';ranking.textContent='ランキング';actions.append(play,ranking);card.append(summary,status,actions);grid.append(card);
 const storage=window.manabiStorage;let saved={};try{saved=JSON.parse(storage?.getItem('mgl_missingAlphabet')||'{}')||{}}catch{}
 record.textContent='🔥 最高連続：'+(Number(saved.best)||0)+'問';
}
function initialize(){
 addMissingAlphabetCard();
 for(const card of document.querySelectorAll('[data-game-card]')){
  if(initialized.has(card))continue;initialized.add(card);
  const button=card.querySelector('[data-game-play]');
  if(button)button.addEventListener('click',()=>{if(card.dataset.gameAvailability==='published'&&!button.disabled&&button.dataset.gameHref)location.assign(button.dataset.gameHref)});
  const binding=bindGameAvailability(card,{enabled:window.MANABI_BACKEND_CONFIG?.availabilityEnabled===true,settings:window.ManabiPublicSettings});
  window.addEventListener('pagehide',binding.dispose,{once:true});
 }
}
window.ManabiGameSelection=Object.freeze({initialize});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();

