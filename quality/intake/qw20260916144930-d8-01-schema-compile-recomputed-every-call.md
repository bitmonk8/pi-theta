---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: Three ProductionThetaProducer call sites recompile and re-hash a per-callee schema's full canonical form on every runtime call, though the schema is invariant across those calls
lens: D8                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/production-theta-producer.ts:4301-4304
  - src/extension/production-theta-producer.ts:4433-4450
  - src/extension/production-theta-producer.ts:415-429
  - src/extension/production-theta-producer.ts:5225-5254
  - src/extension/production-theta-producer.ts:3964-3965
  - src/extension/production-theta-producer.ts:4078
  - src/seams/schema-validator.ts:382-395
  - src/extension/production-composition.ts:4689-4717
  - src/parser/schema-lowering.ts:67-97
  - src/parser/schema-lowering.ts:103-116
sites: 3                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
d8_class: heavier-than-scale  # D8 only: overbuilt | reimplemented | against-grain | heavier-than-scale
d8_host: src/extension/production-theta-producer.ts#ProductionThetaProducer.#checkPiToolArgSchema # D8 only: the exemption key
wave: qw20260916144930
reported_by: lens-d8-simplification (unity-completions/gemini-3.7-flash)
date: 2026-09-16
---

# Three ProductionThetaProducer call sites recompile and re-hash a per-callee schema's full canonical form on every runtime call, though the schema is invariant across those calls

## Observation
`ProductionThetaProducer` calls `SchemaValidator.compile(schema)` at three
runtime sites that can each run repeatedly, without ever caching the
returned `CompiledValidator`, over a `schema` value that is provably
unchanged across those repeats: `#checkPiToolArgSchema` (a Pi tool's frozen,
load-time-pinned `parameters`), `#validateInvokeReturn` (an `invoke<T>`
callee's return-annotation lowering), and the respond-tool `validate`
closure `#buildRespondTurnContext` builds (a typed query's own lowered
response schema). `SchemaValidator.compile()`'s cache is keyed by a content
hash it must compute BEFORE the cache lookup, so every one of these calls
pays that hash's full cost regardless of whether the compiled validator was
already cached from an earlier, identical call.

## Evidence
**Site 1 — `#checkPiToolArgSchema`, called once per code-side Pi-tool call
evaluation, over a snapshot-pinned (load-time-frozen) schema:**

`src/extension/production-theta-producer.ts:4301-4304` (inside `#resolveToolCall`):
```ts
    const argSchemaViolation =
      argDepthBreach === undefined
        ? this.#checkPiToolArgSchema(toolName, tool?.parameters, params)
        : undefined;
```

`src/extension/production-theta-producer.ts:4433-4450`:
```ts
  #checkPiToolArgSchema(
    toolName: string,
    parameters: unknown,
    params: Record<string, unknown>,
  ): { readonly result: ResultValue; readonly error: CodeToolError } | undefined {
    if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) {
      return undefined;
    }
    const validator = this.#input.root.schemaValidator;
    if (typeof validator?.compile !== "function") {
      return undefined;
    }
    const verdict = validator.compile(parameters as LoweredSchema).validate(params);
    if (verdict.ok) {
      return undefined;
    }
    return buildCodeToolArgSchemaViolation(toolName, verdict.errors);
  }
```

`parameters` is the SAME object reference on every call for a given tool —
`#resolvePiToolForTheta` reads it straight off the frozen `callableSet`
snapshot `Map`, never rebuilding it — and `PiToolDispatch.parameters`'s own
doc states this explicitly:

`src/extension/production-theta-producer.ts:415-429`:
```ts
export interface PiToolDispatch {
  readonly toolName: string;
  /**
   * The tool's registered input-schema `parameters` (bug 0072 §Fix, runtime
   * half; frontmatter-fields-a.md §`tools`: "Each resolved entry carries the
   * tool's `parameters` schema"): the
   * snapshot-pinned schema `resolveThetaToolsAtLoad` threads onto the frozen
   * `tools:` callable-set entry at load, for BOTH a host built-in
   * (`resolvePiTool`, production-composition.ts) and an extension tool
   * (`resolveRegistryExtensionTool`, same file). Absent for a tool that
   * registers no input schema. `#resolveToolCall`'s pre-dispatch AJV check
   * reads this and fails open when it is absent or not a plausible
   * JSON-Schema object.
   */
  readonly parameters?: unknown;
```

**Site 2 — `#validateInvokeReturn`, called once per `invoke(...)` /
`.theta`-callable-call evaluation, re-lowering AND re-compiling the same
callee/annotation pair every time:**

`src/extension/production-theta-producer.ts:5225-5254`:
```ts
  #validateInvokeReturn(
    calleePath: string,
    returnSite: InvokeReturnSite | null,
    result: ResultValue,
    calleeResolvedPath: string | undefined,
    forwardedEnumTags?: readonly EnumTagEntry[],
  ): ResultValue {
    if (returnSite === null || !result.ok) {
      return result;
    }
    const { annotation: returnSchema, declarations, importedTypeDecls } = returnSite;
    const mergedSite = { body: declarations, importedTypeDecls };
    const depthBreach = enforceInvokeReturnDepth(calleePath, result.value as unknown);
    if (depthBreach !== undefined) {
      return depthBreach.result;
    }
    const lowered = lowerQueryResponseSchema(
      returnSchema,
      mergedSchemaDeclsOf(mergedSite),
      mergedEnumDeclsOf(mergedSite),
    );
    if (lowered === undefined) {
      return result;
    }
    const validator = this.#input.root.schemaValidator.compile(lowered);
```
`returnSchema`/`declarations`/`importedTypeDecls` come from the fixed call
expression's own annotation and the fixed callee's own declarations — neither
changes between two evaluations of the same `invoke<Schema>("./x.theta", …)`
call site (e.g. inside a `for`/`par for` loop body iterating a callee
unchanged across iterations).

**Site 3 — the respond-tool `validate` closure, invoked once per respond-tool
call ATTEMPT the model makes within a single typed query's native tool-use
turn (a validation failure is the query's own designed trigger for the model
to retry the SAME tool with corrected arguments):**

`src/extension/production-theta-producer.ts:3964-3965` (inside
`#buildRespondTurnContext`, closing over one query's own `lowered`):
```ts
      validate: (payload: unknown) => {
        const verdict = root.schemaValidator.compile(lowered).validate(payload);
```

`src/extension/production-theta-producer.ts:4078` (`#executeRespondTool`,
the tool's registered `execute` handler, called by the host's native tool
loop on every model tool-call attempt):
```ts
    const verdict = capture.validate(payload);
```

**The cost `.compile()` pays on every one of the above calls, cache hit or
not.** `AjvSchemaValidator.compile()` computes the content-hash cache key
BEFORE consulting the cache:

`src/seams/schema-validator.ts:382-395`:
```ts
  compile(schema: LoweredSchema): CompiledValidator {
    const { slug, canonicalBytes } = this.#deps.slugOf(schema);
    const cached = this.#cache.get(slug);
    if (cached !== undefined) {
      // Cache hit: verify byte-equality of the candidate document's canonical
      // form against the cached document's bytes before serving the cached
      // validator (PIC-11 byte-comparison, not a re-serialisation).
      if (cached.canonicalBytes === canonicalBytes) {
        return cached.validator;
      }
```

The production `slugOf` wiring (`productionSchemaSlugOf`) round-trips the
schema through `JSON.stringify`/`JSON.parse`, converts it with
`toLoweredJsonValue`, and then calls BOTH `schemaSlug` and `canonicalForm` on
the resulting value — two independent full canonicalisations of the same
value, since `schemaSlug` does not expose the canonical string it computes
internally for reuse:

`src/extension/production-composition.ts:4689-4717`:
```ts
export function productionSchemaSlugOf(schema: LoweredSchema): SchemaSlug {
  // ...
  const document: unknown = JSON.parse(JSON.stringify(schema));
  const value = toLoweredJsonValue(document);
  return { slug: schemaSlug(value), canonicalBytes: canonicalForm(value) };
}
```

`schemaSlug` itself calls `canonicalHash`, which calls `canonicalForm` a
SECOND time on the same value (the one `productionSchemaSlugOf` also calls
directly for `canonicalBytes`):

`src/parser/schema-lowering.ts:103-116`:
```ts
export function canonicalHash(value: LoweredJsonValue): string {
  return createHash("sha256")
    .update(canonicalForm(value), "utf8")
    .digest("hex");
}

export function schemaSlug(value: LoweredJsonValue): string {
  // `digest("hex")` is already lowercase; the slug is its first 16 hex chars.
  return canonicalHash(value).slice(0, 16);
}
```

`canonicalForm` itself is a full recursive tree walk that string-builds the
whole document and, at every object level, re-sorts that level's keys:

`src/parser/schema-lowering.ts:67-97`:
```ts
export function canonicalForm(value: LoweredJsonValue): string {
  switch (value.kind) {
    // ...
    case "array":
      return `[${value.items.map(canonicalForm).join(",")}]`;
    case "object": {
      const sorted = [...value.entries].sort((a, b) =>
        compareCodePoint(a.key, b.key),
      );
      const body = sorted
        .map((entry) => `${JSON.stringify(entry.key)}:${canonicalForm(entry.value)}`)
        .join(",");
      return `{${body}}`;
    }
  }
}
```

**Data-size / call-frequency citation.** `docs/spec_topics/control-flow.md`
CTRL-4 names both mechanisms this finding covers as legal inside a loop
body run once per iterand element: "The body is isolation-only: it may run
`invoke(...)`, `.theta` callable calls, `subagent fn` calls …, Pi-tool
calls, and pure computation." A plain `for` loop carries no iteration-count
cap at all; `par for` (CTRL-2) queues an unbounded iterand 64-at-a-time.
Repeated code-side calls to the same registered tool, or repeated `invoke`s
of the same callee, inside such a loop are therefore an ordinary,
spec-illustrated shape, not a contrived edge case — and site 3 repeats
without any loop at all, purely from the model retrying one failed
respond-tool call within a single query's own native tool-use turn.

## Why this is a problem
At each of the three sites, the value handed to `.compile()` is provably
identical across the repeated calls in question — a frozen snapshot
reference (site 1), the same call-site annotation and callee declarations
(site 2), or the same closure-captured value from one query (site 3) — yet
each call re-derives that value's cache identity from its full JSON content:
a stringify/parse round trip, a recursive `toLoweredJsonValue` conversion,
and two independent recursive `canonicalForm` walks (one inside `schemaSlug`,
one direct for `canonicalBytes`) each re-sorting every object level's keys,
followed by a SHA-256 hash. None of this content re-derivation is needed a
second time for an unchanged schema; only the AJV codegen `.compile()`'s
cache actually avoids repeating. The `CompiledValidator` each call produces
is discarded immediately after its single `.validate()` use rather than held
across the repeat calls the caller's own data flow already knows are coming
(the same tool, the same call site, the same query).

## Suggested direction (non-binding, optional)
One unproven hypothesis: since each site already holds (or can trivially
hold) an object stable across its repeats — `PiToolDispatch` per tool,
`InvokeReturnSite` per call site, or the respond context per query — a small
cache at that stable point (e.g. a `WeakMap` keyed on the schema object, or a
field alongside the existing per-query `RespondTurnContext`) could let a
repeat call skip straight to `.validate()` on an already-held
`CompiledValidator`, without touching `SchemaValidator`'s own cache-keying
contract.

## False-positive check
Re-read all ten cited excerpts immediately before filing; each reproduces
verbatim at its line range. Confirmed `#resolvePiToolForTheta`
(production-theta-producer.ts:4564-4577) returns `entry.toolDefinition`
read directly off the frozen `CallableSetSnapshot.entries` `Map`
(`Object.freeze`d per `callable-set.ts:133-135`/`:327-332`), so `tool.parameters`
is the same object reference on every call for one tool — not merely
content-equal. Confirmed `#validateInvokeReturn`'s `lowered` is freshly built
by `lowerQueryResponseSchema` on every call (no memoisation), so its
repeat-call waste is compounded, not merely the compile step. Confirmed
`#buildRespondTurnContext`'s `validate` closure is the resolved value of
`RespondTurnContext.validate` invoked at `#executeRespondTool:4078`, which is
the registered respond tool's `execute` handler — reached once per
model-issued tool-call attempt against that tool while the query is live.
Traced `AjvSchemaValidator.compile` (schema-validator.ts:382-395): `slugOf`
runs unconditionally before the `#cache.get` lookup, so a cache HIT does not
skip the content-hash cost. Traced the wired `slugOf`
(`productionSchemaSlugOf`, production-composition.ts:4689-4717) and confirmed
it calls `schemaSlug(value)` and `canonicalForm(value)` as two separate
statements on the same `value`, and that `schemaSlug` (schema-lowering.ts:113-116)
itself routes through `canonicalHash` (:103-107), which calls `canonicalForm`
again — two full canonicalisations per `slugOf` call, confirmed by reading
`canonicalForm`'s own recursive definition (:67-97). Searched the
already-filed/rejected lists and `quality/resolved/` for "checkPiToolArgSchema",
"validateInvokeReturn", "buildRespondTurnContext", "schemaSlug", "canonicalForm",
"productionSchemaSlugOf", "AjvSchemaValidator": no existing filing makes this
claim; PTQ-0081 and PTQ-0120 are same-call, single-invocation redundant
`.find()`/parse pairs in unrelated modules (import-static-checks.ts,
frontmatter.ts), not this cross-call schema-recompile pattern. Checked
`docs/bugs/0072-tool-arg-checks-dead-and-no-runtime-net.md` (the bug that
introduced `#checkPiToolArgSchema`): its residuals list unwitnessed defensive
branches and an unrelated uncached callee-arity read, not this compile cost.
Not a spec question: the AJV verdict is identical whether or not the
validator is cached, so no `docs/spec_topics/` clause is challenged. This
finding straddles `src/extension/production-composition.ts` and
`src/seams/schema-validator.ts`, both outside this review's briefed shard;
their cited lines are read and verified, not guessed, and are cited only as
the cost-chain evidence for an accounting whose `d8_host` is the in-shard
`#checkPiToolArgSchema`.

## Triage
<!-- triage appends: verdict + one-line reason. Nothing above this line is edited. -->
verdict: questionable — accounting independently verified (all 10 excerpts reproduce verbatim at cited lines; `compile()` computes `slugOf` before `#cache.get`, and `productionSchemaSlugOf` double-walks `canonicalForm` via `schemaSlug`+direct call; site 1's object-reference stability confirmed against the frozen `CallableSetSnapshot`; no exemptions.json match, no spec conflict, not a duplicate of PTQ-0081/PTQ-0120 or its intake siblings); D8 caps an accurate heavier-than-scale accounting at questionable — the call-site memoization is a design decision for human ruling (triage: claude-opus-5)
verdict: questionable — independently re-verified from scratch, treating the above as unproven: all 10 citations content-match verbatim despite line drift (production-theta-producer.ts +50 lines, production-composition.ts -25 lines with its cited end-line exceeding the file's current length, both explained by unrelated churn, not fabrication; schema-validator.ts/schema-lowering.ts exact); confirmed compile() hashes via slugOf before #cache.get, productionSchemaSlugOf double-invokes canonicalForm (direct call plus schemaSlug→canonicalHash), and site 1's tool.parameters stability against CallableSetSnapshot's own freeze doc comment; call-frequency claims hold against CTRL-1/2/4 and QRY-14/16; confirmed not a duplicate of PTQ-0081/PTQ-0120 (both single-call redundancies in unrelated files) or sibling intake qw20260917045205 (that finding's own false-positive check correctly distinguishes its within-call mergedSchemaDeclsOf/mergedEnumDeclsOf duplication from this cross-call compile-cache claim); no exemptions.json match. D8 caps an accurate heavier-than-scale accounting at questionable, never confirmed (triage: claude-opus-5)
