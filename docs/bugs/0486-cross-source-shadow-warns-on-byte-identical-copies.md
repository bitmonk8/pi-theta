# Bug 0486 — cross-source-shadow warns on byte-identical copies: every relocated-cwd subagent child is showered with W diagnostics for the same file reached through two discovery routes

- **Status:** fixed in 0.483.0. The shadow mint compares the shadowed
  candidate's bytes with the winner's (winner read once per name group):
  byte-identical ⇒ the candidate drops silently, no diagnostic; differing
  content ⇒ the warning is unchanged; a read failure during the comparison
  fails OPEN to the warning. `resolveSlashNames` gained a leading `fs`
  parameter threaded from its one caller (`discovery-walk.ts`). Spec:
  discovery-sources.md §"Source priority", code-registry-load.md
  `cross-source-shadow` row. Witness: `tests/b0486-…` (3 cells —
  identical→suppressed, differing→warns, read-throw→fail-open); the existing
  shadow fixtures were diverged in content because byte-identical is now the
  suppressed case.
- **Residual (deferred, not a regression):** the cosmetic rider below (the
  `quality-loop` shadow line's mixed-separator cli-flag descriptor value
  `C:\UnitySrc\pi-theta/.pi/theta`) was an investigation rider ("check
  whether"), orthogonal to the suppression semantics, and is left unaddressed
  — it now surfaces only when the shadowed copy's bytes actually differ.
- **Sev/Diff estimate:** S4/D2 — pure noise (the precedence is correct and
  the winner is the intended copy), but the shower is per-child and constant:
  a quality-loop lane child (cwd = its worktree, worker identity pinned to
  the main repo via `--theta`, RFC 0009 §4) sees ~9 warnings at every load —
  one per worker slug — because ambient discovery in the worktree re-finds
  byte-identical copies of the same workers through the project walk-up and
  the settings entry (observed 2026-09-19, wave qw20260919094008).
- **Where:** `src/discovery/discovery-collision-resolve.ts`
  `resolveSlashNames` — the `lowerTier` shadow mint. `dedupeByIdentity`
  (bug 0331) already collapses same-normalized-PATH duplicates; the lane case
  is different-path/same-BYTES, which today warns unconditionally.

## Fix direction (agreed with the operator, 2026-09-19)

Do not delete the diagnostic — a shadow with DIFFERING content (a stale copy
silently winning over the current one) is a real hazard the warning exists
for. Emit it only when it could change behaviour:

1. Before minting the warning for a shadowed candidate, compare its bytes
   with the winner's (`FileSystem.readBytes`, winner read once per group).
   Byte-identical ⇒ shadow SILENTLY (candidate still drops, no diagnostic).
   A read failure during the comparison fails OPEN to the warning.
2. Spec: discovery/discovery-sources.md §"Source priority" (the emission
   sentence gains the differing-content qualifier);
   diagnostics/code-registry-load.md `theta/load/cross-source-shadow` row's
   Trigger column.
3. Witness care: the existing shadow witnesses
   (tests/b0440-cross-source-shadow-descriptor-form.test.ts, the
   b0331 fragment witness; shared fixture
   `cliSettingsShadowInput` in tests/helpers/fake-file-system.ts) use
   byte-identical bodies for the two copies — under the new rule that is the
   suppressed case, so their fixtures must DIVERGE content to keep witnessing
   the descriptor form. New cells: identical-bytes ⇒ no diagnostic + winner
   registered; differing-bytes ⇒ warning unchanged; readBytes-throw ⇒ warning
   (fail-open), unit-drivable because `resolveSlashNames` is exported (needs
   an `fs` parameter threaded from its one caller, discovery-walk.ts:572).
4. src/ change ⇒ version bump + CHANGELOG + reviewer PASS + pi-config update
   + new session, per the standing release discipline.

Cosmetic rider while in there: the `quality-loop` shadow line renders a
mixed-separator cli-flag descriptor value (`C:\UnitySrc\pi-theta/.pi/theta`);
check whether the descriptor value should be the 0268 forward-slashed form.

## Related

- Bug 0331 (same-path identity dedup — this is its same-bytes sibling).
- RFC 0009 §4 (identity/location split that makes the double-discovery
  structural for relocated-cwd children).
- docs/spec_topics/discovery/discovery-sources.md §Source priority.
