// 3年生の分数の復習。画面・保存処理から独立した問題生成器。
export const GAME = 'fractionBasics';
export const TYPES = Object.freeze([
  'readTape', 'readPizza', 'reverseTape', 'reversePizza',
  'unit', 'one', 'compare', 'line', 'add', 'subtract',
]);
const integer = (random, min, max) => min + Math.floor(random() * (max - min + 1));
const choice = (random, values) => values[integer(random, 0, values.length - 1)];
const fraction = (top, bottom) => top + '/' + bottom;
function shuffle(random, items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = integer(random, 0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function fractionOptions(random, top, bottom) {
  const distractors = [];
  for (let offset = 1; distractors.length < 7; offset++) {
    for (const value of [top - offset, top + offset]) {
      if (value > 0 && !distractors.includes(value) && distractors.length < 7) distractors.push(value);
    }
  }
  return shuffle(random, [top, ...shuffle(random, distractors).slice(0, 3)].map(value => fraction(value, bottom)));
}
export function createQuestion(type, random = Math.random) {
  if (!TYPES.includes(type)) throw Error('unknown-fraction-type:' + type);
  let n, k, a, b, prompt, answer, options = [], visual = null, explanation, label;
  if (type === 'readTape' || type === 'readPizza' || type === 'reverseTape' || type === 'reversePizza') {
    const pizza = type.endsWith('Pizza');
    const reverse = type.startsWith('reverse');
    n = pizza ? choice(random, [3, 4, 5, 6, 8]) : integer(random, 3, 8);
    k = reverse && random() < .35 ? integer(random, n + 1, 2 * n - 1) : integer(random, 1, n - 1);
    label = (pizza ? 'ピザ' : 'テープ') + (reverse ? 'に色をつけよう' : 'と分数');
    prompt = reverse ? fraction(k, n) + ' を図に表そう！' : '色のついた部分は、全体の何分のいくつ？';
    answer = reverse ? String(k) : fraction(k, n);
    visual = { kind: pizza ? 'pizza' : 'tape', n, k, interactive: reverse, filled: reverse ? 0 : k };
    if (!reverse) options = fractionOptions(random, k, n);
    explanation = '1/' + n + ' が ' + k + 'こ分なので ' + fraction(k, n) + ' です。'
      + (k > n ? ' 1つ目を全部、2つ目を ' + (k - n) + 'こ分ぬります。' : '');
  } else if (type === 'unit') {
    n = integer(random, 3, 8); k = integer(random, 2, n + 2);
    label = 'いくつ分'; prompt = '1/' + n + ' が ' + k + 'こ分あると？';
    answer = fraction(k, n); options = fractionOptions(random, k, n);
    explanation = '1/' + n + ' が ' + k + 'こ分なので ' + answer + ' です。';
  } else if (type === 'one') {
    n = integer(random, 3, 7); k = random() < .5 ? n : integer(random, n + 1, 2 * n - 1);
    label = '1との関係';
    prompt = k === n ? '1と同じ大きさの分数は？' : '1より大きい分数はどれ？';
    answer = fraction(k, n);
    const others = shuffle(random, Array.from({length:n - 1}, (_, i) => i + 1));
    if (k > n) others.unshift(n);
    else if (n === 3 || random() < .5) others.unshift(integer(random, n + 1, 2 * n - 1));
    options = shuffle(random, [k, ...others.slice(0, 3)]).map(value => fraction(value, n));
    explanation = n + '/' + n + ' は1です。' + (k > n ? ' 分子が分母より大きいので、' + answer + ' は1より大きいです。' : '');
  } else if (type === 'compare') {
    n = integer(random, 5, 9);
    const numerators = shuffle(random, Array.from({ length: n }, (_, i) => i + 1)).slice(0, 4);
    const smallest = random() < .5;
    k = (smallest ? Math.min : Math.max)(...numerators);
    label = '分数の大きさ'; prompt = 'いちばん' + (smallest ? '小さい' : '大きい') + '分数はどれ？';
    answer = fraction(k, n); options = shuffle(random, numerators.map(value => fraction(value, n)));
    explanation = '分母が同じときは、分子が大きいほど大きくなります。';
  } else if (type === 'line') {
    n = integer(random, 3, 6); k = integer(random, 1, 2 * n - 1);
    label = '数直線'; prompt = '矢印がさす分数はどれ？';
    answer = fraction(k, n); options = fractionOptions(random, k, n);
    visual = { kind: 'line', n, k, interactive: false };
    explanation = '0から1までを ' + n + '等分しています。0から ' + k + '目の目もりは ' + answer + ' です。';
  } else if (type === 'add') {
    n = integer(random, 3, 9); a = integer(random, 1, n - 1); b = integer(random, 1, n - a); k = a + b;
    label = '分数のたし算'; prompt = fraction(a, n) + ' ＋ ' + fraction(b, n) + ' ＝ ？';
    answer = fraction(k, n); options = fractionOptions(random, k, n);
    explanation = '分母はそのまま、分子をたします。' + a + '＋' + b + '＝' + k + ' なので ' + answer + ' です。';
  } else {
    n = integer(random, 3, 9); a = integer(random, 2, n); b = integer(random, 1, a - 1); k = a - b;
    label = '分数のひき算'; prompt = fraction(a, n) + ' − ' + fraction(b, n) + ' ＝ ？';
    answer = fraction(k, n); options = fractionOptions(random, k, n);
    explanation = '分母はそのまま、分子をひきます。' + a + '−' + b + '＝' + k + ' なので ' + answer + ' です。';
  }
  const scorePrompt = {type, n, k, a, b, options};
  return { type, label, prompt, answer, options, visual, explanation, scorePrompt };
}
export function createDeck(random = Math.random) {
  let queue = [];
  return { next() { if (!queue.length) queue = shuffle(random, TYPES); return createQuestion(queue.pop(), random); } };
}
