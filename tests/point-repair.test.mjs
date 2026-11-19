import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { planRecovery } from '../support/point-repair.js';
const context = { structuredClone, Date };
vm.createContext(context);
for (const path of ['economy-core.js', 'storage-adapters.js']) vm.runInContext(fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8'), context);
const core = context.ManabiEconomyCore;
export function fixture() {
  const wallet = core.initial();
  wallet.balances = { japanese: 20, math: 80, social: 30, science: 10, english: 40 };
  wallet.legacyMirror = { math: 80, japanese: 20 };
  wallet.legacyJapaneseImported = true;
  wallet.daily = { date: core.dayKey(), games: { kotowaza: 5 } };
  wallet.claimed = Array.from({ length: 209 }, (_, index) => 'paid-' + index);
  wallet.owned = ['icon-005', 'frame-11'];
  wallet.custom = { title: 'retain' };
  const japanese = { version: 1, balance: 20, date: wallet.daily.date, used: 5,
    claims: Array.from({ length: 21736 }, (_, index) => 'paid-' + (index % 209)) };
  const values = new Map([
    ['mgl_economy_v1', JSON.stringify(wallet)], ['mgl_points', '80'],
    ['mgl_kotowaza_points_v1', JSON.stringify(japanese)],
    ['mgl_economy_commit_v2', JSON.stringify({ beforeWallet: JSON.stringify(wallet),
      nextWallet: JSON.stringify({ ...wallet, claimed: wallet.claimed.slice(-128) }),
      beforeMath: '80', nextMath: '80', beforeJapanese: 'old-bytes',
      nextJapanese: JSON.stringify({ ...japanese, claims: japanese.claims.slice(-128) }) })],
    ['mgl_economy_outbox_v1', JSON.stringify([{ id: 'paid-0', game: 'alphabet', prompt: 'A', answer: 'a' }])],
    ['mgl_verticalParallel', '{"best":25}'], ['mgl_profile', '{"icon":"icon-005"}'],
  ]);
  const storage = { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key),
    get length() { return values.size; }, key: index => [...values.keys()][index] };
  return { wallet, japanese, values, storage };
}

test('stale journal with 21,736 old claims is planned without changing balances, purchases, titles, profile or pending answers', () => {
  const { storage, values, wallet } = fixture();
  const before = [...values];
  const plan = planRecovery(storage);
  assert.deepEqual([...values], before);
  assert.equal(plan.receipts.length, 209);
  const next = JSON.parse(plan.entries.find(row => row.key === 'mgl_economy_v1').after);
  assert.equal(next.claimed.length, 128);
  const { claimed, ...retained } = next;
  const { claimed: ignored, ...expected } = wallet;
  assert.deepEqual(retained, JSON.parse(JSON.stringify(expected)));
  assert.equal(JSON.parse(plan.entries.find(row => row.key === 'mgl_kotowaza_points_v1').after).claims.length, 128);
  assert(!plan.entries.some(row => /outbox|profile|verticalParallel/.test(row.key)));
});
test('a different journal balance without a matching pending answer is refused', () => {
  const { storage, values } = fixture();
  const journal = JSON.parse(storage.getItem('mgl_economy_commit_v2'));
  const next = JSON.parse(journal.nextWallet);
  next.balances.math++;
  journal.nextWallet = JSON.stringify(next);
  journal.nextMath = '81';
  values.set('mgl_economy_commit_v2', JSON.stringify(journal));
  const before = [...values];
  assert.throws(() => planRecovery(storage), /journal-state-different/);
  assert.deepEqual([...values], before);
});
test('a verified queued reward can finish an interrupted commit exactly once', () => {
  const { storage, values, wallet, japanese } = fixture();
  const item = { id: 'pending-new', game: 'alphabet', prompt: 'A', answer: 'a', policy: { multiplier: 1, cap: 50 } };
  const next = core.reward(wallet, 'alphabet', true, wallet.daily.date, item.policy).wallet;
  next.claimed = [...wallet.claimed, item.id].slice(-128);
  const journal = JSON.parse(storage.getItem('mgl_economy_commit_v2'));
  journal.nextWallet = JSON.stringify(next);
  journal.nextJapanese = JSON.stringify({ ...japanese, claims: next.claimed });
  values.set('mgl_economy_commit_v2', JSON.stringify(journal));
  values.set('mgl_point_pending:economy:pending-new', JSON.stringify(item));
  const plan = planRecovery(storage, undefined, core);
  const after = JSON.parse(plan.entries.find(row => row.key === 'mgl_economy_v1').after);
  assert.equal(after.balances.english, 41);
  assert.equal(after.balances.math, 80);
  assert(plan.receipts.includes(item.id));
  item.answer = 'wrong';
  values.set('mgl_point_pending:economy:pending-new', JSON.stringify(item));
  assert.throws(() => planRecovery(storage, undefined, core), /unverified-pending-answer/);
});
test('failed journal persistence cannot update the Japanese balance ahead of the wallet', () => {
  const { storage, values, wallet } = fixture();
  values.delete('mgl_economy_commit_v2');
  const original = storage.setItem;
  const before = [...values];
  storage.setItem = (key, value) => { if (key === 'mgl_economy_commit_v2') throw Error('quota'); original(key, value); };
  const adapter = context.ManabiStorageAdapters.create(storage, core, 'production');
  const next = core.reward(wallet, 'kotowaza', true, wallet.daily.date).wallet;
  assert.throws(() => adapter.commit(next), /quota/);
  assert.deepEqual([...values], before);
});
test('an interrupted multi-key commit replays only the recorded before and after values', () => {
  for (const failedKey of ['mgl_economy_v1', 'mgl_points', 'mgl_kotowaza_points_v1']) {
    const { storage, values, wallet } = fixture();
    values.delete('mgl_economy_commit_v2');
    const original = storage.setItem;
    storage.setItem = (key, value) => { if (key === failedKey) throw Error('interrupted'); original(key, value); };
    const adapter = context.ManabiStorageAdapters.create(storage, core, 'production');
    assert.throws(() => adapter.commit(core.reward(wallet, 'kotowaza', true, wallet.daily.date).wallet));
    storage.setItem = original;
    assert.equal(context.ManabiStorageAdapters.create(storage, core, 'production').snapshot().balances.japanese, 21);
    assert.equal(JSON.parse(storage.getItem('mgl_kotowaza_points_v1')).balance, 21);
    assert.equal(storage.getItem('mgl_economy_commit_v2'), null);
  }
});

test('legacy IDs without confirmation in the completed wallet are never treated as already paid', () => {
  const { storage, values, japanese } = fixture();
  japanese.claims.push('uncertain-reward');
  values.set('mgl_kotowaza_points_v1', JSON.stringify(japanese));
  const before = [...values];
  assert.throws(() => planRecovery(storage), /legacy-claims-not-confirmed/);
  assert.deepEqual([...values], before);
});
