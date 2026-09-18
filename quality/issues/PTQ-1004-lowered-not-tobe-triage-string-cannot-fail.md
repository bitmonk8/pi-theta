---
id: PTQ-1004
title: production-typed-query-validation.test.ts's final `not.toBe("Triage")` check is unfalsifiable given lowerQueryResponseSchema's own return type
lens: D7
status: open
verdict: confirmed
locations:
  - tests/production-typed-query-validation.test.ts:144-160
  - src/runtime/query-schema-lowering.ts:163-171
  - src/seams/schema-validator.ts:14
sites: 1
fix_scope: localized
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# production-typed-query-validation.test.ts's final `not.toBe("Triage")` check is unfalsifiable given lowerQueryResponseSchema's own return type

## Observation
The last cell in `production-typed-query-validation.test.ts` computes
`lowered = lowerQueryResponseSchema("Triage", ...)`, asserts it `toBeDefined()`
and `toMatchObject({ type: "object", ... })`, reads two of its `properties`
fields, and then closes with `expect(lowered).not.toBe("Triage")` under the
comment "Not the bare type name." `lowerQueryResponseSchema` is declared
`(annotation: string, schemas: ..., enums: ...): LoweredSchema | undefined`,
and `LoweredSchema` is `Readonly<Record<string, unknown>>` — a plain-object
type, never a string. The final assertion therefore compares a
statically-object-typed value against a string literal it can never equal,
regardless of any defect the surrounding cells exist to catch.

## Evidence

`tests/production-typed-query-validation.test.ts:144-160` (re-read
immediately before filing):
```ts
    const lowered = lowerQueryResponseSchema("Triage", schemaDeclsOf(TRIAGE_SOURCE, "triage.theta"));
    expect(lowered, "QRY-22: parser retains the schema body so it lowers").toBeDefined();
    expect(lowered).toMatchObject({
      type: "object",
      required: ["category", "urgent"],
      additionalProperties: false,
    });
    // The declared literal set lowers to the enum form; the boolean field to a type.
    const properties = (lowered as { readonly properties: Record<string, unknown> }).properties;
    expect(
      properties["category"],
      `schema-subset.md:80 spells one emission for an enum or a string-literal union; ` +
        `observed ${JSON.stringify(properties["category"])}`,
    ).toEqual({ type: "string", enum: ["bug", "feature", "question"] });
    expect(properties["urgent"]).toEqual({ type: "boolean" });
    // Not the bare type name.
    expect(lowered).not.toBe("Triage");
```

`src/runtime/query-schema-lowering.ts:163-171` (the function's declared
signature — the return type this cell's own local `lowered` binding takes):
```ts
export function lowerQueryResponseSchema(
  annotation: string,
  schemas: readonly SchemaDecl[],
  enums: readonly EnumDecl[] = [],
): LoweredSchema | undefined {
  const bodyTypeMap = buildBodyTypeSchemas(schemas, enums);
  const s = annotation.trim();
  if (s.length === 0) {
    return undefined;
```

`src/seams/schema-validator.ts:14` (the `LoweredSchema` type this function
returns):
```ts
export type LoweredSchema = Readonly<Record<string, unknown>>;
```

## Why this is a problem
`lowered`'s type is `LoweredSchema | undefined` — `Readonly<Record<string,
unknown>> | undefined` — never `string`. `expect(lowered).not.toBe("Triage")`
asks whether an object-or-undefined value strictly equals the string
`"Triage"`; by the point this line runs, the two preceding assertions
(`toBeDefined()` and `toMatchObject({ type: "object", ... })`) have already
forced the test to fail earlier if `lowered` were anything but an object
matching that shape, so the final line's own comparison can never observe a
failure that either the type signature or the two prior assertions have not
already ruled out. No implementation change to `lowerQueryResponseSchema`
that this file's suite could exercise can make this specific line's
comparison fail: the assertion "asserts" a fact already guaranteed by the
function's own declared return type, not an observable this file's Defect-B
regression (an unvalidated `Ok(null)`) or any other reachable bug could
violate.

## Suggested direction (non-binding, optional)
The intent the comment states — "conveyed to the model, not the bare type
name" — is about the `RespondingModel`/forced-respond payload the loop
CONVEYS to a scripted model, not about `lowerQueryResponseSchema`'s own
return value; a cell asserting that intent would need to inspect what the
loop sends as the tool schema (as the file's own `forcedRespondConfig`/
`RespondingModel` machinery already does in the cells above it), not compare
`lowered` to a string it is statically incapable of equalling.

## False-positive check
- Gate-pin carve-out: the file does not match `*gate*.test.ts` or a named
  gate kin; this is not a pinned count or inventory assertion.
- Recording-double carve-out: this assertion backs no recording double and
  is not a "never called" MUST-NOT witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -n "not.toBe(\"Triage\")\|bare type name"
  docs/bugs/*.md` → 0 hits; no documented correct-reason red covers this
  specific comparison.
- coverage-matrix/bug-doc citation search: `grep -n
  "production-typed-query-validation" docs/reference/coverage-matrix.md` →
  0 hits. This finding proposes no merge, rename, or deletion of the `it()`
  block or any other assertion in it — the `toBeDefined()`/`toMatchObject()`/
  two `properties[...]` assertions in the same cell are unaffected and
  remain real, falsifiable checks on the lowered document's shape.
- Coverage check: this is not a claim that a behaviour or path is untested —
  the cell's other four assertions do exercise `lowerQueryResponseSchema`'s
  real shape; only the closing line is unfalsifiable given the function's
  own declared return type.
- Prior-filing search: `grep -rl "lowerQueryResponseSchema" quality/issues
  quality/intake quality/resolved` finds no filing about this specific
  closing assertion; the shape matches the repository's established
  "assertion that cannot fail" class (cf. resolved PTQ-0818, PTQ-0903,
  PTQ-0242, PTQ-0847) but is a distinct site from all of them.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at tests/production-typed-query-validation.test.ts:144-160, src/runtime/query-schema-lowering.ts:163-171 and src/seams/schema-validator.ts:14; `lowered` is `LoweredSchema | undefined` (`Readonly<Record<string, unknown>>`), the `.not.toBe("Triage")` at :160 is the only such site in tests/ and runs after `.toBeDefined()` (:145) and `.toMatchObject({ type: "object", … })` (:146-150) have already passed on the same value, so `Object.is(obj, "Triage")` is false by construction — a D7 assertion-that-cannot-fail entailed by its predecessors and by the return type, the exact shape confirmed and fixed as PTQ-0847 on the sibling `not.toBe("Report")` site in typed-query-schema-integration.test.ts (distinct file/line, so not a duplicate); stated searches reproduce (docs/bugs: 0 hits for the signature, file cited only at 0010:437/526 as a witness suite and 0055:494/709/891 for the untouched `properties["category"]` assertion; coverage-matrix: 0); not a gate file, not a recording-double negative witness, no it()/describe() merge/rename/delete proposed; file green 5/5 — the fix is a mechanical removal of one entailed assertion (triage: claude-fable-5-1)
