// Public client guards. Effective only after the matching public-read Rules and
// release flags are approved. This is a UI guard, not authorization for legacy clients.
(()=>{
 const cfg=window.MANABI_BACKEND_CONFIG;if(!cfg)return;
 const games=['keisan','pref-name','pref-place','alphabet','missingAlphabet','distribution','distribution2','exchangeAssociation','kotowaza','multiplicationProperties','shapeExpressions','keisanSummary','parallelPair','suichoku','verticalParallel','quadrilateral'];
 const settingsRoot=cfg.environment==='productionAdmin/v1'?'productionAdmin/v1':cfg.environment==='previewSpark/v1'?'previewSpark/v1':null;
 const staticLocalGames=new Set(cfg.staticLocalGameIds||[]);
 const staticPublished=id=>staticLocalGames.has(id);
 const staticSnapshot={exists:()=>true,data:()=>({status:'published'}),metadata:{fromCache:false}};
 function gameAvailabilityStatus(setting){
  if(!setting)return 'unknown';
  if(['published','preparing','hidden'].includes(setting.status))return setting.status;
  if(setting.published===true)return 'published';
  if(setting.published===false)return 'hidden';
  return 'unknown';
 }
 let dbPromise,dbGeneration=0;
 async function db(){
  if(dbPromise)return dbPromise;
  const generation=++dbGeneration;
  dbPromise=Promise.resolve().then(()=>{
   if(!window.ManabiFirebaseSession?.open)throw Error('firebase-session-unavailable');
   return window.ManabiFirebaseSession.open(cfg.firebase);
  }).catch(error=>{if(generation===dbGeneration)dbPromise=null;throw error;});return dbPromise;
 }
 function resetDb(){dbGeneration++;dbPromise=null;}
 async function read(collection,id){
  if(!settingsRoot)throw Error('settings-environment-unavailable');
  const session=await db(),snapshot=await session.F.getDocFromServer(session.F.doc(session.db,settingsRoot+'/'+collection+'/'+id));
  return snapshot.exists()?snapshot.data():null;
 }
 window.ManabiPublicSettings=Object.freeze({
  availabilityEnabled:cfg.availabilityEnabled===true,
  reset:resetDb,
  subscribeGame(id,onValue,onError){
   if(!settingsRoot||!games.includes(id))return Promise.reject(Error('game-settings-unavailable'));
   if(staticPublished(id)){onValue(staticSnapshot);return Promise.resolve(()=>{});}
   return db().then(({F,db})=>F.onSnapshot(F.doc(db,settingsRoot+'/gameSettings/'+id),{includeMetadataChanges:true},onValue,onError));
  }
 });
 const gameId=location.pathname.match(/(?:^|\/)games\/([^/]+)\.html$/)?.[1],gated=cfg.availabilityEnabled===true&&games.includes(gameId)&&!staticPublished(gameId);
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
   const ids=[...new Set(anchors.map(gameOf))],statuses=new Map(ids.map(id=>[id,staticPublished(id)?'published':'checking']));
   document.addEventListener('click',e=>{
    const a=e.target.closest?.('a[href]');if(!a)return;const id=gameOf(a);
    const status=statuses.get(id);
    if(games.includes(id)&&status!=='published'){e.preventDefault();e.stopImmediatePropagation();if(status!=='checking')alert(status==='hidden'?'このゲームは現在非公開です。':status==='preparing'?'このゲームは公開準備中です。':'公開状態を確認できないため、このゲームは開始できません。');}
   },true);
   const mark=(id,status)=>{statuses.set(id,status);if(status!=='published')for(const a of anchors.filter(item=>gameOf(item)===id)){a.setAttribute('aria-disabled','true');a.classList.add('game-unavailable');}};
   for(const id of ids)if(!staticPublished(id))void read('gameSettings',id).then(setting=>mark(id,gameAvailabilityStatus(setting)),()=>mark(id,'unknown'));
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',guardLinks,{once:true});else guardLinks();
 }
 if(cfg.announcementsEnabled===true)void Promise.resolve().then(()=>{
  const host=document.getElementById('homeAnnouncement');if(!host)return null;
  return read('notices','current').then(s=>({host,s}));
 }).then(result=>{if(!result)return;const {host,s}=result;
  if(!s?.published||s.deleted){host.hidden=true;return}
  host.hidden=false;const title=document.createElement('h2'),body=document.createElement('p');title.textContent=s.title||'お知らせ';body.textContent=s.body||'';host.replaceChildren(title,body);
 }).catch(()=>{});
})();

