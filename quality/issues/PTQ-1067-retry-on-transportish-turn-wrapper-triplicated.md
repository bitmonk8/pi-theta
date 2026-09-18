---
id: PTQ-1067
title: Three hardening files each redeclare a retry-once-if-the-resulting-turn-is-transport-ish wrapper around runProbe, one of them shadowing the canonical driveOnce name with different semantics
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/hardening/recent-rfc-live-drives.test.ts:67-84
  - tests/live/hardening/session-invoke-attach.test.ts:36-45
  - tests/live/hardening/session-subagent-toolloop.test.ts:52-59
sites: 3
fix_scope: module
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# Three hardening files each redeclare a retry-once-if-the-resulting-turn-is-transport-ish wrapper around runProbe, one of them shadowing the canonical driveOnce name with different semantics

## Observation
`tests/live/hardening/recent-rfc-live-drives.test.ts`, `tests/live/hardening/
session-invoke-attach.test.ts`, and `tests/live/hardening/session-subagent-
toolloop.test.ts` each declare a module-scope wrapper that calls a supplied
`runProbe`-returning thunk, inspects the LAST turn's `error` (and, in one
case, its `systemNotes`) through the shared `transportish` predicate, and —
if it looks transport-ish — disposes the probe and calls the thunk again
exactly once (or, in the third case, up to `attempts - 1` more times against
a caller-supplied `satisfied` predicate). All three read the last element of
`probe.turns`, build `(turn?.userTexts ?? []).join("\n")`, and route the
transient check through the same imported `transportish`. The third file
names its wrapper `driveOnce` — the exact name a canonical, differently-
implemented `driveOnce<T>` already carries in `tests/helpers/live-probe-
helpers.ts` (a generic try/catch that retries when a THROWN error's message
matches `/429|transport|rate/i`, imported and used unmodified by two other
in-scope hardening files, `b0308-cap0-exhaustion-note.test.ts` and `session-
promptloop.test.ts`) — but this file's `driveOnce` never throws-and-catches;
it inspects a successfully-returned probe's turn-error field instead, so the
same identifier resolves to materially different retry semantics depending on
which file a reader is in.

## Evidence

`tests/live/hardening/recent-rfc-live-drives.test.ts:67-84`:
```ts
async function driveRobust(
  make: () => Promise<ProbeResult>,
  satisfied: (u: string, turn: Turn) => boolean,
  attempts = 3,
): Promise<{ u: string; turn: Turn; probe: ProbeResult }> {
  let probe = await make();
  let turn = probe.turns[probe.turns.length - 1];
  let u = (turn?.userTexts ?? []).join("\n");
  for (let i = 1; i < attempts; i += 1) {
    const transient =
      transportish(turn?.error) || (turn?.systemNotes ?? []).some(transportish);
    if (!transient && satisfied(u, turn)) break;
    await probe.dispose();
    probe = await make();
    turn = probe.turns[probe.turns.length - 1];
    u = (turn?.userTexts ?? []).join("\n");
  }
  return { u, turn, probe };
}
```

`tests/live/hardening/session-invoke-attach.test.ts:36-45`:
```ts
async function drive(make: () => Promise<ProbeResult>): Promise<{ text: string; probe: ProbeResult }> {
  let probe = await make();
  let turn = probe.turns[probe.turns.length - 1];
  if (turn !== undefined && transportish(turn.error)) {
    await probe.dispose();
    probe = await make();
    turn = probe.turns[probe.turns.length - 1];
  }
  return { text: (turn?.userTexts ?? []).join("\n"), probe };
}
```

`tests/live/hardening/session-subagent-toolloop.test.ts:52-59` — re-read
immediately before filing:
```ts
async function driveOnce(make: () => Promise<ProbeResult>): Promise<ProbeResult> {
  let probe = await make();
  const turn = probe.turns[probe.turns.length - 1];
  if (turn !== undefined && transportish(turn.error)) {
    await probe.dispose();
    probe = await make();
  }
  return probe;
}
```

Contrast with the canonical, differently-shaped `driveOnce<T>` this third
file's identifier collides with (`tests/helpers/live-probe-helpers.ts:16-24`,
imported unmodified by `b0308-cap0-exhaustion-note.test.ts` and `session-
promptloop.test.ts`, both also in this review's scope):
```ts
export async function driveOnce<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/429|transport|rate/i.test(msg)) return await run();
    throw e;
  }
}
```

Exact search: `grep -rn "^async function drive" tests/live/hardening/*.test.ts`
returns exactly these three declarations (plus the unrelated `theta`/`P`
frontmatter builders, excluded by the `drive` prefix match).

## Why this is a problem
The same "retry once if the resulting turn's error/notes look transport-ish"
idiom is retyped three times with cosmetic variation (return shape, whether
`turn` is `let` or `const`, whether `systemNotes` is also checked) instead of
being defined once. The third copy additionally reuses the literal name
`driveOnce`, which two sibling files in the SAME directory already bind to an
unrelated canonical helper with incompatible retry semantics (catch-and-retry
on a thrown exception vs. inspect-and-retry on a successfully-returned turn's
error field) — a reader moving from `session-promptloop.test.ts`'s `await
driveOnce(() => runProbe(...))` to `session-subagent-toolloop.test.ts`'s
identically-spelled call would carry the wrong mental model of when the retry
fires.

## Suggested direction (non-binding, optional)
`tests/helpers/live-probe-helpers.ts` already hosts `transportish` and the
generic `driveOnce<T>`, and all three files already import `transportish`
(or `runProbe`/`ProbeResult`) from it or from the sibling `./probe-harness`
module; a single exported "retry once on a transport-ish last-turn error"
wrapper, under a name that does not collide with the existing `driveOnce<T>`,
is the shape all three call sites already point at.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the
  named gate kinds.
- Recording-double check: none of the three wrappers records a call to back
  a "never called" witness; each retries a caller-supplied thunk and returns
  its result, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "driveRobust\|transportish" docs/bugs/*.md`
  → 0 hits; no open bug documents a rationale for the three independent
  wrappers or for the name collision.
- coverage-matrix/bug-doc citation search: `grep -n
  "recent-rfc-live-drives\|session-invoke-attach\|session-subagent-toolloop"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  change to any `it()`/`describe()` name, count, or assertion — only that the
  retry wrapper could be shared and the name collision avoided — so the
  citation carve-out does not bind.
- Prior-filing overlap check: `quality/resolved/PTQ-0775-04-driveonce-retry-
  wrapper-duplicated.md` (status: fixed) covers the byte-identical generic
  `driveOnce<T>` in `b0308-cap0-exhaustion-note.test.ts` and `session-
  promptloop.test.ts` only, and its own triage note explicitly EXCLUDES this
  file's `driveOnce` as "a diverged non-generic variant keyed on
  `turn.error`/`transportish`" with "no overlap with sibling -01" — i.e. the
  prior filing deliberately left this three-file "inspect a returned turn's
  error" cluster uncounted. `quality/resolved/PTQ-0772-01-transportish-
  predicate-triplicated.md` covers the `transportish` predicate itself
  (already fixed: all three files here import it from `tests/helpers/live-
  probe-helpers.ts`), not the wrapper built on top of it. This finding is
  the previously-flagged, not-yet-filed cluster.
- Coverage check: the claim is entirely about repeated/colliding helper-
  function DEFINITIONS, not a missing test path; all three copies are
  exercised by their own files' tests, which already run.

## Triage
<!-- triage appends: verdict + one-line reason. Nothing above this line is edited. -->
verdict: confirmed — independently re-verified: all three excerpts reproduce at exactly :67-84 / :36-45 / :52-59 and the canonical `driveOnce<T>` at live-probe-helpers.ts:16-24; `grep "^async function drive" tests/live/hardening/*.test.ts` returns exactly the three declarations, and `transportish(` outside the helper has exactly these three call sites so `sites: 3` is exact; all copies are live (driveRobust called :134/:224/:298, drive :76/:111, local driveOnce :91/:137); mktemp diff of invoke-attach:36-45 vs toolloop:52-59 differs only in the function name, `let`/`const`, and return shape (text+probe vs probe) — a D7 boilerplate clone — while driveRobust is the documented superset of the same scaffolding (read last turn → join userTexts → transportish → dispose+remake) adding a loop, `satisfied`, and a systemNotes check, so the shared exported shape is its parameterised form, not a byte dedupe; the name collision is real: `driveOnce` is imported from the helper by b0308:30 and session-promptloop:34 (throw-based retry) and locally bound in toolloop:52 to a turn.error-based retry with a near-identical doc comment; docs/bugs and coverage-matrix searches reproduce at 0; no gate/recording-double/documented-red/failLoudly carve-out touched; not a duplicate — PTQ-0775 (fixed) covered only the generic pair and its own note set this variant aside, PTQ-0772 (fixed) covered the predicate, and sibling intake d7-15 is the CHAIN_FILES fixture (triage: claude-fable-5-1)
