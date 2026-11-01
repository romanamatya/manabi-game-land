import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bestSharedScore} from '../ranking-sync-shared-score.js';

test('shared per-game score includes the best practice or 120-second challenge result',()=>{
 assert.equal(bestSharedScore({best:18},{bests:{'production-120-v1':27},attemptBest:21}),27);
 assert.equal(bestSharedScore({best:32},{bests:{'production-120-v1':27},attemptBest:21}),32);
});

test('old challenge seasons and unfinished attempts can never lower the shared best',()=>{
 assert.equal(bestSharedScore({best:10},{bests:{old:40,current:25},attemptBest:33}),40);
 assert.equal(bestSharedScore(null,{bests:{old:0},attemptBest:0}),0);
});
