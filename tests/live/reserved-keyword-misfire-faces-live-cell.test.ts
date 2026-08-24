// Bug 0242 — the three lexer-side misfire faces of `contextualDiagnostics`,
// standalone live REGISTRATION-DENIAL cell
// (docs/bugs/0242-reserved-keyword-refusal-misfires-on-three-faces.md).
// Standalone by design — no numeric id from the H8a sequence (the precedent
// this file mirrors in shape:
// tests/live/reserved-keyword-remaining-positions-live-cell.test.ts, itself
// modelled on tests/live/reserved-keyword-object-pattern-head-live-cell.test.ts).
//
// Additive H8a-T cell. The fixed surface is theta LOAD and REGISTRATION.
// `contextualDiagnostics` (src/lexer/lexer.ts:810) judges identifier positions
// by token adjacency over a flat token list, so a reserved spelling used as a
// NAME puts one of its four scan heads where a name belongs and a second,
// wrong-subject diagnostic follows: the grammar's own `in`
// (`ForStmt ::= "for" Ident "in" Expr StmtBlock`,
// docs/reference/grammar.md:272), the grammar's own `as`
// (docs/reference/grammar.md:36–37, docs/spec_topics/schemas.md:23), or
// `theta/parse/single-line-if` — "single-line body not permitted; wrap in
// { ... }" (docs/spec_topics/diagnostics/code-registry-parse.md:23) — at a
// field name, a variant name or an import specifier, none of which has a body.
//
// WHAT THIS CELL ADDS OVER THE OFFLINE WITNESS. The unit witness
// (tests/reserved-keyword-misfire-faces.test.ts) pins the whole ordered
// diagnostic list of every shape this report names, at the
// `parseThetaDocument` boundary. What it cannot reach is what the AUTHOR
// actually reads: the theta-system-note channel the real composition root
// renders at load time (session_start → resources_discover →
// composeExtensionInstance). This cell drives that path and asserts on the
// notes themselves — that they name the keyword the author got wrong and do
// NOT name a token the grammar required, and that they do not carry a
// single-line-body rule at a position with no body.
//
// WHICH TWO FACES THIS CELL DRIVES, and why those two:
//   - the `for` ITERATION VARIABLE (`for let in xs { 1 }`) — bug 0242
//     §Reproduction row A1, the `in` face. Its note must name `'let'` and must
//     NOT name `'in'`: the author has no other spelling for `in`, so a note
//     naming it prescribes an edit that cannot be made.
//   - the SCHEMA FIELD NAME (`schema S { fn: string }`) — §Reproduction row
//     C1, the `single-line-if` face and the report's S2 face. Its notes must
//     carry no "single-line body not permitted; wrap in { ... }" at all: the
//     registered *Hint* for that row is "Wrap the body in `{ ... }`", an edit
//     the author cannot apply to a field name.
// The `as` face (§Reproduction B) is proved offline at the same boundary by
// the unit witness; it reaches no observable this cell can distinguish from
// the two above, so it is not duplicated here.
//
// Observables, per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving":
//   - `handle.command(stem)` / `handle.registeredNames()`, read off the real
//     `ExtensionRunner` after the real `session_start` → `pi.registerCommand`
//     step: each refused theta must be ABSENT and each sibling PRESENT.
//   - `theta-system-note`, read off the settled in-memory `SessionManager`
//     (`handle.sessionManager.getEntries()`), never off racy events: the
//     diagnostics fire at LOAD time, before any drive, so the whole entry list
//     is the delta. Expected fragments are rendered from the registry rows'
//     *Message* columns (DIAG-4), mirroring the bug 0153 cell's
//     `reservedKeywordFragment` reader.
// No stochastic value is asserted.
//
// Each refused theta is paired with a SAME-SHAPE sibling differing in the
// SPELLING alone — `for s in xs` against `for let in xs`, and
// `schema S { f: string }` against `schema S { fn: string }` — which bounds
// the refusal to lexical.md:20's list rather than to "a `for` loop / a schema
// declaration cannot register here". A third, unrelated precondition control
// proves the workspace and the discovery walk themselves work, so an empty
// registered set cannot satisfy the absence assertions vacuously.
//
// Registration-only: no slash command is invoked, so no model turn runs and
// the cell spends ZERO tokens. There is deliberately no echo sentinel — an
// echo-sentinel prompt is a model turn, and a model turn is a refusal risk
// this cell has no reason to take. `requireLiveProvider` still gates it and
// FAILS LOUDLY on a missing provider/model (AGENTS.md §"No silent skipping"):
// the composition root under test is the live one, and the cell must not
// report success when nothing was verified.
//
// Subagent child-process launch: NOT reached. Every fixture is `mode: prompt`
// with no `tools:` and no drive, so no query-time tool-call loop and no
// RFC-0006 subagent-child spawn occurs. `harness.ts` carries the
// `#subagent-child-pins` module-scope setters regardless (inherited by
// importing it).
//
// RED / GREEN (AGENTS.md "Verify both directions"): at HEAD both refused
// fixtures ALREADY fail to register — bug 0153's correct parser-leaf refusals
// landed in 0.194.0 and this report changes no registration outcome (§Fix
// constraint 6) — so the registration assertions and both preconditions are
// green at HEAD and stay green. The red at HEAD is the note content: the
// `for` fixture's notes name `'in'` beside `'let'`, and the schema fixture's
// notes carry the single-line-body message. Those two negative assertions are
// this cell's red direction, and they are the bug's symptom exactly as an
// author reads it.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../../tools/code-registry/index.js";
import {
  bootShippedExtension,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

const RESERVED_KEYWORD_CODE = "theta/parse/reserved-keyword-as-identifier";
const SINGLE_LINE_IF_CODE = "theta/parse/single-line-if";

/** docs/spec_topics/diagnostics/code-registry-parse.md:21 and `:23` carry both registry rows, sharded across this page. */
const PARSE_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `theta/parse/reserved-keyword-as-identifier: reserved keyword '<keyword>'
 * cannot be used as an identifier` — DIAG-4: the message half is READ from the
 * registry row, not copied. This mirrors the bug 0153 cell's reader
 * (tests/live/reserved-keyword-remaining-positions-live-cell.test.ts) exactly:
 * the row's presence is asserted (DIAG-2), the `<keyword>` slot's presence is
 * asserted before it is filled, and the filled result is checked for a second
 * unsubstituted placeholder.
 */
function reservedKeywordFragment(keyword: string): string {
  const template = registryMessage(PARSE_REGISTRY, RESERVED_KEYWORD_CODE) as
    | string
    | undefined;
  expect(
    template,
    `${RESERVED_KEYWORD_CODE} has no registry row — the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  const withSlot = template as string;
  expect(
    withSlot,
    `${RESERVED_KEYWORD_CODE}: the registry row's Message template must carry the <keyword> slot this cell fills — the row changed shape`,
  ).toContain("<keyword>");
  const message = withSlot.replace("<keyword>", keyword);
  expect(
    message,
    `${RESERVED_KEYWORD_CODE}: the registry row's Message template grew a second unsubstituted placeholder this reader does not fill`,
  ).not.toMatch(/<[a-z]+>/);
  return `${RESERVED_KEYWORD_CODE}: ${message}`;
}

/**
 * The single-line-body row's *Message*, read from the registry on the same
 * terms. It carries no placeholder — the row's subject lives entirely in its
 * range — so the reader asserts the absence of one rather than filling it.
 */
function singleLineIfMessage(): string {
  const template = registryMessage(PARSE_REGISTRY, SINGLE_LINE_IF_CODE) as
    | string
    | undefined;
  expect(
    template,
    `${SINGLE_LINE_IF_CODE} has no registry row — the code this cell asserts the ABSENCE of is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  const message = template as string;
  expect(
    message,
    `${SINGLE_LINE_IF_CODE}: the registry row's Message template grew a placeholder this reader does not fill, so the absence assertion below would match nothing and pass vacuously`,
  ).not.toMatch(/<[a-z]+>/);
  return message;
}

/**
 * The theta-system-note channel contents from the settled in-memory
 * `SessionManager`, read directly off `getEntries()` (AGENTS.md §"Assert on
 * real observables"). Mirrors the unexported reader in
 * tests/live/reserved-keyword-remaining-positions-live-cell.test.ts.
 */
function systemNoteContents(entries: readonly unknown[]): readonly string[] {
  const notes: string[] = [];
  for (const entry of entries) {
    const e = entry as { customType?: string; content?: unknown };
    if (e.customType !== "theta-system-note") continue;
    if (typeof e.content === "string") {
      notes.push(e.content);
    } else if (Array.isArray(e.content)) {
      for (const part of e.content) {
        const t = (part as { text?: string }).text;
        if (typeof t === "string") {
          notes.push(t);
        }
      }
    }
  }
  return notes;
}

// Fixture stems. Every stem ends with this lane's token so a stray fixture is
// attributable — .
/** The precondition control: an ordinary `mode: prompt` theta, nothing else. */
const CONTROL_STEM = "d2misfirectlcellb2";
/** The `in`-face pair — the `for` iteration variable. */
const FOR_REFUSED_STEM = "d2misfireforbadcellb2";
const FOR_SIBLING_STEM = "d2misfireforgoodcellb2";
/** The `single-line-if`-face pair — the schema field name. */
const SCHEMA_REFUSED_STEM = "d2misfireschemabadcellb2";
const SCHEMA_SIBLING_STEM = "d2misfireschemagoodcellb2";

// Drive discriminators are ANSWERS to task questions over the theta's own
// computed text -- deterministic content a degraded plain-prompt run cannot
// produce. A verbatim-echo demand ("reply with exactly this") reads as prompt
// injection to current models and draws refusals: the sentinel-refusal class
// filed as bug 0243.

/** A `mode: prompt` theta whose only content is one `@`-query. */
function controlTheta(): string {
  return (
    [
      "---",
      "mode: prompt",
      "---",
      "@`What is 282 plus 797? Answer with the number only.`",
    ].join("\n") + "\n"
  );
}

/**
 * A `mode: prompt` theta whose body runs one `for` loop. The refused caller
 * names the iteration variable `let` — bug 0242 §Reproduction row A1 verbatim,
 * the shape whose second diagnostic accuses the grammar's own `in` — and the
 * sibling names it `s`.
 */
function forVariableTheta(variable: string): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "let xs = [1]",
    `for ${variable} in xs { 1 }`,
    "1",
    "",
  ].join("\n");
}

/**
 * A `mode: prompt` theta declaring one schema with one field. The refused
 * caller names the field `fn` — bug 0242 §Reproduction row C1 verbatim, the
 * shape that draws `theta/parse/single-line-if` at a name with no body — and
 * the sibling names it `f`.
 */
function schemaFieldTheta(field: string): string {
  return ["---", "mode: prompt", "---", `schema S { ${field}: string }`, "1", ""].join(
    "\n",
  );
}

describe("H8a-T — bug 0242: a reserved keyword at a `for` variable or a schema field name denies registration naming THAT name alone, live (Convention: live-host acceptance)", () => {
  it("denies registration to both misfire-face thetas while their conformant same-shape siblings and an unrelated control register, and the load-time notes name the offending NAME without naming the grammar's own `in` or a single-line-body rule", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and the discovery walk both work — without it, the
      // refused thetas' absence could be (wrongly) attributed to a broken
      // workspace instead of the reserved-keyword rule under test.
      { source: "project", stem: CONTROL_STEM, text: controlTheta() },
      // The two same-shape siblings: identical but for the SPELLING.
      { source: "project", stem: FOR_SIBLING_STEM, text: forVariableTheta("s") },
      { source: "project", stem: SCHEMA_SIBLING_STEM, text: schemaFieldTheta("f") },
      // The two load-bearing fixtures, the bug doc's own §Reproduction rows A1
      // and C1.
      { source: "project", stem: FOR_REFUSED_STEM, text: forVariableTheta("let") },
      { source: "project", stem: SCHEMA_REFUSED_STEM, text: schemaFieldTheta("fn") },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // ---- Preconditions. Each must hold before any assertion below
      // witnesses anything (no silent skipping: an empty registered set would
      // satisfy the refusals vacuously).
      expect(
        handle.command(CONTROL_STEM),
        "bug-0242 precondition unmet: the unrelated control theta did not " +
          "register — discovery or registration regressed independent of bug " +
          "0242, so the assertions below cannot witness anything. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command(FOR_SIBLING_STEM),
        "bug-0242 precondition unmet: the SAME `for` loop with a " +
          "non-reserved iteration variable did not register — a theta running " +
          "a `for` loop cannot register in this harness at all, independent " +
          "of this bug. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command(SCHEMA_SIBLING_STEM),
        "bug-0242 precondition unmet: the SAME schema with a non-reserved " +
          "field name did not register — a theta declaring a schema cannot " +
          "register in this harness at all, independent of this bug. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // ---- Registration is UNCHANGED by this fix (§Fix constraint 6): both
      // fixtures carry an error-severity `theta/parse/*` diagnostic before and
      // after, so `hasLoadParseError`, applied inside `parseDiscoveredTheta`
      // (both in src/extension/production-composition.ts), drops them either
      // way. These rows are what prove the fix removes a duplicate diagnostic
      // and not a refusal.
      expect(
        handle.command(FOR_REFUSED_STEM),
        "bug-0242: a theta whose `for` iteration variable is the reserved " +
          "keyword `let` registered anyway through the live " +
          "discovery/session_start path — the refusal this report leaves in " +
          "place stopped firing, which is a regression of bug 0153's " +
          "delivery, not a repair of this one. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.command(SCHEMA_REFUSED_STEM),
        "bug-0242: a theta whose schema field name is the reserved keyword " +
          "`fn` registered anyway through the live discovery/session_start " +
          "path — the refusal this report leaves in place stopped firing. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0242: neither misfire-face theta's slash name may appear in the " +
          "registered set.",
      ).not.toContain(FOR_REFUSED_STEM);
      expect(
        handle.registeredNames(),
        "bug-0242: neither misfire-face theta's slash name may appear in the " +
          "registered set.",
      ).not.toContain(SCHEMA_REFUSED_STEM);

      // ---- The theta-system-note channel, read off the settled in-memory
      // SessionManager rather than off racy events: the diagnostics fire at
      // LOAD time, before any drive, so the full entry list is the delta.
      const notes = systemNoteContents(handle.sessionManager.getEntries());

      // Face 1, the positive half: the note names the variable the author
      // chose. This is bug 0153's landed emission and must survive the fix —
      // without it the negative assertion below could be satisfied by a theta
      // that reported nothing at all.
      expect(
        notes.some((note) => note.includes(reservedKeywordFragment("let"))),
        "bug-0242: no theta-system-note entry named the reserved-keyword " +
          "rejection of the `for` iteration variable `let`. Notes: " +
          JSON.stringify(notes),
      ).toBe(true);

      // Face 1, the fixed half: the note must NOT name `in`. `in` is a
      // `ForStmt` terminal (docs/reference/grammar.md:272) the author had no
      // alternative spelling for, so naming it as an identifier the author may
      // not use prescribes an edit that does not exist.
      expect(
        notes.some((note) => note.includes(reservedKeywordFragment("in"))),
        "bug-0242: a theta-system-note accused the grammar's own `in` of " +
          "being a reserved keyword used as an identifier. `in` is a ForStmt " +
          "terminal (docs/reference/grammar.md:272); deleting it does not " +
          "clear the diagnostic and renaming the variable does. Notes: " +
          JSON.stringify(notes),
      ).toBe(false);

      // Face 2, the positive half: the schema field name is named.
      expect(
        notes.some((note) => note.includes(reservedKeywordFragment("fn"))),
        "bug-0242: no theta-system-note entry named the reserved-keyword " +
          "rejection of the schema field name `fn`. Notes: " +
          JSON.stringify(notes),
      ).toBe(true);

      // Face 2, the fixed half: no single-line-body rule anywhere in the
      // notes. This workspace contains no unbraced `if` / `for` / `while` /
      // `fn` body at all — every fixture's loop and body is braced — so the
      // message can only have come from the `controlHeads` scan misfiring on a
      // field name, and its registered *Hint* ("Wrap the body in `{ ... }`")
      // names an edit the author cannot make.
      const singleLineIf = singleLineIfMessage();
      expect(
        notes.some((note) => note.includes(singleLineIf)),
        "bug-0242: a theta-system-note carried the single-line-body rule " +
          `(${JSON.stringify(singleLineIf)}) although no fixture in this ` +
          "workspace has an unbraced body. Its Trigger " +
          "(docs/spec_topics/diagnostics/code-registry-parse.md:23) is a body " +
          "that is not a braced block; a schema field name has no body. " +
          "Notes: " + JSON.stringify(notes),
      ).toBe(false);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
