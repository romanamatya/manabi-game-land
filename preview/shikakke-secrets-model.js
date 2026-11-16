export const GAME = 'shikakkeSecrets';

export const SHAPES = [
  { id: 'parallelogram', name: '平行四辺形', points: [[36,28],[113,28],[88,80],[11,80]] },
  { id: 'trapezoid', name: '台形', points: [[39,28],[86,28],[111,80],[13,80]] },
  { id: 'rhombus', name: 'ひし形', points: [[62,10],[91,54],[62,98],[33,54]] },
  { id: 'square', name: '正方形', points: [[30,22],[94,22],[94,86],[30,86]] },
  { id: 'rectangle', name: '長方形', points: [[14,28],[110,28],[110,80],[14,80]] },
];

export function createDeck(questions, random = Math.random) {
  let remaining = [];
  let previous;
  return {
    next() {
      if (!remaining.length) {
        remaining = [...questions];
        for (let i = remaining.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1));
          [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
        }
        if (remaining[0] === previous) [remaining[0], remaining[1]] = [remaining[1], remaining[0]];
      }
      previous = remaining.shift();
      return previous;
    },
  };
}
