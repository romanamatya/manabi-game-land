import { test, expect } from '@playwright/test';

const base = process.env.MGL_BASE_URL || 'http://127.0.0.1:4173/';
test.skip(!['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Synthetic device data only');
test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true });
test.setTimeout(60000);
async function seed(page) {
  await page.addInitScript(() => {
    if (localStorage.getItem('fixture-seeded')) return;
    localStorage.setItem('fixture-seeded', '1');
    const date = new Date(Date.now() + 32400000).toISOString().slice(0, 10);
    const wallet = { version: 1, balances: { japanese: 20, math: 80, social: 30, science: 10, english: 40 },
      owned: ['icon-005', 'frame-11'], daily: { date, games: { kotowaza: 5 } },
      legacy: { math: 80, social: 30, english: 40 }, migrationVersion: 1,
      legacyMirror: { math: 80, japanese: 20 }, legacyJapaneseImported: true,
      claimed: Array.from({ length: 209 }, (_, i) => 'paid-' + i), customTitles: ['keep-title'] };
    const japanese = { version: 1, balance: 20, date, used: 5,
      claims: Array.from({ length: 21736 }, (_, i) => 'paid-' + (i % 209)) };
    localStorage.setItem('mgl_nickname', '保存復旧テスト');
    localStorage.setItem('mgl_points', '80');
    localStorage.setItem('mgl_economy_v1', JSON.stringify(wallet));
    localStorage.setItem('mgl_kotowaza_points_v1', JSON.stringify(japanese));
    localStorage.setItem('mgl_economy_commit_v2', JSON.stringify({ beforeWallet: JSON.stringify(wallet),
      nextWallet: JSON.stringify({ ...wallet, claimed: wallet.claimed.slice(-128) }),
      beforeMath: '80', nextMath: '80', beforeJapanese: 'stale-history',
      nextJapanese: JSON.stringify({ ...japanese, claims: japanese.claims.slice(-128) }) }));
    const answer = i => ({ id: 'paid-' + i, game: 'alphabet', prompt: 'A', answer: 'a',
      policy: { multiplier: 1, cap: 50 } });
    localStorage.setItem('mgl_economy_outbox_v1', JSON.stringify(Array.from({ length: 26 }, (_, i) => answer(i))));
    for (let i = 26; i < 131; i++) localStorage.setItem('mgl_point_pending:economy:paid-' + i, JSON.stringify(answer(i)));
    localStorage.setItem('mgl_verticalParallel', '{"best":25,"titles":["retained"]}');
    localStorage.setItem('mgl_profile', '{"icon":"icon-005","frame":"frame-11"}');
  });
  await page.route('https://**/*', route => route.abort());
  await page.goto(new URL('support/point-repair.html', base).href);
}
async function receipts(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('manabi-points-v1:', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('ledger'), ledger = tx.objectStore('ledger');
      const rows = {};
      const cursor = ledger.openCursor();
      cursor.onsuccess = () => { const row = cursor.result; if (row) { rows[row.key] = row.value; row.continue(); } };
      tx.oncomplete = () => { db.close(); resolve(rows); };
    };
  }));
}
async function openEconomy(page) {
  await page.route('**/repair-economy-fixture.html', route => route.fulfill({ contentType: 'text/html',
    body: `<body><script>window.MANABI_ENV={preview:false};</script>
      <script src="environment-runtime.js"></script><script src="economy-core.js"></script>
      <script src="storage-adapters.js"></script><script src="economy.js"></script></body>` }));
  await page.goto(new URL('repair-economy-fixture.html', base).href);
  await page.waitForFunction(() => Boolean(window.ManabiEconomy));
}

test('back up and repair reported counts, drain 131 pending duplicates and keep new points exactly once', async ({ page }) => {
  await seed(page);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'バックアップして復旧する' }).click();
  await expect(page.locator('#status')).toContainText('保存データを整理しました', { timeout: 30000 });
  const data = await page.evaluate(() => ({
    wallet: JSON.parse(localStorage.getItem('mgl_economy_v1')),
    japanese: JSON.parse(localStorage.getItem('mgl_kotowaza_points_v1')),
    journal: localStorage.getItem('mgl_economy_commit_v2'),
  }));
  expect(data.wallet.claimed).toHaveLength(128);
  expect(data.japanese.claims).toHaveLength(128);
  expect(data.wallet.balances.english).toBe(40);
  expect(data.journal).toBeNull();
  const ledger = await receipts(page);
  const backup = Object.entries(ledger).find(([key]) => key.startsWith('recovery-backup:'))[1];
  expect(JSON.parse(backup.local.find(([key]) => key === 'mgl_kotowaza_points_v1')[1]).claims).toHaveLength(21736);
  expect(ledger['answer:economy:paid-0']).toBe(1);
  expect(ledger['answer:economy:paid-208']).toBe(1);
  await openEconomy(page);
  await page.evaluate(() => window.ManabiEconomy.flush());
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('mgl_point_pending:')).length)).toBe(0);
  expect(await page.evaluate(() => window.ManabiEconomy.snapshot().balances.english)).toBe(40);
  await page.evaluate(async () => {
    const economy = window.ManabiEconomy, q = economy.begin('alphabet', 'A');
    localStorage.setItem('fixture-replay', JSON.stringify(q));
    await Promise.all([economy.answer(q, 'a'), economy.answer(q, 'a')]);
  });
  await page.reload();
  await page.evaluate(async () => {
    const q = JSON.parse(localStorage.getItem('fixture-replay'));
    await window.ManabiEconomy.answer(q, 'a');
  });
  const result = await page.evaluate(() => ({ wallet: window.ManabiEconomy.snapshot(),
    profile: localStorage.getItem('mgl_profile'), record: localStorage.getItem('mgl_verticalParallel') }));
  expect(result.wallet.balances).toEqual({ japanese: 20, math: 80, social: 30, science: 10, english: 41 });
  expect(result.wallet.owned).toEqual(['icon-005', 'frame-11']);
  expect(result.wallet.customTitles).toEqual(['keep-title']);
  expect(result.profile).toBe('{"icon":"icon-005","frame":"frame-11"}');
  expect(result.record).toBe('{"best":25,"titles":["retained"]}');
  expect(errors).toEqual([]);
});

test('an interrupted projection resumes from the durable backup and receipts', async ({ page }) => {
  await seed(page);
  const first = await page.evaluate(async () => {
    const { recoverDevice } = await import('./point-repair.js?v=1');
    const set = Storage.prototype.setItem;
    let fail = true;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === 'mgl_economy_v1' && fail) { fail = false; throw new DOMException('fixture', 'QuotaExceededError'); }
      return set.call(this, key, value);
    };
    try {
      await recoverDevice({ storage: localStorage, session: sessionStorage, indexedDB, locks: navigator.locks, id: 'fixture-recovery' });
      return 'unexpected';
    } catch (error) { return error.name; }
    finally { Storage.prototype.setItem = set; }
  });
  expect(first).toBe('QuotaExceededError');
  await page.reload();
  await page.getByRole('button', { name: 'バックアップして復旧する' }).click();
  await expect(page.locator('#status')).toContainText('保存データを整理しました', { timeout: 30000 });
  const rows = await receipts(page);
  expect(Object.keys(rows).filter(key => key.startsWith('recovery-backup:'))).toEqual(['recovery-backup:fixture-recovery']);
  expect(rows['recovery:active']).toBeUndefined();
  expect(rows.projection).toBeUndefined();
  expect(rows['answer:economy:paid-208']).toBe(1);
});

test('an unexplained journal discrepancy stops before modifying any local records', async ({ page }) => {
  await seed(page);
  const before = await page.evaluate(() => {
    const journal = JSON.parse(localStorage.getItem('mgl_economy_commit_v2'));
    const wallet = JSON.parse(journal.nextWallet);
    wallet.balances.math += 100;
    journal.nextMath = String(wallet.balances.math);
    journal.nextWallet = JSON.stringify(wallet);
    localStorage.setItem('mgl_economy_commit_v2', JSON.stringify(journal));
    return JSON.stringify({ ...localStorage });
  });
  await page.getByRole('button', { name: 'バックアップして復旧する' }).click();
  await expect(page.locator('#status')).toContainText('復旧を保留しました');
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).toBe(before);
});
