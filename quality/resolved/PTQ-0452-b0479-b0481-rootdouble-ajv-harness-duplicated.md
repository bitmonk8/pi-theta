---
id: PTQ-0452
title: b0479 and b0481 each declare a byte-identical rootDouble()+ajv() RuntimeRoot harness instead of a shared helper
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/b0479-frontmatter-model-drives-every-turn.test.ts:314-320
  - tests/b0479-frontmatter-model-drives-every-turn.test.ts:323-338
  - tests/b0481-forced-tool-choice-model-rejection-degrades.test.ts:201-207
  - tests/b0481-forced-tool-choice-model-rejection-degrades.test.ts:209-224
  - tests/b0479-frontmatter-model-drives-every-turn.test.ts:294-303
  - tests/b0479-frontmatter-model-drives-every-turn.test.ts:305-312
  - tests/b0481-forced-tool-choice-model-rejection-degrades.test.ts:182-190
  - tests/b0481-forced-tool-choice-model-rejection-degrades.test.ts:192-199
  - tests/b0478-augmented-agentmessage-variants-excluded-before-walk.test.ts:433-441
  - tests/b0478-augmented-agentmessage-variants-excluded-before-walk.test.ts:443-453
sites: 3
fix_scope: cross-module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0479 and b0481 each declare a byte-identical rootDouble()+ajv() RuntimeRoot harness instead of a shared helper

## Observation
`tests/b0479-frontmatter-model-drives-every-turn.test.ts` and
`tests/b0481-forced-tool-choice-model-rejection-degrades.test.ts` each declare a
module-scope `ajv(): AjvSchemaValidator` helper and a module-scope
`rootDouble(): RuntimeRoot` helper; the two files' text is byte-for-byte
identical for both functions. Both files also each declare a `parseDeps():
ParseThetaDocumentDeps` and a `parse(src: string): ThetaDocument` helper that
build the same `systemNote` / `modelMatcher` shape and run the same
parse-then-assert-clean sequence, differing only in cosmetic restructuring (one
destructures into local `const`s, the other returns an object literal
directly) and the assertion message text. `tests/b0478-augmented-agentmessage-variants-excluded-before-walk.test.ts`
declares a third `parseDeps()`/`parse()` pair with the same shape (same two
fields, same parse-then-assert-clean sequence) and a `rootDouble()` that
follows the same checkpoint/idSource/clock/schemaValidator skeleton, diverging
only in the extra `tokenEstimator` field and an inlined (rather than named)
AJV double.

## Evidence
`tests/b0479-frontmatter-model-drives-every-turn.test.ts:314-338`:
```
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

/** `clock.setTimeout` fires synchronously: the instant-settle turn is already settled at the send. */
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
    schemaValidator: ajv(),
  } as unknown as RuntimeRoot;
}
```

`tests/b0481-forced-tool-choice-model-rejection-degrades.test.ts:201-224` — identical apart from the docstring comment (absent here):
```
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
    schemaValidator: ajv(),
  } as unknown as RuntimeRoot;
}
```

`tests/b0479-frontmatter-model-drives-every-turn.test.ts:294-312`:
```
function parseDeps(): ParseThetaDocumentDeps {
  return {
    systemNote: {
      pi: { sendMessage: (): void => {} },
      ui: { notify: (): void => {} },
      emitDiagnostic: (): void => {},
    },
    modelMatcher: { resolve: (): "resolved" => "resolved" } as ModelReferenceMatcher,
  };
}

function parse(src: string): ThetaDocument {
  const source: ThetaSource = { path: "probe.theta", bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors, "the fixture theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the fixture theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}
```

`tests/b0481-forced-tool-choice-model-rejection-degrades.test.ts:182-199` — same fields, same sequence, restructured into local `const`s:
```
function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

function parse(src: string): ThetaDocument {
  const source: ThetaSource = { path: "probe.theta", bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors, "the fixture theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the fixture theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}
```

`tests/b0478-augmented-agentmessage-variants-excluded-before-walk.test.ts:433-453` — the same two-field `parseDeps()` and parse-then-assert-clean `parse()` shape, a third independent instance:
```
function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

function parse(src: string) {
  const source: ThetaSource = {
    path: "code-review.theta",
    bytes: new TextEncoder().encode(src),
  };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors, "the binder theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the binder theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}
```

Search: `grep -n "function rootDouble\|function ajv(\|function parseDeps\|function parse(" tests/b0478*.test.ts tests/b0479*.test.ts tests/b0481*.test.ts` — 3 files, each hit all four helper names once (12 hits total), confirming three independent declarations rather than an import from `tests/helpers/`.

## Why this is a problem
`ajv()` and `rootDouble()` are reproduced character-for-character across
`b0479` and `b0481` (11 and 16 lines respectively) with no shared source; a
change to the shape `RuntimeRoot` or `AjvSchemaValidator` expects (e.g. a new
required field on the double) has to be made twice by hand or the two files
silently diverge. `parseDeps()`/`parse()` add a third, semantically identical
copy in `b0478` and near-identical copies in `b0479`/`b0481`: the same
"build a minimal `ParseThetaDocumentDeps`, parse, and assert the fixture
parses cleanly with a resolvable frontmatter" sequence is authored three times.
`tests/helpers/parent-producer-harness.ts`'s own header comment records that
this repository has already, more than once, consolidated an identically-
shaped per-file `rootDouble()` (checkpoint/idSource/clock) into one helper
after multiple test files independently declared it — the same shape recurs
here, unconsolidated, for the schema-validator-carrying variant.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` module exposing the AJV-backed `RuntimeRoot` double
(and the `parseDeps()`/`parse()` theta-fixture pair) would give `b0478`,
`b0479`, and `b0481` one place to change instead of three — naming this as
the natural home is an observation about the existing `parent-producer-harness.ts`
precedent, not a design.

## False-positive check
Gate-pin: none of the three files match `*gate*.test.ts` or the named gate
kin; not a pinned-count test. Recording-double: `rootDouble()`/`ajv()` are
plain value-returning doubles, not call-recording negative witnesses, so the
carve-out does not apply. docs/bugs/ signature search: `grep -rn "rootDouble\|ajv()" docs/bugs/` returned one unrelated hit (docs/bugs/0172, discussing a different rootDouble() missing a schemaValidator, not this shape) — no documented
cites this harness shape. Coverage-matrix/bug-doc citation search: `grep -n
"b0478\|b0479\|b0481" docs/reference/coverage-matrix.md` and the two bug docs'
witness lists were checked; the finding proposes no merge, rename, or deletion
of any cited test, only pointing at helper extraction, so the citation
carve-out does not block filing. This is not a coverage claim: all three files
already exist and already pass; the observation is about the harness code
duplicated inside them.

## Triage
verdict: confirmed — independently re-verified: diff of the extracted ranges shows ajv()+rootDouble() (b0479:314-338 sans docstring vs b0481:201-224) and parse() (b0479:305-312 vs b0481:192-199) byte-identical, b0478:433-453 parseDeps()/parse() match, the stated grep returns exactly 12 hits with no helpers/ import in any of the three files; stronger than filed — tests/helpers/scripted-live-session-harness.ts:92-119 (feefe7ca, 2026-09-14, PTQ-0328's fix) already exports parseDeps/parse/ajv byte-identical to b0481's copies and both b0479 (2b68c847) and b0481 (b59285ae) were authored 2026-09-17 after it landed; no carve-out applies (not gate tests, plain value doubles, no merge/rename/delete, docs/bugs/0172's rootDouble hit is a different shape, no coverage-matrix cite) and no issues/resolved row cites b0478/b0479/b0481 (PTQ-0328 is resolved and bounded to b0288/b0319/b0414) (triage: claude-fable-5-1)
