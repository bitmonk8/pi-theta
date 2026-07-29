# Bug 0030 — The H9a acceptance suite's only stderr gate is the permitted-code-slug regex: the `theta hot-reload quiesced:` line and slug-less `system-note delivery failed:` cascades the 0018/0021/0022 fix records cite as live regression evidence pass it green; and both file headers still declare the fixtures-absent "INTENDED-REASON RED" that was resolved the day the fixtures landed

- **Status:** open
- **Kind:** defect — test infrastructure, two defects on the same suite
  (two-defect report per the bug-0002/0023 precedent), both against the
  suite's *documented* gating role rather than against runtime behaviour.
  (1) **Gate gap:** H9a (`tests/live/acceptance/`), the only always-run
  black-box capture of the real `pi -p` process tree's stderr, has no
  stderr-cleanliness assertion. Its sole stderr-sensitive predicate extracts
  `theta/{load,parse,runtime}/<slug>` substrings and checks them against the
  permitted-code list — so of the stderr observables the 0018/0021/0022 fix
  records cite as live regression evidence, only "a cascade quoting a
  non-permitted code" can red the suite. The PIC-67 quiesce line (bug 0021's
  live regression observable) and any slug-less or permitted-slug
  `system-note delivery failed:` cascade pass 10/10 green.
  (2) **Stale intended-red headers:** both file headers still declare
  `INTENDED-REASON RED (current H9a-T state)` — every area reds on fixture
  absence, deterministic, token-free — a state resolved on 2026-07-03 when
  the paired H9a commit authored all nine fixtures. Per AGENTS.md §"Expect
  documented correct-reason reds", red documentation is workflow-bearing;
  this header misstates the suite's current state in the direction that
  invites misattributing a genuine red.
- **Affected** (at 0.32.0, `b542dafe`):
  - `tests/live/acceptance/noninteractive-acceptance.test.ts` —
    `assertNoErrorExit` (:100–107, exit code only; stderr appears in the
    failure *message*, gating nothing), `assertCodesSubsetOfPermitted`
    (:109–121, the one stderr-sensitive gate), area (e)'s two extra checks
    (:334 `/cancel|aborted/i`, :340–345 `internal-error` — area (e) only).
    No other line reads `result.stderr`. Stale header :20–27; stale echoes
    :57–62 (orphaned `requireAuthoredTheta` doc), :88 ("the runner and
    thetas are absent today" failure text), :468 ("the nine feature-area
    tests above carry the intended-reason reds").
  - `tests/live/acceptance/harness.ts` — `parseSystemNoteCodes` (:455–459,
    the slug regex), `spawnPiPrint` (:383– , captures stderr; nothing gates
    it). Stale header :12–19; stale echoes :212 (`FEATURE_THETAS` doc), :315
    (`resolveFeatureThetaPath` doc), :344 (`requireLiveHost` doc: "in the
    current red state the suite never reaches here").
  - `tests/fixtures/h7a/permitted-codes.json` — the permitted list includes
    `theta/runtime/internal-error`, so a delivery-failed cascade quoting
    that code passes the subset gate in 8 of 9 areas.
  - Contrast surfaces: `tests/live/double-session-start-live.test.ts`
    (:44, :136–151) — the only test anywhere asserting zero
    `theta hot-reload quiesced:` lines, H8a, scenario-specific;
    `tests/live/live-production-acceptance.test.ts` — no stderr assertion
    at all, although the bug-0018 fix record cites its "0-byte stderr
    capture" as the live verification observable.
- **Observed at:** `0.32.0` (`b542dafe`), reading-level — offline,
  deterministic; no live run required. The suite's green state at current
  releases is documented in-repo (10/10 at the 0017 and 0022 fix
  verifications) and was reconfirmed by the run that recorded these
  observations.

## Summary

Three shipped fixes use H9a/live stderr cleanliness as their regression
witness. Bug 0018 (0.28.0) pinned PIC-67: designed stderr evidence is
exactly one `theta hot-reload quiesced:` line per extension instance, and
no `system-note delivery failed:` cascade; its fix record cites a live run
"with a 0-byte stderr capture" as verification. Bug 0021 (0.30.0) made
quiesce-line count the live observable ("asserting ZERO `theta hot-reload
quiesced:` stderr lines" — red-proven at one line). Bug 0022 (0.29.0) cites
"H9a-T … 10/10 — its permitted-codes assertion over stdout+stderr would
fail on a `system-note delivery failed:` cascade quoting a non-permitted
code" as its live regression witness.

That parenthetical is accurate — and it is the *whole* stderr gate. H9a's
stderr participates in exactly one assertion, `assertCodesSubsetOfPermitted`,
whose predicate is a code-slug extraction:

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

`theta hot-reload quiesced:` contains no `theta/<phase>/<slug>` substring
(space after `theta`, not a slash), changes no exit code, and matches
neither of area (e)'s extra predicates — so any number of quiesce lines in
any acceptance run passes all ten tests. A `system-note delivery failed:`
cascade is caught only when the quoted note content happens to embed a
non-permitted slug. The suite that the fix records present as the
real-host stderr witness cannot red on the defect class's most
characteristic line. Per AGENTS.md §"Verify both directions", a live
assertion that cannot red is worthless — for the stderr-cleanliness
property, H9a has no assertion that can red.

Separately, both file headers still open with:

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
`tests/live/acceptance/fixtures/`, the suite spawns real `pi -p` processes,
burns tokens, and is documented green 10/10.

## Reproduction

Reading-level, offline, deterministic.

**Gate gap.** Enumerate every read of `result.stderr` in the suite (the
Affected list is exhaustive: :104 and :336 are failure-message
interpolations; :114, :334, :340 are the gates). Feed the predicate the
designed stderr lines of the three fixes:

| synthetic stderr line | extracted codes | gate trips |
| --- | --- | --- |
| `theta hot-reload quiesced: This extension ctx is stale…` (PIC-67 clause (b), `STALE_QUIESCE_STDERR_PREFIX`) | `[]` | no |
| `system-note delivery failed: theta /greet returned Err: …` (cascade quoting a slug-less SLSH-3 note) | `[]` | no |
| `system-note delivery failed: theta/runtime/internal-error: …` | `[theta/runtime/internal-error]` — permitted | no (area (e) only: yes) |
| `system-note delivery failed: theta/runtime/registry-swap-failed: …` | non-permitted | **yes** |
| `theta hot-reload rebuild rejected: …` (0.28.0 debouncer arm) | `[]` | no |

Row 4 is the one shape the 0022 record claims; rows 1–3 and 5 are the gap.
Verified by executing the regex + permitted-list filter over these strings
(node one-liner; assertions reproduced verbatim from :455–459 / :109–121).

**Stale header.** `git log -S "INTENDED-REASON RED" -- tests/` shows exactly
one commit ever touched the string in this suite: `c4cd4ac0` (H9a-T
scaffolding, 2026-07-03), which wrote it truthfully — fixtures absent.
`fed12acd` (H9a, same day) authored all nine fixtures
(`git log --follow tests/live/acceptance/fixtures/acc-prompt-sentinel.theta`)
and turned the suite designed-green; no commit since has amended either
header. The later genuine red on this suite — bug 0017 kept area (c) red
with a pinned signature (`ACC TYPED INLINE RESULT null`) until 0.27.0
(`fa58456b`, which touched no acceptance file) — was documented through
AGENTS.md §correct-reason-reds and the 0017 report, not through this
header; during that episode the header attributed the suite's red to
fixture absence, the wrong reason, with the wrong signature.

## Expected behaviour

- Bug 0018 §Fix "Verification" and CHANGELOG 0.28.0: live verification is a
  run "with a 0-byte stderr capture — zero `system-note delivery failed:`,
  zero `registry swap failed`". Bug 0021 §Verification and CHANGELOG
  0.30.0: the live observable is "ZERO `theta hot-reload quiesced:` stderr
  lines". Bug 0022 §Fix "Live witness" and CHANGELOG 0.29.0 assign H9a-T
  the live-regression-witness role over stdout+stderr. AGENTS.md tells
  developers to re-run the relevant live tests after touching a
  live-exercised surface or fixing a witnessed bug — for these three fixes
  a green H9a re-run should therefore re-establish the stderr-cleanliness
  property the records cite, and per the bidirectionality convention the
  witnessing assertion must be able to red.
- AGENTS.md §"Expect documented correct-reason reds": red documentation is
  read and trusted ("check `docs/bugs/` for an open report whose signature
  matches"); an in-file INTENDED-RED declaration is the same mechanism one
  layer closer and must describe a red that exists.

## Actual behaviour / root cause

**Gate gap.** The suite's invariant set was designed as "no-error exit +
emitted codes ⊆ permitted list" (its header, criterion (e) of the retired
Phase-1 gate leaf); stderr was folded into the *code-slug* scan
(:114 concatenates `result.stdout + "\n" + result.stderr`) so a diagnostic
that happens to surface on stderr is still code-checked. Nothing was added
when the 0018/0021/0022 fixes made *stderr-line presence itself* the
regression observable: quiesce lines and delivery-failed cascades are
prefix-marked plain lines, not `theta/<phase>/<slug>` diagnostics, so the
slug regex is blind to them by construction. The zero-quiesce assertion
that does exist lives in H8a's dedicated double-`bindExtensions` test and
fires only in that scenario; `live-production-acceptance.test.ts` asserts
nothing about stderr, so its recorded "0-byte stderr capture" was a
fix-run observation, never a coded gate.

**Stale header.** The header (and its six in-file echoes) described the
scaffolding state and was never maintained across `fed12acd` (fixtures
authored), the 0017 red-then-green episode, or the (e)-area rewrite — the
top-of-file invariant list still names "observed subagent cancellation
propagation", which the (e) block explicitly moved to an in-process test.
Today the header tells a reader to expect a red that no longer exists (all
areas, fixture-presence, token-free); because it is phrased as the
*current* state, any genuine future red in this file surfaces under a
banner declaring reds here intended — survivable only by comparing failure
signatures, which the banner's blanket framing discourages. It also
undermines §"Run it liberally": a reader trusting the header concludes the
suite spends no tokens and gates nothing live — contradicting the
CHANGELOG's use of the same suite as a live regression witness.

## Why it matters

- Regressions in exactly the machinery the three fixes shipped stay green
  today. Concretely: a false-positive stale-probe detection that quiesces
  the watcher on every ordinary `pi -p` run (hot reload dead in production;
  one quiesce line per run) passes 10/10; a reintroduced 0021-class leak
  whose superseded watcher emits quiesce lines during acceptance runs
  (quiesce-line inflation past the PIC-67 one-line pin) passes; a
  delivery-failed cascade quoting a permitted slug or a slug-less note
  passes. H9a is the only always-run suite that captures the real spawned
  process tree's stderr — the natural (and documented) home for these
  witnesses.
- The stale header actively misdirects the documented correct-reason-reds
  workflow in both directions: expect a red that is not there; and, when a
  real red appears, an in-file "current state" claim that it is intended.

## Fix options and recommendation

1. **Blanket stderr-cleanliness gate (recommended).** Per area, assert the
   captured stderr carries no theta-owned line — strictest form: an empty
   capture (the 0018 record's own observable), with a committed allowlist
   (empty today) as the escape hatch if real-host noise (node/provider
   warnings) ever appears. Reject at minimum the three known prefixes:
   `STALE_QUIESCE_STDERR_PREFIX` (import the exported constant from
   `src/extension/stale-ctx.ts` rather than re-literalising),
   `system-note delivery failed:`, `theta hot-reload rebuild rejected:`.
   Per AGENTS.md bidirectionality, red-prove once (e.g. inject a synthetic
   quiesce line into a captured result) before trusting green.
2. **Narrow prefix rejection only.** Extend `assertCodesSubsetOfPermitted`
   (or add a sibling assertion) to reject the three prefixes explicitly,
   leaving other stderr content ungated. Immune to host noise; re-opens
   the same gap for any future theta stderr line class — fallback if
   option 1 proves flaky against real hosts.
3. **Delete or correct the stale headers (unconditional, either way).**
   Remove both `INTENDED-REASON RED` blocks and the six stale echoes
   (harness.ts :212, :315, :337/:344; test :57–62, :88, :468), replacing
   them with the current contract (fixtures committed; suite green;
   correct-reason reds tracked via `docs/bugs/` per AGENTS.md). Also
   reconcile the test-file header's invariant list with the (e) rewrite.
   AGENTS.md §correct-reason-reds itself needs no change — the mechanism
   is sound; this instance is stale.

## Provenance

- Origin: the bug-0022 fix (`ea5de328`) stage-4 verifier, whose two
  observations — "H9a-T has no blanket empty-stderr assertion (a bare
  `theta hot-reload quiesced:` line would not trip it), and its file-header
  'INTENDED-REASON RED' comment is stale" — were recorded only in that fix
  run's report; this filing is their durable record.
- Gate-gap evidence: `tests/live/acceptance/harness.ts` :455–459,
  `tests/live/acceptance/noninteractive-acceptance.test.ts` :100–121,
  :334–345 (all reads of `result.stderr` enumerated); predicate behaviour
  reproduced offline against the synthetic lines in §Reproduction;
  permitted list `tests/fixtures/h7a/permitted-codes.json`.
- Documented-witness claims: bug 0018 §Fix "Verification" ("0-byte stderr
  capture"), bug 0021 §Verification / CHANGELOG 0.30.0 ("ZERO
  `theta hot-reload quiesced:` stderr lines"), bug 0022 §Fix "Live witness"
  / CHANGELOG 0.29.0 (the permitted-codes parenthetical); AGENTS.md
  §"Run it liberally", §"Expect documented correct-reason reds", §"Verify
  both directions".
- Header history: `c4cd4ac0` (H9a-T, header written, fixtures absent),
  `fed12acd` (H9a, fixtures authored, same day),
  `git log -S "INTENDED-REASON RED"` (no later touch), bug 0017
  §Verification (the later area-(c) red and its 10/10 green at `fa58456b`,
  which modified no acceptance file).
