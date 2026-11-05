import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GAME_IDS,BATCH_GAME_IDS,checkedInput,policyFor} from '../shared-src/site/management-model.js';
import {GAME_FIELDS} from '../shared-src/site/data-contract.js';
import {backendConfig,validateEnvironment} from '../tools/site-environment.mjs';

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
 assert.notEqual(production.missingAlphabetRankingSyncEnabled,true);
 assert.notEqual(production.challenge120Enabled,true);
 assert.ok(!(production.challenge120GameIds||[]).includes('missingAlphabet'));
 assert.ok(!production.gameIds.includes('missingAlphabet'));
 assert.ok(!production.rankingGameIds.includes('missingAlphabet'));
});

test('the approved missing-alphabet sync gate is isolated from global ranking and player-name sync',()=>{
 const production=JSON.parse(text('../environments/production.json'));
 const scoped={...production,productionReleaseApproved:true,productionAuthVerified:true,productionRulesApproved:true,gameIds:[...production.gameIds,'missingAlphabet'],rankingGameIds:[...production.rankingGameIds,'missingAlphabet'],missingAlphabetRankingSyncEnabled:true,challenge120Enabled:false,challenge120GameIds:['missingAlphabet']};
 const backend=backendConfig(validateEnvironment(scoped));
 assert.equal(backend.missingAlphabetRankingSyncEnabled,true);
 assert.equal(backend.rankingSyncEnabled,false);assert.equal(backend.playerNameSyncEnabled,false);assert.equal(backend.playerSyncEnabled,false);
 assert.equal(backend.challenge120Enabled,false);assert.deepEqual(backend.challenge120GameIds,['missingAlphabet']);
 assert.throws(()=>validateEnvironment({...scoped,rankingSyncEnabled:true}),/missing-alphabet-ranking-not-allowed/);
 assert.throws(()=>validateEnvironment({...scoped,playerNameSyncEnabled:true}),/missing-alphabet-ranking-not-allowed/);
 assert.throws(()=>validateEnvironment({...scoped,challenge120Enabled:true}),/invalid-challenge-game-settings/);
 assert.throws(()=>validateEnvironment({...scoped,challenge120GameIds:['suichoku']}),/invalid-challenge-game-settings/);
 assert.throws(()=>validateEnvironment({...scoped,rankingGameIds:production.rankingGameIds}),/missing-alphabet-ranking-not-allowed/);
 assert.throws(()=>validateEnvironment({...scoped,environment:'preview',challenge120GameIds:[],projectId:'manabi-game-landcheck',firebase:{...scoped.firebase,projectId:'manabi-game-landcheck',authDomain:'manabi-game-landcheck.firebaseapp.com'}}),/missing-alphabet-ranking-not-allowed/);
 const generic= text('../ranking-sync-client.js');
 assert.ok(generic.includes('config?.rankingSyncEnabled!==true'));
 assert.doesNotMatch(generic,/missingAlphabet/);
 const dedicated=text('../shared-src/site/missing-alphabet-ranking-sync.js');
 assert.ok(dedicated.includes("config?.mode==='production'&&config.missingAlphabetRankingSyncEnabled===true"));
 assert.doesNotMatch(dedicated,/config\.rankingSyncEnabled===true|config\.playerNameSyncEnabled===true/);
 assert.ok(text('../shared-src/site/ranking-page.js').includes('config?.missingAlphabetRankingSyncEnabled!==true'));
 assert.ok(text('../shared-src/site/home-data.js').includes('MANABI_BACKEND_CONFIG?.missingAlphabetRankingSyncEnabled===true'));
});
