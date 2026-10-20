#!/usr/bin/env node
// Local workflow control plane. Models supply evidence/plans, never Git release authority.
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync, renameSync, realpathSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function command(argv, cwd, timeout = 30 * 60 * 1000) {
  if (!Array.isArray(argv) || !argv.length || argv.some(x => typeof x !== 'string')) throw new Error('Command must be a nonempty argv array');
  const r = spawnSync(argv[0], argv.slice(1), { cwd, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024 });
  return { code: r.error || r.signal ? -1 : r.status, output: (r.stdout ?? '') + (r.stderr ?? ''), error: r.error?.message };
}
function git(root, ...args) {
  const r = command(['git', ...args], root);
  if (r.code !== 0) throw new Error(`git ${args[0]} failed: ${r.output}`);
  return r.output.trim();
}
function json(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function save(path, value) {
  const temporary = path + '.' + randomUUID() + '.tmp';
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n');
  renameSync(temporary, path);
}
function stateRevision(state) { return { revision: state.revision ?? 0, generation: state.generation ?? 0 }; }
function persistState(run, state, expected) {
  const guard = join(run, 'state-write');
  try { mkdirSync(guard); } catch { throw new Error('Another state write is in progress; reconcile a stale state-write marker only after all commands stopped'); }
  try {
    const current = stateRevision(json(join(run, 'state.json')));
    if (current.revision !== expected.revision || current.generation !== expected.generation) throw new Error('Stale controller invocation: state changed while this command was running');
    state.revision = expected.revision + 1;
    save(join(run, 'state.json'), state);
    Object.assign(expected, stateRevision(state));
  } finally { rmSync(guard, { recursive: true }); }
}
function changes(root) {
  const tracked = git(root, 'diff', '--name-only', 'HEAD', '-z').split('\0');
  const extra = git(root, 'ls-files', '--others', '--exclude-standard', '-z').split('\0');
  return [...new Set([...tracked, ...extra].filter(Boolean))].sort();
}
function digest(root, paths) {
  return createHash('sha256').update(paths.map(p => p + '\0' + (existsSync(join(root, p)) ? readFileSync(join(root, p)).toString('base64') : '<deleted>')).join('\0')).digest('hex');
}
function specFiles(root) {
  return git(root, 'ls-files', '-z', '--', 'docs/spec.md', 'docs/spec_topics', 'docs/reference').split('\0').filter(Boolean);
}
export function validateWitnesses(value) {
  if (!Array.isArray(value.e2e) || value.e2e.length === 0) throw new Error('At least one end-to-end witness is mandatory');
  if (!Array.isArray(value.unit)) throw new Error('unit must be an array');
  if (!value.unit.length && !value.unit_omission_reason?.trim()) throw new Error('Explain why unit isolation is not meaningful');
  for (const w of [...value.e2e, ...value.unit]) {
    if (!Array.isArray(w.argv) || !w.argv.length || w.argv.some(x => typeof x !== 'string')) throw new Error('Witness argv required');
    if (typeof w.failure_pattern !== 'string' || !w.failure_pattern.trim()) throw new Error('Specific assertion failure pattern required');
    new RegExp(w.failure_pattern);
  }
  if (typeof value.live_required !== 'boolean' || !Array.isArray(value.live)) throw new Error('Declare live_required and live argv arrays');
  if (value.live_required && !value.live.length) throw new Error('Live-exercised changes require live commands');
}
export function approved(text, label) { return text.trim() === `User selected: 2. ${label}`; }
export function parseBugRequest(text) {
  const words = text.trim().split(/\s+/);
  const resume = words[0] === 'resume';
  let start = 1;
  let id = resume ? '' : words[0];
  if (resume && /^\d{1,4}$/.test(words[1] ?? '')) { id = words[1]; start = 2; }
  if (!resume && !/^\d{1,4}$/.test(id ?? '')) throw new Error('Usage: /fix-bug [number | resume [number]] [ship true|false] [review_rounds 1..5]');
  let ship = resume ? 'keep' : 'true'; let rounds = resume ? 'keep' : '5'; const seen = new Set();
  for (let i = start; i < words.length; i += 2) {
    const key = words[i]; const value = words[i + 1];
    if (seen.has(key)) throw new Error('Duplicate option: ' + key);
    seen.add(key);
    if (key === 'ship' && /^(true|false)$/.test(value ?? '')) ship = value;
    else if (key === 'review_rounds' && /^[1-5]$/.test(value ?? '')) rounds = value;
    else throw new Error('Invalid option/value: ' + key);
  }
  return [resume ? 'RESUME' : 'FIX', id ? id.padStart(4, '0') : '', ship, rounds].join('\n');
}
export function listOpenBugs(root) {
  const directory = join(root, 'docs/bugs');
  return readdirSync(directory).sort().flatMap(name => {
    const match = /^(\d{4})-(.+)\.md$/.exec(name);
    if (!match) return [];
    const report = readFileSync(join(directory, name), 'utf8');
    if (!/^- \*\*Status:\*\* open\b/m.test(report)) return [];
    // The report filenames carry concise stable descriptions, unlike the often
    // paragraph-long headings. Do not ask a model to invent a summary or status.
    const description = match[2].replaceAll('-', ' ');
    return [`${match[1]} ${description}`];
  }).join('\n') || 'No open bugs.';
}
const PHASES = new Set(['reproduce', 'diagnose', 'plan', 'implement', 'repair', 'close']);
function controlPaths(root) {
  return ['tools/bugfix/run.mjs', '.pi/theta/fix-bug.theta', '.pi/theta/workers/bugfix-stage.theta', '.pi/theta/workers/bugfix-review.theta'].filter(p => existsSync(join(root, p)));
}
function stagePaths(phase) { return [`stage-${phase}-result.txt`, `${phase}.md`, ...(phase === 'plan' ? ['spec-proposal.md'] : [])]; }
function redEvidence(run, state) {
  if (digest(run, ['witnesses.json']) !== state.witnessDigest) throw new Error('Witness commands/signatures changed after baseline');
  const w = json(join(run, 'witnesses.json')); validateWitnesses(w);
  [...w.e2e, ...w.unit].forEach((item, index) => {
    const r = json(join(run, `red-${index}.json`));
    if (JSON.stringify(item.argv) !== JSON.stringify(r.argv) || !Number.isInteger(r.code) || r.code <= 0 || typeof r.output !== 'string' || !new RegExp(item.failure_pattern).test(r.output)) throw new Error('Recorded red evidence is missing or invalid');
  });
}
function activate(run, pidText) {
  const pid = Number(pidText);
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('A real host pid is required for active-run ownership');
  const activation = join(run, 'activation');
  try { mkdirSync(activation); } catch { throw new Error('Another activation is in progress; inspect a stale activation marker only after confirming all invocations stopped.'); }
  try {
    const active = join(run, 'active');
    if (existsSync(active)) {
      const owner = json(join(active, 'owner.json'));
      if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw new Error('Invalid active-run owner; reconcile the marker manually');
      throw new Error('This run is still marked active. Even a dead host may have surviving workers/gates. Confirm ALL workflow subprocesses stopped, then manually pause its marker.');
    }
    mkdirSync(active);
    const token = randomUUID();
    save(join(active, 'owner.json'), { pid, token });
    return token;
  } finally { rmSync(activation, { recursive: true }); }
}
function resumeRun(cwd, request, pidText) {
  const root = git(cwd, 'rev-parse', '--show-toplevel');
  const [mode, id, ship, rounds] = parseBugRequest(request).split('\n');
  if (mode !== 'RESUME') throw new Error('Expected a resume request');
  const lock = join(root, '.pi/tmp/fix-bug.lock');
  if (!existsSync(join(lock, 'owner.json'))) throw new Error('No paused run owns this checkout; resume does not guess from old artifact directories.');
  const run = realpathSync(json(join(lock, 'owner.json')).run);
  if (!run.startsWith(join(realpathSync(root), '.pi/tmp/fix-bug-'))) throw new Error('Run directory is outside this checkout');
  const token = activate(run, pidText); // acquire before reading/validating authoritative state
  try {
  if (realpathSync(json(join(lock, 'owner.json')).run) !== run) throw new Error('Checkout lease changed during resume');
  const state = json(join(run, 'state.json'));
  const expected = stateRevision(state);
  if (state.root !== root || (id && id !== state.id)) throw new Error('Requested run does not match this checkout or bug number');
  if (git(root, 'rev-parse', 'HEAD') !== state.base || git(root, 'branch', '--show-current') !== state.branch) throw new Error('HEAD/branch changed; cannot resume this run');
  if (existsSync(join(run, 'shipment.json')) && json(join(run, 'shipment.json')).pushed) throw new Error('This run has already shipped; it cannot be resumed');
  if (state.resumeVersion !== 1 || !state.checkpoints) throw new Error('This legacy run predates resumable checkpoints. Continue its recorded manual handoff; do not infer progress from report files.');
  if (JSON.stringify(controlPaths(root)) !== JSON.stringify(state.controlPaths) || digest(root, state.controlPaths) !== state.controlDigest) throw new Error('Workflow/control files changed since this run started; reconcile manually before resuming');
  const touched = changes(root);
  if (!state.specApproved && (touched.some(p => p === 'docs/spec.md' || p.startsWith('docs/spec_topics/') || p.startsWith('docs/reference/')) || digest(root, specFiles(root)) !== state.spec)) throw new Error('Specification changed without owner approval');
  if (state.stages.includes('red')) redEvidence(run, state);
  for (const [phase, checkpoint] of Object.entries(state.checkpoints)) {
    if (!PHASES.has(phase)) throw new Error('Unknown recorded checkpoint');
    if (['pass', 'needs_spec'].includes(checkpoint.status) && digest(run, stagePaths(phase)) !== checkpoint.reportDigest) throw new Error('Completed stage report/result changed: ' + phase + '; reconcile the handoff explicitly');
  }
  const options = state.options;
  if (!options || typeof options.ship !== 'boolean' || !Number.isInteger(options.review_rounds) || options.review_rounds < 1 || options.review_rounds > 5) throw new Error('Invalid saved workflow options');
  if (ship !== 'keep') options.ship = ship === 'true';
  if (rounds !== 'keep') options.review_rounds = Number(rounds);
  state.generation = (state.generation ?? 0) + 1;
  state.resumeCount = (state.resumeCount ?? 0) + 1;
  // Keep audit history, but require fresh gates and a fresh shipment decision.
  state.resumeHistory = [...(state.resumeHistory ?? []), { number: state.resumeCount, priorStages: state.stages }];
  state.stages = state.stages.filter(s => s === 'red');
  delete state.verifiedPaths; delete state.verifiedDigest;
  const history = join(run, 'history'); mkdirSync(history, { recursive: true });
  for (const file of ['evidence-review.md', 'reviews.md', 'final-review.md', 'ship-answer.txt']) {
    if (existsSync(join(run, file))) copyFileSync(join(run, file), join(history, `resume-${state.resumeCount}-before-${file}`));
  }
  persistState(run, state, expected);
  rmSync(join(run, 'ship-answer.txt'), { force: true });
  return run;
  } catch (error) {
    const owner = join(run, 'active/owner.json');
    if (existsSync(owner) && json(owner).token === token) rmSync(join(run, 'active'), { recursive: true, force: true });
    throw error;
  }
}
function witnessRuns(root, run, mode) {
  const w = json(join(run, 'witnesses.json')); validateWitnesses(w);
  let index = 0;
  for (const item of [...w.e2e, ...w.unit]) {
    const r = command(item.argv, root);
    save(join(run, `${mode}-${index++}.json`), { argv: item.argv, ...r });
    if (mode === 'red') {
      if (r.code <= 0 || !new RegExp(item.failure_pattern).test(r.output)) throw new Error('Witness did not fail with its pinned assertion signature; inspect red logs');
    } else if (r.code !== 0) throw new Error('Witness failed after fix; inspect green logs');
  }
  return w;
}
export function main(args, cwd = process.cwd()) {
  let [op, arg, phase, extra] = args;
  let startOptions;
  if (op === 'start-file') {
    const [mode, id, ship, rounds] = parseBugRequest(readFileSync(resolve(cwd, arg), 'utf8')).split('\n');
    if (mode !== 'FIX') throw new Error('Expected a new numbered bug request');
    startOptions = { ship: ship === 'true', review_rounds: Number(rounds) };
    arg = id; op = 'init';
  }
  if (op === 'request') {
    const root = git(cwd, 'rev-parse', '--show-toplevel');
    mkdirSync(join(root, '.pi/tmp'), { recursive: true });
    const path = join(root, '.pi/tmp', `bugfix-request-${randomUUID()}.txt`);
    writeFileSync(path, '', { flag: 'wx' });
    console.log(path); return;
  }
  if (op === 'resume-file') { console.log(resumeRun(cwd, readFileSync(resolve(cwd, arg), 'utf8'), phase)); return; }
  if (op === 'parse-file') { console.log(parseBugRequest(readFileSync(resolve(cwd, arg), 'utf8'))); return; }
  if (op === 'list') {
    const root = git(cwd, 'rev-parse', '--show-toplevel');
    console.log(listOpenBugs(root)); return;
  }
  if (op === 'init-file') { arg = readFileSync(resolve(cwd, arg), 'utf8').trim(); op = 'init'; }
  if (op === 'init') {
    if (!/^\d{1,4}$/.test(arg ?? '')) throw new Error('Bug number must contain 1–4 digits');
    const root = git(cwd, 'rev-parse', '--show-toplevel');
    if (git(root, 'status', '--porcelain')) throw new Error('Working tree must be clean. Commit or intentionally resolve existing changes first.');
    const id = arg.padStart(4, '0');
    const files = readdirSync(join(root, 'docs/bugs')).filter(p => p.startsWith(id + '-') && p.endsWith('.md') && !p.includes('investigation'));
    if (files.length !== 1) throw new Error('Expected exactly one numbered bug report');
    const bug = 'docs/bugs/' + files[0];
    if (!/^- \*\*Status:\*\* open\b/m.test(readFileSync(join(root, bug), 'utf8'))) throw new Error('Bug is not marked open');
    const branch = git(root, 'branch', '--show-current');
    if (!branch) throw new Error('Detached HEAD is not supported');
    const run = join(root, '.pi/tmp', `fix-bug-${id}-${randomUUID()}`);
    mkdirSync(run, { recursive: true });
    const lock = join(root, '.pi/tmp/fix-bug.lock');
    try { mkdirSync(lock); } catch { throw new Error('Another bug workflow owns the checkout; inspect .pi/tmp/fix-bug.lock/owner.json and release only after it has stopped'); }
    try {
      const controls = controlPaths(root);
      // start-file is the interactive entry: publish the lease owner only AFTER
      // the original options and active execution claim are durable. Raw init is
      // retained for administrative/test creation of an explicitly paused run.
      if (startOptions) activate(run, phase);
      save(join(run, 'state.json'), { root, bug, id, branch, base: git(root, 'rev-parse', 'HEAD'), spec: digest(root, specFiles(root)), stages: [], resumeVersion: 1, revision: 0, generation: startOptions ? 1 : 0, checkpoints: {}, options: startOptions ?? { ship: true, review_rounds: 5 }, controlPaths: controls, controlDigest: digest(root, controls) });
      save(join(lock, 'owner.json'), { run });
    } catch (error) {
      rmSync(join(run, 'active'), { recursive: true, force: true });
      rmSync(lock, { recursive: true });
      throw error;
    }
    console.log(run); return;
  }
  const run = resolve(arg ?? '');
  const state = json(join(run, 'state.json')); const root = state.root;
  const expected = stateRevision(state);
  const persist = () => persistState(run, state, expected);
  if (root !== git(cwd, 'rev-parse', '--show-toplevel')) throw new Error('Run belongs to another checkout');
  if (op === 'pause') {
    state.generation = (state.generation ?? 0) + 1; // fence in-flight controllers before releasing execution ownership
    persist();
    rmSync(join(run, 'active'), { recursive: true, force: true });
    console.log('PASS'); return;
  }
  const lock = join(root, '.pi/tmp/fix-bug.lock');
  if (json(join(lock, 'owner.json')).run !== run) throw new Error('Run does not own this checkout');
  if (op === 'release') { rmSync(lock, { recursive: true }); console.log('PASS'); return; }
  if (git(root, 'rev-parse', 'HEAD') !== state.base || git(root, 'branch', '--show-current') !== state.branch) throw new Error('HEAD/branch changed during workflow; stop and inspect');
  const paths = changes(root);
  const specTouched = paths.some(p => p === 'docs/spec.md' || p.startsWith('docs/spec_topics/') || p.startsWith('docs/reference/'));
  if (!state.specApproved && (specTouched || digest(root, specFiles(root)) !== state.spec)) throw new Error('Specification changed without owner approval');
  if (op === 'enter') {
    activate(run, phase);
    state.generation = (state.generation ?? 0) + 1;
  } else if (op === 'configure') {
    if (existsSync(join(run, 'active'))) throw new Error('Cannot configure an active workflow; initialize atomically or change options on resume');
    if (!['true', 'false'].includes(phase) || !/^[1-5]$/.test(extra ?? '')) throw new Error('Invalid workflow options');
    state.options = { ship: phase === 'true', review_rounds: Number(extra) };
  } else if (op === 'info') {
    console.log([state.id, String(state.options.ship), String(state.options.review_rounds)].join('\n')); return;
  } else if (['cached', 'begin', 'record'].includes(op)) {
    if (!PHASES.has(phase) || state.resumeVersion !== 1) throw new Error('Unknown phase or legacy checkpoint format');
    const checkpoint = state.checkpoints[phase];
    if (op === 'cached') {
      const reusable = checkpoint?.status === 'pass' || (phase === 'plan' && checkpoint?.status === 'needs_spec');
      if (!reusable || ['repair', 'close'].includes(phase)) { console.log('RUN'); return; }
      if (digest(run, stagePaths(phase)) !== checkpoint.reportDigest) throw new Error('Completed stage report/result changed: ' + phase);
      if (phase === 'implement' && (digest(root, paths) !== checkpoint.checkoutDigest || checkpoint.planDigest !== state.checkpoints.plan?.reportDigest)) { console.log('RUN'); return; }
      console.log('PASS'); return;
    }
    if (op === 'begin') {
      const attempt = Math.max(checkpoint?.attempt ?? 0, state.phaseAttempts?.[phase] ?? 0) + 1;
      state.phaseAttempts = { ...(state.phaseAttempts ?? {}), [phase]: attempt };
      const history = join(run, 'history'); mkdirSync(history, { recursive: true });
      for (const file of stagePaths(phase)) if (existsSync(join(run, file))) copyFileSync(join(run, file), join(history, `${phase}-${attempt}-before-${file}`));
      state.checkpoints[phase] = { attempt, status: 'running' };
    } else {
      if (!checkpoint || checkpoint.status !== 'running') throw new Error('Stage did not begin');
      const text = readFileSync(join(run, `stage-${phase}-result.txt`), 'utf8');
      const [status, ...summary] = text.split('\n');
      if (!['pass', 'blocked', 'not_reproduced', 'needs_spec'].includes(status) || !summary.join('\n').trim()) throw new Error('Invalid stage result');
      if (status === 'needs_spec' && !['plan', 'implement', 'repair'].includes(phase)) throw new Error('This phase cannot request a specification transition');
      if (['pass', 'needs_spec'].includes(status) && !existsSync(join(run, `${phase}.md`))) throw new Error('Completed stage report is missing');
      if (phase === 'plan' && ['pass', 'needs_spec'].includes(status) && !existsSync(join(run, 'spec-proposal.md'))) throw new Error('Plan specification disposition is missing');
      state.checkpoints[phase] = { ...checkpoint, status, reportDigest: digest(run, stagePaths(phase)), checkoutDigest: digest(root, paths), ...(phase === 'implement' ? { planDigest: state.checkpoints.plan?.reportDigest } : {}) };
      if (['implement', 'repair'].includes(phase) && status === 'needs_spec') {
        if (!existsSync(join(run, 'spec-revision-proposal.md'))) throw new Error('Revised specification proposal is missing');
        const history = join(run, 'history'); mkdirSync(history, { recursive: true });
        for (const file of stagePaths('plan')) if (existsSync(join(run, file))) copyFileSync(join(run, file), join(history, `${phase}-${checkpoint.attempt}-before-replan-${file}`));
        delete state.checkpoints.plan;
        state.replanRequired = true; // next resume reruns PLAN + evidence review + exact owner decision
      }
      if (phase === 'plan' && ['pass', 'needs_spec'].includes(status)) state.replanRequired = false;
    }
  } else if (op === 'approved') {
    if (!state.specApproved || state.approvedProposal !== readFileSync(join(run, 'spec-proposal.md'), 'utf8')) throw new Error('No exact saved specification approval');
  } else if (op === 'approval') {
    if (!approved(readFileSync(join(run, 'spec-answer.txt'), 'utf8'), 'Approve proposed spec changes')) throw new Error('No explicit specification approval');
    state.specApproved = true;
    state.approvedProposal = readFileSync(join(run, 'spec-proposal.md'), 'utf8');
    if (!state.approvedProposal.trim()) throw new Error('Specification proposal is empty');
  } else if (op === 'red') {
    if (state.stages.includes('red')) {
      redEvidence(run, state); // reuse immutable original red proof, never rerun it on fixed production
    } else {
      if (paths.some(p => !p.startsWith('tests/'))) throw new Error('Reproduction/diagnosis may change tests only');
      witnessRuns(root, run, 'red'); state.stages.push('red');
      state.witnessDigest = digest(run, ['witnesses.json']);
    }
  } else if (op === 'gate') {
    if (!state.stages.includes('red')) throw new Error('Missing pre-fix red evidence');
    if (digest(run, ['witnesses.json']) !== state.witnessDigest) throw new Error('Witness commands/signatures changed after baseline');
    state.gateCount = (state.gateCount ?? 0) + 1;
    state.stages = state.stages.filter(s => s !== 'gate-final');
    delete state.verifiedPaths; delete state.verifiedDigest;
    persist(); // a failed attempt must not overwrite its logs on resume
    const gateDigest = digest(root, paths);
    const w = witnessRuns(root, run, `green-${state.gateCount}`);
    const commands = [['npm', 'run', 'typecheck'], ['npm', 'test'], ...w.live];
    for (let i = 0; i < commands.length; i++) {
      const r = command(commands[i], root);
      save(join(run, `gate-${state.gateCount}-${phase}-${i}.json`), { argv: commands[i], ...r });
      if (r.code !== 0) throw new Error('Verification gate failed; inspect captured logs. No skip/waiver allowed.');
    }
    if (JSON.stringify(changes(root)) !== JSON.stringify(paths) || digest(root, paths) !== gateDigest) throw new Error('Checkout changed during verification; no green gate recorded');
    state.stages.push('gate-' + phase);
    state.verifiedPaths = paths; state.verifiedDigest = gateDigest;
  } else if (op === 'snapshot') {
    state.reviewDigest = digest(root, paths); state.reviewPaths = paths;
  } else if (op === 'review-check') {
    if (JSON.stringify(paths) !== JSON.stringify(state.reviewPaths) || digest(root, paths) !== state.reviewDigest) throw new Error('Read-only reviewer changed files');
  } else if (op === 'ship') {
    if (!approved(readFileSync(join(run, 'ship-answer.txt'), 'utf8'), 'Commit and push this fix')) throw new Error('No explicit ship approval');
    if (!state.stages.includes('gate-final')) throw new Error('Missing final verification');
    if (JSON.stringify(paths) !== JSON.stringify(state.verifiedPaths) || digest(root, paths) !== state.verifiedDigest) throw new Error('Files changed after final verification');
    if (!paths.length || paths.some(p => !(p.startsWith('src/') || p.startsWith('tests/') || p.startsWith('docs/')))) throw new Error('Ship scope limited to src/, tests/, docs/; other surfaces require manual shipment');
    const result = command(['git', 'add', '--', ...paths], root); if (result.code !== 0) throw new Error(result.output);
    const commit = command(['git', 'commit', '-m', `fix: resolve bug ${state.id}`], root); if (commit.code !== 0) throw new Error(commit.output);
    // Push only the reviewed commit and current branch: no tags, force, npm publish, or unrelated refs.
    const push = command(['git', 'push', 'origin', `HEAD:refs/heads/${state.branch}`], root);
    save(join(run, 'shipment.json'), { sha: git(root, 'rev-parse', 'HEAD'), pushed: push.code === 0, output: push.output });
    if (push.code !== 0) throw new Error('Commit created, push failed. Inspect shipment.json; do not rerun the workflow blindly.');
    rmSync(lock, { recursive: true });
    console.log('PASS'); return;
  } else throw new Error('Unknown operation');
  persist(); console.log('PASS');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (e) { console.error('BLOCKED: ' + e.message); process.exitCode = 1; }
}
