---
id: PTQ-1676
title: renderSubagentDisposeFailureMessage cuts the registry `<teardown error first line>` tail with a hand `split("\n", 1)` while its sibling envelope-failure builders route the same class of host-derived tail through renderHostDerivedTail, and refuseParams' spec-named `<detail>` tail is cut by neither
lens: D1
status: open
verdict: confirmed
locations:
  - src/runtime/subagent-isolation.ts:61-66
  - src/runtime/subagent-isolation.ts:257-264
  - src/runtime/subagent-envelope-failures.ts:55-57
  - src/runtime/subagent-envelope-failures.ts:84-98
  - src/runtime/subagent-params.ts:305-307
  - src/diagnostics/placeholder.ts:253-255
  - src/diagnostics/placeholder.ts:303-309
sites: 4
fix_scope: module
d1_class: divergent-solutions
wave: qw20260928124659
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
triaged_at: 7d0a52af49422fb4ce69fba3a62007fdfaf35a3e
---

# renderSubagentDisposeFailureMessage cuts the registry `<teardown error first line>` tail with a hand `split("\n", 1)` while its sibling envelope-failure builders route the same class of host-derived tail through renderHostDerivedTail, and refuseParams' spec-named `<detail>` tail is cut by neither

## Observation
Four builders in the `src/runtime/subagent-*` family interpolate a host- or child-supplied string into the trailing placeholder of a registry-pinned *Message* template. Two of them (`mapEnvelopeParseFailure`, `mapWireParseFailure`) call the repository's placeholder renderer `renderHostDerivedTail` (which delegates to `firstLineTruncate`: CR/CRLF normalisation, cut at first `\n`, `<no message>` when empty). One (`renderSubagentDisposeFailureMessage`) performs its own `raw.split("\n", 1)[0] ?? ""` cut, with no CR normalisation and no empty arm. One (`refuseParams`) interpolates `detail` untouched. The registry names the dispose-failure tail `<teardown error first line>` and the placeholder spec lists `<detail>` for `subagent-params-validation-failed` among the tails rendered by category 6's first-line truncation. Bug 0258 already fixed exactly this divergence between the two envelope builders by migrating one of them to `renderHostDerivedTail`; its fix touched `src/runtime/subagent-envelope.ts` only.

## Evidence

### Way A — the shared renderer (2 sites)

src/runtime/subagent-envelope-failures.ts:55-57
```ts
export function mapEnvelopeParseFailure(line: string, calleePath: string): EnvelopeFailureMapping {
  const summary = summarizeLine(renderHostDerivedTail(line));
  const message = `subagent return envelope parse failed: ${summary}`;
```

src/runtime/subagent-envelope-failures.ts:84-98 (the rationale the sibling carries)
```ts
export function mapWireParseFailure(line: string): Diagnostic {
  // `<line summary>` is a category-8 host-derived tail, which
  // placeholder-rendering-b.md §8 pins to category 6's first-line truncation:
  // newline-normalise (`\r\n` and bare `\r` become `\n`), then cut at the first
  // break. The production line pump splits on `\n` alone and leaves a trailing
  // CR for this parser to trim, so a co-process writing `garbage\r\n` delivers
  // the line `garbage\r` here and that CR must not reach the operator. The rule
  // is single-sourced in `renderHostDerivedTail`; `summarizeLine` then applies
  // the length cap §8 leaves implementation-defined at the byte level. The
  // rule's `<no message>` empty arm is answered by that shared renderer, so no
  // arm for it is written here — and the driver's blank-line filter takes every
  // all-JSON-whitespace line before this builder runs, leaving a leading bare
  // CR as its only route.
  const summary = summarizeLine(renderHostDerivedTail(line));
  return {
```

The renderer it names — src/diagnostics/placeholder.ts:253-255 and :303-309:
```ts
export function renderUnderlyingError(caught: unknown): string {
  return firstLineTruncate(coerceUnderlyingString(caught));
}
```
```ts
function firstLineTruncate(s: string): string {
  const normalised = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const newlineIndex = normalised.indexOf("\n");
  const firstLine =
    newlineIndex === -1 ? normalised : normalised.slice(0, newlineIndex);
  return firstLine === "" ? "<no message>" : firstLine;
}
```
(placeholder.ts:244-245 heads this block "Category 6 — underlying-error placeholders // `<error.message>`, `<original content first line>`, `<dispose error first line>`" — the dispose/teardown tail is the placeholder this renderer was written for.)

### Way B — a hand cut on `\n` alone (1 site)

src/runtime/subagent-isolation.ts:61-66
```ts
export function renderSubagentDisposeFailureMessage(disposeError: unknown): string {
  const raw = disposeError instanceof Error ? disposeError.message : String(disposeError);
  const firstLine = raw.split("\n", 1)[0] ?? "";
  // Registry-pinned Message column (code-registry-runtime.md): only the first
  // line of a multi-line teardown-step error rides in.
  return `subagent teardown failed: ${firstLine}`;
```
Its one caller, src/runtime/subagent-isolation.ts:257-264:
```ts
function emitTeardownStepFailure(deps: SubagentChildTeardownDeps, error: unknown): void {
  deps.emitDiagnostic({
    severity: "error",
    code: SUBAGENT_DISPOSE_FAILURE_CODE,
    message: renderSubagentDisposeFailureMessage(error),
    hint: error instanceof Error ? error.message : String(error),
  });
}
```

### Way C — no cut at all (1 site)

src/runtime/subagent-params.ts:305-307
```ts
function refuseParams(errorPath: string, detail: string): ChildParamsIntake {
  const location = errorPath.length > 0 ? ` at ${errorPath}` : "";
  const message = `subagent marshalled params failed schema validation${location}: ${detail}`;
```

### The registry / placeholder rows the four sites render

docs/spec_topics/diagnostics/code-registry-runtime.md:26 (Message column): `subagent teardown failed: <teardown error first line>`.

docs/spec_topics/diagnostics/placeholder-rendering-b.md:25 — "**Placeholders.** `<error.message>`, `<original content first line>`, `<teardown error first line>`." and :95 — "`<exit detail>` … `<line summary>` … and `<detail>` (`theta/runtime/subagent-params-validation-failed`) each bind a host- or child-supplied string not pinned by theta … and each renders per the rule above (category 6's first-line truncation)."

### Searches (run this session)

`grep -rn "renderSubagentDisposeFailureMessage\|renderUnderlyingError(\|renderHostDerivedTail(" src --include=*.ts` → 14 hits (first 10):
```
src/diagnostics/placeholder.ts:253:export function renderUnderlyingError(caught: unknown): string {
src/diagnostics/placeholder.ts:368:export function renderHostDerivedTail(hostString: string): string {
src/diagnostics/placeholder.ts:397:  const observed = renderHostDerivedTail(details.observed);
src/extension/factory.ts:175:  const error = renderUnderlyingError(caught);
src/extension/factory.ts:202:  const error = renderUnderlyingError(caught);
src/extension/factory.ts:250:  const error = renderUnderlyingError(caught);
src/runtime/subagent-envelope-failures.ts:56:  const summary = summarizeLine(renderHostDerivedTail(line));
src/runtime/subagent-envelope-failures.ts:97:  const summary = summarizeLine(renderHostDerivedTail(line));
src/runtime/subagent-isolation.ts:61:export function renderSubagentDisposeFailureMessage(disposeError: unknown): string {
src/runtime/subagent-isolation.ts:261:    message: renderSubagentDisposeFailureMessage(error),
```
(remaining 4: src/runtime/tool-registration.ts:44, :199, :325, :438 — all `renderUnderlyingError(`). Neither `renderUnderlyingError` nor `renderHostDerivedTail` is imported anywhere in `subagent-isolation.ts` or `subagent-params.ts`.

`grep -rn 'split("\n"' src/runtime/subagent-*.ts` → 3 hits:
```
src/runtime/subagent-exec-placement.ts:267:        const detail = result.stderr.trim().split("\n")[0] ?? "";
src/runtime/subagent-exec-placement.ts:272:      const handle = (result.stdout.split("\n")[0] ?? "").trim();
src/runtime/subagent-isolation.ts:63:  const firstLine = raw.split("\n", 1)[0] ?? "";
```
(:267/:272 build an `Error` message and the exec handle, not a registry tail directly; not counted as sites.)

`git show --stat --format='%h %s' 4cb23c4f` (the bug 0258 fix):
```
4cb23c4f fix: bug 0258 — envelope-parse-failed line summary renders host-derived (v0.242.0)
 CHANGELOG.md                                       |  13 ++
 ...lope-parse-failed-summary-embeds-trailing-cr.md |  82 +++++++-
 docs/bugs/README.md                                |   2 +-
 package.json                                       |   2 +-
 src/runtime/subagent-envelope.ts                   |   6 +-
 ...8-envelope-parse-failed-line-summary-cr.test.ts | 206 +++++++++++++++++++++
```
`subagent-isolation.ts` and `subagent-params.ts` were not in that fix's scope.

`git log --format='%h %ad %s' --date=short -S'raw.split("\n", 1)[0]' -- src/runtime/subagent-isolation.ts` → 1 hit: `d904dc6a 2026-07-01 V9i-T — subagent-mode session isolation and lifecycle failing tests + non-compliant seam (…)`. `git log … -S'function firstLineTruncate' -- src/diagnostics/placeholder.ts` → 1 hit: `26059e2b 2026-06-30 V7c — placeholder rendering: eight per-category renderers (DIAG-4)`. The shared renderer predates the hand cut by one day; the hand cut was never migrated.

## Why this is a problem
Drift already happened in this exact module family and cost a bug: docs/bugs/0258 records that `mapEnvelopeParseFailure` rendered its `<line summary>` "through `summarizeLine` alone" while the sibling `mapWireParseFailure` used `renderHostDerivedTail`, so a `\r\n`-terminated child line reached the operator with the trailing U+000D inside `diagnostic.message` and `InvokeInfraError.message`. The fix (4cb23c4f) migrated that one site. `renderSubagentDisposeFailureMessage` is the same shape of divergence left standing: `split("\n", 1)` leaves a trailing `\r` on a CRLF-separated teardown error and renders `subagent teardown failed: ` (empty tail) where the shared renderer renders `<no message>`; `refuseParams` applies no cut, so a multi-line validator `detail` — the placeholder spec's own example class of "a schema-validation library's error text" — rides whole into the single-line `message`. A maintainer who fixes the tail rule in `placeholder.ts` (as bug 0258's analysis assumed the rule was "single-sourced in `renderHostDerivedTail`") changes two of the four family sites and misses the other two, because nothing in `subagent-isolation.ts` or `subagent-params.ts` names the renderer.

## Suggested direction (non-binding, optional)
Unproven hypothesis: the family's registry tails could all pass through the one renderer the envelope builders already import (`renderUnderlyingError` for the caught-throw tail, `renderHostDerivedTail` for the string tails), leaving the surrounding templates byte-identical.

## False-positive check
- Injected clone map: "(no clone groups)" for every in-scope file; no group covers this. The two ways are mechanism-shaped (a shared renderer call vs a hand `split` vs no cut), not a token-level copy.
- D9-affinity check: not a wrong-home claim — each builder belongs with its own diagnostic code; the claim is which mechanism they use for the same tail class.
- D2-deadness check: all four sites are live production paths (`emitTeardownStepFailure` ← `runSubagentChildTeardown`/`killChild`; `refuseParams` ← `intakeChildParams`; the two envelope builders ← `driveSubagentChild`). `renderSubagentDisposeFailureMessage` is also pinned by tests/subagent-isolation.test.ts:210-218.
- Prior filings: PTQ-0082 (resolved) covered only this function's docstring. Bug 0258's fix scope is `src/runtime/subagent-envelope.ts` only (stat above); bug 0189 covers the placeholder vocabulary in the spec, not the renderer used at these sites. No PTQ names `renderSubagentDisposeFailureMessage`'s truncation mechanism (`grep -rln "renderSubagentDisposeFailureMessage\|teardown error first line" quality/ docs/bugs` → quality/resolved/PTQ-0082-dispose-message-docstring-pre-rename.md, docs/bugs/0189-registry-placeholders-outside-closed-categories.md, docs/bugs/README.md).
- Self-inconsistency statement: a written rendering rule exists for the placeholders (placeholder-rendering-b.md §6/§8), but no written rule says which code path a builder must use; the anchor here is self-inconsistency within one module family (two sites on the shared renderer, two not) plus the cost cited above, including the drift bug 0258 already recorded.
- Not a bug filing: the divergent output is stated as the cost of the mechanism split; the fix stage owns whether/how to unify.

## Triage
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling. All seven excerpts match at the cited lines: subagent-isolation.ts:61-66 uses a hand `raw.split("\n", 1)[0]` (no CR normalisation, no `<no message>` arm, and `instanceof Error` coercion instead of §6's coerceUnderlyingString); envelope-failures.ts:56/:97 use renderHostDerivedTail; subagent-params.ts:305-307 interpolates `detail` raw (it comes from ajv `errors[0].message`, subagent-spawn-regime.ts:812-820/1328-1332). placeholder-rendering-b.md:25 lists `<teardown error first line>` under §6 and :95 lists `<detail>` under the first-line rule; registry row :26 matches. The renderer grep reproduces 14/14 lines; 4cb23c4f stat, both -S log hits and the quality/docs/bugs grep reproduce. The `split("\n"` grep gives 0 hits as a regex under GNU grep 3.0, but with -F it returns exactly the 3 pasted lines, so it's a shell-escaping difference, not fabrication, and it counts no sites. clone-scan map on subagent-isolation.ts: (no clone groups). The cost is real: bug 0258 (fixed 0.242.0) records this same sibling drift in the family. No open bug or PTQ tracks the dispose or params tail (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: the subagent family's registry tails all render through the category-6 rule. (1) src/runtime/subagent-isolation.ts renderSubagentDisposeFailureMessage (:61-66): replace the hand `raw.split("\n", 1)[0] ?? ""` (and the instanceof-Error coercion) with `renderUnderlyingError(disposeError)` from src/diagnostics/placeholder.ts — it coerces unknown and applies firstLineTruncate — keeping the `subagent teardown failed: ` template and the :263 hint untouched. (2) src/runtime/subagent-params.ts refuseParams (:305-307): wrap the interpolated detail in `renderHostDerivedTail(detail)`. Stated behaviour change, spec-mandated (placeholder-rendering-b.md:25 and :95 pin `<teardown error first line>` and `<detail>` to category 6's first-line truncation): CRLF teardown errors lose the trailing CR, an empty teardown message renders `<no message>`, and a multi-line ajv detail is cut at its first line. Existing pinned tests (plain single-line messages) stay green; add one CRLF vector per site.
