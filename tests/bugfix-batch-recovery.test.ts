import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

// @ts-expect-error standalone workflow helper is plain ESM
import { processIdentity, GATE_SHELL_TIMEOUT_SECONDS } from '../tools/bugfix/gate-runner.mjs';

const helper = join(process.cwd(), 'tools/bugfix/batch.mjs');
const single = join(process.cwd(), 'tools/bugfix/run.mjs');
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'bugfix-recovery-'));
  const put = (path: string, value: unknown) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value)); };
  const git = (cwd: string, ...args: string[]) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
    if (r.status !== 0) throw new Error(r.stderr + r.stdout); return r.stdout.trim();
  };
  const invoke = (file: string, ...args: string[]) => spawnSync(process.execPath, [file, ...args], { cwd: root, encoding: 'utf8' });
  const ok = (...args: string[]) => { const r = invoke(helper, ...args); expect(r.status, r.stdout + r.stderr).toBe(0); return r.stdout.trim(); };
  const one = (...args: string[]) => { const r = invoke(single, ...args); expect(r.status, r.stdout + r.stderr).toBe(0); return r.stdout.trim(); };
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.email', 'test@example.invalid'); git(root, 'config', 'user.name', 'Recovery Test');
  put(join(root, '.gitignore'), '.pi/tmp/\n/.trees/\n');
  put(join(root, 'package.json'), { scripts: { typecheck: 'node -e "process.exit(0)"', test: 'node gate-fixture.cjs' } });
  put(join(root, 'gate-fixture.cjs'), "const fs=require('fs');if(fs.existsSync('.pi/tmp/hang')){fs.writeFileSync('.pi/tmp/running','started');console.log('PARTIAL_GATE_OUTPUT');setInterval(()=>{},1000)}\n");
  put(join(root, 'docs/bugs/0001-example.md'), '# Bug\n- **Status:** open\n'); put(join(root, 'src/value.cjs'), 'module.exports=1;\n');
  git(root, 'add', '.'); git(root, 'commit', '-m', 'baseline'); const base = git(root, 'rev-parse', 'HEAD');
  const bare = join(root, '.pi/tmp/origin.git'); git(root, 'init', '--bare', bare); git(root, 'remote', 'add', 'origin', bare); git(root, 'push', 'origin', 'main');
  const run = ok('start'); ok('catalog', run);
  put(join(run, 'plan.json'), { bugs: [{ id: '0001', ready: true, reason: 'Established contract', dependencies: [], files: ['src/value.cjs'] }], guidance: [] }); ok('plan', run);
  const manifest = ok('next', run); const request = join(run, 'source-request.txt'); put(request, 'batch ' + manifest);
  const source = one('start-file', request, String(process.pid)); const sourceRoot = JSON.parse(readFileSync(join(source, 'state.json'), 'utf8')).root;
  put(join(source, 'witnesses.json'), { e2e: [{ argv: [process.execPath, '-e', "if(require('./src/value.cjs')!==2){console.error('AssertionError expected fixed value');process.exit(1)}"], failure_pattern: 'AssertionError expected fixed value' }], unit: [], unit_omission_reason: 'Complete inline witness', live_required: false, live: [] });
  one('red', source); put(join(sourceRoot, 'src/value.cjs'), 'module.exports=2;\n'); one('gate', source, 'final'); one('snapshot', source);
  put(join(source, 'final-review.md'), 'CLEAN'); put(join(source, 'final-review-result.json'), { ok: true, findings: 'CLEAN' }); one('final-review-record', source); one('pause', source);
  expect(ok('collect', run, '0001')).toBe('VERIFIED'); const context = JSON.parse(readFileSync(ok('integration-start', run, '0001'), 'utf8'));
  git(context.root, ...context.mergeArgv.slice(1)); ok('integration-enter', run, '0001');
  const state = () => JSON.parse(readFileSync(join(run, 'state.json'), 'utf8'));
  const legacy = () => { mkdirSync(join(run, 'controller.lock')); mkdirSync(join(context.reportDirectory, 'gate-1')); put(join(context.reportDirectory, 'gate-1/0.json'), { code: 0, output: 'legacy completed typecheck' }); };
  const requestRecovery = () => {
    const plan = JSON.parse(ok('recovery-plan', run, '0001')); const path = join(root, '.pi/tmp/recovery-request.json');
    put(path, { ...plan, confirmation: { allExecutionStopped: true, legacy: true, reason: 'Fixture owns every process and confirms quiescence' }, verdict: { ok: false, findings: 'Original worker declined incomplete gates' } }); return path;
  };
  return { root, run, base, bare, context, source, state, put, git, ok, one, legacy, requestRecovery, call: (...args: string[]) => invoke(helper, ...args), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
function snapshot(path: string): Record<string, string> {
  const result: Record<string, string> = {};
  const walk = (dir: string) => { for (const name of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, name.name); if (name.isDirectory()) walk(p); else if (name.isFile()) result[p] = readFileSync(p).toString('base64'); } };
  walk(path); return result;
}
async function until(predicate: () => boolean) {
  const end = Date.now() + 10000;
  while (!predicate()) { if (Date.now() > end) throw new Error('fixture did not reach running gate'); await new Promise(r => setTimeout(r, 20)); }
}

describe('interrupted batch gate inspection and recovery', () => {
  it('keeps deterministic theta gate timeout aligned with the controller supervisor', () => {
    const theta = readFileSync(join(process.cwd(), '.pi', 'theta', 'fix-all-bugs.theta'), 'utf8');
    const gate = theta.match(/fn integration_gate[\s\S]*?timeout: (\d+)/);
    expect(Number(gate?.[1])).toBe(GATE_SHELL_TIMEOUT_SECONDS);
    expect(theta).not.toContain('timeout: null');
  });

  it.each(['live', 'reused', 'unknown'])('refuses %s controller ownership rather than relying on a stale-looking directory', kind => {
    const f = fixture();
    try {
      f.legacy(); const process = processIdentity(globalThis.process.pid);
      if (kind === 'reused') process.start = '0';
      if (kind === 'unknown') process.start = null;
      f.put(join(f.run, 'controller.lock/owner.json'), { version: 1, token: 'owned', op: 'integration-gate', process });
      expect(f.call('recovery-plan', f.run, '0001').stderr).toMatch(/identity is (alive|reused|unknown)/);
      expect(existsSync(join(f.run, 'controller.lock/owner.json'))).toBe(true);
    } finally { f.cleanup(); }
  }, 30000);

  it('refuses an interrupted launch with intent but no trustworthy start/completion identity', () => {
    const f = fixture();
    try {
      f.legacy(); f.put(join(f.context.reportDirectory, 'gate-1/1.intent.json'), { phase: 'launch-intent' });
      expect(f.call('recovery-plan', f.run, '0001').stderr).toContain('no observed process identity');
    } finally { f.cleanup(); }
  }, 30000);

  it.each(['empty-completion', 'matching-missing-identities'])('refuses malformed completion proof: %s', kind => {
    const f = fixture();
    try {
      f.legacy(); const prefix = join(f.context.reportDirectory, 'gate-1/1');
      if (kind === 'empty-completion') { f.put(prefix + '.intent.json', { phase: 'launch-intent' }); f.put(prefix + '.finished.json', {}); }
      else { f.put(prefix + '.started.json', {}); f.put(prefix + '.finished.json', { settled: true }); }
      expect(f.call('recovery-plan', f.run, '0001').status).not.toBe(0);
      expect(existsSync(join(f.context.reportDirectory, 'active'))).toBe(true);
    } finally { f.cleanup(); }
  }, 30000);

  it('rejects a matching completed journal whose launched child has only a PID, not a start/boot identity', () => {
    const f = fixture();
    try {
      f.ok('integration-settled', f.run, '0001'); f.ok('integration-gate', f.run, '0001');
      mkdirSync(join(f.run, 'controller.lock'));
      const prefix = join(f.context.reportDirectory, 'gate-1/0');
      const started = JSON.parse(readFileSync(prefix + '.started.json', 'utf8'));
      const finished = JSON.parse(readFileSync(prefix + '.finished.json', 'utf8'));
      started.childIdentity = { pid: started.pid }; started.process = started.childIdentity;
      finished.childIdentity = started.childIdentity;
      f.put(prefix + '.started.json', started); f.put(prefix + '.finished.json', finished);
      expect(f.call('recovery-plan', f.run, '0001').status).not.toBe(0);
    } finally { f.cleanup(); }
  }, 30000);

  it('binds original source proof files, not only source state and checkout, into recovery preflight', () => {
    const f = fixture();
    try {
      f.legacy(); const request = f.requestRecovery();
      f.put(join(f.source, 'final-review-result.json'), { ok: true, findings: 'Changed original evidence after preflight' });
      expect(f.call('recover', f.run, request).status).not.toBe(0);
      expect(existsSync(join(f.run, 'controller.lock'))).toBe(true);
    } finally { f.cleanup(); }
  }, 30000);

  it('accepts only a bounded committed workflow repair before recovery and normal resume', () => {
    const f = fixture();
    try {
      f.legacy(); f.put(join(f.root, 'tools/bugfix/repair.mjs'), '// bounded workflow repair\n');
      f.git(f.root, 'add', 'tools/bugfix/repair.mjs'); f.git(f.root, 'commit', '-m', 'workflow repair');
      const repaired = f.git(f.root, 'rev-parse', 'HEAD');
      const request = f.requestRecovery(); expect(f.ok('recover', f.run, request)).toBe('RECOVERED');
      expect(f.state().base).toBe(f.base); // recovery does not fabricate upgrade authority
      expect(f.ok('resume', f.run)).toBe(f.run);
      expect(f.state().base).toBe(repaired);
      expect(f.state().workflowUpgrades.at(-1).sha).toBe(repaired);
      expect(existsSync(f.context.root)).toBe(true); // old merge/evidence retained
      expect(f.state().jobs['0001'].status).toBe('verified');
      expect(f.git(f.bare, 'rev-parse', 'main')).toBe(f.base); // no shipment by recovery/resume alone
    } finally { f.cleanup(); }
  }, 30000);
  it('refuses direct gate and review-start operations while a preparation worker is still active', () => {
    const f = fixture();
    try {
      expect(f.call('integration-gate', f.run, '0001').stderr).toContain('still marked active');
      expect(f.call('integration-review-start', f.run, '0001').stderr).toContain('still marked active');
      expect(existsSync(join(f.context.reportDirectory, 'gate-1'))).toBe(false);
      expect(existsSync(join(f.context.reportDirectory, 'active'))).toBe(true);
    } finally { f.cleanup(); }
  }, 30000);

  it('inspects an occupied controller without writing any report, state or lock', () => {
    const f = fixture();
    try { f.legacy(); const before = snapshot(f.run); const result = JSON.parse(f.ok('inspect', f.run)); expect(result.stateRevision).toBe(f.state().revision); expect(result.controllerLock).toBeDefined(); expect(snapshot(f.run)).toEqual(before); }
    finally { f.cleanup(); }
  }, 30000);

  it('requires explicit legacy attestation, archives evidence, and never grants shipment', () => {
    const f = fixture();
    try {
      f.legacy(); const request = f.requestRecovery(); const original = readFileSync(request); const payload = JSON.parse(original.toString()); delete payload.confirmation; f.put(request, payload);
      expect(f.call('recover', f.run, request).stderr).toContain('confirmation'); expect(existsSync(join(f.run, 'controller.lock'))).toBe(true);
      writeFileSync(request, original); expect(f.ok('recover', f.run, request)).toBe('RECOVERED');
      expect(existsSync(join(f.run, 'controller.lock'))).toBe(false); expect(existsSync(join(f.context.reportDirectory, 'active'))).toBe(false);
      expect(existsSync(join(f.run, 'integration.lock'))).toBe(true); expect(existsSync(join(f.context.reportDirectory, 'gate-1/0.json'))).toBe(true);
      expect(f.state().jobs['0001'].gateAttempts).toBe(1); expect(f.state().jobs['0001'].status).toBe('integrating');
      expect(JSON.parse(readFileSync(f.context.verdictPath, 'utf8')).ok).toBe(false);
      expect(f.git(f.root, 'rev-parse', 'HEAD')).toBe(f.base); expect(f.git(f.bare, 'rev-parse', 'main')).toBe(f.base);
      expect(readdirSync(join(f.run, 'recoveries'))).toHaveLength(1);
      expect(f.call('integrate-record', f.run, '0001').stderr).toContain('declined');
      expect(f.ok('integration-gate', f.run, '0001')).toBe('PASS'); expect(existsSync(join(f.context.reportDirectory, 'gate-2'))).toBe(true);
    } finally { f.cleanup(); }
  }, 30000);

  it.each(['state', 'push', 'main', 'source', 'context'])('refuses a stale recovery preflight after %s changes', kind => {
    const f = fixture();
    try {
      f.legacy(); const request = f.requestRecovery();
      if (kind === 'state') f.put(join(f.run, 'state.json'), { ...f.state(), revision: f.state().revision + 1 });
      if (kind === 'push') f.put(join(f.context.reportDirectory, 'push-attempt.json'), { sha: 'uncertain' });
      if (kind === 'main') { f.put(join(f.root, 'src/new.cjs'), 'new'); f.git(f.root, 'add', '.'); f.git(f.root, 'commit', '-m', 'outside drift'); }
      if (kind === 'source') f.put(join(f.context.sourceRoot, 'src/value.cjs'), 'module.exports=99;');
      if (kind === 'context') f.put(f.state().jobs['0001'].integration, '{}');
      expect(f.call('recover', f.run, request).status).not.toBe(0); expect(existsSync(join(f.run, 'controller.lock'))).toBe(true); expect(existsSync(join(f.context.reportDirectory, 'active'))).toBe(true);
    } finally { f.cleanup(); }
  }, 30000);

  it('retains a killed controller attempt, refuses its surviving gate process and recovers only after it stops', async () => {
    const f = fixture(); let child: ReturnType<typeof spawn> | undefined;
    try {
      f.put(join(f.context.root, '.pi/tmp/hang'), 'hang');
      f.ok('integration-settled', f.run, '0001');
      child = spawn(process.execPath, [helper, 'integration-gate', f.run, '0001'], { cwd: f.root, detached: true, stdio: 'ignore' });
      await until(() => existsSync(join(f.context.root, '.pi/tmp/running')));
      const running = f.call('recovery-plan', f.run, '0001'); expect(running.status).not.toBe(0);
      child.kill('SIGKILL'); await new Promise<void>(resolve => child!.once('exit', () => resolve()));
      expect(existsSync(join(f.run, 'controller.lock'))).toBe(true);
      expect(f.call('recovery-plan', f.run, '0001').status).not.toBe(0);
      // The helper's started record identifies the only owned gate process group.
      const starts = readdirSync(join(f.context.reportDirectory, 'gate-1')).filter(n => n.endsWith('.started.json'));
      expect(starts.length).toBeGreaterThan(0);
      for (const name of starts) {
        const started = JSON.parse(readFileSync(join(f.context.reportDirectory, 'gate-1', name), 'utf8'));
        if (typeof started.pid === 'number') { try { process.kill(-started.pid, 'SIGKILL'); } catch {} }
      }
      // Legacy implementation inherited the controller's group; keep fixture cleanup bounded.
      try { process.kill(-child.pid!, 'SIGKILL'); } catch {}
      await new Promise(r => setTimeout(r, 150));
      expect(readFileSync(join(f.context.reportDirectory, 'gate-1/1.stdout.log'), 'utf8')).toContain('PARTIAL_GATE_OUTPUT');
      const request = f.requestRecovery(); expect(f.ok('recover', f.run, request)).toBe('RECOVERED');
    } finally {
      if (child?.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
      f.cleanup();
    }
  }, 30000);
});
