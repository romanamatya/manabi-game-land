(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ManabiMathNew=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function shuffle(a,r=Math.random){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
// Curated pairs make 10, 20, 50 or 100 after factoring.
const pairs=[[13,7,'+'],[12,8,'+'],[14,6,'+'],[16,4,'+'],[17,7,'-'],[18,8,'-'],[28,8,'-'],[27,7,'-'],[35,15,'-'],[38,18,'-'],[45,5,'+'],[42,8,'+'],[75,25,'-'],[60,40,'+']];
const factorQuestions=pairs.flatMap(([a,b,op])=>[3,4,5,6,7,8,9].flatMap(c=>['left','right'].map(side=>({a,b,op,c,side,id:`${a}-${b}-${op}-${c}-${side}`}))));
function formatFactor(q){return q.side==='right'?`${q.a}×${q.c}${q.op==='+'?'＋':'－'}${q.b}×${q.c}`:`${q.c}×${q.a}${q.op==='+'?'＋':'－'}${q.c}×${q.b}`}
function factorAnswer(q){return q.side==='right'?`(${q.a}${q.op}${q.b})×${q.c}`:`${q.c}×(${q.a}${q.op}${q.b})`}
function correctFactor(q,tokens){const norm=tokens.join('').replaceAll('＋','+').replaceAll('－','-').replaceAll('＊','×');const pair=`(${q.a}${q.op}${q.b})`;const rev=q.op==='+'?`(${q.b}+${q.a})`:pair;return [pair+'×'+q.c,q.c+'×'+pair,rev+'×'+q.c,q.c+'×'+rev].includes(norm)}
function factorValue(q){return (q.op==='+'?q.a+q.b:q.a-q.b)*q.c}
const addition=[[8,2,6],[7,3,8],[14,6,7],[12,8,5],[45,55,12],[30,70,16],[65,35,11],[9,1,7]];
const multiplication=[[2,5,7],[4,25,7],[5,20,3],[2,50,3],[4,25,6],[2,5,9]];
function exchangeQuestions(){return [...addition.map(v=>({v,op:'+'})),...multiplication.map(v=>({v,op:'×'}))].map(({v,op})=>{const [a,b,c]=v;return {id:`${op}-${a}-${b}-${c}`,a,b,c,op,question:`${a} ${op} ${c} ${op} ${b}`,choices:[`(${a} ${op} ${c}) ${op} ${b}`,`(${a} ${op} ${b}) ${op} ${c}`,`${a} ${op} (${c} ${op} ${b})`],correct:1,group:op==='+'?a+b:a*b,result:op==='+'?a+b+c:a*b*c}})}
return {shuffle,factorQuestions,formatFactor,factorAnswer,correctFactor,factorValue,exchangeQuestions};
});
