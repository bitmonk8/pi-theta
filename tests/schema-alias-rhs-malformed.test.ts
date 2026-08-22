import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0042 — a `schema X = …` right-hand side the grammar does not derive is
// consumed in part and reported not at all: `schema X = Cat Cat` registers a
// one-arm alias and severs the author's second name into a no-op statement,
// `schema X = Cat |` drops the dangling arm inside the declaration, and
// `schema X = -1` keeps a junk `"-"` arm that lowers to the permissive `{}`
// (docs/bugs/0042-schema-decl-same-line-residue-silent.md).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/grammar.md:171–:176 — `SchemaDecl ::= "schema" Ident
//     SchemaShape`, with `AliasRhs ::= Type ("|" Type)*` and
//     `UnionRhs ::= Type ("|" Type)+`. Two `Type` atoms with no `|` between them
//     are not an `AliasRhs`; a `|` with no `Type` on one of its sides is not one
//     either.
//   - grammar.md:102 — `LiteralType ::= STRING | NUMBER | BOOLEAN | NULL` has no
//     unary-minus alternative, so `-1` is a `PrimitiveLit` of the VALUE
//     sublanguage (:20–:24) and spells no `AliasRhs` at all.
//   - grammar.md:120 (`ThetaBody ::= Stmt* Expr?`), :199 and :212 — statements
//     are separated by newlines, the continuation trigger set is closed, and
//     there is no semicolon escape: a second statement on the same line has no
//     derivation. The NEXT-line arrangement is the one the separator already
//     covers, which is why the rule this file pins is scoped to the same line.
//   - docs/spec_topics/schemas.md §Type-alias / union schema — the right-hand
//     side is exactly an `AliasRhs`; the two arrangements that production does
//     not derive are `theta/parse/malformed-alias-rhs`, the code is the whole of
//     the disposition, and a right-hand side that yields no arm at all stays
//     `theta/parse/empty-schema-body`.
//   - docs/spec_topics/diagnostics/code-registry-parse.md — the registered row
//     for `theta/parse/malformed-alias-rhs` (severity E, phase parse), whose
//     *Trigger* names both shapes and both exclusions, and whose *Message*
//     column is the normative string every expectation here reads at runtime
//     (DIAG-4). DIAG-1 / DIAG-2 (diagnostic-shape.md:71/:72) make the registry
//     the closed authority for what the implementation emits.
//   - docs/spec_topics/governance/source-language-stability.md:9 (the
//     loads-cleanly predicate) and :25 (the diagnostic-registry carve-out) —
//     most fixtures in groups (b)–(d) load with zero error-severity
//     diagnostics today, so for those the emission relies on the carve-out.
//     Four do not: b3, b5, and b15's `@`-query and bare-backtick heads each
//     already carry an error-severity code (the signature table below records
//     which), so they were never inside the loads-cleanly set and the
//     carve-out does no work for them. The carve-out's in-scope input set is
//     the emission class the registry *Trigger* names; the fixtures in these
//     groups are representatives of that class, not the class itself.
//
// THE PINNED CONTRACT (bug doc §Fix, disposition settled as REJECT; RED now,
// GREEN after):
//   1. ONE registered code, `theta/parse/malformed-alias-rhs`, fires for a
//      `schema X = …` / `schema X by f = …` right-hand side that is not an
//      `AliasRhs`, in two shapes: EMPTY ARM POSITION — a top-level `|` with no
//      `Type` on one of its sides; SAME-LINE RESIDUE — a right-hand side the
//      production completes, followed on the same source line as its last token
//      by a token that continues no `Type`.
//   2. The emission is the code's ONLY effect. The declaration keeps the arms it
//      captured and its range, the severed residue still parses as the statement
//      it spells, statement kinds and tail promotion are untouched, and the
//      lowered `$defs` fragment of each declaration is byte-identical. Every
//      fixture below therefore asserts those observables BEFORE the emission, so
//      a fix that also moved them reds on the observable it moved.
//   3. Anchoring: shape (b) locates the diagnostic at the RESIDUE token — the
//      token the declaration cannot hold; shape (a) locates it at the
//      declaration's own range, because an empty arm position leaves no token
//      outside the declaration to point at.
//   4. Two exclusions are part of the rule, not omissions from it: a right-hand
//      side that yields no arm at all stays `empty-schema-body` (fixture 4), and
//      a token on the NEXT source line is not residue (fixture 12).
//
// PROBED CURRENT SIGNATURES (HEAD 3027a1d9 / 0.51.0, offline, deterministic —
// re-derived from the bug doc's §Reproduction table, written at 0.45.0, with
// ZERO drift). Ranges are BODY-RELATIVE (see `fmtSpan`): line 1 is the first
// line after the frontmatter fence, `end` is exclusive.
//   1   Cat decl / `schema X = Cat Cat` / let / tail
//       arms ["Cat"] decl 2:1-2:15  residue expr 2:16-2:19            diags []
//   1a  bare `Cat` on its own line                                    diags []
//   1b  `schema X = Cat Cat Cat` arms ["Cat"], residue 2:16-2:19 + 2:20-2:23
//   1c  `schema X = Ghost Ghost` arms ["Ghost"]
//       diags [unresolved-named-type @1:1-1:17, unknown-identifier @1:18-1:23]
//   1d  `schema S { f: Cat Cat }` diags [empty-schema-body @2:1-2:24,
//       unsupported-feature "…comma-separated" @2:19-2:22]
//   1e  `schema S { f: Cat, g: Cat }`                                 diags []
//   1f  the `.thetalib` spelling of 1 diags [thetalib-top-level-statement
//       @2:16-2:19];  the residue-free `.thetalib` control              diags []
//   2   `schema X = Cat |` arms ["Cat"] decl 2:1-2:17, NO residue stmt, diags []
//   2a  `schema S { a: string | }` diags []; params → $defs.S properties.a {}
//       (MOVED by bug 0061 §Fix: diags now [schema-type-not-expression
//       @1:1-1:25]; $defs.S.properties.a stays {} — the judgement, not the
//       lowering, moved)
//   3   `schema X = -1` arms ["-"] decl 1:1-1:13 residue 1:13-1:14    diags []
//   3a  `schema X = -1 | null` arms ["-"], residue 1:13-1:14 + 1:17-1:21,
//       diags [unsupported-feature "stray '|' in statement position" @1:15-1:16]
//   3b  `schema S { a: -1 }`     diags [empty-schema-body @1:1-1:19]
//   4   `schema X =` + next-line `let` — arms ABSENT,
//       diags [empty-schema-body @1:1-1:11]
//   5a  `schema X = string 1`           arms ["string"]               diags []
//   5b  `schema X = string "junk"`      arms ["string"]               diags []
//   5c  `schema X = string | integer 7` arms ["string","integer"]      diags []
//   5d  `schema X = Cat Dog` (both declared) arms ["Cat"]              diags []
//   6   `schema X = Cat 42` last     3 stmts, tail null               diags []
//   6a  `42` last                    1 stmt,  tail number             diags []
//   6b  `42 43`                      2 stmts, tail null               diags []
//   7   `schema X by a = Cat | Dog Cat` arms ["Cat","Dog"] decl 3:1-3:26,
//       residue 3:27-3:30                                             diags []
//   8   `schema X = Cat || Cat` arms ["Cat"] decl 2:1-2:18 residue 2:19-2:22
//       (the lexer emits `||` as ONE token; the top-level split drops the
//       empty segments)                                               diags []
//   9   `schema X = | Cat`  arms ["Cat"] decl 2:1-2:17, NO residue stmt diags []
//   10  `schema X = { a: string } Cat` arms ["{a:string}"] residue 2:26-2:29
//   11  `schema X = array<integer> 42` arms ["array<integer>"] residue 1:27-1:29
//   12  `schema X = array<integer>` + next-line `let` arms ["array<integer>"],
//       diags []
//   13  `schema X = array<integer> let a = 1` arms ["array<integer>"],
//       decl 1:1-1:26, residue `let:a` 1:27-1:36, tail ident        diags []
//   14  the six punct residue heads, each `schema Cat { a: string }` then
//       `schema X = Cat <head>`: arms ["Cat"], decl 2:1-2:15 in every member
//       14a `@`q``    residue query 2:16-2:20
//                     diags [discarded-query-result @2:16-2:20]
//       14b ``q``     residue expr  2:16-2:19
//                     diags [unsupported-feature "backtick template in value
//                     position (query templates must be @-prefixed)"
//                     @2:16-2:19]
//       14c `(1)`     residue expr  2:17-2:18                       diags []
//       14d `[1]`     residue expr  2:16-2:19                       diags []
//       14e `!true`   residue expr  2:16-2:21                       diags []
//       14f `-1`      residue expr  2:16-2:18                       diags []
//   1p/2p → $defs.X {"$ref":"#/$defs/Cat"};  3p → $defs.X {}          diags []
//
// WHAT IS RED HERE AND WHY. Groups (b), (c) and (d) red on SILENCE: the
// declaration is malformed, the observables the fix must not move are already
// what they will be afterwards, and the diagnostic list is missing exactly one
// entry. Each red assertion renders the whole observed diagnostic list into its
// failure text, so the red names the absent emission rather than an anonymous
// length mismatch. Group (a) (the registry row) and group (e) (the
// anti-widening fences) are GREEN today and must stay green: they are the fence
// around the two exclusions (fixtures 4 and 12), around the object-body
// position (1d, 1e, 3b — §Fix constraint 4 keeps the object form still; 2a
// moved under bug 0061 §Fix — the field-position sibling of this file's own
// alias-position dangling `|`, see cell e5 below),
// around the general same-line statement class the bug doc's §Non-goals
// excludes (1a, 6a, 6b), and around every pre-existing emission the fix must
// leave in place.
//
// TIER: unit, offline, deterministic, provider-free. The whole contract settles
// inside one `parseThetaDocument` call over a source string (`parseDoc`,
// tests/helpers/e2e-s1.ts — the shipped front end wrapped in the standard inert
// deps double), which is the seam that owns both the capture boundary and the
// emission. An integration tier would add a session round-trip to a parse-time
// observable and could not assert the ABSENCE of a diagnostic, the arm list, or
// a source range at all; a live tier would additionally make the assertion
// stochastic.
//
// NO SILENT SKIPPING: nothing here early-returns or conditionally skips. Every
// arm-list, range and lowering read THROWS with the statement list and the
// diagnostics rendered when the intermediate is absent, so a refused parse or a
// dropped declaration can never read as a pass.

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4).
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** The live four-page sharded registry, read from the spec corpus and concatenated. */
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

const CODE = "theta/parse/malformed-alias-rhs";
// bug 0061 §Fix moved fixture 2a (below, cell e5) from silent-and-permissive
// to refused: the field-position dangling `|` is the sibling of this file's
// own alias-position dangling `|` (fixture 2, refused since 0042), and bug
// 0061 is the authority that closes that asymmetry.
const REFUSAL = "theta/parse/schema-type-not-expression";
const EMPTY_BODY = "theta/parse/empty-schema-body";
const UNRESOLVED = "theta/parse/unresolved-named-type";
const UNKNOWN_IDENT = "theta/parse/unknown-identifier";
const UNSUPPORTED = "theta/parse/unsupported-feature";
const DISCARDED_QUERY = "theta/parse/discarded-query-result";
const THETALIB_TOP_LEVEL = "theta/parse/thetalib-top-level-statement";

/**
 * A registry row's normative *Message* template with the named placeholders
 * filled (DIAG-4). Definedness and placeholder presence are asserted first, so a
 * missing row or a reworded template reds by naming the registry page rather
 * than by a silently-wrong expectation. No expected message string in this file
 * is written out by hand — every one is this read.
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

/** The malformed-RHS message for one declaration name (`<X>` is the schema name). */
function malformedMessage(declName: string): string {
  return msg(CODE, [["<X>", declName]]);
}

/** The bug 0061 refusal's message for one declaration name (`<X>` is the schema name). */
function refusalMessage(declName: string): string {
  return msg(REFUSAL, [["<X>", declName]]);
}

// ===========================================================================
// Fixtures. Every one is the whole body after the frontmatter fence, exactly as
// the bug doc's §Reproduction quotes them.
// ===========================================================================

/** The `mode: prompt` prelude every `.theta` fixture carries: THREE lines. */
const FM = "---\nmode: prompt\n---\n";
const FM_LINES = 3;

/** A `params:`-bearing prelude is FIVE lines (fence, mode, `params:`, field, fence). */
const PARAMS_LINES = 5;

/** A `.thetalib` carries no frontmatter, so its body starts at line 1. */
const LIB_LINES = 0;

const THETA_PATH = "bug0042.theta";
const THETALIB_PATH = "bug0042.thetalib";

/** The declared object schema the resolvable fixtures name. */
const CAT = "schema Cat { a: string }\n";
const DOG = "schema Dog { b: string }\n";

/**
 * Two variants carrying a unique string-literal `a` field, so `schema X by a`
 * has a discriminator and none of the five discriminator codes fires — the `by`
 * fixture must red on the residue alone.
 */
const BY_VARIANTS = 'schema Cat { a: "cat", n: string }\nschema Dog { a: "dog", n: string }\n';

/** The statement + tail pair every fixture that is not a tail-promotion probe ends with. */
const END = "let a = 1\na\n";

// (b) SAME-LINE RESIDUE — the right-hand side completes and a token that
// continues no `Type` follows it on the same line.
const F1 = `${CAT}schema X = Cat Cat\n${END}`;
const F1B = `${CAT}schema X = Cat Cat Cat\n${END}`;
const F1C = `schema X = Ghost Ghost\n${END}`;
const F3 = `schema X = -1\n${END}`;
const F3A = `schema X = -1 | null\n${END}`;
const F5A = `schema X = string 1\n${END}`;
const F5B = `schema X = string "junk"\n${END}`;
const F5C = `schema X = string | integer 7\n${END}`;
const F5D = `${CAT}${DOG}schema X = Cat Dog\n${END}`;
const F6 = `${CAT}schema X = Cat 42\n`;
const F7 = `${BY_VARIANTS}schema X by a = Cat | Dog Cat\n${END}`;
const F10 = `${CAT}schema X = { a: string } Cat\n${END}`;
const F11 = `schema X = array<integer> 42\n${END}`;
/**
 * The SAME-LINE twin of fixture 12 (e8): identical arm text
 * (`array<integer>`), so the only variable between the two fixtures is WHERE
 * `let a = 1` sits — this line, or the next one.
 */
const F13 = "schema X = array<integer> let a = 1\na\n";

/**
 * The punct-head residue fixtures: one declared arm, then the punct head under
 * test on the same source line. One template over six heads, so the only
 * variable across the six is the head itself.
 */
function punctHeadSrc(head: string): string {
  return `${CAT}schema X = Cat ${head}\n${END}`;
}

// (c) EMPTY ARM POSITION — a top-level `|` with no `Type` on one of its sides.
const F2 = `${CAT}schema X = Cat |\n${END}`;
const F8 = `${CAT}schema X = Cat || Cat\n${END}`;
const F9 = `${CAT}schema X = | Cat\n${END}`;

// (e) THE FENCES — inputs whose disposition the code must not touch.
const F1A = `${CAT}Cat\n${END}`;
const F1D = `${CAT}schema S { f: Cat Cat }\n${END}`;
const F1E = `${CAT}schema S { f: Cat, g: Cat }\n${END}`;
const F1F_LIB = `${CAT}schema X = Cat Cat\n`;
const F1F_LIB_CONTROL = `${CAT}schema X = Cat\n`;
const F2A = `schema S { a: string | }\n${END}`;
const F3B = `schema S { a: -1 }\n${END}`;
const F4 = `schema X =\n${END}`;
const F6A = `${CAT}42\n`;
const F6B = "42 43\n";
const F12 = `schema X = array<integer>\n${END}`;

/** A `mode: prompt` theta whose single `params:` entry is `field`. */
function paramsSrc(field: string, body: string): string {
  return `---\nmode: prompt\nparams:\n  ${field}\n---\n${body}@\`use \${a}\`\n`;
}

const P1 = paramsSrc("a: X", `${CAT}schema X = Cat Cat\n`);
const P2 = paramsSrc("a: X", `${CAT}schema X = Cat |\n`);
const P3 = paramsSrc("a: X", "schema X = -1\n");
const P2A = paramsSrc("a: S", "schema S { a: string | }\n");

/** The closed lowering of `schema Cat { a: string }`. */
const CAT_DEF = {
  type: "object",
  properties: { a: { type: "string" } },
  required: ["a"],
  additionalProperties: false,
};

// ===========================================================================
// Parse + read helpers. Loud on every unexpected disposition.
// ===========================================================================

function parse(body: string): ThetaDocument {
  return parseDoc(FM + body, THETA_PATH);
}

/** Parse a `.thetalib` body: the top-level-form check keys off the extension. */
function parseLib(body: string): ThetaDocument {
  return parseDoc(body, THETALIB_PATH);
}

/**
 * A source span rendered `<line>:<col>-<line>:<col>` with the fixture's
 * frontmatter prelude subtracted, so every expectation in this file is written
 * in the BODY-relative coordinates of the bug doc's §Reproduction table and can
 * be read against it without arithmetic. An absent range renders `ABSENT`,
 * which no expectation accepts — an unlocated diagnostic is a red, not a pass.
 */
function fmtSpan(range: SourceRange | undefined, prelude: number): string {
  if (range === undefined) return "ABSENT";
  return `${range.start.line - prelude}:${range.start.column}-${range.end.line - prelude}:${range.end.column}`;
}

/** Every diagnostic rendered `<severity> <code>: <message> @<span>`, in emission order. */
function renderDiags(diags: readonly Diagnostic[], prelude: number): string[] {
  return diags.map((d) => `${d.severity} ${d.code}: ${d.message} @${fmtSpan(d.range, prelude)}`);
}

/** Every diagnostic rendered `<severity> <code>: <message>` — location asserted separately. */
function renderCoded(diags: readonly Diagnostic[]): string[] {
  return diags.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/**
 * The top-level statement sequence as `kind[:name]@<span>`. The trailing tail
 * expression is not a statement, so it does not appear. This is the observable
 * that carries three of the four "changes no other observable" claims at once —
 * which statements exist, in what order, and over which source spans — so a fix
 * that moved the capture boundary or lost the severed residue reds here before
 * any diagnostic assertion runs.
 */
function stmtSpans(doc: ThetaDocument, prelude: number): string[] {
  return doc.body.statements.map((stmt) => {
    const record = stmt as unknown as Record<string, unknown>;
    const kind = String(record["kind"]);
    const name = record["name"];
    const range = record["range"] as SourceRange | undefined;
    const head = typeof name === "string" ? `${kind}:${name}` : kind;
    return `${head}@${fmtSpan(range, prelude)}`;
  });
}

/** The named `schema` declaration node, or a loud failure naming the parse. */
function schemaDecl(doc: ThetaDocument, name: string, label: string): Record<string, unknown> {
  const decl = doc.body.statements.find((stmt) => {
    const record = stmt as unknown as Record<string, unknown>;
    return record["kind"] === "schema" && record["name"] === name;
  });
  if (decl === undefined) {
    throw new Error(
      `${label}: no \`schema ${name}\` declaration in the statement list ` +
        `${JSON.stringify(stmtSpans(doc, 0))}; diagnostics=${JSON.stringify(renderDiags(doc.diagnostics, 0))}`,
    );
  }
  return decl as unknown as Record<string, unknown>;
}

/**
 * The alias/union arm sources the named declaration captured, or a loud failure.
 * A capture that ran past the declaration shows up here as a joined arm; one
 * that ran short shows up as a missing arm.
 */
function armsOf(doc: ThetaDocument, name: string, label: string): readonly string[] {
  const arms = schemaDecl(doc, name, label)["arms"];
  if (!Array.isArray(arms)) {
    throw new Error(
      `${label}: \`schema ${name}\` carries no alias/union arm list, so the right-hand side was ` +
        `not captured as a declaration at all; diagnostics=${JSON.stringify(renderDiags(doc.diagnostics, 0))}`,
    );
  }
  return arms as readonly string[];
}

/** The named declaration's own source span, body-relative, or a loud failure. */
function declSpan(doc: ThetaDocument, name: string, label: string, prelude: number): string {
  const range = schemaDecl(doc, name, label)["range"] as SourceRange | undefined;
  if (range === undefined) {
    throw new Error(
      `${label}: \`schema ${name}\` carries no source range, so there is nothing to anchor an ` +
        `empty-arm-position diagnostic against`,
    );
  }
  return fmtSpan(range, prelude);
}

/** The body's tail expression kind, or `"none"` when tail promotion did not apply. */
function tailKind(doc: ThetaDocument): string {
  const tail = doc.body.tail as unknown as Record<string, unknown> | null;
  return tail === null ? "none" : String(tail["kind"]);
}

/**
 * The lowered `params:` document of a fixture, or a loud failure. Deliberately
 * does NOT require a clean diagnostic list: the pinned contract adds an
 * error-severity diagnostic to fixtures 1p / 2p / 3p while leaving the lowering
 * byte-identical, and a body-owned parse error does not collapse the
 * frontmatter, so the lowering stays readable on exactly these inputs.
 */
function loweredParams(label: string, doc: ThetaDocument): Record<string, unknown> {
  if (doc.frontmatter === null) {
    throw new Error(
      `${label}: the theta was REFUSED — frontmatter is null, so the lowering this fixture ` +
        `pins is unreachable. Diagnostics: ${JSON.stringify(renderDiags(doc.diagnostics, 0))}`,
    );
  }
  const params = doc.frontmatter.params;
  if (params === undefined) {
    throw new Error(
      `${label}: the frontmatter carries no parsed params block. ` +
        `Diagnostics: ${JSON.stringify(renderDiags(doc.diagnostics, 0))}`,
    );
  }
  const lowered = params.loweredSchema;
  if (lowered === undefined) {
    throw new Error(
      `${label}: the params block lowered to NOTHING (loweredSchema absent), so there is no ` +
        `AJV-validatable document at the argument boundary. ` +
        `Diagnostics: ${JSON.stringify(renderDiags(doc.diagnostics, 0))}`,
    );
  }
  return lowered;
}

/**
 * The emission contract shared by every malformed right-hand side: EXACTLY ONE
 * `theta/parse/malformed-alias-rhs` at error severity, its message the
 * registry's with `<X>` rendered as the declaration name, located at one of the
 * settled anchors, and every OTHER diagnostic the input already raised left
 * exactly as it was.
 *
 * Assertion order is deliberate. The untouched-diagnostics fence runs FIRST, so
 * it is verified on the current tree rather than skipped behind the red; the
 * emission assertion runs LAST and renders the whole observed list into its
 * failure text, so the red reads as "the entry is missing" and names what was
 * there instead.
 */
function expectMalformedAliasRhs(opts: {
  readonly label: string;
  readonly doc: ThetaDocument;
  readonly declName: string;
  readonly prelude: number;
  /** The body-relative spans the settled anchoring admits, usually exactly one. */
  readonly acceptedSpans: readonly string[];
  /** Every diagnostic the input raises independently of this code, in order. */
  readonly otherDiagnostics: readonly string[];
  readonly file?: string;
}): void {
  const { label, doc, declName, prelude, acceptedSpans, otherDiagnostics } = opts;
  const file = opts.file ?? THETA_PATH;

  expect(
    renderDiags(
      doc.diagnostics.filter((d) => d.code !== CODE),
      prelude,
    ),
    `${label} — the code's only effect is its own emission: every diagnostic this input already ` +
      `raises must survive unchanged, in the same order and at the same positions`,
  ).toEqual([...otherDiagnostics]);

  const hits = doc.diagnostics.filter((d) => d.code === CODE);
  expect(
    renderCoded(hits),
    `${label} — bug 0042 §Expected: this right-hand side is no ` +
      `\`AliasRhs ::= Type ("|" Type)*\` (grammar.md:175), so the declaration that loads is not ` +
      `the declaration that was written and ${CODE} is the registered disposition. Exactly one ` +
      `emission per malformed declaration, at error severity, with the registry's normative ` +
      `message. Whole observed diagnostic list=${JSON.stringify(renderDiags(doc.diagnostics, prelude))}`,
  ).toEqual([`error ${CODE}: ${malformedMessage(declName)}`]);

  const hit = hits[0];
  if (hit === undefined) {
    throw new Error(`${label}: no ${CODE} diagnostic after a one-element list assertion`);
  }
  expect(
    acceptedSpans,
    `${label} — anchoring: a same-line residue points at the residue token (the token the ` +
      `declaration cannot hold), an empty arm position points at the declaration's own range ` +
      `(there is no token outside the declaration to point at). observed=${fmtSpan(hit.range, prelude)}`,
  ).toContain(fmtSpan(hit.range, prelude));
  expect(
    hit.file,
    `${label} — a located site carries file AND range (diagnostic-shape.md §Internal diagnostic ` +
      `shape), which is what every neighbouring parse emission in this corpus carries`,
  ).toBe(file);
}

// ===========================================================================
// (a) THE DIAG-2 / DIAG-4 REGISTRY ANCHOR. GREEN — the row is landed; this cell
// is what stops it from drifting under the tests that read it.
// ===========================================================================

describe("bug 0042 (a) — the malformed-RHS code is registered", () => {
  it(`(a1): code-registry-parse.md carries ${CODE} at severity E, phase parse, with the \`<X>\` placeholder`, () => {
    // A registry addition is a DIAG-2 operation (diagnostic-shape.md:72),
    // covered within a theta 1.x minor by the GOV-15 diagnostic-registry
    // carve-out (source-language-stability.md:25) for the inputs whose only
    // change is the appearance of the code — exactly groups (b), (c) and (d).
    const row = REGISTRY.find((r) => r.code === CODE);
    expect(
      row,
      `DIAG-2: the registry is the closed authority for what the implementation emits, so ${CODE} ` +
        `must have a row before any test may assert it`,
    ).toBeDefined();
    expect(
      (row as RegistryRow).severity,
      "severity E — the declaration that loads is not the declaration that was written, which is " +
        "a refusal rather than an advisory; a warning would leave the malformed alias registered",
    ).toBe("E");
    expect(
      (row as RegistryRow).phase,
      "phase parse — the check runs where the right-hand-side capture stops, beside the object " +
        "body's comma rule and `empty-schema-body`",
    ).toBe("parse");
    expect(
      registryMessage(REGISTRY, CODE),
      "DIAG-4 — the Message column is normative; `<X>` is the established schema-name placeholder " +
        "the `empty-schema-body` and `empty-enum-body` rows already render, so no placeholder is " +
        "coined",
    ).toContain("<X>");
  });
});

// ===========================================================================
// (b) SAME-LINE RESIDUE. The right-hand side completes, and a token that
// continues no `Type` sits on the same source line as its last token.
// RED at HEAD: every fixture loads with the arms, statements and ranges
// asserted here and NO diagnostic naming the declaration.
// ===========================================================================

describe("bug 0042 (b) — same-line residue after a complete right-hand side is refused", () => {
  it("RED (b1): `schema X = Cat Cat` — one arm, a severed residue statement, and the emission", () => {
    // The field-boundary stop ends the arm at the second `Cat`, which re-enters
    // the statement loop as a bare declared-name expression statement. Both
    // halves stay exactly as they are; what changes is that the declaration is
    // now reported.
    const doc = parse(F1);
    expect(
      armsOf(doc, "X", "b1"),
      "b1 — the declaration keeps the arms it captured; the code adds an emission and moves no " +
        "arm",
    ).toEqual(["Cat"]);
    expect(
      stmtSpans(doc, FM_LINES),
      "b1 — the severed residue still parses as the statement it spells, over the same span, and " +
        "the declaration keeps its range",
    ).toEqual([
      "schema:Cat@1:1-1:25",
      "schema:X@2:1-2:15",
      "expr@2:16-2:19",
      "let:a@3:1-3:10",
    ]);
    expectMalformedAliasRhs({
      label: "b1",
      doc,
      declName: "X",
      prelude: FM_LINES,
      acceptedSpans: ["2:16-2:19"],
      otherDiagnostics: [],
    });
  });

  it("RED (b2): `schema X = Cat Cat Cat` — two residue statements, still ONE emission", () => {
    // The emission is per malformed DECLARATION, not per severed token: a
    // second residue statement adds a statement, not a diagnostic.
    const doc = parse(F1B);
    expect(armsOf(doc, "X", "b2"), "b2 — the arm list is unchanged by the extra residue").toEqual([
      "Cat",
    ]);
    expect(
      stmtSpans(doc, FM_LINES),
      "b2 — both residue tokens keep their own statements and spans",
    ).toEqual([
      "schema:Cat@1:1-1:25",
      "schema:X@2:1-2:15",
      "expr@2:16-2:19",
      "expr@2:20-2:23",
      "let:a@3:1-3:10",
    ]);
    expectMalformedAliasRhs({
      label: "b2",
      doc,
      declName: "X",
      prelude: FM_LINES,
      // The FIRST token the declaration cannot hold is the anchor; the tokens
      // behind it are the ordinary same-line statement class (§Non-goals).
      acceptedSpans: ["2:16-2:19"],
      otherDiagnostics: [],
    });
  });

  it("RED (b3): `schema X = Ghost Ghost` — the two name diagnostics stay, and the emission joins them", () => {
    // The arrangement of b1 with unresolvable text. The bug doc's acceptance
    // set requires this fixture to KEEP its current diagnostics: both existing
    // codes still fire, at their existing positions and in their existing
    // order. That is a floor, not a ceiling — the arrangement is b1's, and
    // §Fix requires the resolvable and unresolvable spellings to converge on
    // one rule, so the new code is ADDITIONAL here rather than substituted for
    // either name diagnostic.
    const doc = parse(F1C);
    expect(armsOf(doc, "X", "b3"), "b3 — the arm the capture kept").toEqual(["Ghost"]);
    expect(stmtSpans(doc, FM_LINES), "b3 — the residue statement is intact").toEqual([
      "schema:X@1:1-1:17",
      "expr@1:18-1:23",
      "let:a@2:1-2:10",
    ]);
    expectMalformedAliasRhs({
      label: "b3",
      doc,
      declName: "X",
      prelude: FM_LINES,
      acceptedSpans: ["1:18-1:23"],
      otherDiagnostics: [
        `error ${UNRESOLVED}: ${msg(UNRESOLVED, [["<name>", "Ghost"]])} @1:1-1:17`,
        `error ${UNKNOWN_IDENT}: ${msg(UNKNOWN_IDENT, [["<name>", "Ghost"]])} @1:18-1:23`,
      ],
    });
  });

  it("RED (b4): `schema X = -1` — the junk `\"-\"` arm is reported where it is written", () => {
    // `LiteralType` (grammar.md:102) has no unary-minus alternative, so the
    // captured `"-"` corresponds to no production in either grammar and the
    // field-boundary stop severs the `1`. The arm and the residue statement are
    // pinned unchanged: what the arm LOWERS to is bug 0043's subject, and this
    // code is the report that the declaration is malformed at all.
    const doc = parse(F3);
    expect(armsOf(doc, "X", "b4"), "b4 — the arm-start `-` joined the capture").toEqual(["-"]);
    expect(stmtSpans(doc, FM_LINES), "b4 — the severed `1` is its own statement").toEqual([
      "schema:X@1:1-1:13",
      "expr@1:13-1:14",
      "let:a@2:1-2:10",
    ]);
    expectMalformedAliasRhs({
      label: "b4",
      doc,
      declName: "X",
      prelude: FM_LINES,
      acceptedSpans: ["1:13-1:14"],
      otherDiagnostics: [],
    });
  });

  it("RED (b5): `schema X = -1 | null` — the stray-`|` diagnostic stays put beside the emission", () => {
    // The union spelling of b4. Its orphaned `|` already reaches the statement
    // loop's no-progress arm; that emission is a separate site with its own
    // span and must not move, merge or disappear.
    const doc = parse(F3A);
    expect(armsOf(doc, "X", "b5"), "b5 — the same arm-start capture as b4").toEqual(["-"]);
    expect(
      stmtSpans(doc, FM_LINES),
      "b5 — the `| null` behind the severed `1` stays residue rather than becoming a second arm",
    ).toEqual([
      "schema:X@1:1-1:13",
      "expr@1:13-1:14",
      "expr@1:17-1:21",
      "let:a@2:1-2:10",
    ]);
    expectMalformedAliasRhs({
      label: "b5",
      doc,
      declName: "X",
      prelude: FM_LINES,
      acceptedSpans: ["1:13-1:14"],
      otherDiagnostics: [
        // The `<construct>` tail is rendered by the emission site, not by the
        // closed placeholder table (bug doc §Non-goals) — the registry frame is
        // still the source of the message, so a reworded row reds here.
        `error ${UNSUPPORTED}: ${msg(UNSUPPORTED, [["<construct>", "stray '|' in statement position"]])} @1:15-1:16`,
      ],
    });
  });

  /**
   * The remaining same-line members of the registry row's *Trigger*: the same
   * arrangement over the other token kinds the field-boundary stop fires on
   * (number, string, keyword-headed primitive, a second declared name) and over
   * the two right-hand-side shapes that end in a bracket (`{ … }`, `array<…>`).
   * One rule names all of them, so they are driven from one table.
   */
  const RESIDUE_MEMBERS: ReadonlyArray<{
    readonly label: string;
    readonly source: string;
    readonly arms: readonly string[];
    readonly statements: readonly string[];
    readonly residueSpan: string;
  }> = [
    {
      label: "b6 `schema X = string 1`",
      source: F5A,
      arms: ["string"],
      statements: ["schema:X@1:1-1:18", "expr@1:19-1:20", "let:a@2:1-2:10"],
      residueSpan: "1:19-1:20",
    },
    {
      label: 'b7 `schema X = string "junk"`',
      source: F5B,
      arms: ["string"],
      statements: ["schema:X@1:1-1:18", "expr@1:19-1:25", "let:a@2:1-2:10"],
      residueSpan: "1:19-1:25",
    },
    {
      label: "b8 `schema X = string | integer 7`",
      source: F5C,
      arms: ["string", "integer"],
      statements: ["schema:X@1:1-1:28", "expr@1:29-1:30", "let:a@2:1-2:10"],
      residueSpan: "1:29-1:30",
    },
    {
      label: "b9 `schema X = Cat Dog` (both declared)",
      source: F5D,
      arms: ["Cat"],
      statements: [
        "schema:Cat@1:1-1:25",
        "schema:Dog@2:1-2:25",
        "schema:X@3:1-3:15",
        "expr@3:16-3:19",
        "let:a@4:1-4:10",
      ],
      residueSpan: "3:16-3:19",
    },
    {
      label: "b10 `schema X = { a: string } Cat` (inline object arm)",
      source: F10,
      // Since bug 0228's fix an inline object's brace group is a raw slice of
      // the author's own source bytes at a `schema X = ...` right-hand side
      // too, so this arm's interior space survives the capture.
      arms: ["{ a: string }"],
      statements: [
        "schema:Cat@1:1-1:25",
        "schema:X@2:1-2:25",
        "expr@2:26-2:29",
        "let:a@3:1-3:10",
      ],
      residueSpan: "2:26-2:29",
    },
    {
      label: "b11 `schema X = array<integer> 42` (generic arm)",
      source: F11,
      arms: ["array<integer>"],
      statements: ["schema:X@1:1-1:26", "expr@1:27-1:29", "let:a@2:1-2:10"],
      residueSpan: "1:27-1:29",
    },
  ];

  for (const member of RESIDUE_MEMBERS) {
    it(`RED (${member.label}): the arms and the residue statement stand, and the declaration is reported`, () => {
      const doc = parse(member.source);
      expect(
        armsOf(doc, "X", member.label),
        `${member.label} — the arms the capture kept are unchanged`,
      ).toEqual([...member.arms]);
      expect(
        stmtSpans(doc, FM_LINES),
        `${member.label} — the severed residue still parses as the statement it spells`,
      ).toEqual([...member.statements]);
      expectMalformedAliasRhs({
        label: member.label,
        doc,
        declName: "X",
        prelude: FM_LINES,
        acceptedSpans: [member.residueSpan],
        otherDiagnostics: [],
      });
    });
  }

  it("RED (b12): `schema X = Cat 42` as the last line — the tail stays unpromoted", () => {
    // A severed residue never starts a line, so it is not tail-promotable and
    // the body's final value is `null` (grammar.md:129). That consequence is
    // the general same-line one (fixture 6b's control in group (e)) and must
    // survive the emission untouched.
    const doc = parse(F6);
    expect(armsOf(doc, "X", "b12"), "b12 — one arm").toEqual(["Cat"]);
    expect(stmtSpans(doc, FM_LINES), "b12 — three statements, the last being the residue").toEqual([
      "schema:Cat@1:1-1:25",
      "schema:X@2:1-2:15",
      "expr@2:16-2:18",
    ]);
    expect(
      tailKind(doc),
      "b12 — tail promotion requires a line-starting last statement, so the severed residue does " +
        "not become the final value",
    ).toBe("none");
    expectMalformedAliasRhs({
      label: "b12",
      doc,
      declName: "X",
      prelude: FM_LINES,
      acceptedSpans: ["2:16-2:18"],
      otherDiagnostics: [],
    });
  });

  it("RED (b13): `schema X by a = Cat | Dog Cat` — the `by` spelling answers to the same rule", () => {
    // `SchemaShape`'s third alternative reaches the same right-hand side
    // (`UnionRhs`), so the residue rule cannot be scoped to the `=` spelling
    // alone. The two variants carry a unique string-literal `a`, so the
    // discriminator checks pass and this fixture's only complaint is the
    // residue.
    const doc = parse(F7);
    expect(armsOf(doc, "X", "b13"), "b13 — both arms of the `by` union are captured").toEqual([
      "Cat",
      "Dog",
    ]);
    expect(stmtSpans(doc, FM_LINES), "b13 — the residue statement is intact").toEqual([
      "schema:Cat@1:1-1:35",
      "schema:Dog@2:1-2:35",
      "schema:X@3:1-3:26",
      "expr@3:27-3:30",
      "let:a@4:1-4:10",
    ]);
    expectMalformedAliasRhs({
      label: "b13",
      doc,
      declName: "X",
      prelude: FM_LINES,
      acceptedSpans: ["3:27-3:30"],
      otherDiagnostics: [],
    });
  });

  it("RED (b14): `schema X = array<integer> let a = 1` — the SAME-LINE half of the fixture-12 discrimination is refused", () => {
    // Fixture 12 (e8) is `schema X = array<integer>` with `let a = 1` on the
    // NEXT source line: silent, because the trailing `>` continuation swallows
    // the SEPARATOR TOKEN, and a token on the next line is not residue. This
    // fixture is the identical arm text with `let a = 1` on the SAME line
    // instead — the one variable the fix's line-based check reads. `let` is a
    // residue head by TOKEN KIND (keyword), not by any special-casing of this
    // one keyword.
    const doc = parse(F13);
    expect(armsOf(doc, "X", "b14"), "b14 — the generic arm is captured whole, exactly as fixture 12's").toEqual([
      "array<integer>",
    ]);
    expect(
      stmtSpans(doc, FM_LINES),
      "b14 — the residue still parses as its own `let` statement, on the same line as the " +
        "declaration (contrast fixture 12, where the identical arm text puts `let:a` on its own " +
        "line)",
    ).toEqual(["schema:X@1:1-1:26", "let:a@1:27-1:36"]);
    expectMalformedAliasRhs({
      label: "b14",
      doc,
      declName: "X",
      prelude: FM_LINES,
      acceptedSpans: ["1:27-1:30"],
      otherDiagnostics: [],
    });
  });

  /**
   * The punct half of the residue-head rule: the six heads the registry row
   * names — the query-template `@`, a bare backtick template, `(`, `[`, `!`,
   * and a unary-negation `-`. Each heads a punct-led statement and none can
   * begin or continue a `Type`, so each stands at the boundary in exactly the
   * way an identifier does; every other cell in this file drives an
   * `ident` / `keyword` / `string` / `number` head, which would leave the row's
   * punct half advertised and unmeasured.
   *
   * Two of the six carry an error-severity code of their own — the `@`-query's
   * discarded `Result`, and the bare backtick's rejected value-position
   * template — so each member pins its FULL diagnostic list rather than a
   * list filtered to this code: the emission has to JOIN those codes, in the
   * observed order, not replace, reorder or duplicate them.
   */
  const PUNCT_RESIDUE_HEADS: ReadonlyArray<{
    readonly label: string;
    readonly head: string;
    readonly residueStmt: string;
    readonly otherDiagnostics: readonly string[];
  }> = [
    {
      label: "b15a schema X = Cat @`q`",
      head: "@`q`",
      residueStmt: "query@2:16-2:20",
      otherDiagnostics: [`error ${DISCARDED_QUERY}: ${msg(DISCARDED_QUERY, [])} @2:16-2:20`],
    },
    {
      label: "b15b schema X = Cat `q`",
      head: "`q`",
      residueStmt: "expr@2:16-2:19",
      otherDiagnostics: [
        `error ${UNSUPPORTED}: ${msg(UNSUPPORTED, [
          [
            "<construct>",
            "backtick template in value position (query templates must be @-prefixed)",
          ],
        ])} @2:16-2:19`,
      ],
    },
    {
      label: "b15c schema X = Cat (1)",
      head: "(1)",
      residueStmt: "expr@2:17-2:18",
      otherDiagnostics: [],
    },
    {
      label: "b15d schema X = Cat [1]",
      head: "[1]",
      residueStmt: "expr@2:16-2:19",
      otherDiagnostics: [],
    },
    {
      label: "b15e schema X = Cat !true",
      head: "!true",
      residueStmt: "expr@2:16-2:21",
      otherDiagnostics: [],
    },
    {
      label: "b15f schema X = Cat -1",
      head: "-1",
      residueStmt: "expr@2:16-2:18",
      otherDiagnostics: [],
    },
  ];

  it("RED (b15): each of the six punct residue heads is refused once, at the punct token", () => {
    // All six are measured before anything is asserted, and the six results are
    // compared in ONE call: a divergence on any member is then reported beside
    // the other five instead of hiding them behind the first failure.
    const observed = PUNCT_RESIDUE_HEADS.map((member) => {
      const doc = parse(punctHeadSrc(member.head));
      return {
        label: member.label,
        arms: [...armsOf(doc, "X", member.label)],
        statements: stmtSpans(doc, FM_LINES),
        diagnostics: renderDiags(doc.diagnostics, FM_LINES),
      };
    });
    const expected = PUNCT_RESIDUE_HEADS.map((member) => ({
      label: member.label,
      arms: ["Cat"],
      statements: [
        "schema:Cat@1:1-1:25",
        "schema:X@2:1-2:15",
        member.residueStmt,
        "let:a@3:1-3:10",
      ],
      // Anchored at the punct token itself (`2:16-2:17`), which is one column
      // wide in every member — the residue STATEMENT each head opens is wider
      // and starts elsewhere for `(1)`, so the two spans are pinned separately.
      diagnostics: [
        `error ${CODE}: ${malformedMessage("X")} @2:16-2:17`,
        ...member.otherDiagnostics,
      ],
    }));
    expect(
      observed,
      "b15 — a punct head at the boundary is residue on the same grounds as an identifier: it " +
        "continues no `Type`, so the declaration that loads is not the declaration that was " +
        "written. One emission per member, at the punct token, with the arms, the residue " +
        "statement and every pre-existing code left exactly as they were.",
    ).toEqual(expected);
  });
});

// ===========================================================================
// (c) EMPTY ARM POSITION. A top-level `|` with no `Type` on one of its sides.
// Nothing reaches the statement loop — the `|` is consumed INSIDE the
// declaration's range and the empty segment is dropped by the top-level split —
// so the declaration's own range is the anchor.
// RED at HEAD: no diagnostic at any severity.
// ===========================================================================

describe("bug 0042 (c) — an empty arm position is refused", () => {
  it("RED (c1): `schema X = Cat |` — the dangling `|` is inside the declaration and now reported", () => {
    const doc = parse(F2);
    expect(
      armsOf(doc, "X", "c1"),
      "c1 — the declaration keeps the one arm it captured; the code adds an emission and does " +
        "not resurrect the empty segment",
    ).toEqual(["Cat"]);
    expect(
      stmtSpans(doc, FM_LINES),
      "c1 — the declaration's range still covers the trailing `|`, and no residue statement " +
        "exists for it",
    ).toEqual(["schema:Cat@1:1-1:25", "schema:X@2:1-2:17", "let:a@3:1-3:10"]);
    expectMalformedAliasRhs({
      label: "c1",
      doc,
      declName: "X",
      prelude: FM_LINES,
      acceptedSpans: [declSpan(doc, "X", "c1", FM_LINES)],
      otherDiagnostics: [],
    });
    expect(
      declSpan(doc, "X", "c1", FM_LINES),
      "c1 — and that anchor is the declaration's measured span, not whatever the emission " +
        "happened to carry",
    ).toBe("2:1-2:17");
  });

  it("RED (c2): `schema X = | Cat` — a leading `|` is the same empty arm position", () => {
    const doc = parse(F9);
    expect(armsOf(doc, "X", "c2"), "c2 — the arm behind the leading `|` is the whole arm list").toEqual([
      "Cat",
    ]);
    expect(
      stmtSpans(doc, FM_LINES),
      "c2 — the leading `|` is consumed inside the declaration, so no statement carries it",
    ).toEqual(["schema:Cat@1:1-1:25", "schema:X@2:1-2:17", "let:a@3:1-3:10"]);
    expectMalformedAliasRhs({
      label: "c2",
      doc,
      declName: "X",
      prelude: FM_LINES,
      acceptedSpans: [declSpan(doc, "X", "c2", FM_LINES)],
      otherDiagnostics: [],
    });
    expect(declSpan(doc, "X", "c2", FM_LINES), "c2 — the declaration's measured span").toBe(
      "2:1-2:17",
    );
  });

  it("RED (c3): `schema X = Cat || Cat` — one emission, at whichever of the two settled anchors applies", () => {
    // The registry row lists `schema X = Cat || Cat` under EMPTY ARM POSITION,
    // and the lexer emits `||` as one token whose empty segments the top-level
    // split drops. The same input is also the residue arrangement: the
    // declaration's range ends after the `||` and the second `Cat` is severed
    // into its own statement. Both anchors are therefore inside the settled
    // rule, and which one the emission takes follows from which shape the fix
    // classifies this input as. What is NOT open is the count, the severity,
    // the message, or the untouched arms and statements.
    const doc = parse(F8);
    expect(armsOf(doc, "X", "c3"), "c3 — the empty segments are dropped, leaving one arm").toEqual([
      "Cat",
    ]);
    expect(
      stmtSpans(doc, FM_LINES),
      "c3 — the declaration's range covers the `||` and the second `Cat` is severed",
    ).toEqual([
      "schema:Cat@1:1-1:25",
      "schema:X@2:1-2:18",
      "expr@2:19-2:22",
      "let:a@3:1-3:10",
    ]);
    expectMalformedAliasRhs({
      label: "c3",
      doc,
      declName: "X",
      prelude: FM_LINES,
      // Narrowed to the single declaration-range anchor (not the two-element
      // allowlist a reader unsure of the ordering might reach for): shape (a)
      // is checked FIRST in `emitMalformedAliasRhs`, so an input that is both
      // shapes emits once, anchored at the declaration, never at the residue.
      acceptedSpans: ["2:1-2:18"],
      otherDiagnostics: [],
    });
  });
});

// ===========================================================================
// (d) THE `params:` SPELLING. The malformed declaration is reachable from the
// frontmatter, where its lowered `$defs` fragment is what a caller's arguments
// are validated against. The emission must appear there too, and the lowering
// must not move — a body-owned parse error does not collapse the frontmatter,
// so both are observable on one parse.
// RED at HEAD: silent, and the caller's argument boundary carries the
// consequence.
// ===========================================================================

describe("bug 0042 (d) — the frontmatter `params:` spelling reports the same declaration", () => {
  it("RED (d1): `params: a: X` over `schema X = Cat Cat` — emission plus the unchanged `$ref` lowering", () => {
    const doc = parseDoc(P1, THETA_PATH);
    expect(
      armsOf(doc, "X", "d1"),
      "d1 — the arms the capture kept are what the alias lowers from",
    ).toEqual(["Cat"]);
    expect(
      loweredParams("d1", doc),
      "d1 — the code changes no other observable: the alias still lowers to the `$ref` chain and " +
        "the referenced object schema is still hoisted",
    ).toEqual({
      type: "object",
      properties: { a: { $ref: "#/$defs/X" } },
      required: ["a"],
      additionalProperties: false,
      $defs: { X: { $ref: "#/$defs/Cat" }, Cat: CAT_DEF },
    });
    expectMalformedAliasRhs({
      label: "d1",
      doc,
      declName: "X",
      prelude: PARAMS_LINES,
      acceptedSpans: ["2:16-2:19"],
      otherDiagnostics: [],
    });
  });

  it("RED (d2): `params: a: X` over `schema X = Cat |` — emission plus the unchanged `$ref` lowering", () => {
    const doc = parseDoc(P2, THETA_PATH);
    expect(armsOf(doc, "X", "d2"), "d2 — the one captured arm").toEqual(["Cat"]);
    expect(
      loweredParams("d2", doc),
      "d2 — the dropped empty segment leaves the lowering identical to the well-formed one-arm " +
        "alias, which is exactly why the declaration itself has to be reported",
    ).toEqual({
      type: "object",
      properties: { a: { $ref: "#/$defs/X" } },
      required: ["a"],
      additionalProperties: false,
      $defs: { X: { $ref: "#/$defs/Cat" }, Cat: CAT_DEF },
    });
    expectMalformedAliasRhs({
      label: "d2",
      doc,
      declName: "X",
      prelude: PARAMS_LINES,
      acceptedSpans: [declSpan(doc, "X", "d2", PARAMS_LINES)],
      otherDiagnostics: [],
    });
  });

  it("RED (d3): `params: a: X` over `schema X = -1` — emission beside the permissive `{}` fragment", () => {
    // The `"-"` arm reaches the lowerer's catch-all, so the parameter accepts
    // every JSON value. What that fragment should be is bug 0043's subject;
    // pinned here unchanged so this fix is proved to add the emission and
    // nothing else.
    const doc = parseDoc(P3, THETA_PATH);
    expect(armsOf(doc, "X", "d3"), "d3 — the junk arm").toEqual(["-"]);
    expect(
      loweredParams("d3", doc),
      "d3 — the alias still lowers to the permissive fragment; the emission is the change, the " +
        "lowering is not",
    ).toEqual({
      type: "object",
      properties: { a: { $ref: "#/$defs/X" } },
      required: ["a"],
      additionalProperties: false,
      $defs: { X: {} },
    });
    expectMalformedAliasRhs({
      label: "d3",
      doc,
      declName: "X",
      prelude: PARAMS_LINES,
      acceptedSpans: ["1:13-1:14"],
      otherDiagnostics: [],
    });
  });
});

// ===========================================================================
// (e) THE ANTI-WIDENING FENCES. Every input here is GREEN today and must stay
// green: the rule is scoped to the alias right-hand side, to the SAME source
// line, and to a right-hand side that yielded at least one arm. These cells are
// what makes that scoping a measured claim rather than an intention.
// ===========================================================================

describe("bug 0042 (e) — the fences the rule may not cross", () => {
  it("GREEN (e1, fixture 1a): a bare declared name on its own line stays silent", () => {
    // The residue's statement class, written where it is legal. The bug doc's
    // §Non-goals excludes the general same-line statement permissiveness, so
    // the rule may only reach a token that shares a line with an alias
    // declaration's right-hand side — never this.
    const doc = parse(F1A);
    expect(stmtSpans(doc, FM_LINES), "e1 — the same statement, on its own line").toEqual([
      "schema:Cat@1:1-1:25",
      "expr@2:1-2:4",
      "let:a@3:1-3:10",
    ]);
    expect(renderDiags(doc.diagnostics, FM_LINES), "e1 — and it is silent").toEqual([]);
  });

  it("GREEN (e2, fixture 1d): the object body's missing separator keeps its own two codes", () => {
    // §Fix constraint 4: a change at the alias position that also moves the
    // object body's behaviour is out of scope. The object form already rejects
    // this arrangement through its comma rule, and both of its diagnostics must
    // be exactly what they are — including the `empty-schema-body` that follows
    // from the dropped field list.
    const doc = parse(F1D);
    expect(stmtSpans(doc, FM_LINES), "e2 — the declaration is one statement").toEqual([
      "schema:Cat@1:1-1:25",
      "schema:S@2:1-2:24",
      "let:a@3:1-3:10",
    ]);
    expect(
      renderDiags(doc.diagnostics, FM_LINES),
      "e2 — the object position's disposition is untouched, in both codes, order and spans",
    ).toEqual([
      `error ${EMPTY_BODY}: ${msg(EMPTY_BODY, [["<X>", "S"]])} @2:1-2:24`,
      `error ${UNSUPPORTED}: ${msg(UNSUPPORTED, [["<construct>", "schema fields must be comma-separated"]])} @2:19-2:22`,
    ]);
  });

  it("GREEN (e3, fixture 1e): the object body with the comma present stays clean", () => {
    const doc = parse(F1E);
    expect(
      renderDiags(doc.diagnostics, FM_LINES),
      "e3 — the well-formed object body is the control for e2: nothing about the comma rule or " +
        "the alias rule may reach it",
    ).toEqual([]);
    expect(stmtSpans(doc, FM_LINES), "e3 — one declaration statement").toEqual([
      "schema:Cat@1:1-1:25",
      "schema:S@2:1-2:28",
      "let:a@3:1-3:10",
    ]);
  });

  it("GREEN (e4, fixture 1f): the `.thetalib` spelling ALSO gets the malformed-alias-rhs emission", () => {
    // The severed residue is a top-level statement in a `.thetalib`, which that
    // file kind already refuses (`thetalib-top-level-statement`, a complaint
    // about STATEMENT PLACEMENT). The parser is shared between file kinds —
    // `finishAliasSchema` does not read the file extension — so the same
    // residue ALSO draws `malformed-alias-rhs` (a complaint about the
    // DECLARATION): both name the same severed token, at the same span, and
    // neither is exclusive of the other. The residue-free control stays
    // exactly `[]`, because a well-formed right-hand side is outside the rule
    // under either code.
    const doc = parseLib(F1F_LIB);
    expect(armsOf(doc, "X", "e4"), "e4 — the same capture as fixture 1").toEqual(["Cat"]);
    expect(stmtSpans(doc, LIB_LINES), "e4 — the same statements as fixture 1, minus the tail").toEqual([
      "schema:Cat@1:1-1:25",
      "schema:X@2:1-2:15",
      "expr@2:16-2:19",
    ]);
    expect(
      renderDiags(doc.diagnostics, LIB_LINES),
      "e4 — the full list, in observed emission order: both codes anchored at the residue token " +
        "the declaration cannot hold",
    ).toEqual([
      `error ${CODE}: ${malformedMessage("X")} @2:16-2:19`,
      `error ${THETALIB_TOP_LEVEL}: ${msg(THETALIB_TOP_LEVEL, [])} @2:16-2:19`,
    ]);

    const control = parseLib(F1F_LIB_CONTROL);
    expect(
      renderDiags(control.diagnostics, LIB_LINES),
      "e4 CONTROL — the residue-free `.thetalib` alias stays exactly `[]`: a well-formed " +
        "right-hand side is outside the rule under either code",
    ).toEqual([]);
    expect(armsOf(control, "X", "e4 CONTROL"), "e4 CONTROL — one arm, nothing severed").toEqual([
      "Cat",
    ]);
  });

  it("GREEN (e5, fixture 2a): the dangling `|` in a FIELD type is refused now (bug 0061)", () => {
    // WHY THIS TEST MOVED: the empty arm position at the object form's
    // field-type position is the field-position half of one defect with this
    // file's own alias-position dangling `|` (fixture 2, `schema X = Cat |`,
    // refused since 0042) — bug 0061 names both positions as one class of
    // text no `Type` production spells and is the authority that closes the
    // asymmetry (docs/bugs/0061-…md §Fix constraint 7). `string|` reaches
    // `lowerTypeExpr`'s catch-all whole (the trailing `|` survives inside one
    // `typeSource`, unlike the alias arm list's own non-empty filter), so it
    // now draws exactly one `theta/parse/schema-type-not-expression` at the
    // DECLARATION's range (bug 0061 §Fix constraint 4). The lowering stays
    // pinned: the refusal is raised by the caller, never inside
    // `lowerTypeExpr` itself (§Fix constraint 2), so a caller's argument is
    // validated against the same permissive fragment as before — now with a
    // registered diagnostic naming it, and the theta does not register.
    const doc = parse(F2A);
    expect(
      renderDiags(doc.diagnostics, FM_LINES),
      "e5 — the field position now refuses the dangling `|`",
    ).toEqual([`error ${REFUSAL}: ${refusalMessage("S")} @1:1-1:25`]);
    expect(stmtSpans(doc, FM_LINES), "e5 — one declaration statement, unmoved").toEqual([
      "schema:S@1:1-1:25",
      "let:a@2:1-2:10",
    ]);

    const withParams = parseDoc(P2A, THETA_PATH);
    expect(
      renderDiags(withParams.diagnostics, PARAMS_LINES),
      "e5 — reaching it from `params:` changes nothing about the lowering, but the body's OWN " +
        "schema declaration still draws the same refusal",
    ).toEqual([`error ${REFUSAL}: ${refusalMessage("S")} @1:1-1:25`]);
    expect(
      loweredParams("e5", withParams),
      "e5 — the field's own lowering is the measured one, UNMOVED by bug 0061: the trailing `|` is " +
        "dropped by the same top-level split and the field falls to the permissive fragment — the " +
        "refusal judges the text, it does not touch the bytes",
    ).toEqual({
      type: "object",
      properties: { a: { $ref: "#/$defs/S" } },
      required: ["a"],
      additionalProperties: false,
      $defs: {
        S: {
          type: "object",
          properties: { a: {} },
          required: ["a"],
          additionalProperties: false,
        },
      },
    });
  });

  it("GREEN (e6, fixture 3b): `schema S { a: -1 }` keeps `empty-schema-body` alone", () => {
    // The `-1` at the object form's field-type position: the field list is
    // dropped whole and the body reads as empty. One code, unchanged — the
    // alias rule must not add a second one at a position it does not govern.
    //
    // MEASURED UNMOVED BY BUG 0061 (the field-position sibling of e5, and the
    // other cell §Fix constraint 7 licenses to move): `parseSchemaObjectBody`
    // discards the whole malformed field list before any field-type walk
    // runs, so no fragment ever reaches `lowerTypeExpr`'s catch-all for
    // `theta/parse/schema-type-not-expression` to judge — this cell stays
    // pinned by construction, not by a guard.
    const doc = parse(F3B);
    expect(
      renderDiags(doc.diagnostics, FM_LINES),
      "e6 — exactly the object position's own disposition, unmoved",
    ).toEqual([`error ${EMPTY_BODY}: ${msg(EMPTY_BODY, [["<X>", "S"]])} @1:1-1:19`]);
  });

  it("GREEN (e7, fixture 4): a right-hand side that yields NO arm stays `empty-schema-body`", () => {
    // The registry row's first exclusion, and one of the two cells the bug
    // doc's §Fix names as must-keep. `schema X =` followed by a next-line
    // statement captures nothing, so the declaration has no arms to be
    // malformed about: `empty-schema-body` is its trigger, alone.
    const doc = parse(F4);
    expect(
      renderDiags(doc.diagnostics, FM_LINES),
      "e7 — the zero-arm path is a different registered trigger, and this input must not gain a " +
        "second code",
    ).toEqual([`error ${EMPTY_BODY}: ${msg(EMPTY_BODY, [["<X>", "X"]])} @1:1-1:11`]);
    expect(stmtSpans(doc, FM_LINES), "e7 — the next-line `let` is untouched").toEqual([
      "schema:X@1:1-1:11",
      "let:a@2:1-2:10",
    ]);
  });

  it("GREEN (e8, fixture 12): a token on the NEXT line is not residue", () => {
    // The registry row's second exclusion. `array<integer>` ends in a trailing
    // newline-continuation trigger, so the following `let` sits directly ahead
    // of the cursor with no separator token — yet it is on the next SOURCE
    // line, which the statement separator already governs (grammar.md:199).
    // This is the cell that keeps the rule's discrimination line-based.
    const doc = parse(F12);
    expect(armsOf(doc, "X", "e8"), "e8 — the generic arm is captured whole").toEqual([
      "array<integer>",
    ]);
    expect(stmtSpans(doc, FM_LINES), "e8 — the `let` survives as its own statement").toEqual([
      "schema:X@1:1-1:26",
      "let:a@2:1-2:10",
    ]);
    expect(
      renderDiags(doc.diagnostics, FM_LINES),
      "e8 — and nothing fires: a next-line token is the next statement, not residue",
    ).toEqual([]);
  });

  it("GREEN (e9, fixtures 6a/6b): the general same-line statement class keeps its dispositions", () => {
    // The tail-promotion controls. `42` on its own line IS promoted; `42 43`
    // loses the promotion for the second statement exactly as fixture 6's
    // residue does. That class is wider than this boundary and unfiled
    // (§Non-goals), so no rule scoped to an alias right-hand side may report it.
    const promoted = parse(F6A);
    expect(stmtSpans(promoted, FM_LINES), "e9 — one statement, the `42` promoted").toEqual([
      "schema:Cat@1:1-1:25",
    ]);
    expect(tailKind(promoted), "e9 — a line-starting last expression is the final value").toBe(
      "number",
    );
    expect(renderDiags(promoted.diagnostics, FM_LINES), "e9 — silent").toEqual([]);

    const pair = parse(F6B);
    expect(stmtSpans(pair, FM_LINES), "e9 — two statements on one line, neither a declaration").toEqual(
      ["expr@1:1-1:3", "expr@1:4-1:6"],
    );
    expect(
      tailKind(pair),
      "e9 — the second statement does not start a line, so there is no final value",
    ).toBe("none");
    expect(
      renderDiags(pair.diagnostics, FM_LINES),
      "e9 — and the general class stays silent: this fix reports declarations, not line packing",
    ).toEqual([]);
  });
});
