import { it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error standalone Node control-plane module
import { updatePiConfig } from '../tools/bugfix/update-pi-config.mjs';

const sha = 'a'.repeat(40);
function fixture(options: { dirty?: boolean; wrongHead?: boolean; badLock?: boolean; pushFails?: boolean; unrelated?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'theta-config-'));
  const calls: string[][] = [];
  const run = (argv: string[], cwd: string) => {
    expect(cwd).toBe(dir);
    calls.push(argv);
    const cmd = argv.join(' ');
    let output = '';
    if (cmd === 'git branch --show-current') output = 'main';
    if (cmd.startsWith('git status') && options.dirty) output = ' M notes.md';
    if (cmd.startsWith('git ls-remote')) output = `${options.wrongHead ? 'b'.repeat(40) : sha}\tHEAD`;
    if (cmd.startsWith('npm install')) {
      const dependencies = { '@bitmonk8/pi-theta': `github:bitmonk8/pi-theta#${sha}` };
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies }));
      writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({ packages: { '': { dependencies }, 'node_modules/@bitmonk8/pi-theta': { resolved: `git+ssh://git@github.com/bitmonk8/pi-theta.git#${options.badLock ? 'b'.repeat(40) : sha}` } } }));
    }
    if (cmd === 'git diff --name-only HEAD') output = options.unrelated ? 'notes.md' : 'package.json\npackage-lock.json';
    if (cmd === 'git rev-parse HEAD') output = 'c'.repeat(40);
    return { code: options.pushFails && cmd === 'git push origin main' ? 1 : 0, output };
  };
  return { dir, calls, run, clean: () => rmSync(dir, { recursive: true, force: true }) };
}
it('installs the exact pushed HEAD, verifies manifest/lock and commits/pushes only the dependency files', () => {
  const f = fixture();
  try {
    expect(updatePiConfig(sha, f.run, f.dir)).toEqual({ sha: 'c'.repeat(40), thetaSha: sha, pushed: true });
    expect(f.calls).toContainEqual(['git', 'add', '--', 'package.json', 'package-lock.json']);
    expect(f.calls.filter(c => c[1] === 'pull')).toHaveLength(2);
    expect(f.calls).toContainEqual(['npm', 'install', '--save', '--legacy-peer-deps', '--ignore-scripts', '--no-audit', '--no-fund', `github:bitmonk8/pi-theta#${sha}`]);
    expect(f.calls).toContainEqual(['git', 'push', 'origin', 'main']);
  } finally { f.clean(); }
});
it.each([
  [{ dirty: true }, /must be clean/],
  [{ wrongHead: true }, /not remote HEAD/],
  [{ badLock: true }, /did not resolve/],
  [{ unrelated: true }, /Unexpected/],
] as const)('refuses unsafe consumer updates: %j', (options, error) => {
  const f = fixture(options);
  try {
    expect(() => updatePiConfig(sha, f.run, f.dir)).toThrow(error);
    expect(f.calls.some(c => c[1] === 'commit' || c[1] === 'push')).toBe(false);
    if ('dirty' in options || 'wrongHead' in options) expect(f.calls.some(c => c[0] === 'npm')).toBe(false);
  } finally { f.clean(); }
});
it('reports a consumer push failure rather than claiming full shipment', () => {
  const f = fixture({ pushFails: true });
  try { expect(() => updatePiConfig(sha, f.run, f.dir)).toThrow(/push origin failed/); }
  finally { f.clean(); }
});
