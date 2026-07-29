# Bug 0023 — The production composition omits its V9k / V9p / step-0 seams: every bootstrap diagnostic is constructed and dropped, the renderer-degrade gate never engages, and the step-0 capability probe never runs — and the one live compose-supplier catch mislabels every compose throw `capability: "pi.registerCommand"`

- **Status:** open
- **Kind:** defect + spec-gap — four elements against one composition
  function. Three are defects (implementation ≠ spec) and share one root
  cause: the shipped default export constructs the factory with three of its
  declared seams omitted, so three implemented-and-unit-tested V-leaves are
  inert in production.
  (1) **`emitDiagnostic` unwired (V9k/V9p).** code-registry-load.md routes
  `theta/load/extension-bootstrap-failed` "through the **System notes**
  fallback chain (`sendSystemNote` → `ctx.ui.notify` → `console.error`)"
  (extension-bootstrap-and-per-theta.md states the same rule), but the
  default export supplies no `emitDiagnostic`, so every constructed bootstrap
  diagnostic is dropped by an optional chain, on a live runtime as much as a
  stale one.
  (2) **`rendererGate` unwired (V9p).** Both ends are omitted: the factory
  receives no gate, and the production system-note channel builder supplies
  none either, so `deps.rendererGate?.available() === false` is never true
  and the prescribed renderer-degrade route to the `ctx.ui.notify` arm never
  engages.
  (3) **`runCapabilityProbe` uncalled (step 0).** capability-probe.md
  requires the probe to run "before any `pi.registerFlag`,
  `pi.registerCommand`, `pi.registerTool`, `pi.registerMessageRenderer`, or
  `pi.on` call". Nothing in `src/**` calls it, and no production `ProbeHost`
  is built, so sub-steps (a)–(e) never execute and
  `theta/load/host-incompatible` is unreachable from the shipped extension.
  (4) **Compose-throw mislabel — spec-gap.** The compose-supplier catch
  stamps `details.capability: "pi.registerCommand"` on any compose throw,
  although the registry row defines `capability` as naming "the failing
  call". No member of the closed union describes "the compose pass itself
  threw", so an honest label is a registry amendment under
  [DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2), not an
  implementation change.
- **Affected** (at 0.32.0, `4d645f4f`):
  - `thetaExtension`, the production default export
    (`src/extension/factory.ts:890–904`) — its `createThetaExtension` call
    (`:898–903`) passes `fixtures: []`, `composeInstance`, and
    `isSubagentChild`. No `emitDiagnostic`, no `rendererGate`, no `registry`.
    This is the only `createThetaExtension` call site outside `tests/`.
  - Every `deps.emitDiagnostic?.(…)` chain in the factory
    (`src/extension/factory.ts:350`, `:365`, `:386`, `:415`, `:439`, `:462`,
    `:524`, `:633`, `:707`, `:864`, `:871`) — eleven sites, each a
    construct-then-drop with the seam absent. The seam is declared at
    `:206`. Five are factory-time, with no `ctx` in scope: `:350`
    (`pi.registerFlag`), `:365` (`pi.registerMessageRenderer`), `:386`
    (`pi.on` `resources_discover`), `:415` (`pi.on` `session_start`), `:871`
    (`pi.on` `session_shutdown`). Six run inside a handler that has a `ctx`:
    `:439` (`pi.getCommands`), `:462` (per-theta `pi.registerCommand`),
    `:524` (discovery-supplier catch), `:633` (compose-supplier catch),
    `:707` (`installHotReload` arming throw), `:864` (`session_shutdown`
    body throw).
  - `rendererGate` — declared `src/extension/factory.ts:216`, degraded at
    `:364` on the renderer-registration catch. `new RendererGate()` has zero
    occurrences in `src/**` (three in
    `tests/extension-bootstrap-nonabort.test.ts`, one in
    `tests/system-note-channel.test.ts`). The consumer side is also unwired:
    `buildSystemNoteDeps` (`src/extension/production-composition.ts:1996–2023`)
    builds the channel deps with no `rendererGate` member, so the degrade
    branch at `src/extension/system-note-channel.ts:223` reads
    `undefined?.available() === false` and is dead. The `RendererGate` class
    itself is `src/extension/system-note-channel.ts:105–118`.
  - `runCapabilityProbe` (`src/extension/capability-probe.ts:244`) — one
    definition in `src/**` and 24 calls, all in
    `tests/capability-probe.test.ts`. `ProbeHost`
    (`src/extension/capability-probe.ts:109`) has no production builder.
    Step 0 sub-step (f) is the exception: `probeSubagentExecutable`
    (`src/extension/capability-probe.ts:426`) is wired at
    `src/extension/production-composition.ts:641`, but inside the per-theta
    compose pass, not as step 0 ahead of the factory-time host-binding calls.
  - The compose-supplier catch in `runComposeInstanceRegistration`
    (`src/extension/factory.ts:633`) —
    `bootstrapFailedDiagnostic("pi.registerCommand", e)` for any throw out of
    the whole `deps.composeInstance` pass. This is the mislabel's only live
    site. The sibling discovery-supplier catch
    (`src/extension/factory.ts:524`, inside `runProductionRegistration`,
    `:519–529`) carries the same label but is unreachable: nothing in the
    tree supplies `deps.discoverFixtures` (`rg "discoverFixtures:"` returns
    no hits), and `:405–407` short-circuits to the compose path whenever
    `composeInstance` is present, which production always supplies.
  - The closed label set: `BootstrapCapability`
    (`src/extension/factory.ts:91–96`), set-equal to the
    code-registry-load.md row's `details.capability` union
    (`"pi.registerMessageRenderer" | "pi.registerCommand" |
    "pi.registerFlag" | "pi.on" | "pi.getCommands"`).
- **Observed at:** `0.32.0` (`4d645f4f`), mechanical — offline,
  deterministic; no live model, no network.
- **Fix ordering:** this report lands before
  [bug 0029](./0029-throwing-supersession-detach-swallowed-watcher-rearmed.md),
  whose fix emits through `deps.emitDiagnostic` and is dead in production
  until element 1 wires it.

## Summary

`ThetaExtensionDeps` (`src/extension/factory.ts:167–257`) declares seven
members; the shipped default export supplies three.
`src/extension/factory.ts:898` passes `fixtures`, `composeInstance`, and
`isSubagentChild`; `emitDiagnostic`, `rendererGate`, `registry`, and
`discoverFixtures` are omitted, and the step-0 capability probe has no call
site in `src/**` at all. Each omitted seam is the production half of a V-leaf that
is implemented and unit-tested against an injected double, so the offline
suite is green while the shipped extension exercises none of it.

The consequences compose. Every factory-time and `session_start`-time
host-boundary failure is converted into a
`theta/load/extension-bootstrap-failed` diagnostic and handed to
`deps.emitDiagnostic?.()`, which with the member absent discards it: a
renderer-registration failure, a per-theta `pi.registerCommand` failure, a
`pi.getCommands` collision-pass read failure, a `pi.on` subscription failure,
and any compose-pass throw all yield no transcript note, no toast, and no
stderr line. The renderer-failure surface is doubly silent — the gate that
would reroute this extension instance's notes to `ctx.ui.notify` after the
renderer drops out is never constructed, so even a wired sink would deliver
into a transcript that renders nothing. And because sub-steps (a)–(e) of the
step-0 probe never run, a host below the pinned Node floor, missing an
`AbortSignal` member, missing one of the eight factory-probable SDK members,
carrying an out-of-range lock-step peer, or lacking a callable `Type.Unsafe`
is never refused at load; it fails later as an uncaught runtime `TypeError`,
which is the outcome PIC-5's enumeration exists to prevent.

The one catch that sees every compose-pass throw also labels it wrongly.
`runComposeInstanceRegistration`'s catch arm (`src/extension/factory.ts:633`)
receives whatever the whole `deps.composeInstance` pass threw — discovery
walk, settings read, parse, AJV compile, registry build — and stamps it
`capability: "pi.registerCommand"` unconditionally, so a `ctx.cwd` read
failure reports as a slash-registration failure. The label is invisible today
because the sink is unwired; wiring the sink makes it operator-visible for
the first time.

## Reproduction

Offline, deterministic, no live model. Three structural checks and one
scratch vitest file carrying four probes.

**Elements 2 and 3 — structural, at HEAD `4d645f4f`:**

```
rg -c 'new RendererGate\(' src tests
# tests\extension-bootstrap-nonabort.test.ts:3
# tests\system-note-channel.test.ts:1
# (no src hit)

rg -c 'runCapabilityProbe\(' src tests
# tests\capability-probe.test.ts:24
# src\extension\capability-probe.ts:1   <- the definition, not a call

rg -n 'rendererGate' src/extension/production-composition.ts
# (no hits — buildSystemNoteDeps supplies no gate either)
```

**Elements 1 and 4 — behavioural.** Write
`tests/zz-scratch-0023.test.ts`, run it, delete it. It drives the **shipped
default export** against a recording `ExtensionAPI` double with
`console.error` and `process.stderr.write` spied, and drives
`createThetaExtension` with an injected recorder for contrast:

```ts
import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import thetaExtension, { createThetaExtension } from "../src/extension/factory";

type Handler = (event: unknown) => unknown;

function makePi(throwOn: string, sends: unknown[], handlers: Map<string, Handler>): ExtensionAPI {
  const guard = (key: string): void => {
    if (key === throwOn) throw new Error(`${key} host seam absent`);
  };
  return {
    registerFlag: (): void => guard("registerFlag"),
    registerMessageRenderer: (): void => guard("registerMessageRenderer"),
    registerCommand: (): void => guard("registerCommand"),
    on: (event: string, h: Handler): void => { handlers.set(event, h); },
    getFlag: (): undefined => undefined,
    getCommands: (): unknown[] => [],
    sendUserMessage: (): void => {},
    sendMessage: (m: unknown): void => { sends.push(m); },
  } as unknown as ExtensionAPI;
}

describe("0023", () => {
  it("A: production drops the registerFlag bootstrap diagnostic", () => {
    const sends: unknown[] = [];
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const w = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    thetaExtension(makePi("registerFlag", sends, new Map()));
    const counts = { sends: sends.length, error: err.mock.calls.length, write: w.mock.calls.length };
    err.mockRestore(); w.mockRestore();
    expect(counts).toEqual({ sends: 0, error: 0, write: 0 });
  });

  it("A2: an injected sink observes the same diagnostic", () => {
    const diagnostics: Diagnostic[] = [];
    createThetaExtension({ fixtures: [], emitDiagnostic: (d) => diagnostics.push(d) })(
      makePi("registerFlag", [], new Map()),
    );
    expect(diagnostics).toHaveLength(1);
  });

  it("B: a compose throw is labelled pi.registerCommand", async () => {
    const handlers = new Map<string, Handler>();
    const diagnostics: Diagnostic[] = [];
    createThetaExtension({
      fixtures: [],
      composeInstance: () => { throw new Error("ctx.cwd read failed during the discovery walk"); },
      emitDiagnostic: (d) => diagnostics.push(d),
    })(makePi("", [], handlers));
    await handlers.get("session_start")!({ cwd: "/w", ui: { notify: (): void => {} } });
    expect(diagnostics[0]!.details?.capability).toBe("pi.registerCommand");
  });

  it("B2: production drops that compose-throw diagnostic entirely", async () => {
    const handlers = new Map<string, Handler>();
    const sends: unknown[] = [];
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const w = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    thetaExtension(makePi("", sends, handlers));
    await handlers.get("session_start")!({
      get cwd(): string { throw new Error("ctx.cwd read failed during the discovery walk"); },
      ui: { notify: (): void => {} },
    });
    const counts = { sends: sends.length, error: err.mock.calls.length, write: w.mock.calls.length };
    err.mockRestore(); w.mockRestore();
    expect(counts).toEqual({ sends: 0, error: 0, write: 0 });
  });
});
```

All four pass at HEAD, which is the defect. Recorded observations:

- **A** — `{"sends":0,"error":0,"write":0}`. A fatal `pi.registerFlag`
  failure through the shipped export produces zero operator-visible signal on
  any surface.
- **A2** — the same scenario through an injected recorder yields
  `{"severity":"error","code":"theta/load/extension-bootstrap-failed",
  "message":"extension bootstrap failed: pi.registerFlag threw registerFlag
  host seam absent","details":{"capability":"pi.registerFlag",
  "error":"registerFlag host seam absent"}}`. A and A2 run the same code
  path, so the diagnostic is constructed in production too and then
  discarded; only an injected seam observes it.
- **B** — `details.capability = "pi.registerCommand"` and
  `message = "extension bootstrap failed: pi.registerCommand threw ctx.cwd
  read failed during the discovery walk"`. Nothing reached
  `pi.registerCommand`.
- **B2** — `{"sends":0,"error":0,"write":0}` for the same compose throw
  through the real `composeExtensionInstance`.

## Expected behaviour

- code-registry-load.md:9 (the `theta/load/extension-bootstrap-failed` row)
  and extension-bootstrap-and-per-theta.md:17: the diagnostic is "Routed
  through the **System notes** fallback chain (`sendSystemNote` →
  `ctx.ui.notify` → `console.error`) because the renderer itself may be the
  failing capability". Delivery on a live runtime is prescribed; the row's
  remedy column names `/reload` as the recovery path, which presupposes the
  operator learns a recovery is needed.
- extension-bootstrap-and-per-theta.md:11: on a `pi.registerMessageRenderer`
  failure, "System notes for this extension instance permanently degrade to
  the `ctx.ui.notify` arm of the **System notes** fallback chain". The
  degrade is per-instance and permanent, which requires per-instance mutable
  state the channel consults on every note.
- capability-probe.md:4 (`#entry-capability-probe`): "Before any
  `pi.registerFlag`, `pi.registerCommand`, `pi.registerTool`,
  `pi.registerMessageRenderer`, or `pi.on` call … the factory runs a
  synchronous probe of six host preconditions" in the fixed short-circuit
  order `(a)` → `(b)` → `(c)+(d)` → `(e)` → `(f)`, stopping at the first
  failure. PIC-5 (capability-probe.md:71) pins the count at six.
  code-registry-load.md:10 pins the consequence: on any failing kind "the
  factory refuses every subsequent factory-time host-binding call … and emits
  this single diagnostic" (`theta/load/host-incompatible`).
- code-registry-load.md:9: `details: { capability, error }` "names the
  failing call". A `capability` value naming a call that was never reached
  does not name the failing call.
- PIC-67 clause (c) (session-shutdown-semantics.md:31) scopes the
  no-delivery rule to "the quiesced path" and "the invalidated runtime". It
  does not license dropping on a live one.

## Actual behaviour / root cause

**One root cause, three inert seams.** `ThetaExtensionDeps` declares
`emitDiagnostic` (`:206`), `rendererGate` (`:216`), and `registry` (`:226`)
optional, each doc comment giving the same reason: the harness paths that do
not observe the surface omit it. The optional chain is the designed no-op for
such a harness. Production is not such a harness, but
`src/extension/factory.ts:898` supplies none of them, so the no-op is what
ships. Nothing fails loudly, and no test catches it: every existing witness
(`tests/extension-bootstrap-failures.test.ts`,
`tests/extension-bootstrap-nonabort.test.ts`) drives `createThetaExtension`
with an injected recorder, so all of them are structurally blind to the
production wiring.

**Element 1.** All eleven emission sites reduce to construct-then-drop. Five
are factory-time and have no `ctx` in scope; six run inside a `session_start`
or `session_shutdown` handler that does. `sendSystemNote` needs
`SystemNoteChannelDeps`, built by `buildSystemNoteDeps(pi, ctx, emit)`
(`src/extension/production-composition.ts:1996`), and
`createThetaExtension(deps)(pi)` constructs deps before any `ctx` exists — so
the prescribed chain is not reachable from the factory-time sites as a single
wiring. `src/extension/production-composition.ts:588`
(`emitDiagnostic: sink.emit`) is the theta-producer runtime seam, not the
factory's bootstrap seam.

**Element 2.** The gate is unwired at both ends. The factory's `:364`
`deps.rendererGate?.degrade()` records nothing, and the channel's `:223`
`deps.rendererGate?.available() === false` branch can never be entered
because `buildSystemNoteDeps` returns no gate. The V9p renderer-degrade route
therefore never engages in production, and every note keeps attempting the
`pi.sendMessage` transcript arm against a renderer that failed to register.

**Element 3.** `runCapabilityProbe` has no production caller and no
production `ProbeHost`. Sub-steps (a)–(e) never execute, so the
`theta/load/host-incompatible` code — its `details.kind` union, its
placeholder rendering (`src/diagnostics/placeholder.ts:357` and `:372`), its
pre-eval routing arm (`src/extension/production-composition.ts:262`) — is
implemented and unreachable from the shipped extension. Only sub-step (f)
runs, and later than specified: `probeSubagentExecutable` is called inside
the compose pass (`src/extension/production-composition.ts:641`), after the
factory-time host-binding calls step 0 is supposed to precede.

**Element 4.** `runComposeInstanceRegistration`'s catch arm has one label to
give and five to choose from: `bootstrapFailedDiagnostic` takes a
`BootstrapCapability`, the closed five-member union pinned by the
code-registry-load.md row and mirrored at `src/extension/factory.ts:91–96`.
No member describes "the compose pass itself threw", and
`"pi.registerCommand"` was used as the nearest step-3 surface. Widening the
union or minting a code is a DIAG-2 registry amendment, not an
implementation change.

## Why it matters

- Live-runtime bootstrap failures are silent. A `pi.registerCommand`
  collision, a `pi.getCommands` read failure on a live runtime, a `pi.on`
  subscription failure fatal to the whole extension, or a compose-pass
  failure yields no transcript note, no toast, and no stderr line, although
  the spec designed the System-notes chain for exactly these failures and the
  documented recovery path (`/reload`) requires the operator to know a
  recovery is needed.
- The renderer-failure surface is the one the fallback chain exists for —
  "because the renderer itself may be the failing capability" — and it is the
  one surface where a wired sink would still deliver nothing, because the
  gate that reroutes to `ctx.ui.notify` is not constructed.
- An incompatible host is not refused at load. A Node version below the
  pinned floor, a missing `AbortSignal` member, a missing factory-probable
  SDK member, an out-of-range lock-step peer, or a non-callable
  `Type.Unsafe` surfaces as an uncaught runtime `TypeError` at first use
  instead of one `theta/load/host-incompatible` refusal at load.
- Misattribution misleads triage: an operator or a test reading
  `capability: "pi.registerCommand"` looks at slash registration when the
  failure was, for example, a `ctx.cwd` read in the discovery walk.
- Downstream reports inherit the silence.
  [Bug 0029](./0029-throwing-supersession-detach-swallowed-watcher-rearmed.md)'s
  fix routes its new diagnostic through the same seam and cannot deliver
  until this one is wired.

## Fix

Wire the three omitted seams in the production composition, and mint a
compose-phase diagnostic code so the one live compose-supplier catch stops
misattributing.

**1. A two-tier `emitDiagnostic` sink.** The factory-time sites and the
handler-time sites need different arms because the factory has no `ctx`.

- The five factory-time sites (`:350`, `:365`, `:386`, `:415`, `:871`) get a
  ctx-free arm: `pi.sendMessage` → `console.error`, skipping the
  `ctx.ui.notify` rung. That is a partial chain, so
  extension-bootstrap-and-per-theta.md:17 gains one sentence pinning it.
- The six handler-time sites (`:439`, `:462`, `:524`, `:633`, `:707`,
  `:864`) get the full `sendSystemNote` → `ctx.ui.notify` → `console.error`
  chain through a ctx-latching slot the `session_start` handler fills.

Every site delivers something, including the fatal `pi.registerFlag` and
`pi.on` aborts, where no `session_start` ever fires. The sink builder is new
work in `src/extension/production-composition.ts`: `makeLoadEmit` (`:184`)
and `buildSystemNoteDeps` (`:1996`) both require a `ctx` and neither serves
the factory-time tier.

**2. Construct and thread one `RendererGate` per extension instance.** This
is a precondition for tier 1 being correct, not an adjacent improvement: the
factory-time arm delivers through `pi.sendMessage`, and the surface most
likely to need it is the `pi.registerMessageRenderer` failure at `:365` —
exactly the case where the transcript renders nothing. Construct the gate in
the default export, pass it to `createThetaExtension` so `:364` can degrade
it, and thread the same instance into `buildSystemNoteDeps` so
`system-note-channel.ts:223` consults live state. One instance per extension
instance; no module-level state.

**3. Run the step-0 capability probe in the default export.** Build a
production `ProbeHost` from the running process and the installed peers, call
`runCapabilityProbe` before the first factory-time host-binding call, and on
a failure emit one `theta/load/host-incompatible` through the tier-1 sink and
skip every subsequent `pi.register*` and `pi.on` call. This depends on step 1
being in place — the refusal diagnostic rides the same chain. Sub-step (f)
stays where it is, but the ordering discrepancy is recorded: capability-probe.md
places (f) in the step-0 short-circuit sequence, and the implementation runs
it per-theta inside the compose pass.

**4. Mint `theta/load/extension-compose-failed`** for a throw escaping the
whole `deps.composeInstance` pass. New registry row in
code-registry-load.md with its own Message template and remedy column, the
mirror row in `docs/reference/diagnostics.md`, and the code added to the H9a
permitted-code list (`tests/fixtures/h7a/permitted-codes.json`) — coordinate
that edit with
[bug 0030](./0030-h9a-stderr-gate-gap-and-stale-intended-red-header.md),
which rewrites the surrounding gate. `BootstrapCapability`
(`src/extension/factory.ts:91–96`) stays closed and unchanged: a compose
throw is a distinct phase with a distinct remedy, not a sixth host call. The
registry addition is a DIAG-2 spec change
(`docs/spec_topics/diagnostics/diagnostic-shape.md:72`,
`docs/reference/diagnostics.md:37`) and lands with the implementation in one
commit. `src/extension/factory.ts:633` is the only live site to retarget; the
sibling at `:524` is inside dead code and needs no new label — delete
`runProductionRegistration` and the `discoverFixtures` seam, or leave them,
with no production behaviour either way.

**PIC-67 verification obligation.** The existing guards are taken as
sufficient and no duplicate liveness check is added at the sink: the compose
tail is guarded by `composeTailSuperseded()`
(`src/extension/factory.ts:623–625`, checked on both arms at `:630` and
`:637`), and `sendSystemNote` owns the bug-0018 stale-dead latch. Two sites
are not covered by that reasoning and are an explicit verification
obligation for the fix: `:707` (`installHotReload` arming throw) and `:864`
(`session_shutdown` body throw, which fires while the runtime is being torn
down). Regression coverage must prove neither can deliver through an
invalidated runtime.

**Regression locks.** Offline unit tests are sufficient; no live test is
required. The locks must target the **default export**, not
`createThetaExtension`:
`tests/extension-bootstrap-failures.test.ts` (V9k, abort surfaces) and
`tests/extension-bootstrap-nonabort.test.ts` (V9p, non-abort surfaces)
already own these surfaces with an injected recorder and are structurally
blind to the production wiring, so each gains a production-export arm
asserting a delivery *arrives* — the inversion of reproduction A and B2
above. Live coverage cannot witness the fix: H9a's nine areas drive
successful runs, so no bootstrap failure arises to deliver, and neither live
suite carries an assertion that tests for the presence of a theta-owned
stderr line —
[bug 0030](./0030-h9a-stderr-gate-gap-and-stale-intended-red-header.md)'s
gate-gap defect. A delivery that does not happen cannot red anything. H9a's
nine-area stderr-sensitive gate, `assertCodesSubsetOfPermitted`
(`tests/live/acceptance/noninteractive-acceptance.test.ts:109–121`), scores
code *content* against `tests/fixtures/h7a/permitted-codes.json` — which is
why step 4 adds `theta/load/extension-compose-failed` to that list.

**Ordering.** This fix lands before
[bug 0029](./0029-throwing-supersession-detach-swallowed-watcher-rearmed.md),
whose fix emits
`theta/host/session-start-supersession-detach-failed` through
`deps.emitDiagnostic` and is undeliverable in production until step 1 is
done.

## Provenance

Bug 0022 §"Fix options and recommendation" item 3 recorded the drop and the
mislabel as adjacent and separable ("worth its own report if not folded in
here"); the 0022 fix orchestration ruled that neither is folded into the
0.29.0 fix. The drop is recorded in
[bug 0022](./0022-late-compose-tail-registration-on-invalidated-runtime.md)'s
Affected list ("The production default export (`src/extension/factory.ts`
`thetaExtension`) supplies no `emitDiagnostic`, so every
`bootstrapFailedDiagnostic` the tail constructs is dropped by the
`deps.emitDiagnostic?.()` optional chain") and the mislabel in
its Variant-2 reproduction and root-cause sections; 0022's pre-fix variant-2
signature records "two, the first mislabelled capability
`pi.registerCommand`". The `rendererGate` and `runCapabilityProbe` omissions
were found by triage of this report and folded in: all three are the same
composition function omitting the same class of seam.
[Bug 0013](./0013-load-warnings-dropped-by-both-production-sinks.md) (fixed,
0.24.0) is the same family at a different seam — a production sink dropping
constructed diagnostics — and is the precedent for the fix shape. Precedent
for a multi-element report:
[bug 0002](./0002-subagent-child-hangs-under-acceptance-pi-p.md). Citations
verified against `4d645f4f` (0.32.0).
