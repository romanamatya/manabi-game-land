(()=>{
'use strict';
const core=window.ManabiEconomyCore,model=window.ManabiParallel,game='parallelPair';
// Local play uses the existing reward/cap/day algorithms with a separate local wallet.
// No legacy/profile/production wallet key, outbox, Firebase SDK or shared ranking is used.
core.games[game]='math';
const key='manabi_parallel_stage1:v1',memory=new Map();let storageWarning=false;
// Approved transparent artwork, supplied for these five title ranks.
const titles=Object.freeze([[3,'平行みならい','assets/parallel-titles/01_heiko_minarai_512.png'],[5,'平行ハンター','assets/parallel-titles/02_heiko_hunter_512.png'],[10,'平行マスター','assets/parallel-titles/03_heiko_master_512.png'],[15,'平行の達人','assets/parallel-titles/04_heiko_tatsujin_512.png'],[25,'平行の王者','assets/parallel-titles/05_heiko_ouja_512.png']].map(([at,name,image])=>Object.freeze({id:'parallelPair:'+at,at,name,image})));
const earnedAt=best=>titles.filter(t=>best>=t.at).map(t=>t.id);
function fresh(){return {version:1,streak:0,best:0,titles:[],wallet:core.initial(),claims:[]}}
function read(){let raw;try{raw=localStorage.getItem(key)}catch{storageWarning=true}if(memory.has(key))raw=memory.get(key);try{const s=JSON.parse(raw);core.checkWallet(s.wallet);if(s.version!==1||![s.streak,s.best].every(n=>Number.isSafeInteger(n)&&n>=0)||s.best<s.streak||!Array.isArray(s.claims))throw Error('invalid-state');s.titles=earnedAt(s.best);return s}catch{return fresh()}}
function save(s){const raw=JSON.stringify(s);try{localStorage.setItem(key,raw);memory.delete(key);storageWarning=false}catch{memory.set(key,raw);storageWarning=true}return s}
let sequence=0;
const api={
 read,titles,warning:()=>storageWarning,
 begin:(id,prompt)=>({game:id,prompt,id:window.crypto?.randomUUID?.()||Date.now()+'-'+(++sequence),answered:false}),
 async answer(context,value){if(!context||context.answered)return false;context.answered=true;context.earnedTitles=[];const ok=model.correct(context.prompt,value?.selection);const commit=()=>{let s=read();if(s.claims.includes(context.id))return false;const before=new Set(s.titles);s.streak=ok?s.streak+1:0;s.best=Math.max(s.best,s.streak);s.titles=earnedAt(s.best);context.earnedTitles=titles.filter(t=>s.titles.includes(t.id)&&!before.has(t.id));s.wallet=core.reward(s.wallet,game,ok,core.dayKey()).wallet;s.claims=[...s.claims,context.id].slice(-128);save(s);return ok};return navigator.locks?navigator.locks.request('manabi-parallel-stage1',commit):commit()},
 balance:()=>read().wallet.balances.math
};
window.ManabiParallelLocal=api;
// Small adapter permits reuse of the existing silent celebration renderer.
window.ManabiEconomy=api;
})();
