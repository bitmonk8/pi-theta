---
id: PTQ-0899
title: b0461 duplicates b0440's FakeFileSystem harness and one entire test verbatim
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/b0440-cross-source-shadow-descriptor-form.test.ts:45-77
  - tests/b0440-cross-source-shadow-descriptor-form.test.ts:87-114
  - tests/b0461-source-failure-descriptor-form.test.ts:63-73
  - tests/b0461-source-failure-descriptor-form.test.ts:86-98
  - tests/b0461-source-failure-descriptor-form.test.ts:121-123
  - tests/b0461-source-failure-descriptor-form.test.ts:355-382
sites: 2
fix_scope: module
wave: qw20260918075903
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0461 duplicates b0440's FakeFileSystem harness and one entire test verbatim

## Observation
`tests/b0440-cross-source-shadow-descriptor-form.test.ts` and
`tests/b0461-source-failure-descriptor-form.test.ts` each independently declare
the identical `FakeSpec` interface, `build()` function, `input()` function, and
`HOME` / `CWD` / `THETA_BODY` constants that wire a `FakeFileSystem` for
`discoverThetas`. Beyond the harness, b0461's "cell 8 (control)" test is a
byte-for-byte copy of b0440's "arm 1" test body (fixture construction, drive
call, and assertion), differing only in the `describe`/`it` title strings. The
b0461 file's own comment at the copied test names the source verbatim: "Copied
from tests/b0440-cross-source-shadow-descriptor-form.test.ts arm 1".

## Evidence

tests/b0440-cross-source-shadow-descriptor-form.test.ts:45-77 (harness):
```ts
const HOME = "/home/theta";
const CWD = "/project";
...
interface FakeSpec {
  readonly dirs?: Record<string, readonly string[]>;
  readonly files?: Record<string, string>;
}

function build(spec: FakeSpec): FakeFileSystem {
  return new FakeFileSystem({
    homedir: HOME,
    cwd: CWD,
    dirs: spec.dirs ?? {},
    files: spec.files ?? {},
  });
}

function input(fs: FakeFileSystem, extra: Partial<DiscoveryInput> = {}): DiscoveryInput {
  return { fs, settings: {}, ...extra };
}

const THETA_BODY = "mode: prompt\n---\n";
```

tests/b0461-source-failure-descriptor-form.test.ts:63-73, 86-98, 121-123 (same
constants and functions, re-declared):
```ts
const HOME = "/home/theta";
const CWD = "/project";
...
const THETA_BODY = "mode: prompt\n---\n";
...
interface FakeSpec {
  readonly dirs?: Record<string, readonly string[]>;
  readonly files?: Record<string, string>;
}

function build(spec: FakeSpec): FakeFileSystem {
  return new FakeFileSystem({
    homedir: HOME,
    cwd: CWD,
    dirs: spec.dirs ?? {},
    files: spec.files ?? {},
  });
}
...
function input(fs: FileSystem, extra: Partial<DiscoveryInput> = {}): DiscoveryInput {
  return { fs, settings: {}, ...extra };
}
```

The full-test duplicate — b0440:87-114 ("arm 1"):
```ts
describe("b0440 arm 1 — cli-flag vs settings shadow renders the descriptor form", () => {
  it("renders 'cli-flag:\"--theta …\"' wins over 'settings:\"…\"', not bare paths", async () => {
    const fs = build({
      dirs: mergeDirs(
        ancestors("/ext/plan.theta"),
        { "/ext": ["plan.theta"] },
        ancestors("/work/plan.theta"),
        { "/work": ["plan.theta"] },
      ),
      files: {
        "/ext/plan.theta": THETA_BODY,
        "/work/plan.theta": THETA_BODY,
      },
    });

    const { diagnostics } = await discoverThetas(
      input(fs, {
        cliPaths: ["/ext/plan.theta"],
        settings: { thetaPaths: ["/work/plan.theta"] },
      }),
    );

    const shadow = soleByFragment(diagnostics, SHADOW_FRAGMENT);
    expect(shadow.message).toBe(
      `slash name 'plan' shadowed across discovery sources: 'cli-flag:"--theta /ext/plan.theta"' wins over 'settings:"/work/plan.theta"'`,
    );
  });
});
```

and b0461:355-382 ("cell 8"), same body, only the `describe`/`it` strings differ:
```ts
describe("b0461 cell 8 (control) — cross-source-shadow keeps the descriptor form", () => {
  it("renders 'cli-flag:\"--theta …\"' wins over 'settings:\"…\"', unchanged by this fix", async () => {
    const fs = build({
      dirs: mergeDirs(
        ancestors("/ext/plan.theta"),
        { "/ext": ["plan.theta"] },
        ancestors("/work/plan.theta"),
        { "/work": ["plan.theta"] },
      ),
      files: {
        "/ext/plan.theta": THETA_BODY,
        "/work/plan.theta": THETA_BODY,
      },
    });

    const { diagnostics } = await discoverThetas(
      input(fs, {
        cliPaths: ["/ext/plan.theta"],
        settings: { thetaPaths: ["/work/plan.theta"] },
      }),
    );

    const shadow = soleByFragment(diagnostics, SHADOW_FRAGMENT);
    expect(shadow.message).toBe(
      `slash name 'plan' shadowed across discovery sources: 'cli-flag:"--theta /ext/plan.theta"' wins over 'settings:"/work/plan.theta"'`,
    );
  });
});
```

## Why this is a problem
Two counted instances of the identical `FakeSpec`/`build`/`input`/`HOME`/`CWD`/
`THETA_BODY` block (tests/b0440-cross-source-shadow-descriptor-form.test.ts:45-77
and tests/b0461-source-failure-descriptor-form.test.ts:63-73/86-98/121-123),
plus one instance of a fully duplicated test — same fixture literals, same
drive call, same assertion string — living under a different `describe`/`it`
title in the second file (tests/b0461-source-failure-descriptor-form.test.ts:355-382
vs tests/b0440-cross-source-shadow-descriptor-form.test.ts:87-114). Both files
already import shared helpers from `tests/helpers/fake-file-system.ts`
(`FakeFileSystem`, `ancestors`, `mergeDirs`) and `tests/helpers/e2e-s1.ts`
(`soleByFragment`), so the remaining `build`/`input`/`FakeSpec` wiring is the
one piece each file re-derives on its own rather than importing.

## Suggested direction (non-binding, optional)
A shared discovery-input builder (`build`/`input`/`FakeSpec` plus the
byte-identical shadow-arm-1 test as an exported, parameterisable fixture)
under `tests/helpers/` is the natural home these two files' own comments
already point at (b0461 titles its copy "Copied from
tests/b0440-cross-source-shadow-descriptor-form.test.ts arm 1").

## False-positive check
Gate-pin check: neither file matches `*gate*.test.ts` or a kin pattern, so the
census/pin-gate carve-out does not apply. Recording-double check: the
duplicated assertions are ordinary `expect(...).toBe(...)` value checks, not a
negative (never-called) witness, so the recording-double carve-out does not
apply. docs/bugs/ signature search: `grep -rn "b0440-cross-source-shadow… \|
b0461-source-failure…" docs/bugs/*.md docs/reference/coverage-matrix.md` shows
both test files are named in their OWN bug docs' witness lists
(docs/bugs/0440-cross-source-shadow-descriptor-form.md:237,
docs/bugs/0461-source-failure-descriptor-category-text.md:291) as the intended
RED→GREEN witness for that bug — this finding does not propose merging,
renaming, or deleting either cited test, only observes that the shared
scaffolding and the one copied control cell are unextracted; the citation is
therefore compatible with filing. Coverage check: this finding does not assert
any path is untested; it is scoped to code that exists in both files.

## Triage
verdict: confirmed — independently re-verified: every excerpt reproduces at the exact cited lines (b0440 HOME/CWD :45-46, FakeSpec :59, build :64, input :73, THETA_BODY :77, arm 1 :87-114; b0461 HOME/CWD :63-64, THETA_BODY :73, FakeSpec :86, build :91, input :121, cell 8 :355-382); `diff` of the sed-extracted arm-1/cell-8 bodies with the describe/it lines dropped is empty, `build` hashes identically (2a3cab06) in exactly these two files, the harness diff is the single `input` parameter type (`FakeFileSystem` vs `FileSystem`) the filing's own excerpt shows, and b0461:357 carries the quoted "Copied from … arm 1" attribution; no tests/helpers/ module exports FakeSpec/build/input or a DiscoveryInput builder, both copies are live (10/10 tests green at HEAD), neither file is a gate/pin test, bugs 0440 (fixed 0.420.0) and 0461 (fixed 0.460.0) both cite only their own file (coverage-matrix.md 0 hits) and no it()/describe() merge/rename/delete is proposed — D7 boilerplate/copy-paste-fixture class, mechanical dedupe; not a duplicate: resolved PTQ-0588 covered only ancestors/mergeDirs/ReaddirDenied (now imported), PTQ-0255 is the real-PiFileSystem scratch harness, PTQ-0487 is PKG_ROOTS/buildPackages, and same-wave sibling d7-01-discovery-fixture-quartet cites a disjoint file pair (discovery-walk/e2e-s5) and symbol set (NO_SETTINGS/byCode/named). Fixer notes: the count is understated — `const HOME = "/home/theta"`/`const CWD = "/project"` plus a `build(spec: FakeSpec)` recur in 10 discovery test files (the other 8 `build` bodies differ), `input(fs, extra: Partial<DiscoveryInput>)` in 9 (b0461's `FileSystem` form is byte-identical in discovery-glob-universe-enumeration-failure and discovery-root-enumeration-failure; b0440's `FakeFileSystem` form in discovery-symlinked-root-classification), so the shared builder should be shaped to absorb those; docs/bugs/0461:331 witness-cites "control cell 8", so keep that cell in place (an imported parameterised fixture invoked from both files satisfies it). Template note: the filing omitted the `## Triage` heading; added here to hold this note (triage: claude-fable-5-1)
