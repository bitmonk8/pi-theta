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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../../tools/code-registry/index.js";
import { INTERPOLATED_RESULT_CODE } from "../../src/render/query-render";

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
// `composeExtensionInstance` → `discoverAndComposeFixtures` →
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
// `discoverAndComposeFixtures` → `checkInvokeStaticResolution` path settles)
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
// `discoverAndComposeFixtures` → `resolveThetaToolsAtLoad` path settles)
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
    '@`SITE1=J${p}|SITE2=J${P { a: "x", b: 1 }}|END reply with exactly: OK`',
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
      ).toEqual(['SITE1=J{"b":1,"a":"x"}|SITE2=J{"b":1,"a":"x"}|END reply with exactly: OK']);
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
// (grammar.md:175) already consumes.
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
// type-layer-checks.ts:1220) — fell to the sentinel `{ kind: "named", name:
// "index" }`, an unresolvable name every downstream check defers on
// (type-system.md:48). `theta/parse/unknown-method` (E-severity) is one of
// six registered codes measured absent on the sentinel; `hasLoadParseError`
// (production-composition.ts:2045–2052, applied at :2092) had nothing to act
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
// (production-composition.ts:2045–2052, applied at :2092) un-registers the
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
// (src/lexer/lexer.ts:810-851), reaches only the `let` / `let mut`, `fn`-NAME
// and `schema`/`enum`-NAME positions through its keyword-adjacency dispatch
// (`:876-886`) — a parameter name follows `(` or `,`, not a keyword, so no
// call reaches it, and `parseFn`'s parameter loop
// (src/parser/theta-document.ts:2151) took the name token and dropped
// everything but its `.text`
// (docs/bugs/0139-fn-parameter-name-case-rule-unenforced.md).
// `fn h(P: string): number { 1 }` loaded with zero diagnostics and
// registered.
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
// (production-composition.ts:2045–2052, applied at :2092) un-registers the
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


// ===========================================================================
// Bug 0148 — `checkName`'s reserved-keyword arm (src/lexer/lexer.ts:819–828) is
// reached through a three-branch keyword scan (`:876–886`) that no parameter
// name enters, so a reserved spelling at a `fn` parameter name — a
// `keyword`-kind token (src/lexer/lexer.ts:677) — is the parser leaf's to
// classify: `parseFn`'s parameter loop draws the code on its keyword arm,
// beside the `ident` guard (src/parser/theta-document.ts:2211) that carries bug
// 0139's case code, as docs/spec_topics/lexical.md:20 and the position-free
// *Trigger* at docs/spec_topics/diagnostics/code-registry-parse.md:21 require
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
// `hasLoadParseError` (production-composition.ts:2047–2054, applied at `:2094`)
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
// `E`, so `hasLoadParseError` (production-composition.ts:2047–2054, applied at
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
    "@`Reply with exactly: GOOD=${okOutcome} BAD=${badOutcome}`",
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
// binder-model-resolution step (production-composition.ts:2094's
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
    "@`" + B66_SENTINEL + " topic=${topic} pick=${pick}. Reply with exactly: done.`",
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
    "@`SEVCROSS=${v == Sev.High}|END reply with exactly: OK`",
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
      // THE FIXED OBSERVABLE. runtime-value-model.md:34 — the inbound pass
      // reattaches the declaring-enum tag "so the resulting value compares
      // equal to a locally constructed variant of the same enum"; pre-fix the
      // bound value is a bare wire string and `valuesEqual`'s cross-type arm
      // renders this segment `false`.
      expect(
        anchored![1],
        "runtime-value-model.md:34 — a named-enum value returned by a " +
          "subagent-mode callee across a typed invoke<Sev> must compare equal " +
          "to the caller's own variant of the same enum; a bare untagged " +
          "string takes valuesEqual's cross-type arm and renders `false`. " +
          "Rendered segment: " + JSON.stringify(anchored![1]),
      ).toBe("true");
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
    "@`" + B166_SENTINEL + " topic=${topic} p=${p}. Reply with exactly: done.`",
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
// a THIRD rule, behind the bug-0059 type-half suppression guard
// (src/parser/params.ts:349) and ahead of the bug-0102 raw-newline rule
// (:380) and the is-literal call (:390) — a `defaultSource` that is empty or
// whitespace-only after trim draws the new registered code
// `theta/parse/default-without-literal` and the error gate (:426) then
// withholds the lowered document, so the theta never registers at all.
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
    "@`" + B165_SENTINEL + " topic=${topic} p=${p}. Reply with exactly: done.`",
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
      // register. The slash argument names only the required `topic` field,
      // so the binder omits `p` per its own system prompt's last line and the
      // runtime's fill-if-absent supplies the declared default
      // (defaulting-system-note-echo.md:9) — the recovered value is the
      // string literal's own content (`"ok"`), the direction that must
      // survive the new refusal untouched.
      const turn = await driveSlashCaptureTurn(handle, "/b165livewf hello");
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
    "@`B2CROSS=${v == Sev.High}|END reply with exactly: OK`",
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
      // THE FIXED OBSERVABLE. tool-calls.md's registered-theta return-type row
      // (return type by CALLEE INFERENCE) + runtime-value-model.md's
      // Wire-name-translation inbound bullet — the pass reattaches the
      // declaring-enum tag "so the resulting value compares equal to a
      // locally constructed variant of the same enum"; pre-fix
      // `#resolveCallAsInvoke` passed `returnSchema: null` so neither AJV nor
      // the pass ran, and the bound value is a bare wire string that renders
      // this segment `false`.
      expect(
        anchored![1],
        "runtime-value-model.md's inbound Wire-name-translation bullet + " +
          "tool-calls.md's registered-theta return-type row — a named-enum " +
          "value returned by a tools:-routed `.theta`-callable call must " +
          "compare equal to the caller's own variant of the same enum; a bare " +
          "untagged string takes valuesEqual's cross-type arm and renders " +
          "`false`. Rendered segment: " + JSON.stringify(anchored![1]),
      ).toBe("true");
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
    "@`PPCROSS=${v == Sev.High}|END reply with exactly: OK`",
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
      // THE FIXED OBSERVABLE. invocation.md:36 — "the final value still
      // propagates through the same return surface", mode-invariantly; :55 —
      // the callee's mode selects conversation isolation, not validation.
      // Pre-fix the boxed String carrier reaches AJV unnormalised on this
      // cell and the invoke Errs, so this segment never renders at all (the
      // assertion above catches that red first).
      expect(
        anchored![1],
        "docs/bugs/0174 — a named-enum value returned by a PROMPT-mode " +
          "callee across a typed invoke<Sev> on the prompt→prompt ATTACH " +
          "cell must compare equal to the caller's own variant of the same " +
          "enum. Rendered segment: " + JSON.stringify(anchored![1]),
      ).toBe("true");
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
    "@`Reply with exactly: GOOD=${okOutcome} BAD=${badOutcome}`",
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
    "@`SEVCROSS=${v == Sev.High}|END reply with exactly: OK`",
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
      // THE FIXED OBSERVABLE. runtime-value-model.md:34's union clause — at a
      // `{"anyOf":[…]}` position the walk re-tests the value against each arm
      // in source order and translates under the first that admits it; arm 0
      // here is the `Sev` `$ref`, which admits the envelope's bare wire string
      // and reattaches the tag. Pre-fix the union position addressed no map
      // at all and the value crossed untouched — a bare untagged string takes
      // `valuesEqual`'s cross-type arm and renders `false`.
      expect(
        anchored![1],
        "runtime-value-model.md:34 (union clause) — a named-enum value " +
          "returned by a subagent-mode callee across a typed " +
          "invoke<Sev | null> must dispatch to the first admitting arm and " +
          "compare equal to the caller's own variant of the same enum; a bare " +
          "untagged string takes valuesEqual's cross-type arm and renders " +
          "`false`. Rendered segment: " + JSON.stringify(anchored![1]),
      ).toBe("true");
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
      " topic=${topic} sev=${sev} tagged=${sev == Sev.High}. Reply with exactly: done.`",
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
