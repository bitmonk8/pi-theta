# Bug 0293 — the `InvokeInfraError` load/parse cause partition is shifted by one across the whole input space: a MISSING callee draws `cause: "internal_error"` (the containment re-check's `fs.realpath` throws ENOENT before the `load_failure` arm can run), an EXISTING-but-unparseable callee draws `cause: "load_failure"` (`parseCalleeTheta` collapses unreadable and unparseable into one `undefined`), and `cause: "parse_failure"` is produced by no input at all — `rg '"parse_failure"' src/` matches only the union declaration

- **Status:** open.
- **Sev/Diff estimate:** S2/D2 — S2 on "diagnostics that lie": a typo'd
  `invoke("./missing.theta")` — the most ordinary authoring mistake on this
  surface — reaches the author as `cause: "internal_error"`, the arm
  error-model.md defines as "an unexpected interpreter exception outside the
  closed theta 1.0.0 panic-source list" (a runtime defect), and its `message`
  is the raw Node `ENOENT` text rather than the load-failure sentence the
  `load_failure` arm mints; an author (or triage tooling) `match`ing on
  `cause` takes the wrong arm on every one of the three inputs, and the
  runtime-defect surface accretes false positives. Not S1: the failure is
  loud, an `Err` always surfaces, nothing binds a wrong value. D2 because the
  fix is a catch/ordering change at one call site plus splitting one
  `undefined` into a two-arm return, with a flip set of zero committed cells
  (the `load_failure` unit pins drive a harness with `fileSystem: undefined`,
  which skips the containment re-check entirely — they stay green under any
  fix here).
- **Kind:** defect — three elements, each measured end-to-end through the
  shipped composition root at `bc52da38` (v0.287.0):
  1. *Missing callee → `internal_error`.* `#driveCallee` runs the INV-1
     containment re-check before the callee load
     (`src/extension/production-theta-producer.ts:3663`), and that check
     canonicalises the callee path via `fs.realpath`
     (`checkInvokePathContainment` → `canonicalizePath`,
     `src/runtime/invocation.ts:146`) with no ENOENT handling. For a missing
     file `realpath` rejects; the rejection unwinds `#driveCallee` before the
     `parseCallee === undefined` → `load_failure` arm (`:3668–3676`) is
     reached, and `runInvokeChild`'s boundary catch wraps it as
     `InvokeInfraError { cause: "internal_error", callee_path, message:
     <ENOENT text> }` (`src/runtime/invoke-cancellation.ts:122–139`, the
     `isThetaPanic ? "panic" : "internal_error"` default). Measured note:
     `theta /infraleaf returned Err: invoke of ./missing.theta failed
     (internal_error)`.
  2. *Unparseable callee → `load_failure`.* `parseCalleeTheta`
     (`src/extension/production-composition.ts:2891–2917`) returns
     `undefined` for BOTH the unreadable-bytes case (`readBytes` rejection,
     `:2903–2906`) and the parse-failure case (`frontmatter === null ||
     hasLoadParseError`, `:2913–2915`); `#driveCallee` maps every `undefined`
     to `cause: "load_failure"` (`:3668–3676`). Measured note for an existing
     file containing `}}}} not a theta {{{{`:
     `theta /parsetop returned Err: invoke of ./garbled.theta failed
     (load_failure)`.
  3. *`parse_failure` is dead.* `rg '"parse_failure"' src/ tests/` matches
     exactly one line — the union member declaration
     (`src/runtime/query-error.ts:123`). No production or test code
     constructs it, so the arm the spec assigns to element 2's input class is
     unreachable from any input.
- **Related:**
  - **0111** (fixed 0.206.0) — observed in passing that a dispatch-time
    `Err(InvokeInfraError { cause: "load_failure" })` "cannot distinguish
    escape from deletion"; this report is the sibling observation one level
    up: the shipped causes cannot distinguish deletion from a runtime defect,
    nor parse failure from deletion.
  - **0131** (fixed 0.199.0) — precedent for the class: an ordinary authoring
    mistake surfacing through `theta/runtime/internal-error`, "the
    runtime-defect surface `error-model.md` defines as one 'no theta
    expression causes'". Same argument applies to a typo'd invoke path.
- **Affected** (verified at `bc52da38`, v0.287.0):
  - `src/runtime/invocation.ts:146` (`canonicalizePath` — the uncaught
    `realpath`), `:129–150` (`checkInvokePathContainment`),
    `recheckInvokePathAtRuntime` (the escape arm correctly mints
    `load_failure` at `:262` — for escapes, not for absence).
  - `src/extension/production-theta-producer.ts:3663` (the re-check call,
    ahead of the load), `:3668–3676` (the `load_failure` arm reachable only
    when the re-check did not throw), `#recheckCalleeContainment`
    (`:3793–3814`; skips when `fileSystem`/`activeRoots` are undefined —
    the unit-harness condition that keeps existing pins green).
  - `src/extension/production-composition.ts:2891–2917` (`parseCalleeTheta`'s
    two collapsed `undefined` returns).
  - `src/runtime/invoke-cancellation.ts:122–139` (the boundary catch that
    supplies the `internal_error` default).
  - `src/runtime/query-error.ts:122–124` (the three-cause declarations).
  - Committed pins that keep this invisible:
    `tests/production-core-exec.test.ts:283–319` asserts
    `cause: "load_failure"` for a `parseCallee`-returns-`undefined` double —
    under a producer with no `fileSystem` seam, so the throwing re-check
    never runs; the production composition path is untested for the missing
    callee.
  - Spec: `docs/spec_topics/errors-and-results/queryerror-variants.md:182`
    (`"load_failure" // callee file unreadable`), `:183` (`"parse_failure" //
    callee file failed to parse`);
    `docs/spec_topics/errors-and-results/error-model.md:26` ("An `invoke`
    parent whose callee fails to load observes … `InvokeInfraError { cause:
    "load_failure", ... }`") and its Runtime-panics paragraph defining
    `internal_error` as the runtime-defect surface;
    `docs/spec_topics/invocation.md:74` ("load failure, parse failure, …" as
    distinct causes).
- **Observed at:** v0.287.0 (`bc52da38`). Offline, deterministic,
  provider-free: one scratch vitest probe planting a `.pi/theta/` workspace
  (`infraleaf.theta` invoking `./missing.theta`; `parsetop.theta` invoking an
  existing garbled file), composing through the SHIPPED
  `discoverAndComposeFixtures`, dispatching, and reading the SLSH-3 notes off
  the `theta-system-note` channel; written, run, deleted. Notes quoted
  verbatim in Kind. `parse_failure` deadness by `rg` census.

## Summary

`queryerror-variants.md` gives `InvokeInfraError` a three-way partition for
callee intake: `load_failure` ("callee file unreadable"), `parse_failure`
("callee file failed to parse"), and — disjointly — `internal_error` (the
runtime-defect surface for "an unexpected interpreter exception outside the
closed theta 1.0.0 panic-source list"). At this HEAD every input lands one
arm to the right:

| input | spec cause | shipped cause |
| --- | --- | --- |
| callee file missing/unreadable | `load_failure` | `internal_error` |
| callee file exists, fails to parse | `parse_failure` | `load_failure` |
| runtime defect | `internal_error` | `internal_error` (shared with row 1) |

Row 1's mechanism: INV-1's runtime containment re-check runs before the
callee is opened and canonicalises the callee path with `fs.realpath`, which
rejects ENOENT for a missing file; nothing catches it on the way to the
invoke boundary, whose default classification for a non-panic throw is
`internal_error`. The `load_failure` arm in `#driveCallee` — written for
exactly this input ("An unparseable / missing callee surfaces
`Err(InvokeInfraError{cause: "load_failure"})`", its own doc-comment,
`production-theta-producer.ts:3629–3630`) — is unreachable for the missing
case in the production composition, because reaching it requires surviving a
`realpath` of the very file that is absent. It fires only under unit
harnesses that wire no `fileSystem` seam (which is why the committed
`load_failure` cells are green) and for row 2's input, where it is the wrong
arm.

Row 2's mechanism: `parseCalleeTheta` answers `undefined` for unreadable and
unparseable alike, and the caller has only the one arm to map it to. Row 3's
`parse_failure` is consequently minted nowhere in `src/`.

## Reproduction

Offline, provider-free, at `bc52da38`. Scratch vitest probe (written, run,
deleted): plant under `<tmp>/.pi/theta/`:

- `infraleaf.theta` — `---\nmode: prompt\n---\ninvoke("./missing.theta")?`
- `garbled.theta` — `}}}} not a theta {{{{`
- `parsetop.theta` — `---\nmode: prompt\n---\ninvoke("./garbled.theta")?`

Compose via `discoverAndComposeFixtures(hostPi, loadCtx)` (the
`tests/slsh5-invoke-cascade-chain-suffix.test.ts` harness pattern: recording
`pi.sendMessage`, throwing `pi.sendUserMessage`), dispatch each fixture,
read the `theta-system-note` channel. Observed verbatim:

```
theta /infraleaf returned Err: invoke of ./missing.theta failed (internal_error)
theta /parsetop returned Err: invoke of ./garbled.theta failed (load_failure)
```

Census: `rg -n '"parse_failure"' src/ tests/` →
`src/runtime/query-error.ts:123` only.

## Expected behaviour

- `queryerror-variants.md:182–183`: `load_failure` = "callee file
  unreadable"; `parse_failure` = "callee file failed to parse". A missing
  file is the unreadable class; a garbled file is the parse class.
- `error-model.md:26`: "An `invoke` parent whose callee fails to load
  observes … `InvokeInfraError { cause: "load_failure", ... }`".
- `error-model.md` §Runtime panics: `internal_error` is reserved for
  "unexpected interpreter exceptions" — "not a new authoring concept (no
  theta expression 'causes' one)". A typo'd path in an `invoke(...)`
  expression is authored input, not a runtime defect.
- Expected notes for the probe:
  `invoke of ./missing.theta failed (load_failure)` and
  `invoke of ./garbled.theta failed (parse_failure)`.

## Actual behaviour / root cause

Two independent mechanisms, one visible seam ordering and one collapsed
return:

1. `canonicalizePath` (`invocation.ts:146`) assumes the path exists;
   `#driveCallee` orders the containment re-check before the load
   (`:3663` before `:3667`), so absence manifests as an infrastructure throw
   rather than a load-arm verdict. The boundary catch
   (`invoke-cancellation.ts:134–139`) then applies its defect default. The
   error's `message` is the raw Node `ENOENT` text (via `panicMessage`),
   not the arm's minted `invoke callee '<path>' could not be loaded`.
2. `parseCalleeTheta` (`production-composition.ts:2903–2915`) has one
   `undefined` for two spec-distinct classes, and `#driveCallee` cannot
   re-split what the seam collapsed.

## Why it matters

- `cause` is the author's `match` discriminator (queryerror-variants.md:
  "Authors who want to handle the two arms differently destructure `cause`").
  Every intake failure dispatches the wrong arm: recovery logic keyed on
  `load_failure` (e.g. fall back to a default callee) never fires for the
  missing-file case it was written for.
- The runtime-defect surface is the operator's signal that the RUNTIME is
  broken; routing ordinary typos into it trains operators to ignore it and
  pollutes triage (the diagnostic carries an ENOENT stack hint styled as an
  internal error).
- `parse_failure` is a documented enum arm that no conforming test can ever
  witness — the closed-set conformance claim over `InvokeInfraCause` is
  unfalsifiable for that member.
- The existing green `load_failure` unit pins are a test-infrastructure blind
  spot: they exercise the arm only under a harness (`fileSystem: undefined`)
  that disables the very check that preempts it in production.

## Non-goals

- The containment-escape verdict itself (`recheckInvokePathAtRuntime`'s
  `escape` arm minting `load_failure`) is spec'd by INV-1 and untouched.
- The subagent child-process leg's envelope carriage of `invoke_infra` is
  faithful to what the child computed; this report is about what gets
  computed.
- Whether the load-time static walk should already warn on a missing invoke
  path is a separate (load-phase) question; the runtime classification is
  wrong regardless.

## Fix

Not yet decided; constraints any fix must satisfy:

1. A missing callee must reach `cause: "load_failure"` with the arm's minted
   message. Mechanism options: (a) catch the `realpath` ENOENT class inside
   `#recheckCalleeContainment` / `canonicalizePath` and treat
   absent-as-not-contained-but-loadable (fall through to the load arm, which
   answers `load_failure`); (b) probe existence before the containment
   re-check. Option (a) must not weaken INV-1: an ENOENT on the callee path
   itself is not an escape, but a broken symlink inside a root must keep its
   current disposition.
2. `parseCalleeTheta` must return a discriminated verdict
   (`unreadable | unparseable | ok`) so `#driveCallee` can mint
   `load_failure` vs `parse_failure`; the H8b doc-comment ("Returns
   `undefined` when the callee is missing / unparseable") updates with it.
3. `tests/production-core-exec.test.ts:283–319` stays green (its harness
   never reaches the re-check); new witnesses drive the SHIPPED composition
   root for all three inputs, red at this HEAD in the two divergent cells.
4. No new diagnostic code (DIAG-2): the change is `cause` selection and
   message minting on existing arms.

## Provenance

Error-classification bug hunt, worktree `C:/UnitySrc/pi-theta-hunt` at
`bc52da38` (v0.287.0). Surfaces read: `#driveCallee` /
`#recheckCalleeContainment` (`production-theta-producer.ts`),
`recheckInvokePathAtRuntime` / `checkInvokePathContainment` /
`canonicalizePath` (`invocation.ts`), `parseCalleeTheta`
(`production-composition.ts`), `runInvokeChild` (`invoke-cancellation.ts`),
`parseCalleeTheta` unit pins (`production-core-exec.test.ts`). Probe: scratch
vitest workspace drive through `discoverAndComposeFixtures`, run and deleted;
note bytes quoted verbatim.
