import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic, SourceRange } from "../src/diagnostics/diagnostic";
import type { FnDecl, FnParam, ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0150 — both normative grammar mirrors write `FnParam ::= Ident ":" Type`,
// yet `parseFn`'s parameter loop guards the annotation read behind
// `if (this.isPunct(":"))`, so `fn h(p)` parses with zero diagnostics,
// registers and runs with `type: ""` on the `FnParam`
// (docs/bugs/0150-fn-parameter-annotation-optional-against-grammar.md).
//
// THE ADJUDICATED ROUTE: **route 2** — relax both normative mirrors to
// `FnParam ::= Ident (":" Type)?`, rewrite the `fn`-declarations prose on both
// pages, and supply the typing rule the admitted shape lacks. §Fix enumerates
// two routes and selects neither; route 1 (enforce the production) was
// prototyped at HEAD and measured `63 failed / 7428 passed` across 13 files,
// including 20 of the 24 cells of tests/fn-param-not-identifier.test.ts and 11
// of the 35 cells of tests/fn-param-list-unclosed.test.ts, which §Fix shared
// constraint 6 makes conditional on operator authorisation. Route 2 is
// therefore the one this witness encodes: a DOCUMENTATION-only fix, zero source
// changes, zero registry rows, zero existing-test changes.
//
// WHAT THIS FILE IS. Two halves, and they red in opposite states:
//
//   * Group (a) — the DOCUMENTATION cells. RED at HEAD. They read the five
//     corpus sites route 2 must edit off disk and assert the relaxed reading.
//     This is the whole falsifiable content of route 2: §Reproduction's own
//     §"Why it matters" bullet records that no committed test asserts the
//     annotation's requiredness in either direction, and that "none would red
//     if a mirror gained `(":" Type)?`". These cells are that test.
//   * Groups (b) and (c) — the BEHAVIOUR LOCKS. GREEN at HEAD and required to
//     stay green. Route 2 is observably inert (§Fix route 2, "It is observably
//     inert, which is its strongest argument"), so every measured row keeps its
//     bytes. Their job is the other direction: a LATER fix cannot silently
//     re-enforce the production without flipping a cell that names it.
//
// THE FIVE PROSE TARGETS PHASE 2 MUST WRITE. Group (a) pins load-bearing
// tokens, not wording, so the implementer writes the sentences. The required
// tokens, matched case-insensitively with whitespace collapsed and curly
// apostrophes normalised to `'`:
//
//   a1. docs/reference/grammar.md — the `FnParam` production's right-hand side
//       reads exactly `Ident (":" Type)?`, in the `fn`-declarations fence at
//       docs/reference/grammar.md:308.
//   a2. docs/spec_topics/grammar.md — the same, at
//       docs/spec_topics/grammar.md:140.
//   a3. docs/spec_topics/grammar.md — the `fn`-declarations prose paragraph
//       (docs/spec_topics/grammar.md:143) must DROP the sentence fragment
//       ``Each `FnParam` is an `Ident ":" Type` pair`` and must CARRY the
//       phrase `parameter type annotation is optional`.
//   a4. docs/reference/grammar.md — the `fn`-declarations prose paragraph
//       (docs/reference/grammar.md:311–326, which states the parameter type
//       annotation's optionality at `:315–316` beside `: ReturnType`'s at
//       `:322`) must CARRY the same phrase `parameter type annotation is
//       optional`.
//   a5. docs/spec_topics/type-system.md AND its mirror
//       docs/reference/type-system.md — each must carry BOTH of:
//         (i)  `an unannotated `fn` parameter's argument is checked at neither
//              phase`
//         (ii) `no runtime AJV safety net applies`
//       This is §Fix route 2's third bullet, "It must supply the typing rule
//       the shape currently lacks, and the obvious one does not fit": the
//       unresolvable-operand deferral (docs/spec_topics/type-system.md:48,
//       mirror docs/reference/type-system.md:65–75) names "the runtime AJV
//       check" as the safety net, and the `theta/parse/fn-arg-type-mismatch`
//       row states that for a `fn` call none applies
//       (docs/spec_topics/diagnostics/code-registry-parse.md:135). The mirror
//       is NOT optional — a topic-page-only edit leaves the reference page
//       stating the deferral with a safety net that does not exist here.
//
// A prose sentence on a topic page engages neither DIAG-2 nor DIAG-4
// (docs/spec_topics/diagnostics/diagnostic-shape.md:72, `:74`), so route 2
// touches no registry row; group (b)'s expected messages are read FROM the
// registry through the `registryMessage` oracle per DIAG-4, which is what makes
// them oracle-backed rather than transcribed.
//
// THE SUBSTRATE, AT HEAD (v0.173.0 `04515c5d`), for the locks below.
// `parseFn` (src/parser/theta-document.ts:2346) refuses a missing `(` after the
// fn name with `theta/parse/unsupported-feature` (`:2354–2363`) — the same
// production paragraph, enforced — then runs its parameter loop, emits bug
// 0139's `theta/parse/binding-case-mismatch` on an uppercase-initial parameter
// name (`:2468–2474`), and reads the annotation behind a guard:
//
//   let pType = "";
//   if (this.isPunct(":")) { … pType = this.parseType(); … }
//   params.push({ name: pTok.text, type: pType });
//
// (src/parser/theta-document.ts:2477–2486; the `unmatchedCloseParens` sub-block
// inside the guard is bug 0151's `closeParenAbsorbed` withhold and is not
// reached by any row here.) Absence of `:` is not a diagnostic — it is the
// initialiser — so the declaration reaches the AST with `type: ""`.
//
// REGISTRATION is computed by replicating the composition root's own gate,
// `hasLoadParseError` (src/extension/production-composition.ts): an
// `error`-severity diagnostic whose code starts `theta/load/` or
// `theta/parse/`. Every unannotated row below carries none, so each registers.
//
// TIER. Unit. Every observable of route 2 settles inside one `parseDoc` call
// (tests/helpers/e2e-s1.ts:39) plus four `readFileSync` reads of committed
// documentation — no session, no provider, no child process. The doc-reading
// shape follows tests/code-registry.test.ts and
// tests/absent-member-presence-gate.test.ts:205, which read committed spec
// files off disk as the oracle. The companion live cell
// (tests/live/fn-param-annotation-optional-live-cell.test.ts) adds only what an
// offline parse cannot reach: real discovery → registration → a driven turn's
// `theta-system-note` channel.
//
// NON-GOALS, mirrored from the report so no cell over-claims. A13
// (`fn h(p:)`) is bug 0124's §Fix decision 3, which shipped in 0.121.0 and
// dispositioned the empty annotation as LEFT AS IT IS, stated in that row's
// *Trigger*; it is pinned here as the neighbouring boundary, not blessed by
// route 2's `Ident (":" Type)?` (that production admits no `:` without a
// `Type`). A14 (`fn h(3)`) is the `Ident` half, which bug 0225's narrow
// predicate refuses through `theta/parse/fn-param-not-identifier` as of
// 0.168.0; 0150 §Non-goals disclaims that class and this file only pins the
// boundary. Bug 0131's arity silence is recorded at B3 and not claimed.

// ===========================================================================
// (a) The documentation oracle — the five sites route 2 edits.
// ===========================================================================

/** Read a committed corpus file as UTF-8, relative to this test file. */
function corpus(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

/**
 * Whitespace-collapsed, apostrophe-normalised, lowercased text. Wording and
 * line-wrapping are the implementer's; the pinned tokens are not, so the
 * comparison is tolerant of exactly the two dimensions that cannot weaken it
 * (a wrapped reference page must still match, and `’` must not defeat a match).
 */
function flat(text: string): string {
  return text.replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * The `## `fn` declarations` section of a grammar page — from its heading to
 * the next `## ` heading. Both mirrors carry exactly one such heading; presence
 * is asserted so a renamed heading reds by naming that rather than by matching
 * an empty string.
 */
function fnDeclarationsSection(page: string, path: string): string {
  const lines = page.split("\n");
  const start = lines.findIndex((l) => /^##\s+`fn`\s+declarations\s*$/.test(l));
  expect(start, `${path} must carry a \`## \\\`fn\\\` declarations\` section heading`).toBeGreaterThanOrEqual(0);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s/.test(lines[i] ?? "")) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

/**
 * The right-hand side of the single `FnParam ::= …` production line of a
 * grammar page's `fn`-declarations fence, whitespace-collapsed. Uniqueness is
 * asserted: each mirror writes the production once
 * (docs/reference/grammar.md:308, docs/spec_topics/grammar.md:140).
 */
function fnParamRhs(page: string, path: string): string {
  const hits = page
    .split("\n")
    .filter((l) => /^FnParam\s*::=/.test(l))
    .map((l) => l.replace(/^FnParam\s*::=\s*/, "").replace(/\s+/g, " ").trim());
  expect(
    hits,
    `${path} must carry exactly one \`FnParam ::= …\` production line; found ${JSON.stringify(hits)}`,
  ).toHaveLength(1);
  return hits[0] as string;
}

/**
 * Assert that `haystack` (already `flat`-normalised) carries `phrase`. The
 * assertion is on a BOOLEAN rather than on the haystack so the failure payload
 * names the missing phrase and its site instead of dumping a whole corpus page.
 */
function expectPhrase(haystack: string, phrase: string, why: string): void {
  expect(haystack.includes(flat(phrase)), why).toBe(true);
}

/** The mirror of `expectPhrase` — `phrase` must be gone from `haystack`. */
function expectNoPhrase(haystack: string, phrase: string, why: string): void {
  expect(haystack.includes(flat(phrase)), why).toBe(false);
}

/** The relaxed right-hand side route 2 writes into both mirrors. */
const RELAXED_RHS = 'Ident (":" Type)?';
/** The mandatory right-hand side at HEAD, which route 2 removes. */
const MANDATORY_RHS = 'Ident ":" Type';

/** a3/a4's pinned prose token, in both grammar mirrors' `fn` prose. */
const OPTIONALITY_PHRASE = "parameter type annotation is optional";
/** a5's pinned typing-rule clause, in both type-system pages. */
const NEITHER_PHASE_PHRASE =
  "an unannotated `fn` parameter's argument is checked at neither phase";
/** a5's pinned reason the deferral's usual safety net is unavailable here. */
const NO_AJV_PHRASE = "no runtime AJV safety net applies";

/** The sentence route 2 removes from docs/spec_topics/grammar.md:143. */
const MANDATORY_SENTENCE = 'Each `FnParam` is an `Ident ":" Type` pair';

describe("0150 (a) — route 2's documentation edit: both mirrors, both prose paragraphs, and the missing typing rule", () => {
  it("a1: docs/reference/grammar.md's `FnParam` production reads `Ident (\":\" Type)?`", () => {
    // docs/reference/grammar.md:3 declares the page "Normative surface syntax
    // for Theta", and FN-1 (docs/spec_topics/functions.md:20) delegates the
    // parameter list's surface form to this production specifically. The
    // optional-tail mark the `FnDecl` line seven lines above writes for the
    // return type (`(":" ReturnType)?`, docs/reference/grammar.md:301) is the
    // same mark this cell requires on the annotation, so one fence spells both
    // optional slots alike — matching the measured implementation, which reads
    // the annotation behind `if (this.isPunct(":"))`
    // (src/parser/theta-document.ts:2477–2486).
    const path = "docs/reference/grammar.md";
    const section = fnDeclarationsSection(corpus(`../${path}`), path);
    expect(
      fnParamRhs(section, path),
      `${path} — route 2 relaxes the normative production to match the shipped parser; bug 0150 §Fix route 2`,
    ).toBe(RELAXED_RHS);
    expect(
      fnParamRhs(section, path),
      `${path} — the mandatory form is what bug 0150 §Reproduction (A) A1 falsifies: \`fn h(p): number { 1 }\` reports [] and registers`,
    ).not.toBe(MANDATORY_RHS);
  });

  it("a2: docs/spec_topics/grammar.md's `FnParam` production reads `Ident (\":\" Type)?`", () => {
    // docs/spec_topics/grammar.md:3 declares the appendix "normative for the
    // productions it covers". Same edit, same reason; both mirrors move
    // together or the corpus contradicts itself.
    const path = "docs/spec_topics/grammar.md";
    const section = fnDeclarationsSection(corpus(`../${path}`), path);
    expect(
      fnParamRhs(section, path),
      `${path} — the second normative mirror moves with the first; bug 0150 §Fix route 2`,
    ).toBe(RELAXED_RHS);
    expect(
      fnParamRhs(section, path),
      `${path} — the mandatory form is falsified by the shipped parser at src/parser/theta-document.ts:2477–2486`,
    ).not.toBe(MANDATORY_RHS);
  });

  it("a3: docs/spec_topics/grammar.md's `fn` prose drops the mandatory-pair sentence and states the optionality", () => {
    // The prose restatement is the third normative statement of the same rule
    // (docs/spec_topics/grammar.md:143). Relaxing the production and leaving
    // the sentence would leave the page self-contradicting.
    const path = "docs/spec_topics/grammar.md";
    const section = flat(fnDeclarationsSection(corpus(`../${path}`), path));
    expectNoPhrase(
      section,
      MANDATORY_SENTENCE,
      `${path}:143 still carries ${JSON.stringify(MANDATORY_SENTENCE)} — route 2 rewrites this sentence; leaving it makes the relaxed production dead letter`,
    );
    expectPhrase(
      section,
      OPTIONALITY_PHRASE,
      `${path}:143 must state the parameter annotation's optionality with the phrase ${JSON.stringify(OPTIONALITY_PHRASE)} (this file's header states the pinned wording)`,
    );
  });

  it("a4: docs/reference/grammar.md's `fn` prose states the parameter annotation's optionality", () => {
    // This paragraph (docs/reference/grammar.md:311–326) names the
    // parenthesisation rule, the trailing comma, the two structural refusal
    // codes, the no-default rule, `mut`, and `: ReturnType`'s optionality
    // (`:322`); the parameter annotation's optionality belongs beside them at
    // `:315–316`, because a paragraph silent on it reads as the production's
    // mandatory form however the fence is spelled.
    const path = "docs/reference/grammar.md";
    const section = flat(fnDeclarationsSection(corpus(`../${path}`), path));
    expectPhrase(
      section,
      OPTIONALITY_PHRASE,
      `${path}:311–326 must state the parameter annotation's optionality with the phrase ${JSON.stringify(OPTIONALITY_PHRASE)}`,
    );
  });

  it("a5: both type-system pages carry the typing rule the admitted shape needs", () => {
    // §Fix route 2's own constraint: the relaxation "must supply the typing
    // rule the shape currently lacks, and the obvious one does not fit". The
    // unresolvable-operand deferral (docs/spec_topics/type-system.md:48,
    // mirror docs/reference/type-system.md:65–75) names the runtime AJV check
    // as the safety net; the `theta/parse/fn-arg-type-mismatch` row states
    // that for a `fn` call no such net applies
    // (docs/spec_topics/diagnostics/code-registry-parse.md:135). §Reproduction
    // (B) B1 measures the parse-time silence and §Reproduction (C) C2 measures
    // the runtime consequence, so the corpus is admitting a parameter whose
    // argument is judged at neither phase and must say so on BOTH pages —
    // the reference mirror is not optional.
    for (const path of ["docs/spec_topics/type-system.md", "docs/reference/type-system.md"]) {
      const page = flat(corpus(`../${path}`));
      expectPhrase(
        page,
        NEITHER_PHASE_PHRASE,
        `${path} must state the typing rule for an unannotated \`fn\` parameter, with the phrase ${JSON.stringify(NEITHER_PHASE_PHRASE)}`,
      );
      expectPhrase(
        page,
        NO_AJV_PHRASE,
        `${path} must state WHY the unresolvable-operand deferral's safety net does not cover this position, with the phrase ${JSON.stringify(NO_AJV_PHRASE)} (docs/spec_topics/diagnostics/code-registry-parse.md:135)`,
      );
    }
  });
});

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
 * filled (DIAG-4, docs/spec_topics/diagnostics/diagnostic-shape.md:74). Row
 * definedness and placeholder presence are asserted first, so a missing or
 * re-worded row reds by naming the registry rather than by a bare `undefined`
 * comparison. Route 2 touches no row; these reads are what proves it.
 */
function msg(code: string, fills: ReadonlyArray<readonly [string, string]> = []): string {
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

/** Bug 0139's row (0.79.0) — fires on the parameter NAME, not the annotation. */
const CASE = "theta/parse/binding-case-mismatch";
/** Bug 0225's row (0.168.0) — the `Ident` half, a 0150 §Non-goal. */
const NOTID = "theta/parse/fn-param-not-identifier";
/** The row the empty annotation silently switches off (0150's title claim). */
const FN_ARG = "theta/parse/fn-arg-type-mismatch";
/** Bug 0131's row (arm (2)) — fires on B3's missing argument, not the annotation. */
const TOO_FEW = "theta/parse/fn-arity-too-few";
/** A body-side sink that the withheld binder defers (§Reproduction B8/B9). */
const UNKNOWN_METHOD = "theta/parse/unknown-method";

// ===========================================================================
// Parse harness — the shape tests/fn-param-not-identifier.test.ts uses.
// ===========================================================================
//
// `parseDoc` (tests/helpers/e2e-s1.ts:39) is the shipped whole-file entry point
// `parseThetaDocument` wrapped in the standard inert deps — an in-band no-op
// system-note channel and a resolving `model:` matcher. No behaviour is
// stubbed: the lexer and parser under assertion are the production ones.

/** Frontmatter for every row — occupies lines 1–3, so body line 1 is file line 4. */
const FM = "---\nmode: prompt\n---\n";

/** Parse `body` under the standard frontmatter, at `path` (default `.theta`). */
function theta(body: string, path = "test.theta"): ThetaDocument {
  return parseDoc(FM + body, path);
}

/** One diagnostic reduced to its structural triple — severity, code, span. */
interface Triple {
  readonly severity: string;
  readonly code: string;
  readonly at: string;
}

/** `l:c-l:c`, 1-indexed, end-column exclusive; `-` for an unlocated diagnostic. */
function at(r: SourceRange | undefined): string {
  return r === undefined
    ? "-"
    : `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
}

/** The structural triples of every diagnostic, in report order. */
function triples(doc: ThetaDocument): Triple[] {
  return doc.diagnostics.map((d: Diagnostic) => ({
    severity: d.severity,
    code: d.code,
    at: at(d.range),
  }));
}

/** An expected structural triple (severity is `error` for every row here). */
function e(code: string, span: string): Triple {
  return { severity: "error", code, at: span };
}

/** One diagnostic reduced to the full quadruple, message included. */
interface Quad extends Triple {
  readonly message: string;
}

/** The full quadruples of every diagnostic, in report order. */
function quads(doc: ThetaDocument): Quad[] {
  return doc.diagnostics.map((d: Diagnostic) => ({
    severity: d.severity,
    code: d.code,
    at: at(d.range),
    message: d.message,
  }));
}

/** An expected quadruple whose message is read from the registry (DIAG-4). */
function q(
  code: string,
  span: string,
  fills: ReadonlyArray<readonly [string, string]> = [],
): Quad {
  return { severity: "error", code, at: span, message: msg(code, fills) };
}

/** Every diagnostic rendered for a failure payload. */
function render(doc: ThetaDocument): string {
  return JSON.stringify(quads(doc));
}

/**
 * The single `fn` declaration of `doc`. Presence and uniqueness are asserted
 * before the read, so a row whose declaration vanished reds by naming that
 * rather than by dereferencing `undefined`.
 */
function fnOf(doc: ThetaDocument): FnDecl {
  const decls = doc.body.statements.filter((s) => s.kind === "fn") as FnDecl[];
  expect(
    decls.length,
    `exactly one \`fn\` declaration is expected; statements=${JSON.stringify(topKinds(doc))}`,
  ).toBe(1);
  const only = decls[0];
  if (only === undefined) {
    throw new Error(`no \`fn\` declaration to read; diagnostics=${render(doc)}`);
  }
  return only;
}

/** The recorded `{name, type}` parameter pairs of the single `fn`. */
function paramsOf(doc: ThetaDocument): FnParam[] {
  return fnOf(doc).params.map((p) => ({ name: p.name, type: p.type }));
}

/** The top-level statement kinds, in source order — `doc.body.statements`. */
function topKinds(doc: ThetaDocument): string[] {
  return doc.body.statements.map((s) => s.kind);
}

/**
 * The composition root's own registration gate, replicated: an
 * `error`-severity diagnostic whose code starts `theta/load/` or
 * `theta/parse/` denies registration (`hasLoadParseError`,
 * src/extension/production-composition.ts; the call site that drops
 * the document is `parseDiscoveredTheta`).
 */
function registered(doc: ThetaDocument): boolean {
  return !doc.diagnostics.some(
    (d: Diagnostic) =>
      d.severity === "error" &&
      (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")),
  );
}

// ===========================================================================
// (b) The behaviour locks — route 2 changes nothing, and a later fix that
// re-enforces the production must flip a NAMED cell here.
// ===========================================================================

describe("0150 (b) — the admitted shape's measured bytes, pinned so re-enforcement cannot be silent", () => {
  it("A1: `fn h(p): number { 1 }` — the pin: zero diagnostics, `type: \"\"`, registers", () => {
    // THE PIN. One normative production violated at HEAD, nothing reported,
    // the theta registers. Under route 2 the production is what moves, so this
    // row is CORRECT and stays byte-identical; a later route-1 fix reds here
    // first, which is the point of the cell.
    const doc = theta("fn h(p): number { 1 }\n");
    expect(
      triples(doc),
      `route 2 blesses the unannotated parameter; diagnostics=${render(doc)}`,
    ).toEqual([]);
    expect(
      paramsOf(doc),
      "the guarded annotation read initialises `pType` to the empty string (src/parser/theta-document.ts:2477–2486)",
    ).toEqual([{ name: "p", type: "" }]);
    expect(
      registered(doc),
      `no error-severity theta/parse/* diagnostic, so hasLoadParseError admits it; diagnostics=${render(doc)}`,
    ).toBe(true);
  });

  it("A3: `fn h(p) { 1 }` — no return annotation either", () => {
    // `(":" ReturnType)?` is already optional on both pages; this row shows the
    // two optional slots compose with no diagnostic on either.
    const doc = theta("fn h(p) { 1 }\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([]);
    expect(paramsOf(doc)).toEqual([{ name: "p", type: "" }]);
    expect(registered(doc)).toBe(true);
  });

  it("A4: `fn h(p, q): number { 1 }` — every parameter unannotated", () => {
    const doc = theta("fn h(p, q): number { 1 }\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([]);
    expect(paramsOf(doc)).toEqual([
      { name: "p", type: "" },
      { name: "q", type: "" },
    ]);
    expect(registered(doc)).toBe(true);
  });

  it("A5: `fn h(a: string, b): number { 1 }` — the leniency is per-parameter", () => {
    // The relaxation route 2 writes is on `FnParam`, not on `FnParams`, so a
    // mixed list is exactly one annotated and one unannotated `FnParam` — this
    // row is what makes that reading observable.
    const doc = theta("fn h(a: string, b): number { 1 }\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([]);
    expect(paramsOf(doc)).toEqual([
      { name: "a", type: "string" },
      { name: "b", type: "" },
    ]);
    expect(registered(doc)).toBe(true);
  });

  it("A6: `fn h(p,): number { 1 }` — trailing comma plus no annotation", () => {
    // `FnParams ::= FnParam ("," FnParam)* ","?` (docs/spec_topics/grammar.md:139
    // / docs/reference/grammar.md:307) admits the trailing comma; the relaxed
    // `FnParam` admits the missing annotation. Both at once.
    const doc = theta("fn h(p,): number { 1 }\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([]);
    expect(paramsOf(doc)).toEqual([{ name: "p", type: "" }]);
    expect(registered(doc)).toBe(true);
  });

  it("A7: ``subagent fn s(p) { @`hi` }`` — the `subagent` modifier changes nothing", () => {
    // 0150 §Fix shared constraint 4: the `subagent fn` form reaches the same
    // `parseFn` loop, so route 2's relaxation covers it without a second
    // sentence.
    const doc = theta("subagent fn s(p) { @`hi` }\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([]);
    expect(paramsOf(doc)).toEqual([{ name: "p", type: "" }]);
    expect(registered(doc)).toBe(true);
  });

  it("A9: `fn h(p): string { p }` called with an argument, the body reading `p`", () => {
    // The body READS the unannotated parameter and a call site supplies an
    // argument; neither introduces a diagnostic. `walkFn` records the
    // parameter as a withheld binder (src/parser/type-layer-checks.ts:1801–1815)
    // and every sink that reads the scope map defers on that value.
    const doc = theta('fn h(p): string { p }\nlet z = h("a")\nz\n');
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([]);
    expect(paramsOf(doc)).toEqual([{ name: "p", type: "" }]);
    expect(
      topKinds(doc),
      `the call site is a top-level \`let\`; the trailing \`z\` is the body's tail expression, not a statement; statements=${JSON.stringify(topKinds(doc))}`,
    ).toEqual(["fn", "let"]);
    expect(registered(doc)).toBe(true);
  });

  it("A10: the `.thetalib` route — `fn t(p): string { p }`, no frontmatter", () => {
    // 0150 §Fix shared constraint 4's other half. A library file has no
    // frontmatter, so body line 1 is file line 1; the parse path into `parseFn`
    // is the same one.
    const doc = parseDoc("fn t(p): string { p }\n", "lib.thetalib");
    expect(
      triples(doc),
      `the .thetalib route reaches the same parseFn loop; diagnostics=${render(doc)}`,
    ).toEqual([]);
    expect(paramsOf(doc)).toEqual([{ name: "p", type: "" }]);
  });

  it("A15: `fn h(p): number { 1 }` + `let z = h(\"a\")` + `z` — a string into an unjudged slot", () => {
    // The argument's type is irrelevant because there is no declared parameter
    // type to judge it against: `annotationToCompatType("")` is `undefined`
    // (src/parser/type-layer-checks.ts:881–884) and `checkFnCallArgs` skips the
    // slot (`:2188`).
    const doc = theta('fn h(p): number { 1 }\nlet z = h("a")\nz\n');
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([]);
    expect(paramsOf(doc)).toEqual([{ name: "p", type: "" }]);
    expect(registered(doc)).toBe(true);
  });

  it("A16: `fn h(_): number { 1 }` — the `_` discard, equally unannotated", () => {
    // `_` is an admitted lowercase-first identifier
    // (docs/spec_topics/lexical.md:13, `:16`), so bug 0139's case rule is
    // silent and this row isolates the annotation slot alone.
    const doc = theta("fn h(_): number { 1 }\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([]);
    expect(paramsOf(doc)).toEqual([{ name: "_", type: "" }]);
    expect(registered(doc)).toBe(true);
  });

  it("A8 (control): `fn h(p: string): number { 1 }` keeps its bytes", () => {
    // 0150 §Fix shared constraint 2: the conformant spelling is clean and
    // registers under BOTH readings, so it is the cell that catches a fix which
    // reports on the annotated form by accident.
    const doc = theta("fn h(p: string): number { 1 }\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([]);
    expect(paramsOf(doc)).toEqual([{ name: "p", type: "string" }]);
    expect(registered(doc)).toBe(true);
  });

  it("A12 (control): `fn h(): number { 1 }` — the empty list keeps its bytes", () => {
    // `FnParams?` is optional in `FnDecl` itself
    // (docs/spec_topics/grammar.md:138 / docs/reference/grammar.md:301), so a
    // zero-parameter declaration is outside the relaxation entirely.
    const doc = theta("fn h(): number { 1 }\n");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([]);
    expect(paramsOf(doc)).toEqual([]);
    expect(registered(doc)).toBe(true);
  });

  it("A2: `fn h(P): number { 1 }` — bug 0139's code ALONE, ordered whole list", () => {
    // 0150 §Fix shared constraint 1. The case rule reads the NAME
    // (src/parser/theta-document.ts:2465–2475, `isUpper` on the first
    // character) and the annotation slot is the next statement in the same
    // loop (`:2477`). The whole list is asserted in emission order, so a
    // re-enforcement that appends a second code here is observable AS a second
    // code rather than as a filtered pass.
    const doc = theta("fn h(P): number { 1 }\n");
    expect(
      triples(doc),
      `bug 0139's emission is untouched by route 2 and no second code joins it; diagnostics=${render(doc)}`,
    ).toEqual([e(CASE, "4:6-4:7")]);
    expect(quads(doc), "DIAG-4 — the rendered prose is the registry's Message column").toEqual([
      q(CASE, "4:6-4:7"),
    ]);
    expect(paramsOf(doc)).toEqual([{ name: "P", type: "" }]);
    expect(
      registered(doc),
      `bug 0139's code is error-severity theta/parse/*, so this row does NOT register; diagnostics=${render(doc)}`,
    ).toBe(false);
  });

  it("A11: `fn h(a: string, B): number { 1 }` — bug 0139's code on the SECOND parameter, ordered whole list", () => {
    const doc = theta("fn h(a: string, B): number { 1 }\n");
    expect(
      triples(doc),
      `the case rule is per-parameter and the annotation slot is not judged; diagnostics=${render(doc)}`,
    ).toEqual([e(CASE, "4:17-4:18")]);
    expect(quads(doc)).toEqual([q(CASE, "4:17-4:18")]);
    expect(paramsOf(doc)).toEqual([
      { name: "a", type: "string" },
      { name: "B", type: "" },
    ]);
    expect(registered(doc)).toBe(false);
  });

  it("A13 (boundary): `fn h(p:): number { 1 }` — the empty capture, bug 0124's shipped decision", () => {
    // NOT blessed by route 2: `Ident (":" Type)?` admits no `:` without a
    // `Type`. It is pinned because the AST state is byte-identical to A1 —
    // `FnParam.type` is a plain `string`, so "no annotation was written" and
    // "an annotation was written and captured empty" are one state — and
    // because bug 0124's `## Fix (0.121.0)` decision 3 dispositioned the empty
    // annotation as LEFT AS IT IS, stated in the row's *Trigger*
    // (docs/bugs/0124-parsetype-trailing-punctuation-leniency.md). That is a
    // shipped decision, not an accident, so this cell records it rather than
    // claiming it.
    const doc = theta("fn h(p:): number { 1 }\n");
    expect(
      triples(doc),
      `bug 0124's shipped decision 3 leaves the empty capture as it is; diagnostics=${render(doc)}`,
    ).toEqual([]);
    expect(paramsOf(doc)).toEqual([{ name: "p", type: "" }]);
    expect(registered(doc)).toBe(true);
  });

  it("A14 (boundary): `fn h(3): number { 1 }` — the `Ident` half, refused by bug 0225's narrow predicate", () => {
    // 0150 §Non-goals disclaims this class in terms. Bug 0225's
    // `## Fix (0.168.0)` decision 1 refuses a parameter-name-position token
    // whose `kind` is neither `"ident"` nor `"keyword"` — a `number` token is
    // one — through `theta/parse/fn-param-not-identifier`, and decision 1
    // states explicitly that an annotation-less legal `Ident` is NOT refused,
    // which is why A1 above is still silent. This cell pins the neighbouring
    // boundary so route 2's relaxation is not read as covering it: the FILED
    // table recorded `[]` and `registers=true` here, and that row is now stale.
    const doc = theta("fn h(3): number { 1 }\n");
    expect(
      triples(doc),
      `bug 0225's narrow predicate refuses the non-\`Ident\` name and leaves 0150's class alone; diagnostics=${render(doc)}`,
    ).toEqual([e(NOTID, "4:6-4:7")]);
    expect(quads(doc)).toEqual([q(NOTID, "4:6-4:7")]);
    expect(paramsOf(doc)).toEqual([{ name: "3", type: "" }]);
    expect(registered(doc)).toBe(false);
  });
});

// ===========================================================================
// (c) The type-layer verdicts do not move — 0150 §Fix shared constraint 3.
// ===========================================================================

describe("0150 (c) — every type-layer verdict keeps its exact bytes under route 2", () => {
  it("B1: `fn g(x): string { x }` + `let q = g(1)` + `q` is silent", () => {
    // The measure the report is named for. The argument `1` reaches a
    // parameter whose annotated twin declares `string`, and nothing is
    // reported: `checkFnCallArgs` has no declared type to judge against
    // (src/parser/type-layer-checks.ts:2188). Correct GIVEN the shape —
    // which is what route 2 blesses — so this cell locks the silence rather
    // than claiming it as a defect.
    const doc = theta('fn g(x): string { x }\nlet q = g(1)\nq\n');
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([]);
    expect(paramsOf(doc)).toEqual([{ name: "x", type: "" }]);
    expect(registered(doc)).toBe(true);
  });

  it("B2 (control): the annotated twin still reports `theta/parse/fn-arg-type-mismatch`", () => {
    // One token restores the check. 0150 §Fix shared constraint 3: a route
    // that changes THIS row has reached `walkFn` or `checkFnCallArgs` and must
    // not. Message from the registry (DIAG-4), placeholders filled in the
    // template's own order.
    const doc = theta('fn g(x: string): string { x }\nlet q = g(1)\nq\n');
    expect(
      triples(doc),
      `the annotated control's verdict is untouched by route 2; diagnostics=${render(doc)}`,
    ).toEqual([e(FN_ARG, "5:11-5:12")]);
    expect(quads(doc)).toEqual([
      q(FN_ARG, "5:11-5:12", [
        ["<name>", "g"],
        ["<i>", "0"],
        ["<param>", "x"],
        ["<expected>", "string"],
        ["<actual>", "integer"],
      ]),
    ]);
    expect(registered(doc)).toBe(false);
  });

  it("B3: `fn g(x): string { x }` + `let q = g()` + `q` draws bug 0131's arity row, not silence", () => {
    // The missing ARGUMENT, not the missing annotation. This cell's silence WAS
    // bug 0131's own unchecked-arity defect; bug 0131's fix mints
    // `theta/parse/fn-arity-too-few` at exactly this call-expression range, so
    // the correct contract is now a single arity diagnostic here, not `[]` —
    // route 2 (this file's own subject, the unannotated-parameter relaxation)
    // still contributes nothing beside it.
    const doc = theta("fn g(x): string { x }\nlet q = g()\nq\n");
    expect(
      triples(doc),
      `bug 0131's arity row now fires here; diagnostics=${render(doc)}`,
    ).toEqual([e(TOO_FEW, "5:9-5:12")]);
    expect(quads(doc)).toEqual([
      q(TOO_FEW, "5:9-5:12", [
        ["<name>", "g"],
        ["<required>", "1"],
        ["<provided>", "0"],
      ]),
    ]);
    expect(registered(doc)).toBe(false);
  });

  it("B8: `fn g(x): string { x.join(\",\") }` + `g(\"a\")` is silent", () => {
    // A body-side sink. `walkFn` seeds the unannotated parameter WITHHELD
    // (src/parser/type-layer-checks.ts:1801–1815,
    // `WITHHELD_BINDER_TYPE_NAME` at `src/parser/type-compat.ts:938`), and the
    // method-receiver check defers through `containsWithheldBinderType`
    // (`:417`).
    const doc = theta('fn g(x): string { x.join(",") }\ng("a")\n');
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([]);
    expect(paramsOf(doc)).toEqual([{ name: "x", type: "" }]);
    expect(registered(doc)).toBe(true);
  });

  it("B9 (control): the annotated twin still reports `theta/parse/unknown-method`", () => {
    const doc = theta('fn g(x: string): string { x.join(",") }\ng("a")\n');
    expect(
      triples(doc),
      `the annotated control's body-side verdict is untouched by route 2; diagnostics=${render(doc)}`,
    ).toEqual([e(UNKNOWN_METHOD, "4:27-4:38")]);
    expect(quads(doc)).toEqual([
      q(UNKNOWN_METHOD, "4:27-4:38", [
        ["<method>", "join"],
        ["<type>", "string"],
      ]),
    ]);
    expect(registered(doc)).toBe(false);
  });
});
