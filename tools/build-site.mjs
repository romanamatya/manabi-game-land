import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {validateEnvironment,environmentScript} from './site-environment.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const mode=process.argv[2]||'preview';if(!['preview','production'].includes(mode))throw Error('unknown-environment');const c=validateEnvironment(JSON.parse(await fs.readFile(path.join(root,'environments',mode+'.json'),'utf8')));
// Production output is always isolated. This command never writes live root files.
const out=path.join(root,mode==='preview'?'preview':'.release/production');
if(mode==='production')throw Error('production-adapters-and-Rules-require-verification-before-staging');
async function copy(dir,rel=''){for(const e of await fs.readdir(dir,{withFileTypes:true})){const next=path.join(rel,e.name);if(e.isDirectory())await copy(path.join(dir,e.name),next);else{await fs.mkdir(path.dirname(path.join(out,next)),{recursive:true});let s=await fs.readFile(path.join(dir,e.name));if(next==='environment.js')s=Buffer.from(environmentScript(c));await fs.writeFile(path.join(out,next),s)}}}
await copy(path.join(root,'shared-src/site'));console.log('Generated '+mode+' site from shared-src/site; assets retained; no data migration');
