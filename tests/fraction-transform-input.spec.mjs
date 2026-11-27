import { test, expect } from '@playwright/test';
import { mockPublicVisibility } from './fixtures/public-visibility-browser.mjs';

const game = 'fractionTransformInput';
const base = 'http://127.0.0.1:4173/preview/';
const direct = base + 'games/' + game + '.html';
const titles = new Map([[3,'分数ルーキー'],[5,'分数ハンター'],[10,'分数マスター'],[15,'分数の達人'],[25,'分数の覇王']]);
async function visibleArt(images, minimum, count = 5) {
  await expect(images).toHaveCount(count);
  await images.evaluateAll(items => Promise.all(items.map(image => image.decode())));
  for (const image of await images.all()) {
    await expect(image).toBeInViewport({ratio:1});
    const box = await image.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(minimum);
    expect(box.height).toBeGreaterThanOrEqual(minimum);
  }
}
const options = page => page.locator('#options');
const key = (page, value) => options(page).locator('[data-key="' + value + '"]');
const set = async (page, field, value) => {
  await options(page).locator('[data-field="' + field + '"]').tap();
  for (const digit of String(value)) await key(page, digit).tap();
};
test.use({ hasTouch: true, isMobile: true });
test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
  await page.addInitScript(() => localStorage.setItem('manabi_public_preview:mgl_nickname','数字入力テスト'));
});

for (const status of [null, 'hidden', 'preparing', 'read-error']) {
  test('closed in both list and direct URL when ' + status, async ({ page }) => {
    await mockPublicVisibility(page, { [game]: status });
    await page.goto(base + 'math-fractions.html');
    await expect(page.locator('[data-game-card="' + game + '"]')).toBeHidden();
    await expect(page.locator('[data-game-card="fractionTransform"]')).toBeVisible();
    await page.goto(direct);
    await expect(page.locator('#access')).toBeVisible();
    await expect(page.locator('#access')).not.toContainText('確認しています');
    await expect(options(page)).toBeHidden();
  });
}

async function deterministicDeck(page) {
  await page.route(/fraction-transform-input-model\.js\?v=/, route => route.fulfill({
    contentType:'application/javascript',
    body:`export { GAME, answerFields, checkInput } from './fraction-transform-input-model.js?real';
      export function createDeck() {
        const questions = [
          {type:'improperToMixed', n:4, k:11, answer:'2と3/4', prompt:'11/4 を帯分数か整数に直そう。'},
          {type:'improperToInteger', n:4, k:8, answer:'2', prompt:'8/4 を帯分数か整数に直そう。'},
          {type:'mixedToImproper', n:4, k:11, answer:'11/4', prompt:'2と3/4 を仮分数に直そう。'},
        ];
        let turn=0;
        return {next() {
          const {type,n,k,answer,prompt}=questions[turn++ % 3], reverse=type==='mixedToImproper';
          return {direction:reverse?'toImproper':'fromImproper', label:reverse?'帯分数 → 仮分数':'仮分数 → 帯分数・整数',
            answer, prompt, scorePrompt:{type,n,k}, explanation:'答えの形と分母をたしかめよう。'};
        }};
      }`,
  }));
}

for (const [width, height] of [[960,540], [1024,768], [1194,834]]) {
  test('touch input and both conversion directions fit ' + width, async ({ page }) => {
    await page.setViewportSize({width,height});
    await mockPublicVisibility(page, { [game]:'published' });
    await deterministicDeck(page);
    await page.clock.install();
    await page.goto(base + 'titles.html?subject=math&game=' + game);
    await page.locator('#collectionGame').selectOption(game);
    await expect(page.locator('.collection-title-grid > li > strong')).toHaveText([...titles.values()]);
    await visibleArt(page.locator('.collection-title-grid img'), 65);
    await page.goto(base + 'math-fractions.html');
    const card = page.locator('[data-game-card="' + game + '"]');
    await expect(card).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    await visibleArt(card.locator('.title-row-art img'), 22);
    await card.getByRole('button',{name:'プレイ'}).tap();
    await expect(page).toHaveURL(direct);
    await expect(options(page).locator('[data-field]')).toHaveCount(3);
    const digit = key(page, '7');
    await expect(digit).toBeInViewport();
    expect((await digit.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])).toEqual([width,height]);
    await visibleArt(page.locator('#titles img'), 44);
    await set(page, 'whole', '2');
    await set(page, 'top', '3');
    await key(page, 'submit').tap();
    await expect(page.locator('[data-input-message]')).toContainText('必要な数字');
    await expect(page.locator('#streak')).toHaveText('0');
    await set(page, 'bottom', '4');
    await key(page, 'delete').tap();
    await key(page, '5').tap();
    await key(page, 'submit').tap();
    await expect(page.locator('#feedback')).toContainText('正しい答え');
    await expect(options(page)).toBeHidden();
    await expect(page.locator('#understood')).toBeInViewport({ratio:1});
    await page.locator('#understood').tap();
    await expect(options(page).locator('[data-field]')).toHaveCount(3);
    await key(page, '6').tap();
    await key(page, 'clear').tap();
    await set(page, 'whole', '2');
    await key(page, 'submit').tap();
    await expect(page.locator('#streak')).toHaveText('1');
    await page.clock.fastForward(550);
    await expect(options(page).locator('[data-field]')).toHaveCount(2);
    await set(page, 'top', '11');
    await set(page, 'bottom', '4');
    const submit = key(page, 'submit');
    await submit.evaluate(btn => { btn.click(); btn.click(); });
    await expect(page.locator('#streak')).toHaveText('2');
    await expect(page.locator('#points')).toHaveText('2');
    await expect(page.locator('[data-analysis=fromImproper]')).toContainText('1 / 2問正解');
    await expect(page.locator('[data-analysis=toImproper]')).toContainText('1 / 1問正解');
    await page.reload();
    await expect(page.locator('#best')).toHaveText('2');
    await expect(page.locator('#points')).toHaveText('2');
  });
}

test('titles, daily point cap, challenge and existing game records remain separate', async ({ page }) => {
  await page.setViewportSize({ width:960, height:540 });
  await page.emulateMedia({ reducedMotion:'reduce' });
  await mockPublicVisibility(page, { [game]:'published' });
  await deterministicDeck(page);
  await page.clock.install();
  await page.goto(direct);
  await page.evaluate(() => {
    for (const id of ['fractionBasics', 'fractionTransform']) {
      window.manabiStorage.setItem('mgl_' + id, JSON.stringify({best:11}));
      window.manabiStorage.setItem('mgl_challenge120_v1:' + id, 'existing-challenge');
    }
  });
  for (let number=1; number<=51; number++) {
    if (number % 3 === 1) {
      await set(page, 'whole', '2');
      await set(page, 'top', '3');
      await set(page, 'bottom', '4');
    } else if (number % 3 === 2) await set(page, 'whole', '2');
    else {
      await set(page, 'top', '11');
      await set(page, 'bottom', '4');
    }
    await key(page, 'submit').tap();
    await expect(page.locator('#streak')).toHaveText(String(number));
    const earned = titles.has(number);
    if (earned) {
      const celebration = page.locator('.mgl-celebration--title');
      await expect(celebration).toBeVisible();
      await expect(celebration.locator('h2')).toHaveText(titles.get(number));
      const art = celebration.locator('img');
      await expect(art).toHaveAttribute('src', await page.locator('#titles li[data-at="' + number + '"] img').evaluate(image => image.src));
      await visibleArt(art, 130, 1);
    }
    await page.clock.fastForward(earned ? 1050 : 550);
    if (number === 25) {
      await expect(page.locator('#titles .earned')).toHaveCount(5);
      await page.locator('#challenge-start').tap();
      await expect(page.locator('#clock')).toContainText('2:00');
    }
  }
  await expect(page.locator('#points')).toHaveText('50');
  await page.reload();
  await expect(page.locator('#best')).toHaveText('51');
  await expect(page.locator('#titles .earned')).toHaveCount(5);
  await page.clock.fastForward(121000);
  await expect(page.locator('#gate-message')).toContainText('時間切れ');
  expect(await page.evaluate(() => ['fractionBasics','fractionTransform'].map(id => [
    JSON.parse(window.manabiStorage.getItem('mgl_'+id)).best,
    window.manabiStorage.getItem('mgl_challenge120_v1:'+id)
  ]))).toEqual([[11,'existing-challenge'],[11,'existing-challenge']]);
  await page.goto(base + 'titles.html?subject=math&game=' + game);
  await page.locator('#collectionGame').selectOption(game);
  await expect(page.locator('.collection-title-grid > li.earned')).toHaveCount(5);
});

test('offline review opens directly, shows playable questions, and does not contact Firebase', async ({ page }) => {
  const outbound = [];
  page.on('request', request => { if (/^https?:/.test(request.url())) outbound.push(request.url()); });
  await page.setViewportSize({width:1024, height:768});
  await page.goto(new URL('../.release/manabi-fraction-input-review.html', import.meta.url).href);
  await expect(page.getByText('オフライン確認版')).toBeVisible();
  await expect(page.locator('#question')).toBeVisible();
  await visibleArt(page.locator('#titles img'), 44);
  expect(await page.locator('#titles img').evaluateAll(images => images.every(image => image.src.startsWith('data:image/png;base64,')))).toBe(true);
  await page.emulateMedia({ reducedMotion:'reduce' });
  await page.evaluate(() => window.ManabiCelebrations.play('fractionTransformInput', 0, 3));
  const offlineAward = page.locator('.mgl-celebration--title');
  await expect(offlineAward.locator('h2')).toHaveText('分数ルーキー');
  await visibleArt(offlineAward.locator('img'), 130, 1);
  await expect(key(page, '0')).toBeInViewport();
  await key(page, 'submit').tap();
  await expect(page.locator('[data-input-message]')).toContainText('必要な数字');
  expect(await page.evaluate(() => window.MANABI_BACKEND_CONFIG.firebase)).toBeUndefined();
  expect(outbound).toEqual([]);
});
