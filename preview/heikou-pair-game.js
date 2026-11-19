import { GAME, WIDTH, HEIGHT, LABELS, createDeck, hitCandidate } from './heikou-pair-model.js?v=363933f0bb01';

const $ = id => document.getElementById(id);
const environment = window.MANABI_ENV;
const config = window.MANABI_BACKEND_CONFIG;
if (environment && config?.mode === environment.environment && config.staticLocalGameIds?.includes(GAME)) {
  play();
} else {
  $('hint').textContent = 'このゲームは現在公開されていません。';
}

function play() {
  const { manabiStorage: storage, ManabiEconomy: economy, ManabiEconomyCore: core,
    ManabiChallenge120Core: challenge, ManabiCelebrations: celebrations } = window;
  const { titles } = window.ManabiProfileCatalog.find(game => game.id === GAME);
  const progress = window.ManabiLineQuizProgress.createProgress({
    storage, economy, core, challenge, titles, game: GAME, season: 'heikou-pair-v1',
  });
  const deck = createDeck(core.heikouPair);
  const diagram = $('diagram');
  let question, attempt, selection = [], phase = 'closed';

  function svg(tag, attributes, text) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    if (text) node.textContent = text;
    return node;
  }

  function line([a, b], className) {
    return svg('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: className });
  }

  function label([x, y], text, className) {
    return svg('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: className }, text);
  }

  function render() {
    const drawing = svg('svg', { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, 'aria-label': '横切る直線と、AからDの直線' });
    drawing.append(line(question.crossing, 'hp-crossing'));
    for (const [i, candidate] of question.candidates.entries()) {
      const { angle } = candidate;
      const group = svg('g', { role: 'button', tabindex: 0, 'data-line': i, 'aria-pressed': 'false',
        'aria-label': `直線${LABELS[i]}、角度${angle.value}度` });
      group.append(line(candidate.segment, 'hp-line'), label(candidate.label, LABELS[i], 'hp-letter'));
      group.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggle(i);
      });
      drawing.append(group);
      drawing.append(svg('path', {
        d: `M ${angle.from.join(' ')} A ${angle.radius} ${angle.radius} 0 0 ${angle.sweep} ${angle.to.join(' ')}`,
        'aria-hidden': true,
      }), label(angle.label, angle.value + '°', 'hp-angle'));
    }
    drawing.addEventListener('click', event => {
      const matrix = drawing.getScreenCTM();
      if (!matrix) return;
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      const index = hitCandidate(question, [point.x, point.y]);
      if (index >= 0) toggle(index);
    });
    diagram.replaceChildren(drawing);
  }

  function hint(message, wrong = false) {
    $('hint').textContent = message;
    $('hint').toggleAttribute('data-wrong', wrong);
  }

  function paintSelection() {
    for (const group of diagram.querySelectorAll('[data-line]')) {
      group.setAttribute('aria-pressed', selection.includes(Number(group.dataset.line)));
      group.setAttribute('aria-disabled', phase !== 'ask');
    }
    $('confirm').disabled = phase !== 'ask' || selection.length !== 2;
  }

  function toggle(index) {
    if (phase !== 'ask') return;
    if (selection.includes(index)) selection = selection.filter(value => value !== index);
    else if (selection.length < 2) selection.push(index);
    hint(selection.length === 2 ? '2本選んだよ。「決定！」を押そう。' : '青い直線を2本タップしよう。');
    paintSelection();
  }

  function paintRecord(record) {
    const wallet = economy.snapshot();
    const used = wallet.daily.date === core.dayKey() ? wallet.daily.games[GAME] || 0 : 0;
    const state = record.challenge;
    const threshold = challenge.highest[GAME];
    const timedBest = Math.max(0, state.attemptBest, ...Object.values(state.bests));
    $('daily').textContent = `今日 ${used} / 50pt`;
    $('points').textContent = economy.balance(GAME);
    $('streak').textContent = record.streak;
    $('practice-best').textContent = Math.min(threshold, record.best);
    $('challenge-best').textContent = timedBest > threshold ? timedBest : '—';
    $('storage-status').textContent = progress.warning() ? '記録を端末に保存できませんでした。' : '';
    for (const item of $('tower').children) item.classList.toggle('earned', record.best >= Number(item.dataset.threshold));
    paintClock(state);
  }

  function paintClock(state) {
    $('clock').textContent = state.phase === 'running' ? '残り ' + challenge.format(state.deadline - state.lastWall)
      : state.phase === 'training' ? '時間制限なし' : '120秒チャレンジ';
  }

  function next() {
    const record = progress.read();
    const state = record.challenge;
    paintRecord(record);
    phase = 'closed';
    selection = [];
    const timed = state.phase === 'running';
    const gate = ['waiting', 'ended'].includes(state.phase);
    $('challenge-gate').hidden = !gate;
    diagram.inert = gate;
    if (gate) {
      $('challenge-heading').textContent = state.phase === 'waiting' ? '平行ペアの覇王 達成！' : 'チャレンジ終了';
      $('challenge-message').textContent = state.phase === 'waiting' ? '25問連続からスタート。ボタンを押すと時間がへるよ！'
        : (state.endReason === 'timeout' ? '時間切れ！' : 'もう一度ちょうせんしよう！') + ` 今回の最高 ${state.attemptBest}問`;
      $('challenge-start').textContent = state.phase === 'waiting' ? '120秒チャレンジを始める' : 'もう一度120秒チャレンジ';
    } else {
      try {
        question = deck.next(timed ? state.sequence : state.practiceStreak, timed);
        attempt = progress.begin(question.prompt);
        $('level').textContent = { easy: '初級', medium: '中級', hard: '上級' }[question.level];
        render();
        phase = 'ask';
        hint('青い直線を2本タップしよう。');
      } catch (error) {
        console.error(error);
        diagram.replaceChildren();
        hint('問題を用意できませんでした。ページを読み直してください。', true);
      }
    }
    paintSelection();
  }

  for (const title of [...titles].reverse()) {
    const item = document.createElement('li');
    item.dataset.threshold = title.at;
    const name = document.createElement('span');
    name.textContent = title.name;
    const requirement = document.createElement('small');
    requirement.textContent = title.at + '問連続';
    const image = document.createElement('img');
    image.src = '../' + title.image;
    image.alt = '';
    item.append(name, image, requirement);
    $('tower').append(item);
  }

  const person = window.ManabiProfile.appearance(storage);
  const nickname = document.createElement('span');
  nickname.textContent = storage.getItem('mgl_nickname') || 'プレイヤー';
  $('player').append(window.ManabiIdentity.avatar(person.icon, person.frame, 30), nickname);

  $('confirm').onclick = async () => {
    if (phase !== 'ask' || selection.length !== 2) return;
    phase = 'checking';
    paintSelection();
    try {
      const result = await progress.answer(attempt, selection);
      const record = progress.read();
      paintRecord(record);
      if (!result.accepted) return next();
      if (result.correct) {
        phase = 'correct';
        if (result.title) celebrations.showTitle(result.title);
        else celebrations.showCorrect();
        setTimeout(next, result.title ? 1000 : 500);
      } else if (record.challenge.phase === 'training') {
        selection = [];
        attempt = progress.begin(question.prompt);
        phase = 'ask';
        hint('もう一度！ 同じ図で選び直そう。', true);
        paintSelection();
      } else next();
    } catch {
      phase = 'ask';
      paintSelection();
      hint('記録を保存できませんでした。もう一度押してください。', true);
    }
  };

  $('challenge-start').onclick = async () => {
    $('challenge-start').disabled = true;
    try {
      await progress.start();
      next();
    } finally {
      $('challenge-start').disabled = false;
    }
  };

  function tick() {
    const { challenge: state } = progress.read();
    paintClock(state);
    if (phase === 'ask' && state.phase === 'ended') next();
  }
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('storage', () => { tick(); paintRecord(progress.read()); });
  window.addEventListener('manabi-economy-change', () => paintRecord(progress.read()));
  setInterval(tick, 200);
  next();
}
