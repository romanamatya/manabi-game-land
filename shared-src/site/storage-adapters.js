(function(root,factory){root.ManabiStorageAdapters=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';const CLAIM_LIMIT=128,zero=()=>({japanese:0,math:0,social:0,science:0,english:0}),num=n=>Number.isSafeInteger(Number(n))&&Number(n)>=0?Number(n):0,tailClaims=x=>Array.isArray(x)?x.slice(-CLAIM_LIMIT):[];
function create(storage,core,mode){if(!['preview','production'].includes(mode))throw Error('invalid-environment');const key='mgl_economy_v1',backup='mgl_economy_legacy_backup_v2',journal='mgl_economy_commit_v2',read=(k,f)=>{try{return JSON.parse(storage.getItem(k)||'null')??f}catch{return f}};const legacyKeys=['mgl_points','mgl_best','mq_pref_name','mq_pref_place',...Object.keys(core.games).map(g=>'mgl_'+g),'mgl_profile','mgl_limited_icons_v1','mgl_limited_frames_v1','mgl_math_added_daily_v1',key];const original=Object.fromEntries(legacyKeys.map(k=>[k,storage.getItem(k)]));
 const points=k=>num(read(k,{}).points),totals={...zero(),math:num(original.mgl_points),social:Math.max(points('mq_pref_name'),points('mgl_pref-name'))+Math.max(points('mq_pref_place'),points('mgl_pref-place')),english:points('mgl_alphabet')};
 const initial=core.initial();initial.balances={...totals};initial.legacy={math:totals.math,social:totals.social,english:totals.english};initial.migrationVersion=1;initial.claimed=[];
 if(mode==='production'){const list=k=>{const x=read(k,[]);return Array.isArray(x)?x:[]},profile=read('mgl_profile',{}),retained=[...list('mgl_limited_icons_v1'),...list('mgl_limited_frames_v1'),profile.icon,profile.frame].filter(id=>typeof id==='string'&&core.catalog.some(i=>i.id===id));initial.owned=[...new Set(retained)];const old=read('mgl_math_added_daily_v1',{});if(old.day===core.dayKey()){initial.daily={date:old.day,games:Object.fromEntries(Object.entries(old.games||{}).map(([id,g])=>[id,Math.min(50,num(g.count))]))};}initial.legacyMirror={math:totals.math};}
 function recover(){const pending=read(journal,null);if(!pending)return;const raw=storage.getItem('mgl_points'),w=storage.getItem(key);if(![pending.beforeMath,pending.nextMath].includes(raw)||![pending.beforeWallet,pending.nextWallet].includes(w))throw Error('legacy-wallet-review-required');storage.setItem(key,pending.nextWallet);storage.setItem('mgl_points',pending.nextMath);storage.removeItem(journal);}
 function snapshot(){if(mode==='production')recover();const saved=read(key,null);if(saved){core.checkWallet(saved);return saved;}return structuredClone(initial);}
 function commit(next){core.checkWallet(next);const bounded={...next,claimed:tailClaims(next.claimed)};if(mode==='preview'){storage.setItem(key,JSON.stringify(bounded));return bounded;}recover();const previous=snapshot(),raw=storage.getItem('mgl_points');const expected=num(previous.legacyMirror?.math??previous.balances.math);if(num(raw)!==expected)throw Error('legacy-wallet-review-required');const value={...bounded,legacyMirror:{math:bounded.balances.math}},pending={beforeWallet:storage.getItem(key),beforeMath:raw,nextWallet:JSON.stringify(value),nextMath:String(value.balances.math)};storage.setItem(journal,JSON.stringify(pending));storage.setItem(key,pending.nextWallet);storage.setItem('mgl_points',pending.nextMath);storage.removeItem(journal);if(!storage.getItem(backup)){try{storage.setItem(backup,JSON.stringify({version:2,source:'production-legacy-local',createdAt:Date.now(),raw:original}))}catch{}}return value;}
 return {mode,snapshot,commit,legacyTotals:()=>({...totals}),original:()=>({...original})};}
function pointFallback(window, navigator, mode, storage) {
 const disk = window.ManabiPointStorage || storage;
 const marker = 'mgl_point_fallback_v1';
 const lockName = 'manabi-' + mode + '-economy-v1';
 let database, nativeUnavailable = false;
 function use() {
  if (nativeUnavailable || !navigator?.locks?.request) return true;
  try { return disk.getItem(marker) === '1'; } catch { return false; }
 }
 function open() {
  if (!database) database = new Promise((resolve, reject) => {
   if (!window.indexedDB) { reject(Error('point-storage-unavailable')); return; }
   const request = window.indexedDB.open('manabi-points-v1:' + (disk.scope ?? mode), 1);
   request.onupgradeneeded = () => request.result.createObjectStore('ledger');
   request.onerror = () => reject(request.error);
   request.onsuccess = () => {
    const db = request.result;
    db.onversionchange = () => { db.close(); database = undefined; };
    resolve(db);
   };
  }).catch(error => { database = undefined; throw error; });
  return database;
 }
 async function transaction(work) {
  const db = await open();
  return new Promise((resolve, reject) => {
   const tx = db.transaction('ledger', 'readwrite');
   const ledger = tx.objectStore('ledger');
   let result, failure;
   const run = callback => {
    try { callback(); } catch (error) { failure = error; tx.abort(); }
   };
   tx.oncomplete = () => resolve(result);
   tx.onabort = () => reject(failure || tx.error || Error('point-storage-aborted'));
   const projection = ledger.get('projection');
   projection.onsuccess = () => run(() => {
    // A committed IDB receipt and its localStorage projection are inseparable.
    // If a tab closed during projection, each entry is either before or after.
    const entries = projection.result || [];
    for (const { key, before, after } of entries) {
     if (![before, after].includes(disk.getItem(key))) throw Error('legacy-wallet-review-required');
    }
    for (const { key, after } of entries) {
     if (disk.getItem(key) === after) continue;
     if (after === null) disk.removeItem(key);
     else disk.setItem(key, after);
    }
    if (entries.length) ledger.delete('projection');
    work?.(ledger, run, value => { result = value; });
   });
  });
 }
 async function persist(work, receipt) {
  await open();
  if (disk.getItem(marker) !== '1') disk.setItem(marker, '1');
  const update = (ledger, run, done) => {
   function stage() {
    const changes = new Map();
    const overlay = {
     getItem: key => changes.has(key) ? changes.get(key) : disk.getItem(key),
     setItem: (key, value) => changes.set(key, String(value)),
     removeItem: key => changes.set(key, null),
    };
    done(work(overlay));
    const entries = [...changes].map(([key, after]) => ({ key, before: disk.getItem(key), after }))
     .filter(entry => entry.before !== entry.after);
    if (entries.length) ledger.put(entries, 'projection');
    if (receipt) ledger.put(1, 'answer:' + receipt);
   }
   if (!receipt) stage();
   else {
    const claim = ledger.get('answer:' + receipt);
    claim.onsuccess = () => run(() => { if (!claim.result) stage(); });
   }
  };
  const result = await transaction(update);
  await transaction();
  return result;
 }
 function locked(work, receipt) {
  const run = () => persist(work, receipt);
  return navigator?.locks?.request ? window.navigator.locks.request(lockName, run) : run();
 }
 function queue(namespace) {
  const prefix = 'mgl_point_pending:' + namespace + ':';
  const sessionKey = key => 'manabi_point_pending:' + (disk.scope ?? mode) + ':' + key;
  const sessions = () => Object.keys(window.sessionStorage || {})
   .filter(key => key.startsWith(sessionKey(prefix)));
  return {
   add(item) {
    const key = prefix + item.id;
    try { if (disk.getItem(key) === null) disk.setItem(key, JSON.stringify(item)); }
    catch { window.sessionStorage.setItem(sessionKey(key), JSON.stringify(item)); }
   },
   list() {
    let saved = [], backup = [];
    try { saved = (disk.keys?.(prefix) || []).map(key => disk.getItem(key)); } catch {}
    try { backup = sessions().map(key => window.sessionStorage.getItem(key)); } catch {}
    return [...saved, ...backup].filter(Boolean).map(raw => JSON.parse(raw));
   },
   remove(id) {
    disk.removeItem(prefix + id);
    window.sessionStorage?.removeItem(sessionKey(prefix + id));
   },
  };
 }
 return { use, locked, nativeLock, queue };
}
return {create,pointFallback};});
