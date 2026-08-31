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
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { ThetaFixture } from "../src/extension/factory";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";

// Bug 0110 — discovery-root containment over the `tools:` `.theta`-entry
// surface (`theta/load/invoke-path-escape`).
//
// `docs/spec_topics/tool-calls.md:14` §"Argument shape": "The path-restriction
// rule from [Invocation — Resolution] also applies to `.theta` paths used as
// `tools:` entries: a path that escapes the active discovery roots is rejected
// with `theta/load/invoke-path-escape` and the callable is not created."
// `docs/spec_topics/invocation.md:12` states the same disposition from the
// other side ("a `tools:` `.theta` entry that escapes likewise fails to
// register the callable"), `:16` names "`tools:` `.theta` entry registration"
// as a load-time call site of the shared checker, and the registry *Trigger*
// (`docs/spec_topics/diagnostics/code-registry-load.md:33`) names both
// surfaces in one sentence — so the row itself is the statement that this
// surface owes the emission.
//
// Bug 0110 found two elements, one rule, true at `v0.65.0` (`CHANGELOG.md:9`).
// Element 1: no load-time containment check reached a
// `tools:` entry — `parseCalleeForTools`
// (`src/extension/production-composition.ts:2178`) resolved the entry with a
// bare `isAbsolute(spec) ? spec : resolvePath(callerDir, spec)` (`:1914`) and
// read its bytes, with no `realpath` and no comparison against the active-root
// union `discoverAndComposeFixtures` derives into `activeRoots`. Element 2
// followed by ordering: the `resolveThetaToolsAtLoad` call ran before the
// `checkInvokeStaticResolution` pass in that same loop body, so an
// entry that survived the first reached bug 0071's arity loop, which then
// un-registered the caller on the wrong rule.
//
// Every cell drives the production compose helper (`discoverAndComposeFixtures`)
// over a planted `.pi/theta/` workspace and asserts on the two production
// observables bug 0071's witness uses (`tests/theta-callable-call-arity.test.ts`):
// which slash names registered, and which messages reached `ctx.ui.notify`. No
// cell asserts through an internal export, so none reds on a compile error or a
// harness throw.
//
// The out-of-root callees sit in a SECOND `mkdtempSync` directory the discovery
// walk never visits, so the active-root union — the parent directory of every
// discovered theta — cannot contain it. Cell E is the in-run proof of that.
//
// Message strings are sourced from the sharded registry's *Message* column per
// DIAG-4 (`docs/spec_topics/diagnostics/diagnostic-shape.md:74`) — never copied
// prose. See cell A.

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
const ARITY_TOO_FEW_CODE = "theta/parse/invoke-arity-too-few";
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
 * `invoke path '<path>' resolves outside every active discovery root`.
 *
 * `<path>` is category 5 (`docs/spec_topics/diagnostics/placeholder-rendering-b.md:9`):
 * the entry spec as written, with no realpath normalisation. A `tools:` entry
 * is a YAML scalar rather than a quoted path literal, so the rendered value is
 * the decoded scalar — the reading `theta/load/unresolvable-theta-path` already
 * implements on this surface.
 */
function escapeMessage(path: string): string {
  return expectedMessage(INVOKE_PATH_ESCAPE_CODE, { "<path>": path });
}

/** `invoke '<callee>' passes too few arguments: expected <required> non-defaulted, got <provided>`. */
function tooFew(callee: string, required: number, provided: number): string {
  return expectedMessage(ARITY_TOO_FEW_CODE, {
    "<callee>": callee,
    "<required>": String(required),
    "<provided>": String(provided),
  });
}

/**
 * The placeholder-free spine of the too-few *Message* that follows the
 * `<callee>` slot, for the element-2 ABSENCE probe. Derived from the registry
 * row rather than written out, so a reworded row reds cell A instead of
 * silently detaching the absence assertion from the rule it is about.
 */
const ARITY_SPINE = ((): string => {
  const template = registryMessage(REGISTRY, ARITY_TOO_FEW_CODE) as string;
  const marker = "'<callee>' ";
  const start = template.indexOf(marker);
  expect(
    start,
    `${ARITY_TOO_FEW_CODE}: the Message template no longer opens with a quoted ` +
      "<callee> slot, so the element-2 absence probe cannot be derived from it",
  ).toBeGreaterThanOrEqual(0);
  const rest = template.slice(start + marker.length);
  const end = rest.indexOf("<");
  expect(
    end,
    `${ARITY_TOO_FEW_CODE}: the Message template carries no placeholder after ` +
      "<callee>, so its fixed spine cannot be isolated",
  ).toBeGreaterThan(0);
  return rest.slice(0, end).trimEnd();
})();

// --- Planted discovery workspace -------------------------------------------

function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}

/**
 * Two required `params:` — `requiredCount` 2, `totalCount` 2. Every escaping
 * cell calls its callee with exactly two string arguments, so neither bug
 * 0071's arity rule nor bug 0072's per-argument type rules
 * (`theta/parse/tool-arg-type-mismatch`) have a subject: containment is the
 * only rule left that can reject the entry (§Fix constraint 7's
 * no-co-firing-rule requirement).
 */
const TWO_REQUIRED = ["params:", "  x: string", "  y: string"] as const;

/**
 * The out-of-root callee stems, one per cell. `ctx.ui.notify` carries the
 * message text with no caller attribution, so the collector is
 * workspace-global; a per-cell callee is what makes a cell's ABSENCE assertion
 * attributable to that cell. No stem is a substring of another, and the
 * notification probe matches on `<stem>.theta` / `'<presented name>'` rather
 * than on the bare stem, so a random `mkdtemp` suffix cannot collide with one.
 */
const OUT_OF_ROOT_SUBAGENT_CALLEES = [
  "absfar",
  "quotedfar",
  "relfar",
  "invfar",
  "arityfar",
  "renamefar",
  "linkfar",
] as const;

interface LoadOutcome {
  /** Slash names the production compose helper returned (returned fixtures). */
  readonly registered: readonly string[];
  /** Diagnostic messages surfaced via `ctx.ui.notify`. */
  readonly notifications: readonly string[];
}

let outcome: LoadOutcome;
let workspaceDir: string;
let outsideDir: string;
/** Forward-slash-normalised `outsideDir`, the form every absolute entry spec uses. */
let outSpecDir: string;
let projectThetaDir: string;
/** The `..`-relative spelling of the cell-C3 entry, computed from the two temp dirs. */
let relSpec: string;
/** Set iff planting the constraint-(c) junction failed; cell I fails loudly on it. */
let junctionError: string | undefined;

async function runProductionLoad(cwd: string): Promise<LoadOutcome> {
  const notifications: string[] = [];
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;

  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(pi, ctx);
  return { registered: fixtures.map((f) => f.slashName), notifications };
}

function plant(dir: string, stem: string, text: string): void {
  writeFileSync(join(dir, `${stem}.theta`), text, "utf8");
}

beforeAll(async () => {
  outsideDir = mkdtempSync(join(tmpdir(), "theta-b0110-out-"));
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-b0110-ws-"));
  projectThetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(projectThetaDir, { recursive: true });
  // Every absolute entry spec is written forward-slashed: a host-native
  // backslash path inside a DOUBLE-QUOTED YAML scalar (cell C2) would be read
  // as an escape sequence, which would reject that cell on YAML syntax rather
  // than on containment.
  outSpecDir = outsideDir.replace(/\\/g, "/");
  relSpec = relative(projectThetaDir, join(outsideDir, "relfar.theta")).replace(
    /\\/g,
    "/",
  );

  // --- the out-of-root callees, in a directory discovery never visits -------
  for (const stem of OUT_OF_ROOT_SUBAGENT_CALLEES) {
    plant(outsideDir, stem, theta("---", "mode: subagent", ...TWO_REQUIRED, "---", "@`hi`"));
  }
  // Cell H1 — constraint 1 at the entry level: a PROMPT-mode out-of-root callee.
  plant(outsideDir, "promptfar", theta("---", "mode: prompt", ...TWO_REQUIRED, "---", "@`hi`"));
  // Cell H2 — an out-of-root callee carrying its OWN error-severity parse
  // diagnostics (`theta/parse/unresolved-named-type`, one per param).
  plant(
    outsideDir,
    "brokenfar",
    theta(
      "---",
      "mode: subagent",
      "params:",
      "  x: NoSuchType",
      "  y: NoSuchType",
      "---",
      "@`hi`",
    ),
  );
  // Cell I's precondition witness: a theta that WOULD register if the discovery
  // walk ever reached the outside directory through the junction. Its absence
  // from the registered set is what proves the junction contributes no active
  // root of its own (`enumerateDirectory`, `src/discovery/discovery-walk.ts`,
  // collects `*.theta` files and does not recurse into subdirectories).
  plant(outsideDir, "linkprobe", theta("---", "mode: subagent", "---", "@`hi`"));

  // --- cell D: the in-root control -----------------------------------------
  plant(
    projectThetaDir,
    "nearcallee",
    theta("---", "mode: subagent", ...TWO_REQUIRED, "---", "@`hi`"),
  );
  plant(
    projectThetaDir,
    "callnear",
    theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./nearcallee.theta",
      "---",
      'nearcallee("a", "b")?',
      "@`hi`",
    ),
  );

  // --- cells C1-C3: the three escaping spellings ---------------------------
  plant(
    projectThetaDir,
    "callabsfar",
    theta(
      "---",
      "mode: subagent",
      "tools:",
      `  - ${outSpecDir}/absfar.theta`,
      "---",
      'absfar("a", "b")?',
      "@`hi`",
    ),
  );
  plant(
    projectThetaDir,
    "callquotedfar",
    theta(
      "---",
      "mode: subagent",
      "tools:",
      `  - "${outSpecDir}/quotedfar.theta"`,
      "---",
      'quotedfar("a", "b")?',
      "@`hi`",
    ),
  );
  plant(
    projectThetaDir,
    "callrelfar",
    theta(
      "---",
      "mode: subagent",
      "tools:",
      `  - ${relSpec}`,
      "---",
      'relfar("a", "b")?',
      "@`hi`",
    ),
  );

  // --- cell E: the `invoke(...)` control surface ---------------------------
  plant(
    projectThetaDir,
    "invokefar",
    theta(
      "---",
      "mode: subagent",
      "---",
      `invoke("${outSpecDir}/invfar.theta", "a", "b")?`,
      "@`hi`",
    ),
  );

  // --- cell F: element-2 ordering ------------------------------------------
  plant(
    projectThetaDir,
    "callarityfar",
    theta(
      "---",
      "mode: subagent",
      "tools:",
      `  - ${outSpecDir}/arityfar.theta`,
      "---",
      'arityfar("a")?',
      "@`hi`",
    ),
  );

  // --- cell G: an `as` rename at an out-of-root callee ---------------------
  plant(
    projectThetaDir,
    "callrenamefar",
    theta(
      "---",
      "mode: subagent",
      "tools:",
      `  - ${outSpecDir}/renamefar.theta as farrenamed`,
      "---",
      'farrenamed("a", "b")?',
      "@`hi`",
    ),
  );

  // --- cells H1-H2: containment precedes every callee-derived rule ---------
  plant(
    projectThetaDir,
    "callpromptfar",
    theta(
      "---",
      "mode: subagent",
      "tools:",
      `  - ${outSpecDir}/promptfar.theta`,
      "---",
      'promptfar("a", "b")?',
      "@`hi`",
    ),
  );
  plant(
    projectThetaDir,
    "callbrokenfar",
    theta(
      "---",
      "mode: subagent",
      "tools:",
      `  - ${outSpecDir}/brokenfar.theta`,
      "---",
      'brokenfar("a", "b")?',
      "@`hi`",
    ),
  );

  // --- cell I: the `realpath`-vs-bare-resolve divergence -------------------
  // A directory junction inside the active root pointing at the out-of-root
  // directory. `./farlink/linkfar.theta` bare-resolves INSIDE the root while
  // its `realpath` lies outside it, so the cell can only go green through the
  // primitive both sides are canonicalised with inside
  // `checkInvokePathContainment` (`src/runtime/invocation.ts:98`):
  // `canonicalizePath` (`:142`), which wraps `FileSystem.realpath`.
  try {
    symlinkSync(outsideDir, join(projectThetaDir, "farlink"), "junction");
  } catch (error: unknown) {
    junctionError =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }
  plant(
    projectThetaDir,
    "calllinkfar",
    theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - ./farlink/linkfar.theta",
      "---",
      'linkfar("a", "b")?',
      "@`hi`",
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

/**
 * Notifications naming one callee: by its `<stem>.theta` filename (every
 * path-rendering message) or by its quoted presented callable name (every
 * `<callee>`-rendering message on the `.theta`-callable surface).
 */
function notificationsNaming(stem: string, presentedName = stem): readonly string[] {
  return outcome.notifications.filter(
    (n) => n.includes(`${stem}.theta`) || n.includes(`'${presentedName}'`),
  );
}

/** Notifications naming `presentedName` that report an arity rejection. */
function arityMessagesNaming(presentedName: string): readonly string[] {
  return outcome.notifications.filter(
    (n) => n.includes(`'${presentedName}'`) && n.includes(ARITY_SPINE),
  );
}

// ===========================================================================
// Cell A — DIAG-4 registry sourcing. Every code this file asserts on (or
// asserts the ABSENCE of) has a registry row carrying the placeholders the
// expected strings are built from, so deleting or reshaping a row reds here
// rather than silently detaching the cells below from the registry.
// ===========================================================================
describe("bug 0110 cell A — the codes this file asserts on are registered with the placeholders it substitutes", () => {
  it("A: theta/load/invoke-path-escape is registered and its Message carries <path>", () => {
    const row = REGISTRY.find((r) => r.code === INVOKE_PATH_ESCAPE_CODE);
    expect(
      row,
      `${INVOKE_PATH_ESCAPE_CODE} has no registry row — the code this file asserts ` +
        "is not registered (DIAG-2)",
    ).toBeDefined();
    expect(
      registryMessage(REGISTRY, INVOKE_PATH_ESCAPE_CODE) as string,
      `${INVOKE_PATH_ESCAPE_CODE}: Message template lost <path>`,
    ).toContain("<path>");
  });

  it("A: the three codes the constraint-1 absence cells anchor on are registered", () => {
    for (const code of [
      ARITY_TOO_FEW_CODE,
      PROMPT_MODE_CALLABLE_CODE,
      CALLEE_HAS_ERRORS_CODE,
      UNRESOLVABLE_THETA_PATH_CODE,
    ]) {
      expect(
        registryMessage(REGISTRY, code),
        `${code} has no registry row — cells F, H1, H2 and I anchor on its Message`,
      ).toBeTypeOf("string");
    }
  });

  it("A: the too-few Message yields a placeholder-free spine for the element-2 absence probe", () => {
    expect(
      ARITY_SPINE.length,
      `${ARITY_TOO_FEW_CODE}: the derived absence probe is empty, so cell F would ` +
        "assert nothing",
    ).toBeGreaterThan(0);
    expect(
      tooFew("arityfar", 2, 1),
      "the derived spine is not a substring of the rendered too-few message, so the " +
        "element-2 absence probe cannot match the message it is about",
    ).toContain(ARITY_SPINE);
  });
});

// ===========================================================================
// Cell B0 — the shared precondition guard. Every cell below reads one shared
// load outcome, so a failed discovery walk would red them all for a reason that
// is not bug 0110. `callnear` resolves a `tools:` `.theta` entry and calls it at
// exact arity, so its registration witnesses the walk AND the `tools:`
// resolution route. The relative-spelling guard pins that cell C3's entry is an
// escaping spelling rather than an accidental in-root path.
// ===========================================================================
describe("bug 0110 cell B0 — the production load path discovered the planted workspace", () => {
  it("B0: the in-root control theta registered", () => {
    expect(
      outcome.registered,
      "the discovery walk found nothing: the project `.pi/theta/` walk over the " +
        "planted workspace did not register the in-root control theta, so the " +
        "precondition every cell in this file depends on is unmet. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("callnear");
  });

  it("B0: the cell-C3 entry is spelled as a `..`-relative escape", () => {
    expect(
      relSpec,
      "the two temp directories landed in a layout where the out-of-root callee is " +
        "reachable without leaving the workspace, so cell C3 is not an escaping " +
        `spelling. Computed spec: ${relSpec}`,
    ).toMatch(/^\.\.\//);
  });
});

// ===========================================================================
// Cells C1-C3 — the three escaping spellings of a `tools:` `.theta` entry:
// absolute plain scalar, absolute double-quoted scalar, `..`-relative. Each
// names its own out-of-root callee at exact arity with two string arguments, so
// no arity, argument-type, unresolvable-path, prompt-mode, rename,
// derived-name or collision rule has a subject. Containment is the only rule
// that can reject them, and `tool-calls.md:14` says it must:
// "the callable is not created".
//
// C2's entry is written double-quoted; YAML decodes the scalar before the
// `tools:` resolution sees it, so `<path>` renders the same unquoted spec C1
// renders — the same reading `theta/load/unresolvable-theta-path` already
// implements for this surface.
// ===========================================================================
describe("bug 0110 cells C1-C3 — an out-of-root `tools:` `.theta` entry creates no callable", () => {
  it("C1: an absolute plain-scalar out-of-root entry un-registers its caller", () => {
    expect(
      outcome.registered,
      "a `tools:` entry naming a callee outside every active discovery root minted " +
        "the callable and the caller registered. `tool-calls.md:14`: the callable is " +
        "not created. Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("callabsfar");
  });

  it("C1: theta/load/invoke-path-escape names the entry spec as written", () => {
    expect(
      outcome.notifications,
      "no containment diagnostic surfaced for the absolute out-of-root `tools:` " +
        "entry. Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(escapeMessage(`${outSpecDir}/absfar.theta`));
  });

  it("C2: a double-quoted absolute out-of-root entry un-registers its caller", () => {
    expect(
      outcome.registered,
      "the double-quoted YAML spelling of an out-of-root entry escaped the " +
        "containment rule. Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("callquotedfar");
  });

  it("C2: theta/load/invoke-path-escape names the decoded scalar", () => {
    expect(
      outcome.notifications,
      "no containment diagnostic surfaced for the double-quoted out-of-root `tools:` " +
        "entry. Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(escapeMessage(`${outSpecDir}/quotedfar.theta`));
  });

  it("C3: a `..`-relative escaping entry un-registers its caller", () => {
    expect(
      outcome.registered,
      "a `..`-relative entry that climbs out of every active discovery root minted " +
        "the callable and the caller registered. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("callrelfar");
  });

  it("C3: theta/load/invoke-path-escape names the relative spec as written", () => {
    expect(
      outcome.notifications,
      "no containment diagnostic surfaced for the `..`-relative out-of-root `tools:` " +
        "entry. Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(escapeMessage(relSpec));
  });
});

// ===========================================================================
// Cell D — the in-root control. The rule holds in both directions: an entry
// naming a sibling inside the active root registers, with nothing on the
// containment channel. Its callee `nearcallee` is referenced by this caller
// alone, which is what makes the workspace-global absence assertion sound.
// ===========================================================================
describe("bug 0110 cell D — an in-root `tools:` `.theta` entry still registers silently", () => {
  it("D: the in-root caller registers", () => {
    expect(
      outcome.registered,
      "the containment check rejected a sibling callee inside the active discovery " +
        "root. Registered: " + JSON.stringify(outcome.registered),
    ).toContain("callnear");
  });

  it("D: no diagnostic names the in-root callee", () => {
    expect(
      notificationsNaming("nearcallee"),
      "a diagnostic fired against a `tools:` entry naming a sibling inside the " +
        "caller's own directory, which is inside the root that directory contributes",
    ).toEqual([]);
  });
});

// ===========================================================================
// Cell E — the `invoke(...)` surface, unchanged. This cell pins that the fix
// ADDED a second load-time call site of `checkInvokePathAtLoad`
// (`src/runtime/invocation.ts:185`) rather than moving the one that exists, and
// it is the in-run proof that the out-of-root directory lies outside every
// active root at this point in the load: without that, every C/F/G/H/I cell
// above and below would be asserting against a root union that already contains
// the callees.
// ===========================================================================
describe("bug 0110 cell E — the `invoke(...)` containment surface is unchanged", () => {
  it("E: an escaping `invoke(...)` literal un-registers its caller", () => {
    expect(
      outcome.registered,
      "the `invoke(...)` surface's containment rejection regressed. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("invokefar");
  });

  it("E: theta/load/invoke-path-escape renders the verbatim path literal", () => {
    expect(
      notificationsNaming("invfar"),
      "the `invoke(...)` surface no longer reports exactly one containment " +
        "diagnostic rendering its verbatim path literal",
    ).toEqual([escapeMessage(`${outSpecDir}/invfar.theta`)]);
  });
});

// ===========================================================================
// Cell F — element 2, the ordering consequence. An out-of-root callee called at
// the WRONG arity must attract the containment rejection and NOT bug 0071's
// arity rejection: for a callable the spec says was never created, no rule
// derived from the callee's contents has a subject (§Fix constraint 1). Both
// halves are asserted — the containment message present, and no arity message
// naming that callee anywhere in the run.
// ===========================================================================
describe("bug 0110 cell F — containment is judged before the `.theta`-callable arity check", () => {
  it("F: the wrong-arity out-of-root caller un-registers", () => {
    expect(
      outcome.registered,
      "the caller of an out-of-root callee did not un-register at all. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("callarityfar");
  });

  it("F: theta/load/invoke-path-escape names the out-of-root entry", () => {
    expect(
      outcome.notifications,
      "no containment diagnostic surfaced for the out-of-root entry whose call is " +
        "also at the wrong arity. Notified: " + JSON.stringify(outcome.notifications),
    ).toContain(escapeMessage(`${outSpecDir}/arityfar.theta`));
  });

  it("F: no arity diagnostic names the out-of-root callee", () => {
    expect(
      arityMessagesNaming("arityfar"),
      "bug 0071's arity check emitted against a callee the spec says has no callable, " +
        "so the caller is un-registered on the wrong rule and the author is directed " +
        "at their argument list instead of the entry's path",
    ).toEqual([]);
    expect(
      outcome.notifications,
      "the exact too-few message for the out-of-root callee is present, so the " +
        "containment check does not precede the arity loop",
    ).not.toContain(tooFew("arityfar", 2, 1));
  });
});

// ===========================================================================
// Cell G — an `as` rename at an out-of-root callee. The presented name and the
// entry's `calleePath` diverge here (bug 0071 §Fix constraint 2's hazard
// class): a check that re-derived the callee path from the presented name would
// resolve `farrenamed` against the caller's directory, find nothing outside the
// root, and emit nothing. `<path>` renders the entry spec, which is the path
// token alone — the `as` clause is not part of it.
// ===========================================================================
describe("bug 0110 cell G — an `as`-renamed out-of-root entry is judged on its path", () => {
  it("G: the `as`-renamed out-of-root caller un-registers", () => {
    expect(
      outcome.registered,
      "an `as` rename carried an out-of-root callee past the containment rule. " +
        "Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("callrenamefar");
  });

  it("G: theta/load/invoke-path-escape names the entry's path token, not the rename target", () => {
    expect(
      notificationsNaming("renamefar", "farrenamed"),
      "the `as`-renamed out-of-root entry did not draw exactly one containment " +
        "diagnostic rendering its path token",
    ).toEqual([escapeMessage(`${outSpecDir}/renamefar.theta`)]);
  });
});

// ===========================================================================
// Cells H1-H2 — §Fix constraint 1 at the entry level. An entry rejected on its
// PATH has no callee contents to judge, so no rule derived from those contents
// may co-fire at the same callee. H1 pins the declared-mode rule, H2 the
// callee's-own-errors rule. Both callers un-register today, on those rules; the
// fix changes WHICH code un-registers them, and both halves are asserted.
// ===========================================================================
describe("bug 0110 cells H1-H2 — a path-rejected entry draws no callee-derived diagnostic", () => {
  it("H1: a prompt-mode out-of-root callee draws exactly the containment diagnostic", () => {
    expect(
      outcome.registered,
      "the caller of a prompt-mode out-of-root callee registered. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("callpromptfar");
    expect(
      notificationsNaming("promptfar"),
      "a prompt-mode out-of-root entry did not draw exactly one containment " +
        "diagnostic: either containment is absent, or `theta/load/prompt-mode-callable` " +
        "co-fired at a callee whose contents the spec says were never reached",
    ).toEqual([escapeMessage(`${outSpecDir}/promptfar.theta`)]);
  });

  it("H1: theta/load/prompt-mode-callable does not name the out-of-root callee", () => {
    expect(
      outcome.notifications,
      "the entry was rejected on its declared mode rather than on its path, so the " +
        "author is directed at the callee's frontmatter instead of the entry's path",
    ).not.toContain(
      expectedMessage(PROMPT_MODE_CALLABLE_CODE, {
        "<path>": `${outSpecDir}/promptfar.theta`,
      }),
    );
  });

  it("H2: an erroring out-of-root callee draws exactly the containment diagnostic", () => {
    expect(
      outcome.registered,
      "the caller of an erroring out-of-root callee registered. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("callbrokenfar");
    expect(
      notificationsNaming("brokenfar"),
      "an out-of-root entry whose callee carries its own error-severity parse " +
        "diagnostics did not draw exactly one containment diagnostic: either " +
        "containment is absent, or `theta/load/callee-has-errors` co-fired at a callee " +
        "whose bytes the spec says were never admitted",
    ).toEqual([escapeMessage(`${outSpecDir}/brokenfar.theta`)]);
  });

  it("H2: theta/load/callee-has-errors does not name the out-of-root callee", () => {
    expect(
      outcome.notifications,
      "the entry was rejected on its callee's own parse errors rather than on its " +
        "path, so a fix to the callee's `params:` would leave the entry registered",
    ).not.toContain(
      expectedMessage(CALLEE_HAS_ERRORS_CODE, {
        "<path>": `${outSpecDir}/brokenfar.theta`,
      }),
    );
  });
});

// ===========================================================================
// Cell I — §Fix constraint 3: the resolution primitive is `realpath`, and it is
// mandatory (`docs/spec_topics/invocation.md:12`: "a symlink farm inside a
// discovery root that resolves outside it is still rejected").
//
// A directory junction `<ws>/.pi/theta/farlink` points at the out-of-root
// directory. The entry `./farlink/linkfar.theta` bare-resolves INSIDE the
// active root — so the bare `resolvePath` at
// `src/extension/production-composition.ts:2187` cannot distinguish it from an
// in-root sibling — while its `realpath` lies outside every root. Only a
// `realpath`-based check reds this cell, which is what makes it the witness for
// "call `checkInvokePathAtLoad`, do not substitute `resolvePath`".
//
// A junction that cannot be planted fails this cell LOUDLY naming the unmet
// precondition; it is never skipped.
// ===========================================================================
describe("bug 0110 cell I — containment is decided on `realpath`, not on the bare resolve", () => {
  it("I: the junction precondition is met", () => {
    expect(
      junctionError,
      "the constraint-(c) directory junction could not be planted, so the " +
        "`realpath`-vs-bare-resolve divergence has no witness on this host: " +
        `fs.symlinkSync(<dir>, <link>, "junction") failed with ${junctionError}`,
    ).toBeUndefined();
  });

  it("I: the junction contributes no active discovery root of its own", () => {
    expect(
      outcome.registered,
      "the discovery walk descended through the junction, so the out-of-root " +
        "directory became an active root and the cell can no longer witness an " +
        "escape. Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("linkprobe");
  });

  it("I: the entry bare-resolves inside the root and `realpath`s outside it", () => {
    const bare = join(projectThetaDir, "farlink", "linkfar.theta").replace(/\\/g, "/");
    const root = projectThetaDir.replace(/\\/g, "/");
    const canonical = realpathSync(bare).replace(/\\/g, "/");
    // A host whose `tmpdir()` itself sits behind a symlink resolves that
    // symlink inside `canonical` along with the junction; comparing against
    // the raw, un-resolved `outSpecDir` would then diverge for a reason the
    // containment check never sees, so the comparison side is `outsideDir`'s
    // own `realpath`, computed once, here alone.
    const outsideDirCanonical = realpathSync(outsideDir).replace(/\\/g, "/");
    expect(
      bare.startsWith(`${root}/`),
      "the junction entry does not bare-resolve inside the active root, so a " +
        "bare-resolve check would already reject it and the cell no longer isolates " +
        `the \`realpath\` primitive. Bare resolve: ${bare}; root: ${root}`,
    ).toBe(true);
    expect(
      canonical.startsWith(`${outsideDirCanonical}/`),
      "the junction entry's `realpath` does not leave the active root, so the cell " +
        `witnesses no escape. Canonical path: ${canonical}; out-of-root directory (canonical): ${outsideDirCanonical}`,
    ).toBe(true);
  });

  it("I: the junction-reached out-of-root callee un-registers its caller", () => {
    expect(
      outcome.registered,
      "a `tools:` entry whose bare resolve stays inside the root but whose `realpath` " +
        "leaves it minted the callable: the entry's path met a bare `resolvePath` and " +
        "no `realpath`. Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("calllinkfar");
  });

  it("I: theta/load/invoke-path-escape is the only diagnostic naming the junction entry", () => {
    expect(
      notificationsNaming("linkfar"),
      "the junction entry did not draw exactly one containment diagnostic rendering " +
        "the entry spec as written. A `theta/load/unresolvable-theta-path` here would " +
        "mean the junction target is gone rather than that containment fired",
    ).toEqual([escapeMessage("./farlink/linkfar.theta")]);
  });
});

// ===========================================================================
// Cell J — §Fix constraint 7's no-co-firing requirement, asserted over every
// escaping cell at once: each escaping entry's un-registration is caused by
// containment and by nothing else. Every other entry rule is satisfiable in
// every one of these cells (exact arity, matching argument types, a resolvable
// path, subagent mode, a lowercase-first derived name, no collision), so the
// set of diagnostics naming a cell's callee must be exactly its containment
// message.
// ===========================================================================
const ESCAPING_CELLS: readonly {
  readonly caller: string;
  readonly stem: string;
  readonly presented: string;
  readonly spec: () => string;
}[] = [
  { caller: "callabsfar", stem: "absfar", presented: "absfar", spec: () => `${outSpecDir}/absfar.theta` },
  { caller: "callquotedfar", stem: "quotedfar", presented: "quotedfar", spec: () => `${outSpecDir}/quotedfar.theta` },
  { caller: "callrelfar", stem: "relfar", presented: "relfar", spec: () => relSpec },
  { caller: "callarityfar", stem: "arityfar", presented: "arityfar", spec: () => `${outSpecDir}/arityfar.theta` },
  { caller: "callrenamefar", stem: "renamefar", presented: "farrenamed", spec: () => `${outSpecDir}/renamefar.theta` },
  { caller: "callpromptfar", stem: "promptfar", presented: "promptfar", spec: () => `${outSpecDir}/promptfar.theta` },
  { caller: "callbrokenfar", stem: "brokenfar", presented: "brokenfar", spec: () => `${outSpecDir}/brokenfar.theta` },
  { caller: "calllinkfar", stem: "linkfar", presented: "linkfar", spec: () => "./farlink/linkfar.theta" },
];

describe("bug 0110 cell J — every escaping entry un-registers on containment alone", () => {
  for (const cell of ESCAPING_CELLS) {
    it(`J: ${cell.caller} draws exactly the containment diagnostic and nothing else`, () => {
      expect(
        outcome.registered,
        `${cell.caller} registered despite naming a callee outside every active ` +
          "discovery root. Registered: " + JSON.stringify(outcome.registered),
      ).not.toContain(cell.caller);
      expect(
        notificationsNaming(cell.stem, cell.presented),
        `${cell.caller}'s entry did not draw exactly one diagnostic — the containment ` +
          "one. Either containment is absent, or a second rule co-fired at a callee " +
          "the spec says was never admitted",
      ).toEqual([escapeMessage(cell.spec())]);
    });
  }
});
