import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc, parseDocBytes } from "./helpers/e2e-s1";

// Bug 0123 — a `++` / `--` in `match` PATTERN position never draws the
// registered `theta/parse/increment-decrement`
// (docs/bugs/0123-match-pattern-decrement-draws-neighbouring-codes.md).
// `parsePattern`'s tail recovery (src/parser/theta-document.ts:4241–4243:
// "Unrecognised: consume one token and treat as a wildcard to keep progress.")
// swallows the operator token as an indistinguishable wildcard, so:
//   - `match x { --y => 1, _ => 2 }` is refused under
//     `theta/parse/statement-in-arm-body` PLUS a cascading
//     `theta/parse/match-arm-type-mismatch` over a null-bodied phantom arm the
//     parser itself invented (3 arms from 2), and
//   - `-- => 1`, `[--y]` and `{ a: --y }` load with ZERO diagnostics while
//     silently changing what the pattern matches.
// Bug 0084 wired `checkIncrementDecrement` (src/parser/bindings.ts:179–192) at
// two EXPRESSION-walk hooks — the `parseUnary` prefix arm
// (src/parser/theta-document.ts:3574) and the `parsePostfix` suffix-loop arm
// (:3695), both guarded by `incrementDecrementOp()` (:3559) — and a `match`
// pattern is parsed by neither.
//
// THE CONTRACT UNDER TEST (settled for this run; §Expected behaviour (1)
// resolves to READING A, and §Fix takes ROUTE (a)):
//
//   1. A pattern-position `++` / `--` IS inside the registered row's *Trigger*
//      (docs/spec_topics/diagnostics/code-registry-parse.md:34, verbatim
//      "`++` or `--` operator used." — no position qualifier; the table states
//      position when position matters, cf. `:30`
//      `theta/parse/assignment-as-expression` "Assignment used in expression
//      position" and `:32` `theta/parse/mut-on-immutable-context`, which
//      already enumerates "`match` pattern binding" and is already emitted by
//      `parsePattern` itself, src/parser/theta-document.ts:4083–4094).
//      Non-emission here is therefore the defect.
//   2. `parsePattern` recognises a `punct` whose text is `++` / `--` BEFORE the
//      fall-through — the shape `tryConsumeRestPattern`
//      (src/parser/theta-document.ts:4023) already uses for an out-of-grammar
//      pattern form — and emits the registered code through the EXISTING
//      `checkIncrementDecrement`, UNCHANGED: registry *Message*
//      `'<op>' operator is not supported`, registry *Hint*
//      "Use `count += 1` / `count -= 1`." verbatim, range = the operator token.
//      NO registry edit, NO *Hint* edit, NO *Trigger* edit, no spec/doc edit at
//      all — group (r) is the guard that reds if one is made.
//   3. Route (a) open question 1 is answered thus: after emitting, the operator
//      token is CONSUMED, and then if the next token CAN BEGIN A PATTERN (kind
//      `number` / `string` / `ident` / `keyword`, or `punct` `[` or `{`) the
//      OPERAND is parsed as the pattern by recursing into `parsePattern`;
//      otherwise a wildcard is returned. That keeps pattern arities honest
//      (`[--y]` stays ONE slot, `{ a: --y }` stays ONE field), kills the
//      phantom-arm cascade (arms.length equals the source arm count), preserves
//      bug 0141's capitalised-head refusal ON THE OPERAND (group (i)), and
//      never leaves a leftover token for `parseMatch` to misread.
//
// EVERY CELL asserts the WHOLE ORDERED diagnostic list (code + range + message
// + hint) and the BUILT PATTERN / ARM SHAPE, and every cell that parses a
// `match` asserts `arms.length` — the phantom-arm observable, which is what
// reds if a fix emits the right code but leaves the recovery's leftovers behind.
//
// NON-GOALS pinned as UNCHANGED observables (§Non-goals), not fixed here:
// group (h) — the single-`-` spelling (`-y`), and the genuine bare-statement
// arm body (`1 => let z = 2`) whose two codes come from the `nullExpr`
// substitution (src/parser/theta-document.ts:3922–3924), which this route does
// not touch. Negative-literal patterns (`-1`) and the general leniency of the
// fall-through for any other unrecognised token stay out of scope.
//
// TIER — unit, offline, provider-free, deterministic, in the default `npm test`
// suite. Both observables settle inside one `parseDoc`
// (tests/helpers/e2e-s1.ts:39) call over the real `parseThetaDocument`: the
// diagnostic list and the built AST. Nothing on this path crosses a provider, a
// model, a child process or the network, so neither an integration nor a live
// tier reaches an observable this tier cannot. §Witness says the same
// ("Witness — offline, provider-free").
//
// NO SILENT SKIPPING (CLAUDE.md): the registry oracles throw naming the absent
// row / cell, the arm-shape helper fails loudly when a fixture did not parse to
// a `match`, and group (j)'s corpus sweep fails loudly on an empty
// `git ls-files` result. Every diagnostic expectation is a literal, so the
// primary reds are the MISSING `theta/parse/increment-decrement` and the WRONG
// ARM COUNT — the symptoms — never an oracle lookup.

// ===========================================================================
// Registry oracles (DIAG-4: docs/spec_topics/diagnostics/diagnostic-shape.md
// makes the *Message* column normative, so the rendering is sourced from the
// live row exactly as bug 0084's witness does through
// `parseRegistry` / `registryMessage`).
// ===========================================================================

const REGISTRY_PARSE_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

function readRepoFile(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
}

const REGISTRY_TEXT = readRepoFile(REGISTRY_PARSE_PAGE);

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(REGISTRY_TEXT) as RegistryRow[];

/** The row under adjudication (code-registry-parse.md:34). */
const INC_DEC = "theta/parse/increment-decrement";
/** Bug 0141's row (code-registry-parse.md, added at 0.146.0). */
const CAP_HEAD = "theta/parse/capitalised-pattern-head";
/** The two codes the `--y` spelling draws INSTEAD of `INC_DEC` today. */
const ARM_TYPE_MISMATCH = "theta/parse/match-arm-type-mismatch";
const STATEMENT_IN_ARM_BODY = "theta/parse/statement-in-arm-body";
/** The code the `Ok(--y)` spelling draws today, on the operand. */
const UNKNOWN_IDENT = "theta/parse/unknown-identifier";

/**
 * A registered code's normative *Message* template. Throws naming the registry
 * page when the row is absent, so registry drift can never degrade an assertion
 * below into a comparison against `undefined`.
 */
function registered(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: ${REGISTRY_PARSE_PAGE} carries no Message row for ${code} — the DIAG-4 column is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}

/**
 * The row's *Hint* cell, read out of the live table. `parseRegistry` structures
 * five columns and drops *Hint*, and route (a) emits this row's Hint VERBATIM
 * (no Hint edit), so the cell is read rather than pinned as prose. Cell order
 * is the table header: Code | Sev | Phase | Trigger | Spec rule | Hint |
 * Message.
 */
const HINT_CELL_INDEX = 5;

function registryHint(code: string): string {
  for (const line of REGISTRY_TEXT.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed
      .replace(/^\|/, "")
      .replace(/\|\s*$/, "")
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim().replace(/\\\|/g, "|"));
    if (cells[0] !== `\`${code}\``) continue;
    const hint = cells[HINT_CELL_INDEX];
    if (hint === undefined || hint === "" || hint === "—") {
      throw new Error(
        `harness: the ${code} row at ${REGISTRY_PARSE_PAGE} carries no Hint cell (cell ${HINT_CELL_INDEX} is ${JSON.stringify(hint)}) — route (a) emits this Hint verbatim, so an empty cell is a harness failure, never a skip`,
      );
    }
    return hint;
  }
  throw new Error(
    `harness: ${REGISTRY_PARSE_PAGE} carries no row for ${code} — this file's Hint oracle is stale`,
  );
}

/** The registered Message with `<op>` rendered as the source token verbatim. */
function opMessage(op: "++" | "--"): string {
  const rendered = registered(INC_DEC).replaceAll("<op>", op);
  expect(
    rendered,
    `${INC_DEC}: an unsubstituted <…> placeholder remains — the registry row's Message template changed shape and this file's substitution is stale`,
  ).not.toMatch(/<[a-z]+>/);
  return rendered;
}

/** Bug 0141's Message with `<name>` rendered as the source spelling. */
function capMessage(name: string): string {
  return registered(CAP_HEAD).replaceAll("<name>", name);
}

// ===========================================================================
// Parse harness. Every fixture is a whole prompt-mode theta over the shared
// offline driver `parseDoc` (tests/helpers/e2e-s1.ts:39).
//
// The prelude is FIXED so every column below is derived once: frontmatter
// occupies source lines 1–3, `let mut c = 1` is line 4, `let x = 1` is line 5,
// the quoted `match`-bearing line is ALWAYS source line 6, and the tail
// expression is line 7. Every `6:<col>` in this file is therefore a column in
// the quoted line.
// ===========================================================================

const FILE = "bug0123.theta";

/** Frontmatter (lines 1–3) plus the two binding preludes (lines 4–5). */
const PRELUDE = "---\nmode: prompt\n---\nlet mut c = 1\nlet x = 1\n";

function theta(line6: string, tail = "r"): ThetaDocument {
  return parseDoc(`${PRELUDE}${line6}\n${tail}\n`, FILE);
}

/** A 1-indexed, end-EXCLUSIVE-column source range on line 6. */
function at(startColumn: number, endColumn: number): SourceRange {
  return {
    start: { line: 6, column: startColumn },
    end: { line: 6, column: endColumn },
  };
}

/** A range spanning the whole `match` expression (the mismatch code's site). */
function span(startColumn: number, endColumn: number): SourceRange {
  return at(startColumn, endColumn);
}

/**
 * The five normative diagnostic fields plus `hint`. `hint` is asserted because
 * route (a) reuses `checkIncrementDecrement` UNCHANGED, so the registered Hint
 * reaching the author is half of what this fix delivers — and its absence on
 * the two neighbouring codes is measured, not assumed.
 */
interface DiagShape {
  readonly severity: string;
  readonly code: string;
  readonly file: string | undefined;
  readonly range: SourceRange | undefined;
  readonly message: string;
  readonly hint: string | undefined;
}

function shapes(doc: ThetaDocument): DiagShape[] {
  return doc.diagnostics.map((d: Diagnostic) => ({
    severity: d.severity,
    code: d.code,
    file: d.file,
    range: d.range,
    message: d.message,
    hint: d.hint,
  }));
}

/** The expected `theta/parse/increment-decrement` at `range`. */
function incDec(op: "++" | "--", range: SourceRange): DiagShape {
  return {
    severity: "error",
    code: INC_DEC,
    file: FILE,
    range,
    message: opMessage(op),
    hint: registryHint(INC_DEC),
  };
}

/** The expected bug-0141 capitalised-pattern-head refusal at `range`. */
function capHead(name: string, range: SourceRange): DiagShape {
  return {
    severity: "error",
    code: CAP_HEAD,
    file: FILE,
    range,
    message: capMessage(name),
    hint: undefined,
  };
}

/** An expected diagnostic from a code this fix does not move. */
function existing(code: string, message: string, range: SourceRange): DiagShape {
  return { severity: "error", code, file: FILE, range, message, hint: undefined };
}

const MISMATCH_MESSAGE = "match arm body type does not match the common type of the other arms";
const STATEMENT_MESSAGE =
  "match arm body must be an expression; wrap statements in a block expression { ... }";

/** Failure payload: every diagnostic rendered `severity code @l:c-l:c: message [hint]`. */
function render(doc: ThetaDocument): string {
  return JSON.stringify(
    doc.diagnostics.map((d: Diagnostic) => {
      const r = d.range;
      const where =
        r === undefined
          ? "-"
          : `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
      return `${d.severity} ${d.code} @${where}: ${d.message} [hint=${d.hint ?? "-"}]`;
    }),
  );
}

// --- Arm / pattern shape ----------------------------------------------------

interface ArmShape {
  readonly pattern: unknown;
  readonly body: unknown;
}

/** Deep-strip every `range` key so a shape literal stays readable. */
function stripped(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (key, v) => (key === "range" ? undefined : v))) as unknown;
}

/**
 * The arms of the `match` that is the initialiser of the fixture's last `let`.
 *
 * The precondition fails LOUDLY: a fixture that did not parse to a `match` at
 * all would otherwise let every shape assertion below pass vacuously, which is
 * exactly the silent-skip failure mode CLAUDE.md forbids.
 */
function armsOf(doc: ThetaDocument, why: string): readonly ArmShape[] {
  const statements = (doc.body?.statements ?? []) as readonly unknown[];
  const lets = statements.filter(
    (s): s is { readonly kind: "let"; readonly init?: unknown } =>
      (s as { readonly kind?: string }).kind === "let",
  );
  const last = lets[lets.length - 1];
  expect(
    last,
    `PRECONDITION (${why}): the fixture must parse to at least one \`let\` statement. Diagnostics: ${render(doc)}`,
  ).toBeDefined();
  const init = (last as { readonly init?: { readonly kind?: string; readonly arms?: unknown } })
    .init;
  expect(
    init?.kind,
    `PRECONDITION (${why}): the last \`let\`'s initialiser must be a \`match\` expression; got ${JSON.stringify(init?.kind)}. Diagnostics: ${render(doc)}`,
  ).toBe("match");
  const arms = init?.arms as readonly ArmShape[] | undefined;
  expect(
    Array.isArray(arms),
    `PRECONDITION (${why}): the \`match\` must expose an \`arms\` array. Diagnostics: ${render(doc)}`,
  ).toBe(true);
  return arms as readonly ArmShape[];
}

/** The stripped pattern of every arm, in arm order. */
function patternsOf(doc: ThetaDocument, why: string): unknown[] {
  return armsOf(doc, why).map((arm) => stripped(arm.pattern));
}

/** An integer number-literal body node, as the AST carries it post-0.146.0. */
function numberBody(text: string): unknown {
  return { kind: "number", text, numericType: "integer" };
}

const WILDCARD = { kind: "wildcard" } as const;

function identPattern(name: string): unknown {
  return { kind: "identifier", name };
}

/**
 * Assert a fixture's WHOLE ordered diagnostic list, its arm COUNT and its arm
 * PATTERNS in one place.
 *
 * Order is positional, never guessed: `assembleDiagnostics`
 * (src/diagnostics/diagnostic.ts:107) sorts by (file, line, column) with a
 * stable sort, so a multi-diagnostic row's expected order is its column order.
 *
 * The arm count is the phantom-arm observable
 * (docs/bugs/0123-…md §Witness: "the arm-count observable (`arms.length`
 * against the source's arm count, which is what reds if a route emits the right
 * code but leaves the phantom arm)").
 */
function expectCell(options: {
  readonly line: string;
  readonly tail?: string;
  readonly diagnostics: readonly DiagShape[];
  readonly armCount: number;
  readonly patterns: readonly unknown[];
  readonly bodies?: readonly unknown[];
  readonly why: string;
}): ThetaDocument {
  const doc = theta(options.line, options.tail);
  expect(
    shapes(doc),
    `${options.why}\n  source line 6: ${options.line}\n  actual diagnostics: ${render(doc)}`,
  ).toEqual([...options.diagnostics]);
  const arms = armsOf(doc, options.why);
  expect(
    arms.length,
    `${options.why}: the parse must build exactly the arms the author wrote — a different count is the phantom-arm cascade (bug 0123 §Actual behaviour, step 4).\n  source line 6: ${options.line}\n  actual arms: ${JSON.stringify(stripped(arms))}`,
  ).toBe(options.armCount);
  expect(
    patternsOf(doc, options.why),
    `${options.why}: the built patterns must be the patterns the author wrote — a differing arity or a wildcard in place of a binding silently changes which runtime values the arm matches (docs/spec_topics/expressions.md, array patterns are exact-length).\n  source line 6: ${options.line}`,
  ).toEqual([...options.patterns]);
  if (options.bodies !== undefined) {
    expect(
      arms.map((arm) => stripped(arm.body)),
      `${options.why}: the arm bodies must be the bodies the author wrote.\n  source line 6: ${options.line}`,
    ).toEqual([...options.bodies]);
  }
  return doc;
}

// ===========================================================================
// (r) The registry rows this file renders from — and the guard that route (a)
// makes NO registry edit. DIAG-2 (diagnostic-shape.md) closes the registry:
// the row already exists with an accurate, position-free *Trigger*, so the fix
// adds no code, narrows no Trigger and rewords no Hint.
// ===========================================================================

describe("bug 0123 (r) — the registry row under adjudication is unchanged by this fix", () => {
  it("r1: the increment-decrement row is Sev E, phase parse, with the pinned Message and Hint", () => {
    const row = REGISTRY.find((r) => r.code === INC_DEC);
    expect(
      row,
      `DIAG-2: ${REGISTRY_PARSE_PAGE} must carry the row for ${INC_DEC}; its disappearance is a spec regression, not a licence to weaken this file`,
    ).toBeDefined();
    const found = row as RegistryRow;
    expect(
      found.severity,
      "an E denies registration, which is what stops a theta whose pattern holds the operator from running",
    ).toBe("E");
    expect(found.phase, "route (a) emits from `parsePattern`, a parse-phase leaf").toBe("parse");
    expect(
      found.message,
      "DIAG-4: the *Message* column is normative and this file interpolates it",
    ).toBe("'<op>' operator is not supported");
    expect(
      registryHint(INC_DEC),
      "route (a) emits `checkIncrementDecrement` UNCHANGED, so the registered Hint reaches the author verbatim — no Hint edit is part of this fix",
    ).toBe("Use `count += 1` / `count -= 1`.");
  });

  it("r2: the *Trigger* is verbatim position-free — Reading A, and no DIAG-2 edit", () => {
    // §Expected behaviour (1) resolves to Reading A precisely because this
    // sentence carries NO position qualifier while the table states position
    // when position matters (`:30` "Assignment used in expression position",
    // `:32` "… or `match` pattern binding"). Route (a) therefore needs no
    // Trigger change, and this literal is the guard that reds if one is made.
    const row = REGISTRY.find((r) => r.code === INC_DEC) as RegistryRow;
    expect(
      row.trigger,
      "the Trigger must stay byte-identical: a pattern-position operator is already inside it (Reading A), so narrowing or widening it is not part of this fix",
    ).toBe("`++` or `--` operator used.");
  });

  it("r3: the neighbouring rows this file's control cells read are the position-scoping evidence", () => {
    // `:30` scopes itself to expression position and `:32` enumerates `match`
    // pattern binding — the two rows that establish the table's convention and
    // prove `match` pattern position is inside the registry's reach.
    const assignment = REGISTRY.find((r) => r.code === "theta/parse/assignment-as-expression");
    expect(assignment, `${REGISTRY_PARSE_PAGE} must carry the assignment-as-expression row`).toBeDefined();
    expect(
      (assignment as RegistryRow).trigger,
      "the table states position when position matters — this row does",
    ).toContain("expression position");
    const mut = REGISTRY.find((r) => r.code === "theta/parse/mut-on-immutable-context");
    expect(mut, `${REGISTRY_PARSE_PAGE} must carry the mut-on-immutable-context row`).toBeDefined();
    expect(
      (mut as RegistryRow).trigger,
      "`match` pattern position is already inside the registry's reach, and `parsePattern` already emits this row (src/parser/theta-document.ts:4083–4094)",
    ).toContain("`match` pattern binding");
  });

  it("r4: bug 0141's capitalised-pattern-head row is present, so group (i)'s pairs are renderable", () => {
    const row = REGISTRY.find((r) => r.code === CAP_HEAD);
    expect(
      row,
      `${REGISTRY_PARSE_PAGE} must carry bug 0141's row for ${CAP_HEAD} (shipped 0.146.0) — group (i) asserts it fires on the OPERAND`,
    ).toBeDefined();
    expect((row as RegistryRow).severity, `${CAP_HEAD} is an E row`).toBe("E");
    expect(capMessage("Y"), "DIAG-4: rendered from the registry column").toBe(
      "capitalised pattern head 'Y' names no pattern production",
    );
  });
});

// ===========================================================================
// (a) THE PRIMARY ROW. `let r = match x { --y => 1, _ => 2 }`
//
// Columns, derived once and reused by (b), (h) and (i): `let `1–4, `r`5, ` `6,
// `=`7, ` `8, `match`9–13, ` `14, `x`15, ` `16, `{`17, ` `18, `--`19–20,
// `y`21. End columns are EXCLUSIVE (measured: the `--` of `y--`, which starts
// at column 20, reports end column 22).
//
// At HEAD this row draws `match-arm-type-mismatch` @6:9-6:37 +
// `statement-in-arm-body` @6:21-6:22 and builds THREE arms from two, the first
// with a `null` body. Under route (a) it draws exactly ONE diagnostic — the
// registered operator rejection at the operator token — over the two arms the
// author wrote, with the operand as arm 0's pattern.
// ===========================================================================

const OP_AT = at(19, 21);

describe("bug 0123 (a) — `--y` in pattern position draws the registered operator rejection alone", () => {
  it("a1: exactly one diagnostic, at the operator token, with the registered Message and Hint", () => {
    expectCell({
      line: "let r = match x { --y => 1, _ => 2 }",
      diagnostics: [incDec("--", OP_AT)],
      armCount: 2,
      patterns: [identPattern("y"), WILDCARD],
      bodies: [numberBody("1"), numberBody("2")],
      why: "bug 0123 §Expected behaviour (1) Reading A: the operator is named at its own range under the registered row, and the `statement-in-arm-body` / `match-arm-type-mismatch` pair is a cascade from a recovery that must not produce an arm",
    });
  });

  it("a2: neither neighbouring code fires — the cascade is gone, not merely joined", () => {
    // Named explicitly so a red reads as "the wrong code still fires" rather
    // than as an opaque list mismatch: these are the two codes bug 0123
    // measures at HEAD for this input.
    const doc = theta("let r = match x { --y => 1, _ => 2 }");
    expect(
      doc.diagnostics.filter((d) => d.code === STATEMENT_IN_ARM_BODY),
      `${STATEMENT_IN_ARM_BODY} must not fire: there is no statement, and the repair its message names (a block expression) is unimplemented (bug 0082). Diagnostics: ${render(doc)}`,
    ).toHaveLength(0);
    expect(
      doc.diagnostics.filter((d) => d.code === ARM_TYPE_MISMATCH),
      `${ARM_TYPE_MISMATCH} must not fire: its own Trigger speaks of "the other arms", and the arm whose null body breaks the common type is the parser's own phantom arm. Diagnostics: ${render(doc)}`,
    ).toHaveLength(0);
  });

  it("a3: the diagnostic's severity is error, which denies registration", () => {
    const doc = theta("let r = match x { --y => 1, _ => 2 }");
    const inc = doc.diagnostics.filter((d) => d.code === INC_DEC);
    expect(
      inc,
      `exactly one ${INC_DEC} is owed for one authored operator. Diagnostics: ${render(doc)}`,
    ).toHaveLength(1);
    expect(
      inc[0]!.severity,
      "an E denies registration (docs/spec_topics/governance/source-language-stability.md), which is what stops the theta from running",
    ).toBe("error");
  });

  it("a4: a single-arm spelling draws the same single diagnostic over its one arm", () => {
    // §Reproduction measures the pair as independent of the arm count; the
    // fixed observable must be too.
    expectCell({
      line: "let r = match x { --y => 1 }",
      diagnostics: [incDec("--", OP_AT)],
      armCount: 1,
      patterns: [identPattern("y")],
      bodies: [numberBody("1")],
      why: "the rejection is per authored operator, not per arm count",
    });
  });
});

// ===========================================================================
// (b) The other operator. Same columns, `<op>` rendered `++`.
// ===========================================================================

describe("bug 0123 (b) — `++y` in pattern position draws the same rejection for '++'", () => {
  it("b1: exactly one diagnostic, `'++' operator is not supported`", () => {
    expectCell({
      line: "let r = match x { ++y => 1, _ => 2 }",
      diagnostics: [incDec("++", OP_AT)],
      armCount: 2,
      patterns: [identPattern("y"), WILDCARD],
      bodies: [numberBody("1"), numberBody("2")],
      why: "the registered row covers both operators (`++` or `--` operator used.), and `<op>` is the source token verbatim",
    });
  });
});

// ===========================================================================
// (c) The postfix spelling is BYTE-UNCHANGED. `y--` already draws the
// registered code — through `parseUnary`'s prefix hook reading the leftover
// operator as an EXPRESSION (src/parser/theta-document.ts:3574) — alongside the
// mismatch cascade. Route (a) recognises the operator only in pattern-HEAD
// position, so this row must not move: the identifier `y` parses as the pattern
// first, and the leftover `--` never reaches the new arm.
// ===========================================================================

describe("bug 0123 (c) — `y--` is unchanged: the leftover operator is still read as an expression", () => {
  it("c1: the whole two-diagnostic list and the four-arm shape stay exactly as measured", () => {
    expectCell({
      line: "let r = match x { y-- => 1, _ => 2 }",
      diagnostics: [
        existing(ARM_TYPE_MISMATCH, MISMATCH_MESSAGE, span(9, 37)),
        incDec("--", at(20, 22)),
      ],
      armCount: 4,
      patterns: [identPattern("y"), WILDCARD, WILDCARD, WILDCARD],
      why: "route (a) is a pattern-HEAD recognition; `y--` parses `y` as the pattern and leaves the operator to the expression walk, so this row's observable does not move",
    });
  });
});

// ===========================================================================
// (d) The three formerly-SILENT spellings. These are the rows that change what
// the program MATCHES, and route (a) open question 1's answer (consume the
// operator, then parse the operand as the pattern when it can begin one, else
// return a wildcard) is what keeps their arities honest.
// ===========================================================================

describe("bug 0123 (d) — the three spellings that load cleanly today become loud, with honest arities", () => {
  it("d1: a bare `--` pattern draws the rejection and stays a wildcard arm", () => {
    // The operand slot is empty: the next token is the `=` of `=>`, which
    // cannot begin a pattern, so the wildcard branch of open question 1's
    // answer applies and the arm stays well-formed.
    expectCell({
      line: "let r = match x { -- => 1, _ => 2 }",
      diagnostics: [incDec("--", OP_AT)],
      armCount: 2,
      patterns: [WILDCARD, WILDCARD],
      bodies: [numberBody("1"), numberBody("2")],
      why: "a bare `--` silently acts as `_` today (a catch-all the author never wrote); it must draw the operator rejection while the arm stays a well-formed wildcard",
    });
  });

  it("d2: `[--y]` draws the rejection and stays a ONE-slot array pattern binding y", () => {
    // `[`19, `--`20–21, `y`22. Today this is a TWO-slot exact-length pattern
    // ([wildcard, y]), so the arm matches two-element arrays and binds `y` to
    // the second element — a silent change of meaning.
    expectCell({
      line: "let r = match x { [--y] => 1, _ => 2 }",
      diagnostics: [incDec("--", at(20, 22))],
      armCount: 2,
      patterns: [{ kind: "array", elements: [identPattern("y")] }, WILDCARD],
      bodies: [numberBody("1"), numberBody("2")],
      why: "array patterns are exact-length (docs/spec_topics/expressions.md), so a recovered wildcard element silently changes which values the arm matches; the operand must be the element",
    });
  });

  it("d3: `{ a: --y }` draws the rejection and keeps EXACTLY one field, `a`, bound to y", () => {
    // `{`19, `a`21, `:`22, `--`24–25, `y`26. Today the field `a` binds a
    // wildcard AND the pattern gains a phantom required field named `y`.
    expectCell({
      line: "let r = match x { { a: --y } => 1, _ => 2 }",
      diagnostics: [incDec("--", at(24, 26))],
      armCount: 2,
      patterns: [
        {
          kind: "object",
          typeName: null,
          fields: [{ name: "a", pattern: identPattern("y") }],
        },
        WILDCARD,
      ],
      bodies: [numberBody("1"), numberBody("2")],
      why: "today the object pattern gains a required field named after the operand; the operand must be the field's pattern and the field list must hold exactly the field the author wrote",
    });
  });
});

// ===========================================================================
// (e) The constructor inner position. `Ok(--y)` is loud today but names the
// OPERAND as an unknown identifier, having recovered `--` as the inner pattern
// and left `y` outside the `)` as the arm body.
// ===========================================================================

describe("bug 0123 (e) — `Ok(--y)` draws the operator rejection, not unknown-identifier on the operand", () => {
  it("e1: one increment-decrement, no unknown-identifier, inner pattern is the operand", () => {
    // `O`19, `k`20, `(`21, `--`22–23, `y`24, `)`25.
    const doc = expectCell({
      line: "let r = match x { Ok(--y) => 1, _ => 2 }",
      diagnostics: [incDec("--", at(22, 24))],
      armCount: 2,
      patterns: [
        { kind: "constructor", ctor: "Ok", inner: identPattern("y") },
        WILDCARD,
      ],
      bodies: [numberBody("1"), numberBody("2")],
      why: "the operand is inside the constructor's parentheses; recovering the operator as the inner pattern pushes `y` out to the arm body and misreports it as an unknown identifier",
    });
    expect(
      doc.diagnostics.filter((d) => d.code === UNKNOWN_IDENT),
      `${UNKNOWN_IDENT} must not fire: the operand never leaves the pattern. Diagnostics: ${render(doc)}`,
    ).toHaveLength(0);
  });
});

// ===========================================================================
// (f) BYTE-UNCHANGED positional controls — the three positions in the same
// expression that already draw the code through bug 0084's two hooks. These
// prove the fix is POSITIONAL: it adds pattern position and moves nothing else.
// The hooks themselves are binding constraints (§Fix "Bug 0084's two
// expression-walk hooks stay": src/parser/theta-document.ts:3574 and :3695,
// guarded by `incrementDecrementOp()` at :3559).
// ===========================================================================

describe("bug 0123 (f) — the arm-body, scrutinee and statement positions are unchanged", () => {
  it("f1: an arm BODY `--c` keeps its single rejection at 6:24 over two arms", () => {
    expectCell({
      line: "let r = match c { 1 => --c, _ => 2 }",
      diagnostics: [incDec("--", at(24, 26))],
      armCount: 2,
      patterns: [{ kind: "literal", value: 1 }, WILDCARD],
      why: "the arm body is an expression position and already funnels through `parseUnary`; route (a) must not double up here",
    });
  });

  it("f2: a SCRUTINEE `--c` keeps its single rejection at 6:15 over two arms", () => {
    expectCell({
      line: "let r = match --c { 1 => 1, _ => 2 }",
      diagnostics: [incDec("--", at(15, 17))],
      armCount: 2,
      patterns: [{ kind: "literal", value: 1 }, WILDCARD],
      why: "the scrutinee is a header expression and already draws the code; the fix touches `parsePattern` only",
    });
  });

  it("f3: STATEMENT position `c--` keeps its single rejection at 6:2 (bug 0084's r3)", () => {
    // Not a `match` fixture, so it carries no arm-count assertion: the
    // statement-position row is bug 0084's own, pinned here only as the
    // control that the shared emitter did not move.
    const doc = theta("c--", "c");
    expect(
      shapes(doc),
      `bug 0084's statement-position row must stay byte-unchanged (§Fix: its 25-cell witness stays green and byte-unchanged). Actual: ${render(doc)}`,
    ).toEqual([incDec("--", at(2, 4))]);
  });
});

// ===========================================================================
// (g) Legal-pattern controls: the two forms the pattern grammar admits in the
// same slot must keep loading with zero diagnostics. These bound route (a)'s
// blast radius inside `parsePattern` itself.
// ===========================================================================

describe("bug 0123 (g) — the legal patterns in the same position stay silent", () => {
  it("g1: an identifier pattern `y` draws nothing", () => {
    expectCell({
      line: "let r = match x { y => 1, _ => 2 }",
      diagnostics: [],
      armCount: 2,
      patterns: [identPattern("y"), WILDCARD],
      bodies: [numberBody("1"), numberBody("2")],
      why: "a lowercase identifier pattern is the binding production and must stay silent — it is also the shape route (a) produces for the OPERAND",
    });
  });

  it("g2: wildcard patterns `_` draw nothing", () => {
    expectCell({
      line: "let r = match x { _ => 1, _ => 2 }",
      diagnostics: [],
      armCount: 2,
      patterns: [WILDCARD, WILDCARD],
      bodies: [numberBody("1"), numberBody("2")],
      why: "an authored `_` must stay silent — it is also the shape route (a) returns when the operand slot cannot begin a pattern (cell d1)",
    });
  });

  it("g3: the legal array / object / constructor spellings of (d) and (e) stay silent", () => {
    for (const [line, patterns] of [
      ["let r = match x { [y] => 1, _ => 2 }", [{ kind: "array", elements: [identPattern("y")] }]],
      [
        "let r = match x { { a: y } => 1, _ => 2 }",
        [{ kind: "object", typeName: null, fields: [{ name: "a", pattern: identPattern("y") }] }],
      ],
      [
        "let r = match x { Ok(y) => 1, _ => 2 }",
        [{ kind: "constructor", ctor: "Ok", inner: identPattern("y") }],
      ],
    ] as const) {
      expectCell({
        line,
        diagnostics: [],
        armCount: 2,
        patterns: [...patterns, WILDCARD],
        why: "the operator-free spelling of each sub-position must keep loading, and its shape is exactly what route (a) must build for the operator-bearing spelling",
      });
    }
  });
});

// ===========================================================================
// (h) NON-GOAL pins. Both rows are UNCHANGED observables: the report's subject
// is the increment/decrement operator, for which a registered row exists, and
// NOT the general leniency of the fall-through nor the `nullExpr` substitution
// (src/parser/theta-document.ts:3922–3924).
// ===========================================================================

describe("bug 0123 (h) — the non-goals stay non-goals", () => {
  it("h1: a single `-` (`-y`) keeps the two neighbouring codes — the fall-through's general leniency is out of scope", () => {
    // `-`19, `y`20. One `punct` `-` is NOT the operator token
    // (`incrementDecrementOp`, src/parser/theta-document.ts:3559, requires the
    // text to be exactly `++` or `--`), so this row must keep falling through.
    expectCell({
      line: "let r = match x { -y => 1, _ => 2 }",
      diagnostics: [
        existing(ARM_TYPE_MISMATCH, MISMATCH_MESSAGE, span(9, 36)),
        existing(STATEMENT_IN_ARM_BODY, STATEMENT_MESSAGE, at(20, 21)),
      ],
      armCount: 3,
      patterns: [WILDCARD, WILDCARD, WILDCARD],
      why: "§Non-goals: the single `-` spelling and negative-literal patterns are a wider input class with no registered row; route (a) recognises only the two-character operator token",
    });
  });

  it("h2: a genuine bare statement arm body (`1 => let z = 2`) keeps its two codes", () => {
    // `1`19, `=`21,`>`22, `let`24–26. This is the control that makes the pair
    // non-diagnostic today; the `nullExpr` substitution that produces it is
    // explicitly not adjudicated here, so the row must not move.
    expectCell({
      line: "let r = match x { 1 => let z = 2, _ => 2 }",
      diagnostics: [
        existing(ARM_TYPE_MISMATCH, MISMATCH_MESSAGE, span(9, 43)),
        existing(STATEMENT_IN_ARM_BODY, STATEMENT_MESSAGE, at(24, 27)),
      ],
      armCount: 2,
      patterns: [{ kind: "literal", value: 1 }, WILDCARD],
      why: "§Non-goals: the `nullExpr` substitution for a consumed arm-body statement is not adjudicated here, so a genuine bare statement keeps exactly the codes it ships with",
    });
  });
});

// ===========================================================================
// (i) THE BUG 0141 INTERACTION — the operator's rider. Bug 0141 (0.146.0)
// refuses a capitalised bare pattern head from the SAME tail arm of
// `parsePattern` (src/parser/theta-document.ts:4185–4194). Because route (a)
// parses the OPERAND by recursing into `parsePattern`, a capitalised operand
// draws BOTH refusals — two authored mistakes, two rows, column-ordered — where
// today 0141's row does not fire at all on `--Y`, the recovery having eaten the
// operator and left the head to the arm-body path.
// ===========================================================================

describe("bug 0123 (i) — a capitalised operand draws both this rejection and bug 0141's", () => {
  it("i1: `--Y` draws increment-decrement @6:19 THEN capitalised-pattern-head @6:21", () => {
    // At HEAD: mismatch + statement-in-arm-body, and 0141's row never fires.
    expectCell({
      line: "let r = match x { --Y => 1, _ => 2 }",
      diagnostics: [incDec("--", OP_AT), capHead("Y", at(21, 22))],
      armCount: 2,
      patterns: [identPattern("Y"), WILDCARD],
      bodies: [numberBody("1"), numberBody("2")],
      why: "two authored mistakes draw two rows in column order (`assembleDiagnostics` sorts by (file, line, column)); recursing into `parsePattern` for the operand is what preserves bug 0141's refusal on it",
    });
  });

  it("i2: `[--Y]` draws both rows over a ONE-slot array pattern", () => {
    // At HEAD: 0141's row alone @6:22, over a TWO-slot array.
    expectCell({
      line: "let r = match x { [--Y] => 1, _ => 2 }",
      diagnostics: [incDec("--", at(20, 22)), capHead("Y", at(22, 23))],
      armCount: 2,
      patterns: [{ kind: "array", elements: [identPattern("Y")] }, WILDCARD],
      why: "the operand keeps bug 0141's refusal AND the array keeps the arity the author wrote",
    });
  });

  it("i3: `Y--` is byte-unchanged at THREE codes", () => {
    // `Y`19, `--`20–21. The identifier pattern parses (drawing 0141's row),
    // the leftover operator reaches the expression walk (drawing this row),
    // and the phantom arms still break the common arm-body type.
    expectCell({
      line: "let r = match x { Y-- => 1, _ => 2 }",
      diagnostics: [
        existing(ARM_TYPE_MISMATCH, MISMATCH_MESSAGE, span(9, 37)),
        capHead("Y", at(19, 20)),
        incDec("--", at(20, 22)),
      ],
      armCount: 4,
      patterns: [identPattern("Y"), WILDCARD, WILDCARD, WILDCARD],
      why: "the postfix spelling is not a pattern-HEAD operator, so route (a) leaves it exactly as it ships (cell c1's row, with bug 0141's head refusal added by 0.146.0)",
    });
  });
});

// ===========================================================================
// (j) GOV-15 corpus sweep
// (docs/spec_topics/governance/source-language-stability.md). Three measured
// inputs load cleanly today and gain an `E` under route (a), which is the
// diagnostic-registry carve-out applied as an ADDITION. The in-corpus blast
// radius is re-MEASURED here at this HEAD rather than copied from the report.
// ===========================================================================

describe("bug 0123 (j) — no committed theta source holds a `++` / `--` in a match pattern", () => {
  it("j1: the whole tracked `.theta` / `.thetalib` corpus draws no increment-decrement", () => {
    const listed = execFileSync("git", ["ls-files", "--", "*.theta", "*.thetalib"], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      encoding: "utf8",
    })
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    // Fail LOUDLY on an empty list (CLAUDE.md): a sweep over nothing reports
    // success while verifying nothing, and this cell is the GOV-15 half of the
    // fix's licence.
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
        if (d.code === INC_DEC) {
          offenders.push(`${relative}: ${d.code}: ${d.message}`);
        }
      }
    }
    expect(
      offenders,
      "the carve-out covers this addition, but the corpus blast radius must be re-measured rather than assumed: no shipped theta may gain the operator rejection, in a match pattern or anywhere else",
    ).toEqual([]);
  });
});

// ===========================================================================
// (k) Nested depth. The array-element and object-field loops call `parsePattern`
// recursively (src/parser/theta-document.ts:4108, :4161), so the recognition
// must hold at depth — and the arity honesty must hold at every level.
// ===========================================================================

describe("bug 0123 (k) — the recognition holds at nested pattern depth", () => {
  it("k1: `[[--y]]` draws one rejection over a one-slot array of a one-slot array", () => {
    // `[`19, `[`20, `--`21–22, `y`23.
    expectCell({
      line: "let r = match x { [[--y]] => 1, _ => 2 }",
      diagnostics: [incDec("--", at(21, 23))],
      armCount: 2,
      patterns: [
        { kind: "array", elements: [{ kind: "array", elements: [identPattern("y")] }] },
        WILDCARD,
      ],
      bodies: [numberBody("1"), numberBody("2")],
      why: "the element loop recurses into `parsePattern`, so both the emission and the arity honesty must survive nesting; today the inner array is a silent two-slot pattern",
    });
  });

  it("k2: an object field inside an array element draws one rejection and keeps both arities", () => {
    // `[`19, `{`20, `a`22, `:`23, `--`25–26, `y`27.
    expectCell({
      line: "let r = match x { [{ a: --y }] => 1, _ => 2 }",
      diagnostics: [incDec("--", at(25, 27))],
      armCount: 2,
      patterns: [
        {
          kind: "array",
          elements: [
            {
              kind: "object",
              typeName: null,
              fields: [{ name: "a", pattern: identPattern("y") }],
            },
          ],
        },
        WILDCARD,
      ],
      why: "the two nested loops compose: one authored operator draws one row, the array keeps one slot and the object keeps one field",
    });
  });
});
