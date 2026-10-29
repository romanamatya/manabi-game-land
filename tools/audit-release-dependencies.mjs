import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {materializeProfileAssets} from './release-package.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export async function audit({site,packageDir}){
 const plan=JSON.parse(await fs.readFile(path.join(packageDir,'RELEASE.json')));
 const entries=new Map(plan.entries.map(e=>[e.path,e]));
 const pending=['index.html','math.html','social.html','language.html','japanese.html','science.html',...plan.entries.map(e=>e.path)];
 const seen=new Set(),edges=[],external=new Set();
 const registry=materializeProfileAssets(...await Promise.all(['profile-catalog.js','economy-core.js','profile-model.js'].map(p=>fs.readFile(path.join(site,p),'utf8'))));
 pending.push(...registry);
 const resolve=(from,value)=>{
  value=value.trim().replace(/&amp;/g,'&');
  if(!value||value.startsWith('#')||/^(?:data:|blob:|mailto:|javascript:)/i.test(value))return;
  if(/^(?:https?:)?\/\//.test(value)){external.add(value);return;}
  const clean=decodeURIComponent(value.split(/[?#]/)[0]);
  if(!clean||/[${}]/.test(clean))return;
  const dest=path.posix.normalize(path.posix.join(path.posix.dirname(from),clean));
  if(dest.startsWith('../')||path.isAbsolute(dest))throw Error('dependency-outside-site:'+value);
  edges.push({from,to:dest});pending.push(dest);
 };
 while(pending.length){const p=pending.shift();if(seen.has(p))continue;seen.add(p);
  let b;try{b=await fs.readFile(path.join(site,p));}catch(e){throw Error('missing-packaged-dependency:'+p,{cause:e});}
  const entry=entries.get(p);
  if(entry){const forward=await fs.readFile(path.join(packageDir,'forward',p));if(sha(forward)!==entry.afterSHA256||sha(b)!==entry.afterSHA256)throw Error('packaged-dependency-hash-mismatch:'+p);}
  if(/\.png$/i.test(p)&&!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('invalid-png:'+p);
  if(/\.(?:html|css|js)$/i.test(p)){
   const s=b.toString();
   if(p.endsWith('.html'))for(const m of s.replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi,'$1</script>').matchAll(/\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/g))resolve(p,m[1]);
   for(const m of s.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g))resolve(p,m[1]);
   for(const m of s.matchAll(/(?:import\s*\(|from\s+|fetch\s*\()\s*["']([^"']+)["']/g))resolve(p,m[1]);
   for(const m of s.matchAll(/["'`]((?:\.\.\/)?assets\/[A-Za-z0-9_./-]+\.(?:png|svg|jpe?g|webp|mp3|ogg|woff2?|json))["'`]/g))resolve(p,m[1]);
  }
 }
 for(const n of ['001','002','003','004'])if(!seen.has('assets/avatars/icon_'+n+'.png'))throw Error('starter-not-audited:'+n);
 return {files:seen.size,registryAssets:registry.length,edges,external:[...external].sort(),starterIcons:['001','002','003','004'].map(n=>({path:'assets/avatars/icon_'+n+'.png',inPatch:entries.has('assets/avatars/icon_'+n+'.png'),inFullSite:true})),packageChecked:true};
}
