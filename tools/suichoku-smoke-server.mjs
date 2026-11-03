import {createServer} from 'node:http';
import {createReadStream, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
createServer((request,response)=>{
  let pathname;
  try{pathname=decodeURIComponent(new URL(request.url||'/', 'http://localhost').pathname)}catch{response.writeHead(400).end();return}
  const relative=pathname==='/'?'index.html':pathname.replace(/^\/+/,''),file=path.resolve(root,relative);
  if(file!==root&&!file.startsWith(root+path.sep)){response.writeHead(404).end();return}
  try{if(!statSync(file).isFile())throw Error('not-file');response.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});createReadStream(file).pipe(response)}catch{response.writeHead(404).end()}
}).listen(4173,'127.0.0.1',()=>process.stdout.write('suichoku smoke server ready on 127.0.0.1:4173\n'));
