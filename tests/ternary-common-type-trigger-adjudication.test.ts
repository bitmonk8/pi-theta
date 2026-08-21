import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { Block, Expr, Stmt, ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0155 — the ternary is ADJUDICATED OUT of the common-type rules that carry
// an array-literal *Trigger*, and the corpus must stop saying otherwise
// (docs/bugs/0155-ternary-common-type-unenforced-trigger-conflict.md, §Fix route
// (b)).
//
// THE LAW THIS FILE ENFORCES.
//
//   1. DIAG-2 (docs/spec_topics/diagnostics/diagnostic-shape.md, "**The registry
//      is closed.** Adding a new code, removing a code, or changing a code's
//      namespace, severity, or trigger are all spec changes") makes the
//      *Trigger* column the normative statement of a code's emission set.
//   2. The registered *Trigger* of `theta/parse/array-element-type-mismatch`
//      ("Array literal element does not type-check against the surrounding
//      sink's element type.") and of `theta/parse/array-no-common-type` ("Array
//      literal whose elements have no common type and no sink to narrow
//      against.") each name an **Array literal** and nothing else.
//   3. Therefore common-type rule 1 (the sink half) and rule 3 (the
//      object-schema refusal) are ARRAY-LITERAL-ONLY. Only rule 2 — the
//      least-upper-bound / union computation, which draws no code — governs
//      ternary branches.
//   4. A ternary emits no code of its own. Its two branches reduce to their
//      common type and the ENCLOSING site reports through its own registered
//      code: `theta/parse/let-rhs-type-mismatch`,
//      `theta/parse/fn-arg-type-mismatch`, `theta/parse/object-field-type-mismatch`.
//   5. When both branches are object schemas with no dominating member (rule
//      3's set), the reduction is the FIRST branch — `#commonType`'s
//      `?? candidates[0]` (src/parser/static-type-inference.ts:497). The
//      resulting branch-order dependence and the un-narrowed object sinks are
//      ACCEPTED BY RULE under this adjudication; no code is added or removed
//      anywhere in `src/`.
//
// THE CELLS.
//
//   Group (A) — CORPUS CONFORMANCE. A1 is the control: the two registered
//   *Trigger* cells, which are the normative statement every other A cell is
//   measured against. A2–A5 assert that the four prose sites stop stating the
//   other side of the conflict — TYPE-9 and its mirror must not route a ternary
//   to either array code, and rules 1 and 3 must carry an array-literal-only
//   scope marker in both the spec page and its reference mirror. A2–A5 are RED
//   until the route-(b) corpus edits land.
//
//   Group (B) — BEHAVIOUR PINS, green before and after. Every row is the WHOLE
//   unfiltered diagnostic list in emission order, measured at this HEAD through
//   the house driver `parseDoc` (tests/helpers/e2e-s1.ts:39) over the shipped
//   `parseThetaDocument`. They are the adjudication's observable: nothing at a
//   ternary, everything at the enclosing site.
//
//   Group (C) — STRUCTURAL / *Trigger*-FIDELITY pins. `checkCommonType`
//   (src/parser/type-compat.ts:581) has exactly ONE call site in `src/` and it
//   is inside `checkArrayLiteral` (src/parser/type-layer-checks.ts:2039, call at
//   :2054). A second caller means the emission set moved outside the registered
//   *Trigger*.
//
// SCOPE BOUNDARIES, held deliberately. This file asserts NOTHING about
// `docs/reference/type-system.md`'s "`match` arms and inferred theta/`fn` return
// types use the same LUB discipline" sentence or about
// `docs/spec_topics/functions.md` FN-3 (bug 0158's subject), and nothing about
// `docs/spec_topics/control-flow.md`'s empty-array claims (bug 0195's subject).
// The rule-block extraction below stops at the numbered list precisely so the
// LUB-discipline sentence stays out of reach.
//
// TIER — unit, offline, provider-free, deterministic. Every group (B) cell
// settles inside one `parseThetaDocument` call; groups (A) and (C) are
// `readFileSync` reads of the corpus and of `src/`, the pattern
// tests/code-registry.test.ts establishes for reading the spec pages through
// `new URL(..., import.meta.url)`. Nothing here crosses a provider, a model, a
// child process or the network, so an integration tier would add a session
// round-trip to a parse-time observable and a live tier would make a fully
// determined observable stochastic.
//
// NO SILENT SKIPPING (CLAUDE.md). Nothing early-returns or branches on the
// environment. Every corpus/`src` anchor this file locates throws by name when
// it is absent, so a page that was restructured out from under a cell fails
// loudly instead of asserting over an empty string. Every group (B) absence cell
// first runs a loud precondition asserting the fixture really parsed to the
// ternaries, array literals and constructions whose silence it measures.

// ===========================================================================
// Corpus readers.
// ===========================================================================

function corpus(relative: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../${relative}`, import.meta.url)),
    "utf8",
  );
}

const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";
const EXPRESSIONS_PAGE = "docs/spec_topics/expressions.md";
const TYPE_SYSTEM_PAGE = "docs/spec_topics/type-system.md";
const TYPE_SYSTEM_MIRROR = "docs/reference/type-system.md";

const NO_COMMON_TYPE_CODE = "theta/parse/array-no-common-type";
const ELEMENT_MISMATCH_CODE = "theta/parse/array-element-type-mismatch";

interface RegistryRow {
  readonly code: string;
  readonly trigger: string;
}

const REGISTRY = parseRegistry(corpus(REGISTRY_PAGE)) as RegistryRow[];

/** The registered *Trigger* of `code` — the DIAG-2 oracle for this file. */
function trigger(code: string): string {
  const row = REGISTRY.find((r) => r.code === code);
  if (row === undefined) {
    throw new Error(
      `harness: ${REGISTRY_PAGE} carries no row for ${code} — the *Trigger* column is this file's normative oracle (DIAG-2, diagnostic-shape.md "The registry is closed"), so a missing row is a harness failure, never a skip`,
    );
  }
  return row.trigger;
}

/**
 * The text between `startAnchor` and the next `endPattern` (or the end of file).
 *
 * A missing `startAnchor` throws naming the page and the anchor: the extraction
 * is what scopes an assertion to one sentence, so a silently-empty slice would
 * turn a conformance cell into a vacuous pass.
 */
function sliceFrom(
  page: string,
  text: string,
  startAnchor: string,
  endPattern: RegExp,
): string {
  const start = text.indexOf(startAnchor);
  if (start < 0) {
    throw new Error(
      `harness: ${page} no longer contains the anchor ${JSON.stringify(startAnchor)}, so this cell cannot locate the sentence it governs — re-anchor the cell rather than letting it pass over an empty slice`,
    );
  }
  const rest = text.slice(start);
  const end = rest.slice(startAnchor.length).search(endPattern);
  return end < 0 ? rest : rest.slice(0, startAnchor.length + end);
}

// ===========================================================================
// Parse harness — the shipped whole-file entry point, plus the AST anchors that
// make every absence cell non-vacuous.
// ===========================================================================

/** Frontmatter every fixture parses under. */
const FM = "---\nmode: prompt\n---\n";

/** The two distinct named object schemas rule 3's refusal is written about. */
const A_B_SCHEMAS = "schema A {\n  a: integer\n}\nschema B {\n  b: string\n}\n";

function parse(src: string): ThetaDocument {
  return parseDoc(FM + src, "bug0155.theta");
}

/**
 * Every diagnostic rendered `severity code @range: message`, in emission order.
 *
 * The range is included because the adjudication's claim is positional as much
 * as it is textual: the enclosing site reports at the enclosing site's own
 * range, never at a branch of the ternary.
 */
function hitsOf(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => {
    const r = d.range;
    const at = r
      ? ` @${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`
      : "";
    return `${d.severity} ${d.code}${at}: ${d.message}`;
  });
}

interface Anchors {
  readonly arrayWidths: readonly number[];
  readonly ternaries: number;
  readonly callees: readonly string[];
  readonly ctors: readonly string[];
}

/** Every construct this file's preconditions count, collected in one walk. */
function anchorsOf(doc: ThetaDocument): Anchors {
  const arrayWidths: number[] = [];
  const callees: string[] = [];
  const ctors: string[] = [];
  let ternaries = 0;
  const walkExpr = (e: Expr): void => {
    switch (e.kind) {
      case "array":
        arrayWidths.push(e.elements.length);
        for (const el of e.elements) walkExpr(el);
        return;
      case "object":
        ctors.push(e.typeName ?? "<bare>");
        for (const f of e.fields) walkExpr(f.value);
        return;
      case "ternary":
        ternaries += 1;
        walkExpr(e.condition);
        walkExpr(e.consequent);
        walkExpr(e.alternate);
        return;
      case "binary":
        walkExpr(e.left);
        walkExpr(e.right);
        return;
      case "member":
        walkExpr(e.target);
        return;
      case "call":
        callees.push(e.callee);
        for (const a of e.args) walkExpr(a);
        return;
      case "method-call":
        walkExpr(e.target);
        for (const a of e.args) walkExpr(a);
        return;
      case "index":
        walkExpr(e.target);
        walkExpr(e.index);
        return;
      case "try":
        walkExpr(e.operand);
        return;
      case "match":
        walkExpr(e.scrutinee);
        for (const arm of e.arms) walkExpr(arm.body);
        return;
      default:
        return;
    }
  };
  const walkBlock = (b: Block): void => {
    for (const s of b.statements) walkStmt(s);
    if (b.tail !== null) walkExpr(b.tail);
  };
  const walkStmt = (s: Stmt): void => {
    switch (s.kind) {
      case "let":
        if (s.init !== null) walkExpr(s.init);
        return;
      case "expr":
        walkExpr(s.expr);
        return;
      case "fn":
        walkBlock(s.body);
        return;
      default:
        return;
    }
  };
  walkBlock(doc.body);
  return { arrayWidths, ternaries, callees, ctors };
}

interface Precondition {
  readonly arrayWidths?: readonly number[];
  readonly ternaries?: number;
  readonly callees?: readonly string[];
  readonly ctors?: readonly string[];
}

/** Assert, by name, that the parsed fixture holds the constructs `cell` measures. */
function precondition(doc: ThetaDocument, cell: string, want: Precondition): void {
  const got = anchorsOf(doc);
  const payload = JSON.stringify(hitsOf(doc));
  if (want.arrayWidths !== undefined) {
    expect(
      got.arrayWidths,
      `PRECONDITION (${cell}): the fixture must parse to array literals of widths ${JSON.stringify(want.arrayWidths)}, outer-first, or the assertion below measures a source with no array literal in it. Diagnostics: ${payload}`,
    ).toEqual(want.arrayWidths);
  }
  if (want.ternaries !== undefined) {
    expect(
      got.ternaries,
      `PRECONDITION (${cell}): the fixture must parse to exactly ${want.ternaries} ternary expression(s), or the assertion below measures a source with no ternary in it. Diagnostics: ${payload}`,
    ).toBe(want.ternaries);
  }
  if (want.callees !== undefined) {
    expect(
      got.callees,
      `PRECONDITION (${cell}): the fixture must parse to calls of ${JSON.stringify(want.callees)}, or the assertion below measures a source with no call in it. Diagnostics: ${payload}`,
    ).toEqual(want.callees);
  }
  if (want.ctors !== undefined) {
    expect(
      got.ctors,
      `PRECONDITION (${cell}): the fixture must parse to the object constructions ${JSON.stringify(want.ctors)}, or the assertion below measures a source that constructs no schema value. Diagnostics: ${payload}`,
    ).toEqual(want.ctors);
  }
}

// ===========================================================================
// Group (A) — corpus conformance. A1 is the normative control; A2–A5 assert the
// corpus stops stating the other side of the conflict.
// ===========================================================================

describe("bug 0155 (A) — the corpus states one side of the *Trigger* only", () => {
  it("A1 (control): both registered *Triggers* name an Array literal and no ternary", () => {
    // The normative statement every other cell in this file is measured
    // against. DIAG-2 (diagnostic-shape.md, "The registry is closed") makes the
    // *Trigger* column the definition of each code's emission set, so these two
    // cells are what put a ternary outside rule 1 and rule 3.
    for (const code of [ELEMENT_MISMATCH_CODE, NO_COMMON_TYPE_CODE]) {
      const registered = trigger(code);
      expect(
        registered,
        `A1 — ${code}'s registered *Trigger* must name an "Array literal" as its subject; DIAG-2 makes this cell the normative statement of the code's emission set, and every other cell in this file reads it as such. Registered *Trigger*: ${JSON.stringify(registered)}`,
      ).toContain("Array literal");
      expect(
        registered.toLowerCase(),
        `A1 — ${code}'s registered *Trigger* must not admit a ternary; widening it is a DIAG-2 registry change, which route (b) of bug 0155 does not make. Registered *Trigger*: ${JSON.stringify(registered)}`,
      ).not.toContain("ternary");
    }
  });

  it("A2: TYPE-9 does not route a ternary to either array code", () => {
    // `docs/spec_topics/type-system.md` TYPE-9 names five sites that report
    // their own parse-time diagnostic. Under this adjudication a ternary is not
    // one of them: its branches reduce and the ENCLOSING site reports through
    // its own registered code (group (B) rows s1, u2, u3, L2, L4 measure that
    // route). A TYPE-9 paragraph that names either array code puts a ternary
    // inside an emission set the registered *Trigger* excludes.
    const text = corpus(TYPE_SYSTEM_PAGE);
    const paragraph = sliceFrom(TYPE_SYSTEM_PAGE, text, "**TYPE-9.**", /\n\n/);
    for (const code of [NO_COMMON_TYPE_CODE, ELEMENT_MISMATCH_CODE]) {
      expect(
        paragraph,
        `A2 — TYPE-9 (${TYPE_SYSTEM_PAGE}) routes a ternary to \`${code}\`, whose registered *Trigger* is ${JSON.stringify(trigger(code))} — a ternary is not an array literal, so the two sentences cannot both stand (DIAG-2, the registry is closed). Offending paragraph: ${JSON.stringify(paragraph)}`,
      ).not.toContain(code);
    }
  });

  it("A3: the TYPE-9 mirror bullet does not route a ternary to either array code", () => {
    // The reference mirror repeats TYPE-9's routing in bullet form. A mirror
    // that keeps the routing after the spec page drops it leaves the corpus
    // still stating both sides.
    const text = corpus(TYPE_SYSTEM_MIRROR);
    const bullet = sliceFrom(TYPE_SYSTEM_MIRROR, text, "- **TYPE-9.**", /\n- \*\*/);
    for (const code of [NO_COMMON_TYPE_CODE, ELEMENT_MISMATCH_CODE]) {
      expect(
        bullet,
        `A3 — the TYPE-9 mirror bullet (${TYPE_SYSTEM_MIRROR}) routes a ternary to \`${code}\`, whose registered *Trigger* is ${JSON.stringify(trigger(code))}. Offending bullet: ${JSON.stringify(bullet)}`,
      ).not.toContain(code);
    }
  });

  it("A4: rule 3 is scoped to array literals, and the scoping sentence no longer scopes all three rules to ternary branches", () => {
    // Two sentences on `docs/spec_topics/expressions.md`.
    //
    // The scoping sentence opens the numbered block. While it reads "for array
    // literals (and ternary branches)" and "the array-and-ternary case" it
    // scopes ALL THREE rules to a ternary, including rule 1 (whose code is
    // `theta/parse/array-element-type-mismatch`) and rule 3 (whose code is
    // `theta/parse/array-no-common-type`) — both registered against an array
    // literal only. Only rule 2, which draws no code, governs ternary branches.
    //
    // Rule 3's own line must then carry the scope explicitly: an
    // "array literal" marker, so a reader reaching the rule out of context
    // cannot apply it to a ternary.
    const text = corpus(EXPRESSIONS_PAGE);
    const scoping = sliceFrom(
      EXPRESSIONS_PAGE,
      text,
      "*Common-type rules for array literals",
      /\n/,
    );
    for (const phrase of ["(and ternary branches)", "array-and-ternary case"]) {
      expect(
        scoping,
        `A4 — the common-type scoping sentence (${EXPRESSIONS_PAGE}) still carries ${JSON.stringify(phrase)}, which scopes rules 1 and 3 to a ternary; their codes \`${ELEMENT_MISMATCH_CODE}\` and \`${NO_COMMON_TYPE_CODE}\` are registered against ${JSON.stringify(trigger(NO_COMMON_TYPE_CODE))} — an array literal, not a ternary. Offending sentence: ${JSON.stringify(scoping)}`,
      ).not.toContain(phrase);
    }
    const rule3 = sliceFrom(
      EXPRESSIONS_PAGE,
      text,
      "3. Object schemas do not unify implicitly",
      /\n/,
    );
    expect(
      rule3.toLowerCase(),
      `A4 — rule 3 (${EXPRESSIONS_PAGE}) must state its array-literal-only scope with the words "array literal"; it raises \`${NO_COMMON_TYPE_CODE}\`, whose registered *Trigger* is ${JSON.stringify(trigger(NO_COMMON_TYPE_CODE))}, so a rule 3 that reads as scoped to ternary branches asserts an emission set DIAG-2 closes. Offending sentence: ${JSON.stringify(rule3)}`,
    ).toContain("array literal");
  });

  it("A5: the mirror's rules 1 and 3 carry the array-literal-only scope marker", () => {
    // The reference mirror's numbered block. Rule 1 raises
    // `theta/parse/array-element-type-mismatch` and rule 3 raises
    // `theta/parse/array-no-common-type`; both registered *Triggers* name an
    // array literal, so both rules must say so. Rule 2 is deliberately not
    // asserted on — it draws no code and it DOES govern ternary branches.
    //
    // The extraction stops at the numbered list, which keeps the
    // LUB-discipline sentence that follows it (bug 0158's subject) out of this
    // cell's reach.
    const text = corpus(TYPE_SYSTEM_MIRROR);
    const block = sliceFrom(
      TYPE_SYSTEM_MIRROR,
      text,
      "1. With a type sink in scope",
      /\n\n/,
    );
    const items = block.split(/^(?=\d\. )/m).filter((s) => s.trim().length > 0);
    const byIndex = new Map<string, string>(
      items.map((item) => [item.trim().slice(0, 1), item]),
    );
    for (const [index, code] of [
      ["1", ELEMENT_MISMATCH_CODE],
      ["3", NO_COMMON_TYPE_CODE],
    ] as const) {
      const item = byIndex.get(index);
      if (item === undefined) {
        throw new Error(
          `harness: ${TYPE_SYSTEM_MIRROR}'s common-type block no longer carries a numbered item ${index} — re-anchor this cell rather than letting it pass over a missing rule. Block: ${JSON.stringify(block)}`,
        );
      }
      expect(
        item.toLowerCase(),
        `A5 — mirror rule ${index} (${TYPE_SYSTEM_MIRROR}) must state its array-literal-only scope with the words "array literal"; it raises \`${code}\`, whose registered *Trigger* is ${JSON.stringify(trigger(code))}. Offending rule: ${JSON.stringify(item)}`,
      ).toContain("array literal");
    }
  });
});

// ===========================================================================
// Group (B) — the behaviour the adjudication ratifies. Green before and after.
// ===========================================================================

const NO_COMMON_TYPE_AT = (range: string): string =>
  `error ${NO_COMMON_TYPE_CODE} @${range}: array elements have no common type; annotate the binding with array<A | B> or use a single schema`;

describe("bug 0155 (B/a) — the array literal refuses, the ternary does not", () => {
  it("t1: `true ? A{…} : B{…}` draws nothing", () => {
    // Rule 3 is array-literal-only per `theta/parse/array-no-common-type`'s
    // registered *Trigger*, and the implementation follows it: `checkCommonType`
    // is reached only from `checkArrayLiteral` (group (C)). No enclosing sink
    // exists here either, so no site has anything to report.
    const doc = parse(`${A_B_SCHEMAS}let x = true ? A { a: 1 } : B { b: "x" }\n`);
    precondition(doc, "t1", { ternaries: 1, ctors: ["A", "B"] });
    expect(
      hitsOf(doc),
      "t1 — a ternary emits no code of its own and rule 3 does not reach it; the branches reduce to the first candidate and no enclosing site is present to report against.",
    ).toEqual([]);
  });

  it("a1: the array twin refuses under its own registered *Trigger*", () => {
    // The one-token-apart control. This source IS the registered *Trigger*
    // subject — an array literal whose elements have no common type and no sink
    // — so the code fires here and only here.
    const doc = parse(`${A_B_SCHEMAS}let x = [A { a: 1 }, B { b: "x" }]\n`);
    precondition(doc, "a1", { arrayWidths: [2], ctors: ["A", "B"] });
    expect(
      hitsOf(doc),
      `a1 — this source is exactly ${JSON.stringify(trigger(NO_COMMON_TYPE_CODE))}, the registered *Trigger*, so the refusal belongs here; t1's silence is the same rule declining to reach a ternary.`,
    ).toEqual([NO_COMMON_TYPE_AT("10:9-10:35")]);
  });

  it("t1x: the ALIAS-spelled ternary draws nothing", () => {
    // The TYPE-11 unfold path `isObjectBranch` (src/parser/type-compat.ts)
    // reaches. It changes nothing at a ternary: the adjudication is about which
    // NODE KIND the rule scopes to, not about how the branch types are spelled.
    const doc = parse(
      `${A_B_SCHEMAS}schema X = A\nschema Y = B\nfn f(x: X, y: Y): integer {\n  let z = true ? x : y\n  1\n}\n`,
    );
    precondition(doc, "t1x", { ternaries: 1 });
    expect(
      hitsOf(doc),
      "t1x — the alias spelling reaches the same array-literal-only rule 3, so a ternary is silent here for the same reason as t1; a witness built from t1 alone would miss this spelling.",
    ).toEqual([]);
  });

  it("a1x: the ALIAS-spelled array twin refuses", () => {
    const doc = parse(
      `${A_B_SCHEMAS}schema X = A\nschema Y = B\nfn f(x: X, y: Y): integer {\n  let z = [x, y]\n  1\n}\n`,
    );
    precondition(doc, "a1x", { arrayWidths: [2] });
    expect(
      hitsOf(doc),
      `a1x — an array literal under the alias spelling is still ${JSON.stringify(trigger(NO_COMMON_TYPE_CODE))}; the TYPE-11 unfold reaches rule 3 through the array node, never through the ternary.`,
    ).toEqual([NO_COMMON_TYPE_AT("13:11-13:17")]);
  });
});

describe("bug 0155 (B/b) — the enclosing site reports, on the reduced type", () => {
  it("s1: a typed `let` reports its own code against the reduced branch type", () => {
    // The positive statement of what a ternary DOES report: nothing itself. The
    // `let` sink reports `theta/parse/let-rhs-type-mismatch` on the reduced
    // type (`integer`), not per-branch and not at an element index — which is
    // why rule 1's element code has no work to do at a ternary.
    const doc = parse("let y: string = true ? 1 : 2\n");
    precondition(doc, "s1", { ternaries: 1 });
    expect(
      hitsOf(doc),
      "s1 — the enclosing typed `let` reports through its own registered code on the reduced branch type; no per-branch index appears, because `theta/parse/array-element-type-mismatch` is registered against an array literal.",
    ).toEqual([
      "error theta/parse/let-rhs-type-mismatch @4:1-4:29: let binding 'y' initialiser type mismatch: expected string, got integer",
    ]);
  });

  it("s2: an `A` sink over two object branches draws nothing", () => {
    // Rule 3's set reduces to the FIRST branch (`#commonType`'s
    // `?? candidates[0]`, src/parser/static-type-inference.ts:497), which here
    // satisfies the declared `A`, so the `B` branch is never compared. Accepted
    // by rule under this adjudication: rule 3 is array-literal-only, so there is
    // no refusal to arrive and no registered code covers the un-narrowed branch.
    const doc = parse(`${A_B_SCHEMAS}let y: A = true ? A { a: 1 } : B { b: "x" }\n`);
    precondition(doc, "s2", { ternaries: 1, ctors: ["A", "B"] });
    expect(
      hitsOf(doc),
      "s2 — the reduction answers `A`, which satisfies the declared sink, so the enclosing `let` has nothing to report; rule 3's refusal is array-literal-only and no other registered code names this input.",
    ).toEqual([]);
  });

  it("s3: an `A` parameter sink over two object branches draws nothing", () => {
    // The `fn`-argument twin of s2, through
    // `theta/parse/fn-arg-type-mismatch`'s site instead of the `let` site.
    const doc = parse(
      `${A_B_SCHEMAS}fn f(v: A): integer {\n  1\n}\nlet n = f(true ? A { a: 1 } : B { b: "x" })\n`,
    );
    precondition(doc, "s3", { ternaries: 1, callees: ["f"], ctors: ["A", "B"] });
    expect(
      hitsOf(doc),
      "s3 — the argument's reduced type is `A`, which satisfies the declared parameter, so `theta/parse/fn-arg-type-mismatch` does not fire; the un-narrowed `B` branch is accepted by rule.",
    ).toEqual([]);
  });
});

describe("bug 0155 (B/c) — rule 2's LUB does govern ternary branches", () => {
  it("u1: a heterogeneous non-object ternary loads", () => {
    // Rule 2 is the ONE common-type rule that reaches a ternary, and it draws no
    // code: the branches union, so the node has a type and nothing is refused.
    const doc = parse('let x = true ? 1 : "a"\n');
    precondition(doc, "u1", { ternaries: 1 });
    expect(
      hitsOf(doc),
      "u1 — rule 2 computes the union of the branch types, so this ternary has a common type; it draws no code because rule 2 raises none.",
    ).toEqual([]);
  });

  it("u2: the union reaches a typed `let` sink verbatim", () => {
    const doc = parse('let x = true ? 1 : "a"\nlet y: string = x\n');
    precondition(doc, "u2", { ternaries: 1 });
    expect(
      hitsOf(doc),
      "u2 — the enclosing `let` reports through its own code and renders the whole union `integer | string`, receiver first: rule 2's LUB is what a ternary hands its enclosing site.",
    ).toEqual([
      "error theta/parse/let-rhs-type-mismatch @5:1-5:18: let binding 'y' initialiser type mismatch: expected string, got integer | string",
    ]);
  });

  it("u3: the union reaches a `fn` parameter sink verbatim", () => {
    const doc = parse(
      'fn f(s: string): integer {\n  1\n}\nlet x = true ? 1 : "a"\nlet n = f(x)\n',
    );
    precondition(doc, "u3", { ternaries: 1, callees: ["f"] });
    expect(
      hitsOf(doc),
      "u3 — the `fn`-argument site reports through its own registered code on rule 2's union, which is the ternary's whole contribution to the diagnostic.",
    ).toEqual([
      "error theta/parse/fn-arg-type-mismatch @8:11-8:12: fn 'f' argument 0 ('s') type mismatch: expected string, got integer | string",
    ]);
  });

  it("u4: the array control renders the same LUB one container deep", () => {
    const doc = parse(
      'fn f(s: string): integer {\n  1\n}\nlet x = [1, "a"]\nlet n = f(x)\n',
    );
    precondition(doc, "u4", { arrayWidths: [2], callees: ["f"] });
    expect(
      hitsOf(doc),
      "u4 — rule 2 is shared between the array literal and the ternary, so the array spelling renders the same union wrapped in `array<…>`; only rules 1 and 3 differ by node kind.",
    ).toEqual([
      "error theta/parse/fn-arg-type-mismatch @8:11-8:12: fn 'f' argument 0 ('s') type mismatch: expected string, got array<integer | string>",
    ]);
  });
});

describe("bug 0155 (B/d) — the first-branch reduction and its consequences, by rule", () => {
  it("L2: the sink refuses the FIRST branch's type", () => {
    // The reduction of rule 3's set is `candidates[0]`, so the enclosing `let`
    // compares `A` against the declared `B` and reports its own code. The `B`
    // branch that would satisfy the sink is not consulted.
    const doc = parse(
      `${A_B_SCHEMAS}let x = true ? A { a: 1 } : B { b: "x" }\nlet y: B = x\n`,
    );
    precondition(doc, "L2", { ternaries: 1, ctors: ["A", "B"] });
    expect(
      hitsOf(doc),
      "L2 — the enclosing `let` reports on the reduced type `A`; the ternary itself is outside every array-literal *Trigger*, so this is the only site with a code to raise.",
    ).toEqual([
      "error theta/parse/let-rhs-type-mismatch @11:1-11:13: let binding 'y' initialiser type mismatch: expected B, got A",
    ]);
  });

  it("L3: transposing the branches silences the same program", () => {
    // The branch-order dependence, ACCEPTED BY RULE under this adjudication:
    // the reduction is the first branch, so the same two schemas under the same
    // sink refuse in one order and pass in the other. No registered code covers
    // the difference.
    const doc = parse(
      `${A_B_SCHEMAS}let x = true ? B { b: "x" } : A { a: 1 }\nlet y: B = x\n`,
    );
    precondition(doc, "L3", { ternaries: 1, ctors: ["B", "A"] });
    expect(
      hitsOf(doc),
      "L3 — the first branch is now `B`, which satisfies the sink, so nothing reports; the order dependence against L2 is a stated consequence of the first-branch reduction, not an unreported failure of rule 3.",
    ).toEqual([]);
  });

  it("L4: the transposed program refuses against the other sink", () => {
    const doc = parse(
      `${A_B_SCHEMAS}let x = true ? B { b: "x" } : A { a: 1 }\nlet y: A = x\n`,
    );
    precondition(doc, "L4", { ternaries: 1, ctors: ["B", "A"] });
    expect(
      hitsOf(doc),
      "L4 — the reduced type is `B` in this order, so the `A` sink reports through its own code; L2/L3/L4 together pin that the reported type is always the first branch.",
    ).toEqual([
      "error theta/parse/let-rhs-type-mismatch @11:1-11:13: let binding 'y' initialiser type mismatch: expected A, got B",
    ]);
  });

  it("L5: a constructor field declared `A` accepts the reduction", () => {
    // `theta/parse/object-field-type-mismatch` is the enclosing site's own
    // registered code. It compares the reduced type, which is `A`, so it does
    // not fire — the same by-rule acceptance as s2 and s3, at the third sink.
    const doc = parse(
      `${A_B_SCHEMAS}schema P {\n  v: A\n}\nlet p = P { v: true ? A { a: 1 } : B { b: "x" } }\n`,
    );
    precondition(doc, "L5", { ternaries: 1, ctors: ["P", "A", "B"] });
    expect(
      hitsOf(doc),
      "L5 — the field's declared `A` is satisfied by the reduction, so `theta/parse/object-field-type-mismatch` has nothing to report; the ternary contributes no code of its own.",
    ).toEqual([]);
  });

  it("L6: an array literal over two ternaries refuses, once", () => {
    // The array literal is the *Trigger* subject, and its two elements are the
    // two ternaries' reductions (`A` and `B`, written in opposite orders). Rule
    // 3 fires ONCE, at the literal. A ternary-side refusal would add a second
    // diagnostic at a site outside the registered *Trigger*.
    const doc = parse(
      `${A_B_SCHEMAS}let x = [true ? A { a: 1 } : B { b: "x" }, true ? B { b: "y" } : A { a: 2 }]\n`,
    );
    precondition(doc, "L6", {
      arrayWidths: [2],
      ternaries: 2,
      ctors: ["A", "B", "B", "A"],
    });
    expect(
      hitsOf(doc),
      `L6 — exactly one diagnostic, at the array literal, which is ${JSON.stringify(trigger(NO_COMMON_TYPE_CODE))}; the two ternaries reduce to \`A\` and \`B\` and report nothing themselves, so no second diagnostic appears at a site outside that *Trigger*.`,
    ).toEqual([NO_COMMON_TYPE_AT("10:9-10:77")]);
  });
});

// ===========================================================================
// Group (C) — *Trigger* fidelity, read off `src/`. Green before and after.
// ===========================================================================

/** Every `.ts` file under `src/`, recursively. */
function srcFiles(): string[] {
  // Slash-normalised so the `src/`-relative rendering below is identical on
  // POSIX and Windows hosts.
  const root = fileURLToPath(new URL("../src", import.meta.url)).replace(/\\/g, "/");
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = `${dir}/${entry}`;
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".ts")) out.push(full);
    }
  };
  walk(root);
  if (out.length === 0) {
    throw new Error(
      "harness: no `.ts` files found under `src/` — this cell reads the shipped source as its oracle, so an empty scan is a harness failure, never a skip",
    );
  }
  return out;
}

describe("bug 0155 (C) — `checkCommonType` stays inside the registered *Trigger*", () => {
  it("C1: exactly one call site in `src/`, and it is inside `checkArrayLiteral`", () => {
    // `checkCommonType` (src/parser/type-compat.ts) is the function that raises
    // `theta/parse/array-no-common-type` and
    // `theta/parse/array-element-type-mismatch`. Both codes are registered
    // against an array literal, so every call site must be reachable only from
    // an array-literal node. There is one, in `checkArrayLiteral`
    // (src/parser/type-layer-checks.ts), whose three dispatch sites each guard
    // on an `array`-kinded node.
    const callSites: string[] = [];
    for (const file of srcFiles()) {
      const text = readFileSync(file, "utf8");
      if (!text.includes("checkCommonType")) continue;
      // Method headers at class-member indentation, in source order — the map
      // from a call offset to its enclosing symbol. Matching on symbols keeps
      // this cell insensitive to the positional drift bug 0134 covers.
      const members: { name: string; at: number }[] = [];
      const memberRe =
        /^ {2}(?:private |protected |public )?(?:static )?(?:async )?([A-Za-z_#][\w#]*)\s*[(<]/gm;
      for (let m = memberRe.exec(text); m !== null; m = memberRe.exec(text)) {
        members.push({ name: m[1] as string, at: m.index });
      }
      const callRe = /(?<!function )\bcheckCommonType\s*\(/g;
      for (let m = callRe.exec(text); m !== null; m = callRe.exec(text)) {
        const enclosing = members.filter((s) => s.at < (m as RegExpExecArray).index).pop();
        const relative = file.slice(file.lastIndexOf("/src/") + 1);
        callSites.push(`${relative}:${enclosing?.name ?? "<file scope>"}`);
      }
    }
    expect(
      callSites,
      `C1 — \`checkCommonType\` must have exactly one call site in \`src/\`, inside \`checkArrayLiteral\`. A second caller emits \`${NO_COMMON_TYPE_CODE}\` / \`${ELEMENT_MISMATCH_CODE}\` from a node the registered *Trigger* ${JSON.stringify(trigger(NO_COMMON_TYPE_CODE))} does not name, moving the emission set outside the closed registry (DIAG-2). Found: ${JSON.stringify(callSites)}`,
    ).toEqual(["src/parser/type-layer-checks.ts:checkArrayLiteral"]);
  });

  it("C2: `checkArrayLiteral`'s dispatch sites are all array-kinded", () => {
    // The other half of the fidelity claim: the one caller is itself reached
    // only from array-literal positions. All references to `checkArrayLiteral`
    // live in the single file that declares it, so a new dispatcher elsewhere —
    // a ternary arm, say — shows up here as an extra file.
    const referencing = srcFiles()
      .filter((f) => readFileSync(f, "utf8").includes("checkArrayLiteral"))
      .map((f) => f.slice(f.lastIndexOf("/src/") + 1));
    expect(
      referencing,
      `C2 — \`checkArrayLiteral\` must be referenced only by the file that declares it; a reference from another module is a new dispatch path into the array-literal-only codes \`${NO_COMMON_TYPE_CODE}\` / \`${ELEMENT_MISMATCH_CODE}\`. Found: ${JSON.stringify(referencing)}`,
    ).toEqual(["src/parser/type-layer-checks.ts"]);
  });
});
