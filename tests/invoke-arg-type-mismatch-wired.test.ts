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
import type { PrimitiveName } from "../src/parser/type-compat";

// Bug 0137 — the row `theta/parse/invoke-arg-type-mismatch` over the
// `invoke("./callee.theta", …)` LITERAL surface, judged during the load pass.
//
// THE ROW'S OWN *Trigger* (`diagnostics/code-registry-parse.md`) is a condition
// over author source text against a callee the load pass already resolves:
// "`invoke(...)` argument does not type-check against the callee's declared
// `params` schema (when the callee is statically resolvable)". `invocation.md`
// §"Argument binding" states the same obligation normatively, and
// `type-system.md` TYPE-10 names this row among the three sites at which a
// cross-named-schema mismatch is reported at parse time rather than deferred to
// a runtime AJV failure. The emitter `checkInvokeArgTypes` is reached only from
// `checkInvokeCall`, which no production caller invokes: the invoke-literal arm
// of `checkInvokeStaticResolution` resolves the callee, calls `checkInvokeArity`
// alone, and iterates. So every group-(a) cell below registers silently today.
//
// THE ROUTE THIS FILE PINS — the invoke-literal arm calls `checkInvokeCall`
// (arity first, early return when arity fails, then `checkInvokeArgTypes`) over
// the callee shape it already holds, reusing the `.theta`-callable arm's three
// soundness mechanisms unchanged: the expected side from the callee's verbatim
// `params:` type source through `annotationToCompatType`, judged in an EMPTY
// null-prototype `TypeEnv` so a caller-local homonym cannot decide a verdict
// about the callee's contract; the actual side from `collectProvableArgTypes`;
// and emission only where EVERY type the argument can evaluate to is
// `"incompatible"`. Anything else defers to the callee's runtime AJV load
// (`type-system.md` §"Unresolvable operands").
//
// THE TWO PRODUCTION OBSERVABLES, both read off ONE load of ONE planted
// `.pi/theta/` workspace through the production compose helper
// (`discoverAndComposeFixtures`): which slash names registered, and which
// error-severity messages reached `ctx.ui.notify`. A third channel is captured
// because the row's *Message* carries NO callee and no caller name, so the
// notify channel cannot attribute a message to the caller that produced it:
// `makeLoadEmit` mirrors EVERY diagnostic — code, severity-independently, with
// its file — to stderr on a host with no UI, which is the only channel on which
// an ABSENCE can be scoped to one caller. That mirror is also the channel the
// `theta/load/callee-has-errors` WARNING lands on (cell d1), the notify arm
// being error-only.
//
// DIAG-4 (`diagnostics/diagnostic-shape.md`) — every expected message is read
// from the registry's *Message* column through `registryMessage` and
// interpolated, never copied prose. An absent row or a reshaped template throws
// naming the registry page rather than degrading an assertion into a comparison
// against `undefined`.
//
// A3/A4 ARE SILENCE CELLS, deliberately. The bug's §Expected behaviour reads
// "a1–a5 should report", but its §Fix binds the emission to
// `collectProvableArgTypes`, whose `array` arm and `ident` arm both return
// `undefined` — an array literal proves nothing a `subsetKinds`-style kind
// comparison can use, and an identifier types as a nominal reference because
// both consumers read types with an empty bindings map. Under the §Fix
// constraint "reuse the sibling arm's three mechanisms verbatim", a3's array
// literal and a4's `ident` therefore DEFER, and `type-system.md`
// §"Unresolvable operands" is the rule they defer under. Widening the static
// read to reach them is refused by §Non-goals, so they are pinned as SILENT.
//
// EXPECTED COLOUR. Every presence cell (a1, a2, a5, a7, the four
// non-`string`-primitive cells, u1, u2) is RED until the arm is wired: the code
// is constructed nowhere, so each expects one message and gets none, and each
// mistyped caller registers. Every absence cell is RED too, because each one
// first calls `assertRowSurfaceLive` — the shared positive control asserting
// that THIS workspace and THIS load produced the row at least once — so no
// absence assertion can pass while the row is unreachable and nothing is being
// measured. The registry cells (A), the workspace control (p0) and the
// already-wired surfaces (b1, b2, b3, c1, c2) are GREEN and must stay so. c3 is
// GREEN in both halves today — its arity half really fires, its absence half
// only because the row fires nowhere — and becomes the arity-before-type guard
// the moment the row can fire at all.

// ===========================================================================
// DIAG-4 — registry-sourced *Message* templates.
// ===========================================================================

/** The row under test. */
const CODE = "theta/parse/invoke-arg-type-mismatch";
/** The `.theta`-callable sibling row (cells b1, b3). */
const TOOL_ARG_CODE = "theta/parse/tool-arg-type-mismatch";
/** The same-file `fn` sibling row (cell b2). */
const FN_ARG_CODE = "theta/parse/fn-arg-type-mismatch";
/** The arity rows that share this surface and run before it (cells c1–c3). */
const ARITY_TOO_FEW_CODE = "theta/parse/invoke-arity-too-few";
const ARITY_TOO_MANY_CODE = "theta/parse/invoke-arity-too-many";
/** The unresolvable-callee deferral row (cell d1). */
const CALLEE_HAS_ERRORS_CODE = "theta/load/callee-has-errors";

/** The registry pages carrying this file's rows — the DIAG-4 oracle. */
const REGISTRY_PAGES = [
  "docs/spec_topics/diagnostics/code-registry-parse.md",
  "docs/spec_topics/diagnostics/code-registry-load.md",
] as const;

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  REGISTRY_PAGES.map((page) =>
    readFileSync(fileURLToPath(new URL(`../${page}`, import.meta.url)), "utf8"),
  ).join("\n"),
) as RegistryRow[];

/**
 * A registered code's normative *Message* template, or a throw naming the
 * registry pages: a missing row is a harness failure, never a skip, because
 * every expected string below is derived from it.
 */
function registered(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: no *Message* row for ${code} in ${REGISTRY_PAGES.join(" / ")} — ` +
        "the DIAG-4 column is this file's only source for the expected strings",
    );
  }
  return template;
}

/**
 * Interpolate a template's `<…>` placeholders in ONE pass, so a substituted
 * value is never re-scanned — `<actual>` legitimately expands to text carrying
 * angle brackets (`array<string>`) and to a `" | "` union. The placeholder set
 * is derived from the TEMPLATE: an unsupplied placeholder and an unused
 * substitution both throw, so a reshaped registry row fails loudly here instead
 * of producing a string no emission can equal.
 */
function fill(code: string, subs: ReadonlyMap<string, string>): string {
  const used = new Set<string>();
  const message = registered(code).replace(/<[a-z]+>/g, (token) => {
    const value = subs.get(token);
    if (value === undefined) {
      throw new Error(
        `harness: the ${code} *Message* carries ${token}, which this file supplies ` +
          "no substitution for — the registry row changed shape",
      );
    }
    used.add(token);
    return value;
  });
  for (const token of subs.keys()) {
    if (!used.has(token)) {
      throw new Error(
        `harness: this file substitutes ${token} into the ${code} *Message*, which no ` +
          "longer carries it — the registry row changed shape",
      );
    }
  }
  return message;
}

/**
 * `invoke argument <i> ('<param>') type mismatch: expected <expected>, got <actual>`.
 *
 * `<i>` is the PARAM SLOT index, not the raw `invoke` argument index: the path
 * literal occupies `args[0]`, so slot `i` binds `args[i + 1]` and the first real
 * argument reports `0` (`invoke-diagnostics.ts` documents `<i>` as the 0-based
 * positional argument index, and `checkInvokeArgTypes` derives it from the slot
 * array's own index). `<param>` is the callee's `params:` field name.
 */
function invokeArgMessage(
  slot: number,
  paramName: string,
  expected: string,
  actual: string,
): string {
  return fill(
    CODE,
    new Map([
      ["<i>", String(slot)],
      ["<param>", paramName],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `tool '<name>' argument type mismatch: expected <expected>, got <actual>`. */
function toolArgMessage(name: string, expected: string, actual: string): string {
  return fill(
    TOOL_ARG_CODE,
    new Map([
      ["<name>", name],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `fn '<name>' argument <i> ('<param>') type mismatch: expected <expected>, got <actual>`. */
function fnArgMessage(
  name: string,
  slot: number,
  paramName: string,
  expected: string,
  actual: string,
): string {
  return fill(
    FN_ARG_CODE,
    new Map([
      ["<name>", name],
      ["<i>", String(slot)],
      ["<param>", paramName],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `invoke '<callee>' passes too few arguments: expected <required> non-defaulted, got <provided>`. */
function tooFew(callee: string, required: number, provided: number): string {
  return fill(
    ARITY_TOO_FEW_CODE,
    new Map([
      ["<callee>", callee],
      ["<required>", String(required)],
      ["<provided>", String(provided)],
    ]),
  );
}

/** `invoke '<callee>' passes too many arguments: expected at most <max>, got <provided>`. */
function tooMany(callee: string, max: number, provided: number): string {
  return fill(
    ARITY_TOO_MANY_CODE,
    new Map([
      ["<callee>", callee],
      ["<max>", String(max)],
      ["<provided>", String(provided)],
    ]),
  );
}

/** `callee '<path>' has errors; see related diagnostics`. */
function calleeHasErrorsMessage(path: string): string {
  return fill(CALLEE_HAS_ERRORS_CODE, new Map([["<path>", path]]));
}

// ===========================================================================
// The planted discovery workspace.
// ===========================================================================

interface PlantedTheta {
  readonly stem: string;
  readonly text: string;
}

function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}

/**
 * A `mode: subagent` callee declaring one `params:` field named `x`.
 *
 * A non-`string` param type makes the callee non-bypass-eligible
 * (`classifyBinderBypass`), so against this workspace's model-less registry it
 * draws `theta/load/binder-model-unresolved` and does not register — visible as
 * that message in a failure payload, and inert here: a callee's own
 * registration is not this row's subject, and cell b3 witnesses that such a
 * callee's `params:` still reach a call-site type check.
 */
function callee(paramType: string): string {
  return theta("---", "mode: subagent", "params:", `  x: ${paramType}`, "---", "@`hi`");
}

/** A `mode: subagent` caller with no `tools:` — the `invoke(...)` literal surface. */
function invokeCaller(...body: readonly string[]): string {
  return theta("---", "mode: subagent", "---", ...body, "@`hi`");
}

/** A `mode: subagent` caller resolving one `.theta` entry — the callable surface. */
function callableCaller(entry: string, ...body: readonly string[]): string {
  return theta("---", "mode: subagent", "tools:", `  - ${entry}`, "---", ...body, "@`hi`");
}

/**
 * One callee stem per `PrimitiveName`, so a primitive added to that union is a
 * COMPILE error here rather than a silently unexercised param type: the cells
 * below enumerate this record's keys instead of restating the list. The
 * `string` key maps onto group (a)'s callee, which already carries the
 * `string`-param direction; the other four drive the reverse direction (a
 * `string` argument at that param type).
 */
const PRIMITIVE_PARAM_CALLEE: Record<PrimitiveName, string> = {
  string: "ca",
  number: "cnum",
  integer: "cint",
  boolean: "cbool",
  null: "cnullp",
};

/** The `[primitive, callee stem, caller stem]` rows of the reverse-direction cells. */
const PRIMITIVE_CELLS: readonly {
  readonly primitive: PrimitiveName;
  readonly calleeStem: string;
  readonly callerStem: string;
}[] = (Object.entries(PRIMITIVE_PARAM_CALLEE) as [PrimitiveName, string][])
  .filter(([primitive]) => primitive !== "string")
  .map(([primitive, calleeStem]) => ({
    primitive,
    calleeStem,
    callerStem: `p${primitive}`,
  }));

const THETAS: readonly PlantedTheta[] = [
  // --- callees -------------------------------------------------------------
  // One callee per caller: the row's *Message* names neither the callee nor the
  // caller, so a callee shared between two cells would make a per-cell verdict
  // unattributable on the message channel.
  { stem: "ca", text: callee("string") },
  { stem: "cb", text: callee("string") },
  { stem: "cc", text: callee("string") },
  { stem: "cd", text: callee("string") },
  { stem: "ce", text: callee("string") },
  { stem: "cf", text: callee("string") },
  { stem: "cg", text: callee("string") },
  { stem: "ch", text: callee("string") },
  { stem: "ci", text: callee("string") },
  { stem: "cj", text: callee("string") },
  { stem: "cunion", text: callee("string") },
  { stem: "cdedup", text: callee("string") },
  { stem: "cmixed", text: callee("string") },
  { stem: "cnarrow", text: callee("integer") },
  { stem: "cwiden", text: callee("number") },
  { stem: "cnullcallable", text: callee("null") },
  ...PRIMITIVE_CELLS.map(({ primitive, calleeStem }) => ({
    stem: calleeStem,
    text: callee(primitive),
  })),
  // Two required `string` params, so an in-range 2-argument call reaches the
  // per-slot loop and slot 1 can be judged (cell a7).
  {
    stem: "ctwo",
    text: theta(
      "---",
      "mode: subagent",
      "params:",
      "  x: string",
      "  y: string",
      "---",
      "@`hi`",
    ),
  },

  // --- group (a): the reported shape, and its two withheld neighbours -------
  { stem: "a1inv", text: invokeCaller('invoke("./ca.theta", 1)?') },
  { stem: "a2inv", text: invokeCaller('invoke("./cb.theta", true)?') },
  { stem: "a3arr", text: invokeCaller('invoke("./cc.theta", ["a"])?') },
  {
    stem: "a4ident",
    text: invokeCaller("let n: integer = 1", 'invoke("./cd.theta", n)?'),
  },
  // The `par for` body reaches the pass through the same arm list as a
  // top-level statement, so the rule holds one AST level deeper.
  { stem: "a5par", text: invokeCaller('par for a in ["a"] { invoke("./cj.theta", 1) }') },
  { stem: "a6ok", text: invokeCaller('invoke("./ce.theta", "a")?') },
  // Slot 1 with slot 0 well-typed: the only cell that can distinguish the param
  // SLOT index from the raw argument index, and the only one whose `<param>`
  // is not the first declared field.
  { stem: "a7slot1", text: invokeCaller('invoke("./ctwo.theta", "a", 1)?') },

  // --- the reverse direction, one cell per non-`string` primitive -----------
  ...PRIMITIVE_CELLS.map(({ calleeStem, callerStem }) => ({
    stem: callerStem,
    text: invokeCaller(`invoke("./${calleeStem}.theta", "a")?`),
  })),

  // --- multi-arm collected sets --------------------------------------------
  // Every arm incompatible and the arms rendering differently: the `<actual>`
  // union spelling.
  { stem: "uunion", text: invokeCaller('invoke("./cunion.theta", true ? 1 : false)?') },
  // Every arm incompatible and the arms rendering alike: deduplication.
  { stem: "udedup", text: invokeCaller('invoke("./cdedup.theta", true ? 1 : 2)?') },
  // One compatible arm: the set is not every-arm-incompatible, so it defers.
  { stem: "umixed", text: invokeCaller('invoke("./cmixed.theta", true ? 1 : "a")?') },

  // --- the two `Compatibility` outcomes that are not `"incompatible"` -------
  { stem: "unarrow", text: invokeCaller('invoke("./cnarrow.theta", 1.5)?') },
  { stem: "uwiden", text: invokeCaller('invoke("./cwiden.theta", 1)?') },

  // --- arity, and the order between the two checks --------------------------
  { stem: "c1many", text: invokeCaller('invoke("./cf.theta", "a", "b")?') },
  { stem: "c2few", text: invokeCaller('invoke("./cg.theta")?') },
  { stem: "c3both", text: invokeCaller('invoke("./ch.theta", 1, 2)?') },

  // --- the spec'd deferral --------------------------------------------------
  { stem: "d1none", text: invokeCaller('invoke("./nosuch.theta", 1)?') },

  // --- the two wired sibling surfaces, plus the callee-resolution control ---
  { stem: "b1tool", text: callableCaller("./ci.theta", "ci(1)?") },
  {
    stem: "b2fn",
    text: invokeCaller("fn g(x: string): string { x }", "let q = g(1)"),
  },
  {
    stem: "b3tool",
    text: callableCaller("./cnullcallable.theta", 'cnullcallable("a")?'),
  },
];

// ===========================================================================
// The fake host `pi` / `ctx`, and the three channels one load surfaces on.
// ===========================================================================

interface LoadOutcome {
  /** Slash names the production compose helper returned (returned fixtures). */
  readonly registered: readonly string[];
  /** Error-severity messages surfaced through `ctx.ui.notify`. */
  readonly notifications: readonly string[];
  /**
   * `makeLoadEmit`'s no-UI stderr mirror, one entry per rendered line:
   * `theta: <file>:<line>:<col>: <code>: <message>`. The only channel carrying
   * the emitting file, which is what makes a per-caller ABSENCE assertion sound
   * for a row whose *Message* names no callee — and the only channel a WARNING
   * reaches at all, the notify arm being error-only.
   */
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

  // The stderr mirror is a real production channel (a `-p` / CI operator's only
  // sight of a load diagnostic), and interposing on it is the only way to read
  // it: it is written directly, not through an injectable seam. The window is
  // one awaited call and the handle is restored on both outcomes, so no
  // assertion below runs while the interposition is live.
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
      `harness: planted stem '${stem}' is a suffix of ${JSON.stringify(shadowed)}, so ` +
        "per-caller diagnostic attribution below is ambiguous",
    ).toEqual([]);
  }

  workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0137-"));
  const projectThetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(projectThetaDir, { recursive: true });
  for (const planted of THETAS) {
    writeFileSync(join(projectThetaDir, `${planted.stem}.theta`), planted.text, "utf8");
  }
  // A minimal valid settings file pins the fixture's settings read to a known
  // value. An ABSENT settings file is silent (package-and-settings.md
  // §Failure modes), so the plant is hermeticity, not noise suppression.
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
 * The shared positive control for every absence cell: THIS workspace and THIS
 * load produced the row at least once, on both channels an absence is read on.
 * Without it an absence assertion passes while the row is unreachable and
 * nothing is being measured — which is the defect itself, so at this HEAD the
 * control is what makes every absence cell red.
 */
function assertRowSurfaceLive(): void {
  expect(
    outcome.notifications,
    `unmet precondition: ${CODE} never surfaced for the a1 caller ` +
      "(`invoke(\"./ca.theta\", 1)` at a `params: x: string` callee), so this " +
      "workspace produces no instance of the row and no ABSENCE below measures " +
      "anything. Notified: " + JSON.stringify(outcome.notifications),
  ).toContain(invokeArgMessage(0, "x", "string", "integer"));
  expect(
    linesForCode("a1inv", CODE).length,
    `unmet precondition: no diagnostic line attributes ${CODE} to the a1 caller, so ` +
      "the per-caller channel every absence cell below reads is not carrying the " +
      "row and cannot witness its absence for one caller. Lines for that caller: " +
      JSON.stringify(linesFor("a1inv")),
  ).toBeGreaterThan(0);
}

/**
 * A callee's declared param type must be declarable before a cell over it means
 * anything: a `params:` RHS the grammar refuses draws its own `theta/parse/*`
 * row, which would un-register the callee's caller for an unrelated reason.
 */
function assertParamTypeDeclarable(calleeStem: string, paramType: string): void {
  expect(
    linesFor(calleeStem).filter((line) => line.includes("theta/parse/")),
    `unmet precondition: the callee declaring \`params: x: ${paramType}\` drew a ` +
      "parse diagnostic, so this param type is not declarable and the cell over it " +
      "is measuring a rejected declaration rather than an argument mismatch",
  ).toEqual([]);
}

// ===========================================================================
// Cell A — DIAG-4 sourcing. Every row this file asserts is registered and
// carries the placeholders the expected strings interpolate, so a registry edit
// reds here rather than silently detaching the assertions from the registry.
// ===========================================================================
describe("bug 0137 cell A — the rows are registered with the placeholders this file fills", () => {
  it("A1: theta/parse/invoke-arg-type-mismatch is registered at error severity, phase type", () => {
    const row = REGISTRY.find((r) => r.code === CODE);
    expect(row, `${CODE} has no registry row — the row under test is unregistered`)
      .toBeDefined();
    expect(row?.severity, `${CODE} is no longer an E-severity row`).toBe("E");
    expect(row?.phase, `${CODE} is no longer a type-phase row`).toBe("type");
  });

  it("A2: its Message carries <i>, <param>, <expected> and <actual>", () => {
    const message = registered(CODE);
    for (const placeholder of ["<i>", "<param>", "<expected>", "<actual>"]) {
      expect(message, `${CODE}: Message template lost ${placeholder}`).toContain(
        placeholder,
      );
    }
  });

  it("A3: the sibling and arity rows the cross-surface cells anchor on are registered", () => {
    for (const code of [
      TOOL_ARG_CODE,
      FN_ARG_CODE,
      ARITY_TOO_FEW_CODE,
      ARITY_TOO_MANY_CODE,
      CALLEE_HAS_ERRORS_CODE,
    ]) {
      expect(
        registryMessage(REGISTRY, code),
        `${code} has no registry row — a cell below anchors on its Message`,
      ).toBeTypeOf("string");
    }
  });

  it("A4: every PrimitiveName has a planted callee, and the non-string set is non-empty", () => {
    expect(
      PRIMITIVE_CELLS.length,
      "the enumeration of `PrimitiveName` collapsed, so the reverse-direction cells " +
        "cover fewer param types than the type declares: " +
        JSON.stringify(PRIMITIVE_CELLS.map((cell) => cell.primitive)),
    ).toBeGreaterThan(0);
    for (const cell of PRIMITIVE_CELLS) {
      expect(
        THETAS.map((t) => t.stem),
        `no callee was planted for the ${cell.primitive} param type`,
      ).toContain(cell.calleeStem);
    }
  });
});

// ===========================================================================
// Cell p0 — the workspace-level control, deliberately UNGUARDED so it stays
// green while the row is unreachable: it separates "the row never fires" from
// "the workspace never loaded". `a6ok` registering witnesses the discovery walk;
// c1's arity message witnesses that the invoke-literal arm resolves a callee's
// `params:` at this exact site, which is the resolution a type check consumes.
// ===========================================================================
describe("bug 0137 cell p0 — the planted workspace loaded and the invoke arm resolves its callees", () => {
  it("p0: the well-typed control caller registered", () => {
    expect(
      outcome.registered,
      "the project `.pi/theta/` walk registered no well-typed control caller, so every " +
        "cell in this file is reading a broken workspace. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("a6ok");
  });

  it("p0: the invoke-literal arm already resolves the callee `params:` it would type-check", () => {
    expect(
      outcome.notifications,
      "the invoke-literal arity check did not fire, so the callee resolution a " +
        "per-argument type check consumes is not reaching this site and no cell below " +
        "can distinguish a missing check from a missing callee. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(tooMany("./cf.theta", 1, 2));
  });
});

// ===========================================================================
// Cells a1, a2, a5, a7 — the reported shape. Each draws the registered row and
// `hasLoadParseError` denies registration, matching what the two sibling
// surfaces already do (cells b1, b2).
// ===========================================================================
describe("bug 0137 cells a1, a2, a5, a7 — a mistyped `invoke(...)` argument draws the row and un-registers its caller", () => {
  it("a1: an integer literal at a `string` param reports `expected string, got integer`", () => {
    expect(
      outcome.notifications,
      `${CODE} did not surface for \`invoke("./ca.theta", 1)\` at a \`params: x: string\` ` +
        "callee, so a declared param type is unenforced at the position " +
        "invocation.md §\"Argument binding\" assigns it. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(invokeArgMessage(0, "x", "string", "integer"));
  });

  it("a1: the mistyped caller does not register", () => {
    expect(
      outcome.registered,
      "the mistyped caller registered: the row is E-severity, so `hasLoadParseError` " +
        "must deny registration exactly as it does for the two sibling call forms. " +
        "Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("a1inv");
  });

  it("a2: a boolean literal at a `string` param reports `expected string, got boolean`", () => {
    expect(
      outcome.notifications,
      `${CODE} did not surface for a boolean literal argument at a \`string\` param. ` +
        "Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(invokeArgMessage(0, "x", "string", "boolean"));
  });

  it("a2: the mistyped caller does not register", () => {
    expect(
      outcome.registered,
      "the boolean-argument caller registered. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("a2inv");
  });

  it("a5: the same mistype inside a `par for` body reports the row", () => {
    expect(
      linesForCode("a5par", CODE).length,
      "the shared call-site walk did not carry the type check into the `par for` body, " +
        "so an argument mistyped one AST level deeper is admitted. Lines for this " +
        "caller: " + JSON.stringify(linesFor("a5par")),
    ).toBeGreaterThan(0);
    expect(
      outcome.notifications,
      `${CODE} did not surface for the \`par for\`-body call. Notified: ` +
        JSON.stringify(outcome.notifications),
    ).toContain(invokeArgMessage(0, "x", "string", "integer"));
  });

  it("a5: the `par for`-body caller does not register", () => {
    expect(
      outcome.registered,
      "the caller whose `par for` body carries the mistyped call registered. " +
        "Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("a5par");
  });

  it("a7: `<i>` counts param slots and `<param>` names the callee's own field", () => {
    expect(
      outcome.notifications,
      "the second param slot's mismatch did not surface as `argument 1 ('y')`: `<i>` " +
        "must be the param slot index (slot `i` binds `args[i + 1]`, the path literal " +
        "occupying `args[0]`) and `<param>` the callee's `params:` field name at that " +
        "slot. Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(invokeArgMessage(1, "y", "string", "integer"));
  });

  it("a7: the caller whose second argument is mistyped does not register", () => {
    expect(
      outcome.registered,
      "the caller mistyping only its second argument registered. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("a7slot1");
  });
});

// ===========================================================================
// The reverse direction, one cell per `PrimitiveName` other than `string`: a
// `string` argument at that param type. Enumerated from `PRIMITIVE_PARAM_CALLEE`
// (typed `Record<PrimitiveName, …>`), so a primitive added to the union reaches
// these cells by compile error rather than by omission.
// ===========================================================================
describe("bug 0137 primitive cells — a `string` argument is refused at every non-`string` param type", () => {
  for (const { primitive, calleeStem, callerStem } of PRIMITIVE_CELLS) {
    it(`p-${primitive}: a string argument at a \`${primitive}\` param reports \`expected ${primitive}, got string\``, () => {
      assertParamTypeDeclarable(calleeStem, primitive);
      expect(
        outcome.notifications,
        `${CODE} did not surface for a string argument at a \`params: x: ${primitive}\` ` +
          "callee. Notified: " + JSON.stringify(outcome.notifications),
      ).toContain(invokeArgMessage(0, "x", primitive, "string"));
    });

    it(`p-${primitive}: the caller mistyping a \`${primitive}\` param does not register`, () => {
      assertParamTypeDeclarable(calleeStem, primitive);
      expect(
        outcome.registered,
        `the caller passing a string to a \`${primitive}\` param registered. Registered: ` +
          JSON.stringify(outcome.registered),
      ).not.toContain(callerStem);
    });
  }
});

// ===========================================================================
// Cells u1, u2 — a multi-arm collected set. `<actual>` renders the collected
// members through `displayType`, deduplicated, joined `" | "` — the same
// spelling `renderCollectedTypes` produces on the wired sibling arm, so the two
// surfaces cannot diverge on how one argument's type set reads.
// ===========================================================================
describe("bug 0137 cells u1, u2 — an all-incompatible multi-arm set reports its union, deduplicated", () => {
  it("u1: two differently-rendering incompatible arms report `integer | boolean`", () => {
    expect(
      outcome.notifications,
      "the every-arm-incompatible ternary did not surface the row with a union " +
        "`<actual>`: both arms are incompatible with the `string` param, so the set is " +
        "provable and the whole set is what the author wrote. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(invokeArgMessage(0, "x", "string", "integer | boolean"));
  });

  it("u1: the caller does not register", () => {
    expect(
      outcome.registered,
      "the every-arm-incompatible ternary caller registered. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("uunion");
  });

  it("u2: two alike-rendering incompatible arms report `integer`, not `integer | integer`", () => {
    expect(
      outcome.notifications,
      "a composite whose arms render alike must read exactly as one arm does. " +
        "Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(invokeArgMessage(0, "x", "string", "integer"));
    expect(
      outcome.notifications.filter((n) => n.includes("integer | integer")),
      "the collected set was rendered without deduplication",
    ).toEqual([]);
  });

  it("u2: the caller does not register", () => {
    expect(
      outcome.registered,
      "the alike-arm ternary caller registered. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("udedup");
  });
});

// ===========================================================================
// Cells a3, a4 — the two argument shapes `collectProvableArgTypes` WITHHOLDS.
// Its `array` arm returns `undefined` because an array renders as `array<…>`,
// which no kind-set comparison admits; its `ident` arm returns `undefined`
// because both consumers read types with an empty bindings map, so even a
// `let`-bound name is a nominal reference. `type-system.md` §"Unresolvable
// operands" is the rule these defer under, and the callee's runtime AJV load is
// the net. Both cells are read on the per-caller channel: a4's would-be message
// is byte-identical to a1's, the row's *Message* naming no callee.
// ===========================================================================
describe("bug 0137 cells a3, a4 — an argument past the parser's static view defers, silently", () => {
  it("a3: an array literal at a `string` param draws no diagnostic and the caller registers", () => {
    assertRowSurfaceLive();
    expect(
      linesForCode("a3arr", CODE),
      `${CODE} fired on an array-literal argument, whose value-type set ` +
        "`collectProvableArgTypes` withholds: an emission there is a static read the " +
        "sibling arm does not make. Lines for this caller: " +
        JSON.stringify(linesFor("a3arr")),
    ).toEqual([]);
    expect(
      outcome.notifications.filter((n) =>
        n.startsWith(invokeArgMessage(0, "x", "string", "array")),
      ),
      "an `array<…>` `<actual>` reached the notify channel, so the array arm's " +
        "deferral was replaced by a judgement",
    ).toEqual([]);
    expect(
      outcome.registered,
      "the array-literal caller must keep registering: the deferral is to the callee's " +
        "runtime AJV load, not to a load-time refusal. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("a3arr");
  });

  it("a4: a typed `let` read at a `string` param draws no diagnostic and the caller registers", () => {
    assertRowSurfaceLive();
    expect(
      linesForCode("a4ident", CODE),
      `${CODE} fired on an identifier argument, which types as a nominal reference ` +
        "under the empty bindings map both consumers read with: judging it needs a " +
        "static read the sibling arm does not make. Lines for this caller: " +
        JSON.stringify(linesFor("a4ident")),
    ).toEqual([]);
    expect(
      outcome.registered,
      "the typed-`let` caller must keep registering. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("a4ident");
  });
});

// ===========================================================================
// Cells a6, u3, n1, w1 — the four silent verdicts that are not withheld reads.
// a6 is compatible outright; u3's set has one compatible arm, so it is not
// every-arm-incompatible; n1 is `"integer-narrowing"`, which is a mismatch but
// not `"incompatible"`, so the every-arm test does not admit it; w1 is TYPE-2's
// one-way `integer ⊑ number` widening.
// ===========================================================================
describe("bug 0137 cells a6, u3, n1, w1 — a compatible, mixed, narrowing or widening argument stays silent", () => {
  it("a6: a well-typed argument draws nothing and the caller registers", () => {
    assertRowSurfaceLive();
    expect(
      linesForCode("a6ok", CODE),
      `${CODE} fired on a \`string\` argument at a \`string\` param, so the check ` +
        "rejects well-typed programs. Lines for this caller: " +
        JSON.stringify(linesFor("a6ok")),
    ).toEqual([]);
    expect(
      outcome.registered,
      "the well-typed caller must register. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("a6ok");
  });

  it("u3: a ternary with one compatible arm defers", () => {
    assertRowSurfaceLive();
    expect(
      linesForCode("umixed", CODE),
      `${CODE} fired on a set with a compatible arm: a runtime value the \`params:\` ` +
        "field accepts is reachable, so the site defers to the runtime AJV net. Lines " +
        "for this caller: " + JSON.stringify(linesFor("umixed")),
    ).toEqual([]);
    expect(
      outcome.notifications,
      "the mixed-arm set was judged and rendered as a union",
    ).not.toContain(invokeArgMessage(0, "x", "string", "integer | string"));
    expect(
      outcome.registered,
      "the mixed-arm caller must register. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("umixed");
  });

  it("n1: a `number` literal at an `integer` param defers", () => {
    assertRowSurfaceLive();
    expect(
      linesForCode("unarrow", CODE),
      `${CODE} fired on a \`"integer-narrowing"\` verdict, which the every-arm test ` +
        "admits only for `\"incompatible\"`. Lines for this caller: " +
        JSON.stringify(linesFor("unarrow")),
    ).toEqual([]);
    expect(
      outcome.notifications,
      "a narrowing verdict was reported through this row",
    ).not.toContain(invokeArgMessage(0, "x", "integer", "number"));
    expect(
      outcome.registered,
      "the narrowing caller must register. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("unarrow");
  });

  it("w1: an integer literal at a `number` param is compatible and stays silent", () => {
    assertRowSurfaceLive();
    expect(
      linesForCode("uwiden", CODE),
      `${CODE} fired on TYPE-2's \`integer ⊑ number\` widening, which holds. Lines for ` +
        "this caller: " + JSON.stringify(linesFor("uwiden")),
    ).toEqual([]);
    expect(
      outcome.notifications,
      "the one-way widening was reported as a mismatch",
    ).not.toContain(invokeArgMessage(0, "x", "number", "integer"));
    expect(
      outcome.registered,
      "the widening caller must register. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("uwiden");
  });
});

// ===========================================================================
// Cell d1 — the deferral `invocation.md` §"Static resolution" specifies: an
// unresolvable literal callee is a WARNING, the parent registers, and static
// checks against that callee are skipped. Measured channel: the warning reaches
// only the no-UI stderr mirror, `makeLoadEmit`'s notify arm being error-only, so
// the notify assertion pins that the disposition stays a warning rather than
// becoming an error.
// ===========================================================================
describe("bug 0137 cell d1 — an unresolvable callee stays a warning and skips the type check", () => {
  it("d1: the caller registers and draws no argument-type diagnostic", () => {
    assertRowSurfaceLive();
    expect(
      linesForCode("d1none", CODE),
      `${CODE} fired against a callee the load pass could not resolve, whose declared ` +
        "`params:` are therefore unknown. Lines for this caller: " +
        JSON.stringify(linesFor("d1none")),
    ).toEqual([]);
    expect(
      outcome.registered,
      "the caller invoking an unresolvable callee must still register. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("d1none");
  });

  it("d1: theta/load/callee-has-errors surfaces as a warning on the stderr mirror only", () => {
    assertRowSurfaceLive();
    expect(
      linesForCode("d1none", CALLEE_HAS_ERRORS_CODE).length,
      `${CALLEE_HAS_ERRORS_CODE} did not surface for the unresolvable callee, so the ` +
        "deferral is silent rather than reported. Lines for this caller: " +
        JSON.stringify(linesFor("d1none")),
    ).toBeGreaterThan(0);
    expect(
      outcome.notifications,
      "the unresolvable-callee report reached the error-severity notify channel, so the " +
        "per-surface severity split (warning for an `invoke(...)` literal) was lost",
    ).not.toContain(calleeHasErrorsMessage("./nosuch.theta"));
  });
});

// ===========================================================================
// Cells c1-c3 — arity is checked BEFORE per-argument type (`invocation.md`
// §"Argument arity"). c3 carries both defects and must report arity alone; it is
// the end-to-end replacement for the in-tree unit assertion of that order
// against a hand-built `checkInvokeCall` input, which asserts the ordering
// without any source text reaching it.
// ===========================================================================
describe("bug 0137 cells c1-c3 — arity is reported before, and instead of, a per-argument type", () => {
  it("c1: too many well-typed arguments report arity alone", () => {
    expect(
      outcome.notifications,
      "the invoke-literal too-many arity report regressed. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(tooMany("./cf.theta", 1, 2));
    expect(
      linesForCode("c1many", CODE),
      "an argument-type diagnostic was derived from a site the arity check already " +
        "rejected, so the author gets two reports for one fault. Lines for this " +
        "caller: " + JSON.stringify(linesFor("c1many")),
    ).toEqual([]);
    expect(
      outcome.registered,
      "the too-many caller registered. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("c1many");
  });

  it("c2: too few arguments report arity alone", () => {
    expect(
      outcome.notifications,
      "the invoke-literal too-few arity report regressed. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(tooFew("./cg.theta", 1, 0));
    expect(
      linesForCode("c2few", CODE),
      "an argument-type diagnostic was derived from a site with no argument to judge. " +
        "Lines for this caller: " + JSON.stringify(linesFor("c2few")),
    ).toEqual([]);
  });

  it("c3: a site that is both over-arity and mistyped reports arity alone", () => {
    expect(
      outcome.notifications,
      "the arity report for the both-defects site regressed. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(tooMany("./ch.theta", 1, 2));
    expect(
      linesForCode("c3both", CODE),
      "the per-argument type check ran on a site the arity check rejected: the gate is " +
        "the arity diagnostics being empty, not an ordering convention, and " +
        "invocation.md §\"Argument arity\" requires the arity error to be the one " +
        "reported. Lines for this caller: " + JSON.stringify(linesFor("c3both")),
    ).toEqual([]);
    expect(
      outcome.registered,
      "the both-defects caller registered. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("c3both");
  });
});

// ===========================================================================
// Cells b1-b3 — the same mistake through the two sibling call forms, which
// already refuse it. They are the cross-surface parity pins: enforcement of a
// declared `params:` type must not depend on which of three call spellings the
// author chose. b3 additionally establishes the precondition the non-`string`
// primitive cells above need: a callee declaring one non-`string` param is not
// bypass-eligible under `classifyBinderBypass`, so it draws
// `theta/load/binder-model-unresolved` and does not itself register against this
// workspace's model-less registry — and this cell proves its `params:` are
// nonetheless resolved and judged at a call site, `resolveCalleeArity` reading
// the callee file and consulting its PARSE diagnostics alone.
// ===========================================================================
describe("bug 0137 cells b1-b3 — the two sibling call forms refuse the identical mistype", () => {
  it("b1: a `.theta`-callable call reports `tool 'ci' argument type mismatch` and un-registers", () => {
    expect(
      outcome.notifications,
      "the `.theta`-callable argument type check regressed, so this file's parity " +
        "baseline is gone. Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(toolArgMessage("ci", "string", "integer"));
    expect(
      outcome.registered,
      "the `.theta`-callable caller passing an integer to a `string` param registered. " +
        "Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("b1tool");
  });

  it("b2: a same-file `fn` call reports `fn 'g' argument 0 ('x') type mismatch` and un-registers", () => {
    expect(
      outcome.notifications,
      "the same-file `fn` argument type check regressed. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(fnArgMessage("g", 0, "x", "string", "integer"));
    expect(
      outcome.registered,
      "the `fn` caller passing an integer to a `string` param registered. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("b2fn");
  });

  it("b3: a non-`string`-param callee's `params:` are resolved and judged at a call site", () => {
    assertParamTypeDeclarable("cnullcallable", "null");
    expect(
      outcome.notifications,
      "a callee declaring a non-`string` param was not type-checked at its call site: " +
        "such a callee is not binder-bypass-eligible and does not itself register, and " +
        "this cell is what proves its `params:` are still resolved — the precondition " +
        "the non-`string` primitive cells above depend on. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(toolArgMessage("cnullcallable", "null", "string"));
  });
});
