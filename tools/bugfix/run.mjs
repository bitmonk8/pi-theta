#!/usr/bin/env node
// Local workflow control plane. Models supply evidence/plans, never Git release authority.
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
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
function save(path, value) { writeFileSync(path, JSON.stringify(value, null, 2) + '\n'); }
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
  if (!/^\d{1,4}$/.test(words[0] ?? '')) throw new Error('Usage: /fix-bug [number] [ship true|false] [review_rounds 1..5]');
  let ship = 'true'; let rounds = '5'; const seen = new Set();
  for (let i = 1; i < words.length; i += 2) {
    const key = words[i]; const value = words[i + 1];
    if (seen.has(key)) throw new Error('Duplicate option: ' + key);
    seen.add(key);
    if (key === 'ship' && /^(true|false)$/.test(value ?? '')) ship = value;
    else if (key === 'review_rounds' && /^[1-5]$/.test(value ?? '')) rounds = value;
    else throw new Error('Invalid option/value: ' + key);
  }
  return ['FIX', words[0].padStart(4, '0'), ship, rounds].join('\n');
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
  let [op, arg, phase] = args;
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
    save(join(lock, 'owner.json'), { run });
    save(join(run, 'state.json'), { root, bug, id, branch, base: git(root, 'rev-parse', 'HEAD'), spec: digest(root, specFiles(root)), stages: [] });
    console.log(run); return;
  }
  const run = resolve(arg ?? '');
  const state = json(join(run, 'state.json')); const root = state.root;
  const lock = join(root, '.pi/tmp/fix-bug.lock');
  if (json(join(lock, 'owner.json')).run !== run) throw new Error('Run does not own this checkout');
  if (op === 'release') { rmSync(lock, { recursive: true }); console.log('PASS'); return; }
  if (git(root, 'rev-parse', 'HEAD') !== state.base || git(root, 'branch', '--show-current') !== state.branch) throw new Error('HEAD/branch changed during workflow; stop and inspect');
  const paths = changes(root);
  const specTouched = paths.some(p => p === 'docs/spec.md' || p.startsWith('docs/spec_topics/') || p.startsWith('docs/reference/'));
  if (!state.specApproved && (specTouched || digest(root, specFiles(root)) !== state.spec)) throw new Error('Specification changed without owner approval');
  if (op === 'approval') {
    if (!approved(readFileSync(join(run, 'spec-answer.txt'), 'utf8'), 'Approve proposed spec changes')) throw new Error('No explicit specification approval');
    state.specApproved = true;
    state.approvedProposal = readFileSync(join(run, 'spec-proposal.md'), 'utf8');
    if (!state.approvedProposal.trim()) throw new Error('Specification proposal is empty');
  } else if (op === 'red') {
    if (paths.some(p => !p.startsWith('tests/'))) throw new Error('Reproduction/diagnosis may change tests only');
    witnessRuns(root, run, 'red'); state.stages.push('red');
    state.witnessDigest = digest(run, ['witnesses.json']);
  } else if (op === 'gate') {
    if (!state.stages.includes('red')) throw new Error('Missing pre-fix red evidence');
    if (digest(run, ['witnesses.json']) !== state.witnessDigest) throw new Error('Witness commands/signatures changed after baseline');
    state.gateCount = (state.gateCount ?? 0) + 1;
    const w = witnessRuns(root, run, `green-${state.gateCount}`);
    const commands = [['npm', 'run', 'typecheck'], ['npm', 'test'], ...w.live];
    for (let i = 0; i < commands.length; i++) {
      const r = command(commands[i], root);
      save(join(run, `gate-${state.gateCount}-${phase}-${i}.json`), { argv: commands[i], ...r });
      if (r.code !== 0) throw new Error('Verification gate failed; inspect captured logs. No skip/waiver allowed.');
    }
    state.stages.push('gate-' + phase);
    state.verifiedPaths = paths; state.verifiedDigest = digest(root, paths);
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
  save(join(run, 'state.json'), state); console.log('PASS');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (e) { console.error('BLOCKED: ' + e.message); process.exitCode = 1; }
}
