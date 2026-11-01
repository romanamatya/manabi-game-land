import test from 'node:test';
import assert from 'node:assert/strict';
import {createFirebaseSession} from '../public-firebase-session-core.js';

const config={projectId:'manabi-game-land'};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('concurrent availability and campaign reads share one anonymous-auth bootstrap',async()=>{
 let loadCount=0,readyCount=0,signInCount=0,resolveReady;
 const app={name:'[DEFAULT]',options:{projectId:config.projectId}};
 const modules=[
  {getApps:()=>[app],initializeApp:()=>{throw Error('should-reuse-default-app')}},
  {getAuth:()=>({currentUser:null,authStateReady(){readyCount++;return new Promise(resolve=>{resolveReady=resolve})}}),signInAnonymously:async()=>{signInCount++}},
  {getFirestore:()=>({database:'shared'})}
 ];
 const open=createFirebaseSession(async()=>{loadCount++;return modules});
 const first=open(config),second=open(config);
 await tick();
 assert.equal(loadCount,1);
 assert.equal(readyCount,1);
 assert.equal(signInCount,0);
 resolveReady();
 const [a,b]=await Promise.all([first,second]);
 assert.equal(signInCount,1);
 assert.equal(a,b);
 assert.equal(a.db.database,'shared');
});

test('a failed auth bootstrap clears the rejected promise so an explicit retry can recover',async()=>{
 let loadCount=0,signInCount=0;
 const app={name:'[DEFAULT]',options:{projectId:config.projectId}};
 const open=createFirebaseSession(async()=>{
  loadCount++;
  return [
   {getApps:()=>[app]},
   {getAuth:()=>({currentUser:null,authStateReady:async()=>{}}),signInAnonymously:async()=>{signInCount++;if(signInCount===1)throw Object.assign(Error('network'),{code:'auth/network-request-failed'})}},
   {getFirestore:()=>({})}
  ];
 });
 await assert.rejects(open(config),/network/);
 const recovered=await open(config);
 assert.ok(recovered.db);
 assert.equal(loadCount,2);
 assert.equal(signInCount,2);
});

test('an existing authenticated session is reused without creating another anonymous identity',async()=>{
 let signInCount=0;
 const app={name:'[DEFAULT]',options:{projectId:config.projectId}};
 const open=createFirebaseSession(async()=>[
  {getApps:()=>[app]},
  {getAuth:()=>({currentUser:{uid:'existing-session'},authStateReady:async()=>{}}),signInAnonymously:async()=>{signInCount++}},
  {getFirestore:()=>({})}
 ]);
 await open(config);
 assert.equal(signInCount,0);
});

test('a Firebase app for another project is rejected before Firestore access',async()=>{
 let firestoreCount=0;
 const open=createFirebaseSession(async()=>[
  {getApps:()=>[{name:'[DEFAULT]',options:{projectId:'manabi-game-landcheck'}}]},
  {getAuth:()=>{throw Error('auth must not be opened')}},
  {getFirestore:()=>{firestoreCount++;return {}}}
 ]);
 await assert.rejects(open(config),/firebase-project-mismatch/);
 assert.equal(firestoreCount,0);
});
