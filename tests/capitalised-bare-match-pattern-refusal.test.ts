import { execFileSync } from "node:child_process";
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
import { parseDoc, parseDocBytes } from "./helpers/e2e-s1";
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

// Bug 0141 — `parsePattern`'s tail arm (src/parser/theta-document.ts:4178–4202)
// returns `{ kind: "identifier", name: t.text }` for any leading `ident` OR
// `keyword` token, so a capitalised bare `match` pattern binds the scrutinee
// instead of naming a declaration, and a reserved keyword binds in the same
// position (docs/bugs/0141-capitalised-bare-match-pattern-binds-identifier.md).
//
// THE CONTRACT UNDER TEST is the route settled for this run in
// `.pi/tmp/fixes/0141-route.md` — §Fix route 1 with half 2 included. Two
// refusals are added to that tail arm ONLY, after the `Ok(` / `Err(`
// constructor gate (src/parser/theta-document.ts:4133) and after the
// `Ident {` object gate (:4142), in this order:
//
//   1. `_` stays a wildcard (src/parser/theta-document.ts:4179–4181).
//   2. a `keyword` pattern head, whatever its case (`Ok`, `Err`, `Result`,
//      `string`, `let`, …) draws the already-registered
//      `theta/parse/reserved-keyword-as-identifier`
//      (docs/spec_topics/diagnostics/code-registry-parse.md:21, whose *Trigger*
//      "Reserved keyword used in an identifier position." carries no position
//      qualifier) — implementation conformance, no registry edit.
//   3. otherwise an `ident` head whose first letter is A–Z draws the NEW
//      registered `theta/parse/capitalised-pattern-head`.
//
// RESERVED BEFORE CASE, so `Ok` / `Err` / `Result` draw exactly ONE code and
// never both (group (c) asserts whole lists, which is where that ordering is
// observable).
//
// THE RETURNED NODE IS UNCHANGED in both refusal cases — still
// `{ kind: "identifier", name: t.text }`. The refusal is carried by the
// error-severity diagnostic, which `hasLoadParseError`
// (src/extension/production-composition.ts) turns into a registration
// denial. Two consequences this file asserts directly, because they are what
// separates this route from "return a wildcard instead":
//   - the binder still enters the arm-body scope
//     (`collectPatternBindings`, src/parser/theta-document.ts:4925, seeded at
//     :5261), so an arm-body read of the head draws NO second
//     `theta/parse/unknown-identifier`: every group-(a)–(d) row's expected list
//     holds exactly the refusal, never a cascade;
//   - the runtime value of an already-parsed arm does not move
//     (src/runtime/match-result.ts:177's identifier arm is untouched), so a1,
//     b4 and c1 keep their measured values and gain exactly one diagnostic.
//
// Spec anchors:
//   - docs/spec_topics/expressions.md:174 — "Disambiguation: lowercase
//     identifiers bind, capitalised identifiers refer to constructors or schema
//     names. `Ok` and `Err` are reserved." The sentence group (a) and group (c)
//     file against, mirrored at docs/reference/grammar.md:332 ("Lowercase
//     identifiers bind; capitalised refer to constructors/schema names.").
//   - docs/spec_topics/lexical.md:18 — the same rule from the other side, with
//     `enum` added: "Inside `match` patterns the same first-letter rule then
//     disambiguates without ambiguity: a lowercase identifier introduces a
//     fresh binding, an uppercase identifier refers to an existing schema,
//     enum, or constructor in scope."
//   - docs/spec_topics/lexical.md:13 — "The **first letter's case is enforced**
//     by the parser — it is what makes case-based pattern disambiguation in
//     `match` work without additional grammar". This is why the pattern
//     position's case rule selects the PRODUCTION rather than expressing a
//     naming convention, and therefore why the refusal is not
//     `binding-case-mismatch`.
//   - docs/spec_topics/lexical.md:20 — the 32 reserved spellings and
//     "Using one of these in identifier position is
//     `theta/parse/reserved-keyword-as-identifier`". `Ok`, `Err`, `Result`,
//     `string` and `let` are all on that list.
//   - docs/spec_topics/expressions.md:167–172 — the six-row pattern table. No
//     row admits a capitalised head with nothing after it: the constructor row
//     needs `(` and the object row needs `{`, which is exactly what group (g)
//     pins as still working.
//   - docs/spec_topics/bindings.md:27 — *Immutable contexts*, the rule row d5's
//     `theta/parse/mut-on-immutable-context` comes from.
//   - docs/spec_topics/governance/source-language-stability.md:25 — the
//     diagnostic-registry carve-out that admits this addition; group (f) is its
//     corpus half, re-measured rather than cited.
//
// SCOPE — what this file deliberately does not assert (the bug's §Non-goals):
// enum-value equality against a string literal (row b5), an enum-variant
// pattern production (`C.Red`, row g1), static exhaustiveness /
// unreachable-arm analysis, `parsePattern`'s one-token recovery tail
// (src/parser/theta-document.ts:4241–4243, bug 0123's subject), and the
// uppercase `fn` parameter / `for` variable positions beyond MEASURING them in
// group (e).
//
// TIER — unit, offline, provider-free, deterministic, in the default `npm test`
// suite. Both observables settle in-process: the diagnostic list at the
// `parseThetaDocument` boundary, and the value inside one `executeBody` over
// the production prompt-mode binding. Nothing on this path crosses a provider,
// a model, a child process or the network, so neither an integration nor a live
// tier is reachable-only — they would add no observable. The bug's §Witness
// says the same and rules the live tier out.
//
// NO SILENT SKIPPING (CLAUDE.md). The registry oracle in group (r) throws
// naming the absent row; group (f) fails loudly when `git ls-files` reports no
// corpus file. Every other expectation is a hard-coded literal, so the primary
// reds in groups (a)–(e) and (h) are the MISSING DIAGNOSTIC — the symptom —
// and never an oracle lookup.

// ===========================================================================
// The two codes and their normative messages.
// ===========================================================================

/** The NEW registered row this run adds (route memo §"The new row"). */
const CAP = "theta/parse/capitalised-pattern-head";

/** Already registered (code-registry-parse.md:21) — half 2 needs no row. */
const RESERVED = "theta/parse/reserved-keyword-as-identifier";

/** Existing codes the control rows and the multi-diagnostic rows carry. */
const MUT_IMMUTABLE = "theta/parse/mut-on-immutable-context";
const UNKNOWN_IDENT = "theta/parse/unknown-identifier";
const BINDING_CASE = "theta/parse/binding-case-mismatch";
const NON_STRING_JOIN = "theta/parse/non-string-array-join";
const UNKNOWN_METHOD = "theta/parse/unknown-method";
const MATCH_ARM_TYPE_MISMATCH = "theta/parse/match-arm-type-mismatch";

/**
 * The registered *Message* renderings, hard-coded. DIAG-4 makes the registry
 * the source of truth and group (r) is this file's one anchor against it; every
 * other row compares against these literals so that a red anywhere else names
 * the missing diagnostic rather than a harness oracle.
 */
function capMessage(name: string): string {
  return `capitalised pattern head '${name}' names no pattern production`;
}

function reservedMessage(keyword: string): string {
  return `reserved keyword '${keyword}' cannot be used as an identifier`;
}

// ===========================================================================
// Parse harness — the shipped `parseThetaDocument` through `parseDoc`
// (tests/helpers/e2e-s1.ts:39) with inert offline deps.
// ===========================================================================

/** Every row is a whole prompt-mode theta; frontmatter occupies lines 1–3. */
const FM = "---\nmode: prompt\n---\n";

const FILE = "bug0141.theta";

function theta(body: string): ThetaDocument {
  return parseDoc(FM + body, FILE);
}

/**
 * A diagnostic reduced to the five normative fields (diagnostic-shape.md
 * §"Internal diagnostic shape"): severity, code, file, range, message. The
 * projection is deliberate — `hint` is a non-normative repair aid the registry
 * row carries in its own column, so pinning it here would make an added hint a
 * failure of an assertion that is about the refusal, not about the prose.
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

/** The expected refusal for a capitalised bare pattern head. */
function cap(name: string, at: SourceRange): DiagShape {
  return {
    severity: "error",
    code: CAP,
    file: FILE,
    range: at,
    message: capMessage(name),
  };
}

/** The expected refusal for a reserved keyword in pattern-head position. */
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
 * `assembleDiagnostics` (src/diagnostics/diagnostic.ts:107) orders by
 * (file, line, column) with a stable sort, so the expected order in a
 * multi-diagnostic row is positional and is measured, never guessed.
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
 * `theta/load/` or `theta/parse/` namespace. It is what makes an
 * error-severity diagnostic the refusal mechanism under this route, so one row
 * asserts it directly.
 */
function deniesRegistration(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(
    (d) =>
      d.severity === "error" &&
      (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")),
  );
}

// ===========================================================================
// Runtime harness — parse → production prompt-mode binding → `executeBody`
// (the tests/non-object-receiver-gate.test.ts:221–292 shape). Offline,
// provider-free: no model is dispatched by a query-free prompt body.
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
    slashName: "bug0141",
    sourcePath: "/theta/bug0141.theta",
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
// (r) The registry anchor — DIAG-4's one oracle in this file.
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly message: string;
}

const REGISTRY_PARSE_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";
const MIRROR_PAGE = "docs/reference/diagnostics.md";

function readRepoFile(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
}

const REGISTRY = parseRegistry(readRepoFile(REGISTRY_PARSE_PAGE)) as RegistryRow[];

describe("0141 (r) — the registry rows the refusals render from (DIAG-4)", () => {
  it("r1: the new `capitalised-pattern-head` row is registered `E` with this file's message", () => {
    // DIAG-2 keeps the registry closed, so route 1's half-1 refusal is licensed
    // by this row existing; DIAG-4 makes its *Message* column the normative
    // rendering every group-(a)/(b)/(d)/(h) row compares against.
    const row = REGISTRY.find((r) => r.code === CAP);
    expect(
      row,
      `DIAG-2: ${REGISTRY_PARSE_PAGE} must carry the row for ${CAP} (route memo §"The new row")`,
    ).toBeDefined();
    const found = row as RegistryRow;
    expect(
      found.severity,
      `${CAP} must be an E row: an error-severity parse diagnostic is what \`hasLoadParseError\` (src/extension/production-composition.ts:2220) turns into the registration denial that IS the refusal under this route`,
    ).toBe("E");
    expect(found.phase, `${CAP} is emitted in \`parsePattern\`, a parse-phase leaf`).toBe(
      "parse",
    );
    expect(
      registryMessage(REGISTRY, CAP),
      "DIAG-4: the registry *Message* column is the source of truth for the rendering this file hard-codes",
    ).toBe(capMessage("<name>"));
  });

  it("r2: `docs/reference/diagnostics.md` mirrors the new row", () => {
    // The mirror carries Code / Sev / Phase / Message only (no *Trigger*), and
    // a registry ADDITION is exactly the case where the mirror must move with
    // the spec page (bug 0141 §Fix (c)).
    const mirror = readRepoFile(MIRROR_PAGE);
    const line = mirror.split("\n").find((l) => l.includes(`\`${CAP}\``));
    expect(
      line,
      `${MIRROR_PAGE} must carry the mirror row for ${CAP}; a registry addition moves both pages`,
    ).toBeDefined();
    expect(
      line as string,
      `the mirror row must carry the same *Message* as ${REGISTRY_PARSE_PAGE}`,
    ).toContain(capMessage("<name>"));
    expect(line as string, "the mirror row's Sev column is `E`").toContain("| E |");
  });

  it("r3: `reserved-keyword-as-identifier` is already registered, so half 2 adds no row", () => {
    // Half 2 is implementation conformance, not a registry edit (§Fix (c)):
    // the row's *Trigger* names no position, so a keyword in pattern-head
    // position is already inside it. This row is GREEN before and after.
    const row = REGISTRY.find((r) => r.code === RESERVED);
    expect(row, `${REGISTRY_PARSE_PAGE}:21 carries the row for ${RESERVED}`).toBeDefined();
    expect((row as RegistryRow).severity, `${RESERVED} is an E row`).toBe("E");
    expect(
      registryMessage(REGISTRY, RESERVED),
      "DIAG-4: half 2's rendering is this row's *Message* with `<keyword>` interpolated",
    ).toBe(reservedMessage("<keyword>"));
  });
});

// ===========================================================================
// (a) The bare capitalised pattern is refused, declared or not.
// ===========================================================================
//
// Column derivation, used by every row below. The frontmatter occupies lines
// 1–3, so the first body line is line 4. In `let v = match 3 { P => P }` the
// characters are `l`=1 … `{`=17, ` `=18, `P`=19, and the end column is
// exclusive, so a one-character head spans 19→20.

describe("0141 (a) — a capitalised bare pattern head names no production", () => {
  it("a1: `match 3 { P => P }` is refused, once, on the head token, with the value unchanged", async () => {
    const doc = expectDiagnostics(
      "let v = match 3 { P => P }\nv\n",
      [cap("P", range(4, 19, 4, 20))],
      "docs/spec_topics/expressions.md:174 assigns the binding reading to a LOWERCASE identifier only, and no row of the pattern table (expressions.md:167–172) admits a capitalised head with no following `(` or `{`",
    );
    // The arm-body read of `P` draws no second diagnostic: the route keeps the
    // returned node an identifier pattern, so `collectPatternBindings`
    // (src/parser/theta-document.ts:4925) still seeds the arm scope at :5261
    // and there is no `unknown-identifier` cascade. The whole-list assertion
    // above is what enforces that.
    expect(
      deniesRegistration(doc.diagnostics),
      "the refusal mechanism under this route is the error-severity diagnostic denying registration (src/extension/production-composition.ts:2220), not the AST shape",
    ).toBe(true);
    await expectValue(
      doc,
      3,
      "a1: the runtime is untouched (src/runtime/match-result.ts:177), so the already-parsed arm's value does not move — the refusal is the diagnostic",
    );
  });

  it("a2 [control]: `match 3 { p => p }` still binds, with no diagnostic", async () => {
    const doc = expectDiagnostics(
      "let v = match 3 { p => p }\nv\n",
      [],
      "expressions.md:174 gives the lowercase identifier the binding reading; a case test at the tail arm must leave it alone",
    );
    await expectValue(doc, 3, "a2: the lowercase binder binds the scrutinee");
  });

  it("a3: `schema P { a: integer }` declared changes nothing about the refusal", () => {
    expectDiagnostics(
      "schema P { a: integer }\nlet v = match 3 { P => P }\nv\n",
      [cap("P", range(5, 19, 5, 20))],
      "lexical.md:18 names an object schema as one referent of a capitalised pattern head, but no table row admits the BARE spelling, so the declaration does not license it",
    );
  });

  it("a4: `schema P = integer` (alias) declared changes nothing about the refusal", () => {
    expectDiagnostics(
      "schema P = integer\nlet v = match 3 { P => P }\nv\n",
      [cap("P", range(5, 19, 5, 20))],
      "the alias-schema declaration kind is the second referent lexical.md:18 names; the bare head is refused with it in scope",
    );
  });

  it("a5: `enum P { A, B }` declared changes nothing about the refusal", () => {
    expectDiagnostics(
      "enum P { A, B }\nlet v = match 3 { P => P }\nv\n",
      [cap("P", range(5, 19, 5, 20))],
      "the `enum` referent lexical.md:18 adds has no pattern-table row at all (expressions.md:167–172), so a bare enum-named head is refused rather than resolved",
    );
  });

  it("a6: a `string` scrutinee is refused identically — the head is not a type test", () => {
    expectDiagnostics(
      'schema P { a: integer }\nlet v = match "zz" { P => P }\nv\n',
      [cap("P", range(5, 22, 5, 23))],
      "the refusal is a property of the pattern head, not of the scrutinee's type: a bare capitalised head names no production whatever it is matched against",
    );
  });

  it("a7 [control]: `match 3 { _ => 9 }` stays a wildcard, with no diagnostic", async () => {
    const doc = expectDiagnostics(
      "let v = match 3 { _ => 9 }\nv\n",
      [],
      "`_` is checked first in the tail arm (src/parser/theta-document.ts:4179–4181) and stays the Wildcard row of expressions.md:167–172",
    );
    await expectValue(doc, 9, "a7: the wildcard arm answers");
  });
});

// ===========================================================================
// (b) The catch-all consequence — the arms an author wrote are the subject.
// ===========================================================================

describe("0141 (b) — the capitalised head no longer swallows the later arms silently", () => {
  it("b1: a trailing `_` catch-all behind a capitalised arm draws the refusal", () => {
    expectDiagnostics(
      'let v = match 3 { P => "cap", _ => "wild" }\nv\n',
      [cap("P", range(4, 19, 4, 20))],
      "expressions.md:178 recommends the trailing `_` arm; the capitalised arm above it is refused, so the author is told rather than silently answered",
    );
  });

  it("b2: a literal arm behind a capitalised arm draws the refusal", () => {
    expectDiagnostics(
      'let v = match 3 { P => "cap", 3 => "lit" }\nv\n',
      [cap("P", range(4, 19, 4, 20))],
      "the Literal row (expressions.md:167–172) is unaffected; only the capitalised head is refused",
    );
  });

  it("b3: arm order does not change the refusal — the head is refused where it stands", () => {
    expectDiagnostics(
      'let v = match 3 { 4 => "lit", P => "cap" }\nv\n',
      [cap("P", range(4, 31, 4, 32))],
      "the refusal is a parse-time property of the pattern head, so it fires on a second-position arm too, ranged on that arm's head token",
    );
  });

  it("b4: the enum-variant spelling draws one refusal per capitalised arm, value unchanged", async () => {
    // The author-facing row. Both arm heads are capitalised, so the expected
    // list holds TWO refusals; the order is positional —
    // `assembleDiagnostics` (src/diagnostics/diagnostic.ts:107) sorts by
    // (file, line, column) and `Red` (column 19) precedes `Green` (column 31)
    // on line 6.
    const doc = expectDiagnostics(
      'enum C { Red, Green }\nlet c = C.Green\nlet v = match c { Red => "r", Green => "g" }\nv\n',
      [cap("Red", range(6, 19, 6, 22)), cap("Green", range(6, 31, 6, 36))],
      "lexical.md:18 names `enum` as a referent but expressions.md:167–172 has no variant pattern row, so the variant-named bare heads name no production",
    );
    await expectValue(
      doc,
      "r",
      'b4: the value is left where it is — the arm the author did not select still answers, and the refusal is what surfaces it (the route changes no runtime behaviour)',
    );
  });

  it("b6: a capitalised head against a plain `string` scrutinee draws the refusal", () => {
    expectDiagnostics(
      'enum C { Red, Green }\nlet v = match "Green" { Red => "red-arm", _ => "other" }\nv\n',
      [cap("Red", range(5, 25, 5, 28))],
      "the head is refused independently of the scrutinee, so dropping the enum from the match does not license the bare capitalised spelling",
    );
  });
});

// ===========================================================================
// (c) A reserved keyword in pattern-head position, and the constructor
// controls that must not move.
// ===========================================================================

describe("0141 (c) — a reserved keyword in pattern-head position is refused", () => {
  it("c1: bare `Err` on an `Ok` scrutinee draws exactly one reserved-keyword refusal", async () => {
    // Reserved-before-case (route memo §"Emission detail" item 3): `Err` is
    // PascalCase AND reserved, and the expected list holds ONE code — the
    // reserved one — never both.
    const doc = expectDiagnostics(
      'let v = match Ok(1) { Err => "err-arm", _ => "other" }\nv\n',
      [reserved("Err", range(4, 23, 4, 26))],
      "lexical.md:20 bars all 32 reserved spellings from identifier position and code-registry-parse.md:21's *Trigger* names no position; expressions.md:174 states the `Ok` / `Err` reservation in the disambiguation sentence itself",
    );
    await expectValue(
      doc,
      "err-arm",
      "c1: the runtime is untouched, so the `Err` arm still answers on a success — that value is the reason the refusal matters, not something this route changes",
    );
  });

  it("c2 [control]: `Err(e)` on an `Ok` scrutinee keeps parsing as a constructor pattern", async () => {
    const doc = expectDiagnostics(
      'let v = match Ok(1) { Err(e) => "err-arm", _ => "other" }\nv\n',
      [],
      "the Constructor row (expressions.md:167–172) is gated on the following `(` at src/parser/theta-document.ts:4133, ahead of the tail arm's refusals, so it is untouched",
    );
    await expectValue(doc, "other", "c2: the constructor pattern does not match a success");
  });

  it("c3: bare `Ok` draws exactly one reserved-keyword refusal", () => {
    expectDiagnostics(
      'let v = match Ok(1) { Ok => "ok-arm", _ => "other" }\nv\n',
      [reserved("Ok", range(4, 23, 4, 25))],
      "`Ok` reaches the tail arm as a `keyword` token (src/lexer/lexer.ts's reserved table), and the tail refuses a keyword head before it tests case",
    );
  });

  it("c4 [control]: `Ok(x)` keeps parsing as a constructor pattern", async () => {
    const doc = expectDiagnostics(
      'let v = match Ok(1) { Ok(x) => "ok-arm", _ => "other" }\nv\n',
      [],
      "the `Ok(` gate precedes the tail arm, so the constructor spelling is admitted unchanged",
    );
    await expectValue(doc, "ok-arm", "c4: the constructor pattern matches the success");
  });

  it("c5: bare `Result` draws the reserved-keyword refusal, not the capitalised-head code", () => {
    expectDiagnostics(
      "let v = match 3 { Result => 1, _ => 2 }\nv\n",
      [reserved("Result", range(4, 19, 4, 25))],
      "`Result` is both reserved (lexical.md:20) and PascalCase (lexical.md:15); reserved-before-case makes the refusal exactly one code",
    );
  });

  it("c6: bare `string` — a LOWERCASE reserved word — draws the reserved-keyword refusal", () => {
    expectDiagnostics(
      "let v = match 3 { string => 1, _ => 2 }\nv\n",
      [reserved("string", range(4, 19, 4, 25))],
      "half 2 is not co-extensive with half 1: a lowercase reserved word is invisible to a case test, and lexical.md:20 bars it from identifier position anyway",
    );
  });

  it("c7: bare `let` draws the reserved-keyword refusal", () => {
    expectDiagnostics(
      "let v = match 3 { let => 1, _ => 2 }\nv\n",
      [reserved("let", range(4, 19, 4, 22))],
      "the second lowercase reserved spelling, which pins that the refusal reads the reserved list rather than the first letter",
    );
  });

  it("c8: bare `Ok` on an `Err` scrutinee draws the refusal, value unchanged", async () => {
    const doc = expectDiagnostics(
      'let v = match Err(1) { Ok => "ok-arm", _ => "other" }\nv\n',
      [reserved("Ok", range(4, 24, 4, 26))],
      "the sharpest pair with c9: one parenthesised payload decides whether the `Ok` arm runs on a failure, and lexical.md:20 refuses the bare spelling",
    );
    await expectValue(
      doc,
      "ok-arm",
      "c8: the runtime is untouched, so the bare `Ok` arm still answers on a failure",
    );
  });

  it("c9 [control]: `Ok(x)` on an `Err` scrutinee keeps parsing as a constructor pattern", async () => {
    const doc = expectDiagnostics(
      'let v = match Err(1) { Ok(x) => "ok-arm", _ => "other" }\nv\n',
      [],
      "the constructor control for c8: gated at src/parser/theta-document.ts:4133, admitted, and it correctly does not match a failure",
    );
    await expectValue(doc, "other", "c9: the `Ok(x)` pattern does not match `Err(1)`");
  });
});

// ===========================================================================
// (d) The position's other checkers, and the controls that locate them.
// ===========================================================================

describe("0141 (d) — the refusal is added beside the checkers already at this position", () => {
  it("d1: a shadowing alias-schema declaration adds nothing to the refusal", () => {
    expectDiagnostics(
      'schema P = array<integer>\nlet v = match 3 { P => P.join(",") }\nv\n',
      [cap("P", range(5, 19, 5, 20))],
      "bug 0050's withheld-binder machinery (src/parser/type-layer-checks.ts) is untouched by this route, so the type layer still withholds and the only new element is the head refusal",
    );
  });

  it("d2 [control]: the directly-typed `join` refusal is unchanged", () => {
    expectDiagnostics(
      'let y: array<integer> = [1]\nlet v = y.join(",")\nv\n',
      [
        existing(
          NON_STRING_JOIN,
          "array.join requires a string element type; got array<integer>",
          range(5, 9, 5, 20),
        ),
      ],
      "d1's control: the type-layer gate fires where the type IS resolvable, and this route does not touch it",
    );
  });

  it("d3: a shadowing object-schema declaration adds nothing to the refusal", () => {
    expectDiagnostics(
      "schema P { a: integer }\nlet v = match 3 { P => P.frobnicate() }\nv\n",
      [cap("P", range(5, 19, 5, 20))],
      "no collision in either direction (this is not bug 0136's mechanism): the arm-body read stays withheld and the head refusal is the whole delta",
    );
  });

  it("d4 [control]: the directly-typed unknown-method refusal is unchanged", () => {
    expectDiagnostics(
      "schema P { a: integer }\nfn f(p: P) { p.frobnicate() }\nf(P { a: 1 })\n",
      [
        existing(
          UNKNOWN_METHOD,
          "unknown method 'frobnicate' on type P",
          range(5, 14, 5, 28),
        ),
      ],
      "d3's control: with a resolvable receiver type the method gate fires, and this route leaves it alone",
    );
  });

  it("d5: `mut P` keeps its mut-on-immutable-context AND gains the head refusal, in that order", async () => {
    // The order is positional, not chosen: `assembleDiagnostics`
    // (src/diagnostics/diagnostic.ts:107) sorts by (file, line, column) with a
    // stable sort, and on line 4 the `mut` token starts at column 19 while the
    // head `P` starts at column 23.
    const doc = expectDiagnostics(
      "let v = match 3 { mut P => P }\nv\n",
      [
        existing(
          MUT_IMMUTABLE,
          "'mut' is not permitted in this binding position",
          range(4, 19, 4, 22),
        ),
        cap("P", range(4, 23, 4, 24)),
      ],
      "bindings.md:27 lists a `match` pattern binding among the always-immutable contexts, and that check runs ahead of the head classification (src/parser/theta-document.ts:4083–4093); the head refusal is additive, not a replacement",
    );
    await expectValue(doc, 3, "d5: the value is unchanged by either diagnostic");
  });

  it("d6 [control]: an out-of-scope capitalised read is still an unknown identifier", () => {
    expectDiagnostics(
      "let v = Q\nv\n",
      [existing(UNKNOWN_IDENT, "unknown identifier 'Q'", range(4, 9, 4, 10))],
      "d7's control: outside an arm the same spelling draws the scope diagnostic, which is what makes d7's single-element list meaningful",
    );
  });

  it("d7: an undeclared capitalised head draws the refusal and no scope cascade", () => {
    expectDiagnostics(
      "let v = match 3 { Q => Q }\nv\n",
      [cap("Q", range(4, 19, 4, 20))],
      "the returned node stays an identifier pattern, so `collectPatternBindings` (src/parser/theta-document.ts:4925) still seeds the arm scope and the arm-body read draws no second `unknown-identifier` — exactly one diagnostic, the refusal",
    );
  });

  it("d8: the arm scope still closes at the arm — the refusal adds one element, ordered by position", () => {
    // Order is positional: the head refusal is on line 4, the out-of-arm read
    // on line 5 (src/diagnostics/diagnostic.ts:107 sorts by line).
    expectDiagnostics(
      "let v = match 3 { P => P }\nlet w = P\nw\n",
      [
        cap("P", range(4, 19, 4, 20)),
        existing(UNKNOWN_IDENT, "unknown identifier 'P'", range(5, 9, 5, 10)),
      ],
      "the scope behaviour is untouched: the binder is still confined to the arm, and the refusal is added without disturbing the out-of-arm verdict",
    );
  });

  it("d9: the arm's constructor read is unaffected; the head alone is refused", async () => {
    const doc = expectDiagnostics(
      "schema P { a: integer }\nlet v = match 3 { P => P { a: 7 } }\nv.a\n",
      [cap("P", range(5, 19, 5, 20))],
      "the schema-constructor read inside the arm body is a value-position production this route does not touch; only the pattern head is refused",
    );
    await expectValue(doc, 7, "d9: the constructor in the arm body still evaluates");
  });
});

// ===========================================================================
// (e) The position inventory — the fence against a case rule widening past
// the pattern position.
// ===========================================================================

describe("0141 (e) — the case rule's six binder positions", () => {
  it("e1: an uppercase `let` name keeps its binding-case-mismatch, unchanged", () => {
    expectDiagnostics(
      "let P = 1\nP\n",
      [
        existing(
          BINDING_CASE,
          "binding name must start with a lowercase letter or _",
          range(4, 5, 4, 6),
        ),
      ],
      "lexical.md:16's `let` position is enforced in the lexer's contextual pass; this route adds a parser-leaf refusal and must not disturb it",
    );
  });

  it("e2: an uppercase `fn` parameter keeps binding-case-mismatch (bug 0139, shipped)", () => {
    expectDiagnostics(
      "fn f(P: integer): integer { P }\nf(1)\n",
      [
        existing(
          BINDING_CASE,
          "binding name must start with a lowercase letter or _",
          range(4, 6, 4, 7),
        ),
      ],
      "the `fn` parameter is lexical.md:16's position and bug 0139's subject, closed at the lexer; a pattern-head refusal must not add a second code here",
    );
  });

  it("e3: a plain `for` variable's case is not this route's — no diagnostic", () => {
    expectDiagnostics(
      "for X in [1] { X }\n1\n",
      [],
      "the `for` variable sits outside lexical.md:16's list and no sentence makes its case a disambiguation, so a pattern-head refusal must not reach it",
    );
  });

  it("e4: a `par for` variable's case is not this route's either — no diagnostic", () => {
    expectDiagnostics(
      "par for X in [1] { X }\n1\n",
      [],
      "the `par for` variable is the same position as e3; widening the case rule to it would red this row",
    );
  });

  it("e5: the pattern head IS this route's position", () => {
    expectDiagnostics(
      "let v = match 3 { P => P }\nv\n",
      [cap("P", range(4, 19, 4, 20))],
      "lexical.md:13 makes the pattern position's first letter the PRODUCTION selector rather than a naming convention, which is why its refusal is its own registered row and not `binding-case-mismatch`",
    );
  });

  it("e6 [control]: the object pattern's field shorthand binds a lowercase field name", async () => {
    const doc = expectDiagnostics(
      "schema S { a: integer }\nlet s = S { a: 1 }\nlet v = match s { S { a } => a }\nv\n",
      [],
      "the `{ field }` shorthand (src/parser/theta-document.ts:4163–4166) binds a lowercase name inside the object-pattern arm, which the tail arm's refusals never see",
    );
    await expectValue(doc, 1, "e6: the shorthand binds the field value");
  });
});

// ===========================================================================
// (g) The two lookahead-gated arms — the refusals must not creep upward.
// ===========================================================================

describe("0141 (g) — a `(`/`{` follower only escapes refusal when it names a real production (`Ok(p)`/`Err(p)` or `Ident { … }`)", () => {
  it("g1: `Ok(x)` — the constructor gate is ahead of the refusals", async () => {
    const doc = expectDiagnostics(
      'let v = match Ok(1) { Ok(x) => "ok", _ => "other" }\nv\n',
      [],
      "the Constructor row is gated on the following `(` at src/parser/theta-document.ts:4133; the refusals live only in the tail arm (:4178–4202), so this spelling is untouched",
    );
    await expectValue(doc, "ok", "g1: the constructor pattern still matches and binds");
  });

  it("g2: `S { a: 1 }` — the object gate is ahead of the refusals", async () => {
    const doc = expectDiagnostics(
      'schema S { a: integer }\nlet s = S { a: 1 }\nlet v = match s { S { a: 1 } => "obj", _ => "other" }\nv\n',
      [],
      "the Object/schema row is gated on the following `{` at src/parser/theta-document.ts:4142, so a capitalised head with that follower names a real production and is admitted",
    );
    await expectValue(doc, "obj", "g2: the object pattern still matches");
  });

  it("g3: `Some(1)` — a `(` follower on a NON-`Ok`/`Err` head is refused, because the constructor gate is spelling-restricted", () => {
    // The `(` gate (src/parser/theta-document.ts:4133) is text-restricted to
    // `Ok` / `Err`, so a capitalised head with a `(` follower whose spelling is
    // neither reaches the tail arm and is refused there. This cell pins the
    // registry *Trigger*'s condition as "heads no admitted production" rather
    // than "no following punctuation": the pattern table
    // (docs/spec_topics/expressions.md:167–172) admits exactly two capitalised
    // heads, the `Ok(p)` / `Err(p)` constructor and the `Ident { … }` object
    // form, so `Some(` names neither however it is punctuated. Silencing the
    // refusal for the `(` follower would re-admit the silent mis-parse of
    // docs/bugs/0141-capitalised-bare-match-pattern-binds-identifier.md.
    //
    // The list is measured, not derived: `Some` is consumed as the head, the
    // `(1)` that follows is left for the arm body, and the resulting arm draws
    // `theta/parse/match-arm-type-mismatch` over the whole `match` expression
    // (columns 9–41 on line 4) ahead of the head refusal at columns 19–23,
    // which is the (file, line, column) order `assembleDiagnostics`
    // (src/diagnostics/diagnostic.ts:107) produces.
    expectDiagnostics(
      "let v = match 3 { Some(1) => 1, _ => 2 }\nv\n",
      [
        existing(
          MATCH_ARM_TYPE_MISMATCH,
          "match arm body type does not match the common type of the other arms",
          range(4, 9, 4, 41),
        ),
        cap("Some", range(4, 19, 4, 23)),
      ],
      `${CAP}'s registry *Trigger* (docs/spec_topics/diagnostics/code-registry-parse.md) says the head must head none of the admitted pattern productions — not that it must carry no follower — so a capitalised head followed by \`(\` whose spelling is neither \`Ok\` nor \`Err\` is inside the row, and this whole ordered list is what the emitter draws on it`,
    );
  });
});

// ===========================================================================
// (h) The recursion consequence — nested pattern positions reach the same
// tail arm.
// ===========================================================================

describe("0141 (h) — nested pattern positions are refused by the same tail arm", () => {
  it("h1: an array pattern's capitalised elements draw one refusal each, left to right", () => {
    // `parsePattern` recurses through the array arm
    // (src/parser/theta-document.ts:4104–4116), so each element head reaches
    // the same tail. Order is positional (src/diagnostics/diagnostic.ts:107):
    // `A` at column 25, `B` at column 28.
    expectDiagnostics(
      "let v = match [1, 2] { [A, B] => 1, _ => 2 }\nv\n",
      [cap("A", range(4, 25, 4, 26)), cap("B", range(4, 28, 4, 29))],
      "the refusal is a property of the pattern head wherever `parsePattern` recurses (route memo §\"Emission detail\" item 5), so an array element head is refused exactly once per head",
    );
  });

  it("h2: an object pattern's capitalised field-value head draws one refusal", () => {
    expectDiagnostics(
      'schema S { f: integer }\nlet s = S { f: 1 }\nlet v = match s { S { f: A } => A, _ => 0 }\nv\n',
      [cap("A", range(6, 26, 6, 27))],
      "the field-value position recurses through `parsePattern` (src/parser/theta-document.ts:4159–4161); the enclosing `S {` head is gated and admitted, so exactly one refusal is expected",
    );
  });
});

// ===========================================================================
// (f) The corpus anti-regression sweep — GOV-15's corpus half, re-measured.
// ===========================================================================

describe("0141 (f) — the committed corpus gains neither code", () => {
  it("f1: every tracked `.theta` / `.thetalib` parses without the two refusals", () => {
    const listed = execFileSync("git", ["ls-files", "--", "*.theta", "*.thetalib"], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      encoding: "utf8",
    })
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    // Fail LOUDLY on an empty list (CLAUDE.md): a sweep over nothing reports
    // success while verifying nothing, and this file's GOV-15 half is the whole
    // reason the sweep exists. The gate
    // tests/committed-fixture-parse-gate.test.ts cannot stand in for it — it
    // filters `.theta` only (bug 0132).
    expect(
      listed.length,
      "`git ls-files -- '*.theta' '*.thetalib'` must report the tracked corpus; an empty list means the sweep verified nothing",
    ).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const relative of listed) {
      const bytes = new Uint8Array(
        readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url))),
      );
      const doc = parseDocBytes(bytes, relative);
      for (const d of doc.diagnostics) {
        if (d.code === CAP || d.code === RESERVED) {
          offenders.push(`${relative}: ${d.code}: ${d.message}`);
        }
      }
    }
    expect(
      offenders,
      "source-language-stability.md:25's carve-out covers this addition, but the corpus blast radius must be re-measured rather than assumed: no shipped theta may gain either refusal",
    ).toEqual([]);
  });
});
