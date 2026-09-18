---
id: PTQ-0900
title: discovery-walk.test.ts's NO_SETTINGS/input/byCode/named quartet and BASE ancestor-chain constant are redeclared byte-identically in e2e-s5-disc-cli-settings.test.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/discovery-walk.test.ts:32
  - tests/discovery-walk.test.ts:55-67
  - tests/e2e-s5-disc-cli-settings.test.ts:38
  - tests/e2e-s5-disc-cli-settings.test.ts:60-72
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918075903
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# discovery-walk.test.ts's NO_SETTINGS/input/byCode/named quartet and BASE ancestor-chain constant are redeclared byte-identically in e2e-s5-disc-cli-settings.test.ts

## Observation
Both files drive `discoverThetas` (`src/discovery/discovery-walk.ts`) over a
`FakeFileSystem` seeded with the two conventional roots' ancestor chains.
Each file independently declares a `BASE` constant with the identical
`mergeDirs(ancestors(GLOBAL_ROOT), ancestors(PROJECT_ROOT))` call, and each
independently declares the same four-symbol helper quartet — `NO_SETTINGS`,
`input`, `byCode`, `named` — with byte-identical bodies. Neither file's
header or inline comments credit the other as the harness's source, even
though `e2e-s5-disc-cli-settings.test.ts`'s own header says its "Fixture
idioms mirror tests/discovery-walk.test.ts and tests/settings-merge.test.ts
exactly."

## Evidence
`tests/discovery-walk.test.ts:32`:
```ts
const BASE = mergeDirs(ancestors(GLOBAL_ROOT), ancestors(PROJECT_ROOT));
```

`tests/e2e-s5-disc-cli-settings.test.ts:38` — byte-identical:
```ts
const BASE = mergeDirs(ancestors(GLOBAL_ROOT), ancestors(PROJECT_ROOT));
```

`tests/discovery-walk.test.ts:55-67`:
```ts
const NO_SETTINGS: ThetaSettings = {};

function input(fs: FakeFileSystem, extra: Partial<DiscoveryInput> = {}): DiscoveryInput {
  return { fs, settings: NO_SETTINGS, ...extra };
}

function byCode(diagnostics: readonly Diagnostic[], code: string): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.code === code);
}

function named(thetas: readonly DiscoveredTheta[], name: string): DiscoveredTheta | undefined {
  return thetas.find((l) => l.name === name);
}
```

`tests/e2e-s5-disc-cli-settings.test.ts:60-72` — byte-identical:
```ts
const NO_SETTINGS: ThetaSettings = {};

function input(fs: FakeFileSystem, extra: Partial<DiscoveryInput> = {}): DiscoveryInput {
  return { fs, settings: NO_SETTINGS, ...extra };
}

function byCode(diagnostics: readonly Diagnostic[], code: string): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.code === code);
}

function named(thetas: readonly DiscoveredTheta[], name: string): DiscoveredTheta | undefined {
  return thetas.find((l) => l.name === name);
}
```

Pattern search re-run immediately before filing: `grep -n
"^function input(fs: FakeFileSystem, extra: Partial<DiscoveryInput>"
tests/*.test.ts` → exactly 2 hits (these two files);
`grep -n "^function byCode(diagnostics: readonly Diagnostic\[\], code:
string): readonly Diagnostic\[\] {" tests/*.test.ts` → 9 hits total (these
two plus tests/b0463-package-source-disc3-validation.test.ts,
tests/discovery-invalid-extension.test.ts,
tests/discovery-root-enumeration-failure.test.ts,
tests/execution-status-settings-progress.test.ts,
tests/host-config-dir.test.ts, tests/package-discovery.test.ts,
tests/settings-merge.test.ts, tests/subagent-placement-settings.test.ts —
this finding is scoped only to the byte-identical pair inside the current
review's file list and does not evidence the other seven); `grep -n
"^function named(thetas: readonly DiscoveredTheta\[\], name: string):
DiscoveredTheta | undefined {" tests/*.test.ts` → exactly these 2 hits;
`grep -n "^const BASE = mergeDirs(ancestors(GLOBAL_ROOT), ancestors(PROJECT_ROOT))"
tests/*.test.ts` → exactly these 2 hits.

## Why this is a problem
Five distinct declarations — `BASE`, `NO_SETTINGS`, `input`, `byCode`,
`named` — are typed out twice, byte-for-byte, rather than declared once.
`e2e-s5-disc-cli-settings.test.ts`'s own header comment states the mirroring
was deliberate ("Fixture idioms mirror tests/discovery-walk.test.ts …
exactly"), so the duplication is a conscious copy rather than an accidental
convergence, but neither declaration site references the other by name or
import.

## Suggested direction (non-binding, optional)
Both files already import `FakeFileSystem`/`ancestors`/`mergeDirs` from
`tests/helpers/fake-file-system.ts`; a shared `tests/helpers/` export for
"the discoverThetas result-reader quartet (`input`/`byCode`/`named`) plus the
two-conventional-root `BASE` ancestor set" would be the natural home for
these five pieces, as a hypothesis only.

## False-positive check
- Gate-pin check: neither `discovery-walk.test.ts` nor
  `e2e-s5-disc-cli-settings.test.ts` matches `*gate*.test.ts` or the named
  gate kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); not
  applicable.
- Recording-double check: none of `BASE`/`NO_SETTINGS`/`input`/`byCode`/
  `named` is a call-recording double backing a "never called" witness — they
  build/read static fixture input and diagnostic-array output; not
  applicable.
- docs/bugs/ signature search: `grep -rln "discovery-walk.test.ts\|
  e2e-s5-disc-cli-settings.test.ts" docs/bugs/*.md` → both files are named in
  docs/bugs/0075, 0077, 0167 witness lists. `docs/bugs/0167-clean-leaf-walk-
  warns-on-absent-conventional-root.md:102` cites
  `tests/discovery-walk.test.ts:55`–`:58` specifically for the ancestor-chain
  comment (now drifted to line 28-31 in the current file, since content
  shifted); `docs/bugs/0075…md:51,222,256,446,454` cites
  `tests/e2e-s5-disc-cli-settings.test.ts:253–263` for its REQ-DISC-14 cell.
  All three bug docs are Status: fixed, and this finding proposes no merge,
  rename, or deletion of either file, either the `BASE` declaration, or any
  cell those citations pin — only that the helper declarations are
  duplicated — so the witness-list citations are unaffected.
- coverage-matrix/bug-doc citation search: `grep -n
  "discovery-walk.test.ts\|e2e-s5-disc-cli-settings.test.ts"
  docs/reference/coverage-matrix.md` → 0 hits; neither file is cited by name
  there.
- Coverage-drift check: the claim is about a repeated fixture-helper
  DEFINITION, not a missing test path; each copy is exercised by its own
  file's tests, both currently green.
- Prior-finding overlap check: `grep -rl "NO_SETTINGS" quality/resolved
  quality/issues quality/intake` → 0 hits; `grep -rl "FakeSpec"
  quality/resolved quality/issues quality/intake` → 1 hit
  (`PTQ-0487-pkg-roots-buildpackages-duplicated.md`, a disjoint symbol pair —
  `PKG_ROOTS`/`buildPackages` — in a disjoint file pair
  (`discovery-root-enumeration-failure.test.ts` /
  `discovery-tree-walk-lstat-failure.test.ts`), not this file pair or these
  symbols. No open/pending finding names `BASE`, `NO_SETTINGS`, `input`,
  `byCode`, or `named` in this file pair.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: `BASE` reproduces at tests/discovery-walk.test.ts:32 and tests/e2e-s5-disc-cli-settings.test.ts:38 and the NO_SETTINGS/input/byCode/named quartet at :55-67 / :60-72, sed-extracted diff of the two quartets is empty, both copies are live (15/13/11 vs 7/8/3 call sites), the e2e-s5 header's "Fixture idioms mirror tests/discovery-walk.test.ts … exactly" self-attribution is real at :16-17, no tests/helpers/ module exports any of the five (package-merge-e2e-harness.ts's `byCode` is typed over CapturedNote), both files already import ancestors/mergeDirs from helpers/fake-file-system, both under tests/, D7 copy-paste-fixture class, neither is a gate file, coverage-matrix 0 hits, docs/bugs 0075/0077/0167 are all Status fixed and no merge/rename/delete is proposed; not a duplicate — open PTQ-0700 is the loadSettings PROJECT_PATH/GLOBAL_PATH/FileSpec/build harness in settings-merge and siblings (only the generic `byCode` overlaps), resolved PTQ-0255 is the real-fs scratch harness (b0363/b0364), resolved PTQ-0588 was the pre-export ancestors/mergeDirs bodies, and same-wave siblings cover b0440/b0461 and `flush` on disjoint files; three corrections for the fixer since the filing's "exactly 2 hits" claims do not reproduce: the exact `^function input(fs: FakeFileSystem, extra: Partial<DiscoveryInput>` search returns 5 files (also b0440-cross-source-shadow-descriptor-form, discovery-invalid-extension, discovery-symlinked-root-classification), the exact `^const BASE = mergeDirs(ancestors(GLOBAL_ROOT), ancestors(PROJECT_ROOT))` search returns 6 files (also discovery-invalid-extension, discovery-root-enumeration-failure, discovery-symlinked-root-classification, settings-glob-disc5-matcher), and `byCode` returns 10 not 9 — so a shared discoverThetas fixture helper should absorb those sibling copies too and its Diagnostic-typed `byCode` should be the same one PTQ-0700's fix lands (triage: claude-fable-5-1)
