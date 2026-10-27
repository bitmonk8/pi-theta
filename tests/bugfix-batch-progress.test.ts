import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error standalone workflow controller is deliberately plain ESM
import { latestSourceTransition, projectJobProgress } from '../tools/bugfix/batch.mjs';

function fixture() {
  const run = mkdtempSync(join(tmpdir(), 'bugfix-progress-'));
  const put = (name: string, value: unknown) => {
    const path = join(run, name);
    writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value));
    return path;
  };
  const checkpoint = { attempt: 1, status: 'needs_decision', reportDigest: 'old-parallel-only-repair' };
  const source: any = { revision: 40, generation: 3, stages: [], checkpoints: { repair: checkpoint }, decisions: [] };
  const job: any = { sourceRun: run, status: 'blocked', reason: 'Old parallel-only repair request', checkpoint: { phase: 'repair', status: 'needs_decision' } };
  const decision = (phase: string, outcome: string, checkpoints = source.checkpoints, sourceName = 'astra', provisional = false) => {
    const n = source.decisions.length;
    const contextPath = put(`context-${n}.json`, { phase, authority: { checkpoints: structuredClone(checkpoints) } });
    const path = put(`record-${n}.json`, { verdict: { summary: 'Withhold unavailable imported-member type information', rationale: 'Preserve import precision', recommendation: 'Withhold', alternatives: ['Materialise'] } });
    const d = { phase, outcome, contextPath, path, source: sourceName, rationale: phase === 'evidence' ? 'All five marker leak paths require a complete rejected-plan revision' : 'Exact scoped policy choice', authority: provisional ? { provisional: true } : null };
    source.decisions.push(d);
    return d;
  };
  return { run, put, source, job, checkpoint, decision, cleanup: () => rmSync(run, { recursive: true, force: true }) };
}

describe('truthful latest-stop source projection (F009)', () => {
  it('prefers a bound monotonic transition over the old higher-priority repair checkpoint', () => {
    const f = fixture();
    try {
      f.source.checkpoints.plan = { attempt: 2, status: 'blocked' };
      f.source.pendingScopeReplan = { exactRequest: 'Parallel-only request is rejected' };
      f.source.lastTransition = { sequence: 19, revision: 39, generation: 2, kind: 'stage', phase: 'plan', status: 'blocked', reportPath: join(f.run, 'plan.md'), summary: 'Need an exact five-path repair design' };
      // Pause/cleanup may advance the generation/revision, without erasing the stop.
      const value = projectJobProgress(f.job, f.source);
      expect(value).toMatchObject({ checkpoint: { phase: 'plan', status: 'blocked' }, execution: 'blocked', verification: 'incomplete', authority: 'clear', reason: 'Need an exact five-path repair design' });
      expect(value.sourceProgress).toMatchObject({ basis: 'recorded-transition', transition: { sequence: 19, revision: 39, generation: 2 } });
      expect(value.immediateBlocker).toContain('plan/blocked');
      expect(value.nextAction).toContain('report-only scope revision');
      expect(value.sourceHistory.checkpoints.repair).toEqual(f.checkpoint);
      expect(f.job.checkpoint.phase).toBe('repair');
    } finally { f.cleanup(); }
  });

  it.each([
    { sequence: 0 }, { sequence: 1.2 }, { revision: 41 }, { revision: -1 }, { generation: 4 }, { generation: -1 },
    { kind: 'made-up' }, { phase: '' }, { status: '' }, { reportPath: 'relative.md' }, { contextPath: 2 }, { summary: {} },
  ])('does not trust a malformed/future-bound transition: %j', invalid => {
    const f = fixture();
    try {
      f.source.lastTransition = { sequence: 2, revision: 40, generation: 3, kind: 'stage', phase: 'plan', status: 'blocked', ...invalid };
      const value = latestSourceTransition(f.run, f.source);
      expect(value.basis).not.toBe('recorded-transition');
      expect(value.limitation).toContain('Invalid or future-bound');
    } finally { f.cleanup(); }
  });

  it('reproduces legacy 0518: ordered blocked evidence decision outranks old repair and pending owner summary', () => {
    const f = fixture();
    try {
      const old = f.decision('repair', 'CONTINUE', f.source.checkpoints, 'astra', true);
      f.source.checkpoints.plan = { attempt: 4, status: 'blocked', reportDigest: 'all-five-paths-rejected' };
      const latest = f.decision('evidence', 'BLOCKED');
      f.put('stage-repair-result.txt', 'needs_decision\nOld parallel-only repair request');
      f.put('stage-plan-result.txt', 'blocked\nAll five marker leaks require a new exact plan');
      // Deliberately give the old phase a newer mtime: chronology is structured.
      utimesSync(join(f.run, 'stage-repair-result.txt'), new Date(2040, 0), new Date(2040, 0));
      const before = JSON.stringify({ job: f.job, source: f.source });
      const value = projectJobProgress(f.job, f.source);
      expect(value).toMatchObject({ checkpoint: { phase: 'evidence', status: 'BLOCKED' }, authority: 'pending', verification: 'incomplete' });
      expect(value.reason).toContain('All five');
      expect(value.immediateBlocker).toContain('evidence/BLOCKED');
      expect(value.immediateBlocker).not.toContain('Withhold');
      expect(value.approvals).toEqual([expect.objectContaining({ contextPath: old.contextPath, summary: 'Withhold unavailable imported-member type information' })]);
      expect(value.sourceProgress.lastDecision.recordPath).toBe(latest.path);
      expect(value.sourceProgress.basis).toBe('legacy-ordered-decision');
      expect(JSON.stringify({ job: f.job, source: f.source })).toBe(before);
    } finally { f.cleanup(); }
  });

  it('uses a rejected PLAN that is the only structured successor to the last decision snapshot', () => {
    const f = fixture();
    try {
      f.source.checkpoints.plan = { attempt: 1, status: 'pass', reportDigest: 'old-plan' };
      f.decision('repair', 'CONTINUE');
      f.source.checkpoints.plan = { attempt: 2, status: 'blocked', reportDigest: 'new-plan' };
      f.put('stage-plan-result.txt', 'blocked\nThe replacement plan is still incomplete');
      const value = projectJobProgress(f.job, f.source);
      expect(value.checkpoint).toMatchObject({ phase: 'plan', status: 'blocked' });
      expect(value.reason).toBe('The replacement plan is still incomplete');
      expect(value.sourceProgress.basis).toBe('legacy-checkpoint-successor');
    } finally { f.cleanup(); }
  });

  it('does not invent a latest phase for ambiguous legacy checkpoints; retains the last decision link', () => {
    const f = fixture();
    try {
      const last = f.decision('repair', 'BLOCKED');
      f.source.checkpoints.repair = { attempt: 2, status: 'blocked' };
      f.source.checkpoints.plan = { attempt: 2, status: 'blocked' };
      const value = projectJobProgress(f.job, f.source);
      expect(value.checkpoint).toBeUndefined();
      expect(value.sourceProgress).toMatchObject({ transition: null, basis: 'legacy-ambiguous', lastDecision: { recordPath: last.path } });
      expect(value.reason).toContain('no unambiguous latest transition');
      expect(value.immediateBlocker).not.toContain('repair/blocked');
    } finally { f.cleanup(); }
  });

  it('does not order legacy checkpoints by a fixed phase priority in the absence of decision snapshots', () => {
    const f = fixture();
    try {
      f.source.checkpoints.plan = { attempt: 1, status: 'blocked' };
      expect(latestSourceTransition(f.run, f.source)).toMatchObject({ transition: null, basis: 'legacy-ambiguous' });
    } finally { f.cleanup(); }
  });

  it('records owner-approved policy separately from still-blocked engineering, without treating a human answer as a new stop', () => {
    const f = fixture();
    try {
      const ownerChoice = f.decision('repair', 'CONTINUE', f.source.checkpoints, 'astra', true);
      f.source.checkpoints.plan = { attempt: 2, status: 'blocked' };
      const engineering = f.decision('evidence', 'BLOCKED');
      f.source.pendingScopeReplan = { exactRequest: 'Rejected parallel-only repair' };
      const human = f.decision('repair', 'CONTINUE', f.source.checkpoints, 'human');
      human.contextPath = ownerChoice.contextPath;
      const value = projectJobProgress(f.job, f.source);
      expect(value.authority).toBe('clear'); expect(value.approvals).toEqual([]);
      expect(value.sourceProgress.lastDecision.recordPath).toBe(engineering.path);
      expect(value.verification).toBe('incomplete'); expect(value.execution).toBe('blocked');
      expect(value.immediateBlocker).toContain('evidence/BLOCKED');
      expect(value.nextAction).toContain('before implementation');
    } finally { f.cleanup(); }
  });

  it('does not direct a failed verification back into an already authorized scope revision', () => {
    const f = fixture();
    try {
      const request = 'Approved two-file LF correction';
      const path = join(f.run, 'scope-record.json');
      f.source.checkpoints.plan = { attempt: 2, status: 'pass', reportDigest: 'approved-plan' };
      f.source.pendingScopeReplan = { exactRequest: request };
      f.source.scopeReplanAuthorization = { decisionPath: path, planDigest: 'approved-plan', requestDigest: createHash('sha256').update(request).digest('hex') };
      f.source.decisions = [{ path, source: 'astra', phase: 'scope', outcome: 'CONTINUE', authority: { exactRequest: request } }];
      f.source.lastTransition = { sequence: 12, revision: 40, generation: 3, kind: 'decision', phase: 'evidence', status: 'BLOCKED', summary: 'Full gate timed out; diagnose the verification prerequisite' };
      const value = projectJobProgress(f.job, f.source);
      expect(value.verification).toBe('incomplete');
      expect(value.nextAction).not.toContain('report-only scope revision');
      expect(value.immediateBlocker).toContain('Full gate timed out');
    } finally { f.cleanup(); }
  });

  it('pending shipment confirmation does not hide engineering work that can continue', () => {
    const f = fixture();
    try {
      f.decision('repair', 'CONTINUE', f.source.checkpoints, 'astra', true);
      f.source.lastTransition = { sequence: 4, revision: 40, generation: 3, kind: 'stage', phase: 'implement', status: 'blocked', summary: 'Complete the full source regression gate' };
      const value = projectJobProgress(f.job, f.source);
      expect(value.authority).toBe('pending');
      expect(value.immediateBlocker).toContain('Complete the full source regression gate');
      expect(value.nextAction).toContain('Continue only the original source');
      expect(value.immediateBlocker).not.toContain('confirmation');
    } finally { f.cleanup(); }
  });

  it.each(['verified', 'integration-blocked', 'integrated'])('removes stale failed IMPLEMENT checkpoint/reason for completed source (%s)', status => {
    const f = fixture();
    try {
      f.source.checkpoints = { implement: { attempt: 1, status: 'blocked' } };
      f.source.stages = ['gate-final']; f.source.finalReviewDigest = 'review';
      Object.assign(f.job, { status, exportPath: join(f.run, 'verified.json'), exportDigest: 'export', reason: status === 'integration-blocked' ? 'Integration journal parse failure' : 'Old failed implementation', shipmentState: 'not-attempted' });
      if (status === 'integrated') f.job.shipment = { pushed: true, cleaned: true, sha: 'shipped-sha' };
      const value = projectJobProgress(f.job, f.source);
      expect(value.checkpoint).toBeUndefined();
      expect(value).toMatchObject({ execution: 'completed', verification: 'passed', authority: 'clear' });
      expect(value.reason).not.toContain('Old failed implementation');
      expect(value.sourceHistory.checkpoints.implement.status).toBe('blocked');
      expect(value.sourceProgress).toMatchObject({ transition: null, basis: 'legacy-completion-evidence' });
      expect(value.sourceProgress.limitation).toContain('Prior checkpoints are history, not the current stop');
      if (status === 'integration-blocked') {
        expect(value.integrationState).toBe('blocked'); expect(value.integrationVerification).toBe('failed');
        expect(value.immediateBlocker).toContain('Integration journal parse failure');
      }
      if (status === 'integrated') {
        expect(value.shipmentState).toBe('pushed'); expect(value.immediateBlocker).toBeNull();
      }
    } finally { f.cleanup(); }
  });

  it('a new bound stop outranks leftover completion fields when no verified export has passed', () => {
    const f = fixture();
    try {
      f.source.stages = ['gate-final']; f.source.finalReviewDigest = 'old-review';
      f.source.lastTransition = { sequence: 10, revision: 40, generation: 3, kind: 'stage', phase: 'plan', status: 'blocked', summary: 'Replacement PLAN rejected' };
      const value = projectJobProgress(f.job, f.source);
      expect(value).toMatchObject({ execution: 'blocked', verification: 'incomplete', checkpoint: { phase: 'plan', status: 'blocked' } });
      expect(value.reason).toBe('Replacement PLAN rejected');
    } finally { f.cleanup(); }
  });

  it.each(['scope-revision', 'plan'])('a passing %s is not final completion despite old final-gate fields', phase => {
    const f = fixture();
    try {
      f.source.stages = ['gate-final']; f.source.finalReviewDigest = 'old-review';
      f.source.replanRequired = phase === 'scope-revision';
      f.source.lastTransition = { sequence: 11, revision: 40, generation: 3, kind: phase === 'scope-revision' ? 'scope-revision' : 'stage', phase, status: 'pass', summary: 'Replacement candidate/plan prepared' };
      const value = projectJobProgress(f.job, f.source);
      expect(value.execution).not.toBe('completed'); expect(value.verification).toBe('incomplete');
      expect(value.reason).not.toContain('Old parallel-only');
    } finally { f.cleanup(); }
  });

  it('source completion without export is not verified, and completed owner-pending work is a shipment hold', () => {
    const f = fixture();
    try {
      f.source.stages = ['gate-final']; f.source.finalReviewDigest = 'review';
      f.decision('repair', 'CONTINUE', f.source.checkpoints, 'astra', true);
      const value = projectJobProgress(f.job, f.source);
      expect(value).toMatchObject({ execution: 'completed', verification: 'awaiting-export', authority: 'pending' });
      expect(value.checkpoint).toBeUndefined(); expect(value.immediateBlocker).toContain('confirmation pending for shipment');
      expect(value.reason).not.toContain('Old parallel-only');
    } finally { f.cleanup(); }
  });

  it('discloses chronology loss when a legacy checkpoint was removed after a decision snapshot', () => {
    const f = fixture();
    try {
      f.source.checkpoints.plan = { attempt: 2, status: 'pass' };
      f.decision('evidence', 'CONTINUE');
      delete f.source.checkpoints.plan;
      expect(latestSourceTransition(f.run, f.source)).toMatchObject({ transition: null, basis: 'legacy-ambiguous' });
    } finally { f.cleanup(); }
  });

  it.each([false, true])('gives attempted shipment uncertainty/cleanup a concrete non-replay next action (pushed=%s)', pushed => {
    const f = fixture();
    try {
      f.source.stages = ['gate-final']; f.source.finalReviewDigest = 'review';
      Object.assign(f.job, { status: 'integrating', exportPath: join(f.run, 'export.json'), exportDigest: 'export', shipment: { pushed, cleaned: false }, shipmentState: 'not-attempted' });
      const value = projectJobProgress(f.job, f.source);
      expect(value.shipmentState).toBe(pushed ? 'pushed-cleanup-incomplete' : 'attempted-unconfirmed');
      expect(value.verification).toBe('passed');
      expect(value.immediateBlocker).toContain(pushed ? 'cleanup incomplete' : 'remote outcome must be reconciled');
      expect(value.nextAction).toContain(pushed ? 'without replaying push' : 'do not replay shipment');
    } finally { f.cleanup(); }
  });

  it('preserves non-reproduction semantics without inventing implementation authority', () => {
    const f = fixture();
    try {
      f.source.checkpoints = { reproduce: { attempt: 1, status: 'not_reproduced' } };
      f.job.status = 'not-reproduced';
      const value = projectJobProgress(f.job, f.source);
      expect(value.status).toBe('not-reproduced');
      expect(value.checkpoint.status).toBe('not_reproduced');
      expect(value.nextAction).toContain('do not implement or ship');
    } finally { f.cleanup(); }
  });
});
