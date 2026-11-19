const WALLET = 'mgl_economy_v1';
const JAPANESE = 'mgl_kotowaza_points_v1';
const JOURNAL = 'mgl_economy_commit_v2';
const MARKER = 'mgl_point_fallback_v1';
const subjects = ['japanese', 'math', 'social', 'science', 'english'];
const amount = value => Number.isSafeInteger(value) && value >= 0;
const fail = code => { throw Error(code); };
const parse = raw => { try { return JSON.parse(raw); } catch { fail('invalid-json'); } };
const claims = value => {
  if (!Array.isArray(value) || value.some(id => typeof id !== 'string' || !id)) fail('invalid-claims');
  return value;
};
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}
function withoutClaims(value) {
  const { claimed, claims: ignored, ...record } = value;
  return JSON.stringify(canonical(record));
}
function validWallet(value) {
  return value?.version === 1 && Array.isArray(value.owned)
    && subjects.every(subject => amount(value.balances?.[subject]))
    && typeof value.daily?.date === 'string' && value.daily.games
    && Object.values(value.daily.games).every(used => amount(used) && used <= 100);
}

function queuedAnswers(storage, session) {
  const queued = [];
  for (const source of [storage, session].filter(Boolean)) {
    const old = source.getItem('mgl_economy_outbox_v1');
    if (old) {
      const list = parse(old);
      if (!Array.isArray(list)) fail('invalid-queue');
      queued.push(...list);
    }
    for (let index = 0; index < source.length; index++) {
      const key = source.key(index);
      if (key.startsWith('mgl_point_pending:economy:') || key.startsWith('manabi_point_pending::mgl_point_pending:economy:')) {
        queued.push(parse(source.getItem(key)));
      }
    }
  }
  return queued;
}
function intendedReward(wallet, next, journal, storage, session, core) {
  if (typeof journal.beforeWallet !== 'string' || !core) fail('journal-state-different');
  const before = parse(journal.beforeWallet);
  if (withoutClaims(before) !== withoutClaims(wallet)) fail('journal-state-different');
  const previous = new Set(claims(before.claimed));
  const added = claims(next.claimed).filter(id => !previous.has(id));
  if (added.length !== 1) fail('unverified-pending-answer');
  const candidates = queuedAnswers(storage, session).filter(item => item.id === added[0]);
  for (const item of candidates) {
    const prompt = core.canonicalPrompt(item.game, item.prompt);
    const correct = core.correct(item.game, prompt, item.answer);
    const policies = item.policy ? [item.policy] : [{ multiplier: 1, cap: 50 }, { multiplier: 2, cap: 50 }];
    for (const policy of policies) {
      const expected = core.reward(before, item.game, correct, next.daily.date, policy).wallet;
      expected.legacyJapaneseImported = true;
      expected.legacyMirror = { math: expected.balances.math, japanese: expected.balances.japanese };
      if (withoutClaims(expected) === withoutClaims(next)) return next;
    }
  }
  fail('unverified-pending-answer');
}

function journalState(wallet) {
  const { legacyMirror, legacyJapaneseImported, ...state } = wallet;
  return withoutClaims(state);
}
function validHistoricalMirror(wallet) {
  return ['math', 'japanese'].every(subject => wallet.legacyMirror?.[subject] === undefined
    || wallet.legacyMirror[subject] === wallet.balances[subject]);
}
function supersededJournal(wallet, next, journal, core) {
  if (!core || typeof journal.beforeWallet !== 'string') return false;
  const before = parse(journal.beforeWallet);
  if (!validWallet(before) || !validHistoricalMirror(before) || !validHistoricalMirror(next)) return false;
  const currentClaims = new Set(claims(wallet.claimed));
  const nextClaims = claims(next.claimed);
  if (!nextClaims.length || nextClaims.some(id => !currentClaims.has(id))
    || next.owned.some(id => !wallet.owned.includes(id))) return false;
  // A history-only journal is obsolete when the current wallet still confirms
  // all its receipts, even after later days and purchases changed the balances.
  if (journalState(before) === journalState(next)) return true;
  const beforeClaims = new Set(claims(before.claimed));
  if (nextClaims.filter(id => !beforeClaims.has(id)).length !== 1) return false;
  // Only an ordinary reward transition is eligible. Never retire an unfinished
  // purchase merely because its pre-existing claim history is still present.
  for (const game of Object.keys(core.games)) {
    for (const multiplier of [1, 2]) {
      for (const correct of [false, true]) {
        try {
          const expected = core.reward(before, game, correct, next.daily.date, { multiplier, cap: 50 }).wallet;
          if (journalState(expected) === journalState(next)) return true;
        } catch { /* An invalid transition supplies no recovery evidence. */ }
      }
    }
  }
  return false;
}

// A different balance is accepted only if the queued answer reproduces the
// journal's intended reward exactly. Purchases and unknown conflicts stop here.
export function planRecovery(storage, session, core) {
  const rawWallet = storage.getItem(WALLET);
  const rawJapanese = storage.getItem(JAPANESE);
  const rawJournal = storage.getItem(JOURNAL);
  if (!rawWallet || !rawJapanese || !rawJournal) fail('repair-not-applicable');
  const wallet = parse(rawWallet), japanese = parse(rawJapanese), journal = parse(rawJournal);
  if (!validWallet(wallet) || !wallet.legacyJapaneseImported) fail('invalid-wallet');
  if (japanese?.version !== 1 || !amount(japanese.balance) || !amount(japanese.used) || japanese.used > 50) fail('invalid-japanese-wallet');
  if (!amount(wallet.legacyMirror?.math) || !amount(wallet.legacyMirror?.japanese)
    || Number(storage.getItem('mgl_points')) !== wallet.balances.math
    || wallet.legacyMirror.math !== wallet.balances.math
    || wallet.legacyMirror.japanese !== wallet.balances.japanese
    || japanese.balance !== wallet.balances.japanese
    || japanese.date !== wallet.daily.date
    || japanese.used !== (wallet.daily.games.kotowaza || 0)) fail('balance-mismatch');
  if (typeof journal.nextWallet !== 'string' || typeof journal.nextMath !== 'string') fail('invalid-journal');
  const next = parse(journal.nextWallet);
  if (!validWallet(next) || Number(journal.nextMath) !== next.balances.math) fail('invalid-journal');
  const superseded = supersededJournal(wallet, next, journal, core);
  const settled = withoutClaims(wallet) === withoutClaims(next) || superseded
    ? wallet : intendedReward(wallet, next, journal, storage, session, core);
  const japaneseAfter = { ...japanese, balance: settled.balances.japanese,
    date: settled.daily.date, used: settled.daily.games.kotowaza || 0 };
  if (journal.nextJapanese !== undefined) {
    if (typeof journal.nextJapanese !== 'string') fail('journal-japanese-different');
    const recordedJapanese = parse(journal.nextJapanese);
    if (superseded) {
      if (recordedJapanese?.version !== 1 || recordedJapanese.balance !== next.balances.japanese
        || recordedJapanese.date !== next.daily.date || recordedJapanese.used !== (next.daily.games.kotowaza || 0)
        || claims(recordedJapanese.claims).some(id => !wallet.claimed.includes(id))) fail('journal-japanese-different');
    } else if (withoutClaims(japaneseAfter) !== withoutClaims(recordedJapanese)) fail('journal-japanese-different');
  }
  const confirmed = new Set([...claims(wallet.claimed), ...claims(next.claimed)]);
  // The old writer appended the common claim list repeatedly. Do not mistake
  // an unverified pre-written legacy ID for proof that its reward was saved.
  if (claims(japanese.claims).some(id => !confirmed.has(id))) fail('legacy-claims-not-confirmed');
  const receipts = [...confirmed];
  const nextWallet = JSON.stringify({ ...settled, claimed: [...claims(settled.claimed)].slice(-128) });
  const nextJapanese = JSON.stringify({ ...japaneseAfter, claims: japanese.claims.slice(-128) });
  const entries = [
    { key: MARKER, before: storage.getItem(MARKER), after: '1' },
    { key: WALLET, before: rawWallet, after: nextWallet },
    { key: 'mgl_points', before: storage.getItem('mgl_points'), after: String(settled.balances.math) },
    { key: JAPANESE, before: rawJapanese, after: nextJapanese },
    { key: JOURNAL, before: rawJournal, after: null },
  ];
  return { entries, receipts };
}

function openDatabase(indexedDB) {
  return new Promise((resolve, reject) => {
    let expired = false;
    const timer = setTimeout(() => { expired = true; reject(Error('backup-open-timeout')); }, 10000);
    const request = indexedDB.open('manabi-points-v1:', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('ledger')) request.result.createObjectStore('ledger');
    };
    request.onerror = () => { clearTimeout(timer); reject(request.error || Error('backup-unavailable')); };
    request.onsuccess = () => {
      clearTimeout(timer);
      if (expired) { request.result.close(); return; }
      resolve(request.result);
    };
  });
}
function transaction(db, operation) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('ledger', 'readwrite');
    const ledger = tx.objectStore('ledger');
    let result, failure;
    const run = callback => {
      try { callback(); } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure || tx.error || Error('backup-transaction-failed'));
    operation(ledger, run, value => { result = value; });
  });
}
function backupEntries(storage) {
  const entries = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (/^(mgl_|mq_|manabi_storage_fallback:|manabi_point_pending:|localPlayerId$)/.test(key)) {
      entries.push([key, storage.getItem(key)]);
    }
  }
  return entries;
}

export async function recoverDevice({ storage, session, indexedDB, locks, id, core }) {
  if (!locks?.request || !indexedDB) fail('safe-recovery-unavailable');
  return locks.request('manabi-production-economy-v1', async () => {
    const db = await openDatabase(indexedDB);
    try {
      const recovery = await transaction(db, (ledger, run, done) => {
        const projection = ledger.get('projection');
        projection.onsuccess = () => run(() => {
          const active = ledger.get('recovery:active');
          active.onsuccess = () => run(() => {
            if (active.result) {
              if (projection.result && JSON.stringify(projection.result) !== JSON.stringify(active.result.entries)) fail('other-pending-projection');
              done(active.result);
              return;
            }
            if (projection.result) fail('other-pending-projection');
            const plan = planRecovery(storage, session, core);
            for (const { key, before } of plan.entries) {
              const shadow = session.getItem('manabi_storage_fallback:' + key);
              if (shadow !== null && shadow !== before) fail('session-state-different');
            }
            const recovery = { id, entries: plan.entries, receiptCount: plan.receipts.length };
            // The original bytes, receipts and recovery plan commit together.
            ledger.add({ createdAt: Date.now(), local: backupEntries(storage), session: backupEntries(session),
              ...recovery }, 'recovery-backup:' + id);
            for (const receipt of plan.receipts) ledger.put(1, 'answer:economy:' + receipt);
            ledger.put(plan.entries, 'projection');
            ledger.put(recovery, 'recovery:active');
            done(recovery);
          });
        });
      });
      await transaction(db, (ledger, run) => {
        const request = ledger.get('projection');
        request.onsuccess = () => run(() => {
          if (request.result && JSON.stringify(request.result) !== JSON.stringify(recovery.entries)) fail('other-pending-projection');
          for (const entry of recovery.entries) {
            const value = storage.getItem(entry.key);
            if (value !== entry.before && value !== entry.after) fail('concurrent-state-different');
          }
          for (const { key, after } of recovery.entries) {
            if (storage.getItem(key) === after) continue;
            if (after === null) storage.removeItem(key);
            else storage.setItem(key, after);
          }
          // Keep the original session values in the durable backup as well.
          for (const { key, before, after } of recovery.entries) {
            const shadowKey = 'manabi_storage_fallback:' + key;
            const shadow = session.getItem(shadowKey);
            if (shadow !== null && shadow !== before && shadow !== after) fail('session-state-different');
            session.removeItem(shadowKey);
          }
          ledger.delete('projection');
          ledger.delete('recovery:active');
          ledger.put({ id: recovery.id, finishedAt: Date.now(), receiptCount: recovery.receiptCount }, 'recovery:latest');
        });
      });
      return { id: recovery.id, receiptCount: recovery.receiptCount };
    } finally {
      db.close();
    }
  });
}

export function recoveryEvidence(storage) {
  try {
    const wallet = parse(storage.getItem(WALLET));
    const journal = parse(storage.getItem(JOURNAL));
    const next = parse(journal.nextWallet);
    const known = new Set(claims(wallet.claimed));
    const ids = claims(next.claimed);
    const before = typeof journal.beforeWallet === 'string' ? parse(journal.beforeWallet) : null;
    return '旧保存の元データ：' + (before ? 'あり' : 'なし')
      + '、旧保存の受領ID：' + ids.filter(id => known.has(id)).length + '/' + ids.length + '件確認'
      + '、所持品の確認：' + (next.owned.every(id => wallet.owned.includes(id)) ? '一致' : '不一致')
      + '、現状と書込前：' + (before && journalState(before) === journalState(wallet) ? '一致' : '相違');
  } catch { return '追加の照合情報を取得できませんでした。'; }
}

if (typeof document !== 'undefined') {
  const button = document.getElementById('repair');
  if (button) button.onclick = async () => {
    button.disabled = true;
    const status = document.getElementById('status');
    status.textContent = '端末内にバックアップを保存し、整合性を確認しています…';
    try {
      const result = await recoverDevice({ storage: localStorage, session: sessionStorage,
        indexedDB: window.indexedDB, locks: navigator.locks, id: crypto.randomUUID(), core: window.ManabiEconomyCore });
      status.textContent = '保存データを整理しました。バックアップ番号 ' + result.id
        + '。加算済み識別子 ' + result.receiptCount + '件を保護しました。ホームへ戻ってゲームを確認してください。';
    } catch (error) {
      status.textContent = '復旧を保留しました。確認コード：' + (error.name === 'QuotaExceededError' ? 'storage-full' : error.message)
        + '。' + recoveryEvidence(localStorage) + '。この表示全体を先生に渡してください。';
      button.disabled = false;
    }
  };
}
