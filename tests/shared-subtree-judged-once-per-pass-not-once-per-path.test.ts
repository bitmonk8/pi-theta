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

// Bug 0276 — the `callee-has-errors` depth walk bounds termination but not cost:
// a subtree named by two callers is judged once per simple path that reaches it,
// so a k-layer two-wide diamond ladder of legal, healthy, fully registering
// files costs on the order of 2^k judgements over 2k + 1 distinct files.
//
// THE CONDITION THESE CELLS WITNESS. `calleeFailsOwnStructuralChecks`
// (`src/extension/production-composition.ts`) takes its `visited` parameter by
// value and extends it per recursion step with `new Set([...visited,
// nestedAbsolute])`. That set is therefore exactly the ancestor chain of the
// current recursion stack: it grows on the way down and is discarded on the way
// back up, so the guard `if (visited.has(nestedAbsolute))` sees only that chain
// and a path reached again on a sibling branch is re-judged in full. Nothing
// records that a path has already been judged on a DIFFERENT branch. The pass
// parse cache (`parseViaPassCache`, `src/extension/pass-parse-cache.ts`)
// memoises the DOCUMENT and nothing else, so the four operations that surround
// the parse — the `fs.readBytes` probe, the `checkInvokePathAtLoad` containment
// `realpath`, `checkThetaImports` and `resolveCallableSet` — are paid once per
// path rather than once per file. Both entry points inherit it:
// `parseCalleeForTools` and `parseCalleeTheta`'s dispatch gate each seed the
// recursion with `new Set([absolute])` and pass no cross-branch state.
//
// SPEC ANCHORS.
//   - `docs/spec_topics/invocation.md` line 20 (§Static resolution): "The
//     recursion is bounded by a set of the resolved absolute paths already
//     visited on the current branch of the walk". That sentence states the
//     termination bound this report leaves intact, and states no bound on the
//     NUMBER of judgements per pass. The same paragraph does bound the parse —
//     "Each visited file is parsed once per pass" — which is why the measured
//     cost is the per-visit probe work rather than repeated parsing.
//   - `docs/reference/discovery-cli.md` line 270 — the mirror of the same
//     per-branch bound, with the same silence about cost.
//   - `docs/spec_topics/diagnostics/code-registry-load.md` —
//     `theta/load/callee-has-errors`, the row every refusal in the identity
//     cells below carries. No new code is asserted: bug 0276 §Fix constraint 5
//     rules out any new diagnostic, because the input is legal and every
//     verdict is already correct.
//   - `docs/spec_topics/diagnostics/code-registry-parse.md` —
//     `theta/parse/unterminated-template`, the drop route the broken member of
//     the identity cells carries in its own body.
//
// WHAT THIS FILE PINS. Seven cells over bug 0276 §Reproduction and its §Fix
// constraints 2, 4 and 9:
//   (COST) the k = 12 diamond ladder and the depth-12 linear chain measured in
//       ONE run: every ladder file registers, and the ladder's judgement count
//       is bounded both as a RATIO against the chain's and by one absolute
//       ceiling                                                  — RED at HEAD
//   (LINEAR) the depth-12 linear chain alone: 13 files, all register, no
//       diagnostic, judgement count linear in the file count      — green
//   (IDENT-BROKEN) the §Reproduction broken-leaf row at k = 6: the registered
//       set is exactly the one leaf that cannot reach the break   — green
//   (IDENT-CYC-HEALTHY) a shared file whose own subtree cycles back into a
//       shared ancestor, all members healthy: every member registers — green
//   (IDENT-CYC-BROKEN-D) the same shape with the cycle's closing member
//       carrying its own unterminated template                    — green
//   (IDENT-CYC-BROKEN-C) the same shape with the SHARED member carrying it
//                                                                 — green
//   (IDENT-TAINT-DIVERGES) one file whose verdict DIFFERS BY VALUE between the
//       branch that hit withhold (c) and the branch that did not — a
//       structurally failing member on the cycle, so the two verdicts are
//       `true` and `false` rather than two spellings of the same value
//                                                                 — green
// The four identity cells and (IDENT-BROKEN) are the outcome-preservation lock
// bug 0276 §Fix constraint 4 makes the acceptance criterion: they are green at
// HEAD and must stay green over a fix.
//
// WHICH ONE OF THEM CAN RED ON UNSOUND MEMOISATION. In (IDENT-CYC-HEALTHY),
// (IDENT-CYC-BROKEN-D), (IDENT-CYC-BROKEN-C) and (IDENT-BROKEN) every verdict a
// memo could confuse is value-uniform, or the differing member fails its own
// PARSE, which drops it before the cycle edge is ever traversed, so no frame is
// tainted: an implementation that memoised every verdict unconditionally passes
// all four. (IDENT-TAINT-DIVERGES) is the cell that discriminates, because its
// broken member fails STRUCTURALLY rather than at parse, which keeps the cycle
// edge live and makes the tainted verdict differ by value from the untainted
// one.
//
// THE COST OBSERVABLE IS A JUDGEMENT COUNT, NOT WALL CLOCK. Bug 0276 §Fix
// constraint 9 rules out a millisecond ceiling because it pins machine speed.
// An existing seam gives a deterministic count instead: the stub
// `resolvePiTool` inside `calleeFailsOwnStructuralChecks` resolves a bare
// `tools:` name that is not a host built-in through
// `resolveRegistryExtensionTool`, which reads `getAllTools?.()` — the
// `ExtensionAPI` method these cells' own host double owns. Every fixture below
// therefore carries one bare extension-tool entry per file that has a `tools:`
// list, so one `pi.getAllTools` call is one `resolveCallableSet` over one
// file's `tools:`: one judgement. No production seam, no override field and no
// `src/**` change is involved — the count is read off the host double the
// composition root is already driven with. The count is exact and
// machine-independent, so the cell reds and greens on structure alone.
//
// TIER: unit — offline, provider-free, deterministic. Host doubles only; no
// provider, no child process, no live model. The seam is one predicate inside
// the shipped composition root, and `composeExtensionInstance` over planted
// files reaches it directly, so neither an integration nor a live tier is
// needed. The harness (`makeHost` / `plantWorkspace` / `runLoadPass`) is
// modelled on, and duplicated from rather than shared with,
// `tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts`, bug
// 0271's landed witness, which this file neither reads from nor mutates.
//
// PATH SEPARATORS. Every path comparison below separator-normalises both sides
// first; the spelling divergence itself is bug 0268's subject and is neither
// touched nor asserted on.
//
// DIAG-4. Expected messages are read out of the shipped registry pages through
// `registryMessage`, never copied as prose, so registry drift reds here instead
// of silently comparing against a stale sentence.
//
// No silent skipping: a cell whose precondition is unmet (registry row absent,
// host double never driven, judgement counter never advanced) throws naming the
// precondition.

// ── Codes ───────────────────────────────────────────────────────────────────

const CALLEE_HAS_ERRORS_CODE = "theta/load/callee-has-errors";
const UNTERMINATED_TEMPLATE_CODE = "theta/parse/unterminated-template";

// ── Cost constants, derived from the measured pre-fix baseline ───────────────

/**
 * Ladder depth. Bug 0276 §Fix constraint 9 wants a k at which HEAD is SECONDS:
 * the pre-fix baseline for these fixtures on the measuring machine is 12.5 s at
 * k = 12 over 25 files, against 1.6 s at k = 9 and 0.16 s at k = 6, so k = 12
 * is the smallest measured k that is unambiguously seconds.
 */
const LADDER_K = 12;

/** Depth of the linear control, equal to the ladder's so depth is held fixed. */
const CHAIN_DEPTH = 12;

/**
 * Ceiling on (ladder judgements) / (chain judgements), the ratio §Fix
 * constraint 9 asks for. Measured pre-fix: 12 261 ladder judgements against 78
 * chain judgements, a ratio of 157. A per-pass verdict memo judges each of the
 * ladder's 25 distinct files once, which is 45 judgements against the chain's
 * own memoised 24, a ratio under 2; a memo scoped more narrowly than the pass —
 * one whose key made each top-level file's own walk its own scope — bounds the
 * ladder at 265 against the chain's unchanged 78, a ratio of 3.4. The ceiling
 * sits at 20: nearly 8× below the pre-fix ratio and nearly 6× above the
 * loosest post-fix regime, so neither direction is close. Both counts are exact
 * integers read off the same host double, so machine speed does not enter and
 * no CI-variance margin is needed.
 */
const LADDER_TO_CHAIN_JUDGEMENT_RATIO_CEILING = 20;

/**
 * Absolute ceiling on the ladder's judgement count, bounding cost in the number
 * of DISTINCT files reached rather than in simple paths (§Fix constraint 2).
 * Measured pre-fix: 12 261 over 25 files. Post-fix: 45 under a per-pass memo,
 * 265 under the narrowest useful memo scope. 1 500 is 8× below the pre-fix
 * figure and 5.6× above the loosest post-fix one.
 */
const LADDER_JUDGEMENT_CEILING = 1_500;

/**
 * Ceiling on the linear control's own judgement count. Measured pre-fix: 78
 * over 13 files, and a fix can only lower it (a per-pass memo takes it to 24),
 * so this cell is green at HEAD and stays green. It is the control the ladder's
 * ratio is taken against: depth 12 with no sharing, three orders of magnitude
 * cheaper in wall clock than depth 12 with two-wide sharing.
 */
const CHAIN_JUDGEMENT_CEILING = 200;

// ── Fixtures (bug 0276 §Reproduction, whose stems these keep) ────────────────

const STEM = "b0276scratch";

/**
 * The bare `tools:` entry that makes one judgement observable. It is not a host
 * built-in, so the stub `resolvePiTool` inside `calleeFailsOwnStructuralChecks`
 * falls through to `resolveRegistryExtensionTool` and reads the host double's
 * `getAllTools` snapshot. The snapshot publishes exactly this name, so the
 * entry RESOLVES and every fixture below stays legal and healthy — bug 0276's
 * subject is cost on input that fully registers.
 */
const PROBE_TOOL = `${STEM}probetool`;

/** One `tools:` line for the counted bare entry. */
const PROBE_ENTRY = `  - ${PROBE_TOOL}\n`;

/** A healthy leaf: subagent mode, clean body, no `tools:` — nothing to count. */
function leafSource(description: string): string {
  return `---\nmode: subagent\ndescription: ${description}\n---\nlet a = 1\n`;
}

/** The same leaf with an unterminated template in its own body: the drop route. */
function brokenLeafSource(description: string): string {
  return `---\nmode: subagent\ndescription: ${description}\n---\nlet t = \`unterminated\nlet a = 1\n`;
}

/**
 * The §Reproduction diamond ladder at parameter k: one prompt-mode top caller
 * naming both layer-1 files, layers 1 … k−1 holding two subagent files each
 * that both name BOTH files of the next layer, and layer k holding two healthy
 * leaves. 2k + 1 distinct files; 2^k simple paths from the top caller to a
 * layer-k leaf. `brokenLeafA` replaces the layer-k `a` leaf with a file whose
 * own body carries an unterminated template, which is the §Reproduction
 * broken-leaf row.
 */
function diamondLadder(k: number, brokenLeafA: boolean): Record<string, string> {
  const files: Record<string, string> = {};
  files[`${STEM}top.theta`] =
    `---\nmode: prompt\ntools:\n  - ./${STEM}l1a.theta as la\n` +
    `  - ./${STEM}l1b.theta as lb\n${PROBE_ENTRY}---\n@\`hi\`\n`;
  for (let layer = 1; layer < k; layer += 1) {
    for (const side of ["a", "b"]) {
      files[`${STEM}l${layer}${side}.theta`] =
        `---\nmode: subagent\ndescription: l${layer}${side}\ntools:\n` +
        `  - ./${STEM}l${layer + 1}a.theta as na\n` +
        `  - ./${STEM}l${layer + 1}b.theta as nb\n${PROBE_ENTRY}---\nlet a = 1\n`;
    }
  }
  for (const side of ["a", "b"]) {
    const description = `l${k}${side}`;
    files[`${STEM}l${k}${side}.theta`] =
      brokenLeafA && side === "a" ? brokenLeafSource(description) : leafSource(description);
  }
  return files;
}

/** Slash names of every file the ladder at `k` plants, sorted. */
function ladderStems(k: number): readonly string[] {
  const stems = [`${STEM}top`];
  for (let layer = 1; layer <= k; layer += 1) {
    stems.push(`${STEM}l${layer}a`, `${STEM}l${layer}b`);
  }
  return [...stems].sort();
}

/**
 * The §Reproduction linear control at depth d: each file names exactly one next
 * file, so depth is held equal to the ladder's and sharing is the only variable.
 * d + 1 distinct files; one simple path.
 */
function linearChain(depth: number): Record<string, string> {
  const files: Record<string, string> = {};
  files[`${STEM}ctop.theta`] =
    `---\nmode: prompt\ntools:\n  - ./${STEM}c1.theta as c1\n${PROBE_ENTRY}---\n@\`hi\`\n`;
  for (let step = 1; step < depth; step += 1) {
    files[`${STEM}c${step}.theta`] =
      `---\nmode: subagent\ndescription: c${step}\ntools:\n` +
      `  - ./${STEM}c${step + 1}.theta as cn\n${PROBE_ENTRY}---\nlet a = 1\n`;
  }
  files[`${STEM}c${depth}.theta`] = leafSource(`c${depth}`);
  return files;
}

/** Slash names of every file the linear chain at `depth` plants, sorted. */
function chainStems(depth: number): readonly string[] {
  const stems = [`${STEM}ctop`];
  for (let step = 1; step <= depth; step += 1) {
    stems.push(`${STEM}c${step}`);
  }
  return [...stems].sort();
}

const CYC_TOP_NAME = `${STEM}cyctop.theta`;
const CYC_A_NAME = `${STEM}cyca.theta`;
const CYC_B_NAME = `${STEM}cycb.theta`;
const CYC_C_NAME = `${STEM}cycc.theta`;
const CYC_D_NAME = `${STEM}cycd.theta`;
const CYC_TOP_STEM = `${STEM}cyctop`;
const CYC_A_STEM = `${STEM}cyca`;
const CYC_B_STEM = `${STEM}cycb`;
const CYC_C_STEM = `${STEM}cycc`;
const CYC_D_STEM = `${STEM}cycd`;

/**
 * A SHARED file whose subtree cycles back into a shared ancestor. The top names
 * A and B, A names C, B names C, C names D, and D closes the cycle back onto A.
 * C is reached on two branches, and where D's edge to A is traversed at all it
 * is a visited-set hit — withhold (c), the one branch-dependent input the
 * predicate has, and the reason bug 0276 §Fix route (a) memoises only an
 * UNTAINTED verdict. `broken` names the member whose own body carries an
 * unterminated template: `"d"` breaks the cycle's closing member, `"c"` breaks
 * the shared member itself. A parse break drops its own file before the walk
 * reads its `tools:`, so in the `"d"` variant the edge back to A is never
 * traversed at all; the healthy variant is the one where that edge is a
 * visited-set hit on both branches.
 */
function sharedFileInsideCycle(broken?: "c" | "d"): Record<string, string> {
  const body = (member: "c" | "d"): string =>
    broken === member ? "let t = `unterminated\nlet a = 1\n" : "let a = 1\n";
  return {
    [CYC_TOP_NAME]:
      `---\nmode: prompt\ntools:\n  - ./${CYC_A_NAME} as a\n` +
      `  - ./${CYC_B_NAME} as b\n---\n@\`hi\`\n`,
    [CYC_A_NAME]: `---\nmode: subagent\ndescription: cyca\ntools:\n  - ./${CYC_C_NAME} as c\n---\nlet a = 1\n`,
    [CYC_B_NAME]: `---\nmode: subagent\ndescription: cycb\ntools:\n  - ./${CYC_C_NAME} as c\n---\nlet a = 1\n`,
    [CYC_C_NAME]: `---\nmode: subagent\ndescription: cycc\ntools:\n  - ./${CYC_D_NAME} as d\n---\n${body("c")}`,
    [CYC_D_NAME]: `---\nmode: subagent\ndescription: cycd\ntools:\n  - ./${CYC_A_NAME} as a\n---\n${body("d")}`,
  };
}

const TAINT_A_NAME = `${STEM}tainta.theta`;
const TAINT_BROKEN_NAME = `${STEM}taintbroken.theta`;
const TAINT_X_NAME = `${STEM}taintx.theta`;
const TAINT_Z_NAME = `${STEM}taintz.theta`;

/**
 * The shape whose verdict for ONE file differs BY VALUE between the branch that
 * hit withhold (c) and the branch that did not — the single unsoundness class a
 * verdict memo can commit, and the only shape in this file that can red on it.
 * Z names A, A names X, and X names both A (closing the cycle) and a member
 * that fails A's and X's own structural checks by carrying an unterminated
 * template in its body.
 *
 * Judged from INSIDE X's own walk, A is healthy (`false`): A's only edge leads
 * back into X, X is already on that branch, so withhold (c) fires and the
 * broken member below X is never reached through A. Judged with X absent from
 * the branch — from Z's seed, and from X's own top-level judgement of its A
 * entry — A reaches X, X reaches the broken member, and A fails (`true`).
 * Both verdicts are tainted, so the fix memoises neither and recomputes each;
 * an implementation that wrote the memo regardless of taint serves whichever it
 * computed first for the other, which moves both the registered set and the
 * refusal-row count this cell pins.
 *
 * The break is STRUCTURAL at A and X (a `tools:` entry whose callee has errors)
 * rather than a parse failure of the file the cycle runs through, which is what
 * keeps the cycle edge live and the two verdicts different.
 */
function taintedVerdictDiverges(): Record<string, string> {
  return {
    [TAINT_Z_NAME]: `---\nmode: prompt\ntools:\n  - ./${TAINT_A_NAME} as a\n---\n@\`hi\`\n`,
    [TAINT_A_NAME]: `---\nmode: subagent\ndescription: tainta\ntools:\n  - ./${TAINT_X_NAME} as x\n---\nlet a = 1\n`,
    [TAINT_X_NAME]:
      `---\nmode: subagent\ndescription: taintx\ntools:\n  - ./${TAINT_A_NAME} as a\n` +
      `  - ./${TAINT_BROKEN_NAME} as broken\n---\nlet a = 1\n`,
    [TAINT_BROKEN_NAME]: brokenLeafSource("taintbroken"),
  };
}

// ── Registry oracle (DIAG-4) ────────────────────────────────────────────────

interface RegistryRow {
  code: string;
  severity: string;
  phase: string;
  message: string;
}

const REGISTRY = ["code-registry-parse.md", "code-registry-load.md"].flatMap(
  (page) =>
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
  /** How many times the composition root read the registry snapshot. */
  readonly snapshotReads: { count: number };
}

function makeHost(cwd: string): HostDouble {
  const notes: RecordedNote[] = [];
  const notified: Array<readonly [string, string]> = [];
  const snapshotReads = { count: 0 };
  // One frozen array, returned by reference on every read, so a store keyed on
  // the snapshot's IDENTITY sees one snapshot for the whole pass rather than a
  // fresh object per call. The counter is the cost observable; the identity is
  // what keeps the observable honest under a memo keyed that way.
  const snapshot: readonly unknown[] = Object.freeze([PROBE_TOOL]);
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
    getAllTools: (): readonly unknown[] => {
      snapshotReads.count += 1;
      return snapshot;
    },
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

  return { pi, ctx, notes, notified, snapshotReads };
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
 * (`.pi/theta/`), exactly as bug 0276 §Reproduction does. One workspace per
 * cell keeps every decision below attributable to that cell's file set, and the
 * `mkdtemp` directory is removed in the cell's own `finally`.
 */
function plantWorkspace(files: Readonly<Record<string, string>>): ComposeWorkspace {
  const cwd = mkdtempSync(join(tmpdir(), "theta-b0276-"));
  mkdirSync(join(cwd, ".pi", "theta"), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(cwd, ".pi", "theta", name), body, "utf8");
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
  /** Wall-clock milliseconds the whole pass took, reported beside the count. */
  readonly elapsedMs: number;
  /** Judgements: one registry-snapshot read per `resolveCallableSet` over a `tools:` list. */
  readonly judgements: number;
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
    judgements: host.snapshotReads.count,
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

/**
 * DISTINCT files at which the pass located an error-severity row of `code`,
 * sorted. De-duplicated because one caller draws one row per failing `tools:`
 * entry, so a caller naming two failing callees appears twice in the raw rows;
 * multiplicity is pinned separately by the row count.
 */
function errorFilesOf(pass: LoadPass, code: string): readonly string[] {
  return [
    ...new Set(
      allDiagnostics(pass.notes)
        .filter((d) => d.severity === "error" && d.code === code)
        .map((d) => normalisePath(d.file ?? "?")),
    ),
  ].sort();
}

/** Every error-severity row as `code @ file`, sorted and de-duplicated. */
function errorRows(pass: LoadPass): readonly string[] {
  return [
    ...new Set(
      allDiagnostics(pass.notes)
        .filter((d) => d.severity === "error")
        .map((d) => `${d.code} @ ${normalisePath(d.file ?? "?")}`),
    ),
  ].sort();
}

/** The host double must have been driven at all before any decision means anything. */
function requireDriven(pass: LoadPass): void {
  if (pass.notes.length === 0 && pass.registered.length === 0) {
    throw new Error(
      "harness: the composition root neither registered a theta nor put anything on the " +
        "theta-system-note channel — the bug-0276 fixture no longer reaches the load pass, " +
        "so nothing below is verified",
    );
  }
}

/**
 * The precondition the cost cells rest on: the judgement counter advanced. The
 * count is a registry-snapshot read per `resolveCallableSet` over a `tools:`
 * list, so a zero count means the bare probe-tool entry stopped reaching
 * `resolveRegistryExtensionTool` — a resolution change would leave every
 * ceiling below trivially satisfied while measuring nothing.
 */
function requireJudgementCounter(pass: LoadPass, label: string): void {
  if (pass.judgements === 0) {
    throw new Error(
      `harness: the ${label} pass read the registry snapshot zero times — the bare ` +
        `\`${PROBE_TOOL}\` \`tools:\` entry is this file's only judgement observable, so a ` +
        "zero count is a harness failure, never a skip. Registered: " +
        `${JSON.stringify([...pass.registered].sort())}`,
    );
  }
}

/**
 * Exactly `files` carry an error-severity `theta/load/callee-has-errors` row,
 * there are exactly `totalRows` such rows in the pass, and every one carries
 * the registry's Message. The row total pins multiplicity — one row per failing
 * `tools:` entry, so a caller naming two failing callees draws two — which the
 * de-duplicated file set alone would not.
 */
function expectRefusalRowsAt(pass: LoadPass, files: readonly string[], totalRows: number): void {
  expect(
    errorFilesOf(pass, CALLEE_HAS_ERRORS_CODE),
    `files carrying an error-severity ${CALLEE_HAS_ERRORS_CODE} row\n${describeNotes(pass.notes)}`,
  ).toEqual([...files].sort());
  const rows = allDiagnostics(pass.notes).filter(
    (d) => d.severity === "error" && d.code === CALLEE_HAS_ERRORS_CODE,
  );
  expect(
    rows.length,
    `error-severity ${CALLEE_HAS_ERRORS_CODE} rows in the pass — one per failing \`tools:\` ` +
      `entry\n${describeNotes(pass.notes)}`,
  ).toBe(totalRows);
  for (const row of rows) {
    expect(row.message, `${CALLEE_HAS_ERRORS_CODE} message`).toMatch(
      normativeMessagePattern(CALLEE_HAS_ERRORS_CODE),
    );
  }
}

describe("bug 0276 — a shared subtree is judged once per pass, not once per simple path", () => {
  // ── (COST) the diamond ladder against the depth-equal linear chain ────────

  it("(COST) the k=12 diamond ladder registers every file within a bounded multiple of the depth-12 chain's judgements", async () => {
    // Bug 0276 §Fix constraints 2 and 9. Both passes run in ONE test so the
    // ratio is taken between two measurements of the same process, and both
    // observables are exact integers, so the cell discriminates structure
    // rather than machine speed. Ladder and chain hold depth fixed at 12 and
    // vary only sharing: 25 files with two-wide sharing against 13 files with
    // none.
    const ladderWorkspace = plantWorkspace(diamondLadder(LADDER_K, false));
    let ladderPass: LoadPass;
    try {
      ladderPass = await runLoadPass(ladderWorkspace);
    } finally {
      ladderWorkspace.dispose();
    }
    const chainWorkspace = plantWorkspace(linearChain(CHAIN_DEPTH));
    let chainPass: LoadPass;
    try {
      chainPass = await runLoadPass(chainWorkspace);
    } finally {
      chainWorkspace.dispose();
    }

    requireDriven(ladderPass);
    requireDriven(chainPass);
    requireJudgementCounter(ladderPass, `k=${LADDER_K} ladder`);
    requireJudgementCounter(chainPass, `depth-${CHAIN_DEPTH} chain`);

    const measured =
      `ladder k=${LADDER_K}: ${ladderPass.judgements} judgements over ` +
      `${ladderStems(LADDER_K).length} files in ${ladderPass.elapsedMs} ms; ` +
      `chain depth=${CHAIN_DEPTH}: ${chainPass.judgements} judgements over ` +
      `${chainStems(CHAIN_DEPTH).length} files in ${chainPass.elapsedMs} ms; ` +
      `ratio ${(ladderPass.judgements / chainPass.judgements).toFixed(1)}`;

    // The input is legal and healthy: bug 0276 is about cost on a file set
    // that fully registers, so a cell that stopped registering everything
    // would be measuring some other defect.
    expect(
      [...ladderPass.registered].sort(),
      `every ladder file must register\n${describeNotes(ladderPass.notes)}`,
    ).toEqual(ladderStems(LADDER_K));
    expect(errorRows(ladderPass), "a healthy ladder must draw no diagnostic").toEqual([]);
    expect(ladderPass.notified).toEqual([]);
    expect(ladderPass.offChannel).toEqual([]);

    // Cost bounded in DISTINCT files reached, expressed as a ratio against a
    // control the sharing structure is the only difference from.
    expect(
      ladderPass.judgements / chainPass.judgements,
      `judgements per pass must be bounded in the number of DISTINCT files the walk ` +
        `reaches, not in the number of simple paths through the \`tools:\` graph — ` +
        `${measured}`,
    ).toBeLessThan(LADDER_TO_CHAIN_JUDGEMENT_RATIO_CEILING);
    expect(
      ladderPass.judgements,
      `absolute judgement ceiling for the k=${LADDER_K} ladder — ${measured}`,
    ).toBeLessThan(LADDER_JUDGEMENT_CEILING);
  }, 300_000);

  // ── (LINEAR) the control the sharing cliff is measured against ────────────

  it("(LINEAR) the depth-12 linear chain registers every file at a judgement count linear in the file count", async () => {
    // §Reproduction's linear control isolates the cause: depth 12 with no
    // sharing. This cell is green at HEAD and a fix can only lower its count,
    // so it fences a route that bought the ladder's cost by weakening the walk
    // — a chain whose members stopped registering, or drew a diagnostic, would
    // red here rather than pass quietly.
    const workspace = plantWorkspace(linearChain(CHAIN_DEPTH));
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      requireJudgementCounter(pass, `depth-${CHAIN_DEPTH} chain`);
      expect([...pass.registered].sort(), describeNotes(pass.notes)).toEqual(
        chainStems(CHAIN_DEPTH),
      );
      expect(errorRows(pass), "a healthy chain must draw no diagnostic").toEqual([]);
      expect(
        pass.judgements,
        `depth-${CHAIN_DEPTH} chain: ${pass.judgements} judgements over ` +
          `${chainStems(CHAIN_DEPTH).length} files in ${pass.elapsedMs} ms`,
      ).toBeLessThan(CHAIN_JUDGEMENT_CEILING);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  }, 120_000);

  // ── (IDENT-BROKEN) §Reproduction's broken-leaf row ───────────────────────

  it("(IDENT-BROKEN) the k=6 ladder with a broken layer-6 leaf registers exactly the sibling that cannot reach it", async () => {
    // Bug 0276 §Fix constraint 4, the acceptance criterion: the verdict for a
    // shared file is identical along every path that reaches it, and must stay
    // identical. Every file that can reach the broken leaf refuses — both of its
    // parents, all four grandparents, up to the top caller — and the one file
    // that cannot reach it registers. A verdict memo that served a verdict
    // computed under a visited-set hit would move exactly this set.
    const workspace = plantWorkspace(diamondLadder(6, true));
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      // The drop route: the broken leaf's own parse row, located at its own file.
      expect(
        errorFilesOf(pass, UNTERMINATED_TEMPLATE_CODE),
        `the broken leaf's own ${UNTERMINATED_TEMPLATE_CODE} row is this cell's drop route\n` +
          describeNotes(pass.notes),
      ).toEqual([workspace.path(`${STEM}l6a.theta`)]);

      expect([...pass.registered].sort(), describeNotes(pass.notes)).toEqual([`${STEM}l6b`]);
      // Every ancestor of the break, and no other file, carries the caller-located row.
      expectRefusalRowsAt(
        pass,
        [
          workspace.path(`${STEM}top.theta`),
          workspace.path(`${STEM}l1a.theta`),
          workspace.path(`${STEM}l1b.theta`),
          workspace.path(`${STEM}l2a.theta`),
          workspace.path(`${STEM}l2b.theta`),
          workspace.path(`${STEM}l3a.theta`),
          workspace.path(`${STEM}l3b.theta`),
          workspace.path(`${STEM}l4a.theta`),
          workspace.path(`${STEM}l4b.theta`),
          workspace.path(`${STEM}l5a.theta`),
          workspace.path(`${STEM}l5b.theta`),
        ],
        // 20 rows: nine files naming two failing callees draw two each (the top
        // caller and layers 1-4, both sides), and the two layer-5 files draw one
        // each because only their `a` child reaches the break.
        20,
      );
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  // ── (IDENT-CYC-*) a shared file whose subtree cycles into a shared ancestor ──

  it("(IDENT-CYC-HEALTHY) a shared file cycling back into a shared ancestor: every member registers", async () => {
    // The taint-soundness lock. C is shared by A and B, and D's `tools:` edge
    // back to A is a visited-set hit — withhold (c) — on both branches, so C's
    // verdict at HEAD is computed under the predicate's one branch-dependent
    // input. All members are healthy, the bound withholds rather than refuses,
    // and every member registers.
    const workspace = plantWorkspace(sharedFileInsideCycle());
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      expect([...pass.registered].sort(), describeNotes(pass.notes)).toEqual(
        [CYC_A_STEM, CYC_B_STEM, CYC_C_STEM, CYC_D_STEM, CYC_TOP_STEM].sort(),
      );
      expect(
        errorRows(pass),
        "a cycle of healthy members must draw no diagnostic — the bound withholds, it does " +
          "not refuse",
      ).toEqual([]);
      expect(pass.notified).toEqual([]);
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  it("(IDENT-CYC-BROKEN-D) the cycle's closing member carries its own unterminated template: nothing registers", async () => {
    // The same shape with D broken. D is reachable from A, from B and from C, so
    // all three refuse and so does the top caller; D itself carries its own
    // parse row. D's own parse failure ends the walk at D, so D's `tools:` edge
    // back to A is never traversed and every verdict here is value-uniform:
    // this cell pins the outcome, and (IDENT-TAINT-DIVERGES) below is the cell
    // that discriminates a memo that ignores the taint.
    const workspace = plantWorkspace(sharedFileInsideCycle("d"));
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      expect(
        errorFilesOf(pass, UNTERMINATED_TEMPLATE_CODE),
        `the broken member's own ${UNTERMINATED_TEMPLATE_CODE} row is this cell's drop route\n` +
          describeNotes(pass.notes),
      ).toEqual([workspace.path(CYC_D_NAME)]);
      expect([...pass.registered].sort(), describeNotes(pass.notes)).toEqual([]);
      expectRefusalRowsAt(
        pass,
        [
          workspace.path(CYC_TOP_NAME),
          workspace.path(CYC_A_NAME),
          workspace.path(CYC_B_NAME),
          workspace.path(CYC_C_NAME),
        ],
        // 5 rows: the top caller names two failing callees, A, B and C name one each.
        5,
      );
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  it("(IDENT-CYC-BROKEN-C) the SHARED member carries its own unterminated template: nothing registers", async () => {
    // The same shape with C — the file reached on two branches — broken. Its own
    // parse row is located at its own file, its two parents refuse, and so does
    // D, which reaches C the long way round through A. The top caller refuses
    // over both parents.
    const workspace = plantWorkspace(sharedFileInsideCycle("c"));
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      expect(
        errorFilesOf(pass, UNTERMINATED_TEMPLATE_CODE),
        `the broken shared member's own ${UNTERMINATED_TEMPLATE_CODE} row is this cell's ` +
          `drop route\n${describeNotes(pass.notes)}`,
      ).toEqual([workspace.path(CYC_C_NAME)]);
      expect([...pass.registered].sort(), describeNotes(pass.notes)).toEqual([]);
      expectRefusalRowsAt(
        pass,
        [
          workspace.path(CYC_TOP_NAME),
          workspace.path(CYC_A_NAME),
          workspace.path(CYC_B_NAME),
          workspace.path(CYC_D_NAME),
        ],
        // 5 rows: the top caller names two failing callees, A, B and D name one each.
        5,
      );
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });

  it("(IDENT-TAINT-DIVERGES) a verdict computed under withhold (c) is never served to a branch that did not hit it", async () => {
    // The one cell in this file that can red on unsound memoisation: A's verdict
    // is `false` inside X's walk and `true` everywhere else (see
    // `taintedVerdictDiverges`). Every outcome below is the one the recomputing
    // predicate produces — X's own top-level judgement of A fails, so X draws a
    // row for BOTH of its entries, and Z, whose only entry is A, refuses too.
    // Serving the withhold-(c) verdict for A to either of them registers Z and
    // drops one of X's two rows.
    const workspace = plantWorkspace(taintedVerdictDiverges());
    try {
      const pass = await runLoadPass(workspace);
      requireDriven(pass);
      expect(
        errorFilesOf(pass, UNTERMINATED_TEMPLATE_CODE),
        `the structurally-failing member's own ${UNTERMINATED_TEMPLATE_CODE} row is this ` +
          `cell's drop route\n${describeNotes(pass.notes)}`,
      ).toEqual([workspace.path(TAINT_BROKEN_NAME)]);
      expect([...pass.registered].sort(), describeNotes(pass.notes)).toEqual([]);
      expectRefusalRowsAt(
        pass,
        [
          workspace.path(TAINT_A_NAME),
          workspace.path(TAINT_X_NAME),
          workspace.path(TAINT_Z_NAME),
        ],
        // 4 rows: X names two failing callees (A and the broken member), A and Z
        // name one each.
        4,
      );
      expect(pass.offChannel).toEqual([]);
    } finally {
      workspace.dispose();
    }
  });
});
