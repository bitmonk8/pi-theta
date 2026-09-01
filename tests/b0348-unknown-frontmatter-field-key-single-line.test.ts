import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0348 — `theta/load/unknown-frontmatter-field` interpolates an
// author-chosen YAML key into its message with NO line-break transform, so a
// double-quoted key carrying a `\n` escape (`"a\nb": 1`) cooks to a
// break-bearing string that embeds a RAW newline into the single-line
// diagnostic `message`, breaking diagnostic-shape.md:34's single-line-summary
// invariant and forging the serialised content format's reserved `  hint:`
// continuation / related-site / blank-line shapes. Two carriers:
//   (1) the top-level key at src/parser/frontmatter.ts:1406 —
//       `` message: `unknown frontmatter field '${key}'` `` where
//       `key = String(item.key.value)` is the cooked YAML key scalar.
//   (2) the dotted nested-sub-key at src/parser/frontmatter.ts:717 inside
//       `unknownSubKeyDiagnostics` (bug 0301 face (c)) —
//       `` message: `unknown frontmatter field '${dottedPrefix}.${sub}'` ``
//       where `sub = String(it.key.value)` is the cooked sub-key scalar.
// Neither routes its author text through `normaliseLiteralValueLineBreaks`
// (src/diagnostics/diagnostic.ts:168), unlike every sibling author-text message
// in the file (`mode:`, `model:`, `bind_context:`, `bind_echo:`,
// `respond_repair.methodology`, `malformed-frontmatter-yaml`). The `<field>`
// category-5 rendering rule these render through (placeholder-rendering-b.md:10)
// prescribes verbatim rendering and states no break handling, so the spec's own
// prescribed rendering shares the omission.
//
// THE FIX (seeded, NOT implemented here): route both interpolations through
// `normaliseLiteralValueLineBreaks`. That transform COLLAPSES (it does NOT
// JSON-escape): a string with no U+000A/U+000D is returned byte-identically;
// otherwise every maximal whitespace run containing at least one break
// collapses to a single U+0020, then leading/trailing U+0020 are trimmed
// (diagnostic.ts:168). The normalisation rationale is placeholder-rendering-b.md:75
// ("the bound text of every `theta/load/*` row … passes a line-break
// normalisation, because `message` is a single-line summary … and must not
// reproduce the serialised content format's `hint` / related-site /
// blank-line-block-separator shapes"), a reason that applies to every
// author-controlled `theta/load/*` message including this `<field>` row. So
// `a<LF>b` -> `a b`, `a<CR>b` -> `a b`, `a<CR><LF>b` -> `a b`, `a<LF><LF>b` ->
// `a b`, `a<LF>  hint: evil<LF>b` -> `a hint: evil b`. This is COLLAPSE, unlike
// sibling bug 0300 which chose JSON.stringify (escape) under an `<observed>`
// carve-out that does not hold for the category-5 `<field>` / `<key>` rules —
// so these cells assert the COLLAPSED single-space form, never a JSON-escaped
// `\n`.
//
// TIER: unit. The defect lives entirely in a pure string-mint seam (the two
// `message:` template interpolations) reached by the offline, provider-free
// whole-document parse (`parseDoc` over `parseThetaDocument`); no session,
// model, or child process is involved, so neither the integration nor the live
// tier is needed to witness it. Harness and cell shape modelled on
// tests/b0300-out-of-range-observed-string-single-line.test.ts; `mode: subagent`
// registers cleanly in parseDoc, per tests/b0301-*.test.ts.

const UFF = "theta/load/unknown-frontmatter-field";

// --- Break-carrying witness fixtures (extra frontmatter lines) --------------
// Each `\\n` / `\\r` here is a two-character YAML escape in the emitted `.theta`
// source (a double-quoted key scalar), which the YAML parser cooks to a real
// U+000A / U+000D in the key value that then flows into the message template.

/** Top-level key `a<LF>b`. Site frontmatter.ts:1406. Collapses to `a b`. */
const A_KEY = ['"a\\nb": 1'];
/** Top-level key `a<LF>  hint: evil<LF>b` — forges the reserved `  hint:` continuation. */
const A_HINT = ['"a\\n  hint: evil\\nb": 1'];
/** Top-level key `a<LF><LF>b` — forges the batch-block blank-line separator. */
const A_BLANK = ['"a\\n\\nb": 1'];
/** Top-level key `a<CR>b` — a bare U+000D, proving the transform's totality over CR. */
const CR_KEY = ['"a\\rb": 1'];
/** Top-level key `a<CR><LF>b` — a CRLF pair. */
const CRLF_KEY = ['"a\\r\\nb": 1'];
/** Dotted sub-key `tool_loop.a<LF>b`. Site frontmatter.ts:717. Collapses to `tool_loop.a b`. */
const B_KEY = ["tool_loop:", '  "a\\nb": 1'];
/** Dotted sub-key `tool_loop.x<LF>  hint: evil` — forges the `  hint:` continuation. */
const B_HINT = ["tool_loop:", '  "x\\n  hint: evil": 1'];

/**
 * Parse a `.theta` doc built from the given extra frontmatter lines and return
 * both the document and its single `theta/load/unknown-frontmatter-field`
 * diagnostic. Fails loudly (never silently skips) when the seam is not reached —
 * a missing UFF diagnostic means the fixture no longer mints an
 * unknown-frontmatter-field message (e.g. an upstream YAML-parse pre-emption),
 * which must surface as a named failure naming the unmet precondition and the
 * codes actually present, not a green no-op.
 */
function parseUf(...frontmatterLines: string[]): {
  readonly doc: ThetaDocument;
  readonly diag: Diagnostic;
} {
  const src = ["---", "mode: subagent", ...frontmatterLines, "---", "let x = 1", ""].join("\n");
  const doc = parseDoc(src, "b0348.theta");
  const matches = doc.diagnostics.filter((x) => x.code === UFF);
  if (matches.length === 0) {
    throw new Error(
      `precondition unmet: no ${UFF} diagnostic for frontmatter ${JSON.stringify(
        frontmatterLines,
      )}; the unknown-frontmatter-field mint (frontmatter.ts:1406/:717) was not reached. Codes present: [${[
        ...new Set(doc.diagnostics.map((x) => x.code)),
      ].join(", ")}]`,
    );
  }
  return { doc, diag: matches[0] as Diagnostic };
}

/**
 * The `message` of the single `theta/load/unknown-frontmatter-field` diagnostic
 * for a doc built from the given extra frontmatter lines.
 */
function ufMessage(...frontmatterLines: string[]): string {
  return parseUf(...frontmatterLines).diag.message;
}

/**
 * The single-line contract (diagnostic-shape.md:34): a `message` carries no
 * physical break. A raw U+000A forges the serialised content format's
 * blank-line block separator and `  hint:` continuation; a raw U+000D forges
 * the `\r\n`-terminated related-site line. Both are the operator-deception
 * vectors bug 0105 documented. Modelled on the 0300 test's guard.
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

describe("bug 0348 — unknown-frontmatter-field key renders single-line, collapsed", () => {
  // (A) top-level carrier (frontmatter.ts:1406). RED today: the cooked key
  // `a<LF>b` embeds a raw U+000A, so the message spans two physical lines — the
  // named symptom. GREEN post-fix: `normaliseLiteralValueLineBreaks` COLLAPSES
  // the break to one U+0020 (diagnostic.ts:168), single line. WHY COLLAPSE not
  // escape: the category-5 `<field>` rule renders verbatim, no JSON-escape
  // carve-out (placeholder-rendering-b.md:10).
  it("A: top-level `\"a\\nb\": 1` renders one physical line, collapsed to `a b`", () => {
    const m = ufMessage(...A_KEY);
    // Named symptom (the raw break) first.
    assertSingleLine(m, "A (top-level `\"a\\nb\"`)");
    expect(
      m,
      "A: the collapsed message names the key with the break replaced by one U+0020 (normaliseLiteralValueLineBreaks, diagnostic.ts:168) — NOT a JSON-escaped `\\n`",
    ).toBe("unknown frontmatter field 'a b'");
  });

  // (A-hint) a key crafted to forge the serialised content format's reserved
  // `  hint:` continuation. RED today: a physical line is exactly `  hint: evil`
  // (diagnostic-shape.md §Serialised content format). GREEN post-fix: the break
  // collapses, so no physical line equals the forged continuation and the run
  // `<LF>  hint: evil<LF>` collapses to ` hint: evil ` yielding `a hint: evil b`.
  it("A-hint: top-level `\"a\\n  hint: evil\\nb\": 1` yields no forged `  hint:` line, collapses to `a hint: evil b`", () => {
    const m = ufMessage(...A_HINT);
    // Named symptom (the forged continuation line) first.
    expect(
      m.split("\n").includes("  hint: evil"),
      "A-hint: no physical line may equal `  hint: evil` — the serialised content format's reserved hint-continuation shape (diagnostic-shape.md §Serialised content format)",
    ).toBe(false);
    assertSingleLine(m, "A-hint (top-level hint-forge)");
    expect(
      m,
      "A-hint: the interior single space between `hint:` and `evil` carries no break so it survives; the two breaks collapse to single spaces (diagnostic.ts:168)",
    ).toBe("unknown frontmatter field 'a hint: evil b'");
  });

  // (A-blank) a key crafted to forge the batch-block blank-line separator. RED
  // today: split on U+000A yields an empty element. GREEN post-fix: the maximal
  // whitespace run `<LF><LF>` collapses to a single U+0020, so `a<LF><LF>b`
  // becomes `a b` with no blank physical line.
  it("A-blank: top-level `\"a\\n\\nb\": 1` yields no blank physical line, collapses to `a b`", () => {
    const m = ufMessage(...A_BLANK);
    // Named symptom (the forged blank-line separator) first.
    expect(
      m.split("\n").includes(""),
      "A-blank: message must contain no blank physical line — the empty line is the serialised content format's batch-block separator (diagnostic-shape.md §Serialised content format)",
    ).toBe(false);
    assertSingleLine(m, "A-blank (top-level blank-line-forge)");
    expect(
      m,
      "A-blank: a maximal whitespace run carrying a break collapses to ONE U+0020, so a double break becomes a single space (diagnostic.ts:168)",
    ).toBe("unknown frontmatter field 'a b'");
  });

  // (CR) a bare U+000D carrier. WHY: the transform collapses CR as well as LF —
  // without this cell the fix could silently regress to an LF-only collapser and
  // stay green across the LF cells. RED today: the message embeds a raw U+000D.
  // GREEN post-fix: `a<CR>b` collapses to `a b` (diagnostic.ts:168 treats U+000D
  // and U+000A identically). Proves totality over CR, not only LF.
  it("CR: top-level `\"a\\rb\": 1` renders one physical line, collapsed to `a b`", () => {
    const m = ufMessage(...CR_KEY);
    assertSingleLine(m, "CR (top-level `\"a\\rb\"`)");
    expect(
      m,
      "CR: a bare carriage return collapses to one U+0020 exactly as LF does (diagnostic.ts:168) — proves the transform's totality over U+000D",
    ).toBe("unknown frontmatter field 'a b'");
  });

  // (CRLF) a `\r\n` pair carrier. RED today: the message embeds a raw CRLF.
  // GREEN post-fix: the whole run `<CR><LF>` is one maximal whitespace run with
  // a break, collapsing to a single U+0020, so `a<CR><LF>b` becomes `a b`.
  it("CRLF: top-level `\"a\\r\\nb\": 1` renders one physical line, collapsed to `a b`", () => {
    const m = ufMessage(...CRLF_KEY);
    assertSingleLine(m, "CRLF (top-level `\"a\\r\\nb\"`)");
    expect(
      m,
      "CRLF: the CR+LF pair is one maximal whitespace run carrying a break and collapses to ONE U+0020 (diagnostic.ts:168)",
    ).toBe("unknown frontmatter field 'a b'");
  });

  // (B) dotted carrier (frontmatter.ts:717, unknownSubKeyDiagnostics — bug 0301
  // face (c)). RED today: the cooked sub-key `a<LF>b` embeds a raw U+000A, so
  // `unknown frontmatter field 'tool_loop.a<LF>b'` spans two physical lines.
  // GREEN post-fix: the fix normalises `sub` (the prefix `tool_loop` is a fixed
  // literal), collapsing to `tool_loop.a b`.
  it("B: dotted `tool_loop:` over `  \"a\\nb\": 1` renders one physical line, collapsed to `tool_loop.a b`", () => {
    const m = ufMessage(...B_KEY);
    // Named symptom (the raw break) first.
    assertSingleLine(m, "B (dotted `tool_loop.a<LF>b`)");
    expect(
      m,
      "B: only the sub-key is normalised (diagnostic.ts:168); the dotted prefix is the fixed literal `tool_loop.`",
    ).toBe("unknown frontmatter field 'tool_loop.a b'");
  });

  // (B-hint) dotted sub-key crafted to forge the `  hint:` continuation. The
  // hint sits at the END of the key, so the forged physical line carries the
  // message template's trailing quote (`  hint: evil'`) rather than a standalone
  // `  hint: evil` line — the exact-line guard below is therefore a regression
  // lock (true both directions), and the RED witness for this cell is
  // assertSingleLine (raw break) plus the collapsed-message equality. RED today:
  // `tool_loop.x<LF>  hint: evil` spans two physical lines. GREEN post-fix:
  // the sub-key `x<LF>  hint: evil` collapses to `x hint: evil`.
  it("B-hint: dotted `tool_loop:` over `  \"x\\n  hint: evil\": 1` renders single-line, collapses to `tool_loop.x hint: evil`", () => {
    const m = ufMessage(...B_HINT);
    // Named symptom first — no standalone forged `  hint: evil` continuation line.
    expect(
      m.split("\n").includes("  hint: evil"),
      "B-hint: no physical line may equal `  hint: evil` — the serialised content format's reserved hint-continuation shape (diagnostic-shape.md §Serialised content format); a regression lock here (the dotted end-of-key placement appends the template's closing quote to that line)",
    ).toBe(false);
    assertSingleLine(m, "B-hint (dotted hint-forge)");
    expect(
      m,
      "B-hint: the sub-key `x<LF>  hint: evil` collapses to `x hint: evil` (interior single space survives; break collapses) (diagnostic.ts:168)",
    ).toBe("unknown frontmatter field 'tool_loop.x hint: evil'");
  });

  // --- CONTROLS — green at fork AND post-fix (no-regression locks) ----------
  // A break-free key is returned byte-identically by the transform
  // (diagnostic.ts:168, "text containing neither U+000D nor U+000A is returned
  // unchanged"), so the fix must not perturb these.

  // (C-top) the bug doc's own control: an unquoted `bogus_field` renders
  // byte-identically at the top-level site (frontmatter.ts:1406).
  it("C-top: control — `bogus_field: 1` renders byte-identical `'bogus_field'`", () => {
    const m = ufMessage("bogus_field: 1");
    assertSingleLine(m, "C-top (control break-free top-level key)");
    expect(
      m,
      "C-top: a break-free key is returned byte-identically by normaliseLiteralValueLineBreaks (diagnostic.ts:168)",
    ).toBe("unknown frontmatter field 'bogus_field'");
  });

  // (C-dotted) the existing bug 0301 face (c) cell shape: a typo'd sub-key
  // renders byte-identically at the dotted site (frontmatter.ts:717).
  it("C-dotted: control — `tool_loop:` over `  max_round: 5` renders byte-identical `'tool_loop.max_round'`", () => {
    const m = ufMessage("tool_loop:", "  max_round: 5");
    assertSingleLine(m, "C-dotted (control break-free sub-key)");
    expect(
      m,
      "C-dotted: a break-free sub-key is returned byte-identically; the dotted form (bug 0301 face (c)) is unaffected by the message-shape fix (diagnostic.ts:168)",
    ).toBe("unknown frontmatter field 'tool_loop.max_round'");
  });

  // --- SEMANTICS — green at fork AND post-fix (registration invariant) ------

  // (D) a message-shape fix leaves the warning a warning and the theta
  // registered. The forward-compat unknown-key row is tolerated: it is a
  // `warning`, not an `error`, and `doc.frontmatter` is non-null (the theta
  // still registers). Asserted on the crafted-key cell A doc so the fix cannot
  // silently promote the row to an error or deny registration while reshaping
  // the message.
  it("D: the crafted-key row stays a tolerated warning and the theta stays registered", () => {
    const { doc, diag } = parseUf(...A_KEY);
    expect(
      diag.severity,
      "D: unknown-frontmatter-field is a forward-compat WARNING, not an error — the message-shape fix must not change severity",
    ).toBe("warning");
    expect(
      doc.frontmatter,
      "D: a tolerated warning leaves the theta registered (doc.frontmatter non-null); the fix reshapes the message only",
    ).not.toBeNull();
  });

  // (H) single-line sweep across every break-carrying witness at once — the
  // diagnostic-shape.md:34 contract applied to A, A-hint, A-blank, CR, CRLF, B,
  // B-hint together. RED today (all seven embed a raw break); GREEN post-fix
  // (all seven collapsed to a single physical line).
  it("H: sweep — every break-carrying witness message is a single physical line", () => {
    const messages: ReadonlyArray<readonly [string, string]> = [
      ["A", ufMessage(...A_KEY)],
      ["A-hint", ufMessage(...A_HINT)],
      ["A-blank", ufMessage(...A_BLANK)],
      ["CR", ufMessage(...CR_KEY)],
      ["CRLF", ufMessage(...CRLF_KEY)],
      ["B", ufMessage(...B_KEY)],
      ["B-hint", ufMessage(...B_HINT)],
    ];
    for (const [label, m] of messages) {
      assertSingleLine(m, `H sweep — cell ${label}`);
    }
  });
});
