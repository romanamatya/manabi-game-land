import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);

test('parallelPair files and settings match the reviewed release candidate', async () => {
  const manifest = JSON.parse(await readFile(new URL('docs/parallel-stage4-manifest.json', root), 'utf8'));
  const sharedRuntimeFiles = new Set(['environment.js', 'management-model.js', 'challenge120-core.js', 'economy-core.js', 'profile-catalog.js', 'public-admin-settings.js', 'ranking-sync-api.js', 'parallel-game.js', 'parallel.css', 'games/parallelPair.html']);
  for (const file of manifest.files) {
    if (sharedRuntimeFiles.has(file.path)) continue;
    let bytes = await readFile(new URL(file.path, root));
    if (file.path === 'math-navigation.js') {
      // Remove the later geometry entries and navigation badges from the reviewed menu.
      bytes = Buffer.from(bytes.toString('utf8')
        .replace("if(window.MANABI_BACKEND_CONFIG?.staticLocalGameIds?.includes('verticalParallel'))units.find(unit=>unit.id==='geometry').games.push('verticalParallel');\r\n", '')
        .replace("if(window.MANABI_BACKEND_CONFIG?.staticLocalGameIds?.includes('quadrilateral'))units.find(unit=>unit.id==='geometry').games.push('quadrilateral');\r\n", '')
        .replace("if(window.MANABI_BACKEND_CONFIG?.staticLocalGameIds?.includes('heikouPair'))units.find(unit=>unit.id==='geometry').games.push('heikouPair');\r\n", '')
        .replace("if(window.MANABI_BACKEND_CONFIG?.staticLocalGameIds?.includes('shikakkeSecrets'))units.find(unit=>unit.id==='geometry').games.push('shikakkeSecrets');\r\n", '')
        .replace("shikakkeSecrets:'対角線・垂直・平行のひみつを見つけよう',", '')
        .replace("heikouPair:'角の大きさと場所をくらべて、平行な直線を見つけよう',", '')
        .replace("quadrilateral:'平行四辺形とひし形の辺の長さや角を見つけよう',", '')
        .replace("verticalParallel:'赤い基準線を見て、垂直・平行な線を選ぼう',", '')
        .replace('!window.MANABI_BACKEND_CONFIG?.rankingsRetired&&', '')
        .replace("if(id!=='verticalParallel'&&id!=='quadrilateral'&&g?.rankingPending!==true){const rank", 'const rank')
        .replace('actions.append(rank)}', 'actions.append(rank)')
        .replace(/if\(!inUnit\)\{[\s\S]*?(?=const displayNames=)/,
          'if(!inUnit){for(const u of units)root.append(card(u.name,u.description,u.page));return}\n')
        .replace(' item.append(summary,badge,actions);\n root.append(item);',
          ' item.append(summary,badge,actions);root.append(item);'));
    }
    if (file.path === 'parallel-ranking.js') {
      // Isolate the legacy ranking path from the separately gated challenge ranking.
      bytes = Buffer.from(bytes.toString('utf8')
        .replace('config?.rankingsRetired!==true&&', '')
        .replace(/^import .*challenge-ranking\.js[^\n]*\n/, '')
        .replace(/ if\(challengeRankingEnabled\(GAME\)\)\{[\s\S]*? \} else \{\n/, '')
        .replace(/ \}\n\}\n$/, '}\n'));
    }
    if (file.path === 'celebration-effects.js') {
      // The artwork uses a single fit box now. Keep checking the reviewed effect and timer.
      bytes = Buffer.from(bytes.toString('utf8').replaceAll('.mgl-celebration__art > ', '.mgl-celebration__art '));
    }
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
  }

  const window = {};
  const environment = await readFile(new URL('environment.js', root), 'utf8');
  vm.runInNewContext(environment, {window, location: {pathname: '/games/parallelPair.html'}});
  const config = window.MANABI_BACKEND_CONFIG;
  assert.equal(config.expectedProjectId, 'manabi-game-land');
  assert.equal(config.parallelPairRankingEnabled, false);
  assert.ok(config.gameIds.includes('parallelPair'));
  assert.equal(config.rankingsRetired, true);
  assert.equal(config.rankingGameIds.length, 0);
  assert.ok(!config.staticLocalGameIds.includes('parallelPair'));

  const settings = {...config};
  delete settings.rankingsRetired;
  settings.rankingSyncEnabled=true;
  settings.parallelPairRankingEnabled=true;
  settings.rankingGameIds=['keisan','pref-name','pref-place','alphabet','distribution','distribution2','exchangeAssociation','kotowaza','multiplicationProperties','shapeExpressions','keisanSummary','suichoku','parallelPair','missingAlphabet'];
  assert.equal(settings.staticLocalGameIds.filter(id=>id==='verticalParallel').length,1);
  settings.staticLocalGameIds=settings.staticLocalGameIds.filter(id=>!['verticalParallel','quadrilateral','heikouPair','shikakkeSecrets'].includes(id));
  for (const key of ['gameIds','rankingGameIds']) {
    assert.equal(settings[key].filter(id=>id==='missingAlphabet').length,1);
    settings[key]=settings[key].filter(id=>id!=='missingAlphabet');
  }
  assert.equal(settings.missingAlphabetRankingSyncEnabled,false);
  assert.deepEqual([...settings.challenge120GameIds],['missingAlphabet']);
  assert.deepEqual([...settings.managedVisibilityGameIds], ['parallelPair','missingAlphabet','verticalParallel','quadrilateral','heikouPair','shikakkeSecrets']);
  delete settings.managedVisibilityGameIds;
  delete settings.missingAlphabetRankingSyncEnabled;
  delete settings.challenge120GameIds;
  const prior = environment.replace(/MANABI_BACKEND_CONFIG=Object.freeze\(\{[^\n]+?\}\);/, 'MANABI_BACKEND_CONFIG=Object.freeze('+JSON.stringify(settings)+');');
  assert.equal(createHash('sha256').update(prior).digest('hex'),manifest.files.find(file=>file.path==='environment.js').sha256);

});
