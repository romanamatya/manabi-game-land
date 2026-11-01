const labels=Object.freeze({published:'',preparing:'公開準備中',hidden:'非公開',checking:'公開状態を確認中',unknown:'公開状態を確認できません'});
export function visibilityState(setting,{fromCache=false,error=false}={}){
 if(error)return 'unknown';if(fromCache)return 'checking';if(!setting)return 'unknown';
 if(['published','preparing','hidden'].includes(setting.status))return setting.status;
 if(setting.published===false)return 'hidden';
 if(setting.published===true)return 'published';
 return 'unknown';
}
export function renderGameState(card,state){
 const play=card.querySelector('[data-game-play]'),badge=card.querySelector('[data-game-status]');
 if(!play||!badge)throw Error('game-selection-card-incomplete');
 const normalized=Object.hasOwn(labels,state)?state:'unknown',blocked=normalized!=='published';
 card.dataset.gameAvailability=normalized;play.disabled=blocked;
 play.textContent=normalized==='checking'?'確認中…':blocked?'× プレイ':'プレイ';
 play.setAttribute('aria-label',normalized==='published'?'プレイ':labels[normalized]+'。プレイできません');
 badge.textContent=labels[normalized];badge.hidden=normalized==='published';return normalized;
}
export function bindGameAvailability(card,{enabled=false,settings=null}={}){
 const id=card.dataset.gameCard;
 if(!enabled){renderGameState(card,'published');return {ready:Promise.resolve(),dispose(){}}}
 renderGameState(card,'checking');
 if(!settings?.subscribeGame||!id){renderGameState(card,'unknown');return {ready:Promise.resolve(),dispose(){}}}
 let cancelled=false,unsubscribe=null;
 const ready=Promise.resolve().then(()=>settings.subscribeGame(id,snapshot=>{
  if(cancelled)return;let setting=null;
  try{setting=snapshot?.exists?.()?snapshot.data():null}catch{renderGameState(card,'unknown');return}
  renderGameState(card,visibilityState(setting,{fromCache:snapshot?.metadata?.fromCache===true}));
 },()=>{if(!cancelled)renderGameState(card,'unknown')})).then(stop=>{
  unsubscribe=stop;if(cancelled)unsubscribe?.();
 }).catch(()=>{if(!cancelled)renderGameState(card,'unknown')});
 return {ready,dispose(){cancelled=true;unsubscribe?.()}};
}
export const gameVisibilityLabels=labels;
