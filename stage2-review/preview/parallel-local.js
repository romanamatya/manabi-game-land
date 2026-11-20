(()=>{
'use strict';
const core=window.ManabiEconomyCore,model=window.ManabiParallel,C=window.ManabiChallenge120Core,game='parallelPair';
const shared=window.ManabiEconomy?.snapshot&&!window.ManabiEconomy.__parallelLocal?window.ManabiEconomy:null;
const storage=window.manabiStorage||localStorage,key='manabi_parallel_stage1:v1',memory=new Map(),season='parallel-120-v1';let storageWarning=false,serial=Promise.resolve(),sequence=0;
const mono=()=>window.performance?.now?.()??Date.now();let anchorWall=Date.now(),anchorMono=mono();
const titles=Object.freeze([[3,'平行みならい','assets/parallel-titles/01_heiko_minarai_512.png'],[5,'平行ハンター','assets/parallel-titles/02_heiko_hunter_512.png'],[10,'平行マスター','assets/parallel-titles/03_heiko_master_512.png'],[15,'平行の達人','assets/parallel-titles/04_heiko_tatsujin_512.png'],[25,'平行の王者','assets/parallel-titles/05_heiko_ouja_512.png']].map(([at,name,image])=>Object.freeze({id:'parallelPair:'+at,at,name,image})));
const earnedAt=best=>titles.filter(t=>best>=t.at).map(t=>t.id);
function fresh(){return {version:1,streak:0,best:0,titles:[],wallet:core.initial(),claims:[],challenge:C.fresh(game)}}
function load(){let raw;try{raw=storage.getItem(key)}catch{storageWarning=true}if(memory.has(key))raw=memory.get(key);try{const s=JSON.parse(raw);core.checkWallet(s.wallet);if(s.version!==1||![s.streak,s.best].every(n=>Number.isSafeInteger(n)&&n>=0)||s.best<s.streak||!Array.isArray(s.claims))throw Error('invalid-state');return s}catch{return fresh()}}
function normalize(s){
 let c=s.challenge;
 if(!c||!Array.isArray(c.claimed)||!c.bests||typeof c.bests!=='object'||Array.isArray(c.bests)||![c.streak,c.practiceStreak,c.attemptBest].every(n=>Number.isSafeInteger(n)&&n>=0)||Object.values(c.bests).some(n=>!Number.isSafeInteger(n)||n<0)||c.protocol!==C.PROTOCOL||c.game!==game||!['training','waiting','running','ended'].includes(c.phase)||(c.phase==='running'&&(!Number.isSafeInteger(c.deadline)||c.deadline!==c.startedAt+C.DURATION_MS))){c=C.fresh(game,s.best>=25);c.practiceStreak=s.streak;}
 c=C.unlock(c,s.best>=25);const time=C.clock(c,Date.now(),mono()-anchorMono,anchorWall);c=C.settle(c,time.now,time.rollback);
 if(c.phase==='training'||c.phase==='waiting')s.streak=c.practiceStreak;else if(c.phase==='running'||c.phase==='ended')s.streak=c.streak;
 s.best=Math.max(s.best,s.streak,c.attemptBest||0,...Object.values(c.bests||{}));s.titles=earnedAt(s.best);c.claimed=(c.claimed||[]).slice(-128);s.claims=s.claims.slice(-128);s.challenge=c;return s;
}
const read=()=>normalize(load());
function save(s){const raw=JSON.stringify(s);try{storage.setItem(key,raw);memory.delete(key);storageWarning=false}catch{memory.set(key,raw);storageWarning=true}if(shared){try{const old=JSON.parse(storage.getItem('mgl_parallelPair')||'{}');storage.setItem('mgl_parallelPair',JSON.stringify({...old,best:s.best,streak:s.streak}))}catch{storageWarning=true}}return s}
function changed(){window.dispatchEvent?.(new Event('manabi-parallel-record-change'));}
function transaction(fn){const run=()=>fn(read());const request=()=>navigator.locks?.request?navigator.locks.request('manabi-parallel-stage3',run):run();const result=serial.then(request);serial=result.catch(()=>{});return result}
const api={
 __parallelLocal:true,read,titles,warning:()=>storageWarning||window.ManabiStorageWarning===true,
 wallet:()=>shared?shared.snapshot():read().wallet,balance:()=>shared?shared.balance(game):read().wallet.balances.math,
 canPlay:()=>['training','running'].includes(read().challenge.phase),
 begin(id,prompt){const idValue=window.crypto?.randomUUID?.()||Date.now()+'-'+(++sequence),economyContext=shared?.begin(id,prompt);if(economyContext){economyContext.id=idValue;economyContext.policy={multiplier:1,cap:50};economyContext.__mglCelebrationHandled=true}return {game:id,prompt,id:idValue,answered:false,__mglCelebrationHandled:true,token:C.issue(read().challenge,idValue),economyContext}},
 async answer(context,value){
  if(!context||context.answered)return false;context.answered=true;context.earnedTitles=[];context.accepted=false;
  return transaction(async s=>{
   if(s.claims.includes(context.id))return false;
   const ok=model.correct(context.prompt,value?.selection),result=C.answer(s.challenge,context.token,ok,Math.max(Date.now(),s.challenge.lastWall||0));
   if(!result.accepted){save(normalize({...s,challenge:result.state}));changed();return false}
   const before=new Set(s.titles);s=normalize({...s,challenge:result.state});s.claims=[...s.claims,context.id].slice(-128);
   if(!shared)s.wallet=core.reward(s.wallet,game,ok,core.dayKey()).wallet;
   context.earnedTitles=titles.filter(t=>s.titles.includes(t.id)&&!before.has(t.id));context.accepted=true;save(s);
   // Shared economy keeps only its existing transient outbox and 128 dedupe IDs.
   // No learning-answer events, problem history or analytics are emitted here.
   if(shared)await shared.answer(context.economyContext,value);
   changed();return ok;
  });
 },
 async mergeBest(best){if(!Number.isSafeInteger(best)||best<1||best>100000)return;return transaction(s=>{s.best=Math.max(s.best,best);s=normalize(s);save(s);changed();return s})},
 async start(){return transaction(s=>{anchorWall=Date.now();anchorMono=mono();s.challenge=C.start(s.challenge,anchorWall,window.crypto?.randomUUID?.()||'attempt-'+Date.now()+'-'+(++sequence),season);s=normalize(s);save(s);changed();return s})},
 async tick(){return transaction(s=>{if(s.challenge.phase==='running'||s.challenge.phase==='ended'&&load().challenge?.phase!=='ended')save(s);return s})}
};
window.ManabiParallelLocal=api;if(!shared)window.ManabiEconomy=api;
})();
