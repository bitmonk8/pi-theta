import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runProductionLoad, type LoadOutcome } from "./helpers/production-load-harness";

// Bug 0297 face 2 — the PRODUCTION threading of a present non-scalar
// `bind_model:` into binder-model resolution
// (docs/bugs/0297-bind-context-nonscalar-silently-registers.md).
//
// THE SEAM UNDER TEST. The parser records a present non-scalar `bind_model:` as
// a `bindModelUnresolvable` marker on the parsed frontmatter
// (src/parser/frontmatter.ts); the production compose pass spreads that marker
// into `BinderModelResolutionInput`
// (src/extension/production-composition.ts:1116-1118, the
// `...(input.frontmatter.bindModelUnresolvable === true ? { bindModelUnresolvable:
// true } : {})` term), and `resolveBinderModel` → `resolveChainReference`
// (src/binder/binder-model.ts) then returns null for a present-but-unresolvable
// reference rather than falling back to the `theta.binderModel` setting. Drop
// that three-line spread and the marker never reaches resolution: a non-scalar
// `bind_model:` on a non-bypass theta silently reverts to the settings fallback
// and the offender registers.
//
// WHY THIS CELL EXISTS. The offline witness of face 2 (cell H of
// tests/b0297-bind-context-bind-model-nonscalar.test.ts) hand-builds the
// resolver input from the parsed frontmatter, mirroring the composition's spread
// rather than driving the composition itself. Deleting the production spread
// therefore leaves that offline gate green while production silently regresses.
// This cell drives the REAL `discoverAndComposeFixtures` compose pass over a
// planted on-disk discovery workspace, so the production threading is the thing
// under assertion: the offender un-registers only when the spread carries the
// marker through.
//
// THE PLANTED CONFIGURATION. `ctx.modelRegistry.getAvailable()` returns one
// model with NO `strictCapable` field — the theta 1.0 Pi-SDK-pin shape — so a
// resolved reference takes the strict-capability probe's silent-admit branch
// (bug 0475's amendment: no available model exposes the indicator, so the
// absence is a host-wide constant and no diagnostic is emitted) and the theta
// still registers — that admission is what lets the pre-fix offender REGISTER
// via the settings fallback. `.pi/settings.json` pins `theta.binderModel` to that available model
// (`test/binder`), which is the chain-step-2 fallback the fix must NOT reach for
// a non-scalar `bind_model:`.
//
// Offline, provider-free, deterministic. A missing precondition (the discovery
// walk finding neither planted stem) fails loudly naming itself rather than
// skipping (CLAUDE.md / AGENTS.md: no silent test skipping). docs/STYLE.md binds
// this prose.

// --- Planted discovery workspace -------------------------------------------

interface PlantedTheta {
  readonly stem: string;
  readonly text: string;
}

function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}

// A two-string `params:` block forces a real binder pass (the theta is NOT
// bypass-eligible), so binder-model resolution runs and its verdict gates
// registration. This is the non-bypass shape cell J of the offline witness uses.
const NON_BYPASS_PARAMS: readonly string[] = ["params:", "  a: string", "  b: string"];

const THETAS: readonly PlantedTheta[] = [
  // OFFENDER — a present non-scalar `bind_model:` (a block sequence) on a
  // non-bypass theta. Pre-fix the arm records `undefined` and no marker, so the
  // input carries neither `bindModel` nor `bindModelUnresolvable` and the
  // resolvable `theta.binderModel` settings fallback admits it (RED: registers).
  // Post-fix the `bindModelUnresolvable` marker threads through the production
  // spread → `resolveChainReference` returns null → the binder-model-unresolved
  // refusal (E) → the theta does not register (GREEN). Deleting the production
  // spread reds this cell.
  {
    stem: "binmodelseq",
    text: theta("---", "mode: prompt", "bind_model:", "  - x", ...NON_BYPASS_PARAMS, "---", "@`hi`"),
  },

  // CONTROL — identical EXCEPT a SCALAR `bind_model: test/binder` that resolves
  // against the available model. Proves the harness resolves a well-formed
  // scalar bind_model (registers) rather than rejecting every non-bypass theta.
  {
    stem: "binmodelscalar",
    text: theta(
      "---",
      "mode: prompt",
      "bind_model: test/binder",
      ...NON_BYPASS_PARAMS,
      "---",
      "@`hi`",
    ),
  },

  // PRECONDITION CONTROL — a clean bypass-eligible theta (no `bind_model:`, no
  // `params:`) that must always register, so a red below is a resolution red
  // rather than an empty-walk / setup red.
  { stem: "plainok", text: theta("---", "mode: prompt", "---", "@`hi`") },
];

// --- Fake host `pi` / `ctx` for the load path ------------------------------

let outcome: LoadOutcome;
let workspaceDir: string;

// One available model with NO `strictCapable` field: with the indicator
// exposed on no available model, a resolved reference takes the probe's
// silent-admit branch (bug 0475) and still registers, so the
// settings-fallback path the offender would take pre-fix is an admitting path.
const AVAILABLE_MODELS: readonly unknown[] = [{ provider: "test", id: "binder" }];

beforeAll(async () => {
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-b0297-"));
  const projectThetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(projectThetaDir, { recursive: true });
  for (const l of THETAS) {
    writeFileSync(join(projectThetaDir, `${l.stem}.theta`), l.text, "utf8");
  }
  // `theta.binderModel` is the chain-step-2 settings fallback the fix must NOT
  // reach for a non-scalar `bind_model:`; it resolves against the available
  // model above, so pre-fix the offender rides it into registration.
  writeFileSync(
    join(workspaceDir, ".pi", "settings.json"),
    JSON.stringify({ theta: { binderModel: "test/binder" } }),
    "utf8",
  );
  outcome = await runProductionLoad(workspaceDir, { availableModels: AVAILABLE_MODELS });
});

afterAll(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});

describe("bug 0297 face 2 — non-scalar bind_model: threaded through the production compose pass", () => {
  // Shared precondition guard: the discovery walk is live at all (it registered
  // its always-eligible bypass control), so a registration red below is a
  // binder-model-resolution red, not an empty-walk / setup red. This checks the
  // walk is live, not that either bind_model stem specifically was reached —
  // the scalar-control cell below independently proves the walk reaches a
  // bind_model-bearing fixture, since a non-bypass theta registers only by
  // resolving one.
  it("the .pi/theta/ discovery walk is live (precondition, via the always-registering bypass control)", () => {
    expect(
      outcome.registered,
      "the project `.pi/theta/` discovery walk did not register the clean bypass " +
        "control — the setup precondition is unmet. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("plainok");
  });

  it("a scalar bind_model: that resolves against the available model registers (control)", () => {
    // The harness resolves the model and a well-formed scalar `bind_model:`
    // loads: `test/binder` matches the one available model, takes the
    // strict-capability probe's silent-admit branch (bug 0475), and the
    // non-bypass theta registers.
    expect(
      outcome.registered,
      "the scalar-bind_model control must register, proving the harness resolves " +
        "the model. Registered: " + JSON.stringify(outcome.registered),
    ).toContain("binmodelscalar");
  });

  it("a non-scalar bind_model: on a non-bypass theta does NOT register", () => {
    // Pre-fix the non-scalar `bind_model:` records `undefined` and no marker, so
    // the chain falls back to the resolvable `theta.binderModel` setting and the
    // offender registers. Post-fix the `bindModelUnresolvable` marker threads
    // through the production spread
    // (production-composition.ts:1116-1118) → `resolveChainReference` returns
    // null → `theta/load/binder-model-unresolved` (E) → not registered. Deleting
    // that spread reds this cell.
    expect(
      outcome.registered,
      "the non-scalar bind_model: theta registered: the `bindModelUnresolvable` " +
        "marker did not thread through the production compose spread, so the " +
        "settings fallback (the ABSENT-field behaviour) admitted it. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("binmodelseq");
  });
});
