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

// Bug 0070 — a `tools:` entry's presented name comes from one of two sources
// and, at the baseline probed below, only one of them was checked against the
// naming rule both share. `resolveCallableSet` (src/parser/callable-set.ts)
// tested an `as` override against `isLowercaseFirstIdentifier` and admitted the
// derived default verbatim: `thetaDefaultName` rewrote hyphens to underscores
// and returned the stem unexamined, then both values merged into one `entries`
// key with no shape test in between. A `tools:` entry `./2fast.theta` therefore
// minted the callable name `2fast` with no load diagnostic, and the frozen
// snapshot that `presentedCallableNames`
// (src/extension/production-theta-producer.ts:3600) exposes as the arm-4
// callable registry carried a name theta code cannot spell. The digit-leading
// class is reachable because the discovery stem regex `^[a-z0-9][a-z0-9_-]*$`
// (`SLASH_NAME`, src/discovery/discovery-walk.ts:82, specified at
// docs/spec_topics/discovery/discovery-sources.md:74) admits a leading digit,
// so `2fast.theta` is a registrable file
// (docs/bugs/0070-theta-callable-default-name-unvalidated.md).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/frontmatter/frontmatter-fields-a.md:81 — "Each entry is
//     exposed under a single name in the theta's top-level scope (and to the
//     model as a tool of the same name)."
//   - :84 — the derived default "with **hyphens replaced by underscores** …
//     The remap exists because theta-file naming convention favours hyphens
//     while theta identifiers must be lowercase-first identifier-shaped." The
//     rule is stated ON the derived name's own bullet, as the reason the remap
//     exists at all.
//   - :85 — "The override target must obey theta's lowercase-first identifier
//     rule (`./summarise.theta as MyTool` is `theta/load/invalid-tool-rename`)."
//     The same rule at the sibling source, enforced.
//   - docs/spec_topics/lexical.md:13 — `[A-Za-z_][A-Za-z0-9_]*` with the first
//     letter's case enforced: the only spelling of a binding, so a name outside
//     it is not exposed in any scope.
//   - docs/spec_topics/tool-calls.md:3 — a callable is called "via the
//     bare-identifier form `<name>(args)`, where `<name>` is an entry in the
//     theta's *callable set*". For `2fast` there is no such bare identifier.
//   - docs/spec_topics/frontmatter/frontmatter-fields-a.md:86 — two entries
//     resolving to one final name are `theta/load/tool-name-collision`. That
//     rule is about a name two entries agree on, not about a name no entry can
//     spell, which is why group (C3) pins the ordering between the two.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:74 (DIAG-4) — the
//     registry *Message* column is normative and an asserting test sources its
//     string from there.
//   - docs/spec_topics/diagnostics/placeholder-rendering-b.md:9 — category 5's
//     `<path>` rule: the path literal as written, no realpath normalisation.
//   - :74 — the parse-time literal-value `<value>` sub-rule: a YAML scalar with
//     no enclosing source quoting renders unquoted regardless of identifier
//     shape, so the quotes around the derived name come from the template.
//
// THE PINNED POST-FIX CONTRACT (bug doc §Fix option 2, the recommended route).
// A `.theta` entry whose DERIVED default name is not lowercase-first raises an
// error-severity `theta/load/invalid-derived-tool-name` naming the entry path,
// the derived name, and the `as` escape hatch, and the theta does not register.
// The check sits at the merge point (`const name = parsed.rename ??
// resolution.defaultName`), guarded on the rename being absent, and fires
// BEFORE the collision test (`entries.has(name) ||
// deps.reservedNames.has(name)`) so a derived-name rejection is never masked by
// a collision. The `as`-target arm (the `parsed.rename !== undefined` guard on
// `theta/load/invalid-tool-rename`) is untouched and still `continue`s first,
// so an explicit override keeps its own code.
//
// PROBED CURRENT SIGNATURES (HEAD 99b65438 / 0.62.0, offline, deterministic,
// over the planted workspace below). A theta whose `tools:` lists
// `./2fast.theta` registers with an empty notification set; the resolver-direct
// call returns `registered: true` with the key `2fast` and `diagnostics: []`.
// `./2-fast.theta` behaves identically under the key `2_fast`. With `2fast`
// also in `reservedNames`, the only diagnostic is
// `theta/load/tool-name-collision` — the masking the ordering pin forbids.
//
// WHAT WAS RED AT THAT BASELINE AND WHY — the record of what each cell
// witnesses: group (A) was red because the code carried no registry row, so
// DIAG-4 had no normative string to source and the rejection had no code to
// report. Group (B)'s two derived-name cells were each red twice — the theta
// was in the registered set, and the diagnostic naming its entry never reached
// `ctx.ui.notify` (src/extension/production-composition.ts:193). Group (C)'s
// derived-name cells were red on `resolveCallableSet` returning
// `registered: true` with the unspellable key bound and no diagnostic; (C3) was
// red on the collision code firing in place of the derived-name code.
//
// GREEN BY DESIGN and required to stay green (the positive controls that prove
// the check rejects an unspellable derived name specifically, not every
// `.theta` entry): the group (B) precondition guard; `./2fast.theta as fast`
// registering; `./code-review.theta` → `code_review` registering; the `read`
// Pi-tool entry resolving; and `- read as BadName` keeping
// `theta/load/invalid-tool-rename` without acquiring the new code.
//
// TIER: unit, offline, provider-free, deterministic — in two halves. Group (B)
// drives the shipped `session_start` composition root
// (`discoverAndComposeFixtures`) over a real on-disk `.pi/theta/` discovery
// workspace, which is what makes this a production-load witness: the reachable
// input class is bounded by what the discovery stem regex admits, and only the
// real walk demonstrates that a digit-leading callee file is registrable in the
// first place. Group (C) calls `resolveCallableSet` directly, because the
// ordering pin against the collision test needs `reservedNames` injected — a
// value the load path derives from the caller's own top-level scope and cannot
// be planted independently of the entry. No integration or live tier is
// reachable for this observable: registration and its diagnostics settle before
// any model or transport exists.
//
// NO SILENT SKIPPING: the group (B) precondition guard asserts both that the
// discovery walk registered its clean control and that the `tools:` resolution
// pass runs at all, so an empty walk reds by name instead of letting every
// `not.toContain` pass vacuously.

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

const INVALID_DERIVED_CODE = "theta/load/invalid-derived-tool-name";
const INVALID_RENAME_CODE = "theta/load/invalid-tool-rename";
const COLLISION_CODE = "theta/load/tool-name-collision";

/**
 * The *Message* template the registry row must carry, pinned from the bug doc's
 * §Fix option 2. `<path>` is the entry path literal as written (category 5);
 * `<value>` is the derived name under the parse-time literal-value sub-rule,
 * unquoted because a `tools:` entry is a YAML scalar with no enclosing source
 * quoting.
 */
const PINNED_TEMPLATE =
  "'tools:' entry '<path>' derives the default name '<value>', " +
  "which must be lowercase-first; rename the file or add an 'as' clause";

/**
 * The template every message assertion in groups (B) and (C) renders. It reads
 * the registry, which is the DIAG-4 authority, and falls back to the pinned
 * template only while the row is absent — otherwise a `registryMessage` miss
 * would yield `undefined`, and every cell below would red on a rendering
 * failure instead of on the behaviour it exists to witness. Group (A) asserts
 * the two are the same string, so once the row lands the fallback is
 * unreachable and drift between registry and witness is impossible.
 */
function derivedNameTemplate(): string {
  const fromRegistry = registryMessage(REGISTRY, INVALID_DERIVED_CODE) as
    | string
    | undefined;
  return fromRegistry ?? PINNED_TEMPLATE;
}

/** The rendered rejection for one entry path and the name it derives. */
function invalidDerived(path: string, derived: string): string {
  return derivedNameTemplate()
    .replaceAll("<path>", path)
    .replaceAll("<value>", derived);
}

/** `theta/load/invalid-tool-rename` rendered for the `as BadName` target. */
const INVALID_RENAME_MESSAGE = expectedMessage(INVALID_RENAME_CODE, {
  "<name>": "BadName",
});

// ===========================================================================
// Group (A) — the rejection is a registered code with a normative message.
// ===========================================================================

describe("Bug 0070 (A) — theta/load/invalid-derived-tool-name is a registered diagnostic (DIAG-4)", () => {
  it("carries the normative Message string every witness below renders", () => {
    const message = registryMessage(REGISTRY, INVALID_DERIVED_CODE) as
      | string
      | undefined;
    expect(
      message,
      `registry has no row for ${INVALID_DERIVED_CODE} in ` +
        "docs/spec_topics/diagnostics/code-registry-load.md: the derived-name " +
        "rule has no code to report and DIAG-4 has no string to source",
    ).toBeDefined();
    expect(
      message,
      `the ${INVALID_DERIVED_CODE} row's Message must be the template the ` +
        "witnesses render, so registry and witness cannot drift apart",
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

/**
 * The `.theta` files planted under the project discovery source. Each callee
 * stem is itself discovery-valid, which is what makes the entry reachable: a
 * digit-leading stem passes the slash-name regex, so the author has a
 * registered file to list. Every caller body is a bare query naming no
 * callable, so the only reachable diagnostic is the `tools:` one and a red can
 * never be a downstream body reference.
 */
const THETAS: readonly PlantedTheta[] = [
  // The digit-leading callee. Registers as `/2fast` on its own merits; its
  // stem is what a `tools:` entry turns into an unspellable callable name.
  { stem: "2fast", text: theta("---", "mode: subagent", "---", "@`fast`") },
  // The load-bearing row: the derived default name `2fast` is bound with no
  // diagnostic, and no theta expression can call it.
  {
    stem: "digitdefault",
    text: theta("---", "mode: subagent", "tools:", "  - ./2fast.theta", "---", "@`hi`"),
  },
  // The `as` escape hatch the rejection's message points the author at.
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

  // The hyphen→underscore rewrite does not rescue a digit-leading stem: the
  // rewrite is what the spec bullet says the lowercase-first rule motivates,
  // and its output is equally unspellable here.
  { stem: "2-fast", text: theta("---", "mode: subagent", "---", "@`fast`") },
  {
    stem: "hyphdigit",
    text: theta("---", "mode: subagent", "tools:", "  - ./2-fast.theta", "---", "@`hi`"),
  },

  // Positive control: the spec's own example of the rewrite, whose output IS
  // lowercase-first. It must keep registering, or the check has rejected the
  // rewrite rather than the shape.
  { stem: "code-review", text: theta("---", "mode: subagent", "---", "@`cr`") },
  {
    stem: "reviewer",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./code-review.theta",
      "---",
      "@`hi`",
    ),
  },

  // Positive control for the sibling rule: an explicit `as` target of the wrong
  // shape keeps its own code and must not be reclassified.
  {
    stem: "badrename",
    text: theta("---", "mode: prompt", "tools:", "  - read as BadName", "---", "@`hi`"),
  },
];

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
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0070-"));
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

// The precondition every cell below rests on, in two parts: the discovery walk
// found the planted workspace, AND the load path resolves `tools:` at all.
// Without both, an empty walk or an unwired resolution pass would satisfy every
// un-registration assertion vacuously.
describe("Bug 0070 (B0) — the production load path discovered the workspace and resolves `tools:`", () => {
  it("registers the clean derived-name control (reviewer) and surfaces a `tools:` rejection", () => {
    expect(
      outcome.registered.length,
      "the project `.pi/theta/` discovery walk registered nothing — the setup " +
        "precondition is unmet." + observed(),
    ).toBeGreaterThan(0);
    expect(
      outcome.registered,
      "the clean `- ./code-review.theta` control did not register, so no red " +
        "below can be attributed to the derived-name rule." + observed(),
    ).toContain("reviewer");
    expect(
      outcome.notifications,
      `no ${INVALID_RENAME_CODE} diagnostic surfaced, so the load path is not ` +
        "resolving `tools:` at all and every un-registration assertion below " +
        "would pass vacuously." + observed(),
    ).toContain(INVALID_RENAME_MESSAGE);
  });
});

describe("Bug 0070 (B1) — a digit-leading derived default name un-registers the theta", () => {
  it("theta/load/invalid-derived-tool-name: `- ./2fast.theta` does not register", () => {
    expect(
      outcome.registered,
      "`- ./2fast.theta` registered: the callable set carries the name `2fast`, " +
        "which is offered to the model and counts for collision detection while " +
        "no theta expression can call it." + observed(),
    ).not.toContain("digitdefault");
  });

  it("theta/load/invalid-derived-tool-name: the load path surfaces the rejection naming the path and the derived name", () => {
    expect(
      outcome.notifications,
      "no diagnostic names the entry `./2fast.theta` and its derived name " +
        "`2fast`: the only signal the author gets is a parse error at their own " +
        "call site, which names no `tools:` entry." + observed(),
    ).toContain(invalidDerived("./2fast.theta", "2fast"));
  });
});

describe("Bug 0070 (B2) — the `as` escape hatch registers", () => {
  it("`- ./2fast.theta as fast` registers under the override", () => {
    // The remedy the rejection message names must work: an explicit override of
    // the right shape takes the entry out of the derived-name rule entirely.
    expect(
      outcome.registered,
      "the `as`-renamed digit-leading callee must register — the rule is about " +
        "the derived name, not about the callee file." + observed(),
    ).toContain("digitrenamed");
  });
});

describe("Bug 0070 (B3) — the hyphen→underscore rewrite does not rescue a digit-leading stem", () => {
  it("theta/load/invalid-derived-tool-name: `- ./2-fast.theta` does not register", () => {
    expect(
      outcome.registered,
      "`- ./2-fast.theta` registered: the rewrite produced `2_fast`, still " +
        "digit-leading and still unspellable." + observed(),
    ).not.toContain("hyphdigit");
  });

  it("theta/load/invalid-derived-tool-name: the rejection names the post-rewrite name, not the stem", () => {
    // The author needs the name that was actually bound; the stem alone does not
    // explain why `2_fast` is the unspellable name.
    expect(
      outcome.notifications,
      "no diagnostic names the entry `./2-fast.theta` and its derived name " +
        "`2_fast`." + observed(),
    ).toContain(invalidDerived("./2-fast.theta", "2_fast"));
  });
});

describe("Bug 0070 (B4) — the spec's own rewrite example still registers", () => {
  it("`- ./code-review.theta` registers under the derived name `code_review`", () => {
    expect(
      outcome.registered,
      "the hyphen→underscore rewrite is load-bearing and its lowercase-first " +
        "output must stay admitted." + observed(),
    ).toContain("reviewer");
  });
});

describe("Bug 0070 (B5) — the `as`-target rule keeps its own code", () => {
  it("theta/load/invalid-tool-rename: `- read as BadName` un-registers under the rename rule", () => {
    expect(
      outcome.registered,
      "the non-lowercase-first `as` target must keep un-registering the theta." +
        observed(),
    ).not.toContain("badrename");
    expect(
      outcome.notifications,
      "the rename rejection message must be unchanged." + observed(),
    ).toContain(INVALID_RENAME_MESSAGE);
  });

  it("`read as BadName` is not reclassified as a derived-name failure", () => {
    // The `as` arm rejects and `continue`s before any default name is computed,
    // so an explicit override can never reach the derived-name rule. The filter
    // is conjunctive on the author's target because the other cells in this
    // workspace legitimately emit the derived-name framing; what must never
    // appear is that framing applied to a name the author wrote by hand.
    expect(
      outcome.notifications.filter(
        (n) => n.includes("derives the default name") && n.includes("BadName"),
      ),
      "an explicit `as` target is not a derived name; its own code owns it." +
        observed(),
    ).toEqual([]);
  });
});

// ===========================================================================
// Group (C) — the derived-name rule and its ordering, on `resolveCallableSet`.
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

/** Every subagent-mode callee the group's cells list, keyed as written. */
const CALLEES = {
  "./2fast.theta": thetaCallee("subagent"),
  "./2-fast.theta": thetaCallee("subagent"),
  "./foo.bar.theta": thetaCallee("subagent"),
  "./code-review.theta": thetaCallee("subagent"),
} as const;

/** Assert `path`'s derived name `derived` is rejected, naming both verbatim. */
function expectInvalidDerived(
  result: CallableSetResult,
  path: string,
  derived: string,
): void {
  const dg = withCode(result.diagnostics, INVALID_DERIVED_CODE);
  expect(
    dg,
    `no ${INVALID_DERIVED_CODE} for the entry \`${path}\`, whose derived name ` +
      `\`${derived}\` is not lowercase-first; diagnostics: ` +
      JSON.stringify(result.diagnostics),
  ).toBeDefined();
  expect(
    dg?.severity,
    "the rejection is error-severity — the theta must not register",
  ).toBe("error");
  expect(
    dg?.message,
    "the entry path and the derived name are both named verbatim",
  ).toBe(invalidDerived(path, derived));
  expect(
    result.registered,
    "an unspellable derived name un-registers the whole theta, matching the " +
      "all-or-nothing posture of the sibling `as`-target rule",
  ).toBe(false);
  expect(
    result.callableSet,
    "a rejected theta carries no resolution snapshot, so no unspellable name " +
      "reaches the frozen callable set",
  ).toBeUndefined();
}

describe("Bug 0070 (C1) — a digit-leading derived default name is rejected", () => {
  it("theta/load/invalid-derived-tool-name: `./2fast.theta` binds nothing and raises exactly one diagnostic", () => {
    const r = resolveList(["./2fast.theta"], deps({ thetaCallees: CALLEES }));
    expectInvalidDerived(r, "./2fast.theta", "2fast");
    expect(
      r.diagnostics.length,
      "one entry with one defect raises one diagnostic; diagnostics: " +
        JSON.stringify(r.diagnostics),
    ).toBe(1);
  });
});

describe("Bug 0070 (C2) — an `as` override of the right shape resolves", () => {
  it("`./2fast.theta as fast` registers and binds `fast`", () => {
    // Positive control: the derived name is never computed as the presented
    // name, so the digit-leading stem is irrelevant.
    const r = resolveList(["./2fast.theta as fast"], deps({ thetaCallees: CALLEES }));
    expect(r.registered, "an overridden entry is admitted").toBe(true);
    expect(r.callableSet?.entries.has("fast")).toBe(true);
    expect(
      withCode(r.diagnostics, INVALID_DERIVED_CODE),
      "the derived name is not the presented name here",
    ).toBeUndefined();
  });
});

describe("Bug 0070 (C3) — the derived-name check precedes the collision test", () => {
  it("theta/load/invalid-derived-tool-name: a reserved `2fast` does not mask the derived-name rejection", () => {
    // The binding constraint from §Fix: `const name = parsed.rename ??
    // resolution.defaultName` merges the two name sources and the
    // `entries.has(name) || deps.reservedNames.has(name)` test judges the
    // merged name for collision. A derived name that no
    // expression can spell is a defect of the entry, not a disagreement between
    // two entries, so reporting the collision would send the author to `as` for
    // the wrong reason and would hide the defect the moment a top-level `fn`
    // happened to share the name.
    const r = resolveList(
      ["./2fast.theta"],
      deps({ thetaCallees: CALLEES, reservedNames: ["2fast"] }),
    );
    expectInvalidDerived(r, "./2fast.theta", "2fast");
    expect(
      withCode(r.diagnostics, COLLISION_CODE),
      `${COLLISION_CODE} fired in place of ${INVALID_DERIVED_CODE}: the ` +
        "derived-name rejection is masked by a name it should never have " +
        "reached; diagnostics: " + JSON.stringify(r.diagnostics),
    ).toBeUndefined();
  });
});

describe("Bug 0070 (C4) — the `as`-target arm still wins", () => {
  it("theta/load/invalid-tool-rename: `./2fast.theta as BadName` fails on its target, not on the derived name", () => {
    // The `as` arm rejects and `continue`s before `resolveEntry` runs, so the
    // entry never reaches the derived-name rule even though its stem would fail
    // it too. One entry, one defect, one code.
    const r = resolveList(["./2fast.theta as BadName"], deps({ thetaCallees: CALLEES }));
    const dg = withCode(r.diagnostics, INVALID_RENAME_CODE);
    expect(dg, `${INVALID_RENAME_CODE} for a non-lowercase-first target`).toBeDefined();
    expect(dg?.message).toBe(INVALID_RENAME_MESSAGE);
    expect(
      withCode(r.diagnostics, INVALID_DERIVED_CODE),
      "an entry carrying an explicit override has no derived name to reject",
    ).toBeUndefined();
    expect(r.registered).toBe(false);
  });
});

describe("Bug 0070 (C5) — the hyphen→underscore rewrite keeps its admitted output", () => {
  it("`./code-review.theta` registers under `code_review`", () => {
    // The shared derivation both the resolver and `presentedCallableNames`
    // depend on: the rewrite exists to satisfy the lowercase-first rule, so its
    // output on a conforming stem must pass the check the rule now enforces.
    const r = resolveList(["./code-review.theta"], deps({ thetaCallees: CALLEES }));
    expect(r.registered, "the rewrite's output is lowercase-first").toBe(true);
    expect(r.callableSet?.entries.has("code_review")).toBe(true);
    expect(
      withCode(r.diagnostics, INVALID_DERIVED_CODE),
      "`code_review` is lowercase-first identifier-shaped",
    ).toBeUndefined();
  });

  it("theta/load/invalid-derived-tool-name: `./2-fast.theta` is rejected under its post-rewrite name", () => {
    const r = resolveList(["./2-fast.theta"], deps({ thetaCallees: CALLEES }));
    expectInvalidDerived(r, "./2-fast.theta", "2_fast");
  });
});

describe("Bug 0070 (C6) — the Pi-tool arm is untouched", () => {
  it("a Pi-tool entry resolves under its registry name verbatim", () => {
    // A Pi-tool entry's default name is the registry name, which the shipped
    // registry snapshot only ever supplies in identifier form; the check must
    // not disturb that arm.
    const r = resolveList(["read"], deps({ piTools: ["read"] }));
    expect(r.registered).toBe(true);
    expect(r.callableSet?.entries.has("read")).toBe(true);
    expect(
      withCode(r.diagnostics, INVALID_DERIVED_CODE),
      "a Pi-tool name from the registry snapshot is identifier-shaped",
    ).toBeUndefined();
  });
});

describe("Bug 0070 (C6a) — the Pi-tool arm's exemption is witnessed on a non-lowercase-first registry name", () => {
  it("a Pi-tool entry with a non-lowercase-first registry name still resolves under it verbatim", () => {
    // (C6)'s `read` is already lowercase-first, so it never exercises the
    // `resolution.callable.kind === "theta"` conjunct that scopes this
    // rejection away from the Pi-tool arm. The Pi-tool arm's default name is
    // the host registry name verbatim, so a name outside the lowercase-first
    // rule there is a host-registry fact with no file to rename and no
    // basename derivation to describe (bug 0070 §Non-goals). The residual gap
    // that leaves is recorded here, not closed: this asserts only that the
    // code raises no claim about `WebSearch`, not that an uppercase-first Pi
    // tool name is well-formed.
    const r = resolveList(["WebSearch"], deps({ piTools: ["WebSearch"] }));
    expect(r.registered).toBe(true);
    expect(r.callableSet?.entries.has("WebSearch")).toBe(true);
    expect(
      withCode(r.diagnostics, INVALID_DERIVED_CODE),
      "the Pi-tool arm derives no basename and rejects no registry name; " +
        "diagnostics: " + JSON.stringify(r.diagnostics),
    ).toBeUndefined();
  });
});

describe("Bug 0070 (C7) — a dotted stem derives a name that is not identifier-shaped at all", () => {
  it("theta/load/invalid-derived-tool-name: `./foo.bar.theta` derives `foo.bar` and is rejected", () => {
    // Reachable through `tools:` even though `foo.bar.theta` is refused as a
    // slash name: the entry is resolved as a path literal against the parse
    // cache, not against the discovery stem regex. The derived name breaks the
    // identifier grammar outright, not only its first-character rule.
    const r = resolveList(["./foo.bar.theta"], deps({ thetaCallees: CALLEES }));
    expectInvalidDerived(r, "./foo.bar.theta", "foo.bar");
  });
});
