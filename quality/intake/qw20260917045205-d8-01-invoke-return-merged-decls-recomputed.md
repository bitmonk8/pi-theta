---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: "#validateInvokeReturn and #resolvePromptQuery each rebuild the identical merged schema/enum declaration sets a second time, over the same unchanged input, within one call"
lens: D8                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/production-theta-producer.ts:5285-5299
  - src/extension/production-theta-producer.ts:5306-5311
  - src/extension/production-theta-producer.ts:3750-3760
  - src/extension/production-theta-producer.ts:3898-3905
  - src/extension/production-theta-producer.ts:7030-7040
  - src/extension/production-theta-producer.ts:3281-3283
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d8_class: heavier-than-scale  # D8 only: overbuilt | reimplemented | against-grain | heavier-than-scale
d8_host: src/extension/production-theta-producer.ts#ProductionThetaProducer.#validateInvokeReturn # D8 only: the exemption key
wave: qw20260917045205
reported_by: lens-d8-simplification (unity-completions/gemini-3.7-flash)
date: 2026-09-17
---

# #validateInvokeReturn and #resolvePromptQuery each rebuild the identical merged schema/enum declaration sets a second time, over the same unchanged input, within one call

## Observation
`mergedSchemaDeclsOf` / `mergedEnumDeclsOf` each filter a theta body's
statements for `schema`/`enum` declarations, build a `Set` of their names,
filter the theta's imported declarations against that `Set`, and concatenate
the two arrays — an `O(bodyStatements + importedDecls)` pass each. Two of
`ProductionThetaProducer`'s methods call both functions TWICE on the identical
input within a single method invocation: once to build a lowered schema, and
again — moments later in the same call, over the same unchanged `theta`/
`mergedSite` value — to build the `schemaNames`/`enumNames` `Set`s
`decodeInboundValue` consumes. A third call site in the same file
(`#driveSubagentFnEntry`) computes the identical pair once and reuses the
result via local `const`s, showing the compute-once shape is already used
elsewhere in this file.

## Evidence

**`#validateInvokeReturn`** (5275-5349) — first computation, building the
lowered schema:

`src/extension/production-theta-producer.ts:5285-5299`
```ts
    const { annotation: returnSchema, declarations, importedTypeDecls } = returnSite;
    const mergedSite = { body: declarations, importedTypeDecls };
    // Ceiling #4 (ceilings-3-and-4.md#ceiling-4-table, the `invoke<T>` return-value
    // row; CIO-3): the depth walk is the FIRST sub-check at the return-value AJV
    // boundary, over the payload's WIRE FORM — the JSON document, not the carrier
    // graph (bug 0202). A depth-6+ document surfaces to the invoke parent as
    // `Err(InvokeInfraError { cause: "return_validation" })` before AJV is consulted.
    const depthBreach = enforceInvokeReturnDepth(calleePath, result.value as unknown);
    if (depthBreach !== undefined) {
      return depthBreach.result;
    }
    const lowered = lowerQueryResponseSchema(
      returnSchema,
      mergedSchemaDeclsOf(mergedSite),
      mergedEnumDeclsOf(mergedSite),
    );
```

Second computation, ~7-15 lines later in the SAME method call, over the SAME
`mergedSite` local (nothing reassigns it between the two call sites):

`src/extension/production-theta-producer.ts:5306-5311`
```ts
    if (verdict.ok) {
      const decoded = decodeInboundValue({
        lowered: lowered as unknown as Record<string, unknown>,
        annotation: returnSchema,
        schemaNames: new Set(mergedSchemaDeclsOf(mergedSite).map((decl) => decl.name)),
        enumNames: new Set(mergedEnumDeclsOf(mergedSite).map((decl) => decl.name)),
```

**`#resolvePromptQuery`** (3730-3926) — first computation, building the typed
query's lowered response schema:

`src/extension/production-theta-producer.ts:3750-3760`
```ts
    const activeTools = callableSetPiToolNames(deps.theta);
    // Bug 0010: lower the declared response schema FIRST — the single lowering
    // feeds the validation collaborator, the respond-tool registration, and the
    // QRY-15 template, so all three consume byte-identical canonical bytes.
    const lowered =
      expr.schema !== null
        ? lowerQueryResponseSchema(
            expr.schema,
            mergedSchemaDeclsOf(deps.theta),
            mergedEnumDeclsOf(deps.theta),
          )
        : undefined;
```

Second computation, inside the `decodeInbound` closure this SAME method
builds and returns (still reading `deps.theta`, the identical parameter, not
reassigned anywhere in the function):

`src/extension/production-theta-producer.ts:3898-3905`
```ts
    const decodeInbound =
      lowered !== undefined
        ? (validated: unknown): ThetaValue =>
            decodeInboundValue({
              lowered: lowered as unknown as Record<string, unknown>,
              annotation: expr.schema as string,
              schemaNames: new Set(mergedSchemaDeclsOf(deps.theta).map((decl) => decl.name)),
              enumNames: new Set(mergedEnumDeclsOf(deps.theta).map((decl) => decl.name)),
```

**The cost each call pays**, `mergedSchemaDeclsOf` in full (`mergedEnumDeclsOf`
is its declared "sibling" with "the same same-file-wins filter", :7043):

`src/extension/production-theta-producer.ts:7030-7040`
```ts
export function mergedSchemaDeclsOf(theta: {
  readonly body: ThetaBody;
  readonly importedTypeDecls?: ThetaCompositionInput["importedTypeDecls"];
}): SchemaDecl[] {
  const sameFile = schemaDeclsOf(theta.body);
  const sameFileNames = new Set(sameFile.map((decl) => decl.name));
  const imported = (theta.importedTypeDecls?.schemas ?? []).filter(
    (decl) => !sameFileNames.has(decl.name),
  );
  return [...imported, ...sameFile];
}
```
`schemaDeclsOf` itself is `body.statements.filter((stmt) => stmt.kind ===
"schema")` — a full scan of the theta body's top-level statement list, so
each of the four call sites above pays an `O(bodyStatements)` filter, an
`O(sameFileDecls)` `Set` build, and an `O(importedDecls)` filter, TWICE per
`mergedSchemaDeclsOf`/`mergedEnumDeclsOf` pair per method call.

**The compute-once shape already used elsewhere in this same file** —
`#driveSubagentFnEntry` computes the identical pair ONCE and reuses the
result via local `const`s for its own two downstream uses (`fn.params.map`):

`src/extension/production-theta-producer.ts:3281-3283`
```ts
    const schemaDecls = mergedSchemaDeclsOf(declSite);
    const enumDecls = mergedEnumDeclsOf(declSite);
    const loweredParams = fn.params.map((param) =>
```

**Call-frequency citation.** `#validateInvokeReturn` runs once per successful
`invoke(...)` / `.theta`-callable-call / `subagent fn` call whose return type
resolved to a site (both call sites inside `#driveCallee` and the
`#driveSubagentFnChild` path); `#resolvePromptQuery` runs once per `@`-query
expression evaluated. `docs/spec_topics/control-flow.md` CTRL-4 names
`invoke(...)`, `.theta`-callable calls, and `subagent fn` calls as legal
inside a loop body run once per iterand element, and CTRL-2's `par for`
queues an unbounded iterand 64-at-a-time — so a loop invoking the same typed
callee, or issuing the same typed query, repeatedly within one turn is a
normal, spec-illustrated shape, not a contrived edge case; each such
repetition independently pays the double computation described above.

## Why this is a problem
In both `#validateInvokeReturn` and `#resolvePromptQuery`, the second call to
`mergedSchemaDeclsOf`/`mergedEnumDeclsOf` operates on a value (`mergedSite`,
`deps.theta`) that is provably unchanged since the first call a few lines
earlier in the same function body — neither is reassigned, mutated, or
narrowed between the two call sites. The second call recomputes exactly the
array `lowerQueryResponseSchema` already consumed moments before, discarding
nothing that changed and reusing nothing that was kept. `#driveSubagentFnEntry`
in the same file demonstrates the alternative already in use: bind the result
to a `const` once, and pass that binding to every downstream consumer. Neither
`#validateInvokeReturn` nor `#resolvePromptQuery` needs a cache, a new seam,
or any cross-call machinery to avoid the second computation — only to reuse a
value each function already holds in scope.

## Suggested direction (non-binding, optional)
One unproven hypothesis, matching the shape `#driveSubagentFnEntry` already
uses: bind `mergedSchemaDeclsOf(mergedSite)` / `mergedEnumDeclsOf(mergedSite)`
(respectively `mergedSchemaDeclsOf(deps.theta)` / `mergedEnumDeclsOf(deps.theta)`)
to local `const`s once per function, and pass those bindings to both the
`lowerQueryResponseSchema` call and the later `schemaNames`/`enumNames` `Set`
construction, including inside the `decodeInbound` closure (capturing the
bound arrays instead of re-deriving them from `deps.theta` at call time).

## False-positive check
Re-read all six cited excerpts immediately before filing; each reproduces
verbatim at its line range. Confirmed `mergedSite` (`#validateInvokeReturn`,
bound at 5286) and `deps.theta` (`#resolvePromptQuery`'s parameter) are never
reassigned between each function's first and second `mergedSchemaDeclsOf`/
`mergedEnumDeclsOf` call — read both functions in full (5275-5349, 3730-3926)
to confirm no intervening mutation or narrowing. Confirmed `schemaDeclsOf`
(7000-7002) is a bare `Array.prototype.filter` over `body.statements` with no
memoisation, and `mergedSchemaDeclsOf`/`mergedEnumDeclsOf` build a fresh `Set`
and a fresh filtered array on every call — no cache keyed on `theta`/`site`
exists anywhere in this file (grepped `mergedSchemaDeclsOf(` and
`mergedEnumDeclsOf(` for all 12 call sites in the file; the other two pairs,
at `#driveSubagentFnEntry` (3281-3282) and `#resolveSubagentFnReturnSite`
(3701-3702) and `#resolveReturnSite` (5216-5217), each call the pair exactly
ONCE per invocation, confirming this is not the function's universal shape).
Checked this against the wave-family's already-filed
`qw20260916144930-d8-01-schema-compile-recomputed-every-call.md`, which also
names `#validateInvokeReturn`: that finding's claim is that
`SchemaValidator.compile()`'s content-hash cache-key computation is paid on
every REPEAT CALL of `#validateInvokeReturn` across separate `invoke()`
evaluations, even on a cache hit — its cited `#validateInvokeReturn` excerpt
stops at line 5254 (ending at the `.compile(lowered)` call), before either of
this finding's two `mergedSchemaDeclsOf`/`mergedEnumDeclsOf` call sites
(5296-5299, 5306-5311) in the CURRENT line numbering. This finding's claim is
orthogonal and does not depend on any repeat call: even a single, one-off
`invoke<T>` evaluation pays the doubled `mergedSchemaDeclsOf`/
`mergedEnumDeclsOf` cost inside that one call, independent of whether
`SchemaValidator`'s own cache is warm or cold. Checked the supplied
already-filed/rejected lists and `quality/resolved/`/`quality/issues/` for
"mergedSchemaDeclsOf", "mergedEnumDeclsOf", "schemaDeclsOf", "enumDeclsOf":
no existing filing names this pair or this within-call duplication. Not a
spec question: `decodeInboundValue`'s `schemaNames`/`enumNames` sets are
byte-identical whether derived once or twice, so no `docs/spec_topics/`
clause is challenged. Not dead code: both call sites are reached on every
successful typed `invoke<T>` return and every typed `@`-query respectively
(D2 territory would require one to be unreachable). No exemptions.json entry
matches this host or class.

## Triage
<!-- triage appends: verdict + one-line reason. Nothing above this line is edited. -->
verdict: questionable — accounting independently verified (all six excerpts reproduce verbatim; `mergedSite`/`deps.theta` provably unchanged between each pair's two calls; `#driveSubagentFnEntry`/`#resolveSubagentFnReturnSite`/`#resolveReturnSite` confirmed single-call; not a duplicate of the sibling compile-recompute finding or any PTQ; no exemption match): matches the repo's already-ratified heavier-than-scale shape (PTQ-0348/0349/0331) — consolidating to one computation is a human design call, never triage-confirmed (triage: claude-opus-5)
