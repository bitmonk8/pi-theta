# Bug 0323 — the `probe-failed` `details.step` closed set is stated differently by the registry and the canonical PIC page: `code-registry-load.md:11` enumerates `"peer-dep-out-of-range"` where `capability-probe.md:80` (self-declared canonical) and the implementation both use `"peer-dep-version"` — and the set's `"subagent-executable"` member has no producer, because sub-step (f) is the one probe check with no try/catch (`probeSubagentExecutable` and `resolveSubagentExecutable` run bare), contradicting PIC-6's "Each check is wrapped in a try/catch"

- **Status:** open.
- **Sev/Diff estimate:** S4/D1 — S4 because the reachable-observable surface
  is documentation truth: the step-(d) mismatch is registry-vs-canonical
  wording (the implementation follows the canonical page, so no wrong bytes
  are ever emitted — a diagnostics consumer coded against the REGISTRY's
  enumeration mis-parses `step: "peer-dep-version"` payloads, which is the
  concrete failure mode), and the missing (f) wrap is unobservable with the
  shipped production host (`existsSync` never throws; `isEmbeddedFsPath` is
  a pure string test), so the `"subagent-executable"` member is dead but the
  crash it guards against is production-unreachable at this pin. D1: one
  registry-row wording fix plus one try/catch (or a spec carve-out for (f)),
  no committed-cell flips beyond additions.
- **Kind:** spec inconsistency (registry vs canonical page) + defect on the
  PIC-6 shape rule. Elements at `ee681f7b` (v0.287.0):
  1. *Two different closed sets for one field.*
     `code-registry-load.md:11` (the `theta/load/host-incompatible` row):
     "`details.step ∈ { "node-floor", "abortsignal-shape",
     "sdk-capability-missing", "peer-dep-out-of-range", "typebox-shape",
     "subagent-executable" }` … `details.package` additionally carries the
     lock-step package name when `details.step = "peer-dep-out-of-range"`".
     `capability-probe.md:80` (*Self-failure*; `:4` declares this paragraph
     group "the **canonical source of truth** for every probe rule … and the
     member-with-kind enumeration"): "`details.step ∈ { "node-floor",
     "abortsignal-shape", "sdk-capability-missing", "peer-dep-version",
     "typebox-shape", "subagent-executable" }` … (the step-(d) label is the
     neutral `"peer-dep-version"`, not a `kind` value, because a throw during
     step (d) cannot determine whether the `peer-dep-out-of-range` or
     `peer-dep-malformed-version` arm would have fired) … When `details.step
     = "peer-dep-version"`, `details.package = "<scoped-name>"` additionally
     names which … package was being checked". The registry names a step
     value the canonical page explicitly rules out, with the canonical page
     recording the reason.
  2. *The implementation follows the canonical page.* `ProbeStep`
     (`src/extension/capability-probe.ts:184–189`) is the five-member
     `"node-floor" | "abortsignal-shape" | "sdk-capability-missing" |
     "peer-dep-version" | "typebox-shape"`; the step-(d) throw routes to
     `probeFailed("peer-dep-version", …, pkg)` (`:377`). Committed cells pin
     it (`tests/capability-probe.test.ts:288`,
     `tests/extension-bootstrap-sink-liveness.test.ts:665–676`). So
     `step: "peer-dep-out-of-range"` — the registry's member — is minted by
     no input.
  3. *`"subagent-executable"` is dead in both directions.* The string appears
     nowhere in `src/` (`rg '"subagent-executable"' src/` — zero hits); the
     `ProbeStep` union omits it. The canonical page requires it: "a throw
     inside sub-step `(f)` — e.g. a filesystem `stat` that throws `EACCES`
     while running the rung-1 existence check — routes to `"probe-failed"`
     with `details.step = "subagent-executable"`, not to
     `theta/load/subagent-executable-unresolved`" (`capability-probe.md:80`),
     under PIC-6 (`:72`): "The factory MUST NOT throw. Each check is wrapped
     in a try/catch." The implementation wraps (a)–(e)
     (`runCapabilityProbe`, `capability-probe.ts:268` onward — every step in
     `try`/`catch` → `probeFailed`) but not (f): `probeSubagentExecutable`
     (`capability-probe.ts:468–486`) and `resolveSubagentExecutable`
     (`src/runtime/subagent-launcher.ts:149–166`) contain no trap, and the
     call site runs bare inside the compose pass
     (`src/extension/production-composition.ts:836`) — a throw from the
     injected `ExecutableHost` would unwind the load pass, not route to
     `probe-failed`.
  4. *Production reachability of the (f) throw is closed at this pin.* The
     shipped host (`createProductionExecutableHost`,
     `src/extension/production-subagent-host.ts:91–127`) discharges
     `fileExists` via `existsSync` (returns `false` on any error, including
     `EACCES` — it does not throw) behind a pure string `isEmbeddedFsPath`
     test, and `isGenericRuntime` is a `basename` comparison. So the
     spec's own `EACCES`-stat example cannot occur with the shipped host;
     only an injected harness host can throw there today.
- **Related:**
  - **0216** (fixed 0.153.0) — precedent for a `details`-payload member set
    holding only inside a unit test; here the divergence is between two spec
    pages plus a missing wrap rather than an unwired classifier.
  - **0293** (open) — pattern parent for "documented member, no producer".
- **Affected** (verified at `ee681f7b`, v0.287.0):
  - `docs/spec_topics/diagnostics/code-registry-load.md:11` — the
    `host-incompatible` row's step enumeration and its
    `details.package`-carriage condition (both name
    `"peer-dep-out-of-range"`).
  - `docs/spec_topics/pi-integration-contract/capability-probe.md:80`
    (*Self-failure*, canonical), `:72` (PIC-6), `:63` (sub-step (f)), `:4`
    (canonicality claim).
  - `src/extension/capability-probe.ts:184–189` (`ProbeStep`), `:245–253`
    (`probeFailed`), `:377` (the `"peer-dep-version"` emit), `:468–486`
    (`probeSubagentExecutable`, no trap).
  - `src/runtime/subagent-launcher.ts:149–166` (`resolveSubagentExecutable`,
    no trap); `src/extension/production-composition.ts:836` (bare call in
    the compose pass); `src/extension/production-subagent-host.ts:109–126`
    (the throw-free production host).
  - Committed pins: `tests/capability-probe.test.ts:288`;
    `tests/extension-bootstrap-sink-liveness.test.ts:665–676`.
- **Observed at:** v0.287.0 (`ee681f7b`). Offline, by source/spec census:
  `rg` for each step literal over `src/` and both spec pages (all hits
  read); `runCapabilityProbe`'s five wrapped steps and the unwrapped (f)
  path read end-to-end to the compose-pass call site. No probe: the
  registry/canonical contradiction is textual, the emitted value is pinned
  by two committed cells, and the (f) wrap absence is a two-function read.

## Summary

`theta/load/host-incompatible`'s `probe-failed` payload carries
`details.step`, a closed set naming which probe check threw. The canonical
owner of that enumeration (capability-probe.md — self-declared at `:4`)
lists six members and explains one of them at length: the step-(d) label is
the *neutral* `"peer-dep-version"`, deliberately NOT the `kind` value
`"peer-dep-out-of-range"`, because a throw during (d) cannot know which
verdict arm would have fired. The registry page's row for the same
diagnostic enumerates the set with `"peer-dep-out-of-range"` in that slot —
the exact value the canonical page rules out — and keys the
`details.package` carriage on it. The implementation and its committed
tests follow the canonical page, so a diagnostics consumer coded against
the registry row (the page whose stated purpose is to be read for payload
shapes) never matches a real payload.

Independently, the set's sixth member `"subagent-executable"` — which the
canonical page requires for "a throw inside sub-step (f)" and PIC-6's
per-check try/catch rule presupposes — has no producer: sub-step (f) is the
one probe check that runs unwrapped, from `probeSubagentExecutable` through
`resolveSubagentExecutable` to the bare call in the compose pass. With the
shipped production host the gap is latent (`existsSync` converts the spec's
own `EACCES` example to a clean `false`), so the member is dead rather than
the crash live; an `ExecutableHost` whose `fileExists` throws — the seam is
injectable (`passExecutableHost`,
`production-composition.ts:471/:489`) — unwinds the load pass instead of
producing the documented refusal.

## Reproduction

Textual + census, at `ee681f7b`:

```
rg -n 'peer-dep-version|peer-dep-out-of-range' src/ docs/spec_topics/diagnostics/code-registry-load.md docs/spec_topics/pi-integration-contract/capability-probe.md
  code-registry-load.md:11      step set … "peer-dep-out-of-range" … (registry)
  capability-probe.md:80        step set … "peer-dep-version" … + rationale (canonical)
  capability-probe.ts:188       ProbeStep member "peer-dep-version"
  capability-probe.ts:377       probeFailed("peer-dep-version", …)

rg -n '"subagent-executable"' src/     → no hits
```

Wrap absence: read `probeSubagentExecutable`
(`capability-probe.ts:468–486`) and `resolveSubagentExecutable`
(`subagent-launcher.ts:149–166`) — no try/catch; call site
`production-composition.ts:836` bare. Contrast any of steps (a)–(e) in
`runCapabilityProbe` (each body wrapped, catch → `probeFailed`).

## Expected behaviour

- One step enumeration. Per capability-probe.md:4 the PIC page is canonical,
  so `code-registry-load.md:11` must read `"peer-dep-version"` in the set
  and in the `details.package` condition.
- capability-probe.md:80: a throw inside sub-step (f) routes to
  `kind: "probe-failed"`, `details.step = "subagent-executable"`,
  `details.cause = <coerced underlying string>` — not an unwound load pass,
  and not `theta/load/subagent-executable-unresolved` (reserved for the
  clean both-rungs-fail verdict).
- PIC-6 (`:72`): "Each check is wrapped in a try/catch" — (f) included.

## Actual behaviour / root cause

The registry row was written (or last reconciled) against the `kind`
enumeration — whose fourth member IS `"peer-dep-out-of-range"` — rather than
the step enumeration, importing the `kind` spelling into the `step` set; the
canonical page's parenthetical shows the distinction was deliberate and the
registry missed it. Sub-step (f) was added as the capability-3 replacement
with its own precise diagnostic and its own code path
(`probeSubagentExecutable`, outside `runCapabilityProbe`); the per-check
wrap discipline of the (a)–(e) sequence was not carried to it, and no
`"subagent-executable"` routing was ever written — the `ProbeStep` union
still ends at `"typebox-shape"`.

## Why it matters

- The registry page is the reference consumers are told to read for payload
  shapes; its step set never matches a real `probe-failed` payload for the
  (d) throw class (the only class carrying `details.package`), so tooling
  keyed on the registry mis-parses exactly the payloads that name a broken
  package install.
- The canonical page's `"subagent-executable"` member is unwitnessable: no
  conforming test can produce it, and the PIC-6 wrap MUST is textually
  violated for one of the six checks. The gap is latent only because the
  current production host happens to be throw-free; a future
  `ExecutableHost` discharge (or a hostile `process.argv` getter) turns the
  documented refusal into a load-pass crash.
- Small, crisp, and cheap to fix now; expensive to debug later from a
  mis-parsed payload or a factory throw PIC-6 promises cannot happen.

## Non-goals

- The `kind` enumeration (`"peer-dep-out-of-range"` as a *kind* value) is
  correct on both pages and in `capability-probe.ts:407`; nothing here
  touches the kind set.
- `theta/load/subagent-executable-unresolved` (the clean (f) verdict) is
  correctly wired (`production-composition.ts:843–846`) and out of scope.
- Whether the (f) check should also emit `host-incompatible` rather than its
  own code is settled by capability-probe.md:63/:77 and not reopened.

## Fix

1. Registry wording: `code-registry-load.md:11` — replace
   `"peer-dep-out-of-range"` with `"peer-dep-version"` in the step set and
   in the `details.package` condition (two token edits reconciling to the
   canonical page).
2. Wrap (f): try/catch around the ladder run (either inside
   `probeSubagentExecutable` or at the compose-pass call site), catch →
   `hostIncompatibleDiagnostic({ kind: "probe-failed",
   step: "subagent-executable", cause: coerceCause(e) })`, extending
   `ProbeStep` with the sixth member; the clean `{ ok: false }` verdict
   keeps its existing `subagent-executable-unresolved` route. Witness: a
   unit cell injecting a throwing `ExecutableHost` via `passExecutableHost`,
   red at this HEAD (today it throws out of the compose pass), green with
   the wrap. Alternatively — if the wrap is judged dead weight for a
   host that structurally cannot throw — amend capability-probe.md:80 to
   scope the (f) self-failure clause out, which also deletes
   `"subagent-executable"` from both pages' sets; the two spec pages must
   agree either way.

## Provenance

Dead-arms-sweep bug hunt, worktree `C:/UnitySrc/pi-theta-hunt` at `ee681f7b`
(v0.287.0). Surfaces read: `capability-probe.ts` (`runCapabilityProbe`,
`probeFailed`, `probeSubagentExecutable`, `ProbeStep`),
`subagent-launcher.ts` (`resolveSubagentExecutable`, `ExecutableHost`),
`production-subagent-host.ts` (`createProductionExecutableHost`),
`production-composition.ts` (the (f) call site and refusal loop); spec
`capability-probe.md` in full, `code-registry-load.md` host-incompatible
row. Measurement: `rg` censuses quoted above; committed step pins named.
