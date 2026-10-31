import '../keisan-summary-state.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const T=globalThis.ManabiSummaryState;
test('summary challenge starts at its existing highest-title threshold and preserves the attempt best',()=>{
 const training=T.fresh();training.highestEarned=true;training.phase='waiting';training.best=30;training.streak=30;
 let s=T.start(training,100,'attempt-1');
 assert.equal(s.streak,30);assert.equal(s.challenge.best,30);assert.equal(s.challenge.deadline,120100);
 s.current={token:'q31',stage:0,answered:false};
 const result=T.answer(s,{token:'q31',stage:0,correct:true,final:true},101);
 assert.equal(result.state.streak,31);assert.equal(result.state.challenge.best,31);assert.equal(result.state.best,31);
 const retry=T.start({...result.state,phase:'ended'},200,'attempt-2');
 assert.equal(retry.streak,30);assert.equal(retry.challenge.best,30);
});
