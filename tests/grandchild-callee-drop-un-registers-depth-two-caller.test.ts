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

// Bug 0271 — a prompt-mode GRANDPARENT whose `tools:` names a subagent CHILD
// whose own `tools:` names a GRANDCHILD carrying a drop route: the grandchild
// un-registers, the child un-registers with a caller-located
// `theta/load/callee-has-errors` row at its own file, and the grandparent
// registers a callable byte-identical to the healthy control with no diagnostic
// anywhere on its file.
//
// THE CONDITION THESE CELLS WITNESS. `resolveThetaToolsAtLoad`
// (`src/extension/production-composition.ts`, line 1644 in that file) pre-parses
// each distinct `.theta` callee through `parseCalleeForTools` (same file, line
// 1934), whose `hasErrors` (line 2032) is `hasLoadParseError(document.diagnostics)
// || failsPostParseChecks`. For a healthy child both limbs answer `false`: the
// child's own bytes parse clean, and `calleeFailsOwnStructuralChecks` (line 2147)
// judges the child by its own `.thetalib` imports and by re-running
// `resolveCallableSet` over the child's own `tools:` with a stub
// `resolveThetaCallee` (line 2287) that answers `{kind: "theta", mode:
// "subagent", callee: undefined}` for every `.theta` spec bug 0270's
// existence/readability probe recorded readable. The grandchild's bytes are
// therefore read for existence and discarded unparsed, so no condition derived
// from the grandchild's CONTENTS can reach the child's verdict, the V15f
// `callee-has-errors` loop (lines 1747-1759) has no subject at the grandparent,
// and `resolveCallableSet` mints the child callable that
// `attachLoadTimeClosureHashes` (line 1867) then stamps. The helper's own
// doc-comment enumerates this report as a withhold ("a grandchild that itself
// fails its own checks"), and `parseCalleeTheta`'s dispatch gate (its
// `calleeFailsOwnStructuralChecks` call at line 2590) applies the same predicate,
// so both sites share the one blind spot.
//
// SPEC ANCHORS.
//   - `docs/spec_topics/invocation.md` line 22 (§Static resolution, per-surface
//     severity): a callee that "fails its own structural checks is *not
//     statically resolvable*", and on the `tools:` surface "the callable cannot
//     be created, and the parent theta does not register". The child fails its
//     own structural checks in cells (A)-(C) — the same pass records that verdict
//     at the child's own file — so that sentence settles the grandparent's
//     disposition as REFUSAL AT LOAD.
//   - `docs/spec_topics/invocation.md` line 20 — the transitive walk. Its
//     current text narrows the walk to "existence and readability" of the
//     `.theta` paths a callee's own `tools:` names, which is the bound these
//     cells red against; bug 0271 §Fix constraint 7 requires that sentence and
//     its `docs/reference/discovery-cli.md` mirror to be reconciled with
//     whatever ships, so the reconciliation is the implementer's, not this
//     file's.
//   - `docs/spec_topics/diagnostics/code-registry-load.md` line 42 —
//     `theta/load/callee-has-errors`, `E` on the `tools:` surface, Trigger
//     "failed to parse, lower, or pass its own structural checks during the
//     parent's per-load-pass static-resolution walk", already ERR-6-classified
//     (`preEvalCauseOf`'s `tools-resolution` batch, `production-composition.ts`
//     line 316). Bug 0271 §Fix constraint 4 prefers this existing row over a
//     newly minted code, so no new registry row is asserted here.
//   - `docs/spec_topics/diagnostics/code-registry-load.md` line 44 —
//     `theta/load/unresolvable-thetalib-path`, the IMP-1 route cells (A) and (B)
//     drop the grandchild through.
//   - `docs/spec_topics/diagnostics/code-registry-load.md` line 36 —
//     `theta/load/invoke-path-escape`, the bug 0111 route the withhold cell
//     (ESC) pins as the one that must keep owning an ESCAPING entry alone.
//   - `docs/spec_topics/diagnostics/code-registry-parse.md` line 80 and line 30
//     — `theta/parse/unterminated-template` and `theta/parse/unsupported-feature`,
//     the plain-parse route cell (C) and cells (DEPTH3)/(CYC2) use.
//   - `docs/spec_topics/frontmatter/frontmatter-fields-a.md` line 74: `tools`
//     declares the callable set exposed "from both the model … and from theta
//     code", which is why a silently registered dead callable reaches a model
//     turn.
//
// WHAT THIS FILE PINS. Eight cells over bug 0271 §Reproduction plus the bounds
// its §Fix constraints 2 and 6 require:
//   (A) grandchild imports a `.thetalib` that does not exist    — RED at HEAD
//   (B) grandchild imports a `.thetalib` carrying lex + parse errors
//                                                               — RED at HEAD
//   (C) grandchild's own body carries an unterminated template   — RED at HEAD
//   (D) control — all three healthy                              — green
//   (CYC1) a two-file `tools:` cycle of healthy members reached from a
//       prompt-mode caller: the pass TERMINATES and all three register — green
//   (CYC2) the same cycle with one member carrying its own parse error: the pass
//       terminates and the caller refuses                        — RED at HEAD
//   (DEPTH3) the great-grandchild carries the drop route: both the grandparent
//       and the child refuse, so the rule composes by induction — RED at HEAD
//   (ESC) an ESCAPING grandchild keeps drawing exactly
//       `theta/load/invoke-path-escape` at the caller and no second row — green
//   (ESC2) the same shape with a BROKEN escaping grandchild: still exactly one
//       caller-located row, still `theta/load/invoke-path-escape` — this is the
//       cell that reds when the withhold (a) guard is removed  — green
//   (ESC3) one level deeper: the GRANDCHILD's own `tools:` entry escapes, so the
//       relocation reaches the child only and the grandparent keeps registering
//       — a recorded WITHHOLD, pinned so a later fix cannot flip it silently
// Cells (CYC1) and (CYC2) bound their own wall clock: bug 0271 §Fix constraint 2
// makes termination a hard constraint, and an unbounded walk over a cycle hangs
// rather than fails, so each measures elapsed time against a generous ceiling
// beside vitest's own per-test timeout. Cell (ESC) pins a WITHHOLD: an escaping
// grandchild's bytes must never be parsed (`checkNestedToolsContainment` owns
// that route and already un-registers), so a fix that walks deeper must not
// double-report there — the single-report property bug 0270's cells (D)/(D2)/(D3)
// established.
//
// TIER: unit — offline, provider-free, deterministic. Host doubles only; no
// provider, no child process, no live model. The seam is one predicate inside
// the shipped composition root, and `composeExtensionInstance` over planted
// files reaches it directly, so neither an integration nor a live tier is needed
// to witness the registration decisions. The harness (`makeHost` /
// `plantWorkspace` / `runLoadPass`) is modelled on, and duplicated from rather
// than shared with, `tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts`,
// bug 0270's landed witness, which this file neither reads from nor mutates.
//
// PATH SEPARATORS. Two walks spell the same file differently. Every path
// comparison below separator-normalises both sides first; the spelling
// divergence itself is bug 0268's subject and is neither touched nor asserted
// on.
//
// CLOSURE HASHES. Cell (D) pins the entry SHAPE and the `sha256:` form, never a
// literal digest: the digest covers the fixture's own bytes, so a literal would
// red on any fixture edit while witnessing nothing. Equality of the
// grandparent's hash across the defect rows and the control is correct per
// RFC-0005's closure scope (the child file plus its transitive `.thetalib`
// imports, not the grandchild) and is not asserted on in either direction.
//
// DIAG-4. Expected messages are read out of the shipped registry pages through
// `registryMessage`, never copied as prose, so registry drift reds here instead
// of silently comparing against a stale sentence.
//
// No silent skipping: a cell whose precondition is unmet (registry row absent,
// host double never driven, the child's own depth-1 drop route no longer firing)
// throws naming the precondition.

// ── Codes ───────────────────────────────────────────────────────────────────

const CALLEE_HAS_ERRORS_CODE = "theta/load/callee-has-errors";
const UNRESOLVABLE_THETALIB_CODE = "theta/load/unresolvable-thetalib-path";
const INVOKE_PATH_ESCAPE_CODE = "theta/load/invoke-path-escape";
const UNTERMINATED_TEMPLATE_CODE = "theta/parse/unterminated-template";

// ── Fixtures (bug 0271 §Reproduction) ───────────────────────────────────────

const GP_NAME = "b0271gp.theta";
const GP_STEM = "b0271gp";
const CHILD_NAME = "b0271child.theta";
const CHILD_STEM = "b0271child";
const GC_NAME = "b0271gc.theta";
const GC_STEM = "b0271gc";
const GGC_NAME = "b0271ggc.theta";
const GGC_STEM = "b0271ggc";
const LIB_NAME = "b0271lib.thetalib";

/** The one prompt-mode grandparent shape cells (A)-(D), (DEPTH3) and (ESC) use. */
const GP_SOURCE = `---\nmode: prompt\ntools:\n  - ./${CHILD_NAME} as child\n---\n@\`hi\`\n`;

/** The child: subagent mode, clean body, its own `tools:` naming the grandchild. */
const CHILD_SOURCE =
  `---\nmode: subagent\ndescription: b0271 child\ntools:\n  - ./${GC_NAME} as grand\n---\nlet a = 1\n`;

/** Cells (A)/(B): the grandchild imports `./b0271lib.thetalib` and uses its export. */
const GC_IMPORTING_SOURCE =
  "---\nmode: subagent\ndescription: b0271 grandchild\n---\n" +
  `import { f } from "./${LIB_NAME}"\nlet a = f()\n`;

/**
 * Cell (B)'s library: a lex-phase error (the backtick runs to end of file) and
 * the parse rows that follow it. Every top-level `fn` in a `.thetalib` is
 * implicitly exported (`docs/spec_topics/imports.md` line 27), so no `export`
 * statement is needed to make the import resolvable in principle.
 */
const BROKEN_LIB_SOURCE = "fn f() {\n  let t = `unterminated\n  return 1\n}\n";

/** Cell (C): the grandchild's OWN body carries an unterminated template. */
const GC_OWN_PARSE_ERROR_SOURCE =
  "---\nmode: subagent\ndescription: b0271 grandchild\n---\nlet t = `unterminated\nlet a = 1\n";

/** Cell (D): a healthy grandchild — subagent mode, clean body, no `tools:`. */
const GC_HEALTHY_SOURCE = "---\nmode: subagent\ndescription: b0271 grandchild\n---\nlet a = 1\n";

/** Cell (DEPTH3): the grandchild's own `tools:` names the great-grandchild. */
const GC_NAMES_GGC_SOURCE =
  `---\nmode: subagent\ndescription: b0271 grandchild\ntools:\n  - ./${GGC_NAME} as g3\n---\nlet a = 1\n`;

/** Cell (DEPTH3): the great-grandchild's own body carries an unterminated template. */
const GGC_OWN_PARSE_ERROR_SOURCE =
  "---\nmode: subagent\ndescription: b0271 great-grandchild\n---\nlet t = `unterminated\nlet a = 1\n";

/**
 * Cell (ESC): the child's own `tools:` names a grandchild that EXISTS but sits
 * outside every active discovery root — bug 0111's containment route, whose
 * verdict is relocated onto this caller's file by the escape loop in
 * `resolveThetaToolsAtLoad` (`src/extension/production-composition.ts`, lines
 * 1725-1739 in that file).
 */
const CHILD_ESCAPING_SOURCE =
  `---\nmode: subagent\ndescription: b0271 child\ntools:\n  - ../../outside/${GC_NAME} as grand\n---\nlet a = 1\n`;

/**
 * Cell (ESC3): the GRANDCHILD sits inside the roots and is readable, and its
 * OWN `tools:` entry escapes every active discovery root. One level deeper than
 * (ESC2), so the relocation `checkNestedToolsContainment` performs reaches the
 * entry owner's immediate caller — the child — and no further.
 */
const GC_ESCAPING_SOURCE =
  `---\nmode: subagent\ndescription: b0271 grandchild\ntools:\n  - ../../outside/${GGC_NAME} as far\n---\nlet a = 1\n`;

/** Cell (ESC3): the escape target — outside the roots, existing, readable, healthy. */
const GGC_HEALTHY_SOURCE =
  "---\nmode: subagent\ndescription: b0271 great-grandchild\n---\nlet a = 1\n";

/**
 * Cells (CYC1)/(CYC2): the two-file `tools:` cycle bug 0271 §Fix constraint 2
 * names as the termination case — `b0271a.theta` names `./b0271b.theta` and
 * `b0271b.theta` names `./b0271a.theta` — reached from a prompt-mode caller so
 * the walk enters the cycle from outside it.
 */
const CYC_CALLER_NAME = "b0271cyccaller.theta";
const CYC_CALLER_STEM = "b0271cyccaller";
const CYC_A_NAME = "b0271a.theta";
const CYC_A_STEM = "b0271a";
const CYC_B_NAME = "b0271b.theta";
const CYC_B_STEM = "b0271b";

const CYC_CALLER_SOURCE = `---\nmode: prompt\ntools:\n  - ./${CYC_A_NAME} as a\n---\n@\`hi\`\n`;
const CYC_A_SOURCE =
  `---\nmode: subagent\ndescription: b0271 a\ntools:\n  - ./${CYC_B_NAME} as b\n---\nlet a = 1\n`;
const CYC_B_SOURCE =
  `---\nmode: subagent\ndescription: b0271 b\ntools:\n  - ./${CYC_A_NAME} as a\n---\nlet a = 1\n`;
/** Cell (CYC2): the same cycle member, its OWN body carrying a parse error. */
const CYC_B_BROKEN_SOURCE =
  `---\nmode: subagent\ndescription: b0271 b\ntools:\n  - ./${CYC_A_NAME} as a\n---\nlet t = \`unterminated\nlet a = 1\n`;

/**
 * The wall-clock ceiling the cycle cells hold the whole load pass to. Measured
 * at single-digit milliseconds on this fixture set, so the ceiling is three
 * orders of magnitude of headroom: it discriminates termination from
 * non-termination, never machine speed.
 */
const CYCLE_ELAPSED_CEILING_MS = 20_000;

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
 * Plant the named fixture files on the conventional project source
 * (`.pi/theta/`), exactly as bug 0271 §Reproduction does. `outside` plants into
 * a sibling directory that is NOT a discovery root, which is how cell (ESC)
 * reaches bug 0111's containment route with a grandchild that genuinely exists.
 * One workspace per cell keeps every decision below attributable to that cell's
 * file set.
 */
function plantWorkspace(
  files: Readonly<Record<string, string>>,
  outside?: Readonly<Record<string, string>>,
): ComposeWorkspace {
  const cwd = mkdtempSync(join(tmpdir(), "theta-b0271-"));
  mkdirSync(join(cwd, ".pi", "theta"), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(cwd, ".pi", "theta", name), body, "utf8");
  }
  if (outside !== undefined) {
    mkdirSync(join(cwd, "outside"), { recursive: true });
    for (const [name, body] of Object.entries(outside)) {
      writeFileSync(join(cwd, "outside", name), body, "utf8");
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
  /** Wall-clock milliseconds the whole pass took, for the termination cells. */
  readonly elapsedMs: number;
}

/**
 * Drive the SHIPPED composition root over the planted workspace with an
 * UNDEGRADED `RendererGate`, so every note takes the transcript
 * (`pi.sendMessage`) arm the author reads.
 */
async function runLoadPass(workspace: ComposeWorkspace): Promise<LoadPass> {
  const host = makeHost(workspace.cwd);
  const started = Date.now();
  const wiring = await composeExtensionInstance(host.pi, host.ctx, undefined, new RendererGate());
  const elapsedMs = Date.now() - started;
  return {
    notes: host.notes.filter((n) => n.customType === SYSTEM_NOTE_CHANNEL),
    offChannel: host.notes.filter((n) => n.customType !== SYSTEM_NOTE_CHANNEL),
    notified: host.notified,
    registered: wiring.thetas.map((t) => t.slashName),
    thetas: wiring.thetas,
    elapsedMs,
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

/** Error-severity codes the pass located at `file`, sorted and de-duplicated. */
function errorCodesAt(pass: LoadPass, file: string): readonly string[] {
  return [
    ...new Set(
      allDiagnostics(pass.notes)
        .filter((d) => d.severity === "error" && normalisePath(d.file ?? "") === file)
        .map((d) => d.code),
    ),
  ].sort();
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
        "theta-system-note channel — the bug-0271 fixture no longer reaches the load pass, " +
        "so nothing below is verified",
    );
  }
}

/**
 * The precondition every offender cell rests on: the DEPTH-1 drop route fired
 * this pass — an error-severity `theta/load/callee-has-errors` row located at
 * `file`, which is bugs 0267/0270 working one level down. Bug 0271's whole claim
 * is about the level ABOVE that row, so its absence means the cell is measuring
 * an unrelated pass and throws naming itself rather than passing or redding on
 * the wrong subject.
 */
function requireDepthOneDropRoute(pass: LoadPass, file: string): void {
  const rows = allDiagnostics(pass.notes).filter(
    (d) =>
      d.code === CALLEE_HAS_ERRORS_CODE &&
      d.severity === "error" &&
      normalisePath(d.file ?? "") === file,
  );
  if (rows.length === 0) {
    throw new Error(
      `harness: no error-severity ${CALLEE_HAS_ERRORS_CODE} row is located at ${file} — the ` +
        "depth-1 refusal is the premise of bug 0271's depth-2 claim, so its absence is a " +
        `harness failure, never a skip. Notes:\n${describeNotes(pass.notes)}`,
    );
  }
}

/**
 * Bug 0271 §Fix constraint 1 on the route `invocation.md` line 22 settles: the
 * caller does not register, and EXACTLY ONE error-severity
 * `theta/load/callee-has-errors` row carrying the registry's Message is located
 * at the caller's own `tools:` site. One entry names one callee, so one row.
 */
function expectCallerRefused(pass: LoadPass, callerPath: string, callerStem: string): void {
  expect(
    pass.registered,
    "the caller must not register over a callee this same pass un-registers\n" +
      describeNotes(pass.notes),
  ).not.toContain(callerStem);

  const callerRows = allDiagnostics(pass.notes).filter(
    (d) =>
      d.code === CALLEE_HAS_ERRORS_CODE &&
      d.severity === "error" &&
      normalisePath(d.file ?? "") === callerPath,
  );
  expect(
    callerRows.length,
    `error-severity ${CALLEE_HAS_ERRORS_CODE} rows located at ${callerPath}: ` +
      `${callerRows.length}\n${describeNotes(pass.notes)}`,
  ).toBe(1);
  expect((callerRows[0] as Diagnostic).message, `${CALLEE_HAS_ERRORS_CODE} message`).toMatch(
    normativeMessagePattern(CALLEE_HAS_ERRORS_CODE),
  );
}

describe("bug 0271 — a grandchild that fails its own checks un-registers the grandparent two `tools:` levels up", () => {
  // ── (A) the grandchild's `.thetalib` import resolves to no file ───────────

  it("(A) grandchild imports a missing `.thetalib`: the grandparent does not register", async () => {
    const workspace = plantWorkspace({
      [GP_NAME]: GP_SOURCE,
      [CHILD_NAME]: CHILD_SOURCE,
      [GC_NAME]: GC_IMPORTING_SOURCE,
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      // The grandchild's own IMP-1 row, and the child's depth-1 refusal over it:
      // bugs 0267/0270 as landed, and the premise of everything below.
      expect(
        errorFilesOf(pass, UNRESOLVABLE_THETALIB_CODE),
        `the grandchild's own ${UNRESOLVABLE_THETALIB_CODE} row is this cell's drop route\n` +
          describeNotes(pass.notes),
      ).toEqual([workspace.path(GC_NAME)]);
      requireDepthOneDropRoute(pass, workspace.path(CHILD_NAME));

      // HEAD: `pass.registered` is `["b0271gp"]` and no row is located at the
      // grandparent's file at all — the stub `resolveThetaCallee` reads the
      // grandchild for existence only, so the child's refusal is invisible one
      // level up.
      expectCallerRefused(pass, workspace.path(GP_NAME), GP_STEM);
      // Non-regression: the depth-1 outcomes are correct at HEAD and stay.
      expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (B) the grandchild's `.thetalib` carries lex + parse errors ───────────

  it("(B) grandchild imports a `.thetalib` carrying lex and parse errors: the grandparent does not register", async () => {
    const workspace = plantWorkspace({
      [GP_NAME]: GP_SOURCE,
      [CHILD_NAME]: CHILD_SOURCE,
      [GC_NAME]: GC_IMPORTING_SOURCE,
      [LIB_NAME]: BROKEN_LIB_SOURCE,
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      // The library's own rows locate at the LIBRARY file, not the grandchild's:
      // the drop route is the import's contents, not its resolution.
      expect(
        errorFilesOf(pass, UNTERMINATED_TEMPLATE_CODE),
        `the library's own ${UNTERMINATED_TEMPLATE_CODE} row is this cell's drop route\n` +
          describeNotes(pass.notes),
      ).toEqual([workspace.path(LIB_NAME)]);
      requireDepthOneDropRoute(pass, workspace.path(CHILD_NAME));

      expectCallerRefused(pass, workspace.path(GP_NAME), GP_STEM);
      expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (C) the grandchild's own parse ───────────────────────────────────────

  it("(C) grandchild's own body carries an unterminated template: the grandparent does not register", async () => {
    // The plain-parse route, WIDER than bug 0267's four admitted routes: the
    // grandchild is dropped by `hasLoadParseError` on its own parse document,
    // the pre-0267 V15f input, and the grandparent is equally silent at HEAD.
    const workspace = plantWorkspace({
      [GP_NAME]: GP_SOURCE,
      [CHILD_NAME]: CHILD_SOURCE,
      [GC_NAME]: GC_OWN_PARSE_ERROR_SOURCE,
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      expect(
        errorFilesOf(pass, UNTERMINATED_TEMPLATE_CODE),
        `the grandchild's own ${UNTERMINATED_TEMPLATE_CODE} row is this cell's drop route\n` +
          describeNotes(pass.notes),
      ).toEqual([workspace.path(GC_NAME)]);
      requireDepthOneDropRoute(pass, workspace.path(CHILD_NAME));

      expectCallerRefused(pass, workspace.path(GP_NAME), GP_STEM);
      expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (D) the three-level control ──────────────────────────────────────────

  it("(D) control — grandparent, child and grandchild all healthy: all three register", async () => {
    const workspace = plantWorkspace({
      [GP_NAME]: GP_SOURCE,
      [CHILD_NAME]: CHILD_SOURCE,
      [GC_NAME]: GC_HEALTHY_SOURCE,
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

      // The frozen `tools:` snapshot the grandparent carries. Cells (A)-(C)'s
      // defect is that this shape is byte-identical there, so the shape is the
      // thing a fix must stop minting — the digest itself covers the child's
      // bytes and its `.thetalib` closure (RFC-0005) and is pinned only by form.
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
      expect(entry?.closureHash, "load-time closure hash shape").toMatch(
        /^sha256:[0-9a-f]{64}$/,
      );

      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (CYC1)/(CYC2) termination over a `tools:` cycle ──────────────────────

  it(
    "(CYC1) a healthy two-file `tools:` cycle terminates and every member registers",
    async () => {
      // Bug 0271 §Fix constraint 2: termination is a hard constraint. A walk that
      // follows `tools:` edges without a bound never leaves `b0271a` ↔ `b0271b`,
      // and non-termination presents as a hang rather than a failure — hence the
      // measured ceiling below beside vitest's own timeout. Both members are
      // otherwise healthy, so the bound withholds and the registrations stand.
      const workspace = plantWorkspace({
        [CYC_CALLER_NAME]: CYC_CALLER_SOURCE,
        [CYC_A_NAME]: CYC_A_SOURCE,
        [CYC_B_NAME]: CYC_B_SOURCE,
      });
      try {
        const pass = await runLoadPass(workspace);
        requireDriven(pass);
        expect(
          pass.elapsedMs,
          `the load pass over a \`tools:\` cycle must terminate: ${pass.elapsedMs} ms`,
        ).toBeLessThan(CYCLE_ELAPSED_CEILING_MS);

        expect([...pass.registered].sort(), describeNotes(pass.notes)).toEqual([
          CYC_A_STEM,
          CYC_B_STEM,
          CYC_CALLER_STEM,
        ]);
        expect(
          allDiagnostics(pass.notes).map(
            (d) => `${d.severity} ${d.code} @ ${normalisePath(d.file ?? "?")}`,
          ),
          "a cycle of healthy members must draw no diagnostic — the bound withholds, it does " +
            "not refuse",
        ).toEqual([]);
        expect(pass.notified).toEqual([]);
        expect(pass.offChannel).toEqual([]);
      } finally {
        workspace.dispose();
      }
    },
    60_000,
  );

  it(
    "(CYC2) a `tools:` cycle with one broken member terminates and the caller does not register",
    async () => {
      // The same cycle with `b0271b`'s own body carrying a parse error. The
      // broken member is judged by its own parse before any edge out of it is
      // followed, so the walk terminates on this shape without needing the
      // visited set at all; the ceiling is asserted anyway, because a fix that
      // orders the recursion the other way would hang here first.
      const workspace = plantWorkspace({
        [CYC_CALLER_NAME]: CYC_CALLER_SOURCE,
        [CYC_A_NAME]: CYC_A_SOURCE,
        [CYC_B_NAME]: CYC_B_BROKEN_SOURCE,
      });
      try {
        const pass = await runLoadPass(workspace);
        requireDriven(pass);
        expect(
          pass.elapsedMs,
          `the load pass over a broken-member \`tools:\` cycle must terminate: ${pass.elapsedMs} ms`,
        ).toBeLessThan(CYCLE_ELAPSED_CEILING_MS);

        expect(
          errorFilesOf(pass, UNTERMINATED_TEMPLATE_CODE),
          `the broken member's own ${UNTERMINATED_TEMPLATE_CODE} row is this cell's drop route\n` +
            describeNotes(pass.notes),
        ).toEqual([workspace.path(CYC_B_NAME)]);
        requireDepthOneDropRoute(pass, workspace.path(CYC_A_NAME));

        expectCallerRefused(pass, workspace.path(CYC_CALLER_NAME), CYC_CALLER_STEM);
        expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
        expect(pass.notified).toEqual([]);
        expect(pass.offChannel).toEqual([]);
      } finally {
        workspace.dispose();
      }
    },
    60_000,
  );

  // ── (DEPTH3) one level deeper ────────────────────────────────────────────

  it("(DEPTH3) the great-grandchild carries the drop route: both the child and the grandparent refuse", async () => {
    // Bug 0271 §"Why it matters", last bullet: depth is not bounded in practice,
    // so the rule must compose by induction rather than be hard-coded to depth
    // two. At HEAD the great-grandchild drops, the grandchild refuses at its own
    // file, and BOTH the child and the grandparent register silently.
    const workspace = plantWorkspace({
      [GP_NAME]: GP_SOURCE,
      [CHILD_NAME]: CHILD_SOURCE,
      [GC_NAME]: GC_NAMES_GGC_SOURCE,
      [GGC_NAME]: GGC_OWN_PARSE_ERROR_SOURCE,
    });
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      expect(
        errorFilesOf(pass, UNTERMINATED_TEMPLATE_CODE),
        `the great-grandchild's own ${UNTERMINATED_TEMPLATE_CODE} row is this cell's drop route\n` +
          describeNotes(pass.notes),
      ).toEqual([workspace.path(GGC_NAME)]);
      requireDepthOneDropRoute(pass, workspace.path(GC_NAME));

      expectCallerRefused(pass, workspace.path(CHILD_NAME), CHILD_STEM);
      expectCallerRefused(pass, workspace.path(GP_NAME), GP_STEM);
      expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
      expect(
        [...pass.registered],
        `the great-grandchild's own parse error un-registers it too\n${describeNotes(pass.notes)}`,
      ).not.toContain(GGC_STEM);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (ESC) the escaping grandchild stays a withhold ───────────────────────

  it("(ESC) an ESCAPING grandchild keeps drawing exactly invoke-path-escape at the caller and no second row", async () => {
    // Bug 0271 §Fix: an escaping grandchild's bytes must never be parsed, so no
    // rule derived from its contents can name it (`checkNestedToolsContainment`
    // owns the route and the caller already refuses through the relocated escape
    // row). Exactly one caller-located code, and no `callee-has-errors` beside
    // it — the single-report property bug 0270's cells (D)/(D2)/(D3) established.
    const workspace = plantWorkspace(
      { [GP_NAME]: GP_SOURCE, [CHILD_NAME]: CHILD_ESCAPING_SOURCE },
      { [GC_NAME]: GC_HEALTHY_SOURCE },
    );
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);

      expect(
        errorCodesAt(pass, workspace.path(CHILD_NAME)),
        `the child's own escaping entry draws exactly ${INVOKE_PATH_ESCAPE_CODE}\n` +
          describeNotes(pass.notes),
      ).toEqual([INVOKE_PATH_ESCAPE_CODE]);
      expect(
        errorCodesAt(pass, workspace.path(GP_NAME)),
        "the escaping-grandchild route must keep drawing exactly one grandparent-located " +
          `code, and must not co-fire ${CALLEE_HAS_ERRORS_CODE}\n${describeNotes(pass.notes)}`,
      ).toEqual([INVOKE_PATH_ESCAPE_CODE]);
      expect(
        errorFilesOf(pass, CALLEE_HAS_ERRORS_CODE),
        `a grandchild whose bytes are never parsed must draw no ${CALLEE_HAS_ERRORS_CODE} anywhere`,
      ).toEqual([]);
      expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (ESC2) the withhold that can red ─────────────────────────────────────

  it("(ESC2) a BROKEN ESCAPING grandchild still draws exactly one caller-located row, the escape row", async () => {
    // WHY THIS CELL EXISTS. Cell (ESC) above cannot discriminate the removal of
    // withhold (a)'s escape guard in `calleeFailsOwnStructuralChecks`: its
    // escaping grandchild is HEALTHY, so parsing its bytes changes no verdict
    // and the cell stays green either way. A withhold assertion that cannot red
    // is worthless (AGENTS.md §"Verify both directions when adding or
    // strengthening an assertion"), so this cell puts BROKEN bytes behind the
    // escaping path: with the guard in place the grandparent's file carries only
    // the relocated escape row; with the guard gone the recursion parses those
    // bytes and the same file draws `theta/load/callee-has-errors` beside it —
    // the double report withhold (a) exists to prevent.
    const workspace = plantWorkspace(
      { [GP_NAME]: GP_SOURCE, [CHILD_NAME]: CHILD_ESCAPING_SOURCE },
      { [GC_NAME]: GC_OWN_PARSE_ERROR_SOURCE },
    );
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      // The premise: bug 0111's escape route fired at all this pass. Without it
      // the fixture has stopped escaping and the single-report property below
      // has no subject.
      const escapeFiles = errorFilesOf(pass, INVOKE_PATH_ESCAPE_CODE);
      if (!escapeFiles.includes(workspace.path(GP_NAME))) {
        throw new Error(
          `harness: no error-severity ${INVOKE_PATH_ESCAPE_CODE} row is located at the ` +
            `grandparent's file ${workspace.path(GP_NAME)} — the relocated escape verdict is ` +
            "the premise of this cell's single-report assertion, so its absence is a harness " +
            `failure, never a skip. Escape rows at: ${escapeFiles.join(", ") || "(none)"}\n` +
            describeNotes(pass.notes),
        );
      }

      const grandparentRows = allDiagnostics(pass.notes).filter(
        (d) => d.severity === "error" && normalisePath(d.file ?? "") === workspace.path(GP_NAME),
      );
      expect(
        grandparentRows.map((d) => d.code),
        "one escaping entry is one condition, so the grandparent's file carries exactly one " +
          `error-severity row\n${describeNotes(pass.notes)}`,
      ).toEqual([INVOKE_PATH_ESCAPE_CODE]);
      expect(
        errorFilesOf(pass, CALLEE_HAS_ERRORS_CODE),
        `an escaping grandchild's bytes are never parsed, so ${CALLEE_HAS_ERRORS_CODE} is ` +
          `located nowhere however broken those bytes are\n${describeNotes(pass.notes)}`,
      ).toEqual([]);
      expect(
        errorFilesOf(pass, UNTERMINATED_TEMPLATE_CODE),
        "the escaping file is outside every discovery root, so its own parse rows belong to " +
          `no pass either\n${describeNotes(pass.notes)}`,
      ).toEqual([]);
      expect(pass.registered, describeNotes(pass.notes)).toEqual([]);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (ESC3) the recorded residual, one level deeper ───────────────────────

  it("(ESC3) WITHHOLD — a grandchild whose OWN `tools:` entry escapes leaves the grandparent registering", async () => {
    // This is a WITHHOLD, not a refusal. The escape condition is path-shaped:
    // it is judged from the resolved path without reading the entry's contents,
    // which is bug 0111's `checkNestedToolsContainment` surface ("one level
    // in") and not this predicate's. That relocation reaches the entry owner's
    // immediate caller only — here the child — so at this depth no row reaches
    // the grandparent at all. Bug 0271 §Fix constraint 8 gives this report no
    // authority over the bug 0248 cells that pin that helper's caller-side
    // outcomes, so the route is RECORDED here rather than admitted. The
    // outcome pinned below is a gap, not a correct disposition; pinning it
    // keeps a later fix from flipping it silently.
    const workspace = plantWorkspace(
      { [GP_NAME]: GP_SOURCE, [CHILD_NAME]: CHILD_SOURCE, [GC_NAME]: GC_ESCAPING_SOURCE },
      { [GGC_NAME]: GGC_HEALTHY_SOURCE },
    );
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      // The premise: the grandchild's own entry escaped at all.
      const escapeFiles = errorFilesOf(pass, INVOKE_PATH_ESCAPE_CODE);
      if (!escapeFiles.includes(workspace.path(GC_NAME))) {
        throw new Error(
          `harness: no error-severity ${INVOKE_PATH_ESCAPE_CODE} row is located at the ` +
            `grandchild's file ${workspace.path(GC_NAME)} — the escaping entry is this cell's ` +
            `whole subject, so its absence is a harness failure, never a skip. Escape rows ` +
            `at: ${escapeFiles.join(", ") || "(none)"}\n${describeNotes(pass.notes)}`,
        );
      }

      expect(
        [...escapeFiles].sort(),
        "the escape verdict reaches the entry's own file and its immediate caller, and stops " +
          `there\n${describeNotes(pass.notes)}`,
      ).toEqual([workspace.path(CHILD_NAME), workspace.path(GC_NAME)].sort());
      expect(
        allDiagnostics(pass.notes)
          .filter((d) => normalisePath(d.file ?? "") === workspace.path(GP_NAME))
          .map((d) => `${d.severity} ${d.code}`),
        `the recorded gap: no row of any severity reaches the grandparent's file\n${describeNotes(pass.notes)}`,
      ).toEqual([]);
      expect(
        pass.registered,
        `the grandparent registers over a child this same pass un-registers\n${describeNotes(pass.notes)}`,
      ).toEqual([GP_STEM]);
      expect([...pass.registered]).not.toContain(CHILD_STEM);
      expect([...pass.registered]).not.toContain(GC_STEM);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });
});
