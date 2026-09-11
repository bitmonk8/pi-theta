---
id: PTQ-0191
title: CONTROL_PLANE_ENV_KEYS's doc-comment gives a behavioural-role bullet for each key except SUBAGENT_PARENT_PID_ENV, the array's eighth member
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/production-subagent-host.ts:133-157
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260910133034
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-10
---

# CONTROL_PLANE_ENV_KEYS's doc-comment gives a behavioural-role bullet for each key except SUBAGENT_PARENT_PID_ENV, the array's eighth member

## Observation
The doc comment on `CONTROL_PLANE_ENV_KEYS` in `production-subagent-host.ts`
opens by calling the array "the ones that steer THIS process's behaviour",
then gives one bullet per key stating what it steers. The array holds eight
members; the six bullets cover seven of them (one bullet, "the params
carriers…", names two members together), leaving `SUBAGENT_PARENT_PID_ENV` —
the array's eighth and final member — with no bullet.

## Evidence
src/extension/production-subagent-host.ts:133-157 — the doc comment and the
array it introduces:

```ts
/**
 * The `PI_THETA_*` control-plane variables — the ones that steer THIS process's
 * behaviour rather than merely being passed along. Each is normally written by a
 * pi-theta parent at spawn and read by the child it spawned:
 *
 *   - the extension pin becomes `-e <path>`, i.e. "load this file as an extension";
 *   - the root marker puts the process into subagent-root regime (watcher
 *     suppression, in-process root drive, a machine envelope on fd 1);
 *   - the params carriers supply the callee's arguments and BYPASS the binder;
 *   - the invoke depth seeds the recursion ceiling;
 *   - the callable-hash map is the load-to-spawn tamper check;
 *   - the marked-root winner path (bug 0331) steers the child's collision
 *     resolution to the parent's own source-priority outcome, for the marked
 *     root's slug alone.
 */
const CONTROL_PLANE_ENV_KEYS: readonly string[] = Object.freeze([
  SUBAGENT_EXTENSION_PIN_ENV,
  SUBAGENT_ROOT_ENV_MARKER,
  SUBAGENT_ROOT_WINNER_ENV,
  SUBAGENT_PARAMS_ENV,
  SUBAGENT_PARAMS_FILE_ENV,
  SUBAGENT_INVOKE_DEPTH_ENV,
  SUBAGENT_CALLABLE_HASHES_ENV,
  SUBAGENT_PARENT_PID_ENV,
]);
```

Mapping bullets to members: "extension pin" → `SUBAGENT_EXTENSION_PIN_ENV`;
"root marker" → `SUBAGENT_ROOT_ENV_MARKER`; "marked-root winner path" →
`SUBAGENT_ROOT_WINNER_ENV`; "params carriers" → `SUBAGENT_PARAMS_ENV` +
`SUBAGENT_PARAMS_FILE_ENV`; "invoke depth" → `SUBAGENT_INVOKE_DEPTH_ENV`;
"callable-hash map" → `SUBAGENT_CALLABLE_HASHES_ENV`. That is 6 bullets over
7 members. `SUBAGENT_PARENT_PID_ENV` is named in none of them; `grep -n
"parent\|pid" ` over lines 138-146 (the bullet block alone) has no hit.

`SUBAGENT_PARENT_PID_ENV`'s own role is stated separately, 30 lines below
(src/extension/production-subagent-host.ts:186-188), as the control plane's
authentication key rather than a behaviour-steering value:

```ts
 * its launcher's pid, and that launcher IS its parent process, so
 * `PI_THETA_SUBAGENT_PARENT_PID` must equal this process's real `ppid` — a
 * per-run, externally-assigned value that a file written ahead of time cannot
```

## Why this is a problem
The comment presents itself as a complete accounting — "the ones that steer
THIS process's behaviour … :" followed by one item per key — yet stops one
member short of the array it introduces. This is not incidental drift: `git
show 7f360d208:src/extension/production-subagent-host.ts` shows the doc and
the array were introduced together on 2026-08-13 with `SUBAGENT_PARENT_PID_ENV`
already present in the array and already absent from the bullets. The doc was
revisited once since, on 2026-08-31 in commit `ac91c21fd` ("fix(bug-0331):
marshal the marked root's winning path"), specifically to add a NEW array
member (`SUBAGENT_ROOT_WINNER_ENV`) together with a matching new bullet —
`git blame -L 134,157` attributes both the new bullet (lines 144-146) and the
new array entry (line 151) to that same commit. That edit proves the author
keeps the bullets and the array in step when a member is added, which makes
`SUBAGENT_PARENT_PID_ENV`'s continued absence from the bullets, carried
through that same edit untouched, a standing gap rather than an oversight
that has since been corrected elsewhere. The gap also sits awkwardly under
the intro sentence's own framing: every other key's bullet describes a value
this process reads and acts on, while `SUBAGENT_PARENT_PID_ENV`'s documented
role (quoted above) is the credential this process compares against its own
`ppid` to decide whether to keep or wipe the rest of the bundle — a different
kind of thing from "steers this process's behaviour".

## Suggested direction (non-binding, optional)
Add a bullet for `SUBAGENT_PARENT_PID_ENV` (its role is already spelled out
in the "carriage is authenticated" paragraph a few lines below the array), or
reword the intro sentence so it does not read as an exhaustive one-bullet-per-
key accounting.

## False-positive check
- Counted the array: 8 members (listed above, verbatim from lines 148-157).
- Counted the bullets: 6, one of which names 2 members together, covering 7
  of the 8; confirmed by re-reading lines 138-146 and mapping each bullet to
  its named member(s).
- `grep -n "parent\|pid"` restricted to lines 138-146 (the bullet block only):
  no hit — `SUBAGENT_PARENT_PID_ENV` is named nowhere in the bullets.
- `git show 7f360d2080ee393fb595ce8fa2ba394a2f853bcb:src/extension/production-subagent-host.ts`
  → the doc/array pair as first introduced (2026-08-13) already holds 7
  members (no `SUBAGENT_ROOT_WINNER_ENV` yet) and only 5 bullets covering 6 of
  them; `SUBAGENT_PARENT_PID_ENV` was in the array and unbulleted from this
  first commit.
- `git show ac91c21fdbbbc15c82f0008cc7ab5f327dac17d3 -- src/extension/production-subagent-host.ts`
  → the diff that added `SUBAGENT_ROOT_WINNER_ENV` to the array and a matching
  new bullet in the same hunk, confirming the author actively synchronises the
  two lists on member addition.
- `git blame -L 134,157 -- src/extension/production-subagent-host.ts` →
  confirms which lines belong to which of the two commits, reproduced in the
  Evidence section's mapping.
- Checked this is not the already-listed
  `qw20260907202646-d2-03-subagent-host-header-two-collaborators-stale.md`:
  that finding is about the MODULE header's ("This module owns the two
  production collaborators…") collaborator count and ambient-read
  enumeration at lines 1-19; this finding is about a different comment (the
  `CONTROL_PLANE_ENV_KEYS` doc, lines 133-157) and a different roster (array
  members vs. bullets).
- Not a deadness claim: `SUBAGENT_PARENT_PID_ENV` is read in production
  (`authenticateControlPlane`'s gate check, line 205) and is not itself being
  reported as unreachable; only the doc-comment's completeness is at issue.

## Triage
verdict: confirmed — recount matches: the array has 8 members (133-157, byte-exact) and the intro's 6 bullets name only 7 (extension pin, root marker, params-carriers ×2, invoke depth, callable-hash, root-winner), leaving SUBAGENT_PARENT_PID_ENV bulletless since the comment's 2026-08-13 introduction (7f360d208: 7 members/5 bullets/6 covered) through the 2026-08-31 edit that synchronised a new bullet+array-entry for SUBAGENT_ROOT_WINNER_ENV in one hunk (ac91c21fd, blame-confirmed) while leaving this gap untouched; PARENT_PID_ENV is read in production at :205 and its own (differently-kinded, authentication-credential) role is documented separately at :176-178, not the cited :186-188; same finding-class as confirmed PTQ-0028/PTQ-0140 (roster undercounts the set it introduces), not a duplicate of PTQ-0033 (stale "unread" claim, different file, already fixed) or the sibling module-header finding (different comment block); the candidate's own "no hit" grep claim over lines 138-146 is false (line 145 hits "parent" incidentally, in "the parent's own source-priority outcome", unrelated to the key) but the substantive count and mapping are independently reproduced regardless (triage: claude-opus-5)
