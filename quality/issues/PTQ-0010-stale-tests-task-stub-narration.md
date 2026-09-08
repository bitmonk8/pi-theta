---
id: PTQ-0010
title: Eight binder/diagnostics modules carry tests-task stub narration describing implemented functions as inert stubs
lens: D2
status: open
verdict: confirmed
locations:
  - src/binder/system-note.ts:68-69
  - src/binder/system-note.ts:96-97
  - src/binder/system-note.ts:128-129
  - src/binder/system-note.ts:152-153
  - src/binder/system-note.ts:180-181
  - src/binder/provider-error-mapping.ts:23-27
  - src/binder/provider-error-mapping.ts:108-111
  - src/binder/provider-error-mapping.ts:142-143
  - src/binder/provider-error-mapping.ts:368-371
  - src/binder/binder-cancellation.ts:86-87
  - src/binder/retry-taxonomy.ts:33-38
  - src/binder/binder-envelope.ts:22-26
  - src/binder/binder-model.ts:32-36
  - src/binder/compact-transcript.ts:28-30
  - src/binder/compact-transcript.ts:87
  - src/binder/session-context-walk.ts:21-23
  - src/binder/session-context-walk.ts:82-84
  - src/diagnostics/diagnostic.ts:9-11
sites: 18
fix_scope: cross-module
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Eight binder/diagnostics modules carry tests-task stub narration describing implemented functions as inert stubs

## Observation

The repository's paired tests-task/implementation development flow ("V11e-T
declares the seams, the paired V11e leaf fills them in") left behind doc-comment
and module-header narration written for the stub phase. At 18 sites across eight
in-scope files, that narration still describes the current code as inert stubs —
"V11e-T stubs this inertly (returns {@link UNIMPLEMENTED})", "V9j-T stub:
returns a wrong sentinel", "the renderers return the `UNIMPLEMENTED` sentinel",
"behaviours are absent" — while every named function body is fully implemented.
Four of the comments `{@link}` an `UNIMPLEMENTED` symbol that does not exist
anywhere in src/. Sibling files from the same task pairs show the narration was
meant to be updated when the implementation landed (binder-seed.ts, binder-
system-prompt.ts, and system-note.ts's own header all say "fills in"/
"implements" in the past tense).

## Evidence

src/binder/system-note.ts:68-69 (function `sanitizeSystemNoteSubstring`, :71,
implemented at :71-91); the identical claim recurs at :96-97 (`capSystemNote`,
implemented at :99-109), :128-129 (`renderFailureNote`, implemented at
:131-135), :152-153 (`classifyModelContent`, implemented at :155-172, "always
returns `\"present\"`" — it returns `"empty-malformed"` on two branches), and
:180-181 (`renderAmbiguousSuffix`, implemented at :183-186):

```ts
 * V11e-T stubs this inertly (returns {@link UNIMPLEMENTED}); the paired V11e
 * implementation leaf fills in the whitespace collapse/trim.
 */
```

No `UNIMPLEMENTED` symbol exists in src/: grep `UNIMPLEMENTED` over src/ yields
6 hits — the four `{@link UNIMPLEMENTED}` comments above, the retry-taxonomy.ts:34
header quoted below, and prose in src/runtime/subagent-launcher.ts:65 about an
unrelated watchdog. None is a declaration, so the four `{@link}`s resolve to
nothing.

system-note.ts's own module header, updated when V11e landed, contradicts the
five per-function comments (src/binder/system-note.ts:35):

```ts
// V11e fills in these renderers / classifiers (V11e-T declared the seams).
```

src/binder/provider-error-mapping.ts:108-111 (`checkTypedQueryProviderSupport`,
implemented at :113-131 — it returns the real registry diagnostic, not a
sentinel):

```ts
 * V9j-T stub: returns a fixed non-matching sentinel diagnostic so BOTH the
 * unsupported case (expecting the registry code/message) and the supported /
 * no-typed-query cases (expecting `null`) red on their own assertions. The
 * paired V9j implementation fills this in.
```

src/binder/provider-error-mapping.ts:142-143
(`synthesizeUnsupportedProviderTransportError`, implemented at :145-155):

```ts
 * V9j-T stub: returns a wrong sentinel so the paired test reds on its own
 * assertion. The paired V9j implementation fills this in.
```

src/binder/provider-error-mapping.ts:368-371 (`classifyProviderResponse`,
implemented at :373-402 — it never constructs a `CancelledError`):

```ts
 * V9j-T stub: returns a sentinel `CancelledError` (a valid `QueryError` variant
 * the classifier never produces) so every paired classification test reds on its
 * own `kind` / `retryable` / token-count assertion. The paired V9j
 * implementation fills this in.
```

src/binder/provider-error-mapping.ts:23-27 (module header; the four named
behaviours are all present in the file):

```ts
// V9j-T (tests-task) declares these seam shapes and stubs every behaviour-
// bearing function with an inert sentinel result so the failing tests compile
// and red on their own primary assertions (the classification table, the
// context-overflow extraction, the load warning, and the unsupported-provider
// synthesis are all absent). The paired V9j implementation leaf fills them in.
```

src/binder/binder-cancellation.ts:86-87 (`runBinderCallWithCancellation`,
implemented at :89-145 — it issues attempts, forwards the signal, and surfaces
cancellation):

```ts
 * V11j-T stubs this inert: it issues no attempt, forwards no signal, and never
 * surfaces cancellation. The paired V11j leaf implements it.
```

src/binder/retry-taxonomy.ts:33-38 (module header; the renderers return real
strings, `runBinderWithRetries` at :277-305 issues attempts, and
`classifyBinderArgs` at :205-222 reports all three classes):

```ts
// V11f-T (tests-task) declares these seam shapes and stubs every behaviour-
// bearing function inertly — the renderers return the `UNIMPLEMENTED` sentinel,
// `runBinderWithRetries` returns a zero-call sentinel result without issuing any
// attempt, and `classifyBinderArgs` always reports `ok` — so the failing tests
// compile and red on their own primary assertions. The paired V11f
// implementation leaf fills them in.
```

src/binder/binder-envelope.ts:22-26 (module header; all four named behaviours
are implemented in the file):

```ts
// V11c-T (tests-task) declares these seam shapes and stubs every behaviour-
// bearing function with an inert result so the failing tests compile and red on
// their own primary assertions (the bypass classification, envelope schema
// construction, relaxed copy, and distinct template prefixes are all absent).
// The paired V11c implementation leaf fills them in.
```

src/binder/binder-model.ts:32-36 (module header):

```ts
// V11a-T (tests-task) declares these seams and stubs the behaviour-bearing
// functions with inert results so the failing tests compile and red on their own
// primary assertions (the resolution, probe, chain-fallback, recovery-note, and
// BNDR-11 behaviours are absent). The paired V11a implementation leaf fills them
// in.
```

src/binder/compact-transcript.ts:28-30 (module header) and :87 (doc of
`isTranscriptSafeCustomType`, whose implementation is the very next lines,
:89-105):

```ts
// V11b-T (tests-task) declares these seams and stubs the behaviour-bearing
// functions inertly so the failing BNDR-7/8/9 tests compile and red on their own
// primary assertions; the paired V11b implementation leaf fills them in. The
```

```ts
 * The paired V11b implementation implements the out-of-class detection.
```

src/binder/session-context-walk.ts:21-23 (module header) and :82-84 (doc of
`walkSessionContext`, which is itself the implementation, :92-172):

```ts
// V11i-T (tests-task) declares these seams and stubs the walk inertly so the
// failing tests compile and red on their own primary assertions; the paired
// V11i implementation fills the walk in.
```

```ts
 * skip). The paired V11i implementation walks turns newest-to-oldest under the
 * inclusive 8000-token / 20-turn caps and returns the included slice
 * chronological oldest-to-newest.
```

src/diagnostics/diagnostic.ts:9-11 (module header; the three functions are
implemented at :83-155):

```ts
// V7a-T (tests-task) declares the seam shape and stubs the three behaviour-
// bearing functions so the failing tests compile and red on their own primary
// assertions. The paired V7a implementation leaf fills these in.
```

Site count: grep `stubs this inert|stub: returns` over the 15 in-scope files
yields exactly the 9 per-function sites listed above; grep `tests-task` over the
in-scope files yields exactly the 7 module headers listed (retry-taxonomy.ts:33,
provider-error-mapping.ts:23, binder-envelope.ts:22, binder-model.ts:32,
compact-transcript.ts:28, session-context-walk.ts:21, diagnostic.ts:9); the two
"paired implementation" forward references (compact-transcript.ts:87,
session-context-walk.ts:82-84) complete the 18.

## Why this is a problem

Historical narration comments — a named D2 smell. These are not neutral
provenance notes: each asserts a present-tense falsehood about the code it
documents ("stubs this inertly", "returns a wrong sentinel", "issues no
attempt", "behaviours are absent"), so a reader trusting the doc comment of,
e.g., `capSystemNote` is told it returns an `UNIMPLEMENTED` sentinel that does
not exist as a symbol anywhere in src/ (grep evidence above). The scaffolding's
feature has landed: git shows the paired implementation commits (system-note.ts:
`81920b43` V11e-T then `4aaaca0d` V11e; binder-cancellation.ts: `03354bd7`
V11j-T then `09e1740c` V11j; provider-error-mapping.ts implemented across
`30492948` bug-0010 and `9c6e8efc` bug-0065), and the sibling modules from the
same waves updated their narration at that moment — src/binder/binder-seed.ts:19
("V11e fills in the FNV-1a algorithm (V11e-T declared this seam)."),
src/binder/binder-system-prompt.ts:54 ("V11d implements these seams: …"), and
system-note.ts:35 quoted above — proving the stale sites are leftovers, not a
deliberate convention. system-note.ts is internally self-contradictory (header
says filled in; five function docs say stubbed), so at least one of the two
statements is wrong in every reading.

## Suggested direction (non-binding, optional)

Rewrite or delete the stub-phase sentences the way the already-updated siblings
did (binder-seed.ts:19, binder-system-prompt.ts:54, system-note.ts:35): a
one-line past-tense provenance note ("V11e-T declared this seam; V11e
implemented it") or nothing. Comment-only change; no code motion.

## False-positive check

- Current-code contradiction verified per function: read each named function
  body (system-note.ts:71-186, provider-error-mapping.ts:113-402,
  binder-cancellation.ts:89-145, retry-taxonomy.ts:215-305,
  compact-transcript.ts:89-105, session-context-walk.ts:92-172,
  diagnostic.ts:83-155) — every one is implemented; none returns a sentinel or
  is inert.
- `UNIMPLEMENTED` symbol search: grep `UNIMPLEMENTED` over src/ — 6 hits, all
  inside comments (4 `{@link}` sites in system-note.ts, retry-taxonomy.ts:34,
  and unrelated prose at runtime/subagent-launcher.ts:65); no declaration
  exists, so the `{@link}`s dangle. tests/ mentions the word only in its own
  narration comments (e.g. tests/binder-system-note-determinism.test.ts:29),
  never as an imported symbol.
- Deliberate-convention check: the same wave's sibling files updated their
  narration at implementation time (binder-seed.ts:19,
  binder-system-prompt.ts:54, system-note.ts:35), and system-note.ts's header
  contradicts its own function docs — so the stale sites are not a house style.
- Git-history intent: `git log` on system-note.ts shows `81920b43` (V11e-T)
  followed by `4aaaca0d` (V11e implementation); on binder-cancellation.ts
  `03354bd7` (V11j-T) followed by `09e1740c` (V11j); the implementation commits
  left the stub sentences in place rather than recording a decision to keep
  them.
- Scope check: the same pattern exists outside the reviewed set (grep `stubs
  this inert|stub: returns` over src/ shows further sites in parser/, runtime/,
  discovery/, extension/); this finding cites only the 15-file review scope.
- Behavior check: comments only; no code path, test, or tool reads these
  strings (they are not diagnostics registry messages — those live in
  docs/spec_topics/diagnostics/ and in message constants, none of which quote
  this narration).

## Triage
verdict: confirmed — re-read all 18 cited sites (excerpts byte-match at the cited lines) and every named function body is implemented; `grep UNIMPLEMENTED src/` yields exactly 6 comment-only hits with no declaration anywhere in the repo, `stubs this inert|stub: returns` and `tests-task` over the 15 binder+diagnostic files reproduce 9 + 7 sites, and the cited commits (81920b43→4aaaca0d, 03354bd7→09e1740c) plus the updated siblings (binder-seed.ts:19, binder-system-prompt.ts:54, system-note.ts:35) show the stub-phase narration is leftover scaffolding, not house style (triage: claude-opus-5)
