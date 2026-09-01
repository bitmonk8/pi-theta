import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { ThetaFixture } from "../src/extension/factory";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
import {
  resolveCallableSet,
  type CallableSetDeps,
  type CallableSetResult,
  type ResolvedPiTool,
  type ResolvedThetaCallee,
  type ToolsField,
} from "../src/parser/callable-set";
import type { Diagnostic } from "../src/diagnostics/diagnostic";

// Bug 0108 — a `tools:` entry's presented name comes from one of two sources,
// and at the baseline probed below the lowercase-first rule both sources share
// is applied to only one of them. `resolveCallableSet`
// (src/parser/callable-set.ts) merges the two sources at `const name =
// parsed.rename ?? resolution.defaultName` (src/parser/callable-set.ts:222) and
// then tests the merged
// name against `isLowercaseFirstIdentifier` (:443, `/^[a-z_][A-Za-z0-9_]*$/`)
// under a conjunct that scopes the test to one arm: `resolution.callable.kind
// === "theta"` (:244). The Pi-tool arm's default name is the host registry name
// verbatim (`resolveEntry`, the return at :379 under the comment "A Pi-tool
// entry's default name is the Pi tool name verbatim"), so it is admitted
// unexamined. Because the arm split is `isBareIdentifier` (:433,
// `/^[A-Za-z_][A-Za-z0-9_]*$/`), the class that reaches the Pi-tool arm and
// fails the rule is exactly `[A-Z][A-Za-z0-9_]*`: an uppercase-first bare
// identifier. `tools: WebSearch` against a registry snapshot holding
// `WebSearch` therefore registers with zero diagnostics and binds the callable
// `WebSearch`, while `tools: WebSearch as WebSearch` — the identical final
// name — is refused `theta/load/invalid-tool-rename`
// (docs/bugs/0108-uppercase-pi-tool-name-mints-unspellable-callable.md).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/frontmatter/frontmatter-fields-a.md:81 — "Each entry is
//     exposed under a single name in the theta's top-level scope (and to the
//     model as a tool of the same name). Naming rules:" — the bullet that heads
//     BOTH naming sources.
//   - :83 — "For a Pi tool, the entry's name is the Pi tool name verbatim." The
//     one naming bullet stating no shape rule, and the site of this defect.
//   - :84 — the derived-default bullet, which gives the rule's reason: the
//     hyphen remap "exists because theta-file naming convention favours hyphens
//     while theta identifiers must be lowercase-first identifier-shaped". The
//     clause after `while` is a statement about theta identifiers, not about
//     `.theta` basenames.
//   - :85 — "The `as <name>` clause overrides the default for either kind …
//     The override target must obey theta's lowercase-first identifier rule."
//     The same rule at the sibling source, enforced for BOTH kinds — the
//     asymmetry this file pins.
//   - :78 — the registry snapshot is `pi.getAllTools()` and "the list above is
//     an open example, not a fixed set", which is what makes an uppercase-first
//     registry name reachable at all: `resolveRegistryExtensionTool`
//     (src/extension/production-composition.ts) matches `tool.name === name`
//     with no shape constraint, and the closed built-in switch
//     (`builtinToolDefinition`, seven lowercase-first names) cannot produce one.
//   - docs/spec_topics/lexical.md:15 — PascalCase is REQUIRED for schema names,
//     enum names, enum variant names "and any user identifier introduced as a
//     type-like binding"; :16 — lowercase-first is required for every value-position
//     binding the page enumerates; :18 — in a `match` pattern "an uppercase
//     identifier refers to an existing schema, enum, or constructor in scope".
//     A callable-set entry is none of those three, so an uppercase-first
//     callable name occupies the type-like regime while binding in the value one.
//   - :86 — two entries resolving to one final name are
//     `theta/load/tool-name-collision`, whose top-level arm names a `fn`
//     declaration or an imported symbol only. That rule is sufficient ONLY
//     while every callable name is lowercase-first and every schema / enum name
//     is PascalCase; an uppercase-first callable breaks the disjointness it
//     rests on, which is why group (C6) pins the ordering between the two.
//   - docs/spec_topics/tool-calls.md:3 — a callable is called "via the
//     bare-identifier form `<name>(args)`, where `<name>` is an entry in the
//     theta's *callable set*".
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:74 (DIAG-4) — the
//     registry *Message* column is normative and an asserting test sources its
//     string from there; :72 (DIAG-2) — a code addition is a spec change routed
//     through the GOV-15 diagnostic-registry carve-out
//     (docs/spec_topics/governance/source-language-stability.md:25).
//
// THE PINNED POST-FIX CONTRACT. A `tools:` entry with no `as` clause whose
// resolved callable is a Pi tool and whose registry name is not lowercase-first
// raises an error-severity `theta/load/invalid-pi-tool-name` — a NEW registered
// code, not a generalisation of `theta/load/invalid-derived-tool-name`, because
// DIAG-4 defers a *Message* reword to theta 2.0 and that row's *Message* binds
// `<path>`, asserts a basename derivation and tells the author to rename a
// file, all three false for a Pi tool that has no file and performs no
// derivation. The disposition is REFUSAL, not auto-derivation: `registered`
// is `false`, `callableSet` is `undefined`, and the whole theta un-registers,
// matching the all-or-nothing posture of every sibling `tools:` code. The check
// sits at the merge point (`const name = parsed.rename ??
// resolution.defaultName`), AFTER the existing `.theta` derived-name arm and
// BEFORE the collision test, guarded on `parsed.rename === undefined` and on
// the arm discriminant read off the `EntryResolution` the resolver already
// computed (`resolution.callable.kind === "pi-tool"`) rather than re-derived
// from `parsed.spec`. `isBareIdentifier`'s arm split is untouched, so the
// hyphenated, dotted and digit-leading registry names keep their current
// (separately-defective, separately-unfiled) `theta/load/unresolvable-theta-path`
// framing.
//
// PROBED CURRENT SIGNATURES (HEAD c33dcdc9, offline, deterministic,
// resolver-direct with the same name in the `piTools` stand-in and in `tools:`):
//
//   "WebSearch"    registered=true   keys=["WebSearch"]   diags=[]
//   "Read"         registered=true   keys=["Read"]        diags=[]
//   "WEBSEARCH"    registered=true   keys=["WEBSEARCH"]   diags=[]
//   "X"            registered=true   keys=["X"]           diags=[]
//   "_Under"       registered=true   keys=["_Under"]      diags=[]   [CONFORMING]
//   "web-search"   registered=false  theta/load/unresolvable-theta-path
//   "web.search"   registered=false  theta/load/unresolvable-theta-path
//   "9tool"        registered=false  theta/load/unresolvable-theta-path
//   "Web Search"   registered=false  theta/load/malformed-tool-entry
//   WebSearch as websearch            registered=true   keys=["websearch"]
//   WebSearch as WebSearch            registered=false  theta/load/invalid-tool-rename
//   WebSearch [empty registry]        registered=false  theta/load/unknown-tool
//   WebSearch + reservedNames=[WebSearch]  registered=false  theta/load/tool-name-collision
//
// WHAT IS RED AT THIS BASELINE AND WHY — the record of what each cell
// witnesses. Group (A) is red because the code carries no registry row, so the
// DIAG-4 lookup itself has no normative string to source: that is the
// correct-reason red for a cell whose whole subject is the row's existence, and
// every message-asserting cell below falls back to the pinned template while
// the row is absent so it reds on BEHAVIOUR rather than on a rendering miss.
// Group (B)'s single production-load cell is red twice — the uppercase-first
// caller is in the registered set, and no diagnostic naming it reaches
// `ctx.ui.notify`. Group (C1) and (C2) are red on `resolveCallableSet`
// returning `registered: true` with the non-conforming key bound and no
// diagnostic. (C6) is red on `theta/load/tool-name-collision` firing in place
// of the new code — the masking the ordering pin forbids.
//
// GREEN BY DESIGN and required to stay green (the controls that prove the check
// rejects an uppercase-first Pi-tool registry name SPECIFICALLY, and not some
// wider class): the group (B) precondition guard; `_Under` still registering (a
// leading `_` IS lowercase-first, so this cell reds if the predicate is widened
// to "isBareIdentifier minus a lowercase letter"); `WebSearch as websearch`
// registering under `websearch` — the escape hatch the *Message* points at; all
// seven host built-ins still registering; `web-search`, `web.search`, `9tool`
// and `Web Search` keeping their current codes and messages verbatim, so the
// `isBareIdentifier` arm split is undisturbed; `WebSearch as WebSearch` keeping
// `theta/load/invalid-tool-rename` and `WebSearch` against an empty registry
// keeping `theta/load/unknown-tool`, both because their arms `continue` out
// before the merge point; and the `.theta` arm's own rows unchanged.
//
// TIER: unit, offline, provider-free, deterministic — in two halves, mirroring
// the sibling witness `tests/tools-derived-name-shape.test.ts`. Group (B)
// drives the production compose helper `discoverAndComposeFixtures` over a real
// on-disk `.pi/theta/` discovery workspace with a `pi.getAllTools()` double,
// because no shipped test supplies an uppercase-first name to that double and
// the registry snapshot is the ONLY admission route that can produce one — the
// built-in ladder is a closed switch over seven lowercase-first names, so only
// the extension-registry arm demonstrates the input is reachable at all. Group
// (C) calls `resolveCallableSet` directly, because the ordering pin against the
// collision test needs `reservedNames` injected — a value the load path derives
// from the caller's own top-level scope and cannot be planted independently of
// the entry. A third, live tier — `tests/live/uppercase-pi-tool-name-refusal-live.test.ts`
// (H8a-T) — witnesses the same observable through a real `AgentSession`: a
// throwaway third-party pi extension registers an uppercase-first host tool
// name, loaded via `bootShippedExtension`'s additive `extraExtensionPaths`
// option, and the cell asserts registration presence/absence off the settled
// `ExtensionRunner` (no model turn, zero tokens beyond credential resolution).
// It adds what these offline halves cannot supply on their own: a genuine
// `pi.getAllTools()` snapshot aggregating a real extension's `registerTool`
// call — the only admission route that can produce an uppercase-first name at
// all, since `builtinToolDefinition` is a closed switch over seven
// lowercase-first names.
//
// NO SILENT SKIPPING: the group (B) precondition guard asserts both that the
// discovery walk registered its clean control and that the `tools:` resolution
// pass runs at all, so an empty walk reds by name instead of letting the
// `not.toContain` assertion pass vacuously.

// --- Registry Message strings (diagnostics/code-registry-load.md) -----------

/** The live sharded load registry — the *Message* column DIAG-4 makes normative. */
const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../docs/spec_topics/diagnostics/code-registry-load.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

// Bug 0320's fix moved `theta/parse/invoke-non-theta-extension` (a PARSE code)
// in front of the `.theta`-path arm's `resolveThetaCallee` call, so the C5 test
// below now needs the PARSE registry page's Message, not the LOAD page's.
const PARSE_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/** Source a code's registered *Message* template and fill its `<…>` placeholders. */
function expectedMessage(
  code: string,
  subs: Readonly<Record<string, string>>,
): string {
  let message = registryMessage(REGISTRY, code) as string;
  for (const [placeholder, value] of Object.entries(subs)) {
    // `replaceAll` — the rename template repeats `<name>`.
    message = message.replaceAll(placeholder, value);
  }
  return message;
}

/** The new code this report registers: the Pi-tool arm's own name-shape rule. */
const INVALID_PI_TOOL_CODE = "theta/load/invalid-pi-tool-name";
const INVALID_DERIVED_CODE = "theta/load/invalid-derived-tool-name";
const INVALID_RENAME_CODE = "theta/load/invalid-tool-rename";
const COLLISION_CODE = "theta/load/tool-name-collision";
const UNKNOWN_TOOL_CODE = "theta/load/unknown-tool";
const UNRESOLVABLE_PATH_CODE = "theta/load/unresolvable-theta-path";
const MALFORMED_ENTRY_CODE = "theta/load/malformed-tool-entry";
const INVOKE_NON_THETA_EXTENSION_CODE = "theta/parse/invoke-non-theta-extension";

/** Source a code's registered *Message* template from the PARSE registry page. */
function parseExpectedMessage(
  code: string,
  subs: Readonly<Record<string, string>>,
): string {
  let message = registryMessage(PARSE_REGISTRY, code) as string;
  for (const [placeholder, value] of Object.entries(subs)) {
    message = message.replaceAll(placeholder, value);
  }
  return message;
}

/**
 * The *Message* template the new registry row must carry. It names the host
 * registry name and the `as` escape hatch, and speaks of neither a file nor a
 * derivation — the falseness that rules out reusing
 * `theta/load/invalid-derived-tool-name`'s row under DIAG-4.
 */
const PINNED_TEMPLATE =
  "'tools:' entry '<name>' names a Pi tool whose registry name is not " +
  "lowercase-first; add an 'as' clause";

/**
 * The template every message assertion in groups (B) and (C) renders. It reads
 * the registry, which is the DIAG-4 authority, and falls back to the pinned
 * template only while the row is absent — otherwise a `registryMessage` miss
 * would yield `undefined`, and every cell below would red on a rendering
 * failure instead of on the behaviour it exists to witness. Group (A) asserts
 * the two are the same string, so once the row lands the fallback is
 * unreachable and drift between registry and witness is impossible.
 */
function piToolNameTemplate(): string {
  const fromRegistry = registryMessage(REGISTRY, INVALID_PI_TOOL_CODE) as
    | string
    | undefined;
  return fromRegistry ?? PINNED_TEMPLATE;
}

/** The rendered refusal for one uppercase-first Pi-tool registry name. */
function invalidPiToolName(name: string): string {
  return piToolNameTemplate().replaceAll("<name>", name);
}

/** `theta/load/invalid-tool-rename` rendered for a `as BadName` target. */
const INVALID_RENAME_BADNAME = expectedMessage(INVALID_RENAME_CODE, {
  "<name>": "BadName",
});

// ===========================================================================
// Group (A) — the refusal is a registered code with a normative message.
// ===========================================================================

describe("Bug 0108 (A) — theta/load/invalid-pi-tool-name is a registered diagnostic (DIAG-4) ", () => {
  it("carries the normative Message string every witness below renders", () => {
    const message = registryMessage(REGISTRY, INVALID_PI_TOOL_CODE) as
      | string
      | undefined;
    expect(
      message,
      `registry has no row for ${INVALID_PI_TOOL_CODE} in ` +
        "docs/spec_topics/diagnostics/code-registry-load.md: the Pi-tool " +
        "name-shape rule has no code to report and DIAG-4 has no string to " +
        "source. The row is a DIAG-2 registry edit mirrored into " +
        "docs/reference/diagnostics.md in the same commit",
    ).toBeDefined();
    expect(
      message,
      `the ${INVALID_PI_TOOL_CODE} row's Message must name the host registry ` +
        "name and the `as` escape hatch, and speak of neither a file nor a " +
        "derivation — the reason it is a new row rather than a widened " +
        `${INVALID_DERIVED_CODE}`,
    ).toBe(PINNED_TEMPLATE);
  });
});

// ===========================================================================
// Group (B) — the production load path over a real `.pi/theta/` workspace.
// ===========================================================================

interface PlantedTheta {
  readonly stem: string;
  readonly text: string;
}

function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}

/** The uppercase-first registry name the `getAllTools` double publishes. */
const UPPER_TOOL = "WebSearch";

/**
 * The `.theta` files planted under the project discovery source. Every caller
 * body is a bare query naming no callable, so the only reachable diagnostic is
 * the `tools:` one: a code-side call of an extension-registered tool would draw
 * `theta/load/extension-tool-unreachable` instead, which fires independently of
 * the name's case and is not this report's subject.
 */
const THETAS: readonly PlantedTheta[] = [
  // The load-bearing row: the uppercase-first registry name is bound as the
  // presented callable name with no diagnostic.
  {
    stem: "upperpitool",
    text: theta("---", "mode: prompt", "tools:", `  - ${UPPER_TOOL}`, "---", "@`hi`"),
  },
  // The escape hatch the refusal's message points the author at.
  {
    stem: "upperrenamed",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      `  - ${UPPER_TOOL} as websearch`,
      "---",
      "@`hi`",
    ),
  },
  // Lowercase control: a conforming registry name must stay admitted, or the
  // check has rejected the Pi-tool arm rather than the name's shape.
  {
    stem: "goodtool",
    text: theta("---", "mode: prompt", "tools:", "  - read", "---", "@`hi`"),
  },
  // Precondition witness: a `tools:`-surface rejection that fires today, so an
  // unwired resolution pass cannot be mistaken for a clean load.
  {
    stem: "badrename",
    text: theta("---", "mode: prompt", "tools:", "  - read as BadName", "---", "@`hi`"),
  },
];

interface LoadOutcome {
  /** Slash names the production compose helper returned (returned fixtures). */
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
    // The extension-registry admission route — the only one that can publish a
    // non-lowercase-first name, since the host built-in ladder is a closed
    // switch over seven lowercase-first names.
    getAllTools: (): readonly unknown[] => [{ name: UPPER_TOOL }],
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
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0108-"));
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

/** The registered / notified sets, rendered for an assertion message. */
function observed(): string {
  return (
    ` Registered: ${JSON.stringify(outcome.registered)}` +
    ` Notified: ${JSON.stringify(outcome.notifications)}`
  );
}

// The precondition every cell in this group rests on, in two parts: the
// discovery walk found the planted workspace, AND the load path resolves
// `tools:` at all. Without both, an empty walk or an unwired resolution pass
// would satisfy the un-registration assertion vacuously.
describe("Bug 0108 (B0) — the production load path discovered the workspace and resolves `tools:` ", () => {
  it("registers the lowercase Pi-tool control (goodtool) and surfaces a `tools:` rejection", () => {
    expect(
      outcome.registered.length,
      "the project `.pi/theta/` discovery walk registered nothing — the setup " +
        "precondition is unmet." + observed(),
    ).toBeGreaterThan(0);
    expect(
      outcome.registered,
      "the clean `- read` control did not register, so no red below can be " +
        "attributed to the Pi-tool name-shape rule." + observed(),
    ).toContain("goodtool");
    expect(
      outcome.notifications,
      `no ${INVALID_RENAME_CODE} diagnostic surfaced, so the load path is not ` +
        "resolving `tools:` at all and the un-registration assertion below " +
        "would pass vacuously." + observed(),
    ).toContain(INVALID_RENAME_BADNAME);
  });
});

describe("Bug 0108 (B1) — an uppercase-first registry name un-registers the theta at production load ", () => {
  it("theta/load/invalid-pi-tool-name: `- WebSearch` does not register", () => {
    expect(
      outcome.registered,
      "`- WebSearch` registered: the frozen callable set carries the key " +
        "`WebSearch`, which the arm-4 resolution treats as an ordinary callable " +
        "while the case regime reserves that spelling for a schema, enum or " +
        "constructor." + observed(),
    ).not.toContain("upperpitool");
  });

  it("theta/load/invalid-pi-tool-name: the load path surfaces the refusal naming the registry name", () => {
    expect(
      outcome.notifications,
      "no diagnostic names the entry `WebSearch`: the author writing the " +
        "implicit form is told nothing, while the identical name written as " +
        "`WebSearch as WebSearch` is refused." + observed(),
    ).toContain(invalidPiToolName(UPPER_TOOL));
  });

  it("`- WebSearch as websearch` registers, and the lowercase control is untouched", () => {
    // The remedy the refusal message names must work, and the rule must not
    // reach a conforming registry name.
    expect(
      outcome.registered,
      "the `as`-renamed uppercase-first tool must register — the rule is about " +
        "the presented name, not about the host tool." + observed(),
    ).toContain("upperrenamed");
    expect(
      outcome.registered,
      "a lowercase-first Pi-tool entry is unaffected." + observed(),
    ).toContain("goodtool");
  });
});

// ===========================================================================
// Group (C) — the Pi-tool name rule and its ordering, on `resolveCallableSet`.
// ===========================================================================

/** The first diagnostic carrying `code`, if any. */
function withCode(diags: readonly Diagnostic[], code: string): Diagnostic | undefined {
  return diags.find((d) => d.code === code);
}

/** A resolved Pi-tool stand-in (the ToolDefinition is opaque to this seam). */
function piTool(name: string): ResolvedPiTool {
  return { kind: "pi-tool", toolDefinition: { name } };
}

/**
 * A resolved `.theta` callee stand-in with a given declared mode. The
 * `calleePath` is injected by the `deps` factory from the resolution-table key
 * (mirroring production: `resolveEntry` overwrites it from the entry `spec`).
 */
function thetaCallee(
  mode: "prompt" | "subagent",
): Omit<ResolvedThetaCallee, "calleePath"> {
  return { kind: "theta", mode, callee: { mode } };
}

/**
 * Build `CallableSetDeps` from an explicit Pi-tool registry, a `.theta`
 * resolution table (keyed by the path literal as written), and reserved
 * top-level names. Anything absent resolves as unknown / unresolvable.
 */
function deps(opts?: {
  piTools?: readonly string[];
  thetaCallees?: Readonly<Record<string, Omit<ResolvedThetaCallee, "calleePath">>>;
  reservedNames?: readonly string[];
}): CallableSetDeps {
  const piTools = new Set(opts?.piTools ?? []);
  const thetaCallees = opts?.thetaCallees ?? {};
  return {
    resolvePiTool: (name) => (piTools.has(name) ? piTool(name) : undefined),
    resolveThetaCallee: (thetaPath) => {
      const callee = thetaCallees[thetaPath];
      return callee === undefined ? undefined : { ...callee, calleePath: thetaPath };
    },
    reservedNames: new Set(opts?.reservedNames ?? []),
  };
}

/** Resolve a YAML list-form `tools:` value. */
function resolveList(items: readonly string[], d: CallableSetDeps): CallableSetResult {
  const tools: ToolsField = { kind: "list", items };
  return resolveCallableSet({ file: "test.theta", tools, deps: d });
}

/** Every `.theta` callee the group's cells list, keyed as written. */
const CALLEES = {
  "./2fast.theta": thetaCallee("subagent"),
  "./Foo.theta": thetaCallee("subagent"),
  "./ok.theta": thetaCallee("subagent"),
} as const;

/**
 * Assert an uppercase-first Pi-tool registry name is refused, naming it
 * verbatim, with the whole theta un-registered and no snapshot minted.
 */
function expectInvalidPiToolName(result: CallableSetResult, name: string): void {
  const dg = withCode(result.diagnostics, INVALID_PI_TOOL_CODE);
  expect(
    dg,
    `no ${INVALID_PI_TOOL_CODE} for the Pi-tool entry \`${name}\`, whose ` +
      "registry name is not lowercase-first; diagnostics: " +
      JSON.stringify(result.diagnostics),
  ).toBeDefined();
  expect(
    dg?.severity,
    "the refusal is error-severity — the theta must not register",
  ).toBe("error");
  expect(dg?.message, "the registry name is named verbatim").toBe(
    invalidPiToolName(name),
  );
  expect(
    result.registered,
    "a non-conforming presented name un-registers the whole theta, matching " +
      "the all-or-nothing posture of every sibling `tools:` code",
  ).toBe(false);
  expect(
    result.callableSet,
    "a refused theta carries no resolution snapshot, so no non-conforming name " +
      "reaches the frozen callable set the arm-4 resolution reads",
  ).toBeUndefined();
}

describe("Bug 0108 (C1) — an uppercase-first Pi-tool registry name is refused ", () => {
  it("theta/load/invalid-pi-tool-name: `WebSearch` binds nothing and raises exactly one diagnostic", () => {
    const r = resolveList([UPPER_TOOL], deps({ piTools: [UPPER_TOOL] }));
    expectInvalidPiToolName(r, UPPER_TOOL);
    expect(
      r.diagnostics.length,
      "one entry with one defect raises one diagnostic; diagnostics: " +
        JSON.stringify(r.diagnostics),
    ).toBe(1);
  });

  it("the refusal is the Pi-tool code, not the `.theta` derived-name code", () => {
    // DIAG-4 forbids rewording `theta/load/invalid-derived-tool-name`'s Message,
    // which binds `<path>`, asserts a basename derivation and directs the author
    // to rename a file — three claims that are false of a host registry name.
    const r = resolveList([UPPER_TOOL], deps({ piTools: [UPPER_TOOL] }));
    expect(
      withCode(r.diagnostics, INVALID_DERIVED_CODE),
      `${INVALID_DERIVED_CODE} names a file and a derivation a Pi tool has ` +
        "neither of; diagnostics: " + JSON.stringify(r.diagnostics),
    ).toBeUndefined();
  });
});

describe("Bug 0108 (C2) — the refused class is exactly [A-Z][A-Za-z0-9_]* ", () => {
  it.each(["Read", "WEBSEARCH", "X"])(
    "theta/load/invalid-pi-tool-name: the uppercase-first registry name `%s` is refused",
    (name) => {
      // Three shapes of the same class: an uppercase spelling of a built-in
      // name, an all-caps name, and a single letter. `isBareIdentifier` admits
      // all three to the Pi-tool arm, and `isLowercaseFirstIdentifier` rejects
      // all three.
      const r = resolveList([name], deps({ piTools: [name] }));
      expectInvalidPiToolName(r, name);
    },
  );

  it("`_Under` STAYS REGISTERED: a leading underscore is lowercase-first", () => {
    // The negative control that bounds the predicate. `lexical.md:16` admits `_`
    // as a lowercase-first first character, so a registry name starting with it
    // is conforming and must not be swept up. This cell reds if the new rule is
    // written as "isBareIdentifier minus a lowercase LETTER" rather than as the
    // shipped `isLowercaseFirstIdentifier`.
    const r = resolveList(["_Under"], deps({ piTools: ["_Under"] }));
    expect(
      r.registered,
      "`_Under` is lowercase-first under the shipped predicate; diagnostics: " +
        JSON.stringify(r.diagnostics),
    ).toBe(true);
    expect(r.callableSet?.entries.has("_Under")).toBe(true);
    expect(
      withCode(r.diagnostics, INVALID_PI_TOOL_CODE),
      "the rule is the lowercase-first predicate, not a lowercase-letter one",
    ).toBeUndefined();
  });
});

describe("Bug 0108 (C3) — the `as` escape hatch the Message points at ", () => {
  it("`WebSearch as websearch` registers under `websearch` with no diagnostic", () => {
    // The remedy the refusal names must work, and it must be the ONLY name in
    // the snapshot: the presented name is the author's, the host name stays on
    // the entry for the PIC-58 `--tools` allowlist.
    const r = resolveList(
      [`${UPPER_TOOL} as websearch`],
      deps({ piTools: [UPPER_TOOL] }),
    );
    expect(
      r.registered,
      "an overridden entry is admitted; diagnostics: " +
        JSON.stringify(r.diagnostics),
    ).toBe(true);
    expect(r.callableSet?.entries.has("websearch")).toBe(true);
    expect(
      r.callableSet?.entries.has(UPPER_TOOL),
      "the host registry name is not a presented name once `as` overrides it",
    ).toBe(false);
    expect(r.diagnostics, "a conforming override raises nothing").toEqual([]);
  });
});

describe("Bug 0108 (C4) — every host built-in still registers ", () => {
  const BUILTINS = ["grep", "read", "find", "ls", "bash", "edit", "write"] as const;

  it("the closed built-in switch's seven names are all admitted untouched", () => {
    // `builtinToolDefinition` is a closed switch over exactly these seven names
    // and every one is lowercase-first, so the built-in admission route cannot
    // produce the refused class. Listing them all pins that: a rule that reached
    // any of them would have rejected the Pi-tool arm rather than the shape.
    const r = resolveList([...BUILTINS], deps({ piTools: [...BUILTINS] }));
    expect(
      r.registered,
      "diagnostics: " + JSON.stringify(r.diagnostics),
    ).toBe(true);
    expect([...(r.callableSet?.entries.keys() ?? [])]).toEqual([...BUILTINS]);
  });
});

describe("Bug 0108 (C5) — the isBareIdentifier arm split is undisturbed ", () => {
  it.each(["web-search", "web.search", "9tool"])(
    "theta/parse/invoke-non-theta-extension: `%s` keeps its current code and message",
    (spec) => {
      // A hyphen, a dot or a leading digit fails `isBareIdentifier`, so the spec
      // routes to the `.theta`-path arm and never reaches the Pi-tool arm even
      // though the registry publishes it. That framing misdescribes a Pi-tool
      // name as a `.theta` path; it is a separate, unfiled defect and narrowing
      // the arm split to fix it is out of scope here (bug 0108 §Non-goals).
      //
      // Bug 0320 changed what this arm draws for an entry that reaches it: none
      // of these three specs ends in `.theta`, so `resolveEntry`'s extension
      // check (bug 0320 §Fix) now rejects them with
      // `theta/parse/invoke-non-theta-extension` BEFORE `resolveThetaCallee`
      // ever runs — `theta/load/unresolvable-theta-path` no longer fires here,
      // because that code is scoped to a spec that already ends in `.theta`
      // but resolves to no file, which none of these three do. The arm-split
      // defect this describe block pins is otherwise unchanged.
      const r = resolveList([spec], deps({ piTools: [spec] }));
      const dg = withCode(r.diagnostics, INVOKE_NON_THETA_EXTENSION_CODE);
      expect(
        dg,
        `${INVOKE_NON_THETA_EXTENSION_CODE} for \`${spec}\`; diagnostics: ` +
          JSON.stringify(r.diagnostics),
      ).toBeDefined();
      expect(dg?.message).toBe(
        parseExpectedMessage(INVOKE_NON_THETA_EXTENSION_CODE, { "<path>": spec }),
      );
      expect(
        withCode(r.diagnostics, UNRESOLVABLE_PATH_CODE),
        "the extension check fires before `resolveThetaCallee`, so the spec never reaches unresolvable-theta-path",
      ).toBeUndefined();
      expect(
        withCode(r.diagnostics, INVALID_PI_TOOL_CODE),
        "an entry that never reached the Pi-tool arm cannot draw its code",
      ).toBeUndefined();
    },
  );

  it("theta/load/malformed-tool-entry: `Web Search` keeps its current code and message", () => {
    // An internal space fails the closed per-entry grammar before any arm is
    // chosen, so the grammar rejection continues out first.
    const r = resolveList(["Web Search"], deps({ piTools: ["Web Search"] }));
    const dg = withCode(r.diagnostics, MALFORMED_ENTRY_CODE);
    expect(
      dg,
      `${MALFORMED_ENTRY_CODE} for \`Web Search\`; diagnostics: ` +
        JSON.stringify(r.diagnostics),
    ).toBeDefined();
    expect(dg?.message).toBe(
      expectedMessage(MALFORMED_ENTRY_CODE, { "<value>": "Web Search" }),
    );
    expect(
      withCode(r.diagnostics, INVALID_PI_TOOL_CODE),
      "a malformed entry names no spec to judge the shape of",
    ).toBeUndefined();
  });
});

describe("Bug 0108 (C6) — the Pi-tool name check precedes the collision test ", () => {
  it("theta/load/invalid-pi-tool-name: a reserved `WebSearch` does not mask the refusal", () => {
    // The binding position constraint: `const name = parsed.rename ??
    // resolution.defaultName` merges the two name sources and the
    // `entries.has(name) || deps.reservedNames.has(name)` test judges the merged
    // name for collision. A name outside the case regime is a defect of the
    // entry, not a disagreement between two entries, so reporting the collision
    // would send the author to `as` for the wrong reason and would hide the
    // defect the moment a top-level `fn` or import happened to share the name.
    const r = resolveList(
      [UPPER_TOOL],
      deps({ piTools: [UPPER_TOOL], reservedNames: [UPPER_TOOL] }),
    );
    expectInvalidPiToolName(r, UPPER_TOOL);
    expect(
      withCode(r.diagnostics, COLLISION_CODE),
      `${COLLISION_CODE} fired in place of ${INVALID_PI_TOOL_CODE}: the ` +
        "name-shape refusal is masked by a name it should never have reached; " +
        "diagnostics: " + JSON.stringify(r.diagnostics),
    ).toBeUndefined();
  });
});

describe("Bug 0108 (C7) — the arms that continue out before the merge point still win ", () => {
  it("theta/load/invalid-tool-rename: `WebSearch as WebSearch` fails on its target, not on the registry name", () => {
    // The `as` arm rejects and `continue`s before `resolveEntry` runs, so the
    // entry never reaches the merge point even though its registry name would
    // fail there too. One entry, one defect, one code — and this is the arm
    // whose verdict on the identical final name the bug is measured against.
    const r = resolveList(
      [`${UPPER_TOOL} as ${UPPER_TOOL}`],
      deps({ piTools: [UPPER_TOOL] }),
    );
    const dg = withCode(r.diagnostics, INVALID_RENAME_CODE);
    expect(
      dg,
      `${INVALID_RENAME_CODE} for a non-lowercase-first target; diagnostics: ` +
        JSON.stringify(r.diagnostics),
    ).toBeDefined();
    expect(dg?.message).toBe(
      expectedMessage(INVALID_RENAME_CODE, { "<name>": UPPER_TOOL }),
    );
    expect(
      withCode(r.diagnostics, INVALID_PI_TOOL_CODE),
      "an entry carrying an explicit override has no default name to judge",
    ).toBeUndefined();
    expect(r.registered).toBe(false);
  });

  it("theta/load/unknown-tool: `WebSearch` against an empty registry keeps the resolution failure", () => {
    // A failed resolution `continue`s out with its own diagnostic before the
    // merge point, so an absent tool is reported as absent rather than as
    // badly named — the shape of a name nothing resolved is not a fact about
    // the host registry.
    const r = resolveList([UPPER_TOOL], deps({ piTools: [] }));
    const dg = withCode(r.diagnostics, UNKNOWN_TOOL_CODE);
    expect(
      dg,
      `${UNKNOWN_TOOL_CODE} for an absent tool; diagnostics: ` +
        JSON.stringify(r.diagnostics),
    ).toBeDefined();
    expect(dg?.message).toBe(
      expectedMessage(UNKNOWN_TOOL_CODE, { "<name>": UPPER_TOOL }),
    );
    expect(
      withCode(r.diagnostics, INVALID_PI_TOOL_CODE),
      "a name that resolved to nothing has no Pi tool whose registry name to judge",
    ).toBeUndefined();
  });
});

describe("Bug 0108 (C8) — the `.theta` arm is unchanged ", () => {
  it.each([
    ["./2fast.theta", "2fast"],
    ["./Foo.theta", "Foo"],
  ])(
    "theta/load/invalid-derived-tool-name: `%s` keeps its own code and message",
    (path, derived) => {
      // The sibling arm the new rule sits after. Its Message is the one DIAG-4
      // freezes, and it must keep applying to exactly the inputs it applied to
      // before — including the uppercase-stem row, which is the `.theta` arm's
      // own case of the same shape defect.
      const r = resolveList([path], deps({ thetaCallees: CALLEES }));
      const dg = withCode(r.diagnostics, INVALID_DERIVED_CODE);
      expect(
        dg,
        `${INVALID_DERIVED_CODE} for \`${path}\`; diagnostics: ` +
          JSON.stringify(r.diagnostics),
      ).toBeDefined();
      expect(dg?.message).toBe(
        expectedMessage(INVALID_DERIVED_CODE, {
          "<path>": path,
          "<value>": derived,
        }),
      );
      expect(
        withCode(r.diagnostics, INVALID_PI_TOOL_CODE),
        "a `.theta` entry resolves no Pi tool, so the Pi-tool arm's code " +
          "cannot describe it",
      ).toBeUndefined();
      expect(r.registered).toBe(false);
    },
  );

  it("`./ok.theta` still registers under `ok`", () => {
    const r = resolveList(["./ok.theta"], deps({ thetaCallees: CALLEES }));
    expect(
      r.registered,
      "a conforming derived name is unaffected; diagnostics: " +
        JSON.stringify(r.diagnostics),
    ).toBe(true);
    expect(r.callableSet?.entries.has("ok")).toBe(true);
  });
});
