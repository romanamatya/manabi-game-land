import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
globalThis.window={};
const {validateConfig}=await import('../../spark-auth.js?config-test');
const make=(projectId='manabi-game-landcheck')=>({mode:'preview',enabled:true,environment:'previewSpark/v1',expectedProjectId:projectId,firebase:{projectId,authDomain:projectId+'.firebaseapp.com',apiKey:'test-public-api-key',appId:'test-web-app-id'}});
test('explicitly approved check project is accepted without preview in its ID',()=>assert.doesNotThrow(()=>validateConfig(make())));
test('production remains rejected even with matching expected ID and domain',()=>assert.throws(()=>validateConfig(make('manabi-game-land'))));
test('unapproved projects are rejected even if their IDs contain preview',()=>assert.throws(()=>validateConfig(make('another-preview'))));
test('wrong environment, project ID, domain and production credentials are rejected',()=>{
 for(const c of [
  {...make(),environment:'production'},
  {...make(),expectedProjectId:'another-project'},
  {...make(),firebase:{...make().firebase,authDomain:'manabi-game-land.firebaseapp.com'}},
 ])assert.throws(()=>validateConfig(c));
});
test('missing public configuration and disabled config fail closed',()=>{
 assert.throws(()=>validateConfig({...make(),enabled:false}));
 for(const key of ['apiKey','appId'])assert.throws(()=>validateConfig({...make(),firebase:{...make().firebase,[key]:''}}));
});
