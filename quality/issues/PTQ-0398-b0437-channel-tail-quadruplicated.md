---
id: PTQ-0398
title: b0437 rebuilds the identical emitDiagnostic/RendererGate/SystemNoteChannelHealth channel tail in four local factory functions
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0437-producer-note-raw-send-fallback.test.ts:169-174
  - tests/b0437-producer-note-raw-send-fallback.test.ts:228-233
  - tests/b0437-producer-note-raw-send-fallback.test.ts:478-483
  - tests/b0437-producer-note-raw-send-fallback.test.ts:502-507
sites: 4                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917045205
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0437 rebuilds the identical emitDiagnostic/RendererGate/SystemNoteChannelHealth channel tail in four local factory functions

## Observation
tests/b0437-producer-note-raw-send-fallback.test.ts declares four local
factory functions that each build a `SystemNoteChannelDeps` value:
`recordingChannel()` (155-176), `stampGuardChannel()` (213-235),
`recordingSystemNoteChannel()` (464-485), and `throwingSystemNoteChannel()`
(490-509). Each function varies its own `pi.sendMessage` (throws vs.
records) and `ui.notify` (records vs. no-ops) to fit its scenario, but all
four close the same object literal with the identical six-line tail —
`emitDiagnostic` pushing onto a same-named `diagnostics` array, a fresh
`rendererGate: new RendererGate()`, and a fresh `health: new
SystemNoteChannelHealth()` — before returning. All four also open with an
identical `const diagnostics: Diagnostic[] = [];` declaration.

## Evidence

tests/b0437-producer-note-raw-send-fallback.test.ts:169-174 (`recordingChannel`'s
closing tail):
```ts
    emitDiagnostic: (diagnostic: Diagnostic): void => {
      diagnostics.push(diagnostic);
    },
    rendererGate: new RendererGate(),
    health: new SystemNoteChannelHealth(),
  };
```

tests/b0437-producer-note-raw-send-fallback.test.ts:228-233 (`stampGuardChannel`'s
closing tail — byte-identical to the excerpt above):
```ts
    emitDiagnostic: (diagnostic: Diagnostic): void => {
      diagnostics.push(diagnostic);
    },
    rendererGate: new RendererGate(),
    health: new SystemNoteChannelHealth(),
  };
```

tests/b0437-producer-note-raw-send-fallback.test.ts:478-483
(`recordingSystemNoteChannel`'s closing tail — byte-identical again):
```ts
    emitDiagnostic: (diagnostic: Diagnostic): void => {
      diagnostics.push(diagnostic);
    },
    rendererGate: new RendererGate(),
    health: new SystemNoteChannelHealth(),
  };
```

tests/b0437-producer-note-raw-send-fallback.test.ts:502-507
(`throwingSystemNoteChannel`'s closing tail — byte-identical again):
```ts
    emitDiagnostic: (diagnostic: Diagnostic): void => {
      diagnostics.push(diagnostic);
    },
    rendererGate: new RendererGate(),
    health: new SystemNoteChannelHealth(),
  };
```

`diff` of all four six-line ranges pairwise (`diff <(sed -n '169,174p' …)
<(sed -n '228,233p' …)`, and likewise for the other four pairings) produces
zero output in every pairing — the six lines are identical across all four
sites, not merely similar. Each function's own `const diagnostics:
Diagnostic[] = [];` declaration (line 157, 216, 470, 494 respectively) is
also byte-identical. Search executed: `grep -n "rendererGate: new RendererGate(),"
tests/b0437-producer-note-raw-send-fallback.test.ts` → exactly 4 hits (the
four cited lines), confirming no fifth or partial occurrence was missed.

## Why this is a problem
The four functions differ only in the two fields that actually vary per
scenario (`pi.sendMessage`'s throw-vs-record behaviour and `ui.notify`'s
record-vs-no-op behaviour); the remaining six-line tail that wires
`emitDiagnostic` to a recording array and attaches a fresh `RendererGate`/
`SystemNoteChannelHealth` pair is written out identically four times in the
same file rather than factored once. This is the "Boilerplate duplication"
class applied within a single file — the same shape this repository's own
resolved PTQ-0376 finding confirmed is valid D7 territory for this exact
suite ("applied within a single file... the same setup/assertion sequence...
is written out twice rather than shared once"). A change to what a fresh
`SystemNoteChannelDeps` needs to carry (e.g. an added required field, or a
different way of marking the gate/health pair "fresh") applied to one of
these four local builders and not the other three would leave some of this
file's cells constructing a stale channel shape while others construct the
updated one, with nothing in the file surfacing the drift.

## Suggested direction (non-binding, optional)
The four local builders differ only in their `pi`/`ui` behaviour; the shared
six-line tail (`emitDiagnostic`/`rendererGate`/`health`) they each end with
is the piece a single shared local helper — parameterised on the two fields
that vary — would need to construct only once, mirroring how this same file
already lets sibling scenario-specific pieces (e.g. `RENAMED_CAT`-style
literal fixtures elsewhere in this review's file set) stay local while
sharing their genuinely-common tails.

## False-positive check
- Gate-pin check: tests/b0437-producer-note-raw-send-fallback.test.ts does
  not match `*gate*.test.ts` or the named kin; none of the four cited tails
  is a pinned count or inventory assertion.
- Recording-double check: `diagnostics`/`notifyCalls`/`sends`/`notes` back
  ordinary recording arrays a test later asserts CONTENTS against (e.g.
  `expect(diagnostics).toHaveLength(1)`), not a MUST-NOT-called negative
  witness; the negative-witness carve-out does not apply to the tail itself,
  which is present in all four regardless of what each test later asserts.
- docs/bugs/ signature search: docs/bugs/0437-producer-note-sites-bypass-fallback-chain.md
  Status "fixed (0.429.0)". `npx vitest run tests/b0437-producer-note-raw-send-fallback.test.ts`
  → 5 passed (5) at HEAD, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0437-producer-note-raw-send-fallback"
  docs/reference/coverage-matrix.md` → 0 hits. `grep -n "recordingChannel\|stampGuardChannel\|recordingSystemNoteChannel\|throwingSystemNoteChannel"
  docs/bugs/0437-producer-note-sites-bypass-fallback-chain.md` → 0 hits (the
  bug doc cites the test file as a whole, never these four builder names).
  This finding proposes no merge, rename, or deletion of any `it()`/
  `describe()` or test file — only that the four local builders' shared tail
  could be factored once — so no citation is disturbed.
- Prior-finding overlap check: `grep -rl "RendererGate\|SystemNoteChannelHealth"
  quality/issues quality/resolved quality/intake` → PTQ-0230, PTQ-0267 (both
  about an unrelated `diagnostic harness` in different test files, b0275 and
  b0320), and PTQ-0326 (`status: fixed`, D4 lens, about
  `src/extension/factory.ts` redeclaring a constant — production code, a
  different file, a different lens). `grep -rl "recordingChannel\|stampGuardChannel\|recordingSystemNoteChannel\|throwingSystemNoteChannel"
  quality/issues quality/resolved quality/intake` → only PTQ-0249 (`status:
  fixed`), re-read in full: its root cause is that test "B1"'s title claims
  "not the raw top-level pi" while the body never reads the SEPARATE
  `recordingPi()` double's `notes` field — an assertion/title mismatch, not a
  claim about the four `SystemNoteChannelDeps` builders' shared construction
  tail being repeated. The two findings' root causes and cited code are
  disjoint (PTQ-0249 cites `recordingPi()` at 511-520 and the B1 test body;
  this finding cites the four builders' 169-174/228-233/478-483/502-507
  tails, none of which PTQ-0249's Evidence touches).
- Coverage-drift check: this finding is about four already-written,
  already-passing local builder functions sharing an identical tail; it does
  not claim any behaviour or path is untested, and the file's 5/5 passing
  tests are unaffected.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all four cited tails (169-174/228-233/478-483/502-507) plus the four `const diagnostics: Diagnostic[] = [];` lines reproduce byte-identical via diff; `rendererGate: new RendererGate(),` greps to exactly 4 hits, and the file's fifth `SystemNoteChannelDeps` literal (parseDeps, line 380) is confirmed legitimately different (omits the optional rendererGate/health fields per system-note-channel.ts:296/304) so no site was missed; docs/bugs/0437 is fixed (0.429.0) with 5/5 green and zero coverage-matrix hits; dedupe search against PTQ-0249 (title/body mismatch on a different double, `recordingPi`), PTQ-0326 (unrelated src/ constant, D4), PTQ-0230/0267 (different test files), and every other tracker hit for SystemNoteChannelDeps confirms disjoint root causes — a real, independently verified D7 boilerplate-duplication finding confined to tests/, matching the confirmed PTQ-0376 precedent (triage: claude-opus-5)
