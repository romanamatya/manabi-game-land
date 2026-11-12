import { expect, test } from '@playwright/test';

const base = process.env.MGL_BASE_URL || 'http://127.0.0.1:4173/';
test.use({ hasTouch: true, isMobile: true });

for (const game of ['parallelPair', 'verticalParallel', 'quadrilateral']) {
  test(game + ' opens and closes the challenge ranking while keeping the game interactive', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.addInitScript(() => localStorage.setItem('manabi_public_preview:mgl_nickname', '検証A'));
    await page.route('https://**/*', route => route.abort());
    await page.route(/firebase-auth\.js$/, route => route.fulfill({
      contentType: 'application/javascript',
      body: "export const getAuth = () => ({currentUser:{uid:'test-user',isAnonymous:true}});",
      headers: { 'Access-Control-Allow-Origin': '*' },
    }));
    await page.route(/\/public-firebase-session\.js\?/, route => route.fulfill({
      contentType: 'application/javascript',
      body: `
        window.ManabiFirebaseSession = {open: async () => ({
          db: {app: {options: {projectId: 'manabi-game-landcheck'}}},
          F: {
            doc: (...args) => args.at(-1),
            collection: (_db, ...path) => path.join('/'),
            query: (path) => path,
            orderBy() {}, limit() {},
            onSnapshot(_ref,_options,next) {next({metadata:{fromCache:false},exists:()=>false});return ()=>{};},
            async getDocsFromServer(path) {
              if (!path.includes('/challengeRankings/${game}/')) throw Error('incorrect-path');
              if(window.rankFixture === 'error') throw Error('network');
              if(window.rankFixture === 'empty') return {docs:[]};
              return {docs:[31,31,29].map((bestStreak,i) => ({
                data: () => ({nickname:'検証'+i,bestStreak,icon:'rabbit',uid:'private-id', privateField:'private-data'}),
              }))};
            },
          },
        })};
      `,
    }));
    await page.goto(new URL('preview/games/' + game + '.html', base).href);
    await page.locator('#ranking-open').tap();
    const dialog = page.getByRole('dialog', { name: '共有ランキング' });
    await expect(dialog).toBeInViewport({ ratio: 1 });
    await expect(dialog.getByRole('row')).toHaveCount(4);
    await expect(dialog.locator('tbody tr td:first-child')).toHaveText(['1位','1位','3位']);
    await expect(dialog.locator('tbody img')).toHaveCount(3);
    await expect(dialog).not.toContainText('private-');
    await page.evaluate(() => { window.rankFixture = 'empty'; });
    await dialog.getByRole('button', { name: '更新する' }).tap();
    await expect(dialog.getByRole('status')).toHaveText('まだ記録がありません');
    await page.evaluate(() => { window.rankFixture = 'error'; });
    await dialog.getByRole('button', { name: '更新する' }).tap();
    await expect(dialog.getByRole('status')).toContainText('接続を確認');
    await dialog.getByRole('button', { name: '閉じる' }).tap();
    await expect(dialog).toBeHidden();
    await expect(page.locator('#ranking-open')).toBeFocused();
  });
}
