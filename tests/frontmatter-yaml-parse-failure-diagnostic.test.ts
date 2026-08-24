import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LineCounter, parseDocument } from "yaml";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0263 — a frontmatter block the YAML parser rejects draws one diagnostic
// that names the parse failure and locates it, in place of the
// `theta/load/missing-mode` the FM-5 discard produces today on a file whose
// `mode:` line is present and correct
// (docs/bugs/0263-params-type-bare-double-quote-breaks-frontmatter-misattributed.md).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/diagnostics/code-registry-load.md §`theta/load/*` — the
//     `theta/load/missing-mode` row's *Trigger* is "Frontmatter omits the
//     required `mode:` field", which is false of every subject input here, and
//     the load table carries no row for a frontmatter block that does not parse
//     as YAML. DIAG-2 (docs/spec_topics/diagnostics/diagnostic-shape.md
//     §DIAG-2) keeps the registry closed, so the new code needs its row in the
//     same commit as the emission.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md, the internal
//     diagnostic-shape block — `message` is a single-line summary and `range`
//     carries 1-indexed file
//     coordinates. Any interpolated source text is line-break-transformed
//     through `normaliseLiteralValueLineBreaks` (src/diagnostics/diagnostic.ts),
//     which is byte-identity for a break-free single line and is stated so the
//     single-line requirement holds for whatever text a future failing line
//     carries (bug doc §Fix constraint 4).
//
// THE PINNED POST-FIX CONTRACT (bug doc §Fix; route settled as the general
// frontmatter-parse-failure row emitted at the FM-5 discard point in
// `parseFrontmatter`, src/parser/frontmatter.ts — RED now, GREEN after):
//   1. `theta/load/malformed-frontmatter-yaml`, severity E, phase load,
//      replacing the `theta/load/missing-mode` the discard emits (constraint 1).
//   2. The diagnostic locates the failure: `<line>` / `<column>` are the file
//      coordinates of `doc.errors[0].linePos[0]` — the `yaml` `LineCounter`
//      position with `parseFrontmatter`'s existing `lineOffset` applied, as its
//      other ranges already do — and `<text>` is that line's source text,
//      trimmed (constraint 2). The diagnostic carries `file` and a `range`
//      whose start is the located coordinate.
//   3. `<scope>` names the `params:` field when the failing position falls on a
//      line inside the `params:` block that spells a field key, and is the
//      empty string otherwise (constraint 2, group (c)).
//   4. Exactly ONE such diagnostic per frontmatter block, keyed to
//      `doc.errors[0]` (constraint 8, group (d)).
//   5. The theta still does not register (constraint 5, group (g)).
//   6. A block that parses is untouched (constraint 6, group (e)).
//   7. `BLOCK_AS_IMPLICIT_KEY` is covered beside `UNEXPECTED_TOKEN` /
//      `BAD_SCALAR_START` / `DUPLICATE_KEY` — the trigger is the parser's
//      verdict, not one error code (constraint 7, group (a) last row).
//
// PROBED CURRENT SIGNATURES (HEAD 616c6d0e / 0.258.0, offline, deterministic —
// re-measured in this worktree, zero drift from the bug doc's §Reproduction
// table). Fixture: `---`, `mode: prompt`, `params:`, the indented field line,
// `---`, body `` @`hi` ``. `doc.errors` positions are block-relative, so a file
// coordinate is the block line plus the block's `lineOffset`, which is 1 for a
// leading `---` fence:
//   p: "a" | "b"           3 errors, first UNEXPECTED_TOKEN at block line 3
//                          column 10   diags [error theta/load/missing-mode]
//   p: "a"|"b"             2 errors, first at block line 3 column 9    same diag
//   p: 'a' | 'b'           3 errors, first at block line 3 column 10   same diag
//   p: "a" | "b" = "a"     3 errors, first at block line 3 column 10   same diag
//   p: array<{a: string}>  1 BLOCK_AS_IMPLICIT_KEY at block line 3 column 6
//                          same diag
//   tools: ,               1 BAD_SCALAR_START at block line 2 column 8  same diag
//   duplicate `mode:` key  1 DUPLICATE_KEY at block line 2 column 1     same diag
// On every one of those rows `frontmatter` is null and the diagnostic carries no
// `range`.
//
// WHAT IS RED HERE AND WHY: groups (a), (b), (c), (d) and (h) — the code does
// not exist, so no registry row renders and every subject input still reports
// the absent `mode:` it does not exhibit. GREEN BY DESIGN and required to stay
// green: group (e) — every §Reproduction row whose `doc.errors` is empty, plus
// the §Non-goals `p: "a"` row, which is a type-text recovery question at a
// PARSING frontmatter and must not move; group (f) — a file that genuinely
// omits `mode:` keeps the code with its unamended registry message; group (g) —
// the refusal stays fail-closed, so registration is withheld before and after.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// `parseThetaDocument` over a string (`parseDoc`, tests/helpers/e2e-s1.ts — the
// shipped front end wrapped in the standard inert deps double), plus the `yaml`
// library read directly as the independent position oracle of group (0), plus
// the registry pages read as text in group (h). No integration or live tier is
// needed: the misattribution is produced by `parseFrontmatter` from a source
// string, and registration is a pure predicate over the returned diagnostics
// (group (g)).
//
// NO SILENT SKIPPING: every derivation helper THROWS when the fixture does not
// carry what it names, and every registry read asserts definedness before it
// interpolates, so an absent row reds by naming the registry page rather than
// by comparing against `undefined`.

// ===========================================================================
// The new code and its normative message (DIAG-2 / DIAG-4).
// ===========================================================================

const CODE = "theta/load/malformed-frontmatter-yaml";
const MISSING_MODE = "theta/load/missing-mode";

/**
 * The normative *Message* template the fix must land in the load registry.
 * Written literally HERE ONCE — group (h) asserts the registry row equals it —
 * and every other expected message in this file is derived from the REGISTRY
 * READ, so DIAG-4's "the Message column is normative" is enforced rather than
 * restated.
 */
const EXPECTED_TEMPLATE =
  "frontmatter block is not valid YAML: parse error at line <line>, column <column> near '<text>'<scope>";

const REGISTRY_LOAD_PAGE = "docs/spec_topics/diagnostics/code-registry-load.md";
const MIRROR_PAGE = "docs/reference/diagnostics.md";

interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

function readRepoFile(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
}

// The live four-page sharded registry, read from the spec corpus and
// concatenated — the same input tests/code-registry.test.ts reconciles.
const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) => readRepoFile(`docs/spec_topics/diagnostics/${page}`))
    .join("\n"),
) as RegistryRow[];

/** A registry row's normative *Message* template, or a loud failure (DIAG-4). */
function template(code: string): string {
  const found = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    found,
    `DIAG-4 anchor: ${REGISTRY_LOAD_PAGE} must carry the Message row for ${code}`,
  ).toBeDefined();
  return found as string;
}

/** The located file coordinate a failure renders and ranges on. */
interface Located {
  readonly line: number;
  readonly column: number;
}

/**
 * The new code's message for one located failure, rendered from the registry
 * template. `<scope>` is the `params:`-field clause when `param` is given and
 * the empty string otherwise — the two arms of §Fix constraint 2's "the
 * `params:` field name is named where the failing position falls inside a
 * `params:` field line".
 */
function yamlFailureMessage(at: Located, text: string, param?: string): string {
  const scope = param === undefined ? "" : ` (in 'params:' field '${param}')`;
  return template(CODE)
    .replace("<line>", String(at.line))
    .replace("<column>", String(at.column))
    .replace("<text>", text)
    .replace("<scope>", scope);
}

/** The `theta/load/missing-mode` message (groups (e), (f); no placeholder). */
function missingModeMessage(): string {
  return template(MISSING_MODE);
}

/** The `theta/parse/unresolved-named-type` message for one name (group (e)). */
function unresolvedMessage(name: string): string {
  return template("theta/parse/unresolved-named-type").replace("<name>", name);
}

// ===========================================================================
// Fixtures, and the coordinates DERIVED from their own line layout.
// ===========================================================================

/** The body every fixture carries; no fixture's claim depends on it. */
const BODY = "@`hi`\n";

/** A `mode: prompt` theta whose `params:` block is the one field line `field`. */
function paramsSrc(field: string): string {
  return `---\nmode: prompt\nparams:\n  ${field}\n---\n${BODY}`;
}

/** A theta whose frontmatter block is `block` verbatim. */
function frontmatterSrc(block: string): string {
  return `---\n${block}---\n${BODY}`;
}

/**
 * The 1-indexed FILE line a fixture spells `text` on, and the block-relative
 * line the `yaml` parser reports for the same text. Derived from the fixture's
 * own layout rather than counted by hand, so a fixture edit moves both
 * expectations together instead of silently falsifying one.
 *
 * The block offset is the count of source lines before the frontmatter block's
 * first content line — one, for the leading `---` fence — which is the same
 * `lineOffset` `parseFrontmatter` applies to every range it already emits.
 */
function fileLineOf(source: string, text: string): { file: number; block: number } {
  const lines = source.split("\n");
  const index = lines.findIndex((line) => line === text);
  if (index < 0) {
    throw new Error(
      `fixture carries no line spelled ${JSON.stringify(text)}; lines: ${JSON.stringify(lines)}`,
    );
  }
  return { file: index + 1, block: index };
}

/**
 * The 1-indexed column of `marker`'s first occurrence in `line`. The subject
 * columns are all "where the token the parser choked on sits", so naming the
 * token is what keeps the expectation readable and edit-stable.
 */
function columnOf(line: string, marker: string): number {
  const at = line.indexOf(marker);
  if (at < 0) {
    throw new Error(
      `fixture line ${JSON.stringify(line)} carries no marker ${JSON.stringify(marker)}`,
    );
  }
  return at + 1;
}

/** One malformed-frontmatter subject: its source, its located failure, its text. */
interface Subject {
  readonly label: string;
  readonly source: string;
  /** The file coordinate of the first `YAMLParseError`. */
  readonly at: Located;
  /** The failing source line, trimmed — the `<text>` placeholder's rendering. */
  readonly text: string;
  /** The `params:` field the failing line spells, when it spells one. */
  readonly param?: string;
  /** The block-relative coordinate the `yaml` oracle of group (0) must agree with. */
  readonly blockAt: Located;
  /** The frontmatter block text, for the group-(0) oracle. */
  readonly block: string;
}

/**
 * A `params:`-field subject. The failing position is derived as the column of
 * `marker` on the fixture's own field line, and the located file line is the
 * line the fixture spells that field on.
 */
function paramsSubject(label: string, field: string, marker: string): Subject {
  const source = paramsSrc(field);
  const indented = `  ${field}`;
  const line = fileLineOf(source, indented);
  const column = columnOf(indented, marker);
  return {
    label,
    source,
    at: { line: line.file, column },
    blockAt: { line: line.block, column },
    text: field,
    param: "p",
    block: `mode: prompt\nparams:\n${indented}\n`,
  };
}

/** A non-`params:` subject, whose `<scope>` is the empty string. */
function plainSubject(label: string, block: string, failing: string, marker: string): Subject {
  const source = frontmatterSrc(block);
  const line = fileLineOf(source, failing);
  const column = columnOf(failing, marker);
  return {
    label,
    source,
    at: { line: line.file, column },
    blockAt: { line: line.block, column },
    text: failing.trim(),
    block,
  };
}

/**
 * Group (a)'s subjects: every §Reproduction row that carries `mode: prompt`,
 * fails the YAML parse, and collapses to the absent-`mode:` report today. The
 * leading-quote rows are the reported class; the `array<{...}>` row is the same
 * discard under `BLOCK_AS_IMPLICIT_KEY` (§Fix constraint 7, bug 0028
 * §Residuals (iv)), so a fix that improves only the quote class reds here.
 */
const PARAMS_SUBJECTS: readonly Subject[] = [
  // The parser stops at the first `|` after the closing quote: the leading
  // quoted scalar consumed the value, so the union bar starts junk.
  paramsSubject("a1 (spaced double-quoted union)", 'p: "a" | "b"', "|"),
  paramsSubject("a2 (unspaced double-quoted union)", 'p: "a"|"b"', "|"),
  paramsSubject("a3 (spaced single-quoted union)", "p: 'a' | 'b'", "|"),
  paramsSubject("a4 (double-quoted union with a default)", 'p: "a" | "b" = "a"', "|"),
  // The brace inside the generic's angle brackets opens a nested mapping in a
  // compact mapping, and the parser points at the value's first character.
  paramsSubject("a5 (brace under a generic)", "p: array<{a: string}>", "array"),
];

const PLAIN_SUBJECTS: readonly Subject[] = [
  // An unquoted comma-leading plain scalar is a YAML parse failure before the
  // `tools:` field is ever read — the out-of-class boundary
  // tests/tools-field-zero-entry-scalar-refusal.test.ts group (E4) pins from
  // the `tools:`-refusal side.
  plainSubject("c1 (comma-leading tools scalar)", "mode: prompt\ntools: ,\n", "tools: ,", ","),
  // A duplicate top-level key: the parser points at the second key's first
  // character, and no `params:` block exists to scope the failure to.
  plainSubject(
    "c2 (duplicate top-level key)",
    "mode: prompt\nmode: subagent\n",
    "mode: subagent",
    "mode",
  ),
];

// ===========================================================================
// Reading a parsed document.
// ===========================================================================

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** Every diagnostic rendered `<severity> <code>` — the count/code/severity triple. */
function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}

/** The sole diagnostic of a document, or a loud failure naming what was there. */
function onlyDiagnostic(label: string, doc: ThetaDocument): Diagnostic {
  const first = doc.diagnostics[0];
  if (first === undefined || doc.diagnostics.length !== 1) {
    throw new Error(
      `${label}: expected exactly one diagnostic; observed ${JSON.stringify(diagLines(doc))}`,
    );
  }
  return first;
}

/**
 * The shipped registration predicate, mirrored: `hasLoadParseError`
 * (src/extension/production-composition.ts) drops a theta whenever some
 * diagnostic is error-severity in the `theta/load/` or `theta/parse/`
 * namespace, and the composition root also drops a document whose
 * `frontmatter` is null. Mirroring the predicate — rather than re-driving the
 * composition root — is the observable
 * tests/params-block-mapping-rhs-refusal.test.ts already reads for the same
 * claim, and it holds for whatever code the fix emits.
 */
function registered(doc: ThetaDocument): boolean {
  if (doc.frontmatter === null) return false;
  return !doc.diagnostics.some(
    (d) =>
      d.severity === "error" &&
      (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")),
  );
}

/** The lowered `properties` entry of a cleanly-loading one-field fixture. */
function loweredProperty(label: string, source: string, field: string): unknown {
  const doc = parseDoc(source, "bug0263.theta");
  expect(
    diagLines(doc),
    `${label}: this fixture's pinned disposition is a clean load — any diagnostic is drift`,
  ).toEqual([]);
  if (doc.frontmatter === null) {
    throw new Error(`${label}: the theta was REFUSED — frontmatter is null`);
  }
  const lowered = doc.frontmatter.params?.loweredSchema;
  if (lowered === undefined) {
    throw new Error(`${label}: the params block lowered to NOTHING (loweredSchema absent)`);
  }
  const properties = lowered["properties"];
  if (properties === null || typeof properties !== "object") {
    throw new Error(
      `${label}: the lowered params document carries no \`properties\` object: ${JSON.stringify(lowered)}`,
    );
  }
  const entry = (properties as Record<string, unknown>)[field];
  if (entry === undefined) {
    throw new Error(
      `${label}: no lowered property '${field}': ${JSON.stringify(properties)}`,
    );
  }
  return entry;
}

/**
 * The contract every malformed-frontmatter subject shares: EXACTLY ONE
 * diagnostic, the new code at error severity, its message the registry's with
 * the located coordinates, the failing text and the scope rendered, a range
 * whose start IS that coordinate, the `file` set, and a null `frontmatter`.
 *
 * The count/code/severity assertion runs FIRST so the red at HEAD names the
 * reported symptom — the absent-`mode:` report on a file whose `mode:` line is
 * present — rather than a downstream registry miss.
 */
function expectYamlFailure(subject: Subject, doc: ThetaDocument): void {
  expect(
    diagCodes(doc),
    `${subject.label}: bug 0263 §Fix constraint 1 — a frontmatter block the YAML parser rejects draws EXACTLY ONE error-severity ${CODE}, and never ${MISSING_MODE} on a file whose \`mode:\` line is present. Rendered diagnostics: ${JSON.stringify(diagLines(doc))}`,
  ).toEqual([`error ${CODE}`]);
  const diagnostic = onlyDiagnostic(subject.label, doc);
  expect(
    diagnostic.message,
    `${subject.label}: DIAG-4 — the rendered message is the registry template with the file coordinates, the offending text and the scope clause interpolated`,
  ).toBe(yamlFailureMessage(subject.at, subject.text, subject.param));
  expect(
    diagnostic.file,
    `${subject.label}: the emission site has a source file, so the diagnostic carries \`file\` (diagnostic-shape.md §"Located-site fields")`,
  ).toBe("bug0263.theta");
  expect(
    diagnostic.range?.start,
    `${subject.label}: §Fix constraint 2 — the range start is the first \`YAMLParseError\`'s position in FILE coordinates, the block position with \`parseFrontmatter\`'s \`lineOffset\` applied. Observed range: ${JSON.stringify(diagnostic.range)}`,
  ).toEqual(subject.at);
  expect(
    doc.frontmatter,
    `${subject.label}: §Fix constraint 5 — the refusal stays fail-closed, so the frontmatter is withheld exactly as it is today`,
  ).toBeNull();
}

// ===========================================================================
// (0) THE POSITION ORACLE. The expected coordinates are derived from the
// fixtures' own layout; this group proves the derivation agrees with what the
// `yaml` library actually reports, so no group-(a)/(b)/(c)/(d) expectation is
// a hand-counted guess. GREEN at HEAD and after: it reads the library, not the
// code under test.
// ===========================================================================

describe("bug 0263 (0) — the derived coordinates are the `yaml` parser's own", () => {
  for (const subject of [...PARAMS_SUBJECTS, ...PLAIN_SUBJECTS]) {
    it(`GREEN (0, ${subject.label}): the first YAMLParseError sits at the derived block position`, () => {
      const lineCounter = new LineCounter();
      const parsed = parseDocument(subject.block, { lineCounter });
      const first = parsed.errors[0];
      if (first === undefined) {
        throw new Error(
          `${subject.label}: the frontmatter block PARSED — this subject's whole premise is that it does not`,
        );
      }
      expect(
        first.linePos?.[0],
        `${subject.label}: the derived position is the block-relative coordinate the fix reads from \`doc.errors[0].linePos[0]\` and offsets into file coordinates`,
      ).toEqual({ line: subject.blockAt.line, col: subject.blockAt.column });
    });
  }
});

// ===========================================================================
// (a) THE REPORTED COLLAPSE — every §Reproduction row with `mode: prompt` that
// fails the YAML parse. RED at HEAD: each yields one `theta/load/missing-mode`
// with no range on a file whose `mode:` line is present and correct.
// ===========================================================================

describe("bug 0263 (a) — a rejected frontmatter block reports the parse failure", () => {
  for (const subject of PARAMS_SUBJECTS) {
    it(`RED (${subject.label}): exactly one located ${CODE}, and no ${MISSING_MODE}`, () => {
      const doc = parseDoc(subject.source, "bug0263.theta");
      expectYamlFailure(subject, doc);
      // Stated separately from the count assertion because the misattribution
      // IS the report: the author's remedy path today is a hint to add a field
      // the file already carries.
      expect(
        doc.diagnostics.some((d) => d.code === MISSING_MODE),
        `${subject.label}: ${MISSING_MODE}'s registry *Trigger* is "Frontmatter omits the required \`mode:\` field", and this fixture spells \`mode: prompt\` on its own well-formed line`,
      ).toBe(false);
    });
  }
});

// ===========================================================================
// (b) THE LOCATED-NESS, spelled out for the reported row. RED at HEAD: the
// single diagnostic carries no `range` at all, and its message names neither
// the position nor the text.
// ===========================================================================

describe("bug 0263 (b) — the reported row's failure is located and named", () => {
  const subject = PARAMS_SUBJECTS[0] as Subject;

  it(`RED (b1): the range start is the field line's own file coordinate`, () => {
    const doc = parseDoc(subject.source, "bug0263.theta");
    // The fixture spells its `params:` field on the fourth of its six lines
    // (`---`, `mode: prompt`, `params:`, the field, `---`, the body), and
    // `fileLineOf` derives that number from the source rather than asserting
    // it by hand. The column is where the union bar sits on that line.
    const expected = fileLineOf(subject.source, '  p: "a" | "b"');
    expect(
      subject.at.line,
      "the subject's located line is the fixture's own field line in file coordinates",
    ).toBe(expected.file);
    expect(
      subject.at.column,
      "the located column is the union bar the YAML parser stops at, counted on the indented field line",
    ).toBe(columnOf('  p: "a" | "b"', "|"));
    const diagnostic = onlyDiagnostic(subject.label, doc);
    expect(
      diagnostic.range?.start,
      `b1: §Fix constraint 2 — the position \`doc.errors[0]\` carries, in file coordinates. Observed diagnostic: ${JSON.stringify(diagnostic)}`,
    ).toEqual({ line: expected.file, column: columnOf('  p: "a" | "b"', "|") });
  });

  it("RED (b2): the message names the offending text and the `params:` field", () => {
    const doc = parseDoc(subject.source, "bug0263.theta");
    const diagnostic = onlyDiagnostic(subject.label, doc);
    expect(
      diagnostic.message,
      `b2: §Fix constraint 2 — the author's mistake is one pair of enclosing quotes on this field, so the message quotes the field's own text. Observed: ${JSON.stringify(diagnostic.message)}`,
    ).toContain(`'p: "a" | "b"'`);
    expect(
      diagnostic.message,
      "b2: the failing position falls on a line inside the `params:` block that spells a field key, so `<scope>` names that field",
    ).toContain("(in 'params:' field 'p')");
    expect(
      /[\r\n]/.test(diagnostic.message),
      "b2: §Fix constraint 4 — `doc.errors[*].message` carries embedded breaks and a caret line; the rendered message stays the single-line summary the internal diagnostic-shape block requires (diagnostic-shape.md)",
    ).toBe(false);
  });
});

// ===========================================================================
// (c) THE NON-`params:` FAILURES — same code, EMPTY `<scope>`. RED at HEAD:
// both rows report the absent `mode:` instead, one of them on a file whose
// only fault is a duplicate `mode:` key.
// ===========================================================================

describe("bug 0263 (c) — a failure outside a `params:` field renders no scope clause", () => {
  for (const subject of PLAIN_SUBJECTS) {
    it(`RED (${subject.label}): exactly one located ${CODE} with no scope clause`, () => {
      const doc = parseDoc(subject.source, "bug0263.theta");
      expectYamlFailure(subject, doc);
      const diagnostic = onlyDiagnostic(subject.label, doc);
      expect(
        diagnostic.message,
        `${subject.label}: §Fix constraint 2 scopes the field clause to a failing position inside a \`params:\` field line; this failure sits on a top-level field, so \`<scope>\` renders empty`,
      ).not.toContain("'params:' field");
    });
  }
});

// ===========================================================================
// (d) THE MULTI-ERROR REDUCTION — §Fix constraint 8. RED at HEAD: the row
// produces one diagnostic already, but it is keyed to nothing in `doc.errors`.
// ===========================================================================

describe("bug 0263 (d) — three YAML errors reduce to one diagnostic, keyed to the first", () => {
  const subject = PARAMS_SUBJECTS[0] as Subject;

  it("RED (d1): one diagnostic, at the FIRST error's position, not a later one", () => {
    const lineCounter = new LineCounter();
    const parsed = parseDocument(subject.block, { lineCounter });
    if (parsed.errors.length < 2) {
      throw new Error(
        `d1's premise is a MULTI-error block; the `
        + `\`yaml\` parser reported ${parsed.errors.length} error(s): `
        + JSON.stringify(parsed.errors.map((e) => e.code)),
      );
    }
    const doc = parseDoc(subject.source, "bug0263.theta");
    expect(
      doc.diagnostics.length,
      `d1: §Fix constraint 8 — one authoring mistake produced ${parsed.errors.length} \`YAMLParseError\`s, and the block draws ONE diagnostic. Rendered: ${JSON.stringify(diagLines(doc))}`,
    ).toBe(1);
    const diagnostic = onlyDiagnostic("d1", doc);
    const later = parsed.errors.slice(1).map((e) => e.linePos?.[0]);
    expect(
      diagnostic.range?.start,
      `d1: the diagnostic is keyed to \`doc.errors[0]\`; the later errors sit at ${JSON.stringify(later)} in block coordinates and must not be the one reported`,
    ).toEqual(subject.at);
  });
});

// ===========================================================================
// (e) THE PARSING-BLOCK FENCES — §Fix constraint 6. Every §Reproduction row
// whose `doc.errors` is empty keeps its diagnostics and its lowering, and the
// §Non-goals `p: "a"` row keeps its type-text recovery. GREEN at HEAD and
// required to stay green: these bound the fix to blocks the parser rejects.
// ===========================================================================

describe("bug 0263 (e) — a frontmatter block that parses is untouched", () => {
  it("GREEN (e1): the correctly authored `p: '\"a\" | \"b\"'` loads clean and lowers the enum", () => {
    // The remedy the bug reports as invisible: one pair of enclosing single
    // quotes. It must keep working unchanged, or the fix has no destination to
    // point authors at.
    expect(
      loweredProperty("e1", paramsSrc("p: '\"a\" | \"b\"'"), "p"),
      "e1: the all-string literal union lowers to the enum form",
    ).toEqual({ type: "string", enum: ["a", "b"] });
  });

  /** The §Reproduction rows whose quote characters are not in first position. */
  const PARSING_ROWS: ReadonlyArray<readonly [string, string, unknown]> = [
    ["e2", 'p: string | "a"', { anyOf: [{ type: "string" }, { const: "a" }] }],
    ["e3", 'p: array<"a" | "b">', { type: "array", items: { type: "string", enum: ["a", "b"] } }],
    ["e4", "p: 1 | 2", { enum: [1, 2] }],
    ["e5", 'p: string = "hi"', { type: "string" }],
  ];

  for (const [label, field, lowered] of PARSING_ROWS) {
    it(`GREEN (${label}): \`${field}\` keeps its §Reproduction disposition`, () => {
      expect(
        loweredProperty(label, paramsSrc(field), "p"),
        `${label}: the block parses, so the fix cannot reach this row`,
      ).toEqual(lowered);
    });
  }

  it("GREEN (e6): the §Non-goals `p: \"a\"` row keeps its unresolved-named-type", () => {
    // YAML strips the quotes here, so the block parses and the failure is a
    // type-text recovery question at a PARSING frontmatter (§Non-goals). The
    // new code must not reach it — a fix triggered by the quote character
    // rather than the parser's verdict would.
    const doc = parseDoc(paramsSrc('p: "a"'), "bug0263.theta");
    expect(
      diagLines(doc),
      "e6: exactly one error naming the unresolved type text, unmoved",
    ).toEqual([
      `error theta/parse/unresolved-named-type: ${unresolvedMessage("a")}`,
    ]);
    expect(doc.frontmatter, "e6: the params-owned error refuses the theta").toBeNull();
  });
});

// ===========================================================================
// (f) THE `missing-mode` FENCE — §Fix constraint 1's other half: the code
// keeps firing, with its registry message unamended, on a file that genuinely
// omits `mode:`. GREEN at HEAD and required to stay green.
// ===========================================================================

describe("bug 0263 (f) — a file that omits `mode:` still draws missing-mode", () => {
  it(`GREEN (f1): a well-formed frontmatter with no \`mode:\` draws exactly one ${MISSING_MODE}`, () => {
    const doc = parseDoc(frontmatterSrc("params:\n  a: string\n"), "bug0263.theta");
    expect(
      diagLines(doc),
      `f1: the block PARSES and the required field is absent, which is exactly ${MISSING_MODE}'s registry *Trigger*; the fix replaces the code only at the FM-5 discard`,
    ).toEqual([`error ${MISSING_MODE}: ${missingModeMessage()}`]);
  });
});

// ===========================================================================
// (g) THE FAIL-CLOSED FENCE — §Fix constraint 5. GREEN at HEAD (the
// misattributed error already un-registers) and required to stay green: only
// the diagnostic changes.
// ===========================================================================

describe("bug 0263 (g) — a rejected frontmatter block never registers", () => {
  for (const subject of [...PARAMS_SUBJECTS, ...PLAIN_SUBJECTS]) {
    it(`GREEN (g, ${subject.label}): the theta is dropped before and after the fix`, () => {
      const doc = parseDoc(subject.source, "bug0263.theta");
      expect(
        registered(doc),
        `${subject.label}: §Fix constraint 5 — the refusal is fail-closed today and stays fail-closed. Rendered diagnostics: ${JSON.stringify(diagLines(doc))}`,
      ).toBe(false);
    });
  }
});

// ===========================================================================
// (h) THE DIAG-2 MIRRORS — the registry row and its reference transcription.
// RED at HEAD: neither page carries the code.
// ===========================================================================

describe("bug 0263 (h) — the new code carries its registry row and mirror row", () => {
  it(`RED (h1): ${REGISTRY_LOAD_PAGE} carries ${CODE} at severity E, phase load`, () => {
    const row = REGISTRY.find((r) => r.code === CODE);
    expect(
      row,
      `DIAG-2: the registry is closed, and the FM-5 comment in \`parseFrontmatter\` (src/parser/frontmatter.ts) cites the absence of a malformed-YAML code as the reason for today's degrade, so the fix lands this row in the same commit`,
    ).toBeDefined();
    const found = row as RegistryRow;
    expect(
      found.severity,
      "severity E — the refusal is fail-closed, and registration is withheld on error severity alone (`hasLoadParseError`, src/extension/production-composition.ts)",
    ).toBe("E");
    expect(
      found.phase,
      "phase load — the judgement is the frontmatter read's own YAML parse, beside the other `theta/load/` frontmatter rows",
    ).toBe("load");
    expect(
      registryMessage(REGISTRY, CODE),
      "DIAG-4: the *Message* column is normative character-for-character; this file renders every expected message from it",
    ).toBe(EXPECTED_TEMPLATE);
  });

  it(`RED (h2): ${MIRROR_PAGE} mirrors the new row`, () => {
    // The mirror carries Code / Sev / Phase / Message only, and a registry
    // ADDITION is exactly the case where it must move with the spec page.
    const line = readRepoFile(MIRROR_PAGE)
      .split("\n")
      .find((l) => l.includes(`\`${CODE}\``));
    expect(
      line,
      `${MIRROR_PAGE} must carry the mirror row for ${CODE}; a registry addition moves both pages`,
    ).toBeDefined();
    expect(
      line as string,
      `the mirror row must carry the same *Message* as ${REGISTRY_LOAD_PAGE}`,
    ).toContain(EXPECTED_TEMPLATE);
    expect(line as string, "the mirror row's Sev column is `E`").toContain("| E |");
  });
});
