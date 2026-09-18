---
id: PTQ-0907
title: the real-fs ParamsMarshalDeps double (writeTempFile/unlink over the real filesystem) is redeclared byte-identically in two subagent-params test files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/subagent-params-marshalling.test.ts:160-167
  - tests/subagent-params-carrier.test.ts:249-256
sites: 2
fix_scope: localized
wave: qw20260918075903
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# the real-fs ParamsMarshalDeps double (writeTempFile/unlink over the real filesystem) is redeclared byte-identically in two subagent-params test files

## Observation
Both files build a real-filesystem-backed `ParamsMarshalDeps` object inline,
each time to drive `marshalParams` against a REAL 0600 temp-file write (the
fake `fakeMarshalFs`/`fakeIntakeFs` doubles from `tests/helpers/fake-file-
system.ts` are deliberately not used for these two cells, since the point is
to observe a real filesystem write/permission/delete). The `writeTempFile`
and `unlink` method bodies are byte-identical between the two files; only the
surrounding variable names (`realFs` vs `realMarshalFs`) and the temp path
construction differ.

## Evidence
tests/subagent-params-marshalling.test.ts:160-167:
```ts
    const realFs: ParamsMarshalDeps = {
      writeTempFile: (contents): string => {
        writeFileSync(path, contents, { mode: SUBAGENT_PARAMS_TEMP_FILE_MODE });
        return path;
      },
      unlink: (p): void => {
        rmSync(p, { force: true });
      },
    };
```

tests/subagent-params-carrier.test.ts:249-256:
```ts
    const realMarshalFs: ParamsMarshalDeps = {
      writeTempFile: (contents): string => {
        writeFileSync(path, contents, { mode: SUBAGENT_PARAMS_TEMP_FILE_MODE });
        return path;
      },
      unlink: (p): void => {
        rmSync(p, { force: true });
      },
    };
```

Search performed: `grep -rn "ParamsMarshalDeps" tests/*.test.ts` — three
hits total (these two files plus
`tests/proto-named-record-write-sites.test.ts:320`, whose own
`MARSHAL_DEPS.writeTempFile` throws unconditionally and shares no body with
either cited site); `grep -n "writeTempFile: (contents): string =>"
tests/subagent-params-marshalling.test.ts tests/subagent-params-carrier.test.ts`
confirms exactly these two matches, both followed by the identical
`writeFileSync(path, contents, { mode: SUBAGENT_PARAMS_TEMP_FILE_MODE });
return path;` / `unlink: (p): void => { rmSync(p, { force: true }); }` body.

## Why this is a problem
The two-method `ParamsMarshalDeps` shape that performs a real, mode-stamped
temp-file write and a real unlink is authored twice rather than once, each
time inline inside the `it()` body that needs it. `tests/helpers/fake-file-
system.ts` already centralises the FAKE half of this same seam
(`fakeMarshalFs`/`fakeIntakeFs`), but no shared export backs the REAL half
both of these cells independently construct — a change to the real-fs
write/unlink shape (e.g. an additional mode flag, or a different error
path) would need to be hand-applied in both places.

## Suggested direction (non-binding, optional)
`tests/helpers/fake-file-system.ts` already hosts the fake counterpart
(`fakeMarshalFs`); a small real-fs-backed builder taking a path and
returning the same `ParamsMarshalDeps` shape would be a natural neighbour
for it — naming that file as a candidate home is an observation about the
existing module, not a design for the change.

## False-positive check
- Gate-pin carve-out: neither file matches `*gate*.test.ts` or the named
  gate kin; neither cited block is a pinned count/inventory assertion.
- Recording-double carve-out: this is a real-filesystem write/delete double
  used to observe production host behaviour (temp-file mode, delete-on-read),
  not a fake recording calls for a "never called" witness; the carve-out
  does not apply.
- docs/bugs/ signature search: `grep -rl "subagent-params-marshalling\|
  subagent-params-carrier" docs/bugs/*.md` — 0 hits; neither file is named
  by any docs/bugs/ report, so no documented correct-reason-red or
  witness-list citation is in play.
- coverage-matrix/bug-doc citation search: `grep -n
  "subagent-params-marshalling\|subagent-params-carrier"
  docs/reference/coverage-matrix.md` — 0 hits. This finding proposes no
  merge, rename, or deletion of either file or any `it()` in them, only
  that the repeated real-fs double could be built from one shared helper.
- Overlap check: `grep -rl "ParamsMarshalDeps\|realMarshalFs\|writeTempFile.*
  writeFileSync" quality/issues quality/resolved quality/intake` — no
  existing filed or resolved item names this real-fs double; PTQ-0466
  (resolved) covers the unrelated FAKE `fakeMarshalFs`/`fakeIntakeFs`
  duplication, already centralised in `tests/helpers/fake-file-system.ts`
  and imported by both files for their other cells.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/subagent-params-marshalling.test.ts:160-167 and tests/subagent-params-carrier.test.ts:249-256 and `diff` of the sed-extracted blocks after a name-only `realFs`→`realMarshalFs` substitution is empty; both copies are live (each is the `deps` argument to a `marshalParams` call) and were introduced by the same commit 05c72e2a; `grep -rn ParamsMarshalDeps tests/*.test.ts` reproduces exactly the three stated files with proto-named-record-write-sites.test.ts:320-326 a throwing const of a different shape; tests/helpers/fake-file-system.ts exports only the FAKE pair (`fakeMarshalFs`/`fakeIntakeFs`, PTQ-0466 fixed at marshalling:46-93 / carrier:49-102 — a distinct root cause) and no tests/helpers module exports a real-fs `ParamsMarshalDeps` builder, so the "authored twice, no shared export" anchor holds; D7 copy-paste-double class, both sites under tests/, coverage-matrix search → 0; one correction on record: the filing's docs/bugs "0 hits" is wrong — docs/bugs/0171-params-sibling-carrier-not-cleared.md cites both files as witnesses (8 hits) — but the carve-out covers merge/rename/delete of witness cells and this proposes only helper extraction leaving every `it()` intact, so it does not apply (triage: claude-fable-5-1)
