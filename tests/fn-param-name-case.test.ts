import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0139 — the `fn` PARAMETER-NAME position of the lowercase-first identifier
// rule, and the diagnostic it draws
// (docs/bugs/0139-fn-parameter-name-case-rule-unenforced.md).
//
// THE RULE, written twice. docs/spec_topics/lexical.md:16 requires
// lowercase-first (a lowercase letter, or `_`) for "`let` and `let mut`
// bindings, function parameters, function names, and schema field names", and
// `:18` makes a violation a parse error naming `theta/parse/binding-case-mismatch`.
// The registry row (docs/spec_topics/diagnostics/code-registry-parse.md:19,
// severity `E`) states the same position in its *Trigger*: "Identifier in a
// binding / parameter / fn-name / field-name position does not start with a
// lowercase letter or `_`."
//
// WHERE THE RULE IS ENFORCED. `contextualDiagnostics` (src/lexer/lexer.ts:810)
// covers the three KEYWORD-ADJACENT positions through its `checkName` worker
// (`:814`): the identifier following `let` (past the `mut` skip), following
// `fn`, and following `schema` / `enum`. Its dispatch (`:876–886`) is a keyword
// scan, and a parameter name follows `(` or `,`, so a bracketed parameter list
// is out of that shape's reach without an annotation-skipping walk that
// duplicates the parser — and `contextualDiagnostics`'s own scope note
// (`:806–808`) names full identifier-position coverage a parser-leaf
// obligation.
//
// The `fn` PARAMETER position is therefore enforced at the parser leaf, in
// `parseFn`'s parameter loop (src/parser/theta-document.ts:2151), where the
// name token and its `range` are in hand — the same loop that already reports
// `checkMutModifier`'s verdict on a `mut` modifier at that modifier's own
// range. `FnParam` (`:409–412`) carries no range of its own, so the name
// token's range is the only one a diagnostic at this position can carry, which
// is what makes the range assertions below load-bearing.
//
// THE CONTRACT THIS FILE PINS — bug 0139 §Expected behaviour, one emission and
// no more: for a `fn` parameter whose name starts `[A-Z]`, exactly one
// additional `theta/parse/binding-case-mismatch`, severity `error`, the
// registry *Message* byte-exact, ranged on the PARAMETER NAME TOKEN. The code
// is `E`, so `hasLoadParseError` (src/extension/production-composition.ts)
// refuses to register a theta declaring an uppercase-first `fn` parameter —
// that refusal is the emission's practical consequence.
//
// THE LEDGER — what each group of rows pins:
//   - MUST FIRE, exactly one `theta/parse/binding-case-mismatch`: a1 (the pin,
//     with its range), a2, a3, a4, a5, a6 (with its range), a7, a8, g. They
//     hold the emission across a missing annotation, a call site, a body
//     reference, an interior underscore, the second parameter of a list, a
//     trailing comma, the `subagent fn` form, and the `.thetalib` route.
//   - MUST REPORT BOTH CODES, ordered by column: a12, where the `mut` modifier
//     and the parameter name each draw their own registered code at their own
//     range.
//   - MUST NOT MOVE: a9, a10, a11, a13 (the three keyword-adjacent binding
//     positions plus the `schema`-name twin, which establish the rule is live
//     and the harness reaches it); a14, a15, a16 (the conformant spellings,
//     including the `_` prefix and the `_` discard the rule admits); c1, c2
//     (the two binder classes outside the rule's list).
//
// OVER-REACH TRIPWIRES. c1 and c2 red if enforcement widens past the parameter.
// c2's pattern head carries a second, differently-sourced refusal
// (`theta/parse/capitalised-pattern-head`, from expressions.md's pattern-grammar
// disambiguation via `parsePattern`); the tripwire is that THIS rule's code is
// absent there.
// lexical.md:16's list contains no `for` / `par for` variable and no `match`
// pattern binder, and `WITHHELD_BINDER_TYPE_NAME`'s doc comment
// (src/parser/type-layer-checks.ts:381–387) argues from exactly that exclusion
// when it rejects a casing rule as a source of unspellable binder names. A fix
// that reaches those binders contradicts the spec sentence and breaks that
// premise.
//
// OUT OF SCOPE, deliberately unrowed. The schema-field-name and
// `params:`-field-name positions are measured silent in bug 0139
// §Reproduction (d) and (e) and are named in its §Non-goals; rows for them
// would red permanently against a fix scoped to the parameter. The
// reserved-keyword arm at this same slot (`fn h(let: string)`) is a
// different registered code under a different spec sentence (lexical.md:20);
// its witness is tests/fn-param-name-reserved-keyword.test.ts (bug 0148).
//
// DIAG-4 (docs/spec_topics/diagnostics/diagnostic-shape.md:74) — no asserted
// message string is written out here. Each one is READ from the registry's
// *Message* column through `parseRegistry` / `registryMessage`
// (tools/code-registry/index.js) and the `msg` helper below, so a reworded
// template reds by naming the registry rather than by a bare string mismatch.
// DIAG-2 (`:72`) is not engaged: every code asserted below is registered and
// its *Trigger* already covers the position it fires from, so the
// implementation sits inside the registered set and no table is edited.
//
// ANTI-VACUITY. Fourteen of the nineteen rows expect a non-empty ordered code
// list, so a harness that stopped reaching the lexer or the parser fails
// loudly here rather than turning the five `toEqual([])` rows into silent
// passes. Every code assertion is an ordered whole-list equality over the
// UNFILTERED diagnostics, so neither an extra diagnostic nor a diagnostic
// emitted at the wrong position can hide inside a containment check.
//
// TIER: unit, offline, deterministic, provider-free. Every observable settles
// inside one `parseThetaDocument` call over a source string — there is no
// session, no host, and no model on this path, so an integration tier would add
// a round-trip to a parse-time value and buy no reach, and a live tier would
// make a fully determined value stochastic.
//
// NO SILENT SKIPPING: nothing here early-returns, branches on the environment,
// or conditionally skips. The registry lookup asserts its row's presence before
// the template is used, and the range readers assert their diagnostic's
// presence and locatedness before reading it.

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4).
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];

/**
 * The registry row's normative *Message* template with its named placeholders
 * filled (DIAG-4). Definedness and placeholder presence are asserted first, so
 * a missing row or a reworded template reds by naming the registry rather than
 * by a bare `undefined` comparison. Both codes this file asserts a message for
 * carry no placeholder, so every call below fills none.
 */
function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the Message row for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
}

const BINDING_CASE = "theta/parse/binding-case-mismatch";
const SCHEMA_CASE = "theta/parse/schema-case-mismatch";
const MUT_IMMUTABLE = "theta/parse/mut-on-immutable-context";
/** The pattern-grammar refusal, sourced from expressions.md, not lexical.md:16. */
const PATTERN_HEAD = "theta/parse/capitalised-pattern-head";

// ===========================================================================
// Parse harness.
// ===========================================================================
//
// `parseDoc` (tests/helpers/e2e-s1.ts:39) is the shipped whole-file entry point
// `parseThetaDocument` wrapped in the standard inert deps — an in-band no-op
// system-note channel and a resolving `model:` matcher. No behaviour is
// stubbed: the lexer and parser under assertion are the production ones.

/** Frontmatter for every `.theta` row — occupies lines 1–3, body starts at 4. */
const FM = "---\nmode: prompt\n---\n";

/** Parse `body` as a `.theta` under the standard frontmatter. */
function theta(body: string): ThetaDocument {
  return parseDoc(FM + body);
}

/** The aggregated diagnostic codes, in report order. */
function codesOf(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => d.code);
}

/** Every diagnostic rendered `severity code @l:c-l:c: message` — failure payload. */
function render(doc: ThetaDocument): string {
  return JSON.stringify(
    doc.diagnostics.map((d: Diagnostic) => {
      const r = d.range;
      const at =
        r === undefined
          ? "-"
          : `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
      return `${d.severity} ${d.code} @${at}: ${d.message}`;
    }),
  );
}

/** A 1-indexed, end-exclusive-column source range literal. */
function range(
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number,
): SourceRange {
  return {
    start: { line: startLine, column: startColumn },
    end: { line: endLine, column: endColumn },
  };
}

/** The message reported for `code`, or `undefined` when no diagnostic carries it. */
function messageFor(doc: ThetaDocument, code: string): string | undefined {
  return doc.diagnostics.find((d: Diagnostic) => d.code === code)?.message;
}

/**
 * The range of the single diagnostic carrying `code`. Uniqueness and
 * locatedness are asserted before the read, so an absent, duplicated, or
 * location-less diagnostic reds by naming the row rather than by comparing
 * against `undefined`.
 */
function soleRange(doc: ThetaDocument, code: string): SourceRange {
  const hits = doc.diagnostics.filter((d: Diagnostic) => d.code === code);
  expect(
    hits.length,
    `exactly one ${code} is expected before its range is read; diagnostics=${render(doc)}`,
  ).toBe(1);
  const only = hits[0];
  if (only === undefined) {
    throw new Error(`no ${code} diagnostic to range; diagnostics=${render(doc)}`);
  }
  const r = only.range;
  if (r === undefined) {
    throw new Error(
      `the ${code} diagnostic must be located on the offending token; diagnostics=${render(doc)}`,
    );
  }
  return r;
}

// ===========================================================================
// (a) The defect — an uppercase-first `fn` parameter name.
// ===========================================================================

describe("0139 (a) — an uppercase-first `fn` parameter name is a parse error", () => {
  it("a1: `fn h(P: string): number { 1 }` reports one binding-case-mismatch, ranged on `P`", () => {
    // The pin. Grammar-conformant (`FnParam ::= Ident \":\" Type`,
    // docs/reference/grammar.md:254), one rule violated, so lexical.md:18's
    // disposition applies with nothing else in the way.
    const doc = theta("fn h(P: string): number { 1 }\n");
    expect(
      codesOf(doc),
      `lexical.md:16 puts function parameters in the lowercase-first list and code-registry-parse.md:19's Trigger names the parameter position; diagnostics=${render(doc)}`,
    ).toEqual([BINDING_CASE]);
    expect(
      messageFor(doc, BINDING_CASE),
      "DIAG-4 — the rendered prose is the registry's *Message* column, byte-exact",
    ).toBe(msg(BINDING_CASE, []));

    // The range is the row's real subject: `FnParam` carries no range of its
    // own (src/parser/theta-document.ts:409–412), and the call-site walk that
    // needs a parameter's location borrows the enclosing `fn` declaration's
    // start line instead (`walkCallSiteStmt`'s `case "fn"` arm) — which is why
    // a diagnostic at this position must carry the NAME TOKEN's own range, and
    // why a diagnostic pointing at the `fn` keyword is the low-effort wrong
    // answer this assertion refuses.
    //
    // Derivation. The frontmatter occupies lines 1–3 (`---`, `mode: prompt`,
    // `---`), so the body is line 4. Within `fn h(P: string): number { 1 }` the
    // characters are `f`=1, `n`=2, ` `=3, `h`=4, `(`=5, `P`=6, and columns are
    // 1-indexed on the normalised stream (lexical.md §"Diagnostic spans"). The
    // end column is exclusive, so a one-character name spans 6→7.
    expect(
      soleRange(doc, BINDING_CASE),
      `the diagnostic covers the parameter NAME token, not the \`fn\` keyword; diagnostics=${render(doc)}`,
    ).toEqual(range(4, 6, 4, 7));
  });

  it("a2: `fn h(P): number { 1 }` reports it without a type annotation", () => {
    // The unannotated spelling is separately non-conformant against the
    // grammar's mandatory annotation, which is why a1 and not this row is the
    // pin (bug 0139 §Non-goals). The case rule is independent of the
    // annotation: the name is in binder position either way.
    const doc = theta("fn h(P): number { 1 }\n");
    expect(
      codesOf(doc),
      `the case rule reads the name, not the annotation; diagnostics=${render(doc)}`,
    ).toEqual([BINDING_CASE]);
    expect(messageFor(doc, BINDING_CASE)).toBe(msg(BINDING_CASE, []));
  });

  it("a3: a call site adds nothing to the declaration's single diagnostic", () => {
    // The rule is on the declaration. A reference — here a call binding the
    // result — introduces no second binder position, so the whole-list equality
    // pins one diagnostic and not two.
    const doc = theta('fn h(P: string): number { 1 }\nlet z = h("a")\nz\n');
    expect(
      codesOf(doc),
      `a call site is not a binder position; diagnostics=${render(doc)}`,
    ).toEqual([BINDING_CASE]);
  });

  it("a4: a body that reads the parameter still reports exactly one", () => {
    // `P` in the body is a reference, not a declaration. Two diagnostics here
    // would mean the check is running over identifier OCCURRENCES rather than
    // over the parameter list.
    const doc = theta("fn h(P: string): string { P }\n");
    expect(
      codesOf(doc),
      `the binder is declared once, so the rule fires once; diagnostics=${render(doc)}`,
    ).toEqual([BINDING_CASE]);
  });

  it("a5: `Ab_c` reports it — the rule reads the first letter only", () => {
    // lexical.md:16 accepts both `snake_case` and `lowerCamelCase` and states
    // that "the parser only cares about the first letter", so an interior
    // underscore neither excuses nor doubles the violation.
    const doc = theta("fn h(Ab_c: string): number { 1 }\n");
    expect(
      codesOf(doc),
      `only the first letter is judged; diagnostics=${render(doc)}`,
    ).toEqual([BINDING_CASE]);
  });

  it("a6: the SECOND parameter of a list reports it, ranged on its own name", () => {
    // Per-parameter coverage. A check that stopped after the first parameter,
    // or that ranged every violation on the declaration head, passes the code
    // list and fails here.
    //
    // Derivation. Body on line 4 as in a1. Within
    // `fn h(a: string, B: string): number { 1 }` the `B` is the 17th character
    // (`fn h(a: string, ` is 16 characters), so it spans columns 17→18
    // end-exclusive.
    const doc = theta("fn h(a: string, B: string): number { 1 }\n");
    expect(
      codesOf(doc),
      `the conformant first parameter is silent and the second is not; diagnostics=${render(doc)}`,
    ).toEqual([BINDING_CASE]);
    expect(
      soleRange(doc, BINDING_CASE),
      `the diagnostic covers the offending parameter's own name token; diagnostics=${render(doc)}`,
    ).toEqual(range(4, 17, 4, 18));
  });

  it("a7: a trailing comma in the parameter list changes nothing", () => {
    // `parseFn`'s parameter loop consumes an optional trailing `,` at the end
    // of each iteration and then sees `)`. The check that loop carries must not
    // mint a diagnostic for the absent parameter the trailing comma might
    // suggest.
    const doc = theta("fn h(P: string,): number { 1 }\n");
    expect(
      codesOf(doc),
      `a trailing comma introduces no second parameter; diagnostics=${render(doc)}`,
    ).toEqual([BINDING_CASE]);
  });

  it("a8: the `subagent fn` form reports it", () => {
    // `parseFn` serves both forms through its `subagent` flag
    // (src/parser/theta-document.ts:2151), so the two declaration spellings
    // share one parameter list and one disposition.
    const doc = theta("subagent fn s(P: string) { @`hi` }\n");
    expect(
      codesOf(doc),
      `the subagent modifier does not change the parameter position; diagnostics=${render(doc)}`,
    ).toEqual([BINDING_CASE]);
  });
});

// ===========================================================================
// (a12) The two-code row — the `mut` sibling in the same loop iteration.
// ===========================================================================

describe("0139 (a12) — `mut` and the case rule report together, in source order", () => {
  it("a12: `fn h(mut P: string)` reports the mut code then the case code", () => {
    // The sharpest row. The same loop iteration already emits a per-parameter
    // registered code about this parameter: `parseFn` captures the modifier
    // token (`const mutTok = this.advance()`,
    // src/parser/theta-document.ts:2175) and reports `checkMutModifier`'s
    // verdict at that token's range. The case test reads the name token in the
    // same iteration, so each code carries the range of the thing it judges.
    //
    // The ORDER is a decision, not an accident. Every group funnels through
    // `assembleDiagnostics` (src/diagnostics/diagnostic.ts:123–143), which
    // sorts by (file, line, column) with a stable sort, so the `mut` token's
    // column places it ahead of the parameter name's. Both ranges are pinned
    // below so that rationale is observable rather than taken on faith:
    // within `fn h(mut P: string): number { 1 }`, `mut` starts at column 6 and
    // spans 6→9, and `P` starts at column 10 and spans 10→11.
    const doc = theta("fn h(mut P: string): number { 1 }\n");
    expect(
      codesOf(doc),
      `both registered codes fire on this parameter, ordered by column; diagnostics=${render(doc)}`,
    ).toEqual([MUT_IMMUTABLE, BINDING_CASE]);
    expect(
      soleRange(doc, MUT_IMMUTABLE),
      `the mut diagnostic keeps its own token range; diagnostics=${render(doc)}`,
    ).toEqual(range(4, 6, 4, 9));
    expect(
      soleRange(doc, BINDING_CASE),
      `the case diagnostic sits on the name, to the right of \`mut\`, which is what orders the pair; diagnostics=${render(doc)}`,
    ).toEqual(range(4, 10, 4, 11));
    expect(messageFor(doc, BINDING_CASE)).toBe(msg(BINDING_CASE, []));
  });
});

// ===========================================================================
// (a9)–(a13) The enforced-position controls — the rule is live elsewhere.
// ===========================================================================

describe("0139 (a9)–(a13) — the three enforced positions keep their behaviour", () => {
  it("a9: `let P = 1` reports binding-case-mismatch (control)", () => {
    // The `let` adjacency (src/lexer/lexer.ts:876–882). This row and its two
    // siblings are what make a red above attributable to the parameter
    // position: they prove the code, the message and the harness all work.
    const doc = theta("let P = 1\n");
    expect(
      codesOf(doc),
      `the enforced \`let\` position must not move; diagnostics=${render(doc)}`,
    ).toEqual([BINDING_CASE]);
    expect(messageFor(doc, BINDING_CASE)).toBe(msg(BINDING_CASE, []));
  });

  it("a10: `let mut P = 1` reports binding-case-mismatch (control)", () => {
    // The same adjacency past the `mut` skip (src/lexer/lexer.ts:877–882).
    const doc = theta("let mut P = 1\n");
    expect(
      codesOf(doc),
      `the \`let mut\` position must not move; diagnostics=${render(doc)}`,
    ).toEqual([BINDING_CASE]);
    expect(messageFor(doc, BINDING_CASE)).toBe(msg(BINDING_CASE, []));
  });

  it("a11: `fn H(): number { 1 }` reports binding-case-mismatch (control)", () => {
    // The `fn` NAME adjacency (src/lexer/lexer.ts:883–884) — the position
    // immediately beside the parameter list yet enforced at the other site, and
    // the reason the split is invisible from the spec: which keyword precedes
    // the identifier is the whole discriminator for the lexer's scan.
    const doc = theta("fn H(): number { 1 }\n");
    expect(
      codesOf(doc),
      `the enforced \`fn\` NAME position must not move; diagnostics=${render(doc)}`,
    ).toEqual([BINDING_CASE]);
    expect(messageFor(doc, BINDING_CASE)).toBe(msg(BINDING_CASE, []));
  });

  it("a13: `schema p = string` reports schema-case-mismatch (control)", () => {
    // The PascalCase twin (lexical.md:15), emitted by the same `checkName`
    // helper's other arm (src/lexer/lexer.ts:842–850). It is held here because
    // a fix editing that helper can move it.
    const doc = theta("schema p = string\n");
    expect(
      codesOf(doc),
      `the uppercase-first rule for schema names must not move; diagnostics=${render(doc)}`,
    ).toEqual([SCHEMA_CASE]);
    expect(messageFor(doc, SCHEMA_CASE)).toBe(msg(SCHEMA_CASE, []));
  });
});

// ===========================================================================
// (a14)–(a16) The conformant spellings — the predicate's negative side.
// ===========================================================================

describe("0139 (a14)–(a16) — a conformant parameter name stays clean", () => {
  // The predicate is lexical.md:16's — a lowercase letter OR `_` — which is
  // `checkName`'s existing `first >= "A" && first <= "Z"` test
  // (src/lexer/lexer.ts:832–833), not a `[a-z]` test.
  // `isLowercaseFirstIdentifier` (src/parser/callable-set.ts:443) is the tree's
  // existing regex form of the same rule and reads `^[a-z_]`. a15 and a16 red
  // against a third spelling that forgets the underscore.

  it("a14: `fn h(p: string): number { 1 }` reports nothing", () => {
    const doc = theta("fn h(p: string): number { 1 }\n");
    expect(
      codesOf(doc),
      `a lowercase-first parameter satisfies the rule; diagnostics=${render(doc)}`,
    ).toEqual([]);
  });

  it("a15: an `_`-prefixed parameter reports nothing", () => {
    const doc = theta("fn h(_p: string): number { 1 }\n");
    expect(
      codesOf(doc),
      `lexical.md:16 admits a leading underscore; diagnostics=${render(doc)}`,
    ).toEqual([]);
  });

  it("a16: the `_` discard parameter reports nothing", () => {
    const doc = theta("fn h(_: string): number { 1 }\n");
    expect(
      codesOf(doc),
      `the discard binding is spelled with the admitted underscore; diagnostics=${render(doc)}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// (c) The over-reach tripwires — binder classes outside the rule's list.
// ===========================================================================

describe("0139 (c) — a `for` variable and a `match` binder stay outside the rule", () => {
  // TRIPWIRES, not incidental coverage. lexical.md:16's list is `let` /
  // `let mut` bindings, function parameters, function names, and schema field
  // names; a `for` / `par for` variable and a `match` pattern binder are absent
  // from it, so an uppercase spelling at either position is conformant.
  // `WITHHELD_BINDER_TYPE_NAME`'s doc comment
  // (src/parser/type-layer-checks.ts:381–387) reasons from exactly that
  // exclusion, so a fix that widens into these positions both contradicts the
  // spec sentence and invalidates the withheld-binder premise. A later reader
  // finding c1 red, or finding this rule's code in c2, should widen the fix's
  // scope question, not the rows. c2 does carry
  // `theta/parse/capitalised-pattern-head`: a capitalised pattern HEAD names
  // no admitted pattern production (expressions.md's pattern-grammar
  // disambiguation — lowercase identifiers bind, capitalised ones refer to
  // constructors or schema names — restated for `match` patterns in
  // lexical.md), which is a different sentence enforced at a different site
  // (`parsePattern`'s tail arm) and leaves this rule's list untouched.

  it("c1: `for Y in xs { Y }` reports nothing", () => {
    const doc = theta('let xs: array<string> = ["a"]\nfor Y in xs { Y }\n');
    expect(
      codesOf(doc),
      `a \`for\` variable is not in lexical.md:16's list; diagnostics=${render(doc)}`,
    ).toEqual([]);
  });

  it("c2: a `match` pattern binder `Q` draws only the pattern-head refusal, never this rule's code", () => {
    const doc = theta("let v: integer = 3\nlet r = match v { Q => 1 }\nr\n");
    expect(
      codesOf(doc),
      `a \`match\` pattern binder is not in lexical.md:16's list, so the sole code here is the pattern-grammar refusal from \`parsePattern\`; diagnostics=${render(doc)}`,
    ).toEqual([PATTERN_HEAD]);
  });
});

// ===========================================================================
// (g) The `.thetalib` route.
// ===========================================================================

describe("0139 (g) — a `.thetalib` parameter is held to the same rule", () => {
  it("g: `fn t(P: string): string { P }` in a `.thetalib` reports it", () => {
    // lexical.md:3 applies every rule on that page to `.theta` and `.thetalib`
    // alike, and both extensions reach the same `contextualDiagnostics` call
    // inside `lexTheta` (src/lexer/lexer.ts:125) and the same `parseFn`, so the
    // rule is enforced at one pair of sites rather than two. A `.thetalib`
    // carries no frontmatter, so the body is line 1 here.
    const doc = parseDoc("fn t(P: string): string { P }\n", "lib.thetalib");
    expect(
      codesOf(doc),
      `the rule is extension-independent; diagnostics=${render(doc)}`,
    ).toEqual([BINDING_CASE]);
    expect(messageFor(doc, BINDING_CASE)).toBe(msg(BINDING_CASE, []));
  });
});
