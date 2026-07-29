// H8a-T — live production end-to-end acceptance (tests).
//
// An OPT-IN live-host acceptance suite, excluded from the default `npm test`
// and invoked by the dedicated `npm run test:live` runner (see
// `config/vitest/vitest.live.config.ts`). It loads the SHIPPED extension through its real
// `extensions/index.ts` entry (not the `H4a` in-memory fixture-supply),
// discovers a real `.theta` from a real on-disk discovery source, and drives it
// against a LIVE provider/model. It closes no new spec REQ-ID; it verifies the
// live composition the double-backed gates (`H4a`, `H7a`, `V18d`) never
// exercise and the manual real-host smoke covers only by hand.
//
// INTENDED-REASON RED (current state): the shipped production composition root
// (`src/extension/factory.ts` default export) supplies `fixtures: []` and runs
// no discovery walk, so no `.theta`-derived slash command is ever registered by
// the shipped extension. Each test below therefore reds on the MISSING COMMAND
// (or the absent turn that follows), not on a credential, network, setup, or
// harness throw — the discovery→registration precondition is asserted BEFORE any
// live model turn is driven, so the red state spends no tokens. The paired `H8a`
// implementation wires the production composition root and turns these green.
//
// Convention: conventions.md (phase categories — end-to-end harness; the
// live-host acceptance pair exception). Narrative spec references:
// extension-bootstrap-and-per-theta.md, registration-steps.md, discovery.md.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureText,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";
import {
  AjvSchemaValidator,
  type LoweredSchema,
} from "../../src/seams/schema-validator";

/** A minimal prompt-mode `.theta` whose single untyped query names a deterministic sentinel. */
function promptTheta(sentinel: string): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "@`Reply with exactly the token " + sentinel + " and nothing else.`",
    "",
  ].join("\n");
}

/**
 * A schema-typed `@`-query theta that echoes its validated value behind a
 * committed sentinel. Bug 0010: the typed forced respond turn is dispatched
 * off-session (pi-ai `complete()` with forced toolChoice) and never streams
 * into the transcript, so the pre-0010 whole-stream `JSON.parse` observation
 * channel is dead — the streamed deltas now carry only free-phase text. The
 * fixture therefore surfaces the AJV-validated value itself: the final untyped
 * query interpolates `answer` (QRY-18 compact JSON) behind the sentinel, and
 * the capture extracts the JSON after the sentinel. The sentinel can only
 * render if the typed binding resolved Ok (past AJV and past `?`).
 */
export const LIVE_TYPED_SENTINEL = "LIVE TYPED RESULT";

function typedQueryTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "let answer: { ok: boolean, label: string } = @`Return an object describing whether the sky is blue.`?",
    "@`Reply with exactly this text and nothing else, no markdown, no code fences: " +
      LIVE_TYPED_SENTINEL +
      " ${answer}`?",
    "",
  ].join("\n");
}

/**
 * Extract the first balanced JSON object after the sentinel in a streamed
 * transcript (bug 0010: free-phase turns stream arbitrary text — possibly
 * containing brace pairs — so only the sentinel-anchored echo is trusted).
 */
function jsonAfterSentinel(transcript: string): unknown {
  const at = transcript.lastIndexOf(LIVE_TYPED_SENTINEL);
  if (at < 0) {
    throw new Error(
      `live typed capture: sentinel "${LIVE_TYPED_SENTINEL}" absent from the ` +
        `streamed transcript — the echo turn did not run (typed binding failed?). ` +
        `transcript: ${transcript}`,
    );
  }
  const rest = transcript.slice(at + LIVE_TYPED_SENTINEL.length);
  const start = rest.indexOf("{");
  if (start < 0) {
    throw new Error(
      `live typed capture: no JSON object after the sentinel. transcript: ${transcript}`,
    );
  }
  let depth = 0;
  for (let i = start; i < rest.length; i += 1) {
    const ch = rest[i];
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(rest.slice(start, i + 1));
      }
    }
  }
  throw new Error(
    `live typed capture: unbalanced JSON after the sentinel. transcript: ${transcript}`,
  );
}

/**
 * A typed-query theta that interpolates a GENUINE enum value into its query
 * text (bug 0020 control). `Severity.High` is built by the real `Enum.Variant`
 * access path (`makeEnumValue` — the non-enumerable `__thetaEnum` brand), and
 * the QRY-18 enum rule renders the interpolation as the BARE wire string
 * (`high`) — never `[object Object]` (the enum arm's `String(value)` over a
 * mis-routed plain object) and never the JSON-quoted boxed form (`"high"`,
 * the object arm's `JSON.stringify` over an unclassified boxed String). The
 * angle markers anchor the assertion inside the rendered outbound text.
 */
function enumInterpolationTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    'enum Severity { High = "high", Low = "low" }',
    "let sev = Severity.High",
    "let echo: { level: string } = @`The severity token between angle markers is <<${sev}>>. " +
      "Return an object whose level field is exactly that token.`?",
    "echo",
  ].join("\n");
}

/**
 * The forged-ingress pair (bug 0020, wire seam): a `mode: subagent` CHILD
 * whose tail is a ctor-minted object carrying `__thetaEnum` as an ordinary
 * (enumerable) declared field, and a prompt-mode PARENT whose TYPED
 * `invoke<Forged>("./forgedchild.theta")` binds the child's PIC-59 JSON
 * envelope through the real return-validation gate — the closed declared
 * schema `Forged` legitimately DECLARES `__thetaEnum: string` as an ordinary
 * field (the parser admits the name; the offline e2e group (e) pins the same
 * in-language), so AJV admits the payload and the parent binds a plain object
 * carrying the enumerable forged tag. The payload is CODE-COMPUTED end to end
 * — the child body drives no model turn and the envelope is
 * `JSON.stringify`/`JSON.parse` of the tail — deterministic bytes (the
 * child-side genuine non-enumerable `__thetaSchema` brand never serialises).
 * The parent's untyped query interpolates it between `FORGED=`/`|END`
 * markers: post-0020 the QRY-18 OBJECT rule renders the compact JSON;
 * pre-0020 the forged tag routed it to the enum arm and the rendered text
 * collapsed to `[object Object]`.
 *
 * Two alternative compositions cannot witness this seam:
 *   • permissive-annotation typed QUERY — the lowered `{}` respond schema
 *     advertises no required fields, so the model frequently (and
 *     schema-compliantly) calls respond with empty arguments; the payload
 *     shape is stochastic. Both of that composition's seams are witnessed
 *     deterministically offline (tests/enum-schema-tag-privacy.test.ts:
 *     group (f) pins the permissive QRY-22 admission, groups (a)/(c)/(d)/(e)
 *     the classifier/render behaviour).
 *   • UNTYPED invoke — `invoke(...)` without a type argument returns
 *     `Result<null, …>` BY DESIGN (invocation.md §Typed return: "the runtime
 *     discards the child's return value entirely"; the INVCEIL-3 finding),
 *     so no payload can cross that form.
 */
function forgedIngressParentTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "schema Forged { __thetaEnum: string, x: integer }",
    'let v = invoke<Forged>("./forgedchild.theta")?',
    "@`FORGED=${v}|END reply with exactly: OK`",
  ].join("\n");
}

/** The subagent child minting the forged payload in code (no model turn). */
function forgedIngressChildTheta(): string {
  return [
    "---",
    "mode: subagent",
    "---",
    "schema Forged { __thetaEnum: string, x: integer }",
    'Forged { __thetaEnum: "Severity", x: 1 }',
  ].join("\n");
}

/** A subagent-mode `.theta` whose one untyped query drives a private spawned session to completion. */
function subagentTheta(): string {
  return [
    "---",
    "mode: subagent",
    "---",
    "@`Reply with a short one-line greeting.`",
    "",
  ].join("\n");
}

/** The JSON-Schema the typed reply must structurally validate against (declared-schema lowering). */
const TYPED_REPLY_SCHEMA: LoweredSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    label: { type: "string" },
  },
  required: ["ok", "label"],
  additionalProperties: false,
};

// ===========================================================================
// Tests bullet 1 — discovery → registration (Convention: live-host acceptance).
// A `.theta` written under the project discovery source `<cwd>/.pi/theta/`
// registers a live slash command named for its filename stem, exercising the
// real V10a walk over the real V8b PiFileSystem and the V9b `session_start` →
// `pi.registerCommand` step. Reds today: the shipped default export registers
// no discovered command.
// ===========================================================================

describe("H8a-T — discovery → registration (Convention: live-host acceptance)", () => {
  it("registers a live slash command for a project-source .theta via the real discovery walk", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      { source: "project", stem: "greetlive", text: promptTheta("THETA-LIVE-OK") },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // The shipped extension, loaded through its real entry, discovered the
      // on-disk `.theta` and registered a slash command named for its stem.
      expect(
        handle.command("greetlive"),
        "no .theta-derived slash command registered — the shipped production " +
          "composition root supplies no discovered fixtures (fixtures: []) and " +
          "runs no discovery walk. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Tests bullet 2 — prompt-mode turn against a live model (Convention:
// live-host acceptance). Invoking the registered command drives exactly one
// real prompt-mode turn against a live provider/model and the assistant
// response contains the fixture's deterministic sentinel — M's prompt-mode
// drive against a real model. Reds today: no command exists to invoke.
// ===========================================================================

describe("H8a-T — prompt-mode turn against a live model (Convention: live-host acceptance)", () => {
  it("drives one live prompt-mode turn whose assistant response contains the deterministic sentinel", async () => {
    const provider = await requireLiveProvider();
    const sentinel = "THETA-LIVE-OK";
    const workspace = plantThetaWorkspace([
      { source: "project", stem: "sentinel", text: promptTheta(sentinel) },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition (the intended-reason red): the command must exist before a
      // live turn is driven, so the red spends no tokens.
      expect(
        handle.command("sentinel"),
        "no command to invoke — shipped composition root registers no discovered theta. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Post-H8a: one real prompt-mode turn against the live model; the
      // streamed assistant response carries the sentinel.
      const response = await driveSlashCaptureText(handle.session, "/sentinel");
      expect(response).toContain(sentinel);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Tests bullet 3 — alternate discovery source (Convention: live-host
// acceptance). A `.theta` discovered via a second real source — the `--theta
// <dir>` CLI source (V10a/V10c over PiFileSystem) — also registers a live slash
// command, proving discovery is source-general, not wired to a single
// hardcoded path. Reds today: no discovered command from any source.
// ===========================================================================

describe("H8a-T — alternate discovery source (Convention: live-host acceptance)", () => {
  it("registers a live slash command for a --theta CLI-source .theta (discovery is source-general)", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      { source: "cli", stem: "clisource", text: promptTheta("THETA-CLI-OK") },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("clisource"),
        "no .theta-derived command from the --theta CLI source — the shipped " +
          "composition root walks no discovery source. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Tests bullet 4 — typed-query lowering, bounded (Convention: live-host
// acceptance). A single small schema-typed `@`-query resolves through the real
// binder-model resolver (V11a) and a live structured-output model and yields a
// value that validates against its declared schema (V5d schema
// lowering/validation — structural validity, not exact content). Reds today:
// no command exists to invoke.
// ===========================================================================

describe("H8a-T — typed-query lowering, bounded (Convention: live-host acceptance)", () => {
  it("resolves one schema-typed @-query through the live binder and validates the reply against its declared schema", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      { source: "project", stem: "typed", text: typedQueryTheta() },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition (the intended-reason red): the typed-query command must
      // exist before the live structured-output turn is driven.
      expect(
        handle.command("typed"),
        "no typed-query command to invoke — shipped composition root registers " +
          "no discovered theta. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Post-H8a: drive the typed query against a live structured-output model;
      // the binder-resolved reply must be STRUCTURALLY valid against the
      // declared, lowered schema (V5d) — not an exact-content match.
      const reply = await driveSlashCaptureText(handle.session, "/typed");
      // Bug 0010: the validated value arrives via the fixture's sentinel echo,
      // not as a streamed raw-JSON respond turn (that channel no longer exists).
      const value: unknown = jsonAfterSentinel(reply);
      const validator = new AjvSchemaValidator({
        emit: () => undefined,
        slugOf: (schema) => {
          const canonicalBytes = JSON.stringify(schema);
          return { slug: canonicalBytes, canonicalBytes };
        },
      });
      const outcome = validator.compile(TYPED_REPLY_SCHEMA).validate(value);
      expect(
        outcome.ok,
        outcome.ok ? "" : "typed reply failed schema validation: " + JSON.stringify(outcome.errors),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Tests bullet 5 — subagent-mode drive to a success terminal (Convention:
// live-host acceptance). A `mode: subagent` theta spawns an isolated
// AgentSession, drives one real turn to completion, and reaches a success
// terminal outcome — the path the H8a production driver previously made
// unreachable by self-cancelling every subagent query. The fixed driver wires
// V9i's `awaitTerminalAgentEnd` + `extractSubagentQueryResult`, so the
// invocation resolves cleanly rather than forcing `Err(cancelled)`.
// ===========================================================================

describe("H8a-T — subagent-mode drive against a live model (Convention: live-host acceptance)", () => {
  it("drives a subagent-mode theta's spawned session to a success terminal without a forced cancel", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      { source: "project", stem: "subrun", text: subagentTheta() },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("subrun"),
        "no subagent-mode command to invoke — shipped composition root registers " +
          "no discovered theta. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The subagent driver spawns a REAL child `pi` process (RFC-0006),
      // awaits its `theta_result` envelope, and tears the child down; the
      // invocation resolves cleanly. The spawned transcript is private, so no
      // user-session assistant text streams — and `prompt()` resolves even on a
      // fail-closed drive (failures surface as notes, not throws), so
      // resolution alone witnesses nothing. The deterministic observable is
      // the `theta-system-note` channel: EVERY fail-closed ending of a
      // top-level drive lands there — the SLSH-3 err note (`theta /subrun
      // returned Err: …`), the cancelled note (`theta /subrun cancelled`), or
      // a panic framing (`theta /subrun aborted…`) — while a successful drive
      // appends none of them. Asserting their absence reds this test when the
      // child path is broken — e.g. the harness mis-resolves the child
      // executable or the child binds a stale ambient extension build (the
      // #subagent-child-pins hazards in ./harness.ts).
      const turn = await driveSlashCaptureTurn(handle, "/subrun");
      const failureNotes = turn.systemNotes.filter((n) =>
        /^theta \/subrun (returned Err|cancelled|aborted)/.test(n),
      );
      expect(
        failureNotes,
        "the subagent drive did not reach a success terminal — it surfaced " +
          "fail-closed system note(s): " + JSON.stringify(failureNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Tests bullet 6 — QRY-18 enum interpolation outbound render, live (bug 0020
// control). A GENUINE enum value (`Severity.High`, built by the real
// `Enum.Variant` access path) interpolated into a typed `@`-query's text
// renders as the BARE wire string in the REAL outbound user turn — proving
// the bug-0020 descriptor-privacy tightening (`enumTagOf` classifies only the
// non-enumerable constructor-installed brand) did not break genuine enum
// classification on the live drive. Deterministic channels only: the
// free-phase turn of a typed query is issued ON-session via
// `pi.sendUserMessage` (only the forced respond turn is off-session — bug
// 0010), so `turn.userTexts` carries the exact QRY-18-rendered text the theta
// CODE computed, independent of the model's reply; `turn.systemNotes` carries
// every fail-closed ending (SLSH-3).
// ===========================================================================

describe("H8a-T — QRY-18 enum interpolation outbound render, live (bug 0020 control)", () => {
  it("renders a genuine enum interpolation as the bare wire string in the real outbound typed-query text", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      { source: "project", stem: "enumlive", text: enumInterpolationTheta() },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition (the intended-reason red): the command must exist before a
      // live turn is driven, so a fixture/parse failure reds with zero tokens.
      expect(
        handle.command("enumlive"),
        "no enum-interpolation command to invoke — the .theta failed discovery/parse. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const turn = await driveSlashCaptureTurn(handle, "/enumlive");
      const outbound = turn.userTexts.join("\n");
      // QRY-18 enum rule: the genuine enum interpolation renders the BARE wire
      // string — marker-anchored so the assertion reads exactly the rendered
      // interpolation site.
      expect(
        outbound,
        "the outbound typed-query text must carry the bare wire string at the " +
          "interpolation site. Outbound user texts: " + JSON.stringify(turn.userTexts),
      ).toContain("<<high>>");
      // Neither failure shape of a broken classifier: the JSON-quoted boxed
      // form (object-arm JSON.stringify over an unclassified boxed String) …
      expect(outbound).not.toContain('<<"high">>');
      // … nor the enum-arm String(value) collapse of a mis-routed plain object.
      expect(outbound).not.toContain("[object Object]");
      // No fail-closed ending: the typed bind resolved Ok (past AJV and `?`).
      const failureNotes = turn.systemNotes.filter((n) =>
        /^theta \/enumlive (returned Err|cancelled|aborted)/.test(n),
      );
      expect(
        failureNotes,
        "the enum-interpolation drive surfaced fail-closed system note(s): " +
          JSON.stringify(failureNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Tests bullet 7 — forged `__thetaEnum` wire ingress binds as a PLAIN object,
// live (bug 0020). A REAL spawned subagent child (the PIC-59 envelope —
// "driving it needs a child spawn", never driven before this witness) returns
// a code-computed object carrying `__thetaEnum` as an ordinary enumerable
// field; the parent's `invoke<Forged>` binds it from the wire through the
// real typed return-validation gate (the closed schema DECLARES the field, so
// AJV admits it). Post-0020 the classifiers ignore the forged key (the brand
// is the non-enumerable descriptor, not the key name), so the bound value
// takes the QRY-18 OBJECT rule and interpolates as compact JSON — pre-fix the
// forged tag routed it to the enum arm and the rendered outbound text
// collapsed to `[object Object]`. Every asserted byte is code-computed (child
// tail → envelope → parse → validate → render); the model never composes the
// payload. Deterministic channels only: `turn.userTexts` (marker-anchored
// rendered segment) + `turn.systemNotes`.
// ===========================================================================

describe("H8a-T — forged __thetaEnum wire ingress binds as a plain object, live (bug 0020)", () => {
  // `retry: 1`: the payload path is fully code-computed, so the only re-rolled
  // reds are environmental — transport blips on the parent's single untyped
  // turn, and one observed transient zero-registration boot (`Registered: []`;
  // the precondition reds with zero tokens — with the production
  // `emitDiagnostic` seam unwired, open bug 0023, any bootstrap failure is
  // silent, so no diagnostic names the cause). A classifier regression reds
  // every attempt: the rendered segment is `[object Object]`, deterministically.
  it("a typed invoke binds a spawned child's forged-tag envelope as a plain object and interpolates it as compact JSON", { retry: 1 }, async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      { source: "project", stem: "forgedwire", text: forgedIngressParentTheta() },
      { source: "project", stem: "forgedchild", text: forgedIngressChildTheta() },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition (the intended-reason red): both thetas parse and the
      // parent registers before any child spawn or live turn — a red here
      // spends no tokens.
      expect(
        handle.command("forgedwire"),
        "no forged-ingress parent command to invoke — the .theta failed " +
          "discovery/parse. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const turn = await driveSlashCaptureTurn(handle, "/forgedwire");
      const outbound = turn.userTexts.join("\n");
      // Marker-anchored extraction of the rendered `${v}` segment — the exact
      // text theta code computed from the envelope-bound payload (fails loudly
      // when the query never rendered, e.g. the invoke Err'd).
      const anchored = /FORGED=([\s\S]*?)\|END/.exec(outbound);
      expect(
        anchored,
        "the parent query's rendered text (FORGED=…|END) is absent — the " +
          "invoke did not resolve Ok. Outbound user texts: " +
          JSON.stringify(turn.userTexts) + "; system notes: " +
          JSON.stringify(turn.systemNotes),
      ).not.toBeNull();
      const rendered = anchored![1]!;
      // The QRY-18 OBJECT rule fired on the wire-forged payload: the exact
      // compact JSON, the forged tag riding along as ordinary data — never the
      // pre-0020 enum-arm `[object Object]` collapse. Byte-exact: the child
      // tail's field order survives stringify → envelope → parse → re-stringify,
      // and the genuine child-side `__thetaSchema` brand (non-enumerable) never
      // serialises.
      expect(
        rendered,
        "the envelope-bound payload must interpolate as its exact compact JSON; " +
          "rendered segment: " + JSON.stringify(rendered),
      ).toBe('{"__thetaEnum":"Severity","x":1}');
      // No fail-closed ending of the drive (invoke infra errors, child refusals,
      // and Err tails all land here — absence is the success observable).
      const failureNotes = turn.systemNotes.filter((n) =>
        /^theta \/forgedwire (returned Err|cancelled|aborted)/.test(n),
      );
      expect(
        failureNotes,
        "the forged-ingress drive surfaced fail-closed system note(s): " +
          JSON.stringify(failureNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
