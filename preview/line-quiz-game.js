import { openLineQuizRanking } from './line-quiz-online.js?v=23f24924246c';

const $ = id => document.getElementById(id);
const model = window.ManabiLineQuiz;
const game = model.game;
const core = window.ManabiEconomyCore;
const challenge = window.ManabiChallenge120Core;
const economy = window.ManabiEconomy;
const entry = window.ManabiProfileCatalog?.find(item => item.id === game);
const storage = window.manabiStorage;
const titleList = entry?.titles || [];
const progress = window.ManabiLineQuizProgress.createProgress({
  storage, economy, challenge, core, titles: titleList, game,
});
const labels = model.labels;
const env = window.MANABI_ENV;
const config = window.MANABI_BACKEND_CONFIG;
const preview = env?.preview === true && config?.mode === 'preview';
const production = env?.preview === false && config?.mode === 'production'
  && env.expectedProjectId === 'manabi-game-land' && config.expectedProjectId === env.expectedProjectId
  && config.staticLocalGameIds?.includes(game);
if (!preview && !production) {
  $('question').textContent = 'このゲームは現在非公開です。';
  throw Error('line-quiz-unavailable');
}
const ranking = preview ? openLineQuizRanking({ storage, titles: titleList }) : null;

let question, mode, attempt, level, transition;
let phase = 'closed';
let selected = new Set();
let publicAllowed = true;

function svg(tag, attributes) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

function syncSelection() {
  for (const choice of $('diagram').querySelectorAll('[data-line]')) {
    choice.setAttribute('aria-pressed', String(selected.has(Number(choice.dataset.line))));
  }
  $('selection-count').textContent = question ? `${selected.size} / ${question.count}本` : '';
  $('confirm').disabled = !publicAllowed || phase !== 'ask' || selected.size !== question?.count;
}

function renderDiagram() {
  const diagram = svg('svg', { viewBox: `0 0 ${model.WIDTH} ${model.HEIGHT}`, role: 'group', 'aria-label': '7本の直線' });
  for (const [i, { start, end }] of question.segments.entries()) {
    const reference = i === question.reference;
    const line = svg('g', reference
      ? { class: 'line-quiz-reference', role: 'img', 'aria-label': `基準線 ${labels[i]}` }
      : { class: 'parallel-choice', 'data-line': i, role: 'button', tabindex: 0, 'aria-label': `直線 ${labels[i]}` });
    const label = svg('text', { ...question.labelPoints[i], class: 'parallel-label' });
    label.textContent = labels[i];
    line.append(svg('line', { class: 'parallel-line', x1: start.x, y1: start.y, x2: end.x, y2: end.y }), label);
    diagram.append(line);
  }
  $('diagram').replaceChildren(diagram);
  syncSelection();
}

function paintStats(record) {
  const wallet = economy.snapshot();
  $('points').textContent = economy.balance(game);
  const used = wallet.daily.date === core.dayKey() ? wallet.daily.games[game] || 0 : 0;
  $('daily').textContent = `今日 ${used} / 50pt`;
  $('streak').textContent = record.streak;
  $('best').textContent = record.best;
  $('level').textContent = { beginner: '初級', intermediate: '中級', advanced: '上級' }[level || model.difficulty(record.best)];
  for (const row of $('tower').children) row.classList.toggle('earned', record.best >= Number(row.dataset.threshold));
  $('storage-status').textContent = progress.warning() ? 'この画面を開いている間だけ記録します。' : '';
}

function paintGate(record) {
  const state = record.challenge;
  $('challenge-clock').textContent = state.phase === 'running'
    ? '残り ' + challenge.format(state.deadline - state.lastWall)
    : state.phase === 'training' ? '時間制限なし' : '120秒チャレンジ';
  const closed = !publicAllowed || ['waiting', 'ended'].includes(state.phase);
  $('challenge-gate').hidden = !closed;
  $('challenge-start').hidden = !publicAllowed;
  if (!closed) return;
  $('challenge-heading').textContent = !publicAllowed ? '現在非公開です'
    : state.phase === 'waiting' ? '垂直・平行の覇王 達成！' : 'チャレンジ終了';
  $('challenge-message').textContent = !publicAllowed ? '公開されるまでお待ちください。'
    : state.phase === 'waiting' ? '開始ボタンを押すと、25問連続からスタートするよ！'
    : `${state.endReason === 'timeout' ? '時間切れ！' : 'もう一度ちょうせんしよう！'} 今回の最高 ${state.attemptBest}問`;
  $('challenge-start').textContent = state.phase === 'waiting' ? '120秒チャレンジを始める' : 'もう一度120秒チャレンジ';
}

function hint(text, wrong = false) {
  $('hint').textContent = text;
  $('hint').toggleAttribute('data-wrong', wrong);
}

function next() {
  clearTimeout(transition);
  const record = progress.read();
  paintGate(record);
  if (!publicAllowed || !['training', 'running'].includes(record.challenge.phase)) {
    phase = 'closed';
    syncSelection();
    paintStats(record);
    return;
  }
  level = model.difficulty(record.best);
  const [relation, count] = model.chooseMode(Math.random, mode);
  mode = { relation, count };
  try {
    question = model.buildQuestion({ id: crypto.randomUUID(), level, ...mode });
  } catch (error) {
    console.error(error);
    phase = 'closed';
    syncSelection();
    hint('問題を準備できませんでした。ページを読み直してください。', true);
    return;
  }
  const parallel = relation === 'parallel';
  $('mission').dataset.relation = relation;
  $('mission').textContent = parallel ? '∥ 平行を見つけよう！' : '∟ 垂直を見つけよう！';
  $('question').textContent = `${labels[question.reference]}の直線に${parallel ? '平行' : '垂直'}な直線を${count}本選ぼう！`;
  selected = new Set();
  attempt = progress.begin(question);
  phase = 'ask';
  hint('線をタップ。もう一度タップすると選び直せるよ。');
  renderDiagram();
  paintStats(record);
}

function toggle(index) {
  if (!publicAllowed || phase !== 'ask' || index < 0 || index === question.reference) return;
  if (selected.has(index)) selected.delete(index);
  else if (selected.size < question.count) selected.add(index);
  else {
    hint('選んだ線をもう一度タップして、選び直そう。');
    return;
  }
  hint(selected.size === question.count ? '選べたら「決定！」を押そう。' : '線をタップして選ぼう。');
  syncSelection();
}

$('diagram').addEventListener('click', event => {
  if (!publicAllowed || phase !== 'ask') return;
  const matrix = $('diagram').querySelector('svg')?.getScreenCTM();
  if (!matrix) return;
  const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  const scale = Math.hypot(matrix.a, matrix.b);
  const index = model.nearestLine(question.segments, p, 21 / scale, 5 / scale);
  if (index < 0) hint('線が交わる所をさけて、線の上をタップしよう。');
  else if (index === question.reference) hint('赤い基準線はそのまま。ほかの線を選ぼう。');
  else toggle(index);
});
$('diagram').addEventListener('keydown', event => {
  const choice = event.target.closest('[data-line]');
  if (choice && ['Enter', ' '].includes(event.key)) {
    event.preventDefault();
    toggle(Number(choice.dataset.line));
  }
});
$('confirm').onclick = async () => {
  if (!publicAllowed || phase !== 'ask' || selected.size !== question.count) return;
  phase = 'checking';
  syncSelection();
  let result;
  try { result = await progress.answer(attempt, [...selected]); }
  catch {
    phase = 'ask';
    syncSelection();
    hint('記録を保存できませんでした。もう一度押してください。', true);
    return;
  }
  const record = progress.read();
  paintStats(record);
  if (!result.accepted || !publicAllowed) return next();
  if (result.correct) {
    phase = 'correct';
    if (result.title) window.ManabiCelebrations.showTitle(result.title);
    else window.ManabiCelebrations.showCorrect();
    transition = setTimeout(next, result.title ? 1000 : 500);
    void ranking?.publish(record.best);
  } else if (record.challenge.phase === 'training') {
    selected.clear();
    attempt = progress.begin(question);
    phase = 'ask';
    hint('もう一度！ 線の向きをよく見て、同じ問題にちょうせんしよう。', true);
    syncSelection();
  } else next();
};

for (const title of [...titleList].reverse()) {
  const row = document.createElement('li');
  row.dataset.threshold = title.at;
  const image = document.createElement('img');
  image.src = '../' + title.image;
  image.alt = '';
  const text = document.createElement('span');
  text.textContent = title.name;
  const threshold = document.createElement('small');
  threshold.textContent = title.at + '問連続';
  text.append(threshold);
  row.append(image, text);
  $('tower').append(row);
}
$('challenge-start').onclick = async () => {
  if (!publicAllowed) return;
  $('challenge-start').disabled = true;
  try { await progress.start(); next(); }
  finally { $('challenge-start').disabled = false; }
};
$('ranking-open').onclick = async () => {
  $('line-ranking').hidden = false;
  $('ranking-rows').replaceChildren();
  if (!ranking) {
    $('ranking-message').textContent = `共有ランキングは準備中です。端末の最高記録は ${progress.read().best}問です。`;
    return;
  }
  $('ranking-message').textContent = '読み込み中…';
  try {
    const rows = await ranking.rows();
    let previous, rank;
    for (const [i, item] of rows.entries()) {
      if (item.bestStreak !== previous) rank = i + 1;
      previous = item.bestStreak;
      const row = $('ranking-rows').insertRow();
      for (const value of [rank + '位', item.nickname, item.bestStreak + '問連続']) {
        row.insertCell().textContent = value;
      }
    }
    $('ranking-message').textContent = rows.length ? '' : 'まだ記録がありません。';
  } catch {
    const best = progress.read().best;
    $('ranking-message').textContent = `共有ランキングに接続できません。端末の最高記録は ${best}問です。`;
  }
};
$('ranking-close').onclick = () => { $('line-ranking').hidden = true; };
function tick() {
  const record = progress.read();
  if (phase === 'ask' && !['training', 'running'].includes(record.challenge.phase)) next();
  if (!['correct', 'checking'].includes(phase)) paintGate(record);
}
window.addEventListener('storage', () => { tick(); paintStats(progress.read()); });
window.addEventListener('manabi-economy-change', () => paintStats(progress.read()));
window.addEventListener('online', () => { void ranking?.publish(progress.read().best); });
document.addEventListener('visibilitychange', tick);
setInterval(tick, 200);
ranking?.watchAvailability(published => {
  if (publicAllowed === published) return;
  publicAllowed = published;
  if (phase !== 'checking') next();
});
next();
void ranking?.publish(progress.read().best);
