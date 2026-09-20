import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  diagnosticLineReaders,
  disposeWorkspace,
  plantThetaWorkspace,
  runProductionLoad,
  theta,
  type LoadOutcome,
  type PlantedThetaFile,
} from "./helpers/production-load-harness";
import { THETA_PROGRESS_TOOL_NAME } from "../src/extension/execution-status/types";
import { calleeHasErrorsMessage } from "../src/parser/invoke-diagnostics";

// Bug 0487 parts (1) + (3) — the load-time callable-set resolver mints a false
// `theta/load/unknown-tool` for the in-process tool `theta_progress`, and the
// caller then cascades a false `theta/load/callee-has-errors`.
// (docs/bugs/0487-load-time-false-positive-diagnostics-on-subagent-callees.md)
//
// THE SEAM UNDER TEST — the PRODUCTION compose pass, driven end to end over a
// planted discovery workspace by `discoverAndComposeFixtures`
// (src/extension/production-composition.ts). `theta_progress` is registered by
// the factory as an IN-PROCESS tool executor (`THETA_PROGRESS_TOOL_NAME`,
// src/extension/execution-status/types.ts; `registerThetaProgressTool`,
// src/extension/execution-status/progress-tool.ts) and dispatches correctly at
// runtime through `inProcessToolExecutors`. But the LOAD-time callable-set
// resolution — `resolveEntry` (src/parser/callable-set.ts, the
// `deps.resolvePiTool` arm that mints `unknown Pi tool '<spec>'`) driven by the
// two callee-facing `resolvePiTool` closures the compose pass builds inside
// `resolveThetaToolsAtLoad` (the `deps` closure) and the callee-parse path (the
// `stubDeps` closure) in production-composition.ts — resolves only host
// built-ins and the `pi.getAllTools()` extension registry snapshot. Neither
// closure knows the factory's in-process-tool name set, so a `tools:` entry
// `theta_progress` on a callee resolves to `undefined` → false
// `theta/load/unknown-tool`, which un-registers the callee, which cascades a
// false `theta/load/callee-has-errors` onto the caller.
//
// SETTLED FIX (part 1 = option A): project the factory's in-process-tool name
// set into the parse-time callable-set deps so `resolveEntry` accepts an
// in-process name as a resolved Pi-tool-shaped entry, identically at every
// `resolvePiTool` closure site — so the callee is not re-flagged and the caller
// does not cascade. Part (3) falls out of part (1): once the callee's only load
// error is gone, the caller emits zero `callee-has-errors`.
//
// TIER — unit/composition, offline, provider-free, deterministic. The seam is
// the compose pass's own deps construction, reachable only through composition:
// `resolveCallableSet` itself is correct (it emits `unknown-tool` exactly when
// its injected `resolvePiTool` returns `undefined`); the defect is that the
// compose pass builds those closures without the in-process name set. A pure
// `resolveCallableSet` unit test cannot witness that omission because it injects
// its own deps. So the composition pass is the tier that reaches the real
// closures — a live turn adds nothing (the diagnostics are pure load-time
// output). A missing precondition fails loudly (CLAUDE.md / AGENTS.md: no silent
// skipping). docs/STYLE.md binds this prose.
//
// ISOLATION FROM PART (2). Both thetas resolve a binder model cleanly:
// `.pi/settings.json` pins `theta.binderModel` to the one available model
// (`test/binder`), and the caller declares a scalar `bind_model:` that resolves
// against it — so no `theta/load/binder-model-unresolved` and no
// `theta/load/model-unresolved` are in play, and the ONLY load error in this
// workspace pre-fix is the `theta_progress` false positive and its cascade.

const UNKNOWN_TOOL_CODE = "theta/load/unknown-tool";
const CALLEE_HAS_ERRORS_CODE = "theta/load/callee-has-errors";

// One available model with NO `strictCapable` field — the theta 1.0 Pi-SDK-pin
// shape, so a resolved binder reference takes the strict-capability probe's
// silent-admit branch (bug 0475) and the theta registers.
const AVAILABLE_MODELS: readonly unknown[] = [{ provider: "test", id: "binder" }];

// The callee stem and the caller's `tools:` entry that names it. The
// callee-has-errors message renders the entry SPEC as written.
const CALLEE_STEM = "fixtree";
const CALLEE_ENTRY = `./${CALLEE_STEM}.theta`;
const CALLER_STEM = "orchestrator";

// CALLEE — a subagent worker mirroring `fix-cluster-tree.theta`'s shape: a
// `model:` that resolves, NO `bind_model:` (so the settings fallback supplies
// the binder model), a multi-field `params:` (binder-eligible), and a `tools:`
// list declaring the in-process tool `theta_progress` alongside a real Pi tool.
// Pre-fix its ONLY load error is the false `unknown Pi tool 'theta_progress'`.
const CALLEE = theta(
  "---",
  'description: "worker declaring the in-process tool theta_progress"',
  "mode: subagent",
  'model: "test/binder"',
  "tools:",
  "  - bash",
  `  - ${THETA_PROGRESS_TOOL_NAME}`,
  "params:",
  "  manifest: string",
  "  key: string",
  "---",
  "@`fix`",
);

// CALLER — a quality-loop-shaped orchestrator: prompt mode, a scalar
// `bind_model:` that resolves, and a `tools:` list invoking the callee as a
// subagent. Pre-fix it cascades `callee-has-errors` from the callee's false
// positive; post-fix it emits none.
const CALLER = theta(
  "---",
  'description: "orchestrator invoking a worker that declares theta_progress"',
  "mode: prompt",
  'bind_model: "test/binder"',
  "tools:",
  "  - bash",
  `  - ${CALLEE_ENTRY}`,
  "---",
  "@`loop`",
);

const THETAS: readonly PlantedThetaFile[] = [
  { stem: CALLEE_STEM, text: CALLEE },
  { stem: CALLER_STEM, text: CALLER },
];

let outcome: LoadOutcome;
let workspaceDir: string;

beforeAll(async () => {
  workspaceDir = plantThetaWorkspace(
    "theta-b0487-",
    THETAS,
    JSON.stringify({ theta: { binderModel: "test/binder" } }),
  );
  outcome = await runProductionLoad(workspaceDir, { availableModels: AVAILABLE_MODELS });
});

afterAll(() => {
  disposeWorkspace(workspaceDir);
});

describe("bug 0487 (1)+(3) — theta_progress in a callee's tools: is not a load-time unknown-tool", () => {
  const { linesFor, linesForCode } = diagnosticLineReaders(() => outcome.diagnosticLines);

  // Precondition: the discovery walk is live and reached BOTH planted thetas.
  // A red below is then a resolution red, not an empty-walk red. This asserts
  // the callee produced SOME diagnostic line (pre-fix: the unknown-tool row) so
  // the per-callee channel the absence cells read is carrying data; post-fix the
  // callee is clean and this precondition is instead met by the caller's line
  // set, so it is expressed as "the load produced diagnostic lines at all".
  it("precondition: the discovery walk ran (it produced diagnostic output or registered a fixture)", () => {
    const walkRan =
      outcome.diagnosticLines.length > 0 || outcome.registered.length > 0;
    expect(
      walkRan,
      "the project `.pi/theta/` discovery walk produced neither a diagnostic nor a " +
        "registration — the setup precondition is unmet. " +
        `Registered: ${JSON.stringify(outcome.registered)}; lines: ${JSON.stringify(outcome.diagnosticLines)}`,
    ).toBe(true);
  });

  it("(1) the callee declaring `theta_progress` in tools: emits ZERO theta/load/unknown-tool", () => {
    // Pre-fix: the callee-facing `resolvePiTool` closure returns `undefined` for
    // `theta_progress` (not a host built-in, not in `pi.getAllTools()`), so
    // `resolveEntry` mints `unknown Pi tool 'theta_progress'`. RED here.
    // Post-fix: the in-process name set is threaded into the callable-set deps,
    // so `resolveEntry` accepts it and no unknown-tool is minted.
    const unknownToolLines = linesForCode(CALLEE_STEM, UNKNOWN_TOOL_CODE).filter((line) =>
      line.includes(`'${THETA_PROGRESS_TOOL_NAME}'`),
    );
    expect(
      unknownToolLines,
      `the in-process tool '${THETA_PROGRESS_TOOL_NAME}' declared in the callee's tools: was ` +
        `minted as ${UNKNOWN_TOOL_CODE} at load time; it dispatches at runtime through ` +
        "the in-process executor path and must not be a load-time unknown-tool. " +
        `Callee diagnostic lines: ${JSON.stringify(linesFor(CALLEE_STEM))}`,
    ).toEqual([]);
  });

  it("(1) the callee registers (its only load error was the theta_progress false positive)", () => {
    expect(
      outcome.registered,
      "the callee declaring `theta_progress` did not register — the false unknown-tool " +
        `un-registered it. ${JSON.stringify(outcome.registered)}; lines: ${JSON.stringify(linesFor(CALLEE_STEM))}`,
    ).toContain(CALLEE_STEM);
  });

  it("(3) the caller emits ZERO theta/load/callee-has-errors (no cascade from the callee)", () => {
    // Pre-fix: the callee's false unknown-tool makes it `hasErrors`, so the
    // caller's callee-resolution path (the `stubDeps` closure /
    // `parseCalleeForTools`) cascades `callee-has-errors`. RED here.
    // Post-fix: the callee resolves clean → no cascade.
    const cascadeLines = linesForCode(CALLER_STEM, CALLEE_HAS_ERRORS_CODE);
    expect(
      cascadeLines,
      `the caller cascaded ${CALLEE_HAS_ERRORS_CODE} from the callee's ` +
        `theta_progress false positive; expected message ` +
        `${JSON.stringify(calleeHasErrorsMessage(CALLEE_ENTRY))}. ` +
        `Caller diagnostic lines: ${JSON.stringify(linesFor(CALLER_STEM))}`,
    ).toEqual([]);
  });

  it("(3) the caller registers (no callee-has-errors cascade)", () => {
    expect(
      outcome.registered,
      "the caller did not register — it cascaded the callee's false positive. " +
        `${JSON.stringify(outcome.registered)}; lines: ${JSON.stringify(linesFor(CALLER_STEM))}`,
    ).toContain(CALLER_STEM);
  });
});
