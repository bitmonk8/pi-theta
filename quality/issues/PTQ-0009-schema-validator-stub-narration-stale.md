---
id: PTQ-0009
title: schema-validator.ts still carries the V8c-T section narration describing an inert stub after the V8c AJV implementation replaced it
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/seams/schema-validator.ts:41-49
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# schema-validator.ts still carries the V8c-T section narration describing an inert stub after the V8c AJV implementation replaced it

## Observation
The module was delivered in the repository's tests-task/implementation pair
(V8c-T landed a stub `AjvSchemaValidator` whose `compile` returned a fixed
"not implemented" sentinel error; the paired V8c commit replaced that body with
the AJV-backed implementation). The section-header comment introducing the
implementation half of the file still narrates the stub phase in present tense:
it says the file "declares the production class shape and an inert stub so the
failing tests compile and red". No stub exists in the file today —
`AjvSchemaValidator` (src/seams/schema-validator.ts:356-464) is the full
production implementation, and its own class doc comment already documents the
current AJV behaviour the narration attributes to a future leaf.

## Evidence
src/seams/schema-validator.ts:41-49 — the retained stub-phase narration:

```ts
// --------------------------------------------------------------------------
// V8c / V8c-T — the production `SchemaValidator` implementation (PIC-11).
//
// V8c-T (tests-task) declares the production class shape and an inert stub so
// the failing tests compile and red on their own primary assertions; the paired
// V8c leaf fills the AJV-backed behaviour in (one-pass multi-error, no
// coercion / no default-fill, in-document `$ref`, silent unknown `format`,
// deterministic, per-runtime, slug-cache byte-verify).
// --------------------------------------------------------------------------
```

src/seams/schema-validator.ts:382-388 — the current constructor beneath that
header builds two real AJV instances; there is no inert stub:

```ts
  constructor(deps: AjvSchemaValidatorDeps) {
    this.#deps = deps;
    this.#ajv = new Ajv({ strict: false, allErrors: true, logger: false });
    addFormats(this.#ajv);
    this.#hardenedAjv = new Ajv({ strict: false, allErrors: true, logger: false, ownProperties: true });
    addFormats(this.#hardenedAjv);
  }
```

Git history — the stub the narration describes existed at commit a2993196
("V8c-T — SchemaValidator seam (tests)") and was replaced at commit 07bb79b6
("V8c — SchemaValidator seam (AJV one-pass multi-error, ...)"). The stub body
at a2993196 (`git show a2993196:src/seams/schema-validator.ts`):

```ts
  compile(_schema: LoweredSchema): CompiledValidator {
    void this.#deps;
    return {
      validate(_value: unknown) {
        return {
          ok: false as const,
          errors: [
            {
              instancePath: "",
              schemaPath: "",
              keyword: "loom-test-stub",
              message: "SchemaValidator not implemented (V8c-T stub)",
```

## Why this is a problem
Historical narration comment: the block describes the file's contents as they
stood at the tests-task commit ("declares ... an inert stub so the failing
tests compile and red"), which contradicts the current code — the same file
contains the complete AJV implementation the comment says a "paired V8c leaf"
will fill in. The delivery sequence it records lives in git history (a2993196 →
07bb79b6); keeping it in the source misdescribes what a reader of the current
file will find, and the behavioural summary it carries duplicates the live
class doc comment on `AjvSchemaValidator` (src/seams/schema-validator.ts:349-371),
which documents the same AJV flags and cache posture in present tense.

## Suggested direction (non-binding, optional)
Reduce the section header to the part that is true today (this section is the
production `SchemaValidator` implementation, PIC-11), leaving the delivery
narrative to git history; the class doc comment already owns the behavioural
description.

## False-positive check
- Current-code check: read src/seams/schema-validator.ts in full; no stub body
  exists — `AjvSchemaValidator` (:356-464) implements `compile`, `invalidate`,
  and `#build` against real AJV instances.
- Git history intent check: `git log --follow src/seams/schema-validator.ts`
  shows a2993196 (V8c-T, stub) then 07bb79b6 (V8c, AJV implementation);
  `git show a2993196:src/seams/schema-validator.ts` contains the inert stub
  ("SchemaValidator not implemented (V8c-T stub)") the narration describes, and
  the current file does not.
- Duplicate check against already-filed candidates: the three stale-narration
  findings in this wave cover other files only —
  qw20260907130901-d2-01-stale-tests-task-stub-narration.md (src/binder/* and
  src/diagnostics/diagnostic.ts), qw20260907130901-d2-08-... (src/extension/
  inventory-closure-audit.ts, load-pre-eval.ts), qw20260907130901-d2-09-...
  (src/discovery/*, src/diagnostics/placeholder.ts, src/extension/
  drain-state.ts). None cites src/seams/schema-validator.ts.
  qwprobe-d2-01-schema-validator-invalidate-uncalled.md concerns `invalidate`
  reachability, a different root cause, and does not cite this block.
- Accuracy check of neighbouring comments (not filed): the `#build` doc
  comment's claims were verified true today (`schemaPath` appears in src/ only
  in this file — grep "schemaPath" over src/ returned 4 hits, all
  src/seams/schema-validator.ts; `orderValidationIssues` is at
  src/runtime/query-error.ts:197 and keys on path/schema_keyword/message), so
  only the lines 41-49 block is cited.

## Triage
verdict: confirmed — block at :41-49 matches verbatim and git shows it was written at a2993196 alongside the stub then left byte-identical when 07bb79b6 replaced that stub with the live AJV implementation in the same file, so it narrates a state that no longer exists; production src/, one root cause, no other candidate cites this block (triage: claude-opus-5)
