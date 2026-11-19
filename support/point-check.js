const parseLimit = 2 * 1024 * 1024;
const subjects = ['japanese', 'math', 'social', 'science', 'english'];
const validAmount = value => Number.isSafeInteger(value) && value >= 0;

export function inspectStorage(storage) {
  const rows = [];
  const add = (name, value) => rows.push([name, String(value)]);
  const read = key => {
    try { return storage.getItem(key); }
    catch { return undefined; }
  };
  const parsed = key => {
    const raw = read(key);
    if (raw === undefined) return { status: '読取不可' };
    if (raw === null) return { status: 'なし' };
    if (raw.length > parseLimit) return { status: '大きすぎるため解析を保留', raw };
    try { return { status: '正常', raw, value: JSON.parse(raw) }; }
    catch { return { status: 'JSON破損', raw }; }
  };
  const wallet = parsed('mgl_economy_v1');
  const japanese = parsed('mgl_kotowaza_points_v1');
  const journal = parsed('mgl_economy_commit_v2');
  const w = wallet.value;
  const j = japanese.value;
  const validWallet = w?.version === 1 && Array.isArray(w?.owned)
    && subjects.every(subject => validAmount(w?.balances?.[subject]));
  add('共通ポイントデータ', wallet.status === '正常' ? (validWallet ? '正常' : '形式不一致') : wallet.status);
  add('共通データの大きさ', wallet.raw ? wallet.raw.length + '文字' : '0文字');
  add('共通の加算識別子', Array.isArray(w?.claimed) ? w.claimed.length + '件' : '未確認');
  add('国語の旧保存データ', japanese.status);
  add('国語の加算識別子', Array.isArray(j?.claims) ? j.claims.length + '件' : 'なし・未確認');
  add('国語データの移行', !j || !w ? '対象なし・未確認' : w.legacyJapaneseImported ? '済み' : '未実施');
  const math = read('mgl_points');
  add('算数の保存整合性', validWallet && math !== undefined
    ? (Number(math ?? 0) === (w.legacyMirror?.math ?? w.balances.math) ? '一致' : '不一致') : '未確認');
  add('国語の保存整合性', validWallet && j
    ? (j.balance === (w.legacyMirror?.japanese ?? w.balances.japanese) ? '一致' : '不一致') : '対象なし・未確認');
  add('書込途中の保存データ', journal.status === '正常' ? 'あり' : journal.status);
  if (journal.value) {
    const pending = journal.value;
    const checks = [
      ['mgl_economy_v1', pending.beforeWallet, pending.nextWallet],
      ['mgl_points', pending.beforeMath, pending.nextMath],
    ];
    if (pending.nextJapanese !== undefined) checks.push(['mgl_kotowaza_points_v1', pending.beforeJapanese, pending.nextJapanese]);
    add('書込途中データの整合性', checks.every(([key, before, after]) => {
      const value = read(key);
      return value !== undefined && (value === before || value === after);
    }) ? '一致' : '不一致');
  }
  for (const [key, name] of [
    ['mgl_economy_outbox_v1', '旧方式の保存待ち'],
    ['mgl_math_concepts_outbox_v1', '算数追加ゲームの保存待ち'],
  ]) {
    const result = parsed(key);
    add(name, Array.isArray(result.value) ? result.value.length + '件' : result.status);
  }
  let pending = 0, damaged = 0, characters = 0;
  try {
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (!key?.startsWith('mgl_')) continue;
      const raw = read(key);
      characters += raw?.length ?? 0;
      if (key.startsWith('mgl_point_pending:')) {
        pending++;
        const result = parsed(key);
        if (result.status !== '正常' || !result.value || typeof result.value.id !== 'string') damaged++;
      }
    }
    add('共通方式の保存待ち', pending + '件（解析不可 ' + damaged + '件）');
    add('ゲーム保存データ量の目安', (characters * 2 / 1024 / 1024).toFixed(2) + ' MiB');
  } catch {
    add('共通方式の保存待ち', '読取不可');
  }
  const profile = parsed('mgl_profile');
  add('プロフィール保存形式', profile.status);
  return rows;
}

if (typeof document !== 'undefined') {
  const rows = [['診断版', '1']];
  try { rows.push(...inspectStorage(window.localStorage)); }
  catch { rows.push(['端末の保存領域', '読取不可']); }
  rows.push(['Web Locks', typeof navigator.locks?.request === 'function' ? '対応' : '非対応']);
  try { rows.push(['IndexedDB', window.indexedDB ? '利用可能' : '非対応']); }
  catch { rows.push(['IndexedDB', '読取不可']); }
  const body = document.getElementById('results');
  for (const [name, value] of rows) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    const td = document.createElement('td');
    th.textContent = name;
    td.textContent = value;
    tr.append(th, td);
    body.append(tr);
  }
  body.firstElementChild.remove();
  document.getElementById('copy').onclick = async () => {
    const status = document.getElementById('status');
    try {
      await navigator.clipboard.writeText(rows.map(([name, value]) => name + '：' + value).join('\n'));
      status.textContent = 'コピーしました。先生に診断結果を渡してください。';
    } catch {
      status.textContent = 'コピーできませんでした。この画面のスクリーンショットを先生に見せてください。';
    }
  };
}
