import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import { parseDoc } from "./helpers/e2e-s1";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import type { ThetaValue } from "../src/runtime/value";

// Bug 0219 — a reserved keyword heading an OBJECT pattern in a `match` arm
// draws nothing, where the same spelling written bare at the same position
// draws `theta/parse/reserved-keyword-as-identifier`
// (docs/bugs/0219-reserved-keyword-object-pattern-head-parses-clean.md).
//
// THE CONTRACT UNDER TEST is the bug's §Fix, settled for element 1: the
// `{`-gated object arm inside `parsePattern`'s `ident` / `keyword` branch
// (`parsePattern` declared src/parser/theta-document.ts:4196; the branch test
// `t.kind === "ident" || t.kind === "keyword"` at :4247; the object arm's gate
// comment `// \`Ident { field: p, … }\` object / schema pattern.` at :4258;
// the arm's return `{ kind: "object", typeName: t.text, fields }` at :4304)
// pushes `reservedKeywordAsIdentifierDiagnostic(t.text, t.range, this.file)`
// before the field walk when `t.kind === "keyword"` — the same builder, the
// same argument list and the same `t.range` as the landed tail-arm emission at
// :4314, which the object arm sits ABOVE and therefore never reaches.
//
// NO REGISTRY EDIT. The row's *Trigger* — "Reserved keyword used in an
// identifier position." (docs/spec_topics/diagnostics/code-registry-parse.md:21)
// — carries no position qualifier, so wiring it at a second position is
// implementation conformance under DIAG-2. Group (r) is this file's oracle for
// that claim.
//
// THE NODE SHAPE DOES NOT MOVE — still `{ kind: "object", typeName: t.text,
// fields }` with the fields walked as today. The refusal is carried by the
// error-severity diagnostic, which `hasLoadParseError`
// (src/extension/production-composition.ts) turns into a registration
// denial; dropping the node would strand the field binders
// `collectPatternBindings` (src/parser/theta-document.ts:5090, object arm at
// :5098) puts in the arm-body scope and draw spurious
// `theta/parse/unknown-identifier` cascades. Every group-(a)/(d) row asserts
// its WHOLE diagnostic list, which is where the absence of such a cascade —
// and §Fix (b)(2)'s "exactly one code, never also a capitalised-head code" —
// is observable.
//
// Spec anchors:
//   - docs/spec_topics/lexical.md:20 — the 32 reserved spellings and "Using one
//     of these in identifier position is
//     `theta/parse/reserved-keyword-as-identifier`". Group (a) partitions that
//     exact list against the tree, so the class under test is the list rather
//     than the five spellings the bug happens to name.
//   - docs/spec_topics/expressions.md:171 — the object/schema pattern row
//     ("object whose listed fields match the inner patterns; unlisted fields
//     are ignored"), which is why `Ident { … }` stays an admitted production
//     and why `theta/parse/capitalised-pattern-head` is NOT the code here
//     (§Fix (a) sub-decision 2).
//   - docs/spec_topics/diagnostics/code-registry-parse.md:21 — the row the
//     emission renders from; :22 — `capitalised-pattern-head`, whose *Trigger*
//     excludes the braced head in terms.
//
// SCOPE — deliberately NOT asserted, because the bug holds them open
// (§Non-goals) and a route that moved them would be refusing more than element
// 1. Group (n) MEASURES them instead, so a fix that changes them reds here:
//   - element 2, the head dropped before dispatch: `toRuntimePattern`'s object
//     arm (src/runtime/statement-executor.ts:1190–:1194) maps `fields` alone,
//     so a NON-reserved head is still interchangeable (row v6);
//   - element 3, the unresolved head (`Zed { a: 1 }`, row a8);
//   - the lowercase object-pattern head (row a7).
//
// TIER — unit, offline, provider-free, deterministic, inside the default
// `npm test` gate. Both observables settle in-process: the diagnostic list at
// the `parseThetaDocument` boundary, and the selected arm's value inside one
// `executeBody` over the production prompt-mode binding. No provider, model,
// child process or socket is on either path, so an integration tier would add
// no observable that is not already reachable here.
//
// NO SILENT SKIPPING (CLAUDE.md). Group (r)'s registry lookup throws naming the
// absent row, and group (a)'s reserved-list partition throws naming the
// spelling that moved. Every other expectation is a hard-coded literal, so the
// primary reds are the MISSING DIAGNOSTIC — the symptom — and never an oracle
// miss.

// ===========================================================================
// Codes and their normative renderings.
// ===========================================================================

/** Already registered (code-registry-parse.md:21) — §Fix (a) mints no row. */
const RESERVED = "theta/parse/reserved-keyword-as-identifier";

/** Bug 0141's row, which §Fix (a) sub-decision 2 keeps unreached by a braced head. */
const CAP = "theta/parse/capitalised-pattern-head";

/** Codes the boundary and neighbour rows carry, none of them this fix's business. */
const REST_PATTERN = "theta/parse/rest-pattern-not-supported";
const INCREMENT_DECREMENT = "theta/parse/increment-decrement";
const MUT_IMMUTABLE = "theta/parse/mut-on-immutable-context";
const BARE_OBJECT = "theta/parse/bare-object-literal";

function reservedMessage(keyword: string): string {
  return `reserved keyword '${keyword}' cannot be used as an identifier`;
}

function capMessage(name: string): string {
  return `capitalised pattern head '${name}' names no pattern production`;
}

// ===========================================================================
// Parse harness — the shipped `parseThetaDocument` through `parseDoc`
// (tests/helpers/e2e-s1.ts:39) with inert offline deps.
// ===========================================================================

/** Every row is a whole prompt-mode theta; frontmatter occupies lines 1–3. */
const FM = "---\nmode: prompt\n---\n";

const FILE = "bug0219.theta";

function theta(body: string): ThetaDocument {
  return parseDoc(FM + body, FILE);
}

/**
 * A diagnostic reduced to the five normative fields (diagnostic-shape.md
 * §"Internal diagnostic shape"). `hint` is excluded on purpose: it is a
 * non-normative repair aid carried in its own registry column, so pinning it
 * would make an added hint fail an assertion that is about the refusal.
 */
interface DiagShape {
  readonly severity: string;
  readonly code: string;
  readonly file: string | undefined;
  readonly range: SourceRange | undefined;
  readonly message: string;
}

function shapes(doc: ThetaDocument): DiagShape[] {
  return doc.diagnostics.map((d: Diagnostic) => ({
    severity: d.severity,
    code: d.code,
    file: d.file,
    range: d.range,
    message: d.message,
  }));
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

/** The expected refusal for a reserved keyword heading an object pattern. */
function reserved(keyword: string, at: SourceRange): DiagShape {
  return {
    severity: "error",
    code: RESERVED,
    file: FILE,
    range: at,
    message: reservedMessage(keyword),
  };
}

/** An expected diagnostic from a code this fix does not move. */
function existing(code: string, message: string, at: SourceRange): DiagShape {
  return { severity: "error", code, file: FILE, range: at, message };
}

/** Failure payload: every diagnostic rendered `severity code @l:c-l:c: message`. */
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

/**
 * Assert `body`'s WHOLE diagnostic list, order-sensitive.
 *
 * `assembleDiagnostics` (src/diagnostics/diagnostic.ts:123) orders by
 * (file, line, column) with a stable sort, so a multi-diagnostic row's expected
 * order is positional and measured, never guessed.
 */
function expectDiagnostics(
  body: string,
  expected: readonly DiagShape[],
  why: string,
): ThetaDocument {
  const doc = theta(body);
  expect(shapes(doc), `${why}\n  actual diagnostics: ${render(doc)}`).toEqual([...expected]);
  return doc;
}

/**
 * Whether `diagnostics` denies registration. `hasLoadParseError`
 * (src/extension/production-composition.ts) is module-private — `rg -n
 * 'export.*hasLoadParseError' src/` matches nothing — so the predicate is
 * mirrored here clause for clause: error severity, and a code in the
 * `theta/load/` or `theta/parse/` namespace. It is the mechanism that turns
 * this fix's diagnostic into the refusal, so the runtime group asserts it
 * directly (the same mirror, for the same reason, as
 * tests/capitalised-bare-match-pattern-refusal.test.ts:271).
 */
function deniesRegistration(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(
    (d) =>
      d.severity === "error" &&
      (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")),
  );
}

// ===========================================================================
// Row shapes. Column derivation, used by every row below: frontmatter occupies
// lines 1–3, so the first body line is line 4. In
// `let r = match 3 { HEAD { a: 1 } => "x", _ => "y" }` the characters are
// `l`=1 … `match`=9–13, `3`=15, `{`=17, ` `=18, so HEAD starts at column 19
// and — end column being exclusive — spans 19 → 19 + HEAD.length.
// ===========================================================================

const HEAD_COLUMN = 19;

/** `let r = match 3 { <pattern> => "x", _ => "y" }`, the bug's row-(a) shape. */
function armBody(pattern: string): string {
  return `let r = match 3 { ${pattern} => "x", _ => "y" }\nr\n`;
}

/** The head's range on the first body line, from its spelling alone. */
function headRange(head: string, line = 4, column = HEAD_COLUMN): SourceRange {
  return range(line, column, line, column + head.length);
}

// ===========================================================================
// (r) The registry oracle — DIAG-4's source of truth for the rendering, and
// DIAG-2's evidence that this fix mints nothing.
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly message: string;
}

const REGISTRY_PARSE_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";
const LEXICAL_PAGE = "docs/spec_topics/lexical.md";

function readRepoFile(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
}

const REGISTRY = parseRegistry(readRepoFile(REGISTRY_PARSE_PAGE)) as RegistryRow[];

describe("0219 (r) — the registered row the refusal renders from", () => {
  it("r1: `reserved-keyword-as-identifier` is registered `E`/`parse` with this file's message", () => {
    const row = REGISTRY.find((r) => r.code === RESERVED);
    expect(
      row,
      `${REGISTRY_PARSE_PAGE}:21 must carry the row for ${RESERVED}; §Fix (a) emits it at a second position and adds no row`,
    ).toBeDefined();
    const found = row as RegistryRow;
    expect(
      found.severity,
      `${RESERVED} must be an E row: an error-severity parse diagnostic is what \`hasLoadParseError\` (src/extension/production-composition.ts:2220) turns into the registration denial that IS the refusal`,
    ).toBe("E");
    expect(
      found.phase,
      `${RESERVED} is emitted in \`parsePattern\` (src/parser/theta-document.ts:4196), a parse-phase leaf`,
    ).toBe("parse");
    expect(
      registryMessage(REGISTRY, RESERVED),
      "DIAG-4: the registry *Message* column is the source of truth for the rendering every row below hard-codes",
    ).toBe(reservedMessage("<keyword>"));
  });

  it("r2: the row's *Trigger* carries no position qualifier, which is why no registry edit is needed", () => {
    // DIAG-2 keeps the registry closed. §Fix (a)'s licence to fire at a second
    // position is the *Trigger* naming no position — so the trigger text is
    // itself an assertion, not prose: a route that narrowed it would need a
    // registry edit this fix does not make.
    const line = readRepoFile(REGISTRY_PARSE_PAGE)
      .split("\n")
      .find((l) => l.includes(`\`${RESERVED}\``));
    expect(line, `${REGISTRY_PARSE_PAGE} must carry the ${RESERVED} row`).toBeDefined();
    expect(
      line as string,
      "the *Trigger* must stay position-free: 'Reserved keyword used in an identifier position.'",
    ).toContain("Reserved keyword used in an identifier position.");
  });

  it("r3: `capitalised-pattern-head`'s *Trigger* still excludes the braced head", () => {
    // §Fix (a) sub-decision 2: bug 0141's row is NOT extended to the braced
    // head, because `Ident { … }` IS an admitted production
    // (docs/spec_topics/expressions.md:171) and the row's own message would be
    // false there. The exclusion lives in the row's text.
    const line = readRepoFile(REGISTRY_PARSE_PAGE)
      .split("\n")
      .find((l) => l.includes(`\`${CAP}\``));
    expect(line, `${REGISTRY_PARSE_PAGE}:22 must carry the ${CAP} row`).toBeDefined();
    expect(
      line as string,
      `${CAP}'s *Trigger* must keep excluding the braced head in terms`,
    ).toContain("it is not followed by `{`");
  });
});

// ===========================================================================
// The reserved list, read off the spec rather than restated.
// ===========================================================================

/**
 * `lexical.md:20`'s 32 reserved spellings, extracted from the sentence itself.
 * Reading the list from the spec is what makes group (a) a claim about the
 * CLASS: a spelling added to or removed from the sentence must be accounted for
 * by one of the three partitions below or the partition cell reds.
 */
function specReservedWords(): readonly string[] {
  const lexical = readRepoFile(LEXICAL_PAGE).split("\n");
  const sentence = lexical.find((l) => l.startsWith("**Reserved keywords.**"));
  if (sentence === undefined) {
    throw new Error(
      `${LEXICAL_PAGE} no longer carries a line starting '**Reserved keywords.**' — the reserved-list oracle for bug 0219's class has no source`,
    );
  }
  const listPart = sentence.split("Using one of these")[0] as string;
  return [...listPart.matchAll(/`([A-Za-z_]+)`/g)].map((m) => m[1] as string);
}

/**
 * The five spellings the bug names as rows a1–a6 (a2 is `Result` with an empty
 * field list, so four distinct spellings plus `let`).
 */
const NAMED_IN_CLASS = ["Result", "Ok", "Err", "string", "let"] as const;

/**
 * The rest of the reserved list that reaches the object arm, each measured `[]`
 * at HEAD. Their presence here is the bug's §Expected behaviour item 1 clause
 * "and every other spelling on `lexical.md:20`'s 32-word list".
 */
const OTHER_IN_CLASS = [
  "fn",
  "if",
  "else",
  "for",
  "in",
  "while",
  "break",
  "continue",
  "return",
  "match",
  "schema",
  "enum",
  "import",
  "export",
  "from",
  "as",
  "by",
  "invoke",
  "number",
  "integer",
  "boolean",
  "array",
  "void",
] as const;

/**
 * The four reserved spellings a braced head never reaches, because an arm
 * ABOVE the `ident` / `keyword` branch claims them first: `mut` at
 * `parsePattern`'s `this.isKeyword("mut")` guard (src/parser/theta-document.ts:4200)
 * and `true` / `false` / `null` at the literal arms above :4247. Their braced
 * spellings are measured in group (n) and must not move — a route that made
 * them draw the reserved code as well would be emitting two codes for one
 * construct, against §Fix (b)(2).
 */
const CLAIMED_ABOVE = ["mut", "true", "false", "null"] as const;

// ===========================================================================
// (a) A reserved keyword heading an object pattern is refused, once, at the
// head's range — as its bare sibling already is.
// ===========================================================================

describe("0219 (a) — a reserved keyword heading an object pattern draws the reserved code", () => {
  it("a1: `Result { a: 1 }` draws exactly the reserved code at the head's range", () => {
    const doc = expectDiagnostics(
      armBody("Result { a: 1 }"),
      [reserved("Result", headRange("Result"))],
      "lexical.md:20 refuses a reserved keyword in identifier position with no position qualifier, and the bare sibling `Result =>` already draws exactly this code at exactly this range",
    );
    expect(
      deniesRegistration(doc.diagnostics),
      "§Fix (a): the refusal mechanism is the error-severity diagnostic denying registration (src/extension/production-composition.ts:2220), not an AST-shape change",
    ).toBe(true);
  });

  it("a2: `Result { }` — an EMPTY field list is refused identically", () => {
    // The empty field list is the shape that makes element 2 dangerous (a
    // vacuous field loop matches every object-shaped value, row v7), so it must
    // not be a weaker case for the head refusal.
    expectDiagnostics(
      armBody("Result { }"),
      [reserved("Result", headRange("Result"))],
      "the discriminator the bug measures is the following `{` alone, not the field list: the empty-braced head must draw the same one code",
    );
  });

  it("a3: `Ok { a: 1 }` draws the reserved code, not a constructor-shape code", () => {
    // §Fix (a) sub-decision 1: `Ok { a: 1 }` is not a malformed `Ok(p)`; it is a
    // reserved word in a head position, the one sentence covering all the
    // measured spellings uniformly. The `Ok(` / `Err(` constructor arm
    // (src/parser/theta-document.ts:4249–:4257) is spelling-restricted AND
    // `(`-gated, so it is not entered here.
    expectDiagnostics(
      armBody("Ok { a: 1 }"),
      [reserved("Ok", headRange("Ok"))],
      "the reserved sentence covers `Ok` at an identifier position; minting a second code for the two Result spellings would split one construct across two registry rows",
    );
  });

  it("a4: `Err { a: 1 }` draws the reserved code", () => {
    expectDiagnostics(
      armBody("Err { a: 1 }"),
      [reserved("Err", headRange("Err"))],
      "`Err` is on lexical.md:20's list and refuses bare at this same position",
    );
  });

  it("a5: `string { a: 1 }` — a type keyword — draws the reserved code", () => {
    expectDiagnostics(
      armBody("string { a: 1 }"),
      [reserved("string", headRange("string"))],
      "the class is the reserved list, not the capitalisation: a lowercase type keyword is refused at this position too, as `string =>` already is",
    );
  });

  it("a6: `let { a: 1 }` — a declarator keyword — draws the reserved code", () => {
    expectDiagnostics(
      armBody("let { a: 1 }"),
      [reserved("let", headRange("let"))],
      "`let` is on the same list; the head position does not admit it any more than the bare position does",
    );
  });

  it.each(OTHER_IN_CLASS.map((word) => [word] as const))(
    "a7: `%s { a: 1 }` — the class is the whole 32-word list, not five spellings",
    (word) => {
      expectDiagnostics(
        armBody(`${word} { a: 1 }`),
        [reserved(word, headRange(word))],
        `§Expected behaviour item 1 extends to "every other spelling on lexical.md:20's 32-word list"; '${word}' reaches the \`{\`-gated object arm and is refused there`,
      );
    },
  );

  it("a8: the three partitions exactly cover `lexical.md:20`'s reserved list", () => {
    // The oracle that keeps group (a) a claim about the class: every reserved
    // spelling is either refused at the braced head (the two in-class sets) or
    // claimed by an arm above the `ident`/`keyword` branch (group (n)). A
    // spelling that is on the spec list and in none of the three sets is an
    // untested member of the class.
    const partitioned = new Set<string>([
      ...NAMED_IN_CLASS,
      ...OTHER_IN_CLASS,
      ...CLAIMED_ABOVE,
    ]);
    const spec = specReservedWords();
    expect(
      spec.length,
      `${LEXICAL_PAGE}:20 must still list 32 reserved spellings; got ${JSON.stringify(spec)}`,
    ).toBe(32);
    expect(
      spec.filter((w) => !partitioned.has(w)),
      `every spelling on ${LEXICAL_PAGE}:20 must be covered by one of this file's three partitions (in-class named, in-class other, claimed-above)`,
    ).toEqual([]);
    expect(
      [...partitioned].filter((w) => !spec.includes(w)),
      `this file must not partition a spelling ${LEXICAL_PAGE}:20 does not reserve`,
    ).toEqual([]);
  });
});

// ===========================================================================
// (d) Every recursion depth — `parsePattern` is the same function at each.
// ===========================================================================

describe("0219 (d) — the refusal fires at every depth the pattern grammar recurses", () => {
  it("d1: an array ELEMENT `[Result { a: 1 }]` is refused at the element's head", () => {
    // §Expected behaviour item 2. `[` occupies column 19, so the element head
    // starts one column later.
    expectDiagnostics(
      armBody("[Result { a: 1 }]"),
      [reserved("Result", headRange("Result", 4, HEAD_COLUMN + 1))],
      "the array-pattern arm recurses through the same `parsePattern` (src/parser/theta-document.ts:4196), so a guard in the object arm fires at every depth",
    );
  });

  it("d2: an object-pattern FIELD VALUE `Q { f: Result { a: 1 } }` is refused at the inner head", () => {
    // The declared outer head `Q` is legal and stays silent (§Fix (b)(4)), so
    // the whole-list assertion also pins that the fix does not fire on the
    // OUTER ident head. Columns on line 5: `Q`=19, `{`=21, `f`=23, `:`=24,
    // inner head=26.
    expectDiagnostics(
      "schema Q { f: integer }\n" + armBody("Q { f: Result { a: 1 } }"),
      [reserved("Result", headRange("Result", 5, 26))],
      "the field-value position recurses through `parsePattern` too; exactly one code, on the inner reserved head, with the declared outer head silent",
    );
  });

  it("d3: TWO reserved heads in one pattern — outer `Result` and inner field-value `Ok` — both draw their own diagnostic", () => {
    // §Fix (b)(2) is "one diagnostic per construct"; every other row in this
    // file exercises at most one reserved head, so a route that suppressed
    // the inner emission once an outer one already fired would stay green
    // everywhere else. Columns on line 4: `Result`=19, its inner `{`=26,
    // `f`=28, `:`=29, `Ok`=31.
    expectDiagnostics(
      armBody("Result { f: Ok { } }"),
      [
        reserved("Result", headRange("Result", 4, 19)),
        reserved("Ok", headRange("Ok", 4, 31)),
      ],
      "two reserved heads at different depths of the same pattern each draw their own diagnostic, position-sorted by `assembleDiagnostics` (src/diagnostics/diagnostic.ts:123) with the outer head first",
    );
  });
});

// ===========================================================================
// (n) Boundaries and non-goals — measured, and required NOT to move.
// ===========================================================================

describe("0219 (n) — the spellings a route must leave silent", () => {
  it("n1 (a7 boundary): a LOWERCASE object-pattern head `p { a: 1 }` is refused as an unresolved head", () => {
    // The lowercase object-pattern head was unclaimed by bug 0219 and by bug
    // 0141, and is claimed and closed by bug 0221
    // (docs/bugs/0221-object-pattern-head-name-unchecked-fires-wrong-arm.md,
    // §Fix (c)(2), which names this cell as one of the two flips it
    // authorises): the head is resolved against the whole-file pattern-head
    // universe and a lowercase `let` binding is not in it, so `p` draws
    // `theta/parse/unresolved-named-type` at the head's range — the same code
    // the VALUE position already drew at the same spelling.
    expectDiagnostics(
      armBody("p { a: 1 }"),
      [
        existing(
          "theta/parse/unresolved-named-type",
          "unresolved named type 'p'",
          headRange("p"),
        ),
      ],
      "bug 0221 §Expected behaviour 1: an object-pattern head that resolves to no declaration usable at that position is refused once, at the head's range",
    );
  });

  it("n2 (a8 boundary): an UNDECLARED head `Zed { a: 1 }` is refused as an unresolved head (element 3, closed by bug 0221)", () => {
    // Element 3 was recorded and held open by bug 0219 — refusing it added a
    // further position to `theta/parse/unresolved-named-type`'s position list
    // (code-registry-parse.md:101). Bug 0221 settled that DIAG-2 question and
    // reuses the row rather than minting one; §Fix (c)(2) names this cell as
    // the second of the two flips it authorises.
    expectDiagnostics(
      armBody("Zed { a: 1 }"),
      [
        existing(
          "theta/parse/unresolved-named-type",
          "unresolved named type 'Zed'",
          headRange("Zed"),
        ),
      ],
      "bug 0221: the head resolving against nothing is refused, where bug 0219's §Fix left it measured and silent",
    );
  });

  it("n3 (a9 control): a DECLARED head `Zed { a: 1 }` stays silent", () => {
    expectDiagnostics(
      "schema Zed { a: integer }\n" + armBody("Zed { a: 1 }"),
      [],
      "§Fix (b)(4): the legal spelling — a declared, capitalised, braced head — is the admitted production of expressions.md:171 and must stay clean",
    );
  });

  it("n4 (e1 boundary): the bare object pattern `{ a: 1 }` stays silent", () => {
    // No head token at all, so the guard has no keyword to test; the arm is
    // reached through a different production entirely.
    expectDiagnostics(
      armBody("{ a: 1 }"),
      [],
      "§Fix (b)(4): a headless object pattern carries no reserved spelling",
    );
  });

  it("n5: the field shorthand `{ attempts }` stays silent", () => {
    // The colon-less field sugars to a same-named identifier pattern
    // (src/parser/theta-document.ts:4290–:4294), which is a binding, not a head.
    expectDiagnostics(
      armBody("{ attempts }"),
      [],
      "§Fix (b)(4): the field shorthand is a binder per expressions.md:171 and is untouched",
    );
  });

  it("n6: `{ a, ...o }` keeps exactly the rest-pattern refusal", () => {
    // §Non-goals: rest patterns inside an object pattern are
    // `theta/parse/rest-pattern-not-supported`'s business and the arm's
    // `tryConsumeRestPattern` call is untouched. Columns: `{`=19, `a`=21,
    // `,`=22, `...`=24–26 with the diagnostic on column 24.
    expectDiagnostics(
      armBody("{ a, ...o }"),
      [
        existing(
          REST_PATTERN,
          "rest patterns are not supported in theta 1.0",
          range(4, 24, 4, 25),
        ),
      ],
      "the rest-pattern refusal keeps its code, count and range: the guard is added before the field walk and changes no field-walk byte",
    );
  });

  it.each([
    ["mut", [existing(MUT_IMMUTABLE, "'mut' is not permitted in this binding position", range(4, 19, 4, 22))]],
    ["true", [existing(BARE_OBJECT, "bare object literal not permitted in this position; name the schema (Schema { ... })", range(4, 24, 4, 32))]],
    ["false", [existing(BARE_OBJECT, "bare object literal not permitted in this position; name the schema (Schema { ... })", range(4, 25, 4, 33))]],
    ["null", [existing(BARE_OBJECT, "bare object literal not permitted in this position; name the schema (Schema { ... })", range(4, 24, 4, 32))]],
  ] as const)(
    "n7: `%s { a: 1 }` keeps its measured list — an arm above the `ident`/`keyword` branch claims it",
    (word, expected) => {
      expectDiagnostics(
        armBody(`${word} { a: 1 }`),
        expected,
        `'${word}' never reaches the \`{\`-gated object arm — \`mut\` is claimed by parsePattern's mut guard (src/parser/theta-document.ts:4200) and the three literals by the literal arms above :4247 — so §Fix (b)(2)'s one-code-per-construct forbids adding the reserved code here`,
      );
    },
  );
});

// ===========================================================================
// (b) Bug 0141's landed BARE refusals — codes, counts and ranges are locks
// (§Fix (b)(1)).
// ===========================================================================

describe("0219 (b) — the bare pattern head keeps bug 0141's exact refusals", () => {
  it("b1: `Result =>` keeps exactly the reserved code at the head's range", () => {
    expectDiagnostics(
      armBody("Result"),
      [reserved("Result", headRange("Result"))],
      "§Fix (b)(1): bug 0141's tail-arm refusal (src/parser/theta-document.ts:4314) is unmoved; the braced guard is added above it, not in place of it",
    );
  });

  it("b2: `Ok =>` keeps exactly the reserved code", () => {
    expectDiagnostics(
      armBody("Ok"),
      [reserved("Ok", headRange("Ok"))],
      "reserved-before-case ordering (src/parser/theta-document.ts:4312–:4321) keeps `Ok` on exactly one code",
    );
  });

  it("b3: `Zed =>` keeps exactly the capitalised-head code, never the reserved one", () => {
    expectDiagnostics(
      armBody("Zed"),
      [
        {
          severity: "error",
          code: CAP,
          file: FILE,
          range: headRange("Zed"),
          message: capMessage("Zed"),
        },
      ],
      "§Fix (b)(1): an undeclared capitalised BARE head is bug 0141's row; adding a guard to the object arm must not reach the tail's else-branch",
    );
  });

  it("b4: `string =>` keeps exactly the reserved code", () => {
    expectDiagnostics(
      armBody("string"),
      [reserved("string", headRange("string"))],
      "§Fix (b)(1): the lowercase reserved spelling stays on the reserved row, not the case row",
    );
  });
});

// ===========================================================================
// (z) Bug 0123's neighbour in the same function — measured at HEAD and pinned.
// ===========================================================================

describe("0219 (z) — bug 0123's input in the same function is untouched", () => {
  it("z1: `--y` in pattern position keeps its measured code list", () => {
    // §Fix (b)(6): `parsePattern`'s one-token recovery tail is byte-identical
    // under this fix, so bug 0123's subject keeps exactly what it draws at
    // HEAD. Pinned as MEASURED, not as bug 0123's expected behaviour — that
    // report is open and owns the verdict; this cell only witnesses that bug
    // 0219's guard does not move it. Body line 5, `--` at columns 19–20.
    expectDiagnostics(
      "let y = 1\n" + armBody("--y"),
      [
        existing(
          INCREMENT_DECREMENT,
          "'--' operator is not supported",
          range(5, 19, 5, 21),
        ),
      ],
      "§Fix (b)(6): whichever of bugs 0123 and 0219 lands second re-measures the other's rows; this is bug 0219's re-measurement of bug 0123's input",
    );
  });
});

// ===========================================================================
// Runtime harness — parse → production prompt-mode binding → `executeBody`
// (the tests/capitalised-bare-match-pattern-refusal.test.ts:279–337 shape).
// Offline, provider-free: a query-free prompt body dispatches no model.
// ===========================================================================

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

function producer(): ReturnType<typeof createProductionProducerDeps> {
  return createProductionProducerDeps({
    // `sendMessage` satisfies the theta-system-note channel; the active-tools
    // pair satisfies the PIC-17 snapshot/restore window. No provider, no model.
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
}

async function execute(doc: ThetaDocument): Promise<BodyExecution> {
  const input: ThetaCompositionInput = {
    slashName: "bug0219",
    sourcePath: "/theta/bug0219.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const bindInput: ConversationBindInput = {
    theta: input,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = producer().bindPromptConversation(bindInput);
  return executeBody(input.body, binding.executeDeps);
}

/** Assert the value an already-parsed body evaluates to. */
async function expectValue(
  doc: ThetaDocument,
  value: ThetaValue,
  why: string,
): Promise<void> {
  const execution = await execute(doc);
  expect(execution.outcome, `${why}: the body reaches a value`).toBe("success");
  expect(execution.result.value, why).toEqual(value);
}

// ===========================================================================
// (v) The runtime rows: the S1 headline denies registration, and element 2's
// residual is pinned where it stays.
// ===========================================================================

describe("0219 (v) — the S1 headline row no longer registers", () => {
  it("v7: `match Ok(1) { Err { } => … }` is refused at parse, so the wrong-arm value is unreachable", async () => {
    // The S1 band verbatim: at HEAD this theta loads clean, registers, and
    // answers "err-arm" on a SUCCESS Result, because `toRuntimePattern` drops
    // the head (src/runtime/statement-executor.ts:1190–:1194) and an empty
    // field list is a catch-all over every object-shaped value. §Fix does not
    // touch that dispatch — it refuses the SOURCE, so the theta never
    // registers and the value is never produced by a registered theta.
    // Columns on line 4: `{`=21, ` `=22, `Err`=23–25.
    const doc = expectDiagnostics(
      'let r = match Ok(1) { Err { } => "err-arm", _ => "other" }\nr\n',
      [reserved("Err", range(4, 23, 4, 26))],
      "the reserved head `Err` at an object-pattern position draws the reserved code, which denies registration — the wrong-arm selection is then unreachable from a registered theta",
    );
    expect(
      deniesRegistration(doc.diagnostics),
      "the refusal IS the registration denial (src/extension/production-composition.ts:2220): the arm's runtime behaviour is a non-goal (element 2), so only the load gate can carry this row",
    ).toBe(true);
  });

  it("v6 [element-2 residual]: a NON-reserved wrong head still selects its arm, unrefused", async () => {
    // Measured at HEAD and required NOT to move: `R { a: 1 }` matching a
    // `Q`-constructed value is element 2 (§Non-goals), a language decision
    // about nominal patterns with an exhaustiveness question behind it. After
    // this fix the residual narrows to NON-reserved heads only — this cell is
    // that boundary, so a route that made it refuse would be fixing element 2
    // by accident (§Fix (b)(3)).
    //
    // WHY `R` declares `a: integer` (bug 0226 and its §Fix (c)(5) boundary,
    // per bug 0221 §Fix (c)(5)): the original fixture (`schema R { b: integer
    // }`) is bug 0226's own class — `R`'s listed field `a` is undeclared —
    // and now draws `theta/parse/extra-object-field`, which would break this
    // cell's SUBJECT (nominal dispatch stays unfixed: a declared, non-reserved
    // head still selects its arm over an unrelated value). Making the sibling
    // FIELD-COMPATIBLE (`R` declares the same field `Q` does, with a
    // compatible type) keeps the field list carryable — the interchangeability
    // boundary bug 0221 §Fix (c)(5) draws and bug 0226 does not claim — so
    // element 2's residual is preserved at its own, disjoint boundary.
    const doc = expectDiagnostics(
      [
        "schema Q { a: integer }",
        "schema R { a: integer }",
        "let d = Q { a: 1 }",
        'let r = match d { R { a: 1 } => "r-arm", _ => "other" }',
        "r",
      ].join("\n") + "\n",
      [],
      "element 2 is measured and held open: a declared, non-reserved head is not this report's class",
    );
    await expectValue(
      doc,
      "r-arm",
      "v6: `toRuntimePattern` still drops `typeName` and `matchPattern`'s object arm is byte-identical, so the field-shape reading of expressions.md:171 stands",
    );
  });

  it("v9 [control]: the legal spelling `Q { a: 1 }` keeps its value and its silence", async () => {
    const doc = expectDiagnostics(
      [
        "schema Q { a: integer }",
        "let d = Q { a: 1 }",
        'let r = match d { Q { a: 1 } => "q-arm", _ => "other" }',
        "r",
      ].join("\n") + "\n",
      [],
      "§Fix (b)(4): the admitted production of expressions.md:171 stays clean and selects its arm",
    );
    await expectValue(doc, "q-arm", "v9: the legal head's dispatch is untouched");
  });
});
