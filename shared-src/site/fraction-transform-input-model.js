export const GAME = 'fractionTransformInput';
const forward = 'fromImproper';
const reverse = 'toImproper';
const fields = Object.freeze(['whole', 'top', 'bottom']);

export function answerFields(direction) {
  return direction === forward ? fields : fields.slice(1);
}

export function checkInput(direction, input) {
  const values = answerFields(direction).map(field => input[field] ?? '');
  const [whole, top, bottom] = direction === forward ? values : ['', ...values];
  if ((!whole && direction === forward) || Boolean(top) !== Boolean(bottom) || (direction === reverse && !top)) {
    return { incomplete: true, message: '答えの形をたしかめて、必要な数字を入れよう。' };
  }
  if (values.some(value => value && !/^\d{1,2}$/.test(value))) return { value: null };
  if (!top) return { value: String(Number(whole)) };
  const numerator = Number(top), denominator = Number(bottom);
  if (denominator === 0 || (direction === forward && (numerator === 0 || numerator >= denominator))) {
    return { value: null };
  }
  return { value: (direction === forward ? Number(whole) + 'と' : '') + numerator + '/' + denominator };
}

export function createDeck(random = Math.random) {
  const pool = ['improperToMixed', 'improperToMixed', 'improperToInteger', 'mixedToImproper', 'mixedToImproper'];
  let order = [], lastPrompt;
  return {
    next() {
      if (!order.length) {
        order = [...pool];
        for (let index = order.length - 1; index > 0; index--) {
          const other = Math.floor(random() * (index + 1));
          [order[index], order[other]] = [order[other], order[index]];
        }
      }
      const type = order.shift(), n = 2 + Math.floor(random() * 8);
      let whole = 1 + Math.floor(random() * 9);
      const remainder = type === 'improperToInteger' ? 0 : 1 + Math.floor(random() * (n - 1));
      let k = n * whole + remainder;
      const direction = type === 'mixedToImproper' ? reverse : forward;
      if (lastPrompt === direction + ':' + k + '/' + n) {
        whole = whole % 9 + 1;
        k = n * whole + remainder;
      }
      lastPrompt = direction + ':' + k + '/' + n;
      const mixed = whole + 'と' + remainder + '/' + n;
      const improper = k + '/' + n;
      const division = k + ' ÷ ' + n + ' ＝ ' + whole;
      return {
        direction,
        label: direction === forward ? '仮分数 → 帯分数・整数' : '帯分数 → 仮分数',
        prompt: direction === forward ? improper + ' を帯分数か整数に直そう。' : mixed + ' を仮分数に直そう。',
        answer: direction === reverse ? improper : remainder ? mixed : String(whole),
        explanation: direction === reverse
          ? whole + ' × ' + n + ' ＋ ' + remainder + ' ＝ ' + k + '。分母はそのままだよ。'
          : remainder ? division + ' あまり ' + remainder + '。商が整数部分、あまりが分子。分母はそのままだよ。'
            : division + '。あまりがないので、整数だけを書こう。',
        scorePrompt: { type, n, k },
      };
    },
  };
}
