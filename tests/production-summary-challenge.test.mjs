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

test('dedicated summary leaderboard candidate is created only by a new timed-out protocol-3 challenge',()=>{
 const start=Date.parse('2026-11-01T00:01:00+09:00');
 const training=T.fresh();training.highestEarned=true;training.phase='waiting';training.best=30;training.streak=30;
 const started=T.start(training,start,'challenge-after-cutoff');
 const ended=T.settle(started,started.challenge.deadline);
 const candidate=T.challenge120Candidate(ended);
 assert.equal(candidate.game,'keisanSummary');assert.equal(candidate.mode,'challenge120');assert.equal(candidate.protocol,3);assert.equal(candidate.bestStreak,30);assert.equal(candidate.startedAt,start);assert.equal(candidate.endReason,'timeout');
 assert.equal(T.challenge120Candidate({...ended,challenge:{...ended.challenge,protocol:2}}),null);
 assert.equal(T.challenge120Candidate({...ended,challenge:{...ended.challenge,season:'keisanSummary-streak-v2'}}),null);
 const beforeCutoff=T.start(training,start-60001,'before-cutoff-run'),beforeEnded=T.settle(beforeCutoff,beforeCutoff.challenge.deadline);assert.equal(T.challenge120Candidate(beforeEnded),null);
 assert.equal(T.challenge120Candidate({...ended,challenge:{...ended.challenge,reason:'clock-change'}}),null);
 assert.equal(T.challenge120Candidate({...ended,phase:'training'}),null);
});
