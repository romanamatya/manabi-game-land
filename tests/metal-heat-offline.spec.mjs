import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { createDeck } from '../preview/metal-heat-model.js';

const review = new URL('../.release/manabi-metal-heat-review.html', import.meta.url).href;
const isolatedReview = 'http://metal-heat-offline.test/';
const storagePrefix = 'manabi_offline_review:metalHeat:';

function seeded(initialState = 762) {
  let state = initialState;
  return () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}

test.use({ offline: true, viewport: { width: 1024, height: 768 }, hasTouch: true });

for (const stableOrigin of [false, true]) {
  const testName = stableOrigin ? 'offline review retains records at an isolated origin' : 'offline file plays all six formats without network';
  test(testName, async ({ page }) => {
    if (stableOrigin) {
      const html = await readFile(new URL(review), 'utf8');
      await page.route(isolatedReview, route => route.fulfill({ contentType: 'text/html', body: html }));
    }
    const remoteRequests = [];
    page.on('request', request => {
      if (/^https?:/.test(request.url()) && request.url() !== isolatedReview) remoteRequests.push(request.url());
    });
    await page.addInitScript(({ initialState, stableOrigin }) => {
      const nativeRandom = Math.random;
      let state = initialState;
      // The deck captures the first random function it reads. Leave visual effects random.
      Object.defineProperty(Math, 'random', {
        configurable: true,
        get() {
          Object.defineProperty(Math, 'random', { value: nativeRandom, configurable: true, writable: true });
          return () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32;
        },
      });
      if (stableOrigin) {
        localStorage.setItem('mgl_economy_v1', 'production-points-sentinel');
        localStorage.setItem('mgl_metalHeat', 'production-score-sentinel');
      }
    }, { initialState: 762, stableOrigin });
    await page.clock.install();
    await page.goto(stableOrigin ? isolatedReview : review);
    const deck = createDeck(seeded());
    const formats = new Set();
    const options = page.locator('#options button');
    const answer = value => page.locator('#options button[data-value="' + value + '"]');
    const advance = page.locator('#understood');
    for (let i = 0; i < 20; i++) {
      const question = deck.next();
      formats.add(question.type);
      await expect(options).toHaveCount(4);
      await expect(answer(question.answer)).toBeInViewport();
      await answer(question.options.find(value => value !== question.answer)).tap();
      await expect(page.locator('#feedback')).toContainText(question.explanation);
      await expect(advance).toBeInViewport();
      await advance.tap();
    }
    expect(formats.size).toBe(6);

    for (let streak = 1; streak <= 3; streak++) {
      await answer(deck.next().answer).tap();
      await expect(page.locator('#streak')).toHaveText(String(streak));
      await expect(page.locator(streak === 3 ? '.mgl-celebration--title' : '.mgl-celebration--correct')).toBeVisible();
      await page.clock.fastForward(streak === 3 ? 1050 : 530);
    }
    await expect(page.locator('#points')).toHaveText('3');
    // Browsers do not guarantee persistent storage for file: URLs.
    if (stableOrigin) await page.reload();
    await expect(page.locator('#best')).toHaveText('3');
    await expect(page.locator('#points')).toHaveText('3');
    await expect(page.locator('#titles .earned')).toHaveCount(1);
    const titles = page.locator('#titles img');
    await expect(titles).toHaveCount(5);
    expect(await titles.evaluateAll(images => Promise.all(images.map(async image => {
      await image.decode();
      return image.naturalWidth > 0;
    })))).toEqual(Array(5).fill(true));

    expect(await page.evaluate(() => ({
      hasFirebaseConfig: Boolean(window.MANABI_BACKEND_CONFIG.firebase),
      viewportFits: document.documentElement.scrollWidth === innerWidth
        && document.documentElement.scrollHeight === innerHeight,
    }))).toEqual({ hasFirebaseConfig: false, viewportFits: true });
    if (stableOrigin) {
      expect(await page.evaluate(prefix => ({
        best: JSON.parse(localStorage.getItem(prefix + 'mgl_metalHeat')).best,
        productionScore: localStorage.getItem('mgl_metalHeat'),
        productionPoints: localStorage.getItem('mgl_economy_v1'),
      }), storagePrefix)).toEqual({
        best: 3,
        productionScore: 'production-score-sentinel',
        productionPoints: 'production-points-sentinel',
      });
    }
    expect(remoteRequests).toEqual([]);
  });
}
