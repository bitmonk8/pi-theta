import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

// Only called after the reviewed pi-theta commit has successfully been pushed.
// Keep this separate from release/versioning: this is a consumer dependency pin.
export function updatePiConfig(sha, run, config = join(homedir(), '.pi/agent/git/github.com/bitmonk8/pi-config')) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Expected a full pi-theta commit SHA');
  const exec = (...argv) => {
    const result = run(argv, config);
    if (result.code !== 0) throw new Error(`pi-config: ${argv.slice(0, 3).join(' ')} failed: ${result.output}`);
    return result.output.trim();
  };
  const clean = () => {
    if (exec('git', 'status', '--porcelain=v1', '--untracked-files=all')) throw new Error('pi-config must be clean; preserve existing work and reconcile manually');
  };
  if (exec('git', 'branch', '--show-current') !== 'main') throw new Error('pi-config must be on main');
  clean();
  exec('git', 'pull', '--rebase', 'origin', 'main');
  clean();
  const head = exec('git', 'ls-remote', 'https://github.com/bitmonk8/pi-theta.git', 'HEAD').split(/\s+/)[0];
  if (head !== sha) throw new Error('Pushed pi-theta commit is not remote HEAD; reconcile before updating pi-config');
  exec('npm', 'install', '--save', '--legacy-peer-deps', '--ignore-scripts', '--no-audit', '--no-fund', `github:bitmonk8/pi-theta#${sha}`);
  const verifyPin = () => {
    const pkg = JSON.parse(readFileSync(join(config, 'package.json'), 'utf8'));
    const lock = JSON.parse(readFileSync(join(config, 'package-lock.json'), 'utf8'));
    const spec = `github:bitmonk8/pi-theta#${sha}`;
    if (pkg.dependencies?.['@bitmonk8/pi-theta'] !== spec || lock.packages?.[''].dependencies?.['@bitmonk8/pi-theta'] !== spec || !lock.packages?.['node_modules/@bitmonk8/pi-theta']?.resolved?.endsWith(`#${sha}`)) {
      throw new Error('pi-config manifest/lock did not resolve the requested pi-theta HEAD');
    }
  };
  verifyPin();
  const paths = exec('git', 'diff', '--name-only', 'HEAD').split('\n').filter(Boolean);
  if (paths.some(path => !['package.json', 'package-lock.json'].includes(path)) || exec('git', 'ls-files', '--others', '--exclude-standard')) throw new Error('Unexpected pi-config changes; nothing committed, reconcile manually');
  if (paths.length) {
    exec('git', 'add', '--', 'package.json', 'package-lock.json');
    exec('git', 'commit', '-m', `chore: update pi-theta to ${sha.slice(0, 12)}`);
  }
  // Follow the canonical live clone's workflow. Never force-push or discard work.
  exec('git', 'pull', '--rebase', 'origin', 'main');
  verifyPin();
  exec('git', 'push', 'origin', 'main');
  clean();
  return { sha: exec('git', 'rev-parse', 'HEAD'), thetaSha: sha, pushed: true };
}
