const games=new Set(['keisan','pref-name','pref-place','alphabet','distribution','distribution2','exchangeAssociation','kotowaza','multiplicationProperties','shapeExpressions','keisanSummary']);
const params=new URLSearchParams(location.search),game=params.get('game');
if(!games.has(game)){location.replace('math-calculation.html')}
else{const next=new URLSearchParams({game});if(params.has('adminTest'))next.set('adminTest','');location.replace('challenge120-ranking.html?'+next.toString())}