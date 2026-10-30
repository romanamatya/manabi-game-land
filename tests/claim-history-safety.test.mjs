import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';

const root=new URL('../',import.meta.url);
function fakeIndexedDB(){
  const rows=new Map();
  return {rows,open(){const req={};setTimeout(()=>{req.result={objectStoreNames:{contains:()=>true},createObjectStore(){},close(){},transaction(){const tx={objectStore(){return {get(key){const r={};setTimeout(()=>{r.result=rows.get(key);r.onsuccess?.()},0);return r},put(value){rows.set(value.id,value)}}}};setTimeout(()=>tx.oncomplete?.(),1);return tx}};req.onsuccess?.()},0);return req}};
}
function runtime(mode,{initial=[],session=[]}={}){
  const data=new Map(initial),sessionData=new Map(session);let quota=Infinity,lock=Promise.resolve();
  const store=map=>({getItem:k=>map.get(k)??null,setItem(k,v){v=String(v);if(v.length+[...map].reduce((n,[key,x])=>n+(key===k?0:String(x).length),0)>quota)throw Error('QuotaExceededError');map.set(k,v)},removeItem:k=>map.delete(k)});
  const storage=store(data),sessionStorage=store(sessionData),window={MANABI_ENV:{preview:mode==='preview'},manabiStorage:storage,sessionStorage,indexedDB:fakeIndexedDB(),addEventListener(){},dispatchEvent(){}};
  const ctx={window,globalThis:window,structuredClone,Date,URL,crypto:{randomUUID},Event:class{},CustomEvent:undefined,document:{body:{dataset:{}},readyState:'complete',addEventListener(){},getElementById(){return null},createElement(){return {setAttribute(){}}}},navigator:{locks:{request:(_,fn)=>{const p=lock.then(fn);lock=p.catch(()=>{});return p}}},location:{href:'https://example.invalid/'+(mode==='preview'?'preview/':'')},setInterval(){}};
  vm.createContext(ctx);
  for(const file of ['economy-core.js','storage-adapters.js',mode==='preview'?'preview/economy.js':'economy.js'])vm.runInContext(fs.readFileSync(new URL(file,root),'utf8'),ctx);
  return {api:window.ManabiEconomy,data,sessionData,indexedDB:window.indexedDB,setQuota:n=>quota=n};
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('production and preview keep answer history bounded over 10,000 answers',async()=>{
  for(const mode of ['production','preview']){
    const {api,data}=runtime(mode);
    for(let i=0;i<10000;i++){const q=api.begin('alphabet','A');await api.answer(q,'a')}
    const wallet=JSON.parse(data.get('mgl_economy_v1'));
    assert.equal(wallet.claimed.length,128);
    assert.equal(wallet.balances.english,50);
    assert(data.get('mgl_economy_v1').length<6000);
    const japanese=JSON.parse(data.get('mgl_kotowaza_points_v1')||'null');
    if(japanese)assert(japanese.claims.length<=128);
  }
});

test('legacy bloat is backed up before compaction and preserves wallet state',async()=>{
  const seed=runtime('production');let wallet=seed.api.core.initial();
  wallet.balances={...wallet.balances,math:100,japanese:20};wallet.legacyMirror={math:100,japanese:20};wallet.legacyJapaneseImported=true;
  wallet.claimed=Array.from({length:300},(_,i)=>'old-'+i);wallet.owned=['icon-007','frame-11'];wallet.customTitles=['保持する称号'];
  const japanese={version:1,balance:20,date:seed.api.core.dayKey(),used:5,claims:Array.from({length:300},(_,i)=>'old-'+(i%300))};
  const {api,data,indexedDB}=runtime('production',{initial:[['mgl_points','100'],['mgl_economy_v1',JSON.stringify(wallet)],['mgl_kotowaza_points_v1',JSON.stringify(japanese)]]});
  await pause(150);
  const fixed=JSON.parse(data.get('mgl_economy_v1')),legacy=JSON.parse(data.get('mgl_kotowaza_points_v1'));
  assert.equal(fixed.claimed.length,128);assert.equal(legacy.claims.length,128);
  assert.equal(fixed.balances.math,100);assert.equal(fixed.balances.japanese,20);
  assert.deepEqual(fixed.owned,['icon-007','frame-11']);assert.deepEqual(fixed.customTitles,['保持する称号']);
  assert(indexedDB.rows.has('claim-history-v1'));
});

test('quota failure keeps the answer in session storage and recovers after reload',async()=>{
  const first=runtime('production');await pause(10);first.setQuota(150);
  const q=first.api.begin('alphabet','A');await first.api.answer(q,'a');
  assert(first.sessionData.get('mgl_economy_outbox_v1'));
  const restored=runtime('production',{initial:[...first.data],session:[...first.sessionData]});await pause(150);
  assert.equal(restored.api.snapshot().balances.english,1);
  assert.equal(restored.sessionData.get('mgl_economy_outbox_v1'),'[]');
});

test('double taps and outbox replay award only once',async()=>{
  const first=runtime('production');await pause(10);
  const q=first.api.begin('alphabet','A');await Promise.all([first.api.answer(q,'a'),first.api.answer(q,'a')]);
  const score=first.api.snapshot().balances.english;
  first.data.set('mgl_economy_outbox_v1',JSON.stringify([{id:q.id,game:'alphabet',prompt:'A',answer:'a'}]));
  const restored=runtime('production',{initial:[...first.data]});await pause(150);
  assert.equal(restored.api.snapshot().balances.english,score);
});
