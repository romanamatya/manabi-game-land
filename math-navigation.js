(()=>{
const test=new URL(location.href).searchParams.has('adminTest'),testLink=href=>href+(test?(href.includes('?')?'&':'?')+'adminTest':'');if(test)for(const a of document.querySelectorAll('a[href]'))a.href=testLink(a.href);
const units=[{id:'calculation',name:'計算のきまり',description:'順番・式の変形・数や図のまとまりを学ぼう',page:'math-calculation.html',games:['keisan','distribution','distribution2','exchangeAssociation','multiplicationProperties','shapeExpressions','keisanSummary']},{id:'geometry',name:'四角形・垂直と平行',description:'図形や直線の関係を考えよう',page:'math-geometry.html',games:['suichoku','parallelPair']}];
window.ManabiMathUnits=Object.freeze(units);const root=document.getElementById('mathCards'),unitId=document.body.dataset.unit,inUnit=units.some(u=>u.id===unitId);
function card(title,description,href,rank){const article=document.createElement('article');article.className='unit-card';const a=document.createElement('a');a.className='game-start';a.href=testLink(href);const h=document.createElement('h2'),p=document.createElement('p');h.textContent=title;p.textContent=description;a.append(h,p);article.append(a);if(rank){const link=document.createElement('a');link.className='rank-button';link.href=testLink(rank);link.textContent='ゲーム最高連続ランキング（この端末）';article.append(link)}return article}
if(!inUnit){for(const u of units)root.append(card(u.name,u.description,u.page));return}
const displayNames={parallelPair:'平行な2本を見つけよう！',keisan:'計算の順番',multiplicationProperties:'掛け算の性質',shapeExpressions:'図形と式',suichoku:'垂直を見つけよう！',keisanSummary:'2分間チャレンジ'};
const descriptions={parallelPair:'7本の直線から平行な2本を見つけよう',keisan:'計算する順番を考えよう',distribution:'100を使って式を変え、計算しよう',distribution2:'共通する数をまとめて計算しよう',exchangeAssociation:'計算しやすい組み合わせを見つけよう',multiplicationProperties:'かける数が変わると、積はどう変わる？',shapeExpressions:'図の囲み方を式に表そう',suichoku:'2本の直線が垂直に交わる組を見つけよう',keisanSummary:'7つの問題形式で総復習。30問連続で最高称号！'};
for(const id of (units.find(u=>u.id===unitId)?.games||[])){
 const g=window.ManabiProfileCatalog.find(g=>g.id===id),title=displayNames[id]||g?.name||id;
 const item=document.createElement('article');item.className='unit-card game-card';item.dataset.gameCard=id;if(id==='keisanSummary')item.classList.add('summary-card');
 const summary=document.createElement('div');summary.className='game-summary';const h=document.createElement('h2'),p=document.createElement('p');h.textContent=title;p.textContent=descriptions[id]||'';summary.append(h,p);
 const badge=document.createElement('span');badge.className='game-status-badge';badge.dataset.gameStatus='';badge.setAttribute('role','status');badge.setAttribute('aria-live','polite');badge.hidden=true;
 const actions=document.createElement('div');actions.className='game-actions';
 const play=document.createElement('button');play.type='button';play.className='play-button';play.dataset.gamePlay='';play.dataset.gameId=id;play.dataset.gameHref=testLink('games/'+id+'.html');play.disabled=true;play.textContent='確認中…';actions.append(play);
 const rank=document.createElement('a');rank.className='rank-button';rank.dataset.gameRanking='';rank.href=testLink(id==='keisanSummary'?'summary-ranking.html':'ranking.html?game='+id);rank.textContent='ランキング';actions.append(rank)
 item.append(summary,badge,actions);root.append(item);
}
window.ManabiGameSelection?.initialize();
})();
