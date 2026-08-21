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

// Bug 0221 — a NON-reserved `match` object-pattern head is checked against
// nothing: an undeclared `R { a: 1 }`, an undeclared head nested one level
// down, and a lowercase `q { a: 1 }` each parse clean, register, and select
// their arm on a value of an unrelated declared schema, where the same three
// heads written in the VALUE position each draw
// `theta/parse/unresolved-named-type`
// (docs/bugs/0221-object-pattern-head-name-unchecked-fires-wrong-arm.md).
//
// THE CONTRACT UNDER TEST is the bug's §Fix as settled for this run: the
// `{`-gated object / schema arm inside `parsePattern` (symbol
// `BodyParser.parsePattern`, src/parser/theta-document.ts:4284; the arm gate
// `if (this.isPunct("{"))` at :4355) resolves the head token's NAME against a
// whole-file pattern-head universe and pushes
// `unresolvedNamedTypeDiagnostic(t.text, t.range, this.file)` (builder symbol
// `unresolvedNamedTypeDiagnostic`, :5780) when it resolves to nothing. The
// emission is the EXISTING registered code
// `theta/parse/unresolved-named-type`; no code is minted and
// tests/fixtures/h7a/permitted-codes.json is untouched.
//
// THE UNIVERSE is whole-file and computed from the parser's own token list:
// every identifier following a `schema` / `enum` token, every `import` /
// `export` specifier name, and the builtin names in the module constant
// `BUILTIN_VALUE_NAMES` (src/parser/theta-document.ts:5161), which carries
// `QueryError`. Whole-file resolution is the registered row's own rule
// (docs/spec_topics/diagnostics/code-registry-parse.md:101: "Resolution is
// whole-file over the body's top-level declarations … so a
// frontmatter-to-body forward reference is not itself a failure"), which is
// what group (u)'s forward-reference cell pins.
//
// PRECEDENCE. A `keyword`-kind head keeps bug 0219's landed
// `theta/parse/reserved-keyword-as-identifier` ALONE — that guard
// (`t.kind === "keyword"`, src/parser/theta-document.ts:4356) runs first —
// and only an `ident`-kind head absent from the universe draws this refusal.
// Group (o) is that partition, asserted whole-list so a second code on one
// construct reds.
//
// NO RUNTIME DISPATCH CHANGE (§Fix (c)(4)). `toRuntimePattern`'s object arm
// (src/runtime/statement-executor.ts:1133, object arm :1143–:1146), the
// runtime `Pattern` object variant (src/runtime/match-result.ts:113–:116) and
// the bare-object-pattern arm (src/parser/theta-document.ts:4465) stay
// byte-identical. The refusal is carried by the error-severity diagnostic that
// `hasLoadParseError` (src/extension/production-composition.ts:2220) turns
// into a registration denial, so the wrong-arm rows are witnessed as
// REGISTRATION DENIALS with the wrong arm's value carried in the failure
// payload — never as a changed dispatch, which would be un-greenable under the
// settled route.
//
// THE NODE SHAPE DOES NOT MOVE — still `{ kind: "object", typeName: t.text,
// fields }` (src/parser/theta-document.ts:4402), so a refused head's field
// binders still reach `collectPatternBindings`'s arm-body scope
// (`collectPatternBindings`, :5256, seeded per arm at :5592) and draw no
// `theta/parse/unknown-identifier` cascade. Cell o3 is that observable.
//
// Spec anchors:
//   - docs/spec_topics/lexical.md:18 — inside `match` patterns a lowercase
//     identifier introduces a fresh binding and an uppercase identifier
//     "refers to an existing schema, enum, or constructor in scope"; :13 makes
//     the first-letter rule the mechanism that lets pattern disambiguation work
//     without additional grammar.
//   - docs/spec_topics/expressions.md:171 — the Object/schema pattern row,
//     whose own example head is `QueryError`, which is why the builtin
//     error-model name must resolve at this position (group (u)); :174 — the
//     disambiguation sentence.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:101 — the row this
//     refusal renders from, its object-constructor position, its whole-file
//     resolution rule, and its recorded deferral for an imported symbol.
//
// SCOPE — deliberately NOT closed here, and MEASURED instead, because §Fix
// records each as out of this route's reach:
//   - row a1: a declared head whose declared field set cannot carry the listed
//     fields (`R` declares `{ b }`, the pattern lists `a`) stays silent and
//     still answers `"r-arm"`. §Expected behaviour 3's field-set half is NOT
//     closed by this route — `parsePattern` holds no schema field bodies — so
//     a1 is pinned as this fix's recorded RESIDUAL, not as correct behaviour.
//   - row a5: two declared, field-compatible schemas stay interchangeable
//     (§Fix (c)(5), clean by design: only nominal dispatch separates them, and
//     §Non-goals holds that language decision open).
//   - the enum head and the imported head DEFER (group (u)), per §Non-goals
//     "A referent for a capitalised head that is not a schema".
//
// TIER — unit, offline, provider-free, deterministic, inside the default
// `npm test` gate. Both observables settle in-process: the diagnostic list at
// the `parseThetaDocument` boundary, and the selected arm's value inside one
// `executeBody` over the production prompt-mode binding. No provider, model,
// child process or socket is on either path, so an integration tier would add
// no observable that is not already reachable here.
//
// NO SILENT SKIPPING (CLAUDE.md). Group (r)'s registry lookup throws naming
// the absent row, and group (f)'s corpus sweep fails loudly when
// `git ls-files` reports no corpus file. Every other expectation is a
// hard-coded literal, so the primary reds are the MISSING DIAGNOSTIC — the
// symptom — and never an oracle miss.

// ===========================================================================
// Codes and their normative renderings.
// ===========================================================================

/** The refusal, already registered (code-registry-parse.md:101) — no row minted. */
const UNRESOLVED = "theta/parse/unresolved-named-type";

/** Bug 0219's landed row, which a `keyword`-kind head keeps alone. */
const RESERVED = "theta/parse/reserved-keyword-as-identifier";

/** Bug 0141's row, which a braced head never reaches (its *Trigger* says so). */
const CAP = "theta/parse/capitalised-pattern-head";

/** Codes the arm-partition locks carry, none of them this fix's business. */
const REST_PATTERN = "theta/parse/rest-pattern-not-supported";
const INCREMENT_DECREMENT = "theta/parse/increment-decrement";
const MUT_IMMUTABLE = "theta/parse/mut-on-immutable-context";
const BARE_OBJECT = "theta/parse/bare-object-literal";

function unresolvedMessage(name: string): string {
  return `unresolved named type '${name}'`;
}

function reservedMessage(keyword: string): string {
  return `reserved keyword '${keyword}' cannot be used as an identifier`;
}

// ===========================================================================
// Parse harness — the shipped `parseThetaDocument` through `parseDoc`
// (tests/helpers/e2e-s1.ts:39; the signature is `parseDoc(src, path)`).
// ===========================================================================

/** Every row is a whole prompt-mode theta; frontmatter occupies lines 1–3. */
const FM = "---\nmode: prompt\n---\n";

const FILE = "bug0221.theta";

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

/** The expected refusal for an unresolved object-pattern head. */
function unresolved(name: string, at: SourceRange): DiagShape {
  return {
    severity: "error",
    code: UNRESOLVED,
    file: FILE,
    range: at,
    message: unresolvedMessage(name),
  };
}

/** The expected bug 0219 refusal for a `keyword`-kind head. */
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
 * (src/extension/production-composition.ts:2220) is module-private — `rg -n
 * 'export.*hasLoadParseError' src/` matches nothing — so the predicate is
 * mirrored here clause for clause: error severity, and a code in the
 * `theta/load/` or `theta/parse/` namespace. It is the mechanism that turns
 * this fix's diagnostic into the refusal, so the wrong-arm rows assert it
 * directly (the same mirror, for the same reason, as symbol
 * `deniesRegistration`,
 * tests/reserved-keyword-object-pattern-head-refusal.test.ts:228).
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
// and — end column being exclusive — spans 19 → 19 + HEAD.length. The
// `match d {` rows share the arithmetic: `d` is one character wide, as `3` is.
// ===========================================================================

const HEAD_COLUMN = 19;

/** `let r = match 3 { <pattern> => "x", _ => "y" }`, the bug's group-(B) shape. */
function armBody(pattern: string): string {
  return `let r = match 3 { ${pattern} => "x", _ => "y" }\nr\n`;
}

/** The head's range on a body line, from its spelling alone. */
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

function readRepoFile(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
}

const REGISTRY = parseRegistry(readRepoFile(REGISTRY_PARSE_PAGE)) as RegistryRow[];

function registryLine(code: string): string {
  // Match the row whose FIRST cell is the code, not any row whose prose
  // mentions it: `theta/parse/annotation-type-not-expression`'s Trigger cites
  // `theta/parse/unresolved-named-type`'s closed position list, so a substring
  // search returns the wrong row.
  const line = readRepoFile(REGISTRY_PARSE_PAGE)
    .split("\n")
    .find((l) => l.startsWith(`| \`${code}\` |`));
  if (line === undefined) {
    throw new Error(
      `${REGISTRY_PARSE_PAGE} carries no row for ${code} — bug 0221's oracle for that row has no source`,
    );
  }
  return line;
}

describe("0221 (r) — the registered row the refusal renders from", () => {
  it("r1: `unresolved-named-type` is registered `E`/`parse` with this file's message", () => {
    const row = REGISTRY.find((r) => r.code === UNRESOLVED);
    expect(
      row,
      `${REGISTRY_PARSE_PAGE}:101 must carry the row for ${UNRESOLVED}; §Fix reuses it at a further position and mints nothing`,
    ).toBeDefined();
    const found = row as RegistryRow;
    expect(
      found.severity,
      `${UNRESOLVED} must be an E row: an error-severity parse diagnostic is what \`hasLoadParseError\` (src/extension/production-composition.ts:2220) turns into the registration denial that IS the refusal`,
    ).toBe("E");
    expect(
      found.phase,
      `${UNRESOLVED} is emitted in \`parsePattern\` (src/parser/theta-document.ts:4284), a parse-phase leaf`,
    ).toBe("parse");
    expect(
      registryMessage(REGISTRY, UNRESOLVED),
      "DIAG-4: the registry *Message* column is the source of truth for the rendering every row below hard-codes",
    ).toBe(unresolvedMessage("<name>"));
  });

  it("r2: the row still names the object-constructor position and resolves whole-file", () => {
    // The two sentences the route rests on. The object-constructor position is
    // the VALUE-position sibling whose asymmetry with the pattern head is this
    // bug's subject (rows a4, b5, c3, u3), and the whole-file resolution rule
    // is what makes group (u)'s forward reference legal rather than an
    // accident of statement order.
    const line = registryLine(UNRESOLVED);
    expect(
      line,
      `${UNRESOLVED} must keep the object-constructor position its value-position controls measure`,
    ).toContain("an object-constructor name (`Name { ... }`)");
    expect(
      line,
      `${UNRESOLVED}'s resolution must stay whole-file, which is what cell u9's forward reference relies on`,
    ).toContain("Resolution is whole-file over the body's top-level declarations");
  });

  it("r3: the row records that an imported symbol defers at the constructor position", () => {
    // §Non-goals: an imported head defers rather than gaining a new resolution
    // rule. The registered row states the deferral for the value position in
    // terms, which is the authority group (u)'s import cells carry over.
    expect(
      registryLine(UNRESOLVED),
      `${UNRESOLVED} must keep the imported-symbol deferral sentence`,
    ).toContain("An imported symbol always defers at the constructor position");
  });

  it("r4: bug 0219's and bug 0141's rows keep the texts that bound this one", () => {
    // The boundary §Fix (b) draws between three rows: bug 0219's covers the
    // head's TOKEN KIND, bug 0141's covers a BARE capitalised head, and this
    // report covers a braced head's NAME. Both neighbouring texts are locks.
    expect(
      registryLine(RESERVED),
      `${RESERVED}'s *Trigger* must stay position-free, which is why bug 0219 wired it at the braced head with no registry edit`,
    ).toContain("Reserved keyword used in an identifier position.");
    expect(
      registryLine(CAP),
      `${CAP}'s *Trigger* must keep excluding the braced head in terms, so this fix's inputs escape that row by the row's own text`,
    ).toContain("it is not followed by `{`");
  });
});

// ===========================================================================
// Runtime harness — parse → production prompt-mode binding → `executeBody`
// (the tests/reserved-keyword-object-pattern-head-refusal.test.ts:730–:787
// shape, symbols `producer` / `execute` / `expectValue`). Offline,
// provider-free: a query-free prompt body dispatches no model.
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
    slashName: "bug0221",
    sourcePath: "/theta/bug0221.theta",
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

/**
 * Assert that a wrong-arm row is refused at LOAD — first that it denies
 * registration, carrying the arm it answers in the failure payload, then its
 * whole diagnostic list.
 *
 * The route changes no dispatch (§Fix (c)(4)), so the greenable form of a
 * wrong-arm claim is the registration denial, not a changed value: the value
 * is computed and reported first so the red names the wrong arm the bug
 * describes rather than only a missing diagnostic.
 */
async function expectRefusedWrongArm(
  body: string,
  expected: readonly DiagShape[],
  why: string,
): Promise<void> {
  const doc = theta(body);
  const execution = await execute(doc);
  expect(
    deniesRegistration(doc.diagnostics),
    `${why}\n  the body answers ${JSON.stringify(execution.result.value)} (outcome=${execution.outcome})\n  actual diagnostics: ${render(doc)}`,
  ).toBe(true);
  expect(shapes(doc), `${why}\n  actual diagnostics: ${render(doc)}`).toEqual([...expected]);
}

// ===========================================================================
// (a) The undeclared non-reserved head — the bug's group (A).
// ===========================================================================

describe("0221 (a) — an undeclared non-reserved head is refused at the head's range", () => {
  it("a1 [RESIDUAL, measured]: a DECLARED head whose field set cannot carry the listed fields stays silent and takes the value", async () => {
    // §Expected behaviour 3 asks for this row and this route does NOT close
    // it: the check lands in `parsePattern` (src/parser/theta-document.ts:4284),
    // which holds no schema field bodies, so a resolved head is admitted
    // whatever fields the pattern lists. `R` declares `{ b }`, the pattern
    // lists `a`, and the arm still selects over a `Q`-constructed value. Pinned
    // as this fix's RECORDED RESIDUAL — not as expected-correct behaviour — so
    // a later route that closes the field-set half reds here and reads this
    // comment.
    const doc = expectDiagnostics(
      [
        "schema Q { a: integer }",
        "schema R { b: integer }",
        "let d = Q { a: 1 }",
        'let r = match d { R { a: 1 } => "r-arm", Q { a: 1 } => "q-arm", _ => "other" }',
        "r",
      ].join("\n") + "\n",
      [],
      "the field-set half of §Expected behaviour 3 is out of this route's reach: both heads resolve, so the name check admits the arm",
    );
    await expectValue(
      doc,
      "r-arm",
      "a1: the residual is a wrong-arm answer that survives this fix, because dispatch stays a field-shape test (expressions.md:171)",
    );
  });

  it("a2 [S1 headline]: an UNDECLARED head `R { a: 1 }` is refused, so the wrong arm never reaches a registered theta", async () => {
    // The S1 row: `R` is declared nowhere, the correct `Q { a: 1 }` arm is
    // present below it, and at HEAD the undeclared head takes the value.
    // `R` sits at column 19 of line 6 (`let r = match d { R …`).
    await expectRefusedWrongArm(
      [
        "schema Q { a: integer }",
        "let d = Q { a: 1 }",
        'let r = match d { R { a: 1 } => "r-arm", Q { a: 1 } => "q-arm", _ => "other" }',
        "r",
      ].join("\n") + "\n",
      [unresolved("R", headRange("R", 6))],
      "lexical.md:18 makes an uppercase pattern identifier a REFERENCE to an existing schema, enum or constructor in scope; `R` resolves to nothing, the value position refuses the same spelling (a4), and the refusal must deny registration (src/extension/production-composition.ts:2220)",
    );
  });

  it("a3: `R { }` — an EMPTY field list — is refused identically", async () => {
    // The empty field list is the shape with no field constraint at all: the
    // runtime's object arm matches every object-shaped value, so this row's
    // head is the only thing that could have constrained it.
    await expectRefusedWrongArm(
      [
        "schema Q { a: integer }",
        "let d = Q { a: 1 }",
        'let r = match d { R { } => "r-arm", _ => "other" }',
        "r",
      ].join("\n") + "\n",
      [unresolved("R", headRange("R", 6))],
      "the discriminator is the head's NAME, not the field list: an empty-braced undeclared head must draw the same one code and must not register",
    );
  });

  it("a4 [CONTROL, value position]: `let r = R { a: 1 }` keeps its landed refusal", () => {
    // The asymmetry this bug files against, in its unchanged direction. The
    // value position's range is the whole object expression, measured, where
    // the pattern position's is the head TOKEN — `parsePattern` has the token
    // and `checkObjectExpr` (src/parser/theta-document.ts:7415) has the
    // expression node.
    expectDiagnostics(
      "let r = R { a: 1 }\nr\n",
      [existing(UNRESOLVED, unresolvedMessage("R"), range(4, 9, 4, 19))],
      "the object-constructor position (code-registry-parse.md:101) keeps its code, count and range: this fix adds a call site and edits no existing emission",
    );
  });

  it("a5 [BOUNDARY, measured]: two declared field-compatible schemas stay interchangeable", async () => {
    // §Fix (c)(5), clean by design: both heads resolve, both schemas declare
    // the same field, so only nominal dispatch could separate them — the
    // language decision §Non-goals holds open. A route that reds this cell has
    // made object patterns nominal by accident.
    const doc = expectDiagnostics(
      [
        "schema Q { a: integer }",
        "schema R { a: integer }",
        "let d = R { a: 2 }",
        'let r = match d { Q { a: 2 } => "q-arm", _ => "other" }',
        "r",
      ].join("\n") + "\n",
      [],
      "§Fix (c)(5): a resolved head is admitted, so a field-compatible sibling schema still selects",
    );
    await expectValue(doc, "q-arm", "a5: dispatch stays the field-shape reading of expressions.md:171");
  });
});

// ===========================================================================
// (b) Every recursion depth — the bug's group (B).
// ===========================================================================

describe("0221 (b) — the refusal fires at every depth the pattern grammar recurses", () => {
  it("b1: an array ELEMENT `[Zed { a: 1 }]` is refused at the element's head", () => {
    // §Expected behaviour 2. `[` occupies column 19, so the element head
    // starts one column later.
    expectDiagnostics(
      armBody("[Zed { a: 1 }]"),
      [unresolved("Zed", headRange("Zed", 4, HEAD_COLUMN + 1))],
      "the array-pattern arm recurses through the same `parsePattern` (src/parser/theta-document.ts:4284), so a name check in the object arm fires at every depth",
    );
  });

  it("b2: an object-pattern FIELD VALUE `Q { f: Zed { a: 1 } }` is refused at the inner head", () => {
    // The declared outer head `Q` resolves and stays silent, so the
    // whole-list assertion also pins that the check does not fire on a
    // resolved outer head. Columns on line 5: `Q`=19, `{`=21, `f`=23, `:`=24,
    // inner head=26.
    expectDiagnostics(
      "schema Q { a: integer }\n" + armBody("Q { f: Zed { a: 1 } }"),
      [unresolved("Zed", headRange("Zed", 5, 26))],
      "the field-value position recurses through `parsePattern` too; exactly one code, on the inner unresolved head, with the resolved outer head silent",
    );
  });

  it("b3 [depth wrong-arm]: `[Zed { a: 1 }]` over `[Q { a: 1 }]` is refused before it can answer", async () => {
    // The depth-carrying S1 shape: at HEAD this file loads clean, registers,
    // and answers "zed-arm" on an array of `Q`-constructed values.
    await expectRefusedWrongArm(
      [
        "schema Q { a: integer }",
        "let d = [Q { a: 1 }]",
        'let r = match d { [Zed { a: 1 }] => "zed-arm", _ => "other" }',
        "r",
      ].join("\n") + "\n",
      [unresolved("Zed", headRange("Zed", 6, HEAD_COLUMN + 1))],
      "§Expected behaviour 2 at depth: a nested undeclared head is refused at its own range, which denies registration and makes the depth-carrying wrong-arm answer unreachable",
    );
  });

  it("b4: `Zed { a: 1 }` at the top level of the pattern is refused", () => {
    expectDiagnostics(
      armBody("Zed { a: 1 }"),
      [unresolved("Zed", headRange("Zed"))],
      "bug 0219's residual 2 verbatim: `Zed { a: 1 }` with `Zed` undeclared drew `[]`, while the same spelling in the value position drew this code (b5)",
    );
  });

  it("b5 [CONTROL, value position]: `let r = Zed { a: 1 }` keeps its landed refusal", () => {
    expectDiagnostics(
      "let r = Zed { a: 1 }\nr\n",
      [existing(UNRESOLVED, unresolvedMessage("Zed"), range(4, 9, 4, 21))],
      "the value position's refusal is unchanged in code, count and range",
    );
  });

  it("b6 [CONTROL, nested reserved]: a nested `keyword` head keeps bug 0219's code alone", () => {
    // §Fix (c)(3) precedence, at depth: the token-kind guard
    // (src/parser/theta-document.ts:4356) runs first, so the reserved head
    // draws exactly one code and never also this fix's. The outer head `Q` is
    // declared here so the cell isolates the inner head; cell o2 measures the
    // doc's B6 shape, where the outer head resolves to nothing as well.
    // Columns on line 5: `Q`=19, `{`=21, `f`=23, `:`=24, `Result`=26.
    expectDiagnostics(
      "schema Q { f: integer }\n" + armBody("Q { f: Result { a: 1 } }"),
      [reserved("Result", headRange("Result", 5, 26))],
      "bug 0219's nested refusal keeps its code, count and range: recursion depth was never the discriminator, the head's token kind was",
    );
  });
});

// ===========================================================================
// (c) The lowercase head — the bug's group (C).
// ===========================================================================

describe("0221 (c) — a lowercase object-pattern head is refused, not silently bound", () => {
  it("c1: `p { a: 1 }` is refused at the head's range", () => {
    expectDiagnostics(
      armBody("p { a: 1 }"),
      [unresolved("p", headRange("p"))],
      "lexical.md:18 gives a lowercase pattern identifier the BINDING reading, and the braced head is not read as a binding either — it is a head that resolves to nothing, as the value position already holds (c3)",
    );
  });

  it("c2 [wrong-arm]: `q { a: 1 }` over a `Q`-constructed value is refused before it can answer", async () => {
    await expectRefusedWrongArm(
      [
        "schema Q { a: integer }",
        "let d = Q { a: 1 }",
        'let r = match d { q { a: 1 } => "lower-arm", _ => "other" }',
        "r",
      ].join("\n") + "\n",
      [unresolved("q", headRange("q", 6))],
      "the lowercase head neither binds nor resolves, and it selected its arm on a value it names nothing about; the refusal must deny registration",
    );
  });

  it("c3 [CONTROL, value position]: `let r = p { a: 1 }` keeps its landed refusal", () => {
    expectDiagnostics(
      "let r = p { a: 1 }\nr\n",
      [existing(UNRESOLVED, unresolvedMessage("p"), range(4, 9, 4, 19))],
      "the value position refuses the same lowercase spelling as a constructor name; the pattern position is the asymmetry this bug files",
    );
  });

  it("c4 [shadow]: an in-scope `let p = 7` does not put `p` in the head universe", async () => {
    // The universe is declaration-shaped — `schema` / `enum` names, `import` /
    // `export` specifier names, and `BUILTIN_VALUE_NAMES`
    // (src/parser/theta-document.ts:5161). A `let` binding is a VALUE binding
    // and heads no object pattern, so the shadow does not resolve the head:
    // the row stays in class, which is what §Reproduction C4 measures (the
    // head is neither consulted nor shadowed). `p` sits at column 19 of line 7.
    await expectRefusedWrongArm(
      [
        "schema Q { a: integer }",
        "let d = Q { a: 1 }",
        "let p = 7",
        'let r = match d { p { a: 1 } => "lower-arm", _ => "other" }',
        "r",
      ].join("\n") + "\n",
      [unresolved("p", headRange("p", 7))],
      "an in-scope value binding is not a brace-constructible declaration, so it resolves no pattern head and the row must not register",
    );
  });
});

// ===========================================================================
// (u) The pattern-head universe — what resolves, and what defers.
// ===========================================================================

describe("0221 (u) — the whole-file pattern-head universe", () => {
  it("u1: `QueryError` resolves at the head, because expressions.md:171's own example is that head", () => {
    // The builtin error-model name is in `BUILTIN_VALUE_NAMES`
    // (src/parser/theta-document.ts:5161, which lists `QueryError`), and the
    // Object/schema pattern row of docs/spec_topics/expressions.md:171 uses
    // `QueryError { kind: "validation", cause: "schema_validation", attempts }`
    // as its example. A route that refused this head would refuse the spec's
    // own example.
    expectDiagnostics(
      armBody('QueryError { kind: "validation" }'),
      [],
      "the head universe carries `BUILTIN_VALUE_NAMES`, so the error-model names an author may reference resolve",
    );
  });

  it("u2 [corpus shape]: `Err(QueryError { kind: … })` — the shape three committed examples carry — stays silent", () => {
    // docs/examples/handle-error.theta:14,
    // docs/examples/fan-out-reviews.theta:31 and
    // docs/examples/configure-tool-loop.theta:10 each carry exactly this
    // nesting. The bug's §Reproduction (D) claim that the corpus carries NO
    // object-pattern arm is wrong (group (f) re-derives the sweep), so this
    // cell is the corpus's own shape asserted directly.
    expectDiagnostics(
      armBody('Err(QueryError { kind: "validation" })'),
      [],
      "the `Err(` constructor arm recurses into `parsePattern`, so the committed examples' nested `QueryError` head must resolve",
    );
  });

  it("u3 [asymmetry, both directions]: `QueryError` in VALUE position keeps drawing the code", () => {
    // Measured and deliberate: the pattern position is MORE permissive than
    // the value position for a builtin error-model name, because a pattern
    // head REFERENCES and a constructor CONSTRUCTS — the value position needs
    // brace-constructible field bodies (code-registry-parse.md:101), which the
    // builtin name does not supply to the importer's parse.
    expectDiagnostics(
      'let e = QueryError { kind: "validation" }\ne\n',
      [existing(UNRESOLVED, unresolvedMessage("QueryError"), range(4, 9, 4, 42))],
      "the value position's verdict on `QueryError` is untouched by this fix; u1 and u3 pin the asymmetry in both directions",
    );
  });

  it("u4: an `enum` name at the head DEFERS", () => {
    // §Non-goals "A referent for a capitalised head that is not a schema": an
    // `enum` head is not refused here and gains no resolution rule. The
    // universe admits every identifier following an `enum` token, so the head
    // is silent rather than judged.
    expectDiagnostics(
      "enum Color { Red, Green }\n" + armBody("Color { a: 1 }"),
      [],
      "§Non-goals defers the enum head rather than refusing it or resolving it to a field set",
    );
  });

  it("u5 [asymmetry, both directions]: the same `enum` name in VALUE position keeps drawing the code", () => {
    // The registered row states the value-position rule in terms: "a name
    // declared here as an `enum` … is not constructible and fires this code"
    // (code-registry-parse.md:101). Pinning both directions is what makes u4 a
    // deferral rather than an oversight.
    expectDiagnostics(
      "enum Color { Red, Green }\nlet r = Color { a: 1 }\nr\n",
      [existing(UNRESOLVED, unresolvedMessage("Color"), range(5, 9, 5, 23))],
      "an enum is not brace-constructible at the value position, and this fix moves no value-position verdict",
    );
  });

  it("u6: an IMPORTED specifier name at the head DEFERS", () => {
    // The registered row's own deferral: "An imported symbol always defers at
    // the constructor position — the importer's parse holds neither its field
    // bodies nor its kind" (code-registry-parse.md:101). §Non-goals expects
    // the same deferral at the pattern head.
    expectDiagnostics(
      'import { helper } from "./lib.thetalib"\n' + armBody("helper { a: 1 }"),
      [],
      "an import specifier name is in the head universe, so the head defers exactly as it does at the constructor position",
    );
  });

  it("u7: a capitalised imported specifier name at the head DEFERS", () => {
    expectDiagnostics(
      'import { Helper } from "./lib.thetalib"\n' + armBody("Helper { a: 1 }"),
      [],
      "the deferral is the specifier's, not the spelling's: capitalisation does not turn an imported head into a refusal",
    );
  });

  it("u8: an EXPORT specifier name at the head DEFERS", () => {
    expectDiagnostics(
      'export { helper } from "./lib.thetalib"\n' + armBody("helper { a: 1 }"),
      [],
      "the universe admits `import` and `export` specifier names alike; neither statement kind's names may become a pattern-head refusal",
    );
  });

  it("u9 [forward reference]: a `schema` declared AFTER the match still resolves the head", () => {
    // The registered row's resolution rule is whole-file (r2), so the
    // universe is computed over the whole token list rather than the
    // statements already parsed. A route that resolved against a
    // partially-built table would red here.
    expectDiagnostics(
      'let r = match 3 { R { a: 1 } => "x", _ => "y" }\nschema R { a: integer }\nr\n',
      [],
      "code-registry-parse.md:101: resolution is whole-file, so a declaration below the `match` resolves the head above it",
    );
  });

  it("u10: a declared `schema` head resolves and keeps its value", async () => {
    const doc = expectDiagnostics(
      [
        "schema Q { a: integer }",
        "let d = Q { a: 1 }",
        'let r = match d { Q { a: 1 } => "q-arm", _ => "other" }',
        "r",
      ].join("\n") + "\n",
      [],
      "§Expected behaviour 4: the admitted production of expressions.md:171 stays clean",
    );
    await expectValue(doc, "q-arm", "u10: the legal head's dispatch is untouched");
  });
});

// ===========================================================================
// (o) One diagnostic per construct (§Fix (c)(3)).
// ===========================================================================

describe("0221 (o) — one diagnostic per construct, and no cascade", () => {
  it("o1: a reserved head `Result { a: 1 }` keeps bug 0219's code ALONE", () => {
    // Precedence: the `keyword`-kind guard (src/parser/theta-document.ts:4356)
    // runs first and this fix's check reads an `ident`-kind head only, so a
    // reserved spelling never draws two codes for one head.
    expectDiagnostics(
      armBody("Result { a: 1 }"),
      [reserved("Result", headRange("Result"))],
      "§Fix (c)(3): a reserved head keeps drawing bug 0219's code alone — the token-kind guard runs first",
    );
  });

  it("o2: two heads of different kinds in one pattern each draw their own one code", () => {
    // The bug's §Reproduction B6 shape verbatim: `Q` is declared nowhere, so
    // the outer `ident` head draws this fix's code and the inner `keyword`
    // head draws bug 0219's — one per construct, position-sorted by
    // `assembleDiagnostics` (src/diagnostics/diagnostic.ts:107). Columns on
    // line 4: `Q`=19, `{`=21, `f`=23, `:`=24, `Result`=26.
    expectDiagnostics(
      armBody("Q { f: Result { a: 1 } }"),
      [
        unresolved("Q", headRange("Q")),
        reserved("Result", headRange("Result", 4, 26)),
      ],
      "two heads, two constructs, two codes: neither guard suppresses the other, and neither head draws both",
    );
  });

  it("o3: a refused head's FIELD BINDERS draw no `unknown-identifier` cascade", () => {
    // §Fix (c)(3)'s reason for keeping the node: the returned
    // `{ kind: "object", typeName: t.text, fields }`
    // (src/parser/theta-document.ts:4402) is what puts the field binders in
    // the arm-body scope through `collectPatternBindings` (:5256, seeded per
    // arm at :5592). A route that dropped the node would add a
    // `theta/parse/unknown-identifier` per arm-body read of `v`, which this
    // whole-list assertion catches.
    expectDiagnostics(
      "let r = match 3 { Zed { f: v } => v, _ => 0 }\nr\n",
      [unresolved("Zed", headRange("Zed"))],
      "exactly one code, at the head's range: the refused head keeps its node so its field binders stay in scope",
    );
  });

  it("o4: two undeclared heads at different depths each draw their own diagnostic", () => {
    // Columns on line 4: `Zed`=19, `{`=23, `f`=25, `:`=26, `Wox`=28.
    expectDiagnostics(
      armBody("Zed { f: Wox { a: 1 } }"),
      [
        unresolved("Zed", headRange("Zed")),
        unresolved("Wox", headRange("Wox", 4, 28)),
      ],
      "§Expected behaviour 2: a route that emitted once per pattern rather than once per head would stay green everywhere else",
    );
  });

  it("o5: a bare capitalised head keeps bug 0141's code, never this fix's", () => {
    // §Fix (c)(2) lock: the tail arm (bug 0141's refusal) is reached only when
    // neither lookahead-gated arm fired, so a head with no `{` after it is
    // that row's business and not this one's.
    expectDiagnostics(
      armBody("Zed"),
      [
        {
          severity: "error",
          code: CAP,
          file: FILE,
          range: headRange("Zed"),
          message: `capitalised pattern head 'Zed' names no pattern production`,
        },
      ],
      "§Fix (c)(2): bug 0141's 45-cell witness is a lock; a braced-head check must not reach the bare head",
    );
  });
});

// ===========================================================================
// (n) `parsePattern`'s arm partition — re-measured locks (§Fix (c)(1), (c)(8)).
// ===========================================================================

describe("0221 (n) — the arm partition around the object arm does not move", () => {
  it("n1: the bare object pattern `{ a: 1 }` stays silent", () => {
    // No head token at all: the bare-object arm
    // (src/parser/theta-document.ts:4465, returning `typeName: null`) is a
    // different production, and §Fix (c)(4) keeps it byte-untouched.
    expectDiagnostics(
      armBody("{ a: 1 }"),
      [],
      "§Expected behaviour 4: a headless object pattern carries no name to resolve",
    );
  });

  it("n2: the field shorthand `{ attempts }` stays silent", () => {
    // The colon-less field sugars to a same-named identifier pattern per
    // docs/spec_topics/expressions.md:171, which is a binding, not a head.
    expectDiagnostics(
      armBody("{ attempts }"),
      [],
      "§Expected behaviour 4: the field shorthand is a binder and is untouched",
    );
  });

  it("n3: `{ a, ...o }` keeps exactly the rest-pattern refusal", () => {
    // §Non-goals: rest patterns inside an object pattern stay
    // `theta/parse/rest-pattern-not-supported`'s business. Columns: `{`=19,
    // `a`=21, `,`=22, `...`=24–26 with the diagnostic on column 24.
    expectDiagnostics(
      armBody("{ a, ...o }"),
      [
        existing(
          REST_PATTERN,
          "rest patterns are not supported in theta 1.0",
          range(4, 24, 4, 25),
        ),
      ],
      "the rest-pattern refusal keeps its code, count and range: the name check is added before the field walk and changes no field-walk byte",
    );
  });

  it.each([
    ["mut", [existing(MUT_IMMUTABLE, "'mut' is not permitted in this binding position", range(4, 19, 4, 22))]],
    ["true", [existing(BARE_OBJECT, "bare object literal not permitted in this position; name the schema (Schema { ... })", range(4, 24, 4, 32))]],
    ["false", [existing(BARE_OBJECT, "bare object literal not permitted in this position; name the schema (Schema { ... })", range(4, 25, 4, 33))]],
    ["null", [existing(BARE_OBJECT, "bare object literal not permitted in this position; name the schema (Schema { ... })", range(4, 24, 4, 32))]],
  ] as const)(
    "n4: `%s { a: 1 }` keeps its measured list — an arm above the object arm claims it",
    (word, expected) => {
      expectDiagnostics(
        armBody(`${word} { a: 1 }`),
        expected,
        `'${word}' never reaches the \`{\`-gated object arm (src/parser/theta-document.ts:4355) — \`mut\` is claimed by parsePattern's mut guard and the three literals by the literal arms above it — so §Fix (c)(3)'s one-code-per-construct forbids adding this fix's code here`,
      );
    },
  );

  it("n5: `--y` in pattern position keeps its measured code list", () => {
    // §Fix (c)(8): `parsePattern`'s one-token recovery tail is byte-identical
    // under this fix, so bug 0123's subject keeps exactly what it draws at
    // this tree. Pinned as MEASURED, not as bug 0123's expected behaviour —
    // that report is open and owns the verdict. Body line 5, `--` at columns
    // 19–20.
    expectDiagnostics(
      "let y = 1\n" + armBody("--y"),
      [
        existing(
          INCREMENT_DECREMENT,
          "'--' operator is not supported",
          range(5, 19, 5, 21),
        ),
      ],
      "§Fix (c)(8): whichever of bugs 0123 and 0221 lands second re-measures the other's rows; this is bug 0221's re-measurement of bug 0123's input",
    );
  });
});

// ===========================================================================
// (f) The corpus sweep — §Fix (c)(7)'s GOV-15 half, RE-DERIVED because the
// bug's §Reproduction (D) claim is wrong.
// ===========================================================================

describe("0221 (f) — the committed corpus gains no refusal", () => {
  it("f1: three committed examples DO carry object-pattern arms, and none of the corpus gains the code", () => {
    // §Reproduction (D) states the corpus carries ZERO object-pattern arms,
    // derived with the regex `\{[^}]*\} *=>`. That regex misses the committed
    // shape, where the arm's `}` is followed by `)` before the arrow:
    // `Err(QueryError { kind: "…" }) =>`. Re-derived here with a regex that
    // admits the closing parenthesis, the corpus carries THREE such files, and
    // every one of them heads its nested object pattern with `QueryError` —
    // which is why the head universe must carry `BUILTIN_VALUE_NAMES` (cells
    // u1, u2).
    const listed = execFileSync("git", ["ls-files", "--", "*.theta", "*.thetalib"], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      encoding: "utf8",
    })
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    // Fail LOUDLY on an empty list (CLAUDE.md): a sweep over nothing reports
    // success while verifying nothing, and this file's GOV-15 half is the
    // whole reason the sweep exists. tests/committed-fixture-parse-gate.test.ts
    // cannot stand in for it — it filters `.theta` only (bug 0132).
    expect(
      listed.length,
      "`git ls-files -- '*.theta' '*.thetalib'` must report the tracked corpus; an empty list means the sweep verified nothing",
    ).toBeGreaterThan(0);

    const objectPatternArm = /\{[^}]*\}[\s)]*=>/;
    const withArms: string[] = [];
    const offenders: string[] = [];
    for (const relative of listed) {
      const bytes = new Uint8Array(
        readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url))),
      );
      if (objectPatternArm.test(new TextDecoder().decode(bytes))) {
        withArms.push(relative);
      }
      const doc = parseDocBytes(bytes, relative);
      for (const d of doc.diagnostics) {
        if (d.code === UNRESOLVED) {
          offenders.push(`${relative}: ${d.code}: ${d.message}`);
        }
      }
    }

    expect(
      withArms,
      "the re-derived sweep must find the three committed `Err(QueryError { … }) =>` arms; a shorter list means the regex stopped catching the shape §Reproduction (D)'s regex missed",
    ).toEqual([
      "docs/examples/configure-tool-loop.theta",
      "docs/examples/fan-out-reviews.theta",
      "docs/examples/handle-error.theta",
    ]);
    expect(
      offenders,
      "source-language-stability.md:25's carve-out covers this addition, but the corpus blast radius is re-measured rather than assumed: no shipped theta may gain the refusal",
    ).toEqual([]);
  });
});
