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
