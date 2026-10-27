import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
globalThis.window={};
const {validateConfig}=await import('data:text/javascript;base64,'+Buffer.from(await readFile(new URL('../../spark-auth.js',import.meta.url),'utf8')).toString('base64'));
const make=(projectId='manabi-game-landcheck')=>({enabled:true,environment:'previewSpark/v1',expectedProjectId:projectId,firebase:{projectId,authDomain:projectId+'.firebaseapp.com',apiKey:'test-public-api-key',appId:'test-web-app-id'}});
test('explicitly approved check project is accepted without preview in its ID',()=>assert.doesNotThrow(()=>validateConfig(make())));
test('production remains rejected even with matching expected ID and domain',()=>assert.throws(()=>validateConfig(make('manabi-game-land')),{code:'production-project-rejected'}));
test('unapproved projects are rejected even if their IDs contain preview',()=>assert.throws(()=>validateConfig(make('another-preview')),{code:'production-project-rejected'}));
test('wrong environment, project ID, domain and production credentials are rejected',()=>{
 for(const c of [
  {...make(),environment:'production'},
  {...make(),expectedProjectId:'another-project'},
  {...make(),firebase:{...make().firebase,authDomain:'manabi-game-land.firebaseapp.com'}},
  {...make(),firebase:{...make().firebase,apiKey:'AIzaSyAhm6WMqV7yGmNRRDCeZcOk5HH-dlga9no'}},
  {...make(),firebase:{...make().firebase,appId:'1:723974836914:web:4e57af8336083f82a72fab'}}
 ])assert.throws(()=>validateConfig(c),{code:'production-project-rejected'});
});
test('missing public configuration and disabled config fail closed',()=>{
 assert.throws(()=>validateConfig({...make(),enabled:false}),{code:'backend-not-configured'});
 for(const key of ['apiKey','appId'])assert.throws(()=>validateConfig({...make(),firebase:{...make().firebase,[key]:''}}),{code:'backend-not-configured'});
});
