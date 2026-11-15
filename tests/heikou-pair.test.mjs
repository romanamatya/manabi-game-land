import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import '../shared-src/site/economy-core.js';
import '../shared-src/site/challenge120-core.js';
import '../shared-src/site/line-quiz-progress.js';
import { GAME, createDeck, clearDiagram, hitCandidate, difficulty } from '../shared-src/site/heikou-pair-model.js';

const core = globalThis.ManabiEconomyCore;
const challenge = globalThis.ManabiChallenge120Core;
const model = core.heikouPair;
const cross = (a,b) => a[0]*b[1]-a[1]*b[0];
const dot = (a,b) => a[0]*b[0]+a[1]*b[1];
const vector = (a,b) => a.map((v,i)=>v-b[i]);
const length = v => Math.hypot(...v);
const open = path => readFileSync(new URL('../'+path, import.meta.url));
function rng(seed) {
  return () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2**32);
}

test('18,000 seeded diagrams: close slopes, four distinct angles, and a unique answer after comparing angle positions', () => {
  for (const [index, level, range] of [[0,'easy',8],[1,'medium',6],[3,'hard',4]]) {
    const deck = createDeck(model, rng(97+index));
    const counts = new Map();
    const tilts = new Set(), intersections = new Set();
    let last = null;
    for (let n=0;n<6000;n++) {
      const q = deck.next(index);
      assert.equal(q.level, level);
      assert.ok(clearDiagram(q));
      const headings = q.candidates.map(c => Math.atan2(c.direction[1],c.direction[0])*180/Math.PI);
      assert.ok(Math.max(...headings)-Math.min(...headings) <= range+1e-8);
      const values = q.candidates.map(c=>c.angle.value);
      assert.equal(new Set(values).size,4);
      // Move every displayed angle to the sector between the right-facing
      // transversal ray and the downward candidate ray. Exactly one left/right
      // or up/down flip changes the measurement to its supplement.
      const sameSector = q.candidates.map(({angle}) =>
        (angle.rays[0][0]>0)===(angle.rays[1][1]>0) ? angle.value : 180-angle.value);
      const answers = [], byPosition = [], byNumbers = [];

      for (let i=0;i<4;i++) for (let j=i+1;j<4;j++) {
        const a=q.candidates[i], b=q.candidates[j];
        if (Math.abs(cross(a.direction,b.direction)) <= model.epsilon) {
          assert.ok(Math.abs(cross(a.direction,vector(b.point,a.point))) > 100);
          answers.push([i,j]);
        }
        if (sameSector[i]===sameSector[j]) byPosition.push([i,j]);
        if (values[i]+values[j]===180) byNumbers.push([i,j]);
        assert.equal(core.correct(GAME,q.prompt,{selection:[i,j]}), q.answer.join() === [i,j].join());
      }
      assert.deepEqual(answers,[q.answer]);
      assert.deepEqual(byPosition,[q.answer]);
      assert.equal(byNumbers.length,2);
      assert.ok(byNumbers.some(pair=>pair.join()===q.answer.join()));
      intersections.add(q.prompt.offsets.join());
      assert.ok(core.correct(GAME,q.prompt,{selection:[...q.answer].reverse()}));
      const key=q.answer.join();
      assert.notEqual(key,last);
      counts.set(key,1+(counts.get(key)||0));
      last=key;
      tilts.add(q.prompt.tilt);
      for (const [i,c] of q.candidates.entries()) {
        const {rays, from, to, center, radius, value, sweep, label} = c.angle;
        assert.deepEqual(center,c.point);
        assert.ok(Math.abs(cross(vector(center,q.transversal.point),q.transversal.direction)) < 1e-8);
        assert.ok(Math.abs(cross(rays[0],q.transversal.direction)) < 1e-9);
        assert.ok(Math.abs(cross(rays[1],c.direction)) < 1e-9);
        for (const [n, end] of [from,to].entries()) {
          const spoke=vector(end,center);
          assert.ok(Math.abs(length(spoke)-radius)<1e-9);
          assert.ok(dot(spoke,rays[n])>0 && Math.abs(cross(spoke,rays[n]))<1e-9);
        }
        const theta=Math.acos(dot(rays[0],rays[1]))*180/Math.PI;
        assert.ok(Math.abs(theta-value)<1e-8);
        assert.equal(sweep,Number(cross(...rays)>0));
        const labelRay=vector(label,center);
        assert.ok(cross(rays[0],labelRay)*cross(labelRay,rays[1])>0 && dot(labelRay,rays[0])>0);
        assert.equal(hitCandidate(q,center),-1);
        for (const direction of [-1,1]) {
          assert.equal(hitCandidate(q,center.map((v,k)=>v+100*direction*c.direction[k])),i);
        }
      }
    }
    assert.equal(counts.size,6);
    assert.deepEqual([...new Set(counts.values())],[1000]);
    assert.equal(tilts.size,{easy:6,medium:8,hard:10}[level]);
    assert.ok(intersections.size>5000);
  }
  assert.deepEqual([0,1,2,3].map(i=>difficulty(i,false)),['easy','medium','medium','hard']);
  assert.deepEqual([0,1,2,3,4].map(i=>difficulty(i,true)),['hard','hard','hard','hard','medium']);
});

test('constant random inputs remain bounded and malformed prompts cannot award points', () => {
  for (const random of [()=>0,()=>.4,()=>.99999]) {
    const deck=createDeck(model,random);
    for (let i=0;i<30;i++) assert.ok(clearDiagram(deck.next(i)));
  }
  const {prompt,answer}=createDeck(model,rng(1)).next(0);
  assert.deepEqual(core.canonicalPrompt(GAME,prompt),prompt);
  assert.equal(core.correct(GAME,prompt,{selection:[answer[0],answer[0]]}),false);
  assert.equal(core.correct(GAME,{...prompt,bearings:[80,80,81,81]},{selection:answer}),false);
  assert.equal(core.correct(GAME,{...prompt,offsets:[0,0,0,0]},{selection:answer}),false);
});

test('separate progress, five titles, 120-second expiry, and the shared 50-point cap', async () => {
  let now=1700000000000, wallet=core.initial(), uid=0;
  const records=new Map([['mgl_parallelPair','{"best":17}']]);
  wallet.owned.push('icon-007');
  const storage={getItem:k=>records.get(k),setItem:(k,v)=>records.set(k,v)};
  const economy={begin:(game,prompt)=>({id:'q'+uid++,game,prompt}),answer:async(ctx,answer)=>{
    wallet=core.reward(wallet,ctx.game,core.correct(ctx.game,ctx.prompt,answer),core.dayKey(now),ctx.policy).wallet;
  }};
  const titles=[3,5,10,15,25].map(at=>({at}));
  const settings={game:GAME,core,challenge,economy,titles,storage,now:()=>now,monotonic:()=>0,
    locks:null,uuid:()=>String(++uid),season:'qa'};
  let progress=ManabiLineQuizProgress.createProgress(settings);
  const deck=createDeck(model,rng(225));
  const reply=async (n,timed=false)=>{
    const {prompt,answer}=deck.next(n,timed);
    return progress.answer(progress.begin(prompt),answer);
  };
  const awards=[];
  for (let i=0;i<25;i++) {
    const result=await reply(i);
    assert.equal(result.correct,true);
    if(result.title)awards.push(result.title.at);
  }
  assert.deepEqual(awards,[3,5,10,15,25]);
  assert.equal(progress.read().challenge.phase,'waiting');
  assert.equal(progress.read().challenge.deadline,null);
  now+=240000;
  assert.equal(progress.read().challenge.phase,'waiting');
  await progress.start();
  assert.equal(progress.read().challenge.deadline-now,120000);
  for (let i=0;i<32;i++) await reply(i,true);
  progress=ManabiLineQuizProgress.createProgress(settings);
  assert.equal(progress.read().challenge.attemptBest,57);
  assert.equal(progress.read().challenge.practiceStreak,25);
  now+=120000;
  assert.equal(progress.read().challenge.phase,'ended');
  assert.equal(progress.read().challenge.bests.qa,57);
  await progress.start();
  const {prompt,answer}=deck.next(0,true);
  await progress.answer(progress.begin(prompt),[answer[0],answer[0]]);
  assert.equal(progress.read().challenge.endReason,'wrong-answer');
  assert.equal(progress.read().challenge.bests.qa,57);
  assert.equal(wallet.balances.math,50);
  assert.equal(wallet.daily.games[GAME],50);
  assert.equal(wallet.owned[0],'icon-007');
  assert.equal(storage.getItem('mgl_parallelPair'),'{"best":17}');
});

test('the published game uses the reviewed question model, button and approved artwork', () => {
  const hashes=[
    ['01_rookie','b22b1b282b6dba56a6b12486e8519ea349f375b852ac3d149e2a284cd8a4734a'],
    ['02_hunter','fec71baf3baa54d1d7cf26b588eb01fc054f8770a2b2f21e616bd3e44e4aab51'],
    ['03_master','c6c8410cda6d56c6037a7027b8b7b352c83b3ce567a771a2d948e10c69d3374e'],
    ['04_tatsujin','0497423b2d900ffc2d08368ffc7a5b22e92ceca8b5804e1e7e0ef0b6db771deb'],
    ['05_haou','06c7b8740087e5a1cb6b20ea40a6d440547b762f6c31cef376c6e18571252083'],
  ];
  for (const [name, sha] of hashes) {
    const path='assets/heikou-pair-titles/'+name+'_512.png';
    const image=open('preview/'+path);
    assert.equal(createHash('sha256').update(image).digest('hex'),sha);
    assert.deepEqual([image.readUInt32BE(16),image.readUInt32BE(20),image[25]],[512,512,6]);
    assert.deepEqual(image,open('shared-src/site/'+path));
    assert.deepEqual(image,open(path));
  }
  assert.match(open('preview/math.html').toString(),/id="geometry"[^]*?href="games\/heikouPair\.html"/);
  const controller = open('heikou-pair-game.js').toString().replace(/heikou-pair-model\.js\?v=[^']+/, 'heikou-pair-model.js');
  assert.equal(controller,open('shared-src/site/heikou-pair-game.js').toString());
  for (const path of ['heikou-pair-model.js','heikou-pair.css','parallel-confirm.css']) {
    assert.deepEqual(open(path),open('shared-src/site/'+path));
    assert.deepEqual(open(path),open('preview/'+path));
  }
  assert.match(open('games/heikouPair.html').toString(),/parallel-confirm\.css/);
  const geometryBlock = path => open(path).toString().split('const heikouPair = ')[1].split('const subjects=')[0];
  assert.equal(geometryBlock('economy-core.js'),geometryBlock('shared-src/site/economy-core.js'));
  assert.match(open('environment.js').toString(),/"staticLocalGameIds":\[[^\]]*"heikouPair"/);
  assert.doesNotMatch(open('environment.js').toString(),/"rankingGameIds":\[[^\]]*"heikouPair"/);
  assert.match(open('games/heikouPair.html').toString(),/href="\.\.\/math-geometry\.html"/);
  assert.doesNotMatch(open('games/heikouPair.html').toString(),/firebase-session|ranking-sync/);
});
