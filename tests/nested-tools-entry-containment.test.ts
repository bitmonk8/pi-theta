import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { ThetaFixture } from "../src/extension/factory";
import type { CallableSetSnapshot } from "../src/parser/callable-set";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";

// Bug 0111 — discovery-root containment over a `tools:` `.theta` entry declared
// by a callee that is itself named by a `tools:` `.theta` entry (the NESTED
// entry).
//
// `docs/spec_topics/tool-calls.md` §"Argument shape": "a path that escapes the
// active discovery roots is rejected with `theta/load/invoke-path-escape` and
// the callable is not created" — no depth qualifier.
// `docs/spec_topics/invocation.md` §Resolution states the same disposition and
// its INV-1 seam names "`tools:` `.theta` entry registration" as a load-time
// call site of the shared checker; the registry *Trigger*
// (`docs/spec_topics/diagnostics/code-registry-load.md`,
// `theta/load/invoke-path-escape` row) names the entry KIND, not its depth.
//
// At HEAD the check is a parameter and one caller omits it: the active-root
// union is an optional trailing parameter of `resolveThetaToolsAtLoad`
// (`src/extension/production-composition.ts`), forwarded into
// `parseCalleeForTools`, whose containment branch is gated on the union being
// present. The discovered-theta compose pass passes the union; the callee
// pre-parse of a `tools:` entry never judges that callee's OWN `tools:`
// entries. Measured at HEAD: a caller whose `tools:` names an in-root callee
// whose own `tools:` names an out-of-root `.theta` REGISTERS, with its callable
// minted and no diagnostic on any channel.
//
// TARGET CONTRACT PINNED HERE — bug 0111 §Fix route (a), minimum honest form,
// scoped to the `tools:` surface. When the discovered-theta compose pass
// pre-parses a `tools:` `.theta` callee, that callee's own `tools:` `.theta`
// entries are judged for discovery-root containment against the active-root
// union, through the shared primitive `checkInvokePathAtLoad`
// (`src/runtime/invocation.ts`), resolved against the CALLEE's directory. An
// escape raises an error-severity `theta/load/invoke-path-escape` located at
// the CALLER's file, which un-registers the CALLER; no callable is created
// anywhere. `<path>` renders the nested entry spec AS WRITTEN (category 5,
// `docs/spec_topics/diagnostics/placeholder-rendering-b.md`). The nested-callee
// parse at dispatch (`parseCalleeTheta`) is unchanged and the runtime
// open-time re-check (`#recheckCalleeContainment`,
// `src/extension/production-theta-producer.ts`) is untouched (§Fix
// constraint 4).
//
// SCOPE BOUND, witnessed as a residual rather than fixed: a callee reached by
// an `invoke(...)` literal — not by a `tools:` entry — still has its own nested
// `tools:` entries judged only by the runtime open-time re-check. Cells 8 and 9
// record that behaviour so a later change to it is visible rather than silent.
//
// Every cell is offline and provider-free: one `discoverAndComposeFixtures`
// over a planted `.pi/theta/` workspace, plus — for the two residual cells —
// the registered fixture's own `run("", ctx)` on the prompt→prompt in-process
// invoke cell, with the `theta-system-note` channel read off the fake
// `pi.sendMessage`. No body carries a `@`-query.
//
// The out-of-root callees sit in a THIRD `mkdtempSync` directory the discovery
// walk never visits. The nested callees sit in a `nested/` subdirectory of the
// project theta directory, which
// is inside the active root by segment-boundary containment and is NOT itself
// discovered — `enumerateDirectory` (`src/discovery/discovery-walk.ts`)
// collects `*.theta` per directory and does not recurse. Cell 0 is the in-run
// proof of both facts.
//
// Message strings are sourced from the sharded registry's *Message* column per
// DIAG-4 (`docs/spec_topics/diagnostics/diagnostic-shape.md`) — never copied
// prose.

// --- Registry-sourced Message templates (DIAG-4) ---------------------------

/** The live sharded registry pages this file's codes are registered on. */
const REGISTRY_TEXT = ["code-registry-parse.md", "code-registry-load.md"]
  .map((page) =>
    readFileSync(
      fileURLToPath(
        new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url),
      ),
      "utf8",
    ),
  )
  .join("\n");

interface RegistryRow {
  code: string;
  message: string;
}

const REGISTRY = parseRegistry(REGISTRY_TEXT) as RegistryRow[];

const INVOKE_PATH_ESCAPE_CODE = "theta/load/invoke-path-escape";
const PROMPT_MODE_CALLABLE_CODE = "theta/load/prompt-mode-callable";
const CALLEE_HAS_ERRORS_CODE = "theta/load/callee-has-errors";
const UNRESOLVABLE_THETA_PATH_CODE = "theta/load/unresolvable-theta-path";

/** Source a code's registered *Message* template and fill its `<…>` placeholders. */
function expectedMessage(
  code: string,
  subs: Readonly<Record<string, string>>,
): string {
  let message = registryMessage(REGISTRY, code) as string;
  for (const [placeholder, value] of Object.entries(subs)) {
    message = message.replaceAll(placeholder, value);
  }
  expect(
    message,
    `${code}: an unsubstituted <…> placeholder remains — the registry row's ` +
      "Message template changed shape and this file's substitutions are stale",
  ).not.toMatch(/<[a-z]+>/);
  return message;
}

/**
 * `invoke path '<path>' resolves outside every active discovery root`, with
 * `<path>` rendered as the nested entry spec was written.
 */
function escapeMessage(path: string): string {
  return expectedMessage(INVOKE_PATH_ESCAPE_CODE, { "<path>": path });
}

// --- Planted discovery workspace -------------------------------------------

function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}

/**
 * Two required `params:` — `requiredCount` 2. Every call below passes exactly
 * two string arguments, so no arity, argument-type, unresolvable-path,
 * prompt-mode, rename, derived-name or collision rule can reject an entry:
 * containment is the only rule left (§Fix constraint 2's no-co-firing
 * requirement).
 */
const TWO_REQUIRED = ["params:", "  x: string", "  y: string"] as const;

/**
 * The out-of-root callee stems, one per cell. `ctx.ui.notify` carries the
 * message text with no caller attribution, so the collector is
 * workspace-global; a per-cell callee is what makes a cell's ABSENCE assertion
 * attributable to that cell. No stem is a substring of another.
 */
const OUT_OF_ROOT_STEMS = [
  "betafar",
  "epsilonfar",
  "zetafar",
  "linkfar",
  "gammafar",
] as const;

interface LoadOutcome {
  /** Slash names the production compose helper returned. */
  readonly registered: readonly string[];
  readonly fixtures: readonly ThetaFixture[];
  /** Diagnostic messages surfaced via `ctx.ui.notify`. */
  readonly notifications: readonly string[];
}

let outcome: LoadOutcome;
let workspaceDir: string;
let outsideDir: string;
/** Forward-slash-normalised `outsideDir`, the form every absolute entry spec uses. */
let outSpecDir: string;
let projectThetaDir: string;
let nestedDir: string;
/** Set iff planting the constraint-3 junction failed; cell 5 fails loudly on it. */
let junctionError: string | undefined;
/** `theta-system-note` payloads collected off the fake `pi.sendMessage`. */
const systemNotes: string[] = [];

function makePi(): ExtensionAPI {
  return {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (message: { content?: unknown }): void => {
      if (typeof message.content === "string") systemNotes.push(message.content);
    },
    sendUserMessage: (): void => {},
    registerMessageRenderer: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
}

async function runProductionLoad(cwd: string): Promise<LoadOutcome> {
  const notifications: string[] = [];
  const ctx = {
    cwd,
    hasUI: true,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;

  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(
    makePi(),
    ctx,
  );
  return {
    registered: fixtures.map((f) => f.slashName),
    fixtures,
    notifications,
  };
}

/** The per-dispatch context the two residual cells drive `run("", ctx)` with. */
function runCtx(): ExtensionCommandContext {
  return {
    signal: undefined,
    cwd: workspaceDir,
    isIdle: (): boolean => true,
    waitForIdle: (): Promise<void> => Promise.resolve(),
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    sessionManager: {
      getEntries: (): readonly unknown[] => [],
      getLeafId: (): undefined => undefined,
    },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionCommandContext;
}

function plant(dir: string, stem: string, text: string): void {
  writeFileSync(join(dir, `${stem}.theta`), text, "utf8");
}

/** A subagent-mode callee with two required string params and no `tools:`. */
function leafCallee(): string {
  return theta("---", "mode: subagent", ...TWO_REQUIRED, "---", '"done"');
}

/**
 * The same callee with NO `params:`. A DISCOVERED theta carrying `params:`
 * needs a resolvable binder model, and this workspace's model registry is
 * empty on purpose (offline), so the in-root leaves the nested callees name
 * take no parameters and are called with none.
 */
function leafCalleeNoParams(): string {
  return theta("---", "mode: subagent", "---", '"done"');
}

/** A caller whose `tools:` names one `.theta` entry and calls it at exact arity. */
function callerNaming(spec: string, presented: string): string {
  return theta(
    "---",
    "mode: subagent",
    "tools:",
    `  - ${spec}`,
    "---",
    `${presented}("a", "b")?`,
  );
}

beforeAll(async () => {
  outsideDir = mkdtempSync(join(tmpdir(), "theta-b0111-out-"));
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-b0111-ws-"));
  projectThetaDir = join(workspaceDir, ".pi", "theta");
  nestedDir = join(projectThetaDir, "nested");
  mkdirSync(nestedDir, { recursive: true });
  // Absolute entry specs are written forward-slashed: a host-native backslash
  // path inside a YAML scalar would be read as an escape sequence, which would
  // reject the entry on YAML syntax rather than on containment.
  outSpecDir = outsideDir.replace(/\\/g, "/");

  for (const stem of OUT_OF_ROOT_STEMS) plant(outsideDir, stem, leafCallee());

  // --- shared in-root leaves -----------------------------------------------
  plant(projectThetaDir, "nearsib", leafCalleeNoParams());
  // Cell 0's non-recursion proof: a standalone theta inside `nested/` that
  // would register if the walk descended.
  plant(nestedDir, "nestprobe", theta("---", "mode: subagent", "---", '"probe"'));

  // --- cell 1: the headline — a nested entry that escapes -------------------
  plant(
    nestedDir,
    "midcallee",
    theta(
      "---",
      "mode: subagent",
      ...TWO_REQUIRED,
      "tools:",
      `  - ${outSpecDir}/betafar.theta`,
      "---",
      'betafar("a", "b")?',
    ),
  );
  plant(
    projectThetaDir,
    "callmid",
    callerNaming("./nested/midcallee.theta", "midcallee"),
  );

  // --- cell 2: the in-root nested control ----------------------------------
  plant(
    nestedDir,
    "nearmid",
    theta(
      "---",
      "mode: subagent",
      ...TWO_REQUIRED,
      "tools:",
      "  - ../nearsib.theta",
      "---",
      "nearsib()?",
    ),
  );
  plant(
    projectThetaDir,
    "callnearmid",
    callerNaming("./nested/nearmid.theta", "nearmid"),
  );

  // --- cell 3: constraint 1's surviving-callables pin ----------------------
  // 3a — a nested callee with MULTIPLE non-escaping entries (a bare Pi-tool
  // name and an in-root sibling). Nothing may be refused and nothing emptied.
  const multiEntries = ["tools:", "  - read", "  - ../nearsib.theta"] as const;
  plant(
    nestedDir,
    "multimid",
    theta(
      "---",
      "mode: subagent",
      ...TWO_REQUIRED,
      ...multiEntries,
      "---",
      "nearsib()?",
    ),
  );
  plant(
    projectThetaDir,
    "callmulti",
    callerNaming("./nested/multimid.theta", "multimid"),
  );
  // The load-visible twin of 3a's entry list: the same two entry KINDS naming
  // the same two callables on a DISCOVERED theta, whose frozen snapshot IS
  // readable at load. A nested callee is not registered, so its own snapshot
  // has no load-time observable; the twin is what carries the per-entry
  // survival assertion. The `.theta` entry names the same file, spelled from
  // the twin's own directory.
  plant(
    projectThetaDir,
    "multitwin",
    theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - read",
      "  - ./nearsib.theta",
      "---",
      "nearsib()?",
    ),
  );
  // 3b — the same entry list with ONE escaping entry added.
  plant(
    nestedDir,
    "multiescmid",
    theta(
      "---",
      "mode: subagent",
      ...TWO_REQUIRED,
      ...multiEntries,
      `  - ${outSpecDir}/zetafar.theta`,
      "---",
      'zetafar("a", "b")?',
    ),
  );
  plant(
    projectThetaDir,
    "callmultiesc",
    callerNaming("./nested/multiescmid.theta", "multiescmid"),
  );

  // --- cell 4: the two-depth disagreement over ONE file --------------------
  // `dmid` is DISCOVERED and its own `tools:` escapes; `calldmid` names it.
  plant(
    projectThetaDir,
    "dmid",
    theta(
      "---",
      "mode: subagent",
      ...TWO_REQUIRED,
      "tools:",
      `  - ${outSpecDir}/epsilonfar.theta`,
      "---",
      'epsilonfar("a", "b")?',
    ),
  );
  plant(projectThetaDir, "calldmid", callerNaming("./dmid.theta", "dmid"));

  // --- cell 5: the junction — `realpath`, not the bare resolve -------------
  // A directory junction INSIDE the active root, pointing outside it. The
  // nested callee's entry `./farlink/linkfar.theta` bare-resolves inside the
  // root while its `realpath` lies outside, so only a `realpath`-based check
  // can refuse it.
  try {
    symlinkSync(outsideDir, join(nestedDir, "farlink"), "junction");
  } catch (error: unknown) {
    junctionError =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }
  plant(
    nestedDir,
    "linkmid",
    theta(
      "---",
      "mode: subagent",
      ...TWO_REQUIRED,
      "tools:",
      "  - ./farlink/linkfar.theta",
      "---",
      'linkfar("a", "b")?',
    ),
  );
  plant(
    projectThetaDir,
    "calllinkmid",
    callerNaming("./nested/linkmid.theta", "linkmid"),
  );

  // --- cell 6: bare Pi-tool names draw no containment judgement ------------
  plant(
    nestedDir,
    "baremid",
    theta(
      "---",
      "mode: subagent",
      ...TWO_REQUIRED,
      "tools:",
      "  - read",
      "  - bash",
      "---",
      '"done"',
    ),
  );
  plant(
    projectThetaDir,
    "callbaremid",
    callerNaming("./nested/baremid.theta", "baremid"),
  );

  // --- cell 7: a nested callee declaring no `tools:` at all ----------------
  plant(nestedDir, "plainmid", leafCallee());
  plant(
    projectThetaDir,
    "callplainmid",
    callerNaming("./nested/plainmid.theta", "plainmid"),
  );

  // --- cells 8 and 9: the residual, reached by an `invoke(...)` literal ----
  // Prompt-mode caller and prompt-mode callee: the one cross-mode cell that
  // attaches in-process rather than spawning a child, so the dispatch is
  // offline and provider-free.
  plant(
    nestedDir,
    "pmid",
    theta(
      "---",
      "mode: prompt",
      ...TWO_REQUIRED,
      "tools:",
      `  - ${outSpecDir}/gammafar.theta`,
      "---",
      'gammafar("a", "b")?',
    ),
  );
  plant(
    projectThetaDir,
    "pcaller",
    theta(
      "---",
      "mode: prompt",
      "---",
      'invoke("./nested/pmid.theta", "a", "b")?',
    ),
  );
  // Cell 9 — the no-minting contrast: the nested callee declares NO `tools:`
  // entry for the name and calls it anyway.
  plant(
    nestedDir,
    "pmidnone",
    theta("---", "mode: prompt", ...TWO_REQUIRED, "---", 'omegafar("a", "b")?'),
  );
  plant(
    projectThetaDir,
    "pcallernone",
    theta(
      "---",
      "mode: prompt",
      "---",
      'invoke("./nested/pmidnone.theta", "a", "b")?',
    ),
  );

  // A minimal valid settings file pins the fixture's settings read to a known
  // value. An ABSENT settings file is silent (package-and-settings.md
  // §Failure modes), so the plant is hermeticity, not noise suppression.
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
  outcome = await runProductionLoad(workspaceDir);
});

afterAll(() => {
  // The out-of-root directory goes first: with the junction's target already
  // gone, the workspace teardown cannot descend through it.
  rmSync(outsideDir, { recursive: true, force: true });
  rmSync(workspaceDir, { recursive: true, force: true });
});

/** Notifications naming one callee by its `<stem>.theta` filename. */
function notificationsNaming(stem: string): readonly string[] {
  return outcome.notifications.filter((n) => n.includes(`${stem}.theta`));
}

/** Read the frozen callable-set snapshot threaded onto a registered fixture. */
function callableSetOf(slashName: string): CallableSetSnapshot {
  const fixture = outcome.fixtures.find((f) => f.slashName === slashName);
  expect(
    fixture,
    `PRECONDITION: fixture '${slashName}' was not registered. Registered: ` +
      `${JSON.stringify(outcome.registered)}; notified: ` +
      JSON.stringify(outcome.notifications),
  ).toBeDefined();
  const snapshot = (fixture as unknown as { callableSet?: CallableSetSnapshot })
    .callableSet;
  expect(
    snapshot,
    `PRECONDITION: fixture '${slashName}' carries no callableSet snapshot`,
  ).toBeDefined();
  return snapshot as CallableSetSnapshot;
}

function fixtureOf(slashName: string): ThetaFixture {
  const fixture = outcome.fixtures.find((f) => f.slashName === slashName);
  expect(
    fixture,
    `PRECONDITION: fixture '${slashName}' was not registered, so its dispatch ` +
      `cell has nothing to drive. Registered: ${JSON.stringify(outcome.registered)}`,
  ).toBeDefined();
  return fixture as ThetaFixture;
}

/** Path separators normalised, so a note is comparable across hosts. */
function slashed(text: string): string {
  return text.replace(/\\/g, "/");
}

// ===========================================================================
// Cell 0 — the shared preconditions. Every cell below reads one load outcome,
// so a failed discovery walk would red them all for a reason that is not bug
// 0111.
// ===========================================================================
describe("bug 0111 cell 0 — the planted workspace's preconditions", () => {
  it("0: the in-root nested control caller registered, so the walk and the `tools:` resolution both ran", () => {
    expect(
      outcome.registered,
      "the discovery walk found nothing, or a `tools:` `.theta` entry naming an " +
        "in-root nested callee was refused. Registered: " +
        JSON.stringify(outcome.registered) +
        "; notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain("callnearmid");
  });

  it("0: the nested directory is NOT discovered — the walk does not recurse", () => {
    expect(
      outcome.registered,
      "a theta inside the `nested/` subdirectory registered, so that directory is an " +
        "active discovery root of its own and no cell below isolates the nested " +
        "parse. Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("nestprobe");
  });

  it("0: the out-of-root directory lies outside every active root — a DISCOVERED escaping entry is refused", () => {
    // The depth-0 rule is live at this baseline; this is also the in-run proof
    // that the third temp directory contributes no active root.
    expect(
      outcome.registered,
      "a discovered theta whose own `tools:` names the out-of-root directory " +
        "registered, so that directory is inside an active root and every cell " +
        "below is asserting against the wrong root union. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("dmid");
    expect(
      outcome.notifications,
      "the depth-0 containment rule did not fire, so the out-of-root directory is " +
        "not out of root. Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(escapeMessage(`${outSpecDir}/epsilonfar.theta`));
  });
});

// ===========================================================================
// Cell 1 — the headline. A caller whose `tools:` names an in-root nested
// callee whose OWN `tools:` names an out-of-root `.theta`. The caller's own
// entry passes containment; the nested entry is the only escape in the cell.
// ===========================================================================
describe("bug 0111 cell 1 — a nested `tools:` `.theta` entry that escapes un-registers the caller", () => {
  it("1: the caller does not register", () => {
    expect(
      outcome.registered,
      "the caller of a callee whose own `tools:` names a `.theta` outside every " +
        "active discovery root registered, and its callable was minted. " +
        "`tool-calls.md` §\"Argument shape\": the callable is not created — at any " +
        "depth. Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("callmid");
  });

  it("1: theta/load/invoke-path-escape names the NESTED entry spec as written", () => {
    expect(
      outcome.notifications,
      "no containment diagnostic surfaced for the escaping entry one level in: the " +
        "nested callee's `tools:` was resolved with no active-root union, so the " +
        "entry was never judged and the operator sees nothing at load. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain(escapeMessage(`${outSpecDir}/betafar.theta`));
  });

  it("1: no callable for the nested callee survives anywhere in the registered set", () => {
    const minted = outcome.fixtures.filter((fixture) => {
      const snapshot = (fixture as unknown as { callableSet?: CallableSetSnapshot })
        .callableSet;
      return snapshot?.entries.has("midcallee") === true;
    });
    expect(
      minted.map((f) => f.slashName),
      "a callable for the callee holding the escaping nested entry is present in a " +
        "registered fixture's frozen snapshot",
    ).toEqual([]);
  });
});

// ===========================================================================
// Cell 2 — the no-false-refusal pin. The same shape with the nested entry
// naming an IN-ROOT sibling: the caller registers and its callable is minted.
// ===========================================================================
describe("bug 0111 cell 2 — an in-root nested entry is unaffected", () => {
  it("2: the caller registers", () => {
    expect(
      outcome.registered,
      "a nested `tools:` entry naming a sibling INSIDE the active root was refused. " +
        "Notified: " + JSON.stringify(outcome.notifications),
    ).toContain("callnearmid");
  });

  it("2: the caller's frozen snapshot carries the nested callee's callable", () => {
    expect(
      [...callableSetOf("callnearmid").entries.keys()],
      "the in-root nested callee's callable is absent from the caller's snapshot",
    ).toContain("nearmid");
  });

  it("2: no containment diagnostic names the in-root nested callee or its entry", () => {
    expect(
      notificationsNaming("nearmid"),
      "a diagnostic fired against a nested entry chain that never leaves the root",
    ).toEqual([]);
  });
});

// ===========================================================================
// Cell 3 — §Fix constraint 1: a rejection narrows nothing that was not
// rejected, and a non-escaping nested callee loses nothing.
//
// A nested callee is not itself registered, so its own frozen snapshot has no
// load-time observable; the per-entry survival assertion is carried by a
// DISCOVERED twin declaring the identical `tools:` block, and the nested arm
// asserts that the caller registers with its callable intact.
// ===========================================================================
describe("bug 0111 cell 3 — a multi-entry nested callee with no escape loses nothing", () => {
  it("3a: the caller of the multi-entry nested callee registers", () => {
    expect(
      outcome.registered,
      "a nested callee declaring several non-escaping `tools:` entries had its " +
        "caller refused. Notified: " + JSON.stringify(outcome.notifications),
    ).toContain("callmulti");
  });

  it("3a: the caller's snapshot carries the nested callee's callable", () => {
    expect([...callableSetOf("callmulti").entries.keys()]).toContain("multimid");
  });

  it("3a: each entry of that `tools:` block resolves to its own callable", () => {
    const keys = [...callableSetOf("multitwin").entries.keys()];
    expect(
      keys,
      "the bare Pi-tool entry of the same block minted no callable, " +
        `so the block's resolution is not the survival baseline cell 3b measures. ` +
        `Keys: ${JSON.stringify(keys)}`,
    ).toContain("read");
    expect(
      keys,
      "the in-root `.theta` entry of the same block minted no " +
        `callable. Keys: ${JSON.stringify(keys)}`,
    ).toContain("nearsib");
  });

  it("3b: adding ONE escaping entry un-registers the caller", () => {
    expect(
      outcome.registered,
      "the same nested callee with one out-of-root entry added still registered its " +
        "caller. Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("callmultiesc");
  });

  it("3b: the containment diagnostic is the only error-severity report about that chain", () => {
    expect(
      outcome.notifications,
      "no containment diagnostic surfaced for the escaping entry in the multi-entry " +
        "nested callee. Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(escapeMessage(`${outSpecDir}/zetafar.theta`));
    // Containment precedes every content-derived rule (§Fix constraint 2): an
    // entry rejected on its PATH has no callee contents to judge, so none of
    // these may co-fire at the same chain.
    for (const code of [
      CALLEE_HAS_ERRORS_CODE,
      UNRESOLVABLE_THETA_PATH_CODE,
      PROMPT_MODE_CALLABLE_CODE,
    ]) {
      for (const path of [
        `${outSpecDir}/zetafar.theta`,
        "./nested/multiescmid.theta",
      ]) {
        expect(
          outcome.notifications,
          `${code} co-fired at the chain rejected on containment, so the author is ` +
            "directed at the callee's contents instead of the entry's path",
        ).not.toContain(expectedMessage(code, { "<path>": path }));
      }
    }
  });
});

// ===========================================================================
// Cell 4 — the two-depth disagreement over ONE file. `dmid` is discovered and
// its own `tools:` escapes; `calldmid` names `dmid` in its own `tools:`. One
// load pass must not hold both verdicts about the same file.
// ===========================================================================
describe("bug 0111 cell 4 — the same escaping file is refused at both depths", () => {
  it("4: the discovered file with the escaping entry does not register", () => {
    expect(outcome.registered).not.toContain("dmid");
  });

  it("4: the caller naming that file in its own `tools:` does not register either", () => {
    expect(
      outcome.registered,
      "one load pass refused the file for its escaping entry AND minted a callable " +
        "for the same file at the caller. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("calldmid");
  });

  it("4: the escape diagnostic is drawn once per refusing file", () => {
    const message = escapeMessage(`${outSpecDir}/epsilonfar.theta`);
    expect(
      outcome.notifications.filter((n) => n === message).length,
      "the escaping entry drew fewer reports than the files it un-registers: one " +
        "for the discovered file's own load, one located at the caller whose entry " +
        "reached it. Notified: " + JSON.stringify(outcome.notifications),
    ).toBe(2);
  });
});

// ===========================================================================
// Cell 5 — §Fix constraint 3: the resolution primitive is
// `checkInvokePathAtLoad`'s `realpath`, not a bare `resolvePath`. A directory
// junction inside the active root points outside it, and the nested entry
// `./farlink/linkfar.theta` bare-resolves INSIDE the root while its `realpath`
// lies outside. A junction that cannot be planted fails this cell LOUDLY.
// ===========================================================================
describe("bug 0111 cell 5 — the nested entry's containment is decided on `realpath`", () => {
  it("5: the junction precondition is met", () => {
    expect(
      junctionError,
      "the directory junction could not be planted, so the `realpath`-vs-bare-resolve " +
        "divergence has no witness on this host: " +
        `fs.symlinkSync(<dir>, <link>, "junction") failed with ${junctionError}`,
    ).toBeUndefined();
  });

  it("5: the entry bare-resolves inside the root and `realpath`s outside it", () => {
    const bare = slashed(join(nestedDir, "farlink", "linkfar.theta"));
    const root = slashed(projectThetaDir);
    const canonical = slashed(realpathSync(bare));
    // A host whose `tmpdir()` itself sits behind a symlink resolves that
    // symlink alongside the junction, so the comparison side is the
    // out-of-root directory's own `realpath`.
    const outsideCanonical = slashed(realpathSync(outsideDir));
    expect(
      bare.startsWith(`${root}/`),
      `the junction entry does not bare-resolve inside the active root, so a bare ` +
        `resolve would already reject it. Bare: ${bare}; root: ${root}`,
    ).toBe(true);
    expect(
      canonical.startsWith(`${outsideCanonical}/`),
      `the junction entry's realpath does not leave the active root, so the cell ` +
        `witnesses no escape. Canonical: ${canonical}; outside: ${outsideCanonical}`,
    ).toBe(true);
  });

  it("5: the junction-reached nested entry un-registers the caller", () => {
    expect(
      outcome.registered,
      "a nested entry whose bare resolve stays inside the root but whose realpath " +
        "leaves it minted the callable: the nested surface met a bare resolve and no " +
        "realpath. Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("calllinkmid");
  });

  it("5: theta/load/invoke-path-escape names the junction entry as written", () => {
    expect(
      outcome.notifications,
      "no containment diagnostic surfaced for the junction-reached nested entry. " +
        "Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(escapeMessage("./farlink/linkfar.theta"));
  });
});

// ===========================================================================
// Cell 6 — bare Pi-tool names in a nested callee's `tools:` are routed away
// from any callee resolve (`isBareToolName`), so they draw no containment
// judgement at all.
// ===========================================================================
describe("bug 0111 cell 6 — a nested callee whose `tools:` is only bare Pi-tool names is unaffected", () => {
  it("6: the caller registers with the nested callable minted", () => {
    expect(
      outcome.registered,
      "a nested callee declaring only bare Pi-tool names had its caller refused, so " +
        "a bare name was pushed through a path-shaped rule. Notified: " +
        JSON.stringify(outcome.notifications),
    ).toContain("callbaremid");
    expect([...callableSetOf("callbaremid").entries.keys()]).toContain("baremid");
  });

  it("6: no containment diagnostic names the bare-name callee", () => {
    expect(notificationsNaming("baremid")).toEqual([]);
  });
});

// ===========================================================================
// Cell 7 — a nested callee declaring no `tools:` at all has no nested surface
// to judge.
// ===========================================================================
describe("bug 0111 cell 7 — a nested callee with no `tools:` is unaffected", () => {
  it("7: the caller registers with the nested callable minted", () => {
    expect(outcome.registered).toContain("callplainmid");
    expect([...callableSetOf("callplainmid").entries.keys()]).toContain("plainmid");
  });

  it("7: no diagnostic names it", () => {
    expect(notificationsNaming("plainmid")).toEqual([]);
  });
});

// ===========================================================================
// Cell 8 — THE RECORDED RESIDUAL of the `tools:`-surface scope bound. A callee
// reached by an `invoke(...)` literal is not a `tools:` entry of its caller, so
// route (a)'s load-time judgement does not reach its own nested `tools:`
// entries: the escape is caught only by the runtime open-time re-check, one
// channel and at the moment of a call. This cell asserts the CURRENT behaviour
// so a later change to it is visible rather than silent.
// ===========================================================================
describe("bug 0111 cell 8 — RESIDUAL: an invoke-reached callee's nested entry is still caught only at dispatch", () => {
  it("8: the prompt-mode caller registers", () => {
    expect(
      outcome.registered,
      "the invoke-reached arm's caller was refused at load, so the scope bound this " +
        "cell records has moved. Notified: " + JSON.stringify(outcome.notifications),
    ).toContain("pcaller");
  });

  it("8: dispatch fails closed with the runtime `load_failure` Err naming the out-of-root file", async () => {
    const before = systemNotes.length;
    await fixtureOf("pcaller").run("", runCtx());
    const notes = systemNotes.slice(before).map(slashed);
    expect(
      notes.some(
        (note) =>
          note.includes("theta /pcaller returned Err: invoke of") &&
          note.includes(`${outSpecDir}/gammafar.theta`) &&
          note.includes("failed (load_failure)"),
      ),
      "the recorded residual changed shape: the invoke-reached callee's escaping " +
        "nested entry no longer surfaces as the runtime containment refusal naming " +
        `the out-of-root file. Notes: ${JSON.stringify(notes)}`,
    ).toBe(true);
  });
});

// ===========================================================================
// Cell 9 — arm 5's no-minting contrast, retained. With NO `tools:` entry for
// the name, the callee fails its own parse and the note names the CALLEE file,
// not the out-of-root file. This is what makes minting the thing that puts an
// out-of-root callee within reach of a call at all, and it reds if a later fix
// substitutes a quieter silence for the current report.
//
// Bug 0293: the callee genuinely fails its own PARSE (`omegafar` is an unbound
// call-site identifier, a `theta/parse/unknown-identifier` diagnostic —
// `parseThetaDocument`'s identifier-resolution checker, `theta-document.ts`), so
// the corrected `cause` is `parse_failure`, not `load_failure`
// (queryerror-variants.md:182-183). Pre-0293 this cell was pinned to
// `load_failure` because `parseCalleeTheta` collapsed the unreadable and
// unparseable classes into one `undefined`; the collapse is exactly what bug
// 0293 removed.
// ===========================================================================
describe("bug 0111 cell 9 — a name with no `tools:` entry fails at the callee, naming the callee", () => {
  it("9: the caller registers", () => {
    expect(outcome.registered).toContain("pcallernone");
  });

  it("9: dispatch names the callee file, not any out-of-root file", async () => {
    const before = systemNotes.length;
    await fixtureOf("pcallernone").run("", runCtx());
    const notes = systemNotes.slice(before).map(slashed);
    expect(
      notes.some(
        (note) =>
          note.includes("theta /pcallernone returned Err: invoke of") &&
          note.includes("./nested/pmidnone.theta") &&
          // Bug 0293: this callee fails its own PARSE (an unbound call-site
          // identifier), so the corrected cause is `parse_failure` — see the
          // describe-block header.
          note.includes("failed (parse_failure)"),
      ),
      `the no-minting contrast changed shape. Notes: ${JSON.stringify(notes)}`,
    ).toBe(true);
    expect(
      notes.filter((note) => note.includes(outSpecDir)),
      "an out-of-root path was named by an arm that mints no callable for it",
    ).toEqual([]);
  });
});
