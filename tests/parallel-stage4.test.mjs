import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {prepareParallelRelease,parseConfig} from '../tools/prepare-parallel-release.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('selective candidate changes only new-game config and registrations; never deploys',async()=>{
 const output=await fs.mkdtemp(path.join(root,'.release-stage4-'));
 // Invalid destination is rejected before any production file can be written.
 await assert.rejects(prepareParallelRelease({root,output}),/inside-release/);await fs.rm(output,{recursive:true});
 const dest=path.join(root,'.release/stage4-test-'+process.pid);
 const before=await fs.readFile(path.join(root,'environment.js'),'utf8');
 try{
  const m=await prepareParallelRelease({root,output:dest});assert.equal(m.deployReady,false);assert.equal(m.rulesIncluded,false);assert.deepEqual(m.liveWrites,[]);
  const candidate=await fs.readFile(path.join(dest,'environment.js'),'utf8'),old=parseConfig(before).config;
  const window={};vm.runInNewContext(candidate,{window,location:{pathname:'/games/parallelPair.html'}});const next=JSON.parse(JSON.stringify(window.MANABI_BACKEND_CONFIG));
  assert.deepEqual(next.gameIds,[...old.gameIds,'parallelPair']);assert.deepEqual(next.rankingGameIds,[...old.rankingGameIds,'parallelPair']);assert.equal(next.parallelPairRankingEnabled,true);
  delete next.parallelPairRankingEnabled;next.gameIds.pop();next.rankingGameIds.pop();assert.deepEqual(next,old);
  assert.equal(await fs.readFile(path.join(root,'environment.js'),'utf8'),before);
  for(const name of ['public-admin-settings.js','management-model.js']){
   const changed=await fs.readFile(path.join(dest,name),'utf8');assert.equal(changed.replace("'keisanSummary','parallelPair'","'keisanSummary'"),await fs.readFile(path.join(root,name),'utf8'));
  }
  const html=await fs.readFile(path.join(dest,'games/parallelPair.html'),'utf8');assert.ok(html.indexOf('public-firebase-session.js')<html.indexOf('public-admin-settings.js'));assert.ok(html.indexOf('public-game-availability.js')<html.indexOf('public-admin-settings.js'));
  assert.equal(m.files.filter(f=>f.path.endsWith('.png')).length,5);assert.ok(m.files.every(f=>!f.path.includes('missingAlphabet')&&!f.path.includes('alphabet-missing')));
  for(const file of m.files){if(file.path.startsWith('assets/')||['parallel-model.js','parallel-local.js','parallel-game.js','parallel-ranking.js','parallel.css'].includes(file.path))assert.deepEqual(await fs.readFile(path.join(dest,file.path)),await fs.readFile(path.join(root,file.source)))}
 }finally{await fs.rm(dest,{recursive:true,force:true})}
});
test('candidate refuses wrong project, stale blocked config and unsafe game availability',async()=>{
 const source=await fs.readFile(path.join(root,'environment.js'),'utf8');assert.throws(()=>parseConfig(source.replaceAll('manabi-game-land','wrong-project')),/wrong-production-project/);
 assert.throws(()=>parseConfig(source.replace('"rankingSyncEnabled":true','"rankingSyncEnabled":false')),/prerequisite-disabled/);
 assert.throws(()=>parseConfig(source.replace('"staticLocalGameIds":["suichoku"]','"staticLocalGameIds":["suichoku","parallelPair"]')),/managed-availability/);
 assert.throws(()=>parseConfig('arbitrary JS'),/unsupported-environment-format/);
});
