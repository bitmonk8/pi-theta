import { describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
// @ts-expect-error standalone workflow helper is deliberately plain ESM
import { prepareWorktreeEnvironment } from '../tools/bugfix/worktree-env.mjs';

const SDK = '@earendil-works/pi-coding-agent';
const SDK_VERSION = '1.3.0';
function put(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
}
function fixture(locked = true) {
  const base = mkdtempSync(join(tmpdir(), 'bugfix-env-test-'));
  const source = join(base, 'source'); const root = join(source, '.trees', 'work');
  const report = join(source, '.pi', 'tmp', 'reports'); const external = join(base, 'external');
  mkdirSync(source); mkdirSync(report, { recursive: true }); mkdirSync(external);
  const git = (...args: string[]) => {
    const result = spawnSync('git', args, { cwd: source, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr + result.stdout);
  };
  git('init', '-b', 'main'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Worktree Test');
  const manifest = locked ? { name: '@bitmonk8/pi-theta', devDependencies: { [SDK]: '~1.3.0' } } : { name: 'dependency-free-fixture' };
  put(join(source, 'package.json'), manifest);
  put(join(source, '.gitignore'), '.pi/tmp/\n.trees/\nnode_modules/\n');
  const lock = { lockfileVersion: 3, packages: { '': manifest, ['node_modules/' + SDK]: { version: SDK_VERSION } } };
  if (locked) put(join(source, 'package-lock.json'), lock);
  git('add', '.'); git('commit', '-m', 'fixture'); git('worktree', 'add', '-b', 'work', root);
  vi.stubEnv('TMPDIR', external); vi.stubEnv('TMP', external); vi.stubEnv('TEMP', external);
  const records = () => readdirSync(report).filter(name => name.endsWith('.json')).sort().map(name => JSON.parse(readFileSync(join(report, name), 'utf8')));
  const install = (at = root, version = SDK_VERSION) => {
    const sdk = join(at, 'node_modules', SDK);
    put(join(sdk, 'package.json'), { name: SDK, version, main: './dist/index.js', bin: { pi: 'dist/bundle/cli.js' } });
    for (const file of ['dist/index.js', 'dist/cli.js', 'dist/bundle/cli.js']) put(join(sdk, file), '// installed SDK entry point\n');
  };
  const run = vi.fn((_argv: string[], cwd: string) => { install(cwd); return { code: 0, output: 'installed locked dependencies\n' }; });
  const prepare = (runner = run) => prepareWorktreeEnvironment(root, report, runner);
  const cleanup = () => {
    // Every directory here was created by this test or its bootstrap calls.
    for (const record of records()) {
      const temporary = record.temporaryDirectory;
      if (temporary && !temporary.startsWith(base + sep)) {
        expect(temporary.split(sep).at(-1)).toMatch(/^bugfix-worktree-/);
        rmSync(temporary, { recursive: true, force: true });
      }
    }
    vi.unstubAllEnvs(); rmSync(base, { recursive: true, force: true });
  };
  return { base, source, root, report, external, manifest, lock, records, install, run, prepare, cleanup };
}

describe('deterministic worktree bootstrap', () => {
  it('creates .pi/tmp in a real dependency-free Git worktree, records the explicit skip, and isolates temporary files', () => {
    const f = fixture(false);
    try {
      vi.stubEnv('TMPDIR', join(f.root, 'inherited-temp')); mkdirSync(process.env.TMPDIR!);
      vi.stubEnv('TMP', f.external); vi.stubEnv('TEMP', f.external);
      const { env, recordPath } = f.prepare();
      expect(existsSync(join(f.root, '.pi/tmp'))).toBe(true);
      expect(f.run).not.toHaveBeenCalled();
      expect(JSON.parse(readFileSync(recordPath, 'utf8'))).toMatchObject({ status: 'ready', install: 'skipped', reason: 'Dependency-free fixture without package-lock.json' });
      expect(env.TMPDIR).toBe(env.TMP); expect(env.TMP).toBe(env.TEMP);
      expect(relative(f.external, env.TMPDIR)).not.toMatch(/^\.\./);
      expect(env.PATH).toBe(process.env.PATH);
      put(join(env.TMPDIR, 'probe'), 'safe');
      expect(existsSync(join(f.root, 'probe'))).toBe(false);
    } finally { f.cleanup(); }
  });

  it('runs frozen local npm ci, preserves output, and only reuses a hash-bound validated local installation', () => {
    const f = fixture();
    try {
      const before = ['package.json', 'package-lock.json'].map(path => readFileSync(join(f.root, path), 'utf8'));
      const first = f.prepare(); const second = f.prepare();
      expect(f.run).toHaveBeenCalledTimes(1);
      const argv = process.platform === 'win32'
        ? [process.env.ComSpec || 'cmd.exe', '/d', '/s', '/c', 'npm ci --ignore-scripts --no-audit --no-fund']
        : ['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'];
      expect(f.run.mock.calls[0]!.slice(0, 2)).toEqual([argv, f.root]);
      const call = f.run.mock.calls[0] as unknown as [string[], string, number, NodeJS.ProcessEnv];
      expect(call[2]).toBeGreaterThan(0);
      expect(call[3]).toMatchObject({ TMPDIR: first.env.TMPDIR, NODE_ENV: 'development', npm_config_include: 'dev', npm_config_omit: '', npm_config_global: 'false' });
      expect(first.env.TMPDIR).not.toBe(second.env.TMPDIR);
      expect(first.recordPath).not.toBe(second.recordPath);
      const [installed, reused] = f.records();
      expect(installed).toMatchObject({ install: 'npm-ci', exitCode: 0, status: 'ready' });
      expect(readFileSync(installed.outputPath, 'utf8')).toBe('installed locked dependencies\n');
      expect(reused.install).toBe('validated-local-install');
      expect(['package.json', 'package-lock.json'].map(path => readFileSync(join(f.root, path), 'utf8'))).toEqual(before);
      put(join(f.root, 'package.json'), { ...f.manifest, description: 'changed hash' });
      f.prepare(); expect(f.run).toHaveBeenCalledTimes(2);
      put(join(f.root, 'package-lock.json'), { ...f.lock, changedHash: true });
      f.prepare(); expect(f.run).toHaveBeenCalledTimes(3);
    } finally { f.cleanup(); }
  });

  it('does not trust ancestor dependencies or an unvalidated existing local SDK', () => {
    const f = fixture();
    try {
      f.install(f.source); f.install();
      f.prepare(); expect(f.run).toHaveBeenCalledTimes(1);
      rmSync(join(f.root, 'node_modules'), { recursive: true });
      const noInstall = vi.fn(() => ({ code: 0, output: 'pretend success' }));
      expect(() => f.prepare(noInstall)).toThrow(/ENOENT|missing/);
      expect(noInstall).toHaveBeenCalledTimes(1);
      expect(f.records().at(-1).status).toBe('failed');
    } finally { f.cleanup(); }
  });

  it.each(['dist/index.js', 'dist/cli.js', 'dist/bundle/cli.js', 'package.json'])('checks the real local SDK %s every call, including after a runner reports success', file => {
    const f = fixture();
    try {
      f.prepare();
      rmSync(join(f.root, 'node_modules', SDK, file));
      const noInstall = vi.fn(() => ({ code: 0, output: 'did not restore required file' }));
      expect(() => f.prepare(noInstall)).toThrow(/ENOENT|missing/);
      expect(noInstall).toHaveBeenCalledTimes(1);
      f.prepare(); expect(f.run).toHaveBeenCalledTimes(2);
      expect(f.records().at(-1).status).toBe('ready');
    } finally { f.cleanup(); }
  });

  it('rejects the wrong installed SDK version and retries when a validated file is modified', () => {
    const f = fixture();
    try {
      const wrongVersion = vi.fn(() => { f.install(f.root, '9.9.9'); return { code: 0, output: 'wrong version' }; });
      expect(() => f.prepare(wrongVersion)).toThrow(/locked version 1\.3\.0/);
      f.prepare();
      put(join(f.root, 'node_modules', SDK, 'dist/index.js'), '// tampered\n');
      f.prepare(); expect(f.run).toHaveBeenCalledTimes(2);
    } finally { f.cleanup(); }
  });

  it('preserves failed npm exit/output and never treats the failed install as validated', () => {
    const f = fixture();
    try {
      const fail = vi.fn(() => ({ code: 17, output: 'npm ERR! deterministic failure\n', error: 'injected failure' }));
      expect(() => f.prepare(fail)).toThrow(/npm ci failed \(exit 17\).*evidence:/);
      const record = f.records()[0];
      expect(record).toMatchObject({ status: 'failed', exitCode: 17, commandError: 'injected failure' });
      expect(readFileSync(record.outputPath, 'utf8')).toContain('deterministic failure');
      expect(existsSync(join(f.root, '.pi/tmp/worktree-env.json'))).toBe(false);
      f.prepare(); expect(f.run).toHaveBeenCalledTimes(1);
    } finally { f.cleanup(); }
  });

  it.each(['package.json', 'package-lock.json'])('fails rather than validating npm mutations of frozen %s', file => {
    const f = fixture();
    try {
      const mutate = vi.fn(() => { f.install(); put(join(f.root, file), '{}'); return { code: 0, output: 'mutated frozen input' }; });
      expect(() => f.prepare(mutate)).toThrow(/Frozen bootstrap changed/);
      expect(f.records()[0]).toMatchObject({ status: 'failed', exitCode: 0 });
      expect(existsSync(join(f.root, '.pi/tmp/worktree-env.json'))).toBe(false);
      // Bootstrap reports damage; it does not silently overwrite the changed file.
      expect(readFileSync(join(f.root, file), 'utf8')).toBe('{}');
    } finally { f.cleanup(); }
  });

  it('fails loudly for an SDK declaration without a lock and for inconsistent frozen manifests', () => {
    const f = fixture();
    try {
      rmSync(join(f.root, 'package-lock.json'));
      expect(() => f.prepare()).toThrow(/requires package-lock.json/);
      put(join(f.root, 'package-lock.json'), { ...f.lock, packages: { ...f.lock.packages, '': { devDependencies: { [SDK]: '~2.0.0' } } } });
      expect(() => f.prepare()).toThrow(/disagree: devDependencies/);
      expect(f.run).not.toHaveBeenCalled();
    } finally { f.cleanup(); }
  });

  it.each(['.pi', '.pi/tmp', '.pi/tmp/worktree-env.json', 'node_modules'])('refuses symlink traversal through %s without touching its target', path => {
    const f = fixture();
    try {
      const target = join(f.base, 'symlink-target'); mkdirSync(target); put(join(target, 'keep'), 'untouched');
      mkdirSync(dirname(join(f.root, path)), { recursive: true });
      symlinkSync(target, join(f.root, path), process.platform === 'win32' ? 'junction' : 'dir');
      expect(() => f.prepare()).toThrow(/Symlink traversal refused/);
      expect(f.run).not.toHaveBeenCalled();
      expect(readdirSync(target)).toEqual(['keep']);
      expect(f.records()[0].status).toBe('failed');
    } finally { f.cleanup(); }
  });

  it('checks other direct local dependencies even when the SDK remains ready', () => {
    const f = fixture();
    try {
      const manifest = { ...f.manifest, dependencies: { helper: '^2.0.0' } };
      put(join(f.root, 'package.json'), manifest);
      put(join(f.root, 'package-lock.json'), { ...f.lock, packages: { ...f.lock.packages, '': manifest, 'node_modules/helper': { version: '2.0.1' } } });
      const install = vi.fn(() => { f.install(); put(join(f.root, 'node_modules/helper/package.json'), { name: 'helper', version: '2.0.1' }); return { code: 0, output: 'installed all dependencies' }; });
      f.prepare(install); f.prepare(install); expect(install).toHaveBeenCalledTimes(1);
      rmSync(join(f.root, 'node_modules/helper'), { recursive: true });
      expect(() => f.prepare(f.run)).toThrow(/ENOENT/);
      expect(f.records().at(-1).status).toBe('failed');
    } finally { f.cleanup(); }
  });

  it('never accepts an SDK symlink to the parent installation', () => {
    const f = fixture();
    try {
      f.install(f.source);
      mkdirSync(join(f.root, 'node_modules', '@earendil-works'), { recursive: true });
      symlinkSync(join(f.source, 'node_modules', SDK), join(f.root, 'node_modules', SDK), process.platform === 'win32' ? 'junction' : 'dir');
      const noInstall = vi.fn(() => ({ code: 0, output: 'left parent symlink in place' }));
      expect(() => f.prepare(noInstall)).toThrow(/Symlink traversal refused/);
      expect(f.records()[0].status).toBe('failed');
    } finally { f.cleanup(); }
  });

  it('falls back to system temporary storage if inherited temporary paths have repository ancestors', () => {
    const f = fixture(false);
    try {
      put(join(f.source, 'package.json'), '{}');
      const inherited = join(f.source, '.pi/tmp/inherited'); mkdirSync(inherited, { recursive: true });
      for (const name of ['TMPDIR', 'TMP', 'TEMP']) vi.stubEnv(name, inherited);
      const { env } = f.prepare();
      expect(env.TMPDIR.startsWith(f.source + sep)).toBe(false);
      expect(existsSync(env.TMPDIR)).toBe(true);
    } finally { f.cleanup(); }
  });
});
