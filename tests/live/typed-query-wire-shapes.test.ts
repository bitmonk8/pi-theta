// H8a — LIVE twins of bug 0028's two respond-tool wire shapes
// (docs/bugs/0028-unresolved-annotation-silent-permissive-lowering.md §Fix).
//
// WHY LIVE. Both shapes are conveyance defects: the lowered schema is correct,
// the offline registration assertions pass on its bytes, and the drive still
// cannot terminate because a REAL model cannot produce a tool call the host
// will accept against it. Only a real provider turn scores that.
//
//   (a) A DECLARED `enum` AT THE ANNOTATION ROOT lowers to
//       `{"type":"string","enum":[…]}` (schema-subset.md:80). A tool call's
//       arguments are a JSON object at the wire, so registered bare this root
//       rejects EVERY possible call:
//         Validation failed for tool "__theta_respond_…":
//           - root: must be string
//         Received arguments: {}
//       The drive repair-spun past 180 s and died in
//       `theta/runtime/reload-teardown-timeout` with the invocation still in
//       flight. The fix registers the single-property envelope and unwraps
//       `.value`; the pre-existing `@<string>` hang retires with it.
//   (b) A NESTED NAMED-SCHEMA `$ref` (here forward-declared, the shape bug
//       0028's two-pass lowering newly reaches from every declaration order):
//       models deliver a nested object parameter as a single JSON-encoded
//       string, which the host's own coercion does not parse:
//           - pet: must be object
//         Received arguments: {"owner_name":"ann","pet":"{\"species\":\"dog\"}"}
//       — again a spin. The fix parses those strings at the boundary before
//       validation.
//
// OBSERVABLES (AGENTS.md §"Assert on real observables, not on `prompt()`
// resolving"). A fail-closed theta drive RESOLVES, so resolution witnesses
// nothing. Each cell scores three deterministic channels:
//   • `turn.userTexts` — the second query's rendered template, computed by
//     theta CODE from the BOUND value. Its sentinel can only appear if the
//     typed query validated and bound a payload, so it is the positive
//     observable.
//   • `turn.systemNotes` — every fail-closed ending of a top-level drive lands
//     here; asserted empty.
//   • `console.error` — asserted to carry no `reload-teardown-timeout`, the
//     exact signature both shapes produced pre-fix.
//
// BOUNDED, NEVER HANGING. A repair spin is precisely what these cells exist to
// catch, and a test that hangs until the runner's ceiling reports nothing
// useful. Each drive is raced against `DRIVE_DEADLINE_MS` and, on expiry, fails
// loudly naming the shape and the pre-fix signature.
//
// The harness pins BOTH subagent child inputs at module scope
// (`#subagent-child-pins`, ./harness.ts) — these fixtures are `mode: prompt`
// and reach no child launch, but the pins are inherited rather than bypassed.
// A missing live provider fails loudly through `requireLiveProvider`.

import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  failLoudly,
  plantThetaWorkspace,
  requireLiveProvider,
  type DrivenTurn,
  type LiveExtensionHandle,
} from "./harness";
import { thetaOwnedStderrLines } from "./theta-stderr-prefixes";
import { RELOAD_TEARDOWN_TIMEOUT_CODE } from "../../src/extension/session-shutdown";

/**
 * The per-drive wall bound. Generous for three live turns (typed free phase +
 * forced respond + the follow-up untyped turn) and far below the runner's
 * 180 s ceiling, so an unterminating drive is reported by THIS file's message
 * naming the shape, never as an anonymous runner timeout.
 */
const DRIVE_DEADLINE_MS = 120_000;

/** Every fail-closed ending of a top-level drive, as the note channel spells it. */
function failClosedNotes(turn: DrivenTurn, slashName: string): readonly string[] {
  const pattern = new RegExp(`^theta /${slashName} (returned Err|cancelled|aborted)`);
  return turn.systemNotes.filter((note) => pattern.test(note));
}

/**
 * Drive one registered slash command with a hard wall bound. On expiry this
 * FAILS LOUDLY naming the shape under test and the pre-fix signature, rather
 * than letting the runner's ceiling report an anonymous timeout — the whole
 * point of these cells is that the drive TERMINATES.
 */
async function driveWithin(
  handle: LiveExtensionHandle,
  slashName: string,
  shape: string,
): Promise<DrivenTurn> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `the /${slashName} drive (${shape}) did not terminate within ` +
            `${DRIVE_DEADLINE_MS}ms. That is the bug-0028 conveyance signature: the ` +
            `model cannot produce a tool call the host accepts against the presented ` +
            `respond-tool parameters, so it repair-spins until the invocation is torn ` +
            `down (theta/runtime/reload-teardown-timeout, invocation still in flight). ` +
            `Do not raise this bound — fix the wire contract`,
        ),
      );
    }, DRIVE_DEADLINE_MS);
    timer.unref?.();
  });
  try {
    return await Promise.race([driveSlashCaptureTurn(handle, `/${slashName}`), deadline]);
  } catch (thrown: unknown) { // allow-broad-catch: test-only — the deadline rejection is re-surfaced as a loud failure
    // `failLoudly` throws (and is typed `never`); the explicit throw keeps this
    // function's own return type total for the compiler.
    failLoudly(thrown instanceof Error ? thrown.message : String(thrown));
    throw thrown;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * A `mode: prompt` fixture: one typed query, then ONE untyped query whose
 * rendered text interpolates the bound value beside `sentinel`. The second
 * query's text is computed by theta code, so its appearance in `userTexts`
 * proves the typed query bound a validated payload.
 */
function wireShapeTheta(input: {
  readonly decls: readonly string[];
  readonly annotation: string;
  readonly ask: string;
  readonly sentinel: string;
  readonly echo: string;
}): string {
  return [
    "---",
    "mode: prompt",
    "respond_repair:",
    // One repair attempt: enough for a stochastic near-miss, nowhere near
    // enough to hide a systematic conveyance failure behind retries.
    "  attempts: 1",
    "---",
    ...input.decls,
    `let bound = @<${input.annotation}>\`${input.ask}\`?`,
    "@`Reply with exactly this text and nothing else: " +
      input.sentinel +
      " <<${" +
      input.echo +
      "}>>`",
    "",
  ].join("\n");
}

/**
 * The `console.error` gate. `vi.spyOn` records AND writes through, so real
 * diagnostics stay visible. Two assertions per cell: theta-owned stderr lines
 * are empty (this suite's standing observable, bug 0030), and no line carries
 * the `reload-teardown-timeout` code — the JSON diagnostic line both wire
 * shapes emitted pre-fix, which no prefix class covers.
 */
let consoleErrorSpy: MockInstance | undefined;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error");
});

afterEach(() => {
  const spy = consoleErrorSpy;
  try {
    const lines = (spy?.mock.calls ?? []).map((args) => args.map(String).join(" "));
    expect(
      thetaOwnedStderrLines(lines),
      "this suite's stderr observable is a 0-byte theta-owned capture; the spy " +
        "caught theta-owned line(s) instead: " +
        JSON.stringify(thetaOwnedStderrLines(lines)),
    ).toEqual([]);
    expect(
      lines.filter((line) => line.includes(RELOAD_TEARDOWN_TIMEOUT_CODE)),
      `${RELOAD_TEARDOWN_TIMEOUT_CODE} means the drive was still in flight when the ` +
        `session tore down — the bug-0028 repair-spin signature. Captured: ` +
        JSON.stringify(lines),
    ).toEqual([]);
  } finally {
    spy?.mockRestore();
    consoleErrorSpy = undefined;
  }
});

describe("bug 0028 (live) — a declared `enum` at the annotation root is conveyable and the drive terminates", () => {
  it("drives `@<Severity>` end to end against a live model: the non-object root binds a validated wire value", async () => {
    const provider = await requireLiveProvider();
    const sentinel = "THETA-ENUM-ROOT";
    const workspace = plantThetaWorkspace([
      {
        source: "project",
        stem: "enumroot",
        text: wireShapeTheta({
          decls: ['enum Severity { Low = "low", High = "high" }'],
          annotation: "Severity",
          ask:
            "A production database was permanently deleted with no backup and the " +
            "service is fully down. Classify the severity of that incident.",
          sentinel,
          echo: "bound",
        }),
      },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition before any tokens are spent.
      expect(
        handle.command("enumroot"),
        "no command to invoke — discovery or registration regressed for the " +
          "planted theta. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const turn = await driveWithin(handle, "enumroot", "a declared enum at the annotation root");

      expect(
        failClosedNotes(turn, "enumroot"),
        "the drive must reach a success terminal; a fail-closed note means the " +
          "typed query ended in Err/cancelled/aborted instead of binding the " +
          "validated enum value: " + JSON.stringify(turn.systemNotes),
      ).toEqual([]);
      // The positive observable: theta CODE rendered this text from the BOUND
      // value, so its presence proves the enum root was conveyed, satisfied,
      // unwrapped and validated. Only the two declared WIRE values may appear —
      // the lowered `enum` is the validator, so anything else could not bind.
      const echoed = turn.userTexts.filter((text) => text.includes(sentinel));
      expect(
        echoed.length,
        `exactly one rendered follow-up query must carry the sentinel; observed ` +
          `userTexts=${JSON.stringify(turn.userTexts)}`,
      ).toBe(1);
      expect(
        echoed[0],
        `the bound value must be one of the declared enum's WIRE values ` +
          `("low"/"high", schema-subset.md:80) interpolated by QRY-18; observed ` +
          `${JSON.stringify(echoed[0])}`,
      ).toMatch(new RegExp(`${sentinel} <<(low|high)>>`));
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

describe("bug 0028 (live) — a nested named-schema `$ref` is conveyable and the drive terminates", () => {
  it("drives `@<Owner>` with a FORWARD-declared nested schema end to end: the nested object binds however the model encodes it", async () => {
    const provider = await requireLiveProvider();
    const sentinel = "THETA-NESTED-REF";
    // `Pet` is declared AFTER `Owner`: pre-0028 that field lowered to the
    // accept-anything `{}`; the two-pass lowering mints `{"$ref":"#/$defs/Pet"}`
    // whatever the declaration order, which is exactly what widened the
    // JSON-string conveyance defect to every declaration order.
    const workspace = plantThetaWorkspace([
      {
        source: "project",
        stem: "nestedref",
        text: wireShapeTheta({
          decls: [
            "schema Owner { owner_name: string, pet: Pet }",
            "schema Pet { species: string, name: string }",
          ],
          annotation: "Owner",
          ask:
            "Invent one pet owner: their name, and their pet's species and name. " +
            'The pet\'s name must be exactly "Rex" and its species exactly "dog".',
          sentinel,
          echo: "bound.pet.species",
        }),
      },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("nestedref"),
        "no command to invoke — discovery or registration regressed for the " +
          "planted theta. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const turn = await driveWithin(
        handle,
        "nestedref",
        "a forward-declared nested named-schema $ref",
      );

      expect(
        failClosedNotes(turn, "nestedref"),
        "the drive must reach a success terminal; a fail-closed note means the " +
          "nested-`$ref` payload never validated: " + JSON.stringify(turn.systemNotes),
      ).toEqual([]);
      const echoed = turn.userTexts.filter((text) => text.includes(sentinel));
      expect(
        echoed.length,
        `exactly one rendered follow-up query must carry the sentinel; observed ` +
          `userTexts=${JSON.stringify(turn.userTexts)}`,
      ).toBe(1);
      // The interpolation reaches THROUGH the `$ref`-validated nested object
      // (`bound.pet.species`), so a JSON-string payload that was merely
      // tolerated rather than parsed could not render it.
      expect(
        echoed[0],
        `the nested object must have bound as a real object — the pinned species ` +
          `is reached by member access through the \`$ref\` field; observed ` +
          `${JSON.stringify(echoed[0])}`,
      ).toMatch(new RegExp(`${sentinel} <<dog>>`));
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// canonical-slug cell — bug 0099 (Route A). The lowered fragment for `@<"low" | "high">` is
// `{"type":"string","enum":["low","high"]}`; schema-subset.md:99–:105's
// canonical form sorts its keys `enum` (U+0065) before `type` (U+0074):
// `{"enum":["low","high"],"type":"string"}`. The registered respond-tool name
// is `__theta_respond_<slug>` of THAT canonical form, not of the emitted
// serialisation — the two differ (bug 0099 §Reproduction: canonical
// `1aae0990d53b3485` vs stringify `16d4106209c9ee70` for this exact fragment).
//
// THE ORACLE IS INDEPENDENT. The expected slug below is a `node:crypto`
// SHA-256 over a HAND-WRITTEN canonical byte string, not a call to
// `respondSchemaSlug`/`schemaSlug`/`canonicalForm` — a cell that derived its
// expectation from the function under test would be a tautology.
//
// THE OBSERVABLE IS THE WIRE, END TO END: the QRY-12/QRY-15 templates instruct
// the model to call `__theta_respond_<slug>`, so this cell asserts (a) that
// name is what got REGISTERED (via the real `tool_execution_start` event
// carrying the tool the model actually invoked) and (b) the drive reached a
// success terminal with the bound wire value echoed back — never on `prompt()`
// merely resolving.
//
// SUBAGENT CHILD PINS: this fixture is `mode: prompt` with no `tools:`/subagent
// dispatch, so the drive never reaches the RFC-0006 child-process launch. The
// harness's module-scope pins (`#subagent-child-pins`, ./harness.ts) are
// inherited, not exercised, by this cell.

/** SHA-256 of the canonical-form bytes, first 16 lowercase hex (schema-subset.md:106–:107). */
function independentCanonicalSlug(canonicalBytes: string): string {
  return createHash("sha256").update(canonicalBytes, "utf8").digest("hex").slice(0, 16);
}

/**
 * Drive a slash invocation while ALSO capturing the real `tool_execution_start`
 * events the live session fires — the tool name(s) the model actually invoked,
 * independent of `turn.userTexts`/`systemNotes`. Subscribes for the same
 * window `driveSlashCaptureTurn` drives and unsubscribes before returning.
 */
async function driveCapturingToolCalls(
  handle: LiveExtensionHandle,
  slashInvocation: string,
): Promise<{ turn: DrivenTurn; toolNames: readonly string[] }> {
  const toolNames: string[] = [];
  const unsubscribe = handle.session.subscribe((event) => {
    if (event.type === "tool_execution_start") {
      toolNames.push(event.toolName);
    }
  });
  try {
    const turn = await driveSlashCaptureTurn(handle, slashInvocation);
    return { turn, toolNames };
  } finally {
    unsubscribe();
  }
}

describe("bug 0099 (live) — canonical-slug cell: the respond tool binds under the CANONICAL-form slug end to end", () => {
  it("canonical-slug cell drives @<\"low\" | \"high\"> end to end: the model calls __theta_respond_<canonical slug>, not the stringify slug", async () => {
    // The hand-written canonical form of `{"type":"string","enum":["low","high"]}`
    // — keys sorted by Unicode code point, no insignificant whitespace
    // (schema-subset.md:99–:105). Written here, not computed by any shipped
    // function, so this cell's expectation cannot move with a regression in the
    // recipe it is checking.
    const CANONICAL_BYTES = '{"enum":["low","high"],"type":"string"}';
    const expectedSlug = independentCanonicalSlug(CANONICAL_BYTES);
    const expectedToolName = `__theta_respond_${expectedSlug}`;

    const provider = await requireLiveProvider();
    const sentinel = "THETA-canonical-slug cell-CANON";
    const workspace = plantThetaWorkspace([
      {
        source: "project",
        stem: "celld",
        text: wireShapeTheta({
          decls: [],
          annotation: '"low" | "high"',
          ask:
            "A production database was permanently deleted with no backup and the " +
            "service is fully down. Classify the severity as either low or high.",
          sentinel,
          echo: "bound",
        }),
      },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("celld"),
        "no command to invoke — discovery or registration regressed for the " +
          "planted theta. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              `the /celld drive (canonical-slug cell, canonical respond-tool slug) did not terminate ` +
                `within ${DRIVE_DEADLINE_MS}ms — the bug-0028 conveyance-hang signature, ` +
                `unrelated to bug 0099's slug recipe. Do not raise this bound`,
            ),
          );
        }, DRIVE_DEADLINE_MS);
        timer.unref?.();
      });
      let driven: { turn: DrivenTurn; toolNames: readonly string[] };
      // The deadline rejection propagates: vitest reports it as a loud failure
      // carrying the `Error` above, which already names the bound and the
      // bug-0028 hang signature.
      try {
        driven = await Promise.race([driveCapturingToolCalls(handle, "/celld"), deadline]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
      const { turn, toolNames } = driven;

      expect(
        failClosedNotes(turn, "celld"),
        "the drive must reach a success terminal; a fail-closed note means the " +
          "typed query never bound a validated literal-union value: " +
          JSON.stringify(turn.systemNotes),
      ).toEqual([]);

      // THE WIRE OBSERVABLE: the model was FORCED to call the registered
      // respond tool, and that tool's real, invoked name must be the
      // CANONICAL-form slug — not `__theta_respond_16d4106209c9ee70`, the
      // stringify-recipe slug bug 0099 names for this exact fragment.
      expect(
        toolNames,
        `canonical-slug cell: the model must invoke the respond tool under its CANONICAL-form ` +
          `name (schema-subset.md:99–:107 over ${CANONICAL_BYTES}); observed real ` +
          `tool_execution_start names ${JSON.stringify(toolNames)}`,
      ).toContain(expectedToolName);

      // The positive binding observable: theta CODE rendered this text from
      // the value the respond tool call above delivered, so its presence (and
      // its wire value) proves the canonical-slug-named tool's argument
      // actually validated and bound.
      const echoed = turn.userTexts.filter((text) => text.includes(sentinel));
      expect(
        echoed.length,
        `exactly one rendered follow-up query must carry the sentinel; observed ` +
          `userTexts=${JSON.stringify(turn.userTexts)}`,
      ).toBe(1);
      expect(
        echoed[0],
        `the bound value must be one of the literal union's two wire values ` +
          `("low"/"high"); observed ${JSON.stringify(echoed[0])}`,
      ).toMatch(new RegExp(`${sentinel} <<(low|high)>>`));
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
