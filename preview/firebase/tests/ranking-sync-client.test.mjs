import test from 'node:test';
import assert from 'node:assert/strict';

const records=[
 {mode:'challenge120',season:'preview-120-v1',game:'kakudo',best:25},
 {mode:'challenge120',season:'old-season',game:'kakudo',best:80},
 {mode:'challenge120',season:'preview-120-v1',game:'keisan',best:50},
 {mode:'regular',season:'preview-120-v1',game:'kakudo',best:40}
];
globalThis.window={MANABI_BACKEND_CONFIG:{mode:'preview',rankingGameIds:['kakudo'],gameIds:['kakudo']},MANABI_SPARK_CONFIG:{mode:'preview',rankingGameIds:['kakudo'],gameIds:['kakudo']},manabiStorage:{getItem:key=>key==='mgl_challenge120_local_board_v1'?JSON.stringify(records):null}};
const {challengeRows}=await import('../../../shared-src/site/ranking-sync-client.js?challenge-season-test');
test('only completed Kakudo challenges in the active preview season are eligible for sharing',()=>{
 assert.deepEqual(JSON.parse(JSON.stringify(challengeRows('kakudo'))),[records[0]]);
 assert.deepEqual(challengeRows('keisan'),[records[2]]);
});
