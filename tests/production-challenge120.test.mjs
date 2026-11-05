import '../challenge120-core.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const C=globalThis.ManabiChallenge120Core;

test('production 120-second challenge can be enabled for missingAlphabet without changing the global switch',()=>{
 const scoped={challenge120Enabled:false,challenge120GameIds:['missingAlphabet']};
 assert.equal(C.highest.missingAlphabet,20);
 assert.equal(C.enabledForProductionGame(scoped,'production','missingAlphabet'),true);
 assert.equal(C.enabledForProductionGame(scoped,'production','suichoku'),false);
 assert.equal(C.enabledForProductionGame({challenge120Enabled:false},'production','missingAlphabet'),false);
 assert.equal(C.enabledForProductionGame({challenge120Enabled:true},'production','suichoku'),true);
 assert.equal(C.enabledForProductionGame(scoped,'preview','missingAlphabet'),false);
});

test('practice is unlimited until the title threshold, then challenge starts at the threshold',()=>{
 let s=C.fresh('keisan');
 for(let n=1;n<=20;n++){const token=C.issue(s,'p'+n),result=C.answer(s,token,true,n);assert.equal(result.accepted,true);s=result.state;}
 assert.equal(s.phase,'waiting');
 s=C.start(s,100,'attempt-1','season-1');
 assert.equal(s.streak,20);assert.equal(s.attemptBest,20);assert.equal(s.deadline,120100);
 const token=C.issue(s,'challenge-q21');
 s=C.answer(s,token,true,101).state;
 assert.equal(s.streak,21);assert.equal(s.attemptBest,21);
});
test('wrong answer ends challenge, keeps attempt best, and retry restarts at threshold',()=>{
 let s=C.start(C.unlock(C.fresh('distribution'),true),500,'attempt-1','season-1');
 let t=C.issue(s,'q1');s=C.answer(s,t,true,501).state;
 t=C.issue(s,'q2');s=C.answer(s,t,false,502).state;
 assert.equal(s.phase,'ended');assert.equal(s.endReason,'wrong-answer');assert.equal(s.bests['season-1'],26);
 const retry=C.start(s,1000,'attempt-2','season-1');
 assert.equal(retry.streak,25);assert.equal(retry.attemptBest,25);assert.equal(retry.bests['season-1'],26);
});
test('timeout settles the persisted challenge result',()=>{
 let s=C.start(C.unlock(C.fresh('alphabet'),true),1000,'attempt-1','season-1');
 const token=C.issue(s,'q');s=C.answer(s,token,true,1001).state;
 s=C.settle(s,s.deadline);
 assert.equal(s.phase,'ended');assert.equal(s.endReason,'timeout');assert.equal(s.bests['season-1'],27);
});
