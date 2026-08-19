import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { Block, Expr, Stmt, ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0199 — `TypeLayerWalk.unprovableBindings` (src/parser/type-layer-checks.ts)
// is a `Set<CompatType>` whose membership test is JavaScript object identity,
// and its only read is `provableArgType`'s `ident` arm. The unannotated `let`
// arm of `walkStmt` marks `rhsType` — whatever `typeOf(stmt.init)` returned.
// For a member-read initialiser that object is BORROWED, not minted:
// `collectSchemaFields` builds one `CompatType` per declared field per parse and
// `#memberType`'s declared branch hands it back BY REFERENCE, alias-unfolded. So
// the mark lands on the FIELD, and every later binding that records the same
// field's type tests positive — one `let zs = m.xs` off an erased receiver
// silences the true `theta/parse/fn-arg-type-mismatch` a later `let ws = q.xs`
// over a proven `q: P` owes at `hs(ws)`
// (docs/bugs/0199-let-arm-marks-borrowed-object-suppression.md).
//
// The property this file asserts is that report's §Expected behaviour, stated so
// a fix has a target: A WITHHOLD RECORDED FOR ONE BINDING APPLIES TO THAT
// BINDING ONLY. Groups (a), (b) and (c) are the property's failing half —
// currently `[]`, owed the diagnostic. Group (d) is its non-failing half:
// already correct, and the half that proves a fix RE-KEYED the withhold rather
// than deleting it. Group (e) is the SECOND identity channel the same arm feeds,
// bug 0079's `resultBindings` provenance: it pins NO CHANGE, so a route that
// takes a private object without carrying the membership reds there while
// (a)–(c) go green.
//
// ── WHY THE `let` ARM IS HARDER THAN THE TWO LOOP ARMS ──────────────────────
// Bug 0194 closed the same class at `walkStmt`'s `case "for"` and `walkExpr`'s
// `case "par-for"`, which share `bindLoopElement`: an unproven iterand records
// and marks a fresh structural twin of the element, and the twin inherits any
// `resultBindings` membership the borrowed element carried. Those arms only ever
// INHERIT a membership. The `let` arm is the only site that MINTS one
// (`isCertainResultNode`), and for a `call` to a `Result`-returning `fn` the
// mint and the mark consume the SAME object — group (e) row e1 measures it — so
// a private object here has to carry the inherited membership AND re-point the
// mint. Group (e) is what holds a route to both.
//
// ── SCOPE OF THIS FILE ──────────────────────────────────────────────────────
// Additive. Two committed cells elsewhere move with this defect and neither is
// this file's: cell `d6` of tests/loop-element-withhold-binding-scoped.test.ts,
// which bug 0194 installed as a BOUND on exactly this end state and which bug
// 0199 §Fix (d)(2) authorises flipping, and cell `u13e` of
// tests/fn-arg-type-mismatch-wired.test.ts, the same defect reached through
// `#commonType`'s single-candidate return. Everything else stays where it is —
// in particular cell `L2` of tests/fn-arg-member-read-proof.test.ts and cell
// `d5` of the 0194 witness, which pin the half of the withhold that is correct
// and which row d7 below is this file's own copy of.
//
// ── THE POISONER SHAPE, AND WHY IT IS THE ONE THAT REMAINS ──────────────────
// The mark needs an initialiser that is BOTH unprovable and typed by a borrowed
// object. Bug 0190 made a declared-field read off a PROVEN receiver a proof at
// the fn-argument sink, gated on the receiver itself being proven — so the
// shape that still withholds is an ERASED RECEIVER:
// `let m = flag ? P { xs: [1] } : B { xs: ["a"] }` is not a proven reduction
// (`#commonType` falls back to its first candidate), while `m.xs` still resolves
// against `P` and yields `P.xs`'s own object. That same 0190 rule is what makes
// the VICTIM's read a proof and therefore makes the leak observable at all.
// Every poisoner below is that receiver, a composite containing it, or a `call`.
//
// ── THE THREE SHARED-OBJECT SHAPES ─────────────────────────────────────────
// Group (b) separates them, because the sharing site differs and a fix must
// close all three:
//
//   1. THE ALIAS RIGHT-HAND SIDE — a field declared `xs: L` over
//      `schema L = array<integer>`. `#memberType` returns
//      `unfoldAlias(fields["xs"])` and `unfoldAlias` hands back `decl.rhs`, the
//      `TypeEnv`'s own object. Row b1.
//   2. THE DECLARED-FIELD OBJECT — a field declared inline, with no alias
//      anywhere in the file. `collectSchemaFields` is the whole sharing site.
//      Row b2.
//   3. A PRIMITIVE DECLARED FIELD — the shared object need not be an array, so
//      the suppression is not confined to array-typed argument slots. Row b3.
//
// ── FIX-PRODUCED EMISSION vs REGRESSION PIN ─────────────────────────────────
// RED at HEAD, green under a fix (the property's failing half):
//   (a) a1, a2; (b) b1, b2, b3; (c) c1, c2, c3, c4, c5, c6, c7.
// Green at HEAD and green after (the property's bound in the other direction):
//   (a) a3ctl, a4ctl, a5ctl; (b) b2ctl, b3ctl; (c) c2ctl; (d) d1–d7;
//   (e) e1, e1ctl, e2, e3, e3ctl, e4, e4ctl.
// Row d7 is the sharpest of those: the poisoner's OWN binding stays withheld at
// the sink. A route that greens (a)–(c) by removing the mark reds d7, and that
// red means the withhold was DELETED rather than re-keyed. Rows e1 / e2 are the
// sharpest in the other direction: they red if the private object fails to carry
// bug 0079's membership.
//
// ── TIER: unit, offline, provider-free, deterministic ───────────────────────
// The whole mechanism settles inside one `parseThetaDocument` call: the channel
// is per-parse instance state on the single `TypeLayerWalk` that `checkTypeLayer`
// walks the body with, and its only observable is the document's aggregated
// `diagnostics` list. An INTEGRATION tier would add a session round-trip that
// observes neither the recorded `CompatType` nor the diagnostic list. A LIVE
// tier would put a stochastic model between a fixture and a fully determined
// parse-time verdict; the one question that IS live — an error-severity
// `theta/parse/*` denying registration through the real composition root
// (`hasLoadParseError`) — is a registration-only cell in
// tests/live/live-production-acceptance.test.ts and spends no tokens.
//
// ── HARNESS ─────────────────────────────────────────────────────────────────
// The shared house driver `parseDoc` (tests/helpers/e2e-s1.ts:39), unmodified —
// the real `parseThetaDocument` behind inert offline seams, the entry point the
// report's §Reproduction measured through. Every fixture carries
// `---\nmode: prompt\n---` and a trailing final value.
//
// ── THE DIAGNOSTIC ORACLE: DIAG-4 ───────────────────────────────────────────
// docs/spec_topics/diagnostics/diagnostic-shape.md:74 makes the registry's
// *Message* column normative and requires an asserting test to source its
// expected strings from it. Every message below is read through `parseRegistry`
// + `registryMessage` (tools/code-registry/index.js) and interpolated in ONE
// pass, with an unsupplied or unused placeholder throwing. Registry rows are
// cited by CODE, never by line.
//
// ── NO SILENT SKIPPING (CLAUDE.md) ──────────────────────────────────────────
// Nothing here early-returns, branches on the environment, or skips. A missing
// registry row throws NAMING the row and the page. Every row first asserts its
// whole ordered BINDER-AND-ARGUMENT site list, so a fixture that stopped
// parsing, lost a statement or drifted a line fails its own `PRECONDITION`
// naming the sites it found instead of letting a currently-`[]` row pass while
// measuring nothing. That precondition carries the judged ARGUMENT node's range
// as well as the `let` sites, because this defect's subject is a whole-value
// argument slot rather than a loop element: it therefore pins the exact node the
// owed emission is anchored on, which is what makes each `[]` below a
// suppression rather than a fixture that no longer reaches the sink. Every row
// then asserts its WHOLE ordered code list AND its whole ordered message list,
// so an absent emission, a spurious extra emission and a reordering all red, and
// every row that carries a verdict also pins its RANGE.
//
// ── CITATION POSTURE ────────────────────────────────────────────────────────
// `src/` is cited by SYMBOL throughout, header included — the convention the
// comparable guard-chain witnesses over this same module keep
// (tests/loop-element-withhold-binding-scoped.test.ts for bug 0194,
// tests/params-declared-type-in-type-layer.test.ts for bug 0192), and the one a
// commit that moves this module's own line numbers cannot invalidate. Sibling
// tests are cited by CELL ID and spec pages by line.

// ===========================================================================
// The DIAG-4 oracle.
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live `theta/parse/*` registry page — this file's message oracle. */
const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)), "utf8"),
) as RegistryRow[];

/**
 * A registered code's normative *Message* template. Throws naming the row and
 * the page when it is absent, so a registry drift can never degrade an
 * assertion below into a comparison against `undefined`.
 */
function registered(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: ${REGISTRY_PAGE} carries no Message row for ${code} — the DIAG-4 column (diagnostic-shape.md:74) is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}

/**
 * Interpolate a registered template's `<…>` placeholders from `subs`, in one
 * pass so a substituted value is never re-scanned — `<expected>` legitimately
 * expands to text containing angle brackets (`array<string>`).
 *
 * The placeholder set is derived from the TEMPLATE: an unsupplied placeholder
 * and an unused substitution both throw, so a registry row that changes shape
 * fails loudly here instead of quietly producing a string no emission equals.
 */
function fill(code: string, subs: ReadonlyMap<string, string>): string {
  const template = registered(code);
  const used = new Set<string>();
  const message = template.replace(/<[a-z]+>/g, (token) => {
    const value = subs.get(token);
    if (value === undefined) {
      throw new Error(
        `harness: the ${code} Message template carries placeholder ${token}, which this file supplies no substitution for — the registry row changed shape (${REGISTRY_PAGE})`,
      );
    }
    used.add(token);
    return value;
  });
  for (const token of subs.keys()) {
    if (!used.has(token)) {
      throw new Error(
        `harness: this file substitutes ${token} into the ${code} Message, which no longer carries it — the registry row changed shape (${REGISTRY_PAGE})`,
      );
    }
  }
  return message;
}

const FN_ARG = "theta/parse/fn-arg-type-mismatch";
const LET_RHS = "theta/parse/let-rhs-type-mismatch";
const INTERP_RESULT = "theta/parse/interpolated-result";

/** `fn '<name>' argument <i> ('<param>') type mismatch: expected <expected>, got <actual>` */
function fnArg(
  name: string,
  index: number,
  param: string,
  expected: string,
  actual: string,
): string {
  return fill(
    FN_ARG,
    new Map([
      ["<name>", name],
      ["<i>", String(index)],
      ["<param>", param],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `let binding '<name>' initialiser type mismatch: expected <expected>, got <actual>` */
function letRhs(name: string, expected: string, actual: string): string {
  return fill(
    LET_RHS,
    new Map([
      ["<name>", name],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** The suppressed verdict the whole-array rows are owed: `hs(ws)` over an `L`. */
const HS_MISMATCH = fnArg("hs", 0, "a", "array<string>", "array<integer>");

/** Row b3's verdict — a PRIMITIVE declared field, so neither operand is an array. */
const GS_MISMATCH = fnArg("gs", 0, "s", "string", "integer");

/** Group (e)'s verdict — a placeholder-free *Message*, so the template IS the text. */
const INTERP_MESSAGE = registered(INTERP_RESULT);

// ===========================================================================
// Parse harness.
// ===========================================================================

const FILE = "bug0199.theta";

/** Frontmatter occupies lines 1–3; every fixture body therefore starts at 4. */
const FM = "---\nmode: prompt\n---\n";

function parse(body: string): ThetaDocument {
  return parseDoc(FM + body, FILE);
}

function at(r: SourceRange): string {
  return `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
}

/** Every diagnostic rendered `severity code @range: message` — failure payload. */
function render(doc: ThetaDocument): string {
  return JSON.stringify(
    doc.diagnostics.map((d: Diagnostic) => {
      const r = d.range;
      return `${d.severity} ${d.code} @${r === undefined ? "-" : at(r)}: ${d.message}`;
    }),
  );
}

/**
 * Every binding site and every judged CALL-ARGUMENT site of `doc` in source
 * order: `let <name>@<stmt range>`, `for <var>@<iterand range>`, and
 * `arg <callee>#<i>@<argument range>`.
 *
 * This is the loud precondition every row runs FIRST. The subject of this file
 * is an order-dependent suppression whose only observable is a diagnostic that
 * is absent, so a fixture that stopped parsing, lost a statement, or drifted a
 * line would let the currently-`[]` rows pass while measuring nothing. The
 * argument sites are in the list because the owed verdict is anchored on the
 * ARGUMENT node — pinning them here means each row's `[]` is measured at a sink
 * the walk demonstrably reached, and the `located` list below compares against
 * the same range.
 */
function binderSites(doc: ThetaDocument): string[] {
  const out: string[] = [];
  const walkExpr = (e: Expr): void => {
    switch (e.kind) {
      case "call":
        e.args.forEach((a: Expr, i: number) => {
          out.push(`arg ${e.callee}#${i}@${at(a.range)}`);
        });
        for (const a of e.args) walkExpr(a);
        return;
      case "par-for":
        out.push(`par-for ${e.variable}@${at(e.iterand.range)}`);
        walkExpr(e.iterand);
        if (e.max !== null) walkExpr(e.max);
        walkBlock(e.body);
        return;
      case "match":
        walkExpr(e.scrutinee);
        for (const arm of e.arms) walkExpr(arm.body);
        return;
      case "invoke":
        for (const a of e.args) walkExpr(a);
        return;
      case "method-call":
        walkExpr(e.target);
        for (const a of e.args) walkExpr(a);
        return;
      case "member":
        walkExpr(e.target);
        return;
      case "index":
        walkExpr(e.target);
        walkExpr(e.index);
        return;
      case "binary":
        walkExpr(e.left);
        walkExpr(e.right);
        return;
      case "ternary":
        walkExpr(e.condition);
        walkExpr(e.consequent);
        walkExpr(e.alternate);
        return;
      case "array":
        for (const el of e.elements) walkExpr(el);
        return;
      case "object":
        for (const f of e.fields) walkExpr(f.value);
        return;
      case "try":
        walkExpr(e.operand);
        return;
      case "result-ctor":
        walkExpr(e.arg);
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
        out.push(`let ${s.name}@${at(s.range)}`);
        if (s.init !== null) walkExpr(s.init);
        return;
      case "for":
        out.push(`for ${s.variable}@${at(s.iterand.range)}`);
        walkExpr(s.iterand);
        walkBlock(s.body);
        return;
      case "fn":
        walkBlock(s.body);
        return;
      case "while":
        walkExpr(s.condition);
        walkBlock(s.body);
        return;
      case "if": {
        walkExpr(s.condition);
        walkBlock(s.then);
        // `otherwise` is a chained `IfStmt`, an `else` `Block`, or none; only
        // the statement form carries a `kind` discriminator.
        const otherwise = s.otherwise;
        if (otherwise !== null) {
          if ("kind" in otherwise) walkStmt(otherwise);
          else walkBlock(otherwise);
        }
        return;
      }
      // A bare `hs(ws)` in statement position is a `tool-call`, not an `expr`;
      // the sinks these rows judge live there as often as inside a `let`.
      case "tool-call":
        walkExpr(s.call);
        return;
      case "invoke":
        walkExpr(s.invoke);
        return;
      case "expr":
        walkExpr(s.expr);
        return;
      case "reassign":
        walkExpr(s.value);
        return;
      case "return":
        if (s.operand !== null) walkExpr(s.operand);
        return;
      default:
        return;
    }
  };
  const body = doc.body;
  if (body === null) {
    throw new Error(
      `harness: the fixture produced no parsed body, so its diagnostic set is about a parse failure rather than the \`let\` arm under test. Diagnostics: ${render(doc)}`,
    );
  }
  walkBlock(body);
  return out;
}

interface Expectation {
  readonly codes: readonly string[];
  readonly msgs: readonly string[];
}

/** The empty contract — no diagnostic at all. */
const CLEAN: Expectation = { codes: [], msgs: [] };

/** A one-diagnostic contract. */
function one(code: string, message: string): Expectation {
  return { codes: [code], msgs: [message] };
}

/** An ordered two-diagnostic contract (row c3's two judged sinks). */
function two(first: Expectation, second: Expectation): Expectation {
  return {
    codes: [...first.codes, ...second.codes],
    msgs: [...first.msgs, ...second.msgs],
  };
}

interface Row {
  readonly label: string;
  readonly src: string;
  readonly sites: readonly string[];
  readonly expected: Expectation;
  /** Why the spec owes this verdict — quoted in the failure message. */
  readonly reason: string;
  /** Optional `severity code @range` list, pinning WHICH node carries a verdict. */
  readonly located?: readonly string[];
}

/**
 * One row: the site precondition, then the WHOLE ordered code list, then the
 * whole ordered message list, then (when supplied) the whole ordered located
 * form. Whole-list ordered equality throughout — a containment matcher would
 * let an over-correction's spurious extra emission hide, and this file's whole
 * subject is a MISSING member of that list.
 */
function expectRow(row: Row): ThetaDocument {
  const doc = parse(row.src);
  expect(
    binderSites(doc),
    `${row.label} PRECONDITION: the fixture's binding and judged-argument sites must be exactly these, so a drifted or unparsed fixture fails here instead of letting the assertions below measure nothing. Diagnostics: ${render(doc)}`,
  ).toEqual([...row.sites]);
  expect(
    doc.diagnostics.map((d: Diagnostic) => d.code),
    `${row.label} — ${row.reason}\n  actual diagnostics: ${render(doc)}`,
  ).toEqual([...row.expected.codes]);
  expect(
    doc.diagnostics.map((d: Diagnostic) => d.message),
    `${row.label} — DIAG-4 (diagnostic-shape.md:74): the rendered messages are the registry *Message* column interpolated\n  actual diagnostics: ${render(doc)}`,
  ).toEqual([...row.expected.msgs]);
  const located = row.located;
  if (located !== undefined) {
    expect(
      doc.diagnostics.map((d: Diagnostic) => {
        const r = d.range;
        return `${d.severity} ${d.code} @${r === undefined ? "-" : at(r)}`;
      }),
      `${row.label} — the verdict belongs to the ARGUMENT node at the judged call, not to the binding and not to the statement. Diagnostics: ${render(doc)}`,
    ).toEqual([...located]);
  }
  return doc;
}

// ===========================================================================
// Fixtures.
//
// One preamble and one erased receiver serve nearly every row, so the only
// difference between a row and its control is which statements are present and
// in which order — the report's own sharpest evidence: the operands never
// change, so type-system.md:48's *Unresolvable operands* deferral cannot be
// what decides these verdicts.
// ===========================================================================

/**
 * Lines 4–9, shape 1. `L` is the alias whose right-hand side is the borrowed
 * object; `P` and `B` are the two ternary arms whose `#commonType` reduction is
 * not a proof; `hs` is the judged sink, at a WHOLE-ARRAY argument slot.
 */
const PRE_ALIAS =
  "schema L = array<integer>\n" +
  "schema P { xs: L }\n" +
  "schema B { xs: array<string> }\n" +
  "fn hs(a: array<string>) {\n" +
  "  1\n" +
  "}\n";

/** Line 10 — the `fn` the (a) rows, b1, c3–c7 and d1/d3/d6/d7 share. */
const FN_OPEN = "fn f(flag: boolean, q: P) {\n";

/**
 * Line 11 — THE POISONER'S ROOT. A ternary over two distinct object schemas is
 * not a proven reduction, so `m` is unprovable; `m.xs` still resolves against
 * `P` and yields `P.xs`'s own object, which is what the mark then lands on.
 */
const ERASED_RECEIVER = '  let m = flag ? P { xs: [1] } : B { xs: ["a"] }\n';

/** THE POISONER: an unprovable member read, whose type is borrowed. */
const POISONER = "  let zs = m.xs\n";
/** THE VICTIM: a declared-field read off an annotated parameter — a proof. */
const VICTIM = "  let ws = q.xs\n";
/** THE SINK, in statement position. */
const SINK = "  hs(ws)\n";
/** The sink written as a binding, which is where cell `d6` of 0194's witness reads it. */
const SINK_LET = "  let r = hs(ws)\n";
/** The `fn`'s final value and the theta's. */
const TAIL = "  1\n}\n1\n";

/** The site of the shared line-11 erased receiver. */
const M_SITE = "let m@11:3-11:49";

/**
 * Lines 4–8, shape 2. No alias anywhere: `P.xs` is declared INLINE, so
 * `collectSchemaFields` is the whole sharing site.
 */
const PRE_FIELD =
  "schema P { xs: array<integer> }\n" +
  "schema B { xs: array<string> }\n" +
  "fn hs(a: array<string>) {\n" +
  "  1\n" +
  "}\n";

/**
 * Lines 4–8, shape 3. A PRIMITIVE declared field and a `string` sink, so
 * neither operand of the judged row is an array.
 */
const PRE_PRIMITIVE =
  "schema P { n: integer }\n" +
  "schema B { n: string }\n" +
  "fn gs(s: string) {\n" +
  "  1\n" +
  "}\n";

/** Row b3's line 10 receiver, and its poisoner / victim / sink. */
const ERASED_RECEIVER_PRIMITIVE = '  let m = flag ? P { n: 1 } : B { n: "a" }\n';
const POISONER_PRIMITIVE = "  let zs = m.n\n";
const VICTIM_PRIMITIVE = "  let ws = q.n\n";
const SINK_PRIMITIVE = "  gs(ws)\n";

/**
 * Lines 4–12 for row d2 — the whole-array sink plus an ELEMENT sink, so the row
 * can measure that this arm's mark does not reach a later loop's element.
 */
const PRE_WITH_ELEMENT_SINK =
  "schema L = array<integer>\n" +
  "schema P { xs: L }\n" +
  "schema B { xs: array<string> }\n" +
  "fn hs(a: array<string>) {\n  1\n}\n" +
  "fn g(s: string) {\n  1\n}\n";

/**
 * Lines 4–9 for row d3 — two DISTINCT schemas declaring the same field shape.
 * `annotationToCompatType` allocates per call and interns nothing, so `P.xs` and
 * `Q.xs` are two objects.
 */
const PRE_TWO_SCHEMAS =
  "schema P { xs: array<integer> }\n" +
  "schema Q { xs: array<integer> }\n" +
  "schema B { xs: array<string> }\n" +
  "fn hs(a: array<string>) {\n  1\n}\n";

/**
 * Lines 4–6 for group (e) rows e1 / e2 — a `fn` whose written return annotation
 * names a `Result`, which is the one initialiser shape that is BOTH minted into
 * `resultBindings` by `isCertainResultNode` and withheld by `provableArgType`'s
 * unconditional `call` arm.
 */
const MK_RESULT = "fn mk(): Result<integer, QueryError> {\n" + "  Ok(1)\n" + "}\n";

// ===========================================================================
// (a) The suppression and its three controls.
//
// This group proves the suppression exists and that nothing about the JUDGED
// ROW's operands explains it. The four fixtures declare the same schemas and
// the same sink; a1 and a2 differ only in whether the sink is written as a
// statement or as a binding, a3ctl deletes the poisoning statement, a4ctl keeps
// every statement and only moves the victim above the poisoner, and a5ctl drops
// the erased receiver entirely. Three emit; the subject does not.
//
// a4ctl is the sharpest: the same five statements over the same bindings, the
// same two member reads, and the order alone decides whether a registered `E`
// is reported. Every row here pins the emission's RANGE as well as its text.
// ===========================================================================

describe("bug 0199 (a) — one unprovable `let` suppresses a later proven binding's verdict", () => {
  it("RED a1: `let zs = m.xs` off an erased receiver silences the true `hs(ws)` mismatch", () => {
    expectRow({
      label: "a1 [subject]",
      src: PRE_ALIAS + FN_OPEN + ERASED_RECEIVER + POISONER + VICTIM + SINK + TAIL,
      sites: [M_SITE, "let zs@12:3-12:16", "let ws@13:3-13:16", "arg hs#0@14:6-14:8"],
      expected: one(FN_ARG, HS_MISMATCH),
      located: [`error ${FN_ARG} @14:6-14:8`],
      reason:
        "type-system.md:27 lists a function-argument slot among the positions `⊑` governs and :50 (TYPE-9) routes a static failure there to theta/parse/fn-arg-type-mismatch, whose registry row is `E` and states that no runtime AJV net applies; `q` is an annotated parameter of a resolved object schema, a declared-field read off it is a proof under bug 0190, and :54 (TYPE-11) makes `P.xs`'s declared `L` the array<integer> the sink refuses. The withhold that suppresses it was recorded for `zs`, a different binding",
    });
  });

  it("RED a2: the same silence with the sink written as a binding", () => {
    expectRow({
      label: "a2 [sink as binding]",
      src: PRE_ALIAS + FN_OPEN + ERASED_RECEIVER + POISONER + VICTIM + SINK_LET + TAIL,
      sites: [
        M_SITE,
        "let zs@12:3-12:16",
        "let ws@13:3-13:16",
        "let r@14:3-14:17",
        "arg hs#0@14:14-14:16",
      ],
      expected: one(FN_ARG, HS_MISMATCH),
      located: [`error ${FN_ARG} @14:14-14:16`],
      reason:
        "the argument slot is the same governed position whether the call's value is discarded or bound, so TYPE-9 owes the same verdict at the same argument node; this is the shape cell `d6` of tests/loop-element-withhold-binding-scoped.test.ts holds as a bound",
    });
  });

  it("PIN a3ctl [CTL delete]: the same sink without the poisoning statement emits", () => {
    expectRow({
      label: "a3ctl [CTL delete]",
      src: PRE_ALIAS + FN_OPEN + ERASED_RECEIVER + VICTIM + SINK + TAIL,
      sites: [M_SITE, "let ws@12:3-12:16", "arg hs#0@13:6-13:8"],
      expected: one(FN_ARG, HS_MISMATCH),
      located: [`error ${FN_ARG} @13:6-13:8`],
      reason:
        "the erased receiver is still declared and still unprovable; deleting only the statement that READS it restores the verdict, so the suppression is the mark and not the declaration — green in both directions",
    });
  });

  it("PIN a4ctl [CTL reorder]: the same statements with the victim above the poisoner emit", () => {
    expectRow({
      label: "a4ctl [CTL reorder]",
      src: PRE_ALIAS + FN_OPEN + ERASED_RECEIVER + VICTIM + SINK + POISONER + TAIL,
      sites: [M_SITE, "let ws@12:3-12:16", "arg hs#0@13:6-13:8", "let zs@14:3-14:16"],
      expected: one(FN_ARG, HS_MISMATCH),
      located: [`error ${FN_ARG} @13:6-13:8`],
      reason:
        "the sharpest control: identical statements, identical operands, only the order differs. A check whose verdict depends on the position of an unrelated statement over an unrelated binding is not the operand-conditioned deferral type-system.md:48 authorises — green in both directions",
    });
  });

  it("PIN a5ctl [CTL no receiver]: the victim and sink alone emit", () => {
    expectRow({
      label: "a5ctl [CTL no receiver]",
      src: PRE_ALIAS + "fn f(q: P) {\n" + VICTIM + SINK + TAIL,
      sites: ["let ws@11:3-11:16", "arg hs#0@12:6-12:8"],
      expected: one(FN_ARG, HS_MISMATCH),
      located: [`error ${FN_ARG} @12:6-12:8`],
      reason:
        "the floor of the group: with no erased receiver anywhere in the file the judged row is reported, so a1's operands are resolvable and its silence is not a property of the sink — green in both directions",
    });
  });
});

// ===========================================================================
// (b) Which shared objects reach the mark.
//
// This group proves the input class is every declared field of every object
// schema, not one alias shape. b1 is the alias right-hand side; b2 removes
// aliases from the file entirely, leaving `collectSchemaFields` as the only
// sharing site; b3 removes arrays from the judged row, leaving a primitive
// field. b2 and b3 carry their own delete-controls because their preambles and
// their rendered verdicts differ from the (a) group's; b1's delete-control IS
// a3ctl, byte-identically, and is not duplicated.
// ===========================================================================

describe("bug 0199 (b) — every declared field's `CompatType` is a channel", () => {
  it("RED b1: the ALIAS right-hand side is the shared object", () => {
    expectRow({
      label: "b1 [alias rhs]",
      src: PRE_ALIAS + FN_OPEN + ERASED_RECEIVER + POISONER + VICTIM + SINK + TAIL,
      sites: [M_SITE, "let zs@12:3-12:16", "let ws@13:3-13:16", "arg hs#0@14:6-14:8"],
      expected: one(FN_ARG, HS_MISMATCH),
      located: [`error ${FN_ARG} @14:6-14:8`],
      reason:
        "`#memberType` returns `unfoldAlias(fields[\"xs\"])` and `unfoldAlias` hands back `decl.rhs`, the `TypeEnv`'s own object for `schema L = array<integer>` — one per alias declaration per parse. This row is a1's fixture read on the shape axis this group varies, and its delete-control is a3ctl",
    });
  });

  it("RED b2: an INLINE declared field shares identically, with no alias in the file", () => {
    expectRow({
      label: "b2 [inline field]",
      src: PRE_FIELD + FN_OPEN + ERASED_RECEIVER + POISONER + VICTIM + SINK + TAIL,
      sites: [
        "let m@10:3-10:49",
        "let zs@11:3-11:16",
        "let ws@12:3-12:16",
        "arg hs#0@13:6-13:8",
      ],
      expected: one(FN_ARG, HS_MISMATCH),
      located: [`error ${FN_ARG} @13:6-13:8`],
      reason:
        "`collectSchemaFields` calls `annotationToCompatType` once per declared field per parse and stores the result, so one schema read twice yields one object with no alias hop involved; TYPE-9 owes the judged row its verdict on operands the pass resolved from author-written annotations",
    });
  });

  it("PIN b2ctl [CTL delete]: the inline-field victim alone emits", () => {
    expectRow({
      label: "b2ctl [CTL delete]",
      src: PRE_FIELD + FN_OPEN + ERASED_RECEIVER + VICTIM + SINK + TAIL,
      sites: ["let m@10:3-10:49", "let ws@11:3-11:16", "arg hs#0@12:6-12:8"],
      expected: one(FN_ARG, HS_MISMATCH),
      located: [`error ${FN_ARG} @12:6-12:8`],
      reason:
        "b2's own delete-control: its preamble is a line shorter than the (a) group's, so it needs one of its own — green in both directions",
    });
  });

  it("RED b3: a PRIMITIVE declared field shares identically, and neither operand is an array", () => {
    expectRow({
      label: "b3 [primitive field]",
      src:
        PRE_PRIMITIVE +
        FN_OPEN +
        ERASED_RECEIVER_PRIMITIVE +
        POISONER_PRIMITIVE +
        VICTIM_PRIMITIVE +
        SINK_PRIMITIVE +
        TAIL,
      sites: [
        "let m@10:3-10:43",
        "let zs@11:3-11:15",
        "let ws@12:3-12:15",
        "arg gs#0@13:6-13:8",
      ],
      expected: one(FN_ARG, GS_MISMATCH),
      located: [`error ${FN_ARG} @13:6-13:8`],
      reason:
        "the mark lands on whatever `typeOf` returned, and a declared `n: integer` is as much a per-parse `CompatType` as an array is — so the suppression reaches scalar argument slots too, which is the axis that separates this defect from a loop-element one",
    });
  });

  it("PIN b3ctl [CTL delete]: the primitive-field victim alone emits", () => {
    expectRow({
      label: "b3ctl [CTL delete]",
      src:
        PRE_PRIMITIVE +
        FN_OPEN +
        ERASED_RECEIVER_PRIMITIVE +
        VICTIM_PRIMITIVE +
        SINK_PRIMITIVE +
        TAIL,
      sites: ["let m@10:3-10:43", "let ws@11:3-11:15", "arg gs#0@12:6-12:8"],
      expected: one(FN_ARG, GS_MISMATCH),
      located: [`error ${FN_ARG} @12:6-12:8`],
      reason:
        "b3's own delete-control, and the proof that the scalar sink is judged at all on this harness — green in both directions",
    });
  });
});

// ===========================================================================
// (c) Reach — how far one mark travels.
//
// This group proves the mark has no scope: `unprovableBindings` is per-parse
// instance state on the single `TypeLayerWalk` that `checkTypeLayer` walks the
// whole body with, while the scope copies bound a NAME's visibility only. c1
// crosses a `fn` boundary, c2 reaches top-level statements, c3 shows every later
// binding is affected rather than only the next, c4 escapes a block that has
// already exited, c5 enters a block the poisoner is outside of, c6 survives a
// transitive unannotated launder, and c7 poisons from a composite in which only
// one arm is erased. c2 carries its own delete-control because its victim is at
// top level; the others' controls are a3ctl's shape.
// ===========================================================================

describe("bug 0199 (c) — one mark reaches the whole document", () => {
  it("RED c1: the mark crosses a `fn` boundary", () => {
    expectRow({
      label: "c1 [cross-fn]",
      src:
        PRE_ALIAS +
        "fn poison(flag: boolean) {\n" +
        ERASED_RECEIVER +
        POISONER +
        "  1\n}\n" +
        "fn f(q: P) {\n" +
        VICTIM +
        SINK +
        TAIL,
      sites: [M_SITE, "let zs@12:3-12:16", "let ws@16:3-16:16", "arg hs#0@17:6-17:8"],
      expected: one(FN_ARG, HS_MISMATCH),
      located: [`error ${FN_ARG} @17:6-17:8`],
      reason:
        "`f` shares no binding, no scope and no parameter with `poison`; the only thing it shares is `P.xs`'s object. TYPE-9's verdict on `f`'s own argument slot cannot be decided by a statement in another function",
    });
  });

  it("RED c2: the mark reaches top-level statements", () => {
    expectRow({
      label: "c2 [top level]",
      src:
        PRE_ALIAS +
        "fn poison(flag: boolean) {\n" +
        ERASED_RECEIVER +
        POISONER +
        "  1\n}\n" +
        "let q = P { xs: [1] }\n" +
        "let ws = q.xs\n" +
        "hs(ws)\n",
      sites: [
        M_SITE,
        "let zs@12:3-12:16",
        "let q@15:1-15:22",
        "let ws@16:1-16:14",
        "arg hs#0@17:4-17:6",
      ],
      expected: one(FN_ARG, HS_MISMATCH),
      located: [`error ${FN_ARG} @17:4-17:6`],
      reason:
        "a top-level receiver built by a schema constructor is a proof (`provableArgType` answers `typeOf` for an `object`), so the top-level read is proven and its slot is owed the verdict; the mark taken inside `poison` outlives the function it was taken in",
    });
  });

  it("PIN c2ctl [CTL delete]: the same three top-level statements without the poisoning `fn` emit", () => {
    expectRow({
      label: "c2ctl [CTL delete]",
      src: PRE_ALIAS + "let q = P { xs: [1] }\n" + "let ws = q.xs\n" + "hs(ws)\n",
      sites: ["let q@10:1-10:22", "let ws@11:1-11:14", "arg hs#0@12:4-12:6"],
      expected: one(FN_ARG, HS_MISMATCH),
      located: [`error ${FN_ARG} @12:4-12:6`],
      reason:
        "c2's own delete-control: the top-level slot IS judged when no earlier statement marks the shared field object — green in both directions",
    });
  });

  it("RED c3: EVERY later binding is silenced, not only the next one", () => {
    expectRow({
      label: "c3 [second victim]",
      src:
        PRE_ALIAS +
        "fn f(flag: boolean, q: P, r: P) {\n" +
        ERASED_RECEIVER +
        POISONER +
        VICTIM +
        SINK +
        "  let vs = r.xs\n" +
        "  hs(vs)\n" +
        TAIL,
      sites: [
        M_SITE,
        "let zs@12:3-12:16",
        "let ws@13:3-13:16",
        "arg hs#0@14:6-14:8",
        "let vs@15:3-15:16",
        "arg hs#0@16:6-16:8",
      ],
      expected: two(one(FN_ARG, HS_MISMATCH), one(FN_ARG, HS_MISMATCH)),
      located: [`error ${FN_ARG} @14:6-14:8`, `error ${FN_ARG} @16:6-16:8`],
      reason:
        "`q` and `r` are two distinct annotated parameters of one schema, so each read is its own proof and each slot owes its own TYPE-9 verdict; the withhold's reach is monotone in the number of later readers, which is why adding one unprovable read can only remove diagnostics from code below it",
    });
  });

  it("RED c4: a poisoner inside an `if` block silences a victim after the block", () => {
    expectRow({
      label: "c4 [poisoner in block]",
      src:
        PRE_ALIAS +
        FN_OPEN +
        ERASED_RECEIVER +
        "  if flag {\n    let zs = m.xs\n  }\n" +
        VICTIM +
        SINK +
        TAIL,
      sites: [M_SITE, "let zs@13:5-13:18", "let ws@15:3-15:16", "arg hs#0@16:6-16:8"],
      expected: one(FN_ARG, HS_MISMATCH),
      located: [`error ${FN_ARG} @16:6-16:8`],
      reason:
        "the block's scope copy bounds the NAME `zs`, which is invisible after the block; the set it was marked in has no scope at all, so the mark is live at a statement the marking binding cannot even be named from",
    });
  });

  it("RED c5: a victim inside a nested block is silenced by a poisoner outside it", () => {
    expectRow({
      label: "c5 [victim in block]",
      src:
        PRE_ALIAS +
        FN_OPEN +
        ERASED_RECEIVER +
        POISONER +
        "  if flag {\n    let ws = q.xs\n    hs(ws)\n  }\n" +
        TAIL,
      sites: [M_SITE, "let zs@12:3-12:16", "let ws@14:5-14:18", "arg hs#0@15:8-15:10"],
      expected: one(FN_ARG, HS_MISMATCH),
      located: [`error ${FN_ARG} @15:8-15:10`],
      reason:
        "the other direction of c4: entering a block copies the bindings map and inherits the marked object with it, so nesting the judged read changes nothing about what TYPE-9 owes it",
    });
  });

  it("RED c6: the silence survives a transitive unannotated launder", () => {
    expectRow({
      label: "c6 [transitive launder]",
      src:
        PRE_ALIAS + FN_OPEN + ERASED_RECEIVER + POISONER + VICTIM + "  let vs = ws\n" + "  hs(vs)\n" + TAIL,
      sites: [
        M_SITE,
        "let zs@12:3-12:16",
        "let ws@13:3-13:16",
        "let vs@14:3-14:14",
        "arg hs#0@15:6-15:8",
      ],
      expected: one(FN_ARG, HS_MISMATCH),
      located: [`error ${FN_ARG} @15:6-15:8`],
      reason:
        "an unannotated `let` records its initialiser's own type object, so `vs` names the same field object `ws` does; both operands at the `hs(vs)` slot stay statically resolvable and the extra hop adds no unresolvability of its own",
    });
  });

  it("RED c7: a COMPOSITE poisoner containing one erased arm is enough", () => {
    expectRow({
      label: "c7 [composite poisoner]",
      src:
        PRE_ALIAS +
        FN_OPEN +
        ERASED_RECEIVER +
        "  let zs = flag ? m.xs : q.xs\n" +
        VICTIM +
        SINK +
        TAIL,
      sites: [M_SITE, "let zs@12:3-12:30", "let ws@13:3-13:16", "arg hs#0@14:6-14:8"],
      expected: one(FN_ARG, HS_MISMATCH),
      located: [`error ${FN_ARG} @14:6-14:8`],
      reason:
        "the composite's own withhold is legitimate — one arm is unprovable — but `#commonType` returns a candidate by reference, so the reduction IS `P.xs`'s object and the mark lands on what the proven arm and the later read both hold",
    });
  });
});

// ===========================================================================
// (d) The fences — what the mark does NOT reach, and what a fix must NOT
// remove.
//
// Every row here is CORRECT at HEAD, and this group is the file's bound in the
// other direction. d1 and d2 fix the defect's edges: the mark reaches neither an
// annotated parameter's own object nor a later loop's element, which is the axis
// that separates this writer from the two loop arms. d3 and d5 identify the
// borrowed object rather than the marking as the ingredient: two distinct
// schemas do not collide and a `call`-typed initialiser is private to its node.
// d4 shows sharing alone is inert. d6 pins that the sibling VALUE channel is out
// of reach, so exactly one registered code is the whole loss.
//
// d7 is the STOP condition. The poisoner's OWN binding must stay withheld: a
// route that greens (a)–(c) and reds d7 deleted the withhold instead of
// re-keying it.
// ===========================================================================

describe("bug 0199 (d) — the fences: the borrowed object is the ingredient, and the withhold survives", () => {
  it("PIN d1: an annotated parameter as the victim is never reached", () => {
    expectRow({
      label: "d1 [annotated parameter victim]",
      src: PRE_ALIAS + "fn f(flag: boolean, ys: L) {\n" + ERASED_RECEIVER + POISONER + "  hs(ys)\n" + TAIL,
      sites: [M_SITE, "let zs@12:3-12:16", "arg hs#0@13:6-13:8"],
      expected: one(FN_ARG, fnArg("hs", 0, "a", "array<string>", "L")),
      located: [`error ${FN_ARG} @13:6-13:8`],
      reason:
        "`walkFn` records an annotated parameter as a fresh `annotationToCompatType` object, which nothing marked, and `displayType` renders the alias by name — so the verdict lands with the author's own spelling. A route that keyed the withhold to the alias rather than to a binding would red here",
    });
  });

  it("PIN d2: a later LOOP over the same alias is never reached", () => {
    expectRow({
      label: "d2 [later loop]",
      src:
        PRE_WITH_ELEMENT_SINK +
        "fn f(flag: boolean, q: P, ys: L) {\n" +
        ERASED_RECEIVER +
        POISONER +
        "  for b in ys {\n    g(b)\n  }\n" +
        TAIL,
      sites: ["let m@14:3-14:49", "let zs@15:3-15:16", "for b@16:12-16:14", "arg g#0@17:7-17:8"],
      expected: one(FN_ARG, fnArg("g", 0, "s", "string", "integer")),
      located: [`error ${FN_ARG} @17:7-17:8`],
      reason:
        "this arm marks the WHOLE array object while a loop records `unfoldAlias(iterand).element`, a different object — the axis that separates this defect from bug 0194's, in both directions, and the reason a fix at this one arm is sufficient",
    });
  });

  it("PIN d3: two DISTINCT schemas declaring the same field shape do not collide", () => {
    expectRow({
      label: "d3 [distinct schemas]",
      src: PRE_TWO_SCHEMAS + "fn f(flag: boolean, q: Q) {\n" + ERASED_RECEIVER + POISONER + VICTIM + SINK + TAIL,
      sites: [M_SITE, "let zs@12:3-12:16", "let ws@13:3-13:16", "arg hs#0@14:6-14:8"],
      expected: one(FN_ARG, HS_MISMATCH),
      located: [`error ${FN_ARG} @14:6-14:8`],
      reason:
        "`annotationToCompatType` allocates on every return path and interns nothing, so `P.xs` and `Q.xs` are two objects and the identity test misses — the isolating control that identifies the SHARED object, not the mark, as what carries the suppression",
    });
  });

  it("PIN d4: sharing with no mark is inert — two PROVEN receivers of one schema", () => {
    expectRow({
      label: "d4 [sharing without a mark]",
      src: PRE_ALIAS + "fn f(p: P, q: P) {\n" + "  let zs = p.xs\n" + VICTIM + SINK + TAIL,
      sites: ["let zs@11:3-11:16", "let ws@12:3-12:16", "arg hs#0@13:6-13:8"],
      expected: one(FN_ARG, HS_MISMATCH),
      located: [`error ${FN_ARG} @13:6-13:8`],
      reason:
        "both receivers are annotated parameters, so both reads are proofs, nothing is marked, and the verdict lands although the two bindings hold the identical object — the mark is the ingredient, not the sharing",
    });
  });

  it("PIN d5: a `call` initialiser as the poisoner reaches nothing", () => {
    expectRow({
      label: "d5 [call poisoner]",
      src:
        PRE_ALIAS +
        "fn mk(): L {\n  [1]\n}\n" +
        "fn f(q: P) {\n" +
        "  let zs = mk()\n" +
        VICTIM +
        SINK +
        TAIL,
      sites: ["let zs@14:3-14:16", "let ws@15:3-15:16", "arg hs#0@16:6-16:8"],
      expected: one(FN_ARG, HS_MISMATCH),
      located: [`error ${FN_ARG} @16:6-16:8`],
      reason:
        "`provableArgType`'s `call` arm withholds unconditionally, so this initialiser IS unprovable — but the inference pass types a call as a nominal minted from the callee, so the marked object is private to that node and no later reader holds it",
    });
  });

  it("PIN d6: the typed-`let` sink on the poisoned victim still emits", () => {
    expectRow({
      label: "d6 [typed-let sink]",
      src: PRE_ALIAS + FN_OPEN + ERASED_RECEIVER + POISONER + "  let ws: array<string> = q.xs\n" + TAIL,
      sites: [M_SITE, "let zs@12:3-12:16", "let ws@13:3-13:31"],
      expected: one(LET_RHS, letRhs("ws", "array<string>", "array<integer>")),
      located: [`error ${LET_RHS} @13:3-13:31`],
      reason:
        "type-system.md:50 (TYPE-9) routes a typed `let`'s RHS to theta/parse/let-rhs-type-mismatch, and that sink reads the bindings map by VALUE (`containsWithheldBinderType`) rather than through `provableArgType`'s identity test — so the identity channel does not reach it and exactly one registered code is the whole loss",
    });
  });

  it("PIN d7: the poisoner's OWN binding stays withheld at the sink", () => {
    // The anti-over-correction pin, and this file's copy of the constraint cell
    // `L2` of tests/fn-arg-member-read-proof.test.ts and cell `d5` of
    // tests/loop-element-withhold-binding-scoped.test.ts carry. The withhold is
    // to be RE-KEYED, not deleted: a route that stops marking greens groups
    // (a)–(c) and reds this row.
    expectRow({
      label: "d7 [the withhold survives]",
      src: PRE_ALIAS + "fn f(flag: boolean) {\n" + ERASED_RECEIVER + POISONER + "  hs(zs)\n" + TAIL,
      sites: [M_SITE, "let zs@12:3-12:16", "arg hs#0@13:6-13:8"],
      expected: CLEAN,
      reason:
        "`m` is an unproven ternary reduction, so `m.xs` is past the parser's static view and type-system.md:48 (*Unresolvable operands*) licences the deferral for THIS binding — the one the withhold was recorded for. Bug 0050's posture, and this report's §Non-goals: withholding here is correct",
    });
  });
});

// ===========================================================================
// (e) THE SECOND IDENTITY CHANNEL — bug 0079's `resultBindings` provenance must
// survive whatever object this arm starts recording.
//
// These rows PIN NO CHANGE. Unlike (a)–(c), every one is green at HEAD and must
// stay green: they measure a channel a fix has to carry, not one it moves. The
// arm feeds two `Set<CompatType>` from one object, and `resultBindings` is the
// one it MINTS into — so a private object that re-points only the mark drops
// `theta/parse/interpolated-result` at the minting binding, and one that
// re-points only the mint drops it at the binding that INHERITS.
//
// e1 is the deciding shape: a `call` to a `Result`-returning `fn` satisfies
// `isCertainResultNode`, so the membership is minted over the same object
// `provableArgType`'s unconditional `call` arm makes unprovable, and `let c = r`
// then sits on the marking branch itself and inherits the membership only
// because `c` and `r` share one object. e2 is the same two hops on, so the carry
// must be transitive. e3 is the contrast, and its verdict is read from the code
// rather than from its own emission: `provableArgType`'s
// `query` / `object` / `result-ctor` / `par-for` arm ANSWERS `typeOf`, so
// `let r = Ok(1)` is a proof, takes no mark, and neither does `let c = r` — the
// pair is a PROOF chain, which a copy conditioned on the unprovable verdict
// never reaches, and it therefore bounds an unconditional copy-on-record instead.
// e4 is the deeper source: `commonType`'s dominating-candidate clause and
// `#commonType`'s single-candidate fallback both return a candidate BY
// REFERENCE, so a membership travels through an array literal and a ternary into
// a loop without this arm doing anything at all — the aliasing bug 0079's
// mechanism depends on, and the reason removing the sharing at its source is a
// change to that mechanism.
// ===========================================================================

describe("bug 0199 (e) — the `resultBindings` provenance the same arm mints and inherits", () => {
  it("PIN e1: a binding that INHERITS the membership from a minting binding still refuses `${c}`", () => {
    expectRow({
      label: "e1 [inherited membership]",
      src: MK_RESULT + "fn f() {\n" + "  let r = mk()\n" + "  let c = r\n" + "  let out = @`x${c}`\n" + TAIL,
      sites: ["let r@8:3-8:15", "let c@9:3-9:12", "let out@10:3-10:21"],
      expected: one(INTERP_RESULT, INTERP_MESSAGE),
      located: [`error ${INTERP_RESULT} @10:13-10:21`],
      reason:
        "`mk()` satisfies `isCertainResultNode` (a `call` whose written return annotation names a `Result`), so `let r = mk()` MINTS the membership over the same object the unconditional `call` withhold marks; `interpolationIsResult`'s `ident` arm then answers true for `c` only because `c` and `r` share it. Green at HEAD; this row pins NO CHANGE, and reds if a fix re-points one channel and not the other",
    });
  });

  it("PIN e1ctl [CTL direct]: interpolating the minting binding itself refuses", () => {
    expectRow({
      label: "e1ctl [CTL direct]",
      src: MK_RESULT + "fn f() {\n" + "  let r = mk()\n" + "  let out = @`x${r}`\n" + TAIL,
      sites: ["let r@8:3-8:15", "let out@9:3-9:21"],
      expected: one(INTERP_RESULT, INTERP_MESSAGE),
      located: [`error ${INTERP_RESULT} @9:13-9:21`],
      reason:
        "e1's own control: the gate is live on the minting binding with no second hop, so a red at e1 is the inheritance being severed rather than the mint being lost — green in both directions",
    });
  });

  it("PIN e2: the inheritance is TRANSITIVE across two hops", () => {
    expectRow({
      label: "e2 [two hops]",
      src:
        MK_RESULT +
        "fn f() {\n" +
        "  let r = mk()\n" +
        "  let c = r\n" +
        "  let d = c\n" +
        "  let out = @`x${d}`\n" +
        TAIL,
      sites: ["let r@8:3-8:15", "let c@9:3-9:12", "let d@10:3-10:12", "let out@11:3-11:21"],
      expected: one(INTERP_RESULT, INTERP_MESSAGE),
      located: [`error ${INTERP_RESULT} @11:13-11:21`],
      reason:
        "each hop reads an already-marked object and so takes the marking branch itself; a carry that ran once would keep e1 green and lose this row, so the obligation is a fixed point rather than a single step. Green at HEAD; this row pins NO CHANGE",
    });
  });

  it("PIN e3: the CONSTRUCTOR pair is a proof chain, and refuses on the same channel", () => {
    // Read from the code, not from this row's emission: `provableArgType`'s
    // `query` / `object` / `result-ctor` / `par-for` arm answers `typeOf`, so
    // `let r = Ok(1)` is provable, takes no mark, and `let c = r` reads an
    // unmarked object and takes none either. The pair therefore bounds an
    // UNCONDITIONAL copy-on-record — a copy conditioned on the unprovable
    // verdict never reaches it — which is why it is recorded beside e1 rather
    // than as a duplicate of it.
    expectRow({
      label: "e3 [constructor pair]",
      src: "fn f() {\n" + "  let r = Ok(1)\n" + "  let c = r\n" + "  let out = @`x${c}`\n" + TAIL,
      sites: ["let r@5:3-5:16", "let c@6:3-6:12", "let out@7:3-7:21"],
      expected: one(INTERP_RESULT, INTERP_MESSAGE),
      located: [`error ${INTERP_RESULT} @7:13-7:21`],
      reason:
        "the mint fires here as it does at e1, but nothing on this fixture is ever marked, so `c` inherits the membership purely by sharing the recorded object. Green at HEAD; this row pins NO CHANGE, and it is what discriminates a copy taken on the mark from a copy taken on every record",
    });
  });

  it("PIN e3ctl [CTL direct]: interpolating the constructor binding itself refuses", () => {
    expectRow({
      label: "e3ctl [CTL direct]",
      src: "fn f() {\n" + "  let r = Ok(1)\n" + "  let out = @`x${r}`\n" + TAIL,
      sites: ["let r@5:3-5:16", "let out@6:3-6:21"],
      expected: one(INTERP_RESULT, INTERP_MESSAGE),
      located: [`error ${INTERP_RESULT} @6:13-6:21`],
      reason:
        "e3's own control, one hop shorter — green in both directions",
    });
  });

  it("PIN e4: the membership travels BY REFERENCE through an array literal and a ternary", () => {
    expectRow({
      label: "e4 [deeper source]",
      src:
        "fn f(flag: boolean) {\n" +
        "  let r = Ok(1)\n" +
        '  let xs = flag ? [r] : ["a"]\n' +
        "  for b in xs {\n    let out = @`x${b}`\n  }\n" +
        TAIL,
      sites: ["let r@5:3-5:16", "let xs@6:3-6:30", "for b@7:12-7:14", "let out@8:5-8:23"],
      expected: one(INTERP_RESULT, INTERP_MESSAGE),
      located: [`error ${INTERP_RESULT} @8:15-8:23`],
      reason:
        "`commonType`'s dominating-candidate clause and `#commonType`'s single-candidate fallback both return a candidate BY REFERENCE, so the array's element IS the object `resultBindings` holds for `r` and the loop's own copy inherits it — the aliasing bug 0079's provenance depends on, which is why removing the sharing at its source is a change to that mechanism rather than to this arm",
    });
  });

  it("PIN e4ctl [CTL no ternary]: the same carry without the ternary hop", () => {
    expectRow({
      label: "e4ctl [CTL no ternary]",
      src:
        "fn f(flag: boolean) {\n" +
        "  let r = Ok(1)\n" +
        "  let xs = [r]\n" +
        "  for b in xs {\n    let out = @`x${b}`\n  }\n" +
        TAIL,
      sites: ["let r@5:3-5:16", "let xs@6:3-6:15", "for b@7:12-7:14", "let out@8:5-8:23"],
      expected: one(INTERP_RESULT, INTERP_MESSAGE),
      located: [`error ${INTERP_RESULT} @8:15-8:23`],
      reason:
        "e4's own control: the array literal alone already carries the membership, so e4's ternary adds a hop rather than the channel — green in both directions",
    });
  });
});
