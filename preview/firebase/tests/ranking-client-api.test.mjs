import test from 'node:test';
import assert from 'node:assert/strict';

const config={mode:'preview',enabled:true,environment:'previewSpark/v1',expectedProjectId:'manabi-game-landcheck',firebase:{projectId:'manabi-game-landcheck',authDomain:'manabi-game-landcheck.firebaseapp.com',apiKey:'test',appId:'test'}};
globalThis.window={MANABI_SPARK_CONFIG:config};
globalThis.location={pathname:'/preview/ranking.html'};
const {createPlayerClient}=await import('../../player-sync-api.js?api-test');

function fixture(){
 const docs=new Map(),db={};let uid='child-a';
 const ref=path=>({path});
 const A={browserLocalPersistence:{},getAuth:()=>({get uid(){return uid},get isAnonymous(){return true},authStateReady:async()=>{}}),setPersistence:async()=>{},signInAnonymously:async auth=>{auth.currentUser={uid,isAnonymous:true};return auth.currentUser}};
 const App={getApps:()=>[],initializeApp:(options)=>({options})};
 const F={getFirestore:()=>db,doc:(_db,...parts)=>ref(parts.join('/')),collection:(_db,...parts)=>ref(parts.join('/')),orderBy:(field,direction)=>({field,direction}),limit:n=>({n}),query:(collection,order,lim)=>({collection,order,lim}),serverTimestamp:()=>({serverTime:true}),runTransaction:async(_db,callback)=>{
  const writes=[];const tx={get:async r=>{const data=docs.get(r.path);return {exists:()=>data!==undefined,data:()=>data}},set:(r,data)=>writes.push([r.path,data])};
  const result=await callback(tx);for(const [path,data] of writes)docs.set(path,data);return result;
 },getDocsFromServer:async q=>{const prefix=q.collection.path+'/';const rows=[...docs].filter(([path])=>path.startsWith(prefix)).map(([path,data])=>({id:path.slice(prefix.length),data:()=>data})).sort((a,b)=>b.data().bestStreak-a.data().bestStreak).slice(0,q.lim.n);return {docs:rows}}};
 return {App,A,F,docs,setUid:value=>{uid=value}};
}

test('player API publishes only the public projection, preserves best, and reads other students',async()=>{
 const f=fixture(),childA=await createPlayerClient(config,[f.App,f.A,f.F]);
 await childA.publishRanking({game:'keisan',bestStreak:18,nickname:'そら',icon:'cat',frame:'plain',title:'計算の達人',badge:'keisan:20',points:999,owned:['private-item']});
 f.setUid('child-b');const childB=await createPlayerClient(config,[f.App,f.A,f.F]);
 await childB.publishRanking({game:'keisan',bestStreak:12,nickname:'はな',icon:'fox',frame:'blue',title:null,badge:null});
 const aPath='previewSpark/v1/rankings/keisan/players/child-a',aData=f.docs.get(aPath);
 assert.equal(aData.bestStreak,18);
 assert.deepEqual(Object.keys(aData).sort(),['uid','game','nickname','bestStreak','icon','frame','title','badge','updatedAt'].sort());
 await childA.publishRanking({game:'keisan',bestStreak:8,nickname:'そら',icon:'cat',frame:'plain',title:'計算の達人',badge:'keisan:20'});
 assert.equal(f.docs.get(aPath).bestStreak,18);
 const rows=await childB.rankings('keisan');
 assert.deepEqual(rows.map(r=>[r.uid,r.bestStreak]),[['child-a',18],['child-b',12]]);
});
