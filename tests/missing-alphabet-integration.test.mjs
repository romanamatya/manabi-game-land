import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GAME_IDS,BATCH_GAME_IDS,checkedInput,policyFor} from '../shared-src/site/management-model.js';
import {GAME_FIELDS} from '../shared-src/site/data-contract.js';

const text=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');

test('the page keeps a separate game ID, common silent effects, and the preview-only challenge path',()=>{
 const page=text('../shared-src/site/games/missingAlphabet.html');
 assert.match(page,/data-score-game="missingAlphabet"/);
 assert.match(page,/missing-alphabet-ranking-sync\.js/);
 assert.match(page,/challenge120-runtime\.js/);
 assert.doesNotMatch(page,/<audio\b|<video\b|AudioContext|\.play\(\)/i);
 assert.equal(GAME_FIELDS.missingAlphabet,'missingAlphabetBestStreak');
});

test('campaign and individual availability include the game while multi-game batches retain the 11-game limit',()=>{
 assert.ok(GAME_IDS.includes('missingAlphabet'));
 assert.ok(!BATCH_GAME_IDS.includes('missingAlphabet'));
 assert.equal(checkedInput('visibility',{game:'missingAlphabet',status:'published'}).game,'missingAlphabet');
 assert.equal(checkedInput('campaign',{games:['missingAlphabet'],enabled:true,startAt:1000,endAt:2000}).games[0],'missingAlphabet');
 assert.throws(()=>checkedInput('visibilityBatch',{games:['missingAlphabet'],status:'published'}),/invalid-visibility-batch/);
 assert.deepEqual(policyFor({campaign:{id:'camp',enabled:true,startAt:1000,endAt:2000}},1500),{multiplier:2,cap:50,campaignId:'camp'});
});

test('production does not list or enable the new game before an approved release',()=>{
 const production=JSON.parse(text('../environments/production.json'));
 assert.equal(production.productionReleaseApproved,false);
 assert.equal(production.rankingSyncEnabled,false);
 assert.equal(production.playerNameSyncEnabled,false);
 assert.ok(!production.gameIds.includes('missingAlphabet'));
 assert.ok(!production.rankingGameIds.includes('missingAlphabet'));
});

