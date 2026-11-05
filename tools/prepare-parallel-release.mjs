// Offline, selective release rehearsal. No network, credentials, deployment or root writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=b=>createHash('sha256').update(b).digest('hex');
export function parseConfig(source){
 const match=source.match(/window\.MANABI_BACKEND_CONFIG=Object\.freeze\((\{[^\n]+?\})\);/);
 if(!match)throw Error('unsupported-environment-format');
 const config=JSON.parse(match[1]);
 if(config.mode!=='production'||config.expectedProjectId!=='manabi-game-land'||config.firebase?.projectId!=='manabi-game-land'||config.environment!=='productionAdmin/v1')throw Error('wrong-production-project');
 for(const key of ['rankingSyncEnabled','playerNameSyncEnabled','availabilityEnabled','challenge120Enabled'])if(config[key]!==true)throw Error('existing-prerequisite-disabled:'+key);
 for(const key of ['gameIds','rankingGameIds'])if(!Array.isArray(config[key])||config[key].includes('parallelPair'))throw Error('unexpected-game-list:'+key);
 if(config.staticLocalGameIds?.includes('parallelPair'))throw Error('parallel-must-use-managed-availability');
 return {config,json:match[1]};
}
function replaceOnce(source,from,to){if(source.split(from).length!==2)throw Error('patch-precondition:'+from);return source.replace(from,to)}
export async function prepareParallelRelease({root=repository,output=path.join(root,'.release/parallel-stage4')}={}){
 root=await fs.realpath(root);output=path.resolve(output);
 const release=path.join(root,'.release');await fs.mkdir(release,{recursive:true});
 if(output===release||!output.startsWith(release+path.sep))throw Error('output-must-be-inside-release-subdirectory');
 // Refuse symlinks in the destination path, including .release itself.
 let component=root;for(const part of path.relative(root,output).split(path.sep)){component=path.join(component,part);try{if((await fs.lstat(component)).isSymbolicLink())throw Error('symlink-output')}catch(e){if(e.code!=='ENOENT')throw e}}
 const read=p=>fs.readFile(path.join(root,p));const text=async p=>(await read(p)).toString('utf8');
 const environment=await text('environment.js'),{config,json}=parseConfig(environment);
 const next={...config,gameIds:[...config.gameIds,'parallelPair'],rankingGameIds:[...config.rankingGameIds,'parallelPair'],parallelPairRankingEnabled:true};
 const files=new Map(),origins=new Map();
 async function add(destination,source,transform=x=>x){const bytes=await read(source);files.set(destination,transform(bytes));origins.set(destination,{source,sourceSha256:hash(bytes)})}
 files.set('environment.js',Buffer.from(replaceOnce(environment,json,JSON.stringify(next))));origins.set('environment.js',{source:'environment.js',sourceSha256:hash(environment)});
 for(const name of ['parallel-model.js','parallel-local.js','parallel-game.js','parallel-ranking.js','parallel.css'])await add(name,'shared-src/site/'+name);
 for(const name of await fs.readdir(path.join(root,'shared-src/site/assets/parallel-titles')))await add('assets/parallel-titles/'+name,'shared-src/site/assets/parallel-titles/'+name);
 await add('games/parallelPair.html','shared-src/site/games/parallelPair.html',bytes=>Buffer.from(replaceOnce(bytes.toString('utf8'),'<script src="../parallel-model.js">','<script src="../public-firebase-session.js"></script><script src="../public-game-availability.js"></script><script src="../public-admin-settings.js"></script><script src="../parallel-model.js">')));
 // Reuse root common runtimes; never regenerate all existing games from stale production.json.
 for(const name of ['celebration-effects.js','challenge120-core.js','economy-core.js','profile-catalog.js','ranking-sync-api.js'])await add(name,name);
 await add('math-navigation.js','math-navigation.js',bytes=>Buffer.from(replaceOnce(replaceOnce(replaceOnce(bytes.toString('utf8'),"games:['suichoku']","games:['suichoku','parallelPair']"),"const displayNames={","const displayNames={parallelPair:'平行な2本を見つけよう！',"),"const descriptions={","const descriptions={parallelPair:'7本の直線から平行な2本を見つけよう',")));
 for(const name of ['public-admin-settings.js','management-model.js'])await add(name,name,bytes=>Buffer.from(replaceOnce(bytes.toString('utf8'),"'shapeExpressions','keisanSummary'","'shapeExpressions','keisanSummary','parallelPair'")));
 // Confirm existing dependencies in the candidate page can be served from the unchanged root.
 const html=files.get('games/parallelPair.html').toString();
 for(const match of html.matchAll(/(?:src|href)="\.\.\/([^"?#]+\.(?:js|css))"/g))if(!files.has(match[1]))await fs.access(path.join(root,match[1]));
 const manifest={candidateOnly:true,deployReady:false,reason:'Live Rules and authenticated gameSettings have not been captured or reviewed.',game:'parallelPair',environmentBeforeSha256:hash(environment),configChanges:{gameIdsAdd:['parallelPair'],rankingGameIdsAdd:['parallelPair'],parallelPairRankingEnabled:true},liveWrites:[],rulesIncluded:false,gameSetting:{path:'productionAdmin/v1/gameSettings/parallelPair',proposedStatus:'published',existingDocument:'UNKNOWN; read and back up before any write',method:'existing visibility operation with audit + backup, target parallelPair only'},files:[]};
 for(const [name,bytes]of files){manifest.files.push({path:name,...origins.get(name),sha256:hash(bytes)});await fs.mkdir(path.dirname(path.join(output,name)),{recursive:true});await fs.writeFile(path.join(output,name),bytes)}
 await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const m=await prepareParallelRelease({output:process.argv[2]});console.log(JSON.stringify({candidateOnly:true,deployReady:m.deployReady,files:m.files.length,environmentBeforeSha256:m.environmentBeforeSha256,output:process.argv[2]||'.release/parallel-stage4'}))}
