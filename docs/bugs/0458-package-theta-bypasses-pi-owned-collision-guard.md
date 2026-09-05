# Bug 0458 — A package theta same-named as a Pi-owned `.md` prompt template bypasses the Pi-owned collision guard entirely: the composition-root merge never consults `piOwnedNames`, the theta registers with zero diagnostics, and the pinned host's dispatch order lets it silently preempt the user's template — DISC-4's next-`session_start` re-evaluation also never drops it

- **Status:** fixed (0.446.0).
- **Sev/Diff estimate:** S2/D2 — S2: silent wrong dispatch end-to-end (a
  package-shipped `.theta` steals `/name` from a user-authored
  `.pi/prompts/<name>.md` template with zero diagnostics on any channel — the
  exact preemption `discovery-sources.md:91` says "is not supported"); D2: the
  fix is one merge-seam rework (thread the package candidates through
  `resolveSlashNames` or replicate the Pi-owned check at the merge), shared
  with the sibling faces of the same seam ([bug 0462](./0462-package-merge-bypasses-priority-adjudication.md),
  [bug 0463](./0463-package-source-bypasses-disc3-validation.md)), and it must adjudicate how the V10b
  "not plumbed into this walk yet" deferral closes.
- **Kind:** defect — implementation diverges from DISC-4 rule 2
  (theta-vs-Pi-owned: the theta drops with
  `theta/load/cross-format-collision`; "the theta never preempts a non-theta
  registration") and from DISC-4's post-registration re-evaluation clause.
  Secondary test-infrastructure aspect: the committed S6 gate pins the merge
  as correct.
- **Related:**
  - [bug 0462](./0462-package-merge-bypasses-priority-adjudication.md) — the SAME merge-seam bypass's
    tier-adjudication faces (package-vs-global priority inversion, missing
    `theta/load/cross-source-shadow` on every package-involved pair,
    two-package drop-all): those faces are that report's, not this one's.
    Mutual: same seam, disjoint rule families; §Fix option 1 (route package
    candidates through `resolveSlashNames`) closes both.
  - [bug 0463](./0463-package-source-bypasses-disc3-validation.md) — the same bypass's DISC-3/DISC-2
    per-candidate validation face; third report on the shared threading.
  - 0440 (fixed 0.420.0) — pinned-disposition TENSION, named so a fixer does
    not read it as ratification: its §Non-goals record "registration,
    priority, dedup, and winner-selection outcomes unchanged"
    (`docs/bugs/0440-cross-source-shadow-descriptor-form.md:252`) — measured
    on walk-side pairs only; the package tier never reaches the walk's
    adjudication, so that pin never measured (and does not ratify) the
    merge's outcomes.
  - 0331 (fixed 0.323.0) — the marked-root winner threading INTO
    `discoverThetas` shows the walk is the intended single adjudication
    point; the package source is the one source still outside it.
  - 0339 (fixed 0.321.0) — package-source watch arming; adjacent seam, no
    overlap with collision resolution.
  - 0024 (fixed 0.36.0) — PIC-69 own-registration exclusion; defines the
    collision source set the package merge never consults.
  - [bug 0459](./0459-cross-format-collision-message-suffix-sibling-order-and-spelling.md) — the message-form divergences of the
    diagnostic the walk arm does emit (this report is about the arm that
    emits nothing).
- **Affected** (verified at 401a425b, v0.437.0):
  - `src/extension/production-composition.ts:626-646` — the package merge:
    `discoverPackageThetas` is called without `piOwnedNames` and the merge
    loop admits a package theta on the bare `!claimed.has(pkg.name)` test —
    no Pi-owned comparison, no diagnostic. The block comment `:627-633`
    defers to "notes.md for the priority-tiebreak simplification"; no
    `notes.md` exists in the tree.
  - `src/extension/production-composition.ts:617-624` — `readPiOwnedCommands`
    output is threaded into `discoverThetas` only; the walk's collision
    machinery (`resolveSlashNames`) therefore never sees package candidates.
  - `src/discovery/discovery-walk.ts:1457-1467` — the Pi-owned guard
    (`piNames.has(name)` at `:1458`, mint `:1462-1464`) every other source
    passes; `:1190` — "Package (priority 4) — owned by V10b; not plumbed
    into this walk yet".
  - `tests/e2e-s6-package-merge.test.ts:24-27,147-167` — the committed gate
    pins the merge as correct. Nuance: its only constructed claim is the
    project (higher-priority) direction (`:147-167`); the lower-priority/
    global direction lives in the header comment's prose (`:24`), not in an
    assertion, and the harness stubs `pi.sendMessage` as a no-op (`:75`), so
    it captures no diagnostics at all. It also cites a
    "priority-tiebreak simplification" in a `notes.md` that does not exist
    in the repository, and carries stale `production-composition.ts:571-584`
    / `:319-334` line cites.
  - Host evidence (vendored dist of the pinned SDK,
    `@earendil-works/pi-coding-agent@0.80.10`,
    `dist/core/agent-session.js:798-826`): `prompt()` dispatches extension
    commands (`_tryExecuteExtensionCommand`, `:806`) and returns on
    `handled` BEFORE `expandPromptTemplate` (reached only at `:829-831`),
    so a registered theta preempts a same-named prompt template in every
    dispatch.
- **Observed at:** v0.437.0 (401a425b), offline — factory +
  `composeExtensionInstance` over a real temp workspace (the S6 harness shape
  with capturing `pi.sendMessage` / `ctx.ui.notify`); scratch probe deleted,
  reconstruction in §Reproduction.

## Summary

`discoverThetas` adjudicates slash-name collisions for four of the five
discovery sources, and its Pi-owned guard drops a theta colliding with a
`prompt`/`skill`/`extension` entry. The package source (priority 4) is merged
in afterwards at the composition root with a single membership test —
`!claimed.has(pkg.name)` — so a package theta is never compared against
`piOwnedNames`. A package shipping `promptdup.theta` while Pi has a prompt
template `/promptdup` registers the theta cleanly; DISC-4 rule 2 mandates the
theta drop with `theta/load/cross-format-collision`. Because the pinned host
dispatches extension commands before template expansion, the registered theta
silently captures `/promptdup` — the user's template stops running with no
diagnostic from either side.

The next-cycle re-evaluation DISC-4 prescribes for a template that appears
after registration ("the next `session_start` cycle re-evaluates and drops
the previously-registered theta") also never happens for a package theta —
every pass re-admits it through the same unchecked merge.

(The tier-adjudication divergences at the same merge — a package theta losing
to a global theta against the pinned priority order, the missing
`cross-source-shadow` on every package-involved pair, and the two-package
drop-all — are [bug 0462](./0462-package-merge-bypasses-priority-adjudication.md)'s, not claimed here.)

## Reproduction

Offline, at 401a425b. Scratch vitest (deleted) modelled on
`tests/e2e-s6-package-merge.test.ts` — factory wired to
`composeExtensionInstance` with `HOME`/`USERPROFILE` redirected to the temp
workspace, `pi.sendMessage` content and `ctx.ui.notify` captured.

1. `node_modules/pkg-a/package.json` (`{"name":"pkg-a","version":"1.0.0"}`)
   and `node_modules/pkg-a/theta/promptdup.theta` (minimal prompt theta).
2. Harness `pi.getCommands()` returns `[{ name: "promptdup", source:
   "prompt" }]` (the shape the pinned host reports for
   `.pi/prompts/promptdup.md`, `agent-session.js:1834-1839`).
3. Fire `session_start`.

Observed: `registrations: ["promptdup"]`; captured notes: `[]`; toasts:
`[]`. The theta registers; no `theta/load/cross-format-collision` on any
channel.

Control (same run, walk arm): `.pi/theta/promptdup2.theta` against a
`{ name: "promptdup2", source: "prompt" }` entry → not registered, one note
`theta/load/cross-format-collision: slash name 'promptdup2' collides at the
same priority: …` — the walk arm works; the package arm alone bypasses it.

## Expected behaviour

`docs/spec_topics/discovery/discovery-sources.md:85` (DISC-4 rule 2): when a
`.theta` collides with "a Pi-owned `.md` prompt, `.md` skill, or another
extension's command … only the colliding theta(s) drop and the Pi-owned entry
stays registered"; `:91`: "the theta extension refuses to register the
colliding theta and emits the same diagnostic naming both the `.theta` path
and the colliding entry … Cross-format shadowing in either direction is not
supported in theta 1.0 … the theta never preempts a non-theta registration",
and, for a template appearing after registration, "the next `session_start`
cycle re-evaluates and drops the previously-registered theta". The rule is
stated over candidate thetas generally — packages are one of the five sources
(`:47-51`).

## Actual behaviour / root cause

`runComposePass` (`production-composition.ts:617-646`) runs the walk (four
sources) with `piOwnedNames`, then merges `discoverPackageThetas` results
with:

```ts
const claimed = new Set(walk.thetas.map((theta) => theta.name));
for (const pkg of packageWalk.thetas) {
  if (!claimed.has(pkg.name)) {
    claimed.add(pkg.name);
    discovered.push({ name: pkg.name, path: pkg.path, source: "package" });
  }
}
```

No `piNames` membership test exists on the package path. The composed fixture
is then registered by `registerFixtures` (`factory.ts`) with no later
Pi-owned check, and the pinned host's `prompt()` tries
`_tryExecuteExtensionCommand` before `expandPromptTemplate`
(`agent-session.js:798-826`, expansion at `:829-831`), so the theta wins
every dispatch. Because every `session_start` pass re-runs the same unchecked
merge, DISC-4's re-evaluation clause never fires for the package tier either.

The in-walk guard already exists (`discovery-walk.ts:1457-1467`); the package
source is simply never fed to it. The comment at
`production-composition.ts:631-633` defers to "notes.md for the
priority-tiebreak simplification"; no `notes.md` exists at the pin, and the
spec was never relaxed.

## Why it matters

- A pi package can — deliberately or accidentally — ship a theta that
  silently captures the slash name of a user's or project's prompt template.
  The template author sees `/name` run a foreign theta with zero
  diagnostics anywhere (impact class 1: silent author-intent drop). The
  spec's asymmetric-loser rule exists precisely to make this impossible.
- `tests/e2e-s6-package-merge.test.ts` pins the merge as correct and captures
  no diagnostics at all, so the divergence is invisible to the suite
  (test-infrastructure aspect).

## Non-goals

- The package-vs-global priority inversion, the missing
  `theta/load/cross-source-shadow` on package-involved pairs, and the
  two-package same-stem drop-all — [bug 0462](./0462-package-merge-bypasses-priority-adjudication.md) owns
  those faces of the same merge seam.
- The DISC-3 validity / case-collision / DISC-2 readability bypass for
  package candidates — [bug 0463](./0463-package-source-bypasses-disc3-validation.md).
- The message form of the diagnostics the walk arm does emit — candidate
  prompt-templates/02.
- Package-level dedup (project copy of a package beats global copy) —
  conformant per `package-and-settings.md:30`, untouched.
- The sibling-extension indistinguishability limitation (PIC-69) — recorded
  in spec and code; not contested.
- Pi's own dispatch precedence (extension-before-template) — host behaviour,
  cited as evidence only.

## Fix

Options:

1. **Plumb package candidates into the walk's `resolveSlashNames`
   (recommended; shared threading with [bug 0462](./0462-package-merge-bypasses-priority-adjudication.md)
   option 1 and [bug 0463](./0463-package-source-bypasses-disc3-validation.md) option 1).** Extend
   `DiscoveryInput` with the package-walk results (or run the package walk
   inside `discoverThetas`), so the Pi-owned guard covers source `package`
   with zero new logic. Retires the composition-root merge loop.
   Constraint: `discoverPackageThetas` needs `clock`/bounds the walk does not
   currently take, so either thread them through `DiscoveryInput` or keep the
   package scan outside and pass only its candidates in.
2. **Replicate the Pi-owned check at the merge.** Smaller diff (compare
   against `piOwnedNames`, mint the collision diagnostic inline), but
   duplicates adjudication logic the walk owns and leaves two mint sites for
   the same code — the drift shape 0440 §Fix consolidated away.

Either way the fix must witness the face both directions: a package theta
colliding with a Pi-owned prompt template drops with the registry-template
message, and a subsequent `session_start` pass after a template appears
drops a previously-registered package theta (the DISC-4 re-evaluation
clause). Whichever fix on this merge seam lands FIRST (this one, candidate
discovery-precedence/03, or [bug 0463](./0463-package-source-bypasses-disc3-validation.md)) must delete
the dead `notes.md` reference at `production-composition.ts:632` and re-pin
the currently-green `tests/e2e-s6-package-merge.test.ts` gate.

## Provenance

prompt-templates bug-hunt sweep (wave 6) at 401a425b (v0.437.0). Found by
reading the `runComposePass` merge against DISC-4 after mapping where
`readPiOwnedCommands` output flows; confirmed by scratch probe
`tests/scratch-pt-package-merge.test.ts` (deleted; run recorded in the hunt
log): the divergent registration green, control (walk arm) drops correctly.
The tier-adjudication faces observed in the same probe are recorded in
[bug 0462](./0462-package-merge-bypasses-priority-adjudication.md) (which also observed this face as its
probe cell F4) — each face ships exactly once.

## Fix (0.446.0)

- What shipped: `src/discovery/discovery-walk.ts` — `DiscoveryInput.packageCandidates` added; the walk pushes them into `candidates` as priority-4 `SourcedCandidate`s before `resolveBySource`, so the Pi-owned guard in `resolveSlashNames` (`piNames.has(name)`) now covers source `package` with zero new logic (§Fix option 1); the stale "not plumbed into this walk yet" comment is deleted. `src/extension/production-composition.ts` — the bounded `discoverPackageThetas` scan runs first and its results are handed to `discoverThetas` as `packageCandidates`; the `!claimed.has(pkg.name)` merge loop and the dead `notes.md` reference are deleted. `src/discovery/package-discovery.ts` — `PackageDiscoveredTheta.descriptorValue` (the npm package name) added. `tests/e2e-s6-package-merge.test.ts` re-pinned (comment-only; assertions unchanged).
- Gates: witness `tests/b0458-package-theta-pi-owned-collision.test.ts` (drop-with-`cross-format-collision` + the DISC-4 re-evaluation clause) red→green; full default suite `npm test` 10677/10677 green; `npx tsc -p tsconfig.json --noEmit` exit 0; `npm run lint` exit 0.
- Review: 2 rounds. R1 (deep) — F1 correctness (package-identity dedup regression), F2/F3 test-fidelity; all fixed. R2 (fast) — CLEAN, no correctness/fidelity/spec findings.
- Verification: SOLID — witness-revert red-both-directions proven (neutralize the walk push → all four witnesses red; restore → green, byte-exact); full suite 10677/10677; lint + typecheck clean; one adjacent H9a live cell (area (a) prompt-sentinel via real `pi -p`) green over the reordered composition root.
- Residuals: none blocking. Live-obligation WHY offline suffices: the fix's delta is the model-independent `session_start` registration decision, fully witnessed offline through the shipped `composeExtensionInstance` over real `node_modules` package fixtures; load diagnostics are not streamed to `pi -p` print-mode stdout (b0334live), so the live host adds no observability for this fix; the unchanged host dispatch chain is already covered by H9a (a)–(i).
- Discharge notes appended: none.
- Pinned dispositions / non-goals: package-level dedup preserved and now runs spec-correctly inside the package walker (`package-and-settings.md:30` / `discovery-sources.md:89`); walk-arm message form untouched (owned by 0459); 0462/0463 rule families landed in the same shared threading.
