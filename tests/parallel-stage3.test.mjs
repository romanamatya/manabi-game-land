import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createParallelRankingSync,parallelRankingEnabled} from '../shared-src/site/parallel-ranking.js';
import {createProductionRankingClient,bestForSharedRanking} from '../ranking-sync-api.js';
function harness({shared=false,old=null}={}){
 let wall=1_800_000_000_000,mono=0,id=0;const values=new Map([['mgl_points','123'],['mgl_profile','{"icon":"cat","frame":"plain","owned":["keep"]}'],['mgl_other','{"best":88}']]);if(old)values.set('manabi_parallel_stage1:v1',JSON.stringify(old));
 class Clock extends Date{static now(){return wall}}
 const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
 const window={crypto:{randomUUID:()=>String(++id)},performance:{now:()=>mono}},ctx=vm.createContext({window,globalThis:window,localStorage:storage,navigator:{},structuredClone,Date:Clock,Math,Map,Set,Number,JSON});
 const run=name=>vm.runInContext(fs.readFileSync(new URL('../shared-src/site/'+name,import.meta.url),'utf8'),ctx);
 for(const file of ['parallel-model.js','economy-core.js','storage-adapters.js','challenge120-core.js'])run(file);
 const core=window.ManabiEconomyCore;if(shared){const w=core.initial();w.balances.math=123;w.balances.science=19;w.owned=['frame-03'];w.legacyMirror={math:123};storage.setItem('mgl_economy_v1',JSON.stringify(w))}const store=window.ManabiStorageAdapters.create(storage,core,'production'),calls=[];
 if(shared)window.ManabiEconomy={snapshot:store.snapshot,balance:()=>store.snapshot().balances.math,begin:(game,prompt)=>({game,prompt,id:String(++id),answered:false}),answer:async(c,value)=>{calls.push(c);assert.equal(c.__mglCelebrationHandled,true);assert.deepEqual(JSON.parse(JSON.stringify(c.policy)),{multiplier:1,cap:50});const q=core.canonicalPrompt(c.game,c.prompt),w=store.snapshot(),next=core.reward(w,c.game,core.correct(c.game,q,value),core.dayKey(),c.policy).wallet;next.claimed=[...(w.claimed||[]),c.id].slice(-128);store.commit(next)}};
 run('parallel-local.js');const q=window.ManabiParallel.buildQuestion(),pair=window.ManabiParallel.inspect(q.lines).pairs[0];
 return {get api(){return window.ManabiParallelLocal},q,pair,values,window,ctx,calls,storage,core,advance(ms,{wallOnly=false}={}){wall+=ms;if(!wallOnly)mono+=ms},reload(){run('parallel-local.js')},answer:async function(ok=true,context){return this.api.answer(context||this.api.begin('parallelPair',q),{selection:ok?pair:[]})}};
}
async function unlock(h){for(let n=0;n<25;n++)await h.answer();assert.equal(h.api.read().challenge.phase,'waiting');assert.equal(h.api.read().best,25)}
test('25 earns title then gates training; waiting has no deadline, explicit start has exactly 120s',async()=>{
 const h=harness();await unlock(h);assert.equal(h.api.canPlay(),false);assert.equal(h.api.read().titles.length,5);const c=h.api.begin('parallelPair',h.q);assert.equal(c.__mglCelebrationHandled,true,'manual title rendering must not be overwritten by the common auto-correct wrapper');assert.equal(await h.answer(true,c),false);assert.equal(c.accepted,false);
 h.advance(3_600_000);assert.equal(h.api.read().challenge.phase,'waiting');assert.equal(h.api.read().challenge.deadline,null);
 await h.api.start();const state=h.api.read();assert.equal(state.streak,25);assert.equal(state.challenge.deadline-state.challenge.startedAt,120000);
 h.advance(119999);assert.equal(h.api.canPlay(),true);const late=h.api.begin('parallelPair',h.q),points=h.api.balance();h.advance(1);assert.equal(await h.answer(true,late),false);assert.equal(late.accepted,false);assert.equal(h.api.balance(),points);assert.equal(h.api.read().challenge.endReason,'timeout');
});
test('wrong ends attempt, stale answers cannot enter a retry, reload and closed-page elapsed time preserve best',async()=>{
 const h=harness();await unlock(h);await h.api.start();await h.answer();assert.equal(h.api.read().best,26);const stale=h.api.begin('parallelPair',h.q);await h.answer(false);assert.equal(h.api.read().challenge.endReason,'wrong-answer');assert.equal(h.api.read().streak,0);assert.equal(h.api.read().best,26);
 await h.api.start();assert.equal(await h.answer(true,stale),false);await h.answer();h.reload();assert.equal(h.api.read().challenge.phase,'running');h.advance(120001);h.reload();assert.equal(h.api.read().challenge.phase,'ended');assert.equal(h.api.read().best,26);assert.equal(h.api.read().titles.length,5);
});
test('clock rollback ends safely; old records migrate without losing wallet/titles or other data',async()=>{
 const first=harness();await unlock(first);const legacy=first.api.read();delete legacy.challenge;legacy.best=31;legacy.streak=4;
 const h=harness({old:legacy});assert.equal(h.api.read().challenge.phase,'waiting');assert.equal(h.api.read().best,31);assert.equal(h.api.balance(),25);await h.api.start();h.advance(-5000,{wallOnly:true});assert.equal(h.api.read().challenge.endReason,'clock-change');assert.equal(h.values.get('mgl_other'),'{"best":88}');assert.equal(h.values.get('mgl_points'),'123');
});
test('shared wallet receives exactly 1pt per accepted answer, caps at 50, retains possessions and replays canonical geometry without model',async()=>{
 const h=harness({shared:true});await unlock(h);await h.api.start();for(let i=0;i<150;i++)await h.answer();assert.equal(h.api.balance(),173);assert.equal(h.values.get('mgl_points'),'173');assert.equal(h.api.wallet().daily.games.parallelPair,50);assert.deepEqual(Array.from(h.api.wallet().owned),['frame-03']);assert.equal(h.api.wallet().balances.science,19);assert.equal(h.api.read().claims.length,128);assert.equal(h.api.read().challenge.claimed.length,128);
 assert.equal(h.values.get('mgl_profile'),'{"icon":"cat","frame":"plain","owned":["keep"]}');assert.equal(h.values.get('mgl_other'),'{"best":88}');assert.equal(h.api.read().wallet.balances.math,0,'old standalone wallet is retained, not silently merged');
 delete h.window.ManabiParallel;const canonical=h.core.canonicalPrompt('parallelPair',h.q);assert.equal(h.core.correct('parallelPair',canonical,{selection:h.pair}),true);assert.equal(h.core.correct('parallelPair',canonical,{selection:[]}),false);const broken=structuredClone(h.q);broken.lines[0].end.x+=1;try{h.core.canonicalPrompt('parallelPair',broken)}catch(e){assert.match(e.message,/invalid-question/)}
 assert.equal(h.api.read().history,undefined);const before=h.api.balance();h.advance(120000);await h.answer();assert.equal(h.api.balance(),before);
});
const config={mode:'production',expectedProjectId:'manabi-game-land',rankingSyncEnabled:true,parallelPairRankingEnabled:true,rankingGameIds:['parallelPair','keisan'],firebase:{projectId:'manabi-game-land'}};
function rankingHarness(){const docs=new Map([['productionRankings/v1/games/keisan/players/other',{uid:'other',game:'keisan',bestStreak:99}]]),apps=[],auth={currentUser:{uid:'pupil',isAnonymous:true},authStateReady:async()=>{}};let writes=0;
 const App={getApps:()=>apps,initializeApp:(options,name)=>{const a={options,name};apps.push(a);return a}},A={getAuth:()=>auth,setPersistence:async()=>{},browserLocalPersistence:{}};
 const F={getFirestore:()=>({}),doc:(_db,...p)=>({path:p.join('/')}),collection:(_db,...p)=>({path:p.join('/')}),runTransaction:async(_db,fn)=>fn({get:async ref=>({exists:()=>docs.has(ref.path),data:()=>docs.get(ref.path)}),set:(ref,v)=>{writes++;docs.set(ref.path,v)}}),serverTimestamp:()=>1,query:(c,...args)=>({c,args}),orderBy:()=>null,limit:()=>null,getDocsFromServer:async q=>({docs:[...docs].filter(([p])=>p.startsWith(q.c.path+'/')).map(([p,row])=>({id:p.split('/').at(-1),data:()=>row}))})};return {docs,sdk:[App,A,F],get writes(){return writes}}}
test('one UID/game row unifies practice and challenge, retries offline, and never writes another game or profile',async()=>{
 const h=rankingHarness(),underlying=await createProductionRankingClient(config,h.sdk),api={...underlying,getExistingPlayerLink:async()=>'管理された名前'},values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};let best=3,online=false;
 const sync=createParallelRankingSync({api,storage,record:()=>({best}),titles:[{at:3,name:'平行みならい'},{at:25,name:'平行の王者'}],online:()=>online});await sync.flush();assert.equal(h.writes,0);online=true;await Promise.all([sync.flush(),sync.flush(),sync.flush()]);assert.equal(h.writes,1);best=27;await sync.flush();await sync.flush();const rows=await sync.rows();assert.equal(rows.length,1);assert.equal(rows[0].bestStreak,27);assert.equal(rows[0].nickname,'管理された名前');assert.equal(h.writes,2);best=10;await sync.flush();assert.equal(h.writes,2);assert.equal(h.docs.get('productionRankings/v1/games/keisan/players/other').bestStreak,99);assert.equal([...h.docs.keys()].filter(k=>k.includes('/parallelPair/')).length,1);assert.ok(![...h.docs.keys()].some(k=>k.startsWith('players/')));assert.equal(bestForSharedRanking('parallelPair',{best:8},{attemptBest:27,bests:{a:26}}),27);
});
test('separate explicit gate is required; existing default ranking games do not gain parallel automatically',async()=>{
 const env={preview:false,expectedProjectId:'manabi-game-land'};assert.equal(parallelRankingEnabled({...config,playerNameSyncEnabled:true},env),true);for(const c of [{...config,parallelPairRankingEnabled:false},{...config,rankingSyncEnabled:false},{...config,playerNameSyncEnabled:false},{...config,rankingGameIds:['keisan']}])assert.equal(parallelRankingEnabled(c,env),false);
 const h=rankingHarness();for(const c of [{...config,parallelPairRankingEnabled:false},{...config,rankingGameIds:undefined}]){const api=await createProductionRankingClient(c,h.sdk);await assert.rejects(api.rankings('parallelPair'),/invalid-ranking-game/)}
});
