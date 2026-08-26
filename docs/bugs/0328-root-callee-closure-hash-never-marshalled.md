# Bug 0328 — the marshalled callable-hash map never contains the launched root callee itself: `#subagent-theta-callable-hash`'s explicitly widened "whole callee file" window is fully open, so an edit to the invoked subagent theta (or any `.thetalib` it imports) between parent load and child spawn silently runs bytes the parent never validated

- **Status:** open.
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

## Provenance

Bug-hunt area `subagent-integrity`, seed hypothesis 2 (closure
completeness — "a file the closure MISSES = silent staleness"). Probed
offline at ee681f7b; probes deleted after confirmation.
