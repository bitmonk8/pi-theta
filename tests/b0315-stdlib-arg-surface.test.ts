import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { ThetaSource } from "../src/lexer/lexer";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { parseThetaDocument, type ThetaDocument } from "../src/parser/theta-document";
import { parseDeps } from "./helpers/e2e-s1";

// Bug 0315 — stdlib method calls with a missing / extra / mistyped argument
// parse clean and pass raw JS `undefined`/mistyped values into the host
// methods: `"a-b".replace("-")` answers `"aundefinedb"`, `["a","b"].join()`
// answers `"a,b"`, `"undefinedX".startsWith()` answers `true`, extra arguments
// vanish (docs/bugs/0315-stdlib-method-argument-surface-unchecked.md).
//
// `checkMethodCall` (src/parser/type-layer-checks.ts:3425) validates the member
// NAME (the A2 `theta/parse/unknown-method` allow-list) and the `join` element
// type only — `e.args` is never read — so no arity or argument-type judgement
// exists at parse. This file is the PARSE-time witness for the settled remedy
// in `.pi/tmp/fixes/0315-design-brief.md`: two new registered `type`-phase
// codes checked in `checkMethodCall` beside the existing checks, only for a
// statically-resolvable built-in receiver.
//
//   - `theta/parse/stdlib-arity-mismatch` — a positional-argument count outside
//     the member's `[min,max]` arity. ONE code / ONE message for both
//     directions; `<required>` renders the boundary the call violates (the
//     minimum for too-few, the maximum for too-many).
//     Message: `stdlib method '<method>' on type <type> expects <required>
//     argument(s); got <provided>`.
//   - `theta/parse/stdlib-arg-type-mismatch` — arity satisfied but a
//     statically-resolvable positional argument's type is incompatible with the
//     member's declared parameter type (checked AFTER arity).
//     Message: `stdlib method '<method>' on type <type> argument <i> type
//     mismatch: expected <expected>, got <actual>`.
//
// TIER — unit, offline, provider-free, deterministic (default `npm test`). The
// whole observable is the document's aggregated `diagnostics` list at the
// `parseThetaDocument` boundary; no provider, model, child process or network
// is reachable, so neither an integration nor a live tier would add an
// observable this seam cannot show. (The registration-outcome end of the same
// fix is proved end-to-end by the paired H9a cell
// tests/live/acceptance/b0315live-stdlib-arg-refusal.test.ts.)
//
// HARNESS — the production whole-file parser exactly as
// tests/conformance/production-conformance.test.ts drives it:
// `parseThetaDocument(source, parseDeps())` (parseDeps from
// tests/helpers/e2e-s1.ts) over a `mode: prompt` body.
//
// DIAG-4 ORACLE — docs/spec_topics/diagnostics/diagnostic-shape.md makes the
// registry's *Message* column normative; every expected message below is read
// through `parseRegistry` + `registryMessage` and interpolated, never copied
// into a literal. A missing row throws NAMING the row (never a skip, never a
// silent comparison against `undefined` — CLAUDE.md). The row is absent at
// this HEAD, so each witness cell reds FIRST on the MISSING DIAGNOSTIC (the
// symptom — the parse is clean today) before the message oracle is consulted;
// groups (r1)/(r2) are the DIAG-2 "asserted code with no row" reds.

const ARITY = "theta/parse/stdlib-arity-mismatch";
const ARG_TYPE = "theta/parse/stdlib-arg-type-mismatch";

// The design brief's normative message templates (verbatim). Asserted against
// the registry row in r1, so a divergence between this file and the row reds.
const ARITY_TEMPLATE =
  "stdlib method '<method>' on type <type> expects <required> argument(s); got <provided>";
const ARG_TYPE_TEMPLATE =
  "stdlib method '<method>' on type <type> argument <i> type mismatch: expected <expected>, got <actual>";

const REGISTRY_PARSE_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";
const MIRROR_PAGE = "docs/reference/diagnostics.md";

function readRepoFile(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
}

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(readRepoFile(REGISTRY_PARSE_PAGE)) as RegistryRow[];

// ===========================================================================
// Message oracle — the registry *Message* column with placeholders filled.
// Fails LOUDLY naming the absent row (DIAG-2) or the missing placeholder, never
// a silent comparison against `undefined`.
// ===========================================================================

function fill(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: ${REGISTRY_PARSE_PAGE} carries no Message row for ${code} — the ` +
        "DIAG-4 column is this file's only message oracle, so a missing row is a " +
        "harness failure (the DIAG-2 'asserted code with no row' red), never a skip",
    );
  }
  let out = template;
  for (const [placeholder, value] of fills) {
    if (!out.includes(placeholder)) {
      throw new Error(
        `harness: the ${code} Message template does not carry ${placeholder}; template=${JSON.stringify(template)}`,
      );
    }
    out = out.replace(placeholder, value);
  }
  return out;
}

/** `stdlib method '<method>' on type <type> expects <required> argument(s); got <provided>`. */
function arityMessage(method: string, type: string, required: number, provided: number): string {
  return fill(ARITY, [
    ["<method>", method],
    ["<type>", type],
    ["<required>", String(required)],
    ["<provided>", String(provided)],
  ]);
}

/** `stdlib method '<method>' on type <type> argument <i> type mismatch: expected <expected>, got <actual>`. */
function argTypeMessage(
  method: string,
  type: string,
  i: number,
  expected: string,
  actual: string,
): string {
  return fill(ARG_TYPE, [
    ["<method>", method],
    ["<type>", type],
    ["<i>", String(i)],
    ["<expected>", expected],
    ["<actual>", actual],
  ]);
}

// ===========================================================================
// Parse harness — the production whole-file parser (production-conformance.ts).
// ===========================================================================

const FM = "---\nmode: prompt\n---\n";

function parse(body: string): ThetaDocument {
  const source: ThetaSource = {
    path: "b0315.theta",
    bytes: new TextEncoder().encode(FM + body),
  };
  return parseThetaDocument(source, parseDeps());
}

/** Every diagnostic rendered `severity code: message` for a readable failure. */
function render(doc: ThetaDocument): string {
  return JSON.stringify(doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`));
}

function errorDiags(doc: ThetaDocument): Diagnostic[] {
  return doc.diagnostics.filter((d) => d.severity === "error");
}

/**
 * A witness cell: `body` must now carry `code` as an error diagnostic whose
 * `.message` is the registry template interpolated. The code presence is
 * asserted FIRST, so the primary red at HEAD is the MISSING DIAGNOSTIC (the
 * bug's symptom: `body` parses clean today). `messageOf` is a THUNK evaluated
 * only after that assertion passes — the registry-message oracle throws loudly
 * on the still-absent row (the DIAG-2 red), and deferring it keeps that throw
 * from pre-empting the missing-diagnostic symptom this cell is about.
 */
function expectWitness(body: string, code: string, messageOf: () => string, why: string): void {
  const doc = parse(body);
  const errs = errorDiags(doc);
  expect(
    errs.map((d) => d.code),
    `${why}\n  actual diagnostics: ${render(doc)}`,
  ).toContain(code);
  const diag = errs.find((d) => d.code === code) as Diagnostic;
  expect(
    diag.message,
    `DIAG-4: the ${code} diagnostic's message is the registry *Message* column interpolated\n  actual diagnostics: ${render(doc)}`,
  ).toBe(messageOf());
}

/**
 * A control cell: `body` must carry NO error diagnostic — a correctly-formed
 * call, or one of the five normative `replace` reference vectors, must stay
 * byte-clean through the fix. Green now AND after (design brief §"Gates that
 * MUST stay green").
 */
function expectClean(body: string, why: string): void {
  const doc = parse(body);
  expect(
    errorDiags(doc).map((d) => d.code),
    `${why}\n  actual diagnostics: ${render(doc)}`,
  ).toEqual([]);
}

// Object-member fixtures need a resolvable object receiver in scope.
const OBJ = 'schema F { a: string }\nlet o = F { a: "x" }\n';

// ===========================================================================
// (a) Arity witnesses — `theta/parse/stdlib-arity-mismatch`.
// ===========================================================================

describe("bug 0315 (a) — a stdlib method call with a wrong argument COUNT is refused at parse", () => {
  it("P2a: `\"a-b\".replace(\"-\")` — too few (replace is binary), refused", () => {
    expectWitness(
      'let x = "a-b".replace("-")\nx',
      ARITY,
      () => arityMessage("replace", "string", 2, 1),
      "expressions.md types `replace` as `(from: string, to: string): string`; a one-argument call satisfies no row of the stdlib table and must not reach `replaceLiteral` with `to === undefined` (the `\"aundefinedb\"` leak)",
    );
  });

  it("P2b: `[\"a\",\"b\"].join()` — too few (join is unary), refused", () => {
    expectWitness(
      'let x = ["a", "b"].join()\nx',
      ARITY,
      () => arityMessage("join", "array<string>", 1, 0),
      "`join(sep)` is unary; a zero-argument call must not fall through to `Array.prototype.join(undefined)`'s `\",\"` default",
    );
  });

  it("P2c: `\"undefinedX\".startsWith()` — too few, refused (the sharpest witness)", () => {
    expectWitness(
      'let x = "undefinedX".startsWith()\nx',
      ARITY,
      () => arityMessage("startsWith", "string", 1, 0),
      "the zero-argument spelling answers `true`/`false` on whether the receiver starts with the eight characters `undefined` — a predicate no theta rule defines",
    );
  });

  it("P2d: `\"a,b\".split()` — too few, refused", () => {
    expectWitness(
      'let x = "a,b".split()\nx',
      ARITY,
      () => arityMessage("split", "string", 1, 0),
      "`split(sep)` is unary; `split(undefined)` returns the whole string as a one-element array with no diagnostic today",
    );
  });

  it("P2e: `[1,2,3].slice(0, 1, 9)` — too many (slice max arity 2), refused", () => {
    expectWitness(
      "let x = [1,2,3].slice(0, 1, 9)\nx",
      ARITY,
      () => arityMessage("slice", "array<integer>", 2, 3),
      "`slice` has min1 max2; a third argument violates the maximum boundary, so `<required>` renders the maximum (2)",
    );
  });

  it("P2f: `\" a \".trim(\"z\")` — too many (trim is nullary), refused", () => {
    expectWitness(
      'let x = " a ".trim("z")\nx',
      ARITY,
      () => arityMessage("trim", "string", 0, 1),
      "`trim` is nullary; a supplied argument violates the maximum boundary 0",
    );
  });

  it("P2g: `[1,2].includes()` — too few, refused", () => {
    expectWitness(
      "let x = [1,2].includes()\nx",
      ARITY,
      () => arityMessage("includes", "array<integer>", 1, 0),
      "`includes(elem)` is unary; a zero-argument call compares every element against `undefined` (always false) with no diagnostic today",
    );
  });

  it("X3: `\"abc\".endsWith()` — too few, refused", () => {
    expectWitness(
      'let x = "abc".endsWith()\nx',
      ARITY,
      () => arityMessage("endsWith", "string", 1, 0),
      "`endsWith(s)` is unary; the zero-argument search string is `\"undefined\"` today",
    );
  });

  it("object member `o.has()` — too few (has is unary), refused", () => {
    expectWitness(
      OBJ + "let x = o.has()\nx",
      ARITY,
      () => arityMessage("has", "F", 1, 0),
      "the design brief includes object members in the same table; `has(k)` is unary on a resolvable object receiver",
    );
  });

  it("object member `o.keys(1)` — too many (keys is nullary), refused", () => {
    expectWitness(
      OBJ + "let x = o.keys(1)\nx",
      ARITY,
      () => arityMessage("keys", "F", 0, 1),
      "`keys()` is nullary; the extra argument violates the maximum boundary 0 on a resolvable object receiver",
    );
  });
});

// ===========================================================================
// (b) Argument-type witness — `theta/parse/stdlib-arg-type-mismatch`.
// ===========================================================================

describe("bug 0315 (b) — a stdlib method call with a mistyped argument is refused at parse", () => {
  it("X2: `\"abc\".includes(1)` — arity ok, argument 0 is integer where string is required", () => {
    expectWitness(
      'let x = "abc".includes(1)\nx',
      ARG_TYPE,
      () => argTypeMessage("includes", "string", 0, "string", "integer"),
      "theta 1.0 performs no implicit type conversion; JS coercing `1` → `\"1\"` inside `includes` contradicts that posture",
    );
  });

  it("`[1,2].concat(3)` — arity ok, argument 0 is integer where any array is required", () => {
    expectWitness(
      "let x = [1,2].concat(3)\nx",
      ARG_TYPE,
      () => argTypeMessage("concat", "array<integer>", 0, "array<unknown>", "integer"),
      "`concat(other)` accepts any `array<U>`; the `<expected>` rendering is the category-1-conformant `array<unknown>` (the `unknown` stand-in inside the `array<T>` clause), never the bare type-variable `array<T>`",
    );
  });

  it("`[\"a\",\"b\"].includes(1)` — arity ok, argument 0 is integer where the element type string is required", () => {
    expectWitness(
      'let x = ["a","b"].includes(1)\nx',
      ARG_TYPE,
      () => argTypeMessage("includes", "array<string>", 0, "string", "integer"),
      "array `includes(elem)` asks for the receiver `array<T>`'s element type; `[\"a\",\"b\"]` is `array<string>`, so `<expected>` is the element type `string`",
    );
  });

  it("`[1,2,3].slice(0, \"z\")` — arity ok, argument 1 is string where integer is required", () => {
    expectWitness(
      'let x = [1,2,3].slice(0, "z")\nx',
      ARG_TYPE,
      () => argTypeMessage("slice", "array<integer>", 1, "integer", "string"),
      "`slice(start, end)` asks for `integer` in both slots; the second argument `\"z\"` is a string, so `<i>` renders 1 and `<expected>` renders `integer`",
    );
  });
});

// ===========================================================================
// (c) Controls — every correctly-formed call and the five normative `replace`
// reference vectors stay byte-clean (design brief §"correct-arity control
// cells stay BYTE-IDENTICAL"). Green now AND after the fix.
// ===========================================================================

describe("bug 0315 (c) — the five normative `replace` vectors and every correct-arity call stay clean", () => {
  it("replace vector 1: `\"aXbXc\".replace(\"X\",\"[$&]\")`", () => {
    expectClean('let x = "aXbXc".replace("X","[$&]")\nx', "a normative `replace` reference vector must stay clean");
  });

  it("replace vector 2: `\"100\".replace(\"0\",\"$$\")`", () => {
    expectClean('let x = "100".replace("0","$$")\nx', "a normative `replace` reference vector must stay clean");
  });

  it("replace vector 3: `\"a-b\".replace(\"-\",\"x$1y\")`", () => {
    expectClean('let x = "a-b".replace("-","x$1y")\nx', "a normative `replace` reference vector must stay clean");
  });

  it("replace vector 4: `\"abc\".replace(\"\",\"X\")`", () => {
    expectClean('let x = "abc".replace("","X")\nx', "a normative `replace` reference vector must stay clean");
  });

  it("replace vector 5: `\"aaaaa\".replace(\"aa\",\"x\")`", () => {
    expectClean('let x = "aaaaa".replace("aa","x")\nx', "a normative `replace` reference vector must stay clean");
  });

  it("`[\"a\",\"b\"].join(\"-\")` — correct unary join", () => {
    expectClean('let x = ["a","b"].join("-")\nx', "a correct-arity `join` must stay clean");
  });

  it("`\"abc\".startsWith(\"a\")` — correct unary startsWith", () => {
    expectClean('let x = "abc".startsWith("a")\nx', "a correct-arity `startsWith` must stay clean");
  });

  it("`\"a,b\".split(\",\")` — correct unary split", () => {
    expectClean('let x = "a,b".split(",")\nx', "a correct-arity `split` must stay clean");
  });

  it("`[1,2,3].slice(0,1)` — correct binary slice (within min1 max2)", () => {
    expectClean("let x = [1,2,3].slice(0,1)\nx", "a correct-arity `slice` must stay clean");
  });

  it("`\" a \".trim()` — correct nullary trim", () => {
    expectClean('let x = " a ".trim()\nx', "a correct-arity `trim` must stay clean");
  });

  it("`[1,2].includes(1)` — correct unary includes with a matching element type", () => {
    expectClean("let x = [1,2].includes(1)\nx", "a correct-arity `includes` with a matching element type must stay clean");
  });

  it("`o.has(\"a\")` — correct unary object has", () => {
    expectClean(OBJ + 'let x = o.has("a")\nx', "a correct-arity object `has` must stay clean");
  });
});

// ===========================================================================
// (r) The registry rows the refusals render from (DIAG-2 / DIAG-4). RED at this
// HEAD — neither row exists yet, so `registryMessage` returns `undefined` and
// these are the "asserted code with no row" reds. Green once the fix lands the
// two rows and the diagnostics.md mirror in the same commit.
// ===========================================================================

describe("bug 0315 (r) — the two new registry rows and their mirror", () => {
  it("r1 arity: the `stdlib-arity-mismatch` row is registered `E`, phase `type`, with the design-brief message", () => {
    const row = REGISTRY.find((r) => r.code === ARITY);
    expect(row, `DIAG-2: ${REGISTRY_PARSE_PAGE} must carry the row for ${ARITY}`).toBeDefined();
    const found = row as RegistryRow;
    expect(found.severity, `${ARITY} is an error-severity refusal`).toBe("E");
    expect(found.phase, `${ARITY} is a type-phase check (design brief)`).toBe("type");
    expect(
      registryMessage(REGISTRY, ARITY),
      "DIAG-4: the registry *Message* column is the normative rendering this file interpolates",
    ).toBe(ARITY_TEMPLATE);
  });

  it("r1 arg-type: the `stdlib-arg-type-mismatch` row is registered `E`, phase `type`, with the design-brief message", () => {
    const row = REGISTRY.find((r) => r.code === ARG_TYPE);
    expect(row, `DIAG-2: ${REGISTRY_PARSE_PAGE} must carry the row for ${ARG_TYPE}`).toBeDefined();
    const found = row as RegistryRow;
    expect(found.severity, `${ARG_TYPE} is an error-severity refusal`).toBe("E");
    expect(found.phase, `${ARG_TYPE} is a type-phase check (design brief)`).toBe("type");
    expect(
      registryMessage(REGISTRY, ARG_TYPE),
      "DIAG-4: the registry *Message* column is the normative rendering this file interpolates",
    ).toBe(ARG_TYPE_TEMPLATE);
  });

  it("r2 arity: `docs/reference/diagnostics.md` mirrors the arity row", () => {
    const mirror = readRepoFile(MIRROR_PAGE);
    const line = mirror.split("\n").find((l) => l.includes(`\`${ARITY}\``));
    expect(line, `${MIRROR_PAGE} must carry the mirror row for ${ARITY}; a registry addition moves both pages`).toBeDefined();
    expect(line as string, "the mirror row carries the same *Message* as the spec page").toContain(ARITY_TEMPLATE);
    expect(line as string, "the mirror row's Sev column is `E`").toContain("| E |");
  });

  it("r2 arg-type: `docs/reference/diagnostics.md` mirrors the arg-type row", () => {
    const mirror = readRepoFile(MIRROR_PAGE);
    const line = mirror.split("\n").find((l) => l.includes(`\`${ARG_TYPE}\``));
    expect(line, `${MIRROR_PAGE} must carry the mirror row for ${ARG_TYPE}; a registry addition moves both pages`).toBeDefined();
    expect(line as string, "the mirror row carries the same *Message* as the spec page").toContain(ARG_TYPE_TEMPLATE);
    expect(line as string, "the mirror row's Sev column is `E`").toContain("| E |");
  });
});
