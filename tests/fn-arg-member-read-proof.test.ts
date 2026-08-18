import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { Block, Expr, Stmt, ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0190 — `provableArgType`'s shared `case "member"` / `case "method-call"`
// arm returns `undefined` before reading anything, so the wired
// `theta/parse/fn-arg-type-mismatch` sink withholds on every member-read
// argument even though a member read's static type is now the receiver's
// DECLARED FIELD TYPE (`#typeExpr`'s `case "member"`, bug 0136). Measured:
// `fn g(n: integer)` called `g(p.s)` with `p.s` declared `string` reports `[]`,
// while the same mismatch one spelling over reports the code, and the sibling
// typed-`let` and constructor-field sinks report it on that same member read
// (docs/bugs/0190-fn-arg-sink-withholds-provable-member-reads.md).
//
// ADDITIVE. This file is new. It is the dedicated witness for bug 0190's whole
// row set; three of those rows are additionally pinned inside the protected
// witness tests/fn-arg-type-mismatch-wired.test.ts (cells u6p, u6b, u6c, which
// take it from 84 cells to 87), where the assertion is narrower — that file
// pins the presence or ABSENCE of this one code, while every row here pins the
// WHOLE unfiltered diagnostic list. Row R20 (cell u6's own vehicle) is carried
// in both places for the same reason.
//
// ── THE SETTLED ROUTE THIS FILE ENCODES ─────────────────────────────────────
// §Fix (a) plus (b), with sub-question (c) ADMITTED and (e) answered "no
// registry row moves":
//
//   1. The shared arm SPLITS. `case "method-call"` keeps `undefined` and keeps
//      the half of its comment that is still true — a method read mints from
//      the author-chosen METHOD name (`#typeExpr`'s `case "method-call"`), so
//      withholding there is sound. Group (g) is that half's bound.
//   2. `case "member"` becomes a proof exactly when TWO conditions hold: the
//      RECEIVER is itself a proven read (`provableArgType(expr.target)` is
//      defined) AND the read resolves to a DECLARED FIELD TYPE — the unfolded
//      receiver is a `named` resolving to an `object-schema` declaration
//      carrying an own key for the field. The proven answer is that declared
//      field type, unfolded per TYPE-11 (docs/spec_topics/type-system.md
//      TYPE-11). Group (a) is the flip, group (c) is the receiver obligation.
//   3. Both of bug 0136's fallbacks stay UNPROVEN: the receiver's own `named`
//      for an unresolvable receiver, and the field-name mint for an absent
//      field / a fields-less declaration / a declined `typeSource`. Group (d)
//      is their bound.
//   4. The provenance comes from a new public query on
//      `StaticTypeInferencePass` beside `typeOf`, so resolution stays in ONE
//      place and no third reader of the declared-`fields` record is created.
//      `provableArgType`'s `case "call"` / `case "invoke"` and `#typeExpr`'s
//      `case "method-call"` are byte-untouched.
//
// ── ROW INVENTORY (bug 0190 §Reproduction row ids, one cell each) ───────────
// The rows this fix FLIPS — `[]` today, the quoted diagnostic after:
//   R1   (a) the headline: `g(p.s)`, field declared `string`, parameter
//        `integer`. The one-body statement of the whole defect.
//   R6   (a) an ALIAS-typed field — TYPE-11 unfolding reaches the sink.
//   R7   (a) a NESTED receiver — `p.q.s`, two object-schema hops, and the
//        proof obligation on the receiver is satisfied at each.
//   R8   (a) a COMPOSITE argument — a ternary arm; every arm must be proven,
//        so this row pins that a proven member arm no longer blocks the
//        reduction, and the `<actual>` renders the union.
//   R9   (a) an INDEX read whose target is a member read — the index arm's
//        proof obligation is its target.
//   R17  (a) sub-question (c) ADMITTED: an object-schema-typed field. TYPE-10
//        makes the declared `named` the value's type, so the read is a proof
//        and the sink renders the schema name.
//   R10  (b) consumer 1 — the unannotated-`let` marking guard: `let m = p.s`
//        then `g(m)`.
//   R11  (b) consumer 2 — the `par for` element inheritance:
//        `par for x in p.xs { g(x) }`.
//   L5   (c) the receiver-proof DIFFERENTIATOR: a PROVEN receiver at L1's exact
//        sink shape, which must emit. Without it group (c) is vacuous.
// The rows that are GREEN IN BOTH DIRECTIONS — the bounds a fix must not move:
//   R12  (b) CONTROL for consumer 2: the same `par for` over an ANNOTATED
//        iterand already emits, which is what makes R11's silence the arm's.
//   R13  (g) the METHOD-CALL half: `g(xs.join(","))` stays withheld.
//   R14  (d) an ABSENT field — the field-name mint, whose specified
//        disposition is a RUNTIME `theta/runtime/missing-object-key`
//        (`expressions.md`'s member-access bullet), not a parse `E`.
//   R15  (d) an absent field COLLIDING with a declared alias. The mint
//        resolves, so a member arm returning `typeOf` unconditionally would
//        emit a false `E` here.
//   R19  (d) an ENUM-VARIANT argument: the receiver resolves to nothing (the
//        `TypeEnv` records no `enum`), so the arm returns the receiver's own
//        `named` and the relation is `"unknown"`.
//   L4   (d) bug 0191's INHERITED constraint: an enum shadowed by a
//        same-spelled schema makes the receiver resolve, the variant falls
//        through to the field-name mint, and that mint must stay UNPROVEN
//        here.
//   S3   (d) an UNANNOTATED `fn` parameter as receiver — bug 0192's territory,
//        upstream of this arm.
//   R20  (d) cell u6's own vehicle, whose field `P` is declared `number`
//        against a `number` parameter: a COMPATIBLE relation, so the row keeps
//        reporting its own `binding-case-mismatch` and no fn-arg code.
//   S1   (e) a COMPATIBLE member read stays silent — the sink is opened, not
//        made noisy.
//   L1   (c) the RECEIVER-LAUNDERING bound, and the reason the receiver
//        obligation is a constraint rather than a preference.
//   L2   (c) the same erasure one binding on.
//   L6   (c) the same erasure through `match`.
//   R4   (f) the typed-`let` sibling sink on the same member read.
//   R5   (f) the constructor-field sibling sink on the same member read.
//
// ── TIER: unit, offline, provider-free, deterministic ───────────────────────
// Every row settles inside one `parseThetaDocument` call: the site under test
// is a predicate in the type layer of the load path and its whole observable is
// the document's aggregated `diagnostics` list. An INTEGRATION tier would add a
// session round-trip that observes neither the `CompatType` the predicate
// returns nor the diagnostic list. A LIVE tier would put a stochastic model
// between the fixture and a fully determined parse-time observable. Nothing in
// the settled route touches a live-exercised surface (the subagent child
// launch, the production drivers, the binder), so neither tier reaches a seam
// this one cannot. The registry-reachability question §Fix (e) answers ("no
// row is added, removed or re-triggered") is an H9a `permitted-codes.json`
// assessment for the fix run's own live pass, not for this witness.
//
// ── HARNESS ─────────────────────────────────────────────────────────────────
// The shared house driver `parseDoc` (tests/helpers/e2e-s1.ts), the real
// `parseThetaDocument` behind inert offline seams — the entry point bug 0190's
// §Reproduction measured every row through, and the one the two sibling
// witnesses this file is modelled on use
// (tests/member-access-declared-field-type.test.ts's whole-unfiltered-list
// `expectRow`, tests/plain-for-loop-variable-element-type.test.ts's loud
// site precondition). Every fixture carries `---\nmode: prompt\n---` and the
// trailing final value its §Reproduction row already carries; measured, the
// frontmatter changes no row's diagnostic list.
//
// ── THE DIAGNOSTIC ORACLE: DIAG-4 ───────────────────────────────────────────
// docs/spec_topics/diagnostics/diagnostic-shape.md DIAG-4 makes the registry's
// *Message* column normative and requires an asserting test to source its
// expected strings from it. Every message below is read through `parseRegistry`
// + `registryMessage` (tools/code-registry/index.js) and interpolated in ONE
// pass, with an unsupplied or unused placeholder throwing.
//
// ── NO SILENT SKIPPING (CLAUDE.md) ──────────────────────────────────────────
// Nothing here early-returns, branches on the environment, or skips. A missing
// registry row throws NAMING the row; a fixture that stopped parsing, or whose
// layout drifted, fails its own `PRECONDITION` naming the argument and
// member-read sites it found instead of letting a `toEqual([])` bound pass
// while measuring nothing. Every row asserts its WHOLE ordered code list AND
// its whole ordered message list, unfiltered, so an absent emission, an extra
// emission and a reordering all red.
//
// ── CITATION POSTURE ────────────────────────────────────────────────────────
// `src/` is cited by SYMBOL (`provableArgType`, `checkFnCallArgs`,
// `checkFnArgCompat`, `#typeExpr`'s `case "member"`, `typeOf`,
// `collectSchemaFields`, `resolveNamed`, `unfoldAlias`): implementation line
// spans in this corpus have drifted and chasing them is a separate report's
// class. Spec rules are cited by REQ-ID / named sentence (TYPE-9, TYPE-10,
// TYPE-11, DIAG-4, GOV-15, `expressions.md`'s member-access static-result-type
// sentence), registry rows by CODE, and sibling tests by CELL ID.

// ===========================================================================
// The DIAG-4 oracle.
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live `theta/parse/*` registry page — this file's only message oracle. */
const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)), "utf8"),
) as RegistryRow[];

/**
 * A registered code's normative *Message* template. Throws naming the registry
 * page when the row is absent, so a registry drift can never degrade an
 * assertion below into a comparison against `undefined`.
 */
function registered(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: ${REGISTRY_PAGE} carries no Message row for ${code} — the DIAG-4 column is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}

/**
 * Interpolate a registered template's `<…>` placeholders from `subs`, in one
 * pass so a substituted value is never re-scanned — `<actual>` legitimately
 * expands to text containing angle brackets.
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
const OBJECT_FIELD = "theta/parse/object-field-type-mismatch";
const BINDING_CASE = "theta/parse/binding-case-mismatch";
const MATCH_ARM = "theta/parse/match-arm-type-mismatch";

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

/** `field '<field>' on schema '<schema>' type mismatch: expected <expected>, got <actual>` */
function objectField(
  field: string,
  schema: string,
  expected: string,
  actual: string,
): string {
  return fill(
    OBJECT_FIELD,
    new Map([
      ["<field>", field],
      ["<schema>", schema],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `binding name must start with a lowercase letter or _` (no placeholders). */
function bindingCase(): string {
  return fill(BINDING_CASE, new Map());
}

/** `match arm body type does not match the common type of the other arms`. */
function matchArm(): string {
  return fill(MATCH_ARM, new Map());
}

/**
 * The one message every flip row in group (a) shares: `fn g(n: integer)` fed a
 * `string`. Named once so a row's identity is its fixture and not a retyped
 * expectation.
 */
const G_WANTS_INTEGER_GOT_STRING = (): string => fnArg("g", 0, "n", "integer", "string");

// ===========================================================================
// Parse harness. Frontmatter occupies lines 1–3, so every fixture body starts
// at line 4 and every range below is stated in whole-file coordinates.
// ===========================================================================

const FILE = "bug0190.theta";
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
 * Every VEHICLE site of `doc` in source order: each `fn`-call argument as
 * `arg <callee>#<i>@<range>`, each member read as `member .<field>@<range>`,
 * each method call as `method .<method>@<range>`.
 *
 * This is the loud precondition every row runs FIRST. `provableArgType`'s
 * verdict has no direct observable, so most rows below assert either one
 * emission or an absence; without an anchor a fixture that stopped parsing,
 * lost its member read, or drifted a column would let an absence row pass
 * while measuring nothing, and would let a flip row red for a layout reason
 * that looks like the withholding. The two sites this file is about — the
 * argument position and the member read feeding it — are exactly what it pins.
 */
function vehicleSites(doc: ThetaDocument, label: string): string[] {
  const out: string[] = [];
  /**
   * Fails loudly instead of returning: the PRECONDITION below treats this
   * list as complete, so a kind nobody wrote a case for must red rather than
   * drop out of it — a silent skip here is exactly the false pass AGENTS.md's
   * "No silent skipping" rule forbids.
   */
  const unhandledKind = (node: { readonly kind: string; readonly range: SourceRange }): never => {
    throw new Error(
      `harness: ${label} — vehicleSites has no case for AST kind "${node.kind}" @${at(node.range)}`,
    );
  };
  const walkExpr = (e: Expr): void => {
    switch (e.kind) {
      case "call":
        e.args.forEach((a, i) => out.push(`arg ${e.callee}#${i}@${at(a.range)}`));
        for (const a of e.args) walkExpr(a);
        return;
      case "invoke":
        e.args.forEach((a, i) => out.push(`arg invoke#${i}@${at(a.range)}`));
        for (const a of e.args) walkExpr(a);
        return;
      case "member":
        out.push(`member .${e.field}@${at(e.range)}`);
        walkExpr(e.target);
        return;
      case "method-call":
        out.push(`method .${e.method}@${at(e.range)}`);
        walkExpr(e.target);
        for (const a of e.args) walkExpr(a);
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
      case "match":
        walkExpr(e.scrutinee);
        for (const arm of e.arms) walkExpr(arm.body);
        return;
      case "par-for":
        walkExpr(e.iterand);
        if (e.max !== null) walkExpr(e.max);
        walkBlock(e.body);
        return;
      case "try":
        walkExpr(e.operand);
        return;
      case "result-ctor":
        walkExpr(e.arg);
        return;
      // Leaves: none of these carries a nested `Expr` field, so none can
      // carry a vehicle site either. Explicit no-ops, kept out of the throw
      // below so only a kind actually new to the union reaches it.
      case "ident":
      case "number":
      case "string":
      case "bool":
      case "null":
      case "query":
        return;
      default:
        return unhandledKind(e);
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
      case "for":
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
        const otherwise = s.otherwise;
        if (otherwise !== null) {
          if ("kind" in otherwise) walkStmt(otherwise);
          else walkBlock(otherwise);
        }
        return;
      }
      case "expr":
        walkExpr(s.expr);
        return;
      // A bare call statement parses as `tool-call`, so the argument sites of
      // `g(m)` written as a statement are reachable only through this label.
      case "tool-call":
        walkExpr(s.call);
        return;
      case "invoke":
        walkExpr(s.invoke);
        return;
      case "reassign":
        walkExpr(s.value);
        return;
      case "return":
        if (s.operand !== null) walkExpr(s.operand);
        return;
      // A statement-position query wraps one `QueryExpr`, itself always a
      // leaf (its `template` is a raw string, never a parsed `Expr`), so
      // routing it through `walkExpr` costs nothing and stays consistent with
      // how `tool-call` / `invoke` above unwrap their own `Expr` wrapper.
      case "query":
        walkExpr(s.query);
        return;
      // Declarations and control-flow leaves: none carries a nested `Expr`
      // field, so none can carry a vehicle site. Explicit no-ops, kept out of
      // the throw below so only a kind actually new to the union reaches it.
      case "break":
      case "continue":
      case "schema":
      case "enum":
      case "import":
      case "export":
      case "doc-comment":
        return;
      default:
        return unhandledKind(s);
    }
  };
  const body = doc.body;
  if (body === null) {
    throw new Error(
      `harness: the fixture produced no parsed body, so its diagnostic set is about a parse failure rather than the argument sink under test. Diagnostics: ${render(doc)}`,
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

/**
 * One row: the vehicle-site precondition, then the WHOLE ordered code list,
 * then the whole ordered message list — unfiltered, both. Filtering to the one
 * code under test would let a fix that opens the sink by breaking something
 * else (a new false emission beside the expected one, a lost sibling verdict)
 * pass, and the message list is what catches a fix that restores a code while
 * rendering the wrong type into its `<actual>` placeholder.
 */
function expectRow(
  label: string,
  body: string,
  sites: readonly string[],
  expected: Expectation,
  why: string,
): ThetaDocument {
  const doc = parse(body);
  expect(
    vehicleSites(doc, label),
    `${label} PRECONDITION: the fixture's argument and member-read sites must be exactly these, so a drifted or unparsed fixture fails here instead of letting the assertions below measure nothing. Diagnostics: ${render(doc)}`,
  ).toEqual([...sites]);
  expect(
    doc.diagnostics.map((d: Diagnostic) => d.code),
    `${label} — ${why}\n  actual diagnostics: ${render(doc)}`,
  ).toEqual([...expected.codes]);
  expect(
    doc.diagnostics.map((d: Diagnostic) => d.message),
    `${label} — DIAG-4: the rendered messages are the registry *Message* column interpolated\n  actual diagnostics: ${render(doc)}`,
  ).toEqual([...expected.msgs]);
  return doc;
}

// ===========================================================================
// (a) THE FLIP GROUP.
//
// RULE: a member read whose receiver is a proven read and whose field resolves
// to a DECLARED field type on an object schema is a proof of the value's type,
// and the `fn`-argument sink judges it. TYPE-9 conditions the obligation on
// "both operands statically resolvable"; `expressions.md`'s member-access
// bullet states the read's static result type outright ("the receiver's
// declared type for that field; TYPE-11 applies"). The registry row's *Trigger*
// covers the input verbatim — an argument "whose static type is not compatible
// with the matched parameter's declared type" — with no operand-kind
// restriction, so this is the GOV-15 diagnostic-registry carve-out in the
// addition direction and no row moves.
//
// Every cell here is `[]` at HEAD. A RED whose actual list is `[]` is the
// WITHHOLDING; a RED naming a parse error, an unknown identifier or a
// different code is a fixture defect and not this bug.
// ===========================================================================

const A_R1 =
  "schema P { s: string }\nfn g(n: integer): integer { n }\nfn f(p: P): integer { g(p.s) }\n1\n";
const A_R6 =
  "schema T = string\nschema P { s: T }\nfn g(n: integer): integer { n }\nfn f(p: P): integer { g(p.s) }\n1\n";
const A_R7 =
  "schema Q { s: string }\nschema P { q: Q }\nfn g(n: integer): integer { n }\nfn f(p: P): integer { g(p.q.s) }\n1\n";
const A_R8 =
  "schema P { s: string }\nfn g(n: integer): integer { n }\nfn f(p: P, b: boolean): integer { g(b ? p.s : 1) }\n1\n";
const A_R9 =
  "schema P { xs: array<string> }\nfn g(n: integer): integer { n }\nfn f(p: P): integer { g(p.xs[0]) }\n1\n";
const A_R17 =
  "schema Q { a: number }\nschema P { q: Q }\nfn g(n: integer): integer { n }\nfn f(p: P): integer { g(p.q) }\n1\n";

describe("bug 0190 (a) — the fn-argument sink judges a declared field type", () => {
  it("RED R1: `g(p.s)` with `p.s` declared `string` under an `integer` parameter fires once", () => {
    // The headline row, and the one-body statement of the defect: the callee,
    // the declared parameter and the call position are those of the controls
    // that already emit, and the only difference is the argument expression's
    // node kind. `checkFnCallArgs` reaches `provableArgType`, the shared arm
    // answers `undefined`, and the emission `checkFnArgCompat` would produce is
    // skipped.
    expectRow(
      "R1",
      A_R1,
      ["arg g#0@6:25-6:28", "member .s@6:25-6:28"],
      one(FN_ARG, G_WANTS_INTEGER_GOT_STRING()),
      "the declared field type is `string` and the declared parameter type is `integer`, both statically resolvable, so TYPE-9's qualifier is met and the row's *Trigger* covers the input",
    );
  });

  it("RED R6: an ALIAS-typed field reaches the sink through TYPE-11", () => {
    // The field is declared `T` and `schema T = string`. TYPE-11 makes the
    // alias transparent, and the proof the arm returns is the UNFOLDED type, so
    // the rendered `<actual>` is `string` and not the alias's own name — which
    // is also what keeps a `<type>`-position render admissible.
    expectRow(
      "R6",
      A_R6,
      ["arg g#0@7:25-7:28", "member .s@7:25-7:28"],
      one(FN_ARG, G_WANTS_INTEGER_GOT_STRING()),
      "TYPE-11 replaces the alias by its right-hand side wherever it appears, so an alias-typed field proves the same type its right-hand side does",
    );
  });

  it("RED R7: a NESTED receiver resolves through two object-schema hops", () => {
    // `p.q.s`: the inner read proves `Q` off `p`'s declared `q`, and the outer
    // read proves `string` off `Q`'s declared `s`. The receiver obligation is
    // satisfied at each hop, which is what makes the recursion the same rule
    // applied twice rather than a special case.
    expectRow(
      "R7",
      A_R7,
      ["arg g#0@7:25-7:30", "member .s@7:25-7:30", "member .q@7:25-7:28"],
      one(FN_ARG, G_WANTS_INTEGER_GOT_STRING()),
      "each hop's receiver is itself a proven read, so the innermost declared field type is what reaches the sink",
    );
  });

  it("RED R8: a COMPOSITE argument — a ternary arm — is no longer blocked by the member arm", () => {
    // The ternary's proof obligation is every arm, so the member arm's
    // `undefined` withheld the whole reduction. With the arm proven the union
    // reduction is a proof and the `<actual>` renders it, which is why this row
    // pins the union spelling rather than reusing group (a)'s shared message.
    expectRow(
      "R8",
      A_R8,
      ["arg g#0@6:37-6:48", "member .s@6:41-6:44"],
      one(FN_ARG, fnArg("g", 0, "n", "integer", "string | integer")),
      "a reduction is proven when every arm is; the member arm was the one unproven arm, and the union it joins is what the parameter is judged against",
    );
  });

  it("RED R9: an INDEX read whose target is a member read is judged on the element", () => {
    // The index arm puts its proof obligation on the TARGET and keeps the
    // element narrowing from `typeOf`, so a member-read target withheld the
    // whole read. `p.xs` is declared `array<string>`, so the element is
    // `string`.
    expectRow(
      "R9",
      A_R9,
      ["arg g#0@6:25-6:32", "member .xs@6:25-6:29"],
      one(FN_ARG, G_WANTS_INTEGER_GOT_STRING()),
      "the index arm's proof obligation is its target, and a declared `array<string>` field satisfies it",
    );
  });

  it("RED R17: an OBJECT-SCHEMA-typed field is a proof — sub-question (c), ADMITTED", () => {
    // The adjudicated sub-case. The field's declared type is that schema's own
    // `named`, TYPE-10 makes that nominal type the value's type, and the
    // sibling typed-`let` sink already judges it — so admitting it is what
    // makes the three sinks agree on one operand. The `<actual>` renders the
    // schema name, which is the admissible render for a named schema.
    expectRow(
      "R17",
      A_R17,
      ["arg g#0@7:25-7:28", "member .q@7:25-7:28"],
      one(FN_ARG, fnArg("g", 0, "n", "integer", "Q")),
      "TYPE-10 makes the declared `named` the value's type rather than a spelling, so an object-schema-typed field is a proof and `Q ⋢ integer` is a genuine mismatch",
    );
  });
});

// ===========================================================================
// (b) THE CONSUMER GROUP — sub-question (d), one cell per consumer of the same
// predicate.
//
// RULE: `provableArgType` is not only the argument sink's gate. It is also the
// identity channel for the unannotated-`let` marking guard (which records a
// binding in `unprovableBindings` when the initialiser is unproven) and for the
// `par for` element inheritance (which marks the element unprovable when the
// iterand is unproven). A member read that is proven at the argument position
// is proven at both, so each consumer's own sinks become live on the same input
// class — and the fix states the intended value for each rather than
// discovering it.
//
// DISCLOSED DRIFT: bug 0190 §Fix (d) enumerates TWO consumers, measured before
// bug 0126's fix shipped (0.107.0). At this tree `walkStmt`'s `case "for"`
// mirrors the `par for` arm's marking, so the plain-`for` element is a THIRD
// consumer and the widening travels one hop further than the document says. Its
// witness is cell e4 of tests/plain-for-loop-variable-element-type.test.ts,
// re-pinned under bug 0190's authority from that file's side rather than
// duplicated here.
// ===========================================================================

const B_R10 =
  "schema P { s: string }\nfn g(n: integer): integer { n }\nfn f(p: P): integer { let m = p.s\n g(m) }\n1\n";
const B_R11 =
  "schema P { xs: array<string> }\nfn g(n: integer): integer { n }\nfn f(p: P): integer { par for x in p.xs { g(x) }\n 1 }\n1\n";
const B_R12 =
  'fn g(n: integer): integer { n }\nlet xs: array<string> = ["a"]\npar for x in xs { g(x) }\n1\n';

describe("bug 0190 (b) — the predicate's two other consumers move with it", () => {
  it("RED R10: CONSUMER 1, the unannotated-`let` marking guard", () => {
    // `let m = p.s` asks `provableArgType` about its initialiser and marks `m`
    // unprovable on `undefined`. With the member arm proven the binding is
    // proven, and the sink one hop on judges the same `string` the field
    // declares. The argument here is an `ident`, so a RED that names the
    // MEMBER position instead would mean the marking guard was missed.
    expectRow(
      "R10",
      B_R10,
      ["member .s@6:31-6:34", "arg g#0@7:4-7:5"],
      one(FN_ARG, G_WANTS_INTEGER_GOT_STRING()),
      "the binding's recorded type is the initialiser's proof, so a proven member-read initialiser makes the binding-typed argument judgeable",
    );
  });

  it("RED R11: CONSUMER 2, the `par for` element inheritance", () => {
    // The `par for` arm records the iterand's ELEMENT type for the loop
    // variable and marks it unprovable when the iterand is unproven. `p.xs` is
    // declared `array<string>`, so every iteration hands `g` a `string` — the
    // same true positive the annotated-iterand control R12 already reports.
    expectRow(
      "R11",
      B_R11,
      ["member .xs@6:36-6:40", "arg g#0@6:45-6:46"],
      one(FN_ARG, G_WANTS_INTEGER_GOT_STRING()),
      "a proven iterand's element is a proof, so the element-typed argument inside the body is judged exactly as R12's is",
    );
  });

  it("CONTROL R12: consumer 2's control — the same loop over an ANNOTATED iterand already fires", () => {
    // Green in both directions, and the row that makes R11's silence
    // attributable to the arm rather than to the `par for` machinery: identical
    // loop, identical body, identical element type, and the only difference is
    // how the iterand reaches its type.
    expectRow(
      "R12",
      B_R12,
      ["arg g#0@6:21-6:22"],
      one(FN_ARG, G_WANTS_INTEGER_GOT_STRING()),
      "the annotated `array<string>` binding is already a proof, so this emission exists today and must survive unchanged",
    );
  });
});

// ===========================================================================
// (c) THE RECEIVER-PROOF GROUP.
//
// RULE: the member arm proves a read only when the RECEIVER is itself a proven
// read. A receiver whose own reduction was NOT a proof carries a declared type
// the runtime need not produce, so judging that receiver's declared field would
// refuse a program the declared types accept.
//
// L1 is the measurement that makes this a constraint. `let m = flag ? A {…} :
// B {…}` is not a proven reduction — the reduction discards the `B` arm — so
// `m` is recorded in `unprovableBindings`. The runtime can hand `g` a `B` whose
// `s` IS the `integer` the parameter declares, so judging `A`'s `s` emits a
// false `E`. Measured: WITHOUT the receiver obligation L1 emits
// `expected integer, got string`. L5 is the paired differentiator at the same
// sink shape with a PROVEN receiver, so neither direction of this group is
// vacuous.
// ===========================================================================

const C_L1 =
  'schema A { s: string }\nschema B { s: integer }\nfn g(n: integer): integer { n }\nlet flag = true\nlet m = flag ? A { s: "x" } : B { s: 1 }\nlet r = g(m.s)\nr\n';
const C_L2 =
  'schema A { s: string }\nschema B { s: integer }\nfn g(n: integer): integer { n }\nlet flag = true\nlet m = flag ? A { s: "x" } : B { s: 1 }\nlet v = m.s\nlet r = g(v)\nr\n';
const C_L6 =
  'schema A { s: string }\nschema B { s: integer }\nfn g(n: integer): integer { n }\nlet k = 1\nlet m = match k { 1 => A { s: "x" }, _ => B { s: 1 } }\nlet r = g(m.s)\nr\n';
const C_L5 =
  'schema A { s: string }\nfn g(n: integer): integer { n }\nlet m = A { s: "x" }\nlet r = g(m.s)\nr\n';

describe("bug 0190 (c) — a member read off an UNPROVEN receiver stays withheld", () => {
  it("BOUND L1: a receiver laundered through an unproven ternary draws nothing", () => {
    // Green in both directions, and the row a member arm that returned
    // `typeOf(expr)` unconditionally reds: the emission it would produce names
    // `A`'s declared `s` on a value the runtime may take from `B`, where the
    // field is the `integer` the parameter wants. That is the false-`E` species
    // the whole proof gate exists to refuse.
    expectRow(
      "L1",
      C_L1,
      ["arg g#0@9:11-9:14", "member .s@9:11-9:14"],
      CLEAN,
      "the receiver's own reduction discards an arm, so its declared type is not a proof of the value's type and neither is any field read off it",
    );
  });

  it("BOUND L2: the same erasure one binding on draws nothing", () => {
    // The marking guard's half of the same bound: `let v = m.s` must not record
    // `v` as proven, so the argument sink one hop on withholds too. A RED here
    // with L1 green would mean the receiver obligation was applied at the
    // argument position and skipped at the binding position.
    expectRow(
      "L2",
      C_L2,
      ["member .s@9:9-9:12", "arg g#0@10:11-10:12"],
      CLEAN,
      "an unproven read cannot become proven by passing through a binding, so the marking guard inherits the receiver obligation",
    );
  });

  it("BOUND L6: the same erasure through `match` draws its own arm diagnostic and no fn-arg code", () => {
    // The third route to an unproven receiver. This fixture's `match` arms
    // carry no common type, so it draws `theta/parse/match-arm-type-mismatch`
    // in both directions — asserted here as the whole list, so a fn-arg code
    // appearing BESIDE it reds even though the list is non-empty.
    expectRow(
      "L6",
      C_L6,
      ["arg g#0@9:11-9:14", "member .s@9:11-9:14"],
      one(MATCH_ARM, matchArm()),
      "the `match` reduction is not a proof either, and its own arm verdict is the only diagnostic this program owes",
    );
  });

  it("RED L5: a PROVEN receiver at L1's exact sink shape fires — the differentiator", () => {
    // Without this cell group (c) is three absences a fix could satisfy by
    // withholding on every member read, which is the defect. `let m = A { s:
    // "x" }` records a constructor-minted `named A` — a proof, since an `A {…}`
    // constructor does produce an `A` — so the receiver obligation is met and
    // `A`'s declared `s` is judged.
    expectRow(
      "L5",
      C_L5,
      ["arg g#0@7:11-7:14", "member .s@7:11-7:14"],
      one(FN_ARG, G_WANTS_INTEGER_GOT_STRING()),
      "a constructed value's nominal type is a proof, so the field read off it is one too; this is the emission the receiver obligation must leave intact",
    );
  });
});

// ===========================================================================
// (d) THE FALLBACK-BOUND GROUP.
//
// RULE: of the member arm's three outcomes, exactly the RESOLVED one is a
// proof. The receiver's own `named` for an unresolvable receiver, and the
// field-name mint for an absent field / a fields-less declaration / a declined
// `typeSource`, both stay UNPROVEN.
//
// R14 and R15 are why this is a constraint. `p.zzz` on `schema P { s: string }`
// has no own key, so the arm mints `named "zzz"`; `expressions.md`'s
// member-access bullet assigns that program a RUNTIME
// `theta/runtime/missing-object-key`, not a parse `E`. R15 adds the hazard: a
// declared `schema Zzz = integer` makes the minted name RESOLVE, so an
// unconditional judgement would emit a false `E` on a program whose specified
// disposition is a panic. The field name is author-chosen and unconstrained —
// the lowercase-first rule binds DECLARED field names, and `p.Zzz` declares
// nothing.
// ===========================================================================

const D_R14 =
  "schema P { s: string }\nfn g(n: integer): integer { n }\nfn f(p: P): integer { g(p.zzz) }\n1\n";
const D_R15 =
  'schema Zzz = integer\nschema P { s: string }\nfn g(n: string): string { n }\nfn f(p: P): string { g(p.Zzz) }\n"t"\n';
const D_R19 = "enum Color { Red }\nfn g(n: integer): integer { n }\nlet r = g(Color.Red)\nr\n";
const D_L4 =
  "enum Color { Red }\nschema Color { a: integer }\nschema Red = string\nfn g(n: integer): integer { n }\nlet r = g(Color.Red)\nr\n";
const D_S3 =
  "schema P { s: string }\nfn g(n: integer): integer { n }\nfn f(p): integer { g(p.s) }\n1\n";
const D_R20 =
  "schema P { a: number }\nschema W { P: number }\nfn f(n: number): number { 1 }\nlet v = W { P: 3 }\nlet r = f(v.P)\nr\n";

describe("bug 0190 (d) — the two fallbacks stay unproven", () => {
  it("BOUND R14: an ABSENT field draws nothing", () => {
    expectRow(
      "R14",
      D_R14,
      ["arg g#0@6:25-6:30", "member .zzz@6:25-6:30"],
      CLEAN,
      "the field-name mint is not a declared field type, and the absent-field disposition is a runtime panic the parse must not pre-empt",
    );
  });

  it("BOUND R15: an absent field COLLIDING with a declared alias draws nothing", () => {
    // The sharpest bound in the file. `named "Zzz"` resolves to
    // `schema Zzz = integer` against a `string` parameter, so the relation is a
    // genuine incompatibility on a type the read never produces. The sibling
    // typed-`let` sink judges this collision today and renders `got Zzz`; the
    // argument sink must not acquire that render.
    expectRow(
      "R15",
      D_R15,
      ["arg g#0@7:24-7:29", "member .Zzz@7:24-7:29"],
      CLEAN,
      "a minted field name that happens to resolve is still a spelling and not the value's type, so judging it would refuse a program the declared types accept",
    );
  });

  it("BOUND R19: an ENUM-VARIANT argument draws nothing", () => {
    // `collectTypeEnv` records `schema` declarations only, so the receiver
    // `named "Color"` resolves to nothing and the arm returns the receiver's
    // own `named` — the second fallback. `checkCompatible` answers `"unknown"`
    // for it, which is the deferral TYPE-9's resolvability qualifier licenses.
    expectRow(
      "R19",
      D_R19,
      ["arg g#0@6:11-6:20", "member .Red@6:11-6:20"],
      CLEAN,
      "an unresolvable receiver yields the receiver's own `named`, which proves nothing about the variant's value",
    );
  });

  it("BOUND L4: an enum SHADOWED by a same-spelled schema stays unproven", () => {
    // bug 0191's constraint, inherited rather than resolved here
    // (docs/bugs/0191-enum-name-shadowed-by-schema-fabricates-member-type.md).
    // `schema Color` makes the receiver RESOLVE, so the variant falls through
    // to the field-name mint, and `schema Red = string` makes that mint
    // resolve. This is R15's hazard in the enum namespace, and the same
    // withholding covers it.
    expectRow(
      "L4",
      D_L4,
      ["arg g#0@8:11-8:20", "member .Red@8:11-8:20"],
      CLEAN,
      "a resolved receiver whose field has no own key still yields the mint, so the shadowed-enum read is unproven at this sink whatever bug 0191 decides about the read itself",
    );
  });

  it("BOUND S3: an UNANNOTATED `fn` parameter as receiver draws nothing", () => {
    // bug 0192's territory, upstream of this arm
    // (docs/bugs/0192-params-receiver-type-not-threaded-into-type-layer.md): an
    // unannotated parameter records no declared type, so the receiver types
    // through the identifier fallback, resolves to nothing, and the read is the
    // receiver's own `named`. This bound is what keeps the fix from inferring a
    // receiver type it was not given.
    expectRow(
      "S3",
      D_S3,
      ["arg g#0@6:22-6:25", "member .s@6:22-6:25"],
      CLEAN,
      "no declared receiver type means no declared field type, so the read stays a deferral rather than becoming a guess",
    );
  });

  it("BOUND R20: a COMPATIBLE declared field on cell u6's own vehicle stays silent", () => {
    // The vehicle the protected witness pins at cell u6, carried here for the
    // whole-list assertion that cell's helper does not make. Its field `P` is
    // declared `number` against a `number` parameter, so the opened sink
    // relates `number ⊑ number` and stays silent — a COMPATIBLE relation, not
    // a withheld one. Its own `binding-case-mismatch` (the PascalCase field
    // name) is unrelated to this fix and must remain the only diagnostic.
    expectRow(
      "R20",
      D_R20,
      ["arg f#0@8:11-8:14", "member .P@8:11-8:14"],
      one(BINDING_CASE, bindingCase()),
      "the declared field type and the declared parameter type agree, so opening the sink adds nothing to this program in either direction",
    );
  });
});

// ===========================================================================
// (e) THE COMPATIBLE-READ BOUND.
//
// RULE: opening the sink makes it judge, not emit. A member read whose declared
// field type IS compatible with the parameter keeps loading with zero
// diagnostics. This is the row an over-broad fix breaks first, and the GOV-15
// half of the addition direction: the loads-cleanly predicate selects programs
// emitting no `E` today, and this one must keep emitting none.
// ===========================================================================

const E_S1 =
  "schema P { s: string }\nfn g(n: string): string { n }\nfn f(p: P): string { g(p.s) }\n1\n";

describe("bug 0190 (e) — a compatible member read keeps loading clean", () => {
  it("BOUND S1: `g(p.s)` with a `string` field under a `string` parameter draws nothing", () => {
    expectRow(
      "S1",
      E_S1,
      ["arg g#0@6:24-6:27", "member .s@6:24-6:27"],
      CLEAN,
      "TYPE-1 reflexivity on the declared field type: the sink is opened for judgement, and its judgement here is that nothing is owed",
    );
  });
});

// ===========================================================================
// (f) THE SIBLING-SINK AGREEMENT GROUP — green in both directions.
//
// RULE: one operand, one verdict, across sinks. The typed-`let` sink, the
// constructor-field sink and the argument sink read the same `typeOf` seam;
// which sink asks must not change the answer. These two rows report TODAY on
// the same member read group (a)'s R1 uses, with `string` — the DECLARED field
// type — in the `<actual>` position, so they are the substrate half of R1's
// claim measured independently of the predicate under test.
//
// A RED here means the substrate stopped resolving the read, which would make
// every red in group (a) unattributable — these two cells are what separates
// "the sink withholds" from "the field type never arrives".
// ===========================================================================

const F_R4 =
  "schema P { s: string }\nfn f(p: P): integer { let n: integer = p.s\n n }\n1\n";
const F_R5 =
  "schema P { s: string }\nschema S { n: number }\nfn f(p: P): number { let q = S { n: p.s }\n 1 }\n1\n";

describe("bug 0190 (f) — the sibling sinks already judge this read", () => {
  it("SUBSTRATE R4: the typed-`let` sink renders the declared field type", () => {
    expectRow(
      "R4",
      F_R4,
      ["member .s@5:40-5:43"],
      one(LET_RHS, letRhs("n", "integer", "string")),
      "`string` in the `<actual>` position is the declared field type reaching a sink through the same seam the argument sink reads — green in both directions",
    );
  });

  it("SUBSTRATE R5: the constructor-field sink renders the same declared field type", () => {
    expectRow(
      "R5",
      F_R5,
      ["member .s@6:37-6:40"],
      one(OBJECT_FIELD, objectField("n", "S", "number", "string")),
      "the second sibling sink on the same read reaches the same `string`, so two of the three sinks agree today and the third is the one this fix moves — green in both directions",
    );
  });
});

// ===========================================================================
// (g) THE METHOD-CALL BOUND — green in both directions.
//
// RULE: the split leaves `case "method-call"` alone. `#typeExpr`'s
// `case "method-call"` still mints from the author-chosen METHOD name, so that
// read proves nothing about the value and withholding there is sound. The
// resolution a sound judgement would need is the stdlib signature table, which
// is a separate, unfiled position.
//
// A RED here means the split swept the method label in with the member label —
// the single most likely way to over-apply this fix, and the reason the two
// labels stop sharing a body rather than sharing a widened one.
// ===========================================================================

const G_R13 =
  'fn g(n: integer): integer { n }\nlet xs: array<string> = ["a"]\nlet r = g(xs.join(","))\nr\n';

describe("bug 0190 (g) — the method-call half stays withheld", () => {
  it("BOUND R13: `g(xs.join(\",\"))` draws nothing", () => {
    expectRow(
      "R13",
      G_R13,
      ["arg g#0@6:11-6:23", "method .join@6:11-6:23"],
      CLEAN,
      "the method read's static type is the method's own name, which is not the type of the value the call produces, so this half of the shared arm keeps its `undefined`",
    );
  });
});
