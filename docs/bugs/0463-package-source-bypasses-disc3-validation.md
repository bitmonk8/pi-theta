# Bug 0463 — package-sourced candidates skip the walk's whole per-candidate validation stage: a package shipping `Foo.theta` registers the slash command `Foo` with zero diagnostics where DISC-3 mandates `theta/load/invalid-slash-name` (error, no registration), and the package source alone never runs the DISC-3 case-collision or DISC-2 rule-1 per-file readability checks

- **Status:** fixed (0.448.0).
- **Sev/Diff estimate:** S2/D2 — S2: silent permissive acceptance — a stem the
  spec orders refused at load registers as a live command, under a name
  (`/Foo`) the naming grammar excludes, with no diagnostic anywhere; the
  sibling checks (case-collision warning + deterministic byte-first winner;
  unreadable-file warning) are likewise absent for exactly one source, so the
  per-source behavioural identity DISC-3 exists to guarantee ("behaviour
  identical across both" filesystem regimes) fails for package-shipped thetas.
  Not S1: no in-run value is wrong; the harm is a forbidden registration and
  missing mandated diagnostics. D2: the fix is the same plumbing decision as
  [bug 0462](./0462-package-merge-bypasses-priority-adjudication.md) (route package candidates through
  `resolveBySource` → `validateAndRead` → `resolveSlashNames`, all existing
  machinery) or a duplicated validation pass at the merge point; it shares the
  threading adjudication with 03 but is separable (validation can land
  without the priority re-adjudication and vice versa — distinct rule
  families, distinct witnesses).
- **Kind:** defect — implementation diverges from stated rules:
  `docs/spec_topics/discovery/discovery-sources.md:80` (DISC-3 Filename
  validity: stems not matching `^[a-z0-9][a-z0-9_-]*$` — `Foo.theta` is a
  listed example — "are rejected at load time with
  `theta/load/invalid-slash-name` (severity `error`); the file does not
  register and does not participate in collision detection", stated
  source-unqualified); `:76` (DISC-3 case-collision: "the loader compares
  discovered paths case-insensitively *per source*" — the package source is a
  source); `:66` (DISC-2 rule 1: unreadable discoverable `.theta` files
  warn `theta/load/unreadable` "regardless of source").
- **Related:**
  - [bug 0462](./0462-package-merge-bypasses-priority-adjudication.md) — the same merge-point bypass's
    priority/collision face; one plumbing fix (route package candidates
    through the walk pipeline) closes both, but each rule family needs its own
    witnesses and either could ship alone. Ordering dependency: this report's
    stage must run BEFORE whatever adjudicator that report installs — see
    §Fix.
  - [bug 0458](./0458-package-theta-bypasses-pi-owned-collision-guard.md) — the same merge point's theta-vs-Pi-owned
    face (package theta preempting a Pi prompt template); third report on the
    shared threading.
  - 0363 (fixed 0.355.0) — hardened stem derivation for explicit file
    references onto the on-disk entry; the package source sits outside that
    seam too (its stems come from the package walk's own `readdir`, so the
    0363 class does not recur here — the stem is honest, it is just never
    judged). Pinned-disposition TENSION a fixer could misread as
    ratification: its §Non-goals bullet 2 reads "Directory entries and
    conventional roots are unaffected: their candidates come from `readdir`
    and already carry on-disk names" — true of 0363's dishonest-stem defect,
    false as a conformance claim: a package `theta/` dir IS a conventional
    root reached by `readdir`, and its on-disk names are never judged.
  - 0076 (fixed 0.67.0) — gave the package walker the DISC-2 SOURCE-level
    failure modes (missing/unreadable roots); the per-FILE stage (validity,
    case, readability) was never added. Second pinned-disposition TENSION:
    its §Non-goals pin "the `theta/load/unreadable` per-file warning at
    `validateAndRead` … which is correct" was measured walk-side only — it
    does not ratify the package source's absence from that stage.
- **Affected** (verified at 401a425b, v0.437.0):
  - `src/discovery/package-discovery.ts:475-492` — the `resolvePiThetas`
    per-match arm (`thetas.set(entry.abs, splitExtension(entry.base).stem)`
    for a `.theta` match, `thetasInDirectory` for a directory match) — and
    `:536` `thetasInDirectory` (the conventional `theta/` collection, called
    at `:630-637` from the `field.kind === "absent"` fallback) — stems
    recorded unjudged on both arms; `rg -n
    "SLASH_NAME|invalid-slash-name|case-collision|CASE_COLLISION" 
    src/discovery/package-discovery.ts` matches nothing.
  - `src/discovery/discovery-walk.ts:1366-1398` (`validateAndRead`: the
    SLASH_NAME test, the `theta/load/invalid-slash-name` mint, the
    `fs.readBytes` probe and `theta/load/unreadable` mint) and `:1345-1363`
    (`resolveBySource` → `resolveCaseCollisions`) — the stages every other
    source passes; package candidates never enter (`discoverThetas` defers the
    package source, `:1189-1191`).
  - `src/extension/production-composition.ts:640-647` — the merge point pushes
    package thetas straight into `discovered`; `:648+` parses and registers
    them; no stem judgement exists downstream (`rg -n "SLASH_NAME" src/`
    matches `discovery-walk.ts` only).
  - Bound of the hazard — frontmatter/parse IS still judged:
    `production-composition.ts:648+` parses and composes every discovered
    theta uniformly, package-sourced included, so parse/frontmatter/binder
    diagnostics fire normally for package thetas. The bypass is exactly the
    three PRE-parse per-candidate stages (name grammar, intra-source case,
    file readability) — precisely the stages DISC-3 says run before parse. A
    fixer should not hunt a parse-side hole; there is none.
- **Observed at:** 401a425b (v0.437.0), offline — scratch vitest driving the
  real `createThetaExtension` → `composeExtensionInstance` over a real temp
  workspace (e2e-s6 harness shape). Written, run, deleted.

## Summary

The discovery walk enforces DISC-3 filename validity, DISC-3 intra-source
case-collision, and DISC-2 rule-1 per-file readability in a validation stage
(`resolveBySource` + `validateAndRead`) that package candidates never reach:
the package walk collects stems and paths, and the composition-root merge
registers the survivors directly. A package shipping a theta whose stem the
grammar refuses — including the spec's own `Foo.theta` example — produces a
registered `/Foo` command with zero diagnostics on every platform. The
case-collision and readability checks are likewise absent for the package
source only.

## Reproduction

Offline, deterministic, at 401a425b. Real temp workspace,
HOME/USERPROFILE/`PI_CODING_AGENT_DIR` redirected; note capture on
`pi.sendMessage`:

`node_modules/pkg-a/package.json` (`{"name":"pkg-a","version":"1.0.0"}`) +
`node_modules/pkg-a/theta/Foo.theta` (valid prompt-mode theta):

```
F5 registrations: ["Foo"]
F5 notes (theta/load/*): []
```

Control: the same `Foo.theta` under `.pi/theta/` draws
`error theta/load/invalid-slash-name: slash names must be lowercase
kebab/snake; rename the file (e.g. `code-review.theta`)` and does not
register (the walk's `validateAndRead` arm, exercised by the committed
discovery-walk suite).

## Expected behaviour

`discovery-sources.md:80`: the stem `Foo` fails
`^[a-z0-9][a-z0-9_-]*$`; the file draws `theta/load/invalid-slash-name`
(error) and does not register, identically to every other source — DISC-3's
stated purpose is cross-platform, cross-source behavioural identity, and the
rule carries no per-source qualifier. Case-collision (`:76`, expressly "per
source") and per-file readability (`:66`, expressly "regardless of source")
apply to the package source on the same footing.

## Actual behaviour / root cause

`discoverPackageThetas` was built to the DISC-5/DISC-6 selection contract
(0076/0113 gave it source-level failure modes) but never received the
per-candidate stage; the merge point (`production-composition.ts:640-647`)
trusts its output as registrable. The name flows into `pi.registerCommand`
unjudged; nothing between the package `readdir` and registration tests the
stem, compares case-variants, or probes readability.

## Why it matters

- A registered `/Foo` violates the naming grammar every other surface
  enforces; the collision machinery's premise ("both stems are rejected", the
  sentence DISC-3 uses to make case-insensitive collision well-defined) fails
  for package candidates, so a package `Foo.theta` beside a package
  `foo.theta` yields `/Foo` + `/foo` coexisting — a state the spec constructs
  rules to make impossible.
- A package shipping `Plan.theta` and `plan.theta` (legal on the author's
  case-sensitive host) registers both on Linux with no `case-collision`
  warning and a filesystem-dependent single copy on Windows — exactly the
  cross-platform divergence DISC-3 legislates away.
- Packages are the distribution channel: a shipped mistake reaches every
  installer silently, and the author gets no diagnostic on their own host
  either.

## Non-goals

- The priority/shadow/collision bypass at the same merge point — candidate
  discovery-precedence/03.
- The package walk's DISC-5 selection grammar, DISC-6 caps, and source-level
  failure modes — fixed ground (0076/0077/0113), conformant.
- `non-canonical-extension` warnings for package dirs — not measured this
  sweep (the walk-side emitter lives in `enumerateDirectory`, which package
  dirs also bypass; a fix routing candidates through the walk should witness
  it, but no divergence is claimed here unprobed).
- Registration-layer name constraints in Pi itself — whatever Pi does with
  the name `Foo`, the theta-side rule is the one measured.

## Fix

Options:

1. **Route package candidates through the walk's validation + adjudication
   (recommended, shared with candidate 03 option 1).** Shape package
   candidates as `SourcedCandidate`s and run `resolveBySource` →
   `validateAndRead` → `resolveSlashNames` over the union; all three rule
   families (validity, case, readability) and 03's priority faces close in
   one adjudicator with the existing mints and severities.
2. **Add a package-side validation pass** — replicate the SLASH_NAME test,
   case grouping, and `readBytes` probe inside `discoverPackageThetas` (or at
   the merge point) with the same codes/messages. Smaller structural change;
   duplicates three mints the walk already owns (the 0440-class duplication
   risk), and leaves 03 unfixed.

Either way, witness: package `Foo.theta` → `invalid-slash-name` error + no
registration; package `Plan.theta`+`plan.theta` → one `case-collision`
warning + byte-first winner (constraint: this pair is unconstructible on a
case-insensitive Windows host — the witness needs a case-sensitive host or a
`FakeFileSystem` pair); package theta with injected read failure →
`theta/load/unreadable` warning + no registration; a healthy package theta
still registers (the e2e-s6 direction).

Ordering precondition: this validation stage must land BEFORE or WITH a
correct fix for [bug 0462](./0462-package-merge-bypasses-priority-adjudication.md)'s adjudication faces —
`discovery-sources.md:80` mandates that an invalid stem "does not
participate in collision detection", so an adjudicator installed for the
package tier without this stage would adjudicate candidates the spec
excludes from the comparison.

## Provenance

discovery-precedence bug-hunt sweep at 401a425b (v0.437.0), hunt lead (a)/(b)
follow-through: found while building the pairing matrix for candidate 03 —
the validation asymmetry is the same bypass's second rule family. Probe
`tests/scratch-pkg-merge.test.ts` cell F5 (deleted; output quoted verbatim);
`rg` sweeps recorded in §Affected. Control behaviour cited from the walk's
committed suite rather than re-probed.

## Fix (0.448.0)

- What shipped: `src/discovery/discovery-walk.ts` — package candidates routed through the walk's per-candidate stage (`resolveBySource` → `validateAndRead`) as `SourcedCandidate`s, so DISC-3 filename validity (`invalid-slash-name`, error, no registration), DISC-3 intra-source case-collision (`case-collision`, byte-first winner), and DISC-2 rule-1 readability (`unreadable`) now run for source `package` identically to the other four sources; the stage runs BEFORE `resolveSlashNames`, so an invalid stem does not participate in collision detection (`discovery-sources.md:80`). `src/discovery/package-discovery.ts` — `descriptorValue` added. `src/extension/production-composition.ts` — the merge loop that pushed unjudged package survivors straight to registration deleted.
- Gates: witness `tests/b0463-package-source-disc3-validation.test.ts` (face 1 invalid-name via e2e; faces 2/3 case-collision + readability via `discoverThetas` + `FakeFileSystem`, byte-first winner asserted) red→green; full default suite `npm test` 10677/10677 green; `npx tsc -p tsconfig.json --noEmit` exit 0; `npm run lint` exit 0.
- Review: 2 rounds. R1 (deep) — F1 correctness (sibling dedup regression), F2 (this report's byte-first-winner assertion), F3 test-fidelity; all fixed. R2 (fast) — CLEAN.
- Verification: SOLID — witness-revert red-both-directions proven (neutralize the walk push → all three faces red; restore → green, byte-exact); full suite 10677/10677; lint + typecheck clean; one adjacent H9a live cell green over the reordered composition root.
- Residuals: none blocking. Live-obligation WHY offline suffices: the validation delta is the model-independent `session_start` decision, fully witnessed offline through the shipped `composeExtensionInstance` over real `node_modules` fixtures (face 1) and `discoverThetas` + `FakeFileSystem` (faces 2/3, unconstructible on a case-insensitive host); load diagnostics are not streamed to `pi -p` stdout (b0334live).
- Discharge notes appended: none.
- Pinned dispositions / non-goals: ordering precondition honoured — the validation stage lands WITH 0462's adjudication and runs before it; `non-canonical-extension` for package dirs not claimed (unprobed, as filed); frontmatter/parse judging of package thetas was already correct and is unchanged.
