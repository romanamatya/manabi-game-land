import { GAME, SHAPES, createDeck } from './shikakke-secrets-model.js?v=a942ec926be0';

const $ = id => document.getElementById(id);
const config = window.MANABI_BACKEND_CONFIG;
if (window.MANABI_ENV?.environment === config?.mode && config.staticLocalGameIds?.includes(GAME)) {
  play();
} else {
  $('hint').textContent = 'このゲームは現在公開されていません。';
}

function play() {
  const { manabiStorage: storage, ManabiEconomy: economy, ManabiEconomyCore: core,
    ManabiChallenge120Core: challenge, ManabiCelebrations: celebrations } = window;
  const { titles } = window.ManabiProfileCatalog.find(game => game.id === GAME);
  const progress = window.ManabiLineQuizProgress.createProgress({
    storage, economy, core, challenge, titles, game: GAME, season: 'shikakke-secrets-v1',
  });
  const deck = createDeck(core.shikakkeQuestions);
  const selection = new Set();
  const confirm = $('confirm');
  const start = $('challenge-start');
  const gate = $('challenge-gate');
  const shapes = $('shapes');
  let question, attempt, phase = 'closed';

  function refreshControls() {
    for (const button of shapes.children) {
      button.disabled = phase !== 'ask';
      button.setAttribute('aria-pressed', String(selection.has(button.dataset.shape)));
    }
    confirm.disabled = phase !== 'ask' || selection.size === 0;
  }

  function feedback(text, wrong = false) {
    $('hint').textContent = text;
    $('hint').toggleAttribute('data-wrong', wrong);
  }

  for (const { id, name, points } of SHAPES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secrets-choice';
    button.dataset.shape = id;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 124 108');
    svg.setAttribute('aria-hidden', 'true');
    const polygon = document.createElementNS(svg.namespaceURI, 'polygon');
    polygon.setAttribute('points', points.map(pair => pair.join(',')).join(' '));
    svg.append(polygon);
    const label = document.createElement('span');
    label.textContent = name;
    button.append(svg, label);
    button.onclick = () => {
      if (phase !== 'ask') return;
      if (selection.has(id)) selection.delete(id);
      else selection.add(id);
      refreshControls();
    };
    shapes.append(button);
  }

  for (const title of [...titles].reverse()) {
    const item = document.createElement('li');
    item.dataset.threshold = title.at;
    const name = document.createElement('span');
    name.textContent = title.name;
    const goal = document.createElement('small');
    goal.textContent = title.at + '問連続';
    const image = document.createElement('img');
    image.src = '../' + title.image;
    image.alt = '';
    item.append(name, image, goal);
    $('tower').append(item);
  }

  const person = window.ManabiProfile.appearance(storage);
  const nickname = document.createElement('span');
  nickname.textContent = storage.getItem('mgl_nickname') || 'プレイヤー';
  $('player').append(window.ManabiIdentity.avatar(person.icon, person.frame, 30), nickname);

  function paintClock(state) {
    $('clock').textContent = state.phase === 'running' ? '残り ' + challenge.format(state.deadline - state.lastWall)
      : state.phase === 'training' ? '時間制限なし' : '120秒チャレンジ';
  }

  function paintRecord({ best, streak, challenge: state }) {
    const wallet = economy.snapshot();
    const used = wallet.daily.date === core.dayKey() ? wallet.daily.games[GAME] || 0 : 0;
    const threshold = challenge.highest[GAME];
    const timedBest = Math.max(state.attemptBest, ...Object.values(state.bests));
    $('points').textContent = economy.balance(GAME);
    $('daily').textContent = `今日 ${used} / 50pt`;
    $('streak').textContent = streak;
    $('practice-best').textContent = Math.min(threshold, best);
    $('challenge-best').textContent = timedBest > threshold ? timedBest : '—';
    $('storage-status').textContent = progress.warning() ? '記録を端末に保存できませんでした。' : '';
    for (const item of $('tower').children) item.classList.toggle('earned', best >= Number(item.dataset.threshold));
    paintClock(state);
  }

  function showQuestion(reuse = false) {
    const record = progress.read();
    const state = record.challenge;
    const waiting = state.phase === 'waiting';
    gate.hidden = !waiting && state.phase !== 'ended';
    shapes.inert = !gate.hidden;
    selection.clear();
    paintRecord(record);
    if (gate.hidden) {
      if (!reuse || !question) question = deck.next();
      attempt = progress.begin({ questionId: question.id });
      $('question').textContent = question.text;
      feedback('図形をタップして選ぼう。');
      phase = 'ask';
    } else {
      phase = 'closed';
      $('challenge-heading').textContent = waiting ? '四角形の神 達成！' : 'チャレンジ終了';
      $('challenge-message').textContent = waiting ? '25問連続からスタート。ボタンを押すと時間がへるよ！'
        : (state.endReason === 'timeout' ? '時間切れ！' : 'もう一度ちょうせんしよう！') + ` 今回の最高 ${state.attemptBest}問`;
      start.textContent = waiting ? '120秒チャレンジを始める' : 'もう一度120秒チャレンジ';
    }
    refreshControls();
  }

  confirm.onclick = async () => {
    if (phase !== 'ask' || selection.size === 0) return;
    phase = 'checking';
    refreshControls();
    try {
      const result = await progress.answer(attempt, [...selection]);
      const record = progress.read();
      paintRecord(record);
      if (!result.accepted) return showQuestion(true);
      if (result.correct) {
        feedback('正解！');
        if (result.title) {
          const { name, at, image } = result.title;
          // Supplying explicit artwork selects it instead of the indexed 512px badge.
          celebrations.showTitle({ name, at, image: image.replace('_512.png', '_1254.png') });
        } else celebrations.showCorrect();
        setTimeout(showQuestion, 500);
      } else {
        showQuestion(true);
        if (record.challenge.phase === 'training') feedback('もう一度！ 同じ問題で選び直そう。', true);
      }
    } catch (error) {
      console.error(error);
      phase = 'ask';
      refreshControls();
      feedback('記録の保存に失敗しました。もう一度押してください。', true);
    }
  };

  start.onclick = async () => {
    start.disabled = true;
    const reuse = progress.read().challenge.endReason === 'wrong-answer';
    try {
      await progress.start();
      showQuestion(reuse);
    } finally {
      start.disabled = false;
    }
  };

  function tick() {
    const { challenge: state } = progress.read();
    paintClock(state);
    if (phase === 'ask' && state.phase === 'ended') showQuestion();
  }
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('storage', () => { tick(); paintRecord(progress.read()); });
  window.addEventListener('manabi-economy-change', () => paintRecord(progress.read()));
  setInterval(tick, 200);
  showQuestion();
}
