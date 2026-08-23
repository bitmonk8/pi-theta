import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { FnDecl, LetStmt, Stmt, ThetaDocument } from "../src/parser/theta-document";
import { parseTypeExpression, type TypePosition } from "../src/parser/type-grammar";
import * as typeLayerChecks from "../src/parser/type-layer-checks";
import { annotationToCompatType } from "../src/parser/type-layer-checks";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0124 — the three `Type` positions OUTSIDE a schema (a `let` annotation, an
// `fn` parameter type, an `fn` return type) capture their annotation as source
// text and never ask whether that text derives from `Type`. `parseType`
// (src/parser/theta-document.ts) is an EXTENT scanner: it joins the current
// token unconditionally (`:3240`) and breaks only on a closed stop set, and at
// these three positions that set is `stmt-sep`, a depth-0 `,` / `)` / `{` / `}` /
// `=`, and (return slot only) a depth-0 `with`. Twenty punctuation trailers, a
// string literal, and the leading / interior / doubled / spaced / bare spellings
// are in NO stop set, so each joins the captured string —
// `annotationToCompatType` (src/parser/type-layer-checks.ts) then maps the
// result to an opaque `{kind:"named"}` through its final arm, and the
// theta registers with its declared constraints unenforced
// (docs/bugs/0124-parsetype-trailing-punctuation-leniency.md).
//
// THE COST, MEASURED AT HEAD `dcff3f43` (v0.120.0) AND PINNED BELOW IN BOTH
// DIRECTIONS: eight registered error-severity rows stop firing —
// `let-rhs-type-mismatch`, `array-element-type-mismatch`, `unknown-method`,
// `non-boolean-condition`, `non-indexable-receiver`, `non-string-array-join`,
// `invoke-return-type-mismatch` (at a `subagent fn` return) and
// `fn-arg-type-mismatch` — and one row, `theta/parse/non-array-iterand`
// (src/parser/control-flow.ts:64, the code at `:76`), fires FALSELY for a
// declared array iterand with the captured junk rendered into its author-facing
// message (`got array<string>--`).
//
// THE GAP IS BETWEEN FOUR LOCALLY DEFENSIBLE DECISIONS. The capture decides
// EXTENT. `parseTypeExpression` (src/parser/type-grammar.ts:137) owns the type
// grammar and IS wired at all three positions (theta-document.ts's
// `walkStatement`: its `let` arm for the annotation, its `fn` parameter loop for
// the parameter type, its return slot for the return type)
// but is a POSITION-RULE pass — `void`, generic arity, `Result` — over the node
// its deliberately tolerant parser DID build (`parse()` does not require the
// token stream to be consumed, `:444`; `parsePrimary` skips unexpected
// punctuation by design, `:486`; `parseUnion` / `parseObject` end their loops on
// a failed arm or field, `:449` / `:533`). The converter's final arm exists for
// forms whose resolution is DEFERRED (a `NamedType`, an inline object type). The
// gates then read `kind`, and a `named` kind the `TypeEnv` cannot resolve means
// defer. No component is positioned to ask whether the author wrote a type.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/grammar.md:90–:95 — the closed `Type` production set;
//     `:97` `PrimitiveType`, `:98` `NamedType ::= Ident` (which is why
//     `integer--` is no `NamedType` and `thisisnotatype` IS one), `:99`–`:100`
//     `GenericType`, `:101` `ObjectType`, `:102` `LiteralType`; `:89`
//     `ReturnType ::= Type | "void"`; `:105` names `let` annotations and `fn`
//     parameter types among the bare-`Type` positions and adds "The grammar is
//     otherwise identical in every position"; `:77` (`LetStmt`), `:138`
//     (`FnDecl`), `:140` (`FnParam`).
//   - docs/spec_topics/type-system.md:15 — "The same type grammar applies in
//     every type-annotation position".
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:72 (DIAG-2 — the registry
//     is CLOSED, so the refusal needs a row, which is the fix's to mint) and
//     `:74` (DIAG-4 — the *Message* column is normative, which is why every
//     expected message in this file is READ from the registry at runtime and
//     none is restated).
//   - docs/spec_topics/diagnostics/placeholder-rendering-b.md:3 — category 5,
//     source-derived placeholders; `:5` lists `<name>` and `:10` gives its
//     rendering rule: identifier-shaped, "rendered unquoted", with any quoting
//     contributed by the surrounding registry template. A `let` binding name, an
//     `fn` parameter name and an `fn` name are all identifier-shaped per
//     docs/spec_topics/lexical.md, so the new row needs NO placeholder-table
//     edit and raises no GOV-7 / GOV-8 question.
//   - docs/spec_topics/governance/source-language-stability.md:9 (the
//     loads-cleanly predicate every refusal fixture below satisfies TODAY) and
//     `:25` (the diagnostic-registry carve-out, under which a code ADDITION is
//     in-scope for inputs newly brought into a code's emission set — so the new
//     row's *Trigger* prose IS the post-hoc in-scope set).
//
// THE PINNED POST-FIX CONTRACT. The refusal is raised at each of the three
// positions' own annotation walks, from ONE recogniser beside the converter —
// `annotationSourceIsNotTypeExpression` in src/parser/type-layer-checks.ts,
// which reuses bug 0059's / 0061's landed sink (`collectUnresolvedNamedTypes`'s
// fourth out-parameter `unspellable`, src/parser/body-type-lowering.ts:601)
// filtered through the ONE shared decline (`isUnspellableTextRefusable`,
// src/parser/params.ts) rather than carrying a private copy of the
// type-grammar judgement:
//   1. Text no `Type` production spells, at a `let` annotation, an `fn`
//      parameter type or an `fn` return type, draws EXACTLY ONE error-severity
//      `theta/parse/annotation-type-not-expression` rendering the offending
//      binding / parameter / function name, and the theta does not register
//      (group (a)).
//   2. Two spellings are NOT refused, and the bug document is WRONG about both:
//      `thisisnotatype` and `integer1` are `Ident`s, hence `NamedType`s
//      (grammar.md:98), hence derivable from `Type`. Refusing them would be the
//      honest-identity overreach bug 0044's fix removed at 0.54.0, and their
//      silence at these positions is `theta/parse/unresolved-named-type`'s
//      closed five-position list's question — bug 0051's, not this report's
//      (group (n)).
//   3. The eight suppressed rows fire again, because the refused annotation
//      supports no type verdict and every consumption site WITHHOLDS instead of
//      reading it: the `let` arm records the binding through
//      `recordWithheldBinders` (src/parser/type-layer-checks.ts) rather than as a
//      judged type, `walkFn` takes its existing unannotated-parameter branch,
//      `checkSubagentReturnAnnotation` returns early, and `checkFnCallArgs`
//      treats the callee's parameter type as absent.
//      The withhold machinery's emission direction is already closed — no
//      sibling row reports on a withheld read — so each junk-suffixed twin draws
//      the refusal ALONE and the count rule holds BY CONSTRUCTION (groups (l),
//      (i)).
//   4. An annotation whose own `parseTypeExpression` walk already drew an
//      error-severity diagnostic keeps that diagnostic ALONE — the per-annotation
//      guard, modelled on bug 0061's landed guard 1 (group (q)).
//   5. Grammar-admitted traffic keeps its BYTES and its silence at all three
//      positions (group (g)), the empty annotation is LEFT AS IT IS (group (h)),
//      and the four sibling positions this report does not own are byte-frozen
//      as the anti-widening fence (group (f)).
//
// ONE SPELLING IS REFUSED AT TWO OF THE THREE POSITIONS, NOT THREE, AND THE
// CAPTURE IS WHY. The `|` trailer is refused at a `let` annotation and at an
// `fn` parameter type, and NOT at the `fn` return slot: there the trailing `|`
// opens a union arm, so the capture absorbs the body and becomes `integer|{1}`,
// whose brace-carrying shard the ONE SHARED decline
// (`isUnspellableTextRefusable`, src/parser/params.ts) declines — the same
// mechanism that keeps `fn f(): integer< { 1 }` silent. This is the capture's
// asymmetry, not a per-position judgement: nothing the refusal adds
// distinguishes the three positions. Cells `a20 (let)`, `a20 (param)` and
// `a20 (return)` pin all three, the last one at HEAD's silence, so a fix that
// narrows the shared decline to reach it reds bug 0059's and bug 0061's landed
// refusals with it.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` call over a string (`parseDoc`,
// tests/helpers/e2e-s1.ts — the shipped front end wrapped in the standard inert
// deps double), one `parseTypeExpression` or `annotationToCompatType` call at its
// unit seam, one call of the recogniser at ITS seam, or one read of the committed
// registry pages. An integration or live tier cannot observe the subject more
// closely: the subject is which diagnostics a load emits for a given annotation
// text, fully determined before any turn runs. The registration consequence is
// reached the way the sibling unit locks reach it — by asserting the two
// properties the shipped drop gate reads, error severity and the `theta/parse/`
// namespace (`hasLoadParseError`,
// src/extension/production-composition.ts:2214; the registration test
// `!diagnostics.some((d) => d.severity === "error")` at `:1729`) — rather than by
// re-driving discovery, which witnesses nothing more. The ONE observable a unit
// row cannot reach, a real slash command that stops being created, is carried by
// the additive H8a cell in tests/live/live-production-acceptance.test.ts.
//
// THE BASELINE THIS FILE PINS IS HEAD, NOT THE BUG DOCUMENT. §Reproduction was
// measured at 0.71.0, fifty minors ago, and four of its rows do not re-derive:
//   - `theta/parse/fn-arg-type-mismatch` IS wired (bug 0050 fixed at 0.77.0), so
//     the doc's "no `src/` caller" is stale and the call site is an EIGHTH loss
//     class the doc could not measure (group (l), pair l8).
//   - `checkForIterand` gained a `TypeEnv` parameter (bug 0089 fixed at 0.72.0),
//     and `unfoldAlias` still returns an unresolvable `named` intact, so both
//     `non-array-iterand` rows re-derive exactly as the doc records them
//     (group (i)).
//   - The two schema positions and the `params:` scalar form now REFUSE (bugs
//     0059 at 0.86.0 and 0061 at 0.87.0), so the doc's group (f) contrast rows
//     have FLIPPED. Group (f) below pins the post-0061 sequences unchanged.
//   - `let a: Cat = 3` with `Cat` declared now draws
//     `theta/parse/let-rhs-type-mismatch` where the doc's group (g) records
//     `diags []`: a resolved `NamedType` is compat-checked against the RHS at
//     HEAD. Group (g) carries the HEAD reading, and that row doubles as the
//     proof that the `let` RHS gate is live for a name the environment resolves.
//
// WHAT IS RED HERE, AND WHY. Two distinct reasons, and each cell's title says
// which:
//   - RED (missing row) — group (r), group (s) and the placeholder cell need the
//     registry row and the exported recogniser, neither of which exists at HEAD.
//     The DIAG-4 reader and the seam reader FAIL LOUDLY naming exactly what is
//     absent; DIAG-2 makes minting the row part of the fix, not of this witness.
//   - RED (missing behaviour) — every refusal cell in groups (a), (l), (i) and
//     (e), because the annotation loads with ZERO diagnostics today and the
//     suppressed sibling rows stay suppressed.
// EVERYTHING ELSE IS GREEN AT HEAD AND MUST STAY GREEN: groups (n), (d), (g),
// (f), (h), (p), (q), (c) and (x) are the over-refusal fences, the guard
// baselines and the census. Group (f)'s four sibling positions and group (g)'s
// controls are the sharpest of them.
//
// NO SILENT SKIPPING: every reader THROWS, naming the absent intermediate, when
// the registry row, the recogniser export, the statement node or the captured
// annotation is missing. A fixture that never reached the position under test can
// never be mistaken for a pass.

// ===========================================================================
// The code this refusal needs, and its normative message (DIAG-2 / DIAG-4).
// ===========================================================================

/**
 * The row bug 0124's fix mints. DIAG-2 closes the registry, so the code string
 * is asserted here and the row is the fix's to add in the same commit as the
 * sites it is raised from. Five existing rows were assessed against this input
 * class and none fits as written: `theta/parse/increment-decrement` covers two
 * of twenty-two spellings and its *Message* and Hint are false for the rest;
 * `theta/parse/unresolved-named-type`'s *Trigger* names a closed five-position
 * list excluding all three positions here, and `integer--` is no `NamedType`
 * (grammar.md:98) — the overreach bug 0044's fix removed;
 * `theta/parse/malformed-alias-rhs` is scoped to a `schema X = …` declaration;
 * `theta/parse/unsupported-feature` renders `<construct>` from a CLOSED table;
 * and `theta/load/params-type-not-expression` excludes itself by phase, by
 * position and in its own text. Widening `theta/parse/schema-type-not-expression`
 * is rejected for the same honest-identity reason: its slug names schema
 * positions, and a `let` or `fn` position is neither.
 *
 * Registry rows are cited by CODE and page rather than by line throughout this
 * file: the fix inserts a row on `code-registry-parse.md` beside
 * `theta/parse/schema-type-not-expression` and shifts every later row's line,
 * which is exactly the citation drift bug 0061's review round 1 had to repair.
 */
const CODE = "theta/parse/annotation-type-not-expression";

interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** The live four-page sharded registry — the input tests/code-registry.test.ts reconciles. */
const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];

/**
 * A registry row's normative *Message* template (DIAG-4), read rather than
 * restated. THROWS, naming the missing row and the page it belongs on, so a
 * missing row can never degrade an assertion below into a comparison against
 * `undefined` and can never be silently replaced by a hard-coded string. Called
 * only from inside a test body: at module scope a throw would abort collection
 * and take the green over-refusal fences down with it.
 */
function registryMessageOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: the diagnostics code registry carries no Message row for ${code} — DIAG-4 ` +
        `(docs/spec_topics/diagnostics/diagnostic-shape.md:74) makes that column this file's ` +
        `only oracle, so a missing row is a loud harness failure, never a skip and never a ` +
        `hard-coded fallback. DIAG-2 (:72) makes minting the row part of bug 0124's fix, in the ` +
        `same commit as the sites it is raised from ` +
        `(docs/spec_topics/diagnostics/code-registry-parse.md, beside ` +
        `theta/parse/schema-type-not-expression)`,
    );
  }
  return template;
}

/** One structured registry row, or a loud failure naming the code. */
function registryRowOf(code: string): RegistryRow {
  const row = REGISTRY.find((r) => r.code === code);
  if (row === undefined) {
    throw new Error(
      `harness: the parsed registry holds no structured row for ${code}; DIAG-2 requires the ` +
        `code and its row to land together, so this refusal has no registry authority yet`,
    );
  }
  return row;
}

/** The `<…>` placeholders a template renders, in source order. */
function placeholdersOf(template: string): string[] {
  return template.match(/<[a-zA-Z][a-zA-Z0-9-]*>/g) ?? [];
}

/**
 * One `error <code>: <message>` line, rendering a registry template by explicit
 * slot substitution. Each slot's presence in the live template is asserted first,
 * so a reworded row reds by naming the slot instead of silently leaving an
 * unsubstituted placeholder in the expectation. Exact-set equality is NOT used:
 * several registered messages carry literal `array<T>` / `invoke<Schema>` text a
 * placeholder-shaped regex cannot distinguish from a slot.
 */
function line(code: string, subs: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessageOf(code);
  let out = template;
  for (const [slot, value] of subs) {
    expect(
      template,
      `DIAG-4: the ${code} row's Message must still carry the ${slot} slot this file renders; ` +
        `observed template ${JSON.stringify(template)}`,
    ).toContain(slot);
    out = out.replaceAll(slot, value);
  }
  return `error ${code}: ${out}`;
}

/** One `error <code>: <message>` line for a placeholder-free registry row. */
function plainLine(code: string): string {
  const template = registryMessageOf(code);
  expect(
    placeholdersOf(template),
    `DIAG-4: the ${code} row's Message renders no placeholder, so this file substitutes none; ` +
      `observed template ${JSON.stringify(template)}`,
  ).toEqual([]);
  return `error ${code}: ${template}`;
}

/** The refusal's rendered line for one offending binding / parameter / function name. */
function refusalLine(name: string): string {
  return line(CODE, [["<name>", name]]);
}

// ===========================================================================
// The recogniser seam, read defensively off its module.
// ===========================================================================

/**
 * The recogniser bug 0124's fix exports beside `annotationToCompatType`:
 * `annotationSourceIsNotTypeExpression(src: string): boolean`. Read off the
 * module NAMESPACE rather than as a named import so its absence at HEAD is a
 * loud failure inside the cells that need it, not a collection-time abort that
 * would take this file's green over-refusal fences down with it.
 *
 * THROWS, naming the export and the module, when it is absent — that loud
 * failure IS this group's red at HEAD.
 */
function recogniser(): (src: string) => boolean {
  const seam = (typeLayerChecks as unknown as Record<string, unknown>)[
    "annotationSourceIsNotTypeExpression"
  ];
  if (typeof seam !== "function") {
    throw new Error(
      `harness: src/parser/type-layer-checks.ts exports no ` +
        `annotationSourceIsNotTypeExpression — bug 0124's fix places the recogniser beside ` +
        `annotationToCompatType and threads it through the three annotation walks in ` +
        `theta-document.ts's walkStatement (the let arm, the fn parameter loop and the return ` +
        `slot, each beside that position's own parseTypeExpression call). Observed export ` +
        `${typeof seam}; this is a loud harness failure, never a skip`,
    );
  }
  return seam as (src: string) => boolean;
}

// ===========================================================================
// Fixtures and the loud readers.
// ===========================================================================

/** The three positions this report owns. */
type Position = "let" | "param" | "return";

/** `Cat` is declared in every body fixture; `Ghost` is declared nowhere. */
const DECLS = "schema Cat { a: string }\n";

/** The prompt-mode frontmatter prelude. */
const FM = "---\nmode: prompt\n---\n";

/** The identifier the refusal's `<name>` renders at each position. */
const SUBJECT: Record<Position, string> = { let: "a", param: "n", return: "f" };

/**
 * One annotation at one position, in a theta that is otherwise well-formed. The
 * `let` fixture's initialiser and the `fn` fixture's body are parameters because
 * a well-formed annotation constrains them (`array<integer>` needs `[1]`), and
 * because pinning HEAD's silence for a junk row must not be confounded with an
 * initialiser mismatch the annotation would earn even when spelled correctly.
 */
function srcAt(position: Position, typeSource: string, rhsOrBody?: string): string {
  switch (position) {
    case "let":
      return `${FM}${DECLS}let a: ${typeSource} = ${rhsOrBody ?? "3"}\na\n`;
    case "param":
      return `${FM}${DECLS}fn f(n: ${typeSource}): integer { ${rhsOrBody ?? "1"} }\nlet inert = 1\ninert\n`;
    case "return":
      return `${FM}${DECLS}fn f(): ${typeSource} { ${rhsOrBody ?? "1"} }\nlet inert = 1\ninert\n`;
  }
}

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/**
 * Every diagnostic rendered `<severity> <code>`, in emission order — the
 * REGISTRY-FREE half of a refusal expectation. Asserted BEFORE the rendered
 * message on every refusal cell so the red at HEAD names the symptom the bug
 * reports (an annotation that draws nothing at all) rather than the absent
 * registry row, which is a separate, separately-titled red.
 */
function diagCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}`);
}

/** The statement kinds a parse produced — failure-message payload. */
function stmtKinds(doc: ThetaDocument): string[] {
  return doc.body.statements.map((s) => s.kind);
}

/** The sole `let` statement bound to `name`, loud when the body declares none. */
function letStmtOf(label: string, doc: ThetaDocument, name: string): LetStmt {
  const hit = doc.body.statements.find(
    (s): s is LetStmt => s.kind === "let" && (s as LetStmt).name === name,
  );
  if (hit === undefined) {
    throw new Error(
      `${label}: the body declares no \`let ${name}\`, so no annotation reached the position ` +
        `under test; statement kinds ${JSON.stringify(stmtKinds(doc))}, diagnostics ` +
        `${JSON.stringify(diagLines(doc))}`,
    );
  }
  return hit;
}

/** The sole `fn` declaration named `name`, loud when the body declares none. */
function fnDeclOf(label: string, doc: ThetaDocument, name: string): FnDecl {
  const hit = doc.body.statements.find(
    (s): s is FnDecl => s.kind === "fn" && (s as FnDecl).name === name,
  );
  if (hit === undefined) {
    throw new Error(
      `${label}: the body declares no \`fn ${name}\`, so no annotation reached the position ` +
        `under test; statement kinds ${JSON.stringify(stmtKinds(doc))}, diagnostics ` +
        `${JSON.stringify(diagLines(doc))}`,
    );
  }
  return hit;
}

/**
 * The annotation text one position actually captured, loud on every way a
 * fixture can fail to reach the capture. Without this the diagnostic assertions
 * below could pass against a parse that never handed the position any text.
 */
function capturedAt(
  label: string,
  doc: ThetaDocument,
  position: Position,
  fnName = "f",
  bindingName = "a",
): string {
  if (position === "let") {
    const stmt = letStmtOf(label, doc, bindingName);
    if (stmt.annotation === null) {
      throw new Error(
        `${label}: \`let ${bindingName}\` carries no annotation at all, so the \`let\` position was never ` +
          `handed the text under test; diagnostics ${JSON.stringify(diagLines(doc))}`,
      );
    }
    return stmt.annotation;
  }
  const fn = fnDeclOf(label, doc, fnName);
  if (position === "param") {
    const first = fn.params[0];
    if (first === undefined) {
      throw new Error(
        `${label}: \`fn ${fnName}\` captured no parameter, so the parameter position was never ` +
          `handed the text under test; diagnostics ${JSON.stringify(diagLines(doc))}`,
      );
    }
    return first.type;
  }
  if (fn.returnType === null) {
    throw new Error(
      `${label}: \`fn ${fnName}\` captured no return type, so the return position was never ` +
        `handed the text under test; diagnostics ${JSON.stringify(diagLines(doc))}`,
    );
  }
  return fn.returnType;
}

/**
 * The capture the extent scanner produces for a well-behaved annotation: the
 * source text with its inter-token whitespace dropped (`parts.join("")`, the
 * tail of `parseType` in theta-document.ts). Asserted as a PRECONDITION on every
 * row so a cell whose fixture stopped reaching the position reds by naming the
 * capture rather than by an opaque diagnostic mismatch.
 */
function joinedCapture(typeSource: string): string {
  return typeSource.replaceAll(" ", "");
}

/**
 * The whole refusal contract for one annotation: EXACTLY ONE diagnostic, the
 * registered code at error severity in the `theta/parse/` namespace, rendering
 * the offending binding / parameter / function name, with the capture unmoved.
 *
 * The count is part of the contract: the per-annotation guard plus the withhold
 * mean an offending annotation gains one diagnostic and no cascade.
 */
function expectRefused(
  label: string,
  position: Position,
  typeSource: string,
  opts: {
    readonly rhsOrBody?: string;
    readonly capture?: string;
    readonly file?: string;
    readonly source?: string;
    readonly subject?: string;
    readonly fnName?: string;
  } = {},
): void {
  const src = opts.source ?? srcAt(position, typeSource, opts.rhsOrBody);
  const doc = parseDoc(src, opts.file ?? "bug0124.theta");
  const fnName = opts.fnName ?? "f";
  expect(
    capturedAt(label, doc, position, fnName),
    `${label}: PRECONDITION — the extent scanner must have joined the junk INTO the annotation, ` +
      `which is what puts this text in front of the judgement (theta-document.ts:3240)`,
  ).toBe(opts.capture ?? joinedCapture(typeSource));
  expect(
    diagCodes(doc),
    `${label}: the text derives from none of the six \`Type\` alternatives ` +
      `(grammar.md:90–:95) and grammar.md:105 makes the grammar identical in every position, so ` +
      `the honest disposition is refusal with exactly ONE error-severity ${CODE} — no cascade, ` +
      `and no silence. Rendered diagnostics: ${JSON.stringify(diagLines(doc))}, statement kinds ` +
      `${JSON.stringify(stmtKinds(doc))}`,
  ).toEqual([`error ${CODE}`]);
  expect(
    diagLines(doc),
    `${label}: DIAG-4 — the emission renders the registry row's template with the offending ` +
      `declaration's identifier substituted for \`<name>\`, unquoted, the template's own quotes ` +
      `supplying the quoting (placeholder-rendering-b.md:10)`,
  ).toEqual([refusalLine(opts.subject ?? SUBJECT[position])]);
  expectBlocksRegistration(label, doc.diagnostics);
}

/**
 * The predicate `hasLoadParseError`
 * (src/extension/production-composition.ts:2214) computes, evaluated over the
 * diagnostics this fixture actually emitted. This is the reachability link
 * between the refusal and a theta that does not register: without an
 * error-severity `theta/load/` or `theta/parse/` diagnostic the drop arm is not
 * taken and the theta ships with its declared constraints unenforced.
 */
function expectBlocksRegistration(label: string, diagnostics: readonly Diagnostic[]): void {
  expect(
    diagnostics.filter(
      (d) =>
        d.severity === "error" &&
        (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")),
    ).length,
    `${label}: the drop gate reads error severity AND the \`theta/load/\` / \`theta/parse/\` ` +
      `namespaces; a warning-severity or differently-namespaced refusal would leave the theta ` +
      `registered with the annotation unenforced. Observed diagnostics: ` +
      `${JSON.stringify(diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`))}`,
  ).toBeGreaterThan(0);
}

/** One annotation at one position, pinned at an exact diagnostic sequence. */
function expectSequence(
  label: string,
  position: Position,
  typeSource: string,
  expected: readonly string[],
  opts: {
    readonly rhsOrBody?: string;
    readonly capture?: string;
    readonly file?: string;
    readonly source?: string;
    readonly fnName?: string;
    readonly why?: string;
  } = {},
): void {
  const src = opts.source ?? srcAt(position, typeSource, opts.rhsOrBody);
  const doc = parseDoc(src, opts.file ?? "bug0124.theta");
  expect(
    capturedAt(label, doc, position, opts.fnName ?? "f"),
    `${label}: PRECONDITION — the position must actually have been handed this text`,
  ).toBe(opts.capture ?? joinedCapture(typeSource));
  expect(
    diagLines(doc),
    `${label}: ${opts.why ?? "pinned byte-for-byte"}. Statement kinds ` +
      `${JSON.stringify(stmtKinds(doc))}`,
  ).toEqual(expected);
}

// ===========================================================================
// (r) The registry row every message in this file is derived from.
// RED (missing row) at HEAD — DIAG-2 makes minting the row part of the fix.
// ===========================================================================

describe("bug 0124 (r) — the registry row this refusal needs", () => {
  it(`RED (r1, missing row): the registry carries a row for ${CODE}`, () => {
    // DIAG-2 (diagnostic-shape.md:72) closes the registry: a diagnostic with no
    // row has no authority to exist, and a row with no asserting test fails the
    // same gate from the other side (tests/code-registry.test.ts). This file is
    // the asserting test; the row is the fix's to land in the same commit as the
    // three sites it is raised from.
    const row = registryRowOf(CODE);
    expect(
      row.namespace,
      "the judgement is made while parsing the body, so it lives in the `parse` namespace — " +
        "which is also what `hasLoadParseError` reads to withhold registration",
    ).toBe("parse");
    expect(
      row.severity,
      "source-language-stability.md:9 reads effective severity off the *Severity* column; a `W` " +
        "row would leave the annotation unenforced with a note attached",
    ).toBe("E");
    expect(row.phase, "the judgement is made during the body parse, not at runtime").toBe("parse");
  });

  it("RED (r2, missing row): the *Message* carries the name slot and no junk-text slot", () => {
    // The placeholder SET is pinned, not merely the slot's presence: `<name>` is
    // category 5's identifier-shaped, unquoted placeholder
    // (placeholder-rendering-b.md:5, :10) and needs no table edit, whereas a
    // junk-TEXT placeholder would be admissible under no category of a CLOSED
    // surface and would raise the GOV-7 / GOV-8 question bug 0061's fix record
    // rejected `<text>` over. Pinning the set here is what makes a later
    // junk-text placeholder red instead of passing silently.
    const template = registryMessageOf(CODE);
    expect(
      placeholdersOf(template),
      "the row renders exactly one placeholder — the offending declaration's identifier — so a " +
        "two-fragment annotation could never be distinguished by message text, only by count",
    ).toEqual(["<name>"]);
  });

  it("RED (r3, missing row): the rendered message differs per subject name", () => {
    // Anti-vacuity for `refusalLine`: a template that ignored its slot would
    // make every message assertion in group (a) trivially satisfiable.
    expect(refusalLine("a")).not.toBe(refusalLine("n"));
    expect(refusalLine("n")).not.toBe(refusalLine("f"));
  });
});

// ===========================================================================
// (s) The recogniser seam — the answers §Fix constraints 2 and 3 pin, and the
// position-level shred decline the emission point cannot be sound without.
// RED (missing export) at HEAD.
// ===========================================================================

describe("bug 0124 (s) — the recogniser's own answers at its unit seam", () => {
  it("RED (s1, missing export): a junk-suffixed source is refused", () => {
    // Anti-vacuity for the whole group: a recogniser that answered `false`
    // everywhere would satisfy s2–s4 and refuse nothing.
    expect(
      recogniser()("integer--"),
      "`integer--` fails PRIMITIVE_NAMES on the `-`, fails the array regex on the trailing " +
        "bytes, and is no `Ident` (grammar.md:98) — it derives from no `Type` alternative",
    ).toBe(true);
  });

  it("RED (s2, missing export): the two `Ident`-shaped spellings are NOT refused", () => {
    // The bug document is wrong about both (§Kind and §Fix (f)(2) list
    // `thisisnotatype` as "derivable from none of the six alternatives"). Both
    // are `Ident`s, hence `NamedType`s (grammar.md:98), hence derivable from
    // `Type`; refusing them is the honest-identity overreach bug 0044's fix
    // removed at 0.54.0, and their silence is bug 0051's question.
    const isNotType = recogniser();
    for (const [text, why] of [
      ["thisisnotatype", "the prose spelling is one `Ident` after the capture drops the spaces"],
      ["integer1", "the number-literal trailer leaves an `Ident`, as the doc's own group (f) records"],
      ["Cat", "a resolvable `NamedType`"],
      ["Ghost", "an unresolvable `NamedType` — resolution is not this judgement's business"],
    ] as const) {
      expect(isNotType(text), `\`${text}\` must not be refused: ${why}`).toBe(false);
    }
  });

  it("RED (s3, missing export): the empty source is not refused", () => {
    // §Fix constraint 3 leaves the empty annotation as it is. All three call
    // sites already guard on `length > 0`; the recogniser answers `false`
    // defensively so no future caller can flip the disposition silently.
    expect(
      recogniser()(""),
      "`let a: = 3` captures the empty string, which is a separate answer this fix does not give",
    ).toBe(false);
  });

  it("RED (s4, missing export): the shred declines refuse nothing", () => {
    // MANDATORY AND SOUND: the shared traversal's generic-argument and union
    // splits track ANGLE depth (and, inside an inline object, brace depth) but
    // never BRACKET depth, so a source carrying both a brace and an angle
    // bracket can hand the sink a SHARD of a group the author wrote as one unit
    // — text no author wrote. Measured at HEAD: `Result<{a: string, b: integer,
    // c: boolean}, QueryError>` shreds to `["{a: string", "b: integer",
    // "c: boolean}"]`, and the brace-free middle shard `b: integer` IS
    // refusable. Without the decline the fix falsely refuses that LEGAL
    // annotation and reds bug 0028's witness
    // (tests/unresolved-annotation-lowering.test.ts, RESULT-LET-BRACE).
    const isNotType = recogniser();
    for (const text of [
      "Result<{a: string, b: integer, c: boolean}, QueryError>",
      "array<{a: string, b: integer, c: boolean}>",
      "Result<{a:string,b:integer,c:boolean},QueryError>",
      "array<{a:string,b:integer,c:boolean}>",
    ]) {
      expect(
        isNotType(text),
        `\`${text}\` is a LEGAL annotation whose brace group the angle-only split shreds; the ` +
          `decline can only ever refuse LESS than the sibling rows do, never more`,
      ).toBe(false);
    }
  });
});

// ===========================================================================
// (a) THE DEFECT — §Fix constraint 2's refused set, at all three positions.
// RED (missing behaviour) at HEAD: every cell loads with ZERO diagnostics.
// ===========================================================================

const POSITIONS: readonly Position[] = ["let", "param", "return"];

/**
 * The twenty punctuation trailers, minus `|`, which is split out below because
 * its RETURN-slot capture behaves differently for a reason this fix does not
 * introduce.
 */
const TRAILERS: readonly string[] = [
  "--",
  "++",
  "-",
  "+",
  "%",
  "*",
  "/",
  ".",
  "==",
  "&&",
  "||",
  "?",
  "!",
  ":",
  "~",
  "^",
  "@",
  "#",
  "$",
];

describe("bug 0124 (a) — the punctuation trailers are refused at all three positions", () => {
  for (const [index, trailer] of TRAILERS.entries()) {
    const typeSource = `integer${trailer}`;
    for (const position of POSITIONS) {
      it(`RED (a${index + 1}, ${position}): \`${typeSource}\` draws exactly one ${CODE}`, () => {
        expectRefused(`a${index + 1} (${position}, ${typeSource})`, position, typeSource);
      });
    }
  }

  // The `|` trailer, split out. At the `let` and parameter positions its capture
  // ends at the structural stop and the fragment `integer|` is refusable; at the
  // RETURN slot the trailing `|` opens a union arm, so `parseType`'s arm-start
  // brace handling absorbs the BODY and the capture becomes `integer|{1}`.
  // That capture shreds to `integer` plus `{1}`, and the brace-carrying shard is
  // declined by the ONE SHARED decline (`isUnspellableTextRefusable`,
  // src/parser/params.ts) — the same decline that keeps
  // `fn f(): integer< { 1 }` silent in group (e). NOTHING THIS FIX ADDS
  // DISTINGUISHES THE THREE POSITIONS; the capture does.
  it("RED (a20, let): `integer|` draws exactly one refusal", () => {
    expectRefused("a20 (let, integer|)", "let", "integer|");
  });

  it("RED (a20, param): `integer|` draws exactly one refusal", () => {
    expectRefused("a20 (param, integer|)", "param", "integer|");
  });

  it("RED (a20, return): `integer|`'s absorbed brace shard now draws bug 0244's refusal", () => {
    // The capture is `integer|{1}`, not `integer|`: the return slot's `|` takes
    // the body into the annotation. The brace-carrying shard `{ 1 }` is
    // declined by the shared brace decline (`isUnspellableTextRefusable`,
    // src/parser/params.ts), which is why this cell reports `[]` — GREEN at
    // HEAD `537c274c`. The same shard is a KEYLESS inline-object entry (`1`
    // spells no top-level `:`) reached at a `Type` position through that
    // decline's recursive parse, so bug 0244's operator-adjudicated scoping
    // refuses it too — an ADDED diagnostic, not a narrowing of the decline
    // (bug 0059's and bug 0061's refusals are untouched; see groups (d)/(e)
    // there). Flip observed under this change; not re-argued at any other cell.
    const label = "a20 (return, integer|)";
    const doc = parseDoc(srcAt("return", "integer|", "1"), "bug0124.theta");
    // Since bug 0228's fix the absorbed `{ 1 }` body is a raw slice of the
    // author's own source bytes rather than a joined one, so its interior
    // spacing survives too.
    expect(
      capturedAt(label, doc, "return"),
      `${label}: PRECONDITION — the trailing \`|\` opens a union arm, so the body joins the ` +
        `capture and the judged text carries a brace`,
    ).toBe("integer|{ 1 }");
    expect(
      stmtKinds(doc),
      `${label}: the capture absorbs the body and the following statements, unchanged by this fix`,
    ).toEqual(["schema", "fn"]);
    expect(
      diagLines(doc),
      `${label}: bug 0244 (operator adjudication) refuses the absorbed brace shard's keyless ` +
        `entry \`1\` with \`theta/parse/malformed-schema-field\`; a red reporting \`[]\` here is a ` +
        `route that lost that refusal, and a red reporting a DIFFERENT code is a route that ` +
        `widened the shared brace decline itself, which bug 0059's and bug 0061's landed ` +
        `refusals must not move`,
    ).toEqual([
      "error theta/parse/malformed-schema-field: malformed schema field; each field is 'name: " +
        "Type' or 'name as \"WireName\": Type'",
    ]);
  });
});

/**
 * §Fix constraint 2's remaining spellings: the string-literal trailer, the
 * leading / interior / doubled / spaced / bare spellings, and the same text ONE
 * LEVEL DOWN inside a generic argument, a union arm and a single-enclosing
 * inline object field. Each row carries its own `let` initialiser where a
 * well-formed reading of the annotation would constrain it.
 */
const SPELLING_ROWS: ReadonlyArray<{
  readonly label: string;
  readonly typeSource: string;
  /** Only where a WELL-FORMED reading of the annotation would constrain it. */
  readonly rhsOrBody?: string;
  /**
   * Only where the default `joinedCapture` (strip every space) is wrong for
   * this row: since bug 0228's fix an inline `ObjectType` brace group is a
   * raw slice of the author's own source bytes rather than a joined one, so a
   * row whose whole `typeSource` IS a brace group keeps its interior spacing
   * verbatim.
   */
  readonly capture?: string;
}> = [
  { label: "a21 (string-literal trailer)", typeSource: 'integer"x"' },
  { label: "a22 (leading)", typeSource: "--integer" },
  { label: "a23 (interior)", typeSource: "int--eger" },
  { label: "a24 (doubled)", typeSource: "integer--%%" },
  { label: "a25 (spaced)", typeSource: "integer --" },
  { label: "a26 (bare)", typeSource: "--" },
  // The generic application IS recognised and the junk becomes its ELEMENT
  // type, so a well-formed reading of the annotation constrains the `let`
  // initialiser to an array. Without `[1]` this row's HEAD reading would carry
  // an initialiser mismatch and the red would not name the missing refusal.
  { label: "a27 (generic argument)", typeSource: "array<integer-->", rhsOrBody: "[1]" },
  { label: "a28 (union arm, first)", typeSource: "integer-- | string" },
  { label: "a29 (union arm, second)", typeSource: "integer | string--" },
  {
    label: "a30 (inline object field)",
    typeSource: "{ b: integer-- }",
    // The whole `typeSource` IS the brace group, so bug 0228's fix captures it
    // verbatim rather than joined.
    capture: "{ b: integer-- }",
  },
  // The registry row's *Trigger* states the number-literal trailer as refused
  // only "where the joined capture is not `Ident`-shaped", which makes this row
  // and `n2` below a PAIR: `integer1` joins to one `Ident` and stays silent,
  // `integer1.5` carries the `.` and does not. Without both cells the
  // qualification is prose no test holds, and a change to the shape test would
  // move one side silently.
  { label: "a35 (number-literal trailer, not `Ident`-shaped)", typeSource: "integer1.5" },
  // TWO junk arms, ONE diagnostic — the *Trigger*'s count rule, which is where
  // this row differs from `theta/parse/schema-type-not-expression`'s (that row
  // judges a FRAGMENT and renders one diagnostic per offending fragment; this
  // one judges the WHOLE captured annotation and names its binder). `a28` and
  // `a29` each carry one junk arm, so neither can distinguish the two count
  // rules; this row can.
  { label: "a36 (two junk union arms, one diagnostic)", typeSource: "integer-- | string--" },
];

describe("bug 0124 (a) — the leading, interior, doubled, spaced, bare and nested spellings", () => {
  for (const row of SPELLING_ROWS) {
    for (const position of POSITIONS) {
      it(`RED (${row.label}, ${position}): \`${row.typeSource}\` draws exactly one ${CODE}`, () => {
        expectRefused(`${row.label} (${position})`, position, row.typeSource, {
          ...(row.rhsOrBody === undefined ? {} : { rhsOrBody: row.rhsOrBody }),
          ...(row.capture === undefined ? {} : { capture: row.capture }),
        });
      });
    }
  }
});

describe("bug 0124 (a) — the `.thetalib` spelling and the `subagent fn` / `with` form", () => {
  // A `.thetalib` carries no frontmatter and admits no top-level statement
  // (`theta/parse/thetalib-top-level-statement`), so the library spelling is
  // witnessed at the two `fn` positions. grammar.md:105's "the grammar is
  // otherwise identical in every position" is what makes the extension
  // irrelevant to the judgement.
  it("RED (a31, .thetalib param): a library `fn` parameter type is refused the same way", () => {
    expectRefused("a31 (.thetalib param)", "param", "integer--", {
      source: `${DECLS}fn f(n: integer--): integer { 1 }\n`,
      file: "bug0124.thetalib",
    });
  });

  it("RED (a32, .thetalib return): a library `fn` return type is refused the same way", () => {
    expectRefused("a32 (.thetalib return)", "return", "integer--", {
      source: `${DECLS}fn f(): integer-- { 1 }\n`,
      file: "bug0124.thetalib",
    });
  });

  it("RED (a33, subagent fn / with, param): the with-clause form's parameter type is refused", () => {
    // functions.md:50 makes a `subagent fn` identical to an ordinary `fn` in
    // every particular the type layer reads, and the `with` clause is a
    // depth-0 stop for the RETURN slot only (bug 0005 (a)) — neither changes
    // which text the parameter position captured.
    expectRefused("a33 (subagent fn param)", "param", "integer--", {
      source:
        '---\nmode: subagent\n---\nsubagent fn g(n: integer--): integer with { model: "x" } ' +
        "{ 1 }\nlet inert = 1\ninert\n",
      fnName: "g",
      subject: "n",
    });
  });

  it("RED (a34, subagent fn / with, return): the with-clause form's return type is refused", () => {
    expectRefused("a34 (subagent fn return)", "return", "integer--", {
      source:
        '---\nmode: subagent\n---\nsubagent fn g(): integer-- with { model: "x" } { 1 }\n' +
        "let inert = 1\ninert\n",
      fnName: "g",
      subject: "g",
    });
  });
});

// ===========================================================================
// (n) THE TWO SPELLINGS THE BUG DOCUMENT IS WRONG ABOUT. GREEN at HEAD and
// required to stay green — refusing either is bug 0044's overreach and bug
// 0051's question, not this report's claim.
// ===========================================================================

describe("bug 0124 (n) — the `Ident`-shaped spellings keep their silence", () => {
  for (const [id, typeSource, why] of [
    [
      "n1",
      "thisisnotatype",
      "the capture drops the inter-token whitespace, so the prose spelling arrives as ONE " +
        "`Ident` — and `NamedType ::= Ident` (grammar.md:98) derives it from `Type`. The bug " +
        "document's §Kind and §Fix (f)(2) both list it as derivable from none of the six " +
        "alternatives; both are wrong. Its silence at these positions is " +
        "`theta/parse/unresolved-named-type`'s closed five-position list's question, which " +
        "bug 0124 §Non-goals hands to bug 0051",
    ],
    [
      "n2",
      "integer1",
      "a number-literal trailer on an identifier leaves an `Ident`, exactly as the bug " +
        "document's own group (f) records for the schema position — where it draws " +
        "`unresolved-named-type` because THAT position runs a name walk and these three do not",
    ],
  ] as const) {
    for (const position of POSITIONS) {
      it(`GREEN (${id}, ${position}): \`${typeSource}\` draws no diagnostic`, () => {
        expectSequence(`${id} (${position}, ${typeSource})`, position, typeSource, [], {
          why: `refusing this spelling would re-open the honest-identity overreach bug 0044's ` +
            `fix removed at 0.54.0 — ${why}`,
        });
      });
    }
  }
});

// ===========================================================================
// (l) THE LOSS INVENTORY, RE-DERIVED AT HEAD — eight registered error-severity
// rows, each measured firing for the well-formed annotation and silent for the
// junk-suffixed twin. The controls are GREEN; every twin is RED (missing
// behaviour) and must draw the refusal ALONE, which is the withhold's job.
// ===========================================================================

/** One loss class: the control that fires today, and the twin that reports nothing. */
interface LossPair {
  readonly id: string;
  readonly code: string;
  /** The control's whole diagnostic sequence, rendered from the registry. */
  readonly control: () => readonly string[];
  readonly controlSrc: string;
  readonly twinSrc: string;
  /** The `<name>` the twin's refusal renders. */
  readonly subject: string;
  readonly why: string;
}

const LOSS_PAIRS: readonly LossPair[] = [
  {
    id: "l1 (let-rhs-type-mismatch)",
    code: "theta/parse/let-rhs-type-mismatch",
    control: () => [
      line("theta/parse/let-rhs-type-mismatch", [
        ["<name>", "a"],
        ["<expected>", "integer"],
        ["<actual>", "string"],
      ]),
    ],
    controlSrc: `${FM}let a: integer = "x"\na\n`,
    twinSrc: `${FM}let a: integer-- = "x"\na\n`,
    subject: "a",
    why: "the `let` arm converts the annotation once and uses it both for `checkLetRhsCompat` " +
      "(its sole call site in type-layer-checks.ts) and as the recorded binding type (bug 0083)",
  },
  {
    id: "l2 (array-element-type-mismatch)",
    code: "theta/parse/array-element-type-mismatch",
    control: () => [
      line("theta/parse/let-rhs-type-mismatch", [
        ["<name>", "a"],
        ["<expected>", "array<string>"],
        ["<actual>", "array<integer>"],
      ]),
      line("theta/parse/array-element-type-mismatch", [
        ["<i>", "0"],
        ["<expected>", "string"],
        ["<actual>", "integer"],
      ]),
    ],
    controlSrc: `${FM}let a: array<string> = [1]\na\n`,
    twinSrc: `${FM}let a: array<string>-- = [1]\na\n`,
    subject: "a",
    why: "the array-element sink reads the SAME converted annotation, so the trailer takes both " +
      "rows at once",
  },
  {
    id: "l3 (unknown-method)",
    code: "theta/parse/unknown-method",
    control: () => [
      line("theta/parse/unknown-method", [
        ["<method>", "length"],
        ["<type>", "integer"],
      ]),
    ],
    controlSrc: `${FM}let a: integer = 3\nlet b = a.length\nb\n`,
    twinSrc: `${FM}let a: integer-- = 3\nlet b = a.length\nb\n`,
    subject: "a",
    why: "bug 0083's fix records the annotation as the binding's type, so the opacity outlives " +
      "the declaring statement and reaches every later use",
  },
  {
    id: "l4 (non-boolean-condition)",
    code: "theta/parse/non-boolean-condition",
    control: () => [line("theta/parse/non-boolean-condition", [["<type>", "integer"]])],
    controlSrc: `${FM}let a: integer = 3\nif a { 1 } else { 2 }\n`,
    twinSrc: `${FM}let a: integer-- = 3\nif a { 1 } else { 2 }\n`,
    subject: "a",
    why: "the condition classifier reads the recorded binding type",
  },
  {
    id: "l5 (non-indexable-receiver)",
    code: "theta/parse/non-indexable-receiver",
    control: () => [line("theta/parse/non-indexable-receiver", [["<type>", "integer"]])],
    controlSrc: `${FM}let a: integer = 3\nlet b = a[0]\nb\n`,
    twinSrc: `${FM}let a: integer-- = 3\nlet b = a[0]\nb\n`,
    subject: "a",
    why: "the index-receiver classifier reads the recorded binding type",
  },
  {
    id: "l6 (non-string-array-join)",
    code: "theta/parse/non-string-array-join",
    control: () => [line("theta/parse/non-string-array-join", [["<element>", "integer"]])],
    controlSrc: `${FM}let a: array<integer> = [1]\nlet b = a.join(",")\nb\n`,
    twinSrc: `${FM}let a: array<integer>-- = [1]\nlet b = a.join(",")\nb\n`,
    subject: "a",
    why: "the `join` guard tests `targetType.kind === \"array\"`, and the trailer makes the kind " +
      "`named`",
  },
  {
    id: "l7 (invoke-return-type-mismatch, subagent fn return)",
    code: "theta/parse/invoke-return-type-mismatch",
    control: () => [
      line("theta/parse/invoke-return-type-mismatch", [
        ["<callee>", "g"],
        ["<actual>", "string"],
      ]),
    ],
    controlSrc: '---\nmode: subagent\n---\nsubagent fn g(): integer { "x" }\nlet inert = 1\ninert\n',
    twinSrc: '---\nmode: subagent\n---\nsubagent fn g(): integer-- { "x" }\nlet inert = 1\ninert\n',
    subject: "g",
    why: "`checkSubagentReturnAnnotation` (type-layer-checks.ts) is the ONLY consumer of an " +
      "`fn` return annotation as a `CompatType` — an ordinary `fn`'s return annotation is not " +
      "compat-checked at HEAD, which is why the return position's measured loss is confined to " +
      "the `subagent fn` form",
  },
  {
    // The bare `integer--` scalar above (l7) converts to an unresolvable `named`
    // type, and `decide` (type-compat.ts) answers `"unknown"` for an unresolvable
    // `named` on EITHER side of an array/object sink — so l7's twin is silent
    // whether or not the boundary guard runs, and cannot witness the guard. One
    // level down inside a `GenericType` argument the junk becomes the ELEMENT of
    // an `array` OUTER shape (`annotationToCompatType`'s regex arm matches the
    // whole capture regardless of what the argument holds), and `⊑`'s array arm
    // decides `array` against the body's inferred `string` payload on that OUTER
    // shape BEFORE it ever inspects the unresolvable element (TYPE-7,
    // type-compat.ts) — the one structural path an unresolvable `named` cannot
    // mask. This is the cell that reds when `checkSubagentReturnAnnotation`'s own
    // guard is neutralised and greens again when it is restored (see the fixer
    // round's verbatim report for the neutralise/restore/hash-verify cycle).
    id: "l7b (invoke-return-type-mismatch, subagent fn return, array-wrapped — the ONE shape l7's bare scalar cannot witness)",
    code: "theta/parse/invoke-return-type-mismatch",
    control: () => [
      line("theta/parse/invoke-return-type-mismatch", [
        ["<callee>", "g"],
        ["<actual>", "string"],
      ]),
    ],
    controlSrc:
      '---\nmode: subagent\n---\nsubagent fn g(): array<integer> { "x" }\nlet inert = 1\ninert\n',
    twinSrc:
      '---\nmode: subagent\n---\nsubagent fn g(): array<integer--> { "x" }\nlet inert = 1\ninert\n',
    subject: "g",
    why: "the junk sits one level down inside the `array<…>` argument, so the CONVERTED " +
      "annotation still carries the outer `array` kind and `decide` (type-compat.ts) answers " +
      "the array/string mismatch structurally on that outer kind before it ever inspects the " +
      "unresolvable element — the one shape l7's bare `integer--` cannot reach, because an " +
      "unresolvable `named` there answers `\"unknown\"` and defers instead of deciding",
  },
  {
    id: "l8 (fn-arg-type-mismatch — the EIGHTH class the bug document could not measure)",
    code: "theta/parse/fn-arg-type-mismatch",
    control: () => [
      line("theta/parse/fn-arg-type-mismatch", [
        ["<name>", "f"],
        ["<i>", "0"],
        ["<param>", "n"],
        ["<expected>", "integer"],
        ["<actual>", "string"],
      ]),
    ],
    controlSrc: `${FM}fn f(n: integer): integer { 1 }\nlet a = f("x")\na\n`,
    twinSrc: `${FM}fn f(n: integer--): integer { 1 }\nlet a = f("x")\na\n`,
    subject: "n",
    why: "bug 0050 is FIXED (0.77.0), so `checkFnArgCompat` IS wired and the bug document's " +
      "\"no `src/` caller\" is stale: the call site is a loss class in its own right, and the " +
      "fix's `checkFnCallArgs` site (type-layer-checks.ts) must treat a refused parameter " +
      "type as ABSENT rather than as an opaque name",
  },
  {
    id: "l9 (let-rhs-type-mismatch, propagated past the declaring statement)",
    code: "theta/parse/let-rhs-type-mismatch",
    control: () => [
      line("theta/parse/let-rhs-type-mismatch", [
        ["<name>", "b"],
        ["<expected>", "string"],
        ["<actual>", "integer"],
      ]),
    ],
    controlSrc: `${FM}let a: integer = 3\nlet b: string = a\nb\n`,
    twinSrc: `${FM}let a: integer-- = 3\nlet b: string = a\nb\n`,
    subject: "a",
    why: "the propagation row: the SECOND binding's own annotation is well-formed and it is the " +
      "first binding's recorded type that decides the row, so the withhold must reach a later " +
      "statement's judgement and not only the declaring one",
  },
];

describe("bug 0124 (l) — the suppressed rows, control and twin", () => {
  for (const pair of LOSS_PAIRS) {
    it(`GREEN (${pair.id}, control): the well-formed annotation draws ${pair.code}`, () => {
      // The control is what makes the twin's silence attributable to the
      // annotation text rather than to an unwired gate. It is asserted in its
      // own cell so a gate that stops firing for an unrelated reason reds here
      // instead of greening the twin.
      const doc = parseDoc(pair.controlSrc, "bug0124.theta");
      expect(
        diagLines(doc),
        `${pair.id}: the registered row must fire for the well-formed annotation — ${pair.why}`,
      ).toEqual(pair.control());
    });

    it(`RED (${pair.id}, twin): the junk-suffixed annotation draws the refusal ALONE`, () => {
      // At HEAD this fixture emits NOTHING: the converter's final arm made the
      // annotation an opaque `named` type and the gate deferred. Post-fix the
      // annotation is refused once and the sibling row does not fire, because
      // the consumption site WITHHOLDS rather than reading a type out of text
      // that supports no verdict.
      const doc = parseDoc(pair.twinSrc, "bug0124.theta");
      expect(
        diagCodes(doc),
        `${pair.id}: one trailing punctuation character must not silently remove the rejection ` +
          `the annotation existed to produce, and must not report twice either — the withhold ` +
          `makes ${pair.code} defer while the refusal names the text. Rendered diagnostics: ` +
          `${JSON.stringify(diagLines(doc))}, statement kinds ${JSON.stringify(stmtKinds(doc))}`,
      ).toEqual([`error ${CODE}`]);
      expect(
        diagLines(doc),
        `${pair.id}: DIAG-4 — the rendered message names the offending declaration`,
      ).toEqual([refusalLine(pair.subject)]);
      expect(
        doc.diagnostics.filter((d) => d.code === pair.code),
        `${pair.id}: ${pair.code} must NOT fire beside the refusal — the refused text supports ` +
          `no type verdict, so reporting one would be a second diagnostic for one author mistake`,
      ).toEqual([]);
      expectBlocksRegistration(pair.id, doc.diagnostics);
    });
  }
});

/**
 * The `fn` parameter position's own loss channel: `walkFn`
 * (src/parser/type-layer-checks.ts) seeds the body scope from the annotation
 * through `annotationToCompatType`, so ONE junk parameter type disables the
 * method, condition, index and join gates for every use of that parameter in the
 * body. The fix's site here is the branch already beside it —
 * `recordWithheldBinders`, the unannotated-parameter arm.
 */
const BODY_SCOPE_PAIRS: ReadonlyArray<{
  readonly id: string;
  readonly code: string;
  readonly control: () => readonly string[];
  readonly param: string;
  readonly junk: string;
  readonly body: string;
  readonly subject: string;
  readonly returnType: string;
}> = [
  {
    id: "l10 (body scope, unknown-method)",
    code: "theta/parse/unknown-method",
    control: () => [
      line("theta/parse/unknown-method", [
        ["<method>", "length"],
        ["<type>", "integer"],
      ]),
    ],
    param: "n: integer",
    junk: "n: integer--",
    body: "n.length",
    subject: "n",
    returnType: "integer",
  },
  {
    id: "l11 (body scope, non-boolean-condition)",
    code: "theta/parse/non-boolean-condition",
    control: () => [line("theta/parse/non-boolean-condition", [["<type>", "integer"]])],
    param: "n: integer",
    junk: "n: integer--",
    body: "if n { 1 } else { 2 }",
    subject: "n",
    returnType: "integer",
  },
  {
    id: "l12 (body scope, non-indexable-receiver)",
    code: "theta/parse/non-indexable-receiver",
    control: () => [line("theta/parse/non-indexable-receiver", [["<type>", "string"]])],
    param: "n: string",
    junk: "n: string--",
    body: "n[0]",
    subject: "n",
    returnType: "string",
  },
  {
    id: "l13 (body scope, non-string-array-join)",
    code: "theta/parse/non-string-array-join",
    control: () => [line("theta/parse/non-string-array-join", [["<element>", "integer"]])],
    param: "xs: array<integer>",
    junk: "xs: array<integer>--",
    body: 'xs.join(",")',
    subject: "xs",
    returnType: "string",
  },
];

describe("bug 0124 (l) — the `fn` body scope the parameter annotation seeds", () => {
  for (const pair of BODY_SCOPE_PAIRS) {
    const src = (param: string): string =>
      `${FM}fn f(${param}): ${pair.returnType} { ${pair.body} }\nlet inert = 1\ninert\n`;

    it(`GREEN (${pair.id}, control): the annotated parameter draws ${pair.code} in the body`, () => {
      const doc = parseDoc(src(pair.param), "bug0124.theta");
      expect(
        diagLines(doc),
        `${pair.id}: \`walkFn\` seeds the body scope from the annotation, so the gate must fire ` +
          `for the well-formed spelling`,
      ).toEqual(pair.control());
    });

    it(`RED (${pair.id}, twin): the junk parameter type draws the refusal ALONE`, () => {
      const doc = parseDoc(src(pair.junk), "bug0124.theta");
      expect(
        diagCodes(doc),
        `${pair.id}: one junk parameter type must not silently disable the body's gates; the ` +
          `refusal names the parameter and the withhold keeps ${pair.code} from reporting on a ` +
          `read this layer cannot type. Rendered diagnostics: ${JSON.stringify(diagLines(doc))}`,
      ).toEqual([`error ${CODE}`]);
      expect(
        diagLines(doc),
        `${pair.id}: DIAG-4 — the rendered message names the offending parameter`,
      ).toEqual([refusalLine(pair.subject)]);
      expectBlocksRegistration(pair.id, doc.diagnostics);
    });
  }
});

// ===========================================================================
// (i) THE ROW THAT FIRES FALSELY, IN BOTH DIRECTIONS. `checkForIterand`
// (src/parser/control-flow.ts:64) tests `kind === "array"` and otherwise emits
// `theta/parse/non-array-iterand` rendering the type through `displayType`
// (`:79`) — printing the CAPTURE into a DIAG-4-normative *Message*.
// ===========================================================================

describe("bug 0124 (i) — the false `non-array-iterand`, closed by construction", () => {
  const ITERAND_CODE = "theta/parse/non-array-iterand";

  it("GREEN (i1, control): a declared `array<string>` parameter iterates silently", () => {
    const doc = parseDoc(
      `${FM}fn f(xs: array<string>): integer { for x in xs { 1 } 1 }\nlet inert = 1\ninert\n`,
      "bug0124.theta",
    );
    expect(
      diagLines(doc),
      "i1: the author's declared array IS an array, so the gate must pass — which is what makes " +
        "the twin's rejection FALSE rather than merely differently-worded",
    ).toEqual([]);
  });

  it("RED (i2, false rejection): `array<string>--` draws the refusal ALONE, not the iterand row", () => {
    // At HEAD this program is REFUSED with `got array<string>--`: the author
    // declared an array, the parser captured a name, and the gate prints the
    // capture into an author-facing message whose `<type>` placeholder is
    // DIAG-4-normative. The refusal denies registration AND the withhold makes
    // the gate defer, so the render is unreachable for this input by
    // construction rather than by a re-worded message.
    const label = "i2 (fn parameter iterand)";
    const doc = parseDoc(
      `${FM}fn f(xs: array<string>--): integer { for x in xs { 1 } 1 }\nlet inert = 1\ninert\n`,
      "bug0124.theta",
    );
    expect(
      capturedAt(label, doc, "param"),
      `${label}: PRECONDITION — the trailer joined the parameter type`,
    ).toBe("array<string>--");
    expect(
      diagCodes(doc),
      `${label}: a legal program must not be refused, and no registered *Message* may carry ` +
        `unparsed source text. Rendered diagnostics: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([`error ${CODE}`]);
    expect(
      diagLines(doc),
      `${label}: DIAG-4 — the rendered message names the offending parameter`,
    ).toEqual([refusalLine("xs")]);
    expect(
      doc.diagnostics.filter((d) => d.code === ITERAND_CODE),
      `${label}: ${ITERAND_CODE} must be unreachable for this input — the theta does not ` +
        `register and the iterand's type is withheld`,
    ).toEqual([]);
    expect(
      diagLines(doc).join("\n"),
      `${label}: \`got array<string>--\` renders the capture into a normative placeholder`,
    ).not.toContain("array<string>--");
  });

  it("GREEN (i3, control): a declared `integer` iterand draws the iterand row naming `integer`", () => {
    // The other direction's control: the gate legitimately refuses a
    // non-array iterand and renders a REAL type. Without this cell a fix that
    // unwired `checkForIterand` altogether would green i4.
    const doc = parseDoc(`${FM}let a: integer = 3\nfor x in a { 1 }\n`, "bug0124.theta");
    expect(
      diagLines(doc),
      "i3: the row itself is correct and stays wired; only the text it renders for a junk " +
        "annotation is this report's",
    ).toEqual([line(ITERAND_CODE, [["<type>", "integer"]])]);
  });

  it("RED (i4, junk render): `integer--` draws the refusal ALONE, not `got integer--`", () => {
    const label = "i4 (let iterand)";
    const doc = parseDoc(`${FM}let a: integer-- = 3\nfor x in a { 1 }\n`, "bug0124.theta");
    expect(
      capturedAt(label, doc, "let"),
      `${label}: PRECONDITION — the trailer joined the annotation`,
    ).toBe("integer--");
    expect(
      diagCodes(doc),
      `${label}: §Fix constraint 1 forbids both a refusal and the false iterand row for one ` +
        `author mistake. Rendered diagnostics: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([`error ${CODE}`]);
    expect(
      diagLines(doc),
      `${label}: DIAG-4 — the rendered message names the offending binding`,
    ).toEqual([refusalLine("a")]);
    expect(
      diagLines(doc).join("\n"),
      `${label}: \`got integer--\` renders the capture into a normative placeholder`,
    ).not.toContain("integer--");
  });
});

// ===========================================================================
// (k) THE `?`-SCOPE VERDICT A REFUSED RETURN ANNOTATION MUST NOT PRODUCE.
// `walkFn` (src/parser/type-layer-checks.ts) computes the body's
// `EnclosingReturnScope` from the return annotation, and `checkQuestionScope`
// (src/parser/match-result.ts) reads it to decide
// `theta/parse/question-outside-result-fn`. Reading a REFUSED annotation there
// derives a verdict from text that names no type, in both directions at once:
//   - RESTRICTIVE — `integer--` reads as a declared non-`Result` return type,
//     so a body `?` draws the scope rejection BESIDE the refusal. That is
//     exactly the cascade §Fix constraint 1 forbids, and the same shape as its
//     own paradigm case (`let a: integer-- = 3` with `for x in a` drawing both
//     the refusal and the false `non-array-iterand`, group (i) above).
//   - PERMISSIVE — `isResultAnnotation`'s `/^Result\b/`
//     (src/parser/type-layer-checks.ts) MATCHES the junk `Result--` and grants
//     Result-compatibility from it, so a body `?` under text naming no type is
//     accepted for a reason no author wrote.
// Both are closed the same way the parameter loop closes its own: the refused
// annotation is ABSENT to this computation — `{ kind: "inferred" }`, the neutral
// an annotation-less `fn` gets — so the withhold DEFERS and never reports.
// ===========================================================================

describe("bug 0124 (k) — a refused return annotation is absent to the body's `?` scope", () => {
  const SCOPE_CODE = "theta/parse/question-outside-result-fn";
  /** A body whose `?` makes the enclosing scope's return type load-bearing. */
  const QUESTION_BODY = "let r = @`x`? r";

  it(`GREEN (k1, control): \`fn f(): integer\` draws ${SCOPE_CODE}`, () => {
    // The live-channel proof k2 and k3 need: without it their single-diagnostic
    // sequences could hold against a scope check that stopped firing at all,
    // and the absence assertions below could never red.
    expectSequence("k1 (return, integer, `?` body)", "return", "integer", [plainLine(SCOPE_CODE)], {
      rhsOrBody: QUESTION_BODY,
      why: "a plain `fn`'s well-formed non-`Result` annotation IS a declaration this layer can " +
        "read, so the scope rejection is correct here — which is what makes the same code beside " +
        "a REFUSED annotation a verdict derived from junk rather than a second true report",
    });
  });

  it("RED (k2, restrictive direction): `integer--` draws the refusal ALONE", () => {
    const label = "k2 (return, integer--, `?` body)";
    const doc = parseDoc(srcAt("return", "integer--", QUESTION_BODY), "bug0124.theta");
    expect(
      capturedAt(label, doc, "return"),
      `${label}: PRECONDITION — the trailer joined the return annotation and the body stayed out ` +
        `of the capture, so the \`?\` below is inside the body the scope check ranges over`,
    ).toBe("integer--");
    expect(
      diagCodes(doc),
      `${label}: §Fix constraint 1 forbids a refusal PLUS a sibling verdict derived from the ` +
        `refused text. Rendered diagnostics: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([`error ${CODE}`]);
    expect(
      diagLines(doc),
      `${label}: DIAG-4 — the rendered message names the offending function`,
    ).toEqual([refusalLine("f")]);
    expect(
      doc.diagnostics.filter((d) => d.code === SCOPE_CODE),
      `${label}: ${SCOPE_CODE} must NOT fire beside the refusal — the refused text declares no ` +
        `return type, so it cannot declare a non-\`Result\` one either`,
    ).toEqual([]);
    expectBlocksRegistration(label, doc.diagnostics);
  });

  it("RED (k3, permissive direction): `Result--` draws the refusal ALONE", () => {
    // The other direction's cell, and the reason the withhold is the remedy
    // rather than a `resultCompatible: false` reading: `/^Result\b/` matches
    // the junk `Result--` and grants Result-compatibility from text naming no
    // type. Treating the annotation as ABSENT closes both directions at once,
    // because the neutral scope answers no compatibility question at all.
    const label = "k3 (return, Result--, `?` body)";
    const doc = parseDoc(srcAt("return", "Result--", QUESTION_BODY), "bug0124.theta");
    expect(
      capturedAt(label, doc, "return"),
      `${label}: PRECONDITION — the trailer joined the return annotation`,
    ).toBe("Result--");
    expect(
      diagCodes(doc),
      `${label}: the refusal is the WHOLE disposition — the junk must neither earn the scope ` +
        `rejection nor read as Result-compatible. Rendered diagnostics: ` +
        `${JSON.stringify(diagLines(doc))}`,
    ).toEqual([`error ${CODE}`]);
    expect(
      diagLines(doc),
      `${label}: DIAG-4 — the rendered message names the offending function`,
    ).toEqual([refusalLine("f")]);
    expectBlocksRegistration(label, doc.diagnostics);
  });

  it("GREEN (k4, control): a well-formed `Result<T, QueryError>` return keeps its `?` legal", () => {
    // The accepting direction, unmoved: the withhold must not make every `?`
    // legal, and it must not make a genuinely Result-annotated scope report.
    expectSequence(
      "k4 (return, Result<integer, QueryError>, `?` body)",
      "return",
      "Result<integer, QueryError>",
      [],
      {
        rhsOrBody: QUESTION_BODY,
        why: "the annotation IS a `Result` application, so the scope admits `?` — the reading the " +
          "refusal's absent-treatment leaves untouched",
      },
    );
  });
});

// ===========================================================================
// (m) THE RESULT-CERTAINTY CHANNEL A REFUSED RETURN ANNOTATION MUST NOT FEED.
// `collectFnReturnAnnotations` (src/parser/type-layer-checks.ts) builds the
// `fnReturns` table from every top-level `fn`'s captured return annotation, and
// `isCertainResultNode` reads it through `isResultAnnotation`'s `/^Result\b/`
// to decide `theta/parse/interpolated-result` (QRY-18). `\b` matches between a
// word character and punctuation, so EVERY `Result`-prefixed refused trailer
// satisfies that prefix test: a `fn` returning a plain string is credited with
// returning a `Result`, and an interpolation of its value draws a row nothing
// about the program earned. Both arms of `interpolationIsResult` reach it — the
// `ident` arm through the `let` binding the `let` arm marks in `resultBindings`,
// and the `call` arm directly from a bare `${mk()}`.
//
// Closed at MAP-BUILD time, not at read time: a refused annotation is OMITTED
// from `fnReturns`, so it is structurally absent to every present and future
// reader of that table (the absence invariant at
// `annotationSourceIsNotTypeExpression`). Read-site guards are what let a
// consumer be missed; the entry never existing cannot be.
// ===========================================================================

describe("bug 0124 (m) — a refused return annotation is absent to the Result-certainty channel", () => {
  const RESULT_CODE = "theta/parse/interpolated-result";
  /** The well-formed `Result` return every control in this group declares. */
  const WELL_FORMED = "Result<integer, QueryError>";

  /**
   * One `fn mk()` whose return annotation is under test, with its value
   * interpolated into an `@`-query either through a `let` binding (the `ident`
   * arm) or directly (the `call` arm).
   */
  function src(returnType: string, body: string, via: "let" | "call"): string {
    const interpolation = via === "let" ? "let r = mk()\n@`x${r}`\n" : "@`x${mk()}`\n";
    return `${FM}fn mk(): ${returnType} {\n  ${body}\n}\n${interpolation}`;
  }

  for (const via of ["let", "call"] as const) {
    const arm = via === "let" ? "`ident` arm" : "`call` arm";

    it(`GREEN (m1-${via}, control): a well-formed \`Result\` return draws ${RESULT_CODE} (${arm})`, () => {
      // The live-channel proof the absence cells below need: without it their
      // single-diagnostic sequences would also hold against a channel that had
      // stopped firing altogether, and the absence assertions could never red.
      const label = `m1-${via} (return, ${WELL_FORMED}, ${arm})`;
      const doc = parseDoc(src(WELL_FORMED, "Ok(1)", via), "bug0124.theta");
      expect(
        capturedAt(label, doc, "return", "mk"),
        `${label}: PRECONDITION — the return slot captured the well-formed annotation`,
      ).toBe(joinedCapture(WELL_FORMED));
      expect(
        diagLines(doc),
        `${label}: the annotation IS a \`Result\` application, so QRY-18 refuses the ` +
          `interpolation — the emission the refused twin below must NOT inherit`,
      ).toEqual([plainLine(RESULT_CODE)]);
    });

    it(`RED (m2-${via}, false certainty): \`Result--\` draws the refusal ALONE (${arm})`, () => {
      // `mk` returns the plain string `"hello"`; nothing about it is a `Result`.
      // The only thing that made `interpolated-result` fire here was
      // `/^Result\b/` matching the junk trailer.
      const label = `m2-${via} (return, Result--, ${arm})`;
      const doc = parseDoc(src("Result--", '"hello"', via), "bug0124.theta");
      expect(
        capturedAt(label, doc, "return", "mk"),
        `${label}: PRECONDITION — the trailer joined the return annotation, which is what puts ` +
          `\`Result--\` in front of the prefix test`,
      ).toBe("Result--");
      expect(
        diagCodes(doc),
        `${label}: §Fix constraint 1 forbids a refusal PLUS a sibling verdict derived from the ` +
          `refused text. Rendered diagnostics: ${JSON.stringify(diagLines(doc))}`,
      ).toEqual([`error ${CODE}`]);
      expect(
        diagLines(doc),
        `${label}: DIAG-4 — the rendered message names the offending function`,
      ).toEqual([refusalLine("mk")]);
      expect(
        doc.diagnostics.filter((d) => d.code === RESULT_CODE),
        `${label}: ${RESULT_CODE} must NOT fire beside the refusal — the refused text declares no ` +
          `return type, so it declares no \`Result\` one either, and \`mk\`'s body returns a ` +
          `string`,
      ).toEqual([]);
      expectBlocksRegistration(label, doc.diagnostics);
    });

    it(`GREEN (m3-${via}, differential): \`integer--\` isolates the \`Result\` prefix (${arm})`, () => {
      // The control that names the CAUSE rather than the symptom: the same junk
      // trailer on a non-`Result` head draws the refusal alone even with the
      // prefix test unguarded, so a red here would mean the withhold broke for
      // every refused return annotation, not for the `Result`-prefixed ones.
      const label = `m3-${via} (return, integer--, ${arm})`;
      const doc = parseDoc(src("integer--", '"hello"', via), "bug0124.theta");
      expect(
        capturedAt(label, doc, "return", "mk"),
        `${label}: PRECONDITION — the trailer joined the return annotation`,
      ).toBe("integer--");
      expect(
        diagLines(doc),
        `${label}: the refusal is the WHOLE disposition, as it already was before the prefix ` +
          `test's own hit was closed`,
      ).toEqual([refusalLine("mk")]);
      expectBlocksRegistration(label, doc.diagnostics);
    });
  }
});

// ===========================================================================
// (j) AN INDEPENDENT FAULT BESIDE THE REFUSAL IS NOT JUNK-DERIVED, AND KEEPS
// ITS OWN DIAGNOSTIC. `walkFn` (theta-document.ts) computes
// `voidReturn: s.returnType === "void"` from the CAPTURED return-annotation
// text on LITERAL STRING EQUALITY, immediately ahead of the body walk that
// feeds `checkBareReturn` (src/parser/functions.ts) — untouched by this fix.
// Only the exact spelling `void` sets `voidReturn: true`; an absent
// annotation, `integer`, `integer--` and `void--` are ALL `!== "void"` and so
// alike a non-void scope, which j2 below measures directly by holding the
// annotation absent altogether.
//
// THE BOUNDARY, CONTRASTED WITH (k) AND (m) ABOVE. Both of those groups
// withhold a return-annotation-derived verdict because the ABSENT-annotation
// neutral reaches NO emission there: `question-outside-result-fn` needs a
// declared non-`Result` return type to fire at all, and `interpolated-result`
// needs `/^Result\b/` to match a declared prefix, so an absent annotation
// gives either judgement nothing to fire on — reading the refused text in its
// place would MANUFACTURE a diagnostic the absent treatment would not, which
// is exactly what makes those two junk-derived and exactly what the withhold
// exists to suppress. `bare-return-in-non-void` is the opposite shape: the
// absent-annotation neutral reaches the IDENTICAL verdict a refused
// annotation does, so the verdict does not discriminate on the refused text
// at all. Suppressing it would require the withhold to ASSERT voidness from
// text that supports no type verdict — the same permissive reasoning
// `Result--` (group (m), m2) shows is wrong in the opposite direction, applied
// here to `void`. A verdict the absent-annotation neutral would also reach is
// not junk-derived, and is not this row's to suppress.
//
// The same shape holds for an annotation with no initialiser at all, on a
// STRICTER form of the same independence: `theta/parse/let-without-initialiser`'s
// own trigger does not read the annotation's text at all, only whether an
// initialiser is syntactically present, so `let a: integer--` (no `=` at all)
// draws it beside the refusal exactly as `let a: integer` (no `=`, no
// refusal) draws it alone — verified directly against this recogniser and not
// itself a row this group pins.
//
// j4 generalises j1 beyond a `void`-shaped refused spelling: the disposition
// is "any refused return annotation is a non-void scope", not "a refused
// annotation that resembles `void`".
// ===========================================================================

describe("bug 0124 (j) — an independent fault beside the refusal is not junk-derived", () => {
  it("RED (j1): `fn f(): void-- { return }` draws the refusal AND the independent bare-return fault, in emission order", () => {
    const label = "j1 (return, void--, bare return)";
    const doc = parseDoc(`${FM}fn f(): void-- { return }\nlet inert = 1\ninert\n`, "bug0124.theta");
    const fn = fnDeclOf(label, doc, "f");
    expect(
      fn.returnType,
      `${label}: PRECONDITION — the extent scanner must have captured the junk return annotation`,
    ).toBe("void--");
    expect(
      diagLines(doc),
      `${label}: \`void--\` is not the keyword spelling \`void\` (\`ReturnType ::= Type | "void"\`, ` +
        `grammar.md:89), so \`voidReturn\` is \`false\` exactly as it is for an absent annotation ` +
        `(j2) — a bare \`return\` fault does not read the refused text, so it is not this row's to ` +
        `suppress. Both land, in the order the return slot's own annotation walk runs ahead of the ` +
        `body walk`,
    ).toEqual([refusalLine("f"), plainLine("theta/parse/bare-return-in-non-void")]);
    expectBlocksRegistration(label, doc.diagnostics);
  });

  it("GREEN (j2, control): `fn f() { return }` with NO annotation draws the bare-return fault ALONE", () => {
    // THE cell that proves j1's second diagnostic is not junk-derived: with no
    // return annotation at all — nothing for the refusal to read, refuse, or
    // withhold — `bare-return-in-non-void` still fires, because `voidReturn`
    // is `s.returnType === "void"` and `null !== "void"` exactly as
    // `"void--" !== "void"`. A verdict the absent-annotation neutral also
    // reaches is not derived from refused text, whatever the annotation says.
    const label = "j2 (return, no annotation, bare return)";
    const doc = parseDoc(`${FM}fn f() { return }\nlet inert = 1\ninert\n`, "bug0124.theta");
    const fn = fnDeclOf(label, doc, "f");
    expect(
      fn.returnType,
      `${label}: PRECONDITION — no return annotation reached this position at all`,
    ).toBeNull();
    expect(
      diagLines(doc),
      `${label}: the bare-return fault fires with NOTHING to refuse, which is what makes j1's ` +
        `pairing a consequence of the fault's own independence rather than of reading refused text`,
    ).toEqual([plainLine("theta/parse/bare-return-in-non-void")]);
  });

  it("GREEN (j3, control): `fn f(): void { return }` draws nothing", () => {
    // The one spelling that flips `voidReturn` to `true`: `ReturnType ::= Type
    // | "void"` (grammar.md:89) makes `void` a keyword spelling, admitted by
    // this row's own recogniser, so neither check has anything to report.
    expectSequence("j3 (return, void, bare return)", "return", "void", [], {
      rhsOrBody: "return",
      why: "the exact keyword spelling `void` is the only text that sets `voidReturn: true`, so " +
        "a bare `return` under it is legal and the annotation itself is admitted, not refused",
    });
  });

  it("RED (j4): `fn f(): integer-- { return }` draws both, for the same reason at a non-void-shaped refusal", () => {
    // Generalises j1: the disposition is "any refused return annotation is a
    // non-void scope" (every refused spelling is `!== "void"` alike), not
    // "a refused annotation that resembles `void`" — `integer--` resembles
    // nothing about `void` and still pairs with the bare-return fault.
    const label = "j4 (return, integer--, bare return)";
    const doc = parseDoc(`${FM}fn f(): integer-- { return }\nlet inert = 1\ninert\n`, "bug0124.theta");
    const fn = fnDeclOf(label, doc, "f");
    expect(
      fn.returnType,
      `${label}: PRECONDITION — the extent scanner must have captured the junk return annotation`,
    ).toBe("integer--");
    expect(
      diagLines(doc),
      `${label}: the disposition does not turn on the refused text resembling \`void\` — every ` +
        `refused spelling is alike \`!== "void"\`, so the bare-return fault pairs with this ` +
        `refusal for the identical reason j1's pairing holds`,
    ).toEqual([refusalLine("f"), plainLine("theta/parse/bare-return-in-non-void")]);
    expectBlocksRegistration(label, doc.diagnostics);
  });

  it("RED (j5): `fn f(): void-- { 1 }` draws the refusal ALONE — the pairing is the bare `return`'s doing", () => {
    // No bare `return` in the body, so `checkBareReturn` never runs: the value
    // tail `1` is an expression, not a `return` statement. This is the cell
    // that isolates WHICH side of the pairing does the work — if the
    // annotation refusal itself manufactured the second diagnostic, it would
    // appear here too; it does not, because there is no bare return for
    // `voidReturn` to gate.
    const label = "j5 (return, void--, value tail)";
    const doc = parseDoc(`${FM}fn f(): void-- { 1 }\nlet inert = 1\ninert\n`, "bug0124.theta");
    const fn = fnDeclOf(label, doc, "f");
    expect(
      fn.returnType,
      `${label}: PRECONDITION — the extent scanner must have captured the junk return annotation`,
    ).toBe("void--");
    expect(
      diagCodes(doc),
      `${label}: with no bare \`return\` in the body, \`checkBareReturn\` never runs, so only the ` +
        `annotation refusal fires — proving j1's second diagnostic is the bare \`return\`'s own ` +
        `fault surfacing, not something the refusal itself emits`,
    ).toEqual([`error ${CODE}`]);
    expect(
      diagLines(doc),
      `${label}: DIAG-4 — the rendered message names the offending function`,
    ).toEqual([refusalLine("f")]);
    expectBlocksRegistration(label, doc.diagnostics);
  });
});

// ===========================================================================
// (e) THE `<` / `>` DISPOSITION — STATED, and it splits on the SHARED brace
// decline rather than on anything this fix adds. One representative row per
// direction; the capture MECHANICS (the unfloored depth counter at
// theta-document.ts:3231–:3239 plus the lexer's trailing-trigger continuation)
// are bug 0124 §Non-goals' and do not move.
// ===========================================================================

describe("bug 0124 (e) — the `<` / `>` over-run's two directions", () => {
  it("RED (e1, `<`): the brace-free over-run capture now draws one refusal", () => {
    // `fn f(n: integer<): integer { 1 }` takes the depth counter above zero, so
    // the capture runs past the parameter list and absorbs the return
    // annotation: `integer<):integer`. That text carries no brace, so the shared
    // decline does not reach it and the refusal fires where HEAD had NOTHING at
    // all — a whole statement silently absorbed with zero diagnostics.
    const label = "e1 (fn parameter, `<`)";
    const src = `${FM}fn f(n: integer<): integer { 1 }\nlet a = 1\na\n`;
    const doc = parseDoc(src, "bug0124.theta");
    // No `schema Cat` prelude here: the capture over-run absorbs everything
    // AFTER the `fn`, so the fixture is kept minimal to make the absorption
    // legible in the statement-kind pin below.
    const fn = fnDeclOf(label, doc, "f");
    expect(
      fn.params.map((p) => p.type)[0],
      `${label}: PRECONDITION — the capture over-ran the parameter list and absorbed the return ` +
        `annotation`,
    ).toBe("integer<):integer");
    expect(
      fn.returnType,
      `${label}: the capture mechanics do not move — the return slot is left with nothing`,
    ).toBeNull();
    expect(
      stmtKinds(doc),
      `${label}: the following statement stays absorbed; this fix adds a judgement, not a stop`,
    ).toEqual(["fn"]);
    expect(
      diagCodes(doc),
      `${label}: the absorbed capture is brace-free, so the judgement reaches it and the author ` +
        `gets one diagnostic where HEAD gives none. Rendered diagnostics: ` +
        `${JSON.stringify(diagLines(doc))}`,
    ).toEqual([`error ${CODE}`]);
    expect(
      diagLines(doc),
      `${label}: DIAG-4 — the rendered message names the offending parameter`,
    ).toEqual([refusalLine("n")]);
    expectBlocksRegistration(label, doc.diagnostics);
  });

  it("GREEN (e2, `>`): the brace-carrying over-run capture keeps HEAD's silence", () => {
    // `fn f(n: integer>): integer { 1 }` takes the depth counter BELOW zero, so
    // the capture additionally absorbs the body: `integer>):integer{1}`. That
    // text carries both a brace and an angle bracket, which is the
    // position-level shred decline's own case — the split would hand the sink a
    // SHARD of a group the author wrote as one unit — so it stays silent, and
    // the whole statement stays absorbed exactly as at HEAD.
    const label = "e2 (fn parameter, `>`)";
    const doc = parseDoc(`${FM}fn f(n: integer>): integer { 1 }\nlet a = 1\na\n`, "bug0124.theta");
    const fn = fnDeclOf(label, doc, "f");
    expect(
      fn.params.map((p) => p.type)[0],
      `${label}: PRECONDITION — the capture absorbed the body as well as the return annotation`,
    ).toBe("integer>):integer{1}");
    expect(
      diagLines(doc),
      `${label}: a refusal appearing here would mean the shred decline was dropped, which would ` +
        `hand the shared sink text no author wrote`,
    ).toEqual([]);
  });
});

// ===========================================================================
// (q) CONSTRAINT 1's GUARD — an annotation whose own `parseTypeExpression` walk
// already drew an error-severity diagnostic keeps it ALONE. GREEN at HEAD,
// byte-for-byte, and required to stay green.
// ===========================================================================

describe("bug 0124 (q) — a scope already refused keeps exactly its own diagnostic", () => {
  it("GREEN (q1): `let a: void = 3` keeps `void-in-non-return-position`", () => {
    // The control half: the position rule fires for the well-formed spelling.
    expectSequence("q1 (let, void)", "let", "void", [
      plainLine("theta/parse/void-in-non-return-position"),
    ]);
  });

  it("GREEN (q2): `let a: void-- = 3` keeps `void-in-non-return-position` ALONE", () => {
    // The junk spelling emits exactly what the well-formed one does: the seam
    // walks the node its tolerant parser DID build and no arm inspects the
    // remainder, and the guard keeps the refusal off a scope that already
    // reported. One author mistake, one report.
    expectSequence("q2 (let, void--)", "let", "void--", [
      plainLine("theta/parse/void-in-non-return-position"),
    ]);
  });

  it("GREEN (q3): `let a: array<integer, integer> = [1]` keeps `generic-arity-mismatch`", () => {
    expectSequence(
      "q3 (let, array<integer, integer>)",
      "let",
      "array<integer, integer>",
      [
        line("theta/parse/generic-arity-mismatch", [
          ["<ctor>", "array"],
          ["<expected>", "1"],
          ["<actual>", "2"],
        ]),
      ],
      { rhsOrBody: "[1]" },
    );
  });

  it("GREEN (q4): `let a: array<integer, integer>-- = [1]` keeps `generic-arity-mismatch` ALONE", () => {
    expectSequence(
      "q4 (let, array<integer, integer>--)",
      "let",
      "array<integer, integer>--",
      [
        line("theta/parse/generic-arity-mismatch", [
          ["<ctor>", "array"],
          ["<expected>", "1"],
          ["<actual>", "2"],
        ]),
      ],
      { rhsOrBody: "[1]" },
    );
  });
});

// ===========================================================================
// (o) THE EIGHTH CONSUMER — GATED BY THE WITHHOLD AS OF BUG 0222. §Fix (f)(1)
// promises exactly one diagnostic and no cascade for the FOUR sites this fix
// threads its withhold through (the `let` arm, the `fn` parameter loop,
// `checkSubagentReturnAnnotation`, `checkFnCallArgs`). This group pins a
// FIFTH consumer of the same refused `let`-annotation text, one this fix's
// own four-site withhold did not reach when it landed: `checkLetMismatch`
// (src/parser/query-schema-resolve.ts), the QRY-4 explicit-schema check
// comparing a `let` annotation against an explicit `@<Schema>` ascription on
// the same binding's query initialiser. At the time this group was written it
// read `stmt.annotation` and converted it directly, so a refusal whose junk
// converted to an `array<…>` (or a union arm that is itself such an array)
// drew `theta/parse/explicit-schema-mismatch` (W) beside the refusal. Bug
// 0222 added a leading `annotationSourceIsNotTypeExpression` guard to
// `checkLetMismatch`, joining the four sites above, so a refused annotation
// is now absent to this consumer too: o1 and o2 pin the WITHHELD reading (the
// refusal alone), and o3 (the absence control), o4 (the well-formed QRY-4
// warning) and o5 (the bare-name deferral) are unaffected by the guard and
// keep their original expectations.
// ===========================================================================

/**
 * `theta/parse/explicit-schema-mismatch` is registered `W`; `plainLine` and
 * `line` above hardcode the `error` prefix every other code in this file
 * carries, so this group reads the same DIAG-4 oracle through its own
 * `warning`-prefixed renderer rather than reuse a helper shaped for error
 * rows.
 */
function warningLine(code: string): string {
  return `warning ${code}: ${registryMessageOf(code)}`;
}

const RESIDUAL_OWNERS =
  "a RECORDED RESIDUAL, not a desired outcome — the disposition belongs to bug 0093 " +
  "(the let-annotation-over-query-initialiser double-emission topology at this same site) and " +
  "bug 0130 (the annotationToCompatType conversion this check shares with the sites it names), " +
  "both open and unsettled; this fix does not adjudicate it";

/**
 * o1/o2's WHY, post-bug-0222: the pairing `RESIDUAL_OWNERS` describes is what
 * this consumer USED to draw before the guard landed. o3 and o5 still cite
 * `RESIDUAL_OWNERS` because their own subjects (absence, a bare unresolvable
 * name) were never that pairing and are untouched by bug 0222; o4 carries
 * its own bespoke `why` naming the QRY-4 channel directly, since its subject
 * (a well-formed mismatch) never used `RESIDUAL_OWNERS` either at HEAD or
 * now. Only o1 and o2 exercised the pairing itself, so only their WHY moves
 * to name the report that settled it.
 */
const WITHHOLD_OWNER =
  "bug 0222, which gated `checkLetMismatch` behind `annotationSourceIsNotTypeExpression` so a " +
  "refused `let` annotation reads as absent to the QRY-4 explicit-schema check, the same as it " +
  "reads to this fix's four withheld sites";

describe(
  "bug 0124 (o) — the QRY-4 explicit-schema check withholds on a refused annotation (settled by bug 0222)",
  () => {
    it("WITHHELD (o1): a refusal nested under `array<…>` draws the refusal ALONE", () => {
      // The annotation's OUTER shape is `array<…>` (a `GenericType`). Before
      // bug 0222, the compatibility relation decided the ascription and the
      // annotation incompatible from the outer-kind mismatch alone — array vs
      // a scalar ascription — without ever reaching the array's junk element,
      // and a `theta/parse/explicit-schema-mismatch` warning fired beside the
      // refusal. `checkLetMismatch` now asks the same recogniser this fix's
      // other four sites already consult, before it converts anything, so
      // the refused annotation is absent to it and the warning no longer
      // fires.
      expectSequence(
        "o1 (let, array<integer-->, @<integer>)",
        "let",
        "array<integer-->",
        [refusalLine("a")],
        {
          rhsOrBody: "@<integer>`x`",
          why: `this consumer withholds the annotation as of ${WITHHOLD_OWNER}`,
        },
      );
    });

    it("WITHHELD (o2): the same withheld reading through a union arm that is itself the array-wrapped refusal", () => {
      // `array<integer--> | boolean` converts to a union whose first arm is
      // the same array-wrapped junk as o1. Before bug 0222, the array arm
      // failed on outer kind exactly as in o1, the `boolean` arm failed on
      // primitive mismatch, and the union verdict was "incompatible" — the
      // nesting depth changed nothing about which consumer decided the
      // verdict. The same guard withholds this annotation too, so the union
      // case draws no warning either.
      expectSequence(
        "o2 (let, array<integer--> | boolean, @<string>)",
        "let",
        "array<integer--> | boolean",
        [refusalLine("a")],
        {
          rhsOrBody: "@<string>`x`",
          why: `this consumer withholds the annotation as of ${WITHHOLD_OWNER}`,
        },
      );
    });

    it("RESIDUAL (o3): with the annotation ABSENT rather than refused, the identical query draws nothing", () => {
      // The control this group turns on: `let a = …` carries no annotation at
      // all (distinct from `let a: integer-- = …`, which carries a REFUSED
      // one), and `checkLetMismatch` returns early on a null annotation
      // source. Absence and refusal are NOT observationally identical at this
      // one consumer — which is the proof that o1/o2's warning is derived
      // from the refused TEXT, not merely from the query being present. That
      // is what makes the pairing above a residual fed by the refused text
      // rather than an independent fault this row's own absence test would
      // excuse.
      const label = "o3 (let, absent annotation, @<integer>)";
      const src = `${FM}let a = @<integer>\`x\`\na\n`;
      const doc = parseDoc(src, "bug0124.theta");
      const stmt = letStmtOf(label, doc, "a");
      expect(
        stmt.annotation,
        `${label}: PRECONDITION — this cell's whole point is the ABSENCE of an annotation, not a ` +
          "refused one; a non-null capture here would mean the fixture drifted off the shape this " +
          "cell exists to pin",
      ).toBeNull();
      expect(diagLines(doc), `${label}: ${RESIDUAL_OWNERS}`).toEqual([]);
    });

    it("GREEN (o4): a WELL-FORMED annotation mismatched against its query ascription draws the warning ALONE", () => {
      // Control, not residual: with no refusal in play `checkLetMismatch`
      // behaves exactly as its own doc comment states, `string` vs `integer`
      // being incompatible. This cell is the proof that the channel o1/o2
      // exercise is the ordinary QRY-4 warning firing on ordinary
      // (non-junk) input, not a defect this fix introduces or could
      // silence without widening its own remedy past its four sites.
      expectSequence(
        "o4 (let, string, @<integer>)",
        "let",
        "string",
        [warningLine("theta/parse/explicit-schema-mismatch")],
        {
          rhsOrBody: "@<integer>`x`",
          why:
            "the QRY-4 channel is live independent of this fix; the residual bugs 0093/0130 own is " +
            "specifically the PAIRING in o1/o2, not the existence of this warning",
        },
      );
    });

    it("RESIDUAL (o5): a refusal that converts to a BARE unresolvable name draws the refusal ALONE", () => {
      // `checkLetMismatch` still runs — it is not wired to this fix's
      // withhold — but a bare `named` type past the parser's static view
      // makes `checkCompatible` answer "unknown", and
      // `checkExplicitSchemaMismatch` skips silently on "unknown": the same
      // deferral an unresolved `NamedType` gets everywhere in this
      // compatibility model, not a consequence of this fix's guard. Contrast
      // o1/o2: nesting the identical junk under `array<…>` removes that
      // deferral, because the outer-kind mismatch is decided before the
      // element is ever inspected — the pairing is a property of the
      // annotation's OUTER SHAPE, not of the junk text by itself.
      expectSequence("o5 (let, integer--, @<string>)", "let", "integer--", [refusalLine("a")], {
        rhsOrBody: "@<string>`x`",
        why: `this row's own silence-alone answer stands; ${RESIDUAL_OWNERS}`,
      });
    });
  },
);

// ===========================================================================
// (h) THE EMPTY ANNOTATION — §Fix constraint 3's answer, stated: LEFT AS IT IS.
// GREEN at HEAD and required to stay green.
// ===========================================================================

describe("bug 0124 (h) — the empty annotation is a separate answer this fix does not give", () => {
  it("GREEN (h1): `let a: = 3` captures the empty string and stays silent", () => {
    // All three call sites already guard on `length > 0`, and
    // `annotationToCompatType` refuses the empty string in its own
    // length-zero guard, ahead of every other arm. The `@<T>` position's
    // equivalent has its own registered row (`theta/parse/empty-query-annotation`,
    // src/parser/theta-document.ts:4616, bug 0014); this position has none, and
    // minting one is nobody's claim here.
    expectSequence("h1 (let, empty)", "let", "", [], {
      capture: "",
      why: "the empty capture is refused, admitted or left as it is by an explicit decision, and " +
        "the decision recorded is: left as it is, byte-identical to HEAD",
    });
  });
});

// ===========================================================================
// (p) THE SHRED-DECLINE HONESTY ROWS — the legal annotations the position-level
// decline exists for. GREEN at HEAD and required to stay green: a fix without
// the decline refuses both and reds bug 0028's witness.
// ===========================================================================

describe("bug 0124 (p) — the shredded brace groups stay free of the new code", () => {
  it("GREEN (p1): a `Result<{…}, E>` annotation over a three-field inline object is admitted", () => {
    const label = "p1 (let, Result over a 3-field inline object)";
    const src =
      `${FM}schema QueryError { m: string }\n` +
      "let r: Result<{a: string, b: integer, c: boolean}, QueryError> = @`x`\nr\n";
    const doc = parseDoc(src, "bug0124.theta");
    // Since bug 0228's fix the brace group is a raw slice of the author's own
    // source bytes; the text outside it is still joined with no separator.
    expect(
      capturedAt(label, doc, "let", "f", "r"),
      `${label}: PRECONDITION — the whole generic application is one capture`,
    ).toBe("Result<{a: string, b: integer, c: boolean},QueryError>");
    expect(
      diagLines(doc),
      `${label}: the angle-only generic-argument split shreds the brace group into ` +
        `\`{a: string\`, \`b: integer\` and \`c: boolean}\`, and the brace-FREE middle shard IS ` +
        `refusable — so without the position-level decline this LEGAL annotation is refused and ` +
        `bug 0028's witness (tests/unresolved-annotation-lowering.test.ts) reds with it`,
    ).toEqual([]);
  });

  it("GREEN (p2): an `array<{…}>` annotation over a three-field inline object keeps its own row", () => {
    const label = "p2 (let, array over a 3-field inline object)";
    const doc = parseDoc(
      `${FM}let r: array<{a: string, b: integer, c: boolean}> = 1\nr\n`,
      "bug0124.theta",
    );
    // Since bug 0228's fix the brace group is a raw slice of the author's own
    // source bytes.
    expect(
      capturedAt(label, doc, "let", "f", "r"),
      `${label}: PRECONDITION — the whole generic application is one capture`,
    ).toBe("array<{a: string, b: integer, c: boolean}>");
    // MEASURED AT HEAD, NOT ASSUMED: `<expected>` used to render the
    // token-joined pseudo-name's raw text (`array<{a:string,b:integer,c:boolean}>`)
    // because `annotationToCompatType` collapsed the inline object to an
    // unresolvable `named` reference and `displayType`'s `named` arm returns a
    // name verbatim. Bug 0130 element 2 corrects this: the row's OWN
    // disposition is unchanged (this is one row, no new code, exactly as this
    // cell's premise states), but the `let`-annotation site now converts
    // through `letAnnotationToCompatType`, which mints TYPE-8's `object` arm,
    // so `<expected>` renders through `displayType`'s conformant `object` arm
    // instead — single space after each `:` and each `,`
    // (placeholder-rendering-a.md:27).
    expect(
      diagLines(doc),
      `${label}: the annotation is well-formed, so the RHS gate's own row is the WHOLE ` +
        `disposition — the new code appearing beside it would be an over-refusal of a legal ` +
        `annotation, and appearing INSTEAD of it would take the row away`,
    ).toEqual([
      line("theta/parse/let-rhs-type-mismatch", [
        ["<name>", "r"],
        ["<expected>", "array<{ a: string, b: integer, c: boolean }>"],
        ["<actual>", "integer"],
      ]),
    ]);
  });
});

// ===========================================================================
// (g) THE CONTROLS — grammar-admitted traffic keeps its BYTES at all three
// positions. GREEN at HEAD, byte-for-byte, and the primary over-refusal fence.
// ===========================================================================

/** One control: position, type text, the `let` initialiser / `fn` body, and its whole sequence. */
const CONTROL_ROWS: ReadonlyArray<{
  readonly id: string;
  readonly position: Position;
  readonly typeSource: string;
  readonly rhsOrBody?: string;
  readonly expected: () => readonly string[];
  /**
   * Only where the default `joinedCapture` (strip every space) is wrong: since
   * bug 0228's fix a `typeSource` that IS a brace group is captured verbatim,
   * interior spacing intact.
   */
  readonly capture?: string;
}> = [
  { id: "g1", position: "let", typeSource: "integer", expected: () => [] },
  { id: "g2", position: "let", typeSource: "array<integer>", rhsOrBody: "[1]", expected: () => [] },
  { id: "g3", position: "let", typeSource: "integer | string", expected: () => [] },
  {
    // MEASURED AT HEAD, NOT ASSUMED, THE DOC'S READING IS STALE: this row
    // read `expected: () => []` before bug 0130. That report's route mints
    // TYPE-8's `object` arm for a well-formed inline object type at the `let`
    // annotation site, so `1 \u22ee { b: integer }` is now a decidable `false`
    // and the RHS gate's row fires — exactly the row this group otherwise
    // fences as untouched, now WITH a subject to refuse. The `param` (g10) and
    // `return` (g16) twins of the SAME `typeSource` stay silent: bug 0130
    // §Fix (f) scopes the new conversion to the `let`-annotation call site
    // alone, and `annotationToCompatType` — the conversion `fn` parameter and
    // return positions still call — is unchanged.
    id: "g4 (let, flipped by bug 0130)",
    position: "let",
    typeSource: "{ b: integer }",
    rhsOrBody: "1",
    capture: "{ b: integer }",
    expected: () => [
      line("theta/parse/let-rhs-type-mismatch", [
        ["<name>", "a"],
        ["<expected>", "{ b: integer }"],
        ["<actual>", "integer"],
      ]),
    ],
  },
  {
    // MEASURED AT HEAD, NOT ASSUMED: the bug document's group (g) records
    // `diags []` for this row at 0.71.0. At HEAD a RESOLVED `NamedType` is
    // compat-checked against the initialiser, so the row draws the RHS gate's
    // own diagnostic. This cell doubles as the proof that the `let` RHS gate is
    // live for a name the environment resolves — without it, the absence
    // assertions above could pass against a dead gate.
    id: "g5 (HEAD reading; the doc's 0.71.0 `diags []` is stale)",
    position: "let",
    typeSource: "Cat",
    expected: () => [
      line("theta/parse/let-rhs-type-mismatch", [
        ["<name>", "a"],
        ["<expected>", "Cat"],
        ["<actual>", "integer"],
      ]),
    ],
  },
  { id: "g6", position: "let", typeSource: "Ghost", expected: () => [] },
  { id: "g7", position: "param", typeSource: "integer", expected: () => [] },
  { id: "g8", position: "param", typeSource: "array<integer>", expected: () => [] },
  { id: "g9", position: "param", typeSource: "integer | string", expected: () => [] },
  { id: "g10", position: "param", typeSource: "{ b: integer }", capture: "{ b: integer }", expected: () => [] },
  { id: "g11", position: "param", typeSource: "Cat", expected: () => [] },
  { id: "g12", position: "param", typeSource: "Ghost", expected: () => [] },
  { id: "g13", position: "return", typeSource: "integer", expected: () => [] },
  { id: "g14", position: "return", typeSource: "array<integer>", expected: () => [] },
  { id: "g15", position: "return", typeSource: "integer | string", expected: () => [] },
  { id: "g16", position: "return", typeSource: "{ b: integer }", capture: "{ b: integer }", expected: () => [] },
  { id: "g17", position: "return", typeSource: "Cat", expected: () => [] },
  { id: "g18", position: "return", typeSource: "Ghost", expected: () => [] },
  {
    // `ReturnType ::= Type | "void"` (grammar.md:89) — the one spelling the
    // return slot admits and the other two positions do not.
    id: "g19 (return-only `void`)",
    position: "return",
    typeSource: "void",
    rhsOrBody: " ",
    expected: () => [],
  },
];

describe("bug 0124 (g) — grammar-admitted annotations keep their bytes at all three positions", () => {
  for (const row of CONTROL_ROWS) {
    it(`GREEN (${row.id}, ${row.position}): \`${row.typeSource}\` keeps its emission`, () => {
      expectSequence(
        `${row.id} (${row.position}, ${row.typeSource})`,
        row.position,
        row.typeSource,
        row.expected(),
        {
          ...(row.rhsOrBody === undefined ? {} : { rhsOrBody: row.rhsOrBody }),
          ...(row.capture === undefined ? {} : { capture: row.capture }),
          why: "grammar.md:90–:95 derives this text, so a refusal reaching this row refuses " +
            "input the grammar admits at every `Type` position",
        },
      );
    });
  }

  it("GREEN (g20, `.thetalib` param control): a library `fn` parameter type is unchanged", () => {
    expectSequence("g20 (.thetalib param)", "param", "integer", [], {
      source: `${DECLS}fn f(n: integer): integer { 1 }\n`,
      file: "bug0124.thetalib",
      why: "the library spelling's well-formed annotation stays silent",
    });
  });

  it("GREEN (g21, `.thetalib` return control): a library `fn` return type is unchanged", () => {
    expectSequence("g21 (.thetalib return)", "return", "integer", [], {
      source: `${DECLS}fn f(): integer { 1 }\n`,
      file: "bug0124.thetalib",
      why: "the library spelling's well-formed annotation stays silent",
    });
  });

  it("GREEN (g22, `subagent fn` / `with` param control): the with-clause form is unchanged", () => {
    expectSequence("g22 (subagent fn param)", "param", "integer", [], {
      source:
        '---\nmode: subagent\n---\nsubagent fn g(n: integer): integer with { model: "x" } ' +
        "{ 1 }\nlet inert = 1\ninert\n",
      fnName: "g",
      why: "the `with` clause is a stop for the RETURN slot only and changes no judgement",
    });
  });

  it("GREEN (g23, `subagent fn` / `with` return control): the with-clause form is unchanged", () => {
    expectSequence("g23 (subagent fn return)", "return", "integer", [], {
      source:
        '---\nmode: subagent\n---\nsubagent fn g(): integer with { model: "x" } { 1 }\n' +
        "let inert = 1\ninert\n",
      fnName: "g",
      why: "the return slot stops at the depth-0 `with` (bug 0005 (a)), so the capture is the " +
        "annotation alone",
    });
  });
});

// ===========================================================================
// (f) THE CROSS-POSITION ANTI-WIDENING FENCE — §Fix constraint 5. The four
// sibling positions this report does not own keep BYTE-IDENTICAL diagnostic
// sequences. GREEN at HEAD and required to stay green. Post-0061 and post-0059
// the first three already REFUSE, under their own slugs; those sequences are
// pinned UNCHANGED, which is what makes "one judgement at four positions under
// three honest slugs" a measurement rather than a hope.
// ===========================================================================

describe("bug 0124 (f) — the sibling `Type` positions keep their bytes", () => {
  it("GREEN (f1, bug 0061's schema field type): `schema S { a: integer-- }` keeps its own slug", () => {
    const doc = parseDoc(`${FM}schema S { a: integer-- }\nlet inert = 1\ninert\n`, "bug0124.theta");
    expect(
      diagLines(doc),
      "f1: the field position is bug 0061's and refuses under `schema-type-not-expression`; this " +
        "fix must not add a second diagnostic there, and must not retarget that row either",
    ).toEqual([line("theta/parse/schema-type-not-expression", [["<X>", "S"]])]);
  });

  it("GREEN (f2, bug 0061's alias arm): `schema X = integer--` keeps its own slug", () => {
    const doc = parseDoc(`${FM}schema X = integer--\nlet inert = 1\ninert\n`, "bug0124.theta");
    expect(
      diagLines(doc),
      "f2: the alias position is bug 0061's; the two fixes share a sink and a decline, not a code",
    ).toEqual([line("theta/parse/schema-type-not-expression", [["<X>", "X"]])]);
  });

  it("GREEN (f3, bug 0059's `params:` scalar): the load-phase slug is unchanged", () => {
    const doc = parseDoc(
      "---\nmode: prompt\nparams:\n  p: integer--\n---\nlet inert = 1\ninert\n",
      "bug0124.theta",
    );
    expect(
      diagLines(doc),
      "f3: the `params:` scalar form does not reach `parseType` at all — the frontmatter parser " +
        "owns it — and its refusal is bug 0059's `theta/load/params-type-not-expression`",
    ).toEqual([line("theta/load/params-type-not-expression", [["<param>", "p"]])]);
  });

  it("GREEN (f4, bug 0059's `params:` block): the load-phase slug is unchanged", () => {
    const doc = parseDoc(
      "---\nmode: prompt\nparams:\n  p:\n    type: integer--\n---\nlet inert = 1\ninert\n",
      "bug0124.theta",
    );
    expect(
      diagLines(doc),
      "f4: the block mapping's `type:` right-hand side is the same row's, and this fix reaches " +
        "neither of the two `params:` spellings",
    ).toEqual([line("theta/load/params-type-not-expression", [["<param>", "p"]])]);
  });

  it("GREEN (f5, the `@<T>` capture): `@<Cat-->` draws bug 0203 refusal, not silence", () => {
    // A SEPARATE capture: `parseQuery`'s own inline depth loop
    // (src/parser/theta-document.ts, the `<`-guarded branch of `parseQuery`),
    // with its own registered empty-interior rejection (bug 0014). Bug 0124
    // §Non-goals declined this capture's disposition in terms — "the
    // disposition of that suppression belongs with whoever owns that
    // capture, not here" — and handed it to bug 0203, which minted
    // `theta/parse/query-annotation-type-not-expression` at this exact
    // position. The fixture is byte-identical to what this cell always
    // pinned; only the claimed disposition changes.
    const doc = parseDoc(
      `${FM}${DECLS}let r = @<Cat-->\`hi\`\nr\n`,
      "bug0124.theta",
    );
    expect(
      diagLines(doc),
      "f5: bug 0124's own `theta/parse/annotation-type-not-expression` still does not fire here " +
        "— this capture is not `parseType` — but bug 0203's sibling row does, at the `@<T>` " +
        "position's own registered refusal",
    ).toEqual([plainLine("theta/parse/query-annotation-type-not-expression")]);
  });

  it("GREEN (f6, the `@<T>` capture): `@<Ghost-->` draws bug 0203 refusal, not silence", () => {
    // Bug 0124 §Non-goals handed this capture's disposition to bug 0203, which
    // restores the position's registered coverage by REFUSAL rather than by
    // widening `theta/parse/annotation-type-not-expression`'s own three-position
    // Trigger — see this file's own comment above naming the honest-identity
    // rule that forbids that widening.
    const doc = parseDoc(`${FM}let r = @<Ghost-->\`hi\`\nr\n`, "bug0124.theta");
    expect(
      diagLines(doc),
      "f6: the trailing junk no longer SUPPRESSES `unresolved-named-type` at one of that row's " +
        "OWN five positions without a replacement — bug 0203's row fires in its place",
    ).toEqual([plainLine("theta/parse/query-annotation-type-not-expression")]);
  });

  it("GREEN (f7, control): `@<Ghost>` still draws `unresolved-named-type`", () => {
    // The absence assertions in f5 / f6 and in group (n) are only observations
    // if the channel is live. This cell is that proof.
    const doc = parseDoc(`${FM}let r = @<Ghost>\`hi\`\nr\n`, "bug0124.theta");
    expect(
      diagLines(doc),
      "f7: the `@<T>` position HAS a live diagnostic channel, which is what makes f5's and f6's " +
        "empty sequences measurements rather than dead channels",
    ).toEqual([line("theta/parse/unresolved-named-type", [["<name>", "Ghost"]])]);
  });

  const INVOKE_ROWS: readonly string[] = ["P", "P--", "Ghost", "Ghost--", "integer--"];

  for (const [index, annotation] of INVOKE_ROWS.entries()) {
    it(`GREEN (f${8 + index}, invoke<${annotation}>): the typed-invoke annotation stays silent`, () => {
      // `invoke<T>` has no name walk either (the five-position list excludes
      // it), so there is no differential to observe and nothing for this fix to
      // move. Pinned so a seam-level recogniser — the route §Fix (b)(1) rejects
      // — reds here instead of shipping a four-position widening.
      const doc = parseDoc(
        `${FM}schema P { a: string }\nlet r = invoke<${annotation}>("./child.theta", 1)\nr\n`,
        "bug0124.theta",
      );
      expect(
        diagLines(doc),
        `f${8 + index}: the \`invoke<T>\` capture is a separate site and is not claimed`,
      ).toEqual([]);
    });
  }
});

// ===========================================================================
// (d) THE TYPE-GRAMMAR SEAM over the same texts — the component that OWNS the
// grammar, wired at all three positions, silent by construction. GREEN at HEAD.
// These rows red if a tolerance is removed without a decision, which is exactly
// what §Fix (b)(1) rejects: the seam's blast radius is EVERY caller, including
// the two schema positions and the `@<T>` response annotation.
// ===========================================================================

/** The three `TypePosition`s, in the order the expectation rows below list them. */
const SEAM_POSITIONS: readonly TypePosition[] = ["value", "return", "schema-feeding"];

const VOID_ROW: readonly string[][] = [
  ["theta/parse/void-in-non-return-position"],
  [],
  ["theta/parse/void-in-non-return-position"],
];
const ARITY_ROW: readonly string[][] = [
  ["theta/parse/generic-arity-mismatch"],
  ["theta/parse/generic-arity-mismatch"],
  ["theta/parse/generic-arity-mismatch"],
];
const RESULT_ROW: readonly string[][] = [[], [], ["theta/parse/result-in-schema-position"]];
const SILENT_ROW: readonly string[][] = [[], [], []];

const SEAM_ROWS: ReadonlyArray<readonly [string, readonly string[][]]> = [
  ["integer", SILENT_ROW],
  ["integer--", SILENT_ROW],
  ["integer++", SILENT_ROW],
  ["integer-", SILENT_ROW],
  ["integer+", SILENT_ROW],
  ["integer%", SILENT_ROW],
  ["integer.", SILENT_ROW],
  ["integer==", SILENT_ROW],
  ["integer&&", SILENT_ROW],
  ["integer?", SILENT_ROW],
  ["integer!", SILENT_ROW],
  ["integer:", SILENT_ROW],
  ["integer|", SILENT_ROW],
  ["integer~", SILENT_ROW],
  ["integer^", SILENT_ROW],
  ["integer@", SILENT_ROW],
  ["integer#", SILENT_ROW],
  ["integer$", SILENT_ROW],
  ["integer1", SILENT_ROW],
  ['integer"x"', SILENT_ROW],
  ["--", SILENT_ROW],
  ["--integer", SILENT_ROW],
  ["int--eger", SILENT_ROW],
  ["thisisnotatype", SILENT_ROW],
  ["Cat--", SILENT_ROW],
  ["Ghost--", SILENT_ROW],
  ["integer--|string", SILENT_ROW],
  ["integer|string--", SILENT_ROW],
  ["{b:integer--}", SILENT_ROW],
  ["array<integer>--", SILENT_ROW],
  ["array<integer-->", SILENT_ROW],
  ["void", VOID_ROW],
  ["void--", VOID_ROW],
  ["array<integer,integer>", ARITY_ROW],
  ["array<integer,integer>--", ARITY_ROW],
  ["Result<string,integer>--", RESULT_ROW],
];

describe("bug 0124 (d) — `parseTypeExpression` reports its three position rules and nothing else", () => {
  for (const [text, expected] of SEAM_ROWS) {
    it(`GREEN (d, ${JSON.stringify(text)}): the seam's codes are unchanged at all three positions`, () => {
      const site = {
        file: "bug0124.theta",
        range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
      };
      expect(
        SEAM_POSITIONS.map((position) =>
          parseTypeExpression(text, position, site).map((d) => d.code),
        ),
        `d (${JSON.stringify(text)}): the seam is a POSITION-RULE pass over the node its ` +
          `tolerant parser DID build — \`parse()\` does not require the token stream to be ` +
          `consumed (type-grammar.ts:444), \`parsePrimary\` skips unexpected punctuation by ` +
          `design (\`:486\`), and \`parseUnion\` / \`parseObject\` end their loops on a failed ` +
          `arm or field (\`:449\` / \`:533\`). A trailing operator therefore changes NOTHING ` +
          `about which rule fires. Removing a tolerance to make it a recogniser moves every ` +
          `caller at once, including bug 0061's two schema positions and the \`@<T>\` response ` +
          `annotation, which is why §Fix (b)(1) is rejected — this row reds if that happens ` +
          `without a decision`,
      ).toEqual(expected);
    });
  }
});

// ===========================================================================
// (c) THE CONVERTER IS NOT TOUCHED — `annotationToCompatType` keeps its answers
// byte-for-byte, which is what makes bug 0192's oracle pairs and
// tests/params-declared-type-in-type-layer.test.ts's 32 cells stable BY
// CONSTRUCTION rather than by coincidence. GREEN at HEAD.
// ===========================================================================

describe("bug 0124 (c) — the converter's answers do not move", () => {
  const CONVERTER_ROWS: ReadonlyArray<readonly [string, unknown]> = [
    ["integer", { kind: "prim", name: "integer" }],
    ["integer--", { kind: "named", name: "integer--" }],
    ["array<string>--", { kind: "named", name: "array<string>--" }],
    ["array<integer-->", { kind: "array", element: { kind: "named", name: "integer--" } }],
    ["", undefined],
  ];

  for (const [src, expected] of CONVERTER_ROWS) {
    it(`GREEN (c, ${JSON.stringify(src)}): the converter's answer is unchanged`, () => {
      expect(
        annotationToCompatType(src),
        `c (${JSON.stringify(src)}): the refusal is a SEPARATE recogniser beside the converter, ` +
          `not a third answer inside it — three of the converter's seven callers are other ` +
          `positions' (the alias-arm conversion, \`collectSchemaFields\`, ` +
          `\`paramsFieldBindings\`), so changing its answers would move rows this report does ` +
          `not own`,
      ).toEqual(expected);
    });
  }
});

// ===========================================================================
// (x) THE COMMITTED-CORPUS CENSUS — GOV-15's addition direction, re-derived at
// runtime from `git ls-files` rather than assumed. GREEN at HEAD and after.
// ===========================================================================

/** Every `let` annotation / `fn` parameter type / `fn` return type one document declares. */
function annotationsOf(doc: ThetaDocument): {
  readonly lets: string[];
  readonly params: string[];
  readonly returns: string[];
} {
  const lets: string[] = [];
  const params: string[] = [];
  const returns: string[] = [];
  const walk = (statements: readonly Stmt[]): void => {
    for (const s of statements) {
      if (s.kind === "let") {
        const annotation = (s as LetStmt).annotation;
        if (annotation !== null && annotation.length > 0) {
          lets.push(annotation);
        }
      }
      if (s.kind === "fn") {
        const fn = s as FnDecl;
        for (const p of fn.params) {
          if (p.type.length > 0) {
            params.push(p.type);
          }
        }
        if (fn.returnType !== null && fn.returnType.length > 0) {
          returns.push(fn.returnType);
        }
        walk(fn.body.statements);
      }
    }
  };
  walk(doc.body.statements);
  return { lets, params, returns };
}

describe("bug 0124 (x) — the committed corpus declares no annotation in this class", () => {
  it("GREEN (x1): the census re-derives, and no committed file draws the new code", () => {
    // GOV-15's diagnostic-registry carve-out
    // (source-language-stability.md:25) covers files that load today and stop
    // loading — so the blast radius over the committed corpus has to be
    // MEASURED, not assumed. This cell is that measurement: it walks every
    // committed `.theta` / `.thetalib` through the same load path the rows above
    // use and asserts the corpus is empty of offenders. It reds the moment a
    // committed fixture enters the class, which is what makes
    // `tests/committed-fixture-parse-gate.test.ts` a sufficient discharge for
    // the corpus-wide claim.
    const files = execFileSync("git", ["ls-files", "*.theta", "*.thetalib"], {
      encoding: "utf8",
      cwd: fileURLToPath(new URL("..", import.meta.url)),
    })
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (files.length === 0) {
      throw new Error(
        "harness: `git ls-files '*.theta' '*.thetalib'` listed nothing, so the census has no " +
          "corpus to range over — a loud failure, never a vacuous pass",
      );
    }
    expect(
      [files.filter((f) => f.endsWith(".theta")).length, files.filter((f) => f.endsWith(".thetalib")).length],
      `x1: the census is over ${files.length} committed files; a change in the corpus size means ` +
        `the inventory below must be re-derived rather than trusted. Files: ` +
        `${JSON.stringify(files)}`,
    ).toEqual([32, 2]);

    const lets: string[] = [];
    const params: string[] = [];
    const returns: string[] = [];
    const offenders: string[] = [];
    for (const file of files) {
      const doc = parseDoc(
        readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), "utf8"),
        file,
      );
      const found = annotationsOf(doc);
      lets.push(...found.lets);
      params.push(...found.params);
      returns.push(...found.returns);
      for (const d of doc.diagnostics) {
        if (d.code === CODE) {
          offenders.push(`${file}: ${d.message}`);
        }
      }
    }

    expect(
      [lets.length, params.length, returns.length],
      `x1: the inventory at the three positions this report owns. Observed lets ` +
        `${JSON.stringify([...lets].sort())}, params ${JSON.stringify([...params].sort())}, ` +
        `returns ${JSON.stringify([...returns].sort())}`,
    ).toEqual([10, 3, 2]);
    expect(
      offenders,
      `x1: ZERO offenders — no committed fixture changes disposition when the refusal lands, so ` +
        `\`tests/fixtures/h7a/permitted-codes.json\` stays byte-unchanged and the H9a spawns keep ` +
        `their empty stderr capture. Offenders: ${JSON.stringify(offenders)}`,
    ).toEqual([]);
  });
});
