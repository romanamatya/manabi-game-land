import { test, expect } from '@playwright/test';

const url = 'http://127.0.0.1:4173/preview/games/fractionBasics.html';
const viewports = [{ width: 1024, height: 768 }, { width: 1194, height: 834 }, { width: 960, height: 540 }];
test.use({ isMobile: true, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
});

test('preview page fits iPad landscape; wrong answer explains and waits for acknowledgment', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const size of viewports) {
    await page.setViewportSize(size);
    await page.goto(url);
    await expect(page.locator('#question')).not.toContainText('準備しています');
    await expect(page.locator('#streak')).toHaveText('0');
    const viewport = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));
    expect(viewport.width).toBeLessThanOrEqual(size.width + 1);
    expect(viewport.height).toBeLessThanOrEqual(size.height + 1);
    await expect(page.locator('.game')).toBeInViewport();
    await expect(page.locator('#restart')).toBeInViewport();

    // All 12 types appear once per deck. Every question can be answered incorrectly.
    const types = [];
    for (let i = 0; i < 12; i++) {
      const label = await page.locator('#category').textContent();
      types.push(label);
      const diagramAnswer = await page.locator('#diagram [data-count]').count();
      if (diagramAnswer) {
        const denominator = Number(await page.locator('#question .fraction span').nth(1).textContent());
        const numerator = Number(await page.locator('#question .fraction span').nth(0).textContent());
        expect(denominator).toBeGreaterThan(1);
        const wrong = numerator === 1 ? 2 : 1;
        await page.locator('#diagram [data-count="' + wrong + '"]').tap();
      } else {
        await page.locator('#options button').first().tap();
        // If the initial answer happened to be correct, wait for automatic advance.
        if (await page.locator('#feedback').evaluate(node => !node.classList.contains('wrong'))) {
          await expect(page.locator('#question-number')).toHaveText('第' + (i + 2) + '問');
          continue;
        }
      }
      await expect(page.locator('#feedback')).toContainText('まちがいを確認しよう');
      await expect(page.locator('#feedback')).toContainText('正しい答え');
      await expect(page.locator('#question-number')).toHaveText('第' + (i + 1) + '問');
      await page.locator('#understood').tap();
      await expect(page.locator('#question-number')).toHaveText('第' + (i + 2) + '問');
    }
    expect(new Set(types).size).toBe(12);
  }
  expect(errors).toEqual([]);
});

test('reverse tape/pizza accept a direct tap; best unlocks 120-second challenge', async ({ page }) => {
  await page.setViewportSize(viewports[0]);
  await page.goto(url);
  let reverseCount = 0;
  for (let i = 0; i < 12; i++) {
    const reverse = (await page.locator('#diagram [data-count]').count()) > 0;
    if (reverse) {
      reverseCount++;
      const numerator = Number(await page.locator('#question .fraction span').nth(0).textContent());
      await page.locator('#diagram [data-count="' + numerator + '"]').tap();
      await expect(page.locator('#feedback')).toContainText('正解！');
      await expect(page.locator('#question-number')).toHaveText('第' + (i + 2) + '問');
    } else {
      await page.locator('#options button').first().tap();
      if (await page.locator('#feedback').evaluate(el => el.classList.contains('wrong'))) {
        await page.locator('#understood').tap();
      } else {
        await expect(page.locator('#question-number')).toHaveText('第' + (i + 2) + '問');
      }
    }
  }
  expect(reverseCount).toBe(2);
  await page.evaluate(() => localStorage.setItem('mq_fractionBasics_preview_v1', JSON.stringify({ best: 25 })));
  await page.reload();
  await expect(page.locator('#gate')).toBeVisible();
  await page.locator('#challenge-start').tap();
  await expect(page.locator('#streak')).toHaveText('25');
  await expect(page.locator('#clock')).toContainText('残り');
});
