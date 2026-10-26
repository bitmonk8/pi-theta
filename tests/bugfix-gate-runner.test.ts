import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
// @ts-expect-error standalone workflow helper is deliberately plain ESM
import { GATE_TOTAL_TIMEOUT_MS, GATE_COMMAND_TIMEOUT_MS, GATE_SHELL_TIMEOUT_SECONDS, GATE_CLEANUP_TIMEOUT_MS, GATE_OUTPUT_LIMIT_BYTES, processIdentity, processState, processGroupState, ownedExecutionState, collectOwnedExecution, EXECUTION_TOKEN_ENV, EXECUTION_ANCESTORS_ENV, runGateCommand } from '../tools/bugfix/gate-runner.mjs';

const linux = process.platform === 'linux';
const scratch: string[] = [];
const ownedGroups = new Map<number, any>();
const ownedProcesses: any[] = [];
const ownedRecords = new Map<string, any>();
function ownGroup(pid: number) { ownedGroups.set(pid, processIdentity(pid)); }
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'bugfix-gate-runner-'));
  scratch.push(root);
  return { root, prefix: join(root, 'gate', 'command-1') };
}
function json(path: string) { return JSON.parse(readFileSync(path, 'utf8')); }
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('fixture observation timed out');
    await sleep(10);
  }
}
function remember(prefix: string) {
  if (existsSync(prefix + '.started.json')) {
    const record = json(prefix + '.started.json');
    const { processGroupId, childIdentity } = record;
    if (processGroupId) ownedGroups.set(processGroupId, childIdentity);
    ownedRecords.set(prefix, record);
  }
}
afterEach(async () => {
  // Clean only stable, observed owners, never a bare (possibly recycled) pgid.
  for (const record of ownedRecords.values()) ownedProcesses.push(...collectOwnedExecution(record).ownedProcesses);
  ownedRecords.clear();
  for (const identity of [...ownedGroups.values(), ...ownedProcesses.splice(0)]) {
    if (processState(identity) !== 'alive') continue;
    try { process.kill(identity.pid, 'SIGKILL'); } catch (error: any) { if (error.code !== 'ESRCH') throw error; }
  }
  ownedGroups.clear();
  for (const root of scratch.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('durable bounded gate commands', () => {
  it('pins independent positive command/total/outer ceilings with room for observed cleanup', () => {
    expect(GATE_TOTAL_TIMEOUT_MS).toBe(3_600_000);
    expect(GATE_COMMAND_TIMEOUT_MS).toBe(1_800_000);
    expect(GATE_SHELL_TIMEOUT_SECONDS).toBe(3660);
    expect(GATE_COMMAND_TIMEOUT_MS).toBeLessThan(GATE_TOTAL_TIMEOUT_MS);
    expect(GATE_SHELL_TIMEOUT_SECONDS * 1000).toBeGreaterThan(GATE_TOTAL_TIMEOUT_MS + GATE_CLEANUP_TIMEOUT_MS);
    expect(GATE_CLEANUP_TIMEOUT_MS).toBeGreaterThan(0);
    expect(GATE_OUTPUT_LIMIT_BYTES).toBeLessThanOrEqual(1024 * 1024);
  });

  it.skipIf(!linux)('streams live logs and writes immutable launch intent before child output, preserving argv/cwd/env', async () => {
    const { root, prefix } = fixture();
    const running = runGateCommand([process.execPath, '-e', `
      const fs = require('node:fs');
      if (!fs.existsSync(process.env.PREFIX + '.intent.json')) process.exit(91);
      console.log('partial:' + process.cwd() + ':' + process.env.GATE_FIXTURE);
      console.log('token:' + process.env[${JSON.stringify(EXECUTION_TOKEN_ENV)}]);
      console.error('stderr:partial');
      setTimeout(() => console.log('complete'), 180);
    `], root, prefix, { operationId: 'test-operation', env: { ...process.env, PREFIX: prefix, GATE_FIXTURE: 'present' }, timeoutMs: 3000 });
    await until(() => existsSync(prefix + '.stdout.log') && readFileSync(prefix + '.stdout.log', 'utf8').includes('partial:'));
    remember(prefix);
    expect(existsSync(prefix + '.finished.json')).toBe(false);
    const startBytes = readFileSync(prefix + '.started.json', 'utf8');
    const started = JSON.parse(startBytes);
    expect(started).toMatchObject({ schemaVersion: 1, kind: 'gate-command-started', phase: 'spawned', operationId: 'test-operation', cwd: root, process: { pid: started.pid } });
    expect(json(prefix + '.intent.json')).toMatchObject({ kind: 'gate-command-intent', phase: 'launch-intent', pid: null });
    expect(started).not.toHaveProperty('env');
    expect(started.executionToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(started).toMatchObject({ strategy: 'linux-inherited-execution-token', executionUid: process.getuid?.() });
    expect(started.executionStartFloor).toMatch(/^\d+$/);
    expect(json(prefix + '.intent.json').executionToken).toBe(started.executionToken);
    const result = await running;
    expect(result).toMatchObject({ code: 0, settled: true, timedOut: false, cancelled: false, operationId: 'test-operation' });
    expect(result.output).toContain(`partial:${root}:present`);
    expect(result.output).toContain(`token:${started.executionToken}`);
    expect(json(prefix + '.finished.json').executionToken).toBe(started.executionToken);
    expect(result.output).toContain('stderr:partial');
    expect(readFileSync(prefix + '.stdout.log', 'utf8')).toContain('complete\n');
    expect(readFileSync(prefix + '.started.json', 'utf8')).toBe(startBytes);
    expect(json(prefix + '.finished.json')).toMatchObject({ schemaVersion: 1, kind: 'gate-command-finished', code: 0, settled: true });
    expect(result.intentPath).toBe(prefix + '.intent.json');
    expect(result.startedPath).toBe(prefix + '.started.json');
    expect(result.finishedPath).toBe(prefix + '.finished.json');
    await expect(runGateCommand([process.execPath, '-e', 'process.exit(0)'], root, prefix)).rejects.toThrow(/exist|EEXIST/i);
    expect(readFileSync(prefix + '.started.json', 'utf8')).toBe(startBytes);
  });

  it.skipIf(!linux)('mints a token per command even when the operationId and supplied env are shared', async () => {
    const { root, prefix } = fixture();
    const env = { GATE_FIXTURE: 'supplied', [EXECUTION_TOKEN_ENV]: 'not-a-credential-or-valid-token' };
    const source = `console.log(process.env.GATE_FIXTURE); console.log(process.env.${EXECUTION_TOKEN_ENV}); console.log(process.env.${EXECUTION_ANCESTORS_ENV})`;
    const first = await runGateCommand([process.execPath, '-e', source], root, prefix, { operationId: 'aggregate', env });
    const second = await runGateCommand([process.execPath, '-e', source], root, prefix + '-2', { operationId: 'aggregate', env });
    expect(first.code).toBe(0);
    expect(second.code).toBe(0);
    expect(first.executionToken).not.toBe(second.executionToken);
    expect(first.output).toContain(`supplied\n${first.executionToken}\n`);
    expect(second.output).toContain(`supplied\n${second.executionToken}\n`);
    expect(env).toEqual({ GATE_FIXTURE: 'supplied', [EXECUTION_TOKEN_ENV]: 'not-a-credential-or-valid-token' });
  });

  it.skipIf(!linux)('preserves normal nonzero exits without inventing timeout or losing either stream', async () => {
    const { root, prefix } = fixture();
    const result = await runGateCommand([process.execPath, '-e', "console.log('out'); console.error('err'); process.exitCode = 17"], root, prefix);
    expect(result).toMatchObject({ code: 17, timedOut: false, cancelled: false, settled: true });
    expect(result.output).toBe('out\nerr\n');
    expect(json(prefix + '.finished.json')).toMatchObject({ code: 17, childExitCode: 17, exitSignal: null });
  });

  it.skipIf(!linux)('keeps complete large logs with bounded returned output, including the final write', async () => {
    const { root, prefix } = fixture();
    const count = 2 * 1024 * 1024;
    const result = await runGateCommand([process.execPath, '-e', `
      const fs = require('node:fs');
      fs.writeSync(1, 'a'.repeat(${count}) + ':stdout-end');
      fs.writeSync(2, 'b'.repeat(${count}) + ':stderr-end');
    `], root, prefix);
    expect(result.code).toBe(0);
    expect(result.outputTruncated).toBe(true);
    expect(Buffer.byteLength(result.output)).toBeLessThanOrEqual(GATE_OUTPUT_LIMIT_BYTES);
    expect(readFileSync(prefix + '.stdout.log', 'utf8')).toBe('a'.repeat(count) + ':stdout-end');
    expect(readFileSync(prefix + '.stderr.log', 'utf8')).toBe('b'.repeat(count) + ':stderr-end');
    expect(Buffer.byteLength(readFileSync(prefix + '.finished.json', 'utf8'))).toBeLessThan(1024 * 1024);
  });

  it('records failed spawn without claiming an unobserved child PID', async () => {
    const { root, prefix } = fixture();
    const result = await runGateCommand([join(root, 'does-not-exist')], root, prefix);
    expect(result.code).not.toBe(0);
    expect(result.error).toContain('ENOENT');
    expect(result.settled).toBe(true);
    expect(existsSync(prefix + '.started.json')).toBe(false);
    expect(json(prefix + '.finished.json')).toMatchObject({ pid: null, processGroupId: null, settled: true });
  });

  it('rejects null, nonpositive, nonfinite and above-ceiling timeout authority before spawning', async () => {
    for (const timeoutMs of [null, 0, -1, NaN, Infinity, GATE_COMMAND_TIMEOUT_MS + 1]) {
      const { root, prefix } = fixture();
      await expect(runGateCommand([process.execPath, '-e', 'process.exit(0)'], root, prefix, { timeoutMs })).rejects.toThrow(/timeout/i);
      expect(existsSync(prefix + '.intent.json')).toBe(false);
      expect(existsSync(prefix + '.started.json')).toBe(false);
    }
  });

  it.skipIf(!linux)('times out and observes a TERM-resistant owned process group before returning', async () => {
    const { root, prefix } = fixture();
    const pending = runGateCommand([process.execPath, '-e', `
      process.on('SIGTERM', () => {});
      console.log('ready');
      setInterval(() => {}, 1000);
    `], root, prefix, { timeoutMs: 250 });
    await until(() => existsSync(prefix + '.started.json'));
    remember(prefix);
    const spawned = json(prefix + '.started.json');
    const result = await pending;
    expect(result).toMatchObject({ timedOut: true, settled: true });
    expect(result.code).not.toBe(0);
    expect(result.output).toContain('ready');
    expect(json(prefix + '.finished.json')).toMatchObject({ timedOut: true, settled: true, processGroupId: spawned.pid });
    if (linux) expect(processState(spawned.childIdentity)).toBe('dead');
    expect(existsSync(prefix + '.stdout.log')).toBe(true);
  });

  it.skipIf(!linux)('does not accept parent exit/stdio close as success while a descendant survives', async () => {
    const { root, prefix } = fixture();
    const childPidPath = join(root, 'survivor.pid');
    let resolved = false;
    const pending = runGateCommand([process.execPath, '-e', `
      const { spawn } = require('node:child_process');
      const fs = require('node:fs');
      const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      fs.writeFileSync(${JSON.stringify(childPidPath)}, String(child.pid));
      child.unref();
    `], root, prefix, { timeoutMs: 600 }).then((result: any) => { resolved = true; return result; });
    await until(() => existsSync(childPidPath));
    remember(prefix);
    const descendant = processIdentity(Number(readFileSync(childPidPath, 'utf8')));
    ownedProcesses.push(descendant);
    await sleep(100);
    expect(resolved).toBe(false);
    if (linux) {
      expect(processState(descendant)).toBe('alive');
      const identity = json(prefix + '.started.json').childIdentity;
      expect(processState(identity)).toBe('dead');
      expect(processGroupState(identity)).toBe('alive');
    }
    const result = await pending;
    expect(result).toMatchObject({ timedOut: true, settled: true, childExitCode: 0 });
    expect(result.code).not.toBe(0);
    if (linux) expect(processState(descendant)).toBe('dead');
  });

  it.skipIf(!linux)('waits for a naturally finishing descendant and retains its late output', async () => {
    const { root, prefix } = fixture();
    const before = Date.now();
    const result = await runGateCommand([process.execPath, '-e', `
      const { spawn } = require('node:child_process');
      const child = spawn(process.execPath, ['-e', "setTimeout(() => console.log('late-descendant'), 180)"], { stdio: ['ignore', 1, 2] });
      child.unref();
    `], root, prefix, { timeoutMs: 3000 });
    remember(prefix);
    expect(result).toMatchObject({ code: 0, settled: true });
    expect(Date.now() - before).toBeGreaterThanOrEqual(180);
    expect(result.output).toContain('late-descendant');
  });

  it.skipIf(!linux)('waits for a detached child after its command exits, including late output', async () => {
    const { root, prefix } = fixture();
    const pidPath = join(root, 'detached.pid');
    let resolved = false;
    const pending = runGateCommand([process.execPath, '-e', `
      const { spawn } = require('node:child_process');
      const child = spawn(process.execPath, ['-e', "setTimeout(() => console.log('late-detached'), 450)"], { detached: true, stdio: ['ignore', 1, 2] });
      require('node:fs').writeFileSync(${JSON.stringify(pidPath)}, String(child.pid));
      child.unref();
    `], root, prefix, { timeoutMs: 3000 }).then((result: any) => { resolved = true; return result; });
    await until(() => existsSync(pidPath));
    const detached = processIdentity(Number(readFileSync(pidPath, 'utf8')));
    ownedProcesses.push(detached);
    remember(prefix);
    await until(() => processState(json(prefix + '.started.json').childIdentity) === 'dead');
    await sleep(80);
    expect(resolved).toBe(false);
    const result = await pending;
    expect(result).toMatchObject({ code: 0, settled: true, settlementScope: 'linux-inherited-execution-token' });
    expect(result.output).toContain('late-detached');
    expect(processState(detached)).toBe('dead');
    // A concurrent unrelated process can make a one-shot /proc census unknown;
    // require bounded eventual quiescence, never reinterpret unknown as dead.
    await until(() => ownedExecutionState(json(prefix + '.started.json')) === 'dead');
  });

  it.skipIf(!linux)('times out a TERM-resistant detached grandchild without killing a foreign token', async () => {
    const { root, prefix } = fixture();
    const pidPath = join(root, 'grandchild.pid');
    const outsider = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      detached: true, stdio: 'ignore', env: { ...process.env, [EXECUTION_TOKEN_ENV]: '810d581a-3f25-4367-bf16-aed382301851' },
    });
    const outsiderIdentity = processIdentity(outsider.pid!);
    ownedProcesses.push(outsiderIdentity);
    outsider.unref();
    const grandchildSource = `
      process.on('SIGTERM', () => {});
      require('node:fs').writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));
      setInterval(() => {}, 1000);
    `;
    const intermediarySource = `
      const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchildSource)}], { detached: true, stdio: 'ignore' });
      child.unref();
    `;
    const pending = runGateCommand([process.execPath, '-e', `
      const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(intermediarySource)}], { detached: true, stdio: 'ignore' });
      child.unref();
    `], root, prefix, { timeoutMs: 650 });
    await until(() => existsSync(pidPath));
    const descendant = processIdentity(Number(readFileSync(pidPath, 'utf8')));
    ownedProcesses.push(descendant);
    remember(prefix);
    const result = await pending;
    expect(result).toMatchObject({ code: 1, timedOut: true, settled: true, childExitCode: 0 });
    expect(processState(descendant)).toBe('dead');
    expect(processState(outsiderIdentity)).toBe('alive');
    expect(result.ownedProcesses).toContainEqual(descendant);
    await until(() => ownedExecutionState(json(prefix + '.finished.json')) === 'dead');
  });

  it.skipIf(!linux)('keeps outer ownership when a nested gate runner mints a new token and its controller dies', async () => {
    const { root, prefix } = fixture();
    const innerPrefix = join(root, 'gate', 'inner');
    const pidPath = join(root, 'inner.pid');
    const moduleUrl = pathToFileURL(resolve('tools/bugfix/gate-runner.mjs')).href;
    const innerSource = `
      require('node:fs').writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));
      setInterval(() => {}, 1000);
    `;
    const pending = runGateCommand([process.execPath, '--input-type=module', '-e', `
      import fs from 'node:fs';
      import { runGateCommand } from ${JSON.stringify(moduleUrl)};
      void runGateCommand([process.execPath, '-e', ${JSON.stringify(innerSource)}], ${JSON.stringify(root)}, ${JSON.stringify(innerPrefix)});
      const timer = setInterval(() => {
        if (fs.existsSync(${JSON.stringify(pidPath)})) process.kill(process.pid, 'SIGKILL');
      }, 5);
    `], root, prefix, { timeoutMs: 500 });
    await until(() => existsSync(pidPath));
    const descendant = processIdentity(Number(readFileSync(pidPath, 'utf8')));
    ownedProcesses.push(descendant);
    remember(prefix);
    remember(innerPrefix);
    const result = await pending;
    expect(result).toMatchObject({ code: 1, timedOut: true, settled: true, exitSignal: 'SIGKILL' });
    expect(result.executionToken).not.toBe(json(innerPrefix + '.started.json').executionToken);
    expect(result.ownedProcesses).toContainEqual(descendant);
    expect(processState(descendant)).toBe('dead');
  });

  it.skipIf(!linux)('recovers a detached grandchild from durable token after controller and original leader die', async () => {
    const { root, prefix } = fixture();
    const pidPath = join(root, 'recovery-descendant.pid');
    const moduleUrl = pathToFileURL(resolve('tools/bugfix/gate-runner.mjs')).href;
    const grandchildSource = `
      require('node:fs').writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));
      setInterval(() => {}, 1000);
    `;
    const intermediarySource = `
      const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchildSource)}], { detached: true, stdio: 'ignore' });
      child.unref();
    `;
    const source = `
      const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(intermediarySource)}], { detached: true, stdio: 'ignore' });
      child.unref();
    `;
    const host = spawn(process.execPath, ['--input-type=module', '-e', `
      import { runGateCommand } from ${JSON.stringify(moduleUrl)};
      await runGateCommand([process.execPath, '-e', ${JSON.stringify(source)}], ${JSON.stringify(root)}, ${JSON.stringify(prefix)});
    `], { detached: true, stdio: 'ignore' });
    ownGroup(host.pid!);
    const closed = new Promise(resolve => host.once('close', resolve));
    await until(() => existsSync(pidPath));
    const descendant = processIdentity(Number(readFileSync(pidPath, 'utf8')));
    ownedProcesses.push(descendant);
    remember(prefix);
    const started = json(prefix + '.started.json');
    await until(() => processState(started.childIdentity) === 'dead');
    process.kill(-host.pid!, 'SIGKILL');
    await closed;
    expect(existsSync(prefix + '.finished.json')).toBe(false);
    expect(processGroupState(started.childIdentity)).toBe('dead');
    expect(ownedExecutionState(started)).toBe('alive');
    expect(ownedExecutionState(json(prefix + '.intent.json'))).toBe('alive');
    const census = collectOwnedExecution(started);
    expect(census.state).toBe('alive');
    expect(census.ownedProcesses).toContainEqual(descendant);
    process.kill(descendant.pid, 'SIGKILL');
    await until(() => processState(descendant) === 'dead');
    await until(() => ownedExecutionState(started) === 'dead');
    // A token census can discover live work from an intent, but an empty
    // intent still cannot close the launch-before-started-record crash window.
    expect(ownedExecutionState(json(prefix + '.intent.json'))).toBe('unknown');
  });

  it.skipIf(!linux)('cancels explicitly owned work via AbortSignal and retains the evidence', async () => {
    const { root, prefix } = fixture();
    const controller = new AbortController();
    const pending = runGateCommand([process.execPath, '-e', "console.log('ready'); setInterval(() => {}, 1000)"], root, prefix, { signal: controller.signal });
    await until(() => existsSync(prefix + '.stdout.log') && readFileSync(prefix + '.stdout.log', 'utf8').includes('ready'));
    remember(prefix);
    controller.abort();
    const result = await pending;
    expect(result).toMatchObject({ cancelled: true, timedOut: false, settled: true });
    expect(result.code).not.toBe(0);
    expect(json(prefix + '.finished.json')).toMatchObject({ cancelled: true, settled: true });
  });

  it('records an already-cancelled invocation without launching work', async () => {
    const { root, prefix } = fixture();
    const controller = new AbortController(); controller.abort();
    const result = await runGateCommand([process.execPath, '-e', 'throw Error("must not launch")'], root, prefix, { signal: controller.signal });
    expect(result).toMatchObject({ cancelled: true, settled: true, pid: null });
    expect(result.code).not.toBe(0);
    expect(existsSync(prefix + '.started.json')).toBe(false);
  });

  it.skipIf(!linux)('leaves partial logs and durable ownership after the helper itself is SIGKILLed', async () => {
    const { root, prefix } = fixture();
    mkdirSync(join(root, 'gate'), { recursive: true });
    const moduleUrl = pathToFileURL(resolve('tools/bugfix/gate-runner.mjs')).href;
    const host = spawn(process.execPath, ['--input-type=module', '-e', `
      import { runGateCommand } from ${JSON.stringify(moduleUrl)};
      await runGateCommand([process.execPath, '-e', "console.log('durable-before-crash'); console.error('error-before-crash'); setInterval(() => {}, 1000)"], ${JSON.stringify(root)}, ${JSON.stringify(prefix)}, { operationId: 'crash-fixture' });
    `], { detached: true, stdio: 'ignore' });
    ownGroup(host.pid!);
    const hostClosed = new Promise(resolve => host.once('close', resolve));
    try {
      await until(() => existsSync(prefix + '.stdout.log') && readFileSync(prefix + '.stdout.log', 'utf8').includes('durable-before-crash'));
      remember(prefix);
      const startedBytes = readFileSync(prefix + '.started.json', 'utf8');
      const spawned = json(prefix + '.started.json');
      expect(spawned).toMatchObject({ schemaVersion: 1, kind: 'gate-command-started', processGroupId: spawned.pid });
      expect(spawned.childIdentity.start).toMatch(/^\d+$/);
      expect(spawned.childIdentity.bootId).toBeTruthy();
      expect(spawned.processGroupId).not.toBe(host.pid);
      process.kill(-host.pid!, 'SIGKILL');
      await hostClosed;
      expect(processState(spawned.childIdentity)).toBe('alive');
      expect(existsSync(prefix + '.finished.json')).toBe(false);
      expect(readFileSync(prefix + '.started.json', 'utf8')).toBe(startedBytes);
      expect(readFileSync(prefix + '.stderr.log', 'utf8')).toContain('error-before-crash');
    } finally {
      remember(prefix);
      try { process.kill(-host.pid!, 'SIGKILL'); } catch (error: any) { if (error.code !== 'ESRCH') throw error; }
      await hostClosed;
    }
  });

  it.skipIf(!linux)('preserves pre-spawn intent when killed in the launch/identity crash window', async () => {
    const { root, prefix } = fixture();
    const moduleUrl = pathToFileURL(resolve('tools/bugfix/gate-runner.mjs')).href;
    const host = spawn(process.execPath, ['--input-type=module', '-e', `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const originalSync = fs.fsyncSync;
      fs.fsyncSync = fd => {
        originalSync(fd);
        if (fs.readlinkSync('/proc/self/fd/' + fd).endsWith('.intent.json')) {
          fs.writeFileSync(${JSON.stringify(join(root, 'frozen-before-spawn'))}, 'ready');
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
        }
      };
      syncBuiltinESMExports();
      const { runGateCommand } = await import(${JSON.stringify(moduleUrl)});
      await runGateCommand([process.execPath, '-e', "throw Error('must not spawn')"], ${JSON.stringify(root)}, ${JSON.stringify(prefix)});
    `], { detached: true, stdio: 'ignore' });
    ownGroup(host.pid!);
    const closed = new Promise(resolve => host.once('close', resolve));
    try {
      await until(() => existsSync(join(root, 'frozen-before-spawn')));
      process.kill(-host.pid!, 'SIGKILL');
      await closed;
      const intent = json(prefix + '.intent.json');
      expect(intent).toMatchObject({ kind: 'gate-command-intent', phase: 'launch-intent', pid: null, childIdentity: null, launcherIdentity: { pid: host.pid } });
      expect(processState(intent.launcherIdentity)).toBe('dead');
      // The dead launcher alone must not turn this incomplete intent into a
      // machine-proven no-launch or settled command during recovery.
      expect(existsSync(prefix + '.started.json')).toBe(false);
      expect(existsSync(prefix + '.finished.json')).toBe(false);
    } finally {
      try { process.kill(-host.pid!, 'SIGKILL'); } catch (error: any) { if (error.code !== 'ESRCH') throw error; }
      await closed;
    }
  });

  it.skipIf(!linux)('fails closed and bounds return when live group identity cannot be proven, without killing it', async () => {
    const { root, prefix } = fixture();
    const moduleUrl = pathToFileURL(resolve('tools/bugfix/gate-runner.mjs')).href;
    const host = spawn(process.execPath, ['--input-type=module', '-e', `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const originalRead = fs.readFileSync;
      fs.readFileSync = (path, ...args) => {
        if (typeof path === 'string' && /^\\/proc\\/\\d+\\/stat$/.test(path) && path !== '/proc/' + process.pid + '/stat') {
          throw Object.assign(new Error('fixture identity unavailable'), { code: 'EACCES' });
        }
        return originalRead(path, ...args);
      };
      syncBuiltinESMExports();
      const { runGateCommand } = await import(${JSON.stringify(moduleUrl)});
      await runGateCommand([process.execPath, '-e', "console.log('unknown-survivor'); setInterval(() => {}, 1000)"], ${JSON.stringify(root)}, ${JSON.stringify(prefix)});
    `], { detached: true, stdio: 'ignore' });
    ownGroup(host.pid!);
    const closed = new Promise(resolve => host.once('close', resolve));
    try {
      await until(() => existsSync(prefix + '.started.json'));
      remember(prefix);
      const started = json(prefix + '.started.json');
      const identity = processIdentity(started.pid);
      ownedProcesses.push(identity);
      expect(started.childIdentity.start).toBe(null);
      await until(() => existsSync(prefix + '.finished.json'), 2 * GATE_CLEANUP_TIMEOUT_MS + 2000);
      const result = json(prefix + '.finished.json');
      expect(result).toMatchObject({ code: 1, settled: false, recoveryIdentitySupported: false });
      expect(result.error).toContain('quiescence');
      expect(result.error).toContain('Refused SIGKILL');
      expect(processState(identity)).toBe('alive');
      // Returning an uncertain result must not retain a ChildProcess ref and
      // keep the controller host alive indefinitely past the cleanup budget.
      await until(() => processState(started.launcherIdentity) === 'dead');
      await closed;
    } finally {
      remember(prefix);
      try { process.kill(-host.pid!, 'SIGKILL'); } catch (error: any) { if (error.code !== 'ESRCH') throw error; }
      await closed;
    }
  }, 16_000);

  it.skipIf(!linux)('cannot settle when the detached ownership census is unreadable or hides a live environ', async () => {
    for (const code of ['EACCES', 'ENOENT']) {
      const { root, prefix } = fixture();
      const pidPath = join(root, 'hidden.pid');
      const moduleUrl = pathToFileURL(resolve('tools/bugfix/gate-runner.mjs')).href;
      const source = `
        const child = require('node:child_process').spawn(process.execPath, ['-e', "setInterval(() => {}, 1000)"], { detached: true, stdio: 'ignore' });
        require('node:fs').writeFileSync(${JSON.stringify(pidPath)}, String(child.pid));
        child.unref();
      `;
      const host = spawn(process.execPath, ['--input-type=module', '-e', `
        import fs from 'node:fs';
        import { syncBuiltinESMExports } from 'node:module';
        const originalRead = fs.readFileSync;
        fs.readFileSync = (path, ...args) => {
          if (fs.existsSync(${JSON.stringify(pidPath)}) && path === '/proc/' + originalRead(${JSON.stringify(pidPath)}, 'utf8') + '/environ') {
            throw Object.assign(new Error('fixture hidden environment'), { code: ${JSON.stringify(code)} });
          }
          return originalRead(path, ...args);
        };
        syncBuiltinESMExports();
        const { runGateCommand } = await import(${JSON.stringify(moduleUrl)});
        await runGateCommand([process.execPath, '-e', ${JSON.stringify(source)}], ${JSON.stringify(root)}, ${JSON.stringify(prefix)}, { timeoutMs: 1500 });
      `], { detached: true, stdio: 'ignore' });
      ownGroup(host.pid!);
      const closed = new Promise(resolve => host.once('close', resolve));
      try {
        await until(() => existsSync(pidPath));
        const detached = processIdentity(Number(readFileSync(pidPath, 'utf8')));
        ownedProcesses.push(detached);
        remember(prefix);
        await until(() => existsSync(prefix + '.finished.json'), GATE_CLEANUP_TIMEOUT_MS + 3000);
        const result = json(prefix + '.finished.json');
        expect(result).toMatchObject({ code: 1, settled: false });
        expect(result.error).toContain('quiescence');
        expect(processState(detached)).toBe('alive');
        // Recovery outside the restricted view can find it; a durable settled
        // flag must never override the fresh ownership census.
        expect(ownedExecutionState(result)).toBe('alive');
      } finally {
        try { process.kill(-host.pid!, 'SIGKILL'); } catch (error: any) { if (error.code !== 'ESRCH') throw error; }
        await closed;
      }
    }
  }, 18_000);

  it.skipIf(!linux)('rejects a PID whose start identity changes during the final census', async () => {
    const { root, prefix } = fixture();
    await runGateCommand([process.execPath, '-e', 'process.exit(0)'], root, prefix);
    const record = json(prefix + '.started.json');
    const moduleUrl = pathToFileURL(resolve('tools/bugfix/gate-runner.mjs')).href;
    const probe = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const originalRead = fs.readFileSync;
      let reads = 0;
      fs.readFileSync = (path, ...args) => {
        const text = originalRead(path, ...args);
        if (path !== '/proc/' + process.pid + '/stat' || ++reads < 2) return text;
        const end = text.lastIndexOf(')') + 2;
        const fields = text.slice(end).trim().split(/\\s+/);
        fields[19] = String(BigInt(fields[19]) + 1n);
        return text.slice(0, end) + fields.join(' ');
      };
      syncBuiltinESMExports();
      const { collectOwnedExecution } = await import(${JSON.stringify(moduleUrl)});
      const census = collectOwnedExecution(${JSON.stringify(record)});
      if (census.state !== 'unknown' || census.complete) process.exit(91);
    `], { encoding: 'utf8', timeout: 3000 });
    expect(probe.error).toBeUndefined();
    expect(probe.status, probe.stderr).toBe(0);
  });

  it.skipIf(!linux)('does not claim descendant settlement on an unsupported host', () => {
    const { root, prefix } = fixture();
    const moduleUrl = pathToFileURL(resolve('tools/bugfix/gate-runner.mjs')).href;
    const probe = spawnSync(process.execPath, ['--input-type=module', '-e', `
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      const { runGateCommand, ownedExecutionState } = await import(${JSON.stringify(moduleUrl)});
      const result = await runGateCommand([process.execPath, '-e', 'process.exit(0)'], ${JSON.stringify(root)}, ${JSON.stringify(prefix)});
      if (result.settled || result.code === 0 || result.recoveryIdentitySupported || result.settlementScope !== 'process-group-only-unproven' || ownedExecutionState(result) !== 'unknown') process.exit(91);
    `], { encoding: 'utf8', timeout: 3000 });
    expect(probe.error).toBeUndefined();
    expect(probe.status, probe.stderr).toBe(0);
  });

  it.skipIf(!linux)('does not mistake unavailable boot identity for proof that a process died', () => {
    const moduleUrl = pathToFileURL(resolve('tools/bugfix/gate-runner.mjs')).href;
    const probe = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      import { processIdentity, processState } from ${JSON.stringify(moduleUrl)};
      const identity = processIdentity(process.pid);
      const originalRead = fs.readFileSync;
      fs.readFileSync = (path, ...args) => {
        if (path === '/proc/sys/kernel/random/boot_id') throw Object.assign(new Error('fixture proc unavailable'), { code: 'ENOENT' });
        return originalRead(path, ...args);
      };
      syncBuiltinESMExports();
      if (processState(identity) !== 'unknown') process.exit(91);
    `], { encoding: 'utf8', timeout: 3000 });
    expect(probe.error).toBeUndefined();
    expect(probe.status, probe.stderr).toBe(0);
  });

  it.skipIf(!linux)('distinguishes live, dead, PID reuse and unproven process identities', async () => {
    const own = processIdentity(process.pid);
    expect(own).toMatchObject({ pid: process.pid, platform: 'linux' });
    expect(own.start).toMatch(/^\d+$/);
    expect(processState(own)).toBe('alive');
    expect(processState({ ...own, start: '0' })).toBe('reused');
    expect(processState({ ...own, bootId: 'different-boot' })).toBe('reused');
    expect(processState({ ...own, start: null })).toBe('unknown');
    expect(processState({ ...own, platform: 'darwin' })).toBe('unknown');
    expect(processGroupState({ ...own, platform: 'darwin' })).toBe('unknown');
    expect(processGroupState({ ...own, start: '0' })).toBe('reused');
    const { root, prefix } = fixture();
    await runGateCommand([process.execPath, '-e', 'process.exit(0)'], root, prefix);
    const started = json(prefix + '.started.json');
    expect(processState(started.childIdentity)).toBe('dead');
    await until(() => ownedExecutionState(started) === 'dead');
    expect(ownedExecutionState({ ...started, executionToken: null })).toBe('unknown');
    expect(ownedExecutionState({ ...started, executionUid: process.getuid!() + 1 })).toBe('unknown');
    expect(ownedExecutionState({ ...started, executionStartFloor: null })).toBe('unknown');
    expect(ownedExecutionState({ ...started, ownedProcesses: [{ ...own, start: '0' }] })).toBe('reused');
    expect(ownedExecutionState({ ...started, ownedProcesses: [{ ...own, start: null }] })).toBe('unknown');
    expect(ownedExecutionState({ ...started, launcherIdentity: { ...started.launcherIdentity, bootId: 'other-boot' } })).toBe('reused');
  });
});
