(function(r,f){if(typeof module==='object'&&module.exports)module.exports=f();else r.ManabiKotowazaModel=f()})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function shuffle(items,random=Math.random){const out=[...items];for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}
const num=n=>Number.isSafeInteger(n)&&n>=0?n:0;
function start(data,saved={},random=Math.random){const ids=data.map(q=>q.id),valid=Array.isArray(saved?.queue)&&saved.queue.length===ids.length&&new Set(saved.queue).size===ids.length&&saved.queue.every(id=>ids.includes(id));const queue=valid?[...saved.queue]:shuffle(ids,random),slots=valid&&Array.isArray(saved.slots)&&saved.slots.length===ids.length&&saved.slots.every(n=>Number.isInteger(n)&&n>=0&&n<4)?[...saved.slots]:shuffle(ids.map((_,i)=>i%4),random);return {queue,slots,position:valid?Math.min(ids.length,num(saved.position)):0,streak:valid?num(saved.streak):0,best:Math.max(num(saved?.best),valid?num(saved.streak):0)}}
function choices(q,slot,random=Math.random){const out=shuffle(q.distractors,random);out.splice(slot,0,q.answer);return out}
function answer(state,correct){if(state.position>=state.queue.length)return {...state};const streak=correct?state.streak+1:0;return {...state,position:state.position+1,streak,best:Math.max(state.best,streak)}}
return {shuffle,start,choices,answer};
});
