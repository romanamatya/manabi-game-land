import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const base = process.env.MGL_BASE_URL || 'http://127.0.0.1:4173/';
const baseline = process.env.MGL_BADGE_BASE_SHA;
const output = 'badge-display-screenshots';
const viewports = [{ width: 1024, height: 768 }, { width: 1194, height: 834 }];
const games = [
  { id: 'parallelPair', thresholds: [3, 5, 10, 15, 25], folder: 'parallel-titles',
    images: ['01_heiko_minarai_512.png', '02_heiko_hunter_512.png', '03_heiko_master_512.png',
      '04_heiko_tatsujin_512.png', '05_heiko_ouja_512.png'] },
  { id: 'missingAlphabet', thresholds: [5, 8, 12, 16, 20], folder: 'missing-alphabet-titles',
    images: ['title_05.png', 'title_08.png', 'title_12.png', 'title_16.png', 'title_20.png'] },
  { id: 'verticalParallel', thresholds: [3, 5, 10, 15, 25], folder: 'vertical-parallel-titles',
    images: ['01_rookie_512.png', '02_hunter_512.png', '03_master_512.png',
      '04_tatsujin_512.png', '05_haou_512.png'] },
];
const asset = (game, index) => 'assets/' + game.folder + '/' + game.images[index];
const errorList = new WeakMap();

test.use({ hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
test.beforeEach(async ({ page }) => {
  const errors = [];
  errorList.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().startsWith(base)) errors.push(response.url());
  });
  await page.route('https://**/*', route => route.abort());
  await page.route(/\/public-firebase-session\.js(?:\?|$)/, route => route.fulfill({
    contentType: 'text/javascript',
    body: `window.ManabiFirebaseSession = { open: async () => ({ db: {}, F: {
      doc: () => ({}),
      getDocFromServer: async () => ({ exists: () => true, data: () => ({ status: 'published' }) }),
    } }) };`,
  }));
  await page.addInitScript(() => localStorage.setItem('mgl_nickname', '画面テスト'));
  await mkdir(output, { recursive: true });
});

async function solve(page, game) {
  if (game.id === 'missingAlphabet') {
    await expect(page.locator('#choices button').first()).toBeEnabled();
    const answer = await page.evaluate(() => window.MissingAlphabetGame.question().correctIndex);
    await page.locator(`#choices button[data-choice-index="${answer}"]`).tap();
    return;
  }
  const confirm = page.locator('#confirm');
  await expect(page.locator('#diagram line')).toHaveCount(7);
  // Each answer advances with a fresh diagram whose choices have no selection.
  await expect(page.locator('#diagram [aria-pressed="true"]')).toHaveCount(0);
  const ids = await page.locator('#diagram svg').evaluate(svg => {
    const vectors = Array.from(svg.querySelectorAll('line'), line => [
      Number(line.getAttribute('x2')) - Number(line.getAttribute('x1')),
      Number(line.getAttribute('y2')) - Number(line.getAttribute('y1')),
    ]);
    const pairs = (i, j, parallel) => {
      const [ax, ay] = vectors[i], [bx, by] = vectors[j];
      return Math.abs(parallel ? ax * by - ay * bx : ax * bx + ay * by) < 1e-6;
    };
    const reference = [...svg.children].findIndex(line => line.classList.contains('line-quiz-reference'));
    if (reference !== -1) {
      const parallel = document.getElementById('mission').dataset.relation === 'parallel';
      return vectors.flatMap((_, j) => j !== reference && pairs(reference, j, parallel) ? [j] : []);
    }
    return vectors.flatMap((_, i) => vectors.flatMap((_, j) => i < j && pairs(i, j, true) ? [i, j] : []));
  });
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) await page.locator(`#diagram [data-line="${id}"]`).press('Enter');
  await expect(confirm).toBeEnabled();
  await confirm.tap();
}

async function assertTower(page, game) {
  const images = page.locator('#tower > li > img');
  await expect(images).toHaveCount(5);
  for (const [i, img] of (await images.all()).entries()) {
    await expect(img).toBeInViewport({ ratio: 1 });
    expect(await img.evaluate(async image => {
      await image.decode();
      const imageBox = image.getBoundingClientRect();
      const row = image.parentElement.getBoundingClientRect();
      const label = image.nextElementSibling.getBoundingClientRect();
      return {
        natural: [image.naturalWidth, image.naturalHeight],
        size: [imageBox.width, imageBox.height],
        fit: getComputedStyle(image).objectFit,
        contained: imageBox.left >= row.left && imageBox.right <= label.left
          && imageBox.top >= row.top && imageBox.bottom <= row.bottom,
      };
    })).toEqual({ natural: [512, 512], size: [42, 42], fit: 'contain', contained: true });
    await expect(img).toHaveAttribute('src', '../' + asset(game, 4 - i));
  }
  expect(await page.locator('#tower').evaluate(tower => {
    const rows = [...tower.children].map(row => row.getBoundingClientRect());
    const panel = tower.parentElement.getBoundingClientRect();
    return rows.every((row, i) => row.bottom <= panel.bottom && (!i || rows[i - 1].bottom <= row.top));
  })).toBe(true);
  expect(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]))
    .toEqual(await page.evaluate(() => [innerWidth, innerHeight]));
}

for (const game of games) {
  const url = new URL('games/' + game.id + '.html?adminTest=1', base).href;
  test(`${game.id}: all five approved title images fit and appear when earned`, async ({ page }) => {
    test.setTimeout(90000);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto(url);
      await assertTower(page, game);
      await page.screenshot({ path: `${output}/${game.id}-after-tower-${viewport.width}.png` });
    }
    const overlay = page.locator('.mgl-celebration--title');
    const img = overlay.locator('.mgl-celebration__art img');
    for (let answer = 1; answer <= game.thresholds.at(-1); answer++) {
      await solve(page, game);
      await expect(page.locator('#best')).toHaveText(String(answer));
      const index = game.thresholds.indexOf(answer);
      if (index === -1) continue;
      await expect(img).toBeVisible();
      expect(await img.evaluate(async image => {
        await image.decode();
        return [new URL(image.src).pathname, image.naturalWidth, image.naturalHeight];
      })).toEqual([new URL(asset(game, index), base).pathname, 512, 512]);
      if (index === 0) await page.screenshot({ path: `${output}/${game.id}-after-award.png` });
      await expect(overlay).toBeHidden();
    }
    expect(errorList.get(page)).toEqual([]);
  });

  test(`${game.id}: capture pre-fix layout`, async ({ page }) => {
    test.skip(!baseline, 'Pre-fix screenshots require the pull request base commit');
    const replacements = ['profile-catalog.js', 'celebration-effects.js', 'games/' + game.id + '.html'];
    for (const relative of replacements) {
      const original = execFileSync('git', ['show', `${baseline}:${relative}`]);
      await page.route(request => request.pathname === new URL(relative, base).pathname, route => route.fulfill({
        contentType: relative.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8',
        body: original,
      }));
    }
    await page.setViewportSize(viewports[1]);
    await page.goto(url);
    const tower = page.locator('#tower img');
    await expect(tower).toHaveCount(5);
    for (const img of await tower.all()) await img.evaluate(image => image.decode().then(() => null));
    await page.screenshot({ path: `${output}/${game.id}-before-tower-${viewports[1].width}.png` });
    for (let answer = 1; answer <= game.thresholds[0]; answer++) {
      await solve(page, game);
      await expect(page.locator('#best')).toHaveText(String(answer));
    }
    const art = page.locator('.mgl-celebration--title .mgl-celebration__art');
    await expect(art.locator(game.id === 'missingAlphabet' ? 'svg image' : 'img')).toBeVisible();
    await page.screenshot({ path: `${output}/${game.id}-before-award.png` });
    expect(errorList.get(page)).toEqual([]);
  });
}

test('the shared badge renderer uses the complete PNG for all 15 titles', async ({ page }) => {
  await page.goto(new URL('games/missingAlphabet.html?adminTest=1', base).href);
  for (const game of games) {
    for (const [i, threshold] of game.thresholds.entries()) {
      expect(await page.evaluate(async ({ id, threshold }) => {
        const badge = window.ManabiIdentity.badge(id + ':' + threshold, 42);
        const img = badge?.querySelector('img');
        if (!img) return null;
        await img.decode();
        return [new URL(img.src).pathname, img.naturalWidth, img.naturalHeight, img.style.objectFit];
      }, { id: game.id, threshold })).toEqual([new URL(asset(game, i), base).pathname, 512, 512, 'contain']);
    }
  }
});
