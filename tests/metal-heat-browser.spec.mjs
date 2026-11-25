import { test, expect } from '@playwright/test';
import { createDeck } from '../preview/metal-heat-model.js';
import { mockPublicVisibility } from './fixtures/public-visibility-browser.mjs';

const base = 'http://127.0.0.1:4173/preview/';
const url = base + 'games/metalHeat.html';
const scope = 'manabi_public_preview:';
function seeded() {
  let state = 762;
  return () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}
test.use({ isMobile: true, hasTouch: true });
test.beforeEach(async ({page}) => {
  await page.route('https://**/*', route => route.abort());
  await page.addInitScript(key => localStorage.setItem(key, '理科確認'),scope+'mgl_nickname');
  await page.route(/\/metal-heat-model\.js\?v=[\w-]+$/, route => route.fulfill({
    contentType:'application/javascript',
    body:`export { GAME, questionFromPrompt } from './metal-heat-model.js?real';
      import { createDeck as makeDeck } from './metal-heat-model.js?real';
      export const createDeck = () => makeDeck((${seeded})());`,
  }));
});
const options = page => page.locator('#options button');
const answer = (page, value) => page.locator('#options button[data-value="'+value+'"]');

for (const size of [{width:1024,height:768},{width:1194,height:834},{width:960,height:540}]) {
  test('six formats and correction feedback fit iPad landscape at '+size.width, async ({page}) => {
    await page.setViewportSize(size);
    await mockPublicVisibility(page,{metalHeat:'published'});
    await page.goto(base+'index.html');
    await expect(page.getByRole('link',{name:'理科 ゲームを選ぶ'})).toBeVisible();
    await page.getByRole('link',{name:'理科 ゲームを選ぶ'}).click();
    await expect(page.locator('[data-game-card="metalHeat"]')).toBeVisible();
    await expect(page.locator('[data-game-card="metalHeat"] .title-row-art img')).toHaveCount(5);
    await page.goto(base+'titles.html?subject=science&game=metalHeat');
    await expect(page.locator('.collection-title-grid img')).toHaveCount(5);
    await page.goto(url);
    const deck = createDeck(seeded());
    const seen = new Set();
    for (let i=0;i<20;i++) {
      const q=deck.next();
      if (!seen.has(q.type)) {
        seen.add(q.type);
        await expect(options(page)).toHaveCount(4);
        for (const button of await options(page).all()) await expect(button).toBeInViewport();
        if (q.type==='predict') await expect(options(page).locator('svg')).toHaveCount(8);
        if (q.type==='first'||q.type==='order') await expect(page.locator('#diagram svg text')).toHaveCount(q.visual.sites.length);
      }
      await answer(page,q.options.find(v=>v!==q.answer)).tap();
      await expect(page.locator('#feedback')).toContainText(q.explanation);
      await expect(page.locator('#understood')).toBeInViewport();
      expect(await page.evaluate(() => ({
        x:document.documentElement.scrollWidth, y:document.documentElement.scrollHeight,
      }))).toEqual({x:size.width,y:size.height});
      await page.locator('#understood').tap();
    }
    expect(seen.size).toBe(6);
    await expect(page.locator('#titles img')).toHaveCount(5);
    expect(await page.locator('#titles img').evaluateAll(images=>Promise.all(images.map(async img=>{
      await img.decode();
      return img.naturalWidth > 0;
    })))).toEqual(Array(5).fill(true));
  });
}
for (const status of [null,'hidden','preparing','read-error']) {
  test('list and direct URL are closed for '+status, async ({page}) => {
    await mockPublicVisibility(page,{metalHeat:status});
    await page.goto(base+'science.html');
    await expect(page.locator('[data-game-card="metalHeat"]')).toBeHidden();
    await page.goto(url);
    await expect(page.locator('#access')).toBeVisible();
    await expect(page.locator('#access')).not.toContainText('確認しています');
    await expect(options(page)).toHaveCount(0);
  });
}
test('tap guard, titles, daily cap, best and 120-second challenge use shared storage',async ({page})=>{
  await mockPublicVisibility(page,{metalHeat:'published'});
  await page.clock.install();
  await page.goto(url);
  const deck=createDeck(seeded());
  for(let n=1;n<=51;n++) {
    const button=answer(page,deck.next().answer);
    if(n===1) await button.evaluate(el=>{ el.click();el.click(); });
    else await button.tap();
    await expect(page.locator('#streak')).toHaveText(String(n));
    await expect(page.locator(n===3?'.mgl-celebration--title':n===1?'.mgl-celebration--correct':'#best')).toBeVisible();
    await page.clock.fastForward([3,5,10,15,25].includes(n)?1050:530);
    if(n===25) {
      await expect(page.locator('#titles .earned')).toHaveCount(5);
      await page.locator('#challenge-start').tap();
      await expect(page.locator('#clock')).toContainText('残り 2:00');
    }
  }
  await expect(page.locator('#points')).toHaveText('50');
  await page.reload();
  await expect(page.locator('#best')).toHaveText('51');
  await expect(page.locator('#points')).toHaveText('50');
  await expect(page.locator('#titles .earned')).toHaveCount(5);
  await page.clock.fastForward(121000);
  await expect(page.locator('#gate-message')).toContainText('時間切れ');
});
