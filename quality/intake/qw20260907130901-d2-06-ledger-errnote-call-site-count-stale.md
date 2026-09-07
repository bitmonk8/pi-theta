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
