(()=>{
 'use strict';
 let brokerPromise=null;
 const scriptURL=document.currentScript?.src||location.href;
 const moduleURLs=['app','auth','firestore'].map(name=>'https://www.gstatic.com/firebasejs/13.1.0/firebase-'+name+'.js');
 function broker(){
  if(!brokerPromise){
   const coreURL=new URL('public-firebase-session-core.js',scriptURL);coreURL.searchParams.set('v','firebase-session-core-v1');
   const pending=import(coreURL.href).then(({createFirebaseSession})=>createFirebaseSession(()=>Promise.all(moduleURLs.map(url=>import(url)))));
   const wrapped=pending.catch(error=>{if(brokerPromise===wrapped)brokerPromise=null;throw error;});
   brokerPromise=wrapped;
  }
  return brokerPromise;
 }
 window.ManabiFirebaseSession=Object.freeze({open(firebaseConfig){return broker().then(open=>open(firebaseConfig));}});
})();
