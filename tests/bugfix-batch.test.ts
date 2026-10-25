import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const helper = join(process.cwd(), 'tools/bugfix/batch.mjs');
const single = join(process.cwd(), 'tools/bugfix/run.mjs');
function git(root: string, ...args: string[]) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr + r.stdout);
  return r.stdout.trim();
}
function fixture(count = 6, remote = false, piTheta = false) {
  const root = mkdtempSync(join(tmpdir(), 'bugfix-batch-'));
  const put = (path: string, value: unknown) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value));
  };
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.email', 'test@example.invalid'); git(root, 'config', 'user.name', 'Batch Test');
  put(join(root, '.gitignore'), '.pi/tmp/\n/.trees/\n');
  put(join(root, 'package.json'), { ...(piTheta ? { name: '@bitmonk8/pi-theta' } : {}), scripts: { typecheck: 'node -e "process.exit(0)"', test: 'node -e "process.exit(0)"' } });
  const bugs = Array.from({ length: count }, (_, i) => ({ id: String(i + 1).padStart(4, '0'), ready: true, reason: 'Concrete regression with a settled contract', dependencies: [] as string[], files: [`src/value-${i + 1}.js`] }));
  for (const [i, bug] of bugs.entries()) {
    put(join(root, `docs/bugs/${bug.id}-example.md`), `# Bug ${bug.id}\n- **Status:** open\nSource: \`src/value-${i + 1}.js:1\`\n`);
    put(join(root, `src/value-${i + 1}.js`), 'export const value = 1;\n');
  }
  put(join(root, 'docs/bugs/0001-investigation.md'), '# Investigation supplement, not a separately numbered report\n');
  put(join(root, 'docs/bugs/9999-resolved.md'), '# Old\n- **Status:** fixed\n');
  git(root, 'add', '.'); git(root, 'commit', '-m', 'baseline');
  const base = git(root, 'rev-parse', 'HEAD');
  const bare = join(root, '.pi/tmp/origin.git');
  if (remote) { git(root, 'init', '--bare', bare); git(root, 'remote', 'add', 'origin', bare); git(root, 'push', 'origin', 'main'); }
  const call = (...args: string[]) => spawnSync(process.execPath, [helper, ...args], { cwd: root, encoding: 'utf8' });
  const ok = (...args: string[]) => { const r = call(...args); expect(r.status, r.stderr + r.stdout).toBe(0); return r.stdout.trim(); };
  const one = (...args: string[]) => {
    const r = spawnSync(process.execPath, [single, ...args], { cwd: root, encoding: 'utf8' });
    expect(r.status, r.stderr + r.stdout).toBe(0); return r.stdout.trim();
  };
  const run = ok('start');
  const state = () => JSON.parse(readFileSync(join(run, 'state.json'), 'utf8'));
  const plan = () => { ok('catalog', run); put(join(run, 'plan.json'), { bugs, guidance: ['Keep prerequisites before dependents'] }); return ok('plan', run); };
  const startSource = (id: string) => {
    const request = join(run, 'request-' + id + '.txt'); put(request, 'batch ' + join(run, 'jobs', id + '.json'));
    const sourceRun = one('start-file', request, String(process.pid));
    const sourceState = () => JSON.parse(readFileSync(join(sourceRun, 'state.json'), 'utf8'));
    expect(sourceState().root).toBe(join(root, '.trees', basename(sourceRun)));
    expect(git(root, 'check-ignore', sourceState().root)).toBe(sourceState().root);
    expect(existsSync(join(sourceRun, 'worktree'))).toBe(false);
    return { run: sourceRun, state: sourceState, root: sourceState().root as string };
  };
  const verified = (id: string, close = true) => {
    const source = startSource(id); const number = Number(id);
    put(join(source.run, 'witnesses.json'), {
      e2e: [{ argv: [process.execPath, '-e', `if(!require('fs').readFileSync('src/value-${number}.js','utf8').includes('value = 2')) { console.error('AssertionError BUG_${id} expected 2');process.exit(1) }`], failure_pattern: `AssertionError BUG_${id} expected 2` }],
      unit: [], unit_omission_reason: 'This fixture tests the complete controller', live_required: false, live: [],
    });
    one('red', source.run); put(join(source.root, `src/value-${number}.js`), 'export const value = 2;\n');
    if (close) put(join(source.root, `docs/bugs/${id}-example.md`), `# Bug ${id}\n- **Status:** fixed\n`);
    one('gate', source.run, 'final'); one('snapshot', source.run);
    put(join(source.run, 'final-review.md'), 'CLEAN — independent fixture review');
    put(join(source.run, 'final-review-result.json'), { ok: true, findings: 'CLEAN — independent fixture review' });
    one('final-review-record', source.run); one('pause', source.run);
    return source;
  };
  const context = (id: string) => {
    const ctx = JSON.parse(readFileSync(ok('integration-start', run, id), 'utf8'));
    expect(ctx.root).toBe(join(root, '.trees', basename(run) + '-integrate-' + id));
    expect(git(root, 'check-ignore', ctx.root)).toBe(ctx.root);
    expect(ctx.reportDirectory.startsWith(run + '/')).toBe(true);
    expect(ctx.root.startsWith(run + '/')).toBe(false);
    return ctx;
  };
  const merge = (ctx: any) => git(ctx.root, ...ctx.mergeArgv.slice(1));
  const verdict = (ctx: any, value = { ok: true, findings: 'CLEAN — inspected combined regression and gates' }) => put(ctx.verdictPath, value);
  return { root, bare, base, run, bugs, put, call, ok, one, state, plan, startSource, verified, context, merge, verdict, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe('deterministic four-lane bug batch controller', () => {
  it('claims the common lease, requires clean main and refuses standalone overlap', () => {
    const f = fixture();
    try {
      expect(JSON.parse(readFileSync(join(f.root, '.pi/tmp/fix-bug.lock/owner.json'), 'utf8'))).toEqual({ run: f.run, kind: 'batch' });
      expect(f.state()).toMatchObject({ version: 1, root: f.root, base: f.base, jobs: {} });
      expect(f.call('start').stderr).toContain('lease');
      const standalone = spawnSync(process.execPath, [single, 'init', '1'], { cwd: f.root, encoding: 'utf8' });
      expect(standalone.status).not.toBe(0); expect(standalone.stderr).toContain('owns the checkout');
      f.ok('finish', f.run);
      expect(existsSync(join(f.root, '.pi/tmp/fix-bug.lock'))).toBe(false);
      f.put(join(f.root, 'src/value-1.js'), 'dirty'); expect(f.call('start').stderr).toContain('clean');
      git(f.root, 'restore', 'src/value-1.js'); git(f.root, 'switch', '-c', 'other'); expect(f.call('start').stderr).toContain('main');
    } finally { f.cleanup(); }
  });

  it('finishes an empty inventory without a planner or jobs and preserves its catalog', () => {
    const f = fixture(0);
    try {
      expect(f.ok('catalog', f.run)).toBe('EMPTY'); f.ok('finish', f.run);
      expect(f.state().jobs).toEqual({}); expect(JSON.parse(f.ok('report', f.run)).finished).toBe(true);
      expect(existsSync(join(f.run, 'catalog.json'))).toBe(true);
    } finally { f.cleanup(); }
  });

  it('rejects post-acceptance plan drift before any job is scheduled', () => {
    const f = fixture(1);
    try {
      f.plan(); const path = join(f.run, 'plan.json'); f.put(path, readFileSync(path, 'utf8') + ' ');
      expect(f.call('next', f.run).stderr).toContain('changed accepted plan'); expect(f.state().jobs).toEqual({});
    } finally { f.cleanup(); }
  });

  it('freezes reports, referenced closed status and source context with absolute paths', () => {
    const f = fixture(2);
    try {
      const path = f.ok('catalog', f.run); const bytes = readFileSync(path, 'utf8'); const catalog = JSON.parse(bytes);
      expect(catalog.open.map((r: any) => r.id)).toEqual(['0001', '0002']);
      expect(catalog.related[0]).toMatchObject({ id: '9999', status: 'fixed' });
      expect(catalog.sources.map((s: any) => s.path)).toEqual(['src/value-1.js', 'src/value-2.js']);
      for (const r of [...catalog.reports, ...catalog.sources]) expect(r.snapshot.startsWith(f.run + '/')).toBe(true);
      expect(f.ok('catalog', f.run)).toBe(path); expect(readFileSync(path, 'utf8')).toBe(bytes);
      f.put(join(f.root, 'src/value-1.js'), 'changed');
      f.put(join(f.run, 'plan.json'), { bugs: f.bugs, guidance: [] });
      expect(f.call('plan', f.run).status).not.toBe(0);
      expect(readFileSync(catalog.sources[0].snapshot, 'utf8')).toContain('value = 1');
    } finally { f.cleanup(); }
  });

  it.each(['missing', 'duplicate', 'unknown dependency', 'cycle', 'traversal', 'absolute', 'not boolean'])('rejects %s plans atomically', shape => {
    const f = fixture(3);
    try {
      f.ok('catalog', f.run); const bugs: any[] = structuredClone(f.bugs);
      if (shape === 'missing') bugs.pop();
      if (shape === 'duplicate') bugs[1] = bugs[0];
      if (shape === 'unknown dependency') bugs[0].dependencies = ['8888'];
      if (shape === 'cycle') { bugs[0].dependencies = ['0002']; bugs[1].dependencies = ['0001']; }
      if (shape === 'traversal') bugs[0].files = ['src/../../outside'];
      if (shape === 'absolute') bugs[0].files = ['/tmp/outside'];
      if (shape === 'not boolean') bugs[0].ready = 'true';
      f.put(join(f.run, 'plan.json'), { bugs, guidance: [] });
      expect(f.call('plan', f.run).status).not.toBe(0); expect(f.state().planDigest).toBeUndefined(); expect(f.state().jobs).toEqual({});
    } finally { f.cleanup(); }
  });

  it('detects a stale catalog even after changes have been committed', () => {
    const f = fixture(2);
    try {
      f.ok('catalog', f.run); f.put(join(f.root, 'docs/bugs/0001-example.md'), '- **Status:** open — new scope\n');
      git(f.root, 'add', '.'); git(f.root, 'commit', '-m', 'external update');
      f.put(join(f.run, 'plan.json'), { bugs: f.bugs, guidance: [] });
      expect(f.call('plan', f.run).stderr).toContain('changed'); expect(f.state().planDigest).toBeUndefined();
    } finally { f.cleanup(); }
  });

  it('schedules four unique immutable jobs greedily minimizing overlap, never repeats or exceeds capacity', () => {
    const f = fixture();
    try {
      f.bugs[1]!.files = ['src/value-1.js']; f.plan();
      const jobs = f.ok('next', f.run).split('\n');
      expect(jobs.map(path => JSON.parse(readFileSync(path, 'utf8')).id)).toEqual(['0001', '0003', '0004', '0005']);
      expect(JSON.parse(readFileSync(jobs[0]!, 'utf8'))).toEqual({ version: 1, batchRun: f.run, ownerRoot: f.root, id: '0001', base: f.base, review_rounds: 5 });
      expect(f.ok('next', f.run)).toBe('DONE'); expect(Object.keys(f.state().jobs)).toHaveLength(4);
      expect(f.call('finish', f.run).stderr).toContain('active');
      expect(f.ok('collect', f.run, '0001')).toBe('BLOCKED');
      expect(f.ok('next', f.run).split('/').pop()).toBe('0002.json');
      expect(f.call('collect', f.run, '0001').status).not.toBe(0);
      const original = readFileSync(jobs[1]!, 'utf8'); f.put(jobs[1]!, original + ' ');
      expect(f.call('collect', f.run, '0003').stderr).toContain('manifest changed');
    } finally { f.cleanup(); }
  });

  it('excludes not-ready predecessors, propagates blocks, and permits resolved historical dependencies', () => {
    const f = fixture(5);
    try {
      f.bugs[0]!.ready = false; f.bugs[0]!.reason = 'Pending owner contract decision';
      f.bugs[1]!.dependencies = ['0001']; f.bugs[2]!.dependencies = ['0002']; f.bugs[3]!.dependencies = ['9999']; f.bugs[4]!.dependencies = ['0004'];
      f.plan(); expect(f.ok('next', f.run)).toBe(join(f.run, 'jobs/0004.json'));
      expect(f.state().outcomes).toMatchObject({ '0001': { status: 'excluded' }, '0002': { status: 'blocked' }, '0003': { status: 'blocked' } });
      expect(f.ok('collect', f.run, '0004')).toBe('BLOCKED'); expect(f.ok('next', f.run)).toBe('DONE');
      expect(f.state().outcomes['0005'].status).toBe('blocked'); f.ok('finish', f.run);
      const report = JSON.parse(f.ok('report', f.run)); expect(report.finished).toBe(true); expect(report.bugs).toHaveLength(5);
      expect(existsSync(join(f.run, 'catalog.json'))).toBe(true);
    } finally { f.cleanup(); }
  });

  it('collects only the exact bound source run and requires the helper final verification', () => {
    const f = fixture(2);
    try {
      f.plan(); f.ok('next', f.run); const source = f.startSource('0001'); f.one('pause', source.run);
      expect(f.ok('collect', f.run, '0001')).toBe('BLOCKED');
      expect(f.state().jobs['0001'].reason).toContain('Missing final verification'); expect(existsSync(source.root)).toBe(true);
      const fake = join(f.root, '.pi/tmp/fix-bug-0002-foreign'); f.put(join(fake, 'state.json'), { batchRun: f.run + '-other', id: '0002' });
      expect(f.ok('collect', f.run, '0002')).toBe('BLOCKED'); expect(f.state().jobs['0002'].sourceRun).toBeUndefined();
    } finally { f.cleanup(); }
  });

  it('accepts verified evidence, gates the final committed merge, pushes only it and cleans only successful .trees worktrees', () => {
    const f = fixture(2, true);
    try {
      f.plan(); f.ok('next', f.run); const source = f.verified('0001');
      const retained = f.startSource('0002'); f.one('pause', retained.run);
      expect(f.ok('collect', f.run, '0002')).toBe('BLOCKED');
      expect(f.ok('collect', f.run, '0001')).toBe('VERIFIED');
      const ctx = f.context('0001'); expect(ctx.base).toBe(f.base); expect(ctx.root).not.toBe(source.root);
      expect(git(f.root, 'rev-parse', 'HEAD')).toBe(f.base); f.merge(ctx); f.verdict(ctx);
      expect(f.call('integrate-record', f.run, '0001').stderr).toContain('fresh integration gate');
      expect(f.ok('integration-gate', f.run, '0001')).toBe('PASS');
      const gate = JSON.parse(readFileSync(ctx.gatePath, 'utf8')); expect(gate.commands.slice(0, 2)).toEqual([['npm', 'run', 'typecheck'], ['npm', 'test']]);
      expect(gate.commands).toHaveLength(3); expect(gate.results).toHaveLength(3);
      expect(git(f.root, 'rev-parse', 'HEAD')).toBe(f.base);
      f.ok('integrate-record', f.run, '0001'); const sha = f.state().base;
      expect(sha).not.toBe(f.base); expect(git(f.bare, 'rev-parse', 'refs/heads/main')).toBe(sha);
      expect(git(f.root, 'rev-parse', 'HEAD')).toBe(sha); expect(git(f.root, 'status', '--porcelain')).toBe('');
      expect(existsSync(source.root)).toBe(false); expect(existsSync(ctx.root)).toBe(false); expect(existsSync(source.run)).toBe(true);
      const worktrees = git(f.root, 'worktree', 'list', '--porcelain');
      expect(worktrees).not.toContain(source.root); expect(worktrees).not.toContain(ctx.root);
      expect(existsSync(retained.root)).toBe(true); expect(worktrees).toContain(retained.root);
      expect(git(f.root, 'branch', '--list', source.state().branch)).toBe('');
      expect(git(f.root, 'branch', '--list', ctx.branch)).toBe('');
      expect(git(f.root, 'branch', '--list', retained.state().branch)).not.toBe('');
      expect(existsSync(join(ctx.reportDirectory, 'integration.json'))).toBe(true);
      expect(f.state().jobs['0001']).toMatchObject({ status: 'integrated', shipment: { pushed: true, cleaned: true } });
      expect(f.ok('next', f.run)).toBe('DONE'); f.ok('finish', f.run);
      expect(existsSync(join(f.run, 'report.json'))).toBe(true); expect(existsSync(join(f.root, '.pi/tmp/fix-bug.lock'))).toBe(false);
    } finally { f.cleanup(); }
  }, 30000);

  it('integrates independent same-wave jobs sequentially after owner main advances, then schedules dependents on current main', () => {
    const f = fixture(3, true);
    try {
      f.bugs[2]!.dependencies = ['0001', '0002']; f.plan();
      expect(f.ok('next', f.run).split('\n')).toHaveLength(2);
      const first = f.verified('0001'); const second = f.verified('0002');
      expect(f.ok('collect', f.run, '0001')).toBe('VERIFIED');
      const ctx1 = f.context('0001'); f.merge(ctx1); f.ok('integration-gate', f.run, '0001'); f.verdict(ctx1); f.ok('integrate-record', f.run, '0001');
      const advanced = f.state().base; expect(advanced).not.toBe(f.base);
      const secondCollection = f.ok('collect', f.run, '0002');
      expect(secondCollection, f.state().jobs['0002'].reason).toBe('VERIFIED');
      const ctx2 = f.context('0002'); expect(ctx2.base).toBe(advanced); expect(ctx2.commands).toHaveLength(4);
      f.merge(ctx2); f.ok('integration-gate', f.run, '0002'); f.verdict(ctx2); f.ok('integrate-record', f.run, '0002');
      const next = JSON.parse(readFileSync(f.ok('next', f.run), 'utf8'));
      expect(next).toMatchObject({ id: '0003', base: f.state().base }); expect(next.base).not.toBe(advanced);
      expect(existsSync(first.root)).toBe(false); expect(existsSync(second.root)).toBe(false);
    } finally { f.cleanup(); }
  }, 30000);

  it('serializes integration transactions and refuses an unmerged or conflicted checkout', () => {
    const f = fixture(2, true);
    try {
      f.plan(); f.ok('next', f.run); f.verified('0001'); f.verified('0002');
      f.ok('collect', f.run, '0001'); f.ok('collect', f.run, '0002'); const ctx = f.context('0001');
      expect(f.call('integration-start', f.run, '0002').stderr).toContain('already active');
      expect(f.state().jobs['0002'].status).toBe('verified');
      expect(f.call('integration-gate', f.run, '0001').stderr).toContain('both the latest base and verified source');
      // Create a real divergent edit in the integration tree and leave Git's
      // conflict intact. The controller must neither resolve nor abort it.
      f.put(join(ctx.root, 'src/value-1.js'), 'export const value = 3;\n'); git(ctx.root, 'add', '.'); git(ctx.root, 'commit', '-m', 'integration-side conflicting change');
      const merge = spawnSync('git', ctx.mergeArgv.slice(1), { cwd: ctx.root, encoding: 'utf8' }); expect(merge.status).not.toBe(0);
      expect(f.call('integration-gate', f.run, '0001').stderr).toContain('clean');
      expect(git(ctx.root, 'diff', '--name-only', '--diff-filter=U')).toBe('src/value-1.js');
      expect(f.call('finish', f.run).status).not.toBe(0); expect(git(f.root, 'rev-parse', 'HEAD')).toBe(f.base);
    } finally { f.cleanup(); }
  }, 30000);

  it('classifies a genuine pending owner decision without treating it as verified or cleaning it', () => {
    const f = fixture(2);
    try {
      f.bugs[1]!.dependencies = ['0001']; f.plan(); f.ok('next', f.run); const source = f.startSource('0001');
      f.one('begin', source.run, 'implement');
      f.put(join(source.run, 'implement.md'), 'Two valid compatibility policies remain; owner decision required.');
      f.put(join(source.run, 'decision-request.md'), 'Authorize only the local legacy test expectation correction; no production policy change.');
      f.put(join(source.run, 'stage-implement-result.txt'), 'needs_decision\nExact scoped owner choice remains');
      f.one('record', source.run, 'implement'); const context = f.one('decision-start', source.run, 'implement');
      f.put(context + '.verdict.json', { disposition: 'human', clear_preference: false, has_tradeoff: true, evidence_sufficient: true,
        summary: 'Two materially valid compatibility policies remain.', recommendation: 'Prefer the narrow compatibility correction.',
        rationale: 'There is no established owner policy selecting between these valid outcomes.', basis: ['docs/bugs/0001-example.md:1'],
        alternatives: ['Preserve legacy compatibility.', 'Use the new compatibility boundary.'] });
      f.one('decision-record', source.run, context); f.one('pause', source.run);
      expect(f.ok('collect', f.run, '0001')).toBe('PENDING'); expect(f.state().jobs['0001'].status).toBe('pending-approval');
      expect(f.ok('next', f.run)).toBe('DONE'); expect(f.state().outcomes['0002'].status).toBe('blocked');
      f.ok('finish', f.run); expect(existsSync(source.root)).toBe(true); expect(existsSync(join(source.run, 'decision-authorizations.md'))).toBe(true);
    } finally { f.cleanup(); }
  });

  it('retains all source and integration artifacts on rejected push without moving owner main', () => {
    const f = fixture(1, true);
    try {
      f.plan(); f.ok('next', f.run); const source = f.verified('0001'); f.ok('collect', f.run, '0001'); const ctx = f.context('0001'); f.merge(ctx);
      f.ok('integration-gate', f.run, '0001'); f.verdict(ctx);
      f.put(join(f.bare, 'hooks/pre-receive'), '#!/bin/sh\nexit 1\n');
      spawnSync('chmod', ['+x', join(f.bare, 'hooks/pre-receive')]);
      expect(f.call('integrate-record', f.run, '0001').stderr).toContain('push failed');
      expect(git(f.root, 'rev-parse', 'HEAD')).toBe(f.base); expect(git(f.bare, 'rev-parse', 'refs/heads/main')).toBe(f.base);
      expect(existsSync(source.root)).toBe(true); expect(existsSync(ctx.root)).toBe(true); expect(existsSync(join(f.run, 'integration.lock'))).toBe(true);
      const worktrees = git(f.root, 'worktree', 'list', '--porcelain');
      expect(worktrees).toContain(source.root); expect(worktrees).toContain(ctx.root);
      expect(git(f.root, 'branch', '--list', source.state().branch)).not.toBe('');
      expect(git(f.root, 'branch', '--list', ctx.branch)).not.toBe('');
      expect(existsSync(join(source.run, 'state.json'))).toBe(true);
      expect(existsSync(join(ctx.reportDirectory, 'integration.json'))).toBe(true);
      expect(git(f.root, 'status', '--porcelain')).toBe('');
      expect(f.call('finish', f.run).status).not.toBe(0); expect(f.call('integration-start', f.run, '0001').status).not.toBe(0);
    } finally { f.cleanup(); }
  }, 30000);

  it('does not release the shared lease for ambiguous/uncollected active source hosts', () => {
    const f = fixture(1);
    try {
      f.plan(); f.ok('next', f.run); const source = f.startSource('0001');
      const extra = join(f.root, '.pi/tmp/fix-bug-0001-00000000-0000-0000-0000-000000000001');
      f.put(join(extra, 'state.json'), { ...source.state(), root: join(f.root, '.trees', basename(extra)) });
      f.put(join(extra, 'active/owner.json'), { pid: process.pid });
      expect(f.ok('collect', f.run, '0001')).toBe('BLOCKED');
      expect(f.state().jobs['0001'].sourceRun).toBeUndefined();
      expect(f.ok('next', f.run)).toBe('DONE');
      expect(f.call('finish', f.run).stderr).toContain('still marked active');
      expect(existsSync(join(f.root, '.pi/tmp/fix-bug.lock'))).toBe(true);
      expect(existsSync(join(source.run, 'active'))).toBe(true);
      expect(existsSync(join(extra, 'active'))).toBe(true);
    } finally { f.cleanup(); }
  });

  it('reports a successful push with incomplete consumer update and preserves that error across finish refusal', () => {
    const f = fixture(1, true, true);
    try {
      f.plan(); f.ok('next', f.run); f.verified('0001'); f.ok('collect', f.run, '0001');
      const ctx = f.context('0001'); f.merge(ctx); f.ok('integration-gate', f.run, '0001'); f.verdict(ctx);
      const result = spawnSync(process.execPath, [helper, 'integrate-record', f.run, '0001'], {
        cwd: f.root, encoding: 'utf8', env: { ...process.env, HOME: join(f.root, '.pi/tmp/empty-home') },
      });
      expect(result.status).not.toBe(0); expect(result.stderr).toContain('Pushed successfully');
      const job = f.state().jobs['0001'];
      expect(job.shipment).toMatchObject({ pushed: true, cleaned: false, piConfig: { status: 'incomplete' } });
      expect(git(f.bare, 'rev-parse', 'refs/heads/main')).toBe(job.shipment.sha);
      expect(f.call('finish', f.run).status).not.toBe(0);
      const report = JSON.parse(f.ok('report', f.run));
      expect(report.lastError).toMatchObject({ op: 'integrate-record' });
      expect(report.lastError.message).toContain('Pushed successfully');
      expect(report.finishError.op).toBe('finish');
      const text = f.ok('render-report', f.run);
      expect(text).toContain('PUSHED ' + job.shipment.sha);
      expect(text).toContain('INCOMPLETE. Do not rerun shipment blindly.');
      expect(existsSync(ctx.root)).toBe(true);
      expect(existsSync(join(f.root, '.pi/tmp/fix-bug.lock'))).toBe(true);
    } finally { f.cleanup(); }
  }, 30000);

  it('fails closed on post-gate edits, new commits, boolean-like prose and gate-log tampering', () => {
    const f = fixture(1, true);
    try {
      f.plan(); f.ok('next', f.run); f.verified('0001'); f.ok('collect', f.run, '0001'); const ctx = f.context('0001'); f.merge(ctx);
      f.ok('integration-gate', f.run, '0001'); f.verdict(ctx, { ok: 'true' as any, findings: 'PASS CLEAN' });
      expect(f.call('integrate-record', f.run, '0001').stderr).toContain('verdict'); f.verdict(ctx);
      const gate = JSON.parse(readFileSync(ctx.gatePath, 'utf8')); const log = gate.results[0].path; const original = readFileSync(log, 'utf8');
      f.put(log, original + ' '); expect(f.call('integrate-record', f.run, '0001').stderr).toContain('log changed'); f.put(log, original);
      f.put(join(ctx.root, 'src/value-1.js'), 'export const value = 3;\n'); expect(f.call('integrate-record', f.run, '0001').stderr).toContain('clean');
      git(ctx.root, 'add', '.'); git(ctx.root, 'commit', '-m', 'post-gate drift');
      expect(f.call('integrate-record', f.run, '0001').stderr).toContain('fresh integration gate');
      expect(f.call('integration-gate', f.run, '0001').stderr).toContain('gate failed');
      expect(f.state().jobs['0001'].gateDigest).toBeUndefined(); expect(git(f.root, 'rev-parse', 'HEAD')).toBe(f.base);
    } finally { f.cleanup(); }
  }, 30000);
});
