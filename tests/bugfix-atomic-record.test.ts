import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const moduleUrl = pathToFileURL(resolve('tools/bugfix/atomic-record.mjs')).href;
const scratch: string[] = [];
const value = { kind: 'immutable-record', payload: '完整 JSON '.repeat(1024) };
const encoded = JSON.stringify(value, null, 2) + '\n';
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'bugfix-atomic-record-'));
  scratch.push(root);
  return { root, path: join(root, 'record.json') };
}
// Real child processes + filesystem interposition give exact write/publication
// boundaries, without adding production test hooks or timing-based readers.
function publish(path: string, interpose = '', body = 'atomicImmutableJson(path, value);') {
  return spawnSync(process.execPath, ['--input-type=module', '-e', `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    import { spawnSync } from 'node:child_process';
    const path = ${JSON.stringify(path)};
    const value = ${JSON.stringify(value)};
    const moduleUrl = ${JSON.stringify(moduleUrl)};
    ${interpose}
    syncBuiltinESMExports();
    const { atomicImmutableJson } = await import(moduleUrl);
    ${body}
  `], { encoding: 'utf8', timeout: 10000 });
}
function success(host: ReturnType<typeof publish>) { expect(host.status, host.stderr).toBe(0); }
afterEach(() => { for (const root of scratch.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('atomic immutable JSON publication', () => {
  it('keeps final names absent through partial writes, file fsync and close; publishes complete bytes with a no-clobber link', () => {
    const { root, path } = fixture();
    const host = publish(path, `
      const events = [];
      const observations = [];
      const fds = new Map();
      let temporary;
      function observe() {
        const host = spawnSync(process.execPath, ['-e', ${JSON.stringify(`
          const fs = require('node:fs');
          try { console.log(JSON.stringify({ value: JSON.parse(fs.readFileSync(process.argv[1], 'utf8')) })); }
          catch (error) { console.log(JSON.stringify({ error: error.code === 'ENOENT' ? 'absent' : String(error) })); }
        `)}, path], { encoding: 'utf8' });
        if (host.status !== 0) throw new Error(host.stderr);
        observations.push(JSON.parse(host.stdout));
      }
      const open = fs.openSync, write = fs.writeFileSync, sync = fs.fsyncSync, close = fs.closeSync, link = fs.linkSync, unlink = fs.unlinkSync;
      fs.openSync = function(name, flags, mode) {
        const fd = open(name, flags, mode); fds.set(fd, name);
        if (flags === 'wx') { temporary = name; events.push('open-private'); }
        return fd;
      };
      fs.writeFileSync = function(fd, data) {
        events.push('write');
        const bytes = Buffer.from(data), split = Math.floor(bytes.length / 2);
        write(fd, bytes.subarray(0, split)); observe();
        write(fd, bytes.subarray(split));
      };
      fs.fsyncSync = function(fd) {
        sync(fd);
        events.push(fds.get(fd) === temporary ? 'fsync-file' : 'fsync-directory'); observe();
      };
      fs.closeSync = function(fd) {
        const file = fds.get(fd); close(fd); fds.delete(fd);
        if (file === temporary) { events.push('close-file'); observe(); }
      };
      fs.linkSync = function(from, to) { events.push('link'); link(from, to); observe(); };
      fs.unlinkSync = function(name) { events.push('unlink-private'); unlink(name); };
    `, `
      atomicImmutableJson(path, value);
      console.log(JSON.stringify({ events, observations, temporary }));
    `);
    success(host);
    const result = JSON.parse(host.stdout);
    expect(result.events).toEqual(['open-private', 'write', 'fsync-file', 'close-file', 'link', 'unlink-private', 'fsync-directory']);
    expect(result.observations.slice(0, 3)).toEqual([{ error: 'absent' }, { error: 'absent' }, { error: 'absent' }]);
    expect(result.observations.slice(3)).toEqual([{ value }, { value }]);
    expect(dirname(result.temporary)).toBe(root);
    expect(result.temporary).not.toBe(path);
    expect(readFileSync(path, 'utf8')).toBe(encoded);
    expect(lstatSync(path).mode & 0o777).toBe(0o600);
    expect(readdirSync(root)).toEqual(['record.json']);
  });

  it.each(['undefined', '1n', '(() => { const cyclic = {}; cyclic.self = cyclic; return cyclic; })()'])('rejects non-JSON input %s before creating evidence', expression => {
    const { root, path } = fixture();
    const host = publish(path, '', `
      try { atomicImmutableJson(path, ${expression}); process.exitCode = 90; }
      catch (error) { console.log(error.name); }
    `);
    success(host);
    expect(host.stdout.trim()).toBe('TypeError');
    expect(readdirSync(root)).toEqual([]);
  });

  it('refuses an existing record without changing its bytes or permissions', () => {
    const { root, path } = fixture();
    writeFileSync(path, '{"original":true}\n', { mode: 0o600 });
    const host = publish(path, '', `
      try { atomicImmutableJson(path, value); process.exitCode = 90; }
      catch (error) { console.log(error.code); }
    `);
    success(host);
    expect(host.stdout.trim()).toBe('EEXIST');
    expect(readFileSync(path, 'utf8')).toBe('{"original":true}\n');
    expect(lstatSync(path).mode & 0o777).toBe(0o600);
    expect(readdirSync(root)).toEqual(['record.json']);
  });

  it('does not follow or replace an existing destination symlink', () => {
    const { root, path } = fixture();
    const target = join(root, 'target');
    writeFileSync(target, 'original'); symlinkSync(target, path);
    const host = publish(path, '', `
      try { atomicImmutableJson(path, value); process.exitCode = 90; }
      catch (error) { console.log(error.code); }
    `);
    success(host);
    expect(host.stdout.trim()).toBe('EEXIST');
    expect(lstatSync(path).isSymbolicLink()).toBe(true);
    expect(readFileSync(target, 'utf8')).toBe('original');
  });

  it('cannot replace a competing publisher that wins after private-file completion', () => {
    const { root, path } = fixture();
    const host = publish(path, `
      const link = fs.linkSync;
      fs.linkSync = function(from, to) {
        const winner = spawnSync(process.execPath, ['--input-type=module', '-e',
          'const { atomicImmutableJson } = await import(' + JSON.stringify(moduleUrl) + '); atomicImmutableJson(' + JSON.stringify(path) + ', { winner: true });'
        ], { encoding: 'utf8' });
        if (winner.status !== 0) throw new Error(winner.stderr);
        return link(from, to);
      };
    `, `
      try { atomicImmutableJson(path, value); process.exitCode = 90; }
      catch (error) { console.log(error.code); }
    `);
    success(host);
    expect(host.stdout.trim()).toBe('EEXIST');
    expect(readFileSync(path, 'utf8')).toBe(JSON.stringify({ winner: true }, null, 2) + '\n');
    expect(readdirSync(root)).toEqual(['record.json']);
  });

  it.each(['write', 'fsync', 'close', 'link'])('fails closed on a %s failure without publishing or leaking private files', stage => {
    const { root, path } = fixture();
    const host = publish(path, `
      const stage = ${JSON.stringify(stage)};
      const fault = () => { throw Object.assign(new Error('injected failure'), { code: 'ENOTSUP' }); };
      if (stage === 'write') fs.writeFileSync = function(fd) { fs.writeSync(fd, '{'); fault(); };
      if (stage === 'fsync') fs.fsyncSync = fault;
      if (stage === 'close') {
        const open = fs.openSync, close = fs.closeSync; let privateFd;
        fs.openSync = function(name, flags, mode) { const fd = open(name, flags, mode); if (flags === 'wx') privateFd = fd; return fd; };
        fs.closeSync = function(fd) { close(fd); if (fd === privateFd) fault(); };
      }
      if (stage === 'link') fs.linkSync = fault;
    `, `
      try { atomicImmutableJson(path, value); process.exitCode = 90; }
      catch (error) { console.log(error.code); }
    `);
    success(host);
    expect(host.stdout.trim()).toBe('ENOTSUP');
    expect(existsSync(path)).toBe(false);
    expect(readdirSync(root)).toEqual([]);
  });

  it('reports a post-publication directory fsync failure, retaining complete final evidence', () => {
    const { root, path } = fixture();
    const host = publish(path, `
      const sync = fs.fsyncSync;
      fs.fsyncSync = function(fd) {
        if (fs.fstatSync(fd).isDirectory()) throw Object.assign(new Error('directory fsync unsupported'), { code: 'ENOTSUP' });
        sync(fd);
      };
    `, `
      try { atomicImmutableJson(path, value); process.exitCode = 90; }
      catch (error) { console.log(error.code); }
    `);
    success(host);
    expect(host.stdout.trim()).toBe('ENOTSUP');
    expect(readFileSync(path, 'utf8')).toBe(encoded);
    expect(readdirSync(root)).toEqual(['record.json']);
  });

  it.each(['before-link', 'after-link', 'after-directory-fsync'])('preserves absent-or-complete evidence on SIGKILL %s', boundary => {
    const { root, path } = fixture();
    const host = publish(path, `
      const boundary = ${JSON.stringify(boundary)};
      const link = fs.linkSync, sync = fs.fsyncSync;
      fs.linkSync = function(from, to) {
        if (boundary === 'before-link') process.kill(process.pid, 'SIGKILL');
        link(from, to);
        if (boundary === 'after-link') process.kill(process.pid, 'SIGKILL');
      };
      fs.fsyncSync = function(fd) {
        sync(fd);
        if (boundary === 'after-directory-fsync' && fs.fstatSync(fd).isDirectory()) process.kill(process.pid, 'SIGKILL');
      };
    `);
    expect(host.signal, host.stderr).toBe('SIGKILL');
    expect(existsSync(path)).toBe(boundary !== 'before-link');
    if (existsSync(path)) expect(readFileSync(path, 'utf8')).toBe(encoded);
    const privateFiles = readdirSync(root).filter(name => name !== 'record.json');
    expect(privateFiles).toHaveLength(boundary === 'after-directory-fsync' ? 0 : 1);
    for (const name of privateFiles) {
      expect(name.endsWith('.json')).toBe(false); // not a journal record
      expect(readFileSync(join(root, name), 'utf8')).toBe(encoded);
      expect(lstatSync(join(root, name)).mode & 0o777).toBe(0o600);
      if (existsSync(path)) expect(lstatSync(join(root, name)).ino).toBe(lstatSync(path).ino);
    }
  });
});
