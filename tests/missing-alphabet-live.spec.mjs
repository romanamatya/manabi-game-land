import {test,expect} from '@playwright/test';

const baseURL=process.env.MGL_BASE_URL||'http://127.0.0.1:4173/';
const pageURL=path=>new URL(path,baseURL).href;
const blockFirebaseApi=page=>page.route(/https:\/\/(identitytoolkit|securetoken|firestore)\.googleapis\.com\//,route=>route.abort());

test('preview game renders approved titles and supports wrong-answer retry then correct progression',async({page})=>{
 await blockFirebaseApi(page);
 await page.setViewportSize({width:1194,height:834});
 await page.goto(pageURL('preview/games/missingAlphabet.html?adminTest=1'));
 await expect(page.locator('#questionLetters span')).toHaveCount(4);
 await expect(page.locator('#choices button')).toHaveCount(4);
 await expect(page.locator('#tower > li')).toHaveCount(5);
 for(const image of await page.locator('#tower img').all()){
  await expect(image).toBeVisible();
  await expect.poll(()=>image.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
 }
 await page.evaluate(()=>{
  window.addEventListener('manabi-learning-answer',event=>{
   if(event.detail?.game==='missingAlphabet'&&event.detail.correct===true){
    window.testEnglishBestAtAnswer=JSON.parse(window.manabiStorage.getItem('mgl_missingAlphabet')).best;
   }
  });
 });
 const first=await page.evaluate(()=>window.MissingAlphabetGame.question());
 const wrongIndex=(first.correctIndex+1)%4;
 await page.locator(`#choices button[data-choice-index="${wrongIndex}"]`).click();
 await expect(page.locator('#feedback')).toHaveClass(/bad/);
 await expect(page.locator('#feedback')).toContainText('不正解');
 await expect.poll(()=>page.evaluate(()=>window.MissingAlphabetGame.state().streak)).toBe(0);
 await page.locator(`#choices button[data-choice-index="${first.correctIndex}"]`).click();
 await expect.poll(()=>page.evaluate(()=>window.MissingAlphabetGame.state().streak)).toBe(1);
 expect(await page.evaluate(()=>window.testEnglishBestAtAnswer)).toBe(1);
 await expect(page.locator('#choices button').first()).toBeEnabled({timeout:2500});
 await expect.poll(()=>page.evaluate(()=>window.MissingAlphabetGame.question()?.id)).not.toBe(first.id);
 await expect(page.locator('#points')).toHaveText('0');
 expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight)).toBe(true);
});
