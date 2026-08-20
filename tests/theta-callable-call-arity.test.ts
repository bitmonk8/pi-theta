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
import { collectThetaCallableCallSites } from "../src/extension/invoke-static-checks";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ThetaSource } from "../src/lexer/lexer";
import type { CallableSetSnapshot, ResolvedCallable } from "../src/parser/callable-set";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaBody,
} from "../src/parser/theta-document";

// Bug 0071 — `theta/parse/invoke-arity-too-few` / `-too-many` over the
// `.theta`-callable call surface.
//
// `docs/spec_topics/tool-calls.md` §"Argument shape" binds both codes to both
// call surfaces by name: "Argument arity is checked under the same rules as
// `invoke(...)` … (`theta/parse/invoke-arity-too-few` /
// `theta/parse/invoke-arity-too-many` apply equally to a `.theta` callable
// call)". One shared call-site walk carries both surfaces into the compose pass:
// `collectInvokeExprs` and the `.theta`-callable-call resolution read the same
// traversal result, which the INV-3 arity block of `checkInvokeStaticResolution`
// consumes, so a call against a callable-set name is checked under the same
// rules as a literal `invoke(...)` — including inside a `par for` body, whose
// statements reach the walk through the same arm list (cells B11-B15).
//
// Every B cell drives the production compose helper (`discoverAndComposeFixtures`,
// `src/extension/production-composition.ts`) over a planted `.pi/theta/`
// discovery workspace, and asserts on the two production observables: which
// slash names registered, and which error-severity messages reached
// `ctx.ui.notify`. No B cell asserts through an internal export, so none of them
// reds on a compile error, a missing fixture, or a harness throw. Cell C is the
// one deliberate exception and carries its own rationale: it pins the contract
// of an export no in-tree caller exercises.
//
// Rendering of the `<callee>` placeholder differs by surface, by design: an
// `invoke("./x.theta", …)` site renders the verbatim path literal, a
// `.theta`-callable site renders the PRESENTED CALLABLE NAME (the post-`as`,
// post-hyphen→underscore identifier the author wrote). The diagnostic's range is
// the call site and the callee path appears nowhere on that line. Cells B1–B7,
// B11 and B15 pin the name form; cells B10, B13 and B14 pin the path form on the
// `invoke` surface and so pin the divergence itself.
//
// Message strings are sourced from the sharded diagnostics registry per the
// conventions.md *Diagnostic message anchors* rule (DIAG-4) — never copied
// prose. See cell A.

// --- Registry-sourced Message templates (DIAG-4) ---------------------------

/** The live sharded registry pages this file's codes are registered on. */
const REGISTRY_TEXT = ["code-registry-parse.md", "code-registry-load.md"]
  .map((page) =>
    readFileSync(
      fileURLToPath(
        new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url),
      ),
      "utf8",
    ),
  )
  .join("\n");

interface RegistryRow {
  code: string;
  message: string;
}

const REGISTRY = parseRegistry(REGISTRY_TEXT) as RegistryRow[];

const ARITY_TOO_FEW_CODE = "theta/parse/invoke-arity-too-few";
const ARITY_TOO_MANY_CODE = "theta/parse/invoke-arity-too-many";
const UNRESOLVABLE_THETA_PATH_CODE = "theta/load/unresolvable-theta-path";
const CALLEE_HAS_ERRORS_CODE = "theta/load/callee-has-errors";

/** Source a code's registered *Message* template and fill its `<…>` placeholders. */
function expectedMessage(
  code: string,
  subs: Readonly<Record<string, string>>,
): string {
  let message = registryMessage(REGISTRY, code) as string;
  for (const [placeholder, value] of Object.entries(subs)) {
    message = message.replaceAll(placeholder, value);
  }
  expect(
    message,
    `${code}: an unsubstituted <…> placeholder remains — the registry row's ` +
      "Message template changed shape and this file's substitutions are stale",
  ).not.toMatch(/<[a-z]+>/);
  return message;
}

/** `invoke '<callee>' passes too few arguments: expected <required> non-defaulted, got <provided>`. */
function tooFew(callee: string, required: number, provided: number): string {
  return expectedMessage(ARITY_TOO_FEW_CODE, {
    "<callee>": callee,
    "<required>": String(required),
    "<provided>": String(provided),
  });
}

/** `invoke '<callee>' passes too many arguments: expected at most <max>, got <provided>`. */
function tooMany(callee: string, max: number, provided: number): string {
  return expectedMessage(ARITY_TOO_MANY_CODE, {
    "<callee>": callee,
    "<max>": String(max),
    "<provided>": String(provided),
  });
}

// --- Planted discovery workspace -------------------------------------------

interface PlantedTheta {
  readonly stem: string;
  readonly text: string;
}

function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}

/**
 * Two required `params:` — `requiredCount` 2, `totalCount` 2 — so a 1-argument
 * call is too-few, a 3-argument call is too-many, and a 2-argument call is
 * exact.
 */
const TWO_REQUIRED = ["params:", "  x: string", "  y: string"] as const;

/**
 * One required and one defaulted `params:` — `requiredCount` 1, `totalCount` 2 —
 * so a 1-argument call is legal and a 3-argument call is still too-many.
 */
const ONE_REQUIRED_ONE_DEFAULTED = [
  "params:",
  "  x: string",
  '  y: string = "d"',
] as const;

/**
 * The planted `.theta` files. Every callee stem is chosen so that no callee's
 * presented name is a substring of another's: `ctx.ui.notify` carries the
 * message text alone with no caller attribution, so the notification collector
 * is workspace-global and a cell asserting the ABSENCE of an arity diagnostic
 * can only be sound if its callee name cannot appear in a sibling cell's
 * message.
 */
const THETAS: readonly PlantedTheta[] = [
  // --- callees ---
  // The two-required callee for the three rejected call forms (B1–B3) and for
  // the `invoke` surface (B10).
  { stem: "twoparam", text: theta("---", "mode: subagent", ...TWO_REQUIRED, "---", "@`hi`") },
  // The two-required callee for the correct-arity control (B4) alone.
  { stem: "ctlcallee", text: theta("---", "mode: subagent", ...TWO_REQUIRED, "---", "@`hi`") },
  // The defaulted-tail callee for the legal too-few control (B5) alone.
  {
    stem: "defok",
    text: theta("---", "mode: subagent", ...ONE_REQUIRED_ONE_DEFAULTED, "---", "@`hi`"),
  },
  // The defaulted-tail callee for the still-illegal too-many cell (B6) alone.
  {
    stem: "defparam",
    text: theta("---", "mode: subagent", ...ONE_REQUIRED_ONE_DEFAULTED, "---", "@`hi`"),
  },
  // The hyphenated callee for the `as`-rename cell (B7). Its presented name is
  // `renamed`; its default derived name would have been `two_param_hyph`.
  {
    stem: "two-param-hyph",
    text: theta("---", "mode: subagent", ...TWO_REQUIRED, "---", "@`hi`"),
  },
  // The two callees for the `par for`-body cells B11 (rejected) and B12 (the
  // correct-arity control, which needs its own callee for the same
  // workspace-global-collector reason as B4), plus the callee for the `par for`
  // ITERAND cell B15 (its own callee for the same reason).
  {
    stem: "parwrongcallee",
    text: theta("---", "mode: subagent", ...TWO_REQUIRED, "---", "@`hi`"),
  },
  {
    stem: "parokcallee",
    text: theta("---", "mode: subagent", ...TWO_REQUIRED, "---", "@`hi`"),
  },
  {
    stem: "paritercallee",
    text: theta("---", "mode: subagent", ...TWO_REQUIRED, "---", "@`hi`"),
  },
  // The callee carrying its OWN error-severity parse diagnostic
  // (`theta/parse/unresolved-named-type` per param) for B9.
  {
    stem: "brokenarity",
    text: theta(
      "---",
      "mode: subagent",
      "params:",
      "  x: NoSuchType",
      "  y: NoSuchType",
      "---",
      "@`hi`",
    ),
  },

  // --- `.theta`-callable callers (B1–B9) ---
  {
    stem: "callabletoomany",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./twoparam.theta",
      "---",
      'twoparam("a", "b", "c")?',
      "@`hi`",
    ),
  },
  {
    stem: "callabletoofew",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./twoparam.theta",
      "---",
      'twoparam("a")?',
      "@`hi`",
    ),
  },
  {
    stem: "callablezero",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./twoparam.theta",
      "---",
      "twoparam()?",
      "@`hi`",
    ),
  },
  {
    stem: "ctlcallable",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./ctlcallee.theta",
      "---",
      'ctlcallee("a", "b")?',
      "@`hi`",
    ),
  },
  {
    stem: "calldefaulted",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./defok.theta",
      "---",
      'defok("a")?',
      "@`hi`",
    ),
  },
  {
    stem: "calldefaultedtoomany",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./defparam.theta",
      "---",
      'defparam("a", "b", "c")?',
      "@`hi`",
    ),
  },
  {
    stem: "callrenamed",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./two-param-hyph.theta as renamed",
      "---",
      'renamed("a")?',
      "@`hi`",
    ),
  },
  {
    stem: "callunresolvable",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./nosuch.theta",
      "---",
      'nosuch("a")?',
      "@`hi`",
    ),
  },
  {
    stem: "callbroken",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./brokenarity.theta",
      "---",
      "brokenarity()?",
      "@`hi`",
    ),
  },

  // --- `.theta`-callable callers inside a `par for` body (B11-B12) ---
  // control-flow.md CTRL-4 admits `.theta` callable calls in a `par for` body,
  // so the arity rule holds there on the same terms as at the top level.
  {
    stem: "parcallwrong",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./parwrongcallee.theta",
      "---",
      'par for a in ["a"] { parwrongcallee("a") }',
      "@`hi`",
    ),
  },
  {
    stem: "parcallok",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./parokcallee.theta",
      "---",
      'par for a in ["a"] { parokcallee("a", "b") }',
      "@`hi`",
    ),
  },
  // B15 — the `par for` ITERAND position. The call sits INSIDE an array literal
  // rather than bare because a `par for` iterand is type-checked against
  // `array<T>` (CTRL-2, `theta/parse/non-array-iterand`) and a call
  // expression's static type is not an array: a bare `paritercallee("a")`
  // iterand un-registers this caller on that unrelated rejection, which would
  // make the cell pass with the arity check gone. Wrapped, the iterand
  // type-checks and the arity rejection is the only one left — and the call is
  // still reachable only through the `par-for` arm's descent into `iterand`.
  {
    stem: "pariter",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./paritercallee.theta",
      "---",
      'par for a in [paritercallee("a")] { a }',
      "@`hi`",
    ),
  },

  // --- `invoke(...)` callers (B10, B13-B14) — no `tools:` ---
  // `parinvcallee` / `parmaxcallee` are reached from a `par for` body and from a
  // `par for` `max` operand respectively; `paritercallee` above covers the third
  // `ParForExpr` operand position the walk descends into, the iterand.
  {
    stem: "parinvcallee",
    text: theta("---", "mode: subagent", ...TWO_REQUIRED, "---", "@`hi`"),
  },
  {
    stem: "parmaxcallee",
    text: theta("---", "mode: subagent", ...TWO_REQUIRED, "---", "@`hi`"),
  },
  {
    stem: "parinvoke",
    text: theta(
      "---",
      "mode: subagent",
      "---",
      'par for a in ["a"] { invoke("./parinvcallee.theta", "a") }',
      "@`hi`",
    ),
  },
  {
    stem: "parmax",
    text: theta(
      "---",
      "mode: subagent",
      "---",
      'par for a in ["a"] max invoke("./parmaxcallee.theta", "a") { a }',
      "@`hi`",
    ),
  },
  {
    stem: "invtoofew",
    text: theta("---", "mode: subagent", "---", 'invoke("./twoparam.theta", "a")?', "@`hi`"),
  },
  {
    stem: "invtoomany",
    text: theta(
      "---",
      "mode: subagent",
      "---",
      'invoke("./twoparam.theta", "a", "b", "c")?',
      "@`hi`",
    ),
  },
];

// --- Fake host `pi` / `ctx` for the load path ------------------------------

interface LoadOutcome {
  /** Slash names the shipped composition root registered (returned fixtures). */
  readonly registered: readonly string[];
  /** Error-severity diagnostic messages surfaced via `ctx.ui.notify`. */
  readonly notifications: readonly string[];
}

let outcome: LoadOutcome;
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
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0071-"));
  const projectThetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(projectThetaDir, { recursive: true });
  for (const l of THETAS) {
    writeFileSync(join(projectThetaDir, `${l.stem}.theta`), l.text, "utf8");
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

/** Notifications naming `callee` that report an arity rejection. */
function arityMessagesNaming(callee: string): readonly string[] {
  return outcome.notifications.filter(
    (n) => n.includes(callee) && n.includes("passes too"),
  );
}

// ===========================================================================
// Cell A — DIAG-4 registry sourcing. Both codes' rows exist and carry the
// placeholders every expected string in this file is built from, so deleting or
// reshaping a row reds here rather than silently detaching the assertions below
// from the registry (the `theta/parse/invoke-arity-too-few` and
// `theta/parse/invoke-arity-too-many` rows of
// `docs/spec_topics/diagnostics/code-registry-parse.md`).
// ===========================================================================
describe("bug 0071 cell A — the arity codes are registered with the placeholders this file substitutes", () => {
  it("A: theta/parse/invoke-arity-too-few is registered and its Message carries <callee>, <required>, <provided>", () => {
    const row = REGISTRY.find((r) => r.code === ARITY_TOO_FEW_CODE);
    expect(
      row,
      `${ARITY_TOO_FEW_CODE} has no registry row — the code this file asserts is ` +
        "not registered (DIAG-2)",
    ).toBeDefined();
    const message = registryMessage(REGISTRY, ARITY_TOO_FEW_CODE) as string;
    for (const placeholder of ["<callee>", "<required>", "<provided>"]) {
      expect(
        message,
        `${ARITY_TOO_FEW_CODE}: Message template lost ${placeholder}`,
      ).toContain(placeholder);
    }
  });

  it("A: theta/parse/invoke-arity-too-many is registered and its Message carries <callee>, <max>, <provided>", () => {
    const row = REGISTRY.find((r) => r.code === ARITY_TOO_MANY_CODE);
    expect(
      row,
      `${ARITY_TOO_MANY_CODE} has no registry row — the code this file asserts is ` +
        "not registered (DIAG-2)",
    ).toBeDefined();
    const message = registryMessage(REGISTRY, ARITY_TOO_MANY_CODE) as string;
    for (const placeholder of ["<callee>", "<max>", "<provided>"]) {
      expect(
        message,
        `${ARITY_TOO_MANY_CODE}: Message template lost ${placeholder}`,
      ).toContain(placeholder);
    }
  });

  it("A: the two load-surface codes the constraint-4 cells anchor on are registered", () => {
    for (const code of [UNRESOLVABLE_THETA_PATH_CODE, CALLEE_HAS_ERRORS_CODE]) {
      expect(
        registryMessage(REGISTRY, code),
        `${code} has no registry row — cells B8/B9 anchor on its Message`,
      ).toBeTypeOf("string");
    }
  });
});

// ===========================================================================
// Cell B0 — the shared precondition guard. Every cell below reads one shared
// load outcome, so a failed discovery walk would red them all for a reason that
// is not bug 0071. `ctlcallable` resolves a `tools:` `.theta` entry and calls it
// at correct arity, so its registration witnesses both the walk and `tools:`
// resolution.
// ===========================================================================
describe("bug 0071 cell B0 — the production load path discovered the planted workspace", () => {
  it("B0: the correct-arity control theta registered", () => {
    expect(
      outcome.registered,
      "the discovery walk found nothing: the project `.pi/theta/` walk over the " +
        "planted workspace did not register the correct-arity control theta, so the " +
        "precondition every cell in this file depends on is unmet. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("ctlcallable");
  });
});

// ===========================================================================
// Cells B1–B3 — the three rejected `.theta`-callable call forms at one
// two-required callee. Each un-registers its caller and surfaces the registered
// message with `<callee>` rendered as the presented callable name.
// ===========================================================================
describe("bug 0071 cells B1-B3 — a `.theta`-callable call at wrong arity is rejected at load time", () => {
  it("B1: theta/parse/invoke-arity-too-many un-registers a 3-argument call at a 2-param callee", () => {
    expect(
      outcome.registered,
      "the `.theta`-callable call surface is not walked by the invoke static-check " +
        "pass, so a 3-argument call at a 2-param callee registered anyway. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("callabletoomany");
  });

  it("B1: theta/parse/invoke-arity-too-many surfaces `invoke 'twoparam' passes too many arguments: expected at most 2, got 3`", () => {
    expect(
      outcome.notifications,
      "no theta/parse/invoke-arity-too-many diagnostic surfaced for the " +
        "`.theta`-callable call form. Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(tooMany("twoparam", 2, 3));
  });

  it("B2: theta/parse/invoke-arity-too-few un-registers a 1-argument call at a 2-param callee", () => {
    expect(
      outcome.registered,
      "a 1-argument call at a 2-required-param callee registered anyway, deferring " +
        "the rejection to the callee-side runtime AJV net. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("callabletoofew");
  });

  it("B2: theta/parse/invoke-arity-too-few surfaces `invoke 'twoparam' passes too few arguments: expected 2 non-defaulted, got 1`", () => {
    expect(
      outcome.notifications,
      "no theta/parse/invoke-arity-too-few diagnostic surfaced for the " +
        "`.theta`-callable call form. Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(tooFew("twoparam", 2, 1));
  });

  it("B3: theta/parse/invoke-arity-too-few un-registers a zero-argument call at a 2-param callee", () => {
    expect(
      outcome.registered,
      "a zero-argument call at a 2-required-param callee registered anyway. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("callablezero");
  });

  it("B3: theta/parse/invoke-arity-too-few surfaces `invoke 'twoparam' passes too few arguments: expected 2 non-defaulted, got 0`", () => {
    expect(
      outcome.notifications,
      "no theta/parse/invoke-arity-too-few diagnostic surfaced for the " +
        "zero-argument `.theta`-callable call form. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(tooFew("twoparam", 2, 0));
  });
});

// ===========================================================================
// Cell B4 — the correct-arity control. It holds in both directions: the check
// must reject the three forms above and leave an exact-arity call alone. Its
// callee (`ctlcallee`) is referenced by this caller only, which is what makes
// the workspace-global absence assertion sound.
// ===========================================================================
describe("bug 0071 cell B4 — a correct-arity `.theta`-callable call registers with no arity diagnostic", () => {
  it("B4: the exact-arity caller registers", () => {
    expect(
      outcome.registered,
      "the exact-arity `.theta`-callable caller must register — the arity check " +
        "rejects wrong arity, not every `.theta`-callable call. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("ctlcallable");
  });

  it("B4: no arity diagnostic names the control's callee", () => {
    expect(
      arityMessagesNaming("ctlcallee"),
      "an arity diagnostic fired against a call that supplies exactly the callee's " +
        "2 declared params",
    ).toEqual([]);
  });
});

// ===========================================================================
// Cell B5 — a defaulted tail param lowers `requiredCount` below `totalCount`,
// so supplying fewer arguments than `params:` fields is legal. `<required>` is
// the count of non-defaulted fields, not the field count.
// ===========================================================================
describe("bug 0071 cell B5 — a call omitting a defaulted param is legal", () => {
  it("B5: the caller omitting the defaulted tail param registers", () => {
    expect(
      outcome.registered,
      "a 1-argument call at a callee whose second param is defaulted must register — " +
        "`requiredCount` is 1 there. Registered: " + JSON.stringify(outcome.registered),
    ).toContain("calldefaulted");
  });

  it("B5: no arity diagnostic names the defaulted-tail callee", () => {
    expect(
      arityMessagesNaming("defok"),
      "an arity diagnostic fired against a call that supplies every non-defaulted " +
        "param of its callee",
    ).toEqual([]);
  });
});

// ===========================================================================
// Cell B6 — the upper edge is bounded by `totalCount`, so a defaulted tail param
// widens what is accepted but does not remove the ceiling. Pairing this with B5
// at the same callee shape pins the two counts to different edges: a fix reading
// `requiredCount` for the ceiling would accept the 3-argument call.
// ===========================================================================
describe("bug 0071 cell B6 — too-many is still rejected at a callee with a defaulted param", () => {
  it("B6: theta/parse/invoke-arity-too-many un-registers a 3-argument call at a 2-field callee", () => {
    expect(
      outcome.registered,
      "a 3-argument call at a 2-field callee registered anyway; positional binding " +
        "has no destination for the third argument. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("calldefaultedtoomany");
  });

  it("B6: theta/parse/invoke-arity-too-many surfaces `invoke 'defparam' passes too many arguments: expected at most 2, got 3`", () => {
    expect(
      outcome.notifications,
      "no theta/parse/invoke-arity-too-many diagnostic surfaced, so the surplus " +
        "argument is discarded silently. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(tooMany("defparam", 2, 3));
  });
});

// ===========================================================================
// Cell B7 — the `as` rename plus the hyphen→underscore rewrite. The presented
// name `renamed` reaches the callee file `two-param-hyph.theta` through neither
// path: it has lost the rename AND the rewrite, so a check that re-derived a
// callee path from the presented name could not open the callee at all and would
// emit nothing. Only the frozen snapshot's `ResolvedThetaCallee.calleePath`
// (`src/parser/callable-set.ts`) reaches the file, and only the call site
// supplies the name the message renders.
// ===========================================================================
describe("bug 0071 cell B7 — an `as`-renamed hyphenated callee is resolved through the frozen snapshot", () => {
  it("B7: theta/parse/invoke-arity-too-few un-registers a 1-argument call through an `as` rename", () => {
    expect(
      outcome.registered,
      "the `as`-renamed `.theta`-callable call at wrong arity registered anyway. " +
        "Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("callrenamed");
  });

  it("B7: theta/parse/invoke-arity-too-few renders `<callee>` as the presented name `renamed`", () => {
    expect(
      outcome.notifications,
      "no theta/parse/invoke-arity-too-few diagnostic naming the presented callable " +
        "name surfaced for the `as`-renamed hyphenated callee. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(tooFew("renamed", 2, 1));
  });
});

// ===========================================================================
// Cells B8-B9 — a `tools:` entry that already failed carries its own rejection
// and must not attract a second, derived arity diagnostic on top of it. Both
// cells hold in both directions and pin the fix's blast radius: the arity check
// is reached only where the entry resolved to a readable, clean callee.
// ===========================================================================
describe("bug 0071 cells B8-B9 — a failed `tools:` entry raises no derived arity diagnostic", () => {
  it("B8: an unresolvable `.theta` entry un-registers its caller", () => {
    expect(
      outcome.registered,
      "the caller whose `tools:` entry points at a missing `.theta` must not register. " +
        "Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("callunresolvable");
  });

  it("B8: theta/load/unresolvable-theta-path is the only rejection the unresolvable entry raises", () => {
    expect(
      outcome.notifications,
      "theta/load/unresolvable-theta-path did not surface for the missing callee. " +
        "Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(
      expectedMessage(UNRESOLVABLE_THETA_PATH_CODE, { "<path>": "./nosuch.theta" }),
    );
    expect(
      arityMessagesNaming("nosuch"),
      "an arity diagnostic was derived from an entry that never resolved to a callee, " +
        "so the author gets two rejections for one fault",
    ).toEqual([]);
  });

  it("B9: a `.theta` callee carrying its own errors un-registers its caller", () => {
    expect(
      outcome.registered,
      "the caller whose `tools:` callee carries error-severity parse diagnostics must " +
        "not register. Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("callbroken");
  });

  it("B9: theta/load/callee-has-errors is the only rejection the erroring callee raises", () => {
    expect(
      outcome.notifications,
      "theta/load/callee-has-errors did not surface for the erroring callee. " +
        "Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(
      expectedMessage(CALLEE_HAS_ERRORS_CODE, { "<path>": "./brokenarity.theta" }),
    );
    expect(
      arityMessagesNaming("brokenarity"),
      "an arity diagnostic was derived from a callee whose own `params:` did not " +
        "type-check, so its param counts are not trustworthy input to the check",
    ).toEqual([]);
  });
});

// ===========================================================================
// Cell B10 — the `invoke(...)` surface is unchanged, and renders `<callee>` as
// the verbatim path literal. Read against B1-B2, which render the presented name
// at the same callee, this cell is the rendering-divergence pin: one callee, two
// call surfaces, two `<callee>` forms.
// ===========================================================================
describe("bug 0071 cell B10 — the `invoke(...)` surface still renders `<callee>` as the path literal", () => {
  it("B10: theta/parse/invoke-arity-too-few un-registers `invoke(\"./twoparam.theta\", \"a\")`", () => {
    expect(
      outcome.registered,
      "the `invoke(...)` arity rejection regressed. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("invtoofew");
  });

  it("B10: theta/parse/invoke-arity-too-few renders `<callee>` as `./twoparam.theta`", () => {
    expect(
      outcome.notifications,
      "the `invoke(...)` too-few message no longer renders the verbatim path literal. " +
        "Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(tooFew("./twoparam.theta", 2, 1));
  });

  it("B10: theta/parse/invoke-arity-too-many un-registers `invoke(\"./twoparam.theta\", \"a\", \"b\", \"c\")`", () => {
    expect(
      outcome.registered,
      "the `invoke(...)` arity rejection regressed. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("invtoomany");
  });

  it("B10: theta/parse/invoke-arity-too-many renders `<callee>` as `./twoparam.theta`", () => {
    expect(
      outcome.notifications,
      "the `invoke(...)` too-many message no longer renders the verbatim path literal. " +
        "Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(tooMany("./twoparam.theta", 2, 3));
  });
});

// ===========================================================================
// Cells B11-B15 — the same four rules one AST level deeper, inside a `par for`.
// control-flow.md CTRL-4 admits `invoke(...)`, `.theta` callable calls,
// `subagent fn` calls and Pi-tool calls in that body, so a call written there is
// a call site of both surfaces and carries the arity rule unchanged. All three
// `ParForExpr` operand positions — body, `max`, iterand — are reachable only
// through the `par-for` arm of the shared call-site walk, and each is descended
// into by its own statement in that arm: with the arm absent, `ParForExpr` is
// treated as a leaf and every call nested under it is invisible to the pass, and
// with any ONE of its three descents dropped only the cell over that position
// reds. B11 and B13 cover the body, B14 the `max` operand, B15 the iterand; B12
// stays green either way (which is why B12 alone is not a witness).
// ===========================================================================
describe("bug 0071 cells B11-B15 — the walk reaches calls in a `par for` body, its `max` operand and its iterand", () => {
  it("B11: theta/parse/invoke-arity-too-few un-registers a wrong-arity `.theta`-callable call inside a `par for` body", () => {
    expect(
      outcome.registered,
      "a `par for` body is not walked, so a 1-argument `.theta`-callable call at a " +
        "2-required-param callee registered anyway. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("parcallwrong");
  });

  it("B11: theta/parse/invoke-arity-too-few renders `<callee>` as the presented name inside a `par for` body", () => {
    expect(
      outcome.notifications,
      "no theta/parse/invoke-arity-too-few diagnostic surfaced for the " +
        "`.theta`-callable call inside the `par for` body. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(tooFew("parwrongcallee", 2, 1));
  });

  it("B12: a correct-arity `.theta`-callable call inside a `par for` body still registers", () => {
    expect(
      outcome.registered,
      "the `par for`-body arm rejects the construct itself rather than wrong arity " +
        "within it: the exact-arity caller must register. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("parcallok");
    expect(
      arityMessagesNaming("parokcallee"),
      "an arity diagnostic fired against a `par for`-body call that supplies exactly " +
        "the callee's 2 declared params",
    ).toEqual([]);
  });

  it("B13: theta/parse/invoke-arity-too-few un-registers an `invoke(...)` inside a `par for` body", () => {
    expect(
      outcome.registered,
      "the `invoke(...)` surface inside a `par for` body escaped the arity check. " +
        "Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("parinvoke");
  });

  it("B13: theta/parse/invoke-arity-too-few renders `<callee>` as `./parinvcallee.theta` inside a `par for` body", () => {
    expect(
      outcome.notifications,
      "no theta/parse/invoke-arity-too-few diagnostic naming the callee path surfaced " +
        "for the `invoke(...)` inside the `par for` body. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(tooFew("./parinvcallee.theta", 2, 1));
  });

  it("B14: theta/parse/invoke-arity-too-few un-registers an `invoke(...)` in the `par for` `max` operand", () => {
    expect(
      outcome.registered,
      "the `max` width operand is an ordinary expression position and is walked like " +
        "the iterand; a wrong-arity `invoke(...)` there registered anyway. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("parmax");
  });

  it("B14: theta/parse/invoke-arity-too-few renders `<callee>` as `./parmaxcallee.theta` from the `max` operand", () => {
    expect(
      outcome.notifications,
      "no theta/parse/invoke-arity-too-few diagnostic surfaced for the `invoke(...)` " +
        "in the `max` operand. Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(tooFew("./parmaxcallee.theta", 2, 1));
  });

  it("B15: theta/parse/invoke-arity-too-few un-registers a wrong-arity `.theta`-callable call in the `par for` iterand", () => {
    expect(
      outcome.registered,
      "the `par for` ITERAND is not walked, so a 1-argument `.theta`-callable call at " +
        "a 2-required-param callee registered anyway. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("pariter");
  });

  it("B15: theta/parse/invoke-arity-too-few renders `<callee>` as the presented name from the `par for` iterand", () => {
    expect(
      outcome.notifications,
      "no theta/parse/invoke-arity-too-few diagnostic surfaced for the " +
        "`.theta`-callable call in the `par for` iterand. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(tooFew("paritercallee", 2, 1));
  });
});

// ===========================================================================
// Cell C — `collectThetaCallableCallSites` called DIRECTLY, with no compose pass
// in the loop.
//
// The compose pass resolves its own call sites off the shared walk result it
// already holds, so this export has no in-tree consumer: it is retained as the
// reuse surface bug 0072 (`theta/parse/tool-arg-type-mismatch` over the same
// call surface) consumes, and every B cell above would stay green if it were
// deleted or silently reshaped. This block therefore pins its contract on its
// own terms — the four properties 0072 depends on: the `as`-renamed name/path
// split, the two exclusions, the absent-snapshot answer, and the walk's reach
// into a `par for` body.
//
// The `ThetaBody` comes from real theta source through `parseThetaDocument`, so
// the AST shapes the export walks are the ones the production parser emits
// rather than hand-built nodes that could drift from it. The
// `CallableSetSnapshot` is built directly as a frozen `{ entries: Map }` — the
// seam's own declared shape (`src/parser/callable-set.ts`) — so the block
// depends on no `tools:` resolution and reaches the export through the same
// argument the compose pass passes it.
// ===========================================================================

/** A `.theta` snapshot entry (`ResolvedThetaCallee`) carrying `calleePath`. */
function thetaEntry(calleePath: string): ResolvedCallable {
  return { kind: "theta", mode: "subagent", calleePath, callee: null };
}

/**
 * One caller body carrying all four shapes cell C reads: the `as`-renamed
 * `.theta` entry (B7's shape, with the hyphenated stem the presented name cannot
 * re-derive), a `pi-tool` entry's call site, a call to a name the snapshot does
 * not bind, and a `.theta`-callable call nested in a `par for` body.
 */
const UNIT_CALLER_SRC = theta(
  "---",
  "mode: subagent",
  "tools:",
  "  - ./two-param-hyph.theta as renamed",
  "  - ./nested-callee.theta as nested",
  "  - grep",
  "---",
  'renamed("a")',
  'grep({ pattern: "p" })',
  'unbound("a")',
  'par for a in ["a"] { nested("b") }',
);

/**
 * The frozen snapshot the export resolves against: two `.theta` entries whose
 * stored `calleePath` differs from their presented name, and one `pi-tool`
 * entry. `unbound` is deliberately absent.
 */
const UNIT_SNAPSHOT: CallableSetSnapshot = Object.freeze({
  entries: new Map<string, ResolvedCallable>([
    ["renamed", thetaEntry("./two-param-hyph.theta")],
    ["nested", thetaEntry("./nested-callee.theta")],
    ["grep", { kind: "pi-tool", toolDefinition: null }],
  ]),
});

/**
 * Parse the cell-C fixture, failing LOUDLY unless it produced the four
 * statements and exactly the one error-severity diagnostic it declares
 * (`theta/parse/unknown-identifier` for the deliberately unbound `unbound(...)`
 * call — the parse binds callable names from `tools:`, which cannot bind that
 * one). Any other diagnostic set means the body no longer has the shape the
 * assertions below read, so the block reds on the precondition naming itself
 * instead of asserting against a body it did not intend.
 */
function unitCallerBody(): ThetaBody {
  const source: ThetaSource = {
    path: "/theta-unit/unitcaller.theta",
    bytes: new TextEncoder().encode(UNIT_CALLER_SRC),
  };
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  const deps: ParseThetaDocumentDeps = { systemNote, modelMatcher };
  const document = parseThetaDocument(source, deps);
  const errorCodes = document.diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => d.code);
  expect(
    errorCodes,
    "the cell-C fixture no longer parses to its declared diagnostic set, so the " +
      "body below is not the one the assertions read. Diagnostics: " +
      JSON.stringify(document.diagnostics.map((d) => `${d.code}: ${d.message}`)),
  ).toEqual(["theta/parse/unknown-identifier"]);
  expect(
    document.body.statements.map((s) => s.kind),
    "the cell-C fixture no longer parses to its four call-bearing statements",
  ).toEqual(["tool-call", "tool-call", "tool-call", "expr"]);
  return document.body;
}

describe("bug 0071 cell C — `collectThetaCallableCallSites` resolves sites against a supplied snapshot", () => {
  it("C1: an `as`-renamed entry yields the presented name and the snapshot's STORED callee path", () => {
    const sites = collectThetaCallableCallSites(unitCallerBody(), UNIT_SNAPSHOT);
    const renamed = sites.find((site) => site.name === "renamed");
    expect(
      renamed,
      "no site was yielded for the `as`-renamed `.theta` entry, so the export drops " +
        "the call form B7 pins at the production surface. Yielded: " +
        JSON.stringify(sites.map((site) => site.name)),
    ).toBeDefined();
    expect(
      renamed?.calleePath,
      "`calleePath` was re-derived from the presented name instead of read off the " +
        "frozen snapshot entry, so it opens no file: the presented name has lost " +
        "both the `as` rename and the hyphen→underscore rewrite",
    ).toBe("./two-param-hyph.theta");
    expect(
      renamed?.call.args,
      "the yielded site must carry the call's own positional argument slots",
    ).toHaveLength(1);
  });

  it("C2: a `pi-tool` entry's call site and a call to an unbound name are both excluded", () => {
    const names = collectThetaCallableCallSites(unitCallerBody(), UNIT_SNAPSHOT).map(
      (site) => site.name,
    );
    expect(
      names,
      "a `pi-tool` callable-set entry's call site was yielded as a `.theta`-callable " +
        "call, so the arity rule would be applied to a callee that has no `params:`",
    ).not.toContain("grep");
    expect(
      names,
      "a call to a name the snapshot does not bind was yielded, so a local `fn`, an " +
        "import or an unresolved identifier would be treated as a `.theta` callee",
    ).not.toContain("unbound");
    expect(
      [...names].sort(),
      "the yielded set is not exactly the two `.theta` entries the snapshot binds",
    ).toEqual(["nested", "renamed"]);
  });

  it("C3: an absent callable set yields no sites", () => {
    expect(
      collectThetaCallableCallSites(unitCallerBody(), undefined),
      "a caller with no resolved `tools:` snapshot must yield no sites, not throw and " +
        "not fabricate one",
    ).toEqual([]);
  });

  it("C4: a call site nested inside a `par for` body is yielded", () => {
    const sites = collectThetaCallableCallSites(unitCallerBody(), UNIT_SNAPSHOT);
    const nested = sites.find((site) => site.name === "nested");
    expect(
      nested,
      "the export does not reach into a `par for` body, so it has a narrower walk " +
        "than the compose pass and bug 0072 would silently miss those sites. " +
        "Yielded: " + JSON.stringify(sites.map((site) => site.name)),
    ).toBeDefined();
    expect(
      nested?.calleePath,
      "the `par for`-body site resolved to the wrong snapshot entry",
    ).toBe("./nested-callee.theta");
  });
});
