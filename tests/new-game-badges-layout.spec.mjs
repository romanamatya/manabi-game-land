import { expect, test } from '@playwright/test';

const base = process.env.MGL_BASE_URL || 'http://127.0.0.1:4173/';

test.use({ hasTouch: true, isMobile: true });

async function checkBadges(page, titles) {
  const badges = page.locator('.new-game-badge');
  await expect(badges).toHaveCount(titles.length);
  const labels = [];
  for (const badge of await badges.all()) {
    await expect(badge).toHaveText('NEW');
    await expect(badge).toBeInViewport({ ratio: 1 });
    const position = await badge.evaluate(element => {
      const card = element.parentElement;
      const badge = element.getBoundingClientRect();
      const frame = card.getBoundingClientRect();
      const content = [...card.querySelectorAll('strong, h2, p, button, .subject-status, .rank-button')];
      const rectangles = content.flatMap(node => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return node.matches('button, .rank-button') ? [node.getBoundingClientRect()] : [...range.getClientRects()];
      });
      const image = card.querySelector('img');
      if (image) {
        const bounds = image.getBoundingClientRect();
        const padding = parseFloat(getComputedStyle(image).paddingBlockStart);
        rectangles.push({ left: bounds.left, right: bounds.right, top: bounds.top + padding, bottom: bounds.bottom });
      }
      const title = card.querySelector('strong, h2').cloneNode(true);
      title.querySelectorAll('rt').forEach(reading => reading.remove());
      return {
        title: title.textContent,
        topRight: badge.top >= frame.top && badge.top - frame.top < 15
          && badge.right <= frame.right && frame.right - badge.right < 15 && badge.bottom <= frame.bottom,
        clear: rectangles.every(rect => badge.left >= rect.right || badge.right <= rect.left
          || badge.top >= rect.bottom || badge.bottom <= rect.top),
      };
    });
    labels.push(position.title);
    expect(position.topRight, position.title).toBe(true);
    expect(position.clear, position.title).toBe(true);
  }
  expect(labels.sort()).toEqual([...titles].sort());
}

for (const size of [{ width: 1024, height: 768 }, { width: 1194, height: 834 }]) {
  test(`NEW badges follow the math path and fit a landscape tablet at ${size.width}px`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => localStorage.setItem('mgl_nickname', '図形テスト'));
    await page.goto(new URL('index.html', base).href);
    await checkBadges(page, ['算数']);

    await page.locator('.subject-card[href="math.html"]').tap();
    await expect(page).toHaveURL(/\/math\.html$/);
    await checkBadges(page, ['四角形・垂直と平行']);

    await page.getByRole('link', { name: /四角形・垂直と平行/ }).tap();
    await expect(page).toHaveURL(/\/math-geometry\.html$/);
    await checkBadges(page, ['平行ペアを見つけよう！']);
    await expect(page.locator('[data-game-card]:not([data-game-card="heikouPair"]) .new-game-badge')).toHaveCount(0);
    expect(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]))
      .toEqual([size.width, size.height]);
  });
}

test('one production setting moves NEW across subjects and respects publication status', async ({ page }) => {
  let current = 'keisan';
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.addInitScript(() => localStorage.setItem('mgl_nickname', 'NEW表示テスト'));
  await page.route('https://**/*', route => route.abort());
  await page.route('**/latest-game.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: 'export const latestGameId = ' + JSON.stringify(current),
  }));
  await page.route(/\/public-admin-settings\.js\?/, route => route.fulfill({
    contentType: 'application/javascript',
    body: `window.ManabiPublicSettings = {
      availabilityEnabled: true,
      subscribeGame(id, next, fail) {
        const emit = (status, fromCache = false) => next({
          exists: () => true, data: () => ({ status }), metadata: { fromCache }
        });
        const event = 'test-publication-' + id;
        addEventListener(event, message => {
          if (message.detail.error) fail();
          else emit(message.detail.status, message.detail.fromCache);
        });
        emit('published');
        return Promise.resolve(() => {});
      }
    };`,
  }));
  const visit = name => page.goto(new URL(name, base).href);
  await visit('index.html');
  await checkBadges(page, ['算数']);
  await visit('math.html');
  await checkBadges(page, ['計算のきまり']);
  await visit('math-calculation.html');
  await checkBadges(page, ['計算の順番']);
  await visit('math-geometry.html');
  await checkBadges(page, []);

  current = 'kotowaza';
  await visit('index.html');
  await checkBadges(page, ['国語']);
  await visit('math.html');
  await checkBadges(page, []);
  await visit('math-geometry.html');
  await checkBadges(page, []);
  await visit('japanese.html');
  await checkBadges(page, ['ことわざ・慣用句']);
  const publication = detail => page.evaluate(detail => {
    dispatchEvent(new CustomEvent('test-publication-kotowaza', { detail }));
  }, detail);
  for (const detail of [
    { status: 'hidden' }, { status: 'preparing' }, { status: 'published', fromCache: true }, { error: true },
  ]) {
    await publication(detail);
    await checkBadges(page, []);
    await publication({ status: 'published' });
    await checkBadges(page, ['ことわざ・慣用句']);
  }

  current = 'previewOnlyGame';
  await visit('index.html');
  await checkBadges(page, []);
});
