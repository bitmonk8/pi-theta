# Bug 0008 — Subagent child receives only the last theta discovery root when the parent has ≥ 2 roots

- **Status:** open.
- **Kind:** defect — the subagent launch contract promises the child "re-discovers
  the callee" from the parent's discovery roots, but the argv assembly forwards
  the roots in a form the host CLI is known to collapse to its last occurrence,
  so every root except the last silently vanishes in the child. The launcher
  contradicts both the documented `--theta` flag convention (single flag,
  `path.delimiter`-joined — the form the extension's own reader supports) and
  the host's actual repeated-flag semantics.
- **Affected:** `assembleSubagentArgv` in `src/runtime/subagent-launcher.ts`
  (the `--theta` repetition, lines 241–242), fed `thetaDirs` from the parent's
  `activeRoots` union (`src/extension/production-theta-producer.ts:1612`;
  computed at `src/extension/production-composition.ts:412`). The child-side
  reader `readThetaFlagPaths` (`src/extension/production-composition.ts:1769`)
  is not itself wrong — it handles both a single delimiter-joined value and a
  hypothetical array — but its docstring cites "DISCLI-1" for an
  array-valued repeated flag, a spec ID that exists nowhere under `docs/`
  (see root cause).
- **Observed at:** `0.16.0`, host Pi `0.82.1` (host argv parsing also verified
  identical at `0.80.10`, the repo-local `node_modules` copy).

## Summary

A subagent-mode invocation launches a child `pi` that re-runs discovery and
re-registers the callee by slug. `assembleSubagentArgv` forwards the parent's
discovery roots as **repeated** `--theta <dir>` flags. The host CLI parses
unknown (extension-registered) flags into a `Map` keyed by flag name —
`unknownFlags.set(flagName, next)` — so a repeated string flag resolves to its
**last occurrence only**; `pi.getFlag` is declared `boolean | string |
undefined` and can never deliver an array. With ≥ 2 parent roots, the child
discovers only the last root. A callee whose `.theta` lives in any earlier
root does not register in the child; the child treats the `-p "/<slug>"`
prompt as prose, drives a plain model conversation instead of the theta, and
exits without a `theta_result` envelope. The parent maps that fail-closed to
`Err(InvokeInfraError { cause: "internal_error" })` — an error that names the
envelope layer, two hops away from the discovery drop that caused it.

## Reproduction

### Mechanical (token-free, no model turns)

Two roots, each holding one trivial code-only theta (`bug8a.theta` /
`bug8b.theta`, body `let x = "…"` — registers and runs with zero queries).
Pointing `PI_CODING_AGENT_DIR` at an empty directory removes credentials, so
the prose path aborts at credential lookup ("No API key found for the selected
model.", exit 1) instead of issuing a provider call — the registered-vs-prose
distinction is then mechanical: a registered slug produces only the `session`
JSON event and exits cleanly; an unregistered slug produces the API-key error.

```
PI_CODING_AGENT_DIR=<empty-dir> node node_modules/@earendil-works/pi-coding-agent/dist/cli.js \
  --mode json -p -ne -e ./extensions --theta <dirA> --theta <dirB> "/bug8a"
```

Observed matrix (0.16.0, host 0.82.1, Windows; `MSYS_NO_PATHCONV=1
MSYS2_ARG_CONV_EXCL="*"` under Git Bash):

| argv | `/bug8a` (in dirA) | `/bug8b` (in dirB) |
|---|---|---|
| `--theta A` | registered | — |
| `--theta B` | prose | — |
| `--theta A --theta B` | **prose** (root A dropped) | registered |
| `--theta B --theta A` | registered | — |
| `--theta "A;B"` (one flag, `path.delimiter`-joined) | registered | registered |

Order flips the casualty — last occurrence wins — and the delimiter-joined
single flag resolves **both** roots through the existing reader, unchanged.

### Live (bug-0004 fix verification)

During live verification of the bug-0004 fix, the parent session carried two
active discovery roots (the scratch driver/worker fixtures plus a second
root). A subagent invocation of `worker5.theta` spawned a child whose argv
carried both roots as repeated `--theta` flags; the child registered only the
last root's thetas, treated `/worker5` as prose, ran it as an ordinary model
conversation, and exited without a `theta_result` envelope. The parent
reported `Err(InvokeInfraError { cause: "internal_error" })` with the
`theta/runtime/subagent-exit-without-envelope` diagnostic — nothing named the
dropped root.

## Expected behaviour (what the spec says)

- `docs/spec_topics/discovery/discovery-sources.md` (CLI source): "`--theta
  <paths>` (**single flag**; multiple paths joined with the OS path-list
  separator — `:` POSIX, `;` Windows; uses Node's `path.delimiter`)". Same in
  `docs/reference/discovery-cli.md` §"The five discovery sources". The joined
  single-flag form is the documented multi-path convention; nothing documents
  a repeated-flag form.
- `docs/spec_topics/pi-integration-contract/subagent.md` launch synopsis:
  `pi --theta <dirs> --mode json -p "/<slug>" --no-session …` — plural
  `<dirs>` in one flag slot, consistent with the discovery convention. The
  launch-contract carrier table (`#subagent-launch-contract`) has **no row**
  for the discovery roots at all — the synopsis is the only statement — which
  is the spec gap the implementation drifted through.
- `assembleSubagentArgv`'s own contract comment: "`--theta <dir>` (repeated)
  so the child re-discovers the callee `.theta` and its `.thetalib` imports" —
  the *intent* (child re-discovers the callee from every parent root) is the
  expected behaviour; the repeated-flag *mechanism* is what fails.

## Actual behaviour / root cause sketch

Four links, each verified:

1. **The launcher emits the repeated form.**
   `src/runtime/subagent-launcher.ts:241`:
   ```ts
   for (const dir of input.thetaDirs) {
     argv.push("--theta", dir);
   }
   ```
   `thetaDirs` is the parent's `activeRoots` — the de-duplicated `dirname`
   union of every discovered theta (`production-composition.ts:412`) — so any
   parent with thetas from two directories emits two flags.
2. **The host keeps the last occurrence.** Pi's argv parser
   (`dist/cli/args.js:184`, identical at 0.80.10 and 0.82.1) stores
   extension flags in a `Map`: `result.unknownFlags.set(flagName, next)` —
   the second `--theta` overwrites the first. Downstream
   (`dist/core/agent-session-services.js`, `applyExtensionFlagValues`) copies
   map entries into the runtime's per-name `flagValues` map, and `getFlag` is
   declared `boolean | string | undefined`
   (`dist/core/extensions/types.d.ts:889`) — no array exists anywhere on the
   path.
3. **The child reader never sees the lost roots.** `readThetaFlagPaths`
   (`production-composition.ts:1769`) receives the single surviving string.
   Its array branch — added by commit `87bd9fb4` citing "DISCLI-1" — is
   dead code against this host; no `DISCLI` anchor exists anywhere under
   `docs/` (grep and `git log -S` over docs history both come up empty; the
   ID appears only in that docstring and its test). That same commit message
   records "repeated-flag remains last-wins as pi resolves it today" — the
   reader side documented the host reality that the launcher side violates.
4. **The failure surfaces two layers away.** The unregistered slug rides
   `-p "/<slug>"` as prose; the child exits without the reserved-key envelope;
   `driveSubagentChild` (`src/runtime/subagent-json-driver.ts:166`) maps it
   through `mapExitWithoutEnvelope` (`src/runtime/subagent-envelope.ts:279`)
   to `Err(InvokeInfraError { cause: "internal_error" })` plus
   `theta/runtime/subagent-exit-without-envelope`. No diagnostic mentions
   `--theta`, discovery, or the dropped roots.

## Why it matters

- **Silent root loss.** Nothing warns. `--theta` is the highest-priority
  discovery source and an *explicit* reference — DISC-2 makes a missing
  `--theta` path an error — yet here whole roots vanish without any
  diagnostic, in a child process the operator never sees.
- **Wrong attribution, far from cause.** The operator gets
  `internal_error` at the envelope layer (SNK-i note "invoke of
  `<callee_path>` failed (internal_error)"), which reads as a runtime defect
  in the subagent machinery. It cost a live debugging session during the
  bug-0004 verification to trace it back to argv assembly.
- **Order-dependent, so it looks flaky.** Which root survives depends on
  `activeRoots` iteration order; adding or removing an unrelated theta
  re-orders the casualty list. Any parent mixing sources — project
  `.pi/theta/` plus one `--theta` dir, or two packages — is exposed.
- **Second-order containment shrink (by construction, not observed live).**
  The child recomputes its own `activeRoots` from what it discovers, and that
  union backs the INV-5 `invoke`-path containment check — so even when the
  callee itself survives (it lives in the last root), a cross-root
  `invoke(...)` that was legal in the parent resolves outside the child's
  shrunken root union and fails as `theta/load/invoke-path-escape`.

## Options

1. **Emit one `path.delimiter`-joined `--theta` value** (recommended):
   `argv.push("--theta", input.thetaDirs.join(PATH_DELIMITER))` (empty set →
   omit the flag). Verified viable end-to-end: `readThetaFlagPaths` already
   splits every occurrence on `PATH_DELIMITER`
   (`production-composition.ts:1779`), and the repro matrix shows
   `--theta "A;B"` registering both roots today with no reader change. This
   is also the documented operator-facing convention, so parent-emitted and
   operator-written argv converge on one form. Inherited caveat (same as the
   operator flag): a root path containing the delimiter itself cannot be
   escaped — the discovery spec already accepts this limitation for `--theta`.
   The fix should also add the missing discovery-roots row to the
   `#subagent-launch-contract` carrier table and correct the dangling
   "DISCLI-1" citation in `readThetaFlagPaths` to cite the host's actual
   last-wins behaviour (`dist/cli/args.js`) instead of a nonexistent anchor.
2. **Env-var channel** (e.g. `PI_THETA_SUBAGENT_ROOTS` as a JSON array,
   beside the PIC-58 marker): immune to delimiter collision, but adds a second
   discovery input the spec must define, ranks against the five documented
   sources, and diverges child argv from the documented flag form — heavier
   than the defect warrants while option 1's caveat stays theoretical.

Either way, a regression fixture should pin a two-root parent invoking a
callee in the **first** root through a spawned child (the repro matrix above
is the shape), and the exit-without-envelope path should keep its fail-closed
mapping — the fix is upstream of it.

## Non-goals

- Changing host Pi's flag parsing (last-wins for repeated extension flags is
  host behaviour this extension must consume as-is).
- Changing the operator-facing `--theta` convention or discovery priority.

## Provenance

- Spec measured against: `docs/spec_topics/discovery/discovery-sources.md`
  (CLI source, DISC-2), `docs/reference/discovery-cli.md`,
  `docs/spec_topics/pi-integration-contract/subagent.md` (launch synopsis,
  `#subagent-launch-contract`, PIC-59), `docs/spec_topics/pi-integration-contract/host-prerequisites.md`
  (`#theta-flag-namespace-presupposition` — records flag-slot presuppositions,
  says nothing about repetition), `docs/spec_topics/invocation.md` (INV-5).
- Implementation: `src/runtime/subagent-launcher.ts` (`assembleSubagentArgv`),
  `src/extension/production-theta-producer.ts` (launch input,
  `activeRoots` threading), `src/extension/production-composition.ts`
  (`activeRoots`, `readThetaFlagPaths`), `src/extension/factory.ts`
  (`registerFlag("theta", { type: "string" })`),
  `src/runtime/subagent-json-driver.ts` / `src/runtime/subagent-envelope.ts`
  (`mapExitWithoutEnvelope`). History: commit `87bd9fb4` (array-branch
  hardening; commit message records the host's last-wins resolution).
- Host: `@earendil-works/pi-coding-agent` `dist/cli/args.js` (unknown-flag
  `Map`), `dist/core/agent-session-services.js` (`applyExtensionFlagValues`),
  `dist/core/extensions/types.d.ts` (`getFlag` signature) — read at 0.80.10
  (repo `node_modules`) and 0.82.1 (installed host); identical parsing.
- Found live during the bug-0004 fix verification (misattributed
  `internal_error`); reproduced mechanically with the token-free matrix above.
