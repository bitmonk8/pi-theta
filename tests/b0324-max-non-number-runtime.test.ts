import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { executeBody } from "../src/runtime/statement-executor";
import { bodyOf } from "./helpers/e2e-s1";
import { flush as tick } from "./helpers/fake-clock";
import { ParForHost, execDeps } from "./helpers/par-for-harness";

// ===========================================================================
// Bug 0324 (runtime half) — witness suite (Phase 1, RED). Fixed in 0.312.0.
// ===========================================================================
//
// Rule under witness: control-flow.md CTRL-2 grants `max` the power only to
// *lower* the in-flight width. `evalParFor`'s width read
// (src/runtime/statement-executor.ts, the `typeof maxResult.value === "number"`
// branch) substitutes `PAR_FOR_THROTTLE` (64) for any non-number operand value,
// which is the clause-absent maximum — inverting the one power the clause has.
// A non-number width can still reach the width read through the deferred
// (`unknown`-verdict) static path even once the static half lands, so the
// runtime must not silently maximise.
//
// Expected behaviour (pinned design, PARENT ADJUDICATION): the non-number
// branch clamps the resolved width DOWN to 1 AND emits the runtime diagnostic
// `theta/runtime/par-max-non-integer` through the `emitDiagnostic` channel. The
// `typeof === "number"` guard itself is unchanged (NaN is a number and is bug
// 0325's territory, not witnessed here).
//
// Observables (modelled on tests/par-for.test.ts `ParForHost`): a gated effect
// host holds every iteration open, so the peak in-flight count is the width the
// executor admits. RED today: peak 5 (unthrottled, the 64 substitution) and no
// diagnostic. GREEN after fix: peak 1 AND the diagnostic captured.
//
// emitDiagnostic wiring (design Half 2): `ExecuteBodyDeps` gains an OPTIONAL
// `emitDiagnostic` field in Phase 2, and `evalParFor` calls it on the
// clamp-down branch. That field does not exist on the production type yet, so
// the shared harness declares a `DiagnosticSpyDeps` interface that EXTENDS
// `ExecuteBodyDeps` with the field the fix will add (no src/ change) and wires a
// capturing spy. The spy stays empty today because the production `evalParFor`
// makes no such call — so the diagnostic assertion is RED-for-the-right-reason
// today (empty) and green once the fix threads and calls the channel. The
// peak-in-flight assertion reds independently of the spy.

const RUNTIME_CODE = "theta/runtime/par-max-non-integer";

describe("bug 0324 runtime — a non-number `max` value must clamp width down and diagnose", () => {
  it("a `string`-valued `max` operand clamps in-flight width to 1 and emits the runtime code", async () => {
    const host = new ParForHost();
    const captured: Diagnostic[] = [];
    let release!: () => void;
    host.gate = new Promise<void>((res) => {
      release = res;
    });

    // `w` is a `string` — post-fix this exact shape is load-refused by
    // `non-integer-max`, but the seam harness executes the body regardless of
    // load diagnostics, standing in for the production deferred/`unknown` route
    // (union-typed or withheld-binder operands) whose non-number VALUE reaches
    // the width read. The clause must lower the width, so the peak in flight is
    // the clamp floor, not the 64-throttle substitution.
    const body = bodyOf(
      ['let w = "abc"', 'par for f in [1, 2, 3, 4, 5] max w { invoke("./c.theta", f) }'].join(
        "\n",
      ),
    );
    const execPromise = executeBody(body, execDeps(body, host, captured));
    await tick(30);

    const peakWhileGated = host.peakInFlight;
    release();
    await execPromise;

    expect(
      peakWhileGated,
      "CTRL-2: a non-number `max` value clamps the in-flight width DOWN to 1 (RED today: 5, the 64-throttle substitution)",
    ).toBe(1);
    expect(
      captured.map((d) => d.code),
      "the clamp-down is not silent — the runtime diagnostic is emitted (RED today: no diagnostic)",
    ).toContain(RUNTIME_CODE);
  });

  it("CONTROL: an integer `max` value throttles to that width with no diagnostic", async () => {
    const host = new ParForHost();
    const captured: Diagnostic[] = [];
    let release!: () => void;
    host.gate = new Promise<void>((res) => {
      release = res;
    });

    const body = bodyOf(
      'par for f in [1, 2, 3, 4, 5] max 2 { invoke("./c.theta", f) }',
    );
    const execPromise = executeBody(body, execDeps(body, host, captured));
    await tick(30);

    const peakWhileGated = host.peakInFlight;
    release();
    await execPromise;

    expect(
      peakWhileGated,
      "CTRL-2: `max 2` admits at most 2 iterations in flight — the integer path is unchanged",
    ).toBe(2);
    expect(
      captured.map((d) => d.code),
      "an intelligible integer width emits no runtime diagnostic",
    ).not.toContain(RUNTIME_CODE);
  });
});
