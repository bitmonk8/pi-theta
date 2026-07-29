# Bug 0030 — No assertion in either live suite tests stderr-line presence: the `theta hot-reload quiesced:` line and slug-less `system-note delivery failed:` cascades the 0018/0021/0022 fix records cite as live regression evidence pass all nine H9a areas green, and H8a captures no stderr at all; and three live test files still declare the fixtures-absent "INTENDED-REASON RED" that was resolved the day the fixtures landed

- **Status:** open
- **Kind:** defect — test infrastructure, two defects across the two live
  suites (two-defect report per the bug-0002/0023 precedent), both against the
  suites' *documented* gating role rather than against runtime behaviour.
  (1) **Gate gap:** no assertion in either live suite tests whether a
  theta-owned stderr *line* is present. H9a
  (`tests/live/acceptance/noninteractive-acceptance.test.ts`) is the only
  always-run black-box capture of the real `pi -p` process tree's stderr.
  Three of its assertions read `result.stderr`: `assertCodesSubsetOfPermitted`
  (all nine areas — extracts `theta/{load,parse,runtime}/<slug>` substrings
  and checks them against the permitted-code list) and area (e)'s two extra
  checks (`/cancel|aborted/i`, `theta/runtime/internal-error` absence). All
  three score *content*, none scores line presence. H8a
  (`tests/live/live-production-acceptance.test.ts`) reads stderr nowhere and
  has no capture mechanism, although the bug-0018 fix record cites its
  "0-byte stderr capture" as the live verification observable. Of the stderr
  observables the 0018/0021/0022 fix records cite, only a cascade quoting a
  non-permitted code (nine areas) or quoting `theta/runtime/internal-error`
  (area (e) alone) can red anything. The PIC-67 quiesce line (bug 0021's live
  regression observable) and any slug-less or permitted-slug
  `system-note delivery failed:` cascade pass H9a 10/10 green and are
  invisible to H8a.
  (2) **Stale intended-red headers:** three file headers still declare
  `INTENDED-REASON RED (current state)`. The two H9a headers claim every area
  reds on fixture absence, deterministically and token-free — a state resolved
  on 2026-07-03, 1 h 48 min after the header was written, when the paired H9a
  commit authored all nine fixtures. The H8a header claims the shipped
  composition root registers no `.theta`-derived slash command — false since
  the paired H8a wired `composeInstance`. Per AGENTS.md §"Expect documented
  correct-reason reds", red documentation is workflow-bearing; these headers
  misstate their suites' current state in the direction that invites
  misattributing a genuine red.
- **Affected** (at `0.32.0`, `b542dafe`):
  - `tests/live/acceptance/noninteractive-acceptance.test.ts` (H9a-T, 490
    lines) — `assertNoErrorExit` (:100–107, exit code only; stderr appears in
    the failure *message* at :104, gating nothing);
    `assertCodesSubsetOfPermitted` (:109–121, the nine-area stderr-sensitive
    gate — :114 concatenates `result.stdout + "\n" + result.stderr` and scans
    for code slugs), called at ten sites (:143, :171, :213, :266, :332, :369,
    :393, :420, :447, :459 — area (i) spawns twice); area (e)'s two extra
    checks (:333–337 `/cancel|aborted/i`, :340–345 `internal-error` absence —
    area (e) only). :104, :114, :334, :336, :340 are every read of
    `result.stderr` in the file. Stale header :20–27; stale echoes :57–62 (a
    JSDoc block documenting nothing — `parseJsonAfterSentinel` carries its own
    block at :63 and `requireAuthoredTheta` is defined at :84), :88 ("the
    runner and thetas are absent today" failure text), :468 ("the nine
    feature-area tests above carry the intended-reason reds"). The header's
    invariant list at :10 still names "observed subagent cancellation
    propagation with committed turns unmutated", which the (e) block at
    :304–309 relocates to `tests/production-subagent-query-model.test.ts`.
  - `tests/live/acceptance/harness.ts` (H9a-T) — `parseSystemNoteCodes`
    (:455–459, the slug regex), `spawnPiPrint` (:383, stderr accumulated at
    :431–433 and resolved into the result at :450; no assertion in the harness
    consumes it). Stale header :12–19; stale echoes :212 (`FEATURE_THETAS`
    doc), :315 (`resolveFeatureThetaPath` doc), :337 ("Live-host precondition
    (asserted only AFTER the intended-reason red)"), :344 (`requireLiveHost`
    doc: "in the current red state the suite never reaches here"). Three
    headers and seven echoes in total across the three files.
  - `tests/live/live-production-acceptance.test.ts` (H8a-T, 560 lines, seven
    `it` blocks) — `rg -n "stderr|console\.error"` returns nothing here and
    nothing in `tests/live/harness.ts`, so the suite has no stderr capture
    mechanism and no `vi.` usage at all. Stale header :12–19 claims the
    shipped composition root "supplies `fixtures: []` and runs no discovery
    walk, so no `.theta`-derived slash command is ever registered by the
    shipped extension"; `src/extension/factory.ts:898–903` passes
    `fixtures: []` *and* `composeInstance: composeExtensionInstance`
    (`src/extension/production-composition.ts:1012`), which runs the
    five-source discovery walk (`discoverThetas`, :409) and installs a
    `rediscover` closure (:1144).
  - `tests/fixtures/h7a/permitted-codes.json` — nine entries; the list
    includes `theta/runtime/internal-error`, so a delivery-failed cascade
    quoting that code passes the subset gate in 8 of 9 areas.
    [Bug 0023](./0023-production-composition-omits-bootstrap-seams.md) mints
    `theta/load/extension-compose-failed`, which must be added here.
  - Contrast surfaces: `tests/live/double-session-start-live.test.ts` (:44
    prefix constant, :99 `vi.spyOn(console, "error")`, :146–154 the zero
    assertion) — the only *live* test asserting zero
    `theta hot-reload quiesced:` lines, and scenario-specific (double
    `bindExtensions`). The default offline suite does assert zero in
    `tests/hot-reload-stale-ctx-replacement.test.ts` (:358–365 the filter,
    :768–771, :845–848, :893–896 the three zero assertions), but only inside
    its own synthetic harness; nothing carries the property to a real host.
    Every other quiesce-touching test asserts *presence*
    (`tests/hot-reload-stale-quiesce-arms.test.ts:85`,
    `tests/hot-reload-stale-ctx-replacement.test.ts:466`/:519,
    `tests/watcher-terminated-recovery.test.ts:252`).
- **Observed at:** `0.32.0` (`b542dafe`), reading-level — offline,
  deterministic; no live run required to observe either defect.
  `git diff --stat b542dafe..HEAD -- tests/ src/` is empty at `4d645f4f`, so
  every citation above holds unchanged at HEAD. The H9a suite's green state at
  current releases is documented in-repo (10/10 at the 0017 and 0022 fix
  verifications).

## Summary

Three shipped fixes use live stderr cleanliness as their regression witness.
Bug 0018 (0.28.0) pinned PIC-67: designed stderr evidence is exactly one
`theta hot-reload quiesced:` line per extension instance, and no
`system-note delivery failed:` cascade; its fix record cites a live run "with
a 0-byte stderr capture" as verification. Bug 0021 (0.30.0) made quiesce-line
count the live observable ("asserting ZERO `theta hot-reload quiesced:`
stderr lines"). Bug 0022 (0.29.0) cites "H9a-T … 10/10 — its permitted-codes
assertion over stdout+stderr would fail on a `system-note delivery failed:`
cascade quoting a non-permitted code" as its live regression witness.

That parenthetical is accurate and it is the widest stderr gate either suite
has. Three H9a assertions read stderr. One runs in all nine areas —
`assertCodesSubsetOfPermitted`, whose predicate is a code-slug extraction:

```ts
export function parseSystemNoteCodes(output: string): readonly string[] {
  const codes = output.match(/theta\/(?:load|parse|runtime)\/[a-z0-9-]+/g) ?? [];
  return Array.from(new Set(codes));
}
```

```ts
function assertCodesSubsetOfPermitted(result, spec): void {
  const permitted = new Set(loadPermittedCodes());
  const emitted = parseSystemNoteCodes(result.stdout + "\n" + result.stderr);
  const outside = emitted.filter((code) => !permitted.has(code));
  expect(outside, …).toEqual([]);
}
```

The other two run in area (e) only: `/cancel|aborted/i` over
`stdout + stderr` (:333–337) and `theta/runtime/internal-error` absence
(:340–345). All three score the *content* of a captured stream; none tests
whether a theta-owned stderr line exists.

`theta hot-reload quiesced:` contains no `theta/<phase>/<slug>` substring
(space after `theta`, not a slash), changes no exit code, and — in the two
detail strings the runtime actually emits (`src/extension/hot-reload.ts:173–177`,
`src/extension/watcher-recovery.ts:145–149`) — carries no `cancel`/`abort`
token either, so it passes all three predicates in every area. A
`system-note delivery failed:` cascade is caught only when the quoted note
content happens to embed a slug outside the permitted list, or (area (e)
alone) `theta/runtime/internal-error`. The suite the fix records present as
the real-host stderr witness cannot red on the defect class's most
characteristic line. Per AGENTS.md §"Verify both directions", a live
assertion that cannot red is worthless — for stderr-line presence, neither
live suite has an assertion that can red.

Separately, three file headers still open with an `INTENDED-REASON RED
(current state)` block. The two H9a ones read:

```
// INTENDED-REASON RED (current H9a-T state): the fuller feature-theta fixtures
// this suite drives — one `.theta` per functionality area (a)–(i) — are NOT yet
// authored (the paired `H9a` implementation authors them and wires the runner's
// per-area observability). `resolveFeatureThetaPath` therefore returns
// `undefined` for every area, and each test reds on its own primary
// fixture-presence assertion BEFORE any live host, credential, or spawned `pi`
// process is required — so the red is deterministic, token-free, and for the
// intended reason (runner/theta absent), not a credential/network/setup throw.
```

Every clause is false at HEAD: all nine fixtures exist under
`tests/live/acceptance/fixtures/` (11 files, including the `acc-child.theta`
and `acc-lib.thetalib` support files), the suite spawns real `pi -p`
processes, burns tokens, and is documented green 10/10. The H8a one
(`tests/live/live-production-acceptance.test.ts:12–19`) is stale by the same
mechanism and the same magnitude: it declares the shipped composition root
registers no discovered command, while `factory.ts:898–903` passes
`composeInstance: composeExtensionInstance` and that pass runs the discovery
walk.

## Reproduction

Reading-level, offline, deterministic.

**Gate gap.** Enumerate every read of `result.stderr` in the H9a suite (:104
and :336 are failure-message interpolations; :114, :334, :340 are the gates),
and confirm H8a has none: `rg -n "stderr|console\.error"
tests/live/live-production-acceptance.test.ts tests/live/harness.ts` returns
nothing. Feed the H9a predicates the designed stderr lines of the three fixes:

| synthetic stderr line | extracted codes | nine-area subset gate | area (e) only |
| --- | --- | --- | --- |
| `theta hot-reload quiesced: This extension ctx is stale…` (PIC-67 clause (b), `STALE_QUIESCE_STDERR_PREFIX`) | `[]` | no | no |
| `system-note delivery failed: theta /greet returned Err: …` (cascade quoting a slug-less SLSH-3 note) | `[]` | no | no |
| `system-note delivery failed: theta/runtime/internal-error: …` | `[theta/runtime/internal-error]` — permitted | no | **yes** |
| `system-note delivery failed: theta/runtime/registry-swap-failed: …` | non-permitted | **yes** | no |
| `theta hot-reload rebuild rejected: …` (0.28.0 debouncer arm) | `[]` | no | no |

Row 4 is the one shape the 0022 record claims. Row 3 reds in one area of
nine. Rows 1, 2 and 5 red nowhere. Verified by executing the regex plus the
permitted-list filter over these strings (node one-liner; predicates
reproduced verbatim from harness.ts:455–459 and test:109–121). All three
source strings are real: `STALE_QUIESCE_STDERR_PREFIX` at
`src/extension/stale-ctx.ts:44`, emitted at :66;
`system-note delivery failed:` at `src/extension/system-note-channel.ts:237`
and :314; `theta hot-reload rebuild rejected:` at
`src/extension/reload-debounce.ts:205`.

Suite size is confirmable token-free:

```
npx vitest run --config config/vitest/vitest.live.config.ts \
  tests/live/acceptance/noninteractive-acceptance.test.ts \
  -t "enumerates exactly the nine"
# 10 tests | 9 skipped — 1 passed, ~0.9 s
```

The 10/10 figure is 9 area tests plus the manifest self-check at :471–490.

**Stale headers.** Two commits ever introduced the string, one per
banner-bearing suite:

```
git log --oneline -S "INTENDED-REASON RED" -- tests/
# c4cd4ac0 H9a-T — non-interactive pi -p real-host acceptance suite (tests)
# 7d19dc2f H8a-T — live production end-to-end acceptance tests (opt-in test:live suite)
```

Both wrote their banner truthfully at the time. No commit has amended either
substance since:

```
git log --oneline -G "INTENDED-REASON RED" -- tests/
# 2bc69157 Rename Loom -> Theta across the corpus
# c4cd4ac0 …
# 7d19dc2f …
```

`2bc69157` is a corpus-wide identifier rename. Restricting the pathspec to
`tests/live/acceptance/` returns only `a6a5953e` (the suite restructure move),
so the pre-rename path is required to see the origin:
`git show c4cd4ac0:tests/acceptance/harness.ts` carries the identical header
text. `c4cd4ac0` landed 2026-07-03 09:02; `fed12acd` (H9a) authored all nine
fixtures the same day at 10:50
(`git log --follow tests/live/acceptance/fixtures/acc-prompt-sentinel.theta`)
and turned the suite designed-green.

The later genuine red on the H9a suite — bug 0017 kept area (c) red with a
pinned signature (`ACC TYPED INLINE RESULT null`) until 0.27.0 (`fa58456b`,
which touched no acceptance file) — was documented through AGENTS.md
§correct-reason-reds and the 0017 report, not through this header; during that
episode the header attributed the suite's red to fixture absence, the wrong
reason, with the wrong signature.

## Expected behaviour

- Bug 0018 §Fix "Verification" and CHANGELOG 0.28.0: live verification is a
  run "with a 0-byte stderr capture — zero `system-note delivery failed:`,
  zero `registry swap failed`". Bug 0021 §Verification and CHANGELOG 0.30.0:
  the live observable is "ZERO `theta hot-reload quiesced:` stderr lines".
  Bug 0022 §Fix "Live witness" and CHANGELOG 0.29.0 assign H9a-T the
  live-regression-witness role over stdout+stderr. AGENTS.md tells developers
  to re-run the relevant live tests after touching a live-exercised surface or
  fixing a witnessed bug — for these three fixes a green live re-run should
  therefore re-establish the stderr-cleanliness property the records cite, and
  per the bidirectionality convention the witnessing assertion must be able to
  red.
- AGENTS.md §"Expect documented correct-reason reds": red documentation is
  read and trusted ("check `docs/bugs/` for an open report whose signature
  matches"); an in-file INTENDED-RED declaration is the same mechanism one
  layer closer to the reader and must describe a red that exists.

## Actual behaviour / root cause

**Gate gap.** The H9a invariant set was designed as "no-error exit + emitted
codes ⊆ permitted list" (its header, criterion (e) of the retired Phase-1 gate
leaf); stderr was folded into the *code-slug* scan (:114 concatenates
`result.stdout + "\n" + result.stderr`) so a diagnostic that happens to
surface on stderr is still code-checked. Area (e) later added two checks over
the same concatenation, both scoring the subagent success terminal rather than
stream cleanliness. Nothing was added when the 0018/0021/0022 fixes made
*stderr-line presence itself* the regression observable: quiesce lines and
delivery-failed cascades are prefix-marked plain lines, not
`theta/<phase>/<slug>` diagnostics, so the slug regex is blind to them by
construction. The zero-quiesce assertions that do exist are either offline and
synthetic (`tests/hot-reload-stale-ctx-replacement.test.ts`) or live and
scenario-bound to a double `bindExtensions`
(`tests/live/double-session-start-live.test.ts:146–154`).
`live-production-acceptance.test.ts` asserts nothing about stderr and captures
none, so its recorded "0-byte stderr capture" was a fix-run observation, never
a coded gate.

**Stale headers.** The two H9a headers (and their seven in-file echoes)
described the scaffolding state and were never maintained across `fed12acd`
(fixtures authored), the 0017 red-then-green episode, or the (e)-area rewrite
— the test-file invariant list at :10 still names "observed subagent
cancellation propagation", which the (e) block at :304–309 explicitly moved to
`tests/production-subagent-query-model.test.ts`. The H8a header
(`live-production-acceptance.test.ts:12–19`) described the pre-`composeInstance`
composition root and was never maintained across the paired H8a. Today each
header tells a reader to expect a red that no longer exists; because each is
phrased as the *current* state, any genuine future red in these files surfaces
under a banner declaring reds here intended — survivable only by comparing
failure signatures, which the banners' blanket framing discourages. The H9a
pair also undermines §"Run it liberally": a reader trusting the header
concludes the suite spends no tokens and gates nothing live, contradicting the
CHANGELOG's use of the same suite as a live regression witness.

## Why it matters

- Regressions in exactly the machinery the three fixes shipped stay green
  today. Concretely: a false-positive stale-probe detection that quiesces the
  watcher on every ordinary `pi -p` run (hot reload dead in production; one
  quiesce line per run) passes 10/10; a reintroduced 0021-class leak whose
  superseded watcher emits quiesce lines during acceptance runs (quiesce-line
  inflation past the PIC-67 one-line pin) passes; a delivery-failed cascade
  quoting a permitted slug or a slug-less note passes everywhere except area
  (e). H9a is the only always-run suite that captures the real spawned process
  tree's stderr — the natural and documented home for these witnesses — and
  H8a is where bug 0018's own cited observable lives.
- The stale headers misdirect the documented correct-reason-reds workflow in
  both directions: expect a red that is not there; and, when a real red
  appears, an in-file "current state" claim that it is intended. Three files
  carry the claim, two of them the entry points a developer reads first.

## Fix

Three parts, one commit. Part 1's exact predicate is fixed by measurement
before it is written.

**1. A per-area stderr gate across all nine H9a areas.** Add one assertion,
`assertStderrClean(result, spec)`, exported from
`tests/live/acceptance/harness.ts` — which already imports from `src/**`
(`src/seams/schema-validator` at :29, `src/binder/binder-envelope` at :33,
`src/runtime/subagent-launcher` at :38), so importing
`STALE_QUIESCE_STDERR_PREFIX` from `src/extension/stale-ctx.ts` there needs no
new precedent. Call it beside `assertCodesSubsetOfPermitted` at all ten call
sites (:143, :171, :213, :266, :332, :369, :393, :420, :447, :459 — area (i)
spawns twice). Every spawned run is gated, so a regression that manifests only
under one spawn shape (subagent-mode, CLI-source discovery) reds where it
happens. No tenth area is added: the `(a)–(i)` manifest self-check (:471–490)
and the `FEATURE_THETAS` contract (`harness.ts:214`) are unchanged. A single
dedicated gating area would reinstate a narrower version of the same gap and
force a manifest contract change for no coverage gain.

**Measure the baseline, then apply the rule.** Run the nine areas once and
record the captured stderr verbatim in this document under §Fix as "Measured
baseline (`<sha>`, `<date>`)". Then:

- Baseline empty for all ten spawns → the gate asserts an **empty capture**,
  with a committed allowlist that ships empty. This is the 0018 record's own
  observable and the strictest form.
- Baseline carries host noise not owned by theta (node or provider warnings)
  → the gate is **three-prefix rejection**: reject
  `STALE_QUIESCE_STDERR_PREFIX`, `system-note delivery failed:`, and
  `theta hot-reload rebuild rejected:`, and let other content through.
  Immune to host noise; leaves any future theta stderr line class ungated,
  which the doc comment must say.

An allowlist entry is admissible only if it appears in the recorded baseline.
Populating an allowlist reactively from a first red is forbidden: it degrades
the empty-capture gate into the prefix gate without the record saying so.
Import `STALE_QUIESCE_STDERR_PREFIX` rather than re-literalising it; the other
two prefixes are bare literals at their emit sites
(`system-note-channel.ts:237`, :314; `reload-debounce.ts:205`) and stay
literals here unless those sites gain exported constants.

The new assertion is **orthogonal** to `assertCodesSubsetOfPermitted`, and its
doc comment states the separation: it rejects *delivery-mechanism prefixes*
regardless of which code they quote, while the permitted list keeps governing
note *content*. The two do not contradict on `theta/runtime/internal-error` —
that code is sanctioned as note content on stdout, and the same code arriving
inside a `system-note delivery failed:` cascade on stderr is a defect the new
gate rejects in all nine areas. Area (e)'s two extra checks (:333–337,
:340–345) stay untouched; they score the subagent success terminal, a
different property.

**2. A `console.error` spy gate in H8a.** In
`tests/live/live-production-acceptance.test.ts`, mirror
`tests/live/double-session-start-live.test.ts`: `vi.spyOn(console, "error")`
(:99 there), `mockRestore()` in teardown (:67 there), and the zero assertion
over the filtered calls (:146–154 there), filtering for the same three
prefixes and asserting the filtered list is empty. The file currently has no
`beforeEach`/`afterEach` and no `vi.` usage, so the install/restore pair is
new. This puts a coded gate exactly where bug 0018's cited "0-byte stderr
capture" observable lives. An in-process spy sees only theta's own writes, so
this gate has no host-noise exposure and needs no baseline measurement.

**3. Delete or correct the three stale headers and the seven echoes.**
Headers: `tests/live/acceptance/harness.ts:12–19`,
`tests/live/acceptance/noninteractive-acceptance.test.ts:20–27`,
`tests/live/live-production-acceptance.test.ts:12–19`. Echoes:
`harness.ts:212`, :315, :337, :344; test:57–62, :88, :468. Replace with the
current contract — fixtures committed, suites green, correct-reason reds
tracked through `docs/bugs/` per AGENTS.md §"Expect documented correct-reason
reds". Reconcile the H9a test-file invariant list at :10 with the (e) rewrite:
drop "observed subagent cancellation propagation with committed turns
unmutated" and point at `tests/production-subagent-query-model.test.ts`, as
the (e) block at :304–309 already does. The JSDoc at :57–62 documents nothing
(`parseJsonAfterSentinel` has its own block at :63; `requireAuthoredTheta` is
at :84) — delete it or reattach it to `requireAuthoredTheta`. AGENTS.md
§correct-reason-reds needs no change; the mechanism is sound and these three
instances are stale. Defect (2) is comment text and gets no automated guard; a
lint rule banning `INTENDED-REASON RED` in files whose paired implementation
has shipped is a separate filing.

**Permitted-code list.**
[Bug 0023](./0023-production-composition-omits-bootstrap-seams.md) mints
`theta/load/extension-compose-failed` and must add it to
`tests/fixtures/h7a/permitted-codes.json`. The two fixes are independent;
whichever lands second writes the row into the same nine-entry list. 0023's
two-tier sink ends at `console.error`, so after it lands a bootstrap failure
during an acceptance run surfaces on stderr. Under the empty-capture form that
reds the new gate, and that is the correct signal, not noise to allowlist.

**Regression coverage.** An offline unit test in the **default** suite proves
both directions with zero tokens: feed the five synthetic stderr strings from
§Reproduction to the new assertion and to `parseSystemNoteCodes`, asserting
that rows 1, 2 and 5 red the new gate while passing
`assertCodesSubsetOfPermitted`, and that row 4 reds both. The gate's own
correctness is then guarded by `npm test`, and the live axis needs exactly two
runs: one for the part-1 baseline measurement, one after the gate lands to
confirm green. The live red-proof AGENTS.md §"Verify both directions" demands
is satisfied offline, so no token-burning injection run is required.

**Not covered.** This gate witnesses a 0021-class regression: a superseded
generation's watcher surviving into a live acceptance run writes
`theta hot-reload quiesced:` to stderr, which the gate rejects. It does **not**
witness
[bug 0029](./0029-throwing-supersession-detach-swallowed-watcher-rearmed.md)
or [bug 0023](./0023-production-composition-omits-bootstrap-seams.md). Both are
silence defects: 0029's leak yields "total silence — no diagnostic is
constructed, no system note is sent, no stderr line is written" (0029
§Summary), and 0023's bootstrap diagnostics yield "no transcript note, no
toast, and no stderr line" (0023 §Summary). A stderr gate cannot red on an
absent line. Neither bug's fix depends on this one and this one covers
neither.

**Ordering.** Independent of the other open bugs; the only coupling is the
permitted-codes row 0023 adds.

## Provenance

- Origin: the bug-0022 fix (`ea5de328`) stage-4 verifier, whose two
  observations — "H9a-T has no blanket empty-stderr assertion (a bare
  `theta hot-reload quiesced:` line would not trip it), and its file-header
  'INTENDED-REASON RED' comment is stale" — were recorded only in that fix
  run's report; this filing is their durable record.
- Gate-gap evidence: `tests/live/acceptance/harness.ts` :383, :431–433, :450,
  :455–459; `tests/live/acceptance/noninteractive-acceptance.test.ts`
  :100–121, :333–345 (all reads of `result.stderr` enumerated);
  `tests/live/live-production-acceptance.test.ts` and `tests/live/harness.ts`
  (no stderr read, no capture); predicate behaviour reproduced offline against
  the synthetic lines in §Reproduction; permitted list
  `tests/fixtures/h7a/permitted-codes.json`; emit sites
  `src/extension/stale-ctx.ts:44`/:66,
  `src/extension/system-note-channel.ts:237`/:314,
  `src/extension/reload-debounce.ts:205`, with the emitted detail strings at
  `src/extension/hot-reload.ts:173–177` and
  `src/extension/watcher-recovery.ts:145–149`.
- Documented-witness claims: bug 0018 §Fix "Verification" :109–112 ("0-byte
  stderr capture"), bug 0021 §Verification :131–132 / CHANGELOG 0.30.0 :204–206
  ("ZERO `theta hot-reload quiesced:` stderr lines"), bug 0022 §Fix "Live
  witness" :304–307 / CHANGELOG 0.29.0 :277–278 (the permitted-codes
  parenthetical), CHANGELOG 0.28.0 :334–335 ("the H8a acceptance file runs 5/5
  with a 0-byte stderr capture"; the file carries seven `it` blocks at HEAD);
  AGENTS.md §"Run it liberally", §"Expect documented correct-reason reds",
  §"Verify both directions".
- Header history: `c4cd4ac0` (H9a-T, header written, fixtures absent,
  2026-07-03 09:02), `fed12acd` (H9a, fixtures authored, 2026-07-03 10:50),
  `7d19dc2f` (H8a-T, the third banner, 2026-07-02),
  `git log -S/-G "INTENDED-REASON RED" -- tests/` (no later substantive
  touch), bug 0017 §Verification :93–97 (the later area-(c) red and its 10/10
  green at `fa58456b`, which modified no acceptance file).
- Shipped-composition evidence for the H8a banner:
  `src/extension/factory.ts:898–903`,
  `src/extension/production-composition.ts:409` (`discoverThetas`), :1012
  (`composeExtensionInstance`), :1144 (`rediscover`).
