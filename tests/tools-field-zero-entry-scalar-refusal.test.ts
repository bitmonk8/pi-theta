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

// Bug 0206 — a `tools:` value that IS one of the two admitted spellings (a
// quoted or block SCALAR) but whose comma split yields ZERO entries registers
// the theta with the empty callable set and no diagnostic at any severity,
// byte-identically to an absent `tools:` field.
//
// The mechanism is one expression. `extractToolsList`'s scalar arm
// (src/parser/frontmatter.ts:536–541) splits `String(node.value)` on commas,
// trims, filters empties, and then :541 collapses a zero-length result to
// `undefined` — the same answer a genuinely absent field gives. The `tools` arm
// of the frontmatter key walk (:1054, routing at :1134–:1169) routes every scalar
// to that function and records 0104's field-level refusal range (:997) only in
// the `else`, so the refusal cannot reach the input; :1512 then omits the
// `tools` key from the returned frontmatter, and
// `resolveThetaToolsAtLoad`'s early return
// (src/extension/production-composition.ts:1863–1872, reaching the frozen
// `EMPTY_CALLABLE_SET` at :1828) answers the empty callable set by its
// `toolsList === undefined` disjunct. An author-written `tools:` field that
// declares nothing is therefore indistinguishable at load from no field at all
// (docs/bugs/0206-zero-entry-tools-scalar-loads-empty-callable-set.md).
//
// This file is bug 0206's witness and the value-EMPTINESS half of the field
// whose node-KIND half is bug 0104's
// (tests/tools-field-shape-refusal.test.ts, groups (D1)–(D7)). It is a separate
// file, and its groups are lettered (E…) to continue that file's sequence,
// because 0104's witness is a landed, green, byte-locked artifact: its (D5)
// control rows and its (D3) production workspaces are the blast-radius pins
// this fix must not disturb, and hosting a second bug's matrix there would edit
// the input of another bug's assertions.
//
// SPEC ANCHORS (the contract, not the current code — every line re-derived at
// HEAD 590fc43e / 0.127.0):
//   - docs/spec_topics/frontmatter/frontmatter-fields-a.md:36 / :39 / :41 (the
//     `mode`, `model`, `bind_context` field-contract rows) — the principle
//     stated three times: `"missing" and "present-but-bad" do not collapse into
//     one code, because the authoring intent differs`. A `tools:` field that
//     spells no entry is present-but-bad; the absent field is missing.
//   - :43 (the `tools` field-contract row) and :74 (§`tools`) — the empty
//     callable set is the ABSENT-field behaviour, and the ONE equivalence
//     extended to it is `tools: []`. A zero-entry scalar is in neither the
//     equivalence set nor the refused set.
//   - docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:3
//     (§YAML-shape) — the two interchangeable spellings, and :18 — the `tools:`
//     rejection family, every member of which prevents registration.
//   - docs/spec_topics/diagnostics/code-registry-load.md:26 — the
//     `theta/load/malformed-tools-field` row bug 0104 landed. Its *Message*
//     needs no reword for this class (it names the FIELD and states the
//     expectation the input fails), so DIAG-4
//     (docs/spec_topics/diagnostics/diagnostic-shape.md:74) is not engaged; its
//     *Trigger* widening is the DIAG-2 half (:72) landing with the enforcement.
//   - docs/spec_topics/governance/source-language-stability.md:9 (the
//     loads-cleanly predicate — every subject row below emits no `E`-severity
//     diagnostic today) and :25 (the diagnostic-registry carve-out, which
//     covers a code addition for inputs that did not previously emit it).
//   - docs/bugs/0001-extension-tools-unreachable.md §"The callable set is the
//     only door" — the query-time loop installs exactly the theta's callable
//     set as the model's active tools with no union of the ambient snapshot, so
//     an emptied set is not recoverable after load and load is the only place
//     the author can learn of it.
//
// THE PINNED POST-FIX CONTRACT (bug 0206 §Fix, ROUTE A, settled by the parent):
//   1. A `tools:` value that is a scalar whose comma split yields zero entries
//      is REFUSED under 0104's EXISTING registered code
//      `theta/load/malformed-tools-field` (severity error, phase load). No new
//      code, no new *Message*, no reword — group (E1) sources the string from
//      the registry so the assertions below are pinned to the normative Message
//      rather than to a restatement.
//   2. The theta does NOT register, and the frontmatter is withheld.
//   3. The refusal is RANGED on the value node with the `valueRange ??
//      keyRange` fallback the arm already computes (frontmatter.ts:1159),
//      matching 0104's range convention.
//   4. The enforcement is keyed on the SCALAR arm, not on `extractToolsList`
//      answering `undefined`: the sequence arm collapses to `undefined` too
//      (:450), so a predicate over the return value alone would refuse
//      `tools: []` — the spelling frontmatter-fields-a.md:43 declares
//      equivalent to absent. §Fix constraint (a) and group (E3) pin that.
//   5. §Fix constraint (b), one input one rule: the quoted flow spellings and
//      the block-scalar spellings (`|`, `>-`) get the same disposition.
//
// PROBED CURRENT SIGNATURES (HEAD 590fc43e / 0.127.0, offline, deterministic,
// re-measured in this worktree). `parseFrontmatter`, reading `.registered` /
// `.frontmatter?.tools` / `"tools" in .frontmatter` / `.diagnostics`:
//   tools: "" / '' / " , " / "," / ",,," / "   "     registered=true tools=undefined key=absent diags=[]
//   tools: !!str / !<tag:yaml.org,2002:str> / &a !!str  registered=true tools=undefined key=absent diags=[]
//   tools: !!str "  " / &anchor ''                registered=true tools=undefined key=absent diags=[]
//   tools: | over an indented `,`                    registered=true tools=undefined key=absent diags=[]
//   tools: >- over an indented blank                 registered=true tools=undefined key=absent diags=[]
//   tools: [] / absent field                         registered=true tools=undefined key=absent diags=[]
//   tools: read / read, grep / `  read  ` / - read    tools=["read"] / ["read","grep"] / ["read"] / ["read"] diags=[]
//   bare `tools:` / tools: null                      tools=["null"] diags=[]
//   tools: , / , , / ,read,                          registered=false diags=[error theta/load/missing-mode]
// The eight subject rows are byte-identical to the two rows the spec declares
// equivalent-to-absent, and to each other. Through the shipped composition
// root, one theta per planted workspace: `tools: ""` and `tools: " , "` both
// register with ZERO notifications.
//
// WHAT IS RED HERE AND WHY: (E2)'s eight rows red on the FIRST assertion — the
// diagnostic list is empty where exactly one error-severity refusal is required
// — and would then red on the range, on `registered`, and on the withheld
// frontmatter. (E5)'s two subject rows red twice each: the theta is in the
// registered set and no notification carries the refusal.
//
// GREEN BY DESIGN and required to stay green: (E1) (0104's registry row is
// already landed, so this group is a precondition, not a red); (E3)'s nine
// control rows, which bound the fix to the zero-entry SCALAR and keep
// `tools: []`, the absent field and the two null spellings byte-identical
// (§Non-goals, §Fix constraint (a)); (E4)'s three out-of-class YAML-error rows,
// re-verified at HEAD before being asserted; and (E5)'s precondition cell plus
// its control rows.
//
// TIER: unit, offline, provider-free, deterministic — in two halves, mirroring
// bug 0104's witness. The `parseFrontmatter` half is the only harness that can
// witness the RANGE and per-row attribution: the refusal's Message carries no
// `<value>`, so every refused input renders the identical string and a
// notification could not be attributed to a row inside a shared workspace. The
// composition-root half proves the frontmatter-layer refusal reaches
// `discoverAndComposeFixtures`'s fixtures over a real on-disk `.pi/theta/`
// walk. No integration or live tier is needed for the observable: registration
// and its diagnostics settle before any model, provider or transport exists.
//
// NO SILENT SKIPPING: every production row is asserted against a per-row
// outcome that the (E5) precondition cell proves non-vacuous, and every helper
// that cannot find its row THROWS naming the row.

// ===========================================================================
// (E1) THE REGISTRY ANCHOR — 0104's landed code, sourced not restated.
// ===========================================================================

const CODE = "theta/load/malformed-tools-field";

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
 * `undefined` comparison (DIAG-4). The same helper bug 0104's witness uses.
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
 * The refusal's normative Message, READ from the registry rather than restated
 * here: bug 0206 §Fix route A reuses 0104's row unchanged, so the registry page
 * is the single source of truth and a future DIAG-4 reword moves this witness
 * with it. The template carries no placeholder, so no rendering step applies.
 */
const REFUSAL_MESSAGE = templateMessage(CODE);

/** `theta/load/unknown-tool` rendered for the two null spellings (group (E5)). */
const UNKNOWN_TOOL_NULL_MESSAGE = templateMessage(
  "theta/load/unknown-tool",
).replaceAll("<name>", "null");

describe("bug 0206 (E1) — the refusal reuses 0104's registered code", () => {
  it(`GREEN (E1): code-registry-load.md carries ${CODE} at severity E, phase load, with no placeholder`, () => {
    // A precondition, not a red: 0104 shipped this row in 0.127.0. Route A
    // reuses it, so if the row moved or its Message changed under this witness,
    // every assertion below would be pinned to a string the shipped code no
    // longer emits and the reds would be uninterpretable.
    const row = REGISTRY.find((r) => r.code === CODE);
    expect(
      row,
      `${CODE} has no row in docs/spec_topics/diagnostics/code-registry-load.md: ` +
        "bug 0206 §Fix route A reuses bug 0104's landed row, so its absence means " +
        "this witness has no normative Message to assert against",
    ).toBeDefined();
    expect(
      (row as RegistryRow).severity,
      "severity E — registration is gated on error severity, and the whole " +
        "`tools:` rejection family prevents registration " +
        "(frontmatter-fields-b-and-templates.md:18)",
    ).toBe("E");
    expect(
      (row as RegistryRow).phase,
      "phase load — the check runs at the frontmatter read, where the field's " +
        "YAML node and its range are still in hand (frontmatter.ts:1161–1169)",
    ).toBe("load");
    expect(
      REFUSAL_MESSAGE,
      "the Message carries no `<…>` placeholder: the refusal names the field's " +
        "shape, not the offending text, so route A needs no placeholder rule and " +
        "no DIAG-4 reword (diagnostic-shape.md:74)",
    ).not.toMatch(/<[a-z_]+>/);
  });
});

// ===========================================================================
// (E2) THE ZERO-ENTRY SCALAR MATRIX AND THE RANGE, on `parseFrontmatter`.
// RED at HEAD: every row below returns `registered=true`, `tools=undefined`,
// no `tools` key and `diags=[]` (measured) — byte-identical to an absent field.
// ===========================================================================

const matcher: ModelReferenceMatcher = { resolve: () => "resolved" };

/** Parse a whole `.theta` source through the shipped frontmatter reader. */
function parse(source: string): FrontmatterParseResult {
  return parseFrontmatter(source, { file: "bug0206.theta", modelMatcher: matcher });
}

/** Every diagnostic rendered `<severity> <code>`, in emission order. */
function diagCodes(r: FrontmatterParseResult): string[] {
  return r.diagnostics.map((d) => `${d.severity} ${d.code}`);
}

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(r: FrontmatterParseResult): string[] {
  return r.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** A body that names NO callable, so the `tools:` field is the only subject. */
const BODY_NO_CALL = "@`hi`";

/** A `.theta` source: `---`, the frontmatter lines, `---`, then the body. */
function theta(frontmatterLines: readonly string[], body: string): string {
  return ["---", ...frontmatterLines, "---", body].join("\n") + "\n";
}

/**
 * The refusal contract every zero-entry scalar shares: EXACTLY ONE diagnostic
 * — 0104's code at error severity, its message the registry's Message verbatim,
 * its range the field's VALUE node — the theta not registered, and the
 * frontmatter withheld.
 *
 * The count/code/severity assertion runs FIRST so the red at HEAD names the
 * symptom bug 0206 reports (no diagnostic at any severity for a field that
 * declares no entry) rather than a message or range mismatch.
 */
function expectZeroEntryRefused(
  label: string,
  r: FrontmatterParseResult,
  range: SourceRange,
): void {
  expect(
    diagCodes(r),
    `${label}: frontmatter-fields-a.md:43 extends the absent-field behaviour to ` +
      "exactly ONE other spelling, `tools: []`, and :36/:39/:41 forbid three " +
      "times over the collapse of present-but-bad onto missing, so the honest " +
      `coverage of a scalar that spells no entry is EXACTLY ONE error-severity ${CODE}. ` +
      `Rendered diagnostics: ${JSON.stringify(diagLines(r))}`,
  ).toEqual([`error ${CODE}`]);
  const d = r.diagnostics[0];
  if (d === undefined) {
    throw new Error(
      `${label}: diagnostics[0] absent after a one-element count assertion`,
    );
  }
  expect(
    d.message,
    `${label}: bug 0206 §Fix route A reuses 0104's Message unchanged — it names ` +
      "the FIELD and states an expectation a scalar spelling no entry fails, so " +
      "no reword is needed and DIAG-4 is not engaged",
  ).toBe(REFUSAL_MESSAGE);
  expect(
    d.range,
    `${label}: §Fix route A ranges the refusal on the VALUE node via the ` +
      "`valueRange ?? keyRange` fallback the arm already computes " +
      "(frontmatter.ts:1159) — the author mis-wrote the value, not the key, and a " +
      "file-level report would point them at the file instead of at the field",
  ).toEqual(range);
  expect(
    r.registered,
    `${label}: the theta must not register — every member of the \`tools:\` ` +
      "rejection family prevents registration " +
      "(frontmatter-fields-b-and-templates.md:18), and the callable set is the " +
      "only door (bug 0001), so an emptied set is unrecoverable after load",
  ).toBe(false);
  expect(
    r.frontmatter,
    `${label}: a refused theta carries no defaulted frontmatter, so nothing ` +
      "downstream can read the discarded field as the absent one",
  ).toBeUndefined();
}

/**
 * The eight subject rows of bug 0206 §Reproduction, each with the exact
 * `SourceRange` its value node spans.
 *
 * WHY these ranges and where they come from: they are MEASURED, not guessed.
 * The frontmatter block's YAML is the fenced lines joined with `\n` and NO
 * trailing newline (`extractFrontmatterBlock`, frontmatter.ts:331–341), parsed
 * once by the `yaml` library with a `LineCounter` (:988, :992) and mapped by
 * `rangeOf` (:345–361) with the block's `lineOffset` of 1 — so line 1 is the
 * opening `---` and the frontmatter's first key is line 2. Each expected range
 * below was measured by an oracle replicating that extraction and mapping
 * byte-for-byte, cross-checked against a range the SHIPPED parser reports
 * today: bug 0104's `tools: {read: bash}` refusal on the same line reports
 * `3:8`–`3:20`, and the oracle reproduces `3:8`–`3:20` for it. Bug 0104's
 * review finding F1 rejected an oracle that appended a trailing newline; this
 * one appends nothing, which is why the block-scalar rows end at the end of
 * their own last line rather than rolling to column 1 of the next.
 */
const ZERO_ENTRY: ReadonlyArray<{
  readonly label: string;
  readonly lines: readonly string[];
  readonly range: SourceRange;
  readonly why: string;
}> = [
  {
    // The realistic vector of §Why it matters: GENERATED frontmatter, where a
    // scaffolder emits `tools: "<substituted>"` and the substitution is empty.
    // YAML admits the empty string; the field's intent does not.
    label: 'empty double-quoted `tools: ""`',
    lines: ["mode: prompt", 'tools: ""'],
    range: { start: { line: 3, column: 8 }, end: { line: 3, column: 10 } },
    why: "the substitution produced nothing",
  },
  {
    label: "empty single-quoted `tools: ''`",
    lines: ["mode: prompt", "tools: ''"],
    range: { start: { line: 3, column: 8 }, end: { line: 3, column: 10 } },
    why: "the same emptiness, the other quote",
  },
  {
    // The substitution collapsed to separators — the shape a generator emits
    // when it joins an empty entry list with `, `.
    label: 'comma-only quoted `tools: " , "`',
    lines: ["mode: prompt", 'tools: " , "'],
    range: { start: { line: 3, column: 8 }, end: { line: 3, column: 13 } },
    why: "separators survived, entries did not",
  },
  {
    label: 'single comma `tools: ","`',
    lines: ["mode: prompt", 'tools: ","'],
    range: { start: { line: 3, column: 8 }, end: { line: 3, column: 11 } },
    why: "separators survived, entries did not",
  },
  {
    label: 'commas only `tools: ",,,"`',
    lines: ["mode: prompt", 'tools: ",,,"'],
    range: { start: { line: 3, column: 8 }, end: { line: 3, column: 13 } },
    why: "separators survived, entries did not",
  },
  {
    // Whitespace-only: the `.filter((entry) => entry.length > 0)` at :437 eats
    // it after the trim, and :438 collapses the empty result to `undefined`.
    label: 'whitespace only `tools: "   "`',
    lines: ["mode: prompt", 'tools: "   "'],
    range: { start: { line: 3, column: 8 }, end: { line: 3, column: 13 } },
    why: "the trim-then-filter pair eats it",
  },
  {
    // §Fix constraint (b), one input one rule: a block literal is a SCALAR and
    // takes the same arm. A route that refused only the quoted flow spellings
    // would leave the same silence one spelling over. The range spans from the
    // `|` indicator to the end of the block's last line.
    label: "block literal `tools: |` over an indented `,`",
    lines: ["mode: prompt", "tools: |", "  ,"],
    range: { start: { line: 3, column: 8 }, end: { line: 4, column: 4 } },
    why: "§Fix constraint (b) — a block scalar is a scalar",
  },
  {
    // The folded spelling over an indented blank line: the value folds to the
    // empty string, so the split yields nothing at all.
    label: "folded `tools: >-` over an indented blank line",
    lines: ["mode: prompt", "tools: >-", "  "],
    range: { start: { line: 3, column: 8 }, end: { line: 4, column: 3 } },
    why: "§Fix constraint (b) — a block scalar is a scalar",
  },
  {
    // The TAGGED plain spellings. An explicit `!!str` tag resolves the empty
    // plain scalar to the string "" rather than to null, so the value reaches
    // the comma split and yields no entry — the `yaml` library reports the node
    // as `{ type: "PLAIN", value: "" }` with no parse error (measured). These
    // rows are why the refused class is stated as its predicate (a scalar whose
    // comma split yields no entry) rather than as the closed set of quoted and
    // block spellings: the exclusion that holds is the UNTAGGED plain scalar,
    // pinned by (E3)'s two null rows.
    //
    // The range is ZERO-WIDTH because the value node spans no source
    // characters: the tag is not part of the scalar's own extent, so the value
    // starts and ends at the column just past it.
    label: "tagged empty plain `tools: !!str`",
    lines: ["mode: prompt", "tools: !!str"],
    range: { start: { line: 3, column: 13 }, end: { line: 3, column: 13 } },
    why: "an explicit tag carries an empty PLAIN scalar to the string, not to null",
  },
  {
    // The verbose tag form of the same forcing, so the rule is not read as
    // keyed on the `!!` shorthand.
    label: "verbose-tagged empty plain `tools: !<tag:yaml.org,2002:str>`",
    lines: ["mode: prompt", "tools: !<tag:yaml.org,2002:str>"],
    range: { start: { line: 3, column: 32 }, end: { line: 3, column: 32 } },
    why: "the verbose tag resolves the same way as the `!!str` shorthand",
  },
  {
    // An ANCHOR on the tagged empty plain scalar: anchoring changes neither the
    // node kind nor the resolved value, so the row must share the disposition.
    label: "anchored tagged empty plain `tools: &a !!str`",
    lines: ["mode: prompt", "tools: &a !!str"],
    range: { start: { line: 3, column: 16 }, end: { line: 3, column: 16 } },
    why: "an anchor changes neither the node kind nor the empty value",
  },
  {
    // A tag in front of a QUOTED whitespace-only scalar: the tag is redundant
    // there (the quoting already forces a string), and the node keeps its
    // QUOTE_DOUBLE style — so this row pins that a tag neither rescues nor
    // re-classifies an already-quoted zero-entry value.
    label: 'tagged quoted whitespace `tools: !!str "  "`',
    lines: ["mode: prompt", 'tools: !!str "  "'],
    range: { start: { line: 3, column: 14 }, end: { line: 3, column: 18 } },
    why: "the tag is redundant on a quoted scalar and changes nothing",
  },
  {
    label: "anchored empty quoted `tools: &anchor ''`",
    lines: ["mode: prompt", "tools: &anchor ''"],
    range: { start: { line: 3, column: 16 }, end: { line: 3, column: 18 } },
    why: "an anchor changes neither the node kind nor the empty value",
  },
];

describe("bug 0206 (E2) — a `tools:` scalar whose comma split yields zero entries is refused, ranged", () => {
  for (const row of ZERO_ENTRY) {
    it(`RED (E2, ${row.label}): exactly one ranged ${CODE} and the theta is refused (${row.why})`, () => {
      // At HEAD this row returns `registered=true`, `tools=undefined`, no
      // `tools` key and `diags=[]` — the collapse onto the absent field that
      // frontmatter-fields-a.md:36/:39/:41 forbid for the neighbouring fields.
      expectZeroEntryRefused(
        row.label,
        parse(theta(row.lines, BODY_NO_CALL)),
        row.range,
      );
    });

    it(`RED (E2, ${row.label}): the returned frontmatter carries no \`tools\` key`, () => {
      // The downstream consequence, asserted separately so the red is legible
      // even if the range convention is later revised: `:1512` spreads `tools`
      // only when defined, so a refused-but-registered theta would be
      // indistinguishable from an absent field to every `frontmatter.tools`
      // reader, including `resolveThetaToolsAtLoad`'s `toolsList === undefined`
      // disjunct (production-composition.ts:1864).
      const r = parse(theta(row.lines, BODY_NO_CALL));
      expect(
        r.frontmatter,
        `${row.label}: the frontmatter must be withheld entirely, so no reader ` +
          "can treat the declared-but-empty field as an undeclared one",
      ).toBeUndefined();
    });
  }
});

// ===========================================================================
// (E3) THE CONTROLS — §Non-goals and §Fix constraint (a). GREEN at HEAD and
// required to stay green: they key the fix to the zero-entry SCALAR outcome and
// not to `extractToolsList` answering `undefined`, which the sequence arm does
// too (frontmatter.ts:555).
// ===========================================================================

describe("bug 0206 (E3) — the equivalence set, the populated spellings and the null spellings stay byte-identical", () => {
  const CONTROLS: ReadonlyArray<{
    readonly label: string;
    readonly lines: readonly string[];
    readonly tools: readonly string[] | undefined;
    readonly why: string;
  }> = [
    {
      label: "empty sequence `tools: []`",
      lines: ["mode: prompt", "tools: []"],
      tools: undefined,
      why:
        "frontmatter-fields-a.md:43 — `tools: []` and an absent `tools:` are " +
        "equivalent. The sequence arm collapses to `undefined` exactly as the " +
        "scalar arm does, so a fix keyed on the RETURN VALUE would refuse this row",
    },
    {
      label: "absent `tools:`",
      lines: ["mode: prompt"],
      tools: undefined,
      why: "frontmatter-fields-a.md:43 — the empty callable set is the ABSENT-field behaviour",
    },
    {
      label: "plain scalar `tools: read`",
      lines: ["mode: prompt", "tools: read"],
      tools: ["read"],
      why: "frontmatter-fields-b-and-templates.md:3 — the comma short form IS the plain scalar",
    },
    {
      label: "comma short form `tools: read, grep`",
      lines: ["mode: prompt", "tools: read, grep"],
      tools: ["read", "grep"],
      why: "the plain scalar split on commas, each entry trimmed",
    },
    {
      label: "padded scalar `tools:   read  `",
      lines: ["mode: prompt", "tools:   read  "],
      tools: ["read"],
      why:
        "the trim that makes the padding harmless is the same trim the subject " +
        "rows exploit, so this row bounds the refusal to a split yielding NO entry",
    },
    {
      label: "sequence `- read`",
      lines: ["mode: prompt", "tools:", "  - read"],
      tools: ["read"],
      why: "the YAML list form — one entry per sequence item",
    },
    {
      label: "quoted scalar carrying one entry `tools: \"read\"`",
      lines: ["mode: prompt", 'tools: "read"'],
      tools: ["read"],
      why:
        "the QUOTED spelling is not itself the defect: quoting is refused only " +
        "when the split yields no entry",
    },
    {
      label: "bare `tools:` key (null scalar)",
      lines: ["mode: prompt", "tools:"],
      tools: ["null"],
      why:
        "§Non-goals — a null scalar takes the same arm through " +
        "`String(node.value)` and yields the single entry `null`, which " +
        "un-registers loudly at the resolver as `theta/load/unknown-tool`. It " +
        "produces ONE entry, so the zero-entry rule must not take the input away " +
        "from the code that already owns it",
    },
    {
      label: "explicit `tools: null`",
      lines: ["mode: prompt", "tools: null"],
      tools: ["null"],
      why: "§Non-goals — the second null spelling, same arm, same single entry",
    },
    {
      label: "untagged whitespace-only plain `tools:    `",
      lines: ["mode: prompt", "tools:    "],
      tools: ["null"],
      why:
        "the exclusion the spec prose states — an UNTAGGED empty or " +
        "whitespace-only plain scalar is a null scalar, so it produces the single " +
        "entry `null` and keeps `theta/load/unknown-tool` rather than reaching the " +
        "zero-entry rule. Only an explicit tag forces the empty STRING there, " +
        "which is the (E2) tagged-plain rows",
    },
  ];

  for (const row of CONTROLS) {
    it(`GREEN (E3, ${row.label}): loads with no diagnostic and the same callable list`, () => {
      const r = parse(theta(row.lines, BODY_NO_CALL));
      expect(
        diagLines(r),
        `${row.label}: ${row.why} — a refusal wide enough to catch this row would ` +
          "change behaviour §Fix constraint (a) requires byte-identical",
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
// (E4) THE OUT-OF-CLASS BOUNDARY — an UNQUOTED leading comma is a YAML
// indicator, so the frontmatter block fails to parse. FM-5
// (src/parser/frontmatter.ts, the discard around the `parseDocument` call)
// discards the recovered contents, and bug 0263 §Fix constraint 1 moved WHICH
// code that discard reports — the general frontmatter-parse-failure row now
// names the parser's own verdict in place of the `theta/load/missing-mode`
// this group used to assert on a file whose `mode:` line is present and
// correct. These rows are loud already, for a different reason, and the
// zero-entry rule must not change which (registered === false) family they
// carry. GREEN at HEAD; re-measured in this worktree before being asserted.
// ===========================================================================

describe("bug 0206 (E4) — an unquoted comma-leading value stays a YAML parse failure", () => {
  const YAML_ERRORS: ReadonlyArray<readonly [string, readonly string[]]> = [
    ["`tools: ,`", ["mode: prompt", "tools: ,"]],
    ["`tools: , ,`", ["mode: prompt", "tools: , ,"]],
    ["`tools: ,read,`", ["mode: prompt", "tools: ,read,"]],
    // Tagged, and still a parse failure: the indicator is rejected by the YAML
    // scanner before any tag resolution, so the "comma-leading plain scalar is
    // a YAML parse error" exclusion holds for the tagged spelling too.
    ["`tools: !!str ,`", ["mode: prompt", "tools: !!str ,"]],
  ];

  for (const [label, lines] of YAML_ERRORS) {
    it(`GREEN (E4, ${label}): un-registers under \`theta/load/malformed-frontmatter-yaml\`, not under the field refusal`, () => {
      // FM-5 (src/parser/frontmatter.ts, the discard around the `parseDocument`
      // call): the `yaml` lib recovers from the bad indicator and exposes the
      // damage in `doc.errors`, so the whole recovered mapping is discarded and
      // the general frontmatter-parse-failure code fires, keyed to that first
      // error (bug 0263 §Fix). The `tools` arm is never reached, which is why
      // this class cannot be folded into (E2): the value node the refusal
      // would range on does not exist. The rule is that the fix must not MOVE
      // this row to the field-level code.
      const r = parse(theta(lines, BODY_NO_CALL));
      expect(
        diagCodes(r),
        `${label}: an unquoted leading comma is a YAML indicator, so the ` +
          "frontmatter block never parses and the `tools` arm is never reached." +
          ` Rendered diagnostics: ${JSON.stringify(diagLines(r))}`,
      ).toEqual(["error theta/load/malformed-frontmatter-yaml"]);
      expect(r.registered, `${label}: does not register`).toBe(false);
    });
  }
});

// ===========================================================================
// (E5) THE PRODUCTION LOAD PATH — the shipped composition root
// (`discoverAndComposeFixtures`) over a real on-disk `.pi/theta/` discovery
// workspace, ONE theta per workspace.
//
// WHY one theta per workspace: the refusal's Message carries no `<value>`, so
// every refused input renders the identical string and `ctx.ui.notify` carries
// no caller attribution — inside a shared workspace a notification could not be
// attributed to a row. A per-row load makes both observables (the registered
// set and the notified set) exact for that row.
// ===========================================================================

interface LoadOutcome {
  /** Slash names the shipped composition root returned (registered fixtures). */
  readonly registered: readonly string[];
  /** Error-severity diagnostic messages surfaced via `ctx.ui.notify`. */
  readonly notifications: readonly string[];
}

const PRODUCTION_ROWS: ReadonlyArray<{
  readonly stem: string;
  readonly text: string;
}> = [
  // The two subject spellings of §Reproduction's production table.
  { stem: "emptystr", text: theta(["mode: prompt", 'tools: ""'], BODY_NO_CALL) },
  { stem: "commaonly", text: theta(["mode: prompt", 'tools: " , "'], BODY_NO_CALL) },
  // The non-vacuity precondition plus the equivalence-set controls.
  { stem: "ctlscalar", text: theta(["mode: prompt", "tools: read"], BODY_NO_CALL) },
  { stem: "ctlemptyseq", text: theta(["mode: prompt", "tools: []"], BODY_NO_CALL) },
  { stem: "ctlabsent", text: theta(["mode: prompt"], BODY_NO_CALL) },
  // The null spellings, whose loud outcome must not move (§Non-goals).
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
    const workspaceDir = mkdtempSync(join(tmpdir(), `theta-bug0206-${row.stem}-`));
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
describe("bug 0206 (E5-0) — the production load path discovered the planted workspaces", () => {
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

describe("bug 0206 (E5) — a zero-entry `tools:` scalar un-registers the theta at production load time", () => {
  const SUBJECTS: ReadonlyArray<readonly [string, string]> = [
    ["emptystr", '`tools: ""`'],
    ["commaonly", '`tools: " , "`'],
  ];

  for (const [stem, spelling] of SUBJECTS) {
    it(`RED (E5, ${stem}): ${spelling} does not register`, () => {
      // The registered-and-silent half this fix removes: the author's file
      // carries a `tools:` line that declares nothing, and bug 0001 §"The
      // callable set is the only door" records that the query-time loop
      // installs exactly that set as the model's active tools with no union of
      // the ambient snapshot — so the emptying is not recoverable at query time
      // and load is the only place the author can learn of it.
      expect(
        outcomeOf(stem).registered,
        `${spelling} registered with the EMPTY callable set: the field the author ` +
          "wrote declares no entry and the theta runs as if `tools:` were absent." +
          observed(stem),
      ).not.toContain(stem);
    });

    it(`RED (E5, ${stem}): the load path surfaces the field refusal`, () => {
      expect(
        outcomeOf(stem).notifications,
        "no diagnostic at any severity names the `tools:` field that declares no " +
          "entry: the silent half of this defect has no trace at load." +
          observed(stem),
      ).toContain(REFUSAL_MESSAGE);
    });
  }

  const CONTROLS: ReadonlyArray<readonly [string, string]> = [
    ["ctlscalar", "the plain scalar spelling"],
    ["ctlemptyseq", "`tools: []`"],
    ["ctlabsent", "the absent field"],
  ];

  for (const [stem, what] of CONTROLS) {
    it(`GREEN (E5, ${stem}): ${what} still registers and draws no refusal`, () => {
      // §Fix constraint (a): the two spellings the spec declares equivalent to
      // absent keep loading silently with the empty callable set. Registration
      // is the per-row observable that is sound here — the refusal's message
      // carries no `<value>`, so a notification is not attributable to a row
      // inside a shared workspace, which is why each row gets its own load.
      expect(
        outcomeOf(stem).registered,
        `${what} must keep registering with the callable set it carries today.` +
          observed(stem),
      ).toContain(stem);
      expect(
        outcomeOf(stem).notifications,
        `${what} must draw no field refusal.` + observed(stem),
      ).not.toContain(REFUSAL_MESSAGE);
    });
  }

  const NULLS: ReadonlyArray<readonly [string, string]> = [
    ["nullbare", "the bare `tools:` key"],
    ["nullexplicit", "`tools: null`"],
  ];

  for (const [stem, what] of NULLS) {
    it(`GREEN (E5, ${stem}): ${what} keeps \`theta/load/unknown-tool\``, () => {
      // §Non-goals: both spellings parse as a null SCALAR and produce the
      // single entry `null`, so they un-register loudly at the resolver. The
      // zero-entry rule must not take the input away from the code that owns
      // it, nor add a second refusal on top of it.
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
        `${what} produces ONE entry, so no zero-entry refusal fires.` +
          observed(stem),
      ).not.toContain(REFUSAL_MESSAGE);
    });
  }
});
