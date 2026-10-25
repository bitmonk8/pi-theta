#!/usr/bin/env node
// Local workflow control plane. Astra supplies bounded decisions, not Git authority.
// The owner grants standing commit/push permission through the saved ship option.
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync, renameSync, realpathSync, copyFileSync, lstatSync, readlinkSync } from 'node:fs';
import { resolve, join, isAbsolute, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { updatePiConfig } from './update-pi-config.mjs';
import { prepareWorktreeEnvironment } from './worktree-env.mjs';

export function command(argv, cwd, timeout = 30 * 60 * 1000, env = process.env) {
  if (!Array.isArray(argv) || !argv.length || argv.some(x => typeof x !== 'string')) throw new Error('Command must be a nonempty argv array');
  const r = spawnSync(argv[0], argv.slice(1), { cwd, encoding: 'utf8', env, timeout, maxBuffer: 64 * 1024 * 1024 });
  return { code: r.error || r.signal ? -1 : r.status, output: (r.stdout ?? '') + (r.stderr ?? ''), error: r.error?.message };
}
export function worktreePath(root, name) {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Invalid dedicated worktree name');
  return join(root, '.trees', name);
}
export function prepareWorktreePath(root, name) {
  const path = worktreePath(root, name);
  const folder = join(root, '.trees');
  try {
    const info = lstatSync(folder);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('.trees must be a real directory, not a symlink');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (command(['git', 'check-ignore', '--quiet', '--no-index', '--', '.trees/' + name], root).code !== 0
      || git(root, 'ls-files', '--', '.trees')) throw new Error('Worktrees require a gitignored, untracked .trees/ directory; add /.trees/ to .gitignore');
  mkdirSync(folder, { recursive: true });
  return path;
}
function git(root, ...args) {
  const r = command(['git', ...args], root);
  if (r.code !== 0) throw new Error(`git ${args[0]} failed: ${r.output}`);
  return r.output.trim();
}
function json(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function save(path, value) {
  const temporary = path + '.' + randomUUID() + '.tmp';
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n');
  renameSync(temporary, path);
}
function stateRevision(state) { return { revision: state.revision ?? 0, generation: state.generation ?? 0 }; }
function persistState(run, state, expected, beforeWrite) {
  const guard = join(run, 'state-write');
  try { mkdirSync(guard); } catch { throw new Error('Another state write is in progress; reconcile a stale state-write marker only after all commands stopped'); }
  try {
    const current = stateRevision(json(join(run, 'state.json')));
    if (current.revision !== expected.revision || current.generation !== expected.generation) throw new Error('Stale controller invocation: state changed while this command was running');
    beforeWrite?.();
    state.revision = expected.revision + 1;
    save(join(run, 'state.json'), state);
    Object.assign(expected, stateRevision(state));
  } finally { rmSync(guard, { recursive: true }); }
}
function changes(root) {
  const tracked = git(root, 'diff', '--name-only', 'HEAD', '-z').split('\0');
  const extra = git(root, 'ls-files', '--others', '--exclude-standard', '-z').split('\0');
  return [...new Set([...tracked, ...extra].filter(Boolean))].sort();
}
function digest(root, paths) {
  return createHash('sha256').update(paths.map(p => p + '\0' + (existsSync(join(root, p)) ? readFileSync(join(root, p)).toString('base64') : '<deleted>')).join('\0')).digest('hex');
}
function stagedPaths(root) {
  const result = command(['git', 'diff', '--cached', '--name-only', '--no-renames', '-z'], root);
  if (result.code !== 0) throw new Error('Cannot inspect staging index: ' + result.output);
  return result.output.split('\0').filter(Boolean).sort();
}
function verifyShippingIndex(root, verifiedPaths, complete = false) {
  const staged = stagedPaths(root);
  const blocked = message => { throw new Error('Shipment blocked by existing/unexpected staged changes: ' + message + '. Nothing was reset or discarded; inspect and reconcile the index manually.'); };
  if (staged.some(path => !verifiedPaths.includes(path))) blocked('staged paths outside the exact verified working-tree diff');
  if (complete && JSON.stringify(staged) !== JSON.stringify([...verifiedPaths].sort())) blocked('scoped git add did not stage exactly all verified paths');
  if (git(root, 'ls-files', '--unmerged', '-z')) blocked('unmerged index entries');
  for (const path of staged) {
    const entries = git(root, 'ls-files', '--stage', '-z', '--', path).split('\0').filter(Boolean);
    let info;
    try { info = lstatSync(join(root, path)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!info) { if (entries.length) blocked('staged deletion differs from verified working-tree deletion: ' + path); continue; }
    if ((!info.isFile() && !info.isSymbolicLink()) || entries.length !== 1) blocked('unsupported or missing staged file: ' + path);
    const [mode, oid, stage] = entries[0].split('\t')[0].split(' ');
    const expectedMode = info.isSymbolicLink() ? '120000' : info.mode & 0o100 ? '100755' : '100644';
    const bytes = info.isSymbolicLink() ? Buffer.from(readlinkSync(join(root, path))) : readFileSync(join(root, path));
    // Hash the literal verified bytes, not a filtered/normalized rendition.
    // This also catches partial staging and an index-only edit restored in the
    // working tree. Never reset somebody else's index to make shipping succeed.
    const hashed = spawnSync('git', ['hash-object', '--stdin'], { cwd: root, input: bytes, encoding: 'utf8' });
    if (hashed.status !== 0 || stage !== '0' || mode !== expectedMode || oid !== hashed.stdout.trim()) blocked('index bytes/mode differ from the verified working tree: ' + path);
  }
  return { staged, index: git(root, 'ls-files', '--stage', '-z'), status: git(root, 'status', '--porcelain=v1', '-z') };
}
function specFiles(root) {
  return git(root, 'ls-files', '-z', '--', 'docs/spec.md', 'docs/spec_topics', 'docs/reference').split('\0').filter(Boolean);
}
export function validateWitnesses(value) {
  if (!Array.isArray(value.e2e) || value.e2e.length === 0) throw new Error('At least one end-to-end witness is mandatory');
  if (!Array.isArray(value.unit)) throw new Error('unit must be an array');
  if (!value.unit.length && !value.unit_omission_reason?.trim()) throw new Error('Explain why unit isolation is not meaningful');
  for (const w of [...value.e2e, ...value.unit]) {
    if (!Array.isArray(w.argv) || !w.argv.length || w.argv.some(x => typeof x !== 'string')) throw new Error('Witness argv required');
    if (typeof w.failure_pattern !== 'string' || !w.failure_pattern.trim()) throw new Error('Specific assertion failure pattern required');
    new RegExp(w.failure_pattern);
  }
  if (typeof value.live_required !== 'boolean' || !Array.isArray(value.live)) throw new Error('Declare live_required and live argv arrays');
  if (value.live_required && !value.live.length) throw new Error('Live-exercised changes require live commands');
}
export function approved(text, label) { return text.trim() === `User selected: 2. ${label}`; }
export function parseBugRequest(text) {
  // The manifest is the entire remainder, not shell words: spaces are valid
  // path bytes, while line breaks cannot cross the four-line theta protocol.
  const batch = /^(batch|batch-resume)[ \t]+([^\r\n]+)$/.exec(text.trim());
  if (batch) {
    const manifest = batch[2];
    if (!isAbsolute(manifest) || resolve(manifest) !== manifest || /[\x00-\x1f\x7f]/.test(manifest)) throw new Error('Batch requires a canonical absolute manifest path');
    return [batch[1] === 'batch-resume' ? 'BATCH_RESUME' : 'BATCH', manifest, 'false', '5'].join('\n');
  }
  const words = text.trim().split(/\s+/);
  const resume = words[0] === 'resume';
  let start = 1;
  let id = resume ? '' : words[0];
  if (resume && /^\d{1,4}$/.test(words[1] ?? '')) { id = words[1]; start = 2; }
  if (!resume && !/^\d{1,4}$/.test(id ?? '')) throw new Error('Usage: /fix-bug [number | resume [number]] [ship true|false] [review_rounds 1..5]');
  let ship = resume ? 'keep' : 'true'; let rounds = resume ? 'keep' : '5'; const seen = new Set();
  for (let i = start; i < words.length; i += 2) {
    const key = words[i]; const value = words[i + 1];
    if (seen.has(key)) throw new Error('Duplicate option: ' + key);
    seen.add(key);
    if (key === 'ship' && /^(true|false)$/.test(value ?? '')) ship = value;
    else if (key === 'review_rounds' && /^[1-5]$/.test(value ?? '')) rounds = value;
    else throw new Error('Invalid option/value: ' + key);
  }
  return [resume ? 'RESUME' : 'FIX', id ? id.padStart(4, '0') : '', ship, rounds].join('\n');
}
export function listOpenBugs(root) {
  return bugReports(root).filter(r => r.open).map(r => `${r.id} ${r.title}`).join('\n') || 'No open bugs.';
}
function bugReports(root) {
  return readdirSync(join(root, 'docs/bugs')).sort().flatMap(filename => {
    const match = /^(\d{4})-(.+)\.md$/.exec(filename);
    if (!match) return [];
    const path = 'docs/bugs/' + filename;
    const bytes = readFileSync(join(root, path));
    const text = bytes.toString('utf8');
    const status = /^- \*\*Status:\*\*[ \t]*([^\r\n]+)/m.exec(text)?.[1].trim() ?? 'unknown';
    return [{ id: match[1], title: match[2].replaceAll('-', ' '), filename, path, bytes, text, status, open: /^open\b/.test(status) }];
  });
}
function rankingInput(root) {
  const reports = bugReports(root);
  const open = reports.filter(r => r.open);
  if (!open.length) return 'EMPTY';
  if (new Set(open.map(r => r.id)).size !== open.length) throw new Error('Open bug numbers are ambiguous; reconcile duplicate reports before ranking');
  const referenced = new Set(open.flatMap(r => [...r.text.matchAll(/\b\d{4}\b/g)].map(m => m[0])));
  const selected = reports.filter(r => r.open || referenced.has(r.id));
  const folder = join(root, '.pi/tmp', 'bugfix-ranking-' + randomUUID());
  mkdirSync(join(folder, 'reports'), { recursive: true });
  const entries = selected.map(r => {
    const snapshot = join(folder, 'reports', r.filename);
    writeFileSync(snapshot, r.bytes);
    return { id: r.id, title: r.title, path: r.path, status: r.status, snapshot };
  });
  // Hash exactly the captured bytes, not a second read that could race a change.
  const sourceDigest = createHash('sha256').update(selected.map(r => r.path + '\0' + r.bytes.toString('base64')).join('\0')).digest('hex');
  const catalog = join(folder, 'catalog.json');
  save(catalog, { version: 1, root, open: entries.filter(e => open.some(r => r.path === e.path)), related: entries.filter(e => !open.some(r => r.path === e.path)), sourcePaths: selected.map(r => r.path), sourceDigest });
  return catalog;
}
function renderRanking(root, catalogPath) {
  const catalog = json(catalogPath);
  if (catalog.version !== 1 || catalog.root !== root || !Array.isArray(catalog.open) || !catalog.open.length) throw new Error('Invalid ranking input snapshot');
  const current = bugReports(root).filter(r => r.open).map(r => [r.id, r.path]);
  if (JSON.stringify(current) !== JSON.stringify(catalog.open.map(r => [r.id, r.path])) || digest(root, catalog.sourcePaths) !== catalog.sourceDigest) throw new Error('Bug reports changed during ranking; rerun /fix-bug for a fresh assessment');
  const text = readFileSync(catalogPath + '.ranking.tsv', 'utf8');
  const [version, ...lines] = text.trimEnd().split('\n');
  if (version !== 'RANK1') throw new Error('Invalid ranking response version');
  const bugs = []; const edges = []; const guidance = [];
  const short = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit && !/[\x00-\x1f\x7f]/.test(value);
  for (const line of lines) {
    const fields = line.split('\t');
    if (fields[0] === 'BUG' && fields.length === 5 && ['true', 'false'].includes(fields[3]) && short(fields[4], 260)) bugs.push({ id: fields[1], severity: fields[2], provisional: fields[3] === 'true', reason: fields[4] });
    else if (fields[0] === 'EDGE' && fields.length === 4 && short(fields[3], 260)) edges.push({ before: fields[1], after: fields[2], reason: fields[3] });
    else if (fields[0] === 'GUIDE' && fields.length === 2 && short(fields[1], 360)) guidance.push(fields[1]);
    else throw new Error('Malformed or overlong ranking response; no partial list displayed');
  }
  const byId = new Map(catalog.open.map(r => [r.id, r]));
  if (bugs.length !== byId.size || new Set(bugs.map(r => r.id)).size !== byId.size || bugs.some(r => !byId.has(r.id))) throw new Error('Ranking must include every current open bug exactly once, and no closed or invented bugs');
  const severity = ['critical', 'high', 'medium', 'low'];
  let previous = -1;
  for (const bug of bugs) {
    const level = severity.indexOf(bug.severity);
    if (level < 0 || level < previous) throw new Error('Ranking severity order is invalid');
    previous = level;
  }
  if (!guidance.length || guidance.length > 8) throw new Error('Ranking must include concise fix-order guidance');
  const pairs = new Set();
  for (const edge of edges) {
    const pair = edge.before + ':' + edge.after;
    if (!byId.has(edge.before) || !byId.has(edge.after) || edge.before === edge.after || pairs.has(pair)) throw new Error('Invalid or duplicate prerequisite edge; resolved prerequisites belong in guidance, not the work queue');
    pairs.add(pair);
  }
  const done = new Set();
  while (done.size < byId.size) {
    let progress = false;
    for (const id of byId.keys()) if (!done.has(id) && edges.every(e => e.after !== id || done.has(e.before))) { done.add(id); progress = true; }
    if (!progress) throw new Error('Fix-order prerequisites contain a cycle; no contradictory guidance displayed');
  }
  const listing = [
    'OPEN BUGS — SEVERITY RANKING (most severe first)',
    'Impact-based estimates from current reports, not a reproduction verdict or a sort of filed S-labels.',
    '',
    ...bugs.flatMap((bug, index) => [`${index + 1}. ${bug.id} — ${byId.get(bug.id).title} [${bug.severity.toUpperCase()}${bug.provisional ? '; provisional' : ''}]`, `   ${bug.reason}`]),
    '', 'FIX-ORDER GUIDANCE (severity order is not necessarily implementation order)',
    ...edges.map(e => `- ${e.before} before ${e.after}: ${e.reason}`),
    ...guidance.map(note => '- ' + note),
  ].join('\n');
  if (Buffer.byteLength(listing, 'utf8') > 60000) throw new Error('Ranked list exceeds the display budget; inspect the ranking artifacts instead');
  return listing;
}
const PHASES = new Set(['reproduce', 'diagnose', 'plan', 'implement', 'repair', 'close']);
function assertControls(state) {
  const original = root => root && JSON.stringify(controlPaths(root)) === JSON.stringify(state.controlPaths) && state.controlPaths.every(path => localText(root, path, null) !== null) && digest(root, state.controlPaths) === state.controlDigest;
  // A repair never alters the retained source's controls or original digest.
  if (!original(state.root)) throw new Error('Workflow/control files changed since this run started; reconcile manually');
  const parent = state.batchRun ? JSON.parse(localText(state.ownerRoot, state.batchRun.slice(state.ownerRoot.length + 1) + '/state.json')) : null;
  const latest = parent?.workflowUpgrades?.at(-1);
  if (original(state.ownerRoot) && !latest) return;
  if (!state.batchRun) throw new Error('Workflow/control files changed since this run started; reconcile manually');
  const manifest = batchManifest(state.ownerRoot, state.batchManifest, false);
  if (manifest.batchRun !== state.batchRun || manifest.id !== state.id || manifest.base !== state.base || manifest.manifestDigest !== state.batchManifestDigest) throw new Error('Workflow upgrade belongs to a different batch/source');
  const claim = JSON.parse(localText(state.ownerRoot, state.batchRun.slice(state.ownerRoot.length + 1) + '/jobs/' + state.id + '.launch/owner.json') ?? 'null');
  const run = join(state.ownerRoot, '.pi/tmp', basename(state.root));
  if (claim?.run !== run || claim.version !== 1 || claim.batchRun !== state.batchRun || claim.id !== state.id || claim.manifest !== state.batchManifest || claim.manifestDigest !== state.batchManifestDigest || claim.base !== state.base || parent.jobs?.[state.id]?.sourceRun !== run) throw new Error('Workflow upgrade requires the original registered launch claim');
  const ownerPaths = executionControlPaths(state.ownerRoot);
  const union = new Set([...controlPaths(state.root), ...ownerPaths]);
  if (!latest || !/^[0-9a-f]{40,64}$/.test(latest.base ?? '') || !/^[0-9a-f]{40,64}$/.test(latest.sha ?? '') || command(['git', 'merge-base', '--is-ancestor', latest.base, latest.sha], state.ownerRoot).code !== 0 || command(['git', 'merge-base', '--is-ancestor', latest.sha, parent.base], state.ownerRoot).code !== 0 || !Array.isArray(latest.ownerControls)) throw new Error('Missing authenticated owner workflow upgrade');
  const entries = latest.ownerControls;
  if (entries.some(item => !item || !union.has(item.path) || !/^[0-9a-f]{64}$/.test(item.digest ?? '')) || new Set(entries.map(item => item.path)).size !== entries.length || [...state.controlPaths, ...ownerPaths].some(path => !entries.some(item => item.path === path))) throw new Error('Invalid owner workflow control path union/subset');
  if (latest.path || latest.digest) {
    if (!latest.path?.startsWith(state.batchRun + '/') || resolve(latest.path) !== latest.path) throw new Error('Invalid workflow upgrade artifact path');
    const raw = localText(state.ownerRoot, latest.path.slice(state.ownerRoot.length + 1));
    const record = raw && JSON.parse(raw);
    if (hash(raw ?? '') !== latest.digest || record?.base !== latest.base || record.sha !== latest.sha || JSON.stringify(record.ownerControls) !== JSON.stringify(entries)) throw new Error('Workflow upgrade artifact changed');
  }
  // Check every captured control, including one deleted from the owner after
  // adoption (existence-filtered current paths alone would miss that loss).
  for (const entry of entries) {
    const bytes = localText(state.ownerRoot, entry.path, null);
    if (bytes === null || hash(bytes) !== entry.digest) throw new Error('Owner workflow controls differ from the latest authenticated upgrade');
  }
}
function assertOwner(state) {
  // A settled batch source retains its original verified base, while earlier
  // integrations in the same wave legitimately advance main. The parent lease
  // and registered manifest are checked separately by assertLease; only the
  // parent's durably recorded current main is an accepted owner advancement.
  const expected = state.batchRun ? json(join(state.batchRun, 'state.json')).base : state.ownerBase;
  if (git(state.ownerRoot, 'rev-parse', 'HEAD') !== expected || git(state.ownerRoot, 'branch', '--show-current') !== state.ownerBranch) throw new Error('Owner HEAD/branch changed during workflow; stop and inspect');
}
function controlPaths(root) {
  return ['tools/bugfix/run.mjs', 'tools/bugfix/worktree-env.mjs', 'tools/bugfix/update-pi-config.mjs', '.pi/theta/fix-bug.theta', '.pi/theta/workers/bugfix-stage.theta', '.pi/theta/workers/bugfix-review.theta', '.pi/theta/workers/bugfix-rank.theta', '.pi/theta/workers/bugfix-decide.theta'].filter(p => existsSync(join(root, p)));
}
export function executionControlPaths(root) {
  return [...new Set([...controlPaths(root), 'tools/bugfix/batch.mjs', '.pi/theta/fix-all-bugs.theta', '.pi/theta/workers/bugfix-batch-plan.theta', '.pi/theta/workers/bugfix-batch-lane.theta', '.pi/theta/workers/bugfix-batch-merge.theta'])].filter(path => existsSync(join(root, path))).sort();
}
function leasePath(run, state) { return state.batchRun ? join(run, 'lease') : join(state.ownerRoot, '.pi/tmp/fix-bug.lock'); }
function batchManifest(cwd, manifestPath, requireCurrentBase = true) {
  const ownerRoot = git(cwd, 'rev-parse', '--show-toplevel');
  if (!isAbsolute(manifestPath) || resolve(manifestPath) !== manifestPath) throw new Error('Batch manifest path must be canonical and absolute');
  if (!manifestPath.startsWith(ownerRoot + '/')) throw new Error('Batch manifest must be inside the original owner checkout');
  const raw = localText(ownerRoot, manifestPath.slice(ownerRoot.length + 1), null);
  if (raw === null) throw new Error('Missing batch manifest');
  const rawDigest = hash(raw); // register and interpret the very same raw bytes
  const manifest = JSON.parse(raw.toString('utf8'));
  const { batchRun, id, base } = manifest;
  const batchHome = join(ownerRoot, '.pi/tmp');
  if (manifest.version !== 1 || manifest.ownerRoot !== ownerRoot || typeof batchRun !== 'string' || !/^fix-all-bugs-[0-9a-f-]{36}$/.test(batchRun.slice(batchHome.length + 1)) || !batchRun.startsWith(batchHome + '/') || resolve(batchRun) !== batchRun || !/^\d{4}$/.test(id) || !/^[0-9a-f]{40,64}$/.test(base) || manifest.review_rounds !== 5 || manifestPath !== join(batchRun, 'jobs', id + '.json')) throw new Error('Invalid batch job manifest');
  // localText walks all components from the trusted checkout, rejecting links.
  const parentRaw = localText(ownerRoot, batchRun.slice(ownerRoot.length + 1) + '/state.json');
  const parent = parentRaw === null ? null : JSON.parse(parentRaw);
  const entry = parent?.jobs?.[id];
  if (parent?.version !== 1 || parent.root !== ownerRoot || entry?.manifest !== manifestPath || entry.manifestDigest !== rawDigest) throw new Error('Batch manifest is not registered with its exact immutable digest');
  // Only launch admission requires a scheduled, unfinished parent. Settled
  // exports still authenticate this immutable identity after job/main advances.
  if (requireCurrentBase && (parent.finished || entry.status !== 'scheduled')) throw new Error('Batch launch requires an unfinished parent and a scheduled job');
  const owner = JSON.parse(localText(ownerRoot, '.pi/tmp/fix-bug.lock/owner.json') ?? 'null');
  if (owner?.run !== batchRun || owner.kind !== 'batch') throw new Error('Batch does not own the checkout lease');
  const current = git(ownerRoot, 'rev-parse', 'HEAD');
  const upgrade = entry.launchUpgrade;
  const adopted = requireCurrentBase && upgrade?.base === base && (parent.workflowUpgrades ?? []).some(item => item.base === base && item.sha === upgrade.sha) && command(['git', 'merge-base', '--is-ancestor', upgrade.sha, parent.base], ownerRoot).code === 0;
  if (git(ownerRoot, 'branch', '--show-current') !== 'main' || current !== parent.base || (requireCurrentBase && current !== base && !adopted)) throw new Error('Batch job base must equal current owner main HEAD or its authenticated parent advancement');
  return { ...manifest, manifest: manifestPath, manifestDigest: rawDigest };
}
function claimBatchLaunch(cwd, batch, run) {
  // Serialize launch admission with the parent's finish transaction. A claim is
  // a permanent at-most-once tombstone, including when any later init step fails.
  // Parent reconciliation reads jobs/ID.launch/owner.json to find the source run;
  // an empty/malformed claim must likewise block release, never imply no launch.
  const guard = join(batch.batchRun, 'controller.lock');
  // Four independent lanes can reach admission together. Wait briefly for
  // another lane's tiny admission transaction, but never remove a busy/stale
  // controller marker or wait unboundedly for a long-running operation.
  const deadline = Date.now() + 1000;
  while (true) {
    try { mkdirSync(guard); break; }
    catch (error) {
      if (error.code !== 'EEXIST' || Date.now() >= deadline) throw new Error('Another batch controller operation is in progress; do not remove lock while commands are active');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  try {
    const current = batchManifest(cwd, batch.manifest);
    if (JSON.stringify(current) !== JSON.stringify(batch)) throw new Error('Batch manifest changed before launch admission');
    const claim = join(batch.batchRun, 'jobs', batch.id + '.launch');
    try { mkdirSync(claim); } catch { throw new Error('Batch job already has a launch claim; reconcile its original source run, never replay start-file'); }
    save(join(claim, 'owner.json'), { version: 1, batchRun: batch.batchRun, id: batch.id, manifest: batch.manifest, manifestDigest: batch.manifestDigest, base: batch.base, run, pid: process.pid });
    const parent = json(join(batch.batchRun, 'state.json'));
    parent.jobs[batch.id].sourceRun = run;
    parent.revision++; save(join(batch.batchRun, 'state.json'), parent);
  } finally { rmSync(guard, { recursive: true }); }
}
function assertLease(run, state, settledBatchExport = false) {
  if (state.batchRun) {
    const manifest = batchManifest(state.ownerRoot, state.batchManifest, false);
    if (manifest.batchRun !== state.batchRun || manifest.id !== state.id || manifest.base !== state.base || manifest.manifestDigest !== state.batchManifestDigest || state.options?.ship !== false || state.options?.review_rounds !== 5) throw new Error('Batch run identity/options changed');
    const claim = JSON.parse(localText(state.ownerRoot, state.batchRun.slice(state.ownerRoot.length + 1) + '/jobs/' + state.id + '.launch/owner.json') ?? 'null');
    if (claim?.version !== 1 || claim.run !== run || claim.batchRun !== state.batchRun || claim.id !== state.id || claim.manifest !== state.batchManifest || claim.manifestDigest !== state.batchManifestDigest || claim.base !== state.base) throw new Error('Batch launch claim does not own this source run');
    // ship false releases execution ownership, not the parent batch's exact
    // registered job. Only its export/commit hooks may use this settled handoff.
    if (settledBatchExport && !existsSync(join(run, 'active'))) return;
  }
  if (JSON.parse(localText(leasePath(run, state), 'owner.json') ?? 'null')?.run !== run) throw new Error('Run does not own this checkout');
}
function stagePaths(phase) { return [`stage-${phase}-result.txt`, `${phase}.md`, ...(phase === 'plan' ? ['spec-proposal.md'] : [])]; }
// Decision snapshots are controller-owned, run-local authority, never Git or
// release authority. Do not let supplied paths turn this into a general reader.
const DECISION_PHASES = new Set([...PHASES, 'evidence', 'fix', 'final', 'scope']);
const DECISION_LIMITS = [
  'Only the exact archived proposal/request is authorized; absent a request, retry within existing scope only.',
  'Specification edits require the exact approved plan/spec-proposal.md; stage requests cannot approve a new contract.',
  'No commit, push, tag, publication, shipment approval, or other Git/release authority.',
  'No waiver of witnesses, red proof, mandatory gates, independent reviews, checkpoint or integrity checks.',
  'Do not replace/relax witnesses.json, original red proofs, completed plans, or prior decision/owner records.',
  'New or expanded scope requires a fresh request and decision; authority is local to this run.',
];
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function localText(directory, name, encoding = 'utf8') {
  const path = join(directory, name);
  // Walk every component: even an innocent fixed filename must not follow an
  // attacker-controlled parent symlink out of the checkout/run.
  let current = resolve(directory);
  for (const part of name.split('/')) {
    if (!part || part === '.' || part === '..') throw new Error('Invalid local artifact path');
    current = join(current, part);
    let info;
    try { info = lstatSync(current); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    if (info.isSymbolicLink()) throw new Error('Decision artifacts cannot be symlinks: ' + name);
  }
  if (!lstatSync(path).isFile()) throw new Error('Decision artifact must be a regular file: ' + name);
  return readFileSync(path, encoding);
}
function checkoutIdentity(root, reference) {
  const tracked = reference ? git(root, 'ls-tree', '-r', '--name-only', '-z', reference) : git(root, 'ls-files', '-z');
  const paths = [...new Set([...tracked.split('\0'), ...changes(root), ...(reference ? git(root, 'diff', '--name-only', '--no-renames', '-z', reference, 'HEAD').split('\0') : [])].filter(Boolean))].sort();
  const inventory = paths.map(path => {
    let info;
    try { info = lstatSync(join(root, path)); } catch (error) { if (error.code === 'ENOENT') return { path, type: 'deleted' }; throw error; }
    if (info.isSymbolicLink()) return { path, type: 'symlink', target: readlinkSync(join(root, path)) };
    if (!info.isFile()) throw new Error('Decision checkout contains an unsupported file type: ' + path);
    return { path, type: 'file', mode: info.mode & 0o777, digest: hash(readFileSync(join(root, path))) };
  });
  return { inventory, digest: hash(JSON.stringify(inventory)), index: git(root, 'ls-files', '--stage', '-z'), status: git(root, 'status', '--porcelain=v1', '-z') };
}
function isSpecDecision(context) { return context.phase === 'plan' && context.status === 'needs_spec'; }
function decisionLabel(context) { return isSpecDecision(context) ? 'Approve proposed spec changes' : 'Approve recommended scoped decision'; }
function decisionMaterial(run, state, phase, options = {}) {
  if (!DECISION_PHASES.has(phase)) throw new Error('Unknown decision phase');
  assertControls(state);
  if (state.stages.includes('red')) redEvidence(run, state);
  for (const [name, checkpoint] of Object.entries(state.checkpoints ?? {})) {
    if (['pass', 'needs_spec', 'needs_decision', 'needs_replan'].includes(checkpoint.status) && digest(run, stagePaths(name)) !== checkpoint.reportDigest) throw new Error('Completed stage report/result changed: ' + name);
  }
  const request = localText(run, 'decision-request.md');
  const status = phase === 'scope' ? 'needs_decision' : state.checkpoints?.[phase]?.status ?? null;
  if (status === 'needs_replan') throw new Error('Typed scope revision requires stage-replan, fresh PLAN/evidence review and a scope decision before authorization');
  if (status === 'needs_decision' && !request?.trim()) throw new Error('needs_decision requires a nonempty decision-request.md');
  if (status === 'needs_decision' && (phase === 'scope' ? state.pendingScopeReplan?.exactRequest : state.checkpoints[phase].decisionRequest) !== request) throw new Error('Decision request changed since the stage checkpoint');
  const reportName = ({ evidence: 'evidence-review.md', fix: 'reviews.md', final: 'final-review.md', scope: 'plan.md' })[phase] ?? phase + '.md';
  const specDecision = isSpecDecision({ phase, status });
  const proposalName = specDecision ? 'spec-proposal.md' : request?.trim() ? 'decision-request.md' : reportName;
  const proposal = localText(run, proposalName);
  if (!proposal?.trim()) throw new Error('Nonempty decision proposal/report required: ' + proposalName);
  // Owner rulings/addenda are run-local (ignored by Git) but still governing
  // decision inputs. Snapshot additions as well as changes, not just one common
  // filename; a later sidecar ruling must invalidate an in-flight assessment.
  const precedentNames = readdirSync(run).filter(name => /^(?:owner(?:-[a-z0-9-]+)?|plan-[a-z0-9-]+-addendum)\.md$/i.test(name)).sort();
  const artifactNames = [...new Set([
    ...[...PHASES].flatMap(stagePaths), ...precedentNames, 'decision-request.md', 'spec-revision-proposal.md',
    'witnesses.json', 'evidence-review.md', 'evidence-review-result.json', 'reviews.md', 'fix-review.md', 'final-review.md',
    'spec-answer.txt', 'owner-decision.md', 'decision-authorizations.md',
  ])];
  const artifacts = Object.fromEntries(artifactNames.map(name => [name, localText(run, name)]));
  const proofNames = readdirSync(run).filter(name => /^(?:red-\d+|green-\d+-\d+|gate-\d+-[a-z]+-\d+)\.json$/.test(name)).sort();
  const proofs = proofNames.map(path => ({ path, digest: hash(localText(run, path)) }));
  const records = validateDecisionIntegrity(run, state, options);
  if (Object.hasOwn(options, 'authorizationText')) artifacts['decision-authorizations.md'] = options.authorizationText;
  const { decisionContexts: _contexts, ...authorityState } = state;
  const principlePaths = ['AGENTS.md', 'docs/principles.md', 'docs/reference/principles.md'];
  if (!/^docs\/bugs\/\d{4}-[^/]+\.md$/.test(state.bug)) throw new Error('Invalid bug report path');
  return {
    root: state.root, base: state.base, id: state.id, branch: state.branch, phase, status,
    head: git(state.root, 'rev-parse', 'HEAD'), currentBranch: git(state.root, 'branch', '--show-current'),
    report: localText(run, reportName), reportPath: reportName,
    proposal, proposalPath: proposalName,
    request: { type: specDecision ? 'exact-spec-proposal' : request?.trim() ? 'exact-scoped-request' : 'existing-scope-retry', exact: proposal, limits: DECISION_LIMITS },
    artifacts, proofs, records,
    bug: { path: state.bug, text: localText(state.root, state.bug) },
    principles: principlePaths.map(path => ({ path, text: localText(state.root, path) })).filter(item => item.text !== null),
    specReferences: specFiles(state.root).map(path => ({ path })),
    authority: { ...stateRevision(state), stateDigest: hash(JSON.stringify(authorityState)), checkpoints: state.checkpoints, decisions: state.decisions ?? [], specApproved: state.specApproved ?? false, approvedProposal: state.approvedProposal ?? null, controlPaths: state.controlPaths, controlDigest: digest(state.root, state.controlPaths), lease: localText(leasePath(run, state), 'owner.json'), active: localText(run, 'active/owner.json') },
    checkout: checkoutIdentity(state.root),
  };
}
function validateVerdict(value) {
  const keys = ['disposition', 'clear_preference', 'has_tradeoff', 'evidence_sufficient', 'summary', 'recommendation', 'rationale', 'basis', 'alternatives'];
  const text = (s, max) => typeof s === 'string' && s.trim().length > 0 && s.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s);
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new Error('Decision verdict fields do not match the strict schema');
  if (!['continue', 'human', 'blocked'].includes(value.disposition) || ['clear_preference', 'has_tradeoff', 'evidence_sufficient'].some(key => typeof value[key] !== 'boolean')) throw new Error('Invalid decision disposition/flags');
  if (!text(value.summary, 4000) || !text(value.recommendation, 8000) || !text(value.rationale, 16000)) throw new Error('Decision summary/recommendation/rationale must be nonempty bounded strings');
  for (const [key, min] of [['basis', 1], ['alternatives', 2]]) {
    if (!Array.isArray(value[key]) || value[key].length < min || value[key].length > 20 || value[key].some(item => !text(item, 4000)) || new Set(value[key].map(item => item.trim())).size !== value[key].length) throw new Error('Invalid decision ' + key);
  }
  if (value.disposition === 'continue' && (!value.clear_preference || value.has_tradeoff || !value.evidence_sufficient)) throw new Error('Continue requires a clear preference, no tradeoff, and sufficient evidence');
  if (value.disposition === 'human' && (value.clear_preference || !value.has_tradeoff || !value.evidence_sufficient)) throw new Error('Human choice requires an evidenced unresolved tradeoff; missing evidence is blocked, not approval');
  return value;
}
function decisionContext(run, state, path) {
  // Only helper-minted context names in this run may be presented for approval.
  const full = resolve(path ?? '');
  const relative = full.slice(run.length + 1);
  if (!full.startsWith(run + '/') || !/^decision-[0-9a-f-]{36}\/context\.json$/.test(relative)) throw new Error('Context path must be a helper-minted decision in this run');
  const entry = state.decisionContexts?.[relative];
  if (!entry || entry.path !== full) throw new Error('Unknown decision context');
  const raw = localText(run, relative);
  if (!raw || hash(raw) !== entry.digest) throw new Error('Immutable decision context changed');
  const context = JSON.parse(raw);
  if (context.version !== 1 || full !== join(run, 'decision-' + context.decisionId, 'context.json')) throw new Error('Invalid decision context identity');
  return { full, relative, entry, context, raw, folder: full.slice(0, -'/context.json'.length) };
}
function assertDecisionCurrent(run, state, context, expectedDigest) {
  const current = decisionMaterial(run, state, context.phase);
  const { version: _version, decisionId: _id, ...material } = context;
  if (hash(JSON.stringify(current)) !== (expectedDigest ?? hash(JSON.stringify(material)))) throw new Error('Stale decision: state, request, authority, checkpoint, HEAD/branch, control files, or checkout changed');
  return current;
}
function decisionCommitFence(run, priorState, selected, baseline, verdictRaw, history, answerRaw) {
  // Recheck under the state-write guard immediately before accepting. Exclude
  // only the one history file the helper just rendered itself; all input state,
  // originals, source bytes, request, branch/index and checkout remain fenced.
  decisionContext(run, priorState, selected.full);
  if (localText(run, selected.relative + '.verdict.json') !== verdictRaw || localText(run, 'decision-authorizations.md') !== history) throw new Error('Decision inputs/history changed during recording');
  if (answerRaw !== undefined && localText(run, selected.relative + '.answer.txt') !== answerRaw) throw new Error('Human answer changed during recording');
  const current = decisionMaterial(run, priorState, selected.context.phase, { authorizationText: baseline.artifacts['decision-authorizations.md'] });
  if (hash(JSON.stringify(current)) !== hash(JSON.stringify(baseline))) throw new Error('Decision context changed during recording');
}
function decisionOutcome(verdict) { return verdict.disposition === 'blocked' ? 'BLOCKED' : 'CONTINUE'; }
function decisionAuthority(context, verdict, source) {
  return { source, phase: context.phase, type: context.request.type, exactRequest: context.proposal, proposalPath: context.proposalPath, recommendation: verdict.recommendation, rationale: verdict.rationale, limits: DECISION_LIMITS, gitAuthority: false, provisional: source === 'astra' && verdict.disposition === 'human' };
}
function pendingApprovals(records) {
  return records.filter(item => item.record.source === 'astra' && item.record.verdict.disposition === 'human' && !records.some(answer => answer.contextPath === item.contextPath && answer.record.source === 'human'));
}
function approvalReport(records) {
  const pending = pendingApprovals(records);
  if (!pending.length) return 'CLEAR';
  return ['PENDING OWNER APPROVAL — shipment blocked', 'Implementation proceeded provisionally in the exact recorded scope; no shipment authority was granted.', ...pending.flatMap((item, index) => {
    const { record } = item;
    return ['', `${index + 1}. ${record.phase}: ${record.verdict.summary}`, `Context: ${record.contextPath}`, `Record: ${item.path}`, `Scope (${record.authority.type}): ${record.authority.exactRequest}`, `Recommendation: ${record.verdict.recommendation}`, `Rationale: ${record.verdict.rationale}`, 'Basis:', ...record.verdict.basis.map(text => '- ' + text), 'Alternatives/tradeoff:', ...record.verdict.alternatives.map(text => '- ' + text)];
  })].join('\n');
}
function requireDecisionApproval(run, state, context) {
  if (!isSpecDecision(context) && context.phase !== 'scope' && !(context.phase === 'plan' && state.pendingScopeReplan)) return;
  requireCleanEvidenceReview(run, state);
  if (context.phase === 'scope' && (!state.pendingScopeReplan || context.proposal !== state.pendingScopeReplan.exactRequest)) throw new Error('Scope decision must authorize the exact independently reviewed replan request');
}
function authorizationText(records) {
  const lines = ['# Run-local decision authorizations', '', ...DECISION_LIMITS.map(line => '- ' + line), '', '# History'];
  for (const item of records) {
    const record = item.record;
    lines.push('', `## ${record.outcome} — ${record.phase} (${record.source})`, `Record: ${item.path}`, `Rationale: ${record.verdict.rationale}`, `Recommendation: ${record.verdict.recommendation}`);
    if (record.authority) lines.push(`Authority type: ${record.authority.type}`, ...(record.authority.provisional ? ['PROVISIONAL IMPLEMENTATION ONLY — pending owner approval; shipment blocked.'] : []), '', 'Exact authorized request/proposal:', record.authority.exactRequest);
    else lines.push('No approval or expanded scope granted.');
  }
  return lines.join('\n') + '\n';
}
function renderAuthorizations(run, state) {
  const records = (state.decisions ?? []).map(item => ({ ...item, record: JSON.parse(localText(run, item.path.slice(run.length + 1))) }));
  writeFileSync(join(run, 'decision-authorizations.md'), authorizationText(records));
}
// Pure validation of persisted authority: never reconstruct current decision
// material here (that would recurse and incorrectly expire historical records).
function validateDecisionIntegrity(run, state, options = {}) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const records = []; const seen = new Set();
  for (const item of state.decisions ?? []) {
    const relative = typeof item.path === 'string' ? item.path.slice(run.length + 1) : '';
    if (!item.path?.startsWith(run + '/') || !/^decision-[0-9a-f-]{36}\/(?:human-)?record\.json$/.test(relative) || seen.has(item.path)) throw new Error('Invalid or duplicate run-local decision record');
    seen.add(item.path);
    const raw = localText(run, relative);
    if (!raw || hash(raw) !== item.digest) throw new Error('Prior decision record changed');
    const record = JSON.parse(raw);
    const selected = decisionContext(run, state, record.contextPath);
    const { context, entry } = selected;
    const human = record.source === 'human';
    if (record.version !== 1 || !['astra', 'human'].includes(record.source) || item.path !== join(selected.folder, human ? 'human-record.json' : 'record.json')) throw new Error('Invalid archived decision identity');
    const required = ['context.json', 'verdict.json', human ? 'human-authority.json' : 'authority.json', ...(human ? ['answer.txt'] : [])].sort();
    if (!same(Object.keys(record.artifactDigests ?? {}).sort(), required)) throw new Error('Incomplete prior decision evidence');
    for (const name of required) {
      const text = localText(run, relative.slice(0, relative.lastIndexOf('/')) + '/' + name);
      if (text === null || hash(text) !== record.artifactDigests[name]) throw new Error('Prior decision evidence changed');
    }
    const verdict = validateVerdict(JSON.parse(localText(run, relative.replace(/(?:human-)?record\.json$/, 'verdict.json'))));
    const outcome = human ? 'CONTINUE' : decisionOutcome(verdict);
    const expectedAuthority = outcome === 'CONTINUE' ? decisionAuthority(context, verdict, record.source) : null;
    const requestType = isSpecDecision(context) ? 'exact-spec-proposal' : context.artifacts['decision-request.md']?.trim() ? 'exact-scoped-request' : 'existing-scope-retry';
    const proposalPath = isSpecDecision(context) ? 'spec-proposal.md' : requestType === 'exact-scoped-request' ? 'decision-request.md' : context.reportPath;
    if (!DECISION_PHASES.has(context.phase) || context.root !== state.root || context.base !== state.base || context.branch !== state.branch || context.id !== state.id || context.request?.type !== requestType || context.proposalPath !== proposalPath || context.proposal !== context.artifacts[proposalPath] || context.request.exact !== context.proposal || !same(context.request.limits, DECISION_LIMITS)) throw new Error('Invalid archived decision scope');
    if (record.phase !== context.phase || record.outcome !== outcome || !same(record.verdict, verdict) || !same(record.authority, expectedAuthority) || entry.digest !== record.artifactDigests['context.json'] || entry.verdictDigest !== record.artifactDigests['verdict.json']) throw new Error('Archived decision verdict/authority mismatch');
    const authorityFile = JSON.parse(localText(run, relative.replace(/(?:human-)?record\.json$/, human ? 'human-authority.json' : 'authority.json')));
    if (!same(authorityFile, expectedAuthority)) throw new Error('Archived decision authority changed');
    if (human) {
      const original = records.find(prior => prior.path === join(selected.folder, 'record.json'));
      if (verdict.disposition !== 'human' || original?.record.authority?.provisional !== true || !approved(localText(run, relative.replace(/human-record\.json$/, 'answer.txt')), decisionLabel(context))) throw new Error('Invalid archived human approval');
    }
    const indexed = { contextPath: record.contextPath, outcome, phase: context.phase, source: record.source, authority: expectedAuthority, rationale: verdict.rationale };
    if (Object.entries(indexed).some(([key, value]) => !same(item[key], value))) throw new Error('Decision index differs from immutable record');
    records.push({ ...item, record });
  }
  for (const [relative, entry] of Object.entries(state.decisionContexts ?? {})) {
    const selected = decisionContext(run, state, join(run, relative));
    const own = records.filter(item => item.contextPath === selected.full);
    const status = own.length ? own.at(-1).source === 'human' ? 'answered' : own.at(-1).record.verdict.disposition : 'pending';
    if (entry.status !== status) throw new Error('Decision registration differs from archived history');
  }
  const history = Object.hasOwn(options, 'authorizationText') ? options.authorizationText : localText(run, 'decision-authorizations.md');
  if ((records.length || history !== null) && history !== authorizationText(records)) throw new Error('Worker-facing decision-authorizations.md changed or has no matching decision records');
  if (state.pendingScopeReplan) {
    const pending = state.pendingScopeReplan;
    const archive = state.planArchives?.find(item => item.path === pending.archive && item.reason === 'stage-scope-replan');
    if (!archive || !['implement', 'repair'].includes(pending.phase) || pending.requestDigest !== hash(pending.exactRequest) || hash(pending.exactRequest) !== archive.files['decision-request.md']) throw new Error('Pending replan request differs from its immutable original');
  }
  for (const archive of state.planArchives ?? []) {
    if (!archive.path?.startsWith(run + '/history/') || resolve(archive.path) !== archive.path) throw new Error('Invalid plan archive');
    for (const [name, expected] of Object.entries(archive.files)) {
      if (hash(localText(run, archive.path.slice(run.length + 1) + '/' + name) ?? '') !== expected) throw new Error('Original plan/replan history changed');
    }
  }
  return records;
}
function currentPlan(run, state) {
  const checkpoint = state.checkpoints?.plan;
  if (state.replanRequired || !['pass', 'needs_spec', 'needs_decision'].includes(checkpoint?.status) || digest(run, stagePaths('plan')) !== checkpoint.reportDigest) throw new Error('Evidence review requires a completed, current plan checkpoint');
  return checkpoint;
}
function evidenceReviewResult(run, ok) {
  const raw = localText(run, 'evidence-review-result.json');
  const report = localText(run, 'evidence-review.md');
  const review = raw === null ? null : JSON.parse(raw);
  if (review?.ok !== ok || typeof review.findings !== 'string' || !review.findings.trim() || report !== review.findings) throw new Error('Missing matching ' + (ok ? 'clean' : 'failed') + ' independent evidence review result/report');
  return { review, raw, report, reportDigest: digest(run, ['evidence-review-result.json', 'evidence-review.md']) };
}
function requireCleanEvidenceReview(run, state) {
  const plan = currentPlan(run, state);
  const review = evidenceReviewResult(run, true);
  const binding = state.evidenceReviewBinding;
  if (!binding || binding.generation !== (state.generation ?? 0) || binding.planDigest !== plan.reportDigest || binding.reportDigest !== review.reportDigest || binding.checkoutDigest !== hash(JSON.stringify(checkoutIdentity(state.root)))) throw new Error('Specification approval requires a current clean evidence-review-record binding; rerun independent evidence review');
}
function requireReplanInputs(run, state) {
  if (!state.replanRequired || !state.replanFeedback) return;
  const feedback = state.replanFeedback;
  if (!feedback.path?.startsWith(run + '/') || resolve(feedback.path) !== feedback.path || hash(localText(run, feedback.path.slice(run.length + 1)) ?? '') !== feedback.digest) throw new Error('Exact replan feedback changed before/during PLAN');
  if (feedback.checkoutDigest !== hash(JSON.stringify(checkoutIdentity(state.root)))) throw new Error('Replanning is read-only; checkout/index changed since the accepted evidence decision');
}
function archivePlan(run, state, reason, additional = {}) {
  const checkpoint = currentPlan(run, state);
  const path = join(run, 'history', 'plan-' + randomUUID());
  mkdirSync(path, { recursive: true });
  const files = {};
  const artifacts = { ...Object.fromEntries([...stagePaths('plan'), 'decision-request.md', 'evidence-review.md', 'evidence-review-result.json'].map(name => [name, localText(run, name)])), ...additional, 'original-plan-decision-request.md': checkpoint.decisionRequest ?? null, 'checkpoint.json': JSON.stringify({ reason, checkpoint }, null, 2) + '\n' };
  for (const [name, text] of Object.entries(artifacts)) if (text !== null) {
    writeFileSync(join(path, name), text, { flag: 'wx' }); files[name] = hash(text);
  }
  state.planArchives = [...(state.planArchives ?? []), { path, reason, checkpoint, files }];
  return path;
}
function stageReplan(run, state, phase) {
  if (!['implement', 'repair'].includes(phase)) throw new Error('Only implementation/repair may request a scope replan');
  const checkpoint = state.checkpoints?.[phase];
  const request = localText(run, 'decision-request.md');
  if (!['needs_replan', 'needs_decision', 'blocked'].includes(checkpoint?.status) || !request?.trim() || checkpoint.decisionRequest !== request || digest(run, stagePaths(phase)) !== checkpoint.reportDigest) throw new Error('Scope replan requires the unchanged completed stage and its exact recorded request');
  if (checkpoint.checkoutDigest !== digest(state.root, changes(state.root))) throw new Error('Scope replan stage checkout changed since its exact request was recorded');
  validateDecisionIntegrity(run, state);
  if (state.stages.includes('red')) redEvidence(run, state);
  // No CONTINUE is inferred from a blocked legacy decision. Replanning only
  // grants report-writing; the new plan must earn review and exact authority.
  const archive = archivePlan(run, state, 'stage-scope-replan', {
    [phase + '.md']: localText(run, phase + '.md'),
    ['stage-' + phase + '-result.txt']: localText(run, 'stage-' + phase + '-result.txt'),
    'stage-checkpoint.json': JSON.stringify(checkpoint, null, 2) + '\n',
  });
  const feedbackPath = join(archive, 'decision-request.md');
  state.pendingScopeReplan = { phase, exactRequest: request, requestDigest: hash(request), archive };
  state.replanFeedback = { path: feedbackPath, digest: hash(request), archive, checkoutDigest: hash(JSON.stringify(checkoutIdentity(state.root))) };
  delete state.scopeReplanAuthorization;
  delete state.checkpoints.plan;
  delete state.evidenceReviewBinding;
  state.replanRequired = true;
}
function requireScopeApproval(run, state) {
  if (!state.pendingScopeReplan) return;
  const request = state.pendingScopeReplan;
  const approval = state.scopeReplanAuthorization;
  const decision = state.decisions?.find(item => item.path === approval?.decisionPath);
  if (!approval || approval.planDigest !== state.checkpoints.plan?.reportDigest || approval.requestDigest !== hash(request.exactRequest) || decision?.phase !== 'scope' || decision.outcome !== 'CONTINUE' || decision.authority?.exactRequest !== request.exactRequest) throw new Error('Revised implementation scope requires fresh plan/evidence review and exact scope authorization');
}
function archiveDecision(run, state, selected, verdict, source, verdictRaw, answerRaw) {
  const { context, folder, entry } = selected;
  const outcome = source === 'human' ? 'CONTINUE' : decisionOutcome(verdict);
  const authority = outcome === 'CONTINUE' ? decisionAuthority(context, verdict, source) : null;
  // Deferred owner confirmation settles the historical provisional decision; it
  // must not re-authorize an obsolete spec proposal over a later approved plan.
  const specApproval = source === 'astra' && authority && isSpecDecision(context);
  if (source === 'astra' && authority) requireDecisionApproval(run, state, context);
  const prefix = source === 'human' ? 'human-' : '';
  const artifactDigests = { 'context.json': entry.digest };
  if (source === 'human') {
    writeFileSync(join(folder, 'answer.txt'), answerRaw, { flag: 'wx' });
    artifactDigests['answer.txt'] = hash(answerRaw);
    artifactDigests['verdict.json'] = entry.verdictDigest;
  } else {
    writeFileSync(join(folder, 'verdict.json'), verdictRaw, { flag: 'wx' });
    artifactDigests['verdict.json'] = hash(verdictRaw);
    entry.verdictDigest = hash(verdictRaw);
  }
  const authorityRaw = JSON.stringify(authority, null, 2) + '\n';
  writeFileSync(join(folder, prefix + 'authority.json'), authorityRaw, { flag: 'wx' });
  artifactDigests[prefix + 'authority.json'] = hash(authorityRaw);
  const record = { version: 1, contextPath: selected.full, outcome, phase: context.phase, source, authority, verdict, artifactDigests };
  const path = join(folder, prefix + 'record.json');
  const raw = JSON.stringify(record, null, 2) + '\n';
  writeFileSync(path, raw, { flag: 'wx' });
  state.decisions = [...(state.decisions ?? []), { path, digest: hash(raw), contextPath: selected.full, outcome, phase: record.phase, source, authority, rationale: verdict.rationale }];
  if (specApproval) { state.specApproved = true; state.approvedProposal = context.proposal; }
  if (source === 'astra' && authority && context.phase === 'scope') state.scopeReplanAuthorization = { decisionPath: path, planDigest: state.checkpoints.plan.reportDigest, requestDigest: hash(context.proposal) };
  entry.status = source === 'human' ? 'answered' : verdict.disposition;
  renderAuthorizations(run, state);
  return outcome;
}
function redEvidence(run, state) {
  if (digest(run, ['witnesses.json']) !== state.witnessDigest) throw new Error('Witness commands/signatures changed after baseline');
  const w = json(join(run, 'witnesses.json')); validateWitnesses(w);
  const originals = [...w.e2e, ...w.unit].map((_, index) => `red-${index}.json`);
  if (state.redDigest && digest(run, originals) !== state.redDigest) throw new Error('Original red evidence changed');
  // Older runs may predate redDigest, but immutable decision contexts already
  // captured the original raw red hashes. Do not lose that protection on resume.
  for (const entry of Object.values(state.decisionContexts ?? {})) {
    const { context } = decisionContext(run, state, entry.path);
    for (const proof of context.proofs ?? []) if (originals.includes(proof.path) && hash(localText(run, proof.path) ?? '') !== proof.digest) throw new Error('Original red evidence differs from its immutable decision snapshot');
  }
  [...w.e2e, ...w.unit].forEach((item, index) => {
    const r = json(join(run, `red-${index}.json`));
    if (JSON.stringify(item.argv) !== JSON.stringify(r.argv) || !Number.isInteger(r.code) || r.code <= 0 || typeof r.output !== 'string' || !new RegExp(item.failure_pattern).test(r.output)) throw new Error('Recorded red evidence is missing or invalid');
  });
}
function activate(run, pidText) {
  const pid = Number(pidText);
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('A real host pid is required for active-run ownership');
  const activation = join(run, 'activation');
  try { mkdirSync(activation); } catch { throw new Error('Another activation is in progress; inspect a stale activation marker only after confirming all invocations stopped.'); }
  try {
    const active = join(run, 'active');
    if (existsSync(active)) {
      const owner = json(join(active, 'owner.json'));
      if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw new Error('Invalid active-run owner; reconcile the marker manually');
      throw new Error('This run is still marked active. Even a dead host may have surviving workers/gates. Confirm ALL workflow subprocesses stopped, then manually pause its marker.');
    }
    mkdirSync(active);
    const token = randomUUID();
    save(join(active, 'owner.json'), { pid, token });
    return token;
  } finally { rmSync(activation, { recursive: true }); }
}
function resumeRun(cwd, request, pidText, batchResume = false) {
  const ownerRoot = git(cwd, 'rev-parse', '--show-toplevel');
  const [mode, id, ship, rounds] = parseBugRequest(request).split('\n');
  if (mode !== (batchResume ? 'BATCH_RESUME' : 'RESUME')) throw new Error('Expected a ' + (batchResume ? 'batch-resume' : 'resume') + ' request');
  const lock = join(ownerRoot, '.pi/tmp/fix-bug.lock');
  if (!existsSync(join(lock, 'owner.json'))) throw new Error('No paused run owns this checkout; resume does not guess from old artifact directories.');
  const batch = batchResume ? batchManifest(cwd, id, false) : null;
  const parent = batch ? JSON.parse(localText(ownerRoot, batch.batchRun.slice(ownerRoot.length + 1) + '/state.json')) : null;
  const job = parent?.jobs?.[batch?.id];
  if (batch && (parent.finished || job?.status !== 'scheduled' || job.resumeRequested !== true || typeof job.sourceRun !== 'string')) throw new Error('Batch resume requires an unfinished parent and an explicitly scheduled original source retry');
  if (!batch && json(join(lock, 'owner.json')).kind === 'batch') throw new Error('Batch sources require authenticated batch-resume with their original manifest');
  const selectedRun = batch ? job.sourceRun : json(join(lock, 'owner.json')).run;
  const run = realpathSync(selectedRun);
  if (batch && (run !== selectedRun || !run.startsWith(join(ownerRoot, '.pi/tmp', 'fix-bug-' + batch.id + '-')))) throw new Error('Batch source run path is not canonical/original');
  if (!run.startsWith(join(realpathSync(ownerRoot), '.pi/tmp/fix-bug-'))) throw new Error('Run directory is outside this checkout');
  const token = activate(run, pidText); // acquire before reading/validating authoritative state
  try {
  if (!batch && realpathSync(json(join(lock, 'owner.json')).run) !== run) throw new Error('Checkout lease changed during resume');
  const state = json(join(run, 'state.json'));
  const expected = stateRevision(state);
  validateDecisionIntegrity(run, state);
  if (state.ownerRoot !== ownerRoot || (!batch && id && id !== state.id)) throw new Error('Requested run does not match this checkout or bug number');
  if (batch) {
    if (state.batchRun !== batch.batchRun || state.batchManifest !== batch.manifest || state.batchManifestDigest !== batch.manifestDigest || state.id !== batch.id || state.base !== batch.base || state.ownerBase !== batch.base || state.root !== worktreePath(ownerRoot, basename(run))) throw new Error('Batch resume source identity differs from its original manifest');
    assertLease(run, state);
    if (state.batchCommit || existsSync(join(run, 'batch-commit.json')) || existsSync(join(run, 'shipment.json'))) throw new Error('Committed/shipped sources cannot resume implementation');
  }
  const root = state.root;
  assertOwner(state);
  if (git(root, 'rev-parse', 'HEAD') !== state.base || git(root, 'branch', '--show-current') !== state.branch) throw new Error('HEAD/branch changed; cannot resume this run');
  if (existsSync(join(run, 'shipment.json')) && json(join(run, 'shipment.json')).pushed) throw new Error('This run has already shipped; it cannot be resumed');
  if (state.resumeVersion !== 1 || !state.checkpoints) throw new Error('This legacy run predates resumable checkpoints. Continue its recorded manual handoff; do not infer progress from report files.');
  assertControls(state);
  const touched = changes(root);
  if (!state.specApproved && (touched.some(p => p === 'docs/spec.md' || p.startsWith('docs/spec_topics/') || p.startsWith('docs/reference/')) || digest(root, specFiles(root)) !== state.spec)) throw new Error('Specification changed without owner approval');
  if (state.stages.includes('red')) redEvidence(run, state);
  for (const [phase, checkpoint] of Object.entries(state.checkpoints)) {
    if (!PHASES.has(phase)) throw new Error('Unknown recorded checkpoint');
    if (['pass', 'needs_spec', 'needs_decision', 'needs_replan'].includes(checkpoint.status) && digest(run, stagePaths(phase)) !== checkpoint.reportDigest) throw new Error('Completed stage report/result changed: ' + phase + '; reconcile the handoff explicitly');
  }
  const options = state.options;
  if (!options || typeof options.ship !== 'boolean' || !Number.isInteger(options.review_rounds) || options.review_rounds < 1 || options.review_rounds > 5) throw new Error('Invalid saved workflow options');
  if (ship !== 'keep') options.ship = ship === 'true';
  if (rounds !== 'keep') options.review_rounds = Number(rounds);
  if (batch) { options.ship = false; options.review_rounds = 5; }
  // Legacy scope stops enter the same authority-free transition. Structural
  // checkpoint + exact request identity, never a keyword in reviewer prose.
  for (const phase of ['implement', 'repair']) {
    const checkpoint = state.checkpoints[phase];
    if (!state.replanRequired && state.checkpoints.plan && ['needs_replan', 'needs_decision', 'blocked'].includes(checkpoint?.status) && checkpoint.decisionRequest?.trim()) {
      stageReplan(run, state, phase);
      break;
    }
  }
  state.generation = (state.generation ?? 0) + 1;
  state.resumeCount = (state.resumeCount ?? 0) + 1;
  // Keep audit history and standing ship permission, but require fresh gates/reviews.
  state.resumeHistory = [...(state.resumeHistory ?? []), { number: state.resumeCount, priorStages: state.stages }];
  state.stages = state.stages.filter(s => s === 'red');
  delete state.verifiedPaths; delete state.verifiedDigest; delete state.verifiedCheckoutIdentity;
  delete state.verifiedGateFiles; delete state.verifiedGateDigest;
  delete state.finalReviewDigest; delete state.finalReviewCheckoutDigest;
  delete state.evidenceReviewBinding;
  const history = join(run, 'history'); mkdirSync(history, { recursive: true });
  for (const file of ['evidence-review.md', 'evidence-review-result.json', 'reviews.md', 'final-review.md', 'ship-answer.txt']) {
    if (existsSync(join(run, file))) copyFileSync(join(run, file), join(history, `resume-${state.resumeCount}-before-${file}`));
  }
  persistState(run, state, expected, () => {
    validateDecisionIntegrity(run, state);
    assertControls(state);
    if (batch) {
      assertLease(run, state);
      const current = JSON.parse(localText(ownerRoot, batch.batchRun.slice(ownerRoot.length + 1) + '/state.json'));
      if (current.finished || current.jobs?.[batch.id]?.sourceRun !== run || current.jobs[batch.id].status !== 'scheduled' || current.jobs[batch.id].resumeRequested !== true) throw new Error('Batch resume scheduling changed during admission');
    }
  });
  rmSync(join(run, 'ship-answer.txt'), { force: true });
  return run;
  } catch (error) {
    const owner = join(run, 'active/owner.json');
    if (existsSync(owner) && json(owner).token === token) rmSync(join(run, 'active'), { recursive: true, force: true });
    throw error;
  }
}
function witnessRuns(root, run, mode) {
  const w = json(join(run, 'witnesses.json')); validateWitnesses(w);
  let index = 0;
  for (const item of [...w.e2e, ...w.unit]) {
    const r = command(item.argv, root);
    save(join(run, `${mode}-${index++}.json`), { argv: item.argv, ...r });
    if (mode === 'red') {
      if (r.code <= 0 || !new RegExp(item.failure_pattern).test(r.output)) throw new Error('Witness did not fail with its pinned assertion signature; inspect red logs');
    } else if (r.code !== 0) throw new Error('Witness failed after fix; inspect green logs');
  }
  return w;
}
function requireVerified(run, state, paths, committed = false) {
  if (pendingApprovals(validateDecisionIntegrity(run, state)).length) throw new Error('Pending owner approvals block shipment; run approval-report after final review');
  if (!state.stages.includes('gate-final')) throw new Error('Missing final verification');
  redEvidence(run, state);
  const w = json(join(run, 'witnesses.json'));
  const expected = [
    ...[...w.e2e, ...w.unit].map((item, i) => ({ path: `green-${state.gateCount}-${i}.json`, argv: item.argv })),
    ...[['npm', 'run', 'typecheck'], ['npm', 'test'], ...w.live].map((argv, i) => ({ path: `gate-${state.gateCount}-final-${i}.json`, argv })),
  ];
  if (JSON.stringify(state.verifiedGateFiles) !== JSON.stringify(expected.map(item => item.path)) || !state.verifiedGateDigest || digest(run, state.verifiedGateFiles) !== state.verifiedGateDigest) throw new Error('Missing or changed green final gate evidence');
  for (const item of expected) {
    const proof = JSON.parse(localText(run, item.path) ?? 'null');
    if (proof?.code !== 0 || typeof proof.output !== 'string' || JSON.stringify(proof.argv) !== JSON.stringify(item.argv)) throw new Error('Invalid green final gate evidence');
  }
  if (!state.finalReviewDigest || state.finalReviewDigest !== digest(run, ['final-review-result.json', 'final-review.md']) || state.finalReviewCheckoutDigest !== state.verifiedCheckoutIdentity) throw new Error('Missing or changed clean final independent review');
  const review = JSON.parse(localText(run, 'final-review-result.json') ?? 'null');
  if (review?.ok !== true || typeof review.findings !== 'string' || !review.findings.trim() || localText(run, 'final-review.md') !== review.findings) throw new Error('Missing clean final independent review');
  if (JSON.stringify(paths) !== JSON.stringify(state.verifiedPaths) || digest(state.root, paths) !== state.verifiedDigest) throw new Error('Files changed after final verification');
  if (checkoutIdentity(state.root, committed ? state.base : undefined).digest !== state.finalReviewCheckoutDigest) throw new Error('Checkout file bytes/mode/type changed after final verification/review');
  if (!paths.length || paths.some(p => !(p.startsWith('src/') || p.startsWith('tests/') || p.startsWith('docs/')))) throw new Error('Ship scope limited to src/, tests/, docs/; other surfaces require manual shipment');
}
function committedPaths(run, state) {
  const artifact = localText(run, 'batch-commit.json');
  const commit = artifact === null ? null : JSON.parse(artifact);
  if (!commit || hash(artifact) !== state.batchCommit.artifactDigest || commit.sha !== state.batchCommit.sha || commit.branch !== state.branch || commit.base !== state.base || commit.batchRun !== state.batchRun || commit.worktree !== state.root) throw new Error('Batch commit artifact changed');
  if (git(state.root, 'rev-list', '--parents', '-n', '1', commit.sha) !== commit.sha + ' ' + state.base || git(state.root, 'status', '--porcelain')) throw new Error('Committed batch fix must be a clean single commit on its verified base');
  return git(state.root, 'diff', '--name-only', '--no-renames', '-z', state.base, commit.sha).split('\0').filter(Boolean).sort();
}
export function main(args, cwd = process.cwd()) {
  let [op, arg, phase, extra] = args;
  let startOptions; let batch;
  if (op === 'start-file') {
    const [mode, id, ship, rounds] = parseBugRequest(readFileSync(resolve(cwd, arg), 'utf8')).split('\n');
    if (!['FIX', 'BATCH'].includes(mode)) throw new Error('Expected a new numbered bug or batch request');
    if (mode === 'BATCH') batch = batchManifest(cwd, id);
    startOptions = { ship: ship === 'true', review_rounds: Number(rounds) };
    arg = batch?.id ?? id; op = 'init';
  }
  if (op === 'request') {
    const root = git(cwd, 'rev-parse', '--show-toplevel');
    mkdirSync(join(root, '.pi/tmp'), { recursive: true });
    const path = join(root, '.pi/tmp', `bugfix-request-${randomUUID()}.txt`);
    writeFileSync(path, '', { flag: 'wx' });
    console.log(path); return;
  }
  if (op === 'resume-file' || op === 'resume-batch-file') { console.log(resumeRun(cwd, readFileSync(resolve(cwd, arg), 'utf8'), phase, op === 'resume-batch-file')); return; }
  if (op === 'parse-file') { console.log(parseBugRequest(readFileSync(resolve(cwd, arg), 'utf8'))); return; }
  if (op === 'rank-start' || op === 'rank-render') {
    const root = git(cwd, 'rev-parse', '--show-toplevel');
    console.log(op === 'rank-start' ? rankingInput(root) : renderRanking(root, resolve(cwd, arg))); return;
  }
  if (op === 'list') {
    const root = git(cwd, 'rev-parse', '--show-toplevel');
    console.log(listOpenBugs(root)); return;
  }
  if (op === 'init-file') { arg = readFileSync(resolve(cwd, arg), 'utf8').trim(); op = 'init'; }
  if (op === 'init') {
    if (!/^\d{1,4}$/.test(arg ?? '')) throw new Error('Bug number must contain 1–4 digits');
    const root = git(cwd, 'rev-parse', '--show-toplevel');
    if (git(root, 'status', '--porcelain')) throw new Error('Working tree must be clean. Commit or intentionally resolve existing changes first.');
    const id = arg.padStart(4, '0');
    const files = readdirSync(join(root, 'docs/bugs')).filter(p => p.startsWith(id + '-') && p.endsWith('.md') && !p.includes('investigation'));
    if (files.length !== 1) throw new Error('Expected exactly one numbered bug report');
    const bug = 'docs/bugs/' + files[0];
    if (!/^- \*\*Status:\*\* open\b/m.test(readFileSync(join(root, bug), 'utf8'))) throw new Error('Bug is not marked open');
    const ownerBranch = git(root, 'branch', '--show-current');
    if (!ownerBranch) throw new Error('Detached HEAD is not supported');
    const ownerBase = batch?.base ?? git(root, 'rev-parse', 'HEAD');
    const nonce = randomUUID();
    const branch = `fix-bug/${id}-${nonce}`;
    const run = join(root, '.pi/tmp', `fix-bug-${id}-${nonce}`);
    const worktree = worktreePath(root, basename(run));
    mkdirSync(run, { recursive: true });
    const lock = batch ? join(run, 'lease') : join(root, '.pi/tmp/fix-bug.lock');
    try { mkdirSync(lock); } catch { throw new Error('Another bug workflow owns the checkout; inspect .pi/tmp/fix-bug.lock/owner.json and release only after it has stopped'); }
    try {
      if (batch) claimBatchLaunch(cwd, batch, run); // durable before active/worktree creation
      // start-file is the interactive entry: publish the lease owner only AFTER
      // the original options and active execution claim are durable. Raw init is
      // retained for administrative/test creation of an explicitly paused run.
      if (startOptions) activate(run, phase);
      prepareWorktreePath(root, basename(run));
      git(root, 'worktree', 'add', '-b', branch, worktree, ownerBase);
      mkdirSync(join(worktree, '.pi/tmp'), { recursive: true });
      const controls = controlPaths(worktree);
      save(join(run, 'state.json'), { root: worktree, ownerRoot: root, ownerBranch, ownerBase, bug, id, branch, base: ownerBase, spec: digest(worktree, specFiles(worktree)), stages: [], resumeVersion: 1, revision: 0, generation: startOptions ? 1 : 0, checkpoints: {}, options: startOptions ?? { ship: true, review_rounds: 5 }, controlPaths: controls, controlDigest: digest(worktree, controls), ...(batch ? { batchRun: batch.batchRun, batchManifest: batch.manifest, batchManifestDigest: batch.manifestDigest } : {}) });
      if (batch) batchManifest(cwd, batch.manifest, false);
      save(join(lock, 'owner.json'), { run });
    } catch (error) {
      rmSync(join(run, 'active'), { recursive: true, force: true });
      rmSync(lock, { recursive: true });
      throw error;
    }
    console.log(run); return;
  }
  const run = resolve(arg ?? '');
  const state = json(join(run, 'state.json')); const root = state.root;
  const expected = stateRevision(state);
  const persist = beforeWrite => persistState(run, state, expected, () => {
    validateDecisionIntegrity(run, state);
    beforeWrite?.();
  });
  if (state.ownerRoot !== git(cwd, 'rev-parse', '--show-toplevel')) throw new Error('Run belongs to another checkout; invoke the controller from the original owner checkout');
  const records = validateDecisionIntegrity(run, state);
  // This is an audit view, not current checkout/release authority. Keep it
  // available after release and successful worktree cleanup as well as pauses.
  if (op === 'approval-report') { console.log(approvalReport(records)); return; }
  if (op === 'pause') {
    state.generation = (state.generation ?? 0) + 1; // fence in-flight controllers before releasing execution ownership
    persist();
    rmSync(join(run, 'active'), { recursive: true, force: true });
    console.log('PASS'); return;
  }
  if (op === 'ship' && state.batchRun) throw new Error('Batch runs cannot ship; only the parent batch controller may integrate/push');
  const lock = leasePath(run, state);
  assertLease(run, state, op === 'export-verified' || op === 'commit-verified' || op === 'verify-integrity');
  if (op === 'release') { rmSync(lock, { recursive: true }); console.log('PASS'); return; }
  assertOwner(state);
  assertControls(state);
  const committedExport = ['export-verified', 'verify-integrity'].includes(op) && state.batchRun && state.batchCommit;
  if (git(root, 'rev-parse', 'HEAD') !== (committedExport ? state.batchCommit.sha : state.base) || git(root, 'branch', '--show-current') !== state.branch) throw new Error('HEAD/branch changed during workflow; stop and inspect');
  const paths = committedExport ? committedPaths(run, state) : changes(root);
  const specTouched = paths.some(p => p === 'docs/spec.md' || p.startsWith('docs/spec_topics/') || p.startsWith('docs/reference/'));
  if (!state.specApproved && (specTouched || digest(root, specFiles(root)) !== state.spec)) throw new Error('Specification changed without owner approval');
  if (op === 'verify-integrity') {
    if (state.stages.includes('red')) redEvidence(run, state);
    for (const [name, checkpoint] of Object.entries(state.checkpoints ?? {})) {
      if (['pass', 'needs_spec', 'needs_decision', 'needs_replan'].includes(checkpoint.status) && digest(run, stagePaths(name)) !== checkpoint.reportDigest) throw new Error('Completed stage report/result changed: ' + name);
    }
    console.log('PASS'); return;
  } else if (op === 'decision-kind') {
    const { context, entry } = decisionContext(run, state, phase);
    if (entry.status === 'pending') assertDecisionCurrent(run, state, context);
    // A deferred owner decision is historical: implementation and fresh review
    // are expected to have changed the checkout since its exact scope snapshot.
    else if (entry.status !== 'human') throw new Error('Decision is no longer pending a disposition/answer');
    console.log(isSpecDecision(context) ? 'SPEC' : 'SCOPED'); return;
  } else if (op === 'decision-start') {
    if (!DECISION_PHASES.has(phase)) throw new Error('Unknown decision phase');
    const decisionId = randomUUID();
    const folder = join(run, 'decision-' + decisionId);
    mkdirSync(folder);
    // Capture the revision that the registration transaction will publish, not
    // a mutable final/active state reconstructed after the model's assessment.
    state.revision = expected.revision + 1;
    const context = { version: 1, decisionId, ...decisionMaterial(run, state, phase) };
    const path = join(folder, 'context.json');
    save(path, context);
    const relative = path.slice(run.length + 1);
    state.decisionContexts = { ...(state.decisionContexts ?? {}), [relative]: { path, digest: hash(readFileSync(path)), status: 'pending' } };
    persist(() => assertDecisionCurrent(run, state, context));
    console.log(path); return;
  } else if (op === 'decision-record' || op === 'decision-answer') {
    const selected = decisionContext(run, state, phase);
    const { entry, context } = selected;
    if (op === 'decision-record') {
      if (entry.status !== 'pending') throw new Error('Decision already recorded; no replay allowed');
      const baseline = assertDecisionCurrent(run, state, context);
      const priorState = JSON.parse(JSON.stringify(state));
      const verdictRaw = localText(run, selected.relative + '.verdict.json');
      if (!verdictRaw || verdictRaw.length > 128000) throw new Error('Missing or overlong decision verdict');
      const verdict = validateVerdict(JSON.parse(verdictRaw));
      const outcome = archiveDecision(run, state, selected, verdict, 'astra', verdictRaw);
      const history = localText(run, 'decision-authorizations.md');
      persist(() => decisionCommitFence(run, priorState, selected, baseline, verdictRaw, history));
      console.log(outcome); return;
    }
    if (entry.status !== 'human') throw new Error('Human approval requires a recorded provisional human verdict, once only');
    const baseline = decisionMaterial(run, state, context.phase);
    const priorState = JSON.parse(JSON.stringify(state));
    const verdictRaw = localText(run, selected.relative + '.verdict.json');
    if (!verdictRaw || hash(verdictRaw) !== entry.verdictDigest) throw new Error('Recorded verdict changed');
    const verdict = validateVerdict(JSON.parse(verdictRaw));
    if (verdict.disposition !== 'human') throw new Error('No genuine unresolved human choice recorded');
    const answer = localText(run, selected.relative + '.answer.txt');
    const label = decisionLabel(context);
    if (typeof answer !== 'string' || !approved(answer, label)) throw new Error('No exact explicit human approval; free text/default/cancel cannot approve');
    archiveDecision(run, state, selected, verdict, 'human', verdictRaw, answer);
    const history = localText(run, 'decision-authorizations.md');
    persist(() => decisionCommitFence(run, priorState, selected, baseline, verdictRaw, history, answer));
    console.log('PASS'); return;
  } else if (op === 'stage-replan') {
    stageReplan(run, state, phase);
  } else if (op === 'scope-approved') {
    if (!state.pendingScopeReplan) throw new Error('No pending revised scope request');
    requireScopeApproval(run, state);
  } else if (op === 'scope-status') {
    if (!state.pendingScopeReplan) { console.log('NONE'); return; }
    try { requireScopeApproval(run, state); console.log('APPROVED'); }
    catch { console.log('REQUIRED'); }
    return;
  } else if (op === 'enter') {
    activate(run, phase);
    state.generation = (state.generation ?? 0) + 1;
  } else if (op === 'configure') {
    if (existsSync(join(run, 'active'))) throw new Error('Cannot configure an active workflow; initialize atomically or change options on resume');
    if (!['true', 'false'].includes(phase) || !/^[1-5]$/.test(extra ?? '')) throw new Error('Invalid workflow options');
    if (state.batchRun && (phase !== 'false' || extra !== '5')) throw new Error('Batch options are fixed: ship false review_rounds 5');
    state.options = { ship: phase === 'true', review_rounds: Number(extra) };
  } else if (op === 'info') {
    console.log([state.id, String(state.options.ship), String(state.options.review_rounds)].join('\n')); return;
  } else if (op === 'prepare') {
    prepareWorktreeEnvironment(root, run, command);
    console.log('PASS'); return;
  } else if (['cached', 'begin', 'record'].includes(op)) {
    if (!PHASES.has(phase) || state.resumeVersion !== 1) throw new Error('Unknown phase or legacy checkpoint format');
    const checkpoint = state.checkpoints[phase];
    if (op === 'cached') {
      const reusable = checkpoint?.status === 'pass' || (phase === 'plan' && checkpoint?.status === 'needs_spec');
      if (!reusable || ['repair', 'close'].includes(phase)) { console.log('RUN'); return; }
      if (digest(run, stagePaths(phase)) !== checkpoint.reportDigest) throw new Error('Completed stage report/result changed: ' + phase);
      if (phase === 'implement' && (digest(root, paths) !== checkpoint.checkoutDigest || checkpoint.planDigest !== state.checkpoints.plan?.reportDigest)) { console.log('RUN'); return; }
      console.log('PASS'); return;
    }
    if (op === 'begin') {
      if (['implement', 'repair'].includes(phase)) requireScopeApproval(run, state);
      if (phase === 'plan') {
        if (['pass', 'needs_spec'].includes(checkpoint?.status)) {
          // An explicit begin can supersede an unrejected plan, but must first
          // preserve it and revoke its clean-review binding. A rejected review
          // instead requires the accepted, evidence-scoped replan transition.
          if (localText(run, 'evidence-review.md') !== null || localText(run, 'evidence-review-result.json') !== null || state.evidenceReviewBinding) {
            try { evidenceReviewResult(run, true); } catch { throw new Error('Rejected/unbound evidence review requires an accepted evidence decision and explicit replan before revising the plan'); }
          }
          archivePlan(run, state, 'explicit-plan-begin');
        }
        if (checkpoint?.status === 'needs_decision') {
          const latest = state.decisions?.at(-1);
          const selected = latest ? decisionContext(run, state, latest.contextPath) : null;
          if (latest?.phase !== 'plan' || latest.outcome !== 'CONTINUE' || latest.authority?.type !== 'exact-scoped-request' || selected.context.authority.checkpoints?.plan?.reportDigest !== checkpoint.reportDigest || selected.context.artifacts['decision-request.md'] !== localText(run, 'decision-request.md') || JSON.stringify(selected.context.checkout) !== JSON.stringify(checkoutIdentity(root))) throw new Error('Pending PLAN scoped request requires its exact accepted decision before retry');
          archivePlan(run, state, 'accepted-scoped-plan-retry');
        }
        requireReplanInputs(run, state);
        delete state.evidenceReviewBinding;
      }
      const attempt = Math.max(checkpoint?.attempt ?? 0, state.phaseAttempts?.[phase] ?? 0) + 1;
      state.phaseAttempts = { ...(state.phaseAttempts ?? {}), [phase]: attempt };
      const history = join(run, 'history'); mkdirSync(history, { recursive: true });
      for (const file of [...stagePaths(phase), 'decision-request.md']) if (existsSync(join(run, file))) copyFileSync(join(run, file), join(history, `${phase}-${attempt}-before-${file}`));
      rmSync(join(run, 'decision-request.md'), { force: true });
      state.checkpoints[phase] = { attempt, status: 'running' };
    } else {
      if (!checkpoint || checkpoint.status !== 'running') throw new Error('Stage did not begin');
      if (phase === 'plan') requireReplanInputs(run, state);
      const text = readFileSync(join(run, `stage-${phase}-result.txt`), 'utf8');
      const [status, ...summary] = text.split('\n');
      if (!['pass', 'blocked', 'not_reproduced', 'needs_spec', 'needs_decision', 'needs_replan'].includes(status) || !summary.join('\n').trim()) throw new Error('Invalid stage result');
      if (status === 'needs_replan' && !['implement', 'repair'].includes(phase)) throw new Error('Only implementation/repair may request a scope replan');
      if (status === 'needs_spec' && !['plan', 'implement', 'repair'].includes(phase)) throw new Error('This phase cannot request a specification transition');
      if (['pass', 'needs_spec', 'needs_decision', 'needs_replan'].includes(status) && !existsSync(join(run, `${phase}.md`))) throw new Error('Completed stage report is missing');
      if (phase === 'plan' && ['pass', 'needs_spec', 'needs_decision'].includes(status) && !existsSync(join(run, 'spec-proposal.md'))) throw new Error('Plan specification disposition is missing');
      const decisionRequest = localText(run, 'decision-request.md');
      if (['needs_decision', 'needs_replan'].includes(status) && !decisionRequest?.trim()) throw new Error(status + ' requires a nonempty decision-request.md');
      if (phase === 'plan' && state.pendingScopeReplan && ['pass', 'needs_spec', 'needs_decision'].includes(status) && decisionRequest !== state.pendingScopeReplan.exactRequest) throw new Error('Revised PLAN must preserve the exact pending scope request for independent review/authorization');
      state.checkpoints[phase] = { ...checkpoint, status, ...(decisionRequest?.trim() ? { decisionRequest } : {}), reportDigest: digest(run, stagePaths(phase)), checkoutDigest: digest(root, paths), ...(phase === 'implement' ? { planDigest: state.checkpoints.plan?.reportDigest } : {}) };
      if (['implement', 'repair'].includes(phase) && status === 'needs_spec') {
        if (!existsSync(join(run, 'spec-revision-proposal.md'))) throw new Error('Revised specification proposal is missing');
        archivePlan(run, state, 'implementation-spec-revision', { 'spec-revision-proposal.md': localText(run, 'spec-revision-proposal.md') });
        const history = join(run, 'history'); mkdirSync(history, { recursive: true });
        for (const file of stagePaths('plan')) if (existsSync(join(run, file))) copyFileSync(join(run, file), join(history, `${phase}-${checkpoint.attempt}-before-replan-${file}`));
        delete state.checkpoints.plan;
        delete state.evidenceReviewBinding;
        // A new implementation-time contract request supersedes any consumed
        // evidence-replan inputs; their original bytes remain in planArchives.
        delete state.replanFeedback;
        state.replanRequired = true; // next resume reruns PLAN + evidence review + exact owner decision
      }
      if (phase === 'plan' && ['pass', 'needs_spec', 'needs_decision'].includes(status)) state.replanRequired = false;
    }
  } else if (op === 'replan') {
    const plan = currentPlan(run, state);
    const report = localText(run, 'evidence-review.md');
    const raw = localText(run, 'evidence-review-result.json');
    if (!report?.trim()) throw new Error('Replan requires the rejected independent evidence review report');
    const result = raw === null ? null : JSON.parse(raw);
    if (result?.ok === true && result.findings === report) throw new Error('Clean evidence review is not a rejected-plan replan request');
    if (result?.ok === false && result.findings !== report) throw new Error('Failed evidence review result/report differ');
    const latest = state.decisions?.at(-1);
    if (latest?.phase !== 'evidence' || latest.outcome !== 'CONTINUE' || !['exact-scoped-request', 'existing-scope-retry'].includes(latest.authority?.type)) throw new Error('Replan requires the latest accepted CONTINUE decision for the failed evidence review, with scoped or existing-scope retry authority');
    const { context } = decisionContext(run, state, latest.contextPath);
    if (state.revision !== context.authority.revision + (latest.source === 'human' ? 2 : 1) || context.authority.checkpoints?.plan?.reportDigest !== plan.reportDigest || context.artifacts['evidence-review.md'] !== report || context.artifacts['evidence-review-result.json'] !== raw || JSON.stringify(context.checkout) !== JSON.stringify(checkoutIdentity(root)) || context.head !== state.base || context.currentBranch !== state.branch) throw new Error('Replan decision is stale or does not authorize this failed review/current plan');
    const feedbackPath = resolve(phase ?? '');
    if (!feedbackPath.startsWith(run + '/')) throw new Error('Replan feedback must be an exact file path within this run');
    const feedback = localText(run, feedbackPath.slice(run.length + 1));
    if (!feedback?.trim()) throw new Error('Nonempty exact replan feedback is required');
    const archive = archivePlan(run, state, 'failed-evidence-review', { 'evidence-replan-feedback.md': feedback });
    state.replanFeedback = { path: feedbackPath, digest: hash(feedback), decisionPath: latest.path, archive, checkoutDigest: hash(JSON.stringify(checkoutIdentity(root))) };
    delete state.checkpoints.plan;
    delete state.evidenceReviewBinding;
    state.replanRequired = true;
  } else if (op === 'approved') {
    if (!state.specApproved || state.approvedProposal !== readFileSync(join(run, 'spec-proposal.md'), 'utf8')) throw new Error('No exact saved specification approval');
  } else if (op === 'approval') {
    if (!approved(readFileSync(join(run, 'spec-answer.txt'), 'utf8'), 'Approve proposed spec changes')) throw new Error('No explicit specification approval');
    state.specApproved = true;
    state.approvedProposal = readFileSync(join(run, 'spec-proposal.md'), 'utf8');
    if (!state.approvedProposal.trim()) throw new Error('Specification proposal is empty');
  } else if (op === 'red') {
    if (state.stages.includes('red')) {
      redEvidence(run, state); // reuse immutable original red proof, never rerun it on fixed production
    } else {
      if (paths.some(p => !p.startsWith('tests/'))) throw new Error('Reproduction/diagnosis may change tests only');
      witnessRuns(root, run, 'red'); state.stages.push('red');
      state.witnessDigest = digest(run, ['witnesses.json']);
      const witnesses = json(join(run, 'witnesses.json'));
      state.redDigest = digest(run, [...witnesses.e2e, ...witnesses.unit].map((_, index) => `red-${index}.json`));
    }
  } else if (op === 'gate') {
    if (!state.stages.includes('red')) throw new Error('Missing pre-fix red evidence');
    if (digest(run, ['witnesses.json']) !== state.witnessDigest) throw new Error('Witness commands/signatures changed after baseline');
    state.gateCount = (state.gateCount ?? 0) + 1;
    state.stages = state.stages.filter(s => s !== 'gate-final');
    delete state.verifiedPaths; delete state.verifiedDigest; delete state.verifiedCheckoutIdentity;
    delete state.verifiedGateFiles; delete state.verifiedGateDigest;
    delete state.finalReviewDigest; delete state.finalReviewCheckoutDigest;
    persist(); // a failed attempt must not overwrite its logs on resume
    const gateDigest = digest(root, paths);
    const gateIdentity = checkoutIdentity(root).digest;
    const w = witnessRuns(root, run, `green-${state.gateCount}`);
    const commands = [['npm', 'run', 'typecheck'], ['npm', 'test'], ...w.live];
    const prepared = prepareWorktreeEnvironment(root, run, command);
    for (let i = 0; i < commands.length; i++) {
      const r = command(commands[i], root, undefined, prepared.env);
      save(join(run, `gate-${state.gateCount}-${phase}-${i}.json`), { argv: commands[i], ...r });
      if (r.code !== 0) throw new Error('Verification gate failed; inspect captured logs. No skip/waiver allowed.');
    }
    if (JSON.stringify(changes(root)) !== JSON.stringify(paths) || digest(root, paths) !== gateDigest || checkoutIdentity(root).digest !== gateIdentity) throw new Error('Checkout changed during verification; no green gate recorded');
    state.stages.push('gate-' + phase);
    state.verifiedPaths = paths; state.verifiedDigest = gateDigest; state.verifiedCheckoutIdentity = gateIdentity;
    state.verifiedGateFiles = [...[...w.e2e, ...w.unit].map((_, i) => `green-${state.gateCount}-${i}.json`), ...commands.map((_, i) => `gate-${state.gateCount}-${phase}-${i}.json`)];
    state.verifiedGateDigest = digest(run, state.verifiedGateFiles);
  } else if (op === 'snapshot') {
    state.reviewDigest = digest(root, paths); state.reviewPaths = paths;
    state.reviewCheckoutDigest = hash(JSON.stringify(checkoutIdentity(root)));
    state.reviewPlanDigest = state.checkpoints?.plan?.reportDigest ?? null;
    state.reviewGeneration = state.generation ?? 0;
  } else if (op === 'review-check') {
    if (JSON.stringify(paths) !== JSON.stringify(state.reviewPaths) || digest(root, paths) !== state.reviewDigest || state.reviewCheckoutDigest !== hash(JSON.stringify(checkoutIdentity(root)))) throw new Error('Read-only reviewer changed files/index');
  } else if (op === 'evidence-review-record') {
    const plan = currentPlan(run, state);
    const review = evidenceReviewResult(run, true);
    const checkoutDigest = hash(JSON.stringify(checkoutIdentity(root)));
    if (state.reviewGeneration !== (state.generation ?? 0) || state.reviewPlanDigest !== plan.reportDigest || state.reviewCheckoutDigest !== checkoutDigest || JSON.stringify(paths) !== JSON.stringify(state.reviewPaths) || digest(root, paths) !== state.reviewDigest) throw new Error('Missing unchanged evidence review snapshot for the current completed plan');
    state.evidenceReviewBinding = { generation: state.generation ?? 0, planDigest: plan.reportDigest, reportDigest: review.reportDigest, checkoutDigest };
    persist(() => requireCleanEvidenceReview(run, state));
    console.log('PASS'); return;
  } else if (op === 'final-review-record') {
    if (!state.stages.includes('gate-final')) throw new Error('Missing final verification');
    if (JSON.stringify(paths) !== JSON.stringify(state.verifiedPaths) || digest(root, paths) !== state.verifiedDigest) throw new Error('Files changed after final verification');
    if (JSON.stringify(paths) !== JSON.stringify(state.reviewPaths) || digest(root, paths) !== state.reviewDigest || state.reviewCheckoutDigest !== hash(JSON.stringify(checkoutIdentity(root))) || state.verifiedCheckoutIdentity !== checkoutIdentity(root).digest) throw new Error('Missing unchanged final review snapshot or post-gate file mode/type drift');
    const review = json(join(run, 'final-review-result.json'));
    if (review.ok !== true || typeof review.findings !== 'string' || !review.findings.trim() || readFileSync(join(run, 'final-review.md'), 'utf8') !== review.findings) throw new Error('Missing clean final independent review');
    state.finalReviewDigest = digest(run, ['final-review-result.json', 'final-review.md']);
    state.finalReviewCheckoutDigest = state.verifiedCheckoutIdentity;
  } else if (op === 'export-verified') {
    requireVerified(run, state, paths, Boolean(committedExport));
    verifyShippingIndex(root, committedExport ? [] : paths, Boolean(committedExport));
    console.log('PASS'); return; // strictly read-only: no revision, lease or index writes
  } else if (op === 'commit-verified' || op === 'ship') {
    const batchCommit = op === 'commit-verified';
    if (batchCommit && !state.batchRun) throw new Error('commit-verified is allowed only for batch runs');
    if (batchCommit && existsSync(join(run, 'batch-commit.json'))) throw new Error('Batch fix was already committed; inspect batch-commit.json, do not replay');
    if (!batchCommit && state.options?.ship !== true) throw new Error('Shipment disabled: ship false keeps the verified fix local');
    if (pendingApprovals(validateDecisionIntegrity(run, state)).length) throw new Error('Pending owner approvals block shipment; run approval-report after final review');
    if (state.ownerBranch !== 'main') throw new Error('Shipment requires the original owner checkout on main; no automatic branch switching');
    if (git(state.ownerRoot, 'status', '--porcelain')) throw new Error('Owner checkout must remain clean before merging the reviewed fix');
    requireVerified(run, state, paths);
    persist(() => {
      const assertCheckout = () => {
        assertLease(run, state, batchCommit);
        assertOwner(state);
        assertControls(state);
        requireVerified(run, state, changes(root));
        if (git(state.ownerRoot, 'status', '--porcelain')) throw new Error('Owner checkout changed before shipment; nothing reset or discarded');
        if (pendingApprovals(validateDecisionIntegrity(run, state)).length) throw new Error('Pending owner approvals block shipment');
        if (git(root, 'rev-parse', 'HEAD') !== state.base || git(root, 'branch', '--show-current') !== state.branch || JSON.stringify(changes(root)) !== JSON.stringify(state.verifiedPaths) || digest(root, paths) !== state.verifiedDigest || checkoutIdentity(root).digest !== state.finalReviewCheckoutDigest) throw new Error('HEAD/branch or verified checkout changed before shipment');
        if (state.finalReviewDigest !== digest(run, ['final-review-result.json', 'final-review.md']) || state.finalReviewCheckoutDigest !== state.verifiedCheckoutIdentity) throw new Error('Clean final independent review changed before shipment');
      };
      assertCheckout();
      const before = verifyShippingIndex(root, paths);
      const inventory = checkoutIdentity(root).digest;
      // Recheck the inspection immediately before the only scoped index write.
      if (before.index !== git(root, 'ls-files', '--stage', '-z') || before.status !== git(root, 'status', '--porcelain=v1', '-z')) throw new Error('Index/status changed before scoped git add; reconcile manually');
      const result = command(['git', 'add', '--', ...paths], root); if (result.code !== 0) throw new Error(result.output);
      const staged = verifyShippingIndex(root, paths, true);
      assertCheckout();
      if (checkoutIdentity(root).digest !== inventory || staged.index !== git(root, 'ls-files', '--stage', '-z') || staged.status !== git(root, 'status', '--porcelain=v1', '-z')) throw new Error('Checkout/index/status changed after scoped git add; nothing was reset, reconcile manually');
      validateDecisionIntegrity(run, state);
      const commit = command(['git', 'commit', '-m', `fix: resolve bug ${state.id}`], root); if (commit.code !== 0) throw new Error(commit.output);
      if (batchCommit) {
        const artifact = { version: 1, sha: git(root, 'rev-parse', 'HEAD'), branch: state.branch, worktree: root, base: state.base, batchRun: state.batchRun, verifiedPaths: paths, verifiedDigest: state.verifiedDigest, verifiedCheckoutIdentity: state.verifiedCheckoutIdentity, finalReviewDigest: state.finalReviewDigest };
        save(join(run, 'batch-commit.json'), artifact);
        state.batchCommit = { sha: artifact.sha, artifactDigest: hash(readFileSync(join(run, 'batch-commit.json'))) };
        // Hooks are not verification authority. A commit-time mutation is a
        // fail-closed retained artifact, never permission to integrate.
        requireVerified(run, state, committedPaths(run, state), true);
        verifyShippingIndex(root, [], true);
        return;
      }
      const shipment = { sha: git(root, 'rev-parse', 'HEAD'), branch: state.branch, worktree: root, merged: false, pushed: false };
      save(join(run, 'shipment.json'), shipment);
      // Merge only the reviewed branch into the unchanged owner main. A
      // divergence/conflict requires manual reconciliation, never reset/rebase
      // or an unreviewed merge resolution. Keep branch, worktree and evidence.
      assertOwner(state);
      if (git(state.ownerRoot, 'status', '--porcelain')) throw new Error('Owner checkout changed before merge; preserve both checkouts and reconcile manually');
      const merge = command(['git', 'merge', '--ff-only', '--', state.branch], state.ownerRoot);
      shipment.merged = merge.code === 0; shipment.mergeOutput = merge.output;
      save(join(run, 'shipment.json'), shipment);
      if (merge.code !== 0) throw new Error('Fix committed, merge to main failed. Inspect shipment.json; worktree and branch retained.');
      if (git(state.ownerRoot, 'rev-parse', 'HEAD') !== shipment.sha || git(state.ownerRoot, 'branch', '--show-current') !== 'main' || git(state.ownerRoot, 'status', '--porcelain')) throw new Error('Owner main changed after merge; preserve worktree/branch and reconcile manually');
      // Push just the reviewed main SHA: no force, tags, or unrelated refs.
      const push = command(['git', 'push', 'origin', `${shipment.sha}:refs/heads/main`], state.ownerRoot);
      shipment.pushed = push.code === 0; shipment.output = push.output;
      save(join(run, 'shipment.json'), shipment);
      if (push.code !== 0) throw new Error('Commit merged to main, push failed. Inspect shipment.json; worktree and branch retained, do not rerun blindly.');
      try {
        shipment.piConfig = existsSync(join(root, 'package.json')) && json(join(root, 'package.json')).name === '@bitmonk8/pi-theta'
          ? updatePiConfig(shipment.sha, command)
          : { skipped: true, reason: 'Not a pi-theta checkout' };
        save(join(run, 'shipment.json'), shipment);
      } catch (error) {
        shipment.piConfig = { status: 'incomplete', error: error.message };
        save(join(run, 'shipment.json'), shipment);
        throw new Error('pi-theta was pushed, but the pi-config dependency update failed. Inspect shipment.json and pi-config status/log; reconcile only the consumer update, do not rerun the fix. ' + error.message);
      }
    });
    if (batchCommit) { console.log('PASS'); return; }
    // All shipping side effects, including the consumer update, succeeded.
    // Never clean up on a failed push/update, pause, release, or ship false.
    const shipment = json(join(run, 'shipment.json'));
    try {
      git(state.ownerRoot, 'worktree', 'remove', root);
      git(state.ownerRoot, 'branch', '-d', state.branch);
      shipment.cleaned = true;
      save(join(run, 'shipment.json'), shipment);
    } catch (error) {
      shipment.cleanupError = error.message;
      save(join(run, 'shipment.json'), shipment);
      throw new Error('Shipment succeeded but cleanup incomplete; inspect shipment.json and reconcile manually. ' + error.message);
    }
    rmSync(lock, { recursive: true });
    console.log('PASS'); return;
  } else throw new Error('Unknown operation');
  persist(); console.log('PASS');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (e) { console.error('BLOCKED: ' + e.message); process.exitCode = 1; }
}
