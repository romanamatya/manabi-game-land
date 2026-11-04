import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {GAME_FIELDS,normalizePlayer,contractFor} from '../shared-src/site/data-contract.js';
function loadGlobal(path,name){const scope={structuredClone};vm.runInNewContext(fs.readFileSync(new URL(path,import.meta.url),'utf8'),scope);return scope[name]}
const model=loadGlobal('../shared-src/site/missing-alphabet-model.js','MissingAlphabetModel');
function random(seed=90210){let value=seed>>>0;return()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296}}

test('questions cover cases and blank positions with no immediate repeated pattern',()=>{
 const rng=random(),history=[],cases={upper:0,lower:0},gaps=[0,0,0,0],starts=new Set(),correctSlots=[0,0,0,0];let previous=null;
 for(let i=0;i<1200;i++){
  const q=model.createQuestion(rng,history);assert.equal(model.canonicalPrompt(q).answer,q.answer);assert.notEqual(q.id,previous);previous=q.id;
  cases[q.lower?'lower':'upper']++;gaps[q.missingIndex]++;starts.add(`${q.lower?'l':'u'}:${q.start}`);correctSlots[q.correctIndex]++;
  assert.equal(q.sequence.filter(x=>x==='□').length,1);assert.equal(q.choices.length,4);assert.equal(new Set(q.choices).size,4);
  assert.equal(q.choices.filter(x=>x===q.answer).length,1);assert.equal(model.correct(q,{choice:q.answer}),true);
  assert.equal(q.choices.every(x=>/^[a-z]$/.test(x)===q.lower),true);
  history.push({lower:q.lower,start:q.start,missingIndex:q.missingIndex});if(history.length>32)history.shift();
 }
 assert.ok(Math.abs(cases.upper-cases.lower)<20);assert.ok(gaps.every(n=>n>250&&n<350));assert.equal(starts.size,46);
 assert.ok(correctSlots.filter(n=>n>0).length>=3);
});

test('canonical prompt rejects mixed case, distant answers, duplicate options and malformed indexes',()=>{
 const q=model.createQuestion(random());
 assert.throws(()=>model.canonicalPrompt({...q,sequence:['A','b','C','□']}),/invalid-question/);
 assert.throws(()=>model.canonicalPrompt({...q,choices:[q.answer,q.answer,q.choices[2],q.choices[3]]}),/invalid-question/);
 assert.throws(()=>model.canonicalPrompt({...q,missingIndex:4}),/invalid-question/);
 const far={...q,choices:[q.answer,...(q.lower?'azb':'AZB')],correctIndex:0};
 assert.throws(()=>model.canonicalPrompt(far),/invalid-question/);
});

test('history limits repeats, and edge letters use only valid choices',()=>{
 const rng=random(4);let history=[];for(let i=0;i<184;i++){const q=model.createQuestion(rng,history);assert.ok(q.choices.every(x=>model.LETTERS.map(l=>q.lower?l.toLowerCase():l).includes(x)));history.push(q);if(history.length>32)history.shift()}
 for(const seed of [0,1,2,3,4,5,6,7,8,9,10]){const q=model.createQuestion(()=>seed/11,[]);assert.ok(q.start>=0&&q.start<=22);assert.ok(q.choices.every(x=>q.lower?/^[a-z]$/.test(x):/^[A-Z]$/.test(x)))}
});

test('approved title assets remain byte-identical and profile/ranking fields stay isolated',()=>{
 const expected={title_05:'f925c590f356a494aa34eb748d9c7a98c82fb8627c97e77f44344e294483e0ee',title_08:'1c44b9512ef4397ed28048f5f7517611af402a81c002e537a5a586f27a8acb07',title_12:'8f2e977d142669d429fc5472ea9ed687e0c5ef92778e2d88297d1c13a856f4ce',title_16:'1bed71e8d14918891e8f68af68c66c39e883a6ae2df3f738dcfdf8cefa171d74',title_20:'1ba4dd5d6f73c50b07ec9db6f39fcf45119b89fc440365d2b7d896b28093f7b6'};
 for(const [name,hash] of Object.entries(expected)){const path=new URL(`../shared-src/site/assets/missing-alphabet-titles/${name}.png`,import.meta.url);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex'),hash);}
 assert.equal(GAME_FIELDS.missingAlphabet,'missingAlphabetBestStreak');assert.equal(GAME_FIELDS.alphabet,'alphabetBestStreak');
 const player=normalizePlayer({nickname:'そら',missingAlphabetBestStreak:16,alphabetBestStreak:4},'u',contractFor('production'),[{id:'missingAlphabet',titles:[{id:'missingAlphabet:16',at:16}]}]);
 assert.equal(player.best.missingAlphabet,16);assert.equal(player.best.alphabet,4);assert.ok(player.titles.includes('missingAlphabet:16'));assert.ok(!player.titles.includes('alphabet:16'));
});

test('shared economy assigns English points and rejects duplicate or incorrect rewards for the new ID',()=>{
 const context={window:{},globalThis:null,structuredClone,Date,Math,Error,Map,Set,Array,Object,Number,String,RegExp,JSON};context.globalThis=context;vm.createContext(context);
 vm.runInContext(fs.readFileSync(new URL('../shared-src/site/economy-core.js',import.meta.url),'utf8'),context);
 context.window.ManabiEconomyCore=context.ManabiEconomyCore;
 context.window.MissingAlphabetModel=model;
 vm.runInContext(fs.readFileSync(new URL('../shared-src/site/missing-alphabet-economy.js',import.meta.url),'utf8'),context);
 const core=context.window.ManabiEconomyCore,q=model.createQuestion(random());let wallet=core.initial();wallet.balances.math=31;wallet.balances.english=6;
 assert.equal(core.games.missingAlphabet,'english');assert.equal(core.correct('missingAlphabet',core.canonicalPrompt('missingAlphabet',q),{choice:q.answer}),true);
 for(let i=0;i<55;i++){const correct=i<52;wallet=core.reward(wallet,'missingAlphabet',correct,'2026-11-04').wallet;}
 assert.equal(wallet.balances.english,56);assert.equal(wallet.balances.math,31);assert.equal(wallet.daily.games.missingAlphabet,50);
});

test('120-second challenge unlocks only after the approved 20-question title threshold',()=>{
 const challenge=loadGlobal('../shared-src/site/challenge120-core.js','ManabiChallenge120Core');assert.equal(challenge.highest.missingAlphabet,20);
 let state=challenge.fresh('missingAlphabet'),now=1000;
 for(let i=0;i<19;i++){const token=challenge.issue(state,`q${i}`);state=challenge.answer(state,token,true,now++).state;}
 assert.equal(state.unlocked,false);const last=challenge.issue(state,'q19');state=challenge.answer(state,last,true,now).state;assert.equal(challenge.unlock(state,true).phase,'waiting');
 const started=challenge.start(challenge.unlock(state,true),2000,'attempt','test-season');assert.equal(started.streak,20);assert.equal(started.deadline,122000);
 const token=challenge.issue(started,'challenge-q1'),answered=challenge.answer(started,token,true,3000).state;assert.equal(answered.streak,21);
 const timedOut=challenge.settle(answered,122000);assert.equal(timedOut.phase,'ended');assert.equal(timedOut.endReason,'timeout');assert.equal(timedOut.bests['test-season'],21);
});

