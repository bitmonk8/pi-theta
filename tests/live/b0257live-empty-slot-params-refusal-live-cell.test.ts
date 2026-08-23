// H8a live witness — bug 0257: an inline object entry SLOT spelling no token
// at all — the segment a doubled, leading or lone top-level comma opens — is
// passed over by `TypeParser.parseObject`'s `,`-at-a-field-name branch with no
// record, so a `params:` field declaring `p: '{,}'` loads with an EMPTY
// diagnostic list, REGISTERS, and lowers `p` to the permissive `{}` fragment —
// every value accepted, no warning — the exact bytes
// `theta/parse/empty-schema-body` refuses when an author writes `p: '{}'`
// directly
// (docs/bugs/0257-empty-inline-object-entry-slot-silently-tolerated.md
// §Reproduction (a) row a8, §(f) rows f12 and f13, §Why it matters).
//
// §Fix, AS THE SETTLED ROUTE SCOPES IT
// (tests/inline-object-empty-entry-slot-refusal.test.ts is that route's
// offline witness). The refusal is buffered in the arm that tolerates the slot
// and REUSES two landed rows with the declaration position's own partition: a
// slot behind at least one derived `Field` draws
// `theta/parse/malformed-schema-field`
// (docs/spec_topics/diagnostics/code-registry-parse.md:99), a slot with none
// before it — `{,}` — draws `theta/parse/empty-schema-body`
// (docs/spec_topics/diagnostics/code-registry-parse.md:98), one line per
// written mistake (bug 0129's count-consequence law,
// docs/spec_topics/diagnostics/code-registry-parse.md:104). The grammar-legal
// trailing comma `ObjectType`'s `","?` admits is a hard bound and is not
// touched (§Non-goals).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT. The offline witness pins
// `parseThetaDocument`'s diagnostic bytes and `loweredSchema` bytes directly.
// This route moves a REGISTRATION outcome at the verbatim `params:` position
// (§Reproduction (b) row b9, §(f) f12), and no offline cell observes the real
// discovery → load → `pi.registerCommand` path deciding it. §Fix's own
// "Witness" clause states the obligation in those words: "Live cover is owed
// only if the refusal changes what reaches a provider-facing schema — §(f) f12
// says it does, by refusing the document that produced it". This cell runs the
// shipped production composition root (`bootShippedExtension`, ./harness), the
// same path
// tests/live/b0256live-stranded-entry-params-refusal-live-cell.test.ts — the
// nearest sibling mirror, whose delivered reach this report extends from the
// opposite side of the same field loop — uses.
//
// THREE PARTS:
//   (1) OFFENDER — a theta whose `params:` field is `p: '{,}'` — must be
//       ABSENT from the registered set: the refusal is error-severity
//       `theta/parse/*`, and `hasLoadParseError`
//       (src/extension/production-composition.ts) then withholds registration
//       and `loweredSchema` is `null`. At HEAD (pre-fix) this theta registers
//       with zero diagnostics and hands the provider the permissive `{}` for
//       `p`, which is the class itself.
//   (2) CONTROL — the same file with the comma-only interior written as one
//       well-formed field (`p: '{a: integer}'`) and nothing else changed. It
//       must REGISTER and drive a REAL turn, so the offender's absence is
//       bounded to the offending comma rather than to the inline-object
//       `params:` shape, the binder or the workspace. The control keeps the
//       SAME enclosure as the offender — a bare inline object at the verbatim
//       `params:` position — because that position is the one that reaches a
//       provider-facing schema, and a control written at another position
//       would not bound it.
//   (3) A precondition control (`b0257livectl`), an ordinary `mode: prompt`
//       theta in the same workspace, registration-only, so a missing
//       registration above cannot be misattributed to a broken workspace.
//
// SENTINEL DISCIPLINE: the control's drive discriminator is the ANSWER to
// arithmetic over two bound scalar `params:` fields (263 + 514 = 777) — never
// a "reply with exactly this string" echo, which current models read as prompt
// injection (AGENTS.md; bug 0243), and never a narrative framing the value as
// unseen tool output. 777 is computable only from two values that BOTH reached
// the rendered body. The arithmetic runs over `x` and `y` rather than over a
// field of `p`, because the two columns declare DIFFERENT `p` schemas by
// construction — that difference is the subject — so a field of `p` is not a
// value one contract pins across both and would be a stochastic oracle.
//
// SUBAGENT CHILD PINS: not reached — every theta below is `mode: prompt` with
// no `tools:` and no `invoke(...)`, so no RFC-0006 child launches. The shared
// harness (./harness) sets BOTH #subagent-child-pins plus the parent-pid
// carriage at module scope regardless, which importing it inherits.
//
// NO SILENT SKIPPING: a missing live provider/model fails loudly through
// `requireLiveProvider` (`failLoudly`); nothing here early-returns or skips,
// and every registration assertion carries the registered set in its message.
//
// OFFLINE ATTRIBUTION GUARD: the diagnostic and `loweredSchema` block runs
// BEFORE the live host is required, so a neutralised fix reds here with zero
// tokens spent.
//
// Token cost: one live drive (one binder pass plus one body turn).

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";
import { parseDoc } from "../helpers/e2e-s1";

/**
 * The `empty-schema-body` line the comma-only interior draws, rendered with the
 * ANONYMOUS inline subject `{}` — the `<X>` rule at
 * docs/spec_topics/diagnostics/placeholder-rendering-b.md:55, and the same
 * rendering `p: '{}'` itself already draws, which is the pair §(f) f12/f13
 * turns on.
 */
const EMPTY_BODY_LINE =
  "error theta/parse/empty-schema-body: '{}' has no fields; an empty schema cannot be validated.";

/** The two declared scalar values the slash argument names; their sum is the oracle. */
const X_VALUE = 263;
const Y_VALUE = 514;
/** 263 + 514 — computable only from values that BOTH reached the rendered body. */
const SUM = String(X_VALUE + Y_VALUE);

/** The committed marker prefixing the rendered outbound turn (the `userTexts` read). */
const BODY_MARKER = "B0257LIVE-BOUND";

const PRECONDITION_STEM = "b0257livectl";
const CONTROL_STEM = "b0257livecontrol";
const OFFENDER_STEM = "b0257liveoffender";

/**
 * One theta over a `params:`-supplied inline object type at the verbatim
 * `params:` position — the position that reaches a provider-facing schema —
 * differing ONLY in whether the interior spells a comma-opened empty slot or a
 * well-formed field. The two scalar fields beside it carry the drive's oracle;
 * the body interpolates both behind a committed marker and then asks for their
 * sum, so the drive carries two independent observables: the deterministic
 * outbound render (`userTexts`) and the model's arithmetic answer.
 */
function paramsTheta(type: string): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    `  p: '${type}'`,
    "  x: integer",
    "  y: integer",
    "---",
    "@`" +
      BODY_MARKER +
      " x=${x} y=${y}. What is ${x} plus ${y}? Answer with the number only.`",
    "",
  ].join("\n");
}

/**
 * The subject — a comma-only interior. No `Field` derives before the slot the
 * lone comma opens, so the partition sends it to `empty-schema-body`. At HEAD
 * (pre-fix) this reports `[]`, registers, and lowers `p` to the permissive `{}`
 * (§Reproduction (a) row a8, §(f) row f12).
 */
const OFFENDER = paramsTheta("{,}");

/**
 * The control: the same file with the interior written as one well-formed
 * field. It spells no comma at all, so the tolerating branch is never entered,
 * at HEAD and after the fix alike.
 */
const CONTROL = paramsTheta("{a: integer}");

/** An unrelated theta, present only to prove the workspace itself is sound. */
const PRECONDITION_THETA = [
  "---",
  "mode: prompt",
  "---",
  "@`What is 111 plus 222? Answer with the number only.`",
  "",
].join("\n");

/**
 * The fail-closed markers a top-level theta drive lands on the
 * `theta-system-note` channel (AGENTS.md §"Assert on real observables"). The
 * control's drive must produce none of them.
 */
const FAIL_CLOSED_MARKERS = ["returned Err:", "cancelled", "aborted"] as const;

function diagLines(text: string, path: string): string[] {
  return parseDoc(text, path).diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** The `params:` lowering, verbatim — `null` when the frontmatter is withheld. */
function loweredParams(text: string, path: string): string {
  return JSON.stringify(parseDoc(text, path).frontmatter?.params?.loweredSchema ?? null);
}

describe("bug 0257 live: a `params:` field whose inline object interior is a comma-only empty slot is REFUSED at live production load and un-registers the theta, while its well-formed neighbour control at the same `params:` position registers and drives", () => {
  it("keeps `p: '{,}'` out of the registered set while `p: '{a: integer}'` registers and completes a real turn over both bound scalar fields", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender carries the refusal ALONE (bug 0129's
    // count-consequence law) and withholds its frontmatter, and the control
    // carries none, so a neutralised fix reds here before a single token is
    // spent.
    expect(
      diagLines(OFFENDER, `${OFFENDER_STEM}.theta`),
      "attribution: the slot the lone comma opens must draw one " +
        "theta/parse/empty-schema-body line and nothing else — no `Field` derives before it, " +
        "which is the only question the partition depends on. At HEAD (pre-fix) this list is " +
        "EMPTY, which is bug 0257 itself. A theta/parse/malformed-schema-field here is the " +
        "partition inverted",
    ).toEqual([EMPTY_BODY_LINE]);
    expect(
      loweredParams(OFFENDER, `${OFFENDER_STEM}.theta`),
      "attribution: a refused document withholds its frontmatter, so `loweredSchema` is the " +
        "`null` that `p: '{}'` already yields (§(f) row f13). The permissive " +
        '`{"type":"object","properties":{"p":{}},…}` here is §(f) row f12 — the wire harm this ' +
        "live cell exists for",
    ).toEqual("null");
    expect(
      diagLines(CONTROL, `${CONTROL_STEM}.theta`),
      "attribution: the control (one well-formed field, same `params:` position) must carry " +
        "zero diagnostics — the fix must not over-refuse an inline object type that opens no " +
        "slot",
    ).toEqual([]);

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      { source: "project", stem: PRECONDITION_STEM, text: PRECONDITION_THETA },
      { source: "project", stem: CONTROL_STEM, text: CONTROL },
      { source: "project", stem: OFFENDER_STEM, text: OFFENDER },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command(PRECONDITION_STEM),
        "the precondition control did not register — a broken workspace, not the refusal, would " +
          "explain the offender's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // (2) CONTROL: registers, and its drive proves the whole path the
      // offender is denied — bind, render, turn — is live in this workspace.
      expect(
        handle.command(CONTROL_STEM),
        "the control `p: '{a: integer}'` did not register — the fix over-refuses a well-formed " +
          "inline object type at `params:`, or such a `params:` theta cannot register in this " +
          "harness at all (check the `bind_model:` chain). Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // (1) OFFENDER: the fixed observable, read off the settled
      // `ExtensionRunner` — never a `prompt()` resolution. At HEAD (pre-fix)
      // this theta registers with an empty diagnostic list and hands the
      // provider the permissive `{}` for `p`.
      expect(
        handle.command(OFFENDER_STEM),
        "`params: p: '{,}'` REGISTERED — the slot the lone comma opens is still passed over " +
          "with no record in `TypeParser.parseObject`'s `,`-at-a-field-name branch, so the " +
          "document loads with no diagnostic and `p` lowers to the permissive `{}` that " +
          "accepts every value, from the same bytes `p: '{}'` is refused for producing. " +
          "Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "the refused theta's slash name must not appear in the registered set.",
      ).not.toContain(OFFENDER_STEM);

      const controlTurn = await driveSlashCaptureTurn(
        handle,
        `/${CONTROL_STEM} p has a of 5, x is ${String(X_VALUE)} and y is ${String(Y_VALUE)}`,
      );
      expect(
        controlTurn.userTexts.join("\n"),
        "the control's outbound turn did not render both bound scalar `params:` fields — the " +
          "binder did not bind `{x, y}` for a contract that declares them, so the offender's " +
          "absence above would be unattributable. Outbound: " +
          JSON.stringify(controlTurn.userTexts) +
          "; notes: " +
          JSON.stringify(controlTurn.systemNotes),
      ).toContain(`${BODY_MARKER} x=${String(X_VALUE)} y=${String(Y_VALUE)}`);
      expect(
        controlTurn.systemNotes.filter((note) =>
          FAIL_CLOSED_MARKERS.some((marker) => note.includes(marker)),
        ),
        "the control's drive ended fail-closed. Notes: " + JSON.stringify(controlTurn.systemNotes),
      ).toEqual([]);
      expect(
        controlTurn.text,
        "the control's live reply did not contain the arithmetic oracle " +
          `(${SUM}, from ${String(X_VALUE)} plus ${String(Y_VALUE)}) — the sum is computable ` +
          "only from two values that BOTH reached the rendered body. Reply: " +
          JSON.stringify(controlTurn.text),
      ).toContain(SUM);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
