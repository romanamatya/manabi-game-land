import { gameProgress } from './title-progress-model.js?v=63ff8c4f8736';

export function startFractionGame(GAME, createDeck, { celebrate = false, responseInput, requirePublished = false } = {}) {
const $ = id => document.getElementById(id);
const storage = window.manabiStorage;
const economy = window.ManabiEconomy;
const challenge = window.ManabiChallenge120Core;
const config = window.MANABI_BACKEND_CONFIG;
const game = window.ManabiProfileCatalog?.find(game => game.id === GAME);
const recordKey = 'mgl_' + GAME;
const challengeKey = 'mgl_challenge120_v1:' + GAME;
const threshold = challenge?.highest[GAME];
const deck = createDeck();
let question, scoreContext, practiceStreak = 0, number = 0, transition;
let phase = 'idle', state, playingChallenge = false, allowed = false;
let anchorWall = Date.now(), anchorMono = performance.now();

function read(key, fallback) {
  try { return JSON.parse(storage.getItem(key) || 'null') ?? fallback; }
  catch { return fallback; }
}

function resume() {
  state = read(challengeKey, null);
  if (state?.protocol !== challenge.PROTOCOL || state.game !== GAME) state = challenge.fresh(GAME);
  state = challenge.unlock(state, gameProgress(game, storage).best >= threshold);
  if (state.phase === 'running') {
    playingChallenge = true;
    anchorWall = Math.max(Date.now(), state.lastWall);
    anchorMono = performance.now();
    settle();
    if (state.phase === 'ended') return showGate();
    next();
  } else if (state.unlocked) showGate();
  else next();
}

function initialize() {
  const environment = window.MANABI_ENV?.environment;
  const expectedProject = {preview:'manabi-game-landcheck', production:'manabi-game-land'}[environment];
  if (!expectedProject || config?.expectedProjectId !== expectedProject || !config.staticLocalGameIds?.includes(GAME)
      || (environment === 'production' && config.productionReleaseApproved !== true)
      || !game || !storage || !economy || !challenge) return;
  for (const title of [...game.titles].reverse()) {
    const item = document.createElement('li');
    item.dataset.at = title.at;
    const labels = document.createElement('div');
    const name = document.createElement('span');
    name.textContent = title.name;
    const count = document.createElement('small');
    count.textContent = title.at + '問連続';
    labels.append(name, count);
    if (title.image) {
      const image = document.createElement('img');
      image.src = '../' + title.image;
      image.alt = '';
      item.append(image);
    }
    item.append(labels);
    $('titles').append(item);
  }
  $('restart').addEventListener('click', restart);
  $('challenge-start').addEventListener('click', startChallenge);
  $('practice-continue').addEventListener('click', restart);
  responseInput?.bind(judge);
  $('options').addEventListener('click', event => {
    const button = event.target.closest('button[data-value]');
    if (button) judge(button.dataset.value);
  });
  $('diagram').addEventListener('click', event => {
    const item = event.target.closest('[data-count]');
    if (item) judge(item.dataset.count);
  });
  $('diagram').addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const item = event.target.closest('[data-count]');
    if (item) { event.preventDefault(); judge(item.dataset.count); }
  });
  $('feedback').addEventListener('click', event => {
    if (event.target.id !== 'understood' || phase !== 'feedback') return;
    if (playingChallenge && state.phase === 'ended') showGate();
    else next();
  });
  const productionTransform = GAME === 'fractionTransform' && environment === 'production';
  if (requirePublished || productionTransform || config.visibilityGameIds?.includes(GAME) || config.managedVisibilityGameIds?.includes(GAME)) {
    const message = status => {
      const canPlay = status === 'published';
      $('access').hidden = canPlay;
      $('question').hidden = !canPlay;
      $('access').textContent = status === 'hidden' ? 'このゲームは現在非公開です。'
        : status === 'preparing' ? 'このゲームは公開準備中です。'
          : '公開状態を確認できません。算数の一覧へ戻ってください。';
      if (canPlay && !allowed) { allowed = true; resume(); }
      else if (!canPlay) {
        allowed = false;
        phase = 'idle';
        clearTimeout(transition);
        for (const id of ['diagram', 'instruction', 'options', 'gate', 'feedback']) $(id).hidden = true;
      }
    };
    const responsiveTimeout = setTimeout(() => message('unknown'), 10000);
    const unavailable = () => { clearTimeout(responsiveTimeout); message('unknown'); };
    if (!window.ManabiPublicSettings) unavailable();
    else window.ManabiPublicSettings.subscribeGame(GAME, snapshot => {
      if (snapshot.metadata?.fromCache) {
        if ((requirePublished || productionTransform) && allowed) message('unknown');
        return;
      }
      clearTimeout(responsiveTimeout);
      message(snapshot.exists() ? snapshot.data().status : 'preparing');
    }, unavailable).catch(unavailable);
  } else { allowed = true; resume(); }
  setInterval(tick, 200);
}

function fractionHTML(text) {
  const stack = (top, bottom) => '<span class="fraction"><span>' + top + '</span><span>' + bottom + '</span></span>';
  return String(text).replace(/(?:(\d+)と)?(\d+)\/(\d+)/g, (_, whole, top, bottom) =>
    whole ? '<span class="mixed-number" role="math" aria-label="' + whole + 'と' + bottom + '分の' + top +
      '"><span aria-hidden="true">' + whole + '</span>' + stack(top, bottom) + '</span>' : stack(top, bottom));
}
function tapeSVG({ n, k, interactive, filled }) {
  const units = k > n ? 2 : 1;
  const ys = units === 1 ? [60] : [17, 103];
  const width = 460 / n;
  let svg = '<svg viewBox="0 0 520 170" role="' + (interactive ? 'group' : 'img') + '" aria-label="テープを' + n + '等分した図">';
  for (let u = 0; u < units; u++) {
    svg += '<text x="18" y="' + (ys[u] + 31) + '" fill="#604632" font-size="15" text-anchor="middle">' + (u + 1) + '</text>';
    for (let i = 0; i < n; i++) {
      const count = u * n + i + 1;
      svg += '<rect x="' + (36 + i * width) + '" y="' + ys[u] + '" width="' + width + '" height="54"'
        + ' fill="' + (count <= filled ? '#f3ae55' : '#fffefa') + '" stroke="#7c5638" stroke-width="2"'
        + (interactive ? ' data-count="' + count + '" class="tap" tabindex="0" role="button" aria-label="' + count + 'こ分まで色をつける"' : '')
        + '/>';
    }
  }
  return svg + '</svg>';
}
function pizzaSVG({ n, k, interactive, filled }) {
  const units = k > n ? 2 : 1, centers = units === 1 ? [260] : [143, 377], radius = units === 1 ? 78 : 74;
  let svg = '<svg viewBox="0 0 520 170" role="' + (interactive ? 'group' : 'img') + '" aria-label="ピザを' + n + '等分した図">';
  for (let u = 0; u < units; u++) {
    const cx = centers[u], cy = 84;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + i * 2 * Math.PI / n;
      const b = -Math.PI / 2 + (i + 1) * 2 * Math.PI / n;
      const x1 = cx + radius * Math.cos(a), y1 = cy + radius * Math.sin(a);
      const x2 = cx + radius * Math.cos(b), y2 = cy + radius * Math.sin(b);
      const count = u * n + i + 1;
      svg += '<path d="M ' + cx + ' ' + cy + ' L ' + x1 + ' ' + y1 + ' A ' + radius + ' ' + radius
        + ' 0 0 1 ' + x2 + ' ' + y2 + ' Z" fill="' + (count <= filled ? '#f3ae55' : '#fffefa')
        + '" stroke="#795538" stroke-width="2.5"'
        + (interactive ? ' data-count="' + count + '" class="tap" tabindex="0" role="button" aria-label="' + count + '切れ分まで色をつける"' : '')
        + '/>';
    }
    if (units === 2) svg += '<text x="' + cx + '" y="168" text-anchor="middle" font-size="13" fill="#604632">' + (u + 1) + 'こ目</text>';
  }
  return svg + '</svg>';
}
function lineSVG({ n, k }) {
  let svg = '<svg viewBox="0 0 520 160" role="img" aria-label="0から2までの数直線。矢印の場所を答える">'
    + '<line x1="40" y1="92" x2="480" y2="92" stroke="#71503a" stroke-width="3"/>';
  for (let i = 0; i <= 2 * n; i++) {
    const x = 40 + 440 * i / (2 * n);
    svg += '<line x1="' + x + '" y1="84" x2="' + x + '" y2="101" stroke="#71503a" stroke-width="2"/>';
    if (i % n === 0) svg += '<text x="' + x + '" y="130" text-anchor="middle" fill="#604632" font-size="20">' + (i / n) + '</text>';
  }
  const x = 40 + 440 * k / (2 * n);
  return svg + '<path d="M ' + x + ' 29 V 73" stroke="#d96b3a" stroke-width="5"/>'
    + '<path d="M ' + (x - 9) + ' 64 L ' + x + ' 80 L ' + (x + 9) + ' 64 Z" fill="#d96b3a"/>'
    + '<text x="' + x + '" y="21" text-anchor="middle" font-size="15" fill="#b45125">ここ</text></svg>';
}
function visualHTML(visual) {
  if (!visual) return '';
  if (visual.kind === 'tape') return tapeSVG(visual);
  if (visual.kind === 'pizza') return pizzaSVG(visual);
  return lineSVG(visual);
}
function paintStats() {
  const progress = gameProgress(game, storage);
  $('streak').textContent = playingChallenge ? state.streak : practiceStreak;
  $('best').textContent = progress.best;
  for (const item of $('titles').children) {
    const earned = progress.titles.some(title => title.at === Number(item.dataset.at) && title.earned);
    item.classList.toggle('earned', earned);
    const label = item.querySelector('small');
    label.textContent = item.dataset.at + '問連続 · ' + (earned ? '獲得済み' : '未獲得');
  }
}
function saveRecord(streak) {
  const previous = read(recordKey, {});
  const best = Math.max(Number(previous.best) || 0, streak);
  const titles = game.titles.filter(title => best >= title.at).map(title => title.id);
  storage.setItem(recordKey, JSON.stringify({ ...previous, best, streak, titles }));
  window.dispatchEvent(new Event('manabi-local-record-change'));
}
function saveChallenge() {
  storage.setItem(challengeKey, JSON.stringify(state));
}
function settle() {
  if (state.phase !== 'running') return;
  const { now, rollback } = challenge.clock(state, Date.now(), performance.now() - anchorMono, anchorWall);
  state = challenge.settle(state, now, rollback);
  saveChallenge();
}
function next() {
  clearTimeout(transition);
  if (!allowed) return;
  if (playingChallenge) {
    settle();
    if (state.phase !== 'running') return showGate();
  }
  phase = 'ask';
  question = deck.next();
  scoreContext = economy.begin(GAME, question.scorePrompt);
  number++;
  $('gate').hidden = true;
  for (const id of ['question', 'diagram', 'instruction', 'options', 'feedback']) $(id).hidden = false;
  $('category').textContent = question.label;
  $('question-number').textContent = '第' + number + '問';
  $('question').innerHTML = fractionHTML(question.prompt);
  $('diagram').innerHTML = visualHTML(question.visual);
  $('diagram').classList.toggle('empty', !question.visual);
  if (responseInput) {
    $('instruction').textContent = responseInput.show(question);
  } else {
    $('instruction').textContent = question.visual?.interactive
      ? '色をつける最後の部分をタッチしよう。' + (question.visual.kind === 'pizza' ? '上から時計回りに色がつくよ。' : '左から順に色がつくよ。')
      : '答えを1つタッチしよう。';
    $('options').innerHTML = question.options.map(value =>
      '<button type="button" data-value="' + value + '">' + fractionHTML(value) + '</button>').join('');
  }
  $('feedback').innerHTML = '';
  $('feedback').className = 'feedback';
  paintStats();
  renderClock();
}
function judge(value) {
  if (phase !== 'ask' || !allowed) return;
  phase = 'feedback';
  const correct = value === question.answer;
  const previousBest = celebrate ? gameProgress(game, storage).best : 0;
  if (playingChallenge) {
    settle();
    const result = challenge.answer(state, challenge.issue(state, scoreContext.id), correct, state.lastWall);
    if (!result.accepted) return showGate();
    state = result.state;
    saveChallenge();
    saveRecord(state.streak);
  } else {
    practiceStreak = correct ? practiceStreak + 1 : 0;
    saveRecord(practiceStreak);
    if (practiceStreak >= threshold) {
      state = challenge.unlock(state, true);
      saveChallenge();
    }
  }
  if (responseInput) {
    $('options').hidden = true;
    $('instruction').hidden = true;
    responseInput.record(question, correct);
  }
  if (correct) {
    if (celebrate) scoreContext.__mglCelebrationHandled = true;
    void economy.answer(scoreContext, value).catch(() => {});
  }
  for (const button of $('options').querySelectorAll('button')) {
    button.disabled = true;
    if (button.dataset.value === question.answer) button.classList.add('correct');
    else if (button.dataset.value === value) button.classList.add('wrong');
  }
  if (question.visual?.interactive) {
    $('diagram').innerHTML = visualHTML({ ...question.visual, interactive: false, filled: question.visual.k });
  }
  paintStats();
  if (correct) {
    $('feedback').innerHTML = '<strong>正解！</strong>';
    const duration = celebrate
      ? window.ManabiCelebrations?.play(GAME, previousBest, gameProgress(game, storage).best)
      : undefined;
    transition = setTimeout(() => {
      if (!playingChallenge && practiceStreak === threshold) showGate();
      else next();
    }, duration ?? 500);
  } else {
    $('feedback').classList.add('wrong');
    $('feedback').innerHTML = '<strong>まちがいを確認しよう</strong><div>正しい答え：'
      + fractionHTML(question.visual?.interactive ? question.visual.k + '/' + question.visual.n : question.answer)
      + '</div><div>' + fractionHTML(question.explanation) + '</div>'
      + '<button type="button" id="understood">わかった！</button>';
  }
}
function showGate() {
  clearTimeout(transition);
  phase = 'gate';
  for (const id of ['question', 'diagram', 'instruction', 'options']) $(id).hidden = true;
  $('feedback').innerHTML = '';
  $('gate').hidden = false;
  const ended = state.phase === 'ended';
  $('gate-title').textContent = ended ? '120秒チャレンジ終了' : '最高称号達成！';
  $('gate-message').textContent = ended
    ? (state.endReason === 'timeout' ? '時間切れ。' : '') + '今回の最高は ' + state.attemptBest + '問連続です。'
    : '120秒チャレンジに挑戦できます。';
  $('challenge-start').textContent = ended ? 'もう一度120秒チャレンジ' : '120秒チャレンジを始める';
  renderClock();
  paintStats();
}
function startChallenge() {
  if (!allowed || phase !== 'gate' || !['waiting', 'ended'].includes(state.phase)) return;
  anchorWall = Date.now();
  anchorMono = performance.now();
  state = challenge.start(state, anchorWall, crypto.randomUUID(), 'local');
  saveChallenge();
  playingChallenge = true;
  number = 0;
  next();
}
function renderClock() {
  $('clock').textContent = playingChallenge && state.phase === 'running'
    ? '残り ' + challenge.format(state.deadline - state.lastWall)
    : phase === 'gate' ? '120秒チャレンジ' : '時間制限なし';
  $('restart').hidden = playingChallenge || phase === 'gate';
}
function tick() {
  if (!allowed || !playingChallenge || state.phase !== 'running') return;
  settle();
  if (state.phase === 'ended') showGate();
  else renderClock();
}
function restart() {
  if (!allowed || state.phase === 'running') return;
  playingChallenge = false;
  number = 0;
  practiceStreak = 0;
  next();
}
initialize();
}
