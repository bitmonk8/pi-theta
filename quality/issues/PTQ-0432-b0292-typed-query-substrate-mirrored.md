---
id: PTQ-0432
title: b0292's typed-query substrate (NOOP_CHECKPOINT, liveSignal, config, RespondingModel, schemaDeclsOf, ajv) is redeclared byte-for-byte from tests/e2e-s3-typed-query-conformance.test.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/b0292-validation-errors-canonical-order.test.ts:59-116
  - tests/e2e-s3-typed-query-conformance.test.ts:61-127
sites: 2
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0292's typed-query substrate is redeclared byte-for-byte from tests/e2e-s3-typed-query-conformance.test.ts

## Observation
tests/b0292-validation-errors-canonical-order.test.ts declares its own
`NOOP_CHECKPOINT`, `liveSignal()`, `config()`, `RespondingModel`,
`schemaDeclsOf()` and `ajv()` at lines 59-116. tests/e2e-s3-typed-query-conformance.test.ts
declares the same six pieces at lines 61-127, structurally identical apart
from fixture-specific string literals (`"pair.theta"`/`"/pair"`/`"inv-b0292"`
vs `"triage.theta"`/`"/triage"`/`"inv-s3"`, and the `ajv()` slug string). b0292's
own header comment states "Substrate mirrors
tests/e2e-s3-typed-query-conformance.test.ts (the production typed-query loop
over the real parser, lowering, AjvSchemaValidator and respond-repair — no
live provider)" — the mirroring is acknowledged in prose, not centralised.

## Evidence
tests/b0292-validation-errors-canonical-order.test.ts:59-93:
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
  // A typed query at `max_rounds: 0` fires the forced-respond terminator as its
  // only turn (QRY-14) — no free-phase provider call.
  return {
    maxRounds: 0,
    querySite: { file: "pair.theta", line: 1, column: 1 },
    thetaSlashName: "/pair",
    invocationId: "inv-b0292",
    occurredAt: 0,
  };
}

/** A scripted `QueryModelDriver` whose forced-respond turn carries `payload`. */
class RespondingModel implements QueryModelDriver {
  constructor(private readonly payload: unknown) {}
  nextFreePhaseTurn(): Promise<FreePhaseTurn> {
    throw new Error("no free-phase turn on a max_rounds:0 typed query");
  }
```

tests/b0292-validation-errors-canonical-order.test.ts:94-116:
```ts
  runToolBatch(): Promise<readonly never[]> {
    throw new Error("no tool batch on a max_rounds:0 typed query");
  }
  forcedRespondTurn(): Promise<ForcedRespondTurn> {
    return Promise.resolve({ kind: "respond", payload: this.payload });
  }
}

/** Parse a `.theta` source and return its body's `schema` declarations. */
function schemaDeclsOf(src: string): readonly SchemaDecl[] {
  const deps = {
    systemNote: {
      pi: { sendMessage: () => Promise.resolve() },
      ui: { notify: () => {} },
      emitDiagnostic: () => {},
    },
    modelMatcher: { resolve: () => "resolved" as const },
  } as unknown as ParseThetaDocumentDeps;
  const source: ThetaSource = { path: "pair.theta", bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, deps);
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}

function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: "pair",
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}
```

tests/e2e-s3-typed-query-conformance.test.ts:61-96 (the counterpart, same
order, same six declarations):
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
  // A typed query at `max_rounds: 0` fires the forced-respond terminator as its
  // only turn (QRY-14) — no free-phase provider call — so the scripted driver
  // supplies only the forced-respond payload.
  return {
    maxRounds: 0,
    querySite: { file: "triage.theta", line: 1, column: 1 },
    thetaSlashName: "/triage",
    invocationId: "inv-s3",
    occurredAt: 0,
  };
}

/** A scripted `QueryModelDriver` whose forced-respond turn carries `payload`. */
class RespondingModel implements QueryModelDriver {
  constructor(private readonly payload: unknown) {}
  nextFreePhaseTurn(): Promise<FreePhaseTurn> {
    throw new Error("no free-phase turn on a max_rounds:0 typed query");
  }
```

tests/e2e-s3-typed-query-conformance.test.ts:97-127 (RespondingModel's
remaining two methods, `schemaDeclsOf` and `ajv`, identical in shape to
b0292's):
```ts
  runToolBatch(): Promise<readonly never[]> {
    throw new Error("no tool batch on a max_rounds:0 typed query");
  }
  forcedRespondTurn(): Promise<ForcedRespondTurn> {
    return Promise.resolve({ kind: "respond", payload: this.payload });
  }
}

/** Parse a `.theta` source and return its body's `schema` declarations. */
function schemaDeclsOf(src: string): readonly SchemaDecl[] {
  const deps = {
    systemNote: {
      pi: { sendMessage: () => Promise.resolve() },
      ui: { notify: () => {} },
      emitDiagnostic: () => {},
    },
    modelMatcher: { resolve: () => "resolved" as const },
  } as unknown as ParseThetaDocumentDeps;
  const source: ThetaSource = { path: "triage.theta", bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, deps);
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}
```

The pattern also recurs (same `RespondingModel` class name and shape) in
tests/b0465-imported-annotation-vacuous-validation.test.ts,
tests/production-typed-query-validation.test.ts and
tests/query-schema-transitive-defs.test.ts and
tests/typed-query-schema-integration.test.ts — noted for context only, since
those four files are outside this review's scope and are not cited as
locations of this filing.

## Why this is a problem
Two files declare the identical six-piece "drive a typed `@<Schema>` query
through the real `runTypedQueryLoop` with a scripted forced-respond driver"
scaffold — `NOOP_CHECKPOINT`, `liveSignal()`, `config()`, `RespondingModel`,
`schemaDeclsOf()` and `ajv()` — differing only in fixture-specific string
literals. b0292's own header names the mirrored file, so the duplication is
not a coincidence of convergent design but an acknowledged copy that was not
factored into a shared module the way tests/helpers/scripted-live-session-harness.ts
does for the sibling bug-0288/0319/0414 lineage (that module's own header
names the exact same motivation: "each redeclared byte-for-byte the pieces
that carry no cell-specific variation between them").

## Suggested direction (non-binding, optional)
A shared tests/helpers/ module for the "scripted-forced-respond typed-query
substrate" (mirroring how scripted-live-session-harness.ts already centralises
the bug-0288/0319/0414 lineage) is the natural home the header comment already
gestures at.

## False-positive check
Gate-pin: neither file's name nor path matches `*gate*.test.ts` or a listed
gate kin; not a census/pin gate. Recording-double: `RespondingModel` and the
double surface here are stimulus, not a MUST-NOT-witness recording double —
carve-out does not apply. docs/bugs/ signature search: b0292's own header
cites docs/bugs/0292 for the *behavioural* fix, not for a documented red
covering this duplication; no bug doc discusses the substrate duplication
itself. coverage-matrix/bug-doc citation search: `grep -rn "b0292-validation-errors-canonical-order"
docs/reference/coverage-matrix.md docs/bugs/` found no citation by name
requiring this file's structure to stay as-is. This claim is about existing
duplicated test code, not about a missing test — no coverage judgment is
made.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts match at the cited lines and a diff of b0292:59-116 vs e2e-s3:61-127 shows NOOP_CHECKPOINT/liveSignal/RespondingModel/schemaDeclsOf/ajv byte-identical apart from fixture literals (pair/triage, /pair//triage, inv-b0292/inv-s3), one comment clause in config() and the interleaved TRIAGE_SOURCE const; b0292:29-31 header names the mirrored file; `class RespondingModel` greps to exactly the 6 cited test files with no tests/helpers/ provider; both locations in tests/, neither a gate or tests/live file, RespondingModel is stimulus not a recording double, and bug-doc citations (docs/bugs/0292:193, 0172:270) name the tests as witnesses without requiring the substrate stay inline; no quality/issues or quality/resolved row tracks the e2e-s3 substrate — sibling same-wave intake filings cover other copies and defer to this one (triage: claude-fable-5-1)
