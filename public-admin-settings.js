// Public client guards. Effective only after the matching public-read Rules and
// release flags are approved. This is a UI guard, not authorization for legacy clients.
(()=>{
 const cfg=window.MANABI_BACKEND_CONFIG;if(!cfg)return;
 const games=['keisan','pref-name','pref-place','alphabet','distribution','distribution2','exchangeAssociation','kotowaza','multiplicationProperties','shapeExpressions','keisanSummary'];
 const settingsRoot=cfg.environment==='productionAdmin/v1'?'productionAdmin/v1':cfg.environment==='previewSpark/v1'?'previewSpark/v1':null;
 let dbPromise;
 async function db(){
  if(dbPromise)return dbPromise;
  dbPromise=(async()=>{
   const [App,A,F]=await Promise.all(['app','auth','firestore'].map(n=>import('https://www.gstatic.com/firebasejs/13.1.0/firebase-'+n+'.js')));
   const app=App.getApps().find(a=>a.name==='[DEFAULT]')||App.initializeApp(cfg.firebase),auth=A.getAuth(app);
   await auth.authStateReady();if(!auth.currentUser)await A.signInAnonymously(auth);
   return {F,db:F.getFirestore(app)};
  })();return dbPromise;
 }
 async function read(collection,id){
  if(!settingsRoot)throw Error('settings-environment-unavailable');
  const {F,db}=await db(),snapshot=await F.getDocFromServer(F.doc(db,settingsRoot+'/'+collection+'/'+id));
  return snapshot.exists()?snapshot.data():null;
 }
 window.ManabiPublicSettings=Object.freeze({
  availabilityEnabled:cfg.availabilityEnabled===true,
  subscribeGame(id,onValue,onError){
   if(!settingsRoot||!games.includes(id))return Promise.reject(Error('game-settings-unavailable'));
   return db().then(({F,db})=>F.onSnapshot(F.doc(db,settingsRoot+'/gameSettings/'+id),{includeMetadataChanges:true},onValue,onError));
  }
 });
 function block(message){
  document.body.replaceChildren(Object.assign(document.createElement('main'),{innerHTML:''}));
  const main=document.body.firstChild;main.style='max-width:680px;margin:12vh auto;padding:2rem;font:18px system-ui';
  const h=document.createElement('h1'),p=document.createElement('p');h.textContent='このゲームは現在利用できません';p.textContent=message;main.append(h,p);
 }
 const gameId=location.pathname.match(/(?:^|\/)games\/([^/]+)\.html$/)?.[1],gated=cfg.availabilityEnabled===true&&games.includes(gameId);
 if(gated){document.documentElement.inert=true;void read('gameSettings',gameId).then(s=>{
  const status=s?.status||(s?.published===false?'hidden':'published');
  if(status!=='published')block(status==='preparing'?'公開準備中です。公開までお待ちください。':'現在、このゲームは公開されていません。');
  else document.documentElement.inert=false;
 }).catch(()=>block('公開状態を確認できないため、ゲームを開始できません。時間をおいて再読み込みしてください。'));}
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
