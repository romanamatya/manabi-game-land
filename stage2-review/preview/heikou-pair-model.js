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

// Each level uses distinct distances from 90°. Doubling the distractor's
// distance bounds the overall bearing spread to 8°, 6°, and 4° respectively.
const distractorDeviation = { easy: [3, 4], medium: [2, 3], hard: [2] };
const tiltRange = { easy: [1, 3], medium: [4, 7], hard: [6, 10] };
const choose = (options, random) => options[Math.floor(random() * options.length)];

function arrangement(level, pair, random) {
  const deviation = choose(distractorDeviation[level], random);
  const offset = 1 + Math.floor(random() * (deviation - 1));
  const parallelBearing = 90 + choose([-1, 1], random) * offset;
  const distractorBearings = shuffle([90 - deviation, 90 + deviation], random);
  const bearings = Array.from({ length: 4 }, (_, i) => pair.includes(i) ? parallelBearing : distractorBearings.shift());

  const first = Math.floor(random() * 4);
  const otherRay = level === 'easy' ? 2 : choose([1, 2], random);
  const distractorSector = level === 'easy' ? first : Math.floor(random() * 4);
  const distractorSectors = [distractorSector, level === 'hard' ? distractorSector ^ 3 : distractorSector];
  // Flipping one ray gives a supplementary angle. Flipping both gives a
  // vertical angle, leaving the number unchanged for a given bearing.
  // The distractors have mirrored bearings but the same sector parity, so
  // their displayed numbers also sum to 180°, without the right positions.
  const sectors = Array.from({ length: 4 }, (_, i) =>
    i === pair[0] ? first : i === pair[1] ? first ^ otherRay : distractorSectors.shift());
  return { bearings, sectors };
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
        const [low, high] = tiltRange[level];
        const tilt = choose([-1, 1], random) * (low + Math.floor(random() * (high - low + 1)));
        const offsets = distances.map(d => d + Math.floor(random() * 25) - 12);
        const { bearings, sectors } = arrangement(level, pair, random);
        const question = assemble(core, id, level, tilt, offsets, bearings, sectors);
        if (clearDiagram(question)) return question;
      }
      const { bearings, sectors } = arrangement(level, pair, () => .4);
      const fallback = assemble(core, id, level, tiltRange[level][0], distances, bearings, sectors);
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
