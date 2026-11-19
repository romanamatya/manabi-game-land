import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {validateRegistration,registrationPlan} from '../tools/game-registration.mjs';
const registry=JSON.parse(fs.readFileSync('config/game-registration.json','utf8'));
const mutate=fn=>{const value=structuredClone(registry);fn(value);return value;};
test('one registration produces matching catalog, units, economy, personal records and admin IDs',()=>{
 for(const channel of ['preview','production']){
  const plan=registrationPlan(registry,channel);assert.equal(plan.gameIds.length,18);assert.deepEqual(plan.bestRecords.parallelPair.legacyKeys,['manabi_parallel_stage1:v1']);assert.deepEqual(plan.managementGameIds,plan.gameIds);
  for(const game of plan.catalog){assert.ok(plan.units[game.subject][game.unit].includes(game.id));assert.equal(plan.economy[game.id].subject,game.subject);assert.equal(plan.economy[game.id].dailyCap,50);assert.ok(plan.bestRecords[game.id]);assert.equal(plan.highestTitles[game.id],game.titles.at(-1).at);}
 }
});
test('original titles, assets and thresholds remain byte-for-byte metadata equivalent',()=>{
 const context={window:{}};vm.runInNewContext(fs.readFileSync('shared-src/site/profile-catalog.js','utf8'),context);
 for(const old of context.window.ManabiProfileCatalog){const game=registry.games.find(g=>g.id===old.id);assert.equal(game.name,old.name);assert.equal(JSON.stringify(game.titles),JSON.stringify(old.titles));}
});
test('preview-only new game never changes production NEW or production registration',()=>{
 const next=mutate(r=>r.games.push({...r.games[0],id:'testNewGame',field:'testNewGameBestStreak',entry:'games/testNewGame.html',titles:r.games[0].titles.map(t=>({...t,id:'testNewGame:'+t.at})),release:{preview:true,production:false}}));
 assert.ok(registrationPlan(next,'preview').gameIds.includes('testNewGame'));assert.ok(!registrationPlan(next,'production').gameIds.includes('testNewGame'));
 assert.equal(registrationPlan(next,'preview').latestPublishedGameId,registry.latestPublishedGameId);
 assert.throws(()=>validateRegistration({...next,latestPublishedGameId:'testNewGame'}),/production-released/);
});
test('duplicate IDs, wrong point policies, title changes and unsafe routes are rejected',()=>{
 for(const value of [mutate(r=>r.games.push(r.games[0])),mutate(r=>r.games[0].dailyPointCap=100),mutate(r=>r.games[0].correctPoints=2),mutate(r=>r.games[0].entry='../admin.html'),mutate(r=>r.games[0].titles[1].at=2),mutate(r=>r.games[0].titles[0].image='assets/../private.png')])assert.throws(()=>validateRegistration(value));
});
