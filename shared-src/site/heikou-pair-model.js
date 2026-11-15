export const GAME = 'heikouPair';
export const WIDTH = 880;
export const HEIGHT = 430;
export const LABELS = 'ABCD';
const pairs = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
const distances = [-324, -109, 109, 324];
const add = (p, v, k) => [p[0] + k * v[0], p[1] + k * v[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const delta = (a, b) => [a[0] - b[0], a[1] - b[1]];
const length = a => Math.hypot(...a);
const signed = (v, sign) => v.map(n => n * sign);
const degrees = radians => radians * 180 / Math.PI;
const segment = ({ point, direction }, half) => [add(point, direction, -half), add(point, direction, half)];

function shuffle(list, random) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function makeAngle(center, transverse, candidate, sector) {
  const rays = [signed(transverse, sector & 1 ? -1 : 1), signed(candidate, sector & 2 ? -1 : 1)];
  const turn = Math.atan2(cross(...rays), dot(...rays));
  const exact = Math.abs(degrees(turn));
  const value = Math.round(exact);
  if (Math.abs(value - exact) > 1e-8) throw Error('non-integral angle');
  const radius = 32;
  const bisector = add(rays[0], rays[1], 1);
  return {
    center, rays, radius, value, sweep: Number(turn > 0),
    from: add(center, rays[0], radius), to: add(center, rays[1], radius),
    label: add(center, bisector, 77 / length(bisector)),
  };
}

const box = ([x, y], w, h) => ({ x, y, w, h });
const overlaps = (a, b) => Math.abs(a.x - b.x) < a.w + b.w && Math.abs(a.y - b.y) < a.h + b.h;
const inBounds = ({ x, y, w, h }) => x - w >= 8 && x + w <= WIDTH - 8 && y - h >= 8 && y + h <= HEIGHT - 8;
function distanceToSegment(point, [start, end]) {
  const v = delta(end, start);
  const t = Math.max(0, Math.min(1, dot(delta(point, start), v) / dot(v, v)));
  return length(delta(point, add(start, v, t)));
}
function segmentHitsBox(line, b) {
  const [start, end] = line;
  const v = delta(end, start);
  const radius = (Math.abs(v[1]) * b.w + Math.abs(v[0]) * b.h) / length(v);
  return distanceToSegment([b.x, b.y], line) < radius + 3;
}
function distanceToBox([x, y], b) {
  return Math.hypot(Math.max(0, Math.abs(x - b.x) - b.w), Math.max(0, Math.abs(y - b.y) - b.h));
}
function inside(box, point) {
  return Math.abs(box.x - point[0]) <= box.w && Math.abs(box.y - point[1]) <= box.h;
}

export function clearDiagram(question) {
  const lines = [question.crossing, ...question.candidates.map(c => c.segment)];
  const letters = question.candidates.map(c => box(c.label, 12, 14));
  const angles = question.candidates.map(c => box(c.angle.label, 30, 15));
  const arcs = question.candidates.map(c => box(c.point, c.angle.radius + 3, c.angle.radius + 3));
  const boxes = [...letters, ...angles];
  if (!lines.flat().every(point => inBounds(box(point, 3, 3)))) return false;
  if (!boxes.every((b, i) => inBounds(b) && boxes.slice(i + 1).every(other => !overlaps(b, other)))) return false;
  return boxes.every(b => lines.every(line => !segmentHitsBox(line, b)))
    && arcs.every((a, i) => inBounds(a) && !angles.some((b, j) =>
      i === j ? distanceToBox(question.candidates[i].point, b) <= question.candidates[i].angle.radius + 2 : overlaps(a, b))
      && !letters.some(b => overlaps(a, b)))
    && question.candidates.every((c, i) => question.candidates.every((other, j) =>
      i === j || (!segmentHitsBox(other.segment, arcs[i]) && !inside(arcs[i], other.point))));
}

function assemble(core, id, level, tilt, offsets, bearings, sectors) {
  const { prompt, transversal, lines, answer } = core.geometry({ id, tilt, offsets, bearings });
  const crossing = segment(transversal, 420);
  const candidates = lines.map((line, i) => ({
    ...line, segment: segment(line, 140), label: add(line.point, line.direction, line.point[1] < 185 ? 162 : -162),
    angle: makeAngle(line.point, transversal.direction, line.direction, sectors[i]),
  }));
  return { prompt, transversal, crossing, candidates, answer, level };
}

function bearingsFor(level, pair, random) {
  const base = level === 'easy' ? [65, 75, 95, 105, 115]
    : level === 'medium' ? [70, 75, 80, 100, 105, 110] : [72, 75, 78, 80, 100, 102, 105, 108];
  const [repeated, ...others] = shuffle(base, random);
  const different = level === 'hard'
    ? [180 - repeated, repeated + (repeated < 90 ? 4 : -4)]
    : others.slice(0, 2);
  return Array.from({ length: 4 }, (_, i) => pair.includes(i) ? repeated : different.shift());
}

function sectorsFor(level, pair, random) {
  const first = Math.floor(random() * 4);
  if (level === 'easy') return pair.includes(0) && random() < .25 ? [first ^ 3, first, first, first] : Array(4).fill(first);
  const sectors = Array.from({ length: 4 }, () => Math.floor(random() * 4));
  sectors[pair[0]] = first;
  sectors[pair[1]] = first ^ (random() < .5 ? 1 : 2);
  if (level === 'hard') {
    // The mirrored distractor has the same printed value in a different sector.
    sectors[sectors.findIndex((_, i) => !pair.includes(i))] = first ^ 1;
  }
  return sectors;
}

export function difficulty(index, timed) {
  if (timed) return index % 5 === 4 ? 'medium' : 'hard';
  if (index < 4) return ['easy', 'medium', 'medium', 'hard'][index];
  if (index < 10) return ['easy', 'medium', 'medium', 'hard'][index % 4];
  return index % 3 === 0 ? 'medium' : 'hard';
}

export function createDeck(core, random = Math.random) {
  let bag = [], last, sequence = 0;
  return {
    next(index, timed = false) {
      const level = difficulty(index, timed);
      if (!bag.length) {
        bag = shuffle(pairs, random);
        if (bag[0] === last) [bag[0], bag[1]] = [bag[1], bag[0]];
      }
      const pair = bag.shift();
      last = pair;
      const id = 'heikou-' + (sequence++).toString(36) + '-' + Math.floor(random() * 2 ** 32).toString(36);
      for (let attempt = 0; attempt < 24; attempt++) {
        const tilt = level === 'easy' ? 0 : (random() < .5 ? -1 : 1) * (4 + Math.floor(random() * 7));
        const offsets = distances.map(d => d + Math.floor(random() * 25) - 12);
        const question = assemble(core, id, level, tilt, offsets, bearingsFor(level, pair, random),
          sectorsFor(level, pair, random));
        if (clearDiagram(question)) return question;
      }
      const bearings = bearingsFor(level, pair, () => .4);
      const sectors = sectorsFor(level, pair, () => .4);
      const fallback = assemble(core, id, level, level === 'easy' ? 0 : 4, distances, bearings, sectors);
      if (!clearDiagram(fallback)) throw Error('no safe diagram');
      return fallback;
    },
  };
}

export function hitCandidate(question, point) {
  // Leave the transversal and its crossings neutral, even when a hit area spans them.
  if (distanceToSegment(point, question.crossing) <= 12) return -1;
  const nearest = question.candidates.map((candidate, index) => ({
    index, distance: distanceToSegment(point, candidate.segment),
  })).sort((a, b) => a.distance - b.distance);
  return nearest[0].distance <= 25 && nearest[1].distance - nearest[0].distance >= 10 ? nearest[0].index : -1;
}
