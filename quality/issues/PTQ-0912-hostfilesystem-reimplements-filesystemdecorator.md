---
id: PTQ-0912
title: host-config-dir.test.ts's HostFileSystem re-implements the pass-through delegation tests/helpers/fake-file-system.ts already exports as FileSystemDecorator
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/host-config-dir.test.ts:99-152
  - tests/helpers/fake-file-system.ts:399-435
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260918075903
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# host-config-dir.test.ts's HostFileSystem re-implements the pass-through delegation tests/helpers/fake-file-system.ts already exports as FileSystemDecorator

## Observation
`tests/host-config-dir.test.ts` declares a module-local class `HostFileSystem
implements FileSystem` that wraps a `FakeFileSystem`, overrides
`configDirName()` / `globalAgentDir()`, instruments `readText` / `readBytes` /
`readdir`, and forwards the six remaining `FileSystem` members
(`writeText`, `exists`, `homedir`, `cwd`, `lstat`, `realpath`) to the inner
fake with a bare `return this.#inner.<member>(...)` body each.
`tests/helpers/fake-file-system.ts` already exports `FileSystemDecorator`, a
class built for exactly this shape — delegate every `FileSystem` member,
letting a subclass override only the ones it needs — whose own six
pass-through bodies for the same six members are the identical
`return this.inner.<member>(...)` one-liners, differing only in the private
field's access syntax (`this.#inner` vs `this.inner`).

## Evidence
`tests/host-config-dir.test.ts:99-152` (the six untouched pass-through
members occupy :134-151 of this class):
```ts
class HostFileSystem implements FileSystem {
  ...
  writeText(path: string, contents: string): Promise<void> {
    return this.#inner.writeText(path, contents);
  }
  exists(path: string): Promise<boolean> {
    return this.#inner.exists(path);
  }
  homedir(): string {
    return this.#inner.homedir();
  }
  cwd(): string {
    return this.#inner.cwd();
  }
  lstat(path: string): Promise<FileStat> {
    return this.#inner.lstat(path);
  }
  realpath(path: string): Promise<string> {
    return this.#inner.realpath(path);
  }
}
```

`tests/helpers/fake-file-system.ts:399-435` (the exported, already-available
decorator with the identical six bodies):
```ts
export class FileSystemDecorator implements FileSystem {
  constructor(protected readonly inner: FileSystem) {}

  readText(path: string): Promise<string> {
    return this.inner.readText(path);
  }
  readBytes(path: string): Promise<Uint8Array> {
    return this.inner.readBytes(path);
  }
  writeText(path: string, contents: string): Promise<void> {
    return this.inner.writeText(path, contents);
  }
  exists(path: string): Promise<boolean> {
    return this.inner.exists(path);
  }
  homedir(): string {
    return this.inner.homedir();
  }
  cwd(): string {
    return this.inner.cwd();
  }
  configDirName(): string {
    return this.inner.configDirName();
  }
  globalAgentDir(): string {
    return this.inner.globalAgentDir();
  }
  readdir(path: string): Promise<readonly string[]> {
    return this.inner.readdir(path);
  }
  lstat(path: string): Promise<FileStat> {
    return this.inner.lstat(path);
  }
  realpath(path: string): Promise<string> {
    return this.inner.realpath(path);
  }
}
```
`tests/helpers/fake-file-system.ts` also already contains a subclass of
`FileSystemDecorator` — `ReaddirDeniedFileSystem` — that overrides only
`readdir` and leaves every other member to the parent's pass-through. The
comment at `tests/host-config-dir.test.ts:96-97` ("The delegation shape
mirrors `ReaddirDenied`
(tests/discovery-root-enumeration-failure.test.ts:302-352)") shows the
author was aware of this exact decorator family while writing a fresh,
independent implementation of it rather than extending
`FileSystemDecorator`.

## Why this is a problem
`FileSystemDecorator` exists specifically so a test needing to intercept a
subset of `FileSystem` members does not have to retype the other members'
forwarding bodies; `HostFileSystem` needs to intercept `configDirName`,
`globalAgentDir`, `readText`, `readBytes`, and `readdir` (five members) but
retypes six more members verbatim to satisfy the `implements FileSystem`
contract instead of extending the decorator and inheriting them.

## Suggested direction (non-binding, optional)
`HostFileSystem extends FileSystemDecorator`, overriding only
`configDirName`, `globalAgentDir`, `readText`, `readBytes`, and `readdir`
(the five members it actually changes), is the shape `ReaddirDeniedFileSystem`
in the same helper module already takes for the same decorator.

## False-positive check
- Gate-pin check: `host-config-dir.test.ts` does not match `*gate*.test.ts`
  or a listed gate kin; not a pinned-count/inventory gate.
- Recording-double check: the six cited members are pure pass-throughs
  carrying no "never called" witness; the file's genuine recording members
  (`reads`, `listings`) are on the intercepted members, not the ones cited
  here, and are unaffected by this observation.
- docs/bugs/ signature search: `grep -rln "HostFileSystem\|FileSystemDecorator" docs/bugs/` → 0 hits; no bug document attributes a deliberate reason for a standalone implementation.
- coverage-matrix/bug-doc citation search: `grep -n "host-config-dir" docs/reference/coverage-matrix.md` → 0 hits. No merge, rename, or deletion of any `it()`/`describe()` is proposed here — the class is internal test scaffolding, not a named test.
- Coverage check: this observation is about a duplicated class body, not
  about an untested path; every `HostFileSystem` call site is already
  exercised by this file's own 13 tests.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/host-config-dir.test.ts:99-152 (pass-throughs :134-151) and tests/helpers/fake-file-system.ts:399-435, and a sed-extracted diff of the six pass-through bodies after a `#inner`→`inner` substitution is empty; `#inner` is used only through `FileSystem` members (ctor `homedir()` plus the eleven delegates), so `extends FileSystemDecorator` is a mechanical migration; the class is live (16 `hostFs(`/`new HostFileSystem` sites, 13 `it(`), the file already imports from ./helpers/fake-file-system but not the decorator, `grep -rn "implements FileSystem" tests/` shows HostFileSystem is now the SOLE remaining from-scratch implementation outside the helper, stated docs/bugs and coverage-matrix searches → 0 and 0 reproduce; git: HostFileSystem authored 7f360d20 2026-08-13 before the decorator was exported by 52753dea 2026-09-18 (PTQ-0647's fix), and PTQ-0647 — now fixed — never listed host-config-dir.test.ts, so this is a genuine unmigrated residual filed on its own per store convention, not a duplicate; both locations under tests/, D7 copy-paste-double class, not a gate file, recorders (`reads`/`listings`) sit on the intercepted members and are untouched by the direction, no red-test or witness-list carve-out (extraneous `d4_class` field on a D7 filing noted, non-blocking) (triage: claude-fable-5-1)
