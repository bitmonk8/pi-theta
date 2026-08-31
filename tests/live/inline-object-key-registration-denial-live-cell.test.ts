// H8a live REGISTRATION-DENIAL cell — bug 0249: a reserved keyword spelled as
// an inline object type's field key (`schema S { p: { let: string } }`) or as
// a typed object-literal key (`let x = [schema T { a: "s", let: 1 }]`) reached
// no parser leaf and REGISTERED with an empty diagnostic list
// (docs/bugs/0249-reserved-keyword-keys-no-parser-leaf-backstop.md
// §Reproduction A1/B1, §Fix constraint 8: "one H8a registration-denial cell
// over `schema S { p: { let: string } }` and
// `let x = [schema T { a: "s", let: 1 }]`, zero model turns").
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT
// (tests/reserved-keyword-inline-object-and-literal-keys.test.ts, the §Fix
// constraint 6 witness). The offline file pins `parseThetaDocument`'s
// diagnostic bytes directly. Nothing offline observes the REAL
// discovery → load → `pi.registerCommand` step
// (`hasLoadParseError`, src/extension/production-composition.ts:3263) that
// turns those bytes into a registration outcome — at HEAD (pre-fix) both
// shapes below draw `[]` and REGISTER; after the fix each draws an
// error-severity `theta/parse/reserved-keyword-as-identifier` and is DENIED.
// This cell runs the shipped production composition root
// (`bootShippedExtension`, ./harness) exactly as the nearest sibling mirror
// (tests/live/b0244live-keyless-entry-params-refusal-live-cell.test.ts,
// itself the fixed-sibling pattern this file copies) does.
//
// TWO OFFENDERS, ONE EACH POSITION, PLUS BYTE-NEIGHBOUR SIBLINGS differing in
// the SPELLING alone (`let` -> `ok`), so an absent registration is bounded to
// the reserved spelling rather than to "an inline object type" or "a typed
// object-literal constructor" in general:
//   - TYPE_OFFENDER: `schema S { p: { let: string } }` (§Reproduction A1).
//   - TYPE_SIBLING:  `schema S { p: { ok: string } }` (§Reproduction A11).
//   - LIT_OFFENDER:  `schema T { a: string }` /
//                    `let x = [schema T { a: "s", let: 1 }]` (§Reproduction B1).
//   - LIT_SIBLING:   §Reproduction B9's own control — the same constructor
//                    with NO second key at all (schema T declares only `a`,
//                    so a legal-SPELLING second key would still be an EXTRA
//                    field and would deny registration for an unrelated
//                    reason — see the fixture's own comment).
// A third, unrelated PRECONDITION theta proves the workspace and the
// discovery walk themselves work, so an empty registered set cannot satisfy
// the absence assertions vacuously.
//
// ZERO MODEL TURNS (§Fix constraint 8, verbatim). No slash command is
// invoked anywhere in this file — every assertion reads
// `handle.command(stem)` / `handle.registeredNames()` off the real
// `ExtensionRunner` after the real `session_start` step. `requireLiveProvider`
// still gates the cell and FAILS LOUDLY on a missing provider/model
// (AGENTS.md §"No silent skipping"): the composition root under test is the
// live one and the cell must not report success when nothing was verified.
//
// Subagent child-process launch: NOT reached. Every fixture is `mode: prompt`
// with no `tools:` and no drive, so no query-time tool-call loop and no
// RFC-0006 subagent-child spawn occurs. `harness.ts` carries the
// `#subagent-child-pins` module-scope setters regardless (inherited by
// importing it).
//
// RED / GREEN (AGENTS.md "Verify both directions"). At HEAD (pre-fix,
// `RESERVED_KEYWORDS.has(name) -> continue` in `type-grammar.ts` and the
// kind-gated drop in `parseObjectLiteral`) both offenders draw `[]` and
// REGISTER, so `.toBeUndefined()` below reds — that is this cell's red
// direction, proven by neutralising the fix (obligation 1 of this
// verification round) and re-running this exact file.
//
// TIER: H8a-T, live-host, registration-only, zero tokens.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

const PRECONDITION_STEM = "b0249livectl";
const TYPE_OFFENDER_STEM = "b0249livetypeoffender";
const TYPE_SIBLING_STEM = "b0249livetypesibling";
const LIT_OFFENDER_STEM = "b0249livelitoffender";
const LIT_SIBLING_STEM = "b0249livelitsibling";

/** An unrelated theta, present only to prove the workspace itself is sound. */
const PRECONDITION_THETA = ["---", "mode: prompt", "---", "1", ""].join("\n");

/** §Reproduction A1 verbatim: the inline object type's field key. */
const TYPE_OFFENDER = [
  "---",
  "mode: prompt",
  "---",
  "schema S { p: { let: string } }",
  "1",
  "",
].join("\n");

/** The byte-neighbour: the same shape, a legal spelling in the identical slot. */
const TYPE_SIBLING = [
  "---",
  "mode: prompt",
  "---",
  "schema S { p: { ok: string } }",
  "1",
  "",
].join("\n");

/** §Reproduction B1 verbatim: the typed object-literal key. */
const LIT_OFFENDER = [
  "---",
  "mode: prompt",
  "---",
  "schema T { a: string }",
  'let x = [schema T { a: "s", let: 1 }]',
  "1",
  "",
].join("\n");

/**
 * The legal sibling. NOT the same second-key shape with a legal spelling
 * substituted — `schema T` here declares only `a`, so ANY second key (legal
 * spelling or not) is an EXTRA field and, after this fix, draws its own
 * error-severity `theta/parse/extra-object-field` regardless of the key's
 * spelling, which would deny registration for a reason unrelated to bug
 * 0249's reserved-keyword rule. §Reproduction B9's own control ("a legal
 * constructor stays admitted") is the apt byte-neighbour instead: the same
 * constructor with NO second key at all.
 */
const LIT_SIBLING = [
  "---",
  "mode: prompt",
  "---",
  "schema T { a: string }",
  'let x = [schema T { a: "s" }]',
  "1",
  "",
].join("\n");

describe("H8a-T — bug 0249: a reserved-keyword inline-object-type key or typed-object-literal key denies registration, live, zero tokens", () => {
  it("keeps `schema S { p: { let: string } }` and `let x = [schema T { a: \"s\", let: 1 }]` out of the registered set while their byte-neighbour (legal-spelling) siblings and an unrelated control register", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      { source: "project", stem: PRECONDITION_STEM, text: PRECONDITION_THETA },
      { source: "project", stem: TYPE_SIBLING_STEM, text: TYPE_SIBLING },
      { source: "project", stem: LIT_SIBLING_STEM, text: LIT_SIBLING },
      { source: "project", stem: TYPE_OFFENDER_STEM, text: TYPE_OFFENDER },
      { source: "project", stem: LIT_OFFENDER_STEM, text: LIT_OFFENDER },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // ---- Preconditions: an empty registered set must not satisfy the
      // absence assertions below vacuously.
      expect(
        handle.command(PRECONDITION_STEM),
        "bug-0249 precondition unmet: the unrelated control theta did not " +
          "register — discovery or registration regressed independent of " +
          "this bug. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command(TYPE_SIBLING_STEM),
        "bug-0249 precondition unmet: `schema S { p: { ok: string } }` did " +
          "not register — a legal inline-object-type key cannot register in " +
          "this harness at all, independent of this bug. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command(LIT_SIBLING_STEM),
        "bug-0249 precondition unmet: " +
          '`let x = [schema T { a: "s", ok: 1 }]` did not register — a legal ' +
          "typed-object-literal key cannot register in this harness at all, " +
          "independent of this bug. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // ---- The fixed observable: the load-time refusal is an end-to-end
      // registration change, not a message change (§Fix constraint 8). Read
      // off the settled `ExtensionRunner`, never off a `prompt()` resolution.
      expect(
        handle.command(TYPE_OFFENDER_STEM),
        "bug-0249: `schema S { p: { let: string } }` REGISTERED — the " +
          "inline object type's field key still reaches no parser-leaf " +
          "refusal, so the reserved spelling is silently admitted. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.command(LIT_OFFENDER_STEM),
        "bug-0249: " + 'let x = [schema T { a: "s", let: 1 }]' +
          " REGISTERED — the typed object-literal's field key still reaches " +
          "no parser-leaf refusal, so the reserved spelling is silently " +
          "admitted. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0249: neither offending theta's slash name may appear in the " +
          "registered set.",
      ).not.toContain(TYPE_OFFENDER_STEM);
      expect(
        handle.registeredNames(),
        "bug-0249: neither offending theta's slash name may appear in the " +
          "registered set.",
      ).not.toContain(LIT_OFFENDER_STEM);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
