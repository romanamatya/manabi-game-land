(()=>{
 'use strict';
 const core=window.ManabiEconomyCore,model=window.MissingAlphabetModel;
 if(!core||!model)throw Error('missing-alphabet-economy-dependency');
 core.games.missingAlphabet='english';
 const canonical=core.canonicalPrompt.bind(core),correct=core.correct.bind(core);
 core.canonicalPrompt=(game,prompt)=>game==='missingAlphabet'?model.canonicalPrompt(prompt):canonical(game,prompt);
 core.correct=(game,prompt,answer)=>game==='missingAlphabet'?model.correct(prompt,answer):correct(game,prompt,answer);
})();

