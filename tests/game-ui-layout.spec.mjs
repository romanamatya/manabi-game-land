import {test,expect} from '@playwright/test';

const base=process.env.MGL_BASE_URL||'http://127.0.0.1:4173/';
const url=path=>new URL(path,base).href;
const games=['alphabet','distribution','distribution2','exchangeAssociation','keisan','keisanSummary','kotowaza','missingAlphabet','multiplicationProperties','parallelPair','pref-name','pref-place','shapeExpressions','suichoku'];
const viewports=[{width:1024,height:768},{width:1194,height:834}];

test.beforeAll(async()=>{
 if(process.env.MGL_EXPECT_LIVE!=='1')return;
 await expect.poll(async()=>{
  try{
   const response=await fetch(url('games/parallelPair.html?ui-check='+Date.now()));
   return response.ok&&(await response.text()).includes('game-home.css?v=game-ui-unify-v1');
  }catch{return false}
 },{timeout:90000,intervals:[1000,2000,5000]}).toBe(true);
});

test.beforeEach(async({page})=>{
 await page.route(/https:\/\/(identitytoolkit|securetoken|firestore)\.googleapis\.com\//,route=>route.abort());
 await page.addInitScript(()=>localStorage.setItem('mgl_nickname','画面テスト'));
});

test('all 14 games show the official top-right logo and link to subject selection',async({page})=>{
 test.setTimeout(120000);
 for(const id of games){
  await page.goto(url('games/'+id+'.html?adminTest=1'),{waitUntil:'domcontentloaded'});
  const logo=page.locator('a[href="../index.html"]').filter({has:page.getByAltText('マナビクエスト',{exact:true})});
  await expect(logo,id).toHaveCount(1);
  const img=logo.locator('img');
  await expect.poll(()=>img.evaluate(i=>i.complete&&i.naturalWidth>0),{message:id}).toBe(true);
  for(const viewport of viewports){
   await page.setViewportSize(viewport);
   const box=await logo.boundingBox();
   expect(box,id).toBeTruthy();
   expect(box.x,id).toBeGreaterThan(viewport.width/2);
   expect(box.x+box.width,id).toBeLessThanOrEqual(viewport.width+1);
   expect(box.y,id).toBeGreaterThanOrEqual(0);
   expect(box.y+box.height,id).toBeLessThanOrEqual(105);
   const overlapsTitle=await logo.evaluate(anchor=>{
    const a=anchor.getBoundingClientRect();
    return [...document.querySelectorAll('h1')].some(node=>{
     if(getComputedStyle(node).visibility==='hidden')return false;
     const range=document.createRange();
     range.selectNodeContents(node);
     return [...range.getClientRects()].some(h=>h.width>0&&h.height>0&&
       a.left<h.right-1&&a.right>h.left+1&&a.top<h.bottom-1&&a.bottom>h.top+1);
    });
   });
   expect(overlapsTitle,id).toBe(false);
  }
  await logo.click();
  await expect(page).toHaveURL(url('index.html'));
  await expect(page.getByText('どの教科で遊ぶ？',{exact:true})).toBeVisible();
 }
});

test('parallel tower reuses the right-hand layout and renders all approved rank images',async({page})=>{
 for(const id of ['suichoku','parallelPair']){
  await page.goto(url('games/'+id+'.html?adminTest=1'),{waitUntil:'domcontentloaded'});
  const tower=page.locator('.sq-titles'),main=page.locator('.sq-main');
  await expect(tower.getByRole('heading',{name:'称号タワー'})).toBeVisible();
  for(const viewport of viewports){
   await page.setViewportSize(viewport);
   const board=await main.boundingBox(),box=await tower.boundingBox();
   expect(box.x).toBeGreaterThanOrEqual(board.x+board.width);
   expect(box.y+box.height).toBeLessThanOrEqual(viewport.height);
  }
  if(id==='parallelPair'){
   const items=tower.locator('li');
   await expect(items).toHaveCount(5);
   await expect(items).toHaveText(['平行の王者25問連続','平行の達人15問連続','平行マスター10問連続','平行ハンター5問連続','平行みならい3問連続']);
   for(const img of await items.locator('img').all()){
    await expect(img).toBeVisible();
    await expect.poll(()=>img.evaluate(i=>i.complete&&i.naturalWidth===512)).toBe(true);
   }
  }
 }
});
