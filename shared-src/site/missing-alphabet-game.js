(()=>{
 'use strict';
 const ID='missingAlphabet',KEY='mgl_missingAlphabet',storage=window.manabiStorage,model=window.MissingAlphabetModel;
 if(!storage||!model||!window.ManabiEconomy)return;
 const $=id=>document.getElementById(id),titles=(window.ManabiProfileCatalog||[]).find(g=>g.id===ID)?.titles||[];
 const number=n=>Number.isSafeInteger(Number(n))&&Number(n)>=0?Number(n):0;
 let raw={};try{raw=JSON.parse(storage.getItem(KEY)||'{}')||{}}catch{}
 const state={version:1,streak:number(raw.streak),best:number(raw.best),history:model.normalizeHistory(raw.history),question:null};
 try{state.question=raw.question?model.canonicalPrompt(raw.question):null}catch{}
 let pointContext=null,busy=false,advanceTimer=null;
 const titleFor=best=>[...titles].sort((a,b)=>a.at-b.at).filter(t=>best>=t.at).at(-1)||null;
 function save(){storage.setItem(KEY,JSON.stringify(state));if(window.MANABI_ENV?.preview===true)savePreviewRanking();window.mglSaveGameScore?.()}
 function savePreviewRanking(){try{const uid=storage.getItem('localPlayerId')||'this-device',rows=JSON.parse(storage.getItem('leaderboard_players')||'[]');if(!Array.isArray(rows))return;const person=window.ManabiIdentity?.localPlayer(storage)||{nickname:storage.getItem('mgl_nickname')||'プレイヤー'};const index=rows.findIndex(row=>row?.uid===uid),previous=index>=0?rows[index]:{};if(state.best<=0&&Number(previous.missingAlphabetBestStreak||0)<=0)return;const next={...previous,...person,uid,nickname:storage.getItem('mgl_nickname')||person.nickname||'プレイヤー',missingAlphabetBestStreak:Math.max(state.best,number(previous.missingAlphabetBestStreak))};if(index>=0)rows[index]=next;else rows.push(next);storage.setItem('leaderboard_players',JSON.stringify(rows))}catch{}}
 function stats(){const best=state.best,title=titleFor(best);$('points').textContent=window.ManabiEconomy.balance(ID);$('streak').textContent=state.streak;$('best').textContent=best;$('currentTitle').textContent=title?.name||'まだなし';$('goal').textContent=best>=20?'最高称号を獲得！':'最高称号まであと'+(20-best)+'問';$('progress').style.width=Math.min(100,best/20*100)+'%';for(const item of document.querySelectorAll('#tower li'))item.classList.toggle('earned',best>=Number(item.dataset.need))}
 function beginQuestion(question){state.question=question;pointContext=window.ManabiEconomy.begin(ID,question);$('questionLetters').replaceChildren(...question.sequence.map(letter=>{const span=document.createElement('span');span.textContent=letter;span.className=letter==='□'?'blank':'';return span}));$('choices').replaceChildren(...question.choices.map((letter,index)=>{const button=document.createElement('button');button.type='button';button.className='choice';button.textContent=letter;button.dataset.choiceIndex=String(index);button.setAttribute('aria-label','選択肢 '+letter);button.addEventListener('click',()=>void answer(letter));return button}));$('feedback').className='feedback';$('feedback').textContent='空らんに入る文字を選ぼう';stats()}
 function next(){clearTimeout(advanceTimer);const question=state.question?null:model.createQuestion(Math.random,state.history);beginQuestion(question);save()}
 function logAnswer(question,letter,correct,final,challenge){window.dispatchEvent(new CustomEvent('manabi-learning-answer',{detail:{game:ID,problemId:question.id,prompt:question.sequence.join(' '),stage:challenge?.phase==='running'?'challenge':'practice',selected:letter,correctAnswer:question.answer,correct,stageCorrect:correct,final,at:Date.now()}}))}
 async function answer(letter){if(busy||!state.question||!pointContext)return;busy=true;const question=state.question,correct=letter===question.answer,challenge=window.ManabiChallenge120?.state?.();
  if(!correct){state.streak=0;save();$('feedback').className='feedback bad';$('feedback').textContent='不正解。もう一度選んでみよう。';
   if(challenge?.phase==='running'){logAnswer(question,letter,false,true,challenge);await window.ManabiEconomy.answer(pointContext,{choice:letter});for(const button of $('choices').querySelectorAll('button'))button.disabled=true;}
   else if(challenge?.phase==='training'&&pointContext.challenge120Token){logAnswer(question,letter,false,false,challenge);try{await window.ManabiChallenge120.record(pointContext.challenge120Token,false)}catch{}pointContext=window.ManabiEconomy.begin(ID,question);}
   else logAnswer(question,letter,false,false,challenge);
   busy=false;stats();return;
  }
  const oldBest=state.best;state.streak=challenge?.phase==='running'?challenge.streak+1:state.streak+1;state.best=Math.max(state.best,state.streak);state.history=model.normalizeHistory([...state.history,{lower:question.lower,start:question.start,missingIndex:question.missingIndex}]);state.question=null;
  const gainedTitle=titles.find(item=>item.at>oldBest&&item.at<=state.best)||null;
  const request=window.ManabiEconomy.answer(pointContext,{choice:letter});save();logAnswer(question,letter,true,true,challenge);stats();$('feedback').className='feedback';$('feedback').textContent='';for(const button of $('choices').querySelectorAll('button'))button.disabled=true;
  try{await request}catch{}
  busy=false;advanceTimer=setTimeout(next,gainedTitle?1000:500);
 }
 window.addEventListener('manabi-local-record-change',()=>{const current=window.ManabiChallenge120?.state?.();if(!current)return;let changed=false;if(current.phase==='running'&&state.streak!==current.streak){state.streak=current.streak;changed=true}const attemptBest=current.attemptBest||0;if(attemptBest>state.best){state.best=attemptBest;changed=true}if(current.phase==='ended'&&state.streak!==0){state.streak=0;changed=true}if(changed){save();stats()}});
 function init(){if(state.question)beginQuestion(state.question);else next();stats()}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
 window.addEventListener('pagehide',()=>{clearTimeout(advanceTimer);save()});
 window.MissingAlphabetGame=Object.freeze({state:()=>structuredClone(state),answer,question:()=>state.question});
})();

