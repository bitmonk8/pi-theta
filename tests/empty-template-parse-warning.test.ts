import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0085 — QRY-6's parse-time layer has no production caller
// (docs/bugs/0085-empty-template-warning-dead.md). `emptyTemplateWarning`
// (src/render/query-render.ts, symbol) implements the whole predicate and is
// called from no `src/` site, so an empty or whitespace-only `@`…`` template
// loads with ZERO diagnostics and the degeneracy is discovered only at run
// time as `Err(ValidationError { cause: "empty_template" })`.
//
// Spec: QRY-6 (docs/spec_topics/query/query-forms.md#qry-6) — "Two layers
// defend against sending the provider a turn that contains no useful text",
// layer one being a parse-time warning `theta/parse/empty-template` over the
// template's STATIC body (the literal segments between `${…}` interpolations,
// newline-trim and dedent notionally applied, the escape rewrites notionally
// NOT applied), whitespace being the ASCII set pinned by System-note rendering
// rule 1 and never the regex `\s` class. The registry row is
// docs/spec_topics/diagnostics/code-registry-parse.md (severity W, phase
// parse), mirrored in docs/reference/diagnostics.md. DIAG-4 makes the Message
// column normative, so it is read from the shipped registry here rather than
// copied as prose.
//
// PINNED POST-FIX CONTRACT (bug doc §Fix, disposition 1 — wire the caller):
//   (W-*)  a WRITTEN, CLOSED template whose static body is empty or
//          ASCII-whitespace-only draws exactly one severity-"warning"
//          `theta/parse/empty-template`, message byte-equal to the registry
//          Message, range over the template's source span (opening backtick
//          through closing backtick).
//   (S-*)  suppression: non-empty bodies, the QRY-6 `\n` literal-escape hatch
//          (pre-escape reading), a U+00A0-only body (ASCII set, not `\s`), and
//          the two error-recovery captures — an unwritten template
//          (`let r = @<Ghost` at EOF) and an unterminated one (opening
//          backtick, EOF before the closing one) — draw NO empty-template
//          warning. The recovery rows are load-bearing: QRY-6's Trigger
//          presupposes a written, closed template, and unguarded wiring would
//          red five committed witnesses over those shapes.
//   (L-*)  severity W preserves registration: the degenerate documents still
//          load — no error-severity diagnostic is added.
//   (M-1)  DIAG-4 skew: the expected Message is the shipped registry row's.

const EMPTY_TEMPLATE_CODE = "theta/parse/empty-template";
const FILE = "bug0085.theta";

/** Frontmatter prelude — occupies source lines 1–3; every body starts at 4. */
const FM = "---\nmode: prompt\n---\n";

interface RegistryRow {
  code: string;
  namespace: string;
  severity: string;
  phase: string;
  trigger: string;
  message: string;
}

// The sharded registry as shipped — the same input tests/code-registry.test.ts
// reconciles; DIAG-4 makes its Message column the normative expectation.
const REGISTRY_TEXT = [
  "code-registry-parse.md",
  "code-registry-load.md",
  "code-registry-runtime.md",
  "code-registry-host.md",
]
  .map((page) =>
    readFileSync(
      fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
      "utf8",
    ),
  )
  .join("\n");

const REGISTRY = parseRegistry(REGISTRY_TEXT) as RegistryRow[];

const NORMATIVE_MESSAGE = registryMessage(REGISTRY, EMPTY_TEMPLATE_CODE) as
  | string
  | undefined;

function withCode(diags: readonly Diagnostic[], code: string): Diagnostic[] {
  return diags.filter((d) => d.code === code);
}

function describeDiags(diags: readonly Diagnostic[]): string {
  return diags.length === 0
    ? "[] (NO DIAGNOSTIC — the bug-0085 symptom)"
    : JSON.stringify(diags);
}

/** A 1-indexed, end-exclusive-column source position. */
interface Pos {
  readonly line: number;
  readonly column: number;
}

function beforeOrEqual(a: Pos, b: Pos): boolean {
  return a.line < b.line || (a.line === b.line && a.column <= b.column);
}

/**
 * The degenerate-template contract for one cell: exactly one
 * `theta/parse/empty-template`, severity "warning", located in the parsed file,
 * message byte-equal to the registry Message (DIAG-4), and a range COVERING the
 * template's source span. Coverage rather than equality because QRY-6 fixes the
 * location ("at the template's source location") without fixing whether the
 * emitted range starts at the `@` sigil or at the opening backtick; both
 * readings satisfy the rule, and neither can be produced at HEAD.
 */
function expectEmptyTemplateWarning(
  id: string,
  src: string,
  span: { readonly open: Pos; readonly closeEnd: Pos },
): void {
  const doc = parseDoc(src, FILE);
  const hits = withCode(doc.diagnostics, EMPTY_TEMPLATE_CODE);
  expect(
    hits.length,
    `PRIMARY (bug 0085, ${id}): QRY-6 layer one — parseThetaDocument must emit exactly one ` +
      `${EMPTY_TEMPLATE_CODE} for a written, closed template whose static body is empty or ` +
      `ASCII-whitespace-only. AT HEAD the only emitter (emptyTemplateWarning, ` +
      `src/render/query-render.ts) has no src/ caller, so the parse is silent and the ` +
      `degeneracy surfaces only at run time as Err(cause: "empty_template"). Observed ` +
      `diagnostics: ${describeDiags(doc.diagnostics)}`,
  ).toBe(1);
  const d = hits[0]!;
  expect(
    d.severity,
    `${id}: the registry row's severity is W — the theta still loads and the author is warned`,
  ).toBe("warning");
  expect(d.file, `${id}: the diagnostic is located in the parsed file`).toBe(FILE);
  expect(
    NORMATIVE_MESSAGE,
    `DIAG-4: code-registry-parse.md must carry the ${EMPTY_TEMPLATE_CODE} Message row the ` +
      `emission is byte-equal to`,
  ).toBeDefined();
  expect(
    d.message,
    `${id}: DIAG-4 — the emitted message is byte-identical to the registry Message column`,
  ).toBe(NORMATIVE_MESSAGE);
  expect(d.range, `${id}: the warning carries the template's source location`).toBeDefined();
  const range = d.range!;
  expect(
    beforeOrEqual(range.start, span.open) && beforeOrEqual(span.closeEnd, range.end),
    `${id}: QRY-6 puts the warning "at the template's source location" — the range must cover ` +
      `the opening backtick ${JSON.stringify(span.open)} through the closing backtick ` +
      `(end-exclusive ${JSON.stringify(span.closeEnd)}); observed ${JSON.stringify(range)}`,
  ).toBe(true);
}

/**
 * The suppression contract for one cell: NO `theta/parse/empty-template`, and —
 * where the shape already draws its own row(s) — those codes are still present,
 * so a guard that suppresses the new warning by suppressing the shape's whole
 * diagnostic set is caught here (the guard cells ).
 */
function expectNoEmptyTemplateWarning(
  id: string,
  src: string,
  stillPresent: readonly string[] = [],
): void {
  const doc = parseDoc(src, FILE);
  expect(
    withCode(doc.diagnostics, EMPTY_TEMPLATE_CODE),
    `${id}: ${EMPTY_TEMPLATE_CODE} must NOT fire here — QRY-6's Trigger is over a WRITTEN, ` +
      `CLOSED template's static body, ASCII whitespace only, escapes not applied. Observed ` +
      `diagnostics: ${describeDiags(doc.diagnostics)}`,
  ).toEqual([]);
  for (const code of stillPresent) {
    expect(
      doc.diagnostics.map((x) => x.code),
      `${id}: this shape's own refusal must survive the wiring — a guard must narrow the new ` +
        `warning, never the existing row; observed ${describeDiags(doc.diagnostics)}`,
    ).toContain(code);
  }
}

/** Assert the document still LOADS: severity W must not deny registration. */
function expectStillLoads(id: string, src: string): void {
  const doc = parseDoc(src, FILE);
  expect(
    doc.diagnostics.filter((d) => d.severity === "error"),
    `${id}: the registry row's severity is W — QRY-6 says "The theta still loads", so wiring ` +
      `layer one must add NO error-severity diagnostic; observed ${describeDiags(doc.diagnostics)}`,
  ).toEqual([]);
}

// ===========================================================================
// (M) The normative Message — read from the shipped registry (DIAG-4).
// ===========================================================================

describe("bug 0085 (M) registry contract — theta/parse/empty-template is a registered W parse row", () => {
  it("M-1: the shipped parse registry carries the row with severity W, phase parse, and a non-empty Message", () => {
    const row = REGISTRY.find((r) => r.code === EMPTY_TEMPLATE_CODE);
    expect(
      row,
      `DIAG-2: docs/spec_topics/diagnostics/code-registry-parse.md must carry the ` +
        `${EMPTY_TEMPLATE_CODE} row that QRY-6 layer one emits`,
    ).toBeDefined();
    expect(row!.severity, "the theta still loads — severity W").toBe("W");
    expect(row!.phase, "emitted from the parse walk over the template node — phase parse").toBe(
      "parse",
    );
    expect(
      NORMATIVE_MESSAGE,
      "DIAG-4: the Message column is normative and is the expectation every cell below asserts",
    ).toBe("query template body is empty after newline-trim and dedent");
  });
});

// ===========================================================================
// (W) The Trigger — a written, closed template with a degenerate static body.
// RED at HEAD: parseDoc reports nothing for any of these.
// ===========================================================================

describe("bug 0085 (W) the QRY-6 Trigger — a degenerate static body warns at parse", () => {
  it("RED W-1: `@``` — a zero-length static body", () => {
    // Line 4 is `let r = @``` — `@` col 9, opening backtick 10, closing 11.
    expectEmptyTemplateWarning("W-1 (zero-length)", `${FM}let r = @\`\`\nr\n`, {
      open: { line: 4, column: 10 },
      closeEnd: { line: 4, column: 12 },
    });
  });

  it("RED W-2: `@`   `` — a space-only static body", () => {
    expectEmptyTemplateWarning("W-2 (three spaces)", `${FM}let r = @\`   \`\nr\n`, {
      open: { line: 4, column: 10 },
      closeEnd: { line: 4, column: 15 },
    });
  });

  it("RED W-3: a newline-only static body — newline-trim leaves nothing", () => {
    // The closing backtick sits on line 6 (two interior newlines).
    expectEmptyTemplateWarning("W-3 (newlines only)", `${FM}let r = @\`\n\n\`\nr\n`, {
      open: { line: 4, column: 10 },
      closeEnd: { line: 6, column: 2 },
    });
  });

  it("RED W-4: a tab-only static body — dedent leaves nothing", () => {
    // The tab's column width is lexer detail, so the covered span is pinned by
    // the opening backtick and by the closing backtick's LINE only.
    expectEmptyTemplateWarning("W-4 (tab only)", `${FM}let r = @\`\t\`\nr\n`, {
      open: { line: 4, column: 10 },
      closeEnd: { line: 4, column: 11 },
    });
  });

  // One row per ASCII-whitespace member of the set QRY-6 pins (System-note
  // rendering rule 1): the predicate must accept every member, and no member
  // may be reached through the regex `\s` class (cell S-4 holds the other side).
  const ASCII_WHITESPACE: readonly { readonly id: string; readonly ch: string }[] = [
    { id: "W-5 U+0009 tab", ch: "\u0009" },
    { id: "W-6 U+000A line feed", ch: "\u000a" },
    { id: "W-7 U+000B vertical tab", ch: "\u000b" },
    { id: "W-8 U+000C form feed", ch: "\u000c" },
    { id: "W-9 U+000D carriage return", ch: "\u000d" },
    { id: "W-10 U+0020 space", ch: "\u0020" },
  ];

  for (const member of ASCII_WHITESPACE) {
    it(`RED ${member.id}: a static body of exactly this ASCII-whitespace member warns`, () => {
      const doc = parseDoc(`${FM}let r = @\`${member.ch}\`\nr\n`, FILE);
      const hits = withCode(doc.diagnostics, EMPTY_TEMPLATE_CODE);
      expect(
        hits.length,
        `PRIMARY (bug 0085, ${member.id}): the ASCII-whitespace set QRY-6 pins is closed over ` +
          `this member, so a body of exactly this character is whitespace-only and warns. ` +
          `AT HEAD nothing fires: ${describeDiags(doc.diagnostics)}`,
      ).toBe(1);
      expect(
        hits[0]!.severity,
        `${member.id}: severity W — registration is unaffected`,
      ).toBe("warning");
      expect(
        hits[0]!.message,
        `${member.id}: DIAG-4 — byte-equal to the registry Message`,
      ).toBe(NORMATIVE_MESSAGE);
    });
  }

  it("RED W-11: `@`${x}`` — an interpolation-only template has an EMPTY static body and warns", () => {
    // QRY-6's letter: the static body is the literal segments between
    // interpolations. `${x}` contributes none, so the body is empty.
    expectEmptyTemplateWarning(
      "W-11 (interpolation only)",
      `${FM}let x = "a"\nlet r = @\`\${x}\`\nr\n`,
      { open: { line: 5, column: 10 }, closeEnd: { line: 5, column: 16 } },
    );
  });

  it("RED W-12: `@`  ${x}  `` — literal segments that are all whitespace warn", () => {
    expectEmptyTemplateWarning(
      "W-12 (whitespace around one interpolation)",
      `${FM}let x = "a"\nlet r = @\`  \${x}  \`\nr\n`,
      { open: { line: 5, column: 10 }, closeEnd: { line: 5, column: 20 } },
    );
  });
});

// ===========================================================================
// (L) Severity W preserves registration — the degenerate documents still load.
// Green at HEAD AND post-fix; a wiring that raised the severity reds these.
// ===========================================================================

describe("bug 0085 (L) severity W preserves registration — the degenerate documents still load", () => {
  const LOADING: readonly { readonly id: string; readonly src: string }[] = [
    { id: "L-1 zero-length", src: `${FM}let r = @\`\`\nr\n` },
    { id: "L-2 spaces", src: `${FM}let r = @\`   \`\nr\n` },
    { id: "L-3 newlines", src: `${FM}let r = @\`\n\n\`\nr\n` },
    { id: "L-4 tab", src: `${FM}let r = @\`\t\`\nr\n` },
    { id: "L-5 interpolation only", src: `${FM}let x = "a"\nlet r = @\`\${x}\`\nr\n` },
  ];

  for (const cell of LOADING) {
    it(`${cell.id}: no error-severity diagnostic is added — QRY-6 "The theta still loads"`, () => {
      expectStillLoads(cell.id, cell.src);
    });
  }
});

// ===========================================================================
// (S) Suppression — the shapes the Trigger does NOT reach. Green at HEAD;
// they must stay green once the caller is wired.
// ===========================================================================

describe("bug 0085 (S) suppression — non-degenerate bodies and the two error-recovery captures", () => {
  it("S-1: `@`hi`` — a body with literal text draws nothing", () => {
    expectNoEmptyTemplateWarning("S-1 (literal text)", `${FM}let r = @\`hi\`\nr\n`);
  });

  it("S-2: `@`hi ${x}`` — a non-whitespace literal segment beside an interpolation draws nothing", () => {
    expectNoEmptyTemplateWarning(
      "S-2 (text plus interpolation)",
      `${FM}let x = "a"\nlet r = @\`hi \${x}\`\nr\n`,
    );
  });

  it("S-3: `@`\\n`` — QRY-6's suppression hatch; the predicate reads the body PRE-escape", () => {
    // The two-character literal escape sequence backslash + n. Post-escape it
    // renders to a single newline (whitespace); QRY-6 evaluates the static body
    // with the escape rewrites NOT applied, so the body is `\n` — two
    // non-whitespace characters — and the author's intentionally-blank prompt
    // is exempt.
    expectNoEmptyTemplateWarning("S-3 (\\n hatch)", `${FM}let r = @\`\\n\`\nr\n`);
  });

  it("S-4: a U+00A0-only body draws nothing — the registry pins the ASCII set, never `\\s`", () => {
    // No-break space is whitespace to the regex `\s` class and NOT a member of
    // the ASCII set QRY-6 pins, so it is ordinary content.
    expectNoEmptyTemplateWarning("S-4 (U+00A0)", `${FM}let r = @\`\u00a0\`\nr\n`);
  });

  it("S-5: `let r = @<Ghost` at EOF — the annotation over-run wrote NO template; its own refusal stands alone", () => {
    // The recovery capture swallows the tail and mints a query node whose
    // `template` is the empty string, so an unguarded wiring would warn about a
    // template the author never wrote. QRY-6's Trigger presupposes a written
    // template, so only the existing refusal may appear.
    expectNoEmptyTemplateWarning("S-5 (@<Ghost at EOF)", `${FM}let r = @<Ghost`, [
      "theta/parse/unresolved-named-type",
    ]);
  });

  it("S-6: `let r = @<Ghost` with a following line — same over-run, the non-type-text refusal stands alone", () => {
    expectNoEmptyTemplateWarning("S-6 (@<Ghost, tail swallowed)", `${FM}let r = @<Ghost\nr\n`, [
      "theta/parse/query-annotation-type-not-expression",
    ]);
  });

  it("S-7: an unterminated `` @` `` — opening backtick, EOF before the closing one — draws no empty-template warning", () => {
    // The recovery capture likewise mints `template: ""`. The template is NOT
    // closed, so QRY-6's Trigger is not satisfied; whatever this shape's own
    // diagnosis is, it is not this warning.
    expectNoEmptyTemplateWarning("S-7 (unterminated at EOF)", `${FM}let r = @\``);
  });

  it("S-8: an unterminated `` @` `` with a following line draws no empty-template warning", () => {
    expectNoEmptyTemplateWarning("S-8 (unterminated, tail)", `${FM}let r = @\`\nr\n`);
  });
});
