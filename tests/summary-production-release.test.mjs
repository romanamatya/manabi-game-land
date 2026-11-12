import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { bestForSharedRanking } from '../ranking-sync-api.js';
import '../keisan-summary-state.js';

const read = file => fs.readFileSync(file, 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function load(file, context = { window: {}, structuredClone }) {
  vm.runInNewContext(read(file), context);
  return context.window;
}

test('production lists all 16 games and preserves the original profile records', () => {
  const before = load('tests/fixtures/profile-catalog-before-production-summary.js').ManabiProfileCatalog;
  const after = load('profile-catalog.js').ManabiProfileCatalog;
  const addedIds = ['keisanSummary', 'suichoku', 'parallelPair', 'missingAlphabet', 'verticalParallel', 'quadrilateral'];
  const config = load('environment.js', { window: {}, location: { pathname: '/' } }).MANABI_BACKEND_CONFIG;
  const legacyMathIds = ['multiplicationProperties', 'shapeExpressions'];
  const releasedIds = [...before.map(game => game.id), ...addedIds, ...legacyMathIds].sort();
  assert.equal(releasedIds.length, 16);
  assert.deepEqual([...config.gameIds, ...config.staticLocalGameIds].sort(), releasedIds);
  assert.deepEqual([...config.rankingGameIds].sort(), releasedIds.filter(id => !['verticalParallel', 'quadrilateral'].includes(id)));
  assert.deepEqual(fs.readdirSync('games').filter(file => file.endsWith('.html'))
    .map(file => file.slice(0, -5)).sort(), releasedIds);
  assert.deepEqual(Array.from(after, game => game.id).sort(),
    releasedIds.filter(id => !legacyMathIds.includes(id)));
  assert.deepEqual(plain(after.filter(game => !addedIds.includes(game.id))), plain(before));

  const parallel = after.find(game => game.id === 'parallelPair');
  assert.deepEqual(Array.from(parallel.titles, title => title.at), [3, 5, 10, 15, 25]);
  // Parallel's scoped adapter is enabled separately from the catalog flag.
  assert.equal(parallel.rankingEnabled, false);
  assert.equal(config.parallelPairRankingEnabled, true);

  const vertical = after.find(game => game.id === 'suichoku');
  assert.equal(vertical.name, '垂直を見つけよう！');
  assert.equal(vertical.rankingEnabled, true);
  assert.deepEqual(plain(vertical.titles.map(title => [title.at, title.name])), [
    [5, '垂直みつけ隊'], [10, '垂直のたんけん家'], [15, '垂直の目利き'],
    [20, '垂直の名探偵'], [25, '垂直の見きわめ王'],
  ]);
});

test('question logic matches preview and the production campaign advertises 50pt', async () => {
  for (const file of ['keisan-summary-model.js', 'keisan-question-model.js']) {
    assert.equal(read(file).trimEnd(), read('preview/' + file).trimEnd(), file);
  }
  const production = read('keisan-summary-game.js');
  const preview = read('preview/keisan-summary-game.js');
  assert.equal([...production.matchAll(/今日の上限50pt/g)].length, 2);
  // A dormant preview campaign has older copy; neither shared wallet accepts a 100pt policy.
  const stripCampaignCopy = script => script.replace(/今日の上限(?:50|100)pt/g, '今日の上限').trimEnd();
  assert.equal(stripCampaignCopy(production), stripCampaignCopy(preview));
  const window = load('preview/environment.js', { window: {}, location: { pathname: '/preview/' } });
  assert.notEqual(window.MANABI_BACKEND_CONFIG.summaryManagementEnabled, true);
  load('preview/summary-management.js', { window });
  const { policy } = await window.ManabiSummaryManagement.ready();
  assert.deepEqual(plain(policy), { multiplier: 1, cap: 50 });
});

test('production economy grants summary points once, keeps daily cap and preserves owned items and other subjects',async()=>{const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)},window={MANABI_ENV:{preview:false},manabiStorage:storage,sessionStorage:storage,addEventListener(){},dispatchEvent(){}};let lock=Promise.resolve();const x={window,globalThis:window,structuredClone,Date,URL,crypto:{randomUUID},Event:class{},document:{body:{dataset:{}},readyState:'complete',addEventListener(){},getElementById(){return null}},navigator:{locks:{request:(_,fn)=>{const p=lock.then(fn);lock=p.catch(()=>{});return p}}},location:{href:'https://example.invalid/'},setInterval(){}};vm.createContext(x);for(const file of ['economy-core.js','storage-adapters.js','economy.js'])vm.runInContext(fs.readFileSync(file,'utf8'),x);const E=window.ManabiEconomy;const w=E.core.initial();w.balances.social=123;w.owned=['icon-005','frame-11'];data.set('mgl_economy_v1',JSON.stringify(w));const bad=E.begin('keisanSummary',{id:'bad',expected:false});await E.answer(bad,{completed:false});assert.equal(E.snapshot().balances.math,0);for(let i=0;i<200;i++){const c=E.begin('keisanSummary',{id:'q'+i,expected:true});await Promise.all([E.answer(c,{completed:true}),E.answer(c,{completed:true})]);}assert.equal(E.snapshot().balances.math,50);assert.equal(E.snapshot().balances.social,123);assert.equal(JSON.stringify(E.snapshot().owned),JSON.stringify(w.owned));assert.equal(E.snapshot().claimed.length,128);assert.equal(JSON.parse(data.get('mgl_economy_outbox_v1')).length,0);});

test('summary links use the shared ranking and practice and challenge use the same best record', () => {
  assert.match(read('profile-ui.js'), /link\('ランキングを見る','ranking\.html\?game='\+row\.id\)/);
  const nodes = new Map();
  const document = {
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, { replaceChildren() {} });
      return nodes.get(id);
    },
  };
  const redirects = [];
  vm.runInNewContext(read('ranking-page.js').replace(/^import[^\n]+\n/, ''), {
    document, URLSearchParams,
    window: { ManabiLeaderboard: { games: [{ id: 'keisanSummary', name: '計算のきまり・総まとめ' }] } },
    location: { search: '?game=keisanSummary', replace: url => redirects.push(url) },
  });
  assert.deepEqual(redirects, ['summary-ranking.html']);
  assert.match(read('summary-ranking.js'), /client\(\)\)\.rankings\('keisanSummary'\)/);

  const summary = globalThis.ManabiSummaryState;
  const saved = new Map();
  const window = load('profile-catalog.js');
  const profile = load('profile-model.js', { window, structuredClone }).ManabiProfile;
  function sharedBest(state) {
    saved.set(summary.KEY, JSON.stringify(state));
    const record = profile.records({ getItem: key => saved.get(key) }).find(row => row.id === 'keisanSummary');
    return bestForSharedRanking('keisanSummary', record);
  }
  const question = { token: 'fixture', stage: 0, answered: false };
  const answer = { token: question.token, stage: 0, correct: true, final: true };
  const practice = { ...summary.fresh(), best: 29, streak: 29, current: question };
  const unlocked = summary.answer(practice, answer, 100).state;
  assert.equal(sharedBest(unlocked), 30);
  const challenge = { ...summary.start(unlocked, 200, 'attempt'), current: question };
  assert.equal(sharedBest(summary.answer(challenge, answer, 201).state), 31);
});

test('the geometry list includes the new game only when its standalone release is enabled', () => {
  class Element {
    children = [];
    dataset = {};
    classList = { add() {} };
    setAttribute() {}
    append(...items) { this.children.push(...items); }
  }
  const window = load('profile-catalog.js');
  window.ManabiGameSelection = { initialize() {} };
  const cards = new Element();
  const document = {
    body: { dataset: { unit: 'geometry' } },
    querySelectorAll: () => [],
    getElementById: () => cards,
    createElement: () => new Element(),
  };
  load('math-navigation.js', { window, document, URL, location: { href: 'https://example.invalid/math-geometry.html' } });
  const calculation = window.ManabiMathUnits.find(unit => unit.id === 'calculation');
  const geometry = window.ManabiMathUnits.find(unit => unit.id === 'geometry');
  const geometryIds = ['suichoku', 'parallelPair'];
  assert.deepEqual(Array.from(geometry.games), geometryIds);
  assert.deepEqual(cards.children.map(card => card.dataset.gameCard), geometryIds);
  for (const [index, game] of geometryIds.entries()) {
    assert.ok(!calculation.games.includes(game));
    const [play, ranking] = cards.children[index].children[2].children;
    assert.equal(play.dataset.gameId, game);
    assert.equal(ranking.href, 'ranking.html?game=' + game);
  }
  cards.children = [];
  load('environment.js', { window, location: { pathname: '/math-geometry.html' } });
  load('math-navigation.js', { window, document, URL, location: { href: 'https://example.invalid/math-geometry.html' } });
  assert.deepEqual(cards.children.map(card => card.dataset.gameCard), [...geometryIds, 'verticalParallel', 'quadrilateral']);
  for (const id of ['verticalParallel', 'quadrilateral']) {
    const [play, ranking] = cards.children.find(card => card.dataset.gameCard === id).children[2].children;
    assert.equal(play.dataset.gameHref, 'games/' + id + '.html');
    assert.equal(ranking, undefined);
  }
});
