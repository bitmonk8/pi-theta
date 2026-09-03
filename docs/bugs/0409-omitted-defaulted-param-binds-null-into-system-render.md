# Bug 0409 — An `invoke(...)` or `.theta`-callable call that legally omits a trailing defaulted param binds `null` in its place: the `system:` template renders the four bytes `null` where the declared default was promised, and the marshalled `{p: null}` then either fails the child's schema validation (non-nullable param — spec-legal call refused) or silently discards the default end-to-end (nullable param)

- **Status:** open.
- **Sev/Diff estimate:** S1/D2 — a nullable defaulted param's declared default is silently dead on every non-slash invocation path (and the system prompt renders `null`), while a non-nullable one turns a spec-legal call into a fail-closed child-intake refusal; fix binds recovered defaults at the two `?? null` sites reusing existing machinery, with an adjudication against the omit-the-key alternative and a three-arm witness.
- **Kind:** defect — the `system:` render resolves against a params record
  that is not "the validated params object"
  (`docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:46`),
  and a spec-legal call (omission is admitted arity per
  `docs/spec_topics/invocation.md:50`) is refused fail-closed because the
  fabricated `null` violates the param's declared type. The fill-before-AJV
  sentence at `docs/spec_topics/frontmatter/frontmatter-fields-a.md:60` is
  slash-scoped ("When a slash-command invocation omits …"); the invoke leg's
  defect rests on the arity admission, the declared-type contract, and face
  2's refusal — not on that sentence.
- **Related:**
  - [0181](./0181-enum-access-params-default-boxed-string-refused-at-merge.md)
    (fixed) — §Non-goals (`:934–939`): "**The `invoke(...)` and
    `.theta`-callable argument paths.** They compute arity from `hasDefault`
    … and never construct a default's value … Whatever those paths bind for
    an omitted defaulted argument is outside this report's boundary." This
    candidate is that deferred question's referent.
  - [0186](./0186-params-defaults-bypass-sentence-falsified-load-bearing.md)
    (fixed) — §Non-goals (`:620–624`): the same paths "construct no default
    value, so no default reaches an inbound boundary on those paths. What
    they bind for an omitted defaulted argument is bug 0181 §Non-goals'
    (`:934–939`) open question and is not answered here." Twice-declared,
    never filed — until this report.
  - 0165 / 0163 (fixed) — the defaults family on the SLASH path
    (`fillDefaultsAndRevalidate`); this report is the same contract on the
    two non-binder arg paths, which never call the fill.
  - 0347 (fixed 0.347.0) — cited for the invoke→child envelope threading map.
  - [0146](./0146-invoke-arg-provable-set-withholds-true-positives.md) /
    [0071](./0071-theta-callable-call-arity-unchecked.md) (fixed) — same
    surface (invoke/callable arg binding), different input class (mistyped
    supplied arg; unchecked arity).
  - [bug 0408](./0408-scalar-union-params-render-json-row.md) — for a nullable defaulted param the wrongly
    bound `null` additionally renders through the union→JSON row; the two
    defects compose but are independent.
- **Affected** (verified at c2c25d81, v0.398.0):
  - `src/extension/production-theta-producer.ts:4033–4036` — the
    `invoke(...)` binding walk: `paramBindings.set(name, argValues[index] ??
    null)` sets EVERY declared param, stuffing `null` into each omitted
    (defaulted) trailing slot; no default recovery runs on this path
    (`#recoverDeclaredDefaults` / `fillDefaultsAndRevalidate` are
    binder-dispatch-only, `:1510–1517`).
  - `src/extension/production-theta-producer.ts:6442` — the model-driven
    `.theta`-callable trampoline: `spec.paramOrder.map((name) => (args[name]
    ?? null))` — same fabrication for a model that omits a defaulted arg.
  - `src/extension/production-theta-producer.ts:2197–2211` — the `system:`
    render consumes exactly these `paramBindings`; `:2373–2381` marshals the
    same record (`PI_THETA_PARAMS`).
  - `src/runtime/subagent-params.ts:283–301` + producer `:2606–2627` — the
    child validates the marshalled JSON against the FULL lowered schema and
    fills no defaults ("the marshalled path never re-enters the binder").
- **Observed at:** v0.398.0 (c2c25d81). Offline, deterministic: `parseDoc`'s
  `loweredSchema` compiled through the production `AjvSchemaValidator` and
  validated against the exact record the parent binds; `renderSystemPrompt`
  over the same record. Parent-side fabrication established by code read of
  the two `?? null` sites.

## Summary

Both already-typed argument paths translate "argument omitted" into "argument
is `null`". Three consequences chain off that one substitution for a callee
declaring `p: string = "x"` and `system: 'Lang: ${p}'`:

1. The parent renders the child's system prompt from the null-stuffed map:
   `Lang: null` (string-row cast + `+=` coercion) where the spec's
   resolve-against-validated-params rule yields `Lang: x`.
2. The parent marshals `{"p": null}`. The child's intake validates it against
   the lowered schema `{"p":{"type":"string"}}, required: []` → "must be
   string" → the whole invocation dies fail-closed
   (`theta/runtime/subagent-params-validation-failed`,
   `Err(InvokeInfraError{cause:"validation"})`) — for a call the arity rules
   admit. Omitting the KEY would have validated (`required` excludes
   defaulted fields, by design since 0165).
3. For `p: 'string | null' = "x"` the fabricated `null` VALIDATES, so the
   default is silently never applied anywhere: the child body reads `null`,
   and the system prompt reads `null` (via [bug 0408](./0408-scalar-union-params-render-json-row.md)'s union row) — the
   author's declared default is dead on every non-slash invocation path,
   with zero diagnostics.

Faces 2 and 3 belong to the invoke/marshal leg rather than the `system:`
template surface; the subject is the arg-binding site, and the area
assignment is incidental.

## Reproduction

At c2c25d81, offline (scratch vitest, production seams):

Callee frontmatter `mode: subagent`, `system: 'Lang: ${p}'`,
`params: p: 'string = "x"'` — `parseDoc` → zero diagnostics; lowered schema
`{"type":"object","properties":{"p":{"type":"string"}},"required":[],
"additionalProperties":false}`.

- `new AjvSchemaValidator({emit, slugOf: productionSchemaSlugOf})
  .compile(lowered).validate({ p: null })` →
  `{"ok":false,"errors":[{"instancePath":"/p","message":"must be string"}]}`
  — the child-intake refusal (`subagent-params.ts:294–297`).
- `.validate({})` → `{"ok":true}` — proving the refusal is manufactured by
  the parent's key-stuffing, not by the omission itself.
- `renderSystemPrompt({template, params: { p: null }})` →
  `{"ok":true,"text":"Lang: null"}`.

Nullable variant `p: 'string | null' = "x"`: lowered
`{"p":{"type":["string","null"]}}`; `validate({p: null})` → `ok` — the
invocation proceeds with the default discarded; render → `Lang: null`.

Parent-side record: `production-theta-producer.ts:4035` binds every
`callee.frontmatter.params.fields` name to `argValues[index] ?? null`;
`invoke("./callee.theta")` with the defaulted arg omitted is legal
(`invocation.md:50` — too-few fires only under the count of NON-defaulted
params; `frontmatter-fields-a.md:60` partitions arity by the same rule).

## Expected behaviour

- Lead face: `invocation.md:50` admits the omission (*Too few arguments*
  counts only non-defaulted `params:`), and the param's declared type
  (`p: string`) excludes `null` — so a spec-legal call must not die at the
  child's schema intake on a value the caller never passed. Face 2's
  fail-closed refusal is the unambiguous defect face.
- `frontmatter-fields-b-and-templates.md:46` (*Stringification*): "Resolve
  the path against the **validated params object**" — `{p: null}` is not a
  record that validates against the lowered schema, so the render input is
  outside the rule's stated domain. On the slash leg the validated object
  for an omitted defaulted slot carries the default
  (`frontmatter-fields-a.md:60`, slash-scoped: "When a slash-command
  invocation omits the corresponding positional argument, the default is
  filled in before AJV validation"); the spec nowhere states in terms that
  the invoke leg fills defaults — it gives those calls only the arity
  partition (`:60`) — so the render expectation `${p}` → `x` follows from
  the declared type plus inter-path consistency, not from `:60` directly.
- `invocation.md:38,50`: omission of trailing defaulted args is admitted
  arity; nothing licenses substituting `null` — `null` is a first-class
  value distinct from absence throughout the runtime value model, and for a
  non-nullable param it is precisely the value the schema REFUSES.

## Actual behaviour / root cause

`argValues[index] ?? null` (`:4035`) and `args[name] ?? null` (`:6442`)
conflate absent with `null` at the two non-binder binding sites. Nothing
downstream repairs it: the spawn renders and marshals the map as-is
(`:2197–2211`, `:2373–2381`), and the child intake deliberately bypasses the
binder/defaults machinery (`subagent-params.ts:298–301`). The slash path is
immune only because `fillDefaultsAndRevalidate` merges defaults before
`paramBindingsFrom` (`:1510–1517`).

## Why it matters

- Face 2 is a hard failure of a spec-legal call shape: any subagent callee
  with a non-nullable defaulted param cannot be invoked without spelling
  every default at every call site — the feature's whole point inverted —
  and the failure surfaces as an opaque marshalled-params validation error
  naming no author mistake.
- Faces 1 and 3 are silent wrong values on the highest-leverage surface (the
  fixed system prompt) and in body scope: the declared default is replaced
  by `null`/`"null"` with zero diagnostics, and the same theta behaves
  differently invoked via slash (default applied) vs `invoke(...)`/tool call
  (default dropped) — an inter-path divergence no author can predict from
  the spec.

## Non-goals

- The slash/binder path — fills defaults correctly (0165/0181/0186 lineage).
- The union→JSON rendering of the bound `null` — candidate
  system-templates/03.
- Prompt-mode `invoke` cells (no spawn, no `system:`) — the same `?? null`
  binding reaches their body scope, but body-scope semantics of prompt-mode
  invokes are outside this area; noted for the fixer.

## Fix

Fill the declared default at the binding sites: for each omitted trailing
slot, recover the default literal (the machinery exists —
`#recoverDeclaredDefaults` evaluates default sources through the body
environment, wire-projected; `:1535–1580`) and bind it instead of `null`;
leave genuinely-passed `null`s untouched. Alternative: omit the KEY for
omitted slots (bind nothing, marshal without it) and fill defaults at the
child's intake via `fillDefaultsAndRevalidate` — keeps one fill
implementation but changes the child-visible params contract (PIC-60) and
the prompt-mode invoke path separately. Either way the `system:` render must
see the post-fill record, and a probe must witness: (a) `invoke` omitting a
non-nullable defaulted param succeeds with `${p}` → default text; (b)
explicit `null` for a nullable param stays `null`; (c) the model-trampoline
path (`:6442`) gets the same treatment.

## Provenance

Fresh find (seed: "what fires when the param is absent at bind"). Probed at
c2c25d81 with scratch vitest `tests/scratch-system-defaults.test.ts`
(deleted): production lowered schema + production `AjvSchemaValidator` +
`renderSystemPrompt` composed exactly as the parent/child seams compose
them; the two `?? null` fabrication sites verified by code read.
