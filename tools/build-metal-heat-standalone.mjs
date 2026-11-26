// Generate a single-file review from the same code that's used in the game.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const preview = path.join(root, 'preview');
const output = path.resolve(process.argv[2] ?? path.join(root, '.release/manabi-metal-heat-review.html'));
const read = name => readFile(path.join(preview, name), 'utf8');
const inline = code => '<script>\n' + code.replace(/<\/script/gi, '<\\/script') + '\n</script>';
function replaceOne(source, oldText, newText) {
  if (!source.includes(oldText) || source.indexOf(oldText) !== source.lastIndexOf(oldText)) {
    throw new Error('Offline build expected exactly one occurrence of ' + oldText);
  }
  return source.replace(oldText, () => newText);
}

let html = await read('games/metalHeat.html');
const policy = "default-src 'none'; connect-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; object-src 'none'; base-uri 'none'; form-action 'none'";
html = html.replace(/(<meta http-equiv="Content-Security-Policy" content=")[^"]+/, '$1' + policy);
html = replaceOne(html, '<a href="../science.html" class="back">← 理科へ</a>', '<span class="back">理科</span>');
html = replaceOne(html, '<h1>金ぞくのあたたまり方</h1>', '<h1>金ぞくのあたたまり方</h1><span>確認版・端末内保存</span>');

const catalogSource = await read('profile-catalog.js');
const catalog = JSON.parse(catalogSource.match(/^window\.ManabiProfileCatalog\s*=\s*(\[.*\]);?$/m)[1].replace(/;$/, ''));
const game = catalog.find(item => item.id === 'metalHeat');
if (!game || game.rankingEnabled !== false || game.titles.length !== 5) {
  throw new Error('Missing title catalog for offline review');
}
for (const title of game.titles) {
  if (!/^assets\/[\w/-]+\.(?:svg|png)$/.test(title.image)) throw new Error('Invalid title image path');
  const mime = title.image.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
  title.image = 'data:' + mime + ';base64,' + (await readFile(path.join(preview, title.image))).toString('base64');
}

const bootstrap = `
  window.MANABI_ENV = Object.freeze({preview:true, environment:'preview'});
  window.MANABI_BACKEND_CONFIG = Object.freeze({
    expectedProjectId:'manabi-game-landcheck', staticLocalGameIds:['metalHeat'],
    rankingsRetired:true, campaignsEnabled:false, playerSyncEnabled:false
  });
  window.ManabiProfileCatalog = ${JSON.stringify([game])};
  window.ManabiPublicSettings = Object.freeze({
    async subscribeGame(id, receive) {
      if (id !== 'metalHeat') throw new Error('Unsupported offline game');
      receive({exists:()=>true, data:()=>({status:'published'}), metadata:{fromCache:false}});
      return () => {};
    }
  });
  (() => {
    const prefix = 'manabi_offline_review:metalHeat:';
    const memory = new Map();
    window.manabiStorage = Object.freeze({
      getItem(key) {
        if (memory.has(key)) return memory.get(key);
        try { return localStorage.getItem(prefix + key); } catch { return null; }
      },
      setItem(key, value) {
        const text = String(value);
        memory.set(key, text);
        try { localStorage.setItem(prefix + key, text); } catch {}
      },
      removeItem(key) {
        memory.delete(key);
        try { localStorage.removeItem(prefix + key); } catch {}
      }
    });
  })();
`;

const scripts = ['economy-core.js', 'storage-adapters.js', 'economy.js', 'challenge120-core.js', 'celebration-effects.js'];
const skipped = new Set(['environment.js', 'environment-runtime.js', 'profile-catalog.js', 'public-firebase-session.js',
  'public-game-availability.js', 'public-admin-settings.js', 'fraction-public-settings.js', 'metal-heat-game.js', ...scripts]);
for (const tag of [...html.matchAll(/<script(?: type="module")? src="\.\.\/([^"?]+)(?:\?[^"]+)?"><\/script>/g)]) {
  if (!skipped.has(tag[1])) throw new Error('Unknown offline script dependency: ' + tag[1]);
  html = html.replace(tag[0], '');
}
for (const tag of [...html.matchAll(/<link rel="stylesheet" href="\.\.\/([^"?]+)(?:\?[^"]+)?">/g)]) {
  const css = await read(tag[1]);
  if (/\burl\s*\(|@import\b/i.test(css)) throw new Error('External stylesheet dependency: ' + tag[1]);
  html = replaceOne(html, tag[0], '<style>\n' + css + '\n</style>');
}
const classic = await Promise.all(scripts.map(read));
const modules = [];
for (const filename of ['title-progress-model.js', 'metal-heat-model.js', 'fraction-round.js', 'metal-heat-game.js']) {
  let code = (await read(filename)).replace(/^import .+ from ['"]\.\/[^'"]+['"];\r?\n/gm, '')
    .replace(/^export (?=(?:const|function) )/gm, '');
  if (filename === 'fraction-round.js') code = replaceOne(code, "image.src = '../' + title.image;", 'image.src = title.image;');
  if (/\b(?:import\s*\(|^import |^export )/m.test(code)) throw new Error('Unbundled module: ' + filename);
  modules.push(code);
}

html = replaceOne(html, '</head>', inline(bootstrap) + classic.map(inline).join('\n') +
  inline('document.addEventListener("DOMContentLoaded", () => {\n"use strict";\n' + modules.join('\n') + '\n});') + '\n</head>');
if (!html.includes(policy) || /<(?:script|link|a)\b[^>]*(?:src|href)=/i.test(html)) {
  throw new Error('Offline review contains an external page dependency');
}
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, html);
console.log(output);
