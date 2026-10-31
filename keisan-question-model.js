// Extracted verbatim from games/keisan.html. Both games call this one implementation.
(function(r,f){if(typeof module==='object'&&module.exports)module.exports=f();else r.ManabiKeisanQuestions=f()})(globalThis,()=>{
'use strict';
const signs=['＋','－','×','÷'],rand=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;
const clone=s=>({n:[...s.n],o:[...s.o],l:s.l,r:s.r});
function calc(a,b,o){return o===0?a+b:o===1?a-b:o===2?a*b:a/b}
function priority(s){const ids=s.o.map((_,i)=>i).filter(i=>s.l<0||(i>=s.l&&i<s.r));return ids.find(i=>s.o[i]>=2)??ids[0]??-1}
function reduce(s,i){const n=[...s.n],o=[...s.o];n.splice(i,2,calc(n[i],n[i+1],o[i]));o.splice(i,1);let l=s.l,r=s.r;if(l>=0){if(i>=l&&i<r){r--;if(l===r){l=-1;r=-1}}else if(i<l){l--;r--}}return {n,o,l,r}}
function valid(s){let x=clone(s);while(x.o.length){const i=priority(x);if(i<0)return false;const v=calc(x.n[i],x.n[i+1],x.o[i]);if(!Number.isInteger(v)||v<0||v>999)return false;x=reduce(x,i)}return true}
function generate(){for(let k=0;k<20000;k++){const n=Array.from({length:4},()=>rand(1,12)),o=Array.from({length:3},()=>rand(0,3)),size=Math.random()<.75?rand(2,3):0,l=size?rand(0,4-size):-1,s={n,o,l,r:size?l+size-1:-1};if(o.some(x=>x<2)&&o.some(x=>x>=2)&&valid(s))return s}return {n:[8,6,2,3],o:[0,3,2],l:1,r:3}}
function parts(s){const out=[];s.n.forEach((n,i)=>{if(i===s.l)out.push(['paren','（']);out.push(['num',String(n)]);if(i===s.r)out.push(['paren','）']);if(i<s.o.length)out.push(['op',signs[s.o[i]],i])});return out}
return {signs,clone,calc,priority,reduce,valid,generate,parts};
});
