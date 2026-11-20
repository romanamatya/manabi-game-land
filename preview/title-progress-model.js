export const subjects = Object.freeze([
  { id: 'japanese', name: '国語', page: 'japanese.html' },
  { id: 'math', name: '算数', page: 'math.html' },
  { id: 'social', name: '社会', page: 'social.html' },
  { id: 'science', name: '理科', page: 'science.html' },
  { id: 'english', name: '外国語', page: 'language.html' },
]);
export const geometryGames = Object.freeze(['suichoku', 'parallelPair', 'verticalParallel', 'quadrilateral', 'heikouPair', 'shikakkeSecrets']);
const count = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
const read = (storage, key) => { try { return JSON.parse(storage.getItem(key) || 'null'); } catch { return null; } };

export function gameProgress(game, storage, subjectMap = {}) {
  const record = read(storage, 'mgl_' + game.id) || {};
  const sources = [record];
  if (game.id === 'parallelPair') sources.push(read(storage, 'manabi_parallel_stage1:v1') || {});
  if (game.id === 'pref-name') sources.push(read(storage, 'mq_pref_name') || {});
  if (game.id === 'pref-place') sources.push(read(storage, 'mq_pref_place') || {});
  const challenge = read(storage, 'mgl_challenge120_v1:' + game.id);
  if (challenge?.game === game.id) sources.push({ best: Math.max(count(challenge.attemptBest), ...Object.values(challenge.bests || {}).map(count)) });
  const explicit = new Set(sources.flatMap(source => Array.isArray(source.titles) ? source.titles : []));
  const savedTitles = read(storage, 'mgl_profile')?.titles;
  if (Array.isArray(savedTitles)) for (const title of savedTitles) explicit.add(title);
  let best = Math.max(game.id === 'keisan' ? count(storage.getItem('mgl_best')) : 0,
    ...sources.map(source => Math.max(count(source.best), count(source.bestStreak), count(source.challenge?.attemptBest),
      ...Object.values(source.challenge?.bests || {}).map(count))));
  const titles = game.titles.map(title => ({ ...title, earned: best >= title.at || explicit.has(title.id) }));
  for (const title of titles) if (title.earned) best = Math.max(best, title.at);
  const earned = titles.filter(title => title.earned).length;
  return { ...game, subject: game.subject || subjectMap[game.id], best, titles,
    earned, total: titles.length, percent: titles.length ? Math.round(100 * earned / titles.length) : null };
}
export function collectionProgress(catalog, storage, statuses, subjectMap = {}) {
  const games = catalog.map(game => ({ ...gameProgress(game, storage, subjectMap), status: statuses.get(game.id) || 'checking' }));
  const summarize = rows => {
    const published = rows.filter(game => game.status === 'published');
    const earned = published.reduce((sum, game) => sum + game.earned, 0);
    const total = published.reduce((sum, game) => sum + game.total, 0);
    return { earned, total, percent: total ? Math.round(100 * earned / total) : null, games: published.length };
  };
  return { games, overall: summarize(games), subjects: subjects.map(subject => ({ ...subject,
    ...summarize(games.filter(game => game.subject === subject.id)) })) };
}
