// H8a live witness — bug 0143 §Fix (b) route 1, as settled in-run: `named`
// `CompatType`'s `withheld` provenance marker (src/parser/type-compat.ts),
// minted only by the exported factory `withheldBinderType()`, distinguishes
// the engine's own mint of the withheld-binder sentinel from an author's
// `<withheld>` annotation of the SAME ten characters. The offline unit
// witnesses (tests/withheld-sentinel-author-twin-provenance.test.ts,
// tests/withheld-sentinel-mooting-and-render-pins.test.ts) pin the module-seam
// forgery and the mooting-lock diagnostics at the `parseDoc` boundary; neither
// observes the real discovery→registration path deciding whether a
// match-arm-binder-carrying `.theta` becomes a slash command and drives a
// live turn, nor the theta-system-note channel a real `SessionManager`
// settles for the DECLINED-face-1 control. This cell drives both through the
// shipped production composition root (`bootShippedExtension`), mirroring
// `tests/live/fn-call-arity-live-cell.test.ts` and
// `tests/live/empty-object-discriminator-field-withhold-live-cell.test.ts`'s
// pattern, and asserts on real observables — the `theta-system-note` channel
// read off the settled `SessionManager`, `driveSlashCaptureTurn`'s
// deterministic `userTexts`/`systemNotes`, and registration presence — never
// on `prompt()` merely resolving.
//
// TWO HALVES:
//   (i) CLEAN — a theta whose body reads a match-arm binder into a position
//       where the withhold gate defers (the join-element gate over
//       `match 1 { n => [n] }.join(",")`, measured offline at HEAD to report
//       `[]`) LOADS CLEANLY, REGISTERS, and drives ONE real turn. The prompt is
//       an ARITHMETIC DISCRIMINATOR (never a "reply with exactly this string"
//       sentinel echo — models refuse bare sentinel echoes, and AGENTS.md's
//       "sentinel-refusal hardening" names the resulting red a false
//       negative): it asks for the numeric result of a small, fixed
//       computation, so the pinned value is a number the model computes, not
//       a string it is told to repeat.
//   (ii) CONTROL — `let v: <withheld> = [1]` (the report's own annotation
//       shape, group M's m5 position) must NOT register, and its
//       theta-system-note must carry `theta/parse/annotation-type-not-expression`
//       — the mooting of face 1, live: bug 0143 §Fix declines face 2 and
//       closes face 1's root by construction, and this is the observable that
//       the annotation position is refused outright rather than silently
//       admitted with a forged withhold.
//
// A third, unrelated precondition control registers and is NOT driven (zero
// tokens), so an absent CLEAN/CONTROL registration cannot be misattributed to
// a broken workspace.
//
// SUBAGENT CHILD PINS: not required for this observable — both fixed thetas
// are `mode: prompt` with no `tools:` and no `invoke`, so no RFC-0006
// subagent-child spawn occurs. `harness.ts` carries the
// `#subagent-child-pins` module-scope setters regardless (inherited by
// importing it).
//
// Token cost: ONE live turn (the CLEAN half's arithmetic-discriminator
// query). The CONTROL half is registration-only, so no drive is attempted and
// no tokens are spent on it. The precondition control is likewise
// registration-only.
//
// NO SILENT SKIPPING: a missing live provider/model fails loudly through
// `requireLiveProvider` (`failLoudly`); nothing here early-returns or skips.
//
// Bug 0030's file-scope `console.error` spy gates this file: the filtered
// capture (`thetaOwnedStderrLines`) must be empty.
//
// RED / GREEN (AGENTS.md "Verify both directions"): proved by hand during
// verification against the SAME provenance-mint neutralisation the offline
// witness's obligation 1(a) uses (`withheldBinderType()` reverted to the
// unmarked `{ kind: "named", name: WITHHELD_BINDER_TYPE_NAME }` literal) —
// see the verification report for whether that direction was driven live or
// proved offline and why. (bug-0143-live-cell )

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";
import { thetaOwnedStderrLines } from "./theta-stderr-prefixes";
import { parseDoc } from "../helpers/e2e-s1";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../../tools/code-registry/index.js";

/** The mooted face-1 refusal — the CONTROL half's expected code. */
const ANNOTATION_NOT_EXPR_CODE = "theta/parse/annotation-type-not-expression";

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
 * real observables"). Mirrors `live-production-acceptance.test.ts`'s
 * `systemNoteContents`.
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

const PRECONDITION_STEM = "b0143livectl";
const CLEAN_STEM = "b0143liveclean";
const CONTROL_STEM = "b0143livecontrol";

/**
 * CLEAN — the fixed-path shape. `match 1 { n => [n] }` reads its pattern
 * binder `n` through the settled fix's mint site (the type layer's own
 * `matchArmScope`, ./type-layer-checks.ts, which this join-element position
 * exercises via `checkMethodCall`'s withhold gate); measured offline at HEAD
 * to report zero diagnostics. `18 + 24` is the fixture's fixed arithmetic
 * oracle (42) — an ARITHMETIC DISCRIMINATOR prompt, not a sentinel echo, per
 * AGENTS.md's sentinel-refusal hardening.
 */
const CLEAN_THETA =
  [
    "---",
    "mode: prompt",
    "---",
    "// bug 0143 join-element withhold-gate live carrier",
    'let q = match 1 { n => [n] }.join(",")',
    "@`What is 18 + 24? Reply with only the resulting integer digits and nothing else.`",
  ].join("\n") + "\n";

/**
 * CONTROL — the report's own m5 annotation shape
 * (tests/withheld-sentinel-mooting-and-render-pins.test.ts `lockPosition`'s
 * `let v: ${t} = [1]` build): the sentinel spelled as a `let` annotation.
 * Measured offline at HEAD to draw exactly one `E`-severity diagnostic,
 * `theta/parse/annotation-type-not-expression` naming `v`, which denies
 * registration — the live observable of face 1's mooting.
 */
const CONTROL_THETA =
  [
    "---",
    "mode: prompt",
    "---",
    "// bug 0143 face-1 mooting control",
    "let v: <withheld> = [1]",
    "1",
  ].join("\n") + "\n";

/** An unrelated theta, present only to prove the workspace itself is sound. */
const PRECONDITION_THETA =
  [
    "---",
    "mode: prompt",
    "---",
    "@`What is 2 + 2? Reply with only the resulting integer digits and nothing else.`",
  ].join("\n") + "\n";

/**
 * The fail-closed markers a top-level theta drive lands on the
 * `theta-system-note` channel (AGENTS.md §"Assert on real observables"). The
 * CLEAN drive must produce none of them.
 */
const FAIL_CLOSED_MARKERS = ["returned Err:", "cancelled", "aborted"] as const;

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
      "bug 0018's live verification observable for this suite is a 0-byte " +
        "stderr capture; this spy caught theta-owned stderr line(s) instead: " +
        JSON.stringify(offenders),
    ).toEqual([]);
  } finally {
    spy?.mockRestore();
    consoleErrorSpy = undefined;
  }
});

describe("bug 0143 live: a match-arm-binder join-element read loads/registers/drives clean, and the `<withheld>` annotation control is mooted", () => {
  it("registers and drives the CLEAN join-element carrier to the arithmetic oracle, and refuses the CONTROL annotation with annotation-type-not-expression", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): pin both fixtures' diagnostic lists at the `parseDoc`
    // boundary so neither live observable below can be produced by an
    // unrelated load failure.
    expect(
      parseDoc(CLEAN_THETA, "b0143liveclean.theta").diagnostics,
      "attribution: the CLEAN fixture must load with zero diagnostics — the " +
        "join-element withhold gate must defer on the match-arm binder read",
    ).toEqual([]);
    expect(
      parseDoc(CONTROL_THETA, "b0143livecontrol.theta").diagnostics.map((d) => d.code),
      "attribution: the CONTROL fixture must draw exactly one diagnostic, " +
        ANNOTATION_NOT_EXPR_CODE,
    ).toEqual([ANNOTATION_NOT_EXPR_CODE]);

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      { source: "project", stem: PRECONDITION_STEM, text: PRECONDITION_THETA },
      { source: "project", stem: CLEAN_STEM, text: CLEAN_THETA },
      { source: "project", stem: CONTROL_STEM, text: CONTROL_THETA },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command(PRECONDITION_STEM),
        "the precondition control did not register — a broken workspace, not " +
          "the fix, would explain the CLEAN/CONTROL thetas' behaviour too. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // (i) CLEAN — the fixed observable: registers, and drives clean.
      expect(
        handle.command(CLEAN_STEM),
        "bug-0143: the join-element carrier over a match-arm binder read did " +
          "not register — the withhold gate stopped deferring on the pass's " +
          "own `#matchArmScope` mint. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toContain(CLEAN_STEM);

      const turn = await driveSlashCaptureTurn(handle, `/${CLEAN_STEM}`);
      expect(
        turn.text,
        "bug-0143: the live model reply for the CLEAN carrier did not " +
          "contain the fixture's arithmetic oracle (42, from 18 + 24). Reply: " +
          JSON.stringify(turn.text),
      ).toContain("42");
      expect(
        turn.systemNotes.filter((note) =>
          FAIL_CLOSED_MARKERS.some((marker) => note.includes(marker)),
        ),
        "bug-0143: the CLEAN carrier's drive must end clean — a fail-closed " +
          "theta-system-note here means the join-element withhold gate (or " +
          "the runtime join evaluation) broke despite parsing clean. Notes: " +
          JSON.stringify(turn.systemNotes),
      ).toEqual([]);

      // (ii) CONTROL — the mooting of face 1, live: refused outright, never
      // silently admitted with a forged withhold.
      expect(
        handle.command(CONTROL_STEM),
        "bug-0143: `let v: <withheld> = [1]` registered — face 1's mooting " +
          "(the 0124/0061 capture closure) did not deny registration at the " +
          "live load path. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain(CONTROL_STEM);

      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = registryFragment(ANNOTATION_NOT_EXPR_CODE, { name: "v" });
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "bug-0143: no theta-system-note entry named " +
          ANNOTATION_NOT_EXPR_CODE +
          " naming 'v' for the CONTROL declaration — the live refusal did not " +
          "carry the mooting note the offline group-M lock pins. Notes: " +
          JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
