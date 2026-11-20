import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const subjects=new Set(['japanese','math','social','science','english']);
const safeId=/^[a-zA-Z][a-zA-Z0-9-]{0,63}$/;
export function validateRegistration(registry){
 if(registry?.schema!==1||!Array.isArray(registry.games)||!registry.games.length)throw Error('invalid-game-registration');
 const ids=new Set(),titles=new Set(),recordFields=new Set();
 for(const game of registry.games){
  if(!safeId.test(game.id)||ids.has(game.id))throw Error('duplicate-or-invalid-game-id');ids.add(game.id);
  if(typeof game.field!=='string'||!/^[A-Za-z][A-Za-z0-9]*$/.test(game.field)||recordFields.has(game.field))throw Error('invalid-or-duplicate-record-field');recordFields.add(game.field);
  if(typeof game.name!=='string'||!game.name.trim()||game.name.length>80||!subjects.has(game.subject))throw Error('invalid-game-metadata');
  if(!['geometry','calculation','general'].includes(game.unit)||game.entry!=='games/'+game.id+'.html')throw Error('invalid-game-route');
  if(game.subject!=='math'&&game.unit!=='general')throw Error('invalid-game-unit');
  if(game.correctPoints!==1||game.dailyPointCap!==50)throw Error('invalid-game-point-policy');
  if(typeof game.release?.preview!=='boolean'||typeof game.release?.production!=='boolean')throw Error('invalid-release-channel');
  if(!Array.isArray(game.titles)||!game.titles.length)throw Error('missing-game-titles');
  let previous=0;
  for(const title of game.titles){
   if(!Number.isSafeInteger(title.at)||title.at<=previous||title.id!==game.id+':'+title.at||titles.has(title.id))throw Error('invalid-title-order');
   previous=title.at;titles.add(title.id);
   if(typeof title.name!=='string'||!title.name.trim())throw Error('invalid-title-name');
   if(title.image&&(!title.image.startsWith('assets/')||title.image.includes('..')||/[?#\\]/.test(title.image)))throw Error('invalid-title-art');
   if(title.textOnly&&title.image)throw Error('text-title-has-art');
  }
 }
 const latest=registry.games.find(game=>game.id===registry.latestPublishedGameId);
 if(!latest?.release.production)throw Error('latest-game-must-be-production-released');
 return registry;
}
export function registrationPlan(registry,channel){
 validateRegistration(registry);if(!['preview','production'].includes(channel))throw Error('invalid-release-channel');
 const games=registry.games.filter(game=>game.release[channel]);
 const serialize=value=>JSON.stringify(value);
 const manifestSHA256=crypto.createHash('sha256').update(serialize(registry)).digest('hex');
 return {
  channel,manifestSHA256,gameIds:games.map(game=>game.id),
  // Public configuration is generated from one registration; it contains no UID or private profile data.
  catalog:games.map(({id,name,subject,unit,entry,field,titles})=>({id,name,subject,unit,page:entry,field,titles,rankingEnabled:false})),
  units:Object.fromEntries([...new Set(games.map(game=>game.subject))].map(subject=>[subject,Object.fromEntries([...new Set(games.filter(g=>g.subject===subject).map(g=>g.unit))].map(unit=>[unit,games.filter(g=>g.subject===subject&&g.unit===unit).map(g=>g.id)]))])),
  economy:Object.fromEntries(games.map(g=>[g.id,{subject:g.subject,points:g.correctPoints,dailyCap:g.dailyPointCap}])),
  bestRecords:Object.fromEntries(games.map(g=>[g.id,{field:g.field,key:g.id==='keisan'?'mgl_best':'mgl_'+g.id,legacyKeys:g.legacyRecordKeys||[],challengeKey:'mgl_challenge120_v1:'+g.id}])),
  highestTitles:Object.fromEntries(games.map(g=>[g.id,g.titles.at(-1).at])),
  managementGameIds:games.map(g=>g.id),
  latestPublishedGameId:registry.latestPublishedGameId,
  // To be imported through the authenticated, audited admin operation only. No write is performed here.
  trustedRegistrations:games.map(g=>({id:g.id,name:g.name,subject:g.subject,unit:g.unit,entry:g.entry,enabled:true,manifestSHA256})),
 };
}
export async function loadRegistration(file=path.join(root,'config/game-registration.json')){return validateRegistration(JSON.parse(await fs.readFile(file,'utf8')));}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const registry=await loadRegistration(),channel=process.argv[2]||'preview',plan=registrationPlan(registry,channel);
 const outputIndex=process.argv.indexOf('--output');
 if(outputIndex>=0){const destination=path.resolve(process.argv[outputIndex+1]||'');if(!destination.startsWith(path.join(root,'.release')+path.sep))throw Error('registration-output-must-be-staged');await fs.mkdir(destination,{recursive:true});await fs.writeFile(path.join(destination,'registration-plan.json'),JSON.stringify(plan,null,2)+'\n');await fs.writeFile(path.join(destination,'profile-catalog.js'),'window.ManabiProfileCatalog='+JSON.stringify(plan.catalog)+';\n');}
 console.log(JSON.stringify({channel:plan.channel,games:plan.gameIds.length,manifestSHA256:plan.manifestSHA256,latest:plan.latestPublishedGameId,cloudWrites:0}));
}
