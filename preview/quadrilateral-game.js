import { createQuestionDeck, GAME, WIDTH, HEIGHT } from './quadrilateral-model.js?v=6609f7cdc911';

const $ = id => document.getElementById(id);
const config = window.MANABI_BACKEND_CONFIG;
if (!window.MANABI_ENV || config?.mode !== window.MANABI_ENV.environment || !config.staticLocalGameIds?.includes(GAME)) {
  $('hint').textContent = 'このゲームは現在公開されていません。';
} else {
  runGame();
}

function runGame() {
  const core = window.ManabiEconomyCore;
  const economy = window.ManabiEconomy;
  const challenge = window.ManabiChallenge120Core;
  const { titles } = window.ManabiProfileCatalog.find(item => item.id === GAME);
  const progress = window.ManabiLineQuizProgress.createProgress({
    storage: window.manabiStorage, economy, challenge, core, titles, game: GAME,
    answerValue: number => ({ number }), season: 'quadrilateral-v1',
  });
  const savedChallenge = progress.read().challenge;
  let deck = createQuestionDeck(Math.random, savedChallenge.phase === 'running' ? savedChallenge.sequence : 0);
  let question, attempt;
  let input = '';
  let phase = 'closed';
  let timer;
  const keys = [];

  function svg(tag, attributes, text) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    if (text) node.textContent = text;
    return node;
  }

  function renderQuestion() {
    const { shape, kind, targetName, vertexLabels, measureLabels, arcs, vertices } = question;
    $('shape-name').textContent = shape === 'r' ? 'ひし形' : '平行四辺形';
    $('shape-name').dataset.shape = shape;
    $('kind').textContent = kind === 'length' ? '辺の長さ' : '角度';
    $('question').textContent = kind === 'length'
      ? `辺${targetName}の長さは何cm？` : `角${targetName}の大きさは何度？`;
    $('unit').textContent = kind === 'length' ? 'cm' : '°';
    const label = [$('shape-name').textContent, $('question').textContent,
      ...measureLabels.filter(item => item.known).map(({ index, text }) =>
        (kind === 'length' ? '辺' + 'ABCD'[index] + 'ABCD'[(index + 1) % 4] : '角' + 'ABCD'[index]) + ' ' + text)];
    const drawing = svg('svg', { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, role: 'img', 'aria-label': label.join('。'), 'data-shape': shape });
    drawing.append(svg('polygon', { points: vertices.map(p => p.join(',')).join(' ') }));
    for (const { from, to, radius } of arcs) {
      drawing.append(svg('path', { d: `M ${from.join(' ')} A ${radius} ${radius} 0 0 1 ${to.join(' ')}` }));
    }
    for (const item of [...vertexLabels, ...measureLabels]) {
      const attributes = { x: item.at[0], y: item.at[1] };
      if (item.known === false) attributes['data-unknown'] = '';
      drawing.append(svg('text', attributes, item.text));
    }
    $('diagram').replaceChildren(drawing);
  }

  function paintStats(record) {
    const wallet = economy.snapshot();
    const used = wallet.daily.date === core.dayKey() ? wallet.daily.games[GAME] || 0 : 0;
    $('points').textContent = economy.balance(GAME);
    $('daily').textContent = `今日 ${used} / 50pt`;
    $('streak').textContent = record.streak;
    $('best').textContent = record.best;
    $('storage-status').textContent = progress.warning() ? 'この画面を開いている間だけ記録します。' : '';
    for (const item of $('tower').children) item.classList.toggle('earned', record.best >= Number(item.dataset.threshold));
  }

  function paintClock(state) {
    $('clock').textContent = state.phase === 'running'
      ? '残り ' + challenge.format(state.deadline - state.lastWall)
      : state.phase === 'training' ? '時間制限なし' : '120秒チャレンジ';
  }

  function paintGate(state) {
    const closed = ['waiting', 'ended'].includes(state.phase);
    $('challenge-gate').hidden = !closed;
    if (!closed) return;
    $('challenge-heading').textContent = state.phase === 'waiting' ? '四角形の覇王 達成！' : 'チャレンジ終了';
    $('challenge-message').textContent = state.phase === 'waiting'
      ? '25問連続からスタート。始めると時間が減るよ！'
      : `${state.endReason === 'timeout' ? '時間切れ！' : 'もう一度ちょうせんしよう！'} 今回の最高 ${state.attemptBest}問`;
    $('challenge-start').textContent = state.phase === 'waiting' ? '120秒チャレンジを始める' : 'もう一度120秒チャレンジ';
  }

  function syncInput() {
    $('digits').textContent = input || '—';
    $('confirm').disabled = phase !== 'ask' || !input;
    for (const key of keys) key.disabled = phase !== 'ask';
  }

  function hint(text, wrong = false) {
    $('hint').textContent = text;
    $('hint').toggleAttribute('data-wrong', wrong);
  }

  function next() {
    clearTimeout(timer);
    const record = progress.read();
    paintStats(record);
    paintClock(record.challenge);
    paintGate(record.challenge);
    phase = 'closed';
    input = '';
    if (['training', 'running'].includes(record.challenge.phase)) {
      try {
        question = deck.next(core);
        attempt = progress.begin(question);
        renderQuestion();
        phase = 'ask';
        hint('数字を入力して「決定！」を押そう。');
      } catch (error) {
        console.error(error);
        hint('問題を準備できませんでした。ページを読み直してください。', true);
      }
    }
    syncInput();
  }

  function enter(key) {
    if (phase !== 'ask') return;
    if (key === '⌫') input = input.slice(0, -1);
    else if ((input || key !== '0') && input.length < (question.kind === 'length' ? 2 : 3)) input += key;
    syncInput();
  }

  for (const key of [...'1234567890', '⌫']) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = key;
    button.dataset.digit = key;
    if (key === '⌫') button.setAttribute('aria-label', '1文字消す');
    button.onclick = () => enter(key);
    $('keys').append(button);
    keys.push(button);
  }

  for (const title of [...titles].reverse()) {
    const row = document.createElement('li');
    row.dataset.threshold = title.at;
    const image = document.createElement('img');
    image.src = '../' + title.image;
    image.alt = '';
    const label = document.createElement('span');
    label.textContent = title.name;
    const target = document.createElement('small');
    target.textContent = title.at + '問連続';
    label.append(target);
    row.append(image, label);
    $('tower').append(row);
  }

  $('confirm').onclick = async () => {
    if (phase !== 'ask' || !input) return;
    phase = 'checking';
    syncInput();
    try {
      const result = await progress.answer(attempt, Number(input));
      const record = progress.read();
      paintStats(record);
      if (!result.accepted) return next();
      if (result.correct) {
        phase = 'correct';
        if (result.title) window.ManabiCelebrations.showTitle(result.title);
        else window.ManabiCelebrations.showCorrect();
        timer = setTimeout(next, result.title ? 1000 : 500);
      } else if (record.challenge.phase === 'training') {
        phase = 'ask';
        input = '';
        attempt = progress.begin(question);
        hint('もう一度！ 同じ図形を見て考えよう。', true);
        syncInput();
      } else next();
    } catch {
      phase = 'ask';
      syncInput();
      hint('記録を保存できませんでした。もう一度押してください。', true);
    }
  };

  $('challenge-start').onclick = async () => {
    $('challenge-start').disabled = true;
    try {
      await progress.start();
      deck = createQuestionDeck();
      next();
    } finally {
      $('challenge-start').disabled = false;
    }
  };

  function tick() {
    const record = progress.read();
    paintClock(record.challenge);
    if (phase === 'ask' && record.challenge.phase === 'ended') next();
  }
  window.addEventListener('storage', () => { tick(); paintStats(progress.read()); });
  window.addEventListener('manabi-economy-change', () => paintStats(progress.read()));
  document.addEventListener('visibilitychange', tick);
  setInterval(tick, 200);
  next();
}
