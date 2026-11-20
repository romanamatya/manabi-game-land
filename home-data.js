export function startProductionHome(storage) {
 const byId = id => document.getElementById(id);
 function show() {
  const name = storage.getItem('mgl_nickname') || '';
  byId('playerWelcome').hidden = Boolean(name);
  byId('playerReady').hidden = !name;
  byId('playerName').textContent = name;
 }
 byId('playerForm').onsubmit = event => {
  event.preventDefault();
  const name = byId('nickname').value.trim();
  if (!/^[^<>\r\n]{1,12}$/.test(name)) return;
  storage.setItem('mgl_nickname', name);
  show();
  window.dispatchEvent(new Event('manabi-profile-change'));
 };
 window.addEventListener('manabi-nickname-sync', show);
 show();
 byId('syncStatus').textContent = '名前と学習記録はこの端末に保存されます。';
 if (storage.getItem('mgl_nickname')) void refreshNickname();
 async function refreshNickname() {
  const config = window.MANABI_BACKEND_CONFIG;
  if (!config.playerNameSyncEnabled || new URL(location.href).searchParams.has('adminTest')) return;
  try {
   const {F, db, uid} = await window.ManabiFirebaseSession.open(config.firebase);
   if (!uid) return;
   const profile = await F.getDocFromServer(F.doc(db, 'players', uid));
   const name = profile.exists() ? profile.data()?.nickname : null;
   if (typeof name !== 'string' || !/^[^<>\r\n]{1,12}$/.test(name) || name !== name.trim() || name === storage.getItem('mgl_nickname')) return;
   storage.setItem('mgl_nickname', name);
   document.dispatchEvent(new Event('manabi-nickname-sync'));
   window.dispatchEvent(new Event('manabi-nickname-sync'));
  } catch {}
 }
}
