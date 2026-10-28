// Offline-only release preparation. It never deploys or calls Firebase.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const safe=p=>typeof p==='string'&&!p.startsWith('/')&&!p.split('/').includes('..')&&!p.includes('\\');
const excluded=p=>/^(?:admin\.|control-room\.|spark-auth\.|spark-config\.|player-sync|qa\/)|review\.html$/.test(p);
async function bytes(p){try{return await fs.readFile(p)}catch(e){if(e.code==='ENOENT')return null;throw e}}
export async function prepare({baseline=root,candidate=path.join(root,'.release/production'),output=path.join(root,'.release/site-package'),inventory,rules=path.join(root,'firebase/production-distribution-only.rules')}={}){
 baseline=path.resolve(baseline);candidate=path.resolve(candidate);output=path.resolve(output);
 if(!output.startsWith(path.join(root,'.release')+path.sep)||output===candidate||baseline===candidate)throw Error('unsafe-package-output');
 const m=JSON.parse(await fs.readFile(path.join(candidate,'BUILD-MANIFEST.json'))),config=JSON.parse(await fs.readFile(path.join(root,'environments/production.json')));
 if(m.environment!=='production'||m.projectId!=='manabi-game-land'||m.playerSyncEnabled!==false)throw Error('wrong-production-build');
 const live=inventory||JSON.parse(await fs.readFile(path.join(root,'environments/production-inventory.json')));
 for(const id of live.gameIds)if(!m.gameCatalog.some(g=>g.id===id))throw Error('existing-game-missing:'+id);
 if(m.gameCatalog.some(g=>['multiplicationProperties','shapeExpressions'].includes(g.id)))throw Error('preview-only-game-in-production');
 const ruleText=await fs.readFile(rules,'utf8'),ruleFields=new Set([...ruleText.matchAll(/'([A-Za-z][A-Za-z0-9]*)'/g)].map(x=>x[1]));
 const storage=m.gameCatalog.map(g=>({...g,cloudRanking:config.rankingGameIds.includes(g.id),rulesAllowsField:ruleFields.has(g.field),saveMode:config.rankingGameIds.includes(g.id)?'legacy-players':'device-only'}));
 const blockers=[];for(const g of storage)if(g.cloudRanking&&!g.rulesAllowsField)blockers.push('rules-field-not-allowed:'+g.field);
 if(m.runtimeBlocked)blockers.push('production-runtime-approval-pending');
 if(!config.legacyScoreSyncEnabled)blockers.push('legacy-ranking-service-disabled');
 const entries=[];
 // QA, unapproved game pages and management entry points are never in a student release.
 for(const f of m.files){const p=f.path;if(!safe(p))throw Error('unsafe-path');if(excluded(p)||p.startsWith('games/')&&!config.gameIds.includes(path.basename(p,'.html')))continue;
 const next=await fs.readFile(path.join(candidate,p));if(hash(next)!==f.outputSHA256)throw Error('candidate-hash-mismatch:'+p);
 const before=await bytes(path.join(baseline,p));if(before&&hash(before)===hash(next))continue;
 entries.push({path:p,beforeSHA256:before?hash(before):null,afterSHA256:hash(next)});
 await fs.mkdir(path.dirname(path.join(output,'forward',p)),{recursive:true});await fs.writeFile(path.join(output,'forward',p),next);
 if(before){await fs.mkdir(path.dirname(path.join(output,'rollback',p)),{recursive:true});await fs.writeFile(path.join(output,'rollback',p),before);}
 }
 // New assets must already be present in the unchanged production asset tree.
 const missingAssets=[];const assets=new Set();for(const e of entries.filter(f=>f.path.endsWith('.html')||f.path.endsWith('.js'))){const text=await fs.readFile(path.join(candidate,e.path),'utf8');for(const match of text.matchAll(/(?:\.\.\/)?assets\/[A-Za-z0-9_./-]+\.(?:png|svg|jpg|mp3|woff2)/g))assets.add(match[0].replace(/^\.\.\//,''));}
 for(const asset of assets){if(!safe(asset))throw Error('unsafe-asset-path');const before=await bytes(path.join(baseline,asset));if(before)continue;const next=await bytes(path.join(candidate,asset))||await bytes(path.join(root,'preview',asset));if(!next){missingAssets.push(asset);continue;}entries.push({path:asset,beforeSHA256:null,afterSHA256:hash(next)});await fs.mkdir(path.dirname(path.join(output,'forward',asset)),{recursive:true});await fs.writeFile(path.join(output,'forward',asset),next);}
 if(missingAssets.length)blockers.push('missing-production-assets:'+missingAssets.join(','));
 const plan={version:1,buildId:m.buildId,projectId:m.projectId,sourceRoot:m.sourceRoot,liveInventory:live,storage,rulesSHA256:hash(ruleText),runtimeBlocked:m.runtimeBlocked,blockers,ready:blockers.length===0,entries,productionTouched:false,firebaseContacted:false};
 plan.packageDigest=hash(JSON.stringify(plan));await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'RELEASE.json'),JSON.stringify(plan,null,2)+'\n');return plan;
}
export async function apply({packageDir,target,approval,rollback=false}){
 const plan=JSON.parse(await fs.readFile(path.join(packageDir,'RELEASE.json')));const {packageDigest,...payload}=plan;if(hash(JSON.stringify(payload))!==packageDigest)throw Error('package-manifest-tampered');
 if(approval?.packageDigest!==packageDigest||approval?.action!==(rollback?'rollback':'publish'))throw Error('exact-package-approval-required');
 if(!rollback&&!plan.ready)throw Error('release-blocked:'+plan.blockers.join(','));
 target=path.resolve(target);if(!target.startsWith(path.join(root,'.release')+path.sep))throw Error('staging-checkout-required');
 // Validate every precondition before the first write.
 for(const e of plan.entries){if(!safe(e.path))throw Error('unsafe-path');const current=await bytes(path.join(target,e.path)),expected=rollback?e.afterSHA256:e.beforeSHA256;if((current?hash(current):null)!==expected)throw Error('target-drift:'+e.path);const stored=await bytes(path.join(packageDir,rollback?'rollback':'forward',e.path));const wanted=rollback?e.beforeSHA256:e.afterSHA256;if((stored?hash(stored):null)!==wanted)throw Error('package-file-tampered:'+e.path);}
 for(const e of plan.entries){const dest=path.join(target,e.path),stored=await bytes(path.join(packageDir,rollback?'rollback':'forward',e.path));if(stored){await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,stored)}else await fs.rm(dest);}
 return {ok:true,action:rollback?'rollback':'publish',files:plan.entries.length,target,networkUsed:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),command=args.shift()||'prepare';if(command!=='prepare')throw Error('use-reviewed-apply-API-with-exact-approval');const options={};while(args.length){const key=args.shift(),value=args.shift();if(!['--baseline','--candidate','--output','--rules'].includes(key)||!value)throw Error('invalid-argument');options[key.slice(2)]=value;}const p=await prepare(options);console.log(JSON.stringify({buildId:p.buildId,files:p.entries.length,ready:p.ready,blockers:p.blockers},null,2));
}
