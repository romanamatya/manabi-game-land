// Explicit admin operations for the proposed registry Rules. Never invoked by the CLI
// generator, site load or CI. The caller must use the existing administrator's authenticated Firebase client session.
const fields=['id','name','subject','unit','entry','enabled','manifestSHA256'];
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const equal=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
export function createRegistrationStore(F,db){
 const root='productionAdmin/v1';
 const doc=(collection,id)=>F.doc(db,root+'/'+collection+'/'+id);
 async function audited(user,collection,id,action,next){
  if(!user?.uid)throw Error('admin-session-required');
  const target=doc(collection,id),audit=F.doc(F.collection(db,root+'/managementAudit')),backup=F.doc(F.collection(db,root+'/managementBackups'));
  const before=await F.runTransaction(db,async tx=>{
   const snap=await tx.get(target),previous=snap.exists()?snap.data():null,at=F.serverTimestamp();
   tx.set(backup,{id:backup.id,actor:user.uid,at,action,targets:[target.path],before:[previous],reason:'ゲーム共通登録からの個別操作',auditId:audit.id});
   tx.set(audit,{id:audit.id,actor:user.uid,at,action,targets:[target.path],before:[previous],after:[next],reason:'ゲーム共通登録からの個別操作',backupId:backup.id});
   return previous;
  });
  await F.runTransaction(db,async tx=>{
   const current=await tx.get(target),value=current.exists()?current.data():null;
   if(!equal(before,value))throw Error('registration-target-changed-after-backup');
   tx.set(target,{...before,...next,updatedAt:F.serverTimestamp(),lastAudit:audit.id,lastBackup:backup.id});
  });
  return {path:target.path,auditId:audit.id,backupId:backup.id};
 }
 return {
  async register(user,registration){
   if(!registration||Object.keys(registration).length!==fields.length||fields.some(key=>!Object.hasOwn(registration,key)))throw Error('invalid-registration-fields');
   return audited(user,'gameRegistry',registration.id,'registerGame',registration);
  },
  async setVisibility(user,id,status){
   if(!/^[a-zA-Z][a-zA-Z0-9-]{0,63}$/.test(id)||!['preparing','published','hidden'].includes(status))throw Error('invalid-registered-visibility');
   return audited(user,'gameSettings',id,'visibility',{status});
  },
 };
}
