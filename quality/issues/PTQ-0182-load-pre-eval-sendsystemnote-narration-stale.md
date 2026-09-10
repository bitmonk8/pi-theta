---
id: PTQ-0182
title: Four comments in load-pre-eval.ts still name sendSystemNote / the pi.sendMessage seam as the mechanism routePreEvalFailure delivers through, after the PIC-72 commit rerouted the call to deliverOperatorNotePreferringEntry (entry channel first, sendMessage as fallback)
lens: D2
status: open
verdict: confirmed
locations:
  - src/extension/load-pre-eval.ts:20-23
  - src/extension/load-pre-eval.ts:64-70
  - src/extension/load-pre-eval.ts:88-92
  - src/extension/load-pre-eval.ts:97-111
  - src/extension/system-note-channel.ts:326-344
sites: 5
fix_scope: localized
wave: qw20260910054544
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-10
---

# Four comments in load-pre-eval.ts still name sendSystemNote / the pi.sendMessage seam as the mechanism routePreEvalFailure delivers through, after the PIC-72 commit rerouted the call to deliverOperatorNotePreferringEntry (entry channel first, sendMessage as fallback)

## Observation
`routePreEvalFailure` calls `deliverOperatorNotePreferringEntry(note, deps.channel)`,
which appends the note to the `theta-progress-entry` entry channel when that
channel is live and calls `sendSystemNote` only as the fallback. Commit
1dad42ac (RFC 0010 / PIC-72, 2026-09-10) made that swap — its diff replaces
`sendSystemNote(note, deps.channel)` with the new call and adds a three-line
PIC-72 comment above it. The module's header (:20-23), the `LoadPreEvalDeps.channel`
doc (:65-69), the factory doc (:88-92), and the six comment lines immediately
above the PIC-72 comment inside the method (:98-106) were not edited and still
describe delivery as "`sendSystemNote`'s fixed `triggerTurn:false` option is
applied" / "its `pi.sendMessage` seam carries the fixed `triggerTurn:false`
option" / "`sendSystemNote` applies the fixed `triggerTurn:false` option
(SystemNoteSender)". Production supplies a live entry channel
(production-composition.ts:1703 threads `entryChannel` into the deps), so the
named mechanism is the non-primary path.

## Evidence
src/extension/load-pre-eval.ts:97-111 — the method body: the pre-PIC-72
narration (:98-106) and the PIC-72 narration (:108-110) sit back to back and
name different delivery mechanisms:

```ts
    routePreEvalFailure(cause: PreEvalFailureCause, note: SystemNote): void {
      // Route the assembled pre-eval failure `theta-system-note` onto the V7d
      // `theta-system-note` delivery channel. `sendSystemNote` applies the fixed
      // `triggerTurn:false` option (SystemNoteSender), so the failure never
      // fires a turn and never becomes an evaluation outcome — this is the
      // single routing surface all seven load-time causes (ERR-1…ERR-6,
      // ERR-16) share, and the surface the watcher-time reload cause (ERR-7,
      // `V4g`) reuses. The `cause` discriminant is carried for callers /
      // reload-integration reuse; every cause routes through the one delivery
      // path, so no per-cause branching is required here.
      void cause;
      // PIC-72: error-severity parse/load failures are single-element members
      // of the diagnostic-BATCH class, so they ride the entry channel first
      // and fall back to the unchanged `sendMessage` realization.
      deliverOperatorNotePreferringEntry(note, deps.channel);
```

src/extension/load-pre-eval.ts:20-23 — the header:

```ts
// The producing subsystems assemble the failure's `theta-system-note`; V4e only
// *routes* it pre-eval, over the V7d `theta-system-note` delivery channel, so
// that `sendSystemNote`'s fixed `triggerTurn:false` option is applied and the
// failure never fires a turn.
```

src/extension/load-pre-eval.ts:64-70 — the deps field doc:

```ts
export interface LoadPreEvalDeps {
  /**
   * The `theta-system-note` delivery channel (V7d) each pre-eval failure routes
   * onto — its `pi.sendMessage` seam carries the fixed `triggerTurn:false`
   * option, so a routed failure never fires a turn.
   */
  readonly channel: SystemNoteChannelDeps;
```

src/extension/load-pre-eval.ts:88-92 — the factory doc:

```ts
/**
 * Construct the load-time pre-eval failure router. Its `routePreEvalFailure`
 * delivers over the V7d `theta-system-note` channel so `sendSystemNote`'s fixed
 * `triggerTurn:false` option is applied to every routed failure.
 */
```

src/extension/system-note-channel.ts:326-344 — what the call actually does:
entry channel first, `sendSystemNote` only when the entry channel is absent,
dead, or declines the append:

```ts
export function deliverOperatorNotePreferringEntry(
  note: SystemNote,
  deps: SystemNoteChannelDeps,
): void {
  // …
  const spelled = withNormalisedFileSpelling(note);
  if (deps.entryChannel !== undefined && deps.entryChannel.live()) {
    if (deps.entryChannel.append(spelled)) {
      return;
    }
  }
  sendSystemNote(spelled, deps);
}
```

The entry-channel append is `pi.appendEntry` (src/extension/execution-status/entry-channel.ts:24-33,
`append(note): boolean` — "`true` = delivered as an entry; `false` = caller
falls back to `sendMessage`"); it carries no `triggerTurn` option at all.

Git: `git show 1dad42ac -- src/extension/load-pre-eval.ts` changes exactly
two hunks — the import (`-  sendSystemNote,` / `+  deliverOperatorNotePreferringEntry,`)
and the call (`-      sendSystemNote(note, deps.channel);` plus the three
added PIC-72 comment lines). `git blame` attributes :20-23, :65-69, :88-92 and
:98-106 to f419ff13 / f701ba71 / 2bc69157 (2026-07-01 … 07-19); only :108-111
are from 1dad42ac. `grep -n "sendSystemNote" src/extension/load-pre-eval.ts`
→ :22, :90, :99 — three mentions of a function the file no longer imports or
calls.

## Why this is a problem
Stale mechanism narration. The file's every-cause guarantee ("never fires a
turn") is still true, but the four comments attribute it to a specific
function and seam — `sendSystemNote` applying `triggerTurn:false` on
`pi.sendMessage` — that the code reaches only on the fallback arm after
PIC-72; on the production path (`entryChannel` supplied at
production-composition.ts:1703) the note is realised by `pi.appendEntry`, which
has no `triggerTurn` option. Inside the method the two adjacent comments
narrate two different mechanisms for one call, and the file names
`sendSystemNote` three times while importing `deliverOperatorNotePreferringEntry`
instead. The rewrite left the explanatory text pointing at the code it
replaced.

## Suggested direction (non-binding, optional)
State the delivery mechanism once, as it now is (entry channel preferred,
message channel fallback, neither firing a turn), and drop the
`sendSystemNote`/`pi.sendMessage`-specific wording from the header, deps doc,
factory doc and method comment.

## False-positive check
- Verified the current call: `grep -n "deliverOperatorNotePreferringEntry\|sendSystemNote(" src/extension/load-pre-eval.ts`
  → import at :43 and call at :111 only; no `sendSystemNote(` call remains.
- Verified `deliverOperatorNotePreferringEntry` prefers the entry channel and
  falls back to `sendSystemNote` (system-note-channel.ts:338-343), and that
  the entry channel is supplied in production: production-composition.ts:1703
  `buildSystemNoteDeps(pi, ctx, emitToast, rendererGate, entryChannel)` → :1724
  `createLoadFailurePreEvalRouter({ channel })`.
- Verified `sendSystemNote` still applies `triggerTurn: false`
  (system-note-channel.ts:175, :425), so the narration describes the fallback
  arm accurately — the defect is that it is presented as THE mechanism.
- Distinct from filed findings on this file: PTQ-0060 cites :32-35 (the
  tests-task stub narration); qw20260907130901-d2-01 (questionable) cites the
  discarded `cause` parameter at :97-111 — this finding is about the delivery
  mechanism named in the comments, which stays stale whether or not `cause`
  is kept. qw20260908115521-d2-04 (rejected) was about the seven/eight count,
  not the mechanism.
- Not a behaviour claim: no assertion that any turn fires or that delivery is
  wrong; only that the comments name the replaced call path.

## Triage
verdict: confirmed — every claim reproduces at HEAD: the four excerpts byte-match (:20-23, :64-70, :88-92, :98-106), `grep -n sendSystemNote` in the file hits exactly :22/:90/:99 while the only import is `deliverOperatorNotePreferringEntry` (:43) and the only call is :111, `git show 1dad42ac` touches just the import line and the call line (+3 PIC-72 comment lines) so the four narration blocks blame to f419ff13/f701ba71/2bc69157 (July) untouched, `deliverOperatorNotePreferringEntry` (system-note-channel.ts:326-344) appends via `pi.appendEntry` (entry-channel.ts:66, no `triggerTurn` option) and reaches `sendSystemNote`/`triggerTurn:false` (:175/:425) only on the fallback arm, and production always constructs the entry channel (factory.ts:620 `createEntryChannel(pi)` → production-composition.ts:1848/1920 → :1703 `buildSystemNoteDeps(..., entryChannel)` → :1724 `createLoadFailurePreEvalRouter({ channel })`), so the factory doc's "`sendSystemNote`'s fixed `triggerTurn:false` option is applied to every routed failure" and the deps doc's "its `pi.sendMessage` seam carries" are false for the primary path — the mechanically-evidenced stale-mechanism-narration class of PTQ-0016/0040/0042/0114; distinct root cause from PTQ-0060 (:32-35 stub paragraph), intake d2-01 (discarded `cause`; note that one is actually confirmed, not "questionable" as this filing says) and intake d2-05 (:101-104 V4g-reuse claim) — different sentences, different defects (triage: claude-opus-5)
