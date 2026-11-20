import { createDeck } from './fraction-basics-model.js';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'mq_fractionBasics_preview_v1';
const TITLES = [3, 5, 10, 15, 25];
const deck = createDeck();
let question, phase = 'ask', mode = 'practice', number = 0, streak = 0, total = 0;
let best = 0, challengeBest = 0, deadline = 0, transition, clockTimer, sequence = 0;

if (window.MANABI_ENV?.environment !== 'preview') {
  $('question').textContent = 'このゲームは確認用サイトでのみ利用できます。';
  $('instruction').textContent = '本番サイトでは公開されていません。';
} else {
  try { best = Math.max(0, Number(JSON.parse(localStorage.getItem(STORAGE_KEY))?.best) || 0); }
  catch { /* プライベートモードでは記録を保存しない */ }
  $('restart').addEventListener('click', restart);
  $('challenge-start').addEventListener('click', startChallenge);
  $('gate').addEventListener('click', event => {
    if (event.target.id === 'practice-continue') { mode = 'practice'; next(); }
  });
  $('options').addEventListener('click', event => {
    const button = event.target.closest('button[data-value]');
    if (button) judge(button.dataset.value);
  });
  $('diagram').addEventListener('click', event => {
    const item = event.target.closest('[data-count]');
    if (item && question?.visual?.interactive) judge(item.dataset.count);
  });
  $('diagram').addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const item = event.target.closest('[data-count]');
    if (item && question?.visual?.interactive) { event.preventDefault(); judge(item.dataset.count); }
  });
  $('feedback').addEventListener('click', event => {
    if (event.target.id === 'understood') {
      if (mode === 'ended') showGate();
      else next();
    }
  });
  clockTimer = setInterval(tick, 200);
  next();
}

function fractionHTML(text) {
  return String(text).replace(/(\d+)\/(\d+)/g,
    (_, top, bottom) => '<span class="fraction"><span>' + top + '</span><span>' + bottom + '</span></span>');
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
  $('streak').textContent = streak;
  $('best').textContent = best;
  $('total').textContent = total;
  for (const item of $('titles').children) item.classList.toggle('earned', best >= Number(item.dataset.at));
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ best })); }
  catch { /* 保存不可の場合も練習を継続 */ }
}
function hideGate() {
  $('gate').hidden = true;
  for (const id of ['question', 'diagram', 'instruction', 'options']) $(id).hidden = false;
}
function next() {
  clearTimeout(transition);
  sequence++;
  if (mode === 'ended' || mode === 'waiting') return showGate();
  if (mode === 'challenge' && Date.now() >= deadline) return endChallenge('時間切れ');
  phase = 'ask';
  question = deck.next();
  number++;
  hideGate();
  $('category').textContent = question.label;
  $('question-number').textContent = '第' + number + '問';
  $('question').innerHTML = fractionHTML(question.prompt);
  $('diagram').innerHTML = visualHTML(question.visual);
  $('diagram').classList.toggle('empty', !question.visual);
  $('instruction').textContent = question.visual?.interactive
    ? '色をつける最後の部分をタッチしよう。左から・上から順番に色がつくよ。'
    : '答えを1つタッチしよう。';
  $('options').innerHTML = question.options.map(value =>
    '<button type="button" data-value="' + value + '">' + fractionHTML(value) + '</button>').join('');
  $('feedback').innerHTML = '';
  $('feedback').className = 'feedback';
  paintStats();
}
function judge(value) {
  if (phase !== 'ask') return;
  if (mode === 'challenge' && Date.now() >= deadline) return endChallenge('時間切れ');
  phase = 'feedback';
  const correct = value === question.answer;
  const buttons = $('options').querySelectorAll('button');
  for (const button of buttons) {
    button.disabled = true;
    if (button.dataset.value === question.answer) button.classList.add('correct');
    else if (button.dataset.value === value) button.classList.add('wrong');
  }
  if (question.visual?.interactive) {
    const filled = correct ? Number(value) : question.visual.k;
    $('diagram').innerHTML = visualHTML({ ...question.visual, interactive: false, filled });
  }
  if (correct) {
    streak++; total++; best = Math.max(best, streak);
    if (mode === 'challenge') challengeBest = Math.max(challengeBest, streak);
    paintStats();
    $('feedback').innerHTML = '<strong>正解！</strong>　次の問題に進みます。';
    transition = setTimeout(() => {
      if (mode === 'practice' && streak >= 25) { mode = 'waiting'; showGate(); }
      else next();
    }, 500);
  } else {
    streak = 0;
    if (mode === 'challenge') mode = 'ended';
    paintStats();
    $('feedback').classList.add('wrong');
    $('feedback').innerHTML = '<strong>まちがいを確認しよう</strong><div>正しい答え：'
      + fractionHTML(question.visual?.interactive ? question.visual.k + '/' + question.visual.n : question.answer)
      + '</div><div>' + fractionHTML(question.explanation) + '</div>'
      + '<button type="button" id="understood">わかった！　次の問題へ</button>';
  }
}
function showGate() {
  clearTimeout(transition);
  phase = 'gate';
  for (const id of ['question', 'diagram', 'instruction', 'options']) $(id).hidden = true;
  $('feedback').innerHTML = '';
  $('gate').hidden = false;
  $('gate-title').textContent = mode === 'waiting' ? '25問連続正解！' : '120秒チャレンジ終了';
  $('gate-message').textContent = mode === 'waiting'
    ? '最高称号を達成しました。120秒チャレンジに挑戦できます。'
    : '今回の最高記録は ' + challengeBest + '問です。';
  $('challenge-start').textContent = mode === 'waiting' ? '120秒チャレンジを始める' : 'もう一度120秒チャレンジ';
  if (!$('practice-continue')) {
    const button = document.createElement('button');
    button.id = 'practice-continue';
    button.type = 'button';
    button.textContent = '時間制限なしの練習にもどる';
    button.className = 'secondary';
    $('gate').append(button);
  }
}
function startChallenge() {
  if (mode !== 'waiting' && mode !== 'ended') return;
  mode = 'challenge'; streak = 25; challengeBest = 25;
  deadline = Date.now() + 120000;
  paintStats();
  next();
}
function endChallenge(reason) {
  if (mode !== 'challenge') return;
  mode = 'ended';
  $('clock').textContent = reason;
  showGate();
}
function tick() {
  if (mode === 'challenge') {
    const remaining = Math.max(0, deadline - Date.now());
    $('clock').textContent = '残り ' + Math.floor(Math.ceil(remaining / 1000) / 60) + ':'
      + String(Math.ceil(remaining / 1000) % 60).padStart(2, '0');
    if (remaining <= 0) endChallenge('時間切れ');
  } else $('clock').textContent = mode === 'practice' ? '時間制限なし' : '120秒チャレンジ';
}
function restart() {
  clearTimeout(transition);
  mode = 'practice'; phase = 'ask'; number = 0; streak = 0; total = 0;
  tick();
  next();
}
