// Preparation only: never publishes or contacts Firebase.
import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {prepare,apply} from './release-package.mjs';import {audit} from './audit-release-dependencies.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=path.join(root,'.release/corrected-production'),baseline=path.join(root,'.release/current-production'),site=path.join(dir,'site'),pkg=path.join(dir,'package');
const preserved=['multiplicationProperties','shapeExpressions'];const extraFiles=['games/multiplicationProperties.html','games/shapeExpressions.html','multiplication-properties-model.js','multiplication-properties-game.js','multiplication-properties.css','math-concepts-model.js','math-concepts-game.js','math-concepts.css','math-concepts-production-points.js'];
const baselineCommit=execFileSync('git',['-C',baseline,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(baselineCommit!=='5505a58d2ca17ce0cb3bc78684983613694e81cd')throw Error('production-baseline-requires-review');
execFileSync(process.execPath,[path.join(root,'tools/finalize-production.mjs')],{stdio:'inherit'});
await fs.rm(dir,{recursive:true,force:true});await fs.mkdir(site,{recursive:true});
for(const ent of await fs.readdir(baseline,{withFileTypes:true})){if(ent.name==='assets'||ent.name==='games'||/\.(?:html|css|js)$/.test(ent.name)||ent.name==='.nojekyll')await fs.cp(path.join(baseline,ent.name),path.join(site,ent.name),{recursive:true});}
const common=path.join(root,'.release/final-production/site');
const commonManifest=JSON.parse(await fs.readFile(path.join(common,'BUILD-MANIFEST.json')));
for(const f of commonManifest.files)if(!/^(?:admin\.|control-room\.|spark-|player-sync|qa\/)/.test(f.path)&&!f.path.endsWith('review.html')&&(!f.path.startsWith('games/')||commonManifest.runtimeConfig.gameIds.includes(path.basename(f.path,'.html')))){await fs.mkdir(path.dirname(path.join(site,f.path)),{recursive:true});await fs.copyFile(path.join(common,f.path),path.join(site,f.path));}
// Preserve both already-published games and their exact save adapters.
for(const p of extraFiles){await fs.mkdir(path.dirname(path.join(site,p)),{recursive:true});await fs.copyFile(path.join(baseline,p),path.join(site,p));}
const oldMenu=await fs.readFile(path.join(baseline,'math.html'),'utf8');let menu=await fs.readFile(path.join(site,'math.html'),'utf8');
for(const id of preserved){const card=[...oldMenu.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)].map(m=>m[0]).find(s=>s.includes('games/'+id+'.html'));if(!card)throw Error('published-card-missing:'+id);menu=menu.replace('</main>',card+'</main>');}
const scoreScript=oldMenu.match(/<script>for\(const id of \["multiplicationProperties","shapeExpressions"\][\s\S]*?<\/script>/)?.[0];if(!scoreScript)throw Error('published-record-view-missing');menu=menu.replace('</body>',scoreScript+'</body>');await fs.writeFile(path.join(site,'math.html'),menu);
const sources=['tools/build-site.mjs','tools/release-package.mjs','tools/audit-release-dependencies.mjs','tools/rebuild-corrected-production.mjs'];
const buildId='corrected-'+crypto.createHash('sha256').update(JSON.stringify({common:commonManifest.buildId,baselineCommit,menu,tools:await Promise.all(sources.map(p=>fs.readFile(path.join(root,p),'utf8')))})).digest('hex').slice(0,12);
const manifest={...commonManifest,buildId,files:await Promise.all(commonManifest.files.map(async f=>({...f,outputSHA256:crypto.createHash('sha256').update(await fs.readFile(path.join(site,f.path)).catch(()=>fs.readFile(path.join(common,f.path)))).digest('hex')})))};
await fs.writeFile(path.join(site,'BUILD-MANIFEST.json'),JSON.stringify(manifest,null,2));
const inventory={source:'current main production snapshot',baselineCommit,gameIds:[...manifest.runtimeConfig.gameIds,...preserved],rulesIndependentlyFetched:false};
const plan=await prepare({baseline,candidate:site,output:pkg,inventory,preservedGameIds:preserved});
// Materialize the actual upload patch into the complete deployment tree before auditing it.
for(const e of plan.entries){await fs.mkdir(path.dirname(path.join(site,e.path)),{recursive:true});await fs.copyFile(path.join(pkg,'forward',e.path),path.join(site,e.path));}
for(const p of extraFiles)if(!Buffer.from(await fs.readFile(path.join(site,p))).equals(await fs.readFile(path.join(baseline,p))))throw Error('published-game-changed:'+p);
const menus=(await Promise.all(['math.html','social.html','language.html','japanese.html'].map(p=>fs.readFile(path.join(site,p),'utf8')))).join('');for(const id of inventory.gameIds)if(!menus.includes('games/'+id+'.html'))throw Error('game-menu-missing:'+id);
const auditResult=await audit({site,packageDir:pkg});
const checkout=path.join(dir,'rollback-verification');await fs.mkdir(checkout,{recursive:true});
for(const e of plan.entries)if(e.beforeSHA256){await fs.mkdir(path.dirname(path.join(checkout,e.path)),{recursive:true});await fs.copyFile(path.join(pkg,'rollback',e.path),path.join(checkout,e.path));}
await apply({packageDir:pkg,target:checkout,approval:{action:'publish',packageDigest:plan.packageDigest}});await apply({packageDir:pkg,target:checkout,rollback:true,approval:{action:'rollback',packageDigest:plan.packageDigest}});
for(const e of plan.entries){const b=await fs.readFile(path.join(checkout,e.path)).catch(()=>null);if((b?crypto.createHash('sha256').update(b).digest('hex'):null)!==e.beforeSHA256)throw Error('rollback-verification-failed:'+e.path);}
await fs.writeFile(path.join(dir,'DEPENDENCIES.json'),JSON.stringify(auditResult,null,2));
await fs.writeFile(path.join(dir,'CHANGED-FILES.txt'),plan.entries.map(e=>e.path).join('\n')+'\n');
await fs.writeFile(path.join(dir,'RESULT.json'),JSON.stringify({buildId,packageDigest:plan.packageDigest,files:plan.entries.length,ready:plan.ready,blockers:plan.blockers,baselineCommit,preservedGameIds:preserved,preservedFiles:extraFiles,dependencyFiles:auditResult.files,starterIcons:auditResult.starterIcons,rollbackVerified:true,publicationApproved:false,firebaseContacted:false},null,2));
console.log(await fs.readFile(path.join(dir,'RESULT.json'),'utf8'));
