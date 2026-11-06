import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export const digest = source =>
  createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex');

export function createRulesClient(project, token, request = fetch) {
  if (!['manabi-game-land', 'manabi-game-landcheck'].includes(project) || !token) {
    throw new Error('Invalid project or missing short-lived credentials');
  }
  const root = `projects/${project}`;
  const release = `${root}/releases/cloud.firestore`;
  const validName = name => typeof name === 'string'
    && name.startsWith(`${root}/rulesets/`)
    && /^[A-Za-z0-9_-]+$/.test(name.slice(root.length + 10));

  async function call(path, method = 'GET', body) {
    const response = await request(`https://firebaserules.googleapis.com/v1/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Rules API ${method} failed with HTTP ${response.status}`);
    return response.json();
  }

  async function readRuleset(name) {
    if (!validName(name)) throw new Error('Unexpected Ruleset name');
    const ruleset = await call(name);
    const files = ruleset.source?.files;
    if (ruleset.name !== name || files?.length !== 1 || typeof files[0].content !== 'string') {
      throw new Error('Expected one source file in the requested Ruleset');
    }
    return { ruleset: name, sha256: digest(files[0].content), source: files[0].content };
  }

  async function active() {
    const current = await call(release);
    if (current.name !== release && current.name !== `${release}/(default)`) {
      throw new Error('Unexpected release name');
    }
    const { source, ...metadata } = await readRuleset(current.rulesetName);
    return { ...metadata, updatedAt: current.updateTime ?? null };
  }

  async function create(source) {
    const result = await call(`${root}/rulesets`, 'POST', {
      source: { files: [{ name: 'firestore.rules', content: source }] },
    });
    if (!validName(result.name)) throw new Error('Unexpected new Ruleset name');
    return result.name;
  }

  async function publish(name) {
    if (!validName(name)) throw new Error('Unexpected publish target');
    await call(release, 'PATCH', {
      release: { name: release, rulesetName: name },
      updateMask: 'rulesetName',
    });
  }

  return { active, readRuleset, create, publish };
}

export async function publishVerified({ client, backup, candidate, targetRuleset, wait = delay }) {
  const expected = digest(candidate);
  async function checkUnchanged() {
    const current = await client.active();
    if (current.ruleset !== backup.ruleset || current.sha256 !== backup.sha256
        || current.updatedAt !== backup.updatedAt) {
      throw new Error('Active release changed since the approved comparison');
    }
  }
  await checkUnchanged();
  if (expected === backup.sha256 && !targetRuleset) throw new Error('Candidate is already active');
  const name = targetRuleset || await client.create(candidate);
  if ((await client.readRuleset(name)).sha256 !== expected) {
    throw new Error('Target Ruleset does not match the tested source');
  }
  await checkUnchanged();
  await client.publish(name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await client.active();
    if (current.ruleset === name && current.sha256 === expected) return current;
    if (current.ruleset !== backup.ruleset) break;
    await wait(1000);
  }
  throw new Error('Release was updated but verification failed; inspect before retrying');
}

async function main() {
  const [mode, project, baselinePath, candidatePath] = process.argv.slice(2);
  if (!['inspect', 'plan', 'deploy', 'rollback'].includes(mode)) throw new Error('Unknown mode');
  const writing = mode === 'deploy' || mode === 'rollback';
  if (writing && project !== 'manabi-game-landcheck') throw new Error('Production writes are disabled');
  const client = createRulesClient(project, process.env.RULES_ACCESS_TOKEN);
  const current = await client.active();
  if (mode === 'inspect') {
    if (process.env.RULES_BACKUP_PATH) {
      const backup = await client.readRuleset(current.ruleset);
      if (backup.sha256 !== current.sha256) throw new Error('Backup content mismatch');
      await writeFile(process.env.RULES_BACKUP_PATH, backup.source, { mode: 0o600, flag: 'wx' });
    }
    console.log(JSON.stringify({ project, ...current }));
    return;
  }

  const baseline = await readFile(baselinePath, 'utf8');
  const candidate = await readFile(candidatePath, 'utf8');
  if (digest(baseline) !== current.sha256) throw new Error('Live Rules differ from the reviewed baseline');
  const plan = { project, backup: current, candidateSha256: digest(candidate) };
  if (!writing) {
    console.log(JSON.stringify(plan));
    return;
  }
  const approved = JSON.parse(process.env.APPROVED_RULES_PLAN);
  if (approved.project !== project || approved.candidateSha256 !== plan.candidateSha256
      || approved.backup?.sha256 !== current.sha256
      || approved.backup?.ruleset !== current.ruleset
      || approved.backup?.updatedAt !== current.updatedAt) {
    throw new Error('Current plan does not match the approved plan');
  }
  const targetRuleset = mode === 'rollback' ? process.env.ROLLBACK_RULESET : undefined;
  if (mode === 'rollback' && !targetRuleset) throw new Error('Missing rollback Ruleset');
  const result = await publishVerified({ client, backup: approved.backup, candidate, targetRuleset });
  console.log(JSON.stringify({ ...plan, result }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
