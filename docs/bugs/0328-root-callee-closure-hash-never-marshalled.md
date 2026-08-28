# Bug 0328 — the marshalled callable-hash map never contains the launched root callee itself: `#subagent-theta-callable-hash`'s explicitly widened "whole callee file" window is fully open, so an edit to the invoked subagent theta (or any `.thetalib` it imports) between parent load and child spawn silently runs bytes the parent never validated

- **Status:** fixed (0.306.0).
- **Sev/Diff estimate:** S2/D2 — S2 because the observable is silent
  execution of unvalidated code: the parent binds params against the
  load-time `params:` schema, renders the load-time `system:`, then the
  child re-discovers the edited file and runs its body/schema/frontmatter
  as found on disk, with zero diagnostics on any channel (impact class:
  silent stale/divergent dispatch, racy under parallel siblings — the exact
  failure mode the spec paragraph names). The watcher narrows but does not
  close the window (250 ms debounce; and bug 0312 shows out-of-root
  `.thetalib` members produce no event at all). Not S1: the bytes run are
  the author's own current file, not attacker-controlled. D2 because both
  halves of the machinery already exist — `resolveCallableClosureHash`
  computes exactly this hash for `tools:` entries, and the child-side
  verify already drops a marked root whose name appears in the map (the
  shipped test `tests/subagent-child-hash-refusal-e2e.test.ts` plants a
  root entry by hand and the drop works) — only the parent-side map
  construction omits the root.
- **Kind:** defect — a spec MUST with no implementing site.
- **Related:**
  - 0312 (open) — out-of-root `.thetalib` staleness; its subagent
    observable is the *entry* hash mismatch. This report is the adjacent
    layer: for the *root callee's own* closure no hash exists at all, so
    the same stale-lib edit on the root is silent, not tamper-shaped.
  - [0329](./0329-hash-mismatch-refusal-does-not-refuse-invocation.md) — even where a hash IS marshalled and
    mismatches, the refusal does not refuse the invocation. Disjoint
    mechanism (child-side enforcement vs parent-side marshalling), shared
    contract paragraph.
  - 0267/0270/0271 (fixed) — load-time closure-hash capture lineage;
    mechanism reused here unchanged.
- **Affected** (at ee681f7b, v0.287.0):
  - `src/extension/production-theta-producer.ts:2063–2067` — the marshalled
    map is built from `callableSetThetaEntries(theta)` (the launched
    callee's own `tools:` `.theta` entries) only; no root entry.
  - `src/extension/production-theta-producer.ts:2178–2181` — the carrier is
    explicitly cleared when that map is empty, so a `tools:`-less subagent
    theta launches with NO hash carrier at all.
  - `src/extension/production-composition.ts:1911` (`attachLoadTimeClosureHashes`)
    — load-time hashes are captured onto `tools:` entries only; no
    load-time record of a theta's OWN closure hash exists anywhere.
  - `src/extension/production-composition.ts:1119` (`markedRootRegistrationRefusal`)
    — the child-side refusal path that WOULD carry a root drop into a
    `load_failure` envelope; reachable today only if a theta names itself
    in its own `tools:`.
- **Observed at:** v0.287.0 (ee681f7b), offline — deterministic vitest
  probes (deleted after confirmation; recipes below): parent side through
  the real `spawnSubagentConversation` over the fake JSON-child launcher,
  child side through `discoverAndComposeFixtures` with the authenticated
  control-plane env planted (the `tests/subagent-child-hash-refusal-e2e.test.ts`
  harness pattern).

## Summary

subagent.md `#subagent-theta-callable-hash` widens the hash obligation
beyond `tools:` entries in so many words: "Because this design moves the
whole callee into the child, the parent-load/child-load skew window widens
from the model-facing `.theta` callables to the **whole callee file**: the
parent records, at load time, a content hash of the transitive closure of
the root callee `.theta` plus every `.thetalib` import it (and its
callable-set `.theta` entries) transitively reach, and marshals those
hashes to the child." The implementation marshals per-entry hashes only.
The primary subject of the sentence — the root callee `.theta` and its own
`.thetalib` imports — is never hashed, never marshalled, never verified.
The child-side verifier is genuinely capable of dropping a marked root
(the e2e test proves it by planting a root entry by hand); production
never sends one.

## Reproduction

Offline, deterministic. Two probes:

1. **Parent side.** Bind a `mode: subagent` theta through the real
   `spawnSubagentConversation` (fake launcher, the
   `tests/subagent-model-theta-tool.test.ts` (B) harness). With
   `tools: [./child.theta]`: the recorded spawn env carries
   `PI_THETA_SUBAGENT_CALLABLE_HASHES = {"child":"sha256:…"}` — no entry
   for the launched root's own slug. With no `.theta` callables: the
   carrier is absent entirely (cleared per the 0171 fix).
2. **Child side.** Workspace `.pi/theta/zqx-root.theta` containing an
   EDITED body (`@`EDITED BODY the parent never validated``); env
   `PI_THETA_SUBAGENT_PARENT_PID=<ppid>`,
   `PI_THETA_SUBAGENT_ROOT=zqx-root`, hash carrier absent
   (production-shaped for a `tools:`-less root). `discoverAndComposeFixtures`
   registers `zqx-root` with zero notifications. The child would drive the
   edited file; nothing on any channel records that the parent validated
   different bytes.

## Expected behaviour

subagent.md `#subagent-theta-callable-hash` (quoted above): the root
callee's transitive closure is hashed at parent load, marshalled, and "The
child verifies each hash after its own parse and refuses the invocation on
mismatch" with `theta/runtime/subagent-callable-hash-mismatch`. The
marked-root registration-refusal path (PIC-59 §Marked-root registration
refusal) already enumerates "the callable-hash mismatch" as a reachable
no-file-attributable refusal for the root slug — spec-side the root drop
is an anticipated outcome.

## Actual behaviour / root cause

`production-theta-producer.ts:2063–2067` builds the map exclusively from
the launched theta's frozen callable-set `.theta` entries
(`callableSetThetaEntries`); the launched theta itself has no entry in its
own callable set, and no other site records or marshals a theta's own
closure hash. On the child side `refuseDivergedChildCallables`
(`production-composition.ts:1157`) verifies only what the map names, so
verification is inactive (`active: false`) for every `tools:`-less callee
and blind to the root for every other callee.

## Why it matters

- The spec paragraph exists because the RFC-0006 move of the interpreter
  into the child made the whole-file skew the dominant hazard; the
  implemented subset protects exactly the part (model-facing `.theta`
  callables) whose skew window the paragraph calls the *narrower*
  predecessor concern.
- The divergence is user-visible in both directions: the child validates
  marshalled params against the EDITED `params:` schema (parent bound them
  against the old one), and the child runs the edited body under the OLD
  `--system-prompt` (rendered parent-side at load) — a frontmatter/body
  chimera neither file version describes.
- Racy under parallel siblings: two concurrent invocations straddling an
  edit run different bytes with identical provenance.

## Non-goals

- The hot-reload watcher's coverage (0310/0312 territory) — a working
  watcher narrows the window but the spec obligation is the hash, not the
  watcher.
- The child-side refusal's own enforcement gap — bug 0329.

## Fix

Record the root's closure hash at load (the machinery is
`resolveCallableClosureHash(fs, ctx, deps, undefined, parsed.sourcePath)`,
already pass-cached per bug 0264) onto the composed theta; marshal it
under the root's presented/derived name in the same map
(`production-theta-producer.ts:2066` site); the child-side verifier and
the marked-root refusal envelope already handle the rest (proven by the
e2e test's hand-planted root entry). Per the spec sentence the root's
closure should also fold in the `.thetalib` imports reached via its
callable-set entries; the per-entry hashes already cover those bytes, so
folding them into the root hash is optional for coverage but required for
literal conformance — decide at fix time and record which reading ships.

## Fix (0.306.0)

- What shipped:
  - `src/extension/reload-wiring.ts` — new optional `ParsedTheta.rootClosureHash?:
    { name; hash }` carrying the launched root callee's own load-time closure
    hash keyed under the child-derivable name (§Fix: "onto the composed theta").
  - `src/extension/production-composition.ts` — `captureRootClosureHash` computes
    the root hash at LOAD via the exact §Fix machinery
    `resolveCallableClosureHash(fs, ctx, deps, undefined, parsed.sourcePath)`,
    keyed by `deriveCallableName(sourcePath)`; computed BEFORE the no-`tools:`
    early return and threaded onto both the discovered-theta `composedInput` and
    the `parseCalleeTheta` dispatch-parse return (so a subagent callee launched
    via `invoke`/`.theta`-callable carries it too). `ThetaToolsResolution` grew
    the matching optional field.
  - `src/extension/production-theta-producer.ts` — the subagent-launch marshalling
    loop adds the root row to `callableHashes` after the `tools:`-entry loop, iff
    `!Object.hasOwn(callableHashes, rootClosureHash.name)` (additive; never
    overrides a `tools:`-entry key). This closes both halves: the root is now in
    the map, and a `tools:`-less subagent root marshals a PRESENT carrier.
  - `tests/b0328-root-closure-hash-marshalled.test.ts` — 8 witness cells (LOAD
    capture incl. `.thetalib` fold + prompt-mode + hyphen derivation; parent
    marshal incl. carrier-present + prototype-named root; child end-to-end
    admit/drop under the authenticated control plane).
  - `tests/fixtures/diag2/asserted-code-not-in-registry-baseline.json` — one
    sorted entry `theta/zqx-root` (a benign `.theta`-doc-name artifact the DIAG-2
    corpus extractor reads from a witness `sourcePath` literal; NOT a diagnostic
    code — see adjudication 2 below).
- Gates (verbatim):
  - Witness: `npx vitest run tests/b0328-root-closure-hash-marshalled.test.ts`
    → 8/8 pass. Revert-red proven: neutralising the producer root-row block reds
    cells 2a/2b/2c/3b (root absent from map / carrier cleared / edited root
    registers silently); neutralising the LOAD capture reds 1a/1b/1c; both
    restored byte-exact, re-green 8/8.
  - Full suite: `npx vitest run` → 484 files / 9590 tests pass.
  - Typecheck: `npm run typecheck` → clean. Lint: `npm run lint` → clean.
- Review: 3 rounds. R1 (deep) → two `correctness` findings: F1 the `mode:
  subagent` capture gate missed the subagent-caller→prompt-callee launch; F2 the
  additive guard `=== undefined` read inherited `Object.prototype` keys (dropped
  prototype-named roots). R2 (deep) → F1/F2 behaviourally resolved (mode gate
  dropped; guard now `!Object.hasOwn`); one `fidelity` finding: three stale
  doc-comments still named the removed gate; residuals R1 (no committed red-able
  witness), R2 (`__proto__` write no-op = 0330 territory), R3 (banned word
  "just"). R3 (deep confirmation) → CLEAN: comments corrected, prose fixed, cells
  1c/2c added pinning the F1/F2 remedies.
- Verification: SOLID. Witness genuine (revert-red/restore byte-exact per
  obligation 1); full suite green; live obligation adjudicated — the child-side
  root-hash verification is fully offline-witnessed by cell 3 (real
  `spawnSubagentConversation` over the fake JSON-child launcher →
  `discoverAndComposeFixtures` under the authenticated control plane), the fix
  touches no env→real-child forwarding wiring, so NO live cell is owed and none
  was run; lint + typecheck clean. Additive: no contact with `deriveCallableName`,
  child `byName`/`refuseDivergedChildCallables`, the `tools:`-entry key space
  (0330), or `watchRoots`/watcher (0312).
- Residuals:
  1. `__proto__.theta` root name: `Object.hasOwn` passes but
     `callableHashes["__proto__"] = hash` is a silent no-op through the inherited
     setter, so that one degenerate basename marshals no root row (child skips
     its verification). Identical to the pre-existing `tools:`-entry write at the
     same site; adjudicated as bug 0330's key-space territory (0330 open, owns
     the map key-space defects). Evidence: R2 in review rounds 2/3; producer
     root-row write shares the entry-loop's plain-object assignment.
  2. Pre-existing banned-word hits elsewhere in `production-theta-producer.ts`
     ("not just the first" :~1825, "the bind just added" :~2239, "simply" :~4035)
     — all outside this fix's hunks; repo-wide prose follow-up, not this bug.
- Discharge notes appended: none owed (no sibling doc's claim is discharged or
  contradicted by this fix).
- Pinned dispositions / non-goals:
  - Adjudication 1 (coverage reading of the §Fix sub-choice). The root closure
    hash = the root `.theta` + its OWN transitively-imported `.thetalib`s (the
    literal `resolveCallableClosureHash(…, undefined, sourcePath)` closure); the
    `.thetalib`s reached via the root's callable-set `.theta` ENTRIES stay
    covered by those entries' existing per-entry `closureHash` rows in the same
    marshalled map — they are NOT folded into the root hash. Three-source basis:
    (1) §Fix names that exact call, whose walk (`collectCallableClosureSources`)
    follows body `import`/`export` only, never `tools:`; (2) §Fix states "the
    per-entry hashes already cover those bytes … optional for coverage but
    required for literal conformance", and subagent.md marshals "those hashes"
    (plural — a MAP), so the UNION of the root row + per-entry rows IS the literal
    "content hash of the transitive closure of the root callee `.theta` plus
    every `.thetalib` import it (and its callable-set `.theta` entries)
    transitively reach"; (3) coordination — folding would couple the root hash to
    the entry key-space bug 0330 realigns. Bound: the union covers every byte;
    no single mega-hash ships.
  - Adjudication 2 (bounded self-authorization; DIAG-2 corpus baseline).
    Question that would have been asked: the DIAG-2 corpus gate reds on a new
    `.theta`-doc-name artifact `theta/zqx-root` extracted from a witness
    `sourcePath: "/theta/zqx-root.theta"` literal — baseline it, or rename the
    fixture path? Settled: add exactly one sorted entry to
    `tests/fixtures/diag2/asserted-code-not-in-registry-baseline.json`. Three
    evidence sources: (1) the gate's own comment states the baseline "pins that
    artefact population as data … so an ADDITION still reds while the extractor's
    fidelity is a separate subject" — baselining benign artifacts IS the
    mechanism; (2) sibling precedent — the (B)-harness fixture names
    `theta/parent`, `theta/child`, `theta/bare`, `theta/onlytheta` are ALREADY
    baselined, same class, same resolution; (3) DIAG-2's real obligation is
    DIAGNOSTIC CODES (registry row + reference mirror + spec sentence);
    `theta/zqx-root` has no emit site and no registry semantics, so no
    registry/mirror/spec obligation attaches. Bound: exactly one string,
    fixture-data only, no assertion or executable change; the gate confirmed the
    added set was exactly `["theta/zqx-root"]`. STOP valve (not triggered): if
    the added set exceeded that one entry, or any other gate cell reded, STOP
    and report.

## Provenance

Bug-hunt area `subagent-integrity`, seed hypothesis 2 (closure
completeness — "a file the closure MISSES = silent staleness"). Probed
offline at ee681f7b; probes deleted after confirmation.
