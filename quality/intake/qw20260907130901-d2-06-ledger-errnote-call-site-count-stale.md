---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: invoke-provenance-ledger's header says emitTopLevelErrNote has two call sites; the code has one
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/invoke-provenance-ledger.ts:1-6
  - src/extension/theta-composition-producer.ts:580-585
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# invoke-provenance-ledger's header says emitTopLevelErrNote has two call sites; the code has one

## Observation
The invoke-hop provenance ledger's module header motivates the module with a
present-tense claim that "`emitTopLevelErrNote`'s two call sites have no
`ChainHop[]` to build". In the current tree `emitTopLevelErrNote` is called
from exactly one site (theta-composition-producer's top-level `Err` boundary),
and — since this module landed — that site's chain IS built, through this
ledger. Both the count and the "have no `ChainHop[]`" state describe a
pre-fix tree.

## Evidence
src/runtime/invoke-provenance-ledger.ts:1-6:
```ts
// Bug 0088 (slash-invocation.md SLSH-5) — the invoke-hop provenance ledger.
// `recordInvocationProvenance` (`invoke-provenance.ts`) produces one
// `InvocationRecord` per executed `invoke` hop; nothing retains the record
// beside the `invoke_callee` wrapper it belongs to, so `emitTopLevelErrNote`'s
// two call sites have no `ChainHop[]` to build.
```

Search `emitTopLevelErrNote(` across src/, extensions/, tools/: one call site —
src/extension/theta-composition-producer.ts:581-585:
```ts
          if (!terminal.ok) {
            deps.emitTopLevelErrNote(
              theta.slashName,
              terminal.error as unknown as QueryError,
              execution?.originEvent,
            );
          }
```
(The other `emitTopLevelErrNote` hits are the interface declaration,
theta-composition-producer.ts:376, and the implementation,
production-theta-producer.ts:1699 — not calls.) That implementation builds the
chain via this ledger: production-theta-producer.ts:1703
(`chain: this.#ledger?.chainFor(error) ?? []`).

## Why this is a problem
Historical narration comment: the sentence states, in the present tense, a
call-site count ("two") and a gap ("have no `ChainHop[]` to build") that are
both false in the current tree — one call site exists, and its chain is
supplied by the very module carrying the sentence. A reader auditing SLSH-5
coverage from this header is pointed at a second call site that does not
exist and a gap that this module closed.

## Suggested direction (non-binding, optional)
Recast the opening sentence as the module's current role (the retention seam
pairing wrappers with hops for the top-level `Err` boundary), leaving bug 0088
to the bug doc; or at minimum correct the count and tense.

## False-positive check
- Call-site search: `emitTopLevelErrNote(` grepped across src/, extensions/,
  tools/ — one call (theta-composition-producer.ts:581); the declaration
  (:376) and implementation (production-theta-producer.ts:1699) are not calls.
  Test harness calls (tests/b0383-*, tests/b0399-*) invoke the producer method
  directly and are not the boundary call sites the sentence counts.
- Current-state check: the "no ChainHop[] to build" clause is contradicted by
  production-theta-producer.ts:1699-1703, which builds `chain` from this
  ledger at the one boundary call.
- History intent: the sentence narrates bug 0088's pre-fix state (its own
  "Bug 0088" opener); whether two call sites existed then is immaterial — the
  header speaks in the present tense about the current tree.

## Triage
verdict: questionable — the count is verifiably wrong (one call site, theta-composition-producer.ts:581), but git shows "two" was never true (one site at 670875c8 and its parent), so the stale-narration anchor fails and the "no ChainHop[]" clause is the header's own problem statement resolved by its next paragraph; residual is one wrong numeral in prose (triage: claude-opus-5)
verdict: questionable — independently re-verified: every excerpt reproduces at drifted lines (header :1-6 verbatim; the sole production `emitTopLevelErrNote(` call is now theta-composition-producer.ts:601, declaration :395, implementation production-theta-producer.ts:1739 building `chain: this.#ledger?.chainFor(error) ?? []` at :1743; zero hits in extensions/ and tools/); but the drift theory fails on fresh grounds too — `git log -p --follow` on this file shows the opening sentence was written once, at 670875c8, and untouched through both later touching commits (2c1217c4, cc470f20), while the file's OTHER count ("WHICH WRAPPERS CARRY A HOP") was diligently bumped two→three sites in 2c1217c4 (bug 0349) in the same file, so the author revisits counts here and chose not to touch this one — consistent with "two" being a stable paraphrase of docs/bugs/0088:34-44's own "two production call sites" (one of which is emitTopLevelErrNote's own body, not a caller of it) rather than a neglected drift; the "no ChainHop[] to build" clause is the header's own problem statement, answered by its very next paragraph. Real numeral mismatch under a literal reading, but no mechanical decay proof — a wording call for a human. Not a dupe: PTQ-0066/0069 cite this file only in unrelated citation-drift rosters, and PTQ-0153 never mentions it (triage: claude-opus-5)
verdict: questionable — own independent pass concurs: re-grepped `emitTopLevelErrNote(` myself (one production call, theta-composition-producer.ts:601, content-identical since filing) and re-ran the history myself at 670875c8 (the module's birth commit), where the same one-call-site state already held, so "two" never tallied literal call sites of the function and this cannot be framed as decay from a once-true count; docs/bugs/0088-slsh5-chain-suffix-never-emitted.md:34-44, read directly, defines its own "two production call sites" with site 1 named as `emitTopLevelErrNote` itself, which the header sentence plainly paraphrases; "no ChainHop[] to build" is resolved by the header's own next paragraph. A genuine numeral-vs-literal-reading mismatch, not a proven stale-narration defect — a human wording call, and no duplicate on file (triage: claude-opus-5)
verdict: questionable — fourth independent pass, same conclusion: my own grep confirms exactly one production `emitTopLevelErrNote(` call (theta-composition-producer.ts:601) against the declaration (:395) and implementation (production-theta-producer.ts:1739), and `git show 670875c8:...` (the commit that wrote this sentence) already shows only one production call site then too, so the "two" cannot be framed as drift from a once-accurate count; the same file's adjacent "WHICH WRAPPERS CARRY A HOP" count was deliberately bumped two→three in 2c1217c4 and the file was touched again in cc470f20, yet this sentence was left alone both times, and docs/bugs/0088:34-41 independently defines its own "two production call sites" naming site 1 as emitTopLevelErrNote's own body — the load-bearing referent this sentence most plausibly paraphrases; "no ChainHop[] to build" is answered by the header's own next paragraph. The decay theory the filing rests on ("describe a pre-fix tree") is mechanically refuted, leaving only a literal-reading-vs-paraphrase wording dispute — real but not mechanically anchored, and no duplicate found across a fresh sweep of PTQ-0066/0069/0153/0167/0190 (triage: claude-opus-5)
verdict: questionable — fifth independent pass, same result: my own grep across src/, extensions/, tools/, tests/ finds exactly one production `emitTopLevelErrNote(` call (theta-composition-producer.ts:601) against the declaration (theta-composition-producer.ts:395) and implementation (production-theta-producer.ts:1739, building `chain: this.#ledger?.chainFor(error) ?? []` at :1743), every other hit a test-side fake/mock; `git grep` at 670875c8 (the commit that wrote this sentence) shows the identical one-call-site state, so "two" was never a literal tally of emitTopLevelErrNote's callers that later decayed, and `git log -p --follow` confirms these two lines were only ever added once, never revisited in 2c1217c4 or cc470f20 even though those same commits did bump the file's other "two→three" wrapper-construction-sites count; docs/bugs/0088-slsh5-chain-suffix-never-emitted.md:34-41 independently defines its own "two production call sites" (site 1 named as emitTopLevelErrNote's own body invoking renderTopLevelErrNote, site 2 the composition-producer's call to emitTopLevelErrNote) — a plausible paraphrase source under a looser reading of "call site"; "no ChainHop[] to build" is resolved by the header's own next paragraph. Concur with all four priors: a real numeral mismatch under a literal reading, but the filing's own decay/staleness anchor is mechanically refuted rather than proven, leaving a wording call for a human; no duplicate on record (PTQ-0066/0069/0153/0167/0190 cite this file only for unrelated roster/citation issues) (triage: claude-opus-5)
