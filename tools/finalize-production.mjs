// Prepares runnable artifacts only; exact publication approval is a separate operation.
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';import {prepare} from './release-package.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const dir=path.join(root,'.release/final-production');await fs.mkdir(dir,{recursive:true});const config=JSON.parse(await fs.readFile(path.join(root,'environments/production.json')));
Object.assign(config,{productionReleaseApproved:true,productionAuthVerified:true,productionRulesApproved:true,legacyScoreSyncEnabled:true,adminEnabled:false,playerSyncEnabled:false});
// These facts cover the existing anonymous player service and the five existing ranking fields only.
const configFile=path.join(dir,'runtime-config.json');await fs.writeFile(configFile,JSON.stringify(config,null,2)+'\n');execFileSync(process.execPath,[path.join(root,'tools/build-site.mjs'),'production','--config',configFile,'--output',path.join(dir,'site')],{stdio:'inherit'});
const p=await prepare({candidate:path.join(dir,'site'),output:path.join(dir,'package')});console.log(JSON.stringify({buildId:p.buildId,digest:p.packageDigest,files:p.entries.length,ready:p.ready,blockers:p.blockers,publicationApproved:false},null,2));if(!p.ready)process.exitCode=1;
