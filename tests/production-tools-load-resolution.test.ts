import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { ThetaFixture } from "../src/extension/factory";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";

// V20a-T — failing tests for the paired `V20a` "`tools:` load-time resolution
// wiring" implementation leaf.
//
// Convention: conventions.md (end-to-end harness; hardening/production-wiring
// realisation of an already-closed code-keyed area). Narrative spec references:
// frontmatter/frontmatter-fields-a.md (§`tools` callable set, FRNT-2/FRNT-3),
// invocation.md (`theta/load/callee-has-errors`). Closes no new spec REQ-ID.
//
// Bucket A — implemented-not-wired: `resolveCallableSet`
// (src/parser/callable-set.ts) exists and is exercised in isolation by
// tests/callable-set.test.ts, but it is never called on the PRODUCTION load /
// discovery path. `discoverAndComposeFixtures` (the shipped `session_start`
// composition root) parses each discovered `.theta` and composes it into a
// runnable fixture WITHOUT resolving its `tools:` callable set, so no
// `tools:`-resolution diagnostic ever fires against the shipped extension and a
// theta whose `tools:` is malformed is registered anyway.
//
// These tests drive that production load path over a real on-disk discovery
// source (the project `.pi/theta/` walk over the real `V8b` `PiFileSystem`),
// with a Pi tool registry threaded to load time (the shipped built-in tool set
// resolved against `ctx.cwd`). Each test reds today on its own primary
// assertion — the malformed-`tools:` theta is still registered (its fixture is
// returned) and its rejection diagnostic is never surfaced — NOT on a compile
// error, missing fixture, or harness throw. The paired `V20a` implementation
// wires `resolveCallableSet` into the load path and turns these green.
//
// Diagnostic *Message* strings are sourced verbatim from the diagnostics
// registry (diagnostics/code-registry-load.md) per the conventions.md
// *Diagnostic message anchors* rule; each asserting test cites its diagnostic
// code inline.

// --- Registry Message strings (diagnostics/code-registry-load.md) -----------
// The author-visible rejection message each `tools:`-resolution diagnostic
// renders. Sourced from the *Message* column so the assertions anchor on the
// exact string the shipped load path must surface.
const MSG = {
  // `theta/load/unknown-tool`
  unknownTool: "unknown Pi tool 'totally_unknown_xyz'",
  // `theta/load/prompt-mode-callable`
  promptModeCallable:
    "'tools:' entry './child.theta' points at a prompt-mode theta; only subagent-mode thetas are permitted",
  // `theta/load/tool-name-collision`
  toolNameCollision:
    "tool name 'dup' collides with another 'tools:' entry, top-level fn, or import",
  // `theta/load/invalid-tool-rename`
  invalidToolRename: "'as BadName' rename target must be lowercase-first; got 'BadName'",
  // `theta/load/invalid-derived-tool-name`
  invalidDerivedToolName:
    "'tools:' entry './2fast.theta' derives the default name '2fast', " +
    "which must be lowercase-first; rename the file or add an 'as' clause",
  // `theta/load/callee-has-errors`
  calleeHasErrors: "callee './broken.theta' has errors; see related diagnostics",
  // `theta/parse/invoke-arity-too-many` (diagnostics/code-registry-parse.md) —
  // the `.theta`-callable call surface renders `<callee>` as the presented
  // callable name written at the call site, not as the callee path.
  callableArityTooMany:
    "invoke 'b71callee' passes too many arguments: expected at most 2, got 3",
  // `theta/parse/invoke-arity-too-few`
  callableArityTooFew:
    "invoke 'b71callee' passes too few arguments: expected 2 non-defaulted, got 1",
  // `theta/parse/invoke-arity-too-few` at a zero-argument call site
  callableArityZeroArgs:
    "invoke 'b71callee' passes too few arguments: expected 2 non-defaulted, got 0",
} as const;

// --- Planted discovery workspace -------------------------------------------

interface PlantedTheta {
  readonly stem: string;
  readonly text: string;
}

function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}

/**
 * The `.theta` files planted under the project discovery source. Each malformed
 * theta pairs one `tools:`-resolution rejection with a positive control that
 * MUST still register, so the test distinguishes "the wiring rejects the bad
 * theta" from "the wiring rejects everything".
 */
const THETAS: readonly PlantedTheta[] = [
  // A control theta whose `tools:` resolves cleanly (a known built-in Pi tool):
  // registers today and after `V20a`.
  { stem: "goodtool", text: theta("---", "mode: prompt", "tools: read", "---", "@`hi`") },

  // `theta/load/unknown-tool`: a `tools:` entry naming a Pi tool absent from the
  // threaded registry.
  {
    stem: "unknowntool",
    text: theta("---", "mode: prompt", "tools: totally_unknown_xyz", "---", "@`hi`"),
  },

  // `theta/load/prompt-mode-callable`: a `.theta` callee that is prompt-mode.
  {
    stem: "promptcallee",
    text: theta("---", "mode: subagent", "tools:", "  - ./child.theta", "---", "@`hi`"),
  },
  // The prompt-mode callee `promptcallee` points at (valid on its own merits —
  // registers as `/child`).
  { stem: "child", text: theta("---", "mode: prompt", "---", "@`child`") },

  // `theta/load/tool-name-collision`: two `tools:` entries resolve to `dup`.
  {
    stem: "collision",
    text: theta("---", "mode: prompt", "tools:", "  - read as dup", "  - grep as dup", "---", "@`hi`"),
  },
  // Positive control: an `as` rename disambiguates, so the theta registers.
  {
    stem: "renameresolves",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - read as reader",
      "  - grep as searcher",
      "---",
      "@`hi`",
    ),
  },

  // `theta/load/invalid-tool-rename`: a non-theta-identifier `as` rename target.
  {
    stem: "badrename",
    text: theta("---", "mode: prompt", "tools:", "  - read as BadName", "---", "@`hi`"),
  },

  // `theta/load/invalid-derived-tool-name`: a `.theta` entry whose DERIVED
  // default name is not lowercase-first, so the callable it mints has no
  // bare-identifier spelling in theta code (bug 0070).
  {
    stem: "digitdefault",
    text: theta("---", "mode: subagent", "tools:", "  - ./2fast.theta", "---", "@`hi`"),
  },
  // The digit-leading callee both `digitdefault` and `digitrenamed` point at.
  // Valid on its own merits: the discovery stem regex `^[a-z0-9][a-z0-9_-]*$`
  // admits a leading digit, so it registers as `/2fast`.
  { stem: "2fast", text: theta("---", "mode: subagent", "---", "@`fast`") },
  // Positive control: the `as` override supplies the presented name, so the
  // derived name is never used and the theta registers.
  {
    stem: "digitrenamed",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./2fast.theta as fast",
      "---",
      "@`hi`",
    ),
  },

  // `theta/load/callee-has-errors`: a subagent-mode `.theta` callee that itself
  // carries an error-severity load/parse diagnostic.
  {
    stem: "calleeerrors",
    text: theta("---", "mode: subagent", "tools:", "  - ./broken.theta", "---", "@`hi`"),
  },
  // The erroring callee `calleeerrors` points at: subagent-mode (so NOT
  // prompt-mode-callable) but carrying `theta/parse/unresolved-named-type`.
  {
    stem: "broken",
    text: theta("---", "mode: subagent", "params:", "  x: NoSuchType", "---", "@`broken`"),
  },

  // Bug 0071 — `theta/parse/invoke-arity-too-few` / `-too-many` over the
  // `.theta`-callable call surface. The `b71` stem prefix keeps this group's
  // callee names disjoint from every other planted theta: `ctx.ui.notify`
  // carries the message text with no caller attribution, so a cell asserting
  // the absence of an arity diagnostic is sound only when its callee name
  // cannot occur in a sibling group's message.
  //
  // The callee for the three rejected call forms: two non-defaulted `params:`,
  // so `requiredCount` and `totalCount` are both 2.
  {
    stem: "b71callee",
    text: theta("---", "mode: subagent", "params:", "  x: string", "  y: string", "---", "@`hi`"),
  },
  {
    stem: "b71toomany",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./b71callee.theta",
      "---",
      'b71callee("a", "b", "c")?',
      "@`hi`",
    ),
  },
  {
    stem: "b71toofew",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./b71callee.theta",
      "---",
      'b71callee("a")?',
      "@`hi`",
    ),
  },
  {
    stem: "b71zero",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./b71callee.theta",
      "---",
      "b71callee()?",
      "@`hi`",
    ),
  },
  // The correct-arity control's own callee, referenced by `b71ctl` alone.
  {
    stem: "b71ctlcallee",
    text: theta("---", "mode: subagent", "params:", "  x: string", "  y: string", "---", "@`hi`"),
  },
  {
    stem: "b71ctl",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./b71ctlcallee.theta",
      "---",
      'b71ctlcallee("a", "b")?',
      "@`hi`",
    ),
  },
  // A defaulted tail param lowers `requiredCount` to 1, so the 1-argument call
  // in `b71def` supplies every non-defaulted param and is legal.
  {
    stem: "b71defcallee",
    text: theta(
      "---",
      "mode: subagent",
      "params:",
      "  x: string",
      '  y: string = "d"',
      "---",
      "@`hi`",
    ),
  },
  {
    stem: "b71def",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./b71defcallee.theta",
      "---",
      'b71defcallee("a")?',
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
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-v20a-"));
  const projectThetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(projectThetaDir, { recursive: true });
  for (const l of THETAS) {
    writeFileSync(join(projectThetaDir, `${l.stem}.theta`), l.text, "utf8");
  }
  // A minimal valid settings file — noise suppression for the bug-0013
  // warning surface, NOT behaviour under test: without it the headless
  // helper path mirrors a `theta/load/settings-unreadable` WARNING for the
  // workspace's absent `.pi/settings.json` to real stderr in every
  // `npm test` run.
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
  outcome = await runProductionLoad(workspaceDir);
});

afterAll(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});

// A precondition guard shared by every bullet: the discovery walk found the
// planted thetas at all (so a red below is a `tools:`-resolution red, never an
// empty-walk / setup red). `goodtool`'s clean `tools: read` must always
// register.
describe("V20a-T — production load path discovered the planted workspace", () => {
  it("registers the clean control theta whose `tools:` resolves (goodtool)", () => {
    expect(
      outcome.registered,
      "the project `.pi/theta/` discovery walk did not register the clean control theta — " +
        "the setup precondition is unmet. Registered: " + JSON.stringify(outcome.registered),
    ).toContain("goodtool");
  });
});

// ===========================================================================
// Tests bullet 1 — `theta/load/unknown-tool` (cka-11 FRNT area, owned on V6c).
// A `tools:` entry naming a Pi tool absent from the threaded registry is
// rejected at PRODUCTION load time. Reds today: unwired — the theta registers
// and no diagnostic fires.
// ===========================================================================
describe("V20a-T — theta/load/unknown-tool rejected at production load time", () => {
  it("theta/load/unknown-tool: an unknown Pi tool in `tools:` un-registers the theta at load time", () => {
    expect(
      outcome.registered,
      "resolveCallableSet is not wired into the production load path: the theta whose " +
        "`tools:` names an unknown Pi tool was registered anyway. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("unknowntool");
  });

  it("theta/load/unknown-tool: the load path surfaces the registry rejection message", () => {
    expect(
      outcome.notifications,
      "no theta/load/unknown-tool diagnostic surfaced — the shipped load path never resolves " +
        "the `tools:` callable set. Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(MSG.unknownTool);
  });
});

// ===========================================================================
// Tests bullet 2 — `theta/load/prompt-mode-callable` (owned on V6c). A
// prompt-mode `.theta` callee in `tools:` is rejected at production load time.
// ===========================================================================
describe("V20a-T — theta/load/prompt-mode-callable rejected at production load time", () => {
  it("theta/load/prompt-mode-callable: a prompt-mode `.theta` callee in `tools:` un-registers the parent", () => {
    expect(
      outcome.registered,
      "the parent theta naming a prompt-mode `.theta` callee in `tools:` was registered anyway — " +
        "resolveCallableSet is unwired on the load path. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("promptcallee");
  });

  it("theta/load/prompt-mode-callable: the load path surfaces the registry rejection message", () => {
    expect(
      outcome.notifications,
      "no theta/load/prompt-mode-callable diagnostic surfaced. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(MSG.promptModeCallable);
  });
});

// ===========================================================================
// Tests bullet 3 — `theta/load/tool-name-collision` (owned on V6c). A `tools:`
// name collision fires at production load time; an `as` rename resolves.
// ===========================================================================
describe("V20a-T — theta/load/tool-name-collision fires at production load time", () => {
  it("theta/load/tool-name-collision: two `tools:` entries resolving to one name un-register the theta", () => {
    expect(
      outcome.registered,
      "the theta whose two `tools:` entries collide on one name was registered anyway. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("collision");
  });

  it("theta/load/tool-name-collision: the load path surfaces the registry rejection message", () => {
    expect(
      outcome.notifications,
      "no theta/load/tool-name-collision diagnostic surfaced. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(MSG.toolNameCollision);
  });

  it("theta/load/tool-name-collision: an `as` rename resolves the collision — the theta registers", () => {
    // Green today (nothing rejects it) and after V20a (a clean callable set): the
    // positive control proves V20a rejects the collision case specifically, not
    // every `as`-renamed `tools:` theta.
    expect(
      outcome.registered,
      "the `as`-disambiguated theta must still register. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("renameresolves");
  });
});

// ===========================================================================
// Tests bullet 4 — `theta/load/invalid-tool-rename` (owned on V6c). A
// non-theta-identifier `as` rename target is rejected at production load time.
// ===========================================================================
describe("V20a-T — theta/load/invalid-tool-rename rejected at production load time", () => {
  it("theta/load/invalid-tool-rename: a non-identifier `as` target un-registers the theta", () => {
    expect(
      outcome.registered,
      "the theta whose `as` rename target is not theta-identifier-shaped was registered anyway. " +
        "Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("badrename");
  });

  it("theta/load/invalid-tool-rename: the load path surfaces the registry rejection message", () => {
    expect(
      outcome.notifications,
      "no theta/load/invalid-tool-rename diagnostic surfaced. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(MSG.invalidToolRename);
  });
});

// ===========================================================================
// Tests bullet 5 — `theta/load/callee-has-errors` (cka-14 INV area, owned on
// V15f). A `tools:` `.theta` callee that itself carries error-severity
// load/parse diagnostics is rejected at production load time (E severity — the
// callable cannot be created and the parent does not register).
// ===========================================================================
describe("V20a-T — theta/load/callee-has-errors rejected at production load time", () => {
  it("theta/load/callee-has-errors: an erroring `.theta` callee in `tools:` un-registers the parent", () => {
    expect(
      outcome.registered,
      "the parent theta naming an erroring `.theta` callee in `tools:` was registered anyway — " +
        "the `tools:` static-resolution pass is unwired on the load path. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("calleeerrors");
  });

  it("theta/load/callee-has-errors: the load path surfaces the registry rejection message", () => {
    expect(
      outcome.notifications,
      "no theta/load/callee-has-errors diagnostic surfaced. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(MSG.calleeHasErrors);
  });
});

// ===========================================================================
// Bug 0070 — `theta/load/invalid-derived-tool-name`. The presented name of a
// `.theta` entry comes from the `as` override or from the derived default, and
// the lowercase-first identifier rule
// (frontmatter/frontmatter-fields-a.md §`tools`) governs both, but at the
// baseline only the `as` override was checked. A derived name outside that
// rule was bound into the frozen callable set, offered to the model and
// counted for collision detection, while theta code had no bare-identifier
// form for it (tool-calls.md §opening). The paired cell keeps the gate honest
// in both directions: the derived name un-registers, the `as` override
// registers.
// ===========================================================================
describe("V20a-T — theta/load/invalid-derived-tool-name rejected at production load time", () => {
  it("theta/load/invalid-derived-tool-name: a digit-leading derived default name un-registers the theta", () => {
    expect(
      outcome.registered,
      "the theta whose `tools:` entry derives the unspellable callable name " +
        "`2fast` was registered anyway. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("digitdefault");
  });

  it("theta/load/invalid-derived-tool-name: the load path surfaces the registry rejection message", () => {
    expect(
      outcome.notifications,
      "no theta/load/invalid-derived-tool-name diagnostic surfaced, so the only " +
        "signal the author gets is a parse error at their own call site. " +
        "Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(MSG.invalidDerivedToolName);
  });

  it("theta/load/invalid-derived-tool-name: an `as` override resolves it — the theta registers", () => {
    // Green today (nothing rejects it) and after the fix (the override supplies
    // the presented name): the positive control proves the rule rejects the
    // derived name specifically, not every entry naming a digit-leading callee.
    expect(
      outcome.registered,
      "the `as`-overridden theta must still register. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("digitrenamed");
  });
});

// ===========================================================================
// Bug 0071 — `theta/parse/invoke-arity-too-few` / `-too-many` over the
// `.theta`-callable call surface. `docs/spec_topics/tool-calls.md`
// §"Argument shape" binds both codes to both call surfaces by name — they
// "apply equally to a `.theta` callable call" — and one shared call-site walk
// carries both surfaces into the compose pass: `collectInvokeExprs` and the
// `.theta`-callable-call resolution read the same traversal result, which the
// INV-3 arity block of `checkInvokeStaticResolution` consumes.
//
// The three rejected forms are pinned here; the correct-arity control and the
// defaulted-param callee hold green in both directions, so the arity check is
// pinned to wrong arity rather than to the `.theta`-callable call form itself.
// The full matrix — the `as` rename, the hyphen→underscore rewrite, the
// already-failed `tools:` entry, and the `invoke(...)` rendering divergence —
// lives in `tests/theta-callable-call-arity.test.ts`.
// ===========================================================================
describe("bug 0071 — `.theta`-callable call arity rejected at production load time", () => {
  it("theta/parse/invoke-arity-too-many: a 3-argument `.theta`-callable call at a 2-param callee un-registers the caller", () => {
    expect(
      outcome.registered,
      "the arity check does not reach the `.theta`-callable call surface: the caller " +
        "passing 3 arguments to a 2-param callee was registered anyway. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("b71toomany");
  });

  it("theta/parse/invoke-arity-too-many: the load path surfaces the registry rejection message", () => {
    expect(
      outcome.notifications,
      "no theta/parse/invoke-arity-too-many diagnostic surfaced, so the surplus " +
        "argument is discarded with no signal at either phase. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(MSG.callableArityTooMany);
  });

  it("theta/parse/invoke-arity-too-few: a 1-argument `.theta`-callable call at a 2-param callee un-registers the caller", () => {
    expect(
      outcome.registered,
      "the caller passing 1 argument to a 2-non-defaulted-param callee was registered " +
        "anyway, deferring the rejection to the callee-side runtime AJV net. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("b71toofew");
  });

  it("theta/parse/invoke-arity-too-few: the load path surfaces the registry rejection message", () => {
    expect(
      outcome.notifications,
      "no theta/parse/invoke-arity-too-few diagnostic surfaced for the " +
        "`.theta`-callable call form. Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(MSG.callableArityTooFew);
  });

  it("theta/parse/invoke-arity-too-few: a zero-argument `.theta`-callable call at a 2-param callee un-registers the caller", () => {
    expect(
      outcome.registered,
      "the caller passing no arguments to a 2-non-defaulted-param callee was registered " +
        "anyway. Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("b71zero");
  });

  it("theta/parse/invoke-arity-too-few: the zero-argument call renders `got 0`", () => {
    expect(
      outcome.notifications,
      "no theta/parse/invoke-arity-too-few diagnostic surfaced for the zero-argument " +
        "`.theta`-callable call form. Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(MSG.callableArityZeroArgs);
  });

  it("theta/parse/invoke-arity-*: a correct-arity `.theta`-callable call registers", () => {
    // Green today (nothing rejects it) and after the fix (the arity matches):
    // the control proves the check rejects wrong arity specifically, not every
    // `.theta`-callable call.
    expect(
      outcome.registered,
      "the exact-arity `.theta`-callable caller must still register. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("b71ctl");
    expect(
      outcome.notifications.filter(
        (n) => n.includes("b71ctlcallee") && n.includes("passes too"),
      ),
      "an arity diagnostic fired against a call supplying exactly the callee's 2 " +
        "declared params",
    ).toEqual([]);
  });

  it("theta/parse/invoke-arity-too-few: a call omitting a defaulted param registers", () => {
    // `<required>` counts non-defaulted `params:` fields, not fields; a
    // defaulted tail param makes the 1-argument call legal. Green in both
    // directions.
    expect(
      outcome.registered,
      "the caller omitting its callee's defaulted tail param must still register. " +
        "Registered: " + JSON.stringify(outcome.registered),
    ).toContain("b71def");
    expect(
      outcome.notifications.filter(
        (n) => n.includes("b71defcallee") && n.includes("passes too"),
      ),
      "an arity diagnostic fired against a call supplying every non-defaulted param " +
        "of its callee",
    ).toEqual([]);
  });
});
