import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { Block, Expr, Stmt, ThetaDocument } from "../src/parser/theta-document";
import { errors, parseDoc } from "./helpers/e2e-s1";

// Bug 0050 — `theta/parse/fn-arg-type-mismatch` is a registered `E` row whose
// sole emitter, `checkFnArgCompat` (src/parser/type-compat.ts:452), has no
// caller in `src/`, so a plain top-level `fn` call binds a mistyped argument
// with no parse-time judgement
// (docs/bugs/0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md).
//
// THE ROUTE UNDER TEST — the bug's §Fix disposition 1, "wire the caller", and
// not one step wider. One emission site is added at `TypeLayerWalk.walkExpr`'s
// `call` arm (src/parser/type-layer-checks.ts:2033–2038), which at this HEAD
// walks the argument expressions and relates none of them to the callee's
// declared parameter types. `invoke` shares that arm's label and is deliberately NOT
// swept in: it carries its own registry row and its own separately-unwired
// emitter (cell x1).
//
// THE POST-FIX CONTRACT THIS FILE PINS, cell by cell:
//
//   r1–r6, s1   the code fires — exactly one diagnostic, severity `error`, the
//               registry-sourced Message, ranged on the ARGUMENT node.
//   c1–c3       the two wired sibling sinks and the unknown-callee arm keep
//               their byte-identical verdicts and gain no new code.
//   ok1, ok2    a compatible argument keeps loading with zero diagnostics.
//   d1, d2      an unannotated parameter and an annotation naming nothing
//               declared defer (type-system.md:48), emitting nothing.
//   x1–x3       the three callee kinds the row's Trigger excludes — `invoke`, a
//               `.theta` callable, a Pi tool — stay outside the check.
//   i1          the imported-`.thetalib` route defers, documented as such.
//   sh1–sh3     a local binder outranks the top-level `fn` at every call
//               position (expressions.md:46), so the check withholds.
//   u1–u5       bug 0081's union arm closed this group's erasure: each read is
//               now a proven union, and the argument sink judges it for real.
//   u6, u6p,    a member read of a DECLARED field on a RESOLVED object schema
//   u6b, u6c    IS a proof of the read value's type (bug 0136, 0.106.0, and
//               `expressions.md`'s member-access static-result-type sentence),
//               so u6p judges one; the FIELD-NAME MINT that survives for an
//               absent field or an unresolvable receiver is not, so u6b and
//               u6c refuse it. u6 itself is silent on a COMPATIBLE relation
//               rather than a withheld read: its field `P` is declared
//               `number` against a `number` parameter. u6p is RED until the
//               shared arm splits; u6, u6b and u6c hold in both directions.
//               Authority for this re-derivation:
//               docs/bugs/0190-fn-arg-sink-withholds-provable-member-reads.md
//               §Fix (f).
//   u7, u7p     an index read's proof obligation belongs to the target, not the
//               element narrowing alone; bug 0081 makes u7's target a proof
//               where it used to be an erasure, so both cells now emit.
//   u8, u8b,    a `named` type minted from a CALLEE name is not a proof of the
//   u8p         call's value type; u8p is the positive differentiator — the
//               same `named F` reached through the constructor form emits.
//   u9, u9b,    a `named` type minted from an IDENTIFIER's OWN SPELLING is not
//   u9c, u9d,   a proof either, over the three routes the walk's `bindings` map
//   u9p         omits — a `match`-arm binder, an unannotated `fn` parameter, a
//               bare schema reference; u9 and u9p are the positive
//               differentiators — a plain `for` variable carries the iterand's
//               proven element (bug 0126,
//               docs/bugs/0126-plain-for-binds-no-loop-variable.md) and a
//               `par for` variable is recorded the same way, so both emit off
//               the record rather than off the spelling.
//   u10, u10b,  an ARITHMETIC result read as a NON-NUMERIC type is not a proof
//   u10c, u10d  of the value the operator produces, across unary `-` and binary
//               `-`, `*`, `/`, `%`.
//   u10p,       the differentiators for that group: a numeric negation over
//   u10pb,      both numeric `CompatType` shapes, a numeric arithmetic
//   u10pc       reduction, and `+`'s untouched both-`string` and numeric
//               shapes — every one of them keeps emitting.
//   u11, u11b,  a SELF-SHADOWING `let` initialiser reads the OUTER binding, as
//   u11c        the runtime does; bug 0081 makes that outer binding a
//               proof across all three composite routes (ternary,
//               arithmetic, array-through-index), so all three now
//               emit alongside u11p, the differentiator that was
//               always positive.
//   u12, u12b,  a binder that SHADOWS a same-named outer record — a `for`
//   u12c, u12d  variable, a `match` pattern binding (both inside the arm body
//               and through the argument-position reduction), an unannotated
//               `fn` parameter — is resolved in the scope the runtime evaluates
//               it in, so the outer record it hides is never read as the
//               argument's type; u12e is the plain-`for` cell whose record is a
//               PROVEN element (bug 0126), so its mismatch fires.
//   u12p,       the differentiators for that group: an outer PROVEN binding
//   u12pb,      that is NOT shadowed stays visible inside a `for` body and
//   u12pc,      inside a `match` arm, an ANNOTATED parameter's record still
//   u12pd,      wins over a same-named outer binding (alone, and beside an
//   u12pe       unannotated sibling parameter), and a `par for` variable's
//               element record still wins over one.
//   u13, u13b,  the four SHADOWING routes. u13c and u13d read a `match`-arm
//   u13c, u13d  binder, a WITHHELD entry spelled with a name no declaration
//               can share, and the sinks whose verdict a withheld read can
//               flip withhold it: an object-field value and a `par for`
//               iterand both draw nothing on one. u13 and u13b read a plain
//               `for` variable, which carries the iterand's PROVEN element
//               (bug 0126), so their typed-`let` sink judges that element and
//               accepts it — what those two discriminate is the sink's
//               channel, the RECORDED element type and never the binder's
//               spelling.
//   u13m,       the MISS class — the same sinks with nothing shadowed. u13mb
//   u13mb,      and u13mc read a `match`-arm binder, a WITHHELD entry, so those
//   u13mc,      sinks withhold with it; u13m, u13md, u13me, u13mf and u13mg
//   u13md,      read a plain `for` variable, which carries the iterand's PROVEN
//   u13me,      element (bug 0126), so each sink judges that element — it
//   u13mf,      satisfies the sink at u13m / u13md / u13mf / u13mg and
//   u13mg,      disagrees with it at u13me, which fires u12e's species for
//   u13mh,      real. u13mf and u13mg are the two stdlib preconditions that
//   u13mi,      refuse an unresolvable type rather than deferring on it
//   u13mj,      (`array.join`'s element, the object-index key). u13mh and u13mi
//   u13mk,      are the withheld-fed cells of the two sinks whose verdict the
//   u13ml,      withhold DECIDES: the read sits inside a composite, so the
//   u13mm       `array.join` element precondition and the primitive-annotated
//               `let` RHS each have a structure to judge and a hole in it.
//               u13mj, u13mk and u13ml are the same class at the three
//               remaining such sinks; u13mm is a second binder class at the
//               already-pinned `join` sink, not a fourth sink. u13mj: the
//               inferred `subagent fn` payload
//               is an `array` the declared `integer` refuses by outer kind, so
//               the annotation check cannot defer on the sentinel. u13mk: a
//               schema field declared `array<T>` sends each branch through the
//               element sink's structural relation — the typed-`let` route
//               cannot reach it, its own gate answers first. u13ml: the read is
//               a PART of the field value, so the declared primitive is decided
//               against an `array` outer kind rather than deferred on. u13mm:
//               the join element over a `match`-arm binder, the binder class
//               u13mh does not carry.
//   u13p,       the differentiators for that group, one per withheld sink: a
//   u13pb,      typed `let`, both iterand call sites, an object-field value, an
//   u13pc,      array element, a `subagent fn` return annotation, a `join`
//   u13pd,      element and an object-index key all keep reporting when the
//   u13pe,      read they judge is not a withheld binder.
//   u13pf,
//   u13pg,
//   u13ph
//   u13e        the marking channel's identity leak (round-7 residual R1) — a
//               withheld TRUE positive, pinned with its flip condition.
//   u13r        the one place a user-visible message still renders the sentinel:
//               a composite BUILT from a withheld read, at a row whose verdict
//               its outer kind decides.
//   e1          the three shipped example files keep loading clean (GOV-15).
//   a1          argument COUNT stays unjudged at parse — bug 0131, open.
//
// RED / GREEN AT THIS HEAD (7c8833cd, offline, deterministic). r1–r6, s1 and
// every positive-differentiator cell for the fn-arg code (u7p, u8p, u9p, u10p,
// u10pb, u10pc, u11p, u12p, u12pb, u12pc, u12pd, u12pe) are RED: the code is
// emitted nowhere, so each expects one diagnostic and gets none. The u13 group
// is measured against the SIBLING rows, which this HEAD already emits, so its
// colours differ: u13m – u13mg are RED (this HEAD judges those reads off the
// identifier's own spelling) and so is u13r (this HEAD renders the binder's
// spelling where the sentinel now stands), while u13 – u13d, the eight u13p*
// differentiators and u13e are GREEN at this HEAD and required to stay so. Every
// other cell is GREEN, and most of them are green VACUOUSLY —
// they assert that a code absent from the whole tree is absent from one
// fixture. Each becomes a real guard only once the emission site exists, which
// is why every such cell states the condition that would make it red after the
// fix rather than merely naming the code.
//
// TIER — unit, offline, provider-free, deterministic. The whole route is
// witnessable at the `parseThetaDocument` boundary through the house driver
// `parseDoc` (tests/helpers/e2e-s1.ts:39), the same entry point the sibling
// sink's own witness uses (tests/ctor-field-type-check.test.ts, bug 0031).
// Nothing on this path crosses a provider, a model, a child process or the
// network, so neither an integration nor a live test reaches a seam a unit test
// cannot.
//
// NO SILENT SKIPPING (CLAUDE.md). A missing registry row throws naming the
// registry page, a fixture whose call node cannot be located throws naming the
// fixture, and every negative cell pins an exact emission list rather than a
// bare absence.
//
// SPEC ANCHORS (line numbers re-derived against the tree at this HEAD):
//   - docs/spec_topics/diagnostics/code-registry-parse.md:116 — the row. Sev
//     `E`, phase `type`. Its Trigger names "a plain top-level `fn` call
//     `f(args)` — a same-file or imported `.thetalib` function call that is
//     neither an `invoke(...)` nor a `.theta`-callable call", which is the
//     source of the x1–x3 exclusions and of i1's route.
//   - docs/spec_topics/type-system.md:27 — the enumeration of the positions the
//     `⊑` relation governs, which includes "a function-argument slot"; :50
//     TYPE-9, which names this code for that slot; :52 TYPE-10, which routes a
//     cross-named-schema mismatch here rather than to a runtime AJV failure
//     (cell r6); :48 §Unresolvable operands, the deferral the emitter already
//     implements at src/parser/type-compat.ts:463–465 (cells d1, d2, i1).
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:74 — DIAG-4: the
//     *Message* column is normative and a test MUST source the string from it.
//     Every expected message below is read through `registryMessage`; :71
//     DIAG-1 entitles this file to assert the specific code at the site.
//   - docs/spec_topics/expressions.md:44–49 — identifier resolution in call
//     position, first match wins: a local `let` binding or function parameter
//     (:46) outranks a top-level `fn` (:47), an imported symbol (:48) and a
//     callable-set entry (:49); :51 — "Local bindings (1) shadow everything
//     else lexically". Cells sh1–sh3.
//   - docs/spec_topics/functions.md:50 — a `subagent fn` "is identical to an
//     ordinary `fn` in its parameter list, positional call form, and
//     inferred-and-validated return type"; :58 FN-6 and :61 "Parameters bind
//     positionally as for `fn` and `invoke`". Cell s1.
//   - docs/spec_topics/governance/source-language-stability.md:5 GOV-15, :9 the
//     loads-cleanly predicate (no diagnostic of effective severity `E`), :25
//     the diagnostic-registry carve-out that admits this addition inside a
//     theta 1.x minor. Cell e1 is the blast-radius half of that carve-out.

// ===========================================================================
// DIAG-4 — every expected Message is read from the registry, never copied.
// ===========================================================================

const CODE = "theta/parse/fn-arg-type-mismatch";
const LET_RHS_CODE = "theta/parse/let-rhs-type-mismatch";
const OBJECT_FIELD_CODE = "theta/parse/object-field-type-mismatch";
const UNKNOWN_IDENT_CODE = "theta/parse/unknown-identifier";
const ARITY_TOO_FEW_CODE = "theta/parse/invoke-arity-too-few";
const ARITY_TOO_MANY_CODE = "theta/parse/invoke-arity-too-many";
// The sibling rows the u13 group measures: each reads a type straight out of
// the walk's scope map, so each is a consumer of the WITHHELD binder entry.
const NON_ARRAY_ITERAND_CODE = "theta/parse/non-array-iterand";
const ARRAY_ELEMENT_CODE = "theta/parse/array-element-type-mismatch";
const NON_BOOLEAN_CODE = "theta/parse/non-boolean-condition";
const INVOKE_RETURN_CODE = "theta/parse/invoke-return-type-mismatch";
const ARRAY_JOIN_CODE = "theta/parse/non-string-array-join";
const OBJECT_INDEX_CODE = "theta/parse/non-string-object-index";
// bug 0139's parameter-position case rule: `fn h(P: …)`'s own spelling draws
// this code independently of any WITHHELD-entry read, so it is not one of the
// sibling rows above — cells u13b–u13d each draw it alongside their sibling
// row.
const BINDING_CASE_CODE = "theta/parse/binding-case-mismatch";
// bug 0141's pattern-head refusal: a capitalised bare pattern head names no
// pattern production per docs/spec_topics/expressions.md's disambiguation
// sentence, so `P => …` draws this code at the arm head, independently of
// any WITHHELD-entry read a sibling row makes of the SAME name inside the
// arm body — cells u13c, u13d, u13mb and u13mc each draw it alongside (or in
// place of) their sibling-row assertion.
const CAP_PATTERN_HEAD_CODE = "theta/parse/capitalised-pattern-head";

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** The live `theta/parse/*` registry page — the DIAG-4 oracle for this file. */
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
 * pass so a substituted value is never re-scanned — `<expected>` legitimately
 * expands to text containing angle brackets (`array<number>`, cell r4).
 *
 * The placeholder set is derived from the TEMPLATE, not assumed: an unsupplied
 * placeholder and an unused substitution both throw, so a registry row that
 * changes shape fails loudly here instead of quietly producing a string no
 * emission can equal.
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

/** `fn '<name>' argument <i> ('<param>') type mismatch: expected <expected>, got <actual>`. */
function fnArgMessage(
  fnName: string,
  index: number,
  paramName: string,
  expected: string,
  actual: string,
): string {
  return fill(
    CODE,
    new Map([
      ["<name>", fnName],
      ["<i>", String(index)],
      ["<param>", paramName],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `let binding '<name>' initialiser type mismatch: expected <expected>, got <actual>`. */
function letRhsMessage(name: string, expected: string, actual: string): string {
  return fill(
    LET_RHS_CODE,
    new Map([
      ["<name>", name],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `field '<field>' on schema '<schema>' type mismatch: expected <expected>, got <actual>`. */
function objectFieldMessage(
  field: string,
  schema: string,
  expected: string,
  actual: string,
): string {
  return fill(
    OBJECT_FIELD_CODE,
    new Map([
      ["<field>", field],
      ["<schema>", schema],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `unknown identifier '<name>'`. */
function unknownIdentifierMessage(name: string): string {
  return fill(UNKNOWN_IDENT_CODE, new Map([["<name>", name]]));
}

/** `capitalised pattern head '<name>' names no pattern production`. */
function capitalisedPatternHeadMessage(name: string): string {
  return fill(CAP_PATTERN_HEAD_CODE, new Map([["<name>", name]]));
}

/** `'for' expects array<T> after 'in'; got <type>`. */
function nonArrayIterandMessage(type: string): string {
  return fill(NON_ARRAY_ITERAND_CODE, new Map([["<type>", type]]));
}

/** `array element type mismatch at index <i>: expected <expected>, got <actual>`. */
function arrayElementMessage(index: number, expected: string, actual: string): string {
  return fill(
    ARRAY_ELEMENT_CODE,
    new Map([
      ["<i>", String(index)],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `condition must be boolean; got <type>`. */
function nonBooleanMessage(type: string): string {
  return fill(NON_BOOLEAN_CODE, new Map([["<type>", type]]));
}

/** `invoke<Schema> annotation incompatible with callee '<callee>' return type <actual>`. */
function invokeReturnMessage(callee: string, actual: string): string {
  return fill(
    INVOKE_RETURN_CODE,
    new Map([
      ["<callee>", callee],
      ["<actual>", actual],
    ]),
  );
}

/** `array.join requires a string element type; got array<<element>>`. */
function arrayJoinMessage(element: string): string {
  return fill(ARRAY_JOIN_CODE, new Map([["<element>", element]]));
}

/** `object index must be string; got <type>`. */
function objectIndexMessage(type: string): string {
  return fill(OBJECT_INDEX_CODE, new Map([["<type>", type]]));
}

// ===========================================================================
// Parse harness.
// ===========================================================================

const FILE = "bug0050.theta";

/** Frontmatter for the plain fixtures — occupies lines 1–3, body starts at 4. */
const FM = "---\nmode: prompt\n---\n";

/** Frontmatter declaring the Pi tool `read` — lines 1–5, body starts at 6. */
const FM_PI_TOOL = "---\nmode: prompt\ntools:\n  - read\n---\n";

/** Frontmatter declaring a `.theta` callable renamed with `as` — body at 6. */
const FM_THETA_CALLABLE = "---\nmode: prompt\ntools:\n  - ./child.theta as child\n---\n";

/**
 * The same shape under a SCHEMA-CASED alias — body at 6. Cell u8b needs the
 * alias to collide with a local `schema F`, and lexical.md:15 forces a schema
 * name uppercase-first, so the collision is only reachable through an alias an
 * author spells uppercase-first as well.
 */
const FM_THETA_CALLABLE_F = "---\nmode: prompt\ntools:\n  - ./child.theta as F\n---\n";

function parse(src: string): ThetaDocument {
  return parseDoc(src, FILE);
}

/** Every diagnostic rendered `severity code @l:c-l:c: message` — failure payload. */
function render(doc: ThetaDocument): string {
  return JSON.stringify(
    doc.diagnostics.map((d: Diagnostic) => {
      const r = d.range;
      const at = r === undefined ? "-" : `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
      return `${d.severity} ${d.code} @${at}: ${d.message}`;
    }),
  );
}

/** One diagnostic of `code`, rendered as one comparable `severity message @range` string. */
function locatedHits(doc: ThetaDocument, code: string): string[] {
  return doc.diagnostics
    .filter((d: Diagnostic) => d.code === code)
    .map((d: Diagnostic) => {
      const r = d.range;
      const at = r === undefined ? "-" : `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
      return `${d.severity} ${d.message} @${at}`;
    })
    .sort();
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

function at(r: SourceRange): string {
  return `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
}

interface CallSite {
  readonly callee: string;
  readonly args: readonly SourceRange[];
}

/**
 * Every call-shaped node of `doc` in source order, with each argument's range.
 *
 * An `invoke(...)` is recorded under the reserved label `"invoke"` — an
 * `InvokeExpr` carries a literal callee `path`, not a callee identifier, so the
 * label is this harness's handle on the node and never an author-written name.
 * The walk covers the node kinds this file's fixtures use; a fixture whose call
 * it cannot reach fails the loud precondition in `argRange` rather than passing
 * an absence assertion vacuously.
 */
function collectCalls(doc: ThetaDocument): CallSite[] {
  const out: CallSite[] = [];
  const walkExpr = (e: Expr): void => {
    switch (e.kind) {
      case "call":
        out.push({ callee: e.callee, args: e.args.map((a) => a.range) });
        for (const a of e.args) walkExpr(a);
        return;
      case "invoke":
        out.push({ callee: "invoke", args: e.args.map((a) => a.range) });
        for (const a of e.args) walkExpr(a);
        return;
      case "method-call":
        walkExpr(e.target);
        for (const a of e.args) walkExpr(a);
        return;
      case "try":
        walkExpr(e.operand);
        return;
      case "array":
        for (const el of e.elements) walkExpr(el);
        return;
      case "object":
        for (const f of e.fields) walkExpr(f.value);
        return;
      case "ternary":
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
      case "index":
        walkExpr(e.target);
        walkExpr(e.index);
        return;
      case "match":
        walkExpr(e.scrutinee);
        for (const arm of e.arms) walkExpr(arm.body);
        return;
      case "result-ctor":
        walkExpr(e.arg);
        return;
      case "par-for":
        walkExpr(e.iterand);
        if (e.max !== null) walkExpr(e.max);
        walkBlock(e.body);
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
      case "reassign":
        walkExpr(s.value);
        return;
      case "expr":
        walkExpr(s.expr);
        return;
      case "tool-call":
        walkExpr(s.call);
        return;
      case "invoke":
        walkExpr(s.invoke);
        return;
      case "return":
        if (s.operand !== null) walkExpr(s.operand);
        return;
      case "fn":
        walkBlock(s.body);
        return;
      case "for":
        walkExpr(s.iterand);
        walkBlock(s.body);
        return;
      case "while":
        walkExpr(s.condition);
        walkBlock(s.body);
        return;
      case "if":
        walkExpr(s.condition);
        walkBlock(s.then);
        return;
      default:
        return;
    }
  };
  const body = doc.body;
  if (body === null) {
    throw new Error(
      `harness: the fixture produced no parsed body, so its diagnostic set is about a parse failure rather than the call site. Diagnostics: ${render(doc)}`,
    );
  }
  walkBlock(body);
  return out;
}

/**
 * The range of argument `index` of the fixture's sole call of `callee`.
 *
 * This is the loud precondition every cell runs first: without it, a fixture
 * whose layout drifted (or which stopped parsing at all) would let an
 * "emits no `fn-arg-type-mismatch`" assertion pass while measuring nothing.
 */
function argRange(doc: ThetaDocument, callee: string, index: number): SourceRange {
  const calls = collectCalls(doc).filter((c) => c.callee === callee);
  expect(
    calls,
    `PRECONDITION: the fixture must hold exactly one call of '${callee}'; the parse found ${calls.length}. Diagnostics: ${render(doc)}`,
  ).toHaveLength(1);
  const args = calls[0]!.args;
  expect(
    args.length,
    `PRECONDITION: the call of '${callee}' must carry an argument at index ${index}; it carries ${args.length}. Diagnostics: ${render(doc)}`,
  ).toBeGreaterThan(index);
  return args[index]!;
}

interface LetSite {
  readonly name: string;
  readonly range: SourceRange;
}

/**
 * Every `let` statement of `doc` in source order, with the statement's own
 * range — the range the sibling relation sinks anchor their diagnostics on
 * (`checkLetRhsCompat` is handed `site: { range: stmt.range }`).
 *
 * The walk descends into the blocks the u13 fixtures nest their sinks in: `fn`
 * bodies, `for` / `while` / `if` bodies, and a `par for` body reached through a
 * `let` initialiser.
 */
function collectLets(doc: ThetaDocument): LetSite[] {
  const out: LetSite[] = [];
  const walkBlock = (b: Block): void => {
    for (const s of b.statements) walkStmt(s);
  };
  const walkInit = (e: Expr): void => {
    if (e.kind === "par-for") {
      walkBlock(e.body);
    }
  };
  const walkStmt = (s: Stmt): void => {
    switch (s.kind) {
      case "let":
        out.push({ name: s.name, range: s.range });
        if (s.init !== null) walkInit(s.init);
        return;
      case "fn":
        walkBlock(s.body);
        return;
      case "for":
      case "while":
        walkBlock(s.body);
        return;
      case "if":
        walkBlock(s.then);
        return;
      default:
        return;
    }
  };
  const body = doc.body;
  if (body === null) {
    throw new Error(
      `harness: the fixture produced no parsed body, so its diagnostic set is about a parse failure rather than the sink under test. Diagnostics: ${render(doc)}`,
    );
  }
  walkBlock(body);
  return out;
}

/**
 * The range of the fixture's sole `let` binding named `name`.
 *
 * The call-less counterpart of `argRange`, and the same loud precondition: the
 * u13 group's sinks are typed `let`s, object-field values and `for` iterands,
 * and several of its fixtures carry no `fn` call at all — without an anchor a
 * fixture whose layout drifted (or which stopped parsing) would let an
 * "emits nothing" assertion pass while measuring nothing.
 */
function letRange(doc: ThetaDocument, name: string): SourceRange {
  const hits = collectLets(doc).filter((l) => l.name === name);
  expect(
    hits,
    `PRECONDITION: the fixture must hold exactly one \`let ${name}\`; the parse found ${hits.length}. Diagnostics: ${render(doc)}`,
  ).toHaveLength(1);
  return hits[0]!.range;
}

/**
 * `doc` carries exactly one `fn-arg-type-mismatch`, severity `error`, with the
 * registry-sourced `message`, ranged on `argument`.
 *
 * The range is the ARGUMENT rather than the whole call because the mistake is
 * the value written at that position and the repair is local to it — the same
 * disposition the two wired sibling sinks take (`checkLetRhsCompat` ranges on
 * the initialiser, `checkObjectFieldCompat` on the field value), and what the
 * bug's §Fix specifies: `site: { file, range: arg.range }`.
 */
function expectOneFnArgMismatch(
  doc: ThetaDocument,
  message: string,
  argument: SourceRange,
  why: string,
): void {
  expect(
    locatedHits(doc, CODE),
    `${why}\n  ${CODE} has no emission site in src/ at this HEAD, so this list is empty until the §Fix wires one.\n  actual diagnostics: ${render(doc)}`,
  ).toEqual([`error ${message} @${at(argument)}`]);
}

/** `doc` carries no `fn-arg-type-mismatch` at all. */
function expectNoFnArgMismatch(doc: ThetaDocument, why: string): void {
  expect(
    locatedHits(doc, CODE),
    `${why}\n  actual diagnostics: ${render(doc)}`,
  ).toEqual([]);
}

// ===========================================================================
// Fixtures — the bug doc's §Reproduction rows verbatim, plus the scope rows the
// §Fix's two settled scope questions and its deferral rule name.
// ===========================================================================

const R1 = FM + "schema P { a: number }\nfn f(x: P): number { 1 }\nlet r = f(3)\nr\n";
const R2 = FM + 'fn g(n: number): number { 1 }\nlet r = g("s")\nr\n';
const R3 = FM + 'fn g(s: string): number { 1 }\nlet r = g(3)\nr\n';
const R4 = FM + 'fn g(xs: array<number>): number { 1 }\nlet r = g(["a"])\nr\n';
const R5 = FM + "fn g(n: integer): number { 1 }\nlet r = g(1.5)\nr\n";
const R6 =
  FM +
  'schema P { a: number }\nschema Q { b: string }\nfn f(x: P): number { 1 }\nlet v = Q { b: "s" }\nlet r = f(v)\nr\n';

const C1 = FM + "schema P { a: number }\nlet v: P = 3\nv\n";
const C2 = FM + 'schema P { a: number }\nlet v = P { a: "s" }\nv\n';
const C3 = FM + "let r = q(3)\nr\n";

const OK1 = FM + "fn g(n: number): number { 1 }\nlet r = g(3)\nr\n";
const OK2 =
  FM + "schema P { a: number }\nfn f(x: P): number { 1 }\nlet v = P { a: 1 }\nlet r = f(v)\nr\n";

const D1 = FM + 'fn g(n): number { 1 }\nlet r = g("s")\nr\n';
const D2 = FM + 'fn g(n: Nope): number { 1 }\nlet r = g("s")\nr\n';

const X1 = FM + 'invoke("./child.theta", 3)\n"t"\n';
const X2 = FM_THETA_CALLABLE + 'let r = child("s")\nr\n';
const X3 = FM_PI_TOOL + 'read({ path: 3 })?\n"t"\n';

const S1 = FM + 'subagent fn h(n: number): number { 1 }\nlet r = h("s")\nr\n';

const I1 =
  FM + 'import { rate_strictness } from "./personas.thetalib"\nlet r = rate_strictness(3)\nr\n';

const SH1 = FM + 'fn g(n: number): number { 1 }\nfor g in ["a"] { g("s") }\n"t"\n';
const SH2 = FM + 'fn g(n: number): number { 1 }\nfn h(g): number { g("s") }\nlet r = h(1)\nr\n';
const SH3 = FM + 'fn g(n: number): number { 1 }\nlet g = "x"\nlet r = g("s")\nr\n';

const U1 = FM + 'fn g(s: string): number { 1 }\nlet flag = true\nlet r = g(flag ? 1 : "a")\nr\n';
const U2 =
  FM + 'fn g(s: string): number { 1 }\nlet flag = true\nlet x = flag ? 1 : "a"\nlet r = g(x)\nr\n';
const U3 = FM + 'fn g(xs: array<number>): number { 1 }\nlet r = g([1, "a"])\nr\n';
const U4 = FM + 'fn g(xs: array<number>): number { 1 }\nlet r = g(["a", null])\nr\n';
const U5 = FM + 'fn g(s: string): number { 1 }\npar for x in [false ? 1 : "a"] { g(x) }\n';
const U6 =
  FM +
  "schema P { a: number }\nschema W { P: number }\nfn f(n: number): number { 1 }\nlet v = W { P: 3 }\nlet r = f(v.P)\nr\n";

/**
 * u6's three companions, added under bug 0190 §Fix (f) so the group decides in
 * both directions: a member read whose DECLARED field type disagrees with the
 * parameter (which must emit), and the two FALLBACK reads that must not — an
 * absent field, and an absent field whose minted name RESOLVES against a
 * declared alias.
 */
const U6P_DECLARED_FIELD_MISMATCH =
  FM +
  "schema P { s: string }\nfn g(n: integer): integer { n }\nfn f(p: P): integer { g(p.s) }\n1\n";
const U6B_ABSENT_FIELD =
  FM +
  "schema P { s: string }\nfn g(n: integer): integer { n }\nfn f(p: P): integer { g(p.zzz) }\n1\n";
const U6C_ABSENT_FIELD_RESOLVING_MINT =
  FM +
  'schema Zzz = integer\nschema P { s: string }\nfn g(n: string): string { n }\nfn f(p: P): string { g(p.Zzz) }\n"t"\n';

const U7_DIRECT =
  FM + 'fn f(s: string): number { 1 }\nlet xs = [false ? 1 : "a"]\nlet r = f(xs[0])\nr\n';
const U7_LAUNDERED =
  FM +
  'fn f(s: string): number { 1 }\nlet xs = [false ? 1 : "a"]\nlet e = xs[0]\nlet r = f(e)\nr\n';
const U7P_DIRECT =
  FM + "fn f(s: string): number { 1 }\nlet xs: array<integer> = [1, 2]\nlet r = f(xs[0])\nr\n";
const U7P_LAUNDERED =
  FM +
  "fn f(s: string): number { 1 }\nlet xs: array<integer> = [1, 2]\nlet e = xs[0]\nlet r = f(e)\nr\n";

const U8_SCHEMA_CALLEE =
  FM + "schema F { a: number }\nfn g(n: number): number { 1 }\nlet r = g(F(3))\nr\n";
const U8_ALIAS_CALLEE =
  FM_THETA_CALLABLE_F +
  "schema F { a: number }\nfn g(n: number): number { 1 }\nlet r = g(F(1)?)\nr\n";
const U8P_CTOR =
  FM + "schema F { a: number }\nfn g(n: number): number { 1 }\nlet r = g(F { a: 3 })\nr\n";

/**
 * The u9 family's shared prelude — body lines 4–6, so every u9 call site sits
 * on body line 7. `schema P` is the collision the minted name resolves in and
 * `x: Q` is the declared parameter it would be judged against, so a fabricated
 * `named P` reads as `expected Q, got P` and a PROVEN read reads `got integer`.
 */
const U9_PRELUDE = "schema P { a: number }\nschema Q { b: string }\nfn g(x: Q): number { 1 }\n";

const U9_FOR_VARIABLE = FM + U9_PRELUDE + 'for P in [1, 2] { let z = g(P) }\n"t"\n';
const U9_MATCH_BINDER = FM + U9_PRELUDE + "let out = match 3 { P => g(P) }\nout\n";
const U9_FN_PARAM = FM + U9_PRELUDE + "fn h(P): number { g(P) }\nlet r = h(3)\nr\n";
const U9_BARE_SCHEMA_REF = FM + U9_PRELUDE + "let out = g(P)\nout\n";
const U9P_PAR_FOR = FM + U9_PRELUDE + "let ys = par for P in [1, 2] { g(P) }\nys\n";

const U10_NEG_STRING = FM + 'fn g(n: number): number { 1 }\nlet r = g(-"5")\nr\n';
const U10_NEG_STRING_LAUNDERED =
  FM + 'fn g(n: number): number { 1 }\nlet x = -"5"\nlet r = g(x)\nr\n';
const U10_NEG_BOOL = FM + "fn g(n: number): number { 1 }\nlet r = g(-true)\nr\n";
const U10_MINUS_STRINGS = FM + 'fn g(n: number): number { 1 }\nlet r = g("a" - "b")\nr\n';
const U10_DIV_STRINGS = FM + 'fn g(n: number): number { 1 }\nlet r = g("6" / "2")\nr\n';
const U10_MOD_STRINGS = FM + 'fn g(n: number): number { 1 }\nlet r = g("6" % "2")\nr\n';
const U10_MUL_STRINGS = FM + 'fn g(n: number): number { 1 }\nlet r = g("a" * "b")\nr\n';

const U10P_NEG_LITERAL = FM + "fn g(n: integer): number { 1 }\nlet r = g(-1.5)\nr\n";
const U10P_NEG_ANNOTATED =
  FM + "fn g(s: string): number { 1 }\nlet m: number = 2\nlet r = g(-m)\nr\n";
const U10PB_ARITH = FM + "fn g(s: string): number { 1 }\nlet r = g(1 - 2)\nr\n";
const U10PC_PLUS_NUMERIC = FM + "fn g(s: string): number { 1 }\nlet r = g(1 + 2)\nr\n";
const U10PC_PLUS_STRINGS = FM + 'fn g(n: number): number { 1 }\nlet r = g("a" + "b")\nr\n';

/**
 * The u11 family's three self-shadowing initialisers, each over an ERASED
 * outer binding, and the proven-outer differentiator. Body lines 4–9, so every
 * u11 call site sits on body line 8 and u11p's on body line 7.
 *
 * `let x = flag ? 1 : "a"` records the erased `integer`; the second `let x`
 * then reads the OUTER `x` in its own initialiser, which is what the runtime
 * does too, so the erasure must reach the second binding as well.
 */
const U11_SELF_TERNARY =
  FM +
  'fn g(s: string): number { 1 }\nlet flag = false\nlet x = flag ? 1 : "a"\nlet x = flag ? 1 : x\nlet r = g(x)\nr\n';
const U11_SELF_ARITH =
  FM +
  'fn g(s: string): number { 1 }\nlet flag = false\nlet x = flag ? 1 : "a"\nlet x = 1 + x\nlet r = g(x)\nr\n';
const U11_SELF_INDEX =
  FM +
  'fn g(s: string): number { 1 }\nlet flag = false\nlet x = [flag ? 1 : "a"]\nlet x = [1, x[0]]\nlet r = g(x[1])\nr\n';
const U11P_PROVEN_OUTER =
  FM + "fn g(s: string): number { 1 }\nlet x = 1\nlet x = 1 + x\nlet r = g(x)\nr\n";

/**
 * The u12 family's four SHADOWING binders — one per binder class the walk's
 * `bindings` map did not record. `let x = 1` records a PROVEN `integer`, and
 * each fixture then binds `x` again in the inner scope the runtime evaluates
 * the call in, so the argument's runtime value is the `string` the inner binder
 * holds and the outer `integer` names nothing the position ever carries.
 */
const U12_FOR_SHADOW =
  FM + 'fn g(s: string): number { 1 }\nlet x = 1\nfor x in ["a"] { let r = g(x) }\n"t"\n';
const U12_MATCH_ARM_SHADOW =
  FM + 'fn g(s: string): number { 1 }\nlet x = 1\nlet m = match "hi" { x => g(x) }\nm\n';
const U12_MATCH_ARG_SHADOW =
  FM + 'fn g(s: string): number { 1 }\nlet x = 1\nlet r = g(match "hi" { x => x })\nr\n';
const U12_FN_PARAM_SHADOW =
  FM +
  'fn g(s: string): number { 1 }\nlet x = 1\nfn h(x): number { g(x) }\nlet r = h("a")\nr\n';

/** The plain-`for` element deferral this fix keeps, stated as its own cell. */
const U12E_FOR_PROVEN_ITERAND =
  FM + 'fn g(s: string): number { 1 }\nfor x in [3] { let r = g(x) }\n"t"\n';

/**
 * The five differentiators. The first two keep a PROVEN outer binding readable
 * inside each construct (nothing shadows it, so the runtime reads it there
 * too); the last three keep the two RECORDED binder classes winning over a
 * same-named outer binding.
 */
const U12P_FOR_OUTER_VISIBLE =
  FM + 'fn g(s: string): number { 1 }\nlet x = 1\nfor y in ["a"] { let r = g(x) }\n"t"\n';
const U12PB_MATCH_OUTER_VISIBLE =
  FM + 'fn g(s: string): number { 1 }\nlet x = 1\nlet m = match "hi" { y => g(x) }\nm\n';
const U12PC_ANNOTATED_PARAM_SHADOW =
  FM +
  'fn g(s: string): number { 1 }\nlet p = "a"\nfn h(p: integer): number { g(p) }\nlet r = h(3)\nr\n';
const U12PD_ANNOTATED_BESIDE_UNANNOTATED =
  FM +
  "fn g(s: string): number { 1 }\nfn h(p: integer, q): number { g(p) }\nlet r = h(3, 4)\nr\n";
const U12PE_PAR_FOR_SHADOW =
  FM +
  'fn g(s: string): number { 1 }\nlet x = "a"\nlet ys = par for x in [3] { g(x) }\nys\n';

/**
 * The u13 family. Every fixture below reaches a SIBLING row — a typed-`let`
 * RHS, an object-field value, an array element, a `for` iterand, a `subagent fn`
 * return annotation, an `if` condition — through a read of a binder the walk
 * records WITHHELD, and each one's runtime value is well typed.
 *
 * The four shadowing fixtures collide the binder's spelling with a declared
 * `schema P`, which is legal source: lexical.md:16 scopes the lowercase-first
 * rule to `let` / `let mut` bindings, function parameters, function names and
 * schema field names, so a `for` / `par for` variable and a `match` pattern
 * binder are outside it. Three of the four — `U13_FOR_IN_PARAM_SHADOW`,
 * `U13_ARM_OBJECT_FIELD_SHADOW`, `U13_ARM_ITERAND_SHADOW` — collide on a
 * `fn h(P: …)` parameter, which sits inside the rule. Bug 0139's
 * `binding-case-mismatch` fires on that parameter's own spelling in cells
 * u13b–u13d, independently of the collision each cell's assertion below is
 * about.
 */
const U13_PAR_FOR_NESTED_SHADOW =
  FM +
  "schema P { a: number }\nlet ys = par for P in [3] { for P in [5] { let s: integer = P }\n1 }\nys\n";
const U13_FOR_IN_PARAM_SHADOW =
  FM +
  'schema P { a: number }\nfn h(P: string): number { for P in ["ok"] { let s: string = P }\n1 }\nlet r = h("z")\nr\n';
const U13_ARM_OBJECT_FIELD_SHADOW =
  FM +
  'schema P { a: number }\nschema Q { b: string }\nfn h(P: string): number { let m = match "hi" { P => Q { b: P } }\n1 }\nlet r = h("z")\nr\n';
const U13_ARM_ITERAND_SHADOW =
  FM +
  'schema P { a: number }\nfn h(P: array<integer>): number { let m = match "hi" { P => par for i in P { 1 } }\n1 }\nlet r = h([1])\nr\n';

/**
 * The MISS class — the same sinks with no outer record to shadow. u13mb and
 * u13mc read a `match`-arm binder, a WITHHELD entry, so those two sinks
 * withhold with it. u13m, u13md, u13me, u13mf and u13mg read a plain `for`
 * variable, which carries the iterand's PROVEN element (bug 0126,
 * docs/bugs/0126-plain-for-binds-no-loop-variable.md), so each of their sinks
 * judges that element: it satisfies the annotation at u13m, the iterand
 * contract at u13md, the `join` precondition at u13mf and the index-key
 * precondition at u13mg, and it disagrees with the structural annotation at
 * u13me.
 */
const U13M_FOR_MISS = FM + 'schema P { a: number }\nfor P in [5] { let s: integer = P }\n"t"\n';
const U13MB_ARM_FIELD_MISS =
  FM +
  'schema P { a: number }\nschema Q { b: string }\nlet m = match "hi" { P => Q { b: P } }\nm\n';
const U13MC_ARM_ITERAND_MISS = FM + 'let m = match "hi" { P => par for i in P { 1 } }\nm\n';
const U13MD_NESTED_FOR_ITERAND = FM + 'for x in [[1]] { for i in x { let r = 1 } }\n"t"\n';
const U13ME_STRUCTURAL_SUP = FM + "for x in [3] { let s: array<integer> = x }\n\"t\"\n";

/**
 * The six differentiators — one per sink the withhold gate touches. Each read is
 * a PROVEN or a declared type rather than a withheld binder, so each emission
 * must stand: a gate that skipped its sink whenever the sink sits inside a
 * `for` body, a `match` arm or an unannotated-parameter `fn` body reds all six.
 */
const U13P_LET_ANNOT_IN_FOR = FM + 'schema P { a: number }\nfor q in [1] { let v: P = 3 }\n"t"\n';
const U13PB_FOR_ITERAND_STRING =
  FM + 'let s = "a"\nfor q in [1] { for i in s { let r = 1 } }\n"t"\n';
const U13PC_PAR_FOR_ITERAND_STRING =
  FM + 'let s = "a"\nfor q in [1] { let ys = par for i in s { 1 } }\n"t"\n';
const U13PD_OBJECT_FIELD_IN_FOR =
  FM + 'schema Q { b: string }\nfor q in [1] { let m = Q { b: 3 } }\n"t"\n';
const U13PE_ARRAY_ELEMENT_IN_FOR = FM + 'for q in [1] { let a: array<integer> = ["s"] }\n"t"\n';
const U13PF_SUBAGENT_RETURN_ANNOTATED =
  FM + 'subagent fn h(q: string): array<integer> { return q }\nlet r = h("a")\nr\n';

/**
 * The two stdlib preconditions that refuse an unresolvable type instead of
 * deferring on it, each with its own differentiator: `array.join`'s element
 * type and the object-index key.
 */
const U13MF_JOIN_FOR_ELEMENT = FM + 'for x in ["a"] { let s = [x].join(",") }\n"t"\n';
const U13PG_JOIN_PROVEN_ELEMENT =
  FM + 'let x = 1\nfor q in ["a"] { let s = [x].join(",") }\n"t"\n';
const U13MG_OBJECT_INDEX_FOR_KEY =
  FM +
  'schema Q { b: string }\nlet q: Q = Q { b: "s" }\nfor x in ["b"] { let v = q[x] }\n"t"\n';
const U13PH_OBJECT_INDEX_PROVEN_KEY =
  FM +
  'schema Q { b: string }\nlet q: Q = Q { b: "s" }\nlet k = 3\nfor w in [1] { let v = q[k] }\n"t"\n';

/**
 * The two sinks whose verdict the withhold DECIDES: an `array.join` element and
 * a primitive-annotated `let` RHS, each fed a withheld read from INSIDE a
 * composite. The binder is an unannotated `fn` parameter — `walkFn`'s withheld
 * class (`recordWithheldBinders` at src/parser/type-layer-checks.ts:1626) — so
 * the read stays withheld independently of how a plain `for` variable binds. The
 * composite is load-bearing: with the read as the WHOLE operand each sink's own
 * unresolvable-`named` handling answers first and the gate is never what
 * silences it.
 */
const U13MH_JOIN_WITHHELD_ELEMENT = FM + 'fn h(x) { let s = [x].join(",") }\n1\n';
const U13MI_LET_ANNOT_WITHHELD_ELEMENT = FM + "fn h(x) { let s: integer = [x] }\n1\n";

/**
 * The three remaining sinks whose verdict the withhold DECIDES, each fed the
 * read from INSIDE a composite for the same reason U13MH and U13MI do, plus
 * the `join` sink's second binder class: with the read as the WHOLE operand
 * the sink's own unresolvable-`named` handling answers first and the gate is
 * never what silences it.
 *
 * The route matters at the two schema sinks. A typed `let` cannot reach the
 * array-element sink with a withheld branch, because the typed-`let` gate in
 * `walkStmt`'s `case "let"` answers one level up; a schema constructor with a
 * declared `array<T>` field reaches it, because `checkObjectField`'s declared
 * element sink sits OUTSIDE that method's own gate.
 *
 * The binder is an unannotated `fn` parameter at the first three and a `match`
 * pattern binder at the fourth — the two classes `recordWithheldBinders` still
 * mints — so the fourth pins a binder class no cell reaches at the `join` sink.
 */
const U13MJ_SUBAGENT_RETURN_WITHHELD_ELEMENT =
  FM + "subagent fn h(x): integer { return [x] }\nlet r = h(1)\nr\n";
const U13MK_SCHEMA_ARRAY_FIELD_WITHHELD_ELEMENT =
  FM + "schema Q { b: array<integer> }\nfn h(x) { let m = Q { b: [[x]] } }\n1\n";
const U13ML_OBJECT_FIELD_WITHHELD_ELEMENT =
  FM + "schema Q { b: string }\nfn h(x) { let m = Q { b: [x] } }\n1\n";
const U13MM_JOIN_MATCH_BINDER_ELEMENT =
  FM + 'let m = match "hi" { x => [x].join(",") }\nm\n';

/** The marking channel's true positive when an arm body IS its binder, and the render residual. */
const U13E_ARM_IDENTITY_MARKING =
  FM +
  'fn g(s: string): number { 1 }\nlet x = 1\nlet m = match "hi" { x => x }\nlet r = g(x)\nr\n';
const U13R_NESTED_RENDER = FM + "fn h(x) { if [x] { let r = 1 } }\n\"t\"\n";

const A1_TOO_FEW = FM + "fn g(n: number): number { 1 }\nlet r = g()\nr\n";
const A1_TOO_MANY = FM + "fn g(n: number): number { 1 }\nlet r = g(3, 4)\nr\n";

// ===========================================================================
// r1–r6 — the expected-emission rows. RED at this HEAD: each parses with the
// verdict the bug doc's §Reproduction table records ("none — loads").
// ===========================================================================

describe("bug 0050 — a mistyped argument at a plain top-level `fn` call reports fn-arg-type-mismatch", () => {
  it("r1: `fn f(x: P)` called `f(3)` fires once, on the argument", () => {
    // The headline fixture. Both operands are inside the parser's static view —
    // an integer literal and a declared object schema — so type-system.md:48
    // licenses no deferral, and control c1 decides the identical pair one
    // position over.
    const doc = parse(R1);
    const argument = argRange(doc, "f", 0);
    expect(
      argument,
      "PRECONDITION: the argument `3` sits on the third body line; a drifted layout must fail here, not silently mis-pin the assertion below",
    ).toEqual(range(6, 11, 6, 12));
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("f", 0, "x", "P", "integer"),
      argument,
      "r1 — the row's Trigger names this input in every particular: a plain top-level `fn` call, an `integer` argument, a `P`-declared parameter, both operands statically resolvable",
    );
  });

  it("r2: `fn g(n: number)` called `g(\"s\")` fires once, on the argument", () => {
    const doc = parse(R2);
    const argument = argRange(doc, "g", 0);
    expect(
      argument,
      "PRECONDITION: the argument `\"s\"` sits on the second body line, columns 11–13 inclusive",
    ).toEqual(range(5, 11, 5, 14));
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("g", 0, "n", "number", "string"),
      argument,
      "r2 — a `string` under a declared `number` parameter, the simplest instance of the Trigger",
    );
  });

  it("r3: `fn g(s: string)` called `g(3)` fires once, on the argument", () => {
    const doc = parse(R3);
    const argument = argRange(doc, "g", 0);
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("g", 0, "s", "string", "integer"),
      argument,
      "r3 — the reverse direction of r2; `⊑` is not symmetric and both directions must be judged",
    );
  });

  it("r4: `fn g(xs: array<number>)` called `g([\"a\"])` fires once, on the argument", () => {
    // `["a"]` reads as `array<string>` and `array<number>` is the declared
    // parameter type, so the mismatch is decided by `⊑` on the array types
    // themselves. Only the `fn-arg-type-mismatch` set is pinned here —
    // `expectOneFnArgMismatch` filters to this code alone, so it does not care
    // about a second one.
    //
    // LANDED (bug 0156, §Fix Route A): the callee's parameter type is now
    // supplied as the array literal's element sink at this position too
    // (docs/spec_topics/grammar.md's exhaustive sink list names "a function
    // parameter type at a call site" second of three), so this fixture's full
    // diagnostic list now also carries `theta/parse/array-element-type-mismatch`
    // at index 0 (`expected number, got string`), beside the code pinned
    // below — the two-line shape rule 1 prescribes wherever a sink is in
    // scope, reproduced here at the argument position on the same footing as
    // the binding position.
    const doc = parse(R4);
    const argument = argRange(doc, "g", 0);
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("g", 0, "xs", "array<number>", "array<string>"),
      argument,
      "r4 — an `array<string>` under a declared `array<number>` parameter",
    );
  });

  it("r5: `fn g(n: integer)` called `g(1.5)` fires once, through THIS code and not integer-narrowing", () => {
    // The routing pin. `checkFnArgCompat` (src/parser/type-compat.ts:463–472)
    // returns for `"compatible"` and `"unknown"` only, so a
    // `number → integer` narrowing outcome falls through to this code — unlike
    // the two sibling sinks, which route that outcome to
    // `theta/parse/integer-narrowing`. TYPE-9 (type-system.md:50) names one
    // code for this slot, and the emitter already implements it that way.
    const doc = parse(R5);
    const argument = argRange(doc, "g", 0);
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("g", 0, "n", "integer", "number"),
      argument,
      "r5 — TYPE-2's one-way widening fails at this slot through the fn-arg row, which is what the emitter's fall-through already decides",
    );
  });

  it("r6: a `Q`-constructed value under a declared `P` parameter fires once, on the argument", () => {
    // The case TYPE-10 (type-system.md:52) names explicitly and the one no AJV
    // net could recover even in principle: `Q { b: "s" }` does not validate
    // against `P`'s lowering, and named schemas are incompatible by name
    // identity regardless of field shape.
    const doc = parse(R6);
    const argument = argRange(doc, "f", 0);
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("f", 0, "x", "P", "Q"),
      argument,
      "r6 — two distinct nominal schemas; TYPE-10 requires the parse-time report at this site rather than a deferral",
    );
  });

  it("s1: a same-file `subagent fn h(n: number)` called `h(\"s\")` fires — scope question (a)", () => {
    // functions.md:50 makes a `subagent fn` "identical to an ordinary `fn` in
    // its parameter list, positional call form, and inferred-and-validated
    // return type", and FN-6's arguments bullet (:61) binds its parameters
    // "positionally as for `fn` and `invoke`". Such a call is therefore inside
    // the Trigger's letter, and no other check covers its arguments —
    // src/extension/subagent-fn-static-checks.ts covers cycles and
    // callee-has-errors only.
    const doc = parse(S1);
    const argument = argRange(doc, "h", 0);
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("h", 0, "n", "number", "string"),
      argument,
      "s1 — the `subagent` modifier changes where the body runs, not how the parameter list binds, so the argument slot is judged identically",
    );
  });
});

// ===========================================================================
// c1–c3 — the controls. Byte-identical verdicts to the bug doc's §Reproduction:
// the two wired sibling sinks and the unknown-callee arm. GREEN at this HEAD
// and after; a fix that disturbs any of them has changed the engine rather than
// added one call.
// ===========================================================================

describe("bug 0050 — the wired sibling sinks and the unknown-callee arm keep their verdicts", () => {
  it("c1: `let v: P = 3` keeps reporting let-rhs-type-mismatch alone", () => {
    const doc = parse(C1);
    expect(
      locatedHits(doc, LET_RHS_CODE).map((h) => h.replace(/ @.*$/, "")),
      `c1 — the typed-\`let\` sink shares the relation, the TypeEnv and the walk with the fn slot; what differs there is the absent call, not the engine. Diagnostics: ${render(doc)}`,
    ).toEqual([`error ${letRhsMessage("v", "P", "integer")}`]);
    expectNoFnArgMismatch(
      doc,
      "c1 — no `fn` call is written here, so wiring the fn slot must add nothing to this fixture",
    );
  });

  it("c2: `let v = P { a: \"s\" }` keeps reporting object-field-type-mismatch alone", () => {
    const doc = parse(C2);
    expect(
      locatedHits(doc, OBJECT_FIELD_CODE).map((h) => h.replace(/ @.*$/, "")),
      `c2 — the constructor-field sink (bug 0031, the same class fixed one position over) is the second wired sibling. Diagnostics: ${render(doc)}`,
    ).toEqual([`error ${objectFieldMessage("a", "P", "number", "string")}`]);
    expectNoFnArgMismatch(
      doc,
      "c2 — a schema constructor is not a `fn` call; the new emission site must not confuse the two `CallExpr`-adjacent forms",
    );
  });

  it("c3: `let r = q(3)` keeps reporting unknown-identifier alone", () => {
    // Callee-name resolution is not affected by this defect: an undeclared
    // callee already reports. The pin is that the new check does not ALSO fire
    // on a callee it cannot resolve — an unresolved callee has no parameter
    // list, so there is nothing to judge the argument against.
    const doc = parse(C3);
    expect(
      locatedHits(doc, UNKNOWN_IDENT_CODE).map((h) => h.replace(/ @.*$/, "")),
      `c3 — the silence this bug reports is confined to the argument-type judgement. Diagnostics: ${render(doc)}`,
    ).toEqual([`error ${unknownIdentifierMessage("q")}`]);
    expectNoFnArgMismatch(
      doc,
      "c3 — an unresolved callee carries no declared parameter type, so the check has no operand and must stay silent",
    );
  });
});

// ===========================================================================
// ok1 / ok2 — the rows an over-broad wiring breaks first. GREEN at this HEAD
// and after, and NOT vacuous: they assert the whole diagnostic list is empty.
// ===========================================================================

describe("bug 0050 — a compatible argument keeps loading clean", () => {
  it("ok1: `fn g(n: number)` called `g(3)` draws nothing", () => {
    // `integer ⊑ number` is TYPE-2's one-way widening in the admitted
    // direction, so this is the compatible answer, not a deferral.
    const doc = parse(OK1);
    expect(
      argRange(doc, "g", 0),
      "PRECONDITION: the argument node must be reachable, or the empty diagnostic list below measures nothing",
    ).toEqual(range(5, 11, 5, 12));
    expect(
      doc.diagnostics,
      `ok1 — a well-typed argument must keep loading with zero diagnostics. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });

  it("ok2: a `P`-constructed value under a declared `P` parameter draws nothing", () => {
    // TYPE-1 reflexivity against the same named schema — the arm r6 fails.
    const doc = parse(OK2);
    expect(
      argRange(doc, "f", 0),
      "PRECONDITION: the argument node must be reachable, or the empty diagnostic list below measures nothing",
    ).toEqual(range(7, 11, 7, 12));
    expect(
      doc.diagnostics,
      `ok2 — a nominally matching argument must keep loading with zero diagnostics. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// d1 / d2 — the deferral arms the emitter already implements
// (src/parser/type-compat.ts:463–465, type-system.md:48). GREEN at this HEAD
// vacuously; after the fix they are the pin that no wiring widens the check
// past a statically resolvable parameter type.
// ===========================================================================

describe("bug 0050 — an unresolvable parameter type defers", () => {
  it("d1: an UNANNOTATED parameter `fn g(n)` called `g(\"s\")` emits nothing", () => {
    // `FnParam.type` is the empty string, `annotationToCompatType`
    // (src/parser/type-layer-checks.ts:811) yields no type, and
    // `checkCompatible` answers `"unknown"`. Inferring a parameter type from
    // the body or from call sites is a §Non-goal of both dispositions.
    const doc = parse(D1);
    argRange(doc, "g", 0);
    expectNoFnArgMismatch(
      doc,
      "d1 — an unannotated parameter is past the parser's static view; the deferral is the emitter's existing `\"unknown\"` arm, not a gap",
    );
  });

  it("d2: an annotation naming nothing declared `fn g(n: Nope)` called `g(\"s\")` emits nothing", () => {
    // `Nope` resolves to no `schema` / `enum` / alias in the file, so the
    // parameter side is unresolvable and the same deferral applies. Which
    // annotation TEXTS reach the engine at all is bug 0051's question and is
    // unchanged by either disposition here.
    const doc = parse(D2);
    argRange(doc, "g", 0);
    expectNoFnArgMismatch(
      doc,
      "d2 — an unresolved named type is not a proof of incompatibility; type-system.md:48 skips the check rather than guessing",
    );
  });
});

// ===========================================================================
// x1–x3 — the three callee kinds the Trigger excludes. GREEN at this HEAD
// vacuously; after the fix each reds if the emission site is attached to the
// shared `call`/`invoke` switch label or resolves a callee it should not.
// Only the ABSENCE of this code is pinned — whatever else these fixtures draw
// belongs to their own rows and is not this route's business.
// ===========================================================================

describe("bug 0050 — the excluded callee kinds stay outside the check", () => {
  it("x1: `invoke(\"./child.theta\", 3)` draws no fn-arg-type-mismatch", () => {
    // `invoke` shares the switch label with `call` at
    // src/parser/type-layer-checks.ts:2033, :2039 and must not be swept in: it
    // carries its own registry row (`theta/parse/invoke-arg-type-mismatch`)
    // and its own separately-unwired emitter, which is a distinct defect this
    // route does not fix.
    const doc = parse(X1);
    argRange(doc, "invoke", 0);
    expectNoFnArgMismatch(
      doc,
      "x1 — an `invoke(...)` argument is judged by the invoke row, so this code appearing here would mean the new call site was hung on the shared switch label",
    );
  });

  it("x2: a `.theta`-callable call `child(\"s\")` draws no fn-arg-type-mismatch", () => {
    // A `.theta` callable is a `CallExpr` too. The Trigger excludes it by name,
    // and its arguments are governed by `theta/parse/tool-arg-type-mismatch`
    // against the callee's `params:` — a different row, a different operand
    // source, and a check that needs the callee file.
    const doc = parse(X2);
    argRange(doc, "child", 0);
    expectNoFnArgMismatch(
      doc,
      "x2 — the callee resolves through the frozen callable set, not through this file's top-level `fn` declarations, so the fn slot has no parameter list to read",
    );
  });

  it("x3: a Pi-tool call `read({ path: 3 })` draws no fn-arg-type-mismatch", () => {
    // Also a `CallExpr`, also excluded by the Trigger. A Pi-tool argument is
    // judged against the tool's registered input schema by the tool rows, with
    // the runtime AJV check as the net.
    const doc = parse(X3);
    argRange(doc, "read", 0);
    expectNoFnArgMismatch(
      doc,
      "x3 — a Pi tool is not a `.theta` file and declares no theta parameter list; the fn slot must not claim its argument",
    );
  });
});

// ===========================================================================
// i1 — the imported-`.thetalib` route. GREEN at this HEAD vacuously, and
// DELIBERATELY green after the fix.
// ===========================================================================

describe("bug 0050 — the imported-`.thetalib` route defers on an unresolved signature", () => {
  it("i1: `rate_strictness(3)` on an imported symbol draws no fn-arg-type-mismatch", () => {
    // WHY this cell expects silence even though the Trigger names the route.
    // The check needs the imported `fn`'s signature and the declaring file's
    // declarations; a single-file parse carries neither — `collectTypeEnv`
    // (src/parser/type-layer-checks.ts) does not cross files. Deferring on an
    // unresolved imported signature is admissible under type-system.md:48
    // §Unresolvable operands, which is why the §Fix leaves the Trigger prose in
    // place rather than narrowing it.
    //
    // This cell is therefore a DEFERRAL pin, not a correctness pin: a later
    // change that resolves imported signatures SHOULD red it, and the right
    // response then is to flip it to an expected emission
    // (`fn 'rate_strictness' argument 0 ('a') type mismatch: expected Author,
    // got integer` against docs/examples/personas.thetalib:7), not to weaken it.
    const doc = parse(I1);
    argRange(doc, "rate_strictness", 0);
    expectNoFnArgMismatch(
      doc,
      "i1 — the imported signature is outside the single-file parse's static view; silence here is the documented deferral, not the defect this bug reports",
    );
  });
});

// ===========================================================================
// sh1–sh3 — a local binder outranks the top-level `fn` (expressions.md:46,
// :51). GREEN at this HEAD vacuously; after the fix each reds if the callee
// resolution reads the `fn` table without asking whether the name is bound
// locally. Withholding the check can only suppress a diagnostic, never invent
// one, which is why the §Fix takes the whole-file conservative reading.
// ===========================================================================

describe("bug 0050 — a local binder shadowing a top-level `fn` suppresses the check", () => {
  it("sh1: a `for` variable shadowing `fn g` draws no fn-arg-type-mismatch", () => {
    // Inside the loop body `g` is the iteration variable, so `g("s")` does not
    // reach the top-level `fn` at all.
    const doc = parse(SH1);
    argRange(doc, "g", 0);
    expectNoFnArgMismatch(
      doc,
      "sh1 — resolution arm 1 (a local binding) wins over arm 2 (a top-level `fn`), so the declared parameter type of `fn g` is not the operand at this call",
    );
  });

  it("sh2: an UNANNOTATED `fn` parameter shadowing `fn g` draws no fn-arg-type-mismatch", () => {
    // A function parameter is arm 1 alongside `let`. The parameter is
    // deliberately unannotated: an annotated one would raise a second question
    // (what the annotation says about callability) that this route does not
    // settle.
    const doc = parse(SH2);
    const calls = collectCalls(doc).filter((c) => c.callee === "g");
    expect(
      calls,
      `PRECONDITION: the fixture holds one call of the shadowed name inside \`h\`'s body. Diagnostics: ${render(doc)}`,
    ).toHaveLength(1);
    expectNoFnArgMismatch(
      doc,
      "sh2 — a function parameter shadows the top-level `fn` inside that function's body, and `h`'s own call `h(1)` has an unannotated parameter that defers",
    );
  });

  it("sh3: a `let` shadowing `fn g` draws no fn-arg-type-mismatch", () => {
    const doc = parse(SH3);
    argRange(doc, "g", 0);
    expectNoFnArgMismatch(
      doc,
      "sh3 — the `let` binding is arm 1; expressions.md:51 states that local bindings shadow everything else lexically",
    );
  });
});

// ===========================================================================
// u1–u5 — bug 0081's union arm closes the erasure this group used to guard, for
// this group's RULE-2 inputs. `StaticTypeInferencePass.#commonType` delegates
// to `commonType` (src/parser/type-compat.ts): a rule-2 heterogeneous set (no
// object branch, no dominating member) now reduces to the exact union rule 2
// prescribes, not to an erased first candidate. Unknown-blessing (clause 1
// treats an unresolvable branch as non-blocking) and the rule-3
// `?? candidates[0]` fallback (an object-branch set with no dominating
// member) are UNTOUCHED by this fix and stay withheld at this sink by
// `isProvenReduction`. Each cell below now pins the resulting
// `fn-arg-type-mismatch` on the union `<actual>`, with the per-cell soundness
// argument for why the read is a genuine proof rather than the erasure bug 0072
// (one argument position over) guards against.
// ===========================================================================

describe("bug 0050/0081 — a once-erased argument read is now a proven union and is judged", () => {
  it('u1: `g(flag ? 1 : "a")` against `s: string` now fires fn-arg-type-mismatch on the union', () => {
    // Bug 0081 closes the erasure this cell used to pin: `commonType`
    // (src/parser/type-compat.ts) now unions the ternary's two arms instead of
    // discarding one, so `typeOf` reads `integer | string`, not `integer`. Both
    // arms are independently proven (each is a literal) and each is `⊑` the
    // union (TYPE-5), so the union genuinely describes every value the
    // expression can take — `isProvenReduction` now holds where it used to
    // withhold. `integer | string ⊭ string` is exactly what TYPE-6 prescribes,
    // so the parameter mismatch is a true positive, not the false-`E` species
    // bugs 0050/0072 exist to refuse.
    const doc = parse(U1);
    const argument = argRange(doc, "g", 0);
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("g", 0, "s", "string", "integer | string"),
      argument,
      "u1 — bug 0081's union arm makes the read a proof, so the mismatch it names is genuine",
    );
  });

  it('u2: the laundered form `let x = flag ? 1 : "a"` then `g(x)` now fires fn-arg-type-mismatch on the union', () => {
    // The same closure one binding removed: bug 0081's union arm makes the
    // ternary a proof, so `let x = …`'s unannotated marking guard records `x`
    // as proven too, and the binding-typed argument carries the same genuine
    // `integer | string` forward.
    const doc = parse(U2);
    const argument = argRange(doc, "g", 0);
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("g", 0, "s", "string", "integer | string"),
      argument,
      "u2 — a proven ternary makes the binding it initialises proven too, so the argument sink judges a genuine mismatch",
    );
  });

  it('u3: `g([1, "a"])` against `xs: array<number>` now fires fn-arg-type-mismatch on the union element', () => {
    // Bug 0081's union arm makes the array literal's own element type a proof
    // (`array<integer | string>`) instead of discarding the `string` arm, so
    // this fixture no longer draws `theta/parse/array-no-common-type` either —
    // the array now has a common type of its own, a different row's concern.
    //
    // LANDED (bug 0156, §Fix Route A): with the parameter's `array<number>`
    // now supplied as the element sink, the full diagnostic list also carries
    // `theta/parse/array-element-type-mismatch` at index 1 (`expected number,
    // got string`) beside the code pinned below — the same two-code count as
    // r4, gated by neither row because both codes here read a well-formed
    // literal against a well-formed sink (bug 0129's landed law).
    const doc = parse(U3);
    const argument = argRange(doc, "g", 0);
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("g", 0, "xs", "array<number>", "array<integer | string>"),
      argument,
      "u3 — the element reading is now a proof, so `array<integer | string> ⊭ array<number>` is a genuine mismatch",
    );
  });

  it('u4: `g(["a", null])` against `xs: array<number>` now fires fn-arg-type-mismatch on the union element', () => {
    // Pinned alongside u3 because the two closed through the same mechanism
    // over different arms — a mixed-primitive pair and a `null` arm — so both
    // had to move together, not one of them alone.
    //
    // LANDED (bug 0156, §Fix Route A): the full diagnostic list also carries
    // `theta/parse/array-element-type-mismatch` at index 0 (`expected number,
    // got string`) beside the code pinned below, for the same reason u3's
    // comment states.
    const doc = parse(U4);
    const argument = argRange(doc, "g", 0);
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("g", 0, "xs", "array<number>", "array<string | null>"),
      argument,
      "u4 — a `null` arm unions exactly as a primitive arm does, so the element read is a proof here too",
    );
  });

  it('u5: `par for x in [false ? 1 : "a"] { g(x) }` against `s: string` now fires fn-arg-type-mismatch on the union', () => {
    // The third route bug 0081's union arm closes, after u1's direct read and
    // u2's `let`: the `par for` arm binds the loop variable to the iterand's
    // ELEMENT type, and `[false ? 1 : "a"]` now reads `array<integer | string>`
    // — a proof, not a discarded arm — so `x` binds `integer | string` and the
    // sink judges it against `s: string` for real.
    const doc = parse(U5);
    const argument = argRange(doc, "g", 0);
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("g", 0, "s", "string", "integer | string"),
      argument,
      "u5 — the `par for` element inherits the iterand's union, which is now a proof, not an erasure",
    );
  });
});

// ===========================================================================
// u6 / u6p / u6b / u6c — the FIELD-NAME MINT guard, and the read that is no
// longer a mint. RE-DERIVED under bug 0190 §Fix (f)
// (docs/bugs/0190-fn-arg-sink-withholds-provable-member-reads.md), whose
// authority for this edit is that one premise carried two halves with
// different truth values behind one verdict.
//
// `StaticTypeInferencePass`'s `member` arm resolves the receiver and returns
// the field's DECLARED type, unfolded per TYPE-11 (bug 0136,
// docs/bugs/0136-member-access-types-as-field-name-not-field-type.md; the same
// commit wrote the rule into `expressions.md`'s member-access bullet — "The
// static result type of `obj.field` is the receiver's declared type for that
// field"). A member read of a declared field on a RESOLVED object schema is
// therefore a proof of the read value's type, and cell u6p judges one.
//
// What survives as a mint is the FALLBACK. For an absent field, a fields-less
// declaration or a field `typeSource` the annotation converter declined, the
// arm answers `named <field>` — the author-chosen FIELD NAME, which is not the
// type of the value the read produces and which can RESOLVE against an
// unrelated declaration (cells u6b, u6c). The pass's `method-call` arm mints
// from the METHOD name on the same footing, so that half's withholding is
// whole and untouched. Where such a minted name collides with a declared
// schema, `checkCompatible` does not defer to `"unknown"`: it judges nominally
// (TYPE-10) against a declaration the read has nothing to do with. The
// neighbouring `interpolationIsResult` (src/parser/type-layer-checks.ts)
// already refuses minted member names for this reason, and the argument sink
// refuses the mint on the same rule.
//
// u6's own ASSERTION is unchanged by that re-derivation, and its silence is
// now attributed differently: the field `P` is declared `number` and the
// parameter declares `number`, so an opened sink relates `number ⊑ number` and
// reports nothing.
// ===========================================================================

describe("bug 0050 — a FABRICATED field-name argument read is not a proof and is not judged", () => {
  it("u6: `f(v.P)` where `P` names both a field and a declared schema draws no fn-arg-type-mismatch", () => {
    // `v.P` evaluates to `3` and reads statically as the field's DECLARED
    // `number` — exactly the type the parameter declares — so the relation is
    // COMPATIBLE and this fixture owes nothing whether the sink withholds or
    // judges. The premise this cell used to record (that the read is
    // `named "P"`, resolving to the unrelated `schema P { a: number }`) is
    // false for the field half: the surviving mint is the FALLBACK that u6b and
    // u6c measure. Re-derived under bug 0190 §Fix (f); the assertion is
    // unchanged.
    const doc = parse(U6);
    argRange(doc, "f", 0);
    expectNoFnArgMismatch(
      doc,
      "u6 — the declared field type and the declared parameter type are both `number`, so the silence here is a COMPATIBLE relation and not a withheld read; the collision with `schema P` no longer supplies the read's type",
    );
  });

  it("u6p: `g(p.s)` where the DECLARED field type disagrees with the parameter fires once", () => {
    // The positive differentiator, and the cell that keeps this group from
    // being three absences a fix could satisfy by withholding on every member
    // read — which is the defect bug 0190 reports. `p.s` is declared `string`
    // on a RESOLVED `schema P`, `expressions.md`'s member-access bullet makes
    // that the read's static type, and TYPE-9 names this slot's code for a
    // static failure with both operands resolvable.
    const doc = parse(U6P_DECLARED_FIELD_MISMATCH);
    const argument = argRange(doc, "g", 0);
    expect(
      argument,
      "PRECONDITION: the argument `p.s` sits on the third body line; a drifted layout must fail here rather than let the mismatch assertion below measure the wrong site",
    ).toEqual(range(6, 25, 6, 28));
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("g", 0, "n", "integer", "string"),
      argument,
      "u6p — a declared field type is a proof of the read value's type, so this is the emission the field-name mint's withholding must leave intact",
    );
  });

  it("u6b: an ABSENT field draws no fn-arg-type-mismatch", () => {
    // The first fallback bound. `p.zzz` has no own key in `P`'s declared-field
    // record, so the arm answers the FIELD-NAME MINT, and `expressions.md`'s
    // member-access bullet assigns that program a runtime
    // `theta/runtime/missing-object-key` rather than a parse `E`. Green in both
    // directions.
    const doc = parse(U6B_ABSENT_FIELD);
    argRange(doc, "g", 0);
    expectNoFnArgMismatch(
      doc,
      "u6b — an absent field has no declared type to prove, so the read stays a mint and its specified disposition is a runtime panic this sink must not pre-empt",
    );
  });

  it("u6c: an absent field whose minted name RESOLVES draws no fn-arg-type-mismatch", () => {
    // The second fallback bound, and why the mint's withholding is a constraint
    // rather than a preference: `schema Zzz = integer` makes `named "Zzz"`
    // resolve, so a member arm returning the read's type unconditionally would
    // relate `Zzz` to a `string` parameter and emit a false `E` on a program
    // whose disposition is a panic. The field name is author-chosen and
    // unconstrained here — `lexical.md`'s lowercase-first rule binds DECLARED
    // field names, and `p.Zzz` declares nothing. Green in both directions.
    const doc = parse(U6C_ABSENT_FIELD_RESOLVING_MINT);
    argRange(doc, "g", 0);
    expectNoFnArgMismatch(
      doc,
      "u6c — a minted field name that happens to resolve is still a spelling, so the already-open sibling sinks may judge the collision and this one must not",
    );
  });
});

// ===========================================================================
// u7 / u7p — the index-read guard, and the positive differentiator that keeps
// it from going vacuous.
//
// `StaticTypeInferencePass`'s `index` arm
// (src/parser/static-type-inference.ts:245–250) narrows an index read to the
// TARGET's ELEMENT type. That element object is NOT the object the two
// recording arms mark in `unprovableBindings` — the array type is — so an
// erased target laundered its erasure through the narrowing, past the identity
// channel `provableArgType`'s `ident` arm reads
// (src/parser/type-layer-checks.ts:1849). The guard puts the proof obligation
// on the target (:1872–1882), mirroring the `try` arm's recursion, and keeps
// the element narrowing from `typeOf`.
//
// u7 pins the two ends of that route: the direct read, and the one binding
// removed, where the `let`-marking guard calls `provableArgType` on the
// initialiser (:1019–1020) and marks from that verdict (:1043–1052), inheriting
// whatever the `index` arm answers. Bug 0081's union arm makes the target
// (`xs`) a proof rather than an erasure, so both cells now fire on it. u7p is
// the same pair over a target the ANNOTATION proves, and was always positive —
// it is what stops u7 from passing for the wrong reason: revert the target
// recursion and u7 reds; withhold on every index read and u7p reds.
// ===========================================================================

describe("bug 0050/0081 — an index read off a now-proven target is judged", () => {
  it('u7: `let xs = [false ? 1 : "a"]` then `f(xs[0])` now fires fn-arg-type-mismatch on the union element', () => {
    // `xs` now reads `array<integer | string>` — bug 0081's union arm, not the
    // `candidates[0]` fallback — so `xs[0]` narrows to the proven union, and
    // the index read carries a genuine proof forward instead of an erasure.
    const doc = parse(U7_DIRECT);
    const argument = argRange(doc, "f", 0);
    expect(
      argument,
      "PRECONDITION: the argument `xs[0]` sits on the third body line; a drifted layout must fail here rather than let the mismatch assertion below measure the wrong site",
    ).toEqual(range(6, 11, 6, 16));
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("f", 0, "s", "string", "integer | string"),
      argument,
      "u7 — the element reading is now a proof, so the index read is judged on the same genuine union `xs` carries",
    );
  });

  it('u7 (laundered): `let e = xs[0]` then `f(e)` now fires fn-arg-type-mismatch on the union element', () => {
    // The guard-inheritance path, one binding past u7: `xs[0]` is now a proven
    // read (u7), so `provableArgType(stmt.init)` for `let e = xs[0]` records
    // `e` as proven too, and the argument sink judges the same union forward.
    const doc = parse(U7_LAUNDERED);
    const argument = argRange(doc, "f", 0);
    expect(
      argument,
      "PRECONDITION: the argument `e` sits on the fourth body line",
    ).toEqual(range(7, 11, 7, 12));
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("f", 0, "s", "string", "integer | string"),
      argument,
      "u7 (laundered) — the marking guard now records a proof, not an erasure, so the sink one binding on judges it too",
    );
  });

  it("u7p: an index read off an ANNOTATED `array<integer>` binding still fires", () => {
    // The positive differentiator. `let xs: array<integer>` is a declared type,
    // which the `ident` arm treats as a proof, so `xs[0]` narrows to a proven
    // `integer` and the `string` parameter is a genuine mismatch. TYPE-9 owns
    // this emission; withholding it would trade N1's false positive for a
    // false negative.
    const doc = parse(U7P_DIRECT);
    const argument = argRange(doc, "f", 0);
    expect(
      argument,
      "PRECONDITION: the argument `xs[0]` sits on the third body line, at the same columns as u7's",
    ).toEqual(range(6, 11, 6, 16));
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("f", 0, "s", "string", "integer"),
      argument,
      "u7p — the target's annotation proves the element type, so the index read is judged; this is the emission u7's guard must leave intact",
    );
  });

  it("u7p (laundered): a binding off a PROVEN index read still fires", () => {
    // The differentiator for u7's second half: the marking guard must record
    // this initialiser as a proof, so the emission survives the extra binding.
    const doc = parse(U7P_LAUNDERED);
    const argument = argRange(doc, "f", 0);
    expect(
      argument,
      "PRECONDITION: the argument `e` sits on the fourth body line, at the same columns as u7 (laundered)'s",
    ).toEqual(range(7, 11, 7, 12));
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("f", 0, "s", "string", "integer"),
      argument,
      "u7p (laundered) — the `let` arm marks a binding unprovable only when its initialiser is unproven, so a proven index read keeps the sink live one binding on",
    );
  });
});

// ===========================================================================
// u8 / u8b / u8p — the minted-CALLEE-name guard, and its positive
// differentiator.
//
// `StaticTypeInferencePass`'s `call` arm
// (src/parser/static-type-inference.ts:251) types `F(3)` as `named "F"` — the
// author-chosen CALLEE name, not the type of the value the call returns —
// exactly as its `member` arm's FALLBACK mints a field name for an absent
// field (cells u6b, u6c). The callee namespace's premise is INTACT: bug 0136
// moved the field half of the mint and nothing else. Where that name
// collides with a declared schema, `checkCompatible` judges nominally
// (TYPE-10) against a declaration the call has nothing to do with, so the
// argument sink withholds on the whole arm (src/parser/type-layer-checks.ts
// :1820–1844) under the rule the `member` / `method-call` arm beside it
// already carries.
//
// The withholding loses no sound emission. A user `fn` name is lowercase-first
// (`theta/parse/binding-case-mismatch`, lexical.md:16, :18) and every entry of
// the schema-only `TypeEnv` `collectTypeEnv` builds is uppercase-first
// (`theta/parse/schema-case-mismatch`, lexical.md:15), so a callee name that
// RESOLVES is never the `fn` being called — it is a schema sharing a spelling
// with something else. The `invoke` label rides along: its minted `path`
// either ends in `.theta`, which no schema name can spell, or draws
// `theta/parse/invoke-non-theta-extension`.
// ===========================================================================

describe("bug 0050 — a FABRICATED callee-name argument read is not a proof and is not judged", () => {
  it("u8: `g(F(3))` where `F` names a declared schema draws no fn-arg-type-mismatch", () => {
    // `named "F"` resolves to `schema F { a: number }`, so the sink read
    // `expected number, got F` off a name the author chose for a callee. The
    // fixture carries no `unknown-identifier` either, so the whole input loads
    // clean without this guard's withholding — a GOV-15 addition on an input
    // the row's Trigger never described.
    const doc = parse(U8_SCHEMA_CALLEE);
    expect(
      argRange(doc, "g", 0),
      "PRECONDITION: the argument `F(3)` sits on the third body line; without a reachable call node the absence assertion below measures nothing",
    ).toEqual(range(6, 11, 6, 15));
    expectNoFnArgMismatch(
      doc,
      "u8 — the static read names the callee, not the callee's return type; the collision with `schema F` is what turns a deferral into a false judgement",
    );
  });

  it("u8b: a `.theta`-callable alias colliding with a local schema draws no fn-arg-type-mismatch", () => {
    // The route with a VALID runtime execution, and the one the registry
    // Trigger excludes by name: `F` is the frontmatter alias of
    // `./child.theta`, so `F(1)?` evaluates to the child's Ok payload, and a
    // child ending in a number tail hands `g` the `number` it declares. Cell
    // x2 pins the same exclusion at the OUTER callee position; this cell pins
    // it at an argument position, where the alias smuggled a `.theta`-callable
    // call in under a schema-shaped name.
    const doc = parse(U8_ALIAS_CALLEE);
    argRange(doc, "g", 0);
    expectNoFnArgMismatch(
      doc,
      "u8b — a `.theta`-callable call is outside the row's Trigger wherever it is written, and its Ok payload type is not the alias name",
    );
  });

  it("u8p: `g(F { a: 3 })` — the same `named F` reached through the CONSTRUCTOR form still fires", () => {
    // The positive differentiator. `#typeExpr`'s `object` arm mints `named "F"`
    // from the constructor's own type name, and a `F { … }` constructor does
    // produce an `F`, so that read IS a proof and TYPE-10 makes it
    // incompatible with `n: number`. Identical argType, identical parameter,
    // identical position — the withholding above is scoped to how the name was
    // minted, and this cell reds if it is widened to the whole `named` shape.
    const doc = parse(U8P_CTOR);
    const argument = argRange(doc, "g", 0);
    expect(
      argument,
      "PRECONDITION: the argument `F { a: 3 }` sits on the third body line",
    ).toEqual(range(6, 11, 6, 21));
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("g", 0, "n", "number", "F"),
      argument,
      "u8p — a constructed value's nominal type is a proof; this is the emission the callee-name withholding must leave intact",
    );
  });
});

// ===========================================================================
// u9 / u9b / u9c / u9d / u9p — the minted-IDENTIFIER-name guard, and its
// positive differentiator.
//
// `StaticTypeInferencePass`'s `ident` arm
// (src/parser/static-type-inference.ts:211–216) answers
// `bindings.get(name) ?? { kind: "named", name }`, so for any identifier the
// walk's `bindings` map does not hold, the "type" is MINTED FROM THE
// IDENTIFIER'S OWN SPELLING — the same fabrication cells u6b / u6c and u8
// refuse over the field-name FALLBACK and the callee namespace, one namespace
// over. A minted name that
// resolves to nothing declared defers at `checkCompatible` (`"unknown"`); one
// that collides with a declared schema is judged nominally under TYPE-10
// against a declaration the read has nothing to do with.
//
// `bindings` holds no JUDGED type for three of the four routes below. u9 is the
// exception: its plain `for` variable carries the iterand's PROVEN element under
// bug 0126 (docs/bugs/0126-plain-for-binds-no-loop-variable.md), which is why
// that cell emits off the record rather than off the spelling.
// `collectLocalBinderNames`'s doc comment
// (src/parser/type-layer-checks.ts:495–500) names the two ways the other three
// arrive: a frontmatter `params:` field never reaches the map at all, and the
// binder classes this layer cannot type — a match-arm binding, an unannotated
// `fn` parameter, a loop variable whose iterand is not an `array<T>` — are
// recorded as WITHHELD entries (`recordWithheldBinders`, group u12), which the
// `ident` arm's identity channel refuses exactly as it refuses a miss. u9d's
// bare schema reference is the remaining miss, and it is the only route in this
// group whose read still carries the identifier's own spelling: no `TypeEnv`
// key can equal a WITHHELD entry's name, so the nominal judgement described
// above is unreachable through it and the sibling rows defer on it as well
// (group u13). The asymmetry that makes the group real is the `par for` arm, which
// records a JUDGED element type (`inner.set(e.variable, elementType)`,
// :2052): u9p rides that record and MUST keep emitting.
//
// Every u9 fixture shares one prelude, so each differs only in how `P` reaches
// the argument position. u9, u9b, u9c and u9p draw no other diagnostic at this
// HEAD — each loaded cleanly before the guard, which is what makes those cells
// GOV-15 measurements rather than error-list reshuffles. u9d is the exception:
// bug 0140's fix
// (docs/bugs/0140-bare-schema-reference-value-position-silent.md) makes a bare
// declared-schema reference at a value position draw `theta/parse/type-as-value`,
// so u9d's fixture now carries that code beside the withheld fn-arg one.
// `expectNoFnArgMismatch` filters to `CODE` alone, so the cell stays green
// either way — the argument-type judgement stays withheld, and a different
// pass answers the identifier-resolution question this group never claimed.
// ===========================================================================

describe("bug 0050 — a FABRICATED identifier-name argument read is not a proof and is not judged", () => {
  it("u9: a `for` variable spelled like a declared schema fires on the iterand's element type, under bug 0126", () => {
    // `for P in …` violates no case rule: lexical.md:16 scopes the
    // lowercase-first rule to `let` / `let mut` bindings, function
    // parameters, function names and schema field names, and :15 scopes
    // uppercase-first to type-like bindings — a `for` variable is in neither
    // list. expressions.md:53 classifies it as a local binder alongside
    // `let` and a `params:` field, and the runtime binds it unconditionally
    // (src/runtime/statement-executor.ts:1716,
    // `env.bindIterationVariable(stmt.variable, element)`), so each iteration
    // hands `g` the integer `1` then `2`, never a `P`.
    //
    // Bug 0126 (docs/bugs/0126-plain-for-binds-no-loop-variable.md) makes the
    // type layer agree with that runtime fact: the read is no longer the
    // author's chosen spelling but the iterand's element type, `[1, 2]`'s
    // proven `integer`, so `g`'s declared `Q` genuinely disagrees with it —
    // the same TRUE positive `u9p` reports below, off the identical
    // recorded-element channel. Cells u12e and u13me name this
    // re-adjudication in their own comments, under the same authority.
    const doc = parse(U9_FOR_VARIABLE);
    const argument = argRange(doc, "g", 0);
    expect(
      argument,
      "PRECONDITION: the argument `P` sits inside the loop body on body line 7; a drifted layout must fail here rather than let the mismatch assertion below measure nothing",
    ).toEqual(range(7, 29, 7, 30));
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("g", 0, "x", "Q", "integer"),
      argument,
      "u9 — bug 0126 binds the plain `for` variable to the iterand's element type, so the read is `[1, 2]`'s proven `integer` rather than the identifier's own spelling, and `g`'s declared `Q` genuinely disagrees with it",
    );
  });

  it("u9b: a `match`-arm binder spelled like a declared schema draws no fn-arg-type-mismatch", () => {
    // `parsePattern` (src/parser/theta-document.ts:3935) answers
    // `{ kind: "identifier", name }` for a bare pattern whatever its case, and
    // both runtime matchers bind it unconditionally
    // (src/runtime/match-result.ts:177–179;
    // src/runtime/statement-executor.ts:1174,
    // `armEnv.defineLocal(name, value, false)`), so this arm hands `g` the
    // scrutinee `3`. Whether expressions.md:174's disambiguation ("lowercase
    // identifiers bind, capitalised identifiers refer to constructors or schema
    // names") should reject a capitalised bare pattern is a separate question
    // this route does not answer: under either reading the argument's runtime
    // value is not a `P`, so the type judgement is fabricated either way.
    const doc = parse(U9_MATCH_BINDER);
    const argument = argRange(doc, "g", 0);
    expect(
      argument,
      "PRECONDITION: the argument `P` sits in the sole match arm's body on body line 7",
    ).toEqual(range(7, 28, 7, 29));
    expectNoFnArgMismatch(
      doc,
      "u9b — a match-arm binding is one of the classes the walk records WITHHELD rather than judged, so the read is a spelling and not a proven type",
    );
  });

  it("u9c: an UNANNOTATED `fn` parameter spelled like a declared schema draws no fn-arg-type-mismatch", () => {
    // `walkFn` seeds its body scope with a JUDGED type for the ANNOTATED
    // parameters only (src/parser/type-layer-checks.ts:1236–1247, gated on
    // `p.type.length > 0`); an unannotated one is recorded WITHHELD (group u12),
    // so no proof of its type exists inside the body. The runtime
    // binds it positionally regardless
    // (src/runtime/statement-executor.ts:438,
    // `scope.defineLocal(fn.params[i].name, arg.value, false)`), so `h(3)`
    // hands `g` the integer `3`. lexical.md:16 requires a lowercase-first
    // parameter name, which `P` violates: bug 0139's `binding-case-mismatch`
    // fires on it, and that is not what this cell pins — the pin is that a
    // name minted from the parameter's spelling is never the argument's type.
    // `h`'s own call defers on the same unannotated parameter (cell d1's arm).
    const doc = parse(U9_FN_PARAM);
    const argument = argRange(doc, "g", 0);
    expect(
      argument,
      "PRECONDITION: the argument `P` sits inside `h`'s body on body line 7",
    ).toEqual(range(7, 21, 7, 22));
    expectNoFnArgMismatch(
      doc,
      "u9c — an unannotated parameter has no judged type inside the body, and the minted name resolves to the unrelated `schema P`",
    );
  });

  it("u9d: a bare declared-schema reference at an argument position draws no fn-arg-type-mismatch", () => {
    // The route with no binder at all: `P` reaches the argument position as a
    // bare declared-schema reference. `checkUnknownIdentifiers`
    // (src/parser/theta-document.ts:4970) seeds its walk from the roots every
    // NON-declaration source contributes, so a name only a `schema`
    // declaration introduces matches no arm of expressions.md's four-arm
    // resolution list and draws `theta/parse/type-as-value` at this value
    // position. That code answers the identifier-resolution question, which
    // bug 0140 (docs/bugs/0140-bare-schema-reference-value-position-silent.md)
    // owns and this group does not. The argument-type judgement this cell owns
    // stays WITHHELD on 0050's ground: the minted read is the identifier's
    // spelling and proves nothing about what the position holds, so a TYPE
    // MISMATCH here would assert the argument IS a `P` value — something no
    // phase establishes, since the type layer holds no recorded type for the
    // name at all. `expectNoFnArgMismatch` filters to `CODE`, so the co-firing
    // resolution diagnostic leaves this cell's verdict unchanged.
    const doc = parse(U9_BARE_SCHEMA_REF);
    const argument = argRange(doc, "g", 0);
    expect(
      argument,
      "PRECONDITION: the argument `P` sits on body line 7",
    ).toEqual(range(7, 13, 7, 14));
    expectNoFnArgMismatch(
      doc,
      "u9d — a schema name at a value position is not a value of that schema; the minted read is the identifier's spelling and proves nothing about what the position holds",
    );
  });

  it("u9p: a `par for` variable spelled like a declared schema still fires, on the PROVEN element type", () => {
    // The positive differentiator, and the asymmetry that makes the four cells
    // above real rather than a blanket withholding. `walkExpr`'s `par for` arm
    // DOES record the loop variable (src/parser/type-layer-checks.ts:2099),
    // and `[1, 2]` is a proven `array<integer>`, so `P` carries a recorded
    // `integer` and `x: Q` is a genuine TYPE-10 mismatch — note the message
    // says `got integer`, not `got P`: the recorded type wins over the
    // spelling exactly where one exists. Withhold on every `ident` and this
    // cell reds alongside r1's whole family.
    const doc = parse(U9P_PAR_FOR);
    const argument = argRange(doc, "g", 0);
    expect(
      argument,
      "PRECONDITION: the argument `P` sits inside the `par for` body on body line 7",
    ).toEqual(range(7, 34, 7, 35));
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("g", 0, "x", "Q", "integer"),
      argument,
      "u9p — a recorded loop-variable type is a proof; this is the emission the minted-name withholding must leave intact, and the channel that decides it is the map entry, never the identifier's case or spelling",
    );
  });
});

// ===========================================================================
// u10 / u10b / u10c / u10d — the arithmetic-result guard, and u10p / u10pb /
// u10pc, the three differentiators that keep it from swallowing sound
// emissions.
//
// `StaticTypeInferencePass`'s `#typeBinary`
// (src/parser/static-type-inference.ts:298–335) answers a negation with its
// OPERAND's type (`#typeExpr(right)`) and any other non-boolean operator with
// the `#commonType` reduction of its two operands. Neither answer is the
// OPERATOR's result type, and for `-`, `*`, `/`, `%` and unary `-` the spec
// fixes that result: expressions.md §"Other arithmetic" gives binary `-`, `*`,
// `%` `integer` on two `integer` operands widening to `number`, `/` always
// `number`, and unary `-` the same rule on its single operand — with `NaN` a
// `number` too. No spec sentence assigns any of the five a `string`, `boolean`
// or `null` result, and the runtime reaches the numeric result by COERCION:
// `applyBinaryScalar` casts both operands (src/runtime/statement-executor.ts
// :892–899) and the negation path computes `-(right.value as number)` (:839).
//
// The exactness test the arithmetic arm shares with `ternary` / `match` /
// `array` does not catch this: `isProvenReduction`
// (src/parser/type-layer-checks.ts) asks whether the reduction is EXACT over
// the operand reads, and a same-typed pair of proven non-numeric operands is
// exact — `"a" - "b"` reduces to a proven `string`. Operator ADMISSIBILITY is a
// different question, and the one that decides the result type, so the arm
// withholds outside the numeric shapes (`classifyOperand`, this module's one
// numeric test, shared with the A5 `+` and A6 ordering operand checks).
//
// Each u10 fixture's SOLE diagnostic before the guard was this code — measured;
// no registry row covers a non-numeric arithmetic OPERAND and none is checked,
// so these inputs loaded cleanly — which makes the four cells GOV-15
// measurements rather than error-list reshuffles. Supplying such a row is a
// separate filing and is NOT done here.
//
// `+` is outside the family and untouched (cell u10pc): expressions.md
// §"`+` operator" makes a both-`string` pair concatenation, so there the
// reduction IS the result type, and every pairing that is neither both-numeric
// nor both-`string` already fails to load on
// `theta/parse/mixed-plus-operands`.
// ===========================================================================

describe("bug 0050 — an arithmetic result read as a NON-NUMERIC type is not a proof and is not judged", () => {
  it('u10: `g(-"5")` against `n: number` draws no fn-arg-type-mismatch', () => {
    // The operand's proof is a `string`, and the sink read it as the
    // negation's type: `expected number, got string` on an expression whose
    // value is the number `-5`. Refusing that input rejects a program whose
    // argument the declared parameter type accepts.
    const doc = parse(U10_NEG_STRING);
    expect(
      argRange(doc, "g", 0),
      'PRECONDITION: the argument `-"5"` sits on the second body line; a drifted layout must fail here rather than let the absence assertion below measure nothing',
    ).toEqual(range(5, 11, 5, 15));
    expectNoFnArgMismatch(
      doc,
      "u10 — unary `-` produces a number whatever it is applied to, so the operand's own type is not a proof of the negation's value type",
    );
  });

  it('u10 (laundered): `let x = -"5"` then `g(x)` draws no fn-arg-type-mismatch', () => {
    // The guard-inheritance path, as u7 (laundered) pins for an index read:
    // `walkStmt`'s unannotated-`let` arm marks the binding unprovable exactly
    // when `provableArgType(stmt.init)` withholds, so a negation arm that
    // answered DEFINED here would record `x` as a proof and this cell would
    // red one call site later.
    const doc = parse(U10_NEG_STRING_LAUNDERED);
    expect(
      argRange(doc, "g", 0),
      "PRECONDITION: the argument `x` sits on the third body line",
    ).toEqual(range(6, 11, 6, 12));
    expectNoFnArgMismatch(
      doc,
      "u10 (laundered) — a binding whose initialiser is an unproven negation carries that unprovability forward; the marking guard and the argument sink must agree on one answer",
    );
  });

  it("u10b: `g(-true)` against `n: number` draws no fn-arg-type-mismatch", () => {
    // The second operand shape, pinned separately from u10 because a fix could
    // plausibly special-case `string` and leave the rest: `-true` evaluates to
    // the number `-1` (`-(right.value as number)`,
    // src/runtime/statement-executor.ts:887) while the read claims `boolean`.
    const doc = parse(U10_NEG_BOOL);
    expect(
      argRange(doc, "g", 0),
      "PRECONDITION: the argument `-true` sits on the second body line",
    ).toEqual(range(5, 11, 5, 16));
    expectNoFnArgMismatch(
      doc,
      "u10b — a `boolean` operand negates to a number exactly as a `string` one does; the withholding is keyed to the operator, not to which non-numeric operand it was handed",
    );
  });

  it('u10c: `g("a" - "b")` against `n: number` draws no fn-arg-type-mismatch', () => {
    // The BINARY half, and the one `isProvenReduction` cannot catch: both
    // operands are proven `string` literals, so the reduction is exact and the
    // arm trusted it. The value is `NaN` — a `number` by
    // expressions.md §"Other arithmetic" — which `n: number` accepts.
    const doc = parse(U10_MINUS_STRINGS);
    expect(
      argRange(doc, "g", 0),
      'PRECONDITION: the argument `"a" - "b"` sits on the second body line',
    ).toEqual(range(5, 11, 5, 20));
    expectNoFnArgMismatch(
      doc,
      "u10c — an exact reduction over two `string` operands is still not a proof of a subtraction's value type, because `-`'s result type is the operator's",
    );
  });

  it("u10d: the same shape under `/`, `%` and `*` draws no fn-arg-type-mismatch", () => {
    // The remaining three operators of the family. `"6" / "2"` evaluates to the
    // number `3` and `"6" % "2"` to `0` — both through
    // `applyBinaryScalar`'s casts (src/runtime/statement-executor.ts:943, :945)
    // — while `"a" * "b"` is `NaN`; all three read `string` before the guard.
    // One cell over three fixtures, because a partial operator set is the
    // plausible slip and each fixture differs only in the operator token.
    for (const [label, src, argument] of [
      ["/", U10_DIV_STRINGS, range(5, 11, 5, 20)],
      ["%", U10_MOD_STRINGS, range(5, 11, 5, 20)],
      ["*", U10_MUL_STRINGS, range(5, 11, 5, 20)],
    ] as const) {
      const doc = parse(src);
      expect(
        argRange(doc, "g", 0),
        `PRECONDITION: the \`${label}\` fixture's argument sits on the second body line`,
      ).toEqual(argument);
      expectNoFnArgMismatch(
        doc,
        `u10d (${label}) — expressions.md §"Other arithmetic" fixes this operator's result to \`integer\` / \`number\` as it does \`-\`'s, so the operand reading is no more a proof here`,
      );
    }
  });

  it("u10p: a numeric negation still fires, over both numeric `CompatType` shapes", () => {
    // The first differentiator, and the reason the guard tests the operand's
    // proof rather than withholding on every negation. `-1.5` is a `literal`
    // typing as `number` (`#typeExpr`'s `number` arm) and `let m: number` is a
    // `prim` `number` (`annotationToCompatType`); both are numeric, unary `-`
    // preserves the operand's numeric type per
    // expressions.md §"Other arithmetic", and the parameter is a genuine
    // TYPE-9 mismatch in each case. Withhold on every negation and both halves
    // red.
    const literalDoc = parse(U10P_NEG_LITERAL);
    const literalArg = argRange(literalDoc, "g", 0);
    expect(
      literalArg,
      "PRECONDITION: the argument `-1.5` sits on the second body line",
    ).toEqual(range(5, 11, 5, 15));
    expectOneFnArgMismatch(
      literalDoc,
      fnArgMessage("g", 0, "n", "integer", "number"),
      literalArg,
      "u10p (literal) — `-1.5` is a `number`, and TYPE-2's widening is one-way, so the `integer` parameter is the mismatch the guard must leave intact",
    );

    const annotatedDoc = parse(U10P_NEG_ANNOTATED);
    const annotatedArg = argRange(annotatedDoc, "g", 0);
    expect(
      annotatedArg,
      "PRECONDITION: the argument `-m` sits on the third body line",
    ).toEqual(range(6, 11, 6, 13));
    expectOneFnArgMismatch(
      annotatedDoc,
      fnArgMessage("g", 0, "s", "string", "number"),
      annotatedArg,
      "u10p (annotated) — an annotated numeric binding reaches the guard as a `prim`, not a `literal`; a numeric test covering only one of the two shapes reds here",
    );
  });

  it("u10pb: a numeric arithmetic reduction still fires", () => {
    // The second differentiator. `1 - 2` reduces to a proven `integer`, which
    // IS the operator's result type for two `integer` operands, so the
    // `string` parameter is a genuine mismatch. Withhold on every arithmetic
    // binary and this cell reds.
    const doc = parse(U10PB_ARITH);
    const argument = argRange(doc, "g", 0);
    expect(
      argument,
      "PRECONDITION: the argument `1 - 2` sits on the second body line",
    ).toEqual(range(5, 11, 5, 16));
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("g", 0, "s", "string", "integer"),
      argument,
      "u10pb — a numeric reduction agrees with the operator's own result type, so it is a proof and the emission stands",
    );
  });

  it("u10pc: `+` keeps its both-`string` and numeric verdicts", () => {
    // The scope lock. `+` is not in the family: on two `string` operands it
    // CONCATENATES, so the `string` reduction is the result type and
    // `expected number, got string` is true of `"a" + "b"`; on two `integer`
    // operands it adds, so `expected string, got integer` is true of `1 + 2`.
    // A guard widened to every non-boolean binary reds both halves, which is
    // what keeps the withholding off `+`'s shapes.
    const numericDoc = parse(U10PC_PLUS_NUMERIC);
    const numericArg = argRange(numericDoc, "g", 0);
    expect(
      numericArg,
      "PRECONDITION: the argument `1 + 2` sits on the second body line",
    ).toEqual(range(5, 11, 5, 16));
    expectOneFnArgMismatch(
      numericDoc,
      fnArgMessage("g", 0, "s", "string", "integer"),
      numericArg,
      "u10pc (numeric) — addition on two `integer` operands produces an `integer`, so the reduction is the result type and the `string` parameter is a real mismatch",
    );

    const stringDoc = parse(U10PC_PLUS_STRINGS);
    const stringArg = argRange(stringDoc, "g", 0);
    expect(
      stringArg,
      'PRECONDITION: the argument `"a" + "b"` sits on the second body line',
    ).toEqual(range(5, 11, 5, 20));
    expectOneFnArgMismatch(
      stringDoc,
      fnArgMessage("g", 0, "n", "number", "string"),
      stringArg,
      "u10pc (string) — `+` on two `string` operands is concatenation, so the `string` claim is TRUE here and withholding it would trade a false positive for a false negative",
    );
  });
});

// ===========================================================================
// u11 / u11b / u11c — the SELF-SHADOWING initialiser, and u11p, the
// proven-outer differentiator that keeps the three from passing vacuously.
//
// `walkStmt`'s unannotated-`let` arm marks a binding unprovable when
// `provableArgType(stmt.init)` withholds, and that verdict has to be reached
// in the scope the initialiser is EVALUATED in. The runtime evaluates the
// initialiser and only then defines the binding (`evalExpr(stmt.init, env)`
// then `env.defineLocal`, src/runtime/statement-executor.ts), so a
// self-reference inside the initialiser of a shadowing `let` resolves to the
// OUTER binding — the one `unprovableBindings` would have recorded by object
// identity had bug 0081's union arm not made it a proof instead. A verdict
// reached after the new binding is recorded instead resolves the
// self-reference to a type object the arm is in the middle of recording,
// which no marking has reached, which is the laundering shape this family
// still guards against for a future regression.
//
// Each of the three fixtures now loads with the genuine mismatch as its SOLE
// diagnostic, so these cells assert the WHOLE diagnostic list rather than the
// code's presence alone — non-vacuous in the same way ok1 / ok2 are.
//
// The self-reference's ORIENTATION is why the family needs its own cells:
// `commonType`'s dominating search (src/parser/type-compat.ts) resolves
// `1 + x` to the outer binding's OWN union object by subsumption (the union
// dominates the bare literal `1`), so `let x = x + 1` and `let x = 1 + x`
// reach the same proof from opposite sides. u11b is the orientation that
// measures the guard's scope rather than an identity shortcut, and is worked
// through on its own terms in its cell comment.
// ===========================================================================

describe("bug 0050/0081 — a SELF-SHADOWING initialiser over a now-proven binding is judged", () => {
  it('u11: `let x = flag ? 1 : "a"` then `let x = flag ? 1 : x` then `g(x)` now fires fn-arg-type-mismatch', () => {
    // The ternary orientation. Bug 0081's union arm makes the FIRST `x` a
    // proof: `integer | string`, not the `candidates[0]` fallback, so the
    // first binding is no longer marked unprovable. The second `let x`'s own
    // initialiser reads the OUTER `x` (the runtime's own evaluate-then-define
    // order, which the marking guard mirrors) — outer `x ∈ {1, "a"}`, so the
    // second ternary's candidate set is `{1, outer x} = {integer, integer |
    // string}`, which reduces to the SAME union by subsumption (clause 1: the
    // union already dominates the bare `integer`). Both ternary arms
    // (`1` and the self-reference) are independently proven and each is `⊑`
    // that union (TYPE-5), so `isProvenReduction` holds for the second binding
    // too — the recorded `integer | string` is exact, not laundered through an
    // erased outer read. `integer | string ⊭ string` is TYPE-6, so the
    // argument sink's mismatch is a true positive.
    const doc = parse(U11_SELF_TERNARY);
    const argument = argRange(doc, "g", 0);
    expect(
      argument,
      "PRECONDITION: the argument `x` sits on the fifth body line; a drifted layout must fail here rather than let the mismatch assertion below measure the wrong site",
    ).toEqual(range(8, 11, 8, 12));
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("g", 0, "s", "string", "integer | string"),
      argument,
      "u11 — the marking guard resolves the self-reference to the OUTER binding, which is now proven, so the shadowing binding is proven too and the mismatch is genuine",
    );
  });

  it('u11b: the RIGHT-hand orientation `let x = 1 + x` over a now-proven outer `x` fires fn-arg-type-mismatch', () => {
    // The orientation that measures the guard's scope, not its identity
    // shortcut: `1 + x`'s reduction resolves through `commonType`'s dominating
    // search to the outer binding's OWN union object (clause 1 — the union
    // dominates the bare `integer` literal `1`), so this cell is proven by the
    // same structural argument u11 works through, on `+` instead of a nested
    // ternary. `+`'s own provability rule keeps the reduction whatever it
    // classifies as (expressions.md §"`+` operator"), so a proven union
    // reduction is a proven `+`.
    //
    // `1 + x` ALSO now draws `theta/parse/mixed-plus-operands` (r10's own
    // shape, one binding over: a plain `integer` against a union classifies
    // as neither both-numeric nor both-string). That code is asserted by its
    // own row, not pinned again here; `expectOneFnArgMismatch` reads the
    // `fn-arg-type-mismatch`-coded emission alone, which is this cell's
    // subject and is unaffected by the sibling code's presence.
    const doc = parse(U11_SELF_ARITH);
    const argument = argRange(doc, "g", 0);
    expect(
      argument,
      "PRECONDITION: the argument `x` sits on the fifth body line, at the same columns as u11's",
    ).toEqual(range(8, 11, 8, 12));
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("g", 0, "s", "string", "integer | string"),
      argument,
      "u11b — the outer `x` is now proven, so `1 + x` reduces to a proof and the mismatch it names is genuine",
    );
  });

  it("u11c: a self-shadowing ARRAY initialiser reading its outer binding through an index now fires fn-arg-type-mismatch", () => {
    // The composite route, one narrowing deeper: `let x = [flag ? 1 : "a"]`
    // now records a PROVEN `array<integer | string>` (u7's own closure), and
    // the shadowing `[1, x[0]]` reads the outer array through the `index`
    // arm, whose proof obligation is the TARGET — proven, by u7's argument —
    // so the element narrowing `x[0]` is proven too, and `g(x[1])` is judged
    // on the same genuine union one narrowing further on.
    const doc = parse(U11_SELF_INDEX);
    const argument = argRange(doc, "g", 0);
    expect(
      argument,
      "PRECONDITION: the argument `x[1]` sits on the fifth body line",
    ).toEqual(range(8, 11, 8, 15));
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("g", 0, "s", "string", "integer | string"),
      argument,
      "u11c — the array literal and the element narrowing now carry a proof together, so the argument sink judges a genuine mismatch",
    );
  });

  it("u11p: a self-shadowing initialiser over a PROVEN outer binding still fires", () => {
    // The differentiator, and the reason the three cells above cannot be
    // satisfied by withholding on every self-shadowing initialiser. `let x = 1`
    // is a proven `integer`, so `1 + x` is a proven `integer` reduction — which
    // IS `+`'s result type on two `integer` operands (cell u10pc) — and the
    // runtime binds the `integer` 2, which `s: string` genuinely refuses.
    // TYPE-9 owns this emission; withhold on the shape rather than on the
    // outer binding's provability and this cell reds.
    const doc = parse(U11P_PROVEN_OUTER);
    const argument = argRange(doc, "g", 0);
    expect(
      argument,
      "PRECONDITION: the argument `x` sits on the fourth body line",
    ).toEqual(range(7, 11, 7, 12));
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("g", 0, "s", "string", "integer"),
      argument,
      "u11p — a self-reference resolved to a PROVEN outer binding keeps the whole initialiser proven, so the mismatch stands and the u11 guard must leave it intact",
    );
  });
});

// ===========================================================================
// u12 / u12b / u12c / u12d — a binder that SHADOWS a same-named outer record,
// one cell per binder class the walk's `bindings` map did not record; u12e the
// cell bug 0126 flips from a deferral to a fired mismatch; u12p … u12pe the
// five differentiators.
//
// The species is the u11 group's, one scope out: a provability verdict has to
// be taken in the scope the runtime EVALUATES the expression in. The `ident`
// arm withholds on a `bindings.get` MISS (the u9 group), which covers a binder
// the map does not record — until that binder SHADOWS a same-named outer
// record, when the lookup HITS the outer record and proves a binding the
// runtime never reads at that position.
//
// The runtime installs all four binders in an inner scope, unconditionally:
//   - a `for` variable — `executeFor` (src/runtime/statement-executor.ts:1716,
//     `env.bindIterationVariable(stmt.variable, element)`); control-flow.md:13
//     binds it "as a fresh immutable local per iteration".
//   - a `match` pattern binding — `evalMatch`
//     (src/runtime/statement-executor.ts:1172–1174, `env.child()` then
//     `armEnv.defineLocal`), with an identifier pattern binding the scrutinee
//     whatever its value (src/runtime/match-result.ts:177–179).
//   - a `fn` parameter, annotated or not — `evalUserFnCall`
//     (src/runtime/statement-executor.ts:432–438, `env.childFnActivation()`
//     then per-parameter `defineLocal`). theta 1.0 has no closures, so a
//     caller-frame local is not visible inside the body at all.
// expressions.md:51 makes local bindings "shadow everything else lexically",
// and :53 enumerates the same classes as locals — a `for` / `par for`
// variable, a `match` pattern binding, a function parameter.
//
// THE SHAPE OF THE RECORD, and which rows it moves: each binder goes into the
// INNER scope only (the walk's `new Map(bindings)` idiom), bound to a type
// object whose name is the unspellable `WITHHELD_BINDER_TYPE_NAME`
// (src/parser/type-layer-checks.ts:388) and marked in `unprovableBindings`. The
// identity channel the `ident` arm reads turns the hit into a withhold, which
// is what these four cells measure. The SIBLING rows — every other consumer of
// `typeOf` — move too, and only in the DEFERRAL direction: an in-scope read of
// one of these binders no longer resolves to a same-named outer record, and
// where the map used to miss, the spelling `#typeExpr` minted was judged
// nominally wherever it collided with a declaration. Group u13 below owns that
// half, both directions and both classes. `provableArgType`'s own `match` arm
// resolves each arm body in that arm's scope as well, so the reduction proof
// and the walk cannot disagree about which binding an arm body reads — that
// disagreement IS this species.
//
// Bug 0126 (docs/bugs/0126-plain-for-binds-no-loop-variable.md) binds the
// plain `for` variable to its iterand's element type the same way the
// `par for` arm's ELEMENT record already does, so cell u12e fires: its
// iterand `[3]` is a proven `array<integer>`, which disagrees with `g`'s
// declared `string`. Cell u9 above fires the same way, off the same channel.
// Bug 0089's tripwire (tests/fn-param-alias-unfolded-at-gates.test.ts:868–890),
// which forbade exactly this widening, is the row bug 0126 deliberately
// inverts — see that file's own row n1.
//
// Each of the four absence fixtures loads with the false emission as its SOLE
// diagnostic, so those cells assert the WHOLE diagnostic list is empty rather
// than the code's absence alone — non-vacuous in the same way ok1 / ok2 are.
// ===========================================================================

describe("bug 0050 — a binder SHADOWING a same-named outer record resolves in the runtime's own scope", () => {
  it('u12: `let x = 1` then `for x in ["a"] { let r = g(x) }` draws nothing', () => {
    // The `for` variable class. `walkStmt`'s `for` arm
    // (src/parser/type-layer-checks.ts:1072–1106) copies `bindings` for the body
    // and recorded nothing for `stmt.variable`, so `g(x)` resolved `x` to the
    // outer `let x = 1`. The runtime's only iteration binds the element `"a"`,
    // so the argument's runtime value is that string and `s: string` accepts
    // it: an emission here refuses a program every execution of which is
    // well-typed, and its `got integer` names a value the position never holds.
    const doc = parse(U12_FOR_SHADOW);
    expect(
      argRange(doc, "g", 0),
      "PRECONDITION: the argument `x` sits inside the loop body on body line 6; a drifted layout must fail here rather than let the empty diagnostic list below measure nothing",
    ).toEqual(range(6, 28, 6, 29));
    expect(
      doc.diagnostics,
      `u12 — the loop variable must be resolved in the body scope the runtime binds it into, not in the enclosing scope it hides. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });

  it('u12b: `let x = 1` then `let m = match "hi" { x => g(x) }` draws nothing', () => {
    // The `match` pattern-binding class, reached through the WALK: the arm body
    // is walked, and `walkExpr`'s `match` arm
    // (src/parser/type-layer-checks.ts:2005–2021) walked it with the outer map.
    // The arm's `x` is the scrutinee `"hi"` at runtime, so `g` receives that
    // string.
    const doc = parse(U12_MATCH_ARM_SHADOW);
    expect(
      argRange(doc, "g", 0),
      "PRECONDITION: the argument `x` sits in the sole match arm's body on body line 6",
    ).toEqual(range(6, 29, 6, 30));
    expect(
      doc.diagnostics,
      `u12b — an arm body is evaluated with that arm's pattern bindings installed, so a same-named outer record is not what the body reads. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });

  it('u12c: `let x = 1` then `let r = g(match "hi" { x => x })` draws nothing', () => {
    // The same binder class reached through the REDUCTION instead: the `match`
    // sits at the argument position, so `provableArgType`'s own `match` arm
    // (src/parser/type-layer-checks.ts:1718–1737) proves the composite over its
    // arm bodies. Proving those bodies in the outer scope while the walk
    // resolves them in the arm scope is the scope disagreement this group
    // closes. The match's runtime value is the scrutinee `"hi"`, which
    // `s: string` accepts.
    const doc = parse(U12_MATCH_ARG_SHADOW);
    expect(
      argRange(doc, "g", 0),
      "PRECONDITION: the whole `match` expression is the argument, on body line 6",
    ).toEqual(range(6, 11, 6, 32));
    expect(
      doc.diagnostics,
      `u12c — the reduction proof over arm bodies must read each body in that arm's own scope, the same scope the walk uses. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });

  it('u12d: `let x = 1` then `fn h(x): number { g(x) }` called `h("a")` draws nothing', () => {
    // The unannotated-parameter class. `walkFn`
    // (src/parser/type-layer-checks.ts:1234–1247) recorded ANNOTATED parameters
    // only, so an unannotated one left the same-named outer `let` visible
    // inside the body — a binding the runtime does not even provide there,
    // since a `fn` activation is a scope boundary and theta 1.0 has no
    // closures. `h("a")` binds the parameter to the string `"a"`, so that is
    // what `g` receives. The declaration ORDER matters and is the finding's:
    // the outer `let` precedes the `fn`, so the walk holds a record for `x`
    // when it reaches the body.
    const doc = parse(U12_FN_PARAM_SHADOW);
    expect(
      argRange(doc, "g", 0),
      "PRECONDITION: the argument `x` sits inside `h`'s body on body line 6",
    ).toEqual(range(6, 21, 6, 22));
    expect(
      doc.diagnostics,
      `u12d — an unannotated parameter still BINDS its name in the activation scope, so the outer record it hides is not the argument's type. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });

  it("u12e: `for x in [3] { g(x) }` over a PROVEN iterand fires, under bug 0126", () => {
    // The `par for` arm records the iterand's ELEMENT type
    // (src/parser/type-layer-checks.ts:2099, the record cell u9p rides), and
    // bug 0126 (docs/bugs/0126-plain-for-binds-no-loop-variable.md) settles
    // that the plain `for` arm records the same element for a PROVEN iterand.
    // `[3]` is a proven `array<integer>`, so `x` carries a genuine `integer`
    // proof and every iteration hands `g` an integer where it declares
    // `s: string`. Cell u9 above and bug 0089's tripwire
    // (tests/fn-param-alias-unfolded-at-gates.test.ts:868–890) are the two
    // cells bug 0126 names and re-adjudicates under the same authority.
    const doc = parse(U12E_FOR_PROVEN_ITERAND);
    const argument = argRange(doc, "g", 0);
    expect(
      argument,
      "PRECONDITION: the argument `x` sits inside the loop body on body line 5",
    ).toEqual(range(5, 26, 5, 27));
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("g", 0, "s", "string", "integer"),
      argument,
      "u12e — bug 0126 binds the plain `for` variable to the iterand's element type, so this PROVEN iterand's element is a genuine proof and the mismatch fires",
    );
  });

  it('u12p: an outer PROVEN binding that nothing shadows stays visible inside a `for` body', () => {
    // The first differentiator: the loop variable is `y`, so `x` is the outer
    // `let x = 1` in the parse AND at runtime — a `for` body scope chains to
    // the enclosing environment (`executeFor`, iteration scope built by
    // `env.bindIterationVariable`), so the body reads the integer `1` and
    // `s: string` genuinely refuses it. Withhold on every identifier inside a
    // `for` body and this cell reds.
    const doc = parse(U12P_FOR_OUTER_VISIBLE);
    const argument = argRange(doc, "g", 0);
    expect(
      argument,
      "PRECONDITION: the argument `x` sits inside the loop body on body line 6",
    ).toEqual(range(6, 28, 6, 29));
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("g", 0, "s", "string", "integer"),
      argument,
      "u12p — only the SHADOWING name is withheld; an unshadowed outer record is the binding the runtime reads, so its emission stands",
    );
  });

  it('u12pb: an outer PROVEN binding that nothing shadows stays visible inside a `match` arm', () => {
    // The same differentiator one construct over: the arm binds `y`, so the
    // arm body's `x` is the outer `let x = 1`. `evalMatch` builds the arm scope
    // with `env.child()`, which chains to the enclosing environment, so the
    // runtime argument is the integer `1`.
    const doc = parse(U12PB_MATCH_OUTER_VISIBLE);
    const argument = argRange(doc, "g", 0);
    expect(
      argument,
      "PRECONDITION: the argument `x` sits in the sole match arm's body on body line 6",
    ).toEqual(range(6, 29, 6, 30));
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("g", 0, "s", "string", "integer"),
      argument,
      "u12pb — an arm scope adds the arm's OWN binders and hides nothing else, so an unshadowed outer record keeps its proof",
    );
  });

  it("u12pc: an ANNOTATED parameter's record still wins over a same-named outer binding", () => {
    // The recorded-binder differentiator F1's own `Required:` names. The outer
    // `let p = "a"` is a proven `string` and `h`'s parameter is annotated
    // `integer`, so the two disagree and the emission's `got integer` shows
    // WHICH one the check read. The runtime call `h(3)` binds the parameter to
    // the integer `3`, so the annotation is the truthful one. Resolve the body's
    // `p` to the outer record instead and the argument reads `string`, which
    // `s: string` accepts — no emission, and this cell reds. Mark annotated
    // parameters unprovable as well and it reds too.
    const doc = parse(U12PC_ANNOTATED_PARAM_SHADOW);
    const argument = argRange(doc, "g", 0);
    expect(
      argument,
      "PRECONDITION: the argument `p` sits inside `h`'s body on body line 6",
    ).toEqual(range(6, 30, 6, 31));
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("g", 0, "s", "string", "integer"),
      argument,
      "u12pc — an annotated parameter IS a judged record (`walkFn`'s own `fnScope.set`), so it stays a proof and it outranks the outer binding it shadows",
    );
  });

  it("u12pd: an UNANNOTATED sibling parameter does not withhold the whole body", () => {
    // The withholding must be per-NAME, not per-body: `h` carries an annotated
    // `p: integer` beside an unannotated `q`, and the emission is about `p`.
    // The runtime call `h(3, 4)` binds `p` to the integer `3`. Withhold
    // everything inside a body that has any unannotated parameter and this cell
    // reds. `h`'s own call site stays clean on the `q` argument through the
    // unannotated-parameter deferral cell d1 pins.
    const doc = parse(U12PD_ANNOTATED_BESIDE_UNANNOTATED);
    const argument = argRange(doc, "g", 0);
    expect(
      argument,
      "PRECONDITION: the argument `p` sits inside `h`'s body on body line 5",
    ).toEqual(range(5, 33, 5, 34));
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("g", 0, "s", "string", "integer"),
      argument,
      "u12pd — the record is per binder name, so an unannotated parameter withholds itself and nothing else",
    );
  });

  it("u12pe: a `par for` variable's ELEMENT record still wins over a same-named outer binding", () => {
    // The second recorded-binder differentiator, over the arm this fix does not
    // touch (src/parser/type-layer-checks.ts:2099). The outer `let x = "a"` is a
    // proven `string`; the iterand `[3]` is a proven `array<integer>`, so the
    // recorded element type is `integer` and the runtime hands `g` the integer
    // `3`. Resolve the body's `x` to the outer record and the argument reads
    // `string`, which `s: string` accepts — no emission, and this cell reds.
    const doc = parse(U12PE_PAR_FOR_SHADOW);
    const argument = argRange(doc, "g", 0);
    expect(
      argument,
      "PRECONDITION: the argument `x` sits inside the `par for` body on body line 6",
    ).toEqual(range(6, 31, 6, 32));
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("g", 0, "s", "string", "integer"),
      argument,
      "u12pe — a recorded element type is a proof and outranks the outer binding the loop variable shadows; the u12 withholding must leave it intact",
    );
  });
});

// ===========================================================================
// u13 — the WITHHELD binder entry as the SIBLING rows read it.
//
// The u12 group binds each unjudgeable binder in the inner scope so a shadowed
// read stops there instead of resolving to the outer record. Every other row of
// this walk reads that entry too, because they all read types out of the same
// map: the typed-`let` RHS, the object-field value, the array-element sink, the
// `for` / `par for` iterand, the `subagent fn` return annotation, the `+` and
// ordering operands, the method receiver, the index receiver, the `if` /
// `while` condition, the `match`-arm common type. What the entry IS therefore
// decides what those rows say, and two properties are needed of it.
//
// (1) IT MUST NOT BE JUDGEABLE NOMINALLY. An entry minted from the binder's own
// spelling resolves through `resolveNamed` wherever an author declared a schema
// of that name, and TYPE-10 judges the read against a declaration the value
// never touches. Measured over this fixture set, one route per row: a let-rhs
// `expected integer, got P`, an object-field `expected string, got P`, a
// `mixed-plus-operands` `P and integer`, a `non-orderable-operands`, an
// `unknown-method 'frobnicate' on type P`, a `non-string-object-index`, a
// `match-arm-type-mismatch`. So the entry carries a SENTINEL name
// (`WITHHELD_BINDER_TYPE_NAME`, src/parser/type-layer-checks.ts:388) that no
// `.theta` text can declare: a `TypeEnv` key is exactly one token's text
// (`parseSchema` takes the declaration name with a single `advance().text`,
// src/parser/theta-document.ts:2355, and `collectTypeEnv` keys the env by it,
// src/parser/type-layer-checks.ts:346, :351), and no token text equals a
// ten-character run that starts with `<` — an `ident` / `keyword` is
// `[A-Za-z_][A-Za-z0-9_]*` (src/lexer/lexer.ts:666–682), a `punct` is one
// character or a two-character operator from a fixed table (:704–714), a
// `number` is digits and `.`, a `string`'s text is the RAW source slice and so
// begins with its own quote (:544–549), `stmt-sep` is `\n`
// and `eof` is empty. A casing
// convention would not do the same work: lexical.md:16 scopes lowercase-first
// to `let` / `let mut`, parameters, `fn` names and schema field names, so a
// `for` / `par for` variable and a `match` binder are outside it — the two
// binder classes a first-letter convention could never flag. A `fn`
// parameter's uppercase spelling is bug 0139's `binding-case-mismatch`, a
// parse error on the token itself and not a gap this sentinel must cover.
//
// (2) A ROW WHOSE VERDICT RESTS ON THE WITHHELD PART MUST NOT REPORT. Two
// mechanisms defeat an unresolvable name's ordinary deferral:
//   - `checkForIterand` (src/parser/control-flow.ts:64–81) rejects EVERY
//     non-`array<T>` iterand, resolvable or not, so there an unresolvable name
//     is a rejection rather than a deferral (measured: the SR4 route emits with
//     no `schema P` declared at all);
//   - `decide` answers `named ⊑ array<…>` and `named ⊑ { … }` STRUCTURALLY,
//     before it tests whether the name resolves (TYPE-7 / TYPE-8,
//     src/parser/type-compat.ts:210–248, precede the `resolveNamed` arms at
//     :249–268), so an array- or
//     inline-object-typed sink judges a withheld read incompatible, and TYPE-7
//     recursion carries that into a composite BUILT from a withheld read
//     (`[x]` against `array<array<integer>>` rests entirely on `x`).
// The walk therefore withholds the verdict at those sinks
// (`containsWithheldBinderType`, src/parser/type-layer-checks.ts:410–424) —
// the discipline the fn-arg row already applies through `provableArgType`'s
// identity channel, at the four relation sinks and the two iterand sites that
// read the map raw. The rows left alone defer by construction: their verdict on
// a bare withheld read is `"unknown"` (`classifyOperand`, `classifyReceiver`,
// `classifyIndexReceiver`, `checkBooleanPosition`, `leastUpperBound`), and on a
// COMPOSITE their verdict rests on its outer kind, which the withheld part
// never determines.
//
// EVERY MOVEMENT IS IN THE DEFERRAL DIRECTION. A withheld entry can only remove
// a sibling row's emission, never add one: nominal resolution is gone and the
// six gated sinks report nothing on it. Cells u13–u13d pin the four shadowing
// routes; u13mb and u13mc pin the MISS class at the two sinks a `match`-arm
// binder reaches, where the entry is withheld and the sink withholds with it —
// a permissive-direction disposition (GOV-15 admits it: a program that loaded
// keeps loading) that is decided here rather than left implicit. u13m, u13md,
// u13me, u13mf and u13mg read a plain `for` variable, which carries the
// iterand's PROVEN element under bug 0126
// (docs/bugs/0126-plain-for-binds-no-loop-variable.md), so their sinks judge
// that element for real: it satisfies the annotation at u13m, the iterand
// contract at u13md, the `join` precondition at u13mf and the index-key
// precondition at u13mg, and it disagrees with the structural annotation at
// u13me — the loop variable holds the integer `3`, which is no `array<integer>`
// — so u13me fires; see that cell's own comment.
//
// WHICH CELLS CARRY THE WITHHELD SUBJECT, and which rest on a proven element:
// u13r (the composite render), u13mh and u13mm (the `array.join` element, over
// an unannotated parameter and over a `match`-arm binder), u13mi (the
// typed-`let` RHS), u13mj (the `subagent fn` return annotation), u13mk (the
// array-element common type) and u13ml (the object-field value) read a
// `match`-arm binder or an unannotated `fn` parameter, the classes bug 0126
// leaves withheld, and each puts that read INSIDE a composite the sink judges
// structurally, so those are the sinks where the group's own subject is
// measured. u13d and u13mc (the `par for` iterand) read the SAME withheld
// classes as the WHOLE operand, not inside a composite: `checkForIterand`
// refuses every unresolvable iterand outright, the same blanket refusal
// u13mf and u13mg draw, so the withheld subject is what the row refuses
// rather than what a structural check judges. u13e is neither: the arm body
// IS the bare binder, so bug 0199's identity-marking channel is what turns
// the withheld read back into a real verdict, not a structural judgement of
// a composite. u13c and u13mb sit at the object-field value sink too, but
// they route the read as the WHOLE field value, where the emitter answers on
// the operand's own unresolvability and the gate decides nothing — u13ml is
// that sink's measured cell, and u13c / u13mb keep their own subject, that
// the row defers on an unresolvable value type;
// u13, u13b, u13m, u13md, u13mf and u13mg read a plain `for` variable and rest
// on its proven element, where what they discriminate is the sink's channel —
// the RECORDED element type, never the binder's spelling — which is the same
// soundness property one mechanism further in.
//
// WHAT STILL RENDERS THE SENTINEL (cell u13r): a composite BUILT from a
// withheld read, at a row whose verdict its outer kind decides — `if [x]` is
// not boolean whatever `x` is, so `non-boolean-condition` fires and renders
// `array<<withheld>>`. Bug 0126 binds a `for`-fed `x` to its iterand's element
// type instead of the sentinel, so u13r's own binder is an UNANNOTATED `fn`
// parameter — a class bug 0126 does not touch — rather than a `for` variable;
// the code and the range are unmoved, and the rendering is what a `for`-fed
// composite gives up. Withholding it as well would drop a true emission,
// which is why the gate stops at the sinks whose verdict the withheld part can
// flip.
// ===========================================================================

describe("bug 0050 — a WITHHELD binder entry is not judgeable by the sibling rows either", () => {
  it("u13: a `for` binder shadowing a `par for` binder of the same declared-schema spelling draws nothing", () => {
    // The route with no `fn` call anywhere: the sink is a typed `let` inside a
    // `for` body inside a `par for` body, and the outer record it hides is the
    // par-for arm's own ELEMENT record (a proven `integer`). Every execution
    // binds the inner `P` to the integer `5`
    // (`env.bindIterationVariable`, src/runtime/statement-executor.ts:1716;
    // control-flow.md:13 — "a fresh immutable local per iteration"), and bug
    // 0126 (docs/bugs/0126-plain-for-binds-no-loop-variable.md) records that
    // element in the body scope, so the sink judges `[5]`'s proven `integer`
    // against `s: integer` and accepts it. What the cell discriminates is the
    // channel the sink reads: a RECORD keyed on the innermost binder, so no
    // `TypeEnv` lookup of the spelling `P` happens and the declared `schema P`
    // cannot supply an `expected integer, got P` the position never carries.
    const doc = parse(U13_PAR_FOR_NESTED_SHADOW);
    expect(
      letRange(doc, "s"),
      "PRECONDITION: the typed `let s` sink sits inside the inner `for` body on body line 5; a drifted layout must fail here rather than let the empty diagnostic list below measure nothing",
    ).toEqual(range(5, 44, 5, 62));
    expect(
      doc.diagnostics,
      `u13 — the sink judges the innermost binder's recorded element type, never a declaration that shares the binder's spelling. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });

  it("u13b: a `for` binder shadowing an ANNOTATED parameter is judged on its own element record, and the parameter's own case still draws", () => {
    // The parameter class. `walkFn` records the annotated `P: string`, and the
    // loop variable hides it; the runtime binds the element `"ok"` in the body,
    // and bug 0126 (docs/bugs/0126-plain-for-binds-no-loop-variable.md) records
    // that element, so `s: string` is judged against `["ok"]`'s proven `string`
    // and accepts it in every iteration. The cell discriminates which record
    // reaches the sink — the innermost binder's — so neither the parameter it
    // hides nor the declared `schema P` its spelling names is consulted there.
    // `h`'s own parameter `P` is an uppercase binding name, so bug 0139's
    // `binding-case-mismatch` fires on it — a lexical check on the token,
    // independent of the type-layer read this cell pins.
    const doc = parse(U13_FOR_IN_PARAM_SHADOW);
    expect(
      letRange(doc, "s"),
      "PRECONDITION: the typed `let s` sink sits inside the `for` body in `h`'s body on body line 5",
    ).toEqual(range(5, 45, 5, 62));
    expect(
      doc.diagnostics,
      `u13b — the loop variable's own element record is what the sink judges; the parameter's own spelling draws the lexical case code alone. Diagnostics: ${render(doc)}`,
    ).toEqual([
      {
        severity: "error",
        code: BINDING_CASE_CODE,
        file: FILE,
        range: range(5, 6, 5, 7),
        message: registered(BINDING_CASE_CODE),
      },
    ]);
  });

  it("u13c: a `match` binder read at an OBJECT-FIELD sink draws no type verdict, and the shadowed parameter's own case does, alongside the arm head's own refusal", () => {
    // The object-field row (bug 0031's sink) over an arm binder shadowing the
    // annotated parameter. `matchPattern` binds an identifier pattern to the
    // scrutinee unconditionally (src/runtime/match-result.ts:177–179), so the
    // field value is the string `"hi"` and `b: string` accepts it. `h`'s own
    // parameter `P` is the shadowed binder, and its uppercase spelling draws
    // bug 0139's `binding-case-mismatch` — a lexical check on the parameter
    // token, independent of the arm binder this cell's type-layer pin is
    // about. Bug 0141 additionally refuses the arm's own capitalised pattern
    // head (docs/spec_topics/expressions.md's disambiguation sentence), a
    // SECOND, parse-time diagnostic on the same fixture; the withheld-binder
    // premise this cell exists to test is unchanged — the arm still binds and
    // the object-field row still has no operand to judge.
    const doc = parse(U13_ARM_OBJECT_FIELD_SHADOW);
    expect(
      letRange(doc, "m"),
      "PRECONDITION: the `match` whose arm body constructs `Q` sits in `h`'s body on body line 6",
    ).toEqual(range(6, 27, 6, 65));
    expect(
      doc.diagnostics,
      `u13c — the object-field row reads the arm binder's withheld entry and has no operand to judge; the parameter's own spelling draws the lexical case code, and the arm head's own spelling draws the pattern-head refusal, in that source-position order. Diagnostics: ${render(doc)}`,
    ).toEqual([
      {
        severity: "error",
        code: BINDING_CASE_CODE,
        file: FILE,
        range: range(6, 6, 6, 7),
        message: registered(BINDING_CASE_CODE),
      },
      {
        severity: "error",
        code: CAP_PATTERN_HEAD_CODE,
        file: FILE,
        range: range(6, 48, 6, 49),
        message: capitalisedPatternHeadMessage("P"),
      },
    ]);
  });

  it("u13d: a `match` binder read as a `par for` ITERAND draws no type verdict, and the shadowed parameter's own case does, alongside the arm head's own refusal", () => {
    // The iterand row, and the route that is not about the spelling at all:
    // `checkForIterand` rejects every non-array iterand, so this fixture emits
    // with no `schema P` declared as well. What the withhold gate supplies is
    // the deferral the row cannot reach by itself. `h`'s own parameter `P` is
    // the shadowed binder, and its uppercase spelling draws bug 0139's
    // `binding-case-mismatch` on the parameter token, independent of the
    // iterand read this cell's type-layer pin is about. Bug 0141 additionally
    // refuses the arm's own capitalised pattern head, a SECOND, parse-time
    // diagnostic; the withheld-binder premise this cell exists to test is
    // unchanged — the arm still binds and the iterand row still defers.
    const doc = parse(U13_ARM_ITERAND_SHADOW);
    expect(
      letRange(doc, "m"),
      "PRECONDITION: the `match` whose arm body is a `par for` sits in `h`'s body on body line 5",
    ).toEqual(range(5, 35, 5, 83));
    expect(
      doc.diagnostics,
      `u13d — an iterand read out of a withheld binder entry supports no verdict and the row defers; the parameter's own spelling draws the lexical case code, and the arm head's own spelling draws the pattern-head refusal, in that source-position order. Diagnostics: ${render(doc)}`,
    ).toEqual([
      {
        severity: "error",
        code: BINDING_CASE_CODE,
        file: FILE,
        range: range(5, 6, 5, 7),
        message: registered(BINDING_CASE_CODE),
      },
      {
        severity: "error",
        code: CAP_PATTERN_HEAD_CODE,
        file: FILE,
        range: range(5, 56, 5, 57),
        message: capitalisedPatternHeadMessage("P"),
      },
    ]);
  });

  it("u13m: the MISS class at the typed-`let` sink is judged on the recorded element", () => {
    // The same sink with nothing shadowed, so only the record stands between it
    // and `#typeExpr`'s `ident` fallback, which mints `named P` from the loop
    // variable's own spelling and lets the declared `schema P` be judged
    // against `integer`. Bug 0126 (docs/bugs/0126-plain-for-binds-no-loop-variable.md)
    // records `[5]`'s proven `integer` for the variable, so the annotation is
    // judged against the element every iteration binds and accepts it. The cell
    // discriminates the record from the spelling at the one sink where the
    // collision is reachable in legal source: lexical.md:16 scopes the
    // lowercase-first rule away from a `for` variable, so a schema-cased one
    // draws no case code to warn on it.
    const doc = parse(U13M_FOR_MISS);
    expect(
      letRange(doc, "s"),
      "PRECONDITION: the typed `let s` sink sits inside the `for` body on body line 5",
    ).toEqual(range(5, 16, 5, 34));
    expect(
      doc.diagnostics,
      `u13m — a name minted from a binder's spelling is not a type; the recorded element that replaces it is what the annotation is judged against. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });

  it("u13mb: the MISS class at the object-field sink defers, and the arm head's own spelling draws bug 0141's refusal", () => {
    // Same flip, one sink over: the arm binder `P` shadows nothing, so at this
    // HEAD the field value read `named P` and drew `expected string, got P`
    // while the runtime hands the field the scrutinee `"hi"`. Bug 0141 refuses
    // the bare capitalised head itself (docs/spec_topics/expressions.md's
    // disambiguation sentence), a parse-time diagnostic that names exactly
    // what changed; the object-field row's deferral on the withheld entry is
    // unchanged.
    const doc = parse(U13MB_ARM_FIELD_MISS);
    expect(
      letRange(doc, "m"),
      "PRECONDITION: the `match` whose arm body constructs `Q` sits on body line 6",
    ).toEqual(range(6, 1, 6, 39));
    expect(
      doc.diagnostics,
      `u13mb — the object-field row defers on the withheld entry exactly as it defers on any unresolvable value type; the arm head's own spelling draws the pattern-head refusal. Diagnostics: ${render(doc)}`,
    ).toEqual([
      {
        severity: "error",
        code: CAP_PATTERN_HEAD_CODE,
        file: FILE,
        range: range(6, 22, 6, 23),
        message: capitalisedPatternHeadMessage("P"),
      },
    ]);
  });

  it("u13mc: the MISS class at the `par for` iterand defers, with NO declaration in the file, and the arm head's own spelling draws bug 0141's refusal", () => {
    // The iterand row's own flip, and the cell that shows it is not a spelling
    // question: this fixture declares no schema, so the minted `named P` was
    // unresolvable at this HEAD and the row rejected it anyway. The runtime
    // binds `P` to the scrutinee `"hi"`, so an iteration of a string is what a
    // sound row would report — a judgement this layer cannot make from the
    // arm's text, hence the deferral.
    const doc = parse(U13MC_ARM_ITERAND_MISS);
    expect(
      letRange(doc, "m"),
      "PRECONDITION: the `match` whose arm body is a `par for` sits on body line 4",
    ).toEqual(range(4, 1, 4, 49));
    // Bug 0141 refuses the bare capitalised arm head itself, a parse-time
    // diagnostic that names exactly what changed; the iterand row's own
    // deferral on the withheld entry, this cell's original subject, is
    // unchanged.
    expect(
      doc.diagnostics,
      `u13mc — the iterand row's rejection of an unresolvable name is not a verdict about a withheld binder; the arm head's own spelling draws the pattern-head refusal. Diagnostics: ${render(doc)}`,
    ).toEqual([
      {
        severity: "error",
        code: CAP_PATTERN_HEAD_CODE,
        file: FILE,
        range: range(4, 22, 4, 23),
        message: capitalisedPatternHeadMessage("P"),
      },
    ]);
  });

  it("u13md: a `for` iterand read out of an enclosing `for` variable is admitted", () => {
    // The plain-`for` call site of the same row, over a lowercase binder: the
    // outer loop variable holds the element `[1]`, so the inner `for i in x`
    // iterates an array and the fixture is well typed. Bug 0126
    // (docs/bugs/0126-plain-for-binds-no-loop-variable.md) records that element
    // — a proven `array<integer>` — so the gate reads a real array and admits
    // the nesting control-flow.md:13 licenses. This is the sink where the
    // difference between a record and a minted spelling is a load failure
    // rather than a silence: `checkForIterand` refuses `named x` like every
    // other non-array.
    const doc = parse(U13MD_NESTED_FOR_ITERAND);
    expect(
      letRange(doc, "r"),
      "PRECONDITION: the inner `for` body's `let r` sits on body line 4",
    ).toEqual(range(4, 31, 4, 40));
    expect(
      doc.diagnostics,
      `u13md — both iterand call sites judge the type the map records: a proven element is admitted, and only a withheld entry withholds the verdict. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });

  it("u13me: a STRUCTURAL sink over a PROVEN element fires, under bug 0126", () => {
    // The structural short-circuit: `decide` answers `named ⊑ array<integer>`
    // incompatible without consulting `resolveNamed`, so a withheld sentinel
    // alone would not have silenced this sink either — the loop variable holds
    // the integer `3`, which is no `array<integer>`. Bug 0126
    // (docs/bugs/0126-plain-for-binds-no-loop-variable.md) settles that the
    // plain `for` arm records a PROVEN iterand's element the same way `par
    // for` does, so `x` carries a genuine `integer` proof here and the
    // structural sink judges it for real — the u12e species, fired rather
    // than withheld.
    //
    // Cells u9 and u12e are the two cells this same report re-adjudicates
    // alongside this one.
    const doc = parse(U13ME_STRUCTURAL_SUP);
    const site = letRange(doc, "s");
    expect(
      site,
      "PRECONDITION: the typed `let s` sink sits inside the `for` body on body line 4",
    ).toEqual(range(4, 16, 4, 41));
    expect(
      locatedHits(doc, LET_RHS_CODE),
      `u13me — bug 0126 binds the plain \`for\` variable to the iterand's element type, so a structural sink over a genuinely proven element fires for real. Diagnostics: ${render(doc)}`,
    ).toEqual([`error ${letRhsMessage("s", "array<integer>", "integer")} @${at(site)}`]);
    // The located pin above is scoped to one code, so it cannot see a SECOND
    // emission arriving on this fixture from anywhere else. `render` is the
    // whole ordered list in the same `severity code @range: message` shape, so
    // this line is the ordered whole-list contract the located pin narrows.
    expect(
      render(doc),
      "u13me — the fired mismatch is this fixture's WHOLE diagnostic list; a second emission from another gate is a widening this cell must red on",
    ).toBe(
      JSON.stringify([
        `error ${LET_RHS_CODE} @${at(site)}: ${letRhsMessage("s", "array<integer>", "integer")}`,
      ]),
    );
  });

  it("u13mf: the `array.join` element precondition over a PROVEN element is met", () => {
    // The third row of the refuse-an-unresolvable-type family (`checkArrayJoin`,
    // src/runtime/stdlib-array.ts:100–124, which admits a `string` element and
    // nothing else): the receiver is an array BUILT from the loop variable's
    // read, so the precondition rests entirely on what that read carries. Bug
    // 0126 (docs/bugs/0126-plain-for-binds-no-loop-variable.md) records
    // `["a"]`'s proven `string`, so `[x]` is an `array<string>` and the
    // precondition is met over the same string the runtime element holds. The
    // sink refuses every unresolvable element instead of deferring on one, so
    // it is where a minted `named x` is a false refusal (`got array<x>`) rather
    // than a silence — u13pg is the twin where the proven element is an
    // `integer` and the refusal is genuine.
    const doc = parse(U13MF_JOIN_FOR_ELEMENT);
    expect(
      letRange(doc, "s"),
      "PRECONDITION: the `join` call sits in the `let s` initialiser inside the `for` body on body line 4",
    ).toEqual(range(4, 18, 4, 39));
    expect(
      doc.diagnostics,
      `u13mf — the recorded element type is what the stdlib precondition reads, and a proven \`string\` element meets it. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });

  it("u13mg: the object-index key check over a PROVEN key is satisfied", () => {
    // The fourth: `checkObjectIndex` (src/runtime/stdlib-object.ts) admits a
    // `string` key and refuses everything else, an unresolvable name included.
    // Bug 0126 (docs/bugs/0126-plain-for-binds-no-loop-variable.md) records
    // `["b"]`'s proven `string` for the key read, so the check has a real
    // `string` to admit and the access stands over the same key the runtime
    // supplies. As at u13mf, the discrimination is the record against a minted
    // `named x` this sink would refuse (`got x`); u13ph is the twin where the
    // proven key is an `integer` and the refusal is genuine.
    const doc = parse(U13MG_OBJECT_INDEX_FOR_KEY);
    expect(
      letRange(doc, "v"),
      "PRECONDITION: the indexed access sits in the `let v` initialiser inside the `for` body on body line 6",
    ).toEqual(range(6, 18, 6, 30));
    expect(
      doc.diagnostics,
      `u13mg — the key's recorded type is what the check reads, and a proven \`string\` key is admitted. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });

  it("u13mh: the `array.join` element precondition over a WITHHELD element draws nothing", () => {
    // The join sink's withheld-fed cell. The receiver is an array BUILT from the
    // read, so `checkMethodCall`'s `join` branch IS entered
    // (`e.method === "join" && unfoldedTarget.kind === "array"`,
    // src/parser/type-layer-checks.ts:2792) and the element carries the
    // sentinel. `checkArrayJoin` (src/runtime/stdlib-array.ts:100) admits a
    // `string` element and refuses every other one, an unresolvable name
    // included, so it cannot defer on this element by itself: the explicit
    // withhold in front of it (:2779) is what keeps this list empty, and the
    // runtime element is whatever the caller passes — possibly the `string` the
    // method requires. Cell u13pg is the same position over a proven `integer`
    // element and reports, so the silence here is a withhold and not an
    // unreached check.
    const doc = parse(U13MH_JOIN_WITHHELD_ELEMENT);
    expect(
      letRange(doc, "s"),
      "PRECONDITION: the `join` call sits in the `let s` initialiser inside `h`'s body on body line 4; a drifted layout must fail here rather than let the empty diagnostic list below measure nothing",
    ).toEqual(range(4, 11, 4, 32));
    expect(
      doc.diagnostics,
      `u13mh — an element read out of a withheld binder supports no verdict at a precondition that refuses every unresolvable element. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });

  it("u13mi: a PRIMITIVE-annotated `let` over a RHS built from a WITHHELD read draws nothing", () => {
    // The typed-`let` sink's withheld-fed cell. `decide` answers a primitive
    // annotation against an `array` RHS structurally under TYPE-7 / TYPE-8,
    // before either `resolveNamed` arm runs, so the deferral an unresolvable
    // name earns elsewhere is unavailable here and the withheld part is the
    // whole basis of the answer. The explicit gate
    // (`annotation !== undefined && !containsWithheldBinderType(rhsType)`,
    // src/parser/type-layer-checks.ts:1189) is therefore what keeps this list
    // empty; the declared type is still recorded below it, so nothing
    // downstream loses the author's own claim about the position. Cell u13p is
    // the same sink over a non-withheld operand pair and reports, so the
    // silence here is a withhold and not an unreached check.
    const doc = parse(U13MI_LET_ANNOT_WITHHELD_ELEMENT);
    expect(
      letRange(doc, "s"),
      "PRECONDITION: the annotated `let s` sink sits inside `h`'s body on body line 4; a drifted layout must fail here rather than let the empty diagnostic list below measure nothing",
    ).toEqual(range(4, 11, 4, 31));
    expect(
      doc.diagnostics,
      `u13mi — a structurally decided annotation over a composite whose element is withheld supports no verdict. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });

  it("u13mj: a `subagent fn` return annotation over a payload built from a WITHHELD read draws nothing", () => {
    // The return-annotation sink's withheld-fed cell.
    // `checkSubagentReturnAnnotation` runs FN-3 payload inference first, so the
    // payload IS reached and it carries the sentinel inside an `array` outer
    // kind. `checkInvokeReturnType` then decides the declared `integer` against
    // that outer kind structurally, before any `resolveNamed` arm, so the
    // sentinel's unresolvability cannot defer this row on its own: the gate in
    // `checkSubagentReturnAnnotation` is what keeps this list empty, and the
    // runtime payload is whatever the caller passes. Cell u13pf is the same
    // position over an annotated parameter and reports, so the silence here is
    // a withhold and not an unreached check.
    const doc = parse(U13MJ_SUBAGENT_RETURN_WITHHELD_ELEMENT);
    expect(
      letRange(doc, "r"),
      "PRECONDITION: the call of `h` binds `let r` on body line 5; a drifted layout must fail here rather than let the empty diagnostic list below measure nothing",
    ).toEqual(range(5, 1, 5, 13));
    expect(
      doc.diagnostics,
      `u13mj — a boundary payload built from a withheld read supports no verdict at an annotation decided by its outer kind. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });

  it("u13mk: an array-element sink over a branch built from a WITHHELD read draws nothing", () => {
    // The array-element sink's withheld-fed cell, reached through a schema
    // constructor rather than a typed `let`: `checkObjectField`'s declared
    // `array<T>` element sink sits OUTSIDE that method's own gate, whereas the
    // `let` route's element sink sits INSIDE the typed-`let` gate, so
    // `let a: array<integer> = [[x]]` would measure u13mi's gate instead. The
    // branch `[x]` is an `array` BUILT from the read, and `checkCommonType`'s
    // in-scope-sink arm tests each branch against the declared `integer`
    // element through the structural relation, which cannot defer on an
    // unresolvable name, so the gate in `checkArrayLiteral` is what keeps this
    // list empty. Cell u13pe is the same sink over a proven `string` element
    // and reports, so the silence here is a withhold and not an unreached
    // check.
    const doc = parse(U13MK_SCHEMA_ARRAY_FIELD_WITHHELD_ELEMENT);
    expect(
      letRange(doc, "m"),
      "PRECONDITION: the `Q { b: [[x]] }` constructor sits in the `let m` initialiser inside `h`'s body on body line 5; a drifted layout must fail here rather than let the empty diagnostic list below measure nothing",
    ).toEqual(range(5, 11, 5, 33));
    expect(
      doc.diagnostics,
      `u13mk — a branch whose element is withheld supports no verdict at an element sink that reports the first failing branch by index. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });

  it("u13ml: an object-field value built from a WITHHELD read draws nothing", () => {
    // The object-field sink's withheld-fed cell. The read is a PART of the
    // field value's type — `[x]` is an `array` whose element carries the
    // sentinel — so `checkObjectFieldCompat` has a structure to judge and
    // decides the declared `string` against an `array` outer kind before any
    // `resolveNamed` arm: the gate in `checkObjectField` is what keeps this
    // list empty. That is what separates this cell from u13c and u13mb, whose
    // whole-operand shape the emitter defers on by itself. Cell u13pd is the
    // same sink over a proven `integer` value and reports, so the silence here
    // is a withhold and not an unreached check.
    const doc = parse(U13ML_OBJECT_FIELD_WITHHELD_ELEMENT);
    expect(
      letRange(doc, "m"),
      "PRECONDITION: the `Q { b: [x] }` constructor sits in the `let m` initialiser inside `h`'s body on body line 5; a drifted layout must fail here rather than let the empty diagnostic list below measure nothing",
    ).toEqual(range(5, 11, 5, 31));
    expect(
      doc.diagnostics,
      `u13ml — a field value whose element is withheld supports no verdict at a row decided by the value's outer kind. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });

  it("u13mm: the `array.join` element precondition over a `match`-BINDER element draws nothing", () => {
    // The join sink's second binder class. u13mh feeds it an unannotated `fn`
    // parameter; here the read is a `match` pattern binder, the other class
    // `recordWithheldBinders` mints, and the arm body is the `join` call itself.
    // The receiver is an array BUILT from the read, so `checkMethodCall`'s
    // `join` branch IS entered and the element carries the sentinel;
    // `checkArrayJoin` admits a `string` element and refuses every other one,
    // an unresolvable name included, so it cannot defer on this element by
    // itself and the gate in that branch is what keeps this list empty. Cell
    // u13pg is the same position over a proven `integer` element and reports,
    // so the silence here is a withhold and not an unreached check.
    const doc = parse(U13MM_JOIN_MATCH_BINDER_ELEMENT);
    expect(
      letRange(doc, "m"),
      "PRECONDITION: the `match` whose arm body is the `join` call binds `let m` on body line 4; a drifted layout must fail here rather than let the empty diagnostic list below measure nothing",
    ).toEqual(range(4, 1, 4, 42));
    expect(
      doc.diagnostics,
      `u13mm — a \`match\`-arm binder read is withheld at the join precondition exactly as an unannotated parameter's is. Diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });

  it("u13p: a typed `let` inside a `for` body still reports its own mismatch", () => {
    // The first differentiator: the RHS is the literal `3` and the annotation is
    // the declared `schema P`, neither of them a withheld read, so the row's
    // verdict stands inside a withheld scope. A gate keyed on the SCOPE rather
    // than on the READ reds here.
    const doc = parse(U13P_LET_ANNOT_IN_FOR);
    const site = letRange(doc, "v");
    expect(site, "PRECONDITION: the typed `let v` sink sits inside the `for` body on body line 5").toEqual(
      range(5, 16, 5, 28),
    );
    expect(
      locatedHits(doc, LET_RHS_CODE),
      `u13p — only a read of a withheld binder withholds a verdict; every other operand is judged as before. Diagnostics: ${render(doc)}`,
    ).toEqual([`error ${letRhsMessage("v", "P", "integer")} @${at(site)}`]);
  });

  it("u13pb: a `for` iterand read out of a PROVEN outer binding still reports", () => {
    // The iterand row's plain-`for` differentiator: `s` is a proven `string`
    // recorded by an unshadowed outer `let`, and the enclosing `for q` body
    // hides nothing, so the row keeps rejecting a string iterand.
    const doc = parse(U13PB_FOR_ITERAND_STRING);
    expect(
      letRange(doc, "r"),
      "PRECONDITION: the inner `for` body's `let r` sits on body line 5",
    ).toEqual(range(5, 29, 5, 38));
    expect(
      locatedHits(doc, NON_ARRAY_ITERAND_CODE),
      `u13pb — the iterand gate keys on the withheld entry, not on the construct. Diagnostics: ${render(doc)}`,
    ).toEqual([`error ${nonArrayIterandMessage("string")} @${at(range(5, 25, 5, 26))}`]);
  });

  it("u13pc: a `par for` iterand read out of a PROVEN outer binding still reports", () => {
    // The same differentiator at the second call site of the row.
    const doc = parse(U13PC_PAR_FOR_ITERAND_STRING);
    expect(
      letRange(doc, "ys"),
      "PRECONDITION: the `par for` sits in the `let ys` initialiser on body line 5",
    ).toEqual(range(5, 16, 5, 45));
    expect(
      locatedHits(doc, NON_ARRAY_ITERAND_CODE),
      `u13pc — the \`par for\` iterand gate is the same one-line test and covers the same class. Diagnostics: ${render(doc)}`,
    ).toEqual([`error ${nonArrayIterandMessage("string")} @${at(range(5, 38, 5, 39))}`]);
  });

  it("u13pd: an object-field value inside a `for` body still reports its own mismatch", () => {
    // The object-field sink's differentiator: the field value is the literal
    // `3` against a declared `b: string`.
    const doc = parse(U13PD_OBJECT_FIELD_IN_FOR);
    expect(
      letRange(doc, "m"),
      "PRECONDITION: the `Q { b: 3 }` constructor sits inside the `for` body on body line 5",
    ).toEqual(range(5, 16, 5, 34));
    expect(
      locatedHits(doc, OBJECT_FIELD_CODE),
      `u13pd — the object-field gate keys on the value's own type. Diagnostics: ${render(doc)}`,
    ).toEqual([
      `error ${objectFieldMessage("b", "Q", "string", "integer")} @${at(range(5, 31, 5, 32))}`,
    ]);
  });

  it("u13pe: an array-element sink inside a `for` body still reports its own mismatch", () => {
    // The array-element differentiator (`checkCommonType` with a sink): the
    // element is the literal `"s"` against the annotation's `integer` element.
    // The typed-`let` row reports the same fixture from its own operand pair
    // (`array<string>` against `array<integer>`), which the assertion below
    // leaves alone by naming the array-element code.
    const doc = parse(U13PE_ARRAY_ELEMENT_IN_FOR);
    expect(
      letRange(doc, "a"),
      "PRECONDITION: the typed `let a` sink sits inside the `for` body on body line 4",
    ).toEqual(range(4, 16, 4, 45));
    expect(
      locatedHits(doc, ARRAY_ELEMENT_CODE),
      `u13pe — the branch gate keys on each branch's own type. Diagnostics: ${render(doc)}`,
    ).toEqual([
      `error ${arrayElementMessage(0, "integer", "string")} @${at(range(4, 40, 4, 45))}`,
    ]);
  });

  it("u13pf: a `subagent fn` return annotation over an ANNOTATED parameter still reports", () => {
    // The return-annotation sink's differentiator (`checkInvokeReturnType`, the
    // FN-6 boundary payload check): `q: string` is annotated, so the body's
    // return contribution is a judged `string` and the declared
    // `array<integer>` genuinely refuses it. Withhold this sink whenever the
    // body holds any unannotated parameter and this cell reds.
    const doc = parse(U13PF_SUBAGENT_RETURN_ANNOTATED);
    expect(
      letRange(doc, "r"),
      "PRECONDITION: the call of `h` sits on body line 5",
    ).toEqual(range(5, 1, 5, 15));
    expect(
      locatedHits(doc, INVOKE_RETURN_CODE),
      `u13pf — the payload gate keys on the inferred payload's own type. Diagnostics: ${render(doc)}`,
    ).toEqual([`error ${invokeReturnMessage("h", "string")} @${at(range(4, 10, 4, 54))}`]);
  });

  it("u13pg: the `array.join` precondition over a PROVEN element still reports", () => {
    // The join row's differentiator: the element is the outer `let x = 1`, an
    // unshadowed proven `integer`, so the precondition keeps refusing it.
    const doc = parse(U13PG_JOIN_PROVEN_ELEMENT);
    expect(
      letRange(doc, "s"),
      "PRECONDITION: the `join` call sits in the `let s` initialiser inside the `for` body on body line 5",
    ).toEqual(range(5, 18, 5, 39));
    expect(
      locatedHits(doc, ARRAY_JOIN_CODE),
      `u13pg — the join gate keys on the element's own type. Diagnostics: ${render(doc)}`,
    ).toEqual([`error ${arrayJoinMessage("integer")} @${at(range(5, 26, 5, 39))}`]);
  });

  it("u13ph: the object-index key check over a PROVEN key still reports", () => {
    // The object-index row's differentiator: the key is the outer `let k = 3`,
    // an unshadowed proven `integer`, so the check keeps refusing it.
    const doc = parse(U13PH_OBJECT_INDEX_PROVEN_KEY);
    expect(
      letRange(doc, "v"),
      "PRECONDITION: the indexed access sits in the `let v` initialiser inside the `for` body on body line 7",
    ).toEqual(range(7, 16, 7, 28));
    expect(
      locatedHits(doc, OBJECT_INDEX_CODE),
      `u13ph — the key gate keys on the key's own type. Diagnostics: ${render(doc)}`,
    ).toEqual([`error ${objectIndexMessage("integer")} @${at(range(7, 24, 7, 28))}`]);
  });

  it("u13e: an arm body that IS its binder no longer withholds the outer binding's verdict", () => {
    // The marking channel, restated as the emission it used to withhold. Two
    // independent conditions could flip this cell and this comment named both.
    // ONE IS NOW TAKEN. The `let` arm's marking guard adds the object
    // `typeOf(stmt.init)` returned to `unprovableBindings` by IDENTITY
    // (`walkStmt`'s `case "let"`, src/parser/type-layer-checks.ts:1188, read at
    // `provableArgType`'s `ident` arm, :2053). Here that object is the outer
    // `x`'s: the inference pass types an arm body in the ENCLOSING bindings map
    // (`#typeExpr`'s `case "match"`, src/parser/static-type-inference.ts:261–265),
    // so `typeOf(match)` hands back the recorded object through `#commonType`'s
    // single-candidate fallback (:434–439, :438) over what the `ident` arm
    // already returned by identity (:235–240). The arm-scoped reduction
    // correctly withholds, so the SHARED object is marked and the outer `x`
    // reads unprovable for the rest of the walk. Bug 0199
    // (docs/bugs/0199-let-arm-marks-borrowed-object-suppression.md) keys that
    // mark to the binding it was recorded for, which restores the emission below
    // — a true positive, since `x` IS the integer `1` — and is the authority
    // under which this cell asserts it.
    //
    // THE OTHER FLIP DAY IS STILL OPEN, and is not this cell's to spend. Bug
    // 0145 (docs/bugs/0145-inference-pass-no-match-arm-scope.md) owns the
    // arm-scope question: the pass has no arm scope, so an arm body's binder is
    // resolved in the scope that encloses it. That report's subject is the
    // programs it REFUSES on that account, none of which this fixture reaches,
    // and it stays open with its subject intact.
    //
    // The direction is the admissible one either way: `unprovableBindings` has
    // exactly one read site, whose only effect is hit-becomes-withhold, so the
    // channel can only turn a proof into a deferral and never fabricate an `E`.
    // Scope-map containment is unaffected — cells u12p / u12pb and the `for`
    // shape (`let x = 1` then `for x in ["a"] { … }` then `g(x)`, which emits
    // here too) show the record itself does not leak outward; what leaked was
    // the MARKING.
    const doc = parse(U13E_ARM_IDENTITY_MARKING);
    expect(
      argRange(doc, "g", 0),
      "PRECONDITION: the argument `x` sits at the top-level call on body line 7",
    ).toEqual(range(7, 11, 7, 12));
    expect(
      locatedHits(doc, CODE),
      `u13e — a mark recorded for \`m\` must not withhold the outer \`x\`, whose own \`let x = 1\` is a proof; TYPE-9 owes the mismatch at the argument node the PRECONDITION above pins. Diagnostics: ${render(doc)}`,
    ).toEqual([`error ${fnArgMessage("g", 0, "s", "string", "integer")} @${at(range(7, 11, 7, 12))}`]);
  });

  it("u13r: a COMPOSITE built from a withheld read keeps its verdict, and renders the sentinel", () => {
    // The disclosed render residual, pinned at an UNANNOTATED `fn` parameter.
    // Bug 0126 (docs/bugs/0126-plain-for-binds-no-loop-variable.md) binds the
    // plain `for` loop variable to its iterand's element type, so a `for`-fed
    // composite built from a PROVEN iterand renders that real type instead of
    // the sentinel — pinned over this exact composite shape by
    // `tests/plain-for-loop-variable-element-type.test.ts` row b4. `walkFn`
    // still records an unannotated parameter WITHHELD (bug 0126 does not touch
    // it), so `x` here is the sentinel again: `if [x]` is not boolean whatever
    // `x` holds, so the row's verdict rests on the array kind and not on the
    // withheld part — `checkBooleanPosition` keeps reporting, and
    // `displayType` renders the sentinel nested inside the composite; the
    // verdict and its span are unmoved from that render.
    //
    // The complete set of shapes a WITHHELD BINDER READ can render, swept over
    // every row that interpolates a type into its Message: this one,
    // `mixed-plus-operands` and `non-orderable-operands` (`[x] + 1`, `[x] < 1`),
    // `unknown-method` (`[x].frobnicate()`), and a typed `let` over a `par for`
    // whose CTRL-3 value name embeds the tail type's rendering
    // (`Result<<withheld>, QueryError>`, src/parser/static-type-inference.ts:290
    // — the one route where the sentinel sits inside a synthesised NAME rather
    // than inside a composite). Every one of them emits at this HEAD too, with
    // the sentinel nested in the same position. Outside a withheld-binder read,
    // an author-spelled twin in a direct annotation (`let v: <withheld> = …`)
    // reaches a sixth rendering — `got <withheld>` at the fn-arg row, through
    // the annotation-is-a-proof channel — the same deferral-only disposition,
    // by a different route.
    //
    // This cell reds if the sentinel's spelling changes, which is the point:
    // the one place a user-visible message can carry it is pinned rather than
    // discovered.
    const doc = parse(U13R_NESTED_RENDER);
    expect(
      letRange(doc, "r"),
      "PRECONDITION: the `if` body's `let r` sits on body line 4",
    ).toEqual(range(4, 20, 4, 29));
    expect(
      locatedHits(doc, NON_BOOLEAN_CODE),
      `u13r — the rows whose verdict an outer kind decides are left alone, and the sentinel is what they render. Diagnostics: ${render(doc)}`,
    ).toEqual([`error ${nonBooleanMessage("array<<withheld>>")} @${at(range(4, 14, 4, 17))}`]);
  });
});

// ===========================================================================
// e1 — the GOV-15 blast-radius lock. GREEN at this HEAD and required to stay
// green: every plain `fn` call whose callee declares a parameter type starts
// being judged, and an `E` denies registration. The three files are the ones
// the §Fix's blast-radius paragraph measures — the only shipped examples that
// call a `fn` with an annotated parameter.
//
// The repo-wide committed-fixture parse gate
// (tests/committed-fixture-parse-gate.test.ts) walks every `.theta` and demands
// zero diagnostics; this cell is narrower on purpose. It names the three call
// sites this route touches and applies GOV-15's own loads-cleanly predicate
// (source-language-stability.md:9 — no diagnostic of effective severity `E`),
// so a failure here reads as "the fix changed observable (b) on an in-scope
// input" rather than as an unattributed corpus red.
// ===========================================================================

describe("bug 0050 — the shipped example corpus keeps loading clean", () => {
  it("e1: the three shipped examples with annotated-parameter `fn` call sites parse with zero error-severity diagnostics", () => {
    // docs/examples/import-thetalib.theta:9 — an imported `.thetalib` call
    //   (`rate_strictness(reviewer)`, cell i1's route: the callee signature is
    //   outside the single-file parse, so the check defers).
    // docs/examples/ralph-inline.theta:39 — a same-file `subagent fn` call
    //   (`step(objective)`, cell s1's route, so the callee IS resolved). Its
    //   argument is the frontmatter `params:` field `objective`, whose static
    //   type the type layer does not resolve — measured at this HEAD through
    //   the typed-`let` sink, which draws nothing from `let w: boolean =
    //   objective` — so the argument side defers.
    // docs/examples/refine-inline.theta:30 — a same-file `subagent fn` call
    //   (`reviewer(draft)`). `draft` is a `?`-unwrapped untyped query result,
    //   likewise unresolved at the same sink, so the argument side defers.
    //
    // Both `subagent fn` sites therefore stay clean by the deferral rule rather
    // than by passing a judgement, which is the measurement the §Fix's
    // blast-radius paragraph asks for before landing.
    const examples = [
      "docs/examples/import-thetalib.theta",
      "docs/examples/ralph-inline.theta",
      "docs/examples/refine-inline.theta",
    ];
    const verdicts = examples.map((path) => {
      const src = readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");
      const doc = parseDoc(src, path);
      if (doc.body === null) {
        throw new Error(
          `e1 — ${path} produced no parsed body, so its clean verdict would measure a parse failure rather than the call sites: ${render(doc)}`,
        );
      }
      const errs = errors(doc.diagnostics).map(
        (d: Diagnostic) => `${d.code}: ${d.message}`,
      );
      return `${path} -> ${errs.length === 0 ? "clean" : errs.join(" | ")}`;
    });
    expect(
      verdicts,
      "e1 — GOV-15's diagnostic-registry carve-out admits the addition for inputs newly brought into the code's emission set; a shipped example acquiring an `E` is a corpus break the fix must repair in the same commit, not accept",
    ).toEqual(examples.map((path) => `${path} -> clean`));
  });
});

// ===========================================================================
// a1 — argument COUNT is a different question and stays unjudged at parse.
// GREEN at this HEAD and after. Bug 0131 owns the arity position and is OPEN;
// it is NOT fixed here. Its ordering note records that arity must be decided
// before per-argument type, so whichever lands second inherits the other's
// suppression channel — this cell is the marker that this route landed first
// and changed nothing about the count.
// ===========================================================================

describe("bug 0050 — argument arity at a plain `fn` call is untouched", () => {
  it("a1: `g()` and `g(3, 4)` against a one-parameter `fn` draw neither fn-arg-type-mismatch nor an arity code", () => {
    // Too few: there is no argument to judge. Too many: index 0 is compatible
    // (`integer ⊑ number`) and index 1 sits past the end of the parameter list,
    // so the check has no declared type for it and skips it — the extra
    // argument is an arity fault, and no registry row covers a plain `fn`
    // call's argument count. The runtime still throws `ThetaFnArityError`
    // (src/runtime/statement-executor.ts:386, :424).
    const tooFew = parse(A1_TOO_FEW);
    const tooFewCalls = collectCalls(tooFew).filter((c) => c.callee === "g");
    expect(
      tooFewCalls.map((c) => c.args.length),
      `PRECONDITION: the zero-argument call must parse as a call node. Diagnostics: ${render(tooFew)}`,
    ).toEqual([0]);
    expectNoFnArgMismatch(
      tooFew,
      "a1 (too few) — an absent argument has no static type, so the type check has no operand",
    );

    const tooMany = parse(A1_TOO_MANY);
    expect(
      argRange(tooMany, "g", 1),
      "PRECONDITION: the second argument node must be reachable, or the absence assertions below measure nothing",
    ).toEqual(range(5, 14, 5, 15));
    expectNoFnArgMismatch(
      tooMany,
      "a1 (too many) — the surplus argument sits at an index the parameter list does not cover, so it carries no declared type to be judged against",
    );

    for (const [label, doc] of [
      ["too few", tooFew],
      ["too many", tooMany],
    ] as const) {
      expect(
        [...locatedHits(doc, ARITY_TOO_FEW_CODE), ...locatedHits(doc, ARITY_TOO_MANY_CODE)],
        `a1 (${label}) — the two registered arity rows are scoped to \`invoke\` / \`.theta\`-callable callees; bug 0131 is open and this route does not answer it. Diagnostics: ${render(doc)}`,
      ).toEqual([]);
    }
  });
});
