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
