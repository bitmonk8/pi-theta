// Owner handoff uses existing controller admission/confirmation; never fake a
// chat approval in a retained production run. Everything here is disposable.
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const batch = join(process.cwd(), 'tools/bugfix/batch.mjs');
const single = join(process.cwd(), 'tools/bugfix/run.mjs');
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'bugfix-owner-handoff-'));
  const put = (path: string, value: unknown) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value)); };
  const git = (...args: string[]) => { const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' }); if (r.status !== 0) throw Error(r.stderr + r.stdout); return r.stdout.trim(); };
  const call = (script: string, ...args: string[]) => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' });
  const ok = (script: string, ...args: string[]) => { const r = call(script, ...args); expect(r.status, r.stdout + r.stderr).toBe(0); return r.stdout.trim(); };
  git('init', '-b', 'main'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Owner Handoff Test');
  put(join(root, '.gitignore'), '.pi/tmp/\n/.trees/\n');
  put(join(root, 'package.json'), { scripts: { typecheck: 'node -e "process.exit(0)"', test: 'node -e "process.exit(0)"' } });
  put(join(root, 'docs/bugs/0001-example.md'), '# Bug\n- **Status:** open\n');
  put(join(root, 'docs/spec_topics/value.md'), 'Value two is the established contract.\n');
  put(join(root, 'src/value.js'), 'export const value = 1;\n');
  git('add', '.'); git('commit', '-m', 'fixture baseline'); const base = git('rev-parse', 'HEAD');
  const remote = join(root, '.pi/tmp/origin.git'); git('init', '--bare', remote); git('remote', 'add', 'origin', remote); git('push', 'origin', 'main');
  const run = ok(batch, 'start'); ok(batch, 'catalog', run);
  put(join(run, 'plan.json'), { bugs: [{ id: '0001', ready: true, reason: 'Existing contract', dependencies: [], files: ['src/value.js'] }], guidance: [] }); ok(batch, 'plan', run);
  const manifest = ok(batch, 'next', run); const request = join(run, 'start-source.txt'); put(request, 'batch ' + manifest);
  const source = ok(single, 'start-file', request, String(process.pid));
  put(join(source, 'witnesses.json'), { e2e: [{ argv: [process.execPath, '-e', "if(!require('fs').readFileSync('src/value.js','utf8').includes('value = 2')){console.error('AssertionError: expected two');process.exit(1)}"], failure_pattern: 'AssertionError: expected two' }], unit: [], unit_omission_reason: 'Inline complete fixture', live_required: false, live: [] });
  ok(single, 'red', source); ok(single, 'begin', source, 'plan');
  put(join(source, 'plan.md'), 'Bounded provisional contract correction; preserve all evidence.');
  put(join(source, 'spec-proposal.md'), 'Correct exactly the specified value wording; no other contract change.');
  put(join(source, 'stage-plan-result.txt'), 'needs_spec\nExact proposal, with a deferred compatibility decision.'); ok(single, 'record', source, 'plan');
  ok(single, 'snapshot', source); put(join(source, 'evidence-review.md'), 'CLEAN — proposal evidence verified.');
  put(join(source, 'evidence-review-result.json'), { ok: true, findings: 'CLEAN — proposal evidence verified.' }); ok(single, 'evidence-review-record', source);
  const context = ok(single, 'decision-start', source, 'plan');
  put(context + '.verdict.json', { disposition: 'human', clear_preference: false, has_tradeoff: true, evidence_sufficient: true,
    summary: 'A material compatibility choice remains.', recommendation: 'Choose only the exact snapshotted proposal.', rationale: 'Bounded provisional work; owner settles compatibility before shipment.', basis: ['Original witness and reviewed plan.'], alternatives: ['Exact proposed correction.', 'Retain compatibility with existing wording.'] });
  expect(ok(single, 'decision-record', source, context)).toBe('CONTINUE');
  ok(single, 'begin', source, 'implement');
  put(join(source, 'implement.md'), 'Required verification prerequisite has not been resolved.');
  put(join(source, 'stage-implement-result.txt'), 'blocked\nEngineering work remains despite the owner policy choice.');
  ok(single, 'record', source, 'implement');
  ok(single, 'pause', source); expect(ok(batch, 'collect', run, '0001')).toBe('BLOCKED');
  expect(ok(batch, 'next', run)).toBe('DONE'); ok(batch, 'finish', run);
  const state = () => JSON.parse(readFileSync(join(run, 'state.json'), 'utf8'));
  return { root, run, source, context, base, remote, put, git, call, ok, state, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe('explicit owner-decision handoff without launching or shipping', () => {
  it('cannot export older clean final evidence after an unresolved new scope replan', () => {
    const f = fixture();
    try {
      f.ok(batch, 'resume', f.run);
      f.put(f.context + '.answer.txt', 'User selected: 2. Approve proposed spec changes');
      f.ok(single, 'decision-answer', f.source, f.context);
      const source = JSON.parse(readFileSync(join(f.source, 'state.json'), 'utf8'));
      f.put(join(source.root, 'src/value.js'), 'export const value = 2;\n');
      f.ok(single, 'gate', f.source, 'final'); f.ok(single, 'snapshot', f.source);
      f.put(join(f.source, 'final-review.md'), 'CLEAN — old completed scope');
      f.put(join(f.source, 'final-review-result.json'), { ok: true, findings: 'CLEAN — old completed scope' });
      f.ok(single, 'final-review-record', f.source);
      expect(f.ok(single, 'export-verified', f.source)).toBe('PASS');
      f.ok(single, 'begin', f.source, 'repair');
      f.put(join(f.source, 'repair.md'), 'A newly established boundary requires a fresh exact plan.');
      f.put(join(f.source, 'decision-request.md'), 'Exact new boundary scope, no edits before fresh plan/review/authority.');
      f.put(join(f.source, 'stage-repair-result.txt'), 'needs_replan\nNew scope must be reviewed first.');
      f.ok(single, 'record', f.source, 'repair'); f.ok(single, 'stage-replan', f.source, 'repair');
      const result = f.call(single, 'export-verified', f.source);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/replan|scope/i);
      const pending = JSON.parse(readFileSync(join(f.source, 'state.json'), 'utf8')).pendingScopeReplan;
      f.ok(single, 'begin', f.source, 'plan');
      f.put(join(f.source, 'plan.md'), 'Fresh complete plan for the newly reviewed boundary.');
      f.put(join(f.source, 'spec-proposal.md'), 'No further normative changes.');
      f.put(join(f.source, 'decision-request.md'), pending.exactRequest);
      f.put(join(f.source, 'stage-plan-result.txt'), 'pass\nFresh complete replacement plan.');
      f.ok(single, 'record', f.source, 'plan'); f.ok(single, 'snapshot', f.source);
      f.put(join(f.source, 'evidence-review.md'), 'CLEAN — replacement plan only, not final verification.');
      f.put(join(f.source, 'evidence-review-result.json'), { ok: true, findings: 'CLEAN — replacement plan only, not final verification.' });
      f.ok(single, 'evidence-review-record', f.source);
      const scope = f.ok(single, 'decision-start', f.source, 'scope');
      f.put(scope + '.verdict.json', { disposition: 'continue', clear_preference: true, has_tradeoff: false, evidence_sufficient: true,
        summary: 'Exact new scope may now be implemented.', recommendation: 'Implement only the reviewed replacement scope.',
        rationale: 'Fresh planning/evidence authorize implementation, not shipment or reuse of old final proofs.', basis: ['New complete plan'], alternatives: ['Implement exact new scope', 'Remain blocked'] });
      f.ok(single, 'decision-record', f.source, scope);
      const afterReauthorization = f.call(single, 'export-verified', f.source);
      expect(afterReauthorization.status).not.toBe(0);
      expect(afterReauthorization.stderr).toContain('Missing final verification');
      const revised = JSON.parse(readFileSync(join(f.source, 'state.json'), 'utf8'));
      const archived = revised.planArchives.find((item: { reason: string }) => item.reason === 'stage-scope-replan');
      expect(JSON.parse(readFileSync(join(archived.path, 'prior-verification.json'), 'utf8')).finalReviewDigest).toBeTruthy();
      expect(readFileSync(join(archived.path, 'final-review.md'), 'utf8')).toBe('CLEAN — old completed scope');
      expect(revised.finalReviewDigest).toBeUndefined();
      expect(revised.stages).not.toContain('gate-final');
      expect(f.git('rev-parse', 'HEAD')).toBe(f.base);
    } finally { f.cleanup(); }
  }, 30000);

  it('requires lease admission and exact confirmation; approval does not resolve missing verification', () => {
    const f = fixture();
    try {
      const originalRed = readFileSync(join(f.source, 'red-0.json'));
      const originalContext = readFileSync(f.context);
      const originalDecision = readFileSync(join(dirname(f.context), 'record.json'));
      expect(existsSync(join(f.root, '.pi/tmp/fix-bug.lock'))).toBe(false);
      f.put(f.context + '.answer.txt', 'User selected: 2. Approve proposed spec changes');
      expect(f.call(single, 'decision-answer', f.source, f.context).stderr).toContain('lease');
      // CLI bookkeeping admission is not /fix-all-bugs theta execution: no
      // worker, merge, gate or push is started by this operation.
      expect(f.ok(batch, 'resume', f.run)).toBe(f.run);
      expect(existsSync(join(f.source, 'active'))).toBe(false);
      expect(f.state().jobs['0001'].sourceRun).toBe(f.source);
      f.put(f.context + '.answer.txt', 'Remove them'); // chat text alone is not a fabricated selection
      expect(f.call(single, 'decision-answer', f.source, f.context).stderr).toContain('No exact explicit human approval');
      f.put(f.context + '.answer.txt', 'User selected: 2. Approve proposed spec changes'); // genuine structured fixture confirmation
      expect(f.ok(single, 'decision-answer', f.source, f.context)).toBe('PASS');
      expect(f.ok(single, 'approval-report', f.source)).not.toContain('PENDING OWNER APPROVAL');
      expect(f.call(single, 'export-verified', f.source).stderr).toContain('Missing final verification');
      const afterConfirmation = JSON.parse(readFileSync(join(f.source, 'state.json'), 'utf8'));
      expect(afterConfirmation.checkpoints.implement.status).toBe('blocked');
      expect(afterConfirmation.lastTransition).toMatchObject({ kind: 'stage', phase: 'implement', status: 'blocked' });
      expect(f.git('rev-parse', 'HEAD')).toBe(f.base);
      expect(f.git('ls-remote', 'origin', 'refs/heads/main').split(/\s/)[0]).toBe(f.base);
      expect(existsSync(join(f.source, 'active'))).toBe(false);
      expect(existsSync(join(f.run, 'integration.lock'))).toBe(false);
      expect(readFileSync(join(f.source, 'red-0.json'))).toEqual(originalRed);
      expect(readFileSync(f.context)).toEqual(originalContext);
      expect(readFileSync(join(dirname(f.context), 'record.json'))).toEqual(originalDecision);
      expect(f.call(single, 'decision-answer', f.source, f.context).status).not.toBe(0); // once only
    } finally { f.cleanup(); }
  }, 30000);
});
