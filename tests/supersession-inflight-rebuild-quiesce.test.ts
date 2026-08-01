// Bug 0034 — RED offline witness suite, written BEFORE the fix. The
// spec-correct assertions in tests 1 and 2, test 4's cap-arming assertions,
// and tests 5–6 MUST fail at HEAD (3715fa5f, 0.45.0); the control (test 3)
// must pass at HEAD *and* after the fix, proving every leak discriminator is
// live rather than vacuous; test 4 carries a split classification, and tests
// 5–6 red at HEAD for a reason distinct from the guard they lock (see their
// classification notes below).
//
// Defect (docs/bugs/0034-supersession-does-not-await-whenidle.md), one call
// site, one missing act:
//
//   The repeat-`session_start` supersession pass supersedes the outgoing
//   generation with two synchronous acts — `liveRegistry?.drain()`
//   (`src/extension/factory.ts:750`) and the isolated `outgoingHandle?.detach()`
//   (`:751–774`) — and then publishes its own live resources (`:775–784`) and
//   runs generation 2's `registerFixtures` (`:785`). Neither act stops a
//   rebuild that has ALREADY entered `runReload`: the torn-down flag is read
//   once at pass entry (`src/extension/hot-reload.ts:183–189`, the guard
//   itself at `:187–189`) and
//   `ReloadDebouncer.markTornDown()` clears the pending timer and the PIC-49
//   deferred re-arm but leaves `#inFlight` untouched
//   (`src/extension/reload-debounce.ts:77`, `:135–139`). The whole tail from
//   the post-compose staleness check (`factory.ts:721–723`) to the handler's
//   return is await-free — the site comment records that as load-bearing, "the
//   tail is await-free after it … so no shutdown and no newer start can
//   interleave past the check" (`:693–695`) — so the superseding pass always
//   completes before the suspended rebuild's continuation can run. The rebuild
//   then finishes against the LIVE host: `deps.reRegister(staged)`
//   (`hot-reload.ts:251`) → `factory.ts:795–801`'s re-registration bridge →
//   `registerFixtures(thetas, wiring.registry)` for the SUPERSEDED wiring, so
//   every name it carries is re-bound to the drained generation-1 registry and,
//   Pi's registration being last-writer within one extension instance, replaces
//   generation 2's binding; and `rebuildAndSwap` publishes the staged map into
//   that drained registry, a snapshot no dispatch reads and no teardown or
//   supersession will visit again.
//
//   `HotReloadHandle` already exposes the missing act — `markTornDown()` and
//   `whenIdle()` (`hot-reload.ts:107–118`, implemented at `:301–323`) — and the
//   `session_shutdown` teardown consumes BOTH through the same handle the
//   supersession pass holds: sub-step 4 (a)+(b) at
//   `src/extension/session-shutdown.ts:492–505`, bounded by `quiesceDebouncer`
//   (`:655–671`) against `SHUTDOWN_AWAIT_CAP_MS`
//   (`src/extension/capability-probe.ts:75`, 2000 ms). The factory wires both
//   members onto the teardown adapter at `factory.ts:921–925`. The capability
//   is present on the supersession path and unused.
//
// Spec encoded by the red assertions:
//  - registration-steps.md#repeat-start-supersession (MUST, no carve-out for a
//    rebuild already in flight): the supersession detach closes "that
//    generation's watcher and quiescing its debouncer, so no
//    superseded-generation reload can rebuild or re-register after the
//    supersession";
//  - PIC-57 splits that outcome into the two obligations the clause compresses
//    into one — the torn-down flag "suppresses any fresh rebuild and clears any
//    rebuild deferred under the PIC-49 cross-window serialization rule", while
//    "any *already-in-flight* rebuild … MUST be awaited … so that it either
//    completes its single synchronous publish per PIC-36 or is a no-op". The
//    supersession pass performs only the first;
//  - PIC-68 makes the teardown's sub-steps 1 and 4 latest-generation-only
//    "because each superseded generation's registry was already drained and its
//    watcher already detached at supersession time"; a superseded generation
//    whose rebuild publishes after that point leaves a populated registry
//    snapshot and a re-registered name set no later teardown revisits;
//  - the drain-state contract's arm (b) (`theta /<name>: extension shutting
//    down`) is the fail-safe specified for handlers LEFT BEHIND by a
//    supersession, not for names the live generation had already reclaimed.
//
// Pinned post-fix contract (the fix implements exactly this; asserted here on
// observables, never internals). Inside the `session_start` handler, between
// the post-compose staleness check (`factory.ts:721–723`) and the supersession
// fold (`:744–749`):
//  1. read `hotReloadHandle` into a local — no mutation, no slot clear yet;
//  2. when that local is present (and the outgoing generation's `liveClock`
//     is), `outgoingHandle.markTornDown?.()` then AWAIT a race between
//     `outgoingHandle.whenIdle?.() ?? Promise.resolve()` and a cap timer armed
//     on the OUTGOING generation's `liveClock` — mirroring `quiesceDebouncer`
//     (`session-shutdown.ts:655–671`). Both acts sit inside ONE try/catch
//     emitting the existing `theta/host/session-start-supersession-detach-failed`
//     code under a NEW closed-set `details.call` label
//     `"hotReloadHandle.whenIdle(awaitCap)"` (mirroring the teardown's
//     `"debouncer.whenIdle(awaitCap)"`), defended by an inner try/catch;
//  3. immediately after the await, re-evaluate `composeTailSuperseded()` and
//     take the zero-touch return when it now holds (the await is the ONLY
//     interleave point the `:693–695` invariant comment must now admit);
//  4. then the existing fold / `liveRegistry?.drain()` / slot clear /
//     `detach()` / publish / `registerFixtures` tail runs in ONE synchronous
//     run-to-completion.
//
// Cap value: `SUPERSESSION_QUIESCE_CAP_MS = SHUTDOWN_AWAIT_CAP_MS` (2000 ms), a
// supersession-path-owned DEADLINE captured at the quiesce — not the teardown's
// handler-entry deadline, which does not exist on this path. Cap expiry emits
// NO new diagnostic code: the rebuild is abandoned under the torn-down flag,
// PIC-57's rule, so the DIAG-2 registry is unchanged.
//
// Observable consequences this suite pins:
//  - a repeat `session_start` delivery is BOUNDED-BLOCKING on the superseded
//    generation's in-flight rebuild (the contract change §Fix names): start #2
//    does not return while that rebuild is parked (test 1 (b));
//  - the settling rebuild re-registers and publishes against the STILL-UNDRAINED
//    generation-1 registry, so the drained registry gains no post-drain entry
//    and no `pi.registerCommand` lands after the supersession pass returns
//    (test 1 (c)/(d)/(e));
//  - generation 2's registration then lands LAST and owns every surviving name,
//    so dispatching it runs the theta instead of answering the arm-(b)
//    shutting-down note on a live session (test 2).
//
// NO new diagnostic CODE is asserted anywhere in this file. The fix reuses bug
// 0029's landed `theta/host/session-start-supersession-detach-failed` row and
// promotes that row's `details.call` set from a closed ONE-member to a closed
// TWO-member set, the second member being the quiesce arm's
// `"hotReloadHandle.whenIdle(awaitCap)"`. The registry states those labels are
// wire contract — "deduplication on `(code, details.call)` is meaningful …
// across independent implementations" — so test 5 sources BOTH halves of what
// it asserts from the registry itself rather than from copied prose: the
// Message template through `registryMessage` (`tools/code-registry/index.js`,
// the DIAG-4 single source of truth, used by e.g.
// tests/ctor-unresolved-schema-name.test.ts), and the row's severity plus the
// closed-set membership of the label through the parsed row's own cells. That
// is the stronger of the two precedents available for this code:
// tests/supersession-detach-throw-containment.test.ts pins a hand-copied
// template and tests/reload-teardown-quiesce.test.ts substring-matches a
// stringified diagnostic, so neither can red on registry drift — test 5 can.
//
// The remaining message literal in this file is the drain-state arm-(b) note,
// whose template is `src/extension/drain-state.ts`'s `shuttingDownNote` and
// which the sibling supersession suites
// (tests/double-session-start-supersession.test.ts) also pin as a literal.
//
// Tests in this file:
//  1. RED at HEAD — no post-drain publish. A generation-1 rebuild parked in
//     `rediscover` when the second `session_start` supersedes: post-fix the
//     awaited rebuild has already re-registered and published against the
//     still-undrained generation-1 registry BEFORE the drain, so the drained
//     registry gains no post-drain entry and no `reRegister` follows the drain.
//     At HEAD both land after — red.
//  2. RED at HEAD — generation 2 owns every surviving name. With the same
//     in-flight rebuild across the boundary, the LAST `pi.registerCommand` for
//     each name generation 2 published is generation 2's own, and dispatching
//     that name runs the theta rather than answering the arm-(b)
//     `theta /<name>: extension shutting down` note. At HEAD generation 1's
//     leaked re-registration lands last — red.
//  3. GREEN at HEAD and after — the §Reproduction control: a debounce window
//     still OPEN at supersession time (clock advanced only afterwards) fires no
//     rebuild at all — no `reRegister`, no registry growth, no
//     structural-change note. This is the discriminator against bug 0029's
//     landed fix (containment-first `detach()` cancels the pending window) and
//     proves tests 1–2's discriminators are live rather than asserting an
//     impossibility.
//  4. POST-FIX BOUND LOCK — split classification. A rebuild still parked at
//     the cap: advancing the outgoing generation's clock past
//     `SHUTDOWN_AWAIT_CAP_MS` lets the supersession complete (it does not hang)
//     and emits no new diagnostic code. The cap-arming assertions red at HEAD
//     (no await exists, so no cap timer is armed). The completion and
//     no-diagnostic assertions cannot red at HEAD and pass vacuously there —
//     start #2 has already returned before the clock moves. The completion
//     half becomes load-bearing the moment the await lands (an unbounded await
//     would hang a live `session_start` dispatch on another generation's
//     rebuild), and its red direction is only provable against the fixed tree.
//  5. RED at HEAD — EVIDENCE AT THE QUIESCE. A throwing act on the outgoing
//     generation's `HotReloadHandle` emits exactly ONE diagnostic on the
//     injected `deps.emitDiagnostic` recorder, carrying the reused code, `W`
//     severity, `details.call === "hotReloadHandle.whenIdle(awaitCap)"`, the
//     underlying-error string in `details.error`, and the registry's own
//     Message template rendered for that pair — without aborting the
//     superseding pass, which still publishes, registers and arms. Covers all
//     three throw shapes the arm's ONE try/catch spans, so no shape can escape
//     it: `markTornDown()` throwing (the production-reachable one — it calls
//     `debouncer.cancel()`, whose `Clock.clearTimeout` is a seam, the same
//     failure the teardown labels `"Clock.clearTimeout(debounce)"`),
//     `whenIdle()` throwing SYNCHRONOUSLY (which propagates out of the quiesce
//     helper before its `await`), and `whenIdle()` returning a REJECTED promise
//     (which propagates through the `Promise.race` and the helper's `finally`).
//     Classification: reds at HEAD, where the arm does not exist — the
//     supersession pass calls only `detach()` on the outgoing handle, never
//     `markTornDown()`/`whenIdle()`, so no fault is raised and the recorder
//     stays `[]`. Measured against a tree whose `src/extension/factory.ts` was
//     restored to the HEAD blob (`a187f0f3`): all three acts red on the (a)
//     precondition (`expected [] to strictly equal [ '<act>' ]`) and on every
//     (b) evidence assertion (`expected [] to strictly equal [ Array(1) ]`,
//     then `expected undefined to be …` per field). It is not vacuous there and
//     it does not fail to construct.
//  6. POST-FIX GUARD CONTROL — a THROWING `emitDiagnostic` sink at the quiesce
//     arm must not abort the superseding pass. Mirrors
//     tests/supersession-detach-throw-containment.test.ts's test 4 for the
//     sibling `detach()` arm. Classification: it DOES red at HEAD, but on its
//     harness precondition rather than on the guard — the arm does not exist
//     there, so the sink is never reached and the precondition that it WAS
//     reached fails loudly (AGENTS.md: an unmet precondition names itself, it
//     does not pass quietly). Measured on the same restored-HEAD tree:
//     `harness precondition: the quiesce arm raised its fault exactly once:
//     expected [] to strictly equal [ 'markTornDown' ]`. The guard's OWN red
//     direction — an undefended emission turning a swallowed quiesce failure
//     into a throw escaping the host `session_start` dispatch — is provable
//     only against the fixed tree, by removing the inner try/catch around the
//     emission.
//
// Harness: mirrors tests/supersession-detach-throw-containment.test.ts (bug
// 0029's landed lock) and tests/double-session-start-supersession.test.ts — the
// real `createThetaExtension` + `composeExtensionInstance` over a mkdtemp
// temp-dir workspace, hand-rolled pi/ctx fakes recording `registerCommand`
// calls IN ORDER and `theta-system-note` sends, ONE shared window-recording
// `FakeClock`, one `FakeFileWatcher` per compose, `fireSessionStart`, an
// injected `deps.emitDiagnostic` recorder — with one bug-0034 delta:
//
//   Production's `rediscover` closure is built inside `composeExtensionInstance`
//   (`src/extension/production-composition.ts:1193–1213`) and is not gateable
//   from outside, so parking a rebuild deterministically needs a seam. This
//   file takes the returned `ExtensionInstanceWiring` and replaces ONLY its
//   `installHotReload` member with a call to the REAL
//   `src/extension/hot-reload.ts` `installHotReload`, over the same watcher,
//   the same shared clock, the same real `ThetaRegistry`, and the factory's own
//   `reRegister` bridge — supplying a `rediscover` that parks on a deferred
//   promise and then resolves to a fixed `ParsedTheta` list. The real
//   `ReloadDebouncer`, the real `HotReloadHandle`, the real `runReload` /
//   `rebuildAndSwap` publish path, and the factory's supersession block are all
//   production code; only the discovery walk behind `rediscover` is replaced,
//   which is what makes the parking point deterministic. The wrapper also
//   records, at the instant the rebuild re-registers, whether generation 1's
//   registry was already drained — the direct observable for "the publish
//   landed after the drain" (`rebuildAndSwap` calls the staged builder and
//   publishes in ONE synchronous run, `hot-reload.ts:244–255`).
//
//   Tests 5–6 add one more seam on the same replacement: the returned
//   `HotReloadHandle` can be wrapped so a NAMED act on it throws. That is the
//   boundary the factory itself holds — `HotReloadHandle`'s `markTornDown` and
//   `whenIdle` are optional members declared for substitution
//   (`hot-reload.ts:107–118`) — which makes a fault attributable to ONE act,
//   where faulting the shared `Clock` seam underneath them would also hit
//   generation 2's compose-time timers. `detach()` on the wrapper delegates to
//   the real handle, whose own `debouncer.markTornDown()` call is the
//   debouncer's rather than the wrapper's, so a wrapped fault cannot leak a
//   second diagnostic out of the sibling `detach()` arm.
//
// Re-derived at HEAD (3715fa5f), NOT taken from the bug doc's 0.32.0
// §Reproduction. With a generation-1 rebuild parked in `rediscover` across the
// supersession boundary and a rediscovered set of `["greet","third"]`:
//   - start #2 RETURNS with the rebuild still parked (the supersession pass is
//     not bounded-blocking on it);
//   - at that instant generation 1's registry reads `{ drained: true }` with
//     keys `["greet"]` and exactly 2 `pi.registerCommand` calls have happened
//     (generation 1's `/greet`, generation 2's `/greet`);
//   - after the parked pass is released it re-registers with
//     generation-1-registry `drained === true`, taking the ordered registration
//     sequence to `greet(start#1), greet(start#2), greet(gen1-reload),
//     third(gen1-reload)` — generation 1 owns `/greet` last;
//   - generation 1's drained registry then reads `["greet","third"]` — a
//     post-drain publish;
//   - dispatching the live `/greet` answers
//     `theta /greet: extension shutting down`;
//   - the structural-change note
//     `theta watcher: 1 file(s) added or removed; run /reload to refresh the
//     slash command list` is delivered on the live channel afterwards.
// The bug doc's recorded `theta/load/cross-format-collision` note does NOT fire
// at HEAD — bug 0024's fix (0.36.0) made the own-registration ledger
// FACTORY-scoped (PIC-69), so it spans generations and a leaked pass no longer
// misreads generation 2's own registrations as foreign survivors. Nothing in
// this file asserts that note. Post-fix the structural-change note still fires
// (the awaited rebuild completes by design), so tests 1 and 2 assert nothing
// about it; only test 3's control does, where no rebuild runs at all.

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import {
  createThetaExtension,
  type ThetaExtensionDeps,
} from "../src/extension/factory";
import {
  composeExtensionInstance,
  type ExtensionInstanceWiring,
} from "../src/extension/production-composition";
import {
  installHotReload,
  type HotReloadHandle,
} from "../src/extension/hot-reload";
import { RELOAD_DEBOUNCE_WINDOW_MS } from "../src/extension/reload-debounce";
import { SHUTDOWN_AWAIT_CAP_MS } from "../src/extension/capability-probe";
import type { ParsedTheta } from "../src/extension/reload-wiring";
import type {
  SystemNoteChannelDeps,
  SystemNoteSender,
} from "../src/extension/system-note-channel";
import { FakeClock } from "./helpers/fake-clock";
import { FakeFileWatcher } from "./helpers/fake-file-watcher";
import type { TimerHandle } from "../src/seams/clock";
import type {
  FileWatchEvent,
  OnWatchTerminate,
  Unsubscribe,
} from "../src/seams/file-watcher";

/**
 * The supersession path's own cap (§Fix step 3). Reuses the teardown's value —
 * `SHUTDOWN_AWAIT_CAP_MS`, `capability-probe.ts:75` — but as a deadline
 * captured at the quiesce rather than the teardown's handler-entry deadline,
 * which does not exist on this path. Imported rather than re-declared so a
 * retune of the shared constant cannot silently desynchronise this suite.
 */
const SUPERSESSION_QUIESCE_CAP_MS = SHUTDOWN_AWAIT_CAP_MS;

/**
 * The NEW second member of the closed `details.call` set for the quiesce arm
 * (mirroring the teardown's `"debouncer.whenIdle(awaitCap)"`). Deliberately a
 * string literal rather than a `src/**` import: the label does not exist at
 * HEAD, and tests 4–6 must red on their assertions, never on collection. Its
 * membership of the registry's closed set is itself asserted (test 5), so this
 * literal cannot silently drift from the wire contract.
 */
const SUPERSESSION_QUIESCE_CALL_LABEL = "hotReloadHandle.whenIdle(awaitCap)";

/**
 * The one host diagnostic code the supersession pass emits at HEAD (bug 0029's
 * landed row, `docs/spec_topics/diagnostics/code-registry-host.md:15`). The fix
 * reuses it for a THROWING mark/quiesce; cap expiry emits nothing, which is
 * what test 4 asserts.
 */
const SUPERSESSION_DETACH_FAILED_CODE =
  "theta/host/session-start-supersession-detach-failed";

/** One parsed row of the sharded diagnostics registry (`tools/code-registry`). */
interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/**
 * The live `theta/host/*` registry shard, read from the spec corpus — the same
 * input tests/code-registry.test.ts reconciles. Only the host shard is read:
 * the code under assertion lives there, and a row that moved out of it SHOULD
 * red here rather than be silently found on another page.
 */
const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-host.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];

/**
 * The registry row under assertion, or a loud failure naming the page that must
 * carry it (AGENTS.md: an unmet precondition names itself rather than degrading
 * into a vacuous `undefined` comparison downstream).
 */
function supersessionRegistryRow(): RegistryRow {
  const row = REGISTRY.find((candidate) => candidate.code === SUPERSESSION_DETACH_FAILED_CODE);
  if (row === undefined) {
    throw new Error(
      `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-host.md must carry the ` +
        `row for ${SUPERSESSION_DETACH_FAILED_CODE}`,
    );
  }
  return row;
}

/**
 * The row's normative *Message* template rendered for the quiesce arm (DIAG-4),
 * sourced from the registry through the same `registryMessage` lookup the
 * DIAG-4 precedent uses rather than copied, so the assertion reds on drift in
 * either direction. Definedness is asserted first so a missing row reds by
 * naming the registry, never by a bare `undefined` comparison downstream.
 */
function quiesceFailedMessage(error: string): string {
  const template = registryMessage(REGISTRY, SUPERSESSION_DETACH_FAILED_CODE) as
    | string
    | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-host.md must carry the ` +
      `Message row for ${SUPERSESSION_DETACH_FAILED_CODE}`,
  ).toBeDefined();
  return template!.replace("<call>", SUPERSESSION_QUIESCE_CALL_LABEL).replace(
    "<error>",
    error,
  );
}

/** The drain-state arm-(b) note for `/greet` (`drain-state.ts` `shuttingDownNote`). */
const GREET_SHUTTING_DOWN_NOTE = "theta /greet: extension shutting down";

/** Prefix of the watcher structural-change note (`reload-wiring.ts`). */
const STRUCTURAL_NOTE_PREFIX = "theta watcher: ";

const THETA_BODY = ["---", "mode: prompt", "---", "@`hi`", ""].join("\n");

/**
 * The set a parked generation-1 rebuild resolves to: the surviving `greet`
 * (generation 2 owns it too — the name the last-writer contest is fought over)
 * plus `third`, a name NO live generation ever discovered, so the leaked pass's
 * publish into generation 1's registry is distinguishable from anything
 * generation 2 did.
 */
const REDISCOVERED_NAMES = ["greet", "third"] as const;

/**
 * Real-ms bound on start #2 settling once the quiesce cap has expired (test 4).
 * An unbounded await would exhaust this instead of hanging the whole file.
 */
const SETTLE_BOUND_MS = 2000;

/**
 * Bound (real ms) on awaiting a dispatched slash handler. The arm-(b)
 * short-circuit settles immediately; POST-fix the same dispatch enters a REAL
 * prompt-mode theta run against the minimal fake command ctx, whose settling
 * this suite must not depend on — the note channel carries the discriminator
 * either way (mirrors tests/double-session-start-supersession.test.ts).
 */
const DISPATCH_SETTLE_CAP_MS = 1200;

/**
 * The three throw shapes the quiesce arm's ONE try/catch has to span (tests
 * 5–6), named by the act that raises them:
 *
 *  - `markTornDown` — the production-reachable one. The real
 *    `HotReloadHandle.markTornDown()` calls `ReloadDebouncer.markTornDown()`,
 *    whose `cancel()` reaches the injected `Clock.clearTimeout` seam; the
 *    `session_shutdown` teardown carries a closed label for exactly that
 *    failure (`"Clock.clearTimeout(debounce)"`).
 *  - `whenIdle-throws` — a SYNCHRONOUS throw out of `whenIdle()`, which escapes
 *    the quiesce helper before its `await` is ever reached, so the helper's
 *    `finally` runs on the unwind rather than on a settled race.
 *  - `whenIdle-rejects` — a REJECTED promise, which escapes through the
 *    `Promise.race` and the awaited helper instead. `HotReloadHandle` declares
 *    `whenIdle` as an optional, substitutable member, so an implementation that
 *    reports failure asynchronously is within its contract.
 */
type HandleFaultAct = "markTornDown" | "whenIdle-throws" | "whenIdle-rejects";

const HANDLE_FAULT_ACTS: readonly HandleFaultAct[] = [
  "markTornDown",
  "whenIdle-throws",
  "whenIdle-rejects",
];

/**
 * One distinct underlying-error string per act, so `details.error` also pins
 * WHICH act the emitted diagnostic describes — a single shared message would
 * let a mislabelled arm pass.
 */
const HANDLE_FAULT_MESSAGES: Readonly<Record<HandleFaultAct, string>> = {
  markTornDown: "EFAULT: synthetic Clock.clearTimeout(debounce) failure",
  "whenIdle-throws": "EFAULT: synthetic whenIdle() synchronous failure",
  "whenIdle-rejects": "EFAULT: synthetic whenIdle() rejection",
};

/** The throw a hostile `deps.emitDiagnostic` sink raises (test 6). */
const THROWING_SINK_MESSAGE = "synthetic emitDiagnostic sink failure";

/**
 * Wrap a real `HotReloadHandle` so ONE named act throws, recording each fault
 * it raises. `detach()` delegates untouched: the sibling detach arm must stay
 * green so the emission under assertion is attributable to the quiesce alone.
 */
function faultingHandle(
  real: HotReloadHandle,
  act: HandleFaultAct,
  raised: HandleFaultAct[],
): HotReloadHandle {
  const raise = (): never => {
    raised.push(act);
    throw new Error(HANDLE_FAULT_MESSAGES[act]);
  };
  return {
    detach: (): void => real.detach(),
    markTornDown: (): void => {
      if (act === "markTornDown") raise();
      real.markTornDown?.();
    },
    whenIdle: (): Promise<void> => {
      if (act === "whenIdle-throws") raise();
      if (act === "whenIdle-rejects") {
        raised.push(act);
        return Promise.reject(new Error(HANDLE_FAULT_MESSAGES[act]));
      }
      return real.whenIdle?.() ?? Promise.resolve();
    },
  };
}

/** A per-compose counting watcher: arm/detach is observable per generation. */
class CountingFakeFileWatcher extends FakeFileWatcher {
  watchCalls = 0;
  attached = false;

  override watch(
    roots: readonly string[],
    handler: (event: FileWatchEvent) => void,
    onTerminate?: OnWatchTerminate,
  ): Unsubscribe {
    this.watchCalls += 1;
    this.attached = true;
    const inner = super.watch(roots, handler, onTerminate);
    return () => {
      this.attached = false;
      inner();
    };
  }
}

/**
 * The one shared `FakeClock`, recording every armed timer window so a test can
 * prove the debounce window really was armed (test 3) and that the post-fix
 * quiesce cap timer is armed at its declared magnitude (test 4). One clock
 * serves both generations here, so the recording pins the armed window's value,
 * not which generation's clock carried it. Without that proof test 3's green
 * would be indistinguishable from a window never armed.
 */
class RecordingFakeClock extends FakeClock {
  readonly armedWindows: number[] = [];

  override setTimeout(fn: () => void, ms: number): TimerHandle {
    this.armedWindows.push(ms);
    return super.setTimeout(fn, ms);
  }
}

/** A recorded `pi.sendMessage` call (the `theta-system-note` channel). */
interface RecordedNote {
  readonly customType: string;
  readonly content: string;
  readonly triggerTurn: unknown;
}

/**
 * One recorded `pi.registerCommand` call. `source` attributes it to the
 * registration pass that issued it: `session_start#N` for the Nth
 * `session_start` delivery's `registerFixtures`, `gen<N>-reload` for a
 * watcher-driven re-registration of generation N (stamped by the harness's own
 * `reRegister` wrapper, which brackets the factory's bridge call).
 */
interface Registration {
  readonly name: string;
  readonly source: string;
}

/** One recorded generation-N `reRegister` (the re-registration bridge call). */
interface ReRegisterEvent {
  readonly generation: number;
  readonly names: readonly string[];
  /**
   * Whether THAT generation's registry was already drained when the rebuild
   * re-registered. `rebuildAndSwap` runs the staged builder (which calls
   * `reRegister`) and publishes in one synchronous run, so this is equally the
   * drain state at the publish instant. Post-fix it MUST be `false`.
   */
  readonly outgoingRegistryDrained: boolean;
  /** `registrations.length` immediately before the bridge call. */
  readonly registrationsBefore: number;
}

/** The registered pi command options shape the dispatch helper invokes against. */
interface RegisteredCommand {
  readonly handler: (args: string, ctx: ExtensionCommandContext) => unknown;
}

interface Harness {
  readonly pi: ExtensionAPI;
  /** The `theta-system-note` sender the replaced `installHotReload` delivers through. */
  readonly noteSender: SystemNoteSender;
  readonly commands: Map<string, unknown>;
  /** Every `pi.registerCommand` call, IN ORDER, attributed to its pass. */
  readonly registrations: Registration[];
  readonly notes: RecordedNote[];
  fireSessionStart(): Promise<void>;
}

function makeHarness(cwd: string, activePass: { label: string }): Harness {
  const commands = new Map<string, unknown>();
  const registrations: Registration[] = [];
  const notes: RecordedNote[] = [];
  const subscriptions = new Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >();
  let startDeliveries = 0;

  const recordNote = (
    message: { customType: string; content: string },
    options: { triggerTurn?: unknown } | undefined,
  ): void => {
    notes.push({
      customType: message.customType,
      content: message.content,
      triggerTurn: options?.triggerTurn,
    });
  };

  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: unknown): void => {
      registrations.push({ name, source: activePass.label });
      commands.set(name, options);
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      const list = subscriptions.get(event) ?? [];
      list.push(handler);
      subscriptions.set(event, list);
    },
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
    sendMessage: recordNote,
    sendUserMessage: (): void => {},
  } as unknown as ExtensionAPI;

  const ctx = {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;

  const fire = async (event: string, payload: Record<string, unknown>): Promise<void> => {
    for (const handler of subscriptions.get(event) ?? []) {
      await handler(payload, ctx);
    }
  };

  return {
    pi,
    noteSender: { sendMessage: recordNote } as unknown as SystemNoteSender,
    commands,
    registrations,
    notes,
    fireSessionStart: async (): Promise<void> => {
      startDeliveries += 1;
      const previous = activePass.label;
      activePass.label = `session_start#${startDeliveries}`;
      try {
        await fire("session_start", { type: "session_start" });
      } finally {
        activePass.label = previous;
      }
    },
  };
}

interface Boot {
  readonly harness: Harness;
  /** The ONE shared, window-recording `FakeClock`. */
  readonly clock: RecordingFakeClock;
  /** Per-compose watchers, indexed by compose START order. */
  readonly watchers: CountingFakeFileWatcher[];
  /** Per-compose wirings, indexed by compose START order. */
  readonly wirings: (ExtensionInstanceWiring | undefined)[];
  /** Everything the injected `deps.emitDiagnostic` seam and the note channel received. */
  readonly diagnostics: Diagnostic[];
  /** Every generation's `reRegister` bridge call, in order. */
  readonly reRegisters: ReRegisterEvent[];
  /** Per-generation: has that generation's `rediscover` been entered / settled? */
  readonly rediscoverEntered: boolean[];
  readonly rediscoverSettled: boolean[];
  /** Every fault the wrapped `HotReloadHandle` raised, in call order. */
  readonly handleFaults: HandleFaultAct[];
  /** How many times the injected `deps.emitDiagnostic` seam threw (test 6). */
  readonly sinkThrows: { count: number };
  /** Release the deferred gate a generation's `rediscover` parked on. */
  releaseRediscover(index: number): void;
}

interface BootOptions {
  /**
   * Which compose's (START order) `HotReloadHandle` faults, and at which act,
   * or `"none"` for a tree where every act succeeds. REQUIRED — no default, so
   * a test cannot silently boot a fault-free tree while asserting on a throw.
   */
  readonly handleFault: { readonly at: number; readonly act: HandleFaultAct } | "none";
  /** Make the injected `deps.emitDiagnostic` seam itself throw (test 6). */
  readonly throwingSink?: boolean;
}

function makeBoot(workspace: string, thetaDir: string, options: BootOptions): Boot {
  const activePass = { label: "factory" };
  const harness = makeHarness(workspace, activePass);
  const clock = new RecordingFakeClock();
  const watchers: CountingFakeFileWatcher[] = [];
  const wirings: (ExtensionInstanceWiring | undefined)[] = [];
  const diagnostics: Diagnostic[] = [];
  const reRegisters: ReRegisterEvent[] = [];
  const rediscoverEntered: boolean[] = [];
  const rediscoverSettled: boolean[] = [];
  const releases: (() => void)[] = [];
  const handleFaults: HandleFaultAct[] = [];
  const sinkThrows = { count: 0 };
  const handleFault = options.handleFault;

  const recordDiagnostic = (diagnostic: Diagnostic): void => {
    diagnostics.push(diagnostic);
  };

  /**
   * The `deps.emitDiagnostic` seam. The hostile-sink model is scoped to THIS
   * seam rather than to `recordDiagnostic` itself so a throw can only come from
   * the arm under assertion, never from the note channel's own ERR-7 route
   * (bug 0029's lock scopes its throwing sink the same way).
   */
  const emitThroughDepsSeam = (diagnostic: Diagnostic): void => {
    recordDiagnostic(diagnostic);
    if (options.throwingSink === true) {
      sinkThrows.count += 1;
      throw new Error(THROWING_SINK_MESSAGE);
    }
  };

  // The `theta-system-note` channel the replaced `installHotReload` delivers
  // the structural-change note and its ERR-7 batches through — the same
  // `pi.sendMessage` surface the production channel wraps, so notes land in the
  // one recorded stream alongside the factory's own.
  const noteChannel: SystemNoteChannelDeps = {
    pi: harness.noteSender,
    ui: { notify: (): void => {} },
    emitDiagnostic: recordDiagnostic,
  };

  const NOOP_RUN = async (): Promise<void> => {};
  const rediscovered = (): readonly ParsedTheta[] =>
    REDISCOVERED_NAMES.map((slashName) => ({
      slashName,
      frontmatter: { mode: "prompt" as const },
      body: { statements: [], tail: null },
      run: NOOP_RUN,
    }));

  const deps: ThetaExtensionDeps = {
    fixtures: [],
    // The bug-0023 seam the supersession path's diagnostics route through.
    emitDiagnostic: emitThroughDepsSeam,
    // Mirrors the production default export's wiring: forward the
    // own-registration ledger (bug 0024 / PIC-69) as the 5th argument, or the
    // pass under test runs without the ledger.
    composeInstance: async (pi, ctx, ownRegisteredNames) => {
      // One NEW watcher per compose call, indexed by START order (created
      // synchronously at dep entry, before any await): generations are
      // distinguishable only by their per-compose resources.
      const index = watchers.length;
      const watcher = new CountingFakeFileWatcher();
      watchers.push(watcher);
      const real = await composeExtensionInstance(
        pi,
        ctx,
        { fileWatcher: watcher, clock },
        undefined,
        ownRegisteredNames,
      );
      // Replace ONLY the `installHotReload` member (see the harness note in the
      // file header): the real `installHotReload` over the real registry,
      // clock, watcher and the factory's own `reRegister` bridge, with a
      // `rediscover` that parks on a deferred promise.
      const wiring: ExtensionInstanceWiring = {
        ...real,
        installHotReload(reRegister): HotReloadHandle {
          const handle = installHotReload({
            watcher,
            clock,
            // The fake watcher ignores its roots; the production union is
            // `initial.activeRoots` + the two settings-file paths.
            roots: [thetaDir],
            registry: real.registry,
            channel: noteChannel,
            rediscover: async (): Promise<readonly ParsedTheta[]> => {
              rediscoverEntered[index] = true;
              await new Promise<void>((resolve) => {
                releases[index] = resolve;
              });
              rediscoverSettled[index] = true;
              return rediscovered();
            },
            reRegister: (thetas: readonly ParsedTheta[]): void => {
              reRegisters.push({
                generation: index + 1,
                names: thetas.map((theta) => theta.slashName),
                outgoingRegistryDrained: real.registry.readDrainState().drained,
                registrationsBefore: harness.registrations.length,
              });
              const previous = activePass.label;
              activePass.label = `gen${index + 1}-reload`;
              try {
                reRegister(thetas);
              } finally {
                activePass.label = previous;
              }
            },
            initialNames: real.thetas.map((theta) => theta.slashName),
            probeRuntime: (): void => {
              void ctx.cwd;
            },
          });
          return handleFault !== "none" && handleFault.at === index
            ? faultingHandle(handle, handleFault.act, handleFaults)
            : handle;
        },
      };
      wirings[index] = wiring;
      return wiring;
    },
  };
  createThetaExtension(deps)(harness.pi);

  return {
    harness,
    clock,
    watchers,
    wirings,
    diagnostics,
    reRegisters,
    rediscoverEntered,
    rediscoverSettled,
    handleFaults,
    sinkThrows,
    releaseRediscover: (index) => {
      const release = releases[index];
      if (release === undefined) {
        // No silent skipping (AGENTS.md): an unparked rebuild is a harness defect.
        throw new Error(`generation ${index + 1} never parked inside rediscover`);
      }
      release();
    },
  };
}

/** Loud indexed access (noUncheckedIndexedAccess + fail-loudly on setup faults). */
function watcherAt(b: Boot, index: number): CountingFakeFileWatcher {
  const watcher = b.watchers[index];
  if (watcher === undefined) {
    throw new Error(`compose #${index + 1} never created its watcher`);
  }
  return watcher;
}

function wiringAt(b: Boot, index: number): ExtensionInstanceWiring {
  const wiring = b.wirings[index];
  if (wiring === undefined) {
    throw new Error(`compose #${index + 1} never resolved its wiring`);
  }
  return wiring;
}

/** One generation's registry key set, sorted — the publish-observable. */
function registryKeys(b: Boot, index: number): readonly string[] {
  return [...wiringAt(b, index).registry.snapshot().keys()].sort();
}

/** All notes carrying the watcher structural-change prefix. */
function structuralNotes(b: Boot): readonly RecordedNote[] {
  return b.harness.notes.filter((n) => n.content.startsWith(STRUCTURAL_NOTE_PREFIX));
}

/** All arm-(b) shutting-down notes for `/greet`. */
function greetShuttingDownNotes(b: Boot): readonly RecordedNote[] {
  return b.harness.notes.filter((n) => n.content === GREET_SHUTTING_DOWN_NOTE);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll a real-timer-bounded condition (the compose path does real fs I/O). */
async function waitFor(cond: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (cond()) return;
    await sleep(5);
  }
  throw new Error(`timeout waiting for ${label}`);
}

/**
 * Invoke the pi-registered handler for `/<name>` and await its settling,
 * bounded by `DISPATCH_SETTLE_CAP_MS` (see the constant's rationale). The note
 * channel carries the real discriminator; the returned outcome is recorded only
 * to prove the dispatch was reached.
 */
async function dispatchRegistered(
  b: Boot,
  name: string,
): Promise<"resolved" | "rejected" | "timed-out"> {
  const options = b.harness.commands.get(name) as RegisteredCommand | undefined;
  if (options === undefined) {
    // No silent skipping (AGENTS.md): a missing registration is a setup fault.
    throw new Error(`no command registered for /${name}`);
  }
  const settled = Promise.resolve(
    options.handler("", {} as unknown as ExtensionCommandContext),
  ).then(
    () => "resolved" as const,
    () => "rejected" as const,
  );
  return Promise.race([
    settled,
    new Promise<"timed-out">((resolve) =>
      setTimeout(() => resolve("timed-out"), DISPATCH_SETTLE_CAP_MS),
    ),
  ]);
}

/** What the supersession pass looked like at the instant start #2 returned. */
interface SupersessionReturn {
  settled: boolean;
  registrations: number;
  generation1Keys: readonly string[];
  generation1Drained: boolean | undefined;
}

/**
 * Boot one instance, put a generation-1 rebuild IN FLIGHT (parked inside
 * `rediscover`), then deliver the shutdown-less repeat `session_start` WITHOUT
 * awaiting it — post-fix that handler parks on the quiesce await, at HEAD it
 * runs its whole tail to completion. The returned record is stamped in the
 * microtask that observes start #2's return, so it is the same measurement on
 * both trees.
 */
async function bootWithInFlightRebuildAcrossSupersession(
  workspace: string,
  thetaDir: string,
  options: BootOptions,
): Promise<{
  readonly b: Boot;
  readonly start2: Promise<void>;
  readonly atReturn: SupersessionReturn;
  /** `clock.armedWindows.length` immediately before start #2 was delivered. */
  readonly armedBeforeStart2: number;
}> {
  const b = makeBoot(workspace, thetaDir, options);

  await b.harness.fireSessionStart();
  // Generation 1 is live: `/greet` registered, watcher 1 armed exactly once.
  expect(b.harness.commands.has("greet")).toBe(true);
  expect(watcherAt(b, 0).watchCalls).toBe(1);
  expect(watcherAt(b, 0).attached).toBe(true);

  // Arm ONE debounce window on generation 1 and CLOSE it: the rebuild starts
  // and parks inside `rediscover`, past `runReload`'s torn-down entry guard.
  const armedBefore = b.clock.armedWindows.length;
  watcherAt(b, 0).emit({ kind: "change", path: join(thetaDir, "greet.theta") });
  expect(
    b.clock.armedWindows.slice(armedBefore),
    "harness precondition: exactly one debounce window armed",
  ).toStrictEqual([RELOAD_DEBOUNCE_WINDOW_MS]);
  b.clock.advance(RELOAD_DEBOUNCE_WINDOW_MS);
  await waitFor(
    () => b.rediscoverEntered[0] === true,
    "generation 1's rebuild to enter rediscover",
  );
  // Fail loudly if the rebuild is not actually parked — otherwise every
  // assertion below would be vacuous.
  expect(
    b.rediscoverSettled[0],
    "harness precondition: generation 1's rebuild is IN FLIGHT (parked in rediscover)",
  ).not.toBe(true);

  const atReturn: SupersessionReturn = {
    settled: false,
    registrations: -1,
    generation1Keys: [],
    generation1Drained: undefined,
  };
  const armedBeforeStart2 = b.clock.armedWindows.length;
  const start2 = b.harness.fireSessionStart().then(() => {
    atReturn.settled = true;
    atReturn.registrations = b.harness.registrations.length;
    atReturn.generation1Keys = registryKeys(b, 0);
    atReturn.generation1Drained = wiringAt(b, 0).registry.readDrainState().drained;
  });
  await waitFor(() => b.wirings[1] !== undefined, "generation 2's compose to settle");
  // Let the handler run past its post-compose staleness check — to the quiesce
  // await (post-fix) or clean through its whole synchronous tail (at HEAD).
  await sleep(50);

  return { b, start2, atReturn, armedBeforeStart2 };
}

describe("bug 0034 — the supersession pass never awaits handle.whenIdle() (registration-steps.md#repeat-start-supersession, PIC-57/PIC-68)", () => {
  let workspace: string;
  let thetaDir: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "theta-bug0034-"));
    thetaDir = join(workspace, ".pi", "theta");
    mkdirSync(thetaDir, { recursive: true });
    writeFileSync(join(thetaDir, "greet.theta"), THETA_BODY, "utf8");
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Test 1 — RED at HEAD: no post-drain publish.
  // -------------------------------------------------------------------------

  it("no post-drain publish (RED at HEAD): a generation-1 rebuild in flight at supersession must settle BEFORE the drain — the drained registry gains no post-drain entry and no reRegister follows the drain", async () => {
    const { b, start2, atReturn } = await bootWithInFlightRebuildAcrossSupersession(
      workspace,
      thetaDir,
      { handleFault: "none" },
    );

    // (a) Harness precondition (fail loudly rather than assert vacuously): the
    // rebuild really is parked, so there IS an in-flight pass to await.
    expect(
      b.rediscoverEntered[0],
      "(a) harness precondition: generation 1's rebuild entered rediscover",
    ).toBe(true);
    expect(
      b.rediscoverSettled[0],
      "(a) harness precondition: generation 1's rebuild has not settled yet",
    ).not.toBe(true);

    // (b) The repeat `session_start` delivery is BOUNDED-BLOCKING on that
    // rebuild (§Fix's contract change): it has NOT returned while the rebuild
    // is parked. At HEAD the whole supersession tail is await-free, so start #2
    // has already returned here.
    expect.soft(
      atReturn.settled,
      "(b) start #2 must not return while the superseded generation's rebuild is in flight",
    ).toBe(false);

    // Release the parked rebuild and let everything settle on both trees.
    b.releaseRediscover(0);
    await start2;
    await waitFor(
      () => b.rediscoverSettled[0] === true,
      "generation 1's rebuild to leave rediscover",
    );
    await sleep(120);

    // (c) The re-registration — and the publish `rebuildAndSwap` performs in the
    // same synchronous run — landed while generation 1's registry was still
    // UNDRAINED. This is the direct witness of §Fix's ordering.
    expect.soft(
      b.reRegisters,
      "(c) harness precondition: the rebuild re-registered exactly once",
    ).toHaveLength(1);
    expect.soft(
      b.reRegisters[0]?.outgoingRegistryDrained,
      "(c) the superseded generation's reRegister/publish must precede its drain",
    ).toBe(false);
    expect.soft(
      b.reRegisters[0]?.names,
      "(c) the rebuild re-registered its rediscovered set",
    ).toStrictEqual([...REDISCOVERED_NAMES]);

    // (d) No post-drain publish: everything the drained registry will ever hold,
    // it already held when the supersession pass returned.
    expect.soft(
      atReturn.generation1Drained,
      "(d) harness precondition: generation 1's registry is drained by the supersession",
    ).toBe(true);
    expect.soft(
      registryKeys(b, 0),
      "(d) the drained generation-1 registry gains no entry after the supersession returned",
    ).toStrictEqual([...atReturn.generation1Keys]);
    expect.soft(
      atReturn.generation1Keys,
      "(d) the awaited rebuild's publish is already visible when the supersession returns",
    ).toStrictEqual([...REDISCOVERED_NAMES].sort());

    // (e) No `pi.registerCommand` lands after the supersession pass returned —
    // generation 2's registration pass is the last write on this instance.
    expect.soft(
      b.harness.registrations.slice(atReturn.registrations),
      "(e) no registration may follow the supersession pass's return",
    ).toStrictEqual([]);

    // (f) The live generation is intact either way (control, GREEN at HEAD).
    expect.soft(
      registryKeys(b, 1),
      "(f) the live generation still owns exactly its own published theta",
    ).toStrictEqual(["greet"]);
    expect.soft(
      wiringAt(b, 1).registry.readDrainState().drained,
      "(f) the live registry is not drained",
    ).toBe(false);
    expect.soft(
      watcherAt(b, 1).attached,
      "(f) the superseding pass still armed its watcher",
    ).toBe(true);
    expect.soft(
      watcherAt(b, 0).attached,
      "(f) the superseded generation's watcher is detached",
    ).toBe(false);
  }, 20000);

  // -------------------------------------------------------------------------
  // Test 2 — RED at HEAD: generation 2 owns every surviving name.
  // -------------------------------------------------------------------------

  it("last-writer (RED at HEAD): with a rebuild in flight across the boundary, generation 2's registration is the LAST for every name it published and dispatching it runs the theta, not the arm-(b) shutting-down note", async () => {
    const { b, start2, atReturn } = await bootWithInFlightRebuildAcrossSupersession(
      workspace,
      thetaDir,
      { handleFault: "none" },
    );
    void atReturn;

    b.releaseRediscover(0);
    await start2;
    await waitFor(
      () => b.rediscoverSettled[0] === true,
      "generation 1's rebuild to leave rediscover",
    );
    await sleep(120);

    // Harness precondition: the leaked pass really did re-register (otherwise
    // the last-writer contest below has no contestant).
    expect(
      b.reRegisters.map((event) => event.generation),
      "harness precondition: exactly one generation-1 reRegister ran",
    ).toStrictEqual([1]);

    // The names generation 2 actually published — the surviving set the live
    // generation must own. `third` is NOT among them (no live generation ever
    // discovered it), so it is out of scope here: a name only a dead generation
    // carried keeps failing safe, which is the fix's documented residual.
    const survivingNames = wiringAt(b, 1).thetas.map((theta) => theta.slashName);
    expect(
      survivingNames,
      "harness precondition: generation 2 published exactly /greet",
    ).toStrictEqual(["greet"]);

    // (a) For every surviving name the LAST `pi.registerCommand` is generation
    // 2's `session_start` registration pass, never a superseded generation's
    // watcher-driven re-registration. At HEAD the leaked pass registers last.
    for (const name of survivingNames) {
      const forName = b.harness.registrations.filter((r) => r.name === name);
      expect.soft(
        forName.length,
        `(a) /${name} was registered at least once`,
      ).toBeGreaterThan(0);
      expect.soft(
        forName[forName.length - 1]?.source,
        `(a) the LAST registration of /${name} must be generation 2's session_start pass`,
      ).toBe("session_start#2");
    }

    // (b) …so dispatching the live `/greet` runs the theta rather than
    // answering the drain-state arm-(b) note. At HEAD the name is bound to
    // generation 1's drained registry and answers "extension shutting down" on
    // a live session.
    const shuttingDownBefore = greetShuttingDownNotes(b).length;
    const outcome = await dispatchRegistered(b, "greet");
    expect.soft(
      greetShuttingDownNotes(b).length - shuttingDownBefore,
      "(b) dispatching a surviving name must not answer the arm-(b) shutting-down note",
    ).toBe(0);
    expect.soft(
      outcome,
      "(b) harness precondition: the dispatch was reached (not a missing registration)",
    ).not.toBe("timed-out");

    // Let any live prompt-mode run started by (b) settle before teardown of the
    // temp workspace, so a late fs read cannot race `afterEach`.
    await waitFor(
      () =>
        b.wirings.every(
          (wiring) => wiring === undefined || wiring.activeInvocations.size() === 0,
        ),
      "the /greet dispatch's invocation entry to settle",
    );

    // (c) Control (GREEN at HEAD, must stay green): the superseded generation
    // was still superseded — drained registry, detached watcher.
    expect.soft(
      wiringAt(b, 0).registry.readDrainState().drained,
      "(c) the superseded generation's registry is drained",
    ).toBe(true);
    expect.soft(
      watcherAt(b, 0).attached,
      "(c) the superseded generation's watcher is detached",
    ).toBe(false);
  }, 20000);

  // -------------------------------------------------------------------------
  // Test 3 — control (GREEN at HEAD and after): the discriminators are live.
  // -------------------------------------------------------------------------

  it("control (GREEN at HEAD and after): a debounce window still OPEN at supersession time fires no rebuild at all — no reRegister, no registry growth, no structural-change note", async () => {
    const b = makeBoot(workspace, thetaDir, { handleFault: "none" });

    await b.harness.fireSessionStart();
    expect(b.harness.commands.has("greet")).toBe(true);
    expect(watcherAt(b, 0).attached).toBe(true);

    // Arm ONE debounce window on generation 1 and leave it PENDING: the event
    // is delivered, the shared clock is NOT advanced, so no rebuild has started.
    const armedBefore = b.clock.armedWindows.length;
    watcherAt(b, 0).emit({ kind: "change", path: join(thetaDir, "greet.theta") });
    expect(
      b.clock.armedWindows.slice(armedBefore),
      "harness precondition: exactly one debounce window armed and PENDING at the boundary",
    ).toStrictEqual([RELOAD_DEBOUNCE_WINDOW_MS]);
    expect(
      b.rediscoverEntered[0],
      "harness precondition: no rebuild has started (the window is still open)",
    ).not.toBe(true);

    // The supersession. Bug 0029's containment-first `detach()` marks the
    // debouncer torn-down before its one fallible step, so the pending window
    // is cancelled and can never open a rebuild.
    await b.harness.fireSessionStart();
    const registrationsAtSupersession = b.harness.registrations.length;
    const structuralNotesAtSupersession = structuralNotes(b).length;

    // Advance the clock well past the window that was pending.
    b.clock.advance(RELOAD_DEBOUNCE_WINDOW_MS * 4);
    await sleep(150);

    expect(
      b.rediscoverEntered[0],
      "the cancelled window must never open a superseded-generation rebuild",
    ).not.toBe(true);
    expect(b.reRegisters, "no superseded-generation reRegister").toStrictEqual([]);
    expect(
      registryKeys(b, 0),
      "the superseded generation's registry must not gain rediscovered names",
    ).toStrictEqual(["greet"]);
    expect(
      b.harness.registrations.slice(registrationsAtSupersession),
      "no registration after the supersession",
    ).toStrictEqual([]);
    expect(
      structuralNotes(b).length,
      "no structural-change note from the superseded generation",
    ).toBe(structuralNotesAtSupersession);

    // The live generation is untouched — the same post-state tests 1 and 2 pin
    // for the in-flight case, so their assertions are reachable in the green
    // direction rather than asserting an impossibility.
    expect(registryKeys(b, 1)).toStrictEqual(["greet"]);
    expect(wiringAt(b, 1).registry.readDrainState().drained).toBe(false);
    expect(watcherAt(b, 1).attached).toBe(true);
    expect(wiringAt(b, 0).registry.readDrainState().drained).toBe(true);
    expect(watcherAt(b, 0).attached).toBe(false);
  }, 20000);

  // -------------------------------------------------------------------------
  // Test 4 — POST-FIX BOUND LOCK (split classification; see the header note).
  // -------------------------------------------------------------------------

  it("post-fix bound lock: a rebuild still parked at the cap lets the supersession complete once the outgoing clock passes SHUTDOWN_AWAIT_CAP_MS, emitting no new diagnostic code (cap-arming red at HEAD; completion/no-diagnostic halves vacuous there)", async () => {
    const { b, start2, atReturn, armedBeforeStart2 } =
      await bootWithInFlightRebuildAcrossSupersession(workspace, thetaDir, {
        handleFault: "none",
      });

    // The rebuild is parked and stays parked: post-fix the supersession is
    // waiting on the quiesce race, and only the cap can release it.
    expect(
      b.rediscoverSettled[0],
      "harness precondition: the rebuild is still parked at the cap boundary",
    ).not.toBe(true);

    // The parked supersession's await is BOUNDED, and bounded at the declared
    // magnitude: one cap timer of exactly `SUPERSESSION_QUIESCE_CAP_MS` armed
    // on the injected clock, and it is the LAST window armed — the pass is
    // parked on it when the advance below releases it. That is what makes the
    // completion asserted further down a cap release rather than any other
    // release path, and it reds on a retuned or re-derived bound. The other
    // windows in the slice are generation 2's compose-time per-package-read
    // discovery deadlines, armed on the same shared clock.
    const armedDuringSupersession = b.clock.armedWindows.slice(armedBeforeStart2);
    expect(
      armedDuringSupersession.filter((ms) => ms === SUPERSESSION_QUIESCE_CAP_MS),
      "the parked supersession armed exactly one cap timer, at SUPERSESSION_QUIESCE_CAP_MS",
    ).toStrictEqual([SUPERSESSION_QUIESCE_CAP_MS]);
    expect(
      armedDuringSupersession[armedDuringSupersession.length - 1],
      "the cap timer is the last window armed before the advance that releases it",
    ).toBe(SUPERSESSION_QUIESCE_CAP_MS);

    // Run the cap out on the OUTGOING generation's clock (one shared FakeClock
    // here — the fix arms its cap timer on `liveClock`, which `factory.ts:776`
    // overwrites only after this block).
    b.clock.advance(SUPERSESSION_QUIESCE_CAP_MS + 1);

    // The supersession must COMPLETE, not hang: an unbounded await would
    // exhaust this real-timer bound instead of the whole file's timeout.
    const settled = await Promise.race([
      start2.then(() => "settled" as const),
      sleep(SETTLE_BOUND_MS).then(() => "hung" as const),
    ]);
    expect(
      settled,
      "the supersession must complete at the cap rather than hang the session_start dispatch",
    ).toBe("settled");
    expect(atReturn.settled, "start #2 returned").toBe(true);

    // Generation 2 is fully live: published, registered, armed, with the
    // outgoing generation superseded.
    expect(b.harness.commands.has("greet")).toBe(true);
    expect(registryKeys(b, 1)).toStrictEqual(["greet"]);
    expect(watcherAt(b, 1).attached).toBe(true);
    expect(wiringAt(b, 1).registry.readDrainState().drained).toBe(false);
    expect(wiringAt(b, 0).registry.readDrainState().drained).toBe(true);
    expect(watcherAt(b, 0).attached).toBe(false);

    // PIC-57: a rebuild still in flight at the deadline is abandoned safely
    // under the torn-down flag and emits NO new diagnostic code — the DIAG-2
    // registry is unchanged by this fix.
    expect(
      b.diagnostics.filter(
        (d) =>
          d.code === SUPERSESSION_DETACH_FAILED_CODE ||
          d.details?.call === SUPERSESSION_QUIESCE_CALL_LABEL,
      ),
      "cap expiry emits no supersession diagnostic",
    ).toStrictEqual([]);
    expect(
      b.diagnostics.map((d) => d.code),
      "cap expiry emits no diagnostic at all on the supersession path",
    ).toStrictEqual([]);

    // Release the abandoned rebuild so no promise is left parked past the test.
    b.releaseRediscover(0);
    await waitFor(
      () => b.rediscoverSettled[0] === true,
      "the abandoned rebuild to leave rediscover",
    );
    await sleep(80);
  }, 20000);

  // -------------------------------------------------------------------------
  // Test 5 — RED at HEAD: evidence at the quiesce.
  // -------------------------------------------------------------------------

  it("evidence at the quiesce (RED at HEAD): a throwing act on the outgoing handle emits exactly one theta/host/session-start-supersession-detach-failed under details.call hotReloadHandle.whenIdle(awaitCap), without aborting the superseding pass", async () => {
    // Classification, measured against HEAD (3715fa5f) rather than assumed: the
    // quiesce arm does not exist there, so the supersession pass calls only
    // `detach()` on the outgoing handle and never `markTornDown()`/`whenIdle()`.
    // No fault is raised, the recorder stays `[]`, and this test reds on its
    // per-act (a) precondition AND on every (b) evidence assertion — for all
    // three acts. Both neutralisation directions were also exercised against
    // the fixed tree: mislabelling the emission reds (b)'s `details.call` and
    // message assertions, and dropping the emit reds all of (b).

    // The wire contract, read FROM the registry (DIAG-4) rather than copied:
    // the row's severity and the membership of the quiesce label in its closed
    // `details.call` set. Deduplication on `(code, details.call)` is specified
    // to be meaningful across independent implementations, so an emission whose
    // label the registry does not list is off-contract even when it is
    // self-consistent.
    const row = supersessionRegistryRow();
    expect(row.severity, "registry: the row's Sev column").toBe("W");
    expect(
      row.trigger.includes(`"${SUPERSESSION_QUIESCE_CALL_LABEL}"`),
      `registry: code-registry-host.md must list ${SUPERSESSION_QUIESCE_CALL_LABEL} in the ` +
        `closed details.call set for ${SUPERSESSION_DETACH_FAILED_CODE}`,
    ).toBe(true);

    for (const act of HANDLE_FAULT_ACTS) {
      const { b, start2 } = await bootWithInFlightRebuildAcrossSupersession(
        workspace,
        thetaDir,
        { handleFault: { at: 0, act } },
      );

      // The throw must not escape into the host `session_start` dispatch: this
      // await rejects if it did, because the harness's `fire` awaits the
      // handler it delivered to.
      await start2;

      // (a) Harness precondition: the arm reached the faulting act exactly
      // once, so there IS a failure to evidence.
      expect.soft(
        b.handleFaults,
        `(a) [${act}] harness precondition: the quiesce arm raised this fault exactly once`,
      ).toStrictEqual([act]);

      // (b) Exactly ONE diagnostic on the injected `deps.emitDiagnostic`
      // recorder — the whole recorder, not a filtered view, so a second
      // emission from the sibling `detach()` arm would red here too.
      expect.soft(
        b.diagnostics.map((d) => d.code),
        `(b) [${act}] exactly one diagnostic rides the seam per failing quiesce`,
      ).toStrictEqual([SUPERSESSION_DETACH_FAILED_CODE]);

      const emitted = b.diagnostics[0];
      const error = HANDLE_FAULT_MESSAGES[act];
      expect.soft(emitted?.severity, `(b) [${act}] W severity (registry row)`).toBe(
        "warning",
      );
      expect.soft(
        emitted?.details?.call,
        `(b) [${act}] the quiesce arm's closed-set details.call label`,
      ).toBe(SUPERSESSION_QUIESCE_CALL_LABEL);
      expect.soft(
        emitted?.details?.error,
        `(b) [${act}] details.error carries the underlying-error string`,
      ).toBe(error);
      expect.soft(
        emitted?.message,
        `(b) [${act}] the registry's Message template rendered for (call, error)`,
      ).toBe(quiesceFailedMessage(error));

      // (c) The throw did not abort the superseding pass: generation 2 still
      // published, registered and armed, and the outgoing generation is still
      // superseded. Evidence at the quiesce is evidence, not a control that
      // takes the pass down with it.
      expect.soft(
        b.harness.commands.has("greet"),
        `(c) [${act}] the superseding pass still registered its theta`,
      ).toBe(true);
      expect.soft(
        registryKeys(b, 1),
        `(c) [${act}] the superseding pass still published its registry`,
      ).toStrictEqual(["greet"]);
      expect.soft(
        watcherAt(b, 1).attached,
        `(c) [${act}] the superseding pass still armed its watcher`,
      ).toBe(true);
      expect.soft(
        wiringAt(b, 1).registry.readDrainState().drained,
        `(c) [${act}] the live registry is not drained`,
      ).toBe(false);
      expect.soft(
        wiringAt(b, 0).registry.readDrainState().drained,
        `(c) [${act}] the superseded generation's registry is drained`,
      ).toBe(true);
      expect.soft(
        watcherAt(b, 0).attached,
        `(c) [${act}] the superseded generation's watcher is detached`,
      ).toBe(false);

      // Release the rebuild the failed quiesce left unawaited — the residual the
      // registry row records for this arm — so no promise is left parked past
      // the iteration.
      b.releaseRediscover(0);
      await waitFor(
        () => b.rediscoverSettled[0] === true,
        `the unawaited rebuild to leave rediscover after the ${act} fault`,
      );
      await sleep(80);
    }
    // Three full two-compose boots, each doing real fs I/O, share this bound.
  }, 60000);

  // -------------------------------------------------------------------------
  // Test 6 — POST-FIX GUARD CONTROL (see the header classification note).
  // -------------------------------------------------------------------------

  it("post-fix guard control: a THROWING emitDiagnostic sink at the quiesce arm must not abort the superseding pass (reds at HEAD on its precondition — the arm does not exist there, so the sink is never reached)", async () => {
    // The emission is defended by its own inner try/catch per
    // diagnostic-emission-isolation.md, so a hostile sink cannot turn a
    // swallowed quiesce failure into a throw escaping the host `session_start`
    // dispatch. Classification, measured at HEAD (3715fa5f): the arm does not
    // exist there, so no fault is raised and the sink is never invoked — the
    // first precondition below reds rather than passing vacuously (AGENTS.md:
    // an unmet precondition names itself). The guard's OWN red direction is
    // provable only against the fixed tree, by removing that inner catch.
    const { b, start2 } = await bootWithInFlightRebuildAcrossSupersession(
      workspace,
      thetaDir,
      { handleFault: { at: 0, act: "markTornDown" }, throwingSink: true },
    );

    // Start #2 resolved rather than rejecting — a throw escaping the handler
    // would surface here, because the harness's `fire` awaits it.
    await start2;

    // Harness preconditions: the arm faulted, so the emission ran; and the sink
    // it ran through really did throw.
    expect(
      b.handleFaults,
      "harness precondition: the quiesce arm raised its fault exactly once",
    ).toStrictEqual(["markTornDown"]);
    expect(
      b.sinkThrows.count,
      "harness precondition: the hostile emitDiagnostic sink was reached and threw",
    ).toBe(1);

    // Generation 2 is fully live: published, registered, armed, with the
    // outgoing generation superseded.
    expect(b.harness.commands.has("greet")).toBe(true);
    expect(registryKeys(b, 1)).toStrictEqual(["greet"]);
    expect(watcherAt(b, 1).attached).toBe(true);
    expect(wiringAt(b, 1).registry.readDrainState().drained).toBe(false);
    expect(wiringAt(b, 0).registry.readDrainState().drained).toBe(true);
    expect(watcherAt(b, 0).attached).toBe(false);

    // Release the rebuild the failed quiesce left unawaited so no promise is
    // left parked past the test.
    b.releaseRediscover(0);
    await waitFor(
      () => b.rediscoverSettled[0] === true,
      "the unawaited rebuild to leave rediscover",
    );
    await sleep(80);
  }, 20000);
});
