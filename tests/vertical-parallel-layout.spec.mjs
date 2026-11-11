import { expect, test } from '@playwright/test';

const base = process.env.MGL_BASE_URL || 'http://127.0.0.1:4173/';
const game = new URL('preview/games/verticalParallel.html', base).href;
const viewports = [{ width: 1024, height: 768 }, { width: 1194, height: 834 }];

test.use({ hasTouch: true, isMobile: true });
test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
  await page.addInitScript(() => localStorage.setItem('manabi_public_preview:mgl_nickname', '図形テスト'));
});

async function diagram(page) {
  return page.locator('#diagram svg').evaluate(svg => {
    const segments = Array.from(svg.querySelectorAll('line'), line => ({
      start: { x: Number(line.getAttribute('x1')), y: Number(line.getAttribute('y1')) },
      end: { x: Number(line.getAttribute('x2')), y: Number(line.getAttribute('y2')) },
    }));
    const reference = [...svg.children].findIndex(line => line.classList.contains('line-quiz-reference'));
    const parallel = document.getElementById('mission').dataset.relation === 'parallel';
    const vector = ({ start, end }) => [end.x - start.x, end.y - start.y];
    const [ax, ay] = vector(segments[reference]);
    const answers = segments.flatMap((line, i) => {
      const [bx, by] = vector(line);
      return i !== reference && Math.abs(parallel ? ax * by - ay * bx : ax * bx + ay * by) < 1e-6 ? [i] : [];
    });
    const matrix = svg.getScreenCTM();
    const points = segments.map(({ start, end }, i) => {
      for (let n = 1; n < 20; n++) {
        const p = { x: start.x + (end.x - start.x) * n / 20, y: start.y + (end.y - start.y) * n / 20 };
        if (window.ManabiLineQuiz.nearestLine(segments, p, 21, 16) === i) {
          const q = new DOMPoint(p.x, p.y).matrixTransform(matrix);
          return { x: q.x, y: q.y };
        }
      }
      throw Error('No clear tap point');
    });
    return { reference, answers, points, drawing: svg.innerHTML.replace(/ aria-pressed="[^"]*"/g, '') };
  });
}

test('the seven lines, five images, and controls fit the landscape iPad screen', async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto(game);
    await expect(page.locator('#diagram line')).toHaveCount(7);
    await expect(page.locator('#diagram text')).toHaveText([...'ABCDEFG']);
    await expect(page.locator('#tower img')).toHaveCount(5);
    for (const image of await page.locator('#tower img').all()) {
      expect(await image.evaluate(async img => { await img.decode(); return img.naturalWidth; })).toBe(512);
    }
    const dimensions = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
    expect(dimensions).toEqual([viewport.width, viewport.height]);
    for (const selector of ['#diagram', '#confirm', '#tower', '.mq-game-home']) {
      await expect(page.locator(selector)).toBeInViewport({ ratio: 1 });
    }
  }
});

test('touch selection, retry, 25 correct answers, titles and the timer work in the real page', async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize(viewports[0]);
  await page.goto(game);
  const confirm = page.locator('#confirm');
  const selected = page.locator('[data-line][aria-pressed="true"]');
  const tap = (question, i) => page.touchscreen.tap(question.points[i].x, question.points[i].y);
  const initial = await diagram(page);
  await tap(initial, initial.reference);
  await expect(selected).toHaveCount(0);
  await tap(initial, initial.answers[0]);
  await expect(selected).toHaveCount(1);
  await tap(initial, initial.answers[0]);
  await expect(selected).toHaveCount(0);
  const wrong = initial.points.map((_, i) => i).filter(i => i !== initial.reference && !initial.answers.includes(i));
  for (const i of wrong.slice(0, initial.answers.length)) await tap(initial, i);
  await confirm.tap();
  await expect(page.locator('#hint')).toContainText('もう一度！');
  expect((await diagram(page)).drawing).toBe(initial.drawing);
  await expect(page.locator('#points')).toHaveText('0');

  for (let n = 1; n <= 25; n++) {
    const question = await diagram(page);
    for (const [j, i] of question.answers.entries()) {
      await tap(question, i);
      if (j === question.answers.length - 1) await expect(confirm).toBeEnabled();
      else await expect(confirm).toBeDisabled();
    }
    await confirm.tap();
    if ([3, 5, 10, 15, 25].includes(n)) {
      await expect(page.locator('.mgl-celebration--title img')).toBeVisible();
    }
    if (n < 25) await expect.poll(async () => (await diagram(page)).drawing).not.toBe(question.drawing);
  }

  await expect(page.locator('#tower .earned')).toHaveCount(5);
  await expect(page.locator('#points')).toHaveText('25');
  await page.locator('#challenge-start').tap();
  await expect(page.locator('#challenge-clock')).toHaveText(/残り (2:00|1:59)/);
  await page.reload();
  await expect(page.locator('#best')).toHaveText('25');
  await expect(page.locator('#challenge-clock')).toHaveText(/残り/);
});

test('the preview game card follows remote visibility without hiding other games', async ({ page }) => {
  await page.route('https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js', route => route.fulfill({
    contentType: 'text/javascript',
    headers: { 'access-control-allow-origin': '*' },
    body: 'export const getAuth=()=>({currentUser:{isAnonymous:true,uid:"preview-fixture"}});',
  }));
  await page.route(/\/public-firebase-session\.js(?:\?|$)/, route => route.fulfill({
    contentType: 'text/javascript',
    body: `
      window.ManabiFirebaseSession = {
        open: async () => ({
          db: { app: { options: { projectId: 'manabi-game-landcheck' } } },
          F: {
            doc: () => ({}),
            collection: () => ({}),
            onSnapshot: (_ref, _options, update) => {
              const send = status => update({
                metadata: { fromCache: false },
                exists: () => true,
                data: () => ({ status }),
              });
              window.addEventListener('preview-line-quiz-setting', event => send(event.detail));
              send('hidden');
              return () => {};
            },
          },
        }),
      };
    `,
  }));
  await page.goto(new URL('preview/math.html', base).href);
  const quiz = page.locator('[data-game-card="verticalParallel"]');
  const previous = page.locator('[data-game-card="suichoku"]');
  await expect(quiz).toHaveAttribute('data-game-availability', 'hidden');
  await expect(quiz).toBeHidden();
  await expect(previous).toBeVisible();

  const set = status => page.evaluate(status => {
    window.dispatchEvent(new CustomEvent('preview-line-quiz-setting', { detail: status }));
  }, status);
  await set('published');
  await expect(quiz).toBeVisible();
  await expect(quiz.getByRole('button', { name: 'プレイ' })).toBeEnabled();
  await set('hidden');
  await expect(quiz).toBeHidden();
  await expect(previous).toBeVisible();
});

test('the preview management game list exposes the line quiz controls', async ({ page }) => {
  await page.route(/\/spark-auth\.js(?:\?|$)/, route => route.fulfill({
    contentType: 'text/javascript',
    body: `
      let status = 'published';
      export const errorText = error => error.message;
      export async function client() {
        return {
          watch: update => update({ uid: 'preview-admin-fixture' }),
          async call(action, input) {
            if (action === 'admin:snapshot') return { games: [], players: [], managementReady: false };
            if (action === 'admin:line-quiz:read') return status;
            if (action === 'admin:line-quiz:visibility' && input.confirm === true) {
              status = input.status;
              return { ok: true };
            }
            throw Error('Unexpected management action');
          },
        };
      }
    `,
  }));
  await page.goto(new URL('preview/control-room.html', base).href);
  await page.getByRole('button', { name: 'ゲーム公開設定', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: '垂直・平行ラインクイズ！' });
  await expect(row.getByRole('cell', { name: '公開中', exact: true })).toBeVisible();
  await row.getByRole('button', { name: '非公開にする' }).click();
  await page.locator('#execute').click();
  await expect(row.getByRole('cell', { name: '非公開', exact: true })).toBeVisible();
  await row.getByRole('button', { name: '公開する', exact: true }).click();
  await page.locator('#execute').click();
  await expect(row.getByRole('cell', { name: '公開中', exact: true })).toBeVisible();
});

test('the production game follows managed visibility, preserves progress and shares challenge scores', async ({ page }) => {
  await page.setViewportSize(viewports[0]);
  await page.route(/\/public-firebase-session\.js(?:\?|$)/, route => route.fulfill({
    contentType: 'text/javascript',
    body: `
      const snapshot = status => ({ metadata: { fromCache: false }, exists: () => status !== null, data: () => ({ status }) });
      window.ManabiFirebaseSession = { open: async () => ({ db: {}, F: {
        doc: (_db, path) => path,
        getDocFromServer: async () => snapshot('published'),
        onSnapshot: (path, _options, update) => {
          const receive = event => { if (path.endsWith('/verticalParallel')) update(snapshot(event.detail)); };
          window.addEventListener('test-line-quiz-visibility', receive);
          update(snapshot(path.endsWith('/verticalParallel') ? sessionStorage.getItem('line-quiz-status') : 'published'));
          return () => window.removeEventListener('test-line-quiz-visibility', receive);
        },
      } }) };
    `,
  }));
  await page.route(/\/ranking-sync-api\.js\?v=vertical-parallel-managed-v1$/, route => route.fulfill({
    contentType: 'text/javascript',
    body: `
      export async function verticalParallelClient() {
        return {
          ensurePlayerLink: async () => '図形テスト',
          publishRanking: async row => sessionStorage.setItem('line-quiz-published', JSON.stringify(row)),
          rankings: async () => [{ nickname:'検証プレイヤー', icon:'rabbit', frame:'plain',
            title:'垂直・平行の覇王', badge:'verticalParallel:25', bestStreak:27 }],
        };
      }
    `,
  }));
  const visibility = status => page.evaluate(status => {
    sessionStorage.setItem('line-quiz-status', status);
    window.dispatchEvent(new CustomEvent('test-line-quiz-visibility', { detail: status }));
  }, status);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('line-quiz-fixture')) return;
    sessionStorage.setItem('line-quiz-fixture', '1');
    localStorage.setItem('mgl_nickname', '図形テスト');
    localStorage.setItem('mgl_points', '7');
    localStorage.setItem('mgl_parallelPair', '{"best":19}');
    localStorage.setItem('mgl_profile', '{"icon":"rabbit"}');
    localStorage.setItem('mgl_verticalParallel', JSON.stringify({
      best: 24,
      challenge: {
        protocol: 2, game: 'verticalParallel', phase: 'training', unlocked: false,
        practiceStreak: 24, claimed: [], attemptId: null, season: null,
        lastWall: 0, streak: 0, attemptBest: 0,
      },
    }));
  });
  await page.goto(new URL('math-geometry.html', base).href);
  const card = page.locator('[data-game-card="verticalParallel"]');
  await expect(card.getByRole('button', { name: 'プレイ' })).toBeEnabled();
  await visibility('hidden');
  await expect(card).toBeHidden();
  await expect(page.locator('[data-game-card="parallelPair"]')).toBeVisible();
  await page.goto(new URL('games/verticalParallel.html', base).href);
  await expect(page.locator('#challenge-heading')).toHaveText('現在非公開です');
  await expect(page.locator('#confirm')).toBeDisabled();
  await expect(page.locator('#ranking-open')).toBeDisabled();
  await visibility('published');
  await page.goto(new URL('math-geometry.html', base).href);
  await expect(card.getByRole('button', { name: 'プレイ' })).toBeEnabled();
  await card.getByRole('button', { name: 'プレイ' }).click();
  await expect(page).toHaveURL(/\/games\/verticalParallel\.html$/);
  await expect(page.locator('#tower img')).toHaveCount(5);
  for (const image of await page.locator('#tower img').all()) {
    expect(await image.evaluate(async img => { await img.decode(); return img.naturalWidth; })).toBe(512);
  }

  const question = await diagram(page);
  for (const i of question.answers) await page.touchscreen.tap(question.points[i].x, question.points[i].y);
  await page.locator('#confirm').tap();
  await expect(page.locator('#best')).toHaveText('25');
  await expect(page.locator('#points')).toHaveText('8');
  await expect(page.locator('#daily')).toHaveText('今日 1 / 50pt');
  await expect(page.locator('#tower .earned')).toHaveCount(5);
  await page.locator('#ranking-open').tap();
  await expect(page.locator('#ranking-rows')).toContainText('検証プレイヤー');
  await expect(page.locator('#ranking-rows')).toContainText('垂直・平行の覇王');
  await expect(page.locator('#ranking-rows [role="img"]').first()).toHaveAttribute('aria-label', /アイコン/);
  expect(await page.evaluate(() => sessionStorage.getItem('line-quiz-published'))).toBeNull();
  await page.locator('#ranking-close').tap();
  await page.locator('#challenge-start').tap();
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('line-quiz-published'))?.bestStreak)).toBe(25);

  await expect(page.locator('#challenge-clock')).toHaveText(/残り (2:00|1:59)/);
  await page.reload();
  await expect(page.locator('#best')).toHaveText('25');
  await expect(page.locator('#points')).toHaveText('8');
  await expect(page.locator('#challenge-clock')).toHaveText(/残り/);
  expect(await page.evaluate(() => ({
    oldBest: JSON.parse(localStorage.getItem('mgl_parallelPair')).best,
    oldIcon: JSON.parse(localStorage.getItem('mgl_profile')).icon,
  }))).toEqual({ oldBest: 19, oldIcon: 'rabbit' });
});
