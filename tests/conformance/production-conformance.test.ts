import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { ThetaFixture } from "../../src/extension/factory";
import { discoverAndComposeFixtures } from "../../src/extension/production-composition";
import {
  createProductionProducerDeps,
  type PiToolDispatch,
} from "../../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../../src/extension/theta-composition-producer";
import { executeBody } from "../../src/runtime/statement-executor";
import { evaluateIndexAccess } from "../../src/runtime/runtime-panics";
import {
  isResultValue,
  type ThetaValue,
  type ResultValue,
} from "../../src/runtime/value";
import { discoverThetas } from "../../src/discovery/discovery-walk";
import { FakeFileSystem } from "../helpers/fake-file-system";
import type { ThetaSettings } from "../../src/discovery/settings";
import type { RuntimeRoot } from "../../src/runtime-root";
import type { Checkpoint } from "../../src/seams/checkpoint";
import type { AgentToolResultEnvelope } from "../../src/runtime/tool-call-execute";
import {
  parseThetaDocument,
  type ThetaDocument,
  type ParseThetaDocumentDeps,
} from "../../src/parser/theta-document";
import type { ThetaSource } from "../../src/lexer/lexer";
import type { Diagnostic } from "../../src/diagnostics/diagnostic";
import type { SystemNoteChannelDeps } from "../../src/extension/system-note-channel";
import type { ModelReferenceMatcher } from "../../src/parser/frontmatter";

// V20g-T — Production-path language-surface conformance suite.
//
// A standing acceptance suite that drives the FULL documented language surface
// THROUGH the production composition — the shipped `session_start` composition
// root (`discoverAndComposeFixtures`, re-exported by `extensions/index.ts`), the
// production `ThetaProducerDeps` (`createProductionProducerDeps` + `executeBody`),
// and the real whole-file parser (`parseThetaDocument`) — rather than through the
// isolated per-module seams. It is the regression net for the meta-failure the
// hardening campaign exposed: 1539 isolated unit tests stayed green while the
// shipped dispatch was broken. It is deterministic and offline (no live model
// turn), so it runs as part of the default `npm test`.
//
// Convention: conventions.md (phase categories — end-to-end harness; the
// live-host acceptance pair exception). Narrative spec references:
// extension-bootstrap-and-per-theta.md, expressions.md, runtime-value-model.md.
// Closes no new spec REQ-ID.
//
// STATUS DIVERGENCE (see notes.md / decisions.jsonl). The leaf presumed this
// tests-task would land BEFORE the V20a–V20f gap-fix impls and therefore red on
// the still-unlanded gaps. The actual build order landed V20a–V20f first, so no
// unlanded-gap red is available; the full-surface production drive is now GREEN.
// The suite is authored as the deterministic (no-live-model) production-path
// regression net — every documented behaviour the Tests bullets enumerate is
// reachable through the shipped composition root / the production runtime host /
// the real parser WITHOUT a provider turn — so it doubles as the green standing
// net the paired V20g leaf's Ships-when targets and runs in CI with no live
// precondition to be silently skipped.

// ===========================================================================
// Shared production-composition drive harness (no live model).
// ===========================================================================

/** A trivially-wired diagnostic sink + resolving `model:` matcher for the parse. */
function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}

/** Parse a UTF-8 `.theta` source string through the production whole-file parser. */
function parse(src: string, path = "conformance.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, parseDeps());
}

/** The set of diagnostic codes the production parse aggregated for `src`. */
function codesOf(src: string): string[] {
  return parse(src).diagnostics.map((d) => d.code);
}

/** The error-severity diagnostic codes the production parse aggregated for `src`. */
function errorCodesOf(src: string): string[] {
  return parse(src)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code);
}

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/**
 * A runtime root double sufficient for the pure / effectful production dispatch
 * (checkpoint gate, id source, wall clock). No live session, model registry, or
 * schema validator is exercised by the drivable surface below.
 */
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: { wallNow: () => 0 },
  } as unknown as RuntimeRoot;
}

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}

function producer(resolvePiTool?: (name: string) => PiToolDispatch | undefined) {
  return createProductionProducerDeps({
    pi: {} as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
    ...(resolvePiTool !== undefined ? { resolvePiTool } : {}),
  });
}

interface RunResult {
  readonly outcome: string;
  readonly value: ThetaValue | undefined;
}

/**
 * Drive `.theta` SOURCE TEXT through the production composition: parse it with
 * the real whole-file parser, assert it carries no error-severity diagnostic
 * (so a red below is a behavioural red, never a parse-setup red), compose the
 * prompt-mode conversation binding through the production `ThetaProducerDeps`,
 * and run the body through the real `V19d` effectful executor. Returns the
 * body's terminal outcome + final value.
 */
async function runSource(
  src: string,
  resolvePiTool?: (name: string) => PiToolDispatch | undefined,
): Promise<RunResult> {
  const document = parse(src);
  const errorCodes = document.diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => d.code);
  expect(
    errorCodes,
    "the conformance theta must parse cleanly through the production parser " +
      "before it is driven; error diagnostics: " + JSON.stringify(errorCodes),
  ).toEqual([]);
  expect(document.frontmatter, "the conformance theta must carry parseable frontmatter").not.toBeNull();
  const theta: ThetaCompositionInput = {
    slashName: "conformance",
    sourcePath: "/theta/conformance.theta",
    frontmatter: document.frontmatter!,
    body: document.body,
  };
  const bindInput: ConversationBindInput = { theta, args: "", ctx: ctxDouble() };
  const binding = producer(resolvePiTool).bindPromptConversation(bindInput);
  const execution = await executeBody(theta.body, binding.executeDeps);
  return { outcome: execution.outcome, value: execution.result.value };
}

/** Narrow a produced value to a `Result`, failing loudly (never silently) otherwise. */
function asResult(value: ThetaValue | undefined): ResultValue {
  if (value === undefined || !isResultValue(value)) {
    expect.unreachable(
      "expected a Result runtime value; got " + JSON.stringify(value),
    );
  }
  return value as ResultValue;
}

// ===========================================================================
// Load-time surface — driven through the SHIPPED composition root
// (`discoverAndComposeFixtures`) over a real on-disk project discovery source.
// ===========================================================================

function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}

interface PlantedTheta {
  readonly stem: string;
  readonly text: string;
}

/**
 * The `.theta` files planted under the project discovery source for the
 * load-time drive. Each malformed theta pairs its rejection with a positive
 * control that MUST still register, so a red distinguishes "the shipped load
 * path rejects the bad theta" from "the load path rejects everything".
 */
const LOAD_THETAS: readonly PlantedTheta[] = [
  // Clean control: a well-formed prompt theta whose `tools:` resolves — always
  // registers (proves the discovery walk found the workspace at all).
  { stem: "goodtheta", text: theta("---", "mode: prompt", "tools: read", "---", "@`hi`") },

  // gap #1 (V20a) — `tools:` load-time resolution: an unknown Pi tool.
  { stem: "unknowntool", text: theta("---", "mode: prompt", "tools: totally_unknown_xyz", "---", "@`hi`") },
  // gap #1 (V20a) — a `tools:` name collision.
  { stem: "collision", text: theta("---", "mode: prompt", "tools:", "  - read as dup", "  - grep as dup", "---", "@`hi`") },

  // frontmatter/param/system load-time validation: an unresolved `params:`
  // named type is an error-severity load/parse diagnostic that un-registers.
  { stem: "badparam", text: theta("---", "mode: subagent", "params:", "  x: NoSuchType", "---", "@`hi`") },

  // structural parser rejection at load time: an unterminated string literal
  // aggregates an error-severity `theta/parse/*` diagnostic, so the theta must
  // not register.
  { stem: "badparse", text: theta("---", "mode: prompt", "---", 'let x = "abc') },
];

interface LoadOutcome {
  readonly registered: readonly string[];
  readonly notifications: readonly string[];
}

let loadOutcome: LoadOutcome;
let workspaceDir: string;

async function runProductionLoad(cwd: string): Promise<LoadOutcome> {
  const notifications: string[] = [];
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

  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(pi, ctx);
  return { registered: fixtures.map((f) => f.slashName), notifications };
}

beforeAll(async () => {
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-v20g-"));
  const projectThetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(projectThetaDir, { recursive: true });
  for (const l of LOAD_THETAS) {
    writeFileSync(join(projectThetaDir, `${l.stem}.theta`), l.text, "utf8");
  }
  loadOutcome = await runProductionLoad(workspaceDir);
});

afterAll(() => {
  if (workspaceDir !== undefined) {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
});

describe("V20g-T conformance — load-time surface through the shipped composition root", () => {
  it("the clean control theta registers (the discovery walk found the workspace)", () => {
    expect(
      loadOutcome.registered,
      "the project `.pi/theta/` discovery walk did not register the clean control theta. Registered: " +
        JSON.stringify(loadOutcome.registered),
    ).toContain("goodtheta");
  });

  it("gap #1 (V20a): a `tools:` entry naming an unknown Pi tool un-registers the theta", () => {
    // theta/load/unknown-tool — resolveCallableSet wired into the shipped load path.
    expect(
      loadOutcome.registered,
      "the theta whose `tools:` names an unknown Pi tool must not register. Registered: " +
        JSON.stringify(loadOutcome.registered),
    ).not.toContain("unknowntool");
  });

  it("gap #1 (V20a): a `tools:` name collision un-registers the theta", () => {
    // theta/load/tool-name-collision — the collision resolves at production load time.
    expect(
      loadOutcome.registered,
      "the theta whose two `tools:` entries collide on one name must not register. Registered: " +
        JSON.stringify(loadOutcome.registered),
    ).not.toContain("collision");
  });

  it("frontmatter/param load-time validation: an unresolved `params:` named type un-registers the theta", () => {
    // theta/parse/unresolved-named-type — an error-severity load/parse diagnostic
    // blocks registration through the shipped composition root.
    expect(
      loadOutcome.registered,
      "the theta whose `params:` names an unresolved type must not register. Registered: " +
        JSON.stringify(loadOutcome.registered),
    ).not.toContain("badparam");
  });

  it("structural parser rejection: an unterminated string literal un-registers the theta", () => {
    // theta/parse/unterminated-string — a structural parse error blocks registration.
    expect(
      loadOutcome.registered,
      "the theta carrying an unterminated string literal must not register. Registered: " +
        JSON.stringify(loadOutcome.registered),
    ).not.toContain("badparse");
  });
});

// ===========================================================================
// Parse / lex / type surface — driven through the real whole-file parser
// (`parseThetaDocument`), the production parse path.
// ===========================================================================

describe("V20g-T conformance — structural parser rejections (campaign + gap #3 V20d)", () => {
  it("theta/parse/comparison-chaining: a chained comparison `a < b < c` is rejected", () => {
    expect(codesOf("let x = 1 < 2 < 3")).toContain("theta/parse/comparison-chaining");
  });

  it("theta/parse/statement-in-arm-body: a bare `if` statement in a match arm body is rejected", () => {
    const codes = codesOf(
      ["let y = 1", "let z = match y {", "  0 => if true { 1 } else { 2 },", "  _ => 3,", "}"].join("\n"),
    );
    expect(codes).toContain("theta/parse/statement-in-arm-body");
  });

  it("theta/parse/unterminated-string: a string literal with no closing quote is rejected", () => {
    expect(codesOf('let x = "abc')).toContain("theta/parse/unterminated-string");
  });

  it("theta/parse/assignment-as-expression: an assignment in expression position is rejected", () => {
    const codes = codesOf(["let mut x = 0", "if (x = 1) {", "  let a = 1", "}"].join("\n"));
    expect(codes).toContain("theta/parse/assignment-as-expression");
  });
});

describe("V20g-T conformance — type-layer diagnostics (gap #2 V20c over the V20b substrate)", () => {
  it("theta/parse/non-boolean-condition: a non-boolean `if` condition is rejected", () => {
    expect(codesOf(["if 1 {", "  let a = 1", "}"].join("\n"))).toContain(
      "theta/parse/non-boolean-condition",
    );
  });

  it("theta/parse/non-array-iterand: a non-array `for … in` iterand is rejected", () => {
    expect(codesOf(["for x in 5 {", "  let a = x", "}"].join("\n"))).toContain(
      "theta/parse/non-array-iterand",
    );
  });

  it("theta/parse/question-on-non-result: `?` on a non-Result static type is rejected", () => {
    expect(codesOf("let x = 5?")).toContain("theta/parse/question-on-non-result");
  });

  it("theta/parse/question-on-non-result: `?` on a union-typed fn parameter is rejected (bug 0019)", () => {
    // Bug 0019 widened ERR-18 gate: a `union` CompatType is non-Result by
    // construction and must classify. The fn-param annotation is a
    // source-level route to a `union` at a `?` operand site (fn scopes store
    // `annotationToCompatType(p.type)`; a `let` annotation is also such a
    // route, since the binding records the resolved annotation, bug 0083).
    // No return annotation keeps the scope `inferred`, so the only expected
    // diagnostic is the operand one.
    expect(
      codesOf(["fn f(x: number | string) {", "  let v = x?", "  v", "}"].join("\n")),
    ).toContain("theta/parse/question-on-non-result");
  });

  it("theta/parse/array-no-common-type: an array literal whose elements union under rule 2 is admitted (bug 0081)", () => {
    // `[1, "a"]` is expressions.md:225's own worked vector for rule 2's union
    // clause: `integer` and `string` are neither an object branch, so they
    // union to `integer | string` and the literal loads clean. Rule 3's own
    // refusal (two distinct named object schemas, no sink) is pinned
    // separately by tests/array-ternary-common-type-union.test.ts r7.
    expect(codesOf('let xs = [1, "a"]')).toEqual([]);
  });

  it("theta/parse/non-indexable-receiver: indexing a `string` receiver is rejected", () => {
    expect(codesOf(['let s = "hi"', "let c = s[0]"].join("\n"))).toContain(
      "theta/parse/non-indexable-receiver",
    );
  });
});

describe("V20g-T conformance — `@`-template prose with `//` and backslash lexes cleanly (campaign)", () => {
  it("a non-empty `@`-template whose prose contains `//` and a backslash is not mis-lexed", () => {
    // The `//` is prose inside the template body, NOT a line comment; the
    // backslash is a literal escape-prefix in prose. The campaign fix keeps the
    // lexer from mis-treating either, so the parse aggregates no error-severity
    // diagnostic for the template.
    const src = ["---", "mode: prompt", "---", "@`See http://example.com and a path C:\\dir\\file`"].join(
      "\n",
    );
    expect(
      errorCodesOf(src),
      "a `@`-template containing `//` and a backslash must lex cleanly (no error diagnostic)",
    ).toEqual([]);
  });
});

// ===========================================================================
// Runtime string-index correction (gap #4 V20c) — the production accessor.
// ===========================================================================

describe("V20g-T conformance — runtime string-index not-indexable (gap #4 V20c)", () => {
  it("evaluateIndexAccess surfaces the not-indexable error for `s[0]` rather than returning a char", () => {
    // A `string` is not an indexable receiver; at runtime the accessor must not
    // silently return the character.
    expect(() => evaluateIndexAccess("hello", 0)).toThrow();
  });
});

// ===========================================================================
// Runtime / pure surface — driven through the production runtime host
// (parse → compose → real `V19d` executor), no live model turn.
// ===========================================================================

describe("V20g-T conformance — runtime / pure surface through the production dispatch", () => {
  it("method-call chains: `\"  hi  \".trim().toUpperCase()` evaluates to \"HI\"", async () => {
    const r = await runSource(
      ["---", "mode: prompt", "---", 'let s = "  hi  ".trim().toUpperCase()', "s"].join("\n"),
    );
    expect(r.outcome).toBe("success");
    expect(r.value, "the stdlib method-call chain resolves through the production host").toBe("HI");
  });

  it("Ok/Err + match: `match Ok(5) { Ok(x) => x, Err(e) => 0 }` yields the unwrapped value", async () => {
    const r = await runSource(
      ["---", "mode: prompt", "---", "let res = Ok(5)", "match res {", "  Ok(x) => x,", "  Err(e) => 0,", "}"].join(
        "\n",
      ),
    );
    expect(r.outcome).toBe("success");
    expect(r.value, "the `Ok(x)` arm binds and returns the unwrapped 5").toBe(5);
  });

  it("`?` propagation in a Result-returning fn: `Ok(41)?` unwraps and the fn returns Ok(42)", async () => {
    const r = await runSource(
      [
        "---",
        "mode: prompt",
        "---",
        "fn step(): Result {",
        "  let x = Ok(41)?",
        "  Ok(x + 1)",
        "}",
        "step()",
      ].join("\n"),
    );
    expect(r.outcome).toBe("success");
    const result = asResult(r.value);
    expect(result.ok, "`?` unwrapped Ok(41) and the fn returned Ok(42)").toBe(true);
    expect((result as { ok: true; value: ThetaValue }).value).toBe(42);
  });

  it("Enum.Variant: `Color.Green` resolves to the declared enum variant", async () => {
    const r = await runSource(
      ["---", "mode: prompt", "---", "enum Color { Red, Green, Blue }", "Color.Green"].join("\n"),
    );
    expect(r.outcome).toBe("success");
    expect(String(r.value), "`Color.Green` resolves to the Green enum variant").toBe("Green");
  });

  it("user `fn` recursion: `fact(5)` evaluates to 120 through the executor", async () => {
    const r = await runSource(
      [
        "---",
        "mode: prompt",
        "---",
        "fn fact(n: integer): integer {",
        "  if n <= 1 { return 1 }",
        "  return n * fact(n - 1)",
        "}",
        "fact(5)",
      ].join("\n"),
    );
    expect(r.outcome).toBe("success");
    expect(r.value, "the recursive user fn resolves through the executor").toBe(120);
  });

  it("empty-template short-circuit: an empty `@`-template surfaces Err(empty_template) with no turn", async () => {
    // An empty rendered template short-circuits to `Err(ValidationError{cause:
    // "empty_template"})` before any provider turn; observed here through a
    // `match` (a bare query that yields `Err` fails the body, so the value is
    // read on the `Err` arm — combining the campaign's `match` + empty-template
    // surfaces).
    const r = await runSource(
      [
        "---",
        "mode: prompt",
        "---",
        "match @`` {",
        "  Ok(t) => t,",
        "  Err(e) => e.cause,",
        "}",
      ].join("\n"),
    );
    expect(r.outcome).toBe("success");
    expect(
      r.value,
      "the empty rendered template short-circuits to Err(empty_template), never a provider turn",
    ).toBe("empty_template");
  });

  it("object-pattern `{ field }` shorthand: destructures the matched object's field", async () => {
    const r = await runSource(
      [
        "---",
        "mode: prompt",
        "---",
        "schema Point { x: integer, y: integer }",
        "let p = Point { x: 3, y: 4 }",
        "match p {",
        "  { x } => x,",
        "}",
      ].join("\n"),
    );
    expect(r.outcome).toBe("success");
    expect(r.value, "the `{ x }` shorthand binds the field value").toBe(3);
  });

  it("gap #5 (V20e): a nested `match` in a pure-position match arm body resolves through the executor", async () => {
    const r = await runSource(
      [
        "---",
        "mode: prompt",
        "---",
        "let res = Ok(1)",
        "match res {",
        "  Ok(x) => match x {",
        "    1 => \"one\",",
        "    _ => \"other\",",
        "  },",
        "  Err(e) => \"err\",",
        "}",
      ].join("\n"),
    );
    expect(r.outcome).toBe("success");
    expect(
      r.value,
      "the nested match in the arm body resolves to the inner arm's result, not the partial evaluator's null",
    ).toBe("one");
  });

  it("method-call chain over a real dispatched effect: `grep({...})?` unwraps the tool's Ok(text)", async () => {
    let received: unknown;
    const resolvePiTool = (name: string): PiToolDispatch => ({
      toolName: name,
      execute: (_id, params): Promise<AgentToolResultEnvelope> => {
        received = params;
        return Promise.resolve({ content: [{ type: "text", text: "42 matches" }] });
      },
    });
    const r = await runSource(
      [
        "---",
        "mode: prompt",
        "tools:",
        "  - grep",
        "---",
        'let hits = grep({ pattern: "TODO", path: "src" })?',
        "hits",
      ].join("\n"),
      resolvePiTool,
    );
    expect(received, "the object-literal arg lowered to the real JSON params object").toEqual({
      pattern: "TODO",
      path: "src",
    });
    expect(r.outcome, "the body succeeds — `?` unwrapped the tool's Ok(text)").toBe("success");
    expect(r.value, "`?` bound the unwrapped tool text").toBe("42 matches");
  });
});

// ===========================================================================
// gap #6 (V20f) — `--theta` / settings non-`.theta` file entry → invalid-extension.
// Driven through the real production discovery walk (`discoverThetas`).
// ===========================================================================

const DISCOVERY_HOME = "/home/theta";
const DISCOVERY_CWD = "/project";

function discoveryFs(files: Record<string, string>, dirs: Record<string, readonly string[]>): FakeFileSystem {
  const ancestors: Record<string, string[]> = {
    "/": [],
    "/home": [],
    "/home/theta": [],
    "/home/theta/.pi": [],
    "/home/theta/.pi/agent": [],
    "/home/theta/.pi/agent/theta": [],
    "/project": [],
    "/project/.pi": [],
    "/project/.pi/theta": [],
  };
  const merged: Record<string, readonly string[]> = { ...ancestors };
  for (const [k, v] of Object.entries(dirs)) {
    merged[k] = [...(merged[k] ?? []), ...v];
  }
  return new FakeFileSystem({
    homedir: DISCOVERY_HOME,
    cwd: DISCOVERY_CWD,
    dirs: merged,
    files,
    errors: {},
    symlinks: {},
  });
}

const NO_SETTINGS: ThetaSettings = {};

describe("V20g-T conformance — non-`.theta` CLI/settings file entry → invalid-extension (gap #6 V20f)", () => {
  it("theta/load/invalid-extension: a `--theta <file>` entry naming a non-`.theta` file emits invalid-extension, not wrong-type-source", async () => {
    const fs = discoveryFs(
      { "/x/foo.md": "not a theta" },
      { "/x": ["foo.md"] },
    );
    const { diagnostics } = await discoverThetas({ fs, settings: NO_SETTINGS, cliPaths: ["/x/foo.md"] });
    const invalid = diagnostics.filter((d: Diagnostic) => d.code === "theta/load/invalid-extension");
    const wrongType = diagnostics.filter((d: Diagnostic) => d.code === "theta/load/wrong-type-source");
    expect(invalid).toHaveLength(1);
    expect(wrongType).toHaveLength(0);
    expect(invalid[0]!.message, "the message carries the registry Message tail").toContain(
      "does not end in .theta",
    );
  });
});

// Reference `ResultValue` so the type-only import is exercised by the type-check.
void (undefined as unknown as ResultValue);
