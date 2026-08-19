import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { Block, Expr, Stmt, ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0194 — `TypeLayerWalk.unprovableBindings` (src/parser/type-layer-checks.ts)
// is a `Set<CompatType>` whose membership test is JavaScript object identity,
// and its only read is `provableArgType`'s `ident` arm. The two loop arms —
// `walkStmt`'s `case "for"` and `walkExpr`'s `case "par-for"` — mark
// `unfoldAlias(iterand).element`. That object is BORROWED, not
// minted: one `CompatType` per alias declaration per parse, per declared schema
// field per parse, per `params:` field per parse. So a mark taken for one
// unprovable loop lands on an object every LATER reader of the same alias,
// field or `params:` binding gets back, and one unprovable loop suppresses a
// TRUE `theta/parse/fn-arg-type-mismatch` at every later PROVABLE loop in the
// whole document
// (docs/bugs/0194-unprovable-marking-by-object-identity-shared-alias-element.md).
//
// The property this file asserts is the report's §Expected behaviour, stated so
// a fix has a target: A WITHHOLD RECORDED FOR ONE BINDING APPLIES TO THAT
// BINDING ONLY. Groups (a), (b) and (c) are the property's failing half —
// currently `[]`, owed the diagnostic. Group (d) is its non-failing half —
// already correct, and the half that proves a fix RE-KEYED the withhold rather
// than deleting it. Group (e) is the SECOND identity channel keyed on the same
// element object, bug 0079's `resultBindings` provenance: it pins NO CHANGE, so
// a copy-on-mark route that severs it reds there while (a)–(c) go green.
//
// ADDITIVE. This file is new. It modifies no existing test. In particular it
// does not touch cell `e4` of tests/plain-for-loop-variable-element-type.test.ts
// (bug 0126's pin of the marking's existence) or row `x11` of
// tests/member-access-declared-field-type.test.ts (bug 0190's pin of the
// member-arm verdict) — both stay green under the route this file encodes, and
// row d5 below is this file's own copy of the constraint they carry.
//
// ── §REPRODUCTION RE-DERIVED AT HEAD, NOT COPIED ────────────────────────────
// The report was filed at 5c9104ab (0.107.0) and two later fixes moved its
// input set. Every fixture below was measured against THIS tree (0.112.0):
//
//   * Bug 0190 (0.111.0) made a member read of a declared field on a resolved
//     object schema a PROOF at the fn-argument sink, so the report's own
//     poisoners STOPPED POISONING. Measured here: `for a in p.xs { … }` with
//     `p` an annotated `schema P { xs: L }` parameter now EMITS the mismatch at
//     the later loop, as does the `let zs = p.xs` laundering of it. Neither is
//     usable as a poisoner and neither appears below.
//   * Bug 0192 (0.112.0) threaded a `params:`-declared binding's type into the
//     type layer, which is what makes group (c) row c4 a live shape at all: the
//     `params:` seeding mints ONE `CompatType` per declared field per parse, so
//     it is a third shared-object family rather than an unresolvable read.
//
// The unprovable-AND-array-typed shape that REMAINS at HEAD is the ERASED
// RECEIVER, which is bug 0190's own receiver-proof obligation seen from the
// other side: `let m = flag ? A { xs: [1] } : B { xs: ["a"] }` is not a proven
// reduction (`#commonType` falls back to the first candidate), so `m` is
// unprovable; `m.xs` resolves against `A` and unfolds to an `array`, so the
// marking's `unfolded.kind === "array"` branch is taken while
// `provableArgType` withholds. Every poisoner below is that receiver, or a
// composite containing it.
//
// ── THE THREE SHARED-OBJECT FAMILIES ────────────────────────────────────────
// The defect is one mechanism reached through three constructors, and a fix at
// the marking site closes all three at once:
//
//   1. THE ALIAS ELEMENT — `collectTypeEnv` calls `annotationToCompatType` once
//      per `schema L = array<integer>` declaration and `unfoldAlias`
//      (src/parser/type-compat.ts) returns that right-hand side BY REFERENCE.
//      Group (a), (b), c1, c2, c5–c9.
//   2. THE DECLARED-FIELD OBJECT — `collectSchemaFields` builds one
//      `CompatType` per declared field per parse, and bug 0190's
//      `declaredFieldType` hands it back by reference. No alias is involved at
//      all. Row c3.
//   3. THE `params:`-SEEDED OBJECT — the root bindings map is seeded with one
//      `CompatType` per `params:` field per parse (bug 0192). Row c4.
//
// ── THE ROUTE THESE ROWS TARGET ─────────────────────────────────────────────
// §Fix (a) route 1, copy-on-mark, at the TWO LOOP ARMS ONLY and through one
// shared private helper so the marking step stays byte-identical in both arms
// (§Fix (d) constraint 1: measured, the arms poison each other in both
// directions — group (b) — so a fix at one arm leaves the defect reachable
// through the other keyword). A provable loop is byte-identical to today; an
// unprovable one records and marks a fresh structural twin of the element, so
// the mark is reachable from exactly one scope entry — which is what both
// `unprovableBindings` doc comments already claim and neither is true of a
// borrowed object.
//
// The `let` arm is OUT of scope for that route: it marks whatever
// `typeOf` returned for the initialiser, which is also a borrowed object for a
// member read. Row d6 bounds it, and bug 0199
// (docs/bugs/0199-let-arm-marks-borrowed-object-suppression.md) is the report
// that takes that writer as its subject; its §Fix (d)(2) is the authority under
// which d6 asserts the emission its own control already asserts.
//
// ── FIX-PRODUCED EMISSION vs REGRESSION PIN ─────────────────────────────────
// RED at HEAD, green under the route (the property's failing half):
//   (a) a1; (b) b1, b2, b3; (c) c1, c2, c3, c4, c5, c6, c7, c8, c9.
// RED at HEAD, green under bug 0199's fix at the remaining writer: (d) d6.
// Green at HEAD and green under the route (the property's bound in the other
// direction — each reds if a fix DELETES the withhold instead of re-keying it):
//   (a) a2, a3; (b) b4; (c) c3ctl, c4ctl, c9ctl; (d) d1, d2, d3, d4, d5,
//   d6ctl; (e) e1, e2, e3ctl, e4ctl.
// Row d5 is the sharpest of those: an unproven iterand's OWN loop variable is
// still withheld at the fn-argument sink. A route that removes the marking
// greens (a)–(c) and reds d5. Group (e)'s e1 / e2 are the sharpest in the other
// direction: they red if the copy-on-mark twin fails to inherit the copied
// object's `resultBindings` membership.
//
// ── TIER: unit, offline, provider-free, deterministic ───────────────────────
// The whole mechanism settles inside one `parseThetaDocument` call: the channel
// is per-parse instance state on a single `TypeLayerWalk`, and its only
// observable is the document's aggregated `diagnostics` list. An INTEGRATION
// tier would add a session round-trip that observes neither the recorded
// `CompatType` nor the diagnostic list. A LIVE tier would put a stochastic
// model between a fixture and a fully determined parse-time verdict; the one
// question that IS live — an error-severity `theta/parse/*` denying
// registration through the real composition root — is a registration-only cell
// in tests/live/live-production-acceptance.test.ts and spends no tokens.
//
// ── HARNESS ─────────────────────────────────────────────────────────────────
// The shared house driver `parseDoc` (tests/helpers/e2e-s1.ts:39), unmodified —
// the real `parseThetaDocument` behind inert offline seams, the entry point
// §Reproduction measured through. Every fixture carries `---\nmode: prompt\n---`
// and a trailing final value.
//
// ── THE DIAGNOSTIC ORACLE: DIAG-4 ───────────────────────────────────────────
// docs/spec_topics/diagnostics/diagnostic-shape.md:74 makes the registry's
// *Message* column normative and requires an asserting test to source its
// expected strings from it. Every message below is read through `parseRegistry`
// + `registryMessage` (tools/code-registry/index.js) and interpolated in ONE
// pass, with an unsupplied or unused placeholder throwing. Registry rows are
// cited by CODE, never by line. One code group (e) needs — CTRL-4's
// `theta/parse/par-query-in-body` — has no row on the four sharded spec
// registry pages `parseRegistry` reads, and appears in table form only on the
// transcription page whose own header declares that column normative under the
// same DIAG-4; `parQueryInBody` below reads it from there, preferring the
// sharded oracle whenever a row lands on it. Disclosed, not chased: that gap is
// not this file's subject.
//
// ── NO SILENT SKIPPING (CLAUDE.md) ──────────────────────────────────────────
// Nothing here early-returns, branches on the environment, or skips. A missing
// registry row throws NAMING the row and the page. A fixture that stopped
// parsing, or whose layout drifted, fails its own `PRECONDITION` naming the
// binder sites it found instead of letting an absence row pass while measuring
// nothing. Every row asserts its WHOLE ordered code list AND its whole ordered
// message list, so an absent emission, a spurious extra emission and a
// reordering all red; the (a) triple additionally pins the emission's RANGE, so
// a fix that hangs the verdict on the loop rather than on the argument node
// reds with a green list above.
//
// ── CITATION POSTURE ────────────────────────────────────────────────────────
// `src/` is cited by SYMBOL throughout, header included — the convention the
// two comparable guard-chain witnesses over this same module keep
// (tests/plain-for-loop-variable-element-type.test.ts for bug 0126,
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

/** The live `theta/parse/*` registry page — this file's primary message oracle. */
const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)), "utf8"),
) as RegistryRow[];

/**
 * The four-column transcription of the registry's stable-contract columns,
 * whose own header states that its *Message* column is normative under DIAG-4
 * and that tests source their expected strings from it. Read for one code only:
 * `theta/parse/par-query-in-body`, which group (e) row e2 needs and which
 * `REGISTRY` above does not carry — CTRL-4's three `theta/parse/par-*` rows are
 * stated in control-flow.md prose and tabulated only here, and `parseRegistry`
 * requires the five-column sharded shape.
 */
const TRANSCRIPTION_PAGE = "docs/reference/diagnostics.md";

const TRANSCRIPTION_TEXT = readFileSync(
  fileURLToPath(new URL(`../${TRANSCRIPTION_PAGE}`, import.meta.url)),
  "utf8",
);

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
 * expands to text containing angle brackets (`array<string>`, row d6ctl).
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

/**
 * A code's normative *Message* read off {@link TRANSCRIPTION_PAGE}'s
 * Code / Sev / Phase / Message table, whose Message cell is a code span —
 * doubled (``` `` ```) where the message itself embeds one, which
 * `par-query-in-body`'s backtick-quoted `@` does.
 *
 * The sharded oracle wins whenever it carries the row, so the day CTRL-4's rows
 * land on a spec registry page this reader stops being consulted rather than
 * silently diverging from it. A code neither page carries throws NAMING both,
 * so a drift can never degrade an assertion below into a comparison against
 * `undefined`.
 */
function transcribed(code: string): string {
  const sharded = registryMessage(REGISTRY, code) as string | undefined;
  if (sharded !== undefined) {
    return sharded;
  }
  const escaped = code.replace(/[/-]/g, (c) => `\\${c}`);
  const row = new RegExp(
    `^\\|\\s*\`${escaped}\`\\s*\\|[^|]*\\|[^|]*\\|\\s*\`\`(.+?)\`\`\\s*\\|`,
    "m",
  ).exec(TRANSCRIPTION_TEXT);
  if (row === null) {
    throw new Error(
      `harness: neither ${REGISTRY_PAGE} nor ${TRANSCRIPTION_PAGE} carries a Message row for ${code} — the DIAG-4 column (diagnostic-shape.md:74) is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return (row[1] as string).trim();
}

const FN_ARG = "theta/parse/fn-arg-type-mismatch";
const LET_RHS = "theta/parse/let-rhs-type-mismatch";
const INTERP_RESULT = "theta/parse/interpolated-result";
const PAR_QUERY = "theta/parse/par-query-in-body";

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

/** The suppressed verdict every group (a)–(c) row is owed: `g(b)` over an `integer`. */
const G_MISMATCH = fnArg("g", 0, "s", "string", "integer");

/** Group (e)'s verdict — a placeholder-free *Message*, so the template IS the text. */
const INTERP_MESSAGE = registered(INTERP_RESULT);

/** Row e2's CTRL-4 co-fire, from the transcription table (see {@link transcribed}). */
const PAR_QUERY_MESSAGE = transcribed(PAR_QUERY);

// ===========================================================================
// Parse harness.
// ===========================================================================

const FILE = "bug0194.theta";

/** Frontmatter occupies lines 1–3; every fixture body therefore starts at 4. */
const FM = "---\nmode: prompt\n---\n";

/** Group (c) row c4's frontmatter declares a `params:` field: lines 1–5. */
const FM_PARAMS = "---\nmode: prompt\nparams:\n  xs: array<integer>\n---\n";

function parse(body: string, frontmatter = FM): ThetaDocument {
  return parseDoc(frontmatter + body, FILE);
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
 * Every LOOP-VARIABLE and `let` binder site of `doc` in source order, each
 * rendered `<kind> <name>@<range>`: a `for` / `par-for` site carries its
 * ITERAND's range, a `let` site carries the statement's own range.
 *
 * This is the loud precondition every row runs FIRST. The subject of this file
 * is an order-dependent suppression whose only observable is a diagnostic that
 * is absent, so a fixture that stopped parsing, lost a loop, or drifted a line
 * would let the currently-`[]` rows pass while measuring nothing. A body the
 * walk cannot reach throws naming the diagnostics it found instead.
 */
function binderSites(doc: ThetaDocument): string[] {
  const out: string[] = [];
  const walkExpr = (e: Expr): void => {
    switch (e.kind) {
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
      case "call":
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
      `harness: the fixture produced no parsed body, so its diagnostic set is about a parse failure rather than the loop arms under test. Diagnostics: ${render(doc)}`,
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

/** An ordered two-diagnostic contract (row c5's two judged loops). */
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
  readonly frontmatter?: string;
}

/**
 * One row: the binder-site precondition, then the WHOLE ordered code list, then
 * the whole ordered message list, then (when supplied) the whole ordered
 * located form. Whole-list ordered equality throughout — a containment matcher
 * would let an over-correction's spurious extra emission hide, and this file's
 * whole subject is a MISSING member of that list.
 */
function expectRow(row: Row): ThetaDocument {
  const doc = parse(row.src, row.frontmatter ?? FM);
  expect(
    binderSites(doc),
    `${row.label} PRECONDITION: the fixture's loop-variable / \`let\` binder sites must be exactly these, so a drifted or unparsed fixture fails here instead of letting the assertions below measure nothing. Diagnostics: ${render(doc)}`,
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
      `${row.label} — the verdict belongs to the ARGUMENT node inside the loop body, not to the loop and not to the statement. Diagnostics: ${render(doc)}`,
    ).toEqual([...located]);
  }
  return doc;
}

// ===========================================================================
// Fixtures.
//
// One preamble and one erased receiver serve nearly every row, so the ONLY
// difference between a row and its control is which loops are present and in
// which order — which is the report's own sharpest evidence: the operands never
// change, so type-system.md:48's *Unresolvable operands* deferral cannot be
// what decides these verdicts.
// ===========================================================================

/**
 * Lines 4–9. `L` is the shared alias whose element object family 1 is about;
 * `A` and `B` are the two ternary arms whose `#commonType` reduction is not a
 * proof; `g` is the judged sink.
 */
const PRE_ALIAS =
  "schema L = array<integer>\n" +
  "schema A { xs: L }\n" +
  "schema B { xs: array<string> }\n" +
  "fn g(s: string) {\n" +
  "  1\n" +
  "}\n";

/** Line 10 — the `fn` the (a)/(b) rows and c2, c5–c8 share. */
const FN_OPEN = "fn f(flag: boolean, ys: L) {\n";

/**
 * Line 11 — THE POISONER'S ROOT. A ternary over two distinct object schemas is
 * not a proven reduction, so `m` is unprovable; `m.xs` still resolves against
 * `A` and unfolds through `L` to an `array`, which is what carries the marking
 * into the `unfolded.kind === "array"` branch.
 */
const ERASED_RECEIVER = '  let m = flag ? A { xs: [1] } : B { xs: ["a"] }\n';

/** The poisoning plain `for`: an unprovable iterand, and a body that judges nothing. */
const POISON_FOR = "  for a in m.xs {\n    let z = a\n  }\n";
/** The poisoning `par for`, as an expression statement's `let` initialiser. */
const POISON_PAR = "  let r = par for a in m.xs {\n    a\n  }\n";
/** The VICTIM: a provable alias-typed parameter, and a body that judges `g`. */
const VICTIM_FOR = "  for b in ys {\n    g(b)\n  }\n";
/** The victim in the other arm. */
const VICTIM_PAR = "  let q = par for b in ys {\n    g(b)\n  }\n";
/** The `fn`'s final value and the theta's. */
const TAIL = "  1\n}\n1\n";

/** The site of the shared line-11 erased receiver. */
const M_SITE = "let m@11:3-11:49";

/**
 * Lines 4–8, family 2. No alias: `A.xs` is a DECLARED FIELD, and
 * `collectSchemaFields` mints one `CompatType` for it per parse. The victim
 * reads it off an annotated parameter, which bug 0190 made a proof.
 */
const PRE_FIELD =
  "schema A { xs: array<integer> }\n" +
  "schema B { xs: array<string> }\n" +
  "fn g(s: string) {\n" +
  "  1\n" +
  "}\n";

/**
 * Lines 6–10 under `FM_PARAMS`, family 3. The victim's iterand is the
 * `params:`-declared `xs` itself, whose single seeded object bug 0192 threads
 * into the type layer; the poisoner's `m.q` is the erased receiver again.
 */
const PRE_PARAMS =
  "schema A { q: array<integer> }\n" +
  "schema B { q: array<string> }\n" +
  "fn g(s: string) {\n" +
  "  1\n" +
  "}\n";

/** Lines 4–9 for row c9 — the alias, the arms and the sink all reversed. */
const PRE_STRING =
  "schema S = array<string>\n" +
  "schema A { xs: S }\n" +
  "schema B { xs: array<integer> }\n" +
  "fn g(n: integer) {\n" +
  "  1\n" +
  "}\n";

/** Row c9's line 10. */
const FN_OPEN_STRING = "fn f(flag: boolean, ys: S) {\n";
/** Row c9's line 11 — the same shape as `ERASED_RECEIVER`, arms swapped. */
const ERASED_RECEIVER_STRING = '  let m = flag ? A { xs: ["a"] } : B { xs: [1] }\n';

/**
 * Lines 4–9 for row d6. The sink is `hs(a: array<string>)` rather than `g`,
 * because the `let` arm's suppression is measured at a WHOLE-ARRAY argument
 * (`q.xs`) instead of at an element.
 */
const PRE_LET_ARM =
  "schema L = array<integer>\n" +
  "schema P { xs: L }\n" +
  "schema B { xs: array<string> }\n" +
  "fn hs(a: array<string>) {\n" +
  "  1\n" +
  "}\n";

// ===========================================================================
// (a) The suppression and its two controls.
//
// The three fixtures hold the same three statements over the same alias. a2
// deletes the poisoning loop; a3 keeps every statement and only swaps the two
// loops. Both controls emit; the subject does not. Since neither the operand
// types nor the declarations differ across the triple, the only variable is the
// POSITION of a mark taken over an unrelated binding — which is not the
// condition type-system.md:48 attaches its deferral licence to.
//
// All three pin the emission's RANGE as well as its text, so a route that moves
// the verdict off the argument node reds with a green code list above.
// ===========================================================================

describe("bug 0194 (a) — a withhold taken at one loop suppresses a later provable loop's verdict", () => {
  it("RED a1: an unprovable `for` over an alias element silences the next `for`'s true fn-arg mismatch", () => {
    expectRow({
      label: "a1 [subject]",
      src: PRE_ALIAS + FN_OPEN + ERASED_RECEIVER + POISON_FOR + VICTIM_FOR + TAIL,
      sites: [M_SITE, "for a@12:12-12:16", "let z@13:5-13:14", "for b@15:12-15:14"],
      expected: one(FN_ARG, G_MISMATCH),
      located: [`error ${FN_ARG} @16:7-16:8`],
      reason:
        "type-system.md:27 lists a function-argument slot among the positions `⊑` governs and :50 (TYPE-9) routes a static failure there to theta/parse/fn-arg-type-mismatch, whose registry row is `E` and states no runtime AJV net applies; `ys` is an annotated parameter of an alias declared array<integer>, :54 (TYPE-11) makes that alias its right-hand side, and control-flow.md:13 gives `b` the element type — so every iteration hands `g` an integer. The withhold that suppresses it was recorded for `a`, a different binding in a different loop",
    });
  });

  it("PIN a2 [CTL delete]: the same second loop alone emits", () => {
    expectRow({
      label: "a2 [CTL delete]",
      src: PRE_ALIAS + FN_OPEN + ERASED_RECEIVER + VICTIM_FOR + TAIL,
      sites: [M_SITE, "for b@12:12-12:14"],
      expected: one(FN_ARG, G_MISMATCH),
      located: [`error ${FN_ARG} @13:7-13:8`],
      reason:
        "the erased receiver is still declared and still unprovable; deleting only the loop that READS it restores the verdict, so the suppression is the mark and not the declaration — green in both directions",
    });
  });

  it("PIN a3 [CTL reorder]: the same three statements with the two loops swapped emit", () => {
    expectRow({
      label: "a3 [CTL reorder]",
      src: PRE_ALIAS + FN_OPEN + ERASED_RECEIVER + VICTIM_FOR + POISON_FOR + TAIL,
      sites: [M_SITE, "for b@12:12-12:14", "for a@15:12-15:16", "let z@16:5-16:14"],
      expected: one(FN_ARG, G_MISMATCH),
      located: [`error ${FN_ARG} @13:7-13:8`],
      reason:
        "the sharpest control: identical statements, identical operands, only the order differs. A check whose verdict depends on statement order elsewhere in the document is not the operand-conditioned deferral type-system.md:48 authorises — green in both directions",
    });
  });
});

// ===========================================================================
// (b) Both arms, both directions — one set, two writers.
//
// `walkStmt`'s `case "for"` and `walkExpr`'s `case "par-for"` mark through the
// SAME `unprovableBindings`, so neither arm is the arm to fix: b1 poisons a
// plain `for` from a `par for`, b2 poisons a `par for` from a plain `for`, b3
// keeps both in the same arm. With a1 supplying the plain→plain corner, the
// four-way matrix is complete, and b4 proves the `par for` judgement is live on
// this harness independently.
// ===========================================================================

describe("bug 0194 (b) — the plain `for` and `par for` arms poison each other", () => {
  it("RED b1: a `par for` poisoner silences a later plain `for`", () => {
    expectRow({
      label: "b1 [par → for]",
      src: PRE_ALIAS + FN_OPEN + ERASED_RECEIVER + POISON_PAR + VICTIM_FOR + TAIL,
      sites: [M_SITE, "let r@12:3-14:4", "par-for a@12:24-12:28", "for b@15:12-15:14"],
      expected: one(FN_ARG, G_MISMATCH),
      reason:
        "control-flow.md:70 gives `par for` the `for` iterand contract unchanged, so both arms derive `b`'s type the same way; the TYPE-9 verdict the plain loop is owed cannot depend on which keyword an earlier, unrelated loop used",
    });
  });

  it("RED b2: a plain `for` poisoner silences a later `par for`", () => {
    expectRow({
      label: "b2 [for → par]",
      src: PRE_ALIAS + FN_OPEN + ERASED_RECEIVER + POISON_FOR + VICTIM_PAR + TAIL,
      sites: [
        M_SITE,
        "for a@12:12-12:16",
        "let z@13:5-13:14",
        "let q@15:3-17:4",
        "par-for b@15:24-15:26",
      ],
      expected: one(FN_ARG, G_MISMATCH),
      reason:
        "the reverse direction of b1, and the reason a fix at one arm is not a fix: the same TYPE-9 slot inside a `par for` body is owed the same verdict b4 measures without the poisoner",
    });
  });

  it("RED b3: a `par for` poisoner silences a later `par for`", () => {
    expectRow({
      label: "b3 [par → par]",
      src: PRE_ALIAS + FN_OPEN + ERASED_RECEIVER + POISON_PAR + VICTIM_PAR + TAIL,
      sites: [
        M_SITE,
        "let r@12:3-14:4",
        "par-for a@12:24-12:28",
        "let q@15:3-17:4",
        "par-for b@15:24-15:26",
      ],
      expected: one(FN_ARG, G_MISMATCH),
      reason:
        "the fourth corner of the arm matrix (a1 is plain→plain): the suppression is a property of the shared set, not of either keyword",
    });
  });

  it("PIN b4 [CTL]: the `par for` judgement alone emits", () => {
    expectRow({
      label: "b4 [CTL par alone]",
      src: PRE_ALIAS + FN_OPEN + ERASED_RECEIVER + VICTIM_PAR + TAIL,
      sites: [M_SITE, "let q@12:3-14:4", "par-for b@12:24-12:26"],
      expected: one(FN_ARG, G_MISMATCH),
      reason:
        "without a poisoner the `par for` body reaches the same TYPE-9 sink the plain arm does, so b2 / b3's silence is the mark and not a missing check in that arm — green in both directions",
    });
  });
});

// ===========================================================================
// (c) Reach — how far one mark travels, and through which shared object.
//
// c1 crosses a `fn` boundary: `unprovableBindings` is per-parse instance state
// on the single `TypeLayerWalk` that covers the whole body, and the scope
// copies that bound a NAME's visibility do not bound the set.
// c2 poisons through a COMPOSITE iterand that merely contains the erased read.
// c3 and c4 are the other two shared-object families — no alias appears in
// either — and each carries its own delete-control, because their preambles
// differ from the (a) triple's.
// c5–c9 widen the reach: a third loop, a transitive unannotated `let` inside
// the victim's body, a nested alias chain, a `let`-bound iterand, and the
// mismatch in the other direction over a string alias.
// ===========================================================================

describe("bug 0194 (c) — one mark reaches the whole document", () => {
  it("RED c1: the mark crosses a `fn` boundary", () => {
    expectRow({
      label: "c1 [cross-fn]",
      src:
        PRE_ALIAS +
        "fn f(flag: boolean) {\n" +
        ERASED_RECEIVER +
        POISON_FOR +
        "  1\n}\n" +
        "fn h(ys: L) {\n" +
        VICTIM_FOR +
        TAIL,
      sites: [M_SITE, "for a@12:12-12:16", "let z@13:5-13:14", "for b@18:12-18:14"],
      expected: one(FN_ARG, G_MISMATCH),
      reason:
        "`h` shares no binding, no scope and no parameter with `f`; the only thing it shares is the alias's element object. TYPE-9's verdict on `h`'s own argument slot cannot be decided by a statement in another function",
    });
  });

  it("RED c2: a COMPOSITE iterand containing the erased read poisons the same element", () => {
    expectRow({
      label: "c2 [composite iterand]",
      src:
        PRE_ALIAS +
        FN_OPEN +
        ERASED_RECEIVER +
        "  for a in (flag ? ys : m.xs) {\n    let z = a\n  }\n" +
        VICTIM_FOR +
        TAIL,
      sites: [M_SITE, "for a@12:13-12:29", "let z@13:5-13:14", "for b@15:12-15:14"],
      expected: one(FN_ARG, G_MISMATCH),
      reason:
        "the composite's own withhold is legitimate — one arm is unprovable — but TYPE-11 unfolds both arms to the SAME alias element, so the mark lands on the object the provable `ys` arm and the later loop both read. c2's delete-control is byte-identical to a2's fixture and is not duplicated here",
    });
  });

  it("RED c3: the DECLARED-FIELD object is the second shared family — no alias at all", () => {
    expectRow({
      label: "c3 [declared-field family]",
      src:
        PRE_FIELD +
        "fn f(flag: boolean, q: A) {\n" +
        ERASED_RECEIVER +
        POISON_FOR +
        "  for b in q.xs {\n    g(b)\n  }\n" +
        TAIL,
      sites: [
        "let m@10:3-10:49",
        "for a@11:12-11:16",
        "let z@12:5-12:14",
        "for b@14:12-14:16",
      ],
      expected: one(FN_ARG, G_MISMATCH),
      reason:
        "`collectSchemaFields` mints one `CompatType` per declared field per parse and bug 0190's `declaredFieldType` returns it by reference, so `A.xs` is one object for the whole parse; `q` is an annotated parameter and `q.xs` is a proof under bug 0190, so this TYPE-9 slot is owed its verdict with no alias anywhere in the fixture",
    });
  });

  it("PIN c3ctl [CTL]: the declared-field victim alone emits", () => {
    expectRow({
      label: "c3ctl [CTL delete]",
      src:
        PRE_FIELD +
        "fn f(flag: boolean, q: A) {\n" +
        ERASED_RECEIVER +
        "  for b in q.xs {\n    g(b)\n  }\n" +
        TAIL,
      sites: ["let m@10:3-10:49", "for b@11:12-11:16"],
      expected: one(FN_ARG, G_MISMATCH),
      reason:
        "c3's own delete-control — its preamble differs from the (a) triple's, so it needs one of its own; green in both directions",
    });
  });

  it("RED c4: the `params:`-seeded object is the third shared family", () => {
    expectRow({
      label: "c4 [params family]",
      frontmatter: FM_PARAMS,
      src:
        PRE_PARAMS +
        "let flag = true\n" +
        'let m = flag ? A { q: [1] } : B { q: ["a"] }\n' +
        "for a in (flag ? xs : m.q) {\n  let z = a\n}\n" +
        "for b in xs {\n  g(b)\n}\n" +
        "1\n",
      sites: [
        "let flag@11:1-11:16",
        "let m@12:1-12:45",
        "for a@13:11-13:26",
        "let z@14:3-14:12",
        "for b@16:10-16:12",
      ],
      expected: one(FN_ARG, G_MISMATCH),
      reason:
        "bug 0192 seeds the root bindings map with one `CompatType` per `params:` field per parse, so `xs` names a single object for the whole parse; the declared array<integer> is author-written frontmatter this pass already parsed, which is exactly what type-system.md:48 excludes from its deferral licence",
    });
  });

  it("PIN c4ctl [CTL]: the params: victim alone emits", () => {
    expectRow({
      label: "c4ctl [CTL delete]",
      frontmatter: FM_PARAMS,
      src:
        PRE_PARAMS +
        "let flag = true\n" +
        'let m = flag ? A { q: [1] } : B { q: ["a"] }\n' +
        "for b in xs {\n  g(b)\n}\n" +
        "1\n",
      sites: ["let flag@11:1-11:16", "let m@12:1-12:45", "for b@13:10-13:12"],
      expected: one(FN_ARG, G_MISMATCH),
      reason:
        "c4's own delete-control, and the proof that a top-level `for` over a `params:` field is judged at all on this harness — green in both directions",
    });
  });

  it("RED c5: EVERY later loop is silenced, not only the next one", () => {
    expectRow({
      label: "c5 [third loop]",
      src:
        PRE_ALIAS +
        "fn f(flag: boolean, ys: L, zs: L) {\n" +
        ERASED_RECEIVER +
        POISON_FOR +
        VICTIM_FOR +
        "  for c in zs {\n    g(c)\n  }\n" +
        TAIL,
      sites: [
        M_SITE,
        "for a@12:12-12:16",
        "let z@13:5-13:14",
        "for b@15:12-15:14",
        "for c@18:12-18:14",
      ],
      expected: two(one(FN_ARG, G_MISMATCH), one(FN_ARG, G_MISMATCH)),
      reason:
        "`ys` and `zs` are two distinct parameters, both provable, both alias-typed; each owes its own TYPE-9 verdict, so the withhold's reach is monotone in the number of later readers and adding an unprovable loop can only remove diagnostics from code below it",
    });
  });

  it("RED c6: the silence survives a transitive unannotated `let` inside the victim's body", () => {
    expectRow({
      label: "c6 [transitive let]",
      src:
        PRE_ALIAS +
        FN_OPEN +
        ERASED_RECEIVER +
        POISON_FOR +
        "  for b in ys {\n    let c = b\n    g(c)\n  }\n" +
        TAIL,
      sites: [
        M_SITE,
        "for a@12:12-12:16",
        "let z@13:5-13:14",
        "for b@15:12-15:14",
        "let c@16:5-16:14",
      ],
      expected: one(FN_ARG, G_MISMATCH),
      reason:
        "an unannotated `let` records its initialiser's own type object, so `c` is the alias element too; TYPE-9's operands are both statically resolvable at the `g(c)` slot and the laundering adds no unresolvability of its own",
    });
  });

  it("RED c7: a nested alias chain unfolds to the same one object", () => {
    expectRow({
      label: "c7 [nested alias chain]",
      src:
        "schema L = array<integer>\n" +
        "schema N = L\n" +
        "schema A { xs: N }\n" +
        "schema B { xs: array<string> }\n" +
        "fn g(s: string) {\n  1\n}\n" +
        "fn f(flag: boolean, ys: N) {\n" +
        ERASED_RECEIVER +
        POISON_FOR +
        VICTIM_FOR +
        TAIL,
      sites: ["let m@12:3-12:49", "for a@13:12-13:16", "let z@14:5-14:14", "for b@16:12-16:14"],
      expected: one(FN_ARG, G_MISMATCH),
      reason:
        "type-system.md:54 recurses TYPE-11 through nested aliases until a non-alias form is reached, so `N` and `L` unfold to the same right-hand side object; the extra hop changes which alias the author wrote and nothing about what the slot is owed",
    });
  });

  it("RED c8: the victim's iterand may be a `let`-bound local rather than a parameter", () => {
    expectRow({
      label: "c8 [let-bound iterand]",
      src:
        PRE_ALIAS +
        "fn f(flag: boolean) {\n" +
        ERASED_RECEIVER +
        POISON_FOR +
        "  let ys: L = [1, 2]\n" +
        VICTIM_FOR +
        TAIL,
      sites: [
        M_SITE,
        "for a@12:12-12:16",
        "let z@13:5-13:14",
        "let ys@15:3-15:21",
        "for b@16:12-16:14",
      ],
      expected: one(FN_ARG, G_MISMATCH),
      reason:
        "an annotated `let` is as resolvable an operand as an annotated parameter — both are author-written text this pass parsed — so type-system.md:48 licences no deferral at either, and the alias element the loop takes out of it is the same object",
    });
  });

  it("RED c9: the mismatch in the other direction, over a string alias", () => {
    expectRow({
      label: "c9 [string alias reversed]",
      src: PRE_STRING + FN_OPEN_STRING + ERASED_RECEIVER_STRING + POISON_FOR + VICTIM_FOR + TAIL,
      sites: [M_SITE, "for a@12:12-12:16", "let z@13:5-13:14", "for b@15:12-15:14"],
      expected: one(FN_ARG, fnArg("g", 0, "n", "integer", "string")),
      reason:
        "the suppression is not specific to one element type or one render: with `S = array<string>` and `g(n: integer)` the same TYPE-9 slot is owed the reversed message, and the registry's own *Message* template supplies it",
    });
  });

  it("PIN c9ctl [CTL]: the string-alias victim alone emits", () => {
    expectRow({
      label: "c9ctl [CTL delete]",
      src: PRE_STRING + FN_OPEN_STRING + ERASED_RECEIVER_STRING + VICTIM_FOR + TAIL,
      sites: [M_SITE, "for b@12:12-12:14"],
      expected: one(FN_ARG, fnArg("g", 0, "n", "integer", "string")),
      reason:
        "c9's own delete-control, since its preamble and its expected render both differ from the (a) triple's — green in both directions",
    });
  });
});

// ===========================================================================
// (d) The fences — what the sharing does NOT reach, and what a fix must NOT
// remove.
//
// Every row here is CORRECT at HEAD. They are the file's bound in the other
// direction: routes that close (a)–(c) by DELETING the loop arms' marking green
// those groups and red d5, and routes that widen the withhold to a whole alias
// red d1. d3 pins the sibling VALUE channel (`containsWithheldBinderType`),
// which the identity channel does not reach — exactly one registered code is
// suppressed by this defect, not the nine the loop binding serves. d6 bounds
// the `let` arm, whose own remedy is bug 0199's.
// ===========================================================================

describe("bug 0194 (d) — the fences: sharing alone is inert, and the withhold itself survives", () => {
  it("PIN d1: two PROVABLE loops over one alias emit", () => {
    expectRow({
      label: "d1 [two provable loops]",
      src:
        PRE_ALIAS +
        "fn f(ys: L, zs: L) {\n" +
        "  for a in ys {\n    let z = a\n  }\n" +
        "  for b in zs {\n    g(b)\n  }\n" +
        TAIL,
      sites: ["for a@11:12-11:14", "let z@12:5-12:14", "for b@14:12-14:14"],
      expected: one(FN_ARG, G_MISMATCH),
      reason:
        "sharing the element object is not the defect — the MARK is. Both iterands are proofs, nothing is marked, and the verdict lands. A route that keyed the withhold to the alias itself rather than to the binding would red here",
    });
  });

  it("PIN d2: a MINTED-literal element as the poisoner reaches nothing", () => {
    expectRow({
      label: "d2 [minted literal poisoner]",
      src:
        PRE_ALIAS +
        FN_OPEN +
        '  for a in [flag ? 1 : "a"] {\n    let z = a\n  }\n' +
        VICTIM_FOR +
        TAIL,
      sites: ["for a@11:12-11:28", "let z@12:5-12:14", "for b@14:12-14:14"],
      expected: one(FN_ARG, G_MISMATCH),
      reason:
        "the array literal's element is minted by the inference pass, so the mark lands on an object no other binding holds and the later verdict is unaffected — the isolating control that identifies the BORROWED element, not the marking, as the defect",
    });
  });

  it("PIN d3: the typed-`let` sink over a poisoned loop variable still emits", () => {
    expectRow({
      label: "d3 [typed-let sink]",
      src:
        PRE_ALIAS +
        FN_OPEN +
        ERASED_RECEIVER +
        "  for a in m.xs {\n    let s: string = a\n  }\n" +
        TAIL,
      sites: [M_SITE, "for a@12:12-12:16", "let s@13:5-13:22"],
      expected: one(LET_RHS, letRhs("s", "string", "integer")),
      reason:
        "type-system.md:50 (TYPE-9) routes a typed `let`'s RHS to theta/parse/let-rhs-type-mismatch, and that sink reads the bindings map by VALUE (`containsWithheldBinderType`) rather than through `provableArgType`'s identity test — so the identity channel does not reach it and exactly one registered code is the whole loss",
    });
  });

  it("PIN d4: marking the alias's own `named` object does not reach the element", () => {
    expectRow({
      label: "d4 [named-object-vs-element]",
      src: PRE_ALIAS + FN_OPEN + ERASED_RECEIVER + "  let zs = m.xs\n" + VICTIM_FOR + TAIL,
      sites: [M_SITE, "let zs@12:3-12:16", "for b@13:12-13:14"],
      expected: one(FN_ARG, G_MISMATCH),
      reason:
        "the `let` arm marks the FIELD type object (`named L`), which the later loop never reads — it takes the ELEMENT out of the unfolded right-hand side. The channel is specifically the alias's element, and this row keeps that discrimination on record",
    });
  });

  it("PIN d5: an UNPROVEN iterand's own loop variable is still withheld at the fn-arg sink", () => {
    // The anti-over-correction pin, and this file's copy of the constraint cell
    // `e4` of tests/plain-for-loop-variable-element-type.test.ts carries. The
    // withhold must be RE-KEYED, not deleted: a route that stops marking greens
    // groups (a)–(c) and reds this row.
    expectRow({
      label: "d5 [the withhold survives]",
      src: PRE_ALIAS + FN_OPEN + ERASED_RECEIVER + "  for a in m.xs {\n    g(a)\n  }\n" + TAIL,
      sites: [M_SITE, "for a@12:12-12:16"],
      expected: CLEAN,
      reason:
        "`m` is an unproven ternary reduction, so `m.xs` is past the parser's static view and type-system.md:48 (*Unresolvable operands*) licences the deferral for THIS loop variable — the one binding the withhold was recorded for. Bug 0050's posture, and bug 0194's §Non-goals: withholding here is correct",
    });
  });

  it("RED d6: the `let` arm marks a borrowed object too, and the verdict it withholds is owed — bug 0199", () => {
    // WHICH ASSERTION MOVED, AND WHY. The `let` arm marks whatever `typeOf`
    // returned for the initialiser, which for a member read is the declared
    // field's own object, so `let zs = m.xs` suppresses the later `hs(ws)`
    // verdict through a different writer over the same set. Bug 0194's route
    // re-keys the two LOOP arms, and this cell was installed as the BOUND on
    // exactly the end state at the remaining writer. Bug 0199
    // (docs/bugs/0199-let-arm-marks-borrowed-object-suppression.md) takes that
    // writer as its subject and its §Fix (d)(2) is the authority for this flip.
    //
    // Gone: the `CLEAN` premise. It inverts into the one located emission
    // below, byte-equal to the verdict `d6ctl` already asserts on the
    // delete-control — the same operands, the same argument node, the same
    // rendered *Message*. The fixture and its binder sites are unchanged, so the
    // two cells still differ only in whether the poisoning `let` is present,
    // which is what makes this row's former silence a suppression rather than a
    // missing check.
    expectRow({
      label: "d6 [let-arm suppression]",
      src:
        PRE_LET_ARM +
        "fn f(flag: boolean, q: P) {\n" +
        '  let m = flag ? P { xs: [1] } : B { xs: ["a"] }\n' +
        "  let zs = m.xs\n" +
        "  let ws = q.xs\n" +
        "  let r = hs(ws)\n" +
        TAIL,
      sites: [M_SITE, "let zs@12:3-12:16", "let ws@13:3-13:16", "let r@14:3-14:17"],
      expected: one(FN_ARG, fnArg("hs", 0, "a", "array<string>", "array<integer>")),
      located: [`error ${FN_ARG} @14:14-14:16`],
      reason:
        "`q` is an annotated parameter of a resolved object schema and a declared-field read off it is a proof under bug 0190, so both operands at the `hs(ws)` slot are statically resolvable and type-system.md:50 (TYPE-9) owes the mismatch; the withhold that suppresses it was recorded for `zs`, a different binding",
    });
  });

  it("PIN d6ctl [CTL]: deleting the `let` poisoner restores the residual's verdict", () => {
    expectRow({
      label: "d6ctl [CTL delete]",
      src:
        PRE_LET_ARM +
        "fn f(flag: boolean, q: P) {\n" +
        '  let m = flag ? P { xs: [1] } : B { xs: ["a"] }\n' +
        "  let ws = q.xs\n" +
        "  let r = hs(ws)\n" +
        TAIL,
      sites: [M_SITE, "let ws@12:3-12:16", "let r@13:3-13:17"],
      expected: one(FN_ARG, fnArg("hs", 0, "a", "array<string>", "array<integer>")),
      reason:
        "the residual's own control: the `hs(ws)` slot IS judged when no earlier `let` marks the shared field object, which is what makes d6's silence a suppression rather than a missing check — green in both directions",
    });
  });
});

// ===========================================================================
// (e) THE SECOND CHANNEL KEYED ON THE COPIED OBJECT — bug 0079's
// `resultBindings` provenance must survive the copy.
//
// These four rows PIN NO CHANGE. Unlike groups (a)–(c), which are `[]` at HEAD
// and owed a diagnostic, every row here is green at HEAD and must stay green:
// they measure a channel the copy-on-mark twin has to CARRY, not one the fix
// moves. A twin that inherits `unprovableBindings` membership and not
// `resultBindings` membership greens (a)–(c) and reds e1 / e2 — the copy would
// have severed a registered `E` (`theta/parse/interpolated-result`, a protected
// 49-cell witness family in tests/interpolated-result-gate.test.ts) in the
// REMOVAL direction, which bug 0194's §Fix (d) constraint 3 licences for the
// ADDITION arm only.
//
// WHY THE LOOP ELEMENT CAN BE A `resultBindings` MEMBER AT ALL. `resultBindings`
// is fed only by the unannotated `let` arm, with the object `typeOf` returned
// for a `Result`-by-construction initialiser; `interpolationIsResult`'s `ident`
// arm then tests `bindings.get(name)` against it by object identity. The bridge
// between the two is `commonType`'s dominating-candidate clause
// (src/parser/type-compat.ts): over a ONE-candidate set that candidate
// dominates itself and is returned BY REFERENCE, so `StaticTypeInferencePass`'s
// array-literal element derivation gives `let xs = [r]` an element that IS the
// object `let r = Ok(1)` recorded in `resultBindings`. `xs` is itself unprovable,
// so a loop over it takes the marking branch, copies that element, and hands the
// loop variable the twin — the object `${b}` is then judged through.
//
// e1 and e2 are the two arms; e3ctl and e4ctl are the controls that keep them
// honest. All four assert the WHOLE ordered code list and the whole ordered
// message list, e2's with the CTRL-4 co-fire first: control-flow.md:76 refuses
// an `@`-query against the enclosing conversation inside a `par for` body, and
// the interpolation gate under test is reachable only through an `@`-query, so
// the two codes necessarily appear together in that arm.
// ===========================================================================

/** Lines 4–5 — the `Result` record and the one-element array that borrows it. */
const RESULT_ELEMENT_SRC = "let r = Ok(1)\nlet xs = [r]\n";

/** The two binder sites `RESULT_ELEMENT_SRC` contributes. */
const RESULT_SITES = ["let r@4:1-4:14", "let xs@5:1-5:13"];

describe("bug 0194 (e) — the copy carries bug 0079's `resultBindings` provenance", () => {
  it("PIN e1: a plain `for` over an unprovable array of `Result`s still refuses `${b}`", () => {
    expectRow({
      label: "e1 [plain for, result element]",
      src: RESULT_ELEMENT_SRC + "for b in xs {\n  @`x${b}`\n}\n1\n",
      sites: [...RESULT_SITES, "for b@6:10-6:12"],
      expected: one(INTERP_RESULT, INTERP_MESSAGE),
      reason:
        "QRY-18's `Result<T, E>` interpolation row, reached through bug 0079's provenance channel: `b`'s recorded type is a copy of the object `resultBindings` holds for `r`, and a copy that did not inherit the membership would flip `interpolationIsResult`'s `ident` arm false and withhold a registered `E` — GOV-15 observable (b) moving in the REMOVAL direction, which §Fix (d) constraint 3 does not licence. Green at HEAD; this row pins NO CHANGE",
    });
  });

  it("PIN e2: a `par for` over the same array still refuses `${b}`, after CTRL-4's own refusal", () => {
    expectRow({
      label: "e2 [par for, result element]",
      src: RESULT_ELEMENT_SRC + "let q = par for b in xs {\n  @`x${b}`\n}\n1\n",
      sites: [...RESULT_SITES, "let q@6:1-8:2", "par-for b@6:22-6:24"],
      expected: two(one(PAR_QUERY, PAR_QUERY_MESSAGE), one(INTERP_RESULT, INTERP_MESSAGE)),
      reason:
        "the other arm of the shared helper, and the reason a fix at one arm is not a fix: control-flow.md:76 (CTRL-4) refuses the `@`-query first and the QRY-18 verdict follows in the same ordered list, so the whole-list form here also pins that closing the identity hole adds no code and drops none. Green at HEAD; this row pins NO CHANGE",
    });
  });

  it("PIN e3ctl [CTL]: the gate is live with no loop involved — a direct interpolation refuses", () => {
    expectRow({
      label: "e3ctl [CTL direct]",
      src: "let r = Ok(1)\n@`x${r}`\n",
      sites: ["let r@4:1-4:14"],
      expected: one(INTERP_RESULT, INTERP_MESSAGE),
      reason:
        "the `let` arm's own record, interpolated without any loop between: proves e1 / e2's verdict is the same channel this file must not disturb, and that a red at e1 / e2 is the copy severing provenance rather than the gate having gone quiet everywhere",
    });
  });

  it("PIN e4ctl [CTL]: a PROVABLE loop over a non-`Result` element refuses nothing", () => {
    expectRow({
      label: "e4ctl [CTL provable loop]",
      src: "let ys: array<integer> = [1, 2]\nfor b in ys {\n  @`x${b}`\n}\n1\n",
      sites: ["let ys@4:1-4:32", "for b@5:10-5:12"],
      expected: CLEAN,
      reason:
        "the discrimination: an annotated iterand is a proof, so no copy is taken and no provenance exists to carry — the carry fires only where the copied object already carried the membership, which is why it can restore no verdict beyond that object's own and can add no emission",
    });
  });
});
