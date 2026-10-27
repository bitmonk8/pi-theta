/**
 * Controller-independent gate execution. No batch state, attempt reservation or
 * controller lock is read or changed here. A prefix is single-use evidence.
 *
 * All JSON records are fully written/fsynced before no-clobber publication,
 * followed by directory fsync, and never rewritten:
 *   .intent.json   launch INTENT, committed BEFORE spawn (not proof of launch)
 *   .started.json  actual child PID/start/session ownership, if spawn succeeded
 *   .finished.json outcome, including whether owned execution really settled
 * Missing/malformed identity or completion is UNCERTAIN, not proof of death.
 * In particular, recovery must never infer group death from launcher/leader death.
 * stdout/stderr are inherited file descriptors, not parent-buffered pipes: partial
 * logs survive killing this helper, and late descendant writes are retained.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync, fstatSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { atomicImmutableJson as immutableRecord } from './atomic-record.mjs';

export const GATE_TOTAL_TIMEOUT_MS = 3_600_000;
export const GATE_COMMAND_TIMEOUT_MS = 1_800_000;
export const GATE_SHELL_TIMEOUT_SECONDS = 3660;
export const GATE_CLEANUP_TIMEOUT_MS = 5000;
export const GATE_OUTPUT_LIMIT_BYTES = 1024 * 1024;
const TERM_GRACE_MS = 500;
const POLL_MS = 20;
const POSIX = process.platform !== 'win32';
// Maintenance-workflow ownership, not authenticated theta invocation state.
export const EXECUTION_TOKEN_ENV = 'PI_BUGFIX_GATE_EXECUTION_TOKEN';
export const EXECUTION_ANCESTORS_ENV = 'PI_BUGFIX_GATE_EXECUTION_ANCESTORS';
const TOKEN_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const TOKEN_STRATEGY = 'linux-inherited-execution-token';

function validPid(pid) { return Number.isSafeInteger(pid) && pid > 0; }
function bootId() { return readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(); }
function procStat(pid) {
  const text = readFileSync(`/proc/${pid}/stat`, 'utf8');
  // comm is parenthesized and may itself contain spaces and closing parens.
  const fields = text.slice(text.lastIndexOf(')') + 2).trim().split(/\s+/);
  if (!/^\d+$/.test(fields[19] ?? '') || !/^\d+$/.test(fields[2] ?? '') || !/^\d+$/.test(fields[3] ?? '')) throw new Error('Malformed /proc stat');
  return { state: fields[0], group: Number(fields[2]), session: Number(fields[3]), start: fields[19] };
}
const stopped = state => state === 'Z' || state === 'X' || state === 'x';
const missing = error => error?.code === 'ENOENT' || error?.code === 'ESRCH';

/** Linux start is /proc field 22 (clock ticks, a STRING), scoped by bootId.
 * Unsupported/unreadable identity is explicitly null, never a PID-only identity.
 */
export function processIdentity(pid) {
  if (!validPid(pid)) throw new TypeError('processIdentity requires a positive integer PID');
  const identity = { pid, start: null, bootId: null, platform: process.platform };
  if (process.platform === 'linux') {
    try { identity.bootId = bootId(); identity.start = procStat(pid).start; } catch { /* fail closed for recovery */ }
  }
  return identity;
}
function provenLinuxIdentity(identity) {
  return identity?.platform === 'linux' && validPid(identity.pid) && /^\d+$/.test(identity.start ?? '') && typeof identity.bootId === 'string' && identity.bootId.length > 0;
}

/** Read-only recovery observation: dead | alive | reused | unknown.
 * Zombies are dead execution (cannot run/write), even if not yet reaped by init.
 * A dead leader is NOT proof that its detached process group is dead.
 */
export function processState(identity) {
  if (process.platform !== 'linux' || !provenLinuxIdentity(identity)) return 'unknown';
  let currentBoot;
  try { currentBoot = bootId(); } catch { return 'unknown'; }
  if (currentBoot !== identity.bootId) return 'reused';
  try {
    const current = procStat(identity.pid);
    if (current.start !== identity.start) return 'reused';
    return stopped(current.state) ? 'dead' : 'alive';
  } catch (error) { return missing(error) ? 'dead' : 'unknown'; }
}

/** Read-only GROUP recovery observation for a detached child (pgid == pid).
 * Checks every visible /proc member, including after the leader was reaped.
 * Recovery on platforms without stable start/session identity remains unknown.
 * Callers must also honor incomplete launch/completion records; this function
 * cannot turn a pre-spawn launch-intent crash window into proven quiescence.
 */
export function processGroupState(identity) {
  if (process.platform !== 'linux' || !provenLinuxIdentity(identity)) return 'unknown';
  const leader = processState(identity);
  if (leader !== 'dead') return leader;
  try {
    // Kernel absence is definitive and avoids a census for the ordinary case.
    try { process.kill(-identity.pid, 0); }
    catch (error) { return error?.code === 'ESRCH' ? 'dead' : 'unknown'; }
    let alive = false;
    let zombies = 0;
    const names = new Set(readdirSync('/proc'));
    for (const name of names) {
      if (!/^\d+$/.test(name)) continue;
      let member;
      try { member = procStat(Number(name)); }
      catch (error) { if (missing(error)) continue; return 'unknown'; }
      if (member.group !== identity.pid) continue;
      // A new/reused session or older member is not our owned detached group.
      if (member.session !== identity.pid || BigInt(member.start) < BigInt(identity.start)) return 'reused';
      if (!stopped(member.state)) alive = true;
      else zombies++;
    }
    if (alive) return 'alive';
    // A forking parent can exit during a /proc census. Never accept an empty
    // snapshot while the kernel still sees a group, or a zombie-only snapshot
    // across new process creation (a just-created descendant may be missing).
    try { process.kill(-identity.pid, 0); }
    catch (error) { return error?.code === 'ESRCH' ? 'dead' : 'unknown'; }
    if (!zombies || readdirSync('/proc').some(name => /^\d+$/.test(name) && !names.has(name))) return 'alive';
    return 'dead';
  } catch { return 'unknown'; }
}

// A conservative boot-tick lower bound, sampled BEFORE intent/spawn. Existing
// older processes cannot be future descendants. This lets the census exclude
// unrelated same-uid protected daemons/ancestors without reading their environ.
// Do not use wall time (clock changes) or the launcher's possibly ancient start.
function executionStartFloor() {
  if (process.platform !== 'linux') return null;
  try {
    let floor = 0n;
    for (const name of readdirSync('/proc')) {
      if (!/^\d+$/.test(name)) continue;
      try { const start = BigInt(procStat(Number(name)).start); if (start > floor) floor = start; }
      catch (error) { if (!missing(error)) return null; }
    }
    return floor.toString();
  } catch { return null; }
}

function ancestorTokens(env) {
  let ancestors;
  try { ancestors = JSON.parse(env?.[EXECUTION_ANCESTORS_ENV] ?? '[]'); } catch { ancestors = []; }
  return [...new Set([...(Array.isArray(ancestors) ? ancestors : []), env?.[EXECUTION_TOKEN_ENV]]
    .filter(token => typeof token === 'string' && TOKEN_PATTERN.test(token)))];
}

/** Read-only Linux ownership census. Only a per-command inherited token is
 * ownership authority, never a process name, cwd alone, PID or operationId.
 * Returns {state, complete, ownedProcesses}; identities include boot + start.
 * No environment contents other than token equality escape this function.
 *
 * An empty, complete census PLUS the original group and remembered identities
 * being dead proves quiescence within this cooperative inheritance scope. This
 * is NOT a sandbox: a hostile daemon can deliberately strip/change its token,
 * escape its group and change cwd before being observed. Unsupported /proc,
 * inaccessible same-uid environments or a changing census fail closed.
 * Intent alone can prove life, never death (spawn may still be in flight).
 */
export function collectOwnedExecution(record) {
  const ownedProcesses = [];
  const unknown = () => ({ state: 'unknown', complete: false, ownedProcesses });
  if (process.platform !== 'linux' || record?.strategy !== TOKEN_STRATEGY ||
      typeof record.executionToken !== 'string' || !TOKEN_PATTERN.test(record.executionToken) ||
      !Number.isSafeInteger(record.executionUid) || record.executionUid !== process.getuid?.() ||
      !provenLinuxIdentity(record.launcherIdentity) || !/^\d+$/.test(record.executionStartFloor ?? '') ||
      BigInt(record.executionStartFloor) < BigInt(record.launcherIdentity.start)) return unknown();
  let currentBoot;
  try { currentBoot = bootId(); } catch { return unknown(); }
  if (currentBoot !== record.launcherIdentity.bootId) return { state: 'reused', complete: true, ownedProcesses };
  let complete = true;
  const identities = new Map();
  const remember = identity => identities.set(`${identity.pid}:${identity.start}`, identity);
  if (record.ownedProcesses !== undefined && !Array.isArray(record.ownedProcesses)) return unknown();
  for (const identity of record.ownedProcesses ?? []) {
    if (!provenLinuxIdentity(identity) || identity.bootId !== currentBoot) { complete = false; continue; }
    remember(identity);
  }
  let names;
  const seenStarts = new Map();
  try { names = new Set(readdirSync('/proc').filter(name => /^\d+$/.test(name))); }
  catch { return unknown(); }
  for (const name of names) {
    const pid = Number(name);
    try {
      // Do not attempt to read other users' environments, or conflate their
      // permission restrictions with uncertainty about our own execution.
      if (statSync(`/proc/${pid}`).uid !== record.executionUid) continue;
      const before = procStat(pid);
      seenStarts.set(pid, before.start);
      if (stopped(before.state) || BigInt(before.start) < BigInt(record.executionStartFloor)) continue;
      const environment = readFileSync(`/proc/${pid}/environ`, 'utf8');
      const after = procStat(pid);
      if (before.start !== after.start) { complete = false; continue; }
      const entries = environment.split('\0');
      const tokenEntry = entries.find(entry => entry.startsWith(`${EXECUTION_TOKEN_ENV}=`));
      const ancestorsEntry = entries.find(entry => entry.startsWith(`${EXECUTION_ANCESTORS_ENV}=`));
      const tokens = ancestorTokens({
        [EXECUTION_TOKEN_ENV]: tokenEntry?.slice(EXECUTION_TOKEN_ENV.length + 1),
        [EXECUTION_ANCESTORS_ENV]: ancestorsEntry?.slice(EXECUTION_ANCESTORS_ENV.length + 1),
      });
      if (!tokens.includes(record.executionToken)) continue;
      if (BigInt(before.start) < BigInt(record.launcherIdentity.start)) { complete = false; continue; }
      remember({ pid, start: before.start, bootId: currentBoot, platform: 'linux' });
    } catch (error) {
      if (!missing(error)) complete = false;
      else {
        // ENOENT for environ is not by itself proof of process death (e.g.
        // restricted /proc views). Accept only actual absence or a zombie.
        try { if (!stopped(procStat(pid).state)) complete = false; }
        catch (again) { if (!missing(again)) complete = false; }
      }
    }
  }
  let alive = false, reused = false;
  for (const identity of identities.values()) {
    const state = processState(identity);
    if (state === 'alive') { alive = true; ownedProcesses.push(identity); }
    else if (state === 'reused') reused = true;
    else if (state === 'unknown') complete = false;
  }
  // The leader/group covers initial exec before /proc environ reflects spawn's
  // new env, and ordinary in-group descendants even if they cleared the token.
  const group = processGroupState(record.childIdentity);
  if (group === 'alive') alive = true;
  else if (group === 'reused') reused = true;
  else if (group === 'unknown') complete = false;
  try {
    // This MUST follow the final liveness checks: an owner could fork then exit
    // between environ read and processState. Check for its newly-created child
    // only after deciding whether the parent can still execute.
    for (const name of readdirSync('/proc')) {
      if (!/^\d+$/.test(name)) continue;
      const pid = Number(name);
      try {
        if (statSync(`/proc/${pid}`).uid !== record.executionUid) continue;
        const current = procStat(pid);
        if (!stopped(current.state) && seenStarts.get(pid) !== current.start) complete = false;
      } catch (error) { if (!missing(error)) complete = false; }
    }
  } catch { complete = false; }
  const state = alive ? 'alive' : reused ? 'reused' : complete ? 'dead' : 'unknown';
  return { state, complete, ownedProcesses };
}

/** Recovery API. Treat unknown/reused as blocking, never as dead. This does not
 * authorize signalling; it is a fresh read-only observation, not a durable
 * completion substitute or validation of the controller's journal schema.
 */
export function ownedExecutionState(record) { return collectOwnedExecution(record).state; }

function syncDirectory(path) {
  if (!POSIX) return;
  const fd = openSync(path, 'r');
  try { fsyncSync(fd); }
  catch (error) { if (!['EINVAL', 'ENOTSUP'].includes(error?.code)) throw error; }
  finally { closeSync(fd); }
}
function openLog(path) {
  const fd = openSync(path, 'wx+', 0o600);
  try { fsyncSync(fd); syncDirectory(dirname(path)); }
  catch (error) { closeSync(fd); throw error; }
  return fd;
}
function boundedOutput(stdoutFd, stderrFd) {
  const sizes = [stdoutFd, stderrFd].map(fd => fd === null ? 0 : fstatSync(fd).size);
  // Read only a bounded prefix; no exec/spawn maxBuffer and no whole-log read.
  let outBytes = Math.min(sizes[0], Math.floor(GATE_OUTPUT_LIMIT_BYTES / 2));
  const errBytes = Math.min(sizes[1], GATE_OUTPUT_LIMIT_BYTES - outBytes);
  outBytes = Math.min(sizes[0], GATE_OUTPUT_LIMIT_BYTES - errBytes);
  const text = [outBytes, errBytes].map((size, index) => {
    if (!size) return '';
    const buffer = Buffer.alloc(size);
    const count = readSync(index === 0 ? stdoutFd : stderrFd, buffer, 0, size, 0);
    return buffer.subarray(0, count).toString('utf8');
  }).join('');
  // Invalid UTF-8 can expand on decoding. Bound the actual returned UTF-8 too.
  const encoded = Buffer.from(text);
  const output = encoded.length <= GATE_OUTPUT_LIMIT_BYTES ? text : encoded.subarray(0, GATE_OUTPUT_LIMIT_BYTES - 3).toString('utf8');
  return { output, outputTruncated: sizes[0] > outBytes || sizes[1] > errBytes || encoded.length > GATE_OUTPUT_LIMIT_BYTES, stdoutBytes: sizes[0], stderrBytes: sizes[1] };
}

/**
 * @param {string[]} argv No shell interpretation; use an explicit shell in argv.
 * @param {string} cwd
 * @param {string} logPrefix Absolute or relative to the caller's current directory.
 * @param {{env?: NodeJS.ProcessEnv, timeoutMs?: number, operationId?: string, signal?: AbortSignal}} options
 * @returns {Promise<object>} {code, output, error?, ...durable identity/log metadata}
 *
 * timeoutMs must be positive and <= the standalone per-command ceiling. The
 * caller owns the aggregate gate deadline/attempt/lock. AbortSignal requests
 * cancellation, but return still waits for bounded, observed owned-work cleanup.
 * Infrastructure/pre-spawn reservation collisions reject; executed failures are
 * values. Linux also observes inherited-token descendants across detached
 * groups. Other hosts cannot prove descendant quiescence and never report
 * settled:true for a launched command; their scope records that limitation.
 */
export async function runGateCommand(argv, cwd, logPrefix, options = {}) {
  if (!Array.isArray(argv) || !argv.length || argv.some(arg => typeof arg !== 'string') || !argv[0]) throw new TypeError('argv must be a nonempty array of strings');
  const timeoutMs = options.timeoutMs === undefined ? GATE_COMMAND_TIMEOUT_MS : options.timeoutMs;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > GATE_COMMAND_TIMEOUT_MS) throw new RangeError(`timeoutMs must be positive and <= ${GATE_COMMAND_TIMEOUT_MS}`);
  if (options.operationId !== undefined && (typeof options.operationId !== 'string' || !options.operationId)) throw new TypeError('operationId must be a nonempty string');
  if (options.signal !== undefined && (typeof options.signal?.aborted !== 'boolean' || typeof options.signal?.addEventListener !== 'function')) throw new TypeError('signal must be an AbortSignal');
  const began = performance.now();
  // Nested gate runners mint a new token but retain ancestor ownership. Do not
  // let an inner helper detach its command from the outer gate's census merely
  // by correctly replacing the per-command token. Reserved keys are not user
  // credentials, and are the only supplied env entries we override.
  const executionAncestors = [...new Set([...ancestorTokens(process.env), ...ancestorTokens(options.env)])];
  const prefix = resolve(logPrefix);
  const paths = { intentPath: prefix + '.intent.json', startedPath: prefix + '.started.json', finishedPath: prefix + '.finished.json', stdoutPath: prefix + '.stdout.log', stderrPath: prefix + '.stderr.log' };
  const base = {
    schemaVersion: 1, operationId: options.operationId ?? randomUUID(), argv: [...argv], cwd: resolve(cwd),
    logPrefix: prefix, ...paths, timeoutMs, startedAt: new Date().toISOString(),
    launcherIdentity: processIdentity(process.pid),
    executionToken: randomUUID(), executionUid: process.getuid?.() ?? null, executionStartFloor: executionStartFloor(),
    strategy: process.platform === 'linux' ? TOKEN_STRATEGY : POSIX ? 'posix-process-group' : 'child-only',
  };
  mkdirSync(dirname(prefix), { recursive: true });
  // This exclusive record is also the per-prefix reservation. Never touch a
  // caller's gate-attempt reservation, controller marker or lock.
  immutableRecord(paths.intentPath, { ...base, kind: 'gate-command-intent', phase: 'launch-intent', pid: null, childIdentity: null, processGroupId: null });

  let stdoutFd = null, stderrFd = null, child = null;
  let pid = null, childIdentity = null, processGroupId = null;
  let childExited = false, childExitCode = null, exitSignal = null;
  let timedOut = false, cancelled = false, settled = false;
  let stoppingAt = null, uncertainSince = null;
  const ownedProcesses = new Map();
  const signalled = { SIGTERM: new Set(), SIGKILL: new Set() };
  const rememberOwned = identity => ownedProcesses.set(`${identity.pid}:${identity.start}`, identity);
  let errorText = '';
  const addError = error => { const message = String(error?.message ?? error); if (!errorText.includes(message)) errorText += (errorText ? '; ' : '') + message; };
  const stop = () => { stoppingAt ??= performance.now(); };
  const observe = () => {
    if (!child || pid === null) return childExited ? 'dead' : 'unknown';
    if (!POSIX) return childExited ? 'dead' : 'alive';
    if (process.platform === 'linux') {
      const census = collectOwnedExecution({ ...base, childIdentity, ownedProcesses: [...ownedProcesses.values()] });
      for (const identity of census.ownedProcesses) rememberOwned(identity);
      return census.state;
    }
    // Only during this live invocation: these groups were created by our spawn.
    // This PID-only observation is deliberately NOT exposed as recovery proof.
    try { process.kill(-processGroupId, 0); return 'alive'; }
    catch (error) { return error?.code === 'ESRCH' ? 'dead' : 'unknown'; }
  };
  const signalOwned = signal => {
    const state = observe();
    if (state === 'dead') return true;
    if (state !== 'alive') { addError(`Refused ${signal}: owned execution identity is ${state}`); return false; }
    if (process.platform === 'linux') {
      // Never signal a group discovered by a numeric pgid: it may have been
      // recycled after its leader died. Each observed token owner (and the
      // original child) is revalidated by boot/start immediately before signal.
      // Newly forked owners get their own TERM/KILL even after an earlier pass.
      for (const [key, identity] of ownedProcesses) {
        if (signalled[signal].has(key)) continue;
        const current = processState(identity);
        if (current === 'dead') continue;
        if (current !== 'alive') { addError(`Refused ${signal}: owned PID identity is ${current}`); continue; }
        try { process.kill(identity.pid, signal); signalled[signal].add(key); }
        catch (error) { if (error?.code !== 'ESRCH') addError(error); }
      }
      return true;
    }
    // Without stable identity, do not signal a numeric group after its leader
    // could have been recycled. At most signal the still-owned direct child;
    // descendant settlement remains unsupported regardless of the outcome.
    if (childExited) { addError(`Refused ${signal}: descendant identity unsupported on this host`); return false; }
    try { child.kill(signal); return true; }
    catch (error) { if (error?.code === 'ESRCH') return true; addError(error); return false; }
  };

  try {
    try {
      stdoutFd = openLog(paths.stdoutPath);
      stderrFd = openLog(paths.stderrPath);
      cancelled = options.signal?.aborted === true;
      if (!cancelled) {
        child = spawn(argv[0], argv.slice(1), { cwd: base.cwd, env: { ...(options.env ?? process.env), [EXECUTION_TOKEN_ENV]: base.executionToken, [EXECUTION_ANCESTORS_ENV]: JSON.stringify(executionAncestors) }, detached: POSIX, stdio: ['ignore', stdoutFd, stderrFd], windowsHide: true });
        child.on('exit', (code, signal) => { childExited = true; childExitCode = code; exitSignal = signal; });
        child.on('error', error => { addError(error); childExited = true; stop(); });
        if (validPid(child.pid)) {
          pid = child.pid;
          processGroupId = POSIX ? pid : null;
          childIdentity = processIdentity(pid);
          if (provenLinuxIdentity(childIdentity)) rememberOwned(childIdentity);
          immutableRecord(paths.startedPath, {
            ...base, kind: 'gate-command-started', phase: 'spawned', spawnedAt: new Date().toISOString(),
            pid, childIdentity, process: childIdentity, processGroupId,
          });
        }
      } else childExited = true;
    } catch (error) {
      addError(error); stop();
      if (!child) childExited = true;
    }

    for (;;) {
      cancelled ||= options.signal?.aborted === true;
      if (cancelled) stop();
      if (stoppingAt === null && performance.now() - began >= timeoutMs) { timedOut = true; stop(); }
      const state = observe();
      if (childExited && state === 'dead') {
        // No-launch paths are settled everywhere; launched descendant ownership
        // requires Linux's census, not just death of an unsupported host's group.
        settled = pid === null || process.platform === 'linux';
        if (!settled) addError('Descendant quiescence is unsupported on this host');
        break;
      }
      if (state === 'unknown' || state === 'reused') {
        // A changing /proc snapshot is retried briefly, not accepted as dead or
        // immediately made a permanent error by unrelated process creation.
        uncertainSince ??= performance.now();
        // A failed spawn emits its error on the next tick; do not mislabel it.
        if (pid !== null && (state === 'reused' || performance.now() - uncertainSince >= GATE_CLEANUP_TIMEOUT_MS)) {
          addError(`Owned execution quiescence is ${state}`); stop();
        }
      } else uncertainSince = null;
      if (stoppingAt !== null) {
        signalOwned('SIGTERM');
        if (performance.now() - stoppingAt >= TERM_GRACE_MS) signalOwned('SIGKILL');
        if (performance.now() - stoppingAt >= GATE_CLEANUP_TIMEOUT_MS) {
          addError('Owned execution did not reach observed quiescence within cleanup deadline');
          break;
        }
      }
      await sleep(POLL_MS);
    }

    // Child/group execution has settled (or is explicitly marked uncertain).
    // Direct descriptors mean final writes were already accepted by the kernel;
    // fsync before publishing completion, and retain all evidence on failure.
    for (const fd of [stdoutFd, stderrFd]) if (fd !== null) { try { fsyncSync(fd); } catch (error) { addError(error); } }
    let captured = { output: '', outputTruncated: false, stdoutBytes: 0, stderrBytes: 0 };
    try { captured = boundedOutput(stdoutFd, stderrFd); } catch (error) { addError(error); }
    const code = settled && !timedOut && !cancelled && !errorText && childExitCode !== null ? childExitCode : 1;
    const result = {
      ...base, pid, childIdentity, processGroupId, code, childExitCode, exitSignal, timedOut, cancelled, settled,
      settlementScope: process.platform === 'linux' ? TOKEN_STRATEGY : POSIX ? 'process-group-only-unproven' : 'child-only-unproven',
      ownedProcesses: [...ownedProcesses.values()],
      recoveryIdentitySupported: process.platform === 'linux' && provenLinuxIdentity(childIdentity) && provenLinuxIdentity(base.launcherIdentity) && base.executionStartFloor !== null,
      ...(errorText ? { error: errorText } : {}), ...captured,
    };
    // Never copy output into JSON: logs are authoritative, returned output is a
    // bounded convenience, and the immutable record stays small.
    const { output: _output, ...record } = result;
    immutableRecord(paths.finishedPath, { ...record, kind: 'gate-command-finished', phase: 'finished', finishedAt: new Date().toISOString() });
    return result;
  } finally {
    // An uncertain survivor is recorded, not silently adopted as a reason for
    // the controller process to hang beyond its cleanup deadline.
    if (!settled) child?.unref();
    for (const fd of [stdoutFd, stderrFd]) if (fd !== null) closeSync(fd);
  }
}
