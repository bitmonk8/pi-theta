// Worktree-local, lockfile-frozen bootstrap. This module never discovers an SDK
// through Node resolution: an ancestor checkout is not an installation here.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const SDK = '@earendil-works/pi-coding-agent';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const inside = (root, path) => { const rel = relative(root, path); return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep)); };

// Check every component before creating/writing anything beneath it. In
// particular, recursive mkdir alone would follow a hostile .pi/tmp symlink.
function localPath(root, path, create = false) {
  if (!inside(root, path)) throw new Error('Path escapes worktree: ' + path);
  let current = root;
  for (const part of relative(root, path).split(sep).filter(Boolean)) {
    current = join(current, part);
    let stat;
    try { stat = lstatSync(current); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (stat?.isSymbolicLink()) throw new Error('Symlink traversal refused: ' + current);
    if (!stat && create) mkdirSync(current);
  }
  return path;
}

function transientEnvironment(root) {
  // Host-peer-version probes inspect ancestors of TMPDIR. Even a directory
  // outside this worktree is unsuitable if it lives inside another checkout.
  const candidates = [process.env.TMPDIR, process.env.TMP, process.env.TEMP, tmpdir(), process.platform === 'win32' ? undefined : '/tmp'];
  for (const candidate of candidates.filter(Boolean)) {
    try {
      const base = realpathSync(candidate);
      if (!lstatSync(base).isDirectory() || inside(root, base)) continue;
      let ancestor = base; let suitable = true;
      for (;;) {
        if (existsSync(join(ancestor, 'package.json')) || existsSync(join(ancestor, 'node_modules'))) { suitable = false; break; }
        const parent = dirname(ancestor); if (parent === ancestor) break; ancestor = parent;
      }
      if (!suitable) continue;
      const temporary = mkdtempSync(join(base, 'bugfix-worktree-'));
      return { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary };
    } catch { /* Try the next platform-appropriate temporary directory. */ }
  }
  throw new Error('No safe external temporary directory is available');
}

function localFile(root, path) {
  localPath(root, path);
  if (!lstatSync(path).isFile()) throw new Error('Required local file missing: ' + path);
  return path;
}
function sdkFiles(root, lock, manifest) {
  const declared = manifest.devDependencies?.[SDK] ?? manifest.dependencies?.[SDK] ?? manifest.peerDependencies?.[SDK];
  if (!declared) return [];
  const entry = lock.packages?.['node_modules/' + SDK];
  if (!entry?.version || entry.link) throw new Error('SDK requires a concrete local locked version: ' + SDK);
  const folder = join(root, 'node_modules', SDK);
  const packagePath = localFile(root, join(folder, 'package.json'));
  const installed = json(packagePath);
  if (installed.name !== SDK || installed.version !== entry.version) throw new Error('Local SDK version does not match locked version ' + entry.version);
  const bin = typeof installed.bin === 'string' ? installed.bin : installed.bin?.pi;
  if (!installed.main || !bin) throw new Error('Local SDK package must declare its main and pi CLI');
  const files = [packagePath];
  for (const target of [installed.main, bin, 'dist/cli.js']) {
    if (typeof target !== 'string' || !inside(folder, resolve(folder, target))) throw new Error('SDK entry point escapes local package');
    files.push(localFile(root, resolve(folder, target)));
  }
  return [...new Set(files)];
}
function requiredFiles(root, lock, manifest) {
  const files = sdkFiles(root, lock, manifest);
  for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
    if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name)) throw new Error('Invalid dependency name: ' + name);
    const path = join(root, 'node_modules', name, 'package.json');
    // npm's file: dependencies may be links, but must remain within this tree.
    const actual = realpathSync(path);
    if (!inside(root, actual)) throw new Error('Dependency resolves outside worktree: ' + name);
    const installed = json(localFile(root, actual));
    const entry = lock.packages?.['node_modules/' + name];
    const version = entry?.link ? lock.packages?.[entry.resolved]?.version : entry?.version;
    if (!version || installed.version !== version) throw new Error('Local dependency does not match locked version: ' + name);
    files.push(actual);
  }
  return Object.fromEntries([...new Set(files)].map(path => [relative(root, path), hash(readFileSync(path))]));
}

function* prepareEnvironment(root, reportDirectory) {
  root = realpathSync(root);
  reportDirectory = realpathSync(reportDirectory);
  if (inside(root, reportDirectory)) throw new Error('Bootstrap evidence must be outside the worktree');
  let recordPath;
  // Exclusive creation prevents overwriting earlier evidence, including failures.
  for (let number = 1; ; number++) {
    recordPath = join(reportDirectory, `bootstrap-${String(number).padStart(4, '0')}.json`);
    try { writeFileSync(recordPath, '{}\n', { flag: 'wx' }); break; } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  const record = { version: 1, root, status: 'preparing', outputPath: recordPath.replace(/\.json$/, '.log') };
  writeFileSync(record.outputPath, '', { flag: 'wx' });
  try {
    localPath(root, join(root, '.pi', 'tmp'), true);
    const markerPath = localPath(root, join(root, '.pi', 'tmp', 'worktree-env.json'));
    const env = transientEnvironment(root);
    record.temporaryDirectory = env.TMPDIR;
    const packagePath = localFile(root, join(root, 'package.json'));
    const packageBytes = readFileSync(packagePath);
    const manifest = JSON.parse(packageBytes);
    const lockPath = localPath(root, join(root, 'package-lock.json'));
    const lockBytes = existsSync(lockPath) ? readFileSync(localFile(root, lockPath)) : null;
    record.hashes = { package: hash(packageBytes), lock: lockBytes ? hash(lockBytes) : null };
    if (!lockBytes) {
      if ([manifest.dependencies, manifest.devDependencies, manifest.optionalDependencies, manifest.peerDependencies].some(deps => Object.keys(deps ?? {}).length)) {
        throw new Error('Dependency-declaring package requires package-lock.json; refusing an unfrozen install');
      }
      record.install = 'skipped';
      record.reason = 'Dependency-free fixture without package-lock.json';
    } else {
      const lock = JSON.parse(lockBytes);
      for (const kind of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        const sorted = value => JSON.stringify(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b)));
        if (sorted(manifest[kind]) !== sorted(lock.packages?.['']?.[kind])) throw new Error('package.json and package-lock.json disagree: ' + kind);
      }
      let marker; let files;
      try { marker = json(markerPath); files = requiredFiles(root, lock, manifest); } catch { /* Install again; never trust ancestor packages or an incomplete local tree. */ }
      const validated = marker?.version === 1 && JSON.stringify(marker.hashes) === JSON.stringify(record.hashes)
        && files && JSON.stringify(marker.files) === JSON.stringify(files);
      if (validated) record.install = 'validated-local-install';
      else {
        // Refuse a node_modules symlink before npm ci can remove/replace entries.
        localPath(root, join(root, 'node_modules'));
        record.install = 'npm-ci';
        const npmArgs = ['ci', '--ignore-scripts', '--no-audit', '--no-fund'];
        // spawnSync cannot execute .cmd files directly on Windows. Only this
        // fixed command text goes through cmd.exe; no paths/manifest text do.
        record.argv = process.platform === 'win32'
          ? [process.env.ComSpec || 'cmd.exe', '/d', '/s', '/c', 'npm ' + npmArgs.join(' ')]
          : ['npm', ...npmArgs];
        const result = yield [record.argv, root, 30 * 60 * 1000, { ...env, NODE_ENV: 'development', npm_config_include: 'dev', npm_config_omit: '', npm_config_global: 'false' }];
        record.exitCode = result.code;
        record.commandError = result.error;
        writeFileSync(record.outputPath, result.output ?? '');
        if (!readFileSync(packagePath).equals(packageBytes) || !readFileSync(lockPath).equals(lockBytes)) throw new Error('Frozen bootstrap changed package.json or package-lock.json; refusing validation');
        if (result.code !== 0) throw new Error('npm ci failed (exit ' + result.code + ')');
        files = requiredFiles(root, lock, manifest);
        writeFileSync(markerPath, JSON.stringify({ version: 1, hashes: record.hashes, files }, null, 2) + '\n');
      }
      record.files = files;
    }
    record.status = 'ready';
    writeFileSync(recordPath, JSON.stringify(record, null, 2) + '\n');
    return { recordPath, env };
  } catch (error) {
    record.status = 'failed';
    record.error = error.message;
    writeFileSync(recordPath, JSON.stringify(record, null, 2) + '\n');
    throw new Error(`Worktree bootstrap failed: ${error.message} (evidence: ${recordPath})`, { cause: error });
  }
}

// One bootstrap contract, with sync legacy callers and a supervised async gate.
export function prepareWorktreeEnvironment(root, reportDirectory, runCommand) {
  const work = prepareEnvironment(root, reportDirectory);
  let step = work.next();
  while (!step.done) {
    let result;
    try { result = runCommand(...step.value); } catch (error) { step = work.throw(error); continue; }
    step = work.next(result);
  }
  return step.value;
}
export async function prepareWorktreeEnvironmentAsync(root, reportDirectory, runCommand) {
  const work = prepareEnvironment(root, reportDirectory);
  let step = work.next();
  while (!step.done) {
    let result;
    try { result = await runCommand(...step.value); } catch (error) { step = work.throw(error); continue; }
    step = work.next(result);
  }
  return step.value;
}
