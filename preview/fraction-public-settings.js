(() => {
 const config = window.MANABI_BACKEND_CONFIG;
 const original = window.ManabiPublicSettings;
 if (!original || config.mode !== 'preview' || config.expectedProjectId !== 'manabi-game-landcheck'
     || !config.staticLocalGameIds?.includes('fractionBasics')) return;
 const localReview = !config.managedVisibilityGameIds?.includes('fractionBasics');
 window.ManabiPublicSettings = Object.freeze({
  ...original,
  async subscribeGame(id, onValue, onError) {
   if (id !== 'fractionBasics') return original.subscribeGame(id, onValue, onError);
   if (localReview) {
    onValue({exists: () => true, data: () => ({status: 'published'})});
    return () => {};
   }
   const {F, db} = await window.ManabiFirebaseSession.open(config.firebase);
   const target = F.doc(db, 'previewSpark/v1/gameSettings/fractionBasics');
   return F.onSnapshot(target, {includeMetadataChanges: true}, onValue, onError);
  },
 });
})();
