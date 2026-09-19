# RFC 0013 — A restart contract for long-running theta panes: recover by RE-ISSUING against durable state, not by resuming a transcript

- **Status:** draft (feature request, prompted by the 2026-09-19 power-outage
  incident below). No code yet; this RFC scopes the problem and the seam.
- **Scope:** the recovery story for a pane whose foreground work is a
  long-running theta invocation (`/quality-loop` is the motivating case; any
  autonomous multi-hour theta driven from a slash command qualifies). Touches
  a theta-side declaration (a restart command + durable-state pointer), the
  child-outcome / launch-file surfaces that already exist, and the
  out-of-tree recovery tooling (`pi-config`'s `pi-resurrect.mjs`, herdr layout
  restore).
- **Does NOT touch:** the quality-loop's own idempotence (already correct —
  the store IS the checkpoint); RFC 0012 placement; the persisted-child-
  sessions idea (moved to [RFC 0014](./0014-persisted-child-sessions.md) — a
  transcript-resume feature, the OPPOSITE recovery model from this one, and
  they must not be conflated).
- **Depends on:** nothing in-tree. The tooling half lives in `pi-config`.

## Summary

A pane whose foreground work is a long theta loop has TWO distinct notions of
"recover after a crash", and today's tooling only implements the wrong one:

- **Transcript resume** (`pi --session <id/path>`): replays the *conversation*.
  Correct for an interactive agent whose value is its accumulated context.
- **Command re-issue** (`/quality-loop …` again): restarts the *work* against
  its durable external checkpoint. Correct for an idempotent theta loop whose
  value is in a store it commits to as it goes, NOT in the transcript.

The quality-loop is already built for the second model — it commits `quality/`
once per wave and its README states "re-running continues from here". But
nothing in the recovery path KNOWS that, so after an uncontrolled termination
both recovery mechanisms attempt transcript-resume and fail (incident below).
This RFC proposes a small **restart contract** a long-running theta declares,
and teaches the recovery tooling to prefer re-issue over resume for panes that
carry it.

## Motivating incident (2026-09-19, power outage)

A `/quality-loop` drain was running in its own herdr pane (a separate session
from the operator's interactive one). Power was lost; every pi process died;
terminals survived. The operator's `pi-swarm-recover.cmd` restored the swarm
but left the quality-loop pane dead. Forensics:

1. **The dead pane's captured argv was `pi --session 01a0b908-…` (a bare
   UUID).** On restart herdr's layout restore replayed that argv verbatim; pi
   answered `No session found matching '01a0b908-…'` and dropped to a shell.
2. **No session file for `01a0b908` existed on disk** (verified across the
   whole sessions tree). The newest pi-theta session file that survived was a
   DIFFERENT id, last written minutes before the outage. Whatever id herdr had
   captured for "resume this pane" had drifted from any session pi durably
   wrote — the loop's session was either minted too late to flush, or pi had
   rotated ids and herdr recaptured neither.
3. **`pi-resurrect.mjs` was structurally blind to it.** That tool enumerates
   session *files* and relaunches each by full *path*
   (`node <cli> --session <file>`); a session with no file cannot appear in
   its survey. It behaved correctly on every session it could see — this pane
   was not one of them.
4. **Even a perfect resume would have been the wrong recovery.** Resuming the
   transcript would not restart the in-flight theta driving the loop; the
   theta invocation is not a resumable transcript entry. The drain's actual
   state lived in the git-committed `quality/` store, and the correct recovery
   was to **re-run `/quality-loop`** — which no layer attempted, because none
   knew the pane's work was re-issue-recoverable rather than resume-
   recoverable.

Net cost: nothing lost (the store held every integrated wave; a manual re-run
resumed the drain), but the recovery required a human who understood the
loop's internals. The tooling should encode that understanding.

## The two failure classes, named

- **F1 — resume target drift.** herdr captures a session id at pane-launch and
  replays `--session <id>` on restore, but the id names no durable file (never
  flushed; rotated; pruned). Restore hard-fails to a shell instead of
  degrading. Affects ANY pi pane, not just theta ones — but a long autonomous
  pane is where it hurts, because no human is watching it fail.
- **F2 — wrong recovery model.** For a theta-loop pane, transcript-resume
  (even when the file exists) does not resume the work; the correct action is
  command re-issue against durable state. No layer distinguishes the two.

## Proposal

### 1. A theta restart declaration (in-tree, the contract)

A long-running theta MAY declare, in frontmatter, that its recovery is
re-issue rather than resume:

```
restart:
  reissue: "/quality-loop"        # the slash command to re-run (args omitted → operator supplies)
  durable_state: "quality/"       # the committed checkpoint the re-run reads (doc/pointer only)
  idempotent: true                # re-running continues, never double-applies
```

This is descriptive metadata, not behaviour: the runtime does not act on it.
Its job is to be readable off two surfaces the recovery tooling can reach
without a live process:

- the **launch file** (RFC 0012 §2) a placed/visible child already writes —
  extend it with an optional `restart` block projected from the root theta's
  frontmatter, so a tool inspecting a dead pane's launch file learns the pane
  was re-issue-recoverable and with what command; and
- the **session transcript header** — the first session record already
  carries `cwd`; add the `restart` block there too, so `pi-resurrect` (which
  reads session files) sees it even when no launch file survives.

### 2. Recovery tooling prefers re-issue for declared panes (out-of-tree, pi-config)

`pi-resurrect.mjs` and the herdr restore path gain one branch: a pane/session
carrying a `restart.reissue` command is recovered by **spawning that command
into a fresh session** (`node <cli> -p "<reissue>"` or an interactive tab
seeded with it), NOT by `--session <id>`. The survey prints it distinctly
("re-issue `/quality-loop` — durable state quality/, idempotent") and, being
autonomous-work-restarting, it is **off by default** exactly as
`--include-stranded` is today (waking a drain is a decision, not a default).

### 3. F1 degradation, independent of the contract (out-of-tree)

herdr layout restore, and `pi-resurrect`, should treat `--session <id>` whose
file is absent as a **soft** failure: fall back to opening the pane at its
recorded `cwd` with a one-line notice ("session `<id>` did not survive; start
fresh or re-issue"), never a bare dead shell. This alone would have left the
incident pane usable.

## Open questions

- **Where the restart declaration is authored.** Frontmatter is the natural
  home, but `/quality-loop` is invoked with args (`lenses=…`, `cluster_max=…`)
  the recovery must not guess. Options: reissue command carries no args
  (operator re-supplies — safest); or the launch file records the actual
  invocation args and the re-issue is byte-exact (convenient, but re-running a
  stale arg set — e.g. a `lenses=none` drain after the backlog changed shape —
  may not be what the operator now wants). Leaning: record args as a
  suggestion, require operator confirmation to re-issue.
- **Interaction with RFC 0014 (persisted child sessions).** A persisted child
  IS transcript-resumable; a theta-loop ROOT pane is re-issue-recoverable.
  A pane can be both a child (of nothing, here) and a loop root. The contract
  must state precedence: if `restart.reissue` is present, it wins over
  transcript-resume for that pane.
- **Should the runtime ever auto-re-issue?** No, at 1.x — the same
  autonomous-work-safety rule that keeps `--include-stranded` off by default.
  Recovery stays survey-then-confirm.

## Incident-hardening already landed (not part of this RFC)

Independently of this RFC, the loop was made more crash-tolerant in the same
period: the provider circuit breaker (halt a wave when every lane aborts
infra-shaped — bug in the VPN-drop family) and the batched-lane per-batch
commits (each batch a durable revert boundary) both shrink how much a mid-run
death can cost. This RFC is the recovery-tooling complement to that
in-loop-durability work.

## Related

- `quality/README.md` — the loop's re-issue-continues contract (the durable-
  state half this RFC exposes to tooling).
- RFC 0012 §2 — the launch file this RFC would extend with a `restart` block.
- RFC 0014 — persisted child sessions (transcript-resume; the complementary,
  NOT competing, recovery model).
- `pi-config` `bin/pi-resurrect.mjs`, `bin/pi-swarm-recover.cmd` — the
  out-of-tree tooling the incident exercised; the F1/F2 fixes land there.
- docs/bugs/0484, 0485 — the subagent-lifecycle family; this is the ROOT-pane
  analogue (nothing restarts a root; children are healed top-down by a
  restarted parent, but a loop root has no parent).
