import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const source=new URL('../shared-src/site/',import.meta.url);
function titles(){const window={ManabiEconomyCore:{games:{}},ManabiParallel:{},manabiStorage:{getItem:()=>null,setItem(){}}};vm.runInNewContext(fs.readFileSync(new URL('parallel-local.js',source),'utf8'),{window,Map});return window.ManabiParallelLocal.titles}
test('five rank images match the approved PNG paths, dimensions and preview bytes',()=>{
 const rows=titles();assert.deepEqual(Array.from(rows,t=>t.image.split('/').at(-1)),['01_heiko_minarai_512.png','02_heiko_hunter_512.png','03_heiko_master_512.png','04_heiko_tatsujin_512.png','05_heiko_ouja_512.png']);
 for(const t of rows){const b=fs.readFileSync(new URL(t.image,source));assert.equal(b.subarray(1,4).toString(),'PNG');assert.equal(b.readUInt32BE(16),512);assert.equal(b.readUInt32BE(20),512);assert.equal(b[25],6,'RGBA');assert.deepEqual(fs.readFileSync(new URL('../preview/'+t.image,import.meta.url)),b)}
});
test('offline review embeds every approved image byte-for-byte and keeps all code inline',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'parallel-offline-'));
 try{const target=path.join(dir,'review.html');execFileSync(process.execPath,[new URL('../tools/build-parallel-standalone.mjs',import.meta.url).pathname,target]);const html=fs.readFileSync(target,'utf8');assert.doesNotMatch(html,/<script src=|<link rel="stylesheet"/);assert.match(html,/connect-src 'none'/);assert.doesNotMatch(html,/assets\/parallel-titles\/[^"']+\.png/);for(const t of titles())assert.ok(html.includes('data:image/png;base64,'+fs.readFileSync(new URL(t.image,source)).toString('base64')))}finally{fs.rmSync(dir,{recursive:true,force:true})}
});
