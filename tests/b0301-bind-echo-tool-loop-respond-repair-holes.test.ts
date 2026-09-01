import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { codes, findCode, parseDoc } from "./helpers/e2e-s1";

// Bug 0301 — three recognised-field value shapes silently take the absent-field
// default with ZERO diagnostics at any severity: a non-boolean `bind_echo:`
// (`no`, `"false"`, `0`, bare) leaves echo ON; a non-mapping `tool_loop:` /
// `respond_repair:` value (`tool_loop: 5`, `respond_repair: none`) discards the
// author's cap / methodology; and a typo'd sub-key inside either block
// (`max_round:`, `methodolgy:`) is dropped without the unknown-key warning that
// top-level keys get
// (docs/bugs/0301-bind-echo-tool-loop-respond-repair-silent-default-holes.md).
//
// THE SEAM — three narrowing sites map a present-but-unreadable value onto the
// absent-field representation BEFORE any validation arm runs, so no downstream
// arm can tell the value apart from an omitted field:
//   - `src/parser/frontmatter.ts:1192` — the `bind_echo` arm captures only a
//     boolean scalar (`bindEchoValue = typeof rawValue === "boolean" ? rawValue
//     : undefined`); every non-boolean scalar and every non-scalar node records
//     the absent-field value, and the in-source comment states the silence as
//     designed ("a non-boolean value leaves the default-on behaviour").
//   - `src/parser/frontmatter.ts:662` (`resolveNonNegIntBlock`) and `:709`
//     (`checkMethodology`) both early-return the default for ANY non-map block
//     node (`tool_loop: 5`, `respond_repair: none` — silent), and their
//     `items.find` calls (`:665`, `:712`) walk the block for the ONE recognised
//     sub-key only, so an unrecognised sibling (`max_round:`, `methodolgy:`) is
//     never seen and never warned. The top-level unknown-key warning
//     (`:1310`, `theta/load/unknown-frontmatter-field`) these nested typos need
//     is scoped to the top level by the spec's own words
//     (frontmatter-fields-a.md:32).
//
// THE SETTLED FRAME THIS FILE ENCODES (bug 0301 §Expected behaviour / §Fix).
// The three dispositions the corpus's own settled rules imply, each mirroring an
// existing neighbour:
//   (a) `bind_echo:` outside `true`/`false` is present-but-bad, not absent —
//       like every other closed-value field (`mode:` → `unknown-mode-value`,
//       `bind_context:` → `unknown-bind-context-value`, `methodology:` →
//       `unknown-methodology-value`, defaulting-system-note-echo.md:28 closes
//       the set at `true | false`). New load error
//       `theta/load/unknown-bind-echo-value`; theta NOT registered. The rendered
//       value is `String(scalar.value)` through the message template, exactly as
//       the `bind_context` arm renders its scalar (`no` → `no`, `"false"` →
//       `false`, `0` → `0`, bare → `null`).
//   (b) a present non-mapping `tool_loop:` / `respond_repair:` value is outside
//       the `{}`-equivalent-to-absent equivalence (frontmatter-fields-a.md:45–46)
//       and outside `frontmatter-value-out-of-range`'s present-SUB-FIELD trigger
//       (code-registry-load.md:21) — the 0104/0206 shape-refusal precedent. New
//       load errors `theta/load/malformed-tool-loop-field` /
//       `theta/load/malformed-respond-repair-field` naming the got kind
//       (`number` / `array` / `string`); theta NOT registered.
//   (c) an unrecognised sub-key inside either block draws the EXISTING
//       `theta/load/unknown-frontmatter-field` (W) with the DOTTED key
//       (`tool_loop.max_round`), keeping the theta registered — the same
//       forward-compat posture the top level already has.
//
// REGISTRATION OBSERVABLE. `parseDoc` (tests/helpers/e2e-s1.ts) returns the
// shipped `ThetaDocument`; a theta REGISTERS iff `doc.frontmatter !== null`. A
// refused theta has `doc.frontmatter === null` and carries the error-severity
// row on `doc.diagnostics`. `frontmatter.bindEcho` is present only for a boolean
// scalar; `frontmatter.toolLoop.maxRounds` / `frontmatter.respondRepair.attempts`
// are the parsed block values (defaults 25 / 3).
//
// WHAT IS RED HERE AND WHY. Every face-(a)/(b) witness comes back registered
// with zero diagnostics (the collapse) — the new-code refusal row is absent and
// `frontmatter` is non-null, so both assertions red for the right reason: the
// diagnostic the fix introduces is not emitted today. Each face-(c) witness reds
// on the ABSENT `unknown-frontmatter-field` warning for the dotted key (its
// green companions — the theta stays registered, `maxRounds`/`attempts` keep
// their parsed values — already hold today and are pinned so the fix cannot
// regress them). The controls are green today and are regression locks, not
// witnesses. The DIAG-4 anchor cells red in Phase 1 because the three registry
// rows are absent yet, and go green when the rows land (they SOURCE the pinned
// template through `registryMessage`, exactly as bug 0297's anchor does).
//
// TIER. Unit — all three faces live entirely in the offline parse front-end
// reached by `parseThetaDocument` via `parseDoc`; no session, model, or child
// spawn is needed, and the whole disposition is observable on the returned
// `ThetaDocument`. An integration/live tier would only add nondeterminism over a
// seam already fully observable here.
//
// Offline, provider-free, deterministic. A missing precondition (an unreadable
// registry page, a moved *Message* row) fails loudly rather than skipping
// (CLAUDE.md / AGENTS.md: no silent test skipping).

// --- Registry Message anchoring (DIAG-4) -----------------------------------

interface RegistryRow {
  readonly code: string;
  readonly message: string;
  readonly severity: string;
  readonly phase: string;
}

const REGISTRY_LOAD_PATH = "docs/spec_topics/diagnostics/code-registry-load.md";

const REGISTRY_LOAD = parseRegistry(
  readFileSync(
    fileURLToPath(new URL(`../${REGISTRY_LOAD_PATH}`, import.meta.url)),
    "utf8",
  ),
) as RegistryRow[];

const UNKNOWN_BIND_ECHO_VALUE = "theta/load/unknown-bind-echo-value";
const MALFORMED_TOOL_LOOP_FIELD = "theta/load/malformed-tool-loop-field";
const MALFORMED_RESPOND_REPAIR_FIELD = "theta/load/malformed-respond-repair-field";
const UNKNOWN_FRONTMATTER_FIELD = "theta/load/unknown-frontmatter-field";
const UNKNOWN_METHODOLOGY_VALUE = "theta/load/unknown-methodology-value";
const OUT_OF_RANGE = "theta/load/frontmatter-value-out-of-range";

// The normative Message templates the DIAG-4 anchors lock once the rows land.
// The `<value>` / `<kind>` placeholders mirror the house registry style
// (`unknown-bind-context-value` uses `<value>`; the malformed-field kind token
// follows `mode:`/`bind_context:`'s bounded-kind renderer). A different
// placeholder token chosen by the implementer is a Phase-2 reconciliation; the
// Phase-1 red here is the row's ABSENCE, independent of the token.
const UNKNOWN_BIND_ECHO_VALUE_TEMPLATE =
  "unknown 'bind_echo:' value '<value>'; expected true or false";
const MALFORMED_TOOL_LOOP_FIELD_TEMPLATE =
  "malformed 'tool_loop:' field; expected a mapping, got <kind>";
const MALFORMED_RESPOND_REPAIR_FIELD_TEMPLATE =
  "malformed 'respond_repair:' field; expected a mapping, got <kind>";

// --- Fixtures & helpers ----------------------------------------------------

/** One theta file: `---` fences over `<frontmatter>`, body `let x = 1`. */
function doc(frontmatter: string): ThetaDocument {
  return parseDoc(`---\n${frontmatter}\n---\nlet x = 1\n`);
}

interface FrontmatterShape {
  readonly bindEcho?: boolean;
  readonly toolLoop?: { readonly maxRounds: number };
  readonly respondRepair?: { readonly attempts: number };
}

/** Read the parsed frontmatter as its structural shape, or `null` when refused. */
function fm(d: ThetaDocument): FrontmatterShape | null {
  return d.frontmatter as FrontmatterShape | null;
}

/** Assert a row is present at the given severity carrying the exact Message. */
function expectRow(
  diags: readonly Diagnostic[],
  code: string,
  severity: Diagnostic["severity"],
  message: string,
): void {
  const row = findCode(diags, code);
  expect(
    row,
    `expected a ${code} row; got codes ${JSON.stringify(codes(diags))}`,
  ).toBeDefined();
  expect((row as Diagnostic).severity).toBe(severity);
  expect((row as Diagnostic).message).toBe(message);
}

/** Assert NO row carries the given code. */
function expectNoRow(diags: readonly Diagnostic[], code: string): void {
  expect(
    findCode(diags, code),
    `expected NO ${code} row; got codes ${JSON.stringify(codes(diags))}`,
  ).toBeUndefined();
}

// ===========================================================================

// --- FACE (a) — non-boolean bind_echo: → unknown-bind-echo-value, not reg ---

describe("bug 0301 face (a) — non-boolean bind_echo: silently leaves echo on", () => {
  // Each row is a present value that is neither `true` nor `false`, so the fix
  // draws unknown-bind-echo-value with the scalar rendered `String(value)` and
  // the theta is NOT registered. Today the boolean-only capture at
  // frontmatter.ts:1192 records the absent-field value, the theta registers with
  // the default-on echo, and no diagnostic is emitted — both assertions red.
  const cases: ReadonlyArray<readonly [label: string, line: string, rendered: string]> = [
    ["bind_echo: no (YAML 1.1 habit spelling)", "bind_echo: no", "no"],
    ['bind_echo: "false" (quoted string)', 'bind_echo: "false"', "false"],
    ["bind_echo: 0 (integer)", "bind_echo: 0", "0"],
    ["bind_echo: (bare null scalar)", "bind_echo:", "null"],
  ];
  for (const [label, line, rendered] of cases) {
    it(`${label} → unknown-bind-echo-value '${rendered}', not registered`, () => {
      const d = doc(`mode: subagent\n${line}`);
      expectRow(
        d.diagnostics,
        UNKNOWN_BIND_ECHO_VALUE,
        "error",
        `unknown 'bind_echo:' value '${rendered}'; expected true or false`,
      );
      expect(fm(d), "a refused theta does not register").toBeNull();
    });
  }
});

// --- FACE (b) — present non-mapping tool_loop:/respond_repair: → malformed ---

describe("bug 0301 face (b) — non-mapping tool_loop:/respond_repair: silently defaults", () => {
  // A scalar number `tool_loop: 5` is present-but-the-wrong-shape, outside the
  // `{}`-equivalent-to-absent equivalence; the fix refuses it naming the got
  // kind `number`. Today resolveNonNegIntBlock (frontmatter.ts:662) early-returns
  // the default 25 for any non-map node — registered, no diagnostic.
  it("tool_loop: 5 (scalar number) → malformed-tool-loop-field 'number', not registered", () => {
    const d = doc("mode: subagent\ntool_loop: 5");
    expectRow(
      d.diagnostics,
      MALFORMED_TOOL_LOOP_FIELD,
      "error",
      "malformed 'tool_loop:' field; expected a mapping, got number",
    );
    expect(fm(d), "a refused theta does not register").toBeNull();
  });

  // A YAML SEQUENCE `tool_loop:` over `  - 5` is the other non-map node kind; the
  // fix names the got kind `array`.
  it("tool_loop: over a sequence → malformed-tool-loop-field 'array', not registered", () => {
    const d = doc("mode: subagent\ntool_loop:\n  - 5");
    expectRow(
      d.diagnostics,
      MALFORMED_TOOL_LOOP_FIELD,
      "error",
      "malformed 'tool_loop:' field; expected a mapping, got array",
    );
    expect(fm(d), "a refused theta does not register").toBeNull();
  });

  // `respond_repair: none` is the natural shorthand given `methodology: none` is
  // a documented value; the fix refuses the string scalar naming the got kind
  // `string`. Today checkMethodology (frontmatter.ts:709) early-returns for the
  // non-map node and the theta runs the default budgets silently.
  it("respond_repair: none (scalar string) → malformed-respond-repair-field 'string', not registered", () => {
    const d = doc("mode: subagent\nrespond_repair: none");
    expectRow(
      d.diagnostics,
      MALFORMED_RESPOND_REPAIR_FIELD,
      "error",
      "malformed 'respond_repair:' field; expected a mapping, got string",
    );
    expect(fm(d), "a refused theta does not register").toBeNull();
  });
});

// --- FACE (c) — typo'd nested sub-key → existing unknown-frontmatter-field ---

describe("bug 0301 face (c) — typo'd nested sub-key drops without the unknown-key warning", () => {
  // `max_round:` is the one-keystroke slip from `max_rounds:`. The fix draws the
  // EXISTING top-level unknown-key warning with the DOTTED key and keeps the
  // theta registered (maxRounds defaults to 25). Today the items.find at
  // frontmatter.ts:665 walks for `max_rounds` only, so the sibling is never seen
  // and never warned — the warning row is absent (the red), though the theta
  // already registers with maxRounds 25 (the pinned green companions).
  it("tool_loop: over `  max_round: 5` → unknown-frontmatter-field 'tool_loop.max_round', registered, maxRounds 25", () => {
    const d = doc("mode: subagent\ntool_loop:\n  max_round: 5");
    expectRow(
      d.diagnostics,
      UNKNOWN_FRONTMATTER_FIELD,
      "warning",
      "unknown frontmatter field 'tool_loop.max_round'",
    );
    expect(fm(d), "a nested typo still registers the theta").not.toBeNull();
    expect(
      fm(d)?.toolLoop?.maxRounds,
      "the recognised absent max_rounds defaults to 25",
    ).toBe(25);
  });

  // `methodolgy:` is the typo of `methodology:`; the recognised `attempts: 2`
  // sibling is still taken. The fix warns on the dotted `respond_repair.methodolgy`
  // and keeps the theta registered (attempts 2). Crucially NO
  // unknown-methodology-value fires — the recognised `methodology` key is absent,
  // so there is no present-but-bad methodology value to refuse.
  it("respond_repair: over `  attempts: 2` + `  methodolgy: none` → unknown-frontmatter-field 'respond_repair.methodolgy', registered, attempts 2, no unknown-methodology-value", () => {
    const d = doc("mode: subagent\nrespond_repair:\n  attempts: 2\n  methodolgy: none");
    expectRow(
      d.diagnostics,
      UNKNOWN_FRONTMATTER_FIELD,
      "warning",
      "unknown frontmatter field 'respond_repair.methodolgy'",
    );
    expect(fm(d), "a nested typo still registers the theta").not.toBeNull();
    expect(
      fm(d)?.respondRepair?.attempts,
      "the recognised attempts: 2 sibling is taken",
    ).toBe(2);
    expectNoRow(d.diagnostics, UNKNOWN_METHODOLOGY_VALUE);
  });
});

// --- CONTROLS — green after the fix; regression locks, not witnesses --------

describe("bug 0301 controls — the fix must not regress these", () => {
  // `bind_echo: false` records `false` (echo suppressed) — the boolean path the
  // fix narrows the collapse WITHOUT disturbing.
  it("bind_echo: false → registered, bindEcho false (control)", () => {
    const d = doc("mode: subagent\nbind_echo: false\nparams:\n  a: string");
    expectNoRow(d.diagnostics, UNKNOWN_BIND_ECHO_VALUE);
    expect(fm(d), "a boolean bind_echo: registers").not.toBeNull();
    expect(fm(d)?.bindEcho, "bind_echo: false records false").toBe(false);
  });

  // `bind_echo: true` records `true` (the other boolean). Diagnostics are not
  // asserted clean here: a no-params theta also draws the advisory
  // `bind-echo-without-params`, unrelated to the value-recognition path.
  it("bind_echo: true → registered, bindEcho true (control)", () => {
    const d = doc("mode: subagent\nbind_echo: true\nparams:\n  a: string");
    expectNoRow(d.diagnostics, UNKNOWN_BIND_ECHO_VALUE);
    expect(fm(d), "a boolean bind_echo: registers").not.toBeNull();
    expect(fm(d)?.bindEcho, "bind_echo: true records true").toBe(true);
  });

  // A present SUB-FIELD out of range is the arm that IS enforced today: a
  // stringly-typed `max_rounds: "25"` refuses with frontmatter-value-out-of-range
  // and must keep doing so (the fix touches the non-map / unknown-sub-key arms,
  // not this present-sub-field one).
  it('tool_loop: over `  max_rounds: "25"` → frontmatter-value-out-of-range, not registered (control)', () => {
    const d = doc('mode: subagent\ntool_loop:\n  max_rounds: "25"');
    expect(findCode(d.diagnostics, OUT_OF_RANGE), "the present-sub-field arm fires").toBeDefined();
    expect(fm(d), "an out-of-range sub-field denies registration").toBeNull();
  });

  // A present recognised `methodology:` outside the set refuses with
  // unknown-methodology-value — the sibling closed-value arm the fix mirrors but
  // must not disturb.
  it("respond_repair: over `  methodology: nonsense` → unknown-methodology-value, not registered (control)", () => {
    const d = doc("mode: subagent\nrespond_repair:\n  methodology: nonsense");
    expect(
      findCode(d.diagnostics, UNKNOWN_METHODOLOGY_VALUE),
      "the recognised-value arm fires",
    ).toBeDefined();
    expect(fm(d), "an unknown methodology denies registration").toBeNull();
  });

  // A TOP-LEVEL `methodolgy:` typo is the existing unknown-key warning's own
  // territory — the exact posture face (c) extends one level down. It must keep
  // its plain (undotted) key and register.
  it("top-level methodolgy: typo → unknown-frontmatter-field 'methodolgy', registered (control)", () => {
    const d = doc("mode: subagent\nmethodolgy: none");
    expectRow(
      d.diagnostics,
      UNKNOWN_FRONTMATTER_FIELD,
      "warning",
      "unknown frontmatter field 'methodolgy'",
    );
    expect(fm(d), "a top-level unknown key still registers").not.toBeNull();
  });

  // `tool_loop: {}` is the spec's own name for equivalent-to-absent: registered,
  // maxRounds defaults 25, NO malformed-tool-loop-field. The fix's non-map
  // refusal must exclude the empty MAP (a map IS the expected node kind).
  it("tool_loop: {} → registered, maxRounds 25, no malformed-tool-loop-field (control)", () => {
    const d = doc("mode: subagent\ntool_loop: {}");
    expectNoRow(d.diagnostics, MALFORMED_TOOL_LOOP_FIELD);
    expect(fm(d), "an empty map registers").not.toBeNull();
    expect(fm(d)?.toolLoop?.maxRounds, "tool_loop: {} defaults maxRounds to 25").toBe(25);
  });

  // A bare `tool_loop:` (null scalar, no sub-keys) locks the "null block ==
  // absent" decision: registered, maxRounds 25, NO malformed-tool-loop-field.
  // The fix's non-map refusal must treat a null scalar as absent, not malformed.
  it("tool_loop: bare null scalar → registered, maxRounds 25, no malformed-tool-loop-field (control)", () => {
    const d = doc("mode: subagent\ntool_loop:");
    expectNoRow(d.diagnostics, MALFORMED_TOOL_LOOP_FIELD);
    expect(fm(d), "a null tool_loop: block registers").not.toBeNull();
    expect(fm(d)?.toolLoop?.maxRounds, "a null tool_loop: block defaults maxRounds to 25").toBe(25);
  });

  // A plain `mode: subagent` theta with neither block registers with both
  // defaults — the genuinely-absent path the collapse currently disguises the
  // bad shapes as.
  it("absent tool_loop/respond_repair → registered, maxRounds 25 / attempts 3 (control)", () => {
    const d = doc("mode: subagent");
    expect(fm(d), "a plain theta registers").not.toBeNull();
    expect(fm(d)?.toolLoop?.maxRounds, "absent tool_loop defaults maxRounds to 25").toBe(25);
    expect(fm(d)?.respondRepair?.attempts, "absent respond_repair defaults attempts to 3").toBe(3);
  });
});

// --- DIAG-4 anchors — one per new code (red in Phase 1, green in Phase 2) ---

describe("bug 0301 DIAG-4 — code-registry-load.md carries the three new rows", () => {
  // Each anchor SOURCES the expected string from the registry via
  // `registryMessage` and asserts it against the pinned template, plus severity
  // E / phase load, exactly as bug 0297's anchor does. In Phase 1 the row is
  // absent → `registryMessage` returns undefined → the defined check reds by
  // naming the registry page (it does not skip). When the row lands the anchor
  // locks the Message character-for-character.
  const anchors: ReadonlyArray<readonly [code: string, template: string]> = [
    [UNKNOWN_BIND_ECHO_VALUE, UNKNOWN_BIND_ECHO_VALUE_TEMPLATE],
    [MALFORMED_TOOL_LOOP_FIELD, MALFORMED_TOOL_LOOP_FIELD_TEMPLATE],
    [MALFORMED_RESPOND_REPAIR_FIELD, MALFORMED_RESPOND_REPAIR_FIELD_TEMPLATE],
  ];
  for (const [code, template] of anchors) {
    it(`DIAG-4: ${REGISTRY_LOAD_PATH} carries ${code} with the normative Message, severity E, phase load`, () => {
      const message = registryMessage(REGISTRY_LOAD, code) as string | undefined;
      expect(
        message,
        `DIAG-4 anchor: ${REGISTRY_LOAD_PATH} must carry the Message row for ${code}`,
      ).toBeDefined();
      expect(
        message,
        "DIAG-4 — the Message column is normative character-for-character",
      ).toBe(template);
      const row = REGISTRY_LOAD.find((r) => r.code === code);
      expect(
        row,
        `the parsed registry must hold a structured row for ${code}`,
      ).toBeDefined();
      expect(
        (row as RegistryRow).severity,
        "severity E — a present-but-bad value denies registration",
      ).toBe("E");
      expect(
        (row as RegistryRow).phase,
        "phase load — the check runs at the frontmatter read",
      ).toBe("load");
    });
  }
});
