# Bug 0264 — A malformed `.thetalib` (or callee `.theta`) puts its lex rows on the `theta-system-note` channel once per PARSING WALK, not once per file: `checkThetaImports`' `parseThetaLib`, the import-check drop group, `collectCallableClosureSources`' `visit` and `parseCalleeForTools` each reach `parseThetaDocument` with the real note channel, and bug 0255's object-identity filter sits only in `parseDiscoveredTheta`'s drop arm — one importer delivers the same lex row twice, two importers four times

- **Status:** open
- **Sev/Diff estimate:** S3/D2 — author-visible: the same rendered line
  (`<file>:<line>:<col>: theta/parse/unterminated-template: …`) repeats 2×, 3×
  or 4× in one load pass, scaling with the number of importers and of callee
  walks that reach the file, so the author cannot read the note count as a
  problem count and the repeated rows crowd out the other files' notes in the
  same pass. Bounded: no diagnostic is lost, no registration decision changes,
  and the multiplier is the walk count, not unbounded. D2 because the delivery
  sites are four distinct callers in two files with different data shapes (one
  returns diagnostics into a drop group, three discard `document.diagnostics`
  and rely on the lexer's own emit), so a single-hunk edit does not cover them
  and the fix must decide per site whether the surviving delivery is route 1's
  batch or the caller's group.
- **Kind:** defect — the delivered note count violates the one-call-per-file
  rule. `docs/spec_topics/diagnostics/diagnostic-shape.md:65` (§Multi-error
  reporting): "Every parse / type pass collects all errors from the full file
  (and from transitive `.thetalib` imports) before failing. The theta is
  rejected with the complete list in **one `pi.sendMessage` call per `.theta`
  file** … rather than fast-failing on the first error or fanning out one
  message per error." The carve-out at `:24` (§Re-scan deduplication) licenses
  re-emission across a *watcher-triggered reload*, i.e. across load passes; the
  counts below are all inside ONE `composeExtensionInstance` pass.
- **Affected:** `src/extension/import-static-checks.ts` (`checkThetaImports`,
  its inner `parseThetaLib`), `src/extension/production-composition.ts`
  (`runComposePass`' import-check drop group, `collectCallableClosureSources`,
  `parseCalleeForTools`, `resolveCalleeArity`, `parseCalleeTheta`),
  `src/lexer/lexer.ts` (`lexTheta`'s producer-side emit),
  `src/parser/theta-document.ts` (`ThetaDocument.deliveredDiagnostics`).
- **Observed at:** HEAD `a6816b96`, v0.258.0, on the shipped composition root
  `composeExtensionInstance` with an undegraded `RendererGate`.
- **Related:**
  - [0255](./0255-lex-phase-diagnostics-double-deliver-on-dropped-theta.md) —
    **fixed (0.247.0)**, the primary-parse half. Its fix added
    `ThetaDocument.deliveredDiagnostics` (`src/parser/theta-document.ts:853`,
    set at the single `parseThetaDocument` return site) and filtered
    `parseDiscoveredTheta`'s drop arm against it by object identity
    (`src/extension/production-composition.ts:2444–2448`). §Residuals item 2
    of that fix record
    (`docs/bugs/0255-…md:350–356`) scopes the re-parse walks OUT — "a malformed
    `.theta` that is BOTH discovered and reached as a `tools:` callee /
    imported `.thetalib` still puts its lex rows on the channel once per
    parsing walk … Pre-existing, byte-untouched here, filing material for a
    separate report." This report is that filing.
  - [0013](./0013-load-warnings-dropped-by-both-production-sinks.md) —
    **fixed (0.24.0)**. Its residual list records that imported `.thetalib`
    parse **warnings** are discarded by `import-static-checks.ts`'s
    registration-error filter. That is the dual defect (warnings dropped) on
    the same walk; this report is about error rows delivered more than once and
    does not change the warning filter.

## Summary

`lexTheta` delivers its own diagnostic batch through the V7d seam
(`emitDiagnosticBatch`, `src/lexer/lexer.ts:131`) and then returns the same
array (`:133`). Every caller that parses a file therefore causes one delivery
of that file's lex rows, whether or not the caller reads
`document.diagnostics`. A `.thetalib` is parsed once per importing `.theta`
(`checkThetaImports` caches per call, not per pass), and a `.theta` reached as
a `tools:` callee is parsed again by the callee walks on top of its own
discovery parse. Bug 0255's identity filter removes the second delivery at one
site only — `parseDiscoveredTheta`'s drop arm — so at HEAD:

| Fixture (one load pass) | Notes on the channel | Deliveries of the lex row |
| --- | --- | --- |
| `.thetalib` with one lex error, ONE importer | 3 | 2 |
| Same `.thetalib`, TWO importers | 6 | 4 |
| Same `.thetalib` imported by a subagent-mode callee reached from a caller's `tools:` | 4 | 3 |
| Malformed `.theta` both discovered AND named by a caller's `tools:` | 5 | 2 |

## Reproduction

Scratch harness `b0264scratch` (removed after the sweep), modelled on
`tests/lex-drop-single-delivery.test.ts`: host doubles recording
`pi.sendMessage`, `composeExtensionInstance(pi, ctx, undefined, new
RendererGate())` over a temp workspace with `.pi/settings.json = {}` and the
files planted under `.pi/theta/`. Offline, provider-free. The emitting walk is
identified by capturing `new Error().stack` inside the host's `sendMessage`.

Library (`b0264lib.thetalib`) — one lex-phase row
(`theta/parse/unterminated-template`) plus one parse-phase row
(`theta/parse/unsupported-feature`):

```
fn f() {
  let t = `unterminated
  return 1
}
export { f }
```

Importer (`b0264one.theta`, `b0264two.theta`):

```
---
mode: prompt
---
import { f } from "./b0264lib.thetalib"
let a = f()
```

Measured note counts, and the walk each delivery came from:

| Fixture | `theta-system-note` count | `unterminated-template` occurrences | Emitting walks (stack-captured) |
| --- | --- | --- | --- |
| (A) lib + one importer | 3 | **2** | `lexTheta` ← `parseThetaDocument` ← `parseThetaLib` ← `checkThetaImports` (`import-static-checks.ts:340`, `:336`, `:627`); then `emitLoadNoteGroup` ← `sink.emitGroup(importCheck.diagnostics)` (`production-composition.ts:920`) |
| (B) lib + two importers | 6 | **4** | the (A) pair, once per importing `.theta` |
| (C) lib imported by a subagent-mode callee named in a prompt-mode caller's `tools:` | 4 | **3** | the (A) pair, plus `lexTheta` ← `visit` ← `collectCallableClosureSources` ← `resolveCallableClosureHash` (`production-composition.ts:2332`, `:2352`, `:2295`) |
| (D) malformed `.theta` discovered AND named by a caller's `tools:` | 5 | **2** | `lexTheta` ← `parseDiscoveredTheta` (`production-composition.ts:2408`) — its drop-arm duplicate is filtered by 0255 — plus `lexTheta` ← `parseCalleeForTools` ← `resolveThetaToolsAtLoad` (`:1977`, `:1690`) |

In (A) and (B) the parse-phase row (`theta/parse/unsupported-feature`) appears
ONCE per importer, against the lex row's two — the same lex/parse asymmetry bug
0255 measured, at a different pair of sites. In (D) the two deliveries carry
two different renderings of the same file: the discovery walk's
separator-normalised path and the callee walk's Win32-separator path (`…\.pi\theta\b0264bad.theta`),
so a reader cannot collapse them by eye.

## Expected behaviour

One `pi.sendMessage` per file per load pass, carrying that file's full
diagnostic batch: `docs/spec_topics/diagnostics/diagnostic-shape.md:65`. The
rule's unit is the file, so a `.thetalib` reached by two importers and by a
closure walk in the same pass yields ONE note for its rows, and the
`unterminated-template` occurrence count is 1 in every row of the
§Reproduction table. Re-emission is licensed only across passes
(`diagnostic-shape.md:24`). No row is lost: the surviving delivery carries the
registry code and the DIAG-4 Message, and the drop/registration decisions are
unchanged.

## Actual behaviour / root cause

Two independent causes, both downstream of `lexTheta` emitting on its own.

1. **The lexer's emit fires once per parse, and the walks re-parse.**
   `lexTheta` calls `emitDiagnosticBatch(diagnostics, deps)`
   (`src/lexer/lexer.ts:131`) whenever the file has lex rows, then returns them
   (`:133`). `parseThetaDocument` invokes it at `src/parser/theta-document.ts:904`
   with `deps.systemNote` — the real channel on every production walk. The
   walks that re-parse a file already parsed in the same pass are:
   - `checkThetaImports`' inner `parseThetaLib`
     (`src/extension/import-static-checks.ts:336–345`, parse at `:340`). Its
     `parseCache` (`:325`) is constructed per `checkThetaImports` call, so it
     dedups within one importer and not across importers — cause of the (A)→(B)
     doubling.
   - `collectCallableClosureSources`' `visit`
     (`src/extension/production-composition.ts:2332`), which "re-parses each
     closure member on its own and never reads `document.diagnostics`" (its own
     comment, `:2338–2339`).
   - `parseCalleeForTools` (`:1977`), `resolveCalleeArity` (`:1507`) and
     `parseCalleeTheta` (`:2246`) — all three parse the callee and then read
     only `document.frontmatter` / `hasLoadParseError(document.diagnostics)`,
     discarding the array.
2. **The import-check drop group re-delivers what the lexer already
   delivered.** `checkThetaImports` copies each registration-error row of the
   parsed lib into its returned `diagnostics`
   (`src/extension/import-static-checks.ts:631–635`, filter at `:218`), and
   `runComposePass` emits that array wholesale: `sink.emitGroup(importCheck.diagnostics)`
   (`src/extension/production-composition.ts:920`). Those are the SAME
   `Diagnostic` objects the lexer already put on the channel one call earlier.
   This is bug 0255's shape exactly — route 1 plus a drop-group
   re-delivery — at a drop arm 0255 did not touch.

Bug 0255's exclusion does not reach either cause. The
`deliveredDiagnostics` field is populated at `parseThetaDocument`'s return
(`src/parser/theta-document.ts:848–853`) and is read at exactly one place in
the tree — `parseDiscoveredTheta`'s drop arm
(`src/extension/production-composition.ts:2444–2448`), which filters
`document.diagnostics` against it before returning `{ dropped }`. The import
check never constructs that filter (it partitions by
`isRegistrationError`, a severity/code test, not by identity), and the three
discarding callee walks have no drop group to filter at all: for them route 1
IS the delivery, which is why 0255's route adjudication rejected silencing the
lexer.

## Why it matters

- The note count stops being a problem count. In (B) an author fixing one
  unterminated template reads four identical lines and cannot tell whether the
  library is broken once or four times.
- The multiplier grows with the project: one shared `.thetalib` imported by
  *n* thetas costs 2*n* deliveries of every one of its lex rows, and a callee
  chain adds one more per closure walk.
- The duplicated rows are indistinguishable from genuinely distinct rows in the
  transcript except by exact-string comparison, and in (D) not even by that,
  because the two walks spell the same path differently.
- The asymmetry misleads: the parse-phase rows of the same file appear once, so
  the author sees a batch in which some codes repeat and others do not, with no
  rule that explains which.

## Non-goals

- **Bug 0255's landed primary-parse dedup.** The `deliveredDiagnostics` field,
  its single write site, and the identity filter in `parseDiscoveredTheta`'s
  drop arm stay as they are. Not reopened, not re-routed, not replaced by a
  code-prefix test. `tests/lex-drop-single-delivery.test.ts` and the exact-one
  assertion in `tests/live/unterminated-template-registration-live-cell.test.ts`
  are protected witnesses of that fix and must stay green unmodified.
- **The V7d producer seam contract** (`src/lexer/lexer.ts:7–9`, `:88–90`;
  `tests/lexer-core.test.ts`' seam assertions). Making `lexTheta` a pure
  returner is 0255 §Fix candidate 1, rejected on the record; it is out of scope
  here for the same reason (route 1 is the only delivery for the discarding
  callers, so silencing it drops rows).
- **Imported `.thetalib` warning rows.** `isRegistrationError`
  (`src/extension/import-static-checks.ts:218`) drops warnings from the
  importer's group; that is bug 0013's recorded residual, and this report does
  not widen or narrow the filter.
- **Cross-pass re-emission.** `diagnostic-shape.md:24` licenses it; a
  watcher-triggered reload must still re-deliver.
- **The (D) path-spelling divergence** (normalised vs Win32 separators for the
  same file across two walks). Observed here as evidence; it is a separate
  subject and is not fixed by making the delivery single.

## Fix

Deliver each file's lex rows once per load pass, from any walk, without losing
a row on the walks that discard `document.diagnostics`.

Constraints on any route:

1. **No silent drop.** Every row that reaches the channel today must still
   reach it, with its registry code and DIAG-4 Message. The four callers that
   read only `hasLoadParseError` have route 1 as their sole delivery; a fix
   that suppresses route 1 on those walks must first prove another site
   delivers.
2. **Batching preserved.** The surviving delivery for a multi-row file is one
   note carrying the rows blank-line separated in source order
   (`diagnostic-shape.md:63`/`:65`), not a per-row fan-out.
3. **0255's filter untouched** (see §Non-goals) and its witnesses green.
4. **No-op-channel callers unaffected.** The `lexTheta` / `parseThetaDocument`
   callers that pass an inert channel (`src/parser/theta-document.ts:1353`,
   `:1382`, `:8643`) must keep emitting nothing.
5. **Cross-pass re-emission preserved** — the dedup scope is one
   `composeExtensionInstance` pass, and a second pass over a still-broken file
   re-delivers (`diagnostic-shape.md:24`).
6. **Witness.** A default-suite offline test driving `composeExtensionInstance`
   over the four §Reproduction fixtures, asserting EXACT occurrence counts (1
   per row per pass) plus a presence oracle per row that reds on a silent drop
   — the shape of `tests/lex-drop-single-delivery.test.ts`, in a new file, that
   file being 0255's protected witness.

Candidate dedup points, adjudicable in-run:

- **The import-check drop group** — extend 0255's route: have
  `checkThetaImports` carry the parsed lib's `deliveredDiagnostics` out beside
  its `diagnostics` (or filter before pushing at
  `src/extension/import-static-checks.ts:631–635`), and let `runComposePass`'
  `sink.emitGroup(importCheck.diagnostics)` (`:920`) emit only the undelivered
  remainder. The natural extension of the landed pattern, same identity test.
  Fixes (A) at one delivery per importer; does not by itself fix (B), (C) or
  (D), where the surplus comes from a second *parse*, not a second emit of one
  parse.
- **A pass-scoped parse cache.** Give the compose pass one
  `Map<absolutePath, ThetaDocument>` that every walk consults —
  `parseThetaLib`, the closure `visit`, `parseCalleeForTools`,
  `resolveCalleeArity`, `parseCalleeTheta`, `parseDiscoveredTheta` — so a file
  is parsed once per pass and route 1 fires once by construction. Covers (A)
  through (D) uniformly and removes redundant I/O and parsing, but introduces
  pass-scoped state threaded through six call sites and must not let a cached
  document outlive its pass (hot reload re-parses).
- **A pass-scoped delivered-set in the channel** — suppress a second delivery
  of the same `(file, range, code)` within one pass. Route-agnostic, covers any
  future duplicating producer; this is 0255 §Fix candidate 3, rejected there
  for adding state to a stateless seam, and the same objection applies. It also
  has to be scoped so the reload path still re-delivers (constraint 5).

Ordering: none. This report does not block on, and is not blocked by, another
open report; the 0255 fix it extends has landed.

## Provenance

Filed from bug 0255's fix record, §Residuals item 2
(`docs/bugs/0255-lex-phase-diagnostics-double-deliver-on-dropped-theta.md:350–356`),
which names the callee / `.thetalib` re-parse walks as out of that route's
scope and as filing material for a separate report; the same residual appears
as item 2 of `.pi/tmp/fixes/0255-report.md` §Residuals and as review residual
R3 of that run. Reproduced independently at HEAD `a6816b96` (v0.258.0) with the
`b0264scratch` harness of §Reproduction, which established the per-importer
scaling, the emitting-walk attribution by captured stack, and the (D)
path-spelling divergence. Fifteenth set of bug 0255's lane find.
