//
// Lane token for this fix's cells: 
//
// H8a live witness -- bug 0237: an inline object entry whose TYPE position is
// empty truncated the interior at that entry, because
// `TypeParser.parsePrimary`'s tolerant punctuation skip ate the
// entry-separating `,` and returned the NEXT entry's name as the empty entry's
// type. Every entry behind the empty one was therefore absent from
// `TypeNode.fieldNames` / `TypeNode.fieldTypes`, so a `params:` field spelled
// `p: '{a: , Zs: string}'` loaded with an EMPTY diagnostic list, REGISTERED,
// and lowered the uppercase key `Zs` into the provider-facing `$defs`
// (`"$defs":{"__inline_41292d1fcb4b229d":{"type":"object","properties":
// {"Zs":{"type":"string"}}…}}`) -- the very key bug 0154's lowercase-first pass
// exists to refuse
// (docs/bugs/0237-empty-inline-field-type-truncates-interior.md
// §Reproduction (b) row b8 and §Reproduction (f) row f6).
//
// §Fix (a) route `resync-aware-skip`, taken UNPAIRED and NARROWED TO THE `,`:
// in `TypeParser.parsePrimary`'s tolerant punctuation arm a `,` standing while
// a `parseObject` field loop or a `parseGeneric` argument list is OPEN is the
// entry separator that construct owns, so the arm returns `undefined` instead
// of consuming it. A `}` or a `>` is not declined and keeps the pre-existing
// skip-and-recurse recovery. `parseObject`'s field loop then reads
// the whole interior, `Zs` reaches `fieldNames`, and
// `theta/parse/binding-case-mismatch` (E, parse) refuses the document -- so the
// `params:` theta does NOT register and no `$defs` key `Zs` is minted. No new
// diagnostic code, no registry row, no `permitted-codes.json` change.
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/inline-object-empty-field-type-truncation.test.ts` pins the
// diagnostic bytes (120 list cells) and the withheld `params:` lowering
// directly at the `parseThetaDocument` boundary. No offline cell observes the
// real discovery->registration path deciding whether a `.theta` whose
// `params:` field carries `{a: , Zs: string}` becomes a slash command at all,
// nor whether its refusal reaches the AUTHOR. This cell drives that decision
// through the shipped production composition root (`bootShippedExtension`),
// mirroring `tests/live/inline-object-malformed-entry-resync-live-cell.test.ts`
// and `tests/live/params-unterminated-literal-live-cell.test.ts` structure
// exactly, and asserts on real observables -- the `theta-system-note` channel
// read off the settled `SessionManager` -- never on `prompt()` merely
// resolving. This is the live cover §Fix (e) owes because the route changes
// what reaches a provider-facing schema.
//
// THREE PARTS:
//   (1) OFFENDER -- the `params:` document `p: '{a: , Zs: string}'` must NOT
//       register post-fix: `Zs`'s `binding-case-mismatch` is E-severity, so
//       the load gate denies registration and the refusal lands on the
//       theta-system-note channel before any drive is attempted -- no tokens
//       spent. Pre-fix this theta loads with an EMPTY diagnostic list,
//       registers, and mints the uppercase `$defs` key -- the exact regression
//       this cell proves closed.
//   (2) GOOD_PARAMS -- the byte-neighbour `params:` sibling
//       `p: '{a: integer, b: string}'`, identical frontmatter shape, an
//       all-lowercase interior. It must STILL register, so the OFFENDER's
//       absence cannot be misattributed to "a `params:`-declaring theta never
//       registers in this harness". Both `params:` thetas carry the same
//       resolvable `bind_model:` (an inline-object `params:` field is a
//       NON-bypass shape under `classifyBinderBypass`, so its binder model
//       must resolve at load time or `theta/load/binder-model-unresolved`
//       would explain the absence instead of this fix).
//   (3) CLEAN -- a case-clean annotation sibling
//       (`array<{a: integer, zs: string}>`) that registers and DRIVES a real
//       typed query to completion, so "still registers AND still drives" is
//       proven end to end through the real composition root. One live turn,
//       sentinel-pinned.
//
// SUBAGENT CHILD PINS: not required for the parse/registration observable --
// every theta below is `mode: prompt` and drives no `invoke` -- but the shared
// harness sets BOTH #subagent-child-pins plus the parent-pid carriage at
// module scope regardless (`./harness`), the AGENTS.md requirement for any
// in-process harness that can reach the RFC-0006 child launch.
//
// Token cost: ONE live turn (the CLEAN sibling's typed query + task-question answer).
// Parts (1) and (2) are registration-only.
//
// Bug 0030's file-scope `console.error` spy gates this file: the filtered
// capture (`thetaOwnedStderrLines`) must be empty.
//
// OFFLINE ATTRIBUTABLE GUARD: the attribution check runs BEFORE the live host
// is required, so a neutralised fix reds here with zero tokens spent (per
// AGENTS.md's "prefer the offline-attributable guard").

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../../tools/code-registry/index.js";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";
import { thetaOwnedStderrLines } from "./theta-stderr-prefixes";
import { parseDoc } from "../helpers/e2e-s1";

/** The registered row bug 0154's pass draws, withheld by bug 0237's truncation. */
const CASE = "theta/parse/binding-case-mismatch";

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `<code>: <Message>` for the case row, read from the registry rather than
 * copied (DIAG-4: the *Message* column is normative). The row carries no
 * placeholder.
 */
function caseNoteFragment(): string {
  const template = registryMessage(REGISTRY, CASE) as string | undefined;
  expect(
    template,
    `${CASE} has no registry row -- the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  return `${CASE}: ${template as string}`;
}

const CTL = ["---", "mode: prompt", "---", '"THETA-LIVE-OK"', ""].join("\n");

/**
 * OFFENDER -- §Reproduction (b) row b8 / §Reproduction (f) row f6's exact
 * fixture: a `params:` field whose inline object type's FIRST entry has an
 * empty type position, followed by an uppercase-named well-formed field whose
 * case violation is unreachable pre-fix. Pre-fix: zero diagnostics, registers,
 * and the lowering mints `"properties":{"Zs":{"type":"string"}}` into `$defs`.
 * Query-free: the refusal/admission is decided at parse/load time.
 */
const OFFENDER = [
  "---",
  "mode: prompt",
  "bind_model: anthropic/claude-haiku-4-5",
  "params:",
  "  p: '{a: , Zs: string}'",
  "---",
  '"OFFENDER BODY RAN"',
  "",
].join("\n");

/**
 * GOOD_PARAMS -- the byte-neighbour `params:` sibling: the same non-bypass
 * inline-object shape and the same `bind_model:`, with a type spelled for the
 * first entry and an all-lowercase second key. Must still register and must
 * still lower its `$defs` hoist, so the OFFENDER's absence isolates to the
 * empty type position rather than to the `params:`/binder plumbing.
 */
const GOOD_PARAMS = [
  "---",
  "mode: prompt",
  "bind_model: anthropic/claude-haiku-4-5",
  "params:",
  "  p: '{a: integer, b: string}'",
  "---",
  '"ok"',
  "",
].join("\n");

// Drive discriminators are ANSWERS to task questions over the theta's own
// computed text -- deterministic content a degraded plain-prompt run cannot
// produce. A verbatim-echo demand ("reply with exactly this") reads as prompt
// injection to current models and draws refusals: the sentinel-refusal class
// filed as bug 0243.
const CLEAN_SENTINEL = "777";

/**
 * CLEAN -- the case-clean annotation sibling: every entry spells a type and
 * every key is lowercase. Registers and drives a real typed query, so the
 * route's own good path -- an ordinary two-field inline object inside a generic
 * argument, the position §Reproduction (c) measures -- is proven undisturbed.
 */
const CLEAN = [
  "---",
  "mode: prompt",
  "---",
  'let x: array<{a: integer, zs: string}> = @`Return a JSON array containing exactly ' +
    'one object of the shape {"a": 1, "zs": "' +
    CLEAN_SENTINEL +
    '"} and nothing else, no other text.`?',
  "@`What is 462 plus 315? Answer with the number only.`?",
  "",
].join("\n");

/**
 * The theta-system-note channel contents from the settled in-memory
 * `SessionManager`, read directly off `getEntries()` (AGENTS.md
 * §"Assert on real observables").
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

let consoleErrorSpy: MockInstance | undefined;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error");
});

afterEach(() => {
  const spy = consoleErrorSpy;
  try {
    const lines = (spy?.mock.calls ?? []).map((args) => args.map(String).join(" "));
    const offenders = thetaOwnedStderrLines(lines);
    expect(
      offenders,
      "bug 0018's live verification observable for this suite is a 0-byte stderr capture; this " +
        "spy caught theta-owned stderr line(s) instead: " + JSON.stringify(offenders),
    ).toEqual([]);
  } finally {
    spy?.mockRestore();
    consoleErrorSpy = undefined;
  }
});

describe("bug 0237 live: a params: field whose inline object type has an empty type position is refused at registration instead of minting an uppercase $defs key ", () => {
  it("does not register `p: '{a: , Zs: string}'` post-fix, the theta-system-note channel names binding-case-mismatch, and the well-formed params: sibling and the case-clean annotation sibling still register and drive ", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender carries exactly the fixed code and the two
    // siblings are clean, so neither live observable below can be produced by
    // an unrelated load failure. This reds a neutralised fix before any
    // provider call is made. The OFFENDER's list is the SPECIFIED value: at
    // HEAD it is `[]` (the truncation's silence), which is bug 0237 itself.
    expect(
      parseDoc(OFFENDER, "b237liveoffender.theta").diagnostics.map((d) => d.code),
      "attribution: the offending params: theta must carry exactly [binding-case-mismatch]; a " +
        "measured `[]` here is bug 0237's truncation still swallowing the entry separator, so " +
        "`Zs` never reaches `TypeNode.fieldNames`",
    ).toEqual([CASE]);
    expect(
      parseDoc(GOOD_PARAMS, "b237livegoodparams.theta").diagnostics.map((d) => d.code),
      "attribution: the byte-neighbour params: sibling must carry zero diagnostics -- the fix " +
        "must not disturb a well-formed inline-object params: field",
    ).toEqual([]);
    expect(
      parseDoc(CLEAN, "b237liveclean.theta").diagnostics.map((d) => d.code),
      "attribution: the case-clean annotation sibling must carry zero diagnostics -- the fix " +
        "must not disturb the good path",
    ).toEqual([]);
    // The provider-facing consequence, offline and token-free: the refused
    // `params:` document lowers NOTHING, so no `$defs` key escapes the case
    // rule (§Reproduction (f) row f6, §Expected behaviour point 4), while the
    // well-formed sibling keeps its `$defs` hoist.
    expect(
      parseDoc(OFFENDER, "b237liveoffender.theta").frontmatter,
      "attribution: a refused `params:` field withholds the WHOLE frontmatter object, so no " +
        "provider-facing schema is minted for the offender",
    ).toBeNull();
    expect(
      JSON.stringify(
        parseDoc(GOOD_PARAMS, "b237livegoodparams.theta").frontmatter?.params?.loweredSchema ??
          null,
      ),
      "attribution: the well-formed params: sibling must still lower its `$defs` hoist, so the " +
        "offender's withheld lowering is not merely 'this harness lowers no params: at all'",
    ).toContain('"$defs"');

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the same workspace, so an
      // absent OFFENDER registration cannot be misattributed to a broken
      // workspace.
      { source: "project", stem: "b237livectl", text: CTL },
      { source: "project", stem: "b237livegoodparams", text: GOOD_PARAMS },
      { source: "project", stem: "b237liveoffender", text: OFFENDER },
      { source: "project", stem: "b237liveclean", text: CLEAN },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b237livectl"),
        "the precondition control did not register -- a broken workspace, not the fix, would " +
          "explain the OFFENDER theta's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b237livegoodparams"),
        "the well-formed params: sibling `p: '{a: integer, b: string}'` did not register -- " +
          "precondition unmet (a non-bypass params: theta cannot register in this harness at " +
          "all, independent of this bug). Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root, a
      // `params:` field whose inline object type has an empty type position
      // does NOT register, so the uppercase key behind it never reaches a
      // provider-facing schema.
      expect(
        handle.command("b237liveoffender"),
        "`params:` `p: '{a: , Zs: string}'` registered -- bug 0237's truncation still eats the " +
          "entry separator, so `Zs`'s binding-case-mismatch never fires and the uppercase key " +
          "is lowered into `$defs`. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b237liveoffender");

      // The theta-system-note channel, read off the settled SessionManager --
      // the load-time diagnostic fires before any drive is attempted, so the
      // full entry list already carries it. This is the "reaches the author"
      // half: pre-fix the document registers SILENTLY, with no note at all.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = caseNoteFragment();
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named " + CASE + " for the OFFENDER declaration -- the " +
          "empty type position's truncation withheld the case rule's input, or the note is " +
          "missing entirely. Notes: " + JSON.stringify(notes),
      ).toBe(true);

      // The case-clean annotation sibling is unaffected: it registers.
      expect(
        handle.command("b237liveclean"),
        "the case-clean annotation sibling failed to register -- the fix must not disturb the " +
          "good path. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // "still drives": one real live turn, proving the case-clean sibling's
      // typed query over a two-field inline object inside a generic argument
      // completes against a live model and answers the paired arithmetic
      // question.
      const driven = await driveSlashCaptureTurn(handle, "/b237liveclean");
      expect(
        driven.text,
        "the live model reply for the case-clean sibling did not contain the deterministic " +
          "sentinel. Reply: " + JSON.stringify(driven.text),
      ).toContain(CLEAN_SENTINEL);
      expect(
        driven.systemNotes,
        "the driven turn over the case-clean sibling appended a theta-system-note (a " +
          "fail-closed ending) -- the good path must drive clean. Notes: " +
          JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
