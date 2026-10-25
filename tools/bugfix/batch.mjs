#!/usr/bin/env node
// Deterministic /fix-all-bugs control plane. Models predict scope and review
// integrations; only this controller grants leases, schedules, gates and ships.
// CLI (invoke from original owner): start -> run; catalog RUN -> catalog|EMPTY;
// plan RUN -> PASS; next RUN -> <=4 absolute manifests|DONE;
// collect RUN ID -> VERIFIED|PENDING|BLOCKED; integration-start RUN ID -> context;
// integration-gate RUN ID -> PASS; integrate-record RUN ID -> PASS;
// report RUN -> JSON; finish RUN -> PASS. IDs are four digits. The parent writes
// plan.json and integration-result-ID.json {ok:boolean, findings:string}; workers
// commit/gate only the context's integration checkout. Failure locks are durable.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, rmSync, realpathSync, lstatSync } from 'node:fs';
import { resolve, join, dirname, isAbsolute, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { command, validateWitnesses, worktreePath, prepareWorktreePath } from './run.mjs';
import { updatePiConfig } from './update-pi-config.mjs';

const standalone = fileURLToPath(new URL('./run.mjs', import.meta.url));
const hash = text => createHash('sha256').update(text).digest('hex');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const encode = value => JSON.stringify(value, null, 2) + '\n';
function save(path, value) {
  const temp = path + '.' + randomUUID() + '.tmp';
  writeFileSync(temp, encode(value), { flag: 'wx' }); renameSync(temp, path);
}
function immutable(path, value) { writeFileSync(path, encode(value), { flag: 'wx' }); }
function git(root, ...args) {
  const r = command(['git', ...args], root);
  if (r.code !== 0) throw new Error(`git ${args[0]} failed: ${r.output}`);
  return r.output.trim();
}
function clean(root) {
  if (git(root, 'status', '--porcelain=v1', '--untracked-files=all')) throw new Error('Working tree must be clean; nothing was reset or discarded');
}
function safePath(path) {
  return typeof path === 'string' && path.length > 0 && !isAbsolute(path) && !/[\\\x00-\x1f\x7f:*?\[\]]/.test(path)
    && path.split('/').every(part => part && part !== '.' && part !== '..')
    && !path.split('/').some(part => ['.git', 'node_modules'].includes(part)) && path !== '.pi/tmp' && !path.startsWith('.pi/tmp/')
    && path !== '.trees' && !path.startsWith('.trees/');
}
function regular(path) {
  for (let parent = dirname(resolve(path)); parent !== dirname(parent); parent = dirname(parent)) {
    if (lstatSync(parent).isSymbolicLink()) throw new Error('Artifact path traverses a symlink: ' + path);
  }
  if (!lstatSync(path).isFile()) throw new Error('Artifact must be a regular file, not a symlink: ' + path);
  return readFileSync(path);
}
function safeLocal(root, path) {
  if (!safePath(path)) throw new Error('Invalid repository-relative path: ' + path);
  let current = root;
  for (const part of path.split('/')) {
    current = join(current, part);
    try { if (lstatSync(current).isSymbolicLink()) throw new Error('Path traverses symlink: ' + path); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return current;
}
function reports(root) {
  const entries = readdirSync(join(root, 'docs/bugs')).sort().flatMap(name => {
    // Numbered investigation supplements are not independently filed bugs.
    const m = /^(\d{4})-(.+)\.md$/.exec(name); if (!m || name.includes('investigation')) return [];
    const path = 'docs/bugs/' + name; const bytes = regular(safeLocal(root, path)); const text = bytes.toString('utf8');
    const status = /^- \*\*Status:\*\*[ \t]*([^\r\n]+)/m.exec(text)?.[1].trim() ?? 'unknown';
    return [{ id: m[1], title: m[2].replaceAll('-', ' '), path, status, open: /^open\b/i.test(status), digest: hash(bytes), text }];
  });
  if (new Set(entries.map(r => r.id)).size !== entries.length) throw new Error('Ambiguous duplicate numbered bug reports');
  return entries;
}
const resolved = report => /^(fixed|resolved|closed)\b/i.test(report.status);
function assertOwner(state) {
  if (git(state.root, 'branch', '--show-current') !== 'main' || git(state.root, 'rev-parse', 'HEAD') !== state.base) throw new Error('Owner main changed outside this batch; preserve artifacts and reconcile');
  clean(state.root);
}
function assertLease(run, state) {
  const owner = read(join(state.root, '.pi/tmp/fix-bug.lock/owner.json'));
  if (owner.run !== run || owner.kind !== 'batch') throw new Error('Batch no longer owns the checkout lease');
}
function checkedManifest(job) {
  const bytes = regular(job.manifest);
  if (hash(bytes) !== job.manifestDigest) throw new Error('Immutable job manifest changed');
  return JSON.parse(bytes);
}
function catalogCurrent(state, catalog) {
  assertOwner(state);
  if (catalog.base !== state.base || JSON.stringify(reports(state.root).map(({ text, ...r }) => r)) !== JSON.stringify(catalog.reports.map(({ snapshot, ...r }) => r))) throw new Error('Stale catalog: bug reports or main changed; start a fresh batch');
  for (const source of catalog.sources) if (hash(regular(safeLocal(state.root, source.path))) !== source.digest) throw new Error('Stale catalog source context: ' + source.path);
}
function checkedPlan(run, state) {
  const bytes = regular(join(run, 'plan.json'));
  if (!state.planDigest || hash(bytes) !== state.planDigest) throw new Error('Missing or changed accepted plan');
  return JSON.parse(bytes);
}
function standaloneCall(state, op, sourceRun) { return command([process.execPath, standalone, op, sourceRun], state.root); }
function requirePass(result) {
  if (result.code !== 0 || result.output.trim() !== 'PASS') throw new Error('Standalone hook did not return exact PASS: ' + result.output);
}
function sourceState(run, state, id) {
  const job = state.jobs[id]; if (!job) throw new Error('Unknown job');
  const manifest = checkedManifest(job);
  if (!job.sourceRun) throw new Error('Job has no collected source run');
  if (realpathSync(job.sourceRun) !== job.sourceRun || !job.sourceRun.startsWith(join(state.root, '.pi/tmp', `fix-bug-${id}-`))) throw new Error('Invalid source run path');
  const s = read(join(job.sourceRun, 'state.json'));
  if (s.root !== worktreePath(state.root, basename(job.sourceRun))) throw new Error('Source worktree is outside its dedicated .trees path');
  if (s.batchRun !== run || s.id !== id || s.ownerRoot !== state.root || s.base !== manifest.base) throw new Error('Source run is not bound to this immutable batch job');
  return s;
}
function integrationContext(run, state, id) {
  const job = state.jobs[id]; if (!job || job.status !== 'integrating') throw new Error('Job is not integrating');
  const lock = read(join(run, 'integration.lock/owner.json'));
  if (lock.id !== id) throw new Error('Another integration owns the transaction');
  const bytes = regular(job.integration);
  if (hash(bytes) !== job.integrationDigest) throw new Error('Integration context changed');
  const ctx = JSON.parse(bytes);
  assertOwner(state);
  if (ctx.root !== worktreePath(state.root, basename(run) + '-integrate-' + id)) throw new Error('Integration worktree is outside its dedicated .trees path');
  if (ctx.base !== state.base || git(ctx.root, 'branch', '--show-current') !== ctx.branch) throw new Error('Integration base/branch changed');
  if (git(state.root, 'rev-parse', ctx.sourceBranch) !== ctx.sourceSha) throw new Error('Verified source branch changed');
  return ctx;
}
function ancestry(root, ancestor, descendant) {
  if (command(['git', 'merge-base', '--is-ancestor', ancestor, descendant], root).code !== 0) throw new Error('Integration must include both the latest base and verified source');
}
function gateIdentity(ctx) {
  clean(ctx.root);
  if (existsSync(join(git(ctx.root, 'rev-parse', '--absolute-git-dir'), 'MERGE_HEAD'))) throw new Error('Commit the resolved merge before gating');
  const sha = git(ctx.root, 'rev-parse', 'HEAD');
  ancestry(ctx.root, ctx.sourceSha, sha); ancestry(ctx.root, ctx.base, sha);
  const paths = git(ctx.root, 'diff', '--name-only', '--no-renames', '-z', ctx.base, sha).split('\0').filter(Boolean);
  if (paths.some(path => !['src/', 'tests/', 'docs/'].some(prefix => path.startsWith(prefix)))) throw new Error('Integration changed workflow/package/control files outside the standalone verified shipment scope');
  return { sha, tree: git(ctx.root, 'rev-parse', 'HEAD^{tree}'), index: hash(git(ctx.root, 'ls-files', '--stage', '-z')) };
}
function runCatalog(run, state) {
  const path = join(run, 'catalog.json');
  if (existsSync(path)) {
    if (hash(regular(path)) !== state.catalogDigest) throw new Error('Immutable catalog changed');
    catalogCurrent(state, read(path)); return path;
  }
  assertOwner(state);
  const all = reports(state.root);
  if (all.filter(r => r.open).length > 1000) throw new Error('Batch limit is 1000 open reports');
  mkdirSync(join(run, 'snapshots'), { recursive: true });
  const entries = all.map(({ text, ...r }) => {
    const snapshot = join(run, 'snapshots', r.id + '.md'); writeFileSync(snapshot, text, { flag: 'wx' }); return { ...r, snapshot };
  });
  const tracked = new Set(git(state.root, 'ls-files', '-z').split('\0').filter(Boolean));
  const refs = new Set();
  for (const report of all.filter(r => r.open)) {
    for (const m of report.text.matchAll(/(?:^|[\s`(\[])([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+)(?::\d+(?:-\d+)?)?/gm)) if (tracked.has(m[1]) && safePath(m[1])) refs.add(m[1]);
  }
  const sources = [...refs].sort().map((source, index) => {
    const bytes = regular(safeLocal(state.root, source)); const snapshot = join(run, 'snapshots', `source-${index}`);
    writeFileSync(snapshot, bytes, { flag: 'wx' }); return { path: source, snapshot, digest: hash(bytes) };
  });
  const catalog = { version: 1, root: state.root, base: state.base, open: entries.filter(r => r.open), related: entries.filter(r => !r.open), reports: entries, sources, planPath: join(run, 'plan.json') };
  catalogCurrent(state, catalog); immutable(path, catalog); state.catalogDigest = hash(regular(path)); return path;
}
function acceptPlan(run, state) {
  if (state.planDigest) { checkedPlan(run, state); catalogCurrent(state, read(join(run, 'catalog.json'))); return; }
  if (!state.catalogDigest || hash(regular(join(run, 'catalog.json'))) !== state.catalogDigest) throw new Error('Missing or changed catalog');
  const catalog = read(join(run, 'catalog.json')); catalogCurrent(state, catalog);
  const planBytes = regular(join(run, 'plan.json')); const plan = JSON.parse(planBytes);
  const known = new Map(catalog.reports.map(r => [r.id, r])); const open = catalog.open.map(r => r.id);
  if (!Array.isArray(plan.bugs) || plan.bugs.length !== open.length || new Set(plan.bugs.map(b => b.id)).size !== open.length || plan.bugs.some(b => !open.includes(b.id))) throw new Error('Plan must contain every current open bug exactly once');
  if (!Array.isArray(plan.guidance) || plan.guidance.some(x => typeof x !== 'string' || !x.trim())) throw new Error('Plan guidance must be strings');
  for (const b of plan.bugs) {
    if (typeof b.ready !== 'boolean' || typeof b.reason !== 'string' || !b.reason.trim() || !Array.isArray(b.dependencies) || new Set(b.dependencies).size !== b.dependencies.length || b.dependencies.some(d => !known.has(d) || d === b.id)) throw new Error('Invalid readiness/reason/dependencies for ' + b.id);
    if (b.dependencies.some(d => !known.get(d).open && !resolved(known.get(d)))) throw new Error('Closed prerequisite is not resolved: ' + b.id);
    if (!Array.isArray(b.files) || b.files.some(p => !safePath(p)) || new Set(b.files).size !== b.files.length) throw new Error('Invalid predicted file paths for ' + b.id);
    for (const p of b.files) safeLocal(state.root, p);
  }
  const ordered = new Set();
  while (ordered.size < open.length) {
    const next = plan.bugs.filter(b => !ordered.has(b.id) && b.dependencies.every(d => !open.includes(d) || ordered.has(d))).sort((a, b) => a.id.localeCompare(b.id));
    if (!next.length) throw new Error('Dependency cycle in plan');
    for (const b of next) ordered.add(b.id);
  }
  state.planDigest = hash(planBytes); state.order = [...ordered];
  state.outcomes = Object.fromEntries(plan.bugs.filter(b => !b.ready).map(b => [b.id, { status: 'excluded', reason: b.reason }]));
}
const active = job => ['scheduled', 'verified', 'integrating'].includes(job.status);
function schedule(run, state) {
  assertOwner(state); const plan = checkedPlan(run, state); const byId = new Map(plan.bugs.map(b => [b.id, b]));
  const current = new Map(reports(state.root).map(r => [r.id, r])); const catalog = read(join(run, 'catalog.json'));
  if ([...current.values()].some(r => r.open && !byId.has(r.id))) throw new Error('Stale plan: new open reports appeared');
  for (const bug of plan.bugs.filter(b => !state.jobs[b.id] && !state.outcomes[b.id])) {
    if (!current.get(bug.id)?.open || current.get(bug.id).digest !== catalog.open.find(r => r.id === bug.id).digest) throw new Error('Stale pending bug report: ' + bug.id);
  }
  // Propagate terminal prerequisite failures; never retry or auto-drop a job.
  for (const id of state.order) {
    if (state.jobs[id] || state.outcomes[id]) continue;
    const failed = byId.get(id).dependencies.find(d => state.outcomes[d] || (state.jobs[d] && ['blocked', 'pending-approval'].includes(state.jobs[d].status)) || (!byId.has(d) && (!current.has(d) || !resolved(current.get(d)))));
    if (failed) state.outcomes[id] = { status: 'blocked', reason: `Prerequisite ${failed} is not integrated/resolved` };
  }
  const occupied = Object.entries(state.jobs).filter(([, j]) => active(j)).map(([id]) => byId.get(id));
  const candidates = plan.bugs.filter(b => b.ready && !state.jobs[b.id] && !state.outcomes[b.id] && b.dependencies.every(d => byId.has(d) ? state.jobs[d]?.status === 'integrated' : current.has(d) && resolved(current.get(d))));
  const overlap = (a, b) => !a.files.length || !b.files.length ? 1 : a.files.reduce((n, p) => n + b.files.filter(q => p === q || p.startsWith(q + '/') || q.startsWith(p + '/')).length, 0);
  const outputs = [];
  while (candidates.length && occupied.length < 4) {
    candidates.sort((a, b) => occupied.reduce((n, x) => n + overlap(a, x), 0) - occupied.reduce((n, x) => n + overlap(b, x), 0) || state.order.indexOf(a.id) - state.order.indexOf(b.id));
    const bug = candidates.shift(); const manifest = join(run, 'jobs', bug.id + '.json');
    immutable(manifest, { version: 1, batchRun: run, ownerRoot: state.root, id: bug.id, base: state.base, review_rounds: 5 });
    state.jobs[bug.id] = { manifest, manifestDigest: hash(regular(manifest)), status: 'scheduled' };
    occupied.push(bug); outputs.push(manifest);
  }
  return outputs.length ? outputs.join('\n') : 'DONE';
}
function batchSources(run, state) {
  return readdirSync(join(state.root, '.pi/tmp')).filter(name => /^fix-bug-\d{4}-[0-9a-f-]{36}$/.test(name))
    .map(name => join(state.root, '.pi/tmp', name)).filter(path => existsSync(join(path, 'state.json')) && read(join(path, 'state.json')).batchRun === run);
}
function assertSettledSources(run, state) {
  for (const source of batchSources(run, state)) {
    if (existsSync(join(source, 'active'))) throw new Error('Source host is still marked active: ' + source);
  }
  // A launch claim is published before initialization. An interrupted launch
  // without its source state cannot be guessed away by collect or finish.
  for (const name of readdirSync(join(run, 'jobs')).filter(name => /^\d{4}\.launch$/.test(name))) {
    const claim = read(join(run, 'jobs', name, 'owner.json'));
    if (typeof claim.run !== 'string' || !batchSources(run, state).includes(claim.run)) throw new Error('Unreconciled batch launch claim: ' + name);
  }
}
function collect(run, state, id) {
  const job = state.jobs[id]; if (!job || job.status !== 'scheduled') throw new Error('Only a scheduled job can be collected');
  checkedManifest(job);
  const found = batchSources(run, state).filter(path => read(join(path, 'state.json')).id === id);
  if (found.length !== 1) { job.status = 'blocked'; job.reason = 'Expected exactly one batch-bound standalone run'; return; }
  job.sourceRun = found[0];
  try { sourceState(run, state, id); }
  catch (error) { job.status = 'blocked'; job.reason = error.message; return; }
  const result = standaloneCall(state, 'export-verified', job.sourceRun);
  save(join(run, 'jobs', id + '-export-attempt.json'), result);
  if (result.code === 0 && result.output.trim() === 'PASS') {
    const exported = { version: 1, run: job.sourceRun, stateDigest: hash(regular(join(job.sourceRun, 'state.json'))), result };
    immutable(join(run, 'jobs', id + '-verified.json'), exported);
    job.exportPath = join(run, 'jobs', id + '-verified.json'); job.exportDigest = hash(regular(job.exportPath)); job.status = 'verified'; return;
  }
  const approval = standaloneCall(state, 'approval-report', job.sourceRun);
  save(join(run, 'jobs', id + '-approval-report.json'), approval);
  job.status = approval.code === 0 && approval.output.trim().startsWith('PENDING OWNER APPROVAL — shipment blocked\n') ? 'pending-approval' : 'blocked';
  job.reason = result.output.trim();
}
function integrationStart(run, state, id) {
  const job = state.jobs[id]; if (!job || job.status !== 'verified') throw new Error('Only a verified job may integrate');
  assertOwner(state); const source = sourceState(run, state, id);
  if (hash(regular(job.exportPath)) !== job.exportDigest) throw new Error('Verified export changed');
  const lock = join(run, 'integration.lock');
  try { mkdirSync(lock); } catch { throw new Error('An integration transaction is already active; preserve it until reconciled'); }
  immutable(join(lock, 'owner.json'), { id });
  // The transaction remains locked even on a hook/worktree failure. The report
  // names the failed operation; no automatic unlock, reset or conflict abort.
  job.status = 'integrating';
  const folder = join(run, 'integrations', id); mkdirSync(folder, { recursive: true });
  requirePass(standaloneCall(state, 'commit-verified', job.sourceRun));
  const committed = read(join(job.sourceRun, 'batch-commit.json'));
  immutable(join(folder, 'source-commit.json'), committed);
  const after = read(join(job.sourceRun, 'state.json'));
  const sourceBranch = after.branch ?? source.branch; const sourceSha = git(state.root, 'rev-parse', sourceBranch);
  if (committed.sha !== sourceSha) throw new Error('commit-verified SHA does not match the source branch');
  const witnessesPath = join(job.sourceRun, 'witnesses.json'); const witnessBytes = regular(witnessesPath); const witnesses = JSON.parse(witnessBytes); validateWitnesses(witnesses);
  // Retain earlier bugs' regression/live commands too: a conflict resolution
  // must not silently drop an already-integrated behavior just because its
  // witness has not yet been registered with the repository's npm test suite.
  const previous = Object.values(state.jobs).filter(j => j.status === 'integrated').flatMap(j => {
    if (hash(regular(j.integration)) !== j.integrationDigest) throw new Error('Prior integration context changed');
    return read(j.integration).commands.slice(2);
  });
  const regressions = [...previous, ...witnesses.e2e.map(w => w.argv), ...witnesses.unit.map(w => w.argv), ...witnesses.live];
  const unique = [...new Map(regressions.map(argv => [JSON.stringify(argv), argv])).values()];
  const commands = [['npm', 'run', 'typecheck'], ['npm', 'test'], ...unique];
  if (commands.some(argv => !Array.isArray(argv) || !argv.length || argv.some(x => typeof x !== 'string' || !x))) throw new Error('Invalid frozen integration gate command');
  immutable(join(folder, 'witnesses.json'), witnesses);
  const root = prepareWorktreePath(state.root, basename(run) + '-integrate-' + id);
  const branch = `fix-all-bugs/integrate-${id}-${randomUUID()}`;
  git(state.root, 'worktree', 'add', '-b', branch, root, state.base);
  const ctx = { version: 1, batchRun: run, id, run: job.sourceRun, root, sourceRoot: source.root, sourceSha, sourceBranch, base: state.base, branch, commands, witnessDigest: hash(witnessBytes), verdictPath: join(run, `integration-result-${id}.json`), reportDirectory: folder, ownerRoot: state.root, gatePath: join(folder, 'gate.json'), mergeArgv: ['git', 'merge', '--no-ff', '--no-edit', sourceSha], gateArgv: [process.execPath, fileURLToPath(import.meta.url), 'integration-gate', run, id] };
  job.integration = join(folder, 'integration.json'); immutable(job.integration, ctx); job.integrationDigest = hash(regular(job.integration));
  return job.integration;
}
function integrationGate(run, state, id) {
  const ctx = integrationContext(run, state, id); const identity = gateIdentity(ctx); const job = state.jobs[id];
  delete job.gateDigest; delete job.gateIdentity;
  job.gateAttempts = (job.gateAttempts ?? 0) + 1;
  const attempt = join(dirname(job.integration), 'gate-' + job.gateAttempts); mkdirSync(attempt);
  const results = [];
  for (let i = 0; i < ctx.commands.length; i++) {
    const argv = ctx.commands[i]; const result = command(argv, ctx.root);
    const log = join(attempt, `${i}.json`); immutable(log, { argv, ...result }); results.push({ path: log, digest: hash(regular(log)) });
    if (result.code !== 0) throw new Error('Integration gate failed; all logs retained: ' + attempt);
  }
  if (JSON.stringify(gateIdentity(ctx)) !== JSON.stringify(identity)) throw new Error('Integration checkout changed during gates');
  const gate = { version: 1, contextDigest: job.integrationDigest, ...identity, commands: ctx.commands, results };
  save(ctx.gatePath, gate); job.gateDigest = hash(regular(ctx.gatePath)); job.gateIdentity = identity;
  return 'PASS';
}
function integrateRecord(run, state, id) {
  const ctx = integrationContext(run, state, id); const job = state.jobs[id];
  const verdict = JSON.parse(regular(ctx.verdictPath));
  // Exact typed verdict. CLEAN in free text (or ok:'true') grants no authority.
  if (verdict.ok !== true || typeof verdict.findings !== 'string' || !verdict.findings.trim()) throw new Error('Worker verdict must be {ok:true, findings:nonempty string}; failures remain locked');
  const identity = gateIdentity(ctx);
  const gateBytes = existsSync(ctx.gatePath) ? regular(ctx.gatePath) : null;
  if (!job.gateDigest || !gateBytes || hash(gateBytes) !== job.gateDigest || JSON.stringify(identity) !== JSON.stringify(job.gateIdentity)) throw new Error('Missing fresh integration gate for the final committed checkout');
  const gate = JSON.parse(gateBytes);
  if (gate.contextDigest !== job.integrationDigest || gate.sha !== identity.sha) throw new Error('Gate does not bind this integration');
  for (const result of gate.results) if (hash(regular(result.path)) !== result.digest || read(result.path).code !== 0) throw new Error('Integration gate log changed or failed');
  const source = sourceState(run, state, id);
  if (source.root !== ctx.sourceRoot || source.branch !== ctx.sourceBranch || git(source.root, 'rev-parse', 'HEAD') !== ctx.sourceSha || hash(regular(join(job.sourceRun, 'witnesses.json'))) !== ctx.witnessDigest) throw new Error('Source identity/witnesses changed after integration setup');
  requirePass(standaloneCall(state, 'export-verified', job.sourceRun));
  assertSettledSources(run, state);
  job.verdictDigest = hash(regular(ctx.verdictPath));
  immutable(join(dirname(job.integration), 'review-binding.json'), { version: 1, verdict, verdictDigest: job.verdictDigest, gateDigest: job.gateDigest, ...identity });
  // Push exactly the gated commit before touching owner main. Never force and
  // never rebase/reset an owner checkout to recover a rejected shipment.
  const push = command(['git', 'push', 'origin', `${identity.sha}:refs/heads/main`], state.root);
  job.shipment = { sha: identity.sha, base: ctx.base, pushed: push.code === 0, output: push.output, cleaned: false };
  save(join(dirname(job.integration), 'shipment.json'), job.shipment);
  if (push.code !== 0) throw new Error('Integration push failed; transaction and both worktrees retained');
  assertOwner(state);
  git(state.root, 'merge', '--ff-only', '--', identity.sha); state.base = identity.sha;
  assertOwner(state);
  try {
    job.shipment.piConfig = existsSync(join(state.root, 'package.json')) && read(join(state.root, 'package.json')).name === '@bitmonk8/pi-theta'
      ? updatePiConfig(identity.sha, command) : { skipped: true, reason: 'Not a pi-theta checkout' };
    save(join(dirname(job.integration), 'shipment.json'), job.shipment);
  } catch (error) {
    job.shipment.piConfig = { status: 'incomplete', error: error.message }; save(join(dirname(job.integration), 'shipment.json'), job.shipment);
    throw new Error('Pushed successfully; pi-config update failed. Do not rerun shipment; reconcile consumer update: ' + error.message);
  }
  assertOwner(state);
  if (git(source.root, 'rev-parse', 'HEAD') !== ctx.sourceSha) throw new Error('Source identity changed during shipment; preserve both worktrees');
  clean(source.root); clean(ctx.root);
  git(state.root, 'worktree', 'remove', source.root); git(state.root, 'branch', '-d', ctx.sourceBranch);
  git(state.root, 'worktree', 'remove', ctx.root); git(state.root, 'branch', '-d', ctx.branch);
  job.shipment.cleaned = true; job.status = 'integrated'; save(join(dirname(job.integration), 'shipment.json'), job.shipment);
  rmSync(join(run, 'integration.lock'), { recursive: true });
}
function report(run, state) {
  const plan = state.planDigest ? checkedPlan(run, state) : { bugs: [] };
  return { version: 1, run, root: state.root, base: state.base, finished: state.finished ?? false, catalog: join(run, 'catalog.json'), plan: join(run, 'plan.json'), integrationLock: existsSync(join(run, 'integration.lock')) ? join(run, 'integration.lock') : null,
    lastError: state.lastError ?? null, finishError: state.finishError ?? null, errors: state.errors ?? [],
    bugs: plan.bugs.map(b => ({ id: b.id, ...(state.outcomes[b.id] ?? { status: state.jobs[b.id]?.status ?? 'pending', reason: b.reason }), ...(state.jobs[b.id] ?? {}) })) };
}
function renderReport(value, state) {
  const lines = ['FIX ALL BUGS — ' + (value.finished ? 'COMPLETE' : 'STOPPED / NOT FINALIZED'), 'Main: ' + value.base, 'Reports: ' + value.run];
  for (const failure of [value.lastError, value.finishError].filter(Boolean)) lines.push(failure.op + ': ' + failure.message);
  for (const bug of value.bugs) {
    lines.push('', bug.id + ' — ' + bug.status + ': ' + (bug.reason ?? '').replace(/[\r\n]+/g, ' '));
    if (bug.shipment) lines.push(bug.shipment.pushed
      ? 'PUSHED ' + bug.shipment.sha + (bug.shipment.cleaned ? '; cleanup complete.' : '; consumer update/cleanup INCOMPLETE. Do not rerun shipment blindly.')
      : 'Push did not succeed; inspect shipment evidence before retrying.');
    else if (bug.status === 'integrating') lines.push('No successful push recorded. Inspect remote main and shipment artifacts before any retry.');
    if (bug.sourceRun && bug.status !== 'integrated') {
      lines.push('Retained source run: ' + bug.sourceRun);
      const source = read(join(bug.sourceRun, 'state.json'));
      lines.push('Branch: ' + source.branch, 'Worktree: ' + source.root);
    }
    if (bug.status === 'pending-approval') {
      const approval = standaloneCall(state, 'approval-report', bug.sourceRun);
      lines.push(approval.code === 0 ? approval.output.trim() : 'Approval report unavailable; inspect the immutable decision records.');
    }
    if (bug.integration) lines.push('Integration context: ' + bug.integration);
  }
  const text = lines.join('\n');
  return Buffer.byteLength(text, 'utf8') <= 60000 ? text : Buffer.from(text).subarray(0, 59000).toString('utf8') + '\n[Display truncated; complete outcomes in ' + join(value.run, 'report.json') + ' and source decision reports.]';
}
export function main(args, cwd = process.cwd()) {
  const [op, arg, id] = args;
  if (op === 'start') {
    const root = realpathSync(git(cwd, 'rev-parse', '--show-toplevel'));
    if (git(root, 'branch', '--show-current') !== 'main') throw new Error('Batch requires main'); clean(root);
    const run = join(root, '.pi/tmp', 'fix-all-bugs-' + randomUUID()); mkdirSync(run, { recursive: true });
    const lock = join(root, '.pi/tmp/fix-bug.lock');
    try { mkdirSync(lock); } catch { throw new Error('Another bug workflow owns the checkout lease'); }
    try {
      mkdirSync(join(run, 'jobs')); mkdirSync(join(run, 'integrations'));
      immutable(join(run, 'state.json'), { version: 1, root, base: git(root, 'rev-parse', 'HEAD'), jobs: {}, outcomes: {}, revision: 0 });
      immutable(join(lock, 'owner.json'), { run, kind: 'batch' });
    } catch (error) { rmSync(lock, { recursive: true }); throw error; }
    console.log(run); return;
  }
  const run = realpathSync(resolve(cwd, arg ?? '')); const statePath = join(run, 'state.json');
  const guard = join(run, 'controller.lock');
  try { mkdirSync(guard); } catch { throw new Error('Another batch controller operation is in progress; do not remove lock while commands are active'); }
  try {
    const state = read(statePath);
    if (state.version !== 1 || state.root !== realpathSync(git(cwd, 'rev-parse', '--show-toplevel')) || !run.startsWith(join(state.root, '.pi/tmp/fix-all-bugs-'))) throw new Error('Batch belongs to another owner checkout');
    if (op === 'report' || op === 'render-report') {
      const value = report(run, state); save(join(run, 'report.json'), value);
      console.log(op === 'report' ? encode(value).trimEnd() : renderReport(value, state)); return;
    }
    if (state.finished) throw new Error('Batch already finished');
    assertLease(run, state);
    if (['collect', 'integration-start', 'integration-gate', 'integrate-record'].includes(op) && !/^\d{4}$/.test(id ?? '')) throw new Error('Expected four-digit job id');
    let output = 'PASS';
    try {
      if (op === 'catalog') {
        const path = runCatalog(run, state); output = read(path).open.length ? path : 'EMPTY';
      }
      else if (op === 'plan') acceptPlan(run, state);
      else if (op === 'next') output = schedule(run, state);
      else if (op === 'collect') {
        collect(run, state, id);
        output = state.jobs[id].status === 'verified' ? 'VERIFIED' : state.jobs[id].status === 'pending-approval' ? 'PENDING' : 'BLOCKED';
      }
      else if (op === 'integration-start') output = integrationStart(run, state, id);
      else if (op === 'integration-gate') output = integrationGate(run, state, id);
      else if (op === 'integrate-record') integrateRecord(run, state, id);
      else if (op === 'finish') {
        // No lease release can certify an externally changed owner checkout.
        assertOwner(state);
        if (Object.values(state.jobs).some(active) || existsSync(join(run, 'integration.lock'))) throw new Error('Cannot finish while jobs or an integration transaction are active');
        assertSettledSources(run, state);
        if (state.planDigest) {
          const plan = checkedPlan(run, state);
          if (plan.bugs.some(b => !state.jobs[b.id] && !state.outcomes[b.id])) throw new Error('Unclassified pending bugs remain; call next to propagate prerequisite failures');
        }
        state.finished = true; save(join(run, 'report.json'), report(run, state)); rmSync(join(state.root, '.pi/tmp/fix-bug.lock'), { recursive: true });
      } else throw new Error('Unknown operation: ' + op);
      if (op === 'finish') delete state.finishError;
      else delete state.lastError;
    } catch (error) {
      const failure = { op, id, message: error.message };
      state.errors = [...(state.errors ?? []), failure];
      if (op === 'finish') state.finishError = failure;
      else state.lastError = failure;
      throw error;
    } finally { state.revision++; save(statePath, state); }
    console.log(output);
  } finally { rmSync(guard, { recursive: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error('BLOCKED: ' + error.message); process.exitCode = 1; }
}
