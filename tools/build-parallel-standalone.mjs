// Build an offline review copy from the exact stage-1 sources; never deploys anything.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'shared-src/site');
const output=path.resolve(process.argv[2]||path.join(root,'.release/parallelPair-review.html'));
let html=await fs.readFile(path.join(source,'games/parallelPair.html'),'utf8');
for(const match of [...html.matchAll(/<link rel="stylesheet" href="\.\.\/([^"?]+)">/g)])html=html.replace(match[0],'<style>'+await fs.readFile(path.join(source,match[1]),'utf8')+'</style>');
for(const match of [...html.matchAll(/<script src="\.\.\/([^"?]+)"><\/script>/g)]){const code=await fs.readFile(path.join(source,match[1]),'utf8');html=html.replace(match[0],'<script>'+code.replace(/<\/script/gi,'<\\/script')+'</script>')}
html=html.replace('<a href="../math.html">← 算数へ</a>','<span>算数</span>').replace('<a href="../index.html">ホーム</a>','<span>マナビクエスト</span>');
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,html);console.log(output);
