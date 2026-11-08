import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const productionProject = 'manabi-game-land';
const previewProject = 'manabi-game-landcheck';
const rehearsalMarker = '\n// manabi-preview-rules-rehearsal\n';
const exec = promisify(execFile);

export const digest = source =>
  createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex');

export function createRulesClient(project, token, request = fetch, { productionWrite = false } = {}) {
  if (![productionProject, previewProject].includes(project) || !token) {
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

  function assertWriteEnabled() {
    if (project === productionProject && !productionWrite) throw new Error('Production writes are disabled');
  }

  async function create(source) {
    assertWriteEnabled();
    const result = await call(`${root}/rulesets`, 'POST', {
      source: { files: [{ name: 'firestore.rules', content: source }] },
    });
    if (!validName(result.name)) throw new Error('Unexpected new Ruleset name');
    return result.name;
  }

  async function publish(name) {
    assertWriteEnabled();
    if (!validName(name)) throw new Error('Unexpected publish target');
    await call(release, 'PATCH', {
      release: { name: release, rulesetName: name },
      updateMask: 'rulesetName',
    });
  }

  return { active, readRuleset, create, publish };
}

function sameRelease(current, expected) {
  return current.ruleset === expected?.ruleset && current.sha256 === expected?.sha256
    && current.updatedAt === expected?.updatedAt;
}

class ReleaseChangedError extends Error {}

export function assertApprovedPlan(approved, currentPlan) {
  if (approved?.project !== currentPlan.project || approved.commit !== currentPlan.commit
      || approved.operation !== currentPlan.operation || approved.targetRuleset !== currentPlan.targetRuleset
      || approved.candidateSha256 !== currentPlan.candidateSha256
      || !sameRelease(currentPlan.backup, approved.backup)) {
    throw new Error('Current plan does not match the approved plan');
  }
}

export async function verifyPublished(client, expected) {
  const current = await client.active();
  if (!expected?.result || current.ruleset !== expected.result.ruleset
      || current.sha256 !== expected.candidateSha256 || !sameRelease(current, expected.result)) {
    throw new Error('Read-only verification did not match the publication receipt');
  }
  return current;
}

export async function publishVerified({ client, backup, candidate, targetRuleset, wait = delay }) {
  const expected = digest(candidate);
  async function checkUnchanged() {
    const current = await client.active();
    if (!sameRelease(current, backup)) {
      throw new ReleaseChangedError('Active release changed since the approved comparison');
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

export async function rehearsePreview({ client, validate, record = () => {}, exerciseDrift = false, approved }) {
  const backup = await client.active();
  const { source, sha256 } = await client.readRuleset(backup.ruleset);
  if (sha256 !== backup.sha256 || digest(source) !== backup.sha256) {
    throw new Error('Preview backup content mismatch');
  }
  if (source.replace(/\r\n/g, '\n').endsWith(rehearsalMarker)) {
    throw new Error('The previous rehearsal copy is still active; inspect its backup before proceeding');
  }

  const candidate = source + rehearsalMarker;
  const plan = {
    project: previewProject, commit: process.env.GITHUB_SHA ?? null, operation: 'rehearse',
    targetRuleset: null, backup, candidateSha256: digest(candidate),
  };
  if (approved) assertApprovedPlan(approved, plan);
  record({ phase: 'compare', ...plan });
  await validate(source);
  await validate(candidate);
  const deployed = await publishVerified({ client, backup, candidate });
  record({ phase: 'deployed', deployed });
  try {
    if (exerciseDrift) {
      try {
        // Treat the comment-only publication as a competing update to the approved snapshot.
        await publishVerified({ client, backup, candidate });
        throw new Error('The stale plan unexpectedly proceeded');
      } catch (error) {
        if (!(error instanceof ReleaseChangedError)) throw error;
        if (!sameRelease(await client.active(), deployed)) {
          throw new Error('The active preview release changed during the drift check');
        }
        record({ phase: 'drift-rejected', active: deployed });
      }
    }
  } finally {
    const restored = await publishVerified({
      client, backup: deployed, candidate: source, targetRuleset: backup.ruleset,
    });
    record({ phase: 'restored', restored });
  }
}

async function validateWithEmulator(source) {
  const directory = await mkdtemp(join(tmpdir(), 'manabi-rules-rehearsal-'));
  try {
    const file = join(directory, 'firestore.rules');
    await writeFile(file, source, { mode: 0o600 });
    // Keep live credentials and OIDC variables out of the Emulator process.
    const env = Object.fromEntries(
      ['PATH', 'HOME', 'JAVA_HOME', 'LANG', 'TMPDIR', 'CI']
        .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]),
    );
    await exec('./node_modules/.bin/firebase', [
      'emulators:exec', '--project', 'demo-manabi-rules-release', '--only', 'firestore',
      '--config', 'firebase/rules-release-emulator.json', 'node --test tools/firestore-rules-release-emulator.mjs',
    ], { env: { ...env, RULES_PROFILE: 'preview', RULES_TEST_SOURCE: file }, timeout: 60_000 });
  } catch {
    // Compiler errors can contain lines of the fetched rules.
    throw new Error('Preview Rules did not pass the private Emulator check; nothing was published');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function main() {
  const [mode, project, baselinePath, candidatePath] = process.argv.slice(2);
  if (!['inspect', 'plan', 'deploy', 'rollback', 'rehearse', 'rehearse-plan', 'verify'].includes(mode)) throw new Error('Unknown mode');
  const writing = mode === 'deploy' || mode === 'rollback';
  const productionWrite = writing && project === productionProject
    && process.env.RULES_PRODUCTION_WRITE_ENABLED === 'true'
    && process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' && process.env.GITHUB_REF === 'refs/heads/main';
  if (project === productionProject && ((writing && !productionWrite) || mode.startsWith('rehearse'))) {
    throw new Error('Production writes are disabled');
  }
  const client = createRulesClient(project, process.env.RULES_ACCESS_TOKEN, fetch, { productionWrite });
  if (mode === 'rehearse') {
    await rehearsePreview({
      client, validate: validateWithEmulator, exerciseDrift: true,
      approved: JSON.parse(process.env.APPROVED_RULES_PLAN), record: entry => console.log(JSON.stringify(entry)),
    });
    return;
  }
  if (mode === 'verify') {
    const receipt = JSON.parse(process.env.RULES_PUBLICATION_RECEIPT);
    if (receipt.project !== project || receipt.commit !== process.env.GITHUB_SHA) {
      throw new Error('Publication receipt belongs to another project or commit');
    }
    console.log(JSON.stringify({ project, verified: await verifyPublished(client, receipt) }));
    return;
  }
  const current = await client.active();
  if (mode === 'rehearse-plan') {
    const { source, sha256 } = await client.readRuleset(current.ruleset);
    if (sha256 !== current.sha256 || source.replace(/\r\n/g, '\n').endsWith(rehearsalMarker)) {
      throw new Error('Inspect the preview backup before proceeding');
    }
    console.log(JSON.stringify({
      project, commit: process.env.GITHUB_SHA ?? null, operation: 'rehearse', targetRuleset: null,
      backup: current, candidateSha256: digest(source + rehearsalMarker),
    }));
    return;
  }
  if (mode === 'inspect') {
    if (baselinePath && digest(await readFile(baselinePath, 'utf8')) !== current.sha256) {
      throw new Error('Live Rules differ from the reviewed baseline');
    }
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
  const operation = writing ? mode : process.env.RULES_PLANNED_OPERATION ?? mode;
  const targetRuleset = operation === 'rollback' ? process.env.ROLLBACK_RULESET : null;
  if (operation === 'rollback' && !targetRuleset) throw new Error('Missing rollback Ruleset');
  const plan = {
    project, commit: process.env.GITHUB_SHA ?? null, operation, targetRuleset,
    backup: current, candidateSha256: digest(candidate),
  };
  if (operation === 'rollback' && (await client.readRuleset(targetRuleset)).sha256 !== plan.candidateSha256) {
    throw new Error('Rollback Ruleset does not match the tested source');
  }
  if (!writing) {
    console.log(JSON.stringify(plan));
    return;
  }
  const approved = JSON.parse(process.env.APPROVED_RULES_PLAN);
  assertApprovedPlan(approved, plan);
  const result = await publishVerified({ client, backup: approved.backup, candidate, targetRuleset });
  console.log(JSON.stringify({ ...plan, result }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
