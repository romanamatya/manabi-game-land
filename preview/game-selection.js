import {bindGameAvailability} from './game-selection-model.js?v=785e38d0207a';
const initialized=new WeakSet();
function initialize(){
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
