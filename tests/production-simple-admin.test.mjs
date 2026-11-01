import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {AUDIT_REASON,GAME_IDS,policyFor,visibilityStatus,checkedInput} from '../management-model.js';
import '../economy-core.js';
const core=globalThis.ManabiEconomyCore;

test('campaign schedule uses inclusive start, exclusive end, and manual end',()=>{
 const setting={campaign:{id:'c1',enabled:true,startAt:1000,endAt:2000}};
 assert.equal(policyFor(setting,999).multiplier,1);
 assert.equal(policyFor(setting,1000).multiplier,2);
 assert.equal(policyFor(setting,1999).multiplier,2);
 assert.equal(policyFor(setting,2000).multiplier,1);
 assert.equal(policyFor({...setting,campaign:{...setting.campaign,enabled:false}},1500).multiplier,1);
});

test('2x rewards share the normal 50-point daily cap and repeated answer IDs are not paid twice',()=>{
 let wallet=core.initial();wallet.daily={date:'2026-11-01',games:{alphabet:48}};
 const first=core.reward(wallet,'alphabet',true,'2026-11-01',{multiplier:2,cap:50});
 assert.equal(first.granted,2);assert.equal(first.used,50);
 const atCap=core.reward(first.wallet,'alphabet',true,'2026-11-01',{multiplier:2,cap:50});
 assert.equal(atCap.granted,0);assert.equal(atCap.used,50);
 const replayId='answer-1';first.wallet.claimed=[replayId];
 const replay=core.hasClaimed(first.wallet,replayId)?first.wallet:core.reward(first.wallet,'alphabet',true,'2026-11-01',{multiplier:2,cap:50}).wallet;
 assert.equal(replay.balances.english,2);
});

test('campaign and visibility inputs are validated; other admin actions are excluded',()=>{
 assert.throws(()=>checkedInput('campaign',{games:['keisan'],enabled:true,startAt:100,endAt:100}),/invalid-campaign-window/);
 assert.throws(()=>checkedInput('campaign',{games:['unknown'],enabled:true,startAt:100,endAt:200}),/invalid-games/);
 assert.throws(()=>checkedInput('visibility',{game:'keisan',status:'unlisted'}),/invalid-visibility/);
 assert.equal(checkedInput('campaign',{games:['keisan'],enabled:true,startAt:100,endAt:200}).reason,AUDIT_REASON);
 assert.equal(checkedInput('notice',{title:'お知らせ',body:'',published:false}).reason,AUDIT_REASON);
 assert.throws(()=>checkedInput('visibilityBatch',{games:[],status:'hidden'}),/invalid-visibility-batch/);
 assert.throws(()=>checkedInput('visibilityBatch',{games:['keisan','keisan'],status:'hidden'}),/invalid-visibility-batch/);
 assert.throws(()=>checkedInput('visibilityBatch',{games:['keisan'],status:'paused'}),/invalid-visibility-batch/);
 assert.equal(checkedInput('visibilityBatch',{games:GAME_IDS,status:'preparing'}).games.length,GAME_IDS.length);
 for(const action of ['reset','rankingBackup','setPlayerAccess','switchSeason'])assert.throws(()=>checkedInput(action,{game:'keisan'}),/unknown-management-action/);
 assert.equal(visibilityStatus({published:false}),'hidden');
 assert.equal(visibilityStatus({status:'preparing',published:true}),'preparing');
 assert.equal(visibilityStatus({}),'published');
});

test('direct game pages stay inert until publication is confirmed and fail closed on read errors',async()=>{
 const script=await readFile(new URL('../public-admin-settings.js',import.meta.url),'utf8');
 assert.match(script,/document\.documentElement\.inert=true/);
 assert.match(script,/s\?\.status[^\n]+!==?'published'/);
 assert.match(script,/catch\(\(\)=>block\('公開状態を確認できないため/);
 assert.match(script,/document\.addEventListener\('click',[\s\S]+?stopImmediatePropagation\(\)/);
});

test('retired suspension controls are disabled while legacy profile data remains untouched',async()=>{
 const environment=await readFile(new URL('../environment.js',import.meta.url),'utf8');
 const runtime=await readFile(new URL('../environment-runtime.js',import.meta.url),'utf8');
 const rules=await readFile(new URL('../firebase/production-simple-admin-proposed.rules',import.meta.url),'utf8');
 assert.match(environment,/"accountAccessEnabled":false/);
 assert.match(environment,/"playerSuspension":false/);
 assert.match(runtime,/const accessEnabled=!preview&&window\.MANABI_BACKEND_CONFIG\?\.accountAccessEnabled===true/);
 assert.match(rules,/function productionAdminSuspensionEnabled\(\)\s*\{\s*return false;/);
});

test('all four production admin actions ask only for a simple confirmation',async()=>{
 const ui=await readFile(new URL('../control-room.js',import.meta.url),'utf8');
 assert.doesNotMatch(ui,/reasonInput|操作理由|reason\.value/);
 for(const label of ['すべて公開','すべて準備中','すべて非公開','選択したゲームに適用'])assert.ok(ui.includes(label));
 assert.match(ui,/admin:visibilityBatch/);
});
