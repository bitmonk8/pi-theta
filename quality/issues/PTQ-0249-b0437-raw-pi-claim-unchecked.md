---
id: PTQ-0249
title: b0437's B1 test title claims the overflow note bypasses the raw top-level pi, but the body never reads that double's recorder
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0437-producer-note-raw-send-fallback.test.ts:511-520
  - tests/b0437-producer-note-raw-send-fallback.test.ts:541-577
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# b0437's B1 test title claims the overflow note bypasses the raw top-level pi, but the body never reads that double's recorder

## Observation
`tests/b0437-producer-note-raw-send-fallback.test.ts` defines `recordingPi()`
(511-520), a recording double for the top-level `ExtensionAPI.sendMessage`
that pushes every captured message into a `notes` array it returns. Test
`"B1 (routed + details-absent): the overflow note lands on the injected
channel, not the raw top-level pi, and carries no \`details\`"` (541-577) is
the only call site of `recordingPi()` in the file. Its destructure at line
543, `const { pi } = recordingPi();`, drops the returned `notes` property; no
identifier bound to it exists anywhere in the file, so nothing in the test
ever reads what the raw top-level `pi` received. Every assertion in the test
body instead reads `channelLog`/`routed` — the *separate* `channel` double's
own recorder.

## Evidence
`tests/b0437-producer-note-raw-send-fallback.test.ts:511-520` — the double
built specifically to capture raw top-level sends:
```ts
/** A recording top-level `pi` — the seam the RAW send lands on today. */
function recordingPi(): { readonly pi: ExtensionAPI; readonly notes: CapturedNote[] } {
  const notes: CapturedNote[] = [];
  const pi = {
    sendMessage: (message: CapturedNote): void => {
      notes.push(message);
    },
  } as unknown as ExtensionAPI;
  return { pi, notes };
}
```

`tests/b0437-producer-note-raw-send-fallback.test.ts:541-551` — the test's
title asserts "not the raw top-level pi"; the destructure keeps only `pi`,
discarding `notes`:
```ts
  it("B1 (routed + details-absent): the overflow note lands on the injected channel, not the raw top-level pi, and carries no `details`", async () => {
    const { channel, notes: channelLog } = recordingSystemNoteChannel();
    const { pi } = recordingPi();
    const deps = producerWithChannel(pi, channel);

    const result = await deps.runBinder({
      theta: noParamsTheta(),
      args: "extra text here",
      ctx: ctxDouble(),
    });
    expect(result.bound, "a no-params theta binds and its body runs").toBe(true);
```

`tests/b0437-producer-note-raw-send-fallback.test.ts:557-564` — the only
routing assertions, all against the *channel's* own log, never the raw pi's:
```ts
    const routed = channelNotes(channelLog);
    expect(
      routed,
      "runtime-event-channel.md:130 — the SLSH-1 overflow note must route through #input.systemNoteChannel, not raw #input.pi.sendMessage",
    ).toHaveLength(1);
    const note = routed[0]!;
    expect(note.content).toBe(OVERFLOW_CONTENT);
    expect(note.display).toBe(true);
```

`tests/b0437-producer-note-raw-send-fallback.test.ts:568-576` — the
remaining assertions, all about `details`, still only on `note` (the
channel's captured note):
```ts
    expect(
      "details" in note,
      "the routed overflow note must not carry a `details` key (bug 0401 informational contract preserved)",
    ).toBe(false);
    expect(
      JSON.stringify(note),
      'the serialised routed note must not contain "details"',
    ).not.toContain("details");
  });
```
Exact search: `recordingPi\(` occurs at two lines in this file — the
definition (512) and this one call site (543); no other identifier bound to
its `notes` field exists in the file (grep for `recordingPi(` returns exactly
these two lines).

Contrast — two sibling tests in the *same file* make an equivalent negative
claim about a double they build, and DO check it:
`tests/b0437-producer-note-raw-send-fallback.test.ts:329-339` (the
group-A stamp-guard test's "no re-stamp and no double send" claim, checked
against its own `sends`/`calls()` recorders):
```ts
    // (d) the channel's own `pi.sendMessage` recorder saw ZERO writes — the guard
    // returns `undefined`, so the caller never sends the note a second time.
    expect(
      sends,
      "the guard returns undefined on the fallback path; the caller must not send again",
    ).toHaveLength(0);

    // (e) `wallNow()` was invoked exactly ONCE — the fallback did not re-stamp
    // (runtime-event-channel.md:132 — the runtime MUST NOT re-invoke
    // `Clock.wallNow()` in the fallback).
    expect(calls()).toBe(1);
```

## Why this is a problem
The test's own title makes three claims: (1) the note lands on the injected
channel, (2) it does **not** land on the raw top-level `pi`, (3) it carries
no `details`. Claims (1) and (3) are verified (the `routed`/`note` and
`details` assertions above). Claim (2) has no corresponding assertion: the
`notes` array `recordingPi()` returns specifically to let a caller check
"nothing reached the raw pi" is discarded at the destructure (line 543) and
never referenced again in the file (confirmed by the two-hit `recordingPi(`
search). A reader who reads only the test's title would conclude that a
regression which sends the SLSH-1 overflow note to **both** the channel and
the raw top-level `pi` (rather than the channel exclusively) would fail B1 —
it would not, because nothing in the test observes the raw `pi` at all. This
is a name/body mismatch, not a missing-coverage question: the double built to
make the "not the raw pi" claim checkable already exists in this exact test;
its output is simply never read. The file's own sibling tests (329-339)
demonstrate that the suite's established practice, when a title makes a
"no X" claim about a double, is to assert on that double's recorder
directly — B1 is the one test in the file whose title makes such a claim
without the matching assertion.

## Suggested direction (non-binding, optional)
The natural fix mirrors what the file already does two tests earlier for an
equivalent claim: read the discarded `notes` field from `recordingPi()` and
assert on it, the same way the stamp-guard test asserts on `sends` and
`calls()` for its own "no double send"/"no re-stamp" claims.

## False-positive check
- Gate-pin carve-out: the file is not a `*gate*.test.ts` census/pin file; not
  applicable.
- Recording-double carve-out ("negative witnesses through recording doubles
  ... are legitimate MUST-NOT witnesses"): checked — this carve-out protects
  a *present* `expect(rawRecorder).toHaveLength(0)`-style assertion from being
  mischaracterised as vacuous. Here no such assertion exists at all (the
  recorder's output is never bound to an identifier), so the carve-out
  protects a different shape than what is being filed; this finding is about
  an absent check, not a present one being second-guessed.
- docs/bugs/ signature search: read `docs/bugs/0437-producer-note-sites-
  bypass-fallback-chain.md` in full. Status is "fixed (0.429.0)"; its own
  "Gates" record states "witness `tests/b0437-producer-note-raw-send-
  fallback.test.ts` 5/5 green" — this is not a documented correct-reason red
  (AGENTS.md), it is a currently-green regression suite, and confirmed
  against current `src/extension/production-theta-producer.ts:1709-1719`
  (`#emitNoParamsOverflowNote` routes exclusively through `sendSystemNote`).
  The bug doc names the test FILE as a witness but does not cite the "B1"
  test or its specific assertions by name, so no per-assertion pin exists to
  violate.
- coverage-matrix/bug-doc citation search: grepped
  `docs/reference/coverage-matrix.md` for `b0437` — no hits. No citing
  document names this test, so no merge/rename/delete disclosure is required.
- Coverage drift check: this finding does not claim "a test should exist" or
  "this path is untested" anywhere in the suite — B1 already exists and
  already exercises the channel-routing and details-absence claims; the
  finding is scoped to the mismatch between B1's own title and its own body,
  the "misleading test names" D7 class, not a coverage gap.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — verified verbatim: recordingPi()'s `notes` is dropped at its sole call site (543, grep-confirmed 2 hits total), #systemNoteChannel() (production-theta-producer.ts:1854-1873) bypasses raw `#input.pi` entirely once `systemNoteChannel` is injected, so B1's title claim "not the raw top-level pi" has no matching assertion while the sibling stamp-guard test (329-339) shows the file's own convention of asserting on such recorders directly (triage: claude-opus-5)
