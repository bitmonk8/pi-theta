import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { ThetaFixture } from "../src/extension/factory";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
} from "../src/parser/theta-document";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import type { ThetaSource } from "../src/lexer/lexer";
import type { Diagnostic } from "../src/diagnostics/diagnostic";

// Bug 0106 — three `tools:` entry-grammar derivations stayed outside the
// lock-step bug 0069 closed
// (docs/bugs/0106-tools-entry-grammar-derivations-outside-lockstep.md). Each
// re-derives "what does this entry name" for an entry the closed grammar
// (`parseToolsEntry` in src/parser/callable-set.ts) rejects:
//
//   1. `toolsEntrySpec` (src/extension/production-composition.ts) returns
//      `parts[0]` for any token count, and the pre-parse callee cache (the
//      `for (const entry of toolsList)` loop, calling `toolsEntrySpec` at its
//      `const spec = toolsEntrySpec(entry)` line) keys on that answer. So
//      `- ./zbroken.theta junk` puts `./zbroken.theta` in the cache, the V15f
//      loop over the cache (`for (const [spec, callee] of calleeCache)`)
//      raises `theta/load/callee-has-errors` for it, and `resolveCallableSet`
//      (its diagnostics appended via `diagnostics.push(...result.diagnostics)`)
//      then raises `theta/load/malformed-tool-entry` for the same entry. ONE
//      authoring mistake, TWO error-severity diagnostics.
//   2. `toolCallableName` (src/parser/theta-document.ts) feeds the whole-file
//      identifier root scope (its `const name = toolCallableName(entry)` call)
//      and the `callables` set (`callables.add(presented)`).
//   3. `piToolCallableName` (src/parser/theta-document.ts) feeds the `piTools`
//      set (`piTools.add(piName)`).
//
// THE ADJUDICATED ROUTE this file pins (bug doc §Fix (a)/(b), settled on
// measured evidence in the run):
//   - §Fix (b), SECOND placement: the pre-parse callee-cache loop skips an
//     entry whose `parseToolsEntry` result is not `ok`. That closes the
//     load-time co-fire. `toolsEntrySpec` stays a pure projection — it has a
//     second caller at HEAD (`checkNestedToolsContainment`, calling it at its
//     own `const spec = toolsEntrySpec(entry)` line, added by bug 0111) that is
//     outside 0106's scope.
//   - Derivations 2 and 3 KEEP their deliberately-wider tolerance (bug doc
//     §Fix constraint 7 records it at each site). Measured: delegating them
//     substitutes `theta/parse/unknown-identifier` /
//     `theta/parse/bare-object-literal` for the load-time rejection that names
//     the actual mistake, and — because `parseDiscoveredTheta`'s drop gate
//     (its `hasLoadParseError(document.diagnostics)` check in
//     src/extension/production-composition.ts) drops a theta carrying an
//     error-severity parse diagnostic before `tools:` resolution runs — makes
//     `theta/load/malformed-tool-entry` UNREACHABLE for strictly more
//     spellings than today. The optimised observable is the REACHABILITY of
//     that diagnostic; delegation strictly reduces it.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/frontmatter/frontmatter-fields-a.md:88 — the closed
//     per-entry grammar: "Any other token sequence in an entry … is
//     `theta/load/malformed-tool-entry` and the theta does not register."
//   - docs/spec_topics/diagnostics/code-registry-load.md:25 — the
//     `theta/load/malformed-tool-entry` row: "one malformed entry un-registers
//     the whole theta".
//   - :40 — the `theta/load/callee-has-errors` row, whose *Trigger* presupposes
//     "A `.theta` callee referenced by an `invoke(...)` literal or a `tools:`
//     `.theta` entry". A malformed token sequence is neither entry kind, so
//     that code's subject does not exist for this input (DIAG-2: a *Trigger* is
//     the normative condition, not a description of the emission set).
//   - :28 — `theta/load/unresolvable-theta-path`, which a WELL-FORMED entry
//     naming a missing file must keep drawing (bug doc §Fix constraint 3: the
//     cache gate must not change which code a well-formed entry draws).
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:74 (DIAG-4) — the
//     registry *Message* column is normative; every expected string below is
//     sourced from the registry, never pasted prose.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:56
//     (`tool-arg-not-object-literal`), :69 (`shadowed-callable-call`), :68
//     (`unknown-identifier`), :50 (`bare-object-literal`) — the parse-layer
//     gates the two parse-time derivations feed.
//
// WHAT IS RED HERE AND WHY. Group (A)'s three co-fire cells red: at HEAD each
// malformed `.theta`-path entry draws BOTH codes, in the order
// `callee-has-errors` → `malformed-tool-entry`, and the cells assert the
// grammar rejection ALONE. Every other cell in the file is GREEN at HEAD and
// pins behaviour the adjudicated route preserves: the four separable controls,
// the unchanged registered set, the well-formed missing-file code, the parse-
// time tolerance in both directions, and the two pre-emption rows.
//
// TIER: unit, offline, provider-free, deterministic (bug doc §Fix
// constraint 6 — "no integration or live tier is reachable for a load-time
// observable that settles before any model or transport exists"). Group (A)
// and group (C) settle in ONE `discoverAndComposeFixtures` call over a real
// on-disk `.pi/theta/` workspace, the group (B) harness shape of
// tests/tools-entry-closed-grammar.test.ts; group (B) here calls the real
// `parseThetaDocument` over a production-shaped `ParseThetaDocumentDeps` (the
// `makeDeps` / `diagsOf` shape of tests/tool-arg-shape-enforcement.test.ts),
// because the two parse-time derivations run strictly before any `tools:`
// resolution exists and a load-path row cannot separate "the name was seeded"
// from "the entry was rejected".
//
// NO SILENT SKIPPING: cell (A0) asserts the discovery walk registered its
// clean control, so an empty walk reds by name instead of satisfying every
// `not.toContain` / empty-code-list assertion vacuously.

// ===========================================================================
// Registry Message strings (DIAG-4).
// ===========================================================================

function loadRegistry(relative: string): { code: string; message: string }[] {
  return parseRegistry(
    readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8"),
  ) as { code: string; message: string }[];
}

const LOAD_REGISTRY = loadRegistry(
  "../docs/spec_topics/diagnostics/code-registry-load.md",
);
const PARSE_REGISTRY = loadRegistry(
  "../docs/spec_topics/diagnostics/code-registry-parse.md",
);

/** Source a code's registered *Message* template and fill its `<…>` placeholders. */
function rendered(
  registry: { code: string; message: string }[],
  code: string,
  subs: Readonly<Record<string, string>> = {},
): string {
  let message = registryMessage(registry, code) as string | undefined;
  expect(
    message,
    `${code} has no row in the sharded registry, so DIAG-4 has no normative ` +
      "string for this cell to source",
  ).toBeDefined();
  let out = message as string;
  for (const [placeholder, value] of Object.entries(subs)) {
    // `replaceAll` — the shadowed-callable template repeats `<name>`.
    out = out.replaceAll(placeholder, value);
  }
  return out;
}

const MALFORMED = "theta/load/malformed-tool-entry";
const CALLEE_HAS_ERRORS = "theta/load/callee-has-errors";
const UNRESOLVABLE_PATH = "theta/load/unresolvable-theta-path";
const TOOL_ARG_SHAPE = "theta/parse/tool-arg-not-object-literal";
const SHADOWED_CALL = "theta/parse/shadowed-callable-call";
const BARE_OBJECT = "theta/parse/bare-object-literal";
const UNKNOWN_IDENT = "theta/parse/unknown-identifier";

/** The grammar rejection rendered for one entry text (`<value>` is unquoted). */
function malformedMessage(entry: string): string {
  return rendered(LOAD_REGISTRY, MALFORMED, { "<value>": entry });
}

// ===========================================================================
// Group (A) + (C) harness — one production load over a planted workspace.
// ===========================================================================

interface PlantedTheta {
  readonly stem: string;
  readonly text: string;
}

function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}

/**
 * The `.theta` files planted under the project discovery source.
 *
 * `zbroken` is the erroneous callee (an unresolved `params:` named type is an
 * error-severity parse diagnostic, so it is exactly the V15f `hasErrors`
 * subject); `zgood` is its error-free twin. The three `cofire*` callers pair a
 * MALFORMED entry with `zbroken`, which is the pairing no cell in the tree had
 * before this file. The controls partition the cause (bug doc §Fix
 * constraint 2), so a red distinguishes "the co-fire is closed" from "the V15f
 * check is broken".
 *
 * The `p*` callers carry a body call of the name the malformed entry's
 * derivation seeds — group (C)'s subject, and the reason no other cell here
 * uses a query-only body.
 */
const THETAS: readonly PlantedTheta[] = [
  // --- the two callees ----------------------------------------------------
  {
    stem: "zbroken",
    text: theta(
      "---",
      "mode: subagent",
      "params:",
      "  x: NoSuchType",
      "---",
      "@`broken`",
    ),
  },
  { stem: "zgood", text: theta("---", "mode: subagent", "---", "@`good`") },

  // --- the co-fire rows: a malformed entry whose FIRST TOKEN names the
  //     erroneous callee, in all three malformed `.theta`-path spellings ----
  {
    stem: "cofire",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./zbroken.theta junk",
      "---",
      "@`hi`",
    ),
  },
  {
    stem: "cofireas",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./zbroken.theta as",
      "---",
      "@`hi`",
    ),
  },
  {
    stem: "cofire4",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./zbroken.theta as reviewer junk",
      "---",
      "@`hi`",
    ),
  },

  // --- the four separable controls (constraint 2) -------------------------
  // Well-formed entry, erroneous callee: `callee-has-errors` ALONE.
  {
    stem: "ctlwell",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./zbroken.theta",
      "---",
      "@`hi`",
    ),
  },
  // Malformed entry naming no existing file: the grammar rejection ALONE.
  {
    stem: "ctlnofile",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./nosuchfile.theta junk",
      "---",
      "@`hi`",
    ),
  },
  // Malformed entry naming an error-free callee: the grammar rejection ALONE.
  {
    stem: "ctlgoodres",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./zgood.theta junk",
      "---",
      "@`hi`",
    ),
  },
  // Malformed entry whose first token is a bare Pi-tool name: never enters the
  // cache at all (`isBareToolName` in production-composition.ts).
  {
    stem: "ctlpitool",
    text: theta("---", "mode: prompt", "tools:", "  - read bash", "---", "@`hi`"),
  },

  // --- the clean control and the constraint-3 control ---------------------
  {
    stem: "ctlgood",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./zgood.theta",
      "---",
      "@`hi`",
    ),
  },
  // Constraint 3: a WELL-FORMED entry naming a missing file must keep drawing
  // `theta/load/unresolvable-theta-path` — gating the cache must not change
  // which code a well-formed entry draws.
  {
    stem: "ctlmissing",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./nosuchfile.theta",
      "---",
      "@`hi`",
    ),
  },

  // --- group (C): the derived name reaches a parse-layer gate -------------
  // Reaches the grammar rejection (the bare-object carve-out stands the
  // bare-object rejection down, so no error-severity parse diagnostic drops
  // the theta first).
  {
    stem: "pobj",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - read bash",
      "---",
      'let r = read({ path: "x" })',
      "r",
    ),
  },
  // PRE-EMPTED: the derived name makes the call a Pi-tool call site, so the
  // argument-shape gate fires at parse and the drop gate short-circuits the
  // pass before `resolveThetaToolsAtLoad` runs.
  {
    stem: "pshape",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - read bash",
      "---",
      'let r = read("x")',
      "r",
    ),
  },
  // PRE-EMPTED: the derived name enters the `callables` set, so a local
  // binding of the same name is a shadowed-callable call.
  {
    stem: "pshadow",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - read bash",
      "---",
      'let read = "s"',
      'let r = read({ path: "y" })',
      "r",
    ),
  },
  // Reaches the grammar rejection: a `.theta`-callable call of the derived
  // name parses clean, so nothing pre-empts the load-time rejection.
  {
    stem: "pthetacall",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./zgood.theta junk",
      "---",
      'let r = zgood("x")',
      "r",
    ),
  },
];

// ===========================================================================
// Group (D) fixtures — bug 0248's additional plant (out-of-root dependent).
// ===========================================================================
//
// Bug 0248 (docs/bugs/0248-malformed-escaping-tools-entry-containment-
// unwitnessed.md) is bug 0106 §Fix residual 2's filing: the cache-head
// `parseToolsEntry` gate also removes `theta/load/invoke-path-escape` from
// every MALFORMED entry, and no cell paired a malformed entry with an escaping
// first token. Group (D) plants that pairing at BOTH depths: the entry text
// `<out-of-root>/…far.theta junk` written by the discovered caller (depth 0)
// and written by a `tools:`-reached callee (depth 1). One subject test governs
// both — a malformed token sequence is not a `tools:` `.theta` entry, so it is
// not the containment rule's subject wherever it is written.
//
// These fixtures cannot join `THETAS`: their entry text interpolates the
// out-of-root directory, which does not exist until `beforeAll` runs. They are
// planted into their OWN workspace and read through their OWN production load,
// because the depth-1 composed caller REGISTERS (it draws no diagnostic — cell
// (D3)) while bug 0106's cell (A6) pins its own walk's registered set to
// `["ctlgood", "zgood"]` exactly. Two walks keep that set byte-identical and
// still let group (D) assert its own registration outcome, so neither group's
// invariant is expressed in terms of the other group's plant.

/** The out-of-root callee's stem — clean, `mode: subagent`, never discovered. */
const OUT_OF_ROOT_CALLEE = "b0248far";

/** The out-of-root callee's `tools:`-entry spelling: absolute, forward-slash. */
function outSpec(outDir: string): string {
  return `${outDir.replaceAll("\\", "/")}/${OUT_OF_ROOT_CALLEE}.theta`;
}

/** The three malformed spellings of the escaping entry (bug 0248 §Fix (d) 1). */
function b0248MalformedEntries(outDir: string): readonly string[] {
  const spec = outSpec(outDir);
  return [`${spec} junk`, `${spec} as`, `${spec} as r junk`];
}

/** Stems, in the same order, for the three malformed spellings. */
const B0248_MALFORMED_STEMS = [
  "b0248mesc2",
  "b0248mescas",
  "b0248mesc4",
] as const;

/** The group's own clean callee and the clean caller naming it (cell (D0)). */
const B0248_CLEAN_CALLEE = "b0248zgood";
const B0248_CLEAN_CALLER = "b0248ctlgood";

function b0248Thetas(outDir: string): readonly PlantedTheta[] {
  const spec = outSpec(outDir);
  const caller = (entry: string): string =>
    theta("---", "mode: subagent", "tools:", `  - ${entry}`, "---", "@`hi`");
  const malformed = b0248MalformedEntries(outDir);
  return [
    // (D0) this walk's clean registering control: a contained, error-free
    // callee and a well-formed entry naming it. Every un-registration and
    // every empty-code-list assertion in the group is vacuous in a walk that
    // registered nothing, so the group carries its own.
    {
      stem: B0248_CLEAN_CALLEE,
      text: theta("---", "mode: subagent", "---", "@`good`"),
    },
    { stem: B0248_CLEAN_CALLER, text: caller(`./${B0248_CLEAN_CALLEE}.theta`) },
    // (D1) depth 0, COMPOSED: malformed AND escaping, three spellings.
    ...B0248_MALFORMED_STEMS.map((stem, i) => ({
      stem,
      text: caller(malformed[i] as string),
    })),
    // (D2) depth 0, CONTROL: the same escaping path, WELL-FORMED. Without it,
    // (D1) passes when the escape surface is dead.
    { stem: "b0248ctlesc", text: caller(spec) },
    // (D3) depth 1, COMPOSED: the callee's OWN entry is malformed and escaping;
    // the caller names the callee with a WELL-FORMED entry.
    { stem: "b0248nestmesc", text: caller(`${spec} junk`) },
    { stem: "b0248callnestmesc", text: caller("./b0248nestmesc.theta") },
    // (D4) depth 1, CONTROL: bug 0111's shipped class — the callee's escaping
    // entry is well-formed, so the caller keeps the containment refusal.
    { stem: "b0248nestwesc", text: caller(spec) },
    { stem: "b0248callnestwesc", text: caller("./b0248nestwesc.theta") },
  ];
}

interface LoadOutcome {
  /** Slash names the production compose helper returned, sorted. */
  readonly registered: readonly string[];
  /** Per planted stem, the diagnostic codes in emission order. */
  readonly codes: ReadonlyMap<string, readonly string[]>;
  /** Per planted stem, the rendered `<code>: <message>` lines in order. */
  readonly lines: ReadonlyMap<string, readonly string[]>;
  /** Every stderr-mirror line, for assertion messages. */
  readonly raw: readonly string[];
}

/**
 * The headless stderr mirror (`makeLoadEmit` in
 * src/extension/production-composition.ts) is the only load-path surface
 * that carries a diagnostic's CODE and its per-file attribution — `ctx.ui.notify`
 * receives the message alone. `ctx.hasUI` is left unset (falsy), which is the
 * headless `-p`/CI arm the mirror is written for.
 */
const MIRRORED = /^theta: (?<file>.*?\.theta)(?::\d+:\d+)?: (?<code>theta\/[a-z-]+\/[a-z-]+): /;

function stemOf(file: string): string {
  const base = file.split(/[\\/]/).pop() ?? file;
  return base.replace(/\.theta$/, "");
}

let outcome: LoadOutcome;
let workspaceDir: string;
/**
 * Group (D)'s own planted workspace and its own production load. Separate from
 * the groups (A)/(C) workspace because the depth-1 composed caller registers
 * (cell (D3)) and cell (A6) pins its own walk's registered set exactly; one
 * shared walk would express each group's invariant in terms of the other
 * group's plant.
 */
let b0248WorkspaceDir: string;
let b0248Outcome: LoadOutcome;
/**
 * The bug-0248 out-of-root directory: a `mkdtempSync` sibling of group (D)'s
 * workspace that no active discovery root contains, so a `tools:` entry naming
 * a `.theta` inside it is the INV-1 escape subject
 * (docs/spec_topics/invocation.md:12, and the
 * `theta/load/invoke-path-escape` *Trigger* at
 * docs/spec_topics/diagnostics/code-registry-load.md:35). Created in the same
 * `beforeAll`, removed in the same `afterAll`.
 */
let outOfRootDir: string;

async function runProductionLoad(cwd: string): Promise<LoadOutcome> {
  const chunks: string[] = [];
  const stderrSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk): boolean => {
      chunks.push(String(chunk));
      return true;
    });
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
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;

  let fixtures: readonly ThetaFixture[];
  try {
    fixtures = await discoverAndComposeFixtures(pi, ctx);
  } finally {
    stderrSpy.mockRestore();
  }

  const raw = chunks.join("").split("\n").filter((l) => l.trim().length > 0);
  const codes = new Map<string, string[]>();
  const lines = new Map<string, string[]>();
  for (const line of raw) {
    const m = MIRRORED.exec(line);
    if (m?.groups === undefined) {
      // Hint / related continuation lines are indented; they carry no code.
      continue;
    }
    const stem = stemOf(m.groups["file"] as string);
    const code = m.groups["code"] as string;
    (codes.get(stem) ?? codes.set(stem, []).get(stem)!).push(code);
    (lines.get(stem) ?? lines.set(stem, []).get(stem)!).push(
      line.slice(line.indexOf(code)),
    );
  }
  return {
    registered: fixtures.map((f) => f.slashName).sort(),
    codes,
    lines,
    raw,
  };
}

beforeAll(async () => {
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0106-"));
  const projectThetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(projectThetaDir, { recursive: true });
  for (const planted of THETAS) {
    writeFileSync(
      join(projectThetaDir, `${planted.stem}.theta`),
      planted.text,
      "utf8",
    );
  }
  // A minimal valid settings file pins the settings read to a known value; an
  // ABSENT one is silent, so this is hermeticity rather than noise suppression.
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
  outcome = await runProductionLoad(workspaceDir);

  // Group (D)'s plant: its own workspace, its own out-of-root directory (the
  // entry text interpolates a path that does not exist until now, which is why
  // these fixtures cannot be static members of `THETAS`), and its own walk.
  b0248WorkspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0248-"));
  const b0248ThetaDir = join(b0248WorkspaceDir, ".pi", "theta");
  mkdirSync(b0248ThetaDir, { recursive: true });
  writeFileSync(join(b0248WorkspaceDir, ".pi", "settings.json"), "{}", "utf8");
  outOfRootDir = mkdtempSync(join(tmpdir(), "theta-bug0248-out-"));
  writeFileSync(
    join(outOfRootDir, `${OUT_OF_ROOT_CALLEE}.theta`),
    theta("---", "mode: subagent", "---", "@`far`"),
    "utf8",
  );
  for (const planted of b0248Thetas(outOfRootDir)) {
    writeFileSync(
      join(b0248ThetaDir, `${planted.stem}.theta`),
      planted.text,
      "utf8",
    );
  }
  b0248Outcome = await runProductionLoad(b0248WorkspaceDir);
});

afterAll(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
  rmSync(b0248WorkspaceDir, { recursive: true, force: true });
  rmSync(outOfRootDir, { recursive: true, force: true });
});

/** The codes one planted stem drew, in emission order (`[]` when clean). */
function codesFor(stem: string): readonly string[] {
  return outcome.codes.get(stem) ?? [];
}

/**
 * The observation, rendered into an assertion message: the registered set,
 * plus the mirror lines for ONE stem when the cell is about one file (the
 * whole mirror otherwise — the setup guard, where any file may be the cause).
 */
function observed(stem?: string): string {
  const mirror =
    stem === undefined
      ? outcome.raw
      : outcome.raw.filter((l) => l.includes(`${stem}.theta`));
  return (
    ` Registered: ${JSON.stringify(outcome.registered)}` +
    ` Mirror${stem === undefined ? "" : `(${stem})`}: ${JSON.stringify(mirror)}`
  );
}

// The precondition every cell below rests on.
describe("bug 0106 (A0) — the production load path discovered the planted workspace", () => {
  it("registers the clean control (ctlgood) and reports the erroneous callee's own parse error", () => {
    expect(
      outcome.registered.length,
      "the project `.pi/theta/` discovery walk registered nothing — the setup " +
        "precondition is unmet and every code-set assertion below would pass " +
        "vacuously." + observed(),
    ).toBeGreaterThan(0);
    expect(
      outcome.registered,
      "the clean `- ./zgood.theta` control did not register, so no red below " +
        "can be attributed to the entry grammar." + observed(),
    ).toContain("ctlgood");
    expect(
      codesFor("zbroken"),
      "the erroneous callee must carry its OWN error-severity parse diagnostic, " +
        "or the V15f `hasErrors` subject does not exist and the co-fire cells " +
        "would pass for the wrong reason." + observed(),
    ).toEqual(["theta/parse/unresolved-named-type"]);
  });
});

// ===========================================================================
// Group (A) — the load-time co-fire. RED at HEAD.
// ===========================================================================

/**
 * One co-fire row: a malformed entry whose first token names the erroneous
 * callee draws the grammar rejection ALONE, naming the entry verbatim.
 */
function expectGrammarRejectionAlone(stem: string, entry: string): void {
  expect(
    codesFor(stem),
    `PRIMARY (bug 0106): the malformed entry \`${entry}\` must draw ` +
      `${MALFORMED} ALONE. At HEAD the pre-parse callee cache keys on ` +
      "`toolsEntrySpec`'s first token (its call in `resolveThetaToolsAtLoad`, " +
      "production-composition.ts), so the cache resolves and parses " +
      "`./zbroken.theta` and the V15f callee-has-errors loop over the cache " +
      `pushes ${CALLEE_HAS_ERRORS} FIRST — two error-severity diagnostics for ` +
      "one entry, and the first names a callee the closed grammar says this " +
      "entry does not reference (code-registry-load.md:40)." + observed(stem),
  ).toEqual([MALFORMED]);
  expect(
    outcome.lines.get(stem) ?? [],
    "DIAG-4: the rejection renders the registry Message with the entry text " +
      "verbatim." + observed(stem),
  ).toEqual([`${MALFORMED}: ${malformedMessage(entry)}`]);
}

describe("bug 0106 (A1) — a two-token entry naming an erroneous callee draws the grammar rejection alone", () => {
  it(`${MALFORMED}: \`- ./zbroken.theta junk\` does not also draw ${CALLEE_HAS_ERRORS}`, () => {
    expectGrammarRejectionAlone("cofire", "./zbroken.theta junk");
  });
});

describe("bug 0106 (A2) — the dangling `as` spelling draws the grammar rejection alone", () => {
  it(`${MALFORMED}: \`- ./zbroken.theta as\` does not also draw ${CALLEE_HAS_ERRORS}`, () => {
    expectGrammarRejectionAlone("cofireas", "./zbroken.theta as");
  });
});

describe("bug 0106 (A3) — the four-token residue spelling draws the grammar rejection alone", () => {
  it(`${MALFORMED}: \`- ./zbroken.theta as reviewer junk\` does not also draw ${CALLEE_HAS_ERRORS}`, () => {
    expectGrammarRejectionAlone("cofire4", "./zbroken.theta as reviewer junk");
  });
});

describe("bug 0106 (A4) — the four controls stay separable (§Fix constraint 2)", () => {
  it(`${CALLEE_HAS_ERRORS}: a WELL-FORMED entry naming the erroneous callee keeps it alone`, () => {
    // The half that distinguishes "the co-fire is closed" from "the V15f check
    // is broken": narrowing the cache must not stop it firing for an entry the
    // grammar admits.
    expect(
      codesFor("ctlwell"),
      "the well-formed `- ./zbroken.theta` entry must keep drawing " +
        `${CALLEE_HAS_ERRORS} and nothing else.` + observed("ctlwell"),
    ).toEqual([CALLEE_HAS_ERRORS]);
    expect(
      outcome.lines.get("ctlwell") ?? [],
      "DIAG-4: the callee-has-errors Message is unchanged." + observed("ctlwell"),
    ).toEqual([
      `${CALLEE_HAS_ERRORS}: ` +
        rendered(LOAD_REGISTRY, CALLEE_HAS_ERRORS, {
          "<path>": "./zbroken.theta",
        }),
    ]);
  });

  it(`${MALFORMED}: a malformed entry naming NO existing file keeps it alone`, () => {
    expect(
      codesFor("ctlnofile"),
      "`- ./nosuchfile.theta junk` has no callee to have errors." +
        observed("ctlnofile"),
    ).toEqual([MALFORMED]);
  });

  it(`${MALFORMED}: a malformed entry naming an ERROR-FREE callee keeps it alone`, () => {
    expect(
      codesFor("ctlgoodres"),
      "`- ./zgood.theta junk`'s first token names a clean file, so only the " +
        "grammar rejection has a subject." + observed("ctlgoodres"),
    ).toEqual([MALFORMED]);
  });

  it(`${MALFORMED}: a malformed entry whose first token is a bare Pi-tool name keeps it alone`, () => {
    // `isBareToolName` (production-composition.ts) keeps a bare
    // identifier out of the callee cache, so this row is already single-coded
    // at HEAD and must stay so after the gate lands.
    expect(
      codesFor("ctlpitool"),
      "`- read bash` never enters the callee cache." + observed("ctlpitool"),
    ).toEqual([MALFORMED]);
  });

  it("a well-formed entry naming a clean callee draws nothing", () => {
    expect(
      codesFor("ctlgood"),
      "the closed grammar must reject residue, not every `tools:` theta." +
        observed("ctlgood"),
    ).toEqual([]);
  });
});

describe("bug 0106 (A5) — a well-formed entry naming a missing file keeps its own code (§Fix constraint 3)", () => {
  it(`${UNRESOLVABLE_PATH}: gating the callee cache does not change which code a well-formed entry draws`, () => {
    // `theta/load/unresolvable-theta-path` is raised inside `resolveEntry`
    // from an `ok` parse, downstream of the grammar arm, through the
    // `!callee.fileExists` arm of the `resolveThetaCallee` dep. A gate on the
    // cache narrows which entries are PRE-PARSED; it must not narrow which
    // entries the resolver judges.
    expect(
      codesFor("ctlmissing"),
      "`- ./nosuchfile.theta` (well-formed, missing file) must keep drawing " +
        `${UNRESOLVABLE_PATH} alone.` + observed("ctlmissing"),
    ).toEqual([UNRESOLVABLE_PATH]);
    expect(
      outcome.lines.get("ctlmissing") ?? [],
      "DIAG-4: the unresolvable-path Message is unchanged." +
        observed("ctlmissing"),
    ).toEqual([
      `${UNRESOLVABLE_PATH}: ` +
        rendered(LOAD_REGISTRY, UNRESOLVABLE_PATH, {
          "<path>": "./nosuchfile.theta",
        }),
    ]);
  });
});

describe("bug 0106 (A6) — the registration outcome is unchanged (§Fix constraint 1)", () => {
  it("only the two clean fixtures register, with or without the co-fire", () => {
    // No route may make a malformed entry register, and no route may make a
    // well-formed entry naming an erroneous callee register. Measured at HEAD
    // for exactly this plant set.
    expect(
      outcome.registered,
      "the registered set is the fix's invariant, not its subject." + observed(),
    ).toEqual(["ctlgood", "zgood"]);
  });
});

// ===========================================================================
// Group (B) — the parse-time tolerance, pinned in BOTH directions.
// ===========================================================================
//
// The real `parseThetaDocument` over a production-shaped
// `ParseThetaDocumentDeps`. Each row is a malformed `tools:` entry, its
// WELL-FORMED control (same derived name, grammatical spelling) and its
// NO-`tools:` control (the name unseeded). The malformed row must equal the
// well-formed control — that IS the deliberate width — and the no-entry
// control must differ, which is what proves the equality is the derivation's
// doing rather than a gate that never fires. If a later change delegates
// `toolCallableName` or `piToolCallableName` to `parseToolsEntry`, every
// malformed row collapses onto its no-entry control and these cells red.

const PARSE_FILE = "bug0106.theta";

function makeParseDeps(): ParseThetaDocumentDeps {
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

function diagsOf(src: string): readonly Diagnostic[] {
  const source: ThetaSource = {
    path: PARSE_FILE,
    bytes: new TextEncoder().encode(src),
  };
  return parseThetaDocument(source, makeParseDeps()).diagnostics;
}

function codesOf(diags: readonly Diagnostic[]): readonly string[] {
  return diags.map((d) => d.code);
}

/** A parse source: frontmatter with an optional `tools:` list, then a body. */
function doc(
  mode: "prompt" | "subagent",
  entry: string | undefined,
  ...body: readonly string[]
): string {
  const fm =
    entry === undefined
      ? ["---", `mode: ${mode}`, "---"]
      : ["---", `mode: ${mode}`, "tools:", `  - ${entry}`, "---"];
  return theta(...fm, ...body);
}

/**
 * One tolerance row. `malformedEntry` and `controlEntry` derive the SAME
 * presented name; `derivedName` is that name, which the no-entry control must
 * report as unknown.
 */
function expectDerivedNameStillSeeded(input: {
  readonly mode: "prompt" | "subagent";
  readonly malformedEntry: string;
  readonly controlEntry: string;
  readonly derivedName: string;
  readonly body: readonly string[];
  readonly noEntryCodes: readonly string[];
}): void {
  const malformed = diagsOf(doc(input.mode, input.malformedEntry, ...input.body));
  const control = diagsOf(doc(input.mode, input.controlEntry, ...input.body));
  const none = diagsOf(doc(input.mode, undefined, ...input.body));

  expect(
    codesOf(malformed),
    `the malformed entry \`${input.malformedEntry}\` must still seed the ` +
      `presented name '${input.derivedName}' at parse — the deliberate width ` +
      "bug 0106 §Fix constraint 7 records at `toolCallableName` and " +
      "`piToolCallableName` (both in src/parser/theta-document.ts). " +
      `Observed: ${JSON.stringify(codesOf(malformed))}; well-formed control: ` +
      `${JSON.stringify(codesOf(control))}`,
  ).toEqual(codesOf(control));

  expect(
    codesOf(none),
    "the no-`tools:` control must DIFFER, or the row above proves nothing " +
      "about the derivation: it would hold for a name no entry ever seeded. " +
      `Observed: ${JSON.stringify(codesOf(none))}`,
  ).toEqual(input.noEntryCodes);
  expect(
    codesOf(none),
    "the no-entry control and the malformed row must not coincide.",
  ).not.toEqual(codesOf(malformed));
}

describe("bug 0106 (B1) — a two-token entry still seeds its first token as the presented name", () => {
  it("`- read bash` parses byte-identically to `- read`; without an entry the name is unknown", () => {
    expectDerivedNameStillSeeded({
      mode: "prompt",
      malformedEntry: "read bash",
      controlEntry: "read",
      derivedName: "read",
      body: ['let r = read({ path: "x" })', "r"],
      // The bare-object carve-out stands down only for a Pi-tool call site, so
      // an unseeded name draws BOTH codes.
      noEntryCodes: [UNKNOWN_IDENT, BARE_OBJECT],
    });
  });

  it(`${UNKNOWN_IDENT}: the DISCARDED second token is the name that reads as unknown`, () => {
    // 0069's §Why it matters observable, unchanged and correct: the dropped
    // comma loses `bash`, and `bash` is what the author's body cannot name.
    const diags = diagsOf(
      doc("prompt", "read bash", 'let r = bash({ command: "x" })', "r"),
    );
    expect(codesOf(diags), "the second token is discarded, not bound").toEqual([
      UNKNOWN_IDENT,
      BARE_OBJECT,
    ]);
    expect(
      diags[0]?.message,
      "DIAG-4: the unknown-identifier Message names the discarded token",
    ).toBe(rendered(PARSE_REGISTRY, UNKNOWN_IDENT, { "<name>": "bash" }));
  });
});

describe("bug 0106 (B2) — the dangling `as` still seeds its first token", () => {
  it("`- read as` parses byte-identically to `- read`", () => {
    expectDerivedNameStillSeeded({
      mode: "prompt",
      malformedEntry: "read as",
      controlEntry: "read",
      derivedName: "read",
      body: ['let r = read({ path: "x" })', "r"],
      noEntryCodes: [UNKNOWN_IDENT, BARE_OBJECT],
    });
  });
});

describe("bug 0106 (B3) — three tokens whose middle token is not `as` still seed the first token", () => {
  it("`- read is file_read` parses byte-identically to `- read`", () => {
    expectDerivedNameStillSeeded({
      mode: "prompt",
      malformedEntry: "read is file_read",
      controlEntry: "read",
      derivedName: "read",
      body: ['let r = read({ path: "x" })', "r"],
      noEntryCodes: [UNKNOWN_IDENT, BARE_OBJECT],
    });
  });
});

describe("bug 0106 (B4) — a four-token entry still seeds its `as` TARGET", () => {
  it("`- read as file_read junk` parses byte-identically to `- read as file_read`", () => {
    // Both derivations test `parts.length >= 3 && parts[1] === "as"` where the
    // closed grammar tests `=== 3`, so the rename target survives a fourth
    // token.
    expectDerivedNameStillSeeded({
      mode: "prompt",
      malformedEntry: "read as file_read junk",
      controlEntry: "read as file_read",
      derivedName: "file_read",
      body: ['let r = file_read({ path: "x" })', "r"],
      noEntryCodes: [UNKNOWN_IDENT, BARE_OBJECT],
    });
  });
});

describe("bug 0106 (B5) — a malformed `.theta`-path entry still seeds its derived default name", () => {
  it("`- ./zbroken.theta junk` parses byte-identically to `- ./zbroken.theta`", () => {
    expectDerivedNameStillSeeded({
      mode: "subagent",
      malformedEntry: "./zbroken.theta junk",
      controlEntry: "./zbroken.theta",
      derivedName: "zbroken",
      body: ['let r = zbroken("x")', "r"],
      // A `.theta`-callable call takes a positional argument, so no
      // bare-object rejection is reachable here.
      noEntryCodes: [UNKNOWN_IDENT],
    });
  });
});

describe("bug 0106 (B6) — the two pre-empting gates read the same derived names", () => {
  it(`${TOOL_ARG_SHAPE}: \`- read bash\` makes \`read("x")\` a Pi-tool call site (piToolCallableName)`, () => {
    const malformed = diagsOf(doc("prompt", "read bash", 'let r = read("x")', "r"));
    const control = diagsOf(doc("prompt", "read", 'let r = read("x")', "r"));
    const none = diagsOf(doc("prompt", undefined, 'let r = read("x")', "r"));
    expect(
      codesOf(malformed),
      "the `piTools` set is filled from `piToolCallableName` " +
        "(src/parser/theta-document.ts), which admits the malformed entry.",
    ).toEqual([TOOL_ARG_SHAPE]);
    expect(codesOf(control), "identical to the well-formed control").toEqual(
      codesOf(malformed),
    );
    expect(
      codesOf(none),
      "without an entry the callee resolves to nothing",
    ).toEqual([UNKNOWN_IDENT]);
    expect(
      malformed[0]?.message,
      "DIAG-4: the argument-shape Message names the Pi tool the derivation supplied",
    ).toBe(rendered(PARSE_REGISTRY, TOOL_ARG_SHAPE, { "<name>": "read" }));
  });

  it(`${SHADOWED_CALL}: \`- read bash\` puts \`read\` in the callables set (toolCallableName)`, () => {
    const body = ['let read = "s"', 'let r = read({ path: "y" })', "r"];
    const malformed = diagsOf(doc("prompt", "read bash", ...body));
    const control = diagsOf(doc("prompt", "read", ...body));
    const none = diagsOf(doc("prompt", undefined, ...body));
    expect(
      codesOf(malformed),
      "the `callables` set is filled from `toolCallableName` " +
        "(src/parser/theta-document.ts), which admits the malformed entry.",
    ).toEqual([SHADOWED_CALL, BARE_OBJECT]);
    expect(codesOf(control), "identical to the well-formed control").toEqual(
      codesOf(malformed),
    );
    expect(
      codesOf(none),
      "without an entry there is no callable-set name to shadow",
    ).toEqual([BARE_OBJECT]);
    expect(
      malformed[0]?.message,
      "DIAG-4: the shadowed-callable Message asserts a callable-set entry the " +
        "closed grammar rejects — the falsehood bug 0106 measures, kept " +
        "deliberately because closing it costs the reachability group (C) pins",
    ).toBe(
      rendered(PARSE_REGISTRY, SHADOWED_CALL, {
        "<name>": "read",
        "<binder>": "let binding at line 6",
      }),
    );
  });
});

// ===========================================================================
// Group (C) — reachability of the grammar rejection, over the same load.
// ===========================================================================
//
// The observable the tolerance BUYS, and the observable it costs. Both
// dispositions are recorded, so a later delegation of either parse-time
// derivation reds here: it would move `pobj` and `pthetacall` out of the
// reached set (their bodies would draw `unknown-identifier` /
// `bare-object-literal`, and `parseDiscoveredTheta`'s drop gate (its
// `hasLoadParseError(document.diagnostics)` check, src/extension/
// production-composition.ts) would short-circuit the pass
// before `resolveThetaToolsAtLoad` ran).

describe("bug 0106 (C1) — the grammar rejection IS reached when the derived name parses clean", () => {
  it(`${MALFORMED}: \`- read bash\` + \`read({ path: "x" })\` reaches the load-time rejection`, () => {
    expect(
      codesFor("pobj"),
      "the bare-object carve-out stands down for a Pi-tool call site, so no " +
        "error-severity parse diagnostic drops the theta and the closed " +
        "grammar judges the entry — the diagnostic that names the actual " +
        "authoring mistake." + observed("pobj"),
    ).toEqual([MALFORMED]);
  });

  it(`${MALFORMED}: \`- ./zgood.theta junk\` + \`zgood("x")\` reaches the load-time rejection`, () => {
    expect(
      codesFor("pthetacall"),
      "a `.theta`-callable call of the derived name parses clean, so the " +
        "grammar rejection fires." + observed("pthetacall"),
    ).toEqual([MALFORMED]);
  });
});

describe("bug 0106 (C2) — the grammar rejection is PRE-EMPTED for the two error-severity parse rows", () => {
  it(`${TOOL_ARG_SHAPE} pre-empts ${MALFORMED} for \`- read bash\` + \`read("x")\``, () => {
    // Recorded disposition, not an endorsement: the drop gate fires on the
    // parse error, so `resolveThetaToolsAtLoad` never runs for this file. The
    // adjudicated route does not change this row — delegating
    // `piToolCallableName` would restore the rejection here at the cost of
    // (C1)'s `pobj`, which is the trade the route rejects.
    expect(
      codesFor("pshape"),
      "the pre-emption is the measured HEAD disposition for this row." +
        observed("pshape"),
    ).toEqual([TOOL_ARG_SHAPE]);
    expect(
      codesFor("pshape"),
      "the closed grammar never judges this entry.",
    ).not.toContain(MALFORMED);
  });

  it(`${SHADOWED_CALL} pre-empts ${MALFORMED} for \`- read bash\` + a shadowing local`, () => {
    expect(
      codesFor("pshadow"),
      "the pre-emption is the measured HEAD disposition for this row." +
        observed("pshadow"),
    ).toEqual([SHADOWED_CALL, BARE_OBJECT]);
    expect(
      codesFor("pshadow"),
      "the closed grammar never judges this entry.",
    ).not.toContain(MALFORMED);
  });

  it("neither pre-empted theta registers (§Fix constraint 1 holds on both rows)", () => {
    expect(
      outcome.registered,
      "a theta dropped at the parse gate does not register." + observed("pshape"),
    ).not.toContain("pshape");
    expect(
      outcome.registered,
      "same for the shadowing row." + observed("pshadow"),
    ).not.toContain("pshadow");
  });
});

// ===========================================================================
// Group (D) — bug 0248: the gate's escaping-entry input set, at both depths.
// ===========================================================================
//
// docs/bugs/0248-malformed-escaping-tools-entry-containment-unwitnessed.md
// §Fix (d). One entry shape — a `tools:` `.theta` path that lies outside every
// active discovery root, written with residue the closed grammar rejects — and
// the two depths that judge it.
//
// SPEC ANCHORS (verified at this HEAD):
//   - docs/spec_topics/diagnostics/code-registry-load.md:35 — the
//     `theta/load/invoke-path-escape` row: its *Trigger* ("An `invoke(...)`
//     literal or a `tools:` `.theta` entry resolves (post-realpath) to a path
//     that lies outside every active discovery root"), its `load, runtime`
//     phase column and its *Hint*. That *Trigger*'s subject is an ENTRY OF AN
//     ADMITTED KIND, and bug 0111 settled that it names the entry kind, not
//     the entry's depth — so the subject test cannot answer differently at
//     depth 0 and depth 1.
//   - docs/spec_topics/frontmatter/frontmatter-fields-a.md:88 — the closed
//     per-entry grammar. A malformed token sequence is not an entry of either
//     admitted kind, so it is not that *Trigger*'s subject at ANY depth.
//   - docs/spec_topics/diagnostics/code-registry-load.md:25 — the
//     `theta/load/malformed-tool-entry` row, the rejection every malformed
//     entry keeps drawing on its OWN file.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:74 (DIAG-4) — every
//     expected Message and Hint below is sourced from the registry, never
//     pasted prose.
//
// ONE SUBJECT TEST AT BOTH DEPTHS is what these cells pin. Both containment
// loops in src/extension/production-composition.ts gate on `parseToolsEntry`
// before `toolsEntrySpec` runs: the cache-head loop in
// `resolveThetaToolsAtLoad`, so a malformed entry is never a `calleeCache` key
// and the INV-1 loop over `calleeCache.values()` has no member for it — (D1);
// and `checkNestedToolsContainment`, the depth-1 surface, so the SAME bytes one
// level in draw no refusal at the caller either — (D3). (D2) and (D4) are the
// separability controls: a WELL-FORMED escaping entry keeps the refusal at
// depth 0 and at depth 1 respectively, so neither absence above is the absence
// of a live escape surface.
//
// TIER: unit, offline, provider-free (bug 0248 §Fix constraint 6 — "no
// integration or live tier is reachable for a load-time observable that settles
// before any model or transport exists"). One `discoverAndComposeFixtures` call
// over this group's own planted workspace.

const INVOKE_PATH_ESCAPE = "theta/load/invoke-path-escape";

/** The codes one group-(D) stem drew in its own walk, in emission order. */
function b0248CodesFor(stem: string): readonly string[] {
  return b0248Outcome.codes.get(stem) ?? [];
}

/** The rendered `<code>: <message>` lines one group-(D) stem drew, in order. */
function b0248LinesFor(stem: string): readonly string[] {
  return b0248Outcome.lines.get(stem) ?? [];
}

/** `observed`, read off group (D)'s walk. */
function b0248Observed(stem?: string): string {
  const mirror =
    stem === undefined
      ? b0248Outcome.raw
      : b0248Outcome.raw.filter((l) => l.includes(`${stem}.theta`));
  return (
    ` Registered: ${JSON.stringify(b0248Outcome.registered)}` +
    ` Mirror${stem === undefined ? "" : `(${stem})`}: ${JSON.stringify(mirror)}`
  );
}

/**
 * The *Hint* column of one `code-registry-load.md` row, prose-rendered the way
 * a diagnostic carries it: markdown links reduced to their link text and code
 * spans unbacktracked. DIAG-4's registry-sourcing discipline applied to the
 * Hint (the `registryHint` shape of
 * tests/match-pattern-increment-decrement.test.ts, whose `HINT_CELL_INDEX` is
 * this same column 5). Never pasted prose.
 */
const HINT_CELL_INDEX = 5;
const LOAD_REGISTRY_TEXT = readFileSync(
  fileURLToPath(
    new URL(
      "../docs/spec_topics/diagnostics/code-registry-load.md",
      import.meta.url,
    ),
  ),
  "utf8",
);

function registryHint(code: string): string {
  for (const line of LOAD_REGISTRY_TEXT.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed
      .replace(/^\|/, "")
      .replace(/\|\s*$/, "")
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim().replace(/\\\|/g, "|"));
    if (cells[0] !== `\`${code}\``) continue;
    const hint = cells[HINT_CELL_INDEX];
    if (hint === undefined || hint === "" || hint === "\u2014") {
      throw new Error(
        `harness: the ${code} row at docs/spec_topics/diagnostics/` +
          `code-registry-load.md carries no Hint cell (cell ${HINT_CELL_INDEX} ` +
          `is ${JSON.stringify(hint)}) — bug 0248 §Fix (d) 2 asserts the Hint ` +
          "reaches the author, so an empty cell is a harness failure, never a skip",
      );
    }
    return hint.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replaceAll("`", "");
  }
  throw new Error(
    "harness: docs/spec_topics/diagnostics/code-registry-load.md carries no " +
      `row for ${code} — this file's Hint oracle is stale`,
  );
}

/**
 * The planted file's path as `renderDiagnosticLine` prints it: bug 0268's
 * separator rule normalises every rendered file field to POSIX forward
 * slashes, so the `mkdtempSync` workspace prefix is spelled normalised here,
 * then forward-slash joins for the segments discovery appended.
 */
function plantedPath(stem: string): string {
  return `${b0248WorkspaceDir.replaceAll("\\", "/")}/.pi/theta/${stem}.theta`;
}

/**
 * The line:column a `tools:`-surface diagnostic is located at:
 * `TOOLS_DIAGNOSTIC_RANGE` (src/extension/production-composition.ts) is the
 * caller's file head, because a `tools:` entry carries no body range. Held as
 * its own constant so the expected mirror line interpolates it rather than
 * spelling a colon-digit run inline (the bug-0134 citation-form gate,
 * `tests/citation-symbol-form-gate.test.ts`, reads comment and string text and
 * cannot tell a rendered location from a line citation).
 */
const FILE_HEAD_LOCATION = "1:1";

/** The escape refusal rendered for one entry spec AS WRITTEN (category 5). */
function escapeMessage(spec: string): string {
  return rendered(LOAD_REGISTRY, INVOKE_PATH_ESCAPE, { "<path>": spec });
}

/**
 * Every mirror line naming one stem, each followed by its indented
 * continuation line when it has one — `renderDiagnosticLine`
 * (src/diagnostics/diagnostic.ts) puts the *Hint* on `  hint: …` after the
 * located line, and the harness's `lines` map keeps only the coded head.
 */
function mirrorWithContinuations(stem: string): readonly string[] {
  const out: string[] = [];
  b0248Outcome.raw.forEach((line, i) => {
    if (!line.includes(`${stem}.theta`)) return;
    out.push(line);
    const next = b0248Outcome.raw[i + 1];
    if (next !== undefined && /^\s/.test(next)) out.push(next);
  });
  return out;
}

// The precondition every group-(D) cell rests on, in the style of (A0).
describe("bug 0248 (D0) — group (D)'s own production load discovered its own planted workspace", () => {
  it(`registers the clean control (${B0248_CLEAN_CALLER}) and its contained callee`, () => {
    expect(
      b0248Outcome.registered.length,
      "group (D)'s `.pi/theta/` discovery walk registered nothing — the setup " +
        "precondition is unmet and every code-set and un-registration " +
        "assertion in this group would pass vacuously." + b0248Observed(),
    ).toBeGreaterThan(0);
    expect(
      b0248Outcome.registered,
      `the clean \`- ./${B0248_CLEAN_CALLEE}.theta\` control did not register, ` +
        "so no red in this group can be attributed to the entry grammar or the " +
        "containment rule." + b0248Observed(),
    ).toContain(B0248_CLEAN_CALLER);
    expect(
      b0248CodesFor(B0248_CLEAN_CALLER),
      "the clean control must draw no load diagnostic at all." +
        b0248Observed(B0248_CLEAN_CALLER),
    ).toEqual([]);
  });
});

describe("bug 0248 (D1) — depth 0: a malformed AND escaping entry draws the grammar rejection alone", () => {
  const spellings = [
    { label: "two-token", index: 0 },
    { label: "dangling-`as`", index: 1 },
    { label: "four-token", index: 2 },
  ] as const;
  for (const { label, index } of spellings) {
    it(`${MALFORMED}: the ${label} spelling of an out-of-root entry draws no ${INVOKE_PATH_ESCAPE}`, () => {
      const stem = B0248_MALFORMED_STEMS[index] as string;
      const entry = b0248MalformedEntries(outOfRootDir)[index] as string;
      expect(
        b0248CodesFor(stem),
        `bug 0248: the malformed entry \`${entry}\` names a path outside every ` +
          "active discovery root, but a malformed token sequence is not a " +
          "`tools:` `.theta` entry (frontmatter-fields-a.md:88), so it is not " +
          `${INVOKE_PATH_ESCAPE}'s *Trigger* subject ` +
          "(code-registry-load.md:35) and the closed grammar's rejection is the " +
          "entry's only disposition (code-registry-load.md:25)." +
          b0248Observed(stem),
      ).toEqual([MALFORMED]);
      expect(
        b0248LinesFor(stem),
        "DIAG-4: the rejection renders the registry Message with the entry " +
          "text verbatim." + b0248Observed(stem),
      ).toEqual([`${MALFORMED}: ${malformedMessage(entry)}`]);
      expect(
        b0248Outcome.registered,
        "the grammar rejection un-registers the whole theta " +
          "(code-registry-load.md:25), so the caller of a malformed entry is " +
          "absent from the registered set." + b0248Observed(stem),
      ).not.toContain(stem);
    });
  }
});

describe("bug 0248 (D2) — depth 0 control: the WELL-FORMED escaping entry keeps the containment refusal", () => {
  it(`${INVOKE_PATH_ESCAPE}: located 1:1 at the caller's file, with the registered Hint`, () => {
    // Without this cell (D1) passes when the escape surface is dead: the
    // composed rows' silence would be indistinguishable from a missing
    // precondition. The 1:1 location is `TOOLS_DIAGNOSTIC_RANGE`
    // (src/extension/production-composition.ts) — a `tools:` entry carries no
    // body range, so the refusal is ranged at the caller's file head.
    const spec = outSpec(outOfRootDir);
    expect(
      b0248CodesFor("b0248ctlesc"),
      "bug 0248 precondition: a well-formed entry naming the same out-of-root " +
        `path must draw ${INVOKE_PATH_ESCAPE} alone, or every absence ` +
        "assertion in this group holds vacuously." +
        b0248Observed("b0248ctlesc"),
    ).toEqual([INVOKE_PATH_ESCAPE]);
    const mirror = mirrorWithContinuations("b0248ctlesc");
    expect(
      mirror[0] ?? "",
      "the refusal is LOCATED at the caller's file head (1:1) and `<path>` " +
        "renders the entry spec AS WRITTEN — the way the stderr mirror carries " +
        "`renderDiagnosticLine`'s located triple." +
        b0248Observed("b0248ctlesc"),
    ).toBe(
      `theta: ${plantedPath("b0248ctlesc")}:${FILE_HEAD_LOCATION}: ` +
        `${INVOKE_PATH_ESCAPE}: ${escapeMessage(spec)}`,
    );
    expect(
      mirror[1] ?? "",
      "the registered *Hint* (code-registry-load.md:35) reaches the author on " +
        "the mirror's continuation line." + b0248Observed("b0248ctlesc"),
    ).toBe(`  hint: ${registryHint(INVOKE_PATH_ESCAPE)}`);
    expect(
      b0248Outcome.registered,
      "tool-calls.md:14: an escaping `tools:` `.theta` entry is rejected and " +
        "the callable is not created, so this caller does not register." +
        b0248Observed("b0248ctlesc"),
    ).not.toContain("b0248ctlesc");
  });
});

describe("bug 0248 (D3) — depth 1: a contained callee whose OWN entry is malformed and escaping draws no containment refusal at its caller, and the caller registers", () => {
  it(`${INVOKE_PATH_ESCAPE} is NOT raised at the caller, the caller registers, and the callee keeps ${MALFORMED} on its own file`, () => {
    const entry = `${outSpec(outOfRootDir)} junk`;
    expect(
      b0248CodesFor("b0248callnestmesc"),
      "bug 0248 PRIMARY: the caller's own entry `- ./b0248nestmesc.theta` is " +
        "well-formed, in-root and error-free; the only escaping path in reach " +
        `belongs to the callee's MALFORMED entry \`${entry}\`, which is not a ` +
        "`tools:` `.theta` entry (frontmatter-fields-a.md:88) and therefore not " +
        `${INVOKE_PATH_ESCAPE}'s *Trigger* subject at either depth ` +
        "(code-registry-load.md:35; bug 0111 settled that the *Trigger* names " +
        "the entry kind, not its depth). It is no subject for " +
        `${CALLEE_HAS_ERRORS} either: that *Trigger* (code-registry-load.md:41) ` +
        "presupposes a callee that failed its OWN parse or structural checks, " +
        "which `parseCalleeForTools`' `hasErrors` input — computed from " +
        "`parseThetaDocument`'s diagnostics alone — cannot see for an " +
        "entry-grammar rejection raised later by `resolveCallableSet`." +
        b0248Observed("b0248callnestmesc"),
    ).toEqual([]);
    expect(
      b0248Outcome.registered,
      "drawing no diagnostic, this caller REGISTERS — which is what the shipped " +
        "IN-ROOT class already does for the same shape (a caller whose " +
        "well-formed entry names a contained callee whose own `tools:` entry is " +
        "malformed), so the out-of-root class now agrees with it. Nothing " +
        "out-of-root becomes callable: the callee's own callable-set resolution " +
        "rejects the malformed entry by the same closed grammar, and the callee " +
        "itself does not register." + b0248Observed("b0248callnestmesc"),
    ).toContain("b0248callnestmesc");
    expect(
      b0248CodesFor("b0248nestmesc"),
      "the callee still draws the grammar rejection on its OWN file when it is " +
        "discovered, so no input loses its refusal (bug 0248 §Fix (a))." +
        b0248Observed("b0248nestmesc"),
    ).toEqual([MALFORMED]);
    expect(
      b0248LinesFor("b0248nestmesc"),
      "DIAG-4: the callee's rejection names its own entry text verbatim." +
        b0248Observed("b0248nestmesc"),
    ).toEqual([`${MALFORMED}: ${malformedMessage(entry)}`]);
    expect(
      b0248Outcome.registered,
      "code-registry-load.md:25: one malformed entry un-registers the whole " +
        "theta, so the callee is absent from the registered set." +
        b0248Observed("b0248nestmesc"),
    ).not.toContain("b0248nestmesc");
  });
});

describe("bug 0248 (D4) — depth 1 control: bug 0111's shipped class keeps the containment refusal at the caller's file", () => {
  it(`${INVOKE_PATH_ESCAPE}: a callee whose escaping entry is WELL-FORMED still un-registers its caller`, () => {
    // §Fix constraint 2: the gate skips an input class neither containment
    // witness file plants, so the WELL-FORMED surface is byte-identical at both
    // depths. This is the separability control for (D3): it proves the escape
    // surface is live at depth 1 IN THE SAME RUN in which (D3) observes silence.
    const spec = outSpec(outOfRootDir);
    expect(
      b0248CodesFor("b0248callnestwesc"),
      "bug 0248 precondition: the depth-1 containment surface must stay live " +
        "for a WELL-FORMED nested entry, or (D3)'s absence proves nothing." +
        b0248Observed("b0248callnestwesc"),
    ).toEqual([INVOKE_PATH_ESCAPE]);
    expect(
      mirrorWithContinuations("b0248callnestwesc")[0] ?? "",
      "bug 0111's disposition: the refusal is located at the CALLER's file head " +
        "and `<path>` renders the NESTED entry spec as written." +
        b0248Observed("b0248callnestwesc"),
    ).toBe(
      `theta: ${plantedPath("b0248callnestwesc")}:${FILE_HEAD_LOCATION}: ` +
        `${INVOKE_PATH_ESCAPE}: ${escapeMessage(spec)}`,
    );
    expect(
      b0248Outcome.registered,
      "invocation.md:12: a `tools:` `.theta` entry that escapes fails to " +
        "register the callable, and the refusal is error-severity at the " +
        "caller's file, so this caller does not register either — the half that " +
        "separates (D3)'s registration from a dead containment surface." +
        b0248Observed("b0248callnestwesc"),
    ).not.toContain("b0248callnestwesc");
    expect(
      b0248CodesFor("b0248nestwesc"),
      "the callee, discovered in its own right, draws the same refusal on its " +
        "own file." + b0248Observed("b0248nestwesc"),
    ).toEqual([INVOKE_PATH_ESCAPE]);
  });
});

describe("bug 0248 (D5) — the group's whole registration outcome, exactly", () => {
  it("only the composed depth-1 caller and the clean control pair register", () => {
    // The set, not a per-stem sample: every row carrying an error-severity
    // diagnostic is absent, and the two rows that carry none are present. The
    // depth-1 composed caller is among the latter — it draws no diagnostic
    // (cell (D3)), and a theta that draws none registers. That mints no
    // out-of-root callable: the malformed entry is rejected by the same closed
    // grammar inside the callee's own callable-set resolution, so the callee
    // never becomes a callable of anything.
    expect(
      b0248Outcome.registered,
      "the registered set of group (D)'s own walk." + b0248Observed(),
    ).toEqual(["b0248callnestmesc", B0248_CLEAN_CALLER, B0248_CLEAN_CALLEE]);
    for (const stem of [
      ...B0248_MALFORMED_STEMS,
      "b0248ctlesc",
      "b0248nestmesc",
      "b0248nestwesc",
      "b0248callnestwesc",
      OUT_OF_ROOT_CALLEE,
    ]) {
      expect(
        b0248Outcome.registered,
        `\`${stem}\` carries an error-severity load diagnostic — the grammar ` +
          "rejection (code-registry-load.md:25) or the containment refusal " +
          "(:35) — so it must not register." + b0248Observed(),
      ).not.toContain(stem);
    }
    expect(
      b0248Outcome.registered,
      "the clean control must register in the SAME run, or every " +
        "un-registration assertion above holds for a load that registered " +
        "nothing." + b0248Observed(),
    ).toContain(B0248_CLEAN_CALLER);
  });
});
