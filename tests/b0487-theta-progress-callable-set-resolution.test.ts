import { describe, expect, it } from "vitest";
import { callableSetDeps, resolveList, withCode } from "./helpers/e2e-s1";
import type { CallableSetDeps } from "../src/parser/callable-set";
import { THETA_PROGRESS_TOOL_NAME } from "../src/extension/execution-status/types";

// Bug 0487 part (1) — the callable-set resolver's Pi-tool arm mints a false
// `theta/load/unknown-tool` for the in-process tool `theta_progress`.
// (docs/bugs/0487-load-time-false-positive-diagnostics-on-subagent-callees.md)
//
// THE SEAM UNDER TEST — `resolveEntry` (src/parser/callable-set.ts), the arm
// that resolves a bare identifier against `deps.resolvePiTool` and mints
// `unknown Pi tool '<spec>'` when that returns `undefined`. `theta_progress`
// (`THETA_PROGRESS_TOOL_NAME`, src/extension/execution-status/types.ts) is an
// in-process tool the factory registers as an executor; it is neither a host
// built-in nor an entry in the `pi.getAllTools()` extension registry, so it does
// not resolve through `deps.resolvePiTool` and is falsely minted as
// `theta/load/unknown-tool`.
//
// SETTLED FIX (option A). Project the factory's in-process-tool name set into
// the parse-time `CallableSetDeps` so `resolveEntry` accepts an in-process name
// as a resolved Pi-tool-shaped entry instead of minting `unknown-tool`. This
// test commits to that settled shape: an OPTIONAL `inProcessToolNames:
// ReadonlySet<string>` field on `CallableSetDeps` that `resolveEntry` consults
// (before minting unknown-tool) for a bare identifier that is neither a runtime
// tool nor resolvable through `resolvePiTool`. The implementer's option-A fix
// MUST read this field name, or update this test's field name to match — the
// green direction depends on `resolveEntry` reading exactly the set this test
// supplies. The behaviour-level witness that does not depend on any internal
// field name is the composition test
// (tests/b0487-theta-progress-callee-composition.test.ts).
//
// TIER — unit, offline, provider-free, deterministic. `resolveCallableSet` is a
// pure function over injected deps.
//
// Diagnostic *Message* strings / codes are sourced from the constants
// (`THETA_PROGRESS_TOOL_NAME`; code `theta/load/unknown-tool`) per the
// *Diagnostic message anchors* rule. docs/STYLE.md binds this prose.

const UNKNOWN_TOOL_CODE = "theta/load/unknown-tool";

/**
 * The option-A deps shape: the base `CallableSetDeps` plus the in-process-tool
 * name set the factory projects in. `resolveEntry` reads the optional
 * `inProcessToolNames` field to accept an in-process name (e.g. `theta_progress`)
 * as a resolved Pi-tool-shaped entry instead of minting unknown-tool.
 */
function depsWithInProcess(
  base: CallableSetDeps,
  inProcessNames: readonly string[],
): CallableSetDeps {
  return {
    ...base,
    inProcessToolNames: new Set(inProcessNames),
  };
}

describe("bug 0487 (1) — resolveEntry accepts an in-process tool name supplied via deps", () => {
  it("a `tools:` entry `theta_progress` resolves clean (zero unknown-tool) when the in-process name set is supplied", () => {
    // The registry knows only `bash`; `theta_progress` is supplied ONLY through
    // the in-process name set the factory projects into the deps.
    const deps = depsWithInProcess(callableSetDeps({ piTools: ["bash"] }), [
      THETA_PROGRESS_TOOL_NAME,
    ]);
    const r = resolveList(["bash", THETA_PROGRESS_TOOL_NAME], deps);

    // Pre-fix: `resolveEntry` ignores the in-process set and mints
    // `unknown Pi tool 'theta_progress'`. RED here. Post-fix: it accepts the
    // in-process name and mints none.
    expect(
      withCode(r.diagnostics, UNKNOWN_TOOL_CODE).map((d) => d.message),
      `an in-process tool name supplied via the deps must not be minted as ${UNKNOWN_TOOL_CODE}; ` +
        `got ${JSON.stringify(r.diagnostics.map((d) => `${d.code}: ${d.message}`))}`,
    ).toEqual([]);
    expect(
      r.registered,
      "a theta whose only in-set tool is a supplied in-process name must register",
    ).toBe(true);
    expect(
      r.callableSet?.entries.has(THETA_PROGRESS_TOOL_NAME),
      "the in-process tool binds under its own name in the callable set",
    ).toBe(true);
    expect(r.callableSet?.entries.has("bash"), "the real Pi tool still binds").toBe(true);
  });

  it("control: WITHOUT the in-process name set, `theta_progress` is still an unknown-tool (the set is the discriminator)", () => {
    // A stable control (green pre- and post-fix): when the in-process name set
    // is NOT supplied, `theta_progress` resolves through nothing and IS an
    // unknown-tool. This proves the resolution outcome turns on the supplied
    // set, so the primary cell above is not vacuously passing on some unrelated
    // arm.
    const r = resolveList(["bash", THETA_PROGRESS_TOOL_NAME], callableSetDeps({ piTools: ["bash"] }));
    const unknown = withCode(r.diagnostics, UNKNOWN_TOOL_CODE);
    expect(
      unknown.map((d) => d.message),
      "with no in-process name set, the in-process tool name is a genuine unknown-tool",
    ).toEqual([`unknown Pi tool '${THETA_PROGRESS_TOOL_NAME}'`]);
    expect(r.registered).toBe(false);
  });
});
