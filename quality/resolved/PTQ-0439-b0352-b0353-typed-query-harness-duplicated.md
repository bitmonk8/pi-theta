---
id: PTQ-0439
title: b0352 and b0353 redeclare the identical scripted forced-respond typed-query harness byte-for-byte
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0352-initial-depth-breach-opens-repair.test.ts:85-216
  - tests/b0353-followup-respond-payload-depth-walk.test.ts:72-198
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0352 and b0353 redeclare the identical scripted forced-respond typed-query harness byte-for-byte

## Observation
`tests/b0352-initial-depth-breach-opens-repair.test.ts` (lines 85-216) and
`tests/b0353-followup-respond-payload-depth-walk.test.ts` (lines 72-198) each
declare a ten-piece harness — `NOOP_CHECKPOINT`, `liveSignal()`, `config()`,
class `OpeningModel`, `schemaDeclsOf()`, `ajv()`, `payloadFollowUp()`,
`buildValidation()`, `describeOutcome()` and `isDepthIssue()` — that drives the
real `runTypedQueryLoop` / `buildTypedQueryValidation` / `AjvSchemaValidator`
stack. The two blocks are structurally identical: every function signature,
body shape and most doc-comment prose repeat verbatim; the only differing
tokens are the `invocationId` fixture string (`"inv-0352"` vs `"inv-0353"`),
one narrowed doc-comment on `buildValidation` (b0353 always drives exactly one
follow-up, so its comment omits b0352's "SAME scripted follow-up re-returned up
to budget times" clause) and one line dropped from `describeOutcome`'s
validation-branch template literal (b0352 includes `attempts=` in the digest,
b0353 does not). b0352's own file header names the file it mirrors ("mirrors
the e2e-s3 harness / the b0353 sibling").

## Evidence

`tests/b0352-initial-depth-breach-opens-repair.test.ts:85-135` (opening third
of the harness):
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function liveSignal(): AbortSignal {
  return new AbortController().signal;
}

function config(): QueryToolLoopConfig {
  return {
    maxRounds: 0,
    querySite: { file: "probe.theta", line: 1, column: 1 },
    thetaSlashName: "/probe",
    invocationId: "inv-0352",
    occurredAt: 0,
  };
}

class OpeningModel implements QueryModelDriver {
  constructor(private readonly opener: ForcedRespondTurn) {}
  nextFreePhaseTurn(): Promise<FreePhaseTurn> {
    throw new Error("no free-phase turn on a max_rounds:0 typed query");
  }
  runToolBatch(): Promise<readonly never[]> {
    throw new Error("no tool batch on a max_rounds:0 typed query");
  }
  forcedRespondTurn(): Promise<ForcedRespondTurn> {
    return Promise.resolve(this.opener);
  }
}
```

`tests/b0353-followup-respond-payload-depth-walk.test.ts:74-115` (the same
slice, renamed fixture literal only):
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function liveSignal(): AbortSignal {
  return new AbortController().signal;
}

function config(): QueryToolLoopConfig {
  return {
    maxRounds: 0,
    querySite: { file: "probe.theta", line: 1, column: 1 },
    thetaSlashName: "/probe",
    invocationId: "inv-0353",
    occurredAt: 0,
  };
}

class OpeningModel implements QueryModelDriver {
  constructor(private readonly opener: ForcedRespondTurn) {}
  nextFreePhaseTurn(): Promise<FreePhaseTurn> {
    throw new Error("no free-phase turn on a max_rounds:0 typed query");
  }
  runToolBatch(): Promise<readonly never[]> {
    throw new Error("no tool batch on a max_rounds:0 typed query");
  }
  forcedRespondTurn(): Promise<ForcedRespondTurn> {
    return Promise.resolve(this.opener);
  }
}
```

`tests/b0352-initial-depth-breach-opens-repair.test.ts:129-145` (`schemaDeclsOf`,
identical in b0353 apart from nothing — both use `"probe.theta"` /
`"probe"`):
```ts
function schemaDeclsOf(src: string): readonly SchemaDecl[] {
  const deps = {
    systemNote: {
      pi: { sendMessage: () => Promise.resolve() },
      ui: { notify: () => {} },
      emitDiagnostic: () => {},
    },
    modelMatcher: { resolve: () => "resolved" as const },
  } as unknown as ParseThetaDocumentDeps;
  const source: ThetaSource = {
    path: "probe.theta",
    bytes: new TextEncoder().encode(src),
  };
  const doc = parseThetaDocument(source, deps);
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}
```
`tests/b0353-followup-respond-payload-depth-walk.test.ts:117-133` reproduces
this function byte-for-byte (confirmed by direct `diff` of the two ranges: no
differing tokens at all in this slice).

`tests/b0352-initial-depth-breach-opens-repair.test.ts:170-217` (`buildValidation`,
`describeOutcome`, `isDepthIssue`) diffed directly against
`tests/b0353-followup-respond-payload-depth-walk.test.ts:153-198` — the only
textual differences across the whole 131/126-line ranges are: the
`invocationId` literal (already shown above), one clause dropped from
`buildValidation`'s doc comment, and the `attempts=` segment dropped from
`describeOutcome`'s validation-arm template string (verified with `diff`
immediately before filing; the tool output shows exactly these hunks and no
others across the harness blocks).

## Why this is a problem
The same ten-piece harness — assembling a `QueryToolLoopConfig`, a scripted
`QueryModelDriver`, a real-parser `schemaDeclsOf`, a real `AjvSchemaValidator`
factory, a follow-up-payload builder, a `TypedQuerySchemaValidation` builder
with an injected `driveFollowUp` counter, an outcome-digest formatter and a
depth-issue predicate — is retyped in full in each of the two files this wave
reviews, differing only in a fixture-name literal and two comment/string
clauses. b0352's own header comment ("mirrors … the b0353 sibling") names the
duplication as a known fact, not an independent convergence.

## Suggested direction (non-binding, optional)
A shared tests/helpers/ module for the "scripted forced-respond typed-query
loop substrate" (config/OpeningModel/schemaDeclsOf/ajv/buildValidation/
describeOutcome/isDepthIssue) is the natural home the two files' near-total
byte overlap points to; the sibling `qw20260917154546-d7-01-b0292-typed-query-substrate-mirrored`
finding observes the same recurring shape in a different, non-overlapping file
pair.

## False-positive check
Gate-pin: neither file matches `*gate*.test.ts` or a listed gate kin; not a
census/pin gate. Recording-double: `OpeningModel` and the harness pieces here
are stimulus/setup, not a MUST-NOT-witness recording double — carve-out does
not apply. docs/bugs/ signature search: `docs/bugs/0352-initial-depth-breach-bypasses-repair.md`
and `docs/bugs/0353-followup-respond-payload-never-depth-walked.md` both exist
and both have landed `## Fix` sections citing their own test file by name as
the gate witness (e.g. 0352's Gates line: "witness `npx vitest run
tests/b0352-initial-depth-breach-opens-repair.test.ts` → 6/6 green"). This
pins the TEST FILE as a named witness, not its internal harness shape; this
finding does not propose merging, renaming or deleting either file — only
naming a shared-helper direction for the duplicated setup functions inside
them — so the citation does not block it. coverage-matrix/bug-doc citation
search: `grep -rn "b0352-initial-depth-breach-opens-repair\|b0353-followup-respond-payload-depth-walk" docs/reference/coverage-matrix.md docs/bugs/`
found the one Gates-line hit above and no coverage-matrix.md hit; no citation
requires either file's internal structure (as opposed to its existence and
green status) to stay as-is. This claim is about existing duplicated harness
code in two files already in scope, not a proposal that either file should not
exist, and it is not a coverage judgment.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-diffed tests/b0352-initial-depth-breach-opens-repair.test.ts:85-216 against tests/b0353-followup-respond-payload-depth-walk.test.ts:72-198 (132/127 lines): all ten harness pieces (NOOP_CHECKPOINT/liveSignal/config/OpeningModel/schemaDeclsOf/ajv/payloadFollowUp/buildValidation/describeOutcome/isDepthIssue) are code-identical bar the `invocationId` literal and the `attempts=` digest segment; the remaining hunks (substrate banner, OpeningModel and buildValidation doc comments — the candidate under-enumerated the first two) are comment-only; `class OpeningModel` exists in exactly these two files and none of the four cell-specific pieces live in tests/helpers/; both locations in tests/, not gate files, OpeningModel is stimulus not a negative-witness double, docs/bugs/0352:213 cites the file as witness only (no merge/rename/delete proposed), no coverage-matrix hit; no PTQ row tracks this pair and same-wave siblings (b0292/e2e-s3, typed-query-schema-integration/e2e-s3, production-typed-query-validation/e2e-s3) cite disjoint file pairs (triage: claude-fable-5-1)
