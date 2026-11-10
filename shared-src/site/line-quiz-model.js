(function (root) {
  'use strict';

  const WIDTH = 640;
  const HEIGHT = 440;
  const margin = 33;
  const labels = [...'ABCDEFG'];
  const game = 'verticalParallel';
  const directions = [
    [1, 0], [0, 1], [1, 1], [1, -1], [2, 1], [2, -1], [1, 2], [1, -2],
    [3, 1], [3, -1], [1, 3], [1, -3], [3, 2], [3, -2], [2, 3], [2, -3],
  ];
  const cross = (ax, ay, bx, by) => ax * by - ay * bx;
  const dot = (ax, ay, bx, by) => ax * bx + ay * by;
  const point = (line, t) => ({ x: line.x + t * line.dx, y: line.y + t * line.dy });
  const at = (segment, t) => ({
    x: segment.start.x + t * (segment.end.x - segment.start.x),
    y: segment.start.y + t * (segment.end.y - segment.start.y),
  });
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function segment(line) {
    let low = -Infinity;
    let high = Infinity;
    for (const [origin, delta, limit] of [[line.x, line.dx, WIDTH], [line.y, line.dy, HEIGHT]]) {
      if (!delta) continue;
      const a = (margin - origin) / delta;
      const b = (limit - margin - origin) / delta;
      low = Math.max(low, Math.min(a, b));
      high = Math.min(high, Math.max(a, b));
    }
    return { start: point(line, low), end: point(line, high) };
  }

  function distanceToSegment(p, { start, end }) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const t = Math.max(0, Math.min(1, dot(p.x - start.x, p.y - start.y, dx, dy) / (dx * dx + dy * dy)));
    return distance(p, { x: start.x + t * dx, y: start.y + t * dy });
  }

  function nearestLine(segments, p, radius, ambiguity) {
    const matches = segments.map((line, index) => ({ index, distance: distanceToSegment(p, line) }))
      .sort((a, b) => a.distance - b.distance);
    return matches[0].distance <= radius && matches[1].distance - matches[0].distance > ambiguity
      ? matches[0].index : -1;
  }

  function intersection(a, b) {
    const denominator = cross(a.dx, a.dy, b.dx, b.dy);
    if (!denominator) return null;
    const p = point(a, cross(b.x - a.x, b.y - a.y, b.dx, b.dy) / denominator);
    return p.x > margin + 5 && p.x < WIDTH - margin - 5 && p.y > margin + 5 && p.y < HEIGHT - margin - 5 ? p : null;
  }

  function layout(lines) {
    const segments = lines.map(segment);
    if (segments.some(({ start, end }) => distance(start, end) < 310)) return null;
    const intersections = [];
    for (const [i, a] of lines.entries()) {
      for (const b of lines.slice(i + 1)) {
        if (!cross(a.dx, a.dy, b.dx, b.dy)
            && Math.abs(cross(a.dx, a.dy, b.x - a.x, b.y - a.y)) / Math.hypot(a.dx, a.dy) < 54) return null;
        const p = intersection(a, b);
        if (p) intersections.push(p);
      }
    }
    const distributed = [];
    for (const p of intersections) {
      if (distributed.every(other => distance(p, other) >= 43)) distributed.push(p);
    }
    if (distributed.length < 6 || ['x', 'y'].some(axis => {
      const coordinates = distributed.map(p => p[axis]);
      return Math.max(...coordinates) - Math.min(...coordinates) < 120;
    })) return null;

    const labelPoints = [];
    for (const [i, s] of segments.entries()) {
      const length = distance(s.start, s.end);
      const offset = { x: (s.end.y - s.start.y) * 20 / length, y: (s.start.x - s.end.x) * 20 / length };
      const options = [0.05, 0.95, 0.14, 0.86, 0.24, 0.76].flatMap(t => {
        const p = at(s, t);
        return [1, -1].map(sign => ({ x: p.x + sign * offset.x, y: p.y + sign * offset.y }));
      });
      const p = options.find(p => p.x >= 14 && p.x <= WIDTH - 14 && p.y >= 14 && p.y <= HEIGHT - 14
        && segments.every((other, j) => i === j || distanceToSegment(p, other) >= 20)
        && labelPoints.every(other => distance(p, other) >= 36));
      if (!p) return null;
      labelPoints.push(p);
    }

    // Keep a clear stretch on every line for a fingertip, even when crossings are busy.
    for (const [i, s] of segments.entries()) {
      let consecutive = 0;
      for (let n = 1; n <= 19; n++) {
        const p = at(s, n / 20);
        const clear = segments.every((other, j) => i === j || distanceToSegment(p, other) >= 24)
          && labelPoints.every(label => distance(p, label) >= 22);
        consecutive = clear ? consecutive + 1 : 0;
        if (consecutive === 3) break;
      }
      if (consecutive < 3) return null;
    }
    return { segments, labelPoints };
  }

  function shuffle(values, rng) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  const difficulty = best => best < 5 ? 'beginner' : best < 15 ? 'intermediate' : 'advanced';
  const modes = [['parallel', 1], ['parallel', 2], ['perpendicular', 1], ['perpendicular', 2]];
  function chooseMode(rng, previous) {
    const choices = modes.filter(([relation, count]) => relation !== previous?.relation || count !== previous?.count);
    return choices[Math.floor(rng() * choices.length)];
  }

  function buildQuestion({ id, level, relation, count, rng = Math.random }) {
    const core = root.ManabiEconomyCore;
    const basePool = directions.slice(0, { beginner: 2, intermediate: 8, advanced: 16 }[level]);
    const minAngle = { beginner: 21, intermediate: 15, advanced: 11 }[level] * Math.PI / 180;
    for (let tries = 0; tries < 800; tries++) {
      const base = basePool[Math.floor(rng() * basePool.length)];
      const target = relation === 'parallel' ? base : [-base[1], base[0]];
      const vectors = [base, ...Array.from({ length: count }, () => target)];
      for (const direction of shuffle(directions, rng)) {
        const [dx, dy] = direction;
        if (vectors.every(([x, y], i) => Math.abs(cross(x, y, dx, dy)) >=
            Math.sin(i <= count ? minAngle : Math.PI / 15) * Math.hypot(x, y) * Math.hypot(dx, dy))) {
          vectors.push(direction);
        }
        if (vectors.length === 7) break;
      }
      if (vectors.length !== 7) continue;
      const tagged = shuffle(vectors.map(([dx, dy], i) => ({
        dx, dy, x: 105 + Math.floor(rng() * 430), y: 75 + Math.floor(rng() * 290), reference: i === 0,
      })), rng);
      const reference = tagged.findIndex(line => line.reference);
      const lines = tagged.map(({ x, y, dx, dy }) => ({ x, y, dx, dy }));
      const presentation = layout(lines);
      if (!presentation) continue;
      const prompt = core.canonicalPrompt(game, { id, relation, count, reference, lines });
      return { ...prompt, ...presentation };
    }
    throw Error('line-quiz-generation-exhausted');
  }

  root.ManabiLineQuiz = { WIDTH, HEIGHT, labels, game, difficulty, modes, chooseMode, buildQuestion,
    segment, distanceToSegment, nearestLine, intersection };
})(globalThis);
