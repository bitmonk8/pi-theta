import { describe, expect, it } from "vitest";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0300 — `theta/load/frontmatter-value-out-of-range` interpolates a
// string-valued `<observed>` with no line-break transform, so an author-chosen
// break-carrying value renders a `message` of two or more physical lines.
//
// WHY this red before the fix (0.334.0): `renderObserved`'s string arm
// previously returned `isIdentifierShaped(value) ? value : `"${value}"`` — a
// break-carrying string like `a<U+000A>b` is not identifier-shaped, so the
// value was wrapped in double quotes VERBATIM, embedding the RAW U+000A. The
// emission at src/parser/frontmatter.ts:762 (`… must be a non-negative integer; got
// ${renderObserved(raw)}`) is the only diagnostic message in the file that
// interpolates author text without a line-break normalisation, so the stored
// `message` spans multiple physical lines and forges the serialised content
// format's reserved shapes (the `  hint:` continuation, the blank-line block
// separator). This violates diagnostic-shape.md:34 ("single-line summary") and
// the rationale at placeholder-rendering-b.md:75 (every `theta/load/*` row's
// bound text "passes a line-break normalisation, because `message` is a
// single-line summary … and must not reproduce the serialised content format's
// `hint` / … / blank-line-block-separator shapes").
//
// WHY the settings twin is already immune: src/discovery/settings.ts:132-135
// renders its string arm through `JSON.stringify(value)`, which escapes U+000A
// to the two-character `\n` — single-line-safe. Bug 0300 §Fix (0.334.0) routes
// the frontmatter string arm through the same `JSON.stringify` (now at
// src/parser/frontmatter.ts:640) so the two renderers converge byte-identically.
// The `"25"` worked example and every string carrying no JSON-escaped character
// stay byte-identical either way (cells E/G below pin that stability).
//
// TIER: unit. The defect lives entirely in a pure string-rendering seam
// (`renderObserved`) reached by the offline, provider-free whole-document parse
// (`parseDoc` over `parseThetaDocument`); no session, model, or child process is
// involved, so neither the integration nor the live tier is needed to witness
// it. Cells modelled on tests/frontmatter-tool-loop-respond-repair.test.ts.
//
// Each row is one `.theta` doc (`---` fences, body `let x = 1`). The `mode:`
// field is intentionally omitted — the parse still fires the out-of-range load
// error, and the co-emitted `theta/load/missing-mode` is filtered out by
// `oorMessage`, which keys strictly on the code under test.

const OOR = "theta/load/frontmatter-value-out-of-range";

/**
 * The `theta/load/frontmatter-value-out-of-range` message emitted for a doc
 * built from the given extra frontmatter lines. Fails loudly (never silently
 * skips) when the seam is not reached — a missing OOR diagnostic means the
 * fixture no longer drives `renderObserved`, which must surface as a named
 * failure, not a green no-op.
 */
function oorMessage(...frontmatterLines: string[]): string {
  const src = ["---", ...frontmatterLines, "---", "let x = 1", ""].join("\n");
  const doc = parseDoc(src, "b0300.theta");
  const d = doc.diagnostics.find((x) => x.code === OOR);
  if (d === undefined) {
    throw new Error(
      `precondition unmet: no ${OOR} diagnostic for frontmatter ${JSON.stringify(
        frontmatterLines,
      )}; the out-of-range seam (renderObserved) was not reached. Codes present: [${doc.diagnostics
        .map((x) => x.code)
        .join(", ")}]`,
    );
  }
  return d.message;
}

/**
 * The single-line contract (diagnostic-shape.md:34): a `message` carries no
 * physical break. A raw U+000A forges the serialised content format's
 * blank-line block separator and `  hint:` continuation; a raw U+000D forges
 * the `\r\n`-terminated related-site line. Both are the operator-deception
 * vectors bug 0105 documented.
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

describe("bug 0300 — out-of-range `<observed>` string renders single-line, escaped", () => {
  // (A) double-quoted YAML `\n` escape → the parsed value carries a real
  // U+000A. RED today: the message embeds the raw break and does NOT contain
  // the JSON-escaped two-character `\n`. GREEN after the fix: JSON.stringify
  // renders the value as the single-line `"a\nb"`.
  it("A: `max_rounds: \"a\\nb\"` renders one physical line with the break JSON-escaped", () => {
    const m = oorMessage("tool_loop:", '  max_rounds: "a\\nb"');
    assertSingleLine(m, "A (tool_loop.max_rounds `\"a\\nb\"`)");
    expect(
      m.includes('"a\\nb"'),
      "A: message must contain the JSON-escaped two-char sequence `\\n` (the break rendered as backslash-n, not a raw U+000A) — the settings twin's rendering (settings.ts:132-135)",
    ).toBe(true);
  });

  // (B) block literal scalar → the parsed value carries U+000A line breaks
  // (and the clip-retained trailing break). RED today: raw breaks embed.
  // GREEN after the fix: JSON.stringify renders `"a\nb\n"` on one line.
  it("B: a `max_rounds: |` block scalar renders one physical line, escaped", () => {
    const m = oorMessage("tool_loop:", "  max_rounds: |", "    a", "    b");
    assertSingleLine(m, "B (tool_loop.max_rounds block scalar)");
    expect(
      m.includes('"a\\nb\\n"'),
      "B: block-scalar breaks must render JSON-escaped as `\\n` on one line, not as raw U+000A (settings.ts:132-135 convergence target)",
    ).toBe(true);
  });

  // (C) a value crafted to forge the serialised content format's `  hint:`
  // continuation shape. RED today: the middle physical line is exactly
  // `  hint: evil`. GREEN after the fix: single line, so no physical line
  // equals the forged continuation.
  it("C: `attempts: \"x\\n  hint: evil\\ny\"` yields no physical `  hint: evil` line", () => {
    const m = oorMessage("respond_repair:", '  attempts: "x\\n  hint: evil\\ny"');
    // Named symptom first so the red reason is the forged shape, not the generic guard.
    expect(
      m.split("\n").includes("  hint: evil"),
      "C: no physical line may equal `  hint: evil` — the serialised content format's reserved hint-continuation shape (diagnostic-shape.md §Serialised content format)",
    ).toBe(false);
    assertSingleLine(m, "C (respond_repair.attempts hint-forge)");
  });

  // (D) a value crafted to forge the batch-block blank-line separator. RED
  // today: split on U+000A yields an empty element. GREEN after the fix:
  // single line, so no empty element.
  it("D: `max_rounds: \"a\\n\\nb\"` yields no blank physical line", () => {
    const m = oorMessage("tool_loop:", '  max_rounds: "a\\n\\nb"');
    // Named symptom first so the red reason is the forged separator, not the generic guard.
    expect(
      m.split("\n").includes(""),
      "D: message must contain no blank physical line — the empty line is the serialised content format's batch-block separator (diagnostic-shape.md §Serialised content format)",
    ).toBe(false);
    assertSingleLine(m, "D (tool_loop.max_rounds blank-line-forge)");
  });

  // (E) control: a stringly-typed `"25"` (the registry's own worked example,
  // placeholder-rendering-b.md:98). GREEN today AND after the fix —
  // `"25"` is break-free, so both the current `` `"${value}"` `` arm and the
  // fix's `JSON.stringify("25")` produce the byte-identical `"25"`.
  it("E: control — `max_rounds: \"25\"` renders byte-identical `got \"25\"`", () => {
    const m = oorMessage("tool_loop:", '  max_rounds: "25"');
    assertSingleLine(m, "E (control stringly-typed `\"25\"`)");
    expect(
      m.endsWith('got "25"'),
      "E: a break-free stringly-typed value renders `got \"25\"` byte-identically (stable across the fix — JSON.stringify(\"25\") === '\"25\"')",
    ).toBe(true);
  });

  // (F) control: the numeric arm (`renderObserved` `String(-1)`), untouched by
  // the string-arm fix. GREEN today and after.
  it("F: control — `max_rounds: -1` renders byte-identical `got -1`", () => {
    const m = oorMessage("tool_loop:", "  max_rounds: -1");
    assertSingleLine(m, "F (control numeric `-1`)");
    expect(
      m.endsWith("got -1"),
      "F: the numeric out-of-range arm renders `got -1` bare and is not touched by the string-arm fix",
    ).toBe(true);
  });

  // (CR) totality witness: a U+000D (CR) carrier. WHY: JSON.stringify escapes
  // CR as `\r`, not only LF — without this cell the fix could silently regress
  // to an LF-only escaper and stay green across A–F. GREEN post-fix
  // (JSON.stringify("a\rb") === '"a\rb"'). Deliberately outside the H sweep
  // (which pins A–F); it carries no oorMessage row there.
  it("CR: `max_rounds: \"a\\rb\"` renders one physical line with the CR JSON-escaped", () => {
    const m = oorMessage("tool_loop:", '  max_rounds: "a\\rb"');
    assertSingleLine(m, "CR (tool_loop.max_rounds `\"a\\rb\"`)");
    expect(
      m.includes('"a\\rb"'),
      "CR: message must contain the JSON-escaped two-char sequence `\\r` (the carriage return rendered as backslash-r, not a raw U+000D) — proves JSON.stringify's totality over CR, not only LF (settings.ts:132-135)",
    ).toBe(true);
  });

  // (G) settings-twin convergence, asserted structurally. Driving
  // src/discovery/settings.ts's loader offline requires a `FileSystem` mock and
  // its `renderObserved` is not exported, so wiring it here is disproportionate;
  // instead this pins the convergence TARGET the frontmatter fix must adopt.
  // settings.ts:132-135 renders a non-identifier string via `JSON.stringify`,
  // which escapes every break to the two-character `\n` and stays one physical
  // line. GREEN today (pure JS) — it is the byte-identical shape cells A/B
  // demand of the frontmatter renderer post-fix.
  it("G: settings-twin convergence target — JSON.stringify escapes breaks single-line", () => {
    const escaped = JSON.stringify("a\nb"); // the settings.ts:132-135 rendering
    assertSingleLine(escaped, "G (settings twin JSON.stringify)");
    expect(
      escaped,
      "G: JSON.stringify must render a break-carrying string as the single-line escaped `\"a\\nb\"` — the byte-identical convergence target for frontmatter.ts:640 (settings.ts:132-135)",
    ).toBe('"a\\nb"');
  });

  // (H) single-line sweep across A–F: the diagnostic-shape.md:34 contract
  // applied to every witness message at once. RED today (A–D carry raw U+000A);
  // GREEN after the fix (all six single-line).
  it("H: sweep — every witness message across A–F is a single physical line", () => {
    const messages: [string, string][] = [
      ["A", oorMessage("tool_loop:", '  max_rounds: "a\\nb"')],
      ["B", oorMessage("tool_loop:", "  max_rounds: |", "    a", "    b")],
      ["C", oorMessage("respond_repair:", '  attempts: "x\\n  hint: evil\\ny"')],
      ["D", oorMessage("tool_loop:", '  max_rounds: "a\\n\\nb"')],
      ["E", oorMessage("tool_loop:", '  max_rounds: "25"')],
      ["F", oorMessage("tool_loop:", "  max_rounds: -1")],
    ];
    for (const [label, m] of messages) {
      assertSingleLine(m, `H sweep — cell ${label}`);
    }
  });
});
