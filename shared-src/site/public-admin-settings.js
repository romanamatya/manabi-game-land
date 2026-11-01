// Public client guards. Effective only after the matching public-read Rules and
// release flags are approved. This is a UI guard, not authorization for legacy clients.
(()=>{
 const cfg=window.MANABI_BACKEND_CONFIG;if(!cfg)return;
 const games=['keisan','pref-name','pref-place','alphabet','distribution','distribution2','exchangeAssociation','kotowaza','multiplicationProperties','shapeExpressions','keisanSummary'];
 const settingsRoot=cfg.environment==='productionAdmin/v1'?'productionAdmin/v1':cfg.environment==='previewSpark/v1'?'previewSpark/v1':null;
 let dbPromise,dbGeneration=0;
 async function db(){
  if(dbPromise)return dbPromise;
  const generation=++dbGeneration;
  dbPromise=(async()=>{
   const [App,A,F]=await Promise.all(['app','auth','firestore'].map(n=>import('https://www.gstatic.com/firebasejs/13.1.0/firebase-'+n+'.js')));
   const app=App.getApps().find(a=>a.name==='[DEFAULT]')||App.initializeApp(cfg.firebase),auth=A.getAuth(app);
   await auth.authStateReady();if(!auth.currentUser)await A.signInAnonymously(auth);
   return {F,db:F.getFirestore(app)};
  })().catch(error=>{if(generation===dbGeneration)dbPromise=null;throw error;});return dbPromise;
 }
 function resetDb(){dbGeneration++;dbPromise=null;}
 async function read(collection,id){
  if(!settingsRoot)throw Error('settings-environment-unavailable');
  const {F,db}=await db(),snapshot=await F.getDocFromServer(F.doc(db,settingsRoot+'/'+collection+'/'+id));
  return snapshot.exists()?snapshot.data():null;
 }
 window.ManabiPublicSettings=Object.freeze({
  availabilityEnabled:cfg.availabilityEnabled===true,
  reset:resetDb,
  subscribeGame(id,onValue,onError){
   if(!settingsRoot||!games.includes(id))return Promise.reject(Error('game-settings-unavailable'));
   return db().then(({F,db})=>F.onSnapshot(F.doc(db,settingsRoot+'/gameSettings/'+id),{includeMetadataChanges:true},onValue,onError));
  }
 });
 const gameId=location.pathname.match(/(?:^|\/)games\/([^/]+)\.html$/)?.[1],gated=cfg.availabilityEnabled===true&&games.includes(gameId);
 if(gated){
  const readGameSetting=()=>read('gameSettings',gameId);
  if(window.ManabiGameAvailability?.create){const reset=()=>window.ManabiPublicSettings?.reset?.();void window.ManabiGameAvailability.create(document).check(readGameSetting,{onTimeout:reset,onError:reset});}
  else{
   const deny=e=>{const t=e.target,c=t?.closest?.('button,input,select,textarea,[role="button"]');if(!c||c.closest?.('a[href],header,nav,aside,#challenge120Gate,#challenge120Status,#publicGameAccessStatus,[data-profile-panel]')||!c.closest?.('main,.layout,.play,[data-game-area]'))return;e.preventDefault();e.stopImmediatePropagation();};
   for(const type of ['click','pointerdown','keydown','submit'])document.addEventListener(type,deny,true);
   const showUnavailable=()=>{if(!document.body)return;let n=document.getElementById('publicGameAccessStatus');if(!n){n=document.createElement('section');n.id='publicGameAccessStatus';n.setAttribute('role','status');document.body.insertBefore(n,document.body.firstChild);}n.textContent='公開状態を確認できません。ゲームは開始できません。前の画面に戻るか、ページを再読み込みしてください。';};
   if(document.body)showUnavailable();else document.addEventListener('DOMContentLoaded',showUnavailable,{once:true});
  }
 }
 if(cfg.availabilityEnabled===true){
  const guardLinks=()=>{
   const gameOf=a=>new URL(a.href,location.href).pathname.match(/(?:^|\/)games\/([^/]+)\.html$/)?.[1];
   const anchors=[...document.querySelectorAll('a[href]')].filter(a=>games.includes(gameOf(a)));
   if(!anchors.length)return;
   const ids=[...new Set(anchors.map(gameOf))];let ready=false,hidden=new Set();
   document.addEventListener('click',e=>{
    const a=e.target.closest?.('a[href]');if(!a)return;const id=gameOf(a);
    if(games.includes(id)&&(!ready||hidden.has(id))){e.preventDefault();e.stopImmediatePropagation();if(ready)alert('このゲームは現在利用できません。');}
   },true);
   void Promise.all(ids.map(async id=>[id,await read('gameSettings',id)])).then(settings=>{
    hidden=new Set(settings.filter(([,s])=>{const status=s?.status||(s?.published===false?'hidden':'published');return status!=='published'}).map(([id])=>id));ready=true;
    for(const a of anchors){if(hidden.has(gameOf(a))){a.setAttribute('aria-disabled','true');a.classList.add('game-unavailable');}}
   }).catch(()=>{hidden=new Set(ids);ready=true;for(const a of anchors){a.setAttribute('aria-disabled','true');a.classList.add('game-unavailable');}});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',guardLinks,{once:true});else guardLinks();
 }
 if(cfg.announcementsEnabled===true)void read('notices','current').then(s=>{
  const host=document.getElementById('homeAnnouncement');if(!host)return;
  if(!s?.published||s.deleted){host.hidden=true;return}
  host.hidden=false;const title=document.createElement('h2'),body=document.createElement('p');title.textContent=s.title||'お知らせ';body.textContent=s.body||'';host.replaceChildren(title,body);
 }).catch(()=>{});
})();
