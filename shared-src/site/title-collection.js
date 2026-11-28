import { subjects, geometryGames, gameProgress, collectionProgress, summarizePublished } from './title-progress-model.js';

const storage = window.manabiStorage;
const catalog = window.ManabiProfileCatalog || [];
const config = window.MANABI_BACKEND_CONFIG || {};
const subjectMap = window.ManabiEconomyCore?.games || {};
const statuses = new Map(catalog.map(game => [game.id, (config.availabilityEnabled||config.visibilityGameIds?.includes(game.id)) ? 'checking' : 'published']));
const activeBindings = [];
let subject = new URL(location.href).searchParams.get('subject') || 'math';
let selectedGame = new URL(location.href).searchParams.get('game');
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
function progressMeter(percent, label) {
  const box = node('div', undefined, 'title-progress');
  box.append(node('strong', percent === null ? '―' : percent + '％'));
  if (percent !== null) {
    const meter = document.createElement('progress');
    meter.max = 100; meter.value = percent;
    meter.classList.toggle('complete', percent === 100);
    meter.setAttribute('aria-label', label);
    box.append(meter);
  }
  return box;
}
function artwork(game, title, size) {
  const wrap = node('span', undefined, 'collection-art' + (title.earned ? ' earned' : ' locked'));
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', title.name + '・' + (title.earned ? '獲得済み' : '未獲得'));
  // Full 512px PNGs are whole illustrations, not 1254px sprite sheets.
  const standaloneImage = (title.standalone && title.image?.endsWith('.svg')) ||
    (title.image?.endsWith('.png') && (title.standalone ||
    title.viewport?.every((value, index) => value === [0, 0, 512, 512][index])));
  if (standaloneImage) {
    const badge = node('span', undefined, 'mq-badge');
    badge.style.setProperty('--badge-size', size + 'px');
    const image = document.createElement('img'); image.src = title.image;
    image.alt = ''; image.style.cssText = 'display:block;width:100%;height:100%;object-fit:contain';
    badge.append(image); wrap.append(badge);
  } else {
    const badge = window.ManabiIdentity?.badge(title.id, size);
    if (badge) wrap.append(badge);
    else wrap.append(node('span', title.name, 'mq-title-text-only'));
  }
  wrap.title = title.name + '（' + title.at + '問連続）';
  return wrap;
}
function view() { return collectionProgress(catalog, storage, statuses, subjectMap); }
function decorateCards() {
  for (const card of document.querySelectorAll('[data-game-card]')) {
    const definition = catalog.find(game => game.id === card.dataset.gameCard);
    if (!definition) continue;
    const game = gameProgress(definition, storage, subjectMap);
    card.classList.add('title-game-row');
    let art = card.querySelector('.title-row-art');
    if (!art) {
      art = node('div', undefined, 'title-row-art');
      art.setAttribute('aria-label', '称号の獲得状況');
      const percent = node('div', undefined, 'title-row-percent');
      const best = node('div', undefined, 'title-row-best');
      card.append(art, percent, best);
    }
    art.replaceChildren(...game.titles.map(title => artwork(game, title, 46)));
    card.querySelector('.title-row-percent').replaceChildren(progressMeter(game.percent, game.name + 'の称号達成率'));
    const record = card.querySelector('.title-row-best');
    record.replaceChildren(node('small', '自己最高'), node('strong', game.best + '問'));
    const status = statuses.get(game.id);
    card.dataset.gameAvailability=status;
    card.querySelectorAll('[data-game-ranking],.rank-button').forEach(n=>n.remove());
    card.hidden = status !== 'published';
    const play = card.querySelector('[data-game-play]');
    if (play) { play.disabled = status !== 'published'; play.textContent = status === 'published' ? 'プレイ' : '確認中'; }
  }
  renderNewBadge();
}
function renderHome() {
  const host = document.getElementById('titleCollectionHome');
  if (!host) return;
  const result = view(), overall = result.overall;
  if (statuses.has('metalHeat')) {
    const scienceLabel = document.querySelector('.mq-home a[href="science.html"] span');
    if (scienceLabel) scienceLabel.textContent = statuses.get('metalHeat') === 'published' ? 'ゲームを選ぶ' : '準備中';
  }
  host.replaceChildren(node('h2', 'ぼく・わたしの称号コレクション'));
  const overview = node('div', undefined, 'collection-overview');
  const counts = node('div');
  counts.append(node('strong', overall.earned + ' / ' + overall.total + '個'), node('small', '獲得した称号'));
  overview.append(counts, progressMeter(overall.percent, '全教科の称号達成率'));
  const link = node('a', '称号コレクションを見る', 'collection-link'); link.href = 'titles.html'; overview.append(link);
  const rows = node('div', undefined, 'collection-subjects');
  for (const entry of result.subjects) {
    const card = node('a', undefined, 'collection-subject'); card.href = 'titles.html?subject=' + entry.id;
    card.append(node('span', entry.name), progressMeter(entry.percent, entry.name + 'の称号達成率'));
    rows.append(card);
  }
  host.append(overview, rows);
  if ([...statuses.values()].some(status => status === 'checking' || status === 'unknown')) {
    host.append(node('p', '公開状態を確認できたゲームで集計しています。', 'collection-note'));
  }
}
function renderCollection() {
  const host = document.getElementById('titleCollection');
  if (!host) return;
  const result = view();
  const tabs = document.getElementById('collectionSubjects');
  tabs.replaceChildren();
  for (const entry of result.subjects) {
    const button = node('button', entry.name + ' ' + (entry.percent === null ? '―' : entry.percent + '％'));
    button.type = 'button'; button.setAttribute('aria-pressed', String(subject === entry.id));
    button.onclick = () => { subject = entry.id; selectedGame = undefined; renderCollection(); };
    tabs.append(button);
  }
  const games = result.games.filter(game => game.subject === subject && (game.status === 'published' || game.earned > 0));
  const chosen = games.find(game => game.id === selectedGame) || games[0];
  host.replaceChildren();
  if (!chosen) { host.append(node('p', 'この教科のゲームは準備中です。')); return; }
  selectedGame = chosen.id;
  const controls = node('div', undefined, 'collection-game-picker');
  const label = node('label', 'ゲームを選ぶ'); label.htmlFor = 'collectionGame';
  const select = document.createElement('select'); select.id = 'collectionGame';
  for (const game of games) { const option = node('option', game.name); option.value = game.id;
    option.selected = chosen.id === game.id; select.append(option); }
  select.onchange = () => { selectedGame = select.value; renderCollection(); };
  controls.append(label, select);
  const heading = node('div', undefined, 'collection-game-heading');
  heading.append(node('h2', chosen.name), progressMeter(chosen.percent, chosen.name + 'の称号達成率'));
  const titles = node('ol', undefined, 'collection-title-grid');
  titles.style.setProperty('--rank-count', chosen.total);
  for (const title of chosen.titles) {
    const item = node('li', undefined, title.earned ? 'earned' : 'locked');
    item.append(artwork(chosen, title, 112), node('strong', title.name), node('span', title.at + '問連続正解'),
      node('small', title.earned ? '獲得済み' : '未獲得'));
    titles.append(item);
  }
  const footer = node('div', undefined, 'collection-game-footer');
  footer.append(node('strong', '自己最高記録 ' + chosen.best + '問'));
  if (chosen.status === 'published') { const play = node('a', 'プレイ', 'collection-link'); play.href = 'games/' + chosen.id + '.html'; footer.append(play); }
  else footer.append(node('p', 'お休み中のゲームです。獲得した称号は残っています。'));
  host.append(controls, heading, titles, footer);
}
function renderNewBadge() {
  for (const badge of document.querySelectorAll('.new-game-badge')) badge.remove();
  const id = statuses.get(config.latestGameId) === 'published' ? config.latestGameId
    : config.latestGameId === 'fractionBasics' ? 'shikakkeSecrets' : null;
  if (!id || statuses.get(id) !== 'published') return;
  const game = catalog.find(game => game.id === id);
  if (!game) return;
  const subjectId = game.subject || subjectMap[id];
  const unit = window.ManabiMathUnits?.find(unit => unit.games.includes(id))?.id || (geometryGames.includes(id) ? 'geometry' : ['fractionBasics','fractionTransform'].includes(id) ? 'fractions' : 'calculation');
  for (const card of document.querySelectorAll('[data-subject-card],[data-unit-games],[data-game-card]')) {
    const matches = card.dataset.gameCard === id || card.dataset.subjectCard === subjectId
      || (subjectId === 'math' && card.dataset.unitId === unit);
    if (matches) { const badge = node('span', 'NEW', 'new-game-badge'); card.classList.add('has-new-game'); card.append(badge); }
  }
}
function renderMathUnits() {
  const cards = document.querySelectorAll('.math-unit-row[data-unit-games]');
  if (!cards.length) return;
  const {games} = view();
  for (const card of cards) {
    const ids = new Set(card.dataset.unitGames.split(' '));
    const summary = summarizePublished(games.filter(game => ids.has(game.id)));
    const name = card.querySelector('h2').textContent;
    card.querySelector('.math-unit-progress').replaceChildren(
      progressMeter(summary.percent, name + 'の称号達成率'),
      ...(summary.total ? [node('small', summary.earned + ' / ' + summary.total + '個')] : []));
    card.querySelector('.math-unit-count').textContent = summary.games + 'ゲーム';
  }
}
function update() { decorateCards(); renderHome(); renderCollection(); renderMathUnits(); }
function start() {
  if (!config.rankingsRetired) return;
  if(document.querySelector('#mathCards,[data-game-card]'))document.body.classList.add('title-collection-picker');
  update();
  if ((config.availabilityEnabled||config.visibilityGameIds?.length) && window.ManabiPublicSettings) {
    for (const game of catalog.filter(g=>config.availabilityEnabled||config.visibilityGameIds?.includes(g.id))) {
      Promise.resolve(window.ManabiPublicSettings.subscribeGame(game.id, snapshot => {
        const productionTransform = game.id === 'fractionTransform' && config.mode === 'production';
        const fromCache = snapshot?.metadata?.fromCache === true;
        const metalHeat = game.id === 'metalHeat';
        if (metalHeat && (fromCache || snapshot?.exists?.() === false)) {
          statuses.set(game.id, fromCache ? 'checking' : 'hidden');
          update();
          return;
        }
        if (fromCache && !productionTransform) return;
        const setting = !fromCache && snapshot?.exists?.() ? snapshot.data() : null;
        if (productionTransform && setting?.status !== 'published') {
          statuses.set(game.id, 'unknown');
          update();
          return;
        }
        const value = metalHeat
          ? (['published', 'preparing', 'hidden'].includes(setting?.status) ? setting.status : 'unknown')
          : setting?.status || (setting?.published === false ? 'hidden' : setting?.published === true ? 'published' : 'unknown');
        statuses.set(game.id, value); update();
      }, () => { statuses.set(game.id, 'unknown'); update(); })).then(stop => activeBindings.push(stop))
        .catch(() => { statuses.set(game.id, 'unknown'); update(); });
    }
  }
  for (const event of ['storage', 'manabi-economy-change', 'manabi-profile-change', 'pageshow']) window.addEventListener(event, update);
  window.addEventListener('pagehide', event => { if(!event.persisted)activeBindings.splice(0).forEach(stop => stop?.()); });
  window.ManabiTitleCollection = { refresh: update, snapshot: view };
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
