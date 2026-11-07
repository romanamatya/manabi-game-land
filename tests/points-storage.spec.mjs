import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true });

const base = process.env.MGL_BASE_URL || 'http://127.0.0.1:4173/';
test.skip(!['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Use a local fixture only');
const walletKey = 'mgl_economy_v1';
const fixture = 'points-storage-fixture.html';

async function setup(context, { withoutLocks = false } = {}) {
  await context.addInitScript(({ withoutLocks, walletKey }) => {
    localStorage.setItem('mgl_nickname', 'ポイント検証');
    if (withoutLocks) Object.defineProperty(navigator, 'locks', { value: undefined });
    const database = window.indexedDB;
    Object.defineProperty(window, 'indexedDB', {
      get: () => localStorage.getItem('fixture-disable-idb') ? undefined : database,
    });
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === walletKey && localStorage.getItem('fixture-fail-projection')) {
        throw new DOMException('Fixture quota', 'QuotaExceededError');
      }
      return set.call(this, key, value);
    };
  }, { withoutLocks, walletKey });
  await context.route('**/' + fixture + '*', route => {
    const math = new URL(route.request().url()).searchParams.has('legacy-math');
    return route.fulfill({
      contentType: 'text/html',
      body: `<body data-score-game="alphabet"><b id="points"></b>
      <script>window.MANABI_ENV={preview:false};</script>
      <script src="environment-runtime.js"></script><script src="economy-core.js"></script>
      <script src="storage-adapters.js"></script>${math
        ? '<script src="multiplication-properties-model.js"></script><script src="math-concepts-model.js"></script><script src="math-concepts-production-points.js"></script>'
        : '<script src="economy.js"></script>'}</body>`,
    });
  });
  await context.route(/https:\/\/(?:identitytoolkit|securetoken|firestore)\.googleapis\.com\//, route => route.abort());
  return async function open(math = false) {
    const page = await context.newPage();
    await page.goto(new URL(fixture + (math ? '?legacy-math' : ''), base).href);
    await page.waitForFunction(() => Boolean(window.ManabiEconomy));
    return page;
  };
}
const balance = (page, subject) => page.evaluate(({ walletKey, subject }) =>
  JSON.parse(localStorage.getItem(walletKey))?.balances[subject] || 0, { walletKey, subject });
const english = (page, count) => page.evaluate(async count => {
  for (let i = 0; i < count; i++) {
    const economy = window.ManabiEconomy;
    await economy.answer(economy.begin('alphabet', 'A'), 'a');
  }
}, count);

test('native Web Locks still save and a double tap grants one point', async ({ context }) => {
  const open = await setup(context);
  const page = await open();
  expect(await page.evaluate(() => typeof navigator.locks?.request)).toBe('function');
  await page.evaluate(async () => {
    const api = window.ManabiEconomy, question = api.begin('alphabet', 'A');
    await Promise.all([api.answer(question, 'a'), api.answer(question, 'a')]);
  });
  await expect.poll(() => balance(page, 'english')).toBe(1);
});

test('without Web Locks, reload retains pending answers and a failed projection can recover once', async ({ context }) => {
  const open = await setup(context, { withoutLocks: true });
  const page = await open();
  await page.evaluate(() => localStorage.setItem('fixture-disable-idb', '1'));
  await page.reload();
  await page.evaluate(() => {
    const api = window.ManabiEconomy, question = api.begin('alphabet', 'A');
    localStorage.setItem('fixture-question', JSON.stringify(question));
    void api.answer(question, 'a');
  });
  await page.reload();
  expect(await balance(page, 'english')).toBe(0);
  await page.evaluate(async () => {
    localStorage.removeItem('fixture-disable-idb');
    localStorage.setItem('fixture-fail-projection', '1');
    await window.ManabiEconomy.flush();
  });
  expect(await balance(page, 'english')).toBe(0);
  await page.evaluate(() => localStorage.removeItem('fixture-fail-projection'));
  await page.reload();
  await expect.poll(() => balance(page, 'english')).toBe(1);
  await page.evaluate(async key => {
    const wallet = JSON.parse(localStorage.getItem(key));
    wallet.claimed = []; // Simulate the bounded recent-claim list rotating.
    localStorage.setItem(key, JSON.stringify(wallet));
    const replay = JSON.parse(localStorage.getItem('fixture-question'));
    await window.ManabiEconomy.answer(replay, 'a');
  }, walletKey);
  expect(await balance(page, 'english')).toBe(1);
});

test('two tabs share one wallet and one daily cap, including the legacy math writer', async ({ context }) => {
  test.setTimeout(60000);
  const open = await setup(context, { withoutLocks: true });
  const a = await open(), b = await open(), math = await open(true);
  await Promise.all([english(a, 30), english(b, 30), math.evaluate(async () => {
    for (let i = 0; i < 3; i++) {
      const problem = window.ManabiMultiplication.multiplication()[0];
      const api = window.ManabiEconomy;
      await api.answer(api.begin('multiplicationProperties', problem), { choice: problem.answer });
    }
    const shape = window.ManabiMathConcepts.shapes()[0];
    const api = window.ManabiEconomy;
    await api.answer(api.begin('shapeExpressions', shape), { choice: shape.answer });
  })]);
  await expect.poll(() => balance(a, 'english')).toBe(50);
  await expect.poll(() => balance(b, 'math')).toBe(4);
  expect(await math.evaluate(() => window.ManabiEconomy.balance())).toBe(4);
  expect(await a.evaluate(key => JSON.parse(localStorage.getItem(key)).daily.games.alphabet, walletKey)).toBe(50);
  expect(await a.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('mgl_point_pending:')))).toEqual([]);
});

test('saved work credits only the matching subject and retains existing profile and rewards', async ({ context }) => {
  const open = await setup(context, { withoutLocks: true });
  const page = await open();
  await page.evaluate(async key => {
    const api = window.ManabiEconomy;
    const wallet = api.core.initial();
    wallet.balances.science = 9;
    wallet.owned = ['icon-005', 'frame-11'];
    const state = { title: '検証済みの称号', best: 25 };
    localStorage.setItem('mgl_parallelPair', JSON.stringify(state));
    localStorage.setItem('mgl_profile', JSON.stringify({ icon: 'icon-005' }));
    localStorage.setItem(key, JSON.stringify(wallet));
    // Previously queued answers must share the same recovery path.
    localStorage.setItem('mgl_economy_outbox_v1', JSON.stringify([
      { ...api.begin('pref-name', '埼玉県'), answer: '埼玉県' },
      { ...api.begin('keisanSummary', { id: 'fixture', expected: true }), answer: { completed: true } },
      { ...api.begin('kotowaza', 'k001'), answer: '七転び八起き' },
      { ...api.begin('alphabet', 'A'), answer: 'a' },
    ]));
    await api.flush();
  }, walletKey);
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)).balances, walletKey))
    .toEqual({ japanese: 1, math: 1, social: 1, science: 9, english: 1 });
  expect(await page.evaluate(key => ({
    owned: JSON.parse(localStorage.getItem(key)).owned,
    profile: JSON.parse(localStorage.getItem('mgl_profile')),
    state: JSON.parse(localStorage.getItem('mgl_parallelPair')),
    pending: JSON.parse(localStorage.getItem('mgl_economy_outbox_v1')),
  }), walletKey)).toEqual({
    owned: ['icon-005', 'frame-11'],
    profile: { icon: 'icon-005' },
    state: { title: '検証済みの称号', best: 25 },
    pending: [],
  });
});
