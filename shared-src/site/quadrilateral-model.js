const WIDTH = 640;
const HEIGHT = 420;
const NAMES = 'ABCD';
const GAME = 'quadrilateral';
const radians = degrees => degrees * Math.PI / 180;
const add = ([ax, ay], [bx, by]) => [ax + bx, ay + by];
const sub = ([ax, ay], [bx, by]) => [ax - bx, ay - by];
const mul = ([x, y], factor) => [x * factor, y * factor];
const unit = v => mul(v, 1 / Math.hypot(...v));
const point = (angle, length) => [Math.cos(angle) * length, Math.sin(angle) * length];
const indexAfter = (index, step = 1) => (index + step) % 4;
const label = (at, text, width, extra = {}) => ({ at, text, width, height: 28, ...extra });
const randomInt = (random, min, max) => min + Math.floor(random() * (max - min + 1));

function rectangle({ at: [x, y], width, height }, gap = 0) {
  return [x - width / 2 - gap, y - height / 2 - gap, x + width / 2 + gap, y + height / 2 + gap];
}

function overlaps(a, b) {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

function crossesRectangle(start, end, box) {
  let lo = 0;
  let hi = 1;
  for (let axis = 0; axis < 2; axis++) {
    const delta = end[axis] - start[axis];
    if (Math.abs(delta) < 1e-9) {
      if (start[axis] < box[axis] || start[axis] > box[axis + 2]) return false;
      continue;
    }
    const a = (box[axis] - start[axis]) / delta;
    const b = (box[axis + 2] - start[axis]) / delta;
    lo = Math.max(lo, Math.min(a, b));
    hi = Math.min(hi, Math.max(a, b));
    if (lo > hi) return false;
  }
  return true;
}

function arcAt(vertices, index, scale) {
  const center = vertices[index];
  const previous = unit(sub(vertices[indexAfter(index, 3)], center));
  const next = unit(sub(vertices[indexAfter(index)], center));
  const radius = 23 * scale;
  return {
    index, center, radius, from: add(center, mul(next, radius)),
    to: add(center, mul(previous, radius)),
    bisector: unit(add(previous, next)),
  };
}

function circleTouches(box, { center: [x, y], radius }) {
  const dx = Math.max(box[0] - x, x - box[2], 0);
  const dy = Math.max(box[1] - y, y - box[3], 0);
  return Math.hypot(dx, dy) <= radius + 1;
}

function layoutFits(vertices, labels, arcs) {
  const boxes = labels.map(item => rectangle(item, 3));
  return boxes.every((box, i) =>
    box[0] >= 5 && box[1] >= 5 && box[2] <= WIDTH - 5 && box[3] <= HEIGHT - 5
    && boxes.slice(i + 1).every(other => !overlaps(box, other))
    && vertices.every((vertex, j) => !crossesRectangle(vertex, vertices[indexAfter(j)], box))
    && arcs.every(arc => !circleTouches(box, arc))
  );
}

function drawData(prompt, rotation, zoom) {
  const { kind, target, values } = prompt;
  const u = point(rotation, prompt.u);
  const v = point(rotation + radians(prompt.angle), prompt.v);
  const raw = [[0, 0], u, add(u, v), v];
  const min = [0, 1].map(axis => Math.min(...raw.map(p => p[axis])));
  const max = [0, 1].map(axis => Math.max(...raw.map(p => p[axis])));
  const mid = mul(add(min, max), .5);
  const [width, height] = sub(max, min);
  const scale = Math.min(446 / width, 258 / height) * zoom;
  const vertices = raw.map(p => add(mul(sub(p, mid), scale), [WIDTH / 2, HEIGHT / 2]));
  if (Math.min(prompt.u, prompt.v) * scale < 112) return null;
  const corners = vertices.map((_, index) => arcAt(vertices, index, zoom));
  const vertexLabels = corners.map(({ center, bisector, index }) =>
    label(add(center, mul(bisector, -46)), NAMES[index], 24, { index }));
  const indices = [target, indexAfter(target, 2), indexAfter(target)];
  const arcs = kind === 'angle' ? indices.map(i => corners[i]) : [];
  const candidates = indices.map(index => {
    const known = index !== target;
    const unitText = kind === 'length' ? ' cm' : '°';
    const text = known ? values[index] + unitText : '？';
    if (kind === 'angle') {
      const { center, bisector } = corners[index];
      const perpendicular = [-bisector[1], bisector[0]];
      const options = [];
      for (const distance of [53, 62, 71, 80, 90, 100]) {
        for (const sideways of [0, -9, 9]) {
          const at = add(add(center, mul(bisector, distance)), mul(perpendicular, sideways));
          options.push(label(at, text, known ? 56 : 26, { index, known }));
        }
      }
      return options;
    }
    const start = vertices[index], end = vertices[indexAfter(index)];
    const [dx, dy] = unit(sub(end, start));
    const offset = 18 + 28 * Math.abs(dy) + 14 * Math.abs(dx);
    const at = add(mul(add(start, end), .5), [dy * offset, -dx * offset]);
    return [label(at, text, known ? 68 : 26, { index, known })];
  });
  const measureLabels = [];
  function place(index) {
    if (index === candidates.length) return true;
    for (const item of candidates[index]) {
      if (!layoutFits(vertices, [...vertexLabels, ...measureLabels, item], arcs)) continue;
      measureLabels.push(item);
      if (place(index + 1)) return true;
      measureLabels.pop();
    }
    return false;
  }
  if (!place(0)) return null;
  const targetName = kind === 'length' ? NAMES[target] + NAMES[indexAfter(target)] : NAMES[target];
  return { vertices, vertexLabels, measureLabels, arcs, targetName, rotation, scale };
}

export function createQuestionDeck(random = Math.random, position = 0) {
  let shapes = [];
  return {
    next(core, nonce = crypto.randomUUID()) {
      if (!shapes.length) shapes = random() < .5 ? ['p', 'r'] : ['r', 'p'];
      const shape = shapes[0];
      const kind = position % 2 ? 'angle' : 'length';
      for (let retry = 0; retry < 200; retry++) {
        const u = randomInt(random, 6, 18);
        const v = shape === 'r' ? u : randomInt(random, 5, 18);
        if (shape === 'p' && (Math.min(u, v) / Math.max(u, v) < .56 || Math.abs(u - v) < 2)) continue;
        const acute = randomInt(random, 42, 78);
        const angle = random() < .5 ? acute : 180 - acute;
        const target = randomInt(random, 0, 3);
        const prompt = core.canonicalPrompt(GAME, { id: `quad-${shape}-${kind}-${u}-${v}-${angle}-${target}-${nonce}` });
        const drawing = drawData(prompt, random() * 2 * Math.PI, .84 + random() * .16);
        if (!drawing) continue;
        position++;
        shapes.shift();
        return { ...prompt, ...drawing };
      }
      throw Error('quadrilateral-layout-unavailable');
    },
  };
}

export { WIDTH, HEIGHT, GAME };
