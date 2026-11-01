import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {visibilityState,renderGameState,bindGameAvailability} from '../shared-src/site/game-selection-model.js';

function card(){
 const play={disabled:true,textContent:'確認中…',attrs:{},setAttribute(name,value){this.attrs[name]=value}};
 const badge={hidden:true,textContent:''},ranking={href:'ranking.html?game=keisan',textContent:'ランキング'};
 return {dataset:{gameCard:'keisan'},play,badge,ranking,querySelector(selector){return selector==='[data-game-play]'?play:selector==='[data-game-status]'?badge:null}};
}

test('visibility state defaults existing records to published and fails closed on uncertainty',()=>{
 assert.equal(visibilityState(null),'published');assert.equal(visibilityState({status:'published'}),'published');
 assert.equal(visibilityState({status:'preparing'}),'preparing');assert.equal(visibilityState({status:'hidden'}),'hidden');
 assert.equal(visibilityState({published:false}),'hidden');assert.equal(visibilityState({status:'surprise'}),'unknown');
 assert.equal(visibilityState({status:'hidden'},{fromCache:true}),'checking');assert.equal(visibilityState(null,{error:true}),'unknown');
});

test('play control follows publication state while the ranking link remains available',()=>{
 const c=card();renderGameState(c,'published');assert.equal(c.play.disabled,false);assert.equal(c.play.textContent,'プレイ');assert.equal(c.badge.hidden,true);
 const rankingBefore={...c.ranking};renderGameState(c,'preparing');assert.equal(c.play.disabled,true);assert.match(c.play.textContent,/×/);assert.equal(c.badge.textContent,'公開準備中');assert.deepEqual(c.ranking,rankingBefore);
 renderGameState(c,'hidden');assert.equal(c.play.disabled,true);assert.match(c.play.textContent,/×/);assert.equal(c.badge.textContent,'非公開');
 renderGameState(c,'unknown');assert.equal(c.play.disabled,true);assert.equal(c.badge.textContent,'公開状態を確認できません');
 renderGameState(c,'published');assert.equal(c.play.disabled,false);assert.equal(c.badge.hidden,true);
});


test('live visibility updates disable and restore only the play control',async()=>{
 const c=card();let update,fail,disposed=false;
 const binding=bindGameAvailability(c,{enabled:true,settings:{subscribeGame(id,onValue,onError){assert.equal(id,'keisan');update=onValue;fail=onError;return ()=>{disposed=true}}}});
 await binding.ready;update({exists:()=>true,data:()=>({status:'preparing'}),metadata:{fromCache:false}});
 assert.equal(c.play.disabled,true);assert.equal(c.badge.textContent,'公開準備中');
 update({exists:()=>true,data:()=>({status:'hidden'}),metadata:{fromCache:false}});assert.equal(c.badge.textContent,'非公開');
 update({exists:()=>true,data:()=>({status:'published'}),metadata:{fromCache:false}});assert.equal(c.play.disabled,false);assert.equal(c.play.textContent,'プレイ');
 fail();assert.equal(c.play.disabled,true);assert.equal(c.badge.textContent,'公開状態を確認できません');
 binding.dispose();assert.equal(disposed,true);
});

test('preview selection pages keep every listed game and separate play from ranking',async()=>{
 for(const file of ['math.html','japanese.html','social.html','language.html']){
  const html=await readFile(new URL('../shared-src/site/'+file,import.meta.url),'utf8');
  const cards=[...html.matchAll(/<article class="card game-card" data-game-card="([^"]+)">([\s\S]*?)<\/article>/g)];
  assert.ok(cards.length>0,file);
  for(const [,id,body] of cards){
   assert.match(body,new RegExp('data-game-id="'+id+'"'),file+':'+id);
   assert.match(body,/data-game-play[^>]*disabled/,file+':disabled-until-state-known');
   assert.match(body,/href="(?:ranking\.html\?game=[^"]+|summary-ranking\.html)"/,file+':ranking-link');
  }
 }
});


test('production subject pages expose separate play and ranking controls',async()=>{
 for(const file of ['japanese.html','social.html','language.html']){
  const html=await readFile(new URL('../'+file,import.meta.url),'utf8');
  const cards=[...html.matchAll(/<article class="card game-card" data-game-card="([^"]+)">([\s\S]*?)<\/article>/g)];
  assert.ok(cards.length>0,file);assert.match(html,/src="game-selection\.js\?v=game-picker-ui-1"/);
  for(const [,id,body] of cards){assert.match(body,new RegExp('data-game-id="'+id+'"'));assert.match(body,/data-game-play[^>]*disabled/);assert.match(body,/data-game-ranking/);}
 }
});

test('production 2-minute challenge keeps its ranking route and direct URL guard',async()=>{
 const navigation=await readFile(new URL('../math-navigation.js',import.meta.url),'utf8');
 assert.ok(navigation.includes("games:['keisan','distribution','distribution2','exchangeAssociation','multiplicationProperties','shapeExpressions','keisanSummary']"));
 assert.ok(navigation.includes("id==='keisanSummary'?'summary-ranking.html':'ranking.html?game='"));
 assert.ok(navigation.includes("play.dataset.gameHref=testLink('games/'+id+'.html')"));
 assert.ok(navigation.includes("rank.href=testLink(id==='keisanSummary'?'summary-ranking.html':'ranking.html?game='+id)"))
 const settings=await readFile(new URL('../shared-src/site/public-admin-settings.js',import.meta.url),'utf8');
 assert.ok(settings.includes('document.documentElement.inert=true'));assert.ok(settings.includes("read('gameSettings',gameId)"));assert.ok(settings.includes('subscribeGame(id,onValue,onError)'));
});
