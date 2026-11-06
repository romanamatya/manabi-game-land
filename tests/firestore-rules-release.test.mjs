import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRulesClient, digest, publishVerified } from '../tools/firestore-rules-release.mjs';

const project = 'manabi-game-landcheck';
const root = `projects/${project}`;
const release = `${root}/releases/cloud.firestore`;
const oldName = `${root}/rulesets/old`;
const newName = `${root}/rulesets/new`;
const oldSource = 'old source\n';
const newSource = 'new source\n';

function fixture({ driftAfterCreate = false, wrongSource = false, ignorePatch = false } = {}) {
  const calls = [];
  const sources = new Map([[oldName, oldSource]]);
  let active = oldName;
  let updatedAt = 'initial';
  const client = createRulesClient(project, 'fixture-token', async (url, options) => {
    const path = url.split('/v1/')[1];
    calls.push([options.method, path]);
    let result;
    if (options.method === 'GET' && path === release) {
      result = { name: release, rulesetName: active, updateTime: updatedAt };
    } else if (options.method === 'GET' && sources.has(path)) {
      result = { name: path, source: { files: [{ name: 'firestore.rules', content: sources.get(path) }] } };
    } else if (options.method === 'POST' && path === `${root}/rulesets`) {
      const source = JSON.parse(options.body).source.files[0].content;
      sources.set(newName, wrongSource ? 'different' : source);
      if (driftAfterCreate) updatedAt = 'changed';
      result = { name: newName };
    } else if (options.method === 'PATCH' && path === `${release}?updateMask=rulesetName`) {
      const body = JSON.parse(options.body);
      assert.equal(body.release.name, release);
      if (!ignorePatch) active = body.release.rulesetName;
      result = body.release;
    } else {
      assert.fail(`Unexpected ${options.method} ${path}`);
    }
    return new Response(JSON.stringify(result));
  });
  return { client, calls };
}

test('hash preserves whitespace except CRLF conversion', () => {
  assert.equal(digest('abc\r\n'), digest('abc\n'));
  assert.notEqual(digest('abc\n'), digest('abc'));
});

test('publishes only default Firestore and can restore the immutable backup', async () => {
  const { client, calls } = fixture();
  const backup = await client.active();
  const result = await publishVerified({ client, backup, candidate: newSource });
  assert.equal(result.ruleset, newName);
  assert.equal(result.sha256, digest(newSource));
  const restored = await publishVerified({ client, backup: result, candidate: oldSource, targetRuleset: oldName });
  assert.equal(restored.ruleset, oldName);
  assert.equal(calls.filter(([method]) => method === 'POST').length, 1);
  assert.equal(calls.filter(([method]) => method === 'PATCH').length, 2);
});

for (const [option, message] of [
  ['driftAfterCreate', /changed since/],
  ['wrongSource', /does not match/],
]) {
  test(`stops before publication on ${option}`, async () => {
    const { client, calls } = fixture({ [option]: true });
    const backup = await client.active();
    await assert.rejects(publishVerified({ client, backup, candidate: newSource }), message);
    assert.equal(calls.some(([method]) => method === 'PATCH'), false);
  });
}

test('reports verification failure if the update was not observed', async () => {
  const { client } = fixture({ ignorePatch: true });
  const backup = await client.active();
  await assert.rejects(publishVerified({ client, backup, candidate: newSource, wait: async () => {} }), /verification failed/);
});
