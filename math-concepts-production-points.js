// Scoped adapter for the two added games. Existing eight game writers are untouched.
(()=>{'use strict';if(window.MANABI_ENV?.preview!==false)throw Error('production-page-required');
const s=window.manabiStorage,testing=new URL(location.href).searchParams.has('adminTest'),valid=new Set(['multiplicationProperties','shapeExpressions']),ledgerKey='mgl_math_added_daily_v1',outboxKey='mgl_math_concepts_outbox_v1',journalKey='mgl_math_concepts_commit_v1';
const fallback=window.ManabiStorageAdapters.pointFallback(window,navigator,'production',s);
const pending=window.ManabiPointStorage&&fallback.queue('math-concepts');
const read=(key,fallback,storage=s)=>{const raw=storage.getItem(key);return raw===null?fallback:JSON.parse(raw)},integer=n=>{if(!Number.isSafeInteger(Number(n))||Number(n)<0)throw Error('existing-balance-review-required');return Number(n)},day=()=>new Date(Date.now()+32400000).toISOString().slice(0,10);let running=null;
function recover(s){const j=read(journalKey,null,s);if(!j)return;for(const e of j.entries){if(!['mgl_points',ledgerKey,'mgl_economy_v1'].includes(e.key)||![e.before,e.after].includes(s.getItem(e.key)))throw Error('existing-wallet-conflict');}for(const e of j.entries)s.setItem(e.key,e.after);s.removeItem(journalKey);}
function correct(item){if(!valid.has(item.game))throw Error('unsupported-game');const model=item.game==='multiplicationProperties'?window.ManabiMultiplication:window.ManabiMathConcepts,pool=item.game==='multiplicationProperties'?model.multiplication():model.shapes(),q=pool.find(q=>q.id===item.prompt.id);if(!q)throw Error('unknown-question');return item.answer.choice===q.answer;}
function commit(item,s){recover(s);const raw=s.getItem('mgl_points'),balance=integer(raw??0),saved=read(ledgerKey,{},s),ledger=saved.day===day()?structuredClone(saved):{...saved,day:day(),games:{}};ledger.games||={};const g=ledger.games[item.game]||{count:0,ids:[]};if(!Number.isInteger(g.count)||g.count<0||g.count>50||!Array.isArray(g.ids))throw Error('existing-daily-ledger-review-required');if(g.ids.includes(item.id))return;if(!correct(item)||g.count>=50)return;
const wallet=read('mgl_economy_v1',null,s);if(wallet&&(wallet.version!==1||!wallet.balances||integer(wallet.balances.math)!==balance))throw Error('existing-wallet-conflict');
if(wallet?.daily?.date===day()){const used=wallet.daily.games?.[item.game]||0;if(!Number.isInteger(used)||used<0||used>50)throw Error('existing-daily-ledger-review-required');g.count=Math.max(g.count,used);if(g.count>=50)return;}integer(balance+1);g.count++;g.ids.push(item.id);ledger.games[item.game]=g;const entries=[{key:'mgl_points',before:raw,after:String(balance+1)},{key:ledgerKey,before:s.getItem(ledgerKey),after:JSON.stringify(ledger)}];if(wallet){const next=structuredClone(wallet);next.balances.math=balance+1;if(next.legacyMirror)next.legacyMirror.math=balance+1;next.daily||={date:day(),games:{}};if(next.daily.date!==day())next.daily={date:day(),games:{}};next.daily.games[item.game]=g.count;entries.push({key:'mgl_economy_v1',before:s.getItem('mgl_economy_v1'),after:JSON.stringify(next)});}s.setItem(journalKey,JSON.stringify({entries}));recover(s);}
function first(){return pending?.list()[0]||read(outboxKey,[])[0]}
function remove(item,storage){
 const queue=read(outboxKey,[],storage);
 if(queue.some(x=>x.id===item.id))storage.setItem(outboxKey,JSON.stringify(queue.filter(x=>x.id!==item.id)));
}
async function drain(){
 while(true){
  const item=first();
  if(fallback.use()){
   if(!item){await fallback.locked(recover);break;}
   await fallback.locked(storage=>{commit(item,storage);remove(item,storage)},'math-concepts:'+item.id);
   pending?.remove(item.id);
  }else{
   await fallback.nativeLock(()=>{
    recover(s);
    if(item){commit(item,s);remove(item,s);pending?.remove(item.id)}
   });
   if(!item)break;
  }
 }
 window.dispatchEvent(new Event('manabi-economy-change'));
}
async function flush(){
 if(testing)return;
 if(running)return running;
 running=drain().finally(()=>{running=null});
 return running;
}
window.ManabiEconomy={
 balance:()=>integer(s.getItem('mgl_points')??0),
 begin:(game,prompt)=>({game,prompt:structuredClone(prompt),id:crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join(''),answered:false}),
 answer:async(ctx,answer)=>{
  if(!ctx||ctx.answered||testing)return;
  if(!valid.has(ctx.game))throw Error('unsupported-game');
  ctx.answered=true;
  const item={id:ctx.id,game:ctx.game,prompt:ctx.prompt,answer:structuredClone(answer)};
  if(pending)pending.add(item);
  else await fallback.nativeLock(()=>{
   const queue=read(outboxKey,[]);
   if(!queue.some(x=>x.id===item.id)){queue.push(item);s.setItem(outboxKey,JSON.stringify(queue))}
  });
  return flush();
 },flush
};
const retry=()=>flush().catch(()=>{});
window.addEventListener('online',retry);
window.addEventListener('pageshow',retry);
setInterval(()=>{if(first())retry()},15000);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',retry);else retry();
})();
