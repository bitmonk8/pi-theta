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
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type { ThetaDocument } from "../src/parser/theta-document";
import {
  checkCompatible,
  type CompatType,
  type TypeEnv,
} from "../src/parser/type-compat";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0144 — the ADJUDICATION of what an unresolvable operand is owed at a
// STRUCTURAL target, written into the corpus
// (docs/bugs/0144-annotated-unresolvable-arg-structural-param-emits.md).
//
// WHAT MOVED, AND WHAT DID NOT. The report's original §Symptom (an
// `E`-severity `theta/parse/fn-arg-type-mismatch … expected array<integer>, got
// Zz` for `fn g(xs: array<integer>)` + `let v: Zz = [1]` + `g(v)`) INVERTED at
// 0.104.0: bug 0179 reordered `decide`'s TYPE-7 arm so an unresolvable `named`
// sub answers `"unknown"` before the non-`array` short-circuit
// (src/parser/type-compat.ts:218–226, the escape at :219–221; the TYPE-8 arm
// carries the twin escape at :246–248). Re-derived at this HEAD, every row of
// the report's groups (a), (b), (d-let), (e) and the ctor-field sink reads
// clean. `src/` is therefore NOT touched by this fix; what remains open — and
// what this file witnesses — is the CORPUS-LEVEL adjudication the report was
// filed to pin, plus the behaviour pins that make a re-inserted arm red.
//
// THE ADJUDICATION (READING B of the report's §Expected behaviour), and its
// basis. Bug 0155's LANDED *Trigger*-fidelity law
// (docs/bugs/0155-ternary-common-type-unenforced-trigger-conflict.md,
// `## Fix (0.174.0)`, "THE STATED LAW") governs, verbatim:
//
//   > A registered *Trigger* is the normative statement of a code's emission
//   > set (DIAG-2). Where a rule page's scope exceeds the registered *Trigger*
//   > of the code it names, the *Trigger* governs and the rule page is
//   > corrected in the same commit; no implementation may be wired to emit a
//   > code outside its registered *Trigger*. Narrowing an emission set ONTO its
//   > registered *Trigger* needs no registry edit (the 0084/0139 posture), but
//   > where the *Trigger*'s TEXT presupposes the wider reading, that text is
//   > corrected in the same commit as the narrowing.
//
// `theta/parse/fn-arg-type-mismatch`'s registered *Trigger*
// (docs/spec_topics/diagnostics/code-registry-parse.md:136) requires an
// argument "whose static type is not compatible with the matched parameter's
// declared type" — a POSITIVE `T₁ ⋢ T₂` verdict. An operand past the parser's
// static view reaches no such verdict (the relation answers `"unknown"`, not
// `"incompatible"`), so the unresolvable-operand case is OUTSIDE the registered
// *Trigger*. `docs/spec_topics/type-system.md:31`'s closed-list preamble claims
// a wider emission set; under THE STATED LAW the *Trigger* governs and the page
// is corrected in the same commit. The skip is unconditional on the TARGET's
// kind (structural targets included) AND unconditional on whether the position
// documents a runtime AJV net of its own — emitting where the relation reached
// no verdict would emit outside the registered *Trigger*, which DIAG-2
// (docs/spec_topics/diagnostics/diagnostic-shape.md:72) forbids.
//
// BOUNDARY, held deliberately. Gates that are NOT `⊑` checks are outside this
// adjudication because they are not on the check-site list at
// docs/spec_topics/type-system.md:27: `join`'s ELEMENT precondition (the
// subject of open bug 0127) and the `for` iterand's `array<T>` precondition.
// Group (C) pins both and they must NOT be "fixed" here.
//
// AGREEMENT with bug 0163: `theta/parse/params-default-type-mismatch`'s
// *Trigger* (docs/spec_topics/diagnostics/code-registry-parse.md:53) documents
// the runtime AJV net for its own unresolvable-operand deferrals, which
// satisfies :31's "unless the position is one where a runtime AJV check is
// documented as the safety net" clause AT THAT POSITION. That clause stays
// intact; this file asserts nothing that would remove it.
//
// SPEC-ANCHORS (each re-derived against the tree at the time of writing):
//   - docs/spec_topics/type-system.md:27 — the `⊑` check-site enumeration,
//     which names "a function-argument slot", the typed-`let` RHS and "a
//     schema-constructor field value against its declared field type", and does
//     NOT name the `for` iterand or `join`'s element.
//   - :31 — the closed-list preamble ("The list is closed for V1 — anything
//     outside it that the parser cannot decide statically is reported as a type
//     mismatch … unless the position is one where a runtime AJV check is
//     documented as the safety net"). Prose edit 1's site.
//   - :48 — **Unresolvable operands.**, the governing paragraph. Prose edit 2's
//     site.
//   - :50 — **Absent operands.**, which already scopes the fn-argument
//     position's "no runtime AJV safety net applies" claim to the
//     unresolvable-CALLEE case ("no call to one is ever the unresolvable-callee
//     case a runtime check would cover"). Prose edit 3 mirrors that scoping
//     into the registry row.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:136 — the
//     `theta/parse/fn-arg-type-mismatch` row (Trigger + Message; `E`); :59 —
//     the `theta/parse/let-rhs-type-mismatch` row, whose *Trigger* ALREADY
//     carries "where the RHS type is statically resolvable" and is the model
//     for prose edit 3; :70 — `theta/parse/non-array-iterand`, group (C)'s
//     oracle; :53 — `theta/parse/params-default-type-mismatch` (bug 0163's
//     row, untouched).
//   - docs/reference/type-system.md:65 — the mirror's **Unresolvable
//     operands.** paragraph. Prose edit 4's site. (docs/reference/diagnostics.md
//     has no *Trigger* column and is NOT edited.)
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:72 — DIAG-2, the closed
//     registry and the same-commit *Trigger* rule; :74 — DIAG-4, the normative
//     *Message* column, which is this file's message oracle.
//   - src/parser/type-compat.ts:139 (`checkCompatible`), :218–226 (the TYPE-7
//     arm and its unresolvable-`named` escape at :219–221), :246–248 (the
//     TYPE-8 twin), :429 (`checkLetRhsCompat`), :478 (`checkFnArgCompat`).
//   - src/extension/production-composition.ts:2220–2227 (`hasLoadParseError`) —
//     why an `E`-severity parse code denies registration, i.e. why the group
//     (B) silences are the difference between a theta that loads and one that
//     does not.
//
// CELL GROUPS.
//   (A) CORPUS CONFORMANCE — RED until the four prose edits land. One cell per
//       edited file plus two green controls (the registered *Trigger*'s
//       positive-verdict wording, and the sibling `let`-RHS row's existing
//       qualifier) that establish the basis the red cells are measured against.
//   (B) BEHAVIOUR PINS — green at this HEAD. The whole aggregated diagnostic
//       list, unfiltered, for every row of the report's §Reproduction that the
//       adjudication ratifies, plus the two refusal controls that must NOT be
//       coarsened (a5, b11).
//   (C) BOUNDARY PINS — d4 and d5, the non-`⊑` gates. Bug 0127 is OPEN and owns
//       them; this adjudication does not reach them.
//   (D) SHAPE INVARIANCE — the row the report's §Fix requires that no
//       §Reproduction group supplies: an unresolvable `named` source answers the
//       SAME verdict against EVERY target shape. Driven through the real
//       `checkCompatible` over an enumerated target-shape list rather than
//       through `parseDoc`, because the relation — not any one sink's wiring —
//       is what an inserted arm would move, and the enumeration can then cover
//       shapes (a bare inline `object` `CompatType`) that no theta annotation
//       currently mints (the report's §Affected records that `kind: "object"`
//       has no construction site in `src/`).
//   (E) RUNTIME — f2, the measurement the old emission contradicted: the body
//       parses clean AND the parameter binds `[1]`.
//   (F) GOV-15 corpus sweep — NOT duplicated here. tests/committed-fixture-parse-gate.test.ts
//       already parses every tracked `.theta`/`.thetalib` through the shipped
//       `parseThetaDocument` and is green at this HEAD; a second copy of that
//       sweep in this file would add no observable and a second maintenance
//       site. Cited, not repeated.
//
// TIER — unit, offline, provider-free, deterministic. Every group (A) cell is a
// `readFileSync` of the corpus; every (B)/(C) cell settles inside one
// `parseThetaDocument` call; (D) calls the relation directly; (E) adds only the
// in-process production prompt-mode binding. Nothing here crosses a provider, a
// model, a child process or the network, so an integration tier would add a
// session round-trip to a parse-time observable and a live tier would make a
// fully determined observable stochastic. The report says the same in its own
// §Fix ("No live tier applies: nothing on this path crosses a provider").
//
// NO SILENT SKIPPING (CLAUDE.md / AGENTS.md). Nothing early-returns or branches
// on the environment. Every corpus anchor throws BY NAME when absent, so a
// restructured page fails loudly instead of asserting over an empty slice;
// every expected message is interpolated from the live registry through
// {@link registered}/{@link interpolate}, which throw naming the unmet
// precondition when a row or a placeholder is missing.

// ===========================================================================
// Corpus readers and the DIAG-4 message oracle.
// ===========================================================================

function corpus(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
}

const TYPE_SYSTEM_PAGE = "docs/spec_topics/type-system.md";
const TYPE_SYSTEM_MIRROR = "docs/reference/type-system.md";
const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

const FN_ARG_CODE = "theta/parse/fn-arg-type-mismatch";
const LET_RHS_CODE = "theta/parse/let-rhs-type-mismatch";
const ITERAND_CODE = "theta/parse/non-array-iterand";

interface RegistryRow {
  readonly code: string;
  readonly trigger: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(corpus(REGISTRY_PAGE)) as RegistryRow[];

/** A registered row. Fails LOUDLY naming the unmet precondition when absent. */
function row(code: string): RegistryRow {
  const found = REGISTRY.find((r) => r.code === code);
  if (found === undefined) {
    throw new Error(
      `harness: ${REGISTRY_PAGE} carries no row for ${code} — the *Trigger* (DIAG-2) and *Message* (DIAG-4) columns are this file's oracles, so a missing row is a harness failure, never a skip`,
    );
  }
  return found;
}

/** The registered *Message* template for `code`. */
function registered(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: ${REGISTRY_PAGE} carries no Message column for ${code} — DIAG-4 makes it this file's oracle, so a missing template is a harness failure, never a skip`,
    );
  }
  return template;
}

/** Fill `slots` into `code`'s registered template; every placeholder required. */
function interpolate(code: string, slots: Readonly<Record<string, string>>): string {
  let message = registered(code);
  for (const [slot, value] of Object.entries(slots)) {
    if (!message.includes(slot)) {
      throw new Error(
        `harness: the registered Message for ${code} does not spell ${slot} — this file interpolates it, so an absent placeholder is a harness failure, never a skip. Template: ${message}`,
      );
    }
    message = message.replace(slot, value);
  }
  return message;
}

function fnArgMismatch(
  name: string,
  index: number,
  param: string,
  expected: string,
  actual: string,
): string {
  return `error ${FN_ARG_CODE}: ${interpolate(FN_ARG_CODE, {
    "<name>": name,
    "<i>": String(index),
    "<param>": param,
    "<expected>": expected,
    "<actual>": actual,
  })}`;
}

function iterandRefusal(type: string): string {
  return `error ${ITERAND_CODE}: ${interpolate(ITERAND_CODE, { "<type>": type })}`;
}

/**
 * The text between `startAnchor` and the next `endPattern` (or end of file). A
 * missing anchor throws naming the page and the anchor: the extraction is what
 * scopes an assertion to one paragraph, so a silently-empty slice would turn a
 * conformance cell into a vacuous pass.
 */
function sliceFrom(
  page: string,
  text: string,
  startAnchor: string,
  endPattern: RegExp,
): string {
  const start = text.indexOf(startAnchor);
  if (start < 0) {
    throw new Error(
      `harness: ${page} no longer contains the anchor ${JSON.stringify(startAnchor)}, so this cell cannot locate the paragraph it governs — re-anchor the cell rather than letting it pass over an empty slice`,
    );
  }
  const rest = text.slice(start);
  const end = rest.slice(startAnchor.length).search(endPattern);
  return end < 0 ? rest : rest.slice(0, startAnchor.length + end);
}

/** Assert `slice` carries every required phrase, naming the file and the gap. */
function requirePhrases(
  page: string,
  slice: string,
  phrases: readonly string[],
  disposition: string,
): void {
  for (const phrase of phrases) {
    expect(
      slice,
      `${page} does not state the adjudicated disposition — ${disposition}\n  missing phrase: ${JSON.stringify(phrase)}\n  paragraph as it stands: ${JSON.stringify(slice)}`,
    ).toContain(phrase);
  }
}

// ===========================================================================
// Parse harness — the house driver (tests/helpers/e2e-s1.ts:39) over the
// shipped `parseThetaDocument`, frontmatter + a trailing final value.
// ===========================================================================

const FM = "---\nmode: prompt\n---\n";

/** `severity code: message` for EVERY diagnostic, in emission order. */
function lines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

function parse(body: string): ThetaDocument {
  return parseDoc(FM + body, "bug0144.theta");
}

/** A row that must draw NOTHING — the whole unfiltered list, never a subset. */
function expectSilent(body: string, why: string): ThetaDocument {
  const doc = parse(body);
  expect(
    lines(doc),
    `${why}\n  type-system.md:48 skips the parse-time check when either side is past the parser's static view, and this adjudication makes that skip unconditional on the target's kind — so the whole diagnostic list must be empty. An emission here is outside \`${FN_ARG_CODE}\`'s registered *Trigger* (${REGISTRY_PAGE}:136), which DIAG-2 forbids.`,
  ).toEqual([]);
  return doc;
}

/** A row that must keep REFUSING, with exactly `expected` in emission order. */
function expectRefused(body: string, expected: readonly string[], why: string): void {
  const doc = parse(body);
  expect(
    lines(doc),
    `${why}\n  This row is INSIDE the registered *Trigger* — the relation reaches a positive \`T₁ ⋢ T₂\` verdict on operands the parser can see — so the adjudication does not touch it and its bytes must not move.`,
  ).toEqual([...expected]);
}

// ===========================================================================
// Production-executor harness for group (E), the shape
// tests/non-object-receiver-gate.test.ts:221–292 establishes.
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
  const theta: ThetaCompositionInput = {
    slashName: "bug0144",
    sourcePath: "/theta/bug0144.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  return executeBody(theta.body, producer().bindPromptConversation(bindInput).executeDeps);
}

// ===========================================================================
// Fixtures — the report's §Reproduction rows, re-derived at this HEAD.
// ===========================================================================

/** The reported callee: one `array<integer>` parameter. */
const G = "fn g(xs: array<integer>): number { 1 }\n";

// ===========================================================================
// Group (A) — CORPUS CONFORMANCE. RED until the four prose edits land.
// ===========================================================================

describe("bug 0144 (A) — the corpus states the adjudication", () => {
  it("the registered *Trigger* requires a positive incompatibility verdict — the basis control", () => {
    // GREEN control, and the normative basis every red cell below is measured
    // against. Under bug 0155's landed law the *Trigger* governs the emission
    // set; this one is phrased as a POSITIVE verdict about an argument's static
    // type, which an operand past the parser's static view never reaches.
    const trigger = row(FN_ARG_CODE).trigger;
    expect(
      trigger,
      `${REGISTRY_PAGE}:136 — \`${FN_ARG_CODE}\`'s registered *Trigger* must state a positive incompatibility verdict; this cell is the basis of the whole adjudication (DIAG-2). Registered *Trigger*: ${JSON.stringify(trigger)}`,
    ).toContain("whose static type is not compatible with");
  });

  it("the sibling `let`-RHS row already carries the statical-resolvability qualifier — the model control", () => {
    // GREEN control. `theta/parse/let-rhs-type-mismatch`'s *Trigger*
    // (code-registry-parse.md:59) is the shape prose edit 3 gives the fn-arg
    // row. Its presence is what makes the fn-arg row's absence an editing
    // asymmetry rather than a deliberate distinction.
    const trigger = row(LET_RHS_CODE).trigger;
    expect(
      trigger,
      `${REGISTRY_PAGE}:59 — \`${LET_RHS_CODE}\`'s registered *Trigger* is the model for the fn-arg row's qualifier; without it this file's A-cell for the registry has no in-corpus precedent to cite. Registered *Trigger*: ${JSON.stringify(trigger)}`,
    ).toContain("where the RHS type is statically resolvable");
  });

  it("type-system.md's closed-list preamble yields to *Unresolvable operands*", () => {
    // PROSE EDIT 1 (docs/spec_topics/type-system.md:31). The closed-list
    // preamble currently claims that anything the parser "cannot decide
    // statically is reported as a type mismatch", which reads FOR an emission
    // the registered *Trigger* excludes. It gains a trailing sentence giving
    // the *Unresolvable operands* paragraph precedence over that disposition
    // whenever either side is past the parser's static view.
    const text = corpus(TYPE_SYSTEM_PAGE);
    const preamble = sliceFrom(
      TYPE_SYSTEM_PAGE,
      text,
      "**Structural cases the parser must recognise.**",
      /\n/,
    );
    requirePhrases(
      TYPE_SYSTEM_PAGE,
      preamble,
      [
        "Unresolvable operands",
        "takes precedence over the type-mismatch disposition of this sentence when either side is past the parser's static view",
      ],
      "the closed-list preamble must yield to the *Unresolvable operands* paragraph, because an operand past the parser's static view reaches no `T₁ ⋢ T₂` verdict and so falls outside every registered *Trigger* (DIAG-2; bug 0155's landed *Trigger*-governs law)",
    );
  });

  it("type-system.md's *Unresolvable operands* paragraph states the unconditional skip and its boundary", () => {
    // PROSE EDIT 2 (docs/spec_topics/type-system.md:48). Three dispositions:
    //   1. the skip is unconditional on the TARGET's kind — a structural
    //      target skips exactly as a primitive, union or named target does;
    //   2. it is unconditional on whether the position documents a runtime AJV
    //      net of its own — emitting where the relation reached no verdict
    //      would emit outside the code's registered *Trigger*, which DIAG-2
    //      forbids;
    //   3. the BOUNDARY: gates that are not `⊑` checks (the `for` iterand's
    //      `array<T>` precondition, `join`'s element precondition) are not on
    //      the check-site list at :27 and are outside this paragraph. Bug 0127
    //      is OPEN and owns them; group (C) pins both unchanged.
    const text = corpus(TYPE_SYSTEM_PAGE);
    const paragraph = sliceFrom(
      TYPE_SYSTEM_PAGE,
      text,
      "**Unresolvable operands.**",
      /\n/,
    );
    requirePhrases(
      TYPE_SYSTEM_PAGE,
      paragraph,
      [
        "The skip is unconditional on the target's kind",
        "skips exactly as a primitive, union or named target does",
        "unconditional on whether the position documents a runtime AJV net of its own",
        "outside the code's registered *Trigger*",
        "are not compatibility checks and are outside this paragraph",
      ],
      "the *Unresolvable operands* paragraph must state that the skip is unconditional on the target's kind AND on the position having a runtime net of its own, and must bound itself away from the non-`⊑` precondition gates (the `for` iterand, `join`'s element — bug 0127's subject, open)",
    );
  });

  it("the fn-arg registry row's *Trigger* carries the resolvability qualifier and scopes its no-net sentence", () => {
    // PROSE EDIT 3 (docs/spec_topics/diagnostics/code-registry-parse.md:136).
    // The *Trigger* gains the qualifier the sibling `let`-RHS row at :59
    // already carries, and its "so no runtime AJV safety net applies" sentence
    // is scoped to the unresolvable-CALLEE case — the scoping type-system.md:50
    // (*Absent operands*) already states verbatim. DIAG-2 requires the edit in
    // the same commit as any change to the emission set.
    const trigger = row(FN_ARG_CODE).trigger;
    requirePhrases(
      `${REGISTRY_PAGE} (\`${FN_ARG_CODE}\` *Trigger*)`,
      trigger,
      [
        "where the argument type is statically resolvable",
        "is ever the unresolvable-callee case a runtime check would cover",
      ],
      "the fn-arg row's *Trigger* must qualify itself on statical resolvability (matching `theta/parse/let-rhs-type-mismatch`'s at :59) and must scope its no-AJV-net sentence to the unresolvable-callee case, as type-system.md:50 already does for this same position",
    );
  });

  it("the reference mirror's *Unresolvable operands* paragraph carries the same disposition", () => {
    // PROSE EDIT 4 (docs/reference/type-system.md:65), mirror-faithfully.
    // docs/reference/diagnostics.md has no *Trigger* column and is NOT edited,
    // so this is the only mirror this adjudication reaches.
    const text = corpus(TYPE_SYSTEM_MIRROR);
    const paragraph = sliceFrom(
      TYPE_SYSTEM_MIRROR,
      text,
      "**Unresolvable operands.**",
      /\n\n/,
    );
    requirePhrases(
      TYPE_SYSTEM_MIRROR,
      paragraph,
      ["unconditional on the target's kind", "a runtime AJV net of its own"],
      "the mirror must carry the spec page's adjudicated disposition; a mirror that keeps the unqualified skip leaves the corpus stating two readings",
    );
  });
});

// ===========================================================================
// Group (B) — BEHAVIOUR PINS. Green at this HEAD; they red if an arm ahead of
// the resolvability tests is ever re-inserted.
// ===========================================================================

describe("bug 0144 (B) — the adjudicated behaviour at the fn-argument sink", () => {
  it("a1: the reported shape — an unresolvable annotation at an `array<integer>` parameter — draws nothing", () => {
    expectSilent(
      G + "let v: Zz = [1]\nlet r = g(v)\nr\n",
      "a1 — the report's §Symptom row. `Zz` is past the parser's static view, so no `T₁ ⋢ T₂` verdict exists to report",
    );
  });

  it("a3 (control): the same body with `schema Zz = array<integer>` declared draws nothing", () => {
    expectSilent(
      G + "schema Zz = array<integer>\nlet v: Zz = [1]\nlet r = g(v)\nr\n",
      "a3 — the resolvable twin of a1; it isolates the cause to resolvability, and it must stay clean under any route",
    );
  });

  it("a4 (control): a direct fitting literal argument draws nothing", () => {
    expectSilent(
      G + "let r = g([1])\nr\n",
      "a4 — establishes the sink is live and admits a fitting argument",
    );
  });

  it("a5 (control): a resolvable MISTYPED literal argument still refuses", () => {
    // The refusal control. `"a"` is inside the parser's static view, so the
    // relation reaches a positive `string ⋢ array<integer>` verdict — squarely
    // inside the registered *Trigger*. The message is registry-sourced
    // (DIAG-4), so a template drift reds here rather than degrading the cell.
    expectRefused(
      G + 'let r = g("a")\nr\n',
      [fnArgMismatch("g", 0, "xs", "array<integer>", "string")],
      "a5 — a resolvable mistyped literal must keep refusing at `E` severity; the adjudication removes emissions the relation never reached, and adds none",
    );
  });

  it("b2: an ALIAS-of-`array<integer>` parameter draws nothing", () => {
    expectSilent(
      "schema L = array<integer>\nfn g(xs: L): number { 1 }\nlet v: Zz = [1]\nlet r = g(v)\nr\n",
      "b2 — TYPE-11 unfolds `L` to `array<integer>` before the relation runs, so the alias spelling reaches the same structural target and must defer identically",
    );
  });

  it("b3: a primitive `integer` parameter draws nothing", () => {
    expectSilent(
      "fn g(n: integer): number { 1 }\nlet v: Zz = 1\nlet r = g(v)\nr\n",
      "b3 — the primitive target, `type-system.md:48` working; no route may coarsen it",
    );
  });

  it("b5: a `string | array<integer>` union parameter draws nothing", () => {
    expectSilent(
      "fn g(n: string | array<integer>): number { 1 }\nlet v: Zz = [1]\nlet r = g(v)\nr\n",
      "b5 — a union target containing the structural arm; the union arm loop must keep answering `\"unknown\"`",
    );
  });

  it("b7: an UNRESOLVABLE parameter type draws nothing", () => {
    expectSilent(
      "fn g(n: Qq): number { 1 }\nlet v: Zz = [1]\nlet r = g(v)\nr\n",
      "b7 — the same unresolvable name as the TARGET; b7 against a1 is the symmetry the adjudication makes explicit",
    );
  });

  it("b10: an `array<Zz>` parameter with a concrete fitting argument draws nothing", () => {
    expectSilent(
      "fn g(xs: array<Zz>): number { 1 }\nlet r = g([1])\nr\n",
      "b10 — the unresolvable name inside the target's element position; the element recursion must defer, not refuse",
    );
  });

  it("b11 (control): an inline-object annotation against `array<string>` still refuses", () => {
    // The second refusal control, and the one the committed corpus's own
    // annotation form reaches (tests/live/acceptance/fixtures/acc-typed-inline.theta).
    // Its `<actual>` renders the inline object type; the verdict is taken on a
    // pair the parser can see, so it stays inside the registered *Trigger*.
    expectRefused(
      G.replace("array<integer>", "array<string>") +
        "let v: { ok: boolean, label: string } = @`x`\nlet r = g(v)\nr\n",
      [
        fnArgMismatch("g", 0, "xs", "array<string>", "{ ok: boolean, label: string }"),
      ],
      "b11 — a refusal the adjudication does NOT remove; it is reached without resolving anything and its verdict is correct on the value",
    );
  });

  it("e2: a LOWERCASE unresolvable annotation draws nothing", () => {
    expectSilent(
      G + "let v: zz = [1]\nlet r = g(v)\nr\n",
      "e2 — bug 0051's class (an unresolved lowercase name at a reference position); it reaches this sink identically and must defer identically",
    );
  });

  it("e3: an ENUM name annotation draws nothing", () => {
    expectSilent(
      G + "enum E { A }\nlet v: E = [1]\nlet r = g(v)\nr\n",
      "e3 — enums never enter the `TypeEnv`, so an enum-named annotation is an unresolvable `named` at this sink",
    );
  });

  it("e4: an IMPORTED `.thetalib` type name draws nothing — the row that decided severity", () => {
    // The report's severity argument: this source is a well-formed multi-file
    // program one `import` away from e8, and the importer's parse holds neither
    // the imported symbol's field bodies nor its kind. An emission here refuses
    // the legal and the illegal member of the pair alike.
    expectSilent(
      G + 'import { E } from "./p.thetalib"\nlet v: E = [1]\nlet r = g(v)\nr\n',
      "e4 — the imported-type-name spelling; the corpus's one explicit disposition for a name the importer cannot resolve is that the check does not run",
    );
  });

  it("e8 (control): the same program with a LOCAL `schema E = array<integer>` draws nothing", () => {
    expectSilent(
      G + "schema E = array<integer>\nlet v: E = [1]\nlet r = g(v)\nr\n",
      "e8 — e4's control: the two sources differ only in where `E` is declared, and both must load",
    );
  });

  it("e5: an unresolvable `fn` PARAMETER annotation, read at an inner call, draws nothing", () => {
    expectSilent(
      G + "fn f(v: Zz): number { g(v) }\nlet r = f([1])\nr\n",
      "e5 — `walkFn`'s parameter scope records the declared annotation, so the same operand class reaches the sink from a parameter rather than a `let`",
    );
  });

  it("e12: a `let mut` unresolvable annotation draws nothing", () => {
    expectSilent(
      G + "let mut v: Zz = [1]\nlet r = g(v)\nr\n",
      "e12 — the mutable binding spelling of a1; the record is the same declared type",
    );
  });

  it("the `array<integer>` CONSTRUCTOR-FIELD sink draws nothing", () => {
    // The third `⊑` check site :27 names by hand — "a schema-constructor field
    // value against its declared field type". The adjudication is stated at
    // the relation, so every site on :27's list moves together.
    expectSilent(
      "schema R { ks: array<integer> }\nlet v: Zz = [1]\nR { ks: v }\n",
      "ctor field — the constructor-field sink over the same operand; :27 lists it, so the adjudication reaches it",
    );
  });
});

describe("bug 0144 (B) — the `let`-RHS sibling sinks", () => {
  it("d1: a typed `let` whose RHS is the unresolvable binding draws nothing", () => {
    expectSilent(
      "let v: Zz = [1]\nlet s: array<integer> = v\ns\n",
      "d1 — the sibling TYPE-9 sink on identical operands; §Fix requires the two wired sinks to answer the same question the same way",
    );
  });

  it("d8: the NESTED `let`-RHS composite draws nothing, at either depth", () => {
    // The report measured TWO codes here (`let-rhs-type-mismatch` and
    // `array-element-type-mismatch`): the TYPE-7 recursion carried the refusal
    // into the element position. Both are gone, and the whole-list assertion is
    // what pins that — a filtered subset would miss the element code's return.
    expectSilent(
      "let v: Zz = [1]\nlet w: array<array<integer>> = [v]\nw\n",
      "d8 — the composite the recursion used to refuse twice; the deferral must propagate through the element position as well",
    );
  });
});

// ===========================================================================
// Group (C) — BOUNDARY. Non-`⊑` precondition gates, NOT reached by this
// adjudication. Bug 0127 is OPEN and owns the question at these gates.
// ===========================================================================

describe("bug 0144 (C) — the non-`⊑` precondition gates are outside the adjudication", () => {
  it("d4: `for y in v` still draws `non-array-iterand` on the unresolvable binding", () => {
    // BOUNDARY PIN — do NOT "fix" this. The `for` iterand's `array<T>`
    // precondition is not a `T₁ ⊑ T₂` check and is not on the check-site list
    // at docs/spec_topics/type-system.md:27, so the *Unresolvable operands*
    // paragraph does not reach it. Open bug 0127
    // (docs/bugs/0127-join-element-gate-does-not-defer-on-unresolvable-element.md)
    // owns the refuse-vs-defer question at gates of this kind; this file pins
    // the boundary rather than crossing it. Message is registry-sourced from
    // `theta/parse/non-array-iterand` (code-registry-parse.md:70).
    expectRefused(
      "let v: Zz = [1]\nfor y in v { y }\n1\n",
      [iterandRefusal("Zz")],
      "d4 — the iterand precondition keeps refusing; a route that silences it here has crossed into open bug 0127's subject without adjudicating it",
    );
  });

  it("d5: the `join` RECEIVER row on the same binding stays silent", () => {
    // The other half of the boundary, and 0127's other arm: the `join`
    // RECEIVER test already defers on an unresolvable `named`, while 0127's
    // subject — the ELEMENT test — refuses. Pinned here so this adjudication
    // cannot be read as having moved either arm.
    expectSilent(
      'let v: Zz = ["a"]\nlet s = v.join(",")\ns\n',
      "d5 — the `join` receiver deferral, unchanged; open bug 0127 owns the element arm and neither arm is touched here",
    );
  });
});

// ===========================================================================
// Group (D) — SHAPE INVARIANCE. The §Fix-required row no §Reproduction group
// supplies.
// ===========================================================================

describe("bug 0144 (D) — an unresolvable `named` source answers the same verdict against every target shape", () => {
  it("`checkCompatible(named-unresolvable, T)` is `\"unknown\"` for every target shape T", () => {
    // Driven through the real relation (src/parser/type-compat.ts:139) rather
    // than through `parseDoc`, for two reasons. First, the adjudication is
    // stated AT the relation — every sink on type-system.md:27's list consults
    // this one function, so an arm inserted ahead of the resolvability tests is
    // a change to `decide`, and testing it here catches the insertion at every
    // sink at once. Second, the enumeration can cover a bare inline `object`
    // target, a `CompatType` shape no theta annotation currently mints (the
    // report's §Affected records that `kind: "object"` has no construction site
    // in `src/`, because `annotationToCompatType` maps an inline object type to
    // a `named` carrying its raw text) — a target shape `parseDoc` cannot
    // reach at all.
    //
    // The env resolves exactly one name, so `Zz` stays past the parser's
    // static view while `P` (an object schema) and `A` (an alias) are inside it.
    const env: TypeEnv = {
      P: { kind: "object-schema", fields: { a: { kind: "prim", name: "integer" } } },
      A: { kind: "alias", rhs: { kind: "array", element: { kind: "prim", name: "integer" } } },
    };
    const unresolvable: CompatType = { kind: "named", name: "Zz" };
    const targets: readonly (readonly [string, CompatType])[] = [
      ["string", { kind: "prim", name: "string" }],
      ["number", { kind: "prim", name: "number" }],
      ["integer", { kind: "prim", name: "integer" }],
      ["boolean", { kind: "prim", name: "boolean" }],
      ["null", { kind: "prim", name: "null" }],
      ['literal "x"', { kind: "literal", typesAs: "string" }],
      ["array<integer>", { kind: "array", element: { kind: "prim", name: "integer" } }],
      [
        "array<array<integer>>",
        { kind: "array", element: { kind: "array", element: { kind: "prim", name: "integer" } } },
      ],
      ["array<Zz> (unresolvable element)", { kind: "array", element: unresolvable }],
      ["array<P> (resolvable element)", { kind: "array", element: { kind: "named", name: "P" } }],
      ["P (resolvable object schema)", { kind: "named", name: "P" }],
      ["A (alias of array<integer>)", { kind: "named", name: "A" }],
      ["Qq (unresolvable named)", { kind: "named", name: "Qq" }],
      [
        "string | array<integer>",
        {
          kind: "union",
          arms: [
            { kind: "prim", name: "string" },
            { kind: "array", element: { kind: "prim", name: "integer" } },
          ],
        },
      ],
      [
        "array<integer> | array<string>",
        {
          kind: "union",
          arms: [
            { kind: "array", element: { kind: "prim", name: "integer" } },
            { kind: "array", element: { kind: "prim", name: "string" } },
          ],
        },
      ],
      [
        "{ ok: boolean, label: string } (inline object)",
        {
          kind: "object",
          fields: [
            { name: "ok", type: { kind: "prim", name: "boolean" } },
            { name: "label", type: { kind: "prim", name: "string" } },
          ],
        },
      ],
    ];

    // A loud precondition: the enumeration must actually cover all six
    // `CompatType` kinds, or the invariance claim is narrower than it reads.
    const kinds = new Set(targets.map(([, t]) => t.kind));
    expect(
      [...kinds].sort(),
      "harness: group (D)'s target enumeration must cover every `CompatType` kind (src/parser/type-compat.ts:56–64) — a missing kind is exactly the hole this cell exists to close, so an under-covered list is a harness failure, never a skip",
    ).toEqual(["array", "literal", "named", "object", "prim", "union"]);

    const verdicts = targets.map(
      ([label, target]) => `${label} :: ${checkCompatible(unresolvable, target, env)}`,
    );
    expect(
      verdicts,
      "an unresolvable `named` source must answer `\"unknown\"` against EVERY target shape — the verdict may not be a function of the target's kind (docs/spec_topics/type-system.md:48, as adjudicated by bug 0144). A single differing row here is an arm inserted ahead of the resolvability tests, and it would move every sink on :27's check-site list at once",
    ).toEqual(targets.map(([label]) => `${label} :: unknown`));
  });
});

// ===========================================================================
// Group (E) — the runtime measurement the old emission contradicted.
// ===========================================================================

describe("bug 0144 (E) — the value the parameter actually binds", () => {
  it("f2: the body parses clean and `g` receives `[1]`", async () => {
    // The parse verdict is asserted FIRST because an error-severity
    // `theta/parse/*` denies registration outright
    // (src/extension/production-composition.ts:2220–2227), so it is what
    // decides whether the body ever runs. The value is asserted second: it is
    // the measurement the report's original emission contradicted — a value
    // that satisfies `array<integer>` at a parameter declared `array<integer>`.
    const doc = expectSilent(
      "fn g(xs: array<integer>): array<integer> { xs }\nlet v: Zz = [1]\ng(v)\n",
      "f2 — the runtime row; a refusal here denies registration to a program whose value fits the parameter",
    );
    const execution = await execute(doc);
    expect(execution.outcome, "f2 — the body reaches a value").toBe("success");
    expect(
      execution.result.value,
      "f2 — the parameter binds the initialiser's value, which satisfies `array<integer>`; the runtime never reads the annotation",
    ).toEqual([1]);
  });
});
