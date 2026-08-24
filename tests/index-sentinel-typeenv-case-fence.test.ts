import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { findCode, parseDoc } from "./helpers/e2e-s1";
import {
  CATEGORY1_PLACEHOLDERS,
  EMPTY_ADMITTED,
  fillsOf,
  nonConformantTypeNames,
  readAdmittedStandInTokens,
} from "./helpers/category1-clause-oracle";

// Bug 0135 face 2 — a `schema <lowercase>` declaration the case rule refuses
// must not decide static checks
// (docs/bugs/0135-index-sentinel-leaks-into-messages-and-typeenv.md
// §Reproduction (c), §Expected behaviour "Reading A").
//
// THE FACE THIS FILE CLOSES. `lexical.md:15` requires an uppercase first letter
// for "`schema` names, `enum` names, `enum` variant names, and any user
// identifier introduced as a type-like binding", and the lexer refuses a
// lowercase one at `E` severity (`theta/parse/schema-case-mismatch`,
// src/lexer/lexer.ts:842–849; docs/spec_topics/diagnostics/code-registry-parse.md:20).
// The document therefore declares no such type. `collectTypeEnv`
// (src/parser/type-layer-checks.ts:374–402) nevertheless writes the declaration
// into the `TypeEnv` — `:387` selects on `stmt.kind === "schema"` with no case
// test — and the READ side resolves it: `resolveNamed`
// (src/parser/type-compat.ts:124–130) answers any own key, so `unfoldAlias`
// (`:179–196`) returns the refused declaration's right-hand side and the
// downstream gates decide on it. Group (c) below is that decision: `schema
// index = array<integer>` supplies an element type to `checkArrayJoin`
// (src/runtime/stdlib-array.ts:100–124) and `schema index = string` supplies an
// RHS type to `checkLetRhsCompat`, both reached through the index arm's
// sentinel `{ kind: "named", name: "index" }`
// (src/parser/static-type-inference.ts:294) and through the call arm's
// author-chosen name (`:296`).
//
// THE SETTLED READING is Reading A applied at the READ seam, `resolveNamed`,
// not at the write seam `collectTypeEnv`: a name whose first character is not
// `A`–`Z` resolves to nothing, so a refused declaration decides nothing. The
// seam matters and is measured, not assumed — a write-seam fence flips bug
// 0038's protected witness cell g2 in tests/typeenv-prototype-names.test.ts,
// where `schema __proto__` must land as an OWN key of the record; the read-seam
// fence leaves that cell untouched because the key is still written and only
// its resolution is refused.
//
// VEHICLE NOTE (bug 0262 coordination): the `A1`, `JOIN_BODY` and `SINK_BODY`
// receiver-parameter type reads `QueryError`, not the earlier `Nope`. Bug 0262
// widens `unresolved-named-type` to the `fn` parameter capture, so a genuinely
// undeclared head is now REFUSED there rather than deferred, and `Nope` would
// draw a second code these rows do not want. `QueryError` is the builtin
// error-model name bug 0262 §Fix admits at that capture (so it draws no
// refusal) while staying absent from `collectTypeEnv` (so the receiver is
// still statically unresolvable for every downstream classifier this file
// probes) — subject preserved, per the 0165/0251 re-vehicle precedent.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/lexical.md:15 — PascalCase is required at every
//     type-like binding position; `:13` is the identifier grammar
//     `[A-Za-z_][A-Za-z0-9_]*` that makes `index` spellable at all, and `:20`'s
//     reserved list does not contain it.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:59 — the
//     `let-rhs-type-mismatch` *Trigger* fires "where the RHS type is statically
//     resolvable". A declaration the case rule refuses makes nothing
//     resolvable, so rows c3 and c5 are outside the trigger.
//   - docs/spec_topics/type-system.md:48 *Unresolvable operands* — a check whose
//     operand is past the parser's static view "is skipped and the runtime AJV
//     check is the safety net". This is the disposition the c2/c4/c6 controls
//     already exhibit, and the one the c1/c3/c5 rows must join.
//   - docs/spec_topics/type-system.md:56 TYPE-11 — alias transparency is what
//     makes a DECLARED name's right-hand side reach a gate at all; `:54`
//     TYPE-10 keeps an object-schema `named` nominal. Row d1 is the pin that this fence does not
//     reach a conformant declaration: `schema Index = string` still resolves.
//   - docs/spec_topics/diagnostics/placeholder-rendering-a.md:15 category 1,
//     *Static-type placeholders*: `:17` lists the six placeholders it governs,
//     `:19` states the rule ("re-serialising it in the source-grammar form
//     defined in [Type System]"), and `:25` is the `named` clause — "Named
//     schemas, enums, and type aliases by their theta-side identifier … the
//     identifier shape is fixed by [Lexical — Identifiers]". The conformance
//     oracle below scores group (c)'s rendered fills against that clause.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:72 DIAG-2 — the registry
//     is closed. No registry row changes here: every code asserted below is
//     already registered, and the two codes that stop firing on group (c) stop
//     because their own *Trigger* stops covering the input, not because a row
//     moved. `:74` DIAG-4 — the *Message* column is normative, so every asserted
//     message half is READ from the registry through `parseRegistry` /
//     `registryMessage` (tools/code-registry/index.js) via the `msg` helper,
//     never written out here; this is the same oracle discipline as
//     tests/index-element-alias-unfolded.test.ts, line 178 (its `msg` helper).
//   - docs/spec_topics/governance/source-language-stability.md:9 — GOV-15's
//     loads-cleanly predicate. Every group (c) source emits an `E`, so none is
//     in the equivalence promise's input set and the code-list moves owe no
//     carve-out.
//
// FACE 1 IS NOT THIS FILE'S SUBJECT AND IS PINNED UNMOVED. The rendering —
// `displayType`'s `case "named"` returning a fabricated lowercase name verbatim
// (src/parser/type-compat.ts:368–382, the `named` arm `:374–375`) — stays
// reachable: rows a1, a2, b1 and f1 assert it, deliberately. Bug 0247 added the
// eighth clause under placeholder-rendering-a.md §1 that admits it (`index` and
// `object` are both in the closed undetermined-static-type table), and the
// "0247 — the conformance oracle over the FACE-1 rows" describe block below
// scores exactly these four rows against it. A fence at the read seam cannot
// close the render: those four sources contain no declaration for the fence to
// refuse.
//
// RED / GREEN LEDGER at the pre-fix tree. RED: c1, c3, c5 (each still carries a
// second, trigger-less code decided by the refused declaration) and the
// conformance oracle (c3's and c5's `<actual>` still renders `index`, which
// category 1's `named` clause does not admit). GREEN and required to stay green:
// the face-1 pins a1, a2, b1, f1; the legality controls b2, b3, b4; the recovery
// control b5; the deferral controls c2, c4, c6; the anti-overreach pin d1; the
// wider-class record e2; and the non-registration cell over all six group (c)
// sources. The green rows are what make each red attributable to the read seam:
// b3/b4 establish that `index` is a legal field and function name with no case
// diagnostic at all, c2/c4/c6 establish that the identical bodies without the
// declaration already defer, and d1 establishes that an uppercase declaration
// still resolves — so a fence that overreached to every name would red d1
// rather than pass.
//
// ANTI-VACUITY. Twelve of the sixteen source rows expect a non-empty code list,
// so a harness that stopped reaching the type layer (a frontmatter refusal, an
// unfed static-type pass) reds loudly here instead of turning the `toEqual([])`
// rows into silent passes. Every code assertion is an ordered whole-list
// equality on the aggregated codes, so a spurious extra diagnostic cannot hide
// inside a containment check. The conformance oracle asserts the registry
// template MATCHES each message before it scores the fill, so a reworded
// template reds by naming the registry rather than by silently extracting
// nothing.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` call over a source string, which is the whole reach
// of the seam under assertion. An integration tier would add a session
// round-trip to a parse-time observable and buy no reach; the live tier is
// carried separately by
// tests/live/index-sentinel-typeenv-case-fence-live-cell.test.ts, which
// observes the registration consequence through the shipped composition and
// cannot be reached from here.
//
// NO SILENT SKIPPING: nothing here early-returns, branches on the environment,
// or conditionally skips. The registry lookup asserts its row's presence and
// each named placeholder before the template is filled, so a missing or
// reworded row reds by naming the registry rather than by a silently-wrong
// expectation.

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
 * filled (DIAG-4, diagnostic-shape.md:74). Definedness and placeholder presence
 * are asserted first, so a missing row or a reworded template reds by naming the
 * registry rather than by a bare `undefined` comparison.
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

// --- production parse harness ----------------------------------------------
//
// `parseDoc` (tests/helpers/e2e-s1.ts:39) is the shipped whole-file entry point
// `parseThetaDocument` wrapped in the standard inert deps — an in-band no-op
// system-note channel and a resolving `model:` matcher. No behaviour is stubbed:
// the type layer under assertion is the production one.

/** The frontmatter every body below is parsed under. */
const FRONTMATTER: readonly string[] = ["---", "mode: prompt", "---"];

/** The diagnostics the production parse reports for `body`, in emission order. */
function diagsOf(body: readonly string[]): readonly Diagnostic[] {
  return parseDoc([...FRONTMATTER, ...body].join("\n")).diagnostics;
}

/** The aggregated diagnostic codes, in emission order. */
function codesOf(body: readonly string[]): string[] {
  return diagsOf(body).map((d: Diagnostic) => d.code);
}

/**
 * The message reported for `code`, or `undefined` when no diagnostic carries it.
 * Selecting by code rather than by position keeps a message failure attributable
 * to its own row even where the code list is also wrong.
 */
function messageFor(diags: readonly Diagnostic[], code: string): string | undefined {
  return findCode(diags, code)?.message;
}

/**
 * Whether `diagnostics` blocks registration. This replicates `hasLoadParseError`
 * (src/extension/production-composition.ts) by construction: that function
 * is module-private — `rg -n 'export.*hasLoadParseError' src/` matches nothing —
 * so it cannot be imported, and the predicate is mirrored here instead, the
 * technique tests/index-element-alias-runtime-disposition.test.ts:185 already
 * establishes. Its clauses are the whole of the original: error severity, and a
 * code in the `theta/load/` or `theta/parse/` namespace.
 */
function blocksRegistration(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(
    (diagnostic) =>
      diagnostic.severity === "error" &&
      (diagnostic.code.startsWith("theta/load/") ||
        diagnostic.code.startsWith("theta/parse/")),
  );
}

// ===========================================================================
// The sources. Group letters follow the report's §Reproduction table.
// ===========================================================================

/** (a1) An unresolvable receiver's index read placed after `in`. */
const A1: readonly string[] = ["fn f(p: QueryError) {", "  for y in p[0] {", "    y", "  }", "}", "1"];

/** (a2) An object-schema receiver's index read placed after `in`. */
const A2: readonly string[] = [
  "schema P {",
  "  xs: array<string>",
  "}",
  "fn f(p: P) {",
  '  for y in p["xs"] {',
  "    y",
  "  }",
  "}",
  "1",
];

/** (b1) A legal `fn index()` whose call is placed after `in`. */
const B1: readonly string[] = ["fn index(): integer { 1 }", "for y in index() {", "  y", "}", "1"];

/** (b2) A legal `index` FIELD of declared type `array<string>`, iterated. */
const B2: readonly string[] = [
  "schema P {",
  "  index: array<string>",
  "}",
  "fn f(p: P) {",
  "  for y in p.index {",
  "    y",
  "  }",
  "}",
  "1",
];

/** (b3) The same field declaration alone — legality control. */
const B3: readonly string[] = ["schema P {", "  index: array<string>", "}", "1"];

/** (b4) A legal `fn index()` called into a typed binding — legality control. */
const B4: readonly string[] = ["fn index(): integer { 1 }", "let q: integer = index()", "1"];

/** (b5) A `let`-bound `index` iterated — the recovery control. */
const B5: readonly string[] = ["let index = 1", "for y in index {", "  y", "}", "1"];

/** The group (c) bodies, each measured with and without the refused declaration. */
const REFUSED_ARRAY_DECL = "schema index = array<integer>";
const REFUSED_STRING_DECL = "schema index = string";

/** (c) The `join` body: an unresolvable receiver's index read joined. */
const JOIN_BODY: readonly string[] = ["fn f(p: QueryError): string {", '  p[0].join(",")', "}", "1"];

/** (c) The typed-sink body: an unresolvable receiver's index read into `integer`. */
const SINK_BODY: readonly string[] = [
  "fn f(p: QueryError) {",
  "  let m: integer = p[0]",
  "  m",
  "}",
  "1",
];

/** (c) The call-arm body: a legal `fn index()` called into an `integer` slot. */
const CALL_BODY: readonly string[] = ["fn index(): integer { 1 }", "let m: integer = index()", "1"];

/** (c) The same call body with the callee renamed off the declaration's name. */
const CALL_BODY_RENAMED: readonly string[] = [
  "fn index2(): integer { 1 }",
  "let m: integer = index2()",
  "1",
];

const C1: readonly string[] = [REFUSED_ARRAY_DECL, ...JOIN_BODY];
const C2: readonly string[] = [...JOIN_BODY];
const C3: readonly string[] = [REFUSED_STRING_DECL, ...SINK_BODY];
const C4: readonly string[] = [...SINK_BODY];
const C5: readonly string[] = [REFUSED_STRING_DECL, ...CALL_BODY];
const C6: readonly string[] = [REFUSED_STRING_DECL, ...CALL_BODY_RENAMED];

/** (d1) The conformant declaration the fence must not reach. */
const D1: readonly string[] = ["schema Index = string", "let q: Index = 1", "1"];

/** (e2) An identifier reference to an uppercase schema name in value position. */
const E2: readonly string[] = ["schema L = array<string>", "let m: integer = L", "1"];

/** (f1) The second engine-minted fabrication at the same render. */
const F1: readonly string[] = ["let v = { a: 1 }", "for y in v {", "  y", "}", "1"];

const CASE_MISMATCH = "theta/parse/schema-case-mismatch";
const NON_ARRAY_ITERAND = "theta/parse/non-array-iterand";
const LET_RHS_MISMATCH = "theta/parse/let-rhs-type-mismatch";
const NON_STRING_JOIN = "theta/parse/non-string-array-join";

// ===========================================================================
// (c) Face 2 — a declaration the case rule refuses decides nothing.
// ===========================================================================

describe("0135 (c) — a `schema <lowercase>` declaration the case rule refuses must not decide a static check", () => {
  it("c1: `schema index = array<integer>` supplies NO element type to the `join` guard", () => {
    // The declaration is refused at `E` (lexical.md:15,
    // code-registry-parse.md:20), so the document declares no type named
    // `index` and the index arm's fabricated name resolves to nothing. The
    // receiver is unresolvable, so type-system.md:48's deferral applies to the
    // element read and `checkArrayJoin` (src/runtime/stdlib-array.ts:100–124)
    // has nothing to refuse — which is exactly what the c2 control already
    // reports for the identical body.
    const diags = diagsOf(C1);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "0135 §Fix Reading A at `resolveNamed` (src/parser/type-compat.ts:124–130) — the refused declaration must not make the element type statically resolvable, so code-registry-parse.md:46's trigger does not cover this input",
    ).toEqual([CASE_MISMATCH]);
    expect(
      messageFor(diags, CASE_MISMATCH),
      "code-registry-parse.md:20 — the *Message* column carries no placeholder",
    ).toBe(msg(CASE_MISMATCH, []));
  });

  it("c2: the same `join` body with no declaration reports nothing (control)", () => {
    expect(
      codesOf(C2),
      "type-system.md:48 — with no declaration for the fabricated name the read is unresolvable and the `join` guard defers",
    ).toEqual([]);
  });

  it("c3: `schema index = string` supplies NO RHS type to a typed binding", () => {
    // code-registry-parse.md:59 scopes `let-rhs-type-mismatch` to inputs "where
    // the RHS type is statically resolvable". A declaration the case rule
    // refuses resolves nothing, so this row leaves the trigger and joins its c4
    // control.
    const diags = diagsOf(C3);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "code-registry-parse.md:59 — the refused declaration must not make the RHS statically resolvable, so the mismatch row's trigger does not cover this input",
    ).toEqual([CASE_MISMATCH]);
    expect(
      messageFor(diags, CASE_MISMATCH),
      "code-registry-parse.md:20 — the casing refusal is the only diagnostic this source earns",
    ).toBe(msg(CASE_MISMATCH, []));
  });

  it("c4: the same typed binding with no declaration reports nothing (control)", () => {
    expect(
      codesOf(C4),
      "type-system.md:48 — with no declaration for the fabricated name the RHS is unresolvable and the check defers",
    ).toEqual([]);
  });

  it("c5: `schema index = string` does not decide a CALL's type either", () => {
    // The second route into the same collision: `#typeExpr`'s call arm
    // (src/parser/static-type-inference.ts:296) types a call by its callee
    // name, `fn index()` is legal (b4), and the refused declaration used to
    // resolve that name. The fence is on the name's first character, so both
    // routes lose the resolution together.
    const diags = diagsOf(C5);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "code-registry-parse.md:59 — a callee name that only the refused declaration resolves is not a statically resolvable RHS",
    ).toEqual([CASE_MISMATCH]);
    expect(
      messageFor(diags, CASE_MISMATCH),
      "code-registry-parse.md:20 — the casing refusal is the only diagnostic this source earns",
    ).toBe(msg(CASE_MISMATCH, []));
  });

  it("c6: the same source with the callee renamed reports the casing refusal alone (control)", () => {
    // The control that makes c5's red attributable to the name collision rather
    // than to the typed `let` itself: rename the callee and the mismatch is
    // already absent at the pre-fix tree.
    expect(
      codesOf(C6),
      "type-system.md:48 — a callee no declaration names is unresolvable, so the typed binding defers and only the casing refusal stands",
    ).toEqual([CASE_MISMATCH]);
  });

  it("c-group: every source still carries an E-severity refusal, so none of these thetas registers", () => {
    // The bound on this face, asserted rather than assumed. The rows above
    // REMOVE a code, so the claim "the exposure is a wrong diagnostic on a
    // document that is already refused" has to survive the removal:
    // `hasLoadParseError` (src/extension/production-composition.ts) still
    // has the `E`-severity casing refusal to act on in every one of them.
    const sources: ReadonlyArray<readonly [string, readonly string[]]> = [
      ["c1", C1],
      ["c2", C2],
      ["c3", C3],
      ["c4", C4],
      ["c5", C5],
      ["c6", C6],
    ];
    for (const [label, source] of sources) {
      const diags = diagsOf(source);
      const declared = source[0]?.startsWith("schema index") === true;
      if (!declared) {
        // c2 and c4 are the declaration-free controls: they are parse-clean by
        // construction, and asserting that establishes the contrast the
        // registration claim rests on.
        expect(
          blocksRegistration(diags),
          `${label} carries no declaration, so it must be parse-clean; codes=${JSON.stringify(diags.map((d) => d.code))}`,
        ).toBe(false);
        continue;
      }
      expect(
        diags.filter((d: Diagnostic) => d.code === CASE_MISMATCH).map((d) => d.severity),
        `${label}: code-registry-parse.md:20 severity E — the casing refusal must survive the fence, or the fence would turn a refused document into a registering one`,
      ).toEqual(["error"]);
      expect(
        blocksRegistration(diags),
        `${label}: source-language-stability.md:9 — this document must stay outside the loads-cleanly predicate, so removing the second code cannot admit it. Codes=${JSON.stringify(diags.map((d) => d.code))}`,
      ).toBe(true);
    }
  });
});

// ===========================================================================
// The conformance oracle over group (c)'s rendered type placeholders.
// ===========================================================================

// The oracle helpers — `CATEGORY1_PLACEHOLDERS`, `nonConformantTypeNames`,
// `fillsOf` — now live in tests/helpers/category1-clause-oracle.ts, unchanged in
// semantics: bug 0247 needs one scorer over both engine producers' rows, and the
// withheld-sentinel rows live in another file. `EMPTY_ADMITTED` is what keeps the
// group-(c) cell below scoring against the seven original clauses alone.

describe("0135 — the conformance oracle: no group (c) message may interpolate a non-conformant type name", () => {
  it("scores every rendered category-1 placeholder in group (c) against placeholder-rendering-a.md's closed clause list", () => {
    // SCOPE: face 2 only. This oracle ranges over the group (c) sources — the
    // ones whose rendered type names are decided by a declaration the case rule
    // refuses. It deliberately does NOT range over the face-1 rows a1, a2, b1
    // and f1, which render `index` and `object` from an engine mint with no
    // declaration anywhere: this cell stays scored against the seven original
    // clauses alone (`EMPTY_ADMITTED`); the face-1 rows are scored by the 0247
    // cell below against the enlarged clause list.
    //
    // WHY THIS EXISTS beside the code-list cells: the code lists say WHICH
    // diagnostics fire, and a future change that re-resolved a lowercase
    // declaration through some other read path would have to reintroduce a
    // rendered `index` to be visible. This cell reds on the rendered fill
    // itself, so the fence is scored at the placeholder and not only at the
    // code list.
    const sources: ReadonlyArray<readonly [string, readonly string[]]> = [
      ["c1", C1],
      ["c2", C2],
      ["c3", C3],
      ["c4", C4],
      ["c5", C5],
      ["c6", C6],
    ];
    const offenders: string[] = [];
    let scored = 0;
    for (const [label, source] of sources) {
      for (const diagnostic of diagsOf(source)) {
        for (const [name, value] of fillsOf(REGISTRY, diagnostic.code, diagnostic.message)) {
          if (!CATEGORY1_PLACEHOLDERS.has(name)) continue;
          scored += 1;
          for (const bad of nonConformantTypeNames(value, EMPTY_ADMITTED)) {
            offenders.push(`${label} ${diagnostic.code} ${name}=${JSON.stringify(bad)}`);
          }
        }
      }
    }
    expect(
      offenders,
      "placeholder-rendering-a.md:25 read with lexical.md:15 — a category-1 placeholder in group (c) rendered a name no clause admits, which means a declaration the case rule refuses is still resolving through `resolveNamed` (src/parser/type-compat.ts:124–130)",
    ).toEqual([]);
    // ANTI-VACUITY for this cell: an oracle that scored nothing would pass
    // whatever the fence did. The `schema-case-mismatch` row carries no
    // placeholder, so the c-group's only scored fills are the ones the refused
    // declaration used to supply — after the fence there are none, and this
    // assertion states that as the expected count rather than leaving it
    // unstated.
    expect(
      scored,
      "the fence removes every category-1 placeholder fill from group (c); a non-zero count means a refused declaration still reaches a rendered type position",
    ).toBe(0);
  });
});

describe("0247 — the conformance oracle over the FACE-1 rows, scored against the closed stand-in table", () => {
  it("scores a1, a2, b1 and f1 against category 1's clause list plus the closed undetermined-static-type table", () => {
    // WHAT THIS DISCHARGES. Bug 0135 residual 2: its oracle ranges over group
    // (c), where after the read-seam fence no category-1 fill survives, so the
    // face-1 rows — the ones that still render an engine fabrication — were
    // scored by nothing. Bug 0247 supplies the clause those rows need: an eighth
    // clause under category 1's Rule plus a CLOSED table of admitted stand-in
    // tokens for a static type the parse layer did not determine. This cell
    // reads that table off placeholder-rendering-a.md and scores the four rows
    // against the enlarged clause list.
    //
    // WHY IT REDS AT THIS HEAD, AND FOR WHICH REASON. The table does not exist:
    // category 1's Rule states seven clauses (placeholder-rendering-a.md:21–27),
    // every one presupposing a determined static type, and
    // `readAdmittedStandInTokens`
    // (tests/helpers/category1-clause-oracle.ts) fails loudly naming the missing
    // anchor rather than falling back to an empty set. Reading the table rather
    // than listing it here is what makes a sixth engine-fabricated name red
    // without anyone adding a row to a test.
    const admitted = readAdmittedStandInTokens();
    const sources: ReadonlyArray<readonly [string, readonly string[]]> = [
      ["a1", A1],
      ["a2", A2],
      ["b1", B1],
      ["f1", F1],
    ];
    const offenders: string[] = [];
    let scored = 0;
    for (const [label, source] of sources) {
      for (const diagnostic of diagsOf(source)) {
        for (const [name, value] of fillsOf(REGISTRY, diagnostic.code, diagnostic.message)) {
          if (!CATEGORY1_PLACEHOLDERS.has(name)) continue;
          scored += 1;
          for (const bad of nonConformantTypeNames(value, admitted)) {
            offenders.push(`${label} ${diagnostic.code} ${name}=${JSON.stringify(bad)}`);
          }
        }
      }
    }
    expect(
      offenders,
      "bug 0247 §Fix — every byte a category-1 placeholder can carry must be fixed by a clause (placeholder-rendering-a.md:5). A row here rendered a token that neither the seven original clauses nor the closed stand-in table admit, so `#typeExpr`'s fabrication family (src/parser/static-type-inference.ts) reaches a user-visible Message through no rule",
    ).toEqual([]);
    // ANTI-VACUITY. Measured, not assumed: the four rows supply exactly four
    // category-1 fills — `got index` from a1, a2 and b1, `got object` from f1.
    // The second row f1 draws, `bare-object-literal`, carries no category-1
    // placeholder, so it adds none. A drift in either direction means the
    // harness stopped reaching the render arm and the offenders list above went
    // empty for the wrong reason.
    expect(
      scored,
      "bug 0247 §Reproduction (c) — the face-1 rows must still render four category-1 fills; a lower count means the oracle scored nothing and its empty offenders list is vacuous",
    ).toBe(4);
  });
});

// ===========================================================================
// (d) The anti-overreach pin — a conformant declaration still resolves.
// ===========================================================================

describe("0135 (d) — the fence is on the case rule, not on a name list", () => {
  it("d1: `schema Index = string` still resolves, so a typed binding still reports its mismatch", () => {
    // The load-bearing pin against overreach. An uppercase-initial name is
    // conformant at a declaration position (lexical.md:15), draws no casing
    // diagnostic, and TYPE-11 (type-system.md:56) makes it transparent — so
    // `let q: Index = 1` has two statically resolvable operands and
    // code-registry-parse.md:59's trigger covers it. A fence that refused every
    // declared name, or that keyed on a name list rather than on the first
    // character, reds here.
    const diags = diagsOf(D1);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "lexical.md:15 + type-system.md:56 — a PascalCase declaration is conformant, enters the `TypeEnv`, and must keep deciding checks",
    ).toEqual([LET_RHS_MISMATCH]);
    expect(
      messageFor(diags, LET_RHS_MISMATCH),
      "code-registry-parse.md:59 — the rendered `<expected>` is the author's own conformant type name",
    ).toBe(
      msg(LET_RHS_MISMATCH, [
        ["<name>", "q"],
        ["<expected>", "Index"],
        ["<actual>", "integer"],
      ]),
    );
  });

  it("e2: an uppercase schema name in value position still decides its mismatch (wider-class record)", () => {
    // The report's group (e) record: an identifier reference to a schema name
    // mints a `named` from an author-chosen name, the `TypeEnv` resolves it
    // under TYPE-11, and the check reports a mismatch naming a type where a
    // value was expected. The name is PascalCase, so the fence does not reach
    // it — this row is the second direction of d1's pin, at a different arm.
    const diags = diagsOf(E2);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "type-system.md:56 — an uppercase declaration resolves at the identifier arm too, so both this mismatch and the value-position refusal stand",
    ).toEqual([LET_RHS_MISMATCH, "theta/parse/type-as-value"]);
    expect(
      messageFor(diags, LET_RHS_MISMATCH),
      "code-registry-parse.md:59 — the rendered `<actual>` is the conformant schema name the `TypeEnv` resolved",
    ).toBe(
      msg(LET_RHS_MISMATCH, [
        ["<name>", "m"],
        ["<expected>", "integer"],
        ["<actual>", "L"],
      ]),
    );
  });
});

// ===========================================================================
// (b) Legality and recovery controls — `index` is an ordinary author name.
// ===========================================================================

describe("0135 (b) — `index` is a legal author identifier at three positions, and the fence changes none of them", () => {
  it("b2: a declared `index` FIELD of type `array<string>` iterates cleanly (control)", () => {
    // The member arm now types a field access by the field's declared TYPE
    // rather than by its name, so this spec-legal loop draws nothing. The
    // report's b2 row recorded a `non-array-iterand` refusal here; that row is
    // stale — bug 0136's fix moved the member arm onto the field type, which is
    // why the row is carried here as a legality control rather than as a
    // rendered-string measurement.
    expect(
      codesOf(B2),
      "expressions.md — `p.index` is declared `array<string>`, so the iterand gate (src/parser/control-flow.ts:64–81) must admit it",
    ).toEqual([]);
  });

  it("b3: `index` is a legal schema FIELD name (control)", () => {
    expect(
      codesOf(B3),
      "lexical.md:16 — a schema field name requires a lowercase first letter, so `index` is conformant and draws no casing diagnostic",
    ).toEqual([]);
  });

  it("b4: `index` is a legal FUNCTION name and its call defers (control)", () => {
    expect(
      codesOf(B4),
      "lexical.md:16 + type-system.md:48 — a lowercase function name is conformant, and its call type is unresolvable so the typed binding defers",
    ).toEqual([]);
  });

  it("b5: a bound `index` iterand names its real recorded type (recovery control)", () => {
    // No route may coarsen this: a bound identifier reads its recorded binding
    // type, so the message names `integer` and not the identifier.
    const diags = diagsOf(B5);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "code-registry-parse.md:71 trigger — an `integer` iterand is not `array<T>`",
    ).toEqual([NON_ARRAY_ITERAND]);
    expect(
      messageFor(diags, NON_ARRAY_ITERAND),
      "placeholder-rendering-a.md:21 — a bound identifier's recorded type renders as the primitive spelling, which is conformant",
    ).toBe(msg(NON_ARRAY_ITERAND, [["<type>", "integer"]]));
  });
});

// ===========================================================================
// (a)/(b1)/(f1) The face-1 pins — the clause-admitted render, pinned byte-exact.
// ===========================================================================

describe("0135 face 1 — the engine-minted lowercase render stays reachable and is pinned unmoved", () => {
  // SCOPE: these four rows assert the PRE-EXISTING render, deliberately. The
  // admitting rule is bug 0247's eighth category-1 clause and its closed
  // undetermined-static-type table (placeholder-rendering-a.md), which reaches
  // `displayType`'s `named` arm returning an engine-minted lowercase name
  // verbatim (src/parser/type-compat.ts:368–382, the arm `:374–375`), and the
  // "0247 — the conformance oracle over the FACE-1 rows" describe above is what
  // scores these four rows against that table. Face 2's read-seam fence cannot
  // reach them because none of these sources contains a declaration for the
  // fence to refuse. They are held here so a render change that moved the bytes
  // without restating the clause reds instead of passing.
  it("a1: an UNRESOLVABLE receiver's index read still renders the fabricated name", () => {
    const diags = diagsOf(A1);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "type-system.md:48 — an unresolvable receiver keeps its deferral, and the iterand gate admits only `array<T>`",
    ).toEqual([NON_ARRAY_ITERAND]);
    expect(
      messageFor(diags, NON_ARRAY_ITERAND),
      "bug 0247's clause admits this render: the index arm's fabricated name (src/parser/static-type-inference.ts:294) reaches `<type>` with no declaration present, so the read-seam fence leaves it unchanged",
    ).toBe(msg(NON_ARRAY_ITERAND, [["<type>", "index"]]));
  });

  it("a2: an OBJECT receiver's index read still renders the fabricated name", () => {
    const diags = diagsOf(A2);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "type-system.md:54 TYPE-10 — an object-schema `named` stays nominal, so the receiver is not an `array` and the read falls to the fabricating arm",
    ).toEqual([NON_ARRAY_ITERAND]);
    expect(
      messageFor(diags, NON_ARRAY_ITERAND),
      "bug 0247's clause admits this render: the object-receiver reach carries no declaration either, so the read-seam fence leaves it unchanged",
    ).toBe(msg(NON_ARRAY_ITERAND, [["<type>", "index"]]));
  });

  it("b1: a legal `fn index()` call renders the author's own name at the same gate", () => {
    // The call arm (src/parser/static-type-inference.ts:296) mints a `named`
    // from the callee's name, which lexical.md:16 requires to be
    // lowercase-first — so this rendered string is byte-identical to a1's while
    // naming the author's code rather than an engine fabrication. Bug 0247's
    // clause admits this render because the closed table is keyed on rendered
    // bytes rather than on provenance; no declaration is present, so the fence
    // does not reach it.
    const diags = diagsOf(B1);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "code-registry-parse.md:71 trigger — the call's type is not `array<T>`, so the iterand gate refuses it",
    ).toEqual([NON_ARRAY_ITERAND]);
    expect(
      messageFor(diags, NON_ARRAY_ITERAND),
      "bug 0247's clause admits this render: a conformant lowercase FUNCTION name reaches `<type>` through the call arm, unchanged by the read-seam fence",
    ).toBe(msg(NON_ARRAY_ITERAND, [["<type>", "index"]]));
  });

  it("f1: the second engine fabrication renders at the same gate", () => {
    // `#typeExpr`'s object arm mints `named "object"` on the same pass. It
    // reaches the identical *Message*, so it is the row that shows face 1 is a
    // class rather than one name — and the row that reds if bug 0247's closed
    // table admitted one fabrication and not the other.
    const diags = diagsOf(F1);
    expect(
      diags.map((d: Diagnostic) => d.code),
      "code-registry-parse.md:71 trigger — the bare object literal is refused on its own ground, and its type is not `array<T>`",
    ).toEqual(["theta/parse/bare-object-literal", NON_ARRAY_ITERAND]);
    expect(
      messageFor(diags, NON_ARRAY_ITERAND),
      "bug 0247's clause admits this render: the object arm's fabricated name reaches `<type>` for the same reason the index arm's does",
    ).toBe(msg(NON_ARRAY_ITERAND, [["<type>", "object"]]));
  });
});

// The `join` code is asserted only through its absence above, so the constant is
// referenced here to keep the registry row's presence scored rather than left to
// a reader's assumption: a row this file names must exist (DIAG-2).
describe("0135 — registry presence for the code the fence removes from c1", () => {
  it("the `non-string-array-join` row is registered, so c1's expected absence is an absence and not a typo", () => {
    expect(
      msg(NON_STRING_JOIN, [["<element>", "integer"]]),
      "code-registry-parse.md:46 — the row c1 no longer draws must still be registered, or c1's one-code expectation would pass for the wrong reason",
    ).toContain("integer");
  });
});
