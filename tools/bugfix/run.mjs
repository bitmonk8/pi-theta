#!/usr/bin/env node
// Local workflow control plane. Astra supplies bounded decisions, not Git authority.
// The owner grants standing commit/push permission through the saved ship option.
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync, renameSync, realpathSync, copyFileSync, lstatSync, readlinkSync } from 'node:fs';
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
function persistState(run, state, expected, beforeWrite) {
  const guard = join(run, 'state-write');
  try { mkdirSync(guard); } catch { throw new Error('Another state write is in progress; reconcile a stale state-write marker only after all commands stopped'); }
  try {
    const current = stateRevision(json(join(run, 'state.json')));
    if (current.revision !== expected.revision || current.generation !== expected.generation) throw new Error('Stale controller invocation: state changed while this command was running');
    beforeWrite?.();
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
function stagedPaths(root) {
  const result = command(['git', 'diff', '--cached', '--name-only', '--no-renames', '-z'], root);
  if (result.code !== 0) throw new Error('Cannot inspect staging index: ' + result.output);
  return result.output.split('\0').filter(Boolean).sort();
}
function verifyShippingIndex(root, verifiedPaths, complete = false) {
  const staged = stagedPaths(root);
  const blocked = message => { throw new Error('Shipment blocked by existing/unexpected staged changes: ' + message + '. Nothing was reset or discarded; inspect and reconcile the index manually.'); };
  if (staged.some(path => !verifiedPaths.includes(path))) blocked('staged paths outside the exact verified working-tree diff');
  if (complete && JSON.stringify(staged) !== JSON.stringify([...verifiedPaths].sort())) blocked('scoped git add did not stage exactly all verified paths');
  if (git(root, 'ls-files', '--unmerged', '-z')) blocked('unmerged index entries');
  for (const path of staged) {
    const entries = git(root, 'ls-files', '--stage', '-z', '--', path).split('\0').filter(Boolean);
    let info;
    try { info = lstatSync(join(root, path)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!info) { if (entries.length) blocked('staged deletion differs from verified working-tree deletion: ' + path); continue; }
    if ((!info.isFile() && !info.isSymbolicLink()) || entries.length !== 1) blocked('unsupported or missing staged file: ' + path);
    const [mode, oid, stage] = entries[0].split('\t')[0].split(' ');
    const expectedMode = info.isSymbolicLink() ? '120000' : info.mode & 0o100 ? '100755' : '100644';
    const bytes = info.isSymbolicLink() ? Buffer.from(readlinkSync(join(root, path))) : readFileSync(join(root, path));
    // Hash the literal verified bytes, not a filtered/normalized rendition.
    // This also catches partial staging and an index-only edit restored in the
    // working tree. Never reset somebody else's index to make shipping succeed.
    const hashed = spawnSync('git', ['hash-object', '--stdin'], { cwd: root, input: bytes, encoding: 'utf8' });
    if (hashed.status !== 0 || stage !== '0' || mode !== expectedMode || oid !== hashed.stdout.trim()) blocked('index bytes/mode differ from the verified working tree: ' + path);
  }
  return { staged, index: git(root, 'ls-files', '--stage', '-z'), status: git(root, 'status', '--porcelain=v1', '-z') };
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
  return bugReports(root).filter(r => r.open).map(r => `${r.id} ${r.title}`).join('\n') || 'No open bugs.';
}
function bugReports(root) {
  return readdirSync(join(root, 'docs/bugs')).sort().flatMap(filename => {
    const match = /^(\d{4})-(.+)\.md$/.exec(filename);
    if (!match) return [];
    const path = 'docs/bugs/' + filename;
    const bytes = readFileSync(join(root, path));
    const text = bytes.toString('utf8');
    const status = /^- \*\*Status:\*\*[ \t]*([^\r\n]+)/m.exec(text)?.[1].trim() ?? 'unknown';
    return [{ id: match[1], title: match[2].replaceAll('-', ' '), filename, path, bytes, text, status, open: /^open\b/.test(status) }];
  });
}
function rankingInput(root) {
  const reports = bugReports(root);
  const open = reports.filter(r => r.open);
  if (!open.length) return 'EMPTY';
  if (new Set(open.map(r => r.id)).size !== open.length) throw new Error('Open bug numbers are ambiguous; reconcile duplicate reports before ranking');
  const referenced = new Set(open.flatMap(r => [...r.text.matchAll(/\b\d{4}\b/g)].map(m => m[0])));
  const selected = reports.filter(r => r.open || referenced.has(r.id));
  const folder = join(root, '.pi/tmp', 'bugfix-ranking-' + randomUUID());
  mkdirSync(join(folder, 'reports'), { recursive: true });
  const entries = selected.map(r => {
    const snapshot = join(folder, 'reports', r.filename);
    writeFileSync(snapshot, r.bytes);
    return { id: r.id, title: r.title, path: r.path, status: r.status, snapshot };
  });
  // Hash exactly the captured bytes, not a second read that could race a change.
  const sourceDigest = createHash('sha256').update(selected.map(r => r.path + '\0' + r.bytes.toString('base64')).join('\0')).digest('hex');
  const catalog = join(folder, 'catalog.json');
  save(catalog, { version: 1, root, open: entries.filter(e => open.some(r => r.path === e.path)), related: entries.filter(e => !open.some(r => r.path === e.path)), sourcePaths: selected.map(r => r.path), sourceDigest });
  return catalog;
}
function renderRanking(root, catalogPath) {
  const catalog = json(catalogPath);
  if (catalog.version !== 1 || catalog.root !== root || !Array.isArray(catalog.open) || !catalog.open.length) throw new Error('Invalid ranking input snapshot');
  const current = bugReports(root).filter(r => r.open).map(r => [r.id, r.path]);
  if (JSON.stringify(current) !== JSON.stringify(catalog.open.map(r => [r.id, r.path])) || digest(root, catalog.sourcePaths) !== catalog.sourceDigest) throw new Error('Bug reports changed during ranking; rerun /fix-bug for a fresh assessment');
  const text = readFileSync(catalogPath + '.ranking.tsv', 'utf8');
  const [version, ...lines] = text.trimEnd().split('\n');
  if (version !== 'RANK1') throw new Error('Invalid ranking response version');
  const bugs = []; const edges = []; const guidance = [];
  const short = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit && !/[\x00-\x1f\x7f]/.test(value);
  for (const line of lines) {
    const fields = line.split('\t');
    if (fields[0] === 'BUG' && fields.length === 5 && ['true', 'false'].includes(fields[3]) && short(fields[4], 260)) bugs.push({ id: fields[1], severity: fields[2], provisional: fields[3] === 'true', reason: fields[4] });
    else if (fields[0] === 'EDGE' && fields.length === 4 && short(fields[3], 260)) edges.push({ before: fields[1], after: fields[2], reason: fields[3] });
    else if (fields[0] === 'GUIDE' && fields.length === 2 && short(fields[1], 360)) guidance.push(fields[1]);
    else throw new Error('Malformed or overlong ranking response; no partial list displayed');
  }
  const byId = new Map(catalog.open.map(r => [r.id, r]));
  if (bugs.length !== byId.size || new Set(bugs.map(r => r.id)).size !== byId.size || bugs.some(r => !byId.has(r.id))) throw new Error('Ranking must include every current open bug exactly once, and no closed or invented bugs');
  const severity = ['critical', 'high', 'medium', 'low'];
  let previous = -1;
  for (const bug of bugs) {
    const level = severity.indexOf(bug.severity);
    if (level < 0 || level < previous) throw new Error('Ranking severity order is invalid');
    previous = level;
  }
  if (!guidance.length || guidance.length > 8) throw new Error('Ranking must include concise fix-order guidance');
  const pairs = new Set();
  for (const edge of edges) {
    const pair = edge.before + ':' + edge.after;
    if (!byId.has(edge.before) || !byId.has(edge.after) || edge.before === edge.after || pairs.has(pair)) throw new Error('Invalid or duplicate prerequisite edge; resolved prerequisites belong in guidance, not the work queue');
    pairs.add(pair);
  }
  const done = new Set();
  while (done.size < byId.size) {
    let progress = false;
    for (const id of byId.keys()) if (!done.has(id) && edges.every(e => e.after !== id || done.has(e.before))) { done.add(id); progress = true; }
    if (!progress) throw new Error('Fix-order prerequisites contain a cycle; no contradictory guidance displayed');
  }
  const listing = [
    'OPEN BUGS — SEVERITY RANKING (most severe first)',
    'Impact-based estimates from current reports, not a reproduction verdict or a sort of filed S-labels.',
    '',
    ...bugs.flatMap((bug, index) => [`${index + 1}. ${bug.id} — ${byId.get(bug.id).title} [${bug.severity.toUpperCase()}${bug.provisional ? '; provisional' : ''}]`, `   ${bug.reason}`]),
    '', 'FIX-ORDER GUIDANCE (severity order is not necessarily implementation order)',
    ...edges.map(e => `- ${e.before} before ${e.after}: ${e.reason}`),
    ...guidance.map(note => '- ' + note),
  ].join('\n');
  if (Buffer.byteLength(listing, 'utf8') > 60000) throw new Error('Ranked list exceeds the display budget; inspect the ranking artifacts instead');
  return listing;
}
const PHASES = new Set(['reproduce', 'diagnose', 'plan', 'implement', 'repair', 'close']);
function controlPaths(root) {
  return ['tools/bugfix/run.mjs', '.pi/theta/fix-bug.theta', '.pi/theta/workers/bugfix-stage.theta', '.pi/theta/workers/bugfix-review.theta', '.pi/theta/workers/bugfix-rank.theta', '.pi/theta/workers/bugfix-decide.theta'].filter(p => existsSync(join(root, p)));
}
function stagePaths(phase) { return [`stage-${phase}-result.txt`, `${phase}.md`, ...(phase === 'plan' ? ['spec-proposal.md'] : [])]; }
// Decision snapshots are controller-owned, run-local authority, never Git or
// release authority. Do not let supplied paths turn this into a general reader.
const DECISION_PHASES = new Set([...PHASES, 'evidence', 'fix', 'final']);
const DECISION_LIMITS = [
  'Only the exact archived proposal/request is authorized; absent a request, retry within existing scope only.',
  'Specification edits require the exact approved plan/spec-proposal.md; stage requests cannot approve a new contract.',
  'No commit, push, tag, publication, shipment approval, or other Git/release authority.',
  'No waiver of witnesses, red proof, mandatory gates, independent reviews, checkpoint or integrity checks.',
  'Do not replace/relax witnesses.json, original red proofs, completed plans, or prior decision/owner records.',
  'New or expanded scope requires a fresh request and decision; authority is local to this run.',
];
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function localText(directory, name) {
  const path = join(directory, name);
  // Walk every component: even an innocent fixed filename must not follow an
  // attacker-controlled parent symlink out of the checkout/run.
  let current = resolve(directory);
  for (const part of name.split('/')) {
    if (!part || part === '.' || part === '..') throw new Error('Invalid local artifact path');
    current = join(current, part);
    let info;
    try { info = lstatSync(current); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    if (info.isSymbolicLink()) throw new Error('Decision artifacts cannot be symlinks: ' + name);
  }
  if (!lstatSync(path).isFile()) throw new Error('Decision artifact must be a regular file: ' + name);
  return readFileSync(path, 'utf8');
}
function checkoutIdentity(root) {
  const paths = [...new Set([...git(root, 'ls-files', '-z').split('\0'), ...changes(root)].filter(Boolean))].sort();
  const inventory = paths.map(path => {
    let info;
    try { info = lstatSync(join(root, path)); } catch (error) { if (error.code === 'ENOENT') return { path, type: 'deleted' }; throw error; }
    if (info.isSymbolicLink()) return { path, type: 'symlink', target: readlinkSync(join(root, path)) };
    if (!info.isFile()) throw new Error('Decision checkout contains an unsupported file type: ' + path);
    return { path, type: 'file', mode: info.mode & 0o777, digest: hash(readFileSync(join(root, path))) };
  });
  return { inventory, digest: hash(JSON.stringify(inventory)), index: git(root, 'ls-files', '--stage', '-z'), status: git(root, 'status', '--porcelain=v1', '-z') };
}
function isSpecDecision(context) { return context.phase === 'plan' && context.status === 'needs_spec'; }
function decisionLabel(context) { return isSpecDecision(context) ? 'Approve proposed spec changes' : 'Approve recommended scoped decision'; }
function decisionMaterial(run, state, phase, options = {}) {
  if (!DECISION_PHASES.has(phase)) throw new Error('Unknown decision phase');
  if (JSON.stringify(controlPaths(state.root)) !== JSON.stringify(state.controlPaths) || digest(state.root, state.controlPaths) !== state.controlDigest) throw new Error('Workflow/control files changed; no decision authority can reconcile them');
  if (state.stages.includes('red')) redEvidence(run, state);
  for (const [name, checkpoint] of Object.entries(state.checkpoints ?? {})) {
    if (['pass', 'needs_spec', 'needs_decision'].includes(checkpoint.status) && digest(run, stagePaths(name)) !== checkpoint.reportDigest) throw new Error('Completed stage report/result changed: ' + name);
  }
  const request = localText(run, 'decision-request.md');
  const status = state.checkpoints?.[phase]?.status ?? null;
  if (status === 'needs_decision' && !request?.trim()) throw new Error('needs_decision requires a nonempty decision-request.md');
  if (status === 'needs_decision' && state.checkpoints[phase].decisionRequest !== request) throw new Error('Decision request changed since the stage checkpoint');
  const reportName = ({ evidence: 'evidence-review.md', fix: 'reviews.md', final: 'final-review.md' })[phase] ?? phase + '.md';
  const specDecision = isSpecDecision({ phase, status });
  const proposalName = specDecision ? 'spec-proposal.md' : request?.trim() ? 'decision-request.md' : reportName;
  const proposal = localText(run, proposalName);
  if (!proposal?.trim()) throw new Error('Nonempty decision proposal/report required: ' + proposalName);
  // Owner rulings/addenda are run-local (ignored by Git) but still governing
  // decision inputs. Snapshot additions as well as changes, not just one common
  // filename; a later sidecar ruling must invalidate an in-flight assessment.
  const precedentNames = readdirSync(run).filter(name => /^(?:owner(?:-[a-z0-9-]+)?|plan-[a-z0-9-]+-addendum)\.md$/i.test(name)).sort();
  const artifactNames = [...new Set([
    ...[...PHASES].flatMap(stagePaths), ...precedentNames, 'decision-request.md', 'spec-revision-proposal.md',
    'witnesses.json', 'evidence-review.md', 'evidence-review-result.json', 'reviews.md', 'fix-review.md', 'final-review.md',
    'spec-answer.txt', 'owner-decision.md', 'decision-authorizations.md',
  ])];
  const artifacts = Object.fromEntries(artifactNames.map(name => [name, localText(run, name)]));
  const proofNames = readdirSync(run).filter(name => /^(?:red-\d+|green-\d+-\d+|gate-\d+-[a-z]+-\d+)\.json$/.test(name)).sort();
  const proofs = proofNames.map(path => ({ path, digest: hash(localText(run, path)) }));
  const records = validateDecisionIntegrity(run, state, options);
  if (Object.hasOwn(options, 'authorizationText')) artifacts['decision-authorizations.md'] = options.authorizationText;
  const { decisionContexts: _contexts, ...authorityState } = state;
  const principlePaths = ['AGENTS.md', 'docs/principles.md', 'docs/reference/principles.md'];
  if (!/^docs\/bugs\/\d{4}-[^/]+\.md$/.test(state.bug)) throw new Error('Invalid bug report path');
  return {
    root: state.root, base: state.base, id: state.id, branch: state.branch, phase, status,
    head: git(state.root, 'rev-parse', 'HEAD'), currentBranch: git(state.root, 'branch', '--show-current'),
    report: localText(run, reportName), reportPath: reportName,
    proposal, proposalPath: proposalName,
    request: { type: specDecision ? 'exact-spec-proposal' : request?.trim() ? 'exact-scoped-request' : 'existing-scope-retry', exact: proposal, limits: DECISION_LIMITS },
    artifacts, proofs, records,
    bug: { path: state.bug, text: localText(state.root, state.bug) },
    principles: principlePaths.map(path => ({ path, text: localText(state.root, path) })).filter(item => item.text !== null),
    specReferences: specFiles(state.root).map(path => ({ path })),
    authority: { ...stateRevision(state), stateDigest: hash(JSON.stringify(authorityState)), checkpoints: state.checkpoints, decisions: state.decisions ?? [], specApproved: state.specApproved ?? false, approvedProposal: state.approvedProposal ?? null, controlPaths: state.controlPaths, controlDigest: digest(state.root, state.controlPaths), lease: localText(join(state.root, '.pi/tmp/fix-bug.lock'), 'owner.json'), active: localText(run, 'active/owner.json') },
    checkout: checkoutIdentity(state.root),
  };
}
function validateVerdict(value) {
  const keys = ['disposition', 'clear_preference', 'has_tradeoff', 'evidence_sufficient', 'summary', 'recommendation', 'rationale', 'basis', 'alternatives'];
  const text = (s, max) => typeof s === 'string' && s.trim().length > 0 && s.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s);
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new Error('Decision verdict fields do not match the strict schema');
  if (!['continue', 'human', 'blocked'].includes(value.disposition) || ['clear_preference', 'has_tradeoff', 'evidence_sufficient'].some(key => typeof value[key] !== 'boolean')) throw new Error('Invalid decision disposition/flags');
  if (!text(value.summary, 4000) || !text(value.recommendation, 8000) || !text(value.rationale, 16000)) throw new Error('Decision summary/recommendation/rationale must be nonempty bounded strings');
  for (const [key, min] of [['basis', 1], ['alternatives', 2]]) {
    if (!Array.isArray(value[key]) || value[key].length < min || value[key].length > 20 || value[key].some(item => !text(item, 4000)) || new Set(value[key].map(item => item.trim())).size !== value[key].length) throw new Error('Invalid decision ' + key);
  }
  if (value.disposition === 'continue' && (!value.clear_preference || value.has_tradeoff || !value.evidence_sufficient)) throw new Error('Continue requires a clear preference, no tradeoff, and sufficient evidence');
  if (value.disposition === 'human' && (value.clear_preference || !value.has_tradeoff || !value.evidence_sufficient)) throw new Error('Human choice requires an evidenced unresolved tradeoff; missing evidence is blocked, not approval');
  return value;
}
function decisionContext(run, state, path) {
  // Only helper-minted context names in this run may be presented for approval.
  const full = resolve(path ?? '');
  const relative = full.slice(run.length + 1);
  if (!full.startsWith(run + '/') || !/^decision-[0-9a-f-]{36}\/context\.json$/.test(relative)) throw new Error('Context path must be a helper-minted decision in this run');
  const entry = state.decisionContexts?.[relative];
  if (!entry || entry.path !== full) throw new Error('Unknown decision context');
  const raw = localText(run, relative);
  if (!raw || hash(raw) !== entry.digest) throw new Error('Immutable decision context changed');
  const context = JSON.parse(raw);
  if (context.version !== 1 || full !== join(run, 'decision-' + context.decisionId, 'context.json')) throw new Error('Invalid decision context identity');
  return { full, relative, entry, context, raw, folder: full.slice(0, -'/context.json'.length) };
}
function assertDecisionCurrent(run, state, context, expectedDigest) {
  const current = decisionMaterial(run, state, context.phase);
  const { version: _version, decisionId: _id, ...material } = context;
  if (hash(JSON.stringify(current)) !== (expectedDigest ?? hash(JSON.stringify(material)))) throw new Error('Stale decision: state, request, authority, checkpoint, HEAD/branch, control files, or checkout changed');
  return current;
}
function decisionCommitFence(run, priorState, selected, baseline, verdictRaw, history, answerRaw) {
  // Recheck under the state-write guard immediately before accepting. Exclude
  // only the one history file the helper just rendered itself; all input state,
  // originals, source bytes, request, branch/index and checkout remain fenced.
  decisionContext(run, priorState, selected.full);
  if (localText(run, selected.relative + '.verdict.json') !== verdictRaw || localText(run, 'decision-authorizations.md') !== history) throw new Error('Decision inputs/history changed during recording');
  if (answerRaw !== undefined && localText(run, selected.relative + '.answer.txt') !== answerRaw) throw new Error('Human answer changed during recording');
  const current = decisionMaterial(run, priorState, selected.context.phase, { authorizationText: baseline.artifacts['decision-authorizations.md'] });
  if (hash(JSON.stringify(current)) !== hash(JSON.stringify(baseline))) throw new Error('Decision context changed during recording');
}
function decisionAuthority(context, verdict, source) {
  return { source, phase: context.phase, type: context.request.type, exactRequest: context.proposal, proposalPath: context.proposalPath, recommendation: verdict.recommendation, rationale: verdict.rationale, limits: DECISION_LIMITS, gitAuthority: false };
}
function requireDecisionApproval(run, state, context) {
  if (!isSpecDecision(context)) return;
  requireCleanEvidenceReview(run, state);
}
function authorizationText(records) {
  const lines = ['# Run-local decision authorizations', '', ...DECISION_LIMITS.map(line => '- ' + line), '', '# History'];
  for (const item of records) {
    const record = item.record;
    lines.push('', `## ${record.outcome} — ${record.phase} (${record.source})`, `Record: ${item.path}`, `Rationale: ${record.verdict.rationale}`, `Recommendation: ${record.verdict.recommendation}`);
    if (record.authority) lines.push(`Authority type: ${record.authority.type}`, '', 'Exact authorized request/proposal:', record.authority.exactRequest);
    else lines.push('No approval or expanded scope granted.');
  }
  return lines.join('\n') + '\n';
}
function renderAuthorizations(run, state) {
  const records = (state.decisions ?? []).map(item => ({ ...item, record: JSON.parse(localText(run, item.path.slice(run.length + 1))) }));
  writeFileSync(join(run, 'decision-authorizations.md'), authorizationText(records));
}
// Pure validation of persisted authority: never reconstruct current decision
// material here (that would recurse and incorrectly expire historical records).
function validateDecisionIntegrity(run, state, options = {}) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const records = []; const seen = new Set();
  for (const item of state.decisions ?? []) {
    const relative = typeof item.path === 'string' ? item.path.slice(run.length + 1) : '';
    if (!item.path?.startsWith(run + '/') || !/^decision-[0-9a-f-]{36}\/(?:human-)?record\.json$/.test(relative) || seen.has(item.path)) throw new Error('Invalid or duplicate run-local decision record');
    seen.add(item.path);
    const raw = localText(run, relative);
    if (!raw || hash(raw) !== item.digest) throw new Error('Prior decision record changed');
    const record = JSON.parse(raw);
    const selected = decisionContext(run, state, record.contextPath);
    const { context, entry } = selected;
    const human = record.source === 'human';
    if (record.version !== 1 || !['astra', 'human'].includes(record.source) || item.path !== join(selected.folder, human ? 'human-record.json' : 'record.json')) throw new Error('Invalid archived decision identity');
    const required = ['context.json', 'verdict.json', human ? 'human-authority.json' : 'authority.json', ...(human ? ['answer.txt'] : [])].sort();
    if (!same(Object.keys(record.artifactDigests ?? {}).sort(), required)) throw new Error('Incomplete prior decision evidence');
    for (const name of required) {
      const text = localText(run, relative.slice(0, relative.lastIndexOf('/')) + '/' + name);
      if (text === null || hash(text) !== record.artifactDigests[name]) throw new Error('Prior decision evidence changed');
    }
    const verdict = validateVerdict(JSON.parse(localText(run, relative.replace(/(?:human-)?record\.json$/, 'verdict.json'))));
    const outcome = human ? 'CONTINUE' : verdict.disposition.toUpperCase();
    const expectedAuthority = outcome === 'CONTINUE' ? decisionAuthority(context, verdict, record.source) : null;
    const requestType = isSpecDecision(context) ? 'exact-spec-proposal' : context.artifacts['decision-request.md']?.trim() ? 'exact-scoped-request' : 'existing-scope-retry';
    const proposalPath = isSpecDecision(context) ? 'spec-proposal.md' : requestType === 'exact-scoped-request' ? 'decision-request.md' : context.reportPath;
    if (!DECISION_PHASES.has(context.phase) || context.root !== state.root || context.base !== state.base || context.branch !== state.branch || context.id !== state.id || context.request?.type !== requestType || context.proposalPath !== proposalPath || context.proposal !== context.artifacts[proposalPath] || context.request.exact !== context.proposal || !same(context.request.limits, DECISION_LIMITS)) throw new Error('Invalid archived decision scope');
    if (record.phase !== context.phase || record.outcome !== outcome || !same(record.verdict, verdict) || !same(record.authority, expectedAuthority) || entry.digest !== record.artifactDigests['context.json'] || entry.verdictDigest !== record.artifactDigests['verdict.json']) throw new Error('Archived decision verdict/authority mismatch');
    const authorityFile = JSON.parse(localText(run, relative.replace(/(?:human-)?record\.json$/, human ? 'human-authority.json' : 'authority.json')));
    if (!same(authorityFile, expectedAuthority)) throw new Error('Archived decision authority changed');
    if (human) {
      const original = records.find(prior => prior.path === join(selected.folder, 'record.json'));
      if (verdict.disposition !== 'human' || original?.record.outcome !== 'HUMAN' || !approved(localText(run, relative.replace(/human-record\.json$/, 'answer.txt')), decisionLabel(context))) throw new Error('Invalid archived human approval');
    }
    const indexed = { contextPath: record.contextPath, outcome, phase: context.phase, source: record.source, authority: expectedAuthority, rationale: verdict.rationale };
    if (Object.entries(indexed).some(([key, value]) => !same(item[key], value))) throw new Error('Decision index differs from immutable record');
    records.push({ ...item, record });
  }
  for (const [relative, entry] of Object.entries(state.decisionContexts ?? {})) {
    const selected = decisionContext(run, state, join(run, relative));
    const own = records.filter(item => item.contextPath === selected.full);
    const status = own.length ? own.at(-1).source === 'human' ? 'answered' : own.at(-1).record.verdict.disposition : 'pending';
    if (entry.status !== status || (status === 'human' && typeof entry.answerFence !== 'string')) throw new Error('Decision registration differs from archived history');
  }
  const history = Object.hasOwn(options, 'authorizationText') ? options.authorizationText : localText(run, 'decision-authorizations.md');
  if ((records.length || history !== null) && history !== authorizationText(records)) throw new Error('Worker-facing decision-authorizations.md changed or has no matching decision records');
  for (const archive of state.planArchives ?? []) {
    if (!archive.path?.startsWith(run + '/history/') || resolve(archive.path) !== archive.path) throw new Error('Invalid plan archive');
    for (const [name, expected] of Object.entries(archive.files)) {
      if (hash(localText(run, archive.path.slice(run.length + 1) + '/' + name) ?? '') !== expected) throw new Error('Original plan/replan history changed');
    }
  }
  return records;
}
function currentPlan(run, state) {
  const checkpoint = state.checkpoints?.plan;
  if (state.replanRequired || !['pass', 'needs_spec', 'needs_decision'].includes(checkpoint?.status) || digest(run, stagePaths('plan')) !== checkpoint.reportDigest) throw new Error('Evidence review requires a completed, current plan checkpoint');
  return checkpoint;
}
function evidenceReviewResult(run, ok) {
  const raw = localText(run, 'evidence-review-result.json');
  const report = localText(run, 'evidence-review.md');
  const review = raw === null ? null : JSON.parse(raw);
  if (review?.ok !== ok || typeof review.findings !== 'string' || !review.findings.trim() || report !== review.findings) throw new Error('Missing matching ' + (ok ? 'clean' : 'failed') + ' independent evidence review result/report');
  return { review, raw, report, reportDigest: digest(run, ['evidence-review-result.json', 'evidence-review.md']) };
}
function requireCleanEvidenceReview(run, state) {
  const plan = currentPlan(run, state);
  const review = evidenceReviewResult(run, true);
  const binding = state.evidenceReviewBinding;
  if (!binding || binding.generation !== (state.generation ?? 0) || binding.planDigest !== plan.reportDigest || binding.reportDigest !== review.reportDigest || binding.checkoutDigest !== hash(JSON.stringify(checkoutIdentity(state.root)))) throw new Error('Specification approval requires a current clean evidence-review-record binding; rerun independent evidence review');
}
function requireReplanInputs(run, state) {
  if (!state.replanRequired || !state.replanFeedback) return;
  const feedback = state.replanFeedback;
  if (!feedback.path?.startsWith(run + '/') || resolve(feedback.path) !== feedback.path || hash(localText(run, feedback.path.slice(run.length + 1)) ?? '') !== feedback.digest) throw new Error('Exact replan feedback changed before/during PLAN');
  if (feedback.checkoutDigest !== hash(JSON.stringify(checkoutIdentity(state.root)))) throw new Error('Replanning is read-only; checkout/index changed since the accepted evidence decision');
}
function archivePlan(run, state, reason, additional = {}) {
  const checkpoint = currentPlan(run, state);
  const path = join(run, 'history', 'plan-' + randomUUID());
  mkdirSync(path, { recursive: true });
  const files = {};
  const artifacts = { ...Object.fromEntries([...stagePaths('plan'), 'decision-request.md', 'evidence-review.md', 'evidence-review-result.json'].map(name => [name, localText(run, name)])), ...additional, 'checkpoint.json': JSON.stringify({ reason, checkpoint }, null, 2) + '\n' };
  for (const [name, text] of Object.entries(artifacts)) if (text !== null) {
    writeFileSync(join(path, name), text, { flag: 'wx' }); files[name] = hash(text);
  }
  state.planArchives = [...(state.planArchives ?? []), { path, reason, checkpoint, files }];
  return path;
}
function archiveDecision(run, state, selected, verdict, source, verdictRaw, answerRaw) {
  const { context, folder, entry } = selected;
  const outcome = source === 'human' ? 'CONTINUE' : verdict.disposition.toUpperCase();
  const authority = outcome === 'CONTINUE' ? decisionAuthority(context, verdict, source) : null;
  const specApproval = authority && isSpecDecision(context);
  if (authority) requireDecisionApproval(run, state, context);
  const prefix = source === 'human' ? 'human-' : '';
  const artifactDigests = { 'context.json': entry.digest };
  if (source === 'human') {
    writeFileSync(join(folder, 'answer.txt'), answerRaw, { flag: 'wx' });
    artifactDigests['answer.txt'] = hash(answerRaw);
    artifactDigests['verdict.json'] = entry.verdictDigest;
  } else {
    writeFileSync(join(folder, 'verdict.json'), verdictRaw, { flag: 'wx' });
    artifactDigests['verdict.json'] = hash(verdictRaw);
    entry.verdictDigest = hash(verdictRaw);
  }
  const authorityRaw = JSON.stringify(authority, null, 2) + '\n';
  writeFileSync(join(folder, prefix + 'authority.json'), authorityRaw, { flag: 'wx' });
  artifactDigests[prefix + 'authority.json'] = hash(authorityRaw);
  const record = { version: 1, contextPath: selected.full, outcome, phase: context.phase, source, authority, verdict, artifactDigests };
  const path = join(folder, prefix + 'record.json');
  const raw = JSON.stringify(record, null, 2) + '\n';
  writeFileSync(path, raw, { flag: 'wx' });
  state.decisions = [...(state.decisions ?? []), { path, digest: hash(raw), contextPath: selected.full, outcome, phase: record.phase, source, authority, rationale: verdict.rationale }];
  if (specApproval) { state.specApproved = true; state.approvedProposal = context.proposal; }
  entry.status = source === 'human' ? 'answered' : verdict.disposition;
  renderAuthorizations(run, state);
  return outcome;
}
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
  validateDecisionIntegrity(run, state);
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
    if (['pass', 'needs_spec', 'needs_decision'].includes(checkpoint.status) && digest(run, stagePaths(phase)) !== checkpoint.reportDigest) throw new Error('Completed stage report/result changed: ' + phase + '; reconcile the handoff explicitly');
  }
  const options = state.options;
  if (!options || typeof options.ship !== 'boolean' || !Number.isInteger(options.review_rounds) || options.review_rounds < 1 || options.review_rounds > 5) throw new Error('Invalid saved workflow options');
  if (ship !== 'keep') options.ship = ship === 'true';
  if (rounds !== 'keep') options.review_rounds = Number(rounds);
  state.generation = (state.generation ?? 0) + 1;
  state.resumeCount = (state.resumeCount ?? 0) + 1;
  // Keep audit history and standing ship permission, but require fresh gates/reviews.
  state.resumeHistory = [...(state.resumeHistory ?? []), { number: state.resumeCount, priorStages: state.stages }];
  state.stages = state.stages.filter(s => s === 'red');
  delete state.verifiedPaths; delete state.verifiedDigest; delete state.verifiedCheckoutIdentity;
  delete state.finalReviewDigest; delete state.finalReviewCheckoutDigest;
  delete state.evidenceReviewBinding;
  const history = join(run, 'history'); mkdirSync(history, { recursive: true });
  for (const file of ['evidence-review.md', 'evidence-review-result.json', 'reviews.md', 'final-review.md', 'ship-answer.txt']) {
    if (existsSync(join(run, file))) copyFileSync(join(run, file), join(history, `resume-${state.resumeCount}-before-${file}`));
  }
  persistState(run, state, expected, () => validateDecisionIntegrity(run, state));
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
  if (op === 'rank-start' || op === 'rank-render') {
    const root = git(cwd, 'rev-parse', '--show-toplevel');
    console.log(op === 'rank-start' ? rankingInput(root) : renderRanking(root, resolve(cwd, arg))); return;
  }
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
  const persist = beforeWrite => persistState(run, state, expected, () => {
    validateDecisionIntegrity(run, state);
    beforeWrite?.();
  });
  if (root !== git(cwd, 'rev-parse', '--show-toplevel')) throw new Error('Run belongs to another checkout');
  validateDecisionIntegrity(run, state);
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
  if (op === 'decision-kind') {
    const { context, entry } = decisionContext(run, state, phase);
    if (entry.status === 'pending') assertDecisionCurrent(run, state, context);
    else if (entry.status === 'human') assertDecisionCurrent(run, state, context, entry.answerFence);
    else throw new Error('Decision is no longer pending a disposition/answer');
    console.log(isSpecDecision(context) ? 'SPEC' : 'SCOPED'); return;
  } else if (op === 'decision-start') {
    if (!DECISION_PHASES.has(phase)) throw new Error('Unknown decision phase');
    const decisionId = randomUUID();
    const folder = join(run, 'decision-' + decisionId);
    mkdirSync(folder);
    // Capture the revision that the registration transaction will publish, not
    // a mutable final/active state reconstructed after the model's assessment.
    state.revision = expected.revision + 1;
    const context = { version: 1, decisionId, ...decisionMaterial(run, state, phase) };
    const path = join(folder, 'context.json');
    save(path, context);
    const relative = path.slice(run.length + 1);
    state.decisionContexts = { ...(state.decisionContexts ?? {}), [relative]: { path, digest: hash(readFileSync(path)), status: 'pending' } };
    persist(() => assertDecisionCurrent(run, state, context));
    console.log(path); return;
  } else if (op === 'decision-record' || op === 'decision-answer') {
    const selected = decisionContext(run, state, phase);
    const { entry, context } = selected;
    if (op === 'decision-record') {
      if (entry.status !== 'pending') throw new Error('Decision already recorded; no replay allowed');
      const baseline = assertDecisionCurrent(run, state, context);
      const priorState = JSON.parse(JSON.stringify(state));
      const verdictRaw = localText(run, selected.relative + '.verdict.json');
      if (!verdictRaw || verdictRaw.length > 128000) throw new Error('Missing or overlong decision verdict');
      const verdict = validateVerdict(JSON.parse(verdictRaw));
      const outcome = archiveDecision(run, state, selected, verdict, 'astra', verdictRaw);
      const history = localText(run, 'decision-authorizations.md');
      if (outcome === 'HUMAN') {
        // The HUMAN record changes state and the helper-rendered history. Fence
        // precisely that one transition; no subsequent controller op is allowed
        // between presentation of the genuine choice and its recorded answer.
        state.revision = expected.revision + 1;
        entry.answerFence = 'pending'; // registration is complete before its material is hashed
        entry.answerFence = hash(JSON.stringify(decisionMaterial(run, state, context.phase)));
      }
      persist(() => decisionCommitFence(run, priorState, selected, baseline, verdictRaw, history));
      console.log(outcome); return;
    }
    if (entry.status !== 'human' || !entry.answerFence) throw new Error('Human approval requires a recorded HUMAN verdict, once only');
    const baseline = assertDecisionCurrent(run, state, context, entry.answerFence);
    const priorState = JSON.parse(JSON.stringify(state));
    const verdictRaw = localText(run, selected.relative + '.verdict.json');
    if (!verdictRaw || hash(verdictRaw) !== entry.verdictDigest) throw new Error('Recorded verdict changed');
    const verdict = validateVerdict(JSON.parse(verdictRaw));
    if (verdict.disposition !== 'human') throw new Error('No genuine unresolved human choice recorded');
    const answer = localText(run, selected.relative + '.answer.txt');
    const label = decisionLabel(context);
    if (typeof answer !== 'string' || !approved(answer, label)) throw new Error('No exact explicit human approval; free text/default/cancel cannot approve');
    archiveDecision(run, state, selected, verdict, 'human', verdictRaw, answer);
    const history = localText(run, 'decision-authorizations.md');
    persist(() => decisionCommitFence(run, priorState, selected, baseline, verdictRaw, history, answer));
    console.log('PASS'); return;
  } else if (op === 'enter') {
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
      if (phase === 'plan') {
        if (['pass', 'needs_spec'].includes(checkpoint?.status)) {
          // An explicit begin can supersede an unrejected plan, but must first
          // preserve it and revoke its clean-review binding. A rejected review
          // instead requires the accepted, evidence-scoped replan transition.
          if (localText(run, 'evidence-review.md') !== null || localText(run, 'evidence-review-result.json') !== null || state.evidenceReviewBinding) {
            try { evidenceReviewResult(run, true); } catch { throw new Error('Rejected/unbound evidence review requires an accepted evidence decision and explicit replan before revising the plan'); }
          }
          archivePlan(run, state, 'explicit-plan-begin');
        }
        if (checkpoint?.status === 'needs_decision') {
          const latest = state.decisions?.at(-1);
          const selected = latest ? decisionContext(run, state, latest.contextPath) : null;
          if (latest?.phase !== 'plan' || latest.outcome !== 'CONTINUE' || latest.authority?.type !== 'exact-scoped-request' || selected.context.authority.checkpoints?.plan?.reportDigest !== checkpoint.reportDigest || selected.context.artifacts['decision-request.md'] !== localText(run, 'decision-request.md') || JSON.stringify(selected.context.checkout) !== JSON.stringify(checkoutIdentity(root))) throw new Error('Pending PLAN scoped request requires its exact accepted decision before retry');
          archivePlan(run, state, 'accepted-scoped-plan-retry');
        }
        requireReplanInputs(run, state);
        delete state.evidenceReviewBinding;
      }
      const attempt = Math.max(checkpoint?.attempt ?? 0, state.phaseAttempts?.[phase] ?? 0) + 1;
      state.phaseAttempts = { ...(state.phaseAttempts ?? {}), [phase]: attempt };
      const history = join(run, 'history'); mkdirSync(history, { recursive: true });
      for (const file of [...stagePaths(phase), 'decision-request.md']) if (existsSync(join(run, file))) copyFileSync(join(run, file), join(history, `${phase}-${attempt}-before-${file}`));
      rmSync(join(run, 'decision-request.md'), { force: true });
      state.checkpoints[phase] = { attempt, status: 'running' };
    } else {
      if (!checkpoint || checkpoint.status !== 'running') throw new Error('Stage did not begin');
      if (phase === 'plan') requireReplanInputs(run, state);
      const text = readFileSync(join(run, `stage-${phase}-result.txt`), 'utf8');
      const [status, ...summary] = text.split('\n');
      if (!['pass', 'blocked', 'not_reproduced', 'needs_spec', 'needs_decision'].includes(status) || !summary.join('\n').trim()) throw new Error('Invalid stage result');
      if (status === 'needs_spec' && !['plan', 'implement', 'repair'].includes(phase)) throw new Error('This phase cannot request a specification transition');
      if (['pass', 'needs_spec', 'needs_decision'].includes(status) && !existsSync(join(run, `${phase}.md`))) throw new Error('Completed stage report is missing');
      if (phase === 'plan' && ['pass', 'needs_spec', 'needs_decision'].includes(status) && !existsSync(join(run, 'spec-proposal.md'))) throw new Error('Plan specification disposition is missing');
      const decisionRequest = localText(run, 'decision-request.md');
      if (status === 'needs_decision' && !decisionRequest?.trim()) throw new Error('needs_decision requires a nonempty decision-request.md');
      state.checkpoints[phase] = { ...checkpoint, status, ...(decisionRequest?.trim() ? { decisionRequest } : {}), reportDigest: digest(run, stagePaths(phase)), checkoutDigest: digest(root, paths), ...(phase === 'implement' ? { planDigest: state.checkpoints.plan?.reportDigest } : {}) };
      if (['implement', 'repair'].includes(phase) && status === 'needs_spec') {
        if (!existsSync(join(run, 'spec-revision-proposal.md'))) throw new Error('Revised specification proposal is missing');
        const history = join(run, 'history'); mkdirSync(history, { recursive: true });
        for (const file of stagePaths('plan')) if (existsSync(join(run, file))) copyFileSync(join(run, file), join(history, `${phase}-${checkpoint.attempt}-before-replan-${file}`));
        delete state.checkpoints.plan;
        delete state.evidenceReviewBinding;
        // A new implementation-time contract request supersedes any consumed
        // evidence-replan inputs; their original bytes remain in planArchives.
        delete state.replanFeedback;
        state.replanRequired = true; // next resume reruns PLAN + evidence review + exact owner decision
      }
      if (phase === 'plan' && ['pass', 'needs_spec', 'needs_decision'].includes(status)) state.replanRequired = false;
    }
  } else if (op === 'replan') {
    const plan = currentPlan(run, state);
    const report = localText(run, 'evidence-review.md');
    const raw = localText(run, 'evidence-review-result.json');
    if (!report?.trim()) throw new Error('Replan requires the rejected independent evidence review report');
    const result = raw === null ? null : JSON.parse(raw);
    if (result?.ok === true && result.findings === report) throw new Error('Clean evidence review is not a rejected-plan replan request');
    if (result?.ok === false && result.findings !== report) throw new Error('Failed evidence review result/report differ');
    const latest = state.decisions?.at(-1);
    if (latest?.phase !== 'evidence' || latest.outcome !== 'CONTINUE' || !['exact-scoped-request', 'existing-scope-retry'].includes(latest.authority?.type)) throw new Error('Replan requires the latest accepted CONTINUE decision for the failed evidence review, with scoped or existing-scope retry authority');
    const { context } = decisionContext(run, state, latest.contextPath);
    if (state.revision !== context.authority.revision + (latest.source === 'human' ? 2 : 1) || context.authority.checkpoints?.plan?.reportDigest !== plan.reportDigest || context.artifacts['evidence-review.md'] !== report || context.artifacts['evidence-review-result.json'] !== raw || JSON.stringify(context.checkout) !== JSON.stringify(checkoutIdentity(root)) || context.head !== state.base || context.currentBranch !== state.branch) throw new Error('Replan decision is stale or does not authorize this failed review/current plan');
    const feedbackPath = resolve(phase ?? '');
    if (!feedbackPath.startsWith(run + '/')) throw new Error('Replan feedback must be an exact file path within this run');
    const feedback = localText(run, feedbackPath.slice(run.length + 1));
    if (!feedback?.trim()) throw new Error('Nonempty exact replan feedback is required');
    const archive = archivePlan(run, state, 'failed-evidence-review', { 'evidence-replan-feedback.md': feedback });
    state.replanFeedback = { path: feedbackPath, digest: hash(feedback), decisionPath: latest.path, archive, checkoutDigest: hash(JSON.stringify(checkoutIdentity(root))) };
    delete state.checkpoints.plan;
    delete state.evidenceReviewBinding;
    state.replanRequired = true;
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
    delete state.verifiedPaths; delete state.verifiedDigest; delete state.verifiedCheckoutIdentity;
    delete state.finalReviewDigest; delete state.finalReviewCheckoutDigest;
    persist(); // a failed attempt must not overwrite its logs on resume
    const gateDigest = digest(root, paths);
    const gateIdentity = checkoutIdentity(root).digest;
    const w = witnessRuns(root, run, `green-${state.gateCount}`);
    const commands = [['npm', 'run', 'typecheck'], ['npm', 'test'], ...w.live];
    for (let i = 0; i < commands.length; i++) {
      const r = command(commands[i], root);
      save(join(run, `gate-${state.gateCount}-${phase}-${i}.json`), { argv: commands[i], ...r });
      if (r.code !== 0) throw new Error('Verification gate failed; inspect captured logs. No skip/waiver allowed.');
    }
    if (JSON.stringify(changes(root)) !== JSON.stringify(paths) || digest(root, paths) !== gateDigest || checkoutIdentity(root).digest !== gateIdentity) throw new Error('Checkout changed during verification; no green gate recorded');
    state.stages.push('gate-' + phase);
    state.verifiedPaths = paths; state.verifiedDigest = gateDigest; state.verifiedCheckoutIdentity = gateIdentity;
  } else if (op === 'snapshot') {
    state.reviewDigest = digest(root, paths); state.reviewPaths = paths;
    state.reviewCheckoutDigest = hash(JSON.stringify(checkoutIdentity(root)));
    state.reviewPlanDigest = state.checkpoints?.plan?.reportDigest ?? null;
    state.reviewGeneration = state.generation ?? 0;
  } else if (op === 'review-check') {
    if (JSON.stringify(paths) !== JSON.stringify(state.reviewPaths) || digest(root, paths) !== state.reviewDigest || state.reviewCheckoutDigest !== hash(JSON.stringify(checkoutIdentity(root)))) throw new Error('Read-only reviewer changed files/index');
  } else if (op === 'evidence-review-record') {
    const plan = currentPlan(run, state);
    const review = evidenceReviewResult(run, true);
    const checkoutDigest = hash(JSON.stringify(checkoutIdentity(root)));
    if (state.reviewGeneration !== (state.generation ?? 0) || state.reviewPlanDigest !== plan.reportDigest || state.reviewCheckoutDigest !== checkoutDigest || JSON.stringify(paths) !== JSON.stringify(state.reviewPaths) || digest(root, paths) !== state.reviewDigest) throw new Error('Missing unchanged evidence review snapshot for the current completed plan');
    state.evidenceReviewBinding = { generation: state.generation ?? 0, planDigest: plan.reportDigest, reportDigest: review.reportDigest, checkoutDigest };
    persist(() => requireCleanEvidenceReview(run, state));
    console.log('PASS'); return;
  } else if (op === 'final-review-record') {
    if (!state.stages.includes('gate-final')) throw new Error('Missing final verification');
    if (JSON.stringify(paths) !== JSON.stringify(state.verifiedPaths) || digest(root, paths) !== state.verifiedDigest) throw new Error('Files changed after final verification');
    if (JSON.stringify(paths) !== JSON.stringify(state.reviewPaths) || digest(root, paths) !== state.reviewDigest || state.reviewCheckoutDigest !== hash(JSON.stringify(checkoutIdentity(root))) || state.verifiedCheckoutIdentity !== checkoutIdentity(root).digest) throw new Error('Missing unchanged final review snapshot or post-gate file mode/type drift');
    const review = json(join(run, 'final-review-result.json'));
    if (review.ok !== true || typeof review.findings !== 'string' || !review.findings.trim() || readFileSync(join(run, 'final-review.md'), 'utf8') !== review.findings) throw new Error('Missing clean final independent review');
    state.finalReviewDigest = digest(run, ['final-review-result.json', 'final-review.md']);
    state.finalReviewCheckoutDigest = state.verifiedCheckoutIdentity;
  } else if (op === 'ship') {
    if (state.options?.ship !== true) throw new Error('Shipment disabled: ship false keeps the verified fix local');
    if (!state.stages.includes('gate-final')) throw new Error('Missing final verification');
    if (!state.finalReviewDigest || state.finalReviewDigest !== digest(run, ['final-review-result.json', 'final-review.md']) || state.finalReviewCheckoutDigest !== state.verifiedCheckoutIdentity) throw new Error('Missing or changed clean final independent review');
    if (JSON.stringify(paths) !== JSON.stringify(state.verifiedPaths) || digest(root, paths) !== state.verifiedDigest) throw new Error('Files changed after final verification');
    if (checkoutIdentity(root).digest !== state.finalReviewCheckoutDigest) throw new Error('Checkout file bytes/mode/type changed after final verification/review');
    if (!paths.length || paths.some(p => !(p.startsWith('src/') || p.startsWith('tests/') || p.startsWith('docs/')))) throw new Error('Ship scope limited to src/, tests/, docs/; other surfaces require manual shipment');
    persist(() => {
      const assertCheckout = () => {
        if (git(root, 'rev-parse', 'HEAD') !== state.base || git(root, 'branch', '--show-current') !== state.branch || JSON.stringify(changes(root)) !== JSON.stringify(state.verifiedPaths) || digest(root, paths) !== state.verifiedDigest || checkoutIdentity(root).digest !== state.finalReviewCheckoutDigest) throw new Error('HEAD/branch or verified checkout changed before shipment');
        if (state.finalReviewDigest !== digest(run, ['final-review-result.json', 'final-review.md']) || state.finalReviewCheckoutDigest !== state.verifiedCheckoutIdentity) throw new Error('Clean final independent review changed before shipment');
      };
      assertCheckout();
      const before = verifyShippingIndex(root, paths);
      const inventory = checkoutIdentity(root).digest;
      // Recheck the inspection immediately before the only scoped index write.
      if (before.index !== git(root, 'ls-files', '--stage', '-z') || before.status !== git(root, 'status', '--porcelain=v1', '-z')) throw new Error('Index/status changed before scoped git add; reconcile manually');
      const result = command(['git', 'add', '--', ...paths], root); if (result.code !== 0) throw new Error(result.output);
      const staged = verifyShippingIndex(root, paths, true);
      assertCheckout();
      if (checkoutIdentity(root).digest !== inventory || staged.index !== git(root, 'ls-files', '--stage', '-z') || staged.status !== git(root, 'status', '--porcelain=v1', '-z')) throw new Error('Checkout/index/status changed after scoped git add; nothing was reset, reconcile manually');
      validateDecisionIntegrity(run, state);
      const commit = command(['git', 'commit', '-m', `fix: resolve bug ${state.id}`], root); if (commit.code !== 0) throw new Error(commit.output);
      // Push only the reviewed commit and current branch: no tags, force, npm publish, or unrelated refs.
      const push = command(['git', 'push', 'origin', `HEAD:refs/heads/${state.branch}`], root);
      save(join(run, 'shipment.json'), { sha: git(root, 'rev-parse', 'HEAD'), pushed: push.code === 0, output: push.output });
      if (push.code !== 0) throw new Error('Commit created, push failed. Inspect shipment.json; do not rerun the workflow blindly.');
    });
    rmSync(lock, { recursive: true });
    console.log('PASS'); return;
  } else throw new Error('Unknown operation');
  persist(); console.log('PASS');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (e) { console.error('BLOCKED: ' + e.message); process.exitCode = 1; }
}
