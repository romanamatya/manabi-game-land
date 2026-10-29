import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {GAME_FIELDS} from '../shared-src/site/data-contract.js';
import {fileURLToPath} from 'node:url';
import {validateEnvironment, environmentScript} from './site-environment.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] || 'preview';
if (!['preview', 'production'].includes(mode)) throw Error('unknown-environment');

const options=Object.fromEntries(process.argv.slice(3).reduce((a,v,i,all)=>i%2===0?[...a,[v,all[i+1]]]:a,[]));
for(const k of Object.keys(options))if(!['--config','--output'].includes(k))throw Error('unknown-build-option');
const configPath=options['--config']?path.resolve(options['--config']):path.join(root,'environments',`${mode}.json`);
if(options['--config']&&!configPath.startsWith(path.join(root,'.release')+path.sep))throw Error('review-config-required');
const config=validateEnvironment(JSON.parse(await fs.readFile(configPath,'utf8')));
if(config.environment!==mode)throw Error('environment-mode-mismatch');
const source = path.join(root, 'shared-src/site');
const out=options['--output']?path.resolve(options['--output']):path.join(root,mode==='preview'?'preview':'.release/production');
if(options['--output']&&(mode!=='production'||!out.startsWith(path.join(root,'.release')+path.sep)))throw Error('unsafe-production-output');
const blocked = mode === 'production' && !config.productionReleaseApproved;
if (out === root || (mode === 'production' && !out.startsWith(path.join(root, '.release') + path.sep))) {
  throw Error('unsafe-production-output');
}

async function listFiles(dir, rel = '') {
  const result = [];
  for (const entry of await fs.readdir(dir, {withFileTypes: true})) {
    const next = path.join(rel, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(path.join(dir, entry.name), next));
    else result.push(next.split(path.sep).join('/'));
  }
  return result.sort();
}

const sourceFiles = await listFiles(source);
const sourceDigests = new Map();
for (const rel of sourceFiles) {
  sourceDigests.set(rel, crypto.createHash('sha256').update(await fs.readFile(path.join(source, rel))).digest('hex'));
}
const buildId = crypto.createHash('sha256')
  .update(JSON.stringify({mode, config, source: [...sourceDigests], buildPipelineSHA256: crypto.createHash('sha256').update(await fs.readFile(fileURLToPath(import.meta.url))).digest('hex')}))
  .digest('hex').slice(0, 12);

const catalogContext = {window: {}};
vm.runInNewContext(await fs.readFile(path.join(source, 'profile-catalog.js'), 'utf8'), catalogContext);
const fullCatalog = catalogContext.window.ManabiProfileCatalog;
const catalogById = new Map(fullCatalog.map(game => [game.id, game]));
if (catalogById.size !== fullCatalog.length) throw Error('duplicate-game-id-in-catalog');
for (const id of config.gameIds) if (!catalogById.has(id)) throw Error(`unknown-game-id:${id}`);
for (const id of config.rankingGameIds) {
  if (!config.gameIds.includes(id)) throw Error(`ranking-game-not-published:${id}`);
}
const releaseCatalog = config.gameIds.map(id => {
  const game = catalogById.get(id);
  return {id, name: game.name, field: game.field || GAME_FIELDS[id] || `${id}BestStreak`, rankingEnabled: config.rankingGameIds.includes(id)};
});

const entries = [];
for (const rel of sourceFiles) {
  const original = await fs.readFile(path.join(source, rel), 'utf8');
  let text = original;
  if (rel === 'environment.js') text = environmentScript(config);
  if (rel === 'profile-catalog.js') {
    const games = config.gameIds.map(id => ({...catalogById.get(id), rankingEnabled: config.rankingGameIds.includes(id)}));
    text = `window.ManabiProfileCatalog=${JSON.stringify(games)};\n`;
  }
  if (rel.endsWith('.html')) {
    if (!text.includes('src="environment.js') && !text.includes('src="../environment.js')) {
      text = text.replace('<head>', `<head><script src="${rel.startsWith('games/') ? '../' : ''}environment.js"></script>`);
    }
    if(mode==='preview'&&config.challenge120Enabled===true&&rel.startsWith('games/'))text=text.replace(/(<script[^>]+src="(?:\.\.\/)?economy\.js[^\"]*"><\/script>)/, '<script src="../challenge120-core.js"></script><script src="../challenge120-runtime.js"></script><link rel="stylesheet" href="../challenge120.css">$1');
    if(mode==='preview'&&rel!=='control-room.html'&&!rel.startsWith('qa/'))text=text.replace(/(<script[^>]+src="(?:\.\.\/)?environment-runtime\.js[^"]*"><\/script>)/, '$1<script src="'+(rel.startsWith('games/')?'../':'')+'management-gate.js"></script>');
    text = text.replace(/(<script[^>]+src="(?:\.\.\/)?economy-core\.js[^\"]*"><\/script>)/, `$1<script src="${rel.startsWith('games/') ? '../' : ''}storage-adapters.js"></script>`);
    if (mode === 'production' && rel === 'index.html') text = text.replace(/<a class="mq-admin-login"[^>]*>[\s\S]*?<\/a>/g, '');
    if (mode === 'production') {
      text = text.replace(/<p><a href="kotowaza-review\.html">[\s\S]*?<\/a><\/p>/g, '');
      text = text.replace(/<article\b[^>]*>[\s\S]*?<\/article>/g, article => {
        const id = article.match(/games\/([^/"?]+)\.html/)?.[1];
        return id && !config.gameIds.includes(id) ? '' : article;
      });
      if (rel.startsWith('games/') && !config.gameIds.includes(path.basename(rel, '.html'))) {
        text = '<!doctype html><html lang="ja"><meta charset="utf-8"><title>未公開</title><p>このゲームは本番公開されていない。</p></html>';
      }
    }
    if (blocked) {
      text = text.replace(/<script\b([^>]*)>/g, (match, attrs) => `<script type="application/x-manabi-blocked"${attrs.replace(/\btype="[^"]*"/g, '')}>`);
      text = text.replace('</body>', '<section role="status" style="position:fixed;inset:0;background:white;z-index:2147483647;padding:3rem;font:20px system-ui"><h1>本番向け確認出力・未承認</h1><p>本番の認証・Rules・公開承認が未確認のため、全スクリプトを停止している。Firebaseへの通信とデータ保存は行わない。</p></section></body>');
    }
  }
  // A source/config digest invalidates caches consistently across both environments.
  const relativeModule = new RegExp(`([\"'])((?:\\.\\.?/)[^\"'\\s?]+\\.js)\\1`, 'g');
  text = text.replace(relativeModule, `$1$2?v=${buildId}$1`);
  text = text.replace(/(src="(?:\.\.\/)?environment\.js)"/g, `$1?v=${buildId}"`);
  text = text.replace(/((?:[A-Za-z0-9_-]+)\.(?:js|css))\?v=[^"'\s<>]*/g, `$1?v=${buildId}`);
  await fs.mkdir(path.dirname(path.join(out, rel)), {recursive: true});
  await fs.writeFile(path.join(out, rel), text);
  entries.push({path: rel, sourceSHA256: sourceDigests.get(rel), outputSHA256: crypto.createHash('sha256').update(text).digest('hex')});
}

if (mode === 'production') {
  try { await fs.cp(path.join(root, 'assets'), path.join(out, 'assets'), {recursive: true}); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const manifest = {
  buildId,
  environment: mode,
  projectId: config.projectId,
  runtimeBlocked: blocked,
  runtimeConfig: config,
  playerSyncEnabled: false,
  publicRootTouched: false,
  sourceRoot: 'shared-src/site',
  gameCatalog: releaseCatalog,
  files: entries
};
await fs.writeFile(path.join(out, 'BUILD-MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Generated ${entries.length} shared source files for ${mode}; build=${buildId}; runtimeBlocked=${blocked}; live production root untouched`);
