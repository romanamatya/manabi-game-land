import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProductionRankingClient} from '../ranking-sync-api.js';

const config={mode:'production',expectedProjectId:'manabi-game-land',rankingSyncEnabled:true,rankingGameIds:['keisan','distribution','keisanSummary'],firebase:{projectId:'manabi-game-land'}};
const docs=new Map(),apps=[],authByName=new Map();
const App={getApps:()=>apps,initializeApp:(options,name)=>{const app={name,options};apps.push(app);return app;}};
const A={getAuth:app=>{if(!authByName.has(app.name))authByName.set(app.name,{currentUser:null,authStateReady:async()=>{}});return authByName.get(app.name);},setPersistence:async()=>{},browserLocalPersistence:{},signInAnonymously:async auth=>{auth.currentUser={uid:'student-a',isAnonymous:true};return {user:auth.currentUser};}};
const F={
 getFirestore:()=>({}),
 doc:(db,...parts)=>({path:parts.join('/')}),
 collection:(db,...parts)=>({path:parts.join('/')}),
 runTransaction:async(db,fn)=>fn({get:async ref=>({exists:()=>docs.has(ref.path),data:()=>structuredClone(docs.get(ref.path))}),set:(ref,value)=>docs.set(ref.path,structuredClone(value))}),
 serverTimestamp:()=>({serverTimestamp:true}),
 orderBy:(field,direction)=>({field,direction}),limit:count=>({count}),
 query:(collection,...clauses)=>({collection,clauses}),
 getDocsFromServer:async q=>{const lim=q.clauses.find(x=>x.count)?.count||100;const rows=[...docs.entries()].filter(([path])=>path.startsWith(q.collection.path+'/')).map(([path,row])=>({id:path.split('/').at(-1),data:()=>structuredClone(row)})).sort((a,b)=>b.data().bestStreak-a.data().bestStreak).slice(0,lim);return {docs:rows};}
};
const sdk=[App,A,F];
function profile(game,bestStreak,nickname='そら'){return {game,bestStreak,nickname,icon:'cat',frame:'plain',title:'計算名人',badge:'keisan:10'}}

test('rejects a preview Firebase configuration',async()=>{await assert.rejects(createProductionRankingClient({...config,expectedProjectId:'manabi-game-landcheck',firebase:{projectId:'manabi-game-landcheck'}},sdk),/production-ranking-config-rejected/);});
test('uses a production-only path and shares sanitized rankings across identities',async()=>{
 docs.clear();authByName.clear();apps.length=0;
 const a=await createProductionRankingClient(config,sdk);
 assert.equal(a.uid,'student-a');
 await a.publishRanking(profile('keisan',24));
 authByName.get('manabi-production-ranking-v1').currentUser={uid:'student-b',isAnonymous:true};
 const b=await createProductionRankingClient(config,sdk);
 await b.publishRanking(profile('keisan',18,'あおい'));
 const rows=await b.rankings('keisan');
 assert.deepEqual(rows.map(x=>x.uid),['student-a','student-b']);
 assert.equal(rows[0].bestStreak,24);
 assert.deepEqual(Object.keys(rows[0]).sort(),['uid','game','nickname','bestStreak','icon','frame','title','badge','updatedAt'].sort());
 assert.equal(Object.hasOwn(rows[0],'points'),false);
 assert.ok([...docs.keys()].every(path=>path.startsWith('productionRankings/v1/games/')));
});
test('keeps best score monotonic while allowing display metadata to change',async()=>{
 docs.clear();authByName.clear();apps.length=0;
 const a=await createProductionRankingClient(config,sdk);
 const first=await a.publishRanking(profile('distribution',31));
 const next=await a.publishRanking({...profile('distribution',16,'そら'),frame:'star',title:'分配の見習い'});
 assert.equal(first.bestStreak,31);
 assert.equal(next.bestStreak,31);
 assert.equal(next.frame,'star');
 assert.equal(next.title,'計算名人');
});
test('rejects invalid game IDs, names, and private data',async()=>{
 docs.clear();authByName.clear();apps.length=0;
 const a=await createProductionRankingClient(config,sdk);
 await assert.rejects(a.publishRanking(profile('other',20)),/invalid-ranking/);
 await assert.rejects(a.publishRanking({...profile('keisan',20),nickname:'<bad>'}),/invalid-ranking/);
 await assert.rejects(a.publishRanking({...profile('keisan',20),points:999}),/invalid-ranking/);
});
