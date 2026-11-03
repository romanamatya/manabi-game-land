import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';

const read=file=>fs.readFileSync(new URL(file,import.meta.url),'utf8');
function economyRuntime(storage,{campaignsEnabled=false,gameIds=['keisan','distribution']}={}){
 let queue=Promise.resolve();
 let sessionOpens=0;const window={MANABI_ENV:{preview:false},MANABI_BACKEND_CONFIG:{campaignsEnabled,gameIds},ManabiFirebaseSession:{open:async()=>{sessionOpens++;throw Error('unexpected-campaign-read')}},manabiStorage:storage,addEventListener(){},dispatchEvent(){}};
 const ctx={window,globalThis:window,structuredClone,Date,URL,crypto,Event:class{},document:{body:{dataset:{scoreGame:'suichoku'}},readyState:'loading',addEventListener(){},getElementById(){return null}},navigator:{locks:{request:(_,fn)=>{const p=queue.then(fn);queue=p.catch(()=>{});return p}}},location:{href:'https://example.invalid/games/suichoku.html'},setInterval(){}};
 vm.createContext(ctx);for(const f of ['economy-core.js','storage-adapters.js','economy.js'])vm.runInContext(read('../shared-src/site/'+f,'utf8'),ctx);
 return {api:window.ManabiEconomy,sessionOpens:()=>sessionOpens};
}
const model=(()=>{const module={exports:{}};const ctx={module,Math,Date,Set,Object,Array,Number,String,Error,structuredClone};vm.runInNewContext(read('../shared-src/site/suichoku-model.js'),ctx);return module.exports})();
function question(seed){let n=seed>>>0;return model.buildQuestion({random:()=>((n=(1664525*n+1013904223)>>>0)/4294967296),id:'sq-'+seed});}

test('Suichoku awards one shared math point per correct question, preserves existing balance, rejects wrong and duplicate answers',async()=>{
 const values=new Map([['mgl_points','123'],['mgl_suichoku',JSON.stringify({best:7,streak:4,history:[]})]]),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)},api=economyRuntime(storage).api;
 assert.equal(api.balance('suichoku'),123);
 const q=question(7),context=api.begin('suichoku',q);await Promise.all([api.answer(context,{choice:q.correctIndex}),api.answer(context,{choice:q.correctIndex})]);assert.equal(api.balance('suichoku'),124);assert.equal(values.get('mgl_points'),'124');
 const wrong=question(8),wrongContext=api.begin('suichoku',wrong);await api.answer(wrongContext,{choice:(wrong.correctIndex+1)%5});assert.equal(api.balance('suichoku'),124);
 const replay=economyRuntime(storage).api;await replay.flush();assert.equal(replay.balance('suichoku'),124);assert.equal(JSON.parse(values.get('mgl_suichoku')).best,7);
});

test('Suichoku respects the shared per-game 50 point Japanese-day cap without touching other games',async()=>{
 const seed=question(9),base=Date.now(),day=(()=>{const d=new Date(base);const jst=new Date(d.getTime()+9*60*60*1000);return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth()+1).padStart(2,'0')}-${String(jst.getUTCDate()).padStart(2,'0')}`})(),values=new Map([['mgl_points','500'],['mgl_math_added_daily_v1',JSON.stringify({day,games:{suichoku:{count:49},keisan:{count:11}}})]]),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)},api=economyRuntime(storage).api;
 const before=api.snapshot();assert.equal(before.daily.games.suichoku,49);assert.equal(before.daily.games.keisan,11);const context=api.begin('suichoku',seed);await api.answer(context,{choice:seed.correctIndex});assert.equal(api.balance('suichoku'),501);assert.equal(api.snapshot().daily.games.suichoku,50);assert.equal(api.snapshot().daily.games.keisan,11);
 const next=question(10),second=api.begin('suichoku',next);await api.answer(second,{choice:next.correctIndex});assert.equal(api.balance('suichoku'),501);assert.equal(api.snapshot().daily.games.suichoku,50);
});

test('a temporary wallet-save failure retains the claim for safe retry',async()=>{
 const values=new Map([['mgl_points','40']]);let failWalletWrite=false;const storage={getItem:k=>values.get(k)??null,setItem(k,v){if(k==='mgl_economy_v1'&&failWalletWrite){failWalletWrite=false;throw Error('quota')}values.set(k,String(v))},removeItem:k=>values.delete(k)},api=economyRuntime(storage).api,q=question(12),context=api.begin('suichoku',q);
 failWalletWrite=true;await api.answer(context,{choice:q.correctIndex});assert.equal(api.balance('suichoku'),41,'the recovery journal completes an interrupted save');assert.equal(JSON.parse(values.get('mgl_economy_outbox_v1')).length,1);
 await api.flush();assert.equal(api.balance('suichoku'),41);assert.equal(values.get('mgl_points'),'41');assert.equal(JSON.parse(values.get('mgl_economy_outbox_v1')).length,0);
});

test('campaign policy does not read settings for a game outside the admin-managed game list',async()=>{
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)},runtime=economyRuntime(storage,{campaignsEnabled:true,gameIds:['keisan','distribution']}),api=runtime.api;
 await api.answer(api.begin('suichoku',question(11)),{choice:question(11).correctIndex});assert.equal(runtime.sessionOpens(),0);
});
