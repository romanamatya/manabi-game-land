(function (root) {
  'use strict';

  function createProgress({ storage, economy, challenge, core, titles, game,
    now = Date.now, monotonic = () => performance.now(), uuid = () => crypto.randomUUID(),
    locks = globalThis.navigator?.locks }) {
    const key = 'mgl_' + game;
    let memory, warning = false, queue = Promise.resolve();
    let wallAnchor = now(), monoAnchor = monotonic();

    function read() {
      let saved = {};
      try { saved = memory ?? (JSON.parse(storage.getItem(key)) || {}); }
      catch { warning = true; saved = memory ?? {}; }
      const validBest = Number.isSafeInteger(saved.best) && saved.best >= 0 ? saved.best : 0;
      let state = saved.challenge;
      if (state?.protocol !== challenge.PROTOCOL || state.game !== game) {
        state = challenge.fresh(game, validBest >= challenge.highest[game]);
      }
      const time = challenge.clock(state, now(), monotonic() - monoAnchor, wallAnchor);
      state = challenge.settle(state, time.now, time.rollback);
      return {
        best: Math.max(validBest, state.practiceStreak, state.attemptBest),
        streak: state.phase === 'training' || state.phase === 'waiting' ? state.practiceStreak : state.streak,
        challenge: state,
      };
    }

    function save(record) {
      try { storage.setItem(key, JSON.stringify(record)); memory = undefined; warning = false; }
      catch { memory = record; warning = true; }
    }

    function transaction(action) {
      const run = () => action(read());
      const next = queue.then(() => locks?.request ? locks.request(key, run) : run());
      queue = next.catch(() => {});
      return next;
    }

    function begin(question) {
      const prompt = core.canonicalPrompt(game, question);
      const context = economy.begin(game, prompt);
      context.policy = { multiplier: 1, cap: 50 };
      context.__mglCelebrationHandled = true;
      return { context, token: challenge.issue(read().challenge, context.id) };
    }

    function answer({ context, token }, selection) {
      return transaction(async record => {
        if (context.answered) return { accepted: false };
        const value = { selection };
        const correct = core.correct(game, context.prompt, value);
        const result = challenge.answer(record.challenge, token, correct, Math.max(now(), record.challenge.lastWall));
        if (!result.accepted) return { accepted: false };
        // Only the existing economy outbox handles point persistence, and only for correct answers.
        if (correct) await economy.answer(context, value);
        context.answered = true;
        const state = result.state;
        state.claimed = state.claimed.slice(-128);
        const streak = state.phase === 'training' || state.phase === 'waiting' ? state.practiceStreak : state.streak;
        const best = Math.max(record.best, streak, state.attemptBest);
        save({ best, streak, challenge: state });
        return { accepted: true, correct, title: titles.filter(t => t.at > record.best && t.at <= best).at(-1) };
      });
    }

    function start() {
      return transaction(record => {
        if (!['waiting', 'ended'].includes(record.challenge.phase)) return;
        wallAnchor = now();
        monoAnchor = monotonic();
        const state = challenge.start(record.challenge, wallAnchor, uuid(), 'vertical-parallel-v1');
        save({ best: record.best, streak: state.streak, challenge: state });
      });
    }

    return { read, begin, answer, start, warning: () => warning || root.ManabiStorageWarning === true };
  }

  root.ManabiLineQuizProgress = { createProgress };
})(globalThis);
