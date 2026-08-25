import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { composeExtensionInstance } from "../src/extension/production-composition";
import { RendererGate, SYSTEM_NOTE_CHANNEL } from "../src/extension/system-note-channel";
import type { ParsedTheta } from "../src/extension/reload-wiring";

// Bug 0275 — FILED SYMPTOM: an escaping `tools:` `.theta` entry un-registered
// its owner and its owner's IMMEDIATE caller and stopped there, so every caller
// above them registered a callable over a file the same pass un-registered,
// carrying no row of its own. These cells lock the fixed disposition.
//
// THE TWO MECHANISMS. An escape verdict travels by two routes, and the fix
// divides the reach between them.
//   - `checkNestedToolsContainment` (`src/extension/production-composition.ts`)
//     judges the IMMEDIATE callee's own `tools:` entries against the immediate
//     callee's directory and relocates the verdict onto the caller's file
//     through the escape loop in `resolveThetaToolsAtLoad` (drained from
//     `parseCalleeForTools`'s `nestedToolsEscapes`). One level, by
//     construction — which is why `theta/load/invoke-path-escape` sits on the
//     entry owner's own file and its immediate caller's, and nowhere else.
//   - `calleeFailsOwnStructuralChecksBody`, bug 0271's recursive predicate, is
//     the mechanism that composes by induction. Its withhold (a) still takes
//     `continue` on an `escape`, so an out-of-root target's bytes are never
//     parsed, but it records that refusal as the frame's own `ownEscapes`
//     component, and the recursive call one level up folds it in as the deep
//     verdict `recursive.fails || recursive.ownEscapes`. The boolean entry
//     point returns the SHALLOW `fails` and discards `ownEscapes`, which is
//     what keeps the immediate caller on the relocation's single row. Before
//     the fix the withhold was a bare skip whose own doc-comment named this
//     report's subject as a gap; that wording is quoted in
//     `docs/bugs/0275-escaping-tools-entry-below-immediate-callee-silent-at-caller.md`.
// The disposition is positional, not depth-2-specific: whatever the chain
// length, the entry owner and its immediate caller carry the escape row and
// every caller above them carries `theta/load/callee-has-errors`. Skipping the
// PARSE of an out-of-root path is required and is not what these cells judge;
// carrying the VERDICT about the in-root, readable file that NAMES it up to
// every caller above the immediate one is what they lock.
//
// SPEC ANCHORS.
//   - `docs/spec_topics/invocation.md` line 20 (§Static resolution): a `.theta`
//     path named by a callee's own `tools:` is judged "for its own parse and
//     its own structural checks in turn, transitively, to whatever depth the
//     `tools:` graph reaches". The same sentence bounds the escaping TARGET
//     only — "a path outside every active discovery root is judged no further
//     than its existence, its readability, and its containment — its contents
//     are never parsed". No sentence bounds the reach of the verdict about the
//     file that names such a path short of the immediate caller, which is what
//     cells (A), (B) and (E) lock.
//   - `docs/spec_topics/invocation.md` line 22 (per-surface severity): a callee
//     that "fails its own structural checks is *not statically resolvable*",
//     and on the `tools:` surface "the callable cannot be created, and the
//     parent theta does not register". The grandchild in cells (A), (B) and the
//     great-grandchild in (E) fail a structural check of their own — the same
//     pass records it, at their own file, under
//     `theta/load/invoke-path-escape` — so that sentence settles every caller
//     above them as REFUSAL AT LOAD.
//   - `docs/spec_topics/diagnostics/code-registry-load.md` line 42 —
//     `theta/load/callee-has-errors`, `E` on the `tools:` surface, already
//     ERR-6-classified through `preEvalCauseOf`'s `tools-resolution` batch. Bug
//     0275 §Fix constraint 4 prefers this existing row over a newly minted
//     code, so no new registry row is asserted here.
//   - `docs/spec_topics/diagnostics/code-registry-load.md` line 36 —
//     `theta/load/invoke-path-escape`, whose Trigger names the ENTRY ("a
//     `tools:` `.theta` entry resolves (post-realpath) to a path that lies
//     outside every active discovery root") and not the depth of the file
//     declaring it. It stays the entry owner's row and its immediate caller's;
//     cells (A), (B), (C) and (E) pin that it spreads no further.
//   - `docs/spec_topics/frontmatter/frontmatter-fields-a.md` line 74: `tools`
//     declares the callable set exposed "from both the model … and from theta
//     code", which is why a silently registered dead callable reaches a model
//     turn after the caller has spent tokens.
//
// WHAT THIS FILE PINS. One cell per bug 0275 §Reproduction row:
//   (A) the grandchild's own entry escapes, spelled relatively: the escape row
//       stays at the grandchild and the child, the grandparent carries
//       `theta/load/callee-has-errors`, and nothing registers. The fix's
//       central claim — this cell reds if the deep verdict stops composing.
//   (B) the same entry spelled as an absolute path: the same outcome as (A),
//       so the verdict cannot be a function of the entry's spelling. This cell
//       exists so an implementation cannot satisfy (A) by matching `../`.
//   (C) depth-1 control: the child's own entry escapes, and the grandparent
//       carries exactly one row, the relocated escape row. The
//       ANTI-DOUBLE-REPORT LOCK.
//   (D) control — nothing escapes, three healthy levels: no diagnostic
//       anywhere and all three register, so no cell above can pass by refusing
//       everything.
//   (E) depth 3: the great-grandchild's own entry escapes, so BOTH the child
//       and the grandparent carry `theta/load/callee-has-errors`. This cell
//       forbids an implementation hard-coded to depth two.
// Cell (C) is bug 0248's and bug 0111's landed depth-1 behaviour: bug 0275
// §Fix constraint 2 keeps exactly one caller-located row for one escaping entry
// at depth 1, so an implementation that folds containment into the recursion
// without gating the level the relocation already covers reds there.
//
// TIER: unit — offline, provider-free, deterministic. Host doubles only; no
// provider, no child process, no live model. The seam is one predicate and one
// relocation loop inside the shipped composition root, and
// `composeExtensionInstance` over planted files reaches both directly and
// exposes the registration decisions on `wiring.thetas`, so neither an
// integration nor a live tier is needed. The harness (`makeHost` /
// `plantWorkspace` / `runLoadPass`) is modelled on, and duplicated from rather
// than shared with, `tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts`,
// bug 0271's landed witness, which this file neither reads from nor mutates.
//
// PATH SEPARATORS. Two walks spell the same file differently. Every path
// comparison below separator-normalises both sides first; the spelling
// divergence itself is bug 0268's subject and is neither touched nor asserted
// on.
//
// CLOSURE HASHES. Cell (D) pins the entry SHAPE and the `sha256:` form, never a
// literal digest: the digest covers the fixture's own bytes, so a literal would
// red on any fixture edit while witnessing nothing. The hash is a function of
// RFC-0005's closure scope (the child file plus its transitive `.thetalib`
// imports, not the grandchild), so it cannot distinguish an escaping
// grandchild from a healthy one; what separates rows A and B from row D is the
// registration decision and the diagnostic rows, never the hash, which is
// asserted on in neither direction outside this control.
//
// DIAG-4. Expected messages are read out of the shipped registry pages through
// `registryMessage`, never copied as prose, so registry drift reds here instead
// of silently comparing against a stale sentence.
//
// No silent skipping: a cell whose precondition is unmet (registry row absent,
// host double never driven, the escape route no longer firing on the fixture)
// throws naming the precondition.

// ── Codes ───────────────────────────────────────────────────────────────────

const CALLEE_HAS_ERRORS_CODE = "theta/load/callee-has-errors";
const INVOKE_PATH_ESCAPE_CODE = "theta/load/invoke-path-escape";

// ── Fixtures (bug 0275 §Reproduction) ───────────────────────────────────────

const GP_NAME = "b0275gp.theta";
const GP_STEM = "b0275gp";
const CHILD_NAME = "b0275child.theta";
const CHILD_STEM = "b0275child";
const GC_NAME = "b0275gc.theta";
const GC_STEM = "b0275gc";
const GGC_NAME = "b0275ggc.theta";
const GGC_STEM = "b0275ggc";
/** The escape target: planted outside every discovery root, existing, readable. */
const OUT_NAME = "b0275out.theta";

/** The one prompt-mode grandparent shape every cell uses. */
const GP_SOURCE = `---\nmode: prompt\ntools:\n  - ./${CHILD_NAME} as child\n---\n@\`hi\`\n`;

/** The child: subagent mode, clean body, its own `tools:` naming the grandchild. */
const CHILD_SOURCE =
  `---\nmode: subagent\ndescription: b0275 child\ntools:\n  - ./${GC_NAME} as grand\n---\nlet a = 1\n`;

/** A healthy subagent-mode leaf: clean body, no `tools:` of its own. */
function healthyLeafSource(label: string): string {
  return `---\nmode: subagent\ndescription: b0275 ${label}\n---\nlet a = 1\n`;
}

/**
 * A subagent-mode file whose OWN `tools:` entry names `spec`. Cells (A), (B)
 * and (C) differ only in which file carries this shape and how the escaping
 * path is spelled, which is what makes the disposition readable as positional.
 */
function namingSource(label: string, spec: string, alias: string): string {
  return (
    `---\nmode: subagent\ndescription: b0275 ${label}\ntools:\n  - ${spec} as ${alias}\n---\n` +
    "let a = 1\n"
  );
}

/**
 * The relative spelling of the escape, from `<cwd>/.pi/theta/` up to
 * `<cwd>/outside/`. `outside/` is not a discovery root, so the target exists
 * and is readable and still escapes — the disposition
 * `docs/spec_topics/invocation.md` line 20 reserves for containment.
 */
const RELATIVE_ESCAPE_SPEC = `../../outside/${OUT_NAME}`;

// ── Registry oracle (DIAG-4) ────────────────────────────────────────────────

interface RegistryRow {
  code: string;
  severity: string;
  phase: string;
  message: string;
}

const REGISTRY = ["code-registry-parse.md", "code-registry-load.md"].flatMap((page) =>
  parseRegistry(
    readFileSync(
      fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
      "utf8",
    ),
  ) as RegistryRow[],
);

/**
 * The row's normative *Message* (DIAG-4) as a regex with the `<placeholder>`
 * slots opened up. Throws naming the registry pages when the row is absent, so
 * registry drift can never degrade a presence assertion into a comparison
 * against `undefined`.
 */
function normativeMessagePattern(code: string): RegExp {
  const message = registryMessage(REGISTRY, code) as string | undefined;
  if (typeof message !== "string" || message.length === 0) {
    throw new Error(
      "harness: the docs/spec_topics/diagnostics/ registry pages carry no Message row for " +
        `${code} — the DIAG-4 column is this file's only message oracle, so a missing row ` +
        "is a harness failure, never a skip",
    );
  }
  const escaped = message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/<[a-z-]+>/g, ".+"));
}

// ── Host doubles ────────────────────────────────────────────────────────────

type PiHandler = (event: unknown, ctx: ExtensionContext) => unknown;

interface RecordedNote {
  readonly customType: string;
  readonly content: string;
  readonly details: unknown;
}

interface HostDouble {
  readonly pi: ExtensionAPI;
  readonly ctx: ExtensionContext;
  readonly notes: RecordedNote[];
  readonly notified: Array<readonly [string, string]>;
}

function makeHost(cwd: string): HostDouble {
  const notes: RecordedNote[] = [];
  const notified: Array<readonly [string, string]> = [];
  const handlers = new Map<string, PiHandler>();

  const pi = {
    registerFlag: (): void => {},
    getFlag: (): undefined => undefined,
    getCommands: (): readonly { name: string; source: string }[] => [],
    on: (event: string, handler: PiHandler): void => {
      handlers.set(event, handler);
    },
    registerCommand: (): void => {},
    sendUserMessage: (): void => {},
    registerTool: (): void => {},
    setActiveTools: (): void => {},
    getActiveTools: (): readonly unknown[] => [],
    getAllTools: (): readonly unknown[] => [],
    registerMessageRenderer: (): void => {},
    sendMessage: (message: { customType: string; content: string; details: unknown }): void => {
      notes.push({
        customType: message.customType,
        content: message.content,
        details: message.details,
      });
    },
  } as unknown as ExtensionAPI;

  const ctx = {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, type: "error"): void => {
        notified.push([message, type]);
      },
    },
  } as unknown as ExtensionContext;

  return { pi, ctx, notes, notified };
}

// ── The workspace ───────────────────────────────────────────────────────────

interface ComposeWorkspace {
  readonly cwd: string;
  /** Absolute, separator-normalised path of a file planted on the project source. */
  path: (name: string) => string;
  readonly dispose: () => void;
}

/** Separator-normalise a path so Win32 `\` and POSIX `/` spellings compare. */
function normalisePath(path: string): string {
  return path.replace(/\\/g, "/");
}

/**
 * A planted body, or a function of the workspace root that produces one. Cell
 * (B) spells its escaping entry as an ABSOLUTE path, which only exists once the
 * temporary root has been minted, so the body is deferred rather than the
 * workspace being rewritten after planting.
 */
type PlantedBody = string | ((cwd: string) => string);

/**
 * Plant the named fixture files on the conventional project source
 * (`.pi/theta/`), exactly as bug 0275 §Reproduction does. `outside` plants into
 * a sibling directory that is NOT a discovery root, which is how every escaping
 * cell reaches the containment route with a target that genuinely exists and is
 * genuinely readable. One workspace per cell keeps every decision below
 * attributable to that cell's file set.
 */
function plantWorkspace(
  files: Readonly<Record<string, PlantedBody>>,
  outside?: Readonly<Record<string, PlantedBody>>,
): ComposeWorkspace {
  const cwd = mkdtempSync(join(tmpdir(), "theta-b0275-"));
  mkdirSync(join(cwd, ".pi", "theta"), { recursive: true });
  const render = (body: PlantedBody): string => (typeof body === "string" ? body : body(cwd));
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(cwd, ".pi", "theta", name), render(body), "utf8");
  }
  if (outside !== undefined) {
    mkdirSync(join(cwd, "outside"), { recursive: true });
    for (const [name, body] of Object.entries(outside)) {
      writeFileSync(join(cwd, "outside", name), render(body), "utf8");
    }
  }
  // A minimal valid settings file pins the fixture's settings read to a known
  // value. An ABSENT settings file is silent (package-and-settings.md §Failure
  // modes), so the plant is hermeticity, not noise suppression.
  writeFileSync(join(cwd, ".pi", "settings.json"), "{}", "utf8");
  return {
    cwd,
    path: (name: string): string => normalisePath(join(cwd, ".pi", "theta", name)),
    dispose: (): void => rmSync(cwd, { recursive: true, force: true }),
  };
}

// ── The load pass ───────────────────────────────────────────────────────────

interface LoadPass {
  /** Every `theta-system-note` the pass put on the channel, in order. */
  readonly notes: readonly RecordedNote[];
  readonly offChannel: readonly RecordedNote[];
  readonly notified: readonly (readonly [string, string])[];
  /** Slash names the pass actually registered. */
  readonly registered: readonly string[];
  readonly thetas: readonly ParsedTheta[];
}

/**
 * Drive the SHIPPED composition root over the planted workspace with an
 * UNDEGRADED `RendererGate`, so every note takes the transcript
 * (`pi.sendMessage`) arm the author reads.
 */
async function runLoadPass(workspace: ComposeWorkspace): Promise<LoadPass> {
  const host = makeHost(workspace.cwd);
  const wiring = await composeExtensionInstance(host.pi, host.ctx, undefined, new RendererGate());
  return {
    notes: host.notes.filter((n) => n.customType === SYSTEM_NOTE_CHANNEL),
    offChannel: host.notes.filter((n) => n.customType !== SYSTEM_NOTE_CHANNEL),
    notified: host.notified,
    registered: wiring.thetas.map((t) => t.slashName),
    thetas: wiring.thetas,
  };
}

// ── Observation helpers ─────────────────────────────────────────────────────

function noteDiagnostics(note: RecordedNote): readonly Diagnostic[] {
  const details = note.details as { diagnostics?: unknown } | undefined;
  const diagnostics = details?.diagnostics;
  if (!Array.isArray(diagnostics)) {
    expect.fail(
      `system note carries no details.diagnostics array: ${JSON.stringify(note.details)}`,
    );
  }
  return diagnostics as readonly Diagnostic[];
}

function allDiagnostics(notes: readonly RecordedNote[]): readonly Diagnostic[] {
  return notes.flatMap((note) => [...noteDiagnostics(note)]);
}

function describeNotes(notes: readonly RecordedNote[]): string {
  return notes.length === 0
    ? "[] (NO NOTE ON THE CHANNEL)"
    : notes.map((n, i) => `[${i}] ${n.content}`).join("\n");
}

/** Error-severity rows the pass located at `file`, in emission order. */
function errorRowsAt(pass: LoadPass, file: string): readonly Diagnostic[] {
  return allDiagnostics(pass.notes).filter(
    (d) => d.severity === "error" && normalisePath(d.file ?? "") === file,
  );
}

/** Files at which the pass located an error-severity row of `code`, sorted. */
function errorFilesOf(pass: LoadPass, code: string): readonly string[] {
  return allDiagnostics(pass.notes)
    .filter((d) => d.severity === "error" && d.code === code)
    .map((d) => normalisePath(d.file ?? "?"))
    .sort();
}

/** The host double must have been driven at all before any decision means anything. */
function requireDriven(pass: LoadPass): void {
  if (pass.notes.length === 0 && pass.registered.length === 0) {
    throw new Error(
      "harness: the composition root neither registered a theta nor put anything on the " +
        "theta-system-note channel — the bug-0275 fixture no longer reaches the load pass, " +
        "so nothing below is verified",
    );
  }
}

/**
 * The premise every escaping cell rests on: the containment route fired at all
 * this pass, at the file whose own `tools:` entry escapes. Bug 0275's whole
 * claim is about the levels ABOVE that row, so its absence means the fixture
 * stopped escaping and the cell is measuring an unrelated pass.
 */
function requireEntryOwnerEscaped(pass: LoadPass, ownerPath: string): void {
  const escapeFiles = errorFilesOf(pass, INVOKE_PATH_ESCAPE_CODE);
  if (!escapeFiles.includes(ownerPath)) {
    throw new Error(
      `harness: no error-severity ${INVOKE_PATH_ESCAPE_CODE} row is located at the escaping ` +
        `entry's own file ${ownerPath} — that row is the premise of every assertion below, so ` +
        `its absence is a harness failure, never a skip. Escape rows at: ` +
        `${escapeFiles.join(", ") || "(none)"}\n${describeNotes(pass.notes)}`,
    );
  }
}

/**
 * Bug 0275 §Fix constraint 1 on the route `docs/spec_topics/invocation.md` line
 * 22 settles: a caller above the escaping entry's owner does not register, and
 * EXACTLY ONE error-severity row is located at its file — the V15f
 * `theta/load/callee-has-errors` push, carrying the registry's Message. One
 * entry names one callee, so one row; §Fix constraint 2 forbids a second beside
 * it.
 */
function expectCallerRefusedWithCalleeHasErrors(
  pass: LoadPass,
  callerPath: string,
  callerStem: string,
): void {
  expect(
    pass.registered,
    "the caller must not register over a callee this same pass un-registers\n" +
      describeNotes(pass.notes),
  ).not.toContain(callerStem);

  const rows = errorRowsAt(pass, callerPath);
  expect(
    rows.map((d) => d.code),
    `one escaping entry below this caller is one condition, so exactly one error-severity ` +
      `row belongs at ${callerPath}, and it is ${CALLEE_HAS_ERRORS_CODE}\n` +
      describeNotes(pass.notes),
  ).toEqual([CALLEE_HAS_ERRORS_CODE]);
  expect((rows[0] as Diagnostic).message, `${CALLEE_HAS_ERRORS_CODE} message`).toMatch(
    normativeMessagePattern(CALLEE_HAS_ERRORS_CODE),
  );
}

describe("bug 0275 — an escaping `tools:` entry below the immediate callee is silent at every caller above it", () => {
  // ── (A) the grandchild's own entry escapes, relative spelling ────────────

  it("(A) the grandchild's own `tools:` entry escapes: the grandparent does not register", async () => {
    const workspace = plantWorkspace(
      {
        [GP_NAME]: GP_SOURCE,
        [CHILD_NAME]: CHILD_SOURCE,
        [GC_NAME]: namingSource("grandchild", RELATIVE_ESCAPE_SPEC, "far"),
      },
      { [OUT_NAME]: healthyLeafSource("escape target") },
    );
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      requireEntryOwnerEscaped(pass, workspace.path(GC_NAME));

      // The relocation's half of the route, and the premise of the claim
      // below it: the entry owner draws its own escape row and its immediate
      // caller draws the relocated one. Both un-register.
      expect(
        [...errorFilesOf(pass, INVOKE_PATH_ESCAPE_CODE)],
        "the escape verdict belongs to the entry's own file and its immediate caller\n" +
          describeNotes(pass.notes),
      ).toEqual([workspace.path(CHILD_NAME), workspace.path(GC_NAME)].sort());

      // The claim, and the mechanism that carries it: the grandchild's frame
      // reports its own withhold (a) as `ownEscapes`, the child's frame folds
      // that into the deep verdict `recursive.fails || recursive.ownEscapes`,
      // and the V15f `theta/load/callee-has-errors` push at the grandparent
      // gains its subject.
      expectCallerRefusedWithCalleeHasErrors(pass, workspace.path(GP_NAME), GP_STEM);
      expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
      expect([...pass.registered]).not.toContain(CHILD_STEM);
      expect([...pass.registered]).not.toContain(GC_STEM);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (B) the same entry, absolute spelling ────────────────────────────────

  it("(B) the grandchild's escaping entry spelled ABSOLUTELY: the grandparent does not register", async () => {
    // The entry spelling must not be an input to the verdict: containment is
    // judged post-resolution, so a relative and an absolute spelling of the one
    // target are one condition. This cell exists so an implementation cannot
    // satisfy (A) by pattern-matching `../` segments.
    const workspace = plantWorkspace(
      {
        [GP_NAME]: GP_SOURCE,
        [CHILD_NAME]: CHILD_SOURCE,
        [GC_NAME]: (cwd: string): string =>
          namingSource("grandchild", normalisePath(join(cwd, "outside", OUT_NAME)), "far"),
      },
      { [OUT_NAME]: healthyLeafSource("escape target") },
    );
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      requireEntryOwnerEscaped(pass, workspace.path(GC_NAME));

      expect(
        [...errorFilesOf(pass, INVOKE_PATH_ESCAPE_CODE)],
        "the escape verdict belongs to the entry's own file and its immediate caller\n" +
          describeNotes(pass.notes),
      ).toEqual([workspace.path(CHILD_NAME), workspace.path(GC_NAME)].sort());

      expectCallerRefusedWithCalleeHasErrors(pass, workspace.path(GP_NAME), GP_STEM);
      expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
      expect([...pass.registered]).not.toContain(CHILD_STEM);
      expect([...pass.registered]).not.toContain(GC_STEM);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (C) depth-1 control: the anti-double-report lock ─────────────────────

  it("(C) depth-1 control — the child's own entry escapes: exactly one caller row, the escape row", async () => {
    // THE ANTI-DOUBLE-REPORT LOCK. At depth 1 the relocation already puts the
    // escape verdict on the caller's file, and bug 0275 §Fix constraint 2
    // keeps one condition to one caller-located row (the outcome bug 0271
    // cells (ESC)/(ESC2) and bug 0270 cells (D)/(D2)/(D3) pin). An
    // implementation that folds containment into the recursion without gating
    // the level the relocation covers draws
    // `theta/load/callee-has-errors` beside the escape row here and reds this
    // cell — which is the point of asserting the caller's row SET rather than
    // its non-emptiness.
    const workspace = plantWorkspace(
      {
        [GP_NAME]: GP_SOURCE,
        [CHILD_NAME]: namingSource("child", RELATIVE_ESCAPE_SPEC, "far"),
      },
      { [OUT_NAME]: healthyLeafSource("escape target") },
    );
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      requireEntryOwnerEscaped(pass, workspace.path(CHILD_NAME));

      expect(
        errorRowsAt(pass, workspace.path(GP_NAME)).map((d) => d.code),
        "one escaping entry at depth 1 draws exactly one grandparent-located row, the " +
          `relocated escape row, and must not co-fire ${CALLEE_HAS_ERRORS_CODE}\n` +
          describeNotes(pass.notes),
      ).toEqual([INVOKE_PATH_ESCAPE_CODE]);
      expect(
        errorFilesOf(pass, CALLEE_HAS_ERRORS_CODE),
        `an escaping entry's contents are never parsed, so ${CALLEE_HAS_ERRORS_CODE} has no ` +
          `subject anywhere on this fixture\n${describeNotes(pass.notes)}`,
      ).toEqual([]);
      expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (D) the healthy three-level control ──────────────────────────────────

  it("(D) control — nothing escapes: grandparent, child and grandchild all register", async () => {
    const workspace = plantWorkspace({
      [GP_NAME]: GP_SOURCE,
      [CHILD_NAME]: CHILD_SOURCE,
      [GC_NAME]: healthyLeafSource("grandchild"),
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);

      expect([...pass.registered].sort(), describeNotes(pass.notes)).toEqual([
        CHILD_STEM,
        GC_STEM,
        GP_STEM,
      ]);
      expect(
        allDiagnostics(pass.notes).map(
          (d) => `${d.severity} ${d.code} @ ${normalisePath(d.file ?? "?")}`,
        ),
        "a healthy three-level chain must draw no diagnostic anywhere",
      ).toEqual([]);

      // The frozen `tools:` snapshot the grandparent carries. This is the
      // shape cells (A) and (B) forbid the grandparent to mint — there the
      // grandparent does not register at all — and the one this control
      // requires it to keep minting when nothing escapes.
      const gp = pass.thetas.find((t) => t.slashName === GP_STEM);
      if (gp === undefined) {
        throw new Error(
          "harness: the control registered no grandparent, so the callable-set assertions " +
            `below have no subject\n${describeNotes(pass.notes)}`,
        );
      }
      const entry = gp.callableSet?.entries.get("child") as
        | { kind?: string; mode?: string; calleePath?: string; closureHash?: string }
        | undefined;
      expect(entry, "the grandparent's frozen callable set carries no `child` entry").toBeDefined();
      expect(entry?.kind).toBe("theta");
      expect(entry?.mode).toBe("subagent");
      expect(entry?.calleePath).toBe(`./${CHILD_NAME}`);
      expect(typeof entry?.closureHash, "load-time closure hash").toBe("string");
      expect(entry?.closureHash, "load-time closure hash shape").toMatch(/^sha256:[0-9a-f]{64}$/);

      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (E) depth 3: the silence spans two levels ────────────────────────────

  it("(E) the great-grandchild's own entry escapes: both the child and the grandparent refuse", async () => {
    // The disposition is POSITIONAL, not depth-2-specific: the escape row's
    // two files are the entry owner and its immediate caller wherever the
    // entry sits, so the span the deep verdict must cover grows with the
    // chain. This cell is what forbids an implementation hard-coded to depth
    // two — the escape row stays off both the child's and the grandparent's
    // file (it is the relocation's row, and the relocation is one level),
    // while `theta/load/callee-has-errors` composes by induction and lands on
    // both.
    const workspace = plantWorkspace(
      {
        [GP_NAME]: GP_SOURCE,
        [CHILD_NAME]: CHILD_SOURCE,
        [GC_NAME]: namingSource("grandchild", `./${GGC_NAME}`, "g3"),
        [GGC_NAME]: namingSource("great-grandchild", RELATIVE_ESCAPE_SPEC, "far"),
      },
      { [OUT_NAME]: healthyLeafSource("escape target") },
    );
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      requireEntryOwnerEscaped(pass, workspace.path(GGC_NAME));

      expect(
        [...errorFilesOf(pass, INVOKE_PATH_ESCAPE_CODE)],
        "the escape row stays the entry owner's and its immediate caller's; the levels above " +
          `carry ${CALLEE_HAS_ERRORS_CODE} instead\n${describeNotes(pass.notes)}`,
      ).toEqual([workspace.path(GC_NAME), workspace.path(GGC_NAME)].sort());

      expectCallerRefusedWithCalleeHasErrors(pass, workspace.path(CHILD_NAME), CHILD_STEM);
      expectCallerRefusedWithCalleeHasErrors(pass, workspace.path(GP_NAME), GP_STEM);
      expect(
        [...errorFilesOf(pass, CALLEE_HAS_ERRORS_CODE)],
        `${CALLEE_HAS_ERRORS_CODE} composes to every caller above the immediate one\n` +
          describeNotes(pass.notes),
      ).toEqual([workspace.path(CHILD_NAME), workspace.path(GP_NAME)].sort());

      expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
      expect([...pass.registered]).not.toContain(GGC_STEM);
      expect([...pass.registered]).not.toContain(GC_STEM);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });
});
