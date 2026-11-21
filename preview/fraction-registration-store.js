// Registration and visibility each commit their audit and exact before-image atomically.
export function createRegistrationStore(F, db, mode = 'production') {
 const root = {preview: 'previewSpark/v1', production: 'productionAdmin/v1'}[mode];
 if (!root) throw Error('invalid-registration-environment');
 const doc = (group, id) => F.doc(db, root + '/' + group + '/' + id);
 const idOK = id => typeof id === 'string' && /^[a-zA-Z][a-zA-Z0-9-]{0,63}$/.test(id);
 async function write(user, group, id, next) {
  if (!user?.uid || !idOK(id)) throw Error('invalid-registration-operation');
  const target = doc(group, id);
  const audit = F.doc(F.collection(db, root + '/registrationAudit'));
  return F.runTransaction(db, async tx => {
   const snap = await tx.get(target);
   const before = snap.exists() ? snap.data() : null;
   if (group === 'gameSettings' && !before && next.status === 'published') throw Error('prepare-before-publish');
   const at = F.serverTimestamp();
   const after = {...before, ...next, updatedAt: at, lastAudit: audit.id};
   tx.set(audit, {actor: user.uid, at, group, gameId: id, before, after});
   tx.set(target, after);
   return {path: target.path, auditId: audit.id, backupId: audit.id};
  });
 }
 return {
  register: (user, game) => write(user, 'gameRegistry', game.id, game),
  setVisibility(user, id, status) {
   if (!['preparing', 'published', 'hidden'].includes(status)) throw Error('invalid-registered-visibility');
   return write(user, 'gameSettings', id, {status});
  },
  async status(id) {
   if (!idOK(id)) throw Error('invalid-registration-operation');
   const registry = await F.getDocFromServer(doc('gameRegistry', id));
   if (!registry.exists()) return {registered: false, status: 'unknown'};
   const settings = await F.getDocFromServer(doc('gameSettings', id));
   return {registered: registry.data().enabled === true, status: settings.data()?.status || 'unknown'};
  },
 };
}
