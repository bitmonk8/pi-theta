# Bug 0489 — subagent children leave no session logs: every model-driving child launches `--no-session`, so the transcript that explains a child's behaviour is discarded by construction

- **Status:** fixed in 0.489.0 — all six fix-direction items landed (argv `sessionPath`, launch-input seam, composition wiring via `createChildSessionPathPolicy`, subagent.md revision, witnesses in tests/b0489-child-session-log-persistence.test.ts + tests/subagent-visible-regime.test.ts B1–B5b + the H9a (e) acceptance log assertion, version bump + CHANGELOG). Reviewer PASS (four rounds, 2026-09-24; rounds 1–3 findings addressed, round-4 CLEAN).
- **Sev/Diff estimate:** S3/D2 — S3: no data loss in results (the envelope
  carries the final value), but the evidence trail is unrecoverable: the
  2026-09-24 D4 model bench (waves qbench20260924081428/084634) produced
  un-diagnosable anomalies — a lane that "reviewed" a 6-file shard in 14 s
  and filed nothing, then filed 7 findings on the identical input the next
  run; a model whose summary asserted facts the adjudicator found false —
  with no way to inspect what any child actually did. The operator
  requirement this defect is filed against (2026-09-24): **if a model is
  used, its session log must be persisted** — no exceptions, no opt-out.
  D2: the argv seam, the launch input, and one composition-root derivation;
  the convention to mirror already ships in pi-config's `subagent` tool.
- **Where:**
  - `src/runtime/subagent-argv.ts` `assembleSubagentArgv` — the headless
    form unconditionally pushes `--no-session`; the visible form pushes it
    unless the placement backend declares `persistSession` (RFC-0012 §7),
    and even then only *omits* the flag, so the child writes its default
    top-level session path: it pollutes the non-recursive `/resume` picker
    and encodes no parent linkage.
  - `src/extension/subagent-spawn-regime.ts` `#launchSubagentChild` — no
    session-path input exists on the argv assembly.
  - `src/extension/production-composition.ts` — the composition root never
    reads `ctx.sessionManager.getSessionFile()`; no seam carries the
    parent's own session file toward the launcher.
  - `docs/spec_topics/pi-integration-contract/subagent.md` §7 — specifies
    the `--no-session` forms this bug revises.
  - Contrast: pi-config `extensions/subagent/index.ts` `childSessionPath`
    — children persist to
    `<parent-dir>/<parent-basename>/<ts>_sub-NNN_<agent>_<id8>.jsonl`
    (nested ⇒ invisible to `/resume`; path encodes parentage; nests
    recursively for grandchildren). This is the convention to mirror.

## Expected

Every subagent child that drives a model persists its session log, by
default and without an opt-out, to a path nested under the parent's own
session file:

```
<dir(parent)>/<basename(parent, ".jsonl")>/<ts>_theta-<label>.jsonl
```

(a parent whose file name carries no `.jsonl` suffix nests at `<parent>.d/`
instead — the derivation never creates or alters anything at the parent's
own path)

`<label>` is the launch label (`<slug>#<id8>`, filesystem-sanitised), so the
file name correlates with the pane title, the `/theta-status` node, and the
execution-status child tap. Fallback: a parent with no session file of its
own (itself launched `--no-session` by a pre-fix parent, or a bare
harness) has nothing to nest under — its children keep `--no-session`
rather than inventing an unanchored location.

## Actual

Both presentations discard the transcript: headless children always carry
`--no-session`; visible children carry it unless the backend opts in via
`persistSession`, which no shipped backend did until the pi-theta-herdr
working-tree change of 2026-09-24 — and that capability alone still scatters
child sessions at the top level of the cwd-derived sessions directory.

## Fix direction (operator-ratified 2026-09-24)

1. `ArgvInput` gains `sessionPath?: string`; when present BOTH forms emit
   `--session <path>` (supersedes `persistSession` and `--no-session`).
  
2. `ProductionProducerInput` gains
   `subagentChildSessionPath?: (label: string) => string | undefined`;
   the spawn regime threads its result into the argv input per launch.
  
3. The composition root wires the seam: derive from
   `ctx.sessionManager.getSessionFile()` (thunk-read per launch; clock
   injected per PIC-12), create the nest directory (`mkdirSync recursive`
   — the child receives an explicit `--session` FILE path whose parent
   must exist before its first write), sanitise the label PRESERVING its
   `#…` uniqueness suffix through the 60-char cap, timestamp the filename.
   No opt-out env/setting — an earlier draft's
   `PI_THETA_SUBAGENT_SESSIONS=off` is dropped per the operator
   requirement. Failure posture (review round 1, F2): the ONLY
   `--no-session` fallback is a sessionless parent; every other derivation
   failure (throwing session read, un-creatable nest) THROWS and the
   regime converts it — BEFORE the placement lease is taken — into a
   loud `SubagentSpawnFailedError` with params cleaned, the registry
   entry finished, and the PIC-65 internal-error diagnostic routed
   (spec anchor `subagent.md#subagent-session-log-derivation-failure`).
   Option (b)+routing ratified 2026-09-24 under the operator's standing
   automated-review delegation. Round-2 F3: a parent session path without
   the `.jsonl` suffix nests at `<parent>.d/` — the derivation never
   creates or alters anything at the parent's own path.
4. Spec: subagent.md §7 (the two `--no-session` sentences gain the
   derived-`--session` default and the sessionless-parent fallback);
   RFC-0012 stays as the historical record.
5. Witnesses: argv-assembly cells (sessionPath ⇒ `--session` on both
   presentations, superseding `persistSession: true`; absent ⇒ prior
   behaviour byte-identical), derivation cells (nesting, sanitisation,
   suffix-preserving truncation/no-collision, sessionless-parent ⇒
   undefined, un-creatable nest ⇒ throw), regime cells B1–B5 in
   tests/subagent-visible-regime.test.ts (seam threading, supersession,
   undefined fallback, pre-lease throw routing with no placement request),
   and the H9a (e) acceptance assertion on the real persisted child log
   (the composition witness, live suite). Existing tests keep passing
   untouched — the seam is absent in every existing harness.
6. src/ change ⇒ version bump + CHANGELOG + reviewer PASS per the standing
   release discipline.

## Notes

The herdr backend's `persistSession: true` (pi-theta-herdr working tree,
2026-09-24, tests updated) becomes redundant once the derived path ships —
harmless to keep as a second belt: a backend-persisted child without a
derivable path still logs *somewhere*.
