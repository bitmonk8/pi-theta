import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0384 — seven field-name diagnostic interpolations bind an
// author-controlled name into their single-line `message` with NO line-break
// transform, so a name carrying a real U+000A embeds a RAW newline into the
// `message`, producing a two-physical-line summary where diagnostic-shape.md:34
// requires a single-line summary. Two carrier families, all reachable offline:
//   FOUR `params:`-key sites bind a COOKED YAML key (an explicit-key block
//   scalar `? |-` cooks to a real break in the key value):
//     (A) src/parser/frontmatter.ts:1058 `theta/load/params-type-not-expression`
//         (flow-sequence RHS shape carries no type),
//     (B) parseParams, recovered-text stage (src/parser/params.ts)  `theta/load/params-type-not-expression`
//         (recovered-text stage, scalar non-type RHS — a SECOND site sharing
//          the same code but reached through a distinct path),
//     (C) parseParams (src/parser/params.ts)  `theta/parse/non-trailing-default`,
//     (D) parseParams (src/parser/params.ts)  `theta/parse/default-without-literal`.
//   THREE inline-object rows bind the entry's RAW pre-colon source slice
//   (`trim()` only strips ends; a literal newline inside survives):
//     (E) src/parser/type-grammar.ts:1733 `theta/parse/inline-field-name-not-identifier`,
//     (F) src/parser/type-grammar.ts:1673 `theta/parse/quoted-inline-field-name`,
//     (G) src/parser/type-grammar.ts:1655 `theta/parse/duplicate-inline-field-name`.
// None routes its author text through `normaliseLiteralValueLineBreaks`
// (src/diagnostics/diagnostic.ts:168), unlike the eight sibling params/field
// messages in frontmatter.ts that already do. The category-5 `<param>`/`<field>`
// rendering rules these render through (placeholder-rendering-b.md:10) were
// drafted over identifier-shaped names and prescribe verbatim rendering with no
// break handling, so the spec's own prescribed rendering shares the omission —
// the 0105/0250/0300/0348 class at the `<param>`/`<field>` rows the `<value>`
// normalisation list never covered.
//
// THE FIX (seeded, NOT implemented here): route all seven interpolations
// through `normaliseLiteralValueLineBreaks`. That transform COLLAPSES (it does
// NOT JSON-escape): a string with no U+000A/U+000D is returned byte-identically;
// otherwise every maximal whitespace run containing at least one break collapses
// to a single U+0020, then leading/trailing U+0020 are trimmed
// (diagnostic.ts:168). The rationale is placeholder-rendering-b.md:75 (the bound
// text of author-controlled rows passes a line-break normalisation because
// `message` is a single-line summary and must not reproduce the serialised
// content format's `hint` / related-site / blank-line-block-separator shapes) —
// 0348 extended it to a `<field>` row on identical grounds. So `a<LF>b` -> `a b`
// and `x<LF>  hint: forged` -> `x hint: forged`. This is COLLAPSE, unlike
// sibling bug 0300's JSON.stringify escape under an `<observed>` carve-out that
// does not hold for the category-5 `<param>`/`<field>` rules — so these cells
// assert the COLLAPSED single-space form, never a JSON-escaped `\n`.
//
// TIER: unit. The defect lives entirely in seven pure string-mint seams (the
// `message:` template interpolations) reached by the offline, provider-free
// whole-document parse (`parseDoc` over `parseThetaDocument`); no session,
// model, or child process is involved, so neither the integration nor the live
// tier is needed to witness it. Harness and cell shape modelled on
// tests/b0348-unknown-frontmatter-field-key-single-line.test.ts.
//
// POST-0380 ROBUSTNESS: bug 0380 (not in this fork; lands on main at merge)
// closes the non-identifier params-key feeder with a CO-FIRING load refusal
// that renders ALONGSIDE these params messages — it does not suppress them.
// Every params cell below filters its target diagnostic BY CODE and tolerates
// co-firing collateral (the same discipline the live tree's diagnostics carry),
// so the witness survives the rebase. The three inline-object cells (E, F, G)
// are theta body source entirely outside 0380's reach.

const PARAMS_NOT_EXPR = "theta/load/params-type-not-expression";
const NON_TRAILING_DEFAULT = "theta/parse/non-trailing-default";
const DEFAULT_WITHOUT_LITERAL = "theta/parse/default-without-literal";
const INLINE_NOT_IDENT = "theta/parse/inline-field-name-not-identifier";
const QUOTED_INLINE = "theta/parse/quoted-inline-field-name";
const DUPLICATE_INLINE = "theta/parse/duplicate-inline-field-name";

// --- Fixtures ---------------------------------------------------------------
// A fixture is (frontmatter lines, body lines). The params-key carriers place
// the block-scalar key in the frontmatter `params:` block; the inline-object
// carriers place the `let v: { ... }` binding in the theta body. Each block
// scalar `? |-` cooks its content to a real U+000A in the key value.
interface Fixture {
  readonly fm: readonly string[];
  readonly body: readonly string[];
}

const TRIVIAL_BODY: readonly string[] = ["let x = 1"];

/** Site A — flow-seq RHS carries no type; cooked key `a<LF>b`. */
const FX_A: Fixture = { fm: ["params:", "  ? |-", "    a", "    b", "  : [1, 2]"], body: TRIVIAL_BODY };
/** Site A-hint — cooked key `x<LF>  hint: forged` forges the reserved `  hint:` continuation. */
const FX_A_HINT: Fixture = {
  fm: ["params:", "  ? |-", "    x", "      hint: forged", "  : [1, 2]"],
  body: TRIVIAL_BODY,
};
/** Site B — recovered-text stage in parseParams (params.ts); scalar non-type RHS; cooked key `a<LF>b`. */
const FX_B: Fixture = { fm: ["params:", "  ? |-", "    a", "    b", "  : zzz9 qq"], body: TRIVIAL_BODY };
/** Site C — a non-defaulted block-scalar key after a defaulted param; cooked key `a<LF>b`. */
const FX_C: Fixture = {
  fm: ["params:", '    first: string = "x"', "    ? |-", "      a", "      b", "    : string"],
  body: TRIVIAL_BODY,
};
/** Site D — empty default (`string =`) on a block-scalar key; cooked key `a<LF>b`. */
const FX_D: Fixture = { fm: ["params:", "  ? |-", "    a", "    b", "  : string ="], body: TRIVIAL_BODY };
/** Site E — inline object entry name split across a raw source break `a<LF>b`. */
const FX_E: Fixture = { fm: [], body: ["let v: { a", 'b: string } = { a: "z" }'] };
/** Site F — quoted inline object entry name split across a raw source break `"a<LF>b"`. */
const FX_F: Fixture = { fm: [], body: ['let v: { "a', 'b": string } = { }'] };
/** Site G — duplicate inline object entry name, each split across a raw source break `a<LF>b`. */
const FX_G: Fixture = { fm: [], body: ["let v: { a", "b: string, a", "b: integer } = { }"] };

/** Control — a break-free params key `p` with a flow-seq RHS. */
const FX_CTRL_PARAMS: Fixture = { fm: ["params:", "  p: [1, 2]"], body: TRIVIAL_BODY };
/** Control — a break-free inline entry name `a b` (a space, not a break). */
const FX_CTRL_INLINE: Fixture = { fm: [], body: ['let v: { a b: string } = { a: "z" }'] };
/** Control — a break-free duplicate inline entry name `a`. */
const FX_CTRL_DUP: Fixture = { fm: [], body: ["let v: { a: string, a: integer } = { }"] };

function build(fx: Fixture): string {
  return ["---", "mode: prompt", "model: sonnet", ...fx.fm, "---", ...fx.body, ""].join("\n");
}

/**
 * Parse a `.theta` doc from a fixture and return the document with the single
 * diagnostic carrying `code`. Co-firing collateral diagnostics (present at
 * every site — `unknown-identifier`, `bare-object-literal`,
 * `let-without-initialiser`, `literal-newline-in-string`) are tolerated: the
 * target is found BY CODE. Fails loudly (never silently skips) when no
 * diagnostic carries `code` — a missing target means the fixture no longer
 * reaches the mint under witness (e.g. an upstream pre-emption), which must
 * surface as a named failure naming the unmet precondition and the codes
 * actually present, not a green no-op.
 */
function parseTarget(
  code: string,
  fx: Fixture,
): { readonly doc: ThetaDocument; readonly diag: Diagnostic } {
  const doc = parseDoc(build(fx), "b0384.theta");
  const matches = doc.diagnostics.filter((x) => x.code === code);
  if (matches.length === 0) {
    throw new Error(
      `precondition unmet: no ${code} diagnostic for fixture ${JSON.stringify(
        fx,
      )}; the field-name mint under witness was not reached. Codes present: [${[
        ...new Set(doc.diagnostics.map((x) => x.code)),
      ].join(", ")}]`,
    );
  }
  return { doc, diag: matches[0] as Diagnostic };
}

/** The `message` of the single diagnostic carrying `code` for a fixture. */
function targetMessage(code: string, fx: Fixture): string {
  return parseTarget(code, fx).diag.message;
}

/**
 * The single-line contract (diagnostic-shape.md:34): a `message` carries no
 * physical break. A raw U+000A forges the serialised content format's
 * blank-line block separator and `  hint:` continuation; a raw U+000D forges
 * the `\r\n`-terminated related-site line. Both are the operator-deception
 * vectors bug 0105 documented. Modelled on the 0348 test's guard.
 */
function assertSingleLine(message: string, label: string): void {
  expect(
    message.includes("\n"),
    `${label}: message must contain NO raw U+000A — a raw LF splits the single-line summary and forges the serialised content format's blank-line / hint-continuation shapes (diagnostic-shape.md:34, placeholder-rendering-b.md:75)`,
  ).toBe(false);
  expect(
    message.includes("\r"),
    `${label}: message must contain NO raw U+000D — the single-line summary admits no carriage return (diagnostic-shape.md:34)`,
  ).toBe(false);
}

describe("bug 0384 — field-name diagnostics render single-line, collapsed", () => {
  // --- Break-carrying witnesses — RED today (raw break), GREEN post-fix ------

  // (A) frontmatter.ts:1058, flow-seq RHS. RED today: the cooked key `a<LF>b`
  // embeds a raw U+000A, so the message spans two physical lines — the named
  // symptom. GREEN post-fix: the break collapses to one U+0020, single line.
  it("A: params flow-seq RHS renders one physical line, collapsed to `a b`", () => {
    const m = targetMessage(PARAMS_NOT_EXPR, FX_A);
    assertSingleLine(m, "A (frontmatter.ts:1058 flow-seq RHS)");
    expect(
      m,
      "A: the collapsed message names the key with the break replaced by one U+0020 (normaliseLiteralValueLineBreaks, diagnostic.ts:168) — NOT a JSON-escaped `\\n`",
    ).toBe("'params:' field 'a b' right-hand side is not a theta type expression");
  });

  // (A-hint) a key crafted to forge the serialised content format's reserved
  // `  hint:` continuation. RED today: a physical line is exactly `  hint: forged`
  // (diagnostic-shape.md §Serialised content format), on a diagnostic with no
  // hint. GREEN post-fix: the break collapses so no physical line equals the
  // forged continuation, and the run `<LF>      ` collapses to one U+0020.
  it("A-hint: params flow-seq RHS with forged `  hint:` key yields no forged line, collapses to `x hint: forged`", () => {
    const m = targetMessage(PARAMS_NOT_EXPR, FX_A_HINT);
    expect(
      m.split("\n").includes("  hint: forged"),
      "A-hint: no physical line may equal `  hint: forged` — the serialised content format's reserved hint-continuation shape (diagnostic-shape.md §Serialised content format)",
    ).toBe(false);
    assertSingleLine(m, "A-hint (frontmatter.ts:1058 hint-forge)");
    expect(
      m,
      "A-hint: the interior single space between `hint:` and `forged` carries no break so it survives; the break-carrying run collapses to one U+0020 (diagnostic.ts:168)",
    ).toBe("'params:' field 'x hint: forged' right-hand side is not a theta type expression");
  });

  // (B) parseParams recovered-text stage — a SECOND site sharing the same
  // code, reached through the scalar non-type RHS path distinct from (A). RED
  // today: cooked key `a<LF>b` spans two physical lines. GREEN post-fix: `a b`.
  it("B: params recovered-text RHS renders one physical line, collapsed to `a b`", () => {
    const m = targetMessage(PARAMS_NOT_EXPR, FX_B);
    assertSingleLine(m, "B (parseParams recovered-text RHS)");
    expect(
      m,
      "B: the second params-type-not-expression site (parseParams, params.ts) collapses the cooked key break to one U+0020 (normaliseLiteralValueLineBreaks, diagnostic.ts)",
    ).toBe("'params:' field 'a b' right-hand side is not a theta type expression");
  });

  // (C) parseParams non-trailing-default. RED today: cooked key `a<LF>b`
  // spans two physical lines. GREEN post-fix: `a b`.
  it("C: non-trailing-default names the key one physical line, collapsed to `a b`", () => {
    const m = targetMessage(NON_TRAILING_DEFAULT, FX_C);
    assertSingleLine(m, "C (parseParams non-trailing-default)");
    expect(
      m,
      "C: the non-defaulted-param name collapses the cooked key break to one U+0020 (diagnostic.ts:168)",
    ).toBe("non-defaulted param 'a b' follows a defaulted param; defaulted params must be trailing");
  });

  // (D) parseParams default-without-literal. RED today: cooked key `a<LF>b`
  // spans two physical lines. GREEN post-fix: `a b`.
  it("D: default-without-literal names the key one physical line, collapsed to `a b`", () => {
    const m = targetMessage(DEFAULT_WITHOUT_LITERAL, FX_D);
    assertSingleLine(m, "D (parseParams default-without-literal)");
    expect(
      m,
      "D: the empty-default param name collapses the cooked key break to one U+0020 (diagnostic.ts:168)",
    ).toBe("params default for 'a b' is empty; '=' must be followed by a literal-sublanguage form");
  });

  // (E) type-grammar.ts:1733, inline-field-name-not-identifier. The raw pre-colon
  // source slice `a<LF>b` carries a literal newline (trim strips ends only). RED
  // today: two physical lines. GREEN post-fix: `a b`.
  it("E: inline non-identifier field name renders one physical line, collapsed to `a b`", () => {
    const m = targetMessage(INLINE_NOT_IDENT, FX_E);
    assertSingleLine(m, "E (type-grammar.ts:1733 inline non-identifier)");
    expect(
      m,
      "E: the raw source slice's interior newline collapses to one U+0020 (diagnostic.ts:168)",
    ).toBe("field name 'a b' within one inline object type is not an identifier");
  });

  // (F) type-grammar.ts:1673, quoted-inline-field-name. The raw slice is `"a<LF>b"`
  // — the surrounding double quotes are PART of the raw slice and survive; only
  // the interior break collapses. Co-firing let-without-initialiser +
  // literal-newline-in-string diagnostics land in the same batch — tolerated,
  // filtered by code. RED today: two physical lines. GREEN post-fix: `"a b"`.
  it("F: quoted inline field name renders one physical line, collapsed to `\"a b\"` (quotes survive)", () => {
    const m = targetMessage(QUOTED_INLINE, FX_F);
    assertSingleLine(m, "F (type-grammar.ts:1673 quoted inline)");
    expect(
      m,
      "F: the interior break collapses to one U+0020; the surrounding double quotes are part of the raw slice and survive (diagnostic.ts:168)",
    ).toBe('quoted field name \'"a b"\' within one inline object type; field names are identifiers');
  });

  // (G) type-grammar.ts:1655, duplicate-inline-field-name. RED today: cooked
  // slice `a<LF>b` spans two physical lines. GREEN post-fix: `a b`.
  it("G: duplicate inline field name renders one physical line, collapsed to `a b`", () => {
    const m = targetMessage(DUPLICATE_INLINE, FX_G);
    assertSingleLine(m, "G (type-grammar.ts:1655 duplicate inline)");
    expect(
      m,
      "G: the duplicate name's raw source break collapses to one U+0020 (diagnostic.ts:168)",
    ).toBe("duplicate field name 'a b' within one inline object type");
  });

  // --- CONTROLS — green at fork AND post-fix (no-regression locks) ----------
  // A break-free name is returned byte-identically by the transform
  // (diagnostic.ts:168, "text containing neither U+000D nor U+000A is returned
  // unchanged"), so the fix must not perturb these.

  it("CTRL-params: break-free key `p` renders byte-identical one line", () => {
    const m = targetMessage(PARAMS_NOT_EXPR, FX_CTRL_PARAMS);
    assertSingleLine(m, "CTRL-params (break-free params key)");
    expect(
      m,
      "CTRL-params: a break-free params key is returned byte-identically by normaliseLiteralValueLineBreaks (diagnostic.ts:168)",
    ).toBe("'params:' field 'p' right-hand side is not a theta type expression");
  });

  it("CTRL-inline: break-free inline name `a b` (space) renders byte-identical one line", () => {
    const m = targetMessage(INLINE_NOT_IDENT, FX_CTRL_INLINE);
    assertSingleLine(m, "CTRL-inline (break-free inline name)");
    expect(
      m,
      "CTRL-inline: a break-free slice `a b` (a space, not a break) is returned byte-identically (diagnostic.ts:168)",
    ).toBe("field name 'a b' within one inline object type is not an identifier");
  });

  it("CTRL-dup: break-free duplicate name `a` renders byte-identical one line", () => {
    const m = targetMessage(DUPLICATE_INLINE, FX_CTRL_DUP);
    assertSingleLine(m, "CTRL-dup (break-free duplicate name)");
    expect(
      m,
      "CTRL-dup: a break-free duplicate name is returned byte-identically (diagnostic.ts:168)",
    ).toBe("duplicate field name 'a' within one inline object type");
  });

  // --- SEMANTICS — green at fork AND post-fix (refusal invariant) -----------
  // A message-shape fix must not change severity or code. The crafted-key rows
  // stay error-severity refusals under their own code. One params row and one
  // inline-object row.

  it("SEM-params: the crafted params key stays an error-severity refusal under its code", () => {
    const { diag } = parseTarget(PARAMS_NOT_EXPR, FX_A);
    expect(
      diag.severity,
      "SEM-params: params-type-not-expression is a refusal (error); the message-shape fix must not change severity",
    ).toBe("error");
    expect(
      diag.code,
      "SEM-params: the message-shape fix must not change the diagnostic code",
    ).toBe(PARAMS_NOT_EXPR);
  });

  it("SEM-inline: the crafted inline field name stays an error-severity refusal under its code", () => {
    const { diag } = parseTarget(INLINE_NOT_IDENT, FX_E);
    expect(
      diag.severity,
      "SEM-inline: inline-field-name-not-identifier is a refusal (error); the message-shape fix must not change severity",
    ).toBe("error");
    expect(
      diag.code,
      "SEM-inline: the message-shape fix must not change the diagnostic code",
    ).toBe(INLINE_NOT_IDENT);
  });

  // --- SWEEP — single-line contract across every break-carrying witness ------
  // diagnostic-shape.md:34 applied to A, A-hint, B, C, D, E, F, G at once. RED
  // today (all eight embed a raw break); GREEN post-fix (all collapsed to one
  // physical line).
  it("SWEEP: every break-carrying witness message is a single physical line", () => {
    const messages: ReadonlyArray<readonly [string, string]> = [
      ["A", targetMessage(PARAMS_NOT_EXPR, FX_A)],
      ["A-hint", targetMessage(PARAMS_NOT_EXPR, FX_A_HINT)],
      ["B", targetMessage(PARAMS_NOT_EXPR, FX_B)],
      ["C", targetMessage(NON_TRAILING_DEFAULT, FX_C)],
      ["D", targetMessage(DEFAULT_WITHOUT_LITERAL, FX_D)],
      ["E", targetMessage(INLINE_NOT_IDENT, FX_E)],
      ["F", targetMessage(QUOTED_INLINE, FX_F)],
      ["G", targetMessage(DUPLICATE_INLINE, FX_G)],
    ];
    for (const [label, m] of messages) {
      assertSingleLine(m, `SWEEP — cell ${label}`);
    }
  });
});
