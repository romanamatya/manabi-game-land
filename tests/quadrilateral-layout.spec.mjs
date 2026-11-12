import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const base = process.env.MGL_BASE_URL || 'http://127.0.0.1:4173/';
const production = process.env.MGL_QUADRILATERAL_PRODUCTION === '1';
const game = new URL((production ? '' : 'preview/') + 'games/quadrilateral.html', base).href;
const math = new URL(production ? 'math-geometry.html' : 'preview/math.html', base).href;
const screenshots = 'quadrilateral-screenshots/' + (production ? 'production' : 'preview');
const sizes = [{ width: 1024, height: 768 }, { width: 1194, height: 834 }];
const awards = new Map([[3, '01_rookie'], [5, '02_hunter'], [10, '03_master'], [15, '04_tatsujin'], [25, '05_haou']]);

test.use({ hasTouch: true, isMobile: true });
test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('manabi_public_preview:mgl_nickname', '図形テスト');
    localStorage.setItem('mgl_nickname', '図形テスト');
  });
  await mkdir(screenshots, { recursive: true });
});

async function enter(page, value) {
  for (const digit of String(value)) await page.locator(`#keys [data-digit="${digit}"]`).tap();
}

async function sameOpposite(page) {
  const opposite = await page.locator('#diagram text').nth(5).textContent();
  return Number.parseInt(opposite, 10);
}

async function submit(page) {
  const answer = await sameOpposite(page);
  await enter(page, answer);
  await page.locator('#confirm').tap();
}

async function checkDiagram(page) {
  const valid = await page.locator('#diagram svg').evaluate(svg => {
    const text = Array.from(svg.querySelectorAll('text'));
    const boxes = text.map(node => node.getBBox());
    const contained = boxes.every(b => b.x >= 0 && b.y >= 0 && b.x + b.width <= 640 && b.y + b.height <= 420);
    const separate = boxes.every((a, i) => boxes.slice(i + 1).every(b =>
      a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y));
    const polygon = svg.querySelector('polygon');
    const points = Array.from(polygon.points);
    const paths = Array.from(svg.querySelectorAll('path'));
    const target = 'ABCD'.indexOf(document.getElementById('question').textContent[1]);
    const arcs = paths.every((path, i) => {
      const center = points[(target + [0, 2, 1][i]) % 4];
      const length = path.getTotalLength();
      const distances = [0, .25, .5, .75, 1].map(t => {
        const p = path.getPointAtLength(length * t);
        return Math.hypot(p.x - center.x, p.y - center.y);
      });
      return distances[0] > 18 && distances.every(r => Math.abs(r - distances[0]) < .05);
    });
    return { contained, separate, arcs, count: boxes.length, unknown: text.filter(node => node.hasAttribute('data-unknown')).length };
  });
  const singleLength = await page.locator('#shape-name').getAttribute('data-shape') === 'r'
    && await page.locator('#kind').textContent() === '辺の長さ';
  expect(valid).toEqual({ contained: true, separate: true, arcs: true, count: singleLength ? 6 : 7, unknown: 1 });
}

test('iPad landscape fits the complete game and opens from the math list', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize(sizes[0]);
  await page.goto(math);
  await page.locator('article').filter({ hasText: '四角形のひみつ！' }).getByRole(production ? 'button' : 'link', { name: 'プレイ', exact: true }).tap();
  await expect(page).toHaveURL(game);
  for (const size of sizes) {
    await page.setViewportSize(size);
    await expect(page.locator('#kind')).toHaveText('辺の長さ');
    for (const selector of ['#shape-name', '#diagram', '#keypad', '#confirm', '#tower', '.mq-game-home']) {
      await expect(page.locator(selector)).toBeInViewport({ ratio: 1 });
    }
    expect(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]))
      .toEqual([size.width, size.height]);
    await expect(page.locator('#keys button')).toHaveCount(11);
    await expect(page.locator('#tower img')).toHaveCount(5);
    for (const [i, image] of (await page.locator('#tower img').all()).entries()) {
      await expect(image).toBeInViewport({ ratio: 1 });
      await expect(image).toHaveAttribute('src', new RegExp([...awards.values()].reverse()[i] + '_512\\.png$'));
      expect(await image.evaluate(async img => {
        await img.decode();
        const rect = img.getBoundingClientRect();
        return [img.naturalWidth, img.naturalHeight, rect.width, rect.height, getComputedStyle(img).objectFit];
      })).toEqual([512, 512, 42, 42, 'contain']);
    }
    await checkDiagram(page);
    await page.screenshot({ path: `${screenshots}/length-${size.width}.png` });
    await submit(page);
    await expect(page.locator('#kind')).toHaveText('角度');
    await expect(page.locator('#diagram path')).toHaveCount(3);
    await checkDiagram(page);
    await page.screenshot({ path: `${screenshots}/angle-${size.width}.png` });
    await page.goto(game);
  }
  expect(errors).toEqual([]);
});

test('confirm, retry, five awards, points and 120-second challenge work with tablet input', async ({ page }) => {
  test.setTimeout(120000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize(sizes[0]);
  await page.clock.install();
  await page.goto(game);
  await page.addStyleTag({
    content: '.mgl-celebration__title-card, .mgl-celebration__art { animation: none !important; }',
  });
  const confirm = page.locator('#confirm');
  const kind = page.locator('#kind');
  await expect(kind).toHaveText('辺の長さ');
  await expect(confirm).toBeDisabled();
  await enter(page, 0);
  await expect(confirm).toBeDisabled();
  await enter(page, 9);
  await expect(page.locator('#digits')).toHaveText('9');
  await page.getByRole('button', { name: '1文字消す' }).tap();
  await expect(confirm).toBeDisabled();

  const original = await page.locator('#diagram polygon').getAttribute('points');
  const wrong = (await sameOpposite(page)) === 1 ? 2 : 1;
  await enter(page, wrong);
  await expect(page.locator('#points')).toHaveText('0');
  await confirm.tap();
  await expect(page.locator('#hint')).toContainText('もう一度');
  await expect(page.locator('#diagram polygon')).toHaveAttribute('points', original);
  await expect(kind).toHaveText('辺の長さ');
  await expect(page.locator('#points')).toHaveText('0');

  const appearance = new Set();
  for (let n = 1; n <= 25; n++) {
    await expect(kind).toHaveText(n % 2 ? '辺の長さ' : '角度');
    appearance.add(await page.locator('#shape-name').textContent());
    await checkDiagram(page);
    await submit(page);
    await expect(page.locator('#best')).toHaveText(String(n));
    await expect(page.locator('#points')).toHaveText(String(n));
    const name = awards.get(n);
    if (name) {
      const badge = page.locator('.mgl-celebration--title .mgl-celebration__art img');
      await expect(badge).toBeVisible();
      await expect(badge).toHaveAttribute('src', new RegExp(name + '_512\\.png$'));
      expect(await badge.evaluate(async img => {
        await img.decode();
        return img.naturalWidth;
      })).toBe(512);
      if (n === 25) await page.screenshot({ path: screenshots + '/award-25.png' });
    }
  }
  expect([...appearance].sort()).toEqual(['ひし形', '平行四辺形']);
  await expect(page.locator('#tower .earned')).toHaveCount(5);
  await expect(page.locator('#challenge-start')).toBeVisible();
  await page.clock.fastForward(120000);
  await expect(page.locator('#challenge-start')).toHaveText('120秒チャレンジを始める');
  await page.locator('#challenge-start').tap();
  await expect(page.locator('#clock')).toHaveText(/残り (2:00|1:59)/);
  await expect(kind).toHaveText('辺の長さ');
  await submit(page);
  await expect(page.locator('#best')).toHaveText('26');
  await expect(page.locator('#points')).toHaveText('26');
  await expect(kind).toHaveText('角度');
  // Freeze at the same wall time in both documents so WebKit navigation cannot
  // replay the earlier fast-forward against a running challenge.
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 5000)));
  await page.reload();
  await expect(kind).toHaveText('角度');
  await expect(page.locator('#best')).toHaveText('26');
  await expect(page.locator('#clock')).toContainText('残り');
  await page.clock.fastForward(120000);
  await expect(page.locator('#challenge-heading')).toHaveText('チャレンジ終了');
  await expect(page.locator('#challenge-message')).toContainText('時間切れ');
  await expect(page.locator('#best')).toHaveText('26');
  expect(errors).toEqual([]);
});
