(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ManabiKotowazaPoints=factory()})(globalThis,function(){
'use strict';
const KEY='mgl_kotowaza_points_v1';
function day(ms){return new Date(ms+32400000).toISOString().slice(0,10)}
function apply(raw,id,correct,ms){const w=raw?structuredClone(raw):{version:1,balance:0,date:day(ms),used:0,claims:[]};if(w.version!==1||!Number.isSafeInteger(w.balance)||w.balance<0||!Number.isSafeInteger(w.used)||w.used<0||w.used>50||!Array.isArray(w.claims))throw Error('invalid-wallet-preserved');if(w.claims.includes(id))return {wallet:w,granted:0};if(w.date!==day(ms)){w.date=day(ms);w.used=0}const granted=correct&&w.used<50?1:0;w.balance+=granted;w.used+=granted;w.claims.push(id);return {wallet:w,granted}}
function install(storage){if(globalThis.MANABI_ENV?.preview!==false)throw Error('production-page-required');
const pendingPrefix='mgl_kotowaza_pending:';
const testing=new URL(location.href).searchParams.has('adminTest');
const read=()=>{const raw=storage.getItem(KEY);return raw?JSON.parse(raw):null};
async function flush(){if(testing)return;if(!navigator.locks)throw Error('cross-tab-lock-required');return navigator.locks.request(KEY,()=>{for(const key of Object.keys(localStorage).filter(k=>k.startsWith(pendingPrefix))){const item=JSON.parse(localStorage.getItem(key));const q=globalThis.ManabiKotowazaData.find(q=>q.id===item.prompt);if(!q)throw Error('unknown-question');const result=apply(read(),item.id,item.value===q.answer,item.answeredAt);storage.setItem(KEY,JSON.stringify(result.wallet));localStorage.removeItem(key)}window.dispatchEvent(new Event('manabi-economy-change'))})}
window.addEventListener('online',()=>flush().catch(console.warn));window.addEventListener('DOMContentLoaded',()=>flush().catch(console.warn));
return {balance:()=>read()?.balance||0,begin:(game,prompt)=>({id:crypto.randomUUID(),prompt}),answer:async(c,value)=>{if(testing)return;localStorage.setItem(pendingPrefix+c.id,JSON.stringify({id:c.id,prompt:c.prompt,value,answeredAt:Date.now()}));return flush()}}}

return {KEY,day,apply,install};
});
