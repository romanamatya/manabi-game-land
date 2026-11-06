import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {visibilityState,renderGameState,bindGameAvailability} from '../shared-src/site/game-selection-model.js';

function card(){
 const play={disabled:true,textContent:'確認中…',attrs:{},setAttribute(name,value){this.attrs[name]=value}};
 const badge={hidden:true,textContent:''},ranking={href:'ranking.html?game=keisan',textContent:'ランキング'};
 return {dataset:{gameCard:'keisan'},play,badge,ranking,querySelector(selector){return selector==='[data-game-play]'?play:selector==='[data-game-status]'?badge:null}};
}

test('visibility state uses only explicit publication and fails closed for missing or uncertain records',()=>{
 assert.equal(visibilityState(null),'unknown');assert.equal(visibilityState({}),'unknown');assert.equal(visibilityState({status:'published'}),'published');
 assert.equal(visibilityState({status:'preparing'}),'preparing');assert.equal(visibilityState({status:'hidden'}),'hidden');
 assert.equal(visibilityState({published:false}),'hidden');assert.equal(visibilityState({published:true}),'published');assert.equal(visibilityState({status:'surprise'}),'unknown');
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
   if(id==='suichoku')assert.match(body,/ranking\.html\?game=suichoku/,file+':shared-ranking-link');
   else assert.match(body,/href="(?:ranking\.html\?game=[^"]+|summary-ranking\.html)"/,file+':ranking-link');
  }
 }
});

test('every production and shared game-selection page loads the Firebase session before the settings reader',async()=>{
 for(const file of ['../math-calculation.html','../japanese.html','../social.html','../language.html','../shared-src/site/math.html','../shared-src/site/japanese.html','../shared-src/site/social.html','../shared-src/site/language.html']){
  const html=await readFile(new URL(file,import.meta.url),'utf8');
  assert.match(html,/game-selection\.js/,file+': game picker is present');
  const session=html.indexOf('public-firebase-session.js'),settings=html.indexOf('public-admin-settings.js'),picker=html.indexOf('game-selection.js');
  assert.ok(session>=0&&settings>session&&picker>settings,file+': session broker must load before settings and game picker');
 }
});

test('a missing settings document stays unknown on the game picker instead of appearing public',async()=>{
 const c=card(),binding=bindGameAvailability(c,{enabled:true,settings:{subscribeGame(id,onValue){onValue({exists:()=>false,data:()=>null,metadata:{fromCache:false}});return ()=>{}}}});
 await binding.ready;assert.equal(c.play.disabled,true);assert.equal(c.badge.textContent,'公開状態を確認できません');binding.dispose();
});


test('production subject pages expose separate play and ranking controls',async()=>{
 for(const file of ['japanese.html','social.html','language.html']){
  const html=await readFile(new URL('../'+file,import.meta.url),'utf8');
  const cards=[...html.matchAll(/<article class="card game-card" data-game-card="([^"]+)">([\s\S]*?)<\/article>/g)];
  assert.ok(cards.length>0,file);assert.match(html,/src="game-selection\.js\?v=availability-read-fix-20261102"/);
  for(const [,id,body] of cards){assert.match(body,new RegExp('data-game-id="'+id+'"'));assert.match(body,/data-game-play[^>]*disabled/);assert.match(body,/data-game-ranking/);}
 }
});

test('production 2-minute challenge keeps its ranking route and direct URL guard',async()=>{
 const navigation=await readFile(new URL('../math-navigation.js',import.meta.url),'utf8');
 assert.ok(navigation.includes("games:['keisan','distribution','distribution2','exchangeAssociation','multiplicationProperties','shapeExpressions','keisanSummary']"));
 assert.ok(navigation.includes("id:'geometry',name:'四角形・垂直と平行'"));
 assert.ok(navigation.includes("page:'math-geometry.html',games:['suichoku','parallelPair']"));
 assert.ok(navigation.includes("id==='keisanSummary'?'summary-ranking.html':'ranking.html?game='"));
 assert.ok(navigation.includes("play.dataset.gameHref=testLink('games/'+id+'.html')"));
 assert.ok(navigation.includes("rank.href=testLink(id==='keisanSummary'?'summary-ranking.html':'ranking.html?game='+id)"))
 const settings=await readFile(new URL('../shared-src/site/public-admin-settings.js',import.meta.url),'utf8');
 const gate=await readFile(new URL('../shared-src/site/public-game-availability.js',import.meta.url),'utf8');
 assert.ok(!settings.includes('document.documentElement.inert=true'));assert.ok(settings.includes("read('gameSettings',gameId)"));assert.ok(settings.includes('subscribeGame(id,onValue,onError)'));
 assert.ok(gate.includes("const EXEMPT='a[href],header,nav,aside,#challenge120Gate,#challenge120Status,#publicGameAccessStatus"));
});

test('math navigation renders the two parallel units and keeps vertical only in geometry',async()=>{
 const source=await readFile(new URL('../math-navigation.js',import.meta.url),'utf8');
 function render(unitId){class Element{constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.className='';this.href='';this.textContent='';this.classList={add:name=>{this.className+=' '+name}}}append(...nodes){this.children.push(...nodes)}setAttribute(k,v){this[k]=v}}const root=new Element('section'),document={body:{dataset:{unit:unitId}},getElementById:()=>root,createElement:tag=>new Element(tag),querySelectorAll:()=>[]},location={href:'https://example.test/math.html'},window={ManabiProfileCatalog:[],ManabiGameSelection:{initialize(){}}};const vmContext={document,location,window,URL,URLSearchParams,Object,Array};return import('node:vm').then(({runInNewContext})=>{runInNewContext(source,vmContext);return root})}
 const chooser=await render('');assert.equal(chooser.children.length,2);assert.deepEqual(chooser.children.map(x=>x.children[0].href),['math-calculation.html','math-geometry.html']);assert.deepEqual(chooser.children.map(x=>x.children[0].children[0].textContent),['計算のきまり','四角形・垂直と平行']);
 const calculation=await render('calculation');assert.ok(!calculation.children.some(x=>['suichoku','parallelPair'].includes(x.dataset.gameCard)));
 const geometry=await render('geometry');assert.deepEqual(geometry.children.map(x=>x.dataset.gameCard),['suichoku','parallelPair']);assert.equal(geometry.children[0].children[0].children[0].textContent,'垂直を見つけよう！');
 const calcPage=await readFile(new URL('../math-calculation.html',import.meta.url),'utf8'),geometryPage=await readFile(new URL('../math-geometry.html',import.meta.url),'utf8');assert.match(calcPage,/data-unit="calculation"/);assert.match(geometryPage,/data-unit="geometry"/);
});
