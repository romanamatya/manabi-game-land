import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createDeck, GAME, questionFromPrompt, WEIGHTS } from '../shared-src/site/metal-heat-model.js';

test('20,000 metal questions have exact proportions and one scored answer', () => {
  let seed=768;
  const deck=createDeck(()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32));
  const context={structuredClone,ManabiMetalHeatQuestions:{answer:p=>questionFromPrompt(p).answer}};
  vm.runInNewContext(readFileSync('shared-src/site/economy-core.js','utf8'),context);
  const core=context.ManabiEconomyCore;
  assert.equal(core.games[GAME],'science');
  const seen=new Map(), heat=new Set(), correctSlots=new Set();
  let last;
  for(let cycle=0;cycle<1000;cycle++){
    const count={...WEIGHTS};
    for(let i=0;i<20;i++){
      const q=deck.next();
      count[q.type]--;
      assert.notEqual(q.type,last);
      assert.notEqual(q.scorePrompt.variant,seen.get(q.type));
      seen.set(q.type,q.scorePrompt.variant);last=q.type;
      assert.equal(q.options.length,4);
      assert.equal(new Set(q.options).size,4);
      assert.ok(q.prompt && q.explanation);
      assert.doesNotMatch([q.prompt,q.explanation,...q.options].join(' '),/水|空気/);
      const p=core.canonicalPrompt(GAME,q.scorePrompt);
      assert.deepEqual(q.options.filter(x=>core.correct(GAME,p,x)),[q.answer]);
      correctSlots.add(q.options.indexOf(q.answer));
      if(q.visual?.kind==='positions'){
        const {sites,heat:[hx,hy],shape}=q.visual;
        const distances=sites.map(({xy:[x,y],label})=>[Math.hypot(x-hx,y-hy),label]);
        assert.equal(new Set(distances.map(([d])=>d)).size,sites.length);
        assert.equal(q.type==='first'?sites.length:0,q.type==='first'?4:0);
        const expected=distances.sort(([a],[b])=>a-b).map(([,label])=>label);
        assert.equal(q.answer,q.type==='first'?expected[0]:expected.join(' → '));
        assert.ok(sites.every(({xy:[x,y]})=>x>6&&x<94&&y>9&&y<91));
        heat.add(shape+':'+hx+':'+hy);
      }else if(q.type==='predict'){
        assert.equal(q.visual.shape,'plate');
        assert.equal(q.answer,'近くから広がる図');
      }
    }
    assert.ok(Object.values(count).every(v=>v===0));
  }
  assert.equal(heat.size,8);
  assert.equal(correctSlots.size,4);
  assert.throws(()=>core.canonicalPrompt(GAME,{type:'ink',variant:100}),/invalid-metal-heat-question/);
  let wallet=core.initial();
  for(let i=0;i<55;i++)wallet=core.reward(wallet,GAME,true,'2026-11-25').wallet;
  assert.equal(wallet.balances.science,50);
  assert.equal(wallet.daily.games[GAME],50);
});

test('metal is registered only in preview and production staging cannot run it',()=>{
  const read=path=>readFileSync(path,'utf8');
  const p=JSON.parse(read('environments/preview.json'));
  const prod=JSON.parse(read('environments/production.json'));
  for (const key of ['staticLocalGameIds','managedVisibilityGameIds','visibilityGameIds','gameIds']){
    assert.ok(p[key].includes(GAME));
    assert.ok(!prod[key]?.includes(GAME));
  }
  assert.match(read('.release/production/games/metalHeat.html'),/未公開/);
  assert.doesNotMatch(read('.release/production/science.html'),/games\/metalHeat\.html/);
});
