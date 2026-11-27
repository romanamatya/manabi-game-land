import { GAME, answerFields, checkInput, createDeck } from './fraction-transform-input-model.js?v=417321ae8777';
import { startFractionGame } from './fraction-round.js?v=417321ae8777';

const labels = { whole: '整数部分', top: '分子', bottom: '分母' };
const directions = { fromImproper: '仮分数から', toImproper: '帯分数から' };
const analysisKey = 'mgl_learning_analysis:' + GAME;
const controls = document.getElementById('options');
const report = document.getElementById('input-analysis');
const storage = window.manabiStorage;
let question, selected, values;

function readAnalysis() {
  try { return JSON.parse(storage.getItem(analysisKey) || '{}') || {}; }
  catch { return {}; }
}

function paintAnalysis(results) {
  for (const [direction, label] of Object.entries(directions)) {
    const row = results[direction];
    report.querySelector('[data-analysis="' + direction + '"]').textContent =
      label + '　' + (row?.total ? row.correct + ' / ' + row.total + '問正解' : '記録なし');
  }
}

function record(current, correct) {
  const results = readAnalysis();
  const row = results[current.direction] ||= { total: 0, correct: 0 };
  row.total++;
  if (correct) row.correct++;
  try { storage.setItem(analysisKey, JSON.stringify(results)); } catch {}
  paintAnalysis(results);
}

function paint() {
  for (const field of controls.querySelectorAll('[data-field]')) {
    const key = field.dataset.field, value = values[key] || '□';
    field.querySelector('strong').textContent = value;
    field.setAttribute('aria-label', labels[key] + ' ' + (values[key] || '空欄'));
    field.setAttribute('aria-pressed', String(selected === key));
  }
  controls.querySelector('[data-input-message]').textContent = '';
}

function show(current) {
  question = current;
  values = {};
  const fields = answerFields(current.direction);
  selected = fields[0];
  const field = key => '<button type="button" data-field="' + key + '"><span>' + labels[key]
    + '</span><strong></strong></button>';
  const fraction = '<span class="answer-fraction">' + field('top') + field('bottom') + '</span>';
  controls.innerHTML = '<div class="answer-fields" role="group" aria-label="答えの入力欄">'
    + (fields.includes('whole') ? field('whole') : '') + fraction + '</div>'
    + '<p class="input-message" data-input-message aria-live="polite"></p>'
    + '<div class="input-keypad" role="group" aria-label="数字ボタン">'
    + '1234567890'.split('').map(digit => '<button type="button" data-key="' + digit + '">' + digit + '</button>').join('')
    + '<button type="button" data-key="delete" aria-label="1文字削除">⌫</button>'
    + '<button type="button" data-key="clear">全消去</button>'
    + '<button type="button" data-key="submit" class="submit-answer">これで決定！</button></div>';
  paint();
  return fields.includes('whole') ? '整数で答えるときは、分子と分母を空けよう。' : '分子と分母を入力しよう。';
}

function bind(submit) {
  controls.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    const { field, key } = button.dataset;
    if (field) selected = field;
    else if (key === 'clear') {
      values = {};
      selected = answerFields(question.direction)[0];
    } else if (key === 'delete') values[selected] = (values[selected] || '').slice(0, -1);
    else if (key === 'submit') {
      const result = checkInput(question.direction, values);
      if (result.incomplete) {
        controls.querySelector('[data-input-message]').textContent = result.message;
        return;
      }
      submit(result.value);
      return;
    } else if ((values[selected] || '').length < (selected === 'top' ? 2 : 1)) {
      values[selected] = (values[selected] || '') + key;
    }
    paint();
  });
  paintAnalysis(readAnalysis());
}

startFractionGame(GAME, createDeck, { celebrate: true, requirePublished: true, responseInput: { bind, show, record } });
