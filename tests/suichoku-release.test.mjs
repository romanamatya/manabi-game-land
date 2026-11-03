import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {validateEnvironment,backendConfig} from '../tools/site-environment.mjs';
const read=file=>fs.readFileSync(new URL(file,import.meta.url),'utf8');

test('explicit static local game release is published without Firebase reads or managed-game changes',async()=>{
 const production=JSON.parse(read('../environments/production.json'));
 const config=backendConfig(validateEnvironment(production));
 assert.deepEqual(config.staticLocalGameIds,['suichoku']);
 assert.ok(!config.gameIds.includes('suichoku'));
 assert.ok(!config.rankingGameIds.includes('suichoku'));
 const root=read('../environment.js');assert.match(root,/staticLocalGameIds.*suichoku/);
 let firebaseOpens=0,availabilityChecks=0;const window={MANABI_BACKEND_CONFIG:{...config,environment:'productionAdmin/v1',availabilityEnabled:true,announcementsEnabled:true},ManabiFirebaseSession:{open:async()=>{firebaseOpens++;throw Error('must not connect')}},ManabiGameAvailability:{create(){availabilityChecks++;throw Error('static game must bypass Firestore gate')}}};
 const document={readyState:'complete',querySelectorAll:()=>[],getElementById:()=>null,addEventListener(){}};
 const location={pathname:'/manabi-game-land/games/suichoku.html',href:'https://romanamatya.github.io/manabi-game-land/games/suichoku.html'};
 vm.runInNewContext(read('../public-admin-settings.js'),{window,document,location,URL,Promise,Map,Set,Error,console});
 let received;await window.ManabiPublicSettings.subscribeGame('suichoku',snapshot=>received=snapshot);
 assert.equal(received.exists(),true);assert.equal(received.data().status,'published');await Promise.resolve();
 assert.equal(firebaseOpens,0);assert.equal(availabilityChecks,0);
});

test('static local release allowlist rejects any other game id',()=>{
 const c=JSON.parse(read('../environments/production.json'));
 assert.throws(()=>validateEnvironment({...c,staticLocalGameIds:['suichoku','keisan']}),/invalid-static-local-game-release/);
});
