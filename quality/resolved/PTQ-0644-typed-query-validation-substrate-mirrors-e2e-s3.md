---
id: PTQ-0644
title: production-typed-query-validation.test.ts redeclares the NOOP_CHECKPOINT/liveSignal/config/RespondingModel/schemaDeclsOf/ajv sextet tests/e2e-s3-typed-query-conformance.test.ts already carries
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/production-typed-query-validation.test.ts:53-121
  - tests/e2e-s3-typed-query-conformance.test.ts:61-127
sites: 2
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# production-typed-query-validation.test.ts redeclares the NOOP_CHECKPOINT/liveSignal/config/RespondingModel/schemaDeclsOf/ajv sextet tests/e2e-s3-typed-query-conformance.test.ts already carries

## Observation
`tests/production-typed-query-validation.test.ts` declares, module-scope, its own `NOOP_CHECKPOINT`, `liveSignal()`, `config()`, `RespondingModel`, `schemaDeclsOf()` and `ajv()` — six pieces of "drive a typed `@<Schema>` query through the real `runTypedQueryLoop` with a scripted forced-respond driver" scaffolding. `tests/e2e-s3-typed-query-conformance.test.ts` declares the same six pieces, in the same order, structurally identical apart from fixture-specific string literals (`"triage.theta"`/`"/triage"`/`"inv-1"` vs the same in e2e-s3, `"inv-s3"`) and comment wording. Neither file imports the other's declarations or a shared helper; each types its own copy.

## Evidence

`tests/production-typed-query-validation.test.ts:53-72`:
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
  // A typed query dispatches only the forced-respond terminator (max_rounds: 0).
  return {
    maxRounds: 0,
    querySite: { file: "triage.theta", line: 1, column: 1 },
    thetaSlashName: "/triage",
    invocationId: "inv-1",
    occurredAt: 0,
  };
}
```

`tests/production-typed-query-validation.test.ts:74-121` (`RespondingModel`, `schemaDeclsOf`, `ajv`):
```ts
class RespondingModel implements QueryModelDriver {
  constructor(private readonly payload: unknown) {}
  nextFreePhaseTurn(): Promise<FreePhaseTurn> {
    throw new Error("no free-phase turn on a max_rounds:0 typed query");
  }
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

function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: "triage",
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}
```

`tests/e2e-s3-typed-query-conformance.test.ts:61-127` (the counterpart, same order, same six declarations):
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

class RespondingModel implements QueryModelDriver {
  constructor(private readonly payload: unknown) {}
  nextFreePhaseTurn(): Promise<FreePhaseTurn> {
    throw new Error("no free-phase turn on a max_rounds:0 typed query");
  }
  runToolBatch(): Promise<readonly never[]> {
    throw new Error("no tool batch on a max_rounds:0 typed query");
  }
  forcedRespondTurn(): Promise<ForcedRespondTurn> {
    return Promise.resolve({ kind: "respond", payload: this.payload });
  }
}

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

function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: "triage",
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}
```

Verification performed during this review: `sed -n '53,121p' tests/production-typed-query-validation.test.ts` diffed against `sed -n '61,127p' tests/e2e-s3-typed-query-conformance.test.ts` reports only three divergent lines — the `config()` doc-comment wording, the `invocationId` literal (`"inv-1"` vs `"inv-s3"`), and the `RespondingModel` doc-comment wording (`"A scripted model…"` vs `"A scripted \`QueryModelDriver\`…"`) — every declaration body, member, and string beyond those is byte-identical.

## Why this is a problem
Two files each type the identical six-piece "drive a typed `@<Schema>` query through the real `runTypedQueryLoop` with a scripted forced-respond driver" scaffold — a `Checkpoint` double, a live `AbortSignal` factory, a `QueryToolLoopConfig` builder, a `QueryModelDriver` fake, a schema-declaration parser, and an AJV factory — rather than importing one shared declaration. A prior finding in this same wave (`qw20260917154546-d7-01-b0292-typed-query-substrate-mirrored.md`) already identified this exact substrate duplicated between `tests/b0292-validation-errors-canonical-order.test.ts` and `tests/e2e-s3-typed-query-conformance.test.ts`, and explicitly noted the same shape recurring in `tests/production-typed-query-validation.test.ts` "for context only" without citing it as a location. This finding cites `tests/production-typed-query-validation.test.ts` directly, since it is in this wave's review scope.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` module for the "scripted-forced-respond typed-query substrate" (the same shape a prior finding in this wave already proposed for the b0292/e2e-s3 pair) would be the natural home for all three files' copies, parameterised by the fixture-specific literals (schema source, slug, invocation id) that are the only lines that actually vary between them.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kin; the cited lines are scaffolding declarations, not a pinned count or inventory assertion.
- Recording-double check: `RespondingModel` is a scripted stimulus double (its `forcedRespondTurn` returns a fixed payload), not a "never called" negative witness; the recording-double carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "production-typed-query-validation\|e2e-s3-typed-query-conformance" docs/bugs/` finds each file's own bug documents (QRY-22/Defect B provenance, S3 conformance) but no doc marking the substrate DUPLICATION itself as a documented correct-reason red; both files pass at HEAD.
- coverage-matrix/bug-doc citation search: `grep -n "production-typed-query-validation\|e2e-s3-typed-query-conformance" docs/reference/coverage-matrix.md` → 0 hits for either file by name in a way that pins this shared substrate. This finding proposes no merge, rename or deletion of any `it()`/`describe()`.
- Coverage check: the claim is entirely about a repeated harness/fixture DEFINITION; each file's own tests exercise their own copy, so this is not a coverage-gap claim.
- Prior-finding check: `qw20260917154546-d7-01-b0292-typed-query-substrate-mirrored.md` names this exact file ("The pattern also recurs … in … tests/production-typed-query-validation.test.ts") but explicitly does not cite it as a location, stating those files are "outside this review's scope and are not cited as locations of this filing" — that review's scope excluded this file; this review's scope includes it, so this is a new, non-duplicate filing against the previously-uncited file.

## Triage
verdict: confirmed — independently re-verified: both excerpts match at the cited lines and a diff of production-typed-query-validation:53-121 vs e2e-s3:61-127 reproduces exactly the three claimed divergences (config() comment, `inv-1`/`inv-s3`, RespondingModel doc comment) with every declaration body of the NOOP_CHECKPOINT/liveSignal/config/RespondingModel/schemaDeclsOf/ajv sextet byte-identical; `class RespondingModel`/`schemaDeclsOf`/`NOOP_CHECKPOINT` grep to test files only with no tests/helpers/ provider and neither file imports a shared substrate; both locations in tests/, neither gate nor tests/live, RespondingModel is a scripted stimulus double not a negative-witness recorder; docs/bugs/0010:437,526, 0028:82, 0055:494-891 cite the file only as a witness suite / edit site (no carve-out engaged, no merge/rename/delete proposed), coverage-matrix 0 hits; not a duplicate — same-wave d7-01-b0292 (confirmed) cites the disjoint b0292/e2e-s3 pair and named this file as context only, and per the store's per-pair convention (PTQ-0222/0237/0250/0311/0313; sibling d7-02 ruled the same way) each newly-cited copy is its own row; no quality/issues or quality/resolved row names this file (triage: claude-fable-5-1)
