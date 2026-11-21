export const GAME = 'fractionTransform';
export const TYPES = Object.freeze(['improperToMixed', 'mixedToImproper', 'improperToInteger']);

function shuffle(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function createQuestion(type, random = Math.random) {
  const n = 2 + Math.floor(random() * 9);
  const whole = 2 + Math.floor(random() * 8);
  const remainder = type === 'improperToInteger' ? 0 : 1 + Math.floor(random() * (n - 1));
  const k = whole * n + remainder;
  const frac = value => value + '/' + n;
  const mixed = (integer, top) => integer + 'と' + frac(top);
  const calculation = k + ' ÷ ' + n + ' = ' + whole;
  let label, prompt, answer, distractors, explanation;
  switch (type) {
    case 'improperToMixed':
      label = '仮分数 → 帯分数';
      prompt = frac(k) + ' を帯分数に直そう。';
      answer = mixed(whole, remainder);
      distractors = [mixed(whole + 1, remainder), mixed(whole - 1, remainder),
        mixed(whole, remainder % (n - 1) + 1), mixed(whole + 2, remainder)];
      explanation = calculation + ' あまり ' + remainder + '。商が整数部分、あまりが分子になるよ。';
      break;
    case 'mixedToImproper':
      label = '帯分数 → 仮分数';
      prompt = mixed(whole, remainder) + ' を仮分数に直そう。';
      answer = frac(k);
      distractors = [frac(whole + remainder), frac(whole * n), frac(k + n), frac(whole * remainder + n)];
      explanation = whole + ' × ' + n + ' ＋ ' + remainder + ' = ' + k + '。分母はそのままだよ。';
      break;
    case 'improperToInteger':
      label = '仮分数 → 整数';
      prompt = frac(k) + ' を整数に直そう。';
      answer = String(whole);
      distractors = [String(whole - 1), String(whole + 1), String(k - n), String(whole + 2)];
      explanation = calculation + '。あまりがないので、商が答えになるよ。';
      break;
    default:
      throw new RangeError('unknown fraction conversion');
  }
  const wrong = [...new Set(distractors)].filter(value => value !== answer).slice(0, 3);
  return {type, label, prompt, answer, explanation,
    options: shuffle([answer, ...wrong], random), scorePrompt: {type, n, k}};
}

export function createDeck(random = Math.random) {
  let order = [], previous;
  return {
    next() {
      if (!order.length) {
        order = shuffle(TYPES, random);
        if (order[0] === previous) [order[0], order[1]] = [order[1], order[0]];
      }
      previous = order.shift();
      return createQuestion(previous, random);
    },
  };
}
