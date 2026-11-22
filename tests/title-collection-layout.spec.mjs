import {test,expect} from '@playwright/test';
import {mockPublicVisibility} from './fixtures/public-visibility-browser.mjs';
const base=process.env.MGL_BASE_URL||'http://127.0.0.1:4173/';
const production=process.env.MGL_TITLE_TARGET==='production';
const site=base+(production?'':'preview/');
const scope=production?'':'manabi_public_preview:';
if(process.env.MGL_CHROME_CHANNEL)test.use({channel:process.env.MGL_CHROME_CHANNEL});
const sizes=[{width:1024,height:768},{width:1194,height:834},{width:960,height:540}];
test.beforeEach(async({page})=>{
 await page.route('https://**/*',route=>route.abort());
 await mockPublicVisibility(page,{verticalParallel:'published',fractionBasics:'published'});
 await page.addInitScript(scope=>{
  if (sessionStorage.getItem('title-collection-fixture')) return;
  sessionStorage.setItem('title-collection-fixture', '1');
  localStorage.setItem(scope+'mgl_nickname','コレクション確認');
  localStorage.setItem(scope+'mgl_profile','{"icon":"cat","frame":"plain","owned":["kept-item"]}');
  localStorage.setItem(scope+'mgl_parallelPair','{"best":25,"streak":2}');
  localStorage.setItem(scope+'mgl_verticalParallel','{"best":5}');
  localStorage.setItem(scope+'leaderboard_players','[{"nickname":"過去の記録","bestStreak":12}]');
  localStorage.setItem(scope+'mgl_challenge120_local_board_v1','[]');
 },scope);
});
async function clean(page, { scroll = false } = {}){
 await expect.poll(()=>page.locator('img').evaluateAll(images=>images.every(image=>image.complete))).toBe(true);
 const result=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,broken:[...document.images].filter(img=>img.complete&&img.naturalWidth===0).map(img=>img.src)}));
 expect(result.scrollWidth).toBeLessThanOrEqual(result.width+1);if (!scroll) expect(result.scrollHeight).toBeLessThanOrEqual(result.height+1);expect(result.broken).toEqual([]);
 await expect(page.getByText('今のチャンピオン',{exact:true})).toHaveCount(0);
}
for(const size of sizes)test('home, picker and collection '+size.width+'x'+size.height,async({page},info)=>{
 await page.setViewportSize(size);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(site+'index.html');await expect(page.locator('#titleCollectionHome h2')).toHaveText('ぼく・わたしの称号コレクション');await clean(page);
 await page.screenshot({path:info.outputPath('home.png'),fullPage:true});
 await page.goto(site+'math-geometry.html');await expect(page.locator('.title-game-row')).toHaveCount(6);
 await expect(page.locator('[data-game-card="verticalParallel"] [data-game-play]')).toBeEnabled();
 const row=page.locator('[data-game-card="parallelPair"]');await expect(row.locator('.collection-art.earned')).toHaveCount(5);await expect(row.locator('.complete')).toHaveCount(1);
 await expect(page.locator('[data-game-ranking],.rank-button')).toHaveCount(0);await clean(page,{scroll:true});
 await page.screenshot({path:info.outputPath('games.png'),fullPage:true});
 await page.goto(site+'titles.html?game=parallelPair');await expect(page.locator('.collection-title-grid li')).toHaveCount(5);await expect(page.locator('.collection-title-grid li.earned')).toHaveCount(5);await clean(page);
 await page.screenshot({path:info.outputPath('collection.png'),fullPage:true});
 await page.locator('#collectionGame').selectOption('suichoku');
 await expect(page.locator('.collection-title-grid .collection-art img')).toHaveCount(5);
 await expect(page.locator('.collection-title-grid .collection-art svg')).toHaveCount(0);
 await clean(page);
 await page.screenshot({path:info.outputPath('unearned-titles.png'),fullPage:true});
 await page.getByRole('button',{name:'理科 ―'}).click();await expect(page.getByText('この教科のゲームは準備中です。')).toBeVisible();
 expect(errors).toEqual([]);
 expect(await page.evaluate(scope=>localStorage.getItem(scope+'leaderboard_players'),scope)).toBe('[{"nickname":"過去の記録","bestStreak":12}]');
});
test('all released games launch without ranking requests or controls',async({page})=>{
 await page.goto(site+'titles.html');
 const ids=await page.evaluate(()=>window.ManabiProfileCatalog.map(g=>g.id));expect(ids).toHaveLength(19);
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(new URL(page.url()).pathname+': '+e.message));page.on('request',r=>{if(/firestore.googleapis.com/.test(r.url()))requests.push(r.url());});
 for(const id of ids){
  await page.goto(site+'games/'+id+'.html');
  await expect(page).toHaveURL(site+'games/'+id+'.html');
  await expect(page.locator('main').first()).toBeVisible();await expect(page.locator('body')).not.toContainText('共有ランキング');
  await expect(page.locator('#ranking-open,[data-game-ranking]')).toHaveCount(0);
  const broken=await page.evaluate(()=>[...document.images].filter(i=>i.complete&&!i.naturalWidth).map(i=>i.src));expect(broken,id).toEqual([]);
 }
 expect(errors).toEqual([]);expect(requests).toEqual([]);
 expect(await page.evaluate(scope=>localStorage.getItem(scope+'leaderboard_players'),scope)).toBe('[{"nickname":"過去の記録","bestStreak":12}]');
});
for(const size of sizes)test('all subject lists retain ordered title rows '+size.width+'x'+size.height,async({page},info)=>{
 await page.setViewportSize(size);
 for(const [route,count] of [['japanese',1],['social',2],['language',2],['math-calculation',production?7:8]]){
  await page.goto(site+route+'.html');
  await expect(page.locator('.title-game-row')).toHaveCount(count);
  await clean(page,{scroll:true});
  const problems=await page.locator('.title-game-row:visible').evaluateAll(cards=>cards.flatMap(card=>{
   const selectors=['.game-summary','.title-row-art','.title-row-percent','.title-row-best','.game-actions'];
   const boxes=selectors.map(selector=>card.querySelector(selector).getBoundingClientRect());
   return boxes.slice(1).flatMap((box,index)=>box.left<boxes[index].right-1?[card.dataset.gameCard+': columns overlap']:[]);
  }));
  expect(problems).toEqual([]);
  await page.screenshot({path:info.outputPath(route+'.png'),fullPage:true});
 }
});

if(production)for(const size of sizes)test('math units preserve all games and count the active player titles '+size.width,async({page})=>{
 await page.setViewportSize(size);
 await page.addInitScript(()=>localStorage.setItem('mgl_fractionBasics','{"best":25}'));
 await page.goto(site+'math.html');
 const unit=page.locator('[data-unit-id="fractions"]');
 await expect(unit.getByRole('progressbar')).toHaveAttribute('value','100');
 await expect(unit).toContainText('5 / 5個');
 await expect(unit).toContainText('1ゲーム');
 await expect(unit.getByRole('progressbar')).toHaveClass('complete');
 await expect(page.locator('.math-unit-row')).toHaveCount(3);
 await clean(page);
 await unit.getByRole('link').click();
 await expect(page.locator('[data-game-card]')).toHaveCount(1);
 await expect(page.locator('[data-game-card="fractionBasics"] [data-game-play]')).toBeEnabled();
 await page.goto(site+'math-calculation.html');
 const rows=page.locator('[data-game-card]:visible');
 await expect(rows).toHaveCount(7);
 expect(await rows.evaluateAll(cards=>cards.map(card=>card.dataset.gameCard)))
  .toEqual(['keisan','distribution','distribution2','exchangeAssociation','multiplicationProperties','shapeExpressions','keisanSummary']);
 await expect(page.locator('#collectionPager')).toHaveCount(0);
 const play=rows.last().locator('[data-game-play]');
 await play.scrollIntoViewIfNeeded();
 await expect(play).toBeInViewport();
 await expect(play).toBeEnabled();

});

const calculationGames = ['multiplicationProperties', 'shapeExpressions'];
async function checkCalculationArt(locator, id) {
 await expect(locator).toHaveCount(5);
 const images = await locator.evaluateAll(async items => Promise.all(items.map(async image => {
  await image.decode();
  return [image.src.split('/').pop(), image.naturalWidth];
 })));
 expect(images.sort()).toEqual([5, 10, 15, 20, 25].map(at => [
  id + '-' + String(at).padStart(2, '0') + '.png', 512,
 ]));
}

for (const size of sizes) test('calculation title art reaches the tower, cards and collection at ' + size.width, async ({page}) => {
 await page.setViewportSize(size);
 await page.goto(site + 'math-calculation.html');
 for (const id of calculationGames) {
  const row = page.locator('[data-game-card="' + id + '"]');
  await checkCalculationArt(row.locator('.title-row-art img'), id);
 }
 for (const id of calculationGames) {
  await page.goto(site + 'games/' + id + '.html');
  const tower = page.locator('#tower');
  await checkCalculationArt(tower.locator('.mq-badge img'), id);
  for (const image of await tower.locator('img').all()) await expect(image).toBeInViewport({ratio:1});
  await expect(tower.locator('.mq-badge').first()).toHaveCSS('filter', 'grayscale(1)');
  await page.goto(site + 'titles.html');
  await page.locator('#collectionGame').selectOption(id);
  await checkCalculationArt(page.locator('.collection-title-grid img'), id);
 }
});

for (const id of calculationGames) test(id + ' awards illustrated titles and restores them on reload', async ({page}) => {
 test.setTimeout(75000);
 await page.setViewportSize(sizes[0]);
 await page.goto(site + 'games/' + id + '.html');
 const tower = page.locator('#tower');
 for (let streak = 1; streak <= 25; streak++) {
  await expect(page.locator('#choices button').first()).toBeEnabled();
  const correctText = await page.evaluate(id => {
   const state = JSON.parse(window.manabiStorage.getItem('mgl_' + id));
   const pool = id === 'multiplicationProperties'
    ? window.ManabiMultiplication.multiplication() : window.ManabiMathConcepts.shapes();
   const question = pool.find(item => item.id === state.queue[0]);
   return question.answer + (question.unit || '');
  }, id);
  await page.getByRole('button', {name: String(correctText), exact: true}).click();
  await expect(page.locator('#best')).toHaveText(String(streak));
  if (streak % 5 === 0) {
   await expect(tower.locator('li.earned')).toHaveCount(streak / 5);
   await expect(page.locator('.mgl-celebration--title img')).toHaveAttribute('src',
    new RegExp(id + '-' + String(streak).padStart(2, '0') + '\\.png$'));
  }
 }
 await page.reload();
 await expect(tower.locator('li.earned')).toHaveCount(5);
 await expect(page.locator('#best')).toHaveText('25');
 await expect(tower.locator('.mq-badge').first()).toHaveCSS('filter', 'none');
 await expect(page.locator('.mgl-celebration:visible')).toHaveCount(0);
 await page.goto(site + 'titles.html');
 await page.locator('#collectionGame').selectOption(id);
 await expect(page.locator('.collection-title-grid li.earned')).toHaveCount(5);
 await expect(page.locator('.collection-game-heading progress')).toHaveAttribute('value', '100');
});
