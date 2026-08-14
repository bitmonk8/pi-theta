# Bug 0066 — `#mergeDeclaredDefaults` returns only `result.args`, discarding the post-default-merge AJV verdict: the binder's AJV-on-`args` failure class is never constructed, hard-ceiling #4's slash-load `params` enforcement point runs no depth walk, and a declared default that violates its own param type binds into body scope behind the `Running /<name>:` success echo

- **Status:** fixed (0.88.0).
- **Kind:** defect — one discarded verdict at one call site leaves two specified
  obligations unmet, in two symptom families: the binder's AJV-on-`args` failure
  class (element 1) and hard-ceiling #4's slash-load `params` enforcement point
  (elements 2 and 3).
  1. *The AJV-on-`args` failure class is unreachable from the binder.*
     `docs/spec_topics/binder/defaulting-system-note-echo.md:11` installs the
     **post-default-merge AJV validation** as a named hook and routes its failure
     into the AJV-on-`args` retry class;
     `docs/spec_topics/binder/determinism-cancellation-failure.md:35` defines that
     class ("A `kind: "ok"` envelope whose `args` fail AJV against the lowered
     `params` schema after default-merge … Not retried") and `:52` gives its
     user-facing row (`theta /<name>: argument binding produced invalid args —
     <ajv-summary>`). At HEAD the verdict is computed and dropped
     (`src/extension/production-theta-producer.ts:1174–1175`); no production
     caller constructs the class; the row is unreachable from the binder. A
     declared default whose value violates the field's declared type binds into
     body scope and the success echo asserts the bind worked.
  2. *Hard-ceiling #4's slash-load `params` enforcement point does not exist in
     production.* `docs/spec_topics/schema-subset.md:44` names `params` validation
     as enforcement point #4, `:47` pins "The walk runs **before** AJV at each
     site", and `:56` routes the slash-load arm through the AJV-on-`args`
     classification. `rg -n "depthWalk\(" src/binder/` returns nothing;
     `fillDefaultsAndRevalidate` (`src/binder/defaulting.ts:67–89`) goes straight
     to `input.validator.validate(merged)` at `:86`. JSON Schema 2020-12 has no
     `maxDepth` keyword — the runtime records this at
     `src/extension/production-theta-producer.ts:4822` — so AJV cannot substitute.
     A depth-6 merged `args` document validates clean and binds.
  3. *The seam written for the CIO-1 cross-route is unreachable, and emits a
     forbidden wire shape when driven.* `classifyBinderArgs`
     (`src/binder/retry-taxonomy.ts:184–201`) implements exactly the CIO-3
     depth-before-AJV ordering and the CIO-1 cross-route; it has no caller in
     `src/`. `createLoadFailurePreEvalRouter(...).crossRouteSlashLoadParams`
     (`src/extension/load-pre-eval.ts:138–182`) is the only code in `src/` that
     runs a depth walk at slash-load; production constructs the router
     (`src/extension/production-composition.ts:1096`) and wires only
     `routePreEvalFailure` (`:1102`). When driven, that helper hardcodes
     `satisfied: ["ceiling#3", "ceiling#4"]` (`:152–155`) regardless of the walk's
     verdict and emits `details.event.masked: ["ceiling#4"]` (`:172–174`), which
     PIC-1 (c) forbids at that site
     (`docs/spec_topics/pi-integration-contract/runtime-event-channel.md:110`).

  The load-time companion gate is also absent —
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md:60` states "The default
  literal's static type must be compatible with the param's declared type", and
  `parseParams` (`src/parser/params.ts:118–247`) checks only that the default RHS
  is a literal (`checkLiteralSublanguage`, `:214–226`), never its type. A
  type-incompatible default loads with zero diagnostics and reaches the discarded
  runtime check.
- **Related:**
  [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) — open.
  Pattern sibling: an enforcement layer that exists in-tree, is pinned green by
  unit tests, and has no production caller (`checkFnArgCompat`,
  `src/parser/type-compat.ts:452`, no caller in `src/`). `classifyBinderArgs` and
  `crossRouteSlashLoadParams` are the binder- and ceiling-side twins.
  [0036](./0036-missing-object-key-bare-key-rendering.md) — fixed (0.41.0). A
  conformant renderer in-tree, unit-pinned, with no production caller; the shape
  of element 3.
  [0028](./0028-unresolved-annotation-silent-permissive-lowering.md) — fixed
  (0.38.0). One boundary over: a gate whose obligation is met only vacuously while
  delivering exactly what it exists to prevent. Its framing — "the runtime AJV
  check is the safety net" posture voided — applies here.
  [0013](./0013-load-warnings-dropped-by-both-production-sinks.md) — fixed
  (0.24.0). Precedent for a diagnostic that is constructed and dropped by the
  production sink.
  [0060](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md) —
  open. Also concerns a recorded `params:` default source reaching a binder surface
  unchecked; disjoint mechanism (render vs. validate).
- **Affected** (citations verified against the worktree at `d06daae3`):
  - `src/extension/production-theta-producer.ts:1174–1175` — the drop.
    `fillDefaultsAndRevalidate` returns `{ args, defaultedWireNames, validation }`;
    the caller binds `result` and returns `result.args`. `result.validation` has no
    reader. The comment at `:1167–1172` records the intent ("Its verdict routes, on
    failure, to the AJV-on-`args` retry class owned elsewhere in the runtime; this
    leaf owns only the fill-if-absent merge and invoking the named validation
    hook") — the "elsewhere" does not exist.
  - `src/extension/production-theta-producer.ts:1160–1162` — the merge returns
    before compiling a validator when `params.defaultedFields.length === 0` or the
    lowered schema is absent; `:1164–1166` — the same when default recovery yields
    nothing. On those paths the named hook is not invoked at all.
  - `src/extension/production-theta-producer.ts:839–846` — `runBinder`'s
    consumption: `const mergedArgs = await this.#mergeDeclaredDefaults(…)` (`:840`)
    then `#emitBinderEchoNote` (`:845`) and `return { bound: true, args: mergedArgs
    }` (`:846`). There is no arm between the merge and the body start.
  - `src/binder/defaulting.ts:67–89` — `fillDefaultsAndRevalidate`; the validate
    call at `:86`, the verdict returned on `FillDefaultsResult.validation` at
    `:88`. No depth walk precedes the AJV call.
  - `src/binder/retry-taxonomy.ts:184–201` — `classifyBinderArgs`, the CIO-1/CIO-3
    classifier: depth-walk first (`:191–196`), then AJV (`:197–199`), producing
    `{ kind: "ajv_args", ajvSummary }`. No caller in `src/`
    (`rg -n classifyBinderArgs src/` matches only its own module at `:27`, `:168`,
    `:184`).
  - `src/binder/retry-taxonomy.ts:256–283` — `runBinderWithRetries`, the spec's
    named budget driver, also has no production caller
    (`runBinderCallWithCancellation` re-drives the budget itself,
    `src/binder/binder-cancellation.ts:100–140`); listed because it is the module's
    other unreferenced export.
  - `src/extension/production-theta-producer.ts:929–1019`
    (`#classifyBinderAttempt`) — the reachable outcome set is `ok` (`:970`),
    `needs_info` / `ambiguous`, `malformed` (`:964`, `:979`, `:986`, `:1013`), and
    `transport` (`:949`, `:951`). `ajv_args` is a member of `BinderAttemptOutcome`
    (`src/binder/retry-taxonomy.ts:216`) that this function never returns, so
    `runBinder`'s `if (outcome.kind !== "ok")` arm (`:824`) can never render the
    AJV-on-`args` row.
  - `src/extension/load-pre-eval.ts:110` (interface), `:138` (implementation),
    `:144` (`depthWalk`), `:152–155` (constant `satisfied` set), `:172–174` (the
    conditional `masked` spread inside `details.event`, `:168–176`);
    `src/extension/production-composition.ts:146`, `:1096`, `:1102` — the router is
    constructed and only `routePreEvalFailure` is wired.
  - `src/runtime/ceiling-arbitration.ts:122–130` — `arbitrate`. Correct in itself
    (it filters the surfaced ceiling out and omits `masked` when the remainder is
    empty); its only production caller is `load-pre-eval.ts:152`, i.e. the
    unreachable path, so the arbitration seam has no reachable production consumer.
  - `src/extension/production-theta-producer.ts:4822` — the runtime's own record
    that the presented schema carries no depth bound.
  - `src/parser/params.ts:214–226` — the load-time default check:
    `checkLiteralSublanguage(field.defaultSource, "default", …)` (`:221`) only.
    `src/parser/params.ts` imports nothing from `src/parser/type-compat.ts`
    (`rg -n type-compat src/parser/params.ts` returns nothing), so
    `frontmatter-fields-a.md:60`'s compatibility MUST has no emitter.
  - `src/parser/params.ts:174–176` — defaulted fields are omitted from the lowered
    `required` array, so the envelope's relaxed copy (`relaxParamsSchema`,
    `src/binder/binder-envelope.ts:137–157`) removes nothing and the envelope AJV
    at extraction time (`src/extension/production-theta-producer.ts:962–965`)
    cannot see the absent field either. The post-merge hook is the only place the
    filled value is ever checked.
- **Observed at:** `0.52.0`, HEAD `d06daae3`. Element 1 live, binder model
  `anthropic/claude-haiku-4-5`, api `anthropic-messages`; the drop itself is
  deterministic, but the binder pass that produces the `ok` envelope with the
  field omitted needs a model. Elements 2 and 3 offline, via scratch vitest
  driving the production `AjvSchemaValidator` + `fillDefaultsAndRevalidate` and
  the production `createLoadFailurePreEvalRouter`.

## Summary

`#mergeDeclaredDefaults` (`src/extension/production-theta-producer.ts:1155–1176`)
compiles the lowered `params` schema, calls `fillDefaultsAndRevalidate`, and
returns `result.args`. `result.validation` is never read. That one line is the
whole root cause, and it is the sole home of two specified obligations.

The first obligation is the AJV-on-`args` failure class. A theta declares
`count: integer = "xyzzy"`. It loads with zero diagnostics. The binder is told the
field has a default and is instructed to omit it, which it does. The runtime fills
`"xyzzy"`, calls the post-default-merge validator, receives `ok: false`, discards
the verdict, emits the `bind_echo` **success** note, and runs the body with a
string bound to an `integer`-declared parameter. The spec's disposition for that
input is one note (`theta /<name>: argument binding produced invalid args —
<ajv-summary>`), no retry, and the theta does not run.

The second is hard-ceiling #4. CIO-3 enumerates five AJV boundaries at which the
depth walk runs first: typed-query response, model-driven `tool_use` args,
code-driven `<name>(args)` args, `params` validation, and `invoke<T>` return
value. Four are implemented and reachable. The fifth — `params` validation, whose
slash-load arm the per-boundary table routes through ceiling #3's AJV-on-`args`
classification — has no production enforcement: no depth walk exists on the binder
path, and the one helper that implements the cross-route
(`crossRouteSlashLoadParams`) is called by nothing. A depth-6 `params` document
binds and the body runs on it.

That helper is additionally non-conformant when driven: it declares ceiling #4
co-fired on every call, breach or not, and emits a populated `masked` field that
PIC-1 (c) pins empty at that site.

## Reproduction

### (A) A declared default violating its own param type binds into body scope

Live, at HEAD `d06daae3`, through `tests/live/harness.ts` +
`driveSlashCaptureTurn`.

```
---
description: "binder default revalidation probe b"
mode: prompt
bind_model: anthropic/claude-haiku-4-5
bind_echo: true
params:
  topic_b: string
  count_b: integer = "xyzzy"
---
@`SENTINEL39 topic=${topic_b} count=${count_b}. Reply with exactly: done.`
```

Load: registered, zero diagnostics on the `theta-system-note` channel other than
the unrelated `theta/load/binder-model-strict-capability-unknown` warning
(`docs/reference/diagnostics.md:199`).

Drive `/bhaiku hello`:

```
[bhaiku] SYSTEM NOTES: ["Running /bhaiku: topic_b=hello, count_b=xyzzy (default)"]
[bhaiku] USER TEXTS: ["SENTINEL39 topic=hello count=xyzzy. Reply with exactly: done."]
[bhaiku] ASSISTANT: "done."
```

Three deterministic observables, all wrong:

- The note channel carries the **success** echo, with the `(default)` tag
  correctly applied. The AJV-on-`args` row is absent.
- `userTexts` proves the body ran and that `count_b` — declared `integer` — bound
  the string `"xyzzy"`; the rendered template is computed by theta code from the
  bound value.
- The assistant replied, i.e. a real turn was spent on a theta the spec says must
  not have started.

The binder envelope that produced this is the shape the raw-call probe recorded
for the same params shape: `{"envelope":{"kind":"ok","args":{"topic":"hello"}}}` —
`count` omitted, as the system prompt's last line instructs
(`src/binder/binder-system-prompt.ts:235`: "Do not invent values for defaulted
parameters that the user did not specify; omit them.").

The merged args are `{topic_b: "hello", count_b: "xyzzy"}`; the lowered `params`
schema is
`{"type":"object","properties":{"topic_b":{"type":"string"},"count_b":{"type":"integer"}},"required":["topic_b"],"additionalProperties":false}`
(`src/parser/params.ts:236–241`, with `topic_b` alone in `required` per `:174–176`).
`fillDefaultsAndRevalidate` runs `validator.validate(merged)` on exactly this pair
(`src/binder/defaulting.ts:86`) and gets `ok: false`.

Controls:

- Same theta with `count_b: integer = 3` — the merged args validate, the same
  success echo is emitted, the body runs. Observationally identical to the failing
  case at every channel except the interpolated value. That identity **is** the
  defect: the verdict has no consumer, so a passing and a failing validation are
  indistinguishable.
- `rg -n 'kind: "ajv_args"' src/` at HEAD returns six hits:
  `src/binder/retry-taxonomy.ts:72`, `:166`, `:216` (type members) and `:193`,
  `:198` (inside the callerless `classifyBinderArgs`), plus
  `src/extension/load-pre-eval.ts:160`. The only construction site outside the
  dead classifier is the `crossRouteSlashLoadParams` arm, which is itself
  callerless. No reachable production code constructs the class.

### (B) A depth-6 merged `args` document passes the post-default-merge hook

Offline, scratch vitest at `d06daae3` (run and deleted). Production
`AjvSchemaValidator` compiling a lowered `params`-shaped schema, fed to the
production `fillDefaultsAndRevalidate`:

```ts
const compiled = new AjvSchemaValidator({ emit: () => {}, slugOf }).compile({
  type: "object",
  properties: { p: { type: "object" } },
  required: ["p"],
  additionalProperties: false,
});
const depth6 = { p: { a: { b: { c: { d: { e: 1 } } } } } };   // 6 levels
fillDefaultsAndRevalidate({ binderArgs: depth6, defaults: [], validator: compiled });
```

Observed:

```
{ "args": { "p": { "a": { "b": { "c": { "d": { "e": 1 } } } } } },
  "defaultedWireNames": [],
  "validation": { "ok": true } }
```

No `maxDepth` issue, no `"JSON document depth exceeds 5"`.

### (C) The cross-route helper emits `masked` with no co-fire

Production `createLoadFailurePreEvalRouter`, driven with a depth-**2** value (no
breach):

```ts
router.crossRouteSlashLoadParams("demo", { a: 1 });
```

Observed return and delivered note:

```
arbitration: { "surfaced": "ceiling#3", "masked": ["ceiling#4"] }

pi.sendMessage:
  { customType: "theta-system-note",
    content: "theta /demo: argument binding produced invalid args — ",
    display: true,
    details: { event: { kind: "ceiling",
                        surfaced: "ceiling#3",
                        masked: ["ceiling#4"] } } }
```

`masked` is present although no sibling ceiling fired: the depth walk returned
`ok`, which is why `<ajv-summary>` interpolates empty and `renderFailureNote`
(`src/binder/system-note.ts:131–135`, template `theta /<name>: <fixedPhrase> —
<suffix>`) leaves the note ending in a bare em-dash.

### (D) Static reachability, same HEAD

```
$ rg -n "crossRouteSlashLoadParams" src/
src/extension/load-pre-eval.ts:110
src/extension/load-pre-eval.ts:138
$ rg -n "classifyBinderArgs" src/
src/binder/retry-taxonomy.ts:27
src/binder/retry-taxonomy.ts:168
src/binder/retry-taxonomy.ts:184
$ rg -n "depthWalk\(" src/binder/
(no matches)
$ rg -n "arbitrate" src/ --glob '!ceiling-arbitration.ts'
src/extension/load-pre-eval.ts:45
src/extension/load-pre-eval.ts:152
```

The five `depthWalk(` call sites in `src/` are
`src/runtime/invoke-ceiling-depth.ts:126`, `src/runtime/query-tool-loop.ts:647`,
`src/runtime/tool-call.ts:605`, `src/runtime/tool-call.ts:691`, and
`src/extension/load-pre-eval.ts:144` — the last being the unreachable one.

## Expected behaviour

### The binder / QRY chain

`docs/spec_topics/binder/defaulting-system-note-echo.md:11`:

> The **post-default-merge AJV validation** is the named hook this section
> installs: the `SchemaValidator.validate()` call that AJV-validates the merged
> `args` object against the lowered `params` schema after the runtime has filled
> the defaults above. Per Schema Subset — Depth Enforcement the depth-walk runs
> *first* at this site (it is enforcement point #4 in that section's per-boundary
> table), so a depth-6 merged `args` payload short-circuits the AJV step and
> produces a depth-walk failure that is classified into the AJV-on-`args` retry
> class per Failure-class taxonomy below.

`docs/spec_topics/binder/determinism-cancellation-failure.md:35`:

> *AJV-on-`args` class.* A `kind: "ok"` envelope whose `args` fail AJV against the
> lowered `params` schema after default-merge (per Defaulting). Not retried
> (ceiling HC3-c) …

`:52`, the row:

| AJV validation of the binder's `args` failed (no retry) | `theta /<name>: argument binding produced invalid args — <ajv-summary>` |

and the surrounding table's contract that a failure arm short-circuits the theta.
`:42` pins the `<ajv-summary>` placeholder (the in-order `<path> <message>` join
in canonical `validation_errors` order) and its depth-walk fast-fail clause
(single-issue form, no `; ` separator). `:58` states that AJV validation of `args`
is unaffected by the retry cap and carries no budget of its own.

For reproduction (A) the expected note is

```
theta /bhaiku: argument binding produced invalid args — /count_b must be integer
```

(the summary rendered per `renderAjvSummary`, `src/binder/retry-taxonomy.ts:138–142`),
no user turn, and no `Running /bhaiku:` echo.

Load-time, `docs/spec_topics/frontmatter/frontmatter-fields-a.md:60` says the
default should not have reached the runtime at all: "The default literal's static
type must be compatible with the param's declared type per Type System — Type
compatibility (e.g. an `integer` literal is admissible for a `number` param; the
reverse is `theta/parse/integer-narrowing`)".

### The hard-ceilings chain

`docs/spec_topics/hard-ceilings/ceilings-3-and-4.md:41` (CIO-3):

> Ceiling #4 (JSON-document depth) is the first sub-check at every AJV validation
> boundary (typed-query response, model-driven `tool_use` args, code-driven
> `<name>(args)` args, `params` validation, `invoke<T>` return value — five sites
> …); the depth-walk runs *before* AJV at the same site … so #4 always precedes
> the boundary's other validation.

Same page, `:26`, the ceiling-#4 per-boundary table's `params` validation row:

> Slash-load: routes through ceiling #3's no-retry classification (the binder's
> AJV-on-`args` arm at the [post-default-merge AJV validation] hook) and renders
> through the AJV-on-`args` row of … Failure-mode templates; the row's
> `<ajv-summary>` placeholder carries the depth-walk's canonical issue
> (`<JSON-Pointer> JSON document depth exceeds 5`) per that table's depth-walk
> clause.

`:19` pins the breach shape: "Every breach surfaces with `schema_keyword:
"maxDepth"` and the canonical message `"JSON document depth exceeds 5"`" (also
`docs/spec_topics/schema-subset.md:49`). `:11` (HC3-c) makes AJV-on-`args`
failures terminal — no retry — which is the disposition the merged-args verdict is
supposed to reach. `:39` (CIO-1) pins the slash-load `params` arm of ceiling #4 as
routed by ceiling #3's failure-mode templates. `:52`, the audience-coverage
invariant, requires each ceiling to have an observable failure surface; the
slash-load `params` arm's surface is the load-time system note, which never
renders.

`docs/spec_topics/schema-subset.md:65` pins the walk as installed uniformly: "The
walk is still installed at the `params` boundary unchanged — a uniform
implementation across all five sites means future widening of `params` types
inherits the cap automatically."

`docs/spec_topics/pi-integration-contract/runtime-event-channel.md:110`, PIC-1
(c)'s per-site reachable mask domain, row *Slash-load `params` AJV (ceiling #3,
load-time)*: reachable mask domain **empty** —

> ceiling #3's load-time surfaces always omit `masked` by construction. The
> slash-load `params` cross-ceiling sub-case — where ceiling #4's depth-walk *did*
> fire at the post-default-merge AJV validation hook before being routed to
> ceiling #3's AJV-on-`args` arm per CIO-1 … — **still omits `masked`**: the
> originating ceiling is recoverable from the rendered note's `<ajv-summary>`
> placeholder.

`:100`, PIC-1 (b): "implementations MUST NOT emit `masked: []`" — and, by (c),
MUST NOT emit a populated `masked` at a site whose reachable domain is empty.

## Actual behaviour / root cause

`#mergeDeclaredDefaults` (`src/extension/production-theta-producer.ts:1155–1176`):

```ts
if (params.defaultedFields.length === 0 || params.loweredSchema === undefined) {
  return binderArgs;                       // 1160–1162: hook does not run at all
}
const defaults = await this.#recoverDeclaredDefaults(theta, params.defaultedFields);
if (defaults.length === 0) {
  return binderArgs;                       // 1164–1166: hook does not run at all
}
const validator = this.#input.root.schemaValidator.compile(params.loweredSchema);
const result = fillDefaultsAndRevalidate({ binderArgs, defaults, validator });
return result.args;                        // 1175: result.validation dropped
```

The leaf does its job — `src/binder/defaulting.ts:86` runs the validator on the
merged object and returns the verdict on `FillDefaultsResult.validation` (`:88`).
The production caller destructures nothing but `args`. The comment above the call
(`:1167–1172`) records the drop as deliberate scope, deferring the routing to a
class "owned elsewhere in the runtime"; no other leaf performs that routing.
Nothing in `src/` reads a post-merge verdict, no `ajv_args` outcome is constructed
on the binder path, and no depth walk runs there.

`runBinder` then proceeds unconditionally
(`src/extension/production-theta-producer.ts:839–846`):

```ts
const binderArgs = okArgs;
const mergedArgs = await this.#mergeDeclaredDefaults(binderInput.theta, params, binderArgs);
this.#emitBinderEchoNote(binderInput.theta, params, binderArgs, mergedArgs);
return { bound: true, args: mergedArgs };
```

The five CIO-3 sites at HEAD:

| CIO-3 site | Depth walk | Reachable in production |
|---|---|---|
| Typed-query response | `query-tool-loop.ts:647` | yes |
| Model-driven `tool_use` args | `tool-call.ts:605` | yes |
| Code-driven `<name>(args)` args | `tool-call.ts:691` | yes |
| `params` — `invoke(...)` arm | `invoke-ceiling-depth.ts:126` via `enforceInvokeParamsDepth` (`:83`) → `production-theta-producer.ts:3131` | yes |
| `invoke<T>` return value | `invoke-ceiling-depth.ts:126` via `enforceInvokeReturnDepth` (`:99`) → `production-theta-producer.ts:3304` | yes |
| **`params` — slash-load arm** | `load-pre-eval.ts:144` | **no caller** |

The value class this exposes is exactly the one the pre-merge envelope check
cannot cover. A defaulted field is *absent* from the binder-returned `args` by
design (`defaulting-system-note-echo.md:9`, fill-if-absent), and defaulted fields
are already omitted from the lowered `required` (`src/parser/params.ts:174–176`),
so the extraction-time envelope AJV
(`src/extension/production-theta-producer.ts:962–965`) validates against a schema
in which the field is optional and never sees it. The runtime then materialises
the declared default from source and merges it in. Whether that value satisfies
the field's declared type is decided only by the discarded verdict.

Two further consequences of the same site:

- The hook is skipped entirely when the theta declares no defaults (`:1160–1162`)
  or when default recovery finds nothing (`:1164–1166`). Recovery reads the
  `.theta` off disk (`#recoverDeclaredDefaults`, `:1188–1231`) and yields `[]` for
  an in-memory theta, an unreadable file, or a default that does not re-parse. The
  invoked-but-ignored validation is therefore conditional on a filesystem read
  succeeding.
- The input class reaches the site because `parseParams` never type-checks a
  default. `src/parser/params.ts:214–226` runs `checkLiteralSublanguage` and
  nothing else. `src/parser/type-compat.ts` exposes `checkCompatible` (`:139`) and
  four site-specific wrappers — `checkLetRhsCompat` (`:403`), `checkFnArgCompat`
  (`:452`), `checkObjectFieldCompat` (`:500`), `checkCommonType` (`:555`) — and
  `params.ts` imports none of them. There is no `params:`-default wrapper at all,
  so `frontmatter-fields-a.md:60`'s MUST has no emitter.

Element 3 is a separate divergence in the same neighbourhood.
`crossRouteSlashLoadParams` computes the walk (`load-pre-eval.ts:144`), renders the
`ajv_args` template from it (`:159–162`), and then arbitrates with a *constant*
co-fire set:

```ts
// src/extension/load-pre-eval.ts:152–155
const arbitration = arbitrate({
  site: "slash-load-binder",
  satisfied: ["ceiling#3", "ceiling#4"],
});
```

`arbitrate` (`src/runtime/ceiling-arbitration.ts:122–130`) filters the surfaced
ceiling out and returns the remainder, so this yields `masked: ["ceiling#4"]` on
every call, breach or not, and `:172–174` copies it onto `details.event`. PIC-1 (c)
pins this site's reachable mask domain as empty. Because the function has no
production caller the wrong bytes never reach an operator today; the same absence
is why the ceiling is unenforced. `arbitrate`'s only production caller is this
unreachable function, so the whole V16a arbitration seam is dead in production.

## Why it matters

1. A typed `params:` field can hold a value of the wrong type in body scope, with
   the success echo asserting the bind worked. Every downstream use —
   interpolation, comparison, a `subagent fn` argument, an `invoke` — sees a value
   the declared type says is impossible. This is the corruption class bug 0017
   closed for `Result` values, at the parameter boundary.
2. A documented hard ceiling is not enforced at one of its five sites. The
   `params` slash-load arm is the only ceiling-#4 site whose breach is a
   *load-time* system note; with no walk, a `params` value 6+ levels deep binds and
   the theta body runs on it. The audience-coverage invariant's claim that every
   ceiling has an observable failure surface fails for this arm.
3. The one user-facing failure row the spec gives for this class cannot be emitted
   by the binder. Anything that surfaces it — H9a permitted-code scoring, operator
   triage, a fix's own regression witness — is scoring a dead branch.
4. The hook is skipped entirely for thetas with no defaults (`:1160–1162`), so even
   the AJV half is conditional on the theta declaring at least one default; the
   spec installs the hook on the merged `args` unconditionally.
5. The arbitration seam is dead. CIO-1's #3-over-runtime precedence is realised
   nowhere reachable, and if element 3 is wired without change it ships a populated
   `masked` at a site the spec pins empty, on an event `kind` the `masked`
   wire-location split does not enumerate.
6. The load-time gate that would have made the runtime check redundant is also
   absent, so there is no second line of defence.
7. Bounded: the other four CIO-3 sites are implemented and reachable, so a depth-6
   document that reaches a query response, a tool-call argument, or an `invoke`
   boundary is still refused.

## Non-goals

- **Whether a binder-*supplied* value violating the params schema should classify
  `ajv_args` rather than `malformed`.** At HEAD it fails the envelope AJV at
  extraction (`src/extension/production-theta-producer.ts:962–965`) and classifies
  `malformed`, which is retried once and renders "could not parse arguments". The
  spec's two class definitions overlap on that input (the `ok` arm's `args` **is**
  part of the envelope schema), and picking between them is a spec question. This
  report concerns the value the *runtime* fills and the depth of the merged
  document.
- **The `(default)` echo tagging.** Correct at HEAD and unchanged by the fix;
  reproduction (A)'s note shows it firing exactly when it should.
- **The four implemented CIO-3 sites and `depthWalk` itself
  (`src/runtime/depth-walk.ts:195`).** Conforming; contrast only.
- **`arbitrate` (`src/runtime/ceiling-arbitration.ts:122–130`).** Its logic matches
  the CIO site→ceiling map and the omit-when-empty rule; the defect is its caller's
  constant `satisfied` set and that caller's unreachability.
- **HC3-a/b retry budgets and the failure-mode template rendering.** Unchanged; the
  cross-route reuses the existing `ajv_args` template.
- **The `masked` wire-location split for the `validation` /
  `tool_loop_exhausted` / `invoke-depth-exceeded` surfaces.** Separate sites, not
  probed here.
- **`runBinderWithRetries`'s absent caller.** Listed under §Affected because it
  shares the module and the root cause, but the budget it implements is re-driven
  by `runBinderCallWithCancellation`; nothing is lost. Deleting or re-pointing it is
  cleanup, not a defect fix.
- **`#recoverDeclaredDefaults` re-reading the theta off disk to recover a value the
  parser already saw.** A separate design smell with its own failure modes (an
  edited file between load and dispatch binds the new default); unfiled, and
  orthogonal to whether the verdict is read.

## Fix

Constraint-pinned. The route is not settled; these constraints bind any route.

**Runtime — the post-default-merge hook.**

1. The depth walk runs at the post-default-merge hook *before* the AJV call
   (CIO-3), over the **merged** `args` — the site
   `defaulting-system-note-echo.md:11` names. Either inside
   `fillDefaultsAndRevalidate` (`src/binder/defaulting.ts:84–88`) or immediately
   ahead of it.
2. The classification is `classifyBinderArgs` (`src/binder/retry-taxonomy.ts:184`)
   over `{ depth: <walk over merged>, ajvIssues: <issues from the verdict> }`. That
   function already implements the pinned depth-before-AJV ordering and the CIO-1
   cross-route; wiring it installs enforcement point #4. The validator's
   `ValidationError[]` maps to `ValidationIssue` in canonical `validation_errors`
   order for `renderAjvSummary`.
3. `#mergeDeclaredDefaults` returns the classification, not only the args, and
   `runBinder` routes on it: on `kind: "ajv_args"`, take the existing failure arm —
   `#emitBinderFailureNote(slashName, outcome)`
   (`src/extension/production-theta-producer.ts:1126–1136`, already able to render
   the row via `src/binder/retry-taxonomy.ts:111–116`) and `return { bound: false }`
   — **before** `#emitBinderEchoNote`. The `bind_echo` note moves after the verdict.
   No retry (HC3-c); the theta does not start.
4. A depth breach renders through the same `ajv_args` template with
   `<ajv-summary>` carrying `<JSON-Pointer> JSON document depth exceeds 5` — the
   single-issue form `renderDepthWalkAjvSummary`
   (`src/binder/retry-taxonomy.ts:153–159`) already produces, no `; ` separator.
5. The hook runs whenever the theta declares `params:` with a lowered schema, not
   only when it declares defaults. `defaultedFields.length === 0`
   (`:1160–1162`) still needs the depth walk over the binder's own `args` —
   enforcement point #4 is about the `params` boundary, not about defaults — and a
   theta whose defaults cannot be recovered (`:1164–1166`) must not silently skip
   validation of what did arrive.

**Runtime — the cross-route seam.**

6. `masked` is omitted at this site (PIC-1 (c),
   `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:110`). The
   `satisfied` set passed to `arbitrate` (`src/extension/load-pre-eval.ts:152–155`)
   is derived from the walk's actual verdict, or the arbitration is dropped from
   this path. `tests/pre-evaluation-failures.test.ts:187` currently pins the
   non-conformant shape (`:199` asserts `masked` contains `"ceiling#4"`) and is
   updated with it.
7. If the binder path is wired through `classifyBinderArgs` rather than through
   `crossRouteSlashLoadParams`, that helper and its arbitration call are removed
   rather than left as a second, divergent implementation of the same cross-route.

**Load-time.**

8. `parseParams` (`src/parser/params.ts:118–247`) compares each `defaultSource`
   against the field's declared type, emitting `theta/parse/integer-narrowing`
   where that registered row applies (`docs/reference/diagnostics.md:70`) and a new
   registered code otherwise. `frontmatter-fields-a.md:60` states the MUST but
   names no code for the general case, so the registry addition is a spec edit, not
   a silent one. `src/parser/type-compat.ts` has no `params:`-default wrapper
   today; the new call site uses `checkCompatible` (`:139`) or a new wrapper beside
   `checkObjectFieldCompat` (`:500`).

**Test witness.** Offline is sufficient for every element; one live cell pins the
end-to-end surface.

- A unit cell driving `runBinder` with a double binder returning
  `{"kind":"ok","args":{"topic":"hello"}}` over a `count: integer = "xyzzy"` theta,
  asserting the `argument binding produced invalid args` note, the ABSENCE of
  `Running /…`, and `bound: false`.
- A depth-6 merged-args cell asserting the depth-walk summary form
  (`<JSON-Pointer> JSON document depth exceeds 5`, no `; ` separator), plus a
  depth-5 negative cell at the exactly-at-limit boundary proving the walk does not
  over-fire.
- A cell driving a real slash load with a depth-6 `params` value and asserting the
  rendered note, with `masked` absent from `details.event`.
- A parse cell asserting the type-incompatible default is refused at load time.
- The live cell from reproduction (A), which reds at HEAD on the presence of the
  success echo.

## Provenance

- Hunt areas: `binder-query` (candidate 02, the discarded verdict and the
  mistyped-default symptom) and `cancel-lifecycle` (candidate 03, the unenforced
  ceiling-#4 slash-load point and the cross-route seam). Adjudicated as one bug by
  dup-check — mutual MERGE verdict, same root-cause seam, two symptom families.
- Spec measured against:
  `docs/spec_topics/binder/defaulting-system-note-echo.md:5` (the
  `#post-default-merge-ajv-validation` anchor), `:7` (defaults filled by the
  runtime after the binder returns), `:9` (fill-if-absent), `:11` (the named hook
  and the depth-walk-first clause), `:44` (the `(default)` tag rule);
  `docs/spec_topics/binder/determinism-cancellation-failure.md:35` (the
  AJV-on-`args` class and its depth-walk fast-fail sub-case), `:42` (the
  `<ajv-summary>` placeholder definition and the depth-walk clause), `:52` (the
  failure-mode row), `:58` (the per-invocation retry budget; "AJV validation of
  `args` is unaffected by the cap");
  `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md:11` (HC3-c), `:17` (the
  `ceiling-4-table` anchor), `:19` (the canonical breach message and
  `schema_keyword`), `:26` (the `params` validation row and its slash-load arm),
  `:29` (the cross-ceiling reconciliation paragraph), `:39` (CIO-1), `:41` (CIO-3's
  five-site list), `:52` (the audience-coverage invariant);
  `docs/spec_topics/schema-subset.md:22` (AJV has no `maxDepth`), `:44`
  (enforcement point #4), `:47` (walk before AJV), `:49` (the canonical `maxDepth`
  issue), `:56` (the slash-load routing), `:65` (the walk installed uniformly);
  `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:96` (PIC-1),
  `:100` (canonical-absence), `:102` (co-fire-eligible surfaces), `:110` (the
  slash-load `params` row's empty reachable mask domain);
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md:60` (the
  default-vs-declared-type compatibility MUST);
  `docs/spec_topics/binder/binder-bypass-and-envelope.md` §Binder envelope (the
  relaxed `args` copy).
  User-facing reference: `docs/reference/hard-ceilings.md`,
  `docs/reference/schema-subset.md`, `docs/reference/diagnostics.md:70`, `:199`.
- Implementation read at `d06daae3`:
  `src/extension/production-theta-producer.ts:823–846` (`runBinder`'s post-`ok`
  tail), `:860–903` (`#emitBinderEchoNote`), `:929–1019`
  (`#classifyBinderAttempt`, the reachable outcome set), `:962–965` (the envelope
  AJV), `:1126–1136` (`#emitBinderFailureNote`), `:1138–1176`
  (`#mergeDeclaredDefaults`, the drop at `:1174–1175`), `:1188–1231`
  (`#recoverDeclaredDefaults`), `:3131` / `:3304` (the two invoke depth sites),
  `:4822` (the runtime's own record that AJV carries no depth bound);
  `src/binder/defaulting.ts:67–89` (`fillDefaultsAndRevalidate`, the validate call
  at `:86`, the returned verdict at `:88`);
  `src/binder/retry-taxonomy.ts:111–116` (the `ajv_args` render row), `:138–142`
  (`renderAjvSummary`), `:153–159` (`renderDepthWalkAjvSummary`), `:164–201`
  (`classifyBinderArgs` and its input types), `:216` (`BinderAttemptOutcome`'s
  `ajv_args` member), `:256–283` (`runBinderWithRetries`);
  `src/binder/system-note.ts:131–135` (`renderFailureNote`);
  `src/binder/binder-envelope.ts:137–157` (`relaxParamsSchema`);
  `src/binder/binder-system-prompt.ts:235` (the omit-defaulted-parameters
  instruction);
  `src/extension/load-pre-eval.ts:45–46`, `:110`, `:138–182`;
  `src/extension/production-composition.ts:146`, `:1096–1105`;
  `src/runtime/ceiling-arbitration.ts:122–130`;
  `src/runtime/depth-walk.ts:50` (`DEPTH_VIOLATION_MESSAGE`), `:195` (`depthWalk`);
  `src/runtime/invoke-ceiling-depth.ts:83`, `:99`, `:121–137` (the walk at `:126`);
  `src/runtime/query-tool-loop.ts:647`; `src/runtime/tool-call.ts:605`, `:691`;
  `src/parser/params.ts:118–247` (`parseParams`), `:174–176` (defaulted fields
  omitted from `required`), `:214–226` (the literal-only default check), `:236–241`
  (the lowered schema);
  `src/parser/type-compat.ts:139` (`checkCompatible`), `:403`
  (`checkLetRhsCompat`), `:452` (`checkFnArgCompat`), `:500`
  (`checkObjectFieldCompat`), `:555` (`checkCommonType`) — none imported by
  `params.ts`;
  `src/lexer/literals.ts:125` (the sole `theta/parse/integer-narrowing` emitter, a
  lexer-level check, not a `params:`-default one).
- Test evidence at `d06daae3`:
  `tests/defaulting-revalidation.test.ts:101–102` — pins the leaf against a spy
  validator, including that the verdict is surfaced *by the leaf*; no cell pins a
  production consumer.
  `tests/binder-retry-taxonomy.test.ts:246–259` — pins `classifyBinderArgs` and
  `runBinderWithRetries` in isolation.
  `tests/e2e-s5-binder-echo-emission.test.ts:222` — pins the success echo on the
  channel; nothing pins its suppression on an invalid merge.
  `tests/pre-evaluation-failures.test.ts:187` — the only consumer of
  `crossRouteSlashLoadParams`; `:199` asserts the `masked` field, so it pins the
  non-conformant shape.
  `tests/ceiling-arbitration.test.ts`, `tests/depth-enforcement.test.ts`,
  `tests/tool-calls-depth-ceiling.test.ts`, `tests/invoke-ceiling-depth.test.ts` —
  seam-level coverage of the four reachable sites. No committed cell drives a
  depth-6 `params` value or a mistyped default through the binder path.
- Live evidence: scratch probe at HEAD `d06daae3`, binder model
  `anthropic/claude-haiku-4-5`, drive `/bhaiku hello`, channels recorded verbatim
  in reproduction (A). Offline evidence: scratch vitest at `d06daae3`, values
  recorded verbatim in reproductions (B) and (C). Both probes deleted after
  recording, per hunt protocol.

## Fix (0.88.0)

- What shipped, keyed to §Fix. Runtime (constraints 1–5):
  `fillDefaultsAndRevalidate` (`src/binder/defaulting.ts`) runs hard-ceiling
  #4's depth walk over the MERGED `args` before AJV (CIO-3) and classifies
  through the previously-callerless `classifyBinderArgs({depth, ajvIssues})`;
  the projected `ValidationIssue[]` passes through `orderValidationIssues`
  first, so `<ajv-summary>` is canonical by ERR-14's own contract rather than
  one AJV build's traversal order; `#mergeDeclaredDefaults`
  (`production-theta-producer.ts`) returns `{args, classification}` and
  `runBinder` routes a non-`ok` classification through the existing
  `#emitBinderFailureNote` + `{bound: false}` BEFORE `#emitBinderEchoNote`
  (no retry, HC3-c — the theta does not start); the hook runs whenever the
  theta presents a lowered `params:` schema — the `defaultedFields.length
  === 0` and recovery-yields-nothing early returns are gone, so a
  no-defaults theta's own args and a theta whose defaults cannot be
  recovered are both walked and validated. A depth breach renders
  `renderDepthWalkAjvSummary`'s single-issue form (no `; ` separator).
  Cross-route seam (constraints 6–7): the binder path is wired through
  `classifyBinderArgs`, so `crossRouteSlashLoadParams`,
  `SlashLoadParamsCrossRoute` and their dead imports are DELETED from
  `load-pre-eval.ts` rather than left as a divergent twin; the failure note
  emits `details: {event: {}}` with `masked` ABSENT (PIC-1 (c));
  `tests/pre-evaluation-failures.test.ts`'s ERR-16 cell — the one
  doc-authorized flip — now routes an assembled ceiling-#3 note and asserts
  `masked` absent. Load time (constraint 8): `parseParams` pairs each
  field's declared-type half with its default-literal half and calls the new
  `checkParamsDefaultCompat` (`type-compat.ts`, appended after the file's
  last line; `paramsDeclaredCompatType` beside it) over a null-prototype,
  `Object.hasOwn`-guarded EMPTY `TypeEnv`, reusing
  `theta/parse/integer-narrowing` for the one-way number-under-integer case
  and emitting the new registered `theta/parse/params-default-type-mismatch`
  otherwise; `literal-sublanguage.ts` gained `defaultLiteralStaticType`
  (sharing the module's own tokeniser so it can never disagree with the
  is-literal verdict). DIAG-2, same commit: the new registry row (Trigger =
  the GOV-15 post-hoc in-scope set: the EMPTY-env decidable/deferral
  partition, the two precedence rules, the not-registered disposition) +
  `docs/reference/diagnostics.md` mirror; `frontmatter-fields-a.md` §Defaults
  gains the code beside `integer-narrowing` + `docs/reference/frontmatter.md`
  mirror; `type-system.md` TYPE-9's site enumeration Three→Four naming the
  `params:`-default site + `docs/reference/type-system.md` mirror (a
  recorded, bounded self-authorization — the enumeration only).
- The decidable/deferral partition, normative in the Trigger and pinned by
  the witness: decidable declared shapes — primitives, unions of primitives,
  `array<T>` nesting over either; decidable default shapes — string / number
  / boolean / `null` literals (unary-minus numerics included) and FLAT
  HOMOGENEOUS array literals of them. Everything else — `NamedType`, alias,
  inline-object or literal-typed declared halves; object / `Enum.Variant` /
  construction / empty / heterogeneous / NESTED-array / unparseable default
  halves — defers to the relation's `"unknown"` case and rides the runtime
  net this same fix made real. Review round 1 caught the code deciding MORE
  than the Trigger (recursing into nested array literals off the first
  element's shape — order-dependent verdicts over identical multisets);
  settled by NARROWING the code to the Trigger as written (cells c9–c13 pin
  the deferrals both element orders; b3 pins element-level narrowing on flat
  arrays surviving).
- Recovery note: the orchestrator for this run died (host-side connection
  loss) after gating Phase 2; the run was completed under the command's
  §Stability fallback — phases driven from the main session, each gated
  there. Phase artifacts recovered from the session log to
  `.pi/tmp/fixes/0066-phase2-brief-recovered.md`,
  `0066-implementer-report-recovered.md`, `0066-testwriter-report-recovered.md`.
- Gates: witnesses `tests/binder-post-merge-ajv-enforcement.test.ts` (6
  cells incl. the recovery-failure arm), `tests/defaulting-post-merge-classification.test.ts`
  (6, incl. the spy proof that AJV does not run on a depth breach — CIO-3),
  `tests/params-default-type-compat.test.ts` (36; refusal, narrowing,
  deferral, control and precedence tables); full default suite 284 files /
  4639 tests green; tsc clean; lint clean; H8a live 31/31 (the additive cell
  below); H9a acceptance 11/11 (clean first time — no open stochastic
  signature encountered); `tests/fixtures/h7a/permitted-codes.json`
  byte-unchanged (`a4a8da04…`), decided by the real H9a run (the parse code
  un-registers thetas and is absent from the acceptance corpus; the one
  defaulted acceptance fixture is TYPE-2-compatible and exercises only the
  success echo).
- Review: round 1 deep — one `spec` finding (the Trigger/code nested-array
  divergence above; resolved by narrowing + new cells) + two residuals
  (`arbitrate` now caller-less; the recovery-failure arm unwitnessed —
  taken, cell (5)); round 2 fast — CLEAN (one pre-existing find flagged:
  `firstNonLiteral`'s neg arm admits `-true`/`-null`/`-"x"` against
  grammar.md's `LiteralType ::= "-" NUMBER`; predates this fix; filed as a
  residual by the parent). Cap 2 of 5.
- Verification: SOLID, zero findings. Three unit neutralisations, each red
  for the right reason and restored blob-exact (`defaulting.ts` `29b9068d…`,
  `params.ts` `c463b0bb…`, `literal-sublanguage.ts` `ddd44132…`): the
  straight-to-AJV shape reds 8 cells across both binder witnesses (the
  success echo returns); disabling `checkParamsDefaultCompat` reds exactly
  a1–a8/b1–b3; re-widening `flatArrayStaticType` reds exactly c10/c11/c13
  and exhibits the order-dependent verdict the narrowing exists to prevent
  (c12 green on the same multiset). Live: the additive H8a cell (file
  30 → 31, +212/−0) drives reproduction (A) through a REAL binder turn —
  red-proven live under the neutralisation (the success echo carries
  `pick=zzz (default)` and the sentinel reaches the model), restored
  blob-exact, 31/31 green.
- Baseline drift recorded (the doc was verified at `d06daae3`, ~35 minors
  back): 0050 is fixed (0.77.0), not "open" as §Related states; the
  `params.ts` / `production-theta-producer.ts` line anchors shifted
  (0056/0059/0061/0137/0149 churn) and were re-anchored by symbol; the
  0165-shape `defaultSource: ""` fails `parseExpressionSource` (measured —
  the premise of witness cell (5)).
- Residuals: (1) `firstNonLiteral`'s unary-minus arm admits non-numeric
  literals (`-true`, `-null`, `-"x"`) against grammar.md's
  `LiteralType ::= "-" NUMBER` — pre-existing, surfaced by round 2; the
  parent files it. (2) `arbitrate`
  (`src/runtime/ceiling-arbitration.ts`) is now fully caller-less in `src/`
  after constraint 7's deletion — dead production code with a green unit
  test; recorded-not-filed (cruft with no spec obligation; §Non-goals keeps
  the seam out of frame). (3) The deferral classes' load-time silence is
  normative in the new Trigger and rides the now-real runtime net; bug
  0165's empty-default null-bind persists by design of its own class (see
  the coordination note on its doc) and stays open. (4) `runBinderWithRetries`
  remains the module's other unreferenced export (pre-existing, §Affected
  lists it as context; unchanged here).
- Discharge notes appended: bug 0163's doc — closure note (this fix
  discharges it: constraint 8 refuses its decidable rows at load;
  the wired hook refuses its literal-declared row loudly before the body at
  first invocation; the deferral posture its §Expected found undocumented is
  now documented in the Trigger and TYPE-9) + Status flipped to
  fixed (0.88.0) BY THIS FIX (parent-gate adjudication); bug 0165's doc —
  mechanism-delta note (the merge no longer returns before the hook; the
  null-bind observable persists; stays open). No 0013/0036-era note owed
  (checked — their records claim nothing this fix moves).
- Pinned dispositions / non-goals: the EMPTY-TypeEnv deferral design (named
  types/aliases/literal-typed declared halves defer at load — the runtime
  net is the documented backstop); `arbitrate` untouched; bug 0165's
  `string = ` row pinned as a load-time DEFERRAL (cell c7) and its null-bind
  untouched; bug 0064's binder signature distinguished (the live fixture
  pins `bind_model: anthropic/claude-haiku-4-5`); `PreEvalFailureCause`'s
  `"slash-load-params"` member retained (ERR-5-symmetric direct emission).

Discharge note (appended by the bug 0166 fix, 0.91.0). This fix's *Residuals*
item 1 — `firstNonLiteral`'s `neg` arm admitting `-true` / `-null` / `-"x"` —
was filed as bug 0166 and is now **fixed (0.91.0)**. Two consequences for this
record. First, the Trigger-exactness item this report opened is resolved:
`theta/parse/params-default-type-mismatch` was firing past its own registered
*Trigger* enumeration (which names "a unary-`-` **numeric** literal") for
`integer = -true` and `integer = -null`; 0166 resolved it by narrowing the CODE
to the registered row rather than widening the row, so that row is byte-
unchanged and its enumeration is now exactly `defaultLiteralStaticType`'s
decided set. Second, the mirror contract this fix pinned in
`primitiveLiteralType`'s design note is preserved and is now WITNESSED, not
only asserted: both `neg` arms narrow through one shared predicate
`isNumericLiteralOperand`, and neutralising either arm alone reds group C of
`tests/params-default-unary-minus-non-numeric-refusal.test.ts`. This fix's own
post-default-merge AJV hook and its live cell are untouched.
