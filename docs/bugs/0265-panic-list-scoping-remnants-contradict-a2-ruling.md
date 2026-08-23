# Bug 0265 — three surfaces outside bug 0117's granted scope still assert the pre-ruling unscoped panic claim: `runtime-event-channel.md:22/32/57/91` type every panic note's diagnostic as `theta/runtime/*`, `glossary.md:7` types the always-log set's panic members the same way, and ERR-20 (`docs/reference/errors-and-results.md:130`) scopes the `par for` downgrade to "any of the six panic sources above" while `isThetaPanic` returns `true` for the seventh, parse-coded `InterpolatedResultPanic`

- **Status:** open.
- **Sev/Diff estimate:** S4/D1 — S4 because the shipped runtime is what the
  landed ruling prescribes and no input observes a wrong result; the defect is
  spec prose that contradicts it. D1 because the remedy is three one-clause
  requalifications mirroring wording already landed in
  `error-model.md:65` and `docs/reference/errors-and-results.md:95–96`, and
  bug 0117's 12-cell oracle is the witness pattern to extend.
- **Kind:** spec-prose defect — three surfaces left outside the scope granted to
  bug 0117 still carry the claim its operator ruling (a)(2) falsified.
- **Affected** (every citation re-derived at HEAD `a6816b96`, v0.258.0):
  - `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:22` —
    the `details: { diagnostics: Diagnostic[] }` bullet, "for the runtime-panic
    case (a single-element batch carrying a `theta/runtime/*` diagnostic)".
  - `:32` — the per-variant `display`/`content` table row, keyed
    "runtime panic (single-element batch, `theta/runtime/*` code)".
  - `:57` — group B, "Runtime panics — every row of [Diagnostics —
    `theta/runtime/*`](../diagnostics.md)", minus the five `console.error`
    exclusions.
  - `:91` — the dedup bullet, "A panic emits exactly one `theta-system-note`
    per top-level panic with `details: { diagnostics: [Diagnostic] }` carrying
    a single `theta/runtime/*` diagnostic".
  - `docs/spec_topics/glossary.md:7` — **always-log set**, "`QueryError` `kind`
    values, binder failure causes, and `theta/runtime/*` panic codes".
  - `docs/reference/errors-and-results.md:127–141` — ERR-20; `:129–130` scopes
    the `par for` downgrade to a panic "from any of the six panic sources
    above", `:139–141` repeats "The closed panic-source list above is
    unchanged".
  - `src/runtime/runtime-panics.ts:546` — `isThetaPanic`, `error instanceof
    ThetaPanic`; `:67` the abstract base.
  - `src/render/query-render.ts:110–111` — `InterpolatedResultPanic extends
    ThetaPanic`, `readonly code = INTERPOLATED_RESULT_CODE`; `:80` fixes that
    constant to `theta/parse/interpolated-result`.
  - `src/runtime/statement-executor.ts:1230–1238` — `parForPanicError`, whose
    `cause` is `isThetaPanic(thrown) ? "panic" : "internal_error"` (`:1235`).
  - `docs/spec_topics/errors-and-results/error-model.md:65` and
    `docs/reference/errors-and-results.md:95–96` — the landed (a)(2) wording
    the three surfaces contradict.
- **Observed at:** HEAD `a6816b96`, v0.258.0. Ruling landed in 0.256.0.
- **Related:**
  - [0117](./0117-error-model-omits-parse-coded-interpolation-panic.md) —
    **fixed (0.256.0)**, the ruling this report's surfaces post-date. Its §Fix
    enumerates these four lines under "Deliberately NOT edited"; its fix record
    files them as residuals.
  - [0079](./0079-interpolated-result-unemitted-private-encoding-rendered.md) —
    **fixed (0.69.0)**, which added the seventh panic.

## Summary

Bug 0117's operator ruling (a)(2) rescoped `error-model.md` §"Runtime panics"
to *the sources of `theta/runtime/* panics*, stated the namespace ↔ list
correspondence as an exact *iff*, and named one exception beside it: QRY-18's
runtime fallback `InterpolatedResultPanic` is a `ThetaPanic` carrying the
parse-namespaced code `theta/parse/interpolated-result`, keeping panic routing.
Three surfaces the grant did not cover still speak the pre-ruling language.
`runtime-event-channel.md` types every panic note's diagnostic — in the payload
bullet, the `display`/`content` table row, the group-B enumeration, and the
dedup bullet — as `theta/runtime/*`, so a note carrying the exception panic's
`theta/parse/*` diagnostic matches no variant on the page. `glossary.md:7`
types the always-log set's panic members the same way. ERR-20 scopes the
`par for` panic downgrade to "any of the six panic sources above", while the
predicate it describes is `isThetaPanic`, which returns `true` for all seven
`ThetaPanic` subclasses — measured at HEAD.

## Reproduction

Mechanical, per surface, at HEAD `a6816b96`.

**Surface 1 — `runtime-event-channel.md`.**

```
rg -n 'theta/runtime/\*' docs/spec_topics/pi-integration-contract/runtime-event-channel.md
```

Line 22: "for the runtime-panic case (a single-element batch carrying a
`theta/runtime/*` diagnostic) the companion `content` is the user-facing
framing". Line 32, table key: "`details: { diagnostics: [Diagnostic] }`,
runtime panic (single-element batch, `theta/runtime/*` code)". Line 57:
"Runtime panics — every row of [Diagnostics — `theta/runtime/*`]", minus five
named `console.error` exclusions. Line 91: "carrying a single
`theta/runtime/*` diagnostic".

What (a)(2) makes true: the exception panic keeps panic routing
(`error-model.md:65`, "it keeps panic routing, and it is contained by neither
`match` nor `?` nor `let _ =` (QRY-21)";
`docs/reference/errors-and-results.md:95–96`, "a panic in every other respect —
same routing"). Delta: its top-level note carries a `theta/parse/*` diagnostic,
which line 32's row key excludes, line 57's enumeration does not reach (it
enumerates the runtime-namespaced registry rows), and lines 22 and 91 type
away.

**Surface 2 — `glossary.md:7`.**

```
sed -n '7p' docs/spec_topics/glossary.md
```

"The closed set of runtime failures — `QueryError` `kind` values, binder
failure causes, and `theta/runtime/*` panic codes — whose runtime occurrence
emits exactly one `theta-system-note`". Delta: same typing, one level up; the
entry states the set is closed, so a parse-coded panic note is either outside
the always-log set or the entry is wrong.

**Surface 3 — ERR-20, `docs/reference/errors-and-results.md:127–141`.**

`:129–130`: "A runtime panic raised inside one iteration — from any of the six
panic sources above — does not abort the theta: it is downgraded to that
element's `Err(QueryError { kind: "invoke_infra", cause: "panic", … })`".
`:139–141`: "The closed panic-source list above is unchanged".

What the runtime does, measured: `parForPanicError`
(`src/runtime/statement-executor.ts:1230–1238`) sets
`cause: isThetaPanic(thrown) ? "panic" : "internal_error"`, and `isThetaPanic`
(`src/runtime/runtime-panics.ts:546`) is `error instanceof ThetaPanic`. A
throwaway vitest probe constructing `new InterpolatedResultPanic("x")` prints
`code= theta/parse/interpolated-result isThetaPanic= true` (probe removed; the
same fact is derivable from `rg -n 'extends ThetaPanic' src/`, which returns
seven classes, and `rg -n 'readonly code = ' src/render/query-render.ts`).
Delta: the seventh panic is downgraded with `cause: "panic"` like the six, but
ERR-20's scope clause says the downgrade covers six sources, and its
runtime-defect neighbour at `:99–101` ("outside the six sources") is what a
reader applies to anything ERR-20 excludes — i.e. `cause: "internal_error"`,
which is not what runs.

## Expected behaviour

Each of the three surfaces either states the scoped meaning or cross-references
`error-model.md`'s stated exception:

- `runtime-event-channel.md`'s four panic-note sites admit the one
  parse-namespaced panic diagnostic, or qualify their `theta/runtime/*` typing
  as "`theta/runtime/*` (plus the one parse-namespaced exception per
  [Errors and Results — Runtime panics])".
- `glossary.md:7`'s always-log entry carries the same qualifier on its panic
  members, its `See:` reference being enough for the detail.
- ERR-20 scopes the downgrade to the panic predicate the runtime evaluates
  (`isThetaPanic` — every `ThetaPanic`), not to the six-entry source list,
  and keeps its "the list is not widened" statement about the *source list*
  rather than about the downgrade's reach.

## Actual behaviour / root cause

Bug 0117's grant covered five `docs/spec_topics/` pages plus their mirrors, and
its ruling was discharged on three files — `error-model.md:65`,
`docs/reference/errors-and-results.md` §"Runtime panics", and
`expressions.md:9–10`. `runtime-event-channel.md`, `glossary.md` and ERR-20
were inspected during that fix and recorded under "Deliberately NOT edited":
`runtime-event-channel.md` lines 32/57/91 and `glossary.md:7` as "outside the
granted scope; already contradicted at HEAD", ERR-20 as "under-prescriptive,
pre-existing". The scoping therefore landed on the pages the ruling named and
nowhere else, leaving the pre-ruling claim standing on the three surfaces that
consume it. Line 22 of `runtime-event-channel.md` carries the same claim and is
not in the residual list; it is re-derived here.

The same understatement appears in a source comment at
`src/runtime/statement-executor.ts:1225` ("six closed panic sources") and at
`src/runtime/tool-call-off-surface.ts:193`. Those are comments, not prose the
spec pins; they are noted, not required by this report's fix.

## Why it matters

The `theta-system-note` channel's four `details` variants are normative and
disjoint by key, and consumers are told the panic variant's diagnostic is
`theta/runtime/*`-coded. A conformance fixture or renderer written against that
typing rejects — or mis-routes — the one note the runtime can emit with a
`theta/parse/*` code. ERR-20's scope clause misstates an observable: the
`cause` field on a `par for` element's `Err` for a seventh-panic iteration is
`"panic"`, while the page's six-source framing points at `"internal_error"`.
`glossary.md` propagates the same typing to every page that borrows the term.

## Non-goals

- Re-opening operator ruling (a)(2). The disposition is settled: the panic list
  stays six, scoped to `theta/runtime/*` sources, with the QRY-18 fallback as
  the one stated exception.
- Widening the panic-source list to seven, on any page, or adding a registry
  row. `code-registry-runtime.md:7` and its `docs/reference/diagnostics.md`
  mirror stay true unmodified.
- Changing `src/`. The shipped routing is what the ruling prescribes.

## Fix

Three per-surface requalifications, each one clause, each mirroring the wording
already landed for 0117 (`error-model.md:65`;
`docs/reference/errors-and-results.md:95–96`).

1. `docs/spec_topics/pi-integration-contract/runtime-event-channel.md` lines
   22, 32, 57 and 91: qualify the panic-note diagnostic typing so the one
   parse-namespaced panic is admitted, cross-referencing
   [Errors and Results — Runtime panics](../reference/errors-and-results.md).
   Line 57's five `console.error` exclusions, the group A/B partition, the
   `RuntimeEvent` shape and the dedup tuple stay byte-unchanged; the `masked`
   clauses (PIC-1) are untouched.
2. `docs/spec_topics/glossary.md:7`: the same qualifier on the always-log
   entry's panic members. The entry stays one paragraph and keeps its `See:`
   target.
3. `docs/reference/errors-and-results.md:129–130`: restate the downgrade's
   scope as every panic (`ThetaPanic`), with the six-entry source list named as
   the `theta/runtime/*` sources and the exception cross-referenced. `:139–141`
   stays a statement about the source list.

Constraints:

- **Witness pattern.** `tests/b0117-panic-namespace-scoping-gate.test.ts` (12
  cells, green at HEAD) is the pattern: doc-oracle cells with semantic regexes,
  named-precondition throws, and src-derived facts via real imports. Extend it
  or add a sibling file; either is adjudicable. New cells cover the three
  surfaces and must be red-proven against the HEAD bytes before the prose
  lands, plus one src-derived cell asserting `isThetaPanic(new
  InterpolatedResultPanic(…)) === true`.
- **LOCKS.** All 12 existing oracle cells stay green unmodified, and the page
  bytes they pin stay byte-identical: `error-model.md:65` (one physical line;
  five tests cite lines 65/69/71/74/76 of that page), the six bullets and the
  six-row template table on both `error-model.md` and
  `docs/reference/errors-and-results.md`, `expressions.md:9–10`, and
  `docs/spec_topics/diagnostics/code-registry-runtime.md` in full.
- **Line-cite drift.** `docs/reference/errors-and-results.md` is 362 lines at
  HEAD; edits at `:129–130` shift ERR-20's neighbours. No file under `src/` or
  `tests/` cites a line of that page.
- No ordering dependency. Bug 0117 is fixed (0.256.0); this report's surfaces
  are disjoint from the files it edited.

## Provenance

- `.pi/tmp/fixes/0117-report-resumed.md` §"Residuals / notes" item 3:
  "the delivery-channel prefix claims at `runtime-event-channel.md` lines 32,
  57, 91 and `glossary.md` line 7 remain contradicted by the exception panic's
  group-B note; ERR-20's 'six panic sources' scope still understates
  `parForPanicError`'s `isThetaPanic` predicate
  (`src/runtime/statement-executor.ts` line 1235)." The same enumeration
  appears in that record's §"Per-page edit enumeration" under "Checked and
  deliberately NOT touched".
- [0117](./0117-error-model-omits-parse-coded-interpolation-panic.md) §Fix
  (0.256.0) — operator ruling, fifteenth set, ruling 1 = disposition (a)(2).
- Bug 0117's lane finds, fifteenth set; surfaces explicitly left outside its
  granted scope.
- All citations re-derived at HEAD `a6816b96`, v0.258.0.
