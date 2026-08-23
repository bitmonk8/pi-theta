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

// Bug 0146 — the ARRAY-LITERAL argument shape at the two call surfaces that
// read `collectProvableArgTypes` (`src/extension/invoke-static-checks.ts`):
// `invoke("./callee.theta", ["a"])` and a `.theta`-callable call
// `callee(["a"])`.
//
// THE READING TAKEN. `theta/parse/invoke-arg-type-mismatch`'s registered
// *Trigger* (`docs/spec_topics/diagnostics/code-registry-parse.md`) is accurate
// — "`invoke(...)` argument does not type-check against the callee's declared
// `params` schema (when the callee is statically resolvable)" — and the
// extension-layer read is what is incomplete. The collector's `array` arm
// returns `undefined` for every input, so `buildInvokeArgSlot` withholds the
// slot and `checkInvokeArgTypes` (`src/parser/invoke-diagnostics.ts`) skips it,
// while the same mistype through a same-file `fn` call is refused at `E` by
// `provableArgType` (`src/parser/type-layer-checks.ts`), which proves an array
// literal element-wise.
//
// THE SHAPE THIS FILE PINS. The `array` arm becomes an EXACTNESS-TESTED mirror
// of `#typeExpr`'s own array arm: the expression is reduced through
// `pass.typeOf`, the arm withholds unless that reduction is `array`-kinded, the
// elements are collected through `collectArmUnion`, and the arm withholds
// unless the collected elements render exactly as the reduction's element type
// — so a collected member can never render differently from the type the pass
// itself assigns. Nothing else moves: no fabricated `CompatType`, no weakening
// of `buildInvokeArgSlot`'s every-member-incompatible rule, no edit at the sink
// or the emitter. The remaining withheld arms (`ident` and its seven nominal
// siblings, `index` / `par-for`) need the scope-aware binding carriage the
// extension layer does not build, so they stay withheld and are pinned here as
// the widening's BOUNDARY.
//
// THE CHANNELS, all read off ONE load of ONE planted `.pi/theta/` workspace
// through `discoverAndComposeFixtures`: which slash names registered, which
// error-severity messages reached `ctx.ui.notify`, and `makeLoadEmit`'s no-UI
// stderr mirror. The mirror is the only channel carrying the emitting file,
// which is what makes a per-caller ABSENCE sound for rows whose *Message* names
// no caller.
//
// DIAG-4 (`docs/spec_topics/diagnostics/diagnostic-shape.md`) — every expected
// message is read from the registry's *Message* column through `registryMessage`
// and interpolated. An absent row or a reshaped template throws naming the
// registry page rather than degrading an assertion into a comparison against
// `undefined`; nothing here is a skip.
//
// EXPECTED COLOUR. The five `invoke` emission cells (e1-e4, e6) and the
// `.theta`-callable emission cell (e5) are RED until the arm is widened: each
// expects one message and gets none, and each mistyped caller registers. Every
// other cell is a GREEN-at-HEAD guard the widening must not move — the silence
// rows (including the empty literal, the element-`ident` boundary, the
// Set-dedup / union-verbatim rendering boundary (s9), the compatible-array
// rows and the unchanged `ident` / `index` / `par-for` arms), the Pi-tool
// provable-disjointness pair, and the same-file `fn` parity rows that already
// refuse the identical mistype.

// ===========================================================================
// DIAG-4 — registry-sourced *Message* templates.
// ===========================================================================

/** The row under test at the `invoke(...)` literal surface. */
const CODE = "theta/parse/invoke-arg-type-mismatch";
/** The `.theta`-callable sibling row, which reads the same collector. */
const TOOL_ARG_CODE = "theta/parse/tool-arg-type-mismatch";
/** The same-file `fn` row, which already refuses every array shape below. */
const FN_ARG_CODE = "theta/parse/fn-arg-type-mismatch";
/** The Pi-tool provable-disjointness row, whose verdicts must not move. */
const SCHEMA_CONFLICT_CODE = "theta/parse/tool-arg-schema-conflict";

/** The registry page carrying every row this file anchors on — the DIAG-4 oracle. */
const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)),
    "utf8",
  ),
) as RegistryRow[];

/**
 * A registered code's normative *Message* template, or a throw naming the
 * registry page: a missing row is a harness failure, never a skip, because
 * every expected string below is derived from it.
 */
function registered(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: no *Message* row for ${code} in ${REGISTRY_PAGE} — the DIAG-4 ` +
        "column is this file's only source for the expected strings",
    );
  }
  return template;
}

/**
 * Interpolate a template's `<…>` placeholders in ONE pass, so a substituted
 * value is never re-scanned — `<actual>` legitimately expands to text carrying
 * angle brackets (`array<array<integer>>`) and a `" | "` union. The placeholder
 * set is derived from the TEMPLATE: an unsupplied placeholder and an unused
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
 * `<i>` is the PARAM SLOT index: the path literal occupies the invoke call's
 * first argument, so the first real argument reports `0`.
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

/**
 * `Pi tool '<name>' argument field '<field>' type is provably disjoint from the
 * input schema: expected <expected>, got <actual>`.
 */
function schemaConflictMessage(
  name: string,
  field: string,
  expected: string,
  actual: string,
): string {
  return fill(
    SCHEMA_CONFLICT_CODE,
    new Map([
      ["<name>", name],
      ["<field>", field],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
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
 * draws `theta/load/binder-model-unresolved` and does not itself register. That
 * is inert here: a callee's own registration is not this row's subject, and its
 * `params:` are still resolved at a call site through `resolveCalleeArity`
 * (`src/extension/production-composition.ts`), which consults the callee's
 * PARSE diagnostics alone.
 */
function callee(paramType: string): string {
  return theta("---", "mode: subagent", "params:", `  x: ${paramType}`, "---", "@`hi`");
}

/** A `mode: subagent` caller with no `tools:` — the `invoke(...)` literal surface. */
function invokeCaller(...body: readonly string[]): string {
  return theta("---", "mode: subagent", "---", ...body, "@`hi`");
}

/** A `mode: subagent` caller resolving one callable entry — the callable surface. */
function callableCaller(entry: string, ...body: readonly string[]): string {
  return theta("---", "mode: subagent", "tools:", `  - ${entry}`, "---", ...body, "@`hi`");
}

// One callee stem per caller: the invoke row's *Message* names neither caller
// nor callee, so a callee shared between two cells would make a per-cell
// verdict unattributable on the message channel. Every stem is the same length,
// which is what keeps the suffix-shadowing guard below satisfiable.
const THETAS: readonly PlantedTheta[] = [
  // --- callees -------------------------------------------------------------
  { stem: "b0146k01", text: callee("string") },
  { stem: "b0146k02", text: callee("string") },
  { stem: "b0146k03", text: callee("string") },
  { stem: "b0146k04", text: callee("array<integer>") },
  { stem: "b0146k05", text: callee("array<string>") },
  { stem: "b0146k06", text: callee("array<array<string>>") },
  { stem: "b0146k07", text: callee("string") },
  { stem: "b0146k08", text: callee("string") },
  { stem: "b0146k09", text: callee("string") },
  { stem: "b0146k10", text: callee("string") },
  { stem: "b0146k11", text: callee("string") },
  { stem: "b0146k12", text: callee("string") },
  { stem: "b0146k13", text: callee("string") },
  { stem: "b0146k14", text: callee("array<string>") },
  { stem: "b0146k15", text: callee("string") },

  // --- the emitting rows: an array literal the collector can prove ----------
  { stem: "b0146c01", text: invokeCaller('invoke("./b0146k01.theta", ["a"])?') },
  { stem: "b0146c02", text: invokeCaller('invoke("./b0146k02.theta", [[1]])?') },
  { stem: "b0146c03", text: invokeCaller('invoke("./b0146k03.theta", [1, "a"])?') },
  { stem: "b0146c04", text: invokeCaller('invoke("./b0146k04.theta", ["a"])?') },

  // --- the compatible arrays, which must stay silent ------------------------
  { stem: "b0146c05", text: invokeCaller('invoke("./b0146k05.theta", ["a"])?') },
  { stem: "b0146c06", text: invokeCaller('invoke("./b0146k06.theta", [["a"]])?') },

  // --- the widening's boundary ---------------------------------------------
  // An empty literal reduces to no `array` kind, so the exactness test declines
  // it — the parity the same-file `fn` surface already shows by staying silent
  // on `he([])`.
  { stem: "b0146c07", text: invokeCaller('invoke("./b0146k07.theta", [])?') },
  // An element that is an `ident` is collected by the still-withheld nominal
  // arm, so the whole literal stays withheld.
  {
    stem: "b0146c08",
    text: invokeCaller("let n: integer = 1", 'invoke("./b0146k08.theta", [n])?'),
  },

  // --- the arms that stay withheld -----------------------------------------
  {
    stem: "b0146c09",
    text: invokeCaller("let n: integer = 1", 'invoke("./b0146k09.theta", n)?'),
  },
  {
    stem: "b0146c10",
    text: invokeCaller(
      "let xs: array<integer> = [1]",
      'invoke("./b0146k10.theta", xs[0])?',
    ),
  },
  {
    stem: "b0146c11",
    text: invokeCaller('invoke("./b0146k11.theta", par for a in ["a"] { "b" })?'),
  },

  // --- the positive control every absence cell reads ------------------------
  { stem: "b0146c12", text: invokeCaller('invoke("./b0146k12.theta", 1)?') },

  // --- the `.theta`-callable surface, which reads the same collector --------
  { stem: "b0146c13", text: callableCaller("./b0146k13.theta", 'b0146k13(["a"])?') },
  { stem: "b0146c14", text: callableCaller("./b0146k14.theta", 'b0146k14(["a"])?') },
  { stem: "b0146c15", text: callableCaller("./b0146k15.theta", "b0146k15(1)?") },

  // --- the same-file `fn` surface: the cross-surface parity pins ------------
  {
    stem: "b0146c16",
    text: invokeCaller("fn h(x: string): string { x }", 'let q = h(["a"])'),
  },
  {
    stem: "b0146c17",
    text: invokeCaller("fn hn(x: string): string { x }", "let q = hn([[1]])"),
  },
  {
    stem: "b0146c18",
    text: invokeCaller("fn hm(x: string): string { x }", 'let q = hm([1, "a"])'),
  },
  {
    stem: "b0146c19",
    text: invokeCaller("fn he(x: string): string { x }", "let q = he([])"),
  },

  // --- the Pi-tool provable-disjointness arm, unchanged in both directions --
  { stem: "b0146c20", text: callableCaller("read", 'read({ path: ["a"] })?') },
  { stem: "b0146c21", text: callableCaller("read", "read({ path: 1 })?") },

  // --- the workspace control ------------------------------------------------
  { stem: "b0146c22", text: invokeCaller("let z = 1") },

  // --- cell e6: an alternation-typed element, against an `array<string>` param -
  { stem: "b0146k16", text: callee("array<string>") },
  {
    stem: "b0146c23",
    text: invokeCaller(
      "let flag: boolean = true",
      'invoke("./b0146k16.theta", [flag ? 1 : "a"])?',
    ),
  },

  // --- cell s9: the Set-dedup / union-verbatim rendering boundary -----------
  { stem: "b0146k17", text: callee("string") },
  { stem: "b0146c24", text: invokeCaller('invoke("./b0146k17.theta", [1, "a", 1])?') },
];

// ===========================================================================
// The fake host `pi` / `ctx`, and the three channels one load surfaces on.
// ===========================================================================

interface LoadOutcome {
  /** Slash names the production compose helper returned. */
  readonly registered: readonly string[];
  /** Error-severity messages surfaced through `ctx.ui.notify`. */
  readonly notifications: readonly string[];
  /**
   * `makeLoadEmit`'s no-UI stderr mirror, one entry per rendered line:
   * `theta: <file>:<line>:<col>: <code>: <message>`. The only channel carrying
   * the emitting file, which is what makes a per-caller ABSENCE assertion sound
   * for a row whose *Message* names no caller.
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

  workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0146-"));
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
 * load produced the invoke row at least once, on both channels an absence is
 * read on. Without it an absence assertion passes while the row is unreachable
 * and nothing is being measured.
 */
function assertRowSurfaceLive(): void {
  expect(
    outcome.notifications,
    `unmet precondition: ${CODE} never surfaced for the control caller ` +
      '(`invoke("./b0146k12.theta", 1)` at a `params: x: string` callee), so this ' +
      "workspace produces no instance of the row and no ABSENCE below measures " +
      "anything. Notified: " + JSON.stringify(outcome.notifications),
  ).toContain(invokeArgMessage(0, "x", "string", "integer"));
  expect(
    linesForCode("b0146c12", CODE).length,
    `unmet precondition: no diagnostic line attributes ${CODE} to the control caller, so ` +
      "the per-caller channel every absence cell below reads is not carrying the row " +
      "and cannot witness its absence for one caller. Lines for that caller: " +
      JSON.stringify(linesFor("b0146c12")),
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
    `unmet precondition: the callee declaring \`params: x: ${paramType}\` drew a parse ` +
      "diagnostic, so this param type is not declarable and the cell over it is " +
      "measuring a rejected declaration rather than an argument mismatch",
  ).toEqual([]);
}

// ===========================================================================
// Cell A — DIAG-4 sourcing. Every row this file asserts is registered and
// carries the placeholders the expected strings interpolate, so a registry edit
// reds here rather than silently detaching the assertions from the registry.
// ===========================================================================
describe("bug 0146 cell A — the rows are registered with the placeholders this file fills", () => {
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

  it("A3: the sibling rows the cross-surface cells anchor on are registered", () => {
    for (const code of [TOOL_ARG_CODE, FN_ARG_CODE, SCHEMA_CONFLICT_CODE]) {
      expect(
        registryMessage(REGISTRY, code),
        `${code} has no registry row — a cell below anchors on its Message`,
      ).toBeTypeOf("string");
    }
  });

  it("A4: theta/parse/tool-arg-schema-conflict is registered at error severity, phase type", () => {
    const row = REGISTRY.find((r) => r.code === SCHEMA_CONFLICT_CODE);
    expect(
      row,
      `${SCHEMA_CONFLICT_CODE} has no registry row — the Pi-tool cells below assert ` +
        "that this arm's verdicts do not move, which needs the row to exist",
    ).toBeDefined();
    expect(row?.severity, `${SCHEMA_CONFLICT_CODE} is no longer an E-severity row`).toBe("E");
    expect(row?.phase, `${SCHEMA_CONFLICT_CODE} is no longer a type-phase row`).toBe("type");
  });
});

// ===========================================================================
// Cell p0 — the workspace-level control, deliberately UNGUARDED so it separates
// "the row never fires" from "the workspace never loaded".
// ===========================================================================
describe("bug 0146 cell p0 — the planted workspace loaded", () => {
  it("p0: the trivial control caller registered", () => {
    expect(
      outcome.registered,
      "the project `.pi/theta/` walk registered no trivial control caller, so every cell " +
        "in this file is reading a broken workspace. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("b0146c22");
  });

  it("p0: the invoke-literal arm produces this row for a literal argument", () => {
    assertRowSurfaceLive();
  });
});

// ===========================================================================
// Cells e1-e4 — the report's subject at the `invoke(...)` literal surface. Each
// argument is an array literal every element of which the collector can already
// reduce, so the exactness-tested arm yields a single `array<…>` member that is
// incompatible with the callee's declared param type on EVERY value the
// argument can take — `buildInvokeArgSlot`'s every-member rule unchanged. The
// `<actual>` rendering is the one `renderCollectedTypes` produces, which is the
// string the same-file `fn` surface already emits for these shapes (cells f1-f3).
// ===========================================================================
describe("bug 0146 cells e1-e4 — an array literal at an incompatible param draws the row and un-registers its caller", () => {
  it("e1: `[\"a\"]` at a `string` param reports `expected string, got array<string>`", () => {
    expect(
      outcome.notifications,
      `${CODE} did not surface for \`invoke("./b0146k01.theta", ["a"])\` at a ` +
        "`params: x: string` callee, so a declared param type is unenforced at the " +
        'position invocation.md §"Argument binding" assigns it, while the same mistype ' +
        "through a same-file `fn` call is refused. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(invokeArgMessage(0, "x", "string", "array<string>"));
    expect(
      linesForCode("b0146c01", CODE).length,
      "no diagnostic line attributes the row to the array-literal caller, so the " +
        "emission is not this caller's. Lines for this caller: " +
        JSON.stringify(linesFor("b0146c01")),
    ).toBeGreaterThan(0);
  });

  it("e1: the array-literal caller does not register", () => {
    expect(
      outcome.registered,
      "the array-literal caller registered: the row is E-severity, so `hasLoadParseError` " +
        "must deny registration exactly as it does for the integer-literal control and " +
        "for the `fn` surface. Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("b0146c01");
  });

  it("e2: a nested `[[1]]` at a `string` param reports `got array<array<integer>>`", () => {
    expect(
      outcome.notifications,
      "the nested array literal's `<actual>` did not render as the pass's own nested " +
        "array type, so the collected member renders differently from the type " +
        "`#typeExpr` assigns. Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(invokeArgMessage(0, "x", "string", "array<array<integer>>"));
    expect(
      outcome.registered,
      "the nested-array caller registered. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("b0146c02");
  });

  it("e3: a mixed `[1, \"a\"]` at a `string` param reports `got array<integer | string>`", () => {
    expect(
      outcome.notifications,
      "the mixed-element literal's `<actual>` did not carry the element union: the " +
        "elements are collected as a set and the whole set is what the author wrote. " +
        "Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(invokeArgMessage(0, "x", "string", "array<integer | string>"));
    expect(
      outcome.registered,
      "the mixed-element caller registered. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("b0146c03");
  });

  it("e4: `[\"a\"]` at an `array<integer>` param reports `expected array<integer>, got array<string>`", () => {
    assertParamTypeDeclarable("b0146k04", "array<integer>");
    expect(
      outcome.notifications,
      "an array literal whose element type is incompatible with a STRUCTURAL param type " +
        "was admitted, so the widening reaches only primitive params. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(invokeArgMessage(0, "x", "array<integer>", "array<string>"));
    expect(
      outcome.registered,
      "the caller mistyping an `array<integer>` param registered. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("b0146c04");
  });
});

// ===========================================================================
// Cell e6 — the alternation-typed element. `flag ? 1 : "a"` is collected as
// `[integer, string]` through the same `#typeExpr` ternary arm the same-file
// `fn` surface's cell f3 already exercises on a two-element literal, and
// `#commonType` reduces the array's own element type to the identical
// `integer | string` union — so the exactness test holds and the arm reports
// the union it renders, denying registration exactly as an outright
// incompatible element would. Measured, not assumed: this workspace's load
// draws no accompanying `theta/parse/array-element-type-mismatch` line for
// this caller, so only the invoke row is asserted.
// ===========================================================================
describe("bug 0146 cell e6 — an alternation-typed element renders as the pass's own union and denies registration", () => {
  it("e6: `[flag ? 1 : \"a\"]` at an `array<string>` param reports `got array<integer | string>`", () => {
    assertParamTypeDeclarable("b0146k16", "array<string>");
    expect(
      outcome.notifications,
      "the alternation-typed element's collected union did not surface, so an argument " +
        "whose element type the pass itself resolves to a union is silently admitted. " +
        "Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(invokeArgMessage(0, "x", "array<string>", "array<integer | string>"));
    expect(
      linesForCode("b0146c23", "theta/parse/array-element-type-mismatch"),
      "a second row fired for the same element, so this cell's caller is not isolating " +
        "the invoke-argument row alone. Lines for this caller: " +
        JSON.stringify(linesFor("b0146c23")),
    ).toEqual([]);
    expect(
      outcome.registered,
      "the alternation-typed-element caller registered. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("b0146c23");
  });
});

// ===========================================================================
// Cell e5 — the `.theta`-callable surface reads the SAME collector, so the
// widening lands there in the same commit. Its control (cell g1) already fires
// at this HEAD for an integer literal, which is what makes this absence a
// missing emission rather than a dead surface.
// ===========================================================================
describe("bug 0146 cell e5 — the `.theta`-callable surface refuses the identical array-literal mistype", () => {
  it("e5: `b0146k13([\"a\"])` at a `string` param reports the tool-argument row", () => {
    expect(
      outcome.notifications,
      "the `.theta`-callable arm admitted an array literal at a `string` param while the " +
        "invoke arm refuses it, so one collector's verdict reached only one of its two " +
        "callable-call consumers. Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(toolArgMessage("b0146k13", "string", "array<string>"));
    expect(
      outcome.registered,
      "the `.theta`-callable caller passing an array literal to a `string` param " +
        "registered. Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("b0146c13");
  });
});

// ===========================================================================
// Cells s1, s2 — the compatible arrays. The widening must decide these SILENT:
// `checkCompatible` answers `"compatible"`, which the emitter defers on, and
// deciding them otherwise would be the false-`E` species bug 0072's discipline
// exists to refuse.
// ===========================================================================
describe("bug 0146 cells s1, s2 — a compatible array literal stays silent and its caller registers", () => {
  it("s1: `[\"a\"]` at an `array<string>` param draws nothing", () => {
    assertRowSurfaceLive();
    assertParamTypeDeclarable("b0146k05", "array<string>");
    expect(
      linesForCode("b0146c05", CODE),
      `${CODE} fired on an array literal that matches its param type, so the widened arm ` +
        "rejects well-typed programs. Lines for this caller: " +
        JSON.stringify(linesFor("b0146c05")),
    ).toEqual([]);
    expect(
      outcome.registered,
      "the well-typed array-literal caller must register. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("b0146c05");
  });

  it("s2: `[[\"a\"]]` at an `array<array<string>>` param draws nothing", () => {
    assertRowSurfaceLive();
    assertParamTypeDeclarable("b0146k06", "array<array<string>>");
    expect(
      linesForCode("b0146c06", CODE),
      `${CODE} fired on a nested array literal that matches its nested param type. Lines ` +
        "for this caller: " + JSON.stringify(linesFor("b0146c06")),
    ).toEqual([]);
    expect(
      outcome.registered,
      "the well-typed nested-array caller must register. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("b0146c06");
  });
});

// ===========================================================================
// Cells s3, s4 — the widening's BOUNDARY, one cell per reason the exactness
// test declines. s3's empty literal reduces to no `array` kind at all, which is
// the same disposition the same-file `fn` surface already takes (cell f4). s4's
// element is an `ident`, collected by the nominal arm that stays withheld, so
// the whole literal stays withheld — a later refactor that reached an emission
// here without the binding carriage would be reading a type it cannot prove.
// ===========================================================================
describe("bug 0146 cells s3, s4 — the shapes the exactness test declines stay silent", () => {
  it("s3: an empty literal `[]` at a `string` param draws nothing and the caller registers", () => {
    assertRowSurfaceLive();
    expect(
      linesForCode("b0146c07", CODE),
      `${CODE} fired on an empty array literal, whose reduction carries no element type ` +
        "for the exactness test to match — the parity the `fn` surface keeps by staying " +
        "silent on the same spelling. Lines for this caller: " +
        JSON.stringify(linesFor("b0146c07")),
    ).toEqual([]);
    expect(
      outcome.registered,
      "the empty-literal caller must keep registering. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("b0146c07");
  });

  it("s4: an element that is a typed-`let` read draws nothing and the caller registers", () => {
    assertRowSurfaceLive();
    expect(
      linesForCode("b0146c08", CODE),
      `${CODE} fired on an array literal whose element is an identifier: the element is ` +
        "collected by the nominal arm, which withholds because the extension layer " +
        "builds no bindings map, so a judgement here is a static read the layer cannot " +
        "make. Lines for this caller: " + JSON.stringify(linesFor("b0146c08")),
    ).toEqual([]);
    expect(
      outcome.registered,
      "the element-`ident` caller must keep registering. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("b0146c08");
  });
});

// ===========================================================================
// Cell s9 — the Set-dedup / union-verbatim rendering boundary.
// `renderCollectedTypes` (the `<actual>` renderer, and the exactness test's
// own right-hand side) `Set`-dedupes its members, while `#commonType`'s union
// clause keeps its arms verbatim: `[1, "a", 1]` collects as `[integer, string,
// integer]`, which renders deduped as `integer | string`, but the array
// literal's own reduction (`#commonType` over the same three candidates, no
// dominating member) keeps the repeated `integer` arm and renders
// `integer | string | integer`. The two renderings differ, so the exactness
// test declines and the arm withholds — the conservative direction the same
// invariant the array arm's own header names always takes: a withhold can
// only suppress an emission the collector might otherwise produce, never
// manufacture one that was not already provable, so this is a silence this
// widening must not disturb, not a defect in it.
// ===========================================================================
describe("bug 0146 cell s9 — a duplicated-literal element stays silent at the dedup/order boundary", () => {
  it("s9: `[1, \"a\", 1]` draws nothing and the caller registers", () => {
    assertRowSurfaceLive();
    expect(
      linesForCode("b0146c24", CODE),
      `${CODE} fired on an array literal whose duplicated element defeats the ` +
        "dedup/union-verbatim rendering match — a case the exactness test's own " +
        "conservative direction must decline rather than emit against. Lines for this " +
        "caller: " + JSON.stringify(linesFor("b0146c24")),
    ).toEqual([]);
    expect(
      outcome.registered,
      "the duplicated-literal caller must keep registering. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("b0146c24");
  });
});

// ===========================================================================
// Cells s5-s7 — the arms this widening does NOT touch. Each needs the
// scope-aware binding carriage the extension layer does not build, so each
// stays a deferral under type-system.md §"Unresolvable operands" and the
// callee's runtime AJV load stays its net.
// ===========================================================================
describe("bug 0146 cells s5-s7 — the `ident`, `index` and `par for` arms stay withheld", () => {
  it("s5: a typed-`let` read at a `string` param draws nothing and the caller registers", () => {
    assertRowSurfaceLive();
    expect(
      linesForCode("b0146c09", CODE),
      `${CODE} fired on an identifier argument, which the nominal arm withholds. Lines ` +
        "for this caller: " + JSON.stringify(linesFor("b0146c09")),
    ).toEqual([]);
    expect(
      outcome.registered,
      "the typed-`let` caller must keep registering. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("b0146c09");
  });

  it("s6: an index read at a `string` param draws nothing and the caller registers", () => {
    assertRowSurfaceLive();
    expect(
      linesForCode("b0146c10", CODE),
      `${CODE} fired on an index read, whose proof obligation belongs to its target and ` +
        "is reachable only once the nominal arm is. Lines for this caller: " +
        JSON.stringify(linesFor("b0146c10")),
    ).toEqual([]);
    expect(
      outcome.registered,
      "the index-read caller must keep registering. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("b0146c10");
  });

  it("s7: a `par for` argument at a `string` param draws nothing and the caller registers", () => {
    assertRowSurfaceLive();
    expect(
      linesForCode("b0146c11", CODE),
      `${CODE} fired on a \`par for\` argument, whose element type is the CTRL-3 nominal. ` +
        "Lines for this caller: " + JSON.stringify(linesFor("b0146c11")),
    ).toEqual([]);
    expect(
      outcome.registered,
      "the `par for`-argument caller must keep registering. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("b0146c11");
  });
});

// ===========================================================================
// Cell g1 — the `.theta`-callable control, and cell s8 the compatible array on
// that same surface. g1 fires at this HEAD, which is what makes cell e5's
// absence attributable to the collector rather than to a dead surface.
// ===========================================================================
describe("bug 0146 cells g1, s8 — the `.theta`-callable surface's control fires and its compatible array stays silent", () => {
  it("g1: an integer literal at a `string` param reports the tool-argument row and un-registers", () => {
    expect(
      outcome.notifications,
      "the `.theta`-callable argument type check regressed, so cell e5's absence cannot " +
        "be attributed to the collector. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(toolArgMessage("b0146k15", "string", "integer"));
    expect(
      outcome.registered,
      "the `.theta`-callable caller passing an integer to a `string` param registered. " +
        "Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("b0146c15");
  });

  it("s8: a compatible array literal on the callable surface draws nothing and registers", () => {
    assertRowSurfaceLive();
    assertParamTypeDeclarable("b0146k14", "array<string>");
    expect(
      linesForCode("b0146c14", TOOL_ARG_CODE),
      `${TOOL_ARG_CODE} fired on an array literal that matches its param type. Lines for ` +
        "this caller: " + JSON.stringify(linesFor("b0146c14")),
    ).toEqual([]);
    expect(
      outcome.registered,
      "the well-typed callable caller must register. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("b0146c14");
  });
});

// ===========================================================================
// Cells f1-f4 — the same-file `fn` surface, which decides all four spellings
// today through `provableArgType`. They are the cross-surface parity pins: the
// three emissions are the `<actual>` renderings cells e1-e3 must match, and f4's
// silence is the disposition cell s3 mirrors. Enforcement of one declared
// parameter type must not depend on which call spelling the author chose.
// ===========================================================================
describe("bug 0146 cells f1-f4 — the same-file `fn` surface's verdicts on the identical literals", () => {
  it("f1: `h([\"a\"])` at a `string` parameter reports `got array<string>` and un-registers", () => {
    expect(
      outcome.notifications,
      "the same-file `fn` array-literal refusal regressed, so this file's parity baseline " +
        "is gone. Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(fnArgMessage("h", 0, "x", "string", "array<string>"));
    expect(
      outcome.registered,
      "the `fn` caller passing an array literal to a `string` parameter registered. " +
        "Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("b0146c16");
  });

  it("f2: `hn([[1]])` reports `got array<array<integer>>`", () => {
    expect(
      outcome.notifications,
      "the same-file `fn` nested-array rendering moved, so cell e2's expected `<actual>` " +
        "no longer has a cross-surface twin. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(fnArgMessage("hn", 0, "x", "string", "array<array<integer>>"));
    expect(
      outcome.registered,
      "the `fn` nested-array caller registered. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("b0146c17");
  });

  it("f3: `hm([1, \"a\"])` reports `got array<integer | string>`", () => {
    expect(
      outcome.notifications,
      "the same-file `fn` mixed-element rendering moved, so cell e3's expected `<actual>` " +
        "no longer has a cross-surface twin. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(fnArgMessage("hm", 0, "x", "string", "array<integer | string>"));
    expect(
      outcome.registered,
      "the `fn` mixed-element caller registered. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("b0146c18");
  });

  it("f4: `he([])` draws nothing and its caller registers", () => {
    // The `fn` surface's own positive control: `h(["a"])` (cell f1) already
    // fires this row on this same surface, so f4's absence is a decided
    // silence on a live row, not a reading of a surface that has stopped
    // producing it at all.
    expect(
      linesForCode("b0146c16", FN_ARG_CODE).length,
      `unmet precondition: ${FN_ARG_CODE} never surfaced for the \`fn\` surface's own ` +
        'positive control (`h(["a"])`), so this file carries no instance of the row on ' +
        "this surface and f4's absence measures nothing. Lines for that caller: " +
        JSON.stringify(linesFor("b0146c16")),
    ).toBeGreaterThan(0);
    expect(
      linesForCode("b0146c19", FN_ARG_CODE),
      `${FN_ARG_CODE} fired on an empty array literal, so the disposition cell s3 mirrors ` +
        "on the invoke surface is not the `fn` surface's. Lines for this caller: " +
        JSON.stringify(linesFor("b0146c19")),
    ).toEqual([]);
    expect(
      outcome.registered,
      "the `fn` empty-literal caller must register. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("b0146c19");
  });
});

// ===========================================================================
// Cells t1, t2 — the collector's THIRD consumer, the Pi-tool
// provable-disjointness arm. Its comparison runs through `subsetKinds`
// (`src/runtime/tool-call.ts`), which admits no `array<…>` arm, so a collected
// `array` member makes the rendered union unprovable and the arm stands down.
// Both directions are pinned: the array field defers (t1) and the integer field
// still fires (t2), so a widening that moved this arm's verdicts reds here.
// ===========================================================================
describe("bug 0146 cells t1, t2 — the Pi-tool provable-disjointness arm's verdicts do not move", () => {
  it("t1: `read({ path: [\"a\"] })` stays silent and its caller registers", () => {
    expect(
      linesForCode("b0146c21", SCHEMA_CONFLICT_CODE).length,
      `unmet precondition: ${SCHEMA_CONFLICT_CODE} never surfaced for the integer-field ` +
        "control, so this workspace produces no instance of that row and t1's absence " +
        "measures nothing. Lines for the control caller: " +
        JSON.stringify(linesFor("b0146c21")),
    ).toBeGreaterThan(0);
    expect(
      linesForCode("b0146c20", SCHEMA_CONFLICT_CODE),
      `${SCHEMA_CONFLICT_CODE} fired on an \`array<…>\` field type, which no ` +
        "accepted-value kind set represents, so the disjointness claim is unprovable " +
        "and this emission would front-run a rejection the runtime AJV check may not " +
        "make. Lines for this caller: " + JSON.stringify(linesFor("b0146c20")),
    ).toEqual([]);
    expect(
      outcome.registered,
      "the Pi-tool caller passing an array-typed field must keep registering. " +
        "Registered: " + JSON.stringify(outcome.registered),
    ).toContain("b0146c20");
  });

  it("t2: `read({ path: 1 })` still reports the provable-disjointness row and un-registers", () => {
    expect(
      outcome.notifications,
      "the Pi-tool provable-disjointness control stopped firing, so t1's absence is a " +
        "dead surface rather than a deferral. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(schemaConflictMessage("read", "path", "string", "integer"));
    expect(
      outcome.registered,
      "the Pi-tool caller passing an integer to a `string` schema field registered. " +
        "Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("b0146c21");
  });
});
