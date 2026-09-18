---
id: PTQ-0810
title: "\"QRY-22 inline object/type annotation integration\" test drives the identical named-schema fixture as the sibling tests, never an inline-annotated query"
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/typed-query-schema-integration.test.ts:298-326
  - tests/typed-query-schema-integration.test.ts:89-96
  - tests/typed-query-schema-integration.test.ts:237-247
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# "QRY-22 inline object/type annotation integration" test drives the identical named-schema fixture as the sibling tests, never an inline-annotated query

## Observation
The `describe("V13e-T — QRY-22 inline object/type annotation integration", …)` block's single `it` claims to exercise a typed query whose response shape is declared via an inline object/type annotation (`@<{...}>`), as distinct from the named `schema Report { … }` declaration the earlier describes in the same file exercise. The test body drives `runTypedQueryLoop` with the exact same `config()` builder, the exact same `NON_CONFORMING` payload wrapped in `RespondingModel`, and the exact same `SpyValidation` double as the "validation enforced via the execution path" describe's non-conforming test a few lines above it — no `.theta` source, `QueryExpr`, or schema-shape fixture is ever constructed that differs between a named-schema query and an inline-annotated one.

## Evidence

`tests/typed-query-schema-integration.test.ts:298-326` (the "inline object/type annotation integration" test, in full):
```ts
describe("V13e-T — QRY-22 inline object/type annotation integration", () => {
  it("QRY-22: an inline object/type-annotated typed query lowers its declared shape, conveys the lowered shape, and validates the response against it", async () => {
    const validation = new SpyValidation();

    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new RespondingModel(NON_CONFORMING),
      config(),
      validation,
    );

    expect(
      validation.lowerCalls,
      "QRY-22: the execution path lowers the inline shape (V5d/SUBS-1)",
    ).toBeGreaterThan(0);
    expect(
      validation.conveyed,
      "QRY-22: the inline query's conveyance carries the lowered shape",
    ).toEqual(LOWERED);
    expect(
      validation.validateCalls,
      "QRY-22: the inline query's response is validated against the lowered schema",
    ).toBeGreaterThan(0);
    expect(
      outcome.kind,
      "QRY-22: a non-conforming inline-typed response is not bound as the value",
    ).not.toBe("value");
  });
});
```

`tests/typed-query-schema-integration.test.ts:237-247` — the earlier "validation enforced via the execution path" test's drive call, byte-identical to the "inline" test's drive call above (same `config()`, same `RespondingModel(NON_CONFORMING)`, same fresh `SpyValidation`):
```ts
    const validation = new SpyValidation();

    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new RespondingModel(NON_CONFORMING),
      config(),
      validation,
    );
```

`tests/typed-query-schema-integration.test.ts:89-96` — `config()` takes no
parameters and always returns the same fixed `QueryToolLoopConfig`; nothing in
the file threads a schema-shape (named vs inline) choice into it:
```ts
function config(): QueryToolLoopConfig {
  return forcedRespondConfig({
    querySite: QUERY_SITE,
    thetaSlashName: "/report",
    invocationId: "00000000-0000-4000-8000-000000000000",
    occurredAt: 1_700_000_000_000,
  });
}
```

Exact search run: `grep -n "inline" tests/typed-query-schema-integration.test.ts`
→ 6 hits, all either the file's header prose, the describe/it title strings, or
the doc-comment wording inside the assertion messages quoted above — none is a
`.theta` source literal, a `QueryExpr` construction, or a branch in
`SpyValidation`/`config()` that varies behaviour between a named `schema`
declaration and an inline object/type annotation. `SpyValidation.lower()`
(lines 154-157) ignores whatever schema identity it might be called with and
unconditionally returns the module-level `LOWERED` constant, so no fixture in
this file can express the distinction the test's name claims to exercise.

## Why this is a problem
A reader following the test's name ("an inline object/type-annotated typed
query …") would conclude this cell independently exercises the
inline-object/type-annotation lowering path (`@<{...}>`) as a second entry
point into `V5d`/`SUBS-1`, distinct from the named-schema path the two
describes above it already cover. The body proves otherwise: it issues the
identical `runTypedQueryLoop(NOOP_CHECKPOINT, liveSignal(),
new RespondingModel(NON_CONFORMING), config(), validation)` call already
issued by the "validation enforced via the execution path" describe's
non-conforming test, against the identical `SpyValidation` double whose
`lower()` method returns a constant irrespective of any schema-shape
argument. No inline-annotation-specific input exists anywhere in the file for
this test to be distinguishing.

## Suggested direction (non-binding, optional)
Naming the test after what it actually drives (the same named-`schema`
non-conforming path already covered above) — or threading an actual
inline-object/type-annotation fixture through `config()`/`SpyValidation` so
the "inline" describe exercises a genuinely different input — would resolve
the name/body mismatch; either is a decision for the fix stage.

## False-positive check
- Gate-pin check: the file is not `*gate*.test.ts` or a named gate kin; the
  cited lines are an ordinary `it()` body, not a pinned count/inventory
  assertion.
- Recording-double check: `SpyValidation` is a spy double backing positive
  call-count assertions in this test, not a "never called" MUST-NOT witness;
  the recording-double carve-out does not apply, and this finding is about the
  test's name misdescribing what input drives the double, not about the
  double's assertion technique.
- docs/bugs/ signature search: `grep -rl "typed-query-schema-integration"
  docs/bugs/` → docs/bugs/0010 (lines 438, 527) and docs/bugs/0055 (lines 495,
  712, 892); both cite the file only as a surviving witness suite / as the
  edit site for the hand-written `LOWERED` constant at line 133 — neither
  discusses or pins this specific test's name, body, or the "inline object/type
  annotation" framing as a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "typed-query-schema-integration"
  docs/reference/coverage-matrix.md` → 0 hits; `grep -n "inline object/type"
  docs/bugs/0010-*.md docs/bugs/0055-*.md docs/reference/coverage-matrix.md` →
  0 hits. No document cites this test by name or pins its current title/body
  pairing; no merge, rename, or deletion of any `it()`/`describe()` is
  proposed here — only the name/body mismatch is reported.
- Coverage check: this is not a claim that inline-object/type-annotation
  lowering is untested elsewhere in the suite (that would be a coverage
  routing note, not a filing) — it is the claim that THIS specific,
  distinctly-named test does not exercise what its name and per-assertion
  messages say it exercises.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: the it() at tests/typed-query-schema-integration.test.ts:298-326 titled "an inline object/type-annotated typed query …" issues a `runTypedQueryLoop(NOOP_CHECKPOINT, liveSignal(), new RespondingModel(NON_CONFORMING), config(), validation)` call byte-identical to the sibling at :237-247; `config()` (:89-96) is parameterless, `QueryToolLoopConfig` (src/runtime/query-tool-loop.ts:171-182) carries no schema-shape field, `TypedQuerySchemaValidation.lower()` (:320) takes no argument and `SpyValidation.lower()` (:154-157) returns the constant `LOWERED`, so no inline-annotation input exists or can be threaded through this cell — D7 misleading-name class (title asserts a fixture the body never constructs); location under tests/, not a gate file, no recording-double MUST-NOT witness, 0 coverage-matrix hits, docs/bugs 0010/0055 cite the file only as a surviving suite / the `LOWERED` edit site and no doc pins this it() title, no merge/rename/delete proposed; the stated grep yields 7 hits not 6 (the :7 header comment) but all are prose/titles as claimed; not tracked by any existing PTQ (PTQ-0580/0644 were substrate-duplication, resolved) (triage: claude-fable-5-1)
