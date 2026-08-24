import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { codes, lexSrc, parseDoc } from "./helpers/e2e-s1";

// b0266 — conformance oracle over the rationale carried by the "Category 6
// line-separator scope" edge-case bullet in
// docs/spec_topics/diagnostics/placeholder-rendering-b.md.
//
// THE DEFECT (docs/bugs/0266-placeholder-rendering-b-string-literal-parenthetical-false.md).
// The bullet stated the correct rule — U+2028 and U+2029 are ordinary
// characters; implementations MUST NOT split on them, MUST NOT strip them, MUST
// NOT promote them into `\n` — and then justified it with the parenthetical
// "even though authors cannot introduce them through a regular string literal".
// That premise is false: the shipped lexer admits both code points inside a
// regular string literal, as a `\u{XXXX}` escape and pasted raw, with zero
// diagnostics. The fix corrects the rationale only; the rule sentence and the
// six-ASCII closure of rule 1 (bug 0091's disposition 2) are untouched.
//
// WHAT THIS FILE ASSERTS. Two cells, in the pattern of
// tests/b0091-rule1-ascii-terminator-closure-gate.test.ts — one prose cell over
// the committed page, one behavioural cell that keeps the prose claim
// non-vacuous by exercising the shipped front end:
//
//   1  the bullet's rationale states that authors CAN introduce these code
//      points through a regular string literal and that the surfaces render
//      them as ordinary characters, and the negative guard: the phrase
//      "cannot introduce" no longer appears in the bullet.
//   2  the lexer admission the corrected rationale rests on: a regular string
//      literal carrying both code points — escape form and raw form — lexes and
//      parses with no diagnostic at all, and the decoded string token carries
//      the code-point sequence 78,2028,79,2029,7a.
//
// The prose cell matches load-bearing tokens with a proximity window rather
// than a verbatim sentence, so the wording stays the editor's; only the content
// is gated. It reds at the pre-fix bytes on both arms (the positive tokens are
// absent and the forbidden phrase is present).
//
// bug 0091's oracle
// (tests/b0091-rule1-ascii-terminator-closure-gate.test.ts) is a LOCK for this
// fix: all six of its cells stay green and its bytes stay unchanged. This file
// is strictly additive beside it.
//
// Offline, provider-free, deterministic: one `readFileSync` of a committed spec
// page plus two calls through the real `lexTheta` / `parseThetaDocument` entry
// points (tests/helpers/e2e-s1.ts). No precondition is tolerated silently — an
// unreadable page or an unlocatable bullet throws naming the unmet precondition
// (CLAUDE.md: no silent test skipping).

/** The spec page carrying the rationale under test. */
const SPEC_PATH = "docs/spec_topics/diagnostics/placeholder-rendering-b.md";

/** The bold lead-in that opens the edge-case bullet. */
const BULLET_MARKER = "**Category 6 line-separator scope.**";

/**
 * The single line bearing {@link BULLET_MARKER}. The bullet is one line of
 * markdown, so the line IS the bullet; requiring exactly one occurrence keeps
 * the oracle from silently asserting over a duplicate or a summary restatement.
 */
function category6Bullet(): string {
  const url = new URL(`../${SPEC_PATH}`, import.meta.url);
  const path = fileURLToPath(url);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (cause) {
    throw new Error(
      `b0266 precondition unmet: cannot read the spec page under test (${SPEC_PATH}) at ${path} — this file is a conformance oracle over that page's category 6 edge-case bullet, so an unreadable page is a hard failure, never a skip. Cause: ${String(cause)}`,
    );
  }
  const hits = text.split(/\r?\n/).filter((line) => line.includes(BULLET_MARKER));
  if (hits.length !== 1) {
    throw new Error(
      `b0266 precondition unmet: expected exactly one line containing '${BULLET_MARKER}' in ${SPEC_PATH}, found ${hits.length}. The bullet is located by content, not by line number; if it was retitled or split, this gate must be re-pointed deliberately rather than deleted.`,
    );
  }
  return hits[0] as string;
}

/** Every index at which `needle` matches `text`. */
function matchIndices(text: string, needle: RegExp): number[] {
  const re = new RegExp(
    needle.source,
    needle.flags.includes("g") ? needle.flags : `${needle.flags}g`,
  );
  const out: number[] = [];
  for (const m of text.matchAll(re)) out.push(m.index ?? 0);
  return out;
}

/**
 * True when some occurrence of `anchor` in `text` has every one of `tokens`
 * within `window` characters on either side. A proximity window stands in for
 * "in the same clause" without demanding a sentence-splitting heuristic.
 */
function nearAll(
  text: string,
  anchor: RegExp,
  tokens: readonly RegExp[],
  window = 400,
): boolean {
  return matchIndices(text, anchor).some((at) => {
    const slice = text.slice(Math.max(0, at - window), at + window);
    return tokens.every((t) => t.test(slice));
  });
}

const BULLET = category6Bullet();

describe("b0266 — category 6's line-separator rationale states the admitted lexical reality", () => {
  it("1: the bullet says authors CAN introduce U+2028 / U+2029 through a regular string literal, and never that they cannot", () => {
    // The negative guard first: the false premise is the whole defect, so its
    // phrase must be gone from the bullet. A resolution that keeps the rule and
    // re-introduces the impossibility claim reds here.
    expect(
      /cannot introduce/i.test(BULLET),
      `b0266: the category 6 bullet in ${SPEC_PATH} must not claim authors "cannot introduce" these code points through a regular string literal — the shipped lexer admits both the escape form and the raw form with zero diagnostics (cell 2 of this file)`,
    ).toBe(false);
    expect(
      /\b(?:can|may)\b[^.]*introduc/i.test(BULLET),
      `b0266: the bullet's rationale must state the admitted reality — authors CAN introduce these code points through a regular string literal (${SPEC_PATH})`,
    ).toBe(true);
    expect(
      nearAll(BULLET, /\b(?:can|may)\b[^.]*introduc/i, [/string literal/i], 300),
      `b0266: the "can introduce" claim must be made ABOUT a regular string literal, not about some other intake (${SPEC_PATH})`,
    ).toBe(true);
    // The rule sentence the rationale decorates is unchanged, and stays the
    // posture bug 0091 ratified: ordinary characters, MUST NOT split / strip /
    // promote. Asserted here so a future edit of the rationale cannot quietly
    // take the rule with it.
    for (const verb of ["split", "strip", "promote"] as const) {
      expect(
        new RegExp(`MUST NOT\\s+\\w*\\s*${verb}`, "i").test(BULLET),
        `b0266: the bullet's rule sentence is unchanged by this fix and must keep its "MUST NOT ${verb}" posture (${SPEC_PATH})`,
      ).toBe(true);
    }
    // The rendering half of the corrected rationale: such a value reaches the
    // surfaces and is rendered as ordinary text — the wording bug 0091 landed
    // for rule 1 in docs/spec_topics/binder/defaulting-system-note-echo.md.
    expect(
      /ordinary/i.test(BULLET) && /render/i.test(BULLET),
      `b0266: the rationale must say what the surfaces then do with such a value — render it as ordinary characters (${SPEC_PATH})`,
    ).toBe(true);
    // The citation is kept, and now supports the sentence instead of
    // contradicting it.
    expect(
      BULLET.includes("../lexical.md"),
      `b0266: the bullet must keep its link to docs/spec_topics/lexical.md, whose String literals paragraph is the grammar that admits both forms (${SPEC_PATH})`,
    ).toBe(true);
  });

  it("2: a regular string literal carrying U+2028 and U+2029 lexes and parses clean, in both the escape form and the raw form", () => {
    // Without this cell the prose claim in cell 1 is unmeasured. Both sources
    // are the same program value written two ways; the decoded string token
    // must carry the five scalars in order.
    const forms = [
      { name: "escape form", src: 'let a = "x\\u{2028}y\\u{2029}z"' },
      { name: "raw form", src: 'let a = "x\u2028y\u2029z"' },
    ] as const;
    for (const { name, src } of forms) {
      const lexed = lexSrc(src);
      expect(
        codes(lexed.diagnostics),
        `b0266 (${name}): the shipped lexer must admit U+2028 / U+2029 inside a regular string literal with no diagnostic — in particular not theta/parse/literal-newline-in-string, whose single-line rule reads U+000A only (docs/spec_topics/lexical.md, the String literals paragraph)`,
      ).toEqual([]);
      const stringTokens = lexed.tokens.filter((t) => t.kind === "string");
      expect(
        stringTokens.length,
        `b0266 (${name}): expected exactly one string token in the lexed source`,
      ).toBe(1);
      const value = stringTokens[0]?.value ?? "";
      expect(
        [...value].map((c) => c.codePointAt(0)?.toString(16)),
        `b0266 (${name}): the decoded literal must carry both separators as ordinary scalars`,
      ).toEqual(["78", "2028", "79", "2029", "7a"]);
      expect(
        codes(parseDoc(src).diagnostics),
        `b0266 (${name}): the whole-document parse must also be clean, so the value reaches a program`,
      ).toEqual([]);
    }
  });
});
