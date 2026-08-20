import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { ThetaFixture } from "../src/extension/factory";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
import {
  parseFrontmatter,
  type FrontmatterParseResult,
  type ModelReferenceMatcher,
} from "../src/parser/frontmatter";
import type { SourceRange } from "../src/diagnostics/diagnostic";

// Bug 0104 — a `tools:` field whose VALUE is a YAML mapping is treated as an
// ABSENT field: `extractToolsList` (src/parser/frontmatter.ts:428) enumerates
// two node kinds — `isScalar` (:429) and `isSeq` (:436) — and answers
// `undefined` for every other kind (:448). The `tools` arm of the frontmatter
// key walk (:978–:983) records nothing else, and `:1303` spreads `tools` into
// the returned frontmatter only when it is defined, so `resolveThetaToolsAtLoad`
// (src/extension/production-composition.ts:1603, the early return at
// :1622–:1631) cannot distinguish "no `tools:`" from "a `tools:` value that was
// discarded" and answers `EMPTY_CALLABLE_SET` (:1590) for both. The theta
// registers with the empty callable set and no diagnostic is emitted at any
// severity — so `tools: {read: bash}` names `read` in the author's text and
// delivers a theta whose model cannot call it and whose code raises
// `theta/parse/unknown-identifier` on it
// (docs/bugs/0104-tools-field-nonscalar-value-loads-empty-callable-set.md).
//
// This group is bug 0104's witness and is the field-level sibling of bug 0069's
// ENTRY-level witness, tests/tools-entry-closed-grammar.test.ts groups (A)–(C);
// its groups are lettered (D…) to continue that file's sequence. It lives in its
// own file because 0069's group (B) rests on ONE module-shared
// `discoverAndComposeFixtures` outcome built from a frozen `THETAS` array that
// 0069's own cells assert over: hosting the field-level matrix there means
// editing the input of another bug's assertions, and the field-level refusal
// additionally needs a per-row load (its message carries no `<value>`, so
// `ctx.ui.notify` text is not attributable to a row inside a shared workspace)
// and a `parseFrontmatter` range matrix that file has no harness for.
//
// SPEC ANCHORS (the contract, not the current code — every line re-derived at
// HEAD 2f56cb0a / 0.123.0):
//   - docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:3
//     (§YAML-shape) — "`tools:` accepts two interchangeable spellings — a
//     comma-separated short form and a YAML list form". A mapping is neither, so
//     no production admits it.
//   - :18 — the `tools:` rejection-family enumeration: every member prevents the
//     theta from being registered. A field that cannot be read at all is a
//     stronger failure than an entry with an unresolvable name.
//   - docs/spec_topics/frontmatter/frontmatter-fields-a.md:43 (the `tools`
//     field-contract row) — the empty callable set is the ABSENT-field
//     behaviour, and the equivalence it extends that to is `tools: []`.
//   - :36 / :39 / :41 (the `mode`, `model`, `bind_context` rows) — the
//     field-contract principle stated three times: `"missing" and
//     "present-but-bad" do not collapse into one code, because the authoring
//     intent differs`.
//   - :74 (§`tools`), :76 ("Two kinds of entry are accepted") and :88 (bug
//     0069's closed per-entry grammar, which closes the ENTRY and the sequence
//     ITEM and states no field-level shape rule).
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:72 (DIAG-2 — the registry
//     is closed, so the refusal needs a registered row landed with the
//     enforcement) and :74 (DIAG-4 — the *Message* column is normative, so group
//     (D1) sources it from the registry rather than from prose).
//   - docs/spec_topics/diagnostics/code-registry-load.md:19
//     (`theta/load/params-type-not-expression`) — the precedent frame: a
//     node-shape refusal judged at the frontmatter read "where the field's YAML
//     is still in hand", severity E, phase load, ranged. :18
//     (`theta/load/params-null`) is the second frontmatter-shape refusal, and
//     :25 / :26 (`theta/load/malformed-tool-entry`, `theta/load/unknown-tool`)
//     carry the all-or-nothing posture: one bad entry un-registers the whole
//     theta.
//   - docs/spec_topics/governance/source-language-stability.md:9 (the
//     loads-cleanly predicate — every refused shape emits no `E`-severity
//     diagnostic today, so all of them sit inside GOV-15's input set) and :25
//     (the diagnostic-registry carve-out, which covers a code addition for
//     inputs that did not previously emit the added code).
//
// THE PINNED POST-FIX CONTRACT (bug 0104 §Fix, route settled in-run against
// §Fix constraint (a)):
//   1. ONE NEW registered code, `theta/load/malformed-tools-field` (severity E,
//      phase load), emitted at the FRONTMATTER layer beside the
//      `theta/load/params-null` push (src/parser/frontmatter.ts:1164–:1172) —
//      the `theta/load/params-type-not-expression` node-shape frame. Widening
//      `theta/load/malformed-tool-entry`'s *Trigger* is rejected: its normative
//      Message names an "entry" and states the ENTRY grammar's expectation, and
//      DIAG-4 defers a Message reword to theta 2.0, so no `<value>` rendering
//      makes that message true of a field-level YAML mapping.
//   2. The Message is a FIXED string with NO placeholder, so the closed
//      placeholder surface (placeholder-rendering-b.md) is untouched and the
//      multi-line rendering hazard of a recovered BLOCK mapping never arises.
//   3. The refusal is RANGED on the field's VALUE node, falling back to the KEY
//      range when the field carries no value node — the `valueRange ?? keyRange`
//      pattern the `params` arm already uses (frontmatter.ts:965–:969, reported
//      at 3:9 for `params: null` — measured). §Fix constraint (b): 0069's
//      entry-level code carries no range because the resolver holds no YAML
//      positions; the frontmatter layer does.
//   4. The theta does NOT register (§Fix constraint (b), the all-or-nothing
//      posture of code-registry-load.md:25/:26).
//   5. The REFUSED set is the node KIND, not emptiness: a flow mapping, the
//      EMPTY flow mapping `tools: {}` (§Fix constraint (d) — `{}` is a mapping;
//      the equivalence frontmatter-fields-a.md:43 states is `tools: []`, a
//      sequence), a block mapping, a nested block mapping, a YAML ALIAS value,
//      and a `tools` key carrying no value node at all.
//   6. STILL SILENT and byte-identical: a plain scalar, the comma short form, a
//      sequence, `tools: []`, an absent field (§Fix constraint (d)), bug 0069's
//      non-scalar sequence ITEM (which keeps `theta/load/malformed-tool-entry`
//      with its verbatim entry text and its range-less file-level report), and
//      the two null spellings, which take the `isScalar` arm and keep
//      `theta/load/unknown-tool: unknown Pi tool 'null'` (§Non-goals).
//
// PROBED CURRENT SIGNATURES (HEAD 2f56cb0a / 0.123.0, offline, deterministic).
// `parseFrontmatter`, reading `.registered` / `.frontmatter?.tools` /
// `.diagnostics`:
//   flow map {read: bash} / {a: b} / {read: 1, grep: 2}   registered=true tools=undefined diags=[]
//   empty flow map {}                                     registered=true tools=undefined diags=[]
//   block map `read: bash` / `a: b` / `read:`             registered=true tools=undefined diags=[]
//   nested block map                                      registered=true tools=undefined diags=[]
//   alias `tools: *a`                                     registered=true tools=undefined diags=[]
//   explicit key `? tools` (no value node)                registered=true tools=undefined diags=[]
//   scalar `read` / `read, grep`                          tools=["read"] / ["read","grep"] diags=[]
//   sequence `- read` / `tools: []` / absent              tools=["read"] / undefined / undefined diags=[]
//   sequence item `- {a: b}`                              tools=["{a: b}"] diags=[]
//   bare `tools:` / `tools: null`                         tools=["null"] diags=[]
// Through the production compose helper, one theta per planted workspace:
// every mapping row registers with ZERO notifications; the code-side mapping
// rows do not register and notify `unknown identifier 'read'` plus
// `bare object literal not permitted…`; `- {a: b}` notifies
// `malformed 'tools:' entry '{a: b}'; …`; both null spellings notify
// `unknown Pi tool 'null'`.
//
// WHAT IS RED HERE AND WHY: (D1) reds because the code has no registry row, so
// DIAG-4 has no normative string to source. (D2)'s ten shape cells red on the
// FIRST assertion — the diagnostic list is empty where exactly one
// error-severity refusal is required — and each would then red on registration
// and on the range. (D3)'s two mapping spellings red twice each: the theta is in
// the registered set and no notification carries the refusal. (D4)'s two
// code-side spellings red on the missing notification only (they already fail to
// register, for the wrong reason — a diagnostic naming the BODY).
//
// GREEN BY DESIGN and required to stay green: the (D3) precondition guard; the
// four control rows (§Fix constraint (d)) in both harness halves; (D6) bug
// 0069's sequence ITEM keeping its own code, its verbatim entry text and its
// range-less report while NOT acquiring the new code; and (D7) the two null
// spellings keeping `theta/load/unknown-tool`.
//
// TIER: unit, offline, provider-free, deterministic — in two halves, for the
// reason bug 0104 §Fix constraint (h) states. The `parseFrontmatter` half is the
// only harness that can witness the RANGE and the per-shape attribution: the
// refusal's Message carries no `<value>`, so every refused shape renders the
// identical string and a shared-workspace load cannot attribute it. The
// composition-root half is what makes the witness a production-load witness —
// it proves the frontmatter-layer refusal reaches the shipped `session_start`
// registration verdict over a real on-disk `.pi/theta/` discovery walk. No
// integration or live tier is reachable for this observable: registration and
// its diagnostics settle before any model, provider or transport exists.
//
// NO SILENT SKIPPING: every load is asserted against a per-row outcome that the
// (D3) precondition guard proves non-vacuous (the clean scalar control must
// register), and every helper that cannot find its row THROWS naming the row.

// ===========================================================================
// The new registered code and its normative message (DIAG-2 / DIAG-4).
// ===========================================================================

const CODE = "theta/load/malformed-tools-field";

/**
 * The normative *Message* template the fix must land in the registry
 * (code-registry-load.md, beside the two existing frontmatter-shape refusals
 * `theta/load/params-null` (:18) and `theta/load/params-type-not-expression`
 * (:19), mirrored into docs/reference/diagnostics.md in the same commit per
 * DIAG-2). Written literally HERE ONCE — group (D1) asserts the registry row
 * equals it — so the shape cells red on the BEHAVIOUR (no diagnostic at all)
 * rather than on a `registryMessage` read of an absent row yielding
 * `undefined`. It carries NO placeholder: the refusal names the field's shape,
 * not the offending text, so the closed placeholder surface is untouched and a
 * BLOCK mapping's multi-line bytes never reach a `message` that
 * diagnostic-shape.md:34 defines as a single-line summary.
 */
const EXPECTED_MESSAGE =
  "malformed 'tools:' field; expected a comma-separated list of entries or a YAML sequence";

interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** The live sharded load registry — the *Message* column DIAG-4 makes normative. */
const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../docs/spec_topics/diagnostics/code-registry-load.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as RegistryRow[];

/**
 * A registry row's normative *Message* template, definedness asserted first so
 * a missing row reds by naming the registry page rather than by a bare
 * `undefined` comparison (DIAG-4).
 */
function templateMessage(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-load.md must carry the Message row for ${code}`,
  ).toBeDefined();
  return template as string;
}

/**
 * `theta/load/malformed-tool-entry` rendered for bug 0069's non-scalar sequence
 * ITEM (group (D6)). `<value>` is the item's recovered verbatim YAML source,
 * unquoted — the surrounding single quotes belong to the template
 * (placeholder-rendering-b.md, the parse-time literal-value `<value>`
 * sub-rule).
 */
const MALFORMED_ENTRY_MESSAGE = templateMessage(
  "theta/load/malformed-tool-entry",
).replaceAll("<value>", "{a: b}");

/** `theta/load/unknown-tool` rendered for the two null spellings (group (D7)). */
const UNKNOWN_TOOL_NULL_MESSAGE = templateMessage(
  "theta/load/unknown-tool",
).replaceAll("<name>", "null");

// ===========================================================================
// Sources. One `mode: prompt` frontmatter, one `tools:` field, one body.
// ===========================================================================

/** A body that names NO callable, so the `tools:` field is the only subject. */
const BODY_NO_CALL = "@`hi`";

/**
 * A body that NAMES the tool the mapping's key spells. At HEAD the discarded
 * field leaves `collectIdentRoots` (src/parser/theta-document.ts) nothing to
 * seed, so the author's only signal is `theta/parse/unknown-identifier` at
 * their own call site — a diagnostic whose subject is an UNDECLARED name.
 */
const BODY_CALLS_READ = ['let r = read({ path: "x" })?', "r"].join("\n");

/** A `.theta` source: `---`, the frontmatter lines, `---`, then the body. */
function theta(frontmatterLines: readonly string[], body: string): string {
  return ["---", ...frontmatterLines, "---", body].join("\n") + "\n";
}

/** The two canonical mapping spellings, as frontmatter line arrays. */
const FLOW_MAP_LINES = ["mode: prompt", "tools: {read: bash}"] as const;
const BLOCK_MAP_LINES = ["mode: prompt", "tools:", "  read: bash"] as const;

// ===========================================================================
// (D1) THE DIAG-4 REGISTRY ANCHOR.
// RED at HEAD: none of the load registry's rows covers a `tools:` value that is
// neither a scalar nor a sequence, so there is no code to report.
// ===========================================================================

describe("bug 0104 (D1) — the field-shape refusal is a registered code", () => {
  it(`RED (D1): code-registry-load.md carries ${CODE} with the normative Message, severity E, phase load`, () => {
    // A registry addition is a DIAG-2 operation (diagnostic-shape.md:72),
    // covered within a theta 1.x minor by the GOV-15 diagnostic-registry
    // carve-out (source-language-stability.md:25) as "an addition for inputs
    // that did not previously emit the added code" — exactly the shapes in
    // group (D2), every one of which loads cleanly today.
    const message = registryMessage(REGISTRY, CODE) as string | undefined;
    expect(
      message,
      `${CODE} has no row in docs/spec_topics/diagnostics/code-registry-load.md: ` +
        "a `tools:` field whose value is neither a scalar nor a sequence has no " +
        "code to report and DIAG-4 has no string to source",
    ).toBeDefined();
    expect(
      message,
      "DIAG-4 — the Message column is normative character-for-character, and it " +
        "carries no placeholder: the refusal names the field's shape, so no new " +
        "`<…>` placeholder is coined and no multi-line block-mapping text reaches " +
        "the single-line `message` (diagnostic-shape.md:34)",
    ).toBe(EXPECTED_MESSAGE);
    const row = REGISTRY.find((r) => r.code === CODE);
    expect(row, `the parsed registry must hold a structured row for ${CODE}`).toBeDefined();
    expect(
      (row as RegistryRow).severity,
      "severity E — registration is gated on error severity, and the whole " +
        "`tools:` rejection family prevents registration " +
        "(frontmatter-fields-b-and-templates.md:18)",
    ).toBe("E");
    expect(
      (row as RegistryRow).phase,
      "phase load — the check runs at the frontmatter read, where the field's " +
        "YAML node is still in hand, beside `theta/load/params-null` " +
        "(code-registry-load.md:18) and `theta/load/params-type-not-expression` " +
        "(:19)",
    ).toBe("load");
  });
});

// ===========================================================================
// (D2) THE SHAPE MATRIX AND THE RANGE, directly on `parseFrontmatter`.
// RED at HEAD: every row below returns `registered=true`, `tools=undefined` and
// `diags=[]` (measured), which is byte-identical to the ABSENT field.
// ===========================================================================

const matcher: ModelReferenceMatcher = { resolve: () => "resolved" };

/** Parse a whole `.theta` source through the shipped frontmatter reader. */
function parse(source: string): FrontmatterParseResult {
  return parseFrontmatter(source, { file: "bug0104.theta", modelMatcher: matcher });
}

/** Every diagnostic rendered `<severity> <code>`, in emission order. */
function diagCodes(r: FrontmatterParseResult): string[] {
  return r.diagnostics.map((d) => `${d.severity} ${d.code}`);
}

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(r: FrontmatterParseResult): string[] {
  return r.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/**
 * The refusal contract every shape below shares: EXACTLY ONE diagnostic — the
 * new code at error severity, its message the fixed normative string, its range
 * the field's value node (or the key node when there is no value node) — and
 * the theta not registered, which withholds the frontmatter.
 *
 * The count/code/severity assertion runs FIRST so the red at HEAD names the
 * symptom bug 0104 reports (no diagnostic at any severity for a field the two
 * spellings exclude) rather than a message or range mismatch.
 */
function expectFieldRefused(
  label: string,
  r: FrontmatterParseResult,
  range: SourceRange,
): void {
  expect(
    diagCodes(r),
    `${label}: frontmatter-fields-b-and-templates.md:3 admits two spellings and ` +
      `:18 states that every \`tools:\` rejection prevents registration, so the ` +
      `honest coverage of this shape is EXACTLY ONE error-severity ${CODE}. ` +
      `Rendered diagnostics: ${JSON.stringify(diagLines(r))}`,
  ).toEqual([`error ${CODE}`]);
  const d = r.diagnostics[0];
  if (d === undefined) {
    throw new Error(`${label}: diagnostics[0] absent after a one-element count assertion`);
  }
  expect(
    d.message,
    `${label}: DIAG-4 (diagnostic-shape.md:74) — the rendered message is the ` +
      "registry row's Message verbatim, which group (D1) pins",
  ).toBe(EXPECTED_MESSAGE);
  expect(
    d.range,
    `${label}: §Fix constraint (b) — the refusal is RANGED on the field's value ` +
      "node (the key node when the field carries none), the `valueRange ?? " +
      "keyRange` pattern the `params` arm uses (frontmatter.ts:965–:969); bug " +
      "0069's entry-level code is range-less because the resolver holds no YAML " +
      "positions, and a field-level refusal that reported file-level would point " +
      "the author at the file rather than at the field they mis-wrote",
  ).toEqual(range);
  expect(
    r.registered,
    `${label}: the theta must not register — a \`tools:\` field that cannot be ` +
      "read at all is a stronger failure than an entry with an unresolvable name, " +
      "and code-registry-load.md:26 makes one bad entry un-register the whole theta",
  ).toBe(false);
  expect(
    r.frontmatter,
    `${label}: a refused theta carries no defaulted frontmatter, so nothing ` +
      "downstream can read the discarded field as the absent one",
  ).toBeUndefined();
}

/**
 * The refused shapes, each with the exact `SourceRange` its value node spans.
 *
 * WHY these ranges and where they come from: the frontmatter block's YAML is
 * parsed by the `yaml` library with a `LineCounter` and each field's positions
 * are mapped by `rangeOf` (frontmatter.ts:337–:352) with the block's
 * `lineOffset` — so line 1 is the opening `---` and the frontmatter's first key
 * is line 2. The refusal's range is the shared frontmatter parse's VALUE-node
 * range, with the key range as the fallback for a pair carrying no value node.
 * `extractFrontmatterBlock` joins the fenced lines, so the parsed YAML has no
 * trailing newline: a block collection in LAST frontmatter position ends at the
 * end of the extracted text rather than rolling to column 1 of the next line.
 * That is the same position-variance every other frontmatter refusal's range
 * carries off the same shared parse. Cross-checked against a real ranged
 * frontmatter refusal on the neighbouring surface: `params: null` on the third
 * line reports `3:9`–`3:13`, one column right of `tools:`'s shorter key, which
 * pins both the one-based column convention and the `+1` line offset.
 */
const REFUSED: ReadonlyArray<{
  readonly label: string;
  readonly lines: readonly string[];
  readonly range: SourceRange;
  readonly why: string;
}> = [
  {
    // §Fix constraint (e): the flow mapping is the paradigm case — one line,
    // the whole value highlighted, and the key names a real Pi tool, so the
    // author's text contains `read` and the callable set does not.
    label: "flow mapping `{read: bash}`",
    lines: FLOW_MAP_LINES,
    range: { start: { line: 3, column: 8 }, end: { line: 3, column: 20 } },
    why: "the node kind is the rule",
  },
  {
    // The same node kind with keys that name nothing: the refusal is the node
    // KIND, not the resolvability of what the mapping happens to spell.
    label: "flow mapping `{a: b}`",
    lines: ["mode: prompt", "tools: {a: b}"],
    range: { start: { line: 3, column: 8 }, end: { line: 3, column: 14 } },
    why: "the node kind is the rule",
  },
  {
    // Two members with non-string values: the shape an author reaches by
    // writing entries as YAML keys instead of `read as file_read`.
    label: "flow mapping `{read: 1, grep: 2}`",
    lines: ["mode: prompt", "tools: {read: 1, grep: 2}"],
    range: { start: { line: 3, column: 8 }, end: { line: 3, column: 26 } },
    why: "the node kind is the rule",
  },
  {
    // §Fix constraint (d) demanded a decision on `tools: {}` and the decision
    // is REFUSE: `{}` is a MAPPING, and the equivalence
    // frontmatter-fields-a.md:43 states is `tools: []` — a sequence — which
    // does not extend to a mapping. Emptiness is not the predicate.
    label: "EMPTY flow mapping `{}`",
    lines: ["mode: prompt", "tools: {}"],
    range: { start: { line: 3, column: 8 }, end: { line: 3, column: 10 } },
    why: "§Fix constraint (d) — `{}` is a mapping, not `[]`",
  },
  {
    // The load-bearing spelling: the key names a real Pi tool, so the author's
    // text says `read` and the delivered theta cannot call it. A block mapping
    // is what a `tools:` field acquires from a copy-paste of a `params:` block.
    label: "block mapping `read: bash`",
    lines: BLOCK_MAP_LINES,
    range: { start: { line: 4, column: 3 }, end: { line: 4, column: 13 } },
    why: "the node kind is the rule",
  },
  {
    label: "block mapping `a: b`",
    lines: ["mode: prompt", "tools:", "  a: b"],
    range: { start: { line: 4, column: 3 }, end: { line: 4, column: 7 } },
    why: "the node kind is the rule",
  },
  {
    // A block mapping whose single member has a null value — the shape an
    // author reaches by writing an entry and a stray colon.
    label: "block mapping `read:` (null member value)",
    lines: ["mode: prompt", "tools:", "  read:"],
    range: { start: { line: 4, column: 3 }, end: { line: 4, column: 8 } },
    why: "the node kind is the rule",
  },
  {
    // Nesting does not change the kind, and the range spans the whole nested
    // value — the multi-line span §Fix constraint (c) flagged as a hazard for
    // any route that embedded the recovered TEXT in the message. This route
    // carries a fixed message, so the span reaches only the range.
    label: "nested block mapping",
    lines: ["mode: prompt", "tools:", "  a:", "    b: c"],
    range: { start: { line: 4, column: 3 }, end: { line: 5, column: 9 } },
    why: "the node kind is the rule",
  },
  {
    // A YAML ALIAS is a fourth node kind, and the anchor is planted on the
    // RECOGNISED `description:` key so the row carries no
    // `theta/load/unknown-frontmatter-field` warning of its own (a warning on
    // an unrecognised KEY is not the rule for a recognised key's value shape).
    label: "alias value `tools: *a`",
    lines: ["mode: prompt", "description: &a hi", "tools: *a"],
    range: { start: { line: 4, column: 8 }, end: { line: 4, column: 10 } },
    why: "the node kind is the rule — an alias is neither spelling",
  },
  {
    // The `tools` key with NO value node at all: an explicit key produces a
    // pair whose value is JS null, so there is no shape to judge and the
    // refusal falls back to the KEY range — the fail-closed direction, and the
    // half of §Fix constraint (b) the `valueRange ?? keyRange` pattern exists
    // for. It is NOT the bare `tools:` spelling, which parses as a null SCALAR
    // and keeps `theta/load/unknown-tool` (group (D7)).
    label: "explicit key `? tools` (no value node)",
    lines: ["mode: prompt", "? tools"],
    range: { start: { line: 3, column: 3 }, end: { line: 3, column: 8 } },
    why: "no value node — the key-range fallback",
  },
];

describe("bug 0104 (D2) — a `tools:` value that is neither a scalar nor a sequence is refused, ranged", () => {
  for (const row of REFUSED) {
    it(`RED (D2, ${row.label}): exactly one ranged ${CODE} and the theta is refused (${row.why})`, () => {
      // At HEAD this shape returns `registered=true`, `tools=undefined`,
      // `diags=[]` — byte-identical to the absent field, which is the collapse
      // frontmatter-fields-a.md:36/:39/:41 forbid three times over on the
      // neighbouring fields.
      expectFieldRefused(row.label, parse(theta(row.lines, BODY_NO_CALL)), row.range);
    });
  }

  it(`RED (D2, code-side flow mapping): the same refusal fires when the body NAMES the mapping's key`, () => {
    // §Fix constraint (h): the code-side row is the one whose author gets a
    // diagnostic today, and it names the BODY. The refusal is what makes the
    // frontmatter the subject — same code, same fixed message, same range as
    // the silent row above, whatever the body says.
    expectFieldRefused(
      "code-side flow mapping",
      parse(theta(FLOW_MAP_LINES, BODY_CALLS_READ)),
      { start: { line: 3, column: 8 }, end: { line: 3, column: 20 } },
    );
  });

  it(`RED (D2, code-side block mapping): the same refusal fires when the body NAMES the mapping's key`, () => {
    expectFieldRefused(
      "code-side block mapping",
      parse(theta(BLOCK_MAP_LINES, BODY_CALLS_READ)),
      { start: { line: 4, column: 3 }, end: { line: 4, column: 13 } },
    );
  });
});

// ===========================================================================
// (D5) THE CONTROLS — §Fix constraint (d). The two spellings the spec defines,
// `tools: []`, and the absent field keep loading silently with the value they
// carry today. GREEN at HEAD and required to stay green: these bound the
// refusal to the node kind.
// ===========================================================================

describe("bug 0104 (D5) — the two spellings and the absent-field equivalences stay silent", () => {
  const SILENT: ReadonlyArray<{
    readonly label: string;
    readonly lines: readonly string[];
    readonly tools: readonly string[] | undefined;
    readonly why: string;
  }> = [
    {
      label: "plain scalar `tools: read`",
      lines: ["mode: prompt", "tools: read"],
      tools: ["read"],
      why: "frontmatter-fields-b-and-templates.md:3 — the comma short form IS the YAML plain scalar",
    },
    {
      label: "comma short form `tools: read, grep`",
      lines: ["mode: prompt", "tools: read, grep"],
      tools: ["read", "grep"],
      why: "the plain scalar split on commas, each entry trimmed",
    },
    {
      label: "sequence `- read`",
      lines: ["mode: prompt", "tools:", "  - read"],
      tools: ["read"],
      why: "the YAML list form — one entry per sequence item",
    },
    {
      label: "empty sequence `tools: []`",
      lines: ["mode: prompt", "tools: []"],
      tools: undefined,
      why: "frontmatter-fields-a.md:43 — `tools: []` and an absent `tools:` are equivalent",
    },
    {
      label: "absent `tools:`",
      lines: ["mode: prompt"],
      tools: undefined,
      why: "frontmatter-fields-a.md:43 — the empty callable set is the ABSENT-field behaviour",
    },
  ];

  for (const row of SILENT) {
    it(`GREEN (D5, ${row.label}): loads with no diagnostic and the same callable list`, () => {
      const r = parse(theta(row.lines, BODY_NO_CALL));
      expect(
        diagLines(r),
        `${row.label}: ${row.why} — a refusal wide enough to catch this would ` +
          "refuse input the two spellings admit",
      ).toEqual([]);
      expect(r.registered, `${row.label}: registers`).toBe(true);
      expect(
        r.frontmatter?.tools,
        `${row.label}: the extracted callable list must be byte-identical to baseline`,
      ).toEqual(row.tools);
    });
  }
});

// ===========================================================================
// (D6) BUG 0069's NON-SCALAR SEQUENCE ITEM keeps its own code. GREEN at HEAD.
// ===========================================================================

describe("bug 0104 (D6) — a non-scalar sequence ITEM keeps `theta/load/malformed-tool-entry`", () => {
  it("GREEN (D6): `tools:` over `  - {a: b}` still recovers the item's verbatim source as one entry", () => {
    // frontmatter-fields-a.md:88 closes the ENTRY and the sequence ITEM: the
    // item's verbatim YAML source is recovered at the frontmatter layer
    // (frontmatter.ts:436–:447, bug 0069 §Fix constraint 3) and judged by the
    // resolver's closed per-entry grammar. The field's node kind here is a
    // SEQUENCE — one of the two admitted spellings — so the field-level rule
    // must not reach it, and the entry it produces must reach the entry-level
    // code with the entry's own text and its range-less file-level report.
    const r = parse(theta(["mode: prompt", "tools:", "  - {a: b}"], BODY_NO_CALL));
    expect(
      diagLines(r),
      "the field is a sequence, so the field-level shape rule does not apply: the " +
        "frontmatter layer stays silent and the resolver owns the entry",
    ).toEqual([]);
    expect(
      r.frontmatter?.tools,
      "the item's verbatim YAML source is carried as one entry, unchanged",
    ).toEqual(["{a: b}"]);
  });
});

// ===========================================================================
// (D7) THE TWO NULL SPELLINGS keep `theta/load/unknown-tool` (§Non-goals).
// GREEN at HEAD.
// ===========================================================================

describe("bug 0104 (D7) — the two null spellings take the scalar arm unchanged", () => {
  const NULLS: ReadonlyArray<readonly [string, readonly string[]]> = [
    ["bare `tools:` key", ["mode: prompt", "tools:"]],
    ["explicit `tools: null`", ["mode: prompt", "tools: null"]],
  ];

  for (const [label, lines] of NULLS) {
    it(`GREEN (D7, ${label}): a null SCALAR yields the single entry \`null\`, not a field-shape refusal`, () => {
      // §Non-goals: both spellings parse as a null scalar, take the `isScalar`
      // arm (frontmatter.ts:429–:435) through `String(node.value)`, and
      // un-register loudly at the resolver as
      // `theta/load/unknown-tool: unknown Pi tool 'null'`. Whether that message
      // should name the shape is a separate adjudication and a DIAG-4 reword;
      // the field-level rule must not silently take the input away from it.
      const r = parse(theta(lines, BODY_NO_CALL));
      expect(
        diagLines(r),
        `${label}: the scalar arm admits it, so the frontmatter layer stays silent`,
      ).toEqual([]);
      expect(
        r.frontmatter?.tools,
        `${label}: the single entry \`null\` is what reaches the resolver`,
      ).toEqual(["null"]);
    });
  }
});

// ===========================================================================
// (D3) / (D4) THE PRODUCTION LOAD PATH — the production compose helper over
// a real on-disk `.pi/theta/` discovery workspace, ONE
// theta per workspace.
//
// WHY one theta per workspace: the refusal's Message carries no `<value>`, so
// every refused shape renders the identical string and `ctx.ui.notify` carries
// no caller attribution — inside a shared workspace a notification could not be
// attributed to a row. A per-row load makes both observables (the registered
// set and the notified set) exact for that row.
// ===========================================================================

interface LoadOutcome {
  /** Slash names the production compose helper returned (returned fixtures). */
  readonly registered: readonly string[];
  /** Error-severity diagnostic messages surfaced via `ctx.ui.notify`. */
  readonly notifications: readonly string[];
}

const PRODUCTION_ROWS: ReadonlyArray<{
  readonly stem: string;
  readonly text: string;
}> = [
  // (D3) the two canonical mapping spellings with a body naming NO callable —
  // the registered-and-silent pair this fix removes. The observable at HEAD is
  // a worse model answer with no trace at load.
  { stem: "flowsilent", text: theta(FLOW_MAP_LINES, BODY_NO_CALL) },
  { stem: "blocksilent", text: theta(BLOCK_MAP_LINES, BODY_NO_CALL) },
  // (D4) the same two spellings with a body NAMING the declared tool.
  { stem: "flowcode", text: theta(FLOW_MAP_LINES, BODY_CALLS_READ) },
  { stem: "blockcode", text: theta(BLOCK_MAP_LINES, BODY_CALLS_READ) },
  // (D3) controls — the two spellings, `tools: []`, the absent field.
  { stem: "ctlscalar", text: theta(["mode: prompt", "tools: read"], BODY_NO_CALL) },
  {
    stem: "ctlseq",
    text: theta(["mode: prompt", "tools:", "  - read"], BODY_NO_CALL),
  },
  { stem: "ctlemptyseq", text: theta(["mode: prompt", "tools: []"], BODY_NO_CALL) },
  { stem: "ctlabsent", text: theta(["mode: prompt"], BODY_NO_CALL) },
  // (D6) / (D7) the neighbouring loud shapes, whose codes must not move.
  {
    stem: "seqitem",
    text: theta(["mode: prompt", "tools:", "  - {a: b}"], BODY_NO_CALL),
  },
  { stem: "nullbare", text: theta(["mode: prompt", "tools:"], BODY_NO_CALL) },
  { stem: "nullexplicit", text: theta(["mode: prompt", "tools: null"], BODY_NO_CALL) },
];

const outcomes = new Map<string, LoadOutcome>();
const workspaces: string[] = [];

async function runProductionLoad(cwd: string): Promise<LoadOutcome> {
  const notifications: string[] = [];
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;

  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(pi, ctx);
  return { registered: fixtures.map((f) => f.slashName), notifications };
}

beforeAll(async () => {
  for (const row of PRODUCTION_ROWS) {
    const workspaceDir = mkdtempSync(join(tmpdir(), `theta-bug0104-${row.stem}-`));
    workspaces.push(workspaceDir);
    const projectThetaDir = join(workspaceDir, ".pi", "theta");
    mkdirSync(projectThetaDir, { recursive: true });
    writeFileSync(join(projectThetaDir, `${row.stem}.theta`), row.text, "utf8");
    // A minimal valid settings file pins the fixture's settings read to a known
    // value. An ABSENT settings file is silent (package-and-settings.md
    // §Failure modes), so the plant is hermeticity, not noise suppression.
    writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
    outcomes.set(row.stem, await runProductionLoad(workspaceDir));
  }
});

afterAll(() => {
  for (const dir of workspaces) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** One row's load outcome, or a loud failure naming the row. */
function outcomeOf(stem: string): LoadOutcome {
  const found = outcomes.get(stem);
  if (found === undefined) {
    throw new Error(
      `no production-load outcome for '${stem}': the planted workspace was never loaded, ` +
        `so no assertion below it witnesses anything. Loaded: ${JSON.stringify([...outcomes.keys()])}`,
    );
  }
  return found;
}

/** A row's registered / notified sets, rendered for an assertion message. */
function observed(stem: string): string {
  const o = outcomeOf(stem);
  return (
    ` Registered: ${JSON.stringify(o.registered)}` +
    ` Notified: ${JSON.stringify(o.notifications)}`
  );
}

// The precondition every cell below rests on: the discovery walk reaches the
// planted workspaces and the load path resolves `tools:` at all. Without it an
// empty walk would satisfy every un-registration assertion vacuously.
describe("bug 0104 (D3-0) — the production load path discovered the planted workspaces", () => {
  it("registers the clean scalar control (ctlscalar)", () => {
    expect(
      outcomeOf("ctlscalar").registered,
      "the project `.pi/theta/` discovery walk did not register the clean " +
        "`tools: read` control — the setup precondition is unmet, and no " +
        "un-registration assertion below would witness anything." +
        observed("ctlscalar"),
    ).toContain("ctlscalar");
  });
});

describe("bug 0104 (D3) — a mapping-valued `tools:` field un-registers the theta at production load time", () => {
  const SPELLINGS: ReadonlyArray<readonly [string, string]> = [
    ["flowsilent", "`tools: {read: bash}`"],
    ["blocksilent", "`tools:` over an indented `read: bash`"],
  ];

  for (const [stem, spelling] of SPELLINGS) {
    it(`RED (D3, ${stem}): ${spelling} does not register`, () => {
      // The registered-and-silent half this fix removes: the author's text
      // names `read`, the callable set is empty, and 0001 §"The callable set is
      // the only door" records that the query-time loop installs exactly that
      // set as the model's active tools with no union of the ambient snapshot —
      // so the emptying is not recoverable at query time and load is the only
      // place the author can learn of it.
      expect(
        outcomeOf(stem).registered,
        `${spelling} registered with the EMPTY callable set: the field the author ` +
          "wrote was discarded and the theta runs as if `tools:` were absent." +
          observed(stem),
      ).not.toContain(stem);
    });

    it(`RED (D3, ${stem}): the load path surfaces the field-shape rejection`, () => {
      expect(
        outcomeOf(stem).notifications,
        `no diagnostic at any severity names the malformed \`tools:\` field: the ` +
          "silent half of this defect has no trace at load." + observed(stem),
      ).toContain(EXPECTED_MESSAGE);
    });
  }

  const CONTROLS: ReadonlyArray<readonly [string, string]> = [
    ["ctlscalar", "the plain scalar spelling"],
    ["ctlseq", "the YAML list spelling"],
    ["ctlemptyseq", "`tools: []`"],
    ["ctlabsent", "the absent field"],
  ];

  for (const [stem, what] of CONTROLS) {
    it(`GREEN (D3, ${stem}): ${what} still registers`, () => {
      // §Fix constraint (d): the refusal distinguishes present-with-a-bad-shape
      // from absent. Registration is the per-row observable that is sound here
      // — the refusal's message carries no `<value>`, so a notification is not
      // attributable to a row inside a shared workspace, which is why each row
      // gets its own load.
      expect(
        outcomeOf(stem).registered,
        `${what} must keep registering with the empty-or-resolved callable set it ` +
          "carries today." + observed(stem),
      ).toContain(stem);
      expect(
        outcomeOf(stem).notifications,
        `${what} must draw no field-shape refusal.` + observed(stem),
      ).not.toContain(EXPECTED_MESSAGE);
    });
  }
});

describe("bug 0104 (D4) — the code-side pair's failure is attributed to the `tools:` field", () => {
  const SPELLINGS: ReadonlyArray<readonly [string, string]> = [
    ["flowcode", "`tools: {read: bash}`"],
    ["blockcode", "`tools:` over an indented `read: bash`"],
  ];

  for (const [stem, spelling] of SPELLINGS) {
    it(`RED (D4, ${stem}): ${spelling} plus a body calling \`read\` surfaces the field-shape rejection`, () => {
      // At HEAD this row's ONLY signal is
      // `theta/parse/unknown-identifier: unknown identifier 'read'` at the call
      // site, plus the `theta/parse/bare-object-literal` cascade on its
      // argument — a diagnostic whose subject is an UNDECLARED name, pointing
      // the author (and whoever triages the report) at the body. The refusal is
      // what makes the field the subject.
      //
      // Neither the presence nor the absence of that body diagnostic is
      // asserted, in either direction. Measured oracle: an error-severity
      // frontmatter refusal withholds the frontmatter but does NOT stop the body
      // checks — `tools: read` plus `params: null` plus a `read(...)` call
      // yields `theta/load/params-null` AND
      // `theta/parse/unknown-identifier: unknown identifier 'read'` AND the
      // bare-object cascade — so the field refusal joins the body diagnostics
      // rather than replacing them, and an absence assertion here could never go
      // green. What this cell pins is that the refusal reaches the code-side row
      // at all: a later narrowing that stopped refusing this shape reds here.
      expect(
        outcomeOf(stem).notifications,
        `${spelling} with a body naming the declared tool surfaces no diagnostic ` +
          "about the `tools:` field: the reason given names the body instead." +
          observed(stem),
      ).toContain(EXPECTED_MESSAGE);
    });

    it(`GREEN (D4, ${stem}): ${spelling} plus a body calling \`read\` does not register`, () => {
      // Green at HEAD for the wrong reason (the body's unresolved identifier)
      // and after the fix for the right one (the field refusal). Pinned so the
      // refusal cannot be landed as a warning: an `E`-severity code is what
      // holds this verdict once the body diagnostic is not the cause.
      expect(
        outcomeOf(stem).registered,
        `${spelling} with a body naming the declared tool must not register.` +
          observed(stem),
      ).not.toContain(stem);
    });
  }
});

describe("bug 0104 (D6/D7 at production load) — the neighbouring loud shapes keep their codes", () => {
  it("GREEN (D6): `- {a: b}` keeps `theta/load/malformed-tool-entry` naming the item verbatim", () => {
    // frontmatter-fields-a.md:88's ENTRY-level rule, unchanged: the field is a
    // sequence — an admitted spelling — so the field-level refusal must not
    // reach it, and the entry-level code keeps its verbatim `<value>` and its
    // range-less file-level report (the resolver holds no YAML positions,
    // src/parser/callable-set.ts).
    const o = outcomeOf("seqitem");
    expect(
      o.registered,
      "bug 0069's non-scalar sequence item must keep un-registering." +
        observed("seqitem"),
    ).not.toContain("seqitem");
    expect(
      o.notifications,
      "the entry-level rejection message must be unchanged." + observed("seqitem"),
    ).toContain(MALFORMED_ENTRY_MESSAGE);
    expect(
      o.notifications,
      "a sequence is one of the two admitted spellings, so the field-level " +
        "refusal must not fire for it — one input, one rule." + observed("seqitem"),
    ).not.toContain(EXPECTED_MESSAGE);
  });

  const NULLS: ReadonlyArray<readonly [string, string]> = [
    ["nullbare", "the bare `tools:` key"],
    ["nullexplicit", "`tools: null`"],
  ];

  for (const [stem, what] of NULLS) {
    it(`GREEN (D7, ${stem}): ${what} keeps \`theta/load/unknown-tool\``, () => {
      // §Non-goals: both spellings parse as a null SCALAR, so they take the
      // admitted scalar arm and un-register loudly at the resolver. The
      // degenerate neighbouring spelling is already loud; the field-level rule
      // must not take the input away from the code that owns it.
      const o = outcomeOf(stem);
      expect(
        o.registered,
        `${what} must keep un-registering.` + observed(stem),
      ).not.toContain(stem);
      expect(
        o.notifications,
        `${what} must keep the unknown-tool message.` + observed(stem),
      ).toContain(UNKNOWN_TOOL_NULL_MESSAGE);
      expect(
        o.notifications,
        `${what} takes the scalar arm, so no field-shape refusal fires.` +
          observed(stem),
      ).not.toContain(EXPECTED_MESSAGE);
    });
  }
});
