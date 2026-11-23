import { test, expect } from '@playwright/test';
import { createDeck, TYPES } from '../preview/fraction-basics-model.js';
import { mockPublicVisibility } from './fixtures/public-visibility-browser.mjs';

const production = process.env.MGL_FRACTION_TARGET === 'production';
const base = 'http://127.0.0.1:4173/' + (production ? '' : 'preview/');
const url = base + 'games/fractionBasics.html';
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
  await mockPublicVisibility(page,{fractionBasics:'published'});
  await page.addInitScript(scope => localStorage.setItem(scope+'mgl_nickname','ゲーム確認'),scope);
  await page.route(/\/fraction-basics-model\.js(?:\?v=[\w-]+)?$/, route => route.fulfill({
    contentType:'application/javascript',
    body:`export { GAME } from './fraction-basics-model.js?real';
      import { createDeck as create } from './fraction-basics-model.js?real';
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

test('three iPad sizes: all question formats, correct diagram painting and wrong feedback', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const size of viewports) {
    await page.setViewportSize(size);
    const deck = createDeck(seeded(seed));
    await page.goto(url);
    await expect(page.locator('#question')).not.toContainText('準備しています');
    await expect(page.locator('#titles img')).toHaveCount(5);
    expect(await page.locator('#titles img').evaluateAll(imgs => imgs.map(img=>img.naturalWidth))).toEqual(Array(5).fill(1024));
    await fits(page,size);
    for (let i=0; i<TYPES.length; i++) {
      const q = deck.next();
      await expect(page.locator('#category')).toHaveText(q.label);
      if (q.visual?.filled) await expect(page.locator('#diagram [fill="#f3ae55"]')).toHaveCount(q.visual.k);
      if (q.visual?.kind === 'line') {
        const marker = await page.locator('#diagram path').first().getAttribute('d');
        expect(Number(marker.split(' ')[1])).toBeCloseTo(40 + 440 * q.visual.k / (2*q.visual.n));
      }
      if (!q.visual?.interactive) {
        const layout = await page.locator('#options button').evaluateAll(buttons => buttons.map(button => {
          const {x,y,width,height} = button.getBoundingClientRect();
          return {x,y,width,height};
        }));
        expect(layout).toHaveLength(4);
        const questionBounds = await page.locator('#question').boundingBox();
        const visualBounds = q.visual ? await page.locator('#diagram').boundingBox() : null;
        expect(layout[0].y).toBeGreaterThanOrEqual((visualBounds ?? questionBounds).y + (visualBounds ?? questionBounds).height - 1);
        const gap = layout[1].x - layout[0].x - layout[0].width;
        expect(gap).toBeGreaterThan(0);
        for (const [i, box] of layout.entries()) {
          expect(box.y).toBeCloseTo(layout[0].y, 0);
          expect(box.height).toBeCloseTo(layout[0].height, 0);
          expect(box.width).toBeCloseTo(layout[0].width, 0);
          expect(box.x).toBeCloseTo(layout[0].x + i * (layout[0].width + gap), 0);
          expect(box.x + box.width).toBeLessThanOrEqual(size.width);
          expect(box.y + box.height).toBeLessThanOrEqual(size.height);
        }
        if (q.options[0].includes('/')) {
          const fractions = page.locator('#options .fraction');
          await expect(fractions).toHaveCount(4);
          const typography = await fractions.evaluateAll(items => items.map(item => {
            const [top,bottom] = item.children;
            const size = getComputedStyle(top).fontSize;
            return {stacked:top.getBoundingClientRect().bottom <= bottom.getBoundingClientRect().top+1,
              size, bottomSize:getComputedStyle(bottom).fontSize,
              rule:getComputedStyle(top).borderBottomWidth, ruleWidth:top.getBoundingClientRect().width};
          }));
          expect(typography.every(fraction => fraction.stacked && fraction.size === typography[0].size &&
            fraction.bottomSize === fraction.size && fraction.rule === typography[0].rule &&
            fraction.ruleWidth === typography[0].ruleWidth)).toBe(true);
          expect(parseFloat(typography[0].size)).toBeGreaterThanOrEqual(20);
          expect(parseFloat(typography[0].rule)).toBeGreaterThan(0);
        }
      }
      const action = page.locator(selector(q,wrongAnswer(q)));
      if (q.visual?.interactive) {
        // WebKit's intersection observer reports zero for individual SVG shapes.
        // Check their actual bounds before tapping, which also verifies the target is hittable.
        const target = await action.boundingBox();
        expect(target).not.toBeNull();
        expect(target.width).toBeGreaterThan(0);
        expect(target.height).toBeGreaterThan(0);
        expect(target.x).toBeGreaterThanOrEqual(0);
        expect(target.y).toBeGreaterThanOrEqual(0);
        expect(target.x + target.width).toBeLessThanOrEqual(size.width);
        expect(target.y + target.height).toBeLessThanOrEqual(size.height);
      } else await expect(action).toBeInViewport();
      await action.tap();
      await expect(page.locator('#feedback')).toContainText('正しい答え');
      if (q.visual?.interactive) await expect(page.locator('#diagram [fill="#f3ae55"]')).toHaveCount(q.visual.k);
      await expect(page.locator('#question-number')).toHaveText('第' + (i + 1) + '問');
      await fits(page,size);
      await expect(page.locator('#understood')).toBeInViewport();
      await page.locator('#understood').tap();
    }
  }
  expect(errors).toEqual([]);
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
    await expect(page.locator('#feedback')).toHaveText('正解！');
    await expect(page.locator('#streak')).toHaveText(String(expected));
    await page.clock.fastForward([3,5,10,15,25].includes(expected) && expected<=25 ? 1020 : 520);
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
  expect((await stored(page,'mgl_fractionBasics')).titles).toEqual([3,5,10,15,25].map(n=>'fractionBasics:'+n));
  await page.locator('#challenge-start').tap();
  await expect(page.locator('#clock')).toContainText('残り 2:00');
  for (let n=1; n<=26; n++) await right(deck.next(),25+n);
  await expect.poll(async ()=>(await stored(page,'mgl_economy_v1'))?.daily.games.fractionBasics).toBe(50);
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
  const row = page.locator('[data-game-card="fractionBasics"]');
  if (!production) await expect(row.locator('.new-game-badge')).toHaveCount(0);
  await expect(row.locator('.title-row-percent')).toContainText('100');
  await expect(row.locator('.title-row-best')).toContainText('51');
  await page.goto(base + 'titles.html?game=fractionBasics');
  await expect(page.locator('.collection-title-grid li.earned img')).toHaveCount(5);
  await page.goto(base + 'index.html');
  await expect.poll(()=>page.evaluate(()=>window.ManabiTitleCollection.snapshot().games.find(game=>game.id==='fractionBasics')?.earned)).toBe(5);
});
test('hidden visibility disables play in the list and on the direct game page', async ({page})=>{
  await page.unroute(/\/public-firebase-session\.js(?:\?|$)/);
  await mockPublicVisibility(page,{fractionBasics:'hidden'});
  await page.goto(base+'math-fractions.html');
  const row = page.locator('[data-game-card="fractionBasics"]');
  await expect(row.locator('[data-game-play]')).toBeDisabled();
  await expect(row.locator('.new-game-badge')).toHaveCount(0);
  await page.goto(url);
  await expect(page.locator('#access')).toHaveText('このゲームは現在非公開です。');
  await expect(page.locator('#options button')).toHaveCount(0);
});
