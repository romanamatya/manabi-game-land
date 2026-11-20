import fs from 'node:fs/promises';
import {loadRegistration, registrationPlan} from './game-registration.mjs';
import {transformTitleMode} from './title-mode.mjs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {GAME_FIELDS} from '../shared-src/site/data-contract.js';
import {fileURLToPath} from 'node:url';
import {validateEnvironment, environmentScript} from './site-environment.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] || 'preview';
if (!['preview', 'production'].includes(mode)) throw Error('unknown-environment');

const registryPreview = mode === 'preview' && process.argv.includes('--registration');
const config = validateEnvironment(JSON.parse(await fs.readFile(path.join(root, 'environments', `${mode}.json`), 'utf8')));
const plan = registryPreview ? registrationPlan(await loadRegistration(), mode) : null;
if (plan) {
 const known = new Set([...config.gameIds, ...config.staticLocalGameIds]);
 config.registration = {...plan, newGames: plan.trustedRegistrations.filter(game => !known.has(game.id))};
 config.latestGameId = config.registration.newGames.at(-1)?.id || plan.latestPublishedGameId;
 for (const game of config.registration.newGames) {
  config.gameIds.push(game.id);
  config.visibilityGameIds.push(game.id);
  config.localChallengeGameIds.push(game.id);
 }
}
const source = path.join(root, 'shared-src/site');
const out = path.join(root, registryPreview ? '.release/stage2/preview' : mode === 'preview' ? 'preview' : '.release/production');
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
const registrationStore = 'game-registration-store.js';
if (plan) sourceFiles.push(registrationStore);
const overlay = new Set(plan ? await listFiles(path.join(root,'stage2/site')) : []);
for (const file of overlay) if (!sourceFiles.includes(file)) sourceFiles.push(file);
const sourceFor = file => {
 if (file === registrationStore) return path.join(root,'tools/game-registration-store.mjs');
 return overlay.has(file) ? path.join(root,'stage2/site',file) : path.join(source,file);
};
if (plan) for (const game of plan.catalog) {
 if (!sourceFiles.includes(game.page)) throw Error('missing-game-entry:'+game.page);
 for (const title of game.titles) if (title.image && !sourceFiles.includes(title.image)) await fs.access(path.join(root,'preview',title.image));
}
const validators = plan ? await Promise.all(config.registration.newGames.map(async game => {
 const code = await fs.readFile(sourceFor('registrations/'+game.id+'.js'),'utf8');
 return 'window.ManabiValidators['+JSON.stringify(game.id)+']=(()=>{'+code+'\n})();';
})) : [];

const sourceDigests = new Map();
for (const rel of sourceFiles) {
  sourceDigests.set(rel, crypto.createHash('sha256').update(await fs.readFile(sourceFor(rel))).digest('hex'));
}
const buildId = crypto.createHash('sha256')
  .update(JSON.stringify({mode, config, source: [...sourceDigests], titleMode:await fs.readFile(new URL('./title-mode.mjs',import.meta.url),'utf8')}))
  .digest('hex').slice(0, 12);

const catalogContext = {window: {}};
vm.runInNewContext(await fs.readFile(path.join(source, 'profile-catalog.js'), 'utf8'), catalogContext);
const fullCatalog = catalogContext.window.ManabiProfileCatalog;
const catalogById = new Map(fullCatalog.map(game => [game.id, game]));
if (catalogById.size !== fullCatalog.length) throw Error('duplicate-game-id-in-catalog');
for (const id of config.gameIds) if (!catalogById.has(id) && !plan?.gameIds.includes(id)) throw Error(`unknown-game-id:${id}`);
const catalogGameIds = [...new Set([...config.gameIds, ...(config.staticLocalGameIds || [])])];
for (const id of config.rankingGameIds) {
  if (!catalogGameIds.includes(id)) throw Error(`ranking-game-not-published:${id}`);
}
const releaseCatalog = config.gameIds.map(id => {
  const game = (plan ? plan.catalog.find(game => game.id === id) : null) || catalogById.get(id);
  return {id, name: game.name, field: game.field || GAME_FIELDS[id] || `${id}BestStreak`, rankingEnabled: config.rankingGameIds.includes(id)};
});

if (plan) {
 await fs.rm(out,{recursive:true,force:true});
 await fs.cp(path.join(root,'preview/assets'),path.join(out,'assets'),{recursive:true});
}
const entries = [];
for (const rel of sourceFiles) {
  const input = await fs.readFile(sourceFor(rel));
  if (input.includes(0)) {
    const outputPath = path.join(out, rel);
    await fs.mkdir(path.dirname(outputPath), {recursive: true});
    await fs.writeFile(outputPath, input);
    entries.push({path: rel, sourceSHA256: sourceDigests.get(rel), outputSHA256: crypto.createHash('sha256').update(input).digest('hex')});
    continue;
  }
  const original = input.toString('utf8');
  let text = transformTitleMode(rel, original, config, await fs.readFile(path.join(source,'titles.html'),'utf8'));
  if (rel === 'environment.js') {
    text = environmentScript(config);
    if (plan) text += '\nwindow.ManabiRegistration='+JSON.stringify(config.registration)
      +';window.ManabiValidators=Object.create(null);'+validators.join('\n');
  }
  if (rel === 'profile-catalog.js') {
    const games = catalogGameIds.map(id => {
      const old = catalogById.get(id);
      const registered = plan?.catalog.find(game => game.id === id);
      return {...old, ...registered, page: old?.page ?? registered?.page, rankingEnabled: config.rankingGameIds.includes(id)};
    });
    text = `window.ManabiProfileCatalog=${JSON.stringify(games)};\n`;
  }
  if (rel.endsWith('.html')) {
    if (plan && overlay.has(rel) && rel.startsWith('games/') && !plan.gameIds.includes(path.basename(rel,'.html'))) continue;
    if (plan && config.registration.newGames.some(game => game.entry === rel)) {
      const scripts = ['public-firebase-session','public-game-availability','public-admin-settings'];
      for (const name of [...scripts,'challenge120-core','challenge120-runtime','economy-core','economy']) {
        if (!text.includes('../'+name+'.js')) throw Error('missing-registered-game-runtime:'+rel+':'+name);
      }
    }
    if (!text.includes('src="environment.js') && !text.includes('src="../environment.js')) {
      text = text.replace('<head>', `<head><script src="${rel.startsWith('games/') ? '../' : ''}environment.js"></script>`);
    }
    text = text.replace(/(<script[^>]+src="(?:\.\.\/)?economy-core\.js[^\"]*"><\/script>)/, `$1<script src="${rel.startsWith('games/') ? '../' : ''}storage-adapters.js"></script>`);
    if (plan && rel === 'science.html') text = text.replace('</head>','<script type="module" src="game-selection.js"></script></head>');
    if (mode === 'production' && rel === 'index.html') text = text.replace(/<a class="mq-admin-login"[^>]*>[\s\S]*?<\/a>/g, '');
    if (mode === 'production') {
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
  if (rel.endsWith('.html')) text = text.replace(/(href="(?:\.\.\/)?[A-Za-z0-9_-]+\.css)"/g, `$1?v=${buildId}"`);
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
  playerSyncEnabled: false,
  publicRootTouched: false,
  sourceRoot: 'shared-src/site',
  gameCatalog: releaseCatalog,
  files: entries
};
await fs.writeFile(path.join(out, 'BUILD-MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Generated ${entries.length} shared source files for ${mode}; build=${buildId}; runtimeBlocked=${blocked}; live production root untouched`);
