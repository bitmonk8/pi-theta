import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { ThetaFixture } from "../src/extension/factory";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";

// Bug 0142 §Fix (c) — the `collectProvableArgTypes` MIRROR
// (src/extension/invoke-static-checks.ts's `/` arm) at the INVOKE-argument
// sink `theta/parse/invoke-arg-type-mismatch`.
//
// Companion to `division-result-type-number.test.ts`: every cell there settles
// inside one `parseDoc` call, but this sink is judged by
// `checkInvokeStaticResolution` over a callee's STATICALLY-RESOLVED `params:`,
// which only the compose pass reaches. This file therefore copies the
// fixture-load harness SHAPE from `tests/invoke-arg-type-mismatch-wired.test.ts`
// (read, not modified): a planted `.pi/theta/` workspace, the production
// compose helper (`discoverAndComposeFixtures`), and the same two production
// observables — which slash names registered, and which error-severity
// messages reached `ctx.ui.notify` — plus the no-UI stderr mirror, the only
// channel that can attribute this row's callee-less, caller-less *Message* to
// one specific caller.
//
// FINDING F1 (round-1 review of bug 0142). The mirror's `/` arm
// (`invoke-static-checks.ts`) reads `pass.typeOf(expr, env)` instead of
// unioning the operand sets the way the arithmetic arm below it does for `+` /
// `-` / `*` / `%`, so it answers `number` unconditionally — the same
// unconditional answer `#typeBinary`'s own `/` arm gives. Two measured delta
// classes follow at this sink, and this file is what a reverted mirror arm
// cannot red on: before this file, nothing drove a `/` argument through
// `buildInvokeArgSlot` at all.
//
//   (i)  RENDERING. A `/` argument at a `string` param already fired before
//        the mirror (the collected set was `{integer, integer}`, both
//        incompatible with `string`); after the mirror it still fires, on the
//        identical slot, through the identical code — only the interpolated
//        `<actual>` moves `integer` → `number`. Pinned by `divint`, with `-`
//        control `subint` proving the move is keyed to the operator: `-`'s
//        collected set is still the operands' own kinds, so its rendering
//        does not move.
//   (ii) WITHHELD → FIRES. A NON-NUMERIC `/` argument at a param matching the
//        operands' own type moves from silent to firing: pre-mirror,
//        `collectProvableArgTypes("a" / "b")` unions the operand sets to
//        `{literal string, literal string}`, one member of which
//        (`string`) is COMPATIBLE with a `string` param, so
//        `buildInvokeArgSlot`'s `everyMemberIncompatible` test fails and the
//        slot withholds; post-mirror the same expression collects to
//        `[{prim number}]`, which IS incompatible with `string`, so the slot
//        fires. Pinned by `divstr`, with `-` control `substr` proving the same
//        point from the other side: `"a" - "b"` still collects to the
//        operands' own kinds and stays withheld, so the flip is keyed to `/`
//        and not to "a non-numeric operand pair" in general.
//
// Both cells are read on the no-UI stderr mirror's per-caller channel
// (`linesForCode`), never on the coarse `outcome.notifications` list: the
// row's own *Message* names neither the callee nor the caller
// (`docs/spec_topics/diagnostics/code-registry-parse.md:114`), and classes (i)
// and (ii) above render the IDENTICAL string once the mirror is in place —
// `outcome.notifications` alone cannot tell which caller produced it.
//
// NO SILENT SKIPPING (CLAUDE.md). `assertRowSurfaceLive` is the shared
// precondition every absence assertion in this file calls first: without it,
// an absence could pass because the row never fires in this workspace at all,
// which would measure nothing. `beforeAll`'s stem/suffix guard is the wired
// file's own precondition against per-caller channel ambiguity, copied
// unchanged because the hazard it guards is the same one.
//
// TIER — unit, offline, provider-free, deterministic: one load of one planted
// workspace with no model and no provider, the same tier the copied harness
// runs at.

/** The row under test. */
const CODE = "theta/parse/invoke-arg-type-mismatch";

const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)), "utf8"),
) as RegistryRow[];

/**
 * `CODE`'s normative *Message* template, or a throw naming the registry page:
 * a missing row is a harness failure, never a skip, because every expected
 * string below is derived from it.
 */
function registered(): string {
  const template = registryMessage(REGISTRY, CODE) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: ${REGISTRY_PAGE} carries no Message row for ${CODE} — the DIAG-4 column is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}

/**
 * `invoke argument <i> ('<param>') type mismatch: expected <expected>, got <actual>`,
 * interpolated in one pass so an unsupplied or unused placeholder throws
 * rather than silently detaching this file's expectations from the registry
 * row's shape.
 */
function invokeArgMessage(slot: number, paramName: string, expected: string, actual: string): string {
  const subs = new Map([
    ["<i>", String(slot)],
    ["<param>", paramName],
    ["<expected>", expected],
    ["<actual>", actual],
  ]);
  const used = new Set<string>();
  const message = registered().replace(/<[a-z]+>/g, (token) => {
    const value = subs.get(token);
    if (value === undefined) {
      throw new Error(
        `harness: the ${CODE} Message template carries placeholder ${token}, which this file supplies no substitution for — the registry row changed shape (${REGISTRY_PAGE})`,
      );
    }
    used.add(token);
    return value;
  });
  for (const token of subs.keys()) {
    if (!used.has(token)) {
      throw new Error(
        `harness: this file substitutes ${token} into the ${CODE} Message, which no longer carries it — the registry row changed shape (${REGISTRY_PAGE})`,
      );
    }
  }
  return message;
}

// ===========================================================================
// The planted discovery workspace — one callee, four callers.
// ===========================================================================

interface PlantedTheta {
  readonly stem: string;
  readonly text: string;
}

function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}

/** A `mode: subagent` callee declaring one `params: x: string` field. */
function calleeStr(): string {
  return theta("---", "mode: subagent", "params:", "  x: string", "---", "@`hi`");
}

/** A `mode: subagent` caller with no `tools:` — the `invoke(...)` literal surface. */
function invokeCaller(...body: readonly string[]): string {
  return theta("---", "mode: subagent", "---", ...body, "@`hi`");
}

const THETAS: readonly PlantedTheta[] = [
  { stem: "cstr", text: calleeStr() },
  // Class (i): fires both before and after the mirror; only `<actual>` moves.
  { stem: "divint", text: invokeCaller('invoke("./cstr.theta", 3 / 2)?') },
  { stem: "subint", text: invokeCaller('invoke("./cstr.theta", 3 - 2)?') },
  // Class (ii): withheld before the mirror, fires after.
  { stem: "divstr", text: invokeCaller('invoke("./cstr.theta", "a" / "b")?') },
  { stem: "substr", text: invokeCaller('invoke("./cstr.theta", "a" - "b")?') },
];

// ===========================================================================
// The fake host `pi` / `ctx`, and the load outcome — copied SHAPE from
// tests/invoke-arg-type-mismatch-wired.test.ts.
// ===========================================================================

interface LoadOutcome {
  readonly registered: readonly string[];
  readonly notifications: readonly string[];
  readonly diagnosticLines: readonly string[];
}

let outcome: LoadOutcome;
let workspaceDir: string;

async function runProductionLoad(cwd: string): Promise<LoadOutcome> {
  const notifications: string[] = [];
  const chunks: string[] = [];
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;

  const write = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: unknown): boolean => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(
    pi,
    ctx,
  ).finally(() => {
    process.stderr.write = write;
  });

  return {
    registered: fixtures.map((f) => f.slashName),
    notifications,
    diagnosticLines: chunks
      .join("")
      .split(/\r?\n/)
      .filter((line) => line.length > 0),
  };
}

beforeAll(async () => {
  // No stem may be a suffix of another: the per-caller channel filter matches
  // `<separator><stem>.theta`, so a suffix pair would let one caller's
  // diagnostic satisfy or defeat another caller's assertion.
  const stems = THETAS.map((t) => t.stem);
  for (const stem of stems) {
    const shadowed = stems.filter((other) => other !== stem && other.endsWith(stem));
    expect(
      shadowed,
      `harness: planted stem '${stem}' is a suffix of ${JSON.stringify(shadowed)}, so per-caller diagnostic attribution below is ambiguous`,
    ).toEqual([]);
  }

  workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0142-f1-"));
  const projectThetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(projectThetaDir, { recursive: true });
  for (const planted of THETAS) {
    writeFileSync(join(projectThetaDir, `${planted.stem}.theta`), planted.text, "utf8");
  }
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
  outcome = await runProductionLoad(workspaceDir);
});

afterAll(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});

/** Diagnostic lines the load attributed to one planted `.theta`. */
function linesFor(stem: string): readonly string[] {
  const attributed = new RegExp(`[\\\\/]${stem}\\.theta[:\\s]`);
  return outcome.diagnosticLines.filter((line) => attributed.test(line));
}

/** Diagnostic lines attributing `code` to one planted `.theta`. */
function linesForCode(stem: string, code: string): readonly string[] {
  return linesFor(stem).filter((line) => line.includes(code));
}

/**
 * The shared positive control every absence cell below calls first: THIS
 * workspace and THIS load produced `CODE` at least once, on the per-caller
 * channel the absence cells read. Without it an absence assertion could pass
 * because the row never fires in this workspace at all — the defect this
 * companion file exists to measure, so at a reverted mirror this control is
 * what would make the absence cells' own preconditions fail loudly instead of
 * silently agreeing with the reverted arm.
 */
function assertRowSurfaceLive(): void {
  expect(
    linesForCode("divint", CODE).length,
    `unmet precondition: ${CODE} never surfaced for the divint caller (a \`/\` argument at a \`params: x: string\` callee), so this workspace produces no instance of the row and no absence below measures anything. Lines for that caller: ${JSON.stringify(linesFor("divint"))}`,
  ).toBeGreaterThan(0);
}

// ===========================================================================
// Class (i) — the rendering moves; nothing new fires, nothing vanishes.
// ===========================================================================

describe("bug 0142 F1 (i) — a `/` argument's rendering moves `integer` → `number`, keyed to the operator", () => {
  it("divint: `invoke(\"./cstr.theta\", 3 / 2)` at a `string` param fires with `<actual>` = number", () => {
    assertRowSurfaceLive();
    expect(
      linesForCode("divint", CODE).some((line) =>
        line.includes(invokeArgMessage(0, "x", "string", "number")),
      ),
      `${CODE} did not render \`<actual>\` = number for a \`/\` argument at a \`string\` param, so the mirror's \`/\` arm is not read at this sink. Lines for this caller: ${JSON.stringify(linesFor("divint"))}`,
    ).toBe(true);
    expect(
      outcome.registered,
      "the mistyped invoke caller registered; the row is E-severity and must un-register it as every other cell of this code does",
    ).not.toContain("divint");
  });

  it("subint (control): `invoke(\"./cstr.theta\", 3 - 2)` at the same param keeps rendering `<actual>` = integer", () => {
    assertRowSurfaceLive();
    expect(
      linesForCode("subint", CODE).some((line) =>
        line.includes(invokeArgMessage(0, "x", "string", "integer")),
      ),
      `${CODE} did not render \`<actual>\` = integer for a \`-\` argument, so the pair no longer separates the operator rule from the sink. Lines for this caller: ${JSON.stringify(linesFor("subint"))}`,
    ).toBe(true);
    expect(
      outcome.registered,
      "the mistyped invoke caller registered",
    ).not.toContain("subint");
  });
});

// ===========================================================================
// Class (ii) — a non-numeric `/` argument moves from withheld to firing.
// ===========================================================================

describe("bug 0142 F1 (ii) — a non-numeric `/` argument at a param matching the operands' own type moves withheld → fires", () => {
  it("divstr: `invoke(\"./cstr.theta\", \"a\" / \"b\")` at a `string` param now fires", () => {
    assertRowSurfaceLive();
    expect(
      linesForCode("divstr", CODE).some((line) =>
        line.includes(invokeArgMessage(0, "x", "string", "number")),
      ),
      `${CODE} did not fire for a non-numeric \`/\` argument at the param its own operands' type matches: the collected set must have moved from \`{literal string, literal string}\` (one member compatible, so \`buildInvokeArgSlot\` withholds) to \`[prim number]\` (incompatible, so it fires). Lines for this caller: ${JSON.stringify(linesFor("divstr"))}`,
    ).toBe(true);
    expect(
      outcome.registered,
      "the now-mistyped invoke caller registered",
    ).not.toContain("divstr");
  });

  it("substr (control): `invoke(\"./cstr.theta\", \"a\" - \"b\")` at the same param stays withheld", () => {
    assertRowSurfaceLive();
    expect(
      linesForCode("substr", CODE),
      `${CODE} fired on a \`-\` argument whose collected set is still the operands' own \`string\` kind, one member of which is compatible with the \`string\` param — the flip is keyed to \`/\`, not to a non-numeric operand pair. Lines for this caller: ${JSON.stringify(linesFor("substr"))}`,
    ).toEqual([]);
    expect(
      outcome.registered,
      "`buildInvokeArgSlot` deferred this slot to the callee's runtime AJV net, so the caller must still register",
    ).toContain("substr");
  });
});
