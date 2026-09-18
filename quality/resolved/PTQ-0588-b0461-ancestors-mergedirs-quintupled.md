---
id: PTQ-0588
title: b0461's ancestors/mergeDirs/ReaddirDenied fake-fs scaffolding is a byte-identical copy repeated across five test files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0461-source-failure-descriptor-form.test.ts:89-112
  - tests/b0461-source-failure-descriptor-form.test.ts:171-221
  - tests/b0440-cross-source-shadow-descriptor-form.test.ts:61-84
  - tests/b0459-cross-format-collision-message-form.test.ts:66-89
  - tests/discovery-glob-universe-enumeration-failure.test.ts:250-273
  - tests/discovery-glob-universe-enumeration-failure.test.ts:332-371
  - tests/discovery-root-enumeration-failure.test.ts:226-249
  - tests/discovery-root-enumeration-failure.test.ts:303-336
sites: 5                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# b0461's ancestors/mergeDirs/ReaddirDenied fake-fs scaffolding is a byte-identical copy repeated across five test files

## Observation
tests/b0461-source-failure-descriptor-form.test.ts declares, module scope,
an `ancestors(leaf)` helper (builds the proper-ancestor-directory map of a
leaf path for a `FakeFileSystem`) and a `mergeDirs(...maps)` helper
(concatenates several such directory maps), each byte-identical to the same
two functions in four other test files, plus a `ReaddirDenied` class (a
`FileSystem` decorator that rejects `readdir` for one path with a
Node-style error code) that is a near-identical, narrower copy of the same
class in two of those files. b0461's own comments state directly that
`ancestors` is "Copied from tests/b0440-cross-source-shadow-descriptor-form.test.ts"
and that `ReaddirDenied` is "Copied from
tests/discovery-glob-universe-enumeration-failure.test.ts (the lstat-denial
cell that file adds is unused here, so this copy omits it)". No
tests/helpers/ module exports any of these three shapes.

## Evidence
tests/b0461-source-failure-descriptor-form.test.ts:89-112 (`ancestors` +
`mergeDirs`, with the file's own attribution comment at line 85 just above,
not reproduced here to keep the excerpt to the functions):
```ts
function ancestors(leaf: string): Record<string, string[]> {
  const segs = leaf.split("/").filter((s) => s.length > 0);
  const out: Record<string, string[]> = { "/": [] };
  let parent = "/";
  for (let i = 0; i < segs.length - 1; i++) {
    const path = parent === "/" ? `/${segs[i]}` : `${parent}/${segs[i]}`;
    out[path] = [];
    parent = path;
  }
  return out;
}

/** Merge several dirs maps, concatenating entry lists for shared keys. */
function mergeDirs(
  ...maps: Record<string, readonly string[]>[]
): Record<string, readonly string[]> {
  const out: Record<string, string[]> = {};
  for (const m of maps) {
    for (const [k, v] of Object.entries(m)) {
      out[k] = [...(out[k] ?? []), ...v];
    }
  }
  return out;
}
```

tests/discovery-root-enumeration-failure.test.ts:226-249 — byte-identical
(re-verified with `md5sum` over each function body immediately before
filing: both `ancestors` and `mergeDirs` hash identically across all five
files listed below):
```ts
function ancestors(leaf: string): Record<string, string[]> {
  const segs = leaf.split("/").filter((s) => s.length > 0);
  const out: Record<string, string[]> = { "/": [] };
  let parent = "/";
  for (let i = 0; i < segs.length - 1; i++) {
    const path = parent === "/" ? `/${segs[i]}` : `${parent}/${segs[i]}`;
    out[path] = [];
    parent = path;
  }
  return out;
}

/** Merge several dirs maps, concatenating entry lists for shared keys. */
function mergeDirs(
  ...maps: Record<string, readonly string[]>[]
): Record<string, readonly string[]> {
  const out: Record<string, string[]> = {};
  for (const m of maps) {
    for (const [k, v] of Object.entries(m)) {
      out[k] = [...(out[k] ?? []), ...v];
    }
  }
  return out;
}
```

Exact search and hash check (re-run immediately before filing):
`grep -n "^function ancestors\|^function mergeDirs"
tests/b0440-cross-source-shadow-descriptor-form.test.ts
tests/b0459-cross-format-collision-message-form.test.ts
tests/b0461-source-failure-descriptor-form.test.ts
tests/discovery-glob-universe-enumeration-failure.test.ts
tests/discovery-root-enumeration-failure.test.ts` → one `ancestors` and one
`mergeDirs` in each of the 5 files (b0440:61/74, b0459:66/79, b0461:89/102,
discovery-glob:250/263, discovery-root:226/239); `md5sum` over each
function's full body (`awk '/^function ancestors/,/^}/'` and
`awk '/^function mergeDirs/,/^}/'` per file) returns the SAME hash
(`cd3f430fa0b2c50a20d44af5bcbd8667` for `ancestors`,
`c728b0221fcf934b318c4db6004f930e` for `mergeDirs`) in all 5 files — the
copies are byte-identical, not merely similar. `grep -rn "class ReaddirDenied"
tests/*.test.ts` → 3 hits: `b0461:171`, `discovery-glob-universe-enumeration-failure.test.ts:332`,
`discovery-root-enumeration-failure.test.ts:303`; `diff` of b0461's
`ReaddirDenied` (171-221) against discovery-glob's (332-389) shows the only
difference is the two-file version's added `#lstatDenied` field and its
`lstat()` override — exactly what b0461's own comment states it omits
because unused. `grep -rn "function soleByFragment\|function codeError"
tests/*.test.ts` → `soleByFragment` in `b0440:114` and `b0461:243`;
`codeError` in `b0461:222`, `discovery-glob-universe-enumeration-failure.test.ts:394`,
and `discovery-tree-walk-lstat-failure.test.ts:236`.

## Why this is a problem
This is the "Boilerplate duplication" class. The same fake-filesystem
scaffolding — an ancestor-directory-map builder, a directory-map merger, a
one-path-denying `FileSystem` decorator, and the small locator helpers
(`soleByFragment`, `codeError`) built on top of them — recurs
byte-identically (for `ancestors`/`mergeDirs`) or near-identically (for
`ReaddirDenied`, differing only by an unused capability) across five
separate test files, three of which say directly, in their own comments,
which earlier file they copied it from
(`b0461` from `b0440` and from `discovery-glob-universe-enumeration-failure.test.ts`).
No tests/helpers/ module currently exports any of these shapes, which is
consistent with each file re-deriving rather than importing one.

## Suggested direction (non-binding, optional)
tests/helpers/fake-file-system.ts already holds this suite's canonical
`FakeFileSystem`; a small companion export for the
ancestor-directory-map/merge-directory-maps/deny-one-readdir shapes these
five discovery-source tests independently re-derive sits naturally beside
it, mirroring how tests/helpers/discovery-scratch-harness.ts already
centralises a different (real-filesystem) discovery scaffold for a
different pair of files.

## False-positive check
- Gate-pin check: none of the five files matches `*gate*.test.ts` or the
  named gate kin.
- Recording-double check: `ReaddirDenied` is a fault-injection decorator,
  not a recording double backing a "never called" witness; this finding
  does not contest any assertion built on it, only that the scaffolding
  constructing it is duplicated code.
- docs/bugs/ signature search: docs/bugs/0461-source-failure-descriptor-category-text.md,
  docs/bugs/0440-…md (cross-source-shadow), docs/bugs/0459-…md are all
  Status fixed. `npx vitest run tests/b0461-source-failure-descriptor-form.test.ts
  tests/discovery-glob-universe-enumeration-failure.test.ts
  tests/discovery-root-enumeration-failure.test.ts` passes at HEAD, so none
  is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0461-source-failure-descriptor-form" docs/reference/coverage-matrix.md`
  → 0 hits; the file name is not cited in another bug doc's witness list.
  This finding proposes no merge, rename, or deletion of any
  `it()`/`describe()` — only where the shared fake-fs scaffolding is
  defined.
- Coverage check: the claim is about repeated helper DEFINITIONS, not a
  missing test path; each copy is exercised by its own file's tests.
- Prior-finding overlap check: a search of quality/resolved/ and
  quality/intake/ for `ReaddirDenied` and `ancestors(leaf)` returns no prior
  finding — this duplication is not previously filed or resolved under
  another title.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: `ancestors`/`mergeDirs` at b0440:61/74, b0459:66/79, b0461:89/102, discovery-glob:250/263, discovery-root:226/239 hash cd3f430f…/c728b022… in all five (byte-identical), b0461:85 and :165-169 carry the quoted "Copied from" attributions, `ReaddirDenied` (b0461:171, glob:332, root:303) diffs only by glob's `#lstatDenied` field/`lstat()` arm and root's inlined error construction, and no tests/helpers/ module exports any of the three shapes (grep of tests/helpers/ and src/ returns only production `ancestorsClean`); all copies live (51 tests pass across the five files), none is a gate/pin file, none is cited in coverage-matrix.md, bugs 0440/0459/0461/0113 all Status fixed, and no it()/describe() merge/rename/delete is proposed — D7 boilerplate-duplication class, mechanical dedupe. Not a duplicate: PTQ-0286/0287 are src/ path/walker clones; same-wave sibling -d7-110-03 overlaps only on the `ReaddirDenied` decorator idiom (its root cause is the FileSystem pass-through shape incl. InstrumentedFileSystem/LstatDenied), so coordinate rather than merge. Fixer notes: the count is understated — `ancestors` is byte-identical in 12 test files and `mergeDirs` in 11 (discovery-invalid-extension.test.ts:40 is a one-line reformat; discovery-cli-entry-override-prefix.test.ts:151 has mergeDirs only), and shards 42/43/46/139 deferred discovery-invalid-extension, discovery-symlinked-root-classification, discovery-walk, discovery-tree-walk-lstat-failure, e2e-s5-disc-cli-settings, host-config-dir and settings-glob-disc5-matcher to this finding; docs/bugs/0113 witness-cites discovery-root-enumeration-failure.test.ts's `ReaddirDenied` by location (:300-344, now :303-353), so keep that class in place or update the citation (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
