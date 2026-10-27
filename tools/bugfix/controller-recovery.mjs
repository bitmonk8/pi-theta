// Explicit interrupted-operation reconciliation. Inspection is read-only; no
// timestamp/PID-only automatic takeover. Legacy ownership requires attestation.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { atomicImmutableJson as immutable } from './atomic-record.mjs';
import { processIdentity, processState, ownedExecutionState } from './gate-runner.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
function evidence(path) {
  if (!existsSync(path)) return null;
  const result = {};
  function walk(file) {
    const stat = lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error('Recovery evidence must not contain symlinks: ' + file);
    if (stat.isDirectory()) {
      result[relative(path, file) || '.'] = 'directory';
      for (const name of readdirSync(file).sort()) walk(join(file, name));
    } else if (stat.isFile()) result[relative(path, file) || '.'] = hash(readFileSync(file));
    else throw new Error('Unsupported recovery evidence: ' + file);
  }
  walk(path); return result;
}
export function controllerObservation(run) {
  const path = join(run, 'controller.lock');
  if (!existsSync(path)) return null;
  const files = evidence(path);
  const owner = existsSync(join(path, 'owner.json')) ? read(join(path, 'owner.json')) : null;
  return { legacy: owner === null, owner, files, process: owner?.process ? processState(owner.process) : 'unknown' };
}
export function acquireController(run, op, id) {
  if (existsSync(join(run, 'recovery.lock'))) throw new Error('Explicit batch recovery is in progress; do not start another operation');
  const guard = join(run, 'controller.lock');
  try { mkdirSync(guard); } catch { throw new Error('Another batch controller operation is in progress; inspect ownership before explicit recovery; do not remove lock while commands are active'); }
  const owner = { version: 1, token: randomUUID(), op, id, startedAt: new Date().toISOString(), process: processIdentity(process.pid) };
  // Publishing ownership can itself be interrupted. An incomplete owner remains
  // unknown and is never silently removed by a different process.
  immutable(join(guard, 'owner.json'), owner);
  if (existsSync(join(run, 'recovery.lock'))) { releaseController(run, owner); throw new Error('Explicit batch recovery claimed admission'); }
  return owner;
}
export function releaseController(run, owner) {
  const path = join(run, 'controller.lock');
  if (!existsSync(join(path, 'owner.json')) || read(join(path, 'owner.json')).token !== owner.token) throw new Error('Controller ownership changed; refusing to remove another operation lock');
  rmSync(path, { recursive: true });
}
function ancestors() {
  const ids = new Set([process.pid]); let pid = process.pid;
  while (pid > 1) {
    try { const stat = readFileSync(`/proc/${pid}/stat`, 'utf8'); pid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]); if (!pid || ids.has(pid)) break; ids.add(pid); }
    catch { break; }
  }
  return ids;
}
function assertNoRelatedProcesses(paths) {
  if (process.platform !== 'linux') throw new Error('Recovery process census is unsupported on this host; explicit platform reconciliation is required');
  const exclude = ancestors(); const unavailable = [];
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name) || exclude.has(Number(name))) continue;
    let cmd, cwd;
    try {
      // Workflow children retain this uid. Kernel/other-user processes are not
      // our execution ownership; their cwd can legitimately be inaccessible.
      if (lstatSync(`/proc/${name}`).uid !== process.getuid()) continue;
      cmd = readFileSync(`/proc/${name}/cmdline`, 'utf8').replaceAll('\0', ' ');
      if (!cmd.trim()) continue;
      try { cwd = readlinkSync(`/proc/${name}/cwd`); }
      catch (error) {
        if (!['EACCES', 'EPERM'].includes(error.code)) throw error;
        // User daemons such as systemd can be non-dumpable. Their inaccessible
        // cwd is not evidence of owned work. Surface the census limitation;
        // exact controller/gate identities are checked separately and an
        // operator quiescence attestation is ALWAYS required for recovery.
        unavailable.push(Number(name)); cwd = '';
      }
    } catch (error) { if (['ENOENT', 'ESRCH'].includes(error.code)) continue; throw new Error('Cannot establish process census: ' + name); }
    if (paths.some(path => cwd === path || cwd.startsWith(path + '/') || cmd.includes(path))) throw new Error('Related execution is still alive: pid ' + name);
  }
  return { scope: 'same-user command/cwd snapshot; not a universal proof of process absence', unreadableCwds: unavailable };
}
function assertGateProcessesStopped(folder) {
  const fail = () => { throw new Error('Malformed or mismatched gate lifecycle evidence; manual reconciliation required'); };
  const identityValid = identity => identity?.platform === 'linux' && Number.isSafeInteger(identity.pid) && identity.pid > 0
    && /^\d+$/.test(identity.start ?? '') && typeof identity.bootId === 'string' && /^[0-9a-f-]{36}$/.test(identity.bootId);
  for (const attempt of readdirSync(folder).filter(n => /^gate-\d+$/.test(n))) {
    const dir = join(folder, attempt);
    const prefixes = new Set(readdirSync(dir).filter(n => /\.(intent|started|finished)\.json$/.test(n)).map(n => n.replace(/\.(intent|started|finished)\.json$/, '')));
    for (const stem of prefixes) {
      const prefix = join(dir, stem);
      if (!existsSync(prefix + '.intent.json')) fail();
      const hasStart = existsSync(prefix + '.started.json'); const hasFinish = existsSync(prefix + '.finished.json');
      if (!hasStart && !hasFinish) throw new Error('Gate launch intent has no observed process identity or completion');
      const intent = read(prefix + '.intent.json');
      const common = record => record?.schemaVersion === 1 && typeof record.operationId === 'string' && record.operationId.length > 0
        && record.operationId === intent.operationId && record.cwd === intent.cwd && record.logPrefix === prefix
        && typeof record.executionToken === 'string' && /^[0-9a-f-]{36}$/.test(record.executionToken)
        && record.executionToken === intent.executionToken && Number.isSafeInteger(record.executionUid) && record.executionUid === intent.executionUid
        && /^\d+$/.test(record.executionStartFloor ?? '') && record.executionStartFloor === intent.executionStartFloor
        && record.strategy === 'linux-inherited-execution-token' && record.strategy === intent.strategy
        && record.launcherIdentity?.platform === 'linux' && Number.isSafeInteger(record.launcherIdentity.pid)
        && /^\d+$/.test(record.launcherIdentity.start ?? '') && typeof record.launcherIdentity.bootId === 'string'
        && JSON.stringify(record.launcherIdentity) === JSON.stringify(intent.launcherIdentity)
        && Array.isArray(record.argv) && record.argv.length > 0 && record.argv.every(v => typeof v === 'string')
        && JSON.stringify(record.argv) === JSON.stringify(intent.argv)
        && record.intentPath === prefix + '.intent.json' && record.startedPath === prefix + '.started.json'
        && record.finishedPath === prefix + '.finished.json' && record.stdoutPath === prefix + '.stdout.log' && record.stderrPath === prefix + '.stderr.log';
      if (!common(intent) || intent.kind !== 'gate-command-intent' || intent.phase !== 'launch-intent' || intent.pid !== null) fail();
      const reservation = join(dir, 'reservation.json');
      if (existsSync(reservation) && read(reservation).operationId !== intent.operationId) fail();
      const started = hasStart ? read(prefix + '.started.json') : null;
      const finished = hasFinish ? read(prefix + '.finished.json') : null;
      if (finished && (!common(finished) || finished.kind !== 'gate-command-finished' || finished.phase !== 'finished'
        || typeof finished.settled !== 'boolean' || !Number.isInteger(finished.code))) fail();
      if (!started) {
        // A complete failed spawn/pre-aborted command legitimately has no PID.
        // File existence or an arbitrary {settled:true} is never such evidence.
        if (!finished || finished.settled !== true || finished.code === 0 || finished.pid !== null || finished.childIdentity !== null
          || finished.processGroupId !== null || !(finished.cancelled === true || typeof finished.error === 'string' && finished.error.length > 0)) fail();
        continue;
      }
      if (!common(started) || started.kind !== 'gate-command-started' || started.phase !== 'spawned'
        || !Number.isSafeInteger(started.pid) || started.pid <= 0 || started.childIdentity?.pid !== started.pid
        || started.processGroupId !== started.pid || JSON.stringify(started.process) !== JSON.stringify(started.childIdentity)) fail();
      if (!identityValid(started.childIdentity) || started.childIdentity.bootId !== intent.launcherIdentity.bootId) fail();
      if (finished && (finished.pid !== started.pid || finished.processGroupId !== started.pid
        || JSON.stringify(finished.childIdentity) !== JSON.stringify(started.childIdentity)
        || typeof finished.cancelled !== 'boolean' || typeof finished.timedOut !== 'boolean'
        || finished.settlementScope !== 'linux-inherited-execution-token'
        || !Array.isArray(finished.ownedProcesses) || finished.ownedProcesses.some(identity => !identityValid(identity)))) fail();
      if (finished?.settled === true) {
        if (finished.recoveryIdentitySupported !== true) fail();
        continue;
      }
      const status = processState(started.childIdentity);
      if (status !== 'dead') throw new Error('Gate process identity is ' + status + '; cannot reconcile');
      // /proc is a snapshot, not a global process-table lock. Retry only an
      // indeterminate census briefly; live/reused ownership is never retried
      // into presumed settlement, and exhausting the bound still refuses.
      let ownership = 'unknown';
      for (let tries = 0; tries < 50 && ownership === 'unknown'; tries++) {
        ownership = ownedExecutionState(finished ?? started);
        if (ownership === 'unknown') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
      }
      if (ownership !== 'dead') throw new Error('Gate execution still has live or uncertain descendants: ' + ownership);
    }
  }
}
/** deps.validate establishes lease, allowed owner upgrade, immutable source,
 * context, clean committed merge, no shipment intent, and settled source hosts. */
export function recoveryPlan(run, state, id, deps) {
  const validated = deps.validate(run, state, id);
  const { ctx } = validated;
  const controller = controllerObservation(run);
  if (!controller) throw new Error('No interrupted controller lock to reconcile');
  if (!controller.legacy && controller.process !== 'dead') throw new Error('Controller process identity is ' + controller.process + '; recovery refused');
  const census = assertNoRelatedProcesses([run, ctx.root, ctx.sourceRoot]);
  assertGateProcessesStopped(ctx.reportDirectory);
  const material = {
    run, id, state: hash(readFileSync(join(run, 'state.json'))), validated,
    controller: controller.files, activity: evidence(join(ctx.reportDirectory, 'active')),
    lease: evidence(join(state.root, '.pi/tmp/fix-bug.lock')),
    integrationLock: evidence(join(run, 'integration.lock')),
    artifacts: evidence(ctx.reportDirectory),
  };
  return { version: 1, kind: 'batch-integration-recovery', run, id, legacy: controller.legacy,
    fingerprint: hash(JSON.stringify(material)), stateRevision: state.revision,
    observedAt: new Date().toISOString(), preservedMerge: validated.merge, census, requiresOperatorQuiescence: true,
    action: 'Archive interrupted ownership; retain integration and evidence; never ship or grant verification.' };
}
export function recoverController(run, state, requestPath, deps) {
  const request = read(requestPath);
  if (request.version !== 1 || request.kind !== 'batch-integration-recovery' || request.run !== run || !/^\d{4}$/.test(request.id ?? '')) throw new Error('Invalid recovery request');
  const c = request.confirmation;
  if (c?.allExecutionStopped !== true || typeof c.reason !== 'string' || !c.reason.trim()) throw new Error('Explicit operator quiescence confirmation and reason are required');
  if (request.legacy && c.legacy !== true) throw new Error('Legacy empty lock requires explicit legacy confirmation');
  const before = recoveryPlan(run, state, request.id, deps);
  if (before.fingerprint !== request.fingerprint || before.legacy !== request.legacy) throw new Error('Stale recovery preflight; inspect again');
  const guard = join(run, 'recovery.lock');
  try { mkdirSync(guard); } catch { throw new Error('Recovery already claimed; do not remove an uncertain recovery lock'); }
  const token = randomUUID(); immutable(join(guard, 'owner.json'), { token, process: processIdentity(process.pid), fingerprint: request.fingerprint });
  let changed = false;
  try {
    const current = read(join(run, 'state.json'));
    if (recoveryPlan(run, current, request.id, deps).fingerprint !== request.fingerprint) throw new Error('Recovery identity changed after admission');
    const { ctx } = deps.validate(run, current, request.id);
    const verdict = request.verdict;
    if (verdict !== undefined && (verdict.ok !== false || typeof verdict.findings !== 'string' || !verdict.findings.trim())) throw new Error('Recovery can preserve only a typed negative worker verdict, never approval');
    if (verdict && existsSync(ctx.verdictPath) && JSON.stringify(read(ctx.verdictPath)) !== JSON.stringify(verdict)) throw new Error('Existing verdict differs; preserve both and reconcile manually');
    const audit = join(run, 'recoveries', token); mkdirSync(audit, { recursive: true });
    immutable(join(audit, 'request.json'), request); immutable(join(audit, 'state-before.json'), current);
    immutable(join(audit, 'intent.json'), { fingerprint: request.fingerprint, action: before.action });
    // All ordinary controller admission observes recovery.lock. Preserve the
    // original lock/marker rather than deleting evidence to make a run start.
    changed = true; renameSync(join(run, 'controller.lock'), join(audit, 'controller.lock'));
    if (existsSync(join(ctx.reportDirectory, 'active'))) renameSync(join(ctx.reportDirectory, 'active'), join(audit, 'integration-active'));
    if (verdict && !existsSync(ctx.verdictPath)) immutable(ctx.verdictPath, verdict);
    const job = current.jobs[request.id];
    job.gateAttempts = Math.max(job.gateAttempts ?? 0, ...readdirSync(ctx.reportDirectory).filter(n => /^gate-\d+$/.test(n)).map(n => Number(n.slice(5))));
    delete job.gateDigest; delete job.gateIdentity;
    current.lastError = { op: 'integration-gate', id: request.id, message: 'Interrupted gate reconciled explicitly; incomplete evidence is not a PASS.' };
    current.recoveries = [...(current.recoveries ?? []), { path: audit, fingerprint: request.fingerprint, id: request.id }];
    current.revision++; deps.saveState(current); deps.publishReport(current);
    immutable(join(audit, 'completed.json'), { revision: current.revision, at: new Date().toISOString() });
    rmSync(guard, { recursive: true }); return 'RECOVERED';
  } catch (error) {
    // Once evidence was moved, a partial recovery is itself uncertain: retain
    // recovery.lock and its audit rather than allowing uncontrolled admission.
    if (!changed) rmSync(guard, { recursive: true });
    throw error;
  }
}
