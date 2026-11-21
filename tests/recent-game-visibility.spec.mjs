import { expect, test } from '@playwright/test';
import { GAME_IDS } from '../management-model.js';
import { mockPublicVisibility } from './fixtures/public-visibility-browser.mjs';

const base = process.env.MGL_BASE_URL || 'http://127.0.0.1:4173/';
const targets = [
  ['parallelPair', 'math-geometry.html', '[data-line]', '#best'],
  ['missingAlphabet', 'language.html', '#choices button', '#best'],
  ['verticalParallel', 'math-geometry.html', '[data-line][role="button"]', '#best'],
  ['quadrilateral', 'math-geometry.html', '[data-digit="1"]', '#best'],
  ['heikouPair', 'math-geometry.html', '[data-line]', '#practice-best'],
  ['shikakkeSecrets', 'math-geometry.html', '[data-shape]', '#practice-best'],
  ['fractionBasics','math-calculation.html','#options button, #diagram [data-count]','#best'],
];
test('individual management hides cards, gates direct play and keeps local records through re-publication', async ({ browser }) => {
  test.setTimeout(120000);
  const admin = await browser.newPage();
  const student = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });
  const states = { verticalParallel: null, quadrilateral: null, heikouPair: null, shikakkeSecrets: null, fractionBasics: null };
  const changes = [];
  await admin.route('https://**/*', route => route.abort());
  await student.route('https://**/*', route => route.abort());
  await mockPublicVisibility(student, states);
  await student.addInitScript(() => {
    if (sessionStorage.getItem('availability-fixtures')) return;
    sessionStorage.setItem('availability-fixtures','1');
    localStorage.setItem('mgl_nickname','公開設定テスト');
    for (const key of ['verticalParallel','quadrilateral','heikouPair','shikakkeSecrets','fractionBasics']) localStorage.setItem('mgl_'+key,'{"best":9}');
  });
  await admin.exposeFunction('visibilityAdmin', (action, input) => {
    if (action === 'admin:snapshot') {
      return { players: [], campaigns: [], managementReady: true,
        games: GAME_IDS.map(id => ({ id, status: states[id] ?? 'published' })) };
    }
    if (action !== 'admin:visibilityBatch' || input.confirm !== true || input.games.length !== 1) {
      throw Error('Unexpected operation');
    }
    states[input.games[0]] = input.status;
    changes.push(input.games[0]);
    return { ok: true };
  });
  await admin.route(/\/spark-auth\.js(?:\?|$)/, route => route.fulfill({
    contentType: 'application/javascript',
    body: `export const errorText = error => error.message;
      export async function client() {
        return { watch: update => update({ uid: 'visibility-admin-fixture' }), call: window.visibilityAdmin };
      }`,
  }));
  const visit = (page, name) => page.goto(new URL(name, base).href);
  const openSettings = async () => {
    await visit(admin,'control-room.html');
    await admin.getByRole('button',{name:'ゲーム公開設定',exact:true}).click();
  };
  await openSettings();
  for (const [id,list,answer,best] of targets) {
    const row = admin.locator('tr').filter({has:admin.locator(`input[value="${id}"]`)});
    await expect(row).toHaveCount(1);
    await expect(row.getByRole('checkbox')).toBeDisabled();
    const toggle = async status => {
      await row.getByRole('combobox').selectOption(status);
      await admin.locator('#execute').click();
      await expect(row.locator('td').nth(2)).toHaveText(status==='hidden'?'非公開':'公開中');
    };
    await toggle('hidden');
    await openSettings();
    await expect(row.locator('td').nth(2)).toHaveText('非公開');
    const card = student.locator(`[data-game-card="${id}"]`);
    await visit(student,list);
    await expect(card).toBeHidden();
    if (id==='fractionBasics') {
      for (const name of ['index.html','math.html','math-calculation.html']) {
        await visit(student,name);
        await expect(student.locator('.new-game-badge')).toHaveCount(0);
      }
    }
    await visit(student,'games/'+id+'.html');
    await expect(student.locator(id==='fractionBasics'?'#access':'#publicGameAccessStatus')).toContainText('現在非公開');
    const action = student.locator(answer).first();
    if (id!=='missingAlphabet' && id!=='fractionBasics') await expect(action).toBeAttached();
    if (id==='fractionBasics') await expect(action).toHaveCount(0);
    if (await action.count()) {
      const cancelled = await action.evaluate(element => {
        const event = new MouseEvent('click',{bubbles:true,cancelable:true});
        element.dispatchEvent(event);
        return event.defaultPrevented;
      });
      expect(cancelled, id).toBe(true);
    }

    await toggle('published');
    await visit(student,list);
    await expect(card.getByRole('button',{name:'プレイ',exact:true})).toBeEnabled();
    if (id==='fractionBasics') await expect(card.locator('.new-game-badge')).toHaveCount(1);
    await visit(student,'games/'+id+'.html');
    await expect(student.locator('#publicGameAccessStatus')).toHaveCount(0);
    if (['verticalParallel','quadrilateral','heikouPair','shikakkeSecrets','fractionBasics'].includes(id)) {
      await expect(student.locator(best)).toHaveText('9');
    }
  }
  expect(changes).toEqual(targets.flatMap(([id])=>[id,id]));
  await admin.close();
  await student.close();
});
