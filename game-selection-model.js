const labels=Object.freeze({published:'',preparing:'公開準備中',hidden:'非公開',checking:'公開状態を確認中',unknown:'公開状態を確認できません'});
export function visibilityState(setting,{fromCache=false,error=false}={}){
 if(error)return 'unknown';if(fromCache)return 'checking';if(!setting)return 'unknown';
 if(['published','preparing','hidden'].includes(setting.status))return setting.status;
 if(setting.published===false)return 'hidden';
 if(setting.published===true)return 'published';
 return 'unknown';
}
export function renderGameState(card,state,{hideHidden=false}={}){
 const play=card.querySelector('[data-game-play]'),badge=card.querySelector('[data-game-status]');
 if(!play||!badge)throw Error('game-selection-card-incomplete');
 const normalized=Object.hasOwn(labels,state)?state:'unknown',blocked=normalized!=='published';
 if(hideHidden)card.hidden=!['published','preparing'].includes(normalized);
 card.dataset.gameAvailability=normalized;play.disabled=blocked;
 play.textContent=normalized==='checking'?'確認中…':blocked?'× プレイ':'プレイ';
 play.setAttribute('aria-label',normalized==='published'?'プレイ':labels[normalized]+'。プレイできません');
 badge.textContent=labels[normalized];badge.hidden=normalized==='published';return normalized;
}
export function bindGameAvailability(card,{enabled=false,settings=null,hideHidden=false}={}){
 const id=card.dataset.gameCard, render=state=>renderGameState(card,state,{hideHidden});
 if(!enabled){render('published');return {ready:Promise.resolve(),dispose(){}}}
 render('checking');
 if(!settings?.subscribeGame||!id){render('unknown');return {ready:Promise.resolve(),dispose(){}}}
 let cancelled=false,unsubscribe=null;
 const ready=Promise.resolve().then(()=>settings.subscribeGame(id,snapshot=>{
  if(cancelled)return;let setting=null;
  try{setting=snapshot?.exists?.()?snapshot.data():null}catch{render('unknown');return}
  render(visibilityState(setting,{fromCache:snapshot?.metadata?.fromCache===true}));
 },()=>{if(!cancelled)render('unknown')})).then(stop=>{
  unsubscribe=stop;if(cancelled)unsubscribe?.();
 }).catch(()=>{if(!cancelled)render('unknown')});
 return {ready,dispose(){cancelled=true;unsubscribe?.()}};
}
export const gameVisibilityLabels=labels;
