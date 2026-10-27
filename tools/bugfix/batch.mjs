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
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, rmSync, realpathSync, lstatSync, openSync, closeSync, fsyncSync } from 'node:fs';
import { resolve, join, dirname, isAbsolute, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { command, validateWitnesses, worktreePath, prepareWorktreePath, executionControlPaths, verifiedSourceEvidence } from './run.mjs';
import { updatePiConfig } from './update-pi-config.mjs';
import { prepareWorktreeEnvironment, prepareWorktreeEnvironmentAsync } from './worktree-env.mjs';
import { runGateCommand, GATE_TOTAL_TIMEOUT_MS, GATE_COMMAND_TIMEOUT_MS, GATE_SHELL_TIMEOUT_SECONDS } from './gate-runner.mjs';
import { acquireController, releaseController, controllerObservation, recoveryPlan, recoverController } from './controller-recovery.mjs';
import { atomicImmutableJson as immutable } from './atomic-record.mjs';

const standalone = fileURLToPath(new URL('./run.mjs', import.meta.url));
const hash = text => createHash('sha256').update(text).digest('hex');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const encode = value => JSON.stringify(value, null, 2) + '\n';
function syncDirectory(path) {
  if (process.platform === 'win32') return;
  const fd = openSync(dirname(path), 'r');
  try { fsyncSync(fd); } catch (error) { if (!['EINVAL', 'ENOTSUP'].includes(error.code)) throw error; } finally { closeSync(fd); }
}
function save(path, value) {
  const temp = path + '.' + randomUUID() + '.tmp';
  immutable(temp, value); renameSync(temp, path); syncDirectory(path);
}
function git(root, ...args) {
  const r = command(['git', ...args], root, undefined, { ...process.env, GIT_OPTIONAL_LOCKS: '0' });
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
function remoteMain(state) {
  const text = git(state.root, 'ls-remote', '--exit-code', 'origin', 'refs/heads/main');
  if (!/^[0-9a-f]{40,64}\s+refs\/heads\/main$/.test(text)) throw new Error('Cannot establish remote main identity; shipment state is unknown');
  return text.split(/\s+/)[0];
}
function noPush(run, state, job) {
  assertOwner(state); assertSettledSources(run, state);
  const folder = job.integration ? dirname(job.integration) : join(run, 'integrations', checkedManifest(job).id);
  if (existsSync(join(folder, 'active'))) throw new Error('Integration worker is still marked active; confirm all children stopped before reconciliation');
  // The intent is durable BEFORE git push: a timeout/crash is not a rejected push.
  if (job.shipment || existsSync(join(folder, 'shipment.json')) || existsSync(join(folder, 'push-attempt.json'))) throw new Error('Shipment was attempted or may have succeeded; reconcile remote/consumer state explicitly, never replay shipment');
  const remote = remoteMain(state);
  if (remote !== (state.remoteBase ?? state.base)) throw new Error('Remote main changed; cannot certify a pre-push failure');
  return { remote, folder };
}
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
function integrationContext(run, state, id, recovering = false) {
  const job = state.jobs[id]; if (!job || job.status !== 'integrating') throw new Error('Job is not integrating');
  const lock = read(join(run, 'integration.lock/owner.json'));
  if (lock.id !== id) throw new Error('Another integration owns the transaction');
  const bytes = regular(job.integration);
  if (hash(bytes) !== job.integrationDigest) throw new Error('Integration context changed');
  const ctx = JSON.parse(bytes);
  assertOwner(state);
  const suffix = (job.integrationAttempt ?? 1) > 1 ? '-attempt-' + job.integrationAttempt : '';
  if (ctx.root !== worktreePath(state.root, basename(run) + '-integrate-' + id + suffix)) throw new Error('Integration worktree is outside its dedicated .trees path');
  const knownBase = recovering && (state.workflowUpgrades ?? []).some(u => u.base === ctx.base);
  if ((ctx.base !== state.base && !knownBase) || git(ctx.root, 'branch', '--show-current') !== ctx.branch) throw new Error('Integration base/branch changed');
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
  state.outcomes = Object.fromEntries(plan.bugs.filter(b => !b.ready).map(b => [b.id, { status: 'authorization-required', reason: b.reason, attempted: false, authority: 'required', disposition: 'Resolve the stated owner hold or external prerequisite; no unauthorized implementation.' }]));
}
const active = job => ['queued', 'scheduled', 'verified', 'integrating'].includes(job.status);
function schedule(run, state) {
  assertOwner(state); const plan = checkedPlan(run, state); const byId = new Map(plan.bugs.map(b => [b.id, b]));
  const current = new Map(reports(state.root).map(r => [r.id, r])); const catalog = read(join(run, 'catalog.json'));
  if ([...current.values()].some(r => r.open && !byId.has(r.id))) throw new Error('Stale plan: new open reports appeared');
  for (const bug of plan.bugs.filter(b => !state.jobs[b.id] && !state.outcomes[b.id])) {
    if (!current.get(bug.id)?.open || current.get(bug.id).digest !== catalog.open.find(r => r.id === bug.id).digest) throw new Error('Stale pending bug report: ' + bug.id);
  }
  // Propagate only causal prerequisite failures. Resumes explicitly requeue
  // existing runs; scheduling never invents another launch of the same bug.
  for (const id of state.order) {
    if (state.jobs[id] || state.outcomes[id]) continue;
    const failed = byId.get(id).dependencies.find(d => state.outcomes[d] || (state.jobs[d] && ['blocked', 'pending-approval', 'not-reproduced', 'integration-blocked'].includes(state.jobs[d].status)) || (!byId.has(d) && (!current.has(d) || !resolved(current.get(d)))));
    if (failed) state.outcomes[id] = { status: 'blocked', prerequisite: failed, attempted: false, reason: `Prerequisite ${failed} is not integrated/resolved` };
  }
  const occupied = Object.entries(state.jobs).filter(([, j]) => active(j) && j.status !== 'queued').map(([id]) => byId.get(id));
  const candidates = plan.bugs.filter(b => b.ready && !state.jobs[b.id] && !state.outcomes[b.id] && b.dependencies.every(d => byId.has(d) ? state.jobs[d]?.status === 'integrated' : current.has(d) && resolved(current.get(d))));
  const overlap = (a, b) => !a.files.length || !b.files.length ? 1 : a.files.reduce((n, p) => n + b.files.filter(q => p === q || p.startsWith(q + '/') || q.startsWith(p + '/')).length, 0);
  const outputs = [];
  // A resume may have settled/paused original sources or unlaunched scheduled
  // manifests. Return these exact manifests, never replace their launch claims.
  for (const id of state.order.filter(id => state.jobs[id]?.status === 'scheduled' && state.jobs[id].redispatch)) {
    outputs.push(state.jobs[id].manifest); delete state.jobs[id].redispatch;
  }
  for (const id of state.order.filter(id => state.jobs[id]?.status === 'queued')) {
    if (occupied.length >= 4) break;
    const job = state.jobs[id]; job.status = 'scheduled'; occupied.push(byId.get(id)); outputs.push(job.manifest);
  }
  while (candidates.length && occupied.length < 4) {
    candidates.sort((a, b) => occupied.reduce((n, x) => n + overlap(a, x), 0) - occupied.reduce((n, x) => n + overlap(b, x), 0) || state.order.indexOf(a.id) - state.order.indexOf(b.id));
    const bug = candidates.shift(); const manifest = join(run, 'jobs', bug.id + '.json');
    immutable(manifest, { version: 1, batchRun: run, ownerRoot: state.root, id: bug.id, base: state.base, review_rounds: 5 });
    state.jobs[bug.id] = { manifest, manifestDigest: hash(regular(manifest)), status: 'scheduled' };
    occupied.push(bug); outputs.push(manifest);
  }
  if (outputs.length) return outputs.join('\n');
  state.schedulingComplete = !Object.values(state.jobs).some(active);
  return 'DONE';
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
function attemptPath(folder, name, extension = '.json') {
  let path = join(folder, name + extension); let n = 1;
  while (existsSync(path)) path = join(folder, name + '-' + (++n) + extension);
  return path;
}
const transitionKinds = new Set(['stage', 'review', 'decision', 'gate', 'scope-revision']);
const stopped = status => ['blocked', 'BLOCKED', 'failed', 'needs_decision', 'needs_replan', 'needs_spec', 'not_reproduced'].includes(status);
const reportName = phase => ({ evidence: 'evidence-review', fix: 'reviews', final: 'final-review', scope: 'plan' })[phase] ?? phase;
function optionalJson(path) {
  try { return read(path); } catch { return null; }
}
function stageSummary(run, phase) {
  const path = join(run, `stage-${phase}-result.txt`);
  return existsSync(path) ? readFileSync(path, 'utf8').split('\n').slice(1).join('\n').trim() : '';
}
// A projection only: it grants no authority and never rewrites the source or
// invents chronology from phase priority, directory order or filesystem mtimes.
export function latestSourceTransition(sourceRun, source) {
  const t = source.lastTransition;
  const valid = t && Number.isSafeInteger(t.sequence) && t.sequence > 0
    && Number.isSafeInteger(t.revision) && t.revision >= 0 && t.revision <= (source.revision ?? 0)
    && Number.isSafeInteger(t.generation) && t.generation >= 0 && t.generation <= (source.generation ?? 0)
    && transitionKinds.has(t.kind) && typeof t.phase === 'string' && Boolean(t.phase.trim())
    && typeof t.status === 'string' && Boolean(t.status.trim())
    && ['reportPath', 'contextPath'].every(key => t[key] === undefined || (typeof t[key] === 'string' && isAbsolute(t[key])))
    && (t.summary === undefined || typeof t.summary === 'string');
  if (valid) return { transition: { ...t }, basis: 'recorded-transition', limitation: null };
  const limitations = t ? ['Invalid or future-bound lastTransition was not used.'] : [];
  // Human confirmations settle authorization, not engineering prerequisites.
  const last = (source.decisions ?? []).filter(d => d.source !== 'human').at(-1);
  const lastDecision = last ? { phase: last.phase, status: last.outcome, recordPath: last.path, contextPath: last.contextPath } : null;
  if (source.stages?.includes('gate-final') && source.finalReviewDigest && !source.replanRequired && !unresolvedScope(source)) {
    limitations.push('Legacy final gates/review record source completion, but do not establish an exact latest transition sequence. Prior checkpoints are history, not the current stop.');
    return { transition: null, basis: 'legacy-completion-evidence', limitation: limitations.join(' '), lastDecision };
  }
  const context = last?.contextPath ? optionalJson(last.contextPath) : null;
  const checkpoints = Object.entries(source.checkpoints ?? {});
  const fromStage = ([phase, checkpoint]) => ({ kind: 'stage', phase, status: checkpoint.status,
    reportPath: join(sourceRun, phase + '.md'), summary: stageSummary(sourceRun, phase) });
  if (last && context?.authority?.checkpoints) {
    const snapshot = context.authority.checkpoints;
    const changed = checkpoints.filter(([phase, checkpoint]) => JSON.stringify(checkpoint) !== JSON.stringify(snapshot[phase]));
    const removed = Object.keys(snapshot).filter(phase => !Object.hasOwn(source.checkpoints ?? {}, phase));
    // Exactly one changed checkpoint with a greater per-phase attempt is a
    // supported successor of the snapshot. Multiple changes remain unordered.
    if (changed.length === 1 && Number.isSafeInteger(changed[0][1].attempt)
      && changed[0][1].attempt > (snapshot[changed[0][0]]?.attempt ?? 0)) {
      return { transition: fromStage(changed[0]), basis: 'legacy-checkpoint-successor', limitation: limitations.join(' ') || null, lastDecision };
    }
    if (!changed.length && !removed.length) {
      return { transition: { kind: 'decision', phase: last.phase, status: last.outcome, contextPath: last.contextPath,
        reportPath: join(sourceRun, reportName(last.phase) + '.md'), summary: last.rationale ?? '' },
      basis: 'legacy-ordered-decision', limitation: limitations.join(' ') || null, lastDecision };
    }
  }
  if (!last && checkpoints.length === 1) return { transition: fromStage(checkpoints[0]), basis: 'legacy-only-checkpoint', limitation: limitations.join(' ') || null, lastDecision };
  if (!last && !checkpoints.length) return { transition: null, basis: 'unrecorded', limitation: limitations.join(' ') || null, lastDecision };
  limitations.push('Legacy source has no unambiguous latest transition; inspect checkpoint history and the linked last engineering decision.');
  return { transition: null, basis: 'legacy-ambiguous', limitation: limitations.join(' '), lastDecision };
}
function pendingApprovals(source) {
  return (source.decisions ?? []).filter(d => d.authority?.provisional && !(source.decisions ?? []).some(a => a.contextPath === d.contextPath && a.source === 'human')).map(d => {
    const record = optionalJson(d.path);
    return { phase: d.phase, contextPath: d.contextPath, recordPath: d.path, summary: d.rationale ?? 'Exact owner confirmation pending', alternatives: [], ...(record?.verdict ?? {}) };
  });
}
function unresolvedScope(source) {
  if (source.scopeRevision && source.scopeRevision.status !== 'pass') return true;
  const pending = source.pendingScopeReplan;
  if (!pending?.exactRequest) return false;
  const approved = source.scopeReplanAuthorization;
  const grant = source.decisions?.find(d => d.path === approved?.decisionPath);
  return !(approved?.planDigest === source.checkpoints?.plan?.reportDigest
    && approved?.requestDigest === hash(pending.exactRequest) && grant?.phase === 'scope'
    && grant.outcome === 'CONTINUE' && grant.authority?.exactRequest === pending.exactRequest);
}
function currentSourceCompletion(source, latest) {
  if (!source.stages?.includes('gate-final') || !source.finalReviewDigest || source.replanRequired || unresolvedScope(source)) return false;
  const t = latest.transition;
  // A passing proposal/PLAN is not final review. Once monotonic telemetry is
  // available, stale final-gate fields cannot outvote newer engineering work.
  if (latest.basis === 'recorded-transition') return t.kind === 'review' && t.phase === 'final' && t.status === 'pass';
  return !stopped(t?.status);
}
// Exported for deterministic fixtures. Job status is a controller classification;
// source completion is not a claim that export, integration or shipment passed.
export function projectJobProgress(job, source) {
  const value = { ...job };
  const latest = latestSourceTransition(job.sourceRun, source);
  const complete = currentSourceCompletion(source, latest);
  const exported = Boolean(job.exportPath && job.exportDigest) && ['verified', 'integrating', 'integration-blocked', 'integrated'].includes(job.status);
  const approvals = Array.isArray(source.decisions) ? pendingApprovals(source) : (job.approvals ?? []);
  Object.assign(value, { sourceProgress: latest, sourceHistory: { statePath: join(job.sourceRun, 'state.json'), checkpoints: source.checkpoints ?? {} },
    execution: complete || exported ? 'completed' : latest.transition?.status === 'running' ? 'running' : stopped(latest.transition?.status) ? 'blocked' : 'incomplete',
    verification: exported ? 'passed' : complete ? 'awaiting-export' : 'incomplete', approvals,
    authority: job.authority === 'integrity-blocked' ? job.authority : approvals.length ? 'pending' : 'clear',
    integrationState: job.status === 'integrated' ? 'integrated' : job.status === 'integration-blocked' ? 'blocked' : job.status === 'integrating' ? 'in-progress' : 'not-started',
    integrationVerification: job.status === 'integration-blocked' ? 'failed' : job.status === 'integrated' ? 'passed' : 'not-established',
    shipmentState: job.shipment ? job.shipment.pushed ? (job.shipment.cleaned ? 'pushed' : 'pushed-cleanup-incomplete') : 'attempted-unconfirmed' : job.status === 'integrated' ? 'recorded-integrated' : job.shipmentState ?? 'not-attempted' });
  delete value.checkpoint;
  if (!complete && !exported && latest.transition) value.checkpoint = { phase: latest.transition.phase, status: latest.transition.status, report: latest.transition.reportPath ?? null };
  const t = latest.transition;
  if (job.shipment?.pushed && !job.shipment.cleaned) {
    value.reason = 'Verified source pushed; integration/consumer update/cleanup is incomplete.';
    value.immediateBlocker = 'Consumer update/cleanup incomplete; do not rerun shipment.';
    value.nextAction = 'Reconcile the recorded integration, consumer update and cleanup without replaying push.';
  } else if (job.shipment && !job.shipment.pushed) {
    value.immediateBlocker = 'Shipment was attempted but no successful push is recorded; remote outcome must be reconciled.';
    value.nextAction = 'Reconcile the retained push intent, remote and consumer identity before any retry; do not replay shipment.';
  } else if (job.status === 'integrated') {
    value.reason = 'Source integrated; no unresolved source checkpoint.';
    value.immediateBlocker = null;
    value.nextAction = 'No further implementation or shipment is scheduled.';
  } else if (job.status === 'integration-blocked') {
    value.immediateBlocker = 'Integration prerequisite failed: ' + (job.reason ?? 'inspect the retained integration evidence');
    value.nextAction = 'Resolve the retained integration failure, then use the supported integration retry with fresh gates and review; source verification is separate.';
  } else if (exported) {
    value.reason = 'Source witnesses, final gates and independent review verified.';
    value.immediateBlocker = job.status === 'integrating' ? 'Integration has not settled.' : null;
    value.nextAction = job.status === 'integrating' ? 'Settle the existing integration transaction; do not start a second shipment.' : 'Use the existing verified-source integration path; no new source job is needed.';
  } else if (complete) {
    value.reason = 'Source execution complete; ' + (approvals.length ? 'exact owner confirmation is pending before shipment.' : 'verified export has not passed.');
    value.immediateBlocker = job.authority === 'integrity-blocked' ? 'Source authority/integrity audit failed.' : approvals.length ? 'Exact owner confirmation pending for shipment.' : 'Verified export has not passed.';
    value.nextAction = approvals.length ? 'Record the exact pending owner confirmation, then re-collect/export the original source; do not waive any verification prerequisite.' : 'Inspect the export attempt and re-collect the original source after its prerequisite is satisfied.';
  } else {
    value.reason = t?.kind === 'decision' && t.status === 'CONTINUE'
      ? 'Source verification is incomplete; the recorded scoped decision allows continuation, not shipment.'
      : t?.summary ? t.summary : latest.limitation ?? (t ? `Latest source transition ${t.phase}/${t.status}; source verification remains incomplete.` : job.reason ?? 'Source verification is incomplete.');
    value.immediateBlocker = job.authority === 'integrity-blocked' ? 'Source authority/integrity audit failed.' : stopped(t?.status) ? `${t.phase}/${t.status}: ${t.summary || 'inspect the linked report'}` : 'Source verification is incomplete; ' + (latest.limitation ?? 'no completed source verification is recorded.');
    value.nextAction = t?.status === 'not_reproduced' || job.status === 'not-reproduced' ? 'Retain the non-reproduction evidence; do not implement or ship an unverified fix.'
      : ['plan', 'evidence', 'scope'].includes(t?.phase) && stopped(t?.status) && unresolvedScope(source) ? 'Resolve the rejected plan/request through supported report-only scope revision, then fresh PLAN, independent evidence review and exact scoped authorization before implementation.'
      : 'Continue only the original source through its supported checkpoint/revision path, resolve the engineering prerequisite, and obtain fresh gates/review; pending shipment approval alone cannot complete this work.';
  }
  return value;
}
function laneState(sourceRun, source, approval) {
  const pending = approval.code === 0 && approval.output.startsWith('PENDING OWNER APPROVAL — shipment blocked');
  const approvals = pending ? (source.decisions ?? []).filter(d => d.authority?.provisional && !(source.decisions ?? []).some(a => a.contextPath === d.contextPath && a.source === 'human')).map(d => {
    const record = read(d.path);
    return { phase: d.phase, contextPath: d.contextPath, recordPath: d.path, ...record.verdict };
  }) : [];
  const latest = latestSourceTransition(sourceRun, source);
  const checkpoint = latest.transition;
  const summary = checkpoint?.summary ?? '';
  const complete = currentSourceCompletion(source, latest);
  return { authority: approval.code !== 0 ? 'integrity-blocked' : pending ? 'pending' : 'clear', approvals,
    execution: complete ? 'completed' : 'blocked', verification: complete ? 'awaiting-export' : 'incomplete',
    ...(checkpoint && !complete ? { checkpoint: { phase: checkpoint.phase, status: checkpoint.status, report: checkpoint.reportPath ?? null } } : {}),
    sourceProgress: latest,
    status: checkpoint?.status === 'not_reproduced' || (checkpoint?.phase === 'reproduce' && source.checkpoints?.reproduce?.status === 'not_reproduced') ? 'not-reproduced' : pending && complete ? 'pending-approval' : 'blocked',
    reason: stopped(checkpoint?.status) && summary ? summary : '', approvalReport: null };
}
function collect(run, state, id) {
  const job = state.jobs[id]; if (!job || job.status !== 'scheduled') throw new Error('Only a scheduled job can be collected');
  checkedManifest(job);
  const found = batchSources(run, state).filter(path => read(join(path, 'state.json')).id === id);
  if (found.length !== 1) { delete job.sourceRun; job.status = 'blocked'; job.reason = 'Expected exactly one batch-bound standalone run'; return; }
  job.sourceRun = found[0];
  try { sourceState(run, state, id); }
  catch (error) { job.status = 'blocked'; job.reason = error.message; return; }
  // An incomplete fix is isolated; changed controls/original proofs/authority
  // are not. Audit those independently before classifying export eligibility.
  requirePass(standaloneCall(state, 'verify-integrity', job.sourceRun));
  const result = standaloneCall(state, 'export-verified', job.sourceRun);
  const exportAttempt = attemptPath(join(run, 'jobs'), id + '-export-attempt');
  immutable(exportAttempt, result); job.exportAttempt = exportAttempt;
  if (result.code === 0 && result.output.trim() === 'PASS') {
    const exported = { version: 1, run: job.sourceRun, stateDigest: hash(regular(join(job.sourceRun, 'state.json'))), result };
    job.exportPath = attemptPath(join(run, 'jobs'), id + '-verified'); immutable(job.exportPath, exported);
    job.exportDigest = hash(regular(job.exportPath));
    delete job.checkpoint; delete job.reason;
    Object.assign(job, { status: 'verified', execution: 'completed', verification: 'passed', authority: 'clear', approvals: [], reason: 'Source witnesses, final gates and independent review verified.' });
    Object.assign(job, projectJobProgress(job, sourceState(run, state, id)));
    delete job.resumeRequested; return;
  }
  const approval = standaloneCall(state, 'approval-report', job.sourceRun);
  const approvalPath = attemptPath(join(run, 'jobs'), id + '-approval-report'); immutable(approvalPath, approval);
  delete job.checkpoint;
  Object.assign(job, laneState(job.sourceRun, sourceState(run, state, id), approval));
  job.approvalReport = approvalPath;
  if (!job.reason) {
    const files = readdirSync(job.sourceRun);
    const failed = files.filter(name => /^gate-\d+-.*-\d+\.json$/.test(name)).reverse().find(name => read(join(job.sourceRun, name)).code !== 0);
    const bootstrap = files.filter(name => /^bootstrap-\d+\.json$/.test(name)).sort().at(-1);
    const preparation = bootstrap && read(join(job.sourceRun, bootstrap));
    job.reason = preparation?.status === 'failed' ? 'Worktree bootstrap failed: ' + preparation.error + '; ' + join(job.sourceRun, bootstrap)
      : failed ? 'Verification failed; inspect ' + join(job.sourceRun, failed) : result.output.trim();
  }
  Object.assign(job, projectJobProgress(job, sourceState(run, state, id)));
  delete job.resumeRequested;
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
  job.integrationAttempt = (job.integrationAttempt ?? (job.integration || job.integrationHistory?.length ? 1 : 0)) + 1;
  const folder = job.integrationAttempt === 1 ? join(run, 'integrations', id) : join(run, 'integrations', id, 'attempt-' + job.integrationAttempt);
  mkdirSync(folder, { recursive: true });
  if (source.batchCommit) requirePass(standaloneCall(state, 'export-verified', job.sourceRun));
  else requirePass(standaloneCall(state, 'commit-verified', job.sourceRun));
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
  const suffix = job.integrationAttempt > 1 ? '-attempt-' + job.integrationAttempt : '';
  const root = prepareWorktreePath(state.root, basename(run) + '-integrate-' + id + suffix);
  const branch = `fix-all-bugs/integrate-${id}-${randomUUID()}`;
  git(state.root, 'worktree', 'add', '-b', branch, root, state.base);
  const ctx = { version: 1, batchRun: run, id, run: job.sourceRun, root, sourceRoot: source.root, sourceSha, sourceBranch, base: state.base, branch, commands, witnessDigest: hash(witnessBytes), verdictPath: join(folder, 'verdict.json'), reportDirectory: folder, ownerRoot: state.root, gatePath: join(folder, 'gate.json'), mergeArgv: ['git', 'merge', '--no-ff', '--no-edit', sourceSha], gateArgv: [process.execPath, fileURLToPath(import.meta.url), 'integration-gate', run, id] };
  job.integration = join(folder, 'integration.json'); immutable(job.integration, ctx); job.integrationDigest = hash(regular(job.integration));
  job.environment = prepareWorktreeEnvironment(ctx.root, folder, command).recordPath;
  return job.integration;
}
async function integrationGate(run, state, id, signal) {
  const began = performance.now();
  const ctx = integrationContext(run, state, id);
  if (existsSync(join(ctx.reportDirectory, 'active'))) throw new Error('Integration worker is still marked active; settle it before controller-owned gates');
  assertSettledSources(run, state);
  const identity = gateIdentity(ctx); const job = state.jobs[id];
  delete job.gateDigest; delete job.gateIdentity;
  // An interrupted process may have allocated an attempt without publishing its
  // old counter. Never overwrite an orphan directory, even on legacy runs.
  const folder = dirname(job.integration);
  job.gateAttempts = Math.max(job.gateAttempts ?? 0, ...readdirSync(folder).filter(n => /^gate-\d+$/.test(n)).map(n => Number(n.slice(5)))) + 1;
  const attempt = join(folder, 'gate-' + job.gateAttempts); mkdirSync(attempt);
  const operationId = randomUUID();
  for (const field of ['reviewContextPath', 'reviewContextDigest', 'reviewResultPath', 'reviewResultDigest']) delete job[field];
  if (existsSync(ctx.verdictPath)) renameSync(ctx.verdictPath, join(attempt, 'prior-verdict.json'));
  immutable(join(attempt, 'reservation.json'), { version: 1, operationId, id, contextDigest: job.integrationDigest, ...identity, totalTimeoutMs: GATE_TOTAL_TIMEOUT_MS, commandTimeoutMs: GATE_COMMAND_TIMEOUT_MS, shellTimeoutSeconds: GATE_SHELL_TIMEOUT_SECONDS, startedAt: new Date().toISOString() });
  // Reservation, invalidated prior authority and attempt number precede spawn.
  state.revision++; save(join(run, 'state.json'), state); publishReport(run, state);
  const execute = async (argv, cwd, prefix, env) => {
    const remaining = Math.floor(GATE_TOTAL_TIMEOUT_MS - (performance.now() - began));
    if (signal.aborted || remaining <= 0) throw new Error('Integration gate cancelled or aggregate deadline exhausted; evidence retained: ' + attempt);
    let result;
    try { result = await runGateCommand(argv, cwd, join(attempt, prefix), { env, signal, operationId, timeoutMs: Math.min(GATE_COMMAND_TIMEOUT_MS, remaining) }); }
    catch (error) { error.retainControllerLock = true; throw error; }
    if (!result.settled) { const error = new Error('Integration gate execution is uncertain; retain controller ownership and inspect: ' + attempt); error.retainControllerLock = true; throw error; }
    return result;
  };
  const prepared = await prepareWorktreeEnvironmentAsync(ctx.root, attempt, (argv, cwd, _timeout, env) => execute(argv, cwd, 'bootstrap-command', env));
  const results = [];
  for (let i = 0; i < ctx.commands.length; i++) {
    const argv = ctx.commands[i]; const result = await execute(argv, ctx.root, String(i), prepared.env);
    const log = join(attempt, `${i}.json`); immutable(log, { argv, ...result });
    // Bind streaming logs and lifecycle evidence as well as the bounded result.
    const evidence = [result.intentPath, result.startedPath, result.finishedPath, result.stdoutPath, result.stderrPath].filter(path => path && existsSync(path)).map(path => ({ path, digest: hash(regular(path)) }));
    results.push({ path: log, digest: hash(regular(log)), evidence });
    if (result.code !== 0) throw new Error('Integration gate failed; all logs retained: ' + attempt);
  }
  if (signal.aborted || performance.now() - began >= GATE_TOTAL_TIMEOUT_MS) throw new Error('Integration gate cancelled or aggregate deadline exhausted');
  if (JSON.stringify(gateIdentity(ctx)) !== JSON.stringify(identity)) throw new Error('Integration checkout changed during gates');
  const gate = { version: 1, operationId, contextDigest: job.integrationDigest, ...identity, commands: ctx.commands, results };
  save(ctx.gatePath, gate); job.gateDigest = hash(regular(ctx.gatePath)); job.gateIdentity = identity;
  return 'PASS';
}
function integrationReviewStart(run, state, id) {
  const ctx = integrationContext(run, state, id); const job = state.jobs[id];
  if (existsSync(join(ctx.reportDirectory, 'active'))) throw new Error('Integration worker is still marked active; cannot start another review binding');
  assertSettledSources(run, state);
  const identity = gateIdentity(ctx);
  if (!job.gateDigest || hash(regular(ctx.gatePath)) !== job.gateDigest || JSON.stringify(identity) !== JSON.stringify(job.gateIdentity)) throw new Error('Independent review requires a fresh integration gate');
  const path = attemptPath(ctx.reportDirectory, 'review-context');
  immutable(path, { version: 1, contextDigest: job.integrationDigest, gateDigest: job.gateDigest, ...identity });
  job.reviewContextPath = path; job.reviewContextDigest = hash(regular(path));
  delete job.reviewResultPath; delete job.reviewResultDigest;
  return 'PASS';
}
function integrationReviewRecord(run, state, id) {
  const ctx = integrationContext(run, state, id); const job = state.jobs[id];
  if (existsSync(join(ctx.reportDirectory, 'active'))) throw new Error('Independent reviewer has not settled');
  const identity = gateIdentity(ctx);
  if (!job.reviewContextPath || hash(regular(job.reviewContextPath)) !== job.reviewContextDigest) throw new Error('Missing independent review start binding');
  const started = read(job.reviewContextPath);
  if (started.contextDigest !== job.integrationDigest || started.gateDigest !== job.gateDigest || hash(regular(ctx.gatePath)) !== job.gateDigest || ['sha', 'tree', 'index'].some(key => started[key] !== identity[key])) throw new Error('Checkout or gate changed after independent review started');
  const verdict = read(ctx.verdictPath);
  if (typeof verdict.ok !== 'boolean' || typeof verdict.findings !== 'string' || !verdict.findings.trim()) throw new Error('Malformed independent review verdict');
  const path = attemptPath(ctx.reportDirectory, 'review-result');
  immutable(path, { ...started, reviewContextDigest: job.reviewContextDigest, verdictDigest: hash(regular(ctx.verdictPath)), verdict });
  job.reviewResultPath = path; job.reviewResultDigest = hash(regular(path));
  return 'PASS';
}
function integrateRecord(run, state, id) {
  const ctx = integrationContext(run, state, id); const job = state.jobs[id];
  const verdict = JSON.parse(regular(ctx.verdictPath));
  // Exact typed verdict. CLEAN in free text (or ok:'true') grants no authority.
  if (typeof verdict.ok !== 'boolean' || typeof verdict.findings !== 'string' || !verdict.findings.trim()) throw new Error('Malformed worker verdict: expected {ok:boolean, findings:nonempty string}; retain transaction');
  if (!verdict.ok) throw new Error('Integration declined: ' + verdict.findings);
  if (existsSync(join(dirname(job.integration), 'active'))) throw new Error('Integration worker has not settled; no shipment authority');
  const identity = gateIdentity(ctx);
  const gateBytes = existsSync(ctx.gatePath) ? regular(ctx.gatePath) : null;
  if (!job.gateDigest || !gateBytes || hash(gateBytes) !== job.gateDigest || JSON.stringify(identity) !== JSON.stringify(job.gateIdentity)) throw new Error('Missing fresh integration gate for the final committed checkout');
  const gate = JSON.parse(gateBytes);
  if (gate.contextDigest !== job.integrationDigest || gate.sha !== identity.sha) throw new Error('Gate does not bind this integration');
  for (const result of gate.results) {
    if (hash(regular(result.path)) !== result.digest || read(result.path).code !== 0) throw new Error('Integration gate log changed or failed');
    for (const proof of result.evidence ?? []) if (hash(regular(proof.path)) !== proof.digest) throw new Error('Integration gate streaming evidence changed');
  }
  if (!job.reviewResultPath || hash(regular(job.reviewResultPath)) !== job.reviewResultDigest) throw new Error('Missing fresh independent review binding');
  const reviewed = read(job.reviewResultPath);
  if (reviewed.contextDigest !== job.integrationDigest || reviewed.gateDigest !== job.gateDigest || reviewed.verdictDigest !== hash(regular(ctx.verdictPath)) || ['sha', 'tree', 'index'].some(key => reviewed[key] !== identity[key])) throw new Error('Independent review does not bind the final checkout/gate/verdict');
  const source = sourceState(run, state, id);
  if (source.root !== ctx.sourceRoot || source.branch !== ctx.sourceBranch || git(source.root, 'rev-parse', 'HEAD') !== ctx.sourceSha || hash(regular(join(job.sourceRun, 'witnesses.json'))) !== ctx.witnessDigest) throw new Error('Source identity/witnesses changed after integration setup');
  requirePass(standaloneCall(state, 'export-verified', job.sourceRun));
  assertSettledSources(run, state);
  job.verdictDigest = hash(regular(ctx.verdictPath));
  immutable(join(dirname(job.integration), 'review-binding.json'), { version: 1, verdict, verdictDigest: job.verdictDigest, gateDigest: job.gateDigest, ...identity });
  // Push exactly the gated commit before touching owner main. Never force and
  // never rebase/reset an owner checkout to recover a rejected shipment.
  const pushPath = join(dirname(job.integration), 'push-attempt.json');
  const remoteBefore = remoteMain(state);
  if (remoteBefore !== (state.remoteBase ?? state.base)) throw new Error('Remote main changed before push; reconcile shared state');
  immutable(pushPath, { sha: identity.sha, base: ctx.base, remoteBefore });
  const push = command(['git', 'push', 'origin', `${identity.sha}:refs/heads/main`], state.root);
  job.shipment = { sha: identity.sha, base: ctx.base, pushed: push.code === 0, output: push.output, cleaned: false };
  save(join(dirname(job.integration), 'shipment.json'), job.shipment);
  if (push.code !== 0) throw new Error('Integration push failed; transaction and both worktrees retained');
  assertOwner(state);
  git(state.root, 'merge', '--ff-only', '--', identity.sha); state.base = identity.sha; state.remoteBase = identity.sha;
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
  job.shipment.cleaned = true; job.status = 'integrated'; job.shipmentState = 'pushed';
  delete job.checkpoint;
  Object.assign(job, projectJobProgress(job, source));
  save(join(dirname(job.integration), 'shipment.json'), job.shipment);
  rmSync(join(run, 'integration.lock'), { recursive: true });
}
function report(run, state) {
  const inventory = state.planDigest ? checkedPlan(run, state).bugs : existsSync(join(run, 'catalog.json')) ? read(join(run, 'catalog.json')).open : reports(state.root).filter(b => b.open);
  const bugs = inventory.map(b => {
    const job = { id: b.id, status: state.planDigest ? 'pending' : 'not-assessed', reason: b.reason ?? 'Readiness not assessed; no fix attempted.', ...(state.outcomes[b.id] ?? {}), ...(state.jobs[b.id] ?? {}) };
    if (!job.sourceRun) return job;
    const source = optionalJson(join(job.sourceRun, 'state.json'));
    return source ? projectJobProgress(job, source) : { ...job, sourceProgress: { transition: null, basis: 'unavailable', limitation: 'Source state is unavailable; recorded job classification only.' }, immediateBlocker: 'Source state unavailable; do not infer completion.', nextAction: 'Inspect the retained source identity and restore readable evidence before continuing.' };
  });
  return { version: 1, run, root: state.root, base: state.base, stateRevision: state.revision, generatedAt: new Date().toISOString(), finished: state.finished ?? false, schedulingComplete: state.schedulingComplete ?? false,
    catalog: join(run, 'catalog.json'), plan: join(run, 'plan.json'), detailPath: join(run, 'report.txt'), integrationLock: existsSync(join(run, 'integration.lock')) ? join(run, 'integration.lock') : null,
    lastError: state.lastError ?? null, finishError: state.finishError ?? null, errors: state.errors ?? [],
    counts: { total: bugs.length, attempted: bugs.filter(b => b.sourceRun).length, shipped: bugs.filter(b => b.shipment?.pushed).length, ownerDecisions: bugs.reduce((n, b) => n + (b.approvals?.length ?? (b.authority === 'pending' || b.status === 'pending-approval' ? 1 : 0)), 0), authorizationItems: bugs.filter(b => ['authorization-required', 'excluded'].includes(b.status)).length }, bugs };
}
function publishReport(run, state) {
  save(join(run, 'report.json'), report(run, state));
}
function renderReport(value) {
  const short = (text, n = 180) => String(text ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, n);
  const heading = 'FIX ALL BUGS — ' + (value.schedulingComplete && value.finished ? 'COMPLETE (all work classified)' : 'STOPPED / NOT FINALIZED');
  const totals = `${value.counts.total} open; ${value.counts.attempted} attempted; ${value.counts.shipped} pushed; ${value.counts.ownerDecisions} pending owner decisions; ${value.counts.authorizationItems} authorization/prerequisite items.`;
  const details = [heading, totals, 'Main: ' + value.base, 'Reports: ' + value.run];
  for (const failure of [value.lastError, value.finishError].filter(Boolean)) details.push(failure.op + ': ' + failure.message);
  for (const bug of value.bugs) {
    details.push('', bug.id + ' — ' + bug.status + ': ' + (bug.reason ?? ''), `Source execution: ${bug.execution ?? 'not established'}; source verification: ${bug.verification ?? 'not established'}; owner authority: ${bug.authority ?? 'not established'}`,
      `Integration: ${bug.integrationState ?? 'not started'}; integration verification: ${bug.integrationVerification ?? 'not established'}; shipment: ${bug.shipmentState ?? 'not attempted'}`,
      'Immediate blocker: ' + (bug.immediateBlocker ?? 'none recorded'), 'Next supported action: ' + (bug.nextAction ?? bug.disposition ?? 'Resolve the stated prerequisite; no new work is scheduled by reporting.'));
    if (bug.sourceProgress?.transition) details.push('Latest source transition (' + bug.sourceProgress.basis + '): ' + JSON.stringify(bug.sourceProgress.transition));
    if (bug.sourceProgress?.limitation) details.push('Reporting limitation: ' + bug.sourceProgress.limitation);
    if (bug.sourceProgress?.lastDecision) details.push('Last engineering decision: ' + JSON.stringify(bug.sourceProgress.lastDecision));
    if (bug.shipment) details.push(bug.shipment.pushed ? 'PUSHED ' + bug.shipment.sha + (bug.shipment.cleaned ? '; cleanup complete.' : '; consumer update/cleanup INCOMPLETE. Do not rerun shipment blindly.') : 'Shipment attempted; no successful push recorded. Reconcile before retry.');
    if (bug.sourceRun) {
      const source = optionalJson(join(bug.sourceRun, 'state.json'));
      details.push('Source run: ' + bug.sourceRun, 'Branch: ' + (source?.branch ?? 'unavailable'), 'Worktree: ' + (source?.root ?? 'unavailable'), 'History: ' + join(bug.sourceRun, 'state.json'));
    }
    for (const decision of bug.approvals ?? []) details.push('PENDING OWNER APPROVAL — ' + decision.summary, 'Recommendation: ' + decision.recommendation, 'Rationale: ' + decision.rationale, 'Alternatives: ' + decision.alternatives.join('; '), 'Exact decision: ' + decision.recordPath);
    if (bug.approvalReport) details.push('Full approval audit: ' + bug.approvalReport);
    if (bug.integration) details.push('Integration: ' + bug.integration);
  }
  writeFileSync(value.detailPath, details.join('\n') + '\n');
  // Every bug gets a row BEFORE details. Even 1000 rows fit both the 2000-line
  // and 50 KiB Bash transport limits; long exact proposals stay on disk.
  const lines = [heading, totals, 'Main: ' + value.base, 'Full audit: ' + value.detailPath, 'Machine report: ' + join(value.run, 'report.json')];
  if (value.counts.ownerDecisions) lines.push('PENDING OWNER APPROVAL — shipment blocked for those decisions. Rationale: see the full audit and exact records.');
  for (const failure of [value.lastError, value.finishError].filter(Boolean)) lines.push(failure.op + ': ' + short(failure.message, 280));
  for (const bug of value.bugs) {
    const flags = (bug.authority === 'pending' || bug.status === 'pending-approval' ? ' [owner decision pending]' : '') + (bug.shipment?.pushed ? ' PUSHED' : '');
    lines.push(bug.id + ' ' + bug.status + (value.bugs.length > 50 ? (flags.includes('owner') ? ' A?' : '') + (bug.shipment?.pushed ? ' P+' : '') : flags + ' — ' + short(bug.reason, 180)));
  }
  if (value.bugs.length <= 8) for (const bug of value.bugs) {
    if (bug.immediateBlocker) lines.push(bug.id + ' immediate blocker: ' + short(bug.immediateBlocker, 220));
    if (bug.nextAction) lines.push(bug.id + ' next: ' + short(bug.nextAction, 280));
    if (bug.sourceProgress?.limitation) lines.push(bug.id + ' reporting limitation: ' + short(bug.sourceProgress.limitation, 240));
    if (bug.shipment?.pushed) lines.push(bug.id + ' PUSHED ' + bug.shipment.sha + (bug.shipment.cleaned ? '' : '; consumer update/cleanup INCOMPLETE. Do not rerun shipment blindly.'));
    for (const d of (bug.approvals ?? []).slice(0, 1)) lines.push(bug.id + ' decision: ' + short(d.summary, 140) + '\n  Exact scope/rationale: ' + d.recordPath);
  }
  lines.push('Retained work, exact decisions, pushed SHAs and next actions: see full audit. No pending decision is approved by silence.');
  return lines.join('\n');
}
function parkIntegration(run, state, id) {
  const job = state.jobs[id];
  if (!job || job.status !== 'integrating' || read(join(run, 'integration.lock/owner.json')).id !== id) throw new Error('No matching integration transaction to park');
  if (job.integration) integrationContext(run, state, id, true);
  sourceState(run, state, id);
  if (hash(regular(job.exportPath)) !== job.exportDigest) throw new Error('Verified export changed; integrity failures cannot be parked');
  requirePass(standaloneCall(state, 'export-verified', job.sourceRun));
  const proof = noPush(run, state, job);
  const verdictPath = job.integration && read(job.integration).verdictPath;
  const verdict = verdictPath && existsSync(verdictPath) ? read(verdictPath) : null;
  const reason = verdict?.ok === false && typeof verdict.findings === 'string' ? verdict.findings : state.lastError?.message ?? 'Integration setup did not complete; artifacts retained.';
  immutable(attemptPath(proof.folder, 'parked'), { version: 1, id, reason, remote: proof.remote, base: state.base, verdictPath, sourceRun: job.sourceRun });
  Object.assign(job, { status: 'integration-blocked', reason, execution: 'completed', verification: 'passed', integrationState: 'blocked', integrationVerification: 'failed', shipmentState: 'not-attempted' });
  rmSync(join(run, 'integration.lock'), { recursive: true });
  return 'PARKED';
}
function workflowPath(path) {
  return /^tools\/bugfix\/[a-z-]+\.mjs$/.test(path) || /^\.pi\/theta\/(?:fix-(?:all-bugs|bug)\.theta|workers\/bugfix-[a-z-]+\.theta)$/.test(path)
    || /^tests\/(?:live\/acceptance\/)?(?:bugfix-[a-z-]+|fix-all-bugs-workflow)\.test\.ts$/.test(path)
    // Adding a workflow worker necessarily advances these exact corpus pins.
    // Keep the exception named and bounded, never allow arbitrary test paths.
    || ['docs/how-to/fix-all-bugs.md', 'docs/how-to/fix-a-numbered-bug.md', 'tests/annotation-nontype-text-refusal.test.ts',
      'tests/committed-fixture-parse-gate.test.ts', 'tests/interpolation-parse-diagnostics.test.ts',
      'tests/for-empty-array-iterand-adjudication.test.ts', 'tests/match-fn-return-lub-dominating-discipline.test.ts'].includes(path);
}
function resumeBatch(run, state) {
  clean(state.root);
  if (git(state.root, 'branch', '--show-current') !== 'main') throw new Error('Resume requires clean main');
  assertSettledSources(run, state);
  for (const job of Object.values(state.jobs)) if (job.integration && existsSync(join(dirname(job.integration), 'active'))) throw new Error('Integration worker is still marked active; do not resume until explicitly reconciled');
  const current = git(state.root, 'rev-parse', 'HEAD');
  const remote = remoteMain(state);
  if (current !== state.base) {
    ancestry(state.root, state.base, current);
    const paths = git(state.root, 'diff', '--name-only', '--no-renames', '-z', state.base, current).split('\0').filter(Boolean);
    if (!paths.length || paths.some(path => !workflowPath(path))) throw new Error('Main changed outside the bounded workflow repair scope; manual reconciliation required');
    ancestry(state.root, state.base, remote); ancestry(state.root, remote, current);
    const remotePaths = git(state.root, 'diff', '--name-only', '--no-renames', '-z', state.base, remote).split('\0').filter(Boolean);
    if (remotePaths.some(path => !workflowPath(path))) throw new Error('Remote main contains unrelated changes; do not adopt it as a workflow upgrade');
    const controls = new Set(executionControlPaths(state.root));
    for (const path of batchSources(run, state)) for (const control of read(join(path, 'state.json')).controlPaths ?? []) controls.add(control);
    const ownerControls = [...controls].sort().map(path => ({ path, digest: hash(regular(safeLocal(state.root, path))) }));
    const upgrade = { version: 1, base: state.base, sha: current, paths, ownerControls };
    const path = attemptPath(run, 'workflow-upgrade'); immutable(path, { ...upgrade, priorState: read(join(run, 'state.json')) });
    state.workflowUpgrades = [...(state.workflowUpgrades ?? []), { ...upgrade, path, digest: hash(regular(path)) }];
    state.initialBase ??= state.base; state.base = current;
  } else if (remote !== (state.remoteBase ?? state.base)) throw new Error('Remote main changed since this batch; reconcile before resuming');
  state.remoteBase = remote;
  // Hooks authenticate current main/controls through the parent on disk. This
  // audited upgrade is durable even if a later source-integrity check refuses.
  state.revision++; save(join(run, 'state.json'), state);
  // Recover the transaction only after proving no push intent and quiescence.
  // Retain even conflict/index contents: a parked worktree is never reset.
  const integrating = Object.entries(state.jobs).filter(([, job]) => job.status === 'integrating');
  if (integrating.length > 1) throw new Error('Ambiguous integrations; manual reconciliation required');
  for (const [id] of integrating) parkIntegration(run, state, id);
  if (existsSync(join(run, 'integration.lock'))) throw new Error('Unmatched integration lock; preserve it for reconciliation');
  const plan = state.planDigest ? checkedPlan(run, state) : null;
  // Standalone validation reads the authenticated parent from disk. Publish the
  // audited upgrade before asking it to check owner advancement/control bytes.
  state.revision++; save(join(run, 'state.json'), state);
  for (const [id, job] of Object.entries(state.jobs)) {
    if (job.status === 'integrated') continue;
    checkedManifest(job);
    const found = batchSources(run, state).filter(path => read(join(path, 'state.json')).id === id);
    if (!found.length && job.status === 'scheduled') {
      const manifest = checkedManifest(job);
      if (manifest.base !== state.base) {
        const upgrade = (state.workflowUpgrades ?? []).find(u => u.base === manifest.base);
        if (!upgrade) throw new Error('No authenticated advancement for an unlaunched manifest');
        job.launchUpgrade = { base: manifest.base, sha: upgrade.sha };
      }
      job.redispatch = true; continue; // launch the original base once; never rewrite its manifest
    }
    if (found.length !== 1) throw new Error('Resume requires exactly one original source run for ' + id);
    job.sourceRun = found[0]; const source = sourceState(run, state, id);
    const priorStatus = job.status;
    // Reassess durable evidence and pending approvals; no success summaries are
    // trusted and no existing original capture is overwritten by collection.
    job.status = 'scheduled'; collect(run, state, id);
    if (job.status === 'verified') {
      if (job.integration) {
        job.integrationHistory = [...(job.integrationHistory ?? []), { path: job.integration, digest: job.integrationDigest }];
        delete job.integration; delete job.integrationDigest; delete job.gateDigest; delete job.gateIdentity;
      }
      continue;
    }
    if (source.batchCommit || job.status === 'not-reproduced' || (source.stages?.includes('gate-final') && source.finalReviewDigest)) continue;
    job.resumeHistory = [...(job.resumeHistory ?? []), { status: priorStatus, reason: job.reason }];
    job.status = 'queued'; job.resumeRequested = true;
  }
  if (plan) for (const bug of plan.bugs) {
    if (!bug.ready && state.outcomes[bug.id]?.status === 'excluded') state.outcomes[bug.id] = { ...state.outcomes[bug.id], status: 'authorization-required', attempted: false, authority: 'required' };
    if (bug.ready && bug.dependencies.length && state.outcomes[bug.id]?.status === 'blocked' && !state.jobs[bug.id]) delete state.outcomes[bug.id];
  }
  state.finished = false; state.schedulingComplete = false;
  state.resumeCount = (state.resumeCount ?? 0) + 1;
  delete state.lastError; delete state.finishError;
}
function validateRecovery(run, state, id) {
  assertLease(run, state); clean(state.root); assertSettledSources(run, state);
  if (git(state.root, 'branch', '--show-current') !== 'main') throw new Error('Recovery requires owner main');
  const head = git(state.root, 'rev-parse', 'HEAD'); const remote = remoteMain(state);
  // A tested workflow-only repair can be committed before reconciliation. Do
  // not adopt it here: ordinary resume will write the authenticated upgrade.
  if (head !== state.base) {
    ancestry(state.root, state.base, head);
    const paths = git(state.root, 'diff', '--name-only', '-z', state.base, head).split('\0').filter(Boolean);
    if (!paths.length || paths.some(path => !workflowPath(path))) throw new Error('Owner main changed outside the bounded workflow repair scope');
  }
  if (remote !== (state.remoteBase ?? state.base)) throw new Error('Remote main changed; shipment state requires separate reconciliation');
  const job = state.jobs[id];
  if (!job || job.status !== 'integrating') throw new Error('Recovery requires an existing integrating job');
  const transaction = read(join(run, 'integration.lock/owner.json'));
  if (transaction.id !== id) throw new Error('Integration transaction identity changed');
  const contextBytes = regular(job.integration);
  if (hash(contextBytes) !== job.integrationDigest) throw new Error('Integration context changed');
  const ctx = JSON.parse(contextBytes);
  const suffix = (job.integrationAttempt ?? 1) > 1 ? '-attempt-' + job.integrationAttempt : '';
  if (ctx.batchRun !== run || ctx.id !== id || ctx.ownerRoot !== state.root || ctx.base !== state.base || ctx.root !== worktreePath(state.root, basename(run) + '-integrate-' + id + suffix) || ctx.reportDirectory !== dirname(job.integration) || ctx.verdictPath !== join(ctx.reportDirectory, 'verdict.json')) throw new Error('Recovery context is not bound to this transaction');
  if (job.shipment || ['push-attempt.json', 'shipment.json'].some(name => existsSync(join(ctx.reportDirectory, name)))) throw new Error('Shipment was attempted or may have succeeded; recovery cannot replay it');
  const source = sourceState(run, state, id);
  if (hash(regular(job.exportPath)) !== job.exportDigest || source.root !== ctx.sourceRoot || source.branch !== ctx.sourceBranch || git(source.root, 'rev-parse', 'HEAD') !== ctx.sourceSha || hash(regular(join(job.sourceRun, 'witnesses.json'))) !== ctx.witnessDigest) throw new Error('Source identity or frozen evidence changed');
  clean(source.root);
  if (git(ctx.root, 'branch', '--show-current') !== ctx.branch) throw new Error('Integration branch changed');
  const merge = gateIdentity(ctx);
  const activity = join(ctx.reportDirectory, 'active/owner.json');
  if (existsSync(activity) && read(activity).contextDigest !== job.integrationDigest) throw new Error('Integration activity identity changed');
  const sourceProof = verifiedSourceEvidence(job.sourceRun, source);
  return { ctx, head, remote, merge, sourceProof, sourceStateDigest: hash(regular(join(job.sourceRun, 'state.json'))), exportDigest: job.exportDigest };
}
export async function main(args, cwd = process.cwd()) {
  const [op, arg, id] = args;
  if (op === 'lane-arguments') {
    const manifest = read(arg); const parent = read(join(manifest.batchRun, 'state.json')); const job = parent.jobs?.[manifest.id];
    if (parent.root !== realpathSync(git(cwd, 'rev-parse', '--show-toplevel')) || job?.manifest !== arg || job.status !== 'scheduled') throw new Error('Lane is not scheduled in this checkout');
    assertLease(manifest.batchRun, parent); checkedManifest(job); assertOwner(parent);
    console.log((job.resumeRequested ? 'batch-resume ' : 'batch ') + arg); return;
  }
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
      save(join(root, '.pi/tmp/fix-all-bugs-last.json'), { version: 1, run });
    } catch (error) { rmSync(lock, { recursive: true }); throw error; }
    console.log(run); return;
  }
  const ownerRoot = realpathSync(git(cwd, 'rev-parse', '--show-toplevel'));
  const lease = join(ownerRoot, '.pi/tmp/fix-bug.lock');
  let selected = arg;
  if (op === 'resume' && !selected) {
    const pointer = existsSync(join(lease, 'owner.json')) ? read(join(lease, 'owner.json')) : read(join(ownerRoot, '.pi/tmp/fix-all-bugs-last.json'));
    if (pointer.kind && pointer.kind !== 'batch') throw new Error('A standalone bugfix owns the lease; do not resume it as a batch');
    selected = pointer.run;
  }
  const run = realpathSync(resolve(cwd, selected ?? '')); const statePath = join(run, 'state.json');
  const load = () => {
    const state = read(statePath);
    if (state.version !== 1 || state.root !== realpathSync(git(cwd, 'rev-parse', '--show-toplevel')) || !run.startsWith(join(state.root, '.pi/tmp/fix-all-bugs-'))) throw new Error('Batch belongs to another owner checkout');
    return state;
  };
  // Inspect and preflight do not acquire locks, mutate reports or reconcile state.
  if (op === 'inspect') {
    const state = load(); const value = report(run, state);
    console.log(encode({ ...value, controllerLock: controllerObservation(run), recoveryLock: existsSync(join(run, 'recovery.lock')), observation: 'Recorded batch state only; not a claim that children settled or verification passed.' }).trimEnd()); return;
  }
  const recoveryDeps = { validate: validateRecovery, saveState: state => save(statePath, state), publishReport: state => publishReport(run, state) };
  if (op === 'recovery-plan') { console.log(encode(recoveryPlan(run, load(), id, recoveryDeps)).trimEnd()); return; }
  if (op === 'recover') { console.log(recoverController(run, load(), resolve(cwd, id ?? ''), recoveryDeps)); return; }
  const owner = acquireController(run, op, id);
  let retainControllerLock = false;
  const cancellation = new AbortController();
  const cancel = () => cancellation.abort();
  if (op === 'integration-gate') { process.on('SIGINT', cancel); process.on('SIGTERM', cancel); }
  try {
    const state = load();
    if (op === 'report' || op === 'render-report') {
      const value = report(run, state); save(join(run, 'report.json'), value);
      console.log(op === 'report' ? encode(value).trimEnd() : renderReport(value)); return;
    }
    if (state.finished && op !== 'resume') throw new Error('Batch already finished; use resume to continue retained work');
    let acquired = false;
    if (op === 'resume' && !existsSync(lease)) {
      mkdirSync(lease); immutable(join(lease, 'owner.json'), { run, kind: 'batch' }); acquired = true;
    }
    try { assertLease(run, state); } catch (error) { if (acquired) rmSync(lease, { recursive: true }); throw error; }
    if (['collect', 'integration-start', 'integration-gate', 'integration-review-start', 'integration-review-record', 'integrate-record', 'integration-park', 'integration-verdict-path', 'integration-enter', 'integration-settled'].includes(op) && !/^\d{4}$/.test(id ?? '')) throw new Error('Expected four-digit job id');
    let output = 'PASS';
    try {
      if (op === 'resume') { resumeBatch(run, state); output = run; }
      else if (op === 'catalog') {
        const path = runCatalog(run, state); output = read(path).open.length ? path : 'EMPTY';
        if (output === 'EMPTY') state.schedulingComplete = true;
      }
      else if (op === 'plan-status') { assertOwner(state); if (state.planDigest) checkedPlan(run, state); output = state.planDigest ? 'ACCEPTED' : 'NEEDS_PLAN'; }
      else if (op === 'ready') { assertOwner(state); assertSettledSources(run, state); output = Object.entries(state.jobs).filter(([, job]) => job.status === 'verified').map(([id]) => id).join('\n') || 'NONE'; }
      else if (op === 'plan') acceptPlan(run, state);
      else if (op === 'next') output = schedule(run, state);
      else if (op === 'collect') {
        collect(run, state, id);
        output = state.jobs[id].status === 'verified' ? 'VERIFIED' : state.jobs[id].status === 'pending-approval' ? 'PENDING' : 'BLOCKED';
      }
      else if (op === 'integration-start') output = integrationStart(run, state, id);
      else if (op === 'integration-gate') output = await integrationGate(run, state, id, cancellation.signal);
      else if (op === 'integration-review-start') output = integrationReviewStart(run, state, id);
      else if (op === 'integration-review-record') output = integrationReviewRecord(run, state, id);
      else if (op === 'integrate-record') integrateRecord(run, state, id);
      else if (op === 'integration-park') output = parkIntegration(run, state, id);
      else if (op === 'integration-verdict-path') output = integrationContext(run, state, id).verdictPath;
      else if (op === 'integration-enter') {
        const ctx = integrationContext(run, state, id); noPush(run, state, state.jobs[id]);
        const marker = join(ctx.reportDirectory, 'active'); mkdirSync(marker);
        immutable(join(marker, 'owner.json'), { contextDigest: state.jobs[id].integrationDigest, pid: process.ppid });
      }
      else if (op === 'integration-settled') {
        const ctx = integrationContext(run, state, id); const marker = join(ctx.reportDirectory, 'active');
        if (read(join(marker, 'owner.json')).contextDigest !== state.jobs[id].integrationDigest) throw new Error('Integration activity marker identity changed');
        rmSync(marker, { recursive: true });
      }
      else if (op === 'finish') {
        // No lease release can certify an externally changed owner checkout.
        assertOwner(state);
        if (Object.values(state.jobs).some(active) || existsSync(join(run, 'integration.lock'))) throw new Error('Cannot finish while jobs or an integration transaction are active');
        assertSettledSources(run, state);
        if (state.planDigest) {
          const plan = checkedPlan(run, state);
          if (plan.bugs.some(b => !state.jobs[b.id] && !state.outcomes[b.id])) throw new Error('Unclassified pending bugs remain; call next to propagate prerequisite failures');
        }
        state.finished = true; rmSync(join(state.root, '.pi/tmp/fix-bug.lock'), { recursive: true });
      } else throw new Error('Unknown operation: ' + op);
      if (op === 'finish') delete state.finishError;
      else delete state.lastError;
    } catch (error) {
      retainControllerLock = error.retainControllerLock === true || error.cause?.retainControllerLock === true;
      const failure = { op, id, message: error.message };
      state.errors = [...(state.errors ?? []), failure];
      if (op === 'finish') state.finishError = failure;
      else state.lastError = failure;
      throw error;
    } finally { state.revision++; save(statePath, state); publishReport(run, state); }
    console.log(output);
  } finally {
    if (op === 'integration-gate') { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
    if (!retainControllerLock) releaseController(run, owner);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error('BLOCKED: ' + error.message); process.exitCode = 1; });
}
