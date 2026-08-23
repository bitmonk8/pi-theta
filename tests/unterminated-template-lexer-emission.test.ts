import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0246 — `theta/parse/unterminated-template` is a registered E/`lex` row
// (docs/spec_topics/diagnostics/code-registry-parse.md:80) with no emission
// site reachable from `parseDoc`
// (docs/bugs/0246-unterminated-query-template-registered-unfired.md).
//
// The condition is observed in the whole-file lexer and discarded: `lexTheta`
// sets `inTemplateProse` on the opening backtick punct (src/lexer/lexer.ts:715–719),
// consumes every subsequent character with no token and no diagnostic, and
// falls out of its `while (i < n)` loop at EOF straight into
// `return { tokens, diagnostics }` (src/lexer/lexer.ts:730) without inspecting
// the flag. The sibling that does discharge the same shape is the string scan's
// `if (!closed)` branch (src/lexer/lexer.ts:522–542,
// `theta/parse/unterminated-string`).
//
// SPEC ANCHORS.
//   - docs/spec_topics/query/query-escapes-stringification.md:12 — QRY-17: "EOF
//     inside an unterminated template body surfaces as
//     `theta/parse/unterminated-template`."
//   - docs/spec_topics/diagnostics/code-registry-parse.md:80 — the row: `E`,
//     phase `lex`, *Trigger* "EOF reached while scanning a `@`...`` query
//     template."
//   - docs/spec_topics/diagnostics/diagnostic-shape.md — DIAG-4 makes the
//     *Message* column normative (so the expectation is READ from the shipped
//     registry, never transcribed) and the located-site classification fixes
//     every `theta/parse/*` row as carrying both `file` and `range`.
//
// THE PINNED CONTRACT (bug doc §Fix — one EOF branch in `lexTheta`, nothing
// else):
//   (U-*)  an unterminated `@`…`` reaching `parseDoc` draws EXACTLY ONE
//          severity-"error" `theta/parse/unterminated-template`, `file` set,
//          message byte-equal to the registry Message, and a range whose START
//          is the OPENING BACKTICK and whose end reaches EOF.
//   (I-*)  the interpolation sub-case is in class (§Fix constraint 2): `${x` at
//          EOF leaves `interpDepth` at 1 with the prose flag already cleared, so
//          it draws the row too, as does `${1} tail` where the flag is set again
//          by the closing brace.
//   (N-*)  negative controls: no CLOSED template draws the row — including a
//          document carrying several well-formed `@`-queries. These are the
//          §Fix constraint 1 trap: forwarding `lexQueryTemplate`'s array would
//          fire the code on every `@`-query in the corpus, because its three
//          callers pass the interior slice and `terminated` is therefore false
//          on every call.
//   (M-*)  the DIAG-4 oracle: the row's shipped severity / phase / Message.
//   (R-*)  the pinned residual (§Fix constraint 4): the diagnostic is the whole
//          repair. The prose region still eats the remainder of the file, so the
//          statements after the unterminated template stay ABSENT from the AST
//          and the query node is still minted `template: ""`. A later
//          resynchronise decision must red here rather than land unnoticed.
//
// Constraint 3 puts the witness at `parseDoc` level: the render-seam unit cell
// over a direct `lexQueryTemplate` call (tests/query-render.test.ts:128–136)
// covers a source shape no production caller constructs and stays as it is.
//
// Offline, provider-free. No silent skipping: a missing registry row throws
// naming itself.

const UNTERMINATED_TEMPLATE_CODE = "theta/parse/unterminated-template";
const UNKNOWN_IDENTIFIER_CODE = "theta/parse/unknown-identifier";
const FILE = "bug0246.theta";

/** Frontmatter prelude — occupies source lines 1–3; every body starts at line 4. */
const FM = "---\nmode: prompt\n---\n";

interface RegistryRow {
  code: string;
  namespace: string;
  severity: string;
  phase: string;
  trigger: string;
  message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];

const ROW = REGISTRY.find((r) => r.code === UNTERMINATED_TEMPLATE_CODE);

/**
 * The row's normative *Message* (DIAG-4). Throws naming the registry page when
 * the row is absent, so registry drift can never degrade an assertion below
 * into a comparison against `undefined`.
 */
function normativeMessage(): string {
  const message = registryMessage(REGISTRY, UNTERMINATED_TEMPLATE_CODE) as
    | string
    | undefined;
  if (typeof message !== "string" || message.length === 0) {
    throw new Error(
      `harness: docs/spec_topics/diagnostics/code-registry-parse.md carries no Message row for ` +
        `${UNTERMINATED_TEMPLATE_CODE} — the DIAG-4 column is this file's only message oracle, ` +
        `so a missing row is a harness failure, never a skip`,
    );
  }
  return message;
}

function withCode(diags: readonly Diagnostic[], code: string): Diagnostic[] {
  return diags.filter((d) => d.code === code);
}

function describeDiags(diags: readonly Diagnostic[]): string {
  return diags.length === 0
    ? "[] (NO DIAGNOSTIC — the bug-0246 symptom)"
    : JSON.stringify(diags);
}

/** The 1-indexed line count of a source — the line EOF sits on. */
function lastLineOf(src: string): number {
  return src.split("\n").length;
}

/**
 * The whole (U-*) / (I-*) contract for one unterminated source: exactly one
 * emission, severity "error", located in the parsed file, message byte-equal to
 * the registry Message, range starting at the opening backtick and reaching the
 * EOF line.
 */
function expectUnterminatedTemplate(
  id: string,
  src: string,
  openBacktick: { readonly line: number; readonly column: number },
): void {
  const full = FM + src;
  const doc = parseDoc(full, FILE);
  const hits = withCode(doc.diagnostics, UNTERMINATED_TEMPLATE_CODE);
  expect(
    hits.length,
    `PRIMARY (bug 0246, ${id}): the registry Trigger is "EOF reached while scanning a ` +
      `@\`...\` query template", so lexTheta must push exactly one ` +
      `${UNTERMINATED_TEMPLATE_CODE} at its EOF exit. AT HEAD the main loop falls out with ` +
      `inTemplateProse still set and nothing tests it, so the document loads silent. Observed ` +
      `diagnostics: ${describeDiags(doc.diagnostics)}`,
  ).toBe(1);
  const d = hits[0]!;
  expect(
    d.severity,
    `${id}: the registry row's severity is E — the theta does not load with an unterminated ` +
      `template`,
  ).toBe("error");
  expect(d.file, `${id}: a theta/parse/* row is a located site and carries the parsed file`).toBe(
    FILE,
  );
  expect(
    d.message,
    `${id}: DIAG-4 — the emitted message is byte-identical to the registry Message column`,
  ).toBe(normativeMessage());
  expect(
    d.range,
    `${id}: a located site carries a range; the author needs the tick that opened the template`,
  ).toBeDefined();
  const range = d.range!;
  expect(
    range.start,
    `${id}: the range starts at the OPENING BACKTICK — the one character the author must fix. ` +
      `Observed ${JSON.stringify(range)}`,
  ).toEqual(openBacktick);
  expect(
    range.end.line,
    `${id}: the unterminated body runs to EOF, so the range ends on the source's final line ` +
      `(${lastLineOf(full)}); observed ${JSON.stringify(range.end)}`,
  ).toBe(lastLineOf(full));
}

/**
 * The (N-*) contract: a source drawing ZERO occurrences of the row. Also asserts
 * the codes the shape draws on its own account are undisturbed, so a fix that
 * suppressed the emission by suppressing the shape's whole diagnostic set is
 * caught here.
 */
function expectNoUnterminatedTemplate(
  id: string,
  src: string,
  stillPresent: readonly string[] = [],
): void {
  const doc = parseDoc(FM + src, FILE);
  expect(
    withCode(doc.diagnostics, UNTERMINATED_TEMPLATE_CODE),
    `${id}: ${UNTERMINATED_TEMPLATE_CODE} must NOT fire here — the template is CLOSED, so the ` +
      `lexer's prose flag is cleared and its interpolation depth is back to zero before EOF. ` +
      `A fix routing lexQueryTemplate's array instead of adding the EOF branch fires the code ` +
      `on every @-query in the corpus and reds here. Observed diagnostics: ` +
      `${describeDiags(doc.diagnostics)}`,
  ).toEqual([]);
  for (const code of stillPresent) {
    expect(
      doc.diagnostics.map((x) => x.code),
      `${id}: this shape's own diagnosis must survive the new branch. Observed ` +
        `${describeDiags(doc.diagnostics)}`,
    ).toContain(code);
  }
}

// ===========================================================================
// (M) The registered row, read from the shipped registry (DIAG-4 / DIAG-2).
// ===========================================================================

describe("bug 0246 (M) the registered row — theta/parse/unterminated-template is an E/lex parse row", () => {
  it("M-1: the shipped parse registry carries the row with severity E, phase lex, and a non-empty Message", () => {
    expect(
      ROW,
      `DIAG-2: docs/spec_topics/diagnostics/code-registry-parse.md must carry the ` +
        `${UNTERMINATED_TEMPLATE_CODE} row this file asserts an emission for`,
    ).toBeDefined();
    expect(
      ROW!.severity,
      "an unterminated template is a refusal, not a warning — severity E",
    ).toBe("E");
    expect(
      ROW!.phase,
      "the condition is observable only to the whole-file scan that consumed the prose — phase lex",
    ).toBe("lex");
    expect(
      normativeMessage(),
      "DIAG-4: the Message column is normative and is the expectation every emission cell asserts",
    ).toBe(ROW!.message);
  });
});

// ===========================================================================
// (U) The Trigger — an unterminated `@`…`` reaching parseDoc.
// RED at HEAD: every row below reports nothing.
// ===========================================================================

describe("bug 0246 (U) the QRY-17 Trigger — an unterminated `@`…`` template draws the row at parseDoc", () => {
  it("RED U-1: `let _ = @`abc` at EOF", () => {
    expectUnterminatedTemplate("U-1 (bare EOF)", "let _ = @`abc", { line: 4, column: 10 });
  });

  it("RED U-2: the prose region swallows two following statements and still reports nothing", () => {
    expectUnterminatedTemplate(
      "U-2 (two swallowed statements)",
      "let _ = @`abc\nlet y = 1\nlet z = y",
      { line: 4, column: 10 },
    );
  });

  it("RED U-3: an illegal escape inside the unterminated body does not displace the EOF row", () => {
    // `theta/parse/illegal-template-escape` is the bug doc's §Non-goals row and
    // is not claimed here; the EOF condition holds regardless of the body's
    // contents.
    expectUnterminatedTemplate("U-3 (backslash body)", "let _ = @`a \\q b", {
      line: 4,
      column: 10,
    });
  });

  it("RED U-4: the swallowed statement's OWN diagnostic is gone, and the EOF row is what reports the loss", () => {
    expectUnterminatedTemplate(
      "U-4 (swallowed unknown identifier)",
      "let _ = @`abc\nlet z = notdefined",
      { line: 4, column: 10 },
    );
  });

  it("RED U-5: an unterminated template inside a `fn` body — the closing brace is never tokenised either", () => {
    expectUnterminatedTemplate(
      "U-5 (inside a fn body)",
      "fn f() {\nlet _ = @`abc\n}\nlet q = notdefined",
      { line: 5, column: 10 },
    );
  });
});

// ===========================================================================
// (I) §Fix constraint 2 — the interpolation sub-case.
// `${x` at EOF clears the prose flag and leaves interpDepth at 1, so the flag
// alone does not catch it. RED at HEAD.
// ===========================================================================

describe("bug 0246 (I) the interpolation sub-case — EOF inside or after a `${…}` is the same class", () => {
  it("RED I-1: `let _ = @`abc ${x` — EOF with the interpolation still open", () => {
    expectUnterminatedTemplate("I-1 (open interpolation, identifier)", "let _ = @`abc ${x", {
      line: 4,
      column: 10,
    });
  });

  it("RED I-2: `let _ = @`abc ${1` — EOF with the interpolation still open over a literal", () => {
    expectUnterminatedTemplate("I-2 (open interpolation, literal)", "let _ = @`abc ${1", {
      line: 4,
      column: 10,
    });
  });

  it("RED I-3: `let _ = @`abc ${1} tail` — the interpolation closed, the template did not", () => {
    // The closing brace puts the scan back into template prose, so the prose
    // flag is the disjunct that catches this one.
    expectUnterminatedTemplate("I-3 (closed interpolation, open template)", "let _ = @`abc ${1} tail", {
      line: 4,
      column: 10,
    });
  });
});

// ===========================================================================
// (N) Negative controls — a CLOSED template draws nothing. Green at HEAD and
// green post-fix; the §Fix constraint 1 trap reds them.
// ===========================================================================

describe("bug 0246 (N) suppression — no closed `@`…`` template draws the row", () => {
  it("N-1: `let _ = @`abc`` — the closed control of U-1", () => {
    expectNoUnterminatedTemplate("N-1 (closed)", "let _ = @`abc`");
  });

  it("N-2: `let _ = @`abc`` with a following statement — the tail parses and keeps its own refusal", () => {
    expectNoUnterminatedTemplate(
      "N-2 (closed, tail parses)",
      "let _ = @`abc`\nlet z = notdefined",
      [UNKNOWN_IDENTIFIER_CODE],
    );
  });

  it("N-3: a closed template inside a `fn` body — the closed control of U-5", () => {
    expectNoUnterminatedTemplate(
      "N-3 (closed, inside a fn body)",
      "fn f() {\nlet _ = @`abc`\n}\nlet q = notdefined",
      [UNKNOWN_IDENTIFIER_CODE],
    );
  });

  it("N-4: `let _ = @`abc ${1}`` — a closed interpolation inside a closed template", () => {
    expectNoUnterminatedTemplate("N-4 (closed interpolation)", "let _ = @`abc ${1}`");
  });

  it("N-5: an ordinary document of several well-formed `@`-queries draws the row ZERO times", () => {
    // The §Fix constraint 1 trap, witnessed: `lexQueryTemplate`'s three callers
    // pass the slice BETWEEN the backticks, so its `terminated` flag is false
    // for every well-formed template in the corpus. A fix that forwarded that
    // array would report an unterminated template for each of the four queries
    // below.
    expectNoUnterminatedTemplate(
      "N-5 (four well-formed queries)",
      [
        "let a = @`first prompt`",
        "let b = @`second\nprompt over two lines`",
        'let name = "x"',
        "let c = @`third ${name} prompt`",
        "let d = @`   `",
        "a",
      ].join("\n"),
    );
  });

  it("N-6: a document with no `@`-query at all draws the row ZERO times", () => {
    expectNoUnterminatedTemplate("N-6 (no query)", 'let a = 1\nlet b = "text"\nb');
  });
});

// ===========================================================================
// (R) The pinned residual (§Fix constraint 4) — the swallow is NOT repaired.
// Green at HEAD and green post-fix; a resynchronise change reds here.
// ===========================================================================

describe("bug 0246 (R) residual — the diagnostic is the whole repair; the suffix stays swallowed", () => {
  it("R-1: after an unterminated template the following statements stay ABSENT from the AST", () => {
    const doc = parseDoc(`${FM}let _ = @\`abc\nlet z = notdefined`, FILE);
    expect(
      doc.body.statements.length,
      "the lexer's prose region consumes the remainder of the file, so only the `let _` above " +
        "the opening backtick reaches the AST. Recovering the suffix is a resynchronise " +
        "decision bug 0246 does not settle — this cell pins the loss so a later change to it " +
        "is deliberate. Observed statements: " +
        JSON.stringify(doc.body.statements.map((s) => (s as { kind: string }).kind)),
    ).toBe(1);
    expect(
      doc.diagnostics.map((d) => d.code),
      "the swallowed statement's own refusal is lost with it — the EOF row is the only " +
        "diagnostic this shape draws",
    ).not.toContain(UNKNOWN_IDENTIFIER_CODE);
  });

  it("R-2: the minted query node still carries `template: \"\"`", () => {
    const doc = parseDoc(`${FM}let _ = @\`abc`, FILE);
    const first = doc.body.statements[0] as {
      kind: string;
      init?: { kind?: string; template?: string };
    };
    expect(first.kind, "the statement above the opening backtick parses normally").toBe("let");
    expect(
      first.init?.kind,
      "the capture still mints a query node — the parser's recovery is untouched",
    ).toBe("query");
    expect(
      first.init?.template,
      "`rawTemplate` requires BOTH ticks and otherwise falls back to the space-joined interior " +
        "tokens, of which the prose region produced none. Bug 0085's two-tick guard correctly " +
        "declines to warn about this empty body, so the EOF row is the only report of it.",
    ).toBe("");
  });

  it("R-3: the unterminated template's `fn` body brace imbalance still draws no diagnostic of its own", () => {
    const doc = parseDoc(`${FM}fn f() {\nlet _ = @\`abc\n}\nlet q = notdefined`, FILE);
    expect(
      doc.body.statements.length,
      "the `}` closing the fn body is inside the swallowed prose and is never tokenised, so " +
        "the parser's bracket accounting never sees an imbalance. Observed: " +
        JSON.stringify(doc.body.statements.map((s) => (s as { kind: string }).kind)),
    ).toBe(1);
    expect(
      doc.diagnostics.map((d) => d.code).filter((c) => c !== UNTERMINATED_TEMPLATE_CODE),
      "no code other than the EOF row is owed for this shape by bug 0246",
    ).toEqual([]);
  });
});
