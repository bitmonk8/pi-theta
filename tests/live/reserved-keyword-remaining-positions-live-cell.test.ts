// Bug 0153 — the six remaining identifier positions of the reserved-keyword
// rule, standalone live REGISTRATION-DENIAL cell
// (docs/bugs/0153-reserved-keyword-remaining-identifier-positions.md).
// Standalone by design — no numeric id from the H8a sequence (the precedent
// this file mirrors in shape:
// tests/live/reserved-keyword-object-pattern-head-live-cell.test.ts).
//
// Additive H8a-T cell. The fixed surface is theta LOAD and REGISTRATION.
// docs/spec_topics/lexical.md:20 reserves 32 spellings and states, with no
// scope list, that using one "in identifier position" is
// `theta/parse/reserved-keyword-as-identifier` (Sev `E`, phase `parse`,
// docs/spec_topics/diagnostics/code-registry-parse.md:21, whose *Trigger* names
// no position either). Bug 0148's fix closed the `fn` parameter NAME only, so
// six identifier positions still load clean: the `for` and `par for` iteration
// variable, the schema field name, the `params:` frontmatter field name, the
// `enum` variant name, and both `import` / `export` specifier name slots. An
// `error`-severity `theta/parse/*` diagnostic denies registration
// (`hasLoadParseError`, src/extension/production-composition.ts:2220, applied
// at `:2267`), so closing those positions is exactly what stops the refused
// spellings registering and running.
//
// WHICH TWO FACES THIS CELL DRIVES, and why those two:
//   - the `params:` FRONTMATTER FIELD NAME — the face that reaches the wire.
//     A `params:` field named `let` lowers to `properties.let` /
//     `required: ["let"]` / `wireName: "let"` in the JSON Schema the binder and
//     the provider receive (bug 0153 §Reproduction row L1), so it is the one
//     position whose harm leaves the parser entirely. It is also the face with
//     no token at all: the name is a YAML scalar key
//     (src/parser/frontmatter.ts:749), refused on string membership in that
//     module's `RESERVED_KEYWORDS` (`:478`, `= reservedKeywords()`) and ranged
//     on `rangeOf(item.key, …)`. Its emission is the REGISTERED
//     `theta/parse/*` code and not a `theta/load/` twin — DIAG-2 closes the
//     registry and the `load` namespace carries no reserved-keyword row at
//     all — which is what makes the registry-sourced note fragment below the
//     right oracle for it.
//   - the `for` ITERATION VARIABLE — a theta-BODY face, at a different parse
//     site in a different module (`parseFor`'s variable capture,
//     src/parser/theta-document.ts:2341). Driving one frontmatter face and one
//     body face is what proves the refusal is the RULE's and not one loop's.
// The four remaining positions are proved offline at the
// `parseThetaDocument` boundary by the 74-cell unit witness
// (tests/reserved-keyword-remaining-identifier-positions.test.ts); this cell
// proves the SAME registered code denies REGISTRATION end to end through the
// real production composition root (session_start → resources_discover →
// composeExtensionInstance), which the offline harness cannot reach.
//
// Observables, per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving":
//   - `handle.command(stem)` / `handle.registeredNames()`, read off the real
//     `ExtensionRunner` after the real `session_start` → `pi.registerCommand`
//     step: each broken theta must be ABSENT and each sibling PRESENT.
//   - `theta-system-note`, read off the settled in-memory `SessionManager`
//     (`handle.sessionManager.getEntries()`), never off racy events: the
//     diagnostic fires at LOAD time, before any drive, so the whole entry list
//     is the delta. The expected fragment is rendered from the registry row's
//     *Message* column (DIAG-4), mirroring the bug 0148 cell's
//     `reservedKeywordFragment` reader
//     (tests/live/live-production-acceptance.test.ts:3665–3688).
// No stochastic value is asserted.
//
// Each broken theta is paired with a SAME-SHAPE sibling differing in the
// SPELLING alone — `params: f: string` against `params: let: string`, and
// `for s in xs` against `for string in xs` — which is what bounds the refusal
// to lexical.md:20's list rather than to "a theta declaring `params:` / a `for`
// loop cannot register here". A fifth, unrelated precondition control proves
// the workspace and the discovery walk themselves work, so an empty registered
// set cannot satisfy the two absence assertions vacuously.
//
// Registration-only: no slash command is invoked, so no model turn runs and the
// cell spends ZERO tokens. `requireLiveProvider` still gates it and FAILS
// LOUDLY on a missing provider/model (AGENTS.md §"No silent skipping") — the
// composition root under test is the live one, and the cell must not report
// success when nothing was verified.
//
// Subagent child-process launch: NOT reached. Every fixture is `mode: prompt`
// with no `tools:` and no drive, so no query-time tool-call loop and no
// RFC-0006 subagent-child spawn occurs. `harness.ts` carries the
// `#subagent-child-pins` module-scope setters regardless (inherited by
// importing it).
//
// RED / GREEN (AGENTS.md "Verify both directions"): at HEAD both broken
// fixtures parse with ZERO diagnostics (measured offline through the shipped
// `parseThetaDocument`), so both REGISTER and the two "must be ABSENT"
// assertions red — that is this cell's red direction, and it is the bug's
// symptom exactly. The precondition control and both conformant siblings
// register at HEAD too, so a red here is never a broken workspace. Under the
// fix only the two reserved-spelling fixtures gain the diagnostic, so the
// siblings' and the control's registration stay green and the note assertions
// turn green with them.

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

/** The sharded registry page carrying this code's row (`:21`). */
const RESERVED_KEYWORD_REGISTRY = parseRegistry(
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
 * registry row, not copied. This mirrors the bug 0148 cell's reader
 * (tests/live/live-production-acceptance.test.ts:3665–3688) exactly: the row's
 * presence is asserted (DIAG-2), the `<keyword>` slot's presence is asserted
 * before it is filled, and the filled result is checked for a second
 * unsubstituted placeholder.
 */
function reservedKeywordFragment(keyword: string): string {
  const template = registryMessage(
    RESERVED_KEYWORD_REGISTRY,
    RESERVED_KEYWORD_CODE,
  ) as string | undefined;
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
 * The theta-system-note channel contents from the settled in-memory
 * `SessionManager`, read directly off `getEntries()` (AGENTS.md §"Assert on
 * real observables"). Mirrors the unexported reader in
 * tests/live/alias-sink-array-element-check-live-cell.test.ts:116.
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

/** The precondition control: an ordinary `mode: prompt` theta, nothing else. */
const CONTROL_STEM = "d2celllivectl";
/** The `params:`-face pair — the face that reaches the wire. */
const PARAMS_BROKEN_STEM = "d2celllivepbad";
const PARAMS_GOOD_STEM = "d2celllivepgood";
/** The theta-body pair — the `for` iteration variable. */
const FOR_BROKEN_STEM = "d2celllivefbad";
const FOR_GOOD_STEM = "d2celllivefgood";

/** A `mode: prompt` theta whose only content is one `@`-query. */
function controlTheta(): string {
  return (
    [
      "---",
      "mode: prompt",
      "---",
      "@`Reply with exactly this word and nothing else: ok`",
    ].join("\n") + "\n"
  );
}

/**
 * A `mode: prompt` theta declaring ONE `params:` field named `name`. The
 * broken caller passes the reserved spelling `let` — bug 0153 §Reproduction
 * row a4 verbatim — and the sibling passes `f`; nothing else differs, so the
 * refusal cannot be attributed to the `params:` block itself.
 */
function paramsFieldNameTheta(name: string): string {
  return ["---", "mode: prompt", "params:", `  ${name}: string`, "---", "1", ""].join(
    "\n",
  );
}

/**
 * A `mode: prompt` theta whose body runs one `for` loop. The broken caller
 * names the iteration variable with the reserved spelling `string` — bug 0153
 * §Reproduction row a1 verbatim — and the sibling names it `s`.
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

describe("H8a-T — bug 0153: a reserved keyword at a `params:` field name or a `for` iteration variable draws reserved-keyword-as-identifier and does not register, live (Convention: live-host acceptance)", () => {
  it("denies registration to the reserved-spelling `params:` field name and the reserved-spelling `for` variable, while their conformant same-shape siblings and an unrelated control all register, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and the discovery walk both work — without it, the
      // broken thetas' absence could be (wrongly) attributed to a broken
      // workspace instead of the reserved-keyword rule under test.
      { source: "project", stem: CONTROL_STEM, text: controlTheta() },
      // The two same-shape siblings: identical but for the SPELLING.
      { source: "project", stem: PARAMS_GOOD_STEM, text: paramsFieldNameTheta("f") },
      { source: "project", stem: FOR_GOOD_STEM, text: forVariableTheta("s") },
      // The two load-bearing broken thetas, the bug doc's own §Reproduction
      // rows a4 and a1.
      { source: "project", stem: PARAMS_BROKEN_STEM, text: paramsFieldNameTheta("let") },
      { source: "project", stem: FOR_BROKEN_STEM, text: forVariableTheta("string") },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // ---- Preconditions. Each must hold before either absence assertion
      // below witnesses anything (no silent skipping: an empty registered set
      // would satisfy both refusals vacuously).
      expect(
        handle.command(CONTROL_STEM),
        "bug-0153 precondition unmet: the unrelated control theta did not " +
          "register — discovery or registration regressed independent of bug " +
          "0153, so the refusal assertions below cannot witness anything. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command(PARAMS_GOOD_STEM),
        "bug-0153 precondition unmet: the SAME `params:` block with a " +
          "non-reserved field name did not register — a theta declaring " +
          "`params:` cannot register in this harness at all, independent of " +
          "this bug. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command(FOR_GOOD_STEM),
        "bug-0153 precondition unmet: the SAME `for` loop with a " +
          "non-reserved iteration variable did not register — a theta running " +
          "a `for` loop cannot register in this harness at all, independent " +
          "of this bug. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // ---- The fixed observable, face 1: the `params:` frontmatter field
      // name. `extractParsedParams` (src/parser/frontmatter.ts:749) must draw
      // theta/parse/reserved-keyword-as-identifier on the YAML key, and
      // hasLoadParseError un-registers the theta at the SAME site every other
      // registration-denial cell in this suite exercises for its own code.
      expect(
        handle.command(PARAMS_BROKEN_STEM),
        "bug-0153: a theta whose `params:` field name is the reserved " +
          "keyword `let` registered anyway through the live " +
          "discovery/session_start path — " +
          "theta/parse/reserved-keyword-as-identifier did not fire at the " +
          "frontmatter face, so the spelling lexical.md:20 refuses reaches " +
          "the lowered JSON Schema as `properties.let` / `required:[\"let\"]` " +
          "and goes out to the binder and the provider. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0153: the reserved `params:` field name theta's slash name must " +
          "not appear in the registered set.",
      ).not.toContain(PARAMS_BROKEN_STEM);

      // ---- The fixed observable, face 2: the `for` iteration variable, a
      // theta-BODY face at a different parse site in a different module
      // (parseFor's capture, src/parser/theta-document.ts:2341).
      expect(
        handle.command(FOR_BROKEN_STEM),
        "bug-0153: a theta whose `for` iteration variable is the reserved " +
          "keyword `string` registered anyway through the live " +
          "discovery/session_start path — " +
          "theta/parse/reserved-keyword-as-identifier did not fire at the " +
          "body face, so the refusal is not the RULE's but one loop's. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0153: the reserved `for` variable theta's slash name must not " +
          "appear in the registered set.",
      ).not.toContain(FOR_BROKEN_STEM);

      // ---- The theta-system-note channel, read off the settled in-memory
      // SessionManager rather than off racy events: the diagnostics fire at
      // LOAD time, before any drive, so the full entry list is the delta. The
      // expected fragments are rendered from the registry row (DIAG-4), one
      // per face with its own interpolated `<keyword>` — which is what makes
      // a diagnostic naming the WRONG subject (the bug's other half: the
      // `for` face names `'in'` for four spellings today) fail here rather
      // than pass a code-only check.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      expect(
        notes.some((note) => note.includes(reservedKeywordFragment("let"))),
        "bug-0153: no theta-system-note entry named the reserved-keyword " +
          "rejection of the `params:` field name `let`. Notes: " +
          JSON.stringify(notes),
      ).toBe(true);
      expect(
        notes.some((note) => note.includes(reservedKeywordFragment("string"))),
        "bug-0153: no theta-system-note entry named the reserved-keyword " +
          "rejection of the `for` iteration variable `string`. Notes: " +
          JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
