import { subjects, geometryGames, gameProgress, collectionProgress } from './title-progress-model.js?v=e810582d0e6d';

const storage = window.manabiStorage;
const catalog = window.ManabiProfileCatalog || [];
const config = window.MANABI_BACKEND_CONFIG || {};
const subjectMap = window.ManabiEconomyCore?.games || {};
const statuses = new Map(catalog.map(game => [game.id, (config.availabilityEnabled||config.visibilityGameIds?.includes(game.id)) ? 'checking' : 'published']));
const activeBindings = [];
let subject = new URL(location.href).searchParams.get('subject') || 'math';
let selectedGame = new URL(location.href).searchParams.get('game');
let pageIndex = 0;
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
  const badge = window.ManabiIdentity?.badge(title.id, size);
  if (badge) wrap.append(badge);
  else wrap.append(node('span', title.name, 'mq-title-text-only'));
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
    if (status === 'hidden'||status === 'preparing') card.hidden = true;
    else if (card.dataset.collectionPageHidden !== 'true') card.hidden = false;
    const play = card.querySelector('[data-game-play]');
    if (play) { play.disabled = status !== 'published'; play.textContent = status === 'published' ? 'プレイ' : '確認中'; }
  }
  paginate();
  renderNewBadge();
}
function paginate() {
  const cards = [...document.querySelectorAll('[data-game-card]')];
  if (!cards.length) return;
  const visible = cards.filter(card => !['hidden','preparing'].includes(statuses.get(card.dataset.gameCard)));
  const top = Math.max(100, cards[0].getBoundingClientRect().top + window.scrollY);
  const capacity = Math.max(2, Math.floor((window.innerHeight - top - 66) / 88));
  const pages = Math.max(1, Math.ceil(visible.length / capacity));
  pageIndex = Math.min(pageIndex, pages - 1);
  for (const card of cards) {
    const index = visible.indexOf(card);
    const hidden = index < 0 || Math.floor(index / capacity) !== pageIndex;
    card.hidden = hidden; card.dataset.collectionPageHidden = String(hidden);
  }
  let pager = document.getElementById('collectionPager');
  if (!pager) { pager = node('nav', undefined, 'collection-pager'); pager.id = 'collectionPager';
    pager.setAttribute('aria-label', 'ゲーム一覧のページ'); cards[0].parentElement.after(pager); }
  pager.replaceChildren(); pager.hidden = pages === 1;
  for (const [text, delta] of [['前へ', -1], ['次へ', 1]]) {
    const button = node('button', text); button.type = 'button';
    button.disabled = pageIndex + delta < 0 || pageIndex + delta >= pages;
    button.onclick = () => { pageIndex += delta; paginate(); };
    pager.append(button);
    if (delta === -1) pager.append(node('span', (pageIndex + 1) + ' / ' + pages));
  }
}
function renderHome() {
  const host = document.getElementById('titleCollectionHome');
  if (!host) return;
  const result = view(), overall = result.overall;
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
  const id = config.latestGameId;
  if (!id || statuses.get(id) !== 'published') return;
  const game = catalog.find(game => game.id === id);
  if (!game) return;
  const subjectId = game.subject || subjectMap[id];
  const unit = geometryGames.includes(id) ? 'geometry' : 'calculation';
  for (const card of document.querySelectorAll('[data-subject-card],[data-unit-games],[data-game-card]')) {
    const matches = card.dataset.gameCard === id || card.dataset.subjectCard === subjectId
      || (subjectId === 'math' && card.dataset.unitId === unit);
    if (matches) { const badge = node('span', 'NEW', 'new-game-badge'); card.classList.add('has-new-game'); card.append(badge); }
  }
}
function update() { decorateCards(); renderHome(); renderCollection(); }
function start() {
  if (!config.rankingsRetired) return;
  if(document.querySelector('#mathCards,[data-game-card]'))document.body.classList.add('title-collection-picker');
  update();
  if ((config.availabilityEnabled||config.visibilityGameIds?.length) && window.ManabiPublicSettings) {
    for (const game of catalog.filter(g=>config.availabilityEnabled||config.visibilityGameIds?.includes(g.id))) {
      Promise.resolve(window.ManabiPublicSettings.subscribeGame(game.id, snapshot => {
        if (snapshot?.metadata?.fromCache) return;
        const setting = snapshot?.exists?.() ? snapshot.data() : null;
        const value = setting?.status || (setting?.published === false ? 'hidden' : setting?.published === true ? 'published' : 'unknown');
        statuses.set(game.id, value); update();
      }, () => { statuses.set(game.id, 'unknown'); update(); })).then(stop => activeBindings.push(stop))
        .catch(() => { statuses.set(game.id, 'unknown'); update(); });
    }
  }
  for (const event of ['storage', 'manabi-economy-change', 'manabi-profile-change', 'pageshow']) window.addEventListener(event, update);
  window.addEventListener('resize', paginate);
  window.addEventListener('pagehide', event => { if(!event.persisted)activeBindings.splice(0).forEach(stop => stop?.()); });
  window.ManabiTitleCollection = { refresh: update, snapshot: view };
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
