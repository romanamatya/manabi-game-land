const accessError=code=>Object.assign(new Error(code),{code});
export async function createPlayerAccess(config,[App,A,F]){
 if(config?.mode!=='production'||config?.expectedProjectId!=='manabi-game-land'||config?.firebase?.projectId!=='manabi-game-land'||config.accountAccessEnabled!==true)throw accessError('player-access-config-rejected');
 const app=App.getApps().find(x=>x.name==='[DEFAULT]')||App.initializeApp(config.firebase);
 if(app.options.projectId!=='manabi-game-land')throw accessError('production-project-rejected');
 const auth=A.getAuth(app);await A.setPersistence(auth,A.browserLocalPersistence);await auth.authStateReady();
 if(!auth.currentUser)await A.signInAnonymously(auth);
 if(!auth.currentUser?.isAnonymous)throw accessError('player-identity-required');
 const db=F.getFirestore(app),uid=auth.currentUser.uid,ref=F.doc(db,'players',uid);
 let unsubscribe=null;
 const result={uid,status:'checking',rankingLinked:false,updatedAt:null,error:null,canPlay(){return ['active','unlinked'].includes(this.status)},refresh(){return load()}};
 function apply(snapshot){
  if(snapshot.metadata?.fromCache)return;
  if(!snapshot.exists()){result.status='unlinked';result.rankingLinked=false;result.updatedAt=null;result.error=null;}
  else{const data=snapshot.data();result.status=data.accessStatus==='suspended'?'suspended':'active';result.rankingLinked=typeof data.rankingUid==='string'&&data.rankingUid.length>0;result.updatedAt=data.accessUpdatedAt?.toMillis?.()||null;result.error=null;}
  window.dispatchEvent(new CustomEvent('manabi-account-access',{detail:{status:result.status,rankingLinked:result.rankingLinked,uid}}));
 }
 async function load(){
  result.status='checking';result.error=null;window.dispatchEvent(new CustomEvent('manabi-account-access',{detail:{status:result.status,uid}}));
  try{const snapshot=await F.getDocFromServer(ref);apply(snapshot);unsubscribe?.();unsubscribe=F.onSnapshot(ref,{includeMetadataChanges:true},apply,fail);}
  catch(error){fail(error)}
  return result.status;
 }
 function fail(error){result.status='unavailable';result.error=error?.code||'status-read-failed';window.dispatchEvent(new CustomEvent('manabi-account-access',{detail:{status:result.status,uid,error:result.error}}));}
 await load();return result;
}
export async function browserPlayerAccess(config){const sdks=await Promise.all(['app','auth','firestore'].map(n=>import('https://www.gstatic.com/firebasejs/13.1.0/firebase-'+n+'.js')));return createPlayerAccess(config,sdks);}
