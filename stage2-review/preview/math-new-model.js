(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ManabiMathNew=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function shuffle(a,r=Math.random){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
// Factoring problems: common factors are grouped to make round sums before multiplying.
const factorPairs=[[13,7,'+'],[12,8,'+'],[14,6,'+'],[16,4,'+'],[17,7,'-'],[18,8,'-'],[28,8,'-'],[27,7,'-'],[35,15,'-'],[38,18,'-'],[45,5,'+'],[42,8,'+'],[75,25,'-'],[60,40,'+']];
const factorQuestions=factorPairs.flatMap(([a,b,op])=>[3,4,5,6,7,8,9].flatMap(c=>['left','right'].map(side=>({a,b,op,c,side,id:`${a}-${b}-${op}-${c}-${side}`}))));
function formatFactor(q){return q.side==='right'?`${q.a}×${q.c}${q.op==='+'?'＋':'－'}${q.b}×${q.c}`:`${q.c}×${q.a}${q.op==='+'?'＋':'－'}${q.c}×${q.b}`}
function factorAnswer(q){return q.side==='right'?`(${q.a}${q.op}${q.b})×${q.c}`:`${q.c}×(${q.a}${q.op}${q.b})`}
function correctFactor(q,tokens){const norm=tokens.join('').replaceAll('＋','+').replaceAll('－','-').replaceAll('＊','×');const pair=`(${q.a}${q.op}${q.b})`;const rev=q.op==='+'?`(${q.b}+${q.a})`:pair;return [pair+'×'+q.c,q.c+'×'+pair,rev+'×'+q.c,q.c+'×'+rev].includes(norm)}
function factorValue(q){return (q.op==='+'?q.a+q.b:q.a-q.b)*q.c}
const addition=[[8,2,6,10],[7,3,8,10],[14,6,7,20],[12,8,5,20],[45,55,12,100],[30,70,16,100],[65,35,11,100],[9,1,7,10]];
const multiplication=[[2,5,7,10],[4,25,7,100],[5,20,3,100],[2,50,3,100],[4,25,6,100],[2,5,9,10]];
// All values are written as decimal strings where needed. easyPair indexes refer to the
// displayed order; targets make the intended mental-math advantage explicit and testable.
const decimalAddition=[
 ['2.7','4.5','0.3',3,[0,2]],['4.6','2.7','5.4',10,[0,2]],['7.9','3.6','2.1',10,[0,2]],['5.8','1.7','4.2',10,[0,2]],
 ['1.4','0.8','2.6',4,[0,2]],['6.3','1.5','0.7',7,[0,2]],['3.8','4.6','0.2',4,[0,2]],['0.9','5.4','2.1',3,[0,2]],
 ['8.6','0.4','1.7',9,[0,1]],['2.8','6.5','0.2',3,[0,2]],['4.3','1.8','0.7',5,[0,2]],['7.4','2.6','0.5',10,[0,1]]
];
const hundredTwentyFive=[
 {v:['125','7','8'],easyPair:[0,2],target:1000},
 {v:['7','125','8'],easyPair:[1,2],target:1000},
 {v:['8','6','125'],easyPair:[0,2],target:1000},
 {v:['8','125','4'],easyPair:[0,1],target:1000},
 {v:['125','9','8'],easyPair:[0,2],target:1000},
 {v:['6','8','125'],easyPair:[1,2],target:1000},
 {v:['8','3','125'],easyPair:[0,2],target:1000},
 {v:['125','8','5'],easyPair:[0,1],target:1000}
];
const groupPairs=[[0,1],[0,2],[1,2]];
const fmt=n=>{const v=Number(n);return Number.isInteger(v)?String(v):String(Number(v.toFixed(1)))};
const numeric=v=>Number(v);
function makeQuestion(id,values,op,easyPair,target){
 const [a,b,c]=values.map(String),nums=[numeric(a),numeric(b),numeric(c)];
 const pairResults=groupPairs.map(([i,j])=>op==='+'?nums[i]+nums[j]:nums[i]*nums[j]);
 const correct=groupPairs.map((_,i)=>i).filter(i=>Math.abs(pairResults[i]-target)<1e-8);
 if(correct.length!==1)throw Error(`ambiguous-easy-group:${id}:${correct.length}`);
 const correctIndex=correct[0], intended=groupPairs.findIndex(pair=>pair[0]===easyPair[0]&&pair[1]===easyPair[1]||pair[0]===easyPair[1]&&pair[1]===easyPair[0]);
 if(intended!==correctIndex)throw Error(`easy-pair-mismatch:${id}`);
 const [i,j]=groupPairs[correctIndex], rest=[0,1,2].find(k=>k!==i&&k!==j), group=pairResults[correctIndex],result=op==='+'?group+nums[rest]:group*nums[rest];
 const symbol=op==='+'?'＋':'×', choices=[`(${a} ${symbol} ${b}) ${symbol} ${c}`,`(${a} ${symbol} ${c}) ${symbol} ${b}`,`${a} ${symbol} (${b} ${symbol} ${c})`];
 const selectedPair=groupPairs[correctIndex], restIndex=[0,1,2].find(k=>!selectedPair.includes(k));
 const type=id.startsWith('decimal-add-')?'decimal-addition':id.startsWith('125x8-')?'multiply-125x8':op==='+'?'integer-addition':'integer-multiplication';
 return {id,type,a,b,c,op,values:[a,b,c],question:`${a} ${symbol} ${b} ${symbol} ${c}`,choices,correct:correctIndex,group,rest:nums[restIndex],result,solution:`(${fmt(nums[selectedPair[0]])} ${symbol} ${fmt(nums[selectedPair[1]])}) ${symbol} ${fmt(nums[restIndex])} ＝ ${fmt(group)} ${symbol} ${fmt(nums[restIndex])} ＝ ${fmt(result)}`,easyPair,target};
}
function shuffleQuestionDeck(questions,previousType='',r=Math.random){
 const buckets=new Map();for(const q of questions){const a=buckets.get(q.type)||[];a.push(q);buckets.set(q.type,a)}
 for(const [type,items] of buckets)buckets.set(type,shuffle(items,r));
 const order=[];let last=previousType,remaining=questions.length;
 while(remaining){let candidates=[...buckets].filter(([type,items])=>items.length&&type!==last);if(!candidates.length)candidates=[...buckets].filter(([,items])=>items.length);
  const max=Math.max(...candidates.map(([,items])=>items.length));candidates=candidates.filter(([,items])=>items.length===max);const [type,items]=candidates[Math.floor(r()*candidates.length)];order.push(items.pop());last=type;remaining--;
 }
 return order;
}
function randomizedChoiceOrder(q,counts=[0,0,0],last=-1,r=Math.random){
 const min=Math.min(...counts);let positions=[0,1,2].filter(i=>counts[i]===min&&i!==last);if(!positions.length)positions=[0,1,2].filter(i=>counts[i]===min);
 const position=positions[Math.floor(r()*positions.length)],other=shuffle([0,1,2].filter(i=>i!==q.correct),r),order=[];order[position]=q.correct;
 let j=0;for(let i=0;i<3;i++)if(i!==position)order[i]=other[j++];const nextCounts=[...counts];nextCounts[position]++;
 return {order,position,counts:nextCounts};
}
function exchangeQuestions(){
 const out=[];
 addition.forEach(([a,b,c,target],i)=>out.push(makeQuestion(`add-${i+1}`,[a,c,b],'+',[0,2],target)));
 multiplication.forEach(([a,b,c,target],i)=>out.push(makeQuestion(`mul-${i+1}`,[a,c,b],'×',[0,2],target)));
 decimalAddition.forEach(([a,b,c,target,easyPair],i)=>out.push(makeQuestion(`decimal-add-${i+1}`,[a,b,c],'+',easyPair,target)));
 hundredTwentyFive.forEach(({v,easyPair,target},i)=>out.push(makeQuestion(`125x8-${i+1}`,v,'×',easyPair,target)));
 return out;
}
function validateExchangeQuestions(){
 const qs=exchangeQuestions();
 if(new Set(qs.map(q=>q.id)).size!==qs.length)throw Error('duplicate-question-id');
 for(const q of qs){
  if(q.choices.length!==3||new Set(q.choices).size!==3)throw Error('bad-choice-set:'+q.id);
  const vals=q.values.map(numeric);
  const results=groupPairs.map(([i,j])=>q.op==='+'?vals[i]+vals[j]:vals[i]*vals[j]);
  const totals=results.map((v,i)=>{const rest=[0,1,2].find(k=>!groupPairs[i].includes(k));return q.op==='+'?v+vals[rest]:v*vals[rest]});
  if(totals.some(n=>Math.abs(n-q.result)>1e-7))throw Error('unequal-choice:'+q.id);
  if(results.filter(n=>Math.abs(n-q.target)<1e-8).length!==1)throw Error('non-unique-best:'+q.id);
  if(q.op==='×'&&q.values.some(n=>String(n).includes('.')))throw Error('decimal-multiplication:'+q.id);
 }
 return {count:qs.length,decimalCount:qs.filter(q=>q.id.startsWith('decimal-add-')).length,'125Count':qs.filter(q=>q.id.startsWith('125x8-')).length,additionCount:qs.filter(q=>q.op==='+').length,multiplicationCount:qs.filter(q=>q.op==='×').length};
}
return {shuffle,factorQuestions,formatFactor,factorAnswer,correctFactor,factorValue,exchangeQuestions,shuffleQuestionDeck,randomizedChoiceOrder,validateExchangeQuestions};
});
