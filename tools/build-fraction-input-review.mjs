import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const source = new URL('../shared-src/site/', import.meta.url);
const read = file => readFile(new URL(file, source), 'utf8');
const output = path.resolve(process.argv[2] || '.release/manabi-fraction-input-review.html');
const inline = code => '<script>\n' + code.replace(/<\/script/ig, '<\\/script') + '\n</script>';
const sandbox = { window: {} };
vm.runInNewContext(await read('profile-catalog.js'), sandbox);
const catalog = sandbox.window.ManabiProfileCatalog.filter(game => game.id === 'fractionTransformInput');
if (catalog.length !== 1 || catalog[0].titles.length !== 5) throw Error('unexpected-review-catalog');
for (const title of catalog[0].titles) {
  if (!/^assets\/fraction-transform-input-titles\/[a-z0-9_]+\.png$/.test(title.image)) throw Error('unexpected-review-art');
  const png = await readFile(new URL(title.image, source));
  title.image = 'data:image/png;base64,' + png.toString('base64');
}

let html = await read('games/fractionTransformInput.html');
html = html.replace(/<script[^>]*\ssrc="[^"]+"[^>]*><\/script>/g, '')
  .replace(/<a href="[^"]+" class="back">[^<]*<\/a>/, '<span class="back">オフライン確認版</span>')
  .replace(/(<meta http-equiv="Content-Security-Policy" content=")[^"]+/,
    "$1default-src 'none'; connect-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; object-src 'none'; base-uri 'none'; form-action 'none'");
const css = await read('fraction-transform-input.css');
html = html.replace(/<link rel="stylesheet"[^>]*>/, '<style>\n' + css + '\n</style>');

const classic = await Promise.all(['economy-core.js', 'storage-adapters.js', 'economy.js',
  'challenge120-core.js', 'celebration-effects.js'].map(read));
const files = ['title-progress-model.js', 'fraction-transform-input-model.js', 'fraction-round.js', 'fraction-transform-input-game.js'];
const modules = await Promise.all(files.map(async file => {
  let code = (await read(file)).replace(/^import .+ from ['"]\.\/[^'"]+['"];\r?\n/gm, '')
    .replace(/^export (?=(?:const|function) )/gm, '');
  if (file === 'fraction-round.js') {
    const relativeImage = "image.src = '../' + title.image;";
    if (!code.includes(relativeImage)) throw Error('offline-title-image-hook-missing');
    code = code.replace(relativeImage, 'image.src = title.image;');
  }
  if (/^\s*(?:export|import)\b/m.test(code)) throw Error('unexpected-module-syntax:' + file);
  return code;
}));
const boot = `
  window.MANABI_ENV = Object.freeze({preview:true, environment:'preview'});
  window.MANABI_BACKEND_CONFIG = Object.freeze({
    expectedProjectId:'manabi-game-landcheck', staticLocalGameIds:['fractionTransformInput'],
    rankingsRetired:true, campaignsEnabled:false, playerSyncEnabled:false,
  });
  window.ManabiProfileCatalog = ${JSON.stringify(catalog)};
  window.ManabiPublicSettings = Object.freeze({
    async subscribeGame(id, onValue) {
      if (id !== 'fractionTransformInput') throw Error('unsupported-offline-game');
      onValue({exists:()=>true, data:()=>({status:'published'}), metadata:{fromCache:false}});
      return () => {};
    },
  });
  const offlinePrefix = 'manabi_fraction_input_review:';
  const memory = new Map();
  window.manabiStorage = Object.freeze({
    getItem(key) {
      if (memory.has(key)) return memory.get(key);
      try { return localStorage.getItem(offlinePrefix + key); } catch { return null; }
    },
    setItem(key, value) {
      memory.set(key, String(value));
      try { localStorage.setItem(offlinePrefix + key, value); } catch {}
    },
    removeItem(key) {
      memory.delete(key);
      try { localStorage.removeItem(offlinePrefix + key); } catch {}
    },
  });
`;
html = html.replace('</head>', () => inline(boot) + classic.map(inline).join('\n') +
  inline('document.addEventListener("DOMContentLoaded", () => {\n"use strict";\n' + modules.join('\n') + '\n});') + '</head>');
if (/<(?:script|link|a)\b[^>]*(?:src|href)=/i.test(html) || !html.includes("connect-src 'none'")) {
  throw Error('offline-review-has-external-dependency');
}
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, html);
console.log(output);
