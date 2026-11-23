import { latestGameId } from './latest-game.js?v=fraction-transform-release-v1';
import { visibilityState } from './game-selection-model.js?v=availability-read-fix-20261102';

document.addEventListener('DOMContentLoaded', () => {
  if (window.MANABI_ENV?.environment !== 'production') return;

  const config = window.MANABI_BACKEND_CONFIG;
  if (!config?.gameIds?.includes(latestGameId) && !config?.staticLocalGameIds?.includes(latestGameId)) return;
  const game = window.ManabiProfileCatalog?.find(entry => entry.id === latestGameId);
  if (!game) return;

  const subject = game.subject || window.ManabiEconomyCore?.games[latestGameId];
  const targets = [
    ...Array.from(document.querySelectorAll('[data-subject-card]')).filter(card => card.dataset.subjectCard === subject),
    ...Array.from(document.querySelectorAll('[data-unit-games]')).filter(card => card.dataset.unitGames.split(/\s+/).includes(latestGameId)),
    ...Array.from(document.querySelectorAll('[data-game-card]')).filter(card => card.dataset.gameCard === latestGameId),
  ];
  const card = targets[0];
  const settings = window.ManabiPublicSettings;
  if (!card || !settings?.availabilityEnabled) return;

  let badge;
  function display(published) {
    if (published && !badge) {
      badge = document.createElement('span');
      badge.className = 'new-game-badge';
      badge.textContent = 'NEW';
      card.classList.add('has-new-game');
      card.append(badge);
    } else if (!published && badge) {
      badge.remove();
      badge = undefined;
      card.classList.remove('has-new-game');
    }
  }

  Promise.resolve().then(() => settings.subscribeGame(latestGameId, snapshot => {
    const setting = snapshot?.exists() ? snapshot.data() : null;
    display(visibilityState(setting, { fromCache: snapshot?.metadata?.fromCache === true }) === 'published');
  }, () => display(false))).catch(() => display(false));
});
