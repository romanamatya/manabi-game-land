import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectStorage } from '../support/point-check.js';

function storage(values) {
  const entries = Object.entries(values);
  return {
    length: entries.length,
    key: index => entries[index][0],
    getItem: key => values[key] ?? null,
    setItem() { throw Error('Diagnostic must not write'); },
    removeItem() { throw Error('Diagnostic must not remove'); },
  };
}
const wallet = {
  version: 1, owned: ['icon-005'], claimed: ['private-answer-id'],
  balances: { japanese: 20, math: 80, science: 0, social: 3, english: 9 },
};
test('diagnostic identifies legacy migration and mirror mismatches without exposing private values or modifying records', () => {
  const data = {
    mgl_nickname: '非公開テスト名', localPlayerId: 'private-uid', mgl_points: '12',
    mgl_economy_v1: JSON.stringify(wallet),
    mgl_kotowaza_points_v1: JSON.stringify({ balance: 50, claims: ['secret-claim'] }),
    'mgl_point_pending:economy:private-id': JSON.stringify({ id: 'private-id', answer: 'private-answer' }),
  };
  const before = JSON.stringify(data);
  const rows = inspectStorage(storage(data));
  const report = Object.fromEntries(rows);
  assert.equal(report['国語データの移行'], '未実施');
  assert.equal(report['算数の保存整合性'], '不一致');
  assert.equal(report['国語の保存整合性'], '不一致');
  assert.equal(report['共通方式の保存待ち'], '1件（解析不可 0件）');
  for (const secret of ['非公開テスト名', 'private-uid', 'private-id', 'private-answer', 'secret-claim', 'icon-005']) {
    assert(!JSON.stringify(rows).includes(secret));
  }
  assert.equal(JSON.stringify(data), before);
});
test('damaged, oversized and inaccessible storage produces a report', () => {
  const report = Object.fromEntries(inspectStorage(storage({
    mgl_economy_v1: '{', 'mgl_point_pending:economy:x': '{',
    mgl_profile: 'x'.repeat(2 * 1024 * 1024 + 1),
  })));
  assert.equal(report['共通ポイントデータ'], 'JSON破損');
  assert.equal(report['共通方式の保存待ち'], '1件（解析不可 1件）');
  assert.equal(report['プロフィール保存形式'], '大きすぎるため解析を保留');
  assert.doesNotThrow(() => inspectStorage({ getItem() { throw Error('blocked'); }, length: 0 }));
});
test('partial commits are checked against their before and after values without replaying writes', () => {
  const next = JSON.stringify({ ...wallet, legacyJapaneseImported: true });
  const data = {
    mgl_points: '80', mgl_economy_v1: next,
    mgl_economy_commit_v2: JSON.stringify({ beforeWallet: null, nextWallet: next, beforeMath: '79', nextMath: '80' }),
  };
  assert.equal(Object.fromEntries(inspectStorage(storage(data)))['書込途中データの整合性'], '一致');
  data.mgl_points = '81';
  assert.equal(Object.fromEntries(inspectStorage(storage(data)))['書込途中データの整合性'], '不一致');
});
