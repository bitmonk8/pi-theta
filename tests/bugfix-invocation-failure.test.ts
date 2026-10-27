import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
// @ts-expect-error plain ESM controller
import { projectJobProgress } from '../tools/bugfix/batch.mjs';

const helper = join(process.cwd(), 'tools/bugfix/run.mjs');
function fixture(exactRequest = false) {
  const owner = mkdtempSync(join(tmpdir(), 'bugfix-invocation-'));
  const git = (...args: string[]) => {
    const r = spawnSync('git', args, { cwd: owner, encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0); return r.stdout.trim();
  };
  git('init', '-b', 'main'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Test');
  mkdirSync(join(owner, 'docs/bugs'), { recursive: true });
  mkdirSync(join(owner, 'src')); mkdirSync(join(owner, '.pi/theta'), { recursive: true });
  writeFileSync(join(owner, '.gitignore'), '.pi/tmp/\n/.trees/\n');
  writeFileSync(join(owner, '.pi', 'theta', 'fix-bug.theta'), '// frozen controls');
  writeFileSync(join(owner, 'docs/bugs/0001-example.md'), '# Example\n- **Status:** open\n');
  writeFileSync(join(owner, 'src/value.js'), 'const value = 1;');
  writeFileSync(join(owner, 'package.json'), JSON.stringify({ scripts: { typecheck: 'node -e "process.exit(0)"', test: 'node -e "process.exit(0)"' } }));
  git('add', '.'); git('commit', '-m', 'fixture');
  const call = (...args: string[]) => spawnSync(process.execPath, [helper, ...args], { cwd: owner, encoding: 'utf8' });
  const started = call('init', '1'); expect(started.status, started.stderr).toBe(0);
  const run = started.stdout.trim();
  const state = () => JSON.parse(readFileSync(join(run, 'state.json'), 'utf8'));
  const pass = (...args: string[]) => { const r = call(...args); expect(r.status, r.stderr).toBe(0); return r.stdout.trim(); };
  pass('begin', run, 'plan');
  writeFileSync(join(run, 'plan.md'), 'Plan fixture'); writeFileSync(join(run, 'spec-proposal.md'), 'No change');
  if (exactRequest) writeFileSync(join(run, 'decision-request.md'), 'Exact fixture-only request; no normative change.');
  writeFileSync(join(run, 'stage-plan-result.txt'), 'pass\nPlan fixture'); pass('record', run, 'plan');
  writeFileSync(join(run, 'witnesses.json'), JSON.stringify({ e2e: [{ argv: ['node', '-e', "if(!require('fs').readFileSync('src/value.js','utf8').includes('= 2')){console.error('AssertionError: expected two');process.exit(1)}"], failure_pattern: 'AssertionError: expected two' }], unit: [], unit_omission_reason: 'fixture', live_required: false, live: [] }));
  pass('red', run); writeFileSync(join(state().root, 'src/value.js'), 'const value = 2;'); pass('gate', run, 'final');
  const start = (phase = 'final') => { pass('snapshot', run); return pass('review-start', run, phase); };
  const fail = (ticket: string, message = 'child exited before typed return; cause unknown') => { writeFileSync(ticket + '.failure.txt', message); return call('review-failure', run, ticket); };
  const verdict = (ticket: string, phase = 'final', ok = true) => {
    writeFileSync(ticket + '.submission.json', JSON.stringify({ ok, findings: 'Semantic review' }));
    return call(phase === 'final' && ok ? 'final-review-record' : phase === 'evidence' && ok ? 'evidence-review-record' : 'review-record', run, ...(ok && phase !== 'fix' ? [ticket] : [phase, ticket]));
  };
  return { owner, run, state, call, pass, start, fail, verdict, cleanup: () => rmSync(owner, { recursive: true, force: true }) };
}

describe('review invocation failure observations (F011)', () => {
  it.each(['evidence', 'fix', 'final'])('persists %s no-result as invocation failure, not a semantic verdict or scope rejection', phase => {
    const f = fixture();
    try {
      const before = f.state(); const gates = before.verifiedGateFiles.map((p: string) => readFileSync(join(f.run, p)));
      const ticket = f.start(phase);
      const pending = projectJobProgress({ sourceRun: f.run, status: 'scheduled' }, f.state());
      expect(pending.execution).toBe('running'); expect(pending.verification).toBe('incomplete');
      expect(pending.nextAction).toContain('Await the existing reviewer'); expect(pending.nextAction).not.toContain('failure');
      const error = "child exited before typed return: '$(touch SHOULD_NOT_EXIST)'\nCause unknown";
      const failed = f.fail(ticket, error); expect(failed.status, failed.stderr).toBe(0);
      const source = f.state();
      expect(source.lastTransition).toMatchObject({ kind: 'invocation', phase, status: 'blocked', summary: expect.stringContaining(error), contextPath: ticket });
      expect(source.lastTransition.summary).toContain('INVOCATION FAILURE');
      expect(source.verifiedGateDigest).toBe(before.verifiedGateDigest); expect(source.stages).toContain('gate-final');
      gates.forEach((bytes: Buffer, i: number) => expect(readFileSync(join(f.run, before.verifiedGateFiles[i]))).toEqual(bytes));
      expect(existsSync(join(f.run, (phase === 'fix' ? 'fix' : phase) + '-review-result.json'))).toBe(false);
      expect(source.finalReviewDigest).toBeUndefined();
      // Even leftover legacy completion/scope fields cannot turn this missing
      // return into approval or a new report-only scope repair instruction.
      const projected = projectJobProgress({ sourceRun: f.run, status: 'blocked' }, { ...source, finalReviewDigest: 'old-approval', pendingScopeReplan: { exactRequest: 'Old unresolved request' } });
      expect(projected.execution).toBe('blocked'); expect(projected.verification).toBe('incomplete');
      expect(projected.immediateBlocker).toContain('INVOCATION FAILURE'); expect(projected.immediateBlocker).not.toContain('gates passed');
      expect(projected.nextAction).toContain('launch/transport'); expect(projected.nextAction).not.toContain('scope revision');
      expect(f.pass('scope-revision-status', f.run)).toBe('NONE');
      expect(f.call('decision-start', f.run, phase).status).not.toBe(0);
      expect(f.call('export-verified', f.run).status).not.toBe(0);
      expect(f.call('review-failure', f.run, ticket).status).not.toBe(0);
    } finally { f.cleanup(); }
  });

  it('fences stale generation, snapshot and attempt tickets without overwriting a newer stop', () => {
    const f = fixture();
    try {
      const first = f.start(); const second = f.pass('review-start', f.run, 'final');
      const state = readFileSync(join(f.run, 'state.json'));
      expect(f.fail(first).status).not.toBe(0); expect(readFileSync(join(f.run, 'state.json'))).toEqual(state);
      f.pass('snapshot', f.run); expect(f.fail(second).status).not.toBe(0);
      const third = f.start(); f.pass('pause', f.run);
      expect(f.fail(third).status).not.toBe(0);
      const fourth = f.start();
      const newerPhase = f.pass('review-start', f.run, 'fix');
      expect(f.fail(fourth).status).not.toBe(0);
      writeFileSync(newerPhase, '{}'); expect(f.fail(newerPhase).status).not.toBe(0);
      writeFileSync(fourth, '{}'); expect(f.fail(fourth).status).not.toBe(0);
      expect(f.call('review-failure', f.run, join(f.run, '../outside/context.json')).status).not.toBe(0);
    } finally { f.cleanup(); }
  });

  it('refuses malformed failure text and preserves active ownership while recording a failure', () => {
    const f = fixture();
    try {
      f.pass('enter', f.run, String(process.pid)); const ticket = f.start();
      for (const text of ['', '   ', 'x'.repeat(128001), '\u0000']) expect(f.fail(ticket, text).status).not.toBe(0);
      expect(f.fail(ticket).status).toBe(0); expect(existsSync(join(f.run, 'active'))).toBe(true);
      expect(existsSync(join(f.owner, '.pi/tmp/fix-bug.lock'))).toBe(true);
    } finally { f.cleanup(); }
  });

  it('retires old final approval and resolves only the successful retry, retaining immutable failure history', () => {
    const f = fixture();
    try {
      const old = f.start(); expect(f.verdict(old).status).toBe(0); expect(f.state().finalReviewDigest).toBeTruthy();
      const failed = f.start(); expect(f.state().finalReviewDigest).toBeUndefined(); expect(f.fail(failed).status).toBe(0);
      const failure = readFileSync(failed + '.failure.json');
      expect(f.verdict(failed).status).not.toBe(0); expect(f.state().finalReviewDigest).toBeUndefined();
      const retry = f.start(); expect(f.verdict(retry).status).toBe(0);
      expect(readFileSync(failed + '.failure.json')).toEqual(failure);
      expect(f.state().reviewInvocations[failed.slice(f.run.length + 1)].status).toBe('failed');
      expect(f.state().reviewInvocations[retry.slice(f.run.length + 1)].status).toBe('returned');
      expect(f.state().lastTransition).toMatchObject({ kind: 'review', phase: 'final', status: 'pass' });
      expect(f.call('export-verified', f.run).status).toBe(0);
    } finally { f.cleanup(); }
  });

  it('refuses to adopt a retained canonical verdict as a new invocation result', () => {
    const f = fixture();
    try {
      const old = f.start(); expect(f.verdict(old).status).toBe(0);
      const current = f.start(); const before = readFileSync(join(f.run, 'state.json'));
      const refused = f.call('final-review-record', f.run, current);
      expect(refused.status, refused.stderr).not.toBe(0);
      expect(readFileSync(join(f.run, 'state.json'))).toEqual(before);
      expect(f.state().finalReviewDigest).toBeUndefined();
      expect(f.call('export-verified', f.run).status).not.toBe(0);
      expect(f.verdict(current).status).toBe(0);
    } finally { f.cleanup(); }
  });

  it('does not allow phase-local legacy fallback once any invocation tracking exists', () => {
    const f = fixture();
    try {
      f.pass('snapshot', f.run);
      writeFileSync(join(f.run, 'final-review.md'), 'Legacy clean review');
      writeFileSync(join(f.run, 'final-review-result.json'), JSON.stringify({ ok: true, findings: 'Legacy clean review' }));
      f.pass('final-review-record', f.run); // genuinely legacy run remains supported
      const ticket = f.start('evidence'); expect(f.fail(ticket).status).toBe(0);
      const before = readFileSync(join(f.run, 'state.json'));
      expect(f.call('final-review-record', f.run).status).not.toBe(0);
      expect(readFileSync(join(f.run, 'state.json'))).toEqual(before);
      expect(f.state().finalReviewDigest).toBeUndefined();
      expect(f.call('export-verified', f.run).status).not.toBe(0);
    } finally { f.cleanup(); }
  });

  it.each(['pause', 'snapshot'])('reports a pending invocation fenced by %s as unsettled, not a reviewer to await', action => {
    const f = fixture();
    try {
      const ticket = f.start(); f.pass(action, f.run);
      const source = f.state(); const before = JSON.stringify(source);
      const projected = projectJobProgress({ sourceRun: f.run, status: 'blocked' }, source);
      expect(projected.execution).not.toBe('running'); expect(projected.verification).toBe('incomplete');
      expect(projected.immediateBlocker).toContain('fenced');
      expect(projected.nextAction).toContain('Reconcile'); expect(projected.nextAction).not.toContain('Await');
      expect(projected.nextAction).toContain('quiescence');
      expect(JSON.stringify(source)).toBe(before);
      expect(f.fail(ticket).status).not.toBe(0);
    } finally { f.cleanup(); }
  });

  it('publishes no verdict before acquiring the controller state-write guard', () => {
    const f = fixture();
    try {
      const old = f.start(); expect(f.verdict(old).status).toBe(0);
      const current = f.start();
      const before = readFileSync(join(f.run, 'state.json'));
      const canonical = readFileSync(join(f.run, 'final-review-result.json'));
      mkdirSync(join(f.run, 'state-write'));
      expect(f.verdict(current).status).not.toBe(0);
      expect(readFileSync(join(f.run, 'state.json'))).toEqual(before);
      expect(readFileSync(join(f.run, 'final-review-result.json'))).toEqual(canonical);
      expect(existsSync(current + '.result.json')).toBe(false);
      rmSync(join(f.run, 'state-write'), { recursive: true });
      f.pass('final-review-record', f.run, current);
    } finally { f.cleanup(); }
  });

  it('rejects a late ticket-specific result without overwriting a newer canonical verdict', () => {
    const f = fixture();
    try {
      const old = f.start(); const current = f.start();
      writeFileSync(current + '.submission.json', JSON.stringify({ ok: true, findings: 'Current result' }));
      f.pass('final-review-record', f.run, current);
      const state = readFileSync(join(f.run, 'state.json'));
      const canonical = readFileSync(join(f.run, 'final-review-result.json'));
      writeFileSync(old + '.submission.json', JSON.stringify({ ok: false, findings: 'Late stale result' }));
      expect(f.call('review-record', f.run, 'final', old).status).not.toBe(0);
      expect(readFileSync(join(f.run, 'state.json'))).toEqual(state);
      expect(readFileSync(join(f.run, 'final-review-result.json'))).toEqual(canonical);
      expect(readFileSync(join(f.run, 'final-review.md'), 'utf8')).toBe('Current result');
      expect(f.call('export-verified', f.run).status).toBe(0);
    } finally { f.cleanup(); }
  });

  it('does not reinterpret an older negative evidence report as the newer invocation failure', () => {
    const f = fixture(true);
    try {
      const old = f.start('evidence'); expect(f.verdict(old, 'evidence', false).status).toBe(0);
      const next = f.start('evidence'); expect(f.fail(next).status).toBe(0);
      // Even with the old files still present, they are not this attempt's verdict.
      expect(f.pass('scope-revision-status', f.run)).toBe('NONE');
      expect(f.call('decision-start', f.run, 'evidence').status).not.toBe(0);
      const retry = f.start('evidence'); expect(f.verdict(retry, 'evidence').status).toBe(0);
      expect(f.state().reviewInvocations[next.slice(f.run.length + 1)].status).toBe('failed');
      expect(f.state().evidenceReviewBinding).toBeTruthy();
    } finally { f.cleanup(); }
  });
});
