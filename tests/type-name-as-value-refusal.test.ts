import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher, ParsedFrontmatter } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import { isThetaPanic, surfaceUnexpectedThrow } from "../src/runtime/runtime-panics";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0140 — `collectIdentRoots` (src/parser/theta-document.ts:4774) builds the
// whole-file identifier root scope and folds `fn`, `schema` and `enum` names
// through ONE fall-through `switch` arm (`:4781–4785`). `checkUnknownIdentifiers`
// (`:4850`) seeds its walk from that set and `emitUnknownIdentifier` (`:4860`)
// tests nothing but membership, so a declared `schema` / `enum` name is
// indistinguishable from a `let` binding at every site the walk reaches. A bare
// declaration name at a VALUE position therefore resolves for the parse gate and
// for nothing else: the runtime resolver implements the four-arm list and only it
// (src/runtime/lexical-environment.ts:405, `{ arm: "unresolved" }`), the pure
// host substitutes `null` for every non-`local` arm
// (src/extension/production-theta-producer.ts:6209), the theta registers, and the
// author gets `1`, or `"nullx"`, or a `theta/runtime/null-member-access` abort
// depending on what the callee does with the parameter
// (docs/bugs/0140-bare-schema-reference-value-position-silent.md).
//
// THE ADJUDICATED ROUTE — §Fix (a) route 2 PLUS the doc's explicitly-sanctioned
// "third arrangement", both fixed by the orchestrator's adjudication and not
// re-litigated here:
//
//   theta/parse/type-as-value      at the VALUE positions (a new sibling of
//                                 theta/parse/function-as-value)
//   theta/parse/unknown-identifier at the CALL position, unchanged
//
// The split is the doc's own: d1's spec anchor is `expressions.md:44` ("A bare
// identifier in call position (`name(args)`) resolves in this order"), whose
// disposition for no match is `:51`; a3's anchors are `imports.md:50` (the code
// "is scoped to bare identifiers in expression position") plus the registered
// *Trigger* for `theta/parse/unknown-identifier`, which reads "call or value
// position resolves to nothing in scope". Two different sentences, so two codes.
// Group (d) states that in its own comment and pins it.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/expressions.md:42 (§Identifier resolution), :44 (the call
//     -position sentence), :46–49 (the FOUR arms — a local `let` / parameter, a
//     top-level `fn`, an imported symbol, a callable-set name; no declaration
//     form appears), :51 ("No match is `theta/parse/unknown-identifier`"), :53
//     (the `shadowed-callable-call` rule). :8's supported-forms bullet reads
//     "Identifiers (variables, parameters, function names, schema
//     constructors)" — not a licence, since "function names" is in it and a
//     function name outside call position is `theta/parse/function-as-value`.
//     :21 admits a schema name as a CONSTRUCTOR head, :22 an enum name as a
//     variant-access head, and nowhere else.
//   - docs/spec_topics/schemas.md:3 — "A `schema` declaration introduces a named
//     type."
//   - docs/spec_topics/functions.md:20 — FN-1, the parallel sentence already
//     written for the `fn` case: "function names appear only in call position. A
//     function name used as a value (bound to `let`, passed as an argument)
//     surfaces as `theta/parse/function-as-value`." Group (b) row b1 measures it
//     firing on the same syntactic position where group (a) row a3 is silent.
//   - docs/spec_topics/imports.md:50 — the one sentence that states the
//     unknown-identifier code's reach beyond `:44`'s call position.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:72 (DIAG-2 — the registry
//     is closed, so the new code lands with its row in the same commit) and :74
//     (DIAG-4 — the *Message* column is normative, which is why EVERY message
//     string asserted below is read from the registry at run time through
//     `registryMessageOf` / `msg` and none is written out).
//   - docs/spec_topics/governance/source-language-stability.md:9 (the
//     loads-cleanly predicate every group-(a) fixture satisfies TODAY, which is
//     what puts them inside GOV-15's input set) and :25 (the diagnostic-registry
//     carve-out, which dispositions a code ADDITION as in-scope for "inputs
//     newly brought into the code's emission set"). Group (f) is the corpus half
//     of that sweep.
//
// TIER: unit, offline, deterministic, provider-free. Groups (a)–(d), (f) and (g)
// settle inside one `parseThetaDocument` call over a source string (`parseDoc`,
// tests/helpers/e2e-s1.ts:39 — the shipped front end wrapped in the standard
// inert deps double). Group (e) needs one further in-process pass — the
// production executor harness `tests/non-object-receiver-gate.test.ts:182–292`
// establishes (`parseThetaDocument` → `createProductionProducerDeps` →
// `bindPromptConversation` → `executeBody`) — because its subject is what the
// silent parse REACHES, and a parse-only row cannot observe that. No provider, no
// model, no child process, no session: the runtime rows here are query-free
// prompt-mode sources whose every value is determined by the executor. An
// integration tier would add a round trip to values already fully determined
// before any turn runs; a live tier would make them stochastic. §Witness of the
// bug document reaches the same conclusion ("No live tier applies").
//
// BASELINE. Every row below was re-measured at HEAD `9eb1290d` (v0.121.0) — the
// doc's §Reproduction was recorded at 0.77.0 (`3efdb4ac`) and every cell
// reproduces byte-identically, including the two `[]`-valued controls that would
// otherwise silently rot. The `theta-document.ts` line cites in the doc are
// stale by ~170 lines and are re-derived here against HEAD.
//
// POST-0115 UPDATE (this file, this commit). Bug 0115 wires a compatibility
// check at the reassignment statement itself, judged against the target's
// declared-or-inferred type. Group (a) row a8 (`z = P` on an inferred-`integer`
// `z`) now co-fires `theta/parse/reassign-rhs-type-mismatch` ahead of this
// file's own `theta/parse/type-as-value` — the same statement-ranged-before-
// ident-ranged ordering c2 already exhibits for `let out: string = P`
// (`theta/parse/let-rhs-type-mismatch`). a8's SUBJECT is unmoved: it still
// locks the value-position refusal and `registers(doc) === false`; the new row
// is an ADDITION, not a replacement (GOV-15, source-language-stability.md:25).
//
// WHAT IS RED HERE, AND WHY. Each cell's title carries its colour:
//   - RED (missing behaviour) — every row of group (a) except the two undeclared
//     controls, group (c)'s twelve rows, group (d)'s two rows, and group (e)'s e1 /
//     e3 / e5. Each loads with NO diagnostic naming the identifier today.
//     (a8 is RED for the pre-existing `type-as-value` refusal; the co-firing
//     `reassign-rhs-type-mismatch` this commit adds is bug 0115's, not this
//     file's own subject.)
//   - GREEN at HEAD and required to stay green — group (r) (the registry row,
//     which the fix's DIAG-2 spec edit already carries), all of group (b), all of
//     group (g), group (e)'s e6 control, and group (f). Groups (b) and (g) are
//     the ANTI-WIDENING FENCES: each one reds if the implementation lands at a
//     scope-blind or name-fenced shape instead of inside the scope-tracking
//     identifier walk. If one of them is red, the fix is wrong, not the fence.
//
// NO SILENT SKIPPING: the registry reader THROWS naming the absent row and the
// page it belongs on; the corpus sweep THROWS naming `git` when `git ls-files`
// yields nothing; the executor harness THROWS naming the offending diagnostics
// when a fixture that must parse clean does not, and frames a throw out of
// `executeBody` into a message rather than letting it escape as an opaque
// failure. Nothing here early-returns, branches on the environment, or skips.

// ===========================================================================
// The codes, and the DIAG-4 oracle every asserted message is read from.
// ===========================================================================

/**
 * The code the adjudicated route mints, at the VALUE positions. DIAG-2
 * (diagnostic-shape.md:72) closes the registry, so the row lands in the same
 * commit as the emission site; it is on `code-registry-parse.md` beside
 * `theta/parse/function-as-value`, with the `docs/reference/diagnostics.md`
 * mirror carrying the *Message* column and no *Trigger* column.
 *
 * Registry rows are cited by CODE and page rather than by line throughout this
 * file: inserting a row shifts every later row's line number, which is exactly
 * the citation drift a line cite would bake in.
 */
const TYPE_AS_VALUE = "theta/parse/type-as-value";

/** The code the CALL position keeps (the doc's §Fix "third arrangement"). */
const UNKNOWN_IDENT = "theta/parse/unknown-identifier";

/** The precedent one declaration kind over — FN-1's code (functions.md:20). */
const FUNCTION_AS_VALUE = "theta/parse/function-as-value";

/** The five type-layer rows group (c) measures, and group (b)'s variant control. */
const NON_ARRAY_ITERAND = "theta/parse/non-array-iterand";
const LET_RHS_MISMATCH = "theta/parse/let-rhs-type-mismatch";
/** Bug 0115's minted row — the sibling wired sink a8 now co-fires with. */
const REASSIGN_RHS_TYPE_MISMATCH = "theta/parse/reassign-rhs-type-mismatch";
const MIXED_PLUS = "theta/parse/mixed-plus-operands";
const UNKNOWN_METHOD = "theta/parse/unknown-method";
const NON_STRING_OBJECT_INDEX = "theta/parse/non-string-object-index";
const UNKNOWN_VARIANT = "theta/parse/unknown-variant";

/**
 * The pattern-grammar refusal a capitalised bare `match` pattern head draws
 * (expressions.md's disambiguation: lowercase identifiers bind, capitalised
 * ones refer to constructors or schema names). Sourced from a different
 * sentence and a different site (`parsePattern`) than this file's refusal, so
 * g4 carries it while still proving `type-as-value` stays away.
 */
const PATTERN_HEAD = "theta/parse/capitalised-pattern-head";

/**
 * The two COMPANION codes group (c)'s c11 / c12 positions carry beside the
 * refusal. Each was measured emitting ALONE at its position with the refusal
 * neutralised, so each row asserts a PRE-EXISTING diagnostic unmoved rather
 * than a second one the fix minted. The first is a type-layer read; the second
 * is a call-site SHAPE rule, which is why c12 states its own class.
 */
const OBJECT_FIELD_MISMATCH = "theta/parse/object-field-type-mismatch";
const TOOL_ARG_NOT_OBJECT_LITERAL = "theta/parse/tool-arg-not-object-literal";

/** The code the local-shadow design locks (g2, g3) must draw INSTEAD. */
const BINDING_CASE = "theta/parse/binding-case-mismatch";

/**
 * The code group (c9) / (c10) must NOT draw. Bug 0050's cell u9d
 * (tests/fn-arg-type-mismatch-wired.test.ts:1823–1843) withholds on exactly this
 * read, on the ground stated at `:1841`: "a schema name at a value position is
 * not a value of that schema; the minted read is the identifier's spelling and
 * proves nothing about what the position holds". That judgement is settled and
 * settled the other way; this report claims the identifier-resolution code, and
 * a fix here removes u9d's input from reach by refusing it EARLIER, never by
 * re-opening the argument-type question.
 */
const FN_ARG_MISMATCH = "theta/parse/fn-arg-type-mismatch";

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
 * and take this file's green anti-widening fences down with it.
 */
function registryMessageOf(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: the diagnostics code registry carries no Message row for ${code} — DIAG-4 ` +
        `(docs/spec_topics/diagnostics/diagnostic-shape.md:74) makes that column this file's ` +
        `only oracle, so a missing row is a loud harness failure, never a skip and never a ` +
        `hard-coded fallback. DIAG-2 (:72) makes the row part of bug 0140's fix, in the same ` +
        `commit as the emission site (docs/spec_topics/diagnostics/code-registry-parse.md, ` +
        `beside theta/parse/function-as-value, mirrored on docs/reference/diagnostics.md)`,
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
 * The registry row's normative *Message* with its named placeholders filled
 * (DIAG-4). Each slot's presence in the LIVE template is asserted before it is
 * substituted, so a reworded row reds by naming the slot rather than by silently
 * leaving an unsubstituted `<…>` inside the expectation.
 */
function msg(code: string, fills: ReadonlyArray<readonly [string, string]> = []): string {
  const template = registryMessageOf(code);
  let out = template;
  for (const [slot, value] of fills) {
    expect(
      template,
      `DIAG-4: the ${code} row's Message must still carry the ${slot} slot this file renders; ` +
        `observed template ${JSON.stringify(template)}`,
    ).toContain(slot);
    out = out.replaceAll(slot, value);
  }
  return out;
}

/** One expected `error <code>: <rendered message>` line. */
function errLine(code: string, fills: ReadonlyArray<readonly [string, string]> = []): string {
  return `error ${code}: ${msg(code, fills)}`;
}

/** The refusal's rendered line for one declared schema / enum name. */
function typeAsValueLine(name: string): string {
  return errLine(TYPE_AS_VALUE, [["<name>", name]]);
}

/** The undeclared control's rendered line, whose code AND message must not move. */
function unknownIdentLine(name: string): string {
  return errLine(UNKNOWN_IDENT, [["<name>", name]]);
}

// ===========================================================================
// Parse harness.
// ===========================================================================
//
// `parseDoc` (tests/helpers/e2e-s1.ts:39) is the shipped whole-file entry point
// `parseThetaDocument` wrapped in the standard inert deps — an in-band no-op
// system-note channel and a resolving `model:` matcher. No behaviour is stubbed:
// the lexer, the parser, the type layer and the frontmatter reader under
// assertion are the production ones.

/** The prompt-mode frontmatter prelude §Observed at prepends to every parse row. */
const FM = "---\nmode: prompt\n---\n";

/** Parse one body under the standard frontmatter. */
function parse(body: string, frontmatter: string = FM): ThetaDocument {
  return parseDoc(frontmatter + body, "bug0140.theta");
}

/**
 * The WHOLE aggregated diagnostic code list, unfiltered, in report order — the
 * `codes ::` line of the bug document's §Reproduction. Unfiltered and ordered is
 * the point: neither an extra diagnostic, nor a missing one, nor a right
 * diagnostic in the wrong order can hide inside a containment check.
 */
function codesOf(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => d.code);
}

/** Every diagnostic rendered `<severity> <code>: <message>`, in report order. */
function linesOf(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`);
}

/**
 * The whole ordered code list for one row. Asserted BEFORE any message
 * expectation on every cell, so a red at HEAD names the symptom the bug reports
 * — an identifier position that draws nothing — rather than a message mismatch.
 */
function expectCodes(
  label: string,
  doc: ThetaDocument,
  expected: readonly string[],
  why: string,
): void {
  expect(
    codesOf(doc),
    `${label}: ${why}\n  rendered diagnostics: ${JSON.stringify(linesOf(doc))}`,
  ).toEqual(expected);
}

/** The whole ordered `severity code: message` list for one row (DIAG-4). */
function expectLines(
  label: string,
  doc: ThetaDocument,
  expected: readonly string[],
  why: string,
): void {
  expect(linesOf(doc), `${label}: ${why}`).toEqual(expected);
}

/**
 * `hasLoadParseError`'s predicate (src/extension/production-composition.ts:2214
 * — module-private, so restated rather than imported), evaluated over the
 * diagnostics a fixture actually emitted: a theta registers unless some
 * diagnostic is an error-severity `theta/load/*` or `theta/parse/*`. This is the
 * reachability link between the refusal and a theta that does not run — the
 * whole reason the bug is a load hazard and not a diagnostic-correctness
 * question. Warnings never block registration.
 */
function registers(doc: ThetaDocument): boolean {
  return !doc.diagnostics.some(
    (d: Diagnostic) =>
      d.severity === "error" &&
      (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")),
  );
}

// ===========================================================================
// (r) THE REGISTRY ROW EVERY MESSAGE IN THIS FILE IS DERIVED FROM.
// GREEN at HEAD — the fix's DIAG-2 spec edit lands with the row, and this group
// is what makes every other red in this file attributable to BEHAVIOUR rather
// than to a missing oracle.
// ===========================================================================

describe("bug 0140 (r) — the registry row the value-position refusal needs", () => {
  it(`GREEN (r1): the registry carries an E/parse row for ${TYPE_AS_VALUE}`, () => {
    // DIAG-2 (diagnostic-shape.md:72) closes the registry: a diagnostic with no
    // row has no authority to exist, and a row with no asserting test fails the
    // same gate from the other side (tests/code-registry.test.ts). This file is
    // the asserting test.
    const row = registryRowOf(TYPE_AS_VALUE);
    expect(
      row.namespace,
      "the judgement is made while parsing the body, so it lives in the `parse` namespace — " +
        "which is also what `hasLoadParseError` reads to withhold registration",
    ).toBe("parse");
    expect(
      row.severity,
      "source-language-stability.md:9 reads the loads-cleanly predicate off the *Severity* " +
        "column; a `W` row would leave every group-(a) program registered and running with a " +
        "`null` crossing a typed parameter boundary",
    ).toBe("E");
    expect(row.phase, "the judgement is made during the body parse, not at runtime").toBe("parse");
  });

  it("GREEN (r2): the *Message* renders exactly the category-5 `<name>` slot", () => {
    // The placeholder SET is pinned, not merely the slot's presence. `<name>` is
    // category 5's identifier-shaped, unquoted placeholder
    // (docs/spec_topics/diagnostics/placeholder-rendering-b.md), the same slot
    // `theta/parse/function-as-value` and `theta/parse/unknown-identifier` both
    // render, so the new row needs no placeholder-table edit. A second,
    // source-TEXT slot would be admissible under no category of a closed
    // surface; pinning the set is what makes a later one red instead of passing.
    expect(
      placeholdersOf(registryMessageOf(TYPE_AS_VALUE)),
      "one slot — the declared name — so the message can name the declaration the author wrote",
    ).toEqual(["<name>"]);
  });

  it("GREEN (r3): the rendered message differs per name, and from its two siblings", () => {
    // Anti-vacuity for `typeAsValueLine`: a template that ignored its slot would
    // make every message assertion below trivially satisfiable. The sibling
    // comparison is the honest-identity check — the new code is minted precisely
    // because `unknown identifier 'P'` misdescribes a name declared three lines
    // up, and because `function-as-value`'s text is about `fn` names.
    expect(typeAsValueLine("P")).not.toBe(typeAsValueLine("C"));
    expect(typeAsValueLine("P")).not.toBe(unknownIdentLine("P"));
    expect(typeAsValueLine("P")).not.toBe(errLine(FUNCTION_AS_VALUE, [["<name>", "P"]]));
  });
});

// ===========================================================================
// (a) THE REPORTED SHAPE — three declaration kinds, twenty-three value-position
// rows, and the two UNDECLARED controls beside them.
// RED (missing behaviour) at HEAD: a1/a3/a5–a25 each load with ZERO diagnostics.
// ===========================================================================
//
// a1 and a2 differ by one character in the argument and by whether the name is
// DECLARED. The declared one is the silent one. a3/a4 are the same pair with no
// call involved. a5 and a6 extend it to the other two declaration forms the one
// `switch` arm at theta-document.ts:4781–4785 folds (`enum`, and the alias form
// `schema L = string`, which `collectBodyTypes` records in `bodyTypes.schemas`
// at `:1264` exactly as it records the object form). a7–a11 are five further
// value positions.
//
// a12–a25 close the REST of the registered *Trigger*'s enumeration. That clause
// states its own emission set exhaustively ("That rule generates the list, and
// the list is exhaustive") and DIAG-2 (diagnostic-shape.md:72) makes the row
// normative, so a position the clause names with no row here is an unwitnessed
// normative claim. Each id names the clause phrase it closes; each `why` names
// why the position is a VALUE position and which walk arm reaches it. All
// fourteen were measured loading with ZERO diagnostics against a neutralised
// refusal, so none of them duplicates a position a1–a11 already covered under
// another name. The two remaining clause positions carry a COMPANION diagnostic
// and are therefore rows c11 / c12, in the group whose subject that is.
//
// The two controls are the DIAG-3 / DIAG-4 fence: a2 and a4 draw
// `theta/parse/unknown-identifier` with its registered message today, and a
// route that renamed or reworded that emission would be a change deferred to
// theta 2.0 (diagnostic-shape.md:74). They carry code AND message for that
// reason, and they are also the anti-vacuity proof that the walk reaches these
// positions at all.

interface Row {
  readonly id: string;
  readonly body: string;
  /** The whole ordered code list after the fix. */
  readonly codes: readonly string[];
  /** The whole ordered rendered-line list, where the message is the row's point. */
  readonly lines?: readonly string[];
  readonly why: string;
}

const A_ROWS: readonly Row[] = [
  {
    id: "a1 (argument position — the reported shape)",
    body: "schema P { a: number }\nfn g(s: string): number { 1 }\nlet out = g(P)\nout\n",
    codes: [TYPE_AS_VALUE],
    lines: [typeAsValueLine("P")],
    why:
      "the argument expression names a type, and `expressions.md:46–49` lists four resolution " +
      "arms of which a declaration form is none; §Why it matters records what the silence buys " +
      "— `null` bound to `s: string` with nothing between the argument and the parameter slot " +
      "testing it (src/runtime/statement-executor.ts:416)",
  },
  {
    id: "a2 (CONTROL — the same position, an UNDECLARED Q)",
    body: "schema P { a: number }\nfn g(s: string): number { 1 }\nlet out = g(Q)\nout\n",
    codes: [UNKNOWN_IDENT],
    lines: [unknownIdentLine("Q")],
    why:
      "a2 and a1 differ by one character; a2's code and message must not move (DIAG-3 / DIAG-4, " +
      "diagnostic-shape.md:74 — a rename or reword is deferred to theta 2.0)",
  },
  {
    id: "a3 (`let` RHS)",
    body: "schema P { a: number }\nlet out = P\nout\n",
    codes: [TYPE_AS_VALUE],
    lines: [typeAsValueLine("P")],
    why:
      "the same syntactic position as b1's `fn` name, which FN-1 (functions.md:20) already " +
      "refuses. `schemas.md:3` — a `schema` declaration introduces a named TYPE",
  },
  {
    id: "a4 (CONTROL — an UNDECLARED name in the `let` RHS)",
    body: "let out = Zzz\nout\n",
    codes: [UNKNOWN_IDENT],
    lines: [unknownIdentLine("Zzz")],
    why: "the undeclared control keeps its code AND its message",
  },
  {
    id: "a5 (a bare `enum` name)",
    body: "enum C { Red, Blue }\nlet out = C\nout\n",
    codes: [TYPE_AS_VALUE],
    lines: [typeAsValueLine("C")],
    why:
      "`expressions.md:22` admits an enum name as the head of `Enum.Variant` and nowhere else; " +
      "`schemas.md:97` assigns `Enum.Variant` a static type and says nothing about a bare `Enum`",
  },
  {
    id: "a6 (a bare ALIAS-schema name)",
    body: "schema L = string\nlet out = L\nout\n",
    codes: [TYPE_AS_VALUE],
    lines: [typeAsValueLine("L")],
    why:
      "the alias form is a `schema` statement, so `collectBodyTypes` records it in " +
      "`bodyTypes.schemas` (theta-document.ts:1264) and the same fold reaches it",
  },
  {
    id: "a7 (TAIL position)",
    body: "schema P { a: number }\nP\n",
    codes: [TYPE_AS_VALUE],
    lines: [typeAsValueLine("P")],
    why:
      "a block's / theta's tail is the FINAL VALUE, not a discarded statement — which is the " +
      "line the registry *Trigger* draws against the no-op statement class group (g5) pins " +
      "silent. This is also the position the foreign witness in " +
      "tests/schema-field-name-case.test.ts b4 sits at",
  },
  {
    id: "a8 (`let mut` reassignment RHS)",
    body: "schema P { a: number }\nlet mut z = 1\nz = P\nz\n",
    // POST-0115: this cell now co-fires with `theta/parse/reassign-rhs-type-mismatch`
    // (bug 0115), on the same statement and ahead of this row — the ordering
    // c2 below already explains for its own sibling pair (the compatibility
    // sink fires before the value-position refusal). `z` is inferred `integer`
    // from `let mut z = 1`; `P` used as a value types as the nominal `named`
    // schema reference `checkCompatible` resolves through `TypeEnv` (TYPE-10),
    // which is `⋢ integer`, so 0115's check reports first. This cell keeps its
    // group-(a) SUBJECT — the value-position refusal, and `registers(doc) ===
    // false` — the compatibility row is an ADDITION beside it, not a
    // replacement.
    codes: [REASSIGN_RHS_TYPE_MISMATCH, TYPE_AS_VALUE],
    lines: [errLine(REASSIGN_RHS_TYPE_MISMATCH, [["<name>", "z"], ["<expected>", "integer"], ["<actual>", "P"]]), typeAsValueLine("P")],
    why:
      "§Summary measures this row rebinding `z` to `null` at run time; 0115 now judges the " +
      "write itself, ahead of the value-position refusal, the same ordering c2's own `why` " +
      "already explains for `let out: string = P`",
  },
  {
    id: "a9 (array element)",
    body: "schema P { a: number }\nlet out = [P]\nout\n",
    codes: [TYPE_AS_VALUE],
    lines: [typeAsValueLine("P")],
    why: "an array literal's elements are value positions",
  },
  {
    id: "a10 (`fn` return / body tail)",
    body: "schema P { a: number }\nfn f(): number { P }\nlet out = f()\nout\n",
    codes: [TYPE_AS_VALUE],
    lines: [typeAsValueLine("P")],
    why:
      "the `fn` body is walked with a scope reseeded from the whole-file roots plus the " +
      "parameters (`walkIdentStmt`'s `case \"fn\"`, theta-document.ts:4936–4945), so the " +
      "declaration name is reachable there and must be refused there. An ordinary `fn`'s " +
      "return annotation is not compat-checked at HEAD, so the refusal stands alone",
  },
  {
    id: "a11 (`==` operand)",
    body: "schema P { a: number }\nlet out = P == 1\nout\n",
    codes: [TYPE_AS_VALUE],
    lines: [typeAsValueLine("P")],
    why: "an operator operand is a value position",
  },
  {
    id: "a12 (`if` CONDITION — Trigger clause: an `if` or `while` condition)",
    body: "schema P { a: number }\nif (P) { 1 }\n1\n",
    codes: [TYPE_AS_VALUE],
    lines: [typeAsValueLine("P")],
    why:
      "a condition is READ for its value — the branch taken is a function of it — and " +
      "`walkIdentStmt`'s `case \"if\"` walks it in the ENCLOSING scope " +
      "(theta-document.ts:5045), ahead of the per-branch scope copies at :5046–:5052. " +
      "`theta/parse/non-boolean-condition` does NOT join the refusal, and not because the check " +
      "is absent at parse — `if (1) { 1 }` draws it — but because the checker declines a bare " +
      "declaration name's static type, measured before and after the fix. What the type layer " +
      "should make of that name is bug 0136's and bug 0126's substrate, which this report does " +
      "not claim (see group (c)'s header)",
  },
  {
    id: "a13 (`while` CONDITION — Trigger clause: an `if` or `while` condition)",
    body: "schema P { a: number }\nwhile (P) { break }\n1\n",
    codes: [TYPE_AS_VALUE],
    lines: [typeAsValueLine("P")],
    why:
      "the same clause at the other loop head, and a separate walk arm: `case \"while\"` walks " +
      "the condition at theta-document.ts:5057. The body's `break` keeps it a non-degenerate " +
      "block, and the condition checker declines the name exactly as at a12, so the whole list " +
      "is one code",
  },
  {
    id: "a14 (`return` OPERAND — Trigger clause: a `return` operand)",
    body: "schema P { a: number }\nfn f(): number { return P }\nlet out = f()\nout\n",
    codes: [TYPE_AS_VALUE],
    lines: [typeAsValueLine("P")],
    why:
      "the operand of an early `return` is the value the call produces, and it reaches the walk " +
      "through `walkIdentStmt`'s `case \"return\"` (theta-document.ts:5079) — a DIFFERENT arm " +
      "from the block-tail site a10 pins, which `walkIdentBlock` reaches at :5020–:5022. " +
      "`theta/parse/return-no-common-type` ranges over a theta or annotation-less-`fn` body " +
      "(its registry row) and this `fn` carries `: number`, so the refusal stands alone",
  },
  {
    id: "a15 (ternary CONDITION — Trigger clause: a ternary's condition or either branch)",
    body: "schema P { a: number }\nlet out = P ? 1 : 2\nout\n",
    codes: [TYPE_AS_VALUE],
    lines: [typeAsValueLine("P")],
    why:
      "`case \"ternary\"` walks all three operands in the same scope " +
      "(theta-document.ts:5132–:5134); the condition is :5132. The parser's `?` " +
      "disambiguation (theta-document.ts:3563–:3565) makes this a ternary head rather than " +
      "the postfix `?` a19 pins, so the two clause words need two rows. The condition checker " +
      "reaches a ternary head too — `1 ? 1 : 2` draws `theta/parse/non-boolean-condition` — and " +
      "declines the declaration name as at a12",
  },
  {
    id: "a16 (ternary CONSEQUENT branch — Trigger clause: … or either branch)",
    body: "schema P { a: number }\nlet out = true ? P : 1\nout\n",
    codes: [TYPE_AS_VALUE],
    lines: [typeAsValueLine("P")],
    why:
      "the taken branch IS the expression's value; theta-document.ts:5133. The registry " +
      "registers no ternary-arm reconciliation row — `theta/parse/match-arm-type-mismatch` is " +
      "the `match` analogue and does not reach a ternary, so `true ? 1 : \"x\"` draws nothing — " +
      "and the refusal is therefore the whole list",
  },
  {
    id: "a17 (ternary ALTERNATE branch — Trigger clause: … or either branch)",
    body: "schema P { a: number }\nlet out = true ? 1 : P\nout\n",
    codes: [TYPE_AS_VALUE],
    lines: [typeAsValueLine("P")],
    why:
      "the clause says EITHER branch, so the branch a constant condition never selects carries " +
      "its own row: theta-document.ts:5134. The walk is syntactic, and static reachability is " +
      "no licence — the same ground `theta/parse/return-no-common-type` states for `return` " +
      "operands 'regardless of static reachability'",
  },
  {
    id: "a18 (UNARY operand — Trigger clause: a unary or `?` operand)",
    body: "schema P { a: number }\nlet out = !P\nout\n",
    codes: [TYPE_AS_VALUE],
    lines: [typeAsValueLine("P")],
    why:
      "there is no `unary` node to reach: the parser models `!x` / `-x` as a `binary` carrying a " +
      "SYNTHETIC `null` left operand and the real operand on the RIGHT " +
      "(theta-document.ts:3538–:3552), so the position is reached by `case \"binary\"`'s right " +
      "walk at :5129. a11 / c3 / c4 exercise that arm from the two-operand side only, which is " +
      "what leaves the clause's `unary` word unwitnessed without this row",
  },
  {
    id: "a19 (`?` OPERAND — Trigger clause: a unary or `?` operand)",
    body: "schema P { a: number }\nlet out = P?\nout\n",
    codes: [TYPE_AS_VALUE],
    lines: [typeAsValueLine("P")],
    why:
      "the postfix error-propagation `?` is its own node and reaches `case \"try\"` " +
      "(theta-document.ts:5137). `theta/parse/question-on-non-result` is live at parse here too — " +
      "a `?` on an `integer` binding draws it — and declines the declaration name; " +
      "`theta/parse/question-outside-result-fn` does not fire in this shape at all. Both were " +
      "measured absent with the refusal neutralised as well, so the single-code list is the " +
      "position's own shape",
  },
  {
    id: "a20 (`match` SCRUTINEE — Trigger clause: a `match` scrutinee or arm body)",
    body: "schema P { a: number }\nlet out = match P { _ => 1 }\nout\n",
    codes: [TYPE_AS_VALUE],
    lines: [typeAsValueLine("P")],
    why:
      "the scrutinee is the value the arms dispatch on, and `case \"match\"` walks it in the " +
      "ENCLOSING scope (theta-document.ts:5182) ahead of the per-arm scopes " +
      "`collectPatternBindings` seeds at :5184–:5185. The single wildcard arm leaves no " +
      "arm-type reconciliation to run, so the refusal is the whole list",
  },
  {
    id: "a21 (`match` ARM BODY — Trigger clause: a `match` scrutinee or arm body)",
    body: "schema P { a: number }\nlet out = match 1 { _ => P }\nout\n",
    codes: [TYPE_AS_VALUE],
    lines: [typeAsValueLine("P")],
    why:
      "an arm body is an EXPRESSION and the selected arm's value is the match's value; it is " +
      "walked under `armScope` (theta-document.ts:5186). g4 is the contrast that keeps this " +
      "scope-exact — there the arm's own pattern binder claims the spelling and the read is the " +
      "binder's, not the declaration's",
  },
  {
    id: "a22 (index SUBSCRIPT — Trigger clause: an index subscript)",
    body: "schema P { a: number }\nlet xs = [1]\nlet out = xs[P]\nout\n",
    codes: [TYPE_AS_VALUE],
    lines: [typeAsValueLine("P")],
    why:
      "the SUBSCRIPT, not the receiver: `case \"index\"` walks the receiver at " +
      "theta-document.ts:5157 — the position c6 and c8 pin as `P[0]` and `P[\"a\"]` — and the " +
      "index expression at :5158, and this row is the second of those two sites. The receiver " +
      "here is a genuine `array<integer>`, so no receiver-side type row joins the refusal",
  },
  {
    id: "a23 (METHOD-CALL ARGUMENT — Trigger clause: an argument of a … method call)",
    body: 'schema P { a: number }\nlet s = "a,b"\nlet out = s.split(P)\nout\n',
    codes: [TYPE_AS_VALUE],
    lines: [typeAsValueLine("P")],
    why:
      "the ARGUMENT, not the receiver: `case \"method-call\"` walks the receiver at " +
      "theta-document.ts:5162 — the position c5 pins as `P.frobnicate()` — and each argument at " +
      ":5163–:5165, and this row is the second of those two sites. The receiver is a real " +
      "`string` and `split` a real stdlib method, so no `theta/parse/unknown-method` joins the " +
      "refusal and the argument position is measured on its own",
  },
  {
    id: "a24 (`Result` CONSTRUCTOR argument — Trigger clause: an argument of a … `Result` constructor)",
    body: "schema P { a: number }\nlet out = Ok(P)\nout\n",
    codes: [TYPE_AS_VALUE],
    lines: [typeAsValueLine("P")],
    why:
      "`Ok(…)` / `Err(…)` is a dedicated `result-ctor` node and NOT a `call` (the " +
      "`ResultCtorExpr` doc comment states why), so its argument is reached by " +
      "`case \"result-ctor\"` at theta-document.ts:5179 and never by the `case \"call\"` arm a1 " +
      "exercises — which is why the *Trigger* names it separately and why it needs its own row",
  },
  {
    id: "a25 (`invoke` ARGUMENT — Trigger clause: an argument of a … `invoke`)",
    body: 'schema P { a: number }\nlet out = invoke("./sub.theta", P)\nout\n',
    codes: [TYPE_AS_VALUE],
    lines: [typeAsValueLine("P")],
    why:
      "`invoke` is its own node too, and its callee is a PATH LITERAL rather than an " +
      "identifier, so `case \"invoke\"` walks the arguments and nothing else " +
      "(theta-document.ts:5141–:5143). The path names no resolvable callee here, so the " +
      "`invoke` arity and argument-type rows defer by their own registry triggers and the " +
      "refusal is the whole list",
  },
];

describe("bug 0140 (a) — a bare declaration name at a value position is refused", () => {
  for (const row of A_ROWS) {
    const colour = row.codes[0] === UNKNOWN_IDENT ? "GREEN" : "RED";
    it(`${colour} (${row.id}): the whole code list is ${JSON.stringify(row.codes)}`, () => {
      const doc = parse(row.body);
      expectCodes(row.id, doc, row.codes, row.why);
      if (row.lines !== undefined) {
        expectLines(row.id, doc, row.lines, `DIAG-4 — ${row.why}`);
      }
      expect(
        registers(doc),
        `${row.id}: an error-severity theta/parse/* code denies registration ` +
          `(hasLoadParseError, src/extension/production-composition.ts:2214). At HEAD every ` +
          `group-(a) program registers and runs, which is what makes this a load hazard`,
      ).toBe(false);
    });
  }
});

// ===========================================================================
// (b) THE CONTRAST AND THE LICENSED POSITIONS — §Fix (b)'s constraint set.
// GREEN at HEAD and required to stay green.
// ===========================================================================
//
// These four rows are the fence. b3 reds if a fix removes enum names from the
// root set OUTRIGHT, because `walkIdentExpr`'s `case "member"`
// (theta-document.ts:5006–5009) treats the receiver as an identifier-resolution
// site — the licence for `Enum.Variant` at `expressions.md:22` therefore has to
// be spent at that arm, not by leaving the name in the value scope. b2 and b5
// red if a fix fences by NAME rather than by node kind and position: the
// constructor head reaches the walk as an `object` node with a `typeName`, never
// as an `ident`, and a `Type` position is not this walk's business at all. b1 is
// the precedent the new code is minted beside and must be left unperturbed.

const B_ROWS: readonly Row[] = [
  {
    id: "b1 (`fn` name at a value position — the precedent, unperturbed)",
    body: "fn h(): number { 1 }\nlet out = h\nout\n",
    codes: [FUNCTION_AS_VALUE],
    lines: [errLine(FUNCTION_AS_VALUE, [["<name>", "h"]])],
    why:
      "FN-1 (functions.md:20) is the written sentence behind it, emitted from the STRUCTURAL " +
      "walk's `case \"ident\"` (theta-document.ts:6864–6865, the `refs.fnNames` test at :6865) " +
      "through `checkFunctionReference` (src/parser/functions.ts). The adjudicated route puts " +
      "the new judgement in the SCOPE-TRACKING identifier walk instead, so this emission is " +
      "untouched — a duplicate or a replacement here reds",
  },
  {
    id: "b2 (constructor head)",
    body: "schema P { a: number }\nlet out = P { a: 1 }\nout\n",
    codes: [],
    why:
      "`expressions.md:21` admits `Schema { field: expr, ... }`, and the head reaches the walk " +
      "as an `object` node carrying a `typeName`, not as an `ident` — so it does not depend on " +
      "the fold and no position-and-kind-scoped refusal can reach it. A fix that fenced by NAME " +
      "would red here",
  },
  {
    id: "b3 (THE PIN — the `Enum.Variant` receiver)",
    body: "enum C { Red }\nlet out = C.Red\nout\n",
    codes: [],
    why:
      "the receiver IS an identifier-resolution site (theta-document.ts:5006–5009), so removing " +
      "enum names from the root set outright makes this draw `unknown-identifier`. " +
      "`expressions.md:22` licenses the form, so the licence must be spent at the `member` arm " +
      "itself. THIS ROW IS THE ROUTE TEST: it reds for route 1 and for any fix that refuses a " +
      "declared name without excepting this receiver",
  },
  {
    id: "b4 (CONTROL — the variant checker still answers)",
    body: "enum C { Red }\nlet out = C.Blue\nout\n",
    codes: [UNKNOWN_VARIANT],
    lines: [
      errLine(UNKNOWN_VARIANT, [
        ["<variant>", "Blue"],
        ["<enum>", "C"],
      ]),
    ],
    why:
      "b3's licence must not become a blanket exemption for the whole `member` arm: the variant " +
      "name is still checked, and its message still names both the variant and the enum",
  },
  {
    id: "b5 (type annotation plus constructor, in a program that runs)",
    body:
      "schema P { a: number }\nfn f(x: P): number { x.a }\nlet p = P { a: 1 }\nlet out = f(p)\nout\n",
    codes: [],
    why:
      "`P` appears at a `Type` position and at a constructor head. No identifier-resolution " +
      "change reaches either — `expressions.md`'s §Identifier resolution ranges over expression " +
      "positions, and a `fn` parameter's type annotation is not one",
  },
];

describe("bug 0140 (b) — the `fn` precedent and the three licensed positions", () => {
  for (const row of B_ROWS) {
    it(`GREEN (${row.id}): the whole code list is ${JSON.stringify(row.codes)}`, () => {
      const doc = parse(row.body);
      expectCodes(row.id, doc, row.codes, row.why);
      if (row.lines !== undefined) {
        expectLines(row.id, doc, row.lines, `DIAG-4 — ${row.why}`);
      }
    });
  }
});

// ===========================================================================
// (c) WHAT THE SILENT IDENTIFIER REACHES IN THE TYPE LAYER — re-derived AT HEAD.
// RED (missing behaviour): each row gains the new code BESIDE what it already
// draws, or draws it alone.
// ===========================================================================
//
// `#typeExpr`'s `ident` arm answers `bindings.get(node.name) ?? { kind: "named",
// name: node.name }` (src/parser/static-type-inference.ts:239). The walk's
// `bindings` map holds nothing for a bare `P`, so the read is `named "P"`, which
// resolves against the `TypeEnv` to the author's own declaration — the mechanism
// bug 0038 hardened for PROTOTYPE names and deliberately left intact for
// declared ones. Six registered messages then report the schema where a value
// was expected, and c6's code fires ONLY for an object-value receiver
// (`code-registry-parse.md`, `theta/parse/non-string-object-index`), so the check
// has concluded that `P` holds an object. Each of those messages is emitted
// about an expression that holds no value at all (group (e) measures the `null`).
//
// THE ORDER IS PART OF THE ASSERTION. Every diagnostic funnels through
// `assembleDiagnostics` (src/diagnostics/diagnostic.ts:107–126), which sorts by
// `(file, line, col)` with a STABLE sort and does NOT read the END column
// (`:116–126`), so diagnostics tying on the start key keep their collected
// order (`:114–115` states that in terms). That is what puts the new code first
// where it shares a start column with the companion row (c1's iterand `P`, c3's
// `P + 1`, c5's `P.frobnicate()`, c6's `P[0]`, c11's `Q { b: P }`, c12's
// `read(P)` — each companion is ranged from the same column the ident occupies,
// and the identifier pass is collected first: `checkUnknownIdentifiers`'s call
// (theta-document.ts:908) precedes `checkTypeLayer`'s (`:981`), so
// `unknownIdentDiags` precedes `typeLayerDiags` in the `assembleDiagnostics([…])`
// array (`:997–1009`)) and second where
// the companion is ranged from an earlier column (c2's whole-`let` range at
// column 1, c4's `"x" + P` whose ident sits at column 17). Pinning the order
// rather than tolerating it is what makes a re-ordered emission visible.
//
// c11 and c12 extend the group to the last two positions the registered
// *Trigger* names whose row carries a companion at all: an object-field value,
// whose companion is the sixth type-layer message reporting the schema, and a
// Pi-tool call argument, whose companion is the call-site SHAPE rule rather than
// a type-layer read. Both companions were measured emitting ALONE at their
// position with the refusal neutralised, so each row asserts a pre-existing
// diagnostic unmoved beside the new one — the group's whole-list convention, no
// filtering and no `toContain`.
//
// This report does NOT claim the mint. §Non-goals: what `#typeExpr`'s `ident`
// arm should return is bug 0136's and bug 0126's substrate. A fix here makes
// these inputs unreachable in production by refusing them earlier; it does not
// change what the arm returns for the inputs that remain, which is why every
// pre-existing type-layer row below is asserted UNMOVED beside the new code.

const C_ROWS: readonly Row[] = [
  {
    id: "c1 (`for` iterand)",
    body: "schema P { a: array<string> }\nfor y in P { y }\n1\n",
    codes: [TYPE_AS_VALUE, NON_ARRAY_ITERAND],
    lines: [typeAsValueLine("P"), errLine(NON_ARRAY_ITERAND, [["<type>", "P"]])],
    why:
      "the iterand is a value position AND a `for`-iterand judgement; the pre-existing message " +
      "names the schema (`got P`) about an expression holding nothing",
  },
  {
    id: "c2 (annotated `let` RHS)",
    body: "schema P { a: number }\nlet out: string = P\nout\n",
    codes: [LET_RHS_MISMATCH, TYPE_AS_VALUE],
    lines: [
      errLine(LET_RHS_MISMATCH, [
        ["<name>", "out"],
        ["<expected>", "string"],
        ["<actual>", "P"],
      ]),
      typeAsValueLine("P"),
    ],
    why:
      "the `let`-ranged row sorts ahead of the ident-ranged one; an author reading `expected " +
      "string, got P` is told the position holds a `P`, and group (e) row e2 measures `null`",
  },
  {
    id: "c3 (`+` left operand)",
    body: "schema P { a: number }\nlet out = P + 1\nout\n",
    codes: [TYPE_AS_VALUE, MIXED_PLUS],
    lines: [
      typeAsValueLine("P"),
      errLine(MIXED_PLUS, [
        ["<left>", "P"],
        ["<right>", "integer"],
      ]),
    ],
    why: "both diagnostics start at the operand's column, so the identifier pass's lands first",
  },
  {
    id: "c4 (`+` right operand)",
    body: 'schema P { a: number }\nlet out = "x" + P\nout\n',
    codes: [MIXED_PLUS, TYPE_AS_VALUE],
    lines: [
      errLine(MIXED_PLUS, [
        ["<left>", "string"],
        ["<right>", "P"],
      ]),
      typeAsValueLine("P"),
    ],
    why: "the binary expression starts at column 11 and the ident at column 17, so the order flips",
  },
  {
    id: "c5 (method-call receiver)",
    body: "schema P { a: number }\nlet out = P.frobnicate()\nout\n",
    codes: [TYPE_AS_VALUE, UNKNOWN_METHOD],
    lines: [
      typeAsValueLine("P"),
      errLine(UNKNOWN_METHOD, [
        ["<method>", "frobnicate"],
        ["<type>", "P"],
      ]),
    ],
    why:
      "the method-call receiver is an identifier-resolution site (theta-document.ts:5014–5020) " +
      "and a consuming position",
  },
  {
    id: "c6 (index receiver — the object-value classification)",
    body: "schema P { a: number }\nlet out = P[0]\nout\n",
    codes: [TYPE_AS_VALUE, NON_STRING_OBJECT_INDEX],
    lines: [typeAsValueLine("P"), errLine(NON_STRING_OBJECT_INDEX, [["<type>", "integer"]])],
    why:
      "the sharpest of the six: this code fires only for an OBJECT-VALUE receiver, so the check " +
      "has concluded `P` holds an object. The index arm is theta-document.ts:5010–5013",
  },
  {
    id: "c7 (member read — the e4 panic route)",
    body: "schema P { a: number }\nlet out = P.a\nout\n",
    codes: [TYPE_AS_VALUE],
    lines: [typeAsValueLine("P")],
    why:
      "the receiver is a CONSUMING position and a declared SCHEMA receiver keeps firing (only " +
      "the `Enum.Variant` receiver is licensed, b3). Reading a declared field off it reports " +
      "nothing today — the parse-clean route into §Reproduction (e4)'s " +
      "`theta/runtime/null-member-access` abort (src/runtime/runtime-panics.ts:333)",
  },
  {
    id: "c8 (index read — the same route through `[\"a\"]`)",
    body: 'schema P { a: number }\nlet out = P["a"]\nout\n',
    codes: [TYPE_AS_VALUE],
    lines: [typeAsValueLine("P")],
    why: "the index receiver is the same consuming position as c7's member receiver",
  },
  {
    id: "c9 (bug 0050's committed u9d fixture, verbatim)",
    body:
      "schema P { a: number }\nschema Q { b: string }\nfn g(x: Q): number { 1 }\nlet out = g(P)\nout\n",
    codes: [TYPE_AS_VALUE],
    lines: [typeAsValueLine("P")],
    why:
      "the fixture is `U9_BARE_SCHEMA_REF` (tests/fn-arg-type-mismatch-wired.test.ts:782, cell " +
      "u9d at :1823–1843). Its `[]` at HEAD is the withholding 0050 LANDED, and the refusal " +
      "arrives from the identifier pass, not from the argument-type judgement",
  },
  {
    id: "c10 (the same shape with the parameter annotated `P`)",
    body: "schema P { a: number }\nfn g2(s: P): number { 1 }\nlet out = g2(P)\nout\n",
    codes: [TYPE_AS_VALUE],
    lines: [typeAsValueLine("P")],
    why: "silent for the same reason as c9, and refused for the same reason",
  },
  {
    id: "c11 (object-field VALUE — Trigger clause: an object-field value)",
    body: "schema P { a: number }\nschema Q { b: number }\nlet out = Q { b: P }\nout\n",
    codes: [TYPE_AS_VALUE, OBJECT_FIELD_MISMATCH],
    lines: [
      typeAsValueLine("P"),
      errLine(OBJECT_FIELD_MISMATCH, [
        ["<field>", "b"],
        ["<schema>", "Q"],
        ["<expected>", "number"],
        ["<actual>", "P"],
      ]),
    ],
    why:
      "the constructor HEAD is licensed (b2) and the FIELD VALUE is not: `case \"object\"` " +
      "walks `field.value` and nothing else (theta-document.ts:5169–:5171), because the head " +
      "and the keys are not identifier-resolution sites. The companion is the sixth type-layer " +
      "message naming the schema where a value was expected — `expected number, got P` about an " +
      "expression holding nothing — and it is ranged from the ident's own column, so the tie " +
      "keeps the identifier pass's diagnostic first",
  },
];

describe("bug 0140 (c) — the type-layer reads the silent identifier makes", () => {
  for (const row of C_ROWS) {
    it(`RED (${row.id}): the whole code list is ${JSON.stringify(row.codes)}`, () => {
      const doc = parse(row.body);
      expectCodes(row.id, doc, row.codes, row.why);
      if (row.lines !== undefined) {
        expectLines(row.id, doc, row.lines, `DIAG-4 — ${row.why}`);
      }
    });
  }

  it("RED (c9 / c10): neither draws theta/parse/fn-arg-type-mismatch", () => {
    // 0050's WITHHOLDING GROUND, asserted explicitly and separately because it
    // is the one judgement this report must NOT make. Cell u9d
    // (tests/fn-arg-type-mismatch-wired.test.ts:1823–1843) asserts the absence
    // of this code on the c9 fixture, on the ground stated at `:1841`: the
    // minted read is the identifier's SPELLING, so a mismatch emission would
    // assert that the argument IS a `P` value — something no phase established.
    // That question is settled and settled the other way, and stays settled: a
    // fix here removes the input from u9d's reach by refusing it EARLIER, never
    // by re-opening the argument-type judgement. `expectNoFnArgMismatch`
    // (`:680–685`) filters to that one code, so u9d itself stays green either
    // way; this cell is the same claim stated from inside bug 0140's witness.
    for (const row of [C_ROWS[8], C_ROWS[9]]) {
      if (row === undefined) {
        throw new Error(
          "harness: the c9 / c10 rows are missing from C_ROWS — this cell asserts the ABSENCE " +
            "of a code and would pass vacuously against a fixture that was never parsed",
        );
      }
      const doc = parse(row.body);
      expect(
        codesOf(doc).filter((c) => c === FN_ARG_MISMATCH),
        `${row.id}: bug 0050 §Non-goals — the argument-type judgement is settled the other way ` +
          `and stays settled. Rendered diagnostics: ${JSON.stringify(linesOf(doc))}`,
      ).toEqual([]);
      expect(
        codesOf(doc),
        `${row.id}: and the refusal that DOES arrive is the identifier-resolution one`,
      ).toContain(TYPE_AS_VALUE);
    }
  });

  it("RED (c12): a Pi-tool call ARGUMENT is refused beside the call-site shape rule", () => {
    // Trigger clause: "an argument of a … Pi-tool call". The refusal arrives from
    // `case \"call\"`'s ARGUMENT walk (theta-document.ts:5123–:5125), the args-side
    // sibling of the CALLEE site group (d) pins to `unknown-identifier` — one arm,
    // two positions, two codes, which is the whole content of the adjudicated
    // split and is why the argument side needs a row of its own here.
    //
    // WHY THE COMPANION IS UNAVOIDABLE at this position: the Pi-tool argument
    // SHAPE rule admits only an inline bare object literal, so a bare declared
    // name as the argument always draws `theta/parse/tool-arg-not-object-literal`
    // beside the refusal. There is no clean spelling of this clause to witness,
    // and filtering the companion out would hide the pair the position actually
    // emits. It is a call-site shape rule rather than a type-layer read — the one
    // companion in this group that is — and it was measured emitting ALONE here
    // with the refusal neutralised, so this row asserts it unmoved.
    //
    // The `tools:` prelude is what makes `read` a Pi tool rather than an
    // unresolved callee, so this row carries its own frontmatter in g6's idiom
    // instead of riding the shared table, whose rows all parse under `FM`.
    const label = "c12 (Pi-tool call argument)";
    const doc = parse(
      "schema P { a: number }\nlet out = read(P)\nout\n",
      "---\nmode: prompt\ntools:\n  - read\n---\n",
    );
    expectCodes(
      label,
      doc,
      [TYPE_AS_VALUE, TOOL_ARG_NOT_OBJECT_LITERAL],
      "the argument of a Pi-tool call is a value position, and both diagnostics are ranged from " +
        "the ident's own column, so the tie keeps the identifier pass's diagnostic first",
    );
    expectLines(
      label,
      doc,
      [typeAsValueLine("P"), errLine(TOOL_ARG_NOT_OBJECT_LITERAL, [["<name>", "read"]])],
      "DIAG-4 — both messages are read from the registry through this file's own helper, " +
        "neither is restated",
    );
    expect(
      registers(doc),
      `${label}: an error-severity theta/parse/* code denies registration, so the argument never ` +
        `reaches the tool`,
    ).toBe(false);
  });
});

// ===========================================================================
// (d) THE CALL POSITION — the ADJUDICATED disposition, pinned.
// RED (missing behaviour) at HEAD: both rows load with ZERO diagnostics.
// ===========================================================================
//
// THIS IS THE DOC'S "THIRD ARRANGEMENT", TAKEN AND STATED EXPLICITLY (§Fix (a),
// closing paragraph): the VALUE position gets route 2's new code and message,
// and the CALL position keeps route 1's `theta/parse/unknown-identifier`. The
// ground is that d1's spec anchor and a3's are DIFFERENT SENTENCES —
// `expressions.md:44` scopes its four arms to "a bare identifier in call
// position (`name(args)`)" and `:51` states the disposition for no match, while
// the value position rests on `imports.md:50` plus the registered *Trigger*'s
// "call or value position". The registered *Trigger* for
// `theta/parse/unknown-identifier` already covers a callee that resolves through
// no arm of that list, so this row needs NO registry edit — which is also why
// its message is read from the SAME row a2 and a4 render.
//
// The consequence, recorded: §Reproduction (e9)'s runtime route — the callee
// dispatched as a host tool and failing with `code_tool` / "code-side call names
// no resolvable host tool 'P'" — is removed from reachability, because an
// error-severity `theta/parse/*` diagnostic denies registration.

const D_ROWS: readonly Row[] = [
  {
    id: "d1 (`let out = P()` — a schema name in CALL position)",
    body: "schema P { a: number }\nlet out = P()\nout\n",
    codes: [UNKNOWN_IDENT],
    lines: [unknownIdentLine("P")],
    why:
      "`expressions.md:44` is the sentence that scopes the four-arm list, and `:51` its " +
      "disposition; a `schema` declaration matches no arm. `walkIdentExpr`'s `case \"call\"` " +
      "(theta-document.ts:4981–4986) resolves the callee against the same folded root scope, " +
      "which is why the position is silent today",
  },
  {
    id: "d2 (`let out = C()` — an enum name in CALL position)",
    body: "enum C { Red }\nlet out = C()\nout\n",
    codes: [UNKNOWN_IDENT],
    lines: [unknownIdentLine("C")],
    why: "the same sentence, the same arm, the same code — the enum spelling of d1",
  },
];

describe("bug 0140 (d) — the call position keeps theta/parse/unknown-identifier", () => {
  for (const row of D_ROWS) {
    it(`RED (${row.id}): the whole code list is ${JSON.stringify(row.codes)}`, () => {
      const doc = parse(row.body);
      expectCodes(row.id, doc, row.codes, row.why);
      if (row.lines !== undefined) {
        expectLines(row.id, doc, row.lines, `DIAG-4 — ${row.why}`);
      }
      expect(
        codesOf(doc),
        `${row.id}: the call position must NOT draw ${TYPE_AS_VALUE} — the two positions rest on ` +
          `different sentences and the adjudication assigns them different codes`,
      ).not.toContain(TYPE_AS_VALUE);
      expect(
        registers(doc),
        `${row.id}: an error-severity theta/parse/* code denies registration, which is what ` +
          `removes §Reproduction e9's runtime \`code_tool\` route from reachability`,
      ).toBe(false);
    });
  }
});

// ===========================================================================
// Shared parse + production-executor harness for group (e).
// The shape tests/non-object-receiver-gate.test.ts:182–292 establishes:
// parseThetaDocument -> createProductionProducerDeps -> bindPromptConversation
// -> executeBody. Offline, provider-free, no child process, no session.
// ===========================================================================

function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}

function parseOnly(path: string, src: string): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, parseDeps());
}

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot;
}

function producer() {
  return createProductionProducerDeps({
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
}

/** The site `surfaceUnexpectedThrow` frames a throw against (the ZERO body range). */
const SITE = {
  file: "bug0140.theta",
  range: {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  },
};

/**
 * A throw out of `executeBody`, rendered rather than allowed to escape as an
 * opaque failure. A `ThetaPanic` is one of the six closed panic sources
 * (docs/spec_topics/errors-and-results/error-model.md) and
 * `surfaceUnexpectedThrow` (src/runtime/runtime-panics.ts:496) returns
 * `undefined` for it by design, so the panic is named directly; anything else is
 * routed through that surface exactly as production routes it.
 */
function frameThrow(thrown: unknown): string {
  if (isThetaPanic(thrown)) {
    const panic = thrown as { readonly name?: string; readonly message?: string };
    return `panic ${panic.name ?? "ThetaPanic"}: ${panic.message ?? String(thrown)}`;
  }
  const framed = surfaceUnexpectedThrow(thrown, SITE);
  return framed === undefined
    ? `unframed throw: ${String(thrown)}`
    : `${framed.severity} ${framed.code}: ${framed.message}`;
}

/**
 * Parse and RUN one query-free prompt-mode source through the production
 * executor. Fails LOUDLY when the fixture does not parse clean — a row that
 * reaches `executeBody` only when the parse admits it must never be mistaken
 * for a pass, and must never silently skip.
 */
async function runClean(label: string, body: string): Promise<BodyExecution> {
  const doc = parseOnly("bug0140.theta", FM + body);
  if (doc.diagnostics.length > 0) {
    throw new Error(
      `${label}: PRECONDITION — this row must parse clean to reach the executor at all; ` +
        `observed ${JSON.stringify(linesOf(doc))}`,
    );
  }
  const theta: ThetaCompositionInput = {
    slashName: "bug0140",
    sourcePath: "/theta/bug0140.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = producer().bindPromptConversation(bindInput);
  try {
    return await executeBody(theta.body, binding.executeDeps);
  } catch (thrown) {
    throw new Error(
      `${label}: the body threw where a value was required — ${frameThrow(thrown)}`,
    );
  }
}

// ===========================================================================
// (e) THE RUNTIME — what the silence reaches, and what the refusal removes.
// RED (missing behaviour) for e1 / e3 / e5. GREEN for e6.
// ===========================================================================
//
// MEASURED AT HEAD through this harness, and these are the observables the fix
// removes from REACHABILITY rather than changes:
//
//   e1  fn g(s: string): number { 1 }        / g(P) -> outcome=success value=1
//   e3  fn g3(s: string): string { s + "x" } / g3(P) -> success value="nullx"
//   e5  fn g(x: Q): string { x.b }           / g(P) -> THREW
//                                   NullMemberAccessPanic: null member access: .b
//   e6  let out = P { a: 1 }                 -> success value={"a":1}
//
// The chain is: `evalExpr` has no `ident` arm (src/runtime/statement-executor.ts)
// so the node falls through to `deps.host.evaluatePure`; the production host's
// `ident` arm answers `resolution.arm === "local" ? resolution.value ?? null :
// null` (src/extension/production-theta-producer.ts:6209) over an
// `env.resolve` that returns `{ arm: "unresolved" }`
// (src/runtime/lexical-environment.ts:405); `evalUserFnCall` then binds the
// `null` positionally with no test (statement-executor.ts:416); and
// `evaluateMemberAccess` raises `NullMemberAccessPanic`
// (src/runtime/runtime-panics.ts:333) on the first field read.
//
// The FIX does not touch any of that. What it changes is whether the theta LOADS:
// an error-severity `theta/parse/*` diagnostic makes `hasLoadParseError`
// (src/extension/production-composition.ts:2214) deny registration, so the body
// never runs in production and none of e1 / e3 / e5 is reachable. e1/e3/e5
// therefore assert the parse and the registration predicate; asserting their
// executor values would pin a runtime this fix deliberately leaves alone.
//
// e6 IS THE CONTROL THAT PROVES THE HARNESS EXECUTES. It parses clean before and
// after and must still run the body to `{"a":1}` — without it, a broken harness
// could turn e1 / e3 / e5 into vacuous passes.

const E_UNREACHABLE: readonly Row[] = [
  {
    id: "e1 (the reported shape end to end — HEAD returns 1)",
    body: "schema P { a: number }\nfn g(s: string): number { 1 }\nlet out = g(P)\nout\n",
    codes: [TYPE_AS_VALUE],
    why:
      "`null` crosses the `s: string` boundary with no check and the author gets `1`; the " +
      "refusal denies registration so the value is never produced",
  },
  {
    id: "e3 (the substituted null reaching a `string`-annotated RETURN — HEAD returns \"nullx\")",
    body: 'schema P { a: number }\nfn g3(s: string): string { s + "x" }\nlet out = g3(P)\nout\n',
    codes: [TYPE_AS_VALUE],
    why: "JS `+` coerces the substituted `null`, so a `string` return carries the text `nullx`",
  },
  {
    id: "e5 (the ABORT — HEAD raises theta/runtime/null-member-access on `.b`)",
    body:
      "schema P { a: number }\nschema Q { b: string }\nfn g(x: Q): string { x.b }\nlet out = g(P)\nout\n",
    codes: [TYPE_AS_VALUE],
    why:
      "e5 and e1 differ only in whether the callee reads a field: one returns a wrong value, the " +
      "other terminates the run, and neither outcome is visible at the call site",
  },
];

describe("bug 0140 (e) — the refusal removes the runtime dispositions from reachability", () => {
  for (const row of E_UNREACHABLE) {
    it(`RED (${row.id}): the parse denies registration`, () => {
      const doc = parse(row.body);
      expectCodes(row.id, doc, row.codes, row.why);
      const blocking = doc.diagnostics.filter(
        (d: Diagnostic) =>
          d.severity === "error" &&
          (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")),
      );
      expect(
        blocking.map((d: Diagnostic) => d.code),
        `${row.id}: the drop gate reads error severity AND the \`theta/load/\` / \`theta/parse/\` ` +
          `namespaces (hasLoadParseError, src/extension/production-composition.ts:2214 — ` +
          `module-private, so the predicate is restated here and the function is cited). A ` +
          `warning-severity or differently-namespaced refusal would leave the theta registered ` +
          `and the body running. Rendered diagnostics: ${JSON.stringify(linesOf(doc))}`,
      ).toEqual([TYPE_AS_VALUE]);
      expect(registers(doc), `${row.id}: so the theta does not register and the body never runs`)
        .toBe(false);
    });
  }

  it("GREEN (e6, CONTROL): the constructor program parses clean AND still executes", async () => {
    // The row that proves this group's harness genuinely runs a body. The
    // constructor form is `expressions.md:21`'s licensed shape (b2 pins its
    // parse silence); here it is driven all the way through `executeBody`, so a
    // harness that stopped executing would red HERE rather than turning the
    // three rows above into vacuous passes.
    const label = "e6 (constructor control)";
    const doc = parse("schema P { a: number }\nlet out = P { a: 1 }\nout\n");
    expectCodes(
      label,
      doc,
      [],
      "the constructor head is not an identifier-resolution site, so the refusal cannot reach it",
    );
    const execution = await runClean(label, "schema P { a: number }\nlet out = P { a: 1 }\nout\n");
    expect(execution.outcome, `${label}: the body must run to completion`).toBe("success");
    expect(
      JSON.stringify(execution.result.value),
      `${label}: the constructor's object value is unaffected by the identifier refusal`,
    ).toBe('{"a":1}');
  });
});

// ===========================================================================
// (f) THE COMMITTED CORPUS — the GOV-15 sweep, this bug's own measurement.
// GREEN at HEAD and after.
// ===========================================================================
//
// GOV-15 (source-language-stability.md:5) ranges over files that load cleanly
// (`:9`), and every group-(a) program does today — so adding a diagnostic to
// them is a DIAG-2 trigger change, dispositioned by the diagnostic-registry
// carve-out (`:25`) "as an addition for inputs newly brought into the code's
// emission set". The carve-out makes the change admissible within theta 1.x; the
// corpus measurement is what BOUNDS its practical reach, and §Fix (b) requires
// it to be re-run after the change rather than assumed.
//
// THE STANDING DISCHARGE IS THE COMMITTED GATE, NOT THIS ROW.
// `tests/committed-fixture-parse-gate.test.ts` now walks `.thetalib` as well as
// `.theta` (bug 0132 is FIXED — its `git ls-files -z -- '*.theta' '*.thetalib'`
// discovery is at that file:73–94) and asserts ZERO load/parse diagnostics over
// the whole shipped corpus, which subsumes "no shipped file draws the new code".
// This row is bug 0140's own §Reproduction (f) measurement re-run at HEAD: it
// names the two codes explicitly, so a reviewer reading this file sees the sweep
// rather than having to infer it from a neighbouring gate.

/** Repo root from this module's own location, not the process cwd. */
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * The seeded-invalid fixture's directory. `tests/committed-fixture-parse-gate.test.ts`
 * excludes it from the shipped set by the same prefix: the file is deliberately
 * malformed so that gate can prove it reddens, and it carries two pre-existing
 * `theta/parse/unknown-identifier` diagnostics at HEAD (its `#`-prefixed line
 * lexes as `punct` + words, not as a comment).
 */
const SEEDED_INVALID_DIR = "tests/fixtures/h7b-invalid/";

/** Every committed theta source, or a LOUD failure naming the unmet precondition. */
function committedThetaSources(): string[] {
  const result = spawnSync("git", ["ls-files", "-z", "--", "*.theta", "*.thetalib"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      "harness: the corpus is the git index (`git ls-files -- '*.theta' '*.thetalib'`), not the " +
        "working tree; the unmet precondition is a working `git` executable plus a repository " +
        `checkout at the test root. status=${String(result.status)} ` +
        `error=${result.error?.message ?? "none"} stderr=${result.stderr}`,
    );
  }
  const files = result.stdout
    .split("\0")
    .filter((p) => p.length > 0)
    .sort();
  if (files.length === 0) {
    throw new Error(
      "harness: `git ls-files -- '*.theta' '*.thetalib'` yielded NO files. A sweep over an " +
        "empty corpus proves nothing and would green this row vacuously — 34 files at HEAD " +
        "`9eb1290d`. This is a loud harness failure, never a skip",
    );
  }
  return files;
}

describe("bug 0140 (f) — no committed theta source is affected (GOV-15 sweep)", () => {
  it("GREEN (f1): zero shipped files draw the new code, and none gains an unknown-identifier", () => {
    const files = committedThetaSources();
    // Anti-vacuity, two ways: the corpus must be non-empty (asserted loudly in
    // the discovery helper above) and it must genuinely include the `.thetalib`
    // half — the extension bug 0132's fix brought into the committed gate and
    // the one §Reproduction (f) had to sweep from a scratch probe.
    expect(
      files.filter((p) => p.endsWith(".thetalib")).length,
      "the sweep must cover BOTH extensions; a `.theta`-only walk is exactly the blindness bug " +
        "0132 reported against the committed gate",
    ).toBeGreaterThan(0);

    const withTypeAsValue: string[] = [];
    const withUnknownIdent: string[] = [];
    for (const rel of files) {
      const bytes = new Uint8Array(readFileSync(join(REPO_ROOT, rel)));
      const doc = parseThetaDocument({ path: rel, bytes }, parseDeps());
      const codes = codesOf(doc);
      if (codes.includes(TYPE_AS_VALUE)) withTypeAsValue.push(rel);
      if (codes.includes(UNKNOWN_IDENT)) withUnknownIdent.push(rel);
    }

    expect(
      withTypeAsValue,
      "§Reproduction (f) measured zero hits at 0.77.0 and this re-run measured zero at HEAD: no " +
        "shipped `.theta` or `.thetalib` names a declared schema or enum at an identifier " +
        "position. A member here is a shipped file the refusal newly rejects, which is a GOV-15 " +
        "blast-radius fact the fix record must state rather than a fixture defect",
    ).toEqual([]);

    expect(
      withUnknownIdent.filter((p) => !p.startsWith(SEEDED_INVALID_DIR)),
      "and no shipped file gains a NEW `theta/parse/unknown-identifier` from the call-position " +
        "half of the adjudication. The seeded-invalid fixture is excluded by directory: it is " +
        "deliberately malformed, carries this code at HEAD already, and is outside the shipped " +
        "set for the committed gate as well",
    ).toEqual([]);
  });
});

// ===========================================================================
// (g) THE DESIGN LOCKS — nine rows, eight of which the fix must keep SILENT.
// g1–g8 are GREEN at HEAD, GREEN after, and each one reds if the implementation
// drifts to a SCOPE-BLIND or NAME-FENCED shape. g9 is the one row that has since
// FLIPPED, under bug 0224's authority (see its own comment).
// ===========================================================================
//
// This group is the reason the judgement belongs in the scope-tracking
// identifier walk (`checkUnknownIdentifiers`, theta-document.ts:4850 — whose
// Rule link IS [Expressions — Identifier resolution] and which already tracks
// exact lexical scope: `let` accumulation, per-block copies, `fn` bodies
// reseeded from the roots, `for` variables, `match` bindings) rather than beside
// `function-as-value` in the structural walk's `case "ident"`
// (theta-document.ts:6864), which carries NO scope tracking at all. g1–g4 are
// LOCAL BINDERS: a name a `for` variable, a `let`, a parameter or a `match`
// pattern introduces is that binding wherever it is in scope, whatever it is
// also declared as, and two LANDED fixes have settled that posture — bug 0126
// group (d) (§Fix (e) posture 1, "a declaration sharing the loop variable's
// spelling changes nothing", pinned at
// tests/plain-for-loop-variable-element-type.test.ts:1243–1252) and bug 0050's
// u9b / u13 family (tests/fn-arg-type-mismatch-wired.test.ts:1774–1796 and
// :880–891). g5–g7 are the other three claimants on a name; g8 is the
// interpolation the walk's own doc comment (theta-document.ts:4847–4848)
// excludes as an identifier-resolution site. g9 WAS the one construct the walk
// never DESCENDED at all rather than a position it reaches and declines — a
// distinction the registered *Trigger* drew in terms, because the two are not
// interchangeable. That reach gap is CLOSED: bug 0224
// (docs/bugs/0224-identifier-walk-never-descends-par-for.md) gave
// `walkIdentExpr` (src/parser/theta-document.ts:5434) its `par-for` arm, so a
// `par for`'s iterand, `max` operand and body are now ordinary positions of the
// enumeration this row makes, and g9 asserts the refusals it once asserted
// absent. The distinction between reach and rule still matters to g1–g8, which
// are about what the walk does with a name it REACHES and are untouched by that
// widening.
//
// MEASURED SCOPE-BLIND COST, for the record: an arm minted at the structural
// walk's `case "ident"` reds 26 tests across 7 files, including the bug 0126 and
// bug 0050 rows above. That the scope-blindness is shipped for the `fn` code —
// `fn h(): number { 1 }` + `for h in [1] { h }` draws `function-as-value` today
// — is not a licence to copy it: the language has since settled the opposite
// posture for declaration names.

describe("bug 0140 (g) — the design locks: eight positions that stay silent, and one reach gap since closed", () => {
  it("GREEN (g1): a `for` variable spelled like a declared schema draws nothing", () => {
    // Bug 0126 group (d) §Fix (e) posture 1. The loop variable is a LOCAL, and
    // `walkIdentStmt`'s `for` arm adds it to the block scope before descending
    // (theta-document.ts:4931–4933), so `emitUnknownIdentifier`'s early return
    // (`scope.has(name)`, theta-document.ts:4867) answers before any refusal
    // can. A scope-blind arm judges the DECLARATION instead and reds bug 0126's
    // landed posture.
    const doc = parse("schema P { a: number }\nfor P in [1] { P }\n1\n");
    expectCodes(
      "g1 (for variable)",
      doc,
      [],
      "a declaration sharing the loop variable's spelling changes nothing",
    );
  });

  it("GREEN (g2): a `let` shadowing the declaration draws only binding-case-mismatch", () => {
    // `expressions.md:51` — "Local bindings (1) shadow everything else
    // lexically". The `let` wins, so the read is a value read and the refusal
    // must not fire. The `binding-case-mismatch` is bug 0149's, on the `let`
    // name's own uppercase-first spelling (docs/spec_topics/lexical.md puts
    // `let` bindings in the lowercase-first list), and it is asserted here as
    // the WHOLE list so a second diagnostic cannot hide beside it.
    const doc = parse("schema P { a: number }\nlet P = 1\nlet out = P\nout\n");
    expectCodes(
      "g2 (let shadow)",
      doc,
      [BINDING_CASE],
      "the local shadow wins, so the value position holds the `let`'s value and draws no refusal",
    );
    expect(
      codesOf(doc),
      "g2: a refusal here would mean the fix fenced by NAME instead of by scope",
    ).not.toContain(TYPE_AS_VALUE);
  });

  it("GREEN (g3): an `fn` parameter spelled like the declaration draws only binding-case-mismatch", () => {
    // The `fn` body is walked with a scope reseeded from the whole-file roots
    // PLUS its own parameters (`walkIdentStmt`'s `case "fn"`,
    // theta-document.ts:4936–4945), so the parameter shadows the declaration
    // inside the body exactly as a `let` does outside it. Bug 0050's u9c is the
    // same class one code over.
    const doc = parse("schema P { a: number }\nfn f(P: number): number { P }\nlet out = f(1)\nout\n");
    expectCodes(
      "g3 (fn parameter shadow)",
      doc,
      [BINDING_CASE],
      "a parameter is resolution arm (1); the body read is the parameter's, not the declaration's",
    );
    expect(codesOf(doc), "g3: no refusal inside the fn body").not.toContain(TYPE_AS_VALUE);
  });

  it("GREEN (g4): a `match` pattern binder spelled like the declaration draws the pattern-head refusal, never this file's", () => {
    // Bug 0050's u9b class (tests/fn-arg-type-mismatch-wired.test.ts:1774–1796,
    // fixture `U9_MATCH_BINDER` at `:780`): a `match` arm binds its pattern name
    // as a LOCAL (`armEnv.defineLocal`), and `lexical.md`'s lowercase-first
    // NAMING list does not reach a pattern binder, so the collision draws no
    // case error. `collectPatternBindings` puts the binder in the arm's scope
    // before the arm body is walked, which is what keeps `type-as-value` away
    // from the body read — the lock this row holds.
    //
    // The one code here is a DIFFERENT rule: expressions.md's pattern-grammar
    // disambiguation gives the binding reading to a lowercase identifier only,
    // so a capitalised bare head names no admitted pattern production and
    // `parsePattern` refuses it. Its presence says nothing about scope
    // tracking; a `type-as-value` element appearing beside it would.
    const doc = parse('schema P { a: number }\nlet m = match "hi" { P => P }\nm\n');
    expectCodes(
      "g4 (match binder)",
      doc,
      [PATTERN_HEAD],
      "the arm body's `P` is the binder, not the declaration; the sole code is the pattern head's own grammar refusal",
    );
  });

  it("GREEN (g5): a bare declared name as a NON-TAIL expression statement stays silent", () => {
    // THE NO-OP STATEMENT CLASS. Bug 0033's n11 CONTROL and bug 0042 e1 pin a
    // bare declared-name expression statement silent "wherever it is written";
    // the fixture below is `F_BARE_DECLARED_NAME` verbatim
    // (tests/schema-alias-union-decl.test.ts:374), asserted there at
    // `:1893–1901`. A statement-position read is DISCARDED — its value reaches
    // nothing — so the registry *Trigger* excludes it, and `walkIdentStmt`'s
    // `case "expr"` (theta-document.ts:4960–4962) is where the exclusion is
    // spent. The theta's TAIL is a different position (a7 refuses it) because
    // the tail IS the final value.
    const doc = parse("schema Cat { a: string }\nCat\nlet a = 1\na\n");
    expectCodes(
      "g5 (no-op statement)",
      doc,
      [],
      "bug 0033 n11 CONTROL / bug 0042 e1 — silent wherever it is written; a refusal here " +
        "re-opens two landed fixes",
    );

    // THE CONTRAST, and it is what keeps the licence CODE-SPECIFIC rather than a
    // position-wide exemption: the same statement shape with an UNDECLARED name
    // still draws `theta/parse/unknown-identifier`, so the discarded site keeps
    // reporting a name that resolves to nothing at all.
    const undeclared = parse("schema Cat { a: string }\nNope\nlet a = 1\na\n");
    expectCodes(
      "g5 (CONTRAST — undeclared name, same position)",
      undeclared,
      [UNKNOWN_IDENT],
      "the discarded-statement licence is specific to the new code; the undeclared name is " +
        "still refused, and with its own message",
    );
    expectLines(
      "g5 (CONTRAST)",
      undeclared,
      [unknownIdentLine("Nope")],
      "DIAG-4 — the pre-existing emission at this position is unmoved",
    );
  });

  it("GREEN (g6): a `tools:` callable-set entry claiming the name keeps it silent", () => {
    // Resolution arm (4), `expressions.md:49` — "A name registered in the
    // theta's callable set". `collectIdentRoots` seeds resolved `tools:` names
    // from the frontmatter, so the name has a value-binding claimant and the
    // refusal must not fire even though a `schema` of the same name is
    // declared. Measured silent at HEAD and after.
    const doc = parse(
      "schema Read { a: number }\nlet out = Read\nout\n",
      "---\nmode: prompt\ntools:\n  - Read\n---\n",
    );
    expectCodes(
      "g6 (callable-set entry)",
      doc,
      [],
      "a callable-set entry claims the name, so the position is not type-only",
    );
  });

  it("GREEN (g7): an IMPORTED symbol at a value position stays silent", () => {
    // Resolution arm (3), `expressions.md:48` — an imported symbol is a GENUINE
    // value, so `bodyTypes.imports` is deliberately NOT folded into the
    // type-only set. `collectIdentRoots`'s `import` arm
    // (theta-document.ts:4786–4795) already restricts itself to `import`
    // specifiers (an `export … from` re-export creates no local binding), so the
    // seed is exact.
    const doc = parse('import { Foo } from "./lib.thetalib"\nlet out = Foo\nout\n');
    expectCodes(
      "g7 (imported symbol)",
      doc,
      [],
      "an imported name is resolution arm (3) and holds a value; refusing it would be a " +
        "different, unclaimed judgement",
    );
  });

  it("GREEN (g8): a `${…}` interpolation naming the declaration stays silent", () => {
    // RECORDED RESIDUAL, pinned so a later widening is DELIBERATE rather than
    // incidental. `checkUnknownIdentifiers`'s own doc comment
    // (theta-document.ts:4847–4848) states that "schema-constructor names,
    // member field names, method names, object keys, and `${…}` template
    // interpolations are not identifier-resolution sites here" — so this walk
    // reaches no interpolation, for the new code or for the pre-existing one.
    // Whether it should is outside this report.
    const doc = parse("schema P { a: number }\nlet out = @`x ${P}`\nout\n");
    expectCodes(
      "g8 (template interpolation)",
      doc,
      [],
      "the walk's documented non-site; the residual is pinned, not claimed",
    );
  });

  it("(g9): identifier resolution DESCENDS a `par for`, so everything inside one is judged (reach gap closed — bug 0224)", () => {
    // THE REACH GAP IS CLOSED, and this cell records by which report so a future
    // reader does not re-derive it: bug 0224
    // (docs/bugs/0224-identifier-walk-never-descends-par-for.md), whose §Fix (d)1
    // flips this cell under its own authority and requires the SUBJECT to be
    // restated rather than deleted. The fixture and the plain-`for` control below
    // are unchanged from the version that pinned the silence; only the
    // expectations moved.
    //
    // What the gap was: a `par for` is an EXPRESSION, and `walkIdentExpr`
    // (theta-document.ts:5434) carried no `par-for` arm, so the node fell into
    // its `default` arm (`:5518–:5520`) — whose own comment enumerates "number /
    // string / bool / null / query" — and the construct's iterand, its `max`
    // width operand and its whole body were never visited. Both of this walk's
    // refusals were therefore silent throughout the construct, because both are
    // pushed by the one sink (`emitUnknownIdentifier`, `:5303`) the arm never
    // reached. Bug 0118 measured the same absent arm on the parse-phase
    // STRUCTURAL walk and its §Fix (0.162.0) took arrangement 2 — that walk
    // alone — leaving this one as its *Residuals* item 2; bug 0224 supplied the
    // measurements that residual asked for and landed the arm.
    //
    // It is not the mechanism g1 pins for a plain `for`, and it never was: there
    // the loop variable enters the block scope before the body is walked
    // (`walkIdentStmt`'s `case "for"`, theta-document.ts:5389–:5395) and the
    // binding wins the scope test, while the undeclared name beside it is still
    // refused. The `par for` arm now does exactly that — iterand and `max` in the
    // enclosing scope, body in a copy carrying the per-iteration variable — which
    // is why the four names below are judged and the loop variables are not.
    const doc = parse(
      "schema P { a: number }\n" +
        "let a = par for x in [1] { P }\n" +
        "let b = par for y in [1] { Zzz }\n" +
        "let c = par for z in Zzz { z }\n" +
        "let d = par for w in [1] max Yyy { w }\n" +
        "1\n",
    );
    expectCodes(
      "g9 (par for reach, closed by bug 0224)",
      doc,
      [TYPE_AS_VALUE, UNKNOWN_IDENT, UNKNOWN_IDENT, NON_ARRAY_ITERAND, UNKNOWN_IDENT],
      "a DECLARED name in the body (`P`) is this row's own code; an UNDECLARED name in the body " +
        "(`Zzz`), an UNDECLARED iterand (`Zzz`) and an UNDECLARED width operand (`Yyy`) are " +
        "`theta/parse/unknown-identifier`. The TYPE layer's `non-array-iterand` SURVIVES beside " +
        "the iterand's identifier verdict — bug 0224 adds reach and removes nothing. The MEASURED " +
        "order is the report order the two passes produce: the body/iterand verdicts of `let a` " +
        "and `let b`, then `let c`'s identifier refusal ahead of the type layer's row for the " +
        "same range, then `let d`'s width operand",
    );
    expectLines(
      "g9 (par for reach, closed by bug 0224)",
      doc,
      [
        typeAsValueLine("P"),
        unknownIdentLine("Zzz"),
        unknownIdentLine("Zzz"),
        errLine(NON_ARRAY_ITERAND, [["<type>", "Zzz"]]),
        unknownIdentLine("Yyy"),
      ],
      "DIAG-4 — every message is read from the registry, and the iterand row is unmoved",
    );

    // THE CONTROL, PRESERVED: the plain-`for` spelling of the same body refuses
    // the undeclared name, as it always did. It kept this cell non-vacuous while
    // the gap was open and it now fixes the target the `par for` spelling must
    // match — one word of difference between the two fixtures, and it is no
    // longer any difference in verdict.
    const plainFor = parse("schema P { a: number }\nfor y in [1] { Zzz }\n1\n");
    expectCodes(
      "g9 (CONTROL — the plain-`for` spelling)",
      plainFor,
      [UNKNOWN_IDENT],
      "`walkIdentStmt`'s `case \"for\"` descends the body, so the undeclared name is refused " +
        "there — the verdict the `par for` spelling above now matches",
    );
    expectLines(
      "g9 (CONTROL)",
      plainFor,
      [unknownIdentLine("Zzz")],
      "DIAG-4 — the pre-existing emission at the spelling the walk does reach",
    );
  });
});
