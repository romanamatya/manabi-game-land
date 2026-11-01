export function createFirebaseSession(loadModules){
 let sessionPromise=null;
 return function open(firebaseConfig){
  if(sessionPromise)return sessionPromise;
  sessionPromise=(async()=>{
   if(!firebaseConfig?.projectId)throw Error('firebase-config-unavailable');
   const [App,A,F]=await loadModules();
   const app=App.getApps().find(candidate=>candidate.name==='[DEFAULT]')||App.initializeApp(firebaseConfig);
   if(app.options?.projectId&&app.options.projectId!==firebaseConfig.projectId)throw Error('firebase-project-mismatch');
   const auth=A.getAuth(app);
   await auth.authStateReady();
   if(!auth.currentUser)await A.signInAnonymously(auth);
   return {F,db:F.getFirestore(app)};
  })().catch(error=>{sessionPromise=null;throw error;});
  return sessionPromise;
 };
}
