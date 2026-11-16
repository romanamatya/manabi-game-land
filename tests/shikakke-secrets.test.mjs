import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { GAME, SHAPES, createDeck } from '../shared-src/site/shikakke-secrets-model.js';
import '../shared-src/site/economy-core.js';
import '../shared-src/site/challenge120-core.js';
import '../shared-src/site/line-quiz-progress.js';

const core = globalThis.ManabiEconomyCore;
const challenge = globalThis.ManabiChallenge120Core;
const expected = [
  ['2本の対角線が必ず垂直に交わる図形は？', '00110'],
  ['となり合う辺が必ず垂直に交わる図形は？', '00011'],
  ['向かい合う2組の辺が必ず平行になる図形は？', '10111'],
  ['向かい合う1組だけの辺が必ず平行になる図形は？', '01000'],
  ['4つの角が必ず直角になる図形は？', '00011'],
  ['2本の対角線が必ず垂直に交わり、4つの辺の長さが必ず等しい図形は？', '00110'],
];
const source = file => readFileSync(new URL('../' + file, import.meta.url));

test('all 192 answers match the approved six fixed question texts and five shapes', () => {
  assert.deepEqual(SHAPES.map(s=>s.name), ['平行四辺形','台形','ひし形','正方形','長方形']);
  assert.equal(core.shikakkeQuestions.length, 6);
  core.shikakkeQuestions.forEach(({id,text},index)=>{
    const [phrase, bits] = expected[index];
    assert.equal(text, phrase);
    const correctMask = [...bits].reduce((mask, bit, i) => mask | (Number(bit) << i), 0);
    const prompt = core.canonicalPrompt(GAME,{questionId:id,answers:['forged']});
    assert.deepEqual(prompt,{questionId:id});
    for(let mask=0;mask<32;mask++) {
      const selection=SHAPES.filter((_,i)=>mask&(1<<i)).map(s=>s.id);
      assert.equal(core.correct(GAME,prompt,{selection}),mask===correctMask);
    }
    assert.equal(core.correct(GAME,prompt,{selection:['square','square']}),false);
  });
  assert.throws(()=>core.canonicalPrompt(GAME,{questionId:'other'}));
});

test('all displayed polygons match their mathematical names and canonical answer matrix', () => {
  const vector = ([x1,y1],[x2,y2]) => [x2-x1,y2-y1];
  const cross = ([x1,y1],[x2,y2]) => x1*y2-y1*x2;
  const dot = ([x1,y1],[x2,y2]) => x1*x2+y1*y2;
  const matrix=SHAPES.map(({id,points})=>{
    const edges=points.map((v,i)=>vector(v,points[(i+1)%4]));
    assert.ok(edges.every((v,i)=>cross(v,edges[(i+1)%4])>0));
    assert.ok(points.every(([x,y])=>x>=0&&x<=124&&y>=0&&y<=108));
    const pairs=Number(cross(edges[0],edges[2])===0)+Number(cross(edges[1],edges[3])===0);
    const right=edges.every((v,i)=>dot(v,edges[(i+1)%4])===0);
    const equal=edges.every(e=>dot(e,e)===dot(edges[0],edges[0]));
    const diagonal=dot(vector(points[0],points[2]),vector(points[1],points[3]))===0;
    assert.equal(equal,['rhombus','square'].includes(id));
    if(id==='rhombus')assert.ok(points[2][1]-points[0][1]>points[1][0]-points[3][0]);
    return [diagonal,right,pairs===2,pairs===1,right,diagonal&&equal];
  });
  assert.deepEqual(expected.map((_,j)=>matrix.map(row=>Number(row[j])).join('')),expected.map(x=>x[1]));
});

test('deck visits all six questions in each shuffled round and does not repeat at a boundary', () => {
  let initial=77;
  const deck=createDeck(core.shikakkeQuestions,()=>((initial=Math.imul(1664525,initial)+1013904223|0)>>>0)/2**32);
  let prior;
  const orders=new Set();
  for(let round=0;round<100;round++) {
    const ids=Array.from({length:6},()=>deck.next().id);
    assert.equal(new Set(ids).size,6);
    assert.notEqual(ids[0],prior);
    orders.add(ids.join(','));
    prior=ids.at(-1);
  }
  assert.ok(orders.size>10);
});

test('point cap, five awards and the 120-second challenge use isolated shared progress', async () => {
  let points=core.initial(), id=0, now=1000;
  const values=new Map([['mgl_quadrilateral','{"best":37}']]);
  const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const titles=[3,5,10,15,25].map(at=>({at}));
  const options={storage,core,challenge,titles,game:GAME,season:'test-season',uuid:()=> 'timed',locks:null,
    now:()=>now,monotonic:()=>0,
    economy:{
      begin(game,prompt){return {game,prompt,id:String(++id)}},
      answer(context,value){
        points=core.reward(points,context.game,core.correct(context.game,context.prompt,value),'2026-11-17',context.policy).wallet;
      },
    }};
  const progress=globalThis.ManabiLineQuizProgress.createProgress(options);
  const q=core.shikakkeQuestions[0];
  const begin=()=>progress.begin({questionId:q.id});
  const awards=[];
  assert.equal((await progress.answer(begin(),['square'])).correct,false);
  assert.equal(points.balances.math,0);
  for(let i=0;i<25;i++) {
    const attempt=begin();
    const result=await progress.answer(attempt,q.answers);
    assert.equal(result.correct,true);
    if(result.title)awards.push(result.title.at);
    assert.equal((await progress.answer(attempt,q.answers)).accepted,false);
  }
  assert.deepEqual(awards,[3,5,10,15,25]);
  assert.equal(progress.read().challenge.phase,'waiting');
  now+=200000;
  await progress.start();
  assert.equal(progress.read().challenge.deadline-now,120000);
  for(let i=0;i<27;i++) await progress.answer(begin(),q.answers);
  assert.equal(points.balances.math,50);
  assert.equal(points.daily.games[GAME],50);
  await progress.answer(begin(),['rectangle']);
  assert.equal(progress.read().challenge.endReason,'wrong-answer');
  await progress.start();
  now+=120001;
  assert.equal(progress.read().challenge.endReason,'timeout');
  assert.equal(globalThis.ManabiLineQuizProgress.createProgress(options).read().best,52);
  assert.equal(values.get('mgl_quadrilateral'),'{"best":37}');
});

test('preview catalog and all ten PNGs match their declared dimensions and source copies', () => {
  const context={window:{}};
  vm.runInNewContext(source('preview/profile-catalog.js').toString(),context);
  const game=context.window.ManabiProfileCatalog.find(x=>x.id===GAME);
  assert.equal(game.rankingEnabled,false);
  assert.equal(game.titles.length,5);
  for(const {image} of game.titles) for(const size of [512,1254]) {
    const asset=image.replace('_512.png','_'+size+'.png');
    const bytes=source('preview/'+asset);
    assert.deepEqual(bytes,source('shared-src/site/'+asset));
    assert.equal(bytes.readUInt32BE(16),size);
    assert.equal(bytes.readUInt32BE(20),size);
  }
});
