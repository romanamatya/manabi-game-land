import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {gameProgress,collectionProgress} from '../shared-src/site/title-progress-model.js';
import {transformTitleMode,removeElements} from '../tools/title-mode.mjs';
const ctx={window:{}};vm.runInNewContext(fs.readFileSync('shared-src/site/profile-catalog.js','utf8'),ctx);
const catalog=JSON.parse(JSON.stringify(ctx.window.ManabiProfileCatalog));
const storage=raw=>({getItem:key=>raw[key]??null,setItem:()=>assert.fail('collection must be read-only'),removeItem:()=>assert.fail('collection must not remove anything')});
const game=catalog.find(g=>g.id==='parallelPair');
for(const [best,percent] of [[0,0],[3,20],[5,40],[10,60],[15,80],[25,100]])test('five-rank collection '+best,()=>{
 const result=gameProgress(game,storage({mgl_parallelPair:JSON.stringify({best})}));assert.equal(result.percent,percent);assert.equal(result.best,best);assert.equal(result.titles.length,5);
});
test('original four and six ranks are preserved',()=>{
 assert.equal(gameProgress(catalog.find(g=>g.id==='keisan'),storage({mgl_best:'20'})).percent,100);
 const r=gameProgress(catalog.find(g=>g.id==='pref-name'),storage({mq_pref_name:'{"best":10}'}));assert.equal(r.total,6);assert.equal(r.earned,3);assert.equal(r.percent,50);
});
test('only published games contribute; hidden titles survive republishing',()=>{
 const local=storage({mgl_parallelPair:'{"best":25}',mgl_quadrilateral:'{"best":10}'}),states=new Map([['parallelPair','published'],['quadrilateral','hidden']]);
 const rows=catalog.filter(g=>['parallelPair','quadrilateral'].includes(g.id));
 const first=collectionProgress(rows,local,states);assert.deepEqual(first.overall,{earned:5,total:5,percent:100,games:1});assert.equal(first.games.find(g=>g.id==='quadrilateral').earned,3);
 states.set('quadrilateral','published');assert.equal(collectionProgress(rows,local,states).overall.earned,8);
 assert.equal(first.subjects.find(s=>s.id==='science').percent,null);
});
test('legacy best, challenge best, explicit awarded titles and malformed data',()=>{
 assert.equal(gameProgress(game,storage({'manabi_parallel_stage1:v1':'{"best":15}'})).best,15);
 assert.equal(gameProgress(game,storage({'mgl_challenge120_v1:parallelPair':'{"game":"parallelPair","bests":{"season":42}}'})).best,42);
 assert.equal(gameProgress(game,storage({mgl_profile:'{"titles":["parallelPair:3"]}'})).earned,1);
 assert.equal(gameProgress(game,storage({mgl_parallelPair:'broken'})).earned,0);
});
test('registered original artwork exists and text-only titles remain text-only',()=>{
 assert.equal(catalog.filter(game=>!['fractionBasics','fractionTransform'].includes(game.id)).length,18);
 assert.equal(new Set(catalog.map(g=>g.id)).size,catalog.length);
 for(const g of catalog)for(const t of g.titles){if(t.image)assert.ok((fs.existsSync('shared-src/site/'+t.image)||fs.existsSync('preview/'+t.image)),t.image);if(t.textOnly)assert.ok(!t.image);}
});
test('retirement strips rank entry points without removing the title tower or game controls',()=>{
 const html='<main><section class="rank"><div>称号タワー</div></section><section id="line-ranking"><div><button id="ranking-close">閉じる</button></div></section><button id="confirm">決定</button><script src="../parallel-ranking.js?v=old"></script></main>';
 const retired=transformTitleMode('games/verticalParallel.html',html,{rankingsRetired:true},'');
 assert.match(retired,/称号タワー/);assert.match(retired,/id="confirm"/);assert.doesNotMatch(retired,/line-ranking|ranking-close|parallel-ranking.js/);
 assert.equal(transformTitleMode('games/verticalParallel.html',html,{rankingsRetired:false},''),html);
 assert.equal(removeElements('<div><div class="remove"><div>x</div></div><p>safe</p></div>',raw=>raw.includes('class="remove"')),'<div><p>safe</p></div>');
});
test('retired client entry points reject before importing SDKs even if old flags are present',async()=>{
 const api=await import('../shared-src/site/ranking-sync-api.js');
 const previous=globalThis.window;
 globalThis.window={MANABI_BACKEND_CONFIG:{rankingsRetired:true,rankingSyncEnabled:true,missingAlphabetRankingSyncEnabled:true,playerNameSyncEnabled:true,rankingGameIds:['missingAlphabet'],challengeRankingGameIds:['parallelPair'],gameIds:['missingAlphabet']}};
 try{
  for(const client of [api.client,api.missingAlphabetClient,api.challengeRankingClient])await assert.rejects(client(),error=>error.code==='rankings-retired');
 }finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});

test('calculation artwork retains legacy title IDs and contributes to math and overall progress', () => {
 const ids = ['multiplicationProperties', 'shapeExpressions'];
 const rows = catalog.filter(game => ids.includes(game.id));
 const records = storage({
  mgl_multiplicationProperties: '{"best":15}',
  mgl_shapeExpressions: '{"best":5}',
  mgl_profile: '{"titles":["shapeExpressions:25"]}',
 });
 const states = new Map(ids.map(id => [id, 'published']));
 const result = collectionProgress(rows, records, states);
 assert.deepEqual(result.games.map(game => game.percent), [60, 40]);
 assert.deepEqual(result.overall, {earned:5, total:10, percent:50, games:2});
 assert.equal(result.subjects.find(subject => subject.id === 'math').percent, 50);
 for (const game of rows) {
  assert.deepEqual(game.titles.map(title => title.at), [5, 10, 15, 20, 25]);
  for (const title of game.titles) {
   assert.equal(title.id, game.id + ':' + title.at);
   assert.ok(title.standalone && !title.textOnly);
   const bytes = fs.readFileSync(title.image);
   assert.equal(bytes.readUInt32BE(16), 512);
   assert.equal(bytes.readUInt32BE(20), 512);
   assert.equal(bytes[25], 6);
   for (const prefix of ['preview/', 'shared-src/site/']) {
    assert.deepEqual(fs.readFileSync(prefix + title.image), bytes);
   }
  }
 }
});
