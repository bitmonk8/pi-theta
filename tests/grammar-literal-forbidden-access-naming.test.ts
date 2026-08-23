import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { codes, hasCode, parseDoc } from "./helpers/e2e-s1";

// Bug 0049 (b0049) — the last bullet of the *Forbidden inside a literal* list on
// docs/spec_topics/grammar.md heads two syntactic forms with one name: it says
// "Member access on anything other than `Enum.Variant` (no `obj.field`, no
// `arr[i]`)", but `arr[i]` is the form docs/spec_topics/expressions.md:10 names
// "Indexed access", a name :9 keeps separate from "Member access: `a.b`"
// (docs/bugs/0049-grammar-member-access-head-covers-bracket-indexing.md).
//
// THE SETTLED ROUTE this file witnesses is the report's §Fix **disposition 1
// (relabel)**, which §Fix recommends: documentation-only, `src/` byte-untouched,
// an in-place LINE-COUNT-PRESERVING rewrite of the bullet so the head names both
// forms in the naming authority's own vocabulary while the `Enum.Variant`
// carve-out stays scoped to the dot form — §Fix's own example wording, "- Member
// access on anything other than `Enum.Variant`, and indexed access in any form
// (no `obj.field`, no `arr[i]`)." — plus §Fix constraint 5's mirror move, so
// docs/reference/grammar.md's restatement gains the indexed-access name in the
// same commit. §Fix constraint 7 records that no test or tool opens either page
// as a file, which is why the divergence has no failure signal today; this file
// is that corpus-conformance oracle.
//
// WHICH CELLS RED AND WHICH DO NOT, stated up front:
//
//   - §(A) THE BEHAVIOUR ANCHOR — GREEN before and after. It is the oracle's
//     ground truth: `Sev.High` (an enum in scope) is admitted at a `params:`
//     default while `Sev["High"]` and `arr[i]` are rejected. The carve-out the
//     bullet's head carries therefore exists in the DOT form only — the
//     implementation splits at src/parser/literal-sublanguage.ts:553 (`case
//     "member":`, `Enum.Variant` only) versus :572 (the `default:` arm that
//     rejects every `index` node) — and the relabel must state that split, not
//     change it.
//   - §(B) CORPUS CONFORMANCE — RED at HEAD. Two cells, one per page, each
//     region-scoped to the section that carries the closed forbidden list, each
//     asserting that the bullet which names the bracket spelling also carries
//     the naming authority's name for that form.
//   - §(C) THE NO-OVER-REACH GUARDS — GREEN before and after, and none of them
//     presupposes §(B). They pin what disposition 1 is constrained NOT to move:
//     the naming authority itself (§Fix constraint 1), the four sibling bullets
//     byte-for-byte and the three quoted expressions (§Fix constraint 2), the
//     carve-out's scoping to the member-access half (the report's own
//     discriminator), and both pages' line counts (§Fix constraint 3 — 74
//     inbound citations name line numbers above 54).
//
// Offline, deterministic, provider-free: four `parseDoc` calls through the
// shipped front end (tests/helpers/e2e-s1.ts) plus `readFileSync` reads of
// committed documentation. The doc-reading shape, the loud-precondition readers
// and this header follow tests/grammar-trailing-trigger-equals.test.ts (bug
// 0062's corpus-conformance oracle).
//
// No assertion here matches a diagnostic *Message* string — §(A) asserts on
// diagnostic CODES only. DIAG-4 fixes the direction of expected-message reads
// and this route touches no registry row
// (docs/spec_topics/diagnostics/diagnostic-shape.md §"Diagnostic message
// anchors"); §Fix constraint 4 records that `theta/parse/default-not-literal`'s
// row (code-registry-parse.md) names no access form in either cell, so no
// registry edit is owed and DIAG-4 stays untouched.

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

// ===========================================================================
// Corpus readers. Every failure names its unmet precondition and throws; a
// missing file, a renamed heading or a vanished bullet must never let a
// conformance cell range over an empty string and pass vacuously.
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
 * required token appearing in unrelated prose elsewhere on the page — both
 * grammar pages say "member access" in several other sections.
 */
function section(text: string, heading: string, rel: string): string {
  const start = text.indexOf(`\n${heading}\n`);
  if (start < 0) {
    throw new Error(
      `harness: ${rel} carries no heading ${JSON.stringify(heading)}, so the forbidden-inside-a-literal region this cell scopes to does not exist`,
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

/** A file's line count, trailing newline not counted as a line. */
function lineCount(text: string): number {
  const lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.length;
}

/**
 * The one top-level `- ` list item of `region` whose text matches `want`,
 * continuation lines (indented wraps) included. Uniqueness is asserted so a
 * list rewritten into more items reds by naming that rather than by silently
 * reading the wrong bullet.
 */
function bullet(region: string, want: RegExp, rel: string, label: string): string {
  const lines = region.split("\n");
  const items: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] as string;
    if (!/^- /.test(line)) continue;
    const parts = [line];
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j] as string;
      if (next.trim().length === 0 || !/^\s/.test(next)) break;
      parts.push(next);
    }
    items.push(parts.join("\n"));
  }
  const hits = items.filter((it) => want.test(it));
  if (hits.length !== 1) {
    throw new Error(
      `harness: ${rel} must carry exactly one ${label} bullet matching ${String(want)}; found ${hits.length}: ${JSON.stringify(hits)}`,
    );
  }
  return hits[0] as string;
}

// ===========================================================================
// The two corpus sites and the sections that carry the closed forbidden list,
// plus the naming authority the relabel must draw both names from.
// ===========================================================================

const SPEC_GRAMMAR = "docs/spec_topics/grammar.md";
const REF_GRAMMAR = "docs/reference/grammar.md";
const EXPRESSIONS = "docs/spec_topics/expressions.md";
const GLOSSARY = "docs/spec_topics/glossary.md";

/** docs/spec_topics/grammar.md:7 — supplies the `#theta-literal-sublanguage` anchor. */
const SPEC_HEADING = "## Theta literal sublanguage";
/** docs/reference/grammar.md — the mirror's section carrying the same list. */
const REF_HEADING = "## Theta literal sublanguage";
/** The mirror page's own definition of the term, in a different section. */
const REF_DEFINITION_HEADING = "## Expression sublanguage";
/** docs/spec_topics/expressions.md:5 — the naming authority for both forms. */
const SUPPORTED_FORMS = "## Supported forms";

/** §Fix constraint 3's pins: 74 inbound citations name line numbers above 54. */
const SPEC_GRAMMAR_LINES = 223;
const REF_GRAMMAR_LINES = 697;

/** expressions.md:10's name for the bracket form; the name the bullet lacks. */
const INDEXED_ACCESS = /indexed access/i;

/** Locators for the bullet under test on each page. */
const SPEC_BULLET = /Member access on anything other than/;
const REF_BULLET = /^- Forbidden inside a literal/;

/**
 * docs/spec_topics/grammar.md:50–:53 — the four sibling bullets of the same
 * list, which §Fix constraint 2 requires to stay byte-identical.
 */
const SIBLING_BULLETS = [
  '- Identifier references other than `Ident "." Ident` against an enum (no parameter references, no `let`-bound names, no function names).',
  "- Operators other than the unary `-` carve-out for numeric literals (no `+`, no `&&`, no comparison, no ternary).",
  "- Function and tool calls (no `f(x)`, no `<tool>(args)`).",
  "- Template interpolation `${...}` and `@`...`` query templates.",
] as const;

/** §Fix constraint 2 — the three quoted expressions the bullet must keep. */
const PINNED_SPELLINGS = ["`obj.field`", "`arr[i]`", "`Enum.Variant`"] as const;

// ===========================================================================
// (A) The behaviour anchor — GREEN at HEAD, and the asymmetry §(B)'s edit must
// state rather than change. `parseDoc` (tests/helpers/e2e-s1.ts) wraps the
// shipped `parseThetaDocument` with an inert system-note seam; nothing under
// assertion is stubbed.
// ===========================================================================

/** A minimal document whose sole `params:` default is `rhs`. */
function paramsDefault(rhs: string, opts: { enumInScope: boolean }): string {
  const type = opts.enumInScope ? "Sev" : "string";
  const body = opts.enumInScope ? "enum Sev { High, Low }\n" : "";
  return `---\ndescription: d\nmode: prompt\nparams:\n  x: ${type} = ${rhs}\n---\n${body}"ok"\n`;
}

/** The distinct diagnostic codes a `params:` default parses to. Codes only (DIAG-4). */
function defaultCodes(rhs: string, opts: { enumInScope: boolean }): string[] {
  return codes(parseDoc(paramsDefault(rhs, opts)).diagnostics);
}

/** The code the closed forbidden list is enforced through (code-registry-parse.md). */
const NOT_LITERAL = "theta/parse/default-not-literal";

describe("bug 0049 (A) — the carve-out is the dot form's alone: the asymmetry the relabel must preserve", () => {
  it("A1: `Sev.High` is admitted while `Sev[\"High\"]` is rejected, with the enum in scope", () => {
    // src/parser/literal-sublanguage.ts:553 (`case "member":` — "`Enum.Variant`
    // only — the head must be a bare identifier") admits the dot spelling; the
    // `default:` arm at :572 rejects every `index` node unconditionally. So the
    // head's "on anything other than `Enum.Variant`" clause names an exception
    // that the bracket form does not have — the report's discriminator between
    // its two readings, and the reason the relabel must keep the clause on the
    // member-access half.
    expect(
      defaultCodes("Sev.High", { enumInScope: true }),
      "`Sev.High` at a `params:` default must parse clean: it is the `Enum.Variant` carve-out the bullet's head excepts",
    ).toEqual([]);
    expect(
      hasCode(parseDoc(paramsDefault('Sev["High"]', { enumInScope: true })).diagnostics, NOT_LITERAL),
      `\`Sev["High"]\` must be rejected with ${NOT_LITERAL}: the carve-out does not reach the bracket spelling, so a single head word would carry a dot-form exception onto a form that has none`,
    ).toBe(true);
  });

  it("A2: `arr[i]` — the bullet's own bracket example — is rejected by the is-literal check", () => {
    // The spelling docs/spec_topics/grammar.md:54 parenthesises, and the one
    // docs/spec_topics/expressions.md:10 names "Indexed access". The rule the
    // bullet states is correct; only the name it heads that spelling with is
    // under adjudication, so this cell is green before and after.
    expect(
      hasCode(parseDoc(paramsDefault("arr[i]", { enumInScope: false })).diagnostics, NOT_LITERAL),
      `\`arr[i]\` must be rejected with ${NOT_LITERAL} — the bullet's rule is enforced for the bracket half regardless of what the head calls it`,
    ).toBe(true);
  });
});

// ===========================================================================
// (B) Corpus conformance — RED at HEAD. Each cell scopes to the section that
// carries the closed forbidden list and asserts that the bullet naming the
// bracket spelling carries the naming authority's name for that form.
// ===========================================================================

describe("bug 0049 (B) — the forbidden-inside-a-literal bullet names indexed access, not member access alone", () => {
  it("B1: docs/spec_topics/grammar.md §Theta literal sublanguage's bullet names indexed access", () => {
    // The bullet parenthesises `arr[i]` under the head "Member access", the
    // name docs/spec_topics/expressions.md:9 assigns to `a.b`; :10 gives the
    // bracket form its own name. §Fix disposition 1 rewrites the head so it
    // names BOTH forms in the authority's vocabulary, coining no term.
    const region = section(corpus(SPEC_GRAMMAR), SPEC_HEADING, SPEC_GRAMMAR);
    const item = bullet(region, SPEC_BULLET, SPEC_GRAMMAR, "forbidden-access");
    expect(
      flat(item),
      `${SPEC_GRAMMAR} ${SPEC_HEADING} — this bullet heads the bracket spelling \`arr[i]\` with the member-access name alone. docs/spec_topics/expressions.md:9 ("Member access: \`a.b\`") and docs/spec_topics/expressions.md:10 ("Indexed access: \`a["b"]\`, \`a[0]\`, \`a[i]\`") are the naming authority and keep the two forms apart; the glossary defines neither, so no wider term exists. Per §Fix disposition 1 the bullet must also carry the name "indexed access". Bullet read: ${JSON.stringify(item)}`,
    ).toMatch(INDEXED_ACCESS);
  });

  it("B2: docs/reference/grammar.md's mirror clause names indexed access too", () => {
    // §Fix constraint 5: the mirror move is part of the resolution, not after
    // it. This page defines the term for itself under §Expression sublanguage
    // ("member access `a.b` … indexed access `a[k]`") and then uses it in the
    // forbidden list of its §Theta literal sublanguage, so once the spec topic
    // states the rule over two forms the mirror either states it over two forms
    // as well or the divergence is recorded.
    const text = corpus(REF_GRAMMAR);
    section(text, REF_DEFINITION_HEADING, REF_GRAMMAR); // loud if the definition site vanished
    const region = section(text, REF_HEADING, REF_GRAMMAR);
    const item = bullet(region, REF_BULLET, REF_GRAMMAR, "forbidden-inside-a-literal");
    expect(
      flat(item),
      `${REF_GRAMMAR} ${REF_HEADING} — the mirror's forbidden-inside-a-literal restatement must move with the spec topic's bullet and name "indexed access" (§Fix constraint 5). Bullet read: ${JSON.stringify(item)}`,
    ).toMatch(INDEXED_ACCESS);
  });
});

// ===========================================================================
// (C) The no-over-reach guards — GREEN at HEAD and after. Each pins something
// §Fix forbids the resolution from moving; none presupposes §(B) having landed.
// ===========================================================================

describe("bug 0049 (C) — what the relabel must not move", () => {
  it("C1: the naming authority stays put and coins no glossary term", () => {
    // §Fix constraint 1: any reword draws its names from expressions.md
    // §Supported forms, and no new access-form term enters the corpus without
    // an entry there (and in the glossary if it is meant as a glossary term).
    const forms = section(corpus(EXPRESSIONS), SUPPORTED_FORMS, EXPRESSIONS);
    expect(
      bullet(forms, /^- Member access:/, EXPRESSIONS, "member-access-authority"),
      `${EXPRESSIONS} ${SUPPORTED_FORMS} — the "Member access: \`a.b\`" bullet is the authority for the dot form's name and must not move`,
    ).toContain("`a.b`");
    expect(
      bullet(forms, /^- Indexed access:/, EXPRESSIONS, "indexed-access-authority"),
      `${EXPRESSIONS} ${SUPPORTED_FORMS} — the "Indexed access:" bullet is the authority for the bracket form's name and is where §(B)'s name comes from`,
    ).toContain("`a[i]`");
    const glossary = flat(corpus(GLOSSARY));
    expect(
      glossary.includes("member access") || glossary.includes("indexed access"),
      `${GLOSSARY} defines neither term today, which is why ${EXPRESSIONS} ${SUPPORTED_FORMS} is the authority. A resolution that coins a superordinate (e.g. "postfix access") would owe an entry here and in the authority; adding one silently is the over-reach this cell guards`,
    ).toBe(false);
  });

  it("C2: the four sibling bullets of the forbidden list survive byte-identical", () => {
    // §Fix constraint 2: the other four bullets (docs/spec_topics/grammar.md:50–53)
    // stay byte-identical.
    // Only the fifth is under adjudication.
    const region = section(corpus(SPEC_GRAMMAR), SPEC_HEADING, SPEC_GRAMMAR);
    for (const sibling of SIBLING_BULLETS) {
      expect(
        region,
        `${SPEC_GRAMMAR} ${SPEC_HEADING} — sibling bullet must survive byte-identical (§Fix constraint 2): ${JSON.stringify(sibling)}`,
      ).toContain(sibling);
    }
  });

  it("C3: the three quoted spellings survive and the carve-out stays on the member-access half", () => {
    // §Fix constraint 2 pins `obj.field`, `arr[i]` and `Enum.Variant`, the last
    // being the same spelling as the `NamedValueLit` production comment. The
    // ordering conjunct is the report's discriminator, mechanised: the
    // exception belongs to the dot form (A1), so in a two-name head the
    // "other than `Enum.Variant`" clause must sit before the indexed-access
    // name — §Fix's own example wording does exactly that. Before §(B) lands
    // the page carries no indexed-access name and the conjunct is inert, so
    // this cell is green in both directions.
    const region = section(corpus(SPEC_GRAMMAR), SPEC_HEADING, SPEC_GRAMMAR);
    const item = bullet(region, SPEC_BULLET, SPEC_GRAMMAR, "forbidden-access");
    for (const spelling of PINNED_SPELLINGS) {
      expect(
        item,
        `${SPEC_GRAMMAR} ${SPEC_HEADING} — the bullet must keep the quoted spelling ${spelling} (§Fix constraint 2); it is what the rule rejects and excepts`,
      ).toContain(spelling);
    }
    const text = flat(item);
    const carveOut = text.indexOf("other than `enum.variant`");
    expect(
      carveOut,
      `${SPEC_GRAMMAR} ${SPEC_HEADING} — the bullet must keep an "other than \`Enum.Variant\`" carve-out clause; it is the one production the is-literal check admits (A1)`,
    ).toBeGreaterThanOrEqual(0);
    const indexed = text.search(INDEXED_ACCESS);
    if (indexed >= 0) {
      expect(
        carveOut < indexed,
        `${SPEC_GRAMMAR} ${SPEC_HEADING} — the bullet now names indexed access, so the \`Enum.Variant\` carve-out must stay scoped to the member-access half that precedes it: \`Sev["High"]\` is rejected (A1), so no exception may read onto the bracket form. Bullet read: ${JSON.stringify(item)}`,
      ).toBe(true);
    }
  });

  it("C4: both grammar pages keep their exact line counts", () => {
    // §Fix constraint 3: `rg -n "grammar\\.md:[0-9]+"` returns 74 citing lines
    // and every line number above 54 drifts if the bullet gains or loses a
    // line. A resolution is an in-place rewrite, or it re-pins the inbound
    // citations in the same commit.
    expect(
      lineCount(corpus(SPEC_GRAMMAR)),
      `${SPEC_GRAMMAR} must stay ${SPEC_GRAMMAR_LINES} lines: 74 inbound citations name line numbers, and every number above 54 drifts if the forbidden bullet gains or loses a line. A resolution is an in-place, line-count-preserving rewrite unless it re-pins those citations in the same commit (§Fix constraint 3)`,
    ).toBe(SPEC_GRAMMAR_LINES);
    expect(
      lineCount(corpus(REF_GRAMMAR)),
      `${REF_GRAMMAR} must stay ${REF_GRAMMAR_LINES} lines: the mirror move (§Fix constraint 5) rewrites a clause in place, so it too preserves the line count unless it re-pins the citations naming this page`,
    ).toBe(REF_GRAMMAR_LINES);
  });
});
