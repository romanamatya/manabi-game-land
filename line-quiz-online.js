const game = 'verticalParallel';
const project = 'manabi-game-landcheck';
const root = 'previewSpark/v1';

export function previewLineQuizEnabled(config, env) {
  return env?.preview === true && env.expectedProjectId === project && config?.mode === 'preview'
    && config.firebase?.projectId === project && config.gameIds?.includes(game);
}

export function createLineQuizCloud({ F, db, uid }) {
  const setting = F.doc(db, root, 'gameSettings', game);
  const rankings = F.collection(db, root, 'rankings', game, 'players');
  return {
    watchAvailability(update, unavailable) {
      return F.onSnapshot(setting, { includeMetadataChanges: true }, snap => {
        if (snap.metadata.fromCache) return;
        update(snap.exists() ? snap.data().status === 'published' : true);
      }, unavailable);
    },
    async rows() {
      const rows = await F.getDocsFromServer(F.query(rankings, F.orderBy('bestStreak', 'desc'), F.limit(30)));
      return rows.docs.map(row => row.data());
    },
    async publish({ bestStreak, nickname, title }) {
      if (!uid || !Number.isSafeInteger(bestStreak) || bestStreak < 1 || bestStreak > 100000
          || !nickname || nickname.length > 12 || /[<>\r\n]/.test(nickname)) return;
      const target = F.doc(rankings, uid);
      await F.runTransaction(db, async tx => {
        const current = await tx.get(target);
        if ((current.data()?.bestStreak || 0) >= bestStreak) return;
        tx.set(target, {
          uid, game, bestStreak, nickname, title, icon: 'cat', frame: 'plain', badge: null, updatedAt: F.serverTimestamp(),
        });
      });
    },
  };
}

export function openLineQuizRanking({ storage, titles }) {
  const config = window.MANABI_BACKEND_CONFIG;
  const params = new URL(location.href).searchParams;
  const env = window.MANABI_ENV;
  const production = env?.preview === false && env.expectedProjectId === 'manabi-game-land'
    && config?.mode === 'production' && config.firebase?.projectId === env.expectedProjectId
    && config.verticalParallelManagedEnabled === true;
  const allowed = (production || previewLineQuizEnabled(config, env))
    && !params.has('adminTest') && !params.has('syncTest');
  let pending, lastPublished = 0, inFlight = false, desiredBest = 0;
  function client() {
    if (!allowed) return Promise.reject(Error('preview-line-quiz-only'));
    if (!pending) pending = (async () => {
      if (production) {
        const { verticalParallelClient } = await import('./ranking-sync-api.js?v=vertical-parallel-managed-v1');
        const api = await verticalParallelClient();
        return {
          rows: () => api.rankings(game),
          async publish({ bestStreak, nickname, title, badge }) {
            const canonical = config.accountAccessEnabled === true
              ? await api.getExistingPlayerLink() : await api.ensurePlayerLink(nickname);
            const { icon, frame } = window.ManabiProfile?.appearance(storage) || {};
            return api.publishRanking({ game, bestStreak, nickname: canonical, icon, frame, title, badge });
          },
        };
      }
      const { F, db } = await window.ManabiFirebaseSession.open(config.firebase);
      if (db.app.options.projectId !== project) throw Error('preview-project-mismatch');
      const { getAuth } = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js');
      const user = getAuth(db.app).currentUser;
      if (!user?.isAnonymous) throw Error('anonymous-player-required');
      return createLineQuizCloud({ F, db, uid: user.uid });
    })().catch(error => { pending = null; throw error; });
    return pending;
  }
  return {
    watchAvailability(update) {
      void client().then(api => api.watchAvailability(update, () => {})).catch(() => {});
    },
    rows: async () => (await client()).rows(),
    async publish(best) {
      desiredBest = Math.max(desiredBest, best);
      if (!allowed || inFlight || desiredBest <= lastPublished || !navigator.onLine) return;
      const nickname = storage.getItem('mgl_nickname')?.trim();
      if (!nickname) return;
      inFlight = true;
      try {
        const api = await client();
        while (lastPublished < desiredBest) {
          const bestStreak = desiredBest;
          const earned = titles.filter(t => t.at <= bestStreak).at(-1);
          await api.publish({ bestStreak, nickname, title: earned?.name || null, badge: earned?.id || null });
          lastPublished = bestStreak;
        }
      } catch {
        // The local best is retained and retried when the connection returns.
      } finally { inFlight = false; }
    },
  };
}
