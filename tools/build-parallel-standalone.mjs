// Build an offline review copy from the exact local-game sources; never deploys anything.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'shared-src/site');
const output=path.resolve(process.argv[2]||path.join(root,'.release/parallelPair-review.html'));
let html=await fs.readFile(path.join(source,'games/parallelPair.html'),'utf8');
html=html.replace(/<script src="\.\.\/(?:environment|environment-runtime|economy|storage-adapters)\.js"><\/script>/g,'').replace(/<script type="module" src="\.\.\/parallel-ranking\.js"><\/script>/g,'');
html=html.replace(/script-src [^;]+;/,"script-src 'self' 'unsafe-inline';").replace(/connect-src [^;]+;/,"connect-src 'none';");
for(const match of [...html.matchAll(/<link rel="stylesheet" href="\.\.\/([^"?]+)">/g)])html=html.replace(match[0],'<style>'+await fs.readFile(path.join(source,match[1]),'utf8')+'</style>');
for(const match of [...html.matchAll(/<script src="\.\.\/([^"?]+)"><\/script>/g)]){
 let code=await fs.readFile(path.join(source,match[1]),'utf8');
 // Keep the approved PNG bytes embedded so the review file needs no server.
 for(const asset of [...code.matchAll(/(["'])(assets\/parallel-titles\/[^"']+\.png)\1/g)]){
  const bytes=await fs.readFile(path.join(source,asset[2]));
  code=code.replace(asset[0],()=>JSON.stringify('data:image/png;base64,'+bytes.toString('base64')));
 }
 html=html.replace(match[0],()=>'<script>'+code.replace(/<\/script/gi,'<\\/script')+'</script>');
}
html=html.replace('<button id="ranking-open" type="button">共有ランキング</button>','<small>記録はこの端末に保存</small>');
html=html.replace('<a href="../math.html">← 算数へ</a>','<span>算数</span>').replace('<a href="../index.html">ホーム</a>','<span>マナビクエスト</span>');
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,html);console.log(output);
