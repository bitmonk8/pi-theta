// Bug 0162 — standalone live registration cell (lane/h; the 0104/0217-cell-74
// standalone/registration-only precedent). Deliberately NOT added to
// tests/live/live-production-acceptance.test.ts (a sibling-shared file).
//
// §Fix route (a) wires the SAME registered `theta/parse/inline-enum` row over
// the `params:` field's own top-level captured type text
// (`checkInlineEnumForm`, reused from src/parser/schema-declarations.ts, wired
// into src/parser/params.ts's per-field loop) that already fires for the two
// `schema` declaration positions — INSTEAD OF the generic
// `theta/load/params-type-not-expression` text refusal. The GOV-15
// emission-set addition this fix makes is `p: 'enum[{a: string}]'`: at HEAD
// before this fix that spelling loaded CLEAN (bug 0059's brace exemption
// admitted it) and REGISTERED with the assert-nothing `{}` lowered for the
// field; after the fix it must be REFUSED and the theta must NOT register.
//
// No existing live cell exercises this. `grep` over tests/live/**/*.ts finds
// no top-level `params:` `enum[...]` fixture; the two existing enum-related
// live cells (bug 0217 cell 74 in live-production-acceptance.test.ts, and its
// H8a-T sibling) both plant the NESTED spelling `array<enum["a", "b"]>`, which
// this fix does not move (bug 0217 §Fix (b)(2) is untouched — nested spellings
// keep drawing `theta/load/params-type-not-expression`).
//
// This cell proves the fix through the REAL production composition root
// (session_start → resources_discover → composeExtensionInstance →
// checkTypeLayer), over a REAL on-disk `.pi/theta/` discovery walk driven by
// `bootShippedExtension` (`tests/live/harness.ts`) — the same harness the
// bug-0104/bug-0217-cell-74 standalone/registration-only live cells use.
//
// Registration-only: no slash command is invoked for the DENIAL observable,
// so no model turn runs there and that half of the cell spends zero tokens.
// The diagnostic fires at LOAD time (before any drive), so the
// `theta-system-note` channel is read off the settled in-memory
// `SessionManager`'s FULL entry list, exactly as bug-0217 cell 74 reads it —
// never off a `prompt()` resolution (no turn is driven in this cell at all,
// satisfying AGENTS.md "Assert on real observables, not on `prompt()`
// resolving" a fortiori). 
//
// Four planted thetas, each isolating one variable:
//   - `h3ctl`               — an unrelated plain-prompt control (no `params:`
//                             at all). Must REGISTER. Proves the workspace and
//                             discovery walk both work, so an absent
//                             registration below cannot be blamed on a broken
//                             workspace.
//   - `h3legal`              — `params:` field `p: '"a" | "b"'`, the SAME
//                             field name as the two enum siblings below, in
//                             the literal-union form the inline-enum row's
//                             own *Fix hint* directs authors to. Must
//                             REGISTER — proves the refusal below is targeted
//                             at the inline-enum text, not at every `params:`
//                             field named `p`.
//   - `h3braceenum`          — `p: 'enum[{a: string}]'`, the GOV-15
//                             emission-set addition. REGISTERED at HEAD (bug
//                             0059's brace exemption admitted it) and must NOT
//                             register after this fix.
//   - `h3bareenum`           — `p: 'enum["x", "y"]'`, the bare canonical
//                             spelling (already refused pre-fix by the generic
//                             text row, bug 0059) — optional strengthening:
//                             proves the CODE draws `theta/parse/inline-enum`
//                             now, not merely that registration stays absent.
//
// Subagent child-process launch: NOT reached. All four planted thetas are
// `mode: prompt` (never loaded as a subagent-mode `tools:` callee), and this
// cell invokes no slash command, so no query-time tool-call loop and no
// RFC-0006 subagent-child spawn occurs. `tests/live/harness.ts` carries the
// `#subagent-child-pins` module-scope setters (`process.argv[1]`,
// `PI_THETA_SUBAGENT_EXTENSION_PIN`, `PI_THETA_SUBAGENT_PARENT_PID`) for
// cells in this suite that DO reach that launch; importing the harness
// inherits them regardless.

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

/** The live `theta/parse/*` registry page — the same page the offline witness reads. */
const PARSE_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(new URL("../../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url)),
    "utf8",
  ),
) as { code: string; message: string }[];

const INLINE_ENUM_CODE = "theta/parse/inline-enum";

/**
 * The registered `theta/parse/inline-enum` *Message* (DIAG-4), read from the
 * registry rather than restated by hand — the row carries no placeholder, so
 * every position emitting it renders the byte-identical line (bug 0162 §Fix
 * (a): "the *Message* bytes do not change"). 
 */
function inlineEnumFragment(): string {
  const template = registryMessage(PARSE_REGISTRY, INLINE_ENUM_CODE) as string | undefined;
  expect(
    template,
    `${INLINE_ENUM_CODE} has no registry row — the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  return template as string;
}

/** An unrelated control `.theta`: no `params:` at all, plain untyped query. */
function controlTheta(sentinel: string): string {
  return ["---", "mode: prompt", "---", "@`Reply with exactly the token " + sentinel + " and nothing else.`", ""].join(
    "\n",
  );
}

/**
 * A `params:` theta with ONE field `p` of the given declared type and a
 * resolvable `bind_model:`, mirroring bug-0217 cell 74's `cellDParamsTheta`:
 * `"a" | "b"` (a literal-union) is a single-string binder-bypass shape but the
 * two enum siblings are not, so the pin isolates every sibling's verdict to
 * the type-text refusal alone rather than a `theta/load/binder-model-unresolved`
 * this bug does not own.
 */
function paramsTheta(fieldType: string): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    `  p: '${fieldType}'`,
    "---",
    '"ok"',
    "",
  ].join("\n");
}

/**
 * The `theta-system-note` channel contents from the settled in-memory
 * `SessionManager`, read directly off `getEntries()` (AGENTS.md §"Assert on
 * real observables"). Mirrors `live-production-acceptance.test.ts`'s
 * unexported `systemNoteContents` / `./harness`'s unexported
 * `collectSystemNotes` — restated here because this is a standalone file.
 */
function systemNoteContents(entries: readonly unknown[]): readonly string[] {
  const notes: string[] = [];
  for (const entry of entries) {
    const e = entry as { customType?: string; content?: unknown };
    if (e.customType !== "theta-system-note") continue;
    if (typeof e.content === "string") notes.push(e.content);
    else if (Array.isArray(e.content)) {
      for (const part of e.content) {
        const t = (part as { text?: string }).text;
        if (typeof t === "string") notes.push(t);
      }
    }
  }
  return notes;
}

describe(
  "H8a-T — bug 0162 (h) live cell: theta/parse/inline-enum fires at the params: field's own top-level captured text, live",
  () => {
    it(
      'does not register a theta whose params: field declares enum[{a: string}] (nor the bare enum["x", "y"] sibling), ' +
        'while its legal "a" | "b" sibling and an unrelated control both still register, through the real ' +
        "discovery\u2192registration path",
      async () => {
        const provider = await requireLiveProvider();
        const thetas: PlantedTheta[] = [
          // The unrelated control: no `params:` at all. Proves the workspace
          // and discovery walk both work, so an absent registration below
          // cannot be attributed to a broken workspace. 
          { source: "project", stem: "h3ctl", text: controlTheta("BUG0162-LIVE-CTL") },
          // The over-refusal fence: the literal-union spelling the inline-enum
          // row's own *Fix hint* names, over the SAME field name as the two
          // enum siblings below. Must register — proves the denial is
          // targeted at the inline-enum text, not at every `p:` field.
          { source: "project", stem: "h3legal", text: paramsTheta('"a" | "b"') },
          // THE LOAD-BEARING DENIAL: the GOV-15 emission-set addition. This
          // registered at HEAD (bug 0059's brace exemption admitted it) and
          // must stop registering under bug 0162 §Fix route (a).
          { source: "project", stem: "h3braceenum", text: paramsTheta("enum[{a: string}]") },
          // Optional strengthening: the bare canonical spelling, already
          // refused pre-fix by the GENERIC text row — proves the CODE moved,
          // not merely that registration stayed absent.
          { source: "project", stem: "h3bareenum", text: paramsTheta('enum["x", "y"]') },
        ];
        const workspace = plantThetaWorkspace(thetas);
        const handle = await bootShippedExtension({ workspace, provider });
        try {
          // Precondition: the unrelated control must register before either
          // denial means anything (no silent skipping — a broken workspace
          // would make BOTH denials vacuous).
          expect(
            handle.command("h3ctl"),
            "bug-0162 live cell precondition unmet: the unrelated control did not register — a " +
              "broken workspace, not the inline-enum refusal under test, would explain either " +
              "denial below too. Registered: " + JSON.stringify(handle.registeredNames()),
          ).toBeDefined();

          // The over-refusal fence must register BEFORE either denial is
          // asserted, isolating the denials to the inline-enum text
          // specifically.
          expect(
            handle.command("h3legal"),
            'bug-0162 live cell: the legal `"a" | "b"` sibling did not register — precondition ' +
              "unmet (the inline-enum row's own *Fix hint* points authors at exactly this " +
              "spelling, so it must keep loading; over-refusal here would hide the denials below " +
              "inside a broken control rather than a targeted fix). Registered: " +
              JSON.stringify(handle.registeredNames()),
          ).toBeDefined();

          // THE FIXED OBSERVABLE: through the REAL production composition
          // root, the theta whose `params:` field declares
          // `enum[{a: string}]` must NOT register — pre-fix this loaded clean
          // (bug 0059's brace exemption) and registered with the
          // assert-nothing `{}` lowered for the field.
          expect(
            handle.command("h3braceenum"),
            "bug-0162 live cell: a `p: 'enum[{a: string}]'` theta registered anyway through the " +
              "live discovery/session_start path — `theta/parse/inline-enum` did not fire at the " +
              "params: position's own top level, so the field lowered to the assert-nothing `{}` " +
              "and a value the author declared as an enumeration validates nothing. Registered: " +
              JSON.stringify(handle.registeredNames()),
          ).toBeUndefined();
          expect(
            handle.registeredNames(),
            "Registered: " + JSON.stringify(handle.registeredNames()),
          ).not.toContain("h3braceenum");

          // The optional strengthening: the bare canonical spelling must ALSO
          // not register (it was already refused pre-fix by the generic row,
          // so this is not itself a GOV-15 addition — the registration
          // observable alone cannot distinguish the code that refused it).
          expect(
            handle.command("h3bareenum"),
            'bug-0162 live cell: a `p: \'enum["x", "y"]\'` theta registered — the bare spelling ' +
              "must stay refused (by either code) through the live path. Registered: " +
              JSON.stringify(handle.registeredNames()),
          ).toBeUndefined();

          // The theta-system-note channel (AGENTS.md §"Assert on real
          // observables"), read off the settled in-memory `SessionManager`
          // rather than off racy events: both refusals fire at LOAD time,
          // before any drive, so the full entry list is the delta. This is
          // the code-distinguishing half: `h3braceenum`'s note must name the
          // REGISTERED inline-enum row, not the generic text refusal, proving
          // the fix moved the CODE and not merely withheld registration by
          // some other means.
          const loadNotes = systemNoteContents(handle.sessionManager.getEntries());
          const expectedFragment = inlineEnumFragment();
          expect(
            loadNotes.some((note) => note.includes(expectedFragment)),
            "bug-0162 live cell: no theta-system-note entry named the registered " +
              `\`${INLINE_ENUM_CODE}\` rejection for either enum[...] sibling — the fix must ` +
              "raise this SPECIFIC code at the params: position's own top level, not merely " +
              "withhold registration by some other route. Notes: " + JSON.stringify(loadNotes),
          ).toBe(true);
        } finally {
          await handle.dispose();
          workspace.dispose();
        }
      },
    );
  },
);
