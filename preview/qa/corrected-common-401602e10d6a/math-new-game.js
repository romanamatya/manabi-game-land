(()=>{'use strict';
const model=window.ManabiMathNew,store=window.manabiStorage,kind=document.body.dataset.scoreGame,$=id=>document.getElementById(id),key='mgl_'+kind;let state={best:0,streak:0,points:0};try{state={...state,...JSON.parse(store.getItem(key)||'{}')}}catch{}let pool=[],q,stage=0,first=false,tokens=[],context,locked=false,choiceOrder=[],autoNextTimer=null,feedbackGeneration=0;
if(kind==='exchangeAssociation'){
 if(!Array.isArray(state.questionOrder))state.questionOrder=[];
 if(!Array.isArray(state.answerPositionCounts)||state.answerPositionCounts.length!==3)state.answerPositionCounts=[0,0,0];
 state.lastAnswerPosition=Number.isInteger(state.lastAnswerPosition)?state.lastAnswerPosition:-1;
}
const save=()=>store.setItem(key,JSON.stringify(state));
function clearAutoAdvance(){if(autoNextTimer!==null){clearTimeout(autoNextTimer);autoNextTimer=null}feedbackGeneration++}
function stats(){$('points').textContent=window.ManabiEconomy.balance(kind);$('streak').textContent=state.streak;$('best').textContent=state.best;for(const li of document.querySelectorAll('#tower li'))li.classList.toggle('earned',state.best>=Number(li.dataset.need))}
function chooseExchangeQuestion(){
 const all=model.exchangeQuestions(),byId=new Map(all.map(item=>[item.id,item]));
 if(state.questionOrder.some(id=>!byId.has(id))||new Set(state.questionOrder).size!==state.questionOrder.length)state.questionOrder=[];
 if(state.pendingQuestionId&&byId.has(state.pendingQuestionId)){
  q=byId.get(state.pendingQuestionId);choiceOrder=Array.isArray(state.pendingChoiceOrder)&&state.pendingChoiceOrder.length===3?state.pendingChoiceOrder:[0,1,2];
 }else{
  if(!state.questionOrder.length)state.questionOrder=model.shuffleQuestionDeck(all,state.lastQuestionType||'').map(item=>item.id);
  q=byId.get(state.questionOrder.shift());state.pendingQuestionId=q.id;state.lastQuestionType=q.type;
  const presentation=model.randomizedChoiceOrder(q,state.answerPositionCounts,state.lastAnswerPosition);
  choiceOrder=presentation.order;state.answerPositionCounts=presentation.counts;state.lastAnswerPosition=presentation.position;state.pendingChoiceOrder=choiceOrder;save();
 }
}
function chooseQuestion(){clearAutoAdvance();if(kind==='exchangeAssociation')chooseExchangeQuestion();else{if(!pool.length)pool=model.shuffle(model.factorQuestions);q=pool.pop()}stage=0;tokens=[];first=false;context=window.ManabiEconomy.begin(kind,q);locked=false;render()}
function button(text,fn){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=()=>{if(!locked)fn()};return b}
function render(){locked=false;$('feedback').hidden=true;$('area').replaceChildren();$('question').textContent=kind==='distribution2'?model.formatFactor(q):q.question;$('stage').textContent=kind==='distribution2'?'式をまとめよう':'計算しやすい式を選ぼう';if(kind==='distribution2'){const out=document.createElement('div');out.className='expression';out.textContent=tokens.join('')||'式を作ろう';$('area').append(out);for(const row of [[q.a,q.b,q.c].sort((a,b)=>a-b).map(String),['＋','－','×','÷'],['(',')']]){const el=document.createElement('div');el.className='row';for(const value of row)el.append(button(value,()=>{if(tokens.length<25){tokens.push(value);render()}}));$('area').append(el)}const actions=document.createElement('div');actions.className='row';actions.append(button('1つ戻す',()=>{tokens.pop();render()}),button('やり直す',()=>{tokens=[];render()}),button('答え合わせ',()=>{finish(model.correctFactor(q,tokens),'まとめた式：'+model.factorAnswer(q))}));$('area').append(actions)}else{for(const i of choiceOrder)$('area').append(button(q.choices[i],()=>finish(i===q.correct,q.solution)))}stats()}
function feedback(ok,explanation,label,next){clearAutoAdvance();locked=true;$('feedback').className='feedback '+(ok?'good':'bad');$('feedback').hidden=false;$('verdict').textContent=ok?'正解！':'もう一回がんばろう！';$('explanation').textContent=explanation;$('next').textContent=label;const token=feedbackGeneration;$('next').onclick=()=>{if(!locked)return;locked=false;clearAutoAdvance();next()};if(kind==='exchangeAssociation'&&ok)autoNextTimer=setTimeout(()=>{if(token!==feedbackGeneration||!locked)return;autoNextTimer=null;locked=false;feedbackGeneration++;next()},3000)}
async function finish(ok,explanation,answerCorrect=ok){if(locked)return;locked=true;state.streak=ok?state.streak+1:0;state.best=Math.max(state.best,state.streak);if(ok)state.points++;if(kind==='exchangeAssociation'){state.pendingQuestionId=null;state.pendingChoiceOrder=null}save();stats();const response=kind==='distribution2'?{expression:[...tokens]}:{choice:ok?q.correct:-1};feedback(answerCorrect,explanation+(kind==='exchangeAssociation'&&!ok?'　もっと計算しやすいまとめ方があるよ。':''),'次の問題へ',chooseQuestion);await window.ManabiEconomy.answer(context,response);stats()}
window.addEventListener('pagehide',clearAutoAdvance);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearAutoAdvance()});window.addEventListener('manabi-economy-change',stats);chooseQuestion();})();
