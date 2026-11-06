import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);

test('parallelPair files and settings match the reviewed release candidate', async () => {
  const manifest = JSON.parse(await readFile(new URL('docs/parallel-stage4-manifest.json', root), 'utf8'));
  const sharedRuntimeFiles = new Set(['challenge120-core.js', 'economy-core.js', 'profile-catalog.js', 'public-admin-settings.js', 'ranking-sync-api.js']);
  for (const file of manifest.files) {
    if (sharedRuntimeFiles.has(file.path)) continue;
    const bytes = await readFile(new URL(file.path, root));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
  }

  const window = {};
  const environment = await readFile(new URL('environment.js', root), 'utf8');
  vm.runInNewContext(environment, {window, location: {pathname: '/games/parallelPair.html'}});
  const config = window.MANABI_BACKEND_CONFIG;
  assert.equal(config.expectedProjectId, 'manabi-game-land');
  assert.equal(config.parallelPairRankingEnabled, true);
  assert.ok(config.gameIds.includes('parallelPair'));
  assert.ok(config.rankingGameIds.includes('parallelPair'));
  assert.ok(!config.staticLocalGameIds.includes('parallelPair'));
});
