import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { Block, ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0084 — `theta/parse/increment-decrement` is a registered `E`-severity row
// whose sole emitter, `checkIncrementDecrement` (src/parser/bindings.ts), has
// no `src/` caller, so no `++` / `--` in author source draws it
// (docs/bugs/0084-increment-decrement-check-dead.md).
//
// The consequence is asymmetric, and neither arm is a plain silent acceptance:
//
//   - `--` is REINTERPRETED. A trailing binary operator continues the statement
//     onto the next line (docs/spec_topics/expressions.md:147), so `c--` glues to
//     whatever follows and the second `-` becomes a unary minus on it.
//     `while c > 0 { c-- }` therefore parses to a loop whose body is
//     `{ statements: [], tail: c }` — the decrement is gone, the condition never
//     changes, and the loop does not terminate. Zero diagnostics.
//   - `++` draws the WRONG code. The pair leaves a `punct` the statement loop
//     cannot start a statement with, so the `parseForms` stray-punctuation
//     recovery reports
//     `theta/parse/unsupported-feature: unsupported syntactic feature: stray '+'
//     in statement position` — naming a token the author did not write, and
//     never the registered repair hint.
//
// THE CONTRACT UNDER TEST (the bug doc's §Fix disposition 1, not one step wider).
// Recognition of the byte-adjacent pair moves into the lexer's greedy two-char
// operator set (`twoCharOperators`), which by
// construction runs before `collapseContinuations` tests the trailing
// trigger — the ordering constraint §Fix names, since `--` at end of line is
// otherwise swallowed. `++` / `--` are in neither `trailingTriggers` nor
// `leadingTriggers`, so the pair no longer absorbs the following newline. The
// existing emitter is then called at the two expression-walk hooks every
// expression position funnels through: the prefix arm of `parseUnary`
// and the suffix loop of `parsePostfix`.
// Both hooks consume the operator and yield the operand, so the pair
// never reaches the statement loop's stray-punctuation recovery.
//
// Post-fix static observables at the `parseThetaDocument` boundary:
//
//   r1–r10  each draws EXACTLY ONE theta/parse/increment-decrement, severity
//           error, with the registered Message (`<op>` the source token
//           verbatim) and the registered Hint — statement position (r1–r6),
//           loop body (r7, r8), `fn` body (r9), expression position (r10)
//   c1–c3   byte-unchanged: the documented repair `c += 1` stays silent, and the
//           two wired sibling rejections keep their own single code
//   s1, s2   `c - - c` / `c - -c` stay accepted — whitespace separates the pair
//   s5–s7   a `--` inside `@`-template prose, a `//` comment, or a string
//           literal is not code and stays accepted (the GOV-15 blast-radius
//           guards: these are the neighbouring lexical contexts a greedy
//           two-char operator could reach into)
//   s3, s4   `c-- c` / `c --c` DO draw the code — see group (d) for why byte
//           adjacency decides
//
// Every expected Message comes from the registry's *Message* column per DIAG-4
// (docs/spec_topics/diagnostics/diagnostic-shape.md:74: tests "MUST source the
// string from this column rather than copy-pasting prose"), never from copied
// prose. `parseRegistry` (tools/code-registry/index.js) exposes no *Hint*, so
// `registryHint` below reads that cell out of the same live row.
//
// GOV-15 (docs/spec_topics/governance/source-language-stability.md:5) is
// engaged: r3–r9 satisfy the loads-cleanly predicate (:9) today and gain an `E`,
// which changes observable (b) and denies registration. That is the
// diagnostic-registry carve-out (:25) applied as an addition — admissible within
// a theta 1.x minor exactly because the only effect on those inputs is the
// appearance of the code's emission. Group (c) bounds the blast radius: the
// three lexical contexts where a `--` is prose, comment or string data keep
// loading, and so do both whitespace-separated subtraction spellings.
//
// DIAG-2 (:72) is not engaged. The row already exists at
// docs/spec_topics/diagnostics/code-registry-parse.md:33 with an accurate
// Trigger ("`++` or `--` operator used."), so the fix adds no code and rewords
// no cell; group (f) is the guard that keeps this file's pins reconciled with it.

// --- Registry-sourced Message and Hint (DIAG-4) -----------------------------

/** The live sharded registry page this file's code is registered on. */
const REGISTRY_TEXT = readFileSync(
  fileURLToPath(
    new URL("../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
  ),
  "utf8",
);

interface RegistryRow {
  code: string;
  severity: string;
  phase: string;
  trigger: string;
  message: string;
}

const REGISTRY = parseRegistry(REGISTRY_TEXT) as RegistryRow[];

const CODE = "theta/parse/increment-decrement";

/** The code the `++` arm draws instead of `CODE` while the emitter is unwired. */
const UNSUPPORTED_FEATURE_CODE = "theta/parse/unsupported-feature";
/** The code the `--c` arm draws when the leading `-` continues the prior line. */
const UNKNOWN_IDENTIFIER_CODE = "theta/parse/unknown-identifier";

/** The registered *Message* template, `'<op>' operator is not supported`. */
const MESSAGE_TEMPLATE = "'<op>' operator is not supported";
/** The registered *Hint*, the repair the author is owed. */
const HINT = "Use `count += 1` / `count -= 1`.";

/**
 * A registered code's normative *Message* template. Fails loudly naming the
 * registry page when the row is absent, so registry drift can never degrade an
 * assertion below into a comparison against `undefined`.
 */
function registered(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: docs/spec_topics/diagnostics/code-registry-parse.md carries no Message row for ${code} — the DIAG-4 column is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}

/**
 * The row's *Hint* cell, read from the live registry table. `parseRegistry`
 * structures five columns and drops *Hint*, and the hint is half of what bug
 * 0084 reports missing, so this file reads the cell itself rather than pinning
 * prose. Cell order is the table header at
 * docs/spec_topics/diagnostics/code-registry-parse.md:9 —
 * Code | Sev | Phase | Trigger | Spec rule | Hint | Message.
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
        `harness: the ${code} row at docs/spec_topics/diagnostics/code-registry-parse.md carries no Hint cell (cell ${HINT_CELL_INDEX} is ${JSON.stringify(hint)}) — bug 0084 reports the absent hint as half the defect, so an empty cell is a harness failure, never a skip`,
      );
    }
    return hint;
  }
  throw new Error(
    `harness: docs/spec_topics/diagnostics/code-registry-parse.md carries no row for ${code} — this file's Hint oracle is stale`,
  );
}

/** The registered Message with `<op>` rendered as the source token verbatim. */
function opMessage(op: "++" | "--"): string {
  const rendered = registered(CODE).replaceAll("<op>", op);
  expect(
    rendered,
    `${CODE}: an unsubstituted <…> placeholder remains — the registry row's Message template changed shape and this file's substitution is stale`,
  ).not.toMatch(/<[a-z]+>/);
  return rendered;
}

// --- Fixtures and cells -----------------------------------------------------

const FILE = "bug0084.theta";

/** The prompt-mode frontmatter prelude — occupies source lines 1–3. */
const FM = "---\nmode: prompt\n---\n";

/** A `code: message` list — the failure-message payload. */
function render(diags: readonly Diagnostic[]): string {
  return JSON.stringify(diags.map((d) => `${d.severity} ${d.code}: ${d.message}`));
}

function parse(body: string): ThetaDocument {
  return parseDoc(FM + body, FILE);
}

/**
 * Assert `body` draws exactly one diagnostic and that it is the registered
 * increment/decrement rejection for `op`, carrying the registered Message and
 * Hint at severity `error`.
 *
 * The count is part of the contract: the fix consumes the operator token and
 * yields the operand, so no stray-punctuation recovery and no unknown-identifier
 * cascade follows. The two explicit code-absence checks name the pre-fix
 * observations from the bug doc's §Reproduction table, so a red reads as the
 * wrong code rather than as an opaque count mismatch.
 */
function expectSoleIncDec(body: string, op: "++" | "--"): Diagnostic {
  const doc = parse(body);
  const diags = doc.diagnostics;
  expect(
    diags.filter((d) => d.code === UNSUPPORTED_FEATURE_CODE),
    `${UNSUPPORTED_FEATURE_CODE} must not fire for a '${op}': the operator is consumed at the expression walk and never reaches the 'parseForms' stray-punctuation recovery. Diagnostics: ${render(diags)}`,
  ).toHaveLength(0);
  expect(
    diags.filter((d) => d.code === UNKNOWN_IDENTIFIER_CODE),
    `${UNKNOWN_IDENTIFIER_CODE} must not fire: a leading '${op}' is no continuation trigger once the pair lexes as one token, so the previous line's initialiser cannot absorb it. Diagnostics: ${render(diags)}`,
  ).toHaveLength(0);
  expect(
    diags,
    `exactly one diagnostic — the '${op}' rejection alone, with no recovery cascade. Diagnostics: ${render(diags)}`,
  ).toHaveLength(1);
  const diag = diags[0]!;
  expect(diag.code, `the registered code for a '${op}' operator`).toBe(CODE);
  expect(
    diag.severity,
    "severity E denies registration (docs/spec_topics/governance/source-language-stability.md:9), which is what stops the program from running",
  ).toBe("error");
  expect(
    diag.message,
    "DIAG-4: the Message is the registry column with `<op>` the source token verbatim",
  ).toBe(opMessage(op));
  expect(
    diag.hint,
    "the registered Hint is the repair the author is owed and is the half of the defect the `++` arm's wrong code loses",
  ).toBe(registryHint(CODE));
  return diag;
}

/** Assert `body` loads with no diagnostic at all. */
function expectSilent(body: string, why: string): void {
  const doc = parse(body);
  expect(doc.diagnostics, `${why}. Diagnostics: ${render(doc.diagnostics)}`).toHaveLength(0);
}

/**
 * The `Block` of the sole `while` / `for` statement in `body`. The loud
 * precondition keeps the body-shape pins below from passing vacuously against a
 * parse that produced no loop at all.
 */
function loopBody(body: string, kind: "while" | "for"): Block {
  const doc = parse(body);
  const loops = (doc.body?.statements ?? []).filter((s) => s.kind === kind);
  expect(
    loops,
    `PRECONDITION: the fixture must parse to exactly one '${kind}' statement; the parse found ${loops.length}. Diagnostics: ${render(doc.diagnostics)}`,
  ).toHaveLength(1);
  const loop = loops[0]!;
  expect(
    loop,
    `PRECONDITION: the sole '${kind}' statement must expose a 'body' field for the cast below; its keys are ${JSON.stringify(Object.keys(loop))}`,
  ).toHaveProperty("body");
  return (loop as { readonly body: Block }).body;
}

const R1_POSTFIX_STMT = "let mut c = 0\nc++\nc\n";
const R2_PREFIX_STMT = "let mut c = 0\n++c\nc\n";
const R3_POSTFIX_DEC = "let mut c = 5\nc--\nc\n";
const R4_PREFIX_DEC = "let mut c = 0\n--c\nc\n";
const R5_DEC_EOF = "let mut c = 5\nc--\n";
const R6_DEC_THEN_LET = "let mut c = 5\nc--\nlet z = 1\nz\n";
const R7_WHILE_DEC = "let mut c = 3\nwhile c > 0 {\n  c--\n}\nc\n";
const R8_FOR_DEC = "let mut c = 0\nfor x in [1,2] {\n  c--\n}\nc\n";
const R9_FN_DEC = "fn f(): integer {\n  let mut c = 5\n  c--\n  c\n}\nf()\n";
const R10_EXPR_POS = "let mut c = 0\nlet d = c++\nd\n";

// ===========================================================================
// (a) Every reachable `++` / `--` position draws the registered rejection.
//
// The measured reachable set is the bug doc's §Fix "Positions to cover" list —
// statement position, expression position, loop body, `fn` body — plus the three
// statement-position shapes whose following token decides how much of the pair
// the continuation absorbs today (a tail expression, EOF, a `let`).
// ===========================================================================

describe("bug 0084 (a) — a `++` / `--` in author source draws theta/parse/increment-decrement", () => {
  it("r1: `c++` in statement position draws the code for '++', not stray-punctuation recovery", () => {
    expectSoleIncDec(R1_POSTFIX_STMT, "++");
  });

  it("r2: `++c` in statement position draws the code for '++'", () => {
    expectSoleIncDec(R2_PREFIX_STMT, "++");
  });

  it("r3: `c--` before a tail expression draws the code for '--' instead of folding to `c - -c`", () => {
    expectSoleIncDec(R3_POSTFIX_DEC, "--");
  });

  it("r4: `--c` after a `let` initialiser draws the code, not unknown-identifier 'c'", () => {
    // The pre-fix diagnostic is `unknown identifier 'c'`: a leading `-` is a
    // continuation trigger, so `let mut c = 0` absorbs `- -c` and reads `c`
    // inside its own initialiser. Lexing `--` as one token removes the trigger.
    expectSoleIncDec(R4_PREFIX_DEC, "--");
  });

  it("r5: `c--` at end of file draws the code rather than dropping the operator", () => {
    expectSoleIncDec(R5_DEC_EOF, "--");
  });

  it("r6: `c--` followed by `let z = 1` draws the code rather than degrading to a bare `c`", () => {
    expectSoleIncDec(R6_DEC_THEN_LET, "--");
  });

  it("r7: `c--` in a `while` body draws the code — the row where silence is a non-terminating loop", () => {
    expectSoleIncDec(R7_WHILE_DEC, "--");
  });

  it("r8: `c--` in a `for` body draws the code", () => {
    expectSoleIncDec(R8_FOR_DEC, "--");
  });

  it("r9: `c--` inside a `fn` body draws the code — statement-position-only coverage leaves this silent", () => {
    expectSoleIncDec(R9_FN_DEC, "--");
  });

  it("r10: `let d = c++` draws the code from expression position, with no cascade", () => {
    // Every expression position funnels through `parseUnary` / `parsePostfix`,
    // so the initialiser position needs no separate hook. The pre-fix parse
    // drops the `++` and binds `let d = c` under an unsupported-feature
    // diagnostic; post-fix the single rejection is the whole diagnostic set.
    expectSoleIncDec(R10_EXPR_POS, "++");
  });
});

// ===========================================================================
// (b) The byte-unchanged controls. These are wired siblings from the same
// `bindings.md` / unsupported-form families, sharing the statement walk, the
// diagnostic machinery and the severity plumbing with the rows above — so they
// are what shows the change is confined to the operator pair.
// ===========================================================================

describe("bug 0084 (b) — the controls stay byte-unchanged", () => {
  it("c1: `c += 1`, the repair the Hint names, stays silent", () => {
    expectSilent(
      "let mut c = 0\nc += 1\nc\n",
      "the compound-assignment repair the registered Hint prescribes must keep loading, or the Hint names a rejected form",
    );
  });

  it("c2: assignment in expression position keeps theta/parse/assignment-as-expression alone", () => {
    const doc = parse("let mut c = 0\nlet d = (c = 1)\nd\n");
    expect(
      doc.diagnostics.map((d) => d.code),
      `the neighbouring wired bindings.md rejection is untouched. Diagnostics: ${render(doc.diagnostics)}`,
    ).toEqual(["theta/parse/assignment-as-expression"]);
  });

  it("c3: a block comment keeps theta/parse/block-comment alone", () => {
    const doc = parse("let a = 1\n/* hi */\na\n");
    expect(
      doc.diagnostics.map((d) => d.code),
      `the sibling unsupported-form rejection is untouched. Diagnostics: ${render(doc.diagnostics)}`,
    ).toEqual(["theta/parse/block-comment"]);
  });
});

// ===========================================================================
// (c) Non-emission rows. Two whitespace-separated subtraction spellings, and the
// three lexical contexts in which a `--` or `++` is data rather than code.
//
// These bound the GOV-15 blast radius: the fix's whole exposure is that inputs
// which load cleanly today gain an `E`, so the inputs that must NOT gain one are
// pinned here rather than left to inference.
// ===========================================================================

describe("bug 0084 (c) — spellings and lexical contexts that stay accepted", () => {
  it("s1: `c - - c` stays accepted — whitespace on both sides leaves two `-` tokens", () => {
    expectSilent(
      "let c = 1\nlet d = c - - c\nd\n",
      "§Fix: subtraction of a negation is legal today and must stay legal; only the byte-adjacent pair is the operator",
    );
  });

  it("s2: `c - -c` stays accepted — the accepted spelling for subtracting a negation", () => {
    expectSilent(
      "let c = 1\nlet d = c - -c\nd\n",
      "§Fix: this is the spelling an author who means `c - (-c)` writes, and it separates the pair with a space",
    );
  });

  it("s5: a `--` inside `@`-template prose stays accepted", () => {
    // Text between the backticks of a `@`...`` template is prose, not code
    // (docs/spec_topics/expressions.md:147 makes the whole template one
    // expression), so a greedy two-char operator must not reach into it — an
    // em-dash-style `--` in a query is ordinary prose an author writes freely.
    expectSilent(
      "let a = 1\nlet p = @`do x -- then y ${a}`\np\n",
      "a `--` in query-template prose is template text, not an operator",
    );
  });

  it("s6: a `--` and a `++` inside a `//` comment stay accepted", () => {
    // Comment text is discarded during scanning, ahead of any operator
    // recognition; a section banner or an em dash in a comment is common enough
    // that a regression here would break most real sources.
    expectSilent(
      "let a = 1\n// a -- b and c++\na\n",
      "comment text carries no operator tokens",
    );
  });

  it("s7: a `--` and a `++` inside string literals stay accepted", () => {
    // String bodies are scanned as literal data. A theta author embedding
    // `x--y` in a message must not be told to write `+= 1`.
    expectSilent(
      'let a = "x--y"\nlet b = "c++"\na\n',
      "string-literal bytes carry no operator tokens",
    );
  });
});

// ===========================================================================
// (d) Adjacency decides, so `c-- c` and `c --c` DO draw the code.
//
// The bug doc's §Fix contains two clauses that cannot both hold: its governing
// rule is "only the byte-adjacent pair with no separating whitespace is the
// operator", and it separately lists `a-- b` among the spellings that must stay
// accepted — but `a-- b` contains the byte-adjacent pair. Resolved here in
// favour of the stated adjacency rule.
//
// WHY adjacency and not the wider whitespace picture: recognising the pair from
// the two adjacent bytes is what lets recognition happen during scanning, ahead
// of the trailing-trigger continuation decision (`collapseContinuations`) — the
// ordering §Fix requires for r3 / r5 / r7. A rule that additionally inspected
// the horizontal whitespace AFTER the pair would have to defer the decision past
// that point. Byte adjacency is also what every C-family lexer does: `a--b`,
// `a-- b` and `a --b` are all `--` tokens in C, C++, Java and JavaScript.
//
// The accepted spelling for subtracting a negation therefore remains `c - -c`
// (s2 above), which separates the pair with a space.
// ===========================================================================

describe("bug 0084 (d) — byte adjacency alone decides, so a trailing space does not rescue the pair", () => {
  it("s3: `let d = c-- c` draws the code — the pair is byte-adjacent", () => {
    expectSoleIncDec("let c = 1\nlet d = c-- c\nd\n", "--");
  });

  it("s4: `let d = c --c` draws the code — leading whitespace does not separate the pair either", () => {
    expectSoleIncDec("let c = 1\nlet d = c --c\nd\n", "--");
  });
});

// ===========================================================================
// (e) The loop-body rows, where silence is not a cosmetic defect.
//
// `while c > 0 { c-- }` parses today to a loop whose body holds no statement at
// all, so the condition is re-evaluated over an unchanged `c` and the loop never
// ends. The rejection that closes this is carried by the diagnostic's `error`
// severity — an `E` denies registration
// (docs/spec_topics/governance/source-language-stability.md:9), so the program
// does not run.
//
// The AST cannot carry it: `{ statements: [], tail: c }` is what the block
// parses to both before and after the fix, because the block's single
// line-start expression form is promoted to the block tail either way. That was
// measured, not assumed, and the shape is pinned below so that a future change
// to it is a deliberate edit rather than a silent one.
// ===========================================================================

describe("bug 0084 (e) — the loop-body rejection is carried by the E severity", () => {
  it("r7: the `while`-body diagnostic is severity error, denying registration", () => {
    const diag = expectSoleIncDec(R7_WHILE_DEC, "--");
    expect(
      diag.severity,
      "an E denies registration, which is what closes the non-terminating loop",
    ).toBe("error");
  });

  it("r8: the `for`-body diagnostic is severity error, denying registration", () => {
    const diag = expectSoleIncDec(R8_FOR_DEC, "--");
    expect(diag.severity, "an E denies registration").toBe("error");
  });

  it("r7 / r8: the loop-body shape is pinned — it does not distinguish fixed from broken", () => {
    for (const [kind, src] of [
      ["while", R7_WHILE_DEC],
      ["for", R8_FOR_DEC],
    ] as const) {
      const body = loopBody(src, kind);
      expect(
        body.statements,
        `${kind} body statements — the block's sole line-start expression form is promoted to the tail`,
      ).toHaveLength(0);
      expect(body.tail?.kind, `${kind} body tail kind`).toBe("ident");
      expect(
        (body.tail as { readonly name?: string } | null)?.name,
        `${kind} body tail identifier`,
      ).toBe("c");
    }
  });
});

// ===========================================================================
// (f) The DIAG-4 drift guard. The row is already registered and DIAG-2 closes
// the registry, so the fix must add no code and reword no cell. Reconciling the
// pinned Message template and Hint against the live row is what makes a registry
// reword red here instead of silently retargeting the assertions above.
// ===========================================================================

describe("bug 0084 (f) — the registry row this file reads (DIAG-2 / DIAG-4)", () => {
  it("REG: the increment-decrement row carries Sev E, phase parse, and the pinned Message and Hint", () => {
    const row = REGISTRY.find((r) => r.code === CODE);
    expect(
      row,
      `docs/spec_topics/diagnostics/code-registry-parse.md carries no row for ${CODE} — DIAG-2 closes the registry, so its disappearance is a spec regression, not a licence to weaken this file`,
    ).toBeDefined();
    expect(
      row!.severity,
      "an E is what denies registration and stops the non-terminating loop in r7",
    ).toBe("E");
    expect(row!.phase, "the check runs in the parse phase, at the expression walk").toBe(
      "parse",
    );
    expect(
      row!.trigger,
      `DIAG-2: the Trigger is already accurate for both operators, so the fix widens nothing; actual trigger=${JSON.stringify(row!.trigger)}`,
    ).toMatch(/`\+\+`\s+or\s+`--`\s+operator used/);
    expect(
      row!.message,
      "DIAG-4: the Message column is normative and this file interpolates it",
    ).toBe(MESSAGE_TEMPLATE);
    expect(
      registryHint(CODE),
      "the Hint is the repair bug 0084 reports as never reaching the author",
    ).toBe(HINT);
  });

  it("REG: the rendered messages this file asserts read as the registry states them", () => {
    // A pure-rendering check over the pinned template: it can never red for a
    // parser reason, so a red in group (a) is never confounded with a
    // mis-spelled expectation here.
    expect(opMessage("++")).toBe("'++' operator is not supported");
    expect(opMessage("--")).toBe("'--' operator is not supported");
  });
});
