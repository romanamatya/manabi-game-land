window.ManabiSummaryManagement={async ready(){
 const c=window.MANABI_BACKEND_CONFIG,normal={multiplier:1,cap:50};
 window.ManabiSummaryAvailability=true;window.ManabiSummaryPolicy=normal;
 if(c?.availabilityEnabled!==true&&c?.campaignsEnabled!==true)return {published:true,pending:false,policy:normal};
 const project=c.mode==='preview'?'manabi-game-landcheck':'manabi-game-land';
 if(c.firebase?.projectId!==project||c.expectedProjectId!==project)throw Error('environment-project-mismatch');
 const [A,Auth,F]=await Promise.all(['app.js','auth.js','firestore.js'].map(n=>import('https://www.gstatic.com/firebasejs/13.1.0/firebase-'+n)));
 const app=A.getApps().find(a=>a.name==='[DEFAULT]')||A.initializeApp(c.firebase),auth=Auth.getAuth(app);await auth.authStateReady();if(!auth.currentUser)await Auth.signInAnonymously(auth);
 const db=F.getFirestore(app),ref=F.doc(db,'productionAdmin/v1/gameSettings/keisanSummary');
 function parse(value){const status=value.status||(value.published===false?'hidden':'published'),campaign=value.campaign,now=Date.now(),live=c.campaignsEnabled===true&&campaign?.enabled===true&&Number.isSafeInteger(campaign.startAt)&&Number.isSafeInteger(campaign.endAt)&&campaign.startAt<=now&&now<campaign.endAt;return {published:c.availabilityEnabled!==true||status==='published',policy:live?{multiplier:2,cap:50,campaignId:campaign.id}:normal}}
 const snap=await F.getDocFromServer(ref);let value=snap.exists()?snap.data():{},online=true;
 function apply(){const s=parse(value);window.ManabiSummaryAvailability=online&&s.published;window.ManabiSummaryPolicy=s.policy;window.dispatchEvent(new CustomEvent('manabi-summary-settings',{detail:{...s,connected:online}}))}
 F.onSnapshot(ref,{includeMetadataChanges:true},s=>{online=!s.metadata.fromCache;value=s.exists()?s.data():{};apply()},()=>{online=false;apply()});window.addEventListener('offline',()=>{online=false;apply()});return parse(value)
}};
