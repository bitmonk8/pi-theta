import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderEchoValue, type EchoType } from "../src/render/argument-echo";

// b0091 — conformance oracle over rule 1 of the system-note rendering rules
// (docs/spec_topics/binder/defaulting-system-note-echo.md, the paragraph
// beginning "1. **Single line.**").
//
// THE RULING (the spec authority for this file). Bug 0091
// (docs/bugs/0091-rule1-set-excludes-u2028-u2029-line-breaks.md) is a spec gap:
// rule 1 closes its whitespace set at six ASCII characters and says nothing
// about whether rule 3's one-line contract binds against U+2028 LINE SEPARATOR
// and U+2029 PARAGRAPH SEPARATOR, which are line terminators in JavaScript. The
// operator ruled disposition 2 — the closure is DELIBERATE: rule 1's
// sanitisation class is the CR/LF class only, U+2028 and U+2029 are ordinary
// characters on every render surface, the six accreted call sites' posture is
// ratified, the JS-line-terminator forging vector is the ACCEPTED RESIDUAL, and
// disposition 1 (widen the set) is REJECTED.
//
// WHAT THIS FILE ASSERTS. The ruling has to live in the corpus, not in a test
// comment: the behaviour it ratifies is pinned today only by cells `a7` and
// `a10` of tests/echo-value-rule1-sanitisation.test.ts, inside the regression
// file of a report (0087) that is fixed and closed. So five prose claims are
// asserted over rule 1's own paragraph, plus one behavioural mirror cell that
// binds the prose oracle to the ratified behaviour.
//
//   1  RED — the paragraph states the closure is deliberate and names both
//      U+2028 and U+2029 (today it names neither).
//   2  RED — rule 1's replacement/sanitisation class is spelled as the CR/LF
//      class: U+000A and U+000D named as the line terminators the rule
//      replaces, plus the CR+LF pair.
//   3  RED — the MUST NOT split / MUST NOT strip / MUST NOT promote posture for
//      the two characters, matching category 6's wording at
//      docs/spec_topics/diagnostics/placeholder-rendering-b.md line 139.
//   4  RED — the accepted residual is stated: a consumer treating the
//      JavaScript line-terminator set as line breaks may render one note across
//      more than one physical line, and rule 3's trust boundary is not defined
//      against such a consumer.
//   5  GREEN, and must stay green — the NEGATIVE guard. The six-ASCII
//      enumeration is unchanged and U+2028/U+2029 are NOT added to it. This is
//      the pin that disposition 1 was rejected: a resolution that widens the
//      set reds here.
//   6  GREEN, and must stay green — the behavioural mirror. `renderEchoValue`
//      preserves U+2028 verbatim, which is exactly what the new prose ratifies.
//
// Assertions match on load-bearing tokens ("U+2028", "U+2029", "deliberate",
// "MUST NOT", "U+000A", "U+000D", "JavaScript") with proximity windows rather
// than on verbatim sentences, so the wording of the normative sentence is the
// editor's to choose; only its content is gated.
//
// SPEC ANCHORS (re-derived against this tree):
//   - docs/spec_topics/binder/defaulting-system-note-echo.md, rule 1
//     ("1. **Single line.**") — the paragraph under test: it replaces `\r`,
//     `\n` and `\r\n` with one space, then collapses and trims over "exactly
//     the ASCII whitespace set {U+0009 …, U+0020 (space)}", and preserves
//     non-ASCII whitespace verbatim.
//   - the same page, rule 3 ("3. **Prefix is theta-controlled, suffix is model-
//     or runtime-controlled.**") — the one-line grammar and the trust boundary
//     the residual is accepted against.
//   - docs/spec_topics/diagnostics/placeholder-rendering-b.md, the "Category 6
//     line-separator scope" edge-case bullet — "`\u2028` and `\u2029` are
//     ordinary characters for this rule. Implementations MUST NOT split on
//     them, MUST NOT strip them, and MUST NOT promote them into `\n`". The
//     corpus's one existing decision on these bytes; the ruling makes rule 1
//     answer the same way.
//
// Offline, provider-free, deterministic: one `readFileSync` of a committed spec
// page plus one direct call on an exported pure renderer. No preconditions are
// tolerated silently — a missing page or an unlocatable rule-1 paragraph throws
// naming the unmet precondition (CLAUDE.md: no silent test skipping).

/** The spec page the ruling edits. */
const SPEC_PATH = "docs/spec_topics/binder/defaulting-system-note-echo.md";

/** The list marker that opens rule 1's paragraph. */
const RULE1_MARKER = "1. **Single line.**";

function readSpecPage(): string {
  const url = new URL(`../${SPEC_PATH}`, import.meta.url);
  const path = fileURLToPath(url);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (cause) {
    throw new Error(
      `b0091 precondition unmet: cannot read the spec page under test (${SPEC_PATH}) at ${path} — this file is a conformance oracle over that page's rule 1, so an unreadable page is a hard failure, never a skip. Cause: ${String(cause)}`,
    );
  }
  if (!text.includes(RULE1_MARKER)) {
    throw new Error(
      `b0091 precondition unmet: ${SPEC_PATH} carries no line opening with '${RULE1_MARKER}' — rule 1's paragraph is the oracle's subject and could not be located. If the rule was renumbered or retitled, this gate must be re-pointed, not deleted.`,
    );
  }
  return text;
}

/**
 * Rule 1's paragraph: the line opening with {@link RULE1_MARKER} and every
 * following line up to (not including) the next top-level numbered rule, the
 * next heading, or end of page. Continuation lines and sub-bullets added by the
 * ruling's edit therefore count as part of the paragraph; rule 2's text does
 * not.
 */
function rule1Paragraph(): string {
  const lines = readSpecPage().split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith(RULE1_MARKER));
  if (start < 0) {
    throw new Error(
      `b0091 precondition unmet: no line STARTS with '${RULE1_MARKER}' in ${SPEC_PATH} (the marker occurs, but not at the head of a line) — the paragraph boundary is unrecoverable`,
    );
  }
  let end = start + 1;
  while (end < lines.length && !/^(?:\d+\.\s|#)/.test(lines[end] as string))
    end += 1;
  const paragraph = lines.slice(start, end).join("\n");
  if (paragraph.trim().length === 0) {
    throw new Error(
      `b0091 precondition unmet: rule 1's paragraph in ${SPEC_PATH} is empty`,
    );
  }
  return paragraph;
}

/** Every index at which `needle` (a regex) matches `text`. */
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
 * "in the same clause" without demanding a sentence-splitting heuristic or a
 * verbatim sentence.
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

/** The one `{…}` enumeration inside rule 1's paragraph (the whitespace set). */
function whitespaceSetEnumeration(paragraph: string): string {
  const groups = [...paragraph.matchAll(/\{[^{}]*\}/g)]
    .map((m) => m[0])
    .filter((g) => g.includes("U+00"));
  if (groups.length !== 1) {
    throw new Error(
      `b0091 precondition unmet: expected exactly one code-point enumeration '{…}' in rule 1's paragraph of ${SPEC_PATH}, found ${groups.length}. The negative guard cannot be evaluated without it; a resolution that restructures the enumeration must re-point this gate deliberately.`,
    );
  }
  return groups[0] as string;
}

const PARAGRAPH = rule1Paragraph();

describe("b0091 — rule 1's CR/LF-only closure is stated as deliberate (prose oracle)", () => {
  it("1 (RED): the paragraph states the closure is DELIBERATE and names both U+2028 and U+2029", () => {
    // The operator's ruling, disposition 2: "state the closure as deliberate".
    // Today rule 1 names U+00A0 and the U+2000–U+200A range and says nothing
    // about either line separator, so both tokens are absent.
    expect(
      PARAGRAPH.includes("U+2028"),
      `b0091 ruling (disposition 2): rule 1's paragraph in ${SPEC_PATH} must name U+2028 LINE SEPARATOR explicitly. Today the two characters fall under the general "non-ASCII whitespace" phrase only, which answers "which characters are collapsed", not "which characters break a line"`,
    ).toBe(true);
    expect(
      PARAGRAPH.includes("U+2029"),
      `b0091 ruling (disposition 2): rule 1's paragraph in ${SPEC_PATH} must name U+2029 PARAGRAPH SEPARATOR explicitly, alongside U+2028`,
    ).toBe(true);
    expect(
      /deliberate/i.test(PARAGRAPH),
      `b0091 ruling: the six-character closure must be stated as DELIBERATE, not left as an accident of the enumeration — that word (or a form of it) is the load-bearing token, because the whole disposition is "the closure is by design"`,
    ).toBe(true);
    expect(
      nearAll(PARAGRAPH, /deliberate/i, [/U\+2028/, /U\+2029/], 600),
      "b0091 ruling: the deliberateness claim must be made ABOUT U+2028 / U+2029 — the two tokens and the word must sit in one passage, not in unrelated halves of the paragraph",
    ).toBe(true);
  });

  it("2 (RED): rule 1's replacement/sanitisation class is spelled as the CR/LF class — U+000A, U+000D and the CR+LF pair", () => {
    // The ruling: "Rule1's sanitisation set is the CR/LF class only, by
    // design." Today the replacement sub-step spells its inputs as `\r`, `\n`
    // and `\r\n` and the words "line terminator" never appear, so the rule
    // never says WHICH characters count as line breaks — the precise silence
    // bug 0091 reports.
    expect(
      PARAGRAPH.includes("U+000A"),
      `b0091: rule 1 must name U+000A (line feed) as a line terminator it replaces (${SPEC_PATH})`,
    ).toBe(true);
    expect(
      PARAGRAPH.includes("U+000D"),
      `b0091: rule 1 must name U+000D (carriage return) as a line terminator it replaces (${SPEC_PATH})`,
    ).toBe(true);
    expect(
      /line[- ]terminator/i.test(PARAGRAPH),
      `b0091 root cause: rule 1 enumerates by a WHITESPACE criterion and rule 3 constrains a LINE, and no sentence on the page says what a line break is. The ruling closes that by naming the line-terminator class in rule 1's own text (${SPEC_PATH})`,
    ).toBe(true);
    expect(
      nearAll(PARAGRAPH, /line[- ]terminator/i, [/U\+000A/, /U\+000D/], 500),
      "b0091 ruling: the line-terminator class must be spelled AS U+000A and U+000D — the codepoint tokens must sit in the same passage as the terminator claim, so the class is stated in codepoints rather than in escape spellings alone",
    ).toBe(true);
    expect(
      /\\r\\n|CRLF|CR\+LF|U\+000D\s*(?:U\+000A|followed by U\+000A)/i.test(
        PARAGRAPH,
      ),
      "b0091: the CR+LF pair stays part of the replaced class (rule 1 replaces `\\r\\n` as one unit today; the restatement must not drop it)",
    ).toBe(true);
  });

  it("3 (RED): the paragraph carries the MUST NOT split / MUST NOT strip / MUST NOT promote posture for U+2028 / U+2029", () => {
    // Matching category 6's wording at
    // docs/spec_topics/diagnostics/placeholder-rendering-b.md — the "Category 6
    // line-separator scope" bullet: "`\u2028` and `\u2029` are ordinary
    // characters for this rule. Implementations MUST NOT split on them, MUST
    // NOT strip them, and MUST NOT promote them into `\n`". Bug 0091 §Why it
    // matters (4): the corpus currently answers the same question two ways for
    // the same bytes; the ruling makes rule 1 answer as category 6 does.
    for (const verb of ["split", "strip", "promote"] as const) {
      expect(
        new RegExp(`MUST NOT\\s+\\w*\\s*${verb}`, "i").test(PARAGRAPH),
        `b0091 ruling: rule 1 must carry the same posture category 6 already states for these bytes — "MUST NOT ${verb}". Missing verb: ${verb} (${SPEC_PATH})`,
      ).toBe(true);
    }
    expect(
      nearAll(PARAGRAPH, /MUST NOT/, [/U\+2028|U\+2029/], 600),
      "b0091 ruling: the MUST NOT posture must attach to U+2028 / U+2029 — a MUST NOT elsewhere in rule 1 does not discharge it",
    ).toBe(true);
  });

  it("4 (RED): the accepted residual is stated — a JS-line-terminator consumer may render one note across more than one physical line", () => {
    // The ruling: "The JS-line-terminator forging vector (the /^Running \//gm
    // 2-vs-1 row) is recorded as the ACCEPTED RESIDUAL — real only for
    // downstream consumers honouring JS line terminators, none shipped." Bug
    // 0091 §Fix disposition 2's attached obligation: "the sentence states that
    // the trust boundary rule 3 establishes is defined against the ASCII
    // terminators and does not extend to a consumer using JavaScript's
    // line-terminator semantics."
    expect(
      /JavaScript|JS line[- ]terminator/i.test(PARAGRAPH),
      `b0091 ruling: the accepted residual names the consumer class it is accepted against — one honouring the JavaScript line-terminator set (${SPEC_PATH})`,
    ).toBe(true);
    expect(
      /more than one (?:physical )?line|multiple (?:physical )?lines|across (?:more than one|two) lines|two physical lines/i.test(
        PARAGRAPH,
      ),
      "b0091 ruling: the residual's observable is that ONE note may render across MORE THAN ONE physical line for such a consumer; the sentence must say so rather than leaving the consequence implicit",
    ).toBe(true);
    expect(
      /trust boundary|rule 3/i.test(PARAGRAPH),
      "b0091 ruling: the residual must be tied to rule 3's trust boundary — the boundary is not defined against a JS-line-terminator consumer, which is the accepted risk (bug 0091 §Why it matters (1): `/^Running \\//gm` matches twice on one note's content)",
    ).toBe(true);
  });

  it("5 (GREEN, must stay green): NEGATIVE guard — the six-ASCII enumeration is unchanged and U+2028 / U+2029 are NOT added to it", () => {
    // Disposition 1 (widen rule 1's set) was REJECTED. This cell is the pin:
    // an edit that adds either character to the collapse/trim set reds here,
    // as does an edit that drops one of the six or reaches for a `\s` class.
    const enumeration = whitespaceSetEnumeration(PARAGRAPH);
    expect(
      [...enumeration.matchAll(/U\+[0-9A-F]{4}/g)].map((m) => m[0]),
      "b0091 ruling: disposition 1 is REJECTED — rule 1's collapse/trim set stays exactly the six ASCII whitespace characters, in order",
    ).toEqual(["U+0009", "U+000A", "U+000B", "U+000C", "U+000D", "U+0020"]);
    expect(
      enumeration.includes("U+2028") || enumeration.includes("U+2029"),
      `b0091 ruling: U+2028 / U+2029 MUST NOT enter rule 1's whitespace enumeration — the ruling ratifies the six accreted call sites' posture and changes no code. Enumeration found: ${enumeration}`,
    ).toBe(false);
    expect(
      PARAGRAPH.includes("exactly the ASCII whitespace set"),
      "b0091 ruling: the set stays framed as EXACTLY the ASCII whitespace set — the framing disposition 1 would have had to move",
    ).toBe(true);
    expect(
      /never the language-dependent regex/.test(PARAGRAPH),
      "b0091 ruling: the `\\s`-class prohibition survives the edit — a `\\s` implementation would collapse U+2028, U+2029, U+00A0 and U+2003 alike, which is the outcome the ruling rejects",
    ).toBe(true);
    expect(
      PARAGRAPH.includes("U+00A0"),
      "b0091 §Non-goals: U+00A0 and the U+2000–U+200A range stay named and stay preserved; the ruling does not touch them",
    ).toBe(true);
  });
});

describe("b0091 — behavioural mirror: the ratified behaviour the prose now states", () => {
  const str: EchoType = { kind: "string" };

  it("6 (GREEN, must stay green): `renderEchoValue` preserves U+2028 and U+2029 verbatim", () => {
    // One cell only, binding the prose oracle above to the behaviour it
    // ratifies: rule 1's sanitisation pass leaves the characters untouched and
    // the quote predicate (`[A-Za-z0-9_.-]`) still forces quoting. BOTH code
    // points are pinned here because the ruling ratifies both, so this file's
    // own ratchet must red on a code widening that reaches either one — a
    // mirror covering half the ruling would let the other half move under it.
    // The full vector set lives in tests/echo-value-rule1-sanitisation.test.ts
    // cell `a10`, which the ruling leaves byte-unchanged — this is a mirror,
    // not a second owner. It is GREEN at the current bytes by construction:
    // the ruling changes no code.
    expect(
      renderEchoValue("a\u2028b", str),
      "b0091 ruling: U+2028 is an ordinary character for rule 1 — preserved verbatim, neither collapsed nor trimmed, and the value stays quoted",
    ).toBe('"a\u2028b"');
    expect(
      renderEchoValue("a\u2029b", str),
      "b0091 ruling: U+2029 is an ordinary character for rule 1 — preserved verbatim, neither collapsed nor trimmed, and the value stays quoted",
    ).toBe('"a\u2029b"');
  });
});
