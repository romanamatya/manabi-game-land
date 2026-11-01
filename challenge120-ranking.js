import {client} from './ranking-sync-api.js?v=challenge120-ranking-v1';
import {CHALLENGE120_GAMES,rankChallenge120Rows} from './challenge120-ranking-model.js?v=challenge120-ranking-v1';

const games=[
 ['keisan','計算のきまり','math-calculation.html'],['pref-name','都道府県 名前','social.html'],
 ['pref-place','都道府県 場所','social.html'],['alphabet','アルファベット','language.html'],
 ['distribution','分配のきまり①','math-calculation.html'],['distribution2','分配のきまり②','math-calculation.html'],
 ['exchangeAssociation','交換・結合のきまり','math-calculation.html'],['kotowaza','ことわざ・慣用句','japanese.html'],
 ['multiplicationProperties','掛け算の性質','math-calculation.html'],['shapeExpressions','図形と式','math-calculation.html'],
 ['keisanSummary','2分間チャレンジ','math-calculation.html']
].filter(([id])=>CHALLENGE120_GAMES.includes(id));
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),select=$('game');
let current=games.some(([id])=>id===params.get('game'))?params.get('game'):'keisan',busy=false;
for(const [id,label] of games){const option=document.createElement('option');option.value=id;option.textContent=label;select.append(option)}
select.value=current;
function setLinks(){const game=games.find(x=>x[0]===current);$('back').href=game?.[2]||'math-calculation.html';$('play').href='games/'+current+'.html';$('regular').href=current==='keisanSummary'?'summary-ranking.html':'ranking.html?game='+encodeURIComponent(current);$('heading').textContent=(game?.[1]||'ゲーム')+'｜2分間チャレンジ専用ランキング';document.title=$('heading').textContent+'｜マナビクエスト'}
function show(rows){const ranked=rankChallenge120Rows(rows,current);$('rows').replaceChildren(...ranked.map(row=>{const tr=document.createElement('tr');if(row.rank===1)tr.className='first';const rank=document.createElement('td');rank.textContent=row.rank+'位';const person=document.createElement('td');person.append(window.ManabiIdentity.identity({nickname:row.nickname,appearance:{icon:row.icon,frame:row.frame,badge:row.badge}},{size:40,badgeSize:40,game:current}));if(row.title){const title=document.createElement('small');title.className='ranking-title';title.textContent=row.title;person.append(title)}const score=document.createElement('td');score.textContent=row.bestStreak+'問連続';tr.append(rank,person,score);return tr}));$('table').hidden=!ranked.length;$('empty').hidden=ranked.length>0;$('empty').textContent='新ランキングの記録はまだありません。';}
async function refresh(){if(busy)return;busy=true;$('rows').replaceChildren();$('empty').hidden=true;$('table').hidden=true;const enabled=window.MANABI_BACKEND_CONFIG?.challenge120RankingEnabled===true;if(!enabled){$('status').textContent='専用ランキングは公開準備中です。';$('empty').hidden=false;$('empty').textContent='2026年11月1日 0時以降に、新しいプログラムの2分間チャレンジで獲得した記録から掲載します。過去のランキング記録は移行していません。';busy=false;return}try{if(window.MANABI_ENV?.preview!==false||window.MANABI_BACKEND_CONFIG?.rankingSyncEnabled!==true)throw Error('challenge120-ranking-config-rejected');const rows=await(await client()).challenge120Rankings(current);show(rows);$('status').textContent='2026年11月1日 0時（日本時間）以降の新しい2分間チャレンジ記録';}catch{$('status').textContent='専用ランキングを取得できません。通信状態を確認して、もう一度お試しください。';$('empty').hidden=false;$('empty').textContent='ランキングを取得できませんでした。過去のランキングは表示していません。'}finally{busy=false}}
select.addEventListener('change',()=>{current=select.value;params.set('game',current);history.replaceState(null,'',location.pathname+'?'+params.toString());setLinks();void refresh()});$('refresh').addEventListener('click',()=>void refresh());
setLinks();void refresh();
