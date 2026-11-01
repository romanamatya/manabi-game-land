import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CHALLENGE120_GAMES} from '../challenge120-ranking-model.js';

const text=async path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('every game selection opens its matching dedicated challenge ranking',async()=>{
 const math=await text('math-navigation.js');
 const mathGames=['keisan','distribution','distribution2','exchangeAssociation','multiplicationProperties','shapeExpressions','keisanSummary'];
 for(const game of mathGames)assert.ok(math.includes(`'${game}'`),`math game ${game}`);
 assert.match(math,/rank\.href=testLink\('challenge120-ranking\.html\?game='\+id\)/);
 const ids=[];
 for(const page of ['japanese.html','language.html','social.html']){
  const html=await text(page);
  for(const match of html.matchAll(/href="challenge120-ranking\.html\?game=([A-Za-z0-9_-]+)"/g))ids.push(match[1]);
 }
 assert.deepEqual(new Set([...mathGames,...ids]),new Set(CHALLENGE120_GAMES));
});

test('game-end and summary links resolve to the dedicated ranking',async()=>{
 const runtime=await text('challenge120-runtime.js');
 assert.match(runtime,/rank\.href='\.\.\/challenge120-ranking\.html\?'\+rankQuery\.toString\(\)/);
 const summary=await text('games/keisanSummary.html');
 assert.match(summary,/href="\.\.\/challenge120-ranking\.html\?game=keisanSummary"/);
 assert.doesNotMatch(summary,/summary-ranking\.html|challenge120-challenge120/);
 assert.doesNotMatch(summary,/同じランキングに記録されます/);
});

test('legacy ranking routes redirect without loading or displaying legacy rows',async()=>{
 const [ranking,rankingRoute,sharedRanking,sharedRoute,summary,summaryRoute]=await Promise.all([
  text('ranking.html'),text('ranking-page.js'),text('shared-src/site/ranking.html'),text('shared-src/site/ranking-page.js'),text('summary-ranking.html'),text('summary-ranking.js')
 ]);
 assert.match(ranking,/ranking-page\.js\?v=challenge120-ranking-v2/);
 assert.doesNotMatch(ranking,/ranking-sync-api|ranking-sync-client|<tbody/);
 assert.match(rankingRoute,/location\.replace\('challenge120-ranking\.html\?'\+next\.toString\(\)\)/);
 assert.doesNotMatch(rankingRoute,/ManabiLeaderboard|\.rankings\(/);
 assert.match(sharedRanking,/ranking-page\.js\?v=challenge120-ranking-v2/);
 assert.doesNotMatch(sharedRanking,/ranking-sync-api|ranking-sync-client|<tbody/);
 assert.match(sharedRoute,/location\.replace\('challenge120-ranking\.html\?'\+next\.toString\(\)\)/);
 assert.match(summary,/summary-ranking\.js\?v=challenge120-ranking-v2/);
 assert.doesNotMatch(summary,/ranking-sync-api|ranking-sync-client|<tbody/);
 assert.match(summaryRoute,/game:'keisanSummary'/);
 assert.match(summaryRoute,/location\.replace\('challenge120-ranking\.html\?'\+next\.toString\(\)\)/);
});

test('profile and home ranking entries do not read legacy ranking records',async()=>{
 for(const path of ['profile-ui.js','shared-src/site/profile-ui.js']){
  const ui=await text(path);
  assert.match(ui,/challenge120-ranking\.html\?game=/);
  assert.doesNotMatch(ui,/['"]ranking\.html\?game=|summary-ranking\.html/);
 }
 const home=await text('home-data.js'),index=await text('index.html'),sharedHome=await text('shared-src/site/home-data.js'),sharedIndex=await text('shared-src/site/index.html');
 assert.doesNotMatch(home,/\.champions\(\)/);
 assert.doesNotMatch(sharedHome,/client\.records\(\)|ManabiLeaderboard\.render\(/);
 assert.match(home,/以前の共有記録はここには表示しません/);
 assert.match(sharedHome,/以前の共有記録はここには表示しません/);
 assert.match(index,/challengeBoardLink[^>]+challenge120-ranking\.html\?game=keisan/);
 assert.match(sharedIndex,/challengeBoardLink[^>]+challenge120-ranking\.html\?game=keisan/);
});

test('dedicated ranking has no link back to legacy ranking pages',async()=>{
 const [html,js,sharedHtml,sharedJs,api]=await Promise.all([text('challenge120-ranking.html'),text('challenge120-ranking.js'),text('shared-src/site/challenge120-ranking.html'),text('shared-src/site/challenge120-ranking.js'),text('shared-src/site/ranking-sync-api.js')]);
 assert.doesNotMatch(html,/id="regular"|通常ランキング|href="ranking\.html/);
 assert.doesNotMatch(js,/summary-ranking\.html|ranking\.html\?game=/);
 assert.doesNotMatch(sharedHtml,/id="regular"|通常ランキング|href="ranking\.html/);
 assert.match(sharedJs,/challenge120-ranking-v2/);
 assert.match(api,/async function challenge120Rankings/);
});
