# Bug 0462 — the composition-root package merge substitutes a first-wins name-claim for the five-tier adjudication: a global (priority-5) theta silently beats a same-named package (priority-4) theta, no package-involved shadow ever emits `theta/load/cross-source-shadow`, and two packages shipping the same stem register the enumeration-first copy where DISC-4's own worked example mandates every colliding theta drop with one error

- **Status:** fixed (0.447.0).
- **Sev/Diff estimate:** S2/D2 — S2: silent wrong registered set on
  documented-legal configurations. Face (i) is a priority inversion: the spec
  fixes the package copy as the winner and the implementation registers the
  global copy, with zero diagnostics — the dispatched `/name` body is the
  wrong file (silent wrong dispatch; only its position in the registration
  pipeline rather than a value pipeline keeps this out of S1). Face (iii)
  registers a theta DISC-4 orders dropped (silent permissive acceptance) and
  withholds the mandated error. Face (ii) withholds a mandated warning on
  every package-involved shadow, so the operator diagnosing a "missing"
  package theta gets nothing. D2: the clean fix routes package candidates
  through the walk's existing `resolveSlashNames` (the machinery — priority
  map with `package: 4`, `SourcedCandidate.descriptorValue`, the shadow/
  collision mints — all exists and already spells the package arms), but it
  is a multi-seam threading (package walk → SourcedCandidate shape → walk
  entry point or a second adjudication pass) and must displace a recorded-
  but-unlocatable design note (the merge comment defers to a `notes.md` that
  does not exist in the tree), so an adjudication is owed on whether any
  simplification stands.
- **Kind:** defect — implementation diverges from two stated rules:
  `docs/spec_topics/discovery/discovery-sources.md:45` ("When the same slash
  name resolves from multiple sources, the higher-priority source wins and
  `theta/load/cross-source-shadow` is emitted naming both sources") with the
  priority list `:47-51` (CLI 1 … Packages 4, Global 5), and DISC-4 `:82-84`
  ("two packages each shipping `code-review.theta` … **every colliding theta
  drops** and none register (not just two: three packages each shipping
  `lint.theta` produces a single error listing all three paths)").
- **Related:**
  - 0331 (fixed 0.323.0) — the same defect CLASS one process-boundary later:
    a carrier that cannot represent the tier structure re-adjudicates a
    configuration the spec already resolved. Here the lossy carrier is the
    in-process merge point itself.
  - 0339-era `packageWalk.roots` work made package roots first-class for
    watching; the adjudication never followed.
  - 0440 (fixed 0.420.0) — enabling ground (it widened the descriptor kind
    set to five and pinned `package:"<npm name>"`, which §Expected's bytes
    rely on) AND a pinned-disposition TENSION, named so a fixer does not
    read it as ratification: its §Non-goals record "registration, priority,
    dedup, and winner-selection outcomes unchanged"
    (`docs/bugs/0440-cross-source-shadow-descriptor-form.md:252`) was
    measured on walk-side pairs only — the package tier never reaches the
    walk's adjudication, so that pin never measured (and does not ratify)
    the merge's outcomes.
  - `tests/e2e-s6-package-merge.test.ts:147` — pins ONLY the conformant
    direction (project claims the name, package drops); its harness stubs
    `pi.sendMessage` as a no-op (`:75`) and captures no diagnostics at all,
    so the suite cannot see any of the three faces.
  - [bug 0459](./0459-cross-format-collision-message-suffix-sibling-order-and-spelling.md) — the collision-message rendering at the
    walk mints; this report is about emissions/outcomes that never reach
    those mints.
  - [bug 0463](./0463-package-source-bypasses-disc3-validation.md) — the same bypass's DISC-3/DISC-2
    validation face (invalid stems, case-collisions, readability), separable
    fix surface.
  - [bug 0458](./0458-package-theta-bypasses-pi-owned-collision-guard.md) — the theta-vs-Pi-owned face of the same
    bypass (a package theta whose name a Pi prompt owns registers and
    preempts dispatch; DISC-4 orders it dropped): observed in this sweep's
    probe too, but that face — plus its host-dispatch evidence and the
    next-`session_start` re-evaluation face — is that report's; not claimed
    here. Mutual: same merge seam, disjoint rule families; §Fix option 1
    closes both.
- **Affected** (verified at 401a425b, v0.437.0):
  - `src/extension/production-composition.ts:640-647` — the merge point:
    `const claimed = new Set(walk.thetas.map((theta) => theta.name))` then
    `if (!claimed.has(pkg.name)) { … discovered.push(…) }` — name-claim
    first-wins; no priority comparison, no diagnostic, package thetas never
    enter any collision/shadow mint. The block comment `:627-633` states the
    behaviour ("not already claimed by a higher-priority (CLI / settings /
    project) or **lower-priority (global)** discovered theta") and cites
    "notes.md for the priority-tiebreak simplification" — no `notes.md`
    exists in the tree (`ls *.md docs/*.md`; `rg -n "priority-tiebreak"`
    matches only this comment).
  - `src/discovery/discovery-walk.ts:100-107` — `PRIORITY` already carries
    `package: 4` between `project: 3` and `global: 5`; `resolveSlashNames`
    (`:1436-1518`) implements the winner/shadow/collision rules the merge
    bypasses; `:1189-1191` ("Package (priority 4) — owned by V10b; not
    plumbed into this walk yet").
  - `src/discovery/package-discovery.ts:690`, `:740-742` — the package walk
    dedups by absolute path only (`registered`) and returns every same-stem
    candidate; nothing downstream adjudicates them.
- **Observed at:** 401a425b (v0.437.0), offline — scratch vitest driving the
  real `createThetaExtension` → `composeExtensionInstance` over a real temp
  workspace (the `tests/e2e-s6-package-merge.test.ts` harness shape with
  note capture; `PI_CODING_AGENT_DIR` redirected for the global root).
  Written, run, deleted.

## Summary

`discoverThetas` defers the package source; `composeExtensionInstance` merges
`discoverPackageThetas`' results by name-claim: any walk theta — including a
GLOBAL one, the lowest tier — blocks a same-named package theta, and the
first package copy (host `readdir` enumeration order) blocks every later one.
No branch of the merge emits a diagnostic. Three spec rules are silently
unenforced for exactly one source: the priority order (package > global), the
shadow-warning mandate for every cross-tier pair involving a package, and the
DISC-4 same-tier drop-all rule for package-vs-package collisions.

## Reproduction

Offline, deterministic, at 401a425b. Real temp workspace, HOME/USERPROFILE
and `PI_CODING_AGENT_DIR` redirected under it; thetas discriminated by
`description:` frontmatter; notes captured off `pi.sendMessage`.

1. Face (i) — global vs package. `<agentdir>/theta/gp.theta`
   (`description: global-copy`) + `node_modules/pkg-a/theta/gp.theta`
   (`description: pkg-a-gp`):

   ```
   F1 registrations: ["gp"]     F1 desc: {"description":"global-copy"}
   F1 notes (theta/load/*): []
   ```

   Control (package copy alone): `F1c desc: {"description":"pkg-a-gp"}` —
   the package copy is healthy and registers when unopposed.

2. Face (ii) — project vs package (winner correct, warning missing).
   `.pi/theta/dup.theta` + `node_modules/pkg-a/theta/dup.theta`:

   ```
   F2 registrations: ["dup"]    F2 shadow notes: []    F2 all load notes: []
   ```

3. Face (iii) — package vs package. `node_modules/pkg-a/theta/lint.theta` +
   `node_modules/pkg-b/theta/lint.theta`:

   ```
   F3 registrations: ["lint"]   F3 desc: {"description":"pkg-a-lint"}
   F3 collision notes: []
   ```

4. Control F4 — project vs global, a pure walk-tier pair in the SAME pass
   (`.pi/theta/wt.theta` + `<agentdir>/theta/wt.theta`):

   ```
   F4 registrations: ["wt"]     F4 desc: {"description":"project-wt"}
   F4 notes: ["theta/load/cross-source-shadow: slash name 'wt' shadowed across discovery
    sources: 'project:\"…/.pi/theta\"' wins over 'global:\"…/.pi/agent/theta\"'"]
   ```

   The same run DOES emit the shadow warning — in the 0440 descriptor form —
   for a walk-tier collision, so the silence in faces (i)–(iii) is specific
   to package-involved pairs, not a harness capture artefact.

## Expected behaviour

- (i) `discovery-sources.md:45`/`:50-51`: the package copy (tier 4) wins over
  the global copy (tier 5); one `theta/load/cross-source-shadow` warning
  renders `'package:"pkg-a"' wins over 'global:"<agentdir>/theta"'` (kinds
  and value derivations per `discovery-sources.md#descriptor-kinds`).
- (ii) the project copy wins AND the same warning fires naming
  `project:"…"` over `package:"pkg-a"` — the emission is part of the rule's
  sentence, not optional.
- (iii) DISC-4 `:84`: both `lint.theta` copies drop, none register, one
  `theta/load/cross-format-collision` error lists both paths — the spec's
  own worked example is two packages shipping one stem.

## Actual behaviour / root cause

The merge point (`production-composition.ts:640-647`) models the package
source as "fill names the walk left free": membership in `claimed` is the
whole adjudication. Priority is honoured only accidentally for tiers 1-3
(they happen to be walk sources that pre-claim); it inverts for tier 5, and
within tier 4 the DISC-4 drop-all rule degrades to enumeration-order
first-wins. No mint site is reachable: `resolveSlashNames` never sees a
package candidate, and the merge loop has no emitter. The deferral is
acknowledged in comments on both sides ("not plumbed into this walk yet";
"priority-tiebreak simplification") but the referenced design record
(`notes.md`) is absent from the tree, and the spec carries no corresponding
carve-out — `discovery-sources.md` states the five-tier rule unqualified.

## Why it matters

- A user who installs a package to get `/gp` while an old copy sits in the
  global directory silently runs the stale global body on every dispatch —
  wrong file, zero diagnostics, and the shadow note that exists precisely to
  explain such states is absent (its *Hint* — "Remove the lower-priority
  entry" — is exactly the remedy).
- Two installed packages shipping a same-named theta is the ordinary
  ecosystem collision DISC-4 legislates for; instead of the mandated loud
  drop-all, whichever package sorts first in the roots' `readdir` silently
  wins — an ordering no operator controls or observes.
- The e2e suite pins the one conformant direction, so the divergences are
  regression-invisible.

## Non-goals

- The Pi-owned (template-vs-theta) face of the same bypass — candidate
  prompt-templates/01 (observed; recorded under Related).
- DISC-3 validity / case-collision / readability bypass for package
  candidates — [bug 0463](./0463-package-source-bypasses-disc3-validation.md).
- The collision/shadow message RENDERING at the walk mints — candidate
  prompt-templates/02 and fixed ground 0440.
- The package walk's own internals (DISC-5/DISC-6 selection, caps,
  descriptors) — conformant per 0076/0077/0113 fixed ground; not re-measured.

## Fix

Options:

1. **Plumb the package source into the walk's adjudication (recommended).**
   Have `discoverPackageThetas` (or the composition) shape package candidates
   as `SourcedCandidate`s (`source: "package"`, `descriptorValue` = the npm
   package name per `#descriptor-kinds`) and run them through
   `resolveSlashNames` with the walk candidates — one adjudicator, all five
   tiers, shadows and collisions fall out with the already-fixed 0440
   rendering. Requires ordering care (package discovery is bounded/async and
   currently starts after the walk) and either a two-phase walk API or moving
   the package walk ahead of `resolveSlashNames`; the sibling validation
   stages (candidate 04) ride the same threading. Delete the dead `notes.md`
   reference either way.
2. **Replicate the adjudication at the merge point.** Keep the two-stage
   architecture; replace the `claimed` set with a per-name comparison against
   `walk.thetas` (+ intra-package grouping): package beats global (re-run the
   affected name through a mini-adjudicator), emit shadow/collision through
   the same message mints (would need exporting them or duplicating
   templates — duplication risks the 0440 class again). Smaller structural
   change, second adjudicator to keep in lock-step.
3. **Spec-side acceptance** — amend `discovery-sources.md` to state the
   shipped tiebreak (package fills unclaimed names only; intra-package
   first-wins). Rejected-shaped: it ratifies the priority inversion and
   silent drops, contradicts DISC-4's worked example, and 0331's fix already
   rejected the mode-split-acceptance shape for the same class.

Any fix must keep: settings/CLI dedup-before-collision (`:89`), the marked-
root pre-emption (0331), and the e2e-s6 conformant direction; and must add
witnesses for all three faces (global-vs-package winner + shadow bytes;
project-vs-package shadow; two-package drop-all + single error listing both
paths).

## Provenance

discovery-precedence bug-hunt sweep at 401a425b (v0.437.0), hunt lead (a)
(the full pairing matrix; the walk-level pairings all probed conformant —
see the hunt log). Probe `tests/scratch-pkg-merge.test.ts` cells
F1/F1c/F2/F3 (deleted; outputs quoted verbatim). Merge-point and walk
citations read at the pin.

## Fix (0.447.0)

- What shipped: `src/discovery/discovery-walk.ts` — package candidates routed through the walk's `resolveBySource → validateAndRead → resolveSlashNames` as priority-4 `SourcedCandidate`s (`DiscoveryInput.packageCandidates`), so all three faces close on the existing adjudicator: (i) package (tier 4) wins over global (tier 5) with the 0440 `cross-source-shadow` rendering, (ii) project-over-package shadow fires, (iii) two same-stem packages drop-all with one `cross-format-collision`. `src/discovery/package-discovery.ts` — `descriptorValue` (npm package name) added for the `package:"<name>"` descriptor, AND package-identity dedup added inside the walker (`seenPackages`, first-in-DISC-6-root-order wins, silent) so a same package present in a project + global root resolves to the project copy without a diagnostic (`package-and-settings.md:30` / `discovery-sources.md:89`), not a spurious drop-all. `src/extension/production-composition.ts` — the `!claimed.has` merge loop and the dead `notes.md` reference deleted.
- Gates: witnesses `tests/b0462-package-merge-priority-adjudication.test.ts` (faces i/ii/iii + control) and `tests/b0462-package-identity-dedup.test.ts` red→green; full default suite `npm test` 10677/10677 green; `npx tsc -p tsconfig.json --noEmit` exit 0; `npm run lint` exit 0.
- Review: 2 rounds. R1 (deep) — F1 correctness (this fix's package-identity dedup regression), F2/F3 test-fidelity; all fixed. R2 (fast) — CLEAN.
- Verification: SOLID — witness-revert red-both-directions proven (neutralize the walk push → faces red; neutralize the dedup skip → only the identity-dedup witness reds, proving separation; restore → green, byte-exact); full suite 10677/10677; lint + typecheck clean; one adjacent H9a live cell green over the reordered composition root.
- Residuals: none blocking. Live-obligation WHY offline suffices: the tier-adjudication delta is the model-independent `session_start` registration decision, fully witnessed offline through the shipped `composeExtensionInstance` over real `node_modules` package fixtures; load diagnostics are not streamed to `pi -p` stdout (b0334live).
- Discharge notes appended: none.
- Pinned dispositions / non-goals: priority list / DISC-4 drop-all now enforced for the package tier via the single walk adjudicator (no second adjudicator; the 0440-class duplication avoided); Pi-owned face is 0458's, DISC-3 validation face is 0463's, both landed in the same shared threading; walk-mint message rendering untouched (0459).
