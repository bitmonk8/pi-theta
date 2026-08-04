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
