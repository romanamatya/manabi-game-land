const MODES = Object.freeze({ read: '図から角度を読む', match: '数字から図を選ぶ' });
const ANGLES = new Set([30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330, 360]);

export function summarizeKakudoLearning(rows) {
 const totals = new Map();
 for (const row of Array.isArray(rows) ? rows : []) {
  if (!Object.hasOwn(MODES, row?.mode) || !ANGLES.has(Number(row?.angle))) continue;
  const total = Number(row.total), correct = Number(row.correct), angle = Number(row.angle);
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(correct) || correct < 0 || correct > total) continue;
  const key = `${row.mode}:${angle}`;
  const value = totals.get(key) || { mode: row.mode, angle, total: 0, correct: 0 };
  value.total += total;
  value.correct += correct;
  totals.set(key, value);
 }
 return [...totals.values()]
  .sort((a, b) => a.mode.localeCompare(b.mode) || a.angle - b.angle)
  .map(row => ({ ...row, label: MODES[row.mode], accuracyPercent: row.total ? Math.round(row.correct / row.total * 100) : 0 }));
}
