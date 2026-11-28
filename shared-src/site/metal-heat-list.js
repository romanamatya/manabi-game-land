(() => {
  const card=document.querySelector('[data-game-card="metalHeat"]');
  if(!card)return;
  const empty=document.querySelector('section.card');
  const update=()=>{empty.hidden=!card.hidden;};
  new MutationObserver(update).observe(card,{attributes:true,attributeFilter:['hidden']});
  update();
})();
