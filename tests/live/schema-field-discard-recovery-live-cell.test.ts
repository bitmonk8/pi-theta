// H8a live witness — bug 0133 : `parseSchemaObjectBody`'s three
// recovery arms now RETAIN a captured field-list prefix and anchor one
// `theta/parse/malformed-schema-field` diagnostic at the offending token,
// instead of discarding the prefix and misattributing
// `theta/parse/empty-schema-body` to the DECLARATION
// (docs/bugs/0133-field-list-discard-recovery-unsettled.md, §Fix (a)).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/schema-field-discard-prefix-retention.test.ts` pins the exact
// diagnostic byte list at the `parseDoc` boundary. That cell does not observe
// the real discovery→registration path deciding whether a `.theta` carrying
// this shape becomes a slash command at all, nor the `theta-system-note`
// channel a real `SessionManager` settles with. This cell drives both through
// the shipped production composition root (`bootShippedExtension`, mirroring
// `tests/live/empty-object-discriminator-field-withhold-live-cell.test.ts`
// and `tests/live/let-annotation-query-double-emission-live-cell.test.ts`),
// and asserts on real observables — the `theta-system-note` channel read off
// the settled `SessionManager` — never on `prompt()` merely resolving.
//
// THE WITNESS PAIR (what makes this a real witness of the FIX, not a generic
// refusal test): the fixture `schema S { a: string, 42: integer }` captures a
// field (`a: string`) and then hits arm 1 (the `42` token is neither `ident`
// nor `keyword`). Pre-fix this body was discarded whole and the theta-system-
// note carried the declaration-subject line `'S' has no fields; an empty
// schema cannot be validated.`. Post-fix the retained prefix means that line
// must be ABSENT and the new `malformed-schema-field` line must be PRESENT.
// Asserting only "some E fired" would pass on either disposition; asserting
// the pair is what distinguishes them.
//
// REGISTRATION is the fixed observable for BOTH dispositions: every input
// that reaches a discard/retain arm carries an `E`-severity diagnostic either
// way (empty-schema-body pre-fix, malformed-schema-field post-fix), so
// `production-composition.ts`'s "no error-severity diagnostic" gate denies
// registration under both. The route decision's live enumeration
// (.pi/tmp/0133-route-decision.md §"Live surfaces enumerated") establishes
// that no existing live fixture reaches a discard/retain arm — every
// `empty-schema-body` live user is an inline-half (`{}`) subject the route
// does not touch — so this file adds the first live reach of the new code.
//
// SUBAGENT CHILD PINS: not required for the parse/registration observable —
// the fixture is `mode: prompt` and drives no `invoke`, and no drive is
// attempted at all (registration-only, mirroring the BAD half of
// `empty-object-discriminator-field-withhold-live-cell.test.ts`) — but the
// harness sets both #subagent-child-pins at module scope regardless (`./harness`).
//
// Token-bounded: registration-only, zero model turns.
//
// Bug 0030's file-scope `console.error` spy gates this file (mirrors the two
// mentor cells): the filtered capture (`thetaOwnedStderrLines`) must be empty.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  bootShippedExtension,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";
import { thetaOwnedStderrLines } from "./theta-stderr-prefixes";
import { parseDoc } from "../helpers/e2e-s1";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../../tools/code-registry/index.js";

/** The pre-fix declaration-subject code the retained prefix must NOT draw. */
const EMPTY_SCHEMA_BODY_CODE = "theta/parse/empty-schema-body";
/** Bug 0133's new row — the fixed observable. */
const MALFORMED_FIELD_CODE = "theta/parse/malformed-schema-field";

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/** DIAG-4: the message half is read from the registry row, not copied. */
function registryFragment(code: string, substitutions: Readonly<Record<string, string>>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `${code} has no registry row — the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  let message = template as string;
  for (const [key, value] of Object.entries(substitutions)) {
    message = message.replaceAll(`<${key}>`, value);
  }
  expect(
    message,
    `${code}: an unsubstituted placeholder remains — the registry row's Message template changed shape`,
  ).not.toMatch(/<[a-z]+>/);
  return `${code}: ${message}`;
}

/**
 * The theta-system-note channel contents from the settled in-memory
 * `SessionManager`, read directly off `getEntries()` (AGENTS.md §"Assert on
 * real observables"). Mirrors the two sibling cells' `systemNoteContents`.
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

/**
 * The bug document's §Reproduction fixture: a captured field (`a: string`)
 * followed by arm 1's offending token (`42`, neither `ident` nor `keyword`).
 * Pre-fix this discards the whole list and draws the declaration-subject
 * `empty-schema-body` line naming `'S'`; post-fix the prefix is retained and
 * one `malformed-schema-field` line anchors at the `42` token instead.
 */
const OFFENDER = [
  "---",
  "mode: prompt",
  "---",
  "schema S { a: string, 42: integer }",
  "let a = 1",
  "a",
  "",
].join("\n");

/** The precondition control: a well-formed prompt theta in the same workspace. */
const CONTROL = ["---", "mode: prompt", "---", '"CONTROL OK"', ""].join("\n");

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
      "bug 0018's live verification observable for this suite is a 0-byte stderr capture; " +
        "this spy caught theta-owned stderr line(s) instead: " + JSON.stringify(offenders),
    ).toEqual([]);
  } finally {
    spy?.mockRestore();
    consoleErrorSpy = undefined;
  }
});

describe("bug 0133 live : a captured schema-field prefix draws malformed-schema-field, not the declaration-subject empty-schema-body", () => {
  it("does not register `schema S { a: string, 42: integer }`, and the theta-system-note channel carries malformed-schema-field but NOT the declaration-subject empty-schema-body line ", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender must carry exactly the new code, and no other,
    // so neither live observable below can be produced by an unrelated load
    // failure.
    expect(
      parseDoc(OFFENDER, "b0133livecellf.theta").diagnostics.map((d) => d.code),
      "attribution: OFFENDER must carry exactly one diagnostic, " + MALFORMED_FIELD_CODE,
    ).toEqual([MALFORMED_FIELD_CODE]);
    expect(
      parseDoc(CONTROL, "b0133livecellfctl.theta").diagnostics,
      "attribution: CONTROL must carry zero diagnostics",
    ).toEqual([]);

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      {
        source: "project",
        stem: "b0133livecellfctl",
        text: CONTROL,
      },
      { source: "project", stem: "b0133livecellf", text: OFFENDER },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b0133livecellfctl"),
        "the precondition control did not register — a broken workspace, not the fixed gate, " +
          "would explain the offender's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable, half 1: registration is denied EITHER WAY (both
      // dispositions carry an E), so this alone does not distinguish the fix
      // from the pre-fix behaviour — the note-content assertion below is what
      // does.
      expect(
        handle.command("b0133livecellf"),
        "`schema S { a: string, 42: integer }` registered — malformed-schema-field's E-severity " +
          "refusal did not fire. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b0133livecellf");

      // The theta-system-note channel, read off the settled SessionManager —
      // the load-time diagnostic fires before any drive is attempted, so the
      // full entry list already carries it. THE FIXED OBSERVABLE: the new
      // malformed-schema-field fragment is present and the OLD
      // declaration-subject empty-schema-body fragment ('S' has no fields) is
      // ABSENT — the pair, not merely "some refusal fired".
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedMalformedFragment = registryFragment(MALFORMED_FIELD_CODE, {});
      const staleDeclarationFragment = registryFragment(EMPTY_SCHEMA_BODY_CODE, { X: "S" });
      expect(
        notes.some((note) => note.includes(expectedMalformedFragment)),
        "no theta-system-note entry named " +
          MALFORMED_FIELD_CODE +
          " for the offending declaration — bug 0133's fix did not take effect. Notes: " +
          JSON.stringify(notes),
      ).toBe(true);
      expect(
        notes.some((note) => note.includes(staleDeclarationFragment)),
        "a theta-system-note entry named " +
          EMPTY_SCHEMA_BODY_CODE +
          " naming the declaration 'S' fired — the pre-fix discard-and-misattribute behaviour " +
          "is still in effect. Notes: " +
          JSON.stringify(notes),
      ).toBe(false);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
