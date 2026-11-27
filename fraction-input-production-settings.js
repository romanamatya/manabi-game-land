(() => {
  const config = window.MANABI_BACKEND_CONFIG;
  const settings = window.ManabiPublicSettings;
  const game = 'fractionTransformInput';
  if (!settings || config?.mode !== 'production' || config.expectedProjectId !== 'manabi-game-land'
      || !config.managedVisibilityGameIds?.includes(game)) return;

  window.ManabiPublicSettings = Object.freeze({
    ...settings,
    async subscribeGame(id, receive, reject) {
      if (id !== game) return settings.subscribeGame(id, receive, reject);
      const { F, db } = await window.ManabiFirebaseSession.open(config.firebase);
      const target = F.doc(db, 'productionAdmin/v1/gameSettings/' + game);
      return F.onSnapshot(target, { includeMetadataChanges: true }, receive, reject);
    },
  });
})();
