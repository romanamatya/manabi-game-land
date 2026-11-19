import { test, expect } from '@playwright/test';

const base = process.env.MGL_BASE_URL || 'http://127.0.0.1:4173/';
test.skip(!['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Synthetic records only');
test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true });

test('read-only diagnostic works with inconsistent records without modifying or sending student data', async ({ page }) => {
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.addInitScript(() => {
    localStorage.setItem('mgl_nickname', '非公開の検証名');
    localStorage.setItem('localPlayerId', 'private-test-uid');
    localStorage.setItem('mgl_points', '40');
    localStorage.setItem('mgl_economy_v1', JSON.stringify({ version: 1, owned: ['icon-005'],
      balances: { japanese: 9, math: 39, social: 0, science: 0, english: 20 }, claimed: [] }));
    localStorage.setItem('mgl_kotowaza_points_v1', JSON.stringify({ balance: 12, claims: [] }));
    localStorage.setItem('mgl_verticalParallel', '{"best":45}');
    localStorage.setItem('mgl_profile', '{"icon":"icon-005","private":"keep"}');
    const original = JSON.stringify({ ...localStorage });
    window.fixtureSnapshot = original;
    for (const method of ['setItem', 'removeItem', 'clear']) {
      Storage.prototype[method] = () => { throw Error('Unexpected storage mutation'); };
    }
  });
  await page.goto(new URL('support/point-check.html', base).href);
  await expect(page.locator('#results')).toContainText('不一致');
  await expect(page.locator('#results')).toContainText('未実施');
  await expect(page.locator('body')).not.toContainText('非公開の検証名');
  await expect(page.locator('body')).not.toContainText('private-test-uid');
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }) === window.fixtureSnapshot)).toBe(true);
  expect(requests.every(url => url.startsWith(base))).toBe(true);
  expect(requests.some(url => /economy\.js|firebase|googleapis/.test(url))).toBe(false);
  expect(errors).toEqual([]);
  await expect(page.locator('#copy')).toBeVisible();
  await expect(page.getByRole('link', { name: 'ホームへ戻る' })).toHaveAttribute('href', '../index.html');
});
