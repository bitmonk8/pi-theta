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
  type ToolsField,
} from "../src/parser/callable-set";
import type { Diagnostic } from "../src/diagnostics/diagnostic";

// Bug 0069 — a `tools:` entry's trailing residue used to be discarded with no
// diagnostic. Before this fix, the per-entry grammar — now `parseToolsEntry`
// (src/parser/callable-set.ts) — split an entry on whitespace and kept
// `parts[0]` plus `parts[2]`; every other token was consumed unexamined, so
// `tools: read grep` (one dropped comma in the documented short form)
// narrowed the callable set to `{read}`, `- read as` resolved as a
// rename-less `read`, and `- read as file_read junk_here` bound `file_read`.
// A non-scalar sequence item was dropped one layer earlier, in
// `extractToolsList` (src/parser/frontmatter.ts), so the resolver never saw
// it. In every case the theta registered and ran with a callable set its
// author did not write
// (docs/bugs/0069-tools-entry-residue-silently-dropped.md).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/frontmatter/frontmatter-fields-a.md:76 — "Two kinds of
//     entry are accepted": a Pi tool name and a `.theta` path. Closed list.
//   - :85 — "The `as <name>` clause overrides the default for either kind". The
//     one modifier, spelled `as <name>`; no production admits a further token,
//     and no rule disposes of one.
//   - docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:3
//     (§YAML-shape) — the short form IS "the YAML plain scalar split on
//     commas, each resulting entry trimmed … and then parsed by that grammar".
//     Under that equivalence `read grep` is one entry, not two, and the entry
//     grammar has no production for it.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:74 (DIAG-4) — the
//     registry *Message* column is normative and an asserting test sources its
//     string from there.
//   - docs/spec_topics/diagnostics/placeholder-rendering-b.md:74 — the
//     parse-time literal-value `<value>` sub-rule, which a `tools:` entry falls
//     under: a YAML scalar with no enclosing source quoting renders unquoted
//     regardless of identifier shape, so the quotes around the entry text come
//     from the message template.
//   - docs/spec_topics/diagnostics/code-registry-load.md — the existing
//     all-or-nothing posture the rejection matches: one unresolvable name
//     (`theta/load/unknown-tool`) or one non-lowercase-first `as` target
//     (`theta/load/invalid-tool-rename`) un-registers the whole theta. A
//     dropped name must not be treated more permissively than a misspelled one.
//
// THE PINNED POST-FIX CONTRACT (bug doc §Fix constraints 1–4). The entry
// grammar is CLOSED and accepts exactly two token shapes: one token (bare
// spec), or three tokens whose middle token is `as`. Anything else — two
// tokens including the dangling `as` (constraint 2), three tokens with a
// middle token that is not `as`, four or more tokens, and a non-scalar
// sequence item recovered as its verbatim YAML source (constraint 3) — raises
// an error-severity `theta/load/malformed-tool-entry` naming the entry text
// verbatim, and the theta does not register (constraint 1). The grammar check
// precedes the `as`-target validation, so `read as BadName` keeps reaching
// `theta/load/invalid-tool-rename` (bug doc §Non-goals) while
// `read as BadName junk` is malformed.
//
// PROBED CURRENT SIGNATURES (HEAD 125d3691 / 0.61.0, offline, deterministic,
// over the planted workspace below). Registered: every stem except
// `badrename`. Notified: the single `invalid-tool-rename` message. No
// notification names a `tools:` entry, and no `tools:`-shaped input other than
// the `as`-target rule un-registers anything.
//
// WHAT IS RED HERE AND WHY: group (A) reds because the code has no registry
// row, so there is no normative string to source and no code to report. Group
// (B)'s six malformed cells red twice each — the theta is in the registered
// set, and the diagnostic naming its entry text never reaches `ctx.ui.notify`
// (src/extension/production-composition.ts:193). Group (C)'s five
// token-count cells red on `resolveCallableSet` returning `registered: true`
// with a truncated snapshot instead of the rejection.
//
// GREEN BY DESIGN and required to stay green (the positive controls that prove
// the closed grammar rejects these shapes specifically, not every `tools:`
// theta): the discovery precondition guard; `ctlcomma` (`read, grep`) and
// `goodrename` (`read as file_read`) staying registered; `badrename` keeping
// `theta/load/invalid-tool-rename` and NOT acquiring the new code; the
// one-token and three-with-`as` unit cells; and the both-spellings agreement
// cell.
//
// TIER: unit, offline, provider-free, deterministic — in two halves. Group (B)
// drives the production compose helper
// (`discoverAndComposeFixtures`) over a real on-disk `.pi/theta/` discovery
// workspace, which is what makes the witness a production-load witness rather
// than a resolver-only one: the frontmatter layer's non-scalar drop
// (constraint 3) is invisible below it. Group (C) calls `resolveCallableSet`
// directly to fix the token-count boundary, which the load path can only
// witness one entry shape at a time. No integration or live tier is reachable
// here for the load-time observable: registration and its diagnostics settle
// before any model or transport exists.
//
// NO SILENT SKIPPING: the group (B) precondition guard asserts the discovery
// walk registered its clean control, so an empty walk reds by name instead of
// letting every `not.toContain` pass vacuously.

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

const MALFORMED_TOOL_ENTRY_CODE = "theta/load/malformed-tool-entry";

// The normative *Message* template for the closed-grammar rejection. It is
// carried as a single constant here rather than read through
// `registryMessage`, because the registry row lands with the enforcement (bug
// doc §Fix constraint 4) and a `registryMessage` read of an absent row yields
// `undefined`, which would red every cell below on a placeholder-rendering
// failure instead of on the behaviour. Group (A) asserts the registry row IS
// this string, which is what keeps the constant sourced rather than prose.
const MSG = {
  // `theta/load/malformed-tool-entry`
  malformedToolEntry:
    "malformed 'tools:' entry '<value>'; expected a Pi tool name or a .theta path, optionally followed by an 'as' clause",
} as const;

/**
 * The rendered rejection message for one entry text. `<value>` is the entry as
 * written, unquoted — a `tools:` entry is a YAML scalar with no enclosing
 * source quoting, so the surrounding single quotes belong to the template
 * (placeholder-rendering-b.md:74).
 */
function malformed(value: string): string {
  return MSG.malformedToolEntry.replaceAll("<value>", value);
}

/** `theta/load/invalid-tool-rename` rendered for the `as BadName` target. */
const INVALID_RENAME_MESSAGE = expectedMessage(
  "theta/load/invalid-tool-rename",
  { "<name>": "BadName" },
);

// ===========================================================================
// Group (A) — the rejection is a registered code with a normative message.
// ===========================================================================

describe("Bug 0069 (A) — theta/load/malformed-tool-entry is a registered diagnostic (DIAG-4)", () => {
  it("carries the normative Message string every witness below renders", () => {
    const message = registryMessage(REGISTRY, MALFORMED_TOOL_ENTRY_CODE) as
      | string
      | undefined;
    expect(
      message,
      `${MALFORMED_TOOL_ENTRY_CODE} has no row in ` +
        "docs/spec_topics/diagnostics/code-registry-load.md: the closed entry " +
        "grammar has no code to report and DIAG-4 has no string to source",
    ).toBeDefined();
    expect(
      message,
      "the registry row's Message must be the template the witnesses render",
    ).toBe(MSG.malformedToolEntry);
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
 * The `.theta` files planted under the project discovery source. Each
 * malformed-entry theta is paired with a positive control carrying the same
 * shape minus the residue, so a red distinguishes "the closed grammar rejects
 * this entry" from "the load path rejects every `tools:` theta". Every body is
 * a bare query: it names no callable, so the only reachable diagnostic is the
 * `tools:` one and a red can never be a downstream body reference.
 */
const THETAS: readonly PlantedTheta[] = [
  // The documented comma short form with one comma dropped — the load-bearing
  // row: a one-character typo that removes `grep` from the model's active set
  // and from theta code's callable set alike.
  {
    stem: "nocommaq",
    text: theta("---", "mode: prompt", "tools: read grep", "---", "@`hi`"),
  },
  // Two names in one list entry: the same shape reached through the other YAML
  // spelling.
  {
    stem: "twotoken",
    text: theta("---", "mode: prompt", "tools:", "  - read bash", "---", "@`hi`"),
  },
  // The dangling `as` — a truncated rename, not an entry without one (bug doc
  // §Fix constraint 2).
  {
    stem: "danglingas",
    text: theta("---", "mode: prompt", "tools:", "  - read as", "---", "@`hi`"),
  },
  // Residue after a grammatically complete `as` clause: the rename target is
  // accepted as if the author had finished writing it.
  {
    stem: "asresidue",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - read as file_read junk_here",
      "---",
      "@`hi`",
    ),
  },
  // Three tokens whose middle token is not `as`: the token count matches the
  // rename shape but the keyword does not.
  {
    stem: "threenoas",
    text: theta("---", "mode: prompt", "tools:", "  - read is file_read", "---", "@`hi`"),
  },
  // A non-scalar sequence item (bug doc §Fix constraint 3): dropped at the
  // frontmatter layer today, so no resolver-only diagnostic can cover it.
  {
    stem: "mapitem",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - read",
      "  - {a: b}",
      "---",
      "@`hi`",
    ),
  },

  // Positive control: the short form written with its comma — two single-token
  // entries, the spelling `nocommaq` is one keystroke away from.
  {
    stem: "ctlcomma",
    text: theta("---", "mode: prompt", "tools: read, grep", "---", "@`hi`"),
  },
  // Positive control: the complete three-token `as` form.
  {
    stem: "goodrename",
    text: theta("---", "mode: prompt", "tools:", "  - read as file_read", "---", "@`hi`"),
  },
  // Positive control for the non-goal: a three-token `as` entry whose target
  // breaks the lowercase-first rule keeps its own code and must not be
  // reclassified as a grammar failure.
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
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0069-"));
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

// The precondition every cell below rests on: the discovery walk found the
// planted workspace and the load path resolves `tools:` at all. Without it an
// empty walk would satisfy every un-registration assertion vacuously.
describe("Bug 0069 (B0) — the production load path discovered the planted workspace", () => {
  it("registers the clean short-form control (ctlcomma)", () => {
    expect(
      outcome.registered.length,
      "the project `.pi/theta/` discovery walk registered nothing — the setup " +
        "precondition is unmet." + observed(),
    ).toBeGreaterThan(0);
    expect(
      outcome.registered,
      "the clean `tools: read, grep` control did not register, so no red below " +
        "can be attributed to the entry grammar." + observed(),
    ).toContain("ctlcomma");
  });
});

describe("Bug 0069 (B1) — a dropped comma in the short form un-registers the theta", () => {
  it("theta/load/malformed-tool-entry: `tools: read grep` does not register", () => {
    expect(
      outcome.registered,
      "`tools: read grep` registered: the second name left the callable set " +
        "and the theta runs with a set its author never wrote." + observed(),
    ).not.toContain("nocommaq");
  });

  it("theta/load/malformed-tool-entry: the load path surfaces the rejection naming `read grep`", () => {
    expect(
      outcome.notifications,
      "no diagnostic names the entry `read grep`: the dropped name is " +
        "unreachable from the model and from theta code, silently." + observed(),
    ).toContain(malformed("read grep"));
  });
});

describe("Bug 0069 (B2) — two tokens in a list entry un-register the theta", () => {
  it("theta/load/malformed-tool-entry: `- read bash` does not register", () => {
    expect(
      outcome.registered,
      "`- read bash` registered with `bash` discarded." + observed(),
    ).not.toContain("twotoken");
  });

  it("theta/load/malformed-tool-entry: the load path surfaces the rejection naming `read bash`", () => {
    expect(
      outcome.notifications,
      "no diagnostic names the entry `read bash`." + observed(),
    ).toContain(malformed("read bash"));
  });
});

describe("Bug 0069 (B3) — the dangling `as` un-registers the theta (constraint 2)", () => {
  it("theta/load/malformed-tool-entry: `- read as` does not register", () => {
    expect(
      outcome.registered,
      "`- read as` registered: a truncated rename resolved as a rename-less " +
        "entry instead of being rejected." + observed(),
    ).not.toContain("danglingas");
  });

  it("theta/load/malformed-tool-entry: the load path surfaces the rejection naming `read as`", () => {
    expect(
      outcome.notifications,
      "no diagnostic names the entry `read as`." + observed(),
    ).toContain(malformed("read as"));
  });
});

describe("Bug 0069 (B4) — residue after a complete `as` clause un-registers the theta", () => {
  it("theta/load/malformed-tool-entry: `- read as file_read junk_here` does not register", () => {
    expect(
      outcome.registered,
      "`- read as file_read junk_here` registered and bound `file_read`: the " +
        "rename target was accepted as complete." + observed(),
    ).not.toContain("asresidue");
  });

  it("theta/load/malformed-tool-entry: the load path surfaces the rejection naming the whole entry", () => {
    expect(
      outcome.notifications,
      "no diagnostic names the entry `read as file_read junk_here`." + observed(),
    ).toContain(malformed("read as file_read junk_here"));
  });
});

describe("Bug 0069 (B5) — three tokens whose middle token is not `as` un-register the theta", () => {
  it("theta/load/malformed-tool-entry: `- read is file_read` does not register", () => {
    expect(
      outcome.registered,
      "`- read is file_read` registered: the token count matched the rename " +
        "shape, so both trailing tokens were discarded." + observed(),
    ).not.toContain("threenoas");
  });

  it("theta/load/malformed-tool-entry: the load path surfaces the rejection naming `read is file_read`", () => {
    expect(
      outcome.notifications,
      "no diagnostic names the entry `read is file_read`." + observed(),
    ).toContain(malformed("read is file_read"));
  });
});

describe("Bug 0069 (B6) — a non-scalar sequence item un-registers the theta (constraint 3)", () => {
  it("a `tools:` list carrying `- {a: b}` does not register", () => {
    expect(
      outcome.registered,
      "the theta whose `tools:` list carries the non-scalar item `{a: b}` " +
        "registered: the item was dropped before the entry grammar saw it." +
        observed(),
    ).not.toContain("mapitem");
  });

  it("the load path surfaces an error-severity diagnostic naming the item's source text", () => {
    // The item's verbatim YAML source is the only text that identifies it to
    // the author, and constraint 3 requires a disposition that names it. Which
    // code fires is the implementation's to settle: the recovered source flows
    // into the entry grammar, where a two-token slice is a grammar rejection
    // and a single-token slice is a `.theta`-path resolution failure.
    expect(
      outcome.notifications.some((n) => n.includes("{a: b}")),
      "no diagnostic names the non-scalar `tools:` item `{a: b}`." + observed(),
    ).toBe(true);
  });
});

describe("Bug 0069 (B7) — the positive controls still register", () => {
  it("`tools: read, grep` (the comma short form) registers", () => {
    expect(
      outcome.registered,
      "the closed grammar must reject residue, not the documented short form." +
        observed(),
    ).toContain("ctlcomma");
  });

  it("`- read as file_read` (the complete three-token `as` form) registers", () => {
    expect(
      outcome.registered,
      "the closed grammar admits exactly one token or three with `as`; the " +
        "`as` form must survive." + observed(),
    ).toContain("goodrename");
  });
});

describe("Bug 0069 (B8) — the `as`-target rule keeps its own code (§Non-goals)", () => {
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

  it("`read as BadName` is not reclassified as a grammar failure", () => {
    // The grammar check precedes the `as`-target validation, so a three-token
    // `as` entry reaches the rename rule; only a fourth token makes it
    // malformed.
    expect(
      outcome.notifications,
      "a three-token `as` entry is grammatically well-formed; its target is " +
        "what the rename rule rejects." + observed(),
    ).not.toContain(malformed("read as BadName"));
  });
});

// ===========================================================================
// Group (C) — the token-count boundary, directly on `resolveCallableSet`.
// ===========================================================================

/** The first diagnostic carrying `code`, if any. */
function withCode(diags: readonly Diagnostic[], code: string): Diagnostic | undefined {
  return diags.find((d) => d.code === code);
}

/** `CallableSetDeps` over an explicit Pi-tool registry; nothing else resolves. */
function deps(piTools: readonly string[]): CallableSetDeps {
  const available = new Set(piTools);
  return {
    resolvePiTool: (name) =>
      available.has(name)
        ? { kind: "pi-tool", toolDefinition: { name } as never }
        : undefined,
    resolveThetaCallee: () => undefined,
    reservedNames: new Set<string>(),
  };
}

/** Resolve a comma-separated short-form `tools:` value. */
function resolveScalar(text: string, piTools: readonly string[]): CallableSetResult {
  const tools: ToolsField = { kind: "scalar", text };
  return resolveCallableSet({ file: "test.theta", tools, deps: deps(piTools) });
}

/** Resolve a YAML list-form `tools:` value. */
function resolveList(
  items: readonly string[],
  piTools: readonly string[],
): CallableSetResult {
  const tools: ToolsField = { kind: "list", items };
  return resolveCallableSet({ file: "test.theta", tools, deps: deps(piTools) });
}

/** Assert `entry` is rejected by the closed grammar, naming itself verbatim. */
function expectMalformed(result: CallableSetResult, entry: string): void {
  const dg = withCode(result.diagnostics, MALFORMED_TOOL_ENTRY_CODE);
  expect(
    dg,
    `no ${MALFORMED_TOOL_ENTRY_CODE} for the entry \`${entry}\`; diagnostics: ` +
      JSON.stringify(result.diagnostics),
  ).toBeDefined();
  expect(dg?.severity, "the rejection is error-severity (bug doc §Fix constraint 1)").toBe(
    "error",
  );
  expect(dg?.message, "the entry text is named verbatim").toBe(malformed(entry));
  expect(
    result.registered,
    "a malformed entry un-registers the whole theta, matching " +
      "`theta/load/unknown-tool`'s all-or-nothing posture",
  ).toBe(false);
  expect(
    result.callableSet,
    "a rejected theta carries no resolution snapshot, so no narrowed set survives",
  ).toBeUndefined();
}

describe("Bug 0069 (C1) — one token is the bare-spec production", () => {
  it("a single-token entry resolves and binds its name", () => {
    // Positive control: the shape the closed grammar's first production admits.
    const r = resolveList(["read"], ["read"]);
    expect(r.registered).toBe(true);
    expect(r.callableSet?.entries.has("read")).toBe(true);
    expect(
      withCode(r.diagnostics, MALFORMED_TOOL_ENTRY_CODE),
      "a bare spec is well-formed",
    ).toBeUndefined();
  });
});

describe("Bug 0069 (C2) — two tokens are malformed", () => {
  it("theta/load/malformed-tool-entry: `read bash` is rejected, not truncated to `read`", () => {
    const r = resolveList(["read bash"], ["read", "bash"]);
    expectMalformed(r, "read bash");
  });

  it("theta/load/malformed-tool-entry: the dangling `as` in `read as` is a truncated rename (constraint 2)", () => {
    const r = resolveList(["read as"], ["read"]);
    expectMalformed(r, "read as");
  });
});

describe("Bug 0069 (C3) — three tokens are well-formed only with `as` in the middle", () => {
  it("`read as file_read` resolves under the renamed name", () => {
    // Positive control: the closed grammar's second production.
    const r = resolveList(["read as file_read"], ["read"]);
    expect(r.registered).toBe(true);
    expect(r.callableSet?.entries.has("file_read")).toBe(true);
    expect(
      withCode(r.diagnostics, MALFORMED_TOOL_ENTRY_CODE),
      "a complete `as` clause is well-formed",
    ).toBeUndefined();
  });

  it("theta/load/malformed-tool-entry: `read is file_read` is rejected — the middle token must be `as`", () => {
    const r = resolveList(["read is file_read"], ["read"]);
    expectMalformed(r, "read is file_read");
  });
});

describe("Bug 0069 (C4) — four or more tokens are malformed", () => {
  it("theta/load/malformed-tool-entry: `read as file_read junk_here` is rejected, not truncated to a rename", () => {
    const r = resolveList(["read as file_read junk_here"], ["read"]);
    expectMalformed(r, "read as file_read junk_here");
  });

  it("theta/load/malformed-tool-entry: the grammar check precedes the `as`-target rule", () => {
    // `read as BadName` is three tokens and reaches the rename rule (C5);
    // adding a fourth makes the entry itself malformed, so the grammar
    // rejection is the one that fires.
    const r = resolveList(["read as BadName junk"], ["read"]);
    expectMalformed(r, "read as BadName junk");
    expect(
      withCode(r.diagnostics, "theta/load/invalid-tool-rename"),
      "a malformed entry has no rename target to validate",
    ).toBeUndefined();
  });
});

describe("Bug 0069 (C5) — the `as`-target rule is untouched (§Non-goals)", () => {
  it("theta/load/invalid-tool-rename: `read as MyTool` still fails on its target, not its shape", () => {
    // Positive control for the ordering: three tokens with `as` are
    // well-formed, so the entry reaches the lowercase-first rule.
    const r = resolveList(["read as MyTool"], ["read"]);
    expect(withCode(r.diagnostics, "theta/load/invalid-tool-rename")).toBeDefined();
    expect(
      withCode(r.diagnostics, MALFORMED_TOOL_ENTRY_CODE),
      "a well-formed entry with a bad target is not a grammar failure",
    ).toBeUndefined();
    expect(r.registered).toBe(false);
  });
});

describe("Bug 0069 (C6) — both YAML spellings answer to the same closed grammar", () => {
  it("theta/load/malformed-tool-entry: the short form `read grep` is one malformed entry, not two names", () => {
    // §YAML-shape splits the plain scalar on commas ONLY, so `read grep` is a
    // single entry and the comma is what separates names.
    const r = resolveScalar("read grep", ["read", "grep"]);
    expectMalformed(r, "read grep");
  });

  it("`read, grep` binds both names", () => {
    // Positive control: the spelling one keystroke away from the row above.
    const r = resolveScalar("read, grep", ["read", "grep"]);
    expect(r.registered).toBe(true);
    expect([...(r.callableSet?.entries.keys() ?? [])].sort()).toEqual(["grep", "read"]);
  });
});
