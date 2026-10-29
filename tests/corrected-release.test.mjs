import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';
import {audit} from '../tools/audit-release-dependencies.mjs';
const root=new URL('../',import.meta.url).pathname,dir=path.join(root,'.release/corrected-production'),site=path.join(dir,'site'),packageDir=path.join(dir,'package');
test('corrected package carries starter images, preserves ten live games and keeps nine newly published files exact',async()=>{
 const r=JSON.parse(await fs.readFile(path.join(dir,'RESULT.json')));assert.notEqual(r.buildId,'b16b799b5c1d');assert.equal(r.ready,true);assert.equal(r.rollbackVerified,true);assert.equal(r.publicationApproved,false);
 for(const i of r.starterIcons){assert(i.inPatch&&i.inFullSite);assert((await fs.stat(path.join(packageDir,'forward',i.path))).size>100);}
 for(const p of r.preservedFiles)assert((await fs.readFile(path.join(site,p))).equals(await fs.readFile(path.join(root,'.release/current-production',p))));
 const menu=await fs.readFile(path.join(site,'math.html'),'utf8');assert(menu.includes('games/multiplicationProperties.html'));assert(menu.includes('games/shapeExpressions.html'));
 const p=JSON.parse(await fs.readFile(path.join(packageDir,'RELEASE.json')));assert.equal(p.storage.length,10);assert.equal(p.storage.filter(g=>g.cloudRanking).length,5);
 assert(!p.entries.some(e=>r.preservedFiles.includes(e.path)));assert(!p.entries.some(e=>/^(firebase\/|admin\.|control-room\.|spark-)/.test(e.path)));
});
test('dependency audit checks actual upload bytes, not just candidate existence',async()=>{
 const file=path.join(packageDir,'forward/assets/avatars/icon_001.png'),b=await fs.readFile(file);
 try{await fs.writeFile(file,'not-an-image');await assert.rejects(audit({site,packageDir}),/packaged-dependency-hash-mismatch/);}finally{await fs.writeFile(file,b);}
 const r=await audit({site,packageDir});assert(r.files>=140);assert.equal(r.registryAssets,72);
});
test('dependency audit rejects altered HTML/CSS references and a missing dynamically generated starter icon',async()=>{
 const css=path.join(site,'untracked-dependency-test.css'),p=path.join(site,'math.html'),b=await fs.readFile(p),icon=path.join(site,'assets/avatars/icon_004.png'),im=await fs.readFile(icon);
 try{await fs.rm(icon);await assert.rejects(audit({site,packageDir}),/missing-packaged-dependency/);}finally{await fs.writeFile(icon,im);}
 // A root navigation dependency is scanned even when not part of a patch entry.
 const science=path.join(site,'science.html'),s=await fs.readFile(science);
 try{await fs.writeFile(css,'body{background:url(assets/missing-regression.png)}');await fs.writeFile(science,s.toString().replace('</head>','<link rel="stylesheet" href="untracked-dependency-test.css"></head>'));await assert.rejects(audit({site,packageDir}),/packaged-dependency-hash-mismatch/);}finally{await fs.writeFile(science,s);await fs.rm(css);}
 assert((await fs.readFile(p)).equals(b));
});
