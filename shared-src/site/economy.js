(()=>{
'use strict';
const core=window.ManabiEconomyCore,storage=window.manabiStorage;if(!core||!storage)return;
const testing=new URL(location.href).searchParams.has('adminTest'),preview=window.MANABI_ENV?.preview===true;
const mode=preview?'preview':'production',localStore=window.ManabiStorageAdapters.create(storage,core,mode);
const key='mgl_economy_v1',outboxKey='mgl_economy_outbox_v1',CLAIM_LIMIT=128;let readyPromise=null,api=null,flushing=false,lastError='';
const read=(k,fallback)=>{try{return JSON.parse(storage.getItem(k)||'null')??fallback}catch{return fallback}};
const num=n=>Number.isSafeInteger(Number(n))&&Number(n)>=0?Number(n):0;
function legacyTotals(){const points=k=>num(read(k,{}).points);return {japanese:0,math:num(storage.getItem('mgl_points')),social:Math.max(points('mq_pref_name'),points('mgl_pref-name'))+Math.max(points('mq_pref_place'),points('mgl_pref-place')),science:0,english:points('mgl_alphabet')}}
function storedLegacy(){return read('mgl_economy_legacy_backup_v1',{}).totals||legacyTotals()}
function snapshot(){return localStore.snapshot()}
function notify(){renderBalance();window.dispatchEvent(new Event('manabi-economy-change'))}
function accept(result){result.wallet=localStore.commit({...result.wallet,claimed:(result.wallet.claimed||[]).slice(-CLAIM_LIMIT)});lastError='';notify();return result}
function localLock(fn){return navigator.locks?navigator.locks.request('manabi-'+mode+'-economy-v1',fn):Promise.reject(Error('cross-tab-lock-required'))}
async function ready(){throw Error('cloud-economy-not-enabled')}
function questionId(){if(typeof crypto.randomUUID==='function')return crypto.randomUUID();const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const h=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20)}
function begin(game,prompt){const context={game,prompt:structuredClone(prompt),id:questionId(),answered:false};return context}
async function answer(context,value){if(!context||context.answered||testing)return;context.answered=true;const pending=read(outboxKey,[]);if(!pending.some(x=>x.id===context.id)){pending.push({id:context.id,game:context.game,prompt:context.prompt,answer:structuredClone(value)});storage.setItem(outboxKey,JSON.stringify(pending))}return flush()}
async function flush(){if(testing||flushing)return;flushing=true;try{while(true){const item=read(outboxKey,[])[0];if(!item)break;await localLock(()=>{const w=snapshot();if(!(w.claimed||[]).includes(item.id)){const prompt=core.canonicalPrompt(item.game,item.prompt),result=core.reward(w,item.game,core.correct(item.game,prompt,item.answer),core.dayKey());result.wallet.claimed=[...(w.claimed||[]),item.id].slice(-CLAIM_LIMIT);accept(result)}});storage.setItem(outboxKey,JSON.stringify(read(outboxKey,[]).filter(x=>x.id!==item.id)));notify()}}catch(e){lastError=e.message==='legacy-wallet-review-required'?'旧端末の残高との照合が必要。元データを保持してポイント保存を停止中。':'ポイント保存待ち。端末の回答履歴を保持中。';renderBalance()}finally{flushing=false}}
async function buy(productId,subject){if(testing)throw Error('test-mode');if(preview&&window.MANABI_SPARK_CONFIG?.playerSyncEnabled===true){const sync=window.ManabiPlayerSync||await window.ManabiPlayerSyncReady;if(!sync)throw Error('sync-not-ready');return sync.buy(productId,subject);}return localLock(()=>accept({wallet:core.purchase(snapshot(),core.catalog.find(i=>i.id===productId),subject)}))}
async function equip(icon){if(!core.freeIcons.includes(icon)&&!(core.catalog.some(p=>p.id===icon&&p.kind==='icon')&&snapshot().owned.includes(icon)))throw Error('not-owned');const profile=read('mgl_profile',{});profile.icon=icon;storage.setItem('mgl_profile',JSON.stringify(profile));window.dispatchEvent(new Event('manabi-profile-change'));notify()}
async function equipFrame(frame){if(!core.catalog.some(p=>p.id===frame&&['frame','limited-frame'].includes(p.kind))||!snapshot().owned.includes(frame))throw Error('not-owned');const profile=read('mgl_profile',{});profile.frame=frame;storage.setItem('mgl_profile',JSON.stringify(profile));window.dispatchEvent(new Event('manabi-profile-change'));notify()}
async function equipSubjectIcon(subject,icon){if(testing)throw Error('test-mode');window.ManabiProfile.equipLimited(storage,subject,icon);notify()}
async function equipSubjectFrame(subject,frame){if(testing)throw Error('test-mode');window.ManabiProfile.equipLimitedFrame(storage,subject,frame);notify()}
function balance(game){const subject=core.games[game];return num(snapshot().balances[subject])}
function renderBalance(){const game=document.body?.dataset.scoreGame;if(!game)return;const points=document.getElementById('points');if(points)points.textContent=balance(game);let note=document.getElementById('economyDailyStatus');if(!note&&points){note=document.createElement('small');note.id='economyDailyStatus';note.setAttribute('role','status');points.after(note)}if(note){const w=snapshot(),used=w.daily.date===core.dayKey()?num(w.daily.games[game]):0;note.textContent=testing?'テスト：ポイント対象外':lastError||(window.ManabiStorageWarning?'保存領域が不足。回答を一時保存中。':'今日 '+used+'/50pt'+(used>=50?'・記録の更新は続けられる':''))}}
window.ManabiEconomy={core,snapshot,legacyTotals:storedLegacy,balance,begin,answer,buy,equip,equipFrame,equipSubjectFrame,equipSubjectIcon,refresh:async()=>{notify();return snapshot()},flush,testing};
if(!storage.getItem('mgl_economy_legacy_backup_v1')){const keys=['mgl_points','mgl_best','mq_pref_name','mq_pref_place','mgl_pref-name','mgl_pref-place','mgl_alphabet','mgl_profile'];storage.setItem('mgl_economy_legacy_backup_v1',JSON.stringify({totals:legacyTotals(),raw:Object.fromEntries(keys.map(k=>[k,storage.getItem(k)]))}))}if(preview)snapshot();
window.addEventListener('online',flush);window.addEventListener('storage',notify);window.addEventListener('pageshow',()=>{notify();if(!testing)flush()});setInterval(()=>{renderBalance();if(!testing&&read(outboxKey,[]).length)flush()},15000);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{notify();flush()});else{notify();flush()}
})();



