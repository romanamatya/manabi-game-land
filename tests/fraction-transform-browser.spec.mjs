import { test, expect } from '@playwright/test';
import { createDeck, TYPES } from '../preview/fraction-transform-model.js';
import { mockPublicVisibility } from './fixtures/public-visibility-browser.mjs';

const production = process.env.MGL_FRACTION_TARGET === 'production';
const base = 'http://127.0.0.1:4173/' + (production ? '' : 'preview/');
const url = base + 'games/fractionTransform.html';
const scope = production ? '' : 'manabi_public_preview:';
const viewports = [{ width: 1024, height: 768 }, { width: 1194, height: 834 }, { width: 960, height: 540 }];
const seed = 321;
function seeded(seed) {
  let state = seed;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}
test.use({ isMobile: true, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
  await mockPublicVisibility(page,{fractionTransform:'published'});
  await page.addInitScript(scope => localStorage.setItem(scope+'mgl_nickname','ゲーム確認'),scope);
  await page.route(/\/fraction-transform-model\.js(?:\?v=[a-f0-9]+)?$/, route => route.fulfill({
    contentType:'application/javascript',
    body:`export { GAME } from './fraction-transform-model.js?real';
      import { createDeck as create } from './fraction-transform-model.js?real';
      export const createDeck = () => create((${seeded}) (${seed}));`,
  }));
});

function selector(question, value) {
  return question.visual?.interactive ? '#diagram [data-count="'+value+'"]' : '#options button[data-value="'+value+'"]';
}
function wrongAnswer(question) {
  return question.visual?.interactive ? (question.answer==='1'?'2':'1') : question.options.find(value=>value!==question.answer);
}
async function fits(page,size) {
  const viewport = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  expect(viewport.width).toBeLessThanOrEqual(size.width + 1);
  expect(viewport.height).toBeLessThanOrEqual(size.height + 1);
  await expect(page.locator('#titles li').last()).toBeInViewport();
}
const stored = (page, key) => page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'),scope+key);

for (const size of viewports) test('four equal buttons and five badges at ' + size.width, async ({page}) => {
  await page.setViewportSize(size);
  await page.clock.install();
  await page.goto(url);
  const deck = createDeck(seeded(seed));
  for (const type of TYPES) {
    const q = deck.next();
    const boxes = await page.locator('#options button').evaluateAll(items => items.map(item => {
      const rect = item.getBoundingClientRect();
      return {x:rect.x, y:rect.y, width:rect.width, height:rect.height, bottom:rect.bottom};
    }));
    expect(boxes).toHaveLength(4);
    const prompt = await page.locator('#question').boundingBox();
    for (const box of boxes) {
      expect(box.y).toBeCloseTo(boxes[0].y);
      expect(box.width).toBeCloseTo(boxes[0].width,0);
      expect(box.height).toBeCloseTo(boxes[0].height,0);
      expect(box.x+box.width).toBeLessThanOrEqual(size.width);
      expect(box.y).toBeGreaterThanOrEqual(prompt.y+prompt.height);
    }
    for (const mixed of await page.locator('.mixed-number').all()) {
      expect(await mixed.textContent()).not.toContain('と');
      const centers = await mixed.locator(':scope > span').evaluateAll(items => items.map(el => {
        const box = el.getBoundingClientRect();
        return box.top + box.height/2;
      }));
      expect(Math.abs(centers[0]-centers[1])).toBeLessThan(1);
    }
    await page.locator(selector(q,wrongAnswer(q))).tap();
    await expect(page.locator('.mgl-celebration:visible')).toHaveCount(0);
    await expect(page.locator('#feedback')).toContainText('正しい答え');
    await expect(page.locator('#understood')).toBeInViewport();
    await fits(page,size);
    await page.locator('#understood').tap();
  }
  await expect(page.locator('#titles img')).toHaveCount(5);
  expect(await page.locator('#titles img').evaluateAll(images=>Promise.all(images.map(async img=>{
    await img.decode();
    return img.naturalWidth;
  })))).toEqual(Array(5).fill(1024));
});
test('five formal titles, saved record and daily points cap survive reload; challenge can end and retry', async ({ page }) => {
  const size = viewports[2];
  await page.setViewportSize(size);
  await page.clock.install();
  await page.goto(url);
  const deck = createDeck(seeded(seed));
  async function right(q, expected, doubleTap = false) {
    const answer = page.locator(selector(q,q.answer));
    if (doubleTap) {
      await answer.evaluate(el=>{ el.dispatchEvent(new MouseEvent('click',{bubbles:true}));el.dispatchEvent(new MouseEvent('click',{bubbles:true})); });
    } else await answer.tap();
    const award = [3,5,10,15,25].includes(expected) && expected <= 25;
    if (award) {
      await expect(page.locator('.mgl-celebration--title img')).toBeVisible();
      await expect(page.locator('.mgl-celebration--correct')).toHaveCount(0);
      await page.clock.fastForward(530);
      await expect(page.locator('.mgl-celebration--title')).toBeVisible();
    } else await expect(page.locator('.mgl-celebration--correct')).toBeVisible();
    await expect(page.locator('#streak')).toHaveText(String(expected));
    await page.clock.fastForward(520);
  }
  let rank = 0;
  for (let n=1; n<=25; n++) {
    if ([3,5,10,15,25].includes(n)) rank++;
    await right(deck.next(),n,n===1);
    await expect(page.locator('#titles li.earned')).toHaveCount(rank);
  }
  await expect(page.locator('#gate')).toBeVisible();
  await expect(page.locator('#clock')).toHaveText('120秒チャレンジ');
  await expect.poll(async ()=>(await stored(page,'mgl_economy_v1'))?.balances.math).toBe(25);
  expect((await stored(page,'mgl_fractionTransform')).titles).toEqual([3,5,10,15,25].map(n=>'fractionTransform:'+n));
  await page.locator('#challenge-start').tap();
  await expect(page.locator('#clock')).toContainText('残り 2:00');
  for (let n=1; n<=26; n++) await right(deck.next(),25+n);
  await expect.poll(async ()=>(await stored(page,'mgl_economy_v1'))?.daily.games.fractionTransform).toBe(50);
  expect((await stored(page,'mgl_economy_v1')).balances.math).toBe(50);
  await page.reload();
  await expect(page.locator('#best')).toHaveText('51');
  await expect(page.locator('#clock')).toContainText('残り');
  const afterReload = createDeck(seeded(seed)).next();
  await page.locator(selector(afterReload,wrongAnswer(afterReload))).tap();
  await expect(page.locator('#feedback')).toContainText('正しい答え');
  await page.locator('#understood').tap();
  await expect(page.locator('#gate-title')).toHaveText('120秒チャレンジ終了');
  await page.locator('#challenge-start').tap();
  await page.clock.fastForward(121000);
  await expect(page.locator('#gate-message')).toContainText('時間切れ');
  await expect(page.locator('#best')).toHaveText('51');
  await page.goto(base + 'math-fractions.html');
  const row = page.locator('[data-game-card="fractionTransform"]');
  await expect(row.locator('.new-game-badge')).toHaveText('NEW');
  await expect(row.locator('.title-row-percent')).toContainText('100');
  await expect(row.locator('.title-row-best')).toContainText('51');
  await expect(page.locator('[data-game-card]:visible').first()).toHaveAttribute('data-game-card','fractionBasics');
  await page.goto(base + 'math.html');
  await expect(page.locator('[data-unit-id="fractions"] progress')).toHaveAttribute('value','50');
  const totals = await page.evaluate(()=> {
    const result = window.ManabiTitleCollection.snapshot();
    return [result.subjects.find(s=>s.id==='math').earned,result.overall.earned];
  });
  expect(totals).toEqual([5,5]);
  await page.goto(base + 'titles.html');
  await page.locator('#collectionGame').selectOption('fractionTransform');
  await expect(page.locator('.collection-title-grid li.earned img')).toHaveCount(5);
  await page.goto(base + 'index.html');
  await expect.poll(()=>page.evaluate(()=>window.ManabiTitleCollection.snapshot().games.find(game=>game.id==='fractionTransform')?.earned)).toBe(5);
});
test('hidden visibility disables play in the list and on the direct game page', async ({page})=>{
  await page.unroute(/\/public-firebase-session\.js(?:\?|$)/);
  await mockPublicVisibility(page,{fractionTransform:'hidden'});
  await page.goto(base+'math-fractions.html');
  const row = page.locator('[data-game-card="fractionTransform"]');
  await expect(row.locator('[data-game-play]')).toBeDisabled();
  await expect(row.locator('.new-game-badge')).toHaveCount(0);
  await page.goto(url);
  await expect(page.locator('#access')).toHaveText('このゲームは現在非公開です。');
  await expect(page.locator('#options button')).toHaveCount(0);
});
