---
id: PTQ-0466
title: fakeMarshalFs / fakeIntakeFs params fs-seam doubles declared near-identically in both subagent-params-carrier.test.ts and subagent-params-marshalling.test.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/subagent-params-carrier.test.ts:49-102
  - tests/subagent-params-marshalling.test.ts:46-93
sites: 2
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# fakeMarshalFs / fakeIntakeFs params fs-seam doubles declared near-identically in both subagent-params-carrier.test.ts and subagent-params-marshalling.test.ts

## Observation
Both `tests/subagent-params-carrier.test.ts` and
`tests/subagent-params-marshalling.test.ts` declare a module-scope
`fakeMarshalFs()` function (returning a `ParamsMarshalDeps` double that
records `writeTempFile`/`unlink` calls under a `/tmp/pi-theta-params-N.json`
naming scheme) and a `fakeIntakeFs(contentsByPath)` function (returning a
`ParamsIntakeDeps` double that serves fixed file contents and throws on an
unknown path). `subagent-params-carrier.test.ts`'s own header states its
fixtures are written "in the style of subagent-params-marshalling.test.ts,"
naming the sibling file as the pattern's origin.

## Evidence
tests/subagent-params-carrier.test.ts:49-73 (`fakeMarshalFs`):
```ts
/** A fake parent-side fs seam recording temp-file writes and unlinks. */
function fakeMarshalFs(): {
  readonly deps: ParamsMarshalDeps;
  readonly writes: { path: string; contents: string }[];
  readonly unlinks: string[];
} {
  const writes: { path: string; contents: string }[] = [];
  const unlinks: string[] = [];
  let counter = 0;
  return {
    writes,
    unlinks,
    deps: {
      writeTempFile: (contents): string => {
        counter += 1;
        const path = `/tmp/pi-theta-params-${counter}.json`;
        writes.push({ path, contents });
        return path;
      },
      unlink: (path): void => {
        unlinks.push(path);
      },
    },
  };
}
```

tests/subagent-params-marshalling.test.ts:46-70 (`fakeMarshalFs`, byte-identical body):
```ts
/** A fake parent-side fs seam recording temp-file writes and unlinks. */
function fakeMarshalFs(): {
  readonly deps: ParamsMarshalDeps;
  readonly writes: { path: string; contents: string }[];
  readonly unlinks: string[];
} {
  const writes: { path: string; contents: string }[] = [];
  const unlinks: string[] = [];
  let counter = 0;
  return {
    writes,
    unlinks,
    deps: {
      writeTempFile: (contents): string => {
        counter += 1;
        const path = `/tmp/pi-theta-params-${counter}.json`;
        writes.push({ path, contents });
        return path;
      },
      unlink: (path): void => {
        unlinks.push(path);
      },
    },
  };
}
```

tests/subagent-params-carrier.test.ts:75-102 (`fakeIntakeFs`, tracks `reads` in addition):
```ts
function fakeIntakeFs(contentsByPath: Record<string, string>): {
  readonly deps: ParamsIntakeDeps;
  readonly reads: string[];
  readonly unlinks: string[];
} {
  const reads: string[] = [];
  const unlinks: string[] = [];
  return {
    reads,
    unlinks,
    deps: {
      readFile: (path): string => {
        const contents = contentsByPath[path];
        if (contents === undefined) {
          throw new Error(`fake intake fs: no file at ${path}`);
        }
        reads.push(path);
        return contents;
      },
      unlink: (path): void => {
        unlinks.push(path);
      },
    },
  };
}
```

tests/subagent-params-marshalling.test.ts:72-93 (`fakeIntakeFs`, same shape minus the `reads` array):
```ts
/** A fake child-side fs seam serving one temp file's contents and recording deletes. */
function fakeIntakeFs(contentsByPath: Record<string, string>): {
  readonly deps: ParamsIntakeDeps;
  readonly unlinks: string[];
} {
  const unlinks: string[] = [];
  return {
    unlinks,
    deps: {
      readFile: (path): string => {
        const contents = contentsByPath[path];
        if (contents === undefined) {
          throw new Error(`fake intake fs: no file at ${path}`);
        }
        return contents;
      },
      unlink: (path): void => {
        unlinks.push(path);
      },
    },
  };
}
```

Exact search: `grep -rl "function fakeMarshalFs\|function fakeIntakeFs" tests/*.ts` → exactly these two files (no `tests/helpers/` module exports either name; `grep -rn "ParamsMarshalDeps\|ParamsIntakeDeps" tests/*.ts` shows a third file, `tests/proto-named-record-write-sites.test.ts`, using a single fixed `ParamsMarshalDeps` const object of a different shape, not this double-with-recorder pattern).

## Why this is a problem
`fakeMarshalFs` is declared with a byte-identical body in both files; `fakeIntakeFs` is declared with the identical error-on-unknown-path behaviour and only a renamed-and-trimmed shape (the carrier file's copy additionally tracks `reads`). `subagent-params-carrier.test.ts`'s own file header ("Fixtures (fs seam doubles in the style of subagent-params-marshalling.test.ts)") names the sibling file as the origin of the pattern it is re-declaring rather than importing. No `tests/helpers/` module currently exports either double.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module for the `ParamsMarshalDeps`/`ParamsIntakeDeps` fs-seam doubles (the carrier file's superset with the `reads` recorder) would be the natural home both files' fixtures already gesture at through the header's own cross-reference.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kin; not applicable.
- Recording-double check: `fakeMarshalFs`/`fakeIntakeFs` are positive-witness doubles backing forward assertions on their own recorded writes/reads (e.g. "the child reads its OWN temp-file params, not its caller's"), not MUST-NOT-call negative witnesses; the carve-out does not apply to the duplicated DEFINITIONS themselves.
- docs/bugs/ signature search: `grep -rn "fakeMarshalFs\|fakeIntakeFs" docs/bugs/` → no hits; not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "subagent-params-carrier\|subagent-params-marshalling" docs/reference/coverage-matrix.md docs/bugs/*.md` → no hits naming either file or its tests; this finding proposes no merge/rename/deletion of any test.
- Coverage check: the claim is about a repeated harness DEFINITION, not a missing test path; every copy already backs its own file's currently-passing tests.

## Triage
verdict: confirmed — independently re-verified: sed/diff of tests/subagent-params-carrier.test.ts:49-73 vs tests/subagent-params-marshalling.test.ts:46-70 is byte-identical and the fakeIntakeFs copies (carrier:80-102 vs marshalling:73-93) differ only by the 4-line `reads` recorder; grep confirms exactly these two files declare either name, no tests/helpers/* exports a ParamsMarshalDeps/ParamsIntakeDeps double, and proto-named-record-write-sites.test.ts:320-326 is a fixed const of a different shape; D7 copy-paste-fixture class, both sites under tests/, no existing PTQ on this root cause (PTQ-0021/0145 cite these files only as D2 src context). One correction on record: the candidate's "no hits" claim for bug docs is wrong — docs/bugs/0171-params-sibling-carrier-not-cleared.md cites both files as witnesses (8 hits) — but the carve-out covers merge/rename/delete of witness tests and this finding proposes only helper extraction, leaving every cell intact, so it does not apply; the carrier copy's `reads` log is a live negative witness at :241 and the suggested superset preserves it (triage: claude-fable-5-1)
