import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  createThetaExtension,
  type ThetaExtensionDeps,
} from "../src/extension/factory";
import {
  composeExtensionInstance,
  discoverAndComposeFixtures,
} from "../src/extension/production-composition";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import { FakeClock } from "./helpers/fake-clock";
import { FakeFileWatcher } from "./helpers/fake-file-watcher";

// Bug 0013 — load-phase WARNING diagnostics are dropped by both production
// sinks (docs/bugs/0013-load-warnings-dropped-by-both-production-sinks.md).
//
// Spec: diagnostics/diagnostic-shape.md, opening rule — "Persistent
// diagnostics (default). All theta/parse/*, theta/load/*, and theta/runtime/*
// diagnostics are delivered via the channel below, with five carved-out
// exceptions" (all five are runtime/host teardown codes; NO load code, NO
// severity carve-out). Same page, transient-toast paragraph: theta-author-
// facing diagnostics "MUST go through the persistent channel above and MUST
// NOT be routed through ctx.ui.notify as their primary sink". Same page,
// multi-error reporting: the complete per-file batch arrives in "one
// pi.sendMessage call per .theta file", never one message per diagnostic.
//
// The defect at HEAD (bug doc §Actual behaviour — three drop sites):
//   1. makeLoadEmit (src/extension/production-composition.ts, early return on
//      severity !== "error") — the H8a discoverAndComposeFixtures helper path
//      delivers NOTHING for a warning: the toast surface is error-typed and
//      the headless stderr mirror sits INSIDE the error arm.
//   2. composeExtensionInstance's emitLoadNote (same file, same early return)
//      — the SHIPPED extension path routes error-severity diagnostics onto
//      the theta-system-note channel and returns early for everything else,
//      so every warning-severity load diagnostic reaches no surface at all.
//   3. parseDiscoveredTheta's registering path returns { fixture } and
//      discards document.diagnostics entirely, so parse/frontmatter warnings
//      on a theta that REGISTERS never reach a sink even once the sinks
//      route warnings.
//
// PINNED POST-FIX CONTRACT (bug doc §Options, option 1 — RED now, GREEN after
// the fix; the previously-intractable composition cells the provider-gate
// suite records at tests/typed-query-provider-gate.test.ts:49-68 — "the
// helper-seam cells … become extendable to an integration cell the moment
// the shared sink routes warnings" — ARE these cells):
//   (A) shipped path: a load-phase WARNING arrives on the theta-system-note
//       channel with the pinned envelope (customType "theta-system-note",
//       display:true, triggerTurn:false, details.diagnostics carrying the
//       warning-severity Diagnostic with its registry code/message).
//   (B) helper path: in headless mode (ctx.hasUI false) a warning produces a
//       stderr line — stderr ONLY (makeLoadEmit has no channel access, its
//       UiNotifier surface is error-typed, and its :981 instance is the
//       deliberately off-channel PIC-54 fallback), so the cells assert
//       stderr presence, never channel delivery, on this path.
//   (C) drop site 3: a theta that REGISTERS with a frontmatter warning still
//       surfaces that warning on the note channel (obligation (a) of the
//       recommended option: forward document.diagnostics on the registering
//       path).
//   (D) batching: one .theta carrying TWO warnings arrives batched — both
//       warnings within ONE sendMessage's details.diagnostics (the
//       multi-error one-sendMessage-per-.theta rule; per-file or per-pass
//       batching both satisfy the assertion) — never one note per warning.
//
// GREEN CONTROLS prove the harnesses observe HEAD behaviour correctly:
// error-severity routing is UNCHANGED on both paths (the shipped path's
// theta/load/unknown-tool note, the helper path's toast + stderr mirror),
// and warnings NEVER route to ctx.ui.notify on any path (the toast surface
// is typed "error"-only — a MUST NOT the fix has to preserve).
//
// PROVOKED CODES (docs/spec_topics/diagnostics/code-registry-load.md rows;
// DIAG-4 — every expected message below is sourced from the registry's
// Message column via parseRegistry/registryMessage, never pasted prose):
//   - theta/load/typed-query-unsupported-provider (W) — a typed-query theta
//     whose model: resolves to an api outside the pinned six-member set.
//   - theta/load/settings-invalid-json (W) — a .pi/settings.json that is not
//     valid UTF-8 JSON.
//   - theta/load/binder-model-strict-capability-unknown (W) — the registry-
//     documented "universal production branch under the pin": every
//     non-bypass theta fires it (Model<Api>.strictCapable absent).
//   - theta/load/unknown-frontmatter-field (W) — an unknown frontmatter key
//     on a theta that still registers (the drop-site-3 witness).
// HONEST LIMIT: theta/load/case-collision (suggested by the bug doc) is NOT
// provokable at this real-filesystem seam on Windows — NTFS is
// case-insensitive, so two .theta files differing only in case cannot
// coexist in a temp dir (the second write overwrites the first). The
// settings / typed-query / binder / frontmatter codes above cover four
// distinct warning rows instead.
//
// Method: the shipped-path cells drive the REAL factory + composeExtension-
// Instance over a temp-dir workspace with real .theta files on disk (the
// tests/load-phase-pre-eval-routing.test.ts harness, extended with a
// parameterisable model registry); the helper-path cells drive the REAL
// discoverAndComposeFixtures (the tests/e2e-s6-load-emit-toast-path.test.ts
// harness). Fake pi/ctx seams only where those harnesses already fake them.

// ===========================================================================
// The registry rows (DIAG-2 / DIAG-4) — messages sourced from the Message
// column of code-registry-load.md, placeholders interpolated per cell.
// ===========================================================================

interface RegistryRow {
  code: string;
  namespace: string;
  severity: string;
  phase: string;
  trigger: string;
  message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-load.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];

/** The row's normative Message template (DIAG-4), asserted present loudly. */
function loadRowMessage(code: string): string {
  const message = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    message,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-load.md must carry ` +
      `the Message row for ${code}`,
  ).toBeDefined();
  return message!;
}

/** Interpolate a registry Message template's `<placeholder>` slots. */
function interpolate(template: string, subs: Record<string, string>): string {
  return template.replace(/<([a-z-]+)>/g, (whole, name: string) => subs[name] ?? whole);
}

/**
 * A registry Message template as a whole-string RegExp with every
 * `<placeholder>` slot widened to `.+` — for rows (settings paths) whose
 * interpolated value is platform-path-shaped and not worth pinning byte-exact.
 */
function templateToRegExp(template: string): RegExp {
  const escaped = template
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/<[a-z-]+>/g, ".+");
  return new RegExp(`^${escaped}$`);
}

// ===========================================================================
// Fixtures.
// ===========================================================================

/** A clean control theta — registers, no diagnostics. */
const GOOD_THETA = ["---", "mode: prompt", "tools: read", "---", "@`hi`", ""].join(
  "\n",
);

/**
 * The ERROR control (reused from tests/load-phase-pre-eval-routing.test.ts):
 * `tools:` names an unknown Pi tool → theta/load/unknown-tool (E), theta
 * dropped, failure note-routed. Error routing must be UNCHANGED by the fix.
 */
const BAD_THETA = [
  "---",
  "mode: prompt",
  "tools: totally_unknown_xyz",
  "---",
  "@`hi`",
  "",
].join("\n");

/**
 * Provokes theta/load/typed-query-unsupported-provider (W): a typed query
 * plus a `model:` that load-resolves to api google-generative-ai — outside
 * the pinned six-member supported set (the tests/typed-query-provider-gate
 * provoking fixture, TYPED_THETA_MODEL_GEM). No params → binder bypass, so
 * this theta emits exactly this one warning and still registers.
 */
const TYPED_GEM_THETA = [
  "---",
  "mode: prompt",
  "model: m-gem",
  "---",
  "schema Verdict {",
  "  score: number",
  "}",
  "let v: Verdict = @`Ping`?",
  "v",
  "",
].join("\n");

/**
 * Provokes theta/load/binder-model-strict-capability-unknown (W): two params
 * fields → NOT bypass-eligible → binder-model resolution runs; `bind_model:`
 * resolves to a model with NO strictCapable field (the pinned production
 * shape), so the three-valued probe reads undefined — the registry-documented
 * universal-W branch. The theta still registers.
 */
const BINDER_WARN_THETA = [
  "---",
  "mode: prompt",
  "bind_model: m1",
  "params:",
  "  topic: string",
  "  count: number = 3",
  "---",
  '"ok"',
  "",
].join("\n");

/**
 * Provokes theta/load/unknown-frontmatter-field (W) on a theta that
 * REGISTERS — the drop-site-3 witness: the warning lives in
 * document.diagnostics, which parseDiscoveredTheta's registering path
 * discards at HEAD.
 */
const FM_WARN_THETA = [
  "---",
  "mode: prompt",
  "flavor: vanilla",
  "---",
  "@`hi`",
  "",
].join("\n");

/** TWO warnings in ONE .theta (two unknown frontmatter fields) — the batching fixture. */
const TWO_WARN_THETA = [
  "---",
  "mode: prompt",
  "flavor: vanilla",
  "sprinkles: extra",
  "---",
  "@`hi`",
  "",
].join("\n");

/** Not valid UTF-8 JSON → theta/load/settings-invalid-json (W). */
const INVALID_SETTINGS_JSON = "{ this is not json";

/**
 * Available models for the fake ctx.modelRegistry. DELIBERATELY no
 * `strictCapable` field on either — the theta 1.0 Pi-SDK pin shape, so the
 * binder probe's duck-typed read yields undefined (the universal-W branch).
 * m-gem's api is outside TYPED_QUERY_SUPPORTED_PROVIDER_APIS.
 */
const ANTHROPIC_M1 = { id: "m1", provider: "anthropic", api: "anthropic-messages" };
const GOOGLE_MGEM = { id: "m-gem", provider: "google", api: "google-generative-ai" };

// ===========================================================================
// Shipped-path harness (tests/load-phase-pre-eval-routing.test.ts, extended
// with a parameterisable model registry): the REAL factory + the REAL
// composeExtensionInstance over a temp-dir workspace; fake pi records every
// sendMessage; fake ctx.ui.notify records every toast.
// ===========================================================================

/** A recorded `pi.sendMessage` call (the `theta-system-note` channel). */
interface RecordedNote {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details: { readonly diagnostics?: readonly Diagnostic[] } | undefined;
  readonly triggerTurn: unknown;
}

interface ShippedHarness {
  readonly commands: Map<string, unknown>;
  readonly notes: RecordedNote[];
  readonly notifications: string[];
  fireSessionStart(): Promise<void>;
}

function makeShippedHarness(
  cwd: string,
  availableModels: readonly unknown[],
): ShippedHarness {
  const commands = new Map<string, unknown>();
  const notes: RecordedNote[] = [];
  const notifications: string[] = [];
  const subscriptions = new Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >();

  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: unknown): void => {
      commands.set(name, options);
    },
    on: (
      event: string,
      handler: (e: unknown, c: ExtensionContext) => unknown,
    ): void => {
      const list = subscriptions.get(event) ?? [];
      list.push(handler);
      subscriptions.set(event, list);
    },
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
    sendMessage: (
      message: {
        customType: string;
        content: string;
        display: boolean;
        details: unknown;
      },
      options: { triggerTurn: unknown },
    ): void => {
      notes.push({
        customType: message.customType,
        content: message.content,
        display: message.display,
        details: message.details as RecordedNote["details"],
        triggerTurn: options.triggerTurn,
      });
    },
    sendUserMessage: (): void => {},
  } as unknown as ExtensionAPI;

  const ctx = {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [...availableModels] },
    // A recording toast so a warning wrongly routed to the transient surface
    // is observable (diagnostic-shape.md transient-toast MUST NOT).
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;

  const deps: ThetaExtensionDeps = {
    fixtures: [],
    composeInstance: (composePi, composeCtx) =>
      composeExtensionInstance(composePi, composeCtx, {
        fileWatcher: new FakeFileWatcher(),
        clock: new FakeClock(),
      }),
  };
  createThetaExtension(deps)(pi);

  return {
    commands,
    notes,
    notifications,
    fireSessionStart: async () => {
      for (const handler of subscriptions.get("session_start") ?? []) {
        await handler({ type: "session_start" }, ctx);
      }
    },
  };
}

// ===========================================================================
// Helper-path harness (tests/e2e-s6-load-emit-toast-path.test.ts): the REAL
// discoverAndComposeFixtures; recording pi + ctx.
// ===========================================================================

interface HelperRecorder {
  readonly notifications: { message: string; type: string }[];
  readonly notes: RecordedNote[];
}

function makeHelperPi(recorder: HelperRecorder): ExtensionAPI {
  return {
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] => [],
    sendMessage: (
      message: {
        customType: string;
        content: string;
        display: boolean;
        details: unknown;
      },
      options?: { triggerTurn: unknown },
    ): void => {
      recorder.notes.push({
        customType: message.customType,
        content: message.content,
        display: message.display,
        details: message.details as RecordedNote["details"],
        triggerTurn: options?.triggerTurn,
      });
    },
    sendUserMessage: (): void => {},
    registerCommand: (): void => {},
    registerMessageRenderer: (): void => {},
    registerFlag: (): void => {},
    on: (): void => {},
  } as unknown as ExtensionAPI;
}

function makeHelperCtx(
  cwd: string,
  hasUI: boolean,
  recorder: HelperRecorder,
): ExtensionContext {
  return {
    cwd,
    hasUI,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, type: string): void => {
        recorder.notifications.push({ message, type });
      },
    },
  } as unknown as ExtensionContext;
}

// ===========================================================================
// Shared assertions.
// ===========================================================================

/** The notes whose details.diagnostics carry `code` at warning severity. */
function warningNotesWithCode(
  notes: readonly RecordedNote[],
  code: string,
): RecordedNote[] {
  return notes.filter((n) =>
    (n.details?.diagnostics ?? []).some(
      (d) => d.code === code && d.severity === "warning",
    ),
  );
}

/** The notes whose details.diagnostics carry `code` at error severity. */
function errorNotesWithCode(
  notes: readonly RecordedNote[],
  code: string,
): RecordedNote[] {
  return notes.filter((n) =>
    (n.details?.diagnostics ?? []).some(
      (d) => d.code === code && d.severity === "error",
    ),
  );
}

/**
 * The bug-0013 shipped-path warning-delivery pin: at least one
 * theta-system-note carrying the warning-severity `code` arrived, with the
 * diagnostic-shape.md envelope (customType / display:true / triggerTurn:false)
 * and the registry-sourced message (DIAG-4). The PRIMARY assertion's failure
 * message shows every observed note so the red-at-HEAD output proves the
 * documented reason: NO note carrying the warning ever arrives.
 */
function expectWarningNoteDelivered(
  harness: { readonly notes: readonly RecordedNote[]; readonly notifications: readonly string[] },
  code: string,
  expectedMessage: { readonly exact?: string; readonly pattern?: RegExp },
  dropSiteNote: string,
): void {
  const hits = warningNotesWithCode(harness.notes, code);
  expect(
    hits.length,
    `PRIMARY (bug 0013, ${dropSiteNote}): the ${code} WARNING must be delivered on the ` +
      `theta-system-note channel — diagnostic-shape.md's persistent-diagnostics default ` +
      `("All theta/parse/*, theta/load/*, and theta/runtime/* diagnostics are delivered via ` +
      `the channel below") has NO severity carve-out. AT HEAD both production load-emit ` +
      `sinks early-return on severity !== "error" (production-composition.ts makeLoadEmit / ` +
      `emitLoadNote), so NO note carrying the warning ever arrives. Observed notes=` +
      `${JSON.stringify(harness.notes)}; toasts=${JSON.stringify(harness.notifications)}`,
  ).toBeGreaterThanOrEqual(1);
  const note = hits[0]!;
  expect(
    note.customType,
    "the pinned envelope: customType 'theta-system-note' (diagnostic-shape.md)",
  ).toBe("theta-system-note");
  expect(
    note.display,
    "the pinned envelope: display:true (diagnostic-shape.md)",
  ).toBe(true);
  expect(
    note.triggerTurn,
    "the pinned envelope: { triggerTurn: false } (diagnostic-shape.md)",
  ).toBe(false);
  const diagnostic = (note.details?.diagnostics ?? []).find(
    (d) => d.code === code && d.severity === "warning",
  )!;
  if (expectedMessage.exact !== undefined) {
    expect(
      diagnostic.message,
      `DIAG-4: the diagnostic message is the registry row's Message column, interpolated`,
    ).toBe(expectedMessage.exact);
  }
  if (expectedMessage.pattern !== undefined) {
    expect(
      diagnostic.message,
      `DIAG-4: the diagnostic message matches the registry row's Message template`,
    ).toMatch(expectedMessage.pattern);
  }
}

// ===========================================================================
// Workspace scaffolding.
// ===========================================================================

let workspace: string;
let thetaDir: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "theta-bug0013-"));
  thetaDir = join(workspace, ".pi", "theta");
  mkdirSync(thetaDir, { recursive: true });
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

// ===========================================================================
// (A) Shipped path — emitLoadNote must route load-phase WARNINGS onto the
// theta-system-note channel. RED at HEAD (drop site 2).
// ===========================================================================

describe("bug 0013 (A) shipped path — load-phase warnings route onto the theta-system-note channel (diagnostic-shape.md persistent-diagnostics default)", () => {
  it("RED A1: theta/load/typed-query-unsupported-provider — the bug-0010 gate warning arrives as a theta-system-note; the theta still registers", async () => {
    // conversation-drive.md §Provider compatibility: "the runtime emits
    // theta/load/typed-query-unsupported-provider (warning) naming the model".
    // The bug-0010 fix wired the emission; this cell is the integration cell
    // that suite records as intractable-until-the-sink-routes-warnings
    // (tests/typed-query-provider-gate.test.ts:49-68).
    writeFileSync(join(thetaDir, "typedgem.theta"), TYPED_GEM_THETA, "utf8");

    const harness = makeShippedHarness(workspace, [ANTHROPIC_M1, GOOGLE_MGEM]);
    await harness.fireSessionStart();

    // Guard (green at HEAD and post-fix): the warning never blocks
    // registration — the registry row pins "The theta still loads".
    expect(
      harness.commands.has("typedgem"),
      "guard: the warning-severity gate diagnostic must NOT un-register the theta " +
        "(code-registry-load.md row: 'The theta still loads')",
    ).toBe(true);
    // No toast for a warning, ever (transient-toast MUST NOT; the surface is
    // error-typed). Green at HEAD (nothing routes anywhere) and post-fix.
    expect(
      harness.notifications,
      "warnings MUST NOT route through ctx.ui.notify (diagnostic-shape.md transient toasts)",
    ).toHaveLength(0);

    expectWarningNoteDelivered(
      harness,
      "theta/load/typed-query-unsupported-provider",
      {
        exact: interpolate(
          loadRowMessage("theta/load/typed-query-unsupported-provider"),
          { provider: "google-generative-ai", model: "m-gem" },
        ),
      },
      "drop site 2 (emitLoadNote), the bug-0010 provider-gate warning",
    );
  });

  it("RED A2: theta/load/settings-invalid-json — an invalid .pi/settings.json surfaces as a theta-system-note", async () => {
    // discovery.md §Settings file reads / registry row: "A settings file is
    // present but not valid UTF-8 JSON" (W). The bug doc: "a typo'd settings
    // file silently reverts every knob to defaults" — the warning is the
    // condition's ONLY documented observable.
    writeFileSync(join(workspace, ".pi", "settings.json"), INVALID_SETTINGS_JSON, "utf8");
    writeFileSync(join(thetaDir, "goodctl.theta"), GOOD_THETA, "utf8");

    const harness = makeShippedHarness(workspace, []);
    await harness.fireSessionStart();

    // Guard: the malformed settings file degrades to defaults; discovery and
    // registration still proceed (the session survives — warnings are
    // informational by definition).
    expect(
      harness.commands.has("goodctl"),
      "guard: invalid settings JSON must not abort the pass — the control theta registers",
    ).toBe(true);
    expect(
      harness.notifications,
      "warnings MUST NOT route through ctx.ui.notify (diagnostic-shape.md transient toasts)",
    ).toHaveLength(0);

    expectWarningNoteDelivered(
      harness,
      "theta/load/settings-invalid-json",
      // `<path>` is platform-path-shaped; match the whole registry template
      // with the placeholder widened rather than pinning path rendering.
      { pattern: templateToRegExp(loadRowMessage("theta/load/settings-invalid-json")) },
      "drop site 2 (emitLoadNote), the settings-source warning",
    );
  });

  it("RED A3: theta/load/binder-model-strict-capability-unknown — the universal non-bypass branch surfaces as a theta-system-note; the theta still registers", async () => {
    // code-registry-load.md row: "This is the universal production branch
    // under the pin" — Model<Api>.strictCapable is absent on every
    // Pi-supplied model, so EVERY non-bypass theta emits this W at EVERY
    // load. The bug doc: "its hint … is advice no operator has ever seen."
    writeFileSync(join(thetaDir, "binderwarn.theta"), BINDER_WARN_THETA, "utf8");

    const harness = makeShippedHarness(workspace, [ANTHROPIC_M1]);
    await harness.fireSessionStart();

    expect(
      harness.commands.has("binderwarn"),
      "guard: the strict-capability-unknown warning admits the theta (W-level; " +
        "resolveBinderModel resolves)",
    ).toBe(true);
    expect(
      harness.notifications,
      "warnings MUST NOT route through ctx.ui.notify (diagnostic-shape.md transient toasts)",
    ).toHaveLength(0);

    expectWarningNoteDelivered(
      harness,
      "theta/load/binder-model-strict-capability-unknown",
      {
        exact: interpolate(
          loadRowMessage("theta/load/binder-model-strict-capability-unknown"),
          { model: "m1" },
        ),
      },
      "drop site 2 (emitLoadNote), the binder-model universal-W branch",
    );
  });
});

// ===========================================================================
// (B) Helper path — makeLoadEmit must mirror warnings to stderr in headless
// mode; stderr ONLY (never the toast, never the note channel). RED at HEAD
// (drop site 1).
// ===========================================================================

describe("bug 0013 (B) helper path — discoverAndComposeFixtures surfaces warnings on stderr in headless mode (stderr-only; never ctx.ui.notify, never the note channel)", () => {
  it("RED B1: headless (hasUI:false) — a settings-invalid-json warning produces a stderr line; no toast, no note", async () => {
    writeFileSync(join(workspace, ".pi", "settings.json"), INVALID_SETTINGS_JSON, "utf8");
    writeFileSync(join(thetaDir, "goodctl.theta"), GOOD_THETA, "utf8");

    const recorder: HelperRecorder = { notifications: [], notes: [] };
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((): boolean => true);

    try {
      const thetas = await discoverAndComposeFixtures(
        makeHelperPi(recorder),
        makeHelperCtx(workspace, /* hasUI */ false, recorder),
      );

      // Guard: the pass completed; the control theta composed.
      expect(
        thetas.map((t) => t.slashName),
        "guard: invalid settings JSON must not abort the helper pass",
      ).toContain("goodctl");
      // Green pins FIRST (must hold at HEAD and post-fix): the toast surface
      // is typed "error"-only — a warning NEVER routes to ctx.ui.notify —
      // and makeLoadEmit stays off the note channel (bug doc option 1:
      // "stderr only"; tests/e2e-s6-load-emit-toast-path.test.ts pins the
      // helper path as never-the-note-channel). The toast pin filters for THE
      // PROVOKED WARNING's registry message rather than asserting global
      // emptiness: this path drives the REAL PiFileSystem against the
      // runner's real home, so an unrelated global-settings ERROR (a valid-
      // JSON `~/.pi/agent/settings.json` carrying a malformed theta key →
      // theta/load/settings-value-out-of-range, E) may legitimately toast on
      // some machines.
      expect(
        recorder.notifications.filter((n) =>
          templateToRegExp(
            loadRowMessage("theta/load/settings-invalid-json"),
          ).test(n.message),
        ),
        "the provoked warning MUST NOT route through ctx.ui.notify (the UiNotifier " +
          "surface is error-typed; diagnostic-shape.md transient toasts)",
      ).toHaveLength(0);
      expect(
        warningNotesWithCode(recorder.notes, "theta/load/settings-invalid-json"),
        "the helper path stays off the note channel for warnings (makeLoadEmit has no " +
          "channel access; its :981 instance is the deliberately off-channel PIC-54 fallback)",
      ).toHaveLength(0);

      // THE RED PIN (drop site 1): the headless stderr mirror must carry the
      // warning as it carries errors today. AT HEAD the mirror sits INSIDE
      // makeLoadEmit's error arm, so a warning writes nothing.
      const stderrText = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
      expect(
        stderrText,
        "PRIMARY (bug 0013, drop site 1 — makeLoadEmit): in headless -p/CI mode a " +
          "warning-severity load diagnostic must produce a stderr line naming its registry " +
          "code (bug doc option 1: 'Mirror the same arm into makeLoadEmit's headless-stderr " +
          "branch so -p/CI users see warnings on stderr as they now see errors'). AT HEAD the " +
          "stderr mirror is inside the severity !== \"error\" early-return, so NO stderr line " +
          `is written. Observed stderr=${JSON.stringify(stderrText)}`,
      ).toMatch(/theta\/load\/settings-invalid-json/);
      // DIAG-4: the mirrored line carries the registry message (rendered via
      // the severity-agnostic renderDiagnosticLine — "<file>: <code>: <message>").
      expect(
        stderrText,
        "the stderr line carries the registry row's Message text",
      ).toMatch(/is not valid UTF-8 JSON/);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("control B2 (green): UI present (hasUI:true) — a warning produces NO toast, NO stderr mirror, NO note on this path", async () => {
    // The MUST NOT half, pinned where it already holds at HEAD so the fix
    // cannot regress it: the toast surface is error-typed, the stderr mirror
    // is a no-UI-only arm, and the helper path never touches the channel.
    writeFileSync(join(workspace, ".pi", "settings.json"), INVALID_SETTINGS_JSON, "utf8");
    writeFileSync(join(thetaDir, "goodctl.theta"), GOOD_THETA, "utf8");

    const recorder: HelperRecorder = { notifications: [], notes: [] };
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((): boolean => true);

    try {
      const thetas = await discoverAndComposeFixtures(
        makeHelperPi(recorder),
        makeHelperCtx(workspace, /* hasUI */ true, recorder),
      );
      expect(thetas.map((t) => t.slashName)).toContain("goodctl");
      // Filtered for THE PROVOKED WARNING (not global toast emptiness): an
      // unrelated ERROR from the runner's real global settings file (e.g.
      // theta/load/settings-value-out-of-range) may legitimately toast on
      // some machines; the MUST NOT under test is that the warning never does.
      expect(
        recorder.notifications.filter((n) =>
          templateToRegExp(
            loadRowMessage("theta/load/settings-invalid-json"),
          ).test(n.message),
        ),
        "no toast for the provoked warning — ctx.ui.notify is the error-typed " +
          "transient surface",
      ).toHaveLength(0);
      const stderrText = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
      expect(
        stderrText,
        "no stderr mirror when a UI is present (the mirror is the no-UI arm)",
      ).not.toMatch(/theta\/load\/settings-invalid-json/);
      expect(
        warningNotesWithCode(recorder.notes, "theta/load/settings-invalid-json"),
        "the helper path never routes load diagnostics onto the note channel",
      ).toHaveLength(0);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("control B3 (green): the helper path's ERROR routing is unchanged at HEAD — toast + headless stderr mirror, never the note channel", async () => {
    // Harness proof: the stderr spy and toast recorder DO observe this path's
    // deliveries for errors (tests/e2e-s6-load-emit-toast-path.test.ts
    // assertions, abbreviated) — so B1's red is a real delivery gap, not a
    // broken spy. The fix must leave all of this untouched (bug doc
    // §Non-goals: error-severity routing).
    writeFileSync(join(thetaDir, "unknowntool.theta"), BAD_THETA, "utf8");

    const recorder: HelperRecorder = { notifications: [], notes: [] };
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((): boolean => true);

    try {
      const thetas = await discoverAndComposeFixtures(
        makeHelperPi(recorder),
        makeHelperCtx(workspace, /* hasUI */ false, recorder),
      );
      expect(
        thetas.map((t) => t.slashName),
        "the error-carrying theta is dropped",
      ).not.toContain("unknowntool");
      const errorToasts = recorder.notifications.filter((n) => n.type === "error");
      expect(
        errorToasts.length,
        "an error-severity load diagnostic still surfaces on the transient toast " +
          "(the helper path's pinned routing)",
      ).toBeGreaterThanOrEqual(1);
      expect(
        errorToasts.some((n) =>
          n.message.includes(
            interpolate(loadRowMessage("theta/load/unknown-tool"), {
              name: "totally_unknown_xyz",
            }),
          ),
        ),
        "the toast carries the registry row's Message (DIAG-4)",
      ).toBe(true);
      const stderrText = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
      expect(
        stderrText,
        "the headless stderr mirror carries the error line",
      ).toMatch(/theta\/load\/unknown-tool/);
      expect(
        errorNotesWithCode(recorder.notes, "theta/load/unknown-tool"),
        "the helper path never routes load diagnostics onto the note channel " +
          "(the e2e-s6 pinned state)",
      ).toHaveLength(0);
    } finally {
      stderrSpy.mockRestore();
    }
  });
});

// ===========================================================================
// (C) Drop site 3 — a theta that REGISTERS must still surface its
// parse/frontmatter warnings. RED at HEAD (parseDiscoveredTheta's registering
// path returns { fixture } and discards document.diagnostics).
// ===========================================================================

describe("bug 0013 (C) drop site 3 — a REGISTERING theta's frontmatter warning still surfaces on the theta-system-note channel", () => {
  it("RED C1: theta/load/unknown-frontmatter-field — the theta registers AND its warning note arrives", async () => {
    // frontmatter.md forward-compat seam / registry row: "Frontmatter
    // contains a field not in the theta 1.0 vocabulary" (W) — the theta
    // registers, so the warning rides document.diagnostics, which the
    // registering path of parseDiscoveredTheta discards at HEAD. Fixing the
    // sinks alone would NOT surface it (bug doc: obligation (a)).
    writeFileSync(join(thetaDir, "fmwarn.theta"), FM_WARN_THETA, "utf8");

    const harness = makeShippedHarness(workspace, []);
    await harness.fireSessionStart();

    expect(
      harness.commands.has("fmwarn"),
      "guard: an unknown frontmatter field is tolerated — the theta registers " +
        "(the forward-compat seam)",
    ).toBe(true);
    expect(
      harness.notifications,
      "warnings MUST NOT route through ctx.ui.notify (diagnostic-shape.md transient toasts)",
    ).toHaveLength(0);

    expectWarningNoteDelivered(
      harness,
      "theta/load/unknown-frontmatter-field",
      {
        exact: interpolate(loadRowMessage("theta/load/unknown-frontmatter-field"), {
          field: "flavor",
        }),
      },
      "drop site 3 (parseDiscoveredTheta discards document.diagnostics on the " +
        "registering path) compounded by drop site 2 (emitLoadNote)",
    );
  });
});

// ===========================================================================
// (D) Batching — one .theta's warnings arrive in ONE sendMessage; error
// routing is UNCHANGED. RED (batching) + GREEN (error control).
// ===========================================================================

describe("bug 0013 (D) batching — one .theta carrying two warnings batches into ONE sendMessage; error routing unchanged", () => {
  it("RED D1: two frontmatter warnings on one .theta arrive within ONE note's details.diagnostics (the multi-error one-sendMessage-per-.theta rule)", async () => {
    // diagnostic-shape.md §Multi-error reporting: the complete batch arrives
    // in "one pi.sendMessage call per .theta file … rather than fast-failing
    // on the first error or fanning out one message per error"; bug doc
    // obligation (b): "batch per pass or per file … to bound volume".
    writeFileSync(join(thetaDir, "twowarn.theta"), TWO_WARN_THETA, "utf8");

    const harness = makeShippedHarness(workspace, []);
    await harness.fireSessionStart();

    expect(
      harness.commands.has("twowarn"),
      "guard: two unknown-field warnings are tolerated — the theta registers",
    ).toBe(true);

    const template = loadRowMessage("theta/load/unknown-frontmatter-field");
    const flavorMessage = interpolate(template, { field: "flavor" });
    const sprinklesMessage = interpolate(template, { field: "sprinkles" });

    const hits = warningNotesWithCode(
      harness.notes,
      "theta/load/unknown-frontmatter-field",
    );
    expect(
      hits.length,
      `PRIMARY (bug 0013, obligation (b) — batching): the two unknown-frontmatter-field ` +
        `warnings of twowarn.theta must arrive on the theta-system-note channel. AT HEAD no ` +
        `warning note arrives at all (drop site 3 discards document.diagnostics on the ` +
        `registering path AND both sinks early-return on severity !== "error"). Observed ` +
        `notes=${JSON.stringify(harness.notes)}`,
    ).toBeGreaterThanOrEqual(1);
    // The batching pin proper: BOTH warnings within ONE sendMessage's
    // details.diagnostics (per-file or per-pass batching both satisfy this);
    // a fix that fans out one note per warning stays red here.
    const batched = hits.find((n) => {
      const messages = (n.details?.diagnostics ?? [])
        .filter((d) => d.code === "theta/load/unknown-frontmatter-field")
        .map((d) => d.message);
      return messages.includes(flavorMessage) && messages.includes(sprinklesMessage);
    });
    expect(
      batched,
      `the two warnings ('flavor', 'sprinkles') must appear within ONE sendMessage's ` +
        `details.diagnostics — never one note per warning (diagnostic-shape.md multi-error ` +
        `reporting). Observed warning notes=${JSON.stringify(hits)}`,
    ).toBeDefined();
    expect(batched!.customType).toBe("theta-system-note");
    expect(batched!.display).toBe(true);
    expect(batched!.triggerTurn).toBe(false);
  });

  it("control D2 (green): ERROR routing is unchanged — an unknown-tool theta still produces its pre-eval error note exactly as today", async () => {
    // The tests/load-phase-pre-eval-routing.test.ts assertions, re-pinned
    // here as the control the fix must not move (bug doc §Non-goals:
    // "Error-severity routing — conforming since V4e on the shipped path").
    // Also the harness proof for the shipped-path cells: the note recorder DOES
    // observe channel deliveries at HEAD, so the A/C/D reds are delivery gaps,
    // not harness gaps.
    writeFileSync(join(thetaDir, "goodtool.theta"), GOOD_THETA, "utf8");
    writeFileSync(join(thetaDir, "unknowntool.theta"), BAD_THETA, "utf8");

    const harness = makeShippedHarness(workspace, []);
    await harness.fireSessionStart();

    expect(harness.commands.has("goodtool"), "the clean sibling registers").toBe(true);
    expect(
      harness.commands.has("unknowntool"),
      "the error-carrying theta is dropped",
    ).toBe(false);

    const errorHits = errorNotesWithCode(harness.notes, "theta/load/unknown-tool");
    expect(
      errorHits.length,
      "the error-severity pre-eval failure routes onto the theta-system-note channel " +
        "(the V4e pinned state)",
    ).toBeGreaterThanOrEqual(1);
    const note = errorHits[0]!;
    expect(note.customType).toBe("theta-system-note");
    expect(note.display).toBe(true);
    expect(note.triggerTurn).toBe(false);
    const diagnostic = (note.details?.diagnostics ?? []).find(
      (d) => d.code === "theta/load/unknown-tool",
    )!;
    expect(
      diagnostic.message,
      "DIAG-4: the error note carries the registry row's Message",
    ).toBe(
      interpolate(loadRowMessage("theta/load/unknown-tool"), {
        name: "totally_unknown_xyz",
      }),
    );
    expect(
      harness.notifications,
      "the shipped path routes errors onto the channel, not the toast",
    ).toHaveLength(0);
  });
});
