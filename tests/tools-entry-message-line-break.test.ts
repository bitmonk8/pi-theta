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
  renderDiagnosticBatch,
  renderDiagnosticLine,
  type Diagnostic,
} from "../src/diagnostics/diagnostic";

// Bug 0105 — a parse-time literal `<value>` reaches its diagnostic `message`
// carrying the author's own line breaks. `resolveCallableSet`'s malformed arm
// interpolates the entry text with no transform
// (src/parser/callable-set.ts:201), and `extractToolsList` recovers a
// non-scalar `tools:` sequence item as its verbatim YAML source slice
// (src/parser/frontmatter.ts:551, via `paramValueSource`), so a
// block-mapping item of two or more keys yields a `message` spanning physical
// lines. The same silence covers three sibling parse-time rows whose values are
// block scalars: `theta/load/unknown-mode-value`
// (src/parser/frontmatter.ts:1320), `theta/load/model-unresolved` (:1273),
// `theta/load/unknown-bind-context-value` (:1336) and
// `theta/load/unknown-methodology-value` (:677).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:34 —
//     `message: string, // single-line summary`, inside the normative internal
//     diagnostic shape block. Mirrored to users at
//     docs/reference/diagnostics.md:19. No page qualifies the claim by code,
//     phase, or value provenance.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:63 — the serialised
//     content format. It reserves `"\n  hint: <hint>"` for a `hint` field, the
//     two-space-indented `"  <file>:<line>:<col>: <message>"` form for one
//     element of `Diagnostic.related`, and a single blank line for the block
//     boundary between successive diagnostics in a batch. Those three shapes
//     are the renderer's; a `message` that reproduces one makes the rendered
//     block describe a diagnostic that was not emitted.
//   - docs/spec_topics/diagnostics/placeholder-rendering-b.md:74 — the
//     parse-time literal-value `<value>` sub-rule and its enumerated rows. The
//     line-break transform this file pins is that sub-rule's, so every row in
//     the enumeration that can carry a break inherits it.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:74 (DIAG-4) — the
//     registry *Message* column is normative character-for-character, so the
//     expected strings below are sourced through `registryMessage` and only
//     what `<value>` interpolates is asserted to change.
//
// THE PINNED POST-FIX CONTRACT. A shared line-break transform,
// `normaliseLiteralValueLineBreaks` exported from src/diagnostics/diagnostic.ts,
// is applied at each parse-time literal-value `<value>` interpolation site:
// text containing neither CR nor LF is returned unchanged (byte identity);
// every maximal run of U+0020 / U+0009 / U+000D / U+000A containing at least
// one CR or LF collapses, run and all, to one U+0020, while a run carrying no
// break is preserved verbatim; leading and trailing U+0020 are then trimmed.
// A `tools:` entry and a YAML scalar are not theta string literals, so bug
// 0060's `\n`-escape arm has no subject here.
//
// WHAT IS RED HERE AND WHY. Every message-shape cell reds on the symptom the
// bug document measures: a `message` of two or three physical lines where the
// shape block says one, a rendered block carrying a forged `  hint: ` or
// `  <file>:<line>:<col>: ` continuation line, or `renderDiagnosticBatch` of a
// single `Diagnostic` rendering as two blank-line-separated blocks. Group (T)
// reds on the shared transform not being exported yet — the seam the other
// groups' expected strings are written against.
//
// GREEN BY DESIGN and required to stay green: the discovery precondition
// guard; the identity half (group (I)), which is what keeps the transform from
// being a whole-corpus rewrite — `- {a: b}`, `- a: b` and bug 0069's own
// single-line `read grep` row must render byte-identically.
//
// TIER: unit, offline, provider-free, deterministic. The observable is a
// load-time diagnostic's rendered text, which settles during discovery before
// any model, transport or session exists, so no integration or live tier can
// reach it earlier or more faithfully. Group (B) drives the production compose
// helper over a real on-disk `.pi/theta/` workspace because the carriers live
// at the frontmatter recovery layer, below `resolveCallableSet`'s own inputs.
//
// NO SILENT SKIPPING: the group (B0) precondition guard asserts the discovery
// walk registered its clean control, and every message lookup below fails
// loudly naming the marker it could not find rather than asserting vacuously.

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

/**
 * Source a code's registered *Message* template and fill its `<…>`
 * placeholders. DIAG-4 makes the template normative, so no expected string in
 * this file is copy-pasted prose: the fix changes what `<value>` interpolates
 * and nothing else.
 */
function expectedMessage(
  code: string,
  subs: Readonly<Record<string, string>>,
): string {
  let message = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    message,
    `${code} has no row in docs/spec_topics/diagnostics/code-registry-load.md,` +
      " so DIAG-4 has no normative string for this witness to source",
  ).toBeDefined();
  let filled = message as string;
  for (const [placeholder, value] of Object.entries(subs)) {
    filled = filled.replaceAll(placeholder, value);
  }
  return filled;
}

/** `theta/load/malformed-tool-entry` rendered for one entry text. */
function malformed(value: string): string {
  return expectedMessage("theta/load/malformed-tool-entry", {
    "<value>": value,
  });
}

/** `theta/load/unknown-mode-value` rendered for one `mode:` value. */
function unknownMode(value: string): string {
  return expectedMessage("theta/load/unknown-mode-value", { "<value>": value });
}

/** `theta/load/model-unresolved` rendered for one `model:` value. */
function modelUnresolved(value: string): string {
  return expectedMessage("theta/load/model-unresolved", { "<value>": value });
}

/** `theta/load/unknown-bind-context-value` rendered for one `bind_context:` value. */
function unknownBindContext(value: string): string {
  return expectedMessage("theta/load/unknown-bind-context-value", {
    "<value>": value,
  });
}

/** `theta/load/unknown-methodology-value` rendered for one methodology value. */
function unknownMethodology(value: string): string {
  return expectedMessage("theta/load/unknown-methodology-value", {
    "<value>": value,
  });
}

// ===========================================================================
// The planted workspace.
// ===========================================================================

interface PlantedTheta {
  readonly stem: string;
  /**
   * A break-free substring of the offending value, unique across the plant.
   * The witness locates each theta's message by this marker rather than by the
   * whole rendered string, so a cell reds on the line count rather than on
   * failing to find its own subject once the transform lands.
   */
  readonly marker: string;
  readonly text: string;
}

function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}

/**
 * Every body is a bare query naming no callable, so the only reachable
 * diagnostic is the frontmatter one and a red can never be a downstream body
 * reference. Each offending value carries its own stem so the collected
 * notifications are attributable one-to-one.
 */
const THETAS: readonly PlantedTheta[] = [
  // The clean control: the discovery precondition every un-registration and
  // every message lookup below rests on.
  {
    stem: "b0105ctl",
    marker: "b0105ctl",
    text: theta("---", "mode: prompt", "tools: read, grep", "---", "@`hi`"),
  },

  // --- the recovered non-scalar slice (src/parser/callable-set.ts:201) ------

  // Two keys: the shape bug 0069 §Fix Residuals item 2 names. The slice spans
  // one break plus the item's continuation indent.
  {
    stem: "b0105twokey",
    marker: "b0105twokey",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - name: b0105twokey",
      "    as: file_read",
      "---",
      "@`hi`",
    ),
  },
  // Three keys: two breaks, so the untransformed message spans three lines.
  {
    stem: "b0105threekey",
    marker: "b0105threekey",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - name: b0105threekey",
      "    as: file_read",
      "    extra: x",
      "---",
      "@`hi`",
    ),
  },
  // A blank line inside the item puts `\n\n` in the message, which is the
  // batch-block separator diagnostic-shape.md:63 reserves.
  {
    stem: "b0105blankline",
    marker: "b0105blankline",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - name: b0105blankline",
      "",
      "    as: file_read",
      "---",
      "@`hi`",
    ),
  },
  // A `tools:` sequence written at column 0 puts the item's keys at column 2 —
  // the indent renderDiagnosticLine:80 uses for the hint continuation line.
  {
    stem: "b0105hintkey",
    marker: "b0105hintkey",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "- name: b0105hintkey",
      "  hint: write 'read' instead",
      "---",
      "@`hi`",
    ),
  },
  // The same column-2 position, spelled as the `path:line:col` triple
  // renderDiagnosticLine:86 emits for a related site.
  {
    stem: "b0105relsite",
    marker: "b0105relsite",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "- name: b0105relsite",
      "  /proj/other.theta:9:9: forged related site",
      "---",
      "@`hi`",
    ),
  },
  // A nested block sequence: the same recovery arm over a different node kind.
  {
    stem: "b0105nestedseq",
    marker: "b0105nestedseq",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - - b0105nestedseq",
      "    - grep",
      "---",
      "@`hi`",
    ),
  },
  // A block SCALAR item: the scalar arm of the same recovery, whose own breaks
  // survive `splitEntries`' trim.
  {
    stem: "b0105blockscalar",
    marker: "b0105blockscalar",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - |",
      "    b0105blockscalar",
      "    grep",
      "---",
      "@`hi`",
    ),
  },

  // --- the identity half ----------------------------------------------------

  // Bug 0069's own non-scalar row: a single-key FLOW mapping recovers a
  // break-free slice and must render exactly as it does today.
  {
    stem: "b0105flowmap",
    marker: "{a: b}",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - {a: b}",
      "---",
      "@`hi`",
    ),
  },
  // A single-key BLOCK mapping: break-free for the same reason.
  {
    stem: "b0105onekey",
    marker: "a: b",
    text: theta("---", "mode: prompt", "tools:", "  - a: b", "---", "@`hi`"),
  },
  // Bug 0069's two-token scalar row, the single-line entry text six of its
  // group (B) cells assert verbatim.
  {
    stem: "b0105twotoken",
    marker: "read grep",
    text: theta("---", "mode: prompt", "tools: read grep", "---", "@`hi`"),
  },

  // --- the sibling parse-time literal-value rows ---------------------------

  // `mode:` as a block scalar. The value is not trimmed the way a `tools:`
  // entry is, so it also ends with a break.
  {
    stem: "b0105modeblock",
    marker: "b0105modeval",
    text: theta("---", "mode: |", "  b0105modeval", "  extra", "---", "@`hi`"),
  },
  // `model:` as a block scalar, reaching its message through
  // `renderScalarValue` with `ctx.modelRegistry.getAvailable()` empty.
  {
    stem: "b0105modelblock",
    marker: "b0105modelval",
    text: theta(
      "---",
      "mode: prompt",
      "model: |",
      "  b0105modelval",
      "  extra",
      "---",
      "@`hi`",
    ),
  },
  // `bind_context:` as a block scalar.
  {
    stem: "b0105bindctx",
    marker: "b0105bindval",
    text: theta(
      "---",
      "mode: prompt",
      "bind_context: |",
      "  b0105bindval",
      "  extra",
      "---",
      "@`hi`",
    ),
  },
  // `respond_repair.methodology:` as a block scalar.
  {
    stem: "b0105methodology",
    marker: "b0105methval",
    text: theta(
      "---",
      "mode: prompt",
      "respond_repair:",
      "  methodology: |",
      "    b0105methval",
      "    extra",
      "---",
      "@`hi`",
    ),
  },
];

interface LoadOutcome {
  /** Slash names the production compose helper returned (registered fixtures). */
  readonly registered: readonly string[];
  /** Error-severity diagnostic messages surfaced via `ctx.ui.notify`. */
  readonly notifications: readonly string[];
}

let outcome: LoadOutcome;
let workspaceDir: string;
let projectThetaDir: string;

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

  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(
    pi,
    ctx,
  );
  return { registered: fixtures.map((f) => f.slashName), notifications };
}

beforeAll(async () => {
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0105-"));
  projectThetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(projectThetaDir, { recursive: true });
  for (const planted of THETAS) {
    writeFileSync(
      join(projectThetaDir, `${planted.stem}.theta`),
      planted.text,
      "utf8",
    );
  }
  // An ABSENT settings file is silent (package-and-settings.md §Failure
  // modes), so the plant pins the fixture's settings read rather than
  // suppressing noise.
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

/**
 * The one notification whose text carries `marker`. Fails loudly naming the
 * marker when the plant produced no diagnostic or more than one, so no cell
 * below can pass or red on the wrong subject.
 */
function messageFor(marker: string): string {
  const hits = outcome.notifications.filter((n) => n.includes(marker));
  expect(
    hits.length,
    `expected exactly one load diagnostic naming \`${marker}\`.` + observed(),
  ).toBe(1);
  return hits[0] as string;
}

/**
 * The file-only `Diagnostic` the emission site pushes, reconstructed for the
 * line-oriented renderers. The toast router hands `ctx.ui.notify` the bare
 * `message` (src/extension/production-composition.ts:226), and the malformed
 * arm pushes `severity` / `code` / `file` / `message` with no `range`
 * (src/parser/callable-set.ts:197–202) — the file-only category of
 * diagnostic-shape.md's located-site classification.
 */
function fileOnlyDiagnostic(
  stem: string,
  code: string,
  message: string,
): Diagnostic {
  return {
    severity: "error",
    code,
    file: join(projectThetaDir, `${stem}.theta`),
    message,
  };
}

/** The physical lines of a rendered string, split on the lexical newline set. */
function physicalLines(rendered: string): readonly string[] {
  return rendered.split(/\r\n|\r|\n/);
}

/** A message rendered for an assertion failure, breaks made visible. */
function shown(message: string): string {
  return JSON.stringify(message);
}

// ===========================================================================
// Group (B0) — the precondition.
// ===========================================================================

describe("Bug 0105 (B0) — the production load path discovered the planted workspace", () => {
  it("registers the clean control (b0105ctl)", () => {
    expect(
      outcome.registered.length,
      "the project `.pi/theta/` discovery walk registered nothing — the setup " +
        "precondition is unmet." + observed(),
    ).toBeGreaterThan(0);
    expect(
      outcome.registered,
      "the clean `tools: read, grep` control did not register, so no red below " +
        "can be attributed to the message rendering." + observed(),
    ).toContain("b0105ctl");
  });
});

// ===========================================================================
// Group (M) — `message` is one physical line (diagnostic-shape.md:34).
// ===========================================================================

describe("Bug 0105 (M1) — a two-key block-mapping item renders a one-line message", () => {
  it("theta/load/malformed-tool-entry: the message is exactly one physical line", () => {
    const message = messageFor("b0105twokey");
    expect(
      physicalLines(message).length,
      "the recovered slice carried the author's break into a `message` that " +
        "diagnostic-shape.md:34 states as a single-line summary: " +
        shown(message),
    ).toBe(1);
  });

  it("theta/load/malformed-tool-entry: the entry text collapses to one U+0020 and stays recognisable", () => {
    // The break and the item's continuation indent are one maximal whitespace
    // run carrying a break, so they collapse together; the author's own bytes
    // either side survive, which is what keeps the file-only diagnostic's only
    // locator usable (bug doc §Expected behaviour, constraint 2).
    expect(messageFor("b0105twokey")).toBe(
      malformed("name: b0105twokey as: file_read"),
    );
  });
});

describe("Bug 0105 (M2) — a three-key block-mapping item renders a one-line message", () => {
  it("theta/load/malformed-tool-entry: two breaks still render one physical line", () => {
    const message = messageFor("b0105threekey");
    expect(
      physicalLines(message).length,
      "a three-key item spans three physical lines: " + shown(message),
    ).toBe(1);
  });
});

describe("Bug 0105 (M3) — a nested sequence item and a block-scalar item render one-line messages", () => {
  it("theta/load/malformed-tool-entry: the nested block-sequence item is one line", () => {
    const message = messageFor("b0105nestedseq");
    expect(
      physicalLines(message).length,
      "the nested sequence's recovered slice spans lines: " + shown(message),
    ).toBe(1);
  });

  it("theta/load/malformed-tool-entry: the block-scalar item is one line", () => {
    // The scalar arm: the block scalar's own breaks survive `splitEntries`'
    // trim, which removes only the leading and trailing whitespace.
    const message = messageFor("b0105blockscalar");
    expect(
      physicalLines(message).length,
      "the block scalar's own breaks reached the message: " + shown(message),
    ).toBe(1);
  });
});

// ===========================================================================
// Group (F) — the renderer's structural lines are not forgeable
// (diagnostic-shape.md:63).
// ===========================================================================

describe("Bug 0105 (F1) — a `hint`-spelled second key forges no hint continuation line", () => {
  it("no rendered line matches the reserved `  hint: ` shape", () => {
    const message = messageFor("b0105hintkey");
    const rendered = renderDiagnosticLine(
      fileOnlyDiagnostic(
        "b0105hintkey",
        "theta/load/malformed-tool-entry",
        message,
      ),
    );
    const forged = physicalLines(rendered).filter((l) => /^ {2}hint: /.test(l));
    expect(
      forged,
      "the rendered block carries a `  hint: ` line for a diagnostic with no " +
        "`hint` field — the shape src/diagnostics/diagnostic.ts:95 reserves: " +
        shown(rendered),
    ).toEqual([]);
  });
});

describe("Bug 0105 (F2) — a `path:line:col`-spelled second key forges no related-site line", () => {
  it("no rendered line matches the reserved `  <file>:<line>:<col>: ` shape", () => {
    const message = messageFor("b0105relsite");
    const rendered = renderDiagnosticLine(
      fileOnlyDiagnostic(
        "b0105relsite",
        "theta/load/malformed-tool-entry",
        message,
      ),
    );
    const forged = physicalLines(rendered).filter((l) =>
      /^ {2}\S+:\d+:\d+: /.test(l),
    );
    expect(
      forged,
      "the rendered block carries a related-site line for a diagnostic whose " +
        "`related` is absent — the shape src/diagnostics/diagnostic.ts:102 " +
        "reserves: " + shown(rendered),
    ).toEqual([]);
  });
});

describe("Bug 0105 (F3) — a blank line inside the item forges no batch block boundary", () => {
  it("renderDiagnosticBatch of ONE diagnostic renders ONE block", () => {
    const message = messageFor("b0105blankline");
    const batch = renderDiagnosticBatch([
      fileOnlyDiagnostic(
        "b0105blankline",
        "theta/load/malformed-tool-entry",
        message,
      ),
    ]);
    expect(
      batch.split("\n\n").length,
      "one `Diagnostic` rendered as more than one blank-line-separated block: " +
        "the `\\n\\n` in the message is the block separator " +
        "src/diagnostics/diagnostic.ts:114 joins with. " + shown(batch),
    ).toBe(1);
  });
});

// ===========================================================================
// Group (I) — the identity half: break-free values render byte-identically.
// ===========================================================================

describe("Bug 0105 (I) — a break-free `<value>` is unchanged", () => {
  it("the single-key flow mapping still renders `{a: b}` (bug 0069's row)", () => {
    expect(
      outcome.notifications,
      "the flow-mapping slice carries no break, so its rendering must not " +
        "move." + observed(),
    ).toContain(malformed("{a: b}"));
  });

  it("the single-key block mapping still renders `a: b`", () => {
    expect(
      outcome.notifications,
      "the one-key block-mapping slice carries no break, so its rendering " +
        "must not move." + observed(),
    ).toContain(malformed("a: b"));
  });

  it("bug 0069's single-line `read grep` row still renders verbatim", () => {
    expect(
      outcome.notifications,
      "a single-line entry text must render byte-identically, which is what " +
        "keeps tests/tools-entry-closed-grammar.test.ts green." + observed(),
    ).toContain(malformed("read grep"));
  });
});

// ===========================================================================
// Group (S) — the sibling parse-time literal-value rows.
// ===========================================================================

describe("Bug 0105 (S1) — `mode: |` renders a one-line message with no trailing break", () => {
  it("theta/load/unknown-mode-value: one physical line", () => {
    const message = messageFor("b0105modeval");
    expect(
      physicalLines(message).length,
      "the block scalar's breaks — including the trailing one, which renders " +
        "the template tail on a line of its own — reached the message: " +
        shown(message),
    ).toBe(1);
  });

  it("theta/load/unknown-mode-value: the trailing break is trimmed, not collapsed to a space", () => {
    expect(messageFor("b0105modeval")).toBe(unknownMode("b0105modeval extra"));
  });
});

describe("Bug 0105 (S2) — `model: |` renders a one-line message", () => {
  it("theta/load/model-unresolved: one physical line", () => {
    const message = messageFor("b0105modelval");
    expect(
      physicalLines(message).length,
      "the `model:` value's breaks passed through `renderScalarValue` into " +
        "the message: " + shown(message),
    ).toBe(1);
  });

  it("theta/load/model-unresolved: the collapsed value is what `<value>` interpolates", () => {
    expect(messageFor("b0105modelval")).toBe(
      modelUnresolved("b0105modelval extra"),
    );
  });
});

describe("Bug 0105 (S3) — `bind_context: |` renders a one-line message", () => {
  it("theta/load/unknown-bind-context-value: one physical line", () => {
    const message = messageFor("b0105bindval");
    expect(
      physicalLines(message).length,
      "the `bind_context:` block scalar's breaks reached the message: " +
        shown(message),
    ).toBe(1);
  });

  it("theta/load/unknown-bind-context-value: the collapsed value is what `<value>` interpolates", () => {
    expect(messageFor("b0105bindval")).toBe(
      unknownBindContext("b0105bindval extra"),
    );
  });
});

describe("Bug 0105 (S4) — `respond_repair.methodology: |` renders a one-line message", () => {
  it("theta/load/unknown-methodology-value: one physical line", () => {
    const message = messageFor("b0105methval");
    expect(
      physicalLines(message).length,
      "the `respond_repair.methodology:` block scalar's breaks reached the " +
        "message: " + shown(message),
    ).toBe(1);
  });

  it("theta/load/unknown-methodology-value: the collapsed value is what `<value>` interpolates", () => {
    expect(messageFor("b0105methval")).toBe(
      unknownMethodology("b0105methval extra"),
    );
  });
});

// ===========================================================================
// Group (V) — the field-level invariant over the whole planted workspace.
// ===========================================================================

describe("Bug 0105 (V) — no load diagnostic's `message` carries a line break", () => {
  it("every message the planted workspace produced is free of U+000A and U+000D", () => {
    // Scoped to the plant's own markers: the discovery walk's other four
    // sources are the host's, and this invariant is asserted over the inputs
    // this file controls.
    const markers = THETAS.map((t) => t.marker);
    const planted = outcome.notifications.filter((n) =>
      markers.some((m) => n.includes(m)),
    );
    expect(
      planted.length,
      "the plant produced no attributable diagnostic, so this invariant would " +
        "hold vacuously." + observed(),
    ).toBeGreaterThan(0);
    const offenders = planted.filter((n) => /[\r\n]/.test(n));
    expect(
      offenders.map(shown),
      "diagnostic-shape.md:34 states `message` as a single-line summary, and " +
        "docs/reference/diagnostics.md:19 states the same to the author.",
    ).toEqual([]);
  });
});

// ===========================================================================
// Group (T) — the shared transform itself.
// ===========================================================================

/** The transform's declared signature, resolved at run time from the seam. */
type LiteralValueLineBreakTransform = (text: string) => string;

/**
 * Load `normaliseLiteralValueLineBreaks` from the diagnostics seam. Resolved
 * through a dynamic import rather than a static one so a missing export reds
 * this group by name instead of aborting the whole file at module evaluation
 * and taking the behavioural groups above with it.
 */
async function loadTransform(): Promise<LiteralValueLineBreakTransform> {
  const module = (await import("../src/diagnostics/diagnostic")) as Record<
    string,
    unknown
  >;
  const fn = module["normaliseLiteralValueLineBreaks"];
  expect(
    typeof fn,
    "src/diagnostics/diagnostic.ts exports no " +
      "`normaliseLiteralValueLineBreaks`: the parse-time literal-value " +
      "`<value>` sub-rule (placeholder-rendering-b.md:74) has no shared " +
      "transform for its interpolation sites to call.",
  ).toBe("function");
  return fn as LiteralValueLineBreakTransform;
}

describe("Bug 0105 (T) — normaliseLiteralValueLineBreaks", () => {
  const CASES: readonly { readonly name: string; readonly input: string; readonly expected: string }[] = [
    { name: "CRLF", input: "a\r\nb", expected: "a b" },
    { name: "bare CR", input: "a\rb", expected: "a b" },
    { name: "LF", input: "a\nb", expected: "a b" },
    {
      name: "a mixed whitespace run around a break collapses whole",
      input: "a \t\r\n \t b",
      expected: "a b",
    },
    {
      name: "a break-free run is preserved verbatim",
      input: "a \t b\nc  d",
      expected: "a \t b c  d",
    },
    { name: "a whitespace-only value", input: " \n\t ", expected: "" },
    {
      name: "a break-free value is byte-identical",
      input: "name: read    as: file_read",
      expected: "name: read    as: file_read",
    },
    { name: "a value ending in a break", input: "a\nb\n", expected: "a b" },
    { name: "a value starting with a break", input: "\na", expected: "a" },
  ];

  for (const testCase of CASES) {
    it(testCase.name, async () => {
      const normalise = await loadTransform();
      expect(normalise(testCase.input)).toBe(testCase.expected);
    });
  }
});
