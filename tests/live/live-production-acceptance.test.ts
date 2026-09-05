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
// The shipped production composition root (`factory.ts`'s default export)
// supplies `fixtures: []` and a `composeInstance` callback that invokes
// `composeExtensionInstance` (`production-composition.ts`); that pass runs the
// five-source discovery walk and installs a `rediscover` closure, so a
// discovered `.theta` registers a live slash command. All seven tests below
// are green; the suite needs a live host, and the five that drive a turn spend
// real tokens (the two discovery→registration tests boot and register only,
// spending none). A correct-reason red is tracked through `docs/bugs/` per
// AGENTS.md §"Expect documented correct-reason reds", not through an in-file
// banner.
//
// Bug 0030 wraps every test below in a file-scope `console.error` spy
// (`beforeEach`/`afterEach`): the filtered capture (`thetaOwnedStderrLines`,
// `./theta-stderr-prefixes`) must be empty, the coded form of the "0-byte
// stderr capture" the bug-0018 fix record cites as this suite's live
// verification.
//
// Convention: conventions.md (phase categories — end-to-end harness; the
// live-host acceptance pair exception). Narrative spec references:
// extension-bootstrap-and-per-theta.md, registration-steps.md, discovery.md.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureText,
  driveSlashCaptureTurn,
  failLoudly,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";
import {
  AjvSchemaValidator,
  type LoweredSchema,
} from "../../src/seams/schema-validator";
import { thetaOwnedStderrLines } from "./theta-stderr-prefixes";
// The offline attribution guard of cell 89: the shipped whole-file parse entry
// wrapped in inert deps, so an unrelated load failure cannot be mistaken for
// the disposition that cell's live observables read.
import { parseDoc } from "../helpers/e2e-s1";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../../tools/code-registry/index.js";
import { INTERPOLATED_RESULT_CODE } from "../../src/render/query-render";

// Drive discriminators are ANSWERS to task questions over the theta's own
// computed text -- deterministic content a degraded plain-prompt run cannot
// produce. A verbatim-echo demand ("reply with exactly this") reads as prompt
// injection to current models and draws refusals: the sentinel-refusal class
// filed as bug 0243.
//
/**
 * A minimal prompt-mode `.theta` whose single untyped query names a
 * deterministic sentinel as documentary data and asks a fixed-pair arithmetic
 * question. `sentinel` keeps its documentary role for the 54 registration-only
 * callers below (never driven, so the model never sees the string); the ONE
 * driven caller (the H8a-T prompt-mode-turn `it`, below) proves the turn ran
 * via the answer, not an echo.
 */
function promptTheta(
  sentinel: string,
  addends: readonly [number, number] = [263, 514],
): string {
  const [a, b] = addends;
  return [
    "---",
    "mode: prompt",
    "---",
    "@`A registration probe is labelled " +
      sentinel +
      ". What is " +
      a +
      " plus " +
      b +
      "? Answer with the number only.`",
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
    // Channel-preserving reframing (bug 0243): the model's reply still carries
    // the sentinel-anchored JSON `jsonAfterSentinel` parses, but as a reporting
    // task over theta-supplied data rather than a verbatim-echo demand -- the
    // demand this class of sentinel-refusal reads as prompt injection.
    "@`Write a one-line status report: the label " +
      LIVE_TYPED_SENTINEL +
      " followed by this JSON object as given -- ${answer} -- and no commentary.`?",
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
    "@`FORGED=${v}|END What is 372 plus 215? Answer with the number only.`",
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

/**
 * Bug 0030: a file-scope `console.error` spy gates every test below, the same
 * install/inspect/restore shape as `double-session-start-live.test.ts`.
 * `vi.spyOn` records calls AND writes through, so real diagnostics stay
 * visible; restoring in a `finally` keeps a failed assertion from poisoning
 * every later test in the file with a spy `mockRestore` never ran. Declared
 * at file scope (outside every `describe` below) so the hooks wrap all seven
 * tests without repeating the install/inspect/restore shape in each one.
 */
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

// ===========================================================================
// Tests bullet 1 — discovery → registration (Convention: live-host acceptance).
// A `.theta` written under the project discovery source `<cwd>/.pi/theta/`
// registers a live slash command named for its filename stem, exercising the
// real V10a walk over the real V8b PiFileSystem and the V9b `session_start` →
// `pi.registerCommand` step end to end through the shipped default export.
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
          "composition root's discovery walk or its session_start registration " +
          "regressed for the planted theta. Registered: " +
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
// drive against a real model.
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
      // Precondition: the command must exist before a live turn is driven, so a
      // discovery/registration failure reds with zero tokens.
      expect(
        handle.command("sentinel"),
        "no command to invoke — discovery or registration regressed for the " +
          "planted theta. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Post-H8a: one real prompt-mode turn against the live model; the
      // streamed assistant response carries the sentinel.
      const response = await driveSlashCaptureText(handle.session, "/sentinel");
      // 263 + 514 = 777: computable only from the theta's own arithmetic
      // question, not from the model parroting an attacker-shaped token.
      expect(response).toContain("777");
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
// hardcoded path.
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
          "composition root's CLI-source discovery regressed. Registered: " +
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
// lowering/validation — structural validity, not exact content).
// ===========================================================================

describe("H8a-T — typed-query lowering, bounded (Convention: live-host acceptance)", () => {
  it("resolves one schema-typed @-query through the live binder and validates the reply against its declared schema", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      { source: "project", stem: "typed", text: typedQueryTheta() },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the typed-query command must exist before the live
      // structured-output turn is driven, so a discovery/registration failure
      // reds with zero tokens.
      expect(
        handle.command("typed"),
        "no typed-query command to invoke — discovery or registration regressed " +
          "for the planted theta. Registered: " + JSON.stringify(handle.registeredNames()),
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
        "no subagent-mode command to invoke — discovery or registration " +
          "regressed for the planted theta. Registered: " +
          JSON.stringify(handle.registeredNames()),
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
      // Precondition: the command must exist before a live turn is driven, so a
      // fixture/parse failure reds with zero tokens.
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
      // Precondition: both thetas parse and the parent registers before any
      // child spawn or live turn — a red here spends no tokens.
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

// ===========================================================================
// Bug 0070 — a `.theta` `tools:` entry's DERIVED default callable name (the
// basename without `.theta`, hyphens rewritten to underscores) was never
// checked against the lowercase-first-identifier rule the `as` override target
// IS checked against (`src/parser/callable-set.ts` `resolveCallableSet`). A
// digit-leading callee stem (`./2fastbug0070.theta`, discovery-valid under the
// stem regex `^[a-z0-9][a-z0-9_-]*$`) therefore minted an unspellable callable
// name with zero load diagnostics at the offline production-load seam
// (`tests/production-tools-load-resolution.test.ts`,
// `tests/tools-derived-name-shape.test.ts`).
//
// No existing live test (H8a, H9a, or the hardening probes) planted a
// `.theta`-path `tools:` entry at all before this cell — every `tools:`
// occurrence across `tests/live/**` was the bare Pi-tool identifier `read`
// (`tests/live/acceptance/fixtures/acc-code-tool-loop.theta` and the
// hardening probes' `tool_loop` fixtures), which resolves through the
// Pi-tool arm the new check deliberately exempts (`resolution.callable.kind
// === "theta"` in the fix), never through the `.theta`-path arm the fix
// actually validates. The new `theta/load/invalid-derived-tool-name` arm was
// therefore unreached by the live suite before this cell.
//
// This drives the SAME registration observable the "discovery →
// registration" bullet above uses (`handle.command` / `handle.registeredNames()`,
// read after the real `session_start` → `resources_discover` →
// `composeExtensionInstance` →
// `resolveCallableSet` path settles) through the shipped extension entry
// against a live host — never through the offline stubbed-`ctx` harness the
// unit witnesses use. Registration-only: no slash command is invoked, so no
// model turn runs and the cell spends zero tokens (the same profile the file
// header claims for the two discovery→registration tests).
// ===========================================================================

describe("H8a-T — bug 0070: a .theta tools: entry's unvalidated derived name (Convention: live-host acceptance)", () => {
  it("does not register a caller whose tools: entry derives the unspellable name `2fastbug0070`, while its `as`-overridden sibling registers, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // The digit-leading callee — discovery-valid on its own merits (the stem
      // regex admits a leading digit); its stem is what a `tools:` entry turns
      // into an unspellable callable name.
      {
        source: "project",
        stem: "2fastbug0070",
        text: ["---", "mode: subagent", "---", "@`fast`", ""].join("\n"),
      },
      // The load-bearing caller: `./2fastbug0070.theta` derives the default
      // name `2fastbug0070` (digit-leading, not lowercase-first-identifier-
      // shaped) with no `as` override.
      {
        source: "project",
        stem: "digitdefaultbug0070",
        text: [
          "---",
          "mode: subagent",
          "tools:",
          "  - ./2fastbug0070.theta",
          "---",
          "@`hi`",
          "",
        ].join("\n"),
      },
      // The `as` escape hatch the rejection message points the author at.
      {
        source: "project",
        stem: "digitrenamedbug0070",
        text: [
          "---",
          "mode: subagent",
          "tools:",
          "  - ./2fastbug0070.theta as fastbug0070",
          "---",
          "@`hi`",
          "",
        ].join("\n"),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the callee and the `as`-overridden caller must both
      // register before the rejected caller's absence can be attributed to the
      // derived-name rule instead of a broken workspace.
      expect(
        handle.command("2fastbug0070"),
        "the digit-leading callee did not register — precondition unmet. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("digitrenamedbug0070"),
        "the `as`-overridden caller did not register — precondition unmet. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root
      // (not the offline stubbed-`ctx` harness), the caller whose `tools:`
      // entry derives the unspellable name `2fastbug0070` does not register.
      expect(
        handle.command("digitdefaultbug0070"),
        "the caller whose `tools:` entry derives the unspellable callable name " +
          "`2fastbug0070` registered anyway through the live discovery/" +
          "session_start path — theta/load/invalid-derived-tool-name did not " +
          "fire. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("digitdefaultbug0070");
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0071 — `theta/parse/invoke-arity-too-few` / `theta/parse/invoke-arity-
// too-many` were checked for the `invoke("./x.theta", …)` call surface only;
// a `.theta`-callable call (`<name>(args)` for a `tools:` `.theta` entry) at
// wrong arity loaded with zero diagnostics (`docs/spec_topics/tool-calls.md`
// §"Argument shape": "apply equally to a `.theta` callable call"). The fix
// extends the shared invoke static-check pass's call-site walk to also resolve
// `.theta`-callable call sites against the caller's frozen callable set and
// run the SAME `checkInvokeArity` check against them
// (`src/extension/invoke-static-checks.ts`).
//
// No existing live test (H8a, H9a, or the hardening probes) plants a `.theta`-
// path `tools:` entry at all: every `tools:` occurrence across `tests/live/**`
// is the bare Pi-tool identifier `read`
// (`tests/live/acceptance/fixtures/acc-code-tool-loop.theta` and the hardening
// probes' `tool_loop` fixtures), which never reaches the `.theta`-callable-call
// arity loop at all (that loop resolves only callable-set entries of kind
// `"theta"`; a Pi-tool entry is excluded by construction —
// `resolveThetaCallableCallSites` in the fix). The fixed arm therefore had NO
// live reach before this cell, mirroring bug 0070's H8a addition above.
//
// This drives the SAME registration observable the bug 0070 cell above uses
// (`handle.command` / `handle.registeredNames()`, read after the real
// `session_start` → `resources_discover` → `composeExtensionInstance` →
// `checkInvokeStaticResolution` path settles)
// through the shipped extension entry against a live host — never through the
// offline stubbed-`ctx` harness the unit witnesses use. Registration-only: no
// slash command is invoked, so no model turn runs and the cell spends zero
// tokens (the same profile the file header claims for the two
// discovery→registration tests and the bug 0070 cell above).
// ===========================================================================

describe("H8a-T — bug 0071: a .theta-callable call at wrong arity (Convention: live-host acceptance)", () => {
  it("does not register a caller whose .theta-callable call passes too few arguments, while its correct-arity sibling registers, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // The two-required-param callee both callers below name in `tools:`. Two
      // typed `params:` fields make it non-bypass-eligible (`classifyBinderBypass`
      // admits only no-params / single-string), so it needs a resolvable
      // `bind_model:` to independently register too (the planted live workspace
      // carries no `.pi/settings.json`, so `theta.binderModel` is never set) —
      // the same provider-qualified id the committed H9a fixture
      // `tests/live/acceptance/fixtures/acc-params-binder.theta` uses. Pure name
      // resolution against the model registry at LOAD time, not a dispatched
      // turn: registering this callee spends no tokens, only DRIVING its slash
      // command would.
      {
        source: "project",
        stem: "b71livecallee",
        text: [
          "---",
          "mode: subagent",
          "bind_model: anthropic/claude-haiku-4-5",
          "params:",
          "  x: string",
          "  y: string",
          "---",
          "@`hi`",
          "",
        ].join("\n"),
      },
      // The load-bearing caller: one argument against a 2-non-defaulted-param
      // callee — `theta/parse/invoke-arity-too-few` must reject it at load time.
      {
        source: "project",
        stem: "b71livetoofew",
        text: [
          "---",
          "mode: subagent",
          "tools:",
          "  - ./b71livecallee.theta",
          "---",
          'b71livecallee("a")?',
          "@`hi`",
          "",
        ].join("\n"),
      },
      // The correct-arity sibling, same callee: the check rejects wrong arity
      // specifically, not every `.theta`-callable call at this callee.
      {
        source: "project",
        stem: "b71livectl",
        text: [
          "---",
          "mode: subagent",
          "tools:",
          "  - ./b71livecallee.theta",
          "---",
          'b71livecallee("a", "b")?',
          "@`hi`",
          "",
        ].join("\n"),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the callee and the correct-arity sibling must both
      // register before the rejected caller's absence can be attributed to the
      // arity rule instead of a broken workspace.
      expect(
        handle.command("b71livecallee"),
        "the callee did not register — precondition unmet. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b71livectl"),
        "the correct-arity `.theta`-callable caller did not register — " +
          "precondition unmet. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root
      // (not the offline stubbed-`ctx` harness), the caller whose `.theta`-
      // callable call passes one argument to a 2-required-param callee does not
      // register.
      expect(
        handle.command("b71livetoofew"),
        "the caller passing too few arguments to a `.theta`-callable call " +
          "registered anyway through the live discovery/session_start path — " +
          "theta/parse/invoke-arity-too-few did not fire. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b71livetoofew");
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0110 — a `tools:` `.theta` entry naming a callee OUTSIDE every active
// discovery root minted a callable with ZERO containment diagnostics: nothing
// on the load path applied INV-1's `realpath`-then-discovery-root-containment
// check to this surface (`parseCalleeForTools`,
// `src/extension/production-composition.ts`), even though
// `docs/spec_topics/tool-calls.md` §"Argument shape" states "a path that
// escapes the active discovery roots is rejected with
// `theta/load/invoke-path-escape` and the callable is not created" for this
// exact surface. The fix threads the active-root union into
// `parseCalleeForTools` and calls the SAME `checkInvokePathAtLoad` checker the
// `invoke(...)` surface already uses (`src/runtime/invocation.ts`), judged
// before the callee's own bytes are parsed.
//
// No existing live test (H8a, H9a, or the hardening probes) plants an
// OUT-OF-ROOT `tools:` `.theta` entry: every `tools:` occurrence across
// `tests/live/**` either is the bare Pi-tool identifier `read`
// (`tests/live/acceptance/fixtures/acc-code-tool-loop.theta`, the hardening
// probes' `tool_loop` fixtures) or, since the bug 0071 fix immediately above,
// an IN-ROOT `.theta`-path sibling (`b71livecallee.theta` — the WITHIN arm of
// this SAME shared checker, confirmed live by that cell's `b71livectl`
// control registering silently). The ESCAPE arm has no live fixture before
// this cell, mirroring the bug 0070 and bug 0071 H8a additions above.
//
// This drives the SAME registration observable those two cells use
// (`handle.command` / `handle.registeredNames()`, read after the real
// `session_start` → `resources_discover` → `composeExtensionInstance` →
// `resolveThetaToolsAtLoad` path settles)
// through the shipped extension entry against a live host, PLUS the
// `theta-system-note` channel (AGENTS.md §"Assert on real observables"): the
// shipped path's `loadSink` (`composeExtensionInstance`,
// `production-composition.ts`) routes every error-severity load-phase
// diagnostic onto that channel (`preEvalRouter.routePreEvalFailure` →
// `sendSystemNote`), so the containment diagnostic is directly observable off
// the settled `SessionManager` — the same channel the subagent-mode cell
// above already reads through `driveSlashCaptureTurn`, confirming the channel
// is live (not degraded) in this exact harness. This cell reads it directly
// off `handle.sessionManager.getEntries()` rather than through
// `driveSlashCaptureTurn`, because the diagnostic fires at LOAD time (inside
// `bootShippedExtension`'s `session.bindExtensions({})`), before any slash is
// driven — there is no prior drive to slice a "during this drive" delta
// against, so the full entry list IS the delta.
//
// The callee planted outside the discovery root is otherwise identical in
// shape to the bug 0070/0071 callees (a trivial subagent-mode theta, no
// `params:`, so no arity/type/prompt-mode/errors rule has a subject),
// isolating containment as the only rule that can explain the caller's
// non-registration — the same no-co-firing discipline
// `tests/tools-entry-containment.test.ts` cells F/G/H1/H2/J use offline.
//
// Registration-only: no slash command is invoked, so no model turn runs and
// the cell spends zero tokens (the same profile the bug 0070 and bug 0071
// H8a cells above claim). ADDITIVE ONLY: no existing cell in this file is
// weakened, reworded, reordered or deleted.
// ===========================================================================

/**
 * The `theta-system-note` channel contents from the settled in-memory
 * `SessionManager`, read directly off `getEntries()` (AGENTS.md §"Assert on
 * real observables"). Mirrors `./harness`'s unexported `collectSystemNotes`
 * (not imported: this cell reads the FULL entry list, not a per-drive slice,
 * since the diagnostic under test fires at load time, before any drive).
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
 * `theta/load/invoke-path-escape`'s registry code. DIAG-4
 * (`docs/spec_topics/diagnostics/diagnostic-shape.md:74`) makes the registry
 * *Message* column normative, so the fragment this cell asserts is READ from
 * the row below rather than transcribed — the same discipline
 * `tests/tools-entry-containment.test.ts` applies offline for the same code,
 * mirrored here for this file's `tests/live/` location.
 */
const INVOKE_PATH_ESCAPE_CODE = "theta/load/invoke-path-escape";

/** The sharded registry page carrying `theta/load/invoke-path-escape`'s row (`:33`). */
const INVOKE_PATH_ESCAPE_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-load.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * Render `theta/load/invoke-path-escape`'s code-prefixed system-note
 * fragment with `<path>` substituted by the entry spec as written (the
 * out-of-root absolute path the fixture plants). The *Message* half is
 * sourced from the registry row rather than copied, so a reworded row reds
 * this cell instead of a stale hand-transcribed string passing vacuously;
 * the code prefix mirrors `renderDiagnosticLine`'s `${code}: ${message}`
 * join (`src/diagnostics/diagnostic.ts`), which is what the theta-system-note
 * content this cell asserts against actually carries.
 */
function invokePathEscapeFragment(path: string): string {
  const template = registryMessage(
    INVOKE_PATH_ESCAPE_REGISTRY,
    INVOKE_PATH_ESCAPE_CODE,
  ) as string | undefined;
  expect(
    template,
    `${INVOKE_PATH_ESCAPE_CODE} has no registry row — the code this cell ` +
      "asserts is not registered (DIAG-2)",
  ).toBeTypeOf("string");
  const message = (template as string).replaceAll("<path>", path);
  expect(
    message,
    `${INVOKE_PATH_ESCAPE_CODE}: an unsubstituted <…> placeholder remains — ` +
      "the registry row's Message template changed shape and this cell's " +
      "substitution is stale",
  ).not.toMatch(/<[a-z]+>/);
  return `${INVOKE_PATH_ESCAPE_CODE}: ${message}`;
}

describe("H8a-T — bug 0110: an out-of-root .theta tools: entry escapes containment (Convention: live-host acceptance)", () => {
  it("does not register a caller whose tools: entry names a callee outside every active discovery root, and the theta-system-note channel carries the containment diagnostic, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();

    // The out-of-root callee: a SECOND, undiscovered temp directory — never a
    // `--theta` CLI source and never under the planted workspace's
    // `.pi/theta/` — so the active-root union (the parent directory of every
    // DISCOVERED theta) cannot contain it, mirroring
    // `tests/tools-entry-containment.test.ts`'s `outsideDir`.
    const outsideDir = mkdtempSync(join(tmpdir(), "theta-b0110-livefar-"));
    const outSpec = outsideDir.replace(/\\/g, "/");
    writeFileSync(
      join(outsideDir, "b110livefarcallee.theta"),
      ["---", "mode: subagent", "---", "@`hi`", ""].join("\n"),
      "utf8",
    );

    const thetas: PlantedTheta[] = [
      // The in-root control: an in-root `.theta` `tools:` entry, proving the
      // planted workspace and the ordinary WITHIN-root resolution path both
      // work — without this, the escaping caller's non-registration could be
      // (wrongly) attributed to a broken workspace instead of containment.
      {
        source: "project",
        stem: "b110livenearcallee",
        text: ["---", "mode: subagent", "---", "@`hi`", ""].join("\n"),
      },
      {
        source: "project",
        stem: "b110livecallnear",
        text: [
          "---",
          "mode: subagent",
          "tools:",
          "  - ./b110livenearcallee.theta",
          "---",
          "b110livenearcallee()?",
          "@`hi`",
          "",
        ].join("\n"),
      },
      // The load-bearing caller: a `tools:` entry naming the out-of-root
      // callee by absolute path.
      {
        source: "project",
        stem: "b110livecallescape",
        text: [
          "---",
          "mode: subagent",
          "tools:",
          `  - ${outSpec}/b110livefarcallee.theta`,
          "---",
          "b110livefarcallee()?",
          "@`hi`",
          "",
        ].join("\n"),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the in-root callee and its caller must both register
      // before the escaping caller's absence can be attributed to containment
      // instead of a broken workspace.
      expect(
        handle.command("b110livenearcallee"),
        "the in-root callee did not register — precondition unmet. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b110livecallnear"),
        "the in-root `tools:` caller did not register — precondition unmet. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root
      // (not the offline stubbed-`ctx` harness), a `tools:` entry naming a
      // callee outside every active discovery root does not register its
      // caller.
      expect(
        handle.command("b110livecallescape"),
        "the caller whose `tools:` entry names an out-of-root callee " +
          "registered anyway through the live discovery/session_start path — " +
          "theta/load/invoke-path-escape did not fire. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b110livecallescape");

      // The containment diagnostic itself, off the theta-system-note channel
      // (AGENTS.md §"Assert on real observables"): the shipped path's
      // `loadSink` routes every error-severity load-phase diagnostic there
      // during `session.bindExtensions({})` inside `bootShippedExtension`
      // above — before any slash is driven, so the full entry list (not a
      // per-drive slice) is read here.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      // DIAG-4: the fragment is derived from the registry row, not copied — see
      // `invokePathEscapeFragment`.
      const expectedFragment = invokePathEscapeFragment(
        `${outSpec}/b110livefarcallee.theta`,
      );
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the containment diagnostic for the " +
          "out-of-root callee. Notes: " + JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });
});

// ===========================================================================
// Bug 0111 — the bug-0110 load-time containment check reaches only the
// discovered-theta pass: `parseCalleeTheta` (a `tools:`-reached callee's
// dispatch parse) called `resolveThetaToolsAtLoad` with no active-root union,
// so a callee reached by a discovered caller's `tools:` entry had ITS OWN
// `tools:` `.theta` entries minted with no load-time containment check
// (docs/bugs/0111-nested-callee-tools-entries-no-load-time-containment.md).
// The fix (route (a), minimum honest form, `tools:`-surface scoped) makes the
// discovered-theta compose pass's `tools:` pre-parse
// (`parseCalleeForTools`) additionally judge a `tools:`-reached callee's OWN
// `tools:` entries via the new `checkNestedToolsContainment`, resolved
// against the CALLEE's directory; an escape is pushed at the CALLER's file so
// the CALLER un-registers, exactly as a depth-0 escape does.
//
// This cell is the live sibling of the bug 0110 cell immediately above,
// reusing its harness and its registry-sourced `invokePathEscapeFragment`
// helper: an IN-ROOT, UNDISCOVERED nested callee (planted directly on disk,
// never through `plantThetaWorkspace`'s conventional sources, so the
// discovery walk's non-recursion is what keeps it undiscovered) whose OWN
// `tools:` entry names a `.theta` outside every active discovery root. The
// nested callee sits under the project discovery root's `b111Nested`
// subdirectory, inside the
// active root by segment-boundary containment and never itself discovered
// (the walk collects `*.theta` per directory and does not recurse — the same
// non-recursion fact `tests/nested-tools-entry-containment.test.ts` proves
// offline). Registration-only: no slash command is invoked, so no model turn
// runs and the cell spends zero tokens, the same profile as the bug 0110 cell
// above. ADDITIVE ONLY: no existing cell in this file is weakened, reworded,
// reordered or deleted. (cell 88)
// ===========================================================================

describe("H8a-U — bug 0111: a nested tools: entry escapes containment through a tools:-reached callee's OWN tools: (Convention: live-host acceptance) (cell 88)", () => {
  it("does not register a caller whose tools: entry names an in-root, undiscovered callee whose OWN tools: entry names a .theta outside every active discovery root, and the theta-system-note channel names the NESTED entry spec, through the real discovery->registration path", async () => {
    const provider = await requireLiveProvider();

    // The out-of-root callee named by the NESTED entry: a SECOND, undiscovered
    // temp directory, mirroring the bug 0110 cell's `outsideDir`.
    const outsideDir = mkdtempSync(join(tmpdir(), "theta-b0111-livefar-"));
    const outSpec = outsideDir.replace(/\\/g, "/");
    writeFileSync(
      join(outsideDir, "b111livefarcallee.theta"),
      ["---", "mode: subagent", "---", "@`hi`", ""].join("\n"),
      "utf8",
    );

    const thetas: PlantedTheta[] = [
      // The in-root control, mirroring the bug 0110 cell's precondition pair:
      // proves the planted workspace and ordinary within-root resolution both
      // work before the escaping cell's non-registration is attributed to
      // containment.
      {
        source: "project",
        stem: "b111livenearcallee",
        text: ["---", "mode: subagent", "---", "@`hi`", ""].join("\n"),
      },
      {
        source: "project",
        stem: "b111livecallnear",
        text: [
          "---",
          "mode: subagent",
          "tools:",
          "  - ./b111livenearcallee.theta",
          "---",
          "b111livenearcallee()?",
          "@`hi`",
          "",
        ].join("\n"),
      },
      // The load-bearing caller: a `tools:` entry naming an IN-ROOT,
      // UNDISCOVERED nested callee.
      {
        source: "project",
        stem: "b111livecallmid",
        text: [
          "---",
          "mode: subagent",
          "tools:",
          "  - ./b111Nested/b111livemidcallee.theta",
          "---",
          "b111livemidcallee()?",
          "@`hi`",
          "",
        ].join("\n"),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    // The nested callee, planted directly under the project discovery root's
    // `b111Nested` subdirectory —
    // inside the active root by segment-boundary containment, never itself a
    // `plantThetaWorkspace` discovery source, so the discovery walk's
    // non-recursion (proven offline by
    // `tests/nested-tools-entry-containment.test.ts` cell 0) keeps it
    // undiscovered. ITS OWN `tools:` entry names the out-of-root callee.
    const nestedDir = join(workspace.cwd, ".pi", "theta", "b111Nested");
    mkdirSync(nestedDir, { recursive: true });
    writeFileSync(
      join(nestedDir, "b111livemidcallee.theta"),
      [
        "---",
        "mode: subagent",
        "tools:",
        `  - ${outSpec}/b111livefarcallee.theta`,
        "---",
        "b111livefarcallee()?",
        "@`hi`",
        "",
      ].join("\n"),
      "utf8",
    );

    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the in-root control caller must register before the
      // nested-escape caller's absence can be attributed to the nested
      // containment check instead of a broken workspace.
      expect(
        handle.command("b111livenearcallee"),
        "the in-root callee did not register — precondition unmet. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b111livecallnear"),
        "the in-root `tools:` caller did not register — precondition unmet. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root, a
      // caller whose `tools:` entry names an IN-ROOT nested callee whose OWN
      // `tools:` entry escapes every active discovery root does not register —
      // the nested entry's containment is now judged at the caller's load.
      expect(
        handle.command("b111livecallmid"),
        "the caller whose `tools:` entry names a nested callee with an " +
          "escaping `tools:` entry registered anyway through the live " +
          "discovery/session_start path — the nested containment check did not " +
          "fire. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b111livecallmid");

      // The containment diagnostic, off the theta-system-note channel,
      // naming the NESTED entry spec as written (not the nested callee's own
      // path) — `docs/spec_topics/diagnostics/placeholder-rendering-b.md`
      // category 5's `tools:`-entry rendering arm.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = invokePathEscapeFragment(
        `${outSpec}/b111livefarcallee.theta`,
      );
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the containment diagnostic for the " +
          "nested out-of-root entry. Notes: " + JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
      rmSync(outsideDir, { recursive: true, force: true });
      rmSync(nestedDir, { recursive: true, force: true });
    }
  });
});

// ===========================================================================
// Bug 0077 — the settings `thetaPaths` glob matcher (`globMatches`,
// src/discovery/discovery-walk.ts) matched a universe entry's basename against
// the PATTERN'S OWN basename (`basename(absPattern)`) instead of against the
// whole pattern, so `thetas/*.theta` reached every `.theta` file recursively
// under `thetas/`, contradicting the non-recursion rule
// (docs/spec_topics/discovery/discovery-sources.md, opening rule: "Discovery
// is **non-recursive** and matches only `*.theta`"; DISC-5,
// docs/spec_topics/discovery/package-and-settings.md, anchor `#disc-5`). The
// fix attempts DISC-5's three comparison strings — the entry's absolute path,
// its basename, and its settings-base-relative path — against the whole
// pattern, matching the package walker's `matchesGlob`
// (src/discovery/package-discovery.ts).
//
// No shipped live test exercised a `thetaPaths` glob before this cell:
// `plantThetaWorkspace` plants only the conventional `project` / `cli`
// discovery sources and writes no settings file. This cell writes
// `<cwd>/.pi/settings.json` itself, after `plantThetaWorkspace` returns and
// before `bootShippedExtension` — whose `session.bindExtensions({})` call
// fires `session_start`, which runs the discovery walk and reads settings
// fresh off disk (`loadSettings`, src/discovery/settings.ts). The project
// settings file's `thetaPaths` array replaces the global array wholesale
// (DISC-7) and its base dir is `<cwd>/.pi`, so the pattern below resolves
// against the planted tree with no dependence on the operator's ambient
// global settings.
//
// Registration-only: no slash command is invoked, so no model turn runs and
// the cell spends zero tokens, the same profile as the discovery→registration
// and bug 0070/0071/0110 cells above.
// ===========================================================================

describe("H8a-T — bug 0077: a settings thetaPaths glob reaches only its own directory level (Convention: live-host acceptance)", () => {
  it("registers the level-matching stem a thetaPaths glob names and does not register a nested-directory stem the non-recursion rule excludes, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([]);
    const globDir = join(workspace.cwd, ".pi", "thetas");
    const nestedDir = join(globDir, "sub");
    mkdirSync(nestedDir, { recursive: true });
    writeFileSync(join(globDir, "b77liveglobtop.theta"), subagentTheta(), "utf8");
    writeFileSync(join(nestedDir, "b77liveglobdeep.theta"), subagentTheta(), "utf8");
    writeFileSync(
      join(workspace.cwd, ".pi", "settings.json"),
      JSON.stringify({ thetaPaths: ["thetas/*.theta"] }),
      "utf8",
    );

    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the level-matching stem must register before the nested
      // stem's absence can be attributed to the non-recursion rule instead of
      // an unread settings file or a broken workspace.
      expect(
        handle.command("b77liveglobtop"),
        "the level-matching `thetas/*.theta` stem did not register — " +
          "precondition unmet (settings file unread, or the glob resolved to " +
          "nothing). Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root
      // (not the offline scratch harness the bug doc used), the nested stem
      // under `thetas/sub/` matches none of DISC-5's three comparison strings
      // against `thetas/*.theta` and does not register.
      expect(
        handle.command("b77liveglobdeep"),
        "the nested-directory stem registered anyway through the live " +
          "discovery/session_start path — the settings glob matcher reached " +
          "past its own directory level. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b77liveglobdeep");
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// cell 62 — bug 0113: both `listTree` copies swallowed every `readdir`
// rejection, so a denied subtree (or a denied static-prefix ROOT) under a
// settings `thetaPaths` glob's universe silently shrank that universe with no
// diagnostic on any channel (docs/bugs/0113-listtree-glob-universe-swallow-
// silent.md). The fix carries the universe walk's own `readdir` rejections out
// of `listTree` as a `TreeWalk.unreadable` list and reports each — once per
// denied path per pass, deduped against any per-match report that already
// covered the same path — as a `theta/load/unreadable-source` WARNING naming
// the triggering `thetaPaths` entry (discovery-sources.md:69, :57).
//
// This cell mirrors the bug 0077 cell immediately above: it writes
// `<cwd>/.pi/settings.json` itself after `plantThetaWorkspace` returns, before
// `bootShippedExtension` fires `session_start`'s real discovery walk. Unlike
// bug 0077, this cell needs a `readdir` REJECTION on the glob's static-prefix
// root, and this live harness cannot inject the `ReaddirDenied` seam the
// offline witness (tests/discovery-glob-universe-enumeration-failure.test.ts)
// uses — `bootShippedExtension` builds its own real `PiFileSystem`. The
// platform-neutral, ACL-free provocation the offline witness's cell E1 already
// uses instead: plant a REGULAR FILE at the exact path the static-prefix root
// would occupy. The real `fs.readdir` then rejects `ENOTDIR` — one of the
// three codes discovery-sources.md:68 classifies as *unreadable* — with no ACL
// manipulation and no platform branch. A glob entry never reaches
// `classifyPath`, so no wrong-type arm sees this path either.
//
// The warning fires at LOAD time (inside `bootShippedExtension`'s
// `session.bindExtensions({})`), through the SAME `sink.emitGroup(walk.
// diagnostics)` → `emitLoadNoteGroup` delivery surface the bug 0110 cell's
// error-severity diagnostic uses (production-composition.ts:562, :1462) —
// `emitLoadNoteGroup`'s warning arm selects on `severity === "warning"` with
// no code allow-list, so this is the same channel, a different severity arm.
// No slash command is invoked, so this cell spends zero tokens, the same
// profile as the bug 0070/0071/0077/0079(a)/0084/0110 registration-only cells.
// ADDITIVE ONLY: no existing cell in this file is weakened, reworded,
// reordered or deleted; the title and this leading comment both carry the
// literal token cell 62 (the parent renumbers at merge).
// ===========================================================================

/** `theta/load/unreadable-source`'s registered Message (DIAG-4) — reused from
 *  `INVOKE_PATH_ESCAPE_REGISTRY` above, the same code-registry-load.md page. */
const UNREADABLE_SOURCE_CODE = "theta/load/unreadable-source";

/**
 * `theta/load/unreadable-source: discovery source is unreadable: <descriptor>`
 * with `<descriptor>` substituted — DIAG-4: the message half is read from the
 * registry row, not copied, mirroring this file's `invokePathEscapeFragment`.
 */
function unreadableSourceFragment(descriptor: string): string {
  const template = registryMessage(
    INVOKE_PATH_ESCAPE_REGISTRY,
    UNREADABLE_SOURCE_CODE,
  ) as string | undefined;
  expect(
    template,
    `${UNREADABLE_SOURCE_CODE} has no registry row — the code this cell ` +
      "asserts is not registered (DIAG-2)",
  ).toBeTypeOf("string");
  const message = (template as string).replaceAll("<descriptor>", descriptor);
  expect(
    message,
    `${UNREADABLE_SOURCE_CODE}: an unsubstituted <…> placeholder remains — ` +
      "the registry row's Message template changed shape and this cell's " +
      "substitution is stale",
  ).not.toMatch(/<[a-z-]+>/);
  return `${UNREADABLE_SOURCE_CODE}: ${message}`;
}

describe("H8a-T — cell 62 (bug 0113): a settings thetaPaths glob whose static-prefix root cannot be enumerated warns on the theta-system-note channel (Convention: live-host acceptance)", () => {
  it("cell 62: registers the precondition control, and the theta-system-note channel carries the glob-universe unreadable-source warning naming settings entry index 0, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      // Precondition control: an ordinary theta in the SAME workspace,
      // proving the workspace and discovery walk both work — without this,
      // the missing warning could be (wrongly) attributed to a broken
      // workspace instead of the universe-walk swallow bug 0113 names.
      { source: "project", stem: "b113livectl", text: subagentTheta() },
    ]);
    // The glob's static-prefix root, planted as a REGULAR FILE (not a
    // directory) — the real `fs.readdir("<cwd>/.pi/g")` then rejects ENOTDIR.
    writeFileSync(join(workspace.cwd, ".pi", "g"), "not a directory\n", "utf8");
    writeFileSync(
      join(workspace.cwd, ".pi", "settings.json"),
      JSON.stringify({ thetaPaths: ["g/**/*.theta"] }),
      "utf8",
    );

    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the control must register before the warning's absence
      // could be (wrongly) attributed to a broken workspace.
      expect(
        handle.command("b113livectl"),
        "the precondition control did not register — precondition unmet. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root
      // (not the offline scratch harness the bug doc used, and not the
      // offline witness's fake-filesystem seam), the glob's static-prefix
      // root cannot be `readdir`ed, and discovery-sources.md:69 forbids
      // silence for a traversal failure inside a root that exists. The
      // warning fires at LOAD time, before any drive, so the full entry list
      // is the delta (mirrors the bug 0110 / bug 0084 cells above).
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = unreadableSourceFragment("settings entry index 0");
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the glob-universe unreadable-source " +
          "warning for the denied static-prefix root — AT HEAD (pre-bug-0113-fix) " +
          "listTree drops the readdir rejection in silence and nothing is ever " +
          "emitted. Notes: " + JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0079 — `theta/parse/interpolated-result` had no emitter: a
// `Result`-valued `${…}` interpolation rendered the interpreter-private
// `{"ok":…,"value":…}` encoding into the prompt text sent to the model
// instead of refusing the load (half (a), statically provable cases) or
// panicking (half (b), the runtime fallback for cases the static gate cannot
// prove). No shipped live fixture interpolates a `Result` (the bug doc's own
// observation), so neither half had live reach before this addition.
//
// Two halves, one cell each, mirroring the bug 0070/0071/0110/0077
// registration-only precedent above — including for HALF (b): the panic
// fires INSIDE `renderQueryText` (`stringifyInterpolation`,
// src/extension/production-theta-producer.ts), strictly BEFORE any provider
// dispatch (the QRY-6 comment at the render call site: the bare rendered
// template is "evaluated … before any provider turn is issued"), so this
// cell too spends ZERO tokens — the drive never reaches
// `pi.sendUserMessage`.
//
// HALF (a): `let r = Ok(1)` behind an untyped `${r}` interpolation is a
// `Result` the static gate PROVES (an `Ok` constructor by construction,
// `isCertainResultNode`, src/parser/type-layer-checks.ts); the row fires at
// TYPE-phase parse, `hasLoadParseError`
// (src/extension/production-composition.ts) un-registers on any
// `theta/parse/*` error-severity diagnostic, so the caller never registers —
// the SAME registration-absence observable the bug 0070/0071/0110/0077 cells
// assert, applied to this bug's own static gate.
//
// HALF (b): `fn mk() { Ok(1) }` / `let r = mk()` LAUNDERS the binding past the
// static gate (an unannotated `fn`'s return type is invisible to
// `collectFnReturnAnnotations` — `type-layer-checks.ts`'s own §Fix (a)
// doc-comment: "a call types as its callee's bare NAME"), so this fixture
// registers cleanly. Driving its slash command reaches `renderQueryText` →
// `stringifyInterpolation`, which raises `InterpolatedResultPanic`
// (src/render/query-render.ts) instead of `JSON.stringify`ing the carrier;
// `composeThetaFixture.run`'s top-level outer catch
// (theta-composition-producer.ts) frames it as `theta /<name> aborted:
// <message>` on the `theta-system-note` channel (AGENTS.md §"Assert on real
// observables") and the drive never reaches `pi.sendUserMessage` —
// `turn.userTexts` stays empty, which is runtime-value-model.md's own
// wire-leak invariant ("a `Result` value never crosses the wire") read off
// the real production composition instead of the offline drive double
// (tests/interpolated-result-gate.test.ts).
// ===========================================================================

/** `theta/parse/interpolated-result`'s registered Message — DIAG-4, read not copied. */
const INTERPOLATED_RESULT_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * The panic-framing `theta-system-note` text `composeThetaFixture.run`'s
 * outer catch composes for a bare `ThetaPanic` (`theta /<name> aborted:
 * <message>`, theta-composition-producer.ts) — the message half is the
 * registry row, read not copied (DIAG-4), mirroring this file's existing
 * `invokePathEscapeFragment` helper for the bug 0110 cell above.
 */
function interpolatedResultAbortedNote(slashName: string): string {
  const message = registryMessage(
    INTERPOLATED_RESULT_REGISTRY,
    INTERPOLATED_RESULT_CODE,
  ) as string | undefined;
  expect(
    message,
    `${INTERPOLATED_RESULT_CODE} has no registry row — the code this cell ` +
      "asserts is not registered (DIAG-2)",
  ).toBeTypeOf("string");
  return `theta /${slashName} aborted: ${message as string}`;
}

/** Half (a) — a `Result` the static gate PROVES: an `Ok` constructor, interpolated directly. */
function interpolatedResultRefusedTheta(): string {
  return ["---", "mode: prompt", "---", "let r = Ok(1)", "@`x${r}`", ""].join("\n");
}

/**
 * Half (b) — the SAME shape laundered past the static gate through an
 * UNANNOTATED `fn` return (the `tests/interpolated-result-gate.test.ts`
 * `LAUNDERED` fixture, mirrored here for the live composition): the
 * binding's static type is the callee NAME, not a `Result`, so the static
 * gate cannot prove it and this theta registers; the runtime value is a
 * genuine branded `Result`, so the render panics.
 */
function interpolatedResultLaunderedTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "fn mk() {",
    "  Ok(1)",
    "}",
    "let r = mk()",
    "@`x${r}`",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0079 (a): a Result-typed interpolation the static gate can prove refuses to register (Convention: live-host acceptance)", () => {
  it("does not register a caller whose untyped `${…}` interpolates a directly-constructed `Ok(1)`, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, the
      // refused theta's absence could be (wrongly) attributed to a broken
      // workspace instead of the static gate.
      { source: "project", stem: "b79livectl", text: promptTheta("THETA-LIVE-OK") },
      { source: "project", stem: "b79liverefused", text: interpolatedResultRefusedTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b79livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the static gate, would explain the refused theta's absence too. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root
      // (not the offline `parseThetaDocument` harness the unit witness uses),
      // a `Result`-typed interpolation the static gate can prove refuses to
      // register — `theta/parse/interpolated-result` un-registers it at the
      // SAME `hasLoadParseError` site the bug 0070/0071/0110/0077 cells above
      // exercise for their own codes.
      expect(
        handle.command("b79liverefused"),
        "the caller whose `${…}` interpolates a directly-constructed `Ok(1)` " +
          "registered anyway through the live discovery/session_start path — " +
          "theta/parse/interpolated-result did not fire. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b79liverefused");
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

describe("H8a-T — bug 0079 (b): a laundered Result interpolation panics instead of sending the carrier (Convention: live-host acceptance)", () => {
  it("registers a caller whose `${…}` interpolates a Result laundered through an unannotated fn, then aborts the drive with the registered panic before any turn is sent", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      { source: "project", stem: "b79livepanic", text: interpolatedResultLaunderedTheta() },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the static gate cannot see this laundered shape (an
      // unannotated `fn`'s return type never reaches `collectFnReturnAnnotations`),
      // so the theta must register before the drive below can exercise the
      // runtime fallback.
      expect(
        handle.command("b79livepanic"),
        "the laundered-Result caller did not register — either the static " +
          "gate over-fired on a shape it should defer (a regression this cell " +
          "does not intend to test) or discovery/registration itself " +
          "regressed. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: `stringifyInterpolation` raises
      // `InterpolatedResultPanic` INSIDE `renderQueryText`, strictly before any
      // provider dispatch (the render happens before the model is even built —
      // see the QRY-6 comment at the call site), so this drive spends ZERO
      // tokens regardless of the fix: no `pi.sendUserMessage` call is ever
      // reached on the fixed path. `driveSlashCaptureTurn`'s `prompt()` still
      // RESOLVES (AGENTS.md §"Assert on real observables" — a fail-closed
      // drive resolves; failures surface as notes, not throws), so the
      // deterministic observables are `turn.userTexts` (must stay empty — the
      // wire-leak invariant) and `turn.systemNotes` (must carry the panic
      // framing), never `prompt()` merely settling.
      const turn = await driveSlashCaptureTurn(handle, "/b79livepanic");
      expect(
        turn.userTexts,
        "DIRECTION 2 (runtime-value-model.md: \"a Result value never crosses " +
          "the wire\"): no user turn may be sent once the render panics. " +
          "Sent: " + JSON.stringify(turn.userTexts),
      ).toEqual([]);
      expect(
        turn.systemNotes,
        "PRIMARY (bug 0079 §Fix (b)): the panic must be framed on the " +
          "theta-system-note channel with the registered code's message " +
          "(DIAG-4, read from code-registry-parse.md, never copied prose). " +
          "System notes: " + JSON.stringify(turn.systemNotes),
      ).toEqual([interpolatedResultAbortedNote("b79livepanic")]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// cell 75 — bug 0122: a `@`-query `${…}` interpolation whose expression is a
// form the expression sublanguage refuses (`--`, `===`, …) discards every
// parse-parser-phase diagnostic and loads clean, on a production path, with
// zero diagnostics (docs/bugs/0122-template-interpolation-diagnostics-discarded.md).
// The settled fix (§Fix (a) route 1, .pi/tmp/fixes/0122-route-brief.md) makes
// `checkQueryTemplateInterpolations` (src/parser/theta-document.ts:7398)
// relocate the interpolation's own parse-parser diagnostics to the enclosing
// `@`-query's range, so the SAME `hasLoadParseError` site the bug
// 0070/0071/0079(a)/0110/0084 cells above exercise for their own codes now
// also fires for `theta/parse/increment-decrement` raised INSIDE `${…}` — a
// registration-level refusal, exactly like bug 0079 (a) above, and this is
// the same fixture shape mirrored onto bug 0122's own code. No shipped live
// fixture interpolates a rejected form (the bug doc's own corpus census: 0 of
// 37 committed interpolations), so no existing live cell reaches this arm.
// ADDITIVE ONLY: no existing cell in this file is renumbered or edited.
// ===========================================================================

/** `theta/parse/increment-decrement`'s registered Message — DIAG-4, read not copied. */
const B0122_INCREMENT_DECREMENT_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/** The fixed observable's registered code — src/parser/bindings.ts's emitter. */
const B0122_INCREMENT_DECREMENT_CODE = "theta/parse/increment-decrement";

/**
 * A `${c--}` interpolation — bug 0122's own origin row (bug 0084's residual
 * (ii)). At `let`-RHS level this same source draws
 * `theta/parse/increment-decrement`; pre-fix, inside `${…}` it drew nothing
 * and the theta registered and rendered the value of `c` into the prompt
 * (measured in the bug doc's §Reproduction).
 */
function interpolationRejectedFormTheta(): string {
  return ["---", "mode: prompt", "---", "let c = 5", "@`x${c--}`", ""].join("\n");
}

describe("H8a-T cell 75 — bug 0122: a rejected form inside a `@`-query `${…}` interpolation refuses to register (Convention: live-host acceptance)", () => {
  it("does not register a caller whose untyped `${…}` interpolates `c--`, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, the
      // refused theta's absence could be (wrongly) attributed to a broken
      // workspace instead of the fix.
      { source: "project", stem: "b122livectl", text: promptTheta("THETA-LIVE-OK") },
      { source: "project", stem: "b122liverefused", text: interpolationRejectedFormTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b122livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the fix, would explain the refused theta's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root,
      // `theta/parse/increment-decrement` — relocated by
      // `checkQueryTemplateInterpolations` to the enclosing `@`-query's range —
      // now fires for a `${c--}` interpolation, and `hasLoadParseError`
      // un-registers the caller at the SAME site the bug 0070/0071/0079(a)/
      // 0110/0084 cells above exercise for their own codes.
      expect(
        handle.command("b122liverefused"),
        "the caller whose `${…}` interpolates `c--` registered anyway through " +
          "the live discovery/session_start path — " +
          "theta/parse/increment-decrement did not fire inside the " +
          "interpolation. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b122liverefused");

      // DIAG-4 sanity: the registered code this cell relies on carries the
      // Message the registry pins, read not copied — a guard against a
      // registry-page rename silently degrading the cell's own narrative.
      const message = registryMessage(
        B0122_INCREMENT_DECREMENT_REGISTRY,
        B0122_INCREMENT_DECREMENT_CODE,
      ) as string | undefined;
      expect(
        message,
        `${B0122_INCREMENT_DECREMENT_CODE} has no registry row — the code this cell ` +
          "asserts is not registered (DIAG-2)",
      ).toBeTypeOf("string");
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

/**
 * Bug 0114's PRIMARY shape (docs/bugs/0114-nested-result-in-interpolated-object-leaks-carrier.md):
 * a `par for` value is `array<Result<T, QueryError>>` (control-flow.md:74,
 * CTRL-3), and interpolating it WHOLE — no static annotation anywhere spells
 * `Result` for a container, so `interpolationIsResult`
 * (src/parser/type-layer-checks.ts) never fires — registers cleanly, exactly
 * like half (b) above. Bug 0114 §Fix (a) route 2 (settled, not route 1's
 * static descent) makes the RUNTIME lowering
 * (`translateInterpolationOutbound`) the only place that reaches the branded
 * `Result` at the nested position.
 */
function nestedResultInterpolationTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "let ns = [1, 2]",
    "let rs = par for n in ns {",
    "  n + 1",
    "}",
    "@`x${rs}`",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0114: a Result NESTED inside an interpolated `par for` value panics instead of sending the carrier, live (Convention: live-host acceptance)", () => {
  it("registers a caller whose `${…}` interpolates a whole `par for` value holding nested `Result`s, then aborts the drive with the registered panic before any turn is sent, spending zero model turns", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      { source: "project", stem: "b114livepanic", text: nestedResultInterpolationTheta() },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: bug 0114 §Fix (a) route 2 keeps the parse layer
      // untouched — no static descent into the container — so this caller
      // MUST register before the drive below can exercise the runtime
      // fallback. A regression that widened the static gate to refuse this
      // shape at load (route 1, deliberately declined) would red HERE first,
      // not at the drive assertions below.
      expect(
        handle.command("b114livepanic"),
        "the nested-Result `par for` caller did not register — either the " +
          "static gate over-fired on a container it must defer (bug 0114 " +
          "§Fix (a) route 2, a regression this cell does not intend to test) " +
          "or discovery/registration itself regressed. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The FIXED observable (bug 0114): `stringifyInterpolation`'s container
      // arm threads an explicit `NestedResultReach` accumulator through
      // `translateInterpolationOutbound`; reaching the branded `Result`
      // nested inside the `par for` array discards the lowered tree and
      // routes through the SAME `stringifyInterpolatedValue(value, { kind:
      // "result" })` arm bug 0079's top-level case already uses — zero new
      // raise sites (`grep -c "throw new InterpolatedResultPanic" src/` stays
      // 1) — so `InterpolatedResultPanic` fires INSIDE `renderQueryText`,
      // strictly before any provider dispatch (the same pre-dispatch
      // position bug 0079 (b) above pins). This drive therefore spends ZERO
      // tokens on the fixed path: no `pi.sendUserMessage` call is ever
      // reached. Assert on real observables (AGENTS.md §"Assert on real
      // observables"), never on `prompt()` merely resolving:
      // `turn.userTexts` (the deterministic wire-leak invariant, now proven
      // at the NESTED position — pre-fix this exact fixture sent
      // `x[{"ok":true,"value":2},{"ok":true,"value":3}]`) and
      // `turn.systemNotes` (the panic framing), both read off the SETTLED
      // in-memory `SessionManager`.
      const turn = await driveSlashCaptureTurn(handle, "/b114livepanic");
      expect(
        turn.userTexts,
        "DIRECTION 1 (bug 0114 §Expected behaviour, Reading A — " +
          "runtime-value-model.md:14 \"a Result value never crosses the " +
          "wire\" at ANY depth, not only the top level): no user turn may be " +
          "sent once the nested render panics. Sent: " +
          JSON.stringify(turn.userTexts),
      ).toEqual([]);
      expect(
        turn.systemNotes,
        "PRIMARY (bug 0114 §Fix (b), the DIAG-2 Trigger widening at " +
          "code-registry-parse.md:74): the panic must be framed on the " +
          "theta-system-note channel with the SAME registered " +
          "`theta/parse/interpolated-result` code's Message (DIAG-4, read " +
          "from the registry, never copied prose) bug 0079's top-level case " +
          "already uses — one code, no new row, no third raise site. System " +
          "notes: " + JSON.stringify(turn.systemNotes),
      ).toEqual([interpolatedResultAbortedNote("b114livepanic")]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0080 — `keys()` / `values()` on a named-schema value, and the QRY-18
// outbound JSON built from the same record, followed the CONSTRUCTOR's field
// order instead of the schema's DECLARATION order (bug 0080 §Fix, "Order at
// construction", the settled route). Both constructor evaluation sites now
// delegate to one shared function (`buildObjectSchemaValue`,
// src/runtime/value.ts) that reorders the already-evaluated field record into
// the declaring schema's field order before branding.
//
// No shipped live fixture constructs an out-of-declaration-order schema value
// before this addition (every planted `.theta` above either constructs no
// named schema or writes its fields in declaration order already), so
// neither construction site had live reach over this ordering rule. The
// closer mirror is the bug 0020 QRY-18-enum-render cell near the top of this
// file: `driveSlashCaptureTurn`, asserting on the deterministic
// `turn.userTexts` channel, never on `assistantText` or on `prompt()` merely
// resolving. One query drives BOTH construction sites so one turn witnesses
// both (token-bounded):
//   - SITE 1 — `evalExpr`'s `if (expr.kind === "object")` arm
//     (src/runtime/statement-executor.ts): the `let`-bound value `p`.
//   - SITE 2 — `evaluatePureExpression`'s `case "object"` arm
//     (src/extension/production-theta-producer.ts), reached only when a
//     constructor is written INLINE inside a `${…}` interpolation: the same
//     shape constructed a second time, directly in the query template.
// A fix landed at only one site leaves the other site's marker rendering the
// pre-fix order — the lockstep obligation bug 0027 records for its four read
// entry points, applied here to bug 0080's two WRITE sites.
// ===========================================================================

/**
 * Schema `P` declares `b` before `a`; both interpolations construct it with
 * the fields reversed — an order expressions.md §"Object construction" calls
 * irrelevant. `SITE1=`/`SITE2=`/`|END` mark the two rendered segments so the
 * assertion below reads exactly the bytes each construction site produced;
 * the trailing instruction keeps the model's reply short (the reply itself is
 * unchecked — the observable is the outbound render, not the reply).
 */
function ctorDeclarationOrderTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "schema P { b: integer, a: string }",
    'let p = P { a: "x", b: 1 }',
    '@`SITE1=J${p}|SITE2=J${P { a: "x", b: 1 }}|END What is 418 plus 361? Answer with the number only.`',
    "",
  ].join("\n");
}

describe("H8a-T — bug 0080: constructor field order follows the schema's DECLARATION order, live (Convention: live-host acceptance)", () => {
  it("renders both construction sites' out-of-order fields in the schema's declared order in the real outbound query text", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work independently of the
      // fixture under test.
      { source: "project", stem: "b80livectl", text: promptTheta("THETA-LIVE-OK") },
      { source: "project", stem: "b80liveorder", text: ctorDeclarationOrderTheta() },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b80livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the fixture under test, would explain the ordering fixture's " +
          "absence too. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b80liveorder"),
        "no bug-0080 ordering command to invoke — the .theta failed " +
          "discovery/parse. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const turn = await driveSlashCaptureTurn(handle, "/b80liveorder");
      // PRIMARY: the exact outbound text both construction sites rendered.
      // `p` (SITE 1) and the inline `P { a: "x", b: 1 }` (SITE 2) are the SAME
      // shape constructed twice; declaration order (`b` before `a`) must win
      // at both, byte for byte — pre-fix each site rendered J{"a":"x","b":1}
      // (the constructor's own order).
      expect(
        turn.userTexts,
        "the outbound query text must carry both construction sites' fields " +
          "in the schema's DECLARATION order. Outbound user texts: " +
          JSON.stringify(turn.userTexts),
      ).toEqual(['SITE1=J{"b":1,"a":"x"}|SITE2=J{"b":1,"a":"x"}|END What is 418 plus 361? Answer with the number only.']);
      const failureNotes = turn.systemNotes.filter((n) =>
        /^theta \/b80liveorder (returned Err|cancelled|aborted)/.test(n),
      );
      expect(
        failureNotes,
        "the ordering drive surfaced fail-closed system note(s): " +
          JSON.stringify(failureNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0084 — `theta/parse/increment-decrement`'s sole emitter,
// `checkIncrementDecrement` (src/parser/bindings.ts), had no `src/` caller: no
// `++`/`--` in author source drew it anywhere. `--` was silently absorbed by
// the trailing-operator newline-continuation trigger (`c--` glued onto the
// next line), so `while c > 0 { c-- }` loaded CLEAN with an EMPTY loop body —
// a non-terminating loop with zero diagnostics (docs/bugs/0084-increment-
// decrement-check-dead.md, §Reproduction r7 — the doc's own "load-bearing
// row"). The fix lexes the byte-adjacent pair as one token ahead of the
// continuation test (`twoCharOperators`, src/lexer/lexer.ts) and calls the
// existing emitter from two new hooks in the expression walk (`parseUnary` /
// `parsePostfix`, src/parser/theta-document.ts).
//
// No shipped live fixture (H8a, H9a, or the hardening probes) contains a
// byte-adjacent `++`/`--` anywhere before this cell — confirmed both
// statically (every `--`/`++` byte run across every committed `.theta` /
// `.thetalib` is a frontmatter `---` fence or, in exactly one `.theta`, a
// `--theta` CLI-flag mention inside a `//` comment) and by the H9a acceptance
// suite's own clean run (no `theta/parse/increment-decrement` appears in any
// of its ten spawns' captured output) — mirroring the bug
// 0070/0071/0077/0079/0110 "no existing live fixture reaches this arm"
// finding. This cell plants the bug doc's own r7 shape and drives it through
// the REAL shipped composition root against a live host.
//
// The check fires at TYPE-phase parse — an `error`-severity `theta/parse/*`
// diagnostic INSIDE `parseThetaDocument`'s own `document.diagnostics` — so
// `hasLoadParseError` (production-composition.ts) un-registers the caller
// before any turn could be dispatched, the SAME registration-absence
// observable the bug 0070/0071/0077/0079(a)/0110 cells above assert, applied
// to this bug's own check. This cell ALSO reads the `theta-system-note`
// channel directly off the settled `SessionManager` (mirroring the bug 0110
// cell): `preEvalCauseOf` maps every `theta/parse/*` code to the
// "lex-parse-type" cause and `parseDiscoveredTheta`'s drop path
// (`{ dropped: [...document.diagnostics, …] }`) forwards through the SAME
// `sink.emitGroup` → `preEvalRouter.routePreEvalFailure` delivery surface
// bug 0110's `theta/load/*` diagnostic uses — the router shares one delivery
// surface across every cause. The diagnostic fires at LOAD time, inside
// `bootShippedExtension`'s `session.bindExtensions({})`, before any slash is
// driven, so the full entry list — not a per-drive slice — is the delta.
// Registration-only: no slash command is invoked, so no model turn runs and
// the cell spends zero tokens, the same profile as the bug 0070/0071/0077/
// 0079(a)/0110 cells above.
// ===========================================================================

/** `theta/parse/increment-decrement`'s registered code and registry page. */
const INCREMENT_DECREMENT_CODE = "theta/parse/increment-decrement";
const INCREMENT_DECREMENT_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `theta/parse/increment-decrement: '<op>' operator is not supported` —
 * DIAG-4: the message half is read from the registry row, not copied,
 * mirroring this file's existing `invokePathEscapeFragment` /
 * `interpolatedResultAbortedNote` helpers.
 */
function incrementDecrementFragment(op: "++" | "--"): string {
  const template = registryMessage(
    INCREMENT_DECREMENT_REGISTRY,
    INCREMENT_DECREMENT_CODE,
  ) as string | undefined;
  expect(
    template,
    `${INCREMENT_DECREMENT_CODE} has no registry row — the code this cell ` +
      "asserts is not registered (DIAG-2)",
  ).toBeTypeOf("string");
  const message = (template as string).replaceAll("<op>", op);
  expect(
    message,
    `${INCREMENT_DECREMENT_CODE}: an unsubstituted <…> placeholder remains — ` +
      "the registry row's Message template changed shape and this cell's " +
      "substitution is stale",
  ).not.toMatch(/<[a-z]+>/);
  return `${INCREMENT_DECREMENT_CODE}: ${message}`;
}

/** The bug doc's own r7 shape — "the row where silence is a non-terminating loop". */
function incDecWhileBodyTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "let mut c = 3",
    "while c > 0 {",
    "  c--",
    "}",
    "c",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0084: `--` in a while body draws theta/parse/increment-decrement, live (Convention: live-host acceptance)", () => {
  it("does not register a caller whose while-body statement is `c--`, and the theta-system-note channel carries the rejection, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, the
      // refused theta's absence could be (wrongly) attributed to a broken
      // workspace instead of the check under test.
      { source: "project", stem: "b84livectl", text: promptTheta("THETA-LIVE-OK") },
      { source: "project", stem: "b84liverefused", text: incDecWhileBodyTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b84livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the check under test, would explain the refused theta's absence too. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root
      // (not the offline parseThetaDocument harness the unit witness uses), a
      // `while`-body `c--` refuses to register —
      // theta/parse/increment-decrement un-registers it at the SAME
      // hasLoadParseError site the bug 0070/0071/0077/0079(a)/0110 cells above
      // exercise for their own codes.
      expect(
        handle.command("b84liverefused"),
        "the caller whose while-body statement is `c--` registered anyway " +
          "through the live discovery/session_start path — " +
          "theta/parse/increment-decrement did not fire. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b84liverefused");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"): the diagnostic fires at LOAD time, before any drive, so
      // the full entry list is the delta (mirrors the bug 0110 cell above).
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = incrementDecrementFragment("--");
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the increment-decrement rejection for " +
          "the refused theta. Notes: " + JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0089 — an alias-typed `fn` parameter stayed opaque to `checkForIterand`
// (src/parser/control-flow.ts): the gate tested `iterand.type.kind` directly,
// so a type-alias schema over `array<T>` (`schema L = array<string>`) never
// read as `array<T>` there, even though TYPE-11 (type-system.md:54) makes `L`
// and `array<string>` the SAME type — "on whichever side of a `T₁ ⊑ T₂`
// check it appears, it is replaced by its right-hand side". `schema L =
// array<string>` with `fn f(xs: L) { for x in xs { … } }` therefore drew a
// FALSE `theta/parse/non-array-iterand` (control-flow.md:13 admits any
// `array<T>` iterand, alias or not; docs/bugs/0089-fn-param-alias-not-
// unfolded-iterand-join.md §Reproduction (a) row 1). The fix unfolds
// `iterand.type` through the exported `unfoldAlias` (type-compat.ts:155)
// before the `kind` test (§Fix item 1), given `env` as a new third parameter
// both call sites already hold (`this.env`).
//
// The check fires at TYPE phase, INSIDE `parseThetaDocument`'s own
// `document.diagnostics` (an `error`-severity `theta/parse/*` diagnostic), so
// `hasLoadParseError` (production-composition.ts) un-registers the caller at
// the SAME site the bug 0070/0071/0077/0079(a)/0110/0084 cells above exercise
// for their own codes — but in the OPPOSITE direction: those fixes ADD a
// missing rejection (a caller that wrongly registered now correctly does
// not); this fix REMOVES a wrong one (a caller that wrongly failed to
// register now correctly does). Pre-fix the alias-typed caller below fails to
// register; post-fix it registers, which is what this cell asserts — the
// registered, not the refused, direction.
//
// No shipped live fixture (H8a, H9a, or the hardening probes) declares a
// type-alias schema (`schema X = R`) anywhere before this cell — confirmed
// statically (`rg -n "^schema \w+ = " tests/live/ docs/examples/` matches
// nothing before this addition) — so no existing live fixture had reach over
// this gate's alias route, mirroring the bug 0084 cell's own "no existing
// live fixture reaches this arm" finding for its own construct.
//
// Registration-only: no slash command is invoked, so no model turn runs and
// the cell spends zero tokens, the same profile as the bug 0070/0071/0077/
// 0079(a)/0110/0084 cells above. ADDITIVE ONLY: no existing cell in this file
// is weakened, reworded, reordered or deleted.
// ===========================================================================

/** `theta/parse/non-array-iterand`'s registered code and registry page. */
const NON_ARRAY_ITERAND_CODE = "theta/parse/non-array-iterand";
const NON_ARRAY_ITERAND_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `theta/parse/non-array-iterand: 'for' expects array<T> after 'in'; got
 * <type>` with `<type>` substituted — DIAG-4: the message half is read from
 * the registry row, not copied, mirroring this file's existing
 * `incrementDecrementFragment` / `invokePathEscapeFragment` helpers. Used
 * only for the ABSENCE assertion below: post-fix, no note carrying this
 * fragment for the fixed caller's own declared type may appear.
 */
function nonArrayIterandFragment(type: string): string {
  const template = registryMessage(
    NON_ARRAY_ITERAND_REGISTRY,
    NON_ARRAY_ITERAND_CODE,
  ) as string | undefined;
  expect(
    template,
    `${NON_ARRAY_ITERAND_CODE} has no registry row — the code this cell ` +
      "asserts is not registered (DIAG-2)",
  ).toBeTypeOf("string");
  const message = (template as string).replaceAll("<type>", type);
  expect(
    message,
    `${NON_ARRAY_ITERAND_CODE}: an unsubstituted <…> placeholder remains — ` +
      "the registry row's Message template changed shape and this cell's " +
      "substitution is stale",
  ).not.toMatch(/<[a-z]+>/);
  return `${NON_ARRAY_ITERAND_CODE}: ${message}`;
}

/**
 * The bug doc's own §Reproduction (a) row 1 — "the reported direction": a
 * type-alias schema over `array<string>`, an `fn` parameter declared with it,
 * and a `for` loop over that parameter
 * (docs/bugs/0089-fn-param-alias-not-unfolded-iterand-join.md §Reproduction
 * (a) row 1 / `tests/fn-param-alias-unfolded-at-gates.test.ts` row a1's
 * production-parser shape, replayed here through the real
 * discovery→registration path instead of the offline harness). The trailing
 * `1` supplies the theta's final value, matching the bug doc's own `ITER`
 * template — no `@`-query is needed for a prompt-mode theta to register (the
 * bug 0084 cell's own `incDecWhileBodyTheta` above registers a bare final
 * identifier the same way).
 */
function aliasIterandTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "schema L = array<string>",
    "fn f(xs: L) {",
    "  for x in xs {",
    "    x",
    "  }",
    "}",
    "1",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0089: an alias-typed fn parameter iterated in a `for` registers, live (Convention: live-host acceptance)", () => {
  it("registers a caller whose fn parameter is a type-alias of array<string>, iterated in a for loop, and the theta-system-note channel carries no non-array-iterand rejection, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, a
      // regressed fix (the alias caller failing to register) could be
      // (wrongly) attributed to a broken workspace instead of the gate under
      // test.
      { source: "project", stem: "b89livectl", text: promptTheta("THETA-LIVE-OK") },
      { source: "project", stem: "b89livealias", text: aliasIterandTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b89livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the gate under test, would explain the alias caller's absence too. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root
      // (not the offline parseThetaDocument harness the unit witness uses), a
      // for-iterated alias-of-array fn parameter registers — `unfoldAlias`
      // (type-compat.ts) makes `checkForIterand` see `L` as `array<string>`,
      // so `hasLoadParseError` no longer un-registers this caller the way it
      // did pre-fix.
      expect(
        handle.command("b89livealias"),
        "the caller whose fn parameter is a type-alias of array<string>, " +
          "iterated in a for loop, failed to register — theta/parse/non-array-" +
          "iterand fired on a program TYPE-11 admits. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toContain("b89livealias");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"): the diagnostic, when it fires, fires at LOAD time,
      // before any drive, so the full entry list is the delta (mirrors the
      // bug 0110 / bug 0084 cells above). Post-fix there is nothing to reject
      // for this caller's own declared type, so this fragment's ABSENCE is
      // the success signal — mirroring AGENTS.md's subagent-mode absence
      // convention, applied here to a load-time note instead of a drive's.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const regressionFragment = nonArrayIterandFragment("L");
      expect(
        notes.some((note) => note.includes(regressionFragment)),
        "a theta-system-note entry named the non-array-iterand rejection for " +
          "the alias-typed caller — the gate 1 unfold regressed. Notes: " +
          JSON.stringify(notes),
      ).toBe(false);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0095 — `ThetaDocument.parseType` (src/parser/theta-document.ts) captured a
// brace-rooted union arm as the WHOLE type at every non-alias `Type` position:
// a leading `{` consumed the balanced group and RETURNED, leaving the `("|"
// Type)*` tail of `Type "|" Type` (grammar.md:94) in the token stream. At the
// schema-field position the residue `|` is not a field name, so
// `parseSchemaObjectBody`'s recovery discarded the whole field list and
// `finishObjectSchema` raised `theta/parse/empty-schema-body` against the
// DECLARATION's own name — for a declaration that does declare fields
// (docs/bugs/0095-brace-rooted-union-arm-capture-destroys-context.md
// §Reproduction element 1 row 2). Since schemas.md:17 makes `T | null` the ONLY
// spelling for an optional field and grammar.md:109 admits `ObjectType` in any
// `Type` position, an optional inline-object field was unwritable. The fix
// widens `parseType`'s arm-start `{` branch to every `Type` position, so each
// consumes the same `Type ("|" Type)*` extent the alias right-hand side
// (grammar.md:184) already consumes.
//
// The refusal fires at PARSE phase, inside `parseThetaDocument`'s own
// `document.diagnostics` as an `error`-severity `theta/parse/*` diagnostic, so
// `hasLoadParseError` (production-composition.ts) un-registers the caller at the
// SAME site the bug 0070/0071/0077/0079(a)/0110/0084/0089 cells above exercise
// for their own codes — and in the same direction as bug 0089's: this fix
// REMOVES a wrong rejection, so pre-fix the theta below fails to register and
// post-fix it registers. That is what this cell asserts.
//
// No shipped live fixture (H8a, H9a, or the hardening probes) writes a `}`
// followed by a `|` anywhere — confirmed statically over the whole tree (`rg
// '\}\s*\|' --glob '*.theta' --glob '*.thetalib'` matches nothing) — so no
// existing live fixture had reach over this capture, mirroring the bug 0084 and
// bug 0089 cells' own "no existing live fixture reaches this arm" findings.
//
// Registration-only: no slash command is invoked, so no model turn runs and the
// cell spends zero tokens, the same profile as the bug 0070/0071/0077/0079(a)/
// 0110/0084/0089 cells above. ADDITIVE ONLY: no existing cell in this file is
// weakened, reworded, reordered or deleted.
// ===========================================================================

/** `theta/parse/empty-schema-body`'s registered code and registry page. */
const EMPTY_SCHEMA_BODY_CODE = "theta/parse/empty-schema-body";
const EMPTY_SCHEMA_BODY_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `theta/parse/empty-schema-body: '<X>' has no fields; …` with `<X>`
 * substituted — DIAG-4: the message half is read from the registry row, not
 * copied, mirroring this file's existing `nonArrayIterandFragment` /
 * `incrementDecrementFragment` / `invokePathEscapeFragment` helpers. Used only
 * for the ABSENCE assertion below: post-fix, no note may name the declaration
 * whose fields the capture destroyed.
 */
function emptySchemaBodyFragment(subject: string): string {
  const template = registryMessage(
    EMPTY_SCHEMA_BODY_REGISTRY,
    EMPTY_SCHEMA_BODY_CODE,
  ) as string | undefined;
  expect(
    template,
    `${EMPTY_SCHEMA_BODY_CODE} has no registry row — the code this cell ` +
      "asserts is not registered (DIAG-2)",
  ).toBeTypeOf("string");
  const message = (template as string).replaceAll("<X>", subject);
  expect(
    message,
    `${EMPTY_SCHEMA_BODY_CODE}: an unsubstituted <…> placeholder remains — ` +
      "the registry row's Message template changed shape and this cell's " +
      "substitution is stale",
  ).not.toMatch(/<[a-zA-Z]+>/);
  return `${EMPTY_SCHEMA_BODY_CODE}: ${message}`;
}

/**
 * The bug doc's §Reproduction element 1 rows 2 and 5 in one declaration — the
 * optional inline-object field (`{a: integer} | null`, the one spelling
 * schemas.md:17 leaves an author) with an ordinary field written BEFORE it, so
 * the pre-fix refusal destroys a field the arm has nothing to do with. The
 * trailing `1` supplies the theta's final value, matching the bug 0089 cell's
 * own `aliasIterandTheta` above (a prompt-mode theta needs no `@`-query to
 * register).
 */
function optionalInlineObjectFieldTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "schema Cfg { retries: integer, hook: {a: integer} | null }",
    "1",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0095: a schema field carrying a brace-rooted union arm registers, live (Convention: live-host acceptance)", () => {
  it("registers a theta whose schema field type is `{a: integer} | null`, and the theta-system-note channel carries no empty-schema-body rejection for that declaration, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, a regressed
      // fix (the optional-inline-object caller failing to register) could be
      // (wrongly) attributed to a broken workspace instead of the capture under
      // test.
      { source: "project", stem: "b95livectl", text: promptTheta("THETA-LIVE-OK") },
      {
        source: "project",
        stem: "b95liveopt",
        text: optionalInlineObjectFieldTheta(),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b95livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the capture under test, would explain the optional-inline-object " +
          "caller's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root
      // (not the offline parseThetaDocument harness the unit witness uses), a
      // schema whose field type is a brace-rooted union registers — the
      // widened capture keeps the field list, so `finishObjectSchema`'s
      // `fields === null` arm is not reached and `hasLoadParseError` no longer
      // un-registers this caller.
      expect(
        handle.command("b95liveopt"),
        "the theta whose schema field type is `{a: integer} | null` failed to " +
          "register — theta/parse/empty-schema-body fired against a " +
          "declaration that declares two fields, on the only spelling " +
          "schemas.md:17 gives an optional field. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toContain("b95liveopt");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager` rather
      // than off racy events: the diagnostic, when it fires, fires at LOAD
      // time, before any drive, so the full entry list is the delta (mirrors
      // the bug 0110 / 0084 / 0089 cells above). Post-fix nothing may name
      // `Cfg` as field-less, so this fragment's ABSENCE is the success signal.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const regressionFragment = emptySchemaBodyFragment("Cfg");
      expect(
        notes.some((note) => note.includes(regressionFragment)),
        "a theta-system-note entry named the empty-schema-body rejection for " +
          "the declaration whose field list the union-arm capture destroyed — " +
          "the widened `parseType` capture regressed. Notes: " +
          JSON.stringify(notes),
      ).toBe(false);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0102 — a raw line terminator inside a STRING LITERAL on a `params:`
// default RHS was admitted with zero diagnostics: `checkLiteralSublanguage`'s
// own tokeniser treats the break as string content, so `p: string = "a<LF>b"`
// loaded clean and registered, while the identical bytes in a body `let` draw
// `theta/parse/literal-newline-in-string`
// (docs/bugs/0102-params-default-string-literal-raw-newline-admitted.md). The
// fix adds `hasRawNewlineInStringLiteral` (src/parser/literal-sublanguage.ts),
// a READ-ONLY scan of the shared `tokeniseExpr`'s own `str` tokens, called
// from the `parseParams` per-field default loop (src/parser/params.ts)
// alongside the existing `checkLiteralSublanguage` call, ranged on
// `field.range` — the same range the sibling `default-not-literal` diagnostic
// already uses.
//
// The refusal fires at PARSE phase, inside `parseThetaDocument`'s own
// `document.diagnostics` (an `error`-severity `theta/parse/*` diagnostic), so
// `hasLoadParseError` (production-composition.ts) un-registers the caller at
// the SAME site the bug 0070/0071/0077/0079(a)/0110/0084/0089/0095 cells above
// exercise for their own codes.
//
// No shipped live fixture (H8a, H9a, or the hardening probes) declares a
// `params:` default whose string literal carries a raw newline — confirmed
// statically (the corpus census: 34 committed `.theta`/`.thetalib` files, 17
// declaring `params:`, 19 fields, exactly ONE default —
// `tests/live/acceptance/fixtures/acc-params-binder.theta:6`,
// `count: number = 3`, a bare integer carrying no string literal at all) — so
// the new check had NO live reach before this cell, mirroring the bug 0084 /
// 0089 / 0095 cells' own "no existing live fixture reaches this arm" finding.
//
// Registration-only: no slash command is invoked, so no model turn runs and
// the cell spends zero tokens, the same profile as the bug 0070/0071/0077/
// 0079(a)/0110/0084/0089/0095 cells above. A `bind_model:` pin
// (`anthropic/claude-haiku-4-5`, the same pin the committed
// `acc-params-binder.theta` fixture and the bug 0071 cell's `b71livecallee`
// use) is carried by every `params:`-declaring theta below: a DEFAULTED
// `params:` field is never `single-string-bypass`-eligible
// (`classifyBinderBypass`, src/binder/binder-envelope.ts, requires NO
// default), so it always routes to `binder` kind and would otherwise depend on
// this ephemeral workspace's absent ambient settings for a resolvable model —
// a LOAD-TIME, static registry lookup only (no dispatched turn, so still zero
// tokens), exactly as bug 0071's `b71livecallee` already relies on. ADDITIVE
// ONLY: no existing cell in this file is weakened, reworded, reordered or
// deleted.
// ===========================================================================

/** `theta/parse/literal-newline-in-string`'s registered code and registry page (bug 0102 reuses the lexer's existing code; see docs/bugs/0102-…). */
const LITERAL_NEWLINE_IN_STRING_CODE = "theta/parse/literal-newline-in-string";
const LITERAL_NEWLINE_IN_STRING_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `theta/parse/literal-newline-in-string: literal newline in string literal` —
 * DIAG-4: the message half is read from the registry row, not copied,
 * mirroring this file's existing `incrementDecrementFragment` /
 * `nonArrayIterandFragment` / `emptySchemaBodyFragment` helpers. This code's
 * *Message* carries no `<placeholder>` (bug 0102 §Fix constraint 3 — the
 * *Message* column is unchanged, DIAG-4), so no substitution runs.
 */
function literalNewlineInStringFragment(): string {
  const template = registryMessage(
    LITERAL_NEWLINE_IN_STRING_REGISTRY,
    LITERAL_NEWLINE_IN_STRING_CODE,
  ) as string | undefined;
  expect(
    template,
    `${LITERAL_NEWLINE_IN_STRING_CODE} has no registry row — the code this cell ` +
      "asserts is not registered (DIAG-2)",
  ).toBeTypeOf("string");
  return `${LITERAL_NEWLINE_IN_STRING_CODE}: ${template as string}`;
}

/**
 * A `params:` theta with ONE declared `string` field whose default RHS is
 * `defaultRhs`, a resolvable `bind_model:` (a default disqualifies the
 * `single-string-bypass` shape — see the file-header note above — so the
 * field always routes to `binder` kind), and a pure-literal final value (no
 * query: registration is the only observable this cell reads, matching the
 * committed `acc-params-binder.theta` fixture's own bare `"ok"` body).
 */
function paramsDefaultTheta(defaultRhs: string): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    `  p: ${defaultRhs}`,
    "---",
    '"ok"',
    "",
  ].join("\n");
}

/**
 * The bug doc's own R3c spelling — a YAML block scalar whose physical break
 * lands inside the default's double-quoted string literal, recording the
 * default source `"a\nb"` (a raw LF between the quotes). Same `params:` /
 * `bind_model:` shape as `paramsDefaultTheta` above, so the only variable
 * between the broken theta and its `b102livegood` sibling is this break.
 */
function brokenParamsDefaultTheta(): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    "  p: |",
    '    string = "a',
    '    b"',
    "---",
    '"ok"',
    "",
  ].join("\n");
}

describe("H8a-T — bug 0102: a params: default's string literal carrying a raw newline does not register, live (Convention: live-host acceptance)", () => {
  it("does not register a caller whose params: default string literal carries a raw newline, while its same-shape sibling with a break-free default registers, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, the
      // refused theta's absence could be (wrongly) attributed to a broken
      // workspace instead of the check under test.
      { source: "project", stem: "b102livectl", text: promptTheta("THETA-LIVE-OK") },
      // The same-shape sibling: identical params:/bind_model: shape, a STRING
      // default carrying NO raw break — must still register, isolating the
      // refusal to the specific string-literal-newline predicate rather than
      // to "a defaulted params: field never registers in this harness".
      {
        source: "project",
        stem: "b102livegood",
        text: paramsDefaultTheta('string = "ok"'),
      },
      // The load-bearing caller: the SAME shape, but the default's string
      // literal carries a raw line break (the bug doc's R3c spelling).
      { source: "project", stem: "b102livebroken", text: brokenParamsDefaultTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b102livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the check under test, would explain the refused theta's absence too. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b102livegood"),
        "the same-shape sibling with a break-free string default did not " +
          "register — precondition unmet (a defaulted params: field cannot " +
          "register in this harness at all, independent of this bug). " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root
      // (not the offline parseThetaDocument harness the unit witness uses), a
      // params: default whose string literal carries a raw line break does not
      // register — theta/parse/literal-newline-in-string fires from the
      // parseParams per-field default loop at the SAME hasLoadParseError site
      // the bug 0070/0071/0077/0079(a)/0110/0084/0089/0095 cells above exercise
      // for their own codes.
      expect(
        handle.command("b102livebroken"),
        "the caller whose params: default string literal carries a raw line " +
          "break registered anyway through the live discovery/session_start " +
          "path — theta/parse/literal-newline-in-string did not fire. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b102livebroken");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager` rather
      // than off racy events: the diagnostic fires at LOAD time, before any
      // drive, so the full entry list is the delta (mirrors the bug 0110 /
      // 0084 / 0089 / 0095 cells above).
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = literalNewlineInStringFragment();
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the literal-newline-in-string " +
          "rejection for the broken params: default. Notes: " +
          JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0125 — `#typeExpr`'s `case "index"` arm
// (src/parser/static-type-inference.ts:245–250) narrowed an index read to the
// target's element type only when the target's RAW `CompatType` had
// `kind === "array"`, so a type-alias schema `schema L = array<string>` —
// whose `fn`-parameter record is the raw `named L` (`walkFn`,
// type-layer-checks.ts:1237) — fell to the sentinel `{ kind: "named", name:
// "index" }`, an unresolvable name every downstream check defers on
// (type-system.md:48). `theta/parse/unknown-method` (E-severity) is one of
// six registered codes measured absent on the sentinel; `hasLoadParseError`
// (production-composition.ts:3263–3270, applied at :3313) had nothing to act
// on, so the illegal caller REGISTERED
// (docs/bugs/0125-index-element-narrowing-not-alias-unfolded.md §Reproduction
// (a) row 1 / (e) row 1; unit witness `tests/index-element-alias-unfolded.test.ts`
// cell a1).
//
// THE DIRECTION IS THE INVERSE OF THE BUG 0089 CELL ABOVE. 0089's fix made a
// LEGAL theta (an alias-typed `for` iterand) stop being wrongly REFUSED —
// success there is registration. This fix makes an ILLEGAL theta (an
// alias-typed array's element, called past the stdlib's exposed surface) stop
// being wrongly ADMITTED — success here is NON-registration, with the erased
// `unknown-method` rejection reappearing on the theta-system-note channel
// instead of the illegal caller registering. This is also the polarity bug
// 0102's cell above exercises (a caller that must NOT register), mirrored here
// for this fix's own code route.
//
// No shipped live fixture (H8a, H9a, or the hardening probes) declares a
// type-alias schema over `array<T>` and indexes it on a `fn` parameter —
// confirmed statically over the whole tree (`rg -n '^schema \w+ = array<'
// tests/live/ docs/examples/` matches nothing before this addition) — so no
// existing live fixture had reach over this defect's route, mirroring the bug
// 0084/0089/0095 cells' own "no existing live fixture reaches this arm"
// findings.
//
// Registration-only: no slash command is invoked, so no model turn runs and
// the cell spends zero tokens, the same profile as the bug 0070/0071/0077/
// 0079(a)/0110/0084/0089/0095/0102 cells above. ADDITIVE ONLY: no existing
// cell in this file is weakened, reworded, reordered or deleted.
// ===========================================================================

/** `theta/parse/unknown-method`'s registered code and registry page. */
const UNKNOWN_METHOD_CODE = "theta/parse/unknown-method";
const UNKNOWN_METHOD_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `theta/parse/unknown-method: unknown method '<method>' on type <type>` with
 * `<method>` and `<type>` substituted — DIAG-4: the message half is read from
 * the registry row, not copied, mirroring this file's existing
 * `nonArrayIterandFragment` / `literalNewlineInStringFragment` helpers. Used
 * for the PRESENCE assertion below: post-fix, the illegal caller's refusal
 * must name this fragment on the theta-system-note channel.
 */
function unknownMethodFragment(method: string, type: string): string {
  const template = registryMessage(
    UNKNOWN_METHOD_REGISTRY,
    UNKNOWN_METHOD_CODE,
  ) as string | undefined;
  expect(
    template,
    `${UNKNOWN_METHOD_CODE} has no registry row — the code this cell ` +
      "asserts is not registered (DIAG-2)",
  ).toBeTypeOf("string");
  const message = (template as string)
    .replaceAll("<method>", method)
    .replaceAll("<type>", type);
  expect(
    message,
    `${UNKNOWN_METHOD_CODE}: an unsubstituted <…> placeholder remains — ` +
      "the registry row's Message template changed shape and this cell's " +
      "substitution is stale",
  ).not.toMatch(/<[a-z]+>/);
  return `${UNKNOWN_METHOD_CODE}: ${message}`;
}

/**
 * The bug doc's §Reproduction (a) row 1 — the load-bearing illegal caller: a
 * type-alias schema over `array<string>`, an `fn` parameter declared with it,
 * an index read bound to a `let`, and a method call the theta 1.0 stdlib does
 * not expose on the unfolded element type `string`
 * (docs/bugs/0125-index-element-narrowing-not-alias-unfolded.md §Reproduction
 * (a) row 1 / `tests/index-element-alias-unfolded.test.ts` cell a1's
 * production-parser shape, replayed here through the real
 * discovery→registration path instead of the offline harness). The trailing
 * `1` supplies the theta's final value — no `@`-query is needed for a
 * prompt-mode theta to register, matching the bug 0089 cell's own
 * `aliasIterandTheta` above.
 */
function illegalAliasIndexTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "schema L = array<string>",
    "fn f(xs: L) {",
    "  let y = xs[0]",
    "  y.frobnicate()",
    "}",
    "1",
    "",
  ].join("\n");
}

/**
 * The same-shape SIBLING with a legal body — the bug doc's §Fix's own
 * anti-over-rejection bound, and the unit witness's `x2` control
 * (tests/index-element-alias-runtime-disposition.test.ts): the same
 * alias-typed `array<string>` `fn` parameter, the same index read, but no
 * call on the element — so this caller must register both before and after
 * the fix. Isolates the illegal caller's refusal to the `.frobnicate()`
 * misuse rather than to "an alias-typed array `fn` parameter never registers
 * in this harness".
 */
function legalAliasIndexTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "schema L = array<string>",
    "fn f(xs: L): string {",
    "  xs[0]",
    "}",
    "1",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0125: an alias-typed array's element, called past the stdlib surface, does not register, live (Convention: live-host acceptance)", () => {
  it("does not register a caller whose alias-typed array fn parameter calls an unexposed method on its element, while its same-shape defect-free sibling registers, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, the
      // illegal caller's absence could be (wrongly) attributed to a broken
      // workspace instead of the gate under test.
      { source: "project", stem: "b125livectl", text: promptTheta("THETA-LIVE-OK") },
      // The same-shape sibling: identical alias-typed array `fn` parameter and
      // index read, but a LEGAL body — must still register, isolating the
      // refusal to the unexposed-method call rather than to "an alias-typed
      // array `fn` parameter never registers in this harness".
      { source: "project", stem: "b125livegood", text: legalAliasIndexTheta() },
      // The load-bearing illegal caller: the SAME alias-typed array parameter,
      // but the index read's element calls a method the theta 1.0 stdlib does
      // not expose (the bug doc's §Reproduction (a) row 1 spelling).
      { source: "project", stem: "b125livebroken", text: illegalAliasIndexTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b125livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the gate under test, would explain the illegal caller's absence too. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b125livegood"),
        "the same-shape sibling with a legal body did not register — an " +
          "alias-typed array fn parameter cannot register in this harness at " +
          "all, independent of this bug. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root
      // (not the offline parseThetaDocument harness the unit witness uses), an
      // alias-typed array `fn` parameter whose element calls an unexposed
      // stdlib method does NOT register — `unfoldAlias` (type-compat.ts) makes
      // `#typeExpr`'s `case "index"` arm see `L` as `array<string>`, so the
      // element narrows to `string` and `theta/parse/unknown-method` fires,
      // and `hasLoadParseError` un-registers this caller at the SAME site the
      // bug 0070/0071/0077/0079(a)/0110/0084/0089/0095/0102 cells above
      // exercise for their own codes.
      expect(
        handle.command("b125livebroken"),
        "the caller whose alias-typed array element calls an unexposed stdlib " +
          "method registered anyway through the live discovery/session_start " +
          "path — theta/parse/unknown-method did not fire on the unfolded " +
          "element type. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b125livebroken");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager` rather
      // than off racy events: the diagnostic fires at LOAD time, before any
      // drive, so the full entry list is the delta (mirrors the bug 0110 /
      // 0084 / 0089 / 0095 / 0102 cells above).
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = unknownMethodFragment("frobnicate", "string");
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the unknown-method rejection for the " +
          "illegal alias-typed caller's element. Notes: " +
          JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0050 — `theta/parse/fn-arg-type-mismatch` was registered with a Trigger
// no input could satisfy: its sole emitter, `checkFnArgCompat`
// (src/parser/type-compat.ts:452), had no caller in `src/`, so a plain
// top-level `fn` call bound a mistyped argument with no parse-time judgement
// (docs/bugs/0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md).
// The fix (disposition 1) wires one call at `TypeLayerWalk.walkExpr`'s `call`
// arm (src/parser/type-layer-checks.ts), split from the `invoke` label it
// previously shared, with an in-layer soundness discipline
// (`provableArgType` / `isProvenReduction`) and a withheld-binder channel
// (`recordWithheldBinders` / `containsWithheldBinderType`) so a statically
// ERASED or otherwise unjudgeable read is never trusted. The 84-cell unit
// witness (tests/fn-arg-type-mismatch-wired.test.ts) proves the mechanism
// offline at the `parseThetaDocument` boundary; this cell proves the same
// registered code denies REGISTRATION end to end through the real production
// composition root (session_start → resources_discover →
// composeExtensionInstance → checkTypeLayer) — the fixed path had zero live
// coverage before this addition.
//
// The mistyped caller mirrors the bug doc's §Reproduction row r3 and the unit
// witness's cell r3 verbatim (`fn g(s: string): number { 1 }` +
// `let r = g(3)`): a same-file plain `fn` call, both operands statically
// resolvable, an `integer` argument at a declared `string` parameter — the
// simplest input the row's Trigger names. `theta/parse/fn-arg-type-mismatch`
// is severity `E`, so `hasLoadParseError`
// (production-composition.ts:3263–3270, applied at :3313) un-registers the
// caller at the SAME site the bug 0070/0071/0077/0079(a)/0110/0084/0089/0095/
// 0102/0125 cells above exercise for their own codes.
//
// Registration-only: no slash command is invoked, so no model turn runs and
// the cell spends zero tokens (the same profile the file header claims for
// the discovery→registration cells above). ADDITIVE ONLY: no existing cell in
// this file is weakened, reworded, reordered or deleted.
// ===========================================================================

const FN_ARG_TYPE_MISMATCH_CODE = "theta/parse/fn-arg-type-mismatch";

/** The sharded registry page carrying `theta/parse/fn-arg-type-mismatch`'s row (`:116`). */
const FN_ARG_TYPE_MISMATCH_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `theta/parse/fn-arg-type-mismatch: fn '<name>' argument <i> ('<param>') type
 * mismatch: expected <expected>, got <actual>` with every `<…>` substituted —
 * DIAG-4: the message half is read from the registry row, not copied,
 * mirroring this file's existing `unknownMethodFragment` /
 * `nonArrayIterandFragment` helpers. Used for the PRESENCE assertion below:
 * the illegal caller's refusal must name this fragment on the
 * theta-system-note channel.
 */
function fnArgTypeMismatchFragment(
  fnName: string,
  index: number,
  paramName: string,
  expected: string,
  actual: string,
): string {
  const template = registryMessage(
    FN_ARG_TYPE_MISMATCH_REGISTRY,
    FN_ARG_TYPE_MISMATCH_CODE,
  ) as string | undefined;
  expect(
    template,
    `${FN_ARG_TYPE_MISMATCH_CODE} has no registry row — the code this cell ` +
      "asserts is not registered (DIAG-2)",
  ).toBeTypeOf("string");
  const message = (template as string)
    .replaceAll("<name>", fnName)
    .replaceAll("<i>", String(index))
    .replaceAll("<param>", paramName)
    .replaceAll("<expected>", expected)
    .replaceAll("<actual>", actual);
  expect(
    message,
    `${FN_ARG_TYPE_MISMATCH_CODE}: an unsubstituted <…> placeholder remains — ` +
      "the registry row's Message template changed shape and this cell's " +
      "substitution is stale",
  ).not.toMatch(/<[a-z]+>/);
  return `${FN_ARG_TYPE_MISMATCH_CODE}: ${message}`;
}

/**
 * The bug doc's §Reproduction row r3 / the unit witness's cell r3 — the
 * load-bearing illegal caller: a same-file plain top-level `fn` declaring a
 * `string` parameter, called with an `integer` literal — both operands
 * statically resolvable, so type-system.md:48 licenses no deferral. The
 * trailing `r` supplies the theta's final value; no `@`-query is needed for a
 * prompt-mode theta to register (mirrors bug 0125's `illegalAliasIndexTheta`
 * above).
 */
function illegalFnArgTheta(): string {
  return ["---", "mode: prompt", "---", "fn g(s: string): number { 1 }", "let r = g(3)", "r", ""].join(
    "\n",
  );
}

/**
 * The same-shape SIBLING with a compatible argument — must register both
 * before and after the fix, isolating the illegal caller's refusal to the
 * `integer`-under-`string` mismatch rather than to "a plain `fn` call with an
 * annotated parameter never registers in this harness".
 */
function legalFnArgTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "fn g(s: string): number { 1 }",
    'let r = g("ok")',
    "r",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0050: a plain fn call's provably mistyped argument does not register, live (Convention: live-host acceptance)", () => {
  it("does not register a caller whose same-file fn call passes a provably mistyped argument, while its compatible-argument sibling registers, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, the
      // illegal caller's absence could be (wrongly) attributed to a broken
      // workspace instead of the gate under test.
      { source: "project", stem: "b50livectl", text: promptTheta("THETA-LIVE-OK") },
      // The same-shape sibling: identical annotated-parameter `fn` and call
      // shape, but a compatible argument — must still register, isolating the
      // refusal to the type mismatch rather than to "a plain `fn` call with an
      // annotated parameter never registers in this harness".
      { source: "project", stem: "b50livegood", text: legalFnArgTheta() },
      // The load-bearing illegal caller: the SAME annotated parameter, but an
      // argument whose static type the parser can prove incompatible (the bug
      // doc's §Reproduction row r3 / unit witness cell r3 spelling).
      { source: "project", stem: "b50livebroken", text: illegalFnArgTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b50livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the gate under test, would explain the illegal caller's absence too. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b50livegood"),
        "the same-shape sibling with a compatible argument did not register — " +
          "a plain fn call with an annotated parameter cannot register in this " +
          "harness at all, independent of this bug. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root
      // (not the offline `parseThetaDocument` harness the unit witness uses),
      // a same-file plain `fn` call whose argument is provably incompatible
      // with the declared parameter type does NOT register —
      // `checkFnCallArgs` (type-layer-checks.ts) fires
      // `theta/parse/fn-arg-type-mismatch`, and `hasLoadParseError`
      // un-registers this caller at the SAME site the bug 0070/0071/0077/
      // 0079(a)/0110/0084/0089/0095/0102/0125 cells above exercise for their
      // own codes.
      expect(
        handle.command("b50livebroken"),
        "the caller whose fn call passes a provably mistyped argument " +
          "registered anyway through the live discovery/session_start path — " +
          "theta/parse/fn-arg-type-mismatch did not fire. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b50livebroken");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager` rather
      // than off racy events: the diagnostic fires at LOAD time, before any
      // drive, so the full entry list is the delta (mirrors the bug 0110/
      // 0084/0089/0095/0102/0125 cells above).
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = fnArgTypeMismatchFragment("g", 0, "s", "string", "integer");
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the fn-arg-type-mismatch rejection " +
          "for the illegal caller. Notes: " + JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0137 — `theta/parse/invoke-arg-type-mismatch` was registered with a
// Trigger no literal `invoke(...)` input could satisfy: its sole emitter,
// `checkInvokeArgTypes`, is reached only from `checkInvokeCall`, and
// `checkInvokeCall` had no caller anywhere in `src/` — the invoke-literal arm
// of `checkInvokeStaticResolution` called `checkInvokeArity` directly and
// moved to the next call site, never reaching the per-argument type check
// (docs/bugs/0137-invoke-arg-type-mismatch-unreachable.md). This is the
// invoke-row twin of the fix immediately above: bug 0050 wired the sibling
// `fn`-call row and deliberately left `invoke` split out by name.
//
// The fix wires `checkInvokeCall` itself (arity first, early return on an
// arity diagnostic, then the per-argument type check) onto the
// invoke-literal loop's already-resolved callee shape, reusing the adjacent
// `.theta`-callable arm's soundness mechanisms unchanged: the callee's
// verbatim `params:` type source, an EMPTY callee-annotation `TypeEnv` so a
// caller-local homonym cannot decide a verdict about the callee's contract,
// and `collectProvableArgTypes` with emission gated on every value the
// argument can take being provably incompatible (invocation.md §"Argument
// binding"; type-system.md TYPE-10). The 40-cell offline witness
// (tests/invoke-arg-type-mismatch-wired.test.ts) proves the mechanism at the
// `discoverAndComposeFixtures` boundary; this cell proves the SAME registered
// code denies REGISTRATION end to end through the real production
// composition root (session_start → resources_discover →
// composeExtensionInstance → checkInvokeStaticResolution) — the fixed path
// had zero live coverage before this addition, mirroring the bug 0050 cell
// immediately above for the sibling row.
//
// The illegal caller is a literal `invoke("./<callee>.theta", 1)` against a
// `mode: subagent` callee declaring `params: x: string` — the bug doc's
// §Reproduction row a1 verbatim. The `string` param keeps the callee on
// `classifyBinderBypass`'s `single-string-bypass` arm, so the callee loads
// and registers on its own merits, independent of either caller's argument;
// a non-`string` param would route it through the binder instead and
// confound the cell with `theta/load/binder-model-unresolved`.
//
// Registration-only: no slash command is invoked, so no model turn runs and
// the cell spends zero tokens (the same profile the bug 0050 cell immediately
// above claims). ADDITIVE ONLY: no existing cell in this file is weakened,
// reworded, reordered or deleted.
// ===========================================================================

const INVOKE_ARG_TYPE_MISMATCH_CODE = "theta/parse/invoke-arg-type-mismatch";

/** The sharded registry page carrying `theta/parse/invoke-arg-type-mismatch`'s row. */
const INVOKE_ARG_TYPE_MISMATCH_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `theta/parse/invoke-arg-type-mismatch: invoke argument <i> ('<param>') type
 * mismatch: expected <expected>, got <actual>` with every `<…>` substituted —
 * DIAG-4: the message half is read from the registry row, not copied,
 * mirroring this file's `fnArgTypeMismatchFragment` immediately above. Unlike
 * the `fn` and `tool` sibling rows, this row's Message carries no `<name>` —
 * it names neither caller nor callee. Used for the PRESENCE assertion below:
 * the illegal caller's refusal must name this fragment on the
 * theta-system-note channel.
 */
function invokeArgTypeMismatchFragment(
  index: number,
  paramName: string,
  expected: string,
  actual: string,
): string {
  const template = registryMessage(
    INVOKE_ARG_TYPE_MISMATCH_REGISTRY,
    INVOKE_ARG_TYPE_MISMATCH_CODE,
  ) as string | undefined;
  expect(
    template,
    `${INVOKE_ARG_TYPE_MISMATCH_CODE} has no registry row — the code this ` +
      "cell asserts is not registered (DIAG-2)",
  ).toBeTypeOf("string");
  const message = (template as string)
    .replaceAll("<i>", String(index))
    .replaceAll("<param>", paramName)
    .replaceAll("<expected>", expected)
    .replaceAll("<actual>", actual);
  expect(
    message,
    `${INVOKE_ARG_TYPE_MISMATCH_CODE}: an unsubstituted <…> placeholder ` +
      "remains — the registry row's Message template changed shape and " +
      "this cell's substitution is stale",
  ).not.toMatch(/<[a-z]+>/);
  return `${INVOKE_ARG_TYPE_MISMATCH_CODE}: ${message}`;
}

/**
 * The `mode: subagent` callee both callers below name in a literal
 * `invoke(...)`: one declared `params:` field of type `string`, which keeps
 * `classifyBinderBypass` on the `single-string-bypass` arm, so registering it
 * needs no binder model resolution and is independent of either caller's
 * argument.
 */
function invokeArgCalleeTheta(): string {
  return ["---", "mode: subagent", "params:", "  x: string", "---", "@`hi`", ""].join(
    "\n",
  );
}

/**
 * The bug doc's §Reproduction row a1 verbatim: a literal `invoke(...)` against
 * the callee above, passing an integer literal at slot 0 where the callee's
 * sole `params:` field declares `string`.
 */
function illegalInvokeArgTheta(): string {
  return [
    "---",
    "mode: subagent",
    "---",
    'invoke("./b137livecallee.theta", 1)?',
    "@`hi`",
    "",
  ].join("\n");
}

/**
 * The same-shape SIBLING with a compatible argument — must register both
 * before and after the fix, isolating the illegal caller's refusal to the
 * `integer`-under-`string` mismatch rather than to "a literal `invoke(...)`
 * call never registers in this harness".
 */
function legalInvokeArgTheta(): string {
  return [
    "---",
    "mode: subagent",
    "---",
    'invoke("./b137livecallee.theta", "ok")?',
    "@`hi`",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0137: a literal invoke(...) call's provably mistyped argument does not register, live (Convention: live-host acceptance)", () => {
  it("does not register a caller whose literal invoke(...) call passes a provably mistyped argument, while its compatible-argument sibling and its callee both register, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, the
      // illegal caller's absence could be (wrongly) attributed to a broken
      // workspace instead of the gate under test.
      { source: "project", stem: "b137livectl", text: promptTheta("THETA-LIVE-OK") },
      // The resolvable callee: single-string-bypass, so it registers on its
      // own merits regardless of either caller's argument.
      { source: "project", stem: "b137livecallee", text: invokeArgCalleeTheta() },
      // The same-shape sibling: identical literal `invoke(...)` call at the
      // same callee, but a compatible argument — must still register,
      // isolating the illegal caller's refusal to the mistype rather than to
      // "a literal invoke(...) call never registers in this harness".
      { source: "project", stem: "b137livegood", text: legalInvokeArgTheta() },
      // The load-bearing illegal caller: the SAME callee, but an integer
      // argument at a declared `string` param (the bug doc's §Reproduction
      // row a1 spelling).
      { source: "project", stem: "b137livebroken", text: illegalInvokeArgTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b137livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the gate under test, would explain the illegal caller's absence too. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b137livecallee"),
        "the callee did not register — a single-string-bypass params: field " +
          "should need no binder model resolution. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b137livegood"),
        "the same-shape sibling with a compatible argument did not register — " +
          "a literal invoke(...) call cannot register in this harness at all, " +
          "independent of this bug. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root
      // (not the offline `discoverAndComposeFixtures` harness the unit
      // witness uses), a literal `invoke(...)` call whose argument is provably
      // incompatible with the callee's declared parameter type does NOT
      // register — `checkInvokeStaticResolution`'s invoke-literal arm fires
      // `theta/parse/invoke-arg-type-mismatch`, and `hasLoadParseError`
      // un-registers this caller at the SAME site the bug 0070/0071/0077/
      // 0079(a)/0110/0084/0089/0095/0102/0125/0050 cells above exercise for
      // their own codes.
      expect(
        handle.command("b137livebroken"),
        "the caller whose literal invoke(...) call passes a provably mistyped " +
          "argument registered anyway through the live discovery/session_start " +
          "path — theta/parse/invoke-arg-type-mismatch did not fire. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b137livebroken");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager` rather
      // than off racy events: the diagnostic fires at LOAD time, before any
      // drive, so the full entry list is the delta (mirrors the bug 0110/
      // 0084/0089/0095/0102/0125/0050 cells above).
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = invokeArgTypeMismatchFragment(0, "x", "string", "integer");
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the invoke-arg-type-mismatch " +
          "rejection for the illegal caller. Notes: " + JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0139 — `docs/spec_topics/lexical.md:16` requires a lowercase-first `fn`
// PARAMETER name and `code-registry-parse.md:19`'s Trigger already names the
// parameter position, but the sole enforcer, `contextualDiagnostics`
// (`src/lexer/lexer.ts`), reaches only the `let` / `let mut`, `fn`-NAME and
// `schema`/`enum`-NAME positions through its keyword-adjacency dispatch (its
// `let` / `fn` / `schema` / `enum` branches, same function) — a parameter name
// follows `(` or `,`, not a keyword, so no call reaches it, and `parseFn`'s
// parameter loop (src/parser/theta-document.ts:2151) took the name token and
// dropped everything but its `.text`
// (docs/bugs/0139-fn-parameter-name-case-rule-unenforced.md). `fn h(P: string):
// number { 1 }` loaded with zero diagnostics and registered.
//
// The fix captures the parameter-name TOKEN rather than its bare text and
// tests its first character against the same `[A-Z]` predicate `checkName`'s
// binding arm already uses, pushing `theta/parse/binding-case-mismatch`
// (severity `error`, ranged on the parameter-name token) when it matches.
// `hasLoadParseError` (production-composition.ts) then un-registers the
// declaring theta at the SAME site the bug 0070/0071/0077/0079(a)/0110/0084/
// 0089/0095/0102/0125/0050/0137 cells above exercise for their own codes.
//
// No shipped live fixture (H8a in this file, the H9a acceptance fixtures, or
// the hardening probes) declares an uppercase-first `fn` parameter anywhere
// before this cell — confirmed statically:
// `grep -rnoE 'fn [A-Za-z_][A-Za-z0-9_]*\([^)]*\)' tests/live/` returns every
// `fn` declaration under this directory (inline theta-source string literals
// included) and each one's parameter is lowercase-first or the list is empty
// (`ask()`, `mk()`, `tagline()`, `f(xs: L)`, `g(s: string)`,
// `bump(n: integer)`, `work(n: integer)`) — so no existing live fixture had
// reach over this gate at all, mirroring the bug 0084/0089 cells' own "no
// existing live fixture reaches this arm" finding for their own constructs.
//
// Three thetas isolate the refusal to the CASE of the parameter specifically,
// not to "a theta declaring a `fn` never registers here": `b139livectl` (an
// ordinary query-only control, proving the workspace and discovery walk both
// work), `b139livegood` (the SAME `fn`, parameter spelled lowercase — must
// register), and `b139livebroken` (the bug doc's own §Reproduction row a1
// spelling, `fn h(P: string): number { 1 }` — must NOT register). No call is
// needed: the diagnostic fires on the DECLARATION's parameter-name token at
// parse time, before any statement runs (bug 0139 §Reproduction (a3): "a call
// site adds nothing").
//
// Registration-only: no slash command is invoked, so no model turn runs and
// the cell spends zero tokens, the same profile as the bug 0084/0089/0102/
// 0125/0050/0137 cells above. ADDITIVE ONLY: no existing cell in this file is
// weakened, reworded, reordered or deleted.
// ===========================================================================

/** `theta/parse/binding-case-mismatch`'s registered code and registry page. */
const BINDING_CASE_MISMATCH_CODE = "theta/parse/binding-case-mismatch";
const BINDING_CASE_MISMATCH_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `theta/parse/binding-case-mismatch: binding name must start with a
 * lowercase letter or _` — DIAG-4: the message half is read from the
 * registry row, not copied, mirroring this file's existing
 * `incrementDecrementFragment` / `invokePathEscapeFragment` helpers; the code
 * prefix mirrors `renderDiagnosticLine`'s `${code}: ${message}` join
 * (src/diagnostics/diagnostic.ts), which is what the theta-system-note
 * content this cell asserts against actually carries. Unlike this file's
 * type-mismatch fragment helpers the row carries no `<…>` placeholder, so
 * this helper substitutes nothing; the trailing assertion is a drift guard —
 * a future reworded row that introduces a placeholder reds here — rather
 * than a fill check.
 */
function bindingCaseMismatchFragment(): string {
  const template = registryMessage(
    BINDING_CASE_MISMATCH_REGISTRY,
    BINDING_CASE_MISMATCH_CODE,
  ) as string | undefined;
  expect(
    template,
    `${BINDING_CASE_MISMATCH_CODE} has no registry row — the code this cell ` +
      "asserts is not registered (DIAG-2)",
  ).toBeTypeOf("string");
  const message = template as string;
  expect(
    message,
    `${BINDING_CASE_MISMATCH_CODE}: the registry row's Message template grew ` +
      "an unsubstituted <…> placeholder this reader does not fill — the row " +
      "changed shape",
  ).not.toMatch(/<[a-z]+>/);
  return `${BINDING_CASE_MISMATCH_CODE}: ${message}`;
}

/**
 * The bug doc's own §Reproduction row a1
 * (docs/bugs/0139-fn-parameter-name-case-rule-unenforced.md) verbatim: a
 * top-level `fn` whose sole parameter is spelled uppercase-first. The
 * trailing `1` supplies the theta's final value — FN-4 makes an empty tail
 * legal on its own, but every other bare-`fn`-declaration fixture in this
 * file supplies an explicit tail (mirrors bug 0089's `aliasIterandTheta`
 * above).
 */
function illegalFnParamCaseTheta(): string {
  return ["---", "mode: prompt", "---", "fn h(P: string): number { 1 }", "1", ""].join(
    "\n",
  );
}

/**
 * The same-shape SIBLING with the SAME `fn`, differing only in the
 * parameter's own case — must still register, isolating the broken theta's
 * refusal to the uppercase spelling rather than to "a theta declaring a `fn`
 * never registers in this harness at all".
 */
function legalFnParamCaseTheta(): string {
  return ["---", "mode: prompt", "---", "fn h(p: string): number { 1 }", "1", ""].join(
    "\n",
  );
}

describe("H8a-T — bug 0139: an uppercase-first fn parameter name draws binding-case-mismatch and does not register, live (Convention: live-host acceptance)", () => {
  it("does not register a theta whose fn parameter name starts uppercase, while its lowercase-parameter sibling and an unrelated control both register, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, the
      // broken theta's absence could be (wrongly) attributed to a broken
      // workspace instead of the case rule under test.
      { source: "project", stem: "b139livectl", text: promptTheta("THETA-LIVE-OK") },
      // The same-shape sibling: the SAME fn declaration, parameter spelled
      // lowercase — must still register, isolating the refusal to the case
      // rule rather than to "a theta declaring a fn never registers here".
      { source: "project", stem: "b139livegood", text: legalFnParamCaseTheta() },
      // The load-bearing broken theta: the bug doc's own §Reproduction row a1
      // spelling.
      { source: "project", stem: "b139livebroken", text: illegalFnParamCaseTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b139livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the case rule under test, would explain the broken theta's absence " +
          "too. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b139livegood"),
        "the same fn with a lowercase parameter did not register — a theta " +
          "declaring a fn cannot register in this harness at all, independent " +
          "of this bug. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root
      // (not the offline parseThetaDocument harness the unit witness uses), a
      // theta declaring an uppercase-first fn parameter does NOT register —
      // parseFn's parameter loop (src/parser/theta-document.ts) fires
      // theta/parse/binding-case-mismatch, and hasLoadParseError un-registers
      // this theta at the SAME site the bug 0070/0071/0077/0079(a)/0110/0084/
      // 0089/0095/0102/0125/0050/0137 cells above exercise for their own
      // codes.
      expect(
        handle.command("b139livebroken"),
        "the theta whose fn parameter name starts uppercase registered anyway " +
          "through the live discovery/session_start path — " +
          "theta/parse/binding-case-mismatch did not fire. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b139livebroken");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager` rather
      // than off racy events: the diagnostic fires at LOAD time, before any
      // drive, so the full entry list is the delta (mirrors the bug 0110/
      // 0084/0089/0095/0102/0125/0050/0137 cells above).
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = bindingCaseMismatchFragment();
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the binding-case-mismatch rejection " +
          "for the broken theta. Notes: " + JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0142 — `#typeBinary`'s arithmetic arm (src/parser/static-type-inference.ts)
// reduced `/`'s two operands to their common type with no per-operator rule, so
// a same-`integer` pair read `integer` against expressions.md §"Other
// arithmetic" (`/` always produces `number`) (docs/bugs/0142-division-result-type-not-number.md).
// The fix adds one per-operator arm ahead of the common-type reduction; the
// 43-cell unit witness (tests/division-result-type-number.test.ts) proves the
// mechanism offline at the `parseThetaDocument` boundary. This cell proves the
// same registered code denies REGISTRATION end to end through the real
// production composition root (session_start → resources_discover →
// composeExtensionInstance → checkTypeLayer) — the fixed path had zero live
// coverage before this addition.
//
// The broken caller mirrors the bug doc's own §Reproduction row b1 verbatim
// (`let n: integer = 3 / 2`): a typed `let` narrowing a `/` quotient of two
// `integer` literals to an `integer` annotation — both operands statically
// resolvable, so type-system.md:48 licenses no deferral.
// `theta/parse/integer-narrowing` is severity `E`, so `hasLoadParseError`
// (production-composition.ts:3263–3270, applied at :3313) un-registers the
// caller at the SAME site the bug 0070/0071/0077/0079(a)/0110/0084/0089/0095/
// 0102/0125/0050/0137/0139 cells above exercise for their own codes.
//
// Registration-only: no slash command is invoked, so no model turn runs and
// the cell spends zero tokens (the same profile the file header claims for the
// discovery→registration cells above). ADDITIVE ONLY: no existing cell in this
// file is weakened, reworded, reordered or deleted.
// ===========================================================================

const INTEGER_NARROWING_CODE = "theta/parse/integer-narrowing";

/** The sharded registry page carrying `theta/parse/integer-narrowing`'s row (`:24`). */
const INTEGER_NARROWING_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `theta/parse/integer-narrowing: cannot narrow number to integer` — DIAG-4:
 * the message half is read from the registry row, not copied, mirroring this
 * file's `bindingCaseMismatchFragment`. The row carries no `<…>` placeholder,
 * so this helper substitutes nothing; the trailing assertion is a drift
 * guard — a future reworded row that introduces a placeholder reds here —
 * rather than a fill check.
 */
function integerNarrowingFragment(): string {
  const template = registryMessage(
    INTEGER_NARROWING_REGISTRY,
    INTEGER_NARROWING_CODE,
  ) as string | undefined;
  expect(
    template,
    `${INTEGER_NARROWING_CODE} has no registry row — the code this cell ` +
      "asserts is not registered (DIAG-2)",
  ).toBeTypeOf("string");
  const message = template as string;
  expect(
    message,
    `${INTEGER_NARROWING_CODE}: the registry row's Message template grew ` +
      "an unsubstituted <…> placeholder this reader does not fill — the row " +
      "changed shape",
  ).not.toMatch(/<[a-z]+>/);
  return `${INTEGER_NARROWING_CODE}: ${message}`;
}

/**
 * The bug doc's own §Reproduction row b1
 * (docs/bugs/0142-division-result-type-not-number.md) verbatim: a typed `let`
 * binding a `/` quotient of two `integer` literals to an `integer`
 * annotation. Before the fix `#typeBinary`'s arithmetic arm reduced the
 * operands to their common type (`integer`), so `checkLetRhsCompat` read
 * `compatible` and this theta loaded clean while the runtime bound `1.5`
 * (§Reproduction (h), cell h2).
 */
function divisionIntegerNarrowingTheta(): string {
  return ["---", "mode: prompt", "---", "let n: integer = 3 / 2", "n", ""].join(
    "\n",
  );
}

/**
 * The same-shape SIBLING with the SAME `/` quotient, annotation spelled
 * `number` — must still register, isolating the broken theta's refusal to
 * the `integer` annotation rather than to "a theta binding a `/` result never
 * registers here".
 */
function divisionNumberTheta(): string {
  return ["---", "mode: prompt", "---", "let n: number = 3 / 2", "n", ""].join(
    "\n",
  );
}

describe("H8a-T — bug 0142: a `/` quotient bound to an `integer` annotation draws integer-narrowing and does not register, live (Convention: live-host acceptance)", () => {
  it("does not register a theta whose typed `let` narrows a `/` quotient to `integer`, while its `number`-annotated sibling and an unrelated control both register, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, the
      // broken theta's absence could be (wrongly) attributed to a broken
      // workspace instead of the `/`-result-type rule under test.
      { source: "project", stem: "b142livectl", text: promptTheta("THETA-LIVE-OK") },
      // The same-shape sibling: the SAME `/` quotient, annotation spelled
      // `number` — must still register, isolating the refusal to the
      // `integer` annotation rather than to "a theta binding a `/` result
      // never registers here".
      { source: "project", stem: "b142livegood", text: divisionNumberTheta() },
      // The load-bearing broken theta: the bug doc's own §Reproduction row b1
      // spelling.
      { source: "project", stem: "b142livebroken", text: divisionIntegerNarrowingTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b142livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the `/`-result-type rule under test, would explain the broken " +
          "theta's absence too. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b142livegood"),
        "the same `/` quotient under a `number` annotation did not register " +
          "— a theta binding a `/` result cannot register in this harness at " +
          "all, independent of this bug. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root
      // (not the offline parseThetaDocument harness the unit witness uses), a
      // theta narrowing a `/` quotient to `integer` does NOT register —
      // `#typeBinary`'s `/` arm (src/parser/static-type-inference.ts) now
      // reads `number`, `checkLetRhsCompat` (src/parser/type-compat.ts) draws
      // theta/parse/integer-narrowing, and hasLoadParseError un-registers
      // this theta at the SAME site the bug 0070/0071/0077/0079(a)/0110/0084/
      // 0089/0095/0102/0125/0050/0137/0139 cells above exercise for their own
      // codes.
      expect(
        handle.command("b142livebroken"),
        "the theta whose typed `let` narrows a `/` quotient to `integer` " +
          "registered anyway through the live discovery/session_start path — " +
          "theta/parse/integer-narrowing did not fire. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b142livebroken");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager` rather
      // than off racy events: the diagnostic fires at LOAD time, before any
      // drive, so the full entry list is the delta (mirrors the bug 0110/
      // 0084/0089/0095/0102/0125/0050/0137/0139 cells above).
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = integerNarrowingFragment();
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the integer-narrowing rejection " +
          "for the broken theta. Notes: " + JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

/**
 * The bug doc's own §Reproduction row a1
 * (docs/bugs/0152-modulo-zero-result-type-not-number.md) verbatim: a typed
 * `let` binding a `%` remainder of an `integer` literal by a static-zero
 * `integer` literal divisor to an `integer` annotation. `#typeBinary`'s `%`
 * arm (src/parser/static-type-inference.ts) reads
 * `isStaticZeroIntegerDivisor` on the divisor and returns `number`, so
 * `checkLetRhsCompat` reads the same mismatch bug 0142's `/` arm produces and
 * draws `theta/parse/integer-narrowing` — the shared code, not a new one.
 */
function moduloZeroIntegerNarrowingTheta(): string {
  return ["---", "mode: prompt", "---", "let n: integer = 1 % 0", "n", ""].join(
    "\n",
  );
}

/**
 * The same-shape SIBLING with the SAME `1 % 0` remainder, annotation spelled
 * `number` — must still register, isolating the broken theta's refusal to
 * the `integer` annotation rather than to "a theta binding a `%` result never
 * registers here".
 */
function moduloZeroNumberTheta(): string {
  return ["---", "mode: prompt", "---", "let n: number = 1 % 0", "n", ""].join(
    "\n",
  );
}

describe("H8a-T — bug 0152: a `%` remainder by a static-zero integer divisor bound to an `integer` annotation draws integer-narrowing and does not register, live (Convention: live-host acceptance) (cell 87)", () => {
  it("does not register a theta whose typed `let` narrows a `%`-by-static-zero remainder to `integer`, while its `number`-annotated sibling and an unrelated control both register, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, the
      // broken theta's absence could be (wrongly) attributed to a broken
      // workspace instead of the `%`-by-static-zero rule under test.
      { source: "project", stem: "b152livectl", text: promptTheta("THETA-LIVE-OK") },
      // The same-shape sibling: the SAME `1 % 0` remainder, annotation spelled
      // `number` — must still register, isolating the refusal to the
      // `integer` annotation rather than to "a theta binding a `%` result
      // never registers here".
      { source: "project", stem: "b152livegood", text: moduloZeroNumberTheta() },
      // The load-bearing broken theta: the bug doc's own §Reproduction row a1
      // spelling.
      { source: "project", stem: "b152livebroken", text: moduloZeroIntegerNarrowingTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b152livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the `%`-by-static-zero rule under test, would explain the broken " +
          "theta's absence too. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b152livegood"),
        "the same `1 % 0` remainder under a `number` annotation did not " +
          "register — a theta binding a `%` result cannot register in this " +
          "harness at all, independent of this bug. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root
      // (not the offline parseThetaDocument harness the unit witness uses), a
      // theta narrowing a `%`-by-static-zero remainder to `integer` does NOT
      // register — `#typeBinary`'s `%` arm (src/parser/static-type-inference.ts)
      // now reads `number` for a static-zero `integer` divisor,
      // `checkLetRhsCompat` (src/parser/type-compat.ts) draws
      // theta/parse/integer-narrowing, and hasLoadParseError un-registers this
      // theta at the SAME site the bug 0070/0071/0077/0079(a)/0110/0084/0089/
      // 0095/0102/0125/0050/0137/0139/0142 cells above exercise for their own
      // codes.
      expect(
        handle.command("b152livebroken"),
        "the theta whose typed `let` narrows a `%`-by-static-zero remainder to " +
          "`integer` registered anyway through the live discovery/session_start " +
          "path — theta/parse/integer-narrowing did not fire. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b152livebroken");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager` rather
      // than off racy events: the diagnostic fires at LOAD time, before any
      // drive, so the full entry list is the delta (mirrors the bug 0110/
      // 0084/0089/0095/0102/0125/0050/0137/0139/0142 cells above).
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = integerNarrowingFragment();
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the integer-narrowing rejection " +
          "for the broken theta. Notes: " + JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0148 — `checkName`'s reserved-keyword arm (`src/lexer/lexer.ts`) is
// reached through a three-branch keyword scan (`contextualDiagnostics`) that no
// parameter name enters, so a reserved spelling at a `fn` parameter name — a
// `keyword`-kind token (the `reserved.has(value) ? "keyword" : "ident"` tagging
// in `scanTokens`, `src/lexer/lexer.ts`) — is the parser leaf's to classify:
// `parseFn`'s parameter loop draws the code on its keyword arm, beside the
// `ident` guard (src/parser/theta-document.ts:2211) that carries bug 0139's
// case code, as docs/spec_topics/lexical.md:20 and the position-free *Trigger*
// at docs/spec_topics/diagnostics/code-registry-parse.md:21 require
// (docs/bugs/0148-reserved-keyword-fn-parameter-position-silent.md). The fix
// classifies the parameter-name token in `checkName`'s own keyword-first order
// at that leaf; the 44-cell unit witness
// (tests/fn-param-name-reserved-keyword.test.ts) proves the mechanism offline
// at the `parseThetaDocument` boundary. This cell proves the same registered
// code denies REGISTRATION end to end through the real production composition
// root (session_start → resources_discover → composeExtensionInstance), which
// the offline harness cannot reach.
//
// The broken caller mirrors the bug doc's own §Reproduction row a1 verbatim
// (`fn h(let: string): number { 1 }`): a shape-conformant `FnParam` whose
// `Ident` is one of lexical.md:20's 32 reserved spellings.
// `theta/parse/reserved-keyword-as-identifier` is severity `E`, so
// `hasLoadParseError` (production-composition.ts:3263–3270, applied at `:3313`)
// un-registers the caller at the SAME site the bug 0070/0071/0077/0079(a)/0110/
// 0084/0089/0095/0102/0125/0050/0137/0139/0142 cells above exercise for their
// own codes.
//
// Registration-only: no slash command is invoked, so no model turn runs and the
// cell spends zero tokens (the same profile the file header claims for the
// discovery→registration cells above). ADDITIVE ONLY: no existing cell in this
// file is weakened, reworded, reordered or deleted.
// ===========================================================================

const RESERVED_KEYWORD_CODE = "theta/parse/reserved-keyword-as-identifier";

/** The sharded registry page carrying `theta/parse/reserved-keyword-as-identifier`'s row (`:21`). */
const RESERVED_KEYWORD_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `theta/parse/reserved-keyword-as-identifier: reserved keyword '<keyword>'
 * cannot be used as an identifier` — DIAG-4: the message half is read from the
 * registry row, not copied, mirroring this file's `bindingCaseMismatchFragment`
 * / `integerNarrowingFragment`. Unlike those two rows this one CARRIES a
 * `<keyword>` placeholder, so the presence assertion is a fill check rather
 * than a drift guard, and the trailing assertion confirms no second placeholder
 * is left unsubstituted.
 */
function reservedKeywordFragment(keyword: string): string {
  const template = registryMessage(
    RESERVED_KEYWORD_REGISTRY,
    RESERVED_KEYWORD_CODE,
  ) as string | undefined;
  expect(
    template,
    `${RESERVED_KEYWORD_CODE} has no registry row — the code this cell ` +
      "asserts is not registered (DIAG-2)",
  ).toBeTypeOf("string");
  const withSlot = template as string;
  expect(
    withSlot,
    `${RESERVED_KEYWORD_CODE}: the registry row's Message template must carry ` +
      "the <keyword> slot this cell fills — the row changed shape",
  ).toContain("<keyword>");
  const message = withSlot.replace("<keyword>", keyword);
  expect(
    message,
    `${RESERVED_KEYWORD_CODE}: the registry row's Message template grew a ` +
      "second unsubstituted placeholder this reader does not fill",
  ).not.toMatch(/<[a-z]+>/);
  return `${RESERVED_KEYWORD_CODE}: ${message}`;
}

/**
 * The bug doc's own §Reproduction row a1
 * (docs/bugs/0148-reserved-keyword-fn-parameter-position-silent.md) verbatim: a
 * top-level `fn` whose sole parameter is named with a reserved spelling. The
 * trailing `1` supplies the theta's final value, mirroring this file's
 * `illegalFnParamCaseTheta` above.
 */
function reservedFnParamNameTheta(): string {
  return ["---", "mode: prompt", "---", "fn h(let: string): number { 1 }", "1", ""].join(
    "\n",
  );
}

/**
 * The same-shape SIBLING with the SAME `fn`, the parameter renamed to a
 * spelling outside `reservedKeywords()` (src/lexer/lexer.ts:159–166) — must
 * still register, isolating the broken theta's refusal to the reserved
 * spelling rather than to "a theta declaring a `fn` never registers here".
 */
function conformantFnParamNameTheta(): string {
  return ["---", "mode: prompt", "---", "fn h(x: string): number { 1 }", "1", ""].join(
    "\n",
  );
}

describe("H8a-T — bug 0148: a reserved keyword as an fn parameter name draws reserved-keyword-as-identifier and does not register, live (Convention: live-host acceptance)", () => {
  it("does not register a theta whose fn parameter name is a reserved keyword, while its conformant-parameter sibling and an unrelated control both register, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, the broken
      // theta's absence could be (wrongly) attributed to a broken workspace
      // instead of the reserved-keyword rule under test.
      { source: "project", stem: "b148livectl", text: promptTheta("THETA-LIVE-OK") },
      // The same-shape sibling: the SAME fn declaration, parameter named with a
      // non-reserved spelling — must still register, isolating the refusal to
      // the reserved spelling rather than to "a theta declaring a fn cannot
      // register here".
      { source: "project", stem: "b148livegood", text: conformantFnParamNameTheta() },
      // The load-bearing broken theta: the bug doc's own §Reproduction row a1
      // spelling.
      { source: "project", stem: "b148livebroken", text: reservedFnParamNameTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b148livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the reserved-keyword rule under test, would explain the broken " +
          "theta's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b148livegood"),
        "the same fn with a non-reserved parameter name did not register — a " +
          "theta declaring a fn cannot register in this harness at all, " +
          "independent of this bug. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root (not
      // the offline parseThetaDocument harness the unit witness uses), a theta
      // declaring a reserved-keyword fn parameter name does NOT register —
      // parseFn's parameter loop (src/parser/theta-document.ts:2180–2242) fires
      // theta/parse/reserved-keyword-as-identifier, and hasLoadParseError
      // un-registers this theta at the SAME site the bug 0070/0071/0077/
      // 0079(a)/0110/0084/0089/0095/0102/0125/0050/0137/0139/0142 cells above
      // exercise for their own codes.
      expect(
        handle.command("b148livebroken"),
        "the theta whose fn parameter name is a reserved keyword registered " +
          "anyway through the live discovery/session_start path — " +
          "theta/parse/reserved-keyword-as-identifier did not fire. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b148livebroken");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager` rather
      // than off racy events: the diagnostic fires at LOAD time, before any
      // drive, so the full entry list is the delta (mirrors the bug 0110/0084/
      // 0089/0095/0102/0125/0050/0137/0139/0142 cells above).
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = reservedKeywordFragment("let");
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the reserved-keyword rejection for " +
          "the broken theta. Notes: " + JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0149 — `docs/spec_topics/lexical.md:16` requires a lowercase-first
// SCHEMA FIELD NAME and a lowercase-first `params:` FRONTMATTER KEY, and
// `code-registry-parse.md:19`'s Trigger already names the field-name position
// (bug 0139's fix above closed the sibling `fn`-parameter position only), but
// `parseSchemaObjectBody` (src/parser/theta-document.ts) and
// `extractParsedParams` (src/parser/frontmatter.ts) each captured their
// field-name token / YAML key with no case test
// (docs/bugs/0149-field-name-case-positions-unenforced.md). `schema S { Xs:
// string }` and a `params:` key `Topic: string` each loaded with zero
// diagnostics and registered.
//
// The fix closes BOTH faces at their own parser leaf, each reusing
// `checkName`'s own two-comparison predicate (src/lexer/lexer.ts) and pushing
// `theta/parse/binding-case-mismatch` (severity `error`) ranged on the
// field-name token (face 1) or the YAML key node (face 2). Face 2 additionally
// excludes a non-identifier-shaped key and a reserved keyword; face 1 gets the
// same two exclusions structurally, from the lexer's own keyword/ident token
// classification. The 46-cell unit witness (tests/schema-field-name-case.test.ts)
// proves the mechanism offline at the `parseThetaDocument` boundary. This cell
// proves the SAME registered code denies REGISTRATION end to end through the
// real production composition root (session_start → resources_discover →
// composeExtensionInstance), which the offline harness cannot reach.
//
// The two broken callers mirror the bug doc's own §Reproduction rows e1 (face
// 1) and e5 (face 2) verbatim. `theta/parse/binding-case-mismatch` is severity
// `E`, so `hasLoadParseError` (production-composition.ts:3263–3270, applied at
// `:2094`) un-registers each broken theta at the SAME site the bug 0070/0071/
// 0077/0079(a)/0110/0084/0089/0095/0102/0125/0050/0137/0139/0142/0148 cells
// above exercise for their own codes.
//
// The face-2 sibling's shape is the `classifyBinderBypass` (src/binder/
// binder-envelope.ts) SINGLE-STRING-BYPASS shape — exactly one `params:`
// field, type `string`, no default, not optional, not nullable — chosen and
// MEASURED against `production-composition.ts`'s own binder-model-resolution
// step, whose comment states: "Bypass-eligible thetas (no-params /
// single-string) skip resolution entirely (they never call the binder)". A
// bypass-eligible theta therefore needs no `bind_model:` and no
// `.pi/settings.json` `theta.binderModel` to register — unlike `b71livecallee`
// above (two typed `params:` fields, NOT bypass-eligible, so it carries its own
// `bind_model:` for exactly this reason). This cell's own `b149liveparamsgood`
// precondition assertion below is the live measurement: it registers with
// neither `bind_model:` nor a settings-file binder model, confirming the
// shape was correctly chosen rather than assumed.
//
// Registration-only: no slash command is invoked, so no model turn runs and
// the cell spends zero tokens (the same profile the file header claims for the
// discovery→registration cells above). ADDITIVE ONLY: no existing cell in this
// file is weakened, reworded, reordered or deleted.
// ===========================================================================

/**
 * The bug doc's own §Reproduction row e1
 * (docs/bugs/0149-field-name-case-positions-unenforced.md) verbatim: a
 * top-level `schema` whose sole field is spelled uppercase-first. FACE 1.
 */
function illegalSchemaFieldCaseTheta(): string {
  return ["---", "mode: prompt", "---", "schema S { Xs: string }", ""].join("\n");
}

/**
 * The same-shape SIBLING with the SAME schema, the field spelled lowercase —
 * must still register, isolating the broken theta's refusal to the uppercase
 * spelling rather than to "a theta declaring this schema shape never
 * registers here". The bug doc's own control row e2.
 */
function conformantSchemaFieldCaseTheta(): string {
  return ["---", "mode: prompt", "---", "schema S { xs: string }", ""].join("\n");
}

/**
 * The bug doc's own §Reproduction row e5 verbatim: a `params:` key spelled
 * uppercase-first. FACE 2. Exactly one field, type `string`, no default — the
 * `classifyBinderBypass` single-string-bypass shape, so registration needs no
 * `bind_model:` (file header note above).
 */
function illegalParamsKeyCaseTheta(): string {
  return ["---", "mode: prompt", "params:", "  Topic: string", "---", "1", ""].join("\n");
}

/**
 * The same-shape SIBLING with the SAME single-string `params:` field, the key
 * spelled lowercase — must still register. The bug doc's own control row e6.
 */
function conformantParamsKeyCaseTheta(): string {
  return ["---", "mode: prompt", "params:", "  topic: string", "---", "1", ""].join("\n");
}

describe("H8a-T — bug 0149: an uppercase-first schema field name or params: key draws binding-case-mismatch and does not register, live (Convention: live-host acceptance)", () => {
  it("does not register a theta whose schema field name or params: key starts uppercase, while their lowercase-first siblings and an unrelated control all register, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, either
      // broken theta's absence could be (wrongly) attributed to a broken
      // workspace instead of the case rule under test.
      { source: "project", stem: "b149livectl", text: promptTheta("THETA-LIVE-OK") },
      // FACE 1 same-shape sibling and broken theta (the schema field name).
      { source: "project", stem: "b149liveschemagood", text: conformantSchemaFieldCaseTheta() },
      { source: "project", stem: "b149liveschemabroken", text: illegalSchemaFieldCaseTheta() },
      // FACE 2 same-shape sibling and broken theta (the params: key).
      { source: "project", stem: "b149liveparamsgood", text: conformantParamsKeyCaseTheta() },
      { source: "project", stem: "b149liveparamsbroken", text: illegalParamsKeyCaseTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b149livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the case rule under test, would explain either broken theta's " +
          "absence too. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b149liveschemagood"),
        "the same schema with a lowercase-first field did not register — a " +
          "theta declaring this schema shape cannot register in this harness " +
          "at all, independent of this bug. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b149liveparamsgood"),
        "the same single-string params: field spelled lowercase did not " +
          "register — measured against `classifyBinderBypass`'s single-" +
          "string-bypass shape (src/binder/binder-envelope.ts), this theta " +
          "needs no `bind_model:` and no resolvable binder model to register, " +
          "so its absence cannot be attributed to that. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // FACE 1 fixed observable: through the REAL production composition root
      // (not the offline parseThetaDocument harness the unit witness uses), a
      // theta declaring an uppercase-first schema field name does NOT
      // register — parseSchemaObjectBody's field loop
      // (src/parser/theta-document.ts) fires theta/parse/binding-case-
      // mismatch, and hasLoadParseError un-registers this theta at the SAME
      // site the cells above exercise for their own codes.
      expect(
        handle.command("b149liveschemabroken"),
        "the theta whose schema field name starts uppercase registered " +
          "anyway through the live discovery/session_start path — " +
          "theta/parse/binding-case-mismatch did not fire at the schema " +
          "field-name position. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b149liveschemabroken");

      // FACE 2 fixed observable: the same registration-denial mechanism, at
      // extractParsedParams's key walk (src/parser/frontmatter.ts) instead.
      expect(
        handle.command("b149liveparamsbroken"),
        "the theta whose params: key starts uppercase registered anyway " +
          "through the live discovery/session_start path — " +
          "theta/parse/binding-case-mismatch did not fire at the params: key " +
          "position. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b149liveparamsbroken");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager` rather
      // than off racy events: the diagnostic fires at LOAD time, before any
      // drive, so the full entry list is the delta (mirrors the bug 0110/
      // 0084/0089/0095/0102/0125/0050/0137/0139/0142/0148 cells above). Reuses
      // this file's existing `bindingCaseMismatchFragment` reader (bug 0139's
      // addition) rather than a second one — both faces push the SAME
      // registered code with the SAME unplaceholdered Message, so the two
      // notes are told apart by which broken theta's own file path
      // `renderDiagnosticLine` (src/diagnostics/diagnostic.ts) prefixes onto
      // the rendered line, not by the message text.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = bindingCaseMismatchFragment();
      const schemaNote = notes.some(
        (note) => note.includes(expectedFragment) && note.includes("b149liveschemabroken"),
      );
      const paramsNote = notes.some(
        (note) => note.includes(expectedFragment) && note.includes("b149liveparamsbroken"),
      );
      expect(
        schemaNote,
        "no theta-system-note entry named the binding-case-mismatch rejection " +
          "for the FACE 1 (schema field) broken theta. Notes: " + JSON.stringify(notes),
      ).toBe(true);
      expect(
        paramsNote,
        "no theta-system-note entry named the binding-case-mismatch rejection " +
          "for the FACE 2 (params: key) broken theta. Notes: " + JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0081 — the array/ternary common-type rule was decided by "one branch
// dominates the others", so rule 2's union clause (expressions.md:225) was
// unreachable: `[1, "a"]`, printed in expressions.md as a worked vector, drew
// `theta/parse/array-no-common-type` and never loaded
// (docs/bugs/0081-array-ternary-common-type-never-unions.md). The fix's ONE
// exported `commonType(branches, env, relate)` (src/parser/type-compat.ts)
// computes rule 2's least-upper-bound union when no branch dominates, called
// by BOTH `checkCommonType` (the checker) and
// `StaticTypeInferencePass.#commonType` (the inferrer) — the 21-cell unit
// witness (tests/array-ternary-common-type-union.test.ts) proves the
// mechanism offline at the `parseThetaDocument` boundary, cell r1 for the
// admission and cell r7 for rule 3's survival. This cell proves the SAME
// admission reaches REGISTRATION end to end through the real production
// composition root (session_start → resources_discover →
// composeExtensionInstance → checkTypeLayer) — the fixed path had zero live
// coverage before this addition.
//
// THIS CELL IS AN ADMISSION CELL, NOT A DENIAL — NOTE THE INVERSION. Every
// H8a-T cell above it proves a DENIAL: a theta the fix (or an already-shipped
// rule) refuses must still fail to register. Bug 0081's fix instead ADMITS a
// source that previously refused outright, so `b81livegood` is the cell whose
// REGISTRATION is the fixed observable, not its absence:
//   - `b81livegood` — expressions.md:225's own worked vector, `let x = [1,
//     "a"]` (the unit witness's cell r1, verbatim). Pre-fix this drew
//     `theta/parse/array-no-common-type` on a spec-legal source and never
//     registered; post-fix `commonType`'s rule-2 union clause admits it and
//     it MUST register.
//   - `b81livebroken` — the rule-3 CONTROL (the unit witness's cell r7,
//     verbatim): two distinct named object schemas in one array literal, no
//     sink (`[A{…}, B{…}]`). Rule 3 (expressions.md:226) is the ONE
//     sink-less refusal the spec still prescribes after the fix — gated on
//     `isObjectBranch` (src/parser/type-compat.ts) — so this theta MUST NOT
//     register. Without this control, `b81livegood` registering would be
//     unfalsifiable: a harness (or a regressed fix) that admitted EVERY
//     heterogeneous array would pass `b81livegood` for the wrong reason.
//     This cell proves the harness — and the shipped rule-3 gate — still
//     detects a genuine refusal, so the admission above is not vacuous.
//   - `b81livectl` — the plain control on the siblings' own pattern
//     (`promptTheta("THETA-LIVE-OK")`), proving the workspace and discovery
//     walk both work independent of this bug.
//
// Registration-only: no slash command is invoked, so no model turn runs and
// the cell spends zero tokens (the same profile the file header claims for
// the discovery→registration cells above). ADDITIVE ONLY: no existing cell in
// this file is weakened, reworded, reordered or deleted.
// ===========================================================================

const ARRAY_NO_COMMON_TYPE_CODE = "theta/parse/array-no-common-type";

/** The sharded registry page carrying `theta/parse/array-no-common-type`'s row (`:41`). */
const ARRAY_NO_COMMON_TYPE_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `theta/parse/array-no-common-type: array elements have no common type; …`
 * — DIAG-4: the message half is read from the registry row, not copied,
 * mirroring this file's `integerNarrowingFragment` /
 * `bindingCaseMismatchFragment` / `reservedKeywordFragment`. The row carries
 * no `<…>` placeholder, so this helper substitutes nothing; the trailing
 * assertion is a drift guard — a future reworded row that introduces a
 * placeholder reds here — rather than a fill check.
 */
function arrayNoCommonTypeFragment(): string {
  const template = registryMessage(
    ARRAY_NO_COMMON_TYPE_REGISTRY,
    ARRAY_NO_COMMON_TYPE_CODE,
  ) as string | undefined;
  expect(
    template,
    `${ARRAY_NO_COMMON_TYPE_CODE} has no registry row — the code this cell ` +
      "asserts is not registered (DIAG-2)",
  ).toBeTypeOf("string");
  const message = template as string;
  expect(
    message,
    `${ARRAY_NO_COMMON_TYPE_CODE}: the registry row's Message template grew ` +
      "an unsubstituted <…> placeholder this reader does not fill — the row " +
      "changed shape",
  ).not.toMatch(/<[a-z]+>/);
  return `${ARRAY_NO_COMMON_TYPE_CODE}: ${message}`;
}

/**
 * expressions.md:225's own worked vector — the bug doc's own §Reproduction
 * row 1, and the unit witness's cell r1, verbatim: a `let` binding a
 * heterogeneous array literal (`integer`, `string`) with no dominating
 * branch and no sink. Pre-fix `hasCommonType` (src/parser/type-compat.ts)
 * found no dominating branch and `checkCommonType` refused with
 * `theta/parse/array-no-common-type`; post-fix `commonType`'s rule-2 union
 * clause computes `array<integer | string>` and the literal loads clean.
 */
function heterogeneousArrayLiteralTheta(): string {
  return ["---", "mode: prompt", "---", 'let x = [1, "a"]', ""].join("\n");
}

/**
 * The rule-3 CONTROL — the bug doc's own §Reproduction row 7, and the unit
 * witness's cell r7, verbatim: two distinct named object schemas in one
 * array literal, no sink. `isObjectBranch` (src/parser/type-compat.ts) gates
 * the union clause on branch KIND, so a set holding an object branch with no
 * dominating branch still has no common type — this theta must NOT register,
 * both before and after the fix.
 */
function noCommonTypeObjectBranchTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "schema A {",
    "  a: integer",
    "}",
    "schema B {",
    "  b: string",
    "}",
    'let x = [A { a: 1 }, B { b: "x" }]',
    "",
  ].join("\n");
}

describe("H8a-T — bug 0081: the array/ternary common-type union admits a spec-legal heterogeneous array literal, live, with rule 3's refusal surviving as a control (Convention: live-host acceptance)", () => {
  it("registers a theta whose array literal has no dominating branch but a computed union, while a distinct-named-object-schema array with no sink still does not register, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, either
      // sibling's status could be (wrongly) attributed to a broken workspace
      // instead of the common-type union rule under test.
      { source: "project", stem: "b81livectl", text: promptTheta("THETA-LIVE-OK") },
      // The load-bearing ADMITTED theta: the bug doc's own §Reproduction row 1
      // spelling, unit-witness cell r1 verbatim. THIS is the fixed observable
      // — its REGISTRATION, not its absence.
      { source: "project", stem: "b81livegood", text: heterogeneousArrayLiteralTheta() },
      // The rule-3 CONTROL: unit-witness cell r7 verbatim. Must NOT register,
      // proving the admission above is not "the harness registers everything".
      { source: "project", stem: "b81livebroken", text: noCommonTypeObjectBranchTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b81livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the common-type union rule under test, would explain either " +
          "sibling's status too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // THE FIXED OBSERVABLE — the admission. Through the REAL production
      // composition root (not the offline parseThetaDocument harness the unit
      // witness uses), a heterogeneous array literal with no dominating
      // branch now computes a union and registers — `commonType`'s rule-2
      // union clause (src/parser/type-compat.ts) admits it, and
      // `hasLoadParseError` (production-composition.ts) sees no
      // error-severity load-phase diagnostic to un-register on. Pre-fix this
      // theta would NOT have registered (this is the one cell in this file
      // whose registration, not its absence, is the fix's own proof).
      expect(
        handle.command("b81livegood"),
        "expressions.md:225's own worked vector `[1, \"a\"]` did not register " +
          "through the live discovery/session_start path — the common-type " +
          "union clause did not admit it (theta/parse/array-no-common-type " +
          "still fired on a spec-legal source). Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // THE CONTROL — rule 3's refusal survives. Two distinct named object
      // schemas with no sink still have no common type (`isObjectBranch`'s
      // gate), so this theta must NOT register, proving the admission above
      // is not a vacuous "everything registers now" pass.
      expect(
        handle.command("b81livebroken"),
        "the rule-3 control (two distinct named object schemas, no sink) " +
          "registered anyway through the live discovery/session_start path — " +
          "theta/parse/array-no-common-type did not fire, so the admission " +
          "above would prove nothing (a harness or a regressed fix that admits " +
          "every heterogeneous array would pass b81livegood the same way). " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b81livebroken");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager` rather
      // than off racy events: the diagnostic fires at LOAD time, before any
      // drive, so the full entry list is the delta (mirrors the bug 0110/
      // 0084/0089/0095/0102/0125/0050/0137/0139/0142/0148/0149 cells above).
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = arrayNoCommonTypeFragment();
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the array-no-common-type rejection " +
          "for the rule-3 control. Notes: " + JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0155 (cell 85) — the ternary is adjudicated OUT of common-type rules 1
// and 3: `theta/parse/array-element-type-mismatch` and
// `theta/parse/array-no-common-type` are both registered against an "Array
// literal" *Trigger* (code-registry-parse.md rows :43/:44) and DIAG-2 makes
// that *Trigger* the normative statement of the emission set
// (docs/bugs/0155-ternary-common-type-unenforced-trigger-conflict.md, route
// (b)). `checkCommonType`'s one caller in `src/` stays `checkArrayLiteral`
// (type-layer-checks.ts) — no ternary caller was wired — so a ternary with
// two distinct named object-schema branches and no sink LOADS AND REGISTERS,
// while the one-token-apart array-literal spelling of the same pair still
// refuses under rule 3. The 23-cell unit witness
// (tests/ternary-common-type-trigger-adjudication.test.ts) proves this
// offline at the `parseThetaDocument` boundary (cells t1 and a1). This cell
// proves the SAME disposition end to end through the real production
// composition root (session_start -> resources_discover ->
// composeExtensionInstance -> checkTypeLayer) — the fixed path had zero live
// coverage before this addition.
//
// Registration-only, mirroring the bug 0081 cell immediately above: no slash
// command is invoked, so no model turn runs and the cell spends zero tokens.
// ADDITIVE ONLY.
// ===========================================================================

/**
 * `true ? A { a: 1 } : B { b: "x" }` under two distinct named object schemas
 * with no sink — bug 0155's own §Reproduction row t1 and the unit witness's
 * cell t1, verbatim. Route (b) adjudicates the ternary out of rule 3's reach,
 * so this theta MUST register with no err note (cell 85).
 */
function ternaryNoCommonTypeAdjudicatedTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "schema A {",
    "  a: integer",
    "}",
    "schema B {",
    "  b: string",
    "}",
    'let x = true ? A { a: 1 } : B { b: "x" }',
    "",
  ].join("\n");
}

describe("H8a-T — bug 0155: a ternary with two distinct named object-schema branches loads and registers, live, with the array-literal twin's refusal surviving as a contrast (cell 85) (Convention: live-host acceptance)", () => {
  it("registers a theta whose ternary has two distinct named object-schema branches and no sink, while the array-literal spelling of the same pair still does not register, through the real discovery->registration path (cell 85)", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, either
      // sibling's status could be (wrongly) attributed to a broken workspace
      // instead of the bug 0155 adjudication under test.
      { source: "project", stem: "b155livectl", text: promptTheta("THETA-LIVE-OK") },
      // THE FIXED OBSERVABLE — the ternary is adjudicated out of rule 3's
      // reach and registers with no err note.
      { source: "project", stem: "b155liveternary", text: ternaryNoCommonTypeAdjudicatedTheta() },
      // THE CONTRAST — the one-token-apart array-literal spelling of the same
      // pair still refuses under rule 3, whose registered *Trigger* names an
      // array literal. Without this control, the ternary registering would be
      // unfalsifiable: a harness (or a regressed fix) that admitted every
      // heterogeneous object set would pass the ternary cell for the wrong
      // reason.
      { source: "project", stem: "b155livebroken", text: noCommonTypeObjectBranchTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b155livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the bug 0155 adjudication under test, would explain either " +
          "sibling's status too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // THE FIXED OBSERVABLE (cell 85) — the ternary registers. Through the
      // REAL production composition root (not the offline parseThetaDocument
      // harness the unit witness uses), a ternary whose two branches are
      // distinct named object schemas with no dominating member loads and
      // registers: `checkCommonType`'s one caller in `src/` stays
      // `checkArrayLiteral`, so no ternary node reaches rule 3's refusal, and
      // `#commonType`'s first-candidate fallback answers the walk without
      // reporting anything.
      expect(
        handle.command("b155liveternary"),
        "`true ? A{...} : B{...}` did not register through the live " +
          "discovery/session_start path — bug 0155 route (b)'s adjudication " +
          "(the ternary is out of rule 3's reach) did not hold live. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // THE CONTRAST — the array-literal twin still refuses. Same two named
      // object schemas, same absence of a sink, one token apart
      // (`[A{...}, B{...}]` versus `... ? ... : ...`).
      expect(
        handle.command("b155livebroken"),
        "the array-literal twin (two distinct named object schemas, no sink) " +
          "registered anyway through the live discovery/session_start path — " +
          "theta/parse/array-no-common-type did not fire, so the ternary's " +
          "registration above would prove nothing. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b155livebroken");

      // The theta-system-note channel, read off the settled in-memory
      // `SessionManager`: the ternary's absence of a diagnostic means its
      // delta must carry NO array-no-common-type note, while the
      // array-literal contrast's delta must carry exactly the registered
      // *Message*.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = arrayNoCommonTypeFragment();
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the array-no-common-type rejection " +
          "for the array-literal contrast. Notes: " + JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0052 — a repeated field name inside an inline object body
// (`{a: integer, a: string}`) was admitted with zero diagnostics at every
// `Type` position: `TypeParser.parseObject` (src/parser/type-grammar.ts) read
// the field-name token and dropped it, so `walkType`'s `object` arm had no
// name list to compare, and the two lowerers (`hoistInlineObjectType`,
// `lowerInlineObject`) built a last-wins `properties.a` beside a two-item
// `required: ["a", "a"]` with no diagnostic anywhere
// (docs/bugs/0052-inline-object-duplicate-field-names-silent-last-wins.md).
// The same two fields written as a `schema` declaration were already refused
// with `theta/parse/wire-name-collision` (docs/spec_topics/schemas.md:44),
// but `grammar.md:109` states the inline spelling "carr[ies] the same field
// semantics" — the two spellings of these two fields disagreed.
//
// The fix retains the field names `parseObject` used to discard
// (`TypeNode.fieldNames`) and adds a repeated-name comparison to `walkType`'s
// `object` arm, joining the EXISTING `"inline-object-shape"` rule set
// (`TypeCheckRules`, src/parser/type-grammar.ts) beside
// `theta/parse/empty-schema-body` — bug 0045's sibling rule on the same
// grammar sentence — so no new call site was added: the rule reaches all
// eight `Type` positions through the five `"all"` call sites already in
// `theta-document.ts`, the `params:` per-field loop (`params.ts`), the
// `@<T>` annotation root and the `invoke<T>` return annotation, which already
// select the narrower `"inline-object-shape"` set. The new registered code is
// `theta/parse/duplicate-inline-field-name`
// (`docs/spec_topics/diagnostics/code-registry-parse.md`). The 49-cell unit
// witness (tests/inline-object-duplicate-field-name.test.ts) proves the
// mechanism offline at the `parseThetaDocument` boundary — its own group (a5)
// cell is the fixture this live cell mirrors. This cell proves the SAME
// registered code denies REGISTRATION end to end through the real production
// composition root (session_start → resources_discover →
// composeExtensionInstance), which the offline harness cannot reach.
// `theta/parse/duplicate-inline-field-name` is severity `E`, so
// `hasLoadParseError` (production-composition.ts) un-registers the declaring
// theta at the SAME site the bug 0070/0071/0077/0079(a)/0110/0084/0089/0095/
// 0102/0125/0050/0137/0139/0142/0148/0149/0081 cells above exercise for their
// own codes.
//
// The broken theta mirrors the bug doc's own §Reproduction fixture C1 and the
// unit witness's cell a5 verbatim: a `schema` body field type is one of the
// three positions that HOIST (§Fix constraint 1 — the lowering does not
// move), so pre-fix this shape loaded cleanly and registered, carrying a
// silently-dropped `a: integer` declaration inside its hoisted `$defs` entry.
// The same-shape sibling (the second field renamed `b`) isolates the refusal
// to the REPEATED name rather than to "a theta declaring this schema shape
// never registers here" — mirroring the bug 0149 FACE 1 pair above.
//
// No existing live fixture (H8a in this file, the H9a acceptance fixtures, or
// the hardening probes) declares an inline object type carrying a repeated
// field name anywhere before this cell: the sole committed inline object type
// is `tests/live/acceptance/fixtures/acc-typed-inline.theta`'s
// `{ ok: boolean, label: string }` — distinct names (bug 0052 §Affected "Not
// affected" makes the same PCRE2-scan claim over `src/`, `tests/` and
// `docs/`; a fresh scan over every `tests/live/**` fixture and embedded theta
// source string confirms it still holds at this HEAD) — so the fixed arm had
// NO live reach at all before this addition, mirroring the bug 0070/0071/
// 0110/0148/0149 cells' own "no existing live fixture reaches this arm"
// findings for their own constructs.
//
// Registration-only: no slash command is invoked, so no model turn runs and
// the cell spends zero tokens (the same profile the file header claims for
// the discovery→registration cells above). ADDITIVE ONLY: no existing cell in
// this file is weakened, reworded, reordered or deleted.
// ===========================================================================

const DUPLICATE_INLINE_FIELD_NAME_CODE = "theta/parse/duplicate-inline-field-name";

/** The sharded registry page carrying `theta/parse/duplicate-inline-field-name`'s row. */
const DUPLICATE_INLINE_FIELD_NAME_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `theta/parse/duplicate-inline-field-name: duplicate field name '<field>'
 * within one inline object type` — DIAG-4: the message half is read from the
 * registry row, not copied, mirroring this file's `reservedKeywordFragment` /
 * `invokePathEscapeFragment`. The row carries the one `<field>` placeholder,
 * so this helper fills it and the trailing assertion confirms no second
 * placeholder is left unsubstituted.
 */
function duplicateInlineFieldNameFragment(field: string): string {
  const template = registryMessage(
    DUPLICATE_INLINE_FIELD_NAME_REGISTRY,
    DUPLICATE_INLINE_FIELD_NAME_CODE,
  ) as string | undefined;
  expect(
    template,
    `${DUPLICATE_INLINE_FIELD_NAME_CODE} has no registry row — the code this ` +
      "cell asserts is not registered (DIAG-2)",
  ).toBeTypeOf("string");
  const withSlot = template as string;
  expect(
    withSlot,
    `${DUPLICATE_INLINE_FIELD_NAME_CODE}: the registry row's Message template ` +
      "must carry the <field> slot this cell fills — the row changed shape",
  ).toContain("<field>");
  const message = withSlot.replace("<field>", field);
  expect(
    message,
    `${DUPLICATE_INLINE_FIELD_NAME_CODE}: the registry row's Message template ` +
      "grew a second unsubstituted placeholder this reader does not fill",
  ).not.toMatch(/<[a-z]+>/);
  return `${DUPLICATE_INLINE_FIELD_NAME_CODE}: ${message}`;
}

/**
 * The bug doc's own §Reproduction fixture C1, and the unit witness's cell a5,
 * verbatim: a top-level `schema` whose sole field's inline object type
 * repeats the field name `a`. One of the three HOISTING positions (§Fix
 * constraint 1), so pre-fix this loaded cleanly and registered with a
 * silently-dropped `a: integer` declaration.
 */
function duplicateInlineFieldNameSchemaTheta(): string {
  return ["---", "mode: prompt", "---", "schema S { p: {a: integer, a: string} }", ""].join(
    "\n",
  );
}

/**
 * The same-shape SIBLING with the SAME schema and the SAME inline object
 * field, the second field renamed `b` — must still register, isolating the
 * broken theta's refusal to the repeated name rather than to "a theta
 * declaring this schema shape never registers here".
 */
function conformantInlineFieldNameSchemaTheta(): string {
  return ["---", "mode: prompt", "---", "schema S { p: {a: integer, b: string} }", ""].join(
    "\n",
  );
}

describe("H8a-T — bug 0052: a repeated field name inside an inline object body draws duplicate-inline-field-name and does not register, live (Convention: live-host acceptance)", () => {
  it("does not register a theta whose inline object type repeats a field name, while its distinct-names sibling and an unrelated control both register, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, the broken
      // theta's absence could be (wrongly) attributed to a broken workspace
      // instead of the duplicate-inline-field-name rule under test.
      { source: "project", stem: "b52livectl", text: promptTheta("THETA-LIVE-OK") },
      // The same-shape sibling: the SAME schema and the SAME inline object
      // field, distinct names — must still register, isolating the refusal
      // to the repeated name rather than to "a theta declaring this schema
      // shape cannot register here".
      { source: "project", stem: "b52livegood", text: conformantInlineFieldNameSchemaTheta() },
      // The load-bearing broken theta: the bug doc's own §Reproduction
      // fixture C1 / unit-witness cell a5 spelling.
      { source: "project", stem: "b52livebroken", text: duplicateInlineFieldNameSchemaTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b52livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the duplicate-inline-field-name rule under test, would explain the " +
          "broken theta's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b52livegood"),
        "the same schema and inline object field, spelled with distinct " +
          "names, did not register — a theta declaring this schema shape " +
          "cannot register in this harness at all, independent of this bug. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root
      // (not the offline parseThetaDocument harness the unit witness uses), a
      // theta whose inline object type repeats a field name does NOT
      // register — `walkType`'s `object` arm (src/parser/type-grammar.ts)
      // fires theta/parse/duplicate-inline-field-name, and hasLoadParseError
      // un-registers this theta at the SAME site the bug 0070/0071/0077/
      // 0079(a)/0110/0084/0089/0095/0102/0125/0050/0137/0139/0142/0148/0149/
      // 0081 cells above exercise for their own codes.
      expect(
        handle.command("b52livebroken"),
        "the theta whose inline object type repeats a field name registered " +
          "anyway through the live discovery/session_start path — " +
          "theta/parse/duplicate-inline-field-name did not fire. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b52livebroken");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager` rather
      // than off racy events: the diagnostic fires at LOAD time, before any
      // drive, so the full entry list is the delta (mirrors the bug 0110/
      // 0084/0089/0095/0102/0125/0050/0137/0139/0142/0148/0149/0081 cells
      // above).
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = duplicateInlineFieldNameFragment("a");
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the duplicate-inline-field-name " +
          "rejection for the broken theta. Notes: " + JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0056 — the `params:` right-hand side had no literal sublanguage at any
// depth: `p: '"x" | "y"'` lowered the PERMISSIVE `{"anyOf":[{},{}]}` and
// `p: '"x"'` lowered `{}`, where the same type text at the `schema`-body,
// alias-RHS and `@<T>` positions lowered the ENFORCING `{"type":"string",
// "enum":[...]}` / `{"const":"x"}`
// (docs/bugs/0056-params-literal-sublanguage-absent-lowers-permissive.md).
// `lowerParamsFieldType` (src/parser/params.ts) now checks the shared
// `lowerLiteralSublanguage` recogniser BEFORE its brace test, so the
// `params:` position mints the same fragment the other three positions do,
// at every nesting depth.
//
// UNLIKE every bug-fix cell above, this fix does NOT move the register/
// non-register verdict for ANY input: every row of §Fix constraint 1's table
// loads with ZERO diagnostics both before and after the fix (the bug's own
// "Why it matters" census confirms the absence is silent, never a
// diagnostic). `handle.command(...)` / `handle.registeredNames()` therefore
// cannot distinguish the two lowerings; the observable this cell needs is
// downstream ENFORCEMENT of the lowered fragment, not registration.
//
// THE OBSERVABLE. Of the three consumers the bug doc names (the binder
// envelope, the post-default-merge AJV compile, the subagent child's params
// intake), only the THIRD is reachable without a live model call and without
// depending on stochastic model output: a `params:` field of a literal-union
// type is never `single-string-bypass`-eligible (`classifyBinderBypass`,
// src/binder/binder-envelope.ts — the type text is not literally `"string"`),
// so it always routes to `binder` for a SLASH dispatch — but an `invoke(...)`
// call supplies its argument value directly from CODE (invocation.md
// §"Argument binding": "The LLM-driven binder ... does not run here —
// `invoke(...)` callers pass already-typed values"), and PIC-60 marshals it
// straight to the callee's spawned child, which validates it against
// `theta.frontmatter.params.loweredSchema` via the REAL AJV seam
// (`#intakeSubagentRootParams`, src/extension/production-theta-producer.ts) —
// entirely code-computed, no model in the loop for the value itself. A
// rejection there is `intakeChildParams`'s `refuseParams`
// (src/runtime/subagent-params.ts): `Err(InvokeInfraError { kind:
// "invoke_infra", cause: "validation", ... })`, which crosses the RFC-0006
// envelope back to the `invoke(...)` parent UNCHANGED even through an
// UNTYPED invoke (invocation.md §"Typed return": untyped `invoke(...)`
// discards only the `Ok` VALUE to `null`; failure envelopes "pass through
// unchanged"). Pre-fix the lowered fragment is `{"anyOf":[{},{}]}` — an empty
// schema admits every JSON value, so the SAME out-of-enum argument is
// silently ACCEPTED instead (`Ok(null)`); post-fix it is the enforcing
// `{"type":"string","enum":["x","y"]}`, which refuses it. Fully deterministic
// in EITHER direction: no live-model-authored value crosses the boundary
// under test, and the parent theta below `match`es both `Result` arms
// explicitly, so nothing here depends on `prompt()` merely resolving.
//
// WHY THE ARGUMENT CANNOT BE CAUGHT BY AN UNRELATED STATIC CHECK (confirmed
// by direct reading, so this cell cannot be confounded with the bug 0050/0137
// invoke-arg-type-mismatch cells above): the argument below is a bare `let`-
// bound IDENTIFIER (`good` / `bad`), and `collectProvableArgTypes`'s
// `"ident"` arm (src/extension/invoke-static-checks.ts) unconditionally
// returns `undefined` for an identifier operand ("even a `let`-bound name is
// nominal here") — `buildInvokeArgSlot` therefore WITHHOLDS that argument
// slot before `checkCompatible` (src/parser/type-compat.ts, UNCHANGED by this
// fix) is ever consulted, so `theta/parse/invoke-arg-type-mismatch` cannot
// fire for either value regardless of literal contents; the runtime AJV net —
// this fix's own surface — is what the static layer defers to by
// construction. Independently, `type-compat.ts`'s `literal` `CompatType` is
// value-erased (it records only the primitive KIND a literal types as, never
// its value), so even a DIRECT literal argument would decide "compatible" by
// primitive-kind reflexivity — the static layer has no mechanism to
// distinguish `"zzz"` from `"x"`/`"y"` at all, which is exactly why bug
// 0056's runtime AJV lowering is the only enforcement this class of argument
// gets. Verified offline before this cell was added, then deleted per
// scratch policy: both fixture bodies below parse and type-check with zero
// diagnostics, and the child's `params:` lowers this tree's fix's enforcing
// fragment.
//
// No existing live fixture (H8a in this file, the H9a acceptance fixtures, or
// the hardening probes) declares a literal-typed `params:` field anywhere:
// every `params:` occurrence across `tests/live/**` is `string`, `number = 3`
// or a plain identifier default (`acc-params-binder.theta`; the bug 0071/
// 0102/0137/0149 fixtures above) — matching the bug doc's own 17-file
// committed-fixture census, re-measured for this addition. The fixed arm
// therefore had NO live reach at all before this cell.
//
// Token cost: ONE small untyped free-phase turn (the closing `@`-query,
// rendering both outcomes computed by CODE before the model ever replies —
// the model's reply itself is never asserted on). Both `invoke(...)` calls
// spawn a REAL RFC-0006 child process each (the callee's body is a bare tail
// expression — no query, zero tokens per child, mirroring the bug 0020
// forged-ingress cell's "driving it needs a child spawn" precedent above);
// `./harness`'s module-scope `#subagent-child-pins` (executable +
// `PI_THETA_SUBAGENT_EXTENSION_PIN_ENV`) already cover both, imported at the
// top of this file. ADDITIVE ONLY: no existing cell in this file is
// weakened, reworded, reordered or deleted.
// ===========================================================================

/**
 * The callee both `invoke(...)` calls below name: one `params:` field whose
 * declared type is the bug doc's own reproduction text, an all-string-literal
 * union — never `single-string-bypass`-eligible (`classifyBinderBypass`), so
 * it needs a resolvable `bind_model:` to independently load (the SAME
 * provider-qualified id `tests/live/acceptance/fixtures/acc-params-binder.theta`
 * and this file's `b71livecallee` use) — pure model-registry name resolution
 * at LOAD time, spending no tokens. The body is the bound field itself: a
 * bare tail expression, so the callee's OWN drive (inside its spawned child)
 * issues no query either.
 */
function literalParamsChildTheta(): string {
  return [
    "---",
    "mode: subagent",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    "  p: '\"x\" | \"y\"'",
    "---",
    "p",
    "",
  ].join("\n");
}

/**
 * The load-bearing parent: TWO `invoke(...)` calls against the SAME callee —
 * one argument the declared union admits (`"x"`), one it does not (`"zzz"`) —
 * each bound to a plain identifier (`good` / `bad`) so
 * `collectProvableArgTypes`'s `"ident"` withholding keeps BOTH calls off the
 * static invoke-arg-type-mismatch checker's plate (see the file-header
 * comment above), leaving the runtime AJV net at the child's params intake as
 * the only judge. Each `Result` is `match`ed EXPLICITLY into a plain string —
 * `"ACCEPTED"` for `Ok`, `"REJECTED " + <the wire cause>` for `Err` — so
 * nothing here is an unhandled `Err` (no `?`, no panic path), and the ONE
 * closing query renders both outcomes the way theta CODE computed them,
 * independent of anything the model says back.
 */
function literalParamsInvokeCheckTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    'let good = "x"',
    'let bad = "zzz"',
    'let okResult = invoke("./b56livechild.theta", good)',
    'let badResult = invoke("./b56livechild.theta", bad)',
    "let okOutcome = match okResult {",
    '  Ok(_) => "ACCEPTED",',
    '  Err(e) => "REJECTED " + e.cause,',
    "}",
    "let badOutcome = match badResult {",
    '  Ok(_) => "ACCEPTED",',
    '  Err(e) => "REJECTED " + e.cause,',
    "}",
    "@`An intake probe reports GOOD=${okOutcome} BAD=${badOutcome}. Restate that pair, then answer: what is 284 plus 473?`",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0056: an invoke(...) argument outside a params: literal union's declared values is refused at the child's params intake, live (Convention: live-host acceptance)", () => {
  it("accepts an invoke(...) argument the declared literal union admits and refuses one it does not, through the real RFC-0006 marshalled-params AJV intake", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, either
      // invoke() outcome below could be (wrongly) attributed to a broken
      // workspace instead of the params literal-sublanguage lowering under
      // test.
      { source: "project", stem: "b56livectl", text: promptTheta("THETA-LIVE-OK") },
      { source: "project", stem: "b56livechild", text: literalParamsChildTheta() },
      { source: "project", stem: "b56livecheck", text: literalParamsInvokeCheckTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b56livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the params literal-sublanguage lowering under test, would explain " +
          "either invoke() outcome below too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b56livechild"),
        "the literal-typed-params callee did not register — its bind_model: " +
          "chain failed to resolve (a workspace/registry problem, not the " +
          "lowering under test). Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b56livecheck"),
        "the invoking parent did not register — precondition unmet before any " +
          "live turn is driven. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const turn = await driveSlashCaptureTurn(handle, "/b56livecheck");
      const outbound = turn.userTexts.join("\n");

      // THE CONTROL — the in-enum argument is accepted at BOTH the permissive
      // and the enforcing lowering (an empty schema admits everything; the
      // enforcing enum admits its own declared arm), isolating the fixed
      // observable below to the OUT-of-enum argument specifically rather than
      // to "invoke() to this callee never succeeds in this harness".
      expect(
        outbound,
        "the in-enum invoke() argument was not accepted — Registered: " +
          JSON.stringify(handle.registeredNames()) + "; outbound: " +
          JSON.stringify(turn.userTexts),
      ).toContain("GOOD=ACCEPTED");

      // THE FIXED OBSERVABLE. Pre-fix the `params:` position lowers the
      // permissive `{"anyOf":[{},{}]}` (an empty schema admits every JSON
      // value), so the out-of-enum argument is silently ACCEPTED at the
      // child's params intake too — `BAD=ACCEPTED`. Post-fix it lowers the
      // enforcing `{"type":"string","enum":["x","y"]}` (schema-subset.md:80,
      // bug 0055's landed spelling, bug 0056 §Fix constraint 1), so the SAME
      // argument is refused with `InvokeInfraError { cause: "validation" }`
      // (`refuseParams`, src/runtime/subagent-params.ts) — `BAD=REJECTED
      // validation`, rendered by theta CODE from the real `Result` the real
      // RFC-0006 child intake returned, never asserted on `prompt()` merely
      // resolving.
      expect(
        outbound,
        "the out-of-enum invoke() argument was not refused — the params: " +
          "position's literal sublanguage did not enforce at the child's " +
          "params intake (bug 0056 did not fire, or fired with an unexpected " +
          "cause). Registered: " + JSON.stringify(handle.registeredNames()) +
          "; outbound: " + JSON.stringify(turn.userTexts),
      ).toContain("BAD=REJECTED validation");
      expect(
        outbound,
        "the out-of-enum invoke() argument was accepted — the pre-fix " +
          "permissive lowering's own failure signature. outbound: " +
          JSON.stringify(turn.userTexts),
      ).not.toContain("BAD=ACCEPTED");

      // No fail-closed ending of the PARENT's own drive: both `invoke(...)`
      // results are `match`ed explicitly above (no `?`, no unhandled `Err`),
      // so this theta's own top-level outcome is Success either way — a
      // failure note here would mean the fixture itself is broken, not that
      // bug 0056 fired.
      const failureNotes = turn.systemNotes.filter((n) =>
        /^theta \/b56livecheck (returned Err|cancelled|aborted)/.test(n),
      );
      expect(
        failureNotes,
        "the invoking parent's own drive surfaced fail-closed system note(s) " +
          "— the fixture itself is broken: " + JSON.stringify(failureNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0059 — a `params:` right-hand side that is a YAML SCALAR carrying text
// no `Type` production spells (`p: "a: Tirage"`, and every other quoted or
// block-scalar spelling of the same bytes) fell past every arm of
// `lowerTypeExpr` to its trailing catch-all, lowered the permissive `{}` with
// ZERO diagnostics, and registered with a param that validated nothing
// (docs/bugs/0059-params-scalar-nontype-text-recorded-and-permissive.md).
// Bug 0041's node-shape gate (`paramValueCanCarryType`, src/parser/
// frontmatter.ts) admits every scalar whatever bytes it carries — it judges
// the YAML value NODE, not its text — so this class fell through the one gap
// between two correct decisions.
//
// The fix judges the RECOVERED TEXT once that node-shape gate has already
// admitted a scalar: `lowerTypeExpr`'s trailing catch-all (src/parser/
// params.ts) now appends the text it would otherwise lower permissively to an
// optional `LowerCtx` sink (`unspellable`), and `parseParams`'s per-field loop
// declines the recognised `LiteralType` atoms (bug 0056's `parseLiteralArm`)
// and every brace-carrying survivor, turning what remains into ONE
// error-severity `theta/load/params-type-not-expression` at the field —
// re-using the SAME registered code bug 0041's node-shape refusal already
// raises, now widened to a text-level judgement (code-registry-load.md:19).
// `hasLoadParseError` (production-composition.ts) un-registers the theta at
// the SAME site the bug 0070/0071/0077/0079(a)/0110/0084/0089/0095/0102/0125/
// 0050/0137/0139/0142/0148/0149/0081/0052 cells above exercise for their own
// codes.
//
// The 93-cell unit witness (tests/params-scalar-nontype-text-refusal.test.ts)
// proves the mechanism offline at the `parseThetaDocument` boundary — its own
// group (a) cell a13 (`p: "a: Tirage"`) is the fixture this live cell
// mirrors. This cell proves the SAME registered code denies REGISTRATION end
// to end through the real production composition root (session_start →
// resources_discover → composeExtensionInstance), which the offline harness
// cannot reach.
//
// The broken theta's single `params:` field is NOT the
// `classifyBinderBypass` (src/binder/binder-envelope.ts) single-string-bypass
// shape — its pre-fix recorded type is the junk text itself, never the
// literal string `"string"` — so, MEASURED against production-composition.ts's
// own binder-model-resolution step (the bug 0149 cell's own file-header note
// above), it needs a resolvable `bind_model:` to register independently of
// this bug; the fixture below carries one for exactly that reason, mirroring
// `b71livecallee`'s and `b102livebroken`'s own non-bypass callees above.
// Post-fix this never matters: `theta/load/params-type-not-expression` fires
// inside `parseThetaDocument` itself, collapsing the frontmatter to `null`
// before `composeExtensionInstance`'s per-theta loop ever reaches its
// binder-model-resolution step (production-composition.ts:3313's
// `document.frontmatter === null` arm drops the theta first).
//
// No existing live fixture (H8a in this file, the H9a acceptance fixtures, or
// the hardening probes) declares a `params:` field whose right-hand side is
// text outside the `Type` grammar: every `params:` occurrence across
// `tests/live/**` is a primitive, a literal union (the bug 0056 cell above),
// or a plain identifier default — matching the bug doc's own 17-file
// committed-fixture census, re-measured for this addition. The fixed arm had
// NO live reach at all before this cell.
//
// Registration-only: no slash command is invoked, so no model turn runs and
// the cell spends zero tokens (the same profile the bug 0052/0110/0148/0149
// cells above claim). ADDITIVE ONLY: no existing cell in this file is
// weakened, reworded, reordered or deleted.
// ===========================================================================

const PARAMS_TYPE_NOT_EXPRESSION_CODE = "theta/load/params-type-not-expression";

/** The sharded registry page carrying `theta/load/params-type-not-expression`'s row. */
const PARAMS_TYPE_NOT_EXPRESSION_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-load.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `theta/load/params-type-not-expression: 'params:' field '<param>'
 * right-hand side is not a theta type expression` — DIAG-4: the message half
 * is read from the registry row, not copied, mirroring this file's
 * `duplicateInlineFieldNameFragment` / `invokePathEscapeFragment` /
 * `unknownMethodFragment`. The row carries the one `<param>` placeholder, so
 * this helper fills it and the trailing assertion confirms no second
 * placeholder is left unsubstituted.
 */
function paramsTypeNotExpressionFragment(param: string): string {
  const template = registryMessage(
    PARAMS_TYPE_NOT_EXPRESSION_REGISTRY,
    PARAMS_TYPE_NOT_EXPRESSION_CODE,
  ) as string | undefined;
  expect(
    template,
    `${PARAMS_TYPE_NOT_EXPRESSION_CODE} has no registry row — the code this ` +
      "cell asserts is not registered (DIAG-2)",
  ).toBeTypeOf("string");
  const withSlot = template as string;
  expect(
    withSlot,
    `${PARAMS_TYPE_NOT_EXPRESSION_CODE}: the registry row's Message template ` +
      "must carry the <param> slot this cell fills — the row changed shape",
  ).toContain("<param>");
  const message = withSlot.replace("<param>", param);
  expect(
    message,
    `${PARAMS_TYPE_NOT_EXPRESSION_CODE}: the registry row's Message template ` +
      "grew a second unsubstituted placeholder this reader does not fill",
  ).not.toMatch(/<[a-z]+>/);
  return `${PARAMS_TYPE_NOT_EXPRESSION_CODE}: ${message}`;
}

/**
 * The bug doc's own §Reproduction fixture A, and the unit witness's cell a13,
 * verbatim: a `params:` field whose right-hand side is a double-quoted
 * scalar carrying YAML-mapping-shaped text no `Type` production spells.
 * `Tirage` is declared nowhere, so a resolvable `NamedType` can never be the
 * (wrong) explanation for either this theta's pre-fix registration or its
 * post-fix refusal. `bind_model:` is declared because the field's pre-fix
 * recorded type is the junk text itself, never bypass-eligible (file-header
 * note above) — needed only for the red-direction proof this cell's own
 * verification records, and inert post-fix (file-header note above).
 */
function junkParamsTypeTheta(): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    '  p: "a: Tirage"',
    "---",
    "1",
    "",
  ].join("\n");
}

/**
 * The same-shape SIBLING with the SAME field name, a VALID type — must still
 * register, isolating the broken theta's refusal to the junk type text
 * rather than to "a theta declaring `params:` at all cannot register in this
 * harness". `string` is the `classifyBinderBypass` single-string-bypass
 * shape, so this sibling needs no `bind_model:` and no resolvable binder
 * model to register (the bug 0149 cell's own measurement above; confirmed
 * again by this cell's own precondition assertion below).
 */
function conformantParamsTypeTheta(): string {
  return ["---", "mode: prompt", "params:", "  p: string", "---", "1", ""].join("\n");
}

describe("H8a-T — bug 0059: a params: right-hand side spelling no Type production draws params-type-not-expression and does not register, live (Convention: live-host acceptance)", () => {
  it("does not register a theta whose params: field right-hand side is junk type text, while its valid-type sibling and an unrelated control both register, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, the broken
      // theta's absence could be (wrongly) attributed to a broken workspace
      // instead of the params-type-not-expression rule under test.
      { source: "project", stem: "b59livectl", text: promptTheta("THETA-LIVE-OK") },
      // The same-shape sibling: the SAME field name, a VALID type — must
      // still register, isolating the refusal to the junk type text rather
      // than to "a theta declaring params: at all cannot register here".
      { source: "project", stem: "b59livegood", text: conformantParamsTypeTheta() },
      // The load-bearing broken theta: the bug doc's own §Reproduction
      // fixture A / unit-witness cell a13 spelling.
      { source: "project", stem: "b59livebroken", text: junkParamsTypeTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b59livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the params-type-not-expression rule under test, would explain the " +
          "broken theta's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b59livegood"),
        "the same field name with a VALID type did not register — a theta " +
          "declaring params: at all cannot register in this harness, " +
          "independent of this bug. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root
      // (not the offline parseThetaDocument harness the unit witness uses), a
      // theta whose params: field right-hand side is text no `Type`
      // production spells does NOT register — `lowerTypeExpr`'s catch-all
      // sink and `parseParams`'s per-field decline (src/parser/params.ts)
      // fire theta/load/params-type-not-expression, and hasLoadParseError
      // un-registers this theta at the SAME site the bug 0070/0071/0077/
      // 0079(a)/0110/0084/0089/0095/0102/0125/0050/0137/0139/0142/0148/0149/
      // 0081/0052 cells above exercise for their own codes.
      expect(
        handle.command("b59livebroken"),
        "the theta whose params: field right-hand side is junk type text " +
          "registered anyway through the live discovery/session_start path " +
          "— theta/load/params-type-not-expression did not fire. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b59livebroken");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager` rather
      // than off racy events: the diagnostic fires at LOAD time, before any
      // drive, so the full entry list is the delta (mirrors the bug 0110/
      // 0084/0089/0095/0102/0125/0050/0137/0139/0142/0148/0149/0081/0052
      // cells above).
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = paramsTypeNotExpressionFragment("p");
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the params-type-not-expression " +
          "rejection for the broken theta. Notes: " + JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0061 — a `schema` object-body field type, or a `schema X = …` alias/
// union arm, carrying text no `Type` production spells (an operator absorbed
// into the fragment with no operand behind it, a dangling `|`, or bare
// punctuation) was captured verbatim and lowered through `lowerTypeExpr`'s
// trailing catch-all to the permissive `{}` with zero diagnostics at either
// body position
// (docs/bugs/0061-nonparams-type-positions-keep-junk-arm-text-silent.md).
//
// The fix threads bug 0059's landed `LowerCtx.unspellable` sink
// (src/parser/params.ts) through `collectUnresolvedNamedTypes`'s existing
// optional out-parameter pattern (src/parser/body-type-lowering.ts) at the
// two body positions — the per-field call in `walkStatement`'s `schema` arm
// and the joined-arms call in `checkSchemaDeclarationGraph`
// (src/parser/theta-document.ts) — and refuses what the SAME shared decline
// bug 0059 already uses (`isUnspellableTextRefusable`, params.ts) does not
// admit, one error-severity `theta/parse/schema-type-not-expression` per
// offending fragment. `hasLoadParseError` (production-composition.ts)
// un-registers the theta at the SAME site the bug 0070/0071/0077/0079(a)/
// 0110/0084/0089/0095/0102/0125/0050/0137/0139/0142/0148/0149/0081/0052/0059
// cells above exercise for their own codes.
//
// The 96-cell unit witness (tests/schema-body-nontype-text-refusal.test.ts)
// proves the mechanism offline at the `parseThetaDocument` boundary — its own
// group (a) cell a3 (`schema S { a: string + }`) is the fixture this live
// cell mirrors. This cell proves the SAME registered code denies
// REGISTRATION end to end through the real production composition root
// (session_start → resources_discover → composeExtensionInstance), which the
// offline harness cannot reach.
//
// The broken theta mirrors the unit witness's field-position cell a3
// verbatim: the object-body field type `string +` absorbs the operator with
// no operand behind it, so pre-fix this shape loaded cleanly and registered a
// declaration that validated nothing at that field. The same-shape sibling
// (the field's type corrected to the well-formed `string`) isolates the
// refusal to the junk type text rather than to "a theta declaring this
// schema shape never registers here" — mirroring the bug 0052/0059 pairs
// above. Neither fixture declares `params:`, unlike the bug 0059 pair: the
// checker pass that raises this code (`walkStatement`'s `schema` arm) walks
// every body-level `schema` declaration directly, independent of whether any
// `params:` field ever references it, so the refusal fires with no
// `params:` block in either fixture.
//
// No existing live fixture (H8a in this file, the H9a acceptance fixtures, or
// the hardening probes) declares a `schema` object-body field type or an
// alias/union arm carrying text outside the `Type` grammar — confirmed by a
// fresh scan over every `tests/live/**` fixture and embedded theta source
// string at this HEAD — so the fixed arm had NO live reach at all before this
// cell.
//
// Registration-only: no slash command is invoked, so no model turn runs and
// the cell spends zero tokens (the same profile the bug 0052/0059/0110/0148/
// 0149 cells above claim). ADDITIVE ONLY: no existing cell in this file is
// weakened, reworded, reordered or deleted.
// ===========================================================================

const SCHEMA_TYPE_NOT_EXPRESSION_CODE = "theta/parse/schema-type-not-expression";

/** The sharded registry page carrying `theta/parse/schema-type-not-expression`'s row. */
const SCHEMA_TYPE_NOT_EXPRESSION_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `theta/parse/schema-type-not-expression: '<X>' declares a type that is not
 * a theta type expression` — DIAG-4: the message half is read from the
 * registry row, not copied, mirroring this file's
 * `paramsTypeNotExpressionFragment` / `duplicateInlineFieldNameFragment`. The
 * row carries the one `<X>` placeholder (the offending declaration's own
 * identifier, category 7), so this helper fills it and the trailing
 * assertion confirms no second placeholder is left unsubstituted.
 */
function schemaTypeNotExpressionFragment(declName: string): string {
  const template = registryMessage(
    SCHEMA_TYPE_NOT_EXPRESSION_REGISTRY,
    SCHEMA_TYPE_NOT_EXPRESSION_CODE,
  ) as string | undefined;
  expect(
    template,
    `${SCHEMA_TYPE_NOT_EXPRESSION_CODE} has no registry row — the code this ` +
      "cell asserts is not registered (DIAG-2)",
  ).toBeTypeOf("string");
  const withSlot = template as string;
  expect(
    withSlot,
    `${SCHEMA_TYPE_NOT_EXPRESSION_CODE}: the registry row's Message template ` +
      "must carry the <X> slot this cell fills — the row changed shape",
  ).toContain("<X>");
  const message = withSlot.replace("<X>", declName);
  expect(
    message,
    `${SCHEMA_TYPE_NOT_EXPRESSION_CODE}: the registry row's Message template ` +
      "grew a second unsubstituted placeholder this reader does not fill",
  ).not.toMatch(/<[a-zA-Z][a-zA-Z0-9-]*>/);
  return `${SCHEMA_TYPE_NOT_EXPRESSION_CODE}: ${message}`;
}

/**
 * The unit witness's own cell a3, verbatim: a top-level `schema` object-body
 * field type absorbs an operator with no operand behind it — text no `Type`
 * production spells (docs/bugs/0061-…md §Fix constraint 4).
 */
function schemaTypeNotExpressionSchemaTheta(): string {
  return ["---", "mode: prompt", "---", "schema S { a: string + }", ""].join("\n");
}

/**
 * The same-shape SIBLING with the SAME schema and field name, the field's
 * type corrected to the well-formed `string` — must still register, isolating
 * the broken theta's refusal to the junk type text rather than to "a theta
 * declaring this schema shape never registers here".
 */
function conformantSchemaFieldTypeTheta(): string {
  return ["---", "mode: prompt", "---", "schema S { a: string }", ""].join("\n");
}

describe("H8a-T — bug 0061: a schema object-body field type carrying text no Type production spells draws schema-type-not-expression and does not register, live (Convention: live-host acceptance)", () => {
  it("does not register a theta whose schema object-body field type is junk type text, while its valid-type sibling and an unrelated control both register, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, the broken
      // theta's absence could be (wrongly) attributed to a broken workspace
      // instead of the schema-type-not-expression rule under test.
      { source: "project", stem: "b61livectl", text: promptTheta("THETA-LIVE-OK") },
      // The same-shape sibling: the SAME schema and field name, a VALID type
      // — must still register, isolating the refusal to the junk type text
      // rather than to "a theta declaring this schema shape at all cannot
      // register here".
      { source: "project", stem: "b61livegood", text: conformantSchemaFieldTypeTheta() },
      // The load-bearing broken theta: the unit witness's own cell a3
      // spelling.
      { source: "project", stem: "b61livebroken", text: schemaTypeNotExpressionSchemaTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b61livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the schema-type-not-expression rule under test, would explain the " +
          "broken theta's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b61livegood"),
        "the same schema and field name with a VALID type did not register " +
          "— a theta declaring this schema shape at all cannot register in " +
          "this harness, independent of this bug. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root
      // (not the offline parseThetaDocument harness the unit witness uses), a
      // theta whose schema object-body field type is text no `Type`
      // production spells does NOT register — `lowerTypeExpr`'s catch-all
      // sink and `walkStatement`'s per-field decline (src/parser/
      // theta-document.ts) fire theta/parse/schema-type-not-expression, and
      // hasLoadParseError un-registers this theta at the SAME site the bug
      // 0070/0071/0077/0079(a)/0110/0084/0089/0095/0102/0125/0050/0137/0139/
      // 0142/0148/0149/0081/0052/0059 cells above exercise for their own
      // codes.
      expect(
        handle.command("b61livebroken"),
        "the theta whose schema object-body field type is junk type text " +
          "registered anyway through the live discovery/session_start path " +
          "— theta/parse/schema-type-not-expression did not fire. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b61livebroken");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager` rather
      // than off racy events: the diagnostic fires at LOAD time, before any
      // drive, so the full entry list is the delta (mirrors the bug 0110/
      // 0084/0089/0095/0102/0125/0050/0137/0139/0142/0148/0149/0081/0052/
      // 0059 cells above).
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = schemaTypeNotExpressionFragment("S");
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the schema-type-not-expression " +
          "rejection for the broken theta. Notes: " + JSON.stringify(notes),
      ).toBe(true);
      // The negative half: the valid-type sibling declares the IDENTICAL
      // schema name and field name, so a second occurrence of the code would
      // mean it fired for the sibling too rather than only for the junk text
      // — the code must appear exactly once across the whole session.
      expect(
        notes.filter((note) => note.includes(SCHEMA_TYPE_NOT_EXPRESSION_CODE)).length,
        "schema-type-not-expression must appear for the broken theta's " +
          "declaration and nowhere else. Notes: " + JSON.stringify(notes),
      ).toBe(1);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});


// ===========================================================================
// Bug 0066 — `#mergeDeclaredDefaults` (src/extension/production-theta-producer.ts)
// compiles the lowered `params:` schema, calls `fillDefaultsAndRevalidate`
// (src/binder/defaulting.ts), and returns `result.args` alone: `result.validation`
// has no reader anywhere in `src/`. The binder's AJV-on-`args` failure class is
// therefore never constructed from the binder path — a declared default whose
// value violates the field's own lowered fragment is filled into the merged
// `args`, the post-default-merge validation returns `ok: false`, the verdict is
// discarded, the BND-1 SUCCESS echo is emitted, and the theta body runs on the
// invalid value
// (docs/bugs/0066-ajv-verdict-discarded-unreachable-enforcement.md, element 1).
//
// This is the bug doc's §Reproduction (A), recorded LIVE at HEAD `d06daae3`
// with binder model `anthropic/claude-haiku-4-5`: three deterministic
// observables, all wrong — the note channel carrying
// `Running /<name>: … (default)` instead of the AJV-on-`args` row, `userTexts`
// proving the body ran with the invalid value interpolated, and a real turn
// spent on a theta the spec says must not have started. §Fix constraint 3 pins
// the post-fix disposition: `#emitBinderFailureNote(slashName, classification)`
// then `return { bound: false }`, BEFORE `#emitBinderEchoNote` — one note
// (`theta /<name>: argument binding produced invalid args — <ajv-summary>`,
// determinism-cancellation-failure.md:52), no retry (HC3-c,
// ceilings-3-and-4.md:11), and no body.
//
// THE DECLARED TYPE IS NOT THE BUG DOC'S `integer`. §Fix constraint 8 lands the
// load-time companion gate in the same commit, so `count: integer = "xyzzy"`
// stops loading altogether and cannot witness the runtime half. The fixture
// below uses an all-string-literal union instead — a declared type the compat
// relation resolves against an EMPTY environment (so it answers `"unknown"` and
// DEFERS, keeping the theta loadable; pinned in
// tests/params-default-type-compat.test.ts group (c) cell c1) whose lowered
// fragment `{"type":"string","enum":["x","y"]}` (schema-subset.md:80) AJV
// nevertheless refuses for `"zzz"` at the merge. The defaulted field is omitted
// from the lowered `required` (src/parser/params.ts), so the envelope's relaxed
// `args` copy (`relaxParamsSchema`, src/binder/binder-envelope.ts) and the
// extraction-time envelope AJV both accept an `ok` arm that omits it — the
// post-merge hook is the only place the filled value is ever checked, which is
// what makes this class unreachable by any earlier gate.
//
// WHAT THIS CELL ADDS OVER THE OFFLINE WITNESS. The unit cell
// (tests/binder-post-merge-ajv-enforcement.test.ts group (1)) drives the same
// production `runBinder` with the off-session `complete()` mocked, so it proves
// the routing but scripts the envelope. This cell proves a REAL binder pass
// against a real model produces the `ok` envelope with the defaulted field
// omitted — the input class the bug is about — and that the production note
// channel carries the refusal end to end through the shipped composition root
// (session_start → resources_discover → composeExtensionInstance).
//
// Token cost: ONE binder inference call against `anthropic/claude-haiku-4-5`
// (the same binder model every `bind_model:` fixture in this file already uses),
// plus — AT HEAD ONLY — the one body turn the defect lets through. Post-fix the
// body never runs, so the fixed path costs the binder call alone. No child
// process is spawned (prompt mode, no `invoke(...)`, no `subagent fn`).
//
// STOCHASTIC DEPENDENCE, STATED. The envelope the binder returns is a model
// output. The binder system prompt's last line instructs omission of defaulted
// parameters the user did not specify (src/binder/binder-system-prompt.ts), the
// slash argument names only `topic`, and §Reproduction (A) recorded exactly
// `{"envelope":{"kind":"ok","args":{"topic":"hello"}}}` for this params shape —
// but a binder that invented an in-arm value for `pick` would make the merge
// valid and this cell's fixed observable unreachable. That case is not a silent
// pass: the assertion below is POSITIVE (the refusal note must be present) and
// its failure message renders the whole note channel, so an invented value reds
// here naming what the channel carried instead. ADDITIVE ONLY: no existing cell
// in this file is weakened, reworded, reordered or deleted.
// ===========================================================================

/** The committed body sentinel — present in `userTexts` iff the body ran. */
const B66_SENTINEL = "SENTINEL-B66";

/** The AJV-on-`args` row's fixed phrase (determinism-cancellation-failure.md:52). */
const B66_AJV_ARGS_PHRASE = "argument binding produced invalid args";

/**
 * The expected note, composed from `renderFailureNote`'s rule-3 grammar
 * (`theta /<name>: <fixed-phrase> — <suffix>`, src/binder/system-note.ts; the
 * separator is U+2014 EM DASH). The `<ajv-summary>` suffix is the in-order
 * `<path> <message>` rendering of the merged-args verdict's single issue
 * (determinism-cancellation-failure.md:42) — AJV's own `enum` message for the
 * lowered fragment, re-derived offline against the production
 * `AjvSchemaValidator` on the same schema/value pair. The whole line is 108
 * code points, inside `capSystemNote`'s 120-code-point cap.
 */
const B66_EXPECTED_NOTE =
  "theta /b66livedef: " +
  B66_AJV_ARGS_PHRASE +
  " \u2014 /pick must be equal to one of the allowed values";

/**
 * The declared-default fixture: a required `string` plus a defaulted field whose
 * declared type is an all-string-literal union its own default value is not an
 * arm of. Two fields, so this is never `classifyBinderBypass`'s
 * single-string-bypass shape (src/binder/binder-envelope.ts) — it is a genuine
 * binder pass, which is why it needs a resolvable `bind_model:` to register.
 *
 * The body interpolates BOTH bound values behind a committed sentinel, so
 * `turn.userTexts` is the deterministic body-ran observable: at HEAD it carries
 * the rendered template with `pick=zzz`; post-fix the theta never starts and the
 * sentinel is absent from the outbound text entirely.
 */
function incompatibleDefaultBinderTheta(): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    "  topic: string",
    "  pick: '\"x\" | \"y\" = \"zzz\"'",
    "---",
    "@`" + B66_SENTINEL + " topic=${topic} pick=${pick}. What is 634 plus 115? Answer with the number only.`",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0066: a declared default its own lowered params fragment refuses does not bind, live (Convention: live-host acceptance)", () => {
  it("refuses a recovered default the post-default-merge AJV validation rejects, emitting the AJV-on-`args` note instead of the success echo and never running the body", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without it, an absent
      // refusal note below could be (wrongly) attributed to a broken workspace
      // instead of the discarded post-merge verdict under test.
      { source: "project", stem: "b66livectl", text: promptTheta("THETA-LIVE-OK") },
      { source: "project", stem: "b66livedef", text: incompatibleDefaultBinderTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b66livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the discarded post-default-merge verdict under test, would explain " +
          "the refusal note's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      // The theta MUST register: §Fix constraint 8's load-time gate defers on a
      // literal-union declared type (the compat relation resolves names against
      // an empty environment), so the value class survives to the runtime hook
      // this cell drives. A theta refused at load would leave element 1
      // unwitnessed rather than fixed.
      expect(
        handle.command("b66livedef"),
        "the declared-default theta did not register — either its bind_model: " +
          "chain failed to resolve (a registry problem) or the load-time gate " +
          "over-refused a declared type it must defer on, which would leave " +
          "the runtime hook unreachable rather than enforced. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The slash argument names ONLY the required field, so the binder has
      // nothing to say about `pick` and omits it per its system prompt's last
      // line — leaving the runtime's own fill-if-absent to supply `"zzz"`.
      const turn = await driveSlashCaptureTurn(handle, "/b66livedef hello");

      // THE FIXED OBSERVABLE, asserted FIRST and POSITIVELY so a red names what
      // the channel actually carried. Read off the settled in-memory
      // `SessionManager` (AGENTS.md §"Assert on real observables"), never off
      // `prompt()` merely resolving — a fail-closed binder still resolves.
      expect(
        turn.systemNotes,
        "the theta-system-note channel carries no AJV-on-`args` row for a " +
          "merged-args document the post-default-merge validation refused — " +
          "`result.validation` still has no reader, so a passing and a failing " +
          "merged-args validation are indistinguishable. Notes: " +
          JSON.stringify(turn.systemNotes) +
          "; outbound: " + JSON.stringify(turn.userTexts),
      ).toContain(B66_EXPECTED_NOTE);

      // The echo's SUPPRESSION — §Fix constraint 3 moves the `bind_echo` note
      // after the verdict. HEAD's own failure signature is the success echo
      // `Running /b66livedef: topic=hello, pick=zzz (default)`, with the
      // `(default)` tag firing exactly when it should (which is why the echo
      // asserts the bind worked while the bound value is one the declared type
      // says is impossible).
      expect(
        turn.systemNotes.filter((n) => n.startsWith("Running /b66livedef")),
        "the BND-1 success echo was emitted for a refused merge — the pre-fix " +
          "signature §Reproduction (A) recorded. Notes: " +
          JSON.stringify(turn.systemNotes),
      ).toEqual([]);

      // The body did not run. `userTexts` is the deterministic outbound-render
      // channel (the exact text theta CODE computed and sent), so the sentinel's
      // absence is the "no turn was spent on a theta that must not have
      // started" observable — independent of anything the model replied.
      expect(
        turn.userTexts.filter((t) => t.includes(B66_SENTINEL)),
        "the theta body ran and sent a turn: the invalid default reached body " +
          "scope and was interpolated into the outbound query text, which is " +
          "the corruption class this bug reports at the parameter boundary. " +
          "Outbound: " + JSON.stringify(turn.userTexts),
      ).toEqual([]);

      // No OTHER fail-closed ending: the refusal is a binder-arm short-circuit
      // (the theta never starts), not an SLSH-3 err note, a cancellation or a
      // panic framing. A note from that set here would mean the fixture broke
      // rather than that bug 0066's arm fired.
      const failureNotes = turn.systemNotes.filter((n) =>
        /^theta \/b66livedef (returned Err|cancelled|aborted)/.test(n),
      );
      expect(
        failureNotes,
        "the drive ended through a different fail-closed path than the " +
          "AJV-on-`args` binder arm: " + JSON.stringify(failureNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0067 — the `invoke` return of a subagent-mode callee re-entered its
// parent as raw `JSON.parse` output with no inbound translation pass: a named-
// enum variant crossing the PIC-59 envelope lost its declaring-enum tag, so
// `v == Sev.High` was `false` in the parent where the identical value compared
// `true` in the child (`docs/bugs/0067-subagent-envelope-drops-enum-tag.md`).
// The fix runs the `runtime-value-model.md` §"Wire-name translation" inbound
// pass in `#validateInvokeReturn`, after AJV, for the typed `invoke<Schema>`
// form.
//
// No existing live cell asserts enum-tag SURVIVAL across the envelope. The
// forged-ingress pair above (bug 0020) drives the SAME typed-`invoke`-into-
// subagent-child shape and now additionally exercises this fix's `SCHEMA_TAG`
// re-brand half (the bound `Forged` value gains a schema brand it lacked
// before), but its own assertion is on the OUTBOUND-rendered compact JSON,
// which is byte-identical whether or not the brand is present (the brand is a
// non-enumerable symbol property, invisible to `JSON.stringify` —
// `docs/spec_topics/runtime-value-model.md:16`) — so that cell cannot witness
// this fix's INBOUND half at all, by construction. This cell closes that gap
// with the shallowest position `runtime-value-model.md:34`'s "tags are
// attached at the same depth as the value the schema annotates" describes: a
// bare named-enum variant at the envelope root.
//
// `b67livesevkid` is a `mode: subagent` callee whose tail is a bare enum
// variant — a pure expression, zero model turns, zero tokens (mirrors
// `tests/subagent-invoke-inbound-enum-tag.test.ts`'s provider-free `kid.theta`
// exactly, driven here through the shipped extension entry against a live
// host rather than the raw launcher). `b67livesevparent` is a `mode: prompt`
// caller whose typed `invoke<Sev>("./b67livesevkid.theta")` binds the
// envelope through the real production return-validation + inbound-
// translation gate, then compares the bound value against its own locally
// constructed `Sev.High`. Pre-fix the comparison is a cross-type `false`
// (`valuesEqual`, `src/runtime/value.ts`: one operand tagged, one a bare wire
// string); post-fix it is `true`. The comparison is a `boolean`, so QRY-18's
// boolean row (`stringifyInterpolatedValue`, `src/render/query-render.ts`)
// renders it as the literal `true` / `false` — a marker-anchored,
// deterministic segment of `turn.userTexts`, independent of what the model
// replies to the one dispatched query (the same read this file's
// forged-ingress and bug-0080 cells already use).
//
// Token cost: one dispatched query in the parent (the same profile as the
// forged-ingress cell above); the callee spends none.
//
// ADDITIVE ONLY: no existing cell in this file is weakened, reworded,
// reordered, or deleted.
// ===========================================================================

/** The `mode: subagent` callee: a pure named-enum tail, zero model turns. */
function b67SevEnumKidTheta(): string {
  return ["---", "mode: subagent", "---", 'enum Sev { High = "high" }', "Sev.High"].join("\n");
}

/**
 * The `mode: prompt` parent: a typed `invoke<Sev>` binds the envelope, then
 * the boolean comparison against the parent's own `Sev.High` is interpolated
 * between markers so the rendered text — not the model's reply — is the
 * observable.
 */
function b67SevEnumParentTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    'enum Sev { High = "high" }',
    'let v = invoke<Sev>("./b67livesevkid.theta")?',
    "@`SEVCROSS=${v == Sev.High}/${v == \"high\"}|END What is 526 plus 142? Answer with the number only.`",
  ].join("\n");
}

describe("H8a-T — bug 0067: a named-enum value crossing the PIC-59 envelope regains its tag, live", () => {
  it("a typed invoke<Sev> binds a spawned subagent child's bare enum variant, and it compares equal to the parent's own Sev.High", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      { source: "project", stem: "b67livesevparent", text: b67SevEnumParentTheta() },
      { source: "project", stem: "b67livesevkid", text: b67SevEnumKidTheta() },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the parent command must exist before a live turn is
      // driven, so a discovery/parse failure reds with zero tokens.
      expect(
        handle.command("b67livesevparent"),
        "no bug-0067 enum-cross parent command to invoke — the .theta failed " +
          "discovery/parse. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const turn = await driveSlashCaptureTurn(handle, "/b67livesevparent");
      const outbound = turn.userTexts.join("\n");
      // Marker-anchored extraction of the rendered `${...}` segment — the
      // exact text theta code computed from the envelope-bound comparison
      // (fails loudly when the query never rendered, e.g. the invoke Err'd).
      const anchored = /SEVCROSS=([\s\S]*?)\|END/.exec(outbound);
      expect(
        anchored,
        "the parent query's rendered text (SEVCROSS=…|END) is absent — the " +
          "invoke did not resolve Ok. Outbound user texts: " +
          JSON.stringify(turn.userTexts) + "; system notes: " +
          JSON.stringify(turn.systemNotes),
      ).not.toBeNull();
      // THE POST-0337 OBSERVABLE. runtime-value-model.md:34 — at the invoke-
      // return boundary the reattached tag keys on the CALLEE's declaring
      // file, so the returned variant is `!=` the caller's own same-named
      // Sev.High (`v == Sev.High` → false), and being tagged it is not the
      // bare wire string either (`v == "high"` → false): both read `false`.
      expect(
        anchored![1],
        "runtime-value-model.md:34 — a named-enum value returned by a " +
          "subagent-mode callee across a typed invoke<Sev> keys its tag on " +
          "the callee's declaring file: it is `!=` the caller's own Sev.High " +
          '(v == Sev.High → false) and not the bare wire string (v == "high" ' +
          "→ false). Rendered segment: " + JSON.stringify(anchored![1]),
      ).toBe("false/false");
      // No fail-closed ending of the drive (invoke infra errors and Err tails
      // land here — absence is the success observable).
      const failureNotes = turn.systemNotes.filter((n) =>
        /^theta \/b67livesevparent (returned Err|cancelled|aborted)/.test(n),
      );
      expect(
        failureNotes,
        "the enum-cross drive surfaced fail-closed system note(s): " +
          JSON.stringify(failureNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0166 — `firstNonLiteral`'s `neg` arm (the `params:`-default is-literal
// check) tested only that a unary `-` operand parsed to a `literal` node, so
// the sublanguage's OWN carve-out (`PrimitiveLit ::= … | "-" NUMBER`,
// grammar.md:20–24) admitted `-` over a string, boolean or `null` literal too:
// `p: 'boolean = -true'` loaded with zero diagnostics and, driven through the
// real binder, bound `p = -1` — a value the source does not spell — behind a
// `default=-true` prompt token and a `p=-1 (default)` success echo. The fix
// narrows both readers of the position (`firstNonLiteral`'s `neg` arm and
// bug 0066's `primitiveLiteralType`'s `neg` arm) through one shared
// `isNumericLiteralOperand` predicate, so a non-numeric operand is refused as
// the `neg` node itself (`theta/parse/default-not-literal`) and the numeric
// carve-out (`"-" NUMBER`) keeps its exact verdicts
// (docs/bugs/0166-unary-minus-default-admits-non-numeric-literal.md).
//
// No existing live fixture (H8a, H9a, or the hardening probes) declares a
// `params:` default carrying a unary `-` over a non-numeric literal — the
// corpus census the bug doc re-runs at HEAD (34 committed `.theta`/`.thetalib`
// files, 17 with `params:`, exactly one committed default —
// `tests/live/acceptance/fixtures/acc-params-binder.theta`'s
// `count: number = 3`, which carries no unary `-` at all) — so neither this
// defect's admission nor its fix had any live reach before this cell, mirroring
// the bug 0102 cell's own "no existing live fixture reaches this arm" finding
// for the neighbouring rule in the SAME per-field default loop.
//
// THIS CELL DRIVES BOTH DIRECTIONS THE BUG DOC PINS AS ONE FENCE (§Fix
// (e)(4)/(e)(7)): `b166livebadneg`'s `params:` default `boolean = -true` (the
// bug doc's own headline §Reproduction (c) row) must not register — the SAME
// per-field default loop / `hasLoadParseError` site the bug 0102/0110/0125
// cells above exercise for their own codes — while `b166livenum`'s
// `integer = -1` (the ONE unary form the sublanguage derives) must not only
// register but actually BIND through a real live binder pass, echoing
// `p=-1 (default)` — the over-fire fence measured end to end rather than by
// registration alone, mirroring the bug 0066 cell's own real-binder drive
// immediately above.
//
// Token cost: the refused theta and its precondition control are load-time-
// only (zero tokens, the same profile as the bug 0070/0071/0077/0079(a)/0110/
// 0084/0089/0095/0102/0125 cells above); the numeric-default fence spends ONE
// binder inference call against `anthropic/claude-haiku-4-5` (the same binder
// model every `bind_model:` fixture in this file already uses) plus the one
// body turn its own `@`-query dispatches once bound — the same two-call
// profile the bug 0066 cell's fixture spends. ADDITIVE ONLY: no existing cell
// in this file is weakened, reworded, reordered or deleted.
// ===========================================================================

/** `theta/parse/default-not-literal`'s registered code (bug 0166 narrows its Trigger to the numeric carve-out; code-registry-parse.md:48) and its registry page. */
const DEFAULT_NOT_LITERAL_CODE = "theta/parse/default-not-literal";
const DEFAULT_NOT_LITERAL_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `theta/parse/default-not-literal: params default RHS must be a
 * literal-sublanguage form; offending sub-expression: <expr>` with `<expr>`
 * substituted — DIAG-4: the message half is read from the registry row, not
 * copied, mirroring this file's existing `literalNewlineInStringFragment` /
 * `unknownMethodFragment` / `invokePathEscapeFragment` helpers.
 */
function defaultNotLiteralFragment(expr: string): string {
  const template = registryMessage(
    DEFAULT_NOT_LITERAL_REGISTRY,
    DEFAULT_NOT_LITERAL_CODE,
  ) as string | undefined;
  expect(
    template,
    `${DEFAULT_NOT_LITERAL_CODE} has no registry row — the code this cell ` +
      "asserts is not registered (DIAG-2)",
  ).toBeTypeOf("string");
  const message = (template as string).replaceAll("<expr>", expr);
  expect(
    message,
    `${DEFAULT_NOT_LITERAL_CODE}: an unsubstituted <…> placeholder remains — ` +
      "the registry row's Message template changed shape and this cell's " +
      "substitution is stale",
  ).not.toMatch(/<[a-z]+>/);
  return `${DEFAULT_NOT_LITERAL_CODE}: ${message}`;
}

/** The committed body sentinel for the numeric-default fence — present in `userTexts` iff its body ran. */
const B166_SENTINEL = "SENTINEL-B166";

/**
 * The load-bearing refused theta: bug 0166's own headline shape
 * (§Reproduction (c) row 1) — a unary `-` over a BOOLEAN literal under a
 * decidable declared half. A resolvable `bind_model:` keeps the isolated
 * diagnostic unambiguous (mirrors the bug 0102 cell's header note: a
 * defaulted `params:` field is never `single-string-bypass`-eligible, so
 * without a pin the theta would also depend on this ephemeral workspace's
 * absent ambient settings for a resolvable model).
 */
function nonNumericNegDefaultTheta(): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    "  p: 'boolean = -true'",
    "---",
    '"ok"',
    "",
  ].join("\n");
}

/**
 * The over-fire fence, driven for real: the ONE unary form the sublanguage
 * derives (`"-" NUMBER`, grammar.md:20–24) under a REQUIRED `topic` field (two
 * typed `params:` fields, so `classifyBinderBypass` routes to a genuine
 * `binder` pass rather than single-string bypass — the same shape bug 0066's
 * `incompatibleDefaultBinderTheta` above uses). The body interpolates both
 * bound values behind the committed sentinel so `userTexts` is the
 * deterministic body-ran observable, independent of the model's reply.
 */
function numericNegDefaultBinderTheta(): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    "  topic: string",
    "  p: 'integer = -1'",
    "---",
    "@`" + B166_SENTINEL + " topic=${topic} p=${p}. What is 358 plus 426? Answer with the number only.`",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0166: a params: default's unary `-` over a non-numeric literal does not register, live (Convention: live-host acceptance)", () => {
  it("does not register a caller whose params: default negates a non-numeric literal, while its numeric-default sibling still registers and binds through a real binder pass", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without it, the refused
      // theta's absence below could be (wrongly) attributed to a broken
      // workspace instead of the narrowed is-literal check under test.
      { source: "project", stem: "b166livectl", text: promptTheta("THETA-LIVE-OK") },
      // The load-bearing caller: `boolean = -true`, refused post-fix.
      { source: "project", stem: "b166livebadneg", text: nonNumericNegDefaultTheta() },
      // The over-fire fence: `integer = -1`, the carve-out's positive control.
      { source: "project", stem: "b166livenum", text: numericNegDefaultBinderTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b166livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the narrowed is-literal check under test, would explain the refused " +
          "theta's absence too. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The over-fire fence must register too, BEFORE the refusal is asserted:
      // isolating the refusal below to the non-numeric operand specifically,
      // not to "no defaulted params: theta ever registers in this harness".
      expect(
        handle.command("b166livenum"),
        "the numeric-default sibling did not register — precondition unmet " +
          "(the ONE unary form the sublanguage derives, `\"-\" NUMBER`, must " +
          "keep registering; over-refusal here would hide the refusal below " +
          "inside a broken control rather than a targeted fix). Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // THE FIXED OBSERVABLE: through the REAL production composition root
      // (not the offline `parseThetaDocument` harness the unit witness uses),
      // the caller whose params: default is `boolean = -true` does not
      // register — theta/parse/default-not-literal now fires from the SAME
      // per-field default loop the bug 0102/0110/0125 cells above exercise for
      // their own codes.
      expect(
        handle.command("b166livebadneg"),
        "the caller whose params: default is `boolean = -true` registered " +
          "anyway through the live discovery/session_start path — " +
          "theta/parse/default-not-literal did not fire for a unary `-` over a " +
          "non-numeric literal. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b166livebadneg");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager`: the
      // diagnostic fires at LOAD time, before any drive, so the full entry
      // list is the delta (mirrors the bug 0102/0110/0125 cells above).
      const loadNotes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = defaultNotLiteralFragment("-true");
      expect(
        loadNotes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the default-not-literal rejection for " +
          "the non-numeric unary-minus default. Notes: " + JSON.stringify(loadNotes),
      ).toBe(true);

      // THE OVER-FIRE FENCE, driven for real: the ONE unary form the
      // sublanguage derives must still BIND end to end through a real binder
      // pass, not merely register. The slash argument names only the required
      // `topic` field, so the binder omits `p` per its own system prompt's
      // last line and the runtime's fill-if-absent supplies the declared
      // default (defaulting-system-note-echo.md:9) — the recovered value is
      // the numeric literal's own negation (`-1`), the direction that must
      // survive the narrowing untouched.
      const turn = await driveSlashCaptureTurn(handle, "/b166livenum hello");
      expect(
        turn.systemNotes,
        "the numeric-default sibling must bind and echo `p=-1 (default)` — the " +
          "over-fire fence for the narrowing under test. Notes: " +
          JSON.stringify(turn.systemNotes) + "; outbound: " + JSON.stringify(turn.userTexts),
      ).toContain("Running /b166livenum: topic=hello, p=-1 (default)");
      expect(
        turn.userTexts.some((t) => t.includes(B166_SENTINEL)),
        "the numeric-default sibling's body must have run — the fence would be " +
          "vacuous if the theta bound but never dispatched its query. Outbound: " +
          JSON.stringify(turn.userTexts),
      ).toBe(true);
      const failureNotes = turn.systemNotes.filter((n) =>
        /^theta \/b166livenum (returned Err|cancelled|aborted)/.test(n),
      );
      expect(
        failureNotes,
        "the numeric-default sibling's drive surfaced fail-closed system " +
          "note(s) instead of binding cleanly: " + JSON.stringify(failureNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0165 — `splitParamValue` (src/parser/frontmatter.ts:636) cuts a
// `params:` field's scalar at its first top-level `=` and trims both halves,
// so a trailing `=` with nothing (or only whitespace) after it yields a
// DEFINED but EMPTY `defaultSource`. `hasDefault` is keyed on definedness
// alone, the field is dropped from `required` on the same test, and the
// block lowers with zero diagnostics: `p: 'string = '` registered, rendered
// `  p (string) default=` in the binder system prompt, and — because
// invocation-time recovery cannot parse an empty literal either — bound
// `null` for a non-nullable declared param on a caller that loaded clean
// (docs/bugs/0165-empty-params-default-literal-admitted-and-never-bound.md).
//
// THE SETTLED ROUTE IS §Fix (a): `parseParams`'s per-field default loop gains
// a THIRD rule, behind the bug-0059 type-half suppression guard (`typeRefused`,
// src/parser/params.ts) and ahead of the bug-0102 raw-newline rule and the
// is-literal call (both in the same loop) — a `defaultSource` that is empty or
// whitespace-only after trim draws the new registered code
// `theta/parse/default-without-literal` and `parseParams`'s `hasError` gate
// then withholds the lowered document, so the theta never registers at all.
//
// No existing live fixture (H8a, H9a, or the hardening probes) declares an
// empty or whitespace-only `params:` default — the corpus census the bug doc
// re-runs at HEAD (34 committed `.theta`/`.thetalib` files, 17 with
// `params:`, exactly one committed default — `acc-params-binder.theta`'s
// `count: number = 3`, well-formed) — so neither the defect nor its fix had
// any live reach before this cell.
//
// THIS CELL DRIVES BOTH DIRECTIONS THE BUG DOC PINS AS ONE FENCE: the caller
// whose `params:` default is the empty spelling `string = ` must not
// register — the SAME per-field default loop / `hasLoadParseError` site the
// bug 0102/0110/0125/0166 cells above exercise for their own codes — while
// its well-formed-default sibling (`string = "ok"`) must not only register
// but actually BIND through a real live binder pass, echoing `p=ok (default)`
// — the over-fire fence measured end to end rather than by registration
// alone, mirroring the bug 0066 and bug 0166 cells' own real-binder drives
// above.
//
// Token cost: the refused theta and its precondition control are load-time-
// only (zero tokens, the same profile as the bug 0070/0071/0077/0079(a)/0110/
// 0084/0089/0095/0102/0125/0166 cells above); the well-formed-default fence
// spends ONE binder inference call against `anthropic/claude-haiku-4-5` (the
// same binder model every `bind_model:` fixture in this file already uses)
// plus the one body turn its own `@`-query dispatches once bound. ADDITIVE
// ONLY: no existing cell in this file is weakened, reworded, reordered or
// deleted.
// ===========================================================================

/** `theta/parse/default-without-literal`'s registered code (§Fix (a); code-registry-parse.md:49) and its registry page. */
const DEFAULT_WITHOUT_LITERAL_CODE = "theta/parse/default-without-literal";
const DEFAULT_WITHOUT_LITERAL_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `theta/parse/default-without-literal: params default for '<field>' is
 * empty; '=' must be followed by a literal-sublanguage form` with `<field>`
 * substituted — DIAG-4: the message half is read from the registry row, not
 * copied, mirroring this file's existing `defaultNotLiteralFragment` /
 * `invokePathEscapeFragment` helpers.
 */
function defaultWithoutLiteralFragment(field: string): string {
  const template = registryMessage(
    DEFAULT_WITHOUT_LITERAL_REGISTRY,
    DEFAULT_WITHOUT_LITERAL_CODE,
  ) as string | undefined;
  expect(
    template,
    `${DEFAULT_WITHOUT_LITERAL_CODE} has no registry row — the code this cell ` +
      "asserts is not registered (DIAG-2)",
  ).toBeTypeOf("string");
  const message = (template as string).replaceAll("<field>", field);
  expect(
    message,
    `${DEFAULT_WITHOUT_LITERAL_CODE}: an unsubstituted <…> placeholder remains — ` +
      "the registry row's Message template changed shape and this cell's " +
      "substitution is stale",
  ).not.toMatch(/<[a-z]+>/);
  return `${DEFAULT_WITHOUT_LITERAL_CODE}: ${message}`;
}

/** The committed body sentinel for the well-formed-default fence — present in `userTexts` iff its body ran. */
const B165_SENTINEL = "SENTINEL-B165";

/**
 * The load-bearing refused theta: the bug doc's own headline shape
 * (§Reproduction (a) row 1) — a `string` field whose `=` is followed by one
 * space and nothing else. A resolvable `bind_model:` keeps the isolated
 * diagnostic unambiguous (mirrors the bug 0166 cell's own header note: a
 * defaulted `params:` field is never `single-string-bypass`-eligible, so
 * without a pin the theta would also depend on this ephemeral workspace's
 * absent ambient settings for a resolvable model).
 */
function emptyDefaultTheta(): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    "  p: 'string = '",
    "---",
    '"ok"',
    "",
  ].join("\n");
}

/**
 * The over-fire fence, driven for real: the field's well-formed sibling — the
 * same spelling one keystroke over, `string = "ok"` — under a REQUIRED
 * `topic` field (two typed `params:` fields, so `classifyBinderBypass` routes
 * to a genuine `binder` pass rather than single-string bypass — the same
 * shape the bug 0066 and bug 0166 cells above use). The body interpolates
 * both bound values behind the committed sentinel so `userTexts` is the
 * deterministic body-ran observable, independent of the model's reply.
 */
function wellFormedDefaultBinderTheta(): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    "  topic: string",
    '  p: \'string = "ok"\'',
    "---",
    "@`" + B165_SENTINEL + " topic=${topic} p=${p}. What is 275 plus 318? Answer with the number only.`",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0165: a params: default with no literal after `=` does not register, live (Convention: live-host acceptance)", () => {
  it("does not register a caller whose params: default is empty, while its well-formed-default sibling still registers and binds through a real binder pass", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without it, the refused
      // theta's absence below could be (wrongly) attributed to a broken
      // workspace instead of the new declaration-form refusal under test.
      { source: "project", stem: "b165livectl", text: promptTheta("THETA-LIVE-OK") },
      // The load-bearing caller: `string = `, refused post-fix.
      { source: "project", stem: "b165liveempty", text: emptyDefaultTheta() },
      // The over-fire fence: `string = "ok"`, the refusal's positive control.
      { source: "project", stem: "b165livewf", text: wellFormedDefaultBinderTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b165livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the new declaration-form refusal under test, would explain the " +
          "refused theta's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The over-fire fence must register too, BEFORE the refusal is asserted:
      // isolating the refusal below to the EMPTY default specifically, not to
      // "no defaulted params: theta ever registers in this harness".
      expect(
        handle.command("b165livewf"),
        "the well-formed-default sibling did not register — precondition " +
          "unmet (a default whose RHS IS a literal-sublanguage form must keep " +
          "registering; over-refusal here would hide the refusal below inside " +
          "a broken control rather than a targeted fix). Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // THE FIXED OBSERVABLE: through the REAL production composition root
      // (not the offline `parseThetaDocument` harness the unit witness uses),
      // the caller whose params: default is `string = ` does not register —
      // theta/parse/default-without-literal now fires from the SAME per-field
      // default loop the bug 0102/0110/0125/0166 cells above exercise for
      // their own codes.
      expect(
        handle.command("b165liveempty"),
        "the caller whose params: default is `string = ` registered anyway " +
          "through the live discovery/session_start path — " +
          "theta/parse/default-without-literal did not fire for an empty " +
          "default RHS. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b165liveempty");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager`: the
      // diagnostic fires at LOAD time, before any drive, so the full entry
      // list is the delta (mirrors the bug 0102/0110/0125/0166 cells above).
      const loadNotes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = defaultWithoutLiteralFragment("p");
      expect(
        loadNotes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the default-without-literal " +
          "rejection for the empty default. Notes: " + JSON.stringify(loadNotes),
      ).toBe(true);

      // THE OVER-FIRE FENCE, driven for real: the well-formed sibling must
      // still BIND end to end through a real binder pass, not merely
      // register. `topic=` is labelled because a real binder pass must not
      // hinge on the model inferring a required parameter's name from an
      // unlabelled bareword (bug 0283). The binder omits `p`, so the
      // runtime's fill-if-absent supplies the declared default
      // (defaulting-system-note-echo.md:9) — the recovered value is the
      // string literal's own content (`"ok"`).
      const turn = await driveSlashCaptureTurn(handle, "/b165livewf topic=hello");
      expect(
        turn.systemNotes,
        "the well-formed-default sibling must bind and echo `p=ok (default)` " +
          "— the over-fire fence for the refusal under test. Notes: " +
          JSON.stringify(turn.systemNotes) + "; outbound: " + JSON.stringify(turn.userTexts),
      ).toContain("Running /b165livewf: topic=hello, p=ok (default)");
      expect(
        turn.userTexts.some((t) => t.includes(B165_SENTINEL)),
        "the well-formed-default sibling's body must have run — the fence " +
          "would be vacuous if the theta bound but never dispatched its " +
          "query. Outbound: " + JSON.stringify(turn.userTexts),
      ).toBe(true);
      const failureNotes = turn.systemNotes.filter((n) =>
        /^theta \/b165livewf (returned Err|cancelled|aborted)/.test(n),
      );
      expect(
        failureNotes,
        "the well-formed-default sibling's drive surfaced fail-closed system " +
          "note(s) instead of binding cleanly: " + JSON.stringify(failureNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0159 — `theta/parse/duplicate-inline-field-name`'s comparison was keyed
// off the type grammar's own retained `Ident ":"` positions, which stop at an
// inline interior's first malformed entry — including a stop-masked entry
// whose own field-name position holds nothing before the colon (`: x`). A
// genuine repeat of `a` on either side of that stop drew ZERO diagnostics and
// still minted the duplicate `required` entry / last-wins property drop the
// rule exists to refuse
// (docs/bugs/0159-inline-field-name-stop-masks-duplicate.md §Reproduction row
// 1). §Fix route (a) re-keys the comparison onto the SAME
// `splitTopLevel`+`topLevelColon` tokenisation `hoistInlineObjectType`
// (params.ts) and `lowerInlineObject` (body-type-lowering.ts) already use to
// build `properties`/`required`, so the rule now agrees with the lowering BY
// CONSTRUCTION and the masked shape is refused like any other repeat.
//
// The load-bearing broken theta is 0159 §Reproduction (a) row 1 verbatim, at
// the SAME hoisting position the bug 0052 cell above exercises (`schema`-body
// field type): `{a: integer, : x, a: boolean}`. Pre-fix this loaded cleanly
// (the `: x` entry stood at the field-name position with no leading
// identifier, ending the retained `fieldNames` comparison before the second
// `a`), registered, and hoisted a `$defs` entry carrying `required: ["a","a"]`
// beside a last-wins `properties.a` — the exact consequence bug 0052
// §Expected forbids. The same-shape sibling keeps the identical malformed
// middle entry and renames only the SECOND field to `b`, isolating the
// refusal to the REPEATED name rather than to "a theta whose inline object
// carries a stop-masked entry cannot register here" — the same no-co-firing
// discipline the bug 0052 cell's own sibling establishes.
//
// No existing live fixture (H8a in this file, the H9a acceptance fixtures, or
// the hardening probes) declares an inline object type carrying a
// field-name-position entry with no leading identifier anywhere before this
// cell: the sole committed inline object type remains
// `tests/live/acceptance/fixtures/acc-typed-inline.theta`'s
// `{ ok: boolean, label: string }` (the bug 0052 cell above already pins this
// as the only inline `ObjectType` in the corpus), so the widened
// `inlineObjectFieldKeys` arm had NO live reach at all before this addition.
//
// Registration-only: no slash command is invoked, so no model turn runs and
// the cell spends zero tokens (the bug 0052 cell's own profile, immediately
// above). ADDITIVE ONLY: no existing cell in this file (1–34) is weakened,
// reworded, reordered or deleted.
// ===========================================================================

/**
 * The load-bearing broken theta: bug 0159 §Reproduction (a) row 1, at the
 * schema-body field position (one of the three HOISTING positions, §Fix
 * constraint 1 — the lowering does not move). The middle entry `: x` stands
 * at a field-name position with no leading identifier — the FIRST of the
 * three stop shapes bug 0159 names — so pre-fix the retained `fieldNames`
 * comparison ended there and the trailing `a: boolean` repeat of the first
 * `a: integer` was never compared. Post-fix, `inlineObjectFieldKeys` splits
 * the interior on its top-level commas regardless of that stop, and the two
 * `a` entries collide.
 */
function stopMaskedDuplicateInlineFieldNameSchemaTheta(): string {
  return ["---", "mode: prompt", "---", "schema S { p: {a: integer, : x, a: boolean} }", ""].join(
    "\n",
  );
}

/**
 * The same-shape SIBLING: the identical malformed middle entry (`: x`) at the
 * identical position, with only the SECOND field renamed `b` — must still
 * register, isolating the broken theta's refusal to the repeated name rather
 * than to "a theta whose inline object carries a stop-masked entry never
 * registers here".
 */
function stopMaskedDistinctNamesSchemaTheta(): string {
  return ["---", "mode: prompt", "---", "schema S { p: {a: integer, : x, b: boolean} }", ""].join(
    "\n",
  );
}

describe("H8a-T — bug 0159: a stop-masked repeated inline field name draws duplicate-inline-field-name and does not register, live (Convention: live-host acceptance)", () => {
  it("does not register a theta whose inline object type repeats a field name behind a stop-masking malformed entry, while its distinct-names sibling and an unrelated control both register, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, the broken
      // theta's absence could be (wrongly) attributed to a broken workspace
      // instead of the widened duplicate-inline-field-name rule under test.
      { source: "project", stem: "b159livectl", text: promptTheta("THETA-LIVE-OK") },
      // The same-shape sibling: the SAME schema, the SAME malformed middle
      // entry, distinct names — must still register, isolating the refusal to
      // the repeated name rather than to the stop-masking entry itself.
      { source: "project", stem: "b159livegood", text: stopMaskedDistinctNamesSchemaTheta() },
      // The load-bearing broken theta: bug 0159's own §Reproduction fixture
      // row 1, at the schema-body field position.
      {
        source: "project",
        stem: "b159livebroken",
        text: stopMaskedDuplicateInlineFieldNameSchemaTheta(),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b159livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the widened duplicate-inline-field-name rule under test, would " +
          "explain the broken theta's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b159livegood"),
        "the same malformed middle entry with distinct names did not register " +
          "— the stop-masking entry itself, not the repeated name, would " +
          "explain the broken theta's refusal below. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root
      // (not the offline parseThetaDocument harness the unit witness uses), a
      // theta whose inline object type repeats a field name BEHIND a
      // stop-masking malformed entry does NOT register —
      // `inlineObjectFieldKeys` (src/parser/type-grammar.ts) now derives its
      // comparison key from the same brace-aware top-level comma split the
      // two lowerers use, so the malformed `: x` entry contributes no key and
      // curtails no comparison, and `hasLoadParseError` un-registers this
      // theta at the SAME site the bug 0052 cell above exercises for the
      // unmasked shape.
      expect(
        handle.command("b159livebroken"),
        "the theta whose inline object type repeats a field name behind a " +
          "stop-masking entry registered anyway through the live " +
          "discovery/session_start path — the widened " +
          "theta/parse/duplicate-inline-field-name did not fire. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b159livebroken");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager` rather
      // than off racy events: the diagnostic fires at LOAD time, before any
      // drive, so the full entry list is the delta (mirrors the bug 0052 cell
      // above).
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = duplicateInlineFieldNameFragment("a");
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the duplicate-inline-field-name " +
          "rejection for the stop-masked broken theta. Notes: " + JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0064 — `buildBinderCompleteCall` wrote `options.temperature = 0` into
// EVERY binder `complete()` call, in its `options` construction, with no
// per-(api, model-id) placement row beside the ones the forced tool choice
// and the seed field already carried. The Anthropic Messages API answers
// that field with `400 invalid_request_error` ("`temperature` is
// deprecated for this model.") on the models that deprecate it —
// `claude-sonnet-5` among them, the id this repo's own shared live-model
// preference rule resolves FIRST (`requireLiveProvider`, ./harness). The 400
// classified as transport, the single transport budget re-issued the
// identical call, and the invocation terminated on `renderBinderSystemNote`'s
// transport row (§Failure-mode templates) with the theta body never running:
// the whole non-bypass `params:` feature was unavailable, at two provider
// calls per invocation.
//
// Neither live half could witness that. NO live reach to a real binder call
// ran against the rule-resolved model: every reach — the H9a acceptance area
// (d) fixture and this file's own `bind_model:`-carrying cells alike —
// hardcoded a model that still accepts the field, so the shared preference
// rule never reached the binder wire at all. This cell closes the gap on the
// H8a side by DERIVING `bind_model:` from `requireLiveProvider()` —
// provider-qualified, because a bare id can be ambiguous across configured
// providers — so the binder is exercised against whatever model the suite
// itself prefers, and the cell keeps witnessing the class as the refusing set
// grows with each release carrying the deprecation.
//
// The planted theta is non-bypass BY CONSTRUCTION: two `params:` fields, one
// defaulted, is neither of `classifyBinderBypass`'s two bypass shapes
// (src/binder/binder-envelope.ts — no `params:`, or exactly one non-defaulted,
// non-optional, non-nullable `string`), so a real binder pass runs before the
// body. The body is a pure literal, so the only provider traffic this cell
// buys is the binder pass itself.
//
// ADDITIVE ONLY: no existing cell in this file is weakened, reworded,
// reordered or deleted — the bug 0066 cell's `anthropic/claude-haiku-4-5` pin
// in particular stays, because that cell's subject is the post-default-merge
// AJV verdict and a binder-model 400 would confound it.
// ===========================================================================

/**
 * A NON-BYPASS `params:` theta whose binder model is the caller's
 * rule-resolved, provider-qualified id — never a hardcoded one, since a
 * hardcoded old model is exactly what let the request-shape defect ship green.
 * `bind_echo: true` makes the successful bind observable as the BND-1
 * `Running /<name>: …` note; the body is a pure literal, so nothing after the
 * binder pass spends a turn (the committed `acc-params-binder.theta` fixture's
 * own shape).
 */
function b64BinderParamsTheta(bindModel: string): string {
  return [
    "---",
    "mode: prompt",
    `bind_model: ${bindModel}`,
    "bind_echo: true",
    "params:",
    "  topic: string",
    "  count: number = 3",
    "---",
    '"ok"',
    "",
  ].join("\n");
}

describe("H8a-T — bug 0064: a non-bypass params: theta binds against the live suite's OWN rule-resolved model, live (Convention: live-host acceptance)", () => {
  it("drives a real binder pass against the rule-resolved bind_model and emits the bind_echo success note, never `argument binder unavailable`", async () => {
    const provider = await requireLiveProvider();
    // `bind_model:` is DERIVED from the one model-selection rule every live
    // half shares, and provider-qualified the way the committed H9a fixture
    // qualifies its own: the resolved `LiveModel` carries the provider id
    // alongside the model id (the same read `resolveAcceptanceHost` does).
    const providerId = (provider.model as { provider?: string }).provider ?? "";
    if (providerId === "") {
      failLoudly(
        "live-host precondition unmet: the resolved live model carries no " +
          "`provider` field, so `bind_model:` cannot be provider-qualified " +
          `(resolved model id '${provider.modelId}'). This cell never falls ` +
          "back to a hardcoded id — that fallback is the defect it witnesses.",
      );
    }
    const bindModel = `${providerId}/${provider.modelId}`;

    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without it, a missing
      // success echo below could be (wrongly) attributed to a broken workspace
      // instead of the binder call's request shape. Registration-only: it is
      // never driven, so it spends no tokens.
      { source: "project", stem: "b64livectl", text: promptTheta("THETA-LIVE-OK") },
      { source: "project", stem: "b64livebinder", text: b64BinderParamsTheta(bindModel) },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Both preconditions are asserted BEFORE any turn is driven, so a
      // discovery or binder-model-resolution regression reds token-free.
      expect(
        handle.command("b64livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the binder call's request shape under test, would explain the " +
          "missing success echo below too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b64livebinder"),
        `the non-bypass params: theta did not register against bind_model: ` +
          `'${bindModel}' — a LOAD-time registry lookup failed (the id the ` +
          "shared preference rule resolved is not provider-qualifiable), " +
          "which would leave the binder wire unreached rather than exercised. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Raw slash text the binder must bind into the two declared params.
      const turn = await driveSlashCaptureTurn(
        handle,
        "/b64livebinder summarise the three most recent commits",
      );

      // THE FIXED OBSERVABLE, asserted FIRST and POSITIVELY so a red names
      // what the channel actually carried: a successful bind emits the BND-1
      // one-line echo on the `theta-system-note` channel, read off the settled
      // in-memory `SessionManager` (AGENTS.md §"Assert on real observables") —
      // never off `prompt()` resolving, which a fail-closed binder does too.
      expect(
        turn.systemNotes.filter((n) => n.startsWith("Running /b64livebinder")),
        `no bind_echo success note for a binder pass against bind_model: ` +
          `'${bindModel}': the binder call's own request shape was refused, ` +
          "so the theta never started. Notes: " + JSON.stringify(turn.systemNotes),
      ).not.toEqual([]);

      // The bug's own signature, asserted as an ABSENCE: the *Binder model
      // transport failure* row after the transport budget re-issued the
      // identical refused call.
      expect(
        turn.systemNotes.filter((n) => n.includes("argument binder unavailable")),
        `the binder terminated on the transport-failure row against ` +
          `bind_model: '${bindModel}' — the request carries a field this ` +
          "(api, model-id) pair refuses, so both budgeted calls were spent " +
          "and the body never ran. Notes: " + JSON.stringify(turn.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0172, boundary 2 (live) — a typed `.theta`-callable tool-call return
// through `tools:` performs the inbound translation pass, live.
// `docs/bugs/0172-inbound-translation-pass-unperformed-at-three-boundaries.md`
// §Fix (a): `#resolveReturnSite`'s `callee-inferred` arm (FN-3 inference over
// the statically resolved callee, `src/parser/functions.ts`'s
// `inferCalleeReturnAnnotation`) now derives a runtime schema for a
// `tools:`-routed `.theta`-callable call carrying no `invoke<Schema>`
// annotation, so `#validateInvokeReturn` AJV-validates and translates its
// return exactly as the annotated `invoke<Schema>` form (bug 0067, the cell
// immediately above) already does.
//
// NO EXISTING LIVE CELL DRIVES A `.theta`-CALLABLE CALL TO COMPLETION. Every
// `tools:` occurrence across `tests/live/**` (H8a, H9a, the hardening probes)
// is either the bare Pi-tool identifier `read`, or — since the bug 0070/0071/
// 0110 H8a additions above — a `.theta`-callable entry checked for
// REGISTRATION ONLY (arity / containment rules judged at load time; the
// comment beside the bug 0110 cell states this explicitly: "Registration-
// only: no slash command is invoked, so no model turn runs"). This cell is
// the first live drive of an ACTUAL `.theta`-callable dispatch through to its
// return value, closing that live-coverage gap for bug 0172's boundary 2.
//
// SHAPE. Mirrors the bug 0067 cell immediately above exactly, substituting
// the call surface: `b172liveb2kid` is the SAME shape as `b67SevEnumKidTheta`
// (a `mode: subagent` callee, zero model turns, a bare named-enum tail) —
// REQUIRED to be `mode: subagent` (a prompt-mode callee in `tools:` is
// `theta/load/prompt-mode-callable`, frontmatter-fields-a.md's `tools` prose).
// The parent calls it as a bare `.theta`-callable (`b172liveb2kid()`, no
// `invoke<Schema>` annotation) instead of `invoke<Sev>(...)`, so the return
// type taken is the CALLEE-INFERRED arm this bug wires, not the
// already-fixed (bug 0067) annotated arm. Pre-fix the comparison is a
// cross-type `false`: the envelope crosses the PIC-59 boundary as a bare wire
// string AND `#resolveCallAsInvoke` passed `returnSchema: null`, so neither
// AJV nor the translation pass ran at all (`tests/inbound-boundary-theta-
// callable.test.ts` proves this offline, both directions, with a real spawned
// child); post-fix it is `true`.
//
// Token cost: one dispatched query in the parent (the same profile as the
// bug 0067 cell); the callee spends none.
//
// ADDITIVE ONLY: no existing cell in this file is weakened, reworded,
// reordered, or deleted. Added during bug-0172/bug-0120 fix verification to
// close the live-coverage gap this comment measures.
// ===========================================================================

/**
 * The `mode: subagent` callee: a pure named-enum tail, zero model turns — the
 * same shape as `b67SevEnumKidTheta` above, a new stem so as not to collide
 * with that cell's own workspace (each cell plants its own, so collision is
 * not actually possible, but the distinct name keeps the two cells legible
 * independently).
 */
function b172liveB2KidTheta(): string {
  return ["---", "mode: subagent", "---", 'enum Sev { High = "high" }', "Sev.High"].join("\n");
}

/**
 * The `mode: prompt` parent: a BARE `.theta`-callable call (`tools:`, no
 * `invoke<Schema>` annotation) binds the envelope through the callee-inferred
 * return-type arm, then the boolean comparison against the parent's own
 * `Sev.High` is interpolated between markers so the rendered text — not the
 * model's reply — is the observable.
 */
function b172liveB2ParentTheta(): string {
  return [
    "---",
    "mode: prompt",
    "tools:",
    "  - ./b172liveb2kid.theta",
    "---",
    'enum Sev { High = "high" }',
    "let v = b172liveb2kid()?",
    "@`B2CROSS=${v == Sev.High}/${v == \"high\"}|END What is 233 plus 644? Answer with the number only.`",
  ].join("\n");
}

describe("H8a-T — bug 0172 boundary 2: a .theta-callable tool-call return performs the inbound translation pass, live", () => {
  it("a named-enum value returned by a tools:-routed .theta-callable call (no invoke<Schema> annotation) compares equal to the caller's own variant", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      { source: "project", stem: "b172liveb2parent", text: b172liveB2ParentTheta() },
      { source: "project", stem: "b172liveb2kid", text: b172liveB2KidTheta() },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the parent command must exist before a live turn is
      // driven, so a discovery/parse failure reds with zero tokens.
      expect(
        handle.command("b172liveb2parent"),
        "no bug-0172-boundary-2 parent command to invoke — the .theta failed " +
          "discovery/parse. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const turn = await driveSlashCaptureTurn(handle, "/b172liveb2parent");
      const outbound = turn.userTexts.join("\n");
      // Marker-anchored extraction of the rendered `${...}` segment — the
      // exact text theta code computed from the boundary-2 comparison (fails
      // loudly when the query never rendered, e.g. the `.theta`-callable call
      // did not resolve Ok).
      const anchored = /B2CROSS=([\s\S]*?)\|END/.exec(outbound);
      expect(
        anchored,
        "the parent query's rendered text (B2CROSS=…|END) is absent — the " +
          "tools:-routed .theta-callable call did not resolve Ok. Outbound user " +
          "texts: " + JSON.stringify(turn.userTexts) + "; system notes: " +
          JSON.stringify(turn.systemNotes),
      ).not.toBeNull();
      // THE POST-0337 OBSERVABLE. tool-calls.md's registered-theta return-type
      // row (return type by CALLEE INFERENCE) + runtime-value-model.md:34's
      // Wire-name-translation inbound bullet — at the typed `.theta`-callable
      // return boundary the reattached tag keys on the CALLEE's declaring
      // file, so the returned variant is `!=` the caller's own same-named
      // Sev.High (`v == Sev.High` → false), and being tagged it is not the
      // bare wire string either (`v == "high"` → false, 0172's tag-reattached-
      // not-dropped subject): both segments read `false`.
      expect(
        anchored![1],
        "runtime-value-model.md:34 + tool-calls.md's registered-theta " +
          "return-type row — a named-enum value returned by a tools:-routed " +
          "`.theta`-callable call keys its tag on the callee's declaring " +
          "file: it is `!=` the caller's own Sev.High (v == Sev.High → false) " +
          'and not the bare wire string (v == "high" → false). Rendered ' +
          "segment: " + JSON.stringify(anchored![1]),
      ).toBe("false/false");
      // No fail-closed ending of the drive (invoke infra errors and Err tails
      // land here — absence is the success observable).
      const failureNotes = turn.systemNotes.filter((n) =>
        /^theta \/b172liveb2parent (returned Err|cancelled|aborted)/.test(n),
      );
      expect(
        failureNotes,
        "the boundary-2 cross drive surfaced fail-closed system note(s): " +
          JSON.stringify(failureNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0253 — the producer's snapshot-absent fallback derived a HYPHENATED
// `.theta` `tools:` entry's default callable name without the spec'd
// hyphen→underscore remap (`docs/spec_topics/frontmatter/frontmatter-fields-a.md`
// §default name), so a hyphenated stem presented an unspellable name on that
// arm while the resolver (`thetaDefaultName`, `src/parser/callable-set.ts`) and
// the parse gate (`toolCallableName`, `src/parser/theta-document.ts`) both
// derived the underscored one
// (`docs/bugs/0253-fallback-hyphenated-theta-default-name-diverges.md`).
//
// `src/extension/production-composition.ts`'s discovery pass always attaches a
// callable-set snapshot to a discovered theta, so the divergent fallback arm
// is never reached live — the fix routes the fallback to the resolver's own
// `thetaDefaultName` (`src/extension/production-theta-producer.ts`), and every
// discovered theta already took the snapshot arm before and after the fix.
// This cell therefore witnesses the AGREEMENT the fix keeps intact end to end:
// a discovered, hyphenated `.theta` `tools:` entry with NO `as` rename presents
// the underscored default name, and a call of that underscored name from the
// caller's body dispatches through the real discovery→registration→dispatch
// path to the callee's own computed value.
//
// NO EXISTING LIVE CELL PLANTS A HYPHENATED `.theta` `tools:` ENTRY. Every
// `tools:` occurrence across `tests/live/**` before this cell is either the
// bare Pi-tool identifier `read`, a digit-leading stem (bug 0070's
// `2fastbug0070`), or a hyphen-free `.theta` stem (bug 0071/0110/0111/0172's
// `b*livekid`/`b*livecallee`/`b*livechild` families) — none exercises the
// hyphen→underscore remap this fix keeps agreeing on.
//
// SHAPE mirrors the bug 0172 boundary-2 cell immediately above: a `mode:
// subagent` callee whose sole statement is a bare literal tail (zero model
// turns), named in the parent's `tools:` with no rename, called as a bare
// `.theta`-callable from the parent's body and bound into a `let`, then
// rendered between markers so the rendered text — not the model's reply — is
// the deterministic observable that the call actually dispatched to the
// callee's own value. A trailing fixed-pair arithmetic question (bug 0243's
// convention) proves a real model turn ran.
//
// Token cost: one dispatched query in the parent; the callee spends none.
//
// ADDITIVE ONLY: no existing cell in this file is weakened, reworded,
// reordered, or deleted.
// ===========================================================================

/**
 * The `mode: subagent` callee: a bare integer-literal tail, zero model
 * turns — the callee's OWN computed value the parent's dispatched call must
 * return unchanged.
 */
function b0253LiveCodeReviewKidTheta(): string {
  return ["---", "mode: subagent", "---", "771"].join("\n");
}

/**
 * The `mode: prompt` parent: `tools:` names the callee by its HYPHENATED
 * `.theta` path (`./b0253live-code-review.theta`) with NO `as` rename, and the
 * body calls it by the underscored default name
 * (`b0253live_code_review`) `frontmatter-fields-a.md`'s remap derives. If the
 * registered/dispatched name diverged from the underscored one, this call
 * would not resolve to the `.theta` callee at all and the caller's own load
 * would fail (an unresolved bare identifier call), so reaching the rendered
 * marker below already witnesses the agreement; the returned value equalling
 * the callee's own literal witnesses that the dispatch reached the CORRECT
 * callee rather than some other route.
 */
function b0253LiveCodeReviewParentTheta(): string {
  return [
    "---",
    "mode: prompt",
    "tools:",
    "  - ./b0253live-code-review.theta",
    "---",
    "let v = b0253live_code_review()?",
    "@`R=${v}|END What is 233 plus 644? Answer with the number only.`",
  ].join("\n");
}

describe("H8a-T — bug 0253: a hyphenated .theta tools: entry's underscored default name dispatches live", () => {
  it("a call of the underscored default name for a hyphenated, un-renamed tools: entry resolves through the real discovery→registration→dispatch path to the callee's own value", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      { source: "project", stem: "b0253live-code-review", text: b0253LiveCodeReviewKidTheta() },
      { source: "project", stem: "b0253livecodeboss", text: b0253LiveCodeReviewParentTheta() },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the parent command must exist before a live turn is
      // driven, so a discovery/parse/registration failure reds with zero
      // tokens. Registering at all already witnesses that the hyphenated
      // entry's presented name was spellable by the parent's own call site —
      // an unspellable presented name (the pre-fix divergent fallback's shape)
      // would leave the call site unresolved and the caller un-registered,
      // but that arm is unreached in production regardless (see the header
      // comment); this precondition is the load-time half of the agreement.
      expect(
        handle.command("b0253livecodeboss"),
        "no bug-0253 parent command to invoke — the hyphenated tools: entry's " +
          "underscored call site failed discovery/parse/registration. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const turn = await driveSlashCaptureTurn(handle, "/b0253livecodeboss");
      const outbound = turn.userTexts.join("\n");
      // Marker-anchored extraction of the rendered `${v}` segment — the exact
      // text theta code computed from the dispatched call's return value
      // (fails loudly when the query never rendered, e.g. the call did not
      // resolve Ok).
      const anchored = /R=([\s\S]*?)\|END/.exec(outbound);
      expect(
        anchored,
        "the parent query's rendered text (R=…|END) is absent — the " +
          "tools:-routed underscored call did not resolve Ok. Outbound user " +
          "texts: " + JSON.stringify(turn.userTexts) + "; system notes: " +
          JSON.stringify(turn.systemNotes),
      ).not.toBeNull();
      // THE FIXED-SURFACE AGREEMENT OBSERVABLE: the dispatched call of the
      // spec'd underscored name returned the callee's own literal unchanged —
      // the registered/dispatched name for a hyphenated, un-renamed entry is
      // the underscored one, live, end to end.
      expect(
        anchored![1],
        "the hyphenated tools: entry's underscored call must return the " +
          "callee's own literal (771) unchanged; a different rendered value " +
          "means the dispatched call resolved a callee OTHER than the entry's " +
          "own. Rendered segment: " + JSON.stringify(anchored![1]),
      ).toBe("771");
      // No fail-closed ending of the drive (invoke infra errors and Err tails
      // land here — absence is the success observable).
      const failureNotes = turn.systemNotes.filter((n) =>
        /^theta \/b0253livecodeboss (returned Err|cancelled|aborted)/.test(n),
      );
      expect(
        failureNotes,
        "the bug-0253 agreement drive surfaced fail-closed system note(s): " +
          JSON.stringify(failureNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0174 — a typed `invoke<T>` of a `mode: prompt` callee fails
// return-validation for every named-enum position: on the prompt→prompt
// ATTACH cell (guard `callerMode === "prompt" && callee.frontmatter.mode ===
// "prompt"` inside `#driveCallee`), no process boundary intervenes, so the
// boxed `String` enum carrier `makeEnumValue` builds
// (`src/runtime/value.ts:135`, `typeof === "object"`) reaches AJV
// unnormalised and `{"type":"string","enum":[…]}` refuses it — where the
// byte-identical callee body as `mode: subagent` crosses the PIC-59
// `JSON.stringify` envelope, arrives a JSON primitive, and returns `Ok` (the
// bug 0067 cell above).
// `docs/bugs/0174-typed-invoke-enum-return-validation-prompt-cell.md` §Fix
// (b): `#validateInvokeReturn` now AJV-validates a wire-form projection of
// the payload (`projectForValidation`, `src/runtime/wire-translation.ts`)
// and hands the callee's OWN value — boxed carrier intact — to the post-AJV
// inbound translation pass and on to the caller.
//
// NO EXISTING LIVE CELL DRIVES THIS SHAPE (checked across all of
// `tests/live/**` before adding this cell). Every typed `invoke<T>` cell in
// this file targets a `mode: subagent` callee — the bug 0067 cell above
// (`invoke<Sev>` into `b67livesevkid`, `mode: subagent`) and the bug 0020
// forged-ingress pair (`invoke<Forged>` into `forgedchild`, `mode:
// subagent`) — the leg the PIC-59 envelope already normalises incidentally.
// The bug 0172 boundary-2 cell's callee is REQUIRED to be `mode: subagent`
// (a prompt-mode callee inside `tools:` is `theta/load/prompt-mode-callable`
// — that cell's own comment states this), so it cannot reach the attach cell
// either. `tests/live/hardening/session-invoke-attach.test.ts` DOES drive
// the prompt→prompt ATTACH topology live (`invoke<number>("./ppnum.theta")`),
// but a plain `number` is never boxed, so that cell cannot reach this defect —
// the asymmetry is specific to the named-enum carrier, not to the attach
// mechanism itself. This cell closes that live-coverage gap: it mirrors the
// bug 0067 cell exactly, substituting the callee's `mode:` frontmatter from
// `subagent` to `prompt`, which routes the SAME typed `invoke<Sev>` through
// `#driveCallee`'s in-process ATTACH cell instead of its spawn cell.
//
// Pre-fix the invoke itself Errs — `Err(InvokeInfraError{cause:
// "return_validation"})` — so the parent's `?` propagates it as the theta's
// own top-level Err before the rendered query ever runs: the PPCROSS marker
// is therefore ABSENT pre-fix (not merely `false`, unlike the bug 0067 cell
// where the pre-fix invoke resolves Ok but untagged), and the SLSH-3
// top-level note names the cause verbatim (`err-note-render.ts`'s
// `invoke_infra` row: "invoke of <path> failed (return_validation)"), which
// is why the first assertion below embeds `turn.systemNotes` in its failure
// message. Post-fix the invoke resolves `Ok`, the query renders, and the
// boolean comparison is `true`.
//
// Token cost: one dispatched query in the parent (the same profile as the
// bug 0067 cell); the callee spends none — a pure enum tail, zero model
// turns.
//
// ADDITIVE ONLY: no existing cell in this file is weakened, reworded,
// reordered or deleted.
// ===========================================================================

/** The `mode: prompt` callee: a pure named-enum tail, zero model turns. */
function b174livePpKidTheta(): string {
  return ["---", "mode: prompt", "---", 'enum Sev { High = "high" }', "Sev.High"].join("\n");
}

/**
 * The `mode: prompt` parent: a typed `invoke<Sev>` of a PROMPT-mode callee
 * binds the envelope through the in-process ATTACH cell, then the boolean
 * comparison against the parent's own `Sev.High` is interpolated between
 * markers so the rendered text — not the model's reply — is the observable.
 */
function b174livePpParentTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    'enum Sev { High = "high" }',
    'let v = invoke<Sev>("./b174liveppkid.theta")?',
    "@`PPCROSS=${v == Sev.High}/${v == \"high\"}|END What is 385 plus 112? Answer with the number only.`",
  ].join("\n");
}

describe("H8a-T — bug 0174: a typed invoke<Sev> of a PROMPT-mode callee validates a named-enum return on the attach cell, live", () => {
  it("a named-enum value returned by a prompt-mode callee across the prompt→prompt attach cell compares equal to the caller's own Sev.High", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      { source: "project", stem: "b174liveppparent", text: b174livePpParentTheta() },
      { source: "project", stem: "b174liveppkid", text: b174livePpKidTheta() },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the parent command must exist before a live turn is
      // driven, so a discovery/parse failure reds with zero tokens.
      expect(
        handle.command("b174liveppparent"),
        "no bug-0174 prompt-attach parent command to invoke — the .theta failed " +
          "discovery/parse. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const turn = await driveSlashCaptureTurn(handle, "/b174liveppparent");
      const outbound = turn.userTexts.join("\n");
      // Marker-anchored extraction of the rendered `${...}` segment — the
      // exact text theta code computed from the attach-cell-bound comparison
      // (fails loudly when the query never rendered — e.g. the invoke Err'd
      // before the `?` let its tail through, embedding the fail-closed note
      // so a red names the cause).
      const anchored = /PPCROSS=([\s\S]*?)\|END/.exec(outbound);
      expect(
        anchored,
        "the parent query's rendered text (PPCROSS=…|END) is absent — the " +
          "invoke did not resolve Ok. Outbound user texts: " +
          JSON.stringify(turn.userTexts) + "; system notes: " +
          JSON.stringify(turn.systemNotes),
      ).not.toBeNull();
      // THE POST-0337 OBSERVABLE. invocation.md:36 — "the final value still
      // propagates through the same return surface", mode-invariantly; :55 —
      // the callee's mode selects conversation isolation, not validation. Per
      // runtime-value-model.md:34 the reattached tag keys on the CALLEE's
      // declaring file: the returned variant is `!=` the caller's own Sev.High
      // (false) and, being tagged, is not the bare wire string (false).
      expect(
        anchored![1],
        "runtime-value-model.md:34 — a named-enum value returned by a " +
          "PROMPT-mode callee across a typed invoke<Sev> keys its tag on the " +
          "callee's declaring file: `!=` the caller's own Sev.High and, being " +
          "tagged, not the bare wire string (both false). Rendered segment: " + JSON.stringify(anchored![1]),
      ).toBe("false/false");
      // No fail-closed ending of the drive (invoke infra errors and Err tails
      // land here — absence is the success observable).
      const failureNotes = turn.systemNotes.filter((n) =>
        /^theta \/b174liveppparent (returned Err|cancelled|aborted)/.test(n),
      );
      expect(
        failureNotes,
        "the prompt-attach enum-cross drive surfaced fail-closed system " +
          "note(s): " + JSON.stringify(failureNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0097 — the `params:` right-hand side dispatched on the POSITIONAL test
// `s.startsWith("{") && s.endsWith("}")`, which a top-level union of object
// arms satisfies on its FIRST arm's opening brace and its LAST arm's closing
// one: `p: "{a: integer} | {b: integer}"` went to `hoistInlineObjectType` as
// one field list and minted
// `{"type":"object","properties":{"a":{"anyOf":[{},{}]}},"required":["a"],
// "additionalProperties":false}` — a fragment REQUIRING a property the author
// declared as one alternative of two, constraining that property to nothing,
// and refusing every other property
// (docs/bugs/0097-params-brace-union-rhs-one-field-list.md).
// `lowerParamsFieldType` (src/parser/params.ts) now asks the STRUCTURAL
// question the `@<T>` root and the alias right-hand side already ask
// (`isSingleEnclosingBraceGroup`) and carries the per-arm union dispatch
// behind it (`lowerBraceGroupUnionArms`), so each object arm hoists as the arm
// it is and this position lowers the SUBS-1 `anyOf` the other type positions
// lower for the same text (schema-subset.md:81, type-system.md:15).
//
// LIKE the bug 0056 cell above, and unlike the registration cells, this fix
// moves no register/non-register verdict for the shape below: it loads with
// ZERO diagnostics both before and after (the bug doc's §Reproduction table
// records the mis-parse as silent). `handle.command(...)` /
// `handle.registeredNames()` therefore cannot distinguish the two lowerings;
// the observable is downstream ENFORCEMENT of the lowered fragment.
//
// THE OBSERVABLE — the seam the bug 0056 cell drives, for the same reason. Of
// the three consumers the bug doc names (the binder envelope, the
// post-default-merge AJV compile, the subagent child's params intake), the
// child intake is the one reachable with no model-authored value in the loop:
// an `invoke(...)` call supplies its argument from CODE (invocation.md
// §"Argument binding" — the LLM-driven binder does not run for an
// `invoke(...)` caller), PIC-60 marshals it to the callee's spawned child, and
// `#intakeSubagentRootParams` (src/extension/production-theta-producer.ts)
// compiles `theta.frontmatter.params.loweredSchema` through the real AJV seam
// against it. A refusal there is `refuseParams`'s `Err(InvokeInfraError {
// kind: "invoke_infra", cause: "validation" })` (src/runtime/subagent-
// params.ts), which crosses the RFC-0006 envelope back to an UNTYPED
// `invoke(...)` parent unchanged (invocation.md §"Typed return": an untyped
// invoke discards the `Ok` VALUE to `null`; failure envelopes pass through).
//
// BOTH VERDICTS INVERT ACROSS THE FIX, which is what makes this cell a witness
// rather than a smoke test. Against the mis-parsed one-field fragment the
// author's SECOND arm `{"b": 1}` misses the required `a` and carries a
// property `additionalProperties: false` refuses (REJECTED), while
// `{"a": "not an integer"}` — a value NEITHER declared arm admits — satisfies
// `required: ["a"]` against a property schema asserting nothing (ACCEPTED).
// Against the fixed two-arm `anyOf` the second arm binds and the value
// matching neither arm is refused. The pre-fix live signature is therefore the
// exact pair `GOOD=REJECTED validation` / `BAD=ACCEPTED`, and the two
// assertions below pin both directions of the swap.
//
// WHY NO STATIC CHECK CAN CONFOUND THE ARGUMENT (the same reading the bug 0056
// cell above records, re-measured here for a schema-constructed operand): each
// argument is a bare `let`-bound IDENTIFIER (`good` / `bad`), and
// `collectProvableArgTypes`'s `"ident"` arm (src/extension/invoke-static-
// checks.ts) returns `undefined` for one — both consumers read types with an
// empty bindings map, so even a `let`-bound name is nominal there — so
// `buildInvokeArgSlot` withholds the slot before `checkCompatible`
// (src/parser/type-compat.ts, untouched by this fix) is consulted and
// `theta/parse/invoke-arg-type-mismatch` cannot fire for either value. The
// runtime AJV net at the child's intake — this fix's own surface — is what
// the static layer defers to by construction.
//
// NO EXISTING LIVE FIXTURE REACHES THE FIXED ARM (census over `tests/live/**`
// re-measured for this addition): every `params:` field declared anywhere in
// the live halves is a primitive, a defaulted primitive, a literal union (the
// bug 0056 cell), or junk type text (the bug 0059 cell) — not one carries a
// brace at any position, so no union of object arms has ever crossed a live
// params intake. That matches the bug doc's own 17-file committed-fixture
// census, and it is the Phase-4 gap this cell closes.
//
// The callee's union-typed `params:` field is not `single-string-bypass`-
// eligible (`classifyBinderBypass`, src/binder/binder-envelope.ts, admits only
// no-params / a single undefaulted `string`), so it needs a resolvable
// `bind_model:` to load in its own spawned child as well as in the parent
// session — the same provider-qualified id `b56livechild` above carries, for
// the same reason. Load-time name resolution only; no binder pass runs on the
// `invoke(...)` path (PIC-60), so it spends no tokens.
//
// Token cost: ONE small untyped free-phase turn (the parent's closing query,
// whose text is computed by CODE before the model replies — the reply itself
// is never asserted on). Each `invoke(...)` spawns a REAL RFC-0006 child whose
// body is a bare string tail, so the children drive no model turns;
// `./harness`'s module-scope `#subagent-child-pins` (argv[1] at the real pi
// CLI entry, `SUBAGENT_EXTENSION_PIN_ENV`, `SUBAGENT_PARENT_PID_ENV`) cover
// both spawns, imported at the top of this file. ADDITIVE ONLY: no existing
// cell in this file is weakened, reworded, reordered or deleted.
// ===========================================================================

/**
 * The callee both `invoke(...)` calls below name: one `params:` field whose
 * declared type is the bug doc's own §Reproduction text, a two-arm union of
 * object types. The body is a fixed string rather than the bound field, which
 * keeps the cell's observable at the marshalled-params intake — that intake
 * runs before the body and independently of it — and keeps the child's own
 * drive free of any model turn.
 */
function braceUnionParamsChildTheta(): string {
  return [
    "---",
    "mode: subagent",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    '  p: "{a: integer} | {b: integer}"',
    "---",
    '"CHILD-OK"',
    "",
  ].join("\n");
}

/**
 * The load-bearing parent: TWO `invoke(...)` calls against the SAME callee —
 * one argument the declared union admits (`{b: 1}`, the author's second arm),
 * one no arm admits (`{a: "not an integer"}`, the bug doc's own AJV row) —
 * each constructed through a named `schema` (bare object literals are
 * `theta/parse/bare-object-literal`, expressions.md §"Object construction")
 * and passed as a plain identifier so the static invoke-arg checker withholds
 * both slots (file-header note above). Each `Result` is `match`ed EXPLICITLY
 * into a string — `"ACCEPTED"` for `Ok`, `"REJECTED " + <the wire cause>` for
 * `Err` — so no `?` and no panic path is on either call, and the ONE closing
 * query renders both intake verdicts the way theta CODE computed them.
 */
function braceUnionParamsInvokeCheckTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "schema SecondArm { b: integer }",
    "schema NeitherArm { a: string }",
    "let good = SecondArm { b: 1 }",
    'let bad = NeitherArm { a: "not an integer" }',
    'let okResult = invoke("./b97livechild.theta", good)',
    'let badResult = invoke("./b97livechild.theta", bad)',
    "let okOutcome = match okResult {",
    '  Ok(_) => "ACCEPTED",',
    '  Err(e) => "REJECTED " + e.cause,',
    "}",
    "let badOutcome = match badResult {",
    '  Ok(_) => "ACCEPTED",',
    '  Err(e) => "REJECTED " + e.cause,',
    "}",
    "@`An intake probe reports GOOD=${okOutcome} BAD=${badOutcome}. Restate that pair, then answer: what is 396 plus 225?`",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0097: an invoke(...) argument matching a params: object-union's SECOND arm is accepted at the child's params intake and one matching neither arm is refused, live (Convention: live-host acceptance)", () => {
  it("accepts the declared second arm and refuses a value no arm admits, through the real RFC-0006 marshalled-params AJV intake", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, either
      // invoke() outcome below could be (wrongly) attributed to a broken
      // workspace instead of the params object-union lowering under test.
      { source: "project", stem: "b97livectl", text: promptTheta("THETA-LIVE-OK") },
      { source: "project", stem: "b97livechild", text: braceUnionParamsChildTheta() },
      { source: "project", stem: "b97livecheck", text: braceUnionParamsInvokeCheckTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b97livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the params object-union lowering under test, would explain either " +
          "invoke() outcome below too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b97livechild"),
        "the union-typed-params callee did not register — its bind_model: " +
          "chain failed to resolve (a workspace/registry problem, not the " +
          "lowering under test). Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b97livecheck"),
        "the invoking parent did not register — precondition unmet before any " +
          "live turn is driven. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const turn = await driveSlashCaptureTurn(handle, "/b97livecheck");
      const outbound = turn.userTexts.join("\n");

      // THE FIXED OBSERVABLE, first half. Pre-fix the one-field mis-parse
      // requires a property `a` and refuses every other, so the author's own
      // SECOND arm is turned away at the child's intake with
      // `InvokeInfraError { cause: "validation" }` — `GOOD=REJECTED
      // validation`. Post-fix `properties.p` is the two-arm `anyOf` over the
      // hoisted arm fragments (schema-subset.md:73/:76/:81), which admits it.
      expect(
        outbound,
        "the invoke() argument matching the params: union's DECLARED second " +
          "arm was refused at the child's marshalled-params intake — the " +
          "one-field mis-parse's own failure signature (bug 0097 element 1). " +
          "Registered: " + JSON.stringify(handle.registeredNames()) +
          "; outbound: " + JSON.stringify(turn.userTexts),
      ).toContain("GOOD=ACCEPTED");
      expect(
        outbound,
        "the declared second arm was refused with the pre-fix cause. " +
          "outbound: " + JSON.stringify(turn.userTexts),
      ).not.toContain("GOOD=REJECTED");

      // THE FIXED OBSERVABLE, second half. Pre-fix `{"a": "not an integer"}`
      // satisfies `required: ["a"]` against a property schema that asserts
      // nothing (`{"anyOf":[{},{}]}`), so a value NEITHER declared arm admits
      // binds — `BAD=ACCEPTED`. Post-fix arm 1 refuses the string against
      // `integer` and arm 2 refuses the missing `b`, so the intake returns
      // `refuseParams`'s validation Err, rendered by theta CODE from the real
      // `Result` the real RFC-0006 child returned rather than from `prompt()`
      // merely resolving.
      expect(
        outbound,
        "the invoke() argument matching NEITHER declared arm was accepted at " +
          "the child's marshalled-params intake — the mis-parsed fragment " +
          "binds it where the declared union does not. Registered: " +
          JSON.stringify(handle.registeredNames()) + "; outbound: " +
          JSON.stringify(turn.userTexts),
      ).toContain("BAD=REJECTED validation");
      expect(
        outbound,
        "the argument matching neither arm was accepted — the pre-fix " +
          "mis-parse's own failure signature. outbound: " +
          JSON.stringify(turn.userTexts),
      ).not.toContain("BAD=ACCEPTED");

      // No fail-closed ending of the PARENT's own drive: both `invoke(...)`
      // results are `match`ed explicitly above (no `?`, no unhandled `Err`),
      // so this theta's own top-level outcome is Success either way — a
      // failure note here would mean the fixture itself is broken, not that
      // bug 0097 fired.
      const failureNotes = turn.systemNotes.filter((n) =>
        /^theta \/b97livecheck (returned Err|cancelled|aborted)/.test(n),
      );
      expect(
        failureNotes,
        "the invoking parent's own drive surfaced fail-closed system note(s) " +
          "— the fixture itself is broken: " + JSON.stringify(failureNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0172 face 2 — a value inside a `{"anyOf":[…]}` arm received no enum tag,
// no schema brand and no descent: the inbound sidecar is keyed by JSON
// Pointer into the lowered fragment and `anyOf` has no image in the data
// space the way `properties` and `items` do, so nothing addressed a union
// position and the walk passed the AJV-admitted value through exactly as it
// arrived. The fix gives a `{"anyOf":[…]}` position first-ADMITTING-arm
// dispatch: the value is re-tested against each arm in SUBS-1 source order
// through the caller's OWN `SchemaValidator`, and translated under the FIRST
// arm that admits it (runtime-value-model.md §"Wire-name translation", the
// inbound bullet's union clause).
//
// NO EXISTING LIVE CELL EXERCISES THIS. The bug-0067 cell and the bug
// 0172-boundary-2 / bug-0174 cells above all drive a BARE named-enum
// annotation (`Sev`, never `Sev | null`) at the root — a non-union position,
// so their fixed value never reaches `rebuildUnderFirstAdmittingArm` at all.
// The bug-0097 cell above drives a union `params:` field, but both its arms
// are ANONYMOUS inline objects (no declared `enum`/`schema` name for either
// arm to tag or brand with), its `invoke(...)` is UNTYPED so the bound `p` is
// never read by the callee body, and its own assertions are on the AJV
// admit/refuse verdict at the PARAMS boundary — never on a translated RETURN
// value crossing a union position. This cell closes that gap with the
// shallowest union position the bug doc's §Reproduction (f) names: a bare
// named-enum variant under `Sev | null` at the `invoke` return boundary.
//
// `b0172f2livekid` mirrors `b67SevEnumKidTheta` exactly (a `mode: subagent`
// callee whose tail is a bare enum variant, zero model turns, zero tokens).
// `b0172f2liveparent` mirrors `b67SevEnumParentTheta`, changing only the
// annotation to the union `Sev | null`: `invoke<Sev | null>` lowers to
// `{"anyOf":[{"$ref":"#/$defs/Sev"},{"type":"null"}]}` (SUBS-1), and the
// dispatch re-tests the envelope's bare wire string against arm 0 (the `Sev`
// `$ref`), which admits it and reattaches the tag — first-match-wins over arm
// 1 (`{"type":"null"}`), which refuses a non-null string outright. Pre-fix
// the union position addressed no map at all and the value crossed exactly as
// AJV admitted it — a bare untagged string, so `v == Sev.High` renders the
// cross-type `false` (`valuesEqual`, `src/runtime/value.ts`); post-fix it
// renders `true`. The rendered boolean is interpolated between markers
// exactly as the bug-0067 cell reads it, so the observable is deterministic
// theta-computed text, never the model's own reply content.
//
// Token cost: one dispatched query in the parent (the same profile as the
// bug-0067 cell above); the callee spends none.
//
// ADDITIVE ONLY: no existing cell in this file is weakened, reworded,
// reordered, or deleted.
// ===========================================================================

/** The `mode: subagent` callee: a pure named-enum tail, zero model turns. Mirrors `b67SevEnumKidTheta` exactly. */
function b0172Face2UnionEnumKidTheta(): string {
  return ["---", "mode: subagent", "---", 'enum Sev { High = "high" }', "Sev.High"].join("\n");
}

/**
 * The `mode: prompt` parent: a typed `invoke<Sev | null>` — a UNION
 * annotation — binds the envelope, then the boolean comparison against the
 * parent's own `Sev.High` is interpolated between markers exactly as
 * `b67SevEnumParentTheta` does for the non-union `invoke<Sev>` boundary.
 */
function b0172Face2UnionEnumParentTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    'enum Sev { High = "high" }',
    'let v = invoke<Sev | null>("./b0172f2livekid.theta")?',
    "@`SEVCROSS=${v == Sev.High}/${v == \"high\"}|END What is 471 plus 318? Answer with the number only.`",
  ].join("\n");
}

describe("H8a-T — bug 0172 face 2: invoke<Sev | null> dispatches the first-admitting anyOf arm, live", () => {
  it("a typed invoke<Sev | null> binds a spawned subagent child's bare enum variant under the union's first arm, and it compares equal to the parent's own Sev.High", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      { source: "project", stem: "b0172f2liveparent", text: b0172Face2UnionEnumParentTheta() },
      { source: "project", stem: "b0172f2livekid", text: b0172Face2UnionEnumKidTheta() },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the parent command must exist before a live turn is
      // driven, so a discovery/parse failure reds with zero tokens.
      expect(
        handle.command("b0172f2liveparent"),
        "no bug-0172-face-2 union-enum-cross parent command to invoke — the " +
          ".theta failed discovery/parse. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const turn = await driveSlashCaptureTurn(handle, "/b0172f2liveparent");
      const outbound = turn.userTexts.join("\n");
      // Marker-anchored extraction of the rendered `${...}` segment — the
      // exact text theta code computed from the envelope-bound comparison
      // (fails loudly when the query never rendered, e.g. the invoke Err'd).
      const anchored = /SEVCROSS=([\s\S]*?)\|END/.exec(outbound);
      expect(
        anchored,
        "the parent query's rendered text (SEVCROSS=…|END) is absent — the " +
          "invoke did not resolve Ok. Outbound user texts: " +
          JSON.stringify(turn.userTexts) + "; system notes: " +
          JSON.stringify(turn.systemNotes),
      ).not.toBeNull();
      // THE POST-0337 OBSERVABLE. runtime-value-model.md:34's union clause — at
      // a `{"anyOf":[…]}` position the walk re-tests the value against each arm
      // in source order and translates under the first that admits it; arm 0
      // here is the `Sev` `$ref`, which admits the envelope's bare wire string
      // and reattaches the callee-file-qualified tag. So the returned variant
      // is `!=` the caller's own Sev.High (`v == Sev.High` → false) and, being
      // tagged, is not the bare wire string (`v == "high"` → false).
      expect(
        anchored![1],
        "runtime-value-model.md:34 (union clause) — a named-enum value " +
          "returned by a subagent-mode callee across a typed " +
          "invoke<Sev | null> dispatches to the first admitting arm and keys " +
          "its tag on the callee's declaring file: `!=` the caller's own " +
          "Sev.High and, being tagged, not the bare wire string (both false). " +
          "Rendered segment: " + JSON.stringify(anchored![1]),
      ).toBe("false/false");
      // No fail-closed ending of the drive (invoke infra errors and Err tails
      // land here — absence is the success observable).
      const failureNotes = turn.systemNotes.filter((n) =>
        /^theta \/b0172f2liveparent (returned Err|cancelled|aborted)/.test(n),
      );
      expect(
        failureNotes,
        "the union-enum-cross drive surfaced fail-closed system note(s): " +
          JSON.stringify(failureNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0181 (live) — a `params:` default authored as `Enum.Variant` access
// binds through a real binder pass, live.
// `docs/bugs/0181-enum-access-params-default-boxed-string-refused-at-merge.md`:
// `#recoverDeclaredDefaults` (`src/extension/production-theta-producer.ts:1292`)
// evaluated a declared default's `= Sev.High` literal against the theta's own
// body environment, so `Sev.High` resolved through
// `LexicalEnvironment.resolveEnumVariant` to `makeEnumValue`'s boxed `String`
// (`typeof === "object"`) and the merge (`fillDefaultsAndRevalidate`,
// `src/binder/defaulting.ts`) wrote it into the merged `args` unprojected. A
// named `enum` lowers to `{"type":"string","enum":[…]}`, whose `type` check is
// a `typeof` test, so AJV refused the runtime's own filled default, the theta
// never started, and the binder model call that produced the correct `ok`
// envelope was already spent. The fix (`## Fix`, route (a) sub-variant a1)
// wraps the evaluated default in `projectForValidation` inside
// `#recoverDeclaredDefaults`, so the merged document is homogeneous wire form;
// the declaring-enum tag is re-established downstream by the binder-`args`
// inbound boundary (`bindParamsInbound`) that `runtime-value-model.md:34`
// already mandates.
//
// WHAT THIS CELL ADDS OVER THE OFFLINE WITNESS.
// `tests/params-default-enum-access-merge.test.ts` drives the same production
// `runBinder` with the off-session `complete()` scripted, proving the routing
// end to end but never against a real model. `tests/live/acceptance/` drives a
// real binder pass over a `params:` default LIVE (`acc-params-binder.theta`,
// `count: number = 3`), but that default is a plain `number` literal, not an
// `Enum.Variant` access — the shape this bug is about — so no shipped live
// cell (H8a or H9a) exercises an enum-access default before this one. This
// cell closes that gap: a REAL binder pass against a real model produces the
// `ok` envelope with the defaulted field omitted (the input class the bug is
// about), and the production note channel carries the BND-1 success echo end
// to end through the shipped composition root (session_start →
// resources_discover → composeExtensionInstance), with the bound value proved
// TAGGED at the body via the same `==` cross-type technique the bug-0067 and
// bug-0172-face-2 cells above use.
//
// Token cost: ONE binder inference call against `anthropic/claude-haiku-4-5`
// (the same binder model every `bind_model:` fixture in this file already
// uses) plus, on the fixed path, the one body turn the fix newly lets run
// (pre-fix the theta never starts, so the pre-fix cost is the binder call
// alone — the same asymmetry the bug 0066 cell states for its own subject, in
// the opposite direction: there the fix SAVES the body turn a discarded
// verdict spent; here the fix SPENDS a body turn a wrongful refusal
// previously prevented). No child process is spawned (prompt mode, no
// `invoke(...)`, no `subagent fn`).
//
// STOCHASTIC DEPENDENCE, STATED. The envelope the binder returns is a model
// output. The binder system prompt's last line instructs omission of
// defaulted parameters the user did not specify
// (src/binder/binder-system-prompt.ts:345), and the slash argument below
// names only `topic` — so the expected envelope is `{"topic":"hello"}`,
// omitting `sev` and letting the runtime's own fill-if-absent step construct
// the `Sev.High` default this bug is about. A binder that instead invented an
// explicit value for `sev` would still bind (either wire string admits it),
// but the bound value would be BINDER-SUPPLIED rather than DEFAULTED, so the
// echo's `(default)` tag would be absent and the primary assertion below reds
// naming exactly what the note channel carried instead — never a silent pass.
// ADDITIVE ONLY: no existing cell in this file is weakened, reworded,
// reordered or deleted.
// ===========================================================================

/** The committed body sentinel — present in `userTexts` iff the body ran. */
const B181_SENTINEL = "SENTINEL-B181";

/** The AJV-on-`args` row's fixed phrase (determinism-cancellation-failure.md:52). */
const B181_AJV_ARGS_PHRASE = "argument binding produced invalid args";

/**
 * The expected BND-1 success echo (`renderArgumentEcho`,
 * `src/render/argument-echo.ts`): declaration-order fields `topic=hello,
 * sev=high (default)` — `high` unquoted (it matches the echo's
 * `[A-Za-z0-9_.-]+` unquoted-string predicate) and `(default)`-tagged because
 * `sev` took its declared default rather than a binder-supplied value.
 */
const B181_EXPECTED_NOTE = "Running /b181livedef: topic=hello, sev=high (default)";

/**
 * The declared-default fixture: a required `string` plus a `params:` default
 * authored as `Enum.Variant` access — the spec's own worked-example spelling
 * (`frontmatter-fields-a.md:67`, `severity: Severity = Severity.Medium`) — over
 * a body-declared `enum Sev`. Two fields, so this is never
 * `classifyBinderBypass`'s single-string-bypass shape
 * (src/binder/binder-envelope.ts): a genuine binder pass runs, which is why it
 * needs a resolvable `bind_model:` to register.
 *
 * The body interpolates the bound `sev` value's rendered wire string AND its
 * cross-type equality against a body-code `Sev.High` — the same technique the
 * bug-0067 / bug-0172-face-2 cells above use to make the tag's SURVIVAL a
 * deterministic, theta-computed observable (`valuesEqual`'s enum arm,
 * `src/runtime/value.ts`) rather than something only the model's reply could
 * show.
 */
function enumAccessDefaultBinderTheta(): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    "  topic: string",
    "  sev: 'Sev = Sev.High'",
    "---",
    'enum Sev { High = "high", Low = "low" }',
    "@`" +
      B181_SENTINEL +
      " topic=${topic} sev=${sev} tagged=${sev == Sev.High}. What is 462 plus 107? Answer with the number only.`",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0181: a params: default authored as Enum.Variant access binds through a real binder pass, live (Convention: live-host acceptance)", () => {
  it("admits the recovered `Sev.High` default at the post-default-merge AJV check, echoes it, and reaches the body TAGGED", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without it, a missing
      // success echo below could be (wrongly) attributed to a broken workspace
      // instead of the post-default-merge verdict under test.
      { source: "project", stem: "b181livectl", text: promptTheta("THETA-LIVE-OK") },
      { source: "project", stem: "b181livedef", text: enumAccessDefaultBinderTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b181livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the enum-access default under test, would explain the missing " +
          "success echo below too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      // The theta MUST register: an `Enum.Variant` default's load-time
      // compatibility check defers (the relation resolves names against an
      // empty environment, `type-system.md:48`), so the value class survives
      // to the runtime hook this cell drives. A theta refused at load would
      // leave the fix unwitnessed rather than exercised.
      expect(
        handle.command("b181livedef"),
        "the enum-access-default theta did not register — either its " +
          "bind_model: chain failed to resolve (a registry problem) or the " +
          "load-time gate over-refused a declared type it must defer on, " +
          "which would leave the runtime hook unreachable rather than " +
          "enforced. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The slash argument names ONLY the required field, so the binder has
      // nothing to say about `sev` and omits it per its system prompt's last
      // line — leaving the runtime's own fill-if-absent to supply `Sev.High`.
      const turn = await driveSlashCaptureTurn(handle, "/b181livedef hello");

      // THE FIXED OBSERVABLE, asserted FIRST and POSITIVELY so a red names
      // what the channel actually carried. Read off the settled in-memory
      // `SessionManager` (AGENTS.md §"Assert on real observables"), never off
      // `prompt()` merely resolving — a fail-closed binder still resolves.
      // Pre-fix this channel carries the AJV-on-`args` refusal instead
      // (`docs/bugs/0181-…md` §Reproduction (a)) and this row is absent.
      expect(
        turn.systemNotes,
        "the theta-system-note channel carries no BND-1 success echo for the " +
          "recovered `Sev.High` default — pre-fix the boxed carrier reaches " +
          "`validator.validate(merged)` un-projected and AJV refuses it on " +
          "`typeof`, rendering the AJV-on-`args` row instead. Notes: " +
          JSON.stringify(turn.systemNotes) +
          "; outbound: " + JSON.stringify(turn.userTexts),
      ).toContain(B181_EXPECTED_NOTE);

      // The bug's own failure signature, asserted as an ABSENCE.
      expect(
        turn.systemNotes.filter((n) => n.includes(B181_AJV_ARGS_PHRASE)),
        "the AJV-on-`args` refusal fired for a default the theta's own " +
          "declared type admits. Notes: " + JSON.stringify(turn.systemNotes),
      ).toEqual([]);

      // THE TAG'S SURVIVAL, proved by the theta's OWN `==` operator rather
      // than by inspecting the runtime value from outside: a bound value that
      // reached the body as a bare untagged string takes `valuesEqual`'s
      // cross-type arm against a body-code `Sev.High` and renders `false`; the
      // declaring-enum tag surviving the merge → AJV → inbound-retag chain
      // renders `true`. This is the SAME technique the bug-0067 /
      // bug-0172-face-2 cells above use for the identical reason.
      const outbound = turn.userTexts.join("\n");
      const anchored = /tagged=(true|false)/.exec(outbound);
      expect(
        anchored,
        "the rendered tagged=… segment is absent — the body never ran on the " +
          "recovered default. Outbound: " + JSON.stringify(turn.userTexts) +
          "; notes: " + JSON.stringify(turn.systemNotes),
      ).not.toBeNull();
      expect(
        anchored![1],
        "runtime-value-model.md:34 / frontmatter-fields-a.md:71 — the " +
          "recovered `Sev.High` default must reach body scope indistinguishable " +
          "from a body-code `Sev.High`; a projected-but-never-retagged value " +
          "would take valuesEqual's cross-type arm and render `false`. " +
          "Rendered segment: " + JSON.stringify(anchored![1]),
      ).toBe("true");

      // The committed sentinel proves the body genuinely ran (never merely
      // that SOME turn happened to mention "true").
      expect(
        turn.userTexts.some((t) => t.includes(B181_SENTINEL)),
        "the committed body sentinel is absent from the outbound text — the " +
          "body did not run. Outbound: " + JSON.stringify(turn.userTexts),
      ).toBe(true);

      // No OTHER fail-closed ending: a note from this set would mean the
      // fixture broke rather than that the enum-access default bound cleanly.
      const failureNotes = turn.systemNotes.filter((n) =>
        /^theta \/b181livedef (returned Err|cancelled|aborted)/.test(n),
      );
      expect(
        failureNotes,
        "the drive ended through a fail-closed path instead of binding " +
          "cleanly: " + JSON.stringify(failureNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0179 — `decide`'s TYPE-7 array arm (src/parser/type-compat.ts:218–226)
// answered `"incompatible"` for a `named` sub the TypeEnv cannot resolve,
// before control could reach the unresolvable-`named`-sub escape 53 lines
// below it (:275–278) — so an `array<T>`-declared sink refused any expression
// `StaticTypeInferencePass.#typeExpr` leaves nominal (a method call, a member
// read, a `fn` call, an index), naming the placeholder as though it were a
// type (`expected array<string>, got keys`)
// (docs/bugs/0179-array-sink-refuses-unresolvable-value-type.md). The offline
// witness (`tests/array-sink-unresolvable-deferral.test.ts`) pins the parse
// verdict and the executed value through the OFFLINE `parseThetaDocument` +
// production-executor harness; this cell exercises the SAME defect through
// the REAL discovery→registration path this file's other cells use — the
// shipped composition root's `hasLoadParseError` gate un-registers a caller
// carrying an error-severity diagnostic, so pre-fix / neutralised the theta
// below fails to register, exactly as the bug's §Reproduction (b) fails to
// register inside a spawned child.
//
// Registration-only, mirroring the bug 0089 / bug 0095 cells above: the fix
// is a LOAD-time verdict, so no `@`-query is needed for the theta to
// register and no slash is driven — zero tokens spent beyond the live
// provider/session bootstrap this file's every cell already pays.
//
// ADDITIVE ONLY: no existing cell in this file is weakened, reworded,
// reordered or deleted.
// ===========================================================================

/** `theta/parse/object-field-type-mismatch`'s registered code and registry page. */
const OBJECT_FIELD_MISMATCH_CODE = "theta/parse/object-field-type-mismatch";
const OBJECT_FIELD_MISMATCH_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `theta/parse/object-field-type-mismatch: field '<field>' on schema
 * '<schema>' type mismatch: expected <expected>, got <actual>` with every
 * placeholder substituted — DIAG-4: the message half is read from the
 * registry row, not copied. Unlike this file's `nonArrayIterandFragment` /
 * `emptySchemaBodyFragment` (whose substituted values never contain literal
 * angle brackets), this code's `<expected>`/`<actual>` slots legitimately fill
 * with `array<string>`/`keys` — a post-substitution `/<[a-z]+>/` staleness
 * regex would false-positive on `array<string>`'s own brackets, so the
 * staleness check runs BEFORE substitution instead (each slot's presence in
 * the raw template), mirroring the offline witness
 * (`tests/array-sink-unresolvable-deferral.test.ts`'s `interpolate` helper).
 * Used only for the ABSENCE assertion below: post-fix, no note carrying this
 * fragment for the fixed caller's own `ks`/`R`/`array<string>`/`keys`
 * instance may appear.
 */
function objectFieldMismatchFragment(
  field: string,
  schemaName: string,
  expectedType: string,
  actualType: string,
): string {
  const template = registryMessage(
    OBJECT_FIELD_MISMATCH_REGISTRY,
    OBJECT_FIELD_MISMATCH_CODE,
  ) as string | undefined;
  expect(
    template,
    `${OBJECT_FIELD_MISMATCH_CODE} has no registry row — the code this cell ` +
      "asserts is not registered (DIAG-2)",
  ).toBeTypeOf("string");
  let message = template as string;
  const slots: ReadonlyArray<readonly [string, string]> = [
    ["<field>", field],
    ["<schema>", schemaName],
    ["<expected>", expectedType],
    ["<actual>", actualType],
  ];
  for (const [slot, value] of slots) {
    expect(
      message.includes(slot),
      `${OBJECT_FIELD_MISMATCH_CODE}: the registered Message does not spell ` +
        `${slot} — the registry row's Message template changed shape and ` +
        "this cell's substitution is stale. Template: " + message,
    ).toBe(true);
    message = message.replaceAll(slot, value);
  }
  return `${OBJECT_FIELD_MISMATCH_CODE}: ${message}`;
}

/**
 * The bug doc's own §Reproduction (a) row 1 — the smallest failing input: a
 * two-field schema, one constructor, one `array<string>`-declared sink, one
 * `keys()` call
 * (docs/bugs/0179-array-sink-refuses-unresolvable-value-type.md
 * §Reproduction (a) row 1 — the same body as
 * `tests/array-sink-unresolvable-deferral.test.ts`'s `ROW1`, replayed here
 * through the real discovery→registration path instead of the offline
 * harness). `p.keys()`'s static type is the inference pass's placeholder
 * (`named "keys"`, src/parser/static-type-inference.ts:261–262), unresolvable
 * in the TypeEnv — exactly the sub-side condition the fix's escape narrows on.
 */
function arraySinkNominalPlaceholderTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "schema P { a: string, b: string }",
    'let p = P { a: "x", b: "y" }',
    "schema R { ks: array<string> }",
    "R { ks: p.keys() }",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0179: an `array<T>`-declared sink fed by a nominal-placeholder value registers, live (Convention: live-host acceptance)", () => {
  it("registers a caller whose constructor field is `array<string>` and whose value is `p.keys()`, and the theta-system-note channel carries no object-field-type-mismatch rejection naming the `keys` placeholder, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, a
      // regressed fix (the caller failing to register) could be (wrongly)
      // attributed to a broken workspace instead of the gate under test.
      { source: "project", stem: "b179livectl", text: promptTheta("THETA-LIVE-OK") },
      { source: "project", stem: "b179livearr", text: arraySinkNominalPlaceholderTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b179livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the array-sink gate under test, would explain the caller's absence " +
          "too. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root
      // (not the offline parseThetaDocument harness the unit witness uses),
      // an `array<string>`-declared constructor field fed by a `keys()` call
      // registers — `decide`'s TYPE-7 arm (type-compat.ts) now answers
      // "unknown" for the unresolvable `named` sub `p.keys()` types as, so
      // `hasLoadParseError` no longer un-registers this caller the way it did
      // pre-fix / under neutralisation.
      expect(
        handle.command("b179livearr"),
        "the caller whose `array<string>` constructor field is fed by " +
          "`p.keys()` failed to register — theta/parse/object-field-type-" +
          "mismatch fired on a program type-system.md:48 requires the parser " +
          "to defer on. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toContain("b179livearr");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"): the diagnostic, when it fires, fires at LOAD time,
      // before any drive, so the full entry list is the delta (mirrors the
      // bug 0089 / bug 0095 cells above). Post-fix there is nothing to reject
      // for this caller's own `ks`/`p.keys()` instance, so this fragment's
      // ABSENCE is the success signal.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const regressionFragment = objectFieldMismatchFragment(
        "ks",
        "R",
        "array<string>",
        "keys",
      );
      expect(
        notes.some((note) => note.includes(regressionFragment)),
        "a theta-system-note entry named the object-field-type-mismatch " +
          "rejection for the array-sink caller — the bug 0179 escape " +
          "regressed. Notes: " + JSON.stringify(notes),
      ).toBe(false);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0180 — a typed `invoke<T>` whose `Ok` payload carries a non-finite
// `number` gets opposite verdicts by the callee's `mode:`
// (docs/bugs/0180-invoke-return-nonfinite-number-mode-variance.md). §Fix (b):
// the child refuses to emit an `Ok` envelope for a payload carrying a
// non-finite `number` — `theta/runtime/subagent-return-value-not-representable`
// + `Err(InvokeInfraError{cause:"return_validation"})` naming the value and its
// RFC-6901 position — instead of `JSON.stringify`ing it to a substituted `null`
// the parent then silently admits (the S1 arm, nullable annotation) or refuses
// for the wrong reason (the loud arm, non-nullable annotation).
//
// THIS CELL DRIVES THE NULLABLE (S1) ARM, because it is the ONE shape whose
// TOP-LEVEL `theta-system-note` observable actually FLIPS between the pre-fix
// and post-fix behaviour. `invoke<number>` (non-nullable) already refuses at
// HEAD, for an unrelated reason (AJV's `must be number` over the substituted
// `null`) — and the top-level SNK-i note template (`theta /<name> returned
// Err: invoke of <callee_path> failed (<cause>)`, `src/runtime/err-note-
// render.ts`) carries no `.message`, so both the pre-fix and post-fix causes
// render as the SAME `return_validation` text either side of the fix; that arm
// cannot witness this live through the note channel alone. `invoke<number |
// null>` is bug 0180's S1 arm: at HEAD it binds `Ok(null)` (the callee's
// `Infinity`, silently replaced) and the theta terminates `Ok` — the
// runtime-event-channel.md "Success-side null-policy" fixes that an `Ok(v)`
// termination emits NO `theta-system-note` at all — so the pre-fix observable
// is an EMPTY per-drive `systemNotes`. Post-fix the envelope refuses BEFORE
// serialising, the caller's `?` propagates the `Err` as the WHOLE top-level
// theta's own termination (no `invoke_callee` wrapping: `invoke_infra` is one
// of the two kinds `runInvokeEffect` passes through UNCHANGED,
// `src/runtime/effectful-statement-host.ts`), and SLSH-3 fires exactly one
// note at the slash-dispatch boundary. Absence flips to presence — the
// strongest discriminator this note channel can give without a query.
//
// ZERO MODEL TURNS. The kid `b180livekid.theta` (`mode: subagent`) is a pure
// tail expression (`1 / 0`) — the bug doc's own headline spelling
// (§Reproduction (a), `expressions.md:232`) — and the parent
// `b180liveparent.theta` (`mode: prompt`) is the SOLE statement
// `invoke<number | null>("./b180livekid.theta")?`, with no `@` query anywhere
// in either file. `AgentSession.prompt(text)`
// (`node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js`,
// the "Handle extension commands first" branch) returns as soon as
// `_tryExecuteExtensionCommand` reports `handled`, WITHOUT sending anything to
// the model unless the theta itself calls `pi.sendUserMessage`/`sendMessage` —
// which this fixture pair never does. Confirmed offline (parse + in-process
// drive sanity check) before this cell was added, then deleted per scratch
// policy.
//
// A REAL RFC-0006 CHILD PROCESS IS SPAWNED for the `mode: subagent` kid — this
// file's imported `./harness` sets all three `#subagent-child-pins` at module
// scope (`process.argv[1]`, `SUBAGENT_EXTENSION_PIN_ENV`,
// `SUBAGENT_PARENT_PID_ENV = String(process.ppid)`), exactly as every other
// subagent-spawning cell in this file (bug 0067, bug 0172, bug 0174 above)
// relies on; nothing new is pinned here.
//
// ADDITIVE ONLY: no existing cell in this file is weakened, reworded,
// reordered or deleted.
// ===========================================================================

/** The `mode: subagent` callee: a pure non-finite tail, zero model turns — bug 0180's own headline spelling (§Reproduction (a), `expressions.md:232`). */
function b180NonFiniteKidTheta(): string {
  return ["---", "mode: subagent", "---", "1 / 0", ""].join("\n");
}

/**
 * The `mode: prompt` parent: the SOLE statement is the nullable typed
 * `invoke<number | null>` with `?`, so the whole top-level theta terminates
 * with the invoke's own `Result` — `Ok(null)` at HEAD (silent), `Err(...)`
 * post-fix (SLSH-3 fires) — with no `@` query anywhere.
 */
function b180NonFiniteNullableParentTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    'invoke<number | null>("./b180livekid.theta")?',
    "",
  ].join("\n");
}

describe("H8a-T — bug 0180: a typed invoke<number | null> of a subagent-mode callee whose value is non-finite refuses instead of silently binding null, live", () => {
  it("the invoke's Err propagates through `?` and the slash-dispatch boundary emits the SLSH-3 note naming return_validation, through a REAL spawned subagent child, spending zero model turns", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      { source: "project", stem: "b180livekid", text: b180NonFiniteKidTheta() },
      { source: "project", stem: "b180liveparent", text: b180NonFiniteNullableParentTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the parent command must exist before a live turn is
      // driven, so a discovery/parse failure reds with zero tokens.
      expect(
        handle.command("b180liveparent"),
        "no bug-0180 non-finite-nullable parent command to invoke — the .theta " +
          "failed discovery/parse. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const turn = await driveSlashCaptureTurn(handle, "/b180liveparent");

      // Zero model turns: no `@` anywhere in either fixture, so nothing is
      // sent to the model and no user-visible turn is produced.
      expect(
        turn.userTexts,
        "no `@` query appears anywhere in either fixture; userTexts must stay " +
          "empty — observed: " + JSON.stringify(turn.userTexts),
      ).toEqual([]);

      // THE FIXED OBSERVABLE (AGENTS.md §"Assert on real observables" — the
      // `theta-system-note` channel read off the settled `SessionManager` via
      // the harness's per-turn `systemNotes`). Pre-fix this slice is EMPTY
      // (`Ok(null)` termination — success-side null-policy, no note) and the
      // caller silently binds `null` where the callee produced `Infinity`
      // (bug 0180's S1 arm). Post-fix the child refuses BEFORE the envelope,
      // `?` propagates the `Err`, and SLSH-3 fires exactly one note naming the
      // `return_validation` cause.
      const failureNotes = turn.systemNotes.filter((n) =>
        n.startsWith("theta /b180liveparent returned Err:"),
      );
      expect(
        failureNotes,
        "bug 0180 §Fix (b): invoke<number | null> of a subagent-mode callee " +
          "whose value is 1 / 0 must refuse rather than silently bind null — no " +
          "SLSH-3 note fired. systemNotes: " + JSON.stringify(turn.systemNotes),
      ).toHaveLength(1);
      const note = failureNotes[0] ?? "";
      expect(
        note,
        "the SNK-i template (`err-note-render.ts`) names the cause: " + note,
      ).toContain("failed (return_validation)");
      expect(
        note,
        "and names the refused callee, the non-finite kid: " + note,
      ).toContain("b180livekid.theta");
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0136 — `#typeExpr`'s `case "member"` arm
// (src/parser/static-type-inference.ts:242–279) typed EVERY member access as
// `{ kind: "named", name: node.field }` — the FIELD's name, not its declared
// type — so eight registered `E`-severity checks were unreachable on
// `p.field` for a schema-typed `p`, while a ninth,
// `theta/parse/non-array-iterand`, refused the spec-legal `for y in p.xs`
// outright
// (docs/bugs/0136-member-access-types-as-field-name-not-field-type.md). The
// fix resolves the receiver's type, unfolds it (`unfoldAlias`,
// `type-compat.ts`), and — when it is a `named` whose declaration is an
// object schema carrying an own key for the field — returns that field's
// declared `CompatType`; when the receiver resolves to no declaration, it
// returns the RECEIVER'S OWN `named` rather than `node.field` (schemas.md:97's
// "`Enum.Variant` … statically typed as `Enum`", obtained structurally). The
// offline 72-cell unit witness
// (tests/member-access-declared-field-type.test.ts) proves the mechanism at
// the `parseThetaDocument` boundary; this cell proves the SAME registration
// consequence end to end through the real production composition root
// (session_start → resources_discover → composeExtensionInstance →
// checkTypeLayer) — the fixed path had zero live coverage before this
// addition.
//
// THE STRONGEST OBSERVABLE, MIRRORED FROM THE BUG 0089 CELL ABOVE (an
// alias-typed fn parameter iterated in a `for` registers, live): the SAME
// registration-restored shape, at a disjoint arm eight `case` labels above
// bug 0089's index arm in the same switch.
//   - `b136livefield` — the bug doc's own §Reproduction row c1, verbatim
//     (`tests/member-access-declared-field-type.test.ts` cell c1's
//     production-parser shape): an object-schema field declared
//     `array<string>`, iterated by a same-file `fn`'s `for` loop. Pre-fix
//     `#typeExpr` typed `p.xs` as the nominal `named "xs"` (the field NAME),
//     so `checkForIterand` (src/parser/control-flow.ts) refused a spec-legal
//     iterand at `E` severity (`theta/parse/non-array-iterand: … got xs`,
//     control-flow.md:13 admits this loop) and `hasLoadParseError`
//     (production-composition.ts) denied registration. Post-fix `p.xs`
//     resolves to the declared `array<string>`, the iterand check admits it,
//     and the caller registers — the fixed observable this cell asserts, by
//     the SAME absence-of-regression-fragment channel bug 0089's cell uses.
//
// THE REFUSAL-ADDED DIRECTION, ADDED AS A THIRD PLANTED THETA SHARING THIS
// CELL'S ONE PRECONDITION CONTROL — the harness admits this cheaply
// (registration-only, no drive, zero tokens), mirroring the multi-fixture,
// mixed-direction shape the bug 0081 and bug 0149 cells above already
// establish in this same file (an admission and a denial sharing one
// precondition; two faces of one cell sharing one precondition):
//   - `b136liverefuse` — the bug doc's own §Reproduction row b1 / row h1,
//     verbatim: an object-schema field declared `string`, a method call the
//     theta 1.0 stdlib does not expose on that declared type
//     (`p.s.frobnicate()`). Pre-fix the same arm typed `p.s` as the nominal
//     `named "s"`, unresolvable, so `checkMethodCall`'s A2 gate
//     (type-layer-checks.ts) deferred and this caller REGISTERED, reaching
//     `theta/runtime/internal-error` at runtime if driven (§Reproduction row
//     h1) — never driven here; registration alone is this control's whole
//     observable, so the cell spends no extra tokens proving it. Post-fix
//     `p.s` resolves to the declared `string`, `theta/parse/unknown-method`
//     fires at PARSE (`E` severity), and `hasLoadParseError` denies
//     registration BEFORE any drive could reach the runtime outcome — the
//     opposite direction from `b136livefield` above, sharing this cell's one
//     precondition control. Reuses this file's existing
//     `unknownMethodFragment` reader (bug 0125's addition) rather than a
//     second one — the same registered code, the same message shape.
//
// Registration-only: no slash command is invoked, so no model turn runs and
// the cell spends zero tokens (the same profile the bug 0070/0071/0077/
// 0079(a)/0110/0084/0089/… cells above claim). ADDITIVE ONLY: no existing
// cell in this file (1–43) is weakened, reworded, reordered or deleted.
// ===========================================================================

/**
 * The bug doc's own §Reproduction row c1, verbatim
 * (docs/bugs/0136-member-access-types-as-field-name-not-field-type.md
 * §Reproduction (c) row c1 / `tests/member-access-declared-field-type.test.ts`
 * cell c1's production-parser shape, replayed here through the real
 * discovery→registration path instead of the offline harness). The trailing
 * `1` supplies the theta's final value — no `@`-query is needed for a
 * prompt-mode theta to register, matching the bug 0089 cell's own
 * `aliasIterandTheta` above.
 */
function fieldIterandTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "schema P { xs: array<string> }",
    "fn f(p: P) {",
    "  for y in p.xs {",
    "    y",
    "  }",
    "}",
    "1",
    "",
  ].join("\n");
}

/**
 * The bug doc's own §Reproduction row b1 / row h1, verbatim
 * (docs/bugs/0136-member-access-types-as-field-name-not-field-type.md
 * §Reproduction (b) row b1 / `tests/member-access-declared-field-type.test.ts`
 * cell b1's production-parser shape). The trailing `1` supplies the theta's
 * final value, matching `fieldIterandTheta` above; never driven, so
 * registration alone is this control's whole observable.
 */
function fieldMethodMisuseTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "schema P { s: string }",
    "fn f(p: P) {",
    "  p.s.frobnicate()",
    "}",
    "1",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0136: a member read's static type is the receiver's declared field type, live (Convention: live-host acceptance)", () => {
  it("registers a caller whose `for` loop iterates an object-schema field declared array<string>, and does not register a sibling whose method call misuses that field's declared string type, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace,
      // proving the workspace and discovery walk both work — without this,
      // either fixture's outcome could be (wrongly) attributed to a broken
      // workspace instead of the gates under test.
      { source: "project", stem: "b136livectl", text: promptTheta("THETA-LIVE-OK") },
      // The fixed observable: registration-RESTORED direction.
      { source: "project", stem: "b136livefield", text: fieldIterandTheta() },
      // The refusal-ADDED direction, sharing the precondition control above.
      { source: "project", stem: "b136liverefuse", text: fieldMethodMisuseTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b136livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the gates under test, would explain either fixture's outcome too. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root
      // (not the offline parseThetaDocument harness the unit witness uses), a
      // for-iterated object-schema field declared array<string> registers —
      // the receiver resolves to the declared `P`, the field's declared type
      // unfolds to `array<string>`, and `checkForIterand` no longer refuses
      // it, so `hasLoadParseError` has nothing to act on.
      expect(
        handle.command("b136livefield"),
        "the caller whose `for` loop iterates a field declared array<string> " +
          "failed to register — theta/parse/non-array-iterand fired on a " +
          "program control-flow.md:13 admits. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toContain("b136livefield");

      // The refusal-added direction: the sibling whose method call misuses
      // the field's declared `string` type must NOT register — the opposite
      // direction, proven in the same cell at no extra token cost.
      expect(
        handle.command("b136liverefuse"),
        "the caller whose method call misuses a field declared string " +
          "registered anyway through the live discovery/session_start path " +
          "— theta/parse/unknown-method did not fire on the resolved field " +
          "type. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b136liverefuse");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager` rather
      // than off racy events: both diagnostics fire at LOAD time, before any
      // drive, so the full entry list is the delta (mirrors the bug 0110/
      // 0084/0089/…/0149/0081 cells above).
      const notes = systemNoteContents(handle.sessionManager.getEntries());

      // Registration-restored direction: absence of the pre-fix regression
      // fragment is the success signal (mirrors the bug 0089 cell's own
      // convention exactly).
      const regressionFragment = nonArrayIterandFragment("xs");
      expect(
        notes.some((note) => note.includes(regressionFragment)),
        "a theta-system-note entry named the non-array-iterand rejection for " +
          "the field-iterand caller — the fix regressed. Notes: " +
          JSON.stringify(notes),
      ).toBe(false);

      // Refusal-added direction: presence of the new rejection fragment is
      // the success signal (mirrors the bug 0139/0142/…/0149 cells' own
      // convention exactly, reusing bug 0125's `unknownMethodFragment`).
      const expectedFragment = unknownMethodFragment("frobnicate", "string");
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the unknown-method rejection for " +
          "the field-method-misuse caller. Notes: " + JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0126 — `TypeLayerWalk.walkStmt`'s `case "for"` (src/parser/type-layer-
// checks.ts) walked a plain `for` body with a copy of the enclosing scope and
// never bound the iteration variable, so nine registered `E`-severity
// type-layer codes could not fire on the loop variable inside a plain `for`
// body even over a concrete `array<T>` iterand, while `walkExpr`'s
// `case "par-for"` bound the same variable to the same iterand's element and
// reported all nine on the identical body
// (docs/bugs/0126-plain-for-binds-no-loop-variable.md). The fix binds the
// loop variable to the (TYPE-11-unfolded) iterand's element when it unfolds to
// an `array`, mirroring the `par for` arm's own `unprovableBindings` guard;
// a non-`array` iterand still falls back to bug 0050's WITHHELD twin.
//
// THE FIXED OBSERVABLE, MIRRORED FROM THE BUG 0089 CELL (an alias-typed fn
// parameter iterated in a `for` registers, live) AND THE BUG 0136 CELL (a
// `for`-iterated declared-field element registers, live) ABOVE — both
// registration-only, zero-model-turn cells in this exact family. Unlike
// those two, which are the REGISTRATION-RESTORED direction (0126 §Fix (b)'s
// removals — a false rejection stops firing), this report's own live surface
// is the REFUSAL-ADDED direction (0126 §Fix (b)'s additions — a program that
// registered clean now draws a new `E`), mirrored instead from the bug 0136
// cell's own second fixture (`b136liverefuse`, sharing that cell's one
// precondition control): a concrete `array<string>` `fn` parameter, a plain
// `for` loop over it, and a method call the theta 1.0 stdlib does not expose
// on the unfolded element type `string` (expressions.md:71) — the offline
// witness's own cell a1
// (tests/plain-for-loop-variable-element-type.test.ts). Pre-fix `walkStmt`'s
// `case "for"` withheld the loop variable's type, so `checkMethodCall`
// deferred and this caller registered silently; post-fix the loop variable
// carries the iterand's element type and `theta/parse/unknown-method` fires at
// PARSE (`E` severity), so `hasLoadParseError` (production-composition.ts)
// denies registration — the fixed observable this cell asserts, by the SAME
// registration + theta-system-note channels the bug 0089/0136 cells use.
//
// No existing live fixture (H8a, H9a, or the hardening probes) plants a plain
// `for` body that READS its loop variable through a method call on a concrete
// `array<T>` parameter — confirmed statically (`rg -n "for \w+ in" tests/live/
// docs/examples/` shows only bodies that never read the variable, or that
// read it through a `match` / template-interpolation the checker this cell
// pins does not classify) — so no existing live fixture had reach over this
// arm, mirroring the bug 0089/0136 cells' own "no existing live fixture
// reaches this arm" findings.
//
// Registration-only: no slash command is invoked, so no model turn runs and
// the cell spends zero tokens, the same profile as the bug 0070/0071/0077/
// 0079(a)/0110/0084/0089/…/0136 cells above. ADDITIVE ONLY: no existing cell
// in this file (1–44) is weakened, reworded, reordered or deleted.
// ===========================================================================

/**
 * Bug 0126's own §Reproduction (a) row 1 / the offline witness's cell a1
 * (tests/plain-for-loop-variable-element-type.test.ts), replayed here through
 * the real discovery→registration path instead of the offline harness: a
 * concrete `array<string>` `fn` parameter, a plain `for` loop over it, and a
 * method call the theta 1.0 stdlib does not expose on the unfolded element
 * type `string`. The trailing `1` supplies the theta's final value — no
 * `@`-query is needed for a prompt-mode theta to register, matching the bug
 * 0089 cell's own `aliasIterandTheta` above.
 */
function forBodyMethodMisuseTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "fn f(xs: array<string>) {",
    "  for x in xs {",
    "    x.frobnicate()",
    "  }",
    "}",
    "1",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0126: a plain `for` body's method misuse of its loop variable is refused, live (Convention: live-host acceptance)", () => {
  it("does not register a caller whose plain `for` body calls an unsupported method on its loop variable, while a precondition control in the same workspace registers, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, a
      // regressed fix (the misuse caller registering because the loop
      // variable's type never resolved) could be (wrongly) attributed to a
      // broken workspace instead of the gate under test.
      { source: "project", stem: "b126livectl", text: promptTheta("THETA-LIVE-OK") },
      { source: "project", stem: "b126liveforread", text: forBodyMethodMisuseTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b126livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the gate under test, would explain the misuse caller's absence too. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root
      // (not the offline parseThetaDocument harness the unit witness uses), a
      // plain `for` body that calls an unsupported method on its loop
      // variable no longer registers — `walkStmt`'s `case "for"`
      // (type-layer-checks.ts) now binds the variable to the (TYPE-11-
      // unfolded) iterand's element, so `checkMethodCall` fires
      // `theta/parse/unknown-method` at PARSE and `hasLoadParseError` denies
      // registration.
      expect(
        handle.command("b126liveforread"),
        "the caller whose plain `for` body calls an unsupported method on its " +
          "loop variable registered anyway through the live discovery/" +
          "session_start path — theta/parse/unknown-method did not fire on the " +
          "bound element type. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b126liveforread");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"): the diagnostic fires at LOAD time, before any drive,
      // so the full entry list is the delta (mirrors the bug 0110/0084/0089/
      // …/0136 cells above).
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = unknownMethodFragment("frobnicate", "string");
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the unknown-method rejection for " +
          "the for-body misuse caller. Notes: " + JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0185 — `checkVariantAccess` (src/parser/schema-declarations.ts:315) had
// exactly one call site, inside the body's own structural walk
// (theta-document.ts:6641), so a `params:` default's `Enum.Variant` access
// never reached it: `sev: 'Sev = Sev.Missing'` against `enum Sev { High =
// "high", Low = "low" }` loaded with ZERO diagnostics and registered, then
// aborted EVERY invocation — `resolveEnumVariant`
// (src/runtime/lexical-environment.ts:674) answered `undefined`, the pure
// evaluator's `member` arm fell through to `evaluateMemberAccess(null,
// "Missing")`, and that raised `NullMemberAccessPanic` out of a recovery whose
// own doc-comment says it never throws
// (docs/bugs/0185-unresolvable-enum-variant-default-panics-recovery.md). The
// fix's route 1 (`checkParamsDefaultNames` / `walkParamsDefaultNames` /
// `hoistEnumVariants`, src/parser/theta-document.ts, wired after
// `checkUnknownIdentifiers`) reaches the body's own `checkVariantAccess` from
// the `params:` position too, so the unresolvable variant now refuses at
// LOAD, before registration and before any binder call.
//
// THE FIXED OBSERVABLE, MIRRORED FROM THE BUG 0059/0136/0126 CELLS ABOVE:
// registration-only, zero-model-turn. Post-fix the refusing theta does NOT
// register, so — unlike the bug 0181 live cell above, which drives a real
// binder pass over a RESOLVABLE `Enum.Variant` default — this cell spends no
// token at all: `hasLoadParseError` (src/extension/production-composition.ts)
// denies registration on the SAME `theta/parse/unknown-variant` diagnostic
// the body position already draws, strictly before `resolveBinderModel` is
// ever reached (parseDiscoveredTheta's drop happens in the pass BEFORE the
// binder-model-resolution loop), so neither fixture below needs its
// registration verdict proven by a driven turn.
//
// THE PRECONDITION CONTROL, mirrored from the bug 0059/0136/0126 cells: an
// ordinary theta in the SAME workspace, proving the workspace and discovery
// walk both work. A SECOND control shares this cell's workspace — the
// same-shape SIBLING whose `Enum.Variant` default RESOLVES
// (`sev: 'Sev = Sev.High'`) — so the refusing fixture's absence cannot be
// (wrongly) attributed to "a `params:` default naming `Enum.Variant` access
// never registers here" instead of to the unresolvable VARIANT, mirroring the
// bug 0059 pair's (`conformantParamsTypeTheta` / `junkParamsTypeTheta`) own
// isolation. The sibling's one field declares the `NamedType` `Sev`, not
// `string`, so `classifyBinderBypass` (src/binder/binder-envelope.ts)
// classifies it `binder` rather than bypass-eligible; it declares the same
// `bind_model:` bug 0181's live cell above already proves resolves live, so
// its chain resolves at LOAD (a local metadata check against the model
// registry inside `resolveBinderModel`, src/binder/binder-model.ts — no token
// is spent whether or not a theta is ever driven). Neither sibling is driven.
//
// No existing live fixture (H8a in this file, the H9a acceptance fixtures, or
// the hardening probes) declares an `enum` at all — the bug doc's own corpus
// census (§Affected, "Corpus census, re-run at HEAD") and a fresh `rg -n
// "^\s*enum " tests/live/` agree — so the fixed arm had NO live reach before
// this cell.
//
// Registration-only: no slash command is invoked, so no model turn runs and
// the cell spends zero tokens, the same profile as the bug 0059/0126/0136
// cells above. No subagent child process is spawned (every fixture is prompt
// mode, with no `invoke(...)` and no `subagent fn`), so the
// #subagent-child-pins convention this file's harness otherwise honours does
// not apply to this cell. ADDITIVE ONLY: cell 41 (bug 0181, above) and every
// other cell in this file (1–46) are unchanged; this is cell 47, added after
// the bug 0126 cell.
// ===========================================================================

/** The code the `params:` position now mints for an undeclared enum variant. */
const UNKNOWN_VARIANT_CODE = "theta/parse/unknown-variant";

/** The sharded registry page carrying `theta/parse/unknown-variant`'s row. */
const UNKNOWN_VARIANT_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `theta/parse/unknown-variant: unknown variant '<variant>' on enum
 * '<enum>'` — DIAG-4: the message half is read from the registry row, not
 * copied, mirroring this file's `unknownMethodFragment` /
 * `nonArrayIterandFragment`. The row carries the `<variant>`/`<enum>`
 * placeholder pair, so this helper fills both and the trailing assertion
 * confirms neither is left unsubstituted.
 */
function unknownVariantFragment(variant: string, enumName: string): string {
  const template = registryMessage(
    UNKNOWN_VARIANT_REGISTRY,
    UNKNOWN_VARIANT_CODE,
  ) as string | undefined;
  expect(
    template,
    `${UNKNOWN_VARIANT_CODE} has no registry row — the code this cell ` +
      "asserts is not registered (DIAG-2)",
  ).toBeTypeOf("string");
  const message = (template as string)
    .replaceAll("<variant>", variant)
    .replaceAll("<enum>", enumName);
  expect(
    message,
    `${UNKNOWN_VARIANT_CODE}: an unsubstituted <…> placeholder remains — the ` +
      "registry row's Message template changed shape and this cell's " +
      "substitution is stale",
  ).not.toMatch(/<[a-z]+>/);
  return `${UNKNOWN_VARIANT_CODE}: ${message}`;
}

/**
 * The same-shape SIBLING whose `Enum.Variant` default RESOLVES (the unit
 * witness's cell `s1`,
 * `tests/params-default-unresolvable-enum-variant.test.ts`, itself 0181's own
 * fence), replayed here through the real discovery→registration path instead
 * of the offline harness. Must still register, isolating the refusing
 * fixture's absence to the unresolvable VARIANT rather than to "a `params:`
 * default naming `Enum.Variant` access cannot register here" — the bug 0059
 * pair's own isolation, one level up. A single field whose declared type is
 * the `NamedType` `Sev` (not `string`) is not `classifyBinderBypass`'s
 * single-string-bypass shape, so it needs a resolvable `bind_model:` chain to
 * register — the same reference bug 0181's live cell above already proves
 * resolves live. Never driven: registration is this sibling's whole
 * observable.
 */
function resolvableEnumVariantDefaultTheta(): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    "  sev: 'Sev = Sev.High'",
    "---",
    'enum Sev { High = "high", Low = "low" }',
    "1",
    "",
  ].join("\n");
}

/**
 * The bug's own subject, verbatim (docs/bugs/0185-…md §Reproduction (a) row 1
 * / the unit witness's cell `m1`): the SAME field name and enum as the
 * sibling above, the variant misspelled. Post-fix, `checkParamsDefaultNames`
 * (`src/parser/theta-document.ts`) reaches the body's own `checkVariantAccess`
 * (`src/parser/schema-declarations.ts:315`) from the `params:` position and
 * refuses this at LOAD with `theta/parse/unknown-variant`, so
 * `hasLoadParseError` (`src/extension/production-composition.ts`) denies
 * registration strictly before `resolveBinderModel` is ever reached. Declares
 * the SAME `bind_model:` the sibling above does — inert post-fix (this
 * fixture is dropped in the FIRST parse-drop loop, before the second loop's
 * binder-model-resolution step is ever reached for it) and load-bearing for
 * the neutralised direction: were `checkParamsDefaultNames`'s result dropped
 * from `assembleDiagnostics`, an UNDECLARED `bind_model:` would introduce a
 * second, unrelated load-time refusal (`theta/load/binder-model-unresolved`,
 * a non-bypass theta with no resolvable binder-model chain) that would also
 * deny registration — for the wrong reason, confounding the neutralisation
 * proof this cell's obligation requires (that the refusing theta REGISTERS
 * once this fix's own gate is the only thing removed). Declaring the same
 * resolvable chain here removes that confound.
 */
function unresolvableEnumVariantDefaultTheta(): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    "  sev: 'Sev = Sev.Missing'",
    "---",
    'enum Sev { High = "high", Low = "low" }',
    "1",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0185: a params: default naming an unresolvable Enum.Variant does not register, live (Convention: live-host acceptance)", () => {
  it("does not register a theta whose params: default names an undeclared enum variant, while a precondition control and a resolvable-variant sibling both register, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace,
      // proving the workspace and discovery walk both work — without this, a
      // broken workspace could be (wrongly) blamed for the refusing
      // fixture's absence too.
      { source: "project", stem: "b185livectl", text: promptTheta("THETA-LIVE-OK") },
      // The same-shape sibling whose Enum.Variant default RESOLVES — must
      // still register, so this cell cannot pass by failing to discover
      // anything shaped like its subject.
      {
        source: "project",
        stem: "b185liveresolves",
        text: resolvableEnumVariantDefaultTheta(),
      },
      // The load-bearing refusing theta: the bug's own subject.
      {
        source: "project",
        stem: "b185livemissing",
        text: unresolvableEnumVariantDefaultTheta(),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b185livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the unknown-variant rule under test, would explain the refusing " +
          "fixture's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b185liveresolves"),
        "the same-shape sibling whose Enum.Variant default RESOLVES did not " +
          "register — a params: default naming Enum.Variant access cannot " +
          "register in this harness at all, independent of this bug; that " +
          "would leave the refusing fixture's absence unwitnessed rather than " +
          "caused by the unresolvable variant. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // THE FIXED OBSERVABLE: through the REAL production composition root
      // (not the offline parseThetaDocument harness the unit witness uses), a
      // params: default naming a variant its enum does not declare does NOT
      // register — checkParamsDefaultNames now reaches the body's own
      // checkVariantAccess from the params: position, hasLoadParseError
      // denies registration, and no binder call is ever made.
      expect(
        handle.command("b185livemissing"),
        "the theta whose params: default names an undeclared enum variant " +
          "registered anyway through the live discovery/session_start path " +
          "— theta/parse/unknown-variant did not fire from the params: " +
          "position. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b185livemissing");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager` rather
      // than off racy events: the diagnostic fires at LOAD time, before any
      // drive, so the full entry list is the delta (mirrors the bug 0110/
      // 0084/0089/…/0126 cells above).
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = unknownVariantFragment("Missing", "Sev");
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the unknown-variant rejection, " +
          "naming both the variant and the enum, for the refusing fixture. " +
          "Notes: " + JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0190 — `provableArgType`'s shared `case "member"` / `case "method-call"`
// arm (src/parser/type-layer-checks.ts) returned `undefined` unconditionally
// for a member read, so the wired `theta/parse/fn-arg-type-mismatch` sink
// withheld on every member-read argument even though a member read's static
// type is now the receiver's DECLARED FIELD TYPE (`#typeExpr`'s `case
// "member"`, bug 0136) — measured, `fn g(n: integer)` called `g(p.s)` with
// `p.s` declared `string` reported `[]`, while the identical mismatch one
// spelling over (an annotated parameter) reported the `E` code
// (docs/bugs/0190-fn-arg-sink-withholds-provable-member-reads.md). The fix
// splits the shared arm: `case "method-call"` keeps `undefined`, and `case
// "member"` becomes a proof exactly when the RECEIVER is itself a proven read
// AND the field resolves to a DECLARED type on a resolved object schema — the
// declared field type, TYPE-11-unfolded, via the new
// `StaticTypeInferencePass.declaredFieldType` query.
//
// The 87-cell (was 84) protected witness
// (tests/fn-arg-type-mismatch-wired.test.ts, cells u6p/u6b/u6c) and the
// dedicated 23-cell witness (tests/fn-arg-member-read-proof.test.ts) prove the
// mechanism offline at the `parseThetaDocument` boundary; this cell proves the
// SAME registration consequence end to end through the real production
// composition root (session_start → resources_discover →
// composeExtensionInstance → checkTypeLayer) — the fixed path had zero live
// coverage before this addition.
//
// The mistyped caller mirrors the bug doc's §Reproduction row R1 and the
// dedicated witness's cell R1 verbatim (`schema P { s: string }` +
// `fn g(n: integer): integer { n }` + `fn f(p: P): integer { g(p.s) }`): a
// same-file plain `fn` call whose argument is a MEMBER READ, both operands
// statically resolvable (the declared field type and the declared parameter
// type), the simplest input the row's Trigger names.
// `theta/parse/fn-arg-type-mismatch` is severity `E`, so `hasLoadParseError`
// un-registers the caller at the SAME site the bug 0050 cell above exercises
// for the identifier-argument twin of this row.
//
// The compatible sibling mirrors the dedicated witness's BOUND S1 verbatim
// (the same schema and call shape, with `g`'s parameter declared `string`
// instead of `integer`): opening the sink judges, it does not indiscriminately
// refuse, so a member-read argument whose declared field type IS compatible
// with the parameter still registers — the isolating direction bug 0050's own
// cell established for a literal argument, replayed here for a member read.
//
// Registration-only: no slash command is invoked, so no model turn runs and
// the cell spends zero tokens (the same profile the bug 0050/0136/0126 cells
// above claim). ADDITIVE ONLY: no existing cell in this file (1–47) is
// weakened, reworded, reordered or deleted.
// ===========================================================================

/**
 * The bug doc's own §Reproduction row R1 / the dedicated witness's cell R1,
 * verbatim (tests/fn-arg-member-read-proof.test.ts `A_R1`): a member read of a
 * field declared `string` fed to a parameter declared `integer`, both
 * statically resolvable. The trailing `1` supplies the theta's final value —
 * no `@`-query is needed for a prompt-mode theta to register (mirrors the bug
 * 0050 cell's own `illegalFnArgTheta`).
 */
function illegalMemberArgTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "schema P { s: string }",
    "fn g(n: integer): integer { n }",
    "fn f(p: P): integer { g(p.s) }",
    "1",
    "",
  ].join("\n");
}

/**
 * The same-shape SIBLING with a COMPATIBLE member-read argument — the
 * dedicated witness's BOUND S1, verbatim (`E_S1`): `g`'s parameter is declared
 * `string`, matching `p.s`'s own declared type. Must register both before and
 * after the fix, isolating the illegal caller's refusal to the declared-type
 * mismatch rather than to "a member-read argument never registers in this
 * harness".
 */
function legalMemberArgTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "schema P { s: string }",
    "fn g(n: string): string { n }",
    "fn f(p: P): string { g(p.s) }",
    "1",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0190: the fn-argument sink judges a provable member-read argument, live (Convention: live-host acceptance)", () => {
  it("does not register a caller whose fn call passes a member read whose declared field type mismatches the parameter, while its compatible-argument sibling registers, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, the
      // illegal caller's absence could be (wrongly) attributed to a broken
      // workspace instead of the gate under test.
      { source: "project", stem: "b190livectl", text: promptTheta("THETA-LIVE-OK") },
      // The same-shape sibling: identical schema, identical annotated-parameter
      // `fn` and call shape, but a COMPATIBLE member-read argument — must
      // still register, isolating the refusal to the declared-type mismatch
      // rather than to "a member-read argument never registers in this
      // harness".
      { source: "project", stem: "b190livegood", text: legalMemberArgTheta() },
      // The load-bearing illegal caller: the bug doc's own §Reproduction row
      // R1, a member read whose declared field type (`string`) mismatches the
      // declared parameter type (`integer`).
      { source: "project", stem: "b190livebroken", text: illegalMemberArgTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b190livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the gate under test, would explain the illegal caller's absence too. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b190livegood"),
        "the same-shape sibling with a compatible member-read argument did " +
          "not register — a member-read argument cannot register in this " +
          "harness at all, independent of this bug. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // THE FIXED OBSERVABLE: through the REAL production composition root
      // (not the offline `parseThetaDocument` harness the dedicated witness
      // uses), a same-file plain `fn` call whose MEMBER-READ argument is
      // provably incompatible with the declared parameter type does NOT
      // register — `checkFnCallArgs` (type-layer-checks.ts) now reaches
      // `provableArgType`'s opened `member` arm, fires
      // `theta/parse/fn-arg-type-mismatch`, and `hasLoadParseError` un-registers
      // this caller at the SAME site the bug 0050 cell above exercises for the
      // identifier-argument twin of this row.
      expect(
        handle.command("b190livebroken"),
        "the caller whose fn call passes a provably mistyped MEMBER-READ " +
          "argument registered anyway through the live discovery/session_start " +
          "path — theta/parse/fn-arg-type-mismatch did not fire on the " +
          "declared field type. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b190livebroken");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager` rather
      // than off racy events: the diagnostic fires at LOAD time, before any
      // drive, so the full entry list is the delta (mirrors the bug 0110/
      // 0084/0089/0095/0102/0125/0050 cells above).
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = fnArgTypeMismatchFragment("g", 0, "n", "integer", "string");
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the fn-arg-type-mismatch rejection " +
          "for the illegal member-read caller. Notes: " + JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0192 — `checkTypeLayer` (src/parser/type-layer-checks.ts) threaded the
// frontmatter `params:` fields into `collectLocalBinderNames` as NAMES only (a
// `Set<string>`, bug 0050's shadowing channel) and started the top-level walk
// with `new Map()`, so no `params:` field carried a declared `CompatType` into
// `bindings`. Twelve registered `E`-severity type-layer rows were therefore
// unreachable on every read of a `params:`-declared binding — where the
// byte-identical `fn`-parameter form reports all twelve — and a thirteenth,
// `theta/parse/non-array-iterand`, fired FALSELY at `E` on `for y in xs` over
// `params: xs: array<string>`, a program control-flow.md:13 admits
// (docs/bugs/0192-params-receiver-type-not-threaded-into-type-layer.md). The
// fix widens that third parameter to carry each field's declared type source
// beside its wire name and seeds the root `bindings` map through
// `annotationToCompatType` — the same converter `walkFn` uses for a `fn`
// parameter — so the `params:` position and the `fn`-parameter position decide
// identically by construction.
//
// The 32-cell offline witness
// (tests/params-declared-type-in-type-layer.test.ts) proves the mechanism at
// the `parseThetaDocument` boundary, and bug 0136's row x20 is re-pinned from a
// deferral bound to a reporting row under bug 0192 §Fix (f). This cell proves
// the REGISTRATION consequence end to end through the real production
// composition root (session_start → resources_discover →
// composeExtensionInstance → checkTypeLayer) — which the offline tier cannot
// see, because `hasLoadParseError` (src/extension/production-composition.ts) is
// what turns an `E`-severity `theta/parse/*` into a denied registration.
//
// BOTH DIRECTIONS IN ONE CELL, mirrored from the bug 0136 cell above (the
// `b136livefield` / `b136liverefuse` pair, an admission and a denial sharing
// one precondition control) and the bug 0126 cell that follows it:
//   - `b192livearray` — the REMOVAL direction, the bug doc's own §Reproduction
//     row b1 / the offline witness's cell b1: `params: xs: array<string>` with
//     a body `for y in xs { y }`. Pre-fix the iterand typed as the nominal
//     `named "xs"` — the BINDING'S OWN IDENTIFIER, which the message then
//     rendered into its `<type>` slot (`got xs`, outside
//     placeholder-rendering-a.md:11–13's category-1 rule) — so
//     `checkForIterand` (src/parser/control-flow.ts) refused a spec-legal
//     iterand at `E` and this caller did not register at all. Post-fix `xs`
//     carries its declared `array<string>`, the iterand check admits it, and
//     the caller REGISTERS. Asserted by the same absence-of-regression-fragment
//     channel the bug 0089/0136 cells use, reusing this file's existing
//     `nonArrayIterandFragment` reader rather than adding one.
//   - `b192liverefuse` — the ADDITION direction, the bug doc's §Reproduction
//     row a6 / the offline witness's cell a6: `params: s: string` with a body
//     `let v = s.frobnicate()`. Pre-fix `s` typed as the unresolvable
//     `named "s"`, `checkMethodCall`'s A2 gate deferred, and this caller
//     REGISTERED on a declared type the parser never checked. Post-fix `s`
//     carries its declared `string`, `theta/parse/unknown-method` fires at
//     PARSE (`E`), and `hasLoadParseError` denies registration. Reuses this
//     file's existing `unknownMethodFragment` reader (bug 0125's addition) —
//     the same registered code and message shape the bug 0136/0126 cells above
//     assert.
//
// WHY `b192livearray` DECLARES `bind_model:` AND `b192liverefuse` DOES NOT.
// `classifyBinderBypass` (src/binder/binder-envelope.ts) admits the
// single-string bypass for exactly one field declared `string` with no default
// and neither optional nor nullable, so `b192liverefuse` is bypass-eligible and
// needs no binder-model chain. `xs: array<string>` is not that shape, so
// `b192livearray` classifies `binder` and needs a resolvable chain at LOAD or
// it draws `theta/load/binder-model-unresolved` (`E`) and fails to register for
// a reason that has nothing to do with this bug — which would leave the removal
// direction unwitnessed. It therefore declares the same
// `bind_model: anthropic/claude-haiku-4-5` the bug 0181 and bug 0185 cells
// above already prove resolves live; resolution is a local metadata check
// against the model registry, so no token is spent on it.
//
// Registration-only: no slash command is invoked, so no model turn runs and the
// cell spends zero tokens (the same profile the bug 0070/0071/0077/0079(a)/
// 0110/0084/0089/…/0136/0126/0185/0190 cells above claim). No subagent child
// process is spawned (both fixtures are prompt mode, with no `invoke(...)` and
// no `subagent fn`), so the #subagent-child-pins convention this file's harness
// otherwise honours does not apply to this cell. ADDITIVE ONLY: no existing
// cell in this file (1–48) is weakened, reworded, reordered or deleted; this is
// cell 49, appended after the bug 0190 cell.
// ===========================================================================

/**
 * The bug doc's own §Reproduction row b1, verbatim (the offline witness's cell
 * b1, tests/params-declared-type-in-type-layer.test.ts), replayed here through
 * the real discovery→registration path instead of the offline harness: a
 * `params:` field declared `array<string>` and a plain `for` loop over it.
 * `focus_areas: array<string>` is the spec's own opening `params:` example
 * (docs/spec_topics/frontmatter/frontmatter-fields-a.md:23) and iterating one
 * is the ordinary use, but no shipped fixture declares an `array<…>` param, so
 * nothing in the committed corpus witnessed the refusal. The trailing `1`
 * supplies the theta's final value — no `@`-query is needed for a prompt-mode
 * theta to register, matching the bug 0089 cell's own `aliasIterandTheta`
 * above. `bind_model:` is load-bearing: this field shape is not bypass-eligible
 * (see the banner above). Never driven; registration is its whole observable.
 */
function paramsArrayIterandTheta(): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    "  xs: array<string>",
    "---",
    "for y in xs {",
    "  y",
    "}",
    "1",
    "",
  ].join("\n");
}

/**
 * The bug doc's own §Reproduction row a6, verbatim (the offline witness's cell
 * a6): a `params:` field declared `string` and a method call the theta 1.0
 * stdlib does not expose on that declared type. One field, `string`, no
 * default — `classifyBinderBypass`'s single-string-bypass shape, so it needs no
 * `bind_model:` chain and its registration verdict is about this bug alone. The
 * trailing `v` supplies the theta's final value. Never driven: post-fix it does
 * not register, and pre-fix its registration is the defect.
 */
function paramsUnknownMethodTheta(): string {
  return [
    "---",
    "mode: prompt",
    "params:",
    "  s: string",
    "---",
    "let v = s.frobnicate()",
    "v",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0192: a params:-declared binding carries its declared type into the type layer, live (Convention: live-host acceptance)", () => {
  it("registers a caller whose `for` loop iterates a params: field declared array<string>, and does not register a sibling whose method call misuses a params: field's declared string type, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, either
      // fixture's outcome could be (wrongly) attributed to a broken workspace
      // instead of the gates under test.
      { source: "project", stem: "b192livectl", text: promptTheta("THETA-LIVE-OK") },
      // The REMOVAL direction: registration-restored.
      { source: "project", stem: "b192livearray", text: paramsArrayIterandTheta() },
      // The ADDITION direction, sharing the precondition control above.
      { source: "project", stem: "b192liverefuse", text: paramsUnknownMethodTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b192livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the gates under test, would explain either fixture's outcome too. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // THE REMOVAL DIRECTION: through the REAL production composition root
      // (not the offline `parseThetaDocument` harness the 32-cell witness
      // uses), a `for` loop over a `params:` field declared `array<string>`
      // registers — the field's declared type reaches the type layer's root
      // bindings map, `checkForIterand` admits the iterand, and
      // `hasLoadParseError` has nothing to act on.
      expect(
        handle.command("b192livearray"),
        "the caller whose `for` loop iterates a params: field declared " +
          "array<string> failed to register — theta/parse/non-array-iterand " +
          "fired on a program control-flow.md:13 admits, at E severity, " +
          "denying registration. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toContain("b192livearray");

      // THE ADDITION DIRECTION: the sibling whose method call misuses a
      // params: field's declared `string` must NOT register — the opposite
      // direction, proven in the same cell at no extra token cost.
      expect(
        handle.command("b192liverefuse"),
        "the caller whose method call misuses a params: field declared " +
          "string registered anyway through the live discovery/session_start " +
          "path — theta/parse/unknown-method did not fire on the declared " +
          "params: type. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b192liverefuse");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager` rather
      // than off racy events: both verdicts land at LOAD time, before any
      // drive, so the full entry list is the delta (mirrors the bug 0110/0084/
      // 0089/…/0136/0126/0185/0190 cells above).
      const notes = systemNoteContents(handle.sessionManager.getEntries());

      // Removal direction: absence of the pre-fix regression fragment is the
      // success signal (mirrors the bug 0089/0136 cells' own convention
      // exactly). The pre-fix render carries the BINDING'S identifier in the
      // `<type>` slot, so the substituted type here is `xs`.
      const regressionFragment = nonArrayIterandFragment("xs");
      expect(
        notes.some((note) => note.includes(regressionFragment)),
        "a theta-system-note entry named the non-array-iterand rejection for " +
          "the params-array caller — the declared array<string> did not reach " +
          "the iterand check. Notes: " + JSON.stringify(notes),
      ).toBe(false);

      // Addition direction: presence of the new rejection fragment is the
      // success signal (mirrors the bug 0136/0126 cells' own convention
      // exactly, reusing bug 0125's `unknownMethodFragment`). The type named is
      // the field's DECLARED type, which is the whole point of the fix.
      const expectedFragment = unknownMethodFragment("frobnicate", "string");
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the unknown-method rejection for " +
          "the params-method-misuse caller. Notes: " + JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0194 — `TypeLayerWalk.unprovableBindings` keys its withhold by
// JavaScript OBJECT IDENTITY, and the two loop arms mark
// `unfoldAlias(iterand).element` — an object BORROWED from the `TypeEnv` (one
// `CompatType` per alias declaration per parse, handed back by reference by
// `unfoldAlias`). So a withhold recorded for ONE unprovable loop lands on the
// object every LATER reader of the same alias gets back, and one unprovable
// loop suppresses a TRUE `theta/parse/fn-arg-type-mismatch` at every later
// PROVABLE loop in the whole document — order-dependent, cross-`fn`, and
// silent on every channel
// (docs/bugs/0194-unprovable-marking-by-object-identity-shared-alias-element.md).
//
// The 30-cell dedicated witness
// (tests/loop-element-withhold-binding-scoped.test.ts) proves the mechanism
// offline at the `parseThetaDocument` boundary across all three shared-object
// families (the alias element, the declared-field object, the
// `params:`-seeded object) and both loop arms; this cell proves the one
// consequence that offline harness cannot observe — the suppressed
// `E`-severity refusal lets the theta REGISTER through the real production
// composition root (session_start → resources_discover →
// composeExtensionInstance → checkTypeLayer), so the mistyped call is bound
// unchecked at runtime with no diagnostic on any channel. The registry row
// itself states that no runtime AJV net covers this position
// (code-registry-parse.md, `theta/parse/fn-arg-type-mismatch`).
//
// The load-bearing theta mirrors the dedicated witness's cell a1: an erased
// receiver (`let m = flag ? A { … } : B { … }` — not a proven `#commonType`
// reduction, so `m` is unprovable while `m.xs` still unfolds through the alias
// to an `array`), a first `for` over `m.xs` that judges nothing, and a second
// `for` over the provable alias-typed parameter `ys: L` whose body hands `g`
// an `integer` at a `string` parameter. Deleting only the first loop leaves the
// second loop's verdict intact, which is exactly what the SIBLING theta below
// plants.
//
// RED-PROVEN PRE-FIX at 4ae4ec3f / 0.112.0: with the fix reverted the
// load-bearing theta REGISTERED — the suppressed refusal is the defect, and
// that measurement is what makes this cell's `toBeUndefined` load-bearing
// rather than vacuous. It is green with the fix, and green in every committed
// tree that carries it. The sibling and both controls were green at 4ae4ec3f
// too and must stay green: they are what makes a red here attributable to the
// suppression rather than to a broken workspace, a dead gate, or a fixture that
// cannot register at all.
//
// Registration-only: no slash command is invoked, so no model turn runs and
// the cell spends zero tokens (the same profile the bug 0050/0136/0126/0190/
// 0192 cells above claim). ADDITIVE ONLY: no existing cell in this file (1–49)
// is weakened, reworded, reordered or deleted.
// ===========================================================================

/** Lines 4–6 of every bug-0194 fixture below: the alias and the two ternary arms. */
const B194_PREAMBLE = [
  "---",
  "mode: prompt",
  "---",
  "schema L = array<integer>",
  "schema A { xs: L }",
  "schema B { xs: array<string> }",
];

/**
 * The load-bearing theta — the dedicated witness's cell a1. Its second loop's
 * argument satisfies `theta/parse/fn-arg-type-mismatch`'s *Trigger* in every
 * particular (`ys` is an annotated parameter of an alias declared
 * `array<integer>`, TYPE-11 makes that alias its right-hand side,
 * control-flow.md:13 gives `b` the element type, and `g` declares a `string`
 * parameter), and the withhold recorded for the FIRST loop's `a` suppresses
 * it. Measured offline: `[]`, so `hasLoadParseError` has nothing to act on and
 * the theta registers. The trailing `1` supplies the theta's final value — no
 * `@`-query is needed for a prompt-mode theta to register (mirrors the bug
 * 0050 / 0190 cells' own fixtures).
 */
function suppressedFnArgMismatchTheta(): string {
  return [
    ...B194_PREAMBLE,
    "fn g(s: string): number { 1 }",
    "fn f(flag: boolean, ys: L): number {",
    '  let m = flag ? A { xs: [1] } : B { xs: ["a"] }',
    "  for a in m.xs {",
    "    let z = a",
    "  }",
    "  for b in ys {",
    "    g(b)",
    "  }",
    "  1",
    "}",
    "1",
    "",
  ].join("\n");
}

/**
 * The SIBLING: byte-identical to the load-bearing theta with the first loop's
 * three lines DELETED, and nothing else changed — the erased receiver is still
 * declared and still unprovable. It must NOT register, before or after the
 * fix. This is what proves the suppressed diagnostic is a real refusal on a
 * live gate in a live workspace: the same second loop, the same alias, the
 * same argument, judged.
 */
function judgedFnArgMismatchTheta(): string {
  return [
    ...B194_PREAMBLE,
    "fn g(s: string): number { 1 }",
    "fn f(flag: boolean, ys: L): number {",
    '  let m = flag ? A { xs: [1] } : B { xs: ["a"] }',
    "  for b in ys {",
    "    g(b)",
    "  }",
    "  1",
    "}",
    "1",
    "",
  ].join("\n");
}

/**
 * The ordinary always-registers control: the WHOLE poisoning shape — erased
 * receiver, unprovable first loop, provable second loop — with a COMPATIBLE
 * second-loop argument (`gi` declares `integer`, the alias's element type).
 * Must register both before and after the fix, isolating the load-bearing
 * theta's post-fix refusal to the type mismatch rather than to "two loops over
 * one alias never register in this harness".
 */
function compatibleLoopArgTheta(): string {
  return [
    ...B194_PREAMBLE,
    "fn gi(n: integer): number { 1 }",
    "fn f(flag: boolean, ys: L): number {",
    '  let m = flag ? A { xs: [1] } : B { xs: ["a"] }',
    "  for a in m.xs {",
    "    let z = a",
    "  }",
    "  for b in ys {",
    "    gi(b)",
    "  }",
    "  1",
    "}",
    "1",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0194: a withhold recorded for one loop variable does not suppress a later provable loop's fn-arg refusal, live (Convention: live-host acceptance)", () => {
  it("does not register a caller whose first unprovable loop precedes a second loop's provably mistyped argument, while the same second loop alone is refused and the compatible-argument shape registers, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, the
      // load-bearing theta's post-fix absence could be (wrongly) attributed to
      // a broken workspace instead of the gate under test.
      { source: "project", stem: "b194livectl", text: promptTheta("THETA-LIVE-OK") },
      // The always-registers control: the same two-loops-over-one-alias shape
      // with a compatible second-loop argument.
      { source: "project", stem: "b194livegood", text: compatibleLoopArgTheta() },
      // The SIBLING: the load-bearing theta with the first loop deleted. Must
      // NOT register, before or after — the live proof that the suppressed
      // diagnostic is a real refusal reachable in this workspace.
      { source: "project", stem: "b194livesib", text: judgedFnArgMismatchTheta() },
      // The load-bearing theta: the same second loop, preceded by one
      // unprovable loop over the SAME alias's element.
      { source: "project", stem: "b194livebroken", text: suppressedFnArgMismatchTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b194livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the gate under test, would explain the load-bearing theta's " +
          "absence too. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b194livegood"),
        "the same-shape control with a COMPATIBLE second-loop argument did " +
          "not register — two loops over one alias cannot register in this " +
          "harness at all, independent of this bug. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The sibling: green at 4ae4ec3f and green with the fix. Without it, the
      // load-bearing theta's post-fix non-registration could be attributed to
      // a gate that refuses this fixture family for some other reason, and its
      // PRE-fix registration could be attributed to a dead gate.
      expect(
        handle.command("b194livesib"),
        "the sibling whose second loop's argument is provably mistyped — the " +
          "load-bearing theta with only the first loop deleted — registered " +
          "anyway, so theta/parse/fn-arg-type-mismatch is not reachable at " +
          "this input class in this workspace and the load-bearing theta's " +
          "own verdict cannot be attributed. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();

      // THE DEFECT: through the REAL production composition root (not the
      // offline `parseThetaDocument` harness the dedicated witness uses), the
      // theta whose FIRST loop is unprovable over the same alias element
      // registers — `provableArgType`'s `ident` arm answers `undefined` for `b`
      // because `unprovableBindings.has` hits the object the first loop marked,
      // `checkFnCallArgs` skips the row, `checkFnArgCompat` is never called,
      // and `hasLoadParseError` has nothing to act on. Measured registering at
      // 4ae4ec3f / 0.112.0 with the fix reverted — the registered `E`-severity
      // refusal the defect withholds, restored here.
      expect(
        handle.command("b194livebroken"),
        "the caller whose second loop passes a provably mistyped argument " +
          "registered anyway through the live discovery/session_start path — " +
          "the withhold recorded for the FIRST loop's variable suppressed the " +
          "second loop's true theta/parse/fn-arg-type-mismatch, while the " +
          "b194livesib sibling (the same theta with only the first loop " +
          "deleted) was refused. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b194livebroken");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager` rather
      // than off racy events: both refusals land at LOAD time, before any
      // drive, so the full entry list is the delta (mirrors the bug 0110/0084/
      // 0089/…/0136/0126/0185/0190/0192 cells above). Reuses this file's
      // existing `fnArgTypeMismatchFragment` reader (bug 0050's addition)
      // rather than a second one — both refusals push the SAME registered code
      // with the SAME unplaceholdered Message, so they are told apart by which
      // theta's own file path `renderDiagnosticLine`
      // (src/diagnostics/diagnostic.ts) prefixes onto the rendered line, the
      // discrimination bug 0149's cell above already uses.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = fnArgTypeMismatchFragment("g", 0, "s", "string", "integer");
      expect(
        notes.some(
          (note) => note.includes(expectedFragment) && note.includes("b194livesib"),
        ),
        "no theta-system-note entry named the fn-arg-type-mismatch rejection " +
          "for the SIBLING theta, so the code is not reachable at this input " +
          "class in this workspace. Notes: " + JSON.stringify(notes),
      ).toBe(true);
      expect(
        notes.some(
          (note) => note.includes(expectedFragment) && note.includes("b194livebroken"),
        ),
        "no theta-system-note entry named the fn-arg-type-mismatch rejection " +
          "for the LOAD-BEARING theta — the suppression is silent on every " +
          "channel, which is the bug: the author sees a clean load. Notes: " +
          JSON.stringify(notes),
      ).toBe(true);
      expect(
        notes.some((note) => note.includes("b194livegood")),
        "a theta-system-note entry named the always-registers control, whose " +
          "second-loop argument is COMPATIBLE — the fix must judge this slot, " +
          "not refuse the shape. Notes: " + JSON.stringify(notes),
      ).toBe(false);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0197 — a `params:` default whose member-access HEAD resolves and names no
// enum (`sev: 'Sev = Box.sev'` against a declared `schema Box`) loaded with ZERO
// diagnostics, registered, and then bound WITHOUT the field:
// `walkParamsDefaultNames`'s `member` arm (src/parser/theta-document.ts) refused
// only an undeclared variant of a declared `enum` and a head that resolves to
// nothing, and returned silently for a head that RESOLVES to a non-enum — while
// `grammar.md:26` makes "head is an enum name in scope" a side condition OF the
// `NamedValueLit` production, so the RHS derives no arm of `Literal` and is an
// identifier reference that is not an `Enum.Variant` access: one of the forms
// `theta/parse/default-not-literal`'s registered *Trigger* already enumerates
// (code-registry-parse.md:48). At invocation the recovery's evaluation panicked,
// the panic was absorbed, the field never reached the merge, and — because a
// defaulted field is never in the lowered schema's `required` set (params.ts) —
// the post-default-merge AJV check admitted the absence, after which the success
// echo tagged the field `(default)` over a `null`
// (docs/bugs/0197-params-default-non-enum-head-silently-unfilled.md).
//
// The 28-cell (was 14) witness
// (tests/params-default-unresolvable-enum-variant.test.ts, groups C / L / W / G /
// E) proves the mechanism offline at the `parseThetaDocument` boundary across all
// three head-declaration kinds and all three admitted depths, plus the byte-exact
// span and the echo tag; this cell proves the one consequence that offline
// harness cannot observe — that the REAL production composition root
// (session_start → resources_discover → composeExtensionInstance) drops the
// fixture, so no slash command exists for it and no binder round trip is ever
// spent. It is the same obligation bug 0185's cell 47 above discharges for the
// two spellings whose names do not resolve, at the third arm beside them.
//
// Registration-only: no slash command is invoked, so no model turn runs and the
// cell spends zero tokens, the same profile as the bug 0059/0126/0136/0185/0190/
// 0192/0194 cells above. No subagent child process is spawned (every fixture is
// prompt mode, with no `invoke(...)` and no `subagent fn`), so the
// #subagent-child-pins convention this file's harness otherwise honours does not
// apply to this cell. ADDITIVE ONLY: this is cell 51; cells 1–50 are unchanged,
// and cell 41 (bug 0181's resolvable-variant binder pass) and cell 47 (bug
// 0185's load refusal) — the two fences bug 0197 §Fix (c7) names — are
// byte-identical.
// ===========================================================================

/** Bug 0197's declarations: the enum the field is typed by, and the `schema` whose name is the offending head. */
const B197_BODY = [
  'enum Sev { High = "high", Low = "low" }',
  "schema Box { sev: Sev, who: string }",
];

/**
 * The same-shape SIBLING whose default RESOLVES: the SAME body (the enum AND the
 * `schema Box` whose name the load-bearing fixture's head spells), the same field
 * name and declared type, with the head naming the ENUM instead of the schema.
 * Must still register, so this cell cannot pass by failing to discover anything
 * shaped like its subject, and its registration isolates the refusal below to the
 * non-enum HEAD rather than to "a `params:` default naming `Enum.Variant` access
 * cannot register here" — the bug 0059 pair's own isolation, one level up.
 *
 * A single field whose declared type is the `NamedType` `Sev` (not `string`) is
 * not `classifyBinderBypass`'s single-string-bypass shape, so it needs a
 * resolvable `bind_model:` chain to register — the same reference cell 41 above
 * already proves resolves live. Never driven: registration is its whole
 * observable.
 */
function resolvableEnumHeadDefaultTheta(): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    "  sev: 'Sev = Sev.High'",
    "---",
    ...B197_BODY,
    "1",
    "",
  ].join("\n");
}

/**
 * The bug's own subject, verbatim (docs/bugs/0197-…md §Reproduction (a) row a1 /
 * the unit witness's cell `m11`): the sibling above with ONE identifier changed,
 * the head naming the declared `schema` instead of the `enum`. Post-fix the
 * gate's third arm refuses this at LOAD with `theta/parse/default-not-literal` at
 * the `params:` field's own range, so `hasLoadParseError`
 * (src/extension/production-composition.ts) denies registration strictly before
 * `resolveBinderModel` is reached and before any envelope exists.
 *
 * Declares the SAME `bind_model:` the sibling above does, for cell 47's stated
 * reason: an UNDECLARED `bind_model:` would introduce a second, unrelated
 * load-time refusal (`theta/load/binder-model-unresolved`, a non-bypass theta
 * with no resolvable binder-model chain) that would also deny registration — for
 * the wrong reason, confounding the attribution this cell's obligation requires.
 */
function nonEnumHeadDefaultTheta(): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    "  sev: 'Sev = Box.sev'",
    "---",
    ...B197_BODY,
    "1",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0197: a params: default whose member-access head resolves and names no enum does not register, live (Convention: live-host acceptance)", () => {
  it("does not register a theta whose params: default names a declared schema at the head of an Enum.Variant access, while a precondition control and the same-shape enum-head sibling both register, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, a broken
      // workspace could be (wrongly) blamed for the refusing fixture's absence
      // too.
      { source: "project", stem: "b197livectl", text: promptTheta("THETA-LIVE-OK") },
      // The same-shape sibling whose default's head is the ENUM — must still
      // register, so this cell cannot pass by failing to discover anything
      // shaped like its subject.
      {
        source: "project",
        stem: "b197liveresolves",
        text: resolvableEnumHeadDefaultTheta(),
      },
      // The load-bearing refusing theta: the bug's own subject.
      { source: "project", stem: "b197livebox", text: nonEnumHeadDefaultTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b197livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the head classification under test, would explain the refusing " +
          "fixture's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b197liveresolves"),
        "the same-shape sibling whose default's head names the ENUM did not " +
          "register — a params: default naming Enum.Variant access cannot " +
          "register in this harness at all, independent of this bug; that would " +
          "leave the refusing fixture's absence unwitnessed rather than caused " +
          "by the non-enum head. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // THE DEFECT: through the REAL production composition root (not the
      // offline parseThetaDocument harness the unit witness uses), the theta
      // whose params: default spells a declared `schema` at the head of an
      // Enum.Variant access registers — the gate's `member` arm falls through
      // silently for a head that resolves and names no enum, so
      // hasLoadParseError has nothing to act on, one binder round trip is spent
      // per invocation, and the field is bound absent with the echo claiming it
      // was filled.
      expect(
        handle.command("b197livebox"),
        "the theta whose params: default names a declared schema at the head " +
          "of an Enum.Variant access registered anyway through the live " +
          "discovery/session_start path — theta/parse/default-not-literal did " +
          "not fire from the params: position, while the b197liveresolves " +
          "sibling (the same theta with the enum at the head) registered as it " +
          "must. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b197livebox");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager` rather
      // than off racy events: the diagnostic fires at LOAD time, before any
      // drive, so the full entry list is the delta (mirrors the bug 0110/0084/
      // 0089/…/0166/0185/0194 cells above). Reuses this file's existing
      // `defaultNotLiteralFragment` reader (bug 0166's addition) rather than a
      // second one — DIAG-4 makes the registry's Message column normative, and
      // `<expr>` is the offending sub-expression's own source span
      // (placeholder-rendering-a.md:49).
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = defaultNotLiteralFragment("Box.sev");
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the default-not-literal rejection, " +
          "naming the offending sub-expression, for the refusing fixture. " +
          "Notes: " + JSON.stringify(notes),
      ).toBe(true);
      expect(
        notes.some(
          (note) => note.includes("theta/parse/") && note.includes("b197liveresolves"),
        ),
        "a theta/parse/ note named the enum-head sibling, whose default " +
          "RESOLVES — the gate must keep its enum-first head precedence and " +
          "draw no theta/parse/ refusal against it; the universal W-severity " +
          "theta/load/binder-model-strict-capability-unknown note naming its " +
          "path (code-registry-load.md:37) fires on every conforming run and " +
          "is expected, out of scope here. Notes: " + JSON.stringify(notes),
      ).toBe(false);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0184 (live) — a literal ARM of a MIXED union now enforces the params:
// boundary at a real subagent child's marshalled-params intake.
// `docs/bugs/0184-union-arm-literal-lowers-empty-schema.md`: `lowerTypeExpr`'s
// per-arm union recursion (`src/parser/params.ts`) and
// `lowerBraceGroupUnionArms`'s non-brace-arm call never consulted the
// literal sublanguage, so a MIXED union's own literal arm (one non-literal arm
// beside it) fell to `lowerTypeExpr`'s trailing catch-all and lowered the
// permissive `{}` — an empty schema AJV admits every JSON value against, so
// `sev: 'Sev | "high"'` enforced nothing beyond the `Sev` arm and a value
// NEITHER declared arm names (`"zzz"`) was silently ACCEPTED at all three
// `params:` consumers. The fix (§Fix) routes both recursions through
// `lowerLiteralSublanguage`, gated to a MIXED arm set by `isMixedLiteralArmSet`
// (so the sibling all-literal face bug 0164 owns is left alone), so the
// literal arm now lowers schema-subset.md:79's `{"const":"high"}` and the same
// out-of-declared-set value is refused.
//
// NO EXISTING LIVE CELL EXERCISES THIS SHAPE. The bug-0056 cell above drives a
// params: union too, but its declared type is `'"x" | "y"'` — ALL-literal, bug
// 0164/0056's own already-fixed face, which reaches `lowerLiteralSublanguage`
// at the TOP of the source and never enters the per-arm recursion this report
// fixes. The bug-0097 cell drives a params: union of two ANONYMOUS
// brace-rooted arms — no literal arm at all. The bug-0172-face-2 cell drives a
// union `Sev | null` at the `invoke<T>` RETURN boundary, not a literal arm and
// not the params: FIELD intake. This cell closes the gap the bug doc's own
// §Reproduction (d) names: a MIXED union — one named-enum arm, one literal arm
// — at the params: field position, proved through the real RFC-0006
// marshalled-params AJV intake a spawned subagent child runs, mirroring the
// bug-0056 cell's own GOOD/BAD invoke() shape exactly.
//
// `b184livechild`'s params: field is `p: 'Sev | "high"'` against a
// body-declared `enum Sev { High = "high", Low = "low" }` (the bug doc's own
// canonical declarations). Two `invoke(...)` calls from `b184livecheck`, each
// bound to a plain identifier (withholding both from the static
// invoke-arg-type-mismatch checker, this file's own established technique):
// `good = "high"` — admitted BOTH pre-fix (the empty arm admits everything)
// and post-fix (admitted by TWO arms: the `Sev` enum and the literal) — and
// `bad = "zzz"` — admitted pre-fix through the empty arm, REFUSED post-fix
// because neither the `Sev` enum nor the literal `"high"` names it. Each
// `Result` is `match`ed explicitly into a plain string (no `?`, no unhandled
// `Err`), and the one closing query renders both outcomes as theta CODE
// computed them — never asserted on `prompt()` merely resolving.
//
// Token cost: ONE dispatched query in the parent (the same profile as the
// bug-0056/bug-0097 cells above); the child spends none (`mode: subagent`
// tail is the bound field itself, no model turn in the child's own body).
//
// ADDITIVE ONLY: no existing cell in this file is weakened, reworded,
// reordered or deleted.
// ===========================================================================

/**
 * The `mode: subagent` callee: a MIXED-union params: field — one named-enum
 * arm, one literal arm, the bug doc's own canonical declaration
 * (`enum Sev { High = "high", Low = "low" }`) — whose tail is the bound field
 * itself, zero model turns, mirroring `literalParamsChildTheta` exactly but
 * for the MIXED rather than the all-literal union.
 */
function mixedUnionParamsChildTheta(): string {
  return [
    "---",
    "mode: subagent",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    "  p: 'Sev | \"high\"'",
    "---",
    'enum Sev { High = "high", Low = "low" }',
    "p",
    "",
  ].join("\n");
}

/**
 * The load-bearing parent: TWO `invoke(...)` calls against the SAME callee —
 * one argument the declared arms admit (`"high"`, admitted under BOTH the
 * pre-fix empty arm and the post-fix `Sev`/literal arms), one no declared arm
 * admits (`"zzz"`) — each bound to a plain identifier so
 * `collectProvableArgTypes`'s `"ident"` withholding keeps BOTH calls off the
 * static invoke-arg-type-mismatch checker's plate (see the bug-0056 cell's own
 * file-header note above), leaving the runtime AJV net at the child's params
 * intake as the only judge. Each `Result` is `match`ed EXPLICITLY into a plain
 * string — `"ACCEPTED"` for `Ok`, `"REJECTED " + <the wire cause>` for `Err`
 * — so nothing here is an unhandled `Err` (no `?`, no panic path), and the ONE
 * closing query renders both outcomes the way theta CODE computed them,
 * independent of anything the model says back.
 */
function mixedUnionParamsInvokeCheckTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    'let good = "high"',
    'let bad = "zzz"',
    'let okResult = invoke("./b184livechild.theta", good)',
    'let badResult = invoke("./b184livechild.theta", bad)',
    "let okOutcome = match okResult {",
    '  Ok(_) => "ACCEPTED",',
    '  Err(e) => "REJECTED " + e.cause,',
    "}",
    "let badOutcome = match badResult {",
    '  Ok(_) => "ACCEPTED",',
    '  Err(e) => "REJECTED " + e.cause,',
    "}",
    "@`An intake probe reports GOOD=${okOutcome} BAD=${badOutcome}. Restate that pair, then answer: what is 449 plus 334?`",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0184: a literal ARM of a mixed union enforces the params: boundary at the child's params intake, live (Convention: live-host acceptance)", () => {
  it("accepts an invoke(...) argument the declared mixed-union arms admit and refuses one neither arm admits, through the real RFC-0006 marshalled-params AJV intake", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, either
      // invoke() outcome below could be (wrongly) attributed to a broken
      // workspace instead of the mixed-union params lowering under test.
      { source: "project", stem: "b184livectl", text: promptTheta("THETA-LIVE-OK") },
      { source: "project", stem: "b184livechild", text: mixedUnionParamsChildTheta() },
      { source: "project", stem: "b184livecheck", text: mixedUnionParamsInvokeCheckTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b184livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the mixed-union params lowering under test, would explain either " +
          "invoke() outcome below too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b184livechild"),
        "the mixed-union-typed-params callee did not register — its " +
          "bind_model: chain failed to resolve (a workspace/registry problem, " +
          "not the lowering under test). Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b184livecheck"),
        "the invoking parent did not register — precondition unmet before any " +
          "live turn is driven. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const turn = await driveSlashCaptureTurn(handle, "/b184livecheck");
      const outbound = turn.userTexts.join("\n");

      // THE CONTROL — the declared-set argument is accepted at BOTH the
      // permissive and the enforcing lowering (an empty schema admits
      // everything; the enforcing `anyOf` admits it under the `Sev` enum arm
      // AND the literal arm), isolating the fixed observable below to the
      // OUT-of-declared-set argument specifically rather than to "invoke() to
      // this callee never succeeds in this harness".
      expect(
        outbound,
        "the in-declared-set invoke() argument was not accepted — Registered: " +
          JSON.stringify(handle.registeredNames()) + "; outbound: " +
          JSON.stringify(turn.userTexts),
      ).toContain("GOOD=ACCEPTED");

      // THE FIXED OBSERVABLE. Pre-fix the `params:` position lowers
      // `{"anyOf":[{"$ref":"#/$defs/Sev"},{}]}` — arm 1 is the EMPTY schema, so
      // the union admits every JSON value regardless of arm 0 — and the
      // out-of-declared-set argument is silently ACCEPTED at the child's
      // params intake too: `BAD=ACCEPTED`. Post-fix arm 1 is
      // schema-subset.md:79's `{"const":"high"}` (bug 0184 §Fix), so the SAME
      // argument is refused by BOTH arms with `InvokeInfraError { cause:
      // "validation" }` (`refuseParams`, src/runtime/subagent-params.ts) —
      // `BAD=REJECTED validation`, rendered by theta CODE from the real
      // `Result` the real RFC-0006 child intake returned, never asserted on
      // `prompt()` merely resolving.
      expect(
        outbound,
        "the out-of-declared-set invoke() argument was not refused — the " +
          "params: position's mixed-union literal arm did not enforce at the " +
          "child's params intake (bug 0184 did not fire, or fired with an " +
          "unexpected cause). Registered: " + JSON.stringify(handle.registeredNames()) +
          "; outbound: " + JSON.stringify(turn.userTexts),
      ).toContain("BAD=REJECTED validation");
      expect(
        outbound,
        "the out-of-declared-set invoke() argument was accepted — the pre-fix " +
          "permissive empty-arm lowering's own failure signature. outbound: " +
          JSON.stringify(turn.userTexts),
      ).not.toContain("BAD=ACCEPTED");

      // No fail-closed ending of the PARENT's own drive: both `invoke(...)`
      // results are `match`ed explicitly above (no `?`, no unhandled `Err`),
      // so this theta's own top-level outcome is Success either way — a
      // failure note here would mean the fixture itself is broken, not that
      // bug 0184 fired.
      const failureNotes = turn.systemNotes.filter((n) =>
        /^theta \/b184livecheck (returned Err|cancelled|aborted)/.test(n),
      );
      expect(
        failureNotes,
        "the invoking parent's own drive surfaced fail-closed system note(s) " +
          "— the fixture itself is broken: " + JSON.stringify(failureNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0187 (live) — the one subagent return boundary that runs no depth walk
// lets a `>cap` terminal `Ok` payload cross unrefused.
// `docs/bugs/0187-untyped-subagent-return-boundary-no-depth-ceiling.md` §Fix
// (b): a NEW child-side check (`mapTooDeepReturnValue`,
// `src/runtime/subagent-envelope.ts`) runs a bounded wire-form depth walk over
// the terminal `Ok` payload in `driveSubagentRootRegime`'s `terminal.ok` arm,
// BEFORE 0180's non-representability search and before `serializeOkEnvelope`.
// A payload whose JSON document exceeds ceiling #4's cap (`depth ≤ 5`) refuses
// with `Err(InvokeInfraError { cause: "return_validation", message: "JSON
// document depth exceeds 5" })` instead of crossing with `JSON.stringify`'s own
// substitution. No `theta/*` code is registered and no diagnostic is emitted —
// that is settled by the fix, not a gap this cell reports.
//
// NO EXISTING LIVE CELL DRIVES THIS PATH (checked across all of
// `tests/live/**` before adding this cell: `MAX_JSON_DEPTH`,
// `mapTooDeepReturnValue`, the canonical `"JSON document depth exceeds 5"`
// message and a six-bracket nested array literal appear nowhere in this file,
// in `tests/live/acceptance/**`, or in `tests/live/hardening/**`). The
// closest existing cell is the bug 0180 cell above: it drives a TYPED
// `invoke<number | null>` of a callee whose tail is `1 / 0` — a NON-FINITE
// value at a return boundary that already ran ceiling #4's depth walk before
// this fix and is unaffected by it. This cell drives the boundary bug 0187 is
// about instead: a `tools:`-declared `.theta`-callable call whose callee's
// tail names no return type (`inferCalleeReturnAnnotation` answers `null` for
// a bare tail expression), carrying a FINITE payload past the cap —
// §Reproduction (b) row C's class, isolated from the non-finite half
// entirely.
//
// SHAPE. The parent (`mode: prompt`) declares `tools:\n  -
// ./b187livekid.theta` and its SOLE statement is the bare `.theta`-callable
// call with `?`, `b187livekid()?` — the UNINFERRED boundary itself, no `let`
// binding needed. The kid MUST be `mode: subagent`: a `tools:` entry naming a
// `mode: prompt` callee is refused at load (`theta/load/prompt-mode-callable`,
// `docs/spec_topics/diagnostics/code-registry-load.md:28`), so no `mode:
// prompt` spelling of the kid is admissible here. The kid's sole statement is
// the pure tail expression `[[[[[[1]]]]]]` — FINITE, and depth 7 (two levels
// past the cap), the report's own headline depth (§Reproduction (b) rows A
// and C). Neither fixture issues an `@` query, so this cell spends ZERO MODEL
// TURNS: `AgentSession.prompt(text)` returns as soon as
// `_tryExecuteExtensionCommand` reports handled, without sending anything to
// the model unless the theta itself calls `pi.sendUserMessage`/`sendMessage`
// (neither fixture does) — the same reasoning the bug 0180 cell's own header
// states. Confirmed offline (parse + in-process drive sanity check) before
// this cell was added, then deleted per scratch policy.
//
// A REAL RFC-0006 CHILD PROCESS IS SPAWNED for the `mode: subagent` kid — this
// file's imported `./harness` sets all three `#subagent-child-pins` at module
// scope (`process.argv[1]`, `SUBAGENT_EXTENSION_PIN_ENV`,
// `SUBAGENT_PARENT_PID_ENV = String(process.ppid)`), exactly as every other
// subagent-spawning cell in this file (bug 0067, bug 0172, bug 0174, bug 0180
// above) relies on; nothing new is pinned here.
//
// THE OBSERVABLE. Pre-fix the child's envelope writer runs no depth check at
// this boundary (§Fix root cause), so `serializeOkEnvelope` writes
// `[[[[[[1]]]]]]` through unrefused (the payload is finite, so nothing is even
// substituted); the parent binds it `Ok`, the theta terminates `Ok`, and
// runtime-event-channel.md's success-side null-policy fixes that an `Ok(v)`
// termination emits NO `theta-system-note` — so the pre-fix per-turn
// `systemNotes` slice is EMPTY. Post-fix the child refuses BEFORE the
// envelope, `?` propagates the `Err` as the whole top-level theta's own
// termination (`invoke_infra` is a leaf `QueryError` kind rendered by
// `src/runtime/err-note-render.ts`'s SNK-i row regardless of call syntax), and
// SLSH-3 fires exactly ONE note at the slash-dispatch boundary: absence flips
// to presence, the strongest discriminator this note channel can give without
// a query.
//
// Token cost: ZERO. Neither fixture issues an `@`-query; the marshalled
// `--provider`/`--model` reference (PIC-62) only satisfies the launch argv
// shape, as the bug 0180 cell's own header states.
//
// ADDITIVE ONLY: this is cell 53; cells 1–52 are unchanged, and this cell adds
// no assertion to any existing cell in this file.
// ===========================================================================

/** The `mode: subagent` kid: a pure FINITE tail at depth 7 — §Reproduction (b) row C's own headline payload. */
function b187LiveKidTheta(): string {
  return ["---", "mode: subagent", "---", "[[[[[[1]]]]]]", ""].join("\n");
}

/**
 * The `mode: prompt` parent: `tools:` names the kid, and the SOLE statement is
 * the bare `.theta`-callable call with `?` — the UNINFERRED return boundary
 * itself, with no `let` binding and no `@` query anywhere.
 */
function b187LiveParentTheta(): string {
  return [
    "---",
    "mode: prompt",
    "tools:",
    "  - ./b187livekid.theta",
    "---",
    "b187livekid()?",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0187: a >cap FINITE terminal Ok payload at the uninferred tools: return boundary refuses child-side instead of crossing unchecked, live", () => {
  it("the tools:-routed call's Err propagates through `?` and the slash-dispatch boundary emits the SLSH-3 note naming return_validation, through a REAL spawned subagent child, spending zero model turns", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      { source: "project", stem: "b187livekid", text: b187LiveKidTheta() },
      { source: "project", stem: "b187liveparent", text: b187LiveParentTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the parent command must exist before a live turn is
      // driven, so a discovery/parse failure reds with zero tokens.
      expect(
        handle.command("b187liveparent"),
        "no bug-0187 parent command to invoke — the .theta failed " +
          "discovery/parse. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const turn = await driveSlashCaptureTurn(handle, "/b187liveparent");

      // Zero model turns: no `@` anywhere in either fixture, so nothing is
      // sent to the model and no user-visible turn is produced.
      expect(
        turn.userTexts,
        "no `@` query appears anywhere in either fixture; userTexts must stay " +
          "empty — observed: " + JSON.stringify(turn.userTexts),
      ).toEqual([]);

      // THE FIXED OBSERVABLE (AGENTS.md §"Assert on real observables" — the
      // `theta-system-note` channel read off the settled `SessionManager` via
      // the harness's per-turn `systemNotes`). Pre-fix this slice is EMPTY
      // (the depth-7 finite payload crosses the uninferred `tools:` boundary
      // unrefused, the theta terminates `Ok`, and the success-side
      // null-policy emits no note). Post-fix the child refuses BEFORE the
      // envelope, `?` propagates the `Err`, and SLSH-3 fires exactly one note
      // naming the `return_validation` cause.
      const failureNotes = turn.systemNotes.filter((n) =>
        n.startsWith("theta /b187liveparent returned Err:"),
      );
      expect(
        failureNotes,
        "bug 0187 §Fix (b): a >cap FINITE payload at the tools:-routed " +
          "uninferred return boundary must refuse rather than cross unchecked " +
          "— no SLSH-3 note fired. systemNotes: " + JSON.stringify(turn.systemNotes),
      ).toHaveLength(1);
      const note = failureNotes[0] ?? "";
      expect(
        note,
        "the SNK-i template (`err-note-render.ts`) names the cause: " + note,
      ).toContain("failed (return_validation)");
      expect(
        note,
        "and names the refused callee, the depth-7 kid: " + note,
      ).toContain("b187livekid.theta");
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0188 (live) — `-0` crosses the subagent return envelope as `+0` while the
// prompt→prompt attach leg binds it unchanged, so a caller's own arithmetic over
// the bound value flips sign depending on the callee's `mode:` frontmatter
// alone. `docs/bugs/0188-negative-zero-loses-sign-across-subagent-envelope.md`
// §Fix (a) — sign-preserving envelope encoding: `serializeOkEnvelope`
// (`src/runtime/subagent-envelope.ts`) now serialises through
// `stringifyPreservingNegativeZero`, which emits the `-0` form the JSON grammar
// already admits (`JSON.parse("-0")` IS `-0`) instead of substituting `0`
// (`JSON.stringify(-0)` is `"0"`, unconditionally — no `replacer` / `toJSON`
// hook can change that, measured). The parent, the driver, the envelope shape,
// the key set, `v`, arm discrimination and parse behaviour are all UNCHANGED —
// the change is confined to the writer.
//
// NEITHER OF THE TWO EXISTING LIVE CELLS ADJACENT TO THIS CLASS CAN OBSERVE IT.
// Bug 0180's live cell ("H8a-T — bug 0180", above) and bug 0187's live cell
// (cell 53, immediately above) both key off PRESENCE/ABSENCE of a
// `theta-system-note` naming a `return_validation` refusal — a BOOLEAN
// observable — and the SNK-i template they both render through
// (SNK-i, `src/runtime/err-note-render.ts`, "`${prefix} returned Err: invoke of
// ${e.callee_path} failed (${e.cause})`") carries no `.message` and therefore
// no VALUE: it cannot show a sign either way. Bug 0188 additionally never
// refuses anything — §Fix (a) is silent-and-correct, not a new refusal
// (§Fix (e)(6)) — so there is no note to key off at all, on EITHER leg, before
// or after the fix: an `Ok(v)` top-level termination emits NO
// `theta-system-note` (runtime-event-channel.md's success-side null-policy). A
// note-channel cell could not distinguish this fix from a no-op.
//
// CONFIRMED BY GREP ACROSS `tests/live/**` BEFORE WRITING THIS CELL (this file,
// `tests/live/acceptance/**`, `tests/live/hardening/**`): `Infinity`, a literal
// `-0`, the spelling `0 * -1` (or `0*-1`), and `b188` were searched for. The two
// `Infinity` hits that exist are both in THIS file, in the bug-0180 cell's own
// header prose (~:6973, ~:7062) — comments describing the SILENT-SUBSTITUTION
// mechanism 0180 fixed, not an assertion on a bound value's sign. `-0` (the
// literal) does not occur; the many hyphen-then-digit matches grep also surfaces
// (dates, `bug-0021`, etc.) are not it. `0 * -1` / `0*-1` occurs nowhere.
// `b188` occurs nowhere. No existing cell observes a bound value's sign.
//
// THE OBSERVABLE THIS CELL USES INSTEAD: `turn.userTexts` — "the exact text the
// theta CODE computed and sent, independent of the model's reply" (`./harness`'s
// own doc-comment on `DrivenTurn.userTexts`), the DETERMINISTIC outbound-render
// channel already used to observe computed values by many existing cells in
// this file (the bug-0066 / B166 / B165 sentinel cells, the bug-0080-descriptor
// `${v}` cell, and others). It is the one deterministic channel that can carry
// a VALUE rather than a boolean, which is why it is the required alternative
// here (AGENTS.md §"Assert on real observables").
//
// WHY `${1 / z}` DISCRIMINATES — TRACED THROUGH THE PRODUCTION CODE ITSELF, and
// separately CONFIRMED BY RUNNING IT (a scratch vitest probe, written, run,
// deleted — not part of this cell): `/` types unconditionally `number`
// (`src/parser/static-type-inference.ts:407` — "expressions.md §'Other
// arithmetic': `/` always produces `number`, whatever the operands"); query-
// string interpolation derives its `InterpolationType` from the RUNTIME value
// instead (`interpolationTypeOf`, `production-theta-producer.ts:6215` —
// `typeof value === "number"` → `{ kind: "number" }`, for every JS number,
// unconditionally, ahead of any static type); and the `"number"` arm of
// `stringifyInterpolatedValue` (`src/render/query-render.ts:406`) renders
// through `renderCanonicalNumber(value, "number")`
// (`src/render/canonical-number.ts`), whose `canonicalDecimal` restores the `-`
// sign for a negative body (`negative = value < 0`) and passes `Infinity` /
// `-Infinity` through `expandToFixedPoint` UNCHANGED (neither matches its
// exponential-form regex, so both render as those literal words). Measured:
// `renderCanonicalNumber(-Infinity, "number")` is `"-Infinity"`;
// `renderCanonicalNumber(Infinity, "number")` is `"Infinity"` — the same
// conclusion the bug document states (§Reproduction (a): "`1 / (0 * -1)`
// evaluates `-Infinity` where `1 / 0` evaluates `Infinity`").
//
// SHAPE. `b188livekid.theta` (`mode: subagent`) is bug 0188 §Reproduction (a)'s
// own headline spelling — the pure tail expression `0 * -1` — zero model turns
// of its own. `b188liveparent.theta` (`mode: prompt`) binds the callee's value
// through a typed `invoke<number>`, unwraps it via `match` (the `Err` arm is a
// control fallback only, never taken — the same construction the bug
// document's §Reproduction (d)/(e) and the committed unit witness's
// `HARM_CALLER_BODY` use), and interpolates the reciprocal into a `@`-query's
// outbound text behind the `b188-marker=` anchor. Theta's query grammar admits
// only a BACKTICK-delimited template after `@`
// (`docs/spec_topics/query/query-forms.md:8`, and every `@` query in this
// file) — there is no double-quoted `@ "…"` form — so the query below is
// written `` @`…` `` like every other cell in this file.
//
//   - POST-FIX the parent binds the callee's `-0` (route (a) preserves the
//     sign across the envelope), `1 / z` is `-Infinity`, and the sent text
//     contains `b188-marker=-Infinity`.
//   - PRE-FIX the parent binds `+0` (`serializeOkEnvelope` substitutes `0` for
//     the callee's `-0`), `1 / z` is `Infinity`, and the sent text contains
//     `b188-marker=Infinity` — which does NOT contain the post-fix substring,
//     so the assertion discriminates in both directions.
//
// A REAL RFC-0006 CHILD PROCESS IS SPAWNED for the `mode: subagent` kid — this
// file's imported `./harness` already sets all three `#subagent-child-pins` at
// module scope (`process.argv[1]`, `SUBAGENT_EXTENSION_PIN_ENV`,
// `SUBAGENT_PARENT_PID_ENV = String(process.ppid)`), exactly as every other
// subagent-spawning cell in this file (bug 0067, bug 0172, bug 0174, bug 0180,
// bug 0187 above) relies on; nothing new is pinned here.
//
// TOKEN COST: ONE real model turn — a ~12-token prompt ("Reply with the single
// word OK. b188-marker=-Infinity", or `…Infinity` pre-fix) and a one-word
// reply. This is NOT zero-token like the bug 0180 / bug 0187 cells above: the
// note channel cannot carry a value (this cell's own reason for existing), so
// the outbound query text is the only deterministic channel that can — and
// observing it requires the query to actually be issued. `AGENTS.md` is
// explicit that token cost is not a reason to skip this verification.
//
// ADDITIVE ONLY: this is cell 54; cells 1–53 are unchanged.
// ===========================================================================

/** The `mode: subagent` kid: bug 0188 §Reproduction (a)'s own headline spelling — a pure tail expression evaluating to `-0`, zero model turns of its own. */
function b188LiveKidTheta(): string {
  return ["---", "mode: subagent", "---", "0 * -1", ""].join("\n");
}

/**
 * The `mode: prompt` parent: binds the callee's value through a typed
 * `invoke<number>`, unwraps it via `match` (the `Err` arm is a control
 * fallback only, never taken), and interpolates the reciprocal into the
 * outbound query text behind the `b188-marker=` anchor — the one deterministic
 * channel (`turn.userTexts`) that can observe the callee's sign.
 */
function b188LiveParentTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    'let r = invoke<number>("./b188livekid.theta")',
    "let z = match r { Ok(v) => v, Err(e) => 1 }",
    "@`Reply with the single word OK. b188-marker=${1 / z}`",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0188 (b188): a typed invoke<number> binds the sign-preserving envelope's -0 across a REAL spawned subagent child, live", () => {
  it("the parent binds the callee's own -0 through the sign-preserving envelope, and the outbound query text names -Infinity rather than Infinity, through a REAL spawned subagent child, spending one real model turn", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      { source: "project", stem: "b188livekid", text: b188LiveKidTheta() },
      { source: "project", stem: "b188liveparent", text: b188LiveParentTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // LOUD PRECONDITION (AGENTS.md §"No silent skipping" — a discovery/parse
      // failure must red with zero tokens): the parent command must exist
      // before a live turn is driven.
      expect(
        handle.command("b188liveparent"),
        "no bug-0188 parent command to invoke — the .theta failed " +
          "discovery/parse. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const turn = await driveSlashCaptureTurn(handle, "/b188liveparent");

      // THE FIXED OBSERVABLE (AGENTS.md §"Assert on real observables" — NOT the
      // note channel, which cannot carry a value for this fix, and NOT
      // `assistantText`, which is stochastic). `turn.userTexts` is the
      // deterministic outbound-render channel: exactly one query is issued (the
      // parent's sole `@`-query statement), and its rendered text carries the
      // callee's bound sign through `1 / z`'s reciprocal.
      expect(
        turn.userTexts,
        "exactly one query is issued by the parent's sole `@`-query statement — " +
          "observed: " + JSON.stringify(turn.userTexts),
      ).toHaveLength(1 + turn.reAskCount);
      expect(
        turn.userTexts[0],
        "bug 0188 §Fix (a): the parent must bind the callee's own -0 (not the +0 " +
          "the pre-fix writer substituted), so 1 / z must render -Infinity — " +
          "observed outbound text: " + JSON.stringify(turn.userTexts),
      ).toContain("b188-marker=-Infinity");

      // The drive must SUCCEED (AGENTS.md §"Assert on real observables": a
      // fail-closed ending would otherwise be invisible to the assertion above
      // alone). Asserted explicitly rather than inferred from the marker's
      // presence.
      const failureNotes = turn.systemNotes.filter((n) =>
        n.startsWith("theta /b188liveparent returned Err:"),
      );
      expect(
        failureNotes,
        "the drive must succeed — a fail-closed ending would make the marker " +
          "assertion above meaningless. systemNotes: " + JSON.stringify(turn.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0201 (live) — neither of the subagent envelope writer's two bounded
// walks (`firstNonFiniteNumber`, `wireFormExceedsDepthCap`,
// `src/runtime/subagent-envelope.ts`) descended a `Result`, so a non-finite
// `number` contributed only from INSIDE a nested `Result` crossed the return
// boundary as a fabricated `null` with an EMPTY diagnostic drain — bug
// 0180's fabrication class, alive through the one carrier its walk declined
// to enter.
// `docs/bugs/0201-result-carried-payloads-skip-envelope-walks.md` §Fix (a):
// both walks now classify every node through one shared exported classifier,
// `classifyWireNode` (`src/runtime/subagent-envelope.ts:555`), which answers
// `record` for a `Result` — the brand is a non-enumerable symbol, so only
// the carrier's own enumerable `ok` / `value` / `error` keys are visited,
// exactly as `JSON.stringify` visits them. Neither walk carries a carrier
// arm of its own any longer.
//
// NO EXISTING LIVE CELL DRIVES THIS PATH (checked across all of
// `tests/live/**` before adding this cell: `classifyWireNode`, a `makeOk`-
// built `Result` nested inside an array literal, and the fixture body
// `Ok(1 / 0)` appear nowhere in this file, in `tests/live/acceptance/**`, or
// in `tests/live/hardening/**`). The two nearest existing cells are the bug
// 0180 cell above (the SAME non-finite value class, but at a callee whose
// tail is the bare `1 / 0` — OUTSIDE any `Result`) and the bug 0187 cell
// above (a `Result`-carried payload, but a FINITE `>cap` nest — the depth
// half of this report's class, not the non-finite half). This cell drives
// the one shape neither reaches: bug 0180's own value class, reached through
// the one carrier that bug's own witness and bug 0187's both left unentered
// — the report's own headline (§Reproduction row 1).
//
// SHAPE, MIRRORED FROM THE BUG 0187 CELL ABOVE. The parent (`mode: prompt`)
// declares `tools:\n  - ./b201livekid.theta` and its SOLE statement is the
// bare `.theta`-callable call with `?`, `b201livekid()?` — the UNINFERRED
// boundary itself (`inferCalleeReturnAnnotation` answers `null` for a bare
// tail expression), no `let` binding needed at the call site. The kid MUST
// be `mode: subagent`, for the same load-time reason the bug 0187 kid is (a
// `tools:` entry naming a `mode: prompt` callee refuses at load,
// `theta/load/prompt-mode-callable`). The kid's own body IS a `let` chain
// ending in a pure tail expression — `let r = Ok(1 / 0)` then `[r, 1]`, the
// bug doc's own §Reproduction row 1 verbatim and this report's unit
// witness's `WRITER-ROW1` cell's fixture
// (`tests/subagent-envelope-result-carriage.test.ts`) — so no query is
// issued anywhere and this cell spends ZERO MODEL TURNS, the same reasoning
// the bug 0180 and bug 0187 cells' own headers state.
//
// A REAL RFC-0006 CHILD PROCESS IS SPAWNED for the `mode: subagent` kid —
// this file's imported `./harness` sets all three `#subagent-child-pins` at
// module scope (`process.argv[1]`, `SUBAGENT_EXTENSION_PIN_ENV`,
// `SUBAGENT_PARENT_PID_ENV = String(process.ppid)`), exactly as every other
// subagent-spawning cell in this file relies on; nothing new is pinned here.
//
// THE OBSERVABLE. Pre-fix the kid's writer answers `undefined` for both
// sub-checks over its terminal `[Ok(1 / 0), 1]` — `firstNonFiniteNumber`
// stops at the carrier and never finds the `Infinity` inside it — so
// `serializeOkEnvelope` descends the carrier's own enumerable `ok` / `value`
// keys with plain `JSON.stringify` and writes `{"ok":true,"value":null}`
// where the callee produced `Infinity`. The kid's envelope is therefore an
// `ok` arm, the parent's `?` UNWRAPS it rather than propagating anything,
// and the theta terminates `Ok` — runtime-event-channel.md's success-side
// null-policy fixes that an `Ok(v)` termination emits NO `theta-system-note`,
// so the pre-fix per-turn `systemNotes` slice is EMPTY, exactly as it is
// pre-fix in the bug 0180 and bug 0187 cells above. Post-fix
// `firstNonFiniteNumber` descends the carrier as an ordinary record
// (`classifyWireNode`), finds the leaf at wire position `/0/value`, and the
// kid refuses BEFORE the envelope with bug 0180's own named
// non-representability refusal (`cause: "return_validation"`); the parent's
// `?` PROPAGATES that `Err` as the whole top-level theta's own termination,
// and SLSH-3 fires exactly ONE note: absence flips to presence, the
// strongest discriminator this note channel can give without a query — the
// same discriminator the bug 0180 and bug 0187 cells above use.
//
// Token cost: ZERO. Neither fixture issues an `@`-query; the marshalled
// `--provider`/`--model` reference (PIC-62) only satisfies the launch argv
// shape, as the bug 0180 and bug 0187 cells' own headers state.
//
// ADDITIVE ONLY: this is cell 55; cells 1–54 are unchanged, and this cell
// adds no assertion to any existing cell in this file.
// ===========================================================================

/** The `mode: subagent` kid: a `let` chain ending in a pure tail expression carrying a non-finite `number` inside a nested `Ok` — bug 0201 §Reproduction row 1 verbatim. */
function b201LiveKidTheta(): string {
  return ["---", "mode: subagent", "---", "let r = Ok(1 / 0)", "[r, 1]", ""].join("\n");
}

/**
 * The `mode: prompt` parent: `tools:` names the kid, and the SOLE statement is
 * the bare `.theta`-callable call with `?` — the UNINFERRED return boundary
 * itself, with no `let` binding and no `@` query anywhere.
 */
function b201LiveParentTheta(): string {
  return [
    "---",
    "mode: prompt",
    "tools:",
    "  - ./b201livekid.theta",
    "---",
    "b201livekid()?",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0201: a non-finite number reachable only through a nested Result crosses the uninferred tools: return boundary as a fabricated null instead of refusing by name, live", () => {
  it("the tools:-routed call's Err propagates through `?` and the slash-dispatch boundary emits the SLSH-3 note naming return_validation, through a REAL spawned subagent child, spending zero model turns", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      { source: "project", stem: "b201livekid", text: b201LiveKidTheta() },
      { source: "project", stem: "b201liveparent", text: b201LiveParentTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the parent command must exist before a live turn is
      // driven, so a discovery/parse failure reds with zero tokens.
      expect(
        handle.command("b201liveparent"),
        "no bug-0201 parent command to invoke — the .theta failed " +
          "discovery/parse. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const turn = await driveSlashCaptureTurn(handle, "/b201liveparent");

      // Zero model turns: no `@` anywhere in either fixture, so nothing is
      // sent to the model and no user-visible turn is produced.
      expect(
        turn.userTexts,
        "no `@` query appears anywhere in either fixture; userTexts must stay " +
          "empty — observed: " + JSON.stringify(turn.userTexts),
      ).toEqual([]);

      // THE FIXED OBSERVABLE (AGENTS.md §"Assert on real observables" — the
      // `theta-system-note` channel read off the settled `SessionManager` via
      // the harness's per-turn `systemNotes`). Pre-fix this slice is EMPTY
      // (the fabricated-null `ok` envelope crosses the uninferred `tools:`
      // boundary unrefused, the theta terminates `Ok`, and the success-side
      // null-policy emits no note). Post-fix the child refuses BEFORE the
      // envelope, `?` propagates the `Err`, and SLSH-3 fires exactly one note
      // naming the `return_validation` cause.
      const failureNotes = turn.systemNotes.filter((n) =>
        n.startsWith("theta /b201liveparent returned Err:"),
      );
      expect(
        failureNotes,
        "bug 0201 §Fix (a): a non-finite number reachable only through a " +
          "nested Result at the tools:-routed uninferred return boundary " +
          "must refuse by name rather than cross as a fabricated null — no " +
          "SLSH-3 note fired. systemNotes: " + JSON.stringify(turn.systemNotes),
      ).toHaveLength(1);
      const note = failureNotes[0] ?? "";
      expect(
        note,
        "the SNK-i template (`err-note-render.ts`) names the cause: " + note,
      ).toContain("failed (return_validation)");
      expect(
        note,
        "and names the refused callee, the Result-carrying kid: " + note,
      ).toContain("b201livekid.theta");
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0202 (live) — `#validateInvokeReturn` hands `enforceInvokeReturnDepth`
// the raw theta value, so `depthWalk` (`src/runtime/depth-walk.ts`) counts the
// boxed-`String` enum carrier's character indices as a nesting level
// (`Object.keys(new String("red"))` is `["0","1","2"]`) and a typed
// `invoke<array<array<array<array<Colour>>>>>` of a prompt-mode callee whose
// tail is `[[[[Colour.Red]]]]` — wire form `[[[["red"]]]]`, JSON-document
// depth 5, which ceiling #4's cap admits — binds
// `Err(InvokeInfraError { cause: "return_validation", message: "JSON document
// depth exceeds 5" })`, a message false of the value it names.
// `docs/bugs/0202-parent-depth-walk-counts-carrier-not-wire-depth.md` §Fix:
// the verdict becomes a function of the payload's WIRE FORM under
// `docs/spec_topics/schema-subset.md:24–30`'s counting algorithm, computed by a
// new bounded walk that consults the shared classifier bug 0201 exported,
// `classifyWireNode` (`src/runtime/subagent-envelope.ts:555`, which answers
// `scalar` for a boxed `String`). `depth-walk.ts` keeps serving the
// parsed-JSON sites unchanged.
//
// NO EXISTING LIVE CELL DRIVES THIS SHAPE (checked across all of
// `tests/live/**` before adding this cell). The bug 0174 cell above is the
// only other prompt→prompt ATTACH cell carrying a named enum, and its payload
// is a root-position variant — wire document depth 1 — where the depth gate is
// a no-op; `tests/live/hardening/session-invoke-attach.test.ts` drives the
// same attach topology with `invoke<number>`, and a plain `number` is never
// boxed. The bug 0187 cell above is the only live cell whose payload is nested
// past the cap (`[[[[[[1]]]]]]`), but it is carrier-free, `mode: subagent`,
// and lands at the UNINFERRED `tools:` boundary rather than at a typed
// `invoke<T>` annotation. The uncovered cell is the intersection: a carrier at
// wire document level 5, typed, on the attach cell.
//
// BOTH LEGS ARE PROMPT→PROMPT ATTACH, so NO child process is spawned and the
// `#subagent-child-pins` reasoning does not arise beyond what this file's
// imported `./harness` already does at module scope; nothing new is pinned
// here.
//
// THE OBSERVABLE, TWO-SIDED. Leg A is the report's own §Reproduction (b) row
// b1: the invoke Errs pre-fix, the parent's `?` propagates it as the whole
// top-level theta's termination, and SLSH-3 fires exactly one note
// (SNK-i, `err-note-render.ts` — "invoke of <path> failed (<cause>)"). Post-fix
// the invoke binds `Ok`, the theta terminates `Ok`, and
// runtime-event-channel.md's success-side null-policy emits NO note — so the
// assertion is ZERO fail-closed notes for leg A. An absence assertion is only
// as good as the proof that the channel was live, which is leg B: kid B's tail
// is `[[[[[Colour.Red]]]]]` under `invoke<array<array<array<array<array<Colour>
// >>>>>`, wire document depth 6, refused BEFORE and AFTER, so leg B's note is
// present in both directions and is asserted in this same cell.
//
// Token cost: ZERO. No `@` query appears in any of the four fixtures — every
// body is a pure tail expression — so `turn.userTexts` is empty for both
// drives and the marshalled `--provider`/`--model` reference (PIC-62) only
// satisfies the launch argv shape, as the bug 0180, 0187 and 0201 cells' own
// headers state.
//
// ADDITIVE ONLY: this is cell 56; cells 1–55 are unchanged, and this cell adds
// no assertion to any existing cell in this file.
// ===========================================================================

/** The `mode: prompt` kid of leg A: a pure tail whose wire document is `[[[["red"]]]]`, depth 5 — inside ceiling #4's cap. */
function b202LiveKidATheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    'enum Colour { Red = "red" }',
    "[[[[Colour.Red]]]]",
    "",
  ].join("\n");
}

/**
 * The `mode: prompt` parent of leg A: the SOLE statement is the typed
 * `invoke<T>` of the prompt-mode kid with `?`, so the boundary `Result` IS the
 * theta's own termination and no `@` query anywhere can spend a turn. The
 * annotation is the caller's, so the caller declares the `enum` it names.
 */
function b202LiveParentATheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    'enum Colour { Red = "red" }',
    'invoke<array<array<array<array<Colour>>>>>("./b202livekida.theta")?',
    "",
  ].join("\n");
}

/** The `mode: prompt` kid of leg B: one level deeper — wire document depth 6, past the cap. */
function b202LiveKidBTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    'enum Colour { Red = "red" }',
    "[[[[[Colour.Red]]]]]",
    "",
  ].join("\n");
}

/** The `mode: prompt` parent of leg B: the same form one level deeper, refused before and after. */
function b202LiveParentBTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    'enum Colour { Red = "red" }',
    'invoke<array<array<array<array<array<Colour>>>>>>("./b202livekidb.theta")?',
    "",
  ].join("\n");
}

describe("H8a-T — bug 0202: a typed invoke<T> of a prompt-mode callee whose wire document is depth 5 is refused with a message false of it, live", () => {
  it("an enum carrier at wire document level 5 crosses the prompt→prompt attach cell while its level-6 sibling stays refused, spending zero model turns", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      { source: "project", stem: "b202livekida", text: b202LiveKidATheta() },
      { source: "project", stem: "b202liveparenta", text: b202LiveParentATheta() },
      { source: "project", stem: "b202livekidb", text: b202LiveKidBTheta() },
      { source: "project", stem: "b202liveparentb", text: b202LiveParentBTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: both parent commands must exist before a turn is driven,
      // so a discovery/parse failure reds with zero tokens.
      for (const stem of ["b202liveparenta", "b202liveparentb"]) {
        expect(
          handle.command(stem),
          `no bug-0202 parent command /${stem} to invoke — the .theta failed ` +
            "discovery/parse. Registered: " + JSON.stringify(handle.registeredNames()),
        ).toBeDefined();
      }

      // LEG B FIRST: the channel-live control. Its note is present before AND
      // after the fix, so leg A's absence assertion below is an absence against
      // a channel this same cell has already seen fire.
      const legB = await driveSlashCaptureTurn(handle, "/b202liveparentb");
      expect(
        legB.userTexts,
        "no `@` query appears in either leg-B fixture; userTexts must stay empty — " +
          "observed: " + JSON.stringify(legB.userTexts),
      ).toEqual([]);
      const legBNotes = legB.systemNotes.filter((n) =>
        n.startsWith("theta /b202liveparentb returned Err:"),
      );
      expect(
        legBNotes,
        "ceilings-3-and-4.md:27 — a wire document deeper than the cap must still refuse at " +
          "the invoke<T> return row, before and after the metric change. systemNotes: " +
          JSON.stringify(legB.systemNotes),
      ).toHaveLength(1);
      const legBNote = legBNotes[0] ?? "";
      expect(
        legBNote,
        "the SNK-i template (`err-note-render.ts`) names the cause: " + legBNote,
      ).toContain("failed (return_validation)");
      expect(
        legBNote,
        "and names the refused callee, the level-6 kid: " + legBNote,
      ).toContain("b202livekidb.theta");

      // LEG A: THE FIXED OBSERVABLE (AGENTS.md §"Assert on real observables" —
      // the `theta-system-note` channel read off the settled `SessionManager`
      // via the harness's per-turn `systemNotes`). Pre-fix the invoke Errs, `?`
      // propagates, and SLSH-3 fires one note naming `return_validation` about
      // a document of depth 5. Post-fix the invoke binds Ok, the theta
      // terminates Ok, and the success-side null-policy emits nothing.
      const legA = await driveSlashCaptureTurn(handle, "/b202liveparenta");
      expect(
        legA.userTexts,
        "no `@` query appears in either leg-A fixture; userTexts must stay empty — " +
          "observed: " + JSON.stringify(legA.userTexts),
      ).toEqual([]);
      // The regex admits every fail-closed ending of a top-level drive — the
      // SLSH-3 err note, the cancelled note and the panic framings — so the
      // absence cannot be bought by the refusal changing shape.
      const legANotes = legA.systemNotes.filter((n) =>
        /^theta \/b202liveparenta (returned Err|cancelled|aborted)/.test(n),
      );
      expect(
        legANotes,
        "docs/bugs/0202 — `[[[[Colour.Red]]]]` serialises to `[[[[\"red\"]]]]`, JSON-document " +
          "depth 5, which schema-subset.md:30's `depth ≤ 5` admits; the typed invoke of a " +
          "prompt-mode callee returning it must bind Ok rather than refuse with a message " +
          "false of it. systemNotes: " + JSON.stringify(legA.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0199 — `walkStmt`'s unannotated `let` arm marks `unprovableBindings`
// (src/parser/type-layer-checks.ts:1006 — the identity-keyed withhold set) with
// the object `typeOf(stmt.init)` returned (`:1187`), and for a member-read
// initialiser that object is BORROWED: `collectSchemaFields` builds exactly one
// `CompatType` per declared field per parse (`:830`, `:832`) and `#memberType`'s
// declared branch hands it back by reference, alias-unfolded
// (src/parser/static-type-inference.ts:372). The withhold therefore lands on the
// FIELD rather than on the binding, so one `let zs = m.xs` off an ERASED ternary
// receiver silences the TRUE `theta/parse/fn-arg-type-mismatch` a later
// `let ws = q.xs` over a proven `q: P` owes at `hs(ws)`: that later read is
// itself a proof (bug 0190's `member` arm, `:2121–2123`), but
// `bindings.get("ws")` returns the marked field object, the set's only read
// answers `undefined` (`:2053`), and `checkFnCallArgs` skips the argument row
// (docs/bugs/0199-let-arm-marks-borrowed-object-suppression.md).
//
// The refusal is owed. type-system.md:27 lists a function-argument slot among
// the positions `⊑` governs, TYPE-11 (`:54`) makes `P`'s field `L` its
// right-hand side `array<integer>`, TYPE-9 (`:50`) routes the static failure to
// `theta/parse/fn-arg-type-mismatch`, and the registry row
// (code-registry-parse.md:120) is severity `E` and states that no runtime AJV
// safety net applies at this position. `type-system.md:48`'s *Unresolvable
// operands* deferral cannot licence the silence: it conditions on the OPERANDS,
// and neither operand moves when the earlier `let` is deleted.
//
// WHAT THIS CELL ADDS OVER AN OFFLINE ROW. A `parseThetaDocument` row observes
// the diagnostic array and stops there; it cannot observe the consequence the
// report's §Why it matters leads with — the suppressed `E` leaves
// `hasLoadParseError` (`src/extension/production-composition.ts`) with
// nothing to act on through the REAL production composition root (session_start
// → resources_discover → composeExtensionInstance → checkTypeLayer), so the
// slash command is created and the mistyped call is bound unchecked at runtime.
// REGISTRATION is the observable this cell asserts, and the only one.
//
// THE CONTROL, ASSERTED FIRST. `b199livegood` carries the SAME shape — the same
// three schema declarations, the same erased ternary receiver, the same
// unprovable `let zs = m.xs`, the same proven `let ws = q.xs` — and differs in
// one particular: its sink declares `array<integer>`, so `array<integer> ⊑
// array<integer>` holds and no diagnostic is owed in either direction. It must
// stay registered before and after, which is what makes the subject's refusal
// attributable to the type mismatch rather than to the shape, the schema
// declarations, or a planting/discovery failure. It is asserted BEFORE the
// subject so a broken workspace or a dead discovery walk reds on the control
// instead of being read as the subject's refusal.
//
// RED AT 0.119.0 / `ef8c0a43` for the reason the report states: the subject
// REGISTERS, because the withheld refusal IS the defect. That is an open
// documented correct-reason red per AGENTS.md §"Expect documented correct-reason
// reds" — `docs/bugs/0199-let-arm-marks-borrowed-object-suppression.md` is the
// report whose signature it matches — and it goes green when the withhold stops
// being keyed by the borrowed object. The in-tree bounds on the same channel are
// cell `d6` (tests/loop-element-withhold-binding-scoped.test.ts:1088) and its
// delete-control `d6ctl` (`:1123`), whose fixture preamble (`:625`) supplies the
// three declarations below.
//
// Registration-only: no slash command is invoked, so NO model turn runs and the
// cell spends zero tokens (the same profile the bug 0050/0126/0136/0185/0190/
// 0192/0194/0197 cells above claim). No subagent child process is spawned —
// both fixtures are prompt mode with no `invoke(...)` and no `subagent fn` — so
// the #subagent-child-pins convention this file's harness otherwise honours does
// not apply to this cell. ADDITIVE ONLY: this is cell 57; cells 1–56 are
// unchanged, and this cell adds no assertion to any existing cell in this file.
// ===========================================================================

/**
 * The declarations both bug-0199 fixtures open with: the alias, the receiver
 * schema whose one-`CompatType`-per-parse field `xs` the withhold lands on, and
 * the second ternary arm that erases the receiver. Content-equal to the first
 * three lines of the offline witness's `PRE_LET_ARM`
 * (tests/loop-element-withhold-binding-scoped.test.ts:625), so the live and
 * offline measurements are of one program; the sink is declared per fixture
 * because the sink's parameter type is the only axis between them.
 */
const B199_PREAMBLE = [
  "---",
  "mode: prompt",
  "---",
  "schema L = array<integer>",
  "schema P { xs: L }",
  "schema B { xs: array<string> }",
];

/**
 * The subject — the report's §Reproduction (a) row a1. `hs(ws)` satisfies
 * `theta/parse/fn-arg-type-mismatch`'s *Trigger* in every particular (`q` is an
 * annotated parameter of a resolved object schema, so `q.xs` is a proven
 * declared-field read; TYPE-11 makes `P`'s field `L` into `array<integer>`; `hs`
 * declares `array<string>`), and the withhold recorded for `zs` off the erased
 * receiver suppresses it. Measured `[]` at HEAD, so `hasLoadParseError` has
 * nothing to act on and the theta registers. The trailing `1` supplies the
 * theta's final value — a prompt-mode theta needs no `@`-query to register.
 */
function letArmSuppressedFnArgMismatchTheta(): string {
  return [
    ...B199_PREAMBLE,
    "fn hs(a: array<string>) {",
    "  1",
    "}",
    "fn f(flag: boolean, q: P) {",
    '  let m = flag ? P { xs: [1] } : B { xs: ["a"] }',
    "  let zs = m.xs",
    "  let ws = q.xs",
    "  hs(ws)",
    "  1",
    "}",
    "1",
    "",
  ].join("\n");
}

/**
 * The always-registers control: identical to the subject except that the sink
 * declares the element type the field actually carries, so the judged row is
 * `array<integer> ⊑ array<integer>` and no diagnostic is owed on either side of
 * the fix. It isolates the subject's post-fix refusal to the type mismatch
 * rather than to "an erased receiver plus two member-read `let`s never registers
 * in this harness".
 */
function compatibleFnArgSinkTheta(): string {
  return [
    ...B199_PREAMBLE,
    "fn hi(a: array<integer>) {",
    "  1",
    "}",
    "fn f(flag: boolean, q: P) {",
    '  let m = flag ? P { xs: [1] } : B { xs: ["a"] }',
    "  let zs = m.xs",
    "  let ws = q.xs",
    "  hi(ws)",
    "  1",
    "}",
    "1",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0199: a withhold recorded for one `let` binding does not suppress a later provable `let`'s fn-arg refusal, live (Convention: live-host acceptance)", () => {
  it("does not register a caller whose unprovable member-read let precedes a proven member-read let's mistyped argument, while the same shape with a compatible argument registers, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // The always-registers control, planted first for the same reason it is
      // asserted first.
      { source: "project", stem: "b199livegood", text: compatibleFnArgSinkTheta() },
      // The subject: the same shape whose sink's declared parameter type the
      // proven read is incompatible with.
      {
        source: "project",
        stem: "b199livebroken",
        text: letArmSuppressedFnArgMismatchTheta(),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b199livegood"),
        "the same-shape control with a COMPATIBLE sink argument did not " +
          "register — an erased ternary receiver plus two member-read `let`s " +
          "cannot register in this workspace at all, independent of this bug, " +
          "so the subject's own verdict cannot be attributed. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // THE DEFECT, through the REAL production composition root: the caller
      // whose proven `let ws = q.xs` hands `hs`'s `array<string>` parameter an
      // `array<integer>` registers anyway, because `provableArgType`'s `ident`
      // arm answers `undefined` for `ws` — `unprovableBindings.has` hits the
      // declared-field object the earlier `let zs = m.xs` marked — so
      // `checkFnCallArgs` skips the row, `checkFnArgCompat` is never called, and
      // `hasLoadParseError` sees nothing.
      expect(
        handle.command("b199livebroken"),
        "the caller whose proven member-read `let` passes a provably mistyped " +
          "argument registered anyway through the live discovery/session_start " +
          "path — the withhold recorded for the EARLIER `let` off the erased " +
          "receiver suppressed the true theta/parse/fn-arg-type-mismatch, while " +
          "the b199livegood control (the same shape with a compatible sink) " +
          "registered as it must. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b199livebroken");
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0124 — `parseType` (src/parser/theta-document.ts) answers *where does
// this annotation end*, not *is this annotation a type*. It joins the current
// token's text unconditionally (`:3240`) and breaks only on a closed stop set
// that, at a `let` annotation (`parseLet`'s `parseType()` call) and at an `fn`
// parameter type or return type (`parseFn`'s parameter loop and its return
// slot), contains `stmt-sep`, a depth-0 `,` / `)` / `{` / `}` / `=`, and (return
// slot only) a depth-0 `with`. Every arithmetic, comparison, logical, ternary,
// member-access and stray punctuation token is outside that set, so
// `let a: integer-- = 3` records the annotation `"integer--"`,
// `annotationToCompatType` (src/parser/type-layer-checks.ts) maps it to an opaque
// `{kind:"named", name:"integer--"}` through its final arm, and eight registered
// error-severity rows stop firing
// (docs/bugs/0124-parsetype-trailing-punctuation-leniency.md).
//
// The refusal is owed. grammar.md:90–:95 closes the `Type` production set,
// `:98` is `NamedType ::= Ident` (so `integer--` is no `NamedType`), `:105`
// names `let` annotations among the bare-`Type` positions and adds "The grammar
// is otherwise identical in every position", and type-system.md:15 binds every
// annotation position to that one grammar. No spec sentence says what a `let`
// annotation carrying `integer--` MEANS, so silence-plus-an-opaque-name is the
// third possibility no page contemplates.
//
// WHAT THIS CELL ADDS OVER AN OFFLINE ROW. The offline witness
// (tests/annotation-nontype-text-refusal.test.ts) observes the diagnostic array
// and stops there; it cannot observe the consequence the report's §Why it
// matters leads with — the absent `E` leaves `hasLoadParseError`
// (`src/extension/production-composition.ts`) with nothing to act on through
// the REAL production composition root (session_start → resources_discover →
// composeExtensionInstance → checkTypeLayer), so the slash command is created
// and the theta runs with its declared constraint unenforced. REGISTRATION is
// the observable this cell asserts, and the only one.
//
// THE CONTROL, ASSERTED FIRST. `b124livegood` is the SAME program with the
// SAME binding, the same initialiser and the same tail, differing in one
// particular: its annotation is `integer` rather than `integer--`. It must stay
// registered before and after, which is what makes the subject's refusal
// attributable to the annotation TEXT rather than to the shape, the frontmatter,
// or a planting/discovery failure. It is asserted BEFORE the subject so a broken
// workspace or a dead discovery walk reds on the control instead of being read
// as the subject's refusal.
//
// RED AT 0.120.0 / `dcff3f43` for the reason the report states: the subject
// REGISTERS, because the missing refusal IS the defect. That is an open
// documented correct-reason red per AGENTS.md §"Expect documented correct-reason
// reds" — `docs/bugs/0124-parsetype-trailing-punctuation-leniency.md` is the
// report whose signature it matches — and it goes green when the three
// annotation walks refuse text no `Type` production spells. The in-tree bound on
// the same channel is the offline witness's group (a) (`RED (a1, let)`), whose
// `let a: integer-- = 3` fixture is the same program as the subject below.
//
// Registration-only: no slash command is invoked, so NO model turn runs and the
// cell spends zero tokens (the same profile the bug 0050/0126/0136/0185/0190/
// 0192/0194/0197/0199 cells above claim). No subagent child process is spawned —
// both fixtures are prompt mode with no `invoke(...)` and no `subagent fn` — so
// the #subagent-child-pins convention this file's harness otherwise honours does
// not apply to this cell. ADDITIVE ONLY: this is cell 58; cells 1–57 are
// unchanged, and this cell adds no assertion to any existing cell in this file.
// ===========================================================================

/**
 * One `mode: prompt` theta whose sole `let` carries `annotation`. Both bug-0124
 * fixtures are minted from this single builder so the annotation text is the
 * only axis between them; the trailing `a` supplies the theta's final value — a
 * prompt-mode theta needs no `@`-query to register.
 */
function annotatedLetTheta(annotation: string): string {
  return ["---", "mode: prompt", "---", `let a: ${annotation} = 3`, "a", ""].join("\n");
}

describe("H8a-T — bug 0124: a `let` annotation carrying a junk suffix does not register, live (Convention: live-host acceptance)", () => {
  it("does not register a theta whose `let` annotation carries a trailing punctuation suffix, while the same program with the well-formed annotation registers, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // The always-registers control, planted first for the same reason it is
      // asserted first.
      { source: "project", stem: "b124livegood", text: annotatedLetTheta("integer") },
      // The subject: the same program whose annotation carries one trailing
      // punctuation trailer, which `parseType`'s stop set does not end.
      { source: "project", stem: "b124livebroken", text: annotatedLetTheta("integer--") },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b124livegood"),
        "the same program with the WELL-FORMED annotation did not register — an annotated " +
          "`let` cannot register in this workspace at all, independent of this bug, so the " +
          "subject's own verdict cannot be attributed. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // THE DEFECT, through the REAL production composition root: the theta
      // whose annotation derives from no `Type` production registers anyway,
      // because the capture recorded the text, the converter turned it into a
      // nominal reference the `⊑` engine defers on, and no component asked
      // whether the author wrote a type — so `hasLoadParseError` sees nothing.
      expect(
        handle.command("b124livebroken"),
        "the theta whose `let` annotation carries a trailing `--` registered anyway through the " +
          "live discovery/session_start path — one punctuation character silently removed the " +
          "rejection the annotation existed to produce, while the b124livegood control (the same " +
          "program with `integer`) registered as it must. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b124livebroken");
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0140 — `collectIdentRoots` (src/parser/theta-document.ts) folded every
// declared `schema` / `enum` name into the whole-file identifier root scope
// through one fall-through `switch` arm, so `checkUnknownIdentifiers`'s walk
// resolved a bare declaration name at a VALUE position exactly as it resolves a
// `let` binding — no diagnostic named the identifier, `hasLoadParseError`
// (src/extension/production-composition.ts) had nothing to act on, and the
// theta registered and ran with the runtime resolver (which implements only the
// four-arm list `expressions.md` §"Identifier resolution" states) substituting
// `null` at the position instead
// (docs/bugs/0140-bare-schema-reference-value-position-silent.md).
//
// THE FIX mints `theta/parse/type-as-value` — a sibling of
// `theta/parse/function-as-value` — inside `checkUnknownIdentifiers`'s own walk:
// a name only a `schema` / `enum` declaration introduces (not also claimed by a
// `let`, a parameter, an import, a `params:` field, or a resolved `tools:`
// callable) now refuses at a VALUE position and denies registration through the
// same `hasLoadParseError` gate every other H8a-T registration-denial cell in
// this file exercises. The call position (`Schema()`) keeps
// `theta/parse/unknown-identifier` unchanged — the doc's own "third
// arrangement" — and is not this cell's subject.
//
// THE SUBJECT is the bug doc's own §Reproduction row a1, verbatim: a `schema`
// declared, an `fn` taking a `string` parameter, and the schema's bare name
// passed as the call argument — `let out = g(P)`.
//
// THE CONTROL, ASSERTED FIRST. `b140livegood` is the SAME schema-plus-fn
// program, differing in one particular: the argument is a genuine `string`
// literal rather than the bare schema name, so no identifier read of `P` occurs
// anywhere in the body. It must stay registered before and after the fix, which
// is what makes the subject's refusal attributable to the bare value-position
// reference rather than to the shape, the frontmatter, or a planting/discovery
// failure. It is asserted BEFORE the subject so a broken workspace or a dead
// discovery walk reds on the control instead of being read as the subject's
// refusal.
//
// THE CODE-SPECIFIC OBSERVABLE. `hasLoadParseError`
// (`production-composition.ts`) is severity-and-namespace-only — it denies
// registration for ANY error-severity `theta/parse/*` diagnostic, not for this
// one specifically. A bare registration-boolean assertion alone therefore
// cannot attribute the subject's refusal to `theta/parse/type-as-value` rather
// than to some other, unrelated parse error the fixture might accidentally also
// draw. This cell closes that gap the same way the bug 0084/0110/0139/0149
// cells above do: it additionally asserts the `theta-system-note` channel
// (AGENTS.md §"Assert on real observables") carries this diagnostic's own
// DIAG-4 registry message, read live from the registry through
// `typeAsValueFragment` rather than restated, so a reworded row reds this cell
// by naming the row rather than by silently comparing against stale text.
//
// RED BEFORE THE FIX for the reason the report states: the subject REGISTERS,
// because the missing refusal IS the defect (the theta then runs `g(P)` with
// `s` bound to a substituted `null`, per §Reproduction (e1)). That is the
// red-both-directions proof obligation this cell exists to carry; the fix
// lands GREEN.
//
// Registration-only: no slash command is invoked, so NO model turn runs and the
// cell spends zero tokens (the same profile the bug 0050/0126/0136/0185/0190/
// 0192/0194/0197/0199/0124 cells above claim). No subagent child process is
// spawned — both fixtures are prompt mode with no `invoke(...)` and no
// `subagent fn` — so the #subagent-child-pins convention this file's harness
// otherwise honours does not apply to this cell. ADDITIVE ONLY: this is cell
// 59; cells 1–58 are unchanged, and this cell adds no assertion to any existing
// cell in this file.
// ===========================================================================

/** The bug's own §Reproduction row a1, verbatim: a bare declared-schema reference at a value position (the call argument). */
function bareSchemaRefAtValueArgTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "schema P { a: number }",
    "fn g(s: string): number { 1 }",
    "let out = g(P)",
    "out",
    "",
  ].join("\n");
}

/**
 * The same-shape SIBLING with the SAME `schema` and `fn` declared, the argument
 * a genuine `string` literal instead of the bare schema name — must still
 * register, isolating the broken theta's refusal to the value-position
 * reference rather than to "a theta declaring an unused schema never registers
 * here".
 */
function compatibleFnArgStringLiteralTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "schema P { a: number }",
    "fn g(s: string): number { 1 }",
    'let out = g("ok")',
    "out",
    "",
  ].join("\n");
}

/** `theta/parse/type-as-value`'s registered code and registry page. */
const TYPE_AS_VALUE_CODE = "theta/parse/type-as-value";
const TYPE_AS_VALUE_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `theta/parse/type-as-value: type '<name>' used as a value; a schema or enum
 * declaration names a type, not a value` with `<name>` substituted — DIAG-4:
 * the message half is read from the registry row, not copied, mirroring this
 * file's existing `nonArrayIterandFragment` / `bindingCaseMismatchFragment`
 * helpers.
 */
function typeAsValueFragment(name: string): string {
  const template = registryMessage(
    TYPE_AS_VALUE_REGISTRY,
    TYPE_AS_VALUE_CODE,
  ) as string | undefined;
  expect(
    template,
    `${TYPE_AS_VALUE_CODE} has no registry row — the code this cell asserts is not registered ` +
      "(DIAG-2)",
  ).toBeTypeOf("string");
  const message = (template as string).replaceAll("<name>", name);
  expect(
    message,
    `${TYPE_AS_VALUE_CODE}: an unsubstituted <…> placeholder remains — the registry row's ` +
      "Message template changed shape and this cell's substitution is stale",
  ).not.toMatch(/<[a-z]+>/);
  return `${TYPE_AS_VALUE_CODE}: ${message}`;
}

describe("H8a-T — bug 0140: a bare declared-schema reference at a value position does not register, live (Convention: live-host acceptance)", () => {
  it("does not register a caller whose call argument is a bare declared-schema reference, while its same-shape string-argument sibling registers, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // The always-registers control, planted first for the same reason it is
      // asserted first.
      { source: "project", stem: "b140livegood", text: compatibleFnArgStringLiteralTheta() },
      // The subject: the bug doc's own §Reproduction row a1 spelling.
      { source: "project", stem: "b140livebroken", text: bareSchemaRefAtValueArgTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b140livegood"),
        "the same schema-plus-fn program with a genuine string argument did not register — a " +
          "theta declaring an unused schema cannot register in this workspace at all, " +
          "independent of this bug, so the subject's own verdict cannot be attributed. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // THE FIXED OBSERVABLE, through the REAL production composition root:
      // the theta whose call argument is a bare declared-schema reference no
      // longer registers — `checkUnknownIdentifiers`'s walk now refuses the
      // name at this value position with `theta/parse/type-as-value`, and
      // `hasLoadParseError` un-registers this theta at the SAME site every
      // other registration-denial cell in this file exercises for its own
      // code.
      expect(
        handle.command("b140livebroken"),
        "the theta whose call argument is a bare declared-schema reference registered anyway " +
          "through the live discovery/session_start path — theta/parse/type-as-value did not " +
          "fire. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b140livebroken");

      // THE CODE-SPECIFIC PIN (AGENTS.md §"Assert on real observables"): the
      // diagnostic fires at LOAD time, before any drive, so the whole
      // in-memory entry list carries it — the same shape the bug
      // 0084/0110/0139/0149 cells above read. This is what attributes the
      // refusal to theta/parse/type-as-value specifically, since
      // hasLoadParseError alone (the assertions above) would equally deny
      // registration for ANY error-severity theta/parse/* code.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = typeAsValueFragment("P");
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the theta/parse/type-as-value rejection for the broken " +
          "theta. Notes: " + JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

/**
 * ADDITIVE ONLY: this is cell 60; cells 1-59 are unchanged, and this cell
 * adds no assertion to any existing cell in this file.
 *
 * Bug 0164 — a literal GENERIC ARGUMENT (`array<"x" | "y">`) now lowers
 * schema-subset.md:80's enforcing `{"type":"string","enum":[...]}` inside
 * `items` at the `params:` position, instead of the pre-fix permissive
 * `{"anyOf":[{},{}]}` that admits every JSON array element. This is the SAME
 * mechanism the bug 0056 cell above pins one level up (a bare literal union
 * at the `params:` TOP), moved one generic-argument DEPTH down; no existing
 * H8a cell drives an `invoke(...)` argument against a declared `array<...>`
 * of literals, so this cell is the first live witness of the fixed depth.
 *
 * WHY NO STATIC CHECK CAN CONFOUND IT: both `invoke(...)` call sites below
 * bind their argument to a plain identifier (`good` / `bad`), so
 * `collectProvableArgTypes`'s `"ident"` withholding keeps both calls off the
 * static invoke-arg-type-mismatch checker's plate — the same reason the bug
 * 0056 fixture states for its own two calls, mirrored verbatim here. The
 * runtime AJV net at the child's params intake (RFC-0006 marshalled-params)
 * is the only judge of either argument, live.
 *
 * TOKEN PROFILE: one live turn against the parent (`mode: prompt`), spending
 * on the order of the bug 0056 cell above (no live turn on the callee itself
 * — its body is a bare tail expression returning `p`, so the callee's own
 * spawned child issues no query).
 */
function literalArrayParamsChildTheta(): string {
  return [
    "---",
    "mode: subagent",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    '  p: \'array<"x" | "y">\'',
    "---",
    "p",
    "",
  ].join("\n");
}

/**
 * The load-bearing parent: TWO `invoke(...)` calls against the SAME callee —
 * one argument an array the declaration admits (`[\"x\"]`), one whose sole
 * element NO declared arm admits (`[\"zzz\"]`) — each bound to a plain
 * identifier (`good` / `bad`) so `collectProvableArgTypes`'s `"ident"`
 * withholding keeps BOTH calls off the static invoke-arg-type-mismatch
 * checker's plate. Each `Result` is `match`ed EXPLICITLY into a plain string
 * — `"ACCEPTED"` for `Ok`, `"REJECTED " + <the wire cause>` for `Err` — so
 * nothing here is an unhandled `Err` (no `?`, no panic path), and the ONE
 * closing query renders both outcomes the way theta CODE computed them,
 * independent of anything the model says back.
 */
function literalArrayParamsInvokeCheckTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    'let good = ["x"]',
    'let bad = ["zzz"]',
    'let okResult = invoke("./b164livechild.theta", good)',
    'let badResult = invoke("./b164livechild.theta", bad)',
    "let okOutcome = match okResult {",
    '  Ok(_) => "ACCEPTED",',
    '  Err(e) => "REJECTED " + e.cause,',
    "}",
    "let badOutcome = match badResult {",
    '  Ok(_) => "ACCEPTED",',
    '  Err(e) => "REJECTED " + e.cause,',
    "}",
    "@`An intake probe reports GOOD=${okOutcome} BAD=${badOutcome}. Restate that pair, then answer: what is 512 plus 276?`",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0164: an invoke(...) argument outside a declared array<literal-union>'s admitted elements is refused at the child's params intake, live (Convention: live-host acceptance)", () => {
  it("accepts an invoke(...) array argument the declared array<\"x\" | \"y\"> element type admits and refuses one whose element it does not, through the real RFC-0006 marshalled-params AJV intake", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, either
      // invoke() outcome below could be (wrongly) attributed to a broken
      // workspace instead of the generic-argument literal lowering under
      // test.
      { source: "project", stem: "b164livectl", text: promptTheta("THETA-LIVE-OK") },
      { source: "project", stem: "b164livechild", text: literalArrayParamsChildTheta() },
      { source: "project", stem: "b164livecheck", text: literalArrayParamsInvokeCheckTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b164livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the generic-argument literal lowering under test, would explain " +
          "either invoke() outcome below too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b164livechild"),
        "the array<literal-union>-typed-params callee did not register — its " +
          "bind_model: chain failed to resolve (a workspace/registry problem, " +
          "not the lowering under test). Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b164livecheck"),
        "the invoking parent did not register — precondition unmet before any " +
          "live turn is driven. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const turn = await driveSlashCaptureTurn(handle, "/b164livecheck");
      const outbound = turn.userTexts.join("\n");

      // THE CONTROL — the array whose sole element is a declared arm is
      // accepted at BOTH the permissive and the enforcing lowering (an empty
      // `items` schema admits everything; the enforcing `items` admits its
      // own declared arm), isolating the fixed observable below to the
      // out-of-declared-arms argument specifically rather than to "invoke()
      // to this callee never succeeds in this harness".
      expect(
        outbound,
        "the in-declared-arm invoke() array argument was not accepted — " +
          "Registered: " + JSON.stringify(handle.registeredNames()) +
          "; outbound: " + JSON.stringify(turn.userTexts),
      ).toContain("GOOD=ACCEPTED");

      // THE FIXED OBSERVABLE. Pre-fix `array<"x" | "y">` lowers the
      // permissive `items: {"anyOf":[{},{}]}` (each variant an empty schema
      // admitting every JSON value), so an array whose element matches NEITHER
      // declared arm is silently ACCEPTED at the child's params intake too —
      // `BAD=ACCEPTED`. Post-fix it lowers the enforcing
      // `items: {"type":"string","enum":["x","y"]}` (schema-subset.md:80,
      // reached through `lowerGenericArgument`, bug 0164 §Fix), so the SAME
      // argument is refused with `InvokeInfraError { cause: "validation" }`
      // (`refuseParams`, src/runtime/subagent-params.ts) — `BAD=REJECTED
      // validation`, rendered by theta CODE from the real `Result` the real
      // RFC-0006 child intake returned, never asserted on `prompt()` merely
      // resolving.
      expect(
        outbound,
        "the out-of-declared-arms invoke() array argument was not refused — " +
          "the array<literal-union> element type did not enforce at the " +
          "child's params intake (bug 0164 did not fire, or fired with an " +
          "unexpected cause). Registered: " + JSON.stringify(handle.registeredNames()) +
          "; outbound: " + JSON.stringify(turn.userTexts),
      ).toContain("BAD=REJECTED validation");
      expect(
        outbound,
        "the out-of-declared-arms invoke() array argument was accepted — the " +
          "pre-fix permissive generic-argument lowering's own failure " +
          "signature. outbound: " + JSON.stringify(turn.userTexts),
      ).not.toContain("BAD=ACCEPTED");

      // No fail-closed ending of the PARENT's own drive: both `invoke(...)`
      // results are `match`ed explicitly above (no `?`, no unhandled `Err`),
      // so this theta's own top-level outcome is Success either way — a
      // failure note here would mean the fixture itself is broken, not that
      // bug 0164 fired.
      const failureNotes = turn.systemNotes.filter((n) =>
        /^theta \/b164livecheck (returned Err|cancelled|aborted)/.test(n),
      );
      expect(
        failureNotes,
        "the invoking parent's own drive surfaced fail-closed system note(s) " +
          "— the fixture itself is broken: " + JSON.stringify(failureNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0074 (cell 61) — the ActiveInvocationRegistry entry now spans the awaited
// binder window, so a `session_shutdown` landing while a non-bypass `params:`
// theta is mid-binder-call actually cancels it, live.
// `docs/bugs/0074-registry-insertion-after-binder-await.md` §Fix: insertion
// moved to the slash-dispatch entry point (`beginInvocation`), ahead of the
// `await deps.runBinder(...)` step. Pre-fix the registry held no entry during
// that window, so `session_shutdown` sub-step 2 aborted nothing, the binder
// call ran to completion, and the theta's `bind_echo` success note landed
// AFTER a completed teardown (the post-teardown continuation this bug names).
// Post-fix the entry exists, sub-step 2 aborts THIS invocation's `thetaAbort`,
// `runBinderCallWithCancellation` (binder-cancellation.ts) observes the
// forwarded signal and surfaces the `cancelled` binder note instead, and the
// theta never runs.
//
// Mirrors the bug-0064 cell immediately above for the fixture shape (a real
// off-session binder call against the live suite's own rule-resolved model)
// and `tests/live/double-session-start-live.test.ts` for firing
// `session_shutdown` directly through `handle.runner.emit(...)` rather than
// through `handle.dispose()`, so the shutdown can be raced against the
// in-flight binder call instead of always following the drive.
// ===========================================================================

describe("H8a-T — bug 0074 cell 61: session_shutdown racing a live off-session binder call cancels it instead of letting it complete post-teardown", () => {
  it("a session_shutdown fired immediately after dispatch lands the cancelled-binder note, never the bind_echo success note", async () => {
    const provider = await requireLiveProvider();
    const providerId = (provider.model as { provider?: string }).provider ?? "";
    if (providerId === "") {
      failLoudly(
        "live-host precondition unmet: the resolved live model carries no " +
          "`provider` field, so `bind_model:` cannot be provider-qualified " +
          `(resolved model id '${provider.modelId}').`,
      );
    }
    const bindModel = `${providerId}/${provider.modelId}`;

    const thetas: PlantedTheta[] = [
      { source: "project", stem: "b74livectl", text: promptTheta("THETA-LIVE-OK") },
      { source: "project", stem: "b74livebinder", text: b64BinderParamsTheta(bindModel) },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b74livectl"),
        "the precondition control did not register — a broken workspace would " +
          "explain the assertions below too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b74livebinder"),
        `the non-bypass params: theta did not register against bind_model: ` +
          `'${bindModel}'. Registered: ` + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const entriesBefore = handle.sessionManager.getEntries().length;

      // Dispatch WITHOUT awaiting, then fire session_shutdown immediately: the
      // real off-session binder call is a genuine network round trip (~2.5s
      // per the bug-0064 cell above), so the shutdown lands well inside the
      // binder window this bug's fix now spans with a live registry entry.
      const drivePromise = driveSlashCaptureText(
        handle.session,
        "/b74livebinder summarise the three most recent commits",
      );
      expect(
        handle.runner.hasHandlers("session_shutdown"),
        "the shipped extension registered no session_shutdown handler — the " +
          "fixed path (sub-step 2's abort) can never be reached by this cell.",
      ).toBe(true);
      await handle.runner.emit({ type: "session_shutdown", reason: "reload" });

      // Let the raced drive settle (a fail-closed binder resolves, it never
      // throws — AGENTS.md §"Assert on real observables").
      await drivePromise;

      const appended = handle.sessionManager.getEntries().slice(entriesBefore);
      const notes: string[] = [];
      for (const entry of appended) {
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

      // THE FIXED OBSERVABLE: the invocation was cancelled INSIDE its binder
      // window, not left to complete post-teardown.
      const cancelledNotes = notes.filter((n) =>
        n.includes("theta /b74livebinder: argument binding cancelled"),
      );
      expect(
        cancelledNotes,
        "no cancelled-binder note for a session_shutdown raced against the " +
          "in-flight binder call: the registry entry did not span the binder " +
          "window (bug 0074), so sub-step 2 aborted nothing and the binder ran " +
          "to completion instead. Notes: " + JSON.stringify(notes),
      ).not.toEqual([]);

      // Corroborating negative: the theta never actually ran (no bind_echo
      // success echo) — the bug's own "post-teardown continuation" signature
      // would be this note appearing anyway.
      const successNotes = notes.filter((n) => n.startsWith("Running /b74livebinder"));
      expect(
        successNotes,
        "the theta ran to a successful bind (`Running /b74livebinder …`) " +
          "despite a session_shutdown racing its binder call: the cancelled " +
          "invocation completed post-teardown instead of being aborted in " +
          "its binder window (bug 0074). Notes: " + JSON.stringify(notes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0116 (cell 63) — the runtime query-render read path: `evaluatePureExpression`
// gained a `case "try"` arm so a `?`-unwrapped operand behind a `${…}` query-
// template interpolation renders the UNWRAPPED payload, and an `Err` operand
// there aborts the theta (through the ONE factored `raiseInterpolatedResult`
// raise, `theta/parse/interpolated-result`) instead of silently sending
// `xnull` and reporting success. No existing H8a cell drives a `?` inside a
// `${…}` interpolation — checked: every cell above that touches
// `INTERPOLATED_RESULT_CODE` (bug 0079/0114) interpolates a bare `Result`
// (`${r}`), never a `try` node (`${r?}`); grep for `?}` against a `${` prefix
// in this file's fixtures before this addition returns nothing.
//
// Two directions, one cell, mirroring the bug 0079 (a)/(b) pair above:
//   Ok  — `let r = Ok(1)` / `` @`x${r?}` `` — registers unconditionally (the
//         static gate's `checkQueryInterpolationResults` skips a `try` node by
//         design, bug 0079's own control a7), so the fixed observable is the
//         REAL rendered turn: `turn.userTexts` must carry the unwrapped
//         payload `"x1"`, never `"xnull"`, and `turn.systemNotes` must be empty
//         (no fail-closed ending). This drive spends one real model turn.
//   Err — `let r = Err(E { m: "boom" })` / `` @`x${r?}` `` — the propagate arm
//         raises `InterpolatedResultPanic` INSIDE `renderQueryText`, strictly
//         before any provider dispatch (the same QRY-6 render-before-dispatch
//         precedent bug 0079 (b) cites above), so `turn.userTexts` must stay
//         EMPTY and `turn.systemNotes` must carry the panic framing — this
//         drive spends ZERO tokens regardless of the fix.
// Neither assertion is `prompt()` merely resolving (AGENTS.md §"Assert on real
// observables"): both read the settled in-memory `SessionManager`'s
// `userTexts` / `systemNotes` channels. No tool-call surface is exercised by a
// query render, so `toolCalls` is not applicable to this fixed path.
// ===========================================================================

/** cell 63, Ok half — the payload matrix's headline row (bug 0116 §Reproduction a1). */
function questionUnwrapOkTheta(): string {
  return ["---", "mode: prompt", "---", "let r = Ok(1)", "@`x${r?}`", ""].join("\n");
}

/** cell 63, Err half — the dropped early-return (bug 0116 §Reproduction, the `Err` row). */
function questionUnwrapErrTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "schema E { m: string }",
    'let r = Err(E { m: "boom" })',
    "@`x${r?}`",
    "",
  ].join("\n");
}

describe("H8a-T (cell 63) — bug 0116: a `?`-unwrapped operand behind a `${…}` query-template interpolation (Convention: live-host acceptance)", () => {
  it("renders the unwrapped Ok payload in the real outbound query text, and aborts before dispatch on the dropped Err early-return", async () => {
    const provider = await requireLiveProvider();

    // --- Ok half: the fixed render, one real model turn. ---
    const okWorkspace = plantThetaWorkspace([
      { source: "project", stem: "b116liveok", text: questionUnwrapOkTheta() },
    ]);
    const okHandle = await bootShippedExtension({ workspace: okWorkspace, provider });
    try {
      expect(
        okHandle.command("b116liveok"),
        "no command to invoke — discovery or registration regressed for the " +
          "planted theta (the static gate skips a `try` node by design, so this " +
          "must register unconditionally). Registered: " +
          JSON.stringify(okHandle.registeredNames()),
      ).toBeDefined();

      const okTurn = await driveSlashCaptureTurn(okHandle, "/b116liveok");
      expect(
        okTurn.userTexts,
        "PRIMARY (bug 0116 §Fix (a)/(b)): the real outbound query text must carry " +
          "the UNWRAPPED payload \"x1\" under QRY-18's integer row, not the " +
          "pre-fix `evaluatePureExpression` `default` arm's invented \"xnull\". " +
          "Sent: " + JSON.stringify(okTurn.userTexts),
      ).toEqual(["x1"]);
      expect(
        okTurn.systemNotes,
        "the Ok-payload drive must not surface any fail-closed " +
          "`theta-system-note` — no SLSH-3 err note, no cancellation, no panic " +
          "framing. System notes: " + JSON.stringify(okTurn.systemNotes),
      ).toEqual([]);
    } finally {
      await okHandle.dispose();
      okWorkspace.dispose();
    }

    // --- Err half: the dropped early-return, zero tokens. ---
    const errWorkspace = plantThetaWorkspace([
      { source: "project", stem: "b116liveerr", text: questionUnwrapErrTheta() },
    ]);
    const errHandle = await bootShippedExtension({ workspace: errWorkspace, provider });
    try {
      expect(
        errHandle.command("b116liveerr"),
        "no command to invoke — discovery or registration regressed for the " +
          "planted theta. Registered: " + JSON.stringify(errHandle.registeredNames()),
      ).toBeDefined();

      const errTurn = await driveSlashCaptureTurn(errHandle, "/b116liveerr");
      expect(
        errTurn.userTexts,
        "PRIMARY (bug 0116 §Fix (c)): an `Err` operand's early-return must abort " +
          "BEFORE any provider dispatch — no query text may reach the model. At " +
          "HEAD (pre-fix) this row sent [\"xnull\"] and reported success. Sent: " +
          JSON.stringify(errTurn.userTexts),
      ).toEqual([]);
      expect(
        errTurn.systemNotes,
        "PRIMARY (bug 0116 §Fix (c)): the abort must be framed on the " +
          "`theta-system-note` channel carrying the registered " +
          INTERPOLATED_RESULT_CODE + " code's Message (DIAG-4, read from " +
          "code-registry-parse.md, never copied prose). System notes: " +
          JSON.stringify(errTurn.systemNotes),
      ).toEqual([interpolatedResultAbortedNote("b116liveerr")]);
    } finally {
      await errHandle.dispose();
      errWorkspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0073 cell 64 — the per-invocation clean-cancel note
// `theta/runtime/cancelled-by-session-shutdown` now reaches the wire when a
// `session_shutdown` races a live in-flight PROMPT-mode drive. Mirrors the
// bug-0074 cell 61 shape immediately above (dispatch WITHOUT awaiting, fire
// `session_shutdown` directly through `handle.runner.emit(...)` so the
// shutdown races the in-flight drive instead of following it via
// `handle.dispose()`), but drives a plain prompt-mode theta rather than a
// binder call, and asserts presence of the NEW per-invocation row rather than
// the binder-cancellation note bug 0074 pins.
//
// `docs/bugs/0073-cancelled-by-session-shutdown-never-emitted.md` — the row is
// registered (`code-registry-runtime.md`, the
// `theta/runtime/cancelled-by-session-shutdown` row), emitted from the invocation's
// own `finally` under the predicate `entry.shutdownReason !== undefined`, once
// per cleanly-cancelled invocation, on `theta-system-note`. This cell is
// additive only; it does not modify cell 61 or any other existing cell.
// ===========================================================================

describe("H8a-T — bug 0073 cell 64: a session_shutdown racing a live in-flight prompt-mode drive emits the per-invocation cancelled-by-session-shutdown note", () => {
  it("cell 64: the clean-cancel row lands on the theta-system-note channel, alongside the independent SLSH-4 cancelled note", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      { source: "project", stem: "b73livecancel", text: promptTheta("THETA-LIVE-OK") },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b73livecancel"),
        "the precondition control did not register. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const entriesBefore = handle.sessionManager.getEntries().length;

      // Dispatch WITHOUT awaiting, then fire session_shutdown immediately: a
      // real live-model call is a genuine network round trip, so the shutdown
      // lands while the invocation is genuinely in flight, inside sub-step 3's
      // bounded await once the forwarded `options.signal` aborts the call.
      const drivePromise = driveSlashCaptureText(handle.session, "/b73livecancel");
      expect(
        handle.runner.hasHandlers("session_shutdown"),
        "the shipped extension registered no session_shutdown handler — the " +
          "fixed path (sub-step 2's abort) can never be reached by this cell.",
      ).toBe(true);
      await handle.runner.emit({ type: "session_shutdown", reason: "reload" });

      // Let the raced drive settle (a fail-closed drive resolves, it never
      // throws — AGENTS.md §"Assert on real observables").
      await drivePromise;

      const appended = handle.sessionManager.getEntries().slice(entriesBefore);
      const notes: string[] = [];
      for (const entry of appended) {
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

      // THE FIXED OBSERVABLE: the per-invocation clean-cancel row, carrying the
      // handler-captured reason in its message template
      // (`code-registry-runtime.md`'s `theta /<name> cancelled by session
      // shutdown (<reason>)`).
      const cleanCancelNotes = notes.filter((n) =>
        n.startsWith("theta /b73livecancel cancelled by session shutdown ("),
      );
      expect(
        cleanCancelNotes,
        "no theta/runtime/cancelled-by-session-shutdown note for a " +
          "session_shutdown raced against an in-flight prompt-mode drive (bug " +
          "0073): the per-invocation finally never emitted the row. Notes: " +
          JSON.stringify(notes),
      ).not.toEqual([]);

      // Corroborating: the independent SLSH-4 `SNK-f` note is required on this
      // path too and stays on the wire — it is not a substitute for the row
      // above, and its absence here would mean the fixture itself never
      // reached the CANCEL terminal this cell drives toward.
      const slsh4Notes = notes.filter((n) => n === "theta /b73livecancel cancelled");
      expect(
        slsh4Notes,
        "the fixture never reached the SLSH-4 cancelled terminal — the " +
          "session_shutdown did not land on this invocation at all, so the " +
          "row assertion above proves nothing. Notes: " + JSON.stringify(notes),
      ).not.toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// cell 65 (bug 0103) — `buildBinderSystemPrompt` (src/binder/binder-system-
// prompt.ts) interpolated frontmatter's `description:` / `argument-hint:`
// scalars into item 2's / item 3's lines with no shape transform, so a YAML
// block scalar whose second line spells a further structural token (e.g.
// `Theta: /evil`) forged an extra physical line into the off-session binder
// system prompt with zero load diagnostics
// (docs/bugs/0103-binder-description-argument-hint-lines-forgeable-by-newline.md).
// The fix routes both interpolations through a new module-local
// `normalisePromptTextLineBreaks`: every line-break-bearing whitespace run
// collapses to one U+0020 and the result is trimmed, so the forged line
// never reaches the model as a second physical line — a break-free value
// renders unchanged.
//
// The bug doc's own §Fix constraint 4 records that live is NOT a witness for
// the defect: the one live fixture that drives a real binder pass
// (`tests/live/acceptance/fixtures/acc-params-binder.theta`) declares
// neither field, so no live test had reached item 2 or item 3 with content at
// all before this cell — and the prompt this defect corrupts is itself an
// off-session, unobserved model INPUT: `#completeBinderReply`
// (production-theta-producer.ts) issues its `complete()` call out of session,
// so neither `driveSlashCaptureTurn`'s `userTexts` (the user SESSION's own
// turns) nor any harness channel can read the raw system-prompt bytes the
// provider actually received. This cell therefore cannot observe the
// rendered `Description:` line's byte shape directly — no live channel can,
// with or without a probe written for the purpose — and does not claim to;
// what it drives and asserts is the BREAK-FREE-PLUS-COLLAPSED PATH END TO
// END the bug doc's §Fix constraint 4 asks for: a theta whose frontmatter
// carries a multi-line `description: |` (its second line the forged
// structural token `Theta: /evil`) plus one non-bypass `params:` field
// registers with zero error-severity load diagnostics, and a real live
// binder pass against it still binds the field to the caller's actual typed
// argument — not to anything the forged line names — echoed verbatim on the
// deterministic `Running /<name>: …` theta-system-note channel
// (defaulting-system-note-echo.md), with no fail-closed note.
//
// `bind_model:` is pinned to `anthropic/claude-haiku-4-5` — this file's own
// convention for every non-bypass `params:` fixture (21 occurrences of this
// exact pin in this file). The fixture's single `p: integer` field is not
// `single-string-bypass`-eligible: `classifyBinderBypass`
// (src/binder/binder-envelope.ts) routes to that bypass only for exactly one
// field of type `string` with no default, and this field's type is
// `integer`. Without the pin the theta would depend on this ephemeral
// acceptance workspace's absent ambient `theta.binderModel` setting for a
// resolvable model.
//
// Token cost: ONE off-session binder inference call plus the one body `@`-
// query the bound field's interpolation dispatches — the same two-call
// profile the bug 0066/0166/0165 cells above spend. ADDITIVE ONLY: no
// existing cell in this file is weakened, reworded, reordered or deleted.
// ===========================================================================

/** The committed body sentinel for cell 65 — present in `userTexts` iff the body ran. */
const CELL_C2_SENTINEL = "SENTINEL-cell 65";

/**
 * The load-bearing theta: a `description: |` block scalar whose SECOND line
 * is the forged structural token `Theta: /evil` (the bug doc's own D1
 * spelling), plus one non-bypass `params:` field. `p: integer` (no default)
 * is NEVER `single-string-bypass`-eligible — `classifyBinderBypass`
 * (src/binder/binder-envelope.ts) requires exactly one field of type
 * `string`, and this field's type is `integer` — so this fixture always
 * routes to a genuine `binder` kind and drives a real off-session binder
 * pass, mirroring this file's own bug 0102/0125 `ONE_INTEGER_FIELD`
 * convention (the offline witness's own choice for the same reason). The
 * body interpolates the bound field behind the committed sentinel so
 * `userTexts` is the deterministic body-ran observable, independent of the
 * model's own reply text.
 */
function forgedDescriptionBinderTheta(): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "description: |",
    "  Echoes back the integer you give it.",
    "  Theta: /evil",
    "params:",
    "  p: integer",
    "---",
    "@`" + CELL_C2_SENTINEL + " p=${p}. What is 539 plus 224? Answer with the number only.`",
    "",
  ].join("\n");
}

describe("H8a-T — cell 65 (bug 0103): a forged structural line inside a multi-line description: does not corrupt a real binder pass (Convention: live-host acceptance)", () => {
  it("registers cleanly, binds the caller's actual argument (not the forged line's text), and echoes it on the theta-system-note channel with no fail-closed note", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without it, either
      // observable below could be (wrongly) attributed to a broken workspace
      // instead of the fix under test.
      { source: "project", stem: "cellc2livectl", text: promptTheta("THETA-LIVE-OK") },
      { source: "project", stem: "cellc2live", text: forgedDescriptionBinderTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("cellc2livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the forged-description path under test, would explain the assertions " +
          "below too. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Registration itself is the zero-error-severity-load-diagnostic
      // observable in this file's own convention (the bug 0102/0110/0125/0166
      // cells above): `hasLoadParseError` un-registers a theta carrying ANY
      // error-severity load-phase diagnostic, so a defined command IS the
      // load-clean assertion. A forged `Theta: /evil` line inside `description:`
      // fires no diagnostic at all (bug doc §Actual behaviour / root cause,
      // "Nothing observes the outcome"; §Fix (e): no theta/* code moves), so
      // this registration is exactly what a correct fix and a correct
      // pre-fix rendering both still do — the cell's discriminating power is
      // in the bound-value echo below, not here.
      expect(
        handle.command("cellc2live"),
        "the theta whose description: carries a forged structural line did not " +
          "register — precondition unmet before any live binder pass is driven. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const REAL_VALUE = 42;
      const turn = await driveSlashCaptureTurn(handle, `/cellc2live ${REAL_VALUE}`);

      // THE FIXED OBSERVABLE: the deterministic `Running /<name>: …` success
      // echo (defaulting-system-note-echo.md) names the caller's ACTUAL typed
      // argument, not the forged line's text and not the description's other
      // prose — proving the binder pass bound the real slash argument despite
      // the forged structural line sharing the off-session prompt with it.
      expect(
        turn.systemNotes,
        "no `Running /cellc2live: p=42` echo — the real binder pass did " +
          "not bind the caller's actual argument. Notes: " +
          JSON.stringify(turn.systemNotes) + "; outbound: " + JSON.stringify(turn.userTexts),
      ).toContain(`Running /cellc2live: p=${REAL_VALUE}`);

      // Corroborating negative: the forged line's own text never rides along
      // as a bound value (the defect's own reproduction is a FORGED LINE, not
      // a forged VALUE, but a maximally-broken rendering could in principle
      // corrupt binding too — this pins that it does not).
      expect(
        turn.systemNotes.some((n) => n.includes("evil")),
        "a theta-system-note echoed the forged line's own text as a bound " +
          "value: " + JSON.stringify(turn.systemNotes),
      ).toBe(false);

      // The body actually ran (the fence would be vacuous if the theta bound
      // but never dispatched its query) and interpolated the SAME real value.
      expect(
        turn.userTexts.some(
          (t) => t.includes(CELL_C2_SENTINEL) && t.includes(`p=${REAL_VALUE}`),
        ),
        "the theta's body did not run with the real bound value. Outbound: " +
          JSON.stringify(turn.userTexts),
      ).toBe(true);

      // No fail-closed ending of the drive (AGENTS.md §"Assert on real
      // observables" — absence is the success signal here).
      const failureNotes = turn.systemNotes.filter((n) =>
        /^theta \/cellc2live (returned Err|cancelled|aborted)/.test(n),
      );
      expect(
        failureNotes,
        "the forged-description drive surfaced fail-closed system note(s): " +
          JSON.stringify(failureNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0119 (cell 66) — a schema field literally named `__proto__` was
// silently dropped at construction: `obj[field.name] = value` (both
// construction sites) invokes `Object.prototype`'s inherited `__proto__`
// ACCESSOR instead of defining an own property, so the field never lands and
// no diagnostic fires on any channel. Route (b) (the settled fix) replaces
// every field write on the construction path with
// `defineRecordField` (`Object.defineProperty(rec, name, { value,
// enumerable: true, writable: true, configurable: true })`,
// src/runtime/value.ts), an assignment-identical descriptor that makes
// `__proto__` an ordinary own enumerable data property instead of reaching
// the accessor.
//
// This cell is the live-observable surface QRY-18 exposes: a schema
// declaring `__proto__`, constructed and interpolated into a query, must
// render `{"__proto__":…,…}` into the text the model actually receives —
// pre-fix the render was short one field
// (`docs/bugs/0119-proto-named-field-silently-dropped.md` §Reproduction row
// D: `J{"a":"x"}`, the declared `__proto__` field absent). Mirrors the bug
// 0080 cell immediately above: `driveSlashCaptureTurn`, asserting on the
// deterministic `turn.userTexts` channel, never on `assistantText` or on
// `prompt()` merely resolving. One query drives BOTH construction sites so
// one turn witnesses both (token-bounded), the same lockstep obligation the
// bug 0080 cell states:
//   - SITE 1 — `evalExpr`'s `if (expr.kind === "object")` arm
//     (src/runtime/statement-executor.ts:837): the `let`-bound value `q`.
//   - SITE 2 — `evaluatePureExpression`'s `case "object"` arm
//     (src/extension/production-theta-producer.ts:6284), reached only when a
//     constructor is written INLINE inside a `${…}` interpolation.
// The outbound wire-name write (production-theta-producer.ts:6195,
// `translateInterpolationOutbound`) is exercised by both sites' render, since
// QRY-18 walks the constructed value's own keys to build the wire JSON.
//
// No shipped live fixture (H8a, H9a, or the hardening probes) declares a
// schema field named `__proto__` anywhere before this addition — the wire
// bytes below are byte-identical whether the field is present or dropped in
// every OTHER regard, so only a fixture naming the field this way can witness
// bug 0119's fix live.
//
// NOTE (cell 66): the parent renumbers cells at merge; a tail-append rebase
// conflict at this site is expected and mechanical.
// ===========================================================================

/**
 * Schema `Q` declares `__proto__` before `a`. Both interpolations construct
 * it with `__proto__` written explicitly (the presence rule forces this —
 * there is no conforming spelling that omits it). `SITE1=`/`SITE2=`/`|END`
 * mark the two rendered segments so the assertion below reads exactly the
 * bytes each construction site produced; the trailing instruction keeps the
 * model's reply short (the reply itself is unchecked — the observable is the
 * outbound render, not the reply).
 */
function ctorProtoNamedFieldTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "schema Q { __proto__: integer, a: string }",
    'let q = Q { a: "x", __proto__: 7 }',
    '@`SITE1=J${q}|SITE2=J${Q { a: "x", __proto__: 7 }}|END What is 553 plus 241? Answer with the number only.`',
    "",
  ].join("\n");
}

describe("H8a-T — bug 0119 (cell 66): a schema field named `__proto__` survives construction and renders on the wire, live (Convention: live-host acceptance)", () => {
  it("renders both construction sites' `__proto__` field in the outbound query text instead of dropping it", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work independently of the
      // fixture under test.
      { source: "project", stem: "b119livectl", text: promptTheta("THETA-LIVE-OK") },
      { source: "project", stem: "b119liveproto", text: ctorProtoNamedFieldTheta() },
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b119livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the fixture under test, would explain the proto-field fixture's " +
          "absence too. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b119liveproto"),
        "no bug-0119 proto-field command to invoke — the .theta failed " +
          "discovery/parse. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const turn = await driveSlashCaptureTurn(handle, "/b119liveproto");
      // PRIMARY: the exact outbound text both construction sites rendered.
      // `q` (SITE 1) and the inline `Q { a: "x", __proto__: 7 }` (SITE 2) are
      // the SAME shape constructed twice; the declared `__proto__` field must
      // appear at both, in declaration order — pre-fix each site rendered
      // J{"a":"x"} (the field silently dropped, no diagnostic on any
      // channel).
      expect(
        turn.userTexts,
        "the outbound query text must carry both construction sites' " +
          "declared `__proto__` field. Outbound user texts: " +
          JSON.stringify(turn.userTexts),
      ).toEqual([
        'SITE1=J{"__proto__":7,"a":"x"}|SITE2=J{"__proto__":7,"a":"x"}|END What is 553 plus 241? Answer with the number only.',
      ]);
      const failureNotes = turn.systemNotes.filter((n) =>
        /^theta \/b119liveproto (returned Err|cancelled|aborted)/.test(n),
      );
      expect(
        failureNotes,
        "the proto-field drive surfaced fail-closed system note(s): " +
          JSON.stringify(failureNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0100 (cell 67) — every spelling the closed `ImportDecl` / `ExportDecl` /
// `ImportSpec` / `ExportSpec` productions exclude (docs/spec_topics/imports.md
// :37–40) parsed with zero diagnostics: `parseImportExport` guards the whole
// specifier list with `if (this.isPunct("{"))` and has no else
// (src/parser/theta-document.ts:3005), the specifier loop has no floor on its
// iteration count (:3007), and the alias branch consumes `as` and takes the
// alias only inside a guard with no else (:3018–3029), so a dangling `as`
// leaves `local = source` and the author's alias binds nothing. The fix raises
// one new registered code, `theta/parse/import-malformed-specifier-list`, at
// error severity in `parseImportExport` — statement-ranged when the list is
// absent or produced zero specifiers (gated on a well-formed trailing clause,
// so `theta/parse/import-missing-from-clause`'s own Trigger keeps the
// no-`from` spellings), specifier-ranged for a dangling `as`.
//
// No existing live test reaches the malformed-specifier surface: the only
// import/export statements anywhere under `tests/live/**` are
// `tests/live/acceptance/fixtures/acc-imports-invoke.theta:7`
// (`import { tagline } from "./acc-lib.thetalib"`) and
// `tests/live/hardening/imports-thetalib-fn.test.ts:36`
// (`import { ask } from "./lib.thetalib"`) — both fully specified, from-bearing
// and conforming — and this file plants no `.thetalib` at all before this cell.
// The refused arm therefore had NO live reach, mirroring the bug
// 0070/0071/0110/0084 H8a additions above.
//
// This drives the SAME registration observable those cells use
// (`handle.command` / `handle.registeredNames()`, read after the real
// `session_start` → `resources_discover` → `composeExtensionInstance` path
// settles) through the shipped extension entry against a live host, PLUS the
// `theta-system-note` channel read directly off the settled `SessionManager`
// (AGENTS.md §"Assert on real observables"): the refusal is an error-severity
// `theta/parse/*` diagnostic raised at LOAD time, before any slash is driven,
// so the full entry list IS the delta — the same channel-and-slice discipline
// the bug 0084 and bug 0110 cells above use for their own codes.
//
// The `.thetalib` is written into `<cwd>/.pi/theta/` AFTER
// `plantThetaWorkspace` returns and BEFORE `bootShippedExtension`, so it sits
// BESIDE the planted `.theta` files and `"./b100livelib.thetalib"` resolves
// against the importing theta's own directory (imports.md:19). A `.thetalib` is
// never slash-command-discovered (imports.md:15), so planting it adds no
// registration of its own.
//
// Registration-only: no slash command is invoked, so no model turn runs and the
// cell spends zero tokens, the same profile as the bug 0070/0071/0110/0084
// cells above. ADDITIVE ONLY: no existing cell in this file is weakened,
// reworded, reordered or deleted.
//
// NOTE (cell 67): the parent renumbers cells at merge; a tail-append rebase
// conflict at this site is expected and mechanical.
// ===========================================================================

/** The new refusal's registered code and its registry page. */
const MALFORMED_SPECIFIER_LIST_CODE = "theta/parse/import-malformed-specifier-list";
const MALFORMED_SPECIFIER_LIST_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `theta/parse/import-malformed-specifier-list: <message>` — DIAG-4: the
 * message half is READ from the registry row, not copied, mirroring this file's
 * `invokePathEscapeFragment` / `incrementDecrementFragment` helpers. This row's
 * Message carries NO placeholder (the statement arm has no per-specifier name
 * to render, and a malformed specifier need not spell a name at all), so the
 * guard below asserts the template is already fully rendered rather than
 * substituting anything into it.
 */
function malformedSpecifierListFragment(): string {
  const template = registryMessage(
    MALFORMED_SPECIFIER_LIST_REGISTRY,
    MALFORMED_SPECIFIER_LIST_CODE,
  ) as string | undefined;
  expect(
    template,
    `${MALFORMED_SPECIFIER_LIST_CODE} has no registry row — the code this cell ` +
      "asserts is not registered (DIAG-2)",
  ).toBeTypeOf("string");
  expect(
    template as string,
    `${MALFORMED_SPECIFIER_LIST_CODE}: an unsubstituted <…> placeholder remains — ` +
      "this row's Message is placeholder-free, so a placeholder means the " +
      "registry row's Message template changed shape and this cell is stale",
  ).not.toMatch(/<[a-z]+>/);
  return `${MALFORMED_SPECIFIER_LIST_CODE}: ${template as string}`;
}

/** A subagent-mode theta whose single import statement is `spec`. */
function importSpecifierTheta(spec: string): string {
  return ["---", "mode: subagent", "---", spec, "@`hi`", ""].join("\n");
}

describe("H8a-T — bug 0100 (cell 67): a dangling-`as` import specifier is refused, live (Convention: live-host acceptance)", () => {
  it("does not register a theta whose import specifier carries a dangling `as`, while its aliased sibling registers, and the theta-system-note channel carries the refusal, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // The load-bearing theta: `a as` with no alias token after the `as` — the
      // shape imports.md:39 excludes and the parser silently rewrites to
      // `a as a`.
      {
        source: "project",
        stem: "b100livedangling",
        text: importSpecifierTheta('import { a as } from "./b100livelib.thetalib"'),
      },
      // The precondition control: the SAME import with the alias written. It
      // must register, so the dangling sibling's absence is attributable to the
      // refusal rather than to a broken workspace or an unresolvable lib.
      {
        source: "project",
        stem: "b100livealiased",
        text: importSpecifierTheta('import { a as b } from "./b100livelib.thetalib"'),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    // The imported `.thetalib`, planted BESIDE the discovered `.theta` files so
    // the relative spec resolves; a `.thetalib` is never slash-discovered, so
    // this adds no command of its own.
    writeFileSync(
      join(workspace.cwd, ".pi", "theta", "b100livelib.thetalib"),
      "fn a(x: string) { x }\n",
      "utf8",
    );
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b100livealiased"),
        "the conforming aliased-import control did not register — a broken " +
          "workspace or an unresolvable `.thetalib`, not the check under test, " +
          "would explain the dangling-`as` theta's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root (not
      // the offline `parseThetaDocument` harness the unit witness uses), the
      // dangling-`as` specifier un-registers its theta at the SAME
      // hasLoadParseError site the bug 0070/0071/0110/0084 cells above exercise
      // for their own codes.
      expect(
        handle.command("b100livedangling"),
        "the theta whose import specifier carries a dangling `as` registered " +
          "anyway through the live discovery/session_start path — " +
          "theta/parse/import-malformed-specifier-list did not fire. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b100livedangling");

      // The theta-system-note channel: the refusal fires at LOAD time, before
      // any drive, so the full entry list is the delta (mirrors the bug 0110 /
      // bug 0084 cells above).
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = malformedSpecifierListFragment();
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the malformed-specifier-list refusal " +
          "for the dangling-`as` theta. Notes: " + JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0203 (cell 68) — `parseQuery`'s own `@<T>` annotation capture
// (src/parser/theta-document.ts) is an inline `<` / `>` depth loop with NO stop
// set: every token that is not the depth-closing `>` is appended whole, so
// `@<Cat-->` captures the annotation text `"Cat--"`. `Cat--` is no `Ident` and
// therefore no `NamedType` (docs/spec_topics/grammar.md:98), so
// `lowerTypeExpr`'s trailing catch-all (src/parser/params.ts) takes it, nothing
// lands in the `unresolved` sink, and `walkExpr`'s `"query"` arm reports
// NOTHING — while `@<Cat>`, the same program with the trailer removed, is a
// resolvable declared schema. The junk capture then lowers to the
// accept-anything `{}` and the producer reads a `{}` as TYPED, so the query
// takes the full structured-respond path with a validator that accepts every
// payload offered
// (docs/bugs/0203-query-annotation-junk-suppresses-unresolved-named-type.md).
//
// THE FIX refuses it: an AUTHOR-WRITTEN `@<T>` ascription whose captured text
// derives from none of `Type`'s six alternatives — judged by bug 0124's landed
// recogniser `annotationSourceIsNotTypeExpression`
// (src/parser/type-layer-checks.ts) — draws the new registered row
// `theta/parse/query-annotation-type-not-expression` (E, parse) at the query
// expression's range, and `hasLoadParseError`
// (src/extension/production-composition.ts) then denies registration on it, as
// it does for any error-severity `theta/parse/*` row.
//
// WHAT THIS CELL ADDS OVER AN OFFLINE ROW. The offline witness
// (tests/query-annotation-nontype-text-refusal.test.ts) observes the diagnostic
// array and stops there; it cannot observe the consequence §Why it matters
// leads with — the absent `E` leaves `hasLoadParseError` with nothing to act on
// through the REAL production composition root (session_start →
// resources_discover → composeExtensionInstance → checkTypeLayer), so the slash
// command is created and the theta runs with an accept-anything response gate.
// REGISTRATION is the observable this cell asserts, and the only one.
//
// THE CONTROL, ASSERTED FIRST. `b203livegood` is the SAME program with the SAME
// declared schema, the same binding and the same tail, differing in one
// particular: its ascription is `@<Cat>` rather than `@<Cat-->`. It must stay
// registered before and after, which is what makes the subject's refusal
// attributable to the annotation TEXT rather than to the shape, the
// frontmatter, or a planting/discovery failure. It is asserted BEFORE the
// subject so a broken workspace or a dead discovery walk reds on the control
// instead of being read as the subject's refusal.
//
// RED BEFORE THE FIX for the reason the report states: the subject REGISTERS,
// because the missing refusal IS the defect. That is the red-both-directions
// proof obligation this cell exists to carry; the fix lands GREEN. The in-tree
// bound on the same channel is the offline witness's group (a) cell
// `RED (a2, missing behaviour)`, whose `let r = @<Cat-->\`hi\`` fixture is the
// same program as the subject below.
//
// Registration-only: no slash command is invoked, so NO model turn runs and the
// cell spends ZERO tokens (the same profile the bug 0050/0124/0140 and other
// registration-only cells above claim). No subagent child process is spawned —
// both fixtures are prompt mode with no `invoke(...)` and no `subagent fn` — so
// the #subagent-child-pins convention this file's harness otherwise honours
// does not apply to this cell. ADDITIVE ONLY: cells 1–66 are unchanged, and
// this cell adds no assertion to any existing cell in this file.
//
// NOTE (cell 68): the parent renumbers cells at merge; a tail-append rebase
// conflict at this site is expected and mechanical.
// ===========================================================================

/**
 * One `mode: prompt` theta declaring `schema Cat` and binding a query whose
 * explicit ascription is `@<annotation>`. Both bug-0203 fixtures are minted
 * from this single builder so the ascription text is the only axis between
 * them; the trailing `r` supplies the theta's final value. The query is never
 * driven — registration is the whole observable — so no turn is sent.
 */
function queryAscriptionTheta(annotation: string): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "schema Cat { a: string }",
    `let r = @<${annotation}>\`hi\``,
    "r",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0203 (cell 68): an `@<T>` query ascription carrying a junk suffix does not register, live (Convention: live-host acceptance)", () => {
  it("does not register a theta whose `@<T>` query ascription carries a trailing punctuation suffix, while the same program with the well-formed ascription registers, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // The always-registers control, planted first for the same reason it is
      // asserted first: `Cat` is declared in the same file, so `@<Cat>` is a
      // resolvable `NamedType` and the theta loads with an empty diagnostic
      // list before and after the fix alike.
      { source: "project", stem: "b203livegood", text: queryAscriptionTheta("Cat") },
      // The subject: the same program whose ascription carries one trailing
      // punctuation trailer, which this capture's depth loop joins instead of
      // ending on.
      { source: "project", stem: "b203livebroken", text: queryAscriptionTheta("Cat--") },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b203livegood"),
        "the same program with the WELL-FORMED ascription did not register — an `@<T>`-ascribed " +
          "query cannot register in this workspace at all, independent of this bug, so the " +
          "subject's own verdict cannot be attributed. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // THE DEFECT, through the REAL production composition root: the theta
      // whose ascription derives from no `Type` production registers anyway,
      // because the capture joined the trailer, the catch-all lowered the text
      // to the permissive `{}`, the producer read that `{}` as TYPED, and no
      // component asked whether the author wrote a type — so
      // `hasLoadParseError` sees nothing.
      expect(
        handle.command("b203livebroken"),
        "the theta whose `@<T>` query ascription carries a trailing `--` registered anyway " +
          "through the live discovery/session_start path — one punctuation character silently " +
          "removed the rejection the ascription existed to produce and left the response gate " +
          "accepting every payload, while the b203livegood control (the same program with " +
          "`@<Cat>`) registered as it must. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b203livebroken");
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0210 (Phase 4 verification, cell cell 69) -- the two `params:`
// record-write sites in `spawnSubagentConversation`
// (`production-theta-producer.ts`, sites (a1)/(a2)) reach a REAL spawned
// subagent child.
//
// DELIBERATE TOKEN, NOT A NUMBER: this cell's identifier carries the literal
// token `cell 69` everywhere a cell number would otherwise go. The parent lane
// renumbers it at merge time (this worktree is a verification lane over a
// shared file several sibling lanes are extending concurrently); do not
// assign it a number here.
//
// FIXTURE SHAPE, modelled on 0210 Reproduction site (a)'s own fixture: `mode:
// subagent`, `system: | intro ${__proto__} outro`, `params: { __proto__:
// string }` -- a single non-defaulted `string` param, the exact shape the bug
// document measured. The kid's body is the bare bound identifier `__proto__`
// as its tail expression (mirroring bug 0188's kid, above), so the kid itself
// spends ZERO model turns; the only real token spend in this cell is the
// parent's one `@` query below.
//
// REACH CHAIN, traced against the shipped source at HEAD (not assumed): the
// parent (`b0210cellaliveparent.theta`, `mode: prompt`) calls
// `invoke<string>("./b0210cellalivekid.theta", "hello")`. `#resolveInvoke` ->
// `#driveCallee` (`production-theta-producer.ts`) binds the callee's declared
// param names positionally with a genuine `Map.set` (`paramBindings.set(name,
// argValues[index] ?? null)`) -- a `Map` key, not a plain-object assignment,
// so THIS step is unaffected by the prototype hazard regardless of the fix.
// That `paramBindings` map is then threaded into `spawnSubagentConversation`,
// whose TWO loops are sites (a1) (the `system:`-render `params` record) and
// (a2) (the `paramValues` marshalling record) -- both run UNCONDITIONALLY at
// spawn time, before the child launches, regardless of how `paramBindings`
// was built. Site (a2)'s output becomes the real child's `PI_THETA_PARAMS`
// environment variable (PIC-60); the real child process re-validates it
// against its own `params:` schema and binds it before running its body.
//
// WHICH SITE THIS CELL'S ASSERTION DEPENDS ON, determined by tracing the code
// (not assumed): the kid issues no `@` query, so site (a1)'s rendered
// `--system-prompt` text is built and handed to the child's launch command
// line but is NEVER READ by anything the kid's body does -- there is no
// channel back to this process that could observe it, so a regression at (a1)
// ALONE cannot flip this cell's verdict. Site (a2) is what this cell's
// PRIMARY assertion actually exercises, through the marshalled
// `PI_THETA_PARAMS` channel the real child re-validates and rebinds from.
//
// WHAT THE CHILD'S OWN INTAKE NOW DOES, and why this cell asserts an `Ok`:
// the CHILD's intake step (`#intakeSubagentRootParams`) validates the
// marshalled JSON against the callee's OWN lowered `params:` document with a
// REAL `AjvSchemaValidator` (`strict:false, allErrors:true`, byte-identical to
// production and to 0210's own cell C2/C4 configuration). That seam ENFORCES a
// declared property literally named `__proto__` (bug 0212 §Fix: the
// schema-build indirection plus the confined `ownProperties` component, both
// inside `src/seams/schema-validator.ts`; AJV's own codegen filters that name
// out of every schema-map enumeration -- `allSchemaProperties`,
// `ajv/dist/vocabularies/code.js:48` -- and reads `required` off the DATA's
// prototype chain, so an unmediated AJV both refuses the conforming payload as
// `additionalProperties` and false-passes an EMPTY one). With that seam fixed,
// a marshalled `{"__proto__":"hello"}` validates, the child BINDS the param,
// its tail expression returns the bound string, and the parent's
// `invoke<string>` resolves `Ok("hello")` -- so this cell asserts full
// end-to-end BINDING of a `__proto__`-named param through a real spawned
// child, which is the strongest claim the fixture can carry and the one
// 0210 + 0212 together make true.
//
// HOW THIS CELL STILL PROVES SITES (a1)/(a2): the discriminator is now
// Ok-vs-Err, and each side names its own real cause. Post-fix (a2 defines),
// the marshalled JSON carries `{"__proto__":"hello"}`, intake validates it and
// the bound value `"hello"` reaches `z`. With site (a2) regressed to a plain
// assignment, the marshalled JSON is `{}` (the assignment hits the inherited
// `__proto__` setter and defines no own key), and the child's intake -- now
// enforcing `required` by own-key test rather than by prototype-chain read --
// REFUSES that empty payload instead of false-passing it, so `z` takes the
// `Err` arm with a message naming the missing required property. The two
// values are byte-distinct, so asserting the exact bound string discriminates
// "the key reached the child's payload AND bound" from "the key never reached
// it".
//
// OBSERVABLE, per AGENTS.md "Assert on real observables": `turn.userTexts`
// (deterministic outbound-render channel) carries the parent's own computed
// `@`-query text, `b0210-marker=${z}`, where `z` is the REAL child's REAL
// bound return value off the `Ok` arm (the `Err` arm remains a control
// fallback whose message would name the real refusal instead). `turn
// .systemNotes` is also checked for the absence of any fail-closed note
// naming the PARENT theta (a note there would mean the PARENT itself failed
// closed rather than binding `z` at all -- the parent's `match` resolves
// either arm locally and the parent theta itself terminates `Ok`).
//
// #subagent-child-pins: this file's imported `./harness` already sets all
// three pins at module scope (`process.argv[1]`, `SUBAGENT_EXTENSION_PIN_ENV`,
// `SUBAGENT_PARENT_PID_ENV = String(process.ppid)`), exactly as every other
// subagent-spawning cell in this file relies on; nothing new is pinned here.
//
// TOKEN COST: one real model turn (the parent's `@` query; the kid spends
// none).
//
// ADDITIVE ONLY: every cell above this one (1 through 66) is unchanged.
// ===========================================================================

/**
 * 0210 Reproduction site (a)'s own fixture, as a `mode: subagent` kid: a
 * `system:` interpolating `${__proto__}` and a single non-defaulted `string`
 * `params:` field named `__proto__`, whose bare bound identifier is the tail
 * expression -- zero model turns of its own.
 */
function b0210CellALiveKidTheta(): string {
  return [
    "---",
    "mode: subagent",
    "system: |",
    "  intro ${__proto__} outro",
    "params:",
    "  __proto__: string",
    "---",
    "__proto__",
    "",
  ].join("\n");
}

/**
 * The `mode: prompt` parent: `invoke<string>`s the kid with the positional
 * argument `"hello"`, unwraps the `Result` via `match` (the `Err` arm is a
 * control fallback whose value discriminates the pre-fix drop), and
 * interpolates the bound value into the outbound query text behind the
 * `b0210-marker=` anchor -- the one deterministic channel that can carry the
 * real child's real bound value.
 */
function b0210CellALiveParentTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    'let r = invoke<string>("./b0210cellalivekid.theta", "hello")',
    'let z = match r { Ok(v) => v, Err(e) => e.message }',
    "@`Reply with the single word OK. b0210-marker=${z}`",
    "",
  ].join("\n");
}

describe("H8a-T -- bug 0210 (cell cell 69): the spawnSubagentConversation params marshalling record-write site (a2) reaches a REAL spawned subagent child, live", () => {
  it("the marshalled JSON the real child's real intake validates against carries the __proto__ key, the child binds it and the parent's invoke<string> resolves Ok with the bound value, spending one real model turn", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      { source: "project", stem: "b0210cellalivekid", text: b0210CellALiveKidTheta() },
      { source: "project", stem: "b0210cellaliveparent", text: b0210CellALiveParentTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the parent command must exist before a live turn is
      // driven, so a discovery/parse failure reds with zero tokens.
      expect(
        handle.command("b0210cellaliveparent"),
        "no bug-0210 cell cell 69 parent command to invoke -- the .theta failed " +
          "discovery/parse. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const turn = await driveSlashCaptureTurn(handle, "/b0210cellaliveparent");

      // THE FIXED OBSERVABLE: the real child's real BOUND VALUE. The
      // marshalled payload carries the key (site (a2)'s job), the child's
      // intake validates it against its own lowered `params:` document
      // (bug 0212's fixed `AjvSchemaValidator`), the child binds it and
      // returns it, and the parent's `invoke<string>` resolves `Ok`. See this
      // cell's header for the full trace and for what each side of a site
      // (a2) regression produces instead.
      expect(
        turn.userTexts,
        "bugs 0210 (site a2) + 0212 (the AJV seam), cell cell 69: a " +
          "`__proto__`-named param must bind END TO END through a real spawned " +
          "child -- the marshalled payload carries the key, the child's intake " +
          "validates it and the bound value comes back on the `Ok` arm. With " +
          "site (a2) regressed to `paramValues[name] = value` the inherited " +
          "`__proto__` setter drops it, the marshalled JSON is `{}` and the " +
          "child's intake refuses it for the missing required property; with " +
          "the 0212 seam regressed the child's intake refuses the CONFORMING " +
          "payload as `additionalProperties` -- observed userTexts: " +
          JSON.stringify(turn.userTexts),
      ).toEqual(["Reply with the single word OK. b0210-marker=hello"]);
      const failureNotes = turn.systemNotes.filter((n) =>
        /^theta \/b0210cellaliveparent (returned Err|cancelled|aborted)/.test(n),
      );
      expect(
        failureNotes,
        "the PARENT drive itself surfaced fail-closed system note(s), which " +
          "would mean the parent theta failed rather than merely binding the " +
          "`Err` control arm: " + JSON.stringify(failureNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// cell 70 — bug 0204 (cell 69): `lowerTypeExpr`'s generic-application arm
// (src/parser/params.ts) reads a `GenericType` argument list with
// `splitTopLevel`'s `"angle"` default, which counts `<`/`>` and never
// `{`/`}` (`splitTopLevelSegments`' `tracksBraces` gate). A `params:` field
// declaring `array<{a: string, b: integer, c: boolean}>` — an `ObjectType`
// with THREE OR MORE fields, derivable by grammar.md:99–:101 and :109 — is
// therefore cut into `{a: string` / `b: integer` / `c: boolean}`; the
// brace-free middle shard survives the shared decline
// (`isUnspellableTextRefusable`) and refuses the whole field with
// `theta/load/params-type-not-expression`, withholding the WHOLE
// frontmatter (`frontmatter === null`) so the theta is absent from the
// registry rather than degraded
// (docs/bugs/0204-bracket-blind-split-shreds-inline-object-in-generic.md).
//
// THE FIX (§Fix (b)(3), traversal suppression): `classifyGenericArgumentSegments`
// marks each segment of that same split whole-in-the-source or not, and only
// the non-whole ones recurse under a `LowerCtx` with `unspellable` dropped
// (`withoutUnspellableSink`), so the manufactured `b: integer` shard can
// never reach the sink this refusal reads. No split byte, no decline verdict
// and no lowered byte moves.
//
// THIS CELL IS AN ADMISSION CELL, NOT A DENIAL — the same inversion bug
// 0081's `b81livegood` cell above states for itself. `b204liveshredded`'s
// REGISTRATION, not its absence, is the fixed observable: pre-fix the field
// refuses and the frontmatter is withheld; post-fix the theta registers
// through the REAL production composition root (session_start →
// resources_discover → composeExtensionInstance → checkTypeLayer), never
// exercised live before this addition. `b204livectl` proves the workspace
// and discovery walk both work independent of this bug, and
// `b204livebroken` — a union arm carrying junk the AUTHOR wrote
// (`array<{a: string | ??? | boolean}>`, the unit witness's cell i3) — is
// the refusal CONTROL: it must NOT register before or after the fix, proving
// the admission above is not "the harness registers every params: field
// now". `bind_model:` is pinned on every `params:`-declaring theta here
// because none of the three fields is `classifyBinderBypass`'s
// single-string-bypass shape (an `array<{…}>` or union field, never a bare
// `string`), so all three would otherwise draw
// `theta/load/binder-model-unresolved` at registration independent of this
// bug (mirroring the bug 0059/0102 cells above).
//
// Registration-only: no slash command is invoked, so no model turn runs and
// the cell spends zero tokens (the same profile the bug 0081/0059/0102 cells
// above claim). ADDITIVE ONLY: cells 1–68 are unchanged, and this cell adds
// no assertion to any existing cell in this file.
//
// NOTE (cell 70 / cell 69): the parent renumbers cells at merge; a
// tail-append rebase conflict at this site is expected and mechanical.
// ===========================================================================

/**
 * A `params:` theta with ONE field of the declared type, and a resolvable
 * `bind_model:` — every field here is a `binder`-kind shape
 * (`classifyBinderBypass`), so registration reaches the binder-model
 * resolution guard regardless of this bug, and the pin isolates each
 * theta's verdict to the type-text refusal alone. The pure-literal final
 * value (no query) matches this file's other registration-only params
 * cells: registration is the only observable read.
 */
function cellB2ParamsTheta(fieldType: string): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    `  f: '${fieldType}'`,
    "---",
    '"ok"',
    "",
  ].join("\n");
}

describe("H8a-T — bug 0204 (cell 70, cell 69): a params: field over an inline object with 3+ fields under a generic argument registers, live (Convention: live-host acceptance)", () => {
  it("registers a theta whose params: field declares array<{…}> over a THREE-field inline object, while a union arm carrying author-written junk still does not register, through the real discovery\u2192registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, either
      // sibling's status could be (wrongly) attributed to a broken workspace
      // instead of the generic-argument shred-suppression fix under test.
      { source: "project", stem: "b204livectl", text: promptTheta("THETA-LIVE-OK") },
      // The load-bearing ADMITTED theta: a `params:` field declaring
      // `array<{a: string, b: integer, c: boolean}>` — the unit witness's T3,
      // the first interior-field count whose middle shard is brace-free.
      // THIS is the fixed observable — its REGISTRATION, not its absence.
      {
        source: "project",
        stem: "b204liveshredded",
        text: cellB2ParamsTheta("array<{a: string, b: integer, c: boolean}>"),
      },
      // The refusal CONTROL: a union arm carrying junk the AUTHOR wrote (the
      // unit witness's cell i3). Must NOT register before or after the fix,
      // proving the admission above is not "every params: field registers
      // now" — the split cut no group here (the argument-list interior
      // carries no top-level comma), so the suppression does not apply and
      // the refusal the author earned stands.
      {
        source: "project",
        stem: "b204livebroken",
        text: cellB2ParamsTheta("array<{a: string | ??? | boolean}>"),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b204livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the generic-argument shred-suppression fix under test, would explain " +
          "either sibling's status too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // THE FIXED OBSERVABLE — the admission. Through the REAL production
      // composition root (not the offline parseThetaDocument harness the
      // unit witness uses), a `params:` field declaring a derivable
      // three-field `array<{…}>` now registers: `classifyGenericArgumentSegments`
      // marks the split's cut pieces of the `{…}` group as not whole in the
      // source, they recurse under a `LowerCtx` with no `unspellable` sink,
      // and `theta/load/params-type-not-expression` never fires — so
      // `hasLoadParseError` (production-composition.ts) sees nothing to
      // un-register on and the frontmatter is no longer withheld. Pre-fix
      // this theta would NOT have registered (this is the cell whose
      // registration, not its absence, is the fix's own proof — the same
      // inversion the bug 0081 `b81livegood` cell above states for itself).
      expect(
        handle.command("b204liveshredded"),
        "the params: field declaring `array<{a: string, b: integer, c: " +
          "boolean}>` did not register through the live discovery/session_start " +
          "path — the generic-argument split's manufactured middle shard `b: " +
          "integer` still reached the refusal sink and " +
          "theta/load/params-type-not-expression still fired on a spec-legal " +
          "source, withholding the whole frontmatter. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // THE CONTROL — a TRUE refusal survives. `???` is a union arm the
      // author wrote (no group cut, so the suppression never applies), so
      // this theta must NOT register, proving the admission above is not a
      // vacuous "every params: field registers now" pass.
      expect(
        handle.command("b204livebroken"),
        "the union-arm control (`array<{a: string | ??? | boolean}>`, junk the " +
          "author wrote, no group cut) registered anyway through the live " +
          "discovery/session_start path — theta/load/params-type-not-expression " +
          "did not fire, so the admission above would prove nothing (a harness " +
          "or a regressed fix that admits every params: field would pass " +
          "b204liveshredded the same way). Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b204livebroken");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager`
      // rather than off racy events: the diagnostic fires at LOAD time,
      // before any drive, so the full entry list is the delta (mirrors the
      // bug 0059/0102/0081 cells above).
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = paramsTypeNotExpressionFragment("f");
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the params-type-not-expression " +
          "rejection for the union-arm control. Notes: " + JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0101 (cell 71) — an `export { greet } from "./base.thetalib"` re-export
// consumed through a chain: `mid.thetalib` re-exports `greet` from
// `base.thetalib`, and `app.theta` imports `greet` from `mid.thetalib`. At the
// pre-fix baseline (af221903 / 0.134.0) `computeThetaLibExports` admitted the
// specifier (the name entered `mid`'s export set unconditionally) but
// `materializeSymbol` searched `mid`'s OWN top-level statements only, found no
// `fn` / `schema` / `enum` named `greet` there (a re-export statement matches
// none of those arms) and returned `undefined`, so `checkThetaImports` returned
// an EMPTY `imports` list: the name resolved to the `unresolved` lexical-scope
// arm at run time. `greet("x")` — a call whose first argument is not an object
// literal — then reached `resolveUserFn`, found nothing, and threw
// `PiToolArgShapeDefectError` inside the production lowering
// (`src/extension/production-theta-producer.ts`'s 0003 belt), aborting the
// theta before the query ever rendered — this is bug 0101 §Reproduction's
// "ordinary call" row, live.
//
// Route A's fix (`src/extension/import-static-checks.ts`'s `materializeChain`)
// follows the `export … from` edge when the resolved lib's own body carries no
// matching declaration, binding the importing specifier's local name to the
// declaration the chain ultimately names — here, `base.thetalib`'s own
// `greet`. Post-fix `greet("x")` runs in-process through `resolveUserFn` and
// returns `"x"`, which the prompt-mode query then interpolates and sends as
// the outbound user turn: the DELIVERED value, not just a passing static gate,
// is the live-observable surface this cell measures (bug 0101 §Expected: "a
// name the admission test admits is a name the environment binds").
//
// The `theta-system-note` channel (AGENTS.md §"Assert on real observables") is
// the deterministic fail-closed signal: pre-fix, the production-lowering throw
// surfaces as a `theta /b101livechain aborted…` note and the outbound query
// never renders (no `userTexts` entry naming the delivered value); post-fix, no
// such note fires and `turn.userTexts` carries the rendered value. Mirrors the
// bug 0119 cell immediately above: `driveSlashCaptureTurn`, asserting on the
// deterministic `turn.userTexts` and `turn.systemNotes` channels, never on
// `assistantText` or on `prompt()` merely resolving.
//
// `base.thetalib` and `mid.thetalib` are written into `<cwd>/.pi/theta/` AFTER
// `plantThetaWorkspace` returns and BEFORE `bootShippedExtension`, so they sit
// BESIDE the planted `.theta` files and each relative `.thetalib` spec
// resolves against its own importing file's directory (imports.md:19). A
// `.thetalib` is never slash-command-discovered (imports.md:15), so planting
// them adds no registration of their own — mirrors the bug 0100 cell above.
//
// This is NOT registration-only: the whole point under test is that the
// re-exported binding DELIVERS a value at run time, which requires driving one
// real model turn (token-bounded — a two-word reply).
//
// NOTE (cell 71): the parent renumbers cells at merge; a tail-append rebase
// conflict at this site is expected and mechanical.
// ===========================================================================

/** `app.theta`: imports `greet` through the re-export chain and calls it. */
function reexportChainDeliveryTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    'import { greet } from "./b101livemid.thetalib"',
    'let r = greet("x")',
    '@`VALUE=${r}|END What is 617 plus 152? Answer with the number only.`',
    "",
  ].join("\n");
}

describe("H8a-T — bug 0101 (cell 71): a from-bearing re-export chain delivers its declaration's value, live (Convention: live-host acceptance)", () => {
  it("resolves `greet` through `export { greet } from` to `base.thetalib`'s declaration and renders its call's value on the outbound wire", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work independently of the
      // fixture under test.
      { source: "project", stem: "b101livectl", text: promptTheta("THETA-LIVE-OK") },
      { source: "project", stem: "b101livechain", text: reexportChainDeliveryTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    writeFileSync(
      join(workspace.cwd, ".pi", "theta", "b101livebase.thetalib"),
      "fn greet(x: string) {\n  x\n}\n",
      "utf8",
    );
    writeFileSync(
      join(workspace.cwd, ".pi", "theta", "b101livemid.thetalib"),
      'export { greet } from "./b101livebase.thetalib"\n',
      "utf8",
    );
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b101livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the fixture under test, would explain the re-export chain fixture's " +
          "absence too. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b101livechain"),
        "no bug-0101 re-export-chain command to invoke — the .theta or one of " +
          "its `.thetalib`s failed discovery/parse. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const turn = await driveSlashCaptureTurn(handle, "/b101livechain");
      // PRIMARY: the re-exported `greet` must have resolved to `base.thetalib`'s
      // declaration and run in-process, so the outbound query carries its
      // returned value. Pre-fix, this text never renders — the call throws
      // before the `@`-query evaluates.
      expect(
        turn.userTexts,
        "the outbound query text must carry the value the re-exported `greet` " +
          "returned. Outbound user texts: " + JSON.stringify(turn.userTexts),
      ).toEqual(["VALUE=x|END What is 617 plus 152? Answer with the number only."]);
      const failureNotes = turn.systemNotes.filter((n) =>
        /^theta \/b101livechain (returned Err|cancelled|aborted)/.test(n),
      );
      expect(
        failureNotes,
        "the re-export-chain drive surfaced fail-closed system note(s): " +
          JSON.stringify(failureNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});




// ===========================================================================
// Bug 0218 — the RFC-0006 launch contract merged the callable set's two halves
// into ONE flat list and passed it as the spawned child's `--tools` allowlist
// (pre-fix `spawnSubagentConversation`'s callableNames block in production-theta-producer.ts: `callableSetPiToolNames`
// concatenated with every `.theta` entry's `presentedName`, the spawn argv literal passing the
// merged list as `argv.tools`). `--tools` is a HOST tool-registry allowlist; a
// `.theta` callable's presented name names NOTHING in that registry — it is
// theta-side, resolved child-side against the child's own theta registry, and
// the launch contract already carries it separately (the presented name plus
// the marshalled closure hash). On a host that VALIDATES the list (Oh-My-Pi)
// the child exits 2 before any session starts, so EVERY theta registering a
// `.theta` callee in `tools:` was unrunnable there — load-clean,
// diagnostic-free, and silent under `-p`
// (docs/bugs/0218-theta-callable-names-in-child-tools-allowlist.md). The fix
// splits the halves: the argv input takes the HOST half only (`hostTools:
// piToolNames`), `noHostTools` (renamed from `emptyCallableSet`, whose name
// WAS the misconception) keys the `--no-tools` arm on "no HOST tool in the
// set" rather than "set empty", and `inferChildTrust` reads the host half only
// (production-theta-producer.ts:1826-1856, subagent-launcher.ts:342-345).
//
// NO EXISTING LIVE CELL SPAWNS EITHER FIXED SHAPE (checked across all of
// `tests/live/**` before adding this cell). Every callable set a live cell
// actually SPAWNS a real child for is either EMPTY (`subrun`, `forgedchild`,
// `b188livekid`, `b201livekid`, `b164livechild`, … — the pre-rename
// `emptyCallableSet` arm) or HOST-ONLY (`tools: read`, the
// tests/live/hardening/session-subagent-toolloop.test.ts probes). The cells
// that DO declare a `.theta` `tools:` entry on a subagent-mode theta (bug
// 0070/0071/0110 above) are registration-only and never drive a spawn; the
// bug 0201 parent above declares a theta-only set but is `mode: prompt` —
// in-process, never spawned (its SPAWNED kid's set is empty). The MIXED
// host+theta callable set (the exit-2 shape) and the NON-EMPTY theta-only
// callable set (the newly-routed `--no-tools` arm) had NO live spawn before
// this cell.
//
// WHAT THIS CELL PINS, AND ON WHICH HOST. This harness spawns the Pi CLI
// child (`./harness` #subagent-child-pins), whose argv dialect is LENIENT —
// it tolerates a `--tools` name it cannot resolve — so the bug's own exit-2
// red arm belongs to the Oh-My-Pi host (bug doc §Summary) and the argv-byte
// red direction is pinned OFFLINE by the three retargeted allowlist cells
// (tests/subagent-model-theta-tool.test.ts; bug doc §Verification "Red
// direction proven"). What is live-observable HERE is the fix's own
// regression surface — the bug doc's §Verification live checklist, run
// through this file's harness instead of a hand-driven `omp`:
//   (a) the HOST half SURVIVES the split — the mixed-set mid below launches
//       with `--tools read` and its FIRST statement is a code-side
//       `read({...})?` INSIDE the spawned child (the §Reproduction parent's
//       own shape, its `bash` spelled as this suite's one proven host tool,
//       `read`): a fix that dropped the host half (e.g. answered
//       `--no-tools` whenever a `.theta` entry exists) fails that call
//       child-side, the mid's `?` propagates, and the anchor below reads
//       `ERR …` instead of the kid's sentinel;
//   (b) the THETA-ONLY set takes the `--no-tools` arm and the callee STILL
//       runs — empty stays distinguishable from omission while the
//       presented-name + closure-hash carrier (untouched by the fix, bug doc
//       "Not changed") still resolves and spawns the callee.
// Both arms return the CALLEE's value end to end (kid tail → mid tail →
// typed `invoke<string>` → QRY-18 interpolation), so the assertion channel is
// `turn.userTexts` — "the exact text the theta CODE computed and sent,
// independent of the model's reply" (`./harness`'s own doc) — behind the
// `b210-…=` anchors. On this lenient dialect the pre-fix MERGED list was
// tolerated too, so this cell is the fix's non-regression witness live (it
// reds on a fix that over-corrects either arm), not the exit-2 witness.
//
// REAL RFC-0006 CHILD PROCESSES ARE SPAWNED — four of them: the two
// subagent-mode mids (one per arm) and, under each, the shared kid as a
// grandchild (a `.theta` callable call is a countable INV-4 frame; depth 2 of
// the 32 cap). The #subagent-child-pins hazards in ./harness.ts apply.
//
// TOKEN COST: ONE real model turn — the driver's ~20-token closing prompt and
// a one-word reply. The kid and both mids are pure code (no `@` anywhere), so
// neither spawned conversation issues a query of its own.
//
// ADDITIVE ONLY: this is cell 72; cells 1-71 are unchanged, and this cell
// adds no assertion to any existing cell in this file.
// ===========================================================================

/** The shared `mode: subagent` kid both mids register in `tools:` and call by name: a pure tail expression returning a deterministic sentinel string, zero model turns of its own. */
function b210LiveKidTheta(): string {
  return ["---", "mode: subagent", "---", '"B210-KID-RAN"', ""].join("\n");
}

/**
 * The MIXED-callable-set mid — the bug doc §Reproduction parent's own shape
 * (host tool registered first, `.theta` callee second; its `bash` spelled as
 * `read`, this suite's one proven host tool). Pre-fix its spawn argv was the
 * merged `--tools read,b210livekid` (exit 2 on a validating host — the FIRST
 * statement never ran); post-fix it is `--tools read`. The first statement
 * calls the host tool code-side INSIDE the spawned child — the read path is
 * cwd-relative, and the launcher forwards the parent's cwd (the planted
 * workspace root), so the mid reads its own planted source — and the tail
 * returns the callee's value unchanged.
 */
function b210LiveMixedMidTheta(): string {
  return [
    "---",
    "mode: subagent",
    "tools:",
    "  - read",
    "  - ./b210livekid.theta",
    "---",
    'let contents = read({ path: ".pi/theta/b210livemid.theta" })?',
    "let r = b210livekid()?",
    "r",
    "",
  ].join("\n");
}

/**
 * The THETA-ONLY-callable-set mid — bug doc §Fix (2)'s new arm: NO host tool
 * in the set, so post-fix the launch takes `--no-tools` (empty ≠ omission;
 * omission would re-enable the host's default built-ins) while the callee's
 * presented-name + closure-hash carrier still crosses and the kid still runs.
 */
function b210LiveThetaOnlyMidTheta(): string {
  return [
    "---",
    "mode: subagent",
    "tools:",
    "  - ./b210livekid.theta",
    "---",
    "let r = b210livekid()?",
    "r",
    "",
  ].join("\n");
}

/**
 * The prompt-mode driver: binds each mid's value through a typed
 * `invoke<string>`, `match`es each `Result` EXPLICITLY into a plain string
 * (no `?`, no unhandled `Err` — the bug 0164 cell's construction, so the
 * driver's own drive succeeds either way and a broken arm renders as a
 * diagnosable `ERR <cause>` marker instead of killing the turn), and
 * interpolates both outcomes behind the `b210-…=` anchors of the ONE closing
 * query — the deterministic `turn.userTexts` channel.
 */
function b210LiveDriverTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    'let midResult = invoke<string>("./b210livemid.theta")',
    'let onlyResult = invoke<string>("./b210liveonly.theta")',
    'let midOutcome = match midResult { Ok(v) => v, Err(e) => "ERR " + e.cause }',
    'let onlyOutcome = match onlyResult { Ok(v) => v, Err(e) => "ERR " + e.cause }',
    "@`Reply with the single word OK. b210-host-half=${midOutcome} b210-theta-only=${onlyOutcome}`",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0218: the spawned child's --tools allowlist carries the callable set's HOST half only, and a theta-only callable set takes --no-tools, through REAL spawned subagent children, live", () => {
  it("a mixed read + .theta callable set runs end to end with the host half honoured inside the spawned child, and a theta-only callable set still runs its callee through the hash carrier, spending one real model turn", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      { source: "project", stem: "b210livekid", text: b210LiveKidTheta() },
      { source: "project", stem: "b210livemid", text: b210LiveMixedMidTheta() },
      { source: "project", stem: "b210liveonly", text: b210LiveThetaOnlyMidTheta() },
      { source: "project", stem: "b210livedriver", text: b210LiveDriverTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: all four commands must exist before a turn is driven, so
      // a discovery/parse failure reds with zero tokens (and zero spawns).
      for (const stem of ["b210livekid", "b210livemid", "b210liveonly", "b210livedriver"]) {
        expect(
          handle.command(stem),
          `no bug-0218 command /${stem} — the .theta failed discovery/parse. ` +
            "Registered: " + JSON.stringify(handle.registeredNames()),
        ).toBeDefined();
      }

      const turn = await driveSlashCaptureTurn(handle, "/b210livedriver");
      const outbound = turn.userTexts.join("\n");

      // Arm (a) — the MIXED callable set (bug doc §Fix (1) + §Verification
      // live row 1). The kid's sentinel behind the host-half anchor proves the
      // whole chain: the mid SPAWNED and ran its first statement (pre-fix on a
      // validating host it exits 2 before any session), its code-side
      // `read({...})?` dispatched against the child host's registry (the host
      // half of the allowlist survived the split — a fix that dropped it reds
      // here as `ERR …`), the `.theta` callee resolved through the
      // presented-name + closure-hash carrier, the grandchild ran, and the
      // callee's VALUE crossed both boundaries.
      expect(
        outbound,
        "bug 0218 §Fix (1): the mixed read + .theta callable set must run end " +
          "to end with the host half honoured inside the spawned child — the " +
          "host-half anchor did not carry the kid's sentinel. Registered: " +
          JSON.stringify(handle.registeredNames()) +
          "; outbound: " + JSON.stringify(turn.userTexts) +
          "; systemNotes: " + JSON.stringify(turn.systemNotes),
      ).toContain("b210-host-half=B210-KID-RAN");

      // Arm (b) — the THETA-ONLY callable set (bug doc §Fix (2) +
      // §Verification live row 2). A callable set with NO host tool now takes
      // the `--no-tools` arm; the callee must still resolve and run through
      // its own carrier, and its value must still cross — a fix that broke
      // the empty-vs-omission distinction or starved the hash carrier on this
      // arm reds here as `ERR …`.
      expect(
        outbound,
        "bug 0218 §Fix (2): the theta-only callable set must take the " +
          "--no-tools arm and still run its callee — the theta-only anchor " +
          "did not carry the kid's sentinel. Registered: " +
          JSON.stringify(handle.registeredNames()) +
          "; outbound: " + JSON.stringify(turn.userTexts) +
          "; systemNotes: " + JSON.stringify(turn.systemNotes),
      ).toContain("b210-theta-only=B210-KID-RAN");

      // No fail-closed ending of the DRIVER's own drive: both `invoke(...)`
      // results are `match`ed explicitly above (no `?`, no unhandled `Err`),
      // so this theta's own top-level outcome is Success either way — a
      // failure note here would mean the fixture itself is broken, not that
      // bug 0218 regressed.
      const failureNotes = turn.systemNotes.filter((n) =>
        /^theta \/b210livedriver (returned Err|cancelled|aborted)/.test(n),
      );
      expect(
        failureNotes,
        "the driver's own drive surfaced fail-closed system note(s) — the " +
          "fixture itself is broken: " + JSON.stringify(failureNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});


// ===========================================================================
// cell 73 — bug 0175: a `params:` default whose parse leaves tokens
// unconsumed does not register, live (Convention: live-host acceptance).
//
// The route is §Fix (a) (docs/bugs/0175-literal-sublanguage-parser-ignores-
// trailing-tokens.md): `checkLiteralSublanguage`'s `default-not-literal` arm
// now widens to name the RESIDUE — the text from the first token
// `ExprParser.parse()` left unconsumed through the end of source, trimmed —
// so `integer = 1 2` (pre-fix: loads clean, registers, and BINDS `1` through
// the real binder) is refused at LOAD time instead. This is the SAME
// per-field default loop / `hasLoadParseError` site the bug 0102/0110/0125/
// 0166 cells above exercise for their own codes, and the same registered
// code (`theta/parse/default-not-literal`) the bug 0166 cell above already
// drives live — this cell's new observable is the WIDENED *Trigger*: a
// residue that is itself a second literal (no operator at all), which bug
// 0166's fix left unwitnessed.
//
// Registration-only: no slash command is invoked, so no model turn runs and
// the cell spends ZERO tokens, the same profile as the bug 0102/0110/0125/
// 0166/0204 cells above. A `bind_model:` pin (`anthropic/claude-haiku-4-5`,
// the same pin the committed `acc-params-binder.theta` fixture and the bug
// 0102/0166 cells above use) is carried by every `params:`-declaring theta
// below: a DEFAULTED `params:` field is never `single-string-bypass`-
// eligible (`classifyBinderBypass`, src/binder/binder-envelope.ts, requires NO
// default — the bug 0102 cell's own file-header note), so it always routes to
// `binder` kind and would otherwise depend on this ephemeral workspace's
// absent ambient settings for a resolvable model — a LOAD-TIME, static
// registry lookup only (no dispatched turn, so still zero tokens). The
// refusal fires at PARSE phase, upstream of any binder pass, so this cell's
// registration-only shape is sufficient to witness the fixed path: a theta
// that does not register never reaches the binder at all.
//
// The conformant control mirrors the committed `acc-params-binder.theta`
// shape exactly — `count: number = 3`, the ONE `params:` default the whole
// corpus census (docs/bugs/0175-…, §Affected) found anywhere in the tree —
// so this cell reds in BOTH directions: a fix that over-refuses (every
// defaulted `params:` field refused) would fail the control, and a fix that
// does nothing (§Fix unapplied) would fail the refusal.
//
// No shipped live fixture (H8a, H9a, or the hardening probes) declares a
// `params:` default carrying a second literal with no operator between them
// — confirmed by the bug doc's own corpus census (34 committed `.theta`/
// `.thetalib` files, 17 declaring `params:`, exactly one default anywhere,
// carrying no residue) — so the widened *Trigger* had NO live reach before
// this cell, mirroring the bug 0084/0089/0095/0102 cells' own "no existing
// live fixture reaches this arm" finding. ADDITIVE ONLY: no existing cell in
// this file is weakened, reworded, reordered or deleted.
// ===========================================================================

/**
 * A `params:` theta with ONE declared `integer` field whose default RHS
 * carries a trailing residue that is itself a second literal — the bug doc's
 * own `1 2` spelling, measured pre-fix to load clean, register, and BIND `1`
 * through the real binder (§Reproduction (e), row `integer = 1 2`). A
 * resolvable `bind_model:` is carried because a default disqualifies the
 * `single-string-bypass` shape (file-header note above), and the final value
 * is a pure literal — registration is the only observable this cell reads.
 */
function cellB3ResidueDefaultTheta(): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    "  p: 'integer = 1 2'",
    "---",
    '"ok"',
    "",
  ].join("\n");
}

/**
 * The conformant control: `count: number = 3`, byte-identical to the
 * `params:` field the committed `acc-params-binder.theta` fixture declares —
 * the whole corpus's one occurrence of a `params:` default, and it carries no
 * residue at all. Must keep registering under the widened *Trigger*, proving
 * the refusal below is targeted rather than a blanket over-refusal of every
 * defaulted `params:` field.
 */
function cellB3ConformantDefaultTheta(): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    "  count: number = 3",
    "---",
    '"ok"',
    "",
  ].join("\n");
}

describe("H8a-T — bug 0175 cell 73: a params: default whose parse leaves a second literal unconsumed does not register, live (Convention: live-host acceptance)", () => {
  it("does not register a caller whose params: default is `integer = 1 2`, while its conformant `count: number = 3` sibling still registers, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, either
      // sibling's status below could be (wrongly) attributed to a broken
      // workspace instead of the widened is-literal check under test.
      { source: "project", stem: "b175livectl", text: promptTheta("THETA-LIVE-OK") },
      // The load-bearing caller: `integer = 1 2`, refused post-fix (pre-fix:
      // registers and binds `1` through a real binder pass, §Reproduction (e)).
      { source: "project", stem: "b175liverefused", text: cellB3ResidueDefaultTheta() },
      // The over-fire fence: `count: number = 3`, the corpus's one committed
      // `params:` default, byte-shape-identical to acc-params-binder.theta.
      { source: "project", stem: "b175livegood", text: cellB3ConformantDefaultTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b175livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the widened is-literal check under test, would explain either " +
          "sibling's status below too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The over-fire fence must register too, BEFORE the refusal is
      // asserted: isolating the refusal below to the residue-carrying default
      // specifically, not to "no defaulted params: theta ever registers in
      // this harness".
      expect(
        handle.command("b175livegood"),
        "the conformant `count: number = 3` sibling did not register — " +
          "precondition unmet (the corpus's one committed params: default " +
          "must keep registering; over-refusal here would hide the refusal " +
          "below inside a broken control rather than a targeted fix). " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // THE FIXED OBSERVABLE: through the REAL production composition root
      // (not the offline `parseThetaDocument` harness the unit witness uses),
      // the caller whose params: default is `integer = 1 2` does not register
      // — `theta/parse/default-not-literal` now fires, naming the residue `2`,
      // from the SAME per-field default loop the bug 0102/0110/0125/0166
      // cells above exercise for their own codes.
      expect(
        handle.command("b175liverefused"),
        "the caller whose params: default is `integer = 1 2` registered anyway " +
          "through the live discovery/session_start path — " +
          "theta/parse/default-not-literal did not fire for a residue that is a " +
          "second literal. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b175liverefused");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager` rather
      // than off racy events: the diagnostic fires at LOAD time, before any
      // drive, so the full entry list is the delta (mirrors the bug
      // 0102/0110/0125/0166/0204 cells above).
      const loadNotes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = defaultNotLiteralFragment("2");
      expect(
        loadNotes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the default-not-literal rejection, " +
          "residue `2`, for the second-literal default. Notes: " +
          JSON.stringify(loadNotes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// cell 74 — bug 0217: a `params:` field whose right-hand side carries an inline
// `enum[…]` inside a generic argument does not register, live.
//
// `schemas.md:93` states the rule with no depth qualifier — `enum` is
// "**top-level only** — there is no inline `enum["a", "b"]` form
// (`theta/parse/inline-enum`)" — and `grammar.md:90–:102` closes `Type` over six
// alternatives, none of which is a bracket form. At the pre-fix baseline
// (e5d760bd / 0.139.0, the fix commit for bug 0204) `array<enum["a", "b"]>` at a
// `params:` field drew NO diagnostic: the angle-only argument split
// (`lowerTypeExpr`'s generic arm, src/parser/params.ts) cut the `[…]` group at
// its top-level comma, both manufactured pieces recursed through
// `withoutUnspellableSink`, and the sink
// `theta/load/params-type-not-expression` reads stayed empty — so the theta
// REGISTERED with `properties.f = {}`, a fragment that validates every value.
// Bug 0217's route (its §Fix (b)(2)) pushes the SOURCE TEXT of that cut bracket
// group into the sink once, as a last resort, so the refusal fires and
// `hasLoadParseError` (src/extension/production-composition.ts) withholds
// registration.
//
// THIS CELL IS A DENIAL CELL: `d217livenested`'s ABSENCE from the registry is
// the fixed observable, reached through the REAL production composition root
// (session_start → resources_discover → composeExtensionInstance →
// checkTypeLayer) that the offline `parseThetaDocument` witness
// (tests/nested-inline-enum-generic-argument-refusal.test.ts) never touches.
// Two controls make the denial non-vacuous:
//   - `d217livectl`, a plain prompt theta in the SAME workspace, proves the
//     workspace and the discovery walk both work, so the denial cannot be
//     attributed to a broken workspace.
//   - `d217livelegal`, a `params:` field declaring `array<"a" | "b">` — the
//     literal-union spelling `schemas.md:93` points authors AT — proves the
//     refusal is targeted rather than "no `params:` theta registers in this
//     harness", and that the fix is a redirection rather than a loss of
//     expressiveness.
// `bind_model:` is pinned on both `params:`-declaring thetas because neither
// field is `classifyBinderBypass`'s single-string-bypass shape (both are
// `array<…>`), so both would otherwise draw
// `theta/load/binder-model-unresolved` at registration independent of this bug
// (mirroring the bug 0059/0102/0175/0204 cells above).
//
// Registration-only: no slash command is invoked, so no model turn runs and the
// cell spends zero tokens (the same profile the bug 0204 / 0175 cells above
// claim). ADDITIVE ONLY: every existing cell in this file is unchanged and this
// cell adds no assertion to any of them.
//
// NOTE (cell 74): the parent renumbers cells at merge; a tail-append rebase
// conflict at this site is expected and mechanical.
// ===========================================================================

/**
 * A `params:` theta with ONE field of the declared type and a resolvable
 * `bind_model:` — every field cell 74 plants is an `array<…>` shape, so
 * registration reaches the binder-model resolution guard regardless of this
 * bug and the pin isolates each theta's verdict to the type-text refusal
 * alone. The pure-literal final value (no query) matches this file's other
 * registration-only `params:` cells: registration is the only observable read.
 */
function cellDParamsTheta(fieldType: string): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    `  f: '${fieldType}'`,
    "---",
    '"ok"',
    "",
  ].join("\n");
}

describe("H8a-T — bug 0217 cell 74: a params: field carrying an inline enum[…] inside a generic argument does not register, live (Convention: live-host acceptance)", () => {
  it('does not register a theta whose params: field declares array<enum["a", "b"]>, while its legal array<"a" | "b"> sibling still registers, through the real discovery\u2192registration path', async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, either
      // sibling's status below could be (wrongly) attributed to a broken
      // workspace instead of the nested-inline-enum refusal under test.
      { source: "project", stem: "d217livectl", text: promptTheta("THETA-LIVE-OK") },
      // The over-refusal fence: the literal-union spelling schemas.md:93 points
      // authors AT. It must keep registering, so the denial below is targeted
      // rather than "no params: theta registers in this harness".
      {
        source: "project",
        stem: "d217livelegal",
        text: cellDParamsTheta('array<"a" | "b">'),
      },
      // The load-bearing DENIAL: an inline `enum[…]` inside a generic argument.
      // Pre-fix this registers with `properties.f = {}`.
      {
        source: "project",
        stem: "d217livenested",
        text: cellDParamsTheta('array<enum["a", "b"]>'),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("d217livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the nested-inline-enum refusal under test, would explain either " +
          "sibling's status below too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The over-refusal fence must register BEFORE the denial is asserted,
      // isolating the denial to the inline `enum[…]` specifically.
      expect(
        handle.command("d217livelegal"),
        'the legal `array<"a" | "b">` sibling did not register — precondition ' +
          "unmet (schemas.md:93 points authors at exactly this spelling, so it " +
          "must keep loading; over-refusal here would hide the denial below " +
          "inside a broken control rather than a targeted fix). Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // THE FIXED OBSERVABLE: through the REAL production composition root (not
      // the offline `parseThetaDocument` harness the unit witness uses), the
      // theta whose `params:` field declares `array<enum["a", "b"]>` does not
      // register — the cut `[…]` group reaches `LowerCtx.unspellable`,
      // `theta/load/params-type-not-expression` fires, and `hasLoadParseError`
      // withholds the whole frontmatter.
      expect(
        handle.command("d217livenested"),
        'the params: field declaring `array<enum["a", "b"]>` registered anyway ' +
          "through the live discovery/session_start path — " +
          "theta/load/params-type-not-expression did not fire for an inline " +
          "enum[…] inside a generic argument, so the field lowered to the " +
          "assert-nothing `{}` and a value the author declared as an " +
          "enumeration is validated against nothing (schemas.md:93 refuses the " +
          "construct with no depth qualifier). Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("d217livenested");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager` rather
      // than off racy events: the diagnostic fires at LOAD time, before any
      // drive, so the full entry list is the delta (mirrors the bug
      // 0059/0102/0175/0204 cells above).
      const loadNotes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = paramsTypeNotExpressionFragment("f");
      expect(
        loadNotes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the params-type-not-expression " +
          "rejection for the nested inline enum. Notes: " +
          JSON.stringify(loadNotes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});


// ===========================================================================
// Bug 0211 (cell 76) — a separator-degenerate `import { a b }` specifier list
// (imports.md §"Re-exports" :62–65, `"{" ImportSpec ("," ImportSpec)* ","? "}"`
// requires a `,` between two specifiers) is silently recovered into the SAME
// specifier list `{ a, b }` produces (src/parser/theta-document.ts's specifier
// loop, `parseImportExport`), so a missing separator delivered a working import
// with zero diagnostics. The fix extends bug 0100's mechanism with a third arm
// of `theta/parse/import-malformed-specifier-list` (`checkImportSeparatorDegenerateSpecifierList`,
// src/parser/imports.ts), gated on the same well-formed trailing clause and
// suppressed on an empty recovered list or a dangling `as`, so it fires
// exactly once per statement, ranged over the statement, on a separator
// degeneracy the other two arms leave admitted.
//
// No existing live test reaches this surface: the only import statements
// anywhere under `tests/live/**` before this cell are fully specified and
// comma-separated (bug 0100's cell 67 above plants its own `.thetalib` for the
// SAME reason this cell does), and this file plants no fixture spelling a
// missing-separator list before now.
//
// This drives the SAME registration observable bug 0100's cell 67 uses
// (`handle.command` / `handle.registeredNames()`, read after the real
// `session_start` → `resources_discover` → `composeExtensionInstance` path
// settles) through the shipped extension entry against a live host, PLUS the
// `theta-system-note` channel read directly off the settled `SessionManager`
// (AGENTS.md §"Assert on real observables"): the refusal is an error-severity
// `theta/parse/*` diagnostic raised at LOAD time, before any slash is driven,
// so the full entry list IS the delta.
//
// The `.thetalib` is planted BESIDE the discovered `.theta` files (imports.md
// :19), written into `<cwd>/.pi/theta/` AFTER `plantThetaWorkspace` returns and
// BEFORE `bootShippedExtension`, mirroring cell 67 exactly. A `.thetalib` is
// never slash-command-discovered (imports.md:15), so planting it adds no
// registration of its own.
//
// Registration-only: no slash command is invoked, so no model turn runs and the
// cell spends zero tokens, the same profile as cell 67. ADDITIVE ONLY: no
// existing cell in this file is weakened, reworded, reordered or deleted.
//
// NOTE (cell 76): the parent renumbers cells at merge; a tail-append rebase
// conflict at this site is expected and mechanical.
// ===========================================================================

describe("H8a-T — bug 0211 (cell 76): a separator-degenerate import specifier list is refused, live (Convention: live-host acceptance)", () => {
  it("does not register a theta whose import specifier list is missing a separator, while its comma-separated sibling registers, and the theta-system-note channel carries the refusal, through the real discovery\u2192registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // The load-bearing theta: `a b` with no `,` between the two specifiers —
      // the shape imports.md §"Re-exports" excludes and the specifier loop
      // silently recovers into `{ a, b }`'s own list.
      {
        source: "project",
        stem: "b211livemissing",
        text: importSpecifierTheta('import { a b } from "./b211livelib.thetalib"'),
      },
      // The precondition control: the SAME import with the comma written. It
      // must register, so the missing-separator sibling's absence is
      // attributable to the refusal rather than to a broken workspace or an
      // unresolvable lib.
      {
        source: "project",
        stem: "b211livectl",
        text: importSpecifierTheta('import { a, b } from "./b211livelib.thetalib"'),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    // The imported `.thetalib`, planted BESIDE the discovered `.theta` files so
    // the relative spec resolves; a `.thetalib` is never slash-discovered, so
    // this adds no command of its own.
    writeFileSync(
      join(workspace.cwd, ".pi", "theta", "b211livelib.thetalib"),
      "fn a(x: string) { x }\nfn b(x: string) { x }\n",
      "utf8",
    );
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b211livectl"),
        "the conforming comma-separated control did not register — a broken " +
          "workspace or an unresolvable `.thetalib`, not the check under test, " +
          "would explain the missing-separator theta's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root
      // (not the offline `parseThetaDocument` harness the unit witness uses),
      // the missing-separator specifier list un-registers its theta at the
      // SAME hasLoadParseError site cell 67 exercises for the dangling-`as`
      // shape.
      expect(
        handle.command("b211livemissing"),
        "the theta whose import specifier list is missing a separator " +
          "registered anyway through the live discovery/session_start path — " +
          "theta/parse/import-malformed-specifier-list did not fire for the " +
          "separator-degenerate shape. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b211livemissing");

      // The theta-system-note channel: the refusal fires at LOAD time, before
      // any drive, so the full entry list is the delta (mirrors cell 67).
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = malformedSpecifierListFragment();
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the malformed-specifier-list refusal " +
          "for the missing-separator theta. Notes: " + JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});


// ===========================================================================
// cell 75 (cell 77) — bug 0216: the shipped `session_shutdown` teardown handler
// is the unknown-reason rule's only production caller, live.
//
// docs/bugs/0216-shutdown-reason-classification-unwired.md §Fix, disposition A:
// `runSessionShutdown` now calls `classifyShutdownReason(event, deps.inventory)`
// at handler entry and emits its single returned diagnostic through the same
// sink sub-steps 1/3/4/5 use, BEFORE sub-step 1 runs; `factory.ts` injects the
// real `SDK_SURFACE_INVENTORY` (was `inventory: undefined`) and stopped
// pre-reading `event.reason` at the call site (was `{ reason: event.reason }`),
// so a throwing getter now routes to `session-shutdown-reason-unknown` instead
// of the subscription's own `extension-bootstrap-failed` catch.
//
// Pre-fix, NEITHER registered row (`theta/host/session-shutdown-reason-unknown`,
// `theta/host/session-shutdown-pinned-constant-unreadable`) could fire from any
// input: the handler computed its captured reason with a private
// `coerceReasonString` — a bare `String()` coercion with no snapshot read and no
// membership check — and `factory.ts` passed `inventory: undefined`. This cell
// drives the REAL production composition root (session_start →
// createThetaExtension's `session_shutdown` subscription → the shipped
// `runSessionShutdown`), not `classifyShutdownReason` directly (the unit
// witness `tests/unknown-reason-rule.test.ts` already covers the pure function
// and stays green whether or not a production caller exists — the gap this bug
// names).
//
// The diagnostic sink at this composition root is a raw `console.error` of the
// serialised `Diagnostic` (`factory.ts`'s `session_shutdown` deps literal), not
// the `theta-system-note` channel — this handler-entry diagnostic precedes
// sub-step 1, before any per-invocation note could exist. The file-scope
// `console.error` spy every cell in this file already runs under (bug 0030,
// installed/inspected in the shared `beforeEach`/`afterEach` above) is reused
// here as the observable read; `thetaOwnedStderrLines` does not recognise this
// line's shape, so the shared `afterEach`'s zero-offender assertion is
// unaffected by this cell's own diagnostic line.
//
// Registration-only precondition, then a direct `session_shutdown` emission —
// no slash command is invoked and no model turn runs, so this cell spends ZERO
// tokens, the same profile as the bug 0175/0217 cells above. `bootShippedExtension`
// still requires a live provider/model to construct the `AgentSession` (AGENTS.md
// §"No silent skipping" — `requireLiveProvider()` fails loudly, never skips, when
// none is configured), even though this cell drives no turn against it.
//
// ADDITIVE ONLY: every existing cell in this file is unchanged and this cell adds
// no assertion to any of them.
//
// NOTE (cell 75 / cell 77): the parent renumbers cells at merge; a tail-append
// rebase conflict at this site is expected and mechanical.
// ===========================================================================

const SESSION_SHUTDOWN_REASON_UNKNOWN_CODE = "theta/host/session-shutdown-reason-unknown";
const SESSION_SHUTDOWN_PINNED_CONSTANT_UNREADABLE_CODE =
  "theta/host/session-shutdown-pinned-constant-unreadable";
const EXTENSION_BOOTSTRAP_FAILED_CODE = "theta/load/extension-bootstrap-failed";

describe("H8a-T — bug 0216 cell 75 (cell 77): the shipped session_shutdown handler classifies an out-of-set reason live, through the real production wiring", () => {
  it("emits exactly one session-shutdown-reason-unknown carrying details.observed for a live session_shutdown whose reason is outside the closed set, never extension-bootstrap-failed", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: proves the workspace and discovery walk both
      // work, so an absent diagnostic below cannot be attributed to a broken
      // workspace instead of the wiring under test.
      { source: "project", stem: "b216livectl", text: promptTheta("THETA-LIVE-OK") },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b216livectl"),
        "the precondition control did not register — a broken workspace, not " +
          "the unknown-reason wiring under test, would explain the assertions " +
          "below too. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.runner.hasHandlers("session_shutdown"),
        "the shipped extension registered no session_shutdown handler — the " +
          "fixed path (the classifier's production call) can never be reached " +
          "by this cell.",
      ).toBe(true);

      // THE FIXED OBSERVABLE: an out-of-set `event.reason` reaches the real
      // `classifyShutdownReason` call at handler entry (session-shutdown.ts) via
      // the real `SDK_SURFACE_INVENTORY` factory injects (factory.ts), and its
      // single pre-sub-step-1 diagnostic is pushed through the sink before this
      // `emit()` call resolves.
      // `reason` is deliberately outside the closed literal union the SDK's
      // own type declares (PIC-45's very reason to exist — a patch-skew live
      // host CAN deliver a reason the pinned snapshot has not caught up to),
      // so the emitted event is cast through `unknown` rather than widened via
      // an `as "quit"` lie.
      await handle.runner.emit(
        { type: "session_shutdown", reason: "hibernate" } as unknown as Parameters<
          typeof handle.runner.emit
        >[0],
      );

      const lines = (consoleErrorSpy?.mock.calls ?? []).map((call) => call[0]);
      const diagnosticLines = lines.filter(
        (line): line is string =>
          typeof line === "string" &&
          line.startsWith("{") &&
          line.includes(SESSION_SHUTDOWN_REASON_UNKNOWN_CODE),
      );
      expect(
        diagnosticLines,
        "no theta/host/session-shutdown-reason-unknown diagnostic line reached " +
          "the production sink for a live session_shutdown with an out-of-set " +
          "reason — pre-fix (bug 0216) `runSessionShutdown` computed its " +
          "captured reason with a private String()-coercion and never consulted " +
          "the classifier, so neither registered row could ever fire. Captured " +
          "console.error calls: " + JSON.stringify(lines),
      ).toHaveLength(1);
      const diagnostic = JSON.parse(diagnosticLines[0] as string) as {
        readonly code: string;
        readonly details?: { readonly observed?: string };
      };
      expect(diagnostic.details).toStrictEqual({ observed: "hibernate" });

      // Mutual exclusivity (PIC-47): a healthy snapshot cannot also report
      // pinned-constant-unreadable for the same event.
      expect(
        lines.filter(
          (line): line is string =>
            typeof line === "string" &&
            line.includes(SESSION_SHUTDOWN_PINNED_CONSTANT_UNREADABLE_CODE),
        ),
      ).toEqual([]);

      // The mis-routed path bug 0216 named: pre-fix, `factory.ts`'s
      // `{ reason: event.reason }` pre-read happened OUTSIDE the classifier, so
      // a throwing getter (not exercised by this string reason, but the same
      // call site) would have routed to this code instead. For THIS reason
      // (a plain string, never throws on read) the negative simply confirms no
      // bootstrap-failure noise accompanied the fixed emission.
      expect(
        lines.filter(
          (line): line is string =>
            typeof line === "string" && line.includes(EXTENSION_BOOTSTRAP_FAILED_CODE),
        ),
      ).toEqual([]);
    } finally {
      // `dispose()` fires its own session_shutdown (reason "quit", closed-set)
      // as part of the real host-mirroring teardown path (bug 0018) — a SECOND
      // event on top of the one this cell fired directly, exactly as the bug
      // 0074/0073 cells above already do.
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// cell 78 (bug 0128) — an explicit `by <field>` clause whose named field
// RESOLVES in every variant but is not a single literal is refused, live,
// through the real discovery→registration path, and the VALID-discriminator
// spelling of the same `by kind` clause still registers and drives.
//
// Pre-fix, `checkExplicitDiscriminator` (src/parser/schema-declarations.ts)
// tested three gates that all presuppose a literal — `anyNested`,
// `allLiteral && !allString`, `allLiteral && allString && duplicate` — so a
// resolved non-literal field (`kind: string` in every variant) fell through
// every gate and the declaration loaded with ZERO diagnostics, registering
// exactly like a correct one. The fix adds a `presentInAll && !allLiteral`
// gate that refuses it under the newly minted `theta/parse/non-literal-
// discriminator` (E, parse). This cell 78 cell is the live, real-composition-
// root witness of that disposition: the unit witness
// (tests/non-literal-by-field-refusal.test.ts) proves the diagnostic bytes at
// the parse boundary; this cell proves the same input un-registers a live
// slash command and lands the fragment on the `theta-system-note` channel
// (AGENTS.md §"Assert on real observables"), and that the GOOD spelling under
// the identical `by kind` clause is unaffected — the fix's good-path
// non-regression the bug doc's §Expected behaviour requires.
//
// Registration-only for the bad spelling (no slash command invoked — zero
// tokens, the same profile as the bug 0070/0071/0077/0079(a)/0110/0084/0089/
// 0095 cells above); the good spelling IS driven (one live turn) so the
// "still drives" half of the claim is a real model round trip, not merely a
// registration check. ADDITIVE ONLY: no existing cell in this file is
// weakened, reworded, reordered or deleted.
// ===========================================================================

/** `theta/parse/non-literal-discriminator`'s registered code and registry page (bug 0128 §Fix; code-registry-parse.md). */
const NON_LITERAL_DISCRIMINATOR_CODE = "theta/parse/non-literal-discriminator";
const NON_LITERAL_DISCRIMINATOR_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `theta/parse/non-literal-discriminator: discriminator '<field>' on <X> must
 * be a single string-literal type in every variant` with both placeholders
 * substituted — DIAG-4: the message half is read from the registry row, not
 * copied, mirroring this file's existing `defaultWithoutLiteralFragment` /
 * `emptySchemaBodyFragment` helpers.
 */
function nonLiteralDiscriminatorFragment(field: string, schema: string): string {
  const template = registryMessage(
    NON_LITERAL_DISCRIMINATOR_REGISTRY,
    NON_LITERAL_DISCRIMINATOR_CODE,
  ) as string | undefined;
  expect(
    template,
    `cell 78: ${NON_LITERAL_DISCRIMINATOR_CODE} has no registry row — the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  const message = (template as string).replaceAll("<field>", field).replaceAll("<X>", schema);
  expect(
    message,
    `cell 78: ${NON_LITERAL_DISCRIMINATOR_CODE}: an unsubstituted placeholder remains — the registry row's Message template changed shape and this cell's substitution is stale`,
  ).not.toMatch(/<[a-z]+>/);
  return `${NON_LITERAL_DISCRIMINATOR_CODE}: ${message}`;
}

/**
 * The BAD spelling (bug 0128 class 1, row A4): `kind: string` in both
 * variants of a `by kind` union — resolves in every variant, is not a single
 * literal, drew ZERO diagnostics pre-fix.
 */
function nonLiteralByFieldTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "schema Cat { kind: string, name: string }",
    "schema Dog { kind: string, name: string }",
    "schema Animal by kind = Cat | Dog",
    "let a = 1",
    "a",
    "",
  ].join("\n");
}

/**
 * The GOOD spelling under the identical `by kind` clause: a single string
 * literal per variant (`kind: "cat"` / `kind: "dog"`) — the good path the fix
 * must not disturb. Drives a real turn so "still loads AND still drives" is
 * proven end to end, not merely by registration.
 */
// Drive discriminators are ANSWERS to task questions over the theta's own
// computed text -- deterministic content a degraded plain-prompt run cannot
// produce. A verbatim-echo demand ("reply with exactly this") reads as prompt
// injection to current models and draws refusals: the sentinel-refusal class
// filed as bug 0243.
function literalByFieldTheta(sentinel: string): string {
  return [
    "---",
    "mode: prompt",
    "---",
    'schema Cat { kind: "cat", name: string }',
    'schema Dog { kind: "dog", name: string }',
    "schema Animal by kind = Cat | Dog",
    "@`What is 316 plus 445? Answer with the number only.`",
    "",
  ].join("\n");
}

describe("cell 78 (bug 0128): an explicit `by kind` over a resolved non-literal field is refused live, and the valid-discriminator spelling still registers and drives (Convention: live-host acceptance)", () => {
  it('cell 78: does not register schema Animal by kind = Cat | Dog over kind: string, the theta-system-note channel carries non-literal-discriminator, and the kind: "cat"/kind: "dog" sibling under the same clause registers and drives to the live sentinel', async () => {
    const provider = await requireLiveProvider();
    const sentinel = "761";
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, a
      // regressed fix (the bad-spelling caller failing to register FOR THE
      // WRONG REASON, e.g. a broken workspace) could be misattributed.
      { source: "project", stem: "b128livectl", text: promptTheta("cell 78 CONTROL") },
      { source: "project", stem: "b128livebad", text: nonLiteralByFieldTheta() },
      { source: "project", stem: "b128livegood", text: literalByFieldTheta(sentinel) },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b128livectl"),
        "cell 78: the precondition control did not register — a broken workspace, not the fixed gate, would explain the bad-spelling caller's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: a `by kind` clause whose named field resolves in
      // every variant (`kind: string`) but is not a single literal is refused
      // — the caller must NOT register.
      expect(
        handle.command("b128livebad"),
        "cell 78: schema Animal by kind = Cat | Dog over kind: string registered — pre-fix, every gate in checkExplicitDiscriminator presupposed a literal and this class fell through all of them with zero diagnostics. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "cell 78 Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b128livebad");

      // The good path is unaffected by the fix: the identical `by kind` clause
      // over a genuine single-literal-per-variant field still registers.
      expect(
        handle.command("b128livegood"),
        'cell 78: schema Animal by kind = Cat | Dog over kind: "cat" / kind: "dog" failed to register — the fix must not disturb the valid-discriminator good path. Registered: ' +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager` rather
      // than off racy events: the diagnostic, when it fires, fires at LOAD
      // time, before any drive, so the full entry list is the delta (mirrors
      // the bug 0102/0095/0110/0084/0089 cells above).
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = nonLiteralDiscriminatorFragment("kind", "Animal");
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "cell 78: no theta-system-note entry named " +
          NON_LITERAL_DISCRIMINATOR_CODE +
          " for the bad-spelling declaration — the fixed gate did not fire. Notes: " +
          JSON.stringify(notes),
      ).toBe(true);

      // "still drives": one real live turn against the good spelling, proving
      // the schema declaration does not merely register but the theta runs to
      // completion against a live model — the good-path non-regression end to
      // end, not just at load time.
      const driven = await driveSlashCaptureTurn(handle, "/b128livegood");
      // 316 + 445 = 761: computable only from the theta's own arithmetic
      // question, not from the model parroting an attacker-shaped token.
      expect(
        driven.text,
        "cell 78: the live model reply for the valid-discriminator sibling did not contain the deterministic answer. Reply: " +
          JSON.stringify(driven.text),
      ).toContain(sentinel);
      expect(
        driven.systemNotes,
        "cell 78: the driven turn over the valid-discriminator sibling appended a theta-system-note (a fail-closed ending) — the good path must drive clean. Notes: " +
          JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});


// ===========================================================================
// cell 79 — bug 0145: `StaticTypeInferencePass`'s `#typeExpr` `case "match"`
// types every arm body in the ENCLOSING scope, so an arm body's read of its own
// pattern binder resolves to a same-named outer binding's record. `let x = 1` +
// `let m: string = match "hi" { x => x }` therefore draws
// `theta/parse/let-rhs-type-mismatch` (`expected string, got integer`) on a
// theta whose value is the string `"hi"` — measured through the production
// executor in tests/match-arm-scope-inference-pass.test.ts group (f)
// (docs/bugs/0145-inference-pass-no-match-arm-scope.md, group (b)).
//
// That code is `E` (docs/spec_topics/diagnostics/code-registry-parse.md), so
// `hasLoadParseError` (src/extension/production-composition.ts) DENIES the
// theta registration and the author has no runtime to check the claim against.
// The registration denial is what makes this a live question at all: the
// offline witness measures the diagnostic list off `parseThetaDocument`, and no
// offline harness observes the real discovery→registration path deciding
// whether a `.theta` becomes a slash command.
//
// DIRECTION — the inverse of the bug 0070 / 0071 / 0079(a) / 0110 / 0122 cells
// above, which assert a NON-registration. Refusals DISAPPEAR here on legal
// input, so cell 79 asserts the previously-refused theta IS registered, and it
// reds under neutralisation two ways: the subject's absence from
// `registeredNames()`, and the `theta/parse/let-rhs-type-mismatch` refusal note
// on the `theta-system-note` channel read off the settled `SessionManager`
// (AGENTS.md §"Assert on real observables"), read there before any slash is
// driven exactly as the bug 0110 cell reads its containment diagnostic.
//
// ZERO TOKENS. All three planted thetas but the shared sentinel control are
// query-free: their bodies are a `let` chain and a trailing identifier, so no
// model is built and no provider is dispatched. This cell registers only and
// drives nothing — the same profile as the bug 0070/0071/0079(a)/0110/0077
// registration-only cells above.
//
// DIAG-2 / DIAG-4. No registry row changes for this fix: every code involved is
// registered with an accurate *Trigger* and the refused inputs sit outside it
// (bug 0145 §Fix (c), "No registry edit"). The refusal fragment this cell
// asserts the ABSENCE of is therefore sourced from the live registry row rather
// than transcribed, on the same discipline `invokePathEscapeFragment` above
// applies to its own code.

/** The sharded registry page carrying `theta/parse/let-rhs-type-mismatch`'s row. */
const PARSE_REGISTRY_CELL_D = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

const LET_RHS_MISMATCH_CODE_CELL_D = "theta/parse/let-rhs-type-mismatch";

/**
 * cell 79's refusal fragment: `theta/parse/let-rhs-type-mismatch`'s registered
 * *Message* with the binding name and the two rendered types substituted, code-
 * prefixed the way `renderDiagnosticLine` (src/diagnostics/diagnostic.ts) joins
 * them into the theta-system-note content. Sourced from the registry row
 * (DIAG-4, docs/spec_topics/diagnostics/diagnostic-shape.md:74), never copied,
 * so a reworded row reds this cell instead of a stale string passing vacuously.
 */
function letRhsMismatchFragmentCellD(
  name: string,
  expected: string,
  actual: string,
): string {
  const template = registryMessage(
    PARSE_REGISTRY_CELL_D,
    LET_RHS_MISMATCH_CODE_CELL_D,
  ) as string | undefined;
  expect(
    template,
    `cell 79: ${LET_RHS_MISMATCH_CODE_CELL_D} has no registry row — the code ` +
      "whose absence this cell asserts is not registered (DIAG-2)",
  ).toBeTypeOf("string");
  const message = (template as string)
    .replaceAll("<name>", name)
    .replaceAll("<expected>", expected)
    .replaceAll("<actual>", actual);
  expect(
    message,
    `cell 79: ${LET_RHS_MISMATCH_CODE_CELL_D}: an unsubstituted <…> placeholder ` +
      "remains — the registry row's Message template changed shape and this " +
      "cell's substitution is stale",
  ).not.toMatch(/<[a-z]+>/);
  return `${LET_RHS_MISMATCH_CODE_CELL_D}: ${message}`;
}

/**
 * cell 79's subject: bug 0145 row b1, verbatim — a spec-legal prompt-mode theta
 * whose `match` arm binder `x` shadows an enclosing `let x = 1`. Query-free, so
 * registering it and never driving it spends nothing.
 */
function matchArmShadowTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "let x = 1",
    'let m: string = match "hi" { x => x }',
    "m",
    "",
  ].join("\n");
}

/**
 * cell 79's precondition control: the SAME theta with the shadowing `let x = 1`
 * deleted — bug 0145 row b2, which the offline witness measures as `[]` and
 * whose value the production executor measures as `"hi"`. It registers today,
 * so its presence separates "a broken workspace" from "the arm-scope refusal".
 */
function matchArmNoShadowTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    'let m: string = match "hi" { x => x }',
    "m",
    "",
  ].join("\n");
}

describe("H8a-T — bug 0145 cell 79: a `match` arm binder shadowing an enclosing binding refuses registration (Convention: live-host acceptance)", () => {
  it("cell 79: registers a caller whose `match` arm binder shadows an enclosing `let`, alongside its unshadowed sibling, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control 1: an ordinary theta in the SAME workspace,
      // proving the workspace and the discovery walk both work — without this,
      // the subject's absence could be (wrongly) attributed to a broken
      // workspace instead of the arm-scope refusal.
      { source: "project", stem: "b145livectl", text: promptTheta("THETA-LIVE-OK") },
      // Precondition control 2: bug 0145 row b2 — the SUBJECT minus the one
      // shadowing line. It registers today, so it separates "this `match` /
      // `let`-annotation shape never registers" from "the SHADOW is what
      // refuses it". This is the one-line delta the whole report rests on.
      { source: "project", stem: "b145livenoshadow", text: matchArmNoShadowTheta() },
      // The load-bearing subject: bug 0145 row b1.
      { source: "project", stem: "b145liveshadow", text: matchArmShadowTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b145livectl"),
        "cell 79: the precondition control did not register — a broken " +
          "workspace, not the arm-scope refusal, would explain the subject's " +
          "absence too. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command("b145livenoshadow"),
        "cell 79: the UNSHADOWED sibling did not register — bug 0145 row b2 is " +
          "measured `[]` offline (tests/match-arm-scope-inference-pass.test.ts " +
          "cell b2), so either the `let`-annotated `match` shape stopped " +
          "registering for an unrelated reason (which this cell does not intend " +
          "to test) or discovery/registration itself regressed. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: through the REAL production composition root
      // (not the offline `parseThetaDocument` harness the unit witness uses), a
      // spec-legal theta whose `match` arm binder shadows an enclosing `let`
      // REGISTERS. expressions.md:168 binds the identifier pattern's value to
      // the binder and :51 makes that binding shadow everything else lexically,
      // so the arm body's `x` is the string `"hi"` and the `string` annotation
      // accepts it — the input sits outside the registered *Trigger*, and
      // `hasLoadParseError` must have nothing to act on.
      expect(
        handle.command("b145liveshadow"),
        "cell 79: the theta whose `match` arm binder shadows an enclosing " +
          "`let x = 1` did NOT register through the live " +
          "discovery/session_start path — `theta/parse/let-rhs-type-mismatch` " +
          'fired on a legal program (its value is the string "hi", measured ' +
          "in tests/match-arm-scope-inference-pass.test.ts cell f1) and " +
          "`hasLoadParseError` un-registered it. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.registeredNames(),
        "cell 79: Registered: " + JSON.stringify(handle.registeredNames()),
      ).toContain("b145liveshadow");

      // The second, independent neutralisation guard: the refusal itself, off
      // the theta-system-note channel read from the settled in-memory
      // `SessionManager` (AGENTS.md §"Assert on real observables"). The shipped
      // path's sink routes every error-severity parse-phase diagnostic there
      // during `session.bindExtensions({})` inside `bootShippedExtension`
      // above — before any slash is driven, so the full entry list (not a
      // per-drive slice) is read here, exactly as the bug 0110 cell does. A
      // route that suppressed the diagnostic's DELIVERY while leaving the
      // emission in place would pass the registration assertions above and red
      // here; a route that removed the emission passes both.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const refusal = letRhsMismatchFragmentCellD("m", "string", "integer");
      expect(
        notes.filter((note) => note.includes(refusal)),
        "cell 79: the theta-system-note channel still carries the " +
          "`let-rhs-type-mismatch` refusal for the shadowing theta. The " +
          "refused `integer` is `let x = 1`'s type, read through the arm " +
          "binder that shadows it, and the fragment is derived from the " +
          "registry *Message* row (DIAG-4), not transcribed. Notes: " +
          JSON.stringify(notes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});


// ===========================================================================
// cell 80 — bug 0130: an inline object type in a `let` annotation converts to
// an unresolvable pseudo-`named` reference, so `theta/parse/let-rhs-type-mismatch`
// declines to fire at that position for every initialiser form
// (docs/bugs/0130-let-rhs-type-mismatch-declines-object-union.md, element 1).
// At HEAD `85717fa8` (v0.155.0), `annotationToCompatType`'s final arm
// (src/parser/type-layer-checks.ts:886) maps `{a: integer}` to
// `{ kind: "named", name: "{a:integer}" }`, `decide` answers `"unknown"`
// (src/parser/type-compat.ts:276–278) and `checkLetRhsCompat`'s deferral
// (`:421–424`) returns no diagnostic — so a theta whose typed binding the `⊑`
// relation REFUSES registers and runs on the real production path, with the
// declared type reduced to a comment (the runtime `let` arm never reads
// `stmt.annotation`, so the deferral names a net that does not exist here).
//
// THE ROUTE THIS CELL SCORES is R1/R2/R3 as encoded offline in
// tests/let-annotation-inline-object-compat.test.ts: a new `let`-annotation-only
// conversion mints `CompatType`'s TYPE-8 `object` arm for a well-formed
// non-empty inline object type, and `decide`'s TYPE-8 arm gains the sub-side
// deferral TYPE-7's array arm already carries — so an inline-object annotation
// over a LITERAL initialiser refuses statically, while the QRY-22 typed-query
// initialiser (the shipped area-(c) fixture
// tests/live/acceptance/fixtures/acc-typed-inline.theta:14) keeps deferring.
//
// WHY LIVE, and what it adds over the offline witness: the offline file drives
// `parseThetaDocument` through `parseDoc`. This cell drives the SHIPPED
// extension's real `extensions/index.ts` entry, real five-source discovery, and
// the production composition root, so it scores the two things the offline
// harness cannot reach — that the new error-severity `theta/parse/*` line
// reaches `hasLoadParseError` and UN-REGISTERS the caller, and that the same
// line lands on the `theta-system-note` channel of the settled in-memory
// `SessionManager`. Both observables are deterministic and provider-free at the
// assertion (AGENTS.md §"Assert on real observables, not on `prompt()`
// resolving"): no slash is driven, so the cell spends ZERO model turns — the
// same profile as the bug 0070 / 0071 / 0110 / 0122 registration-only cells
// above. A live provider is still REQUIRED and its absence fails loudly through
// `requireLiveProvider`, never skips.
//
// RED AT HEAD, for the right reason: `b130liverefused` REGISTERS (the mismatch
// never fires) and no theta-system-note carries the line. ADDITIVE ONLY: no
// existing cell in this file is renumbered, reworded, weakened or deleted, and
// this cell's number token is the literal string `cell 80`.
// ===========================================================================

/** `theta/parse/let-rhs-type-mismatch`'s registry page — DIAG-4, read not copied. */
const CELL_C2_PARSE_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/** The row bug 0130 owns (`docs/spec_topics/diagnostics/code-registry-parse.md:57`). */
const CELL_C2_LET_RHS_CODE = "theta/parse/let-rhs-type-mismatch";

/**
 * cell 80's expected system-note fragment: `<code>: <message>` with the row's
 * three slots substituted, mirroring `renderDiagnosticLine`'s join
 * (src/diagnostics/diagnostic.ts) — the same shape the bug 0110 cell above
 * asserts for its own code. `<expected>` is rendered per
 * `docs/spec_topics/diagnostics/placeholder-rendering-a.md:27` (single space
 * after each `:` and each `,`), which is bug 0130's element 2; a route that
 * emits the row but renders the pseudo-name (`{a:integer}`) reds HERE rather
 * than passing vacuously.
 */
function cellC2ExpectedFragment(): string {
  const template = registryMessage(CELL_C2_PARSE_REGISTRY, CELL_C2_LET_RHS_CODE) as
    | string
    | undefined;
  expect(
    template,
    `cell 80: ${CELL_C2_LET_RHS_CODE} has no registry row — the code this cell asserts is ` +
      "not registered (DIAG-2)",
  ).toBeTypeOf("string");
  const message = (template as string)
    .replaceAll("<name>", "x")
    .replaceAll("<expected>", "{ a: integer }")
    .replaceAll("<actual>", "integer");
  expect(
    message,
    `cell 80: ${CELL_C2_LET_RHS_CODE}: an unsubstituted <…> placeholder remains — the ` +
      "registry row's Message template changed shape and this cell's substitution is stale",
  ).not.toMatch(/<[a-z]+>/);
  return `${CELL_C2_LET_RHS_CODE}: ${message}`;
}

/**
 * cell 80's load-bearing fixture: a `mode: prompt` theta whose typed binding
 * annotates an inline object type and initialises it with an integer literal.
 * `1 ⋢ { a: integer }` under TYPE-8 (docs/spec_topics/type-system.md:42) — the
 * relation already answers `incompatible` when handed the shapes directly, and
 * bug 0130 is that nothing hands them to it. The trailing query is never sent:
 * the refusal un-registers the caller before any slash can be driven.
 */
function cellC2InlineObjectMismatchTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "let x: {a: integer} = 1",
    "@`unreachable — this theta must not register`",
    "",
  ].join("\n");
}

describe("H8a-T cell 80 — bug 0130: an inline-object `let` annotation refuses its incompatible initialiser, live (Convention: live-host acceptance)", () => {
  it("cell 80: does not register a caller whose `let x: {a: integer} = 1` the ⊑ relation refuses, and the theta-system-note channel carries the mismatch line, through the real discovery→registration path", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace. Without
      // it, the refused theta's absence could be (wrongly) attributed to a
      // broken workspace instead of the fix.
      { source: "project", stem: "b130livectl", text: promptTheta("THETA-LIVE-OK") },
      {
        source: "project",
        stem: "b130liverefused",
        text: cellC2InlineObjectMismatchTheta(),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b130livectl"),
        "cell 80: the precondition control did not register — a broken workspace, not the " +
          "fix, would explain the refused theta's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Observable 1 — registration. The new error-severity `theta/parse/*`
      // line reaches the SAME `hasLoadParseError` site the bug
      // 0070/0071/0079(a)/0110/0122 cells above exercise for their own codes.
      expect(
        handle.command("b130liverefused"),
        "cell 80: the caller whose typed binding the ⊑ relation refuses " +
          "(`let x: {a: integer} = 1`) registered anyway through the live " +
          "discovery/session_start path — theta/parse/let-rhs-type-mismatch did not fire at " +
          "an inline-object annotation. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "cell 80: Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b130liverefused");

      // Observable 2 — the diagnostic itself, off the `theta-system-note`
      // channel of the SETTLED in-memory `SessionManager` (AGENTS.md §"Assert
      // on real observables"): the shipped `loadSink` routes every
      // error-severity load-phase diagnostic there during
      // `session.bindExtensions({})` inside `bootShippedExtension` above,
      // before any slash is driven — so the FULL entry list is the delta, the
      // same read the bug 0110 cell performs. The fragment is derived from the
      // registry row (DIAG-4) and carries element 2's conformant rendering, so
      // this half also scores `placeholder-rendering-a.md:27`.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = cellC2ExpectedFragment();
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "cell 80: no theta-system-note entry carried the let-rhs-type-mismatch line for the " +
          "inline-object annotation. Expected fragment: " +
          JSON.stringify(expectedFragment) +
          " — Notes: " +
          JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});


// ===========================================================================
// cell 81 (bug 0118): a `fn` declared inside a `par for` body is refused by
// FN-1 through the real discovery→registration path, and hoisting the same
// declaration to the top level lets the caller register (Convention:
// live-host acceptance).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESSES DO NOT. `tests/par-for.test.ts`
// (cells r1/r4/r5) and `tests/interpolated-result-gate.test.ts` (h1) pin the
// diagnostic bytes at the `parseThetaDocument` boundary; this cell drives the
// same input through the SHIPPED `createAgentSession` composition (real
// discovery, real `session.bindExtensions({})`, the real registration gate
// `hasLoadParseError` reads) — the path 0079's own H8a cells (:1213–1216,
// :1343–1346) already exercise for the sibling laundering shapes bug 0118
// investigated, so this cell closes the same gap for the fix itself. A
// registration boolean alone cannot tell this refusal from any other
// `theta/parse/*` error blocking the same gate, so the assertion is the
// theta-system-note MESSAGE, exactly as bug 0140's cell 59 does.
//
// Registration-only: the diagnostic fires at LOAD time (inside
// `session.bindExtensions({})` inside `bootShippedExtension`), before any
// slash is driven, so this cell spends zero model turns — the same profile as
// the bug 0110 cell above (zero model turns: cell 81).
// ===========================================================================

/** `theta/parse/nested-fn`'s registered code and registry page (bug 0118 §Fix (a); code-registry-parse.md). */
const NESTED_FN_CODE_CELL_B2 = "theta/parse/nested-fn";
const NESTED_FN_REGISTRY_CELL_B2 = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `theta/parse/nested-fn: nested 'fn' declarations are not supported in
 * theta 1.0` — DIAG-4: the message half is read from the registry row, not
 * copied, mirroring this file's existing `nonLiteralDiscriminatorFragment` /
 * `invokePathEscapeFragment` helpers (cell 81).
 */
function nestedFnFragmentCellB2(): string {
  const template = registryMessage(
    NESTED_FN_REGISTRY_CELL_B2,
    NESTED_FN_CODE_CELL_B2,
  ) as string | undefined;
  expect(
    template,
    `${NESTED_FN_CODE_CELL_B2} has no registry row — the code this cell asserts is not registered (DIAG-2) (cell 81)`,
  ).toBeTypeOf("string");
  return `${NESTED_FN_CODE_CELL_B2}: ${template as string}`;
}

/** The offending theta (bug 0118 finding (2)): a `fn` declared directly in a `par for` body. */
const NESTED_FN_UNDER_PAR_FOR_CELL_B2 = [
  "---",
  "mode: prompt",
  "---",
  "let xs = par for i in [1, 2] {",
  "  fn mk(): integer { 1 }",
  "  1",
  "}",
  "@`What is 683 plus 114? Answer with the number only.`",
  "",
].join("\n");

/** The CLEAN sibling: the identical `fn` hoisted to the top level (the only placement FN-1 admits). */
const NESTED_FN_HOISTED_CELL_B2 = [
  "---",
  "mode: prompt",
  "---",
  "fn mk(): integer { 1 }",
  "let xs = par for i in [1, 2] { 1 }",
  "@`What is 347 plus 236? Answer with the number only.`",
  "",
].join("\n");

describe("cell 81 (bug 0118): a `fn` under a `par for` body is theta/parse/nested-fn live, and the hoisted sibling registers (Convention: live-host acceptance)", () => {
  it("does not register a caller whose `par for` body declares a nested `fn`, the theta-system-note channel carries theta/parse/nested-fn's registered message, and hoisting the same declaration to the top level lets the caller register (cell 81)", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without this, a
      // regressed fix (the offender failing to register FOR THE WRONG REASON,
      // e.g. a broken workspace) could be misattributed (mirrors the bug
      // 0110/0128 cells above).
      {
        source: "project",
        stem: "cellb2livectl",
        text: promptTheta("PARFORNESTEDFN-CONTROL"),
      },
      {
        source: "project",
        stem: "cellb2livebad",
        text: NESTED_FN_UNDER_PAR_FOR_CELL_B2,
      },
      {
        source: "project",
        stem: "cellb2livegood",
        text: NESTED_FN_HOISTED_CELL_B2,
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("cellb2livectl"),
        "the precondition control did not register — a broken workspace, not the fixed arm, would explain the offender's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()) +
          " (cell 81)",
      ).toBeDefined();

      // The fixed observable: a `fn` declared inside a `par for` body is
      // refused (bug 0118 §Fix (a), `walkExpr`'s `par-for` arm), so the
      // caller must NOT register.
      expect(
        handle.command("cellb2livebad"),
        "a `fn` declared inside a `par for` body registered — pre-fix, `walkExpr` had no `par-for` arm and `checkFnPlacement` never fired for this subtree. Registered: " +
          JSON.stringify(handle.registeredNames()) +
          " (cell 81)",
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()) + " (cell 81)",
      ).not.toContain("cellb2livebad");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager`: a
      // registration boolean alone cannot distinguish this refusal from any
      // other `theta/parse/*` error blocking the same gate, so the MESSAGE is
      // the assertion, exactly as bug 0140's cell 59 does.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = nestedFnFragmentCellB2();
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named " +
          NESTED_FN_CODE_CELL_B2 +
          " for the `par for`-nested declaration — the fixed arm did not fire. Notes: " +
          JSON.stringify(notes) +
          " (cell 81)",
      ).toBe(true);

      // The CLEAN sibling: the identical `fn` hoisted to the top level — the
      // only placement FN-1 admits — DOES register. Pairs with the refusal
      // above so this cell is not merely "nothing registered".
      expect(
        handle.command("cellb2livegood"),
        "the top-level-hoisted sibling failed to register — the fix must not disturb a legal top-level `fn` declared beside a `par for`. Registered: " +
          JSON.stringify(handle.registeredNames()) +
          " (cell 81)",
      ).toBeDefined();
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// cell 82 (bug 0224): the identifier walk now DESCENDS a `par for`, so an
// undeclared name spelled anywhere in its body draws theta/parse/unknown-
// identifier at load through the real discovery->registration path, and the
// clean sibling that reads only its own loop variable still registers. Ends
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESSES DO NOT. `tests/par-for.test.ts`
// (the bug 0224 (q-*) group) and `tests/type-name-as-value-refusal.test.ts`
// (g9) pin the diagnostic bytes at the `parseThetaDocument` boundary; this
// cell drives the same input through the SHIPPED `createAgentSession`
// composition (real discovery, real `session.bindExtensions({})`, the real
// registration gate `hasLoadParseError` reads) exactly as cell 81 above does
// for bug 0118's sibling arm, so this cell closes the same gap for the
// identifier-walk arm itself. A registration boolean alone cannot tell this
// refusal from any other `theta/parse/*` error blocking the same gate, so the
// assertion is the theta-system-note MESSAGE, exactly as cell 81 and bug
// 0140's cell 59 do.
//
// Registration-only: the diagnostic fires at LOAD time (inside
// `session.bindExtensions({})` inside `bootShippedExtension`), before any
// slash is driven, so this cell spends zero model turns -- the same profile
// as cell 81 above. A live provider is still REQUIRED and its absence fails
// loudly through `requireLiveProvider`, never skips. ADDITIVE ONLY: no
// existing cell in this file is renumbered, reworded, weakened or deleted.
// ===========================================================================

/** `theta/parse/unknown-identifier`'s registered code and registry page (bug 0224 Fix (a); code-registry-parse.md). */
const UNKNOWN_IDENT_CODE_CELL_B = "theta/parse/unknown-identifier";
const UNKNOWN_IDENT_REGISTRY_CELL_B = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `theta/parse/unknown-identifier: unknown identifier '<name>'` -- DIAG-4:
 * the message half is read from the registry row, not copied, mirroring this
 * file's existing `nestedFnFragmentCellB2` helper for cell 81.
 */
function unknownIdentFragmentCellB(name: string): string {
  const template = registryMessage(
    UNKNOWN_IDENT_REGISTRY_CELL_B,
    UNKNOWN_IDENT_CODE_CELL_B,
  ) as string | undefined;
  expect(
    template,
    `${UNKNOWN_IDENT_CODE_CELL_B} has no registry row -- the code this cell asserts is not registered (DIAG-2) (cell 82)`,
  ).toBeTypeOf("string");
  const withSlot = template as string;
  const message = withSlot.replace("<name>", name);
  return `${UNKNOWN_IDENT_CODE_CELL_B}: ${message}`;
}

/** The offending theta (bug 0224 §Reproduction A1): an undeclared name spelled as the `par for` body's tail. */
const UNDECLARED_NAME_UNDER_PAR_FOR_CELL_B = [
  "---",
  "mode: prompt",
  "---",
  "let xs = par for i in [1, 2] {",
  "  Zzz",
  "}",
  "@`What is 425 plus 152? Answer with the number only.`",
  "",
].join("\n");

/** The CLEAN sibling: a `par for` body that reads only its own loop variable -- resolution arm (1), so nothing is refused. */
const CLEAN_PAR_FOR_LOOP_VAR_ONLY_CELL_B = [
  "---",
  "mode: prompt",
  "---",
  "let xs = par for i in [1, 2] { i }",
  "@`What is 591 plus 207? Answer with the number only.`",
  "",
].join("\n");

describe("cell 82 (bug 0224): an undeclared name spelled inside a `par for` body is theta/parse/unknown-identifier live, and the loop-variable-only sibling still registers (Convention: live-host acceptance)", () => {
  it("does not register a caller whose `par for` body spells an undeclared name, the theta-system-note channel carries theta/parse/unknown-identifier's registered message, and the sibling reading only its loop variable registers (cell 82)", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work -- without this, a
      // regressed fix (the offender failing to register FOR THE WRONG REASON,
      // e.g. a broken workspace) could be misattributed (mirrors cell 81's
      // precondition control above).
      {
        source: "project",
        stem: "cellblivectl",
        text: promptTheta("PARFORUNKNOWNIDENT-CONTROL"),
      },
      {
        source: "project",
        stem: "cellblivebad",
        text: UNDECLARED_NAME_UNDER_PAR_FOR_CELL_B,
      },
      {
        source: "project",
        stem: "cellblivegood",
        text: CLEAN_PAR_FOR_LOOP_VAR_ONLY_CELL_B,
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("cellblivectl"),
        "the precondition control did not register -- a broken workspace, not the fixed arm, would explain the offender's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()) +
          " (cell 82)",
      ).toBeDefined();

      // The fixed observable: an undeclared name spelled inside a `par for`
      // body is refused (bug 0224 §Fix (a), `walkIdentExpr`'s new `par-for`
      // arm), so the caller must NOT register.
      expect(
        handle.command("cellblivebad"),
        "an undeclared name spelled inside a `par for` body registered -- pre-fix, `walkIdentExpr` had no `par-for` arm and the node fell into the `default` arm, so the body was never visited. Registered: " +
          JSON.stringify(handle.registeredNames()) +
          " (cell 82)",
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()) + " (cell 82)",
      ).not.toContain("cellblivebad");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"), read off the settled in-memory `SessionManager`: a
      // registration boolean alone cannot distinguish this refusal from any
      // other `theta/parse/*` error blocking the same gate, so the MESSAGE is
      // the assertion, exactly as cell 81 and bug 0140's cell 59 do.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = unknownIdentFragmentCellB("Zzz");
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named " +
          UNKNOWN_IDENT_CODE_CELL_B +
          " for the undeclared name inside the `par for` body -- the fixed arm did not fire. Notes: " +
          JSON.stringify(notes) +
          " (cell 82)",
      ).toBe(true);

      // The CLEAN sibling: a `par for` body that reads only its own loop
      // variable -- resolution arm (1) -- DOES register. Pairs with the
      // refusal above so this cell is not merely "nothing registered".
      expect(
        handle.command("cellblivegood"),
        "the loop-variable-only sibling failed to register -- the fix must not disturb the `par for` variable's own binding. Registered: " +
          JSON.stringify(handle.registeredNames()) +
          " (cell 82)",
      ).toBeDefined();
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});



// ===========================================================================
// Bug 0222 — `checkLetMismatch` (src/parser/query-schema-resolve.ts)
// converted a REFUSED `let` annotation directly instead of consulting the
// `theta/parse/annotation-type-not-expression` withhold six other consumers
// already honoured, so `let a: array<integer--> = @<integer>`x`` drew
// `theta/parse/explicit-schema-mismatch` (W) BESIDE the refusal — a warning
// computed from text the same registry row declares ABSENT to its consumers
// (docs/bugs/0222-qry4-let-mismatch-reads-refused-annotation.md).
//
// WHY REGISTRATION IS NOT THE OBSERVABLE HERE, UNLIKE MOST CELLS IN THIS FILE.
// The refusal itself is error-severity, so `hasLoadParseError`
// (src/extension/production-composition.ts) denies registration whether or
// not the guard this fix adds ever runs — the bug doc's own Sev/Diff estimate
// states it: "no value or dispatch moves". The fixed observable is instead
// WHICH diagnostics land on the theta-system-note channel: the load-phase
// router (`production-composition.ts`, the V4e pre-eval router plus its
// warning arm) delivers every error-severity diagnostic as its own pre-eval
// note AND every warning-severity diagnostic as one `emitDiagnosticBatch`
// note — so the refused annotation's warning, if it fired, would be
// independently visible on this channel beside the refusal note, exactly as
// the unit witness (tests/qry4-refused-annotation-withhold.test.ts, cells
// A1-A3) observes it in the raw diagnostic array. Post-fix, that batch note
// never arrives.
//
// THE LIVENESS CONTROL, ASSERTED FIRST (mirrors A5 of the unit witness). A
// WELL-FORMED mismatched annotation (`let a: string = @<integer>`x``, no
// refusal in play) must still draw the warning note — proving this cell's
// detection method can see the warning message at all, so the subject's
// absence of that same note is attributable to the withhold rather than to a
// broken detector or a channel that never delivers warnings live.
//
// Registration-only: no slash command is invoked on either planted theta, so
// NO model turn runs and the cell spends ZERO tokens (the same profile the
// bug 0100/0118/0203 registration-only cells above claim). No subagent child
// process is spawned, so the #subagent-child-pins convention does not apply
// to this cell. ADDITIVE ONLY: no existing cell in this file is weakened,
// reworded, reordered or deleted.
//
//
// ===========================================================================

const CELL_D_REFUSAL_CODE = "theta/parse/annotation-type-not-expression";
const CELL_D_MISMATCH_CODE = "theta/parse/explicit-schema-mismatch";

/** The sharded registry page carrying both bug-0222 codes' rows. */
const CELL_D_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `theta/parse/annotation-type-not-expression: '<name>' declares a type that
 * is not a theta type expression` — DIAG-4: the message half is READ from the
 * registry row, mirroring this file's `malformedSpecifierListFragment`. This
 * row's Message carries the `<name>` slot, substituted with the binder.
 */
function cellDRefusalFragment(name: string): string {
  const template = registryMessage(CELL_D_REGISTRY, CELL_D_REFUSAL_CODE) as string | undefined;
  expect(
    template,
    `${CELL_D_REFUSAL_CODE} has no registry row — the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  expect(
    template as string,
    `${CELL_D_REFUSAL_CODE}: the '<name>' slot is missing from the live template — the row's ` +
      "Message shape changed and this cell is stale",
  ).toContain("<name>");
  const rendered = (template as string).replaceAll("<name>", name);
  return `${CELL_D_REFUSAL_CODE}: ${rendered}`;
}

/**
 * `theta/parse/explicit-schema-mismatch: explicit @<Schema> ascription is not
 * compatible with binding annotation` — placeholder-free (its one `<…>` token
 * is the literal `@<Schema>` source spelling, not an interpolation slot), so
 * this fragment substitutes nothing, mirroring `malformedSpecifierListFragment`'s
 * placeholder-free guard.
 */
function cellDMismatchFragment(): string {
  const template = registryMessage(CELL_D_REGISTRY, CELL_D_MISMATCH_CODE) as string | undefined;
  expect(
    template,
    `${CELL_D_MISMATCH_CODE} has no registry row — the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  return `${CELL_D_MISMATCH_CODE}: ${template as string}`;
}

/** A `mode: prompt` theta whose sole `let a` binding is followed by the tail `a`. */
function cellDLetTheta(stmt: string): string {
  return ["---", "mode: prompt", "---", stmt, "a", ""].join("\n");
}

describe("H8a-T — bug 0222: the QRY-4 explicit-schema check withholds a refused `let` annotation, live (Convention: live-host acceptance)", () => {
  it("a `let` annotation array<integer--> refused by the parser draws the refusal alone on the theta-system-note channel, with no explicit-schema-mismatch warning beside it (cell 83)", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Liveness control (mirrors unit-witness A5): a WELL-FORMED mismatched
      // annotation, no refusal anywhere in the program. Registers (the
      // mismatch is warning-severity only) and must carry the warning note —
      // proving this cell's detector actually sees that note when it fires.
      {
        source: "project",
        stem: "b222livewarn",
        text: cellDLetTheta("let a: string = @<integer>`x`"),
      },
      // The subject: the array-wrapped refused annotation this bug names.
      // Refused at parse (error-severity), so `hasLoadParseError` denies
      // registration either way — the fixed observable is the ABSENCE of the
      // warning note beside the refusal note, not registration.
      {
        source: "project",
        stem: "b222livesubject",
        text: cellDLetTheta("let a: array<integer--> = @<integer>`x`"),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // The liveness control registers (warning-only) and its note carries the
      // mismatch fragment, asserted FIRST so a dead detector or a channel that
      // never delivers warnings live cannot be mistaken for the subject's fix.
      expect(
        handle.command("b222livewarn"),
        "the well-formed mismatched-annotation control did not register — a broken workspace, " +
          "not the withhold under test, would explain the subject's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      const controlNotes = systemNoteContents(handle.sessionManager.getEntries());
      const mismatchFragment = cellDMismatchFragment();
      expect(
        controlNotes.some((note) => note.includes(mismatchFragment)),
        "the well-formed mismatch control fired no explicit-schema-mismatch note — this cell's " +
          "detector cannot see that channel at all, so the subject's silence below would be " +
          "vacuous. Notes: " + JSON.stringify(controlNotes),
      ).toBe(true);

      // The subject: refused at parse, so it never registers — unchanged by
      // this fix, and asserted so a regression that ALSO stopped refusing the
      // junk annotation cannot be mistaken for the fix under test.
      expect(
        handle.command("b222livesubject"),
        "the array<integer--> annotation registered — the refusal (independent of this bug) did " +
          "not fire. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();

      // The fixed observable: the refusal note fires ALONE. Pre-fix,
      // `checkLetMismatch` converted the refused text directly and a second
      // `explicit-schema-mismatch` note landed beside it; post-fix, the guard
      // this bug adds withholds the annotation before any conversion runs, so
      // no such note arrives.
      // Scoped to the subject theta's OWN notes: `systemNoteContents` reads
      // the full session entry list, which also carries the liveness
      // control's legitimate warning note (from `b222livewarn`) — an
      // unscoped read would find that note and misattribute it to the
      // subject, so every note is filtered to the ones citing the subject's
      // own planted file path first.
      const allNotes = systemNoteContents(handle.sessionManager.getEntries());
      const subjectNotes = allNotes.filter((note) => note.includes("b222livesubject.theta"));
      expect(
        subjectNotes.length > 0,
        "no theta-system-note entry cited b222livesubject.theta at all, so this cell cannot " +
          "distinguish the subject's notes from the control's. All notes: " +
          JSON.stringify(allNotes),
      ).toBe(true);
      const refusalFragment = cellDRefusalFragment("a");
      expect(
        subjectNotes.some((note) => note.includes(refusalFragment)),
        "no theta-system-note entry named the annotation-type-not-expression refusal for the " +
          "array<integer--> annotation. Notes: " + JSON.stringify(subjectNotes),
      ).toBe(true);
      expect(
        subjectNotes.some((note) => note.includes(mismatchFragment)),
        "an explicit-schema-mismatch note fired beside the refusal for the array<integer--> " +
          "annotation — the withhold bug 0222 adds did not gate `checkLetMismatch`, so the " +
          "warning was still computed from text the refusal's own registry row declares ABSENT " +
          "to its consumers. Notes: " + JSON.stringify(subjectNotes),
      ).toBe(false);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});


// ===========================================================================
// bug 0220: a root `void` `fn`-return annotation now supplies NO QRY-2 sink, so
// a bare `@`-query in that fn's tail position registers and drives instead of
// refusing at load with a query-ranged `theta/parse/void-in-non-return-position`
// for a `void` the author wrote only at the return position (grammar.md:89).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESSES DO NOT.
// `tests/fn-return-void-query-sink.test.ts` and the group-(f) pin flip in
// `tests/let-annotation-query-double-emission.test.ts` pin the diagnostic list
// and `QueryExpr.schema` at the `parseThetaDocument` boundary; this cell drives
// the same input through the SHIPPED `createAgentSession` composition (real
// discovery, real `session.bindExtensions({})`, the real registration gate),
// and then drives a REAL model turn on the surviving document, so the
// post-fix path is exercised end to end, not just at the parse boundary.
//
// The fn under test is declared but never called: `SchemaSinkRewriter`'s `fn`
// arm resolves the sink at PARSE time regardless of call sites (bug 0220
// §Reproduction), so the refusal (pre-fix) or its absence (post-fix) is fully
// decided before any slash is driven, and the one model turn this cell spends
// belongs to the document's own top-level sentinel query, not to the
// never-called `f`.
// ===========================================================================

/** `theta/parse/void-in-non-return-position`'s registered code (bug 0220 Fix; code-registry-parse.md). */
const VOID_IN_NON_RETURN_CODE_CELL_B2 = "theta/parse/void-in-non-return-position";
const VOID_IN_NON_RETURN_REGISTRY_CELL_B2 = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../docs/spec_topics/diagnostics/code-registry-parse.md",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as { code: string; message: string }[];

/**
 * `theta/parse/void-in-non-return-position: 'void' is only permitted as a
 * function or theta return type` -- DIAG-4: the message half is read from the
 * registry row, not transcribed, mirroring this file's `nestedFnFragmentCellB2`
 * and `unknownIdentFragmentCellB` helpers above.
 */
function voidInNonReturnFragmentCellB2(): string {
  const message = registryMessage(
    VOID_IN_NON_RETURN_REGISTRY_CELL_B2,
    VOID_IN_NON_RETURN_CODE_CELL_B2,
  ) as string | undefined;
  expect(
    message,
    `${VOID_IN_NON_RETURN_CODE_CELL_B2} has no registry row -- the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  return `${VOID_IN_NON_RETURN_CODE_CELL_B2}: ${message as string}`;
}

// Drive discriminators are ANSWERS to task questions over the theta's own
// computed text -- deterministic content a degraded plain-prompt run cannot
// produce. A verbatim-echo demand ("reply with exactly this") reads as prompt
// injection to current models and draws refusals: the sentinel-refusal class
// filed as bug 0243.
/** The deterministic answer a successful drive of the subject theta must contain. */
const VOID_SINK_SENTINEL_CELL_B2 = "782";

/**
 * The subject (bug 0220 §Reproduction v1): a root `void`-returning `fn` whose
 * tail is a bare `@`-query, plus a top-level sentinel query so a successful
 * registration can actually be DRIVEN. `f` is declared, never called: the sink
 * resolution that decides the refusal runs at parse time over the declaration
 * alone.
 */
const VOID_RETURN_QUERY_TAIL_CELL_B2 = [
  "---",
  "mode: prompt",
  "---",
  "fn f(): void {",
  "  @`hi`",
  "}",
  "@`What is 254 plus 528? Answer with the number only.`",
  "",
].join("\n");

describe("cell 84 (bug 0220): a root `void` fn-return sink supplies no QRY-2 sink, so the tail query registers and drives (Convention: live-host acceptance)", () => {
  it("registers and drives to normal completion with no void-in-non-return-position refusal note, where pre-fix the same document refused to register", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work -- mirrors cell 81/82's
      // precondition control above.
      {
        source: "project",
        stem: "cellb2livectl",
        text: promptTheta("VOIDSINKQUERY-CONTROL"),
      },
      {
        source: "project",
        stem: "cellb2livesubj",
        text: VOID_RETURN_QUERY_TAIL_CELL_B2,
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("cellb2livectl"),
        "the precondition control did not register -- a broken workspace, not the fixed arm, would explain the subject's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()) +
          "",
      ).toBeDefined();

      // The fixed observable: a root `void` fn-return sink no longer draws a
      // diagnostic, so the subject REGISTERS (pre-fix it did not: the arm's
      // guard admitted the propagated "void" text and the query-ranged
      // `void-in-non-return-position` blocked the registration gate).
      expect(
        handle.command("cellb2livesubj"),
        "the root-`void` fn-return subject did not register -- pre-fix, `SchemaSinkRewriter`'s `fn` arm supplied a sink frame for the root `void` annotation, `resolveQuery` wrote \"void\" into `QueryExpr.schema`, and `walkExpr`'s `query` arm re-walked it at `\"value\"`, refusing the load. Registered: " +
          JSON.stringify(handle.registeredNames()) +
          "",
      ).toBeDefined();

      // Drive the subject for real: the top-level sentinel query is the ONLY
      // query that spends a model turn (`f` is never called), so this is the
      // minimal live exercise of the surviving, now-loadable document.
      const turn = await driveSlashCaptureTurn(handle, "/cellb2livesubj");

      // The theta-system-note channel (AGENTS.md §"Assert on real
      // observables"): the fixed observable is the ABSENCE of the refusal
      // note, read off the settled in-memory `SessionManager` -- not merely
      // `prompt()` resolving, which a fail-closed drive would do too.
      const expectedFragment = voidInNonReturnFragmentCellB2();
      expect(
        turn.systemNotes.some((note) => note.includes(expectedFragment)),
        "a theta-system-note entry named " +
          VOID_IN_NON_RETURN_CODE_CELL_B2 +
          " was present on the drive -- the query-ranged refusal fired even though the document " +
          "registered. Notes: " +
          JSON.stringify(turn.systemNotes) +
          "",
      ).toBe(false);
      expect(
        turn.systemNotes,
        "the drive carried a theta-system-note entry of some other kind -- not a normal " +
          "completion. Notes: " +
          JSON.stringify(turn.systemNotes) +
          "",
      ).toEqual([]);

      // The drive's normal completion: the streamed assistant text carries the
      // deterministic answer to the arithmetic question the top-level query
      // asked (254 + 528 = 782).
      expect(
        turn.text.includes(VOID_SINK_SENTINEL_CELL_B2),
        "the drive did not complete normally -- streamed text: " +
          JSON.stringify(turn.text) +
          "",
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0158 (cell 86) -- `#typeExpr`'s `case "match"` (static-type-inference.ts)
// routed a heterogeneous `match`'s arm-body types through the array/ternary
// union LUB `#commonType`, while the checker's own `checkMatchArmTypes` (via
// `leastUpperBound`, match-result.ts) stayed dominating-member-only and
// refuses the identical arm-type set with the registered `E`-severity
// `theta/parse/match-arm-type-mismatch`
// (docs/bugs/0158-match-arm-and-fn-return-lub-diverge-from-common-type.md).
// Route B, B7 option (i): `case "match"` now reduces the arm types through
// the new private `#matchArmType` -- the same dominating-member discipline,
// falling back to the first arm when none dominates -- so the pass never
// answers a type the checker refuses on the same node. The 26-cell unit
// witness (tests/match-fn-return-lub-dominating-discipline.test.ts) proves
// this offline at the `parseThetaDocument`/raw-`typeOf` boundary (cells B1,
// B3, D2). This cell proves the SAME disposition end to end through the real
// production composition root (session_start -> resources_discover ->
// composeExtensionInstance -> checkTypeLayer): a heterogeneous `match` still
// REFUSES REGISTRATION under the registered *Trigger* the corrected spec
// sentences now name, while its dominating-arm twin registers and RUNS --
// the fixed path had zero live coverage before this addition. ADDITIVE ONLY:
// no existing cell in this file is weakened, reworded, reordered or deleted.
// ===========================================================================

const MATCH_ARM_TYPE_MISMATCH_CODE = "theta/parse/match-arm-type-mismatch";

/**
 * `theta/parse/match-arm-type-mismatch: match arm body type does not match
 * the common type of the other arms` -- DIAG-4: the message half is read
 * from the same sharded registry page `ARRAY_NO_COMMON_TYPE_REGISTRY` already
 * parses (`code-registry-parse.md` carries both rows), mirroring this file's
 * `arrayNoCommonTypeFragment`. The row carries no `<...>` placeholder, so
 * this helper substitutes nothing; the trailing assertion is a drift guard,
 * not a fill check.
 */
function matchArmTypeMismatchFragment(): string {
  const template = registryMessage(
    ARRAY_NO_COMMON_TYPE_REGISTRY,
    MATCH_ARM_TYPE_MISMATCH_CODE,
  ) as string | undefined;
  expect(
    template,
    `${MATCH_ARM_TYPE_MISMATCH_CODE} has no registry row -- the code this ` +
      "cell asserts is not registered (DIAG-2)",
  ).toBeTypeOf("string");
  const message = template as string;
  expect(
    message,
    `${MATCH_ARM_TYPE_MISMATCH_CODE}: the registry row's Message template ` +
      "grew an unsubstituted <...> placeholder this reader does not fill -- " +
      "the row changed shape",
  ).not.toMatch(/<[a-z]+>/);
  return `${MATCH_ARM_TYPE_MISMATCH_CODE}: ${message}`;
}

/**
 * The bug doc's own headline row (SS Reproduction n3/t1): no member of
 * `[integer, string]` dominates the other, so `leastUpperBound` answers
 * `undefined` and `checkMatchArmTypes` fires the registered row. Pre-fix the
 * inference pass answered the union `integer | string` for the same arm-type
 * array (an internal divergence, invisible at this boundary because the
 * checker already refused); this theta must NOT register, unchanged by the
 * fix.
 */
function heterogeneousMatchArmTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "let m = match 1 { 1 => 1, _ => \"a\" }",
    "m",
    "",
  ].join("\n");
}

/**
 * The dominating-arm twin (SS Reproduction t3/d3): `number` is a MEMBER of
 * `[integer, number]` (TYPE-2 widening), so both `#matchArmType` and
 * `leastUpperBound` agree and admit it STATICALLY. The scrutinee `1` matches
 * pattern `1`, so the arm that actually executes at runtime is `1 => 1` --
 * the integer value the interpolation below asserts on. The match result is
 * threaded into the top-level query's interpolation so the live drive
 * actually RUNS the fixed `case "match"` arm at runtime, not merely at
 * registration.
 */
function dominatingMatchArmTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "let m = match 1 { 1 => 1, _ => 2.5 }",
    // COMPUTE-FROM-INLINE-VALUE (bug 0243): the answer is producible only from
    // the theta-computed `m`, so a degraded plain-prompt run (where `m` never
    // exists) cannot green this drive.
    "@`A match produced the value ${m}. What is that value plus 478? Answer with the number only.`",
    "",
  ].join("\n");
}

describe("H8a-T -- bug 0158: a heterogeneous `match` still refuses registration under its registered *Trigger*, while its dominating-arm twin registers and runs, live (cell 86) (Convention: live-host acceptance)", () => {
  it("refuses the heterogeneous `match` at registration and drives the dominating-arm twin to normal completion through the real discovery->registration->checkTypeLayer path (cell 86)", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work -- without this, either
      // sibling's status could be (wrongly) attributed to a broken workspace
      // instead of the bug 0158 disposition under test.
      { source: "project", stem: "b158livectl", text: promptTheta("THETA-LIVE-OK") },
      // THE REFUSED OBSERVABLE -- no member of `[integer, string]` dominates,
      // so `checkMatchArmTypes` fires `theta/parse/match-arm-type-mismatch`
      // (the registered *Trigger* THE STATED LAW makes normative) and
      // registration is denied before any sink reads the pass's internal
      // arm-type reduction.
      { source: "project", stem: "b158livebad", text: heterogeneousMatchArmTheta() },
      // THE FIXED OBSERVABLE -- a dominating member (`number`) admits on both
      // the inference pass's `#matchArmType` and the checker's
      // `leastUpperBound`; the document registers and the match result flows
      // into a real live turn.
      { source: "project", stem: "b158livegood", text: dominatingMatchArmTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b158livectl"),
        "the precondition control did not register -- a broken workspace, not " +
          "the bug 0158 disposition under test, would explain either " +
          "sibling's status too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // THE REFUSED OBSERVABLE (cell 86) -- the heterogeneous `match` does not
      // register through the REAL production composition root.
      expect(
        handle.command("b158livebad"),
        "`match 1 { 1 => 1, _ => \"a\" }` registered through the live " +
          "discovery/session_start path -- `theta/parse/match-arm-type-mismatch` " +
          "did not fire live, so the dominating twin's registration below would " +
          "prove nothing. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).not.toContain("b158livebad");

      // THE FIXED OBSERVABLE -- the dominating-arm twin registers.
      expect(
        handle.command("b158livegood"),
        "`match 1 { 1 => 1, _ => 2.5 }` did not register through the live " +
          "discovery/session_start path -- the dominating-member reduction " +
          "(`#matchArmType`) did not admit it live. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Drive the dominating twin for real: the top-level sentinel query is
      // the ONLY query in the document, so this is the minimal live exercise
      // of the fixed `case "match"` arm at runtime, not merely at
      // registration.
      const turn = await driveSlashCaptureTurn(handle, "/b158livegood");

      // The theta-system-note channel (AGENTS.md SS"Assert on real
      // observables"): the dominating twin's drive must carry NO err note --
      // not merely `prompt()` resolving, which a fail-closed drive would do
      // too.
      expect(
        turn.systemNotes,
        "the dominating-arm twin's drive carried a theta-system-note entry -- " +
          "not a normal completion. Notes: " + JSON.stringify(turn.systemNotes),
      ).toEqual([]);

      // The drive's normal completion: the streamed assistant text carries
      // the arithmetic answer computed from the match result, proving the
      // match ran (not merely registered) and produced the dominating arm's
      // type at runtime.
      // 1 + 478 = 479, computable only from the runtime match result `m`.
      expect(
        turn.text.includes("479"),
        "the dominating-arm twin's drive did not complete normally -- " +
          "streamed text: " + JSON.stringify(turn.text),
      ).toBe(true);

      // The refused sibling's own theta-system-note channel, read off the
      // planted refusal itself (not the drive above, since the refused
      // sibling never registered a command to drive): its load-time delta
      // must carry the registered *Message* verbatim.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = matchArmTypeMismatchFragment();
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named the match-arm-type-mismatch " +
          "rejection for the heterogeneous sibling. Notes: " +
          JSON.stringify(notes),
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});

// ===========================================================================
// Bug 0273 (cell 89) -- `queryResponseAnnotation` (`src/parser/theta-document.ts`)
// peels a `Result<T, E>` annotation down to `T` before `walkExpr`'s `"query"`
// arm resolves names in it, so an author-written head in the `E` argument was
// never presented to the resolver: ``let a: Result<integer, Nope> = @`q` ``
// loaded with an EMPTY diagnostic list and REGISTERED, while the identical
// `E`-side head refuses at an `fn` return, an `fn` parameter and a non-query
// `let` (docs/bugs/0273-propagated-result-error-side-unresolved-name-silent.md
// SS Reproduction rows a and e-i). SS Fix keeps the peel as the text the
// position-rule walk consumes and resolves `args[1]` beside it, through the new
// sibling `queryErrorModelAnnotation`, against
// `withBuiltinErrorModelNames(refs.typeNames)` -- so
// `theta/parse/unresolved-named-type` now fires at the query expression's range
// and the theta is not registered.
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/b0273-query-result-error-side-unresolved-name.test.ts` pins the
// diagnostic bytes, the emission count, the position of the surviving line and
// every SS Non-goals bound at the `parseThetaDocument` boundary. No offline cell
// observes the real discovery -> registration path deciding whether a `.theta`
// carrying an undeclared `E` head becomes a slash command at all, nor the
// declared-`E` twin still registering and DRIVING a real model turn. This cell
// drives both through the shipped production composition root
// (`bootShippedExtension`: session_start -> resources_discover ->
// composeExtensionInstance -> the registration gate), on cell 86's idioms.
//
// WHY THE DECLARED-`E` TWIN, NOT THE BUILTIN `QueryError` SPELLING, IS THE
// CONTROL. SS Reproduction offers both negative controls (rows l and m). Row l --
// `schema Nope { a: number }` beside the same annotation -- differs from the
// offender by the DECLARATION ALONE, so the registration delta between the two
// planted thetas is attributable to name resolution and to nothing else. Row
// m's `Result<integer, QueryError>` differs by the HEAD as well and is admitted
// by the builtin error-model admission rather than by resolution, so it would
// leave "the new resolution refuses every `E` head" indistinguishable from the
// settled behaviour. Row m's no-move is already discharged corpus-wide by
// `tests/committed-fixture-parse-gate.test.ts` over the shipped
// `docs/examples/personas.thetalib`.
//
// THE POSITIVE CONTROL FOR THE ABSENCE ASSERTION. An absence assertion that
// cannot red is worthless, so two registrations are asserted BEFORE the
// offender's absence is read: an ordinary sibling theta in the SAME workspace
// (`b0273livectl`, cell 81/82/84/86's precondition control) and the
// declared-`E` twin itself. A broken workspace or a dead discovery walk reds on
// those instead of passing silently as an "absent" offender.
//
// TOKEN COST: ONE live turn (the declared-`E` twin's task-question answer). The
// offender half is registration-only -- its refusal is decided at load, before
// any drive is attempted, so it spends nothing.
//
// SUBAGENT CHILD PINS: both thetas are `mode: prompt` and drive no `invoke`, so
// the RFC-0006 child launch is not reached; the shared `./harness` sets BOTH
// #subagent-child-pins plus the parent-pid carriage at module scope regardless,
// which is AGENTS.md's requirement for any in-process harness that CAN reach it.
//
// ADDITIVE ONLY: no existing cell in this file is weakened, reworded, reordered
// or deleted.
// ===========================================================================

/** The row the `E`-side resolution emits (`code-registry-parse.md`); its *Message* does not move. */
const UNRESOLVED_NAMED_TYPE_CODE_CELL_89 = "theta/parse/unresolved-named-type";

/**
 * `theta/parse/unresolved-named-type: unresolved named type 'Nope'` -- DIAG-4:
 * the message half is READ from the registry row and its `<name>` placeholder
 * filled, never transcribed, from the same sharded page
 * `ARRAY_NO_COMMON_TYPE_REGISTRY` already parses (mirrors cell 86's
 * `matchArmTypeMismatchFragment`). The placeholder assertion fails loudly on a
 * row that changed shape rather than letting an unsubstituted template through.
 */
function unresolvedNamedTypeFragmentCell89(name: string): string {
  const template = registryMessage(
    ARRAY_NO_COMMON_TYPE_REGISTRY,
    UNRESOLVED_NAMED_TYPE_CODE_CELL_89,
  ) as string | undefined;
  expect(
    template,
    `${UNRESOLVED_NAMED_TYPE_CODE_CELL_89} has no registry row -- the code this cell asserts is not registered (DIAG-2) (cell 89)`,
  ).toBeTypeOf("string");
  const message = template as string;
  expect(
    message,
    `${UNRESOLVED_NAMED_TYPE_CODE_CELL_89}: the registry row's Message template no longer carries the <name> placeholder this reader fills -- the row changed shape (cell 89)`,
  ).toContain("<name>");
  return `${UNRESOLVED_NAMED_TYPE_CODE_CELL_89}: ${message.replace("<name>", name)}`;
}

/**
 * THE OFFENDER (SS Reproduction row a): the propagated route. The `let`
 * annotation is written verbatim onto the bare-query initialiser, so the whole
 * `Result<integer, Nope>` text reaches the `@<T>` query capture; `Nope` is
 * declared nowhere in the fixture. Never driven -- the refusal is decided at
 * load -- so its query text costs nothing.
 */
const E_SIDE_UNDECLARED_CELL_89 = [
  "---",
  "mode: prompt",
  "---",
  "let a: Result<integer, Nope> = @`What is 306 plus 218? Answer with the number only.`",
  '"ok"',
  "",
].join("\n");

// Drive discriminators are ANSWERS to task questions over the theta's own
// computed value -- deterministic content a degraded plain-prompt run cannot
// produce. A verbatim-echo demand ("reply with exactly this") reads as prompt
// injection to current models and draws refusals: the sentinel-refusal class
// filed as bug 0243.
/** `n` = 306 + 218 = 524 reaches the prompt body; only that value affords 865. */
const DECLARED_E_SENTINEL_CELL_89 = "865";

/**
 * THE DECLARED-`E` TWIN (SS Reproduction row l): the offender plus a
 * declaration of the head, which is the only delta. The `E`-side resolution
 * admits it, so the document registers and drives. The final untyped query is
 * the drive discriminator: it interpolates the theta-computed `n`, so the
 * answer is producible only from a run in which the theta's own arithmetic
 * reached the prompt. The typed query above it asks a different sum (471 plus
 * 133 = 604), colliding with neither the rendered 524 nor the sentinel 865; it
 * is bound WITHOUT `?`, so its outcome is a value rather than a fail-closed
 * ending -- the note channel reads the drive's completion, not provider luck.
 */
const DECLARED_E_HEAD_CELL_89 = [
  "---",
  "mode: prompt",
  "---",
  "schema Nope { a: number }",
  "let a: Result<integer, Nope> = @`What is 471 plus 133? Answer with the number only.`",
  "let n = 306 + 218",
  "@`A computation produced the value ${n}. What is that value plus 341? Answer with the number only.`",
  "",
].join("\n");

describe("H8a-T -- bug 0273: an undeclared head in a `Result<T, E>` annotation's `E` argument denies registration at the query capture, while the declared-`E` twin registers and drives, live (cell 89) (Convention: live-host acceptance)", () => {
  it("refuses the undeclared `E` head at registration with theta/parse/unresolved-named-type on the theta-system-note channel, and drives the declared-`E` twin to normal completion through the real discovery->registration path (cell 89)", async () => {
    // ATTRIBUTION GUARD (offline, token-free, ahead of the live host): the
    // offender must carry exactly the one refusal and the twin must be clean,
    // so neither live observable below can be produced by an unrelated load
    // failure. Without the `E`-side resolution the offender's list is EMPTY,
    // which is bug 0273's symptom, and this guard is what reds first, with zero
    // tokens spent.
    expect(
      parseDoc(E_SIDE_UNDECLARED_CELL_89, "b0273livebad.theta").diagnostics.map((d) => d.code),
      "attribution: the undeclared-`E` offender must carry exactly one diagnostic, " +
        UNRESOLVED_NAMED_TYPE_CODE_CELL_89 +
        " -- an EMPTY list here IS bug 0273's symptom (the peel handed the arm `T` alone, so `Nope` never reached the resolver) (cell 89)",
    ).toEqual([UNRESOLVED_NAMED_TYPE_CODE_CELL_89]);
    expect(
      parseDoc(DECLARED_E_HEAD_CELL_89, "b0273livegood.theta").diagnostics.map((d) => d.code),
      "attribution: the declared-`E` twin must carry zero diagnostics -- resolving the `E` argument must refuse an UNRESOLVABLE head, never the position (SS Non-goals: the builtin admission and a declared head stay silent) (cell 89)",
    ).toEqual([]);

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, so an
      // absent offender cannot be misattributed to a broken workspace instead
      // of the bug 0273 disposition under test.
      { source: "project", stem: "b0273livectl", text: promptTheta("B0273-LIVE-OK") },
      // THE REFUSED OBSERVABLE -- the `E`-side head resolves against no
      // declaration, so the E-severity row blocks the registration gate.
      { source: "project", stem: "b0273livebad", text: E_SIDE_UNDECLARED_CELL_89 },
      // THE ADMITTED OBSERVABLE -- the same annotation with its head declared.
      { source: "project", stem: "b0273livegood", text: DECLARED_E_HEAD_CELL_89 },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b0273livectl"),
        "the precondition control did not register -- a broken workspace, not the resolved `E` argument, would explain the offender's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()) +
          " (cell 89)",
      ).toBeDefined();
      // The positive control for the absence assertion below: a REAL
      // registration the same detector sees, in the same workspace, through the
      // same walk.
      expect(
        handle.command("b0273livegood"),
        "the declared-`E` twin did not register -- with no observable registration in this workspace the offender's absence proves nothing. Registered: " +
          JSON.stringify(handle.registeredNames()) +
          " (cell 89)",
      ).toBeDefined();

      // OBLIGATION 1 -- the offender is ABSENT from the registered set: no
      // command object, and the name is not in the registered list. A theta
      // whose error-model head resolves to nothing is not registrable and so
      // not drivable.
      expect(
        handle.command("b0273livebad"),
        "``let a: Result<integer, Nope> = @`q` `` registered through the live discovery/session_start path -- the `E` argument is still peeled away unresolved, so an annotation naming a declaration-free type became a slash command. Registered: " +
          JSON.stringify(handle.registeredNames()) +
          " (cell 89)",
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()) + " (cell 89)",
      ).not.toContain("b0273livebad");

      // The refusal's own text, off the settled in-memory `SessionManager`
      // (AGENTS.md SS "Assert on real observables"): the load-time diagnostic
      // fires before any drive, so the full entry list already carries it. The
      // rendered head is `Nope` -- a note naming anything else would mean the
      // resolution is reporting text the source does not contain.
      const notes = systemNoteContents(handle.sessionManager.getEntries());
      const expectedFragment = unresolvedNamedTypeFragmentCell89("Nope");
      expect(
        notes.some((note) => note.includes(expectedFragment)),
        "no theta-system-note entry named " +
          UNRESOLVED_NAMED_TYPE_CODE_CELL_89 +
          " with the head `Nope` for the offender -- its absence from the registered set alone does not show WHY it is absent. Notes: " +
          JSON.stringify(notes) +
          " (cell 89)",
      ).toBe(true);

      // OBLIGATION 2 -- the declared-`E` twin drives one real turn to normal
      // completion. `driveSlashCaptureTurn` reads the per-drive
      // `theta-system-note` slice and the streamed text off the settled
      // transcript; a fail-closed drive resolves too, so the notes are what
      // separate completion from failure.
      const turn = await driveSlashCaptureTurn(handle, "/b0273livegood");
      expect(
        turn.systemNotes,
        "the declared-`E` twin's drive appended a theta-system-note (an err note, a cancelled note or a panic framing) -- not a normal completion. Notes: " +
          JSON.stringify(turn.systemNotes) +
          " (cell 89)",
      ).toEqual([]);
      expect(
        turn.text.includes(DECLARED_E_SENTINEL_CELL_89),
        "the declared-`E` twin's drive did not answer the task question over the value rendered into the discriminator's prompt body (524 + 341 = 865) -- streamed text: " +
          JSON.stringify(turn.text) +
          "; userTexts: " + JSON.stringify(turn.userTexts) + " (cell 89)",
      ).toBe(true);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
