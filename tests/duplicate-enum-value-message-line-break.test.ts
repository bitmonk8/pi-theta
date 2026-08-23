import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";
import { checkEnumDeclaration } from "../src/parser/schema-declarations";
import {
  renderDiagnosticBatch,
  renderDiagnosticLine,
  type Diagnostic,
  type SourceRange,
} from "../src/diagnostics/diagnostic";

// Bug 0250 — `theta/parse/duplicate-enum-value` interpolates the COOKED value
// of an enum variant's string literal into its `message` with no line-break
// transform (src/parser/schema-declarations.ts:269), so a `\n` written as a
// two-character source escape — cooked to one U+000A by
// `classifyEnumValueToken` (src/parser/theta-document.ts:5594) and stored as
// the variant's value text — reaches the interpolation as a real break. The
// resulting `message` spans physical lines, and an author-chosen value forges
// the renderer's own structural lines. This is the seventh site of the
// parse-time literal-value `<value>` sub-rule; bug 0105 wired the shared
// transform at the other six.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:34 —
//     `message: string, // single-line summary`, inside the normative internal
//     diagnostic shape block, mirrored to authors at
//     docs/reference/diagnostics.md:19. No page qualifies the claim by code,
//     phase or value provenance, so a parse-phase row is bound exactly as the
//     six load-phase rows are.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:63 — the serialised
//     content format. It reserves `"\n  hint: <hint>"` for a `hint` field, the
//     two-space-indented `"  <file>:<line>:<col>: <message>"` form for one
//     element of `Diagnostic.related`, and a single blank line for the batch
//     block boundary. Those shapes are the renderer's; a `message` that
//     reproduces one makes the rendered block describe a diagnostic that was
//     never emitted.
//   - docs/spec_topics/diagnostics/placeholder-rendering-b.md:74 — the
//     parse-time literal-value `<value>` sub-rule and its enumerated rows.
//     `theta/parse/duplicate-enum-value` binds a cooked string-literal value,
//     so its `\n` escape is the one reachable break;
//     `theta/parse/duplicate-discriminator-value` binds a raw source slice in
//     which the escape stays two characters and is unaffected.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:111 — the row whose
//     *Message* template DIAG-4 (diagnostic-shape.md:74) makes normative
//     character-for-character. Every expected string below is sourced from that
//     template through `registryMessage`, so what the fix changes is what
//     `<value>` interpolates and nothing else.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:13 —
//     `theta/parse/literal-newline-in-string`, which refuses a RAW newline
//     inside a string literal and is why the escape is the whole input class.
//
// THE PINNED POST-FIX CONTRACT. The interpolated value passes bug 0105's
// shared transform, `normaliseLiteralValueLineBreaks`
// (src/diagnostics/diagnostic.ts:152): text carrying neither U+000D nor U+000A
// is returned byte-identically; every maximal run of U+0020 / U+0009 / U+000D /
// U+000A containing at least one break collapses, run and all, to one U+0020;
// a break-free whitespace run is preserved verbatim; leading and trailing
// U+0020 are trimmed.
//
// WHAT IS RED HERE AND WHY. Every carrier cell reds on the measured symptom: a
// `message` of two or three physical lines, a rendered block carrying a forged
// `  hint: ` (src/diagnostics/diagnostic.ts:80) or `  <file>:<line>:<col>: `
// (:86) continuation line, `renderDiagnosticBatch` of one `Diagnostic`
// rendering as two blank-line-separated blocks (:98), or a message string that
// still carries the author's break.
//
// GREEN BY DESIGN and required to stay green: the identity half (group I) —
// the tab escape and the plain single-line value, which the transform returns
// byte-identically, and which is what keeps
// tests/schema-declarations.test.ts:247 green untouched (bug doc §Fix
// constraint 4). Group R and group D are the two measured NON-carriers: the raw
// newline draws `theta/parse/literal-newline-in-string` instead, and the
// discriminator row renders a raw source slice whose escape stays two
// characters.
//
// TIER: unit, offline, provider-free, deterministic. The observable is a
// parse-time diagnostic's rendered text, settled by `parseThetaDocument`
// (src/parser/theta-document.ts:868) before any session, transport or model
// exists, so no higher tier reaches it earlier or more faithfully.
//
// NO SILENT SKIPPING: the registry lookup and every diagnostic lookup fail
// loudly naming the code they could not find, so no cell can pass or red
// against an absent subject.

// --- The normative Message template (DIAG-4) -------------------------------

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The parse shard of the registry — the *Message* column DIAG-4 makes normative. */
const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as RegistryRow[];

const DUP_ENUM_CODE = "theta/parse/duplicate-enum-value";
const RAW_NEWLINE_CODE = "theta/parse/literal-newline-in-string";
const DUP_DISCRIMINATOR_CODE = "theta/parse/duplicate-discriminator-value";

/**
 * `code`'s registered *Message* template with its `<…>` placeholders filled.
 * A missing row or a template that no longer spells a placeholder is a harness
 * failure naming the unmet precondition, never a skip: the alternative is an
 * expectation silently compared against `undefined` or against
 * under-interpolated prose.
 */
function expectedMessage(
  code: string,
  subs: Readonly<Record<string, string>>,
): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: docs/spec_topics/diagnostics/code-registry-parse.md carries no` +
        ` Message row for ${code} — DIAG-4's Message column is this file's` +
        ` oracle, so an absent row is a harness failure`,
    );
  }
  let filled = template;
  for (const [placeholder, value] of Object.entries(subs)) {
    if (!filled.includes(placeholder)) {
      throw new Error(
        `harness: the registered Message for ${code} does not spell` +
          ` ${placeholder}, which this file interpolates. Template: ${template}`,
      );
    }
    filled = filled.replace(placeholder, value);
  }
  return filled;
}

/** `theta/parse/duplicate-enum-value` rendered for one value and one enum name. */
function dupEnum(value: string, enumName: string): string {
  return expectedMessage(DUP_ENUM_CODE, {
    "<value>": value,
    "<enum>": enumName,
  });
}

// --- Parse harness ---------------------------------------------------------

/** Frontmatter every fixture shares; the body is what each cell varies. */
const FRONTMATTER = "---\nmode: prompt\nmodel: sonnet\n---\n";

function parseDeps(): ParseThetaDocumentDeps {
  const systemNote = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  } as unknown as SystemNoteChannelDeps;
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}

function parse(body: string): ThetaDocument {
  const source: ThetaSource = {
    path: "bug0250.theta",
    bytes: new TextEncoder().encode(FRONTMATTER + body),
  };
  return parseThetaDocument(source, parseDeps());
}

/**
 * An `enum E` whose two distinctly-named variants share `valueSource`, written
 * as the author writes it — `valueSource` is theta SOURCE text inside the
 * literal, so a `\n` in it is the two-character escape the lexer cooks.
 */
function enumBody(valueSource: string): string {
  return `enum E { Low = "${valueSource}", High = "${valueSource}" }\n@\`hi\`\n`;
}

/** `code: message` for every diagnostic a parse produced, for assertion text. */
function diagLines(doc: ThetaDocument): string {
  return JSON.stringify(
    doc.diagnostics.map((d) => `${d.code}: ${d.message}`),
  );
}

/**
 * The one diagnostic carrying `code`. Fails loudly naming the code and dumping
 * the whole diagnostic set when the parse produced none or more than one, so no
 * cell below reds on the wrong subject.
 */
function only(doc: ThetaDocument, code: string): Diagnostic {
  const hits = doc.diagnostics.filter((d) => d.code === code);
  expect(
    hits.length,
    `expected exactly one ${code} diagnostic. Diagnostics: ${diagLines(doc)}`,
  ).toBe(1);
  return hits[0] as Diagnostic;
}

/** The physical lines of a rendered string, split on the lexical newline set. */
function physicalLines(rendered: string): readonly string[] {
  return rendered.split(/\r\n|\r|\n/);
}

/** A string rendered for an assertion failure, breaks made visible. */
function shown(text: string): string {
  return JSON.stringify(text);
}

// --- Direct-seam harness --------------------------------------------------

/** A throwaway located site, mirroring tests/schema-declarations.test.ts. */
function site(): { file: string; range: SourceRange } {
  return {
    file: "bug0250.theta",
    range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
  };
}

/**
 * The value-duplication diagnostic `checkEnumDeclaration` raises for two
 * distinctly-named variants sharing one COOKED value. This seam is the cheaper
 * carrier where the cell's subject is the interpolation itself rather than the
 * lexer's cooking, so `cooked` is passed with real break characters in it.
 */
function seamDiagnostic(cooked: string): Diagnostic {
  const diagnostics = checkEnumDeclaration(
    {
      name: "E",
      variants: [
        { name: "Low", value: { kind: "string", text: cooked } },
        { name: "High", value: { kind: "string", text: cooked } },
      ],
    },
    site(),
  );
  const hits = diagnostics.filter((d) => d.code === DUP_ENUM_CODE);
  expect(
    hits.length,
    `checkEnumDeclaration raised no single ${DUP_ENUM_CODE} for the cooked` +
      ` value ${shown(cooked)}. Diagnostics: ` +
      JSON.stringify(diagnostics.map((d) => `${d.code}: ${d.message}`)),
  ).toBe(1);
  return hits[0] as Diagnostic;
}

// ===========================================================================
// Group (M) — `message` is one physical line (diagnostic-shape.md:34).
// ===========================================================================

describe("Bug 0250 (M1) — a `\\n` escape in the shared value renders a one-line message", () => {
  it("the message is exactly one physical line", () => {
    const d = only(parse(enumBody("a\\nb")), DUP_ENUM_CODE);
    expect(
      physicalLines(d.message).length,
      "the cooked escape carried the author's break into a `message` that" +
        " diagnostic-shape.md:34 states as a single-line summary: " +
        shown(d.message),
    ).toBe(1);
  });

  it("the break collapses to one U+0020 and the value stays recognisable", () => {
    // The value text is the only thing naming which value collided — the range
    // covers the whole declaration (src/parser/theta-document.ts:7960), not the
    // offending variant — so the collapse keeps the author's own bytes either
    // side of the break (bug doc §Expected behaviour).
    expect(only(parse(enumBody("a\\nb")), DUP_ENUM_CODE).message).toBe(
      dupEnum("a b", "E"),
    );
  });

  it("the same value handed straight to the interpolation site collapses alike", () => {
    // The direct seam removes the lexer from the cell, so a red here is the
    // interpolation's alone.
    expect(seamDiagnostic("a\nb").message).toBe(dupEnum("a b", "E"));
  });
});

describe("Bug 0250 (M2) — a `\\r\\n` escape renders a one-line message", () => {
  it("the message is exactly one physical line", () => {
    const d = only(parse(enumBody("x\\r\\ny")), DUP_ENUM_CODE);
    expect(
      physicalLines(d.message).length,
      "U+000D U+000A reached the message and splits through the same splitter" +
        " the H9a stderr gate uses (`acceptanceStderrOffenders`," +
        " tests/live/acceptance/harness.ts:572): " +
        shown(d.message),
    ).toBe(1);
  });

  it("the CR LF run collapses to one U+0020", () => {
    expect(only(parse(enumBody("x\\r\\ny")), DUP_ENUM_CODE).message).toBe(
      dupEnum("x y", "E"),
    );
  });
});

// ===========================================================================
// Group (F) — the renderer's structural lines are not forgeable
// (diagnostic-shape.md:63).
// ===========================================================================

describe("Bug 0250 (F1) — a `hint`-shaped value forges no hint continuation line", () => {
  it("no rendered line matches the reserved `  hint: ` shape", () => {
    const d = only(parse(enumBody("x\\n  hint: forged")), DUP_ENUM_CODE);
    const rendered = renderDiagnosticLine(d);
    const forged = physicalLines(rendered).filter((l) => /^ {2}hint: /.test(l));
    expect(
      forged,
      "the rendered block carries a `  hint: ` line for a diagnostic with no" +
        " `hint` field — the shape src/diagnostics/diagnostic.ts:80 reserves: " +
        shown(rendered),
    ).toEqual([]);
  });

  it("the break plus the forged indent collapse to one U+0020", () => {
    expect(
      only(parse(enumBody("x\\n  hint: forged")), DUP_ENUM_CODE).message,
    ).toBe(dupEnum("x hint: forged", "E"));
  });
});

describe("Bug 0250 (F2) — a `path:line:col`-shaped value forges no related-site line", () => {
  it("no rendered line matches the reserved `  <file>:<line>:<col>: ` shape", () => {
    const d = only(
      parse(enumBody("x\\n  /p/o.theta:9:9: forged")),
      DUP_ENUM_CODE,
    );
    const rendered = renderDiagnosticLine(d);
    const forged = physicalLines(rendered).filter((l) =>
      /^ {2}\S+:\d+:\d+: /.test(l),
    );
    expect(
      forged,
      "the rendered block carries a related-site line for a diagnostic whose" +
        " `related` is absent — the shape src/diagnostics/diagnostic.ts:86" +
        " reserves: " + shown(rendered),
    ).toEqual([]);
  });

  it("the value survives the collapse as one line", () => {
    expect(
      only(parse(enumBody("x\\n  /p/o.theta:9:9: forged")), DUP_ENUM_CODE)
        .message,
    ).toBe(dupEnum("x /p/o.theta:9:9: forged", "E"));
  });
});

describe("Bug 0250 (F3) — a blank-line value forges no batch block boundary", () => {
  it("renderDiagnosticBatch of ONE diagnostic renders ONE block", () => {
    const d = only(parse(enumBody("x\\n\\ny")), DUP_ENUM_CODE);
    const batch = renderDiagnosticBatch([d]);
    expect(
      batch.split("\n\n").length,
      "one `Diagnostic` rendered as more than one blank-line-separated block:" +
        " the `\\n\\n` in the message is the block separator" +
        " src/diagnostics/diagnostic.ts:98 joins with. " + shown(batch),
    ).toBe(1);
  });

  it("the two-break run collapses to one U+0020", () => {
    expect(only(parse(enumBody("x\\n\\ny")), DUP_ENUM_CODE).message).toBe(
      dupEnum("x y", "E"),
    );
  });
});

// ===========================================================================
// Group (I) — the identity half: a break-free value renders byte-identically.
// ===========================================================================

describe("Bug 0250 (I) — a break-free cooked value is unchanged", () => {
  it("a `\\t` escape keeps its tab verbatim", () => {
    // A break-free whitespace run is preserved: the transform touches a run
    // only when it carries U+000D or U+000A.
    expect(only(parse(enumBody("a\\tb")), DUP_ENUM_CODE).message).toBe(
      dupEnum("a\tb", "E"),
    );
  });

  it("a plain single-line value renders exactly as it does today", () => {
    // The property tests/schema-declarations.test.ts:247 rests on.
    expect(seamDiagnostic("x").message).toBe(dupEnum("x", "E"));
  });

  it("a plain single-line value renders on one physical line end to end", () => {
    const d = only(parse(enumBody("x")), DUP_ENUM_CODE);
    expect(physicalLines(renderDiagnosticLine(d)).length).toBe(1);
  });
});

// ===========================================================================
// Group (R) — the raw newline is a different row, not this one.
// ===========================================================================

describe("Bug 0250 (R) — a raw newline inside the literal draws the lexer's row", () => {
  it("theta/parse/literal-newline-in-string fires and duplicate-enum-value does not", () => {
    const doc = parse('enum E { Low = "a\nb", High = "a\nb" }\n@`hi`\n');
    const codes = doc.diagnostics.map((d) => d.code);
    expect(
      codes,
      "code-registry-parse.md:13 refuses the literal, so the enum captures no" +
        ` explicit value. Diagnostics: ${diagLines(doc)}`,
    ).toContain(RAW_NEWLINE_CODE);
    expect(
      codes,
      "the escape is the whole input class for this report; a raw newline never" +
        ` reaches the interpolation. Diagnostics: ${diagLines(doc)}`,
    ).not.toContain(DUP_ENUM_CODE);
  });
});

// ===========================================================================
// Group (D) — the discriminator row is a measured non-carrier.
// ===========================================================================

describe("Bug 0250 (D) — theta/parse/duplicate-discriminator-value keeps its two-character escape", () => {
  it("the message is one physical line and still spells the escape", () => {
    const doc = parse(
      'schema A { k: "p\\nq" }\nschema B { k: "p\\nq" }\nschema U = A | B\n@`hi`\n',
    );
    const d = only(doc, DUP_DISCRIMINATOR_CODE);
    expect(
      physicalLines(d.message).length,
      "this row binds the RAW source slice of the literal annotation through" +
        " `renderParseLiteralValue` (src/parser/schema-declarations.ts:459-461)," +
        " so no cooking happens: " + shown(d.message),
    ).toBe(1);
    expect(
      d.message,
      "the escape must stay the two characters the author wrote — this row is" +
        " outside the fix and must not move: " + shown(d.message),
    ).toContain("\\n");
  });
});
