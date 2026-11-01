import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CHALLENGE120_CUTOFF_MS,CHALLENGE120_GAME_MINIMUMS,CHALLENGE120_GAMES,CHALLENGE120_PROTOCOL,CHALLENGE120_SEASON,rankChallenge120Rows,validChallenge120Result} from '../challenge120-ranking-model.js';

const result=(overrides={})=>({protocol:CHALLENGE120_PROTOCOL,mode:'challenge120',season:CHALLENGE120_SEASON,game:'keisan',attemptId:'attempt-12345',bestStreak:21,startedAt:CHALLENGE120_CUTOFF_MS+1000,endedAt:CHALLENGE120_CUTOFF_MS+60000,endReason:'wrong-answer',...overrides});

test('cutoff is exactly midnight JST on 2026-11-01 and the separate board covers all 11 production games',()=>{
 assert.equal(CHALLENGE120_CUTOFF_MS,Date.parse('2026-10-31T15:00:00Z'));
 assert.equal(CHALLENGE120_GAMES.length,11);
 assert.deepEqual(new Set(CHALLENGE120_GAMES),new Set(['keisan','pref-name','pref-place','alphabet','distribution','distribution2','exchangeAssociation','kotowaza','multiplicationProperties','shapeExpressions','keisanSummary']));
 assert.ok(Object.values(CHALLENGE120_GAME_MINIMUMS).every(Number.isSafeInteger));
 assert.equal(CHALLENGE120_GAME_MINIMUMS.keisan,20);assert.equal(CHALLENGE120_GAME_MINIMUMS.alphabet,26);assert.equal(CHALLENGE120_GAME_MINIMUMS.keisanSummary,30);
});

test('only a completed post-cutoff protocol-3 challenge run is eligible for publication',()=>{
 assert.equal(validChallenge120Result(result()),true);
 assert.equal(validChallenge120Result(result({bestStreak:19})),false);
 assert.equal(validChallenge120Result(result({startedAt:CHALLENGE120_CUTOFF_MS-1})),false);
 assert.equal(validChallenge120Result(result({protocol:2,updatedAt:CHALLENGE120_CUTOFF_MS+90000})),false);
 assert.equal(validChallenge120Result({game:'keisan',bestStreak:99,updatedAt:CHALLENGE120_CUTOFF_MS+90000}),false);
 assert.equal(validChallenge120Result(result({mode:'practice'})),false);
 assert.equal(validChallenge120Result(result({season:'production-120-v1'})),false);
 assert.equal(validChallenge120Result(result({game:'keisanSummary',bestStreak:30,endReason:'wrong-answer'})),false);
 assert.equal(validChallenge120Result(result({game:'keisanSummary',bestStreak:30,endReason:'timeout'})),true);
 assert.equal(validChallenge120Result(result({endedAt:CHALLENGE120_CUTOFF_MS+151001})),false);
});

test('new board ranks only new challenge rows, ignores old ranking rows, and keeps each player best',()=>{
 const ranked=rankChallenge120Rows([
  {uid:'a',game:'keisan',bestStreak:99,updatedAt:CHALLENGE120_CUTOFF_MS+90000},
  {uid:'a',game:'keisan',bestStreak:25,protocol:3,mode:'challenge120',season:CHALLENGE120_SEASON},
  {uid:'a',game:'keisan',bestStreak:27,protocol:3,mode:'challenge120',season:CHALLENGE120_SEASON},
  {uid:'b',game:'keisan',bestStreak:26,protocol:3,mode:'challenge120',season:CHALLENGE120_SEASON},
  {uid:'c',game:'alphabet',bestStreak:99,protocol:3,mode:'challenge120',season:CHALLENGE120_SEASON},
  {uid:'d',game:'keisan',bestStreak:19,protocol:3,mode:'challenge120',season:CHALLENGE120_SEASON}
 ],'keisan');
 assert.deepEqual(ranked.map(x=>[x.uid,x.bestStreak,x.rank]),[['a',27,1],['b',26,2]]);
});
