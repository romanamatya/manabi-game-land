const games = new Set(['parallelPair', 'verticalParallel', 'quadrilateral']);
const MAX_BEST = 100000;

export function challengeRankingEnabled(game, config = window.MANABI_BACKEND_CONFIG, env = window.MANABI_ENV) {
  const project = env?.preview === true ? 'manabi-game-landcheck' : 'manabi-game-land';
  return games.has(game) && env?.expectedProjectId === project && config?.firebase?.projectId === project
    && config.mode === (env.preview ? 'preview' : 'production') && config.challengeRankingGameIds?.includes(game);
}

export function challengeBest(game, challenge) {
  if (!games.has(game) || challenge?.game !== game || challenge.protocol !== 2) return 0;
  const attempts = Object.values(challenge.bests || {});
  if (challenge.attemptId && ['running', 'ended'].includes(challenge.phase)) attempts.push(challenge.attemptBest);
  return Math.max(0, ...attempts.filter(n => Number.isSafeInteger(n) && n > 25 && n <= MAX_BEST));
}

export function createPreviewChallengeRanking(F, db, uid, game) {
  if (!games.has(game) || !uid) throw Error('challenge-ranking-not-available');
  const collection = F.collection(db, 'previewSpark', 'v1', 'challengeRankings', game, 'players');
  return {
    async rows() {
      const snapshot = await F.getDocsFromServer(F.query(collection, F.orderBy('bestStreak', 'desc'), F.limit(100)));
      return snapshot.docs.map(doc => doc.data());
    },
    async publish(row) {
      const target = F.doc(collection, uid);
      return F.runTransaction(db, async tx => {
        const previous = (await tx.get(target)).data();
        if ((previous?.bestStreak || 0) >= row.bestStreak) return previous;
        tx.set(target, { ...row, uid, game, updatedAt: F.serverTimestamp() });
        return row;
      });
    },
  };
}

export async function openChallengeRanking(game, config = window.MANABI_BACKEND_CONFIG, env = window.MANABI_ENV) {
  if (!challengeRankingEnabled(game, config, env)) throw Error('challenge-ranking-disabled');
  if (!env.preview) {
    const { challengeRankingClient } = await import('./ranking-sync-api.js?v=b721f383bed3');
    const api = await challengeRankingClient();
    return {
      rows: () => api.rankings(game),
      async publish(row) {
        const nickname = config.accountAccessEnabled === true
          ? await api.getExistingPlayerLink() : await api.ensurePlayerLink(row.nickname);
        return api.publishRanking({ ...row, nickname, game });
      },
    };
  }
  const { F, db } = await window.ManabiFirebaseSession.open(config.firebase);
  if (db.app.options.projectId !== config.firebase.projectId) throw Error('preview-project-mismatch');
  const { getAuth } = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js');
  const user = getAuth(db.app).currentUser;
  if (!user?.isAnonymous) throw Error('anonymous-player-required');
  return createPreviewChallengeRanking(F, db, user.uid, game);
}

export function mountChallengeRanking({ game, read, titles, button = document.getElementById('ranking-open') }) {
  if (!button) return null;
  const params = new URL(location.href).searchParams;
  const enabled = challengeRankingEnabled(game) && !params.has('adminTest') && !params.has('syncTest');
  const storage = window.manabiStorage;
  const dialog = document.createElement('dialog');
  dialog.className = 'challenge-ranking';
  dialog.setAttribute('aria-label', '共有ランキング');
  dialog.innerHTML = '<h2>共有ランキング</h2><p role="status"></p><div class="challenge-ranking-table"><table><thead><tr><th>順位</th><th>プレイヤー</th><th>最高記録</th></tr></thead><tbody></tbody></table></div><div class="challenge-ranking-actions"><button type="button">更新する</button><button type="button">閉じる</button></div>';
  document.body.append(dialog);
  const status = dialog.querySelector('[role="status"]');
  const table = dialog.querySelector('table');
  const rows = table.tBodies[0];
  const [refresh, close] = dialog.querySelectorAll('button');
  let connection, inFlight = false, acknowledged = 0, requestId = 0;
  const access = () => window.MANABI_BACKEND_CONFIG?.accountAccessEnabled !== true || window.ManabiPlayerAccess?.canPlay?.() === true;
  const client = () => connection ||= openChallengeRanking(game).catch(error => { connection = null; throw error; });
  const highest = titles.at(-1);
  const safeLook = value => typeof value === 'string' && /^[A-Za-z0-9:_-]{1,64}$/.test(value);

  async function sync() {
    if (!enabled || !access() || inFlight || !navigator.onLine) return;
    const bestStreak = challengeBest(game, read().challenge);
    const nickname = storage.getItem('mgl_nickname')?.trim();
    if (!nickname || nickname.length > 12 || /[<>\r\n]/.test(nickname) || bestStreak <= acknowledged) return;
    inFlight = true;
    try {
      const look = JSON.parse(storage.getItem('mgl_profile') || '{}') || {};
      await (await client()).publish({
        bestStreak, nickname, icon: safeLook(look.icon) ? look.icon : 'cat',
        frame: safeLook(look.frame) ? look.frame : 'plain', title: highest.name, badge: highest.id,
      });
      acknowledged = bestStreak;
    } catch {
      // The challenge state is already durable. The next retry reads its best again.
    } finally {
      inFlight = false;
    }
  }

  function iconFor(id) {
    const starter = ['cat', 'rabbit', 'penguin', 'robot'].indexOf(id);
    const core = window.ManabiEconomyCore;
    const asset = [...(core.catalog || []), ...(core.limitedRewards || [])].find(item => item.id === id && item.image?.startsWith('assets/'));
    return starter < 0 && asset ? asset.image : 'assets/avatars/icon_' + String(Math.max(starter, 0) + 1).padStart(3, '0') + '.png';
  }

  async function show() {
    const request = ++requestId;
    rows.replaceChildren();
    table.hidden = true;
    status.textContent = enabled ? '読み込み中…' : '共有ランキングは準備中です。';
    refresh.disabled = !enabled;
    if (!enabled) return;
    try {
      if (!access()) throw Error('ranking-access');
      const entries = await (await client()).rows();
      if (request !== requestId) return;
      let previous, rank;
      for (const [i, item] of entries.entries()) {
        if (item.bestStreak !== previous) rank = i + 1;
        previous = item.bestStreak;
        const row = rows.insertRow();
        row.insertCell().textContent = rank + '位';
        const person = row.insertCell();
        const image = document.createElement('img');
        image.src = new URL('../' + iconFor(item.icon), location.href);
        image.alt = '';
        const name = document.createElement('span');
        name.textContent = item.nickname;
        person.append(image, name);
        row.insertCell().textContent = item.bestStreak + '問連続';
      }
      table.hidden = entries.length === 0;
      status.textContent = entries.length ? '120秒チャレンジの最高記録' : 'まだ記録がありません';
    } catch {
      if (request === requestId) status.textContent = 'ランキングを読み込めませんでした。接続を確認して更新してください。';
    }
  }
  button.onclick = () => { if (!dialog.open) dialog.show(); void show(); void sync(); };
  refresh.onclick = show;
  close.onclick = () => { dialog.close(); button.focus(); };
  dialog.addEventListener('close', () => { requestId++; });
  dialog.addEventListener('keydown', event => { if (event.key === 'Escape') dialog.close(); });
  if (enabled) {
    window.addEventListener('online', sync);
    window.addEventListener('pageshow', sync);
    window.addEventListener('manabi-account-access', sync);
    setInterval(sync, 15000);
    void sync();
  }
  return { sync };
}
