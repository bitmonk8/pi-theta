import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Token } from "../src/lexer/lexer";
import { lexSrc } from "./helpers/e2e-s1";

// Bug 0062 — the closed continuation-trigger table on both grammar pages, and
// the closed prose enumeration on the lexical page, list fifteen operator texts
// and omit the bare `=` that the shipped lexer's `trailingTriggers`
// (src/lexer/lexer.ts) implements, so `let x =`, `x =` and `schema X =`
// continue onto the next line under a set that declares itself exhaustive
// (docs/bugs/0062-grammar-trailing-trigger-table-omits-equals.md).
//
// THE SETTLED ROUTE this file witnesses is documentation-only: the trailing row
// on each grammar page and the prose enumeration gain `=`; no `src/` byte, no
// registry row, and no existing test moves. The behavioural half of the report
// is already pinned by tests/lexer-core.test.ts §"newline continuation"; this
// file is the corpus-conformance oracle the report's own §Fix says nothing
// currently supplies — no test or tool opens either grammar page as a file, so
// the divergence has no failure signal.
//
// WHICH CELLS RED AND WHICH DO NOT, stated up front:
//
//   - §(A) THE BEHAVIOUR ANCHOR — GREEN before and after. It is the oracle's
//     ground truth: a trailing `=` continues, a LEADING `=` closes. The
//     asymmetry is deliberate in the implementation (`trailingTriggers` carries
//     `=`, `leadingTriggers` does not) and the documentation edit must preserve
//     it, so the anchor is what makes §(B) and §(C) claims about the tree
//     rather than about a remembered measurement.
//   - §(B) CORPUS CONFORMANCE — RED at HEAD. Three cells, one per page,
//     each scoped to the section that carries the closed set and asserting the
//     trailing trigger names `=`.
//   - §(C) THE NO-OVER-REACH GUARD — GREEN before and after. The leading
//     direction must not widen. Its second conjunct is conditional on §(B)
//     having landed, which is precisely the over-reach the settled route warns
//     about: the leading row's referent is "the operators above", so naming `=`
//     in the trailing row above it reads onto the leading set unless the same
//     edit re-pins the referent.
//
// Offline, deterministic, provider-free: one `lexSrc` call per anchor row plus
// three `readFileSync` reads of committed documentation. The doc-reading shape
// follows tests/for-empty-array-iterand-adjudication.test.ts §(A) and
// tests/fn-param-annotation-optional.test.ts group (a).
//
// No assertion here matches a diagnostic *Message* string: DIAG-4 fixes the
// direction of expected-message reads and this route touches no registry row
// (docs/spec_topics/diagnostics/diagnostic-shape.md §"Diagnostic message
// anchors").

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

// ===========================================================================
// Corpus readers. Every failure names its unmet precondition and throws; a
// missing file or renamed heading must never let a conformance cell range over
// an empty string and pass vacuously.
// ===========================================================================

/** A corpus file's bytes, read off the live tree so no cell asserts a snapshot. */
function corpus(rel: string): string {
  const text = readFileSync(path.join(REPO_ROOT, rel), "utf8");
  if (text.trim().length === 0) {
    throw new Error(
      `harness: ${rel} read empty, so the section this cell scopes to does not exist — a loud failure, never a vacuous pass`,
    );
  }
  return text;
}

/**
 * The body of a `##`-headed section, heading line included, up to the next
 * `## ` heading. Region-scoped so no cell below can be satisfied by the
 * required token appearing in unrelated prose elsewhere on the page.
 */
function section(text: string, heading: string, rel: string): string {
  const start = text.indexOf(`\n${heading}\n`);
  if (start < 0) {
    throw new Error(
      `harness: ${rel} carries no heading ${JSON.stringify(heading)}, so the closed-trigger region this cell scopes to does not exist`,
    );
  }
  const rest = text.slice(start + 1 + heading.length);
  const end = rest.indexOf("\n## ");
  return heading + (end < 0 ? rest : rest.slice(0, end));
}

/** Whitespace-collapsed, lowercased text — wording and wrapping are the editor's. */
function flat(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

// ===========================================================================
// Table readers. A row is read as cells; the declarative cells (*Trigger* and
// *Position*) are the normative statement of the set, and the *Example* column
// is deliberately excluded — an example that happens to spell `=` inside a
// worked line is exactly what the report shows a closed table can carry while
// still not licensing the trigger.
// ===========================================================================

/** A markdown table row's cells, split on unescaped pipes. */
function cells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());
}

/** The *Trigger* and *Position* cells of a trigger row, in that order. */
function declarative(row: string): string[] {
  return cells(row).slice(0, 2);
}

/**
 * The single trigger row of a section's table whose *Trigger* cell matches
 * `want` and no other row's does. Uniqueness is asserted so a table rewritten
 * into more rows reds by naming that rather than by silently reading the wrong
 * row.
 */
function triggerRow(region: string, want: RegExp, rel: string, label: string): string {
  const hits = region
    .split("\n")
    .filter((l) => l.trim().startsWith("|") && !/^\|\s*-+/.test(l.trim()))
    .filter((l) => want.test(cells(l)[0] ?? ""));
  if (hits.length !== 1) {
    throw new Error(
      `harness: ${rel} must carry exactly one ${label} trigger row matching ${String(want)}; found ${hits.length}: ${JSON.stringify(hits)}`,
    );
  }
  return hits[0] as string;
}

/** The contents of every backticked code span in `text`, unescaped. */
function codeSpans(text: string): string[] {
  return [...text.matchAll(/`([^`]*)`/g)].map((m) => (m[1] ?? "").replace(/\\\|/g, "|"));
}

/** Every whitespace-separated operator text named in a row's declarative cells. */
function operatorTexts(row: string): string[] {
  return declarative(row).flatMap((cell) =>
    codeSpans(cell).flatMap((span) => span.split(/\s+/).filter((t) => t.length > 0)),
  );
}

/**
 * The operator texts a row names as members of a LIST — code spans holding two
 * or more texts. A lone `` `=` `` span is not a list member, which is what lets
 * the leading row mention the token in order to exclude it while §(C) still
 * reds on a row that appends it to the admitted set.
 */
function listedOperatorTexts(row: string): string[] {
  return declarative(row).flatMap((cell) =>
    codeSpans(cell)
      .map((span) => span.split(/\s+/).filter((t) => t.length > 0))
      .filter((texts) => texts.length >= 2)
      .flat(),
  );
}

// ===========================================================================
// The three corpus sites, and the two sections that carry the closed table.
// ===========================================================================

const SPEC_GRAMMAR = "docs/spec_topics/grammar.md";
const REF_GRAMMAR = "docs/reference/grammar.md";
const LEXICAL = "docs/spec_topics/lexical.md";

const SPEC_HEADING = "## Newline continuation";
const REF_HEADING = "## Statement termination & newline continuation";

/** The `=` token whose omission from each closed set is the defect. */
const EQ = "=";

/** Phrases that read as an explicit exclusion of `=` from the leading set. */
const EXCLUSION = /trailing[- ]only|not a leading|never a leading|no leading/;

// ===========================================================================
// (A) The behaviour anchor — GREEN at HEAD, and the asymmetry §(B)'s edit must
// preserve. `lexSrc` (tests/helpers/e2e-s1.ts) wraps the shipped `lexTheta`
// with an inert system-note seam; nothing under assertion is stubbed.
// ===========================================================================

/** Statement groups: non-`eof` tokens between `stmt-sep`s, empty groups dropped. */
function statementGroups(tokens: readonly Token[]): Token[][] {
  const groups: Token[][] = [];
  let current: Token[] = [];
  for (const t of tokens) {
    if (t.kind === "stmt-sep") {
      if (current.length > 0) {
        groups.push(current);
        current = [];
      }
    } else if (t.kind !== "eof") {
      current.push(t);
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/** How many statements the shipped lexer joins `src` into. */
function groups(src: string): number {
  return statementGroups(lexSrc(src).tokens).length;
}

describe("bug 0062 (A) — the implemented asymmetry the documentation edit must state, not change", () => {
  it("A1: a trailing `=` continues across newlines, a leading `=` closes the statement", () => {
    // `trailingTriggers` (src/lexer/lexer.ts) carries `=`; `leadingTriggers`
    // deliberately does not. Both halves are asserted in one cell because the
    // claim §(B) writes into the corpus is the PAIR — a trailing-row edit that
    // widens the leading set would still satisfy the first half alone.
    expect(
      groups("let x =\n\n  foo"),
      "a trailing `=` is a continuation trigger, so `let x =\\n\\n  foo` is ONE statement; this is the worked example both grammar sections already carry, and the row above it must license it",
    ).toBe(1);
    expect(
      groups("let x = a\n= b"),
      "a LEADING `=` is not a continuation trigger, so `let x = a\\n= b` is TWO statements; `leadingTriggers` (src/lexer/lexer.ts) omits `=` and the leading row must keep omitting it",
    ).toBe(2);
  });

  it("A2: the tabled trailing operator and a non-trigger token, for contrast", () => {
    // The controls that make A1's first row a statement about `=` rather than
    // about newline handling in general: a tabled operator continues, a token
    // in neither set closes.
    expect(
      groups("let x = a +\n  b"),
      "the tabled trailing `+` continues, so A1's `=` row is not measuring some blanket newline leniency",
    ).toBe(1);
    expect(
      groups("a !\n b"),
      "`!` is in neither trigger set, so the newline closes the statement — the negative control for A1",
    ).toBe(2);
  });
});

// ===========================================================================
// (B) Corpus conformance — RED at HEAD. Each cell scopes to the section that
// declares its set closed and asserts the trailing trigger names `=`.
// ===========================================================================

describe("bug 0062 (B) — every closed continuation-trigger set names the trailing `=`", () => {
  it("B1: docs/spec_topics/grammar.md §Newline continuation's trailing row names `=`", () => {
    // The section declares "The trigger set is closed", and its own worked
    // example (`let x =\n\n  foo` is one statement, measured at A1) is licensed
    // by no row of the table above it. A closed enumeration lists every trigger
    // the implementation fires on, so the token belongs in the *Trigger* or
    // *Position* cell — not only in an *Example*, which is why the Example
    // column is excluded from `declarative`.
    const region = section(corpus(SPEC_GRAMMAR), SPEC_HEADING, SPEC_GRAMMAR);
    const row = triggerRow(region, /trailing(?!.*comma)/i, SPEC_GRAMMAR, "trailing-operator");
    expect(
      operatorTexts(row),
      `${SPEC_GRAMMAR} ${SPEC_HEADING} — the trailing row must name \`=\` among the texts it declares as triggers; \`trailingTriggers\` (src/lexer/lexer.ts) fires on it (measured at A1), so a set that omits it is not the closed set the section claims`,
    ).toContain(EQ);
  });

  it("B2: docs/reference/grammar.md's mirror trailing row names `=`", () => {
    // A route that corrects the spec topic and leaves the reference mirror
    // stale leaves the corpus disagreeing with itself instead of with the
    // lexer, and leaves this page's own implementation-confirmation claim —
    // that the lexer's trailing/leading sets match the closed table — false.
    const region = section(corpus(REF_GRAMMAR), REF_HEADING, REF_GRAMMAR);
    const row = triggerRow(region, /trailing(?!.*comma)/i, REF_GRAMMAR, "trailing-operator");
    expect(
      operatorTexts(row),
      `${REF_GRAMMAR} ${REF_HEADING} — the mirror's trailing row must move with the spec topic's and name \`=\``,
    ).toContain(EQ);
  });

  it("B3: docs/spec_topics/lexical.md §\"Statement terminators\" names a trailing `=`", () => {
    // The third statement of the same set, as prose, and equally closed: the
    // sentence enumerates four continuation triggers and then defers
    // normativity to the grammar table. Scoped to the enumerating sentence, so
    // the page's later `let x =` example cannot satisfy the cell.
    const paragraph = terminatorsParagraph();
    const sentence = enumerationSentence(paragraph);
    expect(
      codeSpans(sentence),
      `${LEXICAL} §"Statement terminators" — the closed prose enumeration must carry the trailing \`=\` as its own item (a lone \`\`\`=\`\`\` code span); its four items name no trigger that licenses this page's own \`let x =\\n\\n  foo\` example`,
    ).toContain(EQ);
    expect(
      flat(sentence),
      `${LEXICAL} §"Statement terminators" — the \`=\` item must be stated in the TRAILING direction; a bare mention would leave the sentence silent on which side of the newline the token triggers on`,
    ).toMatch(/trailing[^.]*`=`/);
  });
});

/**
 * The `**Statement terminators.**` paragraph of the lexical page. The page's
 * bullet-and-paragraph structure carries no `##` heading for it, so the
 * paragraph is the region; presence is asserted rather than assumed.
 */
function terminatorsParagraph(): string {
  const marker = "**Statement terminators.**";
  const text = corpus(LEXICAL);
  const start = text.indexOf(marker);
  if (start < 0) {
    throw new Error(
      `harness: ${LEXICAL} carries no ${JSON.stringify(marker)} paragraph, so the closed prose enumeration this cell scopes to does not exist`,
    );
  }
  const rest = text.slice(start);
  const end = rest.indexOf("\n\n");
  return end < 0 ? rest : rest.slice(0, end);
}

/**
 * The one sentence of that paragraph which enumerates the triggers. Scoping to
 * the sentence is what keeps B3 and C3 from being satisfied — or defeated — by
 * the blank-line rule that follows it in the same paragraph.
 */
function enumerationSentence(paragraph: string): string {
  const hits = paragraph
    .split(/(?<=\.)\s+(?=[A-Z*])/)
    .filter((s) => /continues across newlines/.test(s));
  if (hits.length !== 1) {
    throw new Error(
      `harness: ${LEXICAL} §"Statement terminators" must carry exactly one trigger-enumerating sentence ("continues across newlines"); found ${hits.length}: ${JSON.stringify(hits)}`,
    );
  }
  return hits[0] as string;
}

// ===========================================================================
// (C) The no-over-reach guard — GREEN at HEAD and after. The leading direction
// is correct as written (A1's second row), so widening it would document a
// trigger the lexer refuses.
// ===========================================================================

/** Assert one page's leading row still excludes `=` from its admitted set. */
function expectLeadingRowStillNarrow(rel: string, heading: string): void {
  const region = section(corpus(rel), heading, rel);
  const leading = triggerRow(region, /leading/i, rel, "leading-operator");
  const trailing = triggerRow(region, /trailing(?!.*comma)/i, rel, "trailing-operator");
  const leadingFlat = flat(declarative(leading).join(" "));

  expect(
    flat(cells(leading)[0] ?? ""),
    `${rel} ${heading} — the leading row's *Trigger* cell must keep naming the binary and ternary operators as its population; a head reworded to admit any trailing trigger would document a leading \`=\`, which closes the statement (measured at A1)`,
  ).toMatch(/binary.*ternary/);

  expect(
    listedOperatorTexts(leading),
    `${rel} ${heading} — the leading row must not LIST \`=\` among its admitted operator texts: \`leadingTriggers\` (src/lexer/lexer.ts) omits it and \`let x = a\\n= b\` is two statements (A1)`,
  ).not.toContain(EQ);

  if (operatorTexts(trailing).includes(EQ)) {
    // Only reachable once §(B) has landed on this page. The leading row's
    // referent is the trailing row's set ("the operators above"), so naming
    // `=` above without re-pinning the referent below silently widens the
    // leading set to a token the lexer refuses.
    expect(
      EXCLUSION.test(leadingFlat) && leadingFlat.includes("`=`"),
      `${rel} ${heading} — the trailing row now names \`=\`, so the leading row's referent reads onto it. The leading row must re-pin its own population and say in terms that \`=\` is trailing-only; leading declarative cells were ${JSON.stringify(declarative(leading))}`,
    ).toBe(true);
  }
}

describe("bug 0062 (C) — the leading direction stays narrow: `=` is trailing-only", () => {
  it("C1: docs/spec_topics/grammar.md's leading row admits no `=`", () => {
    expectLeadingRowStillNarrow(SPEC_GRAMMAR, SPEC_HEADING);
  });

  it("C2: docs/reference/grammar.md's leading row admits no `=`", () => {
    expectLeadingRowStillNarrow(REF_GRAMMAR, REF_HEADING);
  });

  it("C3: docs/spec_topics/lexical.md's prose keeps its leading item to operators", () => {
    // The prose has no referent to re-pin — it spells its leading item out —
    // so the guard here is that the spelled item stays the operator set.
    const sentence = enumerationSentence(terminatorsParagraph());
    const sentenceFlat = flat(sentence);
    expect(
      sentenceFlat,
      `${LEXICAL} §"Statement terminators" — the leading item must stay the binary/ternary operators on the next non-blank line`,
    ).toMatch(/leading binary or ternary operator/);
    expect(
      /leading[^.]{0,40}`=`/.test(sentenceFlat) && !EXCLUSION.test(sentenceFlat),
      `${LEXICAL} §"Statement terminators" — the enumeration must not add \`=\` as a LEADING item: a line-leading \`=\` closes the statement (A1)`,
    ).toBe(false);
  });
});
