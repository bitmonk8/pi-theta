---
id: PTQ-0647
title: package-discovery.test.ts hand-rolls a full 15-method FileSystem pass-through decorator, the same idiom four sibling test files already hand-roll as ReaddirDenied/LstatDenied
lens: D7
status: open
verdict: confirmed
locations:
  - tests/package-discovery.test.ts:60-119
  - tests/discovery-root-enumeration-failure.test.ts:303-353
  - tests/b0461-source-failure-descriptor-form.test.ts:171-219
  - tests/discovery-glob-universe-enumeration-failure.test.ts:332-390
  - tests/discovery-tree-walk-lstat-failure.test.ts:249-296
sites: 5
fix_scope: cross-module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# package-discovery.test.ts hand-rolls a full 15-method FileSystem pass-through decorator, the same idiom four sibling test files already hand-roll as ReaddirDenied/LstatDenied

## Observation
`tests/package-discovery.test.ts`'s `InstrumentedFileSystem` implements the full `FileSystem` interface (`readText`, `readBytes`, `writeText`, `exists`, `homedir`, `cwd`, `configDirName`, `globalAgentDir`, `readdir`, `lstat`, `realpath` — eleven members plus a `packageJsonReads` counter), delegating every member except `readText`/`readBytes` verbatim to an inner `FakeFileSystem`. The same "implement every `FileSystem` member as a one-line delegate to an inner `FakeFileSystem`, except the one member under test" idiom is independently hand-rolled, member list and delegate bodies matching almost line for line, by `ReaddirDenied` in three other test files and `LstatDenied` in a fourth. `tests/helpers/fake-file-system.ts` — the module all five classes wrap — exports only the concrete `FakeFileSystem` class; it exports no reusable "wrap a `FakeFileSystem`, override the members I name" decorator that any of the five could call instead of retyping the full member list.

## Evidence
`tests/package-discovery.test.ts:60-73` (of the 60-119 span; the counting/hang half plus the start of the pass-through tail):
```ts
class InstrumentedFileSystem implements FileSystem {
  packageJsonReads = 0;
  readonly #base: FakeFileSystem;
  readonly #hang: ReadonlySet<string>;

  constructor(base: FakeFileSystem, hang: Iterable<string> = []) {
    this.#base = base;
    this.#hang = new Set(hang);
  }

  #enterRead(path: string): Promise<never> | undefined {
    if (path.endsWith("/package.json")) {
      this.packageJsonReads++;
    }
```

`tests/package-discovery.test.ts:97-114` (the pass-through tail: eight one-line delegate methods):
```ts
  exists(path: string): Promise<boolean> {
    return this.#base.exists(path);
  }
  homedir(): string {
    return this.#base.homedir();
  }
  cwd(): string {
    return this.#base.cwd();
  }
  configDirName(): string {
    return this.#base.configDirName();
  }
  globalAgentDir(): string {
    return this.#base.globalAgentDir();
  }
  readdir(path: string): Promise<readonly string[]> {
    return this.#base.readdir(path);
  }
  lstat(path: string): Promise<FileStat> {
    return this.#base.lstat(path);
  }
```

`tests/discovery-root-enumeration-failure.test.ts:303-321` — `ReaddirDenied`, the same shape (three private fields, a constructor assigning them, one intercepted member, the rest one-line delegates):
```ts
class ReaddirDenied implements FileSystem {
  readonly #inner: FakeFileSystem;
  readonly #denied: string;
  readonly #code: string;

  constructor(inner: FakeFileSystem, denied: string, code: string) {
    this.#inner = inner;
    this.#denied = denied;
    this.#code = code;
  }

  readdir(path: string): Promise<readonly string[]> {
    if (path === this.#denied) {
      const error: NodeJS.ErrnoException = new Error(`${this.#code}: readdir`);
      error.code = this.#code;
      return Promise.reject(error);
    }
    return this.#inner.readdir(path);
  }
```

`tests/b0461-source-failure-descriptor-form.test.ts:171-187` — a fourth, near-identical `ReaddirDenied` (same field names, same constructor shape, only the intercepted member's error-construction one-liner differs, routed through a shared `codeError` helper instead of an inline `new Error`):
```ts
class ReaddirDenied implements FileSystem {
  readonly #inner: FakeFileSystem;
  readonly #denied: string;
  readonly #code: string;

  constructor(inner: FakeFileSystem, denied: string, code: string) {
    this.#inner = inner;
    this.#denied = denied;
    this.#code = code;
  }

  readdir(path: string): Promise<readonly string[]> {
    if (path === this.#denied) {
      return Promise.reject(codeError(this.#code));
    }
    return this.#inner.readdir(path);
  }
```

Exact search: `grep -n "^class ReaddirDenied\|^class LstatDenied\|^class InstrumentedFileSystem" tests/*.test.ts` returns exactly five hits: `tests/package-discovery.test.ts` (`InstrumentedFileSystem`), `tests/discovery-root-enumeration-failure.test.ts`, `tests/b0461-source-failure-descriptor-form.test.ts`, `tests/discovery-glob-universe-enumeration-failure.test.ts` (all three `ReaddirDenied`), and `tests/discovery-tree-walk-lstat-failure.test.ts` (`LstatDenied`) — every hit is a from-scratch `implements FileSystem` class with the same "delegate every member but the intercepted one to an inner `FakeFileSystem`" shape. `grep -n "^export function\|^export class" tests/helpers/fake-file-system.ts` returns only `FakeFileSystemOptions` (the options interface) and `FakeFileSystem` itself — no wrapping/override helper.

## Why this is a problem
Five files, across at least two independent authoring sessions (three near-identical `ReaddirDenied` copies, one `LstatDenied` variant, and `InstrumentedFileSystem`'s own richer counting/hanging variant), each retype the full ten-to-eleven-member `FileSystem` interface's pass-through boilerplate by hand to intercept a single member (or, in `InstrumentedFileSystem`'s case, two). A `FileSystem` interface member addition or rename has to be hand-applied at all five from-scratch implementations rather than at one wrapping helper each could parameterise.

## Suggested direction (non-binding, optional)
A single `tests/helpers/fake-file-system.ts` export — a generic "wrap a `FakeFileSystem`, override the named members with caller-supplied functions" decorator — is the natural home for the pass-through half all five classes currently retype; each file's own intercept logic (deny-with-code, hang-forever, count-and-hang) would stay local to its own override function. None of the five class declarations themselves would need to be merged, renamed, or deleted for this — only their identical pass-through bodies would stop being retyped.

## False-positive check
- Gate-pin check: none of the five files match `*gate*.test.ts` or a named gate kin; this finding is about a fixture-class declaration site, not a pinned count or corpus inventory.
- Recording-double check: `InstrumentedFileSystem`'s `packageJsonReads` counter is a positive-witness recorder (read and asserted `toBeGreaterThan(0)` / `toBe(0)`), not a "never called" negative witness; the negative-witness carve-out does not change the classification — the finding is about the retyped pass-through boilerplate, not about the counting logic's validity.
- docs/bugs/ signature search: `grep -n "ReaddirDenied\|LstatDenied\|InstrumentedFileSystem" docs/bugs/*.md` returns hits in `docs/bugs/0076-existing-root-enumeration-failure-silent.md` (an illustrative `ReaddirDenied` sketch in its own §Reproduction, not attributed to any named test file) and `docs/bugs/0113-listtree-glob-universe-swallow-silent.md`, which explicitly names `tests/discovery-root-enumeration-failure.test.ts`'s `ReaddirDenied` in its witness list ("the `ReaddirDenied` decorator at `:294–344` (class body `:300–344`)") — this is a witness-list citation of that ONE class (current HEAD measures its body at `:303-353`, a small drift from the doc's `:300-344` consistent with later edits, not a discrepancy this finding disputes). This finding's suggested direction does not propose to merge, rename, or delete that class or any other cited class — only that their duplicated pass-through method bodies be extracted to a shared wrapper, leaving each class's own name, file, and intercept behaviour untouched, so the pinning citation is respected. `InstrumentedFileSystem`, `LstatDenied`, and the other two `ReaddirDenied` copies are named in neither doc.
- coverage-matrix/bug-doc citation search: `grep -n "package-discovery.test.ts\|discovery-root-enumeration-failure.test.ts\|b0461-source-failure-descriptor-form.test.ts\|discovery-glob-universe-enumeration-failure.test.ts\|discovery-tree-walk-lstat-failure.test.ts" docs/reference/coverage-matrix.md` returns 0 hits for all five files. `docs/bugs/0113-listtree-glob-universe-swallow-silent.md` additionally cites `tests/package-discovery.test.ts:164`, `:181`, `:207`, `:237`, `:258`, `:289`, `:377-379`, `:406-408` — all manifest-array lines, none inside `InstrumentedFileSystem`'s `:60-119` span. No merge, rename, or deletion of any file or class is proposed.
- Coverage-drift check: the claim is entirely about repeated fixture-class DEFINITIONS; each file's own tests exercise its own copy, so this is not a coverage-gap claim. `tests/package-discovery.test.ts`'s own header states its cells are documented correct-reason reds pending the V10b `discoverPackageThetas` body (matching the file's own stated precondition, not a silent skip); this finding does not dispute that posture or propose changing any cell's red/green status.

## Triage
verdict: confirmed — independently re-verified: all five `implements FileSystem` classes exist at the cited lines with matching excerpts (package-discovery:60-119, root-enumeration:303-353, b0461:171-219, glob-universe:332-390, tree-walk-lstat:249-296), each retyping 9-10 one-line delegates to an inner FakeFileSystem around one or two intercepted members; two copies self-declare the copy-paste in their own doc comments (b0461:168 "Copied from tests/discovery-glob-universe-enumeration-failure.test.ts", glob-universe:329 "Mirrors tests/discovery-root-enumeration-failure.test.ts:298-353"); tests/helpers/fake-file-system.ts exports only FakeFileSystemOptions + FakeFileSystem (no wrapper); no coverage-matrix hits; docs/bugs/0113 cites the root-enumeration ReaddirDenied as a witness but the direction keeps every class name/file/intercept in place (no merge/rename/delete), so the carve-out is not triggered; no existing PTQ names these classes. One inaccuracy noted for the fixer, not blocking: the title's "15-method" is a miscount — src/seams/file-system.ts#FileSystem has 11 members, as the Observation body itself correctly states (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
